const HANDOFF_KEY = 'price-watch-flow-handoff';

export type FlowHandoff =
  | { kind: 'price-to-scan'; commodityId: number }
  | { kind: 'price-to-report'; commodityId: number }
  | {
      kind: 'scan-to-report';
      storeId: number;
      commodityId: number;
      displayedPrice: number;
      baselinePrice: number;
    };

export function writeHandoff(value: FlowHandoff): void {
  sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(value));
}

export function peekHandoff(): FlowHandoff | null {
  const rawValue = sessionStorage.getItem(HANDOFF_KEY);
  if (!rawValue) return null;

  try {
    return JSON.parse(rawValue) as FlowHandoff;
  } catch {
    sessionStorage.removeItem(HANDOFF_KEY);
    return null;
  }
}

export function clearHandoff(): void {
  sessionStorage.removeItem(HANDOFF_KEY);
}

export function consumeHandoff(): FlowHandoff | null {
  const value = peekHandoff();
  clearHandoff();
  return value;
}
