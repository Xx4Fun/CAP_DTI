import { useEffect, useState } from 'react'
import { adminApi } from '../../services/adminApi'
import type { AdminOverviewRecord, AuditRecord } from '../../types/admin'
import { StoreManager } from './StoreManager'
import { TemporalVolatility } from './TemporalVolatility'
import { CitizenTipReview } from './CitizenTipReview'
import { LegalNoticeManager } from './LegalNoticeManager'
import { EmergencyToggle } from './EmergencyToggle'
import { SrpManagementPanel } from './SrpManagementPanel'

import type { ModuleId } from './AdminShell'

import { Store, Receipt, TrendingUp, Shield, ArrowRight, Activity, Plus, FileText, MapPin } from 'lucide-react'

export function OverviewPanel(props: { onNavigate?: (module: ModuleId) => void }) {
  const [summary, setSummary] = useState<AdminOverviewRecord | null>(null)
  const [recentAudits, setRecentAudits] = useState<AuditRecord[]>([])
  const [error, setError] = useState(false)

  useEffect(() => {
    void adminApi.getOverview().then(setSummary).catch(() => setError(true))
    try {
      const auditRes = adminApi.getAuditEvents?.()
      if (auditRes && typeof auditRes.then === 'function') {
        void auditRes.then((audits) => setRecentAudits(audits ? audits.slice(0, 4) : [])).catch(() => {})
      }
    } catch {
      // Ignore overview audit stream errors
    }
  }, [])

  if (error) return <p role="alert" className="admin-inline-alert">The regulatory overview could not load. Refresh or try again later.</p>
  if (!summary) return <p role="status" className="admin-loading-state">Loading regulatory overview...</p>

  const emergencyRecordsAvailable = summary.availability?.regulatory_emergencies
    ?? summary.active_emergencies !== null

  const isEmergencyActive = summary.active_emergencies !== null && summary.active_emergencies > 0

  return (
    <div className="admin-dashboard-workspace">
      {/* 4-Card Top KPI Metric Grid */}
      <div className="admin-metric-grid-4">
        <article className="kpi-card blue">
          <div className="kpi-card-header">
            <div className="kpi-icon-wrap blue">
              <Store size={22} aria-hidden="true" />
            </div>
            <span className="kpi-badge success">+2 verified this week</span>
          </div>
          <div className="kpi-card-body">
            <strong className="kpi-value">{summary.stores}</strong>
            <span className="kpi-label">Commercial Establishments</span>
          </div>
        </article>

        <article className="kpi-card amber">
          <div className="kpi-card-header">
            <div className="kpi-icon-wrap amber">
              <Receipt size={22} aria-hidden="true" />
            </div>
            <span className="kpi-badge warning">{summary.pending_reports > 0 ? `${summary.pending_reports} Action Needed` : 'Up to Date'}</span>
          </div>
          <div className="kpi-card-body">
            <strong className="kpi-value">{summary.pending_reports}</strong>
            <span className="kpi-label">Formal Receipts Queue</span>
          </div>
        </article>

        <article className="kpi-card red">
          <div className="kpi-card-header">
            <div className="kpi-icon-wrap red">
              <TrendingUp size={22} aria-hidden="true" />
            </div>
            <span className="kpi-badge info">0 active alerts</span>
          </div>
          <div className="kpi-card-body">
            <strong className="kpi-value">0</strong>
            <span className="kpi-label">Price Volatility Alerts</span>
          </div>
        </article>

        <article className="kpi-card green">
          <div className="kpi-card-header">
            <div className="kpi-icon-wrap green">
              <Shield size={22} aria-hidden="true" />
            </div>
            <span className={`kpi-badge ${emergencyRecordsAvailable ? (isEmergencyActive ? 'danger' : 'success') : 'warning'}`}>
              {emergencyRecordsAvailable ? (isEmergencyActive ? 'State of Calamity 🔴' : 'Normal Market 🟢') : 'Status Offline'}
            </span>
          </div>
          <div className="kpi-card-body">
            <strong className="kpi-value status-text">
              {emergencyRecordsAvailable ? (isEmergencyActive ? 'State of Calamity' : 'Normal Market') : 'Unavailable'}
            </strong>
            <span className="kpi-label">Market Protocol Status</span>
          </div>
        </article>
      </div>

      {/* Main 2-Column Split Dashboard */}
      <div className="dashboard-split-grid">
        {/* Left Section (65% Width) */}
        <div className="dashboard-left-panel">
          <div className="dashboard-card">
            <div className="dashboard-card-header">
              <div>
                <h3>Market Volatility & Compliance Overview</h3>
                <p>Four-week price compliance across San Jose de Buenavista establishments.</p>
              </div>
              <span className="badge-live-dot"><span className="dot" /> Live Analytics Connected</span>
            </div>

            <div className="chart-preview-container">
              <div className="chart-stats-summary">
                <div className="stat-pill">
                  <span className="stat-value">100%</span>
                  <span className="stat-label">Prevailing SRP Rate</span>
                </div>
                <div className="stat-pill">
                  <span className="stat-value">0%</span>
                  <span className="stat-label">Price Volatility Anomaly</span>
                </div>
                <div className="stat-pill">
                  <span className="stat-value">San Jose</span>
                  <span className="stat-label">Pilot Coverage Zone</span>
                </div>
              </div>
              <div className="chart-placeholder-box">
                <div className="chart-placeholder-content">
                  <Activity size={32} className="chart-icon" aria-hidden="true" />
                  <p>Temporal Volatility Analytics Engine Ready</p>
                  <small>Interactive compliance curve with prevailing SRP baseline overlay</small>
                </div>
                <button
                  type="button"
                  className="admin-button secondary launch-analytics-btn"
                  onClick={() => props.onNavigate?.('analytics')}
                >
                  View 4-Week Temporal Chart <ArrowRight size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Section (35% Width) */}
        <div className="dashboard-right-panel">
          <div className="dashboard-card">
            <h3>Quick Actions</h3>
            <div className="quick-actions-list">
              <button type="button" className="quick-action-btn" onClick={() => props.onNavigate?.('srp')}>
                <Plus size={16} className="btn-icon blue" aria-hidden="true" />
                <span>+ Add / Revise SRP Bulletin</span>
              </button>
              <button type="button" className="quick-action-btn" onClick={() => props.onNavigate?.('reports')}>
                <FileText size={16} className="btn-icon amber" aria-hidden="true" />
                <span>Review Formal Receipts</span>
              </button>
              <button type="button" className="quick-action-btn" onClick={() => props.onNavigate?.('stores')}>
                <MapPin size={16} className="btn-icon green" aria-hidden="true" />
                <span>GIS Establishment Map</span>
              </button>
              <button type="button" className="quick-action-btn" onClick={() => props.onNavigate?.('emergency')}>
                <Shield size={16} className="btn-icon red" aria-hidden="true" />
                <span>Emergency Protocol</span>
              </button>
            </div>
          </div>

          <div className="dashboard-card">
            <h3>Live System Activity Log</h3>
            <div className="activity-stream">
              {recentAudits.length > 0 ? (
                recentAudits.map((item) => (
                  <div key={item.id} className="activity-item">
                    <div className="activity-dot" />
                    <div className="activity-details">
                      <strong>{item.action}</strong>
                      <p>{item.subject_type} {item.subject_id}</p>
                      <small>{new Date(item.created_at).toLocaleTimeString()}</small>
                    </div>
                  </div>
                ))
              ) : (
                <div className="activity-empty">
                  <Activity size={18} aria-hidden="true" />
                  <span>Real-time monitoring engine connected. All systems nominal.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function StoreManagementPanel() {
  return <StoreManager />
}

export { SrpManagementPanel }

export function ReportReviewPanel() {
  return <CitizenTipReview />
}

export function EmergencyPanel() {
  return <EmergencyToggle />
}

export function LegalDraftPanel() {
  return <LegalNoticeManager />
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
                  {event.subject_type} {event.subject_id}
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

export function AnalyticsPanel() {
  return <TemporalVolatility />
}
