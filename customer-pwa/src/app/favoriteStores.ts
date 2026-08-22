import { safeLocalStorage } from './safeStorage';

const FAVORITE_STORES_KEY = 'price_watch_favorite_stores';

export function getFavoriteStoreIds(): number[] {
  try {
    const raw = safeLocalStorage.getItem(FAVORITE_STORES_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.reduce<number[]>((ids, value) => {
      if (typeof value === 'number' && Number.isInteger(value) && value > 0 && !ids.includes(value)) {
        ids.push(value);
      }
      return ids;
    }, []);
  } catch {
    return [];
  }
}

export function toggleFavoriteStore(storeId: number): number[] {
  const current = getFavoriteStoreIds();
  const next = current.includes(storeId)
    ? current.filter((id) => id !== storeId)
    : [...current, storeId];

  safeLocalStorage.setItem(FAVORITE_STORES_KEY, JSON.stringify(next));
  return next;
}
