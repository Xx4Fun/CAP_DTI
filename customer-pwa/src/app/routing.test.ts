import { describe, expect, it } from 'vitest';
import { parseRoute, pathFor } from './routing';

describe('routing', () => {
  it('parses a product detail URL', () => {
    expect(parseRoute('/prices/42')).toEqual({ name: 'product', commodityId: 42 });
  });

  it('falls back to home for unknown paths', () => {
    expect(parseRoute('/not-a-screen')).toEqual({ name: 'home' });
  });

  it('generates stable report paths', () => {
    expect(pathFor({ name: 'new-report' })).toBe('/reports/new');
    expect(pathFor({ name: 'track-report' })).toBe('/reports/track');
    expect(pathFor({ name: 'receipt-processing', reference: 'REP-20260816-ONE' }))
      .toBe('/reports/REP-20260816-ONE/processing');
    expect(pathFor({ name: 'receipt-review', reference: 'REP-20260816-ONE' }))
      .toBe('/reports/REP-20260816-ONE/review');
    expect(parseRoute('/reports/REP-20260816-ONE/review'))
      .toEqual({ name: 'receipt-review', reference: 'REP-20260816-ONE' });
  });
});
