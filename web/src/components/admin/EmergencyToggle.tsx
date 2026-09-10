import React, { useEffect, useMemo, useState } from 'react'
import { Calendar, Database, RefreshCw, Shield, ShieldAlert } from 'lucide-react'
import { adminApi } from '../../services/adminApi'
import { adminToast } from '../../services/adminToast'
import type { RegulatoryEmergencyRecord } from '../../types/admin'

const SAN_JOSE = 'San Jose de Buenavista, Antique'
const money = (value: number) => `₱${Number(value).toFixed(2)}`
const day = (value: string | null) => value ? value.slice(0, 10) : '—'
const manilaToday = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).map(({ type, value }) => [type, value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

export const EmergencyToggle: React.FC = () => {
  const [emergencies, setEmergencies] = useState<RegulatoryEmergencyRecord[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [reviewed, setReviewed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [savingAction, setSavingAction] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const replaceEmergency = (record: RegulatoryEmergencyRecord) => {
    setEmergencies((current) => current.some((item) => item.id === record.id)
      ? current.map((item) => item.id === record.id ? record : item)
      : [record, ...current])
    setSelectedId(record.id)
  }

  const loadEmergencies = async () => {
    setLoading(true); setLoadError(null)
    try {
      const records = await adminApi.getEmergencies()
      setEmergencies(records)
      setSelectedId((current) => current && records.some((item) => item.id === current)
        ? current
        : records.find((item) => item.status === 'draft')?.id ?? records[0]?.id ?? null)
    } catch {
      setEmergencies([])
      setLoadError('Could not load emergency declarations. Current market protocol is unavailable until the connection is restored.')
    } finally { setLoading(false) }
  }

  useEffect(() => { void loadEmergencies() }, [])

  const selected = emergencies.find((item) => item.id === selectedId) ?? null
  const inEffect = emergencies.some((item) => item.effective_state === 'in_effect')
  const officialPrices = useMemo(() => emergencies.flatMap((item) => item.official_prices || []), [emergencies])
  const completePreparation = !!selected?.candidates.length
    && selected.candidates.every((candidate) => candidate.observation_count > 0)
    && !(selected.missing_commodity_keys?.length)

  return <div className="admin-stack" style={{ display: 'grid', gap: '1.25rem' }}>
    <section className="admin-card" style={{ background: inEffect ? '#991b1b' : '#0f274f', color: '#fff', padding: '1.25rem', borderRadius: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.8rem' }}>
        {inEffect ? <ShieldAlert size={28} /> : <Shield size={28} />}
        <div><h2 style={{ margin: 0, color: '#fff' }}>State of Calamity Regulatory Command Bar</h2>
          <p style={{ margin: '.25rem 0 0' }}>{inEffect ? 'Confirmed APC references are in effect.' : 'Normal weekly SRP monitoring remains in effect.'}</p></div>
      </div>
    </section>

    {loadError && <div role="alert" className="admin-alert admin-alert--error"><p>{loadError}</p><button type="button" onClick={() => void loadEmergencies()}>Retry</button></div>}
    {actionError && <div role="alert" className="admin-alert admin-alert--error">{actionError}</div>}

    <section className="admin-card" style={{ padding: '1.25rem' }}>
      <h3>Prepare a Price Freeze declaration</h3>
      <p>The system uses the latest completed San Jose weekly monitoring cycle and calculates APC as (minimum + maximum) ÷ 2.</p>
      <form className="admin-form" onSubmit={async (event) => {
        event.preventDefault()
        const element = event.currentTarget
        const form = new FormData(element)
        setActionError(null); setSavingAction('create')
        try {
          const record = await adminApi.createEmergency({
            location: SAN_JOSE, declaration_reference: form.get('reference'),
            starts_on: form.get('starts_on'), ends_on: form.get('ends_on') || null,
          })
          replaceEmergency(record); element.reset()
          adminToast.success('APC preparation created.', { id: 'emergency-declaration-created' })
        } catch (error: any) {
          const message = error.response?.data?.message || 'The emergency declaration could not be recorded.'
          setActionError(message); adminToast.error(message, { id: 'emergency-declaration-error' })
        } finally { setSavingAction(null) }
      }} style={{ display: 'grid', gap: '.75rem' }}>
        <div className="monitor-detail-facts"><div><span>Location</span><strong>{SAN_JOSE}</strong></div></div>
        <label>Declaration reference<input name="reference" required /></label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '.75rem' }}>
          <label>Start date<input name="starts_on" type="date" required /></label>
          <label>End date<input name="ends_on" type="date" /></label>
        </div>
        <button className="admin-button primary" type="submit" disabled={savingAction !== null}>{savingAction === 'create' ? 'Preparing…' : 'Prepare APC'}</button>
      </form>
    </section>

    <section className="admin-card" style={{ padding: '1.25rem' }}>
      <h3><Calendar size={18} /> Declarations</h3>
      {loading ? <p>Loading emergency records…</p> : emergencies.length === 0 ? <p>No emergency declarations recorded.</p> : <div style={{ display: 'grid', gap: '.5rem' }}>
        {emergencies.map((record) => <button key={record.id} type="button" className="admin-button secondary" aria-pressed={record.id === selectedId} onClick={() => { setSelectedId(record.id); setReviewed(false) }}>
          <strong>{record.declaration_reference}</strong><span>{record.effective_state.replace('_', ' ')}</span><span>{record.starts_on} to {record.ends_on || 'open'}</span>
        </button>)}
      </div>}
    </section>

    {selected?.status === 'draft' && <section className="admin-card" style={{ padding: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'start', flexWrap: 'wrap' }}>
        <div><h3>APC Preparation</h3><p>Source week: {selected.source_week.starts_on || day(selected.source_week.starts_at)} to {selected.source_week.ends_on || day(selected.source_week.ends_at)} · Asia/Manila</p></div>
        <button type="button" className="admin-button secondary" disabled={savingAction !== null} onClick={async () => {
          setActionError(null); setSavingAction('prepare')
          try { replaceEmergency(await adminApi.prepareEmergency(selected.id)); setReviewed(false); adminToast.success('APC preparation refreshed.', { id: 'apc-preparation-refreshed' }) }
          catch (error: any) { setActionError(error.response?.data?.message || 'The APC preparation could not be refreshed.') }
          finally { setSavingAction(null) }
        }}><RefreshCw size={16} />{savingAction === 'prepare' ? 'Refreshing…' : 'Refresh preparation'}</button>
      </div>
      <div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>Product</th><th>Minimum</th><th>Maximum</th><th>Observed average</th><th>Computed APC</th><th>Observations</th><th>Establishments</th></tr></thead>
        <tbody>{selected.candidates.length ? selected.candidates.map((candidate) => <tr key={candidate.id}><td><strong>{candidate.commodity_key}</strong></td><td>{money(candidate.minimum_price)}</td><td>{money(candidate.maximum_price)}</td><td>{money(candidate.observed_average_price)}</td><td><strong>{money(candidate.computed_apc_price)}</strong><small style={{ display: 'block' }}>(min + max) ÷ 2</small></td><td>{candidate.observation_count}</td><td>{candidate.establishment_count}</td></tr>) : <tr><td colSpan={7}>No covered product has qualifying data in the selected completed week. Activation is blocked.</td></tr>}</tbody>
      </table></div>
      {!!selected.missing_commodity_keys?.length && <p role="alert" className="admin-inline-alert">Activation is blocked: no qualifying source-week observation for {selected.missing_commodity_keys.join(', ')}.</p>}
      {selected.candidates.map((candidate) => candidate.source_observations?.length ? <details key={`source-${candidate.id}`}>
        <summary>Source records for {candidate.commodity_key}</summary>
        <ul>{candidate.source_observations.map((observation) => <li key={observation.item_id}><strong>{observation.store_name}</strong> · {day(observation.finalized_at)} · {money(observation.recorded_price)} · Record #{observation.monitoring_record_id}</li>)}</ul>
      </details> : null)}
      <label className="check-label"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} /> I reviewed the source week, supporting statistics, and computed APC values.</label>
      <button type="button" className="admin-button primary" disabled={!reviewed || !completePreparation || !selected.preparation_hash || savingAction !== null} onClick={async () => {
        if (!selected.preparation_hash) return
        setActionError(null); setSavingAction('activate')
        try {
          replaceEmergency(await adminApi.activateEmergency(selected.id, { confirmed: true, preparation_hash: selected.preparation_hash }))
          setReviewed(false); adminToast.success('Official APC references confirmed and Price Freeze activated.', { id: 'price-freeze-activated' })
        } catch (error: any) {
          const message = error.response?.data?.message || 'Price Freeze could not be activated.'
          setActionError(message)
          if (error.response?.data?.status === 'APC_PREPARATION_STALE') setReviewed(false)
        } finally { setSavingAction(null) }
      }}>{savingAction === 'activate' ? 'Activating…' : 'Confirm and activate'}</button>
    </section>}

    <section className="admin-card" style={{ padding: '1.25rem' }}>
      <h3><Database size={18} /> Official APC / Price Freeze References</h3>
      <p>These references are separate from SRP and exist only after DTI Admin confirmation.</p>
      <div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>Product</th><th>Reference</th><th>Official APC</th><th>Effective period</th><th>Source</th></tr></thead>
        <tbody>{officialPrices.length ? officialPrices.map((price) => <tr key={price.id}><td>{price.commodity_key}</td><td>{price.price_type}</td><td><strong>{money(price.authoritative_price)}</strong></td><td>{price.effective_from} to {price.effective_until || 'open'}</td><td>{price.source_reference}</td></tr>) : <tr><td colSpan={5}>No official APC references have been confirmed.</td></tr>}</tbody>
      </table></div>
    </section>

    {selected?.status === 'active' && <button type="button" className="admin-button secondary" disabled={savingAction !== null} onClick={async () => {
      if (!window.confirm('Confirm that this Price Freeze has ended?')) return
      setSavingAction('end'); setActionError(null)
      try { replaceEmergency(await adminApi.updateEmergency(selected.id, { status: 'ended', ends_on: manilaToday(), confirmed: true })) }
      catch (error: any) { setActionError(error.response?.data?.message || 'The Price Freeze could not be ended.') }
      finally { setSavingAction(null) }
    }}>{savingAction === 'end' ? 'Ending…' : 'End Price Freeze'}</button>}
  </div>
}
