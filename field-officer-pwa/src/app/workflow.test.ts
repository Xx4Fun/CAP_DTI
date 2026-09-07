import { describe, expect, it } from 'vitest'
import { analyzeLine, analyzeWithReference, canFinalizeVisit, createDraft, isActionableDraft, isBlankDraft, resolveClientReference } from './workflow'

describe('field visit workflow', () => {
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
})
