export const reportStatusTone = (status: string): string => {
  const normalized = status.toLowerCase();
  if (normalized.includes('resolved') || normalized.includes('closed') || normalized.includes('validated')) return 'success';
  if (normalized.includes('dispatched') || normalized.includes('inspection') || normalized.includes('review')) return 'info';
  if (normalized.includes('recapture') || normalized.includes('failed')) return 'warning';
  return 'pending';
};
