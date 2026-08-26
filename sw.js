// ═══════════════════════════════════════════════════════════════════════════
//  BESS Ops — Service Worker v2 (sin auto-reload)
// ═══════════════════════════════════════════════════════════════════════════

const DEPLOY_TS  = '1787787496_bess_v21_1_fix_cronometro';
const CACHE_NAME = 'bess-ops-' + DEPLOY_TS;
const SHELL_FILE = './index.html';

// ── Install ────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  // NO skipWaiting automático — evita el ciclo activate→postMessage→reload→activate
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll([SHELL_FILE, './']))
      .catch(() => {})
      .then(() => self.skipWaiting()) // skipWaiting DESPUÉS de cachear, no antes
  );
});

// ── Activate ───────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
    // NO enviar SW_UPDATED postMessage — causaba loop de recargas en móvil
  );
});

// ── Fetch ──────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (!['http:', 'https:'].includes(url.protocol)) return;

  // Solo cachear GET
  if (event.request.method !== 'GET') return;

  // Firebase y APIs externas → pasar directo, sin interceptar
  const NET_ONLY = [
    'firebaseio.com','firestore.googleapis.com','googleapis.com',
    'firebase.com','gstatic.com','cdnjs.cloudflare.com','unpkg.com',
  ];
  if (NET_ONLY.some(d => url.hostname.includes(d))) return;

  // HTML → Network first (siempre intenta la versión más nueva)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' })
        .then(resp => {
          if (resp && resp.status === 200) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return resp;
        })
        .catch(() =>
          caches.match(event.request).then(cached => cached || caches.match(SHELL_FILE))
        )
    );
    return;
  }

  // Resto → Cache first con fallback a red
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(resp => {
        if (resp && resp.status === 200 && ['basic','cors'].includes(resp.type)) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return resp;
      }).catch(() => cached);
    })
  );
});

// ── Push Notifications ─────────────────────────────────────────────────────
self.addEventListener('push', event => {
  let data = { title: 'Centro de Operaciones BESS', body: 'Nueva notificacion', icon: '' };
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
        const w = list.find(c => c.url.includes(self.location.origin) && 'focus' in c);
        return w ? w.focus() : clients.openWindow('./');
      })
  );
});
