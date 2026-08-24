import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, ChevronLeft, ChevronRight, Eye, FileSignature, MapPin, RefreshCw, Search, ShieldCheck, TriangleAlert, X } from 'lucide-react'
import { adminApi } from '../../services/adminApi'
import type { MonitoringRecordPage, MonitoringRecordRecord } from '../../types/admin'

const emptyPage: MonitoringRecordPage = { data: [], current_page: 1, last_page: 1, per_page: 10, total: 0, from: null, to: null }
const message = (error: unknown) => (error as { response?: { data?: { message?: string } } }).response?.data?.message || 'Accepted monitoring visits could not load.'

export function FieldMonitoringRecords() {
  const [page, setPage] = useState(emptyPage)
  const [pageNumber, setPageNumber] = useState(1)
  const [perPage, setPerPage] = useState<10 | 25 | 50>(10)
  const [anomaly, setAnomaly] = useState<'all' | 'yes' | 'no'>('all')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<MonitoringRecordRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { const timer = window.setTimeout(() => { setQuery(search.trim()); setPageNumber(1) }, 300); return () => window.clearTimeout(timer) }, [search])
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setPage(await adminApi.getMonitoringRecords({ search: query || undefined, anomaly, page: pageNumber, per_page: perPage })) }
    catch (reason) { setError(message(reason)) }
    finally { setLoading(false) }
  }, [anomaly, pageNumber, perPage, query])
  useEffect(() => { void load() }, [load])

  const review = async (record: MonitoringRecordRecord) => {
    setError('')
    try { setSelected(await adminApi.getMonitoringRecord(record.id)) } catch (reason) { setError(message(reason)) }
  }
  const signature = async (kind: 'officer' | 'representative') => {
    if (!selected) return
    try {
      const url = URL.createObjectURL(await adminApi.getMonitoringSignature(selected.id, kind))
      window.open(url, '_blank', 'noopener,noreferrer')
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (reason) { setError(message(reason)) }
  }

  return <div className="field-monitor-admin">
    <section className="field-monitor-assurance"><ShieldCheck size={22} /><span><strong>Automatic acceptance</strong><small>These records already passed required signatures, GPS accuracy, officer authorization, and server validation. Admin review is observational and read-only.</small></span></section>
    <section className="field-monitor-controls" aria-label="Monitoring record filters"><label className="admin-search-field"><Search size={17} /><input type="search" aria-label="Search monitoring visits" placeholder="Search store or officer" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label>Observation<select value={anomaly} onChange={(event) => { setAnomaly(event.target.value as typeof anomaly); setPageNumber(1) }}><option value="all">All visits</option><option value="yes">With observations</option><option value="no">No observations</option></select></label><button type="button" className="admin-button secondary" onClick={() => void load()}><RefreshCw size={16} />Refresh</button></section>
    {error && <div className="admin-feedback error" role="alert">{error}</div>}
    <section className="admin-table-card field-monitor-table-card"><div className="admin-table-wrap"><table className="admin-data-table field-monitor-table"><caption className="sr-only">Accepted field monitoring visits</caption><thead><tr><th>Establishment</th><th>Field officer</th><th>Visit finalized</th><th>Items</th><th>Observations</th><th>Status</th><th><span className="sr-only">Action</span></th></tr></thead><tbody>{loading ? Array.from({ length: 5 }, (_, index) => <tr className="admin-skeleton-row" key={index}><td colSpan={7}><span /></td></tr>) : page.data.map((record) => <tr key={record.id}><td data-label="Establishment"><strong>{record.store.store_name}</strong><small>{record.store.address}</small></td><td data-label="Field officer"><strong>{record.officer.name}</strong><small>{record.officer.email}</small></td><td data-label="Visit finalized">{formatDate(record.finalized_at)}</td><td data-label="Items">{record.items_count}</td><td data-label="Observations"><span className={`monitor-observation ${record.anomaly_count ? 'attention' : ''}`}>{record.anomaly_count || 'None'}</span></td><td data-label="Status"><span className="admin-status-badge current"><CheckCircle2 size={13} />Accepted</span></td><td data-label="Action"><button type="button" className="admin-icon-button" aria-label={`Review visit ${record.id}`} onClick={() => void review(record)}><Eye size={17} /></button></td></tr>)}</tbody></table>{!loading && !page.data.length && <div className="admin-empty-state"><ShieldCheck size={28} /><strong>No accepted visits match</strong><span>Change the search or observation filter.</span></div>}</div>
      <nav className="admin-pagination field-monitor-pagination" aria-label="Monitoring record pagination"><span>Showing {page.from ?? 0}–{page.to ?? 0} of {page.total}</span><div><label>Rows per page<select value={perPage} onChange={(event) => { setPerPage(Number(event.target.value) as typeof perPage); setPageNumber(1) }}><option value="10">10</option><option value="25">25</option><option value="50">50</option></select></label><button type="button" aria-label="Previous monitoring page" disabled={page.current_page <= 1} onClick={() => setPageNumber(page.current_page - 1)}><ChevronLeft size={16} /></button><strong>Page {page.current_page} of {page.last_page}</strong><button type="button" aria-label="Next monitoring page" disabled={page.current_page >= page.last_page} onClick={() => setPageNumber(page.current_page + 1)}><ChevronRight size={16} /></button></div></nav>
    </section>
    {selected && <div className="admin-modal-backdrop field-monitor-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null) }}><section className="admin-modal field-monitor-detail" role="dialog" aria-modal="true" aria-labelledby="field-monitor-detail-title"><header><div><h2 id="field-monitor-detail-title">Accepted visit #{selected.id}</h2><p>{selected.store.store_name} · {formatDate(selected.finalized_at)}</p></div><button type="button" className="admin-icon-button" aria-label="Close visit review" onClick={() => setSelected(null)}><X size={18} /></button></header><div className="monitor-detail-facts"><div><span>Field officer</span><strong>{selected.officer.name}</strong><small>{selected.officer.email}</small></div><div><span>Store representative</span><strong>{selected.representative_name}</strong><small>{selected.representative_title || 'Position not supplied'}</small></div><div><span>Location evidence</span><strong>{selected.location_accuracy_meters ? `±${Math.round(Number(selected.location_accuracy_meters))} m accuracy` : 'Captured'}</strong><small><MapPin size={13} /> Required during finalization</small></div><div><span>Sync path</span><strong>{selected.sync_source === 'offline_queue' ? 'Offline queue' : 'Direct online'}</strong><small>Accepted {formatDate(selected.received_at)}</small></div></div><div className="monitor-evidence-banner"><CheckCircle2 /><span><strong>Automatic acceptance</strong><small>Evidence validation completed. This view cannot alter the regulatory record.</small></span></div><div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>Commodity</th><th>Reference</th><th>Recorded</th><th>Variance</th><th>Observation</th></tr></thead><tbody>{selected.items.map((item) => <tr key={item.id}><td><strong>{item.bulletin?.commodity_name || `SRP #${item.srp_id}`}</strong><small>{item.bulletin?.unit}</small></td><td>₱{Number(item.baseline_price).toFixed(2)}</td><td>₱{Number(item.recorded_price).toFixed(2)}</td><td>{item.variance_percent == null ? '—' : `${Number(item.variance_percent).toFixed(1)}%`}</td><td><span className={`monitor-observation ${item.is_anomaly ? 'attention' : ''}`}>{item.is_anomaly ? <><TriangleAlert size={13} />Above reference</> : 'Within range'}</span></td></tr>)}</tbody></table></div><footer><button type="button" className="admin-button secondary" onClick={() => void signature('officer')}><FileSignature size={16} />Officer signature</button><button type="button" className="admin-button secondary" onClick={() => void signature('representative')}><FileSignature size={16} />Representative signature</button><button type="button" className="admin-button primary" onClick={() => setSelected(null)}>Done</button></footer></section></div>}
  </div>
}

function formatDate(value: string) { return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) }
