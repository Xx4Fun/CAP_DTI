import { describe, expect, it } from 'vitest';
import { getPriceLabel, type PriceDataSource } from './priceDataPresentation';

describe('price data presentation', () => {
  it.each<[PriceDataSource, string]>([
    ['live', 'Current SRP'],
    ['cached', 'Saved reference price'],
    ['bundled', 'Reference price'],
  ])('uses a truthful label for %s data', (source, expected) => {
    expect(getPriceLabel(source)).toBe(expected);
  });
});
