import { useEffect, useRef, useState } from 'react'
import type { ReactElement, ComponentType } from 'react'
import type { AdminUser } from '../../types/admin'
import {
  LayoutDashboard,
  MapPin,
  TrendingUp,
  Receipt,
  Scale,
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
import {
  AnalyticsPanel, AuditPanel, EmergencyPanel, LegalDraftPanel, OverviewPanel,
  ReportReviewPanel, SettingsPanelWrapper, SrpManagementPanel, StoreMonitoringPanel, StoreRegistrationPanel,
} from './AdminPanels'
import { adminApi } from '../../services/adminApi'
import './admin.css'

export type CategoryId = 'overview' | 'stores' | 'price_regulation' | 'reports' | 'legal_engine' | 'emergency'
export type ModuleId = 'overview' | 'stores' | 'store_registration' | 'store_monitoring' | 'srp' | 'reports' | 'analytics' | 'emergency' | 'legal' | 'audit' | 'settings'

interface NavSubItem {
  id: ModuleId
  label: string
}

interface NavItemConfig {
  id: ModuleId
  icon: ComponentType<{ className?: string; size?: number }>
  label: string
  categoryName: string
  subItems?: NavSubItem[]
}

interface NavSectionConfig {
  title: string
  items: NavItemConfig[]
}

const navSectionsConfig: NavSectionConfig[] = [
  {
    title: 'MAIN MENU',
    items: [
      { id: 'overview', icon: LayoutDashboard, label: 'Dashboard Overview', categoryName: 'MAIN MENU' },
      {
        id: 'stores',
        icon: MapPin,
        label: 'Store Management',
        categoryName: 'MAIN MENU',
        subItems: [
          { id: 'store_registration', label: 'Store Registration' },
          { id: 'store_monitoring', label: 'Store Monitoring' },
        ],
      },
    ],
  },
  {
    title: 'REGULATORY ENGINE',
    items: [
      {
        id: 'analytics',
        icon: TrendingUp,
        label: 'Price Regulation',
        categoryName: 'REGULATORY ENGINE',
        subItems: [
          { id: 'analytics', label: 'Four-Week Analytics' },
          { id: 'srp', label: 'SRP Bulletins' },
        ],
      },
      { id: 'reports', icon: Receipt, label: 'Consumer OCR Queue', categoryName: 'REGULATORY ENGINE' },
      {
        id: 'legal',
        icon: Scale,
        label: 'Legal Engine',
        categoryName: 'REGULATORY ENGINE',
        subItems: [
          { id: 'legal', label: 'Notice Drafts' },
          { id: 'audit', label: 'Audit Trail' },
        ],
      },
    ],
  },
  {
    title: 'SYSTEM',
    items: [
      { id: 'emergency', icon: Siren, label: 'Emergency Protocol', categoryName: 'SYSTEM' },
    ],
  },
]

const panels: Record<ModuleId, { title: string; description: string; component: (props: any) => ReactElement }> = {
  overview: { title: 'Regulatory Overview', description: 'Current Admin workload and declared regulatory context.', component: OverviewPanel },
  stores: { title: 'GIS Store Monitoring', description: 'GIS store mapping, verification state, compliance monitoring, and vendor invitation portal.', component: StoreMonitoringPanel },
  store_registration: { title: 'Store Registration', description: 'Onboard and register a new commercial establishment into the DTI GIS database.', component: StoreRegistrationPanel },
  store_monitoring: { title: 'GIS Store Monitoring', description: 'GIS store mapping, verification state, compliance monitoring, and vendor invitation portal.', component: StoreMonitoringPanel },
  srp: { title: 'Temporal SRP Records', description: 'Preview and append dated SRP versions. Existing versions remain unchanged.', component: SrpManagementPanel },
  reports: { title: 'Formal receipt review', description: 'Review consumer-submitted formal receipts only. Shelf-tag scans are excluded.', component: ReportReviewPanel },
  analytics: { title: 'Four-Week Price Analytics', description: 'Validated receipts and verified field inspections against date-correct SRP values.', component: AnalyticsPanel },
  emergency: { title: 'State of Calamity Controls', description: 'Record declarations and authoritative Price Freeze or APC sources.', component: EmergencyPanel },
  legal: { title: 'Legal Notice Drafts', description: 'Official dispatch remains blocked until an approved DTI policy is configured.', component: LegalDraftPanel },
  audit: { title: 'Read-Only Audit Trail', description: 'Review sensitive Admin actions and regulatory decisions.', component: AuditPanel },
  settings: { title: 'System & Profile Settings', description: 'Configure your officer credentials, alert preferences, regional GIS parameters, and regulatory thresholds.', component: SettingsPanelWrapper },
}

const allowedModules = new Set<ModuleId>(Object.keys(panels) as ModuleId[])

function readModuleFromUrl(isFieldOfficer: boolean): ModuleId {
  const requested = new URLSearchParams(window.location.search).get('module') as ModuleId | null
  if (!requested || !allowedModules.has(requested)) return 'overview'
  if (isFieldOfficer && requested !== 'overview' && requested !== 'analytics') return 'overview'
  return requested
}

function parentCategoryFor(module: ModuleId): string | null {
  if (module === 'stores' || module === 'store_registration' || module === 'store_monitoring') return 'stores'
  if (module === 'analytics' || module === 'srp') return 'analytics'
  if (module === 'legal' || module === 'audit') return 'legal'
  return null
}

export function AdminShell({ user, onLogout }: { user: AdminUser; onLogout?: () => void }) {
  const [currentUser, setCurrentUser] = useState<AdminUser>(user)
  const isFieldOfficer = currentUser.role === 'field_officer'
  const [activeModule, setActiveModule] = useState<ModuleId>(() => readModuleFromUrl(isFieldOfficer))
  const [isCalamityActive, setIsCalamityActive] = useState<boolean | null>(null)
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false)
  const [isMobileOpen, setIsMobileOpen] = useState<boolean>(false)
  const [openCategory, setOpenCategory] = useState<string | null>(() => parentCategoryFor(readModuleFromUrl(isFieldOfficer)))
  const [accountOpen, setAccountOpen] = useState(false)
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
      setOpenCategory(parentCategoryFor(restored))
    }
    const closeMenus = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAccountOpen(false)
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

  const toggleCategory = (categoryId: string) => {
    setOpenCategory((prev) => (prev === categoryId ? null : categoryId))
  }

  const navigateTo = (module: ModuleId) => {
    if (isFieldOfficer && module !== 'overview' && module !== 'analytics') return
    setActiveModule(module)
    if (isCollapsed) setIsCollapsed(false)
    const url = new URL(window.location.href)
    url.searchParams.set('module', module)
    window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`)
    setIsMobileOpen(false)
  }

  const avatarInitial = user.role === 'super_admin' ? 'A' : user.role === 'field_officer' ? 'F' : 'E'

  // Filter sections for field officer
  const navSections = navSectionsConfig.map((sec) => ({
    ...sec,
    items: sec.items.filter((item) => {
      if (!isFieldOfficer) return true
      return item.id === 'overview' || item.id === 'analytics'
    }),
  })).filter((sec) => sec.items.length > 0)

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
              onClick={() => setIsCollapsed(true)}
              title="Collapse Sidebar"
              aria-label="Collapse Sidebar"
            >
              <ChevronLeft size={20} strokeWidth={2.5} />
            </button>
          )}
        </div>

        {/* Section 2: Navigation Items (Clean Flat List without Section Headings) */}
        <nav aria-label="DTI Admin modules">
          {navSections.flatMap((sec) => sec.items).map((item) => {
            const IconComponent = item.icon
            const isParentActive = activeModule === item.id || item.subItems?.some((s) => s.id === activeModule)
            const isOpen = openCategory === item.id

            return (
              <div key={item.id} className="nav-group">
                <button
                  type="button"
                  className={`admin-nav-item ${isParentActive ? 'active' : ''}`}
                  onClick={() => {
                    if (isCollapsed) setIsCollapsed(false)
                    if (item.subItems) {
                      toggleCategory(item.id)
                    } else {
                      navigateTo(item.id)
                    }
                  }}
                  aria-current={activeModule === item.id ? 'page' : undefined}
                  aria-expanded={item.subItems ? isOpen : undefined}
                  aria-controls={item.subItems ? `nav-group-${item.id}` : undefined}
                  title={isCollapsed ? item.label : undefined}
                >
                  <div className="nav-item-content">
                    <IconComponent size={18} aria-hidden="true" />
                    {!isCollapsed && <span>{item.label}</span>}
                  </div>
                  {!isCollapsed && item.subItems && (
                    <ChevronDown
                      size={16}
                      className={`chevron-icon ${isOpen ? 'open' : ''}`}
                    />
                  )}
                </button>

                {!isCollapsed && item.subItems && (
                  <div
                    id={`nav-group-${item.id}`}
                    className={`nav-dropdown-container ${isOpen ? 'open' : ''}`}
                    aria-hidden={!isOpen}
                  >
                    {item.subItems.map((sub) => (
                      <button
                        key={sub.id}
                        type="button"
                        className={`admin-nav-sub-item ${activeModule === sub.id ? 'active' : ''}`}
                        onClick={() => {
                          navigateTo(sub.id)
                        }}
                        tabIndex={isOpen ? 0 : -1}
                      >
                        {sub.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* Section 3: Bottom Section (Settings, Help, Account Showcase) */}
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
              <Settings size={18} aria-hidden="true" />
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
              <HelpCircle size={18} aria-hidden="true" />
              {!isCollapsed && <span>Help &amp; Support</span>}
            </div>
          </button>

          <div className="sidebar-account-wrapper">
            <button
              type="button"
              className="sidebar-profile-card"
              aria-label={`${user.name} account`}
              aria-expanded={accountOpen}
              aria-controls="admin-account-menu"
              onClick={() => {
                if (isCollapsed) setIsCollapsed(false)
                setAccountOpen((open) => !open)
              }}
            >
              <div className="profile-icon-container">
                <span className={`header-avatar-badge avatar-badge-${user.role}`} aria-hidden="true">
                  {avatarInitial}
                </span>
              </div>
              {!isCollapsed && (
                <div className="user-card-details">
                  <span className="user-card-title">DTI Admin</span>
                  <span className="user-card-email">{user.email}</span>
                </div>
              )}
            </button>

            {accountOpen && (
              <div className="sidebar-account-menu" id="admin-account-menu" role="menu">
                <button
                  type="button"
                  className="account-menu-logout-btn"
                  onClick={() => {
                    setAccountOpen(false)
                    setLogoutModalOpen(true)
                  }}
                >
                  <LogOut size={17} aria-hidden="true" /> Logout
                </button>
              </div>
            )}
          </div>
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
                  <li><strong>Store Management:</strong> Register new establishments and monitor spatial GIS store compliance.</li>
                  <li><strong>Price Regulation:</strong> Review 4-week temporal price volatility vs SRP.</li>
                  <li><strong>Consumer OCR Queue:</strong> Inspect citizen receipt scans and validated price tags.</li>
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

