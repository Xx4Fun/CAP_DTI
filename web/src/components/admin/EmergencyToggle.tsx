import React, { useEffect, useState } from 'react'
import { adminApi } from '../../services/adminApi'
import type { RegulatoryEmergencyRecord } from '../../types/admin'

export const EmergencyToggle: React.FC = () => {
  const [message, setMessage] = useState('')
  const [emergencies, setEmergencies] = useState<RegulatoryEmergencyRecord[]>([])
  const [loading, setLoading] = useState(false)

  const loadEmergencies = () => {
    setLoading(true)
    void adminApi.getEmergencies().then((data) => {
      setEmergencies(data)
      setLoading(false)
    })
  }

  useEffect(() => {
    loadEmergencies()
  }, [])

  return (
    <div className="admin-stack" style={{ display: 'grid', gap: '1.25rem' }}>
      {/* Declaration Control Card */}
      <section className="admin-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem' }}>
        <h3 style={{ margin: '0 0 0.4rem', fontSize: '1.1rem', color: '#0f172a', fontWeight: 700 }}>
          Declaration control
        </h3>

        <form
          className="admin-form"
          onSubmit={async (event) => {
            event.preventDefault()
            const element = event.currentTarget
            const form = new FormData(element)
            await adminApi.createEmergency({
              location: form.get('location'),
              starts_on: form.get('starts_on'),
              ends_on: form.get('ends_on') || null,
              declaration_reference: form.get('reference'),
              confirmed: form.get('confirmed') === 'on',
            })
            setMessage('Emergency declaration recorded.')
            await loadEmergencies()
            element.reset()
          }}
          style={{ display: 'grid', gap: '0.85rem' }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
            <div>
              <label htmlFor="decl-location" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.3rem' }}>
                Location
              </label>
              <input
                id="decl-location"
                name="location"
                required
                style={{ width: '100%', padding: '0.6rem', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#ffffff', color: '#0f172a' }}
              />
            </div>

            <div>
              <label htmlFor="decl-reference" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.3rem' }}>
                Declaration reference
              </label>
              <input
                id="decl-reference"
                name="reference"
                required
                style={{ width: '100%', padding: '0.6rem', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#ffffff', color: '#0f172a' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
            <div>
              <label htmlFor="decl-starts-on" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.3rem' }}>
                Start date
              </label>
              <input
                id="decl-starts-on"
                name="starts_on"
                type="date"
                required
                style={{ width: '100%', padding: '0.6rem', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#ffffff', color: '#0f172a' }}
              />
            </div>

            <div>
              <label htmlFor="decl-ends-on" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.3rem' }}>
                End date
              </label>
              <input
                id="decl-ends-on"
                name="ends_on"
                type="date"
                style={{ width: '100%', padding: '0.6rem', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#ffffff', color: '#0f172a' }}
              />
            </div>
          </div>

          <label className="check-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#0f172a', cursor: 'pointer' }}>
            <input name="confirmed" type="checkbox" required style={{ width: '18px', height: '18px' }} />
            I confirm this declaration and accept responsibility for the record.
          </label>

          <button
            type="submit"
            style={{
              padding: '0.65rem 1.2rem',
              background: '#dc2626',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 700,
              cursor: 'pointer',
              justifySelf: 'start',
            }}
          >
            Record declaration
          </button>
        </form>

        <div className="admin-table-wrap" style={{ overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px', background: '#ffffff', marginTop: '1rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.76rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>Declaration</th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.76rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>Location</th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.76rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>Dates</th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.76rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={4} style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b' }}>
                    Loading emergency records...
                  </td>
                </tr>
              )}
              {!loading && emergencies.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b' }}>
                    No emergency declarations recorded.
                  </td>
                </tr>
              )}
              {emergencies.map((emergency) => (
                <tr key={emergency.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 700, color: '#1e3a8a' }}>
                    {emergency.declaration_reference}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.88rem', color: '#0f172a' }}>{emergency.location}</td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#64748b' }}>
                    {emergency.starts_on} to {emergency.ends_on || 'open'}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    {emergency.status === 'active' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>active</span>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!window.confirm('Confirm that this emergency declaration has ended?')) return
                            await adminApi.updateEmergency(emergency.id, {
                              status: 'ended',
                              ends_on: new Date().toISOString().slice(0, 10),
                              confirmed: true,
                            })
                            await loadEmergencies()
                          }}
                          style={{
                            padding: '0.25rem 0.55rem',
                            borderRadius: '6px',
                            border: '1px solid #e2e8f0',
                            background: '#ffffff',
                            color: '#0f172a',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                          }}
                        >
                          End declaration
                        </button>
                      </div>
                    ) : (
                      <span>{emergency.status}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Price Freeze & APC Ceiling Form Card */}
      <section className="admin-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem' }}>
        <h3 style={{ margin: '0 0 0.4rem', fontSize: '1.1rem', color: '#0f172a', fontWeight: 700 }}>
          Authoritative emergency price
        </h3>
        <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: '#64748b' }}>
          Enter only an official Price Freeze or APC source. Normal SRP is not accepted here.
        </p>

        <form
          className="admin-form"
          onSubmit={async (event) => {
            event.preventDefault()
            const element = event.currentTarget
            const form = new FormData(element)
            await adminApi.createEmergencyPrice({
              regulatory_emergency_id: Number(form.get('emergency_id')),
              commodity_key: String(form.get('commodity_key')),
              price_type: form.get('price_type') as any,
              authoritative_price: Number(form.get('authoritative_price')),
              effective_from: String(form.get('effective_from')),
              effective_until: (form.get('effective_until') as string) || null,
              source_reference: String(form.get('source_reference')),
            })
            setMessage('Authoritative emergency price recorded.')
            element.reset()
          }}
          style={{ display: 'grid', gap: '0.85rem' }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
            <div>
              <label htmlFor="em-decl-select" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.3rem' }}>
                Confirmed declaration
              </label>
              <select
                id="em-decl-select"
                name="emergency_id"
                required
                defaultValue=""
                style={{ width: '100%', padding: '0.6rem', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#ffffff', color: '#0f172a' }}
              >
                <option value="" disabled>Select an active declaration</option>
                {emergencies
                  .filter((item) => item.status === 'active')
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.declaration_reference} | {item.location}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label htmlFor="commodity-key-input" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.3rem' }}>
                Commodity key
              </label>
              <input
                id="commodity-key-input"
                name="commodity_key"
                required
                style={{ width: '100%', padding: '0.6rem', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#ffffff', color: '#0f172a' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.85rem' }}>
            <div>
              <label htmlFor="price-authority-select" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.3rem' }}>
                Price authority
              </label>
              <select
                id="price-authority-select"
                name="price_type"
                required
                defaultValue=""
                style={{ width: '100%', padding: '0.6rem', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#ffffff', color: '#0f172a' }}
              >
                <option value="" disabled>Select authority</option>
                <option value="PRICE_FREEZE">Price Freeze</option>
                <option value="APC">APC ceiling</option>
              </select>
            </div>

            <div>
              <label htmlFor="authoritative-price-input" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.3rem' }}>
                Authoritative price
              </label>
              <input
                id="authoritative-price-input"
                name="authoritative_price"
                type="number"
                min="0"
                step="0.01"
                required
                style={{ width: '100%', padding: '0.6rem', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#ffffff', color: '#0f172a', fontFamily: 'monospace' }}
              />
            </div>

            <div>
              <label htmlFor="source-ref-input" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.3rem' }}>
                Source reference
              </label>
              <input
                id="source-ref-input"
                name="source_reference"
                required
                style={{ width: '100%', padding: '0.6rem', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#ffffff', color: '#0f172a' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
            <div>
              <label htmlFor="effective-from-input" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.3rem' }}>
                Effective from
              </label>
              <input
                id="effective-from-input"
                name="effective_from"
                type="date"
                required
                style={{ width: '100%', padding: '0.6rem', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#ffffff', color: '#0f172a' }}
              />
            </div>

            <div>
              <label htmlFor="effective-until-input" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.3rem' }}>
                Effective until
              </label>
              <input
                id="effective-until-input"
                name="effective_until"
                type="date"
                style={{ width: '100%', padding: '0.6rem', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#ffffff', color: '#0f172a' }}
              />
            </div>
          </div>

          <button
            type="submit"
            style={{
              padding: '0.6rem 1.1rem',
              background: '#1d4ed8',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer',
              justifySelf: 'start',
            }}
          >
            Save authoritative price record
          </button>
        </form>
      </section>

      {message && (
        <p role="status" style={{ margin: 0, color: '#059669', fontSize: '0.85rem', fontWeight: 600 }}>
          {message}
        </p>
      )}
    </div>
  )
}
