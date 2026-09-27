import type { VendorStore } from './types';

/**
 * Resolves the display image URL for a store.
 * Checks store.image_path first, then matches by known establishment names,
 * and falls back to the default store facade asset.
 */
export function resolveStoreImage(store: VendorStore | null | undefined): string | null {
  if (!store) return null;

  const raw = store.image_path?.trim();
  if (raw) {
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
    if (raw.startsWith('/')) return raw;
    return `/${raw}`;
  }

  const name = (store.store_name || '').toLowerCase();
  if (name.includes('gaisano')) return '/stores/gaisano-grand.webp';
  if (name.includes('robinson')) return '/stores/robinsons.webp';
  if (name.includes('licanda') && (name.includes('branch 1') || name.includes(' 1'))) return '/stores/licandas-branch-1.webp';
  if (name.includes('licanda')) return '/stores/licandas-branch-2.webp';
  if (name.includes('merrymart')) return '/stores/merrymart.webp';

  return '/stores/store.webp';
}

/**
 * Extracts 1-2 letter uppercase initials from the store name.
 */
export function getStoreInitials(storeName: string | null | undefined): string {
  if (!storeName) return 'ST';
  const words = storeName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'ST';
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join('');
}
