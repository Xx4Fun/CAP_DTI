export type PublicDataSource = 'checking' | 'cached' | 'live' | 'unavailable';

export const shouldShowServiceStartStatus = (
  publicRefreshPending: boolean,
  publicDataSource: PublicDataSource,
  routeChunkPending: boolean,
): boolean => publicRefreshPending && publicDataSource === 'checking' && !routeChunkPending;
