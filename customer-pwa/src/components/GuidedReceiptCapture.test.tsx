import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient, type CaptureSessionResponse } from '../api/client';
import { GuidedReceiptCapture } from './GuidedReceiptCapture';

const { saveResumeTokenMock, saveTrackingTokenMock } = vi.hoisted(() => ({
  saveResumeTokenMock: vi.fn(),
  saveTrackingTokenMock: vi.fn(),
}));

vi.mock('../app/receiptResumeStore', () => ({ saveReceiptResumeToken: saveResumeTokenMock }));
vi.mock('../app/reportTrackingStore', () => ({ saveReportTrackingToken: saveTrackingTokenMock }));

const session: CaptureSessionResponse = {
  capture_session_id: 42,
  session_uuid: 'capture-42',
  capture_token: 'ct_sec_capture',
  expires_at: '2026-08-16T02:00:00Z',
  store_id: 77,
  capture_mode: 'guided_photos_v1',
  max_file_size: 2 * 1024 * 1024,
  accepted_types: ['image/jpeg'],
  limits: { max_frame_bytes: 2 * 1024 * 1024, min_frames: 1, max_frames: 12 },
};

describe('GuidedReceiptCapture', () => {
  afterEach(() => vi.restoreAllMocks());

  beforeEach(() => {
    saveResumeTokenMock.mockReset().mockResolvedValue(undefined);
    saveTrackingTokenMock.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }) },
    });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 1080 });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 1920 });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      configurable: true,
      value: (callback: BlobCallback) => callback(new Blob(['receipt-image'], { type: 'image/jpeg' })),
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValueOnce('blob:receipt-1').mockReturnValueOnce('blob:receipt-2');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  it('previews, retakes, and uploads one original receipt image without video', async () => {
    const onDraftCreated = vi.fn();
    const postSpy = vi.spyOn(apiClient, 'post').mockImplementation(async (url, data) => {
      if (url === '/public/capture-sessions/42/assets') return { data: { success: true } };
      if (url === '/public/reports') {
        const payload = data as { tracking_token: string; resume_token: string };
        return { data: { success: true, data: {
          report_reference: 'REP-GUIDED', secret_tracking_token: payload.tracking_token,
          device_resume_token: payload.resume_token, status: 'Processing receipt', submitted_at: null,
        } } };
      }
      throw new Error(`Unexpected POST ${url}`);
    });
    const user = userEvent.setup();
    render(<GuidedReceiptCapture session={session} storeName="Receipt Test Mart" submissionUuid="sub-guided" onCancel={vi.fn()} onDraftCreated={onDraftCreated} />);

    await user.click(await screen.findByRole('button', { name: 'Capture receipt' }));
    expect(await screen.findByRole('img', { name: 'Receipt section 1' })).toBeInTheDocument();
    expect(screen.getByText('1 section captured · maximum 12')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retake section 1' }));
    await user.click(screen.getByRole('button', { name: 'Capture replacement for section 1' }));
    expect(screen.getAllByRole('img', { name: 'Receipt section 1' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Upload receipt photo' }));

    expect(await screen.findByText('Receipt uploaded')).toBeInTheDocument();
    const assetCall = postSpy.mock.calls.find(([url]) => url === '/public/capture-sessions/42/assets');
    expect(assetCall).toBeDefined();
    expect((assetCall![1] as FormData).get('kind')).toBe('source_frame');
    expect((assetCall![1] as FormData).get('sequence')).toBe('0');
    expect(postSpy.mock.calls.some(([url]) => String(url).includes('original_video'))).toBe(false);
    await waitFor(() => expect(onDraftCreated).toHaveBeenCalled());
  });

  it('uploads an individual replacement at the server-assigned sequence', async () => {
    const recaptureSession: CaptureSessionResponse = {
      ...session,
      capture_action: 'replace',
      upload_sequence: 1,
      carried_sequences: [0, 2],
    };
    const postSpy = vi.spyOn(apiClient, 'post').mockImplementation(async (url) => {
      if (url === '/public/capture-sessions/42/assets') return { data: { success: true } };
      if (url === '/public/reports/REP-EXISTING/recapture') {
        return { data: { success: true, data: { report_reference: 'REP-EXISTING', status: 'Processing receipt' } } };
      }
      throw new Error(`Unexpected POST ${url}`);
    });
    const user = userEvent.setup();
    render(<GuidedReceiptCapture
      session={recaptureSession}
      storeName="Receipt Test Mart"
      submissionUuid="recapture-REP-EXISTING"
      recapture={{ reference: 'REP-EXISTING', resumeToken: 'rsm_existing' }}
      onCancel={vi.fn()}
      onDraftCreated={vi.fn()}
    />);

    await user.click(await screen.findByRole('button', { name: 'Capture receipt' }));
    await user.click(screen.getByRole('button', { name: 'Upload receipt photo' }));
    expect(await screen.findByText('Receipt uploaded')).toBeInTheDocument();
    const assetCall = postSpy.mock.calls.find(([url]) => url === '/public/capture-sessions/42/assets');
    expect(assetCall).toBeDefined();
    expect((assetCall![1] as FormData).get('sequence')).toBe('1');
    expect(postSpy).toHaveBeenCalledWith(
      '/public/reports/REP-EXISTING/recapture',
      { capture_token: 'ct_sec_capture' },
      { headers: { 'X-Report-Resume-Token': 'rsm_existing' }, timeout: 30_000 },
    );
  });

  it('deletes an unfinished server capture before leaving the camera', async () => {
    const onCancel = vi.fn();
    const deleteSpy = vi.spyOn(apiClient, 'delete').mockResolvedValue({ data: { success: true } });
    const user = userEvent.setup();
    render(<GuidedReceiptCapture session={session} storeName="Receipt Test Mart" submissionUuid="sub-cancel" onCancel={onCancel} onDraftCreated={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: 'Cancel receipt capture' }));
    expect(deleteSpy).toHaveBeenCalledWith('/public/capture-sessions/42', { headers: { 'X-Capture-Token': 'ct_sec_capture' } });
    expect(onCancel).toHaveBeenCalled();
  });
});
