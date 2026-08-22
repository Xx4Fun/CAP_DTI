import { safeSessionStorage } from './safeStorage';

const HANDOFF_KEY = 'price-watch-flow-handoff';

export type FlowHandoff =
  | { kind: 'price-to-scan'; commodityId: number }
  | { kind: 'price-to-compare'; commodityId: number }
  | { kind: 'price-to-report'; commodityId: number }
  | { kind: 'store-to-scan'; storeId: number }
  | {
      kind: 'scan-to-report';
      storeId: number;
      commodityId: number;
      displayedPrice: number;
      baselinePrice: number;
    };

export function writeHandoff(value: FlowHandoff): void {
  safeSessionStorage.setItem(HANDOFF_KEY, JSON.stringify(value));
}

export function peekHandoff(): FlowHandoff | null {
  const rawValue = safeSessionStorage.getItem(HANDOFF_KEY);
  if (!rawValue) return null;

  try {
    const value: unknown = JSON.parse(rawValue);
    if (!isFlowHandoff(value)) throw new Error('Invalid flow handoff');
    return value;
  } catch {
    safeSessionStorage.removeItem(HANDOFF_KEY);
    return null;
  }
}

const hasExactKeys = (value: Record<string, unknown>, keys: string[]): boolean =>
  Object.keys(value).length === keys.length && keys.every((key) => key in value);

const isPositiveId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

function isFlowHandoff(value: unknown): value is FlowHandoff {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;

  if (item.kind === 'price-to-scan' || item.kind === 'price-to-compare' || item.kind === 'price-to-report') {
    return hasExactKeys(item, ['kind', 'commodityId']) && isPositiveId(item.commodityId);
  }
  if (item.kind === 'store-to-scan') {
    return hasExactKeys(item, ['kind', 'storeId']) && isPositiveId(item.storeId);
  }
  if (item.kind === 'scan-to-report') {
    return hasExactKeys(item, ['kind', 'storeId', 'commodityId', 'displayedPrice', 'baselinePrice'])
      && isPositiveId(item.storeId)
      && isPositiveId(item.commodityId)
      && typeof item.displayedPrice === 'number'
      && Number.isFinite(item.displayedPrice)
      && typeof item.baselinePrice === 'number'
      && Number.isFinite(item.baselinePrice);
  }
  return false;
}

export function clearHandoff(): void {
  safeSessionStorage.removeItem(HANDOFF_KEY);
}

export function consumeHandoff(): FlowHandoff | null {
  const value = peekHandoff();
  clearHandoff();
  return value;
}
