import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient, type CaptureSessionResponse } from '../api/client';
import { guideCropRect, outputSize } from '../app/captureCrop';
import { GuidedReceiptCapture } from './GuidedReceiptCapture';

const { saveResumeTokenMock, saveTrackingTokenMock } = vi.hoisted(() => ({
  saveResumeTokenMock: vi.fn(),
  saveTrackingTokenMock: vi.fn(),
}));

vi.mock('../app/receiptResumeStore', () => ({ saveReceiptResumeToken: saveResumeTokenMock }));
vi.mock('../app/reportTrackingStore', () => ({ saveReportTrackingToken: saveTrackingTokenMock }));
vi.mock('../app/receiptNotifications', () => ({
  currentReceiptNotificationAvailability: () => 'available',
  enableReceiptNotifications: vi.fn(),
}));

// The quality verdict is mocked so the advisory can be driven directly; the scoring itself is
// covered by src/app/frameQuality.test.ts against the same predicate the backend uses.
const { evaluateCanvasMock } = vi.hoisted(() => ({ evaluateCanvasMock: vi.fn() }));
vi.mock('../app/frameQuality', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../app/frameQuality')>()),
  evaluateCanvas: evaluateCanvasMock,
}));

const readable = { score: 14, acceptable: true, brightness: 128, edgeDetail: 14 };
const tooDark = { score: 0, acceptable: false, brightness: 9, edgeDetail: 1 };
const tooBright = { score: 0, acceptable: false, brightness: 252, edgeDetail: 11 };

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
    evaluateCanvasMock.mockReset().mockReturnValue(readable);
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

  const renderCapture = () => render(<GuidedReceiptCapture
    session={session}
    storeName="Receipt Test Mart"
    submissionUuid="sub-advisory"
    onCancel={vi.fn()}
    onDraftCreated={vi.fn()}
  />);

  it('warns that a photo is too dark without blocking the upload, and clears it on retake', async () => {
    evaluateCanvasMock.mockReturnValue(tooDark);
    const user = userEvent.setup();
    renderCapture();

    await user.click(await screen.findByRole('button', { name: 'Capture receipt' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/too dark to read/i);
    // Advisory only: the check measures brightness and detail, not whether a receipt is present,
    // so a false positive must never prevent an upload.
    expect(screen.getByRole('button', { name: 'Upload receipt photo' })).toBeEnabled();
    // The amber ring on the camera roll is the at-a-glance signal. Asserting the ring rather than
    // the flag text matters: the text also lives in the closed sheet, where a text query would
    // still find it and pass for the wrong reason.
    expect(screen.getByRole('button', { name: 'Captured sections (1)' })).toHaveClass('receipt-capture-roll--flagged');

    evaluateCanvasMock.mockReturnValue(readable);
    await user.click(screen.getByRole('button', { name: 'Captured sections (1)' }));
    await user.click(await screen.findByRole('button', { name: 'Retake section 1' }));
    await user.click(screen.getByRole('button', { name: 'Capture replacement for section 1' }));

    // Derived from the frames, so replacing the bad photo removes the advisory with it.
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Captured sections (1)' })).not.toHaveClass('receipt-capture-roll--flagged');
  });

  it('deletes a single section, and closes the sheet once the last one is gone', async () => {
    const user = userEvent.setup();
    renderCapture();

    await user.click(await screen.findByRole('button', { name: 'Capture receipt' }));
    await user.click(await screen.findByRole('button', { name: 'Add receipt section' }));
    await user.click(await screen.findByRole('button', { name: 'Captured sections (2)' }));
    await user.click(await screen.findByRole('button', { name: 'Delete section 1' }));

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:receipt-1');
    expect(screen.getByText('1 of 12 sections captured')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Captured sections (1)' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete section 1' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Delete section 1' })).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Captured sections/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Capture receipt' })).toBeInTheDocument();
  });

  it('names overexposure rather than calling a washed-out photo dark', async () => {
    evaluateCanvasMock.mockReturnValue(tooBright);
    const user = userEvent.setup();
    renderCapture();

    await user.click(await screen.findByRole('button', { name: 'Capture receipt' }));

    const advisory = await screen.findByRole('status');
    expect(advisory).toHaveTextContent(/too bright to read/i);
    expect(advisory).not.toHaveTextContent(/too dark/i);
    expect(screen.getByRole('button', { name: 'Captured sections (1)' })).toHaveClass('receipt-capture-roll--flagged');
  });

  // Boxes measured from the running app at a 390x844 viewport; captureCrop.test.ts uses the same
  // numbers. jsdom performs no layout, so without these stubs getBoundingClientRect returns zeros,
  // guideCropRect takes its "not measurable yet" fallback, and the crop is never really exercised.
  const rect = (left: number, top: number, width: number, height: number) => ({
    left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}),
  }) as DOMRect;

  const captureWithGuide = async (guide: DOMRect) => {
    const video = rect(0, 0, 390, 844);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this instanceof HTMLVideoElement) return video;
      if (this.classList.contains('receipt-scan-guide')) return guide;
      return rect(0, 0, 0, 0);
    });
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    const user = userEvent.setup();
    renderCapture();
    await user.click(await screen.findByRole('button', { name: 'Capture receipt' }));
    // Read rather than assume: jsdom reports object-fit as `contain` where a real browser reports
    // the stylesheet's `cover`, which would silently change the expected crop. The cover maths is
    // pinned explicitly in captureCrop.test.ts; what matters here is the wiring.
    const objectFit = window.getComputedStyle(screen.getByLabelText('Live receipt camera')).objectFit;
    return { drawImage, video, objectFit };
  };

  // The only coverage tying the rendered guide to the pixels that actually get saved — i.e. that
  // the frame on screen is the crop region and not decoration.
  it('saves the pixels the guide frames rather than the whole sensor', async () => {
    const guide = rect(16, 88, 358, 646);
    const { drawImage, video, objectFit } = await captureWithGuide(guide);

    const expected = guideCropRect({
      frame: { width: 1080, height: 1920 },
      videoRect: video,
      guideRect: guide,
      objectFit,
    });
    const size = outputSize(expected, 2000);

    expect(drawImage).toHaveBeenCalledWith(
      expect.anything(),
      expected.sx, expected.sy, expected.sw, expected.sh,
      0, 0, size.width, size.height,
    );
    // A genuine crop, not the whole frame arriving via the fallback.
    expect(expected.sw).toBeLessThan(1080);
    expect(expected.sh).toBeLessThan(1920);
  });

  it('follows the guide when it is off centre', async () => {
    const { drawImage, video, objectFit } = await captureWithGuide(rect(120, 88, 358, 646));
    const sourceX = drawImage.mock.calls[0][1] as number;

    const centred = guideCropRect({
      frame: { width: 1080, height: 1920 },
      videoRect: video,
      guideRect: rect(16, 88, 358, 646),
      objectFit,
    });

    // Moving the guide right must move the sampled region right too; a mapping that ignored the
    // guide's position would return the same sx for both.
    expect(sourceX).toBeGreaterThan(centred.sx);
  });

  it('opens a captured photo full size from the sheet', async () => {
    // jsdom has no native dialog top layer.
    if (!HTMLDialogElement.prototype.showModal) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.open = true; } });
    if (!HTMLDialogElement.prototype.close) Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.open = false; } });
    vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) { this.open = true; });
    vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) { this.open = false; });

    const user = userEvent.setup();
    renderCapture();

    await user.click(await screen.findByRole('button', { name: 'Capture receipt' }));
    await user.click(screen.getByRole('button', { name: 'Captured sections (1)' }));
    await user.click(await screen.findByRole('button', { name: 'View section 1 full size' }));

    // Being able to look at what was actually saved is the point: it is how a customer checks the
    // crop matched the frame without waiting for the receipt to reach review.
    expect(await screen.findByRole('img', { name: 'Full receipt section 1' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close photo' }));
    await waitFor(() => expect(screen.queryByRole('img', { name: 'Full receipt section 1' })).not.toBeInTheDocument());
  });

  it('gives a completed recapture a way out of the success screen', async () => {
    const onCheckStatus = vi.fn();
    vi.spyOn(apiClient, 'post').mockImplementation(async (url) => {
      if (String(url).includes('/assets')) return { data: { success: true } };
      if (String(url).includes('/recapture')) return { data: { success: true, data: { status: 'Processing receipt' } } };
      throw new Error(`Unexpected POST ${url}`);
    });
    const user = userEvent.setup();
    render(<GuidedReceiptCapture
      session={{ ...session, capture_action: 'replace', upload_sequence: 0 }}
      storeName="Receipt Test Mart"
      submissionUuid="sub-recapture"
      recapture={{ reference: 'REP-RECAP', resumeToken: 'rsm_device' }}
      onCancel={vi.fn()}
      onDraftCreated={vi.fn()}
      onCheckStatus={onCheckStatus}
    />);

    await user.click(await screen.findByRole('button', { name: 'Capture receipt' }));
    await user.click(screen.getByRole('button', { name: 'Upload receipt photo' }));

    expect(await screen.findByText('Receipt uploaded')).toBeInTheDocument();
    // A recapture is given no onGoHome, so without this control the screen has no exit at all.
    const checkStatus = screen.getByRole('button', { name: 'Check status' });
    await user.click(checkStatus);
    expect(onCheckStatus).toHaveBeenCalledWith('REP-RECAP');
  });

  it('previews, retakes, and uploads one original receipt image without video', async () => {
    const onDraftCreated = vi.fn();
    const onGoHome = vi.fn();
    const onCheckStatus = vi.fn();
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
    render(<GuidedReceiptCapture
      session={session}
      storeName="Receipt Test Mart"
      submissionUuid="sub-guided"
      vapidPublicKey="test_vapid"
      onCancel={vi.fn()}
      onDraftCreated={onDraftCreated}
      onGoHome={onGoHome}
      onCheckStatus={onCheckStatus}
    />);

    await user.click(await screen.findByRole('button', { name: 'Capture receipt' }));

    // The roll shows the count; the photos themselves live in the sheet it opens.
    await user.click(await screen.findByRole('button', { name: 'Captured sections (1)' }));
    expect(await screen.findByRole('img', { name: 'Receipt section 1' })).toBeInTheDocument();
    expect(screen.getByText('1 of 12 sections captured')).toBeInTheDocument();
    // Retaking dismisses the sheet so the shutter can show its replacement label straight away.
    await user.click(screen.getByRole('button', { name: 'Retake section 1' }));
    await user.click(await screen.findByRole('button', { name: 'Capture replacement for section 1' }));

    // Still exactly one photo: the replacement replaced it rather than adding. The tray thumbnail
    // is decorative, so the sheet row is the only node carrying this name.
    await user.click(screen.getByRole('button', { name: 'Captured sections (1)' }));
    expect(screen.getAllByRole('img', { name: 'Receipt section 1' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Close captured sections' }));

    await user.click(screen.getByRole('button', { name: 'Upload receipt photo' }));

    expect(await screen.findByText('Receipt uploaded')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check status' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Notify when ready/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Notify me when ready/i })).not.toBeInTheDocument();

    const goHomeBtn = screen.getByRole('button', { name: 'Go Home' });
    expect(goHomeBtn).toBeInTheDocument();
    await user.click(goHomeBtn);
    expect(onGoHome).toHaveBeenCalled();

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
