import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { ArrowLeft, ExternalLink, FileText, Gavel, MessageSquare, MoreVertical, Paperclip, Pencil, Search, Send, ShieldAlert, Trash2, X } from 'lucide-react'
import { adminApi } from '../../services/adminApi'
import type { ConversationNotice, ConversationSummary, ConversationThread, StoreMessageRecord } from '../../types/admin'
import type { NavigateTo } from './AdminShell'

const THREAD_POLL_MS = 10_000
const LIST_POLL_MS = 30_000
const MAX_BODY = 2000
const MAX_FILE_BYTES = 5 * 1024 * 1024
const FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

const messageOf = (error: unknown, fallback: string) => (error as { response?: { data?: { message?: string } } }).response?.data?.message || fallback
const time = (value: string | null | undefined) => value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : ''
const label = (value: string) => value.replaceAll('_', ' ')
const isImageAttachment = (attachment?: { name: string; mime?: string } | null) => {
  if (!attachment) return false
  if (attachment.mime?.startsWith('image/')) return true
  return /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(attachment.name)
}

/** Polls while the tab is visible; also runs once when it becomes visible again. */
function useVisiblePoll(callback: () => void, delay: number, enabled = true) {
  const saved = useRef(callback)
  saved.current = callback
  useEffect(() => {
    if (!enabled) return
    const tick = () => { if (document.visibilityState === 'visible') saved.current() }
    const timer = window.setInterval(tick, delay)
    document.addEventListener('visibilitychange', tick)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick) }
  }, [delay, enabled])
}

/** Union by id (newer copy wins), oldest first: a poll that started before a send can never drop the sent message. */
const mergeMessages = (current: StoreMessageRecord[], incoming: StoreMessageRecord[]) => {
  const byId = new Map(current.map((message) => [message.id, message]))
  incoming.forEach((message) => byId.set(message.id, message))
  return [...byId.values()].sort((a, b) => a.id - b.id)
}

type TimelineEntry = { at: string; message?: StoreMessageRecord; notice?: ConversationNotice; event?: string }

/** A notice appears once as a card, then as a short entry for each later step, each at the time it happened. */
const noticeEntries = (notice: ConversationNotice): TimelineEntry[] => [
  { at: notice.issued_at || notice.created_at, notice },
  ...(notice.delivered_at ? [{ at: notice.delivered_at, notice, event: `Delivery recorded: ${label(notice.delivery_state)}` }] : []),
  ...(notice.response_received_at ? [{ at: notice.response_received_at, notice, event: 'Response received' }] : []),
  ...(notice.closed_at ? [{ at: notice.closed_at, notice, event: 'Closed' }] : []),
  ...(notice.cancelled_at ? [{ at: notice.cancelled_at, notice, event: 'Cancelled' }] : []),
]

export function StoreCommunications({ onNavigate }: { onNavigate?: NavigateTo }) {
  const [stores, setStores] = useState<ConversationSummary[]>([])
  // Pages of the store list currently shown; polling refreshes all of them.
  const [pages, setPages] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [thread, setThread] = useState<ConversationThread | null>(null)
  const [listError, setListError] = useState('')
  const [threadError, setThreadError] = useState('')
  const [loadingList, setLoadingList] = useState(true)
  const [draft, setDraft] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const [showRecords, setShowRecords] = useState(false)
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null)
  const [menuFor, setMenuFor] = useState<number | null>(null)
  const [editing, setEditing] = useState<{ id: number; text: string; original: string } | null>(null)
  const [changing, setChanging] = useState(false)
  const selectedRef = useRef<number | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const filePreviewUrl = useMemo(() => {
    if (!file || !file.type.startsWith('image/')) return null
    return URL.createObjectURL(file)
  }, [file])

  useEffect(() => {
    return () => {
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl)
    }
  }, [filePreviewUrl])

  useEffect(() => {
    if (!previewImage) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPreviewImage(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [previewImage])

  const loadList = useCallback(() => {
    const query = search.trim() ? { search: search.trim() } : {}
    Promise.all(Array.from({ length: pages }, (_, index) => adminApi.getConversations({ ...query, page: index + 1 })))
      .then((results) => {
        setStores(results.flatMap((page) => page.data).filter((store, index, all) => all.findIndex((item) => item.id === store.id) === index))
        setLastPage(results.at(-1)?.last_page ?? 1); setListError('')
      })
      .catch((reason) => setListError(messageOf(reason, 'Store conversations could not be loaded.')))
      .finally(() => setLoadingList(false))
  }, [search, pages])

  useEffect(() => { setPages(1) }, [search])
  useEffect(() => {
    const timer = window.setTimeout(loadList, search ? 250 : 0)
    return () => window.clearTimeout(timer)
  }, [loadList, search])
  useVisiblePoll(loadList, LIST_POLL_MS)

  const openStore = (id: number) => {
    selectedRef.current = id
    setSelectedId(id); setThread(null); setPreviewImage(null); setThreadError(''); setDraft(''); setFile(null); setShowRecords(false); setMenuFor(null); setEditing(null)
    adminApi.getConversation(id)
      .then((value) => { if (selectedRef.current === id) setThread(value) })
      .catch((reason) => { if (selectedRef.current === id) setThreadError(messageOf(reason, 'This conversation could not be loaded.')) })
    // Opening marks the vendor's messages read on the server.
    setStores((current) => current.map((store) => store.id === id ? { ...store, unread_count: 0 } : store))
  }

  const refreshThread = useCallback(() => {
    const id = selectedRef.current
    if (!id || !thread) return
    adminApi.getConversation(id).then((value) => {
      if (selectedRef.current !== id) return
      setThread((current) => current && { ...value, messages: mergeMessages(current.messages, value.messages), has_more: current.has_more && value.has_more })
    }).catch(() => { /* the next poll retries; the visible thread stays usable */ })
  }, [thread])
  useVisiblePoll(refreshThread, THREAD_POLL_MS, !!thread)

  const timeline = useMemo<TimelineEntry[]>(() => thread ? [
    ...thread.messages.map((message) => ({ at: message.created_at, message })),
    ...thread.notices.flatMap(noticeEntries),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()) : [], [thread])

  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'end' }) }, [timeline.length])

  const chooseFile = (candidate?: File) => {
    if (!candidate) return
    if (!FILE_TYPES.includes(candidate.type)) { setThreadError('Attach a PDF, JPEG, PNG, or WebP file.'); return }
    if (candidate.size > MAX_FILE_BYTES) { setThreadError('Attachments must be 5 MB or smaller.'); return }
    setThreadError(''); setFile(candidate)
  }

  const send = async (event: FormEvent) => {
    event.preventDefault()
    if (!thread || sending || (!draft.trim() && !file)) return
    setSending(true); setThreadError('')
    try {
      const message = await adminApi.sendStoreMessage(thread.store.id, { body: draft.trim() || undefined, attachment: file ?? undefined })
      setThread((current) => current && { ...current, messages: mergeMessages(current.messages, [message]) })
      setDraft(''); setFile(null)
      loadList()
    } catch (reason) { setThreadError(messageOf(reason, 'The message could not be sent.')) }
    finally { setSending(false) }
  }

  useEffect(() => {
    if (menuFor === null) return
    const close = (event: Event) => { if (!(event.target as Element).closest?.('.comms-bubble-actions')) setMenuFor(null) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [menuFor])

  /** The server's copy replaces ours, so the thread shows what the vendor sees. */
  const change = async (request: Promise<StoreMessageRecord>) => {
    if (changing) return
    setChanging(true); setThreadError('')
    try {
      const message = await request
      setThread((current) => current && { ...current, messages: mergeMessages(current.messages, [message]) })
      setEditing(null)
      loadList()
    } catch (reason) { setThreadError(messageOf(reason, 'The message could not be changed.')) }
    finally { setChanging(false) }
  }

  const saveEdit = (event?: { preventDefault: () => void }) => {
    event?.preventDefault()
    const text = editing?.text.trim()
    if (!thread || !editing || !text) return
    if (text === editing.original) { setEditing(null); return }
    void change(adminApi.editStoreMessage(thread.store.id, editing.id, text))
  }

  const deleteMessage = (message: StoreMessageRecord) => {
    if (thread && window.confirm('Delete this message? The vendor will see that a message was deleted.')) void change(adminApi.deleteStoreMessage(thread.store.id, message.id))
  }

  const loadEarlier = () => {
    const id = selectedRef.current
    const first = thread?.messages[0]?.id
    if (!id || !first) return
    adminApi.getConversation(id, first).then((value) => {
      if (selectedRef.current !== id) return
      setThread((current) => current && { ...current, messages: mergeMessages(current.messages, value.messages), has_more: value.has_more })
    }).catch((reason) => setThreadError(messageOf(reason, 'Earlier messages could not be loaded.')))
  }

  const openAttachment = async (message: StoreMessageRecord) => {
    if (!thread) return
    // Open during the click; a window opened after the download finishes is blocked as a popup.
    const opened = window.open('', '_blank')
    if (!opened) { setThreadError('Allow pop-ups for this site to open attachments.'); return }
    opened.opener = null
    try {
      const url = URL.createObjectURL(await adminApi.getMessageAttachment(thread.store.id, message.id))
      opened.location.href = url
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (reason) { opened.close(); setThreadError(messageOf(reason, 'The attachment could not be opened.')) }
  }

  const goToLegal = (params: Record<string, number>) => onNavigate?.('legal_actions', params)

  return (
    <div className={`comms-workspace${selectedId ? ' has-selection' : ''}`}>
      <aside className="comms-list" aria-label="Store conversations">
        <label className="comms-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Search stores</span>
          <input type="search" placeholder="Search stores or owners" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        {listError && <p className="comms-error" role="alert">{listError}</p>}
        {loadingList ? <div className="legal-loading" aria-label="Loading conversations" /> : stores.length ? (
          <ul>
            {stores.map((store) => (
              <li key={store.id}>
                <button type="button" className="comms-store" aria-current={store.id === selectedId ? 'true' : undefined} onClick={() => openStore(store.id)}>
                  <span className="comms-store-top">
                    <strong>{store.store_name}</strong>
                    {store.unread_count > 0 && <span className="comms-badge" aria-label={`${store.unread_count} unread`}>{store.unread_count}</span>}
                  </span>
                  <span className="comms-store-preview">
                    {store.last_message ? `${store.last_message.sender_side === 'dti' ? 'You: ' : ''}${store.last_message.preview ?? 'Attachment'}` : store.vendor ? store.vendor.name : 'No vendor account linked'}
                  </span>
                  <span className="comms-store-meta">
                    {!store.linked && <span className="comms-tag muted">Unlinked</span>}
                    {store.open_notice_count > 0 && <span className="comms-tag warn">{store.open_notice_count} open notice{store.open_notice_count > 1 ? 's' : ''}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : <div className="comms-empty"><MessageSquare size={24} aria-hidden="true" /><span>{search ? 'No stores match this search.' : 'Stores appear here once a vendor account is linked.'}</span></div>}
        {!loadingList && pages < lastPage && <button type="button" className="admin-button secondary comms-more" onClick={() => setPages(pages + 1)}>Load more stores</button>}
      </aside>

      <section className="comms-thread" aria-label="Conversation">
        {!selectedId ? (
          <div className="comms-empty large"><MessageSquare size={32} aria-hidden="true" /><strong>Select a store</strong><span>Messages and the store's LOI/SCO notices appear together in one thread.</span></div>
        ) : !thread ? (
          threadError ? <p className="comms-error" role="alert">{threadError}</p> : <div className="legal-loading" aria-label="Loading conversation" />
        ) : <>
          <header className="comms-thread-header">
            <button type="button" className="comms-back" onClick={() => { selectedRef.current = null; setSelectedId(null); setThread(null); setPreviewImage(null) }} aria-label="Back to stores"><ArrowLeft size={18} /></button>
            <div>
              <h2>{thread.store.store_name}</h2>
              <p>{thread.store.vendor ? `${thread.store.vendor.name} · ${thread.store.vendor.email}${thread.store.vendor.is_active ? '' : ' · inactive'}` : 'No vendor account linked'}</p>
            </div>
            <div className="comms-thread-actions">
              <button type="button" className="admin-button secondary" aria-expanded={showRecords} onClick={() => setShowRecords(!showRecords)} disabled={!thread.eligible_records.length}
                title={thread.eligible_records.length ? undefined : 'No accepted visit with flagged items is waiting for a notice.'}>
                <Gavel size={16} aria-hidden="true" />Prepare LOI/SCO
              </button>
            </div>
          </header>

          {showRecords && (
            <div className="comms-records" role="region" aria-label="Visits eligible for a notice">
              <p>An LOI or SCO starts from an accepted monitoring visit with items above the reference price.</p>
              <ul>
                {thread.eligible_records.map((record) => (
                  <li key={record.id}>
                    <span><strong>Visit #{record.id}</strong> · {record.finalized_at ? new Date(record.finalized_at).toLocaleDateString() : 'Date not recorded'} · {record.eligible_item_count} flagged item{record.eligible_item_count === 1 ? '' : 's'}</span>
                    <button type="button" className="admin-button primary" onClick={() => goToLegal({ source_record: record.id, source_store: thread.store.id })}>Prepare notice</button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="comms-timeline" aria-live="polite">
            {thread.has_more && <button type="button" className="admin-button secondary comms-more" onClick={loadEarlier}>Load earlier messages</button>}
            {timeline.length ? timeline.map((entry) => entry.message ? (
              <div key={`m${entry.message.id}`} className={`comms-message-row ${entry.message.sender_side}`}>
                <div className="comms-bubble-line">
                  {entry.message.can_modify && !entry.message.deleted_at && editing?.id !== entry.message.id && (
                    <MessageMenu
                      open={menuFor === entry.message.id}
                      onToggle={() => setMenuFor(menuFor === entry.message!.id ? null : entry.message!.id)}
                      onClose={() => setMenuFor(null)}
                      items={[
                        ...(entry.message.body ? [{ label: 'Edit', icon: <Pencil size={15} aria-hidden="true" />, run: () => setEditing({ id: entry.message!.id, text: entry.message!.body!, original: entry.message!.body! }) }] : []),
                        { label: 'Delete', icon: <Trash2 size={15} aria-hidden="true" />, run: () => deleteMessage(entry.message!) },
                      ]}
                    />
                  )}
                  <div className={`comms-bubble ${entry.message.sender_side}${entry.message.deleted_at ? ' deleted' : ''}`}>
                    {entry.message.deleted_at ? <p>Message deleted</p> : editing?.id === entry.message.id ? (
                      <form className="comms-bubble-edit" onSubmit={saveEdit}>
                        <textarea
                          aria-label="Edit message"
                          autoFocus
                          rows={2}
                          maxLength={MAX_BODY}
                          disabled={changing}
                          value={editing.text}
                          onChange={(event) => setEditing({ ...editing, text: event.target.value })}
                          onKeyDown={(event) => {
                            if (event.key === 'Escape') setEditing(null)
                            if (event.key === 'Enter' && !event.shiftKey) saveEdit(event)
                          }}
                        />
                        <div>
                          <button type="button" className="admin-button secondary" disabled={changing} onClick={() => setEditing(null)}>Cancel</button>
                          <button type="submit" className="admin-button secondary" disabled={changing || !editing.text.trim() || editing.text.trim() === editing.original}>{changing ? 'Saving…' : 'Save'}</button>
                        </div>
                      </form>
                    ) : entry.message.body && <p>{entry.message.body}</p>}
                    {entry.message.attachment && (
                      isImageAttachment(entry.message.attachment) ? (
                        <MessageImageAttachment
                          storeId={thread.store.id}
                          message={entry.message}
                          onOpenPreview={(url, name) => setPreviewImage({ url, name })}
                          onOpenFallback={() => void openAttachment(entry.message!)}
                        />
                      ) : (
                        <button type="button" className="comms-attachment" onClick={() => void openAttachment(entry.message!)}>
                          <Paperclip size={14} aria-hidden="true" />{entry.message.attachment.name}
                        </button>
                      )
                    )}
                  </div>
                </div>
                <div className="comms-message-meta">
                  <span className="sr-only">
                    {entry.message.sender_side === 'dti'
                      ? `${entry.message.sender_name || 'DTI'} → ${entry.message.vendor_name || 'vendor'}`
                      : (entry.message.sender_name || 'Vendor')}
                  </span>
                  <span>{time(entry.message.created_at)}</span>
                  {entry.message.edited_at && !entry.message.deleted_at && <span> · Edited</span>}
                  {entry.message.sender_side === 'dti' && <span>{entry.message.read_at ? ' · Seen' : ' · Sent'}</span>}
                </div>
              </div>
            ) : entry.event ? (
              <button key={`e${entry.notice!.id}-${entry.event}`} type="button" className="comms-event" onClick={() => goToLegal({ source_notice: entry.notice!.id })}>
                <FileText size={14} aria-hidden="true" />{entry.notice!.control_number || `Notice #${entry.notice!.id}`} · {entry.event} · {time(entry.at)}
              </button>
            ) : (
              <NoticeCard key={`n${entry.notice!.id}`} notice={entry.notice!} preceding={thread.notices.find((notice) => notice.id === entry.notice!.preceding_notice_id)} onOpen={() => goToLegal({ source_notice: entry.notice!.id })} />
            )) : <div className="comms-empty"><span>No messages yet.</span></div>}
            <div ref={endRef} />
          </div>

          {threadError && <p className="comms-error" role="alert"><ShieldAlert size={16} aria-hidden="true" />{threadError}</p>}
          {thread.store.linked ? (
            <form className="comms-composer" onSubmit={(event) => void send(event)}>
              {file && (
                <div className="comms-composer-preview">
                  {filePreviewUrl ? (
                    <div className="comms-composer-img-card">
                      <img src={filePreviewUrl} alt={file.name} className="comms-composer-img-thumb" />
                      <button
                        type="button"
                        className="comms-composer-img-close"
                        onClick={() => setFile(null)}
                        aria-label={`Remove ${file.name}`}
                        title={`Remove ${file.name}`}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="comms-composer-doc-card">
                      <Paperclip size={15} aria-hidden="true" />
                      <span>{file.name}</span>
                      <button
                        type="button"
                        onClick={() => setFile(null)}
                        aria-label={`Remove ${file.name}`}
                        title={`Remove ${file.name}`}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div className="comms-composer-row">
                <label className="comms-attach" title="Attach a file">
                  <Paperclip size={18} aria-hidden="true" /><span className="sr-only">Attach a file</span>
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(event) => { chooseFile(event.target.files?.[0]); event.target.value = '' }} />
                </label>
                <label className="comms-input">
                  <span className="sr-only">Message</span>
                  <textarea rows={1} maxLength={MAX_BODY} placeholder="Write a message to this store's vendor" value={draft} onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} />
                </label>
                <button type="submit" className="admin-button primary" disabled={sending || (!draft.trim() && !file)}><Send size={16} aria-hidden="true" />{sending ? 'Sending…' : 'Send'}</button>
              </div>
            </form>
          ) : <p className="comms-hint locked">This store has no linked vendor account, so the conversation is read-only. Link a vendor from User Management to message them.</p>}
        </>}
      </section>

      {previewImage && (
        <div className="comms-lightbox-overlay" onClick={() => setPreviewImage(null)} role="dialog" aria-modal="true" aria-label="Image Preview">
          <div className="comms-lightbox-header" onClick={(e) => e.stopPropagation()}>
            <span className="comms-lightbox-title">{previewImage.name}</span>
            <div className="comms-lightbox-actions">
              <button
                type="button"
                className="comms-lightbox-btn"
                onClick={() => window.open(previewImage.url, '_blank')}
                title="Open original in new tab"
                aria-label="Open original in new tab"
              >
                <ExternalLink size={18} />
              </button>
              <button
                type="button"
                className="comms-lightbox-btn"
                onClick={() => setPreviewImage(null)}
                title="Close viewer"
                aria-label="Close viewer"
              >
                <X size={20} />
              </button>
            </div>
          </div>
          <div className="comms-lightbox-img-wrap" onClick={(e) => e.stopPropagation()}>
            <img src={previewImage.url} alt={previewImage.name} className="comms-lightbox-img" />
          </div>
        </div>
      )}
    </div>
  )
}

/** The options button beside one of the staff member's own bubbles. Only one menu is open at a time. */
function MessageMenu({ open, onToggle, onClose, items }: { open: boolean; onToggle: () => void; onClose: () => void; items: { label: string; icon: ReactNode; run: () => void }[] }) {
  return (
    <div className="comms-bubble-actions">
      <button type="button" className="comms-bubble-kebab" aria-haspopup="menu" aria-expanded={open} aria-label="Message options" onClick={onToggle}>
        <MoreVertical size={18} aria-hidden="true" />
      </button>
      {open && (
        <div
          className="comms-bubble-menu"
          role="menu"
          ref={(node) => { node?.scrollIntoView?.({ block: 'nearest' }) }}
          onKeyDown={(event) => {
            const item = document.activeElement as HTMLElement | null
            if (event.key === 'Escape') { (event.currentTarget.previousElementSibling as HTMLElement).focus(); onClose() }
            if (event.key === 'ArrowDown') { event.preventDefault(); ((item?.nextElementSibling ?? event.currentTarget.firstElementChild) as HTMLElement).focus() }
            if (event.key === 'ArrowUp') { event.preventDefault(); ((item?.previousElementSibling ?? event.currentTarget.lastElementChild) as HTMLElement).focus() }
          }}
        >
          {items.map((item, index) => (
            <button key={item.label} type="button" role="menuitem" autoFocus={index === 0} onClick={() => { onClose(); item.run() }}>{item.icon}{item.label}</button>
          ))}
        </div>
      )}
    </div>
  )
}

function MessageImageAttachment({
  storeId,
  message,
  onOpenPreview,
  onOpenFallback,
}: {
  storeId: number
  message: StoreMessageRecord
  onOpenPreview: (url: string, name: string) => void
  onOpenFallback: () => void
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    let url: string | null = null
    setLoading(true)
    setFailed(false)
    adminApi.getMessageAttachment(storeId, message.id)
      .then((blob) => {
        if (!active) return
        url = URL.createObjectURL(blob)
        setImageUrl(url)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    // The parent closes its lightbox before switching threads, so nothing still shows this URL when it is revoked.
    return () => {
      active = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [storeId, message.id])

  if (failed) {
    return (
      <button type="button" className="comms-attachment" onClick={onOpenFallback}>
        <Paperclip size={14} aria-hidden="true" />{message.attachment!.name}
      </button>
    )
  }

  if (loading) {
    return <div className="comms-img-skeleton" aria-label="Loading attachment image" />
  }

  if (!imageUrl) return null

  return (
    <button
      type="button"
      className="comms-msg-image-wrap"
      onClick={() => onOpenPreview(imageUrl, message.attachment!.name)}
      title={`Click to view full image: ${message.attachment!.name}`}
      style={{ padding: 0, border: 'none', background: 'transparent' }}
    >
      <img src={imageUrl} alt={message.attachment!.name} className="comms-msg-image" />
    </button>
  )
}

function NoticeCard({ notice, preceding, onOpen }: { notice: ConversationNotice; preceding?: ConversationNotice; onOpen: () => void }) {
  const kind = notice.notice_type === 'LOI' ? 'Letter of Inquiry' : 'Show Cause Order'
  return (
    <article className={`comms-notice ${notice.status}`} aria-label={`${kind} ${notice.control_number ?? 'draft'}`}>
      <header><FileText size={16} aria-hidden="true" /><strong>{kind}</strong><span>{notice.control_number || `Draft #${notice.id}`}</span></header>
      <dl>
        <div><dt>Status</dt><dd>{label(notice.status)}</dd></div>
        {notice.issued_at && <div><dt>Delivery</dt><dd>{label(notice.delivery_state)}</dd></div>}
        {notice.due_date_timestamp && <div><dt>Response due</dt><dd>{time(notice.due_date_timestamp)}</dd></div>}
        {notice.response_received_at && <div><dt>Response</dt><dd>{time(notice.response_received_at)}</dd></div>}
        {notice.preceding_notice_id && <div><dt>Escalated from</dt><dd>{preceding?.control_number ?? `Notice #${notice.preceding_notice_id}`}</dd></div>}
      </dl>
      <button type="button" className="admin-button secondary" onClick={onOpen}>Open in Legal Actions</button>
    </article>
  )
}
