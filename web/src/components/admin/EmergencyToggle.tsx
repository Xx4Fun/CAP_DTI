import React, { useEffect, useState } from 'react'
import { adminApi } from '../../services/adminApi'
import { adminToast } from '../../services/adminToast'
import type { RegulatoryEmergencyRecord } from '../../types/admin'
import {
  Calendar,
  Database,
  Search,
  Shield,
  ShieldAlert,
} from 'lucide-react'

export interface AuthoritativePriceRecord {
  id: number
  regulatory_emergency_id: number
  commodity_key: string
  price_type: 'PRICE_FREEZE' | 'APC'
  authoritative_price: number
  effective_from: string
  effective_until: string | null
  source_reference: string
  declaration_reference?: string
}

export const EmergencyToggle: React.FC = () => {
  const [emergencies, setEmergencies] = useState<RegulatoryEmergencyRecord[]>([])
  const [emergencyPrices, setEmergencyPrices] = useState<AuthoritativePriceRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [savingAction, setSavingAction] = useState<string | null>(null)
  const [apcSearch, setApcSearch] = useState('')
  const [apcTypeFilter, setApcTypeFilter] = useState<'ALL' | 'PRICE_FREEZE' | 'APC'>('ALL')

  const loadEmergencies = () => {
    setLoading(true)
    setLoadError(null)
    void adminApi.getEmergencies().then((data) => {
      setEmergencies(data)
      setLoading(false)
    }).catch(() => {
      setEmergencies([])
      setLoadError('Could not load emergency declarations. Current market protocol is unavailable until the connection is restored.')
      setLoading(false)
    })
  }

  useEffect(() => {
    loadEmergencies()
  }, [])

  const activeEmergencies = emergencies.filter((e) => e.status === 'active')
  const isCalamityActive = activeEmergencies.length > 0

  const filteredPrices = emergencyPrices.filter((price) => {
    const matchesSearch = price.commodity_key.toLowerCase().includes(apcSearch.toLowerCase())
      || price.source_reference.toLowerCase().includes(apcSearch.toLowerCase())
    const matchesType = apcTypeFilter === 'ALL' || price.price_type === apcTypeFilter
    return matchesSearch && matchesType
  })

  return (
    <div className="admin-stack" style={{ display: 'grid', gap: '1.25rem' }}>
      {/* Prominent Emergency Command Bar */}
      <section
        style={{
          background: isCalamityActive ? 'linear-gradient(135deg, #7f1d1d 0%, #b91c1c 100%)' : 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          color: '#ffffff',
          borderRadius: '12px',
          padding: '1.25rem 1.5rem',
          boxShadow: '0 8px 24px rgba(15, 23, 42, 0.15)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '10px',
              background: isCalamityActive ? 'rgba(255, 255, 255, 0.2)' : 'rgba(37, 99, 235, 0.2)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isCalamityActive ? <ShieldAlert size={28} className="pulse" /> : <Shield size={28} style={{ color: '#60a5fa' }} />}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#ffffff' }}>
                State of Calamity Regulatory Command Bar
              </h2>
              <span
                style={{
                  padding: '0.25rem 0.65rem',
                  borderRadius: '20px',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  background: loadError ? '#fef3c7' : isCalamityActive ? '#fee2e2' : '#dcfce7',
                  color: loadError ? '#92400e' : isCalamityActive ? '#991b1b' : '#166534',
                  border: loadError ? '1px solid #fcd34d' : isCalamityActive ? '1px solid #fca5a5' : '1px solid #86efac',
                }}
              >
                {loadError ? 'MARKET PROTOCOL UNAVAILABLE' : isCalamityActive ? 'CALAMITY PROTOCOL ACTIVE' : 'NORMAL MARKET PROTOCOL'}
              </span>
            </div>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.84rem', color: 'rgba(255, 255, 255, 0.8)' }}>
              {loadError
                ? 'The declaration service could not be reached. No market status is being inferred.'
                : isCalamityActive
                  ? `Emergency price controls active across ${activeEmergencies.length} declared jurisdiction(s).`
                  : 'No active emergency declaration is recorded.'}
            </p>
          </div>
        </div>

      </section>

      {loadError && (
        <div role="alert" className="admin-alert admin-alert--error">
          <p>{loadError}</p>
          <button type="button" onClick={loadEmergencies}>Retry</button>
        </div>
      )}
      {actionError && <div role="alert" className="admin-alert admin-alert--error">{actionError}</div>}

      {/* Active Freeze Date Range Indicators Card */}
      <section className="admin-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#0f172a', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Calendar size={18} style={{ color: '#2563eb' }} /> Active Price Freeze & Calamity Date Range Indicators
            </h3>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: '#64748b' }}>
              Real-time monitoring of municipal declaration start dates and effective price freeze duration.
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.85rem' }}>
          {emergencies.length === 0 && (
            <div style={{ padding: '1.25rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.85rem' }}>
              No price freeze declarations currently recorded in system memory.
            </div>
          )}

          {emergencies.map((decl) => {
            const isActive = decl.status === 'active'
            const startDate = new Date(decl.starts_on)
            const today = new Date()
            const daysActive = Math.max(1, Math.floor((today.getTime() - startDate.getTime()) / (1000 * 3600 * 24)))

            return (
              <div
                key={decl.id}
                style={{
                  padding: '1rem',
                  borderRadius: '10px',
                  border: '1px solid',
                  borderColor: isActive ? '#fca5a5' : '#e2e8f0',
                  background: isActive ? '#fff5f5' : '#f8fafc',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <strong style={{ fontSize: '0.92rem', color: '#0f172a', fontFamily: 'monospace' }}>{decl.declaration_reference}</strong>
                    <span style={{ display: 'block', fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>{decl.location}</span>
                  </div>
                  <span
                    style={{
                      padding: '0.2rem 0.5rem',
                      borderRadius: '12px',
                      fontSize: '0.7rem',
                      fontWeight: 800,
                      background: isActive ? '#dc2626' : '#94a3b8',
                      color: '#ffffff',
                    }}
                  >
                    {isActive ? `ACTIVE (Day ${daysActive})` : decl.status.toUpperCase()}
                  </span>
                </div>

                <div style={{ marginTop: '0.75rem', paddingTop: '0.65rem', borderTop: '1px dashed #cbd5e1', fontSize: '0.8rem', color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Start: <strong>{decl.starts_on}</strong></span>
                  <span>End: <strong>{decl.ends_on || 'Open / Indefinite'}</strong></span>
                </div>
              </div>
            )
          })}
        </div>
      </section>

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
            setActionError(null)
            setSavingAction('declaration')
            try {
              await adminApi.createEmergency({
                location: form.get('location'),
                starts_on: form.get('starts_on'),
                ends_on: form.get('ends_on') || null,
                declaration_reference: form.get('reference'),
                confirmed: form.get('confirmed') === 'on',
              })
              adminToast.success('Emergency declaration recorded.', { id: 'emergency-declaration-created' })
              await loadEmergencies()
              element.reset()
            } catch (error: any) {
              const message = error.response?.data?.message || 'The emergency declaration could not be recorded.'
              setActionError(message)
              adminToast.error(message, { id: 'emergency-declaration-error' })
            } finally {
              setSavingAction(null)
            }
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
            disabled={savingAction !== null}
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
            {savingAction === 'declaration' ? 'Recording declaration...' : 'Record declaration'}
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
                            setActionError(null)
                            setSavingAction(`end-${emergency.id}`)
                            try {
                              await adminApi.updateEmergency(emergency.id, {
                                status: 'ended',
                                ends_on: new Date().toISOString().slice(0, 10),
                                confirmed: true,
                              })
                              await loadEmergencies()
                              adminToast.success('Emergency declaration ended.', { id: 'emergency-declaration-ended' })
                            } catch (error: any) {
                              const message = error.response?.data?.message || 'The emergency declaration could not be ended.'
                              setActionError(message)
                              adminToast.error(message, { id: 'emergency-declaration-end-error' })
                            } finally {
                              setSavingAction(null)
                            }
                          }}
                          disabled={savingAction !== null}
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
                          {savingAction === `end-${emergency.id}` ? 'Ending...' : 'End declaration'}
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

      {/* APC Ceiling Lookup Table & Search Workspace */}
      <section className="admin-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#0f172a', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Database size={18} style={{ color: '#1d4ed8' }} /> Authoritative APC Ceiling & Price Freeze Lookup Table
            </h3>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: '#64748b' }}>
              Registered emergency ceiling prices under active municipal and provincial declarations.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
            <div className="admin-search-field" style={{ width: '220px' }}>
              <Search size={16} aria-hidden="true" />
              <input
                type="text"
                placeholder="Filter commodity key..."
                value={apcSearch}
                onChange={(e) => setApcSearch(e.target.value)}
                style={{ padding: '0.45rem 0.65rem 0.45rem 2.2rem', fontSize: '0.82rem' }}
              />
            </div>

            <select
              value={apcTypeFilter}
              onChange={(e) => setApcTypeFilter(e.target.value as any)}
              style={{ padding: '0.45rem 0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
            >
              <option value="ALL">All Authorities</option>
              <option value="PRICE_FREEZE">Price Freeze</option>
              <option value="APC">APC Ceiling</option>
            </select>
          </div>
        </div>

        <div className="admin-table-wrap" style={{ overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px', background: '#ffffff' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.76rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>Commodity Key</th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.76rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>Authority</th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.76rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>Authoritative Price (₱)</th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.76rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>Source Reference</th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.76rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>Effective Period</th>
              </tr>
            </thead>
            <tbody>
              {filteredPrices.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b' }}>
                    {emergencyPrices.length === 0
                      ? 'No authoritative emergency price records are available. Records appear here only after the API confirms a saved source.'
                      : 'No authoritative price records matched the current filter.'}
                  </td>
                </tr>
              ) : (
                filteredPrices.map((item) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 700, color: '#0f172a' }}>
                      {item.commodity_key}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span
                        style={{
                          padding: '0.2rem 0.55rem',
                          borderRadius: '12px',
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          background: item.price_type === 'APC' ? '#eff6ff' : '#fef2f2',
                          color: item.price_type === 'APC' ? '#1d4ed8' : '#dc2626',
                          border: item.price_type === 'APC' ? '1px solid #bfdbfe' : '1px solid #fca5a5',
                        }}
                      >
                        {item.price_type === 'APC' ? 'APC Ceiling' : 'Price Freeze'}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 800, color: '#1e3a8a', fontSize: '0.95rem' }}>
                      ₱{item.authoritative_price.toFixed(2)}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#475569' }}>
                      {item.source_reference}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.82rem', color: '#64748b' }}>
                      {item.effective_from} to {item.effective_until || 'active'}
                    </td>
                  </tr>
                ))
              )}
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
            const emId = Number(form.get('emergency_id'))
            const commKey = String(form.get('commodity_key'))
            const pType = form.get('price_type') as 'PRICE_FREEZE' | 'APC'
            const authPrice = Number(form.get('authoritative_price'))
            const effFrom = String(form.get('effective_from'))
            const effUntil = (form.get('effective_until') as string) || null
            const srcRef = String(form.get('source_reference'))

            setActionError(null)
            setSavingAction('price')
            try {
              const savedRecord = await adminApi.createEmergencyPrice({
                regulatory_emergency_id: emId,
                commodity_key: commKey,
                price_type: pType,
                authoritative_price: authPrice,
                effective_from: effFrom,
                effective_until: effUntil,
                source_reference: srcRef,
              }) as AuthoritativePriceRecord
              setEmergencyPrices((prev) => [savedRecord, ...prev])
              adminToast.success('Authoritative emergency price recorded.', { id: 'emergency-price-created' })
              element.reset()
            } catch (error: any) {
              const message = error.response?.data?.message || 'The authoritative emergency price could not be recorded.'
              setActionError(message)
              adminToast.error(message, { id: 'emergency-price-error' })
            } finally {
              setSavingAction(null)
            }
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
            disabled={savingAction !== null}
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
            {savingAction === 'price' ? 'Saving authoritative price...' : 'Save authoritative price record'}
          </button>
        </form>
      </section>

    </div>
  )
}
