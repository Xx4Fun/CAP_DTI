import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { AdminUser } from '../../types/admin'
import {
  Building2,
  LayoutDashboard,
  MessageSquare,
  TrendingUp,
  Receipt,
  Scale,
  ScrollText,
  Siren,
  ChevronDown,
  ChevronLeft,
  LogOut,
  Shield,
  Menu,
  X,
  Settings,
  HelpCircle,
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

type NavGroupId = 'reports_monitoring' | 'establishments_engagement' | 'regulation_enforcement'

interface NavGroupConfig {
  id: NavGroupId
  icon: LucideIcon
  label: string
  items: Pick<NavItemConfig, 'id' | 'label'>[]
}

const dashboardNavItem: NavItemConfig = { id: 'overview', icon: LayoutDashboard, label: 'Dashboard' }
const communicationsNavItem: NavItemConfig = { id: 'communications', icon: MessageSquare, label: 'Communications' }
const auditNavItem: NavItemConfig = { id: 'audit_trail', icon: ScrollText, label: 'Audit Trail' }
const fieldOfficerNavItems: NavItemConfig[] = [
  dashboardNavItem,
  { id: 'field_monitoring', icon: TrendingUp, label: 'Field Monitoring' },
]

const navGroups: NavGroupConfig[] = [
  {
    id: 'reports_monitoring',
    icon: Receipt,
    label: 'Monitoring',
    items: [
      { id: 'consumer_reports', label: 'Consumer Reports' },
      { id: 'field_monitoring', label: 'Field Monitoring' },
    ],
  },
  {
    id: 'establishments_engagement',
    icon: Building2,
    label: 'Establishments',
    items: [
      { id: 'establishments_access', label: 'User Management' },
      { id: 'gis_monitoring', label: 'GIS Monitoring' },
    ],
  },
  {
    id: 'regulation_enforcement',
    icon: Scale,
    label: 'Enforcement',
    items: [
      { id: 'price_regulation', label: 'Price Regulation' },
      { id: 'legal_actions', label: 'Legal Actions' },
      { id: 'emergency_protocol', label: 'Emergency Protocol' },
    ],
  },
]

const parentGroupByModule = new Map<ModuleId, NavGroupId>(
  navGroups.flatMap((group) => group.items.map((item) => [item.id, group.id] as const)),
)

function parentGroupForModule(module: ModuleId): NavGroupId | null {
  return parentGroupByModule.get(module) ?? null
}

const panels: Record<ModuleId, { title: string; description: string; component: (props: any) => ReactElement }> = {
  overview: { title: 'Dashboard', description: 'Current Admin workload and declared regulatory context.', component: OverviewPanel },
  consumer_reports: { title: 'Consumer Reports', description: 'Review consumer-submitted formal receipts only. Shelf-tag scans are excluded.', component: ReportReviewPanel },
  field_monitoring: { title: 'Field Monitoring', description: 'Observe automatically accepted officer visits, evidence status, and verified price trends.', component: FieldMonitoringPanel },
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
  const [openGroup, setOpenGroup] = useState<NavGroupId | null>(() => {
    if (isFieldOfficer) return null
    return parentGroupForModule(readModuleFromUrl(false))
  })
  const [isCalamityActive, setIsCalamityActive] = useState<boolean | null>(null)
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false)
  const [isMobileOpen, setIsMobileOpen] = useState<boolean>(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [logoutModalOpen, setLogoutModalOpen] = useState(false)

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
      setOpenGroup(isFieldOfficer ? null : parentGroupForModule(restored))
    }
    const closeMenus = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMobileOpen(false)
        setHelpOpen(false)
        setLogoutModalOpen(false)
      }
    }
    window.addEventListener('popstate', restoreModule)
    window.addEventListener('keydown', closeMenus)
    return () => {
      window.removeEventListener('popstate', restoreModule)
      window.removeEventListener('keydown', closeMenus)
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
    setOpenGroup(isFieldOfficer ? null : parentGroupForModule(module))
    if (isCollapsed) setIsCollapsed(false)
    const url = new URL(window.location.href)
    url.searchParams.set('module', module)
    window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`)
    setIsMobileOpen(false)
  }

  const toggleGroup = (group: NavGroupId) => {
    if (isCollapsed) {
      setIsCollapsed(false)
      setOpenGroup(group)
      return
    }
    setOpenGroup((current) => current === group ? null : group)
  }

  const Panel = panels[activeModule].component

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
                setOpenGroup(null)
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
          <div className="nav-section">
            {(isFieldOfficer ? fieldOfficerNavItems : [dashboardNavItem]).map((item) => {
                const IconComponent = item.icon
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`admin-nav-item ${activeModule === item.id ? 'active' : ''}`}
                    onClick={() => navigateTo(item.id)}
                    aria-current={activeModule === item.id ? 'page' : undefined}
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

            {!isFieldOfficer && navGroups.map((group) => {
              const IconComponent = group.icon
              const isOpen = openGroup === group.id
              const hasActiveChild = group.items.some((item) => item.id === activeModule)
              const childListId = `admin-nav-group-${group.id}`

              return (
                <div className="nav-group" key={group.id}>
                  <button
                    type="button"
                    className={`admin-nav-item admin-nav-parent ${hasActiveChild ? 'active' : ''}`}
                    onClick={() => toggleGroup(group.id)}
                    aria-expanded={isOpen}
                    aria-controls={childListId}
                    title={isCollapsed ? group.label : undefined}
                    aria-label={isCollapsed ? group.label : undefined}
                  >
                    <div className="nav-item-content">
                      <IconComponent size={18} strokeWidth={2.3} aria-hidden="true" />
                      {!isCollapsed && <span>{group.label}</span>}
                    </div>
                    {!isCollapsed && <ChevronDown className={`nav-group-chevron ${isOpen ? 'open' : ''}`} size={16} strokeWidth={2.3} aria-hidden="true" />}
                  </button>
                  {isOpen && (
                    <div className="nav-group-children" id={childListId}>
                      {group.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`admin-nav-child ${activeModule === item.id ? 'active' : ''}`}
                          onClick={() => navigateTo(item.id)}
                          aria-current={activeModule === item.id ? 'page' : undefined}
                        >
                          <span>{item.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            {!isFieldOfficer && (() => {
              const IconComponent = communicationsNavItem.icon
              return (
                <button
                  type="button"
                  className={`admin-nav-item ${activeModule === communicationsNavItem.id ? 'active' : ''}`}
                  onClick={() => navigateTo(communicationsNavItem.id)}
                  aria-current={activeModule === communicationsNavItem.id ? 'page' : undefined}
                  title={isCollapsed ? communicationsNavItem.label : undefined}
                  aria-label={isCollapsed ? communicationsNavItem.label : undefined}
                >
                  <div className="nav-item-content">
                    <IconComponent size={18} strokeWidth={2.3} aria-hidden="true" />
                    {!isCollapsed && <span>{communicationsNavItem.label}</span>}
                  </div>
                </button>
              )
            })()}

            {!isFieldOfficer && (() => {
              const IconComponent = auditNavItem.icon
              return (
                <button
                  type="button"
                  className={`admin-nav-item ${activeModule === auditNavItem.id ? 'active' : ''}`}
                  onClick={() => navigateTo(auditNavItem.id)}
                  aria-current={activeModule === auditNavItem.id ? 'page' : undefined}
                  title={isCollapsed ? auditNavItem.label : undefined}
                  aria-label={isCollapsed ? auditNavItem.label : undefined}
                >
                  <div className="nav-item-content">
                    <IconComponent size={18} strokeWidth={2.3} aria-hidden="true" />
                    {!isCollapsed && <span>{auditNavItem.label}</span>}
                  </div>
                </button>
              )
            })()}
          </div>
        </nav>

        {/* Section 3: Bottom Section (Settings, Help, Logout) */}
        <div className="sidebar-section-divider" role="separator" />
        <div className="admin-sidebar-bottom">
          <button
            type="button"
            className={`admin-nav-item ${activeModule === 'settings' ? 'active' : ''}`}
            onClick={() => {
              navigateTo('settings')
            }}
            title="Settings"
          >
            <div className="nav-item-content">
              <Settings size={18} strokeWidth={2.3} aria-hidden="true" />
              {!isCollapsed && <span>Settings</span>}
            </div>
          </button>

          <button
            type="button"
            className="admin-nav-item"
            onClick={() => {
              if (isCollapsed) setIsCollapsed(false)
              setHelpOpen(true)
            }}
            title="Help & Support"
          >
            <div className="nav-item-content">
              <HelpCircle size={18} strokeWidth={2.3} aria-hidden="true" />
              {!isCollapsed && <span>Help &amp; Support</span>}
            </div>
          </button>

          <button
            type="button"
            className="admin-nav-item admin-nav-logout"
            onClick={() => setLogoutModalOpen(true)}
            title={isCollapsed ? 'Logout' : undefined}
            aria-label="Logout"
          >
            <div className="nav-item-content">
              <LogOut size={18} strokeWidth={2.3} aria-hidden="true" />
              {!isCollapsed && <span>Logout</span>}
            </div>
          </button>
        </div>

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
                <h4 style={{ margin: '0 0 0.5rem', color: '#1e3a8a' }}>R.A. 7581 — Philippine Price Act Enforcement</h4>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#1e40af' }}>
                  Normal Market: 10% allowance above SRP baseline. Trigger Letter of Inquiry (LOI) with 48h expiration for initial offense.<br />
                  Emergency/State of Calamity: Zero-tolerance APC policy. Immediate Show Cause Order (SCO) dispatch.
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
                <h4 style={{ margin: '0 0 0.5rem', color: '#0f172a' }}>DTI Antique Support Desk</h4>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                  Provincial Office: San Jose de Buenavista, Antique | Email: antique@dti.gov.ph
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
