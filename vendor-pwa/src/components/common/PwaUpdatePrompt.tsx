import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useRegisterSW } from '../../app/pwaRegistration';

export const PwaUpdatePrompt: React.FC = () => {
  const [updating, setUpdating] = useState(false);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update().catch(() => undefined);
      });
    },
    onRegisterError(error) {
      console.warn('Unable to register the Vendor Portal service worker:', error);
    },
  });

  if (!needRefresh) return null;

  return (
    <aside className="pwa-update-prompt" role="status" aria-live="polite">
      <RefreshCw size={18} aria-hidden="true" />
      <span><strong>Update available.</strong> Refresh to use the latest Vendor Portal.</span>
      <div className="pwa-update-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setNeedRefresh(false)} disabled={updating}>Later</button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
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
    </aside>
  );
};
