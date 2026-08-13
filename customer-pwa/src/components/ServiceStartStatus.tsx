import React, { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';

interface ServiceStartStatusProps {
  active: boolean;
  onRetry: () => void;
}

export const ServiceStartStatus: React.FC<ServiceStartStatusProps> = ({ active, onRetry }) => {
  const [stage, setStage] = useState<0 | 1 | 2>(0);

  useEffect(() => {
    if (!active) {
      setStage(0);
      return;
    }

    setStage(0);
    const startingTimer = window.setTimeout(() => setStage(1), 3_000);
    const delayedTimer = window.setTimeout(() => setStage(2), 15_000);
    return () => {
      window.clearTimeout(startingTimer);
      window.clearTimeout(delayedTimer);
    };
  }, [active]);

  if (!active) return null;

  return (
    <div className="service-start-status" role="status" aria-live="polite">
      <LoaderCircle className="service-start-spinner" size={20} aria-hidden="true" />
      <div>
        <strong>
          {stage === 0
            ? 'Loading current information…'
            : stage === 1
              ? 'Starting the service…'
              : 'This is taking longer than usual'}
        </strong>
        {stage > 0 && (
          <div>{stage === 1 ? 'The service may need a few moments to wake up.' : 'Check your connection or retry. Your current selections are safe.'}</div>
        )}
      </div>
      {stage === 2 && (
        <button type="button" onClick={onRetry} aria-label="Retry connection">
          Retry
        </button>
      )}
    </div>
  );
};

export default ServiceStartStatus;
