import React from 'react';
import { WifiOff } from 'lucide-react';

interface OfflineBannerProps {
  isOffline: boolean;
  lastSyncTime?: string;
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({ isOffline, lastSyncTime }) => {
  if (!isOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
      background: 'rgba(239, 68, 68, 0.2)',
      border: '1px solid rgba(239, 68, 68, 0.4)',
      color: '#f87171',
      padding: '10px 16px',
      borderRadius: '10px',
      fontSize: '0.85rem',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      marginBottom: '16px'
    }}>
      <WifiOff size={18} />
      <div>
        <strong>Offline Mode Active:</strong> Current price information cannot be confirmed while offline.
        {lastSyncTime && (
          <div style={{ fontSize: '0.75rem', opacity: 0.85 }}>
            Last synchronized: {lastSyncTime}
          </div>
        )}
      </div>
    </div>
  );
};
