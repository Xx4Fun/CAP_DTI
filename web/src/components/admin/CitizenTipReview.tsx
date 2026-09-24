import React, { useEffect, useRef, useState } from 'react'
import {
  CheckCircle2,
  Circle,
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
import type { ConsumerReportItemRecord, ConsumerReportRecord, ManagedUserRecord, ReceiptEvidenceAssetRecord, ReceiptEvidenceManifest, ReceiptExtractionResult } from '../../types/admin'
import { suggestedUnitPrice, toPrice } from './receiptPrice'
import { EvidenceSectionNav, ReceiptExtractionPanel } from './ReceiptExtractionPanel'
import { ItemReferenceVerdict } from './ItemReferenceVerdict'

type ItemDecision = {
  item_id: number
  commodity_key: string
  commodity_name: string
  /** Per-unit receipt price the evaluator records; blank until known, never defaulted to 0. */
  receipt_price: number | ''
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
  const [verificationChosen, setVerificationChosen] = useState(false)
  const [fieldOfficers, setFieldOfficers] = useState<ManagedUserRecord[]>([])
  const [fieldOfficerId, setFieldOfficerId] = useState('')

  // Evidence image controls state
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [isFullScreen, setIsFullScreen] = useState(false)
  const [evidenceUrl, setEvidenceUrl] = useState<string | null>(null)
  const [evidenceLoading, setEvidenceLoading] = useState(false)
  const [evidenceManifest, setEvidenceManifest] = useState<ReceiptEvidenceManifest | null>(null)
  const [selectedAsset, setSelectedAsset] = useState<ReceiptEvidenceAssetRecord | null>(null)
  const [itemDecisions, setItemDecisions] = useState<Record<number, ItemDecision>>({})
  /** Identifies the newest evidence fetch, so a slower earlier one cannot replace it. */
  const evidenceRequestRef = useRef(0)
  /**
   * The decision values as they stood when the report was opened. `correct` must be sent only when
   * the evaluator actually changed an extracted value, and live state cannot answer that: it is
   * seeded from extraction, so comparing against it would call every report a correction.
   */
  const decisionBaselineRef = useRef<Record<number, ItemDecision> | null>(null)

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
    if (!verificationChosen) return
    void adminApi.getManagedUsers({ role: 'field_officer', status: 'active', per_page: 50 })
      .then((page) => setFieldOfficers(page.records))
      .catch(() => setError('Active Field Officers could not be loaded.'))
  }, [verificationChosen])

  useEffect(() => {
    return () => {
      if (evidenceUrl) {
        URL.revokeObjectURL(evidenceUrl)
      }
    }
  }, [evidenceUrl])

  const selectReport = (report: ConsumerReportRecord) => {
    // Any evidence fetch still in flight belongs to the previous report and must never paint into this one.
    const request = ++evidenceRequestRef.current
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
    setVerificationChosen(false)
    setFieldOfficerId('')
    const observedAt = report.observed_at
      // The purchase date decides which SRP revision applies. Submission can be weeks later, and
      // using it silently judged older receipts against a bulletin that did not exist yet.
      || (report.submitted_at ? report.submitted_at.slice(0, 10) : new Date().toISOString().slice(0, 10))
    const seeded = Object.fromEntries((report.items ?? []).map((item) => {
      // A previously recorded decision is the baseline when one exists; otherwise the extraction is.
      const saved = item.evaluator_decision_json as Partial<ItemDecision> | null | undefined
      return [item.id, {
        item_id: item.id,
        commodity_key: String(saved?.commodity_key ?? item.commodity_key ?? ''),
        commodity_name: String(saved?.commodity_name ?? item.commodity_name ?? item.item_name ?? ''),
        receipt_price: typeof saved?.receipt_price === 'number' ? saved.receipt_price : (suggestedUnitPrice(item) ?? ''),
        observed_at: String(saved?.observed_at ?? observedAt),
        regulatory_finding: String(saved?.regulatory_finding ?? ''),
      } satisfies ItemDecision]
    }))
    setItemDecisions(seeded)
    // Snapshot for the correct-vs-validate decision; see decisionBaselineRef.
    decisionBaselineRef.current = JSON.parse(JSON.stringify(seeded))

    if (evidenceUrl) {
      URL.revokeObjectURL(evidenceUrl)
      setEvidenceUrl(null)
    }

    if (report.evidence_available && report.evidence_summary) {
      setEvidenceLoading(true)
      void adminApi.getReportEvidenceManifest(report.id)
        .then((manifest) => {
          if (request !== evidenceRequestRef.current) return
          setEvidenceManifest(manifest)
          const preferred = manifest.assets.find((asset) => asset.kind === 'source_frame' && asset.is_current !== false)
            || manifest.assets.find((asset) => asset.kind === 'original_video' && asset.is_current !== false)
            || manifest.assets.find((asset) => asset.kind === 'source_frame')
            || manifest.assets.find((asset) => asset.kind === 'original_video')
            || manifest.assets.find((asset) => asset.kind === 'stitched_preview')
            || manifest.assets[0]
          if (!preferred) return
          setSelectedAsset(preferred)
          return adminApi.getReportEvidenceAsset(report.id, preferred.id).then((blob) => {
            if (request !== evidenceRequestRef.current) return
            setEvidenceUrl(URL.createObjectURL(blob))
          })
        })
        .catch(() => { if (request === evidenceRequestRef.current) setEvidenceUrl(null) })
        .finally(() => { if (request === evidenceRequestRef.current) setEvidenceLoading(false) })
    } else if (report.evidence_available) {
      setEvidenceLoading(true)
      try {
        const res = adminApi.getReportEvidence?.(report.id)
        if (res && typeof res.then === 'function') {
          res
            .then((blob) => {
              if (blob && request === evidenceRequestRef.current) {
                setEvidenceUrl(URL.createObjectURL(blob))
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

  const requestVerification = async () => {
    if (!selected || !reason.trim() || !fieldOfficerId) return
    setDecisionSaving(true)
    try {
      const request = await adminApi.requestFieldVerification(selected.id, { reason: reason.trim(), field_officer_id: Number(fieldOfficerId) })
      const updated = { ...selected, status: 'Referred for field verification', verification_request: request }
      setSelected(updated)
      setReports((current) => current.map((report) => report.id === updated.id ? updated : report))
      setReason('')
      setError('')
    } catch (failure: any) {
      setError(failure.response?.data?.message || 'The field verification request could not be created.')
    } finally {
      setDecisionSaving(false)
    }
  }

  const cancelVerification = async () => {
    if (!selected?.verification_request) return
    setDecisionSaving(true)
    try {
      const request = await adminApi.cancelFieldVerification(selected.verification_request.id)
      const updated = { ...selected, verification_request: request }
      setSelected(updated)
      setReports((current) => current.map((report) => report.id === updated.id ? updated : report))
      setError('')
    } catch (failure: any) {
      setError(failure.response?.data?.message || 'The field verification request could not be cancelled.')
    } finally {
      setDecisionSaving(false)
    }
  }

  /** Names the status tone; admin.css owns the colours. */
  const getStatusTone = (status: string) => {
    const s = status.toLowerCase()
    if (s.includes('validate') || s.includes('violation') || s.includes('loi') || s.includes('field')) return 'accent'
    if (s.includes('pending') || s.includes('under') || s.includes('submit')) return 'warn'
    return 'muted'
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

  /** The suggestion an evaluator picked, matched by the commodity key the option submitted. */
  const candidateFor = (item: ConsumerReportItemRecord, commodityKey: string) =>
    (item.reference?.match_candidates ?? []).find((candidate) => candidate.commodity_key === commodityKey)

  /**
   * Report-level roll-up of the per-item references the server resolved. Items with no applicable
   * reference are counted separately and never folded into "within reference", so an unmatched line
   * can never read as compliant.
   */
  const comparisonSummary = (selected?.items ?? []).reduce(
    (totals, item) => {
      const above = item.reference?.is_above_reference
      if (above === true) {
        totals.above += 1
        totals.compared += 1
        totals.excess += item.reference?.peso_difference ?? 0
      } else if (above === false) {
        totals.within += 1
        totals.compared += 1
      } else {
        totals.unresolved += 1
      }
      totals.total += 1
      return totals
    },
    { above: 0, within: 0, unresolved: 0, compared: 0, total: 0, excess: 0 },
  )
  const itemReviewComplete = hasItemReview && selected!.items!.every((item) => {
    const decision = itemDecisions[item.id]
    return Boolean(decision?.commodity_key && decision.commodity_name && decision.regulatory_finding)
      && typeof decision.receipt_price === 'number' && decision.receipt_price >= 0
  })

  /** Per-item completeness, so progress and the blocking reason share one definition. */
  const isItemDecided = (itemId: number) => {
    const decision = itemDecisions[itemId]
    return Boolean(decision?.commodity_key && decision.commodity_name && decision.regulatory_finding)
      && typeof decision.receipt_price === 'number' && decision.receipt_price >= 0
  }

  const decidedItemCount = (selected?.items ?? []).filter((item) => isItemDecided(item.id)).length

  /**
   * Why the submit is blocked, in words. Previously the button was simply dimmed, which on a
   * 12-item receipt left the evaluator hunting for the row that was still missing a field.
   */
  const blockingReason = (() => {
    if (!reason) return 'Add a decision reason'
    const pending = (selected?.items ?? []).filter((item) => !isItemDecided(item.id))
    if (pending.length === 0) return ''
    const first = pending[0]
    const missing = (() => {
      const decision = itemDecisions[first.id]
      if (!decision?.commodity_key) return 'commodity'
      if (typeof decision.receipt_price !== 'number') return 'unit price'
      return 'finding'
    })()
    return pending.length === 1
      ? `${first.item_name || `Item ${first.sequence + 1}`} still needs a ${missing}`
      : `${pending.length} items incomplete — next: ${first.item_name || `Item ${first.sequence + 1}`} needs a ${missing}`
  })()

  /**
   * Whether this submission edits values the system extracted, which decides `correct` vs
   * `validate` and therefore which audit event is recorded. Compared against a snapshot taken
   * when the report was selected, not against live state — live state is seeded from extraction,
   * so comparing with it would mark untouched reports as corrected.
   */
  const isCorrection = (() => {
    const baseline = decisionBaselineRef.current
    if (!baseline) return false
    return Object.entries(itemDecisions).some(([itemId, decision]) => {
      const original = baseline[Number(itemId)]
      if (!original) return true
      return original.commodity_key !== decision.commodity_key
        || original.commodity_name !== decision.commodity_name
        || original.receipt_price !== decision.receipt_price
        || original.observed_at !== decision.observed_at
    })
  })()

  const showEvidenceAsset = async (asset: ReceiptEvidenceAssetRecord) => {
    if (!selected) return
    const request = ++evidenceRequestRef.current
    setEvidenceLoading(true)
    if (evidenceUrl) URL.revokeObjectURL(evidenceUrl)
    setEvidenceUrl(null)
    setSelectedAsset(asset)
    try {
      const blob = await adminApi.getReportEvidenceAsset(selected.id, asset.id)
      // An earlier, slower fetch must never display under the section label the evaluator is now reading.
      if (request !== evidenceRequestRef.current) return
      setEvidenceUrl(URL.createObjectURL(blob))
    } catch {
      if (request === evidenceRequestRef.current) setError('This evidence asset could not be opened.')
    } finally {
      if (request === evidenceRequestRef.current) setEvidenceLoading(false)
    }
  }

  const persistedOcrItems: Array<Record<string, unknown>> = (selected?.items ?? []).map((item) => ({
    name: item.item_name,
    quantity: item.quantity,
    // Compare per-unit prices with the SRP; a multi-unit line total is not a unit price.
    price: suggestedUnitPrice(item),
    ocr_confidence: item.ocr_confidence,
  }))
  const rawOcr = selected?.raw_ocr_json
  const legacyOcrItem = rawOcr && (rawOcr.name !== undefined || rawOcr.product !== undefined || rawOcr.price !== undefined || rawOcr.quantity !== undefined)
    ? rawOcr
    : null
  const structuredOcrItems = persistedOcrItems.length > 0 ? persistedOcrItems : ocrItems.length > 0 ? ocrItems : legacyOcrItem ? [legacyOcrItem] : []
  const primaryItem = structuredOcrItems[0] ?? null
  const receiptPriceValue = primaryItem?.price
  const srpPriceValue = primaryItem?.srp
  const rawReceiptPrice = receiptPriceValue !== undefined && receiptPriceValue !== null && Number.isFinite(Number(receiptPriceValue)) ? Number(receiptPriceValue) : null
  const rawSrpPrice = srpPriceValue !== undefined && srpPriceValue !== null && Number.isFinite(Number(srpPriceValue)) ? Number(srpPriceValue) : null
  const priceDifference = rawReceiptPrice !== null && rawSrpPrice !== null ? rawReceiptPrice - rawSrpPrice : null
  const detectedTransactionDate = primaryItem?.transaction_date ?? selected?.raw_ocr_json?.transaction_date ?? null
  const merchantResult = selected?.raw_ocr_json?.merchant as { display_name?: unknown } | undefined
  const detectedMerchant = typeof merchantResult?.display_name === 'string' ? merchantResult.display_name : null

  return (
    <div className="citizen-tip-review-workspace consumer-report-panel">
      <div className="review-header-bar consumer-report-card consumer-report-header">
        <div className="consumer-report-header-row">
          <div>
            <div className="consumer-report-title">
              <h2 aria-label="Consumer Reports — Formal Receipt OCR Review Queue">Consumer Reports</h2>
              {/* Derived from the emergency in force on the selected receipt's transaction date, not
                  from today's state: a receipt bought during a freeze is judged under that freeze. */}
              {(() => {
                const emergency = selected?.protocol?.mode === 'emergency'
                return (
                  <span className={`consumer-report-protocol${emergency ? ' is-emergency' : ''}`}>
                    <span className="consumer-report-protocol-dot" />
                    {!selected
                      ? 'Select a report to see the applicable protocol'
                      : emergency
                        ? `Price Freeze Protocol${selected.protocol?.reference ? ` · ${selected.protocol.reference}` : ''}`
                        : 'Normal Market Protocol'}
                  </span>
                )
              })()}
            </div>
            <p className="consumer-report-subtitle">
              Review submitted consumer price concerns and determine the next action.
            </p>
          </div>

          {/* One pill per bucket. The tone is named, not spelled out per button: these were four
              near-identical style objects differing only in colour. */}
          <div className="status-filter-pills consumer-report-filters">
            {([
              { id: 'all', tone: 'accent', label: `Reports on this page (${reports.length})` },
              { id: 'pending', tone: 'warn', label: `Pending Review (${pendingCount})` },
              { id: 'validated', tone: 'accent', label: `Field Verification (${validatedCount})`, aria: `Field Verification / Validated / LOI Issued (${validatedCount})` },
              { id: 'dismissed', tone: 'muted', label: `Closed (${dismissedCount})`, aria: `Closed / Dismissed (${dismissedCount})` },
            ] as const).map((pill) => (
              <button
                key={pill.id}
                type="button"
                aria-label={'aria' in pill ? pill.aria : undefined}
                className={`filter-pill tone-${pill.tone} ${filter === pill.id ? 'active' : ''}`}
                onClick={() => setFilter(pill.id)}
              >
                {pill.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* TWO PANES: Queue | Workspace, where the workspace holds evidence beside the
          item list so the receipt and the line being decided stay adjacent.
          Sizing lives in admin.css (.consumer-report-*) and is driven by container
          width; the inline grid-template-columns this replaced beat the stylesheet's
          media query, so the layout never reflowed at any width. */}
      <div className="consumer-report-split">
        {/* =========================================================================
            LEFT COLUMN: Report Queue Inbox
            ========================================================================= */}
        <div className="admin-card consumer-report-card consumer-report-queue">
          <div className="consumer-report-queue-head">
            <h3><FileText size={16} /> Consumer Reports</h3>
            <span className="consumer-report-queue-count">{filteredReports.length}</span>
          </div>

          <div className="admin-search-field consumer-report-search">
            <Search size={14} />
            <input
              type="text"
              placeholder="Search reference, store..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {loading && (
            <div className="consumer-report-queue-empty">
              <RefreshCw size={16} className="spin-icon" />
              Loading reports...
            </div>
          )}

          {!loading && filteredReports.length === 0 && (
            <div className="consumer-report-queue-empty has-surface">
              <Shield size={20} />
              <div className="consumer-report-queue-empty-title">No reports</div>
            </div>
          )}

          <div className="admin-list consumer-report-queue-list">
            {filteredReports.map((report) => {
              const isSelected = selected?.id === report.id
              const tone = getStatusTone(report.status)
              const readableStatus = getReadableStatus(report.status)

              return (
                <button
                  key={report.id}
                  className={`consumer-report-queue-row${isSelected ? ' is-selected' : ''}`}
                  onClick={() => selectReport(report)}
                >
                  <div className="consumer-report-queue-row-top">
                    <strong>{report.report_reference}</strong>
                    <span className={`consumer-report-status tone-${tone}`}>{readableStatus}</span>
                  </div>

                  <div className="consumer-report-queue-store">
                    {report.store_name || 'Store unmapped'}
                  </div>

                  <div className="consumer-report-queue-row-bottom">
                    <span className="consumer-report-queue-date">
                      {report.submitted_at ? new Date(report.submitted_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date unavailable'}
                    </span>
                    {/* Lets an evaluator triage the queue without opening every report. */}
                    {(report.above_reference_count ?? 0) > 0 && (
                      <span
                        className="consumer-report-above-badge"
                        title={`${report.above_reference_count} item(s) priced above the applicable reference`}
                      >
                        {report.above_reference_count} above SRP
                      </span>
                    )}
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
          // Two elements on purpose: the outer one is the query container, the inner one is the
          // grid it sizes. A container query cannot restyle its own container element.
          <div className="consumer-report-workspace"><div className="consumer-report-panes">
            {/* =========================================================================
                EVIDENCE: sticky, so the receipt stays on screen while the item list
                beside it scrolls. These two used to be separate top-level columns, which
                put a column boundary through the comparison the evaluator has to make.
                ========================================================================= */}
            <section
              className="evidence-column-container consumer-report-evidence consumer-report-card"
              style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}
            >
              {/* Context Header */}
              <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                      Original captured receipt evidence
                    </h3>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b', marginTop: '0.15rem' }}>
                      {selected.store_name || 'Store unavailable'}
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
                        {asset.kind === 'source_frame' ? `Original section ${asset.sequence + 1}` : `${asset.kind.replaceAll('_', ' ')} ${asset.sequence + 1}`}
                        {asset.attempt_number ? ` · attempt ${asset.attempt_number}${asset.is_current ? ' (current)' : ''}` : ''}
                      </button>
                    ))}
                  </div>
                  <EvidenceSectionNav assets={evidenceManifest.assets} selected={selectedAsset} busy={evidenceLoading} onSelect={(asset) => void showEvidenceAsset(asset)} />
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                    Continuity: {String(evidenceManifest.continuity?.status || 'Not available')} · Merchant: {String(evidenceManifest.merchant?.status || 'Not available')}
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
                ) : <div style={{ color: '#cbd5e1', padding: '1.25rem', display: 'grid', justifyItems: 'center', gap: '0.5rem', textAlign: 'center' }}>
                  <Lock size={26} />
                  <strong>Receipt evidence unavailable</strong>
                  <span style={{ fontSize: '0.76rem' }}>No stored original can be displayed for this report.</span>
                </div>}
              </div>

              {/* Extracted Receipt Details Section */}
              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem', display: 'grid', gap: '0.6rem' }}>
                <h4 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>
                  Raw OCR and system-extracted information
                </h4>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem', display: 'grid', gap: '0.4rem', fontSize: '0.8rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Merchant OCR:</span>
                    <strong style={{ color: '#0f172a' }}>{detectedMerchant || 'Not detected'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Transaction Date:</span>
                    <strong style={{ color: '#0f172a' }}>
                      {detectedTransactionDate ? String(detectedTransactionDate) : 'Not detected'}
                    </strong>
                  </div>
                </div>

                <ReceiptExtractionPanel result={evidenceManifest?.processing_result as ReceiptExtractionResult | null | undefined} />

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
              className="ocr-breakdown-column-container consumer-report-card"
              style={{ padding: '1.25rem', display: 'grid', gap: '1.25rem' }}
            >
              {/* SYSTEM FINDING SECTION */}
              <div style={{ display: 'grid', gap: '0.65rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                    System extraction status
                  </h3>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.45rem', borderRadius: '4px', background: '#fffbeb', color: '#b45309', border: '1px solid #fed7aa' }}>
                    OCR FLAG — REVIEW
                  </span>
                </div>

                {/* Detected Comparison Card.
                    An item report is summarised from the per-item references resolved by the server;
                    the single-price tiles below are the legacy path, which has one price and no items. */}
                {hasItemReview ? (
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.85rem', display: 'grid', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: comparisonSummary.compared > 0 ? '#0f172a' : '#b45309', fontWeight: 700, fontSize: '0.84rem' }}>
                      <AlertCircle size={16} />
                      <span>
                        {comparisonSummary.compared > 0
                          ? `Compared ${comparisonSummary.compared} of ${comparisonSummary.total} item(s) against the applicable reference`
                          : 'No item could be compared — match a commodity to each line below'}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', textAlign: 'center', borderTop: '1px solid #e2e8f0', paddingTop: '0.5rem', marginTop: '0.25rem' }}>
                      <div style={{ background: '#ffffff', padding: '0.4rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Items above reference</div>
                        <div style={{ fontSize: '0.92rem', fontWeight: 800, color: comparisonSummary.above > 0 ? '#dc2626' : '#0f172a' }}>
                          {comparisonSummary.above}
                        </div>
                      </div>

                      <div style={{ background: '#ffffff', padding: '0.4rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Items within reference</div>
                        <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#059669' }}>{comparisonSummary.within}</div>
                      </div>

                      <div style={{ background: '#ffffff', padding: '0.4rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Total excess</div>
                        <div style={{ fontSize: '0.92rem', fontWeight: 800, color: comparisonSummary.excess > 0 ? '#dc2626' : '#0f172a' }}>
                          {comparisonSummary.above > 0 ? `+₱${comparisonSummary.excess.toFixed(2)}` : '₱0.00'}
                        </div>
                      </div>
                    </div>

                    {comparisonSummary.unresolved > 0 && (
                      <p style={{ margin: 0, fontSize: '0.72rem', color: '#b45309', fontWeight: 600 }}>
                        {comparisonSummary.unresolved} item(s) have no applicable reference and are not counted above.
                      </p>
                    )}

                    <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748b', lineHeight: 1.4 }}>
                      System-detected comparison for DTI evaluator verification. Final determination rests with the review officer.
                    </p>
                  </div>
                ) : (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.85rem', display: 'grid', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: '#b45309', fontWeight: 700, fontSize: '0.84rem' }}>
                    <AlertCircle size={16} />
                    <span>{priceDifference !== null ? 'Automated price comparison available' : 'No automated price comparison available'}</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', textAlign: 'center', borderTop: '1px solid #e2e8f0', paddingTop: '0.5rem', marginTop: '0.25rem' }}>
                    <div style={{ background: '#ffffff', padding: '0.4rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Receipt Price</div>
                      <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0f172a' }}>
                        {rawReceiptPrice !== null ? `₱${rawReceiptPrice.toFixed(2)}` : 'Unavailable'}
                      </div>
                    </div>

                    <div style={{ background: '#ffffff', padding: '0.4rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Applicable SRP</div>
                      <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#059669' }}>
                        {rawSrpPrice !== null ? `₱${rawSrpPrice.toFixed(2)}` : 'Unavailable'}
                      </div>
                    </div>

                    <div style={{ background: '#ffffff', padding: '0.4rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Difference</div>
                      <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#dc2626' }}>
                        {priceDifference !== null ? `${priceDifference > 0 ? '+' : ''}₱${priceDifference.toFixed(2)}` : 'Unavailable'}
                      </div>
                    </div>
                  </div>

                  <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748b', lineHeight: 1.4 }}>
                    System-detected comparison for DTI evaluator verification. Final determination rests with the review officer.
                  </p>
                </div>
                )}

                {/* Legacy reports only. When the report has persisted items, the same rows already
                    appear twice — read-only under "System extraction" and editable under
                    "Item-by-item findings" — so a third copy here only cost the evaluator a re-read. */}
                {!hasItemReview && structuredOcrItems.length > 0 && (
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', fontSize: '0.76rem', borderCollapse: 'collapse' }}>
                      <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <tr>
                          <th style={{ padding: '0.4rem 0.55rem', textAlign: 'left', color: '#475569', fontWeight: 700 }}>Item</th>
                          <th style={{ padding: '0.4rem 0.55rem', textAlign: 'left', color: '#475569', fontWeight: 700 }}>Quantity</th>
                          <th style={{ padding: '0.4rem 0.55rem', textAlign: 'right', color: '#475569', fontWeight: 700 }}>Price</th>
                          <th style={{ padding: '0.4rem 0.55rem', textAlign: 'right', color: '#475569', fontWeight: 700 }}>OCR confidence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {structuredOcrItems.map((item, idx) => {
                          const confidence = Number(item.ocr_confidence)
                          const measuredConfidence = item.ocr_confidence !== null && item.ocr_confidence !== undefined && Number.isFinite(confidence) && confidence !== 0.8
                          return (
                            <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '0.4rem 0.55rem', fontWeight: 600, color: '#0f172a' }}>{String(item.name || item.product || 'Item label not detected')}</td>
                              <td style={{ padding: '0.4rem 0.55rem' }}>{item.quantity !== undefined && item.quantity !== null ? String(item.quantity) : 'Quantity unavailable'}</td>
                              <td style={{ padding: '0.4rem 0.55rem', textAlign: 'right', fontWeight: 700 }}>{item.price !== undefined && item.price !== null ? `₱${String(item.price)}` : 'Price unavailable'}</td>
                              <td style={{ padding: '0.4rem 0.55rem', textAlign: 'right' }}>{measuredConfidence ? `${Math.round(confidence * 100)}% measured` : 'Confidence unavailable'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* DTI DECISION & REVIEW SECTION */}
              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '1rem', display: 'grid', gap: '0.85rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                    DTI evaluator findings and decision
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
                      const decided = isItemDecided(item.id)
                      return (
                        <fieldset key={item.id} className={`consumer-report-item${decided ? ' is-decided' : ''}`}>
                          {/* Identity, then the verdict, then the fields that settle it. These read
                              as one unit now; previously the three inputs stacked under a legend as
                              four unrelated controls with nothing tying them together. */}
                          <div className="consumer-report-item-head">
                            <strong>{item.item_name || `Item ${item.sequence + 1}`}</strong>
                            <span className={`consumer-report-item-state${decided ? ' done' : ''}`}>
                              {decided ? <CheckCircle2 size={13} aria-hidden="true" /> : <Circle size={13} aria-hidden="true" />}
                              {decided ? 'Decided' : 'Needs a decision'}
                            </span>
                          </div>
                          <div className="consumer-report-item-meta">
                            {toPrice(item.line_total ?? item.observed_price) !== null
                              ? `line total ₱${toPrice(item.line_total ?? item.observed_price)!.toFixed(2)}`
                              : 'line total not available'}
                            {toPrice(item.quantity) !== null ? ` · qty ${toPrice(item.quantity)}` : ''}
                            {toPrice(item.ocr_confidence) !== null && toPrice(item.ocr_confidence) !== 0.8
                              ? ` · OCR ${Math.round(toPrice(item.ocr_confidence)! * 100)}%`
                              : ''}
                          </div>
                          <ItemReferenceVerdict reference={item.reference} />
                          <div className="consumer-report-item-fields">
                            <label>
                              Receipt unit price (₱)
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                required
                                aria-label={`Receipt unit price for ${item.item_name || item.id}`}
                                value={decision?.receipt_price ?? ''}
                                onChange={(event) => setItemDecisions((current) => ({
                                  ...current,
                                  [item.id]: { ...current[item.id], receipt_price: event.target.value === '' ? '' : Number(event.target.value) },
                                }))}
                              />
                              {suggestedUnitPrice(item) === null && (
                                <small>Unit price not available from the receipt extraction. Enter it from the original photo.</small>
                              )}
                            </label>
                            <label>
                              Commodity key
                              {/* Pre-filled from the automatic match when one was confident. The list
                                  offers the ranked alternatives so a wrong or missing match is corrected
                                  by choosing, not by recalling an exact key from memory. */}
                              <input
                                list={`commodity-options-${item.id}`}
                                aria-label={`Commodity key for ${item.item_name || item.id}`}
                                value={decision?.commodity_key || ''}
                                onChange={(event) => setItemDecisions((current) => ({
                                  ...current,
                                  [item.id]: {
                                    ...current[item.id],
                                    commodity_key: event.target.value,
                                    // Choosing a suggestion must carry its name across too. Updating only
                                    // the key would store a canonical key beside the unmatched OCR name.
                                    commodity_name: candidateFor(item, event.target.value)?.commodity_name
                                      ?? current[item.id]?.commodity_name
                                      ?? '',
                                  },
                                }))}
                              />
                              <datalist id={`commodity-options-${item.id}`}>
                                {/* The value is the commodity KEY, because the server resolves the
                                    regulatory reference by exact key. Offering the display name here
                                    made every chosen suggestion fail to resolve. Keyless bulletins
                                    cannot resolve at all, so they are not offered. */}
                                {(item.reference?.match_candidates ?? [])
                                  .filter((candidate) => Boolean(candidate.commodity_key))
                                  .map((candidate) => (
                                    <option key={candidate.id} value={candidate.commodity_key as string}>
                                      {candidate.commodity_name}
                                      {candidate.package_size ? ` · ${candidate.package_size}` : ''}
                                      {` · match ${candidate.match_score}`}
                                    </option>
                                  ))}
                              </datalist>
                            </label>
                            <label>
                              Finding
                              <select
                                aria-label={`Finding for ${item.item_name || item.id}`}
                                value={decision?.regulatory_finding || ''}
                                onChange={(event) => setItemDecisions((current) => ({ ...current, [item.id]: { ...current[item.id], regulatory_finding: event.target.value } }))}
                              >
                                <option value="">Select a finding</option>
                                <option value="confirmed_violation">Confirmed violation</option>
                                <option value="no_violation">No violation</option>
                                <option value="insufficient_evidence">Insufficient evidence</option>
                              </select>
                            </label>
                          </div>
                        </fieldset>
                      )
                    })}
                  </div>
                )}

                {/* Decision Intent & Regulatory Finding Controls */}
                {selected.verification_request && (
                  <section aria-label="Field verification request" style={{ display: 'grid', gap: '0.45rem', padding: '0.75rem', border: '1px solid #bfdbfe', borderRadius: '8px', background: '#eff6ff' }}>
                    <strong>Field verification request</strong>
                    <small>{selected.status}</small>
                    <span>{selected.verification_request.status.charAt(0).toUpperCase() + selected.verification_request.status.slice(1)}</span>
                    <p style={{ margin: 0 }}>{selected.verification_request.reason}</p>
                    {selected.verification_request.status === 'open' && <button type="button" className="admin-button secondary" disabled={decisionSaving} onClick={() => void cancelVerification()}>Cancel field verification</button>}
                  </section>
                )}
                {/* Referral is available for BOTH report shapes. It used to live only in the
                    legacy branch below, so on an item report — the normal case — the officer
                    selector never rendered and a referral could not be made at all. */}
                {!selected.verification_request && (
                  <section aria-label="Refer for field verification" style={{ display: 'grid', gap: '0.45rem', padding: '0.75rem', border: '1px solid #cbd5e1', borderRadius: '8px', background: '#f8fafc' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                      <input
                        type="checkbox"
                        checked={verificationChosen}
                        onChange={(event) => {
                          setVerificationChosen(event.target.checked)
                          setDecisionIntent(event.target.checked ? 'verify' : 'close')
                          if (!event.target.checked) setFieldOfficerId('')
                        }}
                      />
                      <Send size={14} aria-hidden="true" /> Refer this report for field verification
                    </label>
                    {verificationChosen && (
                      <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>
                        Field Officer
                        <select
                          aria-label="Field Officer"
                          required
                          value={fieldOfficerId}
                          onChange={(event) => setFieldOfficerId(event.target.value)}
                          style={{ width: '100%', padding: '0.55rem 0.65rem', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#ffffff' }}
                        >
                          <option value="">Select active officer</option>
                          {fieldOfficers.map((officer) => <option key={officer.id} value={officer.id}>{officer.name}</option>)}
                        </select>
                      </label>
                    )}
                  </section>
                )}

                {!hasItemReview ? (
                  <div style={{ display: 'grid', gap: '0.75rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                      {!selected.verification_request && <button
                        type="button"
                        onClick={() => {
                          setDecisionIntent('verify')
                          setFinding('confirmed_violation')
                          setVerificationChosen(true)
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
                      </button>}

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
                          setVerificationChosen(false)
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
                      {/* The officer selector now lives in the shared referral section above, so
                          both report shapes reach it. */}
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

                {/* DECISION BAR - sticky, so it is reachable without scrolling past every
                    item. Four controls, each named for what it writes. The previous five
                    included a duplicate "Validate" and a primary labelled "Mark for Field
                    Verification" that actually sent `validate`. Closure labels deliberately
                    avoid naming a determination: `dismiss` and `reject` record NO finding and
                    delete any prior one, so calling them "no violation" would claim a
                    regulatory conclusion the backend never stores. Every determination -
                    confirmed violation, no violation, insufficient evidence - goes through
                    Record finding, where the per-item selector already carries the choice. */}
                <div className="consumer-report-decision-bar">
                  {error && (
                    <p className="admin-feedback error" role="alert">{error}</p>
                  )}

                  {hasItemReview && (
                    <div className="consumer-report-progress">
                      <span>{decidedItemCount} of {selected.items!.length} items decided</span>
                      {!itemReviewComplete && (
                        <span className="is-blocked">{blockingReason}</span>
                      )}
                    </div>
                  )}

                  <div className="consumer-report-actions">
                    <button
                      type="button"
                      className="admin-button primary"
                      disabled={decisionSaving || !reason || !verificationChosen || !fieldOfficerId}
                      title={verificationChosen ? undefined : 'Tick "Refer this report for field verification" above to enable'}
                      onClick={() => void requestVerification()}
                    >
                      <Send size={15} aria-hidden="true" /> Refer for field verification
                    </button>

                    <button
                      type="button"
                      className="admin-button primary"
                      disabled={decisionSaving || !reason || verificationChosen || (hasItemReview ? !itemReviewComplete : !finding)}
                      onClick={() => void decide(isCorrection ? 'correct' : 'validate')}
                    >
                      {decisionSaving ? 'Saving decision...' : 'Record finding'}
                    </button>

                    <button
                      type="button"
                      className="admin-button secondary"
                      disabled={decisionSaving || !reason || verificationChosen}
                      title="Resolves the report without recording any regulatory finding"
                      onClick={() => void decide('dismiss')}
                    >
                      Resolve without a finding
                    </button>

                    <button
                      type="button"
                      className="admin-button danger"
                      disabled={decisionSaving || !reason || verificationChosen}
                      title="Closes the report without recording any regulatory finding"
                      onClick={() => void decide('reject')}
                    >
                      <XCircle size={15} aria-hidden="true" /> Reject report
                    </button>
                  </div>
                </div>

                {/* Collapsible Technical & Audit Data Accordion */}
                {/* Reference material, not working surface. Each payload used to sit in its own
                    90-140px scrollport, so a collapsed accordion still contained three nested
                    scroll areas. */}
                <details className="consumer-report-technical" style={{ marginTop: '0.5rem' }}>
                  <summary>Technical detail &amp; audit traceability</summary>
                  <div style={{ marginTop: '0.65rem', display: 'grid', gap: '0.5rem' }}>
                    <div style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: '#1d4ed8', background: '#eff6ff', padding: '0.35rem 0.5rem', borderRadius: '4px' }}>
                      Formal receipt | Consumer report | Human validation required
                    </div>

                    <div>
                      <h4 style={{ margin: '0 0 0.25rem', fontSize: '0.76rem', color: '#475569', fontWeight: 700 }}>
                        Raw OCR payload
                      </h4>
                      <pre className="admin-code">{JSON.stringify(selected.raw_ocr_json, null, 2)}</pre>
                    </div>

                    {evidenceManifest?.processing_result && (
                      <div>
                        <h4 style={{ margin: '0 0 0.25rem', fontSize: '0.76rem', color: '#475569', fontWeight: 700 }}>
                          OCR processing diagnostics
                        </h4>
                        <pre className="admin-code">{JSON.stringify(evidenceManifest.processing_result, null, 2)}</pre>
                      </div>
                    )}

                    {selected.evaluator_confirmed_json && (
                      <div>
                        <h4 style={{ margin: '0 0 0.25rem', fontSize: '0.76rem', color: '#475569', fontWeight: 700 }}>
                          DTI evaluator findings
                        </h4>
                        <pre className="admin-code">{JSON.stringify(selected.evaluator_confirmed_json, null, 2)}</pre>
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
          </div></div>
        ) : (
          <div
            style={{
              gridColumn: 'auto',
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
