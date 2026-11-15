/* db-player offline pack: serves the saved lesson (audio, captions, light page) from the cache. */
const CACHE = 'db-player-offline-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

async function fromCache(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request, { ignoreSearch: new URL(request.url).pathname.endsWith('offline.html') });
  if (!hit) return null;
  const range = request.headers.get('range');
  if (!range) return hit;
  // media elements ask for byte ranges: answer with 206 from the cached copy
  const buf = await hit.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
  const start = Number(m[1] || 0), end = m[2] ? Number(m[2]) : buf.byteLength - 1;
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': hit.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Range': `bytes ${start}-${end}/${buf.byteLength}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).catch(async () => (await fromCache(e.request)) || new Response('', { status: 504 }))
  );
});
