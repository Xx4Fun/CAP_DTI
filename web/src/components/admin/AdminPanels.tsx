import { lazy, Suspense, useEffect, useState } from 'react'
import { adminApi } from '../../services/adminApi'
import type { AdminOverviewRecord, AuditRecord, ConsumerReportRecord, StoreRecord } from '../../types/admin'
import type { AdminUser } from '../../types/admin'

const StoreManager = lazy(() => import('./StoreManager').then((module) => ({ default: module.StoreManager })))
const StoreOnboarding = lazy(() => import('../StoreOnboarding').then((module) => ({ default: module.StoreOnboarding })))
const CitizenTipReview = lazy(() => import('./CitizenTipReview').then((module) => ({ default: module.CitizenTipReview })))
const LegalNoticeManager = lazy(() => import('./LegalNoticeManager').then((module) => ({ default: module.LegalNoticeManager })))
const EmergencyToggle = lazy(() => import('./EmergencyToggle').then((module) => ({ default: module.EmergencyToggle })))
const LazySrpManagementPanel = lazy(() => import('./SrpManagementPanel').then((module) => ({ default: module.SrpManagementPanel })))
const SettingsPanel = lazy(() => import('./SettingsPanel').then((module) => ({ default: module.SettingsPanel })))
const UserManagementPanel = lazy(() => import('./UserManagementPanel').then((module) => ({ default: module.UserManagementPanel })))
const FieldMonitoringRecords = lazy(() => import('./FieldMonitoringRecords').then((module) => ({ default: module.FieldMonitoringRecords })))

const PanelLoader = () => <div className="admin-panel-loader" role="status">Loading Admin module...</div>

export function SettingsPanelWrapper(props: { user: AdminUser; onUserUpdate?: (user: Partial<AdminUser>) => void }) {
  return <Suspense fallback={<PanelLoader />}><SettingsPanel user={props.user} onUserUpdate={props.onUserUpdate} /></Suspense>
}

import type { ModuleId } from './AdminShell'

import { ArrowRight, Activity, MessageSquare } from 'lucide-react'

function formatSubjectType(type?: string): string {
  if (!type) return 'System Record'
  if (type.includes('ConsumerReport')) return 'Receipt Review'
  if (type.includes('Store')) return 'Store Registry'
  if (type.includes('SrpBulletin')) return 'SRP Bulletin'
  if (type.includes('TemporalInspection')) return 'Field Inspection'
  if (type.includes('LegalNotice')) return 'Legal Notice'
  if (type.includes('User')) return 'System User'

  const parts = type.split('\\')
  const name = parts[parts.length - 1]
  return name.replace(/([A-Z])/g, ' $1').trim()
}

export function OverviewPanel(props: { onNavigate?: (module: ModuleId) => void }) {
  const [summary, setSummary] = useState<AdminOverviewRecord | null>(null)
  const [storesList, setStoresList] = useState<StoreRecord[]>([])
  const [reportsList, setReportsList] = useState<ConsumerReportRecord[]>([])
  const [error, setError] = useState(false)

  useEffect(() => {
    void adminApi.getOverview().then(setSummary).catch(() => setError(true))
    void adminApi.getStores?.().then((data) => setStoresList(data ? data.slice(0, 4) : [])).catch(() => {})
    void adminApi.getReports?.().then((data) => setReportsList(data ? data.slice(0, 4) : [])).catch(() => {})
  }, [])

  if (error) return <p role="alert" className="admin-inline-alert">The regulatory overview could not load. Refresh or try again later.</p>

  if (!summary) {
    return (
      <div className="admin-dashboard-workspace" role="status" aria-label="Loading regulatory overview">
        <span className="sr-only">Loading regulatory overview...</span>
        <div className="admin-metric-grid-4">
          <div className="admin-skeleton-block" style={{ height: '116px' }} />
          <div className="admin-skeleton-block" style={{ height: '116px' }} />
          <div className="admin-skeleton-block" style={{ height: '116px' }} />
          <div className="admin-skeleton-block" style={{ height: '116px' }} />
        </div>
        <div className="dashboard-grid-50-50">
          <div className="admin-skeleton-block" style={{ height: '310px' }} />
          <div className="admin-skeleton-block" style={{ height: '310px' }} />
        </div>
        <div className="dashboard-split-grid">
          <div className="admin-skeleton-block" style={{ height: '420px' }} />
          <div className="admin-skeleton-block" style={{ height: '420px' }} />
        </div>
      </div>
    )
  }

  const isEmergencyUnavailable = summary.active_emergencies === null || summary.availability?.regulatory_emergencies === false
  const isEmergencyActive = !isEmergencyUnavailable && (summary.active_emergencies ?? 0) > 0

  return (
    <div className="admin-dashboard-workspace">
      {/* 4-Card Top KPI Metric Grid matching mockup */}
      <div className="admin-metric-grid-4">
        <article className="kpi-card horizontal blue">
          <div className="kpi-circle-icon blue">
            <i className="fa-solid fa-store" aria-hidden="true" />
          </div>
          <div className="kpi-card-content">
            <span className="kpi-card-title">REGISTERED STORES</span>
            <strong className="kpi-card-val blue">{summary.stores}</strong>
            <span className="kpi-card-sub">{summary.stores > 0 ? `${summary.stores} registered stores` : 'No records yet'}</span>
          </div>
        </article>

        <article className="kpi-card horizontal amber">
          <div className="kpi-circle-icon amber">
            <i className="fa-solid fa-file-lines" aria-hidden="true" />
          </div>
          <div className="kpi-card-content">
            <span className="kpi-card-title">REPORTS AWAITING DECISION</span>
            <strong className="kpi-card-val amber">{summary.pending_reports}</strong>
            <span className="kpi-card-sub">{summary.pending_reports > 0 ? `${summary.pending_reports} pending evaluation` : 'No records yet'}</span>
          </div>
        </article>

        <article className="kpi-card horizontal purple">
          <div className="kpi-circle-icon purple">
            <i className="fa-solid fa-file-contract" aria-hidden="true" />
          </div>
          <div className="kpi-card-content">
            <span className="kpi-card-title">ACTIVE SRP BULLETINS</span>
            <strong className="kpi-card-val purple">Unavailable</strong>
            <span className="kpi-card-sub">No authoritative bulletin count supplied by this overview</span>
          </div>
        </article>

        <article className="kpi-card horizontal red">
          <div className="kpi-circle-icon red">
            <i className="fa-solid fa-bell" aria-hidden="true" />
          </div>
          <div className="kpi-card-content">
            <span className="kpi-card-title">EMERGENCY DECLARATIONS</span>
            <strong className="kpi-card-val red">{isEmergencyUnavailable ? 'Unavailable' : summary.active_emergencies}</strong>
            <span className="kpi-card-sub">{isEmergencyUnavailable ? 'Emergency records unavailable' : isEmergencyActive ? 'State of Calamity' : 'None in effect'}</span>
          </div>
        </article>
      </div>

      {/* Row 2: Receipt Review Status and Store Registry Status matching mockup */}
      <div className="dashboard-grid-50-50">
        {/* Receipt Review Status Card */}
        <div className="dashboard-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <i className="fa-solid fa-file-lines" style={{ color: '#0052cc', fontSize: '1.2rem' }} aria-hidden="true" />
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>Receipt review status</h3>
            </div>
            <button
              type="button"
              onClick={() => props.onNavigate?.('consumer_reports')}
              style={{ background: 'none', border: 'none', color: '#0052cc', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', padding: 0 }}
            >
              View all
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 2.4fr 1.2fr 0.9fr', gap: '0.5rem', padding: '0.55rem 0', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #e2e8f0', fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>
            <span>Reference</span>
            <span>Store Name</span>
            <span>Submitted Date</span>
            <span style={{ textAlign: 'right' }}>Status</span>
          </div>

          {reportsList.length === 0 ? (
            <div style={{ padding: '1.75rem 0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.75rem' }}>
              <div style={{ width: '82px', height: '82px', borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className="fa-solid fa-file-lines" style={{ fontSize: '2.2rem', color: '#94a3b8' }} aria-hidden="true" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.35rem' }}>
                <strong style={{ fontSize: '1rem', color: '#0f172a', fontWeight: 700 }}>No receipt reviews pending</strong>
                <p style={{ margin: 0, fontSize: '0.83rem', color: '#64748b', lineHeight: 1.35, maxWidth: '280px' }}>
                  Submitted citizen receipts and OCR scans will appear here for audit.
                </p>
                <button
                  type="button"
                  onClick={() => props.onNavigate?.('consumer_reports')}
                  style={{ marginTop: '0.4rem', background: '#0052cc', color: '#ffffff', border: 'none', padding: '0.5rem 1.15rem', borderRadius: '8px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
                >
                  View receipt queue
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {reportsList.map((report) => (
                <div key={report.id} style={{ display: 'grid', gridTemplateColumns: '1.5fr 2.4fr 1.2fr 0.9fr', gap: '0.5rem', padding: '0.65rem 0', borderBottom: '1px solid #f1f5f9', alignItems: 'center', fontSize: '0.83rem' }}>
                  <span style={{ fontWeight: 700, color: '#0f172a', wordBreak: 'break-word' }}>{report.report_reference}</span>
                  <span style={{ color: '#64748b', wordBreak: 'break-word', lineHeight: 1.35 }}>{report.store_name || 'Commercial Store'}</span>
                  <span style={{ color: '#64748b', whiteSpace: 'nowrap' }}>{new Date(report.submitted_at).toLocaleDateString()}</span>
                  <span style={{ textAlign: 'right' }}>
                    <span className={`kpi-badge ${report.status === 'PENDING' ? 'warning' : 'success'}`}>
                      {report.status}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Store Registry Status Card */}
        <div className="dashboard-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <i className="fa-solid fa-store" style={{ color: '#0052cc', fontSize: '1.2rem' }} aria-hidden="true" />
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>Store registry status</h3>
            </div>
            <button
              type="button"
              onClick={() => props.onNavigate?.('establishments_access')}
              style={{ background: 'none', border: 'none', color: '#0052cc', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', padding: 0 }}
            >
              View all
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.8fr 2.2fr 0.9fr', gap: '0.5rem', padding: '0.55rem 0', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #e2e8f0', fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>
            <span>Store Name</span>
            <span>SEC Number</span>
            <span>Address</span>
            <span style={{ textAlign: 'right' }}>Status</span>
          </div>

          {storesList.length === 0 ? (
            <div style={{ padding: '1.75rem 0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.75rem' }}>
              <div style={{ width: '82px', height: '82px', borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className="fa-solid fa-store" style={{ fontSize: '2.2rem', color: '#94a3b8' }} aria-hidden="true" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.35rem' }}>
                <strong style={{ fontSize: '1rem', color: '#0f172a', fontWeight: 700 }}>No stores registered yet</strong>
                <p style={{ margin: 0, fontSize: '0.83rem', color: '#64748b', lineHeight: 1.35, maxWidth: '280px' }}>
                  Register your first store to start monitoring and validating prices.
                </p>
                <button
                  type="button"
                  onClick={() => props.onNavigate?.('establishments_access')}
                  style={{ marginTop: '0.4rem', background: '#0052cc', color: '#ffffff', border: 'none', padding: '0.5rem 1.15rem', borderRadius: '8px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
                >
                  Add first store
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {storesList.map((store) => (
                <div key={store.id} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.8fr 2.2fr 0.9fr', gap: '0.5rem', padding: '0.65rem 0', borderBottom: '1px solid #f1f5f9', alignItems: 'center', fontSize: '0.83rem' }}>
                  <span style={{ fontWeight: 700, color: '#0f172a', wordBreak: 'break-word', lineHeight: 1.35 }}>{store.store_name}</span>
                  <span style={{ color: '#64748b', wordBreak: 'break-word', lineHeight: 1.35 }}>{store.dti_sec_number || 'DTI Registered'}</span>
                  <span style={{ color: '#64748b', wordBreak: 'break-word', lineHeight: 1.35 }}>{store.address}</span>
                  <span style={{ textAlign: 'right' }}>
                    <span className={`kpi-badge ${store.is_active ? 'success' : 'warning'}`}>
                      {store.is_active ? 'Active' : 'Pending'}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Row 3: Monitoring Activity and Recent Activity */}
      <div className="dashboard-split-grid">
        {/* Left Section (65% Width): Monitoring Activity */}
        <div className="dashboard-left-panel">
          <div className="dashboard-card">
            <div className="dashboard-card-header">
              <div>
                <h3>Monitoring Activity</h3>
                <p>Four-week price compliance across San Jose de Buenavista establishments.</p>
              </div>
              <span className="badge-live-dot">Analytics workspace</span>
            </div>

            <div className="chart-preview-container">
              <div className="chart-stats-summary" role="status">
                <p>No authoritative trend summary is available on the dashboard. Open Temporal Analytics to select a store and commodity.</p>
              </div>
              <div className="chart-placeholder-box">
                <div className="chart-placeholder-content">
                  <Activity size={32} className="chart-icon" aria-hidden="true" />
                  <p>Temporal analytics</p>
                  <small>Choose a store and commodity before interpreting price history.</small>
                </div>
                <button
                  type="button"
                  className="admin-button secondary launch-analytics-btn"
                  onClick={() => props.onNavigate?.('field_monitoring')}
                >
                  View 4-Week Temporal Chart <ArrowRight size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Section (35% Width): Active Legal Actions */}
        <div className="dashboard-right-panel">
          <div className="dashboard-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <i className="fa-solid fa-scale-balanced" style={{ color: '#0052cc', fontSize: '1.2rem' }} aria-hidden="true" />
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>Active Legal Actions</h3>
              </div>
              <button
                type="button"
                onClick={() => props.onNavigate?.('legal_actions')}
                style={{ background: 'none', border: 'none', color: '#0052cc', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', padding: 0 }}
              >
                View Engine
              </button>
            </div>

            <div role="status" style={{ padding: '1rem', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569' }}>
              No legal action records are available from an authoritative source. The legal engine remains preview-only until approved policy rules are configured.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function StoreRegistrationPanel(props: { onNavigate?: (module: ModuleId) => void; onBack?: () => void }) {
  return (
    <Suspense fallback={<PanelLoader />}>
    <StoreOnboarding
      onBack={props.onBack}
      onCreated={() => {
        if (props.onNavigate) {
          props.onNavigate('gis_monitoring')
        }
      }}
    />
    </Suspense>
  )
}

export function StoreMonitoringPanel() {
  return <Suspense fallback={<PanelLoader />}><StoreManager /></Suspense>
}

export function EstablishmentsAccessPanel(props: { onNavigate?: (module: ModuleId) => void }) {
  return <Suspense fallback={<PanelLoader />}><UserManagementPanel vendorRegistration={<StoreRegistrationPanel onNavigate={props.onNavigate} />} /></Suspense>
}

export function CommunicationsPanel(props: { onNavigate?: (module: ModuleId) => void }) {
  return (
    <section className="admin-availability-panel admin-availability-panel-centered" aria-labelledby="communications-availability-title">
      <MessageSquare size={28} aria-hidden="true" />
      <div className="admin-availability-copy">
        <h2 id="communications-availability-title">Two-way store conversations are not connected yet</h2>
        <p>
          The current system has no conversation threads, document-review inbox, messaging API, or approved legal-notice dispatch workflow.
        </p>
      </div>
      <button type="button" className="admin-button secondary" onClick={() => props.onNavigate?.('legal_actions')}>
        Open Legal Actions <ArrowRight size={16} aria-hidden="true" />
      </button>
    </section>
  )
}

export function SrpManagementPanel() {
  return <Suspense fallback={<PanelLoader />}><LazySrpManagementPanel /></Suspense>
}

export function ReportReviewPanel() {
  return <Suspense fallback={<PanelLoader />}><CitizenTipReview /></Suspense>
}

export function EmergencyPanel() {
  return <Suspense fallback={<PanelLoader />}><EmergencyToggle /></Suspense>
}

export function LegalDraftPanel() {
  return <Suspense fallback={<PanelLoader />}><LegalNoticeManager /></Suspense>
}

export function AuditPanel() {
  const [events, setEvents] = useState<AuditRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    void adminApi.getAuditEvents().then(setEvents).catch((requestError: unknown) => {
      const status = (requestError as { response?: { data?: { status?: string } } })
        .response?.data?.status
      setError(status === 'AUDIT_TRAIL_UNAVAILABLE'
        ? 'AUDIT_TRAIL_UNAVAILABLE — Audit storage requires the approved Admin migration before this read-only trail can be used.'
        : 'The audit trail could not be loaded. Refresh or try again later.')
    })
  }, [])

  if (error) {
    return <p role='alert' className='admin-inline-alert'>{error}</p>
  }

  return (
    <div className="admin-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem' }}>
      <div className="admin-table-wrap" style={{ overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px', background: '#ffffff' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ padding: '0.75rem 1rem', fontSize: '0.76rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>Time</th>
              <th style={{ padding: '0.75rem 1rem', fontSize: '0.76rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>Action</th>
              <th style={{ padding: '0.75rem 1rem', fontSize: '0.76rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>Subject</th>
              <th style={{ padding: '0.75rem 1rem', fontSize: '0.76rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>Details</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '0.75rem 1rem', fontSize: '0.82rem', color: '#64748b' }}>{new Date(event.created_at).toLocaleString()}</td>
                <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#1e3a8a', fontSize: '0.85rem' }}>{event.action}</td>
                <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#0f172a' }}>
                  {formatSubjectType(event.subject_type)}{event.subject_id ? ` #${event.subject_id}` : ''}
                </td>
                <td style={{ padding: '0.75rem 1rem' }}>
                  <code>{JSON.stringify(event.metadata)}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function FieldMonitoringPanel() {
  return <Suspense fallback={<PanelLoader />}><FieldMonitoringRecords /></Suspense>
}
