import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  CheckCircle2,
  Circle,
  AlertCircle,
  ArrowLeft,
  Download,
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
import type { ConsumerReportFilter, ConsumerReportItemRecord, ConsumerReportRecord, ManagedUserRecord, ReceiptEvidenceAssetRecord, ReceiptEvidenceManifest, ReceiptExtractionResult, StoreRecord } from '../../types/admin'
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
  const [filter, setFilter] = useState<ConsumerReportFilter>('to_review')
  const [filterCounts, setFilterCounts] = useState<Partial<Record<ConsumerReportFilter, number>>>({})
  const [searchTerm, setSearchTerm] = useState('')
  /** Server-side scope: one establishment and a receipt-date range. Tab counts follow it. */
  const [storeId, setStoreId] = useState<number | ''>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [stores, setStores] = useState<StoreRecord[]>([])
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

  /**
   * URL state, mirroring FieldMonitoringRecords: opening a report is a navigation, so browser Back
   * must return to the list with the filter intact rather than leaving the admin module entirely.
   */
  const updateUrl = useCallback((changes: Record<string, string | number | null>) => {
    const url = new URL(window.location.href)
    Object.entries(changes).forEach(([key, value]) => value === null || value === ''
      ? url.searchParams.delete(key)
      : url.searchParams.set(key, String(value)))
    window.history.pushState({ consumerReports: true }, '', `${url.pathname}${url.search}${url.hash}`)
  }, [])

  useEffect(() => {
    setLoading(true)
    setError('')
    // Filtering is server-side: the pills describe the whole queue, not the 20 rows that happen to
    // be loaded, and the buckets are stored statuses rather than guesses at the status text.
    //
    // No `typeof adminApi.getReportPage === 'function'` guard here. It can only be false against a
    // partial test mock, and its synthetic meta omitted `from`/`to`, which broke the typecheck. The
    // mock supplies getReportPage via mockReportPage(), so production code needs no fallback.
    void adminApi.getReportPage({
      page: reportPage.current_page, per_page: reportPage.per_page, filter,
      store_id: storeId || undefined, date_from: dateFrom || undefined, date_to: dateTo || undefined,
    })
      .then((response) => {
        setReports(response.data)
        setReportPage(response.meta)
        if (response.meta.filter_counts) setFilterCounts(response.meta.filter_counts)
      }).catch(() => {
        setReports([])
        setError('Consumer reports could not be loaded. Retry when the Admin API is available.')
      }).finally(() => setLoading(false))
  }, [reportPage.current_page, reportPage.per_page, filter, storeId, dateFrom, dateTo])

  // The establishment list only feeds the filter, so a failure leaves "All establishments" usable.
  useEffect(() => {
    void adminApi.getStores().then(setStores).catch(() => setStores([]))
  }, [])

  /** Any change of scope starts again from page 1; page 3 of the old scope may not exist. */
  const toFirstPage = () => setReportPage((current) => ({ ...current, current_page: 1 }))
  const scoped = Boolean(storeId || dateFrom || dateTo)
  const clearFilters = () => {
    setStoreId('')
    setDateFrom('')
    setDateTo('')
    setSearchTerm('')
    toFirstPage()
  }

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

  /**
   * Browser Back returns to the list with the filter it was left on. Scroll position is restored
   * too: FieldMonitoringRecords does not, which drops the evaluator at the top of a long list
   * after every report.
   */
  const listScrollRef = useRef(0)
  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(window.location.search)
      const reportId = Number(params.get('report'))
      const nextFilter = params.get('report_filter') as ConsumerReportFilter | null
      if (nextFilter) setFilter(nextFilter)
      if (reportId > 0) {
        const match = reports.find((report) => report.id === reportId)
        if (match) selectReport(match)
      } else {
        setSelected(null)
        window.requestAnimationFrame(() => document.querySelector('.admin-panel')?.scrollTo({ top: listScrollRef.current }))
      }
    }
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
    // selectReport is stable for the lifetime of a render pass and reads the report it is given.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reports])

  /** Opening a report is a navigation: it replaces the list, so it pushes history. */
  const openReport = (report: ConsumerReportRecord) => {
    listScrollRef.current = document.querySelector('.admin-panel')?.scrollTop ?? 0
    selectReport(report)
    updateUrl({ report: report.id, report_filter: filter })
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>('.consumer-report-detail h2')?.focus())
  }

  const backToList = () => {
    setSelected(null)
    setError('')
    updateUrl({ report: null })
  }

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

  /**
   * Search still narrows the loaded page. Status filtering moved to the server, so the counts on
   * the pills come from meta.filter_counts and describe the whole queue.
   */
  const filteredReports = reports.filter((r) => {
    if (!searchTerm.trim()) return true
    const query = searchTerm.toLowerCase()
    return r.report_reference.toLowerCase().includes(query)
      || (r.store_name || '').toLowerCase().includes(query)
      || JSON.stringify(r.raw_ocr_json || '').toLowerCase().includes(query)
  })

  /** Workflow states, in the order an evaluator meets them. */
  const FILTERS: Array<{ id: ConsumerReportFilter; label: string; tone: 'accent' | 'warn' | 'muted' }> = [
    { id: 'to_review', label: 'To review', tone: 'warn' },
    { id: 'with_officer', label: 'With field officer', tone: 'accent' },
    { id: 'violations', label: 'Violations', tone: 'accent' },
    { id: 'no_violation', label: 'No violation', tone: 'muted' },
    { id: 'rejected', label: 'Rejected', tone: 'muted' },
    { id: 'all', label: 'All', tone: 'muted' },
  ]

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
      {/* LIST OR DETAIL, never both. One report at full width gets the whole panel. The page title
          comes from the admin shell, so the list carries no heading of its own. */}
      {!selected ? (
        <section className="admin-table-card consumer-report-list" aria-label="Consumer reports">
          <div className="consumer-report-list-head">
            {/* One tab per workflow bucket; counts follow the establishment and date scope. */}
            <div className="status-filter-pills consumer-report-filters" role="group" aria-label="Report status">
              {FILTERS.map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  aria-pressed={filter === pill.id}
                  className={`filter-pill tone-${pill.tone} ${filter === pill.id ? 'active' : ''}`}
                  onClick={() => { setFilter(pill.id); toFirstPage() }}
                >
                  {pill.label}
                  {filterCounts[pill.id] !== undefined && (
                    <span className="consumer-report-tab-count">{filterCounts[pill.id]}</span>
                  )}
                </button>
              ))}
            </div>

            <div className="consumer-report-toolbar-row">
              <div className="admin-search-field consumer-report-search">
                <Search size={14} />
                <input
                  type="text"
                  aria-label="Search reports on this page"
                  placeholder="Search reference, store..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <label className="consumer-report-scope-field">
                <span>Establishment</span>
                <select
                  value={storeId}
                  onChange={(event) => { setStoreId(event.target.value ? Number(event.target.value) : ''); toFirstPage() }}
                >
                  <option value="">All establishments</option>
                  {stores.map((store) => <option key={store.id} value={store.id}>{store.store_name}</option>)}
                </select>
              </label>

              <label className="consumer-report-scope-field">
                <span>Receipt date from</span>
                <input
                  type="date"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={(event) => { setDateFrom(event.target.value); toFirstPage() }}
                />
              </label>

              <label className="consumer-report-scope-field">
                <span>to</span>
                <input
                  type="date"
                  aria-label="Receipt date to"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(event) => { setDateTo(event.target.value); toFirstPage() }}
                />
              </label>

              {(scoped || searchTerm) && (
                <button type="button" className="admin-button secondary consumer-report-clear" onClick={clearFilters}>
                  <XCircle size={14} aria-hidden="true" /> Clear filters
                </button>
              )}
            </div>
          </div>

          {!loading && filteredReports.length === 0 ? (
            <div className="consumer-report-queue-empty has-surface">
              <Shield size={20} />
              <div className="consumer-report-queue-empty-title">
                {scoped || searchTerm ? 'No reports match these filters' : 'No reports in this view'}
              </div>
            </div>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-data-table consumer-report-table">
                <caption className="sr-only">Consumer reports awaiting or completed review</caption>
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Store</th>
                    <th>Receipt date</th>
                    <th className="is-numeric">Items</th>
                    <th className="is-numeric">Above SRP</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 5 }, (_, idx) => (
                      <tr key={idx} className="admin-skeleton-row" aria-hidden="true">
                        <td data-label="Reference"><span className="skeleton-cell-ref" /></td>
                        <td data-label="Store"><span className="skeleton-cell-store" /></td>
                        <td data-label="Receipt date"><span className="skeleton-cell-date" /></td>
                        <td data-label="Items" className="is-numeric"><span className="skeleton-cell-num" /></td>
                        <td data-label="Above SRP" className="is-numeric"><span className="skeleton-cell-num" /></td>
                        <td data-label="Status"><span className="skeleton-cell-status" /></td>
                      </tr>
                    ))
                  ) : (
                    filteredReports.map((report) => {
                    const above = report.above_reference_count ?? 0
                    return (
                      <tr
                        key={report.id}
                        className="consumer-report-table-row"
                        tabIndex={0}
                        role="button"
                        aria-label={`Open ${report.report_reference}`}
                        onClick={() => openReport(report)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            openReport(report)
                          }
                        }}
                      >
                        <td data-label="Reference"><strong>{report.report_reference}</strong></td>
                        <td data-label="Store">{report.store_name || 'Store unmapped'}</td>
                        <td data-label="Receipt date">
                          {report.observed_at
                            || (report.submitted_at ? new Date(report.submitted_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date unavailable')}
                        </td>
                        <td data-label="Items" className="is-numeric">{report.items?.length ?? 0}</td>
                        <td data-label="Above SRP" className="is-numeric">
                          {above > 0
                            ? <span className="consumer-report-above-badge">{above}</span>
                            : <span className="consumer-report-table-muted">0</span>}
                        </td>
                        <td data-label="Status">
                          <span className={`consumer-report-status tone-${getStatusTone(report.status)}`}>
                            {getReadableStatus(report.status)}
                          </span>
                        </td>
                      </tr>
                    )
                  }))}
                </tbody>
              </table>
            </div>
          )}

          <nav className="admin-pagination" aria-label="Consumer report pagination">
            <span>Showing {reportPage.from ?? 0}–{reportPage.to ?? 0} of {reportPage.total}</span>
            <div>
              <button type="button" disabled={reportPage.current_page <= 1 || loading} onClick={() => setReportPage((current) => ({ ...current, current_page: current.current_page - 1 }))}>Previous</button>
              <strong>Page {reportPage.current_page} of {reportPage.last_page}</strong>
              <button type="button" disabled={reportPage.current_page >= reportPage.last_page || loading} onClick={() => setReportPage((current) => ({ ...current, current_page: current.current_page + 1 }))}>Next</button>
            </div>
          </nav>
        </section>
      ) : (
        <div className="consumer-report-detail">
          <header className="consumer-report-card consumer-report-detail-header">
            <div className="consumer-report-detail-header-left">
              <button
                type="button"
                className="admin-button secondary consumer-report-back-btn"
                onClick={backToList}
                aria-label="Back to reports"
              >
                <ArrowLeft size={15} aria-hidden="true" />
                <span>Back to reports</span>
              </button>

              <span className="consumer-report-header-divider" aria-hidden="true" />

              <h2 tabIndex={-1} className="consumer-report-detail-title">
                {selected.store_name || 'Store unmapped'}
              </h2>
            </div>

            <div className="consumer-report-detail-header-right">
              {selected.protocol?.mode === 'emergency' && (
                <span className="consumer-report-protocol is-emergency">
                  <span className="consumer-report-protocol-dot" />
                  Price Freeze Protocol{selected.protocol?.reference ? ` · ${selected.protocol.reference}` : ''}
                </span>
              )}
              <span className="consumer-report-detail-meta-pill">
                <strong>Ref:</strong> {selected.report_reference}
              </span>
              {selected.submitted_at && (
                <span className="consumer-report-detail-meta-pill">
                  <strong>Submitted:</strong> {new Date(selected.submitted_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              )}
              <span className={`consumer-report-status tone-${getStatusTone(selected.status)}`}>
                {getReadableStatus(selected.status)}
              </span>
            </div>
          </header>

          {/* The evidence-beside-items split is unchanged from the two-pane layout; it simply
              has the whole panel now instead of what the queue column left over. */}
          <div className="consumer-report-workspace"><div className="consumer-report-panes">
            {/* =========================================================================
                EVIDENCE: sticky, so the receipt stays on screen while the item list
                beside it scrolls.
                ========================================================================= */}
            <section className="evidence-column-container consumer-report-evidence consumer-report-card consumer-report-evidence-card">
              {evidenceManifest && (
                <div className="consumer-report-assets">
                  <div className="consumer-report-assets-head">
                    <span className="consumer-report-assets-title">Captured Sections</span>
                    <EvidenceSectionNav assets={evidenceManifest.assets} selected={selectedAsset} busy={evidenceLoading} onSelect={(asset) => void showEvidenceAsset(asset)} />
                  </div>
                  <div className="consumer-report-asset-list">
                    {evidenceManifest.assets.map((asset) => (
                      <button
                        key={asset.id}
                        type="button"
                        className={`consumer-report-asset${selectedAsset?.id === asset.id ? ' is-selected' : ''}`}
                        aria-label={`${asset.kind.replaceAll('_', ' ')} ${asset.sequence + 1}`}
                        onClick={() => void showEvidenceAsset(asset)}
                      >
                        {asset.kind === 'source_frame'
                          ? `Section ${asset.sequence + 1}`
                          : asset.kind === 'stitched_preview'
                            ? 'Stitched preview'
                            : `${asset.kind.replaceAll('_', ' ')} ${asset.sequence + 1}`}
                        {asset.attempt_number && (!asset.is_current || asset.attempt_number > 1) ? ` (Att. ${asset.attempt_number})` : ''}
                      </button>
                    ))}
                  </div>
                  <div className="consumer-report-asset-meta-row">
                    <span className="consumer-report-asset-meta consumer-report-meta-chip">
                      Continuity: {String(evidenceManifest.continuity?.status || 'Not available')} · Merchant: {String(evidenceManifest.merchant?.status || 'Not available')}
                    </span>
                  </div>
                </div>
              )}

              {/* Five near-identical buttons; only Full Screen differs in tone and placement. */}
              <div className="image-controls-toolbar consumer-report-toolbar">
                <button type="button" title="Zoom Out" aria-label="Zoom Out" onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))}>
                  <ZoomOut size={13} /> Zoom Out
                </button>
                <button type="button" title="Zoom In" aria-label="Zoom In" onClick={() => setZoom((z) => Math.min(z + 0.25, 3))}>
                  <ZoomIn size={13} /> Zoom In
                </button>
                <button type="button" title="Rotate" aria-label="Rotate" onClick={() => setRotation((r) => (r + 90) % 360)}>
                  <RotateCw size={13} /> Rotate
                </button>
                <button type="button" title="Reset" aria-label="Reset" onClick={() => { setZoom(1); setRotation(0) }}>
                  <RefreshCw size={13} /> Reset
                </button>
                <button type="button" title="Full Size" aria-label="Full Size" className="is-primary" onClick={() => setIsFullScreen(true)}>
                  <Maximize2 size={13} /> Full Screen
                </button>
              </div>

              {/* Receipt Viewport Canvas */}
              <div className="evidence-viewport consumer-report-viewport">
                {evidenceLoading ? (
                  <div className="consumer-report-viewport-status">
                    <RefreshCw size={20} className="spin-icon" />
                    Loading receipt image...
                  </div>
                ) : evidenceUrl && selectedAsset?.mime_type.startsWith('video/') ? (
                  <video
                    src={evidenceUrl}
                    controls
                    aria-label={`Evidence video for ${selected.report_reference}`}
                  />
                ) : evidenceUrl ? (
                  <img
                    src={evidenceUrl}
                    alt={`Evidence receipt for ${selected.report_reference}`}
                    /* Zoom and rotation are live user state, so they stay inline: a stylesheet
                       cannot express a value that changes on every click. */
                    style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
                  />
                ) : (
                  <div className="consumer-report-viewport-empty">
                    <Lock size={26} />
                    <strong>Receipt evidence unavailable</strong>
                    <span>No stored original can be displayed for this report.</span>
                  </div>
                )}
              </div>

              <div className="consumer-report-detected">
                <h4>Raw OCR and system-extracted information</h4>
                <div className="consumer-report-detected-group">
                  <div className="consumer-report-detected-row">
                    <span>Merchant OCR:</span>
                    <strong>{detectedMerchant || 'Not detected'}</strong>
                  </div>
                  <div className="consumer-report-detected-row">
                    <span>Transaction Date:</span>
                    <strong>{detectedTransactionDate ? String(detectedTransactionDate) : 'Not detected'}</strong>
                  </div>
                </div>

                <ReceiptExtractionPanel result={evidenceManifest?.processing_result as ReceiptExtractionResult | null | undefined} />

                {/* Queue rows are not file-verified (evidence_verified false): offer the download only once a file has loaded. */}
                {selected.evidence_available && (selected.evidence_verified !== false || evidenceUrl) && (
                  <button
                    type="button"
                    className="admin-button secondary consumer-report-download"
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
                  >
                    <Download size={14} /> Download private receipt evidence
                  </button>
                )}
              </div>
            </section>

            {/* =========================================================================
                RIGHT COLUMN: System Finding & DTI Review
                ========================================================================= */}
            <section className="ocr-breakdown-column-container consumer-report-card consumer-report-findings">
              <div className="consumer-report-findings-block">
                <div className="consumer-report-findings-head">
                  <h3>System extraction status</h3>
                  <span className="consumer-report-ocr-flag">OCR FLAG — REVIEW</span>
                </div>

                {/* An item report is summarised from the per-item references resolved by the
                    server; the single-price tiles are the legacy path, which has one price and
                    no items. */}
                {hasItemReview ? (
                  <div className="consumer-report-comparison">
                    <div className={`consumer-report-comparison-head${comparisonSummary.compared > 0 ? '' : ' is-blocked'}`}>
                      <AlertCircle size={16} />
                      <span>
                        {comparisonSummary.compared > 0
                          ? `Compared ${comparisonSummary.compared} of ${comparisonSummary.total} item(s) against the applicable reference`
                          : 'No item could be compared — match a commodity to each line below'}
                      </span>
                    </div>

                    <div className="consumer-report-tiles">
                      <div className="consumer-report-tile">
                        <div className="consumer-report-tile-label">Items above reference</div>
                        <div className={`consumer-report-tile-value${comparisonSummary.above > 0 ? ' is-danger' : ''}`}>
                          {comparisonSummary.above}
                        </div>
                      </div>

                      <div className="consumer-report-tile">
                        <div className="consumer-report-tile-label">Items within reference</div>
                        <div className="consumer-report-tile-value is-success">{comparisonSummary.within}</div>
                      </div>

                      <div className="consumer-report-tile">
                        <div className="consumer-report-tile-label">Total excess</div>
                        <div className={`consumer-report-tile-value${comparisonSummary.excess > 0 ? ' is-danger' : ''}`}>
                          {comparisonSummary.above > 0 ? `+₱${comparisonSummary.excess.toFixed(2)}` : '₱0.00'}
                        </div>
                      </div>
                    </div>

                    {comparisonSummary.unresolved > 0 && (
                      <p className="consumer-report-comparison-caution">
                        {comparisonSummary.unresolved} item(s) have no applicable reference and are not counted above.
                      </p>
                    )}

                    <p className="consumer-report-comparison-note">
                      System-detected comparison for DTI evaluator verification. Final determination rests with the review officer.
                    </p>
                  </div>
                ) : (
                  <div className="consumer-report-comparison">
                    <div className="consumer-report-comparison-head is-blocked">
                      <AlertCircle size={16} />
                      <span>{priceDifference !== null ? 'Automated price comparison available' : 'No automated price comparison available'}</span>
                    </div>

                    <div className="consumer-report-tiles">
                      <div className="consumer-report-tile">
                        <div className="consumer-report-tile-label">Receipt Price</div>
                        <div className="consumer-report-tile-value">
                          {rawReceiptPrice !== null ? `₱${rawReceiptPrice.toFixed(2)}` : 'Unavailable'}
                        </div>
                      </div>

                      <div className="consumer-report-tile">
                        <div className="consumer-report-tile-label">Applicable SRP</div>
                        <div className="consumer-report-tile-value is-success">
                          {rawSrpPrice !== null ? `₱${rawSrpPrice.toFixed(2)}` : 'Unavailable'}
                        </div>
                      </div>

                      <div className="consumer-report-tile">
                        <div className="consumer-report-tile-label">Difference</div>
                        <div className="consumer-report-tile-value is-danger">
                          {priceDifference !== null ? `${priceDifference > 0 ? '+' : ''}₱${priceDifference.toFixed(2)}` : 'Unavailable'}
                        </div>
                      </div>
                    </div>

                    <p className="consumer-report-comparison-note">
                      System-detected comparison for DTI evaluator verification. Final determination rests with the review officer.
                    </p>
                  </div>
                )}

                {/* Legacy reports only. When the report has persisted items, the same rows already
                    appear twice — read-only under "System extraction" and editable under
                    "Item-by-item findings" — so a third copy here only cost the evaluator a re-read. */}
                {!hasItemReview && structuredOcrItems.length > 0 && (
                  <div className="consumer-report-legacy-items">
                    <table>
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Quantity</th>
                          <th className="is-numeric">Price</th>
                          <th className="is-numeric">OCR confidence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {structuredOcrItems.map((item, idx) => {
                          const confidence = Number(item.ocr_confidence)
                          const measuredConfidence = item.ocr_confidence !== null && item.ocr_confidence !== undefined && Number.isFinite(confidence) && confidence !== 0.8
                          return (
                            <tr key={idx}>
                              <td className="is-name">{String(item.name || item.product || 'Item label not detected')}</td>
                              <td>{item.quantity !== undefined && item.quantity !== null ? String(item.quantity) : 'Quantity unavailable'}</td>
                              <td className="is-numeric">{item.price !== undefined && item.price !== null ? `₱${String(item.price)}` : 'Price unavailable'}</td>
                              <td className="is-numeric">{measuredConfidence ? `${Math.round(confidence * 100)}% measured` : 'Confidence unavailable'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* DTI DECISION & REVIEW SECTION */}
              <div className="consumer-report-decision">
                <div>
                  <h3 className="consumer-report-decision-title">DTI evaluator findings and decision</h3>
                  <p className="consumer-report-decision-lede">What should happen to this report?</p>
                </div>

                {/* Structured Multi-Item Forms (when applicable) */}
                {hasItemReview && (
                  <div className="consumer-report-item-list">
                    <div className="consumer-report-item-list-title">Item-by-item findings</div>
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
                  <section aria-label="Field verification request" className="consumer-report-referral is-active">
                    <strong>Field verification request</strong>
                    <small>{selected.status}</small>
                    <span>{selected.verification_request.status.charAt(0).toUpperCase() + selected.verification_request.status.slice(1)}</span>
                    <p>{selected.verification_request.reason}</p>
                    {selected.verification_request.status === 'open' && <button type="button" className="admin-button secondary" disabled={decisionSaving} onClick={() => void cancelVerification()}>Cancel field verification</button>}
                  </section>
                )}
                {/* Referral is available for BOTH report shapes. It used to live only in the
                    legacy branch below, so on an item report — the normal case — the officer
                    selector never rendered and a referral could not be made at all. */}
                {!selected.verification_request && (
                  <section aria-label="Refer for field verification" className="consumer-report-referral">
                    <label className="consumer-report-referral-toggle">
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
                      <label className="consumer-report-field">
                        Field Officer
                        <select
                          aria-label="Field Officer"
                          required
                          value={fieldOfficerId}
                          onChange={(event) => setFieldOfficerId(event.target.value)}
                        >
                          <option value="">Select active officer</option>
                          {fieldOfficers.map((officer) => <option key={officer.id} value={officer.id}>{officer.name}</option>)}
                        </select>
                      </label>
                    )}
                  </section>
                )}

                {!hasItemReview && (
                  <div className="consumer-report-legacy-decision">
                    <div className="consumer-report-intents">
                      {!selected.verification_request && <button
                        type="button"
                        onClick={() => {
                          setDecisionIntent('verify')
                          setFinding('confirmed_violation')
                          setVerificationChosen(true)
                        }}
                        className={`consumer-report-intent tone-accent${decisionIntent === 'verify' ? ' is-selected' : ''}`}
                      >
                        <div className="consumer-report-intent-title">
                          <Send size={14} /> Require Field Verification
                        </div>
                        <div className="consumer-report-intent-note">
                          Mark the report for a separate field-verification workflow
                        </div>
                      </button>}

                      <button
                        type="button"
                        onClick={() => {
                          setDecisionIntent('close')
                          setFinding('no_violation')
                        }}
                        className={`consumer-report-intent tone-muted${decisionIntent === 'close' ? ' is-selected' : ''}`}
                      >
                        <div className="consumer-report-intent-title">
                          <ShieldCheck size={14} /> Close Report
                        </div>
                        <div className="consumer-report-intent-note">
                          No regulatory action required
                        </div>
                      </button>
                    </div>

                    <div className="consumer-report-field-group">
                      <label htmlFor="regulatory-finding-select" className="consumer-report-field-label">
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
                        className="consumer-report-control"
                      >
                        <option value="">Select a finding / reason</option>
                        <option value="confirmed_violation">Confirmed price violation (Require Field Verification)</option>
                        <option value="no_violation">Price conforms to prevailing SRP bulletin baseline</option>
                        <option value="insufficient_evidence">Merchant / store mismatch against registered establishment</option>
                        <option value="insufficient_evidence">Illegible receipt / insufficient evidence</option>
                        <option value="no_violation">Duplicate consumer submission</option>
                      </select>
                    </div>

                    <div className="consumer-report-field-group">
                      {/* The officer selector now lives in the shared referral section above, so
                          both report shapes reach it. */}
                      <label htmlFor="decision-reason-text" className="consumer-report-field-label">
                        {decisionIntent === 'verify' ? 'Verification reason' : 'Closure reason'}
                      </label>
                      <textarea
                        id="decision-reason-text"
                        aria-label="Decision reason"
                        rows={2}
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder={decisionIntent === 'verify' ? 'Required reasoning for the field-verification decision...' : 'Required explanation for closing this report...'}
                        className="consumer-report-control"
                      />
                    </div>
                  </div>
                )}
                {/* DECISION CONSOLE - sticky, unifying progress, note input, and actions */}
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

                  {hasItemReview && (
                    <div className="consumer-report-field-group consumer-report-decision-note-group">
                      <label htmlFor="decision-reason-text-multi" className="consumer-report-field-label">
                        Decision reason / Verification Note
                      </label>
                      <textarea
                        id="decision-reason-text-multi"
                        aria-label="Decision reason"
                        rows={2}
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder="State regulatory reasoning or instructions for this continuous capture..."
                        className="consumer-report-control consumer-report-decision-textarea"
                      />
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
                <details className="consumer-report-technical">
                  <summary>Technical detail &amp; audit traceability</summary>
                  <div className="consumer-report-technical-body">
                    <div className="consumer-report-provenance">
                      Formal receipt | Consumer report | Human validation required
                    </div>

                    <div>
                      <h4 className="consumer-report-technical-title">
                        Raw OCR payload
                      </h4>
                      <pre className="admin-code">{JSON.stringify(selected.raw_ocr_json, null, 2)}</pre>
                    </div>

                    {evidenceManifest?.processing_result && (
                      <div>
                        <h4 className="consumer-report-technical-title">
                          OCR processing diagnostics
                        </h4>
                        <pre className="admin-code">{JSON.stringify(evidenceManifest.processing_result, null, 2)}</pre>
                      </div>
                    )}

                    {selected.evaluator_confirmed_json && (
                      <div>
                        <h4 className="consumer-report-technical-title">
                          DTI evaluator findings
                        </h4>
                        <pre className="admin-code">{JSON.stringify(selected.evaluator_confirmed_json, null, 2)}</pre>
                      </div>
                    )}

                    {!hasItemReview && (
                      <div>
                        <label htmlFor="eval-confirmed-json" className="consumer-report-json-label">
                          Evaluator-confirmed JSON
                        </label>
                        <textarea
                          id="eval-confirmed-json"
                          rows={2}
                          value={correctedText}
                          onChange={(event) => setCorrectedText(event.target.value)}
                          className="consumer-report-json-input"
                        />
                      </div>
                    )}
                  </div>
                </details>
              </div>
            </section>
          </div></div>
        </div>
      )}

      {isFullScreen && selected && (
        <div className="fullscreen-image-modal consumer-report-fullscreen">
          <div className="consumer-report-fullscreen-head">
            <h3><Shield size={18} /> Receipt Evidence: {selected.report_reference} ({selected.store_name})</h3>
            <button type="button" className="admin-button danger" onClick={() => setIsFullScreen(false)}>
              Close Full View
            </button>
          </div>
          <div className="consumer-report-fullscreen-body">
            {evidenceUrl ? (
              <img
                src={evidenceUrl}
                alt="Full size evidence"
                /* Live user state; see the inline viewport transform above. */
                style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
              />
            ) : (
              <div className="consumer-report-fullscreen-locked">
                <Lock size={28} />
                Private Receipt Evidence Locked in Vault
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
