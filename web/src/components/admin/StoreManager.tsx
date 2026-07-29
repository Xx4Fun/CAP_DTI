import React, { useEffect, useState } from 'react'
import { adminApi } from '../../services/adminApi'
import type { StoreRecord } from '../../types/admin'
import { StoreOnboarding } from '../StoreOnboarding'

export const StoreManager: React.FC = () => {
  const [stores, setStores] = useState<StoreRecord[]>([])
  const [searchTerm, setSearchTerm] = useState('')
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

  const filteredStores = stores.filter(
    (s) =>
      s.store_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.dti_sec_number || '').toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="admin-stack" style={{ display: 'grid', gap: '1.25rem' }}>
      <StoreOnboarding onCreated={loadStores} />

      <div className="admin-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', fontWeight: 700 }}>Registered Commercial Establishments</h3>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: '#64748b' }}>
              Manage active state, official verification, public GIS visibility, and vendor invitations.
            </p>
          </div>

          <div style={{ width: '280px' }}>
            <input
              type="text"
              placeholder="🔍 Search stores by name or SEC..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '0.55rem 0.85rem',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                background: '#ffffff',
                color: '#0f172a',
                fontSize: '0.85rem',
              }}
            />
          </div>
        </div>

        <div className="admin-table-wrap" style={{ overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px', background: '#ffffff' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.76rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>Establishment</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.76rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>SEC Number</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontSize: '0.76rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>Active</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontSize: '0.76rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>Verified</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontSize: '0.76rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>Public GIS</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontSize: '0.76rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>Recidivism Index</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontSize: '0.76rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b' }}>
                    Loading stores list...
                  </td>
                </tr>
              )}
              {!loading && filteredStores.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b' }}>
                    No commercial establishments match search filter.
                  </td>
                </tr>
              )}
              {filteredStores.map((store) => {
                const recidivism = store.recidivism_index || 0
                return (
                  <tr key={store.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <strong style={{ color: '#0f172a', fontSize: '0.9rem', display: 'block' }}>{store.store_name}</strong>
                      <small style={{ color: '#64748b', fontSize: '0.78rem' }}>{store.address}</small>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontSize: '0.82rem', color: '#1e3a8a' }}>
                      {store.dti_sec_number || 'N/A'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      <button
                        className="status-control"
                        onClick={() => void toggle(store, 'is_active')}
                        aria-pressed={store.is_active}
                        style={{
                          padding: '0.3rem 0.65rem',
                          borderRadius: '6px',
                          fontWeight: 600,
                          fontSize: '0.75rem',
                          border: store.is_active ? '1px solid #a7f3d0' : '1px solid #fecaca',
                          background: store.is_active ? '#ecfdf5' : '#fef2f2',
                          color: store.is_active ? '#059669' : '#dc2626',
                          cursor: 'pointer',
                        }}
                      >
                        {store.is_active ? 'Active' : 'Disabled'}
                      </button>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      <button
                        className="status-control"
                        onClick={() => void toggle(store, 'is_verified')}
                        aria-pressed={store.is_verified}
                        style={{
                          padding: '0.3rem 0.65rem',
                          borderRadius: '6px',
                          fontWeight: 600,
                          fontSize: '0.75rem',
                          border: store.is_verified ? '1px solid #a7f3d0' : '1px solid #fed7aa',
                          background: store.is_verified ? '#ecfdf5' : '#fffbeb',
                          color: store.is_verified ? '#059669' : '#d97706',
                          cursor: 'pointer',
                        }}
                      >
                        {store.is_verified ? 'Verified' : 'Unverified'}
                      </button>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      <button
                        className="status-control"
                        onClick={() => void toggle(store, 'is_public')}
                        aria-pressed={store.is_public}
                        style={{
                          padding: '0.3rem 0.65rem',
                          borderRadius: '6px',
                          fontWeight: 600,
                          fontSize: '0.75rem',
                          border: store.is_public ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
                          background: store.is_public ? '#eff6ff' : '#f8fafc',
                          color: store.is_public ? '#1e3a8a' : '#64748b',
                          cursor: 'pointer',
                        }}
                      >
                        {store.is_public ? 'Public' : 'Private'}
                      </button>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '0.2rem 0.6rem',
                          borderRadius: '12px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          background: recidivism > 0 ? '#fef2f2' : '#ecfdf5',
                          color: recidivism > 0 ? '#dc2626' : '#059669',
                          border: recidivism > 0 ? '1px solid #fecaca' : '1px solid #a7f3d0',
                        }}
                      >
                        {recidivism > 0 ? `${recidivism} confirmed ${recidivism === 1 ? 'finding' : 'findings'}` : '0 Clean'}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      <button
                        onClick={() => setInviteFor(store.id)}
                        style={{
                          padding: '0.4rem 0.75rem',
                          borderRadius: '6px',
                          border: '1px solid #1d4ed8',
                          background: '#ffffff',
                          color: '#1d4ed8',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Invite vendor
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

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
