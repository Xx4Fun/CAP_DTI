import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImageOff, Minus, Plus, RotateCcw, X } from 'lucide-react';
import { useBackLayer } from '../hooks/useBackLayer';

interface CloseWatcherLike {
  addEventListener: (type: 'close', listener: EventListener) => void;
  removeEventListener: (type: 'close', listener: EventListener) => void;
  destroy: () => void;
}

type CloseWatcherConstructor = new () => CloseWatcherLike;

interface Point {
  x: number;
  y: number;
}

interface ViewTransform extends Point {
  scale: number;
}

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const SCALE_STEP = 0.5;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function distance(left: Point, right: Point): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function midpoint(left: Point, right: Point): Point {
  return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
}

export interface ProductImageLightboxProps {
  open: boolean;
  imageUrl: string;
  altText: string;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  onDismiss: () => void;
}

export function ProductImageLightbox({
  open,
  imageUrl,
  altText,
  triggerRef,
  onDismiss,
}: ProductImageLightboxProps): React.ReactPortal | null {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const pointersRef = useRef(new Map<number, Point>());
  const panStartRef = useRef<{ pointer: Point; offset: Point } | null>(null);
  const pinchStartRef = useRef<{
    distance: number;
    midpoint: Point;
    transform: ViewTransform;
  } | null>(null);
  const lastTouchTapRef = useRef<{ time: number; point: Point } | null>(null);
  const touchStartsRef = useRef(new Map<number, { time: number; point: Point; moved: boolean }>());
  const hadMultiplePointersRef = useRef(false);
  const [transform, setTransform] = useState<ViewTransform>({ scale: MIN_SCALE, x: 0, y: 0 });
  const [isGesturing, setIsGesturing] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const managedByBackNavigation = useBackLayer('product-image-lightbox', open, onDismiss);

  const clampOffset = (x: number, y: number, scale: number): Point => {
    const viewport = viewportRef.current;
    const image = imageRef.current;
    if (!viewport || !image || scale <= MIN_SCALE) return { x: 0, y: 0 };

    const maxX = Math.max(0, ((image.clientWidth || viewport.clientWidth) * scale - viewport.clientWidth) / 2);
    const maxY = Math.max(0, ((image.clientHeight || viewport.clientHeight) * scale - viewport.clientHeight) / 2);
    return {
      x: clamp(x, -maxX, maxX),
      y: clamp(y, -maxY, maxY),
    };
  };

  const setScale = (requestedScale: number) => {
    setTransform((current) => {
      const scale = clamp(requestedScale, MIN_SCALE, MAX_SCALE);
      const offset = clampOffset(current.x, current.y, scale);
      return { scale, ...offset };
    });
  };

  const resetView = () => setTransform({ scale: MIN_SCALE, x: 0, y: 0 });

  const toggleZoom = () => {
    if (transform.scale > MIN_SCALE) resetView();
    else setScale(2);
  };

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const triggerElement = triggerRef.current;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const CloseWatcher = (window as Window & { CloseWatcher?: CloseWatcherConstructor }).CloseWatcher;
    let watcher: CloseWatcherLike | undefined;
    let removeCloseListener: (() => void) | undefined;

    if (CloseWatcher && !managedByBackNavigation) {
      watcher = new CloseWatcher();
      const handleClose = (event: Event) => {
        event.preventDefault();
        onDismiss();
      };
      watcher.addEventListener('close', handleClose);
      removeCloseListener = () => watcher?.removeEventListener('close', handleClose);
    } else {
      const handleEscape = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        onDismiss();
      };
      document.addEventListener('keydown', handleEscape);
      removeCloseListener = () => document.removeEventListener('keydown', handleEscape);
    }

    return () => {
      removeCloseListener?.();
      watcher?.destroy();
      document.body.style.overflow = previousOverflow;
      triggerElement?.focus();
    };
  }, [managedByBackNavigation, onDismiss, open, triggerRef]);

  useEffect(() => {
    pointersRef.current.clear();
    panStartRef.current = null;
    pinchStartRef.current = null;
    lastTouchTapRef.current = null;
    touchStartsRef.current.clear();
    hadMultiplePointersRef.current = false;
    setIsGesturing(false);
    setImageFailed(false);
    resetView();
  }, [imageUrl, open]);

  useEffect(() => {
    if (!open) return;
    const handleResize = () => {
      setTransform((current) => ({
        scale: current.scale,
        ...clampOffset(current.x, current.y, current.scale),
      }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [open]);

  if (!open) return null;

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey && !event.altKey) {
      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        setScale(transform.scale + SCALE_STEP);
        return;
      }
      if (event.key === '-') {
        event.preventDefault();
        setScale(transform.scale - SCALE_STEP);
        return;
      }
      if (event.key === '0') {
        event.preventDefault();
        resetView();
        return;
      }
    }

    if (event.key !== 'Tab') return;
    const controls = [...(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    if (!controls.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      className="product-image-lightbox"
      data-testid="product-image-lightbox"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
    >
      <div
        ref={dialogRef}
        className="product-image-lightbox__dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Full image of ${altText}`}
        onKeyDown={handleDialogKeyDown}
      >
        <button
          ref={closeButtonRef}
          className="product-image-lightbox__close"
          type="button"
          aria-label="Close full image"
          onClick={onDismiss}
        >
          <X size={24} aria-hidden="true" />
        </button>
        <div
          ref={viewportRef}
          className={`product-image-lightbox__viewport${isGesturing ? ' is-gesturing' : ''}`}
          data-testid="product-image-lightbox-viewport"
          onDoubleClick={toggleZoom}
          onWheel={(event) => {
            event.preventDefault();
            setScale(transform.scale + (event.deltaY < 0 ? SCALE_STEP : -SCALE_STEP));
          }}
          onPointerDown={(event) => {
            const point = { x: event.clientX, y: event.clientY };
            pointersRef.current.set(event.pointerId, point);
            if (event.pointerType === 'touch') {
              touchStartsRef.current.set(event.pointerId, { time: Date.now(), point, moved: false });
            }
            event.currentTarget.setPointerCapture?.(event.pointerId);
            setIsGesturing(true);

            const points = [...pointersRef.current.values()];
            if (points.length === 2) {
              hadMultiplePointersRef.current = true;
              lastTouchTapRef.current = null;
              pinchStartRef.current = {
                distance: Math.max(1, distance(points[0], points[1])),
                midpoint: midpoint(points[0], points[1]),
                transform,
              };
              panStartRef.current = null;
            } else if (points.length === 1 && transform.scale > MIN_SCALE) {
              panStartRef.current = { pointer: point, offset: { x: transform.x, y: transform.y } };
            }
          }}
          onPointerMove={(event) => {
            if (!pointersRef.current.has(event.pointerId)) return;
            const point = { x: event.clientX, y: event.clientY };
            const touchStart = touchStartsRef.current.get(event.pointerId);
            if (touchStart && distance(touchStart.point, point) > 8) touchStart.moved = true;
            pointersRef.current.set(event.pointerId, point);
            const points = [...pointersRef.current.values()];

            if (points.length === 2 && pinchStartRef.current) {
              const start = pinchStartRef.current;
              const currentMidpoint = midpoint(points[0], points[1]);
              const scale = clamp(
                start.transform.scale * (distance(points[0], points[1]) / start.distance),
                MIN_SCALE,
                MAX_SCALE,
              );
              const offset = clampOffset(
                start.transform.x + currentMidpoint.x - start.midpoint.x,
                start.transform.y + currentMidpoint.y - start.midpoint.y,
                scale,
              );
              setTransform({ scale, ...offset });
            } else if (points.length === 1 && panStartRef.current && transform.scale > MIN_SCALE) {
              const start = panStartRef.current;
              const offset = clampOffset(
                start.offset.x + point.x - start.pointer.x,
                start.offset.y + point.y - start.pointer.y,
                transform.scale,
              );
              setTransform({ scale: transform.scale, ...offset });
            }
          }}
          onPointerUp={(event) => {
            const releasedPoint = pointersRef.current.get(event.pointerId);
            const touchStart = touchStartsRef.current.get(event.pointerId);
            pointersRef.current.delete(event.pointerId);
            touchStartsRef.current.delete(event.pointerId);
            if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }

            const remaining = [...pointersRef.current.values()];
            pinchStartRef.current = null;
            panStartRef.current = remaining.length === 1 && transform.scale > MIN_SCALE
              ? { pointer: remaining[0], offset: { x: transform.x, y: transform.y } }
              : null;
            if (!remaining.length) setIsGesturing(false);

            const isTouchTap = event.pointerType === 'touch'
              && releasedPoint
              && touchStart
              && !touchStart.moved
              && !hadMultiplePointersRef.current
              && Date.now() - touchStart.time < 350;
            if (isTouchTap) {
              const now = Date.now();
              const lastTap = lastTouchTapRef.current;
              if (
                lastTap
                && now - lastTap.time < 300
                && distance(lastTap.point, releasedPoint) < 24
              ) {
                lastTouchTapRef.current = null;
                toggleZoom();
              } else {
                lastTouchTapRef.current = { time: now, point: releasedPoint };
              }
            }
            if (!remaining.length) hadMultiplePointersRef.current = false;
          }}
          onPointerCancel={(event) => {
            pointersRef.current.delete(event.pointerId);
            touchStartsRef.current.delete(event.pointerId);
            panStartRef.current = null;
            pinchStartRef.current = null;
            if (!pointersRef.current.size) hadMultiplePointersRef.current = false;
            setIsGesturing(false);
          }}
        >
          {imageFailed ? (
            <span className="product-image-lightbox__fallback" role="status">
              <ImageOff size={32} aria-hidden="true" />
              <span>No image</span>
            </span>
          ) : (
            <img
              ref={imageRef}
              className="product-image-lightbox__image"
              src={imageUrl}
              alt={altText}
              draggable={false}
              decoding="async"
              style={{ transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})` }}
              onError={() => setImageFailed(true)}
            />
          )}
        </div>
        <div className="product-image-lightbox__controls" aria-label="Image zoom controls">
          <button
            type="button"
            aria-label="Zoom out"
            disabled={transform.scale <= MIN_SCALE || imageFailed}
            onClick={() => setScale(transform.scale - SCALE_STEP)}
          >
            <Minus size={20} aria-hidden="true" />
          </button>
          <output aria-live="polite">{Math.round(transform.scale * 100)}%</output>
          <button
            type="button"
            aria-label="Zoom in"
            disabled={transform.scale >= MAX_SCALE || imageFailed}
            onClick={() => setScale(transform.scale + SCALE_STEP)}
          >
            <Plus size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Reset zoom"
            disabled={transform.scale === MIN_SCALE && transform.x === 0 && transform.y === 0}
            onClick={resetView}
          >
            <RotateCcw size={19} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
