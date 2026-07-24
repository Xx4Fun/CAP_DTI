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

it('rejects handoffs containing unapproved fields such as tokens', () => {
  sessionStorage.setItem('price-watch-flow-handoff', JSON.stringify({
    kind: 'price-to-scan', commodityId: 4, token: 'must-not-persist',
  }));
  expect(peekHandoff()).toBeNull();
  expect(sessionStorage.getItem('price-watch-flow-handoff')).toBeNull();
});
