import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'

interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

export function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null)
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    const available = (next: Event) => { next.preventDefault(); setEvent(next as InstallEvent) }
    window.addEventListener('beforeinstallprompt', available)
    return () => window.removeEventListener('beforeinstallprompt', available)
  }, [])
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  if (hidden || window.matchMedia('(display-mode: standalone)').matches || (!event && !isIOS)) return null
  return <aside className="install-strip" aria-label="Install field monitoring app">
    <Download size={19} /><span><strong>Install Field Monitoring</strong><small>Keep the secure field workspace on this device.</small></span>
    {event ? <button type="button" onClick={async () => { await event.prompt(); setEvent(null) }}>Install</button> : <span className="ios-install-copy">Use Share, then Add to Home Screen.</span>}
    <button type="button" className="icon-only" aria-label="Dismiss install prompt" onClick={() => setHidden(true)}><X size={18} /></button>
  </aside>
}
