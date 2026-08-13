import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useBackLayer } from '../hooks/useBackLayer';

interface CloseWatcherLike {
  addEventListener: (type: 'close', listener: EventListener) => void;
  removeEventListener: (type: 'close', listener: EventListener) => void;
  destroy: () => void;
}

type CloseWatcherConstructor = new () => CloseWatcherLike;

export interface PriceSheetProps {
  open: boolean;
  sheetId: string;
  title: string;
  description?: string;
  dialogLabel?: string;
  closeLabel: string;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  onDismiss: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  testId: string;
}

const dismissThreshold = 96;

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element
    && target.closest('button, input, label, select, textarea, a, [role="button"]') !== null;
}

function isOptionDragTarget(target: EventTarget | null): boolean {
  return target instanceof Element
    && target.closest('[data-price-sheet-option]') !== null
    && target.closest('input') === null;
}

export function PriceSheet({
  open,
  sheetId,
  title,
  description,
  dialogLabel,
  closeLabel,
  triggerRef,
  onDismiss,
  children,
  footer,
  testId,
}: PriceSheetProps): React.ReactPortal {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragStartYRef = useRef<number | null>(null);
  const dragDistanceRef = useRef(0);
  const dragPointerIdRef = useRef<number | null>(null);
  const pendingInteractiveDragRef = useRef(false);
  const dragCaptureActiveRef = useRef(false);
  const [dragDistance, setDragDistance] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isListAtTop, setIsListAtTop] = useState(true);
  const managedByBackNavigation = useBackLayer(`price-sheet:${sheetId}`, open, onDismiss);

  useEffect(() => {
    if (open) {
      setIsListAtTop((scrollRef.current?.scrollTop ?? 0) <= 0);
      return;
    }

    dragStartYRef.current = null;
    dragDistanceRef.current = 0;
    dragPointerIdRef.current = null;
    pendingInteractiveDragRef.current = false;
    dragCaptureActiveRef.current = false;
    setDragDistance(0);
    setIsDragging(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const triggerElement = triggerRef.current;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const closeWatcherConstructor = (window as Window & { CloseWatcher?: CloseWatcherConstructor }).CloseWatcher;
    let closeWatcher: CloseWatcherLike | undefined;
    let removeEscapeListener: (() => void) | undefined;

    if (closeWatcherConstructor && !managedByBackNavigation) {
      closeWatcher = new closeWatcherConstructor();
      const handleClose = (event: Event) => {
        event.preventDefault();
        onDismiss();
      };
      closeWatcher.addEventListener('close', handleClose);
      removeEscapeListener = () => closeWatcher?.removeEventListener('close', handleClose);
    } else {
      const handleEscape = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onDismiss();
        }
      };
      document.addEventListener('keydown', handleEscape);
      removeEscapeListener = () => document.removeEventListener('keydown', handleEscape);
    }

    return () => {
      removeEscapeListener?.();
      closeWatcher?.destroy();
      document.body.style.overflow = previousOverflow;
      triggerElement?.focus();
    };
  }, [managedByBackNavigation, onDismiss, open, triggerRef]);

  const trapFocus = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Tab') return;

    const focusable = [...(sheetRef.current?.querySelectorAll<HTMLInputElement | HTMLButtonElement>(
      'button, input[type="checkbox"], input[type="radio"]',
    ) ?? [])].filter((control) => !control.disabled);
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const resetDrag = () => {
    dragStartYRef.current = null;
    dragDistanceRef.current = 0;
    dragPointerIdRef.current = null;
    pendingInteractiveDragRef.current = false;
    dragCaptureActiveRef.current = false;
    setDragDistance(0);
    setIsDragging(false);
  };

  const updateDragDistance = (clientY: number) => {
    if (dragStartYRef.current === null) return 0;

    const nextDistance = Math.max(0, clientY - dragStartYRef.current);
    dragDistanceRef.current = nextDistance;
    setDragDistance(nextDistance);
    return nextDistance;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (event.isPrimary === false || dragPointerIdRef.current !== null) return;

    const scrollContainer = event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-filter-scroll]')
      : null;
    if (scrollContainer && scrollContainer.scrollTop > 0) return;

    const pendingInteractiveDrag = isOptionDragTarget(event.target);
    if (isInteractiveTarget(event.target) && !pendingInteractiveDrag) return;

    dragStartYRef.current = event.clientY;
    dragDistanceRef.current = 0;
    dragPointerIdRef.current = event.pointerId;
    pendingInteractiveDragRef.current = pendingInteractiveDrag;
    dragCaptureActiveRef.current = !pendingInteractiveDrag;
    setDragDistance(0);
    setIsDragging(!pendingInteractiveDrag);
    if (!pendingInteractiveDrag) event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (dragPointerIdRef.current !== event.pointerId) return;
    const nextDistance = updateDragDistance(event.clientY);

    if (pendingInteractiveDragRef.current && nextDistance > 8) {
      pendingInteractiveDragRef.current = false;
      dragCaptureActiveRef.current = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setIsDragging(true);
    }

    if (dragCaptureActiveRef.current) event.preventDefault();
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLElement>) => {
    if (dragPointerIdRef.current !== event.pointerId) return;

    const finalDistance = event.type === 'pointercancel'
      ? dragDistanceRef.current
      : updateDragDistance(event.clientY);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    resetDrag();
    if (finalDistance >= dismissThreshold) onDismiss();
  };

  const titleId = `${sheetId}-title`;

  return createPortal(
    <div
      className={`price-filter-backdrop${open ? ' price-filter-backdrop--open' : ''}`}
      data-testid={testId}
      aria-hidden={!open}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
    >
      <section
        ref={sheetRef}
        className={`price-filter-sheet${open ? ' price-filter-sheet--open' : ''}${isDragging ? ' is-dragging' : ''}`}
        style={{ '--price-filter-drag-y': `${dragDistance}px` } as React.CSSProperties}
        {...(open ? {
          role: 'dialog',
          'aria-modal': true,
          ...(dialogLabel ? { 'aria-label': dialogLabel } : { 'aria-labelledby': titleId }),
        } : {})}
        onKeyDown={trapFocus}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        <div className="price-filter-handle" aria-hidden="true" />
        <header className="price-filter-header">
          <div className="price-filter-heading-copy">
            <h2 id={titleId}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button ref={closeButtonRef} className="price-filter-close" type="button" aria-label={closeLabel} onClick={onDismiss}>
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div
          ref={scrollRef}
          className={`price-filter-list${isListAtTop ? ' price-filter-list--at-top' : ''}`}
          data-filter-scroll
          onScroll={(event) => setIsListAtTop(event.currentTarget.scrollTop <= 0)}
        >
          {children}
        </div>
        {footer}
      </section>
    </div>,
    document.body,
  );
}
