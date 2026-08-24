import { describe, expect, it } from 'vitest'
import { analyzeLine, canFinalizeVisit, createDraft } from './workflow'

describe('field visit workflow', () => {
  it('marks prices above ten percent of SRP as an observation requiring attention', () => {
    expect(analyzeLine({ srp_id: 1, recorded_price: 111 }, 100)).toMatchObject({ is_anomaly: true, variance_percent: 11 })
    expect(analyzeLine({ srp_id: 1, recorded_price: 110 }, 100).is_anomaly).toBe(false)
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
})
