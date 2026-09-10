import { expect, it } from 'vitest';
import { consumeHandoff, peekHandoff, writeHandoff } from './handoffs';

it('consumes a handoff exactly once', () => {
  writeHandoff({
    kind: 'scan-to-report',
    storeId: 5,
    commodityId: 8,
    displayedPrice: 24.5,
    baselinePrice: 22,
  });

  expect(peekHandoff()?.kind).toBe('scan-to-report');
  expect(consumeHandoff()?.kind).toBe('scan-to-report');
  expect(consumeHandoff()).toBeNull();
});

it('clears malformed handoff data instead of returning it', () => {
  sessionStorage.setItem('price-watch-flow-handoff', '{bad json');
  expect(peekHandoff()).toBeNull();
  expect(sessionStorage.getItem('price-watch-flow-handoff')).toBeNull();
});

it('supports a store-only scanner handoff', () => {
  writeHandoff({ kind: 'store-to-scan', storeId: 12 });
  expect(consumeHandoff()).toEqual({ kind: 'store-to-scan', storeId: 12 });
});

it('supports a product handoff into manual Compare', () => {
  writeHandoff({ kind: 'price-to-compare', commodityId: 4 });
  expect(consumeHandoff()).toEqual({ kind: 'price-to-compare', commodityId: 4 });
});

it('rejects handoffs containing unapproved fields such as tokens', () => {
  sessionStorage.setItem('price-watch-flow-handoff', JSON.stringify({
    kind: 'price-to-scan', commodityId: 4, token: 'must-not-persist',
  }));
  expect(peekHandoff()).toBeNull();
  expect(sessionStorage.getItem('price-watch-flow-handoff')).toBeNull();
});

it('supports view-comparison handoff to restore a comparison result', () => {
  const comparison = {
    scan_id: 'test-scan',
    store: { id: 3, store_name: 'Super Metro', address: 'San Jose' },
    displayed_price: 25.0,
    reference_price: 24.0,
  };
  writeHandoff({ kind: 'view-comparison', comparison: comparison as any });
  expect(peekHandoff()?.kind).toBe('view-comparison');
  expect(consumeHandoff()).toEqual({ kind: 'view-comparison', comparison });
});

