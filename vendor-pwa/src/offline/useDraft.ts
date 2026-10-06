import { useEffect, useRef, useState } from 'react';
import { flushWrites, get, put, remove, storageFailure } from './repository';

/** Every edit enters the write queue immediately, including attachment changes. */
export function useDraft<T extends object>(account: number, key: string, initial: T, meaningful: (value: T) => boolean) {
  const [value, setValue] = useState<T & { __revision?: string }>(initial);
  const current = useRef(value);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('Loading saved draft…');
  const revision = useRef(0);
  useEffect(() => {
    let active = true;
    void (async () => { await flushWrites(); return get<T & { __revision?: string }>(account, 'drafts', key); })().then((saved) => {
      if (active) { current.current = saved ?? initial; setValue(current.current); setReady(true); setStatus(saved ? 'Draft · Saved on this device' : ''); }
    }).catch((error) => { if (active) { setStatus(error.message); storageFailure(error); } });
    return () => { active = false; };
    // The parent keys the editor by its store/notice; initial is only a default.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, key]);
  function update(next: T | ((known: T) => T)): void {
    if (!ready) return;
    const version = ++revision.current;
    current.current = { ...(typeof next === 'function' ? next(current.current) : next), __revision: crypto.randomUUID() };
    setValue(current.current);
    setStatus('Saving…');
    const save = meaningful(current.current) ? put(account, 'drafts', key, current.current, { version: current.current.__revision }) : remove(account, 'drafts', key);
    void save.then(() => { if (version === revision.current) setStatus(meaningful(current.current) ? 'Draft · Saved on this device' : ''); })
      .catch(() => { if (version === revision.current) setStatus('Save failed. Keep this page open and retry.'); });
  }
  function retry(): void { update(current.current); }
  return { value, update, ready, status, retry };
}
