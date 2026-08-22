import { beforeEach, describe, expect, it } from 'vitest';
import { getFavoriteStoreIds, toggleFavoriteStore } from './favoriteStores';

describe('favorite stores', () => {
  beforeEach(() => localStorage.clear());

  it('adds and removes a store while preserving the saved order', () => {
    expect(toggleFavoriteStore(77)).toEqual([77]);
    expect(toggleFavoriteStore(12)).toEqual([77, 12]);
    expect(toggleFavoriteStore(77)).toEqual([12]);
    expect(getFavoriteStoreIds()).toEqual([12]);
  });

  it('ignores malformed and duplicate stored values', () => {
    localStorage.setItem('price_watch_favorite_stores', JSON.stringify([77, '77', 77, -1, 12]));
    expect(getFavoriteStoreIds()).toEqual([77, 12]);

    localStorage.setItem('price_watch_favorite_stores', '{broken');
    expect(getFavoriteStoreIds()).toEqual([]);
  });
});
