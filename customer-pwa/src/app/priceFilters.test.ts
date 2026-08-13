import { describe, expect, test } from 'vitest';
import type { Commodity } from '../api/client';
import {
  commodityMatchesPriceFilters,
  countActivePriceFilters,
  extractPriceCategories,
  normalizePriceCategory,
  sanitizeAppliedCategories,
} from './priceFilters';

const products = [
  { id: 1, commodity_name: 'Sardines', category: ' Canned Goods ', regulatory_classification: 'BASIC_NECESSITY', baseline_price: 20 },
  { id: 2, commodity_name: 'Milk', category: 'Milk', regulatory_classification: 'PRIME_COMMODITY', baseline_price: 30 },
  { id: 3, commodity_name: 'Coffee', category: 'coffee', regulatory_classification: 'PRIME_COMMODITY', baseline_price: 40 },
] as Commodity[];

describe('price filter rules', () => {
  test('normalizes category values', () => {
    expect(normalizePriceCategory('  Milk ')).toBe('milk');
  });

  test('extracts sorted canonical unique categories', () => {
    expect(extractPriceCategories(products)).toEqual(['Canned Goods', 'coffee', 'Milk']);
  });

  test('matches all classification with OR category selection', () => {
    const ids = products.filter((product) => commodityMatchesPriceFilters(product, 'ALL', ['CANNED GOODS', 'Milk'])).map(({ id }) => id);
    expect(ids).toEqual([1, 2]);
  });

  test('combines classification and categories with AND semantics', () => {
    const ids = products.filter((product) => commodityMatchesPriceFilters(product, 'PRIME_COMMODITY', ['Canned Goods', 'Milk'])).map(({ id }) => id);
    expect(ids).toEqual([2]);
  });

  test('matches every product when no categories and classification is ALL', () => {
    const ids = products.filter((product) => commodityMatchesPriceFilters(product, 'ALL', [])).map(({ id }) => id);
    expect(ids).toEqual([1, 2, 3]);
  });

  test('sanitizes selections to canonical available categories', () => {
    expect(sanitizeAppliedCategories(['milk', 'Missing', 'MILK'], ['Canned Goods', 'Milk'])).toEqual(['Milk']);
  });

  test('counts category selections strictly', () => {
    expect(countActivePriceFilters('ALL', ['Canned Goods', 'Milk'])).toBe(2);
    expect(countActivePriceFilters('PRIME_COMMODITY', ['Canned Goods', 'Milk'])).toBe(2);
    expect(countActivePriceFilters('PRIME_COMMODITY', [])).toBe(0);
  });
});
