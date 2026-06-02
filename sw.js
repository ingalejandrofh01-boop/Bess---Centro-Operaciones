// ═══════════════════════════════════════════════════════════════════════════
//  BESS Ops — Service Worker  (sw.js)
//  Coloca este archivo en el MISMO directorio que index_mobile_pwa.html
//  Para Android: Chrome lo detecta automáticamente si el sitio está en HTTPS
//  Para iOS: Safari lo usa cuando el usuario agrega la app al inicio
// ═══════════════════════════════════════════════════════════════════════════

const CACHE_NAME   = 'bess-ops-v3';
const SHELL_FILE   = './index.html';   // ajustar si el HTML tiene otro nombre
const OFFLINE_URLS = [SHELL_FILE, './'];

// ── Install: pre-cachear el shell ──────────────────────────────────────────
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(OFFLINE_URLS))
      .catch(() => { /* primera visita sin caché previa — ok */ })
  );
});

// ── Activate: limpiar cachés viejas ───────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: Network-first para Firebase / API; Cache-first para assets ──────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Ignorar peticiones que no son HTTP/HTTPS (chrome-extension, etc.)
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
          // Actualizar caché con la respuesta fresca
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

  // Assets estáticos (JS, CSS, imágenes, fuentes) → Cache first, network fallback
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(resp => {
        // Solo cachear respuestas OK y same-origin/basic
        if (resp && resp.status === 200 &&
            (resp.type === 'basic' || resp.type === 'cors')) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return resp;
      }).catch(() => cached); // red caída y no hay caché → undefined está ok
    })
  );
});

// ── Push Notifications ────────────────────────────────────────────────────
self.addEventListener('push', event => {
  let data = { title: 'BESS Ops', body: 'Nueva notificación', icon: '' };
  try { data = { ...data, ...event.data.json() }; } catch(e) {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body   : data.body,
      icon   : data.icon || '',
      badge  : data.icon || '',
      vibrate: [200, 100, 200],
      data   : data,
    })
  );
});

// ── Notification click → enfocar o abrir la app ───────────────────────────
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
