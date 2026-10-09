import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, FileText, MoreVertical, Paperclip, Pencil, Send, ShieldCheck, Trash2, X } from 'lucide-react';
import type { Conversation, ConversationNotice, StoreMessage } from '../../app/types';
import { CHAT_ATTACHMENT_TYPES, CHAT_MAX_BODY, CHAT_MAX_BYTES, OUTCOME_LABELS, formatDate } from '../../app/rules';
import { apiError, isSessionInvalid, vendorApi } from '../../services/vendorApi';
import { accountFor, enqueue, snapshot, synchronize } from '../../offline/workspace';
import { useDraft } from '../../offline/useDraft';
import { useLocalWork } from '../../offline/LocalWork';
import { storageFailure } from '../../offline/repository';

const POLL_MS = 10_000;

interface MessagesViewProps {
  token: string;
  storeId: number;
  onSessionInvalid: () => void;
  onViewNotice: (noticeId: number) => void;
  /** Called after the thread is read, so the unread badge can refresh. */
  onRead: () => void;
}

type Entry = { at: string; message?: StoreMessage; notice?: ConversationNotice; event?: string };

/** A notice appears once as a card, then as a short entry for each later step, each at the time it happened. */
const noticeEntries = (notice: ConversationNotice): Entry[] => [
  { at: notice.issued_at ?? '', notice },
  ...(notice.delivered_at ? [{ at: notice.delivered_at, notice, event: notice.delivery_state === 'refused' ? 'Recorded as refused' : 'Received' }] : []),
  ...(notice.response_received_at ? [{ at: notice.response_received_at, notice, event: 'Response received by DTI' }] : []),
  ...(notice.closed_at ? [{ at: notice.closed_at, notice, event: notice.outcome === 'escalated_to_sco' ? 'Escalated to a Show Cause Order' : notice.outcome ? `Closed by DTI: ${OUTCOME_LABELS[notice.outcome]}` : 'Closed by DTI' }] : []),
  ...(notice.cancelled_at ? [{ at: notice.cancelled_at, notice, event: 'Withdrawn by DTI' }] : []),
];

/** Union by id (newer copy wins), oldest first: a poll that started before a send can never drop the sent message. */
const mergeMessages = (current: StoreMessage[], incoming: StoreMessage[]) => {
  const byId = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => byId.set(message.id, message));
  return [...byId.values()].sort((a, b) => a.id - b.id);
};

/** Changes when a notice is added or changes state, so the portal's notice list can be refreshed to match. */
const noticeSignature = (conversation: Conversation) => conversation.notices.map((notice) => `${notice.id}:${notice.status}:${notice.delivery_state}`).join('|');

const PENDING_LABELS = { pending: 'Waiting to send', sending: 'Sending…', attention: 'Not sent', received: '' };

/** The options button beside one of the vendor's own bubbles. Only one menu is open at a time. */
const BubbleMenu: React.FC<{ open: boolean; onToggle: () => void; onClose: () => void; items: { label: string; icon: React.ReactNode; run: () => void }[] }> = ({ open, onToggle, onClose, items }) => (
  <div className="vendor-bubble-actions">
    <button type="button" className="vendor-bubble-kebab" aria-haspopup="menu" aria-expanded={open} aria-label="Message options" onClick={onToggle}>
      <MoreVertical size={18} aria-hidden="true" />
    </button>
    {open && (
      <div
        className="vendor-bubble-menu"
        role="menu"
        ref={(node) => node?.scrollIntoView?.({ block: 'nearest' })}
        onKeyDown={(event) => {
          const item = document.activeElement as HTMLElement | null;
          if (event.key === 'Escape') { (event.currentTarget.previousElementSibling as HTMLElement).focus(); onClose(); }
          if (event.key === 'ArrowDown') { event.preventDefault(); ((item?.nextElementSibling ?? event.currentTarget.firstElementChild) as HTMLElement).focus(); }
          if (event.key === 'ArrowUp') { event.preventDefault(); ((item?.previousElementSibling ?? event.currentTarget.lastElementChild) as HTMLElement).focus(); }
        }}
      >
        {items.map((item, index) => (
          <button key={item.label} type="button" role="menuitem" autoFocus={index === 0} onClick={() => { onClose(); item.run(); }}>{item.icon}{item.label}</button>
        ))}
      </div>
    )}
  </div>
);

export const MessagesView: React.FC<MessagesViewProps> = ({ token, storeId, onSessionInvalid, onViewNotice, onRead }) => {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [error, setError] = useState('');
  const local = useLocalWork(token);
  // Sent from this device but not yet accepted by DTI. Delivered ones arrive in the thread itself.
  const queued = local.entries.filter((entry) => entry.operation === 'message' && entry.storeId === storeId && entry.state !== 'received')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const [menuFor, setMenuFor] = useState<number | string | null>(null);
  const [editing, setEditing] = useState<{ id: number; text: string; original: string } | null>(null);
  const [changing, setChanging] = useState(false);
  const composer = useDraft(accountFor(token), `message/${storeId}`, { storeId, draft: '', file: null as File | null }, (value) => !!value.draft || !!value.file);
  const { draft, file } = composer.value;
  const setDraft = (next: string) => composer.update((value) => ({ ...value, draft: next }));
  const setFile = (next: File | null) => composer.update((value) => ({ ...value, file: next }));
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const latest = useRef<Conversation | null>(null);
  latest.current = conversation;

  const fail = useCallback((reason: unknown, fallback: string) => {
    if (isSessionInvalid(reason)) return onSessionInvalid();
    setError(apiError(reason, fallback));
  }, [onSessionInvalid]);

  useEffect(() => {
    let active = true;
    setConversation(null); setError('');
    void snapshot<Conversation>(token, `conversation/${storeId}`).then((saved) => { if (active && saved) setConversation((current) => current ?? saved.data); }).catch(storageFailure);
    vendorApi.conversation(token, storeId)
      .then((value) => { if (active) { setConversation(value); onRead(); } })
      .catch((reason) => { if (active) fail(reason, 'Messages could not load. Check your connection and try again.'); });
    return () => { active = false; };
  }, [token, storeId, fail, onRead]);

  useEffect(() => {
    const delivered = (event: Event) => {
      const detail = (event as CustomEvent<{ token: string; operation: string; target: number; result: StoreMessage }>).detail;
      if (detail.token === token && detail.operation === 'message' && detail.target === storeId) setConversation((current) => current && { ...current, messages: mergeMessages(current.messages, [detail.result]) });
    };
    window.addEventListener('vendor-delivered', delivered);
    return () => window.removeEventListener('vendor-delivered', delivered);
  }, [token, storeId]);

  // Poll for new messages while the app is in the foreground.
  useEffect(() => {
    const tick = () => {
      const current = latest.current;
      if (!current || document.visibilityState !== 'visible' || !navigator.onLine) return;
      vendorApi.conversation(token, storeId).then((value) => {
        if (latest.current?.store.id !== storeId) return;
        if (value.messages.at(-1)?.id !== current.messages.at(-1)?.id || noticeSignature(value) !== noticeSignature(current)) onRead();
        // Keep earlier history and anything sent meanwhile; the poll returns only the latest page.
        setConversation((known) => known && { ...value, messages: mergeMessages(known.messages, value.messages), has_more: known.has_more && value.has_more });
      }).catch((reason) => { if (isSessionInvalid(reason)) onSessionInvalid(); });
    };
    const timer = window.setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [token, storeId, onRead, onSessionInvalid]);

  const entries = useMemo<Entry[]>(() => conversation ? [
    ...conversation.messages.map((message) => ({ at: message.created_at, message })),
    ...conversation.notices.flatMap(noticeEntries),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()) : [], [conversation]);

  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'end' }); }, [entries.length, queued.length]);

  useEffect(() => {
    if (menuFor === null) return;
    const close = (event: Event) => { if (!(event.target as Element).closest?.('.vendor-bubble-actions')) setMenuFor(null); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menuFor]);

  /** Edits and deletes need a connection; the server's copy replaces ours, so the thread shows what DTI sees. */
  const change = async (request: Promise<StoreMessage>) => {
    if (changing) return;
    setChanging(true); setError('');
    try {
      const result = await request;
      setConversation((current) => current && { ...current, messages: mergeMessages(current.messages, [result]) });
      setEditing(null);
    } catch (reason) { fail(reason, 'Your message could not be changed. Check your connection and try again.'); }
    finally { setChanging(false); }
  };

  const saveEdit = (event?: React.SyntheticEvent) => {
    event?.preventDefault();
    const text = editing?.text.trim();
    if (!editing || !text) return;
    if (text === editing.original) return setEditing(null);
    void change(vendorApi.editMessage(token, storeId, editing.id, text));
  };

  const deleteMessage = (message: StoreMessage) => {
    if (window.confirm('Delete this message? DTI Antique will see that a message was deleted.')) void change(vendorApi.deleteMessage(token, storeId, message.id));
  };

  const chooseFile = (candidate?: File) => {
    if (!candidate) return;
    if (!CHAT_ATTACHMENT_TYPES.includes(candidate.type)) return setError('Attach a PDF, JPEG, PNG, or WebP file.');
    if (candidate.size > CHAT_MAX_BYTES) return setError('Attachments must be 5 MB or smaller.');
    setError(''); setFile(candidate);
  };

  const send = async (event?: React.SyntheticEvent) => {
    event?.preventDefault();
    if (sending || (!draft.trim() && !file)) return;
    setSending(true); setError('');
    try {
      await enqueue(token, 'message', storeId, storeId, { body: draft.trim() || undefined, attachment: file ?? undefined }, composer.value.__revision);
      composer.update({ storeId, draft: '', file: null });
      void synchronize(token).catch(storageFailure);
    } catch (reason) { fail(reason, 'Your message could not be sent. Try again when you are online.'); }
    finally { setSending(false); }
  };

  const loadEarlier = () => {
    const first = conversation?.messages[0]?.id;
    if (!first) return;
    vendorApi.conversation(token, storeId, first)
      .then((value) => {
        setConversation((current) => current && { ...current, messages: mergeMessages(current.messages, value.messages), has_more: value.has_more });
        // The server marked this earlier page read; refresh the unread counts shown outside the thread.
        onRead();
      })
      .catch((reason) => fail(reason, 'Earlier messages could not load.'));
  };

  const openAttachment = async (message: StoreMessage) => {
    const opened = window.open('', '_blank');
    try {
      const url = URL.createObjectURL(await vendorApi.messageAttachment(token, storeId, message.id));
      if (opened) opened.location.href = url; else window.location.assign(url);
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (reason) { opened?.close(); fail(reason, 'The attachment could not be opened.'); }
  };

  const messageBubble = (message: StoreMessage) => {
    const mine = message.sender_side === 'vendor';
    const bubble = (
      <div className={`vendor-bubble ${mine ? 'mine' : 'theirs'}${message.deleted_at ? ' deleted' : ''}`}>
        {message.deleted_at ? <p>{mine ? 'You deleted this message' : 'Message deleted'}</p> : editing?.id === message.id ? (
          <form className="vendor-bubble-edit" onSubmit={saveEdit}>
            <textarea
              aria-label="Edit message"
              autoFocus
              rows={2}
              maxLength={CHAT_MAX_BODY}
              disabled={changing}
              value={editing.text}
              onChange={(event) => setEditing({ ...editing, text: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setEditing(null);
                if (event.key === 'Enter' && !event.shiftKey) saveEdit(event);
              }}
            />
            <div>
              <button type="button" className="btn btn-secondary btn-sm" disabled={changing} onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit" className="btn btn-secondary btn-sm" disabled={changing || !editing.text.trim() || editing.text.trim() === editing.original}>{changing ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        ) : message.body && <p>{message.body}</p>}
        {message.attachment && (
          <button type="button" className="vendor-bubble-file" onClick={() => void openAttachment(message)}>
            <Paperclip size={14} aria-hidden="true" />{message.attachment.name}
          </button>
        )}
        <span className="vendor-bubble-meta">
          {mine ? 'You' : 'DTI Antique'} · {formatDate(message.created_at, true)}
          {message.edited_at && !message.deleted_at && ' · Edited'}
          {mine && !message.deleted_at && (message.read_at ? ' · Seen' : ' · Sent')}
        </span>
      </div>
    );
    if (!mine) return <React.Fragment key={`m${message.id}`}>{bubble}</React.Fragment>;
    return (
      <div key={`m${message.id}`} className="vendor-bubble-row">
        {!message.deleted_at && editing?.id !== message.id && (
          <BubbleMenu
            open={menuFor === message.id}
            onToggle={() => setMenuFor(menuFor === message.id ? null : message.id)}
            onClose={() => setMenuFor(null)}
            items={[
              ...(message.body ? [{ label: 'Edit', icon: <Pencil size={15} aria-hidden="true" />, run: () => setEditing({ id: message.id, text: message.body!, original: message.body! }) }] : []),
              { label: 'Delete', icon: <Trash2 size={15} aria-hidden="true" />, run: () => deleteMessage(message) },
            ]}
          />
        )}
        {bubble}
      </div>
    );
  };

  return (
    <section className="v-card vendor-messages" aria-label="Messages with DTI Antique">
      <header className="vendor-messenger-header" aria-label="Conversation with DTI Antique">
        <div className="vendor-messenger-avatar-wrap">
          <img
            src="/branding/dti-logo.svg"
            alt="DTI Antique Official Seal"
            className="vendor-messenger-avatar-img"
          />
          <span className="vendor-messenger-status-dot" aria-hidden="true" title="Online" />
        </div>
        <div className="vendor-messenger-header-info">
          <div className="vendor-messenger-name-row">
            <h2 className="vendor-messenger-title">DTI Antique Provincial Office</h2>
            <span className="vendor-messenger-verified-badge" title="Verified DTI Official">
              <ShieldCheck size={15} aria-hidden="true" />
            </span>
          </div>
          <p className="vendor-messenger-subtitle">
            DTI Price Evaluator · <span className="vendor-messenger-online-text">Active now</span>
          </p>
        </div>
      </header>

      <div className="vendor-messages-thread" aria-live="polite">
        {!conversation && !error && <p className="vendor-messages-empty">Loading messages…</p>}
        {conversation?.has_more && <button type="button" className="btn btn-secondary btn-sm vendor-messages-more" onClick={loadEarlier}>Load earlier messages</button>}
        {conversation && entries.length === 0 && <p className="vendor-messages-empty">No messages yet. DTI Antique will reply here.</p>}
        {entries.map((entry) => entry.message ? messageBubble(entry.message) : entry.event ? (
          <button key={`e${entry.notice!.id}-${entry.event}`} type="button" className="vendor-notice-event" onClick={() => onViewNotice(entry.notice!.id)}>
            <FileText size={13} aria-hidden="true" />{entry.notice!.control_number ?? 'Notice'} · {entry.event} · {formatDate(entry.at, true)}
          </button>
        ) : (
          <button key={`n${entry.notice!.id}`} type="button" className="vendor-notice-card" onClick={() => onViewNotice(entry.notice!.id)}>
            <FileText size={16} aria-hidden="true" />
            <span>
              <strong>{entry.notice!.notice_type === 'SCO' ? 'Show Cause Order' : 'Letter of Inquiry'} {entry.notice!.control_number ?? ''}</strong>
              <small>
                Issued {formatDate(entry.notice!.issued_at, true)}
                {entry.notice!.due_date_timestamp && entry.notice!.status === 'issued' ? ` · respond by ${formatDate(entry.notice!.due_date_timestamp, true)}` : ` · ${entry.notice!.status.replace('_', ' ')}`}
              </small>
            </span>
            <span className="vendor-notice-card-cta">View notice</span>
          </button>
        ))}
        {queued.map((entry) => {
          const payload = entry.payload as { body?: string; attachment?: File };
          return (
            <div key={entry.uuid} className="vendor-bubble-row">
              {entry.state !== 'sending' && (
                <BubbleMenu
                  open={menuFor === entry.uuid}
                  onToggle={() => setMenuFor(menuFor === entry.uuid ? null : entry.uuid)}
                  onClose={() => setMenuFor(null)}
                  items={[{ label: 'Delete', icon: <Trash2 size={15} aria-hidden="true" />, run: () => void local.discard('outbox', entry.uuid) }]}
                />
              )}
              <div className="vendor-bubble mine pending">
                {payload.body && <p>{payload.body}</p>}
                {payload.attachment && <span className="vendor-bubble-file"><Paperclip size={14} aria-hidden="true" />{payload.attachment.name}</span>}
                <span className="vendor-bubble-meta" role={entry.state === 'attention' ? 'alert' : undefined}>
                  You · {PENDING_LABELS[entry.state]}{entry.state === 'attention' && entry.reason ? ` · ${entry.reason}` : ''}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {error && <div role="alert" className="portal-error"><AlertTriangle size={16} /><span>{error}</span></div>}
      <p role="status" className={composer.status.startsWith('Save failed') ? undefined : 'sr-only'}>{composer.status}</p>
      {composer.status.startsWith('Save failed') && <button className="btn btn-secondary btn-sm" onClick={composer.retry}>Retry saving draft</button>}

      <form className="vendor-messages-composer" onSubmit={(event) => void send(event)}>
        {file && (
          <span className="vendor-file-chip">
            <Paperclip size={14} aria-hidden="true" />{file.name}
            <button type="button" onClick={() => setFile(null)} aria-label={`Remove ${file.name}`}><X size={14} /></button>
          </span>
        )}
        <div className="vendor-messages-row">
          <label className="vendor-attach" title="Attach a photo or PDF">
            <Paperclip size={18} aria-hidden="true" />
            <span className="sr-only">Attach a photo or PDF</span>
            <input type="file" disabled={sending || !composer.ready} accept=".pdf,.jpg,.jpeg,.png,.webp,image/*" onChange={(event) => { chooseFile(event.target.files?.[0]); event.target.value = ''; }} />
          </label>
          <label className="vendor-messages-input">
            <span className="sr-only">Message</span>
            <textarea
              disabled={sending || !composer.ready}
              rows={1}
              maxLength={CHAT_MAX_BODY}
              placeholder="Write a message to DTI Antique"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void send(event);
                }
              }}
            />
          </label>
          <button type="submit" className="btn btn-primary" aria-label={sending ? 'Saving submission' : 'Send'} disabled={sending || !composer.ready || (!draft.trim() && !file)}>
            <Send size={16} aria-hidden="true" /><span>{sending ? 'Sending…' : 'Send'}</span>
          </button>
        </div>
      </form>
    </section>
  );
};
