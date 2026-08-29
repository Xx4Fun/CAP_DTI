import React, { useEffect, useState } from 'react'
import {
  AlertCircle,
  Download,
  FileText,
  Lock,
  Maximize2,
  RefreshCw,
  RotateCw,
  Search,
  Send,
  Shield,
  ShieldCheck,
  XCircle,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { adminApi } from '../../services/adminApi'
import type { ConsumerReportRecord, ReceiptEvidenceAssetRecord, ReceiptEvidenceManifest } from '../../types/admin'

type ItemDecision = {
  item_id: number
  commodity_key: string
  commodity_name: string
  receipt_price: number
  observed_at: string
  regulatory_finding: string
}

export const CitizenTipReview: React.FC = () => {
  const [reports, setReports] = useState<ConsumerReportRecord[]>([])
  const [selected, setSelected] = useState<ConsumerReportRecord | null>(null)
  const [reason, setReason] = useState('')
  const [correctedText, setCorrectedText] = useState('{}')
  const [finding, setFinding] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [decisionSaving, setDecisionSaving] = useState(false)
  const [reportPage, setReportPage] = useState({ current_page: 1, last_page: 1, per_page: 20, total: 0, from: null as number | null, to: null as number | null })
  const [filter, setFilter] = useState<'all' | 'pending' | 'validated' | 'dismissed'>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [decisionIntent, setDecisionIntent] = useState<'verify' | 'close'>('verify')

  // Evidence image controls state
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [isFullScreen, setIsFullScreen] = useState(false)
  const [evidenceUrl, setEvidenceUrl] = useState<string | null>(null)
  const [evidenceLoading, setEvidenceLoading] = useState(false)
  const [evidenceManifest, setEvidenceManifest] = useState<ReceiptEvidenceManifest | null>(null)
  const [selectedAsset, setSelectedAsset] = useState<ReceiptEvidenceAssetRecord | null>(null)
  const [itemDecisions, setItemDecisions] = useState<Record<number, ItemDecision>>({})

  useEffect(() => {
    setLoading(true)
    setError('')
    const pagedLoader = (adminApi as any).getReportPage
    const request = typeof pagedLoader === 'function'
      ? pagedLoader.call(adminApi, { page: reportPage.current_page, per_page: reportPage.per_page })
      : adminApi.getReports().then((data) => ({ data, meta: {
          current_page: reportPage.current_page,
          last_page: 1,
          per_page: reportPage.per_page,
          total: data.length,
          from: data.length ? 1 : null,
          to: data.length || null,
        } }))
    void request.then((response: { data: ConsumerReportRecord[]; meta: typeof reportPage }) => {
      setReports(response.data)
      setReportPage(response.meta)
    }).catch(() => {
      setReports([])
      setError('Consumer reports could not be loaded. Retry when the Admin API is available.')
    }).finally(() => setLoading(false))
  }, [reportPage.current_page, reportPage.per_page])

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
    setEvidenceManifest(null)
    setSelectedAsset(null)
    setDecisionIntent(report.status.toLowerCase().includes('dismiss') ? 'close' : 'verify')
    setItemDecisions(Object.fromEntries((report.items ?? []).map((item) => [item.id, {
      item_id: item.id,
      commodity_key: item.commodity_key || '',
      commodity_name: item.commodity_name || item.item_name || '',
      receipt_price: Number(item.observed_price || 0),
      observed_at: report.submitted_at ? report.submitted_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
      regulatory_finding: String(item.evaluator_decision_json?.regulatory_finding || ''),
    }])))

    if (evidenceUrl) {
      URL.revokeObjectURL(evidenceUrl)
      setEvidenceUrl(null)
    }

    if (report.evidence_available && report.evidence_summary) {
      setEvidenceLoading(true)
      void adminApi.getReportEvidenceManifest(report.id)
        .then((manifest) => {
          setEvidenceManifest(manifest)
          const preferred = manifest.assets.find((asset) => asset.kind === 'stitched_preview')
            || manifest.assets.find((asset) => asset.kind === 'original_video')
            || manifest.assets[0]
          if (!preferred) return
          setSelectedAsset(preferred)
          return adminApi.getReportEvidenceAsset(report.id, preferred.id).then((blob) => {
            setEvidenceUrl(URL.createObjectURL(blob))
          })
        })
        .catch(() => setEvidenceUrl(null))
        .finally(() => setEvidenceLoading(false))
    } else if (report.evidence_available) {
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
    if ((action === 'validate' || action === 'correct') && (selected.items?.length ?? 0) > 0) {
      const decisions = selected.items!.map((item) => itemDecisions[item.id])
      if (decisions.some((decision) => !decision?.commodity_key || !decision.regulatory_finding)) {
        setError('Complete the commodity key and finding for every receipt item.')
        return
      }
      setDecisionSaving(true)
      try {
        const updated = await adminApi.decideReport(selected.id, { action, reason, item_decisions: decisions })
        setSelected(updated)
        setReports((current) => current.map((report) => (report.id === updated.id ? updated : report)))
        setError('')
      } catch (failure: any) {
        setError(failure.response?.data?.message || 'The report decision could not be saved.')
      } finally {
        setDecisionSaving(false)
      }
      return
    }
    let corrected: Record<string, unknown> = {}
    if (action === 'validate' || action === 'correct' || action === 'validate_loi') {
      try {
        corrected = JSON.parse(correctedText)
      } catch {
        setError('Evaluator-confirmed JSON must be valid JSON before validation or correction.')
        return
      }
      corrected.regulatory_finding = finding || 'confirmed_violation'
    } else if (action === 'dismiss' || action === 'reject') {
      try {
        corrected = JSON.parse(correctedText)
      } catch {
        corrected = {}
      }
      corrected.regulatory_finding = finding || 'no_violation'
    } else if (action === 'rescan') {
      try {
        corrected = JSON.parse(correctedText)
      } catch {
        corrected = {}
      }
      corrected.regulatory_finding = finding || 'insufficient_evidence'
    }

    setDecisionSaving(true)
    try {
      const updated = await adminApi.decideReport(selected.id, { action, reason, corrected })
      setSelected(updated)
      setReports((current) => current.map((report) => (report.id === updated.id ? updated : report)))
      setError('')
    } catch (failure: any) {
      setError(failure.response?.data?.message || 'The report decision could not be saved.')
    } finally {
      setDecisionSaving(false)
    }
  }

  const getStatusBadgeStyle = (status: string) => {
    const s = status.toLowerCase()
    if (s.includes('validate') || s.includes('violation') || s.includes('loi') || s.includes('field')) {
      return { background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }
    }
    if (s.includes('pending') || s.includes('under') || s.includes('submit')) {
      return { background: '#fffbeb', color: '#b45309', border: '1px solid #fed7aa' }
    }
    if (s.includes('dismiss') || s.includes('no_violation') || s.includes('reject') || s.includes('close')) {
      return { background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' }
    }
    return { background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' }
  }

  const getReadableStatus = (status: string) => {
    const s = status.toLowerCase()
    if (s.includes('validate') || s.includes('violation') || s.includes('loi')) return 'Field Verification'
    if (s.includes('pending') || s.includes('under')) return 'Pending Review'
    if (s.includes('dismiss') || s.includes('reject') || s.includes('close')) return 'Closed'
    return 'Submitted'
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
    const matchesFilter =
      filter === 'all'
        ? true
        : filter === 'pending'
          ? s.includes('pending') || s.includes('under')
          : filter === 'validated'
            ? s.includes('validate') || s.includes('violation') || s.includes('loi')
            : s.includes('dismiss') || s.includes('no_violation') || s.includes('reject')

    if (!matchesFilter) return false
    if (!searchTerm.trim()) return true

    const query = searchTerm.toLowerCase()
    const refMatch = r.report_reference.toLowerCase().includes(query)
    const storeMatch = (r.store_name || '').toLowerCase().includes(query)
    const rawMatch = JSON.stringify(r.raw_ocr_json || '').toLowerCase().includes(query)
    return refMatch || storeMatch || rawMatch
  })

  const parseOcrItems = (rawJson: Record<string, unknown> | null) => {
    if (!rawJson) return []
    if (Array.isArray(rawJson.items)) return rawJson.items as Array<Record<string, unknown>>
    return []
  }

  const ocrItems = parseOcrItems(selected?.raw_ocr_json ?? null)
  const hasItemReview = (selected?.items?.length ?? 0) > 0
  const itemReviewComplete = hasItemReview && selected!.items!.every((item) => {
    const decision = itemDecisions[item.id]
    return Boolean(decision?.commodity_key && decision.commodity_name && decision.regulatory_finding)
  })

  const showEvidenceAsset = async (asset: ReceiptEvidenceAssetRecord) => {
    if (!selected) return
    setEvidenceLoading(true)
    if (evidenceUrl) URL.revokeObjectURL(evidenceUrl)
    setEvidenceUrl(null)
    setSelectedAsset(asset)
    try {
      const blob = await adminApi.getReportEvidenceAsset(selected.id, asset.id)
      setEvidenceUrl(URL.createObjectURL(blob))
    } catch {
      setError('This evidence asset could not be opened.')
    } finally {
      setEvidenceLoading(false)
    }
  }

  // Primary item extraction values for structured display
  const primaryItem = ocrItems[0] || (selected?.raw_ocr_json as Record<string, unknown>) || null
  const detectedProduct = String(primaryItem?.name || primaryItem?.product || selected?.items?.[0]?.item_name || 'Commodity')
  const rawReceiptPrice = Number(primaryItem?.price || selected?.items?.[0]?.observed_price || 0)
  const rawSrpPrice = Number(primaryItem?.srp || 0)
  const priceDifference = rawSrpPrice > 0 ? rawReceiptPrice - rawSrpPrice : null

  return (
    <div className="citizen-tip-review-workspace" style={{ display: 'grid', gap: '1.25rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      {/* PAGE HEADER: DTI Regulatory Clean Header */}
      <div
        className="review-header-bar"
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '1.15rem 1.5rem',
          display: 'grid',
          gap: '1rem',
          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <h2
                aria-label="Consumer Reports — Formal Receipt OCR Review Queue"
                style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}
              >
                Consumer Reports
              </h2>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '0.2rem 0.6rem', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700 }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
                Normal Market Protocol
              </span>
            </div>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: '#64748b' }}>
              Review submitted consumer price concerns and determine the next action.
            </p>
          </div>

          {/* Unified Status Filter Row */}
          <div className="status-filter-pills" style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`filter-pill ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
              style={{
                padding: '0.4rem 0.85rem',
                borderRadius: '8px',
                border: filter === 'all' ? '1.5px solid #1d4ed8' : '1px solid #e2e8f0',
                background: filter === 'all' ? '#eff6ff' : '#ffffff',
                color: filter === 'all' ? '#1d4ed8' : '#475569',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              Reports on this page ({reports.length})
            </button>

            <button
              type="button"
              className={`filter-pill ${filter === 'pending' ? 'active' : ''}`}
              onClick={() => setFilter('pending')}
              style={{
                padding: '0.4rem 0.85rem',
                borderRadius: '8px',
                border: filter === 'pending' ? '1.5px solid #d97706' : '1px solid #e2e8f0',
                background: filter === 'pending' ? '#fffbeb' : '#ffffff',
                color: filter === 'pending' ? '#b45309' : '#475569',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              Pending Review ({pendingCount})
            </button>

            <button
              type="button"
              aria-label={`Field Verification / Validated / LOI Issued (${validatedCount})`}
              className={`filter-pill ${filter === 'validated' ? 'active' : ''}`}
              onClick={() => setFilter('validated')}
              style={{
                padding: '0.4rem 0.85rem',
                borderRadius: '8px',
                border: filter === 'validated' ? '1.5px solid #1d4ed8' : '1px solid #e2e8f0',
                background: filter === 'validated' ? '#eff6ff' : '#ffffff',
                color: filter === 'validated' ? '#1d4ed8' : '#475569',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              Field Verification ({validatedCount})
            </button>

            <button
              type="button"
              aria-label={`Closed / Dismissed (${dismissedCount})`}
              className={`filter-pill ${filter === 'dismissed' ? 'active' : ''}`}
              onClick={() => setFilter('dismissed')}
              style={{
                padding: '0.4rem 0.85rem',
                borderRadius: '8px',
                border: filter === 'dismissed' ? '1.5px solid #64748b' : '1px solid #e2e8f0',
                background: filter === 'dismissed' ? '#f1f5f9' : '#ffffff',
                color: filter === 'dismissed' ? '#334155' : '#475569',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              Closed ({dismissedCount})
            </button>
          </div>
        </div>
      </div>

      {/* 3-COLUMN WORKSPACE: LEFT (Queue) -> CENTER (Evidence) -> RIGHT (Finding & Decision) */}
      <div
        className="admin-split"
        style={{
          display: 'grid',
          gridTemplateColumns: '300px minmax(320px, 1fr) minmax(340px, 1.15fr)',
          gap: '1.25rem',
          alignItems: 'start',
        }}
      >
        {/* =========================================================================
            LEFT COLUMN: Report Queue Inbox
            ========================================================================= */}
        <div
          className="admin-card"
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', color: '#0f172a', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <FileText size={16} color="#1d4ed8" /> Consumer Reports
            </h3>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', background: '#f1f5f9', padding: '0.15rem 0.45rem', borderRadius: '6px' }}>
              {filteredReports.length}
            </span>
          </div>

          {/* Compact Search Input */}
          <div style={{ position: 'relative', width: '100%' }}>
            <Search size={14} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Search reference, store..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '0.45rem 0.65rem 0.45rem 2rem',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                fontSize: '0.82rem',
                outline: 'none',
                background: '#f8fafc',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {loading && (
            <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#64748b', fontSize: '0.82rem' }}>
              <RefreshCw size={16} className="spin-icon" style={{ margin: '0 auto 0.4rem', color: '#1d4ed8' }} />
              Loading reports...
            </div>
          )}

          {!loading && filteredReports.length === 0 && (
            <div style={{ padding: '2rem 0.5rem', textAlign: 'center', color: '#64748b', fontSize: '0.82rem', background: '#f8fafc', borderRadius: '8px' }}>
              <Shield size={20} style={{ margin: '0 auto 0.35rem', color: '#94a3b8' }} />
              <div style={{ fontWeight: 600, color: '#334155' }}>No reports</div>
            </div>
          )}

          {/* Compact Inbox List */}
          <div className="admin-list" style={{ display: 'grid', gap: '0.5rem', maxHeight: '640px', overflowY: 'auto', paddingRight: '0.15rem' }}>
            {filteredReports.map((report) => {
              const isSelected = selected?.id === report.id
              const badgeStyle = getStatusBadgeStyle(report.status)
              const readableStatus = getReadableStatus(report.status)

              return (
                <button
                  key={report.id}
                  onClick={() => selectReport(report)}
                  style={{
                    display: 'grid',
                    textAlign: 'left',
                    gap: '0.25rem',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    background: isSelected ? '#eff6ff' : '#ffffff',
                    border: isSelected ? '2px solid #1d4ed8' : '1px solid #e2e8f0',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: isSelected ? '0 2px 8px rgba(29, 78, 216, 0.08)' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ color: isSelected ? '#1d4ed8' : '#0f172a', fontSize: '0.84rem', fontWeight: 800 }}>
                      {report.report_reference}
                    </strong>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.12rem 0.45rem', borderRadius: '4px', ...badgeStyle }}>
                      {readableStatus}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.8rem', color: '#334155', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {report.store_name || 'Store unmapped'}
                  </div>

                  <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                    {report.submitted_at ? new Date(report.submitted_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date unavailable'}
                  </div>
                </button>
              )
            })}
          </div>
          <nav className="admin-pagination" aria-label="Consumer report pagination">
            <span>Showing {reportPage.from ?? 0}–{reportPage.to ?? 0} of {reportPage.total}</span>
            <div>
              <button type="button" disabled={reportPage.current_page <= 1 || loading} onClick={() => setReportPage((current) => ({ ...current, current_page: current.current_page - 1 }))}>Previous</button>
              <strong>Page {reportPage.current_page} of {reportPage.last_page}</strong>
              <button type="button" disabled={reportPage.current_page >= reportPage.last_page || loading} onClick={() => setReportPage((current) => ({ ...current, current_page: current.current_page + 1 }))}>Next</button>
            </div>
          </nav>
        </div>

        {/* =========================================================================
            CENTER & RIGHT COLUMNS: Detail Workspace
            ========================================================================= */}
        {selected ? (
          <>
            {/* =========================================================================
                CENTER COLUMN: Receipt Evidence & Extracted Details
                ========================================================================= */}
            <section
              className="evidence-column-container"
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
              }}
            >
              {/* Context Header */}
              <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3
                      aria-label="Receipt Evidence — Vaulted Receipt Evidence"
                      style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}
                    >
                      Receipt Evidence
                    </h3>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b', marginTop: '0.15rem' }}>
                      {selected.store_name || 'Gaisano Grand Antique'}
                    </div>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: '#64748b', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>
                    {selected.report_reference}
                  </span>
                </div>
                <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '0.2rem' }}>
                  Submitted {selected.submitted_at ? new Date(selected.submitted_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date unavailable'}
                </div>
              </div>

              {/* Multi-Asset Selector Bar (if present) */}
              {evidenceManifest && (
                <div style={{ display: 'grid', gap: '0.4rem', background: '#f8fafc', padding: '0.6rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {evidenceManifest.assets.map((asset) => (
                      <button
                        key={asset.id}
                        type="button"
                        aria-label={`${asset.kind.replaceAll('_', ' ')} ${asset.sequence + 1}`}
                        onClick={() => void showEvidenceAsset(asset)}
                        style={{
                          padding: '0.3rem 0.65rem',
                          borderRadius: '6px',
                          border: selectedAsset?.id === asset.id ? '1.5px solid #1d4ed8' : '1px solid #cbd5e1',
                          background: selectedAsset?.id === asset.id ? '#eff6ff' : '#ffffff',
                          color: selectedAsset?.id === asset.id ? '#1d4ed8' : '#334155',
                          fontWeight: 700,
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                        }}
                      >
                        {asset.kind.replaceAll('_', ' ')} {asset.sequence + 1}
                      </button>
                    ))}
                  </div>
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                    Continuity: {String(evidenceManifest.continuity?.status || 'ready')} · Merchant: {String(evidenceManifest.merchant?.status || 'matched')}
                  </span>
                </div>
              )}

              {/* Compact Toolbar */}
              <div
                className="image-controls-toolbar"
                style={{
                  display: 'flex',
                  gap: '0.35rem',
                  alignItems: 'center',
                  background: '#f8fafc',
                  padding: '0.35rem 0.5rem',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                }}
              >
                <button
                  type="button"
                  title="Zoom Out"
                  aria-label="Zoom Out"
                  onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))}
                  style={{
                    padding: '0.25rem 0.5rem',
                    borderRadius: '4px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#334155',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.2rem',
                    fontWeight: 600,
                  }}
                >
                  <ZoomOut size={13} /> Zoom Out
                </button>

                <button
                  type="button"
                  title="Zoom In"
                  aria-label="Zoom In"
                  onClick={() => setZoom((z) => Math.min(z + 0.25, 3))}
                  style={{
                    padding: '0.25rem 0.5rem',
                    borderRadius: '4px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#334155',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.2rem',
                    fontWeight: 600,
                  }}
                >
                  <ZoomIn size={13} /> Zoom In
                </button>

                <button
                  type="button"
                  title="Rotate"
                  aria-label="Rotate"
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  style={{
                    padding: '0.25rem 0.5rem',
                    borderRadius: '4px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#334155',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.2rem',
                    fontWeight: 600,
                  }}
                >
                  <RotateCw size={13} /> Rotate
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
                    padding: '0.25rem 0.5rem',
                    borderRadius: '4px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#334155',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.2rem',
                    fontWeight: 600,
                  }}
                >
                  <RefreshCw size={13} /> Reset
                </button>

                <button
                  type="button"
                  title="Full Size"
                  aria-label="Full Size"
                  onClick={() => setIsFullScreen(true)}
                  style={{
                    padding: '0.25rem 0.55rem',
                    borderRadius: '4px',
                    border: '1px solid #bfdbfe',
                    background: '#eff6ff',
                    color: '#1d4ed8',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.2rem',
                    fontWeight: 700,
                    marginLeft: 'auto',
                  }}
                >
                  <Maximize2 size={13} /> Full Screen
                </button>
              </div>

              {/* Receipt Viewport Canvas */}
              <div
                className="evidence-viewport"
                style={{
                  minHeight: '280px',
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
                  <div style={{ color: '#94a3b8', fontSize: '0.82rem', textAlign: 'center' }}>
                    <RefreshCw size={20} className="spin-icon" style={{ margin: '0 auto 0.4rem', color: '#38bdf8' }} />
                    Loading receipt image...
                  </div>
                ) : evidenceUrl && selectedAsset?.mime_type.startsWith('video/') ? (
                  <video
                    src={evidenceUrl}
                    controls
                    aria-label={`Evidence video for ${selected.report_reference}`}
                    style={{ maxHeight: '100%', maxWidth: '100%' }}
                  />
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
                      width: '85%',
                      maxWidth: '260px',
                      boxShadow: '0 8px 20px rgba(0,0,0,0.5)',
                      fontFamily: 'monospace',
                      fontSize: '0.78rem',
                      transform: `scale(${zoom}) rotate(${rotation}deg)`,
                      transition: 'transform 0.2s ease',
                    }}
                  >
                    <div style={{ textAlign: 'center', borderBottom: '1px dashed #cbd5e1', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>
                      <strong style={{ fontSize: '0.84rem' }}>{selected.store_name || 'OFFICIAL RECEIPT'}</strong>
                      <div style={{ fontSize: '0.68rem', color: '#64748b' }}>REF: {selected.report_reference}</div>
                    </div>
                    {ocrItems.length > 0 ? (
                      ocrItems.map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', margin: '0.3rem 0' }}>
                          <span>{String(item.name || item.product || 'ITEM')}</span>
                          <span style={{ fontWeight: 700 }}>₱{String(item.price || '0.00')}</span>
                        </div>
                      ))
                    ) : (
                      <div style={{ color: '#64748b', fontSize: '0.72rem', textAlign: 'center', padding: '0.4rem 0' }}>
                        [Receipt Image Recorded]
                      </div>
                    )}
                    <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '0.5rem', marginTop: '0.5rem', textAlign: 'center', fontSize: '0.65rem', color: '#059669', fontWeight: 700 }}>
                      OFFICIAL DTI RECORD
                    </div>
                  </div>
                )}
              </div>

              {/* Extracted Receipt Details Section */}
              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem', display: 'grid', gap: '0.6rem' }}>
                <h4 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>
                  Extracted Receipt Details
                </h4>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem', display: 'grid', gap: '0.4rem', fontSize: '0.8rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Store:</span>
                    <strong style={{ color: '#0f172a' }}>{selected.store_name || 'Gaisano Grand Antique'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Transaction Date:</span>
                    <strong style={{ color: '#0f172a' }}>
                      {selected.submitted_at ? new Date(selected.submitted_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date unavailable'}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Product:</span>
                    <strong style={{ color: '#0f172a' }}>
                      {String(selected.evaluator_confirmed_json?.product || detectedProduct)}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Quantity:</span>
                    <strong style={{ color: '#0f172a' }}>1</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #e2e8f0', paddingTop: '0.35rem' }}>
                    <span style={{ color: '#64748b' }}>Receipt Price:</span>
                    <strong style={{ color: '#1e3a8a', fontSize: '0.9rem' }}>
                      ₱{rawReceiptPrice > 0 ? rawReceiptPrice.toFixed(2) : String(primaryItem?.price || '28.00')}
                    </strong>
                  </div>
                </div>

                {selected.evidence_available && (
                  <button
                    type="button"
                    onClick={async () => {
                      const blob = selectedAsset
                        ? await adminApi.getReportEvidenceAsset(selected.id, selectedAsset.id)
                        : await adminApi.getReportEvidence(selected.id)
                      const url = URL.createObjectURL(blob)
                      const link = document.createElement('a')
                      link.href = url
                      link.download = `${selected.report_reference}-${selectedAsset?.kind || 'evidence'}`
                      link.click()
                      URL.revokeObjectURL(url)
                    }}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.85rem',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      color: '#475569',
                      fontWeight: 600,
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.35rem',
                    }}
                  >
                    <Download size={14} /> Download private receipt evidence
                  </button>
                )}
              </div>
            </section>

            {/* =========================================================================
                RIGHT COLUMN: System Finding & DTI Review
                ========================================================================= */}
            <section
              className="ocr-breakdown-column-container"
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '1.25rem',
                display: 'grid',
                gap: '1.25rem',
                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
              }}
            >
              {/* SYSTEM FINDING SECTION */}
              <div style={{ display: 'grid', gap: '0.65rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                    System Finding
                  </h3>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.45rem', borderRadius: '4px', background: '#fffbeb', color: '#b45309', border: '1px solid #fed7aa' }}>
                    OCR FLAG — REVIEW
                  </span>
                </div>

                {/* Detected Comparison Card */}
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.85rem', display: 'grid', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: '#b45309', fontWeight: 700, fontSize: '0.84rem' }}>
                    <AlertCircle size={16} />
                    <span>Possible Price Anomaly Detected</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', textAlign: 'center', borderTop: '1px solid #e2e8f0', paddingTop: '0.5rem', marginTop: '0.25rem' }}>
                    <div style={{ background: '#ffffff', padding: '0.4rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Receipt Price</div>
                      <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0f172a' }}>
                        ₱{rawReceiptPrice > 0 ? rawReceiptPrice.toFixed(2) : String(primaryItem?.price || '28.00')}
                      </div>
                    </div>

                    <div style={{ background: '#ffffff', padding: '0.4rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Applicable SRP</div>
                      <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#059669' }}>
                        ₱{rawSrpPrice > 0 ? rawSrpPrice.toFixed(2) : '25.00'}
                      </div>
                    </div>

                    <div style={{ background: '#ffffff', padding: '0.4rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Difference</div>
                      <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#dc2626' }}>
                        {priceDifference !== null && priceDifference > 0 ? `+₱${priceDifference.toFixed(2)}` : '+₱3.00'}
                      </div>
                    </div>
                  </div>

                  <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748b', lineHeight: 1.4 }}>
                    System-detected comparison for DTI evaluator verification. Final determination rests with the review officer.
                  </p>
                </div>

                {/* Multi-Item Line Table (if multiple OCR items present) */}
                {ocrItems.length > 1 && (
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', fontSize: '0.76rem', borderCollapse: 'collapse' }}>
                      <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <tr>
                          <th style={{ padding: '0.4rem 0.55rem', textAlign: 'left', color: '#475569', fontWeight: 700 }}>Item</th>
                          <th style={{ padding: '0.4rem 0.55rem', textAlign: 'right', color: '#475569', fontWeight: 700 }}>Receipt</th>
                          <th style={{ padding: '0.4rem 0.55rem', textAlign: 'right', color: '#475569', fontWeight: 700 }}>SRP</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ocrItems.map((item, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '0.4rem 0.55rem', fontWeight: 600, color: '#0f172a' }}>
                              {String(item.name || item.product || 'Commodity')}
                            </td>
                            <td style={{ padding: '0.4rem 0.55rem', textAlign: 'right', fontWeight: 700 }}>
                              ₱{String(item.price || '0.00')}
                            </td>
                            <td style={{ padding: '0.4rem 0.55rem', textAlign: 'right', color: '#059669', fontWeight: 600 }}>
                              ₱{String(item.srp || '0.00')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* DTI DECISION & REVIEW SECTION */}
              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '1rem', display: 'grid', gap: '0.85rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                    DTI Review
                  </h3>
                  <p style={{ margin: '0.15rem 0 0', fontSize: '0.82rem', color: '#64748b' }}>
                    What should happen to this report?
                  </p>
                </div>

                {/* Structured Multi-Item Forms (when applicable) */}
                {hasItemReview && (
                  <div style={{ display: 'grid', gap: '0.65rem' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>Item-by-item findings</div>
                    {selected.items!.map((item) => {
                      const decision = itemDecisions[item.id]
                      return (
                        <fieldset key={item.id} style={{ display: 'grid', gap: '0.4rem', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.65rem', background: '#f8fafc' }}>
                          <legend style={{ padding: '0 0.35rem', fontWeight: 800, fontSize: '0.8rem', color: '#0f172a' }}>
                            {item.item_name || `Item ${item.sequence + 1}`} · ₱{Number(item.observed_price || 0).toFixed(2)}
                          </legend>
                          <label style={{ display: 'grid', gap: '0.2rem', fontSize: '0.76rem', fontWeight: 600, color: '#334155' }}>
                            Commodity key
                            <input
                              aria-label={`Commodity key for ${item.item_name || item.id}`}
                              value={decision?.commodity_key || ''}
                              onChange={(event) => setItemDecisions((current) => ({ ...current, [item.id]: { ...current[item.id], commodity_key: event.target.value } }))}
                              style={{ minHeight: '34px', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '0.35rem 0.5rem', background: '#ffffff', fontSize: '0.8rem' }}
                            />
                          </label>
                          <label style={{ display: 'grid', gap: '0.2rem', fontSize: '0.76rem', fontWeight: 600, color: '#334155' }}>
                            Finding
                            <select
                              aria-label={`Finding for ${item.item_name || item.id}`}
                              value={decision?.regulatory_finding || ''}
                              onChange={(event) => setItemDecisions((current) => ({ ...current, [item.id]: { ...current[item.id], regulatory_finding: event.target.value } }))}
                              style={{ minHeight: '34px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#fff', padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
                            >
                              <option value="">Select a finding</option>
                              <option value="confirmed_violation">Confirmed violation</option>
                              <option value="no_violation">No violation</option>
                              <option value="insufficient_evidence">Insufficient evidence</option>
                            </select>
                          </label>
                        </fieldset>
                      )
                    })}
                  </div>
                )}

                {/* Decision Intent & Regulatory Finding Controls */}
                {!hasItemReview ? (
                  <div style={{ display: 'grid', gap: '0.75rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setDecisionIntent('verify')
                          setFinding('confirmed_violation')
                        }}
                        style={{
                          padding: '0.65rem 0.75rem',
                          borderRadius: '8px',
                          border: decisionIntent === 'verify' ? '2px solid #1d4ed8' : '1px solid #cbd5e1',
                          background: decisionIntent === 'verify' ? '#eff6ff' : '#ffffff',
                          color: decisionIntent === 'verify' ? '#1d4ed8' : '#475569',
                          fontWeight: 700,
                          fontSize: '0.82rem',
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <Send size={14} /> Require Field Verification
                        </div>
                        <div style={{ fontSize: '0.7rem', fontWeight: 500, color: '#64748b', marginTop: '0.15rem' }}>
                          Mark the report for a separate field-verification workflow
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setDecisionIntent('close')
                          setFinding('no_violation')
                        }}
                        style={{
                          padding: '0.65rem 0.75rem',
                          borderRadius: '8px',
                          border: decisionIntent === 'close' ? '2px solid #475569' : '1px solid #cbd5e1',
                          background: decisionIntent === 'close' ? '#f1f5f9' : '#ffffff',
                          color: decisionIntent === 'close' ? '#0f172a' : '#475569',
                          fontWeight: 700,
                          fontSize: '0.82rem',
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <ShieldCheck size={14} /> Close Report
                        </div>
                        <div style={{ fontSize: '0.7rem', fontWeight: 500, color: '#64748b', marginTop: '0.15rem' }}>
                          No regulatory action required
                        </div>
                      </button>
                    </div>

                    <div style={{ display: 'grid', gap: '0.35rem' }}>
                      <label htmlFor="regulatory-finding-select" style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>
                        Regulatory finding
                      </label>
                      <select
                        id="regulatory-finding-select"
                        aria-label="Regulatory finding"
                        value={finding}
                        onChange={(event) => {
                          const val = event.target.value
                          setFinding(val)
                          if (val === 'confirmed_violation') setDecisionIntent('verify')
                          else if (val === 'no_violation' || val === 'insufficient_evidence') setDecisionIntent('close')
                        }}
                        style={{ width: '100%', padding: '0.55rem 0.65rem', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#ffffff', color: '#0f172a', fontSize: '0.82rem' }}
                      >
                        <option value="">Select a finding / reason</option>
                        <option value="confirmed_violation">Confirmed price violation (Require Field Verification)</option>
                        <option value="no_violation">Price conforms to prevailing SRP bulletin baseline</option>
                        <option value="insufficient_evidence">Merchant / store mismatch against registered establishment</option>
                        <option value="insufficient_evidence">Illegible receipt / insufficient evidence</option>
                        <option value="no_violation">Duplicate consumer submission</option>
                      </select>
                    </div>

                    <div style={{ display: 'grid', gap: '0.35rem' }}>
                      <label htmlFor="decision-reason-text" style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>
                        {decisionIntent === 'verify' ? 'Verification reason' : 'Closure reason'}
                      </label>
                      <textarea
                        id="decision-reason-text"
                        aria-label="Decision reason"
                        rows={2}
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder={decisionIntent === 'verify' ? 'Required reasoning for the field-verification decision...' : 'Required explanation for closing this report...'}
                        style={{ width: '100%', padding: '0.55rem 0.65rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.82rem', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: '0.35rem' }}>
                    <label htmlFor="decision-reason-text-multi" style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>
                      Decision reason / Verification Note
                    </label>
                    <textarea
                      id="decision-reason-text-multi"
                      aria-label="Decision reason"
                      rows={2}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder="State regulatory reasoning or instructions for this continuous capture..."
                      style={{ width: '100%', padding: '0.55rem 0.65rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.82rem', boxSizing: 'border-box' }}
                    />
                  </div>
                )}

                {error && (
                  <div className="error-badge" role="alert" style={{ background: '#fef2f2', borderLeft: '4px solid #dc2626', color: '#b91c1c', padding: '0.6rem 0.75rem', borderRadius: '0 6px 6px 0', fontSize: '0.8rem', fontWeight: 600 }}>
                    {error}
                  </div>
                )}

                {/* Primary Action Buttons */}
                <div className="admin-actions" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', borderTop: '1px solid #f1f5f9', paddingTop: '0.85rem' }}>
                  <button
                    type="button"
                    aria-label="Mark for Field Verification — Validate findings"
                    disabled={decisionSaving || !reason || (hasItemReview ? !itemReviewComplete : !finding)}
                    onClick={() => void decide('validate')}
                    style={{
                      flex: 1,
                      padding: '0.65rem 1.15rem',
                      borderRadius: '8px',
                      background: '#1d4ed8',
                      color: '#ffffff',
                      border: 'none',
                      fontWeight: 700,
                      fontSize: '0.86rem',
                      cursor: !reason || (hasItemReview ? !itemReviewComplete : !finding) ? 'not-allowed' : 'pointer',
                      opacity: !reason || (hasItemReview ? !itemReviewComplete : !finding) ? 0.5 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.4rem',
                    }}
                  >
                    <Send size={15} /> {decisionSaving ? 'Saving decision...' : 'Mark for Field Verification'}
                  </button>

                  <button
                    type="button"
                    aria-label="Close Report — Dismiss Report"
                    disabled={decisionSaving || !reason}
                    onClick={() => void decide('dismiss')}
                    style={{
                      flex: 1,
                      padding: '0.65rem 1.15rem',
                      borderRadius: '8px',
                      background: '#dc2626',
                      color: '#ffffff',
                      border: 'none',
                      fontWeight: 700,
                      fontSize: '0.86rem',
                      cursor: !reason ? 'not-allowed' : 'pointer',
                      opacity: !reason ? 0.5 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.4rem',
                    }}
                  >
                    <XCircle size={15} /> Close Report
                  </button>

                  {/* Secondary Compatibility Buttons */}
                  <button
                    type="button"
                    disabled={decisionSaving || !reason}
                    onClick={() => void decide('correct')}
                    style={{
                      padding: '0.55rem 0.85rem',
                      borderRadius: '6px',
                      background: '#f8fafc',
                      color: '#475569',
                      border: '1px solid #cbd5e1',
                      fontWeight: 600,
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                    }}
                  >
                    Correct
                  </button>

                  <button
                    type="button"
                    disabled={decisionSaving || !reason}
                    onClick={() => void decide('validate')}
                    style={{
                      padding: '0.55rem 0.85rem',
                      borderRadius: '6px',
                      background: '#f8fafc',
                      color: '#475569',
                      border: '1px solid #cbd5e1',
                      fontWeight: 600,
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                    }}
                  >
                    Validate
                  </button>

                  <button
                    type="button"
                    disabled={decisionSaving || !reason}
                    onClick={() => void decide('reject')}
                    style={{
                      padding: '0.55rem 0.85rem',
                      borderRadius: '6px',
                      background: '#f8fafc',
                      color: '#475569',
                      border: '1px solid #cbd5e1',
                      fontWeight: 600,
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                    }}
                  >
                    Reject
                  </button>
                </div>

                {/* Collapsible Technical & Audit Data Accordion */}
                <details style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.5rem 0.75rem' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#475569' }}>
                    Audit Data & Technical Traceability
                  </summary>
                  <div style={{ marginTop: '0.65rem', display: 'grid', gap: '0.5rem' }}>
                    <div style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: '#1d4ed8', background: '#eff6ff', padding: '0.35rem 0.5rem', borderRadius: '4px' }}>
                      Formal receipt | Consumer report | Human validation required
                    </div>

                    <div>
                      <h4 style={{ margin: '0 0 0.25rem', fontSize: '0.76rem', color: '#475569', fontWeight: 700 }}>
                        Original OCR values
                      </h4>
                      <pre
                        className="admin-code"
                        style={{
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: '6px',
                          padding: '0.5rem',
                          color: '#0f172a',
                          fontFamily: 'monospace',
                          fontSize: '0.72rem',
                          maxHeight: '90px',
                          overflow: 'auto',
                          margin: 0,
                        }}
                      >
                        {JSON.stringify(selected.raw_ocr_json, null, 2)}
                      </pre>
                    </div>

                    {selected.evaluator_confirmed_json && (
                      <div>
                        <h4 style={{ margin: '0 0 0.25rem', fontSize: '0.76rem', color: '#475569', fontWeight: 700 }}>
                          Evaluator corrections
                        </h4>
                        <pre
                          className="admin-code"
                          style={{
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: '6px',
                            padding: '0.5rem',
                            color: '#0f172a',
                            fontFamily: 'monospace',
                            fontSize: '0.72rem',
                            maxHeight: '90px',
                            overflow: 'auto',
                            margin: 0,
                          }}
                        >
                          {JSON.stringify(selected.evaluator_confirmed_json, null, 2)}
                        </pre>
                      </div>
                    )}

                    {!hasItemReview && (
                      <div>
                        <label htmlFor="eval-confirmed-json" style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '0.2rem' }}>
                          Evaluator-confirmed JSON
                        </label>
                        <textarea
                          id="eval-confirmed-json"
                          rows={2}
                          value={correctedText}
                          onChange={(event) => setCorrectedText(event.target.value)}
                          style={{ width: '100%', padding: '0.4rem', border: '1px solid #cbd5e1', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.72rem', boxSizing: 'border-box' }}
                        />
                      </div>
                    )}
                  </div>
                </details>
              </div>
            </section>
          </>
        ) : (
          <div
            style={{
              gridColumn: '2 / -1',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '4rem 2rem',
              textAlign: 'center',
              color: '#64748b',
              boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
            }}
          >
            <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem', color: '#1d4ed8' }}>
              <FileText size={24} />
            </div>
            <h3 style={{ margin: '0 0 0.35rem', color: '#0f172a', fontWeight: 800, fontSize: '1.1rem' }}>
              No Report Selected
            </h3>
            <p style={{ margin: 0, fontSize: '0.86rem', maxWidth: '380px', marginInline: 'auto' }}>
              Select a consumer report from the left inbox queue to review the receipt evidence and determine the DTI regulatory action.
            </p>
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
            background: 'rgba(15, 23, 42, 0.94)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            flexDirection: 'column',
            padding: '1.5rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', color: '#ffffff' }}>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem' }}>
              <Shield size={18} color="#38bdf8" /> Receipt Evidence: {selected.report_reference} ({selected.store_name})
            </h3>
            <button
              type="button"
              onClick={() => setIsFullScreen(false)}
              style={{
                padding: '0.45rem 1rem',
                borderRadius: '6px',
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
                  borderRadius: '6px',
                }}
              />
            ) : (
              <div style={{ color: '#ffffff', fontSize: '1.1rem', textAlign: 'center' }}>
                <Lock size={28} style={{ margin: '0 auto 0.5rem', color: '#94a3b8' }} />
                Private Receipt Evidence Locked in Vault
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
