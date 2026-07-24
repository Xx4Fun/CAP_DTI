export type AppRoute =
  | { name: 'home' }
  | { name: 'prices' }
  | { name: 'product'; commodityId: number }
  | { name: 'scan' }
  | { name: 'reports' }
  | { name: 'new-report' }
  | { name: 'track-report' };

export function parseRoute(pathname: string): AppRoute {
  const normalizedPath = pathname.length > 1
    ? pathname.replace(/\/+$/, '')
    : pathname;
  const productMatch = normalizedPath.match(/^\/prices\/(\d+)$/);

  if (productMatch) {
    return { name: 'product', commodityId: Number(productMatch[1]) };
  }

  const routes: Partial<Record<string, AppRoute>> = {
    '/': { name: 'home' },
    '/prices': { name: 'prices' },
    '/scan': { name: 'scan' },
    '/reports': { name: 'reports' },
    '/reports/new': { name: 'new-report' },
    '/reports/track': { name: 'track-report' },
  };

  return routes[normalizedPath] ?? { name: 'home' };
}

export function pathFor(route: AppRoute): string {
  if (route.name === 'product') {
    return `/prices/${route.commodityId}`;
  }

  const paths: Record<Exclude<AppRoute['name'], 'product'>, string> = {
    home: '/',
    prices: '/prices',
    scan: '/scan',
    reports: '/reports',
    'new-report': '/reports/new',
    'track-report': '/reports/track',
  };

  return paths[route.name];
}

export function navigate(route: AppRoute, replace = false): void {
  if (replace) {
    history.replaceState(null, '', pathFor(route));
  } else {
    history.pushState(null, '', pathFor(route));
  }
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function subscribeToRouteChanges(listener: () => void): () => void {
  window.addEventListener('popstate', listener);
  return () => window.removeEventListener('popstate', listener);
}
