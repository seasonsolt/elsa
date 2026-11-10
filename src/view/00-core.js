  const NS = 'http://www.w3.org/2000/svg';
  const $ = id => document.getElementById(id);
  const DEV = /[?&]dev=1\b/.test(location.search);

  /* ---------------------------------------------------------------------------------------------------------------
     Save (PLAN §5, CONTRACT §2). Every storage access is wrapped: in a private window, a preview or a sandboxed frame
     localStorage throws, and the game must stay playable with the defaults (the save then lives in memory only).
     --------------------------------------------------------------------------------------------------------------- */
  /* >>> save-block (unit-tested by test/unit/save.test.mjs: keep it free of DOM and of names from other files) */
  const SAVE_KEY = 'icecastle.save';
  const OLD_STARS_KEY = 'icecastle.stars';
  const LEGACY_IDS = ['hall', 'lake', 'tower', 'ballroom'];   // the order of the old icecastle.stars array
  const SETTING_CHECK = {
    subtitles: v => typeof v === 'boolean',
    english: v => v === 'words' || v === 'words+phrases',
    mode: v => v === 'solo' || v === 'duo',
    player: v => v === 'frost',
    sound: v => typeof v === 'boolean',
  };
  const SAVE_VERSION = 2;   // what this build writes and understands; a stored v above it belongs to a newer build
  function lsRead(key) { try { return window.localStorage.getItem(key); } catch (e) { return null; } }
  function lsWrite(key, text) { try { window.localStorage.setItem(key, text); return true; } catch (e) { return false; } }
  function lsRemove(key) { try { window.localStorage.removeItem(key); } catch (e) {} }

  function defaultSave() {
    return {
      v: SAVE_VERSION,
      settings: { subtitles: false, english: 'words+phrases', mode: 'solo', player: 'frost', sound: true },
      rooms: {},
      words: {},
      stickers: [],
      board: [],
      outfit: { frost: { dress: 0, hat: null }, nuan: { dress: 0, hat: null } },
      unlocked: { rooms: 1 },
      flags: { prologue: false, tutorial: false, fullscreenTip: false },
    };
  }
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const nat = (v, d) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : d);
  const bool3 = a => [0, 1, 2].map(i => !!(Array.isArray(a) && a[i]));

  /* Turn whatever came out of JSON.parse into a well-formed save; anything unusable falls back to its default. */
  function sanitizeSave(raw) {
    const s = defaultSave();
    if (!isObj(raw)) return s;
    for (const k of Object.keys(raw)) if (!(k in s) && k !== '__proto__') s[k] = raw[k];   // keep fields later stages add
    if (isObj(raw.settings)) for (const k of Object.keys(SETTING_CHECK)) if (SETTING_CHECK[k](raw.settings[k])) s.settings[k] = raw.settings[k];
    if (isObj(raw.rooms)) {
      for (const id of Object.keys(raw.rooms)) {
        const r = raw.rooms[id];
        if (!isObj(r)) continue;
        const stars = bool3(r.stars);
        s.rooms[id] = { cleared: !!r.cleared, stars, memory: !!r.memory || stars[1] };
      }
    }
    if (isObj(raw.words)) {
      for (const id of Object.keys(raw.words)) {
        const w = raw.words[id];
        if (!isObj(w)) continue;
        s.words[id] = { heard: nat(w.heard, 0), quiz: nat(w.quiz, 0) };
        if (w.seen) s.words[id].seen = true;   // "met on a card" survives a reload even when the sound was off
      }
    }
    if (Array.isArray(raw.stickers)) s.stickers = raw.stickers.filter(x => typeof x === 'string');
    if (Array.isArray(raw.board)) s.board = raw.board.filter(b => isObj(b) && typeof b.id === 'string' && Number.isFinite(b.x) && Number.isFinite(b.y)).map(b => ({ id: b.id, x: b.x, y: b.y }));
    if (isObj(raw.outfit)) {
      for (const who of ['frost', 'nuan']) {
        const o = raw.outfit[who];
        if (isObj(o)) s.outfit[who] = { dress: nat(o.dress, 0), hat: typeof o.hat === 'string' ? o.hat : null };
      }
    }
    if (isObj(raw.unlocked)) s.unlocked.rooms = Math.max(1, nat(raw.unlocked.rooms, 1));
    if (isObj(raw.flags)) for (const k of Object.keys(s.flags)) s.flags[k] = !!raw.flags[k];
    return s;
  }

  /* A save written by a newer build (v above what this one understands) is read for play but never written back. */
  function saveVersionTooNew(raw) { return isObj(raw) && Number.isFinite(raw.v) && raw.v > SAVE_VERSION; }
  function storedSaveIsNewer(text) {
    if (!text) return false;
    try { return saveVersionTooNew(JSON.parse(text)); } catch (e) { return false; }
  }

  /* Fold another tab's save (already sanitized) into `mine`, in place, so objects held elsewhere stay valid.
     Progress only ever grows: cleared rooms, stars, memories, stickers and flags are unions, counters take the larger
     value, unlocked rooms the larger count. Settings, outfit and sticker positions stay as this tab has them.
     Merging the same save twice changes nothing. */
  function mergeSaveInto(mine, theirs) {
    if (!isObj(mine) || !isObj(theirs)) return mine;
    for (const id of Object.keys(theirs.rooms || {})) {
      const o = theirs.rooms[id];
      const r = mine.rooms[id] || (mine.rooms[id] = { cleared: false, stars: [false, false, false], memory: false });
      r.cleared = !!r.cleared || !!o.cleared;
      r.memory = !!r.memory || !!o.memory;
      if (!Array.isArray(r.stars)) r.stars = [false, false, false];
      for (let i = 0; i < 3; i++) r.stars[i] = !!r.stars[i] || !!(o.stars && o.stars[i]);
      if (r.memory) r.stars[1] = true;
      if (r.cleared) r.stars[0] = true;
      for (const k of Object.keys(o)) if (!(k in r)) r[k] = o[k];
    }
    for (const id of Object.keys(theirs.words || {})) {
      const o = theirs.words[id];
      const w = mine.words[id] || (mine.words[id] = { heard: 0, quiz: 0 });
      w.heard = Math.max(nat(w.heard, 0), nat(o.heard, 0));
      w.quiz = Math.max(nat(w.quiz, 0), nat(o.quiz, 0));
      if (o.seen) w.seen = true;
      for (const k of Object.keys(o)) if (!(k in w)) w[k] = o[k];
    }
    for (const id of theirs.stickers || []) if (!mine.stickers.includes(id)) mine.stickers.push(id);
    for (const b of theirs.board || []) if (!mine.board.some(x => x.id === b.id)) mine.board.push({ id: b.id, x: b.x, y: b.y });
    mine.unlocked.rooms = Math.max(1, nat(mine.unlocked.rooms, 1), nat(theirs.unlocked && theirs.unlocked.rooms, 1));
    for (const k of Object.keys(theirs.flags || {})) mine.flags[k] = !!mine.flags[k] || !!theirs.flags[k];
    for (const k of Object.keys(theirs)) if (!(k in mine) && k !== '__proto__') mine[k] = theirs[k];
    return mine;
  }
  /* The same merge without touching either argument. */
  function mergeSaves(a, b) { return mergeSaveInto(sanitizeSave(JSON.parse(JSON.stringify(a))), sanitizeSave(JSON.parse(JSON.stringify(b)))); }

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
    let raw = null;
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
    try { onSettingChanged(key, value); } catch (e) { console.error(e); }   // 90-main applies mode / player to the game
    return true;
  }
  /* <<< save-block */

  /* Dev counter: how often each word was heard, per room (?dev=1, CONTRACT §4 wordStats). */
  const heardLog = {};
  function noteWordHeard(wordId) {
    if (typeof wordId !== 'string' || !wordId) return;
    const w = save.words[wordId] || (save.words[wordId] = { heard: 0, quiz: 0 });
    w.heard++;
    const word = WORDS.find(w => w.id === wordId);
    const lv = LEVELS[game.index], room = (word && word.room) || (lv && lv.id) || '?';
    const byRoom = heardLog[wordId] || (heardLog[wordId] = {});
    byRoom[room] = (byRoom[room] || 0) + 1;
    saveSoon();
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
  game.player = setting('player');
  /* SIZES and LINES are JSON inlined by art/build_page.py; the placeholders keep this file valid JS on its own. */
  const SIZES = /*SIZES*/{};
  const ASSET_VERSION = /*ASSET_VERSION*/'dev';
  const assetURL = file => `game/${file}?v=${ASSET_VERSION}`;
  const SRC = n => assetURL(`${n}.webp`);

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
