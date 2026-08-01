import React, { useEffect, useState } from 'react'
import { adminApi } from '../../services/adminApi'
import type { StoreRecord } from '../../types/admin'
import { StoreOnboarding } from '../StoreOnboarding'
import { StoreMap, getStoreStatusInfo } from './StoreMap'
import { Building2, Search, Plus, MapPin, Mail } from 'lucide-react'

type StatusFilter = 'all' | 'compliant' | 'anomaly' | 'flagged'

export const StoreManager: React.FC = () => {
  const [stores, setStores] = useState<StoreRecord[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [inviteFor, setInviteFor] = useState<number | null>(null)
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

  const toggle = async (store: StoreRecord, field: 'is_active' | 'is_verified' | 'is_public') => {
    const updated = await adminApi.updateStore(store.id, { [field]: !store[field] })
    setStores((current) => current.map((item) => (item.id === updated.id ? updated : item)))
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
    <div className="admin-stack" style={{ display: 'grid', gap: '1.25rem' }}>
      {/* Onboarding Drawer / Collapsible Header */}
      {showOnboarding && (
        <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>Onboard New Establishment</h3>
            <button
              onClick={() => setShowOnboarding(false)}
              style={{ padding: '0.35rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#f8fafc', fontSize: '0.8rem', cursor: 'pointer' }}
            >
              Close Panel
            </button>
          </div>
          <StoreOnboarding
            onCreated={() => {
              loadStores()
              setShowOnboarding(false)
            }}
          />
        </div>
      )}

      {/* Main Registry Command Bar & Split View Container */}
      <div className="admin-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem' }}>
        {/* Header & Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Building2 size={20} style={{ color: '#1e3a8a' }} />
              <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a', fontWeight: 700 }}>Commercial Establishment Registry</h3>
            </div>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: '#64748b' }}>
              GIS store mapping, verification state, compliance monitoring, and vendor invitation portal.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', width: '260px' }}>
              <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Search stores or SEC #..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.55rem 0.85rem 0.55rem 2.2rem',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  background: '#ffffff',
                  color: '#0f172a',
                  fontSize: '0.85rem',
                }}
              />
            </div>

            <button
              type="button"
              onClick={() => setShowOnboarding(!showOnboarding)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.55rem 0.9rem',
                borderRadius: '8px',
                background: '#1e3a8a',
                color: '#ffffff',
                border: 'none',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              <Plus size={16} /> Onboard Establishment
            </button>
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            style={{
              padding: '0.4rem 0.85rem',
              borderRadius: '6px',
              border: statusFilter === 'all' ? '1px solid #1e3a8a' : '1px solid #e2e8f0',
              background: statusFilter === 'all' ? '#eff6ff' : '#f8fafc',
              color: statusFilter === 'all' ? '#1e3a8a' : '#64748b',
              fontSize: '0.82rem',
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
              padding: '0.4rem 0.85rem',
              borderRadius: '6px',
              border: statusFilter === 'compliant' ? '1px solid #059669' : '1px solid #e2e8f0',
              background: statusFilter === 'compliant' ? '#ecfdf5' : '#f8fafc',
              color: statusFilter === 'compliant' ? '#059669' : '#64748b',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Compliant ({counts.compliant})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('anomaly')}
            style={{
              padding: '0.4rem 0.85rem',
              borderRadius: '6px',
              border: statusFilter === 'anomaly' ? '1px solid #d97706' : '1px solid #e2e8f0',
              background: statusFilter === 'anomaly' ? '#fffbeb' : '#f8fafc',
              color: statusFilter === 'anomaly' ? '#d97706' : '#64748b',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Minor Anomaly ({counts.anomaly})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('flagged')}
            style={{
              padding: '0.4rem 0.85rem',
              borderRadius: '6px',
              border: statusFilter === 'flagged' ? '1px solid #dc2626' : '1px solid #e2e8f0',
              background: statusFilter === 'flagged' ? '#fef2f2' : '#f8fafc',
              color: statusFilter === 'flagged' ? '#dc2626' : '#64748b',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Flagged / Recidivist ({counts.flagged})
          </button>
        </div>

        {/* Executive Split View: Table (Left) + GIS Map (Right) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: '1.25rem', alignItems: 'start' }}>
          {/* Left Table Section */}
          <div className="admin-table-wrap" style={{ overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px', background: '#ffffff' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.76rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>
                    Establishment
                  </th>
                  <th style={{ padding: '0.75rem 0.75rem', textAlign: 'left', fontSize: '0.76rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>
                    SEC Number
                  </th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', fontSize: '0.76rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>
                    Active
                  </th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', fontSize: '0.76rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>
                    Verified
                  </th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', fontSize: '0.76rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>
                    GIS Status
                  </th>
                  <th style={{ padding: '0.75rem 0.75rem', textAlign: 'center', fontSize: '0.76rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={6} style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b' }}>
                      Loading store registry...
                    </td>
                  </tr>
                )}
                {!loading && filteredStores.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b' }}>
                      No commercial establishments match selected status filter or search criteria.
                    </td>
                  </tr>
                )}
                {filteredStores.map((store) => {
                  const statusInfo = getStoreStatusInfo(store)
                  const isSelected = store.id === selectedStoreId

                  return (
                    <tr
                      key={store.id}
                      onClick={() => setSelectedStoreId(store.id)}
                      style={{
                        borderBottom: '1px solid #e2e8f0',
                        background: isSelected ? '#eff6ff' : 'transparent',
                        cursor: 'pointer',
                        transition: 'background-color 0.15s ease',
                      }}
                    >
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <strong style={{ color: '#0f172a', fontSize: '0.88rem', display: 'block' }}>{store.store_name}</strong>
                        <small style={{ color: '#64748b', fontSize: '0.76rem' }}>{store.address}</small>
                        <div style={{ marginTop: '0.25rem' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '0.15rem 0.5rem',
                              borderRadius: '10px',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              background: statusInfo.bg,
                              color: statusInfo.color,
                              border: `1px solid ${statusInfo.border}`,
                            }}
                          >
                            {statusInfo.label}
                          </span>
                        </div>
                      </td>

                      <td style={{ padding: '0.75rem 0.75rem', fontFamily: 'monospace', fontSize: '0.8rem', color: '#1e3a8a' }}>
                        {store.dti_sec_number || 'N/A'}
                      </td>

                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                        <button
                          className="status-control"
                          onClick={(e) => {
                            e.stopPropagation()
                            void toggle(store, 'is_active')
                          }}
                          aria-pressed={store.is_active}
                          style={{
                            padding: '0.25rem 0.55rem',
                            borderRadius: '6px',
                            fontWeight: 600,
                            fontSize: '0.72rem',
                            border: store.is_active ? '1px solid #a7f3d0' : '1px solid #fecaca',
                            background: store.is_active ? '#ecfdf5' : '#fef2f2',
                            color: store.is_active ? '#059669' : '#dc2626',
                            cursor: 'pointer',
                          }}
                        >
                          {store.is_active ? 'Active' : 'Disabled'}
                        </button>
                      </td>

                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                        <button
                          className="status-control"
                          onClick={(e) => {
                            e.stopPropagation()
                            void toggle(store, 'is_verified')
                          }}
                          aria-pressed={store.is_verified}
                          style={{
                            padding: '0.25rem 0.55rem',
                            borderRadius: '6px',
                            fontWeight: 600,
                            fontSize: '0.72rem',
                            border: store.is_verified ? '1px solid #a7f3d0' : '1px solid #fed7aa',
                            background: store.is_verified ? '#ecfdf5' : '#fffbeb',
                            color: store.is_verified ? '#059669' : '#d97706',
                            cursor: 'pointer',
                          }}
                        >
                          {store.is_verified ? 'Verified' : 'Unverified'}
                        </button>
                      </td>

                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                        <button
                          className="status-control"
                          onClick={(e) => {
                            e.stopPropagation()
                            void toggle(store, 'is_public')
                          }}
                          aria-pressed={store.is_public}
                          style={{
                            padding: '0.25rem 0.55rem',
                            borderRadius: '6px',
                            fontWeight: 600,
                            fontSize: '0.72rem',
                            border: store.is_public ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
                            background: store.is_public ? '#eff6ff' : '#f8fafc',
                            color: store.is_public ? '#1e3a8a' : '#64748b',
                            cursor: 'pointer',
                          }}
                        >
                          {store.is_public ? 'Public' : 'Private'}
                        </button>
                      </td>

                      <td style={{ padding: '0.75rem 0.75rem', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'center' }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedStoreId(store.id)
                            }}
                            title="Center on GIS Map"
                            style={{
                              padding: '0.3rem 0.5rem',
                              borderRadius: '6px',
                              border: '1px solid #bfdbfe',
                              background: '#eff6ff',
                              color: '#1e3a8a',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.2rem',
                            }}
                          >
                            <MapPin size={13} /> Map
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setInviteFor(store.id)
                            }}
                            title="Invite Vendor"
                            style={{
                              padding: '0.3rem 0.5rem',
                              borderRadius: '6px',
                              border: '1px solid #cbd5e1',
                              background: '#ffffff',
                              color: '#475569',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.2rem',
                            }}
                          >
                            <Mail size={13} /> Invite
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Right GIS Map Panel */}
          <div>
            <StoreMap
              stores={filteredStores}
              selectedStoreId={selectedStoreId}
              onSelectStore={(store) => setSelectedStoreId(store.id)}
              height="480px"
              title="CartoDB Light GIS Store Registry Map"
            />
          </div>
        </div>
      </div>

      {/* Vendor Invitation Modal / Inline Form */}
      {inviteFor && (
        <form
          className="admin-inline-form"
          onSubmit={async (event) => {
            event.preventDefault()
            const result = await adminApi.inviteVendor(inviteFor, email)
            setLink(result.invitation_url)
          }}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '1rem',
            padding: '1.25rem',
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)',
          }}
        >
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#0f172a' }}>
                Vendor Owner Email Address
              </label>
              <button
                type="button"
                onClick={() => {
                  setInviteFor(null)
                  setLink('')
                  setEmail('')
                }}
                style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '0.75rem', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="owner@establishment.ph"
              required
              style={{
                width: '100%',
                padding: '0.6rem 0.75rem',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                background: '#ffffff',
                color: '#0f172a',
              }}
            />
            <button
              type="submit"
              style={{
                marginTop: '0.75rem',
                padding: '0.55rem 1rem',
                background: '#1d4ed8',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Generate Expiring Vendor Link
            </button>
          </div>

          <div>
            {link ? (
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
                  }}
                />
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', alignSelf: 'center' }}>
                Generate an onboarding link to allow store owners to access their Vendor Portal and submit legal notice rebuttals.
              </p>
            )}
          </div>
        </form>
      )}
    </div>
  )
}

