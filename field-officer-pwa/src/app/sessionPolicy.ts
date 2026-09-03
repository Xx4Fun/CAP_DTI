import type { FieldSession, OfflineLease, VisitDraft } from '../types'

export const BACKGROUND_LOCK_MS = 60_000

export function shouldLockAfterBackground(hiddenAt: number | null, now: number): boolean {
  return hiddenAt !== null && now - hiddenAt >= BACKGROUND_LOCK_MS
}

export function applyRenewedLease(session: FieldSession, drafts: VisitDraft[], lease: OfflineLease) {
  return {
    session: { ...session, offline_lease: lease },
    drafts: drafts.map((draft) => !draft.finalized_at ? { ...draft, offline_lease_id: lease.id } : draft),
  }
}

export function canFinalizeWithLease(lease: OfflineLease, now = Date.now()): boolean {
  return new Date(lease.expires_at).getTime() > now
}

export function logoutBlock(queue: VisitDraft[], drafts: VisitDraft[]): 'queue' | 'draft' | null {
  if (queue.length) return 'queue'
  if (drafts.length) return 'draft'
  return null
}
