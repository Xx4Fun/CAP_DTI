import { useEffect, useRef, type ReactNode } from 'react'
import { ClipboardList, History, Home, LockKeyhole, Plus, UserRound, Wifi, WifiOff } from 'lucide-react'

export type TopLevelView = 'home' | 'activity' | 'history' | 'profile'

interface FieldAppShellProps {
  activeView: TopLevelView
  officerName: string
  online: boolean
  queueCount: number
  hasActiveDraft: boolean
  authorizationValid: boolean
  onNavigate: (view: TopLevelView) => void
  onStartVisit: () => void
  onLock: () => void
  children: ReactNode
}

const destinations = [
  { id: 'home' as const, label: 'Dashboard', phoneLabel: 'Home', icon: Home },
  { id: 'activity' as const, label: 'Activity', phoneLabel: 'Activity', icon: ClipboardList },
  { id: 'history' as const, label: 'History', phoneLabel: 'History', icon: History },
  { id: 'profile' as const, label: 'Profile', phoneLabel: 'Profile', icon: UserRound },
]

export function FieldAppShell({ activeView, officerName, online, queueCount, hasActiveDraft, authorizationValid, onNavigate, onStartVisit, onLock, children }: FieldAppShellProps) {
  const mainRef = useRef<HTMLElement>(null)
  const addDisabled = !hasActiveDraft && !authorizationValid
  const addLabel = hasActiveDraft ? 'View active visit in Activity' : 'Start a new monitoring visit'
  const activateAdd = () => hasActiveDraft ? onNavigate('activity') : onStartVisit()

  useEffect(() => {
    const heading = mainRef.current?.querySelector<HTMLElement>('h1')
    heading?.focus()
  }, [activeView])

  const navigationButton = (destination: typeof destinations[number], phone = false) => {
    const Icon = destination.icon
    return <button type="button" className={activeView === destination.id ? 'active' : ''} aria-current={activeView === destination.id ? 'page' : undefined} aria-label={phone ? destination.phoneLabel : destination.label} onClick={() => onNavigate(destination.id)}>
      <Icon aria-hidden="true" />
      <span>{phone ? destination.phoneLabel : destination.label}</span>
      {destination.id === 'activity' && queueCount > 0 && <span className="nav-count" aria-label={`${queueCount} pending sync`}>{queueCount}</span>}
    </button>
  }

  return <div className="field-app field-shell">
    <a className="skip-link" href="#field-main">Skip to field workspace</a>
    <aside className="field-sidebar" data-testid="field-sidebar" aria-label="Field monitoring navigation">
      <div className="field-sidebar-brand"><span className="field-logo-frame"><img src="/branding/dti-logo.svg" alt="DTI Official Logo" /></span><span><strong>PRICE-Watch</strong><small>Field Monitoring</small></span></div>
      <div className={`field-connection-card ${online ? 'online' : ''}`}>{online ? <Wifi /> : <WifiOff />}<span><strong>{online ? 'Connected' : 'Offline mode'}</strong><small>{online ? 'Ready to synchronize' : `${queueCount} visit${queueCount === 1 ? '' : 's'} secured`}</small></span></div>
      <nav>
        {navigationButton(destinations[0])}
        {navigationButton(destinations[1])}
        <button type="button" className="field-new-visit" disabled={addDisabled} aria-label={addLabel} onClick={activateAdd}><Plus aria-hidden="true" /><span>{hasActiveDraft ? 'Current work' : 'New visit'}</span></button>
        {navigationButton(destinations[2])}
        {navigationButton(destinations[3])}
      </nav>
      <div className="field-sidebar-account"><span className="field-account-mark" aria-hidden="true">{initials(officerName)}</span><span><strong>{officerName}</strong><small>DTI Field Officer</small></span><button type="button" aria-label="Lock now" onClick={onLock}><LockKeyhole /></button></div>
    </aside>

    <div className="field-workspace">
      <header className="field-mobile-header">
        <div className="field-mobile-brand"><span className="field-logo-frame"><img src="/branding/dti-logo.svg" alt="DTI Official Logo" /></span><strong>PRICE-Watch</strong></div>
        <span className={`field-mobile-status ${online ? 'online' : ''}`} aria-label={online ? 'Online' : 'Offline'}>{online ? <Wifi /> : <WifiOff />}<span>{online ? 'Online' : 'Offline'}</span></span>
        <button type="button" className="field-header-lock" aria-label="Lock now" onClick={onLock}><LockKeyhole /></button>
      </header>
      <header className="field-content-toolbar"><strong>{destinations.find((item) => item.id === activeView)?.label}</strong><span className={online ? 'online' : ''}>{online ? <Wifi /> : <WifiOff />}{online ? 'Online · Ready' : 'Offline · Local work protected'}</span></header>
      <main id="field-main" className="field-main" ref={mainRef}>{children}</main>
    </div>

    <nav className="field-bottom-nav" data-testid="field-bottom-nav" aria-label="Field monitoring navigation">
      {navigationButton(destinations[0], true)}
      {navigationButton(destinations[1], true)}
      <button type="button" className="field-bottom-add" disabled={addDisabled} aria-label={addLabel} onClick={activateAdd}><span><Plus aria-hidden="true" /></span><small>Add</small></button>
      {navigationButton(destinations[2], true)}
      {navigationButton(destinations[3], true)}
    </nav>
  </div>
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase()
}
