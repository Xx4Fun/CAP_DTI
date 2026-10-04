import { expect, it } from 'vitest'
import { canFinalizeVisit, createDraft, prefillRepresentative } from './workflow'
import { applyRepresentativePrefill, refreshRepresentativePrefill, changeVisitRepresentative } from './representative'
import type { StoreRecord } from '../types'

const store: StoreRecord = { id: 7, store_name: 'Market', address: 'Antique', latitude: 10, longitude: 121, is_active: true, owner_name: 'Registered Owner', current_representative: { name: 'Ana', title: 'Manager', updated_at: '2026-10-04T01:00:00Z' } }

it('requires confirmation and a role before finalizing a draft', () => {
  const value = { ...createDraft('lease'), representative: { name: 'Ana', title: '' } }
  expect(canFinalizeVisit(value)).toContain('Enter the store representative role.')
  expect(canFinalizeVisit(value)).toContain('Confirm the name and role of the person signing.')
})

it('prefills configured Manager or Owner, falls back to registered owner, and leaves missing details empty', () => {
  const draft = createDraft('lease')
  expect(prefillRepresentative(draft, store)).toEqual({ name: 'Ana', title: 'Manager' })
  expect(prefillRepresentative(draft, { ...store, current_representative: { ...store.current_representative!, title: 'Owner' } })).toEqual({ name: 'Ana', title: 'Owner' })
  expect(prefillRepresentative(draft, { ...store, current_representative: null })).toEqual({ name: 'Registered Owner', title: 'Owner' })
  expect(prefillRepresentative(draft, { ...store, current_representative: null, owner_name: null })).toEqual({ name: '', title: '' })
})

it('refreshes only untouched unsigned prefills, preserves manual and legacy drafts and finalized evidence', () => {
  const draft = applyRepresentativePrefill({ ...createDraft('lease'), store_id: store.id }, store)
  const fresh = { ...store, current_representative: { ...store.current_representative!, name: 'Ben' } }
  expect(refreshRepresentativePrefill(draft, fresh).representative.name).toBe('Ben')
  expect(refreshRepresentativePrefill({ ...draft, representative: { name: 'Actual signer', title: 'Cashier' } }, fresh).representative.name).toBe('Actual signer')
  expect(refreshRepresentativePrefill({ ...draft, representative_prefill: undefined }, fresh)).toEqual({ ...draft, representative_prefill: undefined })
  expect(refreshRepresentativePrefill({ ...draft, signatures: { ...draft.signatures, officer_png_base64: 'signed' } }, fresh).representative.name).toBe('Ana')
  expect(refreshRepresentativePrefill({ ...draft, finalized_at: '2026-10-04T02:00:00Z' }, fresh).representative.name).toBe('Ana')
})

it('identity edits reset confirmation and both signatures, and finalized visits cannot be edited', () => {
  const draft = { ...applyRepresentativePrefill({ ...createDraft('lease'), store_id: store.id }, store), representative_confirmed: true, signatures: { officer_png_base64: 'officer', representative_png_base64: 'signer' } }
  const changed = changeVisitRepresentative(draft, { name: 'Ben', title: 'Owner' })
  expect(changed.representative_confirmed).toBe(false)
  expect(changed.signatures).toEqual({ officer_png_base64: '', representative_png_base64: '' })
  expect(changed.representative_prefill).toBeUndefined()
  const finalized = { ...draft, finalized_at: '2026-10-04T02:00:00Z' }
  expect(changeVisitRepresentative(finalized, { name: 'Ben', title: 'Owner' })).toEqual(finalized)
})
