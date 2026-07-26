import React, { useEffect, useState } from 'react'
import { adminApi } from '../../services/adminApi'
import type { ConsumerReportRecord } from '../../types/admin'

export const CitizenTipReview: React.FC = () => {
  const [reports, setReports] = useState<ConsumerReportRecord[]>([])
  const [selected, setSelected] = useState<ConsumerReportRecord | null>(null)
  const [reason, setReason] = useState('')
  const [correctedText, setCorrectedText] = useState('{}')
  const [finding, setFinding] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    void adminApi.getReports().then((data) => {
      setReports(data)
      setLoading(false)
    })
  }, [])

  const selectReport = (report: ConsumerReportRecord) => {
    setSelected(report)
    setCorrectedText(JSON.stringify(report.evaluator_confirmed_json || report.raw_ocr_json || {}, null, 2))
    setFinding(String(report.evaluator_confirmed_json?.regulatory_finding || ''))
    setReason('')
    setError('')
  }

  const decide = async (action: string) => {
    if (!selected) return
    let corrected: Record<string, unknown> = {}
    if (action === 'validate' || action === 'correct') {
      try {
        corrected = JSON.parse(correctedText)
      } catch {
        setError('Evaluator-confirmed JSON must be valid JSON before validation or correction.')
        return
      }
      corrected.regulatory_finding = finding
    }
    const updated = await adminApi.decideReport(selected.id, { action, reason, corrected })
    setSelected(updated)
    setReports((current) => current.map((report) => (report.id === updated.id ? updated : report)))
    setError('')
  }

  const getStatusBadgeStyle = (status: string) => {
    switch (status.toLowerCase()) {
      case 'validated':
      case 'confirmed_violation':
        return { background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }
      case 'pending':
        return { background: '#fffbebf', color: '#d97706', border: '1px solid #fed7aa' }
      case 'no_violation':
      case 'dismissed':
      case 'rejected':
        return { background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0' }
      default:
        return { background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' }
    }
  }

  return (
    <div className="admin-split" style={{ display: 'grid', gridTemplateColumns: 'minmax(16rem, 22rem) minmax(0, 1fr)', gap: '1.25rem' }}>
      {/* Left List of Consumer Tips/Reports */}
      <div className="admin-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem' }}>
        <h3 style={{ margin: '0 0 0.85rem', fontSize: '1.05rem', color: '#0f172a', fontWeight: 700 }}>
          🧾 Consumer Receipt Queue
        </h3>

        {loading && <p style={{ color: '#64748b', fontSize: '0.88rem' }}>Loading receipt queue...</p>}

        {!loading && reports.length === 0 && (
          <p style={{ color: '#64748b', fontSize: '0.88rem' }}>No formal receipt reports are awaiting review.</p>
        )}

        <div className="admin-list" style={{ display: 'grid', gap: '0.65rem' }}>
          {reports.map((report) => {
            const isSelected = selected?.id === report.id
            const badgeStyle = getStatusBadgeStyle(report.status)

            return (
              <button
                key={report.id}
                onClick={() => selectReport(report)}
                style={{
                  display: 'grid',
                  textAlign: 'left',
                  gap: '0.35rem',
                  padding: '0.85rem',
                  borderRadius: '8px',
                  background: isSelected ? '#eff6ff' : '#ffffff',
                  border: isSelected ? '2px solid #1e3a8a' : '1px solid #e2e8f0',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ color: '#0f172a', fontSize: '0.88rem' }}>{report.report_reference}</strong>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.45rem', borderRadius: '10px', ...badgeStyle }}>
                    {report.status.toUpperCase()}
                  </span>
                </div>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{report.store_name || 'Store unmapped'}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Right Detail Inspection View */}
      {selected ? (
        <section className="review-detail" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.5rem', display: 'grid', gap: '1rem' }}>
          <div
            className="provenance-strip"
            style={{
              fontFamily: 'monospace',
              fontSize: '0.75rem',
              color: '#1e3a8a',
              background: '#f1f5f9',
              borderLeft: '3px solid #1e3a8a',
              padding: '0.5rem 0.75rem',
              borderRadius: '0 6px 6px 0',
            }}
          >
            Formal receipt | Consumer report | Human validation required
          </div>

          <div>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem', color: '#0f172a', fontWeight: 700 }}>
              Original OCR values
            </h3>
            <pre className="admin-code" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.85rem', color: '#0f172a', fontFamily: 'monospace', fontSize: '0.82rem', maxHeight: '180px', overflow: 'auto' }}>
              {JSON.stringify(selected.raw_ocr_json, null, 2)}
            </pre>
          </div>

          {selected.evaluator_confirmed_json && (
            <div>
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem', color: '#0f172a', fontWeight: 700 }}>
                Evaluator corrections
              </h3>
              <pre className="admin-code" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.85rem', color: '#0f172a', fontFamily: 'monospace', fontSize: '0.82rem', maxHeight: '180px', overflow: 'auto' }}>
                {JSON.stringify(selected.evaluator_confirmed_json, null, 2)}
              </pre>
            </div>
          )}

          {selected.evidence_available && (
            <div>
              <button
                type="button"
                onClick={async () => {
                  const blob = await adminApi.getReportEvidence(selected.id)
                  const url = URL.createObjectURL(blob)
                  const link = document.createElement('a')
                  link.href = url
                  link.download = `${selected.report_reference}-evidence.jpg`
                  link.click()
                  URL.revokeObjectURL(url)
                }}
                style={{
                  padding: '0.55rem 1rem',
                  borderRadius: '8px',
                  border: '1px solid #1e3a8a',
                  background: '#ffffff',
                  color: '#1e3a8a',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                Download private receipt evidence
              </button>
            </div>
          )}

          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <div>
              <label htmlFor="eval-confirmed-json" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.3rem' }}>
                Evaluator-confirmed JSON
              </label>
              <textarea
                id="eval-confirmed-json"
                rows={6}
                value={correctedText}
                onChange={(event) => setCorrectedText(event.target.value)}
                style={{ width: '100%', padding: '0.65rem', border: '1px solid #e2e8f0', borderRadius: '8px', fontFamily: 'monospace', fontSize: '0.82rem', background: '#ffffff', color: '#0f172a' }}
              />
            </div>

            <div>
              <label htmlFor="regulatory-finding-select" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.3rem' }}>
                Regulatory finding
              </label>
              <select
                id="regulatory-finding-select"
                value={finding}
                onChange={(event) => setFinding(event.target.value)}
                style={{ width: '100%', padding: '0.6rem', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#ffffff', color: '#0f172a', fontSize: '0.88rem' }}
              >
                <option value="">Select a human finding</option>
                <option value="confirmed_violation">Confirmed violation</option>
                <option value="no_violation">No violation</option>
                <option value="insufficient_evidence">Insufficient evidence</option>
              </select>
            </div>

            <div>
              <label htmlFor="decision-reason-text" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.3rem' }}>
                Decision reason
              </label>
              <textarea
                id="decision-reason-text"
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="State regulatory reasoning for this decision..."
                style={{ width: '100%', padding: '0.65rem', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#ffffff', color: '#0f172a', fontSize: '0.88rem' }}
              />
            </div>
          </div>

          {error && (
            <div className="error-badge" style={{ background: '#fef2f2', borderLeft: '4px solid #dc2626', color: '#b91c1c', padding: '0.75rem', borderRadius: '0 8px 8px 0', fontSize: '0.85rem' }}>
              {error}
            </div>
          )}

          <div className="admin-actions" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {['validate', 'correct', 'reject', 'dismiss'].map((action) => (
              <button
                type="button"
                key={action}
                disabled={!reason || (['validate', 'correct'].includes(action) && !finding)}
                onClick={() => void decide(action)}
                style={{
                  padding: '0.6rem 1.1rem',
                  borderRadius: '8px',
                  background: action === 'validate' ? '#059669' : action === 'correct' ? '#1e3a8a' : '#f8fafc',
                  color: ['validate', 'correct'].includes(action) ? '#ffffff' : '#64748b',
                  border: ['validate', 'correct'].includes(action) ? 'none' : '1px solid #e2e8f0',
                  fontWeight: 600,
                  cursor: 'pointer',
                  opacity: !reason || (['validate', 'correct'].includes(action) && !finding) ? 0.5 : 1,
                }}
              >
                {action[0].toUpperCase() + action.slice(1)}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '3rem', textAlign: 'center', color: '#64748b' }}>
          Select a consumer report from the left queue to view OCR details and render human validation decisions.
        </div>
      )}
    </div>
  )
}
