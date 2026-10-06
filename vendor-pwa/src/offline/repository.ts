/** Private data lives in IndexedDB, never in the service worker's HTTP cache. */
export type Bucket = 'snapshots' | 'drafts' | 'outbox' | 'acknowledgements' | 'meta';
type Sealed = { iv: Uint8Array<ArrayBuffer>; bytes: ArrayBuffer; version?: string; sequence?: number };
type WriteOptions = { version?: string; immutable?: boolean; consumeDraft?: { key: string; version?: string }; refresh?: { key: string; nonce: string } };
type BinaryRef = { __vendorBinary: string; name?: string; type: string; modified?: number };
const DATABASE = 'price-watch-vendor-private-v1';
const buckets = ['snapshots', 'drafts', 'outbox', 'acknowledgements', 'meta', 'attachments', 'locks'] as const;
let opening: Promise<IDBDatabase> | undefined;
let keyPromise: Promise<CryptoKey> | undefined;
let writes: Promise<unknown> = Promise.resolve();
const failedWrites = new Set<string>();
let pendingPrivateSaves = 0;
export function hasUnsavedChanges(): boolean { return pendingPrivateSaves > 0 || failedWrites.size > 0; }

const request = <T>(value: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  value.onsuccess = () => resolve(value.result);
  value.onerror = () => reject(value.error);
});
const completed = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('Local save was interrupted.'));
});
export function database(): Promise<IDBDatabase> {
  if (!opening) opening = new Promise((resolve, reject) => {
    const pending = indexedDB.open(DATABASE, 1);
    pending.onupgradeneeded = () => buckets.forEach((name) => pending.result.createObjectStore(name));
    pending.onsuccess = () => { pending.result.onversionchange = () => { pending.result.close(); opening = undefined; keyPromise = undefined; }; resolve(pending.result); };
    pending.onerror = () => { opening = undefined; reject(pending.error); };
    pending.onblocked = () => reject(new Error('Close other Vendor tabs to finish opening local storage.'));
  });
  return opening;
}
async function rawGet<T>(bucket: string, id: string): Promise<T | undefined> {
  const db = await database();
  return request(db.transaction(bucket).objectStore(bucket).get(id));
}
async function browserKey(): Promise<CryptoKey> {
  if (!keyPromise) keyPromise = (async () => {
    const existing = await rawGet<CryptoKey>('meta', 'browser-key');
    if (existing) return existing;
    const generated = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const db = await database();
    const tx = db.transaction('meta', 'readwrite');
    const done = completed(tx);
    const current = await request(tx.objectStore('meta').get('browser-key')) as CryptoKey | undefined;
    if (!current) tx.objectStore('meta').put(generated, 'browser-key');
    await done;
    return current ?? generated;
  })().catch((error) => { keyPromise = undefined; throw error; });
  return keyPromise;
}
async function seal(bytes: ArrayBuffer, id: string): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return { iv, bytes: await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(id) }, await browserKey(), bytes) };
}
async function unseal(value: Sealed, id: string): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: value.iv, additionalData: new TextEncoder().encode(id) }, await browserKey(), value.bytes);
}
const recordId = (account: number | 'device', key: string) => `${account}/${key}`;
function broadcast(): void { window.dispatchEvent(new Event('vendor-local-change')); }
export function storageFailure(error: unknown): void {
  window.dispatchEvent(new CustomEvent('vendor-storage-error', { detail: error instanceof Error ? error.message : 'Local storage is unavailable.' }));
}
export async function flushWrites(): Promise<void> {
  await writes;
  if (failedWrites.size) throw new Error('Some changes could not be saved. Keep this page open and retry saving before continuing.');
}

export function put<T>(account: number | 'device', bucket: Bucket, key: string, value: T, options: WriteOptions = {}): Promise<void> {
  if (bucket !== 'snapshots') pendingPrivateSaves++;
  const id = recordId(account, key);
  const operation = writes.catch(() => undefined).then(async () => {
    const binaries: [string, Sealed][] = [];
    async function pack(node: unknown, path: string): Promise<unknown> {
      if (node instanceof Blob) {
        const binaryId = `${account}/${bucket}/${key}/${path}`;
        binaries.push([binaryId, await seal(await node.arrayBuffer(), binaryId)]);
        return { __vendorBinary: binaryId, type: node.type, ...(node instanceof File ? { name: node.name, modified: node.lastModified } : {}) };
      }
      if (Array.isArray(node)) return Promise.all(node.map((item, index) => pack(item, `${path}/${index}`)));
      if (node && typeof node === 'object') {
        return Object.fromEntries(await Promise.all(Object.entries(node).map(async ([name, item]) => [name, await pack(item, `${path}/${name}`)])));
      }
      return node;
    }
    const sealed = await seal(new TextEncoder().encode(JSON.stringify(await pack(value, 'value'))).buffer, `${bucket}/${id}`);
    sealed.version = options.version ?? crypto.randomUUID();
    const db = await database();
    const tx = db.transaction([...new Set([bucket, 'attachments', ...(bucket === 'outbox' || options.refresh ? ['meta'] : []), ...(options.consumeDraft ? ['drafts'] : [])])], 'readwrite');
    const done = completed(tx);
    try {
      if (options.refresh && await request(tx.objectStore('meta').get(`snapshot-request/${account}/${options.refresh.key}`)) !== options.refresh.nonce) { await done; return; }
      const existing = options.immutable || bucket === 'outbox' ? await request(tx.objectStore(bucket).get(id)) as Sealed | undefined : undefined;
      if (!options.immutable || !existing) {
        if (bucket === 'outbox') {
          const counterId = `queue-order/${account}`;
          const counter = await request(tx.objectStore('meta').get(counterId)) as number | undefined;
          sealed.sequence = existing?.sequence ?? (counter ?? 0) + 1;
          if (!existing) tx.objectStore('meta').put(sealed.sequence, counterId);
        }
        tx.objectStore(bucket).put(sealed, id);
        const attachments = tx.objectStore('attachments');
        const prefix = `${account}/${bucket}/${key}/`;
        const keys = await request(attachments.getAllKeys(IDBKeyRange.bound(prefix, `${prefix}\uffff`)));
        keys.forEach((old) => { if (!binaries.some(([next]) => next === old)) attachments.delete(old); });
        binaries.forEach(([binaryId, bytes]) => attachments.put(bytes, binaryId));
      }
      if (options.consumeDraft) {
        const draft = options.consumeDraft;
        const current = await request(tx.objectStore('drafts').get(recordId(account, draft.key))) as Sealed | undefined;
        // A second tab's newer edit is never removed by submitting an older copy.
        if (current && draft.version && current.version === draft.version) {
          tx.objectStore('drafts').delete(recordId(account, draft.key));
          const prefix = `${account}/drafts/${draft.key}/`;
          const attachments = tx.objectStore('attachments');
          (await request(attachments.getAllKeys(IDBKeyRange.bound(prefix, `${prefix}\uffff`)))).forEach((old) => attachments.delete(old));
        }
      }
      await done;
    } catch (error) {
      try { tx.abort(); } catch { /* Already aborted/completed. */ }
      await done.catch(() => undefined);
      throw error;
    }
    failedWrites.delete(`${bucket}/${id}`);
    broadcast();
  }).catch((error) => { if (bucket !== 'snapshots' && !(bucket === 'outbox' && options.immutable)) failedWrites.add(`${bucket}/${id}`); storageFailure(error); throw error; })
    .finally(() => { if (bucket !== 'snapshots') pendingPrivateSaves--; });
  writes = operation.catch(() => undefined);
  return operation;
}

/** A shared request generation prevents stale network responses from other tabs overwriting newer data. */
export async function beginRefresh(account: number, key: string): Promise<string> {
  const nonce = crypto.randomUUID();
  const db = await database();
  const tx = db.transaction('meta', 'readwrite');
  const done = completed(tx);
  tx.objectStore('meta').put(nonce, `snapshot-request/${account}/${key}`);
  await done;
  return nonce;
}

export async function get<T>(account: number | 'device', bucket: Bucket, key: string): Promise<T | undefined> {
  const id = recordId(account, key);
  // Capture ciphertext together before asynchronous decryption. Another tab may
  // replace or consume the record and delete its old attachments while we decrypt.
  const db = await database();
  const tx = db.transaction([bucket, 'attachments']);
  const done = completed(tx);
  const prefix = `${account}/${bucket}/${key}/`;
  const range = IDBKeyRange.bound(prefix, `${prefix}\uffff`);
  const [sealed, binaryKeys, binaryValues] = await Promise.all([
    request(tx.objectStore(bucket).get(id)) as Promise<Sealed | undefined>,
    request(tx.objectStore('attachments').getAllKeys(range)),
    request(tx.objectStore('attachments').getAll(range)) as Promise<Sealed[]>,
  ]);
  await done;
  if (!sealed) return undefined;
  const binaries = new Map(binaryKeys.map((binaryId, index) => [String(binaryId), binaryValues[index]]));
  async function unpack(node: unknown): Promise<unknown> {
    if (node && typeof node === 'object' && '__vendorBinary' in node) {
      const ref = node as BinaryRef;
      if (!ref.__vendorBinary.startsWith(`${account}/${bucket}/${key}/`)) throw new Error('Invalid attachment reference.');
      const bytes = binaries.get(ref.__vendorBinary);
      if (!bytes) throw new Error('A saved attachment is missing. Your local work has been preserved.');
      const plain = await unseal(bytes, ref.__vendorBinary);
      return ref.name !== undefined ? new File([plain], ref.name, { type: ref.type, lastModified: ref.modified }) : new Blob([plain], { type: ref.type });
    }
    if (Array.isArray(node)) return Promise.all(node.map(unpack));
    if (node && typeof node === 'object') return Object.fromEntries(await Promise.all(Object.entries(node).map(async ([name, value]) => [name, await unpack(value)])));
    return node;
  }
  try {
    const value = await unpack(JSON.parse(new TextDecoder().decode(await unseal(sealed, `${bucket}/${id}`))));
    return (bucket === 'outbox' && value && typeof value === 'object' ? { ...value, sequence: sealed.sequence } : value) as T;
  }
  catch (error) { storageFailure(error); throw new Error(`Saved ${bucket === 'snapshots' ? 'information' : 'work'} could not be read. It has not been deleted.`, { cause: error }); }
}

export async function remove(account: number | 'device', bucket: Bucket, key: string): Promise<void> {
  await writes;
  const db = await database();
  const tx = db.transaction([bucket, 'attachments'], 'readwrite');
  const done = completed(tx);
  tx.objectStore(bucket).delete(recordId(account, key));
  const prefix = `${account}/${bucket}/${key}/`;
  const attachments = tx.objectStore('attachments');
  (await request(attachments.getAllKeys(IDBKeyRange.bound(prefix, `${prefix}\uffff`)))).forEach((id) => attachments.delete(id));
  await done;
  failedWrites.delete(`${bucket}/${recordId(account, key)}`);
  broadcast();
}
export async function list<T>(account: number, bucket: Bucket): Promise<{ key: string; value: T }[]> {
  const db = await database();
  const prefix = `${account}/`;
  const keys = await request(db.transaction(bucket).objectStore(bucket).getAllKeys(IDBKeyRange.bound(prefix, `${prefix}\uffff`)));
  const rows = await Promise.all(keys.map(async (id) => {
    const key = String(id).slice(prefix.length);
    try { const value = await get<T>(account, bucket, key); return value === undefined ? undefined : { key, value }; }
    catch (error) { if (!await rawGet(bucket, String(id))) return undefined; throw error; }
  }));
  return rows.filter((row) => row !== undefined) as { key: string; value: T }[];
}

/** Atomic lease is the fallback on browsers without Web Locks; renewed during long uploads. */
export async function withAccountLock<T>(account: number, work: () => Promise<T>, scope = 'delivery', wait = false): Promise<T | undefined> {
  const db = await database();
  const owner = crypto.randomUUID();
  const lockId = `${account}/${scope}`;
  async function claim(renew = false, nativeExclusive = false): Promise<boolean> {
    const tx = db.transaction('locks', 'readwrite');
    const done = completed(tx);
    const store = tx.objectStore('locks');
    const existing = await request(store.get(lockId)) as { owner: string; until: number } | undefined;
    const allowed = renew ? existing?.owner === owner : nativeExclusive || !existing || existing.until < Date.now();
    if (allowed) store.put({ owner, until: Date.now() + 60_000 }, lockId);
    await done;
    return allowed;
  }
  async function run(nativeExclusive = false): Promise<T | undefined> {
    const deadline = Date.now() + 60_000;
    while (!await claim(false, nativeExclusive)) {
      if (!wait || Date.now() > deadline) return undefined;
      await new Promise((resolve) => window.setTimeout(resolve, 30));
    }
    const timer = window.setInterval(() => { void claim(true).catch(storageFailure); }, 10_000);
    try { return await work(); }
    finally {
      window.clearInterval(timer);
      const tx = db.transaction('locks', 'readwrite');
      const done = completed(tx);
      const store = tx.objectStore('locks');
      if ((await request(store.get(lockId)))?.owner === owner) store.delete(lockId);
      await done;
    }
  }
  // Acquiring the native lock proves the prior native owner exited; recover its lease immediately.
  if (navigator.locks) return navigator.locks.request(`vendor-${account}-${scope}`, { ifAvailable: !wait }, (lock) => lock ? run(true) : undefined);
  return run();
}
