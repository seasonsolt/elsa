/* The offline worker of the ice castle (PLAN-2 D5). This is the TEMPLATE: art/build_page.py stamps the three placeholders below and writes
   the result as sw.js next to the built page. Edit this file, never sw.js.

   Strategy
     install    the page, the manifest, the icons, game/subs.json and the title set (the pictures the page decodes before the title is
                interactive: src/lib/assets.js) go into the cache named for this build; skipWaiting, so a new build takes over at once
     activate   every other `icecastle-` cache is deleted: a new build replaces the old one on the next open
     fetch      same-origin GET only. The page itself (a navigation to the folder, index.html or ice-castle.html) comes from the cache;
                everything under game/ is cache-first and stored on first use (room pictures, voice clips), so a room played once works
                without a network. ?dev=1 pages and anything else go straight to the network.
   The cache name holds ASSET_VERSION (the fingerprint of game/ and the manifest, also in every game/ URL of the page) and a hash of the
   built page, so a build that only changes code still replaces the cached page. Cross-origin requests (the Google fonts) are left alone:
   offline they fail and the page falls back to the system fonts. */
/* global self, caches, fetch, URL, Request */
const ASSET_VERSION = /*ASSET_VERSION*/'dev';
const PAGE_HASH = /*PAGE_HASH*/'dev';
const PRECACHE = /*PRECACHE*/[];
const PAGE = 'ice-castle.html';
const CACHE = `icecastle-${ASSET_VERSION}-${PAGE_HASH}`;

const absolute = path => new URL(path, self.registration.scope).href;
const scopePath = new URL(self.registration.scope).pathname;
const known = new Set(PRECACHE.map(absolute));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => Promise.all(PRECACHE.map(path => {
    const url = absolute(path);
    // 'reload': the browser's own HTTP cache must not hand a new build the old page, manifest or icons
    return fetch(new Request(url, { cache: 'reload' })).then(res => {
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return cache.put(url, res);
    });
  }))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('icecastle-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const isPage = url => url.pathname === scopePath || url.pathname === `${scopePath}index.html` || url.pathname === `${scopePath}${PAGE}`;
const isAsset = url => known.has(url.origin + url.pathname + url.search) || url.pathname.startsWith(`${scopePath}game/`);

function fromCacheOrNetwork(request, key) {
  return caches.open(CACHE).then(cache => cache.match(key).then(hit => {
    if (hit) return hit;
    return fetch(request).then(res => {
      // only whole, same-origin answers are kept; a partial (206) or failed one is passed on untouched
      if (res.ok && res.status === 200 && res.type === 'basic' && !request.headers.has('range')) cache.put(key, res.clone()).catch(() => {});
      return res;
    });
  }));
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    if (url.searchParams.get('dev') === '1' || !isPage(url)) return;
    event.respondWith(fromCacheOrNetwork(request, absolute(PAGE)));
    return;
  }
  if (isAsset(url)) event.respondWith(fromCacheOrNetwork(request, request.url));
});
