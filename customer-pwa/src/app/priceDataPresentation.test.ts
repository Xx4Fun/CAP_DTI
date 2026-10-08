import { describe, expect, it } from 'vitest';
import { applicablePrice, getPriceLabel, type PriceDataSource } from './priceDataPresentation';
import type { Commodity } from '../api/client';

describe('price data presentation', () => {
  it.each<[PriceDataSource, string]>([
    ['live', 'Current SRP'],
    ['cached', 'Current SRP'],
    ['bundled', 'Current SRP'],
  ])('keeps the public SRP label consistent for %s data', (source, expected) => {
    expect(getPriceLabel(source)).toBe(expected);
  });

  const commodity: Commodity = { id: 1, commodity_name: 'Water', baseline_price: 12, effective_date: '2026-05-11', is_active: true, price_freeze_applicable: true };
  const reference: NonNullable<Commodity['reference']> = {
    status: 'available', type: 'emergency_ceiling', value: 14,
    label: 'Official APC / Price Freeze reference', source: 'DECL-1', effective_date: '2026-10-07', source_id: 1,
  };

  it.each([
    ['Official APC / Price Freeze reference', 'APC ceiling'],
    ['Official frozen price reference', 'Frozen SRP ceiling'],
    ['Another official emergency label', 'Price Freeze ceiling'],
  ])('presents %s as %s without substituting SRP', (label, expected) => {
    expect(applicablePrice({ ...commodity, reference: { ...reference, label } }, true))
      .toMatchObject({ label: expected, value: 14, isEmergency: true });
  });

  it('keeps a missing official ceiling unavailable, including legacy saved data', () => {
    expect(applicablePrice({ ...commodity, reference: { ...reference, status: 'unavailable', value: null } }, true))
      .toMatchObject({ value: null, isEmergency: true });
    expect(applicablePrice(commodity, true)).toMatchObject({ value: null, isEmergency: true });
  });

  it('keeps uncovered products at SRP and follows a new standard reference after a freeze ends', () => {
    expect(applicablePrice({ ...commodity, price_freeze_applicable: false }, true))
      .toMatchObject({ value: 12, isEmergency: false });
    expect(applicablePrice({ ...commodity, reference: { ...reference, type: 'standard_srp', label: 'SRP baseline (provisional)', value: 12 } }, false))
      .toMatchObject({ label: 'SRP baseline (provisional)', value: 12, isEmergency: false });
  });
});
