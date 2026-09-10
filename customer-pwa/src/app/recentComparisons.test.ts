import { describe, it, expect, beforeEach } from 'vitest';
import {
  getRecentComparisons,
  saveRecentComparison,
  clearRecentComparisons,
  deleteRecentComparison,
  normalizeComparisonStatus,
  RECENT_COMPARISONS_KEY,
} from './recentComparisons';
import type { ComparisonResultResponse } from '../api/client';

describe('recentComparisons module', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const sampleComparison: ComparisonResultResponse = {
    scan_id: 'scan-123',
    store: {
      id: 1,
      store_name: 'Super Metro San Jose',
      address: 'San Jose de Buenavista, Antique',
    },
    product: {
      id: 10,
      commodity_name: 'Angel Kremdensada',
      category: 'Dairy',
      unit: '410ml',
      baseline_price: 58.00,
      effective_date: '2026-08-01',
    },
    displayed_price: 62.50,
    baseline_price: 58.00,
    reference_price: 58.00,
    comparison_status: 'ABOVE_SRP',
    is_above_reference: true,
    peso_difference: 4.50,
    percent_difference: 7.76,
  };

  it('normalizes comparison status correctly', () => {
    expect(normalizeComparisonStatus({ ...sampleComparison, comparison_status: 'ABOVE_SRP' })).toBe('ABOVE_SRP');
    expect(normalizeComparisonStatus({ ...sampleComparison, comparison_status: 'MATCHES_SRP', is_above_reference: false })).toBe('MATCHES_SRP');
    expect(normalizeComparisonStatus({ ...sampleComparison, comparison_status: 'BELOW_SRP', is_above_reference: false })).toBe('BELOW_SRP');
  });

  it('returns empty array when no comparisons are saved', () => {
    expect(getRecentComparisons()).toEqual([]);
  });

  it('saves and retrieves recent comparisons', () => {
    const list = saveRecentComparison(sampleComparison);
    expect(list).toHaveLength(1);
    expect(list[0].storeName).toBe('Super Metro San Jose');
    expect(list[0].commodityName).toBe('Angel Kremdensada');
    expect(list[0].displayedPrice).toBe(62.50);
    expect(list[0].referencePrice).toBe(58.00);
    expect(list[0].status).toBe('ABOVE_SRP');

    const retrieved = getRecentComparisons();
    expect(retrieved).toHaveLength(1);
    expect(retrieved[0].id).toBe(list[0].id);
  });

  it('updates and moves to top when the same store and commodity is re-compared', () => {
    saveRecentComparison(sampleComparison);

    const updatedComparison: ComparisonResultResponse = {
      ...sampleComparison,
      displayed_price: 58.00,
      comparison_status: 'MATCHES_SRP',
      is_above_reference: false,
      peso_difference: 0,
      percent_difference: 0,
    };

    const updatedList = saveRecentComparison(updatedComparison);
    expect(updatedList).toHaveLength(1);
    expect(updatedList[0].displayedPrice).toBe(58.00);
    expect(updatedList[0].status).toBe('MATCHES_SRP');
  });

  it('deletes an item by id', () => {
    const list = saveRecentComparison(sampleComparison);
    const id = list[0].id;
    const remaining = deleteRecentComparison(id);
    expect(remaining).toEqual([]);
    expect(getRecentComparisons()).toEqual([]);
  });

  it('clears all comparisons', () => {
    saveRecentComparison(sampleComparison);
    clearRecentComparisons();
    expect(getRecentComparisons()).toEqual([]);
    expect(localStorage.getItem(RECENT_COMPARISONS_KEY)).toBeNull();
  });

  it('ignores malformed localStorage content', () => {
    localStorage.setItem(RECENT_COMPARISONS_KEY, 'not-valid-json');
    expect(getRecentComparisons()).toEqual([]);
  });
});
