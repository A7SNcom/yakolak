const CACHE = 'yakolak-app-87625448beb0d096';
const FILES = ["index.html", "index.js", "index.wasm", "index-52618b8d8c9e.pck", "index.audio.worklet.js", "index.audio.position.worklet.js", "visual-setup.mjs", "visual-setup.css", "setup-font.otf", "yakolak-logo.svg", "vendor/liquefy-core-1.1.0.mjs", "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png", "online-trystero-5c3683430300.mjs"];
const base = new URL('./', self.location.href);
const shell = new Set(FILES.map(f => new URL(f, base).href));
self.addEventListener('install', e => e.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  try { await cache.addAll(FILES.map(f => new Request(new URL(f, base), {cache:'reload'}))); }
  catch (error) { await caches.delete(CACHE); throw error; }
})()));
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith('yakolak-app-') && key !== CACHE) await caches.delete(key);
})()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== base.origin) return;
  const navigation = e.request.mode === 'navigate' && (url.pathname === base.pathname || url.pathname === new URL('index.html', base).pathname);
  url.search = ''; url.hash = '';
  if (!navigation && !shell.has(url.href)) return;
  e.respondWith((async () => {
    const cached = await (await caches.open(CACHE)).match(navigation ? new URL('index.html', base).href : url.href);
    return cached || fetch(e.request);
  })());
});
