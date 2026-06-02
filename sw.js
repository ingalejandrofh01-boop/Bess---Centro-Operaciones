// ═══════════════════════════════════════════════════════════════════════════
//  BESS Ops — Service Worker  (sw.js)
// ═══════════════════════════════════════════════════════════════════════════

const CACHE_NAME   = 'bess-ops-v4';   // ← bumpeado: fuerza reinstalación
const SHELL_FILE   = './index.html';
const OFFLINE_URLS = [SHELL_FILE, './'];

// ── Install: pre-cachear el shell ──────────────────────────────────────────
self.addEventListener('install', event => {
  // skipWaiting hace que el SW nuevo tome control INMEDIATAMENTE
  // sin esperar a que cierren todas las pestañas
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(OFFLINE_URLS))
      .catch(() => {})
  );
});

// ── Activate: limpiar cachés viejas y tomar control de clientes abiertos ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      ))
      // clients.claim() hace que el SW nuevo controle las pestañas ya abiertas
      // sin que el usuario tenga que recargar manualmente
      .then(() => self.clients.claim())
      .then(() => {
        // Notificar a todos los clientes abiertos que hay una nueva versión
        // para que puedan recargar automáticamente
        return self.clients.matchAll({ type: 'window' });
      })
      .then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'SW_UPDATED', version: CACHE_NAME });
        });
      })
  );
});

// ── Fetch: Network-first para HTML; Cache-first para assets ───────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (!['http:', 'https:'].includes(url.protocol)) return;

  // Firebase / Google APIs → siempre red (no cachear)
  const networkOnly = [
    'firebaseio.com', 'firestore.googleapis.com',
    'googleapis.com', 'firebase.com', 'gstatic.com',
    'fonts.googleapis.com', 'fonts.gstatic.com',
  ];
  if (networkOnly.some(d => url.hostname.includes(d))) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Navegación (HTML) → Network first, caché como fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(resp => {
          if (resp && resp.status === 200) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return resp;
        })
        .catch(() =>
          caches.match(event.request)
            .then(cached => cached || caches.match(SHELL_FILE))
        )
    );
    return;
  }

  // Assets estáticos → Cache first, network fallback
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(resp => {
        if (resp && resp.status === 200 &&
            (resp.type === 'basic' || resp.type === 'cors')) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return resp;
      }).catch(() => cached);
    })
  );
});

// ── Push Notifications ────────────────────────────────────────────────────
self.addEventListener('push', event => {
  let data = { title: 'BESS Ops', body: 'Nueva notificación', icon: '' };
  try { data = { ...data, ...event.data.json() }; } catch(e) {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body, icon: data.icon || '',
      badge: data.icon || '', vibrate: [200, 100, 200], data,
    })
  );
});

// ── Notification click ─────────────────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(list => {
        const existing = list.find(c => c.url.includes(self.location.origin) && 'focus' in c);
        if (existing) return existing.focus();
        return clients.openWindow('./');
      })
  );
});
