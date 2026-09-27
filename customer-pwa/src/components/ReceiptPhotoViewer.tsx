import React, { useEffect, useRef, useState } from 'react';
import { X, ZoomIn, ZoomOut } from 'lucide-react';

export interface ReceiptPhotoViewerProps {
  /** Null closes the viewer. `sequence` is zero-based; labels show it one-based. */
  photo: { url: string; sequence: number } | null;
  onClose: () => void;
}

/**
 * Full-size look at one captured receipt section.
 *
 * Uses a native <dialog> with showModal(), which puts it in the browser's top layer — above every
 * z-index. That matters here: it is opened from inside the fullscreen camera layer and from within
 * a portalled sheet, both of which defeat ordinary z-index stacking.
 */
export function ReceiptPhotoViewer({ photo, onClose }: ReceiptPhotoViewerProps): React.ReactElement | null {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (!photo) return;
    setZoom(1);
    const trigger = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => { dialog?.close(); trigger?.focus(); };
  }, [photo]);

  if (!photo) return null;

  return (
    <dialog
      ref={dialogRef}
      className="receipt-photo-dialog"
      aria-label={`Receipt section ${photo.sequence + 1}`}
      onCancel={onClose}
    >
      <div className="receipt-photo-toolbar">
        <strong>Section {photo.sequence + 1}</strong>
        <button type="button" className="btn-secondary" aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom(value => Math.max(1, value - 0.5))}><ZoomOut size={20} /></button>
        <button type="button" className="btn-secondary" aria-label="Zoom in" disabled={zoom >= 4} onClick={() => setZoom(value => Math.min(4, value + 0.5))}><ZoomIn size={20} /></button>
        <button type="button" className="btn-secondary" aria-label="Close photo" onClick={onClose}><X size={20} /></button>
      </div>
      <div className="receipt-photo-scroll">
        <img src={photo.url} alt={`Full receipt section ${photo.sequence + 1}`} style={{ width: `${zoom * 100}%`, maxWidth: 'none' }} />
      </div>
    </dialog>
  );
}

export default ReceiptPhotoViewer;
