import type { FieldSession, OfflineLease, QueuedVisit, VisitDraft } from '../types'

export const BACKGROUND_LOCK_MS = 60_000
export const SYNC_RETRY_BASE_MS = 30_000
export const SYNC_RETRY_MAX_MS = 15 * 60_000

export function syncErrorKind(status: number | undefined): NonNullable<QueuedVisit['sync_error_kind']> {
  // 401/403 are authorization, not a verdict on the visit: the next sync attempt runs the lock-and-reauthorize flow.
  return status === undefined || status === 401 || status === 403 || status === 408 || status === 429 || status >= 500 ? 'transient' : 'rejected'
}

export function syncRetryDelay(attempts: number): number {
  return Math.min(SYNC_RETRY_BASE_MS * 2 ** Math.max(attempts - 1, 0), SYNC_RETRY_MAX_MS)
}

export function shouldAutoRetry(item: QueuedVisit, now: number): boolean {
  // Never attempted, or failed before retry kinds existed: one attempt classifies it.
  if (!item.sync_attempted_at || !item.sync_error_kind) return true
  if (item.sync_error_kind === 'rejected') return false
  return now - Date.parse(item.sync_attempted_at) >= syncRetryDelay(item.sync_attempts ?? 1)
}

export function shouldRetryOnReconnect(item: QueuedVisit): boolean {
  return item.sync_error_kind !== 'rejected'
}

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
