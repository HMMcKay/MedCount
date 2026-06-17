const CACHE = 'medcount-v2.1.1';
const PRECACHE = [
  '/',
  '/static/manifest.json',
  '/static/css/styles.css',
  '/static/js/db.js',
  '/static/js/crypto.js',
  '/static/js/history.js',
  '/static/js/reminders.js',
  '/static/js/stats.js',
  '/static/js/today.js',
  '/static/js/icons.js',
  '/static/js/app.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    e.respondWith(fetch(request).catch(() => caches.match('/')));
    return;
  }

  const isCacheable =
    url.pathname.startsWith('/static/') ||
    url.hostname === 'esm.sh' ||
    url.hostname.endsWith('.jsdelivr.net') ||
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com';

  if (isCacheable) {
    e.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(request, clone));
          }
          return res;
        });
      })
    );
  }
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(wins => {
      const match = wins.find(w => w.url.startsWith(self.location.origin));
      if (match) return match.focus();
      return clients.openWindow('/');
    })
  );
});

self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();

  if (e.data?.type === 'SHOW_NOTIFICATION') {
    const { title, body, tag, data } = e.data;
    self.registration.showNotification(title, {
      body, tag,
      icon: '/static/icon-192.png',
      badge: '/static/icon-192.png',
      data: data || {},
      vibrate: [200, 100, 200],
      requireInteraction: false,
    });
  }
});
