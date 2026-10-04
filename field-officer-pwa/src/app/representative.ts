import type { RepresentativeStore, StoreRecord, VisitDraft } from '../types'
import { prefillRepresentative } from './workflow'

export const sameRepresentative = (a: VisitDraft['representative'], b: VisitDraft['representative']) => a.name === b.name && a.title === b.title
export const hasVisitSignatures = (draft: VisitDraft) => Boolean(draft.signatures.officer_png_base64 || draft.signatures.representative_png_base64)

export function currentStoreRepresentative(store: RepresentativeStore): VisitDraft['representative'] {
  const current = store.current_representative
  if (current?.name.trim()) return { name: current.name.trim(), title: current.title }
  return store.owner_name?.trim() ? { name: store.owner_name.trim(), title: 'Owner' } : { name: '', title: '' }
}

export function applyRepresentativePrefill(draft: VisitDraft, store: StoreRecord): VisitDraft {
  if (draft.finalized_at || draft.representative.name.trim() || draft.representative.title.trim()) return draft
  const representative = prefillRepresentative(draft, store)
  return { ...draft, representative, representative_prefill: { ...representative }, representative_confirmed: false }
}

export function refreshRepresentativePrefill(draft: VisitDraft, store: RepresentativeStore): VisitDraft {
  if (draft.finalized_at || hasVisitSignatures(draft) || !draft.representative_prefill || !sameRepresentative(draft.representative, draft.representative_prefill)) return draft
  const representative = currentStoreRepresentative(store)
  if (sameRepresentative(draft.representative, representative)) return draft
  return { ...draft, representative, representative_prefill: { ...representative }, representative_confirmed: false }
}

// Callers must obtain confirmation before invoking this for a signed draft.
export function changeVisitRepresentative(draft: VisitDraft, representative: VisitDraft['representative']): VisitDraft {
  if (draft.finalized_at || sameRepresentative(draft.representative, representative)) return draft
  return { ...draft, representative, representative_prefill: undefined, representative_confirmed: false, signatures: { officer_png_base64: '', representative_png_base64: '' } }
}
