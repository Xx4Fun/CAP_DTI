import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bell, Camera, CheckCircle2, LoaderCircle, RotateCcw, Zap, ZapOff } from 'lucide-react';
import { apiClient, type CaptureSessionResponse, type FormalReportResponse } from '../api/client';
import {
  buildReceiptReportPayload,
  clearPendingReceiptSubmissionCredentials,
  getOrCreateReceiptSubmissionCredentials,
} from '../app/receiptCapture';
import { enableReceiptNotifications, currentReceiptNotificationAvailability } from '../app/receiptNotifications';
import { saveReceiptResumeToken } from '../app/receiptResumeStore';
import { saveReportTrackingToken } from '../app/reportTrackingStore';
import { guideCropRect, outputSize } from '../app/captureCrop';
import { evaluateCanvas, qualityIssue, type FrameIssue } from '../app/frameQuality';
import { CapturedPhotosSheet } from './CapturedPhotosSheet';
import { ReceiptPhotoViewer } from './ReceiptPhotoViewer';

interface GuidedReceiptCaptureProps {
  session: CaptureSessionResponse;
  storeName: string;
  submissionUuid: string;
  vapidPublicKey?: string;
  onCancel: () => void;
  onDraftCreated: (report: FormalReportResponse) => void;
  onCheckStatus?: (reference: string) => void;
  onGoHome?: () => void;
  recapture?: { reference: string; resumeToken: string };
}

type CaptureState = 'requesting' | 'ready' | 'uploading' | 'uploaded' | 'error';
// `issue` records which quality term failed at capture time, or null when the frame is fine or
// could not be measured. Advisory only: a flagged frame still uploads, because the check measures
// brightness and detail, not whether a receipt is present.
type CapturedFrame = { blob: Blob; url: string; issue: FrameIssue | null };

// Guidance is per issue: telling someone whose photo is overexposed to retake it "bright" would
// contradict the very thing that was measured.
const ISSUE_TEXT: Record<FrameIssue, { flag: string; one: string; many: string; advice: string }> = {
  dark: {
    flag: 'Too dark', one: 'too dark to read', many: 'look too dark to read',
    advice: 'Move somewhere brighter.',
  },
  bright: {
    flag: 'Too bright', one: 'too bright to read', many: 'look washed out',
    advice: 'Move out of direct light or glare.',
  },
  flat: {
    flag: 'Hard to read', one: 'too blurry or flat to read', many: 'look blurry or flat',
    advice: 'Hold steady until the camera focuses.',
  },
};

const MIXED_ADVICE = 'Retake them in even light.';

// Browsers expose a continuous torch on the video track and no strobe, so "auto" is emulated: the
// light comes on for one shot when the framed area measures dark.
type FlashMode = 'off' | 'auto' | 'on';
const FLASH_MODES: FlashMode[] = ['off', 'auto', 'on'];
const FLASH_LABEL: Record<FlashMode, string> = { off: 'Off', auto: 'Auto', on: 'On' };

// Device calibration knobs: cameras differ in how they meter and how fast exposure settles, so
// tune these on real phones. Brightness is mean luma 0-255; the "too dark" advisory fires at 25,
// and the light should come on well before a photo is that far gone.
const AUTO_FLASH_BRIGHTNESS = 70;
const AUTO_FLASH_SETTLE_MS = 600;

const FlashIcon: React.FC<{ mode: FlashMode }> = ({ mode }) => {
  if (mode === 'off') return <ZapOff size={20} aria-hidden="true" />;
  if (mode === 'on') return <Zap size={20} color="#fbbf24" aria-hidden="true" />;
  return <span className="receipt-flash-auto" aria-hidden="true"><Zap size={20} /><b>A</b></span>;
};

export const GuidedReceiptCapture: React.FC<GuidedReceiptCaptureProps> = ({
  session,
  storeName,
  submissionUuid,
  vapidPublicKey = '',
  onCancel,
  onDraftCreated,
  onCheckStatus,
  onGoHome,
  recapture,
}) => {
  const [captureState, setCaptureState] = useState<CaptureState>('requesting');
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<FormalReportResponse | null>(null);
  const [resumeStored, setResumeStored] = useState(false);
  const [trackingStored, setTrackingStored] = useState(false);
  const [notificationState, setNotificationState] = useState<string>(() => currentReceiptNotificationAvailability());
  const [frames, setFrames] = useState<CapturedFrame[]>([]);
  const [retakeIndex, setRetakeIndex] = useState<number | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [viewer, setViewer] = useState<{ url: string; sequence: number } | null>(null);
  const galleryTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [recoveryCopied, setRecoveryCopied] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [flashMode, setFlashMode] = useState<FlashMode>('off');
  const [torchSupported, setTorchSupported] = useState(false);
  const [flashMenuOpen, setFlashMenuOpen] = useState(false);
  const flashRef = useRef<HTMLDivElement | null>(null);
  const capturingRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const guideRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameUrlsRef = useRef<string[]>([]);
  const credentialsRef = useRef(getOrCreateReceiptSubmissionCredentials(submissionUuid));
  const evidenceUploadedRef = useRef(false);
  const activeRef = useRef(true);
  const targetedRecapture = session.capture_action === 'replace' || session.capture_action === 'append';
  const maximumFrames = targetedRecapture ? 1 : Math.min(session.limits?.max_frames ?? 12, 12);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const openCamera = useCallback(async () => {
    stopCamera();
    setCaptureState('requesting');
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1080 }, height: { ideal: 1920 } },
        audio: false,
      });
      if (!activeRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const capabilities = stream.getVideoTracks?.()[0]?.getCapabilities?.() as
        | (MediaTrackCapabilities & { torch?: boolean })
        | undefined;
      setTorchSupported(Boolean(capabilities?.torch));
      // A reopened camera is a fresh track with its light off, so the control must say so.
      setFlashMode('off');
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCaptureState('ready');
    } catch {
      setError('Camera access is unavailable or permission was denied. No receipt was captured.');
      setCaptureState('error');
    }
  }, [stopCamera]);

  useEffect(() => {
    activeRef.current = true;
    const frameUrls = frameUrlsRef.current;
    void openCamera();
    return () => {
      activeRef.current = false;
      stopCamera();
      frameUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [openCamera, stopCamera]);

  // This is a fixed full-screen layer, so the page underneath must not scroll behind it.
  // ShelfScanner does the same for its camera; this screen was missing it.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  useEffect(() => {
    if (!flashMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!flashRef.current?.contains(event.target as Node)) setFlashMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFlashMenuOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [flashMenuOpen]);

  const setTorch = async (on: boolean): Promise<boolean> => {
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track) return false;
    try {
      await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
      return true;
    } catch {
      return false;
    }
  };

  const selectFlashMode = async (mode: FlashMode) => {
    setFlashMenuOpen(false);
    if (await setTorch(mode === 'on')) {
      setFlashMode(mode);
      setError('');
    } else {
      setError('The flashlight could not be changed on this device.');
    }
  };

  const captureFrame = useCallback(async (): Promise<{ blob: Blob; issue: FrameIssue | null; brightness: number | null } | null> => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) return null;
    // Save what the customer framed inside the guide, not the whole sensor image: the preview is `object-fit: cover`,
    // so an uncropped photo also contains a wide margin the customer never saw, which leaves the receipt small.
    const guide = guideRef.current;
    const crop = guideCropRect({
      frame: { width: video.videoWidth, height: video.videoHeight },
      videoRect: video.getBoundingClientRect(),
      guideRect: guide ? guide.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 },
      objectFit: typeof window !== 'undefined' ? window.getComputedStyle(video).objectFit : 'cover',
    });
    const output = outputSize(crop, 2000);
    canvas.width = output.width;
    canvas.height = output.height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
    // Score the drawn crop once, before encoding: the ladder below re-encodes but never repaints.
    // No verdict means the measurement could not be taken, which is treated as fine rather than
    // warning about something that was never checked.
    const quality = evaluateCanvas(canvas);
    const issue = quality ? qualityIssue(quality) : null;
    const brightness = quality?.brightness ?? null;
    const maximumBytes = session.limits?.max_frame_bytes ?? 2 * 1024 * 1024;
    let result: Blob | null = null;
    for (const encodeQuality of [0.86, 0.72, 0.58]) {
      result = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', encodeQuality));
      if (!result || result.size <= maximumBytes) return result ? { blob: result, issue, brightness } : null;
    }
    return result ? { blob: result, issue, brightness } : null;
  }, [session.limits?.max_frame_bytes]);

  const captureWithFlash = async () => {
    let captured = await captureFrame();
    // ponytail: the first pass encodes a JPEG that is thrown away when the light fires. Split the
    // measurement from the encode if shutter lag is ever noticed.
    if (
      captured && flashMode === 'auto' && torchSupported
      && captured.brightness !== null && captured.brightness < AUTO_FLASH_BRIGHTNESS
      && await setTorch(true)
    ) {
      await new Promise((resolve) => setTimeout(resolve, AUTO_FLASH_SETTLE_MS));
      captured = await captureFrame();
      await setTorch(false);
    }
    return captured;
  };

  const capture = async () => {
    // The auto-flash wait is long enough for a second tap, which would start an overlapping capture.
    if (capturingRef.current) return;
    capturingRef.current = true;
    let captured: Awaited<ReturnType<typeof captureFrame>>;
    try {
      captured = await captureWithFlash();
    } finally {
      capturingRef.current = false;
    }
    if (!captured) {
      setError('Hold the receipt in the guide and wait for the camera to focus.');
      return;
    }
    const { blob, issue } = captured;
    if (blob.size > (session.limits?.max_frame_bytes ?? 2 * 1024 * 1024)) {
      setError('This photo is too large to upload. Keep the receipt inside the guide with less surrounding background and try again.');
      return;
    }
    const url = URL.createObjectURL(blob);
    frameUrlsRef.current.push(url);
    setFrames((current) => {
      if (retakeIndex === null && current.length < maximumFrames) return [...current, { blob, url, issue }];
      const index = retakeIndex ?? 0;
      const previous = current[index];
      if (previous) URL.revokeObjectURL(previous.url);
      return current.map((frame, frameIndex) => frameIndex === index ? { blob, url, issue } : frame);
    });
    setRetakeIndex(null);
    setError('');
  };

  const uploadAsset = async (sequence: number, blob: Blob) => {
    const formData = new FormData();
    formData.append('kind', 'source_frame');
    formData.append('sequence', String(sequence));
    formData.append('asset', blob, `receipt-section-${sequence + 1}.jpg`);
    await apiClient.post(`/public/capture-sessions/${session.capture_session_id}/assets`, formData, {
      headers: { 'X-Capture-Token': session.capture_token },
      timeout: 120_000,
      onUploadProgress: (event) => {
        if (event.total) setUploadProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      },
    });
  };

  const createDraft = async (reuseUploadedEvidence = false) => {
    setCaptureState('uploading');
    setError('');
    try {
      if (!reuseUploadedEvidence) {
        const firstSequence = targetedRecapture ? (session.upload_sequence ?? 0) : 0;
        for (let index = 0; index < frames.length; index++) {
          await uploadAsset(firstSequence + index, frames[index].blob);
        }
        evidenceUploadedRef.current = true;
      }

      const response = recapture
        ? await apiClient.post(
            `/public/reports/${encodeURIComponent(recapture.reference)}/recapture`,
            { capture_token: session.capture_token },
            { headers: { 'X-Report-Resume-Token': recapture.resumeToken }, timeout: 30_000 },
          )
        : await apiClient.post('/public/reports', buildReceiptReportPayload({
            submissionUuid,
            captureToken: session.capture_token,
            trackingToken: credentialsRef.current.trackingToken,
            resumeToken: credentialsRef.current.resumeToken,
          }), { timeout: 30_000 });
      const responseData = response.data?.data as Partial<FormalReportResponse>;
      const report: FormalReportResponse = recapture ? {
        report_reference: recapture.reference,
        secret_tracking_token: '',
        device_resume_token: recapture.resumeToken,
        status: responseData.status || 'Processing receipt',
        submitted_at: null,
      } : responseData as FormalReportResponse;
      if (!response.data?.success || !report?.report_reference || !report.device_resume_token) {
        throw new Error('The server did not return a recoverable processing report.');
      }

      const [resumeResult, trackingResult] = recapture
        ? [{ status: 'fulfilled' as const }, { status: 'fulfilled' as const }]
        : await Promise.allSettled([
            saveReceiptResumeToken(report.report_reference, report.device_resume_token),
            saveReportTrackingToken(report.report_reference, report.secret_tracking_token),
          ]);
      clearPendingReceiptSubmissionCredentials(submissionUuid);
      setResumeStored(resumeResult.status === 'fulfilled');
      setTrackingStored(trackingResult.status === 'fulfilled');
      setDraft(report);
      onDraftCreated(report);
      stopCamera();
      setCaptureState('uploaded');
    } catch (caught: unknown) {
      const message = caught && typeof caught === 'object' && 'response' in caught
        ? (caught as { response?: { data?: { message?: string } } }).response?.data?.message
        : caught instanceof Error ? caught.message : undefined;
      setError(message || 'Receipt upload failed. Keep this page open and try again.');
      setCaptureState('error');
    }
  };

  const clearFrames = () => {
    frames.forEach((frame) => URL.revokeObjectURL(frame.url));
    setFrames([]);
    setRetakeIndex(null);
    setError('');
  };

  const deleteFrame = (index: number) => {
    URL.revokeObjectURL(frames[index].url);
    setFrames((current) => current.filter((_, frameIndex) => frameIndex !== index));
    // Indexes shift after a removal, so a pending retake could point at the wrong photo.
    setRetakeIndex(null);
    // The roll trigger disappears with the last photo, so close rather than strand an empty sheet.
    if (frames.length === 1) setGalleryOpen(false);
  };

  const cancelCapture = async () => {
    stopCamera();
    try {
      await apiClient.delete(`/public/capture-sessions/${session.capture_session_id}`, {
        headers: { 'X-Capture-Token': session.capture_token },
      });
    } finally {
      onCancel();
    }
  };

  const enableNotifications = async () => {
    if (!draft?.device_resume_token) return;
    try {
      setNotificationState(await enableReceiptNotifications({
        reference: draft.report_reference,
        resumeToken: draft.device_resume_token,
        vapidPublicKey,
      }));
    } catch {
      setNotificationState('unsupported');
    }
  };

  if (captureState === 'uploaded' && draft) {
    return (
      <section className="receipt-uploaded" aria-live="polite">
        <CheckCircle2 size={40} aria-hidden="true" />
        <h1>Receipt uploaded</h1>
        {resumeStored && trackingStored
          ? <p>Saved to this device. You can leave this page while we prepare your receipt, then return through My Reports.</p>
          : <p>Keep this recovery information before leaving. Device access could not be saved completely.</p>}
        {(!resumeStored || !trackingStored) && <div className="receipt-recovery-card">
          <span>Report reference</span><strong>{draft.report_reference}</strong>
          <span>Recovery token</span><strong>{draft.secret_tracking_token}</strong>
          <button type="button" className="btn-secondary" onClick={() => void navigator.clipboard?.writeText(draft.secret_tracking_token).then(() => setRecoveryCopied(true))}>
            {recoveryCopied ? 'Recovery token copied' : 'Copy recovery token'}
          </button>
        </div>}
        {notificationState === 'enabled' && <p className="receipt-notification-status">Notifications are enabled for this receipt.</p>}
        <div className="receipt-uploaded-actions">
          {resumeStored && notificationState === 'available' && vapidPublicKey && (
            <button type="button" className="btn-primary" onClick={enableNotifications}>
              <Bell size={18} /> Notify when ready
            </button>
          )}
          {/* Recapture only. A fresh capture exits via Go Home, which the caller supplies and the
              existing contract asserts. A recapture is given onCheckStatus and no onGoHome, so
              without this the customer is stranded on the confirmation with no way out. */}
          {recapture && onCheckStatus && (
            <button type="button" className="btn-primary" onClick={() => onCheckStatus(draft.report_reference)}>
              Check status
            </button>
          )}
          {onGoHome && <button type="button" className="btn-secondary" onClick={onGoHome}>Go Home</button>}
        </div>
      </section>
    );
  }

  // Derived, never stored: retaking or restarting replaces the frames, so the advisory cannot
  // outlive the photo that caused it. Wording names what was measured (brightness and detail) and
  // never claims a receipt was or was not detected, which this check cannot tell.
  const flagged = frames.filter((frame) => frame.issue !== null);
  const distinctIssues = [...new Set(flagged.map((frame) => frame.issue as FrameIssue))];
  const qualityAdvisory = flagged.length === 0
    ? ''
    : flagged.length === 1 && frames.length === 1
      ? `That photo looks ${ISSUE_TEXT[distinctIssues[0]].one}. ${ISSUE_TEXT[distinctIssues[0]].advice} You can upload anyway.`
      : distinctIssues.length === 1
        ? `${flagged.length} of ${frames.length} photos ${ISSUE_TEXT[distinctIssues[0]].many}. ${ISSUE_TEXT[distinctIssues[0]].advice} You can upload anyway.`
        : `${flagged.length} of ${frames.length} photos are hard to read. ${MIXED_ADVICE} You can upload anyway.`;

  const sectionNumber = (index: number) => (targetedRecapture ? (session.upload_sequence ?? 0) + 1 : index + 1);
  const lastFrame = frames[frames.length - 1];
  // Kept as the shutter's accessible name now that the button is icon-only, so the wording the
  // rest of the app and the tests rely on is unchanged.
  const shutterLabel = retakeIndex !== null
    ? `Capture replacement for section ${retakeIndex + 1}`
    : frames.length === 0 ? 'Capture receipt' : 'Add receipt section';

  return (
    // Flex column, not stacked absolute layers: the three zones are siblings, so controls can never
    // grow over the frame the way the old percentage-inset overlays did.
    <section className="continuous-receipt-capture" aria-label="Guided receipt scanner" data-app-fullscreen-layer>
      <video ref={videoRef} autoPlay muted playsInline aria-label="Live receipt camera" />
      <canvas ref={canvasRef} hidden />

      <div className="receipt-capture-top">
        <div className="receipt-capture-top-row">
          <button type="button" className="receipt-camera-icon-button" onClick={() => void cancelCapture()} aria-label="Cancel receipt capture"><ArrowLeft size={20} /></button>
          <div className="receipt-camera-store"><strong>{storeName}</strong></div>
        </div>
      </div>

      {/* The guide is the crop region: guideCropRect reads this element's box, so whatever it
          frames is what gets uploaded. It must keep a real, non-zero size. */}
      <div className="receipt-capture-frame">
        <div className="receipt-scan-guide" ref={guideRef} aria-hidden="true">
          <span>Keep text flat, bright, and in focus</span>
        </div>
      </div>

      <div className="receipt-capture-bottom">
        {/* Absolutely positioned, so messages never add height to the control row. The row staying
            exactly one row is what keeps the frame, and therefore the crop, a constant size. */}
        <div className="receipt-capture-messages">
          {error && <div className="receipt-camera-error" role="alert">{error}</div>}
          {/* Advisory, not an error: upload stays available because this check cannot tell whether a
              receipt is present, only whether the image is bright and detailed enough to read. */}
          {qualityAdvisory && captureState === 'ready' && (
            <div className="receipt-camera-advisory" role="status">{qualityAdvisory}</div>
          )}
          {captureState === 'requesting' && <div className="receipt-camera-progress"><LoaderCircle className="spin" size={20} /> Opening camera…</div>}
          {captureState === 'uploading' && <div className="receipt-camera-progress"><LoaderCircle className="spin" size={20} /> Uploading receipt securely{uploadProgress > 0 ? ` ${uploadProgress}%` : '…'}</div>}
          {captureState === 'ready' && targetedRecapture && (session.carried_sequences?.length ?? 0) > 0 && (
            <div className="receipt-camera-note">Other original sections will be preserved in a new evidence attempt.</div>
          )}
        </div>

        {captureState === 'ready' && (
          // 1fr auto 1fr: the shutter stays optically centred whether or not the side slots hold
          // anything.
          <div className="receipt-capture-controls">
            <div className="receipt-capture-slot">
              {lastFrame ? (
                <button
                  type="button"
                  ref={galleryTriggerRef}
                  className={`receipt-capture-roll${lastFrame.issue ? ' receipt-capture-roll--flagged' : ''}`}
                  onClick={() => setGalleryOpen(true)}
                  aria-label={`Captured sections (${frames.length})`}
                >
                  {/* Decorative: the button carries the name, and a second node named
                      "Receipt section N" would collide with the sheet's own image. */}
                  <img src={lastFrame.url} alt="" />
                  <span className="receipt-capture-roll-count" aria-hidden="true">{frames.length}</span>
                </button>
              ) : (
                <span className="receipt-capture-roll receipt-capture-roll--empty" aria-hidden="true" />
              )}
              {/* Hidden where the browser reports no torch, rather than offering a dead control. */}
              {torchSupported && (
                <div className="receipt-flash" ref={flashRef}>
                  {flashMenuOpen && (
                    <div className="receipt-flash-menu" role="menu" aria-label="Flash">
                      {FLASH_MODES.filter((mode) => mode !== flashMode).map((mode) => (
                        <button key={mode} type="button" role="menuitem" onClick={() => void selectFlashMode(mode)}>
                          <FlashIcon mode={mode} /> {FLASH_LABEL[mode]}
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    className="receipt-camera-icon-button"
                    aria-haspopup="menu"
                    aria-expanded={flashMenuOpen}
                    aria-label={`Flash: ${FLASH_LABEL[flashMode]}`}
                    onClick={() => setFlashMenuOpen((open) => !open)}
                  >
                    <FlashIcon mode={flashMode} />
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              className="receipt-record-button"
              onClick={() => void capture()}
              disabled={frames.length >= maximumFrames && retakeIndex === null}
              aria-label={shutterLabel}
            >
              <Camera size={26} aria-hidden="true" />
            </button>

            <div className="receipt-capture-slot receipt-capture-slot--end">
              <button
                type="button"
                className="btn-primary receipt-capture-upload"
                disabled={frames.length === 0}
                onClick={() => void createDraft()}
              >
                Upload receipt {frames.length === 1 ? 'photo' : 'photos'}
              </button>
            </div>
          </div>
        )}

        {captureState === 'error' && <button type="button" className="receipt-camera-retry" onClick={() => {
          if (evidenceUploadedRef.current) void createDraft(true);
          else void openCamera();
        }}><RotateCcw size={20} /> {evidenceUploadedRef.current ? 'Retry report setup' : 'Try camera again'}</button>}
      </div>

      <CapturedPhotosSheet
        open={galleryOpen}
        photos={frames.map((frame, index) => ({
          url: frame.url,
          alt: `Receipt section ${index + 1}`,
          retakeLabel: `Retake section ${sectionNumber(index)}`,
          deleteLabel: `Delete section ${sectionNumber(index)}`,
          viewLabel: `View section ${sectionNumber(index)} full size`,
          flag: frame.issue ? ISSUE_TEXT[frame.issue].flag : undefined,
        }))}
        triggerRef={galleryTriggerRef}
        onDismiss={() => setGalleryOpen(false)}
        onRetake={(index) => { setRetakeIndex(index); setGalleryOpen(false); }}
        onDelete={deleteFrame}
        onView={(index) => setViewer({ url: frames[index].url, sequence: index })}
        onRestart={targetedRecapture ? undefined : () => { clearFrames(); setGalleryOpen(false); }}
        note={`${frames.length} of ${maximumFrames} sections captured`}
      />

      {/* Top layer via showModal(), so it clears both the camera overlay and the sheet it opens from. */}
      <ReceiptPhotoViewer photo={viewer} onClose={() => setViewer(null)} />
    </section>
  );
};

export default GuidedReceiptCapture;
