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
  if (reference) {
    const isEmergency = reference.type === 'emergency_ceiling';
    const label = !isEmergency ? reference.label
      : reference.status !== 'available' ? 'Freeze reference unavailable'
      : reference.label === 'Official APC / Price Freeze reference' ? 'APC ceiling'
      : reference.label === 'Official frozen price reference' ? 'Frozen SRP ceiling'
      : 'Price Freeze ceiling';
    return { label, value: reference.status === 'available' ? reference.value : null, isEmergency };
  }
  if (freeze && commodity.price_freeze_applicable) return { label: 'Freeze reference unavailable', value: null, isEmergency: true };
  return { label: 'Current SRP', value: commodity.baseline_price, isEmergency: false };
}
