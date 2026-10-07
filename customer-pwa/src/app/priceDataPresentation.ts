import type { Commodity } from '../api/client';

export type PriceDataSource = 'live' | 'cached' | 'bundled';

const PRICE_LABELS: Record<PriceDataSource, string> = {
  live: 'Current SRP',
  cached: 'Current SRP',
  bundled: 'Current SRP',
};

export function getPriceLabel(source: PriceDataSource): string {
  return PRICE_LABELS[source];
}

export function applicablePrice(commodity: Commodity, freeze?: boolean) {
  const reference = commodity.reference;
  if (reference) return { label: reference.label, value: reference.status === 'available' ? reference.value : null };
  if (freeze && commodity.price_freeze_applicable) return { label: 'Emergency reference unavailable', value: null };
  return { label: 'Current SRP', value: commodity.baseline_price };
}
