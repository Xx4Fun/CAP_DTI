import type { Establishment } from '../api/client';

type PublicSearchableStore = Pick<Establishment, 'store_name' | 'address'>;

export const matchesPublicStoreSearch = (store: PublicSearchableStore, query: string): boolean => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return [store.store_name, store.address].some(
    (value) => typeof value === 'string' && value.toLowerCase().includes(normalizedQuery),
  );
};
