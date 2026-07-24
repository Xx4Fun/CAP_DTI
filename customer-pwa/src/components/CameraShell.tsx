import { useEffect, useId, useRef, type RefObject } from 'react';
import { Camera, Flashlight, RefreshCw, RotateCw, X } from 'lucide-react';
import { StatusBanner } from './ui/StatusBanner';
import { IconButton } from './ui/IconButton';

type CameraShellProps = {
  title: string;
  subtitle: string;
  stream: MediaStream | null;
  error: string | null;
  canCapture: boolean;
  torchSupported: boolean;
  torchOn: boolean;
  onClose: () => void;
  onRetry: () => void;
  onManualEntry?: () => void;
  manualEntryLabel?: string;
  onToggleTorch: () => void;
  onSwitchCamera: () => void;
  onCapture: () => void;
  videoRef?: RefObject<HTMLVideoElement | null>;
};

export function CameraShell({ title, subtitle, stream, error, canCapture, torchSupported, torchOn, onClose, onRetry, onManualEntry, manualEntryLabel = 'Enter details manually', onToggleTorch, onSwitchCamera, onCapture, videoRef: suppliedRef }: CameraShellProps) {
  const internalRef = useRef<HTMLVideoElement>(null);
  const videoRef = suppliedRef ?? internalRef;
  const titleId = useId();
  useEffect(() => { if (videoRef.current) videoRef.current.srcObject = stream; }, [stream, videoRef]);

  return (
    <section className="camera-shell" role="region" aria-labelledby={titleId}>
      <div className="camera-shell__top">
        <IconButton label="Close camera" onClick={onClose}><X aria-hidden="true" /></IconButton>
        <div><h1 id={titleId}>{title}</h1><p>{subtitle}</p></div>
        <div className="camera-shell__top-actions">
          {torchSupported && <IconButton label={`${torchOn ? 'Turn off' : 'Turn on'} flashlight`} onClick={onToggleTorch}><Flashlight aria-hidden="true" /></IconButton>}
          <IconButton label="Switch camera" onClick={onSwitchCamera}><RotateCw aria-hidden="true" /></IconButton>
        </div>
      </div>
      <div className="camera-shell__viewport">
        <video ref={videoRef} autoPlay playsInline muted aria-label="Live camera preview" />
        {!stream && !error && <div className="camera-shell__loading"><RefreshCw aria-hidden="true" /><span>Starting camera…</span></div>}
        <div className="camera-guide" aria-hidden="true"><span /><span /><span /><span /></div>
        <p className="camera-instruction">Hold steady and keep the full label or receipt inside the frame.</p>
      </div>
      {error ? (
        <div className="camera-shell__recovery">
          <StatusBanner variant="error" title="Camera unavailable">{error}</StatusBanner>
          <div className="button-row"><button className="button button--primary" type="button" onClick={onRetry}><RefreshCw aria-hidden="true" /> Retry camera</button>{onManualEntry && <button className="button button--secondary" type="button" onClick={onManualEntry}>{manualEntryLabel}</button>}</div>
        </div>
      ) : (
        <div className="camera-shell__controls"><button className="camera-shutter" type="button" aria-label="Capture image" disabled={!canCapture} onClick={onCapture}><span><Camera aria-hidden="true" /></span></button><p>{canCapture ? 'Tap to capture' : 'Waiting for camera'}</p></div>
      )}
    </section>
  );
}
