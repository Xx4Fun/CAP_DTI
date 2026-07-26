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

interface ModuleNav {
  id: ModuleId
  icon: string
  label: string
  categoryName: string
}

const allModules: ModuleNav[] = [
  { id: 'overview', icon: '📊', label: 'Overview', categoryName: 'Overview' },
  { id: 'stores', icon: '📍', label: 'Stores', categoryName: 'GIS & Establishments' },
  { id: 'srp', icon: '📋', label: 'SRP', categoryName: 'Price Regulation' },
  { id: 'reports', icon: '🧾', label: 'Receipt review', categoryName: 'Consumer OCR Queue' },
  { id: 'analytics', icon: '📈', label: 'Analytics', categoryName: 'Price Regulation' },
  { id: 'emergency', icon: '🚨', label: 'Emergency', categoryName: 'Emergency Protocol' },
  { id: 'legal', icon: '⚖️', label: 'Notice drafts', categoryName: 'Legal Engine' },
  { id: 'audit', icon: '🔒', label: 'Audit', categoryName: 'Legal Engine' },
]

const panels: Record<ModuleId, { title: string; description: string; component: () => ReactElement }> = {
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
  const navModules = isFieldOfficer
    ? allModules.filter((m) => m.id === 'overview' || m.id === 'analytics')
    : allModules

  const [activeModule, setActiveModule] = useState<ModuleId>('overview')
  const [isCalamityActive, setIsCalamityActive] = useState<boolean>(false)

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

  const currentModuleNav = navModules.find((m) => m.id === activeModule) || navModules[0]
  const Panel = panels[activeModule].component

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

        <nav aria-label="DTI Admin modules">
          {navModules.map((mod) => {
            const isActive = activeModule === mod.id
            return (
              <button
                key={mod.id}
                className={`admin-nav-item ${isActive ? 'active' : ''}`}
                onClick={() => setActiveModule(mod.id)}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className="admin-nav-icon" aria-hidden="true">{mod.icon}</span>
                <span>{mod.label}</span>
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
            <span>{currentModuleNav.categoryName}</span>
            <span>/</span>
            <span className="current">{currentModuleNav.label}</span>
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
