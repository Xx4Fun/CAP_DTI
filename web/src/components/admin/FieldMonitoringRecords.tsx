import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import {
  Activity, AlertTriangle, ArrowLeft, ArrowRight, Boxes, Building2, Calendar, ChartColumn, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleAlert,
  ClipboardCheck, ClipboardList, Eye, FileSignature, FileSpreadsheet, FileText, History, LayoutGrid, List, MapPin, RefreshCw, Search, ShieldAlert,
  ShieldCheck, Store, Table, TrendingUp, TriangleAlert, User, UserCheck, X,
} from 'lucide-react'
import { adminApi } from '../../services/adminApi'
import type {
  FieldVerificationRequestPage, MonitoringEstablishmentProfile, MonitoringEstablishmentSummary,
  ManagedUserRecord, MonitoringFindingItem, MonitoringFindingsPage, MonitoringPeriodPreset,
  MonitoringPriceHistoryPage, MonitoringPriceHistoryRow, MonitoringRecordItem, MonitoringRecordPage, MonitoringRecordRecord, MonitoringWorkspace,
} from '../../types/admin'

type Tab = 'establishments' | 'records' | 'verification'
type ProfileTab = 'overview' | 'findings' | 'history' | 'records'
type RoutineStatus = 'all' | 'due' | 'completed'
type AdditionalTask = 'all' | 'verification_required'
type ObservationStatus = 'all' | 'with_observations' | 'reference_unavailable' | 'no_observations'
type VerificationStatus = 'all' | 'open' | 'claimed' | 'completed' | 'cancelled'
type ViewMode = 'list' | 'grid' | 'table'
type ListFilter = 'all' | 'due' | 'completed' | 'verification' | 'observations'
type ListFilterState = { routineStatus: RoutineStatus; additionalTask: AdditionalTask; observation: ObservationStatus }

const emptyRecords: MonitoringRecordPage = { data: [], current_page: 1, last_page: 1, per_page: 10, total: 0, from: null, to: null }
const emptyHistory: MonitoringPriceHistoryPage = { ...emptyRecords, data: [] }
const emptyVerification: FieldVerificationRequestPage = { ...emptyRecords, data: [] }
const emptyFindings: MonitoringFindingsPage = { data: [], current_page: 1, last_page: 1, per_page: 10, total: 0, from: null, to: null }
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

export function FieldMonitoringRecords({ onNavigate }: { onNavigate?: (module: 'legal_actions', params?: Record<string, number>) => void }) {
  const params = new URLSearchParams(window.location.search)
  const [tab, setTab] = useState<Tab>(initialTab)
  const [searches, setSearches] = useState({
    establishments: params.get('establishment_search') || '',
    records: params.get('record_search') || '',
    verification: params.get('verification_search') || '',
  })
  const [queries, setQueries] = useState(searches)
  const [routineStatus, setRoutineStatus] = useState<RoutineStatus>((params.get('routine_status') as RoutineStatus) || 'all')
  const [additionalTask, setAdditionalTask] = useState<AdditionalTask>((params.get('additional_task') as AdditionalTask) || 'all')
  const [observation, setObservation] = useState<ObservationStatus>((params.get('observation') as ObservationStatus) || 'all')
  const [recordPeriod, setRecordPeriod] = useState<MonitoringPeriodPreset>((params.get('record_period') as MonitoringPeriodPreset) || 'all_time')
  const [exportingMatrix, setExportingMatrix] = useState(false)
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>((params.get('verification_status') as VerificationStatus) || 'all')
  const [profileTab, setProfileTab] = useState<ProfileTab>((params.get('profile_tab') as ProfileTab) || 'overview')
  const [period, setPeriod] = useState<MonitoringPeriodPreset>((params.get('period') as MonitoringPeriodPreset) || 'last_4_weeks')
  const [customDateFrom, setCustomDateFrom] = useState(params.get('date_from') || '')
  const [customDateTo, setCustomDateTo] = useState(params.get('date_to') || '')
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
  const [findings, setFindings] = useState<MonitoringFindingsPage>(emptyFindings)
  const [, setFindingsPage] = useState(1)
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

  // Each navigation (open, back, tab switch, history restore) takes a new number; a profile or
  // record that finishes loading after the admin has moved on is dropped instead of popping open.
  const navSeq = useRef(0)
  const cancelNavigation = () => { navSeq.current += 1; setLoading(false) }
  // Price history has three writers (profile load, history page, commodity switch); only the latest may land.
  const historySeq = useRef(0)
  useEffect(() => () => { navSeq.current += 1; historySeq.current += 1 }, [])

  const fetchRecord = useCallback(async (id: number) => {
    const seq = ++navSeq.current
    setLoading(true); setError('')
    try {
      const next = await adminApi.getMonitoringRecord(id)
      if (seq !== navSeq.current) return false
      setSelectedRecord(next)
      return true
    } catch (reason) {
      if (seq === navSeq.current) setError(message(reason))
      return false
    } finally { if (seq === navSeq.current) setLoading(false) }
  }, [])

  const openRecord = useCallback(async (id: number) => {
    if (await fetchRecord(id)) updateUrl({ record: id })
  }, [fetchRecord, updateUrl])

  const loadEstablishments = useCallback(async () => {
    setLoading(true); setError('')
    try { setWorkspace(await adminApi.getMonitoringEstablishments({ search: queries.establishments || undefined, routine_status: routineStatus, additional_task: additionalTask, observation, page: establishmentPage, per_page: 10 })) }
    catch (reason) { setError(message(reason)) }
    finally { setLoading(false) }
  }, [additionalTask, establishmentPage, observation, queries.establishments, routineStatus])

  const loadRecords = useCallback(async () => {
    setLoading(true); setError('')
    try {
      setRecords(await adminApi.getMonitoringRecords({
        search: queries.records || undefined,
        period: recordPeriod === 'all_time' ? undefined : recordPeriod,
        page: recordPage,
        per_page: 10,
      }))
    }
    catch (reason) { setError(message(reason)) }
    finally { setLoading(false) }
  }, [queries.records, recordPeriod, recordPage])

  const handleExportExcel = async () => {
    setExportingMatrix(true)
    setError('')
    try {
      const periodLabelMap: Record<MonitoringPeriodPreset, string> = {
        all_time: 'All Records',
        this_week: 'This Week',
        last_4_weeks: 'Last 4 Weeks',
        this_month: 'This Month',
        last_month: 'Last Month',
        custom: 'Custom Period',
      }
      const label = periodLabelMap[recordPeriod] || 'Price Monitoring Matrix'
      const matrixData = await adminApi.getMonitoringExportMatrix({
        period: recordPeriod === 'all_time' ? undefined : recordPeriod,
      })
      const { exportMonitoringMatrixExcel } = await import('../../utils/monitoringExcelExport')
      await exportMonitoringMatrixExcel(matrixData, label)
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to export Excel matrix.')
    } finally {
      setExportingMatrix(false)
    }
  }

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
      cancelNavigation()
      // Back/Forward into another module: the shell swaps panels; never load a record from that URL.
      const module = new URLSearchParams(window.location.search).get('module')
      if (module !== 'field_monitoring' && module !== 'analytics') return
      const restored = initialTab()
      setTab(restored)
      const current = new URLSearchParams(window.location.search)
      const recordId = Number(current.get('record'))
      const storeId = Number(current.get('store'))
      const nextProfileTab = current.get('profile_tab') as ProfileTab
      setProfileTab(['overview', 'findings', 'history', 'records'].includes(nextProfileTab) ? nextProfileTab : 'overview')
      const nextPeriod = (current.get('period') as MonitoringPeriodPreset) || 'last_4_weeks'
      const nextFrom = current.get('date_from') || ''
      const nextTo = current.get('date_to') || ''
      setPeriod(nextPeriod); setCustomDateFrom(nextFrom); setCustomDateTo(nextTo)
      setRoutineStatus((current.get('routine_status') as RoutineStatus) || 'all')
      setAdditionalTask((current.get('additional_task') as AdditionalTask) || 'all')
      setObservation((current.get('observation') as ObservationStatus) || 'all')
      setRecordPeriod((current.get('record_period') as MonitoringPeriodPreset) || 'all_time')
      setVerificationStatus((current.get('verification_status') as VerificationStatus) || 'all')
      setVerificationStore(Number(current.get('verification_store')) || null)
      setSearches({ establishments: current.get('establishment_search') || '', records: current.get('record_search') || '', verification: current.get('verification_search') || '' })
      if (recordId > 0) void fetchRecord(recordId)
      else if (storeId > 0) {
        setSelectedRecord(null)
        const filtersChanged = nextPeriod !== period || nextFrom !== customDateFrom || nextTo !== customDateTo
        if (!profile || profile.store.id !== storeId || filtersChanged) void openProfile(storeId, false, nextPeriod, nextFrom, nextTo)
      }
      else { setSelectedRecord(null); setProfile(null) }
    }
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
    // openProfile intentionally reads the current URL during browser history restoration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchRecord, profile, period, customDateFrom, customDateTo])

  useEffect(() => {
    if (profile || selectedRecord) window.requestAnimationFrame(() => document.querySelector<HTMLElement>('.field-monitor-profile h2, .field-monitor-review-page h2')?.focus())
  }, [profile, selectedRecord])

  const switchTab = (next: Tab) => {
    cancelNavigation()
    setTab(next); setProfile(null); setSelectedRecord(null)
    updateUrl({ monitor_tab: next === 'establishments' ? null : next, store: null, record: null })
  }

  async function openProfile(storeId: number, updateHistory = true, targetPeriod = period, targetFrom = customDateFrom, targetTo = customDateTo) {
    const seq = ++navSeq.current
    const historyRequest = ++historySeq.current
    // A newly chosen store starts on Overview; period changes and URL restores keep the current tab.
    const freshStore = updateHistory && profile?.store.id !== storeId
    setLoading(true); setError('')
    try {
      const periodParams = {
        period: targetPeriod,
        date_from: targetPeriod === 'custom' ? targetFrom || undefined : undefined,
        date_to: targetPeriod === 'custom' ? targetTo || undefined : undefined,
      }
      const nextProfile = await adminApi.getMonitoringEstablishment(storeId, periodParams)
      const requested = new URLSearchParams(window.location.search).get('commodity')
      const selector = nextProfile.monitored_commodities.find((item) => item.selector === requested)?.selector || nextProfile.monitored_commodities[0]?.selector || ''
      const [nextHistory, nextRecords, nextFindings] = await Promise.all([
        adminApi.getMonitoringPriceHistory(storeId, { commodity: selector || undefined, ...periodParams, per_page: 10 }),
        adminApi.getMonitoringRecords({ store_id: storeId, anomaly: 'all', ...periodParams, per_page: 10 }),
        adminApi.getMonitoringFindings(storeId, { ...periodParams, per_page: 10 }),
      ])
      if (seq !== navSeq.current) return
      let resolvedFindings = nextFindings
      if (resolvedFindings.total === 0 && nextRecords.data.some((r) => (r.anomaly_count ?? 0) > 0)) {
        const anomalies: MonitoringFindingItem[] = []
        for (const rec of nextRecords.data) {
          for (const itm of (rec.items || [])) {
            if (itm.is_anomaly) {
              anomalies.push({
                id: itm.id,
                monitoring_record_id: rec.id,
                finalized_at: rec.finalized_at,
                officer_name: rec.officer?.name || 'Field Officer',
                commodity_name: itm.bulletin?.commodity_name || `Commodity #${itm.srp_id}`,
                unit: itm.bulletin?.unit || null,
                recorded_price: itm.recorded_price,
                reference_value: itm.reference_value ?? itm.bulletin?.baseline_price ?? null,
                difference: itm.reference_value != null ? Number(itm.recorded_price) - Number(itm.reference_value) : null,
                variance_percent: itm.variance_percent,
                is_anomaly: true,
                protocol_mode: rec.protocol_mode ?? null,
                reference_label: itm.reference_label ?? null,
                reference_source: itm.reference_source ?? null,
              })
            }
          }
        }
        if (anomalies.length > 0) {
          resolvedFindings = {
            data: anomalies,
            total: anomalies.length,
            current_page: 1,
            last_page: 1,
            per_page: 10,
            from: 1,
            to: anomalies.length,
          }
        }
      }
      setProfile(nextProfile); setProfileRecords(nextRecords); setFindings(resolvedFindings)
      if (historyRequest === historySeq.current) { setCommodity(selector); setHistory(nextHistory) }
      if (freshStore) setProfileTab('overview')
      if (updateHistory) updateUrl({ store: storeId, period: targetPeriod, date_from: targetPeriod === 'custom' ? targetFrom : null, date_to: targetPeriod === 'custom' ? targetTo : null, ...(freshStore ? { profile_tab: null } : {}) })
    } catch (reason) { if (seq === navSeq.current) setError(message(reason)) }
    finally { if (seq === navSeq.current) setLoading(false) }
  }

  const closeDetail = () => {
    cancelNavigation()
    setSelectedRecord(null)
    updateUrl({ record: null })
  }

  const handlePeriodChange = async (nextPeriod: MonitoringPeriodPreset) => {
    setPeriod(nextPeriod)
    if (profile) await openProfile(profile.store.id, true, nextPeriod, customDateFrom, customDateTo)
  }

  const handleCustomDateChange = async (from: string, to: string) => {
    setCustomDateFrom(from); setCustomDateTo(to)
    if (profile && from && to && from <= to) await openProfile(profile.store.id, true, 'custom', from, to)
  }

  const loadProfileHistoryPage = async (page: number) => {
    if (!profile || loading) return
    const seq = ++historySeq.current
    const nav = navSeq.current
    try {
      const periodParams = {
        period,
        date_from: period === 'custom' ? customDateFrom || undefined : undefined,
        date_to: period === 'custom' ? customDateTo || undefined : undefined,
      }
      const next = await adminApi.getMonitoringPriceHistory(profile.store.id, { commodity: commodity || undefined, ...periodParams, page, per_page: 10 })
      if (seq === historySeq.current && nav === navSeq.current) setHistory(next)
    }
    catch (reason) { if (seq === historySeq.current && nav === navSeq.current) setError(message(reason)) }
  }

  const loadProfileRecordsPage = async (page: number) => {
    if (!profile) return
    try {
      const periodParams = {
        period,
        date_from: period === 'custom' ? customDateFrom || undefined : undefined,
        date_to: period === 'custom' ? customDateTo || undefined : undefined,
      }
      setProfileRecords(await adminApi.getMonitoringRecords({ store_id: profile.store.id, anomaly: 'all', ...periodParams, page, per_page: 10 }))
    }
    catch (reason) { setError(message(reason)) }
  }

  const loadProfileFindingsPage = async (page: number) => {
    if (!profile) return
    try {
      const periodParams = {
        period,
        date_from: period === 'custom' ? customDateFrom || undefined : undefined,
        date_to: period === 'custom' ? customDateTo || undefined : undefined,
      }
      setFindings(await adminApi.getMonitoringFindings(profile.store.id, { ...periodParams, page, per_page: 10 }))
      setFindingsPage(page)
    }
    catch (reason) { setError(message(reason)) }
  }

  const handleRegulatoryAction = (storeId: number, recordId?: number) => {
    onNavigate?.('legal_actions', recordId ? { source_record: recordId, source_store: storeId } : { source_store: storeId })
  }

  if (selectedRecord) {
    return (
      <VisitReview
        record={selectedRecord}
        error={error}
        backLabel={profile ? 'Return to establishment' : tab === 'records' ? 'Back to All Records' : 'Back to Additional Visits'}
        onBack={closeDetail}
        onRegulatoryAction={() => handleRegulatoryAction(selectedRecord.store.id, selectedRecord.id)}
      />
    )
  }

  if (profile) {
    return (
      <EstablishmentProfile
        profile={profile}
        profileTab={profileTab}
        period={period}
        customDateFrom={customDateFrom}
        customDateTo={customDateTo}
        commodity={commodity}
        history={history}
        records={profileRecords}
        findings={findings}
        error={error}
        onBack={() => {
          cancelNavigation()
          setProfile(null)
          updateUrl({ store: null, profile_tab: null, period: null, date_from: null, date_to: null })
        }}
        onProfileTab={(next) => {
          setProfileTab(next)
          updateUrl({ profile_tab: next === 'overview' ? null : next })
        }}
        onPeriodChange={handlePeriodChange}
        onCustomDateChange={handleCustomDateChange}
        onCommodity={async (next) => {
          // Ignored while the profile reloads; selector, table and URL change together only once the history arrives.
          if (loading) return
          const seq = ++historySeq.current
          const nav = navSeq.current
          const periodParams = {
            period,
            date_from: period === 'custom' ? customDateFrom || undefined : undefined,
            date_to: period === 'custom' ? customDateTo || undefined : undefined,
          }
          try {
            const nextHistory = await adminApi.getMonitoringPriceHistory(profile.store.id, { commodity: next, ...periodParams, per_page: 10 })
            if (seq !== historySeq.current || nav !== navSeq.current) return
            setCommodity(next); setHistory(nextHistory); setError('')
            updateUrl({ commodity: next })
          } catch (reason) { if (seq === historySeq.current && nav === navSeq.current) setError(message(reason)) }
        }}
        onVerification={() => {
          cancelNavigation()
          setVerificationStore(profile.store.id)
          setVerificationStoreName(profile.store.store_name)
          setProfile(null)
          setTab('verification')
          updateUrl({ store: null, profile_tab: null, monitor_tab: 'verification', verification_store: profile.store.id })
        }}
        onOpenRecord={openRecord}
        onHistoryPage={loadProfileHistoryPage}
        onRecordsPage={loadProfileRecordsPage}
        onFindingsPage={loadProfileFindingsPage}
        onRegulatoryAction={handleRegulatoryAction}
        reloading={loading}
      />
    )
  }

  return (
    <div className="admin-page">
      <div className="monitor-nav-cards field-monitor-cards-nav" role="tablist" aria-label="Field monitoring navigation" onKeyDown={moveTabFocus}>
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

      {/* Tab 2: Additional Visits */}
      <button
        id="monitor-tab-verification"
        aria-controls="monitor-panel-verification"
        type="button"
        role="tab"
        tabIndex={tab === 'verification' ? 0 : -1}
        aria-selected={tab === 'verification'}
        aria-label="Additional Visits"
        className={`monitor-nav-card ${tab === 'verification' ? 'active' : ''}`}
        onClick={() => switchTab('verification')}
      >
        <div className={`nav-card-icon-wrap ${tab === 'verification' ? 'active-verification' : ''}`}>
          <ShieldCheck size={24} />
        </div>
        <div className="nav-card-body">
          <h3 className="nav-card-title">Additional Visits</h3>
          <p className="nav-card-desc">Manage complaint and supervisor-directed visits</p>
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
    {tab === 'establishments' && <div role="tabpanel" id="monitor-panel-establishments" aria-labelledby="monitor-tab-establishments"><EstablishmentsView workspace={workspace} loading={loading} search={searches.establishments} routineStatus={routineStatus} additionalTask={additionalTask} observation={observation}
      onSearch={(value) => { setSearches((current) => ({ ...current, establishments: value })); setEstablishmentPage(1) }}
      onFilter={(next) => {
        const filter = listFilters[next]
        setRoutineStatus(filter.routineStatus); setAdditionalTask(filter.additionalTask); setObservation(filter.observation); setEstablishmentPage(1)
        updateUrl({
          routine_status: filter.routineStatus === 'all' ? null : filter.routineStatus,
          additional_task: filter.additionalTask === 'all' ? null : filter.additionalTask,
          observation: filter.observation === 'all' ? null : filter.observation,
        })
      }}
      onRefresh={loadEstablishments} onOpen={openProfile} onPage={setEstablishmentPage} /></div>}
    {tab === 'records' && <div role="tabpanel" id="monitor-panel-records" aria-labelledby="monitor-tab-records"><RecordsView page={records} loading={loading} search={searches.records} period={recordPeriod} exporting={exportingMatrix}
      onSearch={(value) => { setSearches((current) => ({ ...current, records: value })); setRecordPage(1) }}
      onPeriodChange={(value) => { setRecordPeriod(value); setRecordPage(1); updateUrl({ record_period: value === 'all_time' ? null : value }) }}
      onExportExcel={handleExportExcel}
      onRefresh={loadRecords} onOpen={openRecord} onPage={setRecordPage} /></div>}
    {tab === 'verification' && <div role="tabpanel" id="monitor-panel-verification" aria-labelledby="monitor-tab-verification"><VerificationView page={verification} loading={loading} search={searches.verification} status={verificationStatus} scope={verificationStoreName} pending={pendingRequest}
      onClearScope={() => { setVerificationStore(null); setVerificationStoreName(''); updateUrl({ verification_store: null }) }} onSearch={(value) => { setSearches((current) => ({ ...current, verification: value })); setVerificationPage(1) }} onStatus={(value) => { setVerificationStatus(value); setVerificationPage(1); updateUrl({ verification_status: value === 'all' ? null : value }) }}
      onRefresh={loadVerification} onOpenRecord={openRecord} onPage={setVerificationPage}
      onCancel={async (id) => { setPendingRequest(id); setError(''); try { await adminApi.cancelFieldVerification(id); await loadVerification() } catch (reason) { setError(message(reason)) } finally { setPendingRequest(null) } }}
      onReopen={async (id) => { setPendingRequest(id); setError(''); try { await adminApi.reopenFieldVerification(id); await loadVerification() } catch (reason) { setError(message(reason)) } finally { setPendingRequest(null) } }} /></div>}
    </div>
  )
}

const listFilters: Record<ListFilter, ListFilterState> = {
  all: { routineStatus: 'all', additionalTask: 'all', observation: 'all' },
  due: { routineStatus: 'due', additionalTask: 'all', observation: 'all' },
  completed: { routineStatus: 'completed', additionalTask: 'all', observation: 'all' },
  verification: { routineStatus: 'all', additionalTask: 'verification_required', observation: 'all' },
  observations: { routineStatus: 'all', additionalTask: 'all', observation: 'with_observations' },
}

// Older URLs could combine filters; show the most specific one.
function currentListFilter({ routineStatus, additionalTask, observation }: ListFilterState): ListFilter {
  if (observation === 'with_observations') return 'observations'
  if (routineStatus !== 'all') return routineStatus
  return additionalTask === 'verification_required' ? 'verification' : 'all'
}

/** One status filter beside the search; counts come from the workspace summary. */
function StatusFilter({ workspace, value, onChange }: { workspace: MonitoringWorkspace | null; value: ListFilter; onChange: (value: ListFilter) => void }) {
  const summary = workspace?.routine_summary
  const daily = workspace?.monitoring_period?.cadence === 'daily'
  const label = (text: string, count?: number) => count === undefined ? text : `${text} (${count})`
  return <div className="unified-select-wrap field-monitor-status-filter">
    <select aria-label="Filter establishments" value={value} onChange={(event) => onChange(event.target.value as ListFilter)}>
      <option value="all">{label('All establishments', summary?.total_establishments)}</option>
      <option value="due">{label(daily ? 'Due today' : 'Not yet monitored', summary?.due)}</option>
      <option value="completed">{label(daily ? 'Monitored today' : 'Monitored this week', summary?.completed)}</option>
      <option value="verification">{label('Needs additional visit', summary?.additional_visits)}</option>
      <option value="observations">With observations</option>
    </select>
    <ChevronDown size={15} className="unified-select-chevron" aria-hidden="true" />
  </div>
}

function getStoreImageUrl(store: { image_path?: string | null }): string {
  return store.image_path || '/stores/store.webp'
}

function EstablishmentCard({ store, cadence: _cadence, onOpen }: { store: MonitoringEstablishmentSummary; cadence: 'weekly' | 'daily'; onOpen: (id: number) => void }) {
  const isMarket = store.store_name.toLowerCase().includes('market')
  const initials = getStoreInitials(store.store_name)
  const imageUrl = getStoreImageUrl(store)
  const isPlaceholder = !store.image_path || store.image_path === '/stores/store.webp'

  return <article className="establishment-card-wrapper">
    <button
      type="button"
      className="establishment-card-btn dark-theme"
      aria-label={`Open ${store.store_name} monitoring profile`}
      onClick={() => onOpen(store.id)}
    >
      <div className={`establishment-card-media ${isPlaceholder ? 'has-facade-placeholder' : ''}`} aria-hidden="true">
        <div className="establishment-card-facade">
          <div className="facade-icon-badge">
            {isMarket ? <Building2 size={30} /> : <Store size={30} />}
          </div>
          <span className="establishment-initials">{initials}</span>
          <span className="facade-store-type">{isMarket ? 'Public Market' : 'Commercial Retail'}</span>
        </div>
        <img
          src={imageUrl}
          alt=""
          className="establishment-card-img"
          loading="lazy"
          decoding="async"
          onError={(e) => {
            e.currentTarget.style.display = 'none'
          }}
        />
        <div className="establishment-card-shade-dark" />

        <div className="establishment-card-badge-top-right">
          <Observation value={store.latest_result} />
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
            <History size={15} className="metric-icon" aria-hidden="true" />
            <div className="metric-copy">
              <span className="metric-label">Total visits:</span>
              <strong className="metric-val">{store.completed_records_count > 0 ? `${store.completed_records_count}` : '0'}</strong>
            </div>
          </div>

          <div className="card-footer-metric right">
            <Calendar size={15} className="metric-icon" aria-hidden="true" />
            <div className="metric-copy">
              <span className="metric-label">Latest visit:</span>
              <strong className="metric-val">{formatShortDate(store.latest_monitoring_at || store.latest_routine_monitoring_at)}</strong>
            </div>
          </div>
        </div>
      </div>
    </button>
  </article>
}

function EstablishmentRowCard({ store, cadence: _cadence, onOpen }: { store: MonitoringEstablishmentSummary; cadence: 'weekly' | 'daily'; onOpen: (id: number) => void }) {
  const imageUrl = getStoreImageUrl(store)
  const isMarket = store.store_name.toLowerCase().includes('market')
  const initials = getStoreInitials(store.store_name)
  const isPlaceholder = !store.image_path || store.image_path === '/stores/store.webp'

  return (
    <article className="establishment-row-card">
      {/* Left Column: Photo Media or Clean Architectural Facade */}
      <div className={`establishment-row-media ${isPlaceholder ? 'has-facade-placeholder' : ''}`}>
        <div className="establishment-row-facade" aria-hidden="true">
          <div className="facade-icon-badge">
            {isMarket ? <Building2 size={32} /> : <Store size={32} />}
          </div>
          <span className="establishment-initials">{initials}</span>
          <span className="facade-store-type">{isMarket ? 'Public Market' : 'Commercial Retail'}</span>
        </div>
        <img
          src={imageUrl}
          alt=""
          className="establishment-row-img"
          loading="lazy"
          decoding="async"
          onError={(e) => {
            e.currentTarget.style.display = 'none'
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

        {/* Bottom Metrics: Total Inspections & Latest Visit */}
        <div className="establishment-row-metrics">
          <div className="row-metric-box">
            <div className="metric-box-icon">
              <History size={18} aria-hidden="true" />
            </div>
            <div className="metric-box-text">
              <span className="metric-box-label">TOTAL INSPECTIONS</span>
              <strong className="metric-box-val">
                {store.completed_records_count > 0 ? `${store.completed_records_count} Recorded` : 'No visits'}
              </strong>
            </div>
          </div>

          <div className="row-metric-box">
            <div className="metric-box-icon">
              <Calendar size={18} aria-hidden="true" />
            </div>
            <div className="metric-box-text">
              <span className="metric-box-label">LATEST MONITORING VISIT</span>
              <strong className="metric-box-val">
                {formatShortDate(store.latest_monitoring_at || store.latest_routine_monitoring_at)}
              </strong>
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
          <span className="status-label">REGULATORY STATUS</span>
          <div className="status-badges-stack">
            <Observation value={store.latest_result} />
            {store.verification_task_status !== 'none' && (
              <span className="status-pill-badge verification">
                <ShieldAlert size={14} aria-hidden="true" />
                <span>Verification Required</span>
              </span>
            )}
          </div>
          {store.verification_task_status === 'claimed' && (
            <span className="status-context-note">Verification claimed by {store.verification_claimant?.name || 'an officer'}.</span>
          )}
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

function EstablishmentsView({ workspace, loading, search, routineStatus, additionalTask, observation, onSearch, onFilter, onOpen, onPage }: {
  workspace: MonitoringWorkspace | null; loading: boolean; search: string; routineStatus: RoutineStatus; additionalTask: AdditionalTask; observation: ObservationStatus
  onSearch: (value: string) => void; onFilter: (value: ListFilter) => void; onRefresh?: () => void; onOpen: (id: number) => void; onPage: (page: number) => void
}) {
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const cadence = workspace?.monitoring_period?.cadence || 'weekly'

  return <>
    <section className="field-monitor-controls-container field-monitor-controls-modern" aria-label="Establishment filters">
      {/* One row: search, status filter, view switcher */}
      <div className="filter-tier-primary">
        <div className="search-and-chips-group">
          <div className="filter-group search-group">
            <label htmlFor="establishment-search-input" className="sr-only">Search establishments</label>
            <div className="admin-search-field-modern">
              <Search size={17} aria-hidden="true" />
              <input
                id="establishment-search-input"
                type="search"
                aria-label="Search establishments"
                placeholder="Search establishments..."
                value={search}
                onChange={(event) => onSearch(event.target.value)}
              />
              {search && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => onSearch('')}
                  aria-label="Clear search"
                  title="Clear search"
                >
                  <X size={15} />
                </button>
              )}
            </div>
          </div>

          <StatusFilter workspace={workspace} value={currentListFilter({ routineStatus, additionalTask, observation })} onChange={onFilter} />
        </div>

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
              <Table size={17} />
              <span>Table</span>
            </button>
          </div>
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
              <EstablishmentRowCard key={store.id} store={store} cadence={cadence} onOpen={onOpen} />
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
              <EstablishmentCard key={store.id} store={store} cadence={cadence} onOpen={onOpen} />
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
                <th>Compliance status</th>
                <th>Latest visit</th>
                <th>Total visits</th>
                <th>Verification</th>
                <th><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody>
              {loading && !workspace ? (
                <Skeleton columns={6} />
              ) : (
                workspace?.establishments.data.map((store) => (
                  <tr key={store.id}>
                    <td data-label="Establishment">
                      <strong>{store.store_name}</strong>
                      <small>{store.address}</small>
                    </td>
                    <td data-label="Compliance status"><Observation value={store.latest_result} /></td>
                    <td data-label="Latest visit">
                      <strong>{formatShortDate(store.latest_monitoring_at || store.latest_routine_monitoring_at)}</strong>
                      <small>{store.latest_officer?.name || 'Officer unavailable'}</small>
                    </td>
                    <td data-label="Total visits">
                      <strong>{store.completed_records_count > 0 ? `${store.completed_records_count} Recorded` : 'No visits'}</strong>
                    </td>
                    <td data-label="Additional visit">{store.verification_task_status === 'none' ? 'None' : <><strong>Additional Visit</strong><small>{store.verification_task_status === 'claimed' ? `Assigned to ${store.verification_claimant?.name || 'an officer'}` : 'Needs assignment'}</small></>}</td>
                    <td>
                      <button
                        type="button"
                        className="admin-table-action-btn"
                        aria-label={`Open ${store.store_name} monitoring profile`}
                        onClick={() => onOpen(store.id)}
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

function RecordsView({ page, loading, search, period, exporting, onSearch, onPeriodChange, onExportExcel, onRefresh, onOpen, onPage }: {
  page: MonitoringRecordPage; loading: boolean; search: string; period: MonitoringPeriodPreset; exporting: boolean
  onSearch: (value: string) => void; onPeriodChange: (value: MonitoringPeriodPreset) => void; onExportExcel: () => void; onRefresh: () => void; onOpen: (id: number) => void; onPage: (page: number) => void
}) {
  return <>
    <section className="field-monitor-controls-unified" aria-label="Monitoring record filters">
      <div className="unified-search-wrap">
        <label htmlFor="records-search-input" className="sr-only">Search monitoring visits</label>
        <div className="admin-search-field-modern">
          <Search size={17} aria-hidden="true" />
          <input
            id="records-search-input"
            type="search"
            aria-label="Search monitoring visits"
            placeholder="Search store or officer..."
            value={search}
            onChange={(event) => onSearch(event.target.value)}
          />
          {search && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => onSearch('')}
              aria-label="Clear search"
              title="Clear search"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      <div className="unified-filter-group">
        <label htmlFor="records-period-select" className="unified-filter-label">
          Period:
        </label>
        <div className="unified-select-wrap">
          <select
            id="records-period-select"
            aria-label="Period"
            value={period}
            onChange={(event) => onPeriodChange(event.target.value as MonitoringPeriodPreset)}
          >
            <option value="all_time">All records</option>
            <option value="this_week">This week</option>
            <option value="last_4_weeks">Last 4 weeks</option>
            <option value="this_month">This month</option>
            <option value="last_month">Last month</option>
          </select>
          <ChevronDown size={15} className="unified-select-chevron" aria-hidden="true" />
        </div>
      </div>

      <button
        type="button"
        className="unified-export-btn"
        onClick={onExportExcel}
        disabled={exporting}
        aria-label="Export to Excel"
        title="Export Regional Price Monitoring Matrix to Excel"
      >
        <FileSpreadsheet size={15} aria-hidden="true" />
        <span>{exporting ? 'Exporting...' : 'Export to Excel'}</span>
      </button>

      <button type="button" className="unified-refresh-btn" onClick={onRefresh} aria-label="Refresh">
        <RefreshCw size={15} aria-hidden="true" />
        <span>Refresh</span>
      </button>
    </section>
    <RecordTable page={page} loading={loading} onOpen={onOpen} />
    <Pagination page={page} onPage={onPage} />
  </>
}

function RecordTable({ page, loading, onOpen, hideEstablishment = false }: { page: MonitoringRecordPage; loading: boolean; onOpen: (id: number) => void; hideEstablishment?: boolean }) {
  return <section className="admin-table-card field-monitor-table-card"><div className="admin-table-wrap">
    <table className="admin-data-table field-monitor-table"><caption className="sr-only">Accepted field monitoring visits</caption><thead><tr>{!hideEstablishment && <th>Establishment</th>}<th>Field officer</th><th>Visit finalized</th><th>Protocol / origin</th><th>Items</th><th>Observations</th><th><span className="sr-only">Action</span></th></tr></thead>
      <tbody>{loading ? <Skeleton columns={hideEstablishment ? 6 : 7} /> : page.data.map((record) => <tr key={record.id}>{!hideEstablishment && <td data-label="Establishment"><strong>{record.store.store_name}</strong><small>{record.store.address}</small></td>}<td data-label="Field officer"><strong>{record.officer.name}</strong><small>{record.officer.email}</small></td><td data-label="Visit finalized">{formatDate(record.finalized_at)}</td><td data-label="Protocol / origin"><strong>{record.protocol_mode ? `${record.protocol_mode === 'emergency' ? 'Emergency' : 'Standard'} protocol` : 'Protocol unavailable'}</strong><small>{record.verification_request ? 'Verification visit' : 'Routine visit'}</small></td><td data-label="Items">{record.items_count ?? record.items?.length ?? 0}</td><td data-label="Observations"><span className={`monitor-observation ${record.anomaly_count ? 'attention' : 'compliant'}`}>{record.anomaly_count ? <><TriangleAlert size={12} />{record.anomaly_count}</> : 'None'}</span></td><td data-label="Action"><button type="button" className="admin-button secondary field-monitor-review-button" aria-label={`View visit ${record.id}`} onClick={() => onOpen(record.id)}><Eye size={16} />View</button></td></tr>)}</tbody>
    </table>{!loading && !page.data.length && <Empty text="No accepted visits match." />}
  </div></section>
}

function OfficerAssignmentForm({ submitLabel, reasonRequired = true, onSubmit, onCancel }: { submitLabel: string; reasonRequired?: boolean; onSubmit: (fieldOfficerId: number, reason: string) => Promise<void>; onCancel: () => void }) {
  const [officers, setOfficers] = useState<ManagedUserRecord[]>([])
  const [officerId, setOfficerId] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    void adminApi.getManagedUsers({ role: 'field_officer', status: 'active', per_page: 50 })
      .then((page) => setOfficers(page.records))
      .catch((failure) => setFormError(message(failure)))
  }, [])

  return <form className="monitor-detail-facts" onSubmit={async (event) => {
    event.preventDefault()
    setSaving(true); setFormError('')
    try { await onSubmit(Number(officerId), reason.trim()) }
    catch (failure) { setFormError(message(failure)) }
    finally { setSaving(false) }
  }}>
    {formError && <div className="admin-feedback error" role="alert">{formError}</div>}
    <label>Field Officer<select aria-label="Field Officer" autoFocus required value={officerId} onChange={(event) => setOfficerId(event.target.value)}><option value="">Select active officer</option>{officers.map((officer) => <option key={officer.id} value={officer.id}>{officer.name}</option>)}</select></label>
    {reasonRequired && <label>Reason<textarea aria-label="Reason" required value={reason} onChange={(event) => setReason(event.target.value)} /></label>}
    <div><button type="submit" className="admin-button primary" disabled={saving}>{saving ? 'Assigning…' : submitLabel}</button><button type="button" className="admin-button secondary" onClick={onCancel}>Cancel</button></div>
  </form>
}

function AssignmentDialog({ storeName, onClose, children }: { storeName: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const closeOnEscape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return <div className="admin-modal-backdrop" onClick={onClose}>
    <div className="signature-preview-dialog field-assign-dialog" role="dialog" aria-modal="true" aria-labelledby="field-assign-title" onClick={(event) => event.stopPropagation()}>
      <header className="signature-preview-header">
        <div>
          <h3 id="field-assign-title">Assign additional visit</h3>
          <p>{storeName}</p>
        </div>
        <button type="button" className="signature-close-btn" aria-label="Close" onClick={onClose}><X size={18} /></button>
      </header>
      <div className="field-assign-body">{children}</div>
    </div>
  </div>
}

function VerificationView({ page, loading, search, status, scope, pending, onClearScope, onSearch, onStatus, onRefresh, onOpenRecord, onPage, onCancel, onReopen }: {
  page: FieldVerificationRequestPage; loading: boolean; search: string; status: VerificationStatus
  scope: string; pending: number | null; onClearScope: () => void; onSearch: (value: string) => void; onStatus: (value: VerificationStatus) => void; onRefresh: () => void; onOpenRecord: (id: number) => void; onPage: (page: number) => void; onCancel: (id: number) => void; onReopen: (id: number) => void
}) {
  const [assigning, setAssigning] = useState<number | null>(null)
  const assigningRequest = page.data.find((request) => request.id === assigning)
  const closeAssign = useCallback(() => setAssigning(null), [])
  return <>
    {scope && <div className="field-monitor-scope"><span>Establishment</span><strong>{scope}</strong><button type="button" className="text-button" aria-label="Clear establishment filter" onClick={onClearScope}>Clear</button></div>}
    <section className="field-monitor-controls-unified" aria-label="Additional visit filters">
      <div className="unified-search-wrap">
        <label htmlFor="verification-search-input" className="sr-only">Search additional visits</label>
        <div className="admin-search-field-modern">
          <Search size={17} aria-hidden="true" />
          <input
            id="verification-search-input"
            type="search"
            aria-label="Search additional visits"
            placeholder="Search establishment or report..."
            value={search}
            onChange={(event) => onSearch(event.target.value)}
          />
          {search && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => onSearch('')}
              aria-label="Clear search"
              title="Clear search"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      <div className="unified-filter-group">
        <label htmlFor="verification-status-select" className="unified-filter-label">
          Status:
        </label>
        <div className="unified-select-wrap">
          <select
            id="verification-status-select"
            aria-label="Additional visit status"
            value={status}
            onChange={(event) => onStatus(event.target.value as VerificationStatus)}
          >
            <option value="all">All visits</option>
            <option value="open">Needs assignment</option>
            <option value="claimed">Assigned</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <ChevronDown size={15} className="unified-select-chevron" aria-hidden="true" />
        </div>
      </div>

      <button type="button" className="unified-refresh-btn" onClick={onRefresh} aria-label="Refresh">
        <RefreshCw size={15} aria-hidden="true" />
        <span>Refresh</span>
      </button>
    </section>
    <section className="admin-table-card"><div className="admin-table-wrap"><table className="admin-data-table"><caption className="sr-only">Additional field visits</caption>
      <thead><tr><th>Establishment</th><th>Source</th><th>Reason</th><th>Requested</th><th>Status</th><th>Assigned officer</th><th>Result</th></tr></thead>
      <tbody>{loading ? <Skeleton columns={7} /> : page.data.map((request) => <tr key={request.id}><td data-label="Establishment"><strong>{request.store.store_name}</strong><small>{request.store.address}</small></td><td data-label="Source"><strong>{request.source_type === 'complaint' ? 'Complaint' : 'Supervisor directive'}</strong><small>{request.report?.report_reference || 'No consumer report'}</small></td><td data-label="Reason">{request.reason}</td><td data-label="Requested">{formatDate(request.requested_at)}</td><td data-label="Status"><span className={`admin-status-badge ${request.status === 'completed' ? 'current' : request.status === 'open' ? 'history' : ''}`}>{request.status === 'open' ? 'needs assignment' : request.status}</span></td><td data-label="Assigned officer">{request.claimant?.name || (request.status === 'open' ? 'Needs assignment' : 'Not assigned')}</td><td data-label="Result">{request.monitoring_record ? <button type="button" className="admin-button secondary" aria-label={`Open monitoring record ${request.monitoring_record.id}`} onClick={() => onOpenRecord(request.monitoring_record!.id)}>Record #{request.monitoring_record.id}</button> : request.status === 'cancelled' ? <button disabled={pending === request.id} type="button" className="admin-button secondary" onClick={() => onReopen(request.id)}>{pending === request.id ? 'Reopening…' : 'Reopen'}</button> : request.status === 'open' ? <><button type="button" className="admin-button primary" onClick={() => setAssigning(request.id)}>Assign</button><button disabled={pending === request.id} type="button" className="admin-button secondary" onClick={() => onCancel(request.id)}>{pending === request.id ? 'Cancelling…' : 'Cancel'}</button></> : 'Pending'}</td></tr>)}</tbody>
    </table>{!loading && !page.data.length && <Empty text="No additional visits match." />}</div></section>
    <Pagination page={page} onPage={onPage} />
    {assigningRequest && (
      <AssignmentDialog storeName={assigningRequest.store.store_name} onClose={closeAssign}>
        <OfficerAssignmentForm submitLabel="Assign visit" reasonRequired={false} onCancel={closeAssign} onSubmit={async (officerId) => { await adminApi.assignFieldVerification(assigningRequest.id, officerId); closeAssign(); onRefresh() }} />
      </AssignmentDialog>
    )}
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
        <span>Latest price vs reference</span>
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

function EstablishmentProfile({
  profile,
  profileTab,
  period,
  customDateFrom,
  customDateTo,
  commodity,
  history,
  records,
  findings,
  error,
  onBack,
  onProfileTab,
  onPeriodChange,
  onCustomDateChange,
  onCommodity,
  onVerification,
  onOpenRecord,
  onHistoryPage,
  onRecordsPage,
  onFindingsPage,
  onRegulatoryAction,
  reloading,
}: {
  profile: MonitoringEstablishmentProfile
  profileTab: ProfileTab
  period: MonitoringPeriodPreset
  customDateFrom: string
  customDateTo: string
  commodity: `key:${string}` | `srp:${number}` | ''
  history: MonitoringPriceHistoryPage
  records: MonitoringRecordPage
  findings: MonitoringFindingsPage
  error: string
  onBack: () => void
  onProfileTab: (tab: ProfileTab) => void
  onPeriodChange: (period: MonitoringPeriodPreset) => void
  onCustomDateChange: (from: string, to: string) => void
  onCommodity: (selector: `key:${string}` | `srp:${number}`) => void
  onVerification: () => void
  onOpenRecord: (id: number) => void
  onHistoryPage: (page: number) => void
  onRecordsPage: (page: number) => void
  onFindingsPage: (page: number) => void
  onRegulatoryAction: (storeId: number, recordId?: number) => void
  reloading: boolean
}) {
  const latest = profile.latest_record
  const isMarket = profile.store.store_name.toLowerCase().includes('market')
  const [assigning, setAssigning] = useState(false)
  const [assigned, setAssigned] = useState(false)
  const closeAssign = useCallback(() => setAssigning(false), [])

  const recidivism = profile.store.recidivism_index ?? 0
  const periodCompleted = profile.period_completed_records_count ?? profile.completed_records_count
  const periodObservations = profile.period_records_with_observations_count ?? profile.records_with_observations_count
  const cadence = profile.monitoring_period?.cadence
  const routineDone = profile.routine_status === 'completed'
  const protocolMode = profile.monitoring_period?.protocol_mode
  const regulatory = recidivism > 0
    ? { tone: 'danger', value: `Repeat (${recidivism})`, sub: '0% tolerance on escalation' }
    : periodObservations > 0
      ? { tone: 'amber', value: 'Observations Noted', sub: `${periodObservations} anomalous visit${periodObservations > 1 ? 's' : ''} recorded` }
      : { tone: 'emerald', value: 'Within Reference', sub: 'Standard 10% tolerance compliant' }
  const latestResult = !latest
    ? { tone: 'muted', label: 'Never monitored' }
    : latest.anomaly_count
      ? { tone: 'attention', label: 'Findings Recorded' }
      : latest.unavailable_reference_count
        ? { tone: 'muted', label: 'Reference Unavailable' }
        : { tone: 'clean', label: 'Within Reference' }
  const commoditiesChecked = latest ? (latest.items_count ?? latest.items?.length ?? 0) : 0

  return (
    <article className="field-monitor-profile">
      {error && <div className="admin-feedback error" role="alert">{error}</div>}

      <header className="field-monitor-profile-hero">
        <img
          src={getStoreImageUrl(profile.store)}
          alt=""
          aria-hidden="true"
          className="profile-hero-photo"
          decoding="async"
          onError={(e) => { e.currentTarget.style.display = 'none' }}
        />
        <button type="button" className="profile-hero-back" onClick={onBack} aria-label="Back to establishments directory">
          <ArrowLeft size={16} aria-hidden="true" />
          <span>Back to establishments</span>
        </button>

        <div className="profile-hero-body">
          <div className="profile-hero-left">
            <div className="profile-hero-avatar" aria-hidden="true">
              {isMarket ? <Building2 size={40} /> : <Store size={40} />}
            </div>
            <div className="profile-hero-info">
              <h2 tabIndex={-1}>{profile.store.store_name}</h2>
              <p className="profile-hero-meta">
                <span className="profile-hero-address">
                  <MapPin size={15} aria-hidden="true" />
                  <span>{profile.store.address}</span>
                </span>
                {profile.store.dti_sec_number && <span className="meta-sec">SEC Reg: {profile.store.dti_sec_number}</span>}
              </p>
              <div className="profile-hero-badges">
                {recidivism > 0 && (
                  <span className="profile-status-pill danger">
                    <AlertTriangle size={13} aria-hidden="true" />
                    <span>Recidivism Index: {recidivism}</span>
                  </span>
                )}
                {profile.verification_task_status !== 'none' ? (
                  <span className="profile-status-pill amber">
                    <ShieldAlert size={13} aria-hidden="true" />
                    <span>Verification Required</span>
                  </span>
                ) : recidivism === 0 && (
                  <span className="profile-status-pill success">
                    <ShieldCheck size={13} aria-hidden="true" />
                    <span>Under Regular Monitoring</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="profile-hero-actions">
            <button type="button" className="admin-button primary" onClick={() => setAssigning(true)}>
              <UserCheck size={17} />
              <span>Assign additional visit</span>
            </button>
            <button type="button" className="admin-button secondary" onClick={onVerification}>
              <ShieldAlert size={17} />
              <span>View Additional Visits</span>
            </button>
          </div>
        </div>
      </header>

      {assigning && (
        <AssignmentDialog storeName={profile.store.store_name} onClose={closeAssign}>
          <OfficerAssignmentForm
            submitLabel="Assign visit"
            onCancel={closeAssign}
            onSubmit={async (fieldOfficerId, reason) => {
              await adminApi.createAdditionalVisit(profile.store.id, { field_officer_id: fieldOfficerId, reason })
              setAssigning(false)
              setAssigned(true)
            }}
          />
        </AssignmentDialog>
      )}
      {assigned && <div className="admin-feedback success" role="status">Additional visit assigned.</div>}

      <div className="field-profile-toolbar">
        <div className="field-monitor-tabs field-profile-tabs" role="tablist" aria-label="Establishment monitoring profile" onKeyDown={moveTabFocus}>
          <button
            key="overview"
            id="profile-tab-overview"
            aria-controls="profile-panel-overview"
            type="button"
            role="tab"
            tabIndex={profileTab === 'overview' ? 0 : -1}
            aria-selected={profileTab === 'overview'}
            onClick={() => onProfileTab('overview')}
          >
            <LayoutGrid size={17} aria-hidden="true" />
            <span>Overview</span>
          </button>
          <button
            key="findings"
            id="profile-tab-findings"
            aria-controls="profile-panel-findings"
            type="button"
            role="tab"
            tabIndex={profileTab === 'findings' ? 0 : -1}
            aria-selected={profileTab === 'findings'}
            onClick={() => onProfileTab('findings')}
          >
            <TriangleAlert size={17} aria-hidden="true" />
            <span>Findings &amp; Anomalies</span>
            {findings.total > 0 && <span className="tab-count-badge danger">{findings.total}</span>}
          </button>
          <button
            key="history"
            id="profile-tab-history"
            aria-controls="profile-panel-history"
            type="button"
            role="tab"
            tabIndex={profileTab === 'history' ? 0 : -1}
            aria-selected={profileTab === 'history'}
            onClick={() => onProfileTab('history')}
          >
            <ChartColumn size={17} aria-hidden="true" />
            <span>Price History</span>
          </button>
          <button
            key="records"
            id="profile-tab-records"
            aria-controls="profile-panel-records"
            type="button"
            role="tab"
            tabIndex={profileTab === 'records' ? 0 : -1}
            aria-selected={profileTab === 'records'}
            onClick={() => onProfileTab('records')}
          >
            <FileText size={17} aria-hidden="true" />
            <span>Monitoring Records</span>
            {records.total > 0 && <span className="tab-count-badge">{records.total}</span>}
          </button>
        </div>

        <div className="field-profile-period">
          <label htmlFor="profile-period-select" className="field-profile-period-label">
            <Calendar size={16} aria-hidden="true" />
            <span>Period:</span>
          </label>
          <div className="unified-select-wrap">
            <select
              id="profile-period-select"
              aria-label="Monitoring period"
              value={period}
              onChange={(event) => onPeriodChange(event.target.value as MonitoringPeriodPreset)}
            >
              <option value="last_4_weeks">Last 4 Weeks</option>
              <option value="this_week">This Week</option>
              <option value="this_month">This Month</option>
              <option value="last_month">Last Month</option>
              <option value="all_time">All Time</option>
              <option value="custom">Custom range</option>
            </select>
            <ChevronDown size={15} className="unified-select-chevron" aria-hidden="true" />
          </div>
          {period === 'custom' && (
            <div className="period-custom-form">
              <label className="period-date-field">
                <span>From</span>
                <input
                  type="date"
                  aria-label="Filter from date"
                  value={customDateFrom}
                  onChange={(e) => onCustomDateChange(e.target.value, customDateTo)}
                />
              </label>
              <label className="period-date-field">
                <span>To</span>
                <input
                  type="date"
                  aria-label="Filter to date"
                  value={customDateTo}
                  onChange={(e) => onCustomDateChange(customDateFrom, e.target.value)}
                />
              </label>
            </div>
          )}
        </div>
      </div>

      {/* TAB 1: OVERVIEW */}
      {profileTab === 'overview' && (
        <section role="tabpanel" id="profile-panel-overview" aria-labelledby="profile-tab-overview" className="establishment-overview-workspace" aria-label="Establishment monitoring summary">
          <div className="overview-kpi-grid">
            <div className="overview-kpi-card blue">
              <span className="kpi-icon" aria-hidden="true"><ClipboardList size={24} /></span>
              <div className="kpi-copy">
                <span className="kpi-label">Completed Visits</span>
                <strong className="kpi-value">{periodCompleted}</strong>
                <small className="kpi-sub">Within selected period</small>
              </div>
            </div>
            <div className="overview-kpi-card orange">
              <span className="kpi-icon" aria-hidden="true"><CircleAlert size={24} /></span>
              <div className="kpi-copy">
                <span className="kpi-label">Visits with Observations</span>
                <strong className={`kpi-value ${periodObservations > 0 ? 'text-orange' : ''}`}>{periodObservations}</strong>
                <small className="kpi-sub">Detected price anomalies</small>
              </div>
            </div>
            <div className="overview-kpi-card purple">
              <span className="kpi-icon" aria-hidden="true"><Boxes size={24} /></span>
              <div className="kpi-copy">
                <span className="kpi-label">Monitored Commodities</span>
                <strong className="kpi-value">{profile.period_commodities_count ?? profile.monitored_commodities.length}</strong>
                <small className="kpi-sub">Actively tracked items</small>
              </div>
            </div>
            <div className={`overview-kpi-card ${regulatory.tone}`}>
              <span className="kpi-icon" aria-hidden="true"><FileText size={24} /></span>
              <div className="kpi-copy">
                <span className="kpi-label">Regulatory Status</span>
                <strong className={`kpi-value kpi-value-text text-${regulatory.tone}`}>{regulatory.value}</strong>
                <small className="kpi-sub">{regulatory.sub}</small>
              </div>
            </div>
          </div>

          <div className="overview-detail-grid">
            <div className="detail-card">
              <div className="detail-card-header">
                <ShieldCheck size={22} className="detail-icon" aria-hidden="true" />
                <h3 className="detail-card-title">Monitoring status</h3>
                {protocolMode && (
                  <span className={`profile-status-pill ${protocolMode === 'emergency' ? 'danger' : 'success'}`} title={profile.monitoring_period?.declaration_reference || undefined}>
                    <ShieldCheck size={13} aria-hidden="true" />
                    <span>{protocolMode === 'emergency' ? 'Emergency Protocol' : 'Normal Market Protocol'}</span>
                  </span>
                )}
              </div>
              <div className="detail-lead">
                <span>{cadence === 'daily' ? 'Daily routine status' : 'Weekly routine status'}</span>
                <strong>{routineDone ? (cadence === 'daily' ? 'Monitored Today' : 'Monitored This Week') : (cadence === 'daily' ? 'Due Today' : 'Not Yet Monitored')}</strong>
                <small>{profile.monitoring_period ? `${formatShortDate(profile.monitoring_period.starts_at)} – ${formatShortDate(profile.monitoring_period.ends_at)}` : ''}</small>
              </div>
              <div className="detail-facts">
                <div className="detail-fact">
                  <Calendar size={20} aria-hidden="true" />
                  <div>
                    <span>Last monitored</span>
                    <strong>{formatDate(profile.latest_routine_monitoring_at)}</strong>
                    <small>{profile.latest_routine_record?.officer.name || (profile.has_prior_routine_monitoring ? 'Officer unavailable' : 'No previous routine visits')}</small>
                  </div>
                </div>
                <div className="detail-fact">
                  <History size={20} aria-hidden="true" />
                  <div>
                    <span>{routineDone ? 'Next routine cycle' : 'Routine due by'}</span>
                    <strong>{profile.monitoring_period ? formatShortDate(profile.monitoring_period.ends_at) : 'Not scheduled'}</strong>
                    <small>{routineDone ? 'Current cycle completed' : 'Within current protocol cycle'}</small>
                  </div>
                </div>
                <div className="detail-fact">
                  <ShieldAlert size={20} aria-hidden="true" />
                  <div>
                    <span>Verification requirement</span>
                    <strong>{profile.verification_task_status === 'none' ? 'None' : 'Verification Required'}</strong>
                    {profile.verification_task_status === 'claimed' && <small>Verification claimed by {profile.verification_claimant?.name || 'an officer'}</small>}
                  </div>
                </div>
                <div className="detail-fact">
                  <ClipboardCheck size={20} aria-hidden="true" />
                  <div>
                    <span>Completed records</span>
                    <strong>{profile.completed_records_count}</strong>
                    <small>{profile.records_with_observations_count} with observations</small>
                  </div>
                </div>
              </div>
            </div>

            <div className="detail-card">
              <div className="detail-card-header">
                <Activity size={22} className="detail-icon" aria-hidden="true" />
                <h3 className="detail-card-title">Latest Inspection Snapshot</h3>
                <button type="button" className="detail-card-link" onClick={() => onProfileTab('records')}>
                  <span>View in Monitoring Records</span>
                  <ArrowRight size={15} aria-hidden="true" />
                </button>
              </div>
              <div className="snapshot-highlight">
                <span className="snapshot-icon" aria-hidden="true"><Calendar size={22} /></span>
                <div className="snapshot-copy">
                  <span>Latest accepted visit</span>
                  <strong>{formatDate(latest?.finalized_at)}</strong>
                  <small>{latest?.officer.name || 'Officer unavailable'}</small>
                </div>
                <span className={`snapshot-result ${latestResult.tone}`}>{latestResult.label}</span>
              </div>
              <div className="detail-facts">
                <div className="detail-fact">
                  <Boxes size={20} aria-hidden="true" />
                  <div>
                    <span>Commodities checked</span>
                    <strong>{latest ? `${commoditiesChecked} item${commoditiesChecked === 1 ? '' : 's'}` : 'None'}</strong>
                  </div>
                </div>
                <button type="button" className="detail-fact detail-fact-button" onClick={() => onProfileTab('findings')} aria-label="Open findings and anomalies">
                  <FileText size={20} aria-hidden="true" />
                  <div>
                    <span>Key findings</span>
                    <strong>{latest?.anomaly_count ? `${latest.anomaly_count} price anomal${latest.anomaly_count === 1 ? 'y' : 'ies'}` : 'No anomalies'}</strong>
                  </div>
                  <ChevronRight size={18} className="detail-fact-chevron" aria-hidden="true" />
                </button>
              </div>
              <div className="snapshot-footer">
                <div>
                  <span>Protocol</span>
                  <strong>{latest?.protocol_mode ? `${latest.protocol_mode === 'emergency' ? 'Emergency' : 'Standard'} protocol` : 'Not captured'}</strong>
                  {latest?.protocol_reference && <small>{latest.protocol_reference}</small>}
                </div>
                <div>
                  <span>Latest record</span>
                  <strong>{latest ? `Visit #${latest.id}` : 'None'}</strong>
                  {latest && <button type="button" className="text-button" onClick={() => onOpenRecord(latest.id)}>Open record</button>}
                </div>
                <div>
                  <span>Recent visits</span>
                  <strong>{records.data.slice(0, 3).map((record) => `#${record.id}`).join(', ') || 'None'}</strong>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* TAB 2: FINDINGS & ANOMALIES */}
      {profileTab === 'findings' && (
        <div role="tabpanel" id="profile-panel-findings" aria-labelledby="profile-tab-findings" className="field-profile-findings">
          <section className="admin-table-card">
            <div className="field-monitor-items-heading">
              <div>
                <h3>Flagged Price Anomalies &amp; Observations</h3>
                <p>Commodities recorded above permissible price references in the selected period.</p>
              </div>
            </div>

            {findings.data.length === 0 ? (
              <div className="findings-empty-state">
                <CheckCircle2 size={36} className="text-emerald" aria-hidden="true" />
                <h4>No Price Anomalies Detected</h4>
                <p>All recorded commodity prices for this establishment fall within permissible references in the selected period.</p>
              </div>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-data-table">
                  <caption className="sr-only">Establishment price findings and anomalies</caption>
                  <thead>
                    <tr>
                      <th>Inspection Date</th>
                      <th>Commodity</th>
                      <th>Observed Price</th>
                      <th>Reference / SRP</th>
                      <th>Variance</th>
                      <th>Protocol Mode</th>
                      <th>Field Officer</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {findings.data.map((item) => (
                      <tr key={item.id}>
                        <td data-label="Inspection Date">{formatDate(item.finalized_at)}</td>
                        <td data-label="Commodity">
                          <strong>{item.commodity_name}</strong>
                          {item.unit && <small> · {item.unit}</small>}
                        </td>
                        <td data-label="Observed Price">
                          <strong className="text-danger">{money(item.recorded_price)}</strong>
                        </td>
                        <td data-label="Reference / SRP">
                          <div>{money(item.reference_value)}</div>
                          <small>{item.reference_source || item.reference_label || 'SRP baseline'}</small>
                        </td>
                        <td data-label="Variance">
                          <span className="variance-pill anomaly">
                            {Number(item.difference) > 0 ? '+' : ''}{money(item.difference)}
                            {item.variance_percent !== null && ` (+${Number(item.variance_percent).toFixed(1)}%)`}
                          </span>
                        </td>
                        <td data-label="Protocol Mode">
                          <span className={`protocol-badge ${item.protocol_mode === 'emergency' ? 'emergency' : 'standard'}`}>
                            {item.protocol_mode === 'emergency' ? 'Emergency (0%)' : 'Standard (10%)'}
                          </span>
                        </td>
                        <td data-label="Field Officer">{item.officer_name}</td>
                        <td data-label="Actions" className="actions-cell">
                          <button
                            type="button"
                            className="admin-button small notice-action-btn"
                            onClick={() => onRegulatoryAction(profile.store.id, item.monitoring_record_id)}
                          >
                            <TriangleAlert size={13} aria-hidden="true" />
                            <span>Prepare Notice</span>
                          </button>
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => onOpenRecord(item.monitoring_record_id)}
                          >
                            View Record
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          {findings.last_page > 1 && <Pagination page={findings} onPage={onFindingsPage} />}
        </div>
      )}

      {/* TAB 3: PRICE HISTORY */}
      {profileTab === 'history' && (
        <div role="tabpanel" id="profile-panel-history" aria-labelledby="profile-tab-history">
          <section className="field-monitor-controls">
            <label>Commodity
              <select aria-label="Commodity" value={commodity} disabled={reloading} onChange={(event) => onCommodity(event.target.value as `key:${string}` | `srp:${number}`)}>
                {profile.monitored_commodities.map((item) => (
                  <option key={item.selector} value={item.selector}>
                    {item.commodity_name}{item.unit ? ` · ${item.unit}` : ''}
                  </option>
                ))}
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
          <Pagination page={history} onPage={onHistoryPage} disabled={reloading} />
        </div>
      )}

      {/* TAB 4: MONITORING RECORDS */}
      {profileTab === 'records' && (
        <div role="tabpanel" id="profile-panel-records" aria-labelledby="profile-tab-records" className="field-profile-records">
          <RecordTable page={records} loading={false} hideEstablishment onOpen={onOpenRecord} />
          <Pagination page={records} onPage={onRecordsPage} />
        </div>
      )}
    </article>
  )
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

  // Give the two-column review the full width; AdminShell restores the sidebar on exit.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('admin:sidebar-focus', { detail: true }))
    return () => { window.dispatchEvent(new CustomEvent('admin:sidebar-focus', { detail: false })) }
  }, [])

  const closeSignature = () => {
    if (signatureModal?.url) {
      URL.revokeObjectURL(signatureModal.url)
    }
    setSignatureModal(null)
  }

  // Mirrors the capture rule (FieldMonitoringController): standard SRP flags only above +10%, an emergency
  // ceiling flags anything above it. A price over SRP but inside the tolerance is not an anomaly.
  const statusOf = (item: MonitoringRecordItem) => item.is_anomaly ? 'flagged'
    : item.reference_value == null ? 'unavailable'
      : Number(item.recorded_price) > Number(item.reference_value) ? 'tolerated' : 'within'
  const tolerated = record.items.filter((item) => statusOf(item) === 'tolerated').length
  const withReference = record.items.filter((item) => statusOf(item) === 'within').length
  const unavailable = record.items.filter((item) => statusOf(item) === 'unavailable').length
  const itemCount = record.items_count ?? record.items.length
  const commodityName = (item: MonitoringRecordItem) => item.bulletin?.commodity_name || `SRP #${item.srp_id}`
  const differencePill = (item: MonitoringRecordItem) => {
    if (item.reference_value === null || item.reference_value === undefined) return <span className="visit-muted">Unavailable</span>
    const reference = Number(item.reference_value)
    const difference = Number(item.recorded_price) - reference
    const status = statusOf(item)
    // Colour follows the observation, not the sign: red flagged, yellow tolerated, green within reference.
    const tone = status === 'flagged' ? 'diff-high' : status === 'tolerated' ? 'diff-tolerance' : 'diff-match'
    return (
      <span className="visit-diff">
        <span className={`diff-pill ${tone}`}>{difference > 0 ? '+' : difference < 0 ? '−' : ''}{money(Math.abs(difference))}</span>
        {difference !== 0 && reference > 0 && <small>{difference > 0 ? '+' : '−'}{Math.abs((difference / reference) * 100).toFixed(1)}%</small>}
      </span>
    )
  }
  const observationBadge = (item: MonitoringRecordItem) => {
    const status = statusOf(item)
    if (status === 'tolerated') return <span className="monitor-observation tolerance"><CircleAlert size={13} />Above SRP · within 10%</span>
    if (status === 'flagged') return <span className="monitor-observation danger"><TriangleAlert size={13} />With observations</span>
    return <Observation value={status === 'unavailable' ? 'reference_unavailable' : 'no_observations'} />
  }

  return <article className="field-monitor-review-page">
    <header className="visit-review-topbar">
      <div className="visit-review-title">
        <button type="button" className="visit-review-back" onClick={onBack}><ArrowLeft size={17} aria-hidden="true" />{backLabel}</button>
        <h2 tabIndex={-1}>Visit #{record.id}</h2>
      </div>
      <div className="visit-review-actions">
        <button type="button" className="admin-button secondary" disabled={signatureLoading} onClick={() => openSignature('officer')}>
          <FileSignature size={16} />
          Officer signature
        </button>
        <button type="button" className="admin-button secondary" disabled={signatureLoading} onClick={() => openSignature('representative')}>
          <FileSignature size={16} />
          Store signature
        </button>
      </div>
    </header>
    {(error || sigError) && <div className="admin-feedback error" role="alert">{error || sigError}</div>}

    <div className="visit-review-layout">
      <div className="visit-review-main">
        <section className="admin-table-card field-monitor-items-card">
          <div className="field-monitor-items-heading">
            <div>
              <h3>Recorded commodity prices</h3>
              <p>{itemCount} item{itemCount === 1 ? '' : 's'} captured in the finalized record.</p>
            </div>
            {affected.length > 0 && (
              <span className="visit-review-flag">
                <TriangleAlert size={16} aria-hidden="true" />
                {affected.length} item{affected.length === 1 ? ' requires' : 's require'} regulatory review
              </span>
            )}
          </div>
          <div className="admin-table-wrap">
            <table className="admin-data-table visit-items-table">
              <caption className="sr-only">Recorded commodity prices</caption>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Commodity</th>
                  <th scope="col">Applicable reference</th>
                  <th scope="col">Observed price</th>
                  <th scope="col">Difference</th>
                  <th scope="col">Observation</th>
                </tr>
              </thead>
              <tbody>
                {record.items.map((item, index) => (
                  <tr key={item.id} className={item.is_anomaly ? 'is-flagged' : undefined}>
                    <td data-label="#" className="visit-item-index">{index + 1}</td>
                    <td data-label="Commodity">
                      <strong>{commodityName(item)}</strong>
                      {item.bulletin?.unit && <small>{item.bulletin.unit}</small>}
                    </td>
                    <td data-label="Applicable reference"><strong>{money(item.reference_value)}</strong></td>
                    <td data-label="Observed price"><strong className="visit-observed">{money(item.recorded_price)}</strong></td>
                    <td data-label="Difference">{differencePill(item)}</td>
                    <td data-label="Observation">{observationBadge(item)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="visit-items-summary">
            <ChartColumn size={28} className="visit-items-summary-icon" aria-hidden="true" />
            <div className="visit-items-summary-copy">
              <strong>{record.items.length} commodit{record.items.length === 1 ? 'y' : 'ies'} recorded</strong>
              <span>
                {affected.length} flagged for regulatory review
                {tolerated > 0 && ` · ${tolerated} above SRP within the 10% tolerance`}
                {` · ${withReference} within reference`}
                {unavailable > 0 && ` · ${unavailable} reference unavailable`}
              </span>
            </div>
            <dl className="visit-items-stats">
              <div><dt>Total items</dt><dd>{record.items.length}</dd></div>
              <div className="attention"><dt>With observations</dt><dd>{affected.length}</dd></div>
              {tolerated > 0 && <div className="tolerance"><dt>Within tolerance</dt><dd>{tolerated}</dd></div>}
              <div className="compliant"><dt>Within reference</dt><dd>{withReference}</dd></div>
              {unavailable > 0 && <div><dt>Reference unavailable</dt><dd>{unavailable}</dd></div>}
            </dl>
          </div>
        </section>

        {affected.length > 0 && (
          <section className="field-regulatory-review">
            <div className="field-regulatory-review-heading">
              <TriangleAlert size={24} aria-hidden="true" />
              <div>
                <h3>Products requiring regulatory review</h3>
                <p>These observations exceed the captured comparison rule. They are decision support under R.A. 7581 (Philippine Price Act), not automatic legal findings.</p>
              </div>
            </div>
            <ul>
              {affected.map((item) => (
                <li key={item.id}>
                  <div><strong>{commodityName(item)}</strong>{item.bulletin?.unit && <small>{item.bulletin.unit}</small>}</div>
                  <div><strong>{money(item.reference_value)}</strong><small>Reference</small></div>
                  <div><strong>{money(item.recorded_price)}</strong><small>Observed</small></div>
                  <div>{differencePill(item)}</div>
                  <div className="field-regulatory-review-status">{observationBadge(item)}</div>
                </li>
              ))}
            </ul>
            <footer>
              <button type="button" className="admin-button secondary" onClick={onBack}>{backLabel}</button>
              <button type="button" className="admin-button primary" onClick={onRegulatoryAction}>Open Legal Actions</button>
            </footer>
          </section>
        )}
      </div>

      <aside className="visit-review-aside" aria-label="Visit evidence">
        <section className="visit-info-card">
          <h3><ClipboardList size={18} aria-hidden="true" />Visit information</h3>
          <div className="visit-info-grid">
            <div><span>Establishment</span><strong>{record.store.store_name}</strong></div>
            <div><span>Date finalized</span><strong>{formatDate(record.finalized_at)}</strong></div>
          </div>
        </section>
        <section className="visit-info-card">
          <h3><User size={18} aria-hidden="true" />Field personnel</h3>
          <div className="visit-info-grid">
            <div><span>Field officer</span><strong>{record.officer.name}</strong></div>
            <div><span>Email</span><strong className="visit-info-email">{record.officer.email}</strong></div>
          </div>
        </section>
        <section className="visit-info-card">
          <h3><Store size={18} aria-hidden="true" />Store and protocol</h3>
          <div className="visit-info-grid">
            <div>
              <span>Protocol used</span>
              <strong>{record.protocol_mode ? `${record.protocol_mode === 'emergency' ? 'Emergency' : 'Standard'} protocol` : 'Not captured'}</strong>
              {record.protocol_reference && <small>{record.protocol_reference}</small>}
            </div>
            <div><span>Store representative</span><strong>{record.representative_name}</strong></div>
          </div>
        </section>
        <section className="visit-info-card">
          <h3><MapPin size={18} aria-hidden="true" />Location evidence</h3>
          <div className="visit-info-grid">
            <div><span>Coordinates</span><strong>{record.latitude != null && record.longitude != null ? `${Number(record.latitude).toFixed(5)}, ${Number(record.longitude).toFixed(5)}` : 'Unavailable'}</strong></div>
            <div><span>Accuracy</span><strong>{record.location_accuracy_meters != null ? `±${Math.round(Number(record.location_accuracy_meters))} m` : 'Unavailable'}</strong></div>
          </div>
        </section>
      </aside>
    </div>

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

function Pagination({ page, onPage, disabled = false }: { page: { current_page: number; last_page: number; from: number | null; to: number | null; total: number }; onPage: (page: number) => void; disabled?: boolean }) {
  if (page.last_page <= 1) return null
  return <nav className="admin-pagination field-monitor-pagination" aria-label="Field Monitoring pagination"><span>Showing <strong>{page.from ?? 0}–{page.to ?? 0}</strong> of <strong>{page.total}</strong></span><div><button type="button" aria-label="Previous page" disabled={disabled || page.current_page <= 1} onClick={() => onPage(page.current_page - 1)}><ChevronLeft size={16} /></button><strong>Page {page.current_page} of {page.last_page}</strong><button type="button" aria-label="Next page" disabled={disabled || page.current_page >= page.last_page} onClick={() => onPage(page.current_page + 1)}><ChevronRight size={16} /></button></div></nav>
}
