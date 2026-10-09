import React, { useEffect, useMemo, useRef, useState } from 'react'
import { regulatoryRefresh } from '../../services/regulatoryRefresh'
import {
  Calendar,
  Database,
  MapPin,
  RefreshCw,
  Shield,
  ShieldAlert,
  Search,
  Scale,
  Clock,
  AlertTriangle,
  FileText,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { adminApi } from '../../services/adminApi'
import { adminToast } from '../../services/adminToast'
import type { RegulatoryEmergencyRecord, RegulatoryEmergencySummary } from '../../types/admin'
import {
  humanizeCommoditySlug,
  formatPstDateRange,
} from '../../utils/commodityFormatter'

const SAN_JOSE = 'San Jose de Buenavista, Antique'
const money = (value: number) => `₱${Number(value).toFixed(2)}`
const day = (value: string | null) => value ? value.slice(0, 10) : '—'
const emergencySummary = (record: RegulatoryEmergencyRecord): RegulatoryEmergencySummary => ({
  id: record.id, location: record.location, declaration_reference: record.declaration_reference,
  starts_on: record.starts_on, ends_on: record.ends_on, ended_at: record.ended_at,
  status: record.status, effective_state: record.effective_state,
  preparation_hash: record.preparation_hash, official_prices: record.official_prices,
})
const manilaToday = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).map(({ type, value }) => [type, value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

export const EmergencyToggle: React.FC = () => {
  const [emergencies, setEmergencies] = useState<RegulatoryEmergencySummary[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const selectedIdRef = useRef<number | null>(null)
  const [selectedDetail, setSelectedDetail] = useState<RegulatoryEmergencyRecord | null>(null)
  const [reviewed, setReviewed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const loadRequest = useRef(0)
  const detailRequest = useRef(0)
  const summaryInFlight = useRef(false)
  const summaryVerified = useRef(false)
  const refreshQueued = useRef(false)
  const detailInFlight = useRef<number | null>(null)
  const [savingAction, setSavingAction] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Candidate filtering & search state
  const [candidateSearch, setCandidateSearch] = useState('')
  const [candidateFilter, setCandidateFilter] = useState<'all' | 'ready' | 'missing'>('all')

  // Pagination state
  const [candidatePage, setCandidatePage] = useState(1)
  const [candidatePerPage, setCandidatePerPage] = useState(8)
  const [refPage, setRefPage] = useState(1)
  const [refPerPage, setRefPerPage] = useState(10)

  // Reset pagination on filter or selection change
  useEffect(() => {
    setCandidatePage(1)
  }, [candidateSearch, candidateFilter, selectedId])

  // Form helper state for +60 days preset
  const [formStartDate, setFormStartDate] = useState('')
  const [formEndDate, setFormEndDate] = useState('')

  // Map of commodity_key to SRP info for readable product names
  const [srpMap, setSrpMap] = useState<Record<string, { name: string; unit?: string | null }>>({})

  useEffect(() => {
    try {
      const maybePromise = adminApi.getSrp?.({ view: 'current', per_page: 1000 })
      if (maybePromise && typeof maybePromise.then === 'function') {
        void maybePromise.then((res) => {
          const list = Array.isArray(res) ? res : res.records
          const map: Record<string, { name: string; unit?: string | null }> = {}
          for (const item of list) {
            if ('commodity_key' in item && typeof item.commodity_key === 'string' && item.commodity_key) {
              map[item.commodity_key] = {
                name: item.commodity_name,
                unit: item.unit,
              }
            }
          }
          setSrpMap(map)
        }).catch(() => {})
      }
    } catch {
      // Safe fallback if unmocked
    }
  }, [])

  const replaceEmergency = (record: RegulatoryEmergencyRecord) => {
    loadRequest.current++
    detailRequest.current++
    summaryInFlight.current = false; refreshQueued.current = false; detailInFlight.current = null
    setLoading(false)
    setDetailLoading(false); setDetailError(null)
    setEmergencies((current) => current.some((item) => item.id === record.id)
      ? current.map((item) => item.id === record.id ? emergencySummary(record) : item)
      : [emergencySummary(record), ...current])
    selectedIdRef.current = record.id
    setSelectedId(record.id); setSelectedDetail(record)
    // A single write response cannot verify declarations that were never loaded or are stale.
    if (!summaryVerified.current) void loadEmergencies()
  }

  const loadDetail = async (id: number) => {
    if (detailInFlight.current === id) return
    const request = ++detailRequest.current
    const summaryVersion = loadRequest.current
    let superseded = false
    setDetailLoading(true)
    detailInFlight.current = id
    try {
      const record = await adminApi.getEmergency(id)
      if (request !== detailRequest.current || selectedIdRef.current !== id) return
      if (summaryVersion !== loadRequest.current) { superseded = true; return }
      setSelectedDetail(record)
      setDetailError(null)
      setEmergencies((current) => current.map((item) => item.id === id ? emergencySummary(record) : item))
    } catch {
      if (request !== detailRequest.current || selectedIdRef.current !== id) return
      if (summaryVersion !== loadRequest.current) { superseded = true; return }
      setDetailError('Could not load declaration details. Previously loaded details may be stale; confirmation is unavailable until the connection is restored.')
    } finally {
      if (request === detailRequest.current) {
        detailInFlight.current = null
        setDetailLoading(false)
        if (superseded && !summaryInFlight.current && selectedIdRef.current === id) void loadDetail(id)
      }
    }
  }

  const selectEmergency = (id: number | null) => {
    if (selectedIdRef.current !== id) {
      detailRequest.current++; detailInFlight.current = null
      selectedIdRef.current = id
      setSelectedId(id); setReviewed(false); setDetailError(null)
      setDetailLoading(id !== null)
    }
    if (id !== null) void loadDetail(id)
  }

  const loadEmergencies = async () => {
    if (summaryInFlight.current) { refreshQueued.current = true; return }
    summaryInFlight.current = true
    const request = ++loadRequest.current
    setLoading(true)
    try {
      const records = await adminApi.getEmergencySummaries()
      if (request !== loadRequest.current) return
      setEmergencies(records); setLoaded(true); setLoadError(null)
      summaryVerified.current = true
      const current = selectedIdRef.current
      selectEmergency(current && records.some((item) => item.id === current)
        ? current
        : records.find((item) => item.status === 'draft')?.id ?? records[0]?.id ?? null)
    } catch {
      if (request !== loadRequest.current) return
      summaryVerified.current = false
      setLoadError('Could not load emergency declarations. Previously loaded records may be stale; current market protocol is unavailable until the connection is restored.')
    } finally {
      if (request === loadRequest.current) {
        summaryInFlight.current = false
        setLoading(false)
        if (refreshQueued.current) { refreshQueued.current = false; void loadEmergencies() }
      }
    }
  }

  useEffect(() => {
    void loadEmergencies()
    const stop = regulatoryRefresh(() => { void loadEmergencies() })
    return () => {
      loadRequest.current++; detailRequest.current++
      summaryInFlight.current = false; refreshQueued.current = false; detailInFlight.current = null
      stop()
    }
  }, [])

  const selectedSummary = emergencies.find((item) => item.id === selectedId)
  const selected = selectedDetail?.id === selectedId && selectedSummary
    ? selectedDetail
    : null
  useEffect(() => { setReviewed(false) }, [selectedId, selected?.preparation_hash])
  const detailVerified = !!selected && !detailLoading && !detailError
    && selectedDetail?.preparation_hash === selectedSummary?.preparation_hash
  const inEffect = emergencies.some((item) => item.effective_state === 'in_effect')
  const officialPrices = useMemo(() => emergencies.flatMap((item) => item.official_prices || []), [emergencies])
  const srpFallbacks = selected?.srp_fallbacks ?? []
  const cutoffStartsOn = selected ? selected.source_week.starts_on || day(selected.source_week.starts_at) : null
  const completePreparation = !!selected
    && selected.candidates.length + srpFallbacks.length > 0
    && selected.candidates.every((candidate) => candidate.observation_count > 0)

  // Filtered candidate list
  const filteredCandidates = useMemo(() => {
    if (!selected) return []
    return selected.candidates.filter((candidate) => {
      const name = srpMap[candidate.commodity_key]?.name || humanizeCommoditySlug(candidate.commodity_key)
      const matchesSearch = !candidateSearch.trim() ||
        candidate.commodity_key.toLowerCase().includes(candidateSearch.toLowerCase()) ||
        name.toLowerCase().includes(candidateSearch.toLowerCase())

      if (!matchesSearch) return false

      if (candidateFilter === 'ready') return candidate.observation_count > 0
      if (candidateFilter === 'missing') return candidate.observation_count === 0
      return true
    })
  }, [selected, candidateSearch, candidateFilter, srpMap])

  // Paginated candidate slice & boundaries
  const totalCandidatePages = Math.max(1, Math.ceil(filteredCandidates.length / candidatePerPage))
  useEffect(() => { setCandidatePage((page) => Math.min(page, totalCandidatePages)) }, [totalCandidatePages])
  const paginatedCandidates = useMemo(() => {
    const start = (candidatePage - 1) * candidatePerPage
    return filteredCandidates.slice(start, start + candidatePerPage)
  }, [filteredCandidates, candidatePage, candidatePerPage])
  const candidateFrom = filteredCandidates.length === 0 ? 0 : (candidatePage - 1) * candidatePerPage + 1
  const candidateTo = Math.min(candidatePage * candidatePerPage, filteredCandidates.length)

  // Paginated official references slice & boundaries
  const totalRefPages = Math.max(1, Math.ceil(officialPrices.length / refPerPage))
  useEffect(() => { setRefPage((page) => Math.min(page, totalRefPages)) }, [totalRefPages])
  const paginatedOfficialPrices = useMemo(() => {
    const start = (refPage - 1) * refPerPage
    return officialPrices.slice(start, start + refPerPage)
  }, [officialPrices, refPage, refPerPage])
  const refFrom = officialPrices.length === 0 ? 0 : (refPage - 1) * refPerPage + 1
  const refTo = Math.min(refPage * refPerPage, officialPrices.length)

  // Missing observations list for diagnostic
  const missingCandidates = useMemo(() => {
    if (!selected) return []
    return selected.candidates.filter((c) => c.observation_count === 0)
  }, [selected])

  // Show progress through the declaration's recorded inclusive dates.
  const activeTimeline = useMemo(() => {
    if (!selected || selected.effective_state !== 'in_effect' || !selected.starts_on || !selected.ends_on) return null
    const dayMs = 86_400_000
    const start = Date.parse(`${selected.starts_on.slice(0, 10)}T00:00:00Z`)
    const end = Date.parse(`${selected.ends_on.slice(0, 10)}T00:00:00Z`)
    const today = Date.parse(`${manilaToday()}T00:00:00Z`)
    if (![start, end, today].every(Number.isFinite) || end < start) return null
    const maxDays = Math.round((end - start) / dayMs) + 1
    const daysElapsed = Math.min(maxDays, Math.max(1, Math.round((today - start) / dayMs) + 1))
    const daysRemaining = Math.max(0, Math.round((end - today) / dayMs))
    return { daysElapsed, maxDays, daysRemaining, percent: Math.round((daysElapsed / maxDays) * 100) }
  }, [selected])

  // The start date is day one of a 60-calendar-day period.
  const handleApplySixtyDays = () => {
    const baseDate = new Date(`${formStartDate || manilaToday()}T00:00:00Z`)
    baseDate.setUTCDate(baseDate.getUTCDate() + 59)
    setFormEndDate(baseDate.toISOString().slice(0, 10))
  }

  return (
    <div className="emergency-container">
      {/* Executive Command Banner */}
      <section className={`admin-card emergency-hero-banner ${inEffect ? 'is-emergency' : 'is-normal'}`}>
        <div className="emergency-hero-left">
          <div className="emergency-hero-icon-wrap">
            {inEffect ? <ShieldAlert size={32} /> : <Shield size={32} />}
          </div>
          <div className="emergency-hero-text">
            <div className="emergency-statutory-tag">
              <Scale size={13} />
              <span>Republic Act No. 7581 (Price Act) · Automatic Price Control</span>
            </div>
            <h2>State of Calamity Regulatory Command Bar</h2>
            <p>{inEffect ? 'Confirmed APC references are in effect.' : 'Normal weekly SRP monitoring remains in effect.'}</p>
          </div>
        </div>

        <div className="emergency-hero-right">
          <div className="emergency-jurisdiction-chip">
            <MapPin size={13} />
            <span>{SAN_JOSE}</span>
          </div>
          <div className={`emergency-status-badge ${inEffect ? 'badge-danger' : 'badge-normal'}`}>
            <span className={`emergency-pulse-dot ${inEffect ? 'pulse-red' : 'pulse-green'}`} />
            <span>{loadError || !loaded ? 'Emergency status unavailable' : inEffect ? 'State of Calamity' : 'Normal SRP Protocol'}</span>
          </div>
        </div>
      </section>

      {/* KPI Overview Tiles */}
      <div className="emergency-kpi-grid">
        <div className="emergency-kpi-card">
          <span className="emergency-kpi-label">Active Market Protocol</span>
          <strong className="emergency-kpi-value" style={{ color: inEffect ? '#b91c1c' : '#059669' }}>
            {inEffect ? 'Price Freeze / APC' : 'Prevailing SRP'}
          </strong>
          <span className="emergency-kpi-sub">
            {inEffect ? 'Mandatory price ceiling active' : 'Normal weekly SRP monitoring'}
          </span>
        </div>

        <div className="emergency-kpi-card">
          <span className="emergency-kpi-label">Surveillance Jurisdiction</span>
          <strong className="emergency-kpi-value">San Jose</strong>
          <span className="emergency-kpi-sub">Capital Municipality, Antique</span>
        </div>

        <div className="emergency-kpi-card">
          <span className="emergency-kpi-label">Covered Commodities</span>
          <strong className="emergency-kpi-value">
            {selected ? selected.candidates.length + srpFallbacks.length : '—'}
          </strong>
          <span className="emergency-kpi-sub">Basic Necessities & Prime Commodities</span>
        </div>

        <div className="emergency-kpi-card">
          <span className="emergency-kpi-label">Recorded Declarations</span>
          <strong className="emergency-kpi-value">{emergencies.length}</strong>
          <span className="emergency-kpi-sub">Price freeze orders & active drafts</span>
        </div>
      </div>

      {/* System Error Alerts */}
      {loadError && (
        <div role="alert" className="admin-alert admin-alert--error">
          <p>{loadError}</p>
          <button type="button" onClick={() => void loadEmergencies()}>Retry</button>
        </div>
      )}
      {actionError && (
        <div role="alert" className="admin-alert admin-alert--error">
          <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong>Action Warning</strong>
            <p style={{ margin: '0.2rem 0 0 0' }}>{actionError}</p>
          </div>
        </div>
      )}
      {detailError && (
        <div role="alert" className="admin-alert admin-alert--error">
          <p>{detailError}</p>
          <button type="button" onClick={() => { if (selectedId !== null) void loadDetail(selectedId) }}>Retry</button>
        </div>
      )}

      {/* 2-Column Responsive Workspace */}
      <div className="emergency-grid-workspace">
        {/* Left Column: Management & Declarations Hub */}
        <div className="emergency-col-left">
          {/* Declarations List Card */}
          <section className="admin-card" style={{ padding: '1.25rem' }}>
            <div className="emergency-card-head">
              <div className="emergency-card-title-group">
                <h3><Calendar size={18} /> Declarations</h3>
                <p>Recorded price freeze orders & drafts</p>
              </div>
              <span className="emergency-status-chip chip-draft">
                {emergencies.length} {emergencies.length === 1 ? 'Record' : 'Records'}
              </span>
            </div>

            {(loaded || emergencies.length > 0) && loading && <small role="status">Refreshing…</small>}
            {!loaded && !emergencies.length && loading ? (
              <p>Loading emergency records…</p>
            ) : loaded && emergencies.length === 0 ? (
              <p>No emergency declarations recorded.</p>
            ) : (
              <div className="emergency-decl-list">
                {emergencies.map((record) => {
                  const stateClass = record.effective_state === 'in_effect'
                    ? 'chip-in-effect'
                    : record.status === 'draft'
                      ? 'chip-draft'
                      : 'chip-ended'

                  return (
                    <button
                      key={record.id}
                      type="button"
                      className={`admin-button secondary emergency-decl-btn ${record.id === selectedId ? 'is-active' : ''}`}
                      aria-pressed={record.id === selectedId}
                      onClick={() => { selectEmergency(record.id); setReviewed(false) }}
                    >
                      <div className="emergency-decl-top">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                          <FileText size={15} style={{ color: record.id === selectedId ? '#2563eb' : '#64748b' }} />
                          <strong>{record.declaration_reference}</strong>
                        </div>
                        <span className={`emergency-status-chip ${stateClass}`}>
                          {record.effective_state.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="emergency-decl-dates">
                        <Clock size={12} />
                        <span>{formatPstDateRange(record.starts_on, record.ends_on)}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          {/* Prepare Declaration Form Card */}
          <section className="admin-card" style={{ padding: '1.25rem' }}>
            <div className="emergency-card-head">
              <div className="emergency-card-title-group">
                <h3>Prepare a Price Freeze declaration</h3>
                <p>For each covered product the system uses its latest completed San Jose monitoring week with accepted routine prices and calculates APC as (minimum + maximum) ÷ 2. A product never observed keeps its SRP as the ceiling.</p>
              </div>
            </div>

            <div className="emergency-formula-callout">
              <div className="emergency-formula-title">
                <Scale size={14} />
                <strong>R.A. 7581 Statutory Calculation Rule</strong>
              </div>
              <div className="emergency-formula-code">
                <code>APC Ceiling = (Minimum Price + Maximum Price) ÷ 2</code>
              </div>
              <p className="emergency-formula-note">
                Baseline computed from the latest closed weekly surveillance cycle. Products without observations retain prevailing SRP as ceiling.
              </p>
            </div>

            <form
              className="admin-form"
              onSubmit={async (event) => {
                event.preventDefault()
                const element = event.currentTarget
                const form = new FormData(element)
                setActionError(null); setSavingAction('create')
                try {
                  const record = await adminApi.createEmergency({
                    location: SAN_JOSE,
                    declaration_reference: form.get('reference'),
                    starts_on: form.get('starts_on'),
                    ends_on: form.get('ends_on') || null,
                  })
                  replaceEmergency(record); element.reset()
                  setFormStartDate(''); setFormEndDate('')
                  adminToast.success('APC preparation created.', { id: 'emergency-declaration-created' })
                } catch (error: any) {
                  const message = error.response?.data?.message || 'The emergency declaration could not be recorded.'
                  setActionError(message); adminToast.error(message, { id: 'emergency-declaration-error' })
                } finally { setSavingAction(null) }
              }}
              style={{ display: 'grid', gap: '0.85rem', marginTop: '0.85rem' }}
            >
              <div className="emergency-form-location-badge">
                <MapPin size={14} />
                <span>Jurisdiction: <strong>{SAN_JOSE}</strong></span>
              </div>

              <label>
                Declaration reference
                <input
                  name="reference"
                  placeholder="e.g. PDRRMC-2026-08"
                  required
                />
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: '.75rem' }}>
                <label>
                  Start date
                  <input
                    name="starts_on"
                    type="date"
                    required
                    value={formStartDate}
                    onChange={(e) => setFormStartDate(e.target.value)}
                  />
                </label>
                <label>
                  End date
                  <input
                    name="ends_on"
                    type="date"
                    value={formEndDate}
                    onChange={(e) => setFormEndDate(e.target.value)}
                  />
                </label>
              </div>

              <button
                type="button"
                className="emergency-quick-date-btn"
                onClick={handleApplySixtyDays}
                title="Fills a 60-calendar-day period, counting the start date as day one. Verify the official declaration and any statutory exceptions."
              >
                <Clock size={12} />
                <span>Set 60-day end date</span>
              </button>

              <button
                className="admin-button primary"
                type="submit"
                disabled={savingAction !== null}
                style={{ width: '100%', marginTop: '0.25rem' }}
              >
                {savingAction === 'create' ? 'Preparing…' : 'Prepare APC'}
              </button>
            </form>
          </section>
        </div>

        {/* Right Column: Review Console & Active References */}
        <div className="emergency-col-right">
          {detailLoading && <p role="status">{selected ? 'Refreshing…' : 'Loading declaration details…'}</p>}
          {/* Active Price Freeze Action Card */}
          {selected?.effective_state === 'in_effect' && (selected.status === 'active' || (selected.status === 'ended' && !selected.ended_at)) && (
            <section className="admin-card emergency-active-banner">
              <div className="emergency-active-banner-info">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ShieldAlert size={20} style={{ color: '#dc2626' }} />
                  <h4>Active Price Freeze In Effect</h4>
                </div>
                <p>Declaration reference: <strong>{selected.declaration_reference}</strong> ({formatPstDateRange(selected.starts_on, selected.ends_on)})</p>

                {activeTimeline && (
                  <div className="emergency-timeline-box">
                    <div className="emergency-timeline-labels">
                      <span>Day {activeTimeline.daysElapsed} of {activeTimeline.maxDays}</span>
                      <strong>{activeTimeline.daysRemaining === 0 ? 'Ends today' : `${activeTimeline.daysRemaining} ${activeTimeline.daysRemaining === 1 ? 'Day' : 'Days'} Remaining`}</strong>
                    </div>
                    <div className="emergency-timeline-bar-bg">
                      <div
                        className="emergency-timeline-bar-fill"
                        style={{ width: `${activeTimeline.percent}%` }}
                      />
                    </div>
                    <small>Based on the recorded declaration period; verify the official order and applicable law.</small>
                  </div>
                )}
              </div>
              <button
                type="button"
                className="admin-button secondary emergency-end-freeze-btn"
                disabled={savingAction !== null || loading || !loaded || !!loadError || !detailVerified}
                onClick={async () => {
                  if (!window.confirm('End the Price Freeze now?')) return
                  setSavingAction('end'); setActionError(null)
                  try {
                    replaceEmergency(await adminApi.updateEmergency(selected.id, {
                      status: 'ended',
                      ends_on: manilaToday(),
                      confirmed: true,
                    }))
                    adminToast.success('Price Freeze ended immediately.', { id: 'price-freeze-ended' })
                  } catch (error: any) {
                    setActionError(error.response?.data?.message || 'The Price Freeze could not be ended.')
                  } finally {
                    setSavingAction(null)
                  }
                }}
              >
                {savingAction === 'end' ? 'Ending…' : 'End Price Freeze'}
              </button>
            </section>
          )}

          {selected?.ended_at && (
            <section className="admin-card emergency-ended-banner">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                <CheckCircle2 size={18} style={{ color: '#059669' }} />
                <p style={{ margin: 0 }}>
                  Manually ended at {new Date(selected.ended_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila', hour12: true })} · Asia/Manila
                </p>
              </div>
            </section>
          )}

          {/* APC Preparation Workspace (Draft View) */}
          {selected?.status === 'draft' && (
            <section className="admin-card" style={{ padding: '1.25rem' }}>
              <div className="emergency-card-head">
                <div className="emergency-card-title-group">
                  <h3>APC Preparation</h3>
                  <p>
                    Routine observations up to {selected.source_week.ends_on || day(selected.source_week.ends_at)} · Asia/Manila
                  </p>
                </div>
                <button
                  type="button"
                  className="admin-button secondary"
                  disabled={savingAction !== null}
                  onClick={async () => {
                    setActionError(null); setSavingAction('prepare')
                    try {
                      replaceEmergency(await adminApi.prepareEmergency(selected.id))
                      setReviewed(false)
                      adminToast.success('APC preparation refreshed.', { id: 'apc-preparation-refreshed' })
                    } catch (error: any) {
                      setActionError(error.response?.data?.message || 'The APC preparation could not be refreshed.')
                    } finally {
                      setSavingAction(null)
                    }
                  }}
                >
                  <RefreshCw size={16} className={savingAction === 'prepare' ? 'spin' : ''} />
                  {savingAction === 'prepare' ? 'Refreshing…' : 'Refresh preparation'}
                </button>
              </div>

              {/* Pre-Activation Diagnostic Banner if observations are missing */}
              {missingCandidates.length > 0 && (
                <div className="emergency-diagnostic-card">
                  <div className="emergency-diagnostic-header">
                    <AlertTriangle size={18} style={{ color: '#b45309', flexShrink: 0 }} />
                    <div>
                      <strong>Field Monitoring Observations Required Before Activation</strong>
                      <p>
                        {missingCandidates.length} {missingCandidates.length === 1 ? 'commodity does' : 'commodities do'} not have accepted routine surveillance records for the cutoff week.
                      </p>
                    </div>
                  </div>
                  <div className="emergency-diagnostic-chips">
                    {missingCandidates.slice(0, 8).map((mc) => (
                      <span key={mc.id} className="emergency-missing-chip">
                        {srpMap[mc.commodity_key]?.name || humanizeCommoditySlug(mc.commodity_key)}
                      </span>
                    ))}
                    {missingCandidates.length > 8 && (
                      <span className="emergency-missing-chip is-more">
                        +{missingCandidates.length - 8} more
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Search & Filter Toolbar */}
              <div className="apc-table-toolbar">
                <div className="apc-search-wrap">
                  <Search size={15} className="apc-search-icon" />
                  <input
                    type="text"
                    placeholder="Search commodities..."
                    value={candidateSearch}
                    onChange={(e) => setCandidateSearch(e.target.value)}
                    className="apc-search-input"
                  />
                </div>

                <div className="apc-filter-group">
                  <button
                    type="button"
                    className={`apc-filter-pill ${candidateFilter === 'all' ? 'is-active' : ''}`}
                    onClick={() => setCandidateFilter('all')}
                  >
                    All ({selected.candidates.length})
                  </button>
                  <button
                    type="button"
                    className={`apc-filter-pill ${candidateFilter === 'ready' ? 'is-active' : ''}`}
                    onClick={() => setCandidateFilter('ready')}
                  >
                    Ready ({selected.candidates.filter(c => c.observation_count > 0).length})
                  </button>
                  {missingCandidates.length > 0 && (
                    <button
                      type="button"
                      className={`apc-filter-pill is-missing ${candidateFilter === 'missing' ? 'is-active' : ''}`}
                      onClick={() => setCandidateFilter('missing')}
                    >
                      Missing ({missingCandidates.length})
                    </button>
                  )}
                </div>
              </div>

              {/* Candidate Table */}
              <div className="admin-table-wrap">
                <table className="admin-data-table apc-candidate-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Source week</th>
                      <th>Minimum</th>
                      <th>Maximum</th>
                      <th>Observed average</th>
                      <th>Computed APC</th>
                      <th>Observations</th>
                      <th>Establishments</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCandidates.length ? (
                      paginatedCandidates.map((candidate) => {
                        const humanName = srpMap[candidate.commodity_key]?.name || humanizeCommoditySlug(candidate.commodity_key)
                        const unit = srpMap[candidate.commodity_key]?.unit

                        return (
                          <tr key={candidate.id}>
                            <td>
                              <div className="apc-product-cell">
                                <strong className="apc-product-title">{humanName}</strong>
                                <div className="apc-product-meta">
                                  <code className="apc-slug-code">{candidate.commodity_key}</code>
                                  {unit && <span className="apc-unit-tag">{unit}</span>}
                                </div>
                              </div>
                            </td>
                            <td>
                              {candidate.source_week ? (
                                <div className="apc-computed-cell">
                                  <span>{candidate.source_week.starts_on} to {candidate.source_week.ends_on}</span>
                                  {candidate.source_week.starts_on !== cutoffStartsOn && (
                                    <small style={{ display: 'block' }}>Earlier week</small>
                                  )}
                                </div>
                              ) : '—'}
                            </td>
                            <td className="tabular-num">{money(candidate.minimum_price)}</td>
                            <td className="tabular-num">{money(candidate.maximum_price)}</td>
                            <td className="tabular-num">{money(candidate.observed_average_price)}</td>
                            <td>
                              <div className="apc-computed-cell">
                                <strong>{money(candidate.computed_apc_price)}</strong>
                                <small style={{ display: 'block' }}>(min + max) ÷ 2</small>
                              </div>
                            </td>
                            <td className="tabular-num">
                              <span className={`emergency-count-badge ${candidate.observation_count === 0 ? 'is-zero' : ''}`}>
                                {candidate.observation_count}
                              </span>
                            </td>
                            <td className="tabular-num">
                              <span className="emergency-count-badge">
                                {candidate.establishment_count}
                              </span>
                            </td>
                          </tr>
                        )
                      })
                    ) : (
                      <tr>
                        <td colSpan={8} style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                          {candidateSearch ? 'No covered products match your search query.' : 'No covered product has an accepted routine observation before this declaration.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Candidate Table Pagination Footer */}
              {filteredCandidates.length > 0 && (
                <nav className="admin-pagination apc-pagination" aria-label="APC candidates pagination">
                  <div className="apc-pagination-summary">
                    Showing <strong>{candidateFrom}–{candidateTo}</strong> of <strong>{filteredCandidates.length}</strong> commodities
                  </div>
                  <div className="apc-pagination-controls">
                    <div className="apc-pagination-per-page">
                      <label htmlFor="apc-per-page-select">Per page</label>
                      <select
                        id="apc-per-page-select"
                        value={candidatePerPage}
                        onChange={(e) => {
                          setCandidatePerPage(Number(e.target.value))
                          setCandidatePage(1)
                        }}
                      >
                        <option value={8}>8</option>
                        <option value={12}>12</option>
                        <option value={24}>24</option>
                      </select>
                    </div>
                    <div className="apc-pagination-nav">
                      <button
                        type="button"
                        aria-label="Previous page"
                        disabled={candidatePage <= 1}
                        onClick={() => setCandidatePage((p) => Math.max(1, p - 1))}
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span className="apc-page-indicator">
                        Page <strong>{candidatePage}</strong> of <strong>{totalCandidatePages}</strong>
                      </span>
                      <button
                        type="button"
                        aria-label="Next page"
                        disabled={candidatePage >= totalCandidatePages}
                        onClick={() => setCandidatePage((p) => Math.min(totalCandidatePages, p + 1))}
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                </nav>
              )}

              {/* SRP Fallbacks Accordion */}
              {!!srpFallbacks.length && (
                <details className="apc-source-details apc-fallback-details">
                  <summary>
                    {`No routine observation on record. SRP will be held as the Price Freeze ceiling for ${srpFallbacks.length} ${srpFallbacks.length === 1 ? 'product' : 'products'}`}
                  </summary>
                  <ul className="apc-fallback-list">
                    {srpFallbacks.map((fallback) => (
                      <li key={fallback.commodity_key} className="apc-fallback-item">
                        <div>
                          <strong>{fallback.commodity_name}</strong>
                          {fallback.unit ? <span className="apc-unit-tag" style={{ marginLeft: '0.4rem' }}>{fallback.unit}</span> : ''}
                        </div>
                        <span className="apc-fallback-price">{money(fallback.srp_price)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {/* Source Records Container */}
              {selected.candidates.some(c => c.source_observations?.length) && (
                <div className="apc-source-records-container">
                  <div className="apc-source-records-header">
                    <Database size={15} />
                    <strong>Monitoring sources for APC ({selected.candidates.filter(c => c.source_observations?.length).length} products)</strong>
                  </div>
                  <p className="apc-source-records-guidance">Expand a product to review the establishment, observation date, recorded price, and monitoring record used in its APC preparation.</p>
                  <div className="apc-source-records-scroll">
                    {selected.candidates.map((candidate) =>
                      candidate.source_observations?.length ? (
                        <details key={`source-${candidate.id}`} className="apc-source-details">
                          <summary>Source records for {srpMap[candidate.commodity_key]?.name || humanizeCommoditySlug(candidate.commodity_key)}</summary>
                          <ul>
                            {candidate.source_observations.map((observation) => (
                              <li key={observation.item_id}>
                                <strong>{observation.store_name}</strong> · {day(observation.finalized_at)} · {money(observation.recorded_price)} · Record #{observation.monitoring_record_id}
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null
                    )}
                  </div>
                </div>
              )}

              {/* Compliance & Verification Box */}
              <div className="apc-verification-box">
                <div className="apc-verification-header">
                  <CheckCircle2 size={16} />
                  <strong>Statutory Evaluation & Activation Confirmation</strong>
                </div>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={reviewed}
                    onChange={(event) => setReviewed(event.target.checked)}
                  />
                  <span>I reviewed the source week of each product, supporting statistics, computed APC values, and products held at SRP.</span>
                </label>

                <button
                  type="button"
                  className="admin-button primary"
                  disabled={!reviewed || !completePreparation || !selected.preparation_hash || savingAction !== null || loading || !loaded || !!loadError || !detailVerified}
                  onClick={async () => {
                    if (!selected.preparation_hash) return
                    setActionError(null); setSavingAction('activate')
                    try {
                      replaceEmergency(await adminApi.activateEmergency(selected.id, {
                        confirmed: true,
                        preparation_hash: selected.preparation_hash,
                      }))
                      setReviewed(false)
                      adminToast.success('Official APC references confirmed and Price Freeze activated.', {
                        id: 'price-freeze-activated',
                      })
                    } catch (error: any) {
                      const message = error.response?.data?.message || 'Price Freeze could not be activated.'
                      setActionError(message)
                      if (error.response?.data?.status === 'APC_PREPARATION_STALE') setReviewed(false)
                    } finally {
                      setSavingAction(null)
                    }
                  }}
                  style={{ width: '100%' }}
                >
                  {savingAction === 'activate' ? 'Activating…' : 'Confirm and activate'}
                </button>
              </div>
            </section>
          )}

          {/* Official References Card */}
          <section className="admin-card" style={{ padding: '1.25rem' }}>
            <div className="emergency-card-head">
              <div className="emergency-card-title-group">
                <h3><Database size={18} /> Official APC / Price Freeze References</h3>
                <p>These references are separate from SRP and exist only after DTI Admin confirmation.</p>
              </div>
              <span className="emergency-status-chip chip-draft">
                {officialPrices.length} {officialPrices.length === 1 ? 'Reference' : 'References'}
              </span>
            </div>

            <div className="admin-table-wrap">
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Reference</th>
                    <th>Official APC</th>
                    <th>Effective period</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {officialPrices.length ? (
                    paginatedOfficialPrices.map((price) => {
                      const humanName = srpMap[price.commodity_key]?.name || humanizeCommoditySlug(price.commodity_key)
                      return (
                        <tr key={price.id}>
                          <td>
                            <div className="apc-product-cell">
                              <strong className="apc-product-title">{humanName}</strong>
                              <code className="apc-slug-code">{price.commodity_key}</code>
                            </div>
                          </td>
                          <td>
                            <span className={`emergency-ref-badge ${price.price_type === 'APC' ? 'is-apc' : 'is-srp'}`}>
                              {price.price_type}
                            </span>
                          </td>
                          <td className="tabular-num">
                            <strong style={{ color: '#1e3a8a', fontSize: '0.96rem' }}>
                              {money(price.authoritative_price)}
                            </strong>
                          </td>
                          <td>{formatPstDateRange(price.effective_from, price.effective_until)}</td>
                          <td>
                            <span className="emergency-source-tag">{price.source_reference}</span>
                          </td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                        No official APC references have been confirmed.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Official References Pagination Footer */}
            {officialPrices.length > 0 && (
              <nav className="admin-pagination apc-pagination" aria-label="Official APC references pagination">
                <div className="apc-pagination-summary">
                  Showing <strong>{refFrom}–{refTo}</strong> of <strong>{officialPrices.length}</strong> references
                </div>
                <div className="apc-pagination-controls">
                  <div className="apc-pagination-per-page">
                    <label htmlFor="ref-per-page-select">Per page</label>
                    <select
                      id="ref-per-page-select"
                      value={refPerPage}
                      onChange={(e) => {
                        setRefPerPage(Number(e.target.value))
                        setRefPage(1)
                      }}
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                    </select>
                  </div>
                  <div className="apc-pagination-nav">
                    <button
                      type="button"
                      aria-label="Previous references page"
                      disabled={refPage <= 1}
                      onClick={() => setRefPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="apc-page-indicator">
                      Page <strong>{refPage}</strong> of <strong>{totalRefPages}</strong>
                    </span>
                    <button
                      type="button"
                      aria-label="Next references page"
                      disabled={refPage >= totalRefPages}
                      onClick={() => setRefPage((p) => Math.min(totalRefPages, p + 1))}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              </nav>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
