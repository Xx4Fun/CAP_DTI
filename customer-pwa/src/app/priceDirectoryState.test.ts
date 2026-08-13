import { describe, expect, it } from 'vitest';
import { type Commodity } from '../api/client';
import {
  PRICE_DIRECTORY_VIEW_KEY,
  getPriceDirectoryEmptyState,
  matchesCommoditySearch,
  readPriceDirectoryView,
  writePriceDirectoryView,
} from './priceDirectoryState';

const commodity: Commodity = {
  id: 1,
  commodity_name: 'Bottled Water - Distilled Water - Absolute',
  category: 'Bottled Water - Distilled Water',
  brand: 'Absolute',
  unit: '1L',
  package_size: '1 liter bottle',
  regulatory_classification: 'BASIC_NECESSITY',
  baseline_price: 25,
  effective_date: null,
  is_active: true,
};

describe('price directory session state', () => {
  it('round-trips the complete directory view using the versioned key', () => {
    const storage = new Map<string, string>();
    const session = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    };
    const state = {
      searchTerm: 'water',
      classification: 'BASIC_NECESSITY' as const,
      categories: ['Bottled Water'],
      sort: 'price_low' as const,
      scrollY: 420,
    };

    writePriceDirectoryView(session, state);

    expect(storage.has(PRICE_DIRECTORY_VIEW_KEY)).toBe(true);
    expect(readPriceDirectoryView(session)).toEqual(state);
  });

  it('falls back safely when saved state is corrupt or outside the allowed values', () => {
    expect(readPriceDirectoryView({ getItem: () => '{broken' })).toEqual({
      searchTerm: '',
      classification: 'ALL',
      categories: [],
      sort: 'default',
      scrollY: 0,
    });
    expect(readPriceDirectoryView({
      getItem: () => JSON.stringify({
        searchTerm: 12,
        classification: 'SECRET',
        categories: ['Milk', 3],
        sort: 'newest',
        scrollY: -2,
      }),
    })).toEqual({
      searchTerm: '',
      classification: 'ALL',
      categories: ['Milk'],
      sort: 'default',
      scrollY: 0,
    });
  });
});

describe('local commodity search', () => {
  it.each(['absolute', 'distilled', 'bottled water', '1l', '1 liter'])('matches %s locally', (query) => {
    expect(matchesCommoditySearch(commodity, query)).toBe(true);
  });

  it('does not match an unrelated query', () => {
    expect(matchesCommoditySearch(commodity, 'coffee')).toBe(false);
  });
});

describe('price directory empty states', () => {
  it('describes search-only, filters-only, and combined conditions accurately', () => {
    expect(getPriceDirectoryEmptyState('coffee', 'ALL', [])).toMatchObject({
      message: 'No reference prices match “coffee”.',
      action: 'clear-search',
    });
    expect(getPriceDirectoryEmptyState('', 'PRIME_COMMODITY', [])).toMatchObject({
      message: 'No reference prices match the selected filters.',
      action: 'clear-filters',
    });
    expect(getPriceDirectoryEmptyState('coffee', 'PRIME_COMMODITY', ['Milk'])).toMatchObject({
      message: 'No reference prices match your search and filters.',
      action: 'clear-all',
    });
  });
});
