export type PriceDataSource = 'live' | 'cached' | 'bundled';

const PRICE_LABELS: Record<PriceDataSource, string> = {
  live: 'Current SRP',
  cached: 'Saved reference price',
  bundled: 'Reference price',
};

export function getPriceLabel(source: PriceDataSource): string {
  return PRICE_LABELS[source];
}
