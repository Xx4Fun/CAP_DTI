import { describe, expect, it } from 'vitest';
import { getPriceLabel, type PriceDataSource } from './priceDataPresentation';

describe('price data presentation', () => {
  it.each<[PriceDataSource, string]>([
    ['live', 'Current SRP'],
    ['cached', 'Current SRP'],
    ['bundled', 'Current SRP'],
  ])('keeps the public SRP label consistent for %s data', (source, expected) => {
    expect(getPriceLabel(source)).toBe(expected);
  });
});
