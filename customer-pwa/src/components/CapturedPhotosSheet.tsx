import type React from 'react';
import { RotateCcw } from 'lucide-react';
import { PriceSheet } from './PriceSheet';

export interface CapturedPhotoItem {
  url: string;
  /** Accessible name for the image, e.g. "Receipt section 3". */
  alt: string;
  /** Accessible name for this row's retake control, e.g. "Retake section 3". */
  retakeLabel: string;
  /** Accessible name for the full-size trigger, e.g. "View section 3 full size". */
  viewLabel: string;
  /** Quality flag text when the capture check flagged this photo, e.g. "Too dark". */
  flag?: string;
}

export interface CapturedPhotosSheetProps {
  open: boolean;
  photos: CapturedPhotoItem[];
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  onDismiss: () => void;
  /** Retaking closes the sheet so the shutter can show its replacement label straight away. */
  onRetake: (index: number) => void;
  /** Opens the photo full size, so a capture can actually be checked rather than assumed. */
  onView: (index: number) => void;
  /** Omitted during a targeted recapture, where starting over is not offered. */
  onRestart?: () => void;
  /** Short status line, e.g. how many sections of the maximum have been captured. */
  note?: string;
}

/**
 * The full roll of captured receipt sections, opened from the thumbnail beside the shutter. The
 * camera row stays a single row; everything that would have stacked under it lives here instead.
 *
 * Deliberately dumb: it receives display strings rather than frame objects, so the quality-issue
 * vocabulary stays with the capture screen that computes it.
 */
export function CapturedPhotosSheet({
  open,
  photos,
  triggerRef,
  onDismiss,
  onRetake,
  onView,
  onRestart,
  note,
}: CapturedPhotosSheetProps): React.ReactElement {
  return (
    <PriceSheet
      open={open}
      sheetId="captured-receipt-photos"
      title="Captured sections"
      description="Check each photo is readable before uploading."
      dialogLabel="Captured receipt sections"
      closeLabel="Close captured sections"
      triggerRef={triggerRef}
      onDismiss={onDismiss}
      testId="captured-photos-backdrop"
      // Opened from inside the fullscreen camera layer, which sits at z-index 1000; without this the
      // sheet paints underneath an opaque backdrop and the tap looks like it did nothing.
      backdropClassName="captured-photos-backdrop"
      footer={onRestart ? (
        <footer className="captured-photos-actions">
          <button type="button" className="captured-photos-restart" onClick={onRestart}>
            Restart photos
          </button>
        </footer>
      ) : undefined}
    >
      <div className="captured-photos-list">
        {note && <p className="captured-photos-note">{note}</p>}
        {photos.length === 0 ? (
          <p className="captured-photos-empty">No photos captured yet.</p>
        ) : photos.map((photo, index) => (
          <div
            key={photo.url}
            className={`captured-photos-row${photo.flag ? ' captured-photos-row--flagged' : ''}`}
          >
            <button
              type="button"
              className="captured-photos-view"
              aria-label={photo.viewLabel}
              onClick={() => onView(index)}
            >
              <img className="captured-photos-thumb" src={photo.url} alt={photo.alt} />
            </button>
            <div className="captured-photos-meta">
              <strong>{photo.alt}</strong>
              {photo.flag && <span className="captured-photos-flag">{photo.flag}</span>}
            </div>
            <button
              type="button"
              className="captured-photos-retake"
              aria-label={photo.retakeLabel}
              onClick={() => onRetake(index)}
            >
              <RotateCcw size={18} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </PriceSheet>
  );
}
