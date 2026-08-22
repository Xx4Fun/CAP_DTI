import { describe, expect, it } from 'vitest';
import { parseRoute, pathFor } from './routing';

describe('routing', () => {
  it('parses a product detail URL', () => {
    expect(parseRoute('/prices/42')).toEqual({ name: 'product', commodityId: 42 });
  });

  it('uses a dedicated route for manual price comparison', () => {
    expect(parseRoute('/compare')).toEqual({ name: 'compare' });
    expect(pathFor({ name: 'compare' })).toBe('/compare');
    expect(parseRoute('/scan')).toEqual({ name: 'scan' });
  });

  it('falls back to home for unknown paths', () => {
    expect(parseRoute('/not-a-screen')).toEqual({ name: 'home' });
  });

  it('generates stable report paths', () => {
    expect(pathFor({ name: 'new-report' })).toBe('/reports/new');
    expect(pathFor({ name: 'track-report' })).toBe('/reports/track');
    expect(pathFor({ name: 'report-detail', reference: 'REP-20260822-ONE TWO' }))
      .toBe('/reports/track/REP-20260822-ONE%20TWO');
    expect(parseRoute('/reports/track/REP-20260822-ONE%20TWO'))
      .toEqual({ name: 'report-detail', reference: 'REP-20260822-ONE TWO' });
    expect(pathFor({ name: 'receipt-processing', reference: 'REP-20260816-ONE' }))
      .toBe('/reports/REP-20260816-ONE/processing');
    expect(pathFor({ name: 'receipt-review', reference: 'REP-20260816-ONE' }))
      .toBe('/reports/REP-20260816-ONE/review');
    expect(pathFor({ name: 'more' })).toBe('/more');
    expect(parseRoute('/more')).toEqual({ name: 'more' });
  });
});
