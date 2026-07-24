import type { StatusHistoryItem, SystemConfig } from '../api/client';

export type RegulatoryStatus =
  | { kind: 'loading' }
  | { kind: 'available'; config: SystemConfig }
  | { kind: 'unavailable'; reason: 'offline' | 'request-failed' };

export type DataFreshness =
  | { kind: 'live'; updatedAt: string }
  | { kind: 'cached'; savedAt: string | null }
  | { kind: 'bundled'; effectiveDate: string | null };

export type TimelineItem = StatusHistoryItem & {
  state: 'completed' | 'current' | 'upcoming';
};

export function describeRegulatoryStatus(status: RegulatoryStatus): string {
  if (status.kind !== 'available') {
    return 'Regulatory status unavailable';
  }

  return status.config.state_of_calamity
    ? 'Price freeze active'
    : 'Normal monitoring';
}

export function deriveTimelineItems(
  historyItems: StatusHistoryItem[],
  currentStatus: string,
): TimelineItem[] {
  const matchedIndex = historyItems.findIndex(
    (item) => item.status === currentStatus,
  );
  const currentIndex = matchedIndex < 0
    ? Math.max(historyItems.length - 1, 0)
    : matchedIndex;

  return historyItems.map((item, index) => ({
    ...item,
    state: index < currentIndex
      ? 'completed'
      : index === currentIndex
        ? 'current'
        : 'upcoming',
  }));
}
