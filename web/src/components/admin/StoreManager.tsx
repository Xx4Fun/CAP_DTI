import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { adminApi } from '../../services/adminApi'
import type { StoreRecord } from '../../types/admin'
import { StoreMap } from './StoreMap'
import { getStoreStatusInfo } from './storeMapUtils'

// chart.js lives in the detail overlay; keep it out of the map's first load.
const StoreDetailOverlay = lazy(() => import('./StoreDetailOverlay').then((module) => ({ default: module.StoreDetailOverlay })))

type StatusFilter = 'all' | 'no-findings' | 'pending' | 'findings'

export const StoreManager: React.FC = () => {
  const [stores, setStores] = useState<StoreRecord[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null)
  const [detailStore, setDetailStore] = useState<StoreRecord | null>(null)
  const [centerTrigger, setCenterTrigger] = useState<{ storeId: number; timestamp: number } | null>(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadStores = () => {
    setLoading(true)
    setLoadError(null)
    void adminApi.getStores().then((data) => {
      setStores(data)
      setLoading(false)
    }).catch(() => {
      setStores([])
      setLoadError('Establishments could not be loaded. Retry when the Admin API is available.')
      setLoading(false)
    })
  }

  useEffect(() => {
    loadStores()
  }, [])

  const handleCenterStore = (storeId: number) => {
    setSelectedStoreId(storeId)
    setCenterTrigger({ storeId, timestamp: Date.now() })
  }

  const handleOpenStoreDetail = (store: StoreRecord) => {
    setSelectedStoreId(store.id)
    setDetailStore(store)
    setIsSidebarOpen(true)
    setCenterTrigger({ storeId: store.id, timestamp: Date.now() })
  }

  const toggleSidebar = () => {
    setIsSidebarOpen((prev) => !prev)
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'))
    }, 300)
  }

  const counts = {
    all: stores.length,
    noFindings: stores.filter((s) => (s.recidivism_index || 0) === 0 && s.is_active && s.is_verified).length,
    pending: stores.filter((s) => (s.recidivism_index || 0) === 0 && s.is_active && !s.is_verified).length,
    findings: stores.filter((s) => (s.recidivism_index || 0) > 0).length,
  }

  // Memoized so StoreMap keeps the same array and does not rebuild every marker on unrelated renders.
  const filteredStores = useMemo(() => stores.filter((s) => {
    const matchesSearch =
      s.store_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.dti_sec_number || '').toLowerCase().includes(searchTerm.toLowerCase())

    if (!matchesSearch) return false

    const recidivism = s.recidivism_index || 0
    if (statusFilter === 'no-findings') return recidivism === 0 && s.is_active && s.is_verified
    if (statusFilter === 'pending') return recidivism === 0 && s.is_active && !s.is_verified
    if (statusFilter === 'findings') return recidivism > 0

    return true
  }), [stores, searchTerm, statusFilter])

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        flex: 1,
        minHeight: 0,
        borderRadius: '12px',
        overflow: 'hidden',
        border: '1px solid #e2e8f0',
        background: '#f8fafc',
        boxShadow: '0 4px 12px rgba(15, 23, 42, 0.05)',
      }}
    >
      {/* Full-Screen GIS Monitor Canvas */}
      <StoreMap
        stores={filteredStores}
        selectedStoreId={selectedStoreId}
        centerTrigger={centerTrigger}
        onSelectStore={(store) => {
          setSelectedStoreId(store.id)
          setCenterTrigger({ storeId: store.id, timestamp: Date.now() })
        }}
        onOpenStoreDetail={handleOpenStoreDetail}
        height="100%"
        fullCanvas
        title="Full-Screen GIS Store Monitoring Canvas"
      />

      {/* Floating Map Info Legend (Top Right) */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          zIndex: 500,
          background: 'rgba(255, 255, 255, 0.92)',
          backdropFilter: 'blur(10px)',
          padding: '0.4rem 0.85rem',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.85rem',
          fontSize: '0.78rem',
          color: '#0f172a',
          fontWeight: 600,
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: '#1e3a8a' }}>
          <i className="fa-solid fa-layer-group" aria-hidden="true" /> CartoDB GIS Monitor
        </span>
        <span style={{ height: '14px', width: '1px', background: '#cbd5e1' }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: '#059669' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} /> {counts.noFindings} No findings
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: '#d97706' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b' }} /> {counts.pending} Pending verification
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: '#dc2626' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }} /> {counts.findings} Confirmed findings
        </span>
      </div>

      {/* Collapsible Overlay Sidebar Panel (Left Side) */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          left: '12px',
          bottom: '12px',
          zIndex: 500,
          width: isSidebarOpen ? '390px' : '54px',
          transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          background: 'rgba(255, 255, 255, 0.96)',
          backdropFilter: 'blur(14px)',
          border: '1px solid #cbd5e1',
          borderRadius: '10px',
          boxShadow: '0 12px 28px -4px rgba(15, 23, 42, 0.15), 0 4px 8px -2px rgba(15, 23, 42, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'visible',
        }}
      >
        {/* Vertically Centered Right-Edge Collapse/Expand Toggle Button */}
        <button
          type="button"
          onClick={toggleSidebar}
          title={isSidebarOpen ? 'Collapse Sidebar' : 'Expand Sidebar'}
          style={{
            position: 'absolute',
            top: '50%',
            right: '-14px',
            transform: 'translateY(-50%)',
            zIndex: 600,
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            border: '1px solid #cbd5e1',
            background: '#ffffff',
            color: '#1e3a8a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.15)',
            transition: 'all 0.15s ease',
          }}
        >
          <i className={`fa-solid ${isSidebarOpen ? 'fa-chevron-left' : 'fa-chevron-right'}`} aria-hidden="true" />
        </button>

        {/* Inner Content Frame */}
        <div style={{ width: '100%', height: '100%', borderRadius: '10px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {isSidebarOpen && detailStore ? (
            /* Fully Replaces Entire Sidebar when Viewing Store Info */
            <Suspense fallback={
              <div className="store-sidebar-skeleton-list" role="status" aria-label="Loading store details">
                <span className="sr-only">Loading store details...</span>
                {Array.from({ length: 3 }, (_, index) => <div key={index} className="admin-skeleton-block" style={{ height: '96px' }} />)}
              </div>
            }>
              <StoreDetailOverlay
                store={detailStore}
                onClose={() => setDetailStore(null)}
                onCenterMap={() => handleCenterStore(detailStore.id)}
              />
            </Suspense>
          ) : isSidebarOpen ? (
            /* Standard Store List & Search View */
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              {/* Sidebar Header */}
              <div
                style={{
                  padding: '0.85rem 1rem',
                  borderBottom: '1px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  background: '#ffffff',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#1e3a8a',
                    flexShrink: 0,
                  }}
                >
                  <i className="fa-solid fa-building-circle-check" style={{ fontSize: '0.95rem' }} aria-hidden="true" />
                </div>
                <div style={{ overflow: 'hidden' }}>
                  <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                    Store Monitoring
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                    San Jose de Buenavista Zone
                  </p>
                </div>
              </div>

              {/* Search Input & Status Tabs */}
              <div style={{ padding: '0.85rem 1rem 0.65rem', display: 'flex', flexDirection: 'column', gap: '0.65rem', flexShrink: 0, background: '#ffffff', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ position: 'relative', width: '100%' }}>
                  <i
                    className="fa-solid fa-magnifying-glass"
                    style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '0.85rem' }}
                    aria-hidden="true"
                  />
                  <input
                    type="text"
                    placeholder="Search stores, address, SEC #..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem 0.5rem 2.1rem',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      background: '#f8fafc',
                      color: '#0f172a',
                      fontSize: '0.83rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                {/* Status Filter Chips */}
                <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'nowrap', overflowX: 'auto' }}>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('all')}
                    style={{
                      padding: '0.3rem 0.5rem',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      borderRadius: '6px',
                      border: statusFilter === 'all' ? '1px solid #1e3a8a' : '1px solid #e2e8f0',
                      background: statusFilter === 'all' ? '#eff6ff' : '#ffffff',
                      color: statusFilter === 'all' ? '#1e3a8a' : '#64748b',
                      fontSize: '0.76rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    All ({counts.all})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('no-findings')}
                    style={{
                      padding: '0.3rem 0.5rem',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      borderRadius: '6px',
                      border: statusFilter === 'no-findings' ? '1px solid #059669' : '1px solid #e2e8f0',
                      background: statusFilter === 'no-findings' ? '#ecfdf5' : '#ffffff',
                      color: statusFilter === 'no-findings' ? '#059669' : '#64748b',
                      fontSize: '0.76rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    No findings ({counts.noFindings})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('pending')}
                    style={{
                      padding: '0.3rem 0.5rem',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      borderRadius: '6px',
                      border: statusFilter === 'pending' ? '1px solid #d97706' : '1px solid #e2e8f0',
                      background: statusFilter === 'pending' ? '#fffbeb' : '#ffffff',
                      color: statusFilter === 'pending' ? '#d97706' : '#64748b',
                      fontSize: '0.76rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Pending ({counts.pending})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('findings')}
                    style={{
                      padding: '0.3rem 0.5rem',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      borderRadius: '6px',
                      border: statusFilter === 'findings' ? '1px solid #dc2626' : '1px solid #e2e8f0',
                      background: statusFilter === 'findings' ? '#fef2f2' : '#ffffff',
                      color: statusFilter === 'findings' ? '#dc2626' : '#64748b',
                      fontSize: '0.76rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Findings ({counts.findings})
                  </button>
                </div>
              </div>

              {/* Scrollable Store Cards List */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '0.65rem 0.85rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {loading && (
                  <div className="store-sidebar-skeleton-list" aria-label="Loading establishments" role="status">
                    <span className="sr-only">Loading establishments...</span>
                    {Array.from({ length: 4 }, (_, idx) => (
                      <div key={idx} className="store-card-skeleton" aria-hidden="true">
                        <div className="store-skeleton-header">
                          <div className="admin-skeleton-block" style={{ height: '16px', width: '60%', borderRadius: '4px' }} />
                          <div className="admin-skeleton-block" style={{ height: '18px', width: '25%', borderRadius: '999px' }} />
                        </div>
                        <div className="admin-skeleton-block" style={{ height: '13px', width: '85%', borderRadius: '4px', marginTop: '6px' }} />
                        <div className="admin-skeleton-block" style={{ height: '12px', width: '40%', borderRadius: '4px', marginTop: '6px' }} />
                      </div>
                    ))}
                  </div>
                )}

                {loadError && (
                  <div role="alert" style={{ padding: '1rem', color: '#991b1b', background: '#fef2f2', borderRadius: '8px', fontSize: '0.82rem' }}>
                    {loadError} <button type="button" onClick={loadStores}>Retry</button>
                  </div>
                )}

                {!loading && filteredStores.length === 0 && (
                  <div style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                    No establishments found matching search criteria.
                  </div>
                )}

                {filteredStores.map((store) => {
                  const statusInfo = getStoreStatusInfo(store)
                  const isSelected = store.id === selectedStoreId

                  return (
                    <div
                      key={store.id}
                      style={{
                        padding: '0.75rem 0.85rem',
                        borderRadius: '8px',
                        border: isSelected ? '2px solid #1e3a8a' : '1px solid #e2e8f0',
                        background: isSelected ? '#eff6ff' : '#ffffff',
                        transition: 'all 0.15s ease',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.45rem',
                        boxShadow: isSelected ? '0 2px 8px rgba(30, 58, 138, 0.12)' : 'none',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                        <strong style={{ fontSize: '0.88rem', color: '#0f172a', fontWeight: 700, lineHeight: 1.3 }}>
                          {store.store_name}
                        </strong>
                        <span
                          style={{
                            padding: '0.15rem 0.5rem',
                            borderRadius: '10px',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            background: statusInfo.bg,
                            color: statusInfo.color,
                            border: `1px solid ${statusInfo.border}`,
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}
                        >
                          {statusInfo.label}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.78rem', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                        <span>
                          <strong style={{ color: '#1e3a8a' }}>SEC #:</strong> {store.dti_sec_number || 'N/A'}
                        </span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <i className="fa-solid fa-location-dot" style={{ color: '#94a3b8', marginRight: '0.3rem' }} aria-hidden="true" />
                          {store.address}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.2rem' }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedStoreId(store.id)
                            setDetailStore(store)
                            setIsSidebarOpen(true)
                          }}
                          style={{
                            flex: 1,
                            padding: '0.35rem 0.5rem',
                            borderRadius: '6px',
                            border: '1px solid #bfdbfe',
                            background: isSelected ? '#1e3a8a' : '#eff6ff',
                            color: isSelected ? '#ffffff' : '#1e3a8a',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.3rem',
                          }}
                        >
                          <i className="fa-solid fa-circle-info" aria-hidden="true" /> Open Info
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label="Expand GIS Registry Sidebar"
              style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%', gap: '0.4rem', border: 0, background: 'transparent' }}
              title="Expand GIS Registry Sidebar"
            >
              <i className="fa-solid fa-map-location-dot" style={{ color: '#1e3a8a', fontSize: '1.2rem' }} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
