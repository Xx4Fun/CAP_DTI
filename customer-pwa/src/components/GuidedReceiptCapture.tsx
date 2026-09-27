import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bell, Camera, CheckCircle2, LoaderCircle, RotateCcw } from 'lucide-react';
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
    advice: 'Move somewhere brighter and keep the receipt flat inside the guide.',
  },
  bright: {
    flag: 'Too bright', one: 'too bright to read', many: 'look washed out',
    advice: 'Move out of direct light or glare and keep the receipt flat inside the guide.',
  },
  flat: {
    flag: 'Hard to read', one: 'too blurry or flat to read', many: 'look blurry or flat',
    advice: 'Hold steady until the camera focuses and keep the receipt flat inside the guide.',
  },
};

const MIXED_ADVICE = 'Retake them in even light, held flat inside the guide.';

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
  const [recoveryCopied, setRecoveryCopied] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
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

  const captureFrame = useCallback(async (): Promise<{ blob: Blob; issue: FrameIssue | null } | null> => {
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
    const maximumBytes = session.limits?.max_frame_bytes ?? 2 * 1024 * 1024;
    let result: Blob | null = null;
    for (const encodeQuality of [0.86, 0.72, 0.58]) {
      result = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', encodeQuality));
      if (!result || result.size <= maximumBytes) return result ? { blob: result, issue } : null;
    }
    return result ? { blob: result, issue } : null;
  }, [session.limits?.max_frame_bytes]);

  const capture = async () => {
    const captured = await captureFrame();
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

  const instruction = targetedRecapture
    ? session.capture_action === 'append' ? 'Capture the next section with part of the previous section visible.' : `Capture a clear replacement for section ${(session.upload_sequence ?? 0) + 1}.`
    : frames.length === 0 ? 'Capture the whole receipt if it fits, including store, date, items, and total.' : 'Long receipt? Move down and capture the next section with visible overlap.';

  return (
    <section className="continuous-receipt-capture" aria-label="Guided receipt scanner">
      <video ref={videoRef} autoPlay muted playsInline aria-label="Live receipt camera" />
      <canvas ref={canvasRef} hidden />
      <div className="receipt-capture-shade receipt-capture-shade--top">
        <button type="button" className="receipt-camera-icon-button" onClick={() => void cancelCapture()} aria-label="Cancel receipt capture"><ArrowLeft size={20} /></button>
        <div className="receipt-camera-store"><strong>{storeName}</strong><span>{instruction}</span></div>
      </div>
      <div className="receipt-scan-guide" ref={guideRef} aria-hidden="true"><span>Keep text flat, bright, and in focus</span><span>Only what is inside this guide is saved</span></div>
      {frames.length > 0 && <div className="receipt-section-previews" aria-label="Captured receipt sections">
        {frames.map((frame, index) => <div key={frame.url} className={`receipt-section-preview${frame.issue ? ' receipt-section-preview--unreadable' : ''}`}>
          <img src={frame.url} alt={`Receipt section ${index + 1}`} />
          {frame.issue && <span className="receipt-section-preview-flag">{ISSUE_TEXT[frame.issue].flag}</span>}
          <button type="button" onClick={() => setRetakeIndex(index)}>Retake section {targetedRecapture ? (session.upload_sequence ?? 0) + 1 : index + 1}</button>
        </div>)}
      </div>}
      <div className="receipt-capture-shade receipt-capture-shade--bottom">
        {error && <div className="receipt-camera-error" role="alert">{error}</div>}
        {/* Advisory, not an error: upload stays available because this check cannot tell whether a
            receipt is present, only whether the image is bright and detailed enough to read. */}
        {qualityAdvisory && captureState === 'ready' && (
          <div className="receipt-camera-advisory" role="status">{qualityAdvisory}</div>
        )}
        {captureState === 'requesting' && <div className="receipt-camera-progress"><LoaderCircle className="spin" size={20} /> Opening camera…</div>}
        {captureState === 'uploading' && <div className="receipt-camera-progress"><LoaderCircle className="spin" size={20} /> Uploading receipt securely{uploadProgress > 0 ? ` ${uploadProgress}%` : '…'}</div>}
        {captureState === 'ready' && <>
          <button type="button" className="receipt-record-button" onClick={() => void capture()} disabled={frames.length >= maximumFrames && retakeIndex === null}>
            <Camera size={24} /> {retakeIndex !== null ? `Capture replacement for section ${retakeIndex + 1}` : frames.length === 0 ? 'Capture receipt' : 'Add receipt section'}
          </button>
          <span className="receipt-guided-count">{frames.length} section{frames.length === 1 ? '' : 's'} captured · maximum {maximumFrames}</span>
          {targetedRecapture && (session.carried_sequences?.length ?? 0) > 0 && <span className="receipt-guided-count">Other original sections will be preserved in a new evidence attempt.</span>}
          {frames.length > 0 && <div className="receipt-guided-actions">
            {!targetedRecapture && <button type="button" className="btn-secondary" onClick={clearFrames}>Restart photos</button>}
            <button type="button" className="btn-primary" onClick={() => void createDraft()}>Upload receipt {frames.length === 1 ? 'photo' : 'photos'}</button>
          </div>}
        </>}
        {captureState === 'error' && <button type="button" className="receipt-record-button" onClick={() => {
          if (evidenceUploadedRef.current) void createDraft(true);
          else void openCamera();
        }}><RotateCcw size={20} /> {evidenceUploadedRef.current ? 'Retry report setup' : 'Try camera again'}</button>}
      </div>
    </section>
  );
};

export default GuidedReceiptCapture;
