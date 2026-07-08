self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'PT Timer', body: event.data ? event.data.text() : 'Timer update' };
  }

  const title = data.title || 'PT Timer';
  const options = {
    body: data.body || 'Timer update',
    tag: data.tag || 'pt-timer',
    renotify: true,
    requireInteraction: !!data.requireInteraction,
    badge: '/favicon.ico',
    icon: '/favicon.ico',
    data: { url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) {
        client.navigate(url);
        return client.focus();
      }
    }
    return clients.openWindow(url);
  })());
});
