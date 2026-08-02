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
import type { StoreRecord } from '../../types/admin'
import { getStoreStatusInfo } from './StoreMap'
import { adminApi } from '../../services/adminApi'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

export interface StoreDetailOverlayProps {
  store: StoreRecord
  onClose: () => void
  onCenterMap: () => void
  onInviteVendor: (store: StoreRecord) => void
}

type TabType = 'overview' | 'trends' | 'legal' | 'complaints'

export const StoreDetailOverlay: React.FC<StoreDetailOverlayProps> = ({
  store,
  onClose,
  onCenterMap,
  onInviteVendor,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [analyticsData, setAnalyticsData] = useState<any>(null)
  const [loadingAnalytics, setLoadingAnalytics] = useState(false)
  const statusInfo = getStoreStatusInfo(store)

  useEffect(() => {
    // Fetch store analytics when trends tab is selected or component mounts
    if (store) {
      setLoadingAnalytics(true)
      // Fetch default commodity analytics for this store if available
      adminApi.getAnalyticsOptions().then((opts) => {
        const defaultCommodity = opts.commodities[0]?.commodity_key || 'rice_regular_milled'
        return adminApi.getAnalytics(store.id, defaultCommodity)
      }).then((res) => {
        setAnalyticsData(res)
        setLoadingAnalytics(false)
      }).catch(() => {
        setLoadingAnalytics(false)
      })
    }
  }, [store.id])

  // Mock legal history for demonstration of temporal legal engine feature
  const recidivism = store.recidivism_index || 0
  const legalHistory = [
    {
      id: 1,
      type: 'LOI',
      title: 'Letter of Inquiry (LOI)',
      date: '2026-07-28',
      status: recidivism > 0 ? 'Escalated to SCO' : '48h Rebuttal Active',
      statusBg: recidivism > 0 ? '#fef2f2' : '#fffbeb',
      statusColor: recidivism > 0 ? '#dc2626' : '#d97706',
      details: 'Flagged for 12.5% price variance on Regular Milled Rice.',
    },
    ...(recidivism > 0
      ? [
          {
            id: 2,
            type: 'SCO',
            title: 'Show Cause Order (SCO)',
            date: '2026-07-30',
            status: 'Field Inspection Queued',
            statusBg: '#fef2f2',
            statusColor: '#dc2626',
            details: 'Immediate administrative order issued due to unaddressed LOI window.',
          },
        ]
      : []),
  ]

  // Mock citizen complaint tips for demonstration of temporal tipping history
  const complaintHistory = [
    {
      id: 101,
      date: '2026-07-27 14:32',
      status: 'Validated',
      statusBg: '#ecfdf5',
      statusColor: '#059669',
      item: 'Super Doña Maria Rice (5kg)',
      recordedPrice: '₱310.00',
      srpPrice: '₱275.00',
      ocrConfidence: '98.4%',
    },
    {
      id: 102,
      date: '2026-07-20 09:15',
      status: 'Dismissed',
      statusBg: '#f1f5f9',
      statusColor: '#64748b',
      item: 'Refined Sugar 1kg',
      recordedPrice: '₱85.00',
      srpPrice: '₱85.00',
      ocrConfidence: '95.1%',
    },
  ]

  // Prepare chart data for temporal trend tab
  const activeRows = analyticsData?.table_rows || []
  const labels = activeRows.map((r: any) => r.date)
  const priceSeries = activeRows.map((r: any) => Number(r.price))
  const srpSeries = activeRows.map((r: any) => (r.srp ? Number(r.srp) : null))
  const allowanceSeries = srpSeries.map((srp: number | null) => (srp !== null ? srp * 1.10 : null))

  const chartData =
    activeRows.length > 0
      ? {
          labels,
          datasets: [
            {
              label: 'Recorded Shelf Price',
              data: priceSeries,
              borderColor: recidivism > 0 ? '#dc2626' : '#d97706',
              backgroundColor: 'rgba(217, 119, 6, 0.1)',
              borderWidth: 2,
              tension: 0.3,
            },
            {
              label: '10% Allowance Ceiling',
              data: allowanceSeries,
              borderColor: '#eab308',
              borderDash: [4, 4],
              borderWidth: 1.5,
            },
            {
              label: 'Official Prevailing SRP',
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
    plugins: { legend: { display: false } },
  }

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
      <div style={{ position: 'relative', width: '100%', height: '140px', background: 'linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 100%)', flexShrink: 0, overflow: 'hidden' }}>
        {/* Visual Header Pattern Overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(255, 255, 255, 0.15) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255, 255, 255, 0.1) 0%, transparent 40%)',
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

              <button
                type="button"
                onClick={() => onInviteVendor(store)}
                style={{
                  padding: '0.45rem 0.85rem',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#0f172a',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                <i className="fa-solid fa-envelope" style={{ color: '#1e3a8a' }} aria-hidden="true" /> Invite Vendor
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
                  <strong style={{ color: '#0f172a' }}>Registered Owner:</strong> {store.owner_name || 'Registered Owner'}
                </div>
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
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: PRICE TRENDS */}
        {activeTab === 'trends' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>
                4-Week Shelf Price Volatility
              </h4>
              <span style={{ fontSize: '0.72rem', color: '#1d4ed8', fontWeight: 600, background: '#eff6ff', padding: '0.2rem 0.5rem', borderRadius: '6px' }}>
                Temporal Matrix
              </span>
            </div>

            {loadingAnalytics && (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', fontSize: '0.82rem' }}>
                Loading store price history...
              </div>
            )}

            {!loadingAnalytics && chartData && (
              <div style={{ height: '200px', width: '100%', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.5rem' }}>
                <Line data={chartData} options={chartOptions as any} />
              </div>
            )}

            {!loadingAnalytics && !chartData && (
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
              Legal Notice & Action History
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {legalHistory.map((item) => (
                <div key={item.id} style={{ borderLeft: `3px solid ${item.statusColor}`, background: '#f8fafc', padding: '0.65rem 0.85rem', borderRadius: '0 8px 8px 0', border: '1px solid #e2e8f0', borderLeftWidth: '3px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                    <strong style={{ fontSize: '0.82rem', color: '#0f172a', fontWeight: 700 }}>{item.title}</strong>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.45rem', borderRadius: '8px', background: item.statusBg, color: item.statusColor }}>
                      {item.status}
                    </span>
                  </div>
                  <p style={{ margin: '0 0 0.3rem', fontSize: '0.76rem', color: '#475569' }}>{item.details}</p>
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Issued: {item.date}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 4: COMPLAINTS */}
        {activeTab === 'complaints' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>
              Citizen OCR Receipt Scans & Tips
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {complaintHistory.map((tip) => (
                <div key={tip.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.65rem 0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <strong style={{ fontSize: '0.82rem', color: '#0f172a' }}>{tip.item}</strong>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.45rem', borderRadius: '8px', background: tip.statusBg, color: tip.statusColor }}>
                      {tip.status}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.76rem', color: '#475569', marginBottom: '0.2rem' }}>
                    <span>Recorded: <strong style={{ color: '#dc2626' }}>{tip.recordedPrice}</strong></span>
                    <span>SRP Ceiling: <strong style={{ color: '#1d4ed8' }}>{tip.srpPrice}</strong></span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#94a3b8' }}>
                    <span>OCR Confidence: {tip.ocrConfidence}</span>
                    <span>{tip.date}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
