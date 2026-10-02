import type { VendorStore } from './types';

/** The API sends the store photo as a loadable URL or null; null shows the generic facade. */
export function resolveStoreImage(store: VendorStore | null | undefined): string | null {
  if (!store) return null;
  return store.image_path?.trim() || '/stores/store.webp';
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
