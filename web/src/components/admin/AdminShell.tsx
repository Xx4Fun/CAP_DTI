import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { AdminUser } from '../../types/admin'
import {
  Activity,
  ChevronDown,
  ChevronLeft,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  MessageSquare,
  Receipt,
  Scale,
  ScrollText,
  Settings,
  Shield,
  Siren,
  Users,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  AuditPanel, CommunicationsPanel, EmergencyPanel, EstablishmentsAccessPanel, FieldMonitoringPanel,
  LegalDraftPanel, OverviewPanel, ReportReviewPanel, SettingsPanelWrapper, SrpManagementPanel, StoreMonitoringPanel,
} from './AdminPanels'
import { adminApi } from '../../services/adminApi'
import './admin.css'

export type ModuleId =
  | 'overview'
  | 'consumer_reports'
  | 'field_monitoring'
  | 'establishments_access'
  | 'gis_monitoring'
  | 'communications'
  | 'price_regulation'
  | 'legal_actions'
  | 'emergency_protocol'
  | 'audit_trail'
  | 'settings'

interface NavItemConfig {
  id: ModuleId
  icon: LucideIcon
  label: string
}

interface NavSectionConfig {
  title?: string
  items: NavItemConfig[]
}

const navSections: NavSectionConfig[] = [
  {
    items: [
      { id: 'overview', icon: LayoutDashboard, label: 'Dashboard' },
    ],
  },
  {
    title: 'Monitoring & Intake',
    items: [
      { id: 'field_monitoring', icon: Activity, label: 'Field Monitoring' },
      { id: 'consumer_reports', icon: Receipt, label: 'Consumer Reports' },
      { id: 'gis_monitoring', icon: MapPin, label: 'GIS Monitoring' },
    ],
  },
  {
    title: 'Regulation & Legal',
    items: [
      { id: 'price_regulation', icon: Scale, label: 'Price Regulation' },
      { id: 'legal_actions', icon: ScrollText, label: 'Legal Actions' },
      { id: 'emergency_protocol', icon: Siren, label: 'Emergency Protocol' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { id: 'establishments_access', icon: Users, label: 'User Management' },
      { id: 'communications', icon: MessageSquare, label: 'Store Communications' },
      { id: 'audit_trail', icon: Shield, label: 'Audit Trail' },
    ],
  },
]

const panels: Record<ModuleId, { title: string; description: string; component: (props: any) => ReactElement }> = {
  overview: { title: 'Dashboard', description: 'Current Admin workload and declared regulatory context.', component: OverviewPanel },
  consumer_reports: { title: 'Consumer Reports', description: 'Review consumer-submitted formal receipts only. Shelf-tag scans are excluded.', component: ReportReviewPanel },
  field_monitoring: { title: 'Field Monitoring', description: 'Review accepted officer visits and their validation evidence.', component: FieldMonitoringPanel },
  establishments_access: { title: 'User Management', description: 'Manage vendor and DTI Field Monitoring accounts, credentials, and access status.', component: EstablishmentsAccessPanel },
  gis_monitoring: { title: 'GIS Monitoring', description: 'Map registered establishments, compliance findings, and vendor access.', component: StoreMonitoringPanel },
  communications: { title: 'Store Communications', description: 'Review the current availability of DTI-to-store communication workflows.', component: CommunicationsPanel },
  price_regulation: { title: 'Price Regulation', description: 'Preview and append dated SRP versions. Existing versions remain unchanged.', component: SrpManagementPanel },
  legal_actions: { title: 'Legal Actions', description: 'Prepare regulatory notices under the currently configured policy safeguards.', component: LegalDraftPanel },
  emergency_protocol: { title: 'Emergency Protocol', description: 'Record declarations and authoritative Price Freeze or APC sources.', component: EmergencyPanel },
  audit_trail: { title: 'Audit Trail', description: 'Review sensitive Admin actions and regulatory decisions.', component: AuditPanel },
  settings: { title: 'System & Profile Settings', description: 'Configure your officer credentials, alert preferences, regional GIS parameters, and regulatory thresholds.', component: SettingsPanelWrapper },
}

const allowedModules = new Set<ModuleId>(Object.keys(panels) as ModuleId[])
const legacyModuleAliases: Record<string, ModuleId> = {
  reports: 'consumer_reports',
  analytics: 'field_monitoring',
  stores: 'establishments_access',
  store_registration: 'establishments_access',
  store_monitoring: 'gis_monitoring',
  srp: 'price_regulation',
  legal: 'legal_actions',
  emergency: 'emergency_protocol',
  audit: 'audit_trail',
}

function canAccessModule(module: ModuleId, isFieldOfficer: boolean): boolean {
  return !isFieldOfficer || module === 'overview' || module === 'field_monitoring'
}

function readModuleFromUrl(isFieldOfficer: boolean): ModuleId {
  const requested = new URLSearchParams(window.location.search).get('module')
  const resolved = requested ? legacyModuleAliases[requested] ?? requested : 'overview'
  if (!allowedModules.has(resolved as ModuleId)) return 'overview'
  const module = resolved as ModuleId
  return canAccessModule(module, isFieldOfficer) ? module : 'overview'
}

export function AdminShell({ user, onLogout }: { user: AdminUser; onLogout?: () => void }) {
  const [currentUser, setCurrentUser] = useState<AdminUser>(user)
  const isFieldOfficer = currentUser.role === 'field_officer'
  const [activeModule, setActiveModule] = useState<ModuleId>(() => readModuleFromUrl(isFieldOfficer))
  const [isCalamityActive, setIsCalamityActive] = useState<boolean | null>(null)
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false)
  const [isMobileOpen, setIsMobileOpen] = useState<boolean>(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [logoutModalOpen, setLogoutModalOpen] = useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const accountMenuRef = useRef<HTMLDivElement>(null)

  const handleUserUpdate = (updated: Partial<AdminUser>) => {
    setCurrentUser((prev) => ({ ...prev, ...updated }))
  }

  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    heading.current?.focus()
  }, [activeModule])

  useEffect(() => {
    const restoreModule = () => {
      const restored = readModuleFromUrl(isFieldOfficer)
      setActiveModule(restored)
    }
    const handleClickOutside = (event: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setAccountMenuOpen(false)
      }
    }
    const closeMenus = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMobileOpen(false)
        setHelpOpen(false)
        setLogoutModalOpen(false)
        setAccountMenuOpen(false)
      }
    }
    window.addEventListener('popstate', restoreModule)
    window.addEventListener('keydown', closeMenus)
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      window.removeEventListener('popstate', restoreModule)
      window.removeEventListener('keydown', closeMenus)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isFieldOfficer])

  useEffect(() => {
    void adminApi.getEmergencies().then((emergencies) => {
      const hasActive = emergencies.some((e) => e.status === 'active')
      setIsCalamityActive(hasActive || document.body.classList.contains('calamity-mode'))
    }).catch(() => {
      setIsCalamityActive(document.body.classList.contains('calamity-mode') ? true : null)
    })
  }, [])

  const navigateTo = (module: ModuleId) => {
    if (!canAccessModule(module, isFieldOfficer)) return
    setActiveModule(module)
    if (isCollapsed) setIsCollapsed(false)
    const url = new URL(window.location.href)
    url.searchParams.set('module', module)
    window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`)
    setIsMobileOpen(false)
    setAccountMenuOpen(false)
  }

  const Panel = panels[activeModule].component

  if (isFieldOfficer) {
    return <main className="admin-session-boot"><h1>Use the Field Monitoring PWA</h1><p>Field Officer accounts cannot access the DTI Admin portal.</p></main>
  }

  return (
    <div className="admin-shell">
      <a className="skip-link" href="#admin-main">Skip to Admin content</a>

      {/* Section 5: Mobile Overlay Backdrop */}
      {isMobileOpen && (
        <div
          className="mobile-overlay-backdrop"
          onClick={() => setIsMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Section 1 - 4: Sidebar Component */}
      <aside
        className={`admin-sidebar ${isCollapsed ? 'collapsed' : ''} ${isMobileOpen ? 'mobile-open' : ''}`}
        aria-label="DTI Admin Sidebar Navigation"
      >
        {/* Section 1: Header Section */}
        <div className="admin-brand-header">
          <div
            className="brand-header-left"
            onClick={() => { if (isCollapsed) setIsCollapsed(false) }}
            style={{ cursor: isCollapsed ? 'pointer' : 'default' }}
            title={isCollapsed ? 'Expand Sidebar' : undefined}
          >
            <div className="dti-seal-logo" title="Department of Trade and Industry">
              <img src="/branding/dti-logo.svg" alt="Department of Trade and Industry Logo" className="dti-official-logo" />
            </div>
            {!isCollapsed && (
              <div className="brand-text">
                <h2>PRICE-Watch</h2>
                <p>DTI Officer Portal</p>
              </div>
            )}
          </div>
          {!isCollapsed && (
            <button
              type="button"
              className="sidebar-collapse-btn"
              onClick={() => {
                setIsCollapsed(true)
              }}
              title="Collapse Sidebar"
              aria-label="Collapse Sidebar"
            >
              <ChevronLeft size={20} strokeWidth={2.5} />
            </button>
          )}
        </div>

        {/* Section 2: Workflow navigation */}
        <nav aria-label="DTI Admin modules">
          {navSections.map((section, secIdx) => (
            <div className="nav-section" key={section.title || `section-${secIdx}`}>
              {section.title && !isCollapsed && (
                <div className="admin-nav-category-header" role="presentation">
                  <span>{section.title}</span>
                </div>
              )}
              {section.title && isCollapsed && (
                <div className="admin-nav-category-divider" role="presentation" />
              )}
              {section.items.map((item) => {
                const IconComponent = item.icon
                const isActive = activeModule === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`admin-nav-item ${isActive ? 'active' : ''}`}
                    onClick={() => navigateTo(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    title={isCollapsed ? item.label : undefined}
                    aria-label={isCollapsed ? item.label : undefined}
                  >
                    <div className="nav-item-content">
                      <IconComponent size={18} strokeWidth={2.3} aria-hidden="true" />
                      {!isCollapsed && <span>{item.label}</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

      </aside>

      {/* Main Workspace */}
      <section className="admin-workspace">
        {/* Top Header Bar */}
        <header className="admin-top-header">
          <div className="header-left-group">
            <button
              type="button"
              className="mobile-toggle-btn"
              onClick={() => setIsMobileOpen(!isMobileOpen)}
              aria-label="Toggle mobile menu"
            >
              {isMobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>

            <div className="header-titles">
              <h1 ref={heading} tabIndex={-1} className="header-main-title">{panels[activeModule].title}</h1>
            </div>
          </div>

          <div className="header-right-group">
            <div className="market-status-container">
              {isCalamityActive === true ? (
                <span className="market-status-badge calamity">
                  <Siren size={14} aria-hidden="true" /> State of Calamity Active
                </span>
              ) : isCalamityActive === false ? (
                <span className="market-status-badge normal">
                  <Shield size={14} aria-hidden="true" /> Normal Market Protocol
                </span>
              ) : (
                <span className="market-status-badge unavailable">
                  Emergency status unavailable
                </span>
              )}
            </div>

            {/* Officer Account Profile Trigger and Dropdown Menu */}
            <div className="header-account-wrapper" ref={accountMenuRef}>
              <button
                type="button"
                className={`header-account-trigger ${accountMenuOpen ? 'open' : ''}`}
                onClick={() => setAccountMenuOpen((prev) => !prev)}
                aria-expanded={accountMenuOpen}
                aria-haspopup="true"
                aria-label="Officer account profile and options"
              >
                <div className="header-avatar-circle" aria-hidden="true">
                  {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : 'O'}
                </div>
                <div className="header-account-copy">
                  <span className="header-account-name">{currentUser.name || 'DTI Officer'}</span>
                  <span className="header-account-role">
                    {currentUser.role === 'super_admin' ? 'Super Admin' : currentUser.role === 'dti_evaluator' ? 'DTI Evaluator' : 'Officer'}
                  </span>
                </div>
                <ChevronDown size={15} className={`header-account-chevron ${accountMenuOpen ? 'open' : ''}`} aria-hidden="true" />
              </button>

              {accountMenuOpen && (
                <div className="header-account-dropdown" role="menu" aria-label="Account options">
                  <div className="account-dropdown-user-info">
                    <div className="account-dropdown-avatar" aria-hidden="true">
                      {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : 'O'}
                    </div>
                    <div className="account-dropdown-texts">
                      <p className="account-dropdown-name">{currentUser.name || 'DTI Officer'}</p>
                      <p className="account-dropdown-email">{currentUser.email || 'evaluator@dti.gov.ph'}</p>
                      <div className="account-dropdown-badge">
                        <Shield size={11} aria-hidden="true" />
                        <span>{currentUser.role === 'super_admin' ? 'Super Administrator' : 'DTI Price Evaluator'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="account-dropdown-divider" role="separator" />

                  <button
                    type="button"
                    role="menuitem"
                    className="account-dropdown-item"
                    onClick={() => {
                      setAccountMenuOpen(false)
                      navigateTo('settings')
                    }}
                  >
                    <Settings size={16} strokeWidth={2.2} aria-hidden="true" />
                    <span>Settings</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    className="account-dropdown-item"
                    onClick={() => {
                      setAccountMenuOpen(false)
                      setHelpOpen(true)
                    }}
                  >
                    <HelpCircle size={16} strokeWidth={2.2} aria-hidden="true" />
                    <span>Help &amp; Support</span>
                  </button>

                  <div className="account-dropdown-divider" role="separator" />

                  <button
                    type="button"
                    role="menuitem"
                    className="account-dropdown-item account-dropdown-item--danger"
                    onClick={() => {
                      setAccountMenuOpen(false)
                      setLogoutModalOpen(true)
                    }}
                  >
                    <LogOut size={16} strokeWidth={2.2} aria-hidden="true" />
                    <span>Logout</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Panel Content */}
        <main className="admin-panel" id="admin-main">
          <Panel user={currentUser} onUserUpdate={handleUserUpdate} onNavigate={navigateTo} />
        </main>
      </section>

      {/* Help Modal */}
      {helpOpen && (
        <div className="admin-modal-backdrop" onClick={() => setHelpOpen(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <header className="admin-modal-header">
              <div>
                <span className="admin-eyebrow">Regulatory Guidance</span>
                <h2>Help &amp; Operating Manual</h2>
              </div>
              <button type="button" className="admin-icon-button" onClick={() => setHelpOpen(false)} aria-label="Close">
                <X size={19} aria-hidden="true" />
              </button>
            </header>
            <div className="admin-modal-body" style={{ display: 'grid', gap: '1.25rem' }}>
              <div style={{ background: '#eff6ff', padding: '1rem', borderRadius: '10px', border: '1px solid #bfdbfe' }}>
                <h4 style={{ margin: '0 0 0.5rem', color: '#1e3a8a' }}>Regulatory policy status</h4>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#1e40af' }}>
                  Automatic legal deadlines and LOI/SCO dispatch are unavailable until DTI-approved policy rules are configured. Price comparisons are decision support only; an authorized evaluator must verify the applicable source and evidence.
                </p>
              </div>
              <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ margin: '0 0 0.5rem', color: '#0f172a' }}>System Quick Links</h4>
                <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.85rem', color: '#475569' }}>
                  <li><strong>Establishments &amp; Access:</strong> Register new establishments and review access availability.</li>
                  <li><strong>Field Monitoring:</strong> Review temporal price volatility from verified inspections.</li>
                  <li><strong>Consumer Reports:</strong> Inspect citizen receipt evidence and formal findings.</li>
                </ul>
              </div>
              <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ margin: '0 0 0.5rem', color: '#0f172a' }}>Support contact</h4>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                  No authoritative support address is configured in this Admin build. Use your organization’s verified internal directory.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Logout Confirmation Modal */}
      {logoutModalOpen && (
        <div
          className="admin-modal-backdrop"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={() => setLogoutModalOpen(false)}
        >
          <div
            className="admin-modal"
            style={{
              maxWidth: '380px',
              width: '90%',
              margin: '0 auto',
              borderRadius: '24px',
              padding: '2rem 1.75rem',
              background: '#ffffff',
              boxShadow: '0 20px 50px rgba(15, 23, 42, 0.2)',
              border: 'none',
              textAlign: 'center',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '16px',
                background: '#eff6ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.25rem',
              }}
            >
              <LogOut size={26} color="#2563eb" aria-hidden="true" />
            </div>

            <h2
              style={{
                margin: '0 0 0.4rem',
                fontSize: '1.4rem',
                fontWeight: 700,
                color: '#0f172a',
                textAlign: 'center',
              }}
            >
              Log out?
            </h2>

            <p
              style={{
                margin: '0 0 1.75rem',
                fontSize: '0.95rem',
                color: '#64748b',
                lineHeight: 1.4,
                textAlign: 'center',
              }}
            >
              You will be signed out of your current session.
            </p>

            <div style={{ display: 'flex', gap: '0.85rem', width: '100%' }}>
              <button
                type="button"
                className="admin-btn-secondary"
                onClick={() => setLogoutModalOpen(false)}
                style={{
                  flex: 1,
                  padding: '0.75rem 1rem',
                  borderRadius: '12px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#0f172a',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="admin-btn-danger"
                onClick={() => {
                  setLogoutModalOpen(false)
                  onLogout?.()
                }}
                style={{
                  flex: 1,
                  padding: '0.75rem 1rem',
                  borderRadius: '12px',
                  border: 'none',
                  background: '#c81e1e',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                Log Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
