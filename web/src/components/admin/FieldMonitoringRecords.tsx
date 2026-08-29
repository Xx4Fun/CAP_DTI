import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Eye, FileSignature, MapPin, RefreshCw, Search, ShieldCheck, TriangleAlert } from 'lucide-react'
import { adminApi } from '../../services/adminApi'
import type { MonitoringRecordPage, MonitoringRecordRecord } from '../../types/admin'

const emptyPage: MonitoringRecordPage = { data: [], current_page: 1, last_page: 1, per_page: 10, total: 0, from: null, to: null }
const message = (error: unknown) => (error as { response?: { data?: { message?: string } } }).response?.data?.message || 'Accepted monitoring visits could not load.'

export function FieldMonitoringRecords() {
  const [initialParams] = useState(() => new URLSearchParams(window.location.search))
  const [page, setPage] = useState(emptyPage)
  const [pageNumber, setPageNumber] = useState(() => { const value = Number(initialParams.get('page')); return Number.isInteger(value) && value > 0 ? value : 1 })
  const [perPage, setPerPage] = useState<10 | 25 | 50>(() => { const value = Number(initialParams.get('per_page')); return value === 25 || value === 50 ? value : 10 })
  const [anomaly, setAnomaly] = useState<'all' | 'yes' | 'no'>(() => { const value = initialParams.get('anomaly'); return value === 'yes' || value === 'no' ? value : 'all' })
  const [search, setSearch] = useState(() => initialParams.get('search') || '')
  const [query, setQuery] = useState(() => initialParams.get('search') || '')
  const [selected, setSelected] = useState<MonitoringRecordRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const reviewRequest = useRef(0)

  useEffect(() => {
    const value = search.trim()
    if (value === query) return
    const timer = window.setTimeout(() => { setQuery(value); setPageNumber(1) }, 300)
    return () => window.clearTimeout(timer)
  }, [query, search])
  useEffect(() => {
    const url = new URL(window.location.href)
    if (query) url.searchParams.set('search', query); else url.searchParams.delete('search')
    if (anomaly === 'all') url.searchParams.delete('anomaly'); else url.searchParams.set('anomaly', anomaly)
    if (pageNumber === 1) url.searchParams.delete('page'); else url.searchParams.set('page', String(pageNumber))
    if (perPage === 10) url.searchParams.delete('per_page'); else url.searchParams.set('per_page', String(perPage))
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }, [anomaly, pageNumber, perPage, query])
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setPage(await adminApi.getMonitoringRecords({ search: query || undefined, anomaly, page: pageNumber, per_page: perPage })) }
    catch (reason) { setError(message(reason)) }
    finally { setLoading(false) }
  }, [anomaly, pageNumber, perPage, query])
  useEffect(() => { void load() }, [load])

  const review = useCallback(async (id: number) => {
    const request = ++reviewRequest.current
    setError('')
    try {
      const record = await adminApi.getMonitoringRecord(id)
      if (request === reviewRequest.current && Number(new URLSearchParams(window.location.search).get('record')) === id) setSelected(record)
    } catch (reason) { if (request === reviewRequest.current) setError(message(reason)) }
  }, [])
  useEffect(() => {
    const restore = () => {
      const id = Number(new URLSearchParams(window.location.search).get('record'))
      if (Number.isInteger(id) && id > 0) void review(id)
      else { reviewRequest.current += 1; setSelected(null) }
    }
    restore()
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [review])

  const openReview = (id: number) => {
    const url = new URL(window.location.href)
    url.searchParams.set('record', String(id))
    window.history.pushState({ fieldMonitorRecord: true }, '', `${url.pathname}${url.search}${url.hash}`)
    void review(id)
  }
  const closeReview = () => {
    if (window.history.state?.fieldMonitorRecord) window.history.back()
    else {
      const url = new URL(window.location.href)
      url.searchParams.delete('record')
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
      setSelected(null)
    }
  }
  const signature = async (kind: 'officer' | 'representative') => {
    if (!selected) return
    const popup = window.open('', '_blank')
    if (!popup) { setError('The signature could not open because pop-ups are blocked. Allow pop-ups for this Admin site and try again.'); return }
    popup.opener = null
    try {
      const url = URL.createObjectURL(await adminApi.getMonitoringSignature(selected.id, kind))
      popup.location.href = url
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (reason) { popup.close(); setError(message(reason)) }
  }

  if (selected) return <VisitReview record={selected} error={error} onBack={closeReview} onSignature={signature} />

  return <div className="field-monitor-admin">
    <section className="field-monitor-controls" aria-label="Monitoring record filters"><label className="admin-search-field"><Search size={17} /><input type="search" aria-label="Search monitoring visits" placeholder="Search store or officer" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label>Observation<select value={anomaly} onChange={(event) => { setAnomaly(event.target.value as typeof anomaly); setPageNumber(1) }}><option value="all">All visits</option><option value="yes">With observations</option><option value="no">No observations</option></select></label><button type="button" className="admin-button secondary" onClick={() => void load()}><RefreshCw size={16} />Refresh</button></section>
    {error && <div className="admin-feedback error" role="alert">{error}</div>}
    <section className="admin-table-card field-monitor-table-card"><div className="admin-table-wrap"><table className="admin-data-table field-monitor-table"><caption className="sr-only">Accepted field monitoring visits</caption><thead><tr><th>Establishment</th><th>Field officer</th><th>Visit finalized</th><th>Items</th><th>Observations</th><th><span className="sr-only">Action</span></th></tr></thead><tbody>{loading ? Array.from({ length: 5 }, (_, index) => <tr className="admin-skeleton-row" key={index}><td colSpan={6}><span /></td></tr>) : page.data.map((record) => <tr key={record.id}><td data-label="Establishment"><strong>{record.store.store_name}</strong><small>{record.store.address}</small></td><td data-label="Field officer"><strong>{record.officer.name}</strong><small>{record.officer.email}</small></td><td data-label="Visit finalized">{formatDate(record.finalized_at)}</td><td data-label="Items">{record.items_count}</td><td data-label="Observations"><span className={`monitor-observation ${record.anomaly_count ? 'attention' : ''}`}>{record.anomaly_count || 'None'}</span></td><td data-label="Action"><button type="button" className="admin-button secondary field-monitor-review-button" aria-label={`View visit ${record.id}`} onClick={() => openReview(record.id)}><Eye size={16} />View</button></td></tr>)}</tbody></table>{!loading && !page.data.length && <div className="admin-empty-state"><ShieldCheck size={28} /><strong>No accepted visits match</strong><span>Change the search or observation filter.</span></div>}</div>
      <nav className="admin-pagination field-monitor-pagination" aria-label="Monitoring record pagination"><span>Showing {page.from ?? 0}–{page.to ?? 0} of {page.total}</span><div><label>Rows per page<select value={perPage} onChange={(event) => { setPerPage(Number(event.target.value) as typeof perPage); setPageNumber(1) }}><option value="10">10</option><option value="25">25</option><option value="50">50</option></select></label><button type="button" aria-label="Previous monitoring page" disabled={page.current_page <= 1} onClick={() => setPageNumber(page.current_page - 1)}><ChevronLeft size={16} /></button><strong>Page {page.current_page} of {page.last_page}</strong><button type="button" aria-label="Next monitoring page" disabled={page.current_page >= page.last_page} onClick={() => setPageNumber(page.current_page + 1)}><ChevronRight size={16} /></button></div></nav>
    </section>
  </div>
}

function VisitReview({ record, error, onBack, onSignature }: { record: MonitoringRecordRecord; error: string; onBack: () => void; onSignature: (kind: 'officer' | 'representative') => void }) {
  return <article className="field-monitor-review-page">
    <button type="button" className="admin-back-button" onClick={onBack}><ArrowLeft size={17} />Back to Field Monitoring</button>
    {error && <div className="admin-feedback error" role="alert">{error}</div>}
    <header className="field-monitor-review-header"><div><h2>Visit #{record.id}</h2><p>{record.store.store_name} · {formatDate(record.finalized_at)}</p></div><span className="admin-status-badge current"><CheckCircle2 size={13} />Accepted</span></header>
    <section className="monitor-detail-facts" aria-label="Visit evidence"><div><span>Field officer</span><strong>{record.officer.name}</strong><small>{record.officer.email}</small></div><div><span>Store representative</span><strong>{record.representative_name}</strong><small>{record.representative_title || 'Position not supplied'}</small></div><div><span>Location evidence</span><strong>{record.location_accuracy_meters ? `±${Math.round(Number(record.location_accuracy_meters))} m accuracy` : 'Captured'}</strong><small><MapPin size={13} /> Locked at finalization</small></div><div><span>Sync path</span><strong>{record.sync_source === 'offline_queue' ? 'Offline queue' : 'Direct online'}</strong><small>Accepted {formatDate(record.received_at)}</small></div></section>
    <section className="admin-table-card field-monitor-items-card"><div className="field-monitor-items-heading"><div><h3>Recorded commodity prices</h3><p>{record.items_count} item{record.items_count === 1 ? '' : 's'} recorded during this visit.</p></div><div><button type="button" className="admin-button secondary" onClick={() => onSignature('officer')}><FileSignature size={16} />Officer signature</button><button type="button" className="admin-button secondary" onClick={() => onSignature('representative')}><FileSignature size={16} />Representative signature</button></div></div><div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>Commodity</th><th>Reference</th><th>Recorded</th><th>Variance</th><th>Observation</th></tr></thead><tbody>{record.items.map((item) => <tr key={item.id}><td data-label="Commodity"><strong>{item.bulletin?.commodity_name || `SRP #${item.srp_id}`}</strong><small>{item.bulletin?.unit}</small></td><td data-label="Reference">₱{Number(item.baseline_price).toFixed(2)}</td><td data-label="Recorded">₱{Number(item.recorded_price).toFixed(2)}</td><td data-label="Variance">{item.variance_percent == null ? '—' : `${Number(item.variance_percent).toFixed(1)}%`}</td><td data-label="Observation"><span className={`monitor-observation ${item.is_anomaly ? 'attention' : ''}`}>{item.is_anomaly ? <><TriangleAlert size={13} />Above reference</> : 'Within range'}</span></td></tr>)}</tbody></table></div></section>
  </article>
}

function formatDate(value: string) { return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) }
