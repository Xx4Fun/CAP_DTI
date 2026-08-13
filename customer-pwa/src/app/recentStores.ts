import { safeLocalStorage } from './safeStorage';

const RECENT_STORES_KEY = 'price_watch_recent_stores';
const MAX_RECENT = 5;

export function getRecentStoreIds(): number[] {
  try {
    const raw = safeLocalStorage.getItem(RECENT_STORES_KEY);
    if (!raw) return [];
    const ids = JSON.parse(raw);
    return Array.isArray(ids) ? ids.filter((id): id is number => typeof id === 'number') : [];
  } catch {
    return [];
  }
}

export function addRecentStore(storeId: number): void {
  const ids = getRecentStoreIds().filter((id) => id !== storeId);
  ids.unshift(storeId);
  safeLocalStorage.setItem(RECENT_STORES_KEY, JSON.stringify(ids.slice(0, MAX_RECENT)));
}
