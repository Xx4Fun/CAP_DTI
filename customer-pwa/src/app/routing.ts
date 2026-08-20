export type AppRoute =
  | { name: 'home' }
  | { name: 'prices' }
  | { name: 'product'; commodityId: number }
  | { name: 'scan' }
  | { name: 'reports' }
  | { name: 'new-report' }
  | { name: 'track-report' }
  | { name: 'receipt-processing'; reference: string }
  | { name: 'receipt-review'; reference: string }
  | { name: 'more' };

export function parseRoute(pathname: string): AppRoute {
  const normalizedPath = pathname.length > 1
    ? pathname.replace(/\/+$/, '')
    : pathname;
  const productMatch = normalizedPath.match(/^\/prices\/(\d+)$/);
  const receiptMatch = normalizedPath.match(/^\/reports\/([^/]+)\/(processing|review)$/);

  if (productMatch) {
    return { name: 'product', commodityId: Number(productMatch[1]) };
  }
  if (receiptMatch) {
    return {
      name: receiptMatch[2] === 'review' ? 'receipt-review' : 'receipt-processing',
      reference: decodeURIComponent(receiptMatch[1]),
    };
  }

  const routes: Partial<Record<string, AppRoute>> = {
    '/': { name: 'home' },
    '/prices': { name: 'prices' },
    '/scan': { name: 'scan' },
    '/reports': { name: 'reports' },
    '/reports/new': { name: 'new-report' },
    '/reports/track': { name: 'track-report' },
    '/more': { name: 'more' },
  };

  return routes[normalizedPath] ?? { name: 'home' };
}

export function pathFor(route: AppRoute): string {
  if (route.name === 'product') {
    return `/prices/${route.commodityId}`;
  }
  if (route.name === 'receipt-processing' || route.name === 'receipt-review') {
    const step = route.name === 'receipt-review' ? 'review' : 'processing';
    return `/reports/${encodeURIComponent(route.reference)}/${step}`;
  }

  const paths: Record<Exclude<AppRoute['name'], 'product' | 'receipt-processing' | 'receipt-review'>, string> = {
    home: '/',
    prices: '/prices',
    scan: '/scan',
    reports: '/reports',
    'new-report': '/reports/new',
    'track-report': '/reports/track',
    more: '/more',
  };

  return paths[route.name];
}

interface NavigateOptions {
  replace?: boolean;
  state?: Record<string, unknown> | null;
}

export function navigate(route: AppRoute, options: boolean | NavigateOptions = false): void {
  const normalizedOptions = typeof options === 'boolean' ? { replace: options } : options;
  const path = pathFor(route);
  const shouldReplace = normalizedOptions.replace === true || isBackGuardState(history.state);
  const state = normalizedOptions.state ?? null;

  if (path === location.pathname && !location.search && !location.hash) {
    if (normalizedOptions.state !== undefined) history.replaceState(state, '', path);
    return;
  }

  if (shouldReplace) {
    history.replaceState(state, '', path);
  } else {
    history.pushState(state, '', path);
  }
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function subscribeToRouteChanges(listener: () => void): () => void {
  window.addEventListener('popstate', listener);
  return () => window.removeEventListener('popstate', listener);
}
import { isBackGuardState } from './backNavigationState';
