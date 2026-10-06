import { useCallback, useEffect, useState } from 'react';
import { flushWrites, list, remove, storageFailure, withAccountLock } from './repository';
import type { Submission } from './workspace';
import { accountFor } from './workspace';

export function LocalWork({ token, storeId, operation, onResume, hideDraftKey }: { token: string; storeId?: number; operation?: Submission['operation']; onResume?: (target: number, kind: Submission['operation']) => void; hideDraftKey?: string }) {
  const account = accountFor(token);
  const [entries, setEntries] = useState<Submission[]>([]);
  const [drafts, setDrafts] = useState<{ key: string; value: { storeId?: number } }[]>([]);
  const refresh = useCallback(() => {
    void Promise.all([list<Submission>(account, 'outbox'), list<{ storeId?: number }>(account, 'drafts')]).then(([outbox, saved]) => { setEntries(outbox.map(({ value }) => value)); setDrafts(saved); }).catch(storageFailure);
  }, [account]);
  useEffect(() => {
    refresh();
    window.addEventListener('vendor-local-change', refresh);
    const timer = window.setInterval(refresh, 5000);
    return () => { window.removeEventListener('vendor-local-change', refresh); window.clearInterval(timer); };
  }, [refresh]);
  async function discard(bucket: 'drafts' | 'outbox', key: string) {
    if (!window.confirm('Discard this saved work and its attachments from this device? This cannot be undone.')) return;
    try {
      await flushWrites();
      const removed = await withAccountLock(account, async () => { await remove(account, bucket, key); return true; });
      if (!removed) throw new Error('Delivery is running. Wait for it to finish before discarding work.');
      refresh();
    } catch (error) { storageFailure(error); }
  }
  const visible = entries.filter((item) => (!storeId || item.storeId === storeId) && (!operation || item.operation === operation));
  const visibleDrafts = drafts.filter((item) => item.key !== hideDraftKey && (!storeId || item.value.storeId === storeId) && (!operation || item.key.startsWith(`${operation}/`)));
  const openFile = (file: File) => { const url = URL.createObjectURL(file); window.open(url, '_blank'); window.setTimeout(() => URL.revokeObjectURL(url), 60_000); };
  if (!visible.length && !visibleDrafts.length) return null;
  return <section className="v-card" aria-label="Saved work on this device">
    <h3>Saved work on this device</h3>
    <p>Pending delivery is not received by DTI. Preparing offline does not extend a response deadline.</p>
    {visibleDrafts.map((draft) => {
      const [kind, target] = draft.key.split('/');
      return <div key={draft.key}><strong>Draft · {kind === 'response' ? `Notice #${target}` : `Messages for establishment #${target}`}</strong>{onResume && <button className="btn btn-secondary btn-sm" onClick={() => onResume(Number(target), kind as Submission['operation'])}>Resume</button>}<button className="btn btn-secondary btn-sm" onClick={() => void discard('drafts', draft.key)}>Discard draft</button></div>;
    })}
    {visible.map((entry) => <article key={entry.uuid} style={{ marginBlock: 12 }}>
      <strong>{({ pending: 'Pending delivery', sending: 'Sending', received: 'Received by DTI', attention: 'Needs attention' })[entry.state]} · {entry.operation === 'message' ? 'Message' : `Response to notice #${entry.target}`}</strong>
      <p style={{ whiteSpace: 'pre-wrap' }}>{'response_text' in entry.payload ? entry.payload.response_text : entry.payload.body}</p>
      {'attachments' in entry.payload && entry.payload.attachments.map((attachment, index) => <p key={index}><button className="btn btn-secondary btn-sm" onClick={() => openFile(attachment.file)}>{attachment.file.name} · {attachment.category}</button></p>)}
      {'attachment' in entry.payload && entry.payload.attachment && <button className="btn btn-secondary btn-sm" onClick={() => { if ('attachment' in entry.payload && entry.payload.attachment) openFile(entry.payload.attachment); }}>{entry.payload.attachment.name}</button>}
      {entry.reason && <p role={entry.state === 'attention' ? 'alert' : 'status'}>{entry.reason}</p>}
      {entry.state !== 'received' && entry.state !== 'sending' && <button className="btn btn-secondary btn-sm" onClick={() => void discard('outbox', entry.uuid)}>Discard submission</button>}
    </article>)}
  </section>;
}
