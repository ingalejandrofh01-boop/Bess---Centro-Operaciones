// ═══════════════════════════════════════════════════════════════════════════
//  BESS Ops — Service Worker
//  DEPLOY_TS se actualiza automaticamente en cada build
// ═══════════════════════════════════════════════════════════════════════════
 
const DEPLOY_TS  = '1780470914_bess';          // reemplazado en build
const CACHE_NAME = 'bess-ops-' + DEPLOY_TS;
const SHELL_FILE = './index.html';
 
// ── Install ────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  self.skipWaiting();  // activar inmediatamente, sin esperar pestañas
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll([SHELL_FILE, './']))
      .catch(() => {})
  );
});
 
// ── Activate: borrar cachés viejas y tomar control ────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then(clients => clients.forEach(c =>
        c.postMessage({ type: 'SW_UPDATED', version: CACHE_NAME })
      ))
  );
});
 
// ── Fetch ──────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (!['http:', 'https:'].includes(url.protocol)) return;
 
  // Firebase y APIs externas → NO interceptar, dejar pasar directo
  const NET_ONLY = [
    'firebaseio.com','firestore.googleapis.com','googleapis.com',
    'firebase.com','gstatic.com','cdnjs.cloudflare.com','unpkg.com',
    'google.com','googleapis.com',
  ];
  if (NET_ONLY.some(d => url.hostname.includes(d))) {
    // NO llamar event.respondWith — el browser maneja la peticion directamente
    return;
  }
 
  // HTML → Network first (siempre intenta obtener la versión más nueva)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' })
        .then(resp => {
          if (resp && resp.status === 200) {
            const clone = resp.clone(); // clonar ANTES de retornar
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
          const clone = resp.clone(); // clonar ANTES de retornar
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
