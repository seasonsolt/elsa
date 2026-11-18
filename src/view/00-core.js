  const NS = 'http://www.w3.org/2000/svg';
  const $ = id => document.getElementById(id);
  const DEV = /[?&]dev=1\b/.test(location.search);

  /* ---------------------------------------------------------------------------------------------------------------
     Save (PLAN §5, CONTRACT §2). Every storage access is wrapped: in a private window, a preview or a sandboxed frame
     localStorage throws, and the game must stay playable with the defaults (the save then lives in memory only).
     --------------------------------------------------------------------------------------------------------------- */
  /* Storage side of the save. The pure part (shape, sanitize, version check, merge: SETTING_CHECK, SAVE_VERSION, defaultSave,
     sanitizeSave, saveVersionTooNew, storedSaveIsNewer, mergeSaveInto, mergeSaves) lives in src/lib/save.js. */
  const SAVE_KEY = 'icecastle.save';
  const OLD_STARS_KEY = 'icecastle.stars';
  const LEGACY_IDS = ['hall', 'lake', 'tower', 'ballroom'];   // the order of the old icecastle.stars array
  function lsRead(key) { try { return window.localStorage.getItem(key); } catch (e) { return null; } }
  function lsWrite(key, text) { try { window.localStorage.setItem(key, text); return true; } catch (e) { return false; } }
  function lsRemove(key) { try { window.localStorage.removeItem(key); } catch (e) {} }

  function loadSave() {
    let raw = null;
    try { const t = lsRead(SAVE_KEY); if (t) raw = JSON.parse(t); } catch (e) { raw = null; }
    const s = sanitizeSave(raw);
    const readOnly = saveVersionTooNew(raw);
    /* One-time migration of the old best-stars array: [clear, memory, par] per room, in the original four-room order.
       The third old star meant "finished within par seconds", the new one means "every small star", so it is not carried over. */
    let old = null;
    try { const t = lsRead(OLD_STARS_KEY); if (t) old = JSON.parse(t); } catch (e) { old = null; }
    if (Array.isArray(old)) {
      old.forEach((st, i) => {
        const id = LEGACY_IDS[i];
        if (!id || !Array.isArray(st)) return;
        const r = s.rooms[id] || (s.rooms[id] = { cleared: false, stars: [false, false, false], memory: false });
        r.cleared = r.cleared || !!st[0];
        r.stars[0] = r.stars[0] || !!st[0];
        r.memory = r.memory || !!st[1];
        r.stars[1] = r.stars[1] || !!st[1];
        if (st[0]) s.unlocked.rooms = Math.max(s.unlocked.rooms, i + 2);
      });
      if (!readOnly && lsWrite(SAVE_KEY, JSON.stringify(s))) lsRemove(OLD_STARS_KEY);   // only forget the old copy once the new one is safe
    } else if (old !== null) {
      lsRemove(OLD_STARS_KEY);
    }
    return s;
  }

  const save = loadSave();
  let saveTimer = 0;
  function saveWrite() {
    clearTimeout(saveTimer); saveTimer = 0;
    if (storedSaveIsNewer(lsRead(SAVE_KEY))) return false;   // a newer build owns this key: play on in memory, never overwrite it
    try { return lsWrite(SAVE_KEY, JSON.stringify(save)); } catch (e) { return false; }
  }
  /* Counters change many times a minute; coalesce them. */
  function saveSoon() { if (!saveTimer) saveTimer = setTimeout(saveWrite, 400); }
  addEventListener('pagehide', () => { if (saveTimer) saveWrite(); });
  /* Another tab saved: take its progress into ours and write the union back, but only when that changed something, so two
     tabs settle after at most one round of writes. */
  addEventListener('storage', e => {
    if (!e || e.key !== SAVE_KEY || !e.newValue) return;
    let raw;
    try { raw = JSON.parse(e.newValue); } catch (err) { return; }
    if (!isObj(raw) || saveVersionTooNew(raw)) return;
    const before = JSON.stringify(save);
    mergeSaveInto(save, sanitizeSave(raw));
    if (JSON.stringify(save) !== before) saveWrite();
  });

  function setting(key) {
    const v = save.settings[key];
    return SETTING_CHECK[key] && SETTING_CHECK[key](v) ? v : defaultSave().settings[key];
  }
  function setSetting(key, value) {
    if (!SETTING_CHECK[key] || !SETTING_CHECK[key](value)) return false;
    save.settings[key] = value;
    saveWrite();
    try { onSettingChanged(key, value); } catch (e) { console.error(e); }   // 90-main applies mode to the game
    return true;
  }

  const roomIndex = id => LEVELS.findIndex(lv => lv.id === id);
  /* Merge a result into save.rooms[id]. Flags and stars only ever go from false to true, a replay can't lose a star.
     Clearing a room unlocks the next one. */
  function markRoom(levelId, patch) {
    const r = save.rooms[levelId] || (save.rooms[levelId] = { cleared: false, stars: [false, false, false], memory: false });
    const p = patch || {};
    if (p.cleared) r.cleared = true;
    if (p.memory) r.memory = true;
    if (Array.isArray(p.stars)) for (let i = 0; i < 3; i++) if (p.stars[i]) r.stars[i] = true;
    if (r.memory) r.stars[1] = true;
    if (r.cleared) r.stars[0] = true;
    for (const k of Object.keys(p)) if (!['cleared', 'memory', 'stars'].includes(k)) r[k] = p[k];
    if (r.cleared) {
      const i = roomIndex(levelId);
      if (i >= 0) save.unlocked.rooms = Math.max(save.unlocked.rooms, Math.min(LEVELS.length, i + 2));
    }
    saveWrite();
    return r;
  }
  const unlockedRooms = () => Math.max(1, Math.min(LEVELS.length, save.unlocked.rooms));
  /* The room "continue" should open: the first unlocked room that is not cleared yet (else the last unlocked one). */
  function nextRoomIndex() {
    const n = unlockedRooms();
    for (let i = 0; i < n; i++) if (!(save.rooms[LEVELS[i].id] || {}).cleared) return i;
    return n - 1;
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  const game = createGame();
  game.mode = setting('mode');
  /* SIZES and LINES are JSON inlined by art/build_page.py; the placeholders keep this file valid JS on its own. */
  const SIZES = /*SIZES*/{};
  const ASSET_VERSION = /*ASSET_VERSION*/'dev';
  const assetURL = file => `game/${file}?v=${ASSET_VERSION}`;

  /* Sharp pictures on a big screen (fullscreen, a Retina display): art/hd.py keeps a copy of every stage picture at twice the size in
     game/hd/ (Real-ESRGAN). Once the stage is wider than HD_FROM device pixels, a picture switches to its large copy as soon as that copy
     has decoded: SRC hands it out from then on and hdUpgrade replaces it where it is already shown. Until then, offline, or when the copy
     fails to load, the normal picture stays. Once on it stays on (a large copy also looks right on a smaller stage). */
  const HD_NAMES = new Set(/*HD*/[]);
  const HD_FROM = 1700;
  const hd = { on: false, ready: new Set(), asked: new Set(), live: new Set(), timer: 0 };
  const ART_PATIENCE = 1500;
  const artJobs = new Map();   // name -> promise of its decode, settled (never rejected) when it is decoded or has failed
  const artWait = new Set();
  const artLive = new Set();   // the Image objects whose picture is still loading: held so nothing can collect them mid-load
  const artStats = { requested: 0, decoded: 0, failed: 0 };
  const artPending = name => artWait.has(name);

  function hdWant(n) {
    if (!hd.on || !HD_NAMES.has(n) || hd.asked.has(n) || artWait.has(n)) return;
    hd.asked.add(n);
    const im = new Image();
    hd.live.add(im);
    // onload, not decode(): a page in a hidden or background tab may never settle decode(), and the copy only has to have arrived
    im.onload = () => { hd.live.delete(im); hd.ready.add(n); hdUpgradeSoon(); };
    im.onerror = () => { hd.live.delete(im); hd.asked.delete(n); };
    im.src = assetURL(`hd/${n}.webp`);
  }
  const SRC = n => { hdWant(n); return assetURL(`${hd.ready.has(n) ? 'hd/' : ''}${n}.webp`); };
  function hdUpgrade() {
    hd.timer = 0;
    for (const node of document.querySelectorAll('image, img')) {
      const attr = node.tagName === 'IMG' ? 'src' : 'href';
      const m = /^game\/([\w-]+)\.webp\?/.exec(node.getAttribute(attr) || '');
      if (m && hd.ready.has(m[1])) node.setAttribute(attr, assetURL(`hd/${m[1]}.webp`));
      else if (m) hdWant(m[1]);
    }
  }
  function hdUpgradeSoon() { if (!hd.timer) hd.timer = setTimeout(hdUpgrade, 120); }
  /** called with the stage's width in CSS pixels whenever it is fitted (80-input) */
  function hdFit(cssWidth) {
    if (hd.on || !HD_NAMES.size || cssWidth * (window.devicePixelRatio || 1) <= HD_FROM) return;
    hd.on = true;
    hdUpgrade();
  }

  /* Pictures load by group (PLAN-2 D4, plan in src/lib/assets.js): the title set first, a room's set while its recall / chapter cards are
     up. On Retina / fullscreen stages (hd.on), stage pictures fetch game/hd/<name>.webp directly in a single pass, falling back to the
     standard copy when offline or unavailable. */
  const TOY_ART = /^(tile_slope_|spring_|floe_|note_|flower_|bunny_)/;
  function loadArt(names, patience) {
    const jobs = [];
    for (const n of names) {
      let p = artJobs.get(n);
      if (!p) {
        const wantHd = hd.on && HD_NAMES.has(n) && !hd.ready.has(n) && (typeof navigator === 'undefined' || navigator.onLine !== false);
        const im = new Image();
        artStats.requested++;
        artWait.add(n); artLive.add(im);
        if (wantHd) hd.asked.add(n);
        im.src = assetURL(`${wantHd ? 'hd/' : ''}${n}.webp`);
        const finishOk = usedHd => {
          artWait.delete(n); artLive.delete(im); artStats.decoded++;
          if (usedHd) { hd.ready.add(n); hdUpgradeSoon(); }
          if (TOY_ART.test(n) && typeof toyImageReady === 'function') toyImageReady(n);   // 15-toys: remembers the picture exists
        };
        const finishFail = () => {
          artWait.delete(n); artLive.delete(im); artStats.failed++; artJobs.delete(n);     // a failed picture is asked for again next time
        };
        p = im.decode().then(() => finishOk(wantHd), () => {
          if (!wantHd) { finishFail(); return; }
          hd.asked.delete(n);
          const sd = new Image();
          artLive.add(sd);
          sd.src = assetURL(`${n}.webp`);
          return sd.decode().then(() => { artLive.delete(sd); finishOk(false); }, () => { artLive.delete(sd); finishFail(); });
        });
        artJobs.set(n, p);
      }
      jobs.push(p);
    }
    const all = Promise.all(jobs).then(() => {});
    return patience > 0 ? Promise.race([all, new Promise(ok => setTimeout(ok, patience))]) : all;
  }

  function el(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  const img = (name, x, y, w, h, parent, extra) => el('image', Object.assign({ href: SRC(name), x, y, width: w, height: h, preserveAspectRatio: 'none' }, extra), parent);

  /* An extra drawing layer of ours inside the stage, placed just before an existing layer (or appended). */
  function layer(id, beforeId) {
    let g = $(id);
    if (g) return g;
    g = el('g', { id, 'aria-hidden': 'true' });
    const before = beforeId && $(beforeId);
    if (before && before.parentNode) before.parentNode.insertBefore(g, before);
    else $('stage').appendChild(g);
    return g;
  }

  /** @type {{ lines?: Record<string, any>, pages?: Record<string, any>, voices?: any, words?: any[] }} */
  const LINES = /*LINES*/{};
  const WORDS = /*WORDS*/[];
  const lineOf = key => (LINES.lines && LINES.lines[key]) || null;
  const hasLineKey = key => !!lineOf(key);
  /* A line as plain text (zh strings, word ids and fixed phrases in order), for story pages that want a subtitle. */
  function lineText(key) {
    const L = lineOf(key);
    if (!L || !Array.isArray(L.say)) return [];
    return [L.say.map(seg => (typeof seg === 'string' ? seg : seg && seg.w ? seg.w : seg && seg.en ? seg.en : '')).join('')];
  }

  const wrap = (text, n) => {
    const out = [];
    let line = '';
    for (const ch of text) {
      if (line.length >= n && !'，。、！？：；」…—'.includes(ch)) { out.push(line); line = ''; }
      line += ch;
    }
    if (line) out.push(line);
    return out;
  };

  function fillSnow(box, n, big) {
    for (let i = 0; i < n; i++) {
      el('circle', {
        class: 'flake', cx: Math.random() * 1000 - 40, cy: 0,
        r: big ? 2.4 + Math.random() * 2.6 : .9 + Math.random() * 1.5,
        fill: '#fff', opacity: big ? .3 + Math.random() * .3 : .4 + Math.random() * .4,
        style: `animation-duration:${(big ? 6 : 10) + Math.random() * 8}s;animation-delay:-${Math.random() * 16}s`,
      }, box);
    }
  }
  fillSnow($('snowBack'), 34, false);
  fillSnow($('snowFront'), 12, true);
