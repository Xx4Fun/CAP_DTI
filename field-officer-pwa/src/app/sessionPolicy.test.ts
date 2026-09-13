import { describe, expect, it } from 'vitest'
import type { FieldSession, OfflineLease, QueuedVisit, VisitDraft } from '../types'
import {
  applyRenewedLease, canFinalizeWithLease, logoutBlock, shouldAutoRetry, shouldLockAfterBackground, shouldRetryOnReconnect,
  syncErrorKind, syncRetryDelay,
} from './sessionPolicy'

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

  it('moves every unfinished draft onto a renewed lease', () => {
    const renewed = { id: 'lease-new', expires_at: '2026-08-29T00:00:00Z' }
    const finished = { ...draft(), client_uuid: 'finished', finalized_at: '2026-08-28T01:00:00Z' }
    const result = applyRenewedLease(session({ id: 'lease-old', expires_at: '2026-08-28T00:00:00Z' }), [draft(), finished], renewed)
    expect(result.session.offline_lease).toEqual(renewed)
    expect(result.drafts.map((item) => item.offline_lease_id)).toEqual(['lease-new', 'lease-old'])
  })

  it('blocks new finalization when the lease is expired', () => {
    expect(canFinalizeWithLease({ id: 'lease', expires_at: '2026-08-28T00:00:00Z' }, Date.parse('2026-08-28T00:00:00Z'))).toBe(false)
    expect(canFinalizeWithLease({ id: 'lease', expires_at: '2026-08-28T00:00:01Z' }, Date.parse('2026-08-28T00:00:00Z'))).toBe(true)
  })

  it('blocks logout for queued evidence and requires draft discard otherwise', () => {
    expect(logoutBlock([draft()], [])).toBe('queue')
    expect(logoutBlock([], [draft()])).toBe('draft')
    expect(logoutBlock([], [])).toBeNull()
  })

  const attemptedAt = Date.parse('2026-08-28T02:00:00Z')
  const queued = (overrides: Partial<QueuedVisit> = {}): QueuedVisit => ({ ...draft(), finalized_at: '2026-08-28T01:00:00Z', ...overrides })
  const failed = (kind: 'transient' | 'rejected', attempts: number) => queued({
    sync_error: 'failed', sync_attempted_at: new Date(attemptedAt).toISOString(), sync_error_kind: kind, sync_attempts: attempts,
  })

  it('treats missing responses, timeouts, rate limits and server errors as transient', () => {
    ;[undefined, 401, 403, 408, 429, 500, 503].forEach((status) => expect(syncErrorKind(status)).toBe('transient'))
    ;[400, 404, 409, 422].forEach((status) => expect(syncErrorKind(status)).toBe('rejected'))
  })

  it('backs off transient retries from thirty seconds up to fifteen minutes', () => {
    expect([1, 2, 3, 5, 6, 12].map(syncRetryDelay)).toEqual([30_000, 60_000, 120_000, 480_000, 900_000, 900_000])
  })

  it('automatically retries never-attempted, legacy failed, and due transient visits only', () => {
    expect(shouldAutoRetry(queued(), attemptedAt)).toBe(true)
    expect(shouldAutoRetry(queued({ sync_error: 'old failure', sync_attempted_at: new Date(attemptedAt).toISOString() }), attemptedAt)).toBe(true)
    expect(shouldAutoRetry(failed('transient', 1), attemptedAt + 29_999)).toBe(false)
    expect(shouldAutoRetry(failed('transient', 1), attemptedAt + 30_000)).toBe(true)
    expect(shouldAutoRetry(failed('transient', 3), attemptedAt + 119_999)).toBe(false)
    expect(shouldAutoRetry(failed('transient', 3), attemptedAt + 120_000)).toBe(true)
    expect(shouldAutoRetry(failed('rejected', 1), attemptedAt + 86_400_000)).toBe(false)
  })

  it('retries transient visits immediately on reconnect but never rejected ones', () => {
    expect(shouldRetryOnReconnect(failed('transient', 4))).toBe(true)
    expect(shouldRetryOnReconnect(queued())).toBe(true)
    expect(shouldRetryOnReconnect(failed('rejected', 1))).toBe(false)
  })
})
