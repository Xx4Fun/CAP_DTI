import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
}

const DISMISSED_KEY = 'price-watch-field-install-dismissed'

export function InstallPrompt() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalling, setIsInstalling] = useState(false)
  const [isInstalled, setIsInstalled] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches === true,
  )
  const [isDismissed, setIsDismissed] = useState(() => {
    try {
      const dismissedUntil = localStorage.getItem(DISMISSED_KEY)
      if (!dismissedUntil) return false
      return new Date().getTime() < parseInt(dismissedUntil, 10)
    } catch {
      return false
    }
  })

  useEffect(() => {
    const handleInstallAvailable = (event: Event) => {
      event.preventDefault()
      if (!isDismissed && !isInstalled) {
        setPromptEvent(event as BeforeInstallPromptEvent)
      }
    }

    const handleInstalled = () => {
      setPromptEvent(null)
      setIsInstalled(true)
    }

    window.addEventListener('beforeinstallprompt', handleInstallAvailable)
    window.addEventListener('appinstalled', handleInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallAvailable)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [isDismissed, isInstalled])

  const installApp = async () => {
    if (!promptEvent || isInstalling) return

    setIsInstalling(true)
    try {
      await promptEvent.prompt()
      const choice = await promptEvent.userChoice
      if (choice.outcome === 'accepted') {
        setIsInstalled(true)
      }
      setPromptEvent(null)
    } finally {
      setIsInstalling(false)
    }
  }

  const dismiss = () => {
    try {
      const expiration = new Date().getTime() + 7 * 24 * 60 * 60 * 1000
      localStorage.setItem(DISMISSED_KEY, expiration.toString())
    } catch {
      // Ignore storage restrictions
    }
    setIsDismissed(true)
    setPromptEvent(null)
  }

  const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)

  if (isDismissed || isInstalled) return null
  if (!promptEvent && !isIOS) return null

  if (isIOS && !promptEvent) {
    return (
      <aside className="field-install-banner" aria-label="Install PRICE-Watch Field App">
        <div className="field-install-icon">
          <Download size={20} aria-hidden="true" />
        </div>
        <div className="field-install-copy">
          <strong>Install Field Monitoring App</strong>
          <span>
            Tap <strong>Share</strong> (??) then select <strong>Add to Home Screen</strong>
          </span>
        </div>
        <button type="button" className="field-install-dismiss" onClick={dismiss} aria-label="Dismiss install banner">
          <X size={18} aria-hidden="true" />
        </button>
      </aside>
    )
  }

  return (
    <aside className="field-install-banner" aria-label="Install PRICE-Watch Field App">
      <div className="field-install-icon">
        <Download size={20} aria-hidden="true" />
      </div>
      <div className="field-install-copy">
        <strong>Install Field Monitoring App</strong>
        <span>Add to home screen for offline price monitoring & biometric security.</span>
      </div>
      <div className="field-install-actions">
        <button
          type="button"
          className="field-install-btn"
          onClick={installApp}
          disabled={isInstalling}
        >
          {isInstalling ? 'Opening�' : 'Install app'}
        </button>
        <button type="button" className="field-install-dismiss" onClick={dismiss} aria-label="Dismiss install banner">
          <X size={18} aria-hidden="true" />
        </button>
      </div>
    </aside>
  )
}
