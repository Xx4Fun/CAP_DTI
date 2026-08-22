import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient, type CaptureSessionResponse } from '../api/client';
import { ContinuousReceiptCapture } from './ContinuousReceiptCapture';

const { saveResumeTokenMock, saveTrackingTokenMock } = vi.hoisted(() => ({
  saveResumeTokenMock: vi.fn(),
  saveTrackingTokenMock: vi.fn(),
}));

vi.mock('../app/receiptResumeStore', () => ({
  saveReceiptResumeToken: saveResumeTokenMock,
}));

vi.mock('../app/reportTrackingStore', () => ({
  saveReportTrackingToken: saveTrackingTokenMock,
}));

class FakeMediaRecorder {
  static isTypeSupported = vi.fn(() => true);
  state = 'inactive';
  mimeType = 'video/webm;codecs=vp9';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['receipt-video'], { type: 'video/webm' }) });
    this.onstop?.();
  }
}

const session: CaptureSessionResponse = {
  capture_session_id: 42,
  session_uuid: 'capture-42',
  capture_token: 'ct_sec_capture',
  expires_at: '2026-08-16T02:00:00Z',
  store_id: 77,
  capture_mode: 'continuous_video_v1',
  max_file_size: 25 * 1024 * 1024,
  accepted_types: ['video/webm', 'video/mp4'],
  limits: {
    max_duration_seconds: 30,
    max_video_bytes: 25 * 1024 * 1024,
    max_frame_bytes: 2 * 1024 * 1024,
    min_frames: 2,
    max_frames: 12,
  },
};

describe('ContinuousReceiptCapture', () => {
  afterEach(() => vi.restoreAllMocks());

  beforeEach(() => {
    saveResumeTokenMock.mockReset().mockResolvedValue(undefined);
    saveTrackingTokenMock.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: FakeMediaRecorder });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn() }],
          getVideoTracks: () => [],
        }),
      },
    });
  });

  it('shows exit guidance only after evidence upload draft creation and resume storage succeed', async () => {
    const onDraftCreated = vi.fn();
    const onCheckStatus = vi.fn();
    const onGoHome = vi.fn();
    let now = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const postSpy = vi.spyOn(apiClient, 'post').mockImplementation(async (url, data) => {
      if (url === '/public/capture-sessions/42/assets') {
        return { data: { success: true, data: { asset_id: 1 } } };
      }
      if (url === '/public/reports') {
        const payload = data as { tracking_token: string; resume_token: string };
        return {
          data: {
            success: true,
            data: {
              report_reference: 'REP-20260816-ASYNC',
              secret_tracking_token: payload.tracking_token,
              device_resume_token: payload.resume_token,
              status: 'Processing receipt',
              created_at: '2026-08-16T01:00:00Z',
              submitted_at: null,
            },
          },
        };
      }
      throw new Error(`Unexpected POST ${url}`);
    });

    const user = userEvent.setup();
    render(
      <ContinuousReceiptCapture
        session={session}
        storeName="Receipt Test Mart"
        submissionUuid="sub-continuous-1"
        vapidPublicKey=""
        onCancel={vi.fn()}
        onDraftCreated={onDraftCreated}
        onCheckStatus={onCheckStatus}
        onGoHome={onGoHome}
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'Start continuous scan' }));
    expect(screen.queryByText(/You can leave this page/i)).not.toBeInTheDocument();
    now = 4_000;
    await user.click(screen.getByRole('button', { name: 'Finish receipt scan' }));

    expect(await screen.findByText('Receipt uploaded')).toBeInTheDocument();
    expect(screen.getByText(/You can leave this page while we prepare your receipt/i)).toBeInTheDocument();
    expect(screen.getByText(/saved to this device/i)).toBeInTheDocument();
    const assetCalls = postSpy.mock.calls.filter(([url]) => url === '/public/capture-sessions/42/assets');
    expect(assetCalls).toHaveLength(1);
    expect((assetCalls[0][1] as FormData).get('kind')).toBe('original_video');
    expect(saveResumeTokenMock).toHaveBeenCalledWith('REP-20260816-ASYNC', expect.stringMatching(/^rsm_/));
    expect(saveTrackingTokenMock).toHaveBeenCalledWith('REP-20260816-ASYNC', expect.stringMatching(/^trk_/));
    await user.click(screen.getByRole('button', { name: 'Check status' }));
    expect(onCheckStatus).toHaveBeenCalledWith('REP-20260816-ASYNC');
    await user.click(screen.getByRole('button', { name: 'Go Home' }));
    expect(onGoHome).toHaveBeenCalled();
    await waitFor(() => expect(onDraftCreated).toHaveBeenCalled());
  });

  it('deletes an unfinished server capture before leaving the camera', async () => {
    const onCancel = vi.fn();
    const deleteSpy = vi.spyOn(apiClient, 'delete').mockResolvedValue({ data: { success: true } });
    render(
      <ContinuousReceiptCapture
        session={session}
        storeName="Receipt Test Mart"
        submissionUuid="sub-cancel"
        onCancel={onCancel}
        onDraftCreated={vi.fn()}
      />,
    );

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Cancel receipt capture' }));
    expect(deleteSpy).toHaveBeenCalledWith('/public/capture-sessions/42', {
      headers: { 'X-Capture-Token': 'ct_sec_capture' },
    });
    expect(onCancel).toHaveBeenCalled();
  });

  it('queues recaptured video under the existing report reference', async () => {
    let now = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const postSpy = vi.spyOn(apiClient, 'post').mockImplementation(async (url) => {
      if (url === '/public/capture-sessions/42/assets') return { data: { success: true } };
      if (url === '/public/reports/REP-EXISTING/recapture') {
        return { data: { success: true, data: { report_reference: 'REP-EXISTING', status: 'Processing receipt' } } };
      }
      throw new Error(`Unexpected POST ${url}`);
    });

    const user = userEvent.setup();
    render(<ContinuousReceiptCapture
      session={session}
      storeName="Receipt Test Mart"
      submissionUuid="recapture-REP-EXISTING"
      recapture={{ reference: 'REP-EXISTING', resumeToken: 'rsm_existing' }}
      onCancel={vi.fn()}
      onDraftCreated={vi.fn()}
    />);

    await user.click(await screen.findByRole('button', { name: 'Start continuous scan' }));
    now = 4_000;
    await user.click(screen.getByRole('button', { name: 'Finish receipt scan' }));
    expect(await screen.findByText('Receipt uploaded')).toBeInTheDocument();
    expect(postSpy).toHaveBeenCalledWith(
      '/public/reports/REP-EXISTING/recapture',
      { capture_token: 'ct_sec_capture' },
      { headers: { 'X-Report-Resume-Token': 'rsm_existing' }, timeout: 30_000 },
    );
  });
});
