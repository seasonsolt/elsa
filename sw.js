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
const ASSET_VERSION = "907a6643691a";
const PAGE_HASH = "15c73b8eafc1";
const PRECACHE = [
  "ice-castle.html",
  "manifest.webmanifest",
  "game/icon-192.png",
  "game/icon-512.png",
  "game/icon-maskable-512.png",
  "game/apple-touch-icon.png",
  "game/subs.json?v=907a6643691a",
  "game/key.webp?v=907a6643691a",
  "game/bg0.webp?v=907a6643691a",
  "game/ui_back.webp?v=907a6643691a",
  "game/ui_book.webp?v=907a6643691a",
  "game/ui_bulb.webp?v=907a6643691a",
  "game/ui_duo.webp?v=907a6643691a",
  "game/ui_ear.webp?v=907a6643691a",
  "game/ui_fullscreen.webp?v=907a6643691a",
  "game/ui_gear.webp?v=907a6643691a",
  "game/ui_key_left.webp?v=907a6643691a",
  "game/ui_key_right.webp?v=907a6643691a",
  "game/ui_key_up.webp?v=907a6643691a",
  "game/ui_key_space.webp?v=907a6643691a",
  "game/ui_keys.webp?v=907a6643691a",
  "game/ui_meet.webp?v=907a6643691a",
  "game/ui_mouth.webp?v=907a6643691a",
  "game/ui_next.webp?v=907a6643691a",
  "game/ui_play.webp?v=907a6643691a",
  "game/ui_replay.webp?v=907a6643691a",
  "game/ui_solo.webp?v=907a6643691a",
  "game/ui_sticker.webp?v=907a6643691a",
  "game/ui_wardrobe.webp?v=907a6643691a",
  "game/fx_burst.webp?v=907a6643691a",
  "game/fx_dust.webp?v=907a6643691a",
  "game/fx_flake.webp?v=907a6643691a",
  "game/fx_glow.webp?v=907a6643691a",
  "game/fx_heart.webp?v=907a6643691a",
  "game/fx_ring.webp?v=907a6643691a",
  "game/fx_splash.webp?v=907a6643691a",
  "game/fx_star.webp?v=907a6643691a",
  "game/fx_steam.webp?v=907a6643691a",
  "game/frost_idle.webp?v=907a6643691a",
  "game/frost_blink.webp?v=907a6643691a",
  "game/frost_run1.webp?v=907a6643691a",
  "game/frost_run2.webp?v=907a6643691a",
  "game/frost_run3.webp?v=907a6643691a",
  "game/frost_run4.webp?v=907a6643691a",
  "game/frost_run5.webp?v=907a6643691a",
  "game/frost_run6.webp?v=907a6643691a",
  "game/frost_jump.webp?v=907a6643691a",
  "game/frost_fall.webp?v=907a6643691a",
  "game/frost_cast.webp?v=907a6643691a",
  "game/frost_cheer.webp?v=907a6643691a",
  "game/nuan_idle.webp?v=907a6643691a",
  "game/nuan_blink.webp?v=907a6643691a",
  "game/nuan_run1.webp?v=907a6643691a",
  "game/nuan_run2.webp?v=907a6643691a",
  "game/nuan_run3.webp?v=907a6643691a",
  "game/nuan_run4.webp?v=907a6643691a",
  "game/nuan_run5.webp?v=907a6643691a",
  "game/nuan_run6.webp?v=907a6643691a",
  "game/nuan_jump.webp?v=907a6643691a",
  "game/nuan_fall.webp?v=907a6643691a",
  "game/nuan_cast.webp?v=907a6643691a",
  "game/nuan_cheer.webp?v=907a6643691a",
  "game/portrait_frost.webp?v=907a6643691a",
  "game/portrait_nuan.webp?v=907a6643691a",
  "game/brick.webp?v=907a6643691a",
  "game/water.webp?v=907a6643691a",
  "game/drift0.webp?v=907a6643691a",
  "game/drift1.webp?v=907a6643691a",
  "game/iceblock.webp?v=907a6643691a",
  "game/frozen.webp?v=907a6643691a",
  "game/shelf0.webp?v=907a6643691a",
  "game/shelf1.webp?v=907a6643691a",
  "game/shelf2.webp?v=907a6643691a",
  "game/pinkice.webp?v=907a6643691a",
  "game/flake.webp?v=907a6643691a",
  "game/heart.webp?v=907a6643691a",
  "game/ball.webp?v=907a6643691a",
  "game/door_closed.webp?v=907a6643691a",
  "game/door_open.webp?v=907a6643691a"
];
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
