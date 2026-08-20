import React, { useEffect, useLayoutEffect, useState } from 'react';

export type PageLoaderDestination = 'home' | 'prices' | 'scan' | 'reports' | 'track' | 'more';

interface PageLoaderProps {
  destination: PageLoaderDestination;
  delayMs?: number;
  blocking?: boolean;
  onPendingChange?: (pending: boolean) => void;
  onRetry?: () => void;
}

const destinationLabels: Record<PageLoaderDestination, string> = {
  home: 'Home',
  prices: 'Prices',
  scan: 'Scanner',
  reports: 'Reports',
  track: 'Report Status',
  more: 'More & Help',
};

export const PageLoader: React.FC<PageLoaderProps> = ({
  destination,
  delayMs = 175,
  blocking = false,
  onPendingChange,
  onRetry = () => window.location.reload(),
}) => {
  const [visible, setVisible] = useState(delayMs <= 0);
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  const destinationLabel = destinationLabels[destination];

  useLayoutEffect(() => {
    onPendingChange?.(true);
    return () => onPendingChange?.(false);
  }, [onPendingChange]);

  useEffect(() => {
    if (delayMs <= 0) {
      setVisible(true);
      return;
    }
    setVisible(false);
    const visibleTimer = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(visibleTimer);
  }, [delayMs]);

  useEffect(() => {
    setStage(0);
    const connectingTimer = window.setTimeout(() => setStage(1), 3_000);
    const delayedTimer = window.setTimeout(() => setStage(2), 15_000);

    return () => {
      window.clearTimeout(connectingTimer);
      window.clearTimeout(delayedTimer);
    };
  }, [destination]);

  if (!visible) return null;

  return (
    <div className={`page-loader${blocking ? ' page-loader--blocking' : ''}`} role="status" aria-live="polite">
      <span className="page-loader-spinner" aria-hidden="true" />
      <div className="page-loader-copy">
        <strong>
          {stage === 0
            ? `Opening ${destinationLabel}…`
            : stage === 1
              ? 'Connecting to PRICE-Watch…'
              : 'This is taking longer than usual'}
        </strong>
        {stage === 2 && <span>Check your connection, then try opening the page again.</span>}
      </div>
      {stage === 2 && (
        <button type="button" onClick={onRetry} aria-label={`Retry opening ${destinationLabel}`}>
          Retry
        </button>
      )}
    </div>
  );
};

export default PageLoader;
