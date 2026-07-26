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

export function AdminShell({ user, onLogout }: { user: AdminUser; onLogout?: () => void }) {
  const isFieldOfficer = user.role === 'field_officer'
  const [activeModule, setActiveModule] = useState<ModuleId>('overview')
  const [isCalamityActive, setIsCalamityActive] = useState<boolean>(false)
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false)
  const [isMobileOpen, setIsMobileOpen] = useState<boolean>(false)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    analytics: true,
    legal: true,
  })

  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    heading.current?.focus()
  }, [activeModule])

  useEffect(() => {
    void adminApi.getEmergencies().then((emergencies) => {
      const hasActive = emergencies.some((e) => e.status === 'active')
      setIsCalamityActive(hasActive || document.body.classList.contains('calamity-mode'))
    }).catch(() => {
      setIsCalamityActive(document.body.classList.contains('calamity-mode'))
    })
  }, [])

  const toggleExpand = (itemId: string) => {
    setExpandedSections((prev) => ({ ...prev, [itemId]: !prev[itemId] }))
  }

  const avatarInitial = user.name ? user.name.charAt(0).toUpperCase() : 'E'

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

        {/* Section 2: User Profile Card */}
        <div className="sidebar-profile-card">
          <div className="sidebar-avatar-circle" title={user.name}>
            {avatarInitial}
          </div>
          {!isCollapsed && (
            <div className="user-card-details">
              <span className="user-card-name">{user.name}</span>
              <span className="user-card-role">{user.role.toUpperCase().replace('_', ' ')}</span>
            </div>
          )}
        </div>

        {/* Section 3: Accordion Dropdown Navigation Items */}
        <nav aria-label="DTI Admin modules">
          {navSections.map((sec) => (
            <div key={sec.title} className="sidebar-nav-section">
              {!isCollapsed && <div className="nav-section-label">{sec.title}</div>}
              {sec.items.map((item) => {
                const IconComponent = item.icon
                const isParentActive = activeModule === item.id || item.subItems?.some((s) => s.id === activeModule)
                const isExpanded = !!expandedSections[item.id]

                return (
                  <div key={item.id} className="nav-group">
                    <button
                      type="button"
                      className={`admin-nav-item ${isParentActive ? 'active' : ''}`}
                      onClick={() => {
                        setActiveModule(item.id)
                        if (item.subItems) {
                          setExpandedSections((prev) => ({ ...prev, [item.id]: true }))
                        }
                        setIsMobileOpen(false)
                      }}
                      aria-current={activeModule === item.id ? 'page' : undefined}
                    >
                      <div className="nav-item-content">
                        <IconComponent size={18} aria-hidden="true" />
                        {!isCollapsed && <span>{item.label}</span>}
                      </div>
                      {!isCollapsed && item.subItems && (
                        <ChevronDown
                          size={16}
                          className={`chevron-icon ${isExpanded ? 'open' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleExpand(item.id)
                          }}
                        />
                      )}
                    </button>

                    {!isCollapsed && item.subItems && isExpanded && (
                      <div className="nav-dropdown-container">
                        {item.subItems.map((sub) => (
                          <button
                            key={sub.id}
                            type="button"
                            className={`admin-nav-sub-item ${activeModule === sub.id ? 'active' : ''}`}
                            onClick={() => {
                              setActiveModule(sub.id)
                              setIsMobileOpen(false)
                            }}
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

        {/* Section 4: Bottom Pinned Logout Button */}
        <div className="admin-user-drawer">
          {onLogout && (
            <button
              type="button"
              onClick={() => {
                setIsMobileOpen(false)
                onLogout()
              }}
              className="logout-btn-sidebar"
              title="Log out of DTI Portal"
            >
              <LogOut size={18} />
              {!isCollapsed && <span>Logout</span>}
            </button>
          )}
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

            <div className="header-home-badge" title="DTI Portal Home">
              <Shield size={20} />
            </div>
            <div className="header-titles">
              <h2 className="header-main-title">{panels[activeModule].title}</h2>
              <span className="header-subtitle">
                San Jose de Buenavista, Antique
              </span>
            </div>
          </div>

          <div className="header-right-group">
            <div className="market-status-container">
              {isCalamityActive ? (
                <span className="market-status-badge calamity">
                  🚨 State of Calamity Active
                </span>
              ) : (
                <span className="market-status-badge normal">
                  🟢 Normal Market Protocol
                </span>
              )}
            </div>

            <button type="button" className="messages-pill-btn" onClick={() => alert('DTI Regulatory Notification Queue')}>
              💬 <span>Messages</span>
            </button>

            <div className="header-avatar-badge" title={`${user.name} (${user.role})`}>
              <span>{avatarInitial}</span>
              <span className="avatar-status-dot" title="Online"></span>
            </div>
          </div>
        </header>

        {/* Page Header Sub-strip */}
        <div className="admin-page-header">
          <div>
            <h1 ref={heading} tabIndex={-1}>{panels[activeModule].title}</h1>
            <p>{panels[activeModule].description}</p>
          </div>
          <div className="provenance-strip">
            Authenticated | {user.role.replace('_', ' ')} | DTI Admin
          </div>
        </div>

        {/* Main Panel Content */}
        <main className="admin-panel" id="admin-main">
          <Panel onNavigate={setActiveModule} />
        </main>
      </section>
    </div>
  )
}
