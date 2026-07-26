import { useEffect, useState } from 'react'
import { adminApi } from '../../services/adminApi'
import type { AuditRecord, SrpRecord } from '../../types/admin'
import { StoreManager } from './StoreManager'
import { TemporalVolatility } from './TemporalVolatility'
import { CitizenTipReview } from './CitizenTipReview'
import { LegalNoticeManager } from './LegalNoticeManager'
import { EmergencyToggle } from './EmergencyToggle'

export function OverviewPanel() {
  const [summary, setSummary] = useState({ stores: 0, pending_reports: 0, active_emergencies: 0 })
  useEffect(() => {
    void adminApi.getOverview().then(setSummary)
  }, [])
  return (
    <div className="admin-metric-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '1rem' }}>
      <article style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.5rem', display: 'grid', gap: '0.35rem' }}>
        <strong style={{ font: '600 2.25rem ui-monospace, monospace', color: '#1e3a8a' }}>{summary.stores}</strong>
        <span style={{ color: '#64748b', fontSize: '0.88rem' }}>Registered stores</span>
      </article>
      <article style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.5rem', display: 'grid', gap: '0.35rem' }}>
        <strong style={{ font: '600 2.25rem ui-monospace, monospace', color: '#d97706' }}>{summary.pending_reports}</strong>
        <span style={{ color: '#64748b', fontSize: '0.88rem' }}>Reports awaiting decision</span>
      </article>
      <article style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.5rem', display: 'grid', gap: '0.35rem' }}>
        <strong style={{ font: '600 2.25rem ui-monospace, monospace', color: summary.active_emergencies > 0 ? '#dc2626' : '#059669' }}>
          {summary.active_emergencies}
        </strong>
        <span style={{ color: '#64748b', fontSize: '0.88rem' }}>Emergency declarations</span>
      </article>
    </div>
  )
}

export function StoreManagementPanel() {
  return <StoreManager />
}

export function SrpManagementPanel() {
  const [source, setSource] = useState('')
  const [payload, setPayload] = useState('')
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null)
  const [history, setHistory] = useState<SrpRecord[]>([])
  const loadHistory = () => adminApi.getSrp().then(setHistory)

  useEffect(() => {
    void loadHistory()
  }, [])

  const parsed = () => {
    const value = JSON.parse(payload)
    value.metadata = { ...value.metadata, source_reference: source }
    return value
  }

  return (
    <div className="admin-stack" style={{ display: 'grid', gap: '1.25rem' }}>
      <form
        className="admin-card admin-form"
        onSubmit={async (event) => {
          event.preventDefault()
          setPreview(await adminApi.previewSrp(parsed()))
        }}
        style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem', display: 'grid', gap: '0.85rem' }}
      >
        <div>
          <label htmlFor="srp-json-upload" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.3rem' }}>
            Upload SRP JSON
          </label>
          <input
            id="srp-json-upload"
            type="file"
            accept="application/json,.json"
            onChange={async (event) => {
              const file = event.target.files?.[0]
              if (file) setPayload(await file.text())
            }}
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#ffffff' }}
          />
        </div>

        <div>
          <label htmlFor="srp-source-ref" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.3rem' }}>
            Authoritative source reference
          </label>
          <input
            id="srp-source-ref"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            required
            style={{ width: '100%', padding: '0.6rem', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#ffffff', color: '#0f172a' }}
          />
        </div>

        <div>
          <label htmlFor="srp-payload-json" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.3rem' }}>
            SRP JSON
          </label>
          <textarea
            id="srp-payload-json"
            rows={8}
            value={payload}
            onChange={(event) => setPayload(event.target.value)}
            required
            style={{ width: '100%', padding: '0.65rem', border: '1px solid #e2e8f0', borderRadius: '8px', fontFamily: 'monospace', fontSize: '0.82rem', background: '#ffffff', color: '#0f172a' }}
          />
        </div>

        <div className="admin-actions" style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            type="submit"
            style={{ padding: '0.6rem 1.1rem', background: '#ffffff', color: '#1e3a8a', border: '1px solid #1e3a8a', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
          >
            Preview append-only import
          </button>
          <button
            type="button"
            disabled={!preview}
            onClick={async () => {
              await adminApi.importSrp(parsed())
              await loadHistory()
              setPreview(null)
              setPayload('')
            }}
            style={{ padding: '0.6rem 1.1rem', background: '#1e3a8a', color: '#ffffff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', opacity: !preview ? 0.5 : 1 }}
          >
            Import new versions
          </button>
        </div>

        {preview && (
          <pre className="admin-code" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.85rem', color: '#0f172a', fontFamily: 'monospace', fontSize: '0.82rem', maxHeight: '180px', overflow: 'auto' }}>
            {JSON.stringify(preview, null, 2)}
          </pre>
        )}
      </form>

      <div className="admin-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem' }}>
        <div className="admin-table-wrap" style={{ overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px', background: '#ffffff' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <caption>Historical SRP versions</caption>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.76rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>Commodity</th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.76rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>Effective date</th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.76rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>SRP</th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.76rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>Source</th>
              </tr>
            </thead>
            <tbody>
              {history.map((record) => (
                <tr key={record.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    {record.commodity_name}
                    <small style={{ display: 'block', color: '#64748b', fontSize: '0.75rem' }}>{record.unit}</small>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#64748b' }}>{record.effective_date}</td>
                  <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 700, color: '#1e3a8a', fontSize: '0.9rem' }}>
                    {record.baseline_price}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.82rem', color: '#64748b' }}>
                    {record.source_reference || 'Legacy record'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

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
  useEffect(() => {
    void adminApi.getAuditEvents().then(setEvents)
  }, [])
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
