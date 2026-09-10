import type { ComparisonResultResponse } from '../api/client';

export const RECENT_COMPARISONS_KEY = 'price-watch-recent-comparisons';
export const MAX_RECENT_COMPARISONS = 20;

export type ComparisonStatusType = 'MATCHES_SRP' | 'ABOVE_SRP' | 'BELOW_SRP';

export interface StoredComparison {
  id: string;
  comparedAt: string;
  storeId: number;
  storeName: string;
  storeAddress?: string;
  commodityId: number;
  commodityName: string;
  category?: string;
  unit?: string;
  imagePath?: string | null;
  displayedPrice: number;
  referencePrice: number;
  pesoDifference: number;
  percentageDifference: number;
  status: ComparisonStatusType;
  resultPayload: ComparisonResultResponse;
}

export function normalizeComparisonStatus(comparison: ComparisonResultResponse): ComparisonStatusType {
  if (comparison.is_above_reference || comparison.comparison_status === 'ABOVE_SRP') {
    return 'ABOVE_SRP';
  }
  if (comparison.comparison_status === 'BELOW_SRP') {
    return 'BELOW_SRP';
  }
  return 'MATCHES_SRP';
}

export const isStoredComparison = (value: unknown): value is StoredComparison => {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string'
    && typeof item.comparedAt === 'string'
    && typeof item.storeName === 'string'
    && typeof item.commodityName === 'string'
    && typeof item.displayedPrice === 'number'
    && typeof item.referencePrice === 'number'
    && typeof item.resultPayload === 'object'
    && item.resultPayload !== null;
};

const newestFirst = (items: StoredComparison[]): StoredComparison[] => (
  [...items].sort((left, right) => {
    const leftTime = Date.parse(left.comparedAt);
    const rightTime = Date.parse(right.comparedAt);
    if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return 0;
    return rightTime - leftTime;
  })
);

export function getRecentComparisons(): StoredComparison[] {
  try {
    const raw = localStorage.getItem(RECENT_COMPARISONS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? newestFirst(parsed.filter(isStoredComparison)).slice(0, MAX_RECENT_COMPARISONS)
      : [];
  } catch {
    return [];
  }
}

export function saveRecentComparison(comparison: ComparisonResultResponse): StoredComparison[] {
  const storeId = comparison.store?.id || 0;
  const storeName = comparison.store?.store_name || 'Retail Store';
  const storeAddress = comparison.store?.address || '';
  const commodityId = comparison.product?.id || (comparison as any).commodity_id || 0;
  const commodityName = comparison.commodity_name || comparison.product?.commodity_name || 'Commodity Item';
  const category = comparison.product?.category || '';
  const unit = comparison.package_size || comparison.unit || comparison.product?.unit || '';
  const imagePath = (comparison as any).image_path
    || (comparison.product as any)?.image_path
    || null;

  const displayedPrice = typeof comparison.displayed_price === 'number'
    ? comparison.displayed_price
    : parseFloat(String(comparison.displayed_price) || '0');

  const referencePrice = typeof (comparison.reference_price ?? comparison.baseline_price) === 'number'
    ? (comparison.reference_price ?? comparison.baseline_price) as number
    : parseFloat(String(comparison.reference_price ?? comparison.baseline_price ?? '0'));

  const rawPesoDiff = comparison.peso_difference ?? comparison.difference_pesos;
  const pesoDifference = typeof rawPesoDiff === 'number'
    ? rawPesoDiff
    : rawPesoDiff !== undefined
      ? parseFloat(String(rawPesoDiff))
      : displayedPrice - referencePrice;

  const rawPercentDiff = comparison.percent_difference ?? comparison.percentage_srp;
  const percentageDifference = typeof rawPercentDiff === 'number'
    ? rawPercentDiff
    : rawPercentDiff !== undefined
      ? parseFloat(String(rawPercentDiff))
      : referencePrice > 0
        ? ((displayedPrice - referencePrice) / referencePrice) * 100
        : 0;

  const status = normalizeComparisonStatus(comparison);

  const newStored: StoredComparison = {
    id: `${storeId}-${commodityId}-${Date.now()}`,
    comparedAt: new Date().toISOString(),
    storeId,
    storeName,
    storeAddress,
    commodityId,
    commodityName,
    category,
    unit,
    imagePath,
    displayedPrice,
    referencePrice,
    pesoDifference,
    percentageDifference,
    status,
    resultPayload: comparison,
  };

  const existing = getRecentComparisons();
  const filtered = existing.filter((item) => {
    if (commodityId > 0 && item.commodityId > 0) {
      return !(item.storeId === storeId && item.commodityId === commodityId);
    }
    return !(item.storeId === storeId && item.commodityName.trim().toLowerCase() === commodityName.trim().toLowerCase());
  });

  const nextList = [newStored, ...filtered].slice(0, MAX_RECENT_COMPARISONS);

  try {
    localStorage.setItem(RECENT_COMPARISONS_KEY, JSON.stringify(nextList));
  } catch {
    // Graceful handling if localStorage is full or disabled
  }

  return nextList;
}

export function clearRecentComparisons(): void {
  try {
    localStorage.removeItem(RECENT_COMPARISONS_KEY);
  } catch {
    // Graceful handling
  }
}

export function deleteRecentComparison(id: string): StoredComparison[] {
  const existing = getRecentComparisons();
  const nextList = existing.filter((item) => item.id !== id);
  try {
    localStorage.setItem(RECENT_COMPARISONS_KEY, JSON.stringify(nextList));
  } catch {
    // Graceful handling
  }
  return nextList;
}
