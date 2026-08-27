import { describe, expect, it } from 'vitest'
import type { FieldSession, OfflineLease, VisitDraft } from '../types'
import { applyRenewedLease, canFinalizeWithLease, logoutBlock, shouldLockAfterBackground } from './sessionPolicy'

const session = (lease: OfflineLease): FieldSession => ({
  token: 'token', user: { id: 1, name: 'Officer', email: 'officer@dti.test', role: 'field_officer' }, offline_lease: lease,
})
const draft = (leaseId = 'lease-old'): VisitDraft => ({
  client_uuid: '0b4cf2cf-51c9-4da4-8420-b6f271c82b8e', store_id: null, offline_lease_id: leaseId,
  started_at: '2026-08-28T00:00:00Z', items: [], representative: { name: '', title: '' },
  signatures: { officer_png_base64: '', representative_png_base64: '' }, location: null,
  sync_source: 'offline_queue', client_version: '1.0.0',
})

describe('field session policy', () => {
  it('locks only after sixty seconds spent in the background', () => {
    expect(shouldLockAfterBackground(1_000, 60_999)).toBe(false)
    expect(shouldLockAfterBackground(1_000, 61_000)).toBe(true)
    expect(shouldLockAfterBackground(null, 999_999)).toBe(false)
  })

  it('moves only an unfinished draft onto a renewed lease', () => {
    const renewed = { id: 'lease-new', expires_at: '2026-08-29T00:00:00Z' }
    const result = applyRenewedLease(session({ id: 'lease-old', expires_at: '2026-08-28T00:00:00Z' }), draft(), renewed)
    expect(result.session.offline_lease).toEqual(renewed)
    expect(result.draft?.offline_lease_id).toBe('lease-new')

    const finished = { ...draft(), finalized_at: '2026-08-28T01:00:00Z' }
    expect(applyRenewedLease(session(renewed), finished, renewed).draft?.offline_lease_id).toBe('lease-old')
  })

  it('blocks new finalization when the lease is expired', () => {
    expect(canFinalizeWithLease({ id: 'lease', expires_at: '2026-08-28T00:00:00Z' }, Date.parse('2026-08-28T00:00:00Z'))).toBe(false)
    expect(canFinalizeWithLease({ id: 'lease', expires_at: '2026-08-28T00:00:01Z' }, Date.parse('2026-08-28T00:00:00Z'))).toBe(true)
  })

  it('blocks logout for queued evidence and requires draft discard otherwise', () => {
    expect(logoutBlock([draft()], null)).toBe('queue')
    expect(logoutBlock([], draft())).toBe('draft')
    expect(logoutBlock([], null)).toBeNull()
  })
})
