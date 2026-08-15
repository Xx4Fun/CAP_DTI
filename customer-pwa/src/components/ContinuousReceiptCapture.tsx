import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bell, Camera, CheckCircle2, CircleStop, LoaderCircle, RotateCcw, Video } from 'lucide-react';
import { apiClient, type CaptureSessionResponse, type FormalReportResponse } from '../api/client';
import { buildContinuousReportPayload, preferredReceiptVideoMime, selectBestReceiptFrames } from '../app/receiptCapture';
import { enableReceiptNotifications, currentReceiptNotificationAvailability } from '../app/receiptNotifications';
import { saveReceiptResumeToken } from '../app/receiptResumeStore';

interface ContinuousReceiptCaptureProps {
  session: CaptureSessionResponse;
  storeName: string;
  submissionUuid: string;
  vapidPublicKey?: string;
  onCancel: () => void;
  onDraftCreated: (report: FormalReportResponse) => void;
  onCheckStatus?: (reference: string) => void;
  onGoHome?: () => void;
}

type CaptureState = 'requesting' | 'ready' | 'recording' | 'uploading' | 'uploaded' | 'error';

const MAX_DURATION_SECONDS = 30;
const MAX_SELECTED_FRAMES = 12;

export const ContinuousReceiptCapture: React.FC<ContinuousReceiptCaptureProps> = ({
  session,
  storeName,
  submissionUuid,
  vapidPublicKey = '',
  onCancel,
  onDraftCreated,
  onCheckStatus,
  onGoHome,
}) => {
  const [captureState, setCaptureState] = useState<CaptureState>('requesting');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<FormalReportResponse | null>(null);
  const [resumeStored, setResumeStored] = useState(false);
  const [notificationState, setNotificationState] = useState<string>(() => currentReceiptNotificationAvailability());
  const [guidedFrames, setGuidedFrames] = useState<Blob[]>([]);
  const [recoveryCopied, setRecoveryCopied] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const sampledFramesRef = useRef<Array<{ blob: Blob; score: number; index: number }>>([]);
  const timerRef = useRef<number | null>(null);
  const samplerRef = useRef<number | null>(null);
  const recordingStartedAtRef = useRef(0);
  const activeRef = useRef(true);
  const isGuided = session.capture_mode === 'guided_photos_v1';

  const stopTimers = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (samplerRef.current) window.clearInterval(samplerRef.current);
    timerRef.current = null;
    samplerRef.current = null;
  }, []);

  const stopCamera = useCallback(() => {
    stopTimers();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, [stopTimers]);

  useEffect(() => {
    activeRef.current = true;
    const openCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1080 },
            height: { ideal: 1920 },
          },
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
    };
    void openCamera();

    return () => {
      activeRef.current = false;
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      stopCamera();
    };
  }, [stopCamera]);

  const captureFrame = useCallback(async (): Promise<{ blob: Blob; score: number } | null> => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) return null;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const sampleWidth = Math.min(64, canvas.width);
    const sampleHeight = Math.min(96, canvas.height);
    const sample = document.createElement('canvas');
    sample.width = sampleWidth;
    sample.height = sampleHeight;
    const sampleContext = sample.getContext('2d');
    sampleContext?.drawImage(canvas, 0, 0, sampleWidth, sampleHeight);
    const pixels = sampleContext?.getImageData(0, 0, sampleWidth, sampleHeight).data;
    let edgeTotal = 0;
    if (pixels) {
      for (let index = 4; index < pixels.length; index += 4) {
        const current = pixels[index] + pixels[index + 1] + pixels[index + 2];
        const previous = pixels[index - 4] + pixels[index - 3] + pixels[index - 2];
        edgeTotal += Math.abs(current - previous);
      }
    }
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    return blob ? { blob, score: pixels ? edgeTotal / Math.max(1, pixels.length / 4) : 0 } : null;
  }, []);

  const uploadAsset = async (kind: 'original_video' | 'source_frame', sequence: number, blob: Blob) => {
    const formData = new FormData();
    formData.append('kind', kind);
    formData.append('sequence', String(sequence));
    const videoExtension = blob.type.startsWith('video/mp4') ? 'mp4' : 'webm';
    formData.append('asset', blob, kind === 'original_video' ? `receipt.${videoExtension}` : `receipt-frame-${sequence}.jpg`);
    await apiClient.post(`/public/capture-sessions/${session.capture_session_id}/assets`, formData, {
      headers: { 'X-Capture-Token': session.capture_token },
    });
  };

  const createDraft = async (videoBlob: Blob | null, frames: Blob[]) => {
    setCaptureState('uploading');
    setError('');
    try {
      if (videoBlob) await uploadAsset('original_video', 0, videoBlob);
      for (let index = 0; index < Math.min(frames.length, MAX_SELECTED_FRAMES); index++) {
        await uploadAsset('source_frame', index, frames[index]);
      }

      const response = await apiClient.post('/public/reports', buildContinuousReportPayload({
        submissionUuid,
        captureToken: session.capture_token,
      }));
      const report = response.data?.data as FormalReportResponse;
      if (!response.data?.success || !report?.report_reference || !report.device_resume_token) {
        throw new Error('The server did not return a recoverable processing report.');
      }

      setDraft(report);
      onDraftCreated(report);
      try {
        await saveReceiptResumeToken(report.report_reference, report.device_resume_token);
        setResumeStored(true);
      } catch {
        setResumeStored(false);
      }
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

  const finishRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;
    stopTimers();
    recorder.stop();
  }, [stopTimers]);

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream || typeof MediaRecorder === 'undefined') {
      setError('Continuous video capture is unavailable on this browser.');
      setCaptureState('error');
      return;
    }
    const mimeType = preferredReceiptVideoMime(MediaRecorder.isTypeSupported.bind(MediaRecorder));
    if (!mimeType) {
      setError('This browser cannot create a supported receipt video. Use guided photo capture instead.');
      setCaptureState('error');
      return;
    }

    chunksRef.current = [];
    sampledFramesRef.current = [];
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 });
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const videoBlob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType });
      const limit = session.limits?.max_video_bytes ?? 25 * 1024 * 1024;
      if (videoBlob.size > limit) {
        setError('The receipt video is larger than 25 MiB. Scan again more slowly within 30 seconds.');
        setCaptureState('error');
        return;
      }
      const bestFrames = selectBestReceiptFrames(sampledFramesRef.current, MAX_SELECTED_FRAMES).map((frame) => frame.blob);
      void createDraft(videoBlob, bestFrames);
    };
    recorder.start(500);
    recordingStartedAtRef.current = Date.now();
    setSeconds(0);
    setCaptureState('recording');
    timerRef.current = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - recordingStartedAtRef.current) / 1000);
      setSeconds(elapsed);
      if (elapsed >= MAX_DURATION_SECONDS) finishRecording();
    }, 250);
    samplerRef.current = window.setInterval(() => {
      if (sampledFramesRef.current.length >= MAX_SELECTED_FRAMES * 2) return;
      void captureFrame().then((frame) => {
        if (frame && frame.blob.size <= (session.limits?.max_frame_bytes ?? 2 * 1024 * 1024)) {
          sampledFramesRef.current.push({ ...frame, index: sampledFramesRef.current.length });
        }
      });
    }, 500);
  };

  const addGuidedFrame = async () => {
    const frame = await captureFrame();
    if (!frame) {
      setError('Hold the receipt in the guide and wait for the camera to focus.');
      return;
    }
    setError('');
    setGuidedFrames((current) => [...current, frame.blob].slice(0, MAX_SELECTED_FRAMES));
  };

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'hidden' || recorderRef.current?.state !== 'recording') return;
      stopTimers();
      recorderRef.current.onstop = () => {
        chunksRef.current = [];
        sampledFramesRef.current = [];
        setError('The scan stopped because PRICE-Watch left the foreground. Start the receipt scan again.');
        setCaptureState('ready');
      };
      recorderRef.current.stop();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [stopTimers]);

  const enableNotifications = async () => {
    if (!draft?.device_resume_token) return;
    try {
      const result = await enableReceiptNotifications({
        reference: draft.report_reference,
        resumeToken: draft.device_resume_token,
        vapidPublicKey,
      });
      setNotificationState(result);
    } catch {
      setNotificationState('unsupported');
    }
  };

  const cancelCapture = async () => {
    const recorder = recorderRef.current;
    if (recorder?.state === 'recording') {
      recorder.onstop = () => undefined;
      recorder.stop();
    }
    stopCamera();
    try {
      await apiClient.delete(`/public/capture-sessions/${session.capture_session_id}`, {
        headers: { 'X-Capture-Token': session.capture_token },
      });
    } finally {
      onCancel();
    }
  };

  if (captureState === 'uploaded' && draft) {
    return (
      <section className="receipt-uploaded" aria-live="polite">
        <CheckCircle2 size={40} aria-hidden="true" />
        <h1>Receipt uploaded</h1>
        {resumeStored ? (
          <p>You can leave this page while we prepare your receipt. We’ll send a notification when it’s ready if notifications are enabled. You can also check Recent Reports.</p>
        ) : (
          <p>Keep this recovery information before leaving. Secure device storage was unavailable, so this report cannot reopen automatically.</p>
        )}
        <div className="receipt-recovery-card">
          <span>Report reference</span><strong>{draft.report_reference}</strong>
          <span>Recovery token</span><strong>{draft.secret_tracking_token}</strong>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void navigator.clipboard?.writeText(draft.secret_tracking_token).then(() => setRecoveryCopied(true))}
          >
            {recoveryCopied ? 'Recovery token copied' : 'Copy recovery token'}
          </button>
        </div>
        {resumeStored && notificationState === 'available' && vapidPublicKey && (
          <button type="button" className="btn-primary" onClick={enableNotifications}>
            <Bell size={18} aria-hidden="true" /> Notify me when ready
          </button>
        )}
        {notificationState === 'enabled' && <p className="receipt-notification-status">Notifications are enabled for this receipt.</p>}
        {notificationState === 'install-required' && <p className="receipt-notification-status">On iPhone or iPad, add PRICE-Watch to the Home Screen before enabling notifications.</p>}
        {(notificationState === 'denied' || notificationState === 'unsupported') && <p className="receipt-notification-status">Device notifications are unavailable. Check Recent Reports for updates.</p>}
        <div className="receipt-uploaded-actions">
          {onCheckStatus && <button type="button" className="btn-primary" onClick={() => onCheckStatus(draft.report_reference)}>Check status</button>}
          {onGoHome && <button type="button" className="btn-secondary" onClick={onGoHome}>Go Home</button>}
        </div>
      </section>
    );
  }

  return (
    <section className="continuous-receipt-capture" aria-label="Continuous receipt scanner">
      <video ref={videoRef} autoPlay muted playsInline aria-label="Live receipt camera" />
      <canvas ref={canvasRef} hidden />
      <div className="receipt-capture-shade receipt-capture-shade--top">
        <button type="button" className="receipt-camera-icon-button" onClick={() => void cancelCapture()} aria-label="Cancel receipt capture">
          <ArrowLeft size={20} />
        </button>
        <div className="receipt-camera-store"><strong>{storeName}</strong><span>Keep this receipt centered</span></div>
      </div>
      <div className="receipt-scan-guide" aria-hidden="true"><span>Start at the store name</span><span>Move down slowly with overlap</span></div>
      <div className="receipt-capture-shade receipt-capture-shade--bottom">
        {error && <div className="receipt-camera-error" role="alert">{error}</div>}
        {captureState === 'requesting' && <div className="receipt-camera-progress"><LoaderCircle className="spin" size={20} /> Opening camera…</div>}
        {captureState === 'uploading' && <div className="receipt-camera-progress"><LoaderCircle className="spin" size={20} /> Uploading receipt securely…</div>}
        {captureState === 'ready' && !isGuided && (
          <button type="button" className="receipt-record-button" onClick={startRecording} aria-label="Start continuous scan">
            <Video size={24} aria-hidden="true" /> Start continuous scan
          </button>
        )}
        {captureState === 'recording' && (
          <button type="button" className="receipt-record-button receipt-record-button--stop" onClick={finishRecording} aria-label="Finish receipt scan">
            <CircleStop size={24} aria-hidden="true" /> Finish receipt scan <span>{Math.min(seconds, 30)}s / 30s</span>
          </button>
        )}
        {captureState === 'ready' && isGuided && (
          <>
            <button type="button" className="receipt-record-button" onClick={addGuidedFrame} aria-label="Capture overlapping receipt photo">
              <Camera size={24} aria-hidden="true" /> Capture overlap photo
            </button>
            <span className="receipt-guided-count">{guidedFrames.length} of at least 2 photos</span>
            {guidedFrames.length >= 2 && (
              <button type="button" className="btn-primary" onClick={() => void createDraft(null, guidedFrames)}>Upload receipt photos</button>
            )}
          </>
        )}
        {captureState === 'error' && (
          <button type="button" className="receipt-record-button" onClick={() => { setError(''); setCaptureState('ready'); }}>
            <RotateCcw size={20} aria-hidden="true" /> Try again
          </button>
        )}
      </div>
    </section>
  );
};

export default ContinuousReceiptCapture;
