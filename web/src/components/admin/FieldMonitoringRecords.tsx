import { useCallback, useEffect, useState } from 'react'
import {
  ArrowLeft, Building2, CheckCircle2, ChevronLeft, ChevronRight, Eye,
  FileSignature, History, MapPin, RefreshCw, Search, ShieldCheck, TriangleAlert,
} from 'lucide-react'
import { adminApi } from '../../services/adminApi'
import type {
  FieldVerificationRequestPage, MonitoringEstablishmentProfile, MonitoringPriceHistoryPage,
  MonitoringRecordPage, MonitoringRecordRecord, MonitoringWorkspace,
} from '../../types/admin'

type Tab = 'establishments' | 'records' | 'verification'
type EstablishmentStatus = 'all' | 'with_observations' | 'no_observations' | 'awaiting_verification' | 'never_monitored'
type VerificationStatus = 'all' | 'open' | 'claimed' | 'completed' | 'cancelled'

const emptyRecords: MonitoringRecordPage = { data: [], current_page: 1, last_page: 1, per_page: 10, total: 0, from: null, to: null }
const emptyHistory: MonitoringPriceHistoryPage = { ...emptyRecords, data: [] }
const emptyVerification: FieldVerificationRequestPage = { ...emptyRecords, data: [] }
const message = (error: unknown) => (error as { response?: { data?: { message?: string } } }).response?.data?.message || 'Field Monitoring data could not load.'
const formatDate = (value?: string | null) => value ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Not recorded'
const money = (value?: number | string | null) => value === null || value === undefined ? 'Unavailable' : `₱${Number(value).toFixed(2)}`

function initialTab(): Tab {
  const value = new URLSearchParams(window.location.search).get('monitor_tab')
  return value === 'records' || value === 'verification' ? value : 'establishments'
}

export function FieldMonitoringRecords({ onNavigate }: { onNavigate?: (module: 'legal_actions') => void }) {
  const params = new URLSearchParams(window.location.search)
  const [tab, setTab] = useState<Tab>(initialTab)
  const [search, setSearch] = useState(params.get('monitor_search') || '')
  const [query, setQuery] = useState(params.get('monitor_search') || '')
  const [status, setStatus] = useState<EstablishmentStatus>((params.get('monitor_status') as EstablishmentStatus) || 'all')
  const [recordAnomaly, setRecordAnomaly] = useState<'all' | 'yes' | 'no'>((params.get('anomaly') as 'all' | 'yes' | 'no') || 'all')
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>((params.get('verification_status') as VerificationStatus) || 'all')
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
      const value = search.trim()
      setQuery(value)
      const url = new URL(window.location.href)
      if (value) url.searchParams.set('monitor_search', value); else url.searchParams.delete('monitor_search')
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [search])

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
    try { setWorkspace(await adminApi.getMonitoringEstablishments({ search: query || undefined, status, page: establishmentPage, per_page: 10 })) }
    catch (reason) { setError(message(reason)) }
    finally { setLoading(false) }
  }, [establishmentPage, query, status])

  const loadRecords = useCallback(async () => {
    setLoading(true); setError('')
    try { setRecords(await adminApi.getMonitoringRecords({ search: query || undefined, anomaly: recordAnomaly, page: recordPage, per_page: 10 })) }
    catch (reason) { setError(message(reason)) }
    finally { setLoading(false) }
  }, [query, recordAnomaly, recordPage])

  const loadVerification = useCallback(async () => {
    setLoading(true); setError('')
    try { setVerification(await adminApi.getFieldVerificationRequests({ search: query || undefined, status: verificationStatus, page: verificationPage, per_page: 10 })) }
    catch (reason) { setError(message(reason)) }
    finally { setLoading(false) }
  }, [query, verificationPage, verificationStatus])

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
      const recordId = Number(new URLSearchParams(window.location.search).get('record'))
      if (recordId > 0) void fetchRecord(recordId)
      else setSelectedRecord(null)
    }
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [fetchRecord])

  const switchTab = (next: Tab) => {
    setTab(next); setProfile(null); setSelectedRecord(null)
    updateUrl({ monitor_tab: next === 'establishments' ? null : next, store: null, record: null })
  }

  async function openProfile(storeId: number, updateHistory = true) {
    setLoading(true); setError('')
    try {
      const [nextProfile, nextHistory, nextRecords] = await Promise.all([
        adminApi.getMonitoringEstablishment(storeId),
        adminApi.getMonitoringPriceHistory(storeId, { per_page: 10 }),
        adminApi.getMonitoringRecords({ store_id: storeId, anomaly: 'all', per_page: 10 }),
      ])
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
    try { setHistory(await adminApi.getMonitoringPriceHistory(profile.store.id, { page, per_page: 10 })) }
    catch (reason) { setError(message(reason)) }
  }

  const loadProfileRecordsPage = async (page: number) => {
    if (!profile) return
    try { setProfileRecords(await adminApi.getMonitoringRecords({ store_id: profile.store.id, anomaly: 'all', page, per_page: 10 })) }
    catch (reason) { setError(message(reason)) }
  }

  if (selectedRecord) return <VisitReview record={selectedRecord} error={error} onBack={closeDetail} onSignature={async (kind) => {
    const popup = window.open('', '_blank')
    if (!popup) return setError('Allow pop-ups for this Admin site to view signature evidence.')
    popup.opener = null
    try {
      const url = URL.createObjectURL(await adminApi.getMonitoringSignature(selectedRecord.id, kind))
      popup.location.href = url
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (reason) { popup.close(); setError(message(reason)) }
  }} onRegulatoryAction={() => {
    const url = new URL(window.location.href)
    url.searchParams.set('source_record', String(selectedRecord.id))
    url.searchParams.set('source_store', String(selectedRecord.store.id))
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
    onNavigate?.('legal_actions')
  }} />

  if (profile) return <EstablishmentProfile profile={profile} history={history} records={profileRecords} error={error} onBack={() => {
    setProfile(null)
    updateUrl({ store: null })
  }} onOpenRecord={openRecord} onHistoryPage={loadProfileHistoryPage} onRecordsPage={loadProfileRecordsPage} />

  return <div className="field-monitor-admin">
    <div className="field-monitor-tabs" role="tablist" aria-label="Field Monitoring workspace">
      <button type="button" role="tab" aria-selected={tab === 'establishments'} onClick={() => switchTab('establishments')}><Building2 size={16} />Establishments</button>
      <button type="button" role="tab" aria-selected={tab === 'records'} onClick={() => switchTab('records')}><History size={16} />Monitoring Records</button>
      <button type="button" role="tab" aria-selected={tab === 'verification'} onClick={() => switchTab('verification')}><ShieldCheck size={16} />Verification Requests</button>
    </div>
    {error && <div className="admin-feedback error" role="alert">{error}</div>}
    {tab === 'establishments' && <EstablishmentsView workspace={workspace} loading={loading} search={search} status={status}
      onSearch={(value) => { setSearch(value); setEstablishmentPage(1) }} onStatus={(value) => { setStatus(value); setEstablishmentPage(1); updateUrl({ monitor_status: value === 'all' ? null : value }) }}
      onRefresh={loadEstablishments} onOpen={openProfile} onPage={setEstablishmentPage} />}
    {tab === 'records' && <RecordsView page={records} loading={loading} search={search} anomaly={recordAnomaly}
      onSearch={(value) => { setSearch(value); setRecordPage(1) }} onAnomaly={(value) => { setRecordAnomaly(value); setRecordPage(1); updateUrl({ anomaly: value === 'all' ? null : value }) }}
      onRefresh={loadRecords} onOpen={openRecord} onPage={setRecordPage} />}
    {tab === 'verification' && <VerificationView page={verification} loading={loading} search={search} status={verificationStatus}
      onSearch={(value) => { setSearch(value); setVerificationPage(1) }} onStatus={(value) => { setVerificationStatus(value); setVerificationPage(1); updateUrl({ verification_status: value === 'all' ? null : value }) }}
      onRefresh={loadVerification} onOpenRecord={openRecord} onPage={setVerificationPage}
      onCancel={async (id) => { await adminApi.cancelFieldVerification(id); await loadVerification() }}
      onReopen={async (id) => { await adminApi.reopenFieldVerification(id); await loadVerification() }} />}
  </div>
}

function EstablishmentsView({ workspace, loading, search, status, onSearch, onStatus, onRefresh, onOpen, onPage }: {
  workspace: MonitoringWorkspace | null; loading: boolean; search: string; status: EstablishmentStatus
  onSearch: (value: string) => void; onStatus: (value: EstablishmentStatus) => void; onRefresh: () => void; onOpen: (id: number) => void; onPage: (page: number) => void
}) {
  const summary = workspace?.summary
  const cards = [
    ['Monitored establishments', summary?.monitored_establishments ?? 0, 'all' as EstablishmentStatus],
    ['Monitoring activity · 30 days', summary?.recent_activity ?? 0, 'all' as EstablishmentStatus],
    ['Records with observations', summary?.records_with_observations ?? 0, 'with_observations' as EstablishmentStatus],
    ['Awaiting field verification', summary?.open_verification_requests ?? 0, 'awaiting_verification' as EstablishmentStatus],
  ] as const
  return <>
    <section className="field-monitor-summary" aria-label="Field Monitoring overview">
      {cards.map(([label, value, filter]) => <button type="button" key={label} onClick={() => onStatus(filter)}><span>{label}</span><strong>{value}</strong></button>)}
      <div><span>Latest completed monitoring</span><strong className="summary-date">{formatDate(summary?.latest_completed_at)}</strong></div>
    </section>
    <section className="field-monitor-controls" aria-label="Establishment filters">
      <label className="admin-search-field"><Search size={17} /><input type="search" aria-label="Search establishments" placeholder="Search establishment, address or registration" value={search} onChange={(event) => onSearch(event.target.value)} /></label>
      <label>Monitoring status<select aria-label="Monitoring status" value={status} onChange={(event) => onStatus(event.target.value as EstablishmentStatus)}>
        <option value="all">All establishments</option><option value="with_observations">With observations</option><option value="no_observations">No observations</option><option value="awaiting_verification">Awaiting verification</option><option value="never_monitored">Never monitored</option>
      </select></label>
      <button type="button" className="admin-button secondary" onClick={onRefresh}><RefreshCw size={16} />Refresh</button>
    </section>
    <section className="admin-table-card field-monitor-table-card"><div className="admin-table-wrap">
      <table className="admin-data-table field-monitor-table"><caption className="sr-only">Monitoring establishments</caption>
        <thead><tr><th>Establishment</th><th>Latest monitoring</th><th>Latest result</th><th>Records</th><th>Verification</th><th><span className="sr-only">Action</span></th></tr></thead>
        <tbody>{loading && !workspace ? <Skeleton columns={6} /> : workspace?.establishments.data.map((store) => <tr key={store.id}>
          <td data-label="Establishment"><strong>{store.store_name}</strong><small>{store.address}</small></td>
          <td data-label="Latest monitoring">{formatDate(store.latest_monitoring_at)}</td>
          <td data-label="Latest result"><Observation value={store.latest_result} /></td>
          <td data-label="Records">{store.completed_records_count}</td>
          <td data-label="Verification">{store.open_verification_requests_count || 'None'}</td>
          <td data-label="Action"><button type="button" className="admin-button secondary" aria-label={`Open ${store.store_name} monitoring profile`} onClick={() => onOpen(store.id)}><Eye size={16} />Open</button></td>
        </tr>)}</tbody>
      </table>
      {!loading && !workspace?.establishments.data.length && <Empty text="No establishments match these filters." />}
    </div></section>
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

function RecordTable({ page, loading, onOpen }: { page: MonitoringRecordPage; loading: boolean; onOpen: (id: number) => void }) {
  return <section className="admin-table-card field-monitor-table-card"><div className="admin-table-wrap">
    <table className="admin-data-table field-monitor-table"><caption className="sr-only">Accepted field monitoring visits</caption><thead><tr><th>Establishment</th><th>Field officer</th><th>Visit finalized</th><th>Items</th><th>Observations</th><th><span className="sr-only">Action</span></th></tr></thead>
      <tbody>{loading ? <Skeleton columns={6} /> : page.data.map((record) => <tr key={record.id}><td data-label="Establishment"><strong>{record.store.store_name}</strong><small>{record.store.address}</small></td><td data-label="Field officer"><strong>{record.officer.name}</strong><small>{record.officer.email}</small></td><td data-label="Visit finalized">{formatDate(record.finalized_at)}</td><td data-label="Items">{record.items_count}</td><td data-label="Observations"><span className={`monitor-observation ${record.anomaly_count ? 'attention' : ''}`}>{record.anomaly_count || 'None'}</span></td><td data-label="Action"><button type="button" className="admin-button secondary field-monitor-review-button" aria-label={`View visit ${record.id}`} onClick={() => onOpen(record.id)}><Eye size={16} />View</button></td></tr>)}</tbody>
    </table>{!loading && !page.data.length && <Empty text="No accepted visits match." />}
  </div></section>
}

function VerificationView({ page, loading, search, status, onSearch, onStatus, onRefresh, onOpenRecord, onPage, onCancel, onReopen }: {
  page: FieldVerificationRequestPage; loading: boolean; search: string; status: VerificationStatus
  onSearch: (value: string) => void; onStatus: (value: VerificationStatus) => void; onRefresh: () => void; onOpenRecord: (id: number) => void; onPage: (page: number) => void; onCancel: (id: number) => void; onReopen: (id: number) => void
}) {
  return <>
    <section className="field-monitor-controls" aria-label="Verification request filters">
      <label className="admin-search-field"><Search size={17} /><input type="search" aria-label="Search verification requests" placeholder="Search establishment or report" value={search} onChange={(event) => onSearch(event.target.value)} /></label>
      <label>Status<select aria-label="Verification status" value={status} onChange={(event) => onStatus(event.target.value as VerificationStatus)}><option value="all">All requests</option><option value="open">Open</option><option value="claimed">Claimed</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label>
      <button type="button" className="admin-button secondary" onClick={onRefresh}><RefreshCw size={16} />Refresh</button>
    </section>
    <section className="admin-table-card"><div className="admin-table-wrap"><table className="admin-data-table"><caption className="sr-only">Field verification requests</caption>
      <thead><tr><th>Establishment</th><th>Source report</th><th>Reason</th><th>Requested</th><th>Status</th><th>Assigned officer</th><th>Result</th></tr></thead>
      <tbody>{loading ? <Skeleton columns={7} /> : page.data.map((request) => <tr key={request.id}><td data-label="Establishment"><strong>{request.store.store_name}</strong><small>{request.store.address}</small></td><td data-label="Source report">{request.report.report_reference}</td><td data-label="Reason">{request.reason}</td><td data-label="Requested">{formatDate(request.requested_at)}</td><td data-label="Status"><span className="admin-status-badge current">{request.status}</span></td><td data-label="Assigned officer">{request.claimant?.name || 'Unassigned'}</td><td data-label="Result">{request.monitoring_record ? <button type="button" className="admin-button secondary" aria-label={`Open monitoring record ${request.monitoring_record.id}`} onClick={() => onOpenRecord(request.monitoring_record!.id)}>Record #{request.monitoring_record.id}</button> : request.status === 'cancelled' ? <button type="button" className="admin-button secondary" onClick={() => onReopen(request.id)}>Reopen</button> : request.status === 'open' ? <button type="button" className="admin-button secondary" onClick={() => onCancel(request.id)}>Cancel</button> : 'Pending'}</td></tr>)}</tbody>
    </table>{!loading && !page.data.length && <Empty text="No verification requests match." />}</div></section>
    <Pagination page={page} onPage={onPage} />
  </>
}

function EstablishmentProfile({ profile, history, records, error, onBack, onOpenRecord, onHistoryPage, onRecordsPage }: {
  profile: MonitoringEstablishmentProfile; history: MonitoringPriceHistoryPage; records: MonitoringRecordPage; error: string; onBack: () => void; onOpenRecord: (id: number) => void; onHistoryPage: (page: number) => void; onRecordsPage: (page: number) => void
}) {
  const latest = profile.latest_record
  return <article className="field-monitor-profile">
    <button type="button" className="admin-back-button" onClick={onBack}><ArrowLeft size={17} />Back to establishments</button>
    {error && <div className="admin-feedback error" role="alert">{error}</div>}
    <header><div><h2>{profile.store.store_name}</h2><p>{profile.store.address} · {profile.store.dti_sec_number || 'Registration not supplied'}</p></div><span className={`admin-status-badge ${profile.store.is_active ? 'current' : 'history'}`}>{profile.store.is_active ? 'Operating' : 'Inactive'}</span></header>
    <section className="monitor-detail-facts" aria-label="Establishment monitoring summary">
      <div><span>Latest monitoring</span><strong>{formatDate(latest?.finalized_at)}</strong></div>
      <div><span>Latest result</span><strong>{latest ? (latest.anomaly_count ? 'With observations' : 'No observations') : 'Never monitored'}</strong></div>
      <div><span>Current protocol</span><strong>{latest?.protocol_mode ? `${latest.protocol_mode === 'emergency' ? 'Emergency' : 'Standard'} protocol` : 'Not captured'}</strong><small>{latest?.protocol_reference || ''}</small></div>
      <div><span>Completed records</span><strong>{profile.completed_records_count}</strong><small>{profile.records_with_observations_count} with observations</small></div>
      <div><span>Field verification</span><strong>{profile.open_verification_requests_count || 'None open'}</strong></div>
      <div><span>Latest record</span><strong>{latest ? `Visit #${latest.id}` : 'None'}</strong>{latest && <button type="button" className="text-button" onClick={() => onOpenRecord(latest.id)}>Open record</button>}</div>
    </section>
    <section className="admin-table-card"><div className="field-monitor-items-heading"><div><h3>Price History</h3><p>Captured references remain tied to their monitoring date.</p></div></div><div className="admin-table-wrap">
      <table className="admin-data-table"><caption className="sr-only">Temporal price history</caption><thead><tr><th>Monitoring date</th><th>Product</th><th>Applicable reference</th><th>Observed price</th><th>Difference</th><th>Observation</th></tr></thead>
        <tbody>{history.data.map((row) => <tr key={row.id}><td data-label="Monitoring date">{formatDate(row.monitoring_date)}</td><td data-label="Product"><strong>{row.commodity_name || 'Commodity unavailable'}</strong><small>{row.unit}</small></td><td data-label="Applicable reference"><strong>{money(row.reference_value)}</strong><small>{row.reference_label || 'Reference unavailable'}{row.reference_effective_date ? ` · ${row.reference_effective_date}` : ''}</small></td><td data-label="Observed price">{money(row.recorded_price)}</td><td data-label="Difference">{row.difference === null ? 'Unavailable' : `${Number(row.difference) > 0 ? '+' : ''}${money(row.difference)}`}</td><td data-label="Observation"><Observation value={row.is_anomaly ? 'with_observations' : 'no_observations'} /></td></tr>)}</tbody>
      </table>{!history.data.length && <Empty text="No temporal price history is available." />}</div></section>
    <Pagination page={history} onPage={onHistoryPage} />
    <div className="field-profile-records"><h3>Monitoring Records</h3><RecordTable page={records} loading={false} onOpen={onOpenRecord} /><Pagination page={records} onPage={onRecordsPage} /></div>
  </article>
}

function VisitReview({ record, error, onBack, onSignature, onRegulatoryAction }: {
  record: MonitoringRecordRecord; error: string; onBack: () => void; onSignature: (kind: 'officer' | 'representative') => void; onRegulatoryAction: () => void
}) {
  const affected = record.items.filter((item) => item.is_anomaly)
  return <article className="field-monitor-review-page">
    <button type="button" className="admin-back-button" onClick={onBack}><ArrowLeft size={17} />Back to Field Monitoring</button>
    {error && <div className="admin-feedback error" role="alert">{error}</div>}
    <header className="field-monitor-review-header"><div><h2>Visit #{record.id}</h2><p>{record.store.store_name} · {formatDate(record.finalized_at)}</p></div><span className="admin-status-badge current"><CheckCircle2 size={13} />Accepted · View only</span></header>
    <section className="monitor-detail-facts" aria-label="Visit evidence">
      <div><span>Field officer</span><strong>{record.officer.name}</strong><small>{record.officer.email}</small></div>
      <div><span>Protocol used</span><strong>{record.protocol_mode ? `${record.protocol_mode === 'emergency' ? 'Emergency' : 'Standard'} protocol` : 'Not captured'}</strong><small>{record.protocol_reference || ''}</small></div>
      <div><span>Store representative</span><strong>{record.representative_name}</strong><small>{record.representative_title || 'Position not supplied'}</small></div>
      <div><span>Location evidence</span><strong>{record.latitude != null && record.longitude != null ? `${Number(record.latitude).toFixed(5)}, ${Number(record.longitude).toFixed(5)}` : 'Unavailable'}</strong><small><MapPin size={13} />{record.location_accuracy_meters != null ? `±${Math.round(Number(record.location_accuracy_meters))} m` : 'Accuracy unavailable'}</small></div>
      <div><span>Synchronization</span><strong>{record.sync_source === 'offline_queue' ? 'Offline queue' : 'Direct online'}</strong><small>Received {formatDate(record.received_at)}</small></div>
      <div><span>Source request</span><strong>{record.verification_request ? `Request #${record.verification_request.id}` : 'Routine monitoring'}</strong><small>{record.verification_request?.report?.report_reference || ''}</small></div>
    </section>
    <section className="admin-table-card field-monitor-items-card"><div className="field-monitor-items-heading"><div><h3>Recorded commodity prices</h3><p>{record.items_count} item{record.items_count === 1 ? '' : 's'} captured in the finalized record.</p></div><div><button type="button" className="admin-button secondary" onClick={() => onSignature('officer')}><FileSignature size={16} />Officer signature</button><button type="button" className="admin-button secondary" onClick={() => onSignature('representative')}><FileSignature size={16} />Representative signature</button></div></div><div className="admin-table-wrap">
      <table className="admin-data-table"><caption className="sr-only">Recorded commodity prices</caption><thead><tr><th>Commodity</th><th>Applicable reference</th><th>Observed</th><th>Difference</th><th>Observation</th></tr></thead><tbody>{record.items.map((item) => {
        const difference = item.reference_value === null || item.reference_value === undefined ? null : Number(item.recorded_price) - Number(item.reference_value)
        return <tr key={item.id}><td data-label="Commodity"><strong>{item.bulletin?.commodity_name || `SRP #${item.srp_id}`}</strong><small>{item.bulletin?.unit}</small></td><td data-label="Applicable reference"><strong>{money(item.reference_value)}</strong><small>{item.reference_label || 'Reference unavailable'}{item.reference_effective_date ? ` · ${item.reference_effective_date}` : ''}</small></td><td data-label="Observed">{money(item.recorded_price)}</td><td data-label="Difference">{difference === null ? 'Unavailable' : `${difference > 0 ? '+' : ''}${money(difference)}`}</td><td data-label="Observation"><Observation value={item.is_anomaly ? 'with_observations' : 'no_observations'} /></td></tr>
      })}</tbody></table>
    </div></section>
    {affected.length > 0 && <section className="field-regulatory-review"><div><TriangleAlert size={20} /><div><h3>Products requiring regulatory review</h3><p>These observations exceed the captured comparison rule. They are decision support, not automatic legal findings.</p></div></div>
      <ul>{affected.map((item) => <li key={item.id}><strong>{item.bulletin?.commodity_name || `SRP #${item.srp_id}`}</strong><span>{money(item.recorded_price)} observed · {money(item.reference_value)} reference</span></li>)}</ul>
      <footer><button type="button" className="admin-button secondary" onClick={onBack}>No regulatory action required</button><button type="button" className="admin-button primary" onClick={onRegulatoryAction}>Proceed to Regulatory Action</button></footer>
    </section>}
  </article>
}

function Observation({ value }: { value: 'with_observations' | 'no_observations' | 'never_monitored' }) {
  if (value === 'never_monitored') return <span className="monitor-observation">Never monitored</span>
  return <span className={`monitor-observation ${value === 'with_observations' ? 'attention' : ''}`}>{value === 'with_observations' ? <><TriangleAlert size={13} />With observations</> : 'No observations'}</span>
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
