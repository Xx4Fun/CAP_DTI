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
  LogOut,
  LockKeyhole,
  UserRound,
  Shield,
  Menu,
  X,
} from 'lucide-react'
import {
  AnalyticsPanel, AuditPanel, EmergencyPanel, LegalDraftPanel, OverviewPanel,
  ReportReviewPanel, SrpManagementPanel, StoreManagementPanel,
} from './AdminPanels'
import { adminApi } from '../../services/adminApi'
import './admin.css'

export type CategoryId = 'overview' | 'stores' | 'price_regulation' | 'reports' | 'legal_engine' | 'emergency'
export type ModuleId = 'overview' | 'stores' | 'srp' | 'reports' | 'analytics' | 'emergency' | 'legal' | 'audit'

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
      { id: 'stores', icon: MapPin, label: 'GIS Store Registry', categoryName: 'MAIN MENU' },
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
  stores: { title: 'GIS Store Management', description: 'Register, verify, publish, and invite vendors without exposing private ownership data.', component: StoreManagementPanel },
  srp: { title: 'Temporal SRP Records', description: 'Preview and append dated SRP versions. Existing versions remain unchanged.', component: SrpManagementPanel },
  reports: { title: 'Formal receipt review', description: 'Review consumer-submitted formal receipts only. Shelf-tag scans are excluded.', component: ReportReviewPanel },
  analytics: { title: 'Four-Week Price Analytics', description: 'Validated receipts and verified field inspections against date-correct SRP values.', component: AnalyticsPanel },
  emergency: { title: 'State of Calamity Controls', description: 'Record declarations and authoritative Price Freeze or APC sources.', component: EmergencyPanel },
  legal: { title: 'Legal Notice Drafts', description: 'Official dispatch remains blocked until an approved DTI policy is configured.', component: LegalDraftPanel },
  audit: { title: 'Read-Only Audit Trail', description: 'Review sensitive Admin actions and regulatory decisions.', component: AuditPanel },
}

const allowedModules = new Set<ModuleId>(Object.keys(panels) as ModuleId[])

function readModuleFromUrl(isFieldOfficer: boolean): ModuleId {
  const requested = new URLSearchParams(window.location.search).get('module') as ModuleId | null
  if (!requested || !allowedModules.has(requested)) return 'overview'
  if (isFieldOfficer && requested !== 'overview' && requested !== 'analytics') return 'overview'
  return requested
}

function parentCategoryFor(module: ModuleId): string | null {
  if (module === 'analytics' || module === 'srp') return 'analytics'
  if (module === 'legal' || module === 'audit') return 'legal'
  return null
}

export function AdminShell({ user, onLogout }: { user: AdminUser; onLogout?: () => void }) {
  const isFieldOfficer = user.role === 'field_officer'
  const [activeModule, setActiveModule] = useState<ModuleId>(() => readModuleFromUrl(isFieldOfficer))
  const [isCalamityActive, setIsCalamityActive] = useState<boolean | null>(null)
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false)
  const [isMobileOpen, setIsMobileOpen] = useState<boolean>(false)
  const [openCategory, setOpenCategory] = useState<string | null>(() => parentCategoryFor(readModuleFromUrl(isFieldOfficer)))
  const [accountOpen, setAccountOpen] = useState(false)

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
          <div className="brand-header-left">
            <div className="dti-seal-logo" title="Department of Trade and Industry">
              <img src="/dti-logo.svg" alt="Department of Trade and Industry Logo" className="dti-official-logo" />
            </div>
            {!isCollapsed && (
              <div className="brand-text">
                <h2>PRICE-Watch</h2>
                <p>DTI Officer Portal</p>
              </div>
            )}
          </div>
          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {isCollapsed ? '›' : '‹'}
          </button>
        </div>



        {/* Section 3: Accordion Dropdown Navigation Items */}
        <nav aria-label="DTI Admin modules">
          {navSections.map((sec) => (
            <div key={sec.title} className="sidebar-nav-section">
              {!isCollapsed && <div className="nav-section-label">{sec.title}</div>}
              {sec.items.map((item) => {
                const IconComponent = item.icon
                const isParentActive = activeModule === item.id || item.subItems?.some((s) => s.id === activeModule)
                const isOpen = openCategory === item.id

                return (
                  <div key={item.id} className="nav-group">
                    <button
                      type="button"
                      className={`admin-nav-item ${isParentActive ? 'active' : ''}`}
                      onClick={() => {
                        if (item.subItems) {
                          toggleCategory(item.id)
                        } else {
                          navigateTo(item.id)
                        }
                      }}
                      aria-current={activeModule === item.id ? 'page' : undefined}
                      aria-expanded={item.subItems ? isOpen : undefined}
                      aria-controls={item.subItems ? `nav-group-${item.id}` : undefined}
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
              <span className="header-subtitle">
                {panels[activeModule].description}
              </span>
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

            <div className="header-account">
              <button
                type="button"
                className="header-account-button"
                aria-label={`${user.name} account`}
                aria-expanded={accountOpen}
                aria-controls="admin-account-menu"
                onClick={() => setAccountOpen((open) => !open)}
              >
                <span className={`header-avatar-badge avatar-badge-${user.role}`} aria-hidden="true">
                  {avatarInitial}
                  <span className="avatar-status-dot pulse" title="Session Active" aria-hidden="true" />
                </span>
                <span className="header-account-copy">
                  <strong>{user.name}</strong>
                  <span className="header-account-sub">
                    <small>{user.role.replace('_', ' ')}</small>
                    <span className="session-status-text">Session Active</span>
                  </span>
                </span>
                <ChevronDown size={16} className={`account-dropdown-arrow ${accountOpen ? 'open' : ''}`} aria-hidden="true" />
              </button>
              {accountOpen && (
                <div className="header-account-menu" id="admin-account-menu" role="menu">
                  <button type="button" onClick={onLogout}>
                    <LockKeyhole size={17} aria-hidden="true" /> Lock Session
                  </button>
                  <button type="button" onClick={onLogout}>
                    <LogOut size={17} aria-hidden="true" /> Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Panel Content */}
        <main className="admin-panel" id="admin-main">
          <Panel onNavigate={navigateTo} />
        </main>
      </section>
    </div>
  )
}
