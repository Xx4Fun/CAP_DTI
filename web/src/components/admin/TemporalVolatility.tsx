import React, { useEffect, useState } from 'react'
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
import { adminApi } from '../../services/adminApi'
import { reviewThreshold } from './storeMapUtils'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

export const TemporalVolatility: React.FC = () => {
  const [stores, setStores] = useState<Array<{ id: number; store_name: string; address: string }>>([])
  const [commodities, setCommodities] = useState<Array<{ commodity_key: string; commodity_name: string }>>([])
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null)
  const [selectedCommodity, setSelectedCommodity] = useState('')
  const [storeSearch, setStoreSearch] = useState('')
  const [commoditySearch, setCommoditySearch] = useState('')
  const [dateRange, setDateRange] = useState<'7d' | '14d' | '30d' | 'all'>('30d')
  const [analytics, setAnalytics] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void adminApi.getAnalyticsOptions().then((data) => {
      setStores(data.stores)
      setCommodities(data.commodities)
    }).catch(() => {
      setError('Analytics filters could not be loaded. Retry when the Admin API is available.')
    })
  }, [])

  useEffect(() => {
    if (selectedStoreId && selectedCommodity) {
      let cancelled = false
      setLoading(true)
      setError(null)
      void adminApi.getAnalytics(selectedStoreId, selectedCommodity).then((res) => {
        if (cancelled) return
        setAnalytics(res)
        setLoading(false)
      }).catch(() => {
        if (cancelled) return
        setAnalytics(null)
        setError('Validated analytics could not be loaded for the selected store and commodity.')
        setLoading(false)
      })
      return () => { cancelled = true }
    }
  }, [selectedStoreId, selectedCommodity])

  // Filter stores & commodities for searchable dropdowns
  const filteredStores = stores.filter(
    (st) =>
      st.store_name.toLowerCase().includes(storeSearch.toLowerCase()) ||
      st.address.toLowerCase().includes(storeSearch.toLowerCase())
  )

  const filteredCommodities = commodities.filter(
    (c) =>
      c.commodity_name.toLowerCase().includes(commoditySearch.toLowerCase()) ||
      c.commodity_key.toLowerCase().includes(commoditySearch.toLowerCase())
  )

  // Filter active rows by date range pill
  const getFilteredRows = () => {
    if (!analytics?.table_rows) return []
    const rows = [...analytics.table_rows]
    if (dateRange === 'all') return rows
    const days = dateRange === '7d' ? 7 : dateRange === '14d' ? 14 : 30
    const now = new Date()
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)

    const dateFiltered = rows.filter((r: any) => {
      const d = new Date(r.date)
      return !isNaN(d.getTime()) ? d >= cutoff : true
    })
    return dateFiltered
  }

  const activeRows = getFilteredRows()

  const hasAnomaly = activeRows.some(
    (row: any) => row.srp && Number(row.price) > reviewThreshold(row)!
  )

  // Calculate peso & percentage variance calculation callout
  const getVarianceCallout = () => {
    if (!activeRows || activeRows.length === 0) return null
    const validRows = activeRows.filter((r: any) => r.srp)
    if (validRows.length === 0) return null

    const overThresholdRows = validRows.filter((r: any) => Number(r.price) > reviewThreshold(r)!)
    const targetRow =
      overThresholdRows.length > 0
        ? overThresholdRows.reduce((max: any, r: any) =>
            Number(r.price) / Number(r.srp) > Number(max.price) / Number(max.srp) ? r : max
          )
        : validRows.reduce((max: any, r: any) =>
            Number(r.price) / Number(r.srp) > Number(max.price) / Number(max.srp) ? r : max
          )

    const price = Number(targetRow.price)
    const srp = Number(targetRow.srp)
    const diff = price - srp
    const pct = ((price - srp) / srp) * 100

    if (price > reviewThreshold(targetRow)!) {
      return {
        type: 'danger',
        text: `+₱${diff.toFixed(2)} (+${pct.toFixed(1)}%) above the reference price and above the review threshold. No legal action is inferred.`,
      }
    } else if (price > srp) {
      return {
        type: 'warning',
        text: `+₱${diff.toFixed(2)} (+${pct.toFixed(1)}%) above the reference price and below the review threshold.`,
      }
    } else {
      return {
        type: 'success',
        text: `₱${diff.toFixed(2)} (${pct.toFixed(1)}%) variance from the reference price. This alone is not a complete compliance determination.`,
      }
    }
  }

  const varianceCallout = getVarianceCallout()

  const labels = activeRows.map((r: any) => r.date)
  const priceSeries = activeRows.map((r: any) => Number(r.price))
  const srpSeries = activeRows.map((r: any) => (r.srp ? Number(r.srp) : null))
  const thresholdSeries = activeRows.map(reviewThreshold)

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        grid: { color: '#e2e8f0' },
        ticks: { color: '#64748b', font: { family: 'Outfit, sans-serif' } },
      },
      y: {
        grid: { color: '#e2e8f0' },
        ticks: {
          color: '#64748b',
          font: { family: 'Outfit, sans-serif' },
          callback: (value: any) => `₱${Number(value).toFixed(2)}`,
        },
      },
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const val = Number(context.parsed.y).toFixed(2)
            return `${context.dataset.label}: ₱${val}`
          },
        },
      },
    },
  }

  const chartData =
    analytics && activeRows.length > 0
      ? {
          labels: labels,
          datasets: [
            {
              label: 'Recorded Field Shelf Price',
              data: priceSeries,
              borderColor: hasAnomaly ? '#dc2626' : '#d97706',
              backgroundColor: hasAnomaly ? 'rgba(220, 38, 38, 0.1)' : 'rgba(217, 119, 6, 0.1)',
              borderWidth: 2.5,
              tension: 0.3,
            },
            {
              label: 'Review threshold',
              data: thresholdSeries,
              borderColor: '#eab308',
              backgroundColor: 'rgba(234, 179, 8, 0.05)',
              borderWidth: 1.5,
              borderDash: [4, 4],
              tension: 0,
            },
            {
              label: 'Reference price',
              data: srpSeries,
              borderColor: '#1d4ed8',
              backgroundColor: 'rgba(29, 78, 216, 0.05)',
              borderWidth: 2,
              borderDash: [6, 4],
              tension: 0,
            },
          ],
        }
      : null

  // Summary metric header statistics
  const maxPrice = priceSeries.length > 0 ? Math.max(...priceSeries) : 0
  const latestSrp =
    srpSeries.length > 0 && srpSeries[srpSeries.length - 1] !== null
      ? srpSeries[srpSeries.length - 1]!
      : 0
  const maxVariancePct =
    srpSeries.length > 0
      ? Math.max(
          ...priceSeries.map((p, i) =>
            srpSeries[i] ? ((p - srpSeries[i]!) / srpSeries[i]!) * 100 : 0
          )
        )
      : 0

  return (
    <div className="admin-stack" style={{ display: 'grid', gap: '1.25rem' }}>
      {/* Searchable Filter Toolbar & Metric Header Card */}
      <div
        className="admin-card"
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '1.25rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.25rem',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a', fontWeight: 700 }}>
              Temporal Price Volatility Analytics
            </h3>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: '#64748b' }}>
              Compare historical field inspection shelf prices against reference prices and review thresholds.
            </p>
          </div>

          {/* Searchable Controls Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(220px, 1fr) minmax(200px, 1fr)',
              gap: '0.85rem',
              alignItems: 'end',
            }}
          >
            <div style={{ position: 'relative' }}>
              <label
                htmlFor="analytics-store"
                style={{
                  display: 'block',
                  fontSize: '0.78rem',
                  color: '#64748b',
                  fontWeight: 600,
                  marginBottom: '0.3rem',
                }}
              >
                Select Establishment
              </label>

              {/* Option 3: Pure Autocomplete Search Bar */}
              <div style={{ position: 'relative', width: '100%' }}>
                <input
                  id="analytics-store"
                  type="text"
                  placeholder="🔍 Search or select establishment..."
                  aria-label="Select establishment"
                  value={storeSearch}
                  onChange={(e) => {
                    setStoreSearch(e.target.value)
                    const match = stores.find(
                      (s) => s.store_name.toLowerCase() === e.target.value.toLowerCase() ||
                             `${s.store_name} (${s.address})`.toLowerCase() === e.target.value.toLowerCase()
                    )
                    setSelectedStoreId(match?.id ?? null)
                    if (!match) setAnalytics(null)
                  }}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.85rem',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    fontSize: '0.86rem',
                    background: '#ffffff',
                    color: '#0f172a',
                    outline: 'none',
                    fontWeight: 600,
                    boxSizing: 'border-box',
                    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
                  }}
                />
                {storeSearch.trim().length > 0 && !selectedStoreId && (
                  <div
                    role="listbox"
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 4px)',
                      left: 0,
                      right: 0,
                      maxHeight: '200px',
                      overflowY: 'auto',
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      boxShadow: '0 10px 25px rgba(15, 23, 42, 0.12)',
                      zIndex: 50,
                      padding: '0.35rem 0',
                    }}
                  >
                    {filteredStores.length > 0 ? (
                      filteredStores.map((st) => (
                        <button
                          type="button"
                          key={st.id}
                          role="option"
                          aria-selected={selectedStoreId === st.id}
                          onClick={() => {
                            setSelectedStoreId(st.id)
                            setStoreSearch(`${st.store_name} (${st.address})`)
                          }}
                          style={{
                            padding: '0.55rem 0.85rem',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            color: selectedStoreId === st.id ? '#1d4ed8' : '#0f172a',
                            background: selectedStoreId === st.id ? '#eff6ff' : 'transparent',
                            cursor: 'pointer',
                            borderBottom: '1px solid #f1f5f9',
                            borderTop: 0,
                            borderLeft: 0,
                            borderRight: 0,
                            width: '100%',
                            textAlign: 'left',
                          }}
                        >
                          {st.store_name} ({st.address})
                        </button>
                      ))
                    ) : (
                      <div style={{ padding: '0.65rem 0.85rem', fontSize: '0.82rem', color: '#64748b', textAlign: 'center' }}>
                        No matching establishments
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div style={{ position: 'relative' }}>
              <label
                htmlFor="analytics-commodity"
                style={{
                  display: 'block',
                  fontSize: '0.78rem',
                  color: '#64748b',
                  fontWeight: 600,
                  marginBottom: '0.3rem',
                }}
              >
                Select Commodity
              </label>

              {/* Option 3: Pure Autocomplete Search Bar */}
              <div style={{ position: 'relative', width: '100%' }}>
                <input
                  id="analytics-commodity"
                  type="text"
                  placeholder="🔍 Search or select commodity..."
                  aria-label="Select commodity"
                  value={commoditySearch}
                  onChange={(e) => {
                    setCommoditySearch(e.target.value)
                    const match = commodities.find(
                      (c) => c.commodity_name.toLowerCase() === e.target.value.toLowerCase() ||
                             c.commodity_key.toLowerCase() === e.target.value.toLowerCase()
                    )
                    setSelectedCommodity(match?.commodity_key ?? '')
                    if (!match) setAnalytics(null)
                  }}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.85rem',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    fontSize: '0.86rem',
                    background: '#ffffff',
                    color: '#0f172a',
                    outline: 'none',
                    fontWeight: 600,
                    boxSizing: 'border-box',
                    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
                  }}
                />
                {commoditySearch.trim().length > 0 && !selectedCommodity && (
                  <div
                    role="listbox"
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 4px)',
                      left: 0,
                      right: 0,
                      maxHeight: '200px',
                      overflowY: 'auto',
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      boxShadow: '0 10px 25px rgba(15, 23, 42, 0.12)',
                      zIndex: 50,
                      padding: '0.35rem 0',
                    }}
                  >
                    {filteredCommodities.length > 0 ? (
                      filteredCommodities.map((c) => (
                        <button
                          type="button"
                          key={c.commodity_key}
                          role="option"
                          aria-selected={selectedCommodity === c.commodity_key}
                          onClick={() => {
                            setSelectedCommodity(c.commodity_key)
                            setCommoditySearch(c.commodity_name)
                          }}
                          style={{
                            padding: '0.55rem 0.85rem',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            color: selectedCommodity === c.commodity_key ? '#1d4ed8' : '#0f172a',
                            background: selectedCommodity === c.commodity_key ? '#eff6ff' : 'transparent',
                            cursor: 'pointer',
                            borderBottom: '1px solid #f1f5f9',
                            borderTop: 0,
                            borderLeft: 0,
                            borderRight: 0,
                            width: '100%',
                            textAlign: 'left',
                          }}
                        >
                          {c.commodity_name}
                        </button>
                      ))
                    ) : (
                      <div style={{ padding: '0.65rem 0.85rem', fontSize: '0.82rem', color: '#64748b', textAlign: 'center' }}>
                        No matching commodities
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Quick Date-Range Filter Pills */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            paddingTop: '0.75rem',
            borderTop: '1px dashed #e2e8f0',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748b', marginRight: '0.25rem' }}>
            Range Horizon:
          </span>
          {[
            { id: '7d', label: 'Last 7 Days' },
            { id: '14d', label: 'Last 14 Days' },
            { id: '30d', label: 'Last 30 Days (4 Weeks)' },
            { id: 'all', label: 'All Returned Records (4 Weeks)' },
          ].map((pill) => (
            <button
              key={pill.id}
              type="button"
              onClick={() => setDateRange(pill.id as any)}
              style={{
                padding: '0.3rem 0.75rem',
                borderRadius: '20px',
                fontSize: '0.78rem',
                fontWeight: dateRange === pill.id ? 700 : 500,
                border: dateRange === pill.id ? '1px solid #1d4ed8' : '1px solid #cbd5e1',
                background: dateRange === pill.id ? '#eff6ff' : '#ffffff',
                color: dateRange === pill.id ? '#1d4ed8' : '#475569',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div role="alert" className="admin-alert admin-alert--error">{error}</div>}

      {/* Summary Metric Header Grid (Rendered when analytics loaded) */}
      {analytics && activeRows.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '0.85rem',
          }}
        >
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '0.85rem 1rem',
            }}
          >
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Total Inspections</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginTop: '0.2rem' }}>
              {activeRows.length} Logged {activeRows.length === 1 ? 'Record' : 'Records'}
            </div>
          </div>

          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '0.85rem 1rem',
            }}
          >
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Reference price</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1d4ed8', marginTop: '0.2rem' }}>
              {latestSrp > 0 ? `₱${latestSrp.toFixed(2)}` : 'N/A'}
            </div>
          </div>

          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '0.85rem 1rem',
            }}
          >
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Peak Shelf Price</span>
            <div
              style={{
                fontSize: '1.25rem',
                fontWeight: 800,
                color: hasAnomaly ? '#dc2626' : '#0f172a',
                marginTop: '0.2rem',
              }}
            >
              ₱{maxPrice.toFixed(2)}
            </div>
          </div>

          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '0.85rem 1rem',
            }}
          >
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Max Price Volatility</span>
            <div
              style={{
                fontSize: '1.25rem',
                fontWeight: 800,
                color: maxVariancePct > 10 ? '#dc2626' : maxVariancePct > 0 ? '#d97706' : '#059669',
                marginTop: '0.2rem',
              }}
            >
              {maxVariancePct > 0 ? `+${maxVariancePct.toFixed(1)}%` : '0.0%'}
            </div>
          </div>
        </div>
      )}

      {/* Peso & Percentage Variance Calculation Callout Banner */}
      {varianceCallout && (
        <div
          data-testid="variance-callout-card"
          style={{
            background:
              varianceCallout.type === 'danger'
                ? '#fef2f2'
                : varianceCallout.type === 'warning'
                ? '#fffbeb'
                : '#f0fdf4',
            border: `1px solid ${
              varianceCallout.type === 'danger'
                ? '#fecaca'
                : varianceCallout.type === 'warning'
                ? '#fef08a'
                : '#bbf7d0'
            }`,
            borderRadius: '10px',
            padding: '0.85rem 1.15rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <span
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background:
                  varianceCallout.type === 'danger'
                    ? '#dc2626'
                    : varianceCallout.type === 'warning'
                    ? '#d97706'
                    : '#059669',
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
            <div>
              <span
                style={{
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.03em',
                  color:
                    varianceCallout.type === 'danger'
                      ? '#b91c1c'
                      : varianceCallout.type === 'warning'
                      ? '#b45309'
                      : '#15803d',
                }}
              >
                Regulatory Variance Calculation
              </span>
              <div
                style={{
                  fontSize: '0.92rem',
                  fontWeight: 700,
                  color:
                    varianceCallout.type === 'danger'
                      ? '#991b1b'
                      : varianceCallout.type === 'warning'
                      ? '#92400e'
                      : '#166534',
                  marginTop: '0.1rem',
                }}
              >
                {varianceCallout.text}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Visualizer Card */}
      <div
        className="admin-card"
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '1.25rem',
        }}
      >
        {/* Explicit Visual Legend Callouts */}
        <div
          data-testid="visual-legend-callouts"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '0.75rem',
            marginBottom: '1rem',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '0.75rem 1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span
              style={{
                width: '14px',
                height: '14px',
                borderRadius: '3px',
                background: '#1d4ed8',
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: '0.8rem', color: '#0f172a', fontWeight: 600 }}>
              <strong>Reference price</strong>{' '}
              <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 400 }}>
                (flat reference line)
              </span>
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span
              style={{
                width: '14px',
                height: '14px',
                borderRadius: '3px',
                background: '#eab308',
                border: '1px dashed #ca8a04',
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: '0.8rem', color: '#0f172a', fontWeight: 600 }}>
              <strong>Review threshold</strong>{' '}
              <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 400 }}>
                (10% above SRP; equals the ceiling under an emergency price freeze)
              </span>
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span
              style={{
                width: '14px',
                height: '14px',
                borderRadius: '3px',
                background: hasAnomaly ? '#dc2626' : '#d97706',
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: '0.8rem', color: '#0f172a', fontWeight: 600 }}>
              <strong>Recorded Field Shelf Price</strong>{' '}
              <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 400 }}>
                (actual inspection price line, turning red above the review threshold)
              </span>
            </span>
          </div>
        </div>

        {loading && (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
            Loading 4-week price volatility series...
          </div>
        )}

        {!loading && chartData && (
          <div
            className="chart-frame"
            style={{
              width: '100%',
              height: '360px',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              background: '#ffffff',
              padding: '1rem',
              boxSizing: 'border-box',
            }}
          >
            <Line data={chartData} options={chartOptions as any} />
          </div>
        )}

        {!loading && !chartData && (
          <div
            style={{
              padding: '3rem',
              textAlign: 'center',
              color: '#64748b',
              background: '#f8fafc',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
            }}
          >
            Select an establishment above to visualize 4-week temporal price trends.
          </div>
        )}
      </div>

      {/* Validated Four-Week Price Log Table */}
      {analytics?.table_rows && (
        <div
          className="admin-card"
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '1.25rem',
          }}
        >
          <p style={{ margin: '0 0 0.85rem', color: '#475569', fontWeight: 600 }}>
            {analytics.recidivism_count ?? 0} confirmed regulatory{' '}
            {(analytics.recidivism_count ?? 0) === 1 ? 'finding' : 'findings'}
          </p>
          <h4
            style={{
              margin: '0 0 0.85rem',
              fontSize: '0.98rem',
              color: '#0f172a',
              fontWeight: 700,
            }}
          >
            Four-Week Validated Price Log
          </h4>

          <div
            className="admin-table-wrap"
            style={{
              overflow: 'auto',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              background: '#ffffff',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th
                    style={{
                      padding: '0.75rem 1rem',
                      fontSize: '0.76rem',
                      textTransform: 'uppercase',
                      color: '#64748b',
                      fontWeight: 600,
                    }}
                  >
                    Inspection Date
                  </th>
                  <th
                    style={{
                      padding: '0.75rem 1rem',
                      fontSize: '0.76rem',
                      textTransform: 'uppercase',
                      color: '#64748b',
                      fontWeight: 600,
                    }}
                  >
                    Recorded Price
                  </th>
                  <th
                    style={{
                      padding: '0.75rem 1rem',
                      fontSize: '0.76rem',
                      textTransform: 'uppercase',
                      color: '#64748b',
                      fontWeight: 600,
                    }}
                  >
                    Reference price
                  </th>
                  <th
                    style={{
                      padding: '0.75rem 1rem',
                      fontSize: '0.76rem',
                      textTransform: 'uppercase',
                      color: '#64748b',
                      fontWeight: 600,
                    }}
                  >
                    Variance / Status
                  </th>
                  <th
                    style={{
                      padding: '0.75rem 1rem',
                      fontSize: '0.76rem',
                      textTransform: 'uppercase',
                      color: '#64748b',
                      fontWeight: 600,
                    }}
                  >
                    Data Source
                  </th>
                </tr>
              </thead>
              <tbody>
                {activeRows.map((row: any, index: number) => {
                  const price = Number(row.price)
                  const srp = row.srp ? Number(row.srp) : null
                  const threshold = reviewThreshold(row)
                  const isOverThreshold = threshold !== null && price > threshold
                  const isOverSrp = srp ? price > srp : false

                  return (
                    <tr key={index} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#0f172a' }}>
                        {row.date}
                      </td>
                      <td
                        style={{
                          padding: '0.75rem 1rem',
                          fontFamily: 'monospace',
                          fontWeight: 700,
                          fontSize: '0.9rem',
                          color: isOverThreshold ? '#dc2626' : isOverSrp ? '#d97706' : '#0f172a',
                        }}
                      >
                        ₱{price.toFixed(2)}
                      </td>
                      <td
                        style={{
                          padding: '0.75rem 1rem',
                          fontFamily: 'monospace',
                          fontSize: '0.9rem',
                          color: '#1d4ed8',
                        }}
                      >
                        {srp ? `₱${srp.toFixed(2)}` : 'Unavailable'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        {!srp ? (
                          <span
                            style={{
                              padding: '0.2rem 0.55rem',
                              borderRadius: '4px',
                              background: '#f1f5f9',
                              color: '#64748b',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                            }}
                          >
                            No reference price
                          </span>
                        ) : isOverThreshold ? (
                          <span
                            style={{
                              padding: '0.25rem 0.65rem',
                              borderRadius: '12px',
                              background: '#fef2f2',
                              color: '#dc2626',
                              border: '1px solid #fecaca',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                            }}
                          >
                            Above review threshold
                          </span>
                        ) : isOverSrp ? (
                          <span
                            style={{
                              padding: '0.25rem 0.65rem',
                              borderRadius: '12px',
                              background: '#fffbeb',
                              color: '#d97706',
                              border: '1px solid #fed7aa',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                            }}
                          >
                            Above reference price
                          </span>
                        ) : (
                          <span
                            style={{
                              padding: '0.25rem 0.65rem',
                              borderRadius: '12px',
                              background: '#ecfdf5',
                              color: '#059669',
                              border: '1px solid #a7f3d0',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                            }}
                          >
                            Compliant
                          </span>
                        )}
                      </td>
                      <td
                        style={{
                          padding: '0.75rem 1rem',
                          fontSize: '0.82rem',
                          color: '#64748b',
                        }}
                      >
                        {row.source}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
