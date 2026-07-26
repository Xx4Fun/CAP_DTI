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
import type { StoreRecord } from '../../types/admin'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

export const TemporalVolatility: React.FC = () => {
  const [stores, setStores] = useState<StoreRecord[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null)
  const [analytics, setAnalytics] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    void adminApi.getStores().then((data) => {
      setStores(data)
      if (data.length > 0) {
        setSelectedStoreId(data[0].id)
      }
    })
  }, [])

  useEffect(() => {
    if (selectedStoreId) {
      setLoading(true)
      void adminApi.getAnalytics(selectedStoreId).then((res) => {
        setAnalytics(res)
        setLoading(false)
      })
    }
  }, [selectedStoreId])

  const hasAnomaly = analytics?.table_rows?.some(
    (row: any) => row.srp && Number(row.price) > Number(row.srp) * 1.10
  )

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
        labels: {
          color: '#0f172a',
          font: { family: 'Outfit, sans-serif', weight: 600 },
        },
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

  const chartData = analytics
    ? {
        labels: analytics.labels,
        datasets: [
          {
            label: 'Recorded Shelf / Receipt Price',
            data: analytics.price_series,
            borderColor: hasAnomaly ? '#dc2626' : '#d97706',
            backgroundColor: hasAnomaly ? 'rgba(220, 38, 38, 0.1)' : 'rgba(217, 119, 6, 0.1)',
            borderWidth: 2.5,
            tension: 0.3,
          },
          {
            label: 'Applicable Baseline SRP',
            data: analytics.srp_series,
            borderColor: '#1d4ed8',
            backgroundColor: 'rgba(29, 78, 216, 0.05)',
            borderWidth: 2,
            borderDash: [6, 4],
            tension: 0,
          },
        ],
      }
    : null

  return (
    <div className="admin-stack" style={{ display: 'grid', gap: '1.25rem' }}>
      <div className="admin-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', fontWeight: 700 }}>
              📈 4-Week Temporal Price Volatility
            </h3>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: '#64748b' }}>
              Compare historical field inspection records against flat baseline SRPs over time.
            </p>
          </div>

          <div style={{ minWidth: '240px' }}>
            <label style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', fontWeight: 600, marginBottom: '0.3rem' }}>
              Select Establishment
            </label>
            <select
              value={selectedStoreId || ''}
              onChange={(e) => setSelectedStoreId(Number(e.target.value))}
              style={{
                width: '100%',
                padding: '0.55rem 0.85rem',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                background: '#ffffff',
                color: '#0f172a',
                fontSize: '0.88rem',
              }}
            >
              <option value="" disabled>Select establishment...</option>
              {stores.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.store_name} ({st.address})
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading && (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
            Loading 4-week price volatility series...
          </div>
        )}

        {!loading && chartData && (
          <div className="chart-frame" style={{ width: '100%', height: '360px', border: '1px solid #e2e8f0', borderRadius: '10px', background: '#ffffff', padding: '1rem' }}>
            <Line data={chartData} options={chartOptions as any} />
          </div>
        )}

        {!loading && !chartData && (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            Select an establishment above to visualize 4-week temporal price trends.
          </div>
        )}
      </div>

      {analytics?.table_rows && (
        <div className="admin-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem' }}>
          <h4 style={{ margin: '0 0 0.85rem', fontSize: '0.98rem', color: '#0f172a', fontWeight: 700 }}>
            Four-Week Validated Price Log
          </h4>

          <div className="admin-table-wrap" style={{ overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px', background: '#ffffff' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.76rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>Inspection Date</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.76rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>Recorded Price</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.76rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>Applicable SRP</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.76rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>Variance / Status</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.76rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>Data Source</th>
                </tr>
              </thead>
              <tbody>
                {analytics.table_rows.map((row: any, index: number) => {
                  const price = Number(row.price)
                  const srp = row.srp ? Number(row.srp) : null
                  const isOver10Percent = srp ? price > srp * 1.10 : false
                  const isOverSrp = srp ? price > srp : false

                  return (
                    <tr key={index} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#0f172a' }}>{row.date}</td>
                      <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 700, fontSize: '0.9rem', color: isOver10Percent ? '#dc2626' : isOverSrp ? '#d97706' : '#0f172a' }}>
                        ₱{price.toFixed(2)}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontSize: '0.9rem', color: '#1d4ed8' }}>
                        {srp ? `₱${srp.toFixed(2)}` : 'Unavailable'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        {!srp ? (
                          <span style={{ padding: '0.2rem 0.55rem', borderRadius: '4px', background: '#f1f5f9', color: '#64748b', fontSize: '0.75rem', fontWeight: 600 }}>
                            No SRP Baseline
                          </span>
                        ) : isOver10Percent ? (
                          <span style={{ padding: '0.25rem 0.65rem', borderRadius: '12px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontSize: '0.75rem', fontWeight: 700 }}>
                            🚨 Exceeds 10% Limit (SCO Required)
                          </span>
                        ) : isOverSrp ? (
                          <span style={{ padding: '0.25rem 0.65rem', borderRadius: '12px', background: '#fffbebf', color: '#d97706', border: '1px solid #fed7aa', fontSize: '0.75rem', fontWeight: 700 }}>
                            ⚠️ Above SRP (LOI Candidate)
                          </span>
                        ) : (
                          <span style={{ padding: '0.25rem 0.65rem', borderRadius: '12px', background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', fontSize: '0.75rem', fontWeight: 700 }}>
                            ✅ Compliant
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.82rem', color: '#64748b' }}>
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
