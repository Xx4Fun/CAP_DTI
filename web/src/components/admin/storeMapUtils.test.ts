import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GisPrice, GisStoreRecord, GisVisit } from '../../types/admin'
import { MAP_LAYERS, VISIT_REVIEW_METERS, visitDistanceMeters, visitNeedsReview, weekLabel, type LayerContext } from './storeMapUtils'

const store = (overrides: Partial<GisStoreRecord> = {}): GisStoreRecord => ({
  id: 1, store_name: 'Store', address: 'San Jose', latitude: 10.74, longitude: 121.94, is_active: true, is_verified: true, is_public: true,
  recidivism_index: 0, has_prior_routine_visit: false, verification_required: false, visits: [], prices: [], ...overrides,
})
const visit = (overrides: Partial<GisVisit> = {}): GisVisit => ({
  id: 1, finalized_at: '2026-09-29T02:00:00+00:00', officer_name: 'Officer', is_routine: true, protocol_mode: 'standard', ...overrides,
})
const price = (overrides: Partial<GisPrice> = {}): GisPrice => ({
  commodity: 'sardines|155g', commodity_name: 'Sardines', unit: '155g', monitoring_record_id: 1, recorded_price: 50, reference_value: 50,
  reference_type: 'standard_srp', reference_status: 'available', variance_percent: 0, is_anomaly: false, ...overrides,
})
const ctx = (overrides: Partial<LayerContext> = {}): LayerContext => ({ commodity: 'sardines|155g', week: { is_current: true }, locations: true, ...overrides })

// 0.001 degrees of latitude is about 111 m.
const metresNorth = (metres: number) => ({ latitude: 10.74 + metres / 111_195, longitude: 121.94 })

describe('GIS map layers', () => {
  it('keeps the compliance categories the map has always shown', () => {
    const { pinOf } = MAP_LAYERS.compliance
    expect(pinOf(store(), ctx())).toMatchObject({ category: 'no-findings', status: 'green', label: 'No Confirmed Findings' })
    expect(pinOf(store({ is_verified: false }), ctx())).toMatchObject({ category: 'pending', status: 'yellow' })
    expect(pinOf(store({ recidivism_index: 2 }), ctx())).toMatchObject({ category: 'findings', status: 'red', label: '2 Confirmed Findings' })
    // Inactive without findings has no chip of its own: it is counted under All only.
    expect(pinOf(store({ is_active: false }), ctx())).toMatchObject({ category: 'inactive', status: 'red', label: 'Account Inactive' })
    expect(MAP_LAYERS.compliance.categories.map((category) => category.id)).not.toContain('inactive')
  })

  it('classifies coverage from routine visits only', () => {
    const { pinOf } = MAP_LAYERS.coverage
    expect(pinOf(store({ visits: [visit()] }), ctx())).toMatchObject({ category: 'monitored', status: 'green', label: 'Monitored' })
    expect(pinOf(store({ has_prior_routine_visit: true }), ctx())).toMatchObject({ category: 'not_monitored', status: 'yellow', label: 'Not monitored' })
    expect(pinOf(store(), ctx())).toMatchObject({ category: 'never', status: 'red', label: 'Never monitored' })
    expect(pinOf(store({ visits: [visit({ is_routine: false })] }), ctx())).toMatchObject({ category: 'never' })
    expect(pinOf(store({ is_active: false, visits: [visit()] }), ctx())).toMatchObject({ category: 'inactive', status: 'grey' })
  })

  it('shows the verification badge on the current week and never on a historical one', () => {
    const flagged = store({ verification_required: true, has_prior_routine_visit: true })
    expect(MAP_LAYERS.coverage.pinOf(flagged, ctx()).badge).toBe('Verification required')
    expect(MAP_LAYERS.coverage.pinOf(flagged, ctx({ week: { is_current: false } })).badge).toBeUndefined()
    expect(MAP_LAYERS.coverage.pinOf(store({ has_prior_routine_visit: true }), ctx()).badge).toBeUndefined()
    // Deactivating a store does not close its request, so the grey pin keeps the marker.
    expect(MAP_LAYERS.coverage.pinOf(store({ is_active: false, verification_required: true }), ctx())).toMatchObject({ category: 'inactive', status: 'grey', badge: 'Verification required' })
    expect(MAP_LAYERS.coverage.pinOf(store({ is_active: false, verification_required: true }), ctx({ week: { is_current: false } })).badge).toBeUndefined()
  })

  it('gives each of the five price categories its own status', () => {
    const { pinOf, categories } = MAP_LAYERS.prices
    const pins = [
      pinOf(store({ prices: [price({ recorded_price: 50 })] }), ctx()),
      pinOf(store({ prices: [price({ recorded_price: 53 })] }), ctx()),
      pinOf(store({ prices: [price({ recorded_price: 60, is_anomaly: true })] }), ctx()),
      pinOf(store({ prices: [price({ recorded_price: 60, reference_value: null, reference_status: 'unavailable' })] }), ctx()),
      pinOf(store({ prices: [price({ commodity: 'rice|1kg' })] }), ctx()),
    ]

    expect(pins.map((pin) => pin.label)).toEqual(['At or below reference', 'Above reference', 'Flagged', 'Reference unavailable', 'No price this week'])
    expect(pins.map((pin) => pin.status)).toEqual(['green', 'yellow', 'red', 'blue', 'grey'])
    expect(new Set(categories.map((category) => category.status)).size).toBe(5)
    expect(pins.map((pin) => pin.text)).toEqual(['₱50.00', '₱53.00', '₱60.00', '₱60.00', undefined])
  })

  it('subtracts GPS accuracy before asking for a visit location review', () => {
    const base = store()
    expect(VISIT_REVIEW_METERS).toBe(150)
    expect(visitDistanceMeters(base, visit(metresNorth(200)))).toBeCloseTo(200, 0)
    expect(visitNeedsReview(base, visit({ ...metresNorth(200), accuracy_meters: 10 }))).toBe(true)
    // 200 m away but the fix itself is only good to 80 m: within the threshold.
    expect(visitNeedsReview(base, visit({ ...metresNorth(200), accuracy_meters: 80 }))).toBe(false)
    expect(visitNeedsReview(base, visit({ ...metresNorth(40), accuracy_meters: 5 }))).toBe(false)
  })

  it('marks a store for review if any visit in the week is distant, and never classifies without coordinates', () => {
    const { pinOf } = MAP_LAYERS.visit_check
    const near = visit({ id: 2, ...metresNorth(20), accuracy_meters: 5 })
    const far = visit({ id: 1, ...metresNorth(400), accuracy_meters: 5 })

    expect(pinOf(store({ visits: [near] }), ctx())).toMatchObject({ category: 'at_pin', status: 'green', label: 'At registered pin' })
    // The distant visit came first; the later accurate one must not hide it.
    expect(pinOf(store({ visits: [far, near] }), ctx())).toMatchObject({ category: 'review', status: 'yellow', label: 'Location to review' })
    expect(pinOf(store(), ctx())).toMatchObject({ category: 'no_visit', status: 'grey', label: 'No visit' })

    const unloaded = pinOf(store({ visits: [visit()] }), ctx({ locations: false }))
    expect(unloaded).toMatchObject({ category: 'unloaded', status: 'grey' })
    expect(unloaded.label).not.toBe('At registered pin')
  })
})

describe('weekLabel', () => {
  afterEach(() => { vi.unstubAllEnvs() })

  it('names the Manila week from its date strings in any browser timezone', () => {
    for (const zone of ['Pacific/Honolulu', 'Asia/Manila', 'Pacific/Kiritimati']) {
      // Node re-reads TZ on assignment, so this moves the local timezone for the calls below.
      vi.stubEnv('TZ', zone)
      expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe({ 'Pacific/Honolulu': 600, 'Asia/Manila': -480, 'Pacific/Kiritimati': -840 }[zone])
      expect(weekLabel('2026-09-28', '2026-10-04')).toBe('Sep 28 – Oct 4, 2026')
      // Without the end date, it is the Monday plus six days.
      expect(weekLabel('2026-09-14')).toBe('Sep 14 – Sep 20, 2026')
    }
  })
})
