import { useState } from 'react'
import { RefreshCw, Sparkles } from 'lucide-react'
import { useRegisterSW } from '../app/pwaRegistration'

export function PwaUpdatePrompt() {
  const [updating, setUpdating] = useState(false)
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swScriptUrl, registration) {
      if (registration) {
        // Periodic check every 30 seconds
        setInterval(() => {
          registration.update().catch((err) => {
            console.warn('Periodic SW update check failed:', err)
          })
        }, 30 * 1000)

        // Check on app visibility / focus
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            registration.update().catch((err) => {
              console.warn('Visibility SW update check failed:', err)
            })
          }
        })

        // Check on network reconnect
        window.addEventListener('online', () => {
          registration.update().catch((err) => {
            console.warn('Online SW update check failed:', err)
          })
        })
      }
    },
    onRegisterError(error) {
      console.warn('Unable to register PRICE-Watch field service worker:', error)
    },
  })

  if (!needRefresh) return null

  return (
    <aside className="pwa-update-prompt" role="status" aria-live="polite">
      <div className="pwa-update-icon-wrap">
        <RefreshCw size={20} className={updating ? 'spin' : ''} aria-hidden="true" />
      </div>
      <div className="pwa-update-copy">
        <div className="pwa-update-title-row">
          <strong>Update available</strong>
          <span className="pwa-update-pill">
            <Sparkles size={11} /> New version
          </span>
        </div>
        <span>A new version of PRICE-Watch Field Monitoring is ready. Updating will refresh the app without losing your saved drafts.</span>
      </div>
      <div className="pwa-update-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={() => setNeedRefresh(false)}
          disabled={updating}
        >
          Later
        </button>
        <button
          type="button"
          className="primary-button pwa-update-primary"
          disabled={updating}
          onClick={async () => {
            setUpdating(true)
            try {
              await updateServiceWorker(true)
            } finally {
              setUpdating(false)
            }
          }}
        >
          {updating ? 'Updating�' : 'Update now'}
        </button>
      </div>
    </aside>
  )
}
