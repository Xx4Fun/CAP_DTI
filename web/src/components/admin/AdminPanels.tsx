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

export function OverviewPanel(_props: { onNavigate?: (module: ModuleId) => void }) {
  const [summary, setSummary] = useState<AdminOverviewRecord | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    void adminApi.getOverview().then(setSummary).catch(() => setError(true))
  }, [])

  if (error) return <p role="alert" className="admin-inline-alert">The regulatory overview could not load. Refresh or try again later.</p>
  if (!summary) return <p role="status" className="admin-loading-state">Loading regulatory overview...</p>

  const emergencyRecordsAvailable = summary.availability?.regulatory_emergencies
    ?? summary.active_emergencies !== null

  return (
    <div className="admin-stack">
      <div className="admin-metric-grid">
        <article>
          <strong>{summary.stores}</strong>
          <span>Commercial Establishments</span>
        </article>
        <article>
          <strong>{summary.pending_reports}</strong>
          <span>Formal Receipt Reports Awaiting Review</span>
        </article>
        <article>
          <strong className={emergencyRecordsAvailable ? undefined : 'metric-unavailable'}>
            {emergencyRecordsAvailable ? summary.active_emergencies : 'Unavailable'}
          </strong>
          <span>Active State of Calamity Status</span>
        </article>
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
