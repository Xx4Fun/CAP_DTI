import { CurrentRepresentativeDetails } from './CurrentRepresentativeDetails'
import React, { useState, useEffect } from 'react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js'
import type { ConsumerReportRecord, LegalNoticeRecord, StoreRecord } from '../../types/admin'
import { getStoreStatusInfo, reviewThreshold } from './storeMapUtils'
import { adminApi } from '../../services/adminApi'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

export interface StoreDetailOverlayProps {
  store: StoreRecord
  onClose: () => void
  onCenterMap: () => void
  /** Opens the notice in Legal Actions; omitted where navigation is unavailable. */
  onOpenNotice?: (noticeId: number) => void
}

type TabType = 'overview' | 'trends' | 'legal' | 'complaints'

type TrendRow = {
  date: string
  price: number | string
  srp: number | string | null
  source: string
  reference_type?: string | null
  commodity_key?: string | null
  commodity_name?: string | null
}

const UNIDENTIFIED_COMMODITY = '__unidentified__'

type PageResult<T> = { rows: T[]; page: number; lastPage: number; total: number }
type PagedState<T> = PageResult<T> & { loading: boolean; error: boolean }
type StorePages<T> = PagedState<T> & { loadMore: () => void }

const loadReports = (storeId: number, page: number): Promise<PageResult<ConsumerReportRecord>> =>
  adminApi.getReportPage({ page, per_page: 20, store_id: storeId })
    .then((r) => ({ rows: r.data, page: r.meta.current_page, lastPage: r.meta.last_page, total: r.meta.total }))

const loadNotices = (storeId: number, page: number): Promise<PageResult<LegalNoticeRecord>> =>
  adminApi.getLegalNotices({ store_id: storeId, page })
    .then((r) => ({ rows: r.data, page: r.current_page, lastPage: r.last_page, total: r.total }))

// One store per mount (StoreManager keys the overlay by store id); "Load more" appends the next page.
function useStorePages<T>(storeId: number, load: (storeId: number, page: number) => Promise<PageResult<T>>): StorePages<T> {
  const [state, setState] = useState<PagedState<T>>({ rows: [], page: 0, lastPage: 1, total: 0, loading: true, error: false })
  // n forces a refetch when a failed page is requested again.
  const [request, setRequest] = useState({ page: 1, n: 0 })

  useEffect(() => {
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: false }))
    load(storeId, request.page).then((r) => {
      if (!cancelled) setState((s) => ({ ...r, rows: request.page === 1 ? r.rows : [...s.rows, ...r.rows], loading: false, error: false }))
    }).catch(() => {
      if (!cancelled) setState((s) => ({ ...s, loading: false, error: true }))
    })
    return () => { cancelled = true }
  }, [storeId, load, request])

  return { ...state, loadMore: () => setRequest((r) => ({ page: state.page + 1, n: r.n + 1 })) }
}

const formatDay = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'

const noticeDates = (notice: LegalNoticeRecord) => {
  const parts = [
    notice.issued_at && `Issued ${formatDay(notice.issued_at)}`,
    notice.cancelled_at && `Cancelled ${formatDay(notice.cancelled_at)}`,
    notice.closed_at && `Closed ${formatDay(notice.closed_at)}`,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : `Updated ${formatDay(notice.updated_at)}`
}

const panelText: React.CSSProperties = { padding: '1rem', color: '#64748b', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.8rem' }
const errorText: React.CSSProperties = { ...panelText, color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca' }
const rowCard: React.CSSProperties = { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.6rem 0.75rem', fontSize: '0.78rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '0.2rem' }

function PagedList<T>({ list, empty, failed, render }: {
  list: StorePages<T>
  empty: string
  failed: string
  render: (row: T) => React.ReactNode
}) {
  return (
    <>
      {list.rows.map(render)}
      {list.loading && <div role="status" style={panelText}>Loading…</div>}
      {list.error && <div role="alert" style={errorText}>{failed}</div>}
      {!list.loading && !list.error && list.rows.length === 0 && <div role="status" style={panelText}>{empty}</div>}
      {!list.loading && list.page > 0 && list.page < list.lastPage && (
        <button type="button" onClick={list.loadMore} style={{ padding: '0.45rem', borderRadius: '8px', border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1e3a8a', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>
          Load more
        </button>
      )}
    </>
  )
}

export const StoreDetailOverlay: React.FC<StoreDetailOverlayProps> = ({
  store,
  onClose,
  onCenterMap,
  onOpenNotice,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [trendRows, setTrendRows] = useState<TrendRow[]>([])
  const [loadingAnalytics, setLoadingAnalytics] = useState(true)
  const [analyticsError, setAnalyticsError] = useState(false)
  const [selectedCommodity, setSelectedCommodity] = useState('')
  const [weeks, setWeeks] = useState<4 | 12 | 26>(4)
  const statusInfo = getStoreStatusInfo(store)
  const storeId = store.id
  const reports = useStorePages(storeId, loadReports)
  const notices = useStorePages(storeId, loadNotices)

  useEffect(() => {
    let cancelled = false
    setLoadingAnalytics(true)
    setAnalyticsError(false)
    // Rows belong to the range they were loaded for: a slow or failed reload must not leave the old chart under the new heading.
    setTrendRows([])
    // No commodity filter: every commodity this store has data for, so the tab can offer a choice.
    adminApi.getAnalytics(storeId, undefined, weeks).then((res: any) => {
      if (cancelled) return
      setTrendRows(res?.table_rows ?? [])
      setLoadingAnalytics(false)
    }).catch(() => {
      if (cancelled) return
      setAnalyticsError(true)
      setLoadingAnalytics(false)
    })
    return () => { cancelled = true }
  }, [storeId, weeks])

  const recidivism = store.recidivism_index || 0

  // A finding whose bulletin was later deleted has no commodity; keep it visible in its own group.
  const keyOf = (r: TrendRow) => r.commodity_key || UNIDENTIFIED_COMMODITY
  const commodityOptions = [...new Map(
    trendRows.map((r) => [keyOf(r), r.commodity_key ? r.commodity_name || r.commodity_key : 'Unidentified commodity']),
  )]
  // A commodity chosen in a wider range may be absent from a narrower one; fall back to one that has data.
  const commodityKey = commodityOptions.some(([key]) => key === selectedCommodity) ? selectedCommodity : commodityOptions[0]?.[0] || ''
  const activeRows = trendRows.filter((r) => keyOf(r) === commodityKey)
  const labels = activeRows.map((r) => r.date)
  const priceSeries = activeRows.map((r) => Number(r.price))
  const srpSeries = activeRows.map((r) => (r.srp ? Number(r.srp) : null))
  const thresholdSeries = activeRows.map((r) => reviewThreshold(r))

  const chartData =
    activeRows.length > 0
      ? {
          labels,
          datasets: [
            {
              // Receipts and field inspections both feed this series; the tooltip names each point's source.
              label: 'Observed price',
              data: priceSeries,
              borderColor: recidivism > 0 ? '#dc2626' : '#d97706',
              backgroundColor: 'rgba(217, 119, 6, 0.1)',
              borderWidth: 2,
              tension: 0.3,
            },
            {
              label: 'Review threshold',
              data: thresholdSeries,
              borderColor: '#eab308',
              borderDash: [4, 4],
              borderWidth: 1.5,
            },
            {
              label: 'Reference price',
              data: srpSeries,
              borderColor: '#1d4ed8',
              borderDash: [6, 4],
              borderWidth: 2,
            },
          ],
        }
      : null

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { grid: { color: '#e2e8f0' }, ticks: { color: '#64748b', font: { size: 10 } } },
      y: {
        grid: { color: '#e2e8f0' },
        ticks: { color: '#64748b', font: { size: 10 }, callback: (v: any) => `₱${Number(v).toFixed(0)}` },
      },
    },
    plugins: {
      legend: { display: true, position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } },
      tooltip: {
        callbacks: {
          afterLabel: (ctx: any) => (ctx.datasetIndex === 0 ? `Source: ${activeRows[ctx.dataIndex]?.source ?? '—'}` : ''),
        },
      },
    },
  }

  const count = (list: { loading: boolean; error: boolean; total: number }) => (list.error ? '—' : list.loading && list.total === 0 ? '…' : String(list.total))

  return (
    <div
      className="store-detail-overlay"
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: '#ffffff',
      }}
    >
      {/* Top Store Photo Banner Header */}
      <div style={{ position: 'relative', width: '100%', height: '140px', background: '#e2e8f0', flexShrink: 0, overflow: 'hidden' }}>
        <img
          src={store.image_path || '/stores/store.webp'}
          alt={`${store.store_name} establishment`}
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }}
          onError={(event) => {
            const image = event.currentTarget
            if (image.getAttribute('src') !== '/stores/store.webp') image.src = '/stores/store.webp'
            else image.style.display = 'none'
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to top, rgba(15, 23, 42, 0.82), rgba(15, 23, 42, 0.08) 75%)',
            pointerEvents: 'none',
          }}
        />

        {/* Close Button Top Right */}
        <button
          type="button"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: 'rgba(15, 23, 42, 0.5)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 10,
          }}
          title="Close detail overlay"
        >
          <i className="fa-solid fa-xmark" aria-hidden="true" />
        </button>

        {/* Store Title inside Banner Bottom */}
        <div style={{ position: 'absolute', bottom: '12px', left: '14px', right: '14px', zIndex: 5 }}>
          <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#ffffff', textShadow: '0 2px 4px rgba(0,0,0,0.3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {store.store_name}
          </h2>
        </div>
      </div>

      {/* Navigation Tabs Bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#ffffff', flexShrink: 0 }}>
        {[
          { id: 'overview', label: 'Overview', icon: 'fa-circle-info' },
          { id: 'trends', label: 'Price Trends', icon: 'fa-chart-line' },
          { id: 'legal', label: 'Legal Audit', icon: 'fa-scale-balanced' },
          { id: 'complaints', label: 'Tips Log', icon: 'fa-receipt' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as TabType)}
            style={{
              flex: 1,
              padding: '0.65rem 0.3rem',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2.5px solid #1d4ed8' : '2.5px solid transparent',
              background: activeTab === tab.id ? '#eff6ff' : 'transparent',
              color: activeTab === tab.id ? '#1d4ed8' : '#64748b',
              fontSize: '0.75rem',
              fontWeight: activeTab === tab.id ? 700 : 500,
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.2rem',
              transition: 'all 0.15s ease',
            }}
          >
            <i className={`fa-solid ${tab.icon}`} aria-hidden="true" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Scrollable Tab Content Viewport */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', background: '#ffffff', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {/* Tab 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {/* Quick Action Button Row */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={onCenterMap}
                style={{
                  flex: 1,
                  padding: '0.45rem 0.75rem',
                  borderRadius: '8px',
                  border: '1px solid #1d4ed8',
                  background: '#1d4ed8',
                  color: '#ffffff',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                  boxShadow: '0 2px 6px rgba(29, 78, 216, 0.2)',
                }}
              >
                <i className="fa-solid fa-crosshairs" aria-hidden="true" /> Center Map
              </button>
            </div>

            {/* Location & Registration Details Card */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.85rem' }}>
              <h4 style={{ margin: '0 0 0.6rem', fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                📍 Location & Registration Details
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.8rem', color: '#475569' }}>
                <div>
                  <strong style={{ color: '#0f172a' }}>DTI SEC #:</strong>{' '}
                  <span style={{ fontFamily: 'monospace', color: '#1e3a8a', fontWeight: 700 }}>
                    {store.dti_sec_number || 'N/A'}
                  </span>
                </div>
                <div>
                  <strong style={{ color: '#0f172a' }}>Registered Owner:</strong> {store.owner_name || 'N/A'}
                </div>
                <CurrentRepresentativeDetails representative={store.current_representative} />
                <div>
                  <strong style={{ color: '#0f172a' }}>Address:</strong> {store.address}
                </div>
                <div>
                  <strong style={{ color: '#0f172a' }}>GIS Coordinates:</strong>{' '}
                  <span style={{ fontFamily: 'monospace', background: '#e2e8f0', padding: '1px 6px', borderRadius: '4px', fontSize: '0.75rem' }}>
                    {Number(store.latitude).toFixed(6)}, {Number(store.longitude).toFixed(6)}
                  </span>
                </div>
                <div>
                  <strong style={{ color: '#0f172a' }}>Regulatory Status:</strong>{' '}
                  <span style={{ fontWeight: 700, color: store.is_active ? '#059669' : '#dc2626' }}>
                    {store.is_active ? 'Active Operation' : 'Suspended'}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.85rem' }}>
              <h4 style={{ margin: '0 0 0.6rem', fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                🛡️ Regulatory Scorecard
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.65rem' }}>
                  <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Compliance Assessment</span>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: statusInfo.color, marginTop: '0.2rem' }}>
                    {statusInfo.label}
                  </div>
                </div>
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.65rem' }}>
                  <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Verification Status</span>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: store.is_verified ? '#059669' : '#d97706', marginTop: '0.2rem' }}>
                    {store.is_verified ? 'Verified DTI Node' : 'Pending Audit'}
                  </div>
                </div>
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.65rem' }}>
                  <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Reports in review queue</span>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', marginTop: '0.2rem' }}>{count(reports)}</div>
                </div>
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.65rem' }}>
                  <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Legal notices</span>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', marginTop: '0.2rem' }}>{count(notices)}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: PRICE TRENDS */}
        {activeTab === 'trends' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>
                {weeks}-Week Price History
              </h4>
              <span style={{ fontSize: '0.72rem', color: '#1d4ed8', fontWeight: 600, background: '#eff6ff', padding: '0.2rem 0.5rem', borderRadius: '6px' }}>
                Temporal Matrix
              </span>
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>
              Range
              <select
                value={weeks}
                onChange={(e) => setWeeks(Number(e.target.value) as 4 | 12 | 26)}
                style={{ minHeight: '44px', padding: '0.4rem 0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.8rem', color: '#0f172a', background: '#ffffff' }}
              >
                {[4, 12, 26].map((option) => <option key={option} value={option}>Last {option} weeks</option>)}
              </select>
            </label>

            {!loadingAnalytics && commodityOptions.length > 0 && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>
                Commodity
                <select
                  value={commodityKey}
                  onChange={(e) => setSelectedCommodity(e.target.value)}
                  style={{ padding: '0.4rem 0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.8rem', color: '#0f172a', background: '#ffffff' }}
                >
                  {commodityOptions.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
                </select>
              </label>
            )}

            {loadingAnalytics && (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', fontSize: '0.82rem' }}>
                Loading store price history...
              </div>
            )}

            {!loadingAnalytics && !analyticsError && chartData && (
              <div style={{ height: '200px', width: '100%', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.5rem' }}>
                <Line data={chartData} options={chartOptions as any} />
              </div>
            )}

            {analyticsError && (
              <div role="alert" style={errorText}>Price history could not be loaded.</div>
            )}

            {!loadingAnalytics && !analyticsError && !chartData && (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.8rem' }}>
                No temporal price records available for this establishment.
              </div>
            )}
          </div>
        )}

        {/* Tab 3: LEGAL AUDIT */}
        {activeTab === 'legal' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>
              Legal Notice & Action History{!notices.error && notices.page > 0 ? ` (${notices.total})` : ''}
            </h4>

            <PagedList
              list={notices}
              empty="No authoritative legal action records are available for this establishment."
              failed="Legal notices could not be loaded."
              render={(notice) => (
                <div key={notice.id} style={rowCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <strong style={{ color: '#0f172a' }}>{notice.notice_type} · {notice.control_number ?? 'Draft'}</strong>
                    <span style={{ fontWeight: 700, textTransform: 'capitalize' }}>{notice.status.replace(/_/g, ' ')}</span>
                  </div>
                  <span>{noticeDates(notice)}</span>
                  {onOpenNotice && <button type="button" className="text-button" style={{ justifySelf: 'start', minHeight: '44px' }} onClick={() => onOpenNotice(notice.id)}>Open in Legal Actions</button>}
                </div>
              )}
            />
          </div>
        )}

        {/* Tab 4: COMPLAINTS */}
        {activeTab === 'complaints' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>
              Consumer reports in DTI review queue{!reports.error && reports.page > 0 ? ` (${reports.total})` : ''}
            </h4>

            <PagedList
              list={reports}
              empty="No consumer report records are available for this establishment."
              failed="Consumer reports could not be loaded."
              render={(report) => (
                <div key={report.id} style={rowCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <strong style={{ color: '#0f172a', fontFamily: 'monospace' }}>{report.report_reference}</strong>
                    <span style={{ fontWeight: 700 }}>{report.status}</span>
                  </div>
                  <span>
                    {report.observed_at ? `Receipt ${formatDay(report.observed_at)}` : `Submitted ${formatDay(report.submitted_at)}`}
                    {(report.above_reference_count ?? 0) > 0 && (
                      <strong style={{ color: '#dc2626' }}> · {report.above_reference_count} above reference</strong>
                    )}
                  </span>
                </div>
              )}
            />
          </div>
        )}
      </div>
    </div>
  )
}
