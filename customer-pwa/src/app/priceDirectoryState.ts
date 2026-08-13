import { type Commodity } from '../api/client';
import { formatCommodityDisplay } from './commodityFormatter';
import { type PriceClassification } from './priceFilters';
import { type PriceSortOption } from './priceSort';

export const PRICE_DIRECTORY_VIEW_KEY = 'price-watch-price-directory-view-v1';

export interface PriceDirectoryView {
  searchTerm: string;
  classification: PriceClassification;
  categories: string[];
  sort: PriceSortOption;
  scrollY: number;
}

interface ReadableStorage {
  getItem(key: string): string | null;
}

interface WritableStorage extends ReadableStorage {
  setItem(key: string, value: string): void;
}

const DEFAULT_VIEW: PriceDirectoryView = {
  searchTerm: '',
  classification: 'ALL',
  categories: [],
  sort: 'default',
  scrollY: 0,
};

const classifications: PriceClassification[] = ['ALL', 'BASIC_NECESSITY', 'PRIME_COMMODITY'];
const sortOptions: PriceSortOption[] = ['default', 'price_low', 'price_high', 'name'];

export function readPriceDirectoryView(storage: ReadableStorage): PriceDirectoryView {
  try {
    const raw = storage.getItem(PRICE_DIRECTORY_VIEW_KEY);
    if (!raw) return { ...DEFAULT_VIEW };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      searchTerm: typeof parsed.searchTerm === 'string' ? parsed.searchTerm : '',
      classification: classifications.includes(parsed.classification as PriceClassification)
        ? parsed.classification as PriceClassification
        : 'ALL',
      categories: Array.isArray(parsed.categories)
        ? parsed.categories.filter((category): category is string => typeof category === 'string')
        : [],
      sort: sortOptions.includes(parsed.sort as PriceSortOption)
        ? parsed.sort as PriceSortOption
        : 'default',
      scrollY: typeof parsed.scrollY === 'number' && Number.isFinite(parsed.scrollY) && parsed.scrollY >= 0
        ? parsed.scrollY
        : 0,
    };
  } catch {
    return { ...DEFAULT_VIEW };
  }
}

export function writePriceDirectoryView(storage: WritableStorage, view: PriceDirectoryView): void {
  try {
    storage.setItem(PRICE_DIRECTORY_VIEW_KEY, JSON.stringify(view));
  } catch {
    // Storage can be unavailable in private browsing or under device pressure.
  }
}

function normalizeSearchValue(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function matchesCommoditySearch(commodity: Commodity, query: string): boolean {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return true;

  const formatted = formatCommodityDisplay(
    commodity.commodity_name || '',
    commodity.category || '',
    commodity.unit || commodity.package_size || '',
    commodity.effective_date || '',
  );
  const searchableText = normalizeSearchValue([
    commodity.commodity_name,
    formatted.title,
    formatted.categoryPath,
    commodity.category,
    commodity.brand,
    commodity.variant,
    commodity.unit,
    commodity.package_size,
  ].filter(Boolean).join(' '));

  return normalizedQuery.split(/\s+/).every((term) => searchableText.includes(term));
}

export type PriceDirectoryEmptyAction = 'none' | 'clear-search' | 'clear-filters' | 'clear-all';

export function getPriceDirectoryEmptyState(
  searchTerm: string,
  classification: PriceClassification,
  categories: string[],
): { message: string; action: PriceDirectoryEmptyAction } {
  const hasSearch = Boolean(searchTerm.trim());
  const hasFilters = classification !== 'ALL' || categories.length > 0;

  if (hasSearch && hasFilters) {
    return { message: 'No reference prices match your search and filters.', action: 'clear-all' };
  }
  if (hasSearch) {
    return { message: `No reference prices match “${searchTerm.trim()}”.`, action: 'clear-search' };
  }
  if (hasFilters) {
    return { message: 'No reference prices match the selected filters.', action: 'clear-filters' };
  }
  return { message: 'No reference prices are available right now.', action: 'none' };
}
