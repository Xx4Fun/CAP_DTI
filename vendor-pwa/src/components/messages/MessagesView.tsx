import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, FileText, MessageSquare, Paperclip, Send, X } from 'lucide-react';
import type { Conversation, ConversationNotice, StoreMessage } from '../../app/types';
import { CHAT_ATTACHMENT_TYPES, CHAT_MAX_BODY, CHAT_MAX_BYTES, formatDate } from '../../app/rules';
import { apiError, isSessionInvalid, vendorApi } from '../../services/vendorApi';

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
  ...(notice.closed_at ? [{ at: notice.closed_at, notice, event: 'Closed by DTI' }] : []),
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

export const MessagesView: React.FC<MessagesViewProps> = ({ token, storeId, onSessionInvalid, onViewNotice, onRead }) => {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [file, setFile] = useState<File | null>(null);
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
    vendorApi.conversation(token, storeId)
      .then((value) => { if (active) { setConversation(value); onRead(); } })
      .catch((reason) => { if (active) fail(reason, 'Messages could not load. Check your connection and try again.'); });
    return () => { active = false; };
  }, [token, storeId, fail, onRead]);

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

  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'end' }); }, [entries.length]);

  const chooseFile = (candidate?: File) => {
    if (!candidate) return;
    if (!CHAT_ATTACHMENT_TYPES.includes(candidate.type)) return setError('Attach a PDF, JPEG, PNG, or WebP file.');
    if (candidate.size > CHAT_MAX_BYTES) return setError('Attachments must be 5 MB or smaller.');
    setError(''); setFile(candidate);
  };

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (sending || (!draft.trim() && !file)) return;
    setSending(true); setError('');
    try {
      const message = await vendorApi.sendMessage(token, storeId, { body: draft.trim() || undefined, attachment: file ?? undefined });
      setConversation((current) => current && { ...current, messages: mergeMessages(current.messages, [message]) });
      setDraft(''); setFile(null);
    } catch (reason) { fail(reason, 'Your message could not be sent. Try again when you are online.'); }
    finally { setSending(false); }
  };

  const loadEarlier = () => {
    const first = conversation?.messages[0]?.id;
    if (!first) return;
    vendorApi.conversation(token, storeId, first)
      .then((value) => setConversation((current) => current && { ...current, messages: mergeMessages(current.messages, value.messages), has_more: value.has_more }))
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

  return (
    <section className="v-card vendor-messages" aria-label="Messages with DTI Antique">
      <header className="vendor-messages-header">
        <MessageSquare size={18} aria-hidden="true" />
        <div>
          <h2>Messages with DTI Antique</h2>
          <p>Ask questions about a notice or send supporting photos. Your formal explanation to a notice is still submitted through Rebuttals.</p>
        </div>
      </header>

      <div className="vendor-messages-thread" aria-live="polite">
        {!conversation && !error && <p className="vendor-messages-empty">Loading messages…</p>}
        {conversation?.has_more && <button type="button" className="btn btn-secondary btn-sm vendor-messages-more" onClick={loadEarlier}>Load earlier messages</button>}
        {conversation && entries.length === 0 && <p className="vendor-messages-empty">No messages yet. DTI Antique will reply here.</p>}
        {entries.map((entry) => entry.message ? (
          <div key={`m${entry.message.id}`} className={`vendor-bubble ${entry.message.sender_side === 'vendor' ? 'mine' : 'theirs'}`}>
            {entry.message.body && <p>{entry.message.body}</p>}
            {entry.message.attachment && (
              <button type="button" className="vendor-bubble-file" onClick={() => void openAttachment(entry.message!)}>
                <Paperclip size={14} aria-hidden="true" />{entry.message.attachment.name}
              </button>
            )}
            <span className="vendor-bubble-meta">
              {entry.message.sender_side === 'vendor' ? 'You' : 'DTI Antique'} · {formatDate(entry.message.created_at, true)}
              {entry.message.sender_side === 'vendor' && (entry.message.read_at ? ' · Seen' : ' · Sent')}
            </span>
          </div>
        ) : entry.event ? (
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
        <div ref={endRef} />
      </div>

      {error && <div role="alert" className="portal-error"><AlertTriangle size={16} /><span>{error}</span></div>}

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
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,image/*" onChange={(event) => { chooseFile(event.target.files?.[0]); event.target.value = ''; }} />
          </label>
          <label className="vendor-messages-input">
            <span className="sr-only">Message</span>
            <textarea rows={2} maxLength={CHAT_MAX_BODY} placeholder="Write a message to DTI Antique" value={draft} onChange={(event) => setDraft(event.target.value)} />
          </label>
          <button type="submit" className="btn btn-primary" aria-label={sending ? 'Sending' : 'Send'} disabled={sending || (!draft.trim() && !file)}>
            <Send size={16} aria-hidden="true" /><span>{sending ? 'Sending…' : 'Send'}</span>
          </button>
        </div>
      </form>
    </section>
  );
};
