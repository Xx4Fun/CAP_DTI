const DATABASE_NAME = 'price-watch-receipt-resume';
const STORE_NAME = 'tokens';
const DATABASE_VERSION = 1;

interface StoredResumeToken {
  reference: string;
  token: string;
  createdAt: string;
}

const openDatabase = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  if (!globalThis.indexedDB) {
    reject(new Error('Secure device storage is unavailable.'));
    return;
  }

  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STORE_NAME)) {
      request.result.createObjectStore(STORE_NAME, { keyPath: 'reference' });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error('Unable to open secure device storage.'));
});

export async function saveReceiptResumeToken(reference: string, token: string): Promise<void> {
  if (!reference.trim() || !token.startsWith('rsm_')) {
    throw new Error('Invalid receipt resume credential.');
  }

  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put({
        reference,
        token,
        createdAt: new Date().toISOString(),
      } satisfies StoredResumeToken);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Unable to save receipt resume credential.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Receipt resume credential storage was aborted.'));
    });
  } finally {
    database.close();
  }
}

export async function getReceiptResumeToken(reference: string): Promise<string | null> {
  const database = await openDatabase();
  try {
    return await new Promise<string | null>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(reference);
      request.onsuccess = () => resolve((request.result as StoredResumeToken | undefined)?.token ?? null);
      request.onerror = () => reject(request.error ?? new Error('Unable to read receipt resume credential.'));
    });
  } finally {
    database.close();
  }
}

export async function deleteReceiptResumeToken(reference: string): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(reference);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Unable to remove receipt resume credential.'));
    });
  } finally {
    database.close();
  }
}
