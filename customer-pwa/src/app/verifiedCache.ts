import { safeLocalStorage } from './safeStorage';

const CACHE_SCHEMA_VERSION = 1;

export const PUBLIC_CONFIG_CACHE_KEY = 'price-watch-public-config-v1';
export const PUBLIC_COMMODITIES_CACHE_KEY = 'price-watch-public-commodities-v1';
export const PUBLIC_ESTABLISHMENTS_CACHE_KEY = 'price-watch-public-establishments-v1';
export const PUBLIC_CONFIG_MAX_AGE_MS = 15 * 60 * 1_000;
export const PUBLIC_DIRECTORY_MAX_AGE_MS = 24 * 60 * 60 * 1_000;

interface VerifiedCacheRecord<T> {
  schemaVersion: number;
  fetchedAt: number;
  data: T;
}

export interface VerifiedCacheValue<T> {
  fetchedAt: number;
  data: T;
}

export function writeVerifiedCache<T>(key: string, data: T, fetchedAt = Date.now()): void {
  const record: VerifiedCacheRecord<T> = {
    schemaVersion: CACHE_SCHEMA_VERSION,
    fetchedAt,
    data,
  };
  safeLocalStorage.setItem(key, JSON.stringify(record));
}

export function readVerifiedCache<T>(
  key: string,
  maxAgeMs: number,
  now = Date.now(),
): VerifiedCacheValue<T> | null {
  try {
    const raw = safeLocalStorage.getItem(key);
    if (!raw) return null;

    const record = JSON.parse(raw) as Partial<VerifiedCacheRecord<T>>;
    const age = now - Number(record.fetchedAt);
    if (
      record.schemaVersion !== CACHE_SCHEMA_VERSION
      || typeof record.fetchedAt !== 'number'
      || !('data' in record)
      || age < 0
      || age > maxAgeMs
    ) {
      return null;
    }

    return {
      data: record.data as T,
      fetchedAt: record.fetchedAt,
    };
  } catch {
    return null;
  }
}
