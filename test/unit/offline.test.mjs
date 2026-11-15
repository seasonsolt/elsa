/* Offline play (PLAN-2 D5): the service worker sw.js, the web manifest and the icons. Static checks on the checked-in files (every precache
   URL exists, the cache name holds the asset version), the build that stamps sw.js (deterministic; a new asset or a new page changes the cache
   name, so the old cache is replaced on the next open), and the worker's own logic in a fake worker scope (install, activate, cache-first,
   first-use caching, ?dev=1, offline). Registering is decided by the pure offlineWorkerAllowed of src/lib/assets.js. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { ROOT, loadLib } from '../harness.mjs';

const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const stamp = (text, name) => { const m = text.match(new RegExp(`const ${name} = "([^"]*)"`)); return m && m[1]; };
const precacheOf = text => JSON.parse(text.match(/const PRECACHE = (\[[\s\S]*?\]);/)[1]);
const cacheName = sw => vm.runInNewContext(`${sw}\nCACHE`, { self: { registration: { scope: 'https://x.test/' }, addEventListener() {} }, URL });
const pngSize = file => { const b = fs.readFileSync(file); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

export function theWorkerIsRegisteredOnlyOnARealHttpPageThatIsNotDev({ assert }) {
  const { offlineWorkerAllowed: ok } = loadLib(['assets'], {}, '({ offlineWorkerAllowed })');
  assert.equal(ok('', 'https:', true), true);
  assert.equal(ok('?x=1', 'http:', true), true, 'http://localhost is a secure context too (the browser decides; without the API hasApi is false)');
  assert.equal(ok('?dev=1', 'https:', true), false, '?dev=1 never registers');
  assert.equal(ok('?a=1&dev=1', 'http:', true), false);
  assert.equal(ok('?dev=10', 'http:', true), true, 'only dev=1 is the dev switch (the same test as DEV in 00-core)');
  assert.equal(ok('', 'file:', true), false, 'never from file://');
  assert.equal(ok('', 'https:', false), false, 'no serviceWorker in navigator');
  assert.equal(ok('', undefined, true), false, 'an unknown protocol');
  assert.equal(ok(undefined, 'https:', true), true);
}

export function theRealMainRegistersSwJsUnlessDevOrFileOrUnsupported({ assert }) {
  const source = read('src/view/90-main.js');
  assert.match(source, /offlineWorkerAllowed\(location\.search, location\.protocol, [^)]*'serviceWorker' in navigator\)/, 'the page asks the pure policy with the real location');
  assert.match(source, /if \(offlineWorkerAllowed\([^\n]*\) \{[^}]*navigator\.serviceWorker\.register\('sw\.js'\)/, 'and registers sw.js only inside that condition');
  assert.equal((source.match(/serviceWorker\.register\(/g) || []).length, 1, 'there is no other registration');
}

export function theCheckedInSwJsHasAnExistingPrecacheListAndACacheNameWithTheAssetVersion({ assert, loadLogic }) {
  const sw = read('sw.js');
  const version = stamp(sw, 'ASSET_VERSION'), pageHash = stamp(sw, 'PAGE_HASH');
  assert.match(version, /^[0-9a-f]{12}$/, 'a stamped asset version, not the "dev" placeholder');
  assert.match(pageHash, /^[0-9a-f]{12}$/);
  const name = cacheName(sw);
  assert.ok(name.includes(version), `the cache name ${name} holds the asset version`);
  assert.match(name, /^icecastle-/);
  const urls = precacheOf(sw);
  assert.ok(urls.length > 60, 'the page, the app files and the title set');
  assert.equal(new Set(urls).size, urls.length, 'no URL twice');
  for (const u of urls) {
    const file = u.split('?')[0];
    assert.ok(fs.existsSync(path.join(ROOT, file)), `precache URL ${u}: ${file} exists in the repository`);
    if (file.startsWith('game/') && u.includes('?')) assert.equal(u.split('?')[1], `v=${version}`, `${u} carries the asset version, like the page's own URLs`);
  }
  for (const must of ['ice-castle.html', 'manifest.webmanifest', 'game/icon-192.png', 'game/icon-512.png', 'game/icon-maskable-512.png', 'game/apple-touch-icon.png', `game/subs.json?v=${version}`]) assert.ok(urls.includes(must), `${must} is precached`);
  const { assetPlan } = loadLib(['assets'], {}, '({ assetPlan })');
  const lines = JSON.parse(read('src/content/lines.json'));
  for (const n of assetPlan(loadLogic().LEVELS, lines).title) assert.ok(urls.includes(`game/${n}.webp?v=${version}`), `the title picture ${n} is precached, so the title works offline`);
  assert.ok(!urls.some(u => /\.mp3/.test(u) || /bg_|mem_|story_/.test(u)), 'voice clips and later rooms are cached on first use, not precached');
}

export function theManifestMakesThePageInstallable({ assert }) {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.ok(m.name && m.short_name && m.lang === 'zh-CN');
  assert.ok(['fullscreen', 'standalone', 'minimal-ui'].includes(m.display), 'a display mode Chrome accepts for install');
  assert.ok(fs.existsSync(path.join(ROOT, m.start_url)), 'start_url is a real file');
  assert.match(m.background_color, /^#[0-9a-f]{6}$/i);
  const sizes = [];
  for (const icon of m.icons) {
    assert.ok(fs.existsSync(path.join(ROOT, icon.src)), `${icon.src} exists`);
    const [w, h] = pngSize(path.join(ROOT, icon.src));
    assert.equal(`${w}x${h}`, icon.sizes, `${icon.src} really is ${icon.sizes}`);
    sizes.push(`${icon.sizes}/${icon.purpose}`);
  }
  for (const need of ['192x192/any', '512x512/any', '512x512/maskable']) assert.ok(sizes.includes(need), `an icon ${need}`);
  assert.deepEqual(pngSize(path.join(ROOT, 'game/apple-touch-icon.png')), [180, 180]);
}

/* ---------- the build that stamps sw.js ---------- */
function copyForBuild() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'castle-build-'));
  for (const rel of ['art/build_page.py', 'art/sw.template.js', 'art/sizes.json', 'art/page.template.html', 'manifest.webmanifest']) { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.copyFileSync(path.join(ROOT, rel), path.join(dir, rel)); }
  fs.cpSync(path.join(ROOT, 'src'), path.join(dir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'game'));
  const files = loadLib(['assets'], {}, 'ART_TITLE').concat(['subs.json', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png']);
  for (const f of files) fs.copyFileSync(path.join(ROOT, 'game', f), path.join(dir, 'game', f));   // the files a precache list may name (not the 800 clips)
  return dir;
}
function build(dir, out = 'out/ice-castle.html') {
  fs.mkdirSync(path.join(dir, path.dirname(out)), { recursive: true });
  const r = spawnSync('python3', ['art/build_page.py', '--out', out], { cwd: dir, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`build_page.py failed: ${r.stderr || r.stdout}`);
  const page = fs.readFileSync(path.join(dir, out), 'utf8'), swText = fs.readFileSync(path.join(dir, path.dirname(out), 'sw.js'), 'utf8');
  return { page, sw: swText, version: stamp(swText, 'ASSET_VERSION'), pageHash: stamp(swText, 'PAGE_HASH') };
}

export function buildPageStampsSwJsNextToThePageAndDeterministically({ assert }) {
  const dir = copyForBuild();
  try {
    const a = build(dir), b = build(dir);
    assert.equal(a.sw, b.sw, 'two builds give the same sw.js');
    assert.equal(a.page, b.page, 'and the same page');
    assert.equal(a.version, stamp(a.page, 'ASSET_VERSION'), 'sw.js carries the version the page carries');
    assert.ok(cacheName(a.sw).includes(a.version), 'the cache name holds it');
    assert.match(a.page, /<link rel="manifest" href="manifest\.webmanifest">/, 'the page links the manifest');
    assert.match(a.page, /<link rel="apple-touch-icon" href="game\/apple-touch-icon\.png">/);
    assert.match(a.page, /<meta name="theme-color" content="#141c46">/);
    const urls = precacheOf(a.sw);
    for (const u of urls) assert.ok(u === 'ice-castle.html' || fs.existsSync(path.join(dir, u.split('?')[0])), `${u} exists`);
    assert.ok(!a.sw.includes('/*ASSET_VERSION*/') && !a.sw.includes('/*PRECACHE*/') && !a.sw.includes('/*PAGE_HASH*/'), 'no placeholder is left');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

export function aChangedAssetOrAChangedPageGivesANewCacheNameSoTheOldCacheIsReplaced({ assert }) {
  const dir = copyForBuild();
  try {
    const before = build(dir);
    fs.appendFileSync(path.join(dir, 'game', 'bg0.webp'), Buffer.from([0]));   // one asset changed
    const asset = build(dir);
    assert.notEqual(asset.version, before.version, 'the asset version moves');
    assert.notEqual(cacheName(asset.sw), cacheName(before.sw), 'so does the cache name');
    assert.ok(precacheOf(asset.sw).includes(`game/bg0.webp?v=${asset.version}`) && !precacheOf(asset.sw).some(u => u.includes(before.version)), 'and every versioned URL follows it');
    const main = path.join(dir, 'src', 'view', '90-main.js');
    fs.appendFileSync(main, '  /* a code-only change */\n');                    // code changed, assets did not
    const code = build(dir);
    assert.equal(code.version, asset.version, 'no asset changed');
    assert.notEqual(code.pageHash, asset.pageHash, 'the built page did');
    assert.notEqual(cacheName(code.sw), cacheName(asset.sw), 'a code-only build still replaces the cached page');
    fs.appendFileSync(path.join(dir, 'manifest.webmanifest'), '\n');
    const manifest = build(dir);
    assert.notEqual(manifest.version, code.version, 'the manifest is part of the fingerprint too');
    fs.appendFileSync(path.join(dir, 'game', 'icon-192.png'), Buffer.from([0]));
    assert.notEqual(build(dir).version, manifest.version, 'and so are the icons');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

export function theCheckedInSwJsIsWhatTheBuildWritesApartFromTheStamps({ assert }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'castle-fresh-'));
  try {
    const r = spawnSync('python3', ['art/build_page.py', '--out', path.join(dir, 'ice-castle.html')], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const norm = t => t.replace(/"[0-9a-f]{12}"/g, '"X"').replace(/\?v=[0-9a-f]{12}/g, '?v=X');
    assert.equal(norm(read('sw.js')), norm(fs.readFileSync(path.join(dir, 'sw.js'), 'utf8')), 'sw.js is stale: run python3 art/build_page.py (make check compares the stamps too)');
    assert.ok(read('sw.js').startsWith('/* The offline worker'), 'sw.js comes from art/sw.template.js');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

/* ---------- the worker's logic in a fake worker scope ---------- */
function makeWorld({ origin = 'https://castle.test', scope = 'https://castle.test/play/' } = {}) {
  const world = { store: new Map(), calls: [], offline: false, handlers: {}, claimed: 0, skipped: 0, status: {}, redirected: {}, scope, origin };
  const key = k => (typeof k === 'string' ? k : k.url);
  world.caches = {
    open: async name => { if (!world.store.has(name)) world.store.set(name, new Map()); const c = world.store.get(name); return { match: async k => c.get(key(k)), put: async (k, res) => { c.set(key(k), res); } }; },
    keys: async () => [...world.store.keys()],
    delete: async name => world.store.delete(name),
  };
  const answer = (url, status = 200, type = 'basic', redirected = false) => ({
    ok: status >= 200 && status < 300, status, statusText: '', type, url, redirected, headers: new Headers({ 'content-type': 'text/html' }),
    blob: async () => new Blob([`body of ${url}`]), clone() { return answer(url, status, type, redirected); },
  });
  world.fetch = async req => {
    const url = key(req);
    world.calls.push({ url, cache: req.cache });
    if (world.offline) throw new TypeError('Failed to fetch');
    return answer(url, world.status[url] || 200, world.status[url + '#type'] || 'basic', !!world.redirected[url]);
  };
  class Request { constructor(url, init = {}) { this.url = url; this.method = 'GET'; this.cache = init.cache; this.headers = new Headers(); this.mode = 'cors'; } }
  world.load = swSource => {
    const self = {
      registration: { scope }, location: { origin },
      addEventListener: (type, fn) => { world.handlers[type] = fn; },
      skipWaiting: () => { world.skipped++; return Promise.resolve(); },
      clients: { claim: () => { world.claimed++; return Promise.resolve(); } },
    };
    vm.runInNewContext(swSource, { self, caches: world.caches, fetch: world.fetch, URL, Request, Response, Promise, console });
    return world;
  };
  world.event = async (type, extra = {}) => {
    const ev = { waitUntil(p) { ev.waiting = p; }, respondWith(p) { ev.answer = p; }, ...extra };
    world.handlers[type](ev);
    if (ev.waiting) await ev.waiting;
    return ev;
  };
  world.request = (url, { method = 'GET', mode = 'no-cors', range = false } = {}) => {
    const headers = new Headers(); if (range) headers.set('range', 'bytes=0-9');
    return { url, method, mode, headers };
  };
  return world;
}

const sw1 = () => read('sw.js');

export async function installPrecachesEverythingFreshAndTakesOverAtOnce({ assert }) {
  const w = makeWorld().load(sw1());
  await w.event('install');
  const name = [...w.store.keys()][0];
  const urls = precacheOf(sw1());
  assert.match(name, /^icecastle-[0-9a-f]{12}-[0-9a-f]{12}$/);
  assert.equal(w.store.get(name).size, urls.length, 'every precache entry is in the new cache');
  assert.ok(w.store.get(name).has('https://castle.test/play/ice-castle.html'), 'the page is keyed by its absolute URL under the scope');
  assert.ok(w.calls.every(c => c.cache === 'reload'), 'each file is fetched past the browser HTTP cache, so a new build never gets the old page');
  assert.equal(w.skipped, 1, 'skipWaiting: a new build takes over without waiting for every tab to close');
}

export async function aFailedPrecacheFailsTheInstallSoAHalfCachedBuildNeverActivates({ assert }) {
  const w = makeWorld();
  w.status['https://castle.test/play/game/icon-512.png'] = 404;
  w.load(sw1());
  await assert.rejects(() => w.event('install'), /404/);
  assert.equal(w.skipped, 0);
}

export async function activateDeletesOnlyTheOldBuildsCachesAndClaimsThePage({ assert }) {
  const w = makeWorld().load(sw1());
  w.store.set('icecastle-oldversion00-oldpagehash0', new Map([['x', 1]]));
  w.store.set('icecastle-older', new Map());
  w.store.set('some-other-app', new Map([['y', 1]]));
  await w.event('install');
  await w.event('activate');
  const names = [...w.store.keys()];
  assert.equal(names.filter(n => n.startsWith('icecastle-')).length, 1, 'only the new build cache is left');
  assert.ok(names.includes('some-other-app'), 'caches of other apps on the origin are not touched');
  assert.equal(w.claimed, 1, 'the open page is taken over (clients.claim)');
}

export async function aNewBuildReplacesTheOldCacheOnItsFirstActivation({ assert }) {
  const w = makeWorld();
  w.load(sw1());
  await w.event('install'); await w.event('activate');
  const oldName = [...w.store.keys()][0];
  const next = sw1().replace(/const ASSET_VERSION = "[0-9a-f]{12}"/, 'const ASSET_VERSION = "0123456789ab"');
  w.load(next);
  await w.event('install'); await w.event('activate');
  const names = [...w.store.keys()];
  assert.deepEqual(names, [names.find(n => n.includes('0123456789ab'))], 'one cache, the new one');
  assert.ok(!names.includes(oldName));
}

export async function roomPicturesAndVoiceClipsAreCachedOnFirstUseAndServedWithoutANetwork({ assert }) {
  const w = makeWorld().load(sw1());
  await w.event('install'); await w.event('activate');
  const version = stamp(sw1(), 'ASSET_VERSION');
  const mp3 = `https://castle.test/play/game/vo_start_hall_1.mp3?v=${version}`, bg = `https://castle.test/play/game/bg_slope.webp?v=${version}`;
  w.calls.length = 0;
  const first = await w.event('fetch', { request: w.request(mp3) });
  assert.ok(first.answer, 'a game/ request is answered by the worker');
  assert.equal((await first.answer).ok, true);
  assert.equal(w.calls.length, 1, 'the first time it comes from the network');
  w.offline = true;
  const again = await w.event('fetch', { request: w.request(mp3) });
  assert.equal((await again.answer).url, mp3, 'the second time, offline, from the cache');
  assert.equal(w.calls.length, 1, 'no second network request');
  const missing = await w.event('fetch', { request: w.request(bg) });
  await assert.rejects(() => missing.answer, /Failed to fetch/, 'a picture never seen and no network: an honest failure, the page copes (a missing picture, a silent clip)');
  w.offline = false;
  await (await w.event('fetch', { request: w.request(bg) })).answer;
  w.offline = true;
  assert.equal((await (await w.event('fetch', { request: w.request(bg) })).answer).url, bg, 'and once seen it is there offline');
}

export async function aTitlePictureComesFromThePrecacheWhileOffline({ assert }) {
  const w = makeWorld().load(sw1());
  await w.event('install'); await w.event('activate');
  const version = stamp(sw1(), 'ASSET_VERSION');
  w.offline = true;
  const ev = await w.event('fetch', { request: w.request(`https://castle.test/play/game/bg0.webp?v=${version}`) });
  assert.equal((await ev.answer).ok, true);
  const manifest = await w.event('fetch', { request: w.request('https://castle.test/play/manifest.webmanifest', { mode: 'cors' }) });
  assert.equal((await manifest.answer).ok, true, 'the manifest too');
}

export async function thePageItselfIsServedFromTheCacheForTheFolderIndexAndThePageName({ assert }) {
  const w = makeWorld().load(sw1());
  await w.event('install'); await w.event('activate');
  w.offline = true;
  for (const url of ['https://castle.test/play/', 'https://castle.test/play/index.html', 'https://castle.test/play/ice-castle.html', 'https://castle.test/play/ice-castle.html?x=1']) {
    const ev = await w.event('fetch', { request: w.request(url, { mode: 'navigate' }) });
    assert.ok(ev.answer, `${url} is answered`);
    assert.equal((await ev.answer).url, 'https://castle.test/play/ice-castle.html', `${url}: the cached page`);
  }
}

export async function aPageTheHostAnswersThroughARedirectIsCachedAsAPlainPageANavigationAccepts({ assert }) {
  const w = makeWorld();
  w.redirected['https://castle.test/play/ice-castle.html'] = true;   // Cloudflare static assets: ice-castle.html -> 307 -> ice-castle
  w.load(sw1());
  await w.event('install'); await w.event('activate');
  w.offline = true;
  const page = await (await w.event('fetch', { request: w.request('https://castle.test/play/', { mode: 'navigate' }) })).answer;
  assert.equal(page.redirected, false, 'a browser rejects a redirected response for a navigation, so the stored page must not be one');
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('content-type'), 'text/html', 'the headers are kept');
  assert.equal(await page.text(), 'body of https://castle.test/play/ice-castle.html', 'and the body is the page');
}

export async function devPagesOtherPagesOtherOriginsAndWritesGoStraightToTheNetwork({ assert }) {
  const w = makeWorld().load(sw1());
  await w.event('install'); await w.event('activate');
  const version = stamp(sw1(), 'ASSET_VERSION');
  const none = async request => assert.equal((await w.event('fetch', { request })).answer, undefined, `${request.method} ${request.url} is left alone`);
  await none(w.request('https://castle.test/play/ice-castle.html?dev=1', { mode: 'navigate' }));
  await none(w.request('https://castle.test/play/?dev=1', { mode: 'navigate' }));
  await none(w.request('https://castle.test/play/other.html', { mode: 'navigate' }));
  await none(w.request('https://castle.test/elsewhere/ice-castle.html', { mode: 'navigate' }));
  await none(w.request('https://fonts.googleapis.com/css2?family=Fredoka', { mode: 'no-cors' }));
  await none(w.request(`https://castle.test/play/game/bg0.webp?v=${version}`, { method: 'POST' }));
  await none(w.request('https://castle.test/play/sw.js', { mode: 'same-origin' }));
}

export async function partialAndFailedAnswersAreNeverStoredAsTheWholeClip({ assert }) {
  const w = makeWorld().load(sw1());
  await w.event('install'); await w.event('activate');
  const version = stamp(sw1(), 'ASSET_VERSION');
  const partial = `https://castle.test/play/game/vo_a.mp3?v=${version}`, gone = `https://castle.test/play/game/vo_b.mp3?v=${version}`, opaque = `https://castle.test/play/game/vo_c.mp3?v=${version}`;
  w.status[partial] = 206; w.status[gone] = 404; w.status[opaque + '#type'] = 'opaque';
  await (await w.event('fetch', { request: w.request(partial, { range: true }) })).answer;
  await (await w.event('fetch', { request: w.request(gone) })).answer;
  await (await w.event('fetch', { request: w.request(opaque) })).answer;
  w.offline = true;
  for (const url of [partial, gone, opaque]) {
    const ev = await w.event('fetch', { request: w.request(url) });
    await assert.rejects(() => ev.answer, /Failed to fetch/, `${url} was not cached`);
  }
}
