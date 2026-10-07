import { describe, expect, it } from 'vitest'
import { analyzeLine, analyzeWithReference, canFinalizeVisit, createDraft, isActionableDraft, isBlankDraft, mergeBootstrapDelta, prefillRepresentative, resolveClientReference, changedVisitReferences, refreshVisitReferences } from './workflow'

describe('field visit workflow', () => {
  it('requires review of changed references, retains prices, clears signing and preserves finalized evidence', () => {
    const old = { status: 'available' as const, type: 'standard_srp' as const, source_id: 3, value: 50, label: 'SRP', source_reference: 'SRP-1', effective_date: '2026-09-01', reference_version: 'old' }
    const draft = { ...createDraft('lease-1'), items: [{ srp_id: 3, commodity_key: 'rice', recorded_price: 48, reference_snapshot: old }], representative_confirmed: true, signatures: { officer_png_base64: 'signed', representative_png_base64: 'signed' } }
    const data = { version: 'new', is_delta: false, stores: [], recent_prices: [], srp_bulletins: [{ id: 4, commodity_key: 'rice', commodity_name: 'Rice', unit: 'kg', baseline_price: 50 }], monitoring_references: [{ srp_id: 4, commodity_key: 'rice', covered_by_price_freeze: true, ...old, type: 'emergency_ceiling' as const, value: 45, source: 'DECL-1', reference_version: 'new' }] }
    expect(changedVisitReferences(draft, data)).toBe(true)
    const updated = refreshVisitReferences(draft, data)
    expect(updated.items[0]).toMatchObject({ srp_id: 4, recorded_price: 48, reference_snapshot: { type: 'emergency_ceiling', value: 45 } })
    expect(updated.signatures).toEqual({ officer_png_base64: '', representative_png_base64: '' })
    expect(updated.representative_confirmed).toBe(false)
    expect(changedVisitReferences(updated, data)).toBe(false)
    const finalized = { ...draft, finalized_at: '2026-10-07T01:00:00Z' }
    expect(changedVisitReferences(finalized, data)).toBe(false)
    expect(refreshVisitReferences(finalized, data)).toBe(finalized)
  })
  it('keeps cached reference lists when bootstrap returns an unchanged delta', () => {
    const store = { id: 7, store_name: 'Market One', address: 'San Jose', latitude: 10.74, longitude: 121.98, is_active: true }
    const cached = { version: 'v1', is_delta: false, stores: [store], srp_bulletins: [{ id: 3, commodity_name: 'Rice', unit: 'kg', baseline_price: 50 }], recent_prices: [], accepted_today: 1 }
    const delta = { version: 'v1', is_delta: true, stores: [], srp_bulletins: [], recent_prices: [], accepted_today: 4 }
    expect(mergeBootstrapDelta(cached, delta)).toMatchObject({ is_delta: true, stores: [store], srp_bulletins: cached.srp_bulletins, accepted_today: 4 })
    const full = { ...delta, is_delta: false, version: 'v2' }
    expect(mergeBootstrapDelta(cached, full)).toBe(full)
  })

  it('prefills the representative with the registered owner without overwriting a typed name', () => {
    const store = { id: 7, store_name: 'Market One', address: 'San Jose', latitude: 10.74, longitude: 121.98, is_active: true, owner_name: ' Maria Santos ' }
    const draft = createDraft('lease-1')
    expect(prefillRepresentative(draft, store)).toEqual({ name: 'Maria Santos', title: 'Owner' })
    expect(prefillRepresentative({ ...draft, representative: { name: 'Ben', title: '' } }, store)).toEqual({ name: 'Ben', title: '' })
    expect(prefillRepresentative(draft, { ...store, owner_name: null })).toEqual({ name: '', title: '' })
  })

  it('stamps new drafts with the built app version', () => {
    expect(createDraft('lease-1').client_version).toBe(__APP_VERSION__)
    expect(__APP_VERSION__).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('marks prices above ten percent of SRP as an observation requiring attention', () => {
    expect(analyzeLine({ srp_id: 1, recorded_price: 111 }, 100)).toMatchObject({ is_anomaly: true, variance_percent: 11 })
    expect(analyzeLine({ srp_id: 1, recorded_price: 110 }, 100).is_anomaly).toBe(false)
  })

  it('uses emergency ceilings without falling back to SRP', () => {
    expect(analyzeWithReference({ srp_id: 1, recorded_price: 101 }, { status: 'available', type: 'emergency_ceiling', value: 100 })).toMatchObject({ label: 'For review', is_anomaly: true })
    expect(analyzeWithReference({ srp_id: 1, recorded_price: 120 }, { status: 'unavailable', type: 'emergency_ceiling', value: null })).toMatchObject({ label: 'Regulatory reference unavailable', is_anomaly: false, variance_percent: null })
  })

  it('blocks finalization until the visit has lines, both signatures, representative and accurate GPS', () => {
    const draft = createDraft('lease-1')
    expect(canFinalizeVisit(draft)).toContain('Choose a registered store.')
    expect(canFinalizeVisit({ ...draft, store_id: 2, items: [{ srp_id: 1, recorded_price: 42 }] })).toContain('Enter the store representative name.')
    expect(canFinalizeVisit({
      ...draft,
      store_id: 2,
      items: [{ srp_id: 1, recorded_price: 42 }],
      representative: { name: 'Maria Santos', title: 'Manager' },
      signatures: { officer_png_base64: 'data:image/png;base64,abc', representative_png_base64: 'data:image/png;base64,def' },
      location: { latitude: 10, longitude: 122, accuracy_meters: 120, captured_at: new Date().toISOString() }
    })).toContain('Location accuracy must be within 100 metres.')
  })

  it('blocks finalization while any recorded price lacks its issued monitoring reference', () => {
    const snapshot = { status: 'available' as const, type: 'standard_srp' as const, source_id: 1, value: 40, label: 'SRP', source_reference: 'SRP-1', effective_date: '2026-09-01', reference_version: 'v1' }
    const complete = {
      ...createDraft('lease-1'), store_id: 2,
      representative_confirmed: true,
      representative: { name: 'Maria Santos', title: 'Manager' },
      signatures: { officer_png_base64: 'officer', representative_png_base64: 'representative' },
      location: { latitude: 10, longitude: 122, accuracy_meters: 10, captured_at: new Date().toISOString() },
    }
    const reenter = 'Re-enter each recorded price so it carries the current monitoring reference.'
    expect(canFinalizeVisit({ ...complete, items: [{ srp_id: 1, recorded_price: 42 }] })).toContain(reenter)
    expect(canFinalizeVisit({ ...complete, items: [{ srp_id: 1, recorded_price: 42, reference_snapshot: snapshot }, { srp_id: 2, recorded_price: 9 }] })).toContain(reenter)
    expect(canFinalizeVisit({ ...complete, items: [{ srp_id: 1, recorded_price: 42, reference_snapshot: snapshot }] })).toEqual([])
  })

  it('does not treat provisional store selection or passive GPS as recorded work', () => {
    const blank = createDraft('lease-1')
    expect(isBlankDraft(blank)).toBe(true)
    expect(isBlankDraft({ ...blank, store_id: 2 })).toBe(true)
    expect(isBlankDraft({ ...blank, store_id: 2, location: { latitude: 10, longitude: 122, accuracy_meters: 10, captured_at: new Date().toISOString() } })).toBe(true)
    expect(isBlankDraft({ ...blank, items: [{ srp_id: 1, recorded_price: 42 }] })).toBe(false)
    expect(isBlankDraft({ ...blank, representative: { name: 'Maria Santos', title: '' } })).toBe(false)
  })

  it('keeps only meaningful or claimed visits in Current Work', () => {
    const blank = createDraft('lease-1')
    expect(isActionableDraft({ ...blank, store_id: 2 })).toBe(false)
    expect(isActionableDraft({ ...blank, store_id: 2, items: [{ srp_id: 1, recorded_price: 42 }] })).toBe(true)
    expect(isActionableDraft(createDraft('lease-1', 42))).toBe(true)
  })

  it('links a claimed verification request to its draft', () => {
    expect(createDraft('lease-1', 42).verification_request_id).toBe(42)
  })

  it('fails closed when an emergency commodity has no current ceiling', () => {
    const bulletin = { id: 1, commodity_name: 'Rice', unit: 'kg', baseline_price: 50, commodity_key: 'rice', source_reference: 'SRP-2026', effective_date: '2026-08-01' }
    expect(resolveClientReference(bulletin, 'emergency', [])).toEqual({ status: 'unavailable', type: 'emergency_ceiling', value: null })
    expect(resolveClientReference(bulletin, 'standard', [])).toEqual({ status: 'available', type: 'standard_srp', value: 50 })
  })

  it('fails closed when authoritative emergency reference provenance is incomplete', () => {
    const bulletin = { id: 1, commodity_name: 'Rice', unit: 'kg', baseline_price: 50, commodity_key: 'rice', source_reference: 'SRP-2026', effective_date: '2026-08-01' }
    expect(resolveClientReference(bulletin, 'emergency', [{ id: 1, commodity_key: 'rice', price_type: 'PRICE_FREEZE', authoritative_price: 55, effective_from: '2026-08-15', effective_until: null, source_reference: null }])).toEqual({ status: 'unavailable', type: 'emergency_ceiling', value: null })
  })

  it('uses an effective standard baseline when its source reference is missing', () => {
    const bulletin = { id: 1, commodity_name: 'Rice', unit: 'kg', baseline_price: 50, commodity_key: null, source_reference: null, effective_date: '2026-08-01' }
    expect(resolveClientReference(bulletin, 'standard', [])).toEqual({ status: 'available', type: 'standard_srp', value: 50 })
  })

  it('uses the backend-issued reference, including SRP for products outside Price Freeze coverage', () => {
    const bulletin = { id: 1, commodity_name: 'Rice', unit: 'kg', baseline_price: 50, commodity_key: 'rice', source_reference: 'SRP-2026', effective_date: '2026-08-01' }
    const reference = {
      srp_id: 1, commodity_key: 'rice', covered_by_price_freeze: false,
      status: 'available' as const, type: 'standard_srp' as const, source_id: 1,
      value: 50, label: 'Current SRP', source: 'SRP-2026', effective_date: '2026-08-01', reference_version: 'refs-v2',
    }

    expect(resolveClientReference(bulletin, 'emergency', [], [reference])).toEqual(reference)
  })
})
