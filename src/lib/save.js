  /* Save data: shape, sanitizing, version check and merge. Pure functions, no storage, no DOM (PLAN-2 B5).
     Plain global script: art/build_page.py inlines it before the view fragments (indented like them), test/harness.mjs
     `loadLib` runs it in node. Reading and writing localStorage, the `save` object and the storage event stay in view/00-core.js.
     Free names: none. */
  const SETTING_CHECK = {
    subtitles: v => typeof v === 'boolean',
    english: v => v === 'words' || v === 'words+phrases',
    mode: v => v === 'solo' || v === 'duo',
    player: v => v === 'frost',   // Elsa leads; kept in the save so an old 'nuan' choice is migrated to her instead of dropped
    sound: v => typeof v === 'boolean',
  };
  const SAVE_VERSION = 3;   // what this build writes and understands; a stored v above it belongs to a newer build
  /* v3 (PLAN-2 C2, C5): per-word review fields (see src/lib/review.js) and two top-level counters, totalPlaySeconds and roomClock.
     v2 -> v3 needs no step of its own: sanitizeSave rebuilds every save at the current version and keeps all v2 data. */
  const WORD_COUNTERS = ['wrong', 'lastSeen', 'lastWrong', 'lastReviewed', 'reviews'];   // optional per-word numbers, stored only when above 0

  function defaultSave() {
    return {
      v: SAVE_VERSION,
      settings: { subtitles: false, english: 'words+phrases', mode: 'solo', player: 'frost', sound: true },
      rooms: {},
      words: {},
      totalPlaySeconds: 0,   // whole seconds of play, for the parent page
      roomClock: 0,          // rooms entered so far, the clock of the spaced review
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
        for (const k of WORD_COUNTERS) if (nat(w[k], 0) > 0) s.words[id][k] = nat(w[k], 0);
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
    s.totalPlaySeconds = nat(raw.totalPlaySeconds, 0);
    /* a save from before v3 has no clock: the rooms already cleared stand for the rooms already entered */
    s.roomClock = Number.isFinite(raw.roomClock) && raw.roomClock >= 0 ? nat(raw.roomClock, 0) : Object.keys(s.rooms).filter(id => s.rooms[id].cleared).length;
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
     Progress only ever grows: cleared rooms, stars, memories, stickers and flags are unions, counters (heard, quiz, the review
     fields, totalPlaySeconds, roomClock) take the larger value, unlocked rooms the larger count. Settings, outfit and sticker positions stay as this tab has them.
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
      for (const k of WORD_COUNTERS) if (nat(o[k], 0) > nat(w[k], 0)) w[k] = nat(o[k], 0);
      for (const k of Object.keys(o)) if (!(k in w)) w[k] = o[k];
    }
    for (const id of theirs.stickers || []) if (!mine.stickers.includes(id)) mine.stickers.push(id);
    for (const b of theirs.board || []) if (!mine.board.some(x => x.id === b.id)) mine.board.push({ id: b.id, x: b.x, y: b.y });
    mine.totalPlaySeconds = Math.max(nat(mine.totalPlaySeconds, 0), nat(theirs.totalPlaySeconds, 0));
    mine.roomClock = Math.max(nat(mine.roomClock, 0), nat(theirs.roomClock, 0));
    mine.unlocked.rooms = Math.max(1, nat(mine.unlocked.rooms, 1), nat(theirs.unlocked && theirs.unlocked.rooms, 1));
    for (const k of Object.keys(theirs.flags || {})) mine.flags[k] = !!mine.flags[k] || !!theirs.flags[k];
    for (const k of Object.keys(theirs)) if (!(k in mine) && k !== '__proto__') mine[k] = theirs[k];
    return mine;
  }
  /* The same merge without touching either argument. */
  function mergeSaves(a, b) { return mergeSaveInto(sanitizeSave(JSON.parse(JSON.stringify(a))), sanitizeSave(JSON.parse(JSON.stringify(b)))); }
