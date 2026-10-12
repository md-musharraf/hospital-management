// Cache management: hashed build assets are cache-first (they never change),
// pages are network-first with the cached app shell as offline fallback, /api is never cached.
const CACHE = 'hms-v1'
const put = (key, res) => {
  const copy = res.clone() // clone before the browser consumes the body
  caches.open(CACHE).then((c) => c.put(key, copy))
}
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) =>
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())),
)
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => (res.ok && put(e.request, res), res))))
  } else if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => (res.ok && put('/', res), res))
        .catch(() => caches.match('/')),
    )
  }
})
