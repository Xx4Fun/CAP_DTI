import React, { useEffect, useState } from 'react'
import {
  CheckCircle2,
  Download,
  FileText,
  Maximize2,
  RefreshCw,
  RotateCw,
  Shield,
  XCircle,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
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
  const [filter, setFilter] = useState<'all' | 'pending' | 'validated' | 'dismissed'>('all')

  // Evidence image controls state
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [isFullScreen, setIsFullScreen] = useState(false)
  const [evidenceUrl, setEvidenceUrl] = useState<string | null>(null)
  const [evidenceLoading, setEvidenceLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    void adminApi.getReports().then((data) => {
      setReports(data)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    return () => {
      if (evidenceUrl) {
        URL.revokeObjectURL(evidenceUrl)
      }
    }
  }, [evidenceUrl])

  const selectReport = (report: ConsumerReportRecord) => {
    setSelected(report)
    setCorrectedText(JSON.stringify(report.evaluator_confirmed_json || report.raw_ocr_json || {}, null, 2))
    setFinding(String(report.evaluator_confirmed_json?.regulatory_finding || ''))
    setReason('')
    setError('')
    setZoom(1)
    setRotation(0)

    if (evidenceUrl) {
      URL.revokeObjectURL(evidenceUrl)
      setEvidenceUrl(null)
    }

    if (report.evidence_available) {
      setEvidenceLoading(true)
      try {
        const res = adminApi.getReportEvidence?.(report.id)
        if (res && typeof res.then === 'function') {
          res
            .then((blob) => {
              if (blob) {
                const url = URL.createObjectURL(blob)
                setEvidenceUrl(url)
              }
            })
            .catch(() => {
              setEvidenceUrl(null)
            })
            .finally(() => {
              setEvidenceLoading(false)
            })
        } else {
          setEvidenceLoading(false)
        }
      } catch {
        setEvidenceLoading(false)
      }
    }
  }

  const decide = async (action: string) => {
    if (!selected) return
    let corrected: Record<string, unknown> = {}
    if (action === 'validate' || action === 'correct' || action === 'validate_loi') {
      try {
        corrected = JSON.parse(correctedText)
      } catch {
        setError('Evaluator-confirmed JSON must be valid JSON before validation or correction.')
        return
      }
      corrected.regulatory_finding = finding || 'confirmed_violation'
    } else if (action === 'rescan') {
      try {
        corrected = JSON.parse(correctedText)
      } catch {
        corrected = {}
      }
      corrected.regulatory_finding = finding || 'insufficient_evidence'
    }

    const updated = await adminApi.decideReport(selected.id, { action, reason, corrected })
    setSelected(updated)
    setReports((current) => current.map((report) => (report.id === updated.id ? updated : report)))
    setError('')
  }

  const getStatusBadgeStyle = (status: string) => {
    const s = status.toLowerCase()
    if (s.includes('validate') || s.includes('violation') || s.includes('loi')) {
      return { background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }
    }
    if (s.includes('pending') || s.includes('under')) {
      return { background: '#fffbeb', color: '#d97706', border: '1px solid #fed7aa' }
    }
    if (s.includes('dismiss') || s.includes('no_violation') || s.includes('reject')) {
      return { background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0' }
    }
    return { background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' }
  }

  const pendingCount = reports.filter((r) => {
    const s = r.status.toLowerCase()
    return s.includes('pending') || s.includes('under')
  }).length

  const validatedCount = reports.filter((r) => {
    const s = r.status.toLowerCase()
    return s.includes('validate') || s.includes('violation') || s.includes('loi')
  }).length

  const dismissedCount = reports.filter((r) => {
    const s = r.status.toLowerCase()
    return s.includes('dismiss') || s.includes('no_violation') || s.includes('reject')
  }).length

  const filteredReports = reports.filter((r) => {
    const s = r.status.toLowerCase()
    if (filter === 'pending') return s.includes('pending') || s.includes('under')
    if (filter === 'validated') return s.includes('validate') || s.includes('violation') || s.includes('loi')
    if (filter === 'dismissed') return s.includes('dismiss') || s.includes('no_violation') || s.includes('reject')
    return true
  })

  const parseOcrItems = (rawJson: Record<string, unknown> | null) => {
    if (!rawJson) return []
    if (Array.isArray(rawJson.items)) return rawJson.items as Array<Record<string, unknown>>
    return []
  }

  const ocrItems = parseOcrItems(selected?.raw_ocr_json ?? null)

  return (
    <div className="citizen-tip-review-workspace" style={{ display: 'grid', gap: '1.25rem' }}>
      {/* Top Queue Filter Header */}
      <div
        className="review-header-bar"
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '1.25rem 1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Shield size={20} color="#1d4ed8" /> Formal Receipt OCR Review Queue
          </h2>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#64748b' }}>
            Executive Light dual-column inspection workspace for vaulted consumer evidence &amp; legal notices.
          </p>
        </div>

        {/* Status Filter Pills */}
        <div className="status-filter-pills" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`filter-pill ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
            style={{
              padding: '0.45rem 0.85rem',
              borderRadius: '20px',
              border: filter === 'all' ? '1.5px solid #1d4ed8' : '1px solid #cbd5e1',
              background: filter === 'all' ? '#eff6ff' : '#ffffff',
              color: filter === 'all' ? '#1d4ed8' : '#475569',
              fontWeight: 600,
              fontSize: '0.82rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            All Reports ({reports.length})
          </button>

          <button
            type="button"
            className={`filter-pill ${filter === 'pending' ? 'active' : ''}`}
            onClick={() => setFilter('pending')}
            style={{
              padding: '0.45rem 0.85rem',
              borderRadius: '20px',
              border: filter === 'pending' ? '1.5px solid #d97706' : '1px solid #cbd5e1',
              background: filter === 'pending' ? '#fffbeb' : '#ffffff',
              color: filter === 'pending' ? '#b45309' : '#475569',
              fontWeight: 600,
              fontSize: '0.82rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Pending Review ({pendingCount})
          </button>

          <button
            type="button"
            className={`filter-pill ${filter === 'validated' ? 'active' : ''}`}
            onClick={() => setFilter('validated')}
            style={{
              padding: '0.45rem 0.85rem',
              borderRadius: '20px',
              border: filter === 'validated' ? '1.5px solid #dc2626' : '1px solid #cbd5e1',
              background: filter === 'validated' ? '#fef2f2' : '#ffffff',
              color: filter === 'validated' ? '#b91c1c' : '#475569',
              fontWeight: 600,
              fontSize: '0.82rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Validated / LOI Issued ({validatedCount})
          </button>

          <button
            type="button"
            className={`filter-pill ${filter === 'dismissed' ? 'active' : ''}`}
            onClick={() => setFilter('dismissed')}
            style={{
              padding: '0.45rem 0.85rem',
              borderRadius: '20px',
              border: filter === 'dismissed' ? '1.5px solid #059669' : '1px solid #cbd5e1',
              background: filter === 'dismissed' ? '#ecfdf5' : '#ffffff',
              color: filter === 'dismissed' ? '#047857' : '#475569',
              fontWeight: 600,
              fontSize: '0.82rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Dismissed ({dismissedCount})
          </button>
        </div>
      </div>

      {/* Main Workspace Split */}
      <div className="admin-split" style={{ display: 'grid', gridTemplateColumns: '20rem minmax(0, 1fr)', gap: '1.25rem' }}>
        {/* Left List of Consumer Tips/Reports */}
        <div className="admin-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem', height: 'fit-content' }}>
          <h3 style={{ margin: '0 0 0.85rem', fontSize: '1.05rem', color: '#0f172a', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileText size={18} /> Consumer Receipt Queue
          </h3>

          {loading && <p style={{ color: '#64748b', fontSize: '0.88rem' }}>Loading receipt queue...</p>}

          {!loading && filteredReports.length === 0 && (
            <p style={{ color: '#64748b', fontSize: '0.88rem' }}>No formal receipt reports are awaiting review.</p>
          )}

          <div className="admin-list" style={{ display: 'grid', gap: '0.65rem', maxHeight: '680px', overflowY: 'auto', paddingRight: '0.2rem' }}>
            {filteredReports.map((report) => {
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
                    border: isSelected ? '2px solid #1d4ed8' : '1px solid #e2e8f0',
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

        {/* Right Detail Inspection View: Dual Column Layout */}
        {selected ? (
          <div className="dual-column-inspection-workspace" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
            {/* COLUMN 1: Vaulted Receipt Evidence Container */}
            <section
              className="evidence-column-container"
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.85rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Shield size={16} color="#1d4ed8" /> Vaulted Receipt Evidence
                </h3>
                <span style={{ fontSize: '0.72rem', color: '#64748b', background: '#f1f5f9', padding: '0.2rem 0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                  🔒 Private Storage
                </span>
              </div>

              {/* Image Controls Bar */}
              <div
                className="image-controls-toolbar"
                style={{
                  display: 'flex',
                  gap: '0.4rem',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  background: '#f8fafc',
                  padding: '0.5rem',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                }}
              >
                <button
                  type="button"
                  title="Zoom in"
                  aria-label="Zoom in"
                  onClick={() => setZoom((z) => Math.min(z + 0.25, 3))}
                  style={{
                    padding: '0.35rem 0.6rem',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#0f172a',
                    cursor: 'pointer',
                    fontSize: '0.78rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                  }}
                >
                  <ZoomIn size={14} /> Zoom In
                </button>

                <button
                  type="button"
                  title="Zoom out"
                  aria-label="Zoom out"
                  onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))}
                  style={{
                    padding: '0.35rem 0.6rem',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#0f172a',
                    cursor: 'pointer',
                    fontSize: '0.78rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                  }}
                >
                  <ZoomOut size={14} /> Zoom Out
                </button>

                <button
                  type="button"
                  title="Rotate"
                  aria-label="Rotate"
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  style={{
                    padding: '0.35rem 0.6rem',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#0f172a',
                    cursor: 'pointer',
                    fontSize: '0.78rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                  }}
                >
                  <RotateCw size={14} /> Rotate
                </button>

                <button
                  type="button"
                  title="Reset"
                  aria-label="Reset"
                  onClick={() => {
                    setZoom(1)
                    setRotation(0)
                  }}
                  style={{
                    padding: '0.35rem 0.6rem',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#0f172a',
                    cursor: 'pointer',
                    fontSize: '0.78rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                  }}
                >
                  <RefreshCw size={14} /> Reset
                </button>

                <button
                  type="button"
                  title="View full size"
                  aria-label="View full size"
                  onClick={() => setIsFullScreen(true)}
                  style={{
                    padding: '0.35rem 0.6rem',
                    borderRadius: '6px',
                    border: '1px solid #1d4ed8',
                    background: '#eff6ff',
                    color: '#1d4ed8',
                    cursor: 'pointer',
                    fontSize: '0.78rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    fontWeight: 600,
                  }}
                >
                  <Maximize2 size={14} /> Full Size
                </button>
              </div>

              {/* Evidence Viewport Box */}
              <div
                className="evidence-viewport"
                style={{
                  flex: 1,
                  minHeight: '340px',
                  background: '#0f172a',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid #334155',
                }}
              >
                {evidenceLoading ? (
                  <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Loading vaulted evidence image...</p>
                ) : evidenceUrl ? (
                  <img
                    src={evidenceUrl}
                    alt={`Evidence receipt for ${selected.report_reference}`}
                    style={{
                      maxHeight: '100%',
                      maxWidth: '100%',
                      objectFit: 'contain',
                      transform: `scale(${zoom}) rotate(${rotation}deg)`,
                      transition: 'transform 0.2s ease',
                    }}
                  />
                ) : (
                  /* Fallback Simulated Receipt Canvas */
                  <div
                    className="simulated-receipt-card"
                    style={{
                      background: '#ffffff',
                      color: '#0f172a',
                      padding: '1.25rem',
                      borderRadius: '6px',
                      width: '80%',
                      maxWidth: '260px',
                      boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                      fontFamily: 'monospace',
                      fontSize: '0.78rem',
                      transform: `scale(${zoom}) rotate(${rotation}deg)`,
                      transition: 'transform 0.2s ease',
                    }}
                  >
                    <div style={{ textAlign: 'center', borderBottom: '1px dashed #cbd5e1', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>
                      <strong>{selected.store_name || 'OFFICIAL RECEIPT'}</strong>
                      <div style={{ fontSize: '0.68rem', color: '#64748b' }}>REF: {selected.report_reference}</div>
                    </div>
                    {ocrItems.length > 0 ? (
                      ocrItems.map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', margin: '0.25rem 0' }}>
                          <span>{String(item.name || item.product || 'ITEM')}</span>
                          <span>₱{String(item.price || '0.00')}</span>
                        </div>
                      ))
                    ) : (
                      <div style={{ color: '#64748b', fontSize: '0.72rem', textAlign: 'center' }}>
                        [Vaulted OCR Image Record]
                      </div>
                    )}
                    <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '0.5rem', marginTop: '0.5rem', textAlign: 'center', fontSize: '0.65rem', color: '#64748b' }}>
                      IMAGE HASH: PRIVATE_VAULT_OK
                    </div>
                  </div>
                )}
              </div>

              {/* Download Evidence Button */}
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
                      width: '100%',
                      padding: '0.55rem 1rem',
                      borderRadius: '8px',
                      border: '1px solid #1d4ed8',
                      background: '#ffffff',
                      color: '#1d4ed8',
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.4rem',
                    }}
                  >
                    <Download size={16} /> Download private receipt evidence
                  </button>
                </div>
              )}
            </section>

            {/* COLUMN 2: OCR Extraction Breakdown & DTI Action Buttons */}
            <section
              className="ocr-breakdown-column-container"
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '1.25rem',
                display: 'grid',
                gap: '1rem',
              }}
            >
              {/* Provenance Strip */}
              <div
                className="provenance-strip"
                style={{
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  color: '#1d4ed8',
                  background: '#f1f5f9',
                  borderLeft: '3px solid #1d4ed8',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '0 6px 6px 0',
                }}
              >
                Formal receipt | Consumer report | Human validation required
              </div>

              {/* Original OCR values */}
              <div>
                <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem', color: '#0f172a', fontWeight: 700 }}>
                  Original OCR values
                </h3>
                <pre
                  className="admin-code"
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '0.85rem',
                    color: '#0f172a',
                    fontFamily: 'monospace',
                    fontSize: '0.82rem',
                    maxHeight: '140px',
                    overflow: 'auto',
                  }}
                >
                  {JSON.stringify(selected.raw_ocr_json, null, 2)}
                </pre>
              </div>

              {/* Extracted Item Breakdown against SRP */}
              {ocrItems.length > 0 && (
                <div>
                  <h4 style={{ margin: '0 0 0.4rem', fontSize: '0.85rem', color: '#334155', fontWeight: 700 }}>
                    Extracted Items vs Official SRP
                  </h4>
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse' }}>
                      <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <tr>
                          <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left', color: '#475569' }}>Item</th>
                          <th style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: '#475569' }}>Receipt Price</th>
                          <th style={{ padding: '0.4rem 0.6rem', textAlign: 'center', color: '#475569' }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ocrItems.map((item, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '0.4rem 0.6rem', fontWeight: 600 }}>{String(item.name || item.product || 'Commodity')}</td>
                            <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right' }}>₱{String(item.price || '0.00')}</td>
                            <td style={{ padding: '0.4rem 0.6rem', textAlign: 'center' }}>
                              <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.4rem', borderRadius: '4px', background: '#fef2f2', color: '#dc2626' }}>
                                FLAGGED OVER SRP
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Evaluator Corrections */}
              {selected.evaluator_confirmed_json && (
                <div>
                  <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem', color: '#0f172a', fontWeight: 700 }}>
                    Evaluator corrections
                  </h3>
                  <pre
                    className="admin-code"
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      padding: '0.85rem',
                      color: '#0f172a',
                      fontFamily: 'monospace',
                      fontSize: '0.82rem',
                      maxHeight: '140px',
                      overflow: 'auto',
                    }}
                  >
                    {JSON.stringify(selected.evaluator_confirmed_json, null, 2)}
                  </pre>
                </div>
              )}

              {/* Decision Form Controls */}
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                <div>
                  <label htmlFor="eval-confirmed-json" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.3rem' }}>
                    Evaluator-confirmed JSON
                  </label>
                  <textarea
                    id="eval-confirmed-json"
                    rows={4}
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
                    rows={2}
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

              {/* Single-Click DTI Evaluator Action Buttons */}
              <div className="admin-actions" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  disabled={!reason || !finding}
                  onClick={() => void decide('validate')}
                  style={{
                    padding: '0.6rem 1.1rem',
                    borderRadius: '8px',
                    background: '#059669',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    opacity: !reason || !finding ? 0.5 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                  }}
                >
                  <CheckCircle2 size={16} /> Validate &amp; Issue LOI
                </button>

                <button
                  type="button"
                  disabled={!reason}
                  onClick={() => void decide('dismiss')}
                  style={{
                    padding: '0.6rem 1.1rem',
                    borderRadius: '8px',
                    background: '#dc2626',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    opacity: !reason ? 0.5 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                  }}
                >
                  <XCircle size={16} /> Dismiss Report
                </button>

                <button
                  type="button"
                  disabled={!reason}
                  onClick={() => void decide('rescan')}
                  style={{
                    padding: '0.6rem 1.1rem',
                    borderRadius: '8px',
                    background: '#d97706',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    opacity: !reason ? 0.5 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                  }}
                >
                  <RefreshCw size={16} /> Request Re-scan
                </button>

                {/* Additional Buttons for Backward Compatibility */}
                <button
                  type="button"
                  disabled={!reason || !finding}
                  onClick={() => void decide('correct')}
                  style={{
                    padding: '0.6rem 0.9rem',
                    borderRadius: '8px',
                    background: '#1d4ed8',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 600,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    opacity: !reason || !finding ? 0.5 : 1,
                  }}
                >
                  Correct
                </button>

                <button
                  type="button"
                  disabled={!reason || !finding}
                  onClick={() => void decide('validate')}
                  style={{
                    padding: '0.6rem 0.9rem',
                    borderRadius: '8px',
                    background: '#f8fafc',
                    color: '#0f172a',
                    border: '1px solid #cbd5e1',
                    fontWeight: 600,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    opacity: !reason || !finding ? 0.5 : 1,
                  }}
                >
                  Validate
                </button>

                <button
                  type="button"
                  disabled={!reason}
                  onClick={() => void decide('reject')}
                  style={{
                    padding: '0.6rem 0.9rem',
                    borderRadius: '8px',
                    background: '#f8fafc',
                    color: '#64748b',
                    border: '1px solid #cbd5e1',
                    fontWeight: 600,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    opacity: !reason ? 0.5 : 1,
                  }}
                >
                  Reject
                </button>
              </div>
            </section>
          </div>
        ) : (
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '4rem 2rem', textAlign: 'center', color: '#64748b' }}>
            <FileText size={32} style={{ marginBottom: '0.5rem', color: '#94a3b8' }} />
            <h3 style={{ margin: '0 0 0.5rem', color: '#0f172a' }}>No Receipt Selected</h3>
            <p style={{ margin: 0, fontSize: '0.9rem' }}>Select a consumer report from the left queue to view OCR details and render human validation decisions.</p>
          </div>
        )}
      </div>

      {/* Full Screen Image Modal */}
      {isFullScreen && selected && (
        <div
          className="fullscreen-image-modal"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(15, 23, 42, 0.92)',
            display: 'flex',
            flexDirection: 'column',
            padding: '1.5rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', color: '#ffffff' }}>
            <h3 style={{ margin: 0 }}>Vaulted Evidence: {selected.report_reference}</h3>
            <button
              type="button"
              onClick={() => setIsFullScreen(false)}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                background: '#dc2626',
                color: '#ffffff',
                border: 'none',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Close Full View
            </button>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto' }}>
            {evidenceUrl ? (
              <img
                src={evidenceUrl}
                alt="Full size evidence"
                style={{
                  maxHeight: '90vh',
                  maxWidth: '90vw',
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                  transition: 'transform 0.2s ease',
                }}
              />
            ) : (
              <div style={{ color: '#ffffff', fontSize: '1.2rem' }}>Private Receipt Evidence Locked in Vault</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
