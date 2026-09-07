import React, { useState } from 'react';
import { CheckCircle2, RefreshCw } from 'lucide-react';
import { useRegisterSW } from '../app/pwaRegistration';

export const PwaUpdatePrompt: React.FC = () => {
  const [updating, setUpdating] = useState(false);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.warn('Unable to register the PRICE-Watch service worker:', error);
    },
  });

  if (offlineReady && !needRefresh) {
    return (
      <div className="pwa-update-prompt" role="status" aria-live="polite">
        <CheckCircle2 size={20} aria-hidden="true" />
        <div className="pwa-update-copy">
          <strong>Ready for offline use</strong>
          <span>The app shell is saved. Previously synchronized reference prices remain available without a connection.</span>
        </div>
        <div className="pwa-update-actions">
          <button type="button" aria-label="Dismiss offline-ready notice" onClick={() => setOfflineReady(false)}>
            Got it
          </button>
        </div>
      </div>
    );
  }

  if (!needRefresh) return null;

  return (
    <div className="pwa-update-prompt" role="status" aria-live="polite">
      <RefreshCw size={20} aria-hidden="true" />
      <div className="pwa-update-copy">
        <strong>Update available</strong>
        <span>Install it while online to keep every screen available offline. Your current task will not be interrupted.</span>
      </div>
      <div className="pwa-update-actions">
        <button type="button" onClick={() => setNeedRefresh(false)} disabled={updating}>
          Later
        </button>
        <button
          type="button"
          className="pwa-update-primary"
          disabled={updating}
          onClick={async () => {
            setUpdating(true);
            try {
              await updateServiceWorker(true);
            } finally {
              setUpdating(false);
            }
          }}
        >
          {updating ? 'Updating…' : 'Update now'}
        </button>
      </div>
    </div>
  );
};

export default PwaUpdatePrompt;
