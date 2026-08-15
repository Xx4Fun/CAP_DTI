self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const candidateUrl = payload && payload.data && typeof payload.data.url === 'string'
    ? payload.data.url
    : '/reports';
  const safeUrl = candidateUrl.startsWith('/reports/') ? candidateUrl : '/reports';
  const title = typeof payload.title === 'string' && payload.title.trim()
    ? payload.title.trim()
    : 'PRICE-Watch receipt update';
  const body = typeof payload.body === 'string'
    ? payload.body
    : 'Open PRICE-Watch and check Recent Reports for an update.';

  event.waitUntil(self.registration.showNotification(title, {
    body,
    tag: typeof payload.tag === 'string' ? payload.tag : 'price-watch-receipt',
    icon: '/icons/dti-pwa-192x192.png',
    badge: '/icons/dti-favicon-48x48.png',
    data: { url: safeUrl },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const candidateUrl = event.notification.data && typeof event.notification.data.url === 'string'
    ? event.notification.data.url
    : '/reports';
  const safeUrl = candidateUrl.startsWith('/reports/') ? candidateUrl : '/reports';
  const destination = new URL(safeUrl, self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('navigate' in client) await client.navigate(destination);
      if ('focus' in client) return client.focus();
    }
    return self.clients.openWindow(destination);
  })());
});
