const DATABASE_NAME = 'price-watch-report-access';
const STORE_NAME = 'tracking-credentials';
const DATABASE_VERSION = 1;

interface StoredTrackingCredential {
  reference: string;
  token: string;
  createdAt: string;
}

const openDatabase = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  if (!globalThis.indexedDB) {
    reject(new Error('Device report storage is unavailable.'));
    return;
  }

  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STORE_NAME)) {
      request.result.createObjectStore(STORE_NAME, { keyPath: 'reference' });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error('Unable to open device report storage.'));
});

export async function saveReportTrackingToken(reference: string, token: string): Promise<void> {
  const normalizedReference = reference.trim();
  const normalizedToken = token.trim();
  if (!normalizedReference || !normalizedToken.startsWith('trk_')) {
    throw new Error('Invalid report tracking credential.');
  }

  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put({
        reference: normalizedReference,
        token: normalizedToken,
        createdAt: new Date().toISOString(),
      } satisfies StoredTrackingCredential);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Unable to save report access.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Saving report access was interrupted.'));
    });
  } finally {
    database.close();
  }
}

export async function getReportTrackingToken(reference: string): Promise<string | null> {
  const normalizedReference = reference.trim();
  if (!normalizedReference) return null;

  const database = await openDatabase();
  try {
    return await new Promise<string | null>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(normalizedReference);
      request.onsuccess = () => resolve((request.result as StoredTrackingCredential | undefined)?.token ?? null);
      request.onerror = () => reject(request.error ?? new Error('Unable to read report access.'));
    });
  } finally {
    database.close();
  }
}

export async function deleteReportTrackingToken(reference: string): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(reference.trim());
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Unable to remove report access.'));
    });
  } finally {
    database.close();
  }
}
