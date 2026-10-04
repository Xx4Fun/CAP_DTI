import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { RepresentativeStore, StoreRecord, VisitDraft } from '../types'
import { fieldApi } from '../services/fieldApi'
import { changeVisitRepresentative, currentStoreRepresentative, hasVisitSignatures, refreshRepresentativePrefill, sameRepresentative } from '../app/representative'

interface Props {
  draft: VisitDraft
  store?: StoreRecord
  token: string
  online: boolean
  onDraft: (draft: VisitDraft) => void
  onCache: (store: RepresentativeStore) => Promise<void>
  onReady: (ready: boolean) => void
}

export function RepresentativeReview({ draft, store, token, online, onDraft, onCache, onReady }: Props) {
  const [current, setCurrent] = useState<RepresentativeStore | undefined>(store)
  const [status, setStatus] = useState<'checking' | 'fresh' | 'saved'>(online ? 'checking' : 'saved')
  const [pending, setPending] = useState<VisitDraft['representative'] | null>(null)
  const latest = useRef({ draft, onDraft, onCache })
  latest.current = { draft, onDraft, onCache }

  useEffect(() => {
    let cancelled = false
    const uuid = draft.client_uuid
    const storeId = draft.store_id
    setStatus(online ? 'checking' : 'saved')
    if (online && storeId && !draft.finalized_at) {
      void (async () => {
        try {
          const fresh = await fieldApi.representative(token, storeId)
          if (cancelled || fresh.id !== storeId || latest.current.draft.client_uuid !== uuid || latest.current.draft.store_id !== storeId) return
          await latest.current.onCache(fresh)
          if (cancelled || latest.current.draft.client_uuid !== uuid || latest.current.draft.store_id !== storeId) return
          setCurrent(fresh)
          const before = latest.current.draft
          const updated = refreshRepresentativePrefill(before, fresh)
          if (updated !== before) latest.current.onDraft(updated)
          setStatus('fresh')
        } catch {
          if (!cancelled) setStatus('saved')
        }
      })()
    }
    return () => { cancelled = true }
  }, [draft.client_uuid, draft.store_id, online, token])

  const valid = Boolean(draft.representative.name.trim() && draft.representative.title.trim())
  const ready = status !== 'checking' && valid && draft.representative_confirmed === true && !pending
  useEffect(() => { onReady(ready); return () => onReady(false) }, [ready, onReady])

  const edit = (representative: VisitDraft['representative']) => {
    if (draft.finalized_at || sameRepresentative(draft.representative, representative)) return
    if (hasVisitSignatures(draft)) setPending(representative)
    else onDraft(changeVisitRepresentative(draft, representative))
  }
  const suggested = current ? currentStoreRepresentative(current) : null
  const differs = suggested?.name && !sameRepresentative(draft.representative, suggested)

  return <section className="representative-review" aria-label="Confirm monitoring representative">
    {status === 'checking' ? <p role="status">Checking current representative…</p> : status === 'saved' ? <p role="status">Using saved representative details. Confirm with the person signing.</p> : <p>Current representative checked. Confirm who is present for this visit.</p>}
    {differs && <div className="representative-suggestion"><p>Current establishment representative: <strong>{suggested.name} · {suggested.title}</strong></p><button type="button" className="secondary-button" onClick={() => edit(suggested)}>Use current representative</button></div>}
    <div className="representative-fields">
      <label>Store representative name<input maxLength={255} value={draft.representative.name} placeholder="e.g. Juan Dela Cruz" onChange={(event) => edit({ ...draft.representative, name: event.target.value })} /></label>
      <label>Position / Title<input maxLength={255} value={draft.representative.title} placeholder="e.g. Manager, Cashier, Owner" onChange={(event) => edit({ ...draft.representative, title: event.target.value })} /></label>
    </div>
    <label className="representative-confirmation"><input type="checkbox" checked={draft.representative_confirmed === true} disabled={!valid || status === 'checking'} onChange={(event) => onDraft({ ...draft, representative_confirmed: event.target.checked })} /><span>I confirm this name and role match the person signing this visit.</span></label>
    {pending && createPortal(<div className="field-dialog-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="representative-change-title" className="field-dialog">
      <h3 id="representative-change-title">Change the signer details?</h3><p>Both signatures will be cleared and must be captured again.</p>
      <div className="field-dialog-actions"><button type="button" className="secondary-button" autoFocus onClick={() => setPending(null)}>Cancel</button>
      <button type="button" className="danger-button" onClick={() => { onDraft(changeVisitRepresentative(latest.current.draft, pending)); setPending(null) }}>Clear signatures and change</button></div>
    </section></div>, document.body)}
  </section>
}
