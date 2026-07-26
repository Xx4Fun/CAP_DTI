import { useEffect, useState } from 'react'
import { adminApi } from '../../services/adminApi'
import type { AuditRecord, SrpRecord } from '../../types/admin'
import { StoreManager } from './StoreManager'
import { TemporalVolatility } from './TemporalVolatility'
import { CitizenTipReview } from './CitizenTipReview'
import { LegalNoticeManager } from './LegalNoticeManager'
import { EmergencyToggle } from './EmergencyToggle'

import type { ModuleId } from './AdminShell'

export function OverviewPanel({ onNavigate }: { onNavigate?: (module: ModuleId) => void }) {
  const [summary, setSummary] = useState<{ stores?: number; pending_reports?: number; active_emergencies?: number }>({})
  useEffect(() => {
    void adminApi.getOverview().then(setSummary).catch(() => {})
  }, [])
  return (
    <div className="admin-stack" style={{ display: 'grid', gap: '1.75rem' }}>
      {/* Header Greeting Banner */}
      <div className="overview-greeting-banner" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' }}>Good Evening, Officer.</h2>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.88rem', color: '#64748b' }}>
            San Jose de Buenavista, Antique | Active Regulatory Session &amp; Automated Surveillance
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.78rem', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '0.35rem 0.75rem', borderRadius: '20px', fontWeight: 700 }}>
            🛡️ DTI R.A. 7581 Active
          </span>
        </div>
      </div>

      {/* 5-Metric Counter Cards Row */}
      <div>
        <h3 style={{ margin: '0 0 0.85rem', fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Operational Summary</h3>
        <div className="admin-metric-grid-5" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
          {/* Card 1: Compliant Stores */}
          <article className="metric-card-green" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem', display: 'grid', gap: '0.35rem', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)' }}>
            <strong style={{ font: '700 2.1rem ui-monospace, monospace', color: '#059669' }}>
              {summary.stores ?? 0}
            </strong>
            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>Compliant Stores</span>
            <small style={{ color: '#64748b', fontSize: '0.78rem' }}>Compliant stores</small>
          </article>

          {/* Card 2: Pending Scans */}
          <article className="metric-card-amber" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem', display: 'grid', gap: '0.35rem', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)' }}>
            <strong style={{ font: '700 2.1rem ui-monospace, monospace', color: '#f59e0b' }}>
              {summary.pending_reports ?? 12}
            </strong>
            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>Pending Scans</span>
            <small style={{ color: '#64748b', fontSize: '0.78rem' }}>Awaiting DTI review</small>
          </article>

          {/* Card 3: Active LOIs */}
          <article className="metric-card-blue" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem', display: 'grid', gap: '0.35rem', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)' }}>
            <strong style={{ font: '700 2.1rem ui-monospace, monospace', color: '#2563eb' }}>
              3
            </strong>
            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>Active LOIs</span>
            <small style={{ color: '#64748b', fontSize: '0.78rem' }}>48h rebuttal window</small>
          </article>

          {/* Card 4: Escalated SCOs */}
          <article className="metric-card-purple" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem', display: 'grid', gap: '0.35rem', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)' }}>
            <strong style={{ font: '700 2.1rem ui-monospace, monospace', color: '#8b5cf6' }}>
              2
            </strong>
            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>Escalated SCOs</span>
            <small style={{ color: '#64748b', fontSize: '0.78rem' }}>Field inspection queue</small>
          </article>

          {/* Card 5: Resolved Cases */}
          <article className="metric-card-teal" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem', display: 'grid', gap: '0.35rem', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)' }}>
            <strong style={{ font: '700 2.1rem ui-monospace, monospace', color: '#0d9488' }}>
              5
            </strong>
            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>Resolved Cases</span>
            <small style={{ color: '#64748b', fontSize: '0.78rem' }}>Audited and closed</small>
          </article>
        </div>
      </div>

      {/* Quick Access Action Grid */}
      <div>
        <h3 style={{ margin: '0 0 0.85rem', fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Quick Access Modules</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
          {/* Action Card 1: GIS Store Registry */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '1rem', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)' }}>
            <div>
              <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#1d4ed8', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', marginBottom: '0.85rem', boxShadow: '0 2px 6px rgba(29, 78, 216, 0.25)' }}>
                📍
              </div>
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>GIS Store Registry</h4>
              <p style={{ margin: '0.35rem 0 0', fontSize: '0.82rem', color: '#64748b', lineHeight: '1.4' }}>
                Register commercial establishments and manage geographic pin locations.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate?.('stores')}
              style={{ padding: '0.5rem 0.85rem', background: 'transparent', color: '#1d4ed8', border: '1px solid #1d4ed8', borderRadius: '8px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s ease' }}
            >
              Open module →
            </button>
          </div>

          {/* Action Card 2: Temporal Volatility */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '1rem', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)' }}>
            <div>
              <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#1d4ed8', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', marginBottom: '0.85rem', boxShadow: '0 2px 6px rgba(29, 78, 216, 0.25)' }}>
                📈
              </div>
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Temporal Volatility</h4>
              <p style={{ margin: '0.35rem 0 0', fontSize: '0.82rem', color: '#64748b', lineHeight: '1.4' }}>
                Track 4-week commodity price changes and identify baseline SRP variances.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate?.('analytics')}
              style={{ padding: '0.5rem 0.85rem', background: 'transparent', color: '#1d4ed8', border: '1px solid #1d4ed8', borderRadius: '8px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s ease' }}
            >
              Open module →
            </button>
          </div>

          {/* Action Card 3: Citizen OCR Tips */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '1rem', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)' }}>
            <div>
              <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#1d4ed8', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', marginBottom: '0.85rem', boxShadow: '0 2px 6px rgba(29, 78, 216, 0.25)' }}>
                🧾
              </div>
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Citizen OCR Tips</h4>
              <p style={{ margin: '0.35rem 0 0', fontSize: '0.82rem', color: '#64748b', lineHeight: '1.4' }}>
                Audit extracted consumer receipt scans and vault evidence images.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate?.('reports')}
              style={{ padding: '0.5rem 0.85rem', background: 'transparent', color: '#1d4ed8', border: '1px solid #1d4ed8', borderRadius: '8px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s ease' }}
            >
              Open module →
            </button>
          </div>

          {/* Action Card 4: LOI & SCO Notices */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '1rem', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)' }}>
            <div>
              <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#1d4ed8', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', marginBottom: '0.85rem', boxShadow: '0 2px 6px rgba(29, 78, 216, 0.25)' }}>
                ⚖️
              </div>
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>LOI &amp; SCO Notices</h4>
              <p style={{ margin: '0.35rem 0 0', fontSize: '0.82rem', color: '#64748b', lineHeight: '1.4' }}>
                Draft, audit, and dispatch official legal notices &amp; Show Cause Orders.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate?.('legal')}
              style={{ padding: '0.5rem 0.85rem', background: 'transparent', color: '#1d4ed8', border: '1px solid #1d4ed8', borderRadius: '8px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s ease' }}
            >
              Open module →
            </button>
          </div>
        </div>
      </div>
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
