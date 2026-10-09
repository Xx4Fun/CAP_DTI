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
import type { RegulatoryEmergencyCandidate, RegulatoryEmergencySrpFallback, RegulatoryEmergencyRecord, RegulatoryEmergencySummary } from '../../types/admin'
import {
  humanizeCommoditySlug,
  formatPstDateRange,
} from '../../utils/commodityFormatter'

const SAN_JOSE = 'San Jose de Buenavista, Antique'
const money = (value: number) => `₱${Number(value).toFixed(2)}`
const day = (value: string | null) => value ? value.slice(0, 10) : '—'
const PRICE_STAGES = new Map([
  ['scheduled', 'Confirmed price ceilings — scheduled'],
  ['in_effect', 'Confirmed price ceilings'],
  ['ended', 'Historical price ceilings'],
  ['expired', 'Historical price ceilings'],
  ['cancelled', 'Cancelled declaration'],
])
type DraftPriceRow = RegulatoryEmergencyCandidate | RegulatoryEmergencySrpFallback
const emergencySummary = (record: RegulatoryEmergencyRecord): RegulatoryEmergencySummary => ({
  id: record.id, location: record.location, declaration_reference: record.declaration_reference,
  starts_on: record.starts_on, ends_on: record.ends_on, ended_at: record.ended_at,
  status: record.status, effective_state: record.effective_state,
  activation_lock_held: record.activation_lock_held, can_release_expired_lock: record.can_release_expired_lock,
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
  const [activationVerification, setActivationVerification] = useState<{ id: number; hash: string } | null>(null)
  const [checkingActivation, setCheckingActivation] = useState(false)
  const verificationRequest = useRef(0)

  // Candidate filtering & search state
  const [candidateSearch, setCandidateSearch] = useState('')
  const [candidateFilter, setCandidateFilter] = useState<'all' | 'apc' | 'srp' | 'missing'>('all')

  // Pagination state
  const [candidatePage, setCandidatePage] = useState(1)
  const [candidatePerPage, setCandidatePerPage] = useState(8)
  const [refPage, setRefPage] = useState(1)
  const [refPerPage, setRefPerPage] = useState(10)

  // Reset draft pagination on filter or selection change
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

  const resetPricing = () => {
    setCandidateSearch(''); setCandidateFilter('all')
    setCandidatePage(1); setRefPage(1)
  }

  const replaceEmergency = (record: RegulatoryEmergencyRecord, preserveSelection = false) => {
    loadRequest.current++
    detailRequest.current++
    summaryInFlight.current = false; refreshQueued.current = false; detailInFlight.current = null
    setLoading(false)
    setDetailLoading(false); setDetailError(null)
    setEmergencies((current) => current.some((item) => item.id === record.id)
      ? current.map((item) => item.id === record.id ? emergencySummary(record) : item)
      : [emergencySummary(record), ...current])
    if (!preserveSelection || selectedIdRef.current === record.id) {
      if (selectedIdRef.current !== record.id) resetPricing()
      selectedIdRef.current = record.id
      setSelectedId(record.id); setSelectedDetail(record)
    }
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
      resetPricing()
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

  const refreshMutation = (record: RegulatoryEmergencyRecord, preserveSelection = true) => {
    const wasVerified = summaryVerified.current
    replaceEmergency(record, preserveSelection)
    // A write can recover another declaration's lock, so update the entire list as well as this record.
    if (wasVerified) void loadEmergencies()
  }

  const verifyActivation = async (target: { id: number; hash: string }) => {
    const request = ++verificationRequest.current
    setActivationVerification(target); setCheckingActivation(true); setActionError(null)
    try {
      const record = await adminApi.getEmergency(target.id)
      if (request !== verificationRequest.current) return
      refreshMutation(record)
      setActivationVerification(null)
      setReviewed(false)
      if (record.status === 'draft') {
        setActionError('Declaration was not confirmed. Review the preparation and try again.')
      } else {
        window.dispatchEvent(new Event('regulatory-data-changed'))
        if (record.status === 'active' && record.preparation_hash === target.hash) {
          adminToast.success(record.effective_state === 'scheduled'
            ? 'Declaration confirmation is saved. Price Freeze is scheduled for its recorded start date.'
            : 'Declaration confirmation is saved. The current protocol has been refreshed.', { id: 'price-freeze-activated' })
        }
      }
    } catch {
      // Keep the activation write disabled until a status read succeeds. Retry performs only reads.
    } finally {
      if (request === verificationRequest.current) setCheckingActivation(false)
    }
  }

  useEffect(() => {
    void loadEmergencies()
    const stop = regulatoryRefresh(() => { void loadEmergencies() })
    return () => {
      loadRequest.current++; detailRequest.current++
      verificationRequest.current++
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
  const officialPrices = useMemo(() => selectedSummary?.official_prices ?? [], [selectedSummary])
  const srpFallbacks = selected?.srp_fallbacks ?? []
  const isDraft = selectedSummary?.status === 'draft' && selectedSummary.effective_state === 'draft'
  const expiredDraft = isDraft && !!selectedSummary?.ends_on && day(selectedSummary.ends_on) < manilaToday()
  const expiredLocks = emergencies.filter((record) => record.can_release_expired_lock)
  const pricingStage = isDraft ? 'Proposed price ceilings' : PRICE_STAGES.get(selectedSummary?.effective_state ?? '') ?? 'Status unavailable'
  const draftPrices = useMemo<DraftPriceRow[]>(() => selected ? [...selected.candidates, ...(selected.srp_fallbacks ?? [])] : [], [selected])
  const productName = (row: DraftPriceRow) => 'computed_apc_price' in row
    ? srpMap[row.commodity_key]?.name || humanizeCommoditySlug(row.commodity_key)
    : row.commodity_name
  const priceCount = isDraft ? selected ? draftPrices.length : null : officialPrices.length
  const cutoffStartsOn = selected ? selected.source_week.starts_on || day(selected.source_week.starts_at) : null
  const completePreparation = !!selected
    && selected.candidates.length + srpFallbacks.length > 0
    && selected.candidates.every((candidate) => candidate.observation_count > 0)

  const filteredDraftPrices = draftPrices.filter((row) => {
      const name = productName(row)
      const matchesSearch = !candidateSearch.trim() ||
        row.commodity_key.toLowerCase().includes(candidateSearch.toLowerCase()) ||
        name.toLowerCase().includes(candidateSearch.toLowerCase())

      if (!matchesSearch) return false

      if (candidateFilter === 'apc') return 'computed_apc_price' in row && row.observation_count > 0
      if (candidateFilter === 'srp') return !('computed_apc_price' in row)
      if (candidateFilter === 'missing') return 'computed_apc_price' in row && row.observation_count === 0
      return true
    })

  // Paginated candidate slice & boundaries
  const totalCandidatePages = Math.max(1, Math.ceil(filteredDraftPrices.length / candidatePerPage))
  useEffect(() => { setCandidatePage((page) => Math.min(page, totalCandidatePages)) }, [totalCandidatePages])
  const paginatedDraftPrices = filteredDraftPrices.slice((candidatePage - 1) * candidatePerPage, candidatePage * candidatePerPage)
  const candidateFrom = filteredDraftPrices.length === 0 ? 0 : (candidatePage - 1) * candidatePerPage + 1
  const candidateTo = Math.min(candidatePage * candidatePerPage, filteredDraftPrices.length)

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
      {activationVerification && (
        <div role="alert" className="admin-alert admin-alert--error">
          <p>{checkingActivation ? 'Checking activation status…' : 'Activation result unknown. Could not verify whether the declaration was saved. Check its status before trying another activation.'}</p>
          <button type="button" disabled={checkingActivation || savingAction !== null}
            onClick={() => void verifyActivation(activationVerification)}>Retry status checking</button>
        </div>
      )}
      {expiredLocks.map((record) => (
        <div key={record.id} role="alert" className="admin-alert admin-alert--error">
          <div>
            <strong>Expired activation lock</strong>
            <p>Expired declaration {record.declaration_reference} (ended {day(record.ends_on)}) still holds an activation lock. It does not put a Price Freeze in effect today.</p>
            <p>Historical dates and confirmed prices will be preserved when this lock is released. A valid new activation also releases it automatically.</p>
            <button type="button" className="admin-button secondary"
              disabled={!loaded || loading || !!loadError || savingAction !== null || !!activationVerification}
              onClick={async () => {
                setSavingAction('release'); setActionError(null)
                try {
                  refreshMutation(await adminApi.releaseExpiredEmergencyLock(record.id))
                  adminToast.success('Expired activation lock released. Historical dates and prices were preserved.', { id: 'expired-lock-released' })
                } catch (error: any) {
                  setActionError(error.response?.data?.message || 'Could not verify lock recovery. Refresh declarations before trying again.')
                  void loadEmergencies()
                } finally {
                  setSavingAction(null)
                }
              }}>
              {savingAction === 'release' ? 'Releasing…' : 'Release expired lock'}
            </button>
          </div>
        </div>
      ))}
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
          {selected?.status === 'active' && selected.effective_state === 'scheduled' && (
            <section className="admin-card">
              <h4>Scheduled declaration reserves activation</h4>
              <p>{selected.declaration_reference} is confirmed for {formatPstDateRange(selected.starts_on, selected.ends_on)}. Cancel it before confirming a different declaration.</p>
              <button type="button" className="admin-button secondary"
                disabled={savingAction !== null || loading || !loaded || !!loadError || !detailVerified || !!activationVerification}
                onClick={async () => {
                  setSavingAction('cancel'); setActionError(null)
                  try {
                    refreshMutation(await adminApi.updateEmergency(selected.id, { status: 'cancelled', confirmed: true }))
                    adminToast.success('Scheduled declaration cancelled.', { id: 'scheduled-declaration-cancelled' })
                  } catch (error: any) {
                    setActionError(error.response?.data?.message || 'The scheduled declaration could not be cancelled.')
                  } finally {
                    setSavingAction(null)
                  }
                }}>{savingAction === 'cancel' ? 'Cancelling…' : 'Cancel scheduled declaration'}</button>
            </section>
          )}
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
                    refreshMutation(await adminApi.updateEmergency(selected.id, {
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

          {selectedSummary && (
            <section className="admin-card emergency-pricing-section" aria-labelledby="emergency-prices-title">
              <div className="emergency-card-head">
                <div className="emergency-card-title-group">
                  <h3 id="emergency-prices-title">Price Freeze Prices</h3>
                  <p>Automatic Price Control (APC) uses monitoring observations; eligible products without observations are held at SRP.</p>
                </div>
                <span className="emergency-status-chip chip-draft">
                  {priceCount ?? '—'} {priceCount === 1 ? 'Product' : 'Products'}
                </span>
              </div>
              <div className="emergency-pricing-context">
                <strong>{selectedSummary.declaration_reference}</strong>
                <span>{formatPstDateRange(selectedSummary.starts_on, selectedSummary.ends_on)}</span>
                <span className="emergency-status-chip">
                  {pricingStage === 'Status unavailable' ? pricingStage : selectedSummary.effective_state.replaceAll('_', ' ')}
                </span>
              </div>
              <h4 className="emergency-pricing-stage">{pricingStage}</h4>

          {isDraft && selected && (
            <>
              <div className="emergency-card-head">
                <div className="emergency-card-title-group">
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
                    aria-label="Search prices"
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
                    All ({draftPrices.length})
                  </button>
                  <button
                    type="button"
                    className={`apc-filter-pill ${candidateFilter === 'apc' ? 'is-active' : ''}`}
                    onClick={() => setCandidateFilter('apc')}
                  >
                    Calculated APC ({selected.candidates.filter(c => c.observation_count > 0).length})
                  </button>
                  <button
                    type="button"
                    className={`apc-filter-pill ${candidateFilter === 'srp' ? 'is-active' : ''}`}
                    onClick={() => setCandidateFilter('srp')}
                  >
                    SRP held ({srpFallbacks.length})
                  </button>
                    <button
                      type="button"
                      className={`apc-filter-pill is-missing ${candidateFilter === 'missing' ? 'is-active' : ''}`}
                      onClick={() => setCandidateFilter('missing')}
                    >
                      Needs observations ({missingCandidates.length})
                    </button>
                </div>
              </div>

              <div className="admin-table-wrap">
                <table className="admin-data-table apc-candidate-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Proposed ceiling</th>
                      <th>Price basis</th>
                      <th>Monitoring coverage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDraftPrices.length ? paginatedDraftPrices.map((row) => {
                      const candidate = 'computed_apc_price' in row ? row : null
                      const fallback = 'srp_price' in row ? row : null
                      const usable = !!candidate && candidate.observation_count > 0
                      const unit = fallback?.unit ?? srpMap[row.commodity_key]?.unit
                      return (
                        <tr key={candidate ? `apc-${candidate.id}` : `srp-${row.commodity_key}`}>
                          <td data-label="Product">
                            <div className="apc-product-cell">
                              <strong className="apc-product-title">{productName(row)}</strong>
                              {unit && <span className="apc-unit-tag">{unit}</span>}
                            </div>
                          </td>
                          <td data-label="Proposed ceiling" className="tabular-num">
                            <strong>{fallback ? money(fallback.srp_price) : usable ? money(candidate!.computed_apc_price) : 'Unavailable'}</strong>
                          </td>
                          <td data-label="Price basis">{fallback ? 'SRP held as ceiling' : usable ? 'Calculated APC' : 'Needs observations'}</td>
                          <td data-label="Monitoring coverage">{fallback ? 'No usable routine observations' : `${candidate!.observation_count} observations · ${candidate!.establishment_count} establishments`}</td>
                        </tr>
                      )
                    }) : (
                      <tr><td colSpan={4}>No products match your search or filter.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Candidate Table Pagination Footer */}
              {filteredDraftPrices.length > 0 && (
                <nav className="admin-pagination apc-pagination" aria-label="Proposed price ceilings pagination">
                  <div className="apc-pagination-summary">
                    Showing <strong>{candidateFrom}–{candidateTo}</strong> of <strong>{filteredDraftPrices.length}</strong> commodities
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
                          <div className="apc-source-statistics">
                            <div><span>Source week</span><strong>{candidate.source_week
                              ? formatPstDateRange(candidate.source_week.starts_on, candidate.source_week.ends_on)
                              : formatPstDateRange(selected.source_week.starts_on || day(selected.source_week.starts_at), selected.source_week.ends_on || day(selected.source_week.ends_at))}</strong>
                              {candidate.source_week && candidate.source_week.starts_on !== cutoffStartsOn && <small>Earlier source week</small>}
                            </div>
                            <div><span>Minimum</span><strong>{money(candidate.minimum_price)}</strong></div>
                            <div><span>Maximum</span><strong>{money(candidate.maximum_price)}</strong></div>
                            <div><span>Observed average</span><strong>{money(candidate.observed_average_price)}</strong></div>
                            <div><span>Calculated APC</span><strong>{money(candidate.computed_apc_price)}</strong><small>(min + max) ÷ 2</small></div>
                          </div>
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

                {expiredDraft && <p role="alert">Cannot activate this expired declaration: its end date is {day(selected.ends_on)} (Asia/Manila). Prepare a declaration with the correct effective dates.</p>}

                <button
                  type="button"
                  className="admin-button primary"
                  disabled={expiredDraft || !!activationVerification || !reviewed || !completePreparation || !selected.preparation_hash || savingAction !== null || loading || !loaded || !!loadError || !detailVerified}
                  onClick={async () => {
                    if (!selected.preparation_hash) return
                    setActionError(null); setSavingAction('activate')
                    try {
                      const record = await adminApi.activateEmergency(selected.id, {
                        confirmed: true,
                        preparation_hash: selected.preparation_hash,
                      })
                      refreshMutation(record)
                      setReviewed(false)
                      adminToast.success(record.effective_state === 'scheduled'
                        ? 'Official price references confirmed. Price Freeze is scheduled for its recorded start date.'
                        : 'Official APC references confirmed and Price Freeze activated.', {
                        id: 'price-freeze-activated',
                      })
                    } catch (error: any) {
                      if (!error.response || error.response.status >= 500) {
                        await verifyActivation({ id: selected.id, hash: selected.preparation_hash })
                      } else {
                        const message = error.response?.data?.message || 'Price Freeze could not be activated.'
                        setActionError(message)
                        if (error.response?.data?.status === 'APC_PREPARATION_STALE') setReviewed(false)
                        if (error.response?.data?.status === 'EMERGENCY_ACTIVATION_BLOCKED') void loadEmergencies()
                      }
                    } finally {
                      setSavingAction(null)
                    }
                  }}
                  style={{ width: '100%' }}
                >
                  {savingAction === 'activate' ? 'Activating…' : 'Confirm and activate'}
                </button>
              </div>
            </>
          )}

          {!isDraft && (
            <>
            <div className="admin-table-wrap">
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Confirmed ceiling</th>
                    <th>Price basis</th>
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
                          <td data-label="Product">
                            <div className="apc-product-cell">
                              <strong className="apc-product-title">{humanName}</strong>
                              <code className="apc-slug-code">{price.commodity_key}</code>
                            </div>
                          </td>
                          <td data-label="Confirmed ceiling" className="tabular-num">
                            <strong>{money(price.authoritative_price)}</strong>
                          </td>
                          <td data-label="Price basis">
                            <span className={`emergency-ref-badge ${price.price_type === 'APC' ? 'is-apc' : 'is-srp'}`}>
                              {price.price_type === 'APC' ? 'Calculated APC' : price.price_type === 'SRP' ? 'SRP held as ceiling' : price.price_type}
                            </span>
                          </td>
                          <td data-label="Effective period">{formatPstDateRange(price.effective_from, price.effective_until)}</td>
                          <td data-label="Source">
                            <span className="emergency-source-tag">{price.source_reference}</span>
                          </td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                        No confirmed price ceilings recorded for this declaration
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Official References Pagination Footer */}
            {officialPrices.length > 0 && (
              <nav className="admin-pagination apc-pagination" aria-label="Confirmed price ceilings pagination">
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
            </>
          )}
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
