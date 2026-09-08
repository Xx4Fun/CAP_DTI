import { type KeyboardEvent, useCallback, useEffect, useState } from 'react'
import {
  Activity, AlertTriangle, ArrowLeft, ArrowRight, Building2, Calendar, CheckCircle2, ChevronLeft, ChevronRight, Clock,
  Eye, FileSignature, History, LayoutGrid, List, MapPin, RefreshCw, Search, ShieldAlert,
  ShieldCheck, Store, TrendingUp, TriangleAlert, User, UserCheck, X,
} from 'lucide-react'
import { adminApi } from '../../services/adminApi'
import type {
  FieldVerificationRequestPage, MonitoringEstablishmentProfile, MonitoringEstablishmentSummary,
  MonitoringPriceHistoryPage, MonitoringPriceHistoryRow, MonitoringRecordPage, MonitoringRecordRecord, MonitoringWorkspace,
} from '../../types/admin'

type Tab = 'establishments' | 'records' | 'verification'
type ProfileTab = 'overview' | 'history' | 'records'
type WeeklyStatus = 'all' | 'not_yet_monitored' | 'monitored_this_week'
type AdditionalTask = 'all' | 'verification_required'
type ObservationStatus = 'all' | 'with_observations' | 'reference_unavailable' | 'no_observations'
type VerificationStatus = 'all' | 'open' | 'claimed' | 'completed' | 'cancelled'
type ViewMode = 'list' | 'grid' | 'table'

const emptyRecords: MonitoringRecordPage = { data: [], current_page: 1, last_page: 1, per_page: 10, total: 0, from: null, to: null }
const emptyHistory: MonitoringPriceHistoryPage = { ...emptyRecords, data: [] }
const emptyVerification: FieldVerificationRequestPage = { ...emptyRecords, data: [] }
const message = (error: unknown) => (error as { response?: { data?: { message?: string } } }).response?.data?.message || 'Field Monitoring data could not load.'
const formatDate = (value?: string | null) => value ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Not recorded'
const formatShortDate = (value?: string | null) => value ? new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)) : 'No visits'
const money = (value?: number | string | null) => value === null || value === undefined ? 'Unavailable' : `₱${Number(value).toFixed(2)}`

function initialTab(): Tab {
  const value = new URLSearchParams(window.location.search).get('monitor_tab')
  return value === 'records' || value === 'verification' ? value : 'establishments'
}

function getStoreInitials(storeName: string): string {
  const words = storeName.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return 'ST'
  return words.slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
}

function moveTabFocus(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
  const current = tabs.indexOf(document.activeElement as HTMLButtonElement)
  if (current < 0) return
  event.preventDefault()
  const next = tabs[(current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]
  next.focus()
  next.click()
}

export function FieldMonitoringRecords({ onNavigate }: { onNavigate?: (module: 'legal_actions') => void }) {
  const params = new URLSearchParams(window.location.search)
  const [tab, setTab] = useState<Tab>(initialTab)
  const [searches, setSearches] = useState({
    establishments: params.get('establishment_search') || '',
    records: params.get('record_search') || '',
    verification: params.get('verification_search') || '',
  })
  const [queries, setQueries] = useState(searches)
  const [weeklyStatus, setWeeklyStatus] = useState<WeeklyStatus>((params.get('weekly_status') as WeeklyStatus) || 'all')
  const [additionalTask, setAdditionalTask] = useState<AdditionalTask>((params.get('additional_task') as AdditionalTask) || 'all')
  const [observation, setObservation] = useState<ObservationStatus>((params.get('observation') as ObservationStatus) || 'all')
  const [recordAnomaly, setRecordAnomaly] = useState<'all' | 'yes' | 'no'>((params.get('anomaly') as 'all' | 'yes' | 'no') || 'all')
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>((params.get('verification_status') as VerificationStatus) || 'all')
  const [profileTab, setProfileTab] = useState<ProfileTab>((params.get('profile_tab') as ProfileTab) || 'overview')
  const [commodity, setCommodity] = useState<`key:${string}` | `srp:${number}` | ''>('')
  const [verificationStore, setVerificationStore] = useState<number | null>(Number(params.get('verification_store')) || null)
  const [verificationStoreName, setVerificationStoreName] = useState('')
  const [pendingRequest, setPendingRequest] = useState<number | null>(null)
  const [workspace, setWorkspace] = useState<MonitoringWorkspace | null>(null)
  const [records, setRecords] = useState(emptyRecords)
  const [verification, setVerification] = useState(emptyVerification)
  const [profile, setProfile] = useState<MonitoringEstablishmentProfile | null>(null)
  const [history, setHistory] = useState(emptyHistory)
  const [profileRecords, setProfileRecords] = useState(emptyRecords)
  const [selectedRecord, setSelectedRecord] = useState<MonitoringRecordRecord | null>(null)
  const [establishmentPage, setEstablishmentPage] = useState(1)
  const [recordPage, setRecordPage] = useState(1)
  const [verificationPage, setVerificationPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const updateUrl = useCallback((changes: Record<string, string | number | null>) => {
    const url = new URL(window.location.href)
    Object.entries(changes).forEach(([key, value]) => value === null || value === '' ? url.searchParams.delete(key) : url.searchParams.set(key, String(value)))
    window.history.pushState({ fieldMonitoring: true }, '', `${url.pathname}${url.search}${url.hash}`)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = {
        establishments: searches.establishments.trim(),
        records: searches.records.trim(),
        verification: searches.verification.trim(),
      }
      setQueries(next)
      const url = new URL(window.location.href)
      const keys = { establishments: 'establishment_search', records: 'record_search', verification: 'verification_search' } as const
      Object.entries(next).forEach(([view, value]) => value ? url.searchParams.set(keys[view as keyof typeof keys], value) : url.searchParams.delete(keys[view as keyof typeof keys]))
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searches])

  const fetchRecord = useCallback(async (id: number) => {
    setLoading(true); setError('')
    try {
      setSelectedRecord(await adminApi.getMonitoringRecord(id))
    } catch (reason) { setError(message(reason)) }
    finally { setLoading(false) }
  }, [])

  const openRecord = useCallback(async (id: number) => {
    await fetchRecord(id)
    updateUrl({ record: id })
  }, [fetchRecord, updateUrl])

  const loadEstablishments = useCallback(async () => {
    setLoading(true); setError('')
    try { setWorkspace(await adminApi.getMonitoringEstablishments({ search: queries.establishments || undefined, weekly_status: weeklyStatus, additional_task: additionalTask, observation, page: establishmentPage, per_page: 10 })) }
    catch (reason) { setError(message(reason)) }
    finally { setLoading(false) }
  }, [additionalTask, establishmentPage, observation, queries.establishments, weeklyStatus])

  const loadRecords = useCallback(async () => {
    setLoading(true); setError('')
    try { setRecords(await adminApi.getMonitoringRecords({ search: queries.records || undefined, anomaly: recordAnomaly, page: recordPage, per_page: 10 })) }
    catch (reason) { setError(message(reason)) }
    finally { setLoading(false) }
  }, [queries.records, recordAnomaly, recordPage])

  const loadVerification = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const next = await adminApi.getFieldVerificationRequests({ search: queries.verification || undefined, status: verificationStatus, store_id: verificationStore || undefined, page: verificationPage, per_page: 10 })
      setVerification(next)
      if (verificationStore && !verificationStoreName && next.data[0]) setVerificationStoreName(next.data[0].store.store_name)
    }
    catch (reason) { setError(message(reason)) }
    finally { setLoading(false) }
  }, [queries.verification, verificationPage, verificationStatus, verificationStore, verificationStoreName])

  useEffect(() => {
    if (profile || selectedRecord) return
    if (tab === 'establishments') void loadEstablishments()
    if (tab === 'records') void loadRecords()
    if (tab === 'verification') void loadVerification()
  }, [loadEstablishments, loadRecords, loadVerification, profile, selectedRecord, tab])

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search)
    const recordId = Number(initial.get('record'))
    const storeId = Number(initial.get('store'))
    if (recordId > 0) void fetchRecord(recordId)
    else if (storeId > 0) void openProfile(storeId, false)
    // URL state is restored once; browser navigation is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const restore = () => {
      const restored = initialTab()
      setTab(restored)
      const current = new URLSearchParams(window.location.search)
      const recordId = Number(current.get('record'))
      const storeId = Number(current.get('store'))
      const nextProfileTab = current.get('profile_tab') as ProfileTab
      setProfileTab(['overview', 'history', 'records'].includes(nextProfileTab) ? nextProfileTab : 'overview')
      setWeeklyStatus((current.get('weekly_status') as WeeklyStatus) || 'all')
      setAdditionalTask((current.get('additional_task') as AdditionalTask) || 'all')
      setObservation((current.get('observation') as ObservationStatus) || 'all')
      setRecordAnomaly((current.get('anomaly') as 'all' | 'yes' | 'no') || 'all')
      setVerificationStatus((current.get('verification_status') as VerificationStatus) || 'all')
      setVerificationStore(Number(current.get('verification_store')) || null)
      setSearches({ establishments: current.get('establishment_search') || '', records: current.get('record_search') || '', verification: current.get('verification_search') || '' })
      if (recordId > 0) void fetchRecord(recordId)
      else if (storeId > 0 && (!profile || profile.store.id !== storeId)) { setSelectedRecord(null); void openProfile(storeId, false) }
      else setSelectedRecord(null)
    }
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
    // openProfile intentionally reads the current URL during browser history restoration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchRecord, profile])

  useEffect(() => {
    if (profile || selectedRecord) window.requestAnimationFrame(() => document.querySelector<HTMLElement>('.field-monitor-profile h2, .field-monitor-review-page h2')?.focus())
  }, [profile, selectedRecord])

  const switchTab = (next: Tab) => {
    setTab(next); setProfile(null); setSelectedRecord(null)
    updateUrl({ monitor_tab: next === 'establishments' ? null : next, store: null, record: null })
  }

  async function openProfile(storeId: number, updateHistory = true) {
    setLoading(true); setError('')
    try {
      const nextProfile = await adminApi.getMonitoringEstablishment(storeId)
      const requested = new URLSearchParams(window.location.search).get('commodity')
      const selector = nextProfile.monitored_commodities.find((item) => item.selector === requested)?.selector || nextProfile.monitored_commodities[0]?.selector || ''
      const [nextHistory, nextRecords] = await Promise.all([
        adminApi.getMonitoringPriceHistory(storeId, { commodity: selector || undefined, per_page: 10 }),
        adminApi.getMonitoringRecords({ store_id: storeId, anomaly: 'all', per_page: 10 }),
      ])
      setCommodity(selector)
      setProfile(nextProfile); setHistory(nextHistory); setProfileRecords(nextRecords)
      if (updateHistory) updateUrl({ store: storeId })
    } catch (reason) { setError(message(reason)) }
    finally { setLoading(false) }
  }

  const closeDetail = () => {
    setSelectedRecord(null)
    updateUrl({ record: null })
  }

  const loadProfileHistoryPage = async (page: number) => {
    if (!profile) return
    try { setHistory(await adminApi.getMonitoringPriceHistory(profile.store.id, { commodity: commodity || undefined, page, per_page: 10 })) }
    catch (reason) { setError(message(reason)) }
  }

  const loadProfileRecordsPage = async (page: number) => {
    if (!profile) return
    try { setProfileRecords(await adminApi.getMonitoringRecords({ store_id: profile.store.id, anomaly: 'all', page, per_page: 10 })) }
    catch (reason) { setError(message(reason)) }
  }

  if (selectedRecord) return <VisitReview record={selectedRecord} error={error} backLabel={profile ? 'Return to establishment' : tab === 'records' ? 'Back to All Records' : 'Back to Verification Requests'} onBack={closeDetail} onRegulatoryAction={() => {
    const url = new URL(window.location.href)
    url.searchParams.set('source_record', String(selectedRecord.id))
    url.searchParams.set('source_store', String(selectedRecord.store.id))
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
    onNavigate?.('legal_actions')
  }} />

  if (profile) return <EstablishmentProfile profile={profile} profileTab={profileTab} commodity={commodity} history={history} records={profileRecords} error={error} onBack={() => {
    setProfile(null)
    updateUrl({ store: null })
  }} onProfileTab={(next) => { setProfileTab(next); updateUrl({ profile_tab: next === 'overview' ? null : next }) }} onCommodity={async (next) => { setCommodity(next); setHistory(await adminApi.getMonitoringPriceHistory(profile.store.id, { commodity: next, per_page: 10 })); updateUrl({ commodity: next }) }} onVerification={() => { setVerificationStore(profile.store.id); setVerificationStoreName(profile.store.store_name); setProfile(null); setTab('verification'); updateUrl({ store: null, profile_tab: null, monitor_tab: 'verification', verification_store: profile.store.id }) }} onOpenRecord={openRecord} onHistoryPage={loadProfileHistoryPage} onRecordsPage={loadProfileRecordsPage} />

  return <div className="field-monitor-admin">
    <div className="field-monitor-tab-cards" role="tablist" aria-label="Field Monitoring workspace" onKeyDown={moveTabFocus}>
      {/* Tab 1: Establishments */}
      <button
        id="monitor-tab-establishments"
        aria-controls="monitor-panel-establishments"
        type="button"
        role="tab"
        tabIndex={tab === 'establishments' ? 0 : -1}
        aria-selected={tab === 'establishments'}
        aria-label="Establishments"
        className={`monitor-nav-card ${tab === 'establishments' ? 'active' : ''}`}
        onClick={() => switchTab('establishments')}
      >
        <div className={`nav-card-icon-wrap ${tab === 'establishments' ? 'active-establishments' : ''}`}>
          <Building2 size={24} />
        </div>
        <div className="nav-card-body">
          <h3 className="nav-card-title">Establishments</h3>
          <p className="nav-card-desc">View and manage monitored establishments</p>
        </div>
      </button>

      {/* Tab 2: Verification Requests */}
      <button
        id="monitor-tab-verification"
        aria-controls="monitor-panel-verification"
        type="button"
        role="tab"
        tabIndex={tab === 'verification' ? 0 : -1}
        aria-selected={tab === 'verification'}
        aria-label="Verification Requests"
        className={`monitor-nav-card ${tab === 'verification' ? 'active' : ''}`}
        onClick={() => switchTab('verification')}
      >
        <div className={`nav-card-icon-wrap ${tab === 'verification' ? 'active-verification' : ''}`}>
          <ShieldCheck size={24} />
        </div>
        <div className="nav-card-body">
          <h3 className="nav-card-title">Verification Requests</h3>
          <p className="nav-card-desc">Review and act on verification requests</p>
        </div>
      </button>

      {/* Tab 3: All Records */}
      <button
        id="monitor-tab-records"
        aria-controls="monitor-panel-records"
        type="button"
        role="tab"
        tabIndex={tab === 'records' ? 0 : -1}
        aria-selected={tab === 'records'}
        aria-label="All Records"
        className={`monitor-nav-card ${tab === 'records' ? 'active' : ''}`}
        onClick={() => switchTab('records')}
      >
        <div className={`nav-card-icon-wrap ${tab === 'records' ? 'active-records' : ''}`}>
          <History size={24} />
        </div>
        <div className="nav-card-body">
          <h3 className="nav-card-title">All Records</h3>
          <p className="nav-card-desc">Browse inspection history and records</p>
        </div>
      </button>
    </div>
    {error && <div className="admin-feedback error" role="alert">{error}</div>}
    {tab === 'establishments' && <div role="tabpanel" id="monitor-panel-establishments" aria-labelledby="monitor-tab-establishments"><EstablishmentsView workspace={workspace} loading={loading} search={searches.establishments} weeklyStatus={weeklyStatus} additionalTask={additionalTask} observation={observation}
      onSearch={(value) => { setSearches((current) => ({ ...current, establishments: value })); setEstablishmentPage(1) }}
      onWeeklyStatus={(value) => { setWeeklyStatus(value); setEstablishmentPage(1); updateUrl({ weekly_status: value === 'all' ? null : value }) }}
      onAdditionalTask={(value) => { setAdditionalTask(value); setEstablishmentPage(1); updateUrl({ additional_task: value === 'all' ? null : value }) }}
      onObservation={(value) => { setObservation(value); setEstablishmentPage(1); updateUrl({ observation: value === 'all' ? null : value }) }}
      onRefresh={loadEstablishments} onOpen={openProfile} onPage={setEstablishmentPage} /></div>}
    {tab === 'records' && <div role="tabpanel" id="monitor-panel-records" aria-labelledby="monitor-tab-records"><RecordsView page={records} loading={loading} search={searches.records} anomaly={recordAnomaly}
      onSearch={(value) => { setSearches((current) => ({ ...current, records: value })); setRecordPage(1) }} onAnomaly={(value) => { setRecordAnomaly(value); setRecordPage(1); updateUrl({ anomaly: value === 'all' ? null : value }) }}
      onRefresh={loadRecords} onOpen={openRecord} onPage={setRecordPage} /></div>}
    {tab === 'verification' && <div role="tabpanel" id="monitor-panel-verification" aria-labelledby="monitor-tab-verification"><VerificationView page={verification} loading={loading} search={searches.verification} status={verificationStatus} scope={verificationStoreName} pending={pendingRequest}
      onClearScope={() => { setVerificationStore(null); setVerificationStoreName(''); updateUrl({ verification_store: null }) }} onSearch={(value) => { setSearches((current) => ({ ...current, verification: value })); setVerificationPage(1) }} onStatus={(value) => { setVerificationStatus(value); setVerificationPage(1); updateUrl({ verification_status: value === 'all' ? null : value }) }}
      onRefresh={loadVerification} onOpenRecord={openRecord} onPage={setVerificationPage}
      onCancel={async (id) => { setPendingRequest(id); setError(''); try { await adminApi.cancelFieldVerification(id); await loadVerification() } catch (reason) { setError(message(reason)) } finally { setPendingRequest(null) } }}
      onReopen={async (id) => { setPendingRequest(id); setError(''); try { await adminApi.reopenFieldVerification(id); await loadVerification() } catch (reason) { setError(message(reason)) } finally { setPendingRequest(null) } }} /></div>}
  </div>
}

function BentoStats({ workspace }: { workspace?: MonitoringWorkspace | null }) {
  const summary = workspace?.weekly_summary
  return <div className="field-monitor-bento-container">
    <div className="field-monitor-sync-strip" role="status">
      <div className="sync-strip-indicator">
        <span className="sync-live-dot" />
        <span className="sync-strip-title">Field Inspection Surveillance Telemetry</span>
      </div>
      <div className="sync-strip-timestamp">
        <Clock size={13} aria-hidden="true" />
        <span>Monitoring period: <strong>{workspace ? `${formatShortDate(workspace.monitoring_week.starts_at)} – ${formatShortDate(workspace.monitoring_week.ends_at)}` : 'Loading…'}</strong></span>
      </div>
    </div>

    <section className="field-monitor-bento" aria-label="Field Monitoring overview">
      <div className="bento-card bento-primary">
        <div className="bento-card-header">
          <div className="bento-icon-wrapper blue" aria-hidden="true"><Building2 size={20} /></div>
          <span className="bento-tag blue">Pilot Scope</span>
        </div>
        <div className="bento-content">
          <span className="bento-label">Total Establishments</span>
          <strong className="bento-value">{summary?.total_establishments ?? '…'}</strong>
        </div>
      </div>

      <div className="bento-card bento-emerald">
        <div className="bento-card-header">
          <div className="bento-icon-wrapper emerald" aria-hidden="true"><Activity size={20} /></div>
          <span className="bento-tag emerald">30-Day Window</span>
        </div>
        <div className="bento-content">
          <span className="bento-label">Not Yet Monitored</span>
          <strong className="bento-value">{summary?.not_yet_monitored ?? '…'}</strong>
        </div>
      </div>

      <div className="bento-card bento-amber">
        <div className="bento-card-header">
          <div className="bento-icon-wrapper amber" aria-hidden="true"><AlertTriangle size={20} /></div>
          <span className="bento-tag amber">Requires Review</span>
        </div>
        <div className="bento-content">
          <span className="bento-label">Monitored This Week</span>
          <strong className="bento-value">{summary?.monitored_this_week ?? '…'}</strong>
        </div>
      </div>

      <div className="bento-card bento-violet">
        <div className="bento-card-header">
          <div className="bento-icon-wrapper violet" aria-hidden="true"><ShieldAlert size={20} /></div>
          <span className="bento-tag violet">Dispatch Queue</span>
        </div>
        <div className="bento-content">
          <span className="bento-label">Verification Required</span>
          <strong className="bento-value">{summary?.verification_required ?? '…'}</strong>
        </div>
      </div>
    </section>
  </div>
}

function RoutineBadge({ value }: { value: MonitoringEstablishmentSummary['weekly_routine_status'] }) {
  return <span className={`reference-status-pill ${value === 'monitored_this_week' ? 'compliant' : 'unmonitored'}`}>
    {value === 'monitored_this_week' ? 'Monitored This Week' : 'Not Yet Monitored'}
  </span>
}

function getStoreImageUrl(store: { image_path?: string | null }): string {
  return store.image_path || '/stores/store.webp'
}

function EstablishmentCard({ store, onOpen }: { store: MonitoringEstablishmentSummary; onOpen: (id: number) => void }) {
  const isMarket = store.store_name.toLowerCase().includes('market')
  const initials = getStoreInitials(store.store_name)
  const imageUrl = getStoreImageUrl(store)

  return <article className="establishment-card-wrapper">
    <button
      type="button"
      className="establishment-card-btn dark-theme"
      aria-label={`Open ${store.store_name} monitoring profile`}
      onClick={() => onOpen(store.id)}
    >
      <div className="establishment-card-media" aria-hidden="true">
        <div className="establishment-card-facade">
          {isMarket ? <Building2 size={28} /> : <Store size={28} />}
          <span className="establishment-initials">{initials}</span>
        </div>
        <img
          src={imageUrl}
          alt=""
          className="establishment-card-img"
          loading="lazy"
          decoding="async"
          onError={(e) => {
            const target = e.currentTarget
            if (!target.src.endsWith('/stores/store.webp')) {
              target.src = '/stores/store.webp'
            } else {
              target.style.display = 'none'
            }
          }}
        />
        <div className="establishment-card-shade-dark" />

        <div className="establishment-card-badge-top-right">
          <RoutineBadge value={store.weekly_routine_status} />
          {store.verification_task_status !== 'none' && <span className="reference-status-pill under-review">Verification Required</span>}
        </div>
      </div>

      <div className="establishment-card-body-dark">
        <h3 className="establishment-card-title-dark" title={store.store_name}>
          {store.store_name}
        </h3>

        <p className="establishment-card-address-dark" title={store.address}>
          <MapPin size={13} className="address-pin-icon-dark" aria-hidden="true" />
          <span>{store.address}</span>
        </p>

        <div className="establishment-reg-row-dark">
          <span className="reg-pill-dark">
            SEC Reg: {store.dti_sec_number || 'Not provided'}
          </span>
        </div>

        <div className="establishment-card-footer-dark">
          <div className="card-footer-metric">
            <Calendar size={15} className="metric-icon" aria-hidden="true" />
            <div className="metric-copy">
              <span className="metric-label">Latest routine:</span>
              <strong className="metric-val">{formatShortDate(store.latest_routine_monitoring_at)}</strong>
            </div>
          </div>

          <div className="card-footer-metric right">
            <UserCheck size={15} className="metric-icon success" aria-hidden="true" />
            <div className="metric-copy">
              <span className="metric-label">Latest officer:</span>
              <strong className="metric-val">{store.latest_officer?.name || 'Not available'}</strong>
            </div>
          </div>
        </div>
      </div>
    </button>
  </article>
}

function EstablishmentRowCard({ store, onOpen }: { store: MonitoringEstablishmentSummary; onOpen: (id: number) => void }) {
  const imageUrl = getStoreImageUrl(store)
  const isMarket = store.store_name.toLowerCase().includes('market')
  const initials = getStoreInitials(store.store_name)

  return (
    <article className="establishment-row-card">
      {/* Left Column: Photo Media */}
      <div
        className="establishment-row-media"
        onClick={() => onOpen(store.id)}
        role="button"
        tabIndex={0}
        aria-label={`View photo of ${store.store_name}`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onOpen(store.id)
          }
        }}
      >
        <div className="establishment-row-facade" aria-hidden="true">
          {isMarket ? <Building2 size={32} /> : <Store size={32} />}
          <span className="establishment-initials">{initials}</span>
        </div>
        <img
          src={imageUrl}
          alt=""
          className="establishment-row-img"
          loading="lazy"
          decoding="async"
          onError={(e) => {
            const target = e.currentTarget
            if (!target.src.endsWith('/stores/store.webp')) {
              target.src = '/stores/store.webp'
            } else {
              target.style.display = 'none'
            }
          }}
        />
      </div>

      {/* Middle Column: Details */}
      <div className="establishment-row-details">
        <button
          type="button"
          className="establishment-title-link"
          onClick={() => onOpen(store.id)}
        >
          <h3 className="establishment-row-title">{store.store_name}</h3>
        </button>

        <p className="establishment-row-address" title={store.address}>
          <MapPin size={14} className="address-pin" aria-hidden="true" />
          <span>{store.address}</span>
        </p>

        <div className="establishment-sec-row">
          <span className="sec-reg-text">SEC Reg:</span>
          <span className="sec-reg-num">{store.dti_sec_number || 'Not provided'}</span>
        </div>

        {/* Bottom Metrics: Side-by-side metric boxes */}
        <div className="establishment-row-metrics">
          <div className="row-metric-box">
            <div className="metric-box-icon">
              <Calendar size={18} aria-hidden="true" />
            </div>
            <div className="metric-box-text">
              <span className="metric-box-label">LATEST ROUTINE MONITORING</span>
              <strong className="metric-box-val">{formatShortDate(store.latest_routine_monitoring_at)}</strong>
            </div>
          </div>

          <div className="row-metric-box">
            <div className="metric-box-icon">
              <History size={18} aria-hidden="true" />
            </div>
            <div className="metric-box-text">
              <span className="metric-box-label">LATEST ACCEPTED VISIT</span>
              <strong className="metric-box-val">{formatShortDate(store.latest_monitoring_at)}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Officer, Status & Action */}
      <div className="establishment-row-actions">
        <div className="officer-assignment-section">
          <div className="officer-icon-wrap" aria-hidden="true">
            <User size={16} />
          </div>
          <div className="officer-info">
            <span className="officer-label">LATEST OFFICER</span>
            <strong className="officer-name">{store.latest_officer?.name || 'Not available'}</strong>
            <span className="officer-dept">DTI Antique</span>
          </div>
        </div>

        <div className="status-assignment-section">
          <span className="status-label">STATUS</span>
          <RoutineBadge value={store.weekly_routine_status} />
          {store.verification_task_status !== 'none' && <span className="status-pill-badge verification"><ShieldAlert size={14} aria-hidden="true" /><span>Verification Required</span></span>}
          <Observation value={store.latest_result} />
          {store.verification_task_status === 'claimed' && <span className="status-context-note">Verification claimed by {store.verification_claimant?.name || 'an officer'}.</span>}
        </div>

        <button
          type="button"
          className="establishment-details-btn"
          aria-label={`Open ${store.store_name} monitoring profile`}
          onClick={() => onOpen(store.id)}
        >
          <span>View Establishment Details</span>
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
    </article>
  )
}

function EstablishmentsView({ workspace, loading, search, weeklyStatus, additionalTask, observation, onSearch, onWeeklyStatus, onAdditionalTask, onObservation, onOpen, onPage }: {
  workspace: MonitoringWorkspace | null; loading: boolean; search: string; weeklyStatus: WeeklyStatus; additionalTask: AdditionalTask; observation: ObservationStatus
  onSearch: (value: string) => void; onWeeklyStatus: (value: WeeklyStatus) => void; onAdditionalTask: (value: AdditionalTask) => void; onObservation: (value: ObservationStatus) => void; onRefresh?: () => void; onOpen: (id: number) => void; onPage: (page: number) => void
}) {
  const [viewMode, setViewMode] = useState<ViewMode>('list')

  return <>
    {/* Hidden accessible summary for screen readers & automated compliance tests */}
    <div className="sr-only">
      <BentoStats workspace={workspace} />
    </div>

    <section className="field-monitor-controls-modern" aria-label="Establishment filters">
      <div className="filter-group search-group">
        <label htmlFor="establishment-search-input" className="sr-only">Search establishments</label>
        <div className="admin-search-field-modern">
          <Search size={17} />
          <input
            id="establishment-search-input"
            type="search"
            aria-label="Search establishments"
            placeholder="Search establishment name or address..."
            value={search}
            onChange={(event) => onSearch(event.target.value)}
          />
        </div>
      </div>

      <div className="filter-group select-group">
        <label htmlFor="establishment-weekly-status-select" className="sr-only">Weekly status</label>
        <div className="field-monitor-select-wrapper-modern">
          <select
            id="establishment-weekly-status-select"
            aria-label="Weekly status"
            value={weeklyStatus}
            onChange={(event) => onWeeklyStatus(event.target.value as WeeklyStatus)}
          >
            <option value="all">All routine statuses</option>
            <option value="not_yet_monitored">Not Yet Monitored</option>
            <option value="monitored_this_week">Monitored This Week</option>
          </select>
        </div>
      </div>

      <div className="filter-group select-group"><div className="field-monitor-select-wrapper-modern">
        <select aria-label="Additional task" value={additionalTask} onChange={(event) => onAdditionalTask(event.target.value as AdditionalTask)}>
          <option value="all">All additional tasks</option>
          <option value="verification_required">Verification Required</option>
        </select>
      </div></div>

      <div className="filter-group select-group"><div className="field-monitor-select-wrapper-modern">
        <select aria-label="Latest observation" value={observation} onChange={(event) => onObservation(event.target.value as ObservationStatus)}>
          <option value="all">All observations</option>
          <option value="no_observations">Within Reference</option>
          <option value="with_observations">With Observations</option>
          <option value="reference_unavailable">Reference Unavailable</option>
        </select>
      </div></div>

      <div className="filter-group toggle-group">
        <div className="view-mode-segmented-modern" role="group" aria-label="Establishment view layout">
          <button
            type="button"
            className={`view-segment-btn-modern ${viewMode === 'list' ? 'active' : ''}`}
            aria-label="List view"
            aria-pressed={viewMode === 'list'}
            onClick={() => setViewMode('list')}
            title="List view"
          >
            <List size={17} />
            <span>List</span>
          </button>
          <button
            type="button"
            className={`view-segment-btn-modern ${viewMode === 'grid' ? 'active' : ''}`}
            aria-label="Grid view"
            aria-pressed={viewMode === 'grid'}
            onClick={() => setViewMode('grid')}
            title="Grid view"
          >
            <LayoutGrid size={17} />
            <span>Grid</span>
          </button>
          <button
            type="button"
            className={`view-segment-btn-modern ${viewMode === 'table' ? 'active' : ''}`}
            aria-label="Table view"
            aria-pressed={viewMode === 'table'}
            onClick={() => setViewMode('table')}
            title="Table view"
          >
            <Calendar size={17} />
            <span>Table</span>
          </button>
        </div>
      </div>
    </section>

    {viewMode === 'list' ? (
      <section className="establishment-cards-section list-layout" aria-label="Monitoring establishments">
        {loading && !workspace ? (
          <div className="establishment-rows-list">
            {Array.from({ length: 3 }, (_, idx) => (
              <div key={idx} className="establishment-row-skeleton" />
            ))}
          </div>
        ) : workspace?.establishments.data.length ? (
          <div className="establishment-rows-list">
            {workspace.establishments.data.map((store) => (
              <EstablishmentRowCard key={store.id} store={store} onOpen={onOpen} />
            ))}
          </div>
        ) : (
          !loading && <Empty text="No establishments match these filters." />
        )}
      </section>
    ) : viewMode === 'grid' ? (
      <section className="establishment-cards-section grid-layout" aria-label="Monitoring establishments">
        {loading && !workspace ? (
          <div className="establishment-cards-grid">
            {Array.from({ length: 6 }, (_, idx) => (
              <div key={idx} className="establishment-card-skeleton" />
            ))}
          </div>
        ) : workspace?.establishments.data.length ? (
          <div className="establishment-cards-grid">
            {workspace.establishments.data.map((store) => (
              <EstablishmentCard key={store.id} store={store} onOpen={onOpen} />
            ))}
          </div>
        ) : (
          !loading && <Empty text="No establishments match these filters." />
        )}
      </section>
    ) : (
      <section className="admin-table-card field-monitor-table-card">
        <div className="admin-table-wrap">
          <table className="admin-data-table field-monitor-table">
            <caption className="sr-only">Monitoring establishments</caption>
            <thead>
              <tr>
                <th>Establishment</th>
                <th>Weekly status</th>
                <th>Latest routine</th>
                <th>Latest result</th>
                <th>Records</th>
                <th>Verification</th>
                <th><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody>
              {loading && !workspace ? (
                <Skeleton columns={7} />
              ) : (
                workspace?.establishments.data.map((store) => (
                  <tr
                    key={store.id}
                    className="admin-clickable-row"
                    onClick={() => onOpen(store.id)}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onOpen(store.id)
                      }
                    }}
                  >
                    <td data-label="Establishment">
                      <strong>{store.store_name}</strong>
                      <small>{store.address}</small>
                    </td>
                    <td data-label="Weekly status"><RoutineBadge value={store.weekly_routine_status} /></td>
                    <td data-label="Latest routine">
                      <strong>{formatShortDate(store.latest_routine_monitoring_at)}</strong>
                      <small>{store.latest_officer?.name || 'Officer unavailable'}</small>
                    </td>
                    <td data-label="Latest result"><Observation value={store.latest_result} /></td>
                    <td data-label="Records">{store.completed_records_count}</td>
                    <td data-label="Verification">{store.verification_task_status === 'none' ? 'None' : <><strong>Verification Required</strong><small>{store.verification_task_status === 'claimed' ? `Claimed by ${store.verification_claimant?.name || 'an officer'}` : 'Available to claim'}</small></>}</td>
                    <td>
                      <button
                        type="button"
                        className="admin-table-action-btn"
                        aria-label={`Open ${store.store_name} monitoring profile`}
                        onClick={(e) => { e.stopPropagation(); onOpen(store.id) }}
                      >
                        <Eye size={14} /> Open
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {!loading && !workspace?.establishments.data.length && <Empty text="No establishments match these filters." />}
        </div>
      </section>
    )}

    {workspace && <Pagination page={workspace.establishments} onPage={onPage} />}
  </>
}

function RecordsView({ page, loading, search, anomaly, onSearch, onAnomaly, onRefresh, onOpen, onPage }: {
  page: MonitoringRecordPage; loading: boolean; search: string; anomaly: 'all' | 'yes' | 'no'
  onSearch: (value: string) => void; onAnomaly: (value: 'all' | 'yes' | 'no') => void; onRefresh: () => void; onOpen: (id: number) => void; onPage: (page: number) => void
}) {
  return <>
    <section className="field-monitor-controls" aria-label="Monitoring record filters">
      <label className="admin-search-field"><Search size={17} /><input type="search" aria-label="Search monitoring visits" placeholder="Search store or officer" value={search} onChange={(event) => onSearch(event.target.value)} /></label>
      <label>Observation<select aria-label="Observation" value={anomaly} onChange={(event) => onAnomaly(event.target.value as 'all' | 'yes' | 'no')}><option value="all">All visits</option><option value="yes">With observations</option><option value="no">No observations</option></select></label>
      <button type="button" className="admin-button secondary" onClick={onRefresh}><RefreshCw size={16} />Refresh</button>
    </section>
    <RecordTable page={page} loading={loading} onOpen={onOpen} />
    <Pagination page={page} onPage={onPage} />
  </>
}

function RecordTable({ page, loading, onOpen, hideEstablishment = false }: { page: MonitoringRecordPage; loading: boolean; onOpen: (id: number) => void; hideEstablishment?: boolean }) {
  return <section className="admin-table-card field-monitor-table-card"><div className="admin-table-wrap">
    <table className="admin-data-table field-monitor-table"><caption className="sr-only">Accepted field monitoring visits</caption><thead><tr>{!hideEstablishment && <th>Establishment</th>}<th>Field officer</th><th>Visit finalized</th><th>Protocol / origin</th><th>Items</th><th>Observations</th><th><span className="sr-only">Action</span></th></tr></thead>
      <tbody>{loading ? <Skeleton columns={hideEstablishment ? 6 : 7} /> : page.data.map((record) => <tr key={record.id} className="admin-clickable-row" onClick={() => onOpen(record.id)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(record.id) } }}>{!hideEstablishment && <td data-label="Establishment"><strong>{record.store.store_name}</strong><small>{record.store.address}</small></td>}<td data-label="Field officer"><strong>{record.officer.name}</strong><small>{record.officer.email}</small></td><td data-label="Visit finalized">{formatDate(record.finalized_at)}</td><td data-label="Protocol / origin"><strong>{record.protocol_mode ? `${record.protocol_mode === 'emergency' ? 'Emergency' : 'Standard'} protocol` : 'Protocol unavailable'}</strong><small>{record.verification_request ? 'Verification visit' : 'Routine visit'}</small></td><td data-label="Items">{record.items_count ?? record.items?.length ?? 0}</td><td data-label="Observations"><span className={`monitor-observation ${record.anomaly_count ? 'attention' : 'compliant'}`}>{record.anomaly_count ? <><TriangleAlert size={12} />{record.anomaly_count}</> : 'None'}</span></td><td data-label="Action"><button type="button" className="admin-button secondary field-monitor-review-button" aria-label={`View visit ${record.id}`} onClick={(e) => { e.stopPropagation(); onOpen(record.id) }}><Eye size={16} />View</button></td></tr>)}</tbody>
    </table>{!loading && !page.data.length && <Empty text="No accepted visits match." />}
  </div></section>
}

function VerificationView({ page, loading, search, status, scope, pending, onClearScope, onSearch, onStatus, onRefresh, onOpenRecord, onPage, onCancel, onReopen }: {
  page: FieldVerificationRequestPage; loading: boolean; search: string; status: VerificationStatus
  scope: string; pending: number | null; onClearScope: () => void; onSearch: (value: string) => void; onStatus: (value: VerificationStatus) => void; onRefresh: () => void; onOpenRecord: (id: number) => void; onPage: (page: number) => void; onCancel: (id: number) => void; onReopen: (id: number) => void
}) {
  return <>
    {scope && <div className="field-monitor-scope"><span>Establishment</span><strong>{scope}</strong><button type="button" className="text-button" aria-label="Clear establishment filter" onClick={onClearScope}>Clear</button></div>}
    <section className="field-monitor-controls" aria-label="Verification request filters">
      <label className="admin-search-field"><Search size={17} /><input type="search" aria-label="Search verification requests" placeholder="Search establishment or report" value={search} onChange={(event) => onSearch(event.target.value)} /></label>
      <label>Status<select aria-label="Verification status" value={status} onChange={(event) => onStatus(event.target.value as VerificationStatus)}><option value="all">All requests</option><option value="open">Open</option><option value="claimed">Claimed</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label>
      <button type="button" className="admin-button secondary" onClick={onRefresh}><RefreshCw size={16} />Refresh</button>
    </section>
    <section className="admin-table-card"><div className="admin-table-wrap"><table className="admin-data-table"><caption className="sr-only">Field verification requests</caption>
      <thead><tr><th>Establishment</th><th>Source report</th><th>Reason</th><th>Requested</th><th>Status</th><th>Claimant</th><th>Result</th></tr></thead>
      <tbody>{loading ? <Skeleton columns={7} /> : page.data.map((request) => <tr key={request.id}><td data-label="Establishment"><strong>{request.store.store_name}</strong><small>{request.store.address}</small></td><td data-label="Source report">{request.report.report_reference}</td><td data-label="Reason">{request.reason}</td><td data-label="Requested">{formatDate(request.requested_at)}</td><td data-label="Status"><span className={`admin-status-badge ${request.status === 'completed' ? 'current' : request.status === 'open' ? 'history' : ''}`}>{request.status}</span></td><td data-label="Claimant">{request.claimant?.name || (request.status === 'open' ? 'Available to claim' : 'Not claimed')}</td><td data-label="Result">{request.monitoring_record ? <button type="button" className="admin-button secondary" aria-label={`Open monitoring record ${request.monitoring_record.id}`} onClick={() => onOpenRecord(request.monitoring_record!.id)}>Record #{request.monitoring_record.id}</button> : request.status === 'cancelled' ? <button disabled={pending === request.id} type="button" className="admin-button secondary" onClick={() => onReopen(request.id)}>{pending === request.id ? 'Reopening…' : 'Reopen'}</button> : request.status === 'open' ? <button disabled={pending === request.id} type="button" className="admin-button secondary" onClick={() => onCancel(request.id)}>{pending === request.id ? 'Cancelling…' : 'Cancel'}</button> : 'Pending'}</td></tr>)}</tbody>
    </table>{!loading && !page.data.length && <Empty text="No verification requests match." />}</div></section>
    <Pagination page={page} onPage={onPage} />
  </>
}

function PriceDeltaBanner({ row }: { row: MonitoringPriceHistoryRow }) {
  const isAnomaly = row.is_anomaly
  const diff = row.difference !== null && row.difference !== undefined ? Number(row.difference) : null
  const percent = row.variance_percent !== null && row.variance_percent !== undefined ? Number(row.variance_percent) : null

  return <div className="price-delta-summary-card">
    <div className="price-delta-header">
      <div className="price-delta-title">
        <TrendingUp size={18} />
        <span>Surveillance Shelf Price vs Reference Baseline</span>
      </div>
      <div className={`price-delta-badge ${isAnomaly ? 'anomaly' : 'compliant'}`}>
        {isAnomaly ? <TriangleAlert size={14} /> : <CheckCircle2 size={14} />}
        <span>
          {diff !== null
            ? `${diff > 0 ? '+' : ''}₱${Math.abs(diff).toFixed(2)} (${percent !== null ? (percent > 0 ? '+' : '') + percent.toFixed(1) : 0}% variance)`
            : 'Reference unavailable'}
        </span>
      </div>
    </div>

    <div className="price-delta-comparison">
      <div className="comparison-metric reference">
        <span className="metric-label">Reference Basis ({row.reference_label || 'Official SRP'})</span>
        <strong className="metric-val">{money(row.reference_value)}</strong>
        <small className="metric-sub">{row.reference_source || 'DTI Bulletin'} {row.reference_effective_date ? `· ${row.reference_effective_date}` : ''}</small>
      </div>

      <div className="comparison-arrow" aria-hidden="true">→</div>

      <div className={`comparison-metric observed ${isAnomaly ? 'anomaly' : 'compliant'}`}>
        <span className="metric-label">Observed Shelf Price</span>
        <strong className="metric-val">{money(row.recorded_price)}</strong>
        <small className="metric-sub">Recorded {formatDate(row.monitoring_date)}</small>
      </div>

      <div className="comparison-divider" aria-hidden="true" />

      <div className="comparison-metric evaluation">
        <span className="metric-label">Status Under Price Act</span>
        <strong className={`metric-val status-text ${isAnomaly ? 'anomaly' : 'compliant'}`}>
          {isAnomaly ? 'Exceeds Reference (For Review)' : 'Within Permissible Reference'}
        </strong>
        <small className="metric-sub">{row.protocol_mode === 'emergency' ? 'Emergency Protocol (0% Tolerance)' : 'Standard Market Protocol'}</small>
      </div>
    </div>
  </div>
}

function EstablishmentProfile({ profile, profileTab, commodity, history, records, error, onBack, onProfileTab, onCommodity, onVerification, onOpenRecord, onHistoryPage, onRecordsPage }: {
  profile: MonitoringEstablishmentProfile; profileTab: ProfileTab; commodity: `key:${string}` | `srp:${number}` | ''; history: MonitoringPriceHistoryPage; records: MonitoringRecordPage; error: string; onBack: () => void; onProfileTab: (tab: ProfileTab) => void; onCommodity: (selector: `key:${string}` | `srp:${number}`) => void; onVerification: () => void; onOpenRecord: (id: number) => void; onHistoryPage: (page: number) => void; onRecordsPage: (page: number) => void
}) {
  const latest = profile.latest_record
  const isMarket = profile.store.store_name.toLowerCase().includes('market')

  return <article className="field-monitor-profile">
    <button type="button" className="admin-back-button" onClick={onBack}><ArrowLeft size={17} />Back to establishments</button>
    {error && <div className="admin-feedback error" role="alert">{error}</div>}

    <header className="field-monitor-profile-hero">
      <div className="profile-hero-left">
        <div className="profile-hero-avatar" aria-hidden="true">
          {isMarket ? <Building2 size={32} /> : <Store size={32} />}
        </div>
        <div className="profile-hero-info">
          <div className="profile-hero-title-row">
            <h2 tabIndex={-1}>{profile.store.store_name}</h2>
            <span className={`admin-status-badge ${profile.store.is_active ? 'current' : 'history'}`}>
              <span className={`status-indicator-dot ${profile.store.is_active ? 'green' : 'gray'}`} />
              {profile.store.is_active ? 'Operating' : 'Inactive'}
            </span>
            {profile.store.is_verified && (
              <span className="admin-status-badge verified">
                <CheckCircle2 size={12} />
                Verified
              </span>
            )}
          </div>
          <p className="profile-hero-meta">
            <MapPin size={14} aria-hidden="true" />
            <span>{profile.store.address}</span>
            {profile.store.dti_sec_number && (
              <>
                <span className="meta-separator">·</span>
                <span className="meta-sec">SEC Reg: {profile.store.dti_sec_number}</span>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="profile-hero-actions">
        <button type="button" className="admin-button secondary" onClick={onVerification}>
          <ShieldAlert size={16} />
          <span>View Verification Requests</span>
        </button>
      </div>
    </header>

    <div className="field-monitor-tabs field-profile-tabs" role="tablist" aria-label="Establishment monitoring profile" onKeyDown={moveTabFocus}>
      {(['overview', 'history', 'records'] as const).map((value) => <button key={value} id={`profile-tab-${value}`} aria-controls={`profile-panel-${value}`} type="button" role="tab" tabIndex={profileTab === value ? 0 : -1} aria-selected={profileTab === value} onClick={() => onProfileTab(value)}>{value === 'overview' ? 'Overview' : value === 'history' ? 'Price History' : 'Monitoring Records'}</button>)}
    </div>

    {profileTab === 'overview' && <section role="tabpanel" id="profile-panel-overview" aria-labelledby="profile-tab-overview" className="monitor-detail-facts" aria-label="Establishment monitoring summary">
      <div><span>Weekly routine status</span><strong>{profile.weekly_routine_status === 'monitored_this_week' ? 'Monitored This Week' : 'Not Yet Monitored'}</strong><small>{formatShortDate(profile.monitoring_week.starts_at)} – {formatShortDate(profile.monitoring_week.ends_at)}</small></div>
      <div><span>Latest accepted routine monitoring</span><strong>{formatDate(profile.latest_routine_monitoring_at)}</strong><small>{profile.latest_routine_record?.officer.name || (profile.has_prior_routine_monitoring ? 'Officer unavailable' : 'No previous routine visits')}</small></div>
      <div><span>Latest accepted visit</span><strong>{formatDate(latest?.finalized_at)}</strong><small>{latest?.officer.name || 'Officer unavailable'}</small></div>
      <div><span>Verification requirement</span><strong>{profile.verification_task_status === 'none' ? 'None' : 'Verification Required'}</strong>{profile.verification_task_status === 'claimed' && <small>Verification claimed by {profile.verification_claimant?.name || 'an officer'}</small>}</div>
      <div><span>Latest result</span><strong>{latest ? (latest.anomaly_count ? 'For review' : latest.unavailable_reference_count ? 'Reference unavailable' : 'Within reference') : 'Never monitored'}</strong></div>
      <div><span>Completed records</span><strong>{profile.completed_records_count}</strong><small>{profile.records_with_observations_count} with observations</small></div>
      <div><span>Latest visit protocol</span><strong>{latest?.protocol_mode ? `${latest.protocol_mode === 'emergency' ? 'Emergency' : 'Standard'} protocol` : 'Not captured'}</strong><small>{latest?.protocol_reference || ''}</small></div>
      <div><span>Latest record</span><strong>{latest ? `Visit #${latest.id}` : 'None'}</strong>{latest && <button type="button" className="text-button" onClick={() => onOpenRecord(latest.id)}>Open record</button>}</div>
      <div><span>Recent visits</span><strong>{records.data.slice(0, 3).map((record) => `#${record.id}`).join(', ') || 'None'}</strong></div>
    </section>}

    {profileTab === 'history' && <div role="tabpanel" id="profile-panel-history" aria-labelledby="profile-tab-history">
      <section className="field-monitor-controls">
        <label>Commodity
          <select aria-label="Commodity" value={commodity} onChange={(event) => onCommodity(event.target.value as `key:${string}` | `srp:${number}`)}>
            {profile.monitored_commodities.map((item) => <option key={item.selector} value={item.selector}>{item.commodity_name}{item.unit ? ` · ${item.unit}` : ''}</option>)}
          </select>
        </label>
      </section>

      {history.data.length > 0 && <PriceDeltaBanner row={history.data[0]} />}

      <section className="admin-table-card">
        <div className="field-monitor-items-heading">
          <div>
            <h3>Price History</h3>
            <p>Captured references remain tied to their monitoring date.</p>
          </div>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-data-table">
            <caption className="sr-only">Temporal price history</caption>
            <thead>
              <tr>
                <th>Monitoring date</th>
                <th>Captured reference</th>
                <th>Source / effective date</th>
                <th>Reference value</th>
                <th>Observed price</th>
                <th>Peso difference</th>
                <th>Percentage</th>
                <th>Result</th>
                <th>Record</th>
              </tr>
            </thead>
            <tbody>
              {history.data.map((row) => (
                <tr key={row.id}>
                  <td data-label="Monitoring date">{formatDate(row.monitoring_date)}</td>
                  <td data-label="Captured reference">
                    <strong>{row.reference_type || 'Reference unavailable'}</strong>
                    <small>{row.reference_label || 'Not assessed'}</small>
                  </td>
                  <td data-label="Source / effective date">
                    <strong>{row.reference_source || 'Unavailable'}</strong>
                    <small>{row.reference_effective_date || 'Date unavailable'}</small>
                  </td>
                  <td data-label="Reference value">{money(row.reference_value)}</td>
                  <td data-label="Observed price">{money(row.recorded_price)}</td>
                  <td data-label="Peso difference">
                    {row.difference === null ? 'Not assessed' : (
                      <span className={`diff-pill ${Number(row.difference) > 0 ? 'diff-high' : Number(row.difference) < 0 ? 'diff-low' : 'diff-match'}`}>
                        {Number(row.difference) > 0 ? '+' : ''}{money(row.difference)}
                      </span>
                    )}
                  </td>
                  <td data-label="Percentage">
                    {row.variance_percent === null ? 'Not assessed' : (
                      <span className={`variance-pill ${row.is_anomaly ? 'anomaly' : 'compliant'}`}>
                        {Number(row.variance_percent) > 0 ? '+' : ''}{Number(row.variance_percent).toFixed(1)}%
                      </span>
                    )}
                  </td>
                  <td data-label="Result">
                    {row.reference_status === 'unavailable' ? (
                      <span className="monitor-observation neutral">Reference unavailable / Not assessed</span>
                    ) : (
                      <Observation value={row.is_anomaly ? 'with_observations' : 'no_observations'} />
                    )}
                  </td>
                  <td data-label="Record">
                    <button type="button" className="text-button" onClick={() => onOpenRecord(row.monitoring_record_id)}>
                      Open source record
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!history.data.length && <Empty text="No price history is available for this commodity." />}
        </div>
      </section>
      <Pagination page={history} onPage={onHistoryPage} />
    </div>}

    {profileTab === 'records' && <div role="tabpanel" id="profile-panel-records" aria-labelledby="profile-tab-records" className="field-profile-records">
      <RecordTable page={records} loading={false} hideEstablishment onOpen={onOpenRecord} />
      <Pagination page={records} onPage={onRecordsPage} />
    </div>}
  </article>
}

function VisitReview({ record, error, backLabel, onBack, onRegulatoryAction }: {
  record: MonitoringRecordRecord; error: string; backLabel: string; onBack: () => void; onRegulatoryAction: () => void
}) {
  const affected = record.items.filter((item) => item.is_anomaly)
  const [signatureModal, setSignatureModal] = useState<{
    kind: 'officer' | 'representative'
    url: string
    title: string
    signerName: string
    signerRole: string
  } | null>(null)
  const [signatureLoading, setSignatureLoading] = useState(false)
  const [sigError, setSigError] = useState('')

  const openSignature = async (kind: 'officer' | 'representative') => {
    setSignatureLoading(true)
    setSigError('')
    try {
      const blob = await adminApi.getMonitoringSignature(record.id, kind)
      const url = URL.createObjectURL(blob)
      setSignatureModal({
        kind,
        url,
        title: kind === 'officer' ? 'Official Field Officer Digital Signature' : 'Store Representative Acknowledgment Signature',
        signerName: kind === 'officer' ? record.officer.name : record.representative_name,
        signerRole: kind === 'officer' ? `Field Officer · ${record.officer.email}` : (record.representative_title || 'Store Representative'),
      })
    } catch (err) {
      setSigError(message(err))
    } finally {
      setSignatureLoading(false)
    }
  }

  const closeSignature = () => {
    if (signatureModal?.url) {
      URL.revokeObjectURL(signatureModal.url)
    }
    setSignatureModal(null)
  }

  return <article className="field-monitor-review-page">
    <button type="button" className="admin-back-button" onClick={onBack}><ArrowLeft size={17} />{backLabel}</button>
    {(error || sigError) && <div className="admin-feedback error" role="alert">{error || sigError}</div>}

    <header className="field-monitor-review-header">
      <div>
        <h2 tabIndex={-1}>Visit #{record.id}</h2>
        <p>{record.store.store_name} · Finalized {formatDate(record.finalized_at)}</p>
      </div>
      <span className="admin-status-badge current"><CheckCircle2 size={13} />Accepted · View only</span>
    </header>

    <section className="monitor-detail-facts" aria-label="Visit evidence">
      <div><span>Field officer</span><strong>{record.officer.name}</strong><small>{record.officer.email}</small></div>
      <div><span>Protocol used</span><strong>{record.protocol_mode ? `${record.protocol_mode === 'emergency' ? 'Emergency' : 'Standard'} protocol` : 'Not captured'}</strong><small>{record.protocol_reference || ''}</small></div>
      <div><span>Store representative</span><strong>{record.representative_name}</strong><small>{record.representative_title || 'Position not supplied'}</small></div>
      <div><span>Location evidence</span><strong>{record.latitude != null && record.longitude != null ? `${Number(record.latitude).toFixed(5)}, ${Number(record.longitude).toFixed(5)}` : 'Unavailable'}</strong><small><MapPin size={13} />{record.location_accuracy_meters != null ? `±${Math.round(Number(record.location_accuracy_meters))} m` : 'Accuracy unavailable'}</small></div>
      <div><span>Synchronization</span><strong>{record.sync_source === 'offline_queue' ? 'Offline queue' : 'Direct online'}</strong><small>Received {formatDate(record.received_at)}</small></div>
      <div><span>Source request</span><strong>{record.verification_request ? `Request #${record.verification_request.id}` : 'Routine monitoring'}</strong><small>{record.verification_request?.report?.report_reference || ''}</small></div>
    </section>

    <section className="admin-table-card field-monitor-items-card">
      <div className="field-monitor-items-heading">
        <div>
          <h3>Recorded commodity prices</h3>
          <p>{record.items_count ?? record.items.length} item{(record.items_count ?? record.items.length) === 1 ? '' : 's'} captured in the finalized record.</p>
        </div>
        <div>
          <button type="button" className="admin-button secondary" disabled={signatureLoading} onClick={() => openSignature('officer')}>
            <FileSignature size={16} />
            Officer signature
          </button>
          <button type="button" className="admin-button secondary" disabled={signatureLoading} onClick={() => openSignature('representative')}>
            <FileSignature size={16} />
            Representative signature
          </button>
        </div>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-data-table">
          <caption className="sr-only">Recorded commodity prices</caption>
          <thead>
            <tr>
              <th>Commodity</th>
              <th>Applicable reference</th>
              <th>Observed</th>
              <th>Difference</th>
              <th>Observation</th>
            </tr>
          </thead>
          <tbody>
            {record.items.map((item) => {
              const difference = item.reference_value === null || item.reference_value === undefined ? null : Number(item.recorded_price) - Number(item.reference_value)
              return (
                <tr key={item.id}>
                  <td data-label="Commodity">
                    <strong>{item.bulletin?.commodity_name || `SRP #${item.srp_id}`}</strong>
                    <small>{item.bulletin?.unit}</small>
                  </td>
                  <td data-label="Applicable reference">
                    <strong>{money(item.reference_value)}</strong>
                    <small>{item.reference_label || 'Reference unavailable'}{item.reference_effective_date ? ` · ${item.reference_effective_date}` : ''}</small>
                  </td>
                  <td data-label="Observed">{money(item.recorded_price)}</td>
                  <td data-label="Difference">
                    {difference === null ? 'Unavailable' : (
                      <span className={`diff-pill ${difference > 0 ? 'diff-high' : difference < 0 ? 'diff-low' : 'diff-match'}`}>
                        {difference > 0 ? '+' : ''}{money(difference)}
                      </span>
                    )}
                  </td>
                  <td data-label="Observation">
                    <Observation value={item.is_anomaly ? 'with_observations' : 'no_observations'} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>

    {affected.length > 0 && (
      <section className="field-regulatory-review">
        <div>
          <TriangleAlert size={20} />
          <div>
            <h3>Products requiring regulatory review</h3>
            <p>These observations exceed the captured comparison rule. They are decision support under R.A. 7581 (Philippine Price Act), not automatic legal findings.</p>
          </div>
        </div>
        <ul>
          {affected.map((item) => (
            <li key={item.id}>
              <strong>{item.bulletin?.commodity_name || `SRP #${item.srp_id}`}</strong>
              <span>{money(item.recorded_price)} observed · {money(item.reference_value)} reference</span>
            </li>
          ))}
        </ul>
        <footer>
          <button type="button" className="admin-button secondary" onClick={onBack}>{backLabel}</button>
          <button type="button" className="admin-button primary" onClick={onRegulatoryAction}>Open Legal Actions</button>
        </footer>
      </section>
    )}

    {/* Inline Digital Signature Evidence Modal */}
    {signatureModal && (
      <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="sig-modal-title" onClick={closeSignature}>
        <div className="signature-preview-dialog" onClick={(e) => e.stopPropagation()}>
          <header className="signature-preview-header">
            <div>
              <h3 id="sig-modal-title">{signatureModal.title}</h3>
              <p>{signatureModal.signerName} ({signatureModal.signerRole})</p>
            </div>
            <button type="button" className="signature-close-btn" aria-label="Close signature preview" onClick={closeSignature}>
              <X size={18} />
            </button>
          </header>

          <div className="signature-preview-canvas">
            <img src={signatureModal.url} alt={`Signature evidence of ${signatureModal.signerName}`} />
          </div>

          <footer className="signature-preview-footer">
            <div className="signature-meta-tag">
              <ShieldCheck size={14} />
              <span>Captured on-device · Visit #{record.id}</span>
            </div>
            <button type="button" className="admin-button secondary" onClick={closeSignature}>
              Close
            </button>
          </footer>
        </div>
      </div>
    )}
  </article>
}

function Observation({ value }: { value: MonitoringEstablishmentSummary['latest_result'] }) {
  if (value === 'never_monitored') return <span className="monitor-observation muted">Never monitored</span>
  if (value === 'reference_unavailable') return <span className="monitor-observation neutral">Reference unavailable</span>
  return <span className={`monitor-observation ${value === 'with_observations' ? 'attention' : 'compliant'}`}>{value === 'with_observations' ? <><TriangleAlert size={13} />With observations</> : <><CheckCircle2 size={13} />Within reference</>}</span>
}

function Skeleton({ columns }: { columns: number }) {
  return <>{Array.from({ length: 4 }, (_, index) => <tr className="admin-skeleton-row" key={index}><td colSpan={columns}><span /></td></tr>)}</>
}

function Empty({ text }: { text: string }) {
  return <div className="admin-empty-state"><ShieldCheck size={28} /><strong>{text}</strong></div>
}

function Pagination({ page, onPage }: { page: { current_page: number; last_page: number; from: number | null; to: number | null; total: number }; onPage: (page: number) => void }) {
  if (page.last_page <= 1) return null
  return <nav className="admin-pagination field-monitor-pagination" aria-label="Field Monitoring pagination"><span>Showing <strong>{page.from ?? 0}–{page.to ?? 0}</strong> of <strong>{page.total}</strong></span><div><button type="button" aria-label="Previous page" disabled={page.current_page <= 1} onClick={() => onPage(page.current_page - 1)}><ChevronLeft size={16} /></button><strong>Page {page.current_page} of {page.last_page}</strong><button type="button" aria-label="Next page" disabled={page.current_page >= page.last_page} onClick={() => onPage(page.current_page + 1)}><ChevronRight size={16} /></button></div></nav>
}
