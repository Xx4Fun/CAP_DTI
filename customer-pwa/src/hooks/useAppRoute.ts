import { useSyncExternalStore } from 'react';
import { parseRoute, subscribeToRouteChanges } from '../app/routing';

export function useAppRoute() {
  const pathname = useSyncExternalStore(
    subscribeToRouteChanges,
    () => window.location.pathname,
    () => '/',
  );

  return parseRoute(pathname);
}
