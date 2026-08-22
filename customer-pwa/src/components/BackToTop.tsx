import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import './BackToTop.css';

const SCROLL_THRESHOLD = 600;
const BLOCKING_LAYER_SELECTOR = [
  '[data-app-fullscreen-layer]',
  '[aria-modal="true"]',
  '.modal-backdrop',
  '.price-filter-backdrop--open',
  '.product-image-lightbox',
  '.pwa-update-prompt',
  '.continuous-receipt-capture',
].join(',');

type BackToTopProps = {
  hidden?: boolean;
};

const hasBlockingLayer = () => document.querySelector(BLOCKING_LAYER_SELECTOR) !== null;

export const BackToTop = ({ hidden = false }: BackToTopProps) => {
  const [isPastThreshold, setIsPastThreshold] = useState(() => window.scrollY > SCROLL_THRESHOLD);
  const [isBlocked, setIsBlocked] = useState(() => hasBlockingLayer());

  useEffect(() => {
    const updateScrollPosition = () => setIsPastThreshold(window.scrollY > SCROLL_THRESHOLD);
    window.addEventListener('scroll', updateScrollPosition, { passive: true });
    return () => window.removeEventListener('scroll', updateScrollPosition);
  }, []);

  useEffect(() => {
    const updateBlockingState = () => setIsBlocked(hasBlockingLayer());
    const observer = new MutationObserver(updateBlockingState);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-modal', 'class', 'data-app-fullscreen-layer'],
    });
    updateBlockingState();
    return () => observer.disconnect();
  }, []);

  if (hidden || isBlocked || !isPastThreshold) return null;

  const returnToTop = () => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  return (
    <button className="back-to-top" type="button" aria-label="Back to top" onClick={returnToTop}>
      <ArrowUp aria-hidden="true" size={22} strokeWidth={2.4} />
    </button>
  );
};
