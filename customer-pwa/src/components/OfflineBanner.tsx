import React, { useEffect, useState } from 'react';
import { WifiOff, X } from 'lucide-react';

interface OfflineBannerProps {
  isOffline: boolean;
  lastSyncTime?: string;
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({ isOffline, lastSyncTime }) => {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isOffline) setDismissed(false);
  }, [isOffline]);

  if (!isOffline || dismissed) return null;

  return (
    <div
      className="offline-banner"
      role="status"
      aria-live="polite"
      style={{
        background: '#fff7ed',
        border: '1px solid #fdba74',
        color: '#9a3412',
        padding: '10px 16px',
        borderRadius: '10px',
        fontSize: '0.85rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '10px',
        marginBottom: '16px'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <WifiOff size={18} style={{ flexShrink: 0 }} />
        <div>
          <strong>You are offline.</strong> Current price information cannot be confirmed.
          {lastSyncTime && (
            <div style={{ fontSize: '0.75rem', opacity: 0.85 }}>
              Last synchronized: {lastSyncTime}
            </div>
          )}
        </div>
      </div>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss offline notice"
        className="offline-banner-dismiss"
        style={{
          background: 'transparent',
          border: 'none',
          color: '#9a3412',
          cursor: 'pointer',
          width: '44px',
          height: '44px',
          padding: '10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}
      >
        <X size={20} />
      </button>
    </div>
  );
};
