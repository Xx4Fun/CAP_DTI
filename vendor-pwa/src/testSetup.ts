import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { beforeEach } from 'vitest';
import { database, flushWrites } from './offline/repository';

Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
if (typeof window !== 'undefined' && !Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function () {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer).buffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}
beforeEach(async () => {
  await flushWrites().catch(() => undefined);
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['snapshots', 'drafts', 'outbox', 'acknowledgements', 'attachments', 'locks', 'meta'], 'readwrite');
    ['snapshots', 'drafts', 'outbox', 'acknowledgements', 'attachments', 'locks'].forEach((bucket) => tx.objectStore(bucket).clear());
    tx.objectStore('meta').delete('device/session');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
});
