import type { Commodity } from '../api/client';

export type PriceClassification = 'ALL' | 'BASIC_NECESSITY' | 'PRIME_COMMODITY';

export function normalizePriceCategory(value: string): string {
  return value.trim().toLowerCase();
}

export function extractPriceCategories(commodities: Commodity[]): string[] {
  const categories = new Map<string, string>();

  for (const commodity of commodities) {
    const category = commodity.category?.trim() ?? '';
    const normalized = normalizePriceCategory(category);
    if (normalized && !categories.has(normalized)) {
      categories.set(normalized, category);
    }
  }

  return [...categories.values()].sort((left, right) => left.localeCompare(right));
}

export function sanitizeAppliedCategories(applied: string[], available: string[]): string[] {
  const canonicalAvailable = new Map<string, string>();
  for (const category of available) {
    const canonical = category.trim();
    const normalized = normalizePriceCategory(canonical);
    if (normalized && !canonicalAvailable.has(normalized)) {
      canonicalAvailable.set(normalized, canonical);
    }
  }

  const sanitized: string[] = [];
  const seen = new Set<string>();
  for (const category of applied) {
    const canonical = canonicalAvailable.get(normalizePriceCategory(category));
    if (canonical && !seen.has(normalizePriceCategory(canonical))) {
      sanitized.push(canonical);
      seen.add(normalizePriceCategory(canonical));
    }
  }
  return sanitized;
}

export function commodityMatchesPriceFilters(
  commodity: Commodity,
  classification: PriceClassification,
  appliedCategories: string[],
): boolean {
  const matchesClassification = classification === 'ALL' || commodity.regulatory_classification === classification;
  if (!matchesClassification) return false;
  if (appliedCategories.length === 0) return true;

  const category = normalizePriceCategory(commodity.category ?? '');
  return appliedCategories.some((selected) => normalizePriceCategory(selected) === category);
}

export function countActivePriceFilters(
  _classification: PriceClassification,
  appliedCategories: string[],
): number {
  return appliedCategories.length;
}
