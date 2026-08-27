import type { FieldSession, OfflineLease, VisitDraft } from '../types'

export const BACKGROUND_LOCK_MS = 60_000

export function shouldLockAfterBackground(hiddenAt: number | null, now: number): boolean {
  return hiddenAt !== null && now - hiddenAt >= BACKGROUND_LOCK_MS
}

export function applyRenewedLease(session: FieldSession, draft: VisitDraft | null, lease: OfflineLease) {
  return {
    session: { ...session, offline_lease: lease },
    draft: draft && !draft.finalized_at ? { ...draft, offline_lease_id: lease.id } : draft,
  }
}

export function canFinalizeWithLease(lease: OfflineLease, now = Date.now()): boolean {
  return new Date(lease.expires_at).getTime() > now
}

export function logoutBlock(queue: VisitDraft[], draft: VisitDraft | null): 'queue' | 'draft' | null {
  if (queue.length) return 'queue'
  if (draft) return 'draft'
  return null
}
