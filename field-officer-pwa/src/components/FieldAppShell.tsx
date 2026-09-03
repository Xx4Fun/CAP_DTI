import { useEffect, useRef, type ReactNode } from 'react'
import { Bell, CircleHelp, ClipboardList, History, Home, LockKeyhole, Plus, Wifi, WifiOff } from 'lucide-react'

export type TopLevelView = 'home' | 'monitoring' | 'history' | 'profile' | 'visit'

interface FieldAppShellProps {
  activeView: TopLevelView
  officerName: string
  online: boolean
  queueCount: number
  draftCount: number
  unreadCount: number
  authorizationValid: boolean
  fullScreenMode?: boolean
  onNavigate: (view: TopLevelView) => void
  onStartVisit: () => void
  onHelp?: () => void
  onNotifications?: () => void
  onLock: () => void
  children: ReactNode
}

const destinations = [
  { id: 'home' as const, label: 'Dashboard', phoneLabel: 'Home', icon: Home },
  { id: 'monitoring' as const, label: 'Monitoring', phoneLabel: 'Monitoring', icon: ClipboardList },
  { id: 'history' as const, label: 'History', phoneLabel: 'History', icon: History },
]

export function FieldAppShell({
  activeView,
  officerName,
  online,
  queueCount,
  draftCount,
  unreadCount,
  authorizationValid,
  fullScreenMode = false,
  onNavigate,
  onStartVisit,
  onHelp,
  onNotifications,
  onLock,
  children,
}: FieldAppShellProps) {
  const mainRef = useRef<HTMLElement>(null)
  const isFullScreen = fullScreenMode
  const addActive = activeView === 'visit'
  const addDisabled = draftCount === 0 && !authorizationValid
  const addLabel = 'Start a new monitoring visit'
  const activateAdd = () => onStartVisit()

  useEffect(() => {
    const heading = mainRef.current?.querySelector<HTMLElement>('h1')
    heading?.focus()
  }, [activeView])

  const navigationButton = (destination: (typeof destinations)[number], phone = false) => {
    const Icon = destination.icon
    return (
      <button
        type="button"
        className={activeView === destination.id ? 'active' : ''}
        aria-current={activeView === destination.id ? 'page' : undefined}
        aria-label={phone ? destination.phoneLabel : destination.label}
        onClick={() => onNavigate(destination.id)}
      >
        <Icon aria-hidden="true" />
        <span>{phone ? destination.phoneLabel : destination.label}</span>
        {destination.id === 'monitoring' && queueCount + draftCount > 0 && (
          <span className="nav-count" aria-label={`${queueCount + draftCount} items need attention`}>
            {queueCount + draftCount}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className={`field-app field-shell ${isFullScreen ? 'field-fullscreen-shell' : ''}`}>
      <a className="skip-link" href="#field-main">
        Skip to field workspace
      </a>

      {!isFullScreen && (
        <aside className="field-sidebar" data-testid="field-sidebar" aria-label="Field monitoring navigation">
          <div className="field-sidebar-brand">
            <span className="field-logo-frame">
              <img src="/branding/dti-logo.svg" alt="DTI Official Logo" />
            </span>
            <span>
              <strong>PRICE-Watch</strong>
              <small>Field Monitoring</small>
            </span>
          </div>

          <nav>
            {navigationButton(destinations[0])}
            {navigationButton(destinations[1])}
            <button
              type="button"
              className={`field-new-visit ${addActive ? 'active' : ''}`}
              disabled={addDisabled}
              aria-current={addActive ? 'page' : undefined}
              aria-label={addLabel}
              onClick={activateAdd}
            >
              <Plus aria-hidden="true" />
              <span>Add</span>
            </button>
            {navigationButton(destinations[2])}
          </nav>

          <div className="field-sidebar-account">
            <button type="button" className="field-account-profile" aria-label="Open profile" onClick={() => onNavigate('profile')}>
              <span className="field-account-mark" aria-hidden="true">{initials(officerName)}</span>
              <span><strong>{officerName}</strong><small>DTI Field Officer</small></span>
            </button>
            <button type="button" aria-label="Lock now" onClick={onLock}>
              <LockKeyhole />
            </button>
          </div>
        </aside>
      )}

      <div className="field-workspace">
        {!isFullScreen && (
          <>
            <header className="field-mobile-header">
              <div className="field-mobile-brand">
                <span className="field-logo-frame">
                  <img src="/branding/dti-logo.svg" alt="DTI Official Logo" />
                </span>
                <strong>PRICE-Watch</strong>
              </div>
              <span className={`field-mobile-status ${online ? 'online' : ''}`} aria-label={online ? 'Online' : 'Offline'}>
                {online ? <Wifi /> : <WifiOff />}
                <span>{online ? 'Online' : 'Offline'}</span>
              </span>
              <button type="button" className="field-header-icon" aria-label={notificationLabel(unreadCount)} onClick={onNotifications}>
                <Bell />{unreadCount > 0 && <span className="field-icon-count">{unreadCount}</span>}
              </button>
              <button type="button" className="field-header-avatar" aria-label="Open profile" onClick={() => onNavigate('profile')}>
                {initials(officerName)}
              </button>
            </header>

            <header className="field-content-toolbar">
              <strong>{activeView === 'visit' ? 'New Visit' : destinations.find((item) => item.id === activeView)?.label}</strong>
              <span className={online ? 'online' : ''}>
                {online ? <Wifi /> : <WifiOff />}
                {online ? 'Online · Ready' : 'Offline · Local work protected'}
              </span>
              {onHelp && <button type="button" className="field-toolbar-help" onClick={onHelp}><CircleHelp /><span>Help</span></button>}
              <button type="button" className="field-header-icon" aria-label={notificationLabel(unreadCount)} onClick={onNotifications}>
                <Bell />{unreadCount > 0 && <span className="field-icon-count">{unreadCount}</span>}
              </button>
            </header>
          </>
        )}

        <main id="field-main" className="field-main" ref={mainRef}>
          {children}
        </main>
      </div>

      {!isFullScreen && (
        <nav className="field-bottom-nav" data-testid="field-bottom-nav" aria-label="Field monitoring navigation">
          {navigationButton(destinations[0], true)}
          {navigationButton(destinations[1], true)}
          <button
            type="button"
            className={`field-bottom-add ${addActive ? 'active' : ''}`}
            disabled={addDisabled}
            aria-current={addActive ? 'page' : undefined}
            aria-label={addLabel}
            onClick={activateAdd}
          >
            <Plus aria-hidden="true" />
            <small>Add</small>
          </button>
          {navigationButton(destinations[2], true)}
        </nav>
      )}
    </div>
  )
}

function notificationLabel(unreadCount: number) {
  return unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
}
