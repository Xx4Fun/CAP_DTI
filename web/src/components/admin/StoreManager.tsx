import React, { useEffect, useState } from 'react'
import { adminApi } from '../../services/adminApi'
import type { StoreRecord } from '../../types/admin'
import { StoreMap, getStoreStatusInfo } from './StoreMap'
import { StoreDetailOverlay } from './StoreDetailOverlay'

type StatusFilter = 'all' | 'compliant' | 'anomaly' | 'flagged'

export const StoreManager: React.FC = () => {
  const [stores, setStores] = useState<StoreRecord[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null)
  const [detailStore, setDetailStore] = useState<StoreRecord | null>(null)
  const [centerTrigger, setCenterTrigger] = useState<{ storeId: number; timestamp: number } | null>(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [inviteStore, setInviteStore] = useState<StoreRecord | null>(null)
  const [email, setEmail] = useState('')
  const [link, setLink] = useState('')
  const [loading, setLoading] = useState(false)

  const loadStores = () => {
    setLoading(true)
    void adminApi.getStores().then((data) => {
      setStores(data)
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
    compliant: stores.filter((s) => (s.recidivism_index || 0) === 0 && s.is_active && s.is_verified).length,
    anomaly: stores.filter((s) => !s.is_verified || (!s.is_active && (s.recidivism_index || 0) === 0)).length,
    flagged: stores.filter((s) => (s.recidivism_index || 0) > 0 || !s.is_active).length,
  }

  const filteredStores = stores.filter((s) => {
    const matchesSearch =
      s.store_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.dti_sec_number || '').toLowerCase().includes(searchTerm.toLowerCase())

    if (!matchesSearch) return false

    const recidivism = s.recidivism_index || 0
    if (statusFilter === 'compliant') return recidivism === 0 && s.is_active && s.is_verified
    if (statusFilter === 'anomaly') return !s.is_verified || (!s.is_active && recidivism === 0)
    if (statusFilter === 'flagged') return recidivism > 0 || !s.is_active

    return true
  })

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
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} /> {counts.compliant} Clean
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: '#d97706' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b' }} /> {counts.anomaly} Anomaly
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: '#dc2626' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }} /> {counts.flagged} Flagged
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
            <StoreDetailOverlay
              store={detailStore}
              onClose={() => setDetailStore(null)}
              onCenterMap={() => handleCenterStore(detailStore.id)}
              onInviteVendor={(store) => {
                setInviteStore(store)
                setEmail('')
                setLink('')
              }}
            />
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
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('all')}
                    style={{
                      padding: '0.3rem 0.65rem',
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
                    onClick={() => setStatusFilter('compliant')}
                    style={{
                      padding: '0.3rem 0.65rem',
                      borderRadius: '6px',
                      border: statusFilter === 'compliant' ? '1px solid #059669' : '1px solid #e2e8f0',
                      background: statusFilter === 'compliant' ? '#ecfdf5' : '#ffffff',
                      color: statusFilter === 'compliant' ? '#059669' : '#64748b',
                      fontSize: '0.76rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Clean ({counts.compliant})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('anomaly')}
                    style={{
                      padding: '0.3rem 0.65rem',
                      borderRadius: '6px',
                      border: statusFilter === 'anomaly' ? '1px solid #d97706' : '1px solid #e2e8f0',
                      background: statusFilter === 'anomaly' ? '#fffbeb' : '#ffffff',
                      color: statusFilter === 'anomaly' ? '#d97706' : '#64748b',
                      fontSize: '0.76rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Anomaly ({counts.anomaly})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('flagged')}
                    style={{
                      padding: '0.3rem 0.65rem',
                      borderRadius: '6px',
                      border: statusFilter === 'flagged' ? '1px solid #dc2626' : '1px solid #e2e8f0',
                      background: statusFilter === 'flagged' ? '#fef2f2' : '#ffffff',
                      color: statusFilter === 'flagged' ? '#dc2626' : '#64748b',
                      fontSize: '0.76rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Flagged ({counts.flagged})
                  </button>
                </div>
              </div>

              {/* Scrollable Store Cards List */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '0.65rem 0.85rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {loading && (
                  <div style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                    Loading establishments...
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
                      onClick={() => setSelectedStoreId(store.id)}
                      style={{
                        padding: '0.75rem 0.85rem',
                        borderRadius: '8px',
                        border: isSelected ? '2px solid #1e3a8a' : '1px solid #e2e8f0',
                        background: isSelected ? '#eff6ff' : '#ffffff',
                        cursor: 'pointer',
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

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setInviteStore(store)
                            setEmail('')
                            setLink('')
                          }}
                          style={{
                            padding: '0.35rem 0.6rem',
                            borderRadius: '6px',
                            border: '1px solid #cbd5e1',
                            background: '#ffffff',
                            color: '#475569',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.3rem',
                          }}
                        >
                          <i className="fa-solid fa-envelope" aria-hidden="true" /> Invite
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div
              onClick={toggleSidebar}
              style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '0.4rem' }}
              title="Expand GIS Registry Sidebar"
            >
              <i className="fa-solid fa-map-location-dot" style={{ color: '#1e3a8a', fontSize: '1.2rem' }} aria-hidden="true" />
            </div>
          )}
        </div>
      </div>

      {/* Vendor Invitation Modal */}
      {inviteStore && (
        <div
          className="admin-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setInviteStore(null)
            }
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              padding: '1.5rem',
              width: '100%',
              maxWidth: '480px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <i className="fa-solid fa-envelope" style={{ color: '#1e3a8a', fontSize: '1.1rem' }} aria-hidden="true" />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>
                  Invite Vendor: {inviteStore.store_name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInviteStore(null)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.1rem', cursor: 'pointer', padding: '0.2rem' }}
                aria-label="Close modal"
              >
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            </div>

            <form
              onSubmit={async (event) => {
                event.preventDefault()
                const result = await adminApi.inviteVendor(inviteStore.id, email)
                setLink(result.invitation_url)
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
            >
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.35rem' }}>
                  Vendor Owner Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="owner@establishment.ph"
                  required
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.75rem',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    background: '#ffffff',
                    color: '#0f172a',
                    fontSize: '0.85rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {link && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#059669', marginBottom: '0.35rem' }}>
                    One-time onboarding URL generated
                  </label>
                  <input
                    readOnly
                    value={link}
                    onFocus={(event) => event.currentTarget.select()}
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.75rem',
                      border: '1px solid #a7f3d0',
                      borderRadius: '8px',
                      background: '#ecfdf5',
                      color: '#047857',
                      fontFamily: 'monospace',
                      fontSize: '0.8rem',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setInviteStore(null)}
                  style={{
                    padding: '0.55rem 1rem',
                    background: '#f1f5f9',
                    color: '#475569',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '0.55rem 1.1rem',
                    background: '#1d4ed8',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}
                >
                  <i className="fa-solid fa-paper-plane" aria-hidden="true" /> Generate Invitation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

