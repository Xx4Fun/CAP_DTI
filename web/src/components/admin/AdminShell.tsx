import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { AdminUser } from '../../types/admin'
import {
  AnalyticsPanel, AuditPanel, EmergencyPanel, LegalDraftPanel, OverviewPanel,
  ReportReviewPanel, SrpManagementPanel, StoreManagementPanel,
} from './AdminPanels'
import { adminApi } from '../../services/adminApi'
import './admin.css'

export type CategoryId = 'overview' | 'stores' | 'price_regulation' | 'reports' | 'legal_engine' | 'emergency'
export type ModuleId = 'overview' | 'stores' | 'srp' | 'reports' | 'analytics' | 'emergency' | 'legal' | 'audit'

interface NavCategory {
  id: CategoryId
  icon: string
  label: string
  description: string
  defaultModule: ModuleId
  modules: Array<{ id: ModuleId; label: string }>
}

const allCategories: NavCategory[] = [
  {
    id: 'overview',
    icon: '📊',
    label: 'Overview',
    description: 'Real-time overview of stores, pending reports, and emergency declarations.',
    defaultModule: 'overview',
    modules: [{ id: 'overview', label: 'Dashboard Metrics' }],
  },
  {
    id: 'stores',
    icon: '📍',
    label: 'GIS & Establishments',
    description: 'Register, verify, publish, and invite commercial establishments with interactive mapping.',
    defaultModule: 'stores',
    modules: [{ id: 'stores', label: 'Store Management & Map' }],
  },
  {
    id: 'price_regulation',
    icon: '📈',
    label: 'Price Regulation',
    description: 'Four-week temporal volatility graphs and historical SRP version bulletins.',
    defaultModule: 'analytics',
    modules: [
      { id: 'analytics', label: '4-Week Volatility' },
      { id: 'srp', label: 'SRP Bulletins' },
    ],
  },
  {
    id: 'reports',
    icon: '🧾',
    label: 'Consumer OCR Queue',
    description: 'Audit consumer-submitted receipt scans, OCR extractions, and private vault evidence.',
    defaultModule: 'reports',
    modules: [{ id: 'reports', label: 'Receipt Review Queue' }],
  },
  {
    id: 'legal_engine',
    icon: '⚖️',
    label: 'Legal Engine',
    description: 'LOI & SCO notice dispatch rules and immutable regulatory audit trail.',
    defaultModule: 'legal',
    modules: [
      { id: 'legal', label: 'Notice Drafts' },
      { id: 'audit', label: 'Audit Trail' },
    ],
  },
  {
    id: 'emergency',
    icon: '🚨',
    label: 'Emergency Protocol',
    description: 'State of Calamity declarations and authoritative Price Freeze / APC controls.',
    defaultModule: 'emergency',
    modules: [{ id: 'emergency', label: 'Calamity Controls' }],
  },
]

const panels: Record<ModuleId, { title: string; description: string; component: () => ReactElement }> = {
  overview: { title: 'Regulatory Overview', description: 'Current Admin workload and declared regulatory context.', component: OverviewPanel },
  stores: { title: 'GIS Store Management', description: 'Register, verify, publish, and invite vendors without exposing private ownership data.', component: StoreManagementPanel },
  srp: { title: 'Temporal SRP Records', description: 'Preview and append dated SRP versions. Existing versions remain unchanged.', component: SrpManagementPanel },
  reports: { title: 'Formal Receipt Review', description: 'Review consumer-submitted formal receipts only. Shelf-tag scans are excluded.', component: ReportReviewPanel },
  analytics: { title: 'Four-Week Price Analytics', description: 'Validated receipts and verified field inspections against date-correct SRP values.', component: AnalyticsPanel },
  emergency: { title: 'State of Calamity Controls', description: 'Record declarations and authoritative Price Freeze or APC sources.', component: EmergencyPanel },
  legal: { title: 'Legal Notice Drafts', description: 'Official dispatch remains blocked until an approved DTI policy is configured.', component: LegalDraftPanel },
  audit: { title: 'Read-Only Audit Trail', description: 'Review sensitive Admin actions and regulatory decisions.', component: AuditPanel },
}

export function AdminShell({ user, onLogout }: { user: AdminUser; onLogout?: () => void }) {
  const isFieldOfficer = user.role === 'field_officer'
  const categories = isFieldOfficer
    ? allCategories.filter((c) => c.id === 'overview' || c.id === 'price_regulation')
    : allCategories

  const [activeCategory, setActiveCategory] = useState<CategoryId>('overview')
  const [activeModule, setActiveModule] = useState<ModuleId>('overview')
  const [isCalamityActive, setIsCalamityActive] = useState<boolean>(false)

  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    heading.current?.focus()
  }, [activeModule])

  useEffect(() => {
    // Check if any emergency is currently active or calamity mode is set
    void adminApi.getEmergencies().then((emergencies) => {
      const hasActive = emergencies.some((e) => e.status === 'active')
      setIsCalamityActive(hasActive || document.body.classList.contains('calamity-mode'))
    }).catch(() => {
      setIsCalamityActive(document.body.classList.contains('calamity-mode'))
    })
  }, [])

  const currentCategory = categories.find((c) => c.id === activeCategory) || categories[0]
  const Panel = panels[activeModule].component

  const handleCategoryClick = (cat: NavCategory) => {
    setActiveCategory(cat.id)
    setActiveModule(cat.defaultModule)
  }

  return (
    <div className="admin-shell">
      <a className="skip-link" href="#admin-main">Skip to Admin content</a>

      {/* Fixed 260px Left Sidebar */}
      <aside className="admin-sidebar" aria-label="DTI Admin Sidebar Navigation">
        <div className="admin-brand-header">
          <div className="dti-seal" title="Department of Trade and Industry">DTI</div>
          <div className="brand-text">
            <h2>PRICE-Watch</h2>
            <p>Antique Office</p>
          </div>
        </div>

        <nav aria-label="Categorized Admin Modules">
          {categories.map((cat) => {
            const isActive = activeCategory === cat.id
            return (
              <button
                key={cat.id}
                className={`admin-nav-item ${isActive ? 'active' : ''}`}
                onClick={() => handleCategoryClick(cat)}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className="admin-nav-icon">{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="admin-user-drawer">
          <div className="user-drawer-info">
            <span className="user-drawer-name">{user.name}</span>
            <span className="user-drawer-role">{user.role.toUpperCase().replace('_', ' ')}</span>
          </div>
          {onLogout && (
            <button type="button" onClick={onLogout} className="logout-btn-sidebar">
              🚪 Logout
            </button>
          )}
        </div>
      </aside>

      {/* Main Workspace */}
      <section className="admin-workspace">
        {/* Top Header */}
        <header className="admin-top-header">
          <div className="admin-breadcrumbs">
            <span>DTI Antique</span>
            <span>/</span>
            <span>{currentCategory.label}</span>
            {currentCategory.modules.length > 1 && (
              <>
                <span>/</span>
                <span className="current">{panels[activeModule].title}</span>
              </>
            )}
          </div>

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
        </header>

        {/* Subnav Tabs for categories with multiple modules */}
        {currentCategory.modules.length > 1 && (
          <div className="subnav-tabs" role="tablist">
            {currentCategory.modules.map((m) => (
              <button
                key={m.id}
                role="tab"
                aria-selected={activeModule === m.id}
                className={`subnav-tab ${activeModule === m.id ? 'active' : ''}`}
                onClick={() => setActiveModule(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}

        {/* Page Header */}
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
          <Panel />
        </main>
      </section>
    </div>
  )
}
