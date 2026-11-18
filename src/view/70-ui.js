  /* ===== d1 / view-ui: picture-button helpers, HUD, title, rooms, wordbook, meet-them, parent settings, subtitles =====
     Everything here is drawn as SVG strings into #hud / #overlay / #modal / #subs of the 960x520 stage.
     Private names carry the `ux` prefix so they cannot collide with the other view files (one shared scope).
     Cross-file names used (CONTRACT): voice.line/word/ui/stop, sfx, onSubtitle, setting/setSetting, save, markRoom, saveWrite,
     startMusic, wakeAudio, game, LEVELS, LINES, SRC, $. Each one is looked up through a guarded wrapper, so a missing piece
     degrades to silence instead of throwing. Nothing in this file calls into another file while the script is loading. */

  const uxState = { inited: false, tok: null, modal: null, hudBuilt: false, lit: {}, sig: '', player: '', tick: 0, seen: {} };
  const uxLocal = { subtitles: false, english: 'words+phrases', mode: 'solo', sound: true };
  const uxRawWait = ms => new Promise(r => setTimeout(r, ms));
  async function uxHoldIfPortrait() {
    try {
      while (typeof isPortraitView === 'function' && isPortraitView()) await uxRawWait(200);
    } catch (e) {}
  }
  const uxWait = async ms => { await uxRawWait(ms); await uxHoldIfPortrait(); };
  const uxInk = '#4a3a8c';
  const UX_HUE = ['#ff9cc0', '#ffd27a', '#9fd6ff', '#b9e3a5', '#d4b4ff', '#ffb98a'];

  /* ---------- guarded access to the other agents' APIs ---------- */
  function uxWake() { try { if (typeof wakeAudio === 'function') wakeAudio(); } catch (e) {} }
  function uxSetting(k) {
    try { if (typeof setting === 'function') { const v = setting(k); if (v !== undefined) return v; } } catch (e) {}
    return uxLocal[k];
  }
  function uxPutSetting(k, v) {
    uxLocal[k] = v;
    try { if (typeof setSetting === 'function') setSetting(k, v); } catch (e) {}
  }
  async function uxLine(key, opts) {
    await uxHoldIfPortrait();
    let p = null;
    try { if (typeof voice !== 'undefined' && voice && typeof voice.line === 'function') p = voice.line(key, opts); } catch (e) {}
    if (!p || typeof p.then !== 'function') { await uxWait(800); return; }
    await Promise.race([p.then(() => {}, () => {}), uxRawWait(20000)]);
    await uxHoldIfPortrait();
  }
  function uxWordVoice(id) {
    let p = null;
    try { if (typeof voice !== 'undefined' && voice && typeof voice.word === 'function') p = voice.word(id); } catch (e) {}
    if (!p || typeof p.then !== 'function') return uxWait(900);
    return Promise.race([p.catch(() => false), uxWait(8000).then(() => false)]);
  }
  const uxKey = (stem, id) => stem + '_' + id;   // line keys built from a stem, e.g. uxKey('learn', 'heart')
  /* Warm the voice cache for lines that will play soon; unknown keys and a missing voice are ignored. */
  function uxPreload(keys) {
    try {
      if (typeof voice === 'undefined' || !voice || typeof voice.preload !== 'function') return;
      const p = voice.preload(keys.filter(k => hasLineKey(k) || /^word_/.test(k)));
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (e) {}
  }
  function uxUiVoice(name) { try { if (typeof voice !== 'undefined' && voice && typeof voice.ui === 'function') voice.ui(name); } catch (e) {} }
  /* The name of the button the gamepad focus just landed on: the pad's way of hovering it (PLAN-2 D7). voice.ui is silent while a
     scene is open, so this asks for the same quiet clip itself (priority 0, tag 'ui'): it is said only when nothing else is being
     said, cuts only another button name, and so never talks over a lesson or a quiz question. */
  function uxPadName(name) {
    if (!name || !hasLineKey('ui_' + name)) return;
    try { if (typeof voice !== 'undefined' && voice && typeof voice.line === 'function') voice.line('ui_' + name, { interrupt: true, priority: 0, tag: 'ui', maxWait: 600, subtitle: false }); } catch (e) {}
  }
  function uxStopVoice() { try { if (typeof voice !== 'undefined' && voice && typeof voice.stop === 'function') voice.stop(); } catch (e) {} }
  function uxSfx(name) { try { if (typeof sfx === 'function') sfx(name); } catch (e) {} }

  /* ---------- level and word data ---------- */
  function uxLevel(x) {
    if (x && typeof x === 'object') return x;
    if (typeof x === 'number') return LEVELS[x];
    return LEVELS.find(l => l.id === x) || LEVELS[game.index] || LEVELS[0];
  }
  const uxLevelIndex = lv => Math.max(0, LEVELS.indexOf(lv));
  /* words.json is not inlined by build_page.py yet (gap, see delivery note): WORDS or LINES.words when present, else derived from LEVELS[].words. */
  function uxAllWords() {
    let list = null;
    try { if (typeof WORDS !== 'undefined' && Array.isArray(WORDS)) list = WORDS; } catch (e) {}
    if (!list && Array.isArray(LINES.words)) list = LINES.words;
    if (!list) {
      list = [];
      LEVELS.forEach(lv => (lv.words || []).forEach(id => { if (!list.some(w => w.id === id)) list.push({ id, en: id, zh: '', icon: 'word_' + id, room: lv.id }); }));
    }
    return list;
  }
  function uxWord(id) { return uxAllWords().find(w => w.id === id) || { id, en: id, zh: '', icon: 'word_' + id, room: null }; }
  function uxWordList(ids) { return ids.map(uxWord); }
  function uxRoomWords(lv) { return uxWordList((lv && lv.words) || []); }
  function uxWordRec(id) {
    try { if (typeof save !== 'undefined' && save) { save.words = save.words || {}; return (save.words[id] = save.words[id] || { heard: 0, quiz: 0 }); } } catch (e) {}
    return (uxState.seen[id] = uxState.seen[id] || { heard: 0, quiz: 0 });
  }
  function uxWordKnown(id) { const r = (save.words || {})[id]; return !!(r && (r.heard > 0 || r.seen)); }   // reads only: looking at a card must not write a record
  function uxSaveNow() { try { if (typeof saveWrite === 'function') saveWrite(); } catch (e) {} }
  /* One quiz question was answered (firstTry: right at the first tap). Stored at once: leaving half way loses nothing. */
  function uxNoteQuiz(id, firstTry) { noteQuizAnswer(save.words, id, firstTry, reviewContext(save)); uxSaveNow(); }
  /* An older word came back in a recall. */
  function uxNoteReviewed(id) { noteReviewed(save.words, id, reviewContext(save)); uxSaveNow(); }
  function uxRoomSave(id) { try { return (save.rooms && save.rooms[id]) || {}; } catch (e) { return {}; } }
  function uxCleared(i) { return !!uxRoomSave((LEVELS[i] || {}).id).cleared; }
  function uxUnlocked(i) {
    if (i === 0) return true;
    try { if (save.unlocked && save.unlocked.rooms > i) return true; } catch (e) {}
    return uxCleared(i - 1);
  }
  /* The room a core word is taught in (index into LEVELS), or -1 for the general words that belong to no room. */
  function uxWordRoom(id) { return LEVELS.findIndex(lv => (lv.words || []).includes(id)); }
  /* True unless the word's room is still locked. A silhouette of a locked room stays silent (hearing it would count as learned)
     and its word never comes up in a review. */
  function uxWordOpen(id) { const i = uxWordRoom(id); return i < 0 || uxUnlocked(i); }
  /* Where a quiz takes its wrong answers from: the words met in the OTHER rooms the child has cleared. */
  function uxQuizPool(lv) {
    const ids = [];
    LEVELS.forEach((other, i) => { if (other.id !== lv.id && uxCleared(i)) ids.push(...(other.words || [])); });
    return reviewLearned(save.words, ids);
  }
  /* Core words the review game may ask: met at least once, and from a room the child can open. */
  function uxReviewPool() {
    const ids = [];
    LEVELS.forEach((lv, i) => { if (uxUnlocked(i)) ids.push(...(lv.words || [])); });
    return reviewLearned(save.words, ids);
  }
  /* The words of a recall: the room just left, then up to two older words that are due. Only core words of rooms the child can open
     are eligible: the general words (hello, one ...) have no recall line, and a word of a locked room must not show up early. */
  function uxRecallWords(prevWords, exclude) {
    const eligible = {};
    for (const id of uxReviewPool()) eligible[id] = save.words[id];
    return recallWordsFor(prevWords, eligible, Object.assign(reviewContext(save), { exclude }));
  }
  /* The next `n` review questions: what reviewDue wants first (missed words at the head), then the rest of the pool, least recently met first. */
  function uxReviewQueue(n) {
    const pool = uxReviewPool(), at = id => (save.words[id] || {}).lastSeen || 0, quiz = id => (save.words[id] || {}).quiz || 0;
    const due = reviewDue(save.words, reviewContext(save)).filter(id => pool.includes(id));
    const rest = pool.filter(id => !due.includes(id)).sort((a, b) => at(a) - at(b) || quiz(a) - quiz(b) || (a < b ? -1 : a > b ? 1 : 0));
    return due.concat(rest).slice(0, n);
  }
  function uxLineArt(key, fallback) {
    const l = LINES && LINES.lines && LINES.lines[key];
    return (l && l.art) || fallback || null;
  }

  /* ---------- pictures with placeholders ---------- */
  /* Unit glyphs (radius 1) drawn when a ui_* picture is not delivered yet. Shapes only, never text, never a broken image. */
  function uxGlyph(name, ink) {
    const c = ink || uxInk;
    const st = `fill="none" stroke="${c}" stroke-width=".2" stroke-linecap="round" stroke-linejoin="round"`;
    const fl = `fill="${c}" stroke="${c}" stroke-width=".1" stroke-linejoin="round"`;
    switch (name) {
      case 'play': case 'start': case 'continue': return `<path d="M-.4 -.6L.68 0L-.4 .6Z" ${fl}/>`;
      case 'next': case 'key_right': return `<path d="M-.65 0H.5M.05 -.5L.6 0L.05 .5" ${st}/>`;
      case 'back': case 'key_left': return `<path d="M.65 0H-.5M-.05 -.5L-.6 0L-.05 .5" ${st}/>`;
      case 'key_up': return `<path d="M0 .65V-.5M-.5 -.05L0 -.6L.5 -.05" ${st}/>`;
      case 'key_space': return `<path d="M-.75 -.15V.25H.75V-.15" ${st}/>`;
      case 'replay': return `<path d="M.6 .05A.6 .6 0 1 1 .35 -.5" ${st}/><path d="M.05 -.85L.5 -.55L.0 -.25Z" ${fl}/>`;
      case 'words': case 'book': return `<path d="M-.75 -.5Q-.38 -.7 0 -.45Q.38 -.7 .75 -.5V.55Q.38 .35 0 .6Q-.38 .35 -.75 .55Z" fill="#fff" stroke="${c}" stroke-width=".14" stroke-linejoin="round"/><path d="M0 -.45V.6" ${st} stroke-width=".1"/>`;
      case 'bulb': return `<circle cx="0" cy="-.2" r=".5" fill="#ffe27a" stroke="${c}" stroke-width=".14"/><rect x="-.24" y=".34" width=".48" height=".3" rx=".08" fill="${c}"/>`;
      case 'gear': return `<circle r=".66" fill="none" stroke="${c}" stroke-width=".26" stroke-dasharray=".2 .0786"/><circle r=".5" fill="${c}"/><circle r=".2" fill="#fff"/>`;
      case 'fullscreen': return `<path d="M-.7 -.25V-.7H-.25M.25 -.7H.7V-.25M.7 .25V.7H.25M-.25 .7H-.7V.25" ${st} stroke-width=".17"/>`;
      case 'ear': return `<path d="M-.1 .7C-.55 .55 -.6 .1 -.5 -.2C-.4 -.7 .25 -.85 .5 -.4C.7 -.05 .35 .2 .15 .35C.05 .45 .12 .62 -.1 .7Z" fill="#ffd9b0" stroke="${c}" stroke-width=".12"/><path d="M-.05 -.3C.15 -.4 .3 -.2 .1 0" ${st} stroke-width=".1"/>`;
      case 'mouth': return `<path d="M-.7 -.05Q0 -.5 .7 -.05Q0 .65 -.7 -.05Z" fill="#e8527a" stroke="${c}" stroke-width=".12" stroke-linejoin="round"/><path d="M-.35 .05Q0 .0 .35 .05" ${st} stroke="#fff" stroke-width=".1"/>`;
      case 'sticker': case 'stickers': case 'star': return `<path d="M0 -.8L.22 -.25L.8 -.22L.35 .15L.5 .72L0 .4L-.5 .72L-.35 .15L-.8 -.22L-.22 -.25Z" fill="#ffd27a" stroke="${c}" stroke-width=".12" stroke-linejoin="round"/>`;
      case 'wardrobe': return `<path d="M-.22 -.75H.22L.3 -.25L.75 .7H-.75L-.3 -.25Z" fill="#ff9cc0" stroke="${c}" stroke-width=".13" stroke-linejoin="round"/>`;
      case 'solo': return `<circle cy="-.38" r=".28" ${fl}/><path d="M-.5 .7Q-.5 .1 0 .1Q.5 .1 .5 .7Z" ${fl}/>`;
      case 'duo': return `<circle cx="-.4" cy="-.38" r=".24" ${fl}/><path d="M-.8 .65Q-.8 .1 -.4 .1Q0 .1 0 .65Z" ${fl}/><circle cx=".42" cy="-.3" r=".28" ${fl}/><path d="M-.02 .7Q-.02 .15 .42 .15Q.86 .15 .86 .7Z" ${fl}/>`;
      case 'meet': return `<circle cx="-.38" cy="-.1" r=".36" fill="#cfe6ff" stroke="${c}" stroke-width=".12"/><circle cx=".38" cy="-.1" r=".36" fill="#ffd9a8" stroke="${c}" stroke-width=".12"/><path d="M-.6 .7Q-.38 .35 -.16 .7M.16 .7Q.38 .35 .6 .7" ${st} stroke-width=".12"/>`;
      case 'rooms': return `<rect x="-.7" y="-.7" width=".6" height=".6" rx=".1" ${fl}/><rect x=".1" y="-.7" width=".6" height=".6" rx=".1" ${fl}/><rect x="-.7" y=".1" width=".6" height=".6" rx=".1" ${fl}/><rect x=".1" y=".1" width=".6" height=".6" rx=".1" ${fl}/>`;
      case 'home': return `<path d="M-.7 0L0 -.7L.7 0M-.5 -.1V.65H.5V-.1" ${st}/>`;
      case 'close': return `<path d="M-.5 -.5L.5 .5M.5 -.5L-.5 .5" ${st} stroke-width=".26"/>`;
      case 'lock': return `<path d="M-.3 -.1V-.35A.3 .3 0 0 1 .3 -.35V-.1" ${st} stroke-width=".16"/><rect x="-.5" y="-.1" width="1" height=".8" rx=".14" ${fl}/>`;
      case 'check': return `<path d="M-.6 .05L-.2 .5L.65 -.5" ${st} stroke-width=".26"/>`;
      default: return `<circle r=".55" ${fl}/>`;
    }
  }
  /* Picture with a placeholder. Browsers draw a broken-image icon for a missing <image>, so a picture is only emitted
     once a probe has loaded it; until then (or if it never exists) the placeholder shapes stand in. A successful probe
     replaces every placeholder of that name that is already on screen. A failed probe (a dropped connection, a host that briefly
     refuses a burst of requests) is tried again after UX_PROBE_RETRY_MS; only after the last try does the placeholder stay. */
  const UX_PROBE_RETRY_MS = [2000, 5000, 15000];
  const uxImgState = {};
  const uxImgFails = {};
  function uxProbe(name) {
    if (uxImgState[name]) return;
    uxImgState[name] = 'wait';
    const im = new Image();
    im.onload = () => { uxImgState[name] = 'ok'; uxUpgrade(name); };
    im.onerror = () => {
      uxImgState[name] = 'bad';
      const fails = uxImgFails[name] = (uxImgFails[name] || 0) + 1;
      if (fails <= UX_PROBE_RETRY_MS.length) setTimeout(() => { delete uxImgState[name]; uxProbe(name); }, UX_PROBE_RETRY_MS[fails - 1]);
    };
    im.src = SRC(name);
  }
  const uxImgTag = (name, x, y, w, h, extra) => `<image href="${SRC(name)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet" ${extra || ''}/>`;
  function uxUpgrade(name) {
    document.querySelectorAll('[data-pic="' + name + '"]').forEach(/** @param {HTMLElement} g */ g => {
      const b = g.dataset.box.split(',');
      g.insertAdjacentHTML('afterend', uxImgTag(name, b[0], b[1], b[2], b[3], g.dataset.extra || ''));
      g.remove();
    });
  }
  function uxPic(name, x, y, w, h, ph, extra) {
    if (uxImgState[name] === 'ok') return uxImgTag(name, x, y, w, h, extra);
    uxProbe(name);
    return `<g class="ph" data-pic="${name}" data-box="${x},${y},${w},${h}" data-extra="${(extra || '').replace(/"/g, '&quot;')}">${ph}</g>`;
  }
  /* A ui_<name> icon centred on 0,0 inside a plate of radius r. Names without a delivered picture stay a drawn glyph. */
  const UX_IMG_ALIAS = { words: 'book', stickers: 'sticker' };
  const UX_GLYPH_ONLY = ['rooms', 'home', 'close', 'lock', 'check'];
  function uxIcon(name, r, ink) {
    const s = r * 0.62, glyph = `<g transform="scale(${s.toFixed(2)})">${uxGlyph(name, ink)}</g>`;
    if (UX_GLYPH_ONLY.includes(name)) return glyph;
    return uxPic('ui_' + (UX_IMG_ALIAS[name] || name), -r * 0.88, -r * 0.88, r * 1.76, r * 1.76, glyph);
  }
  /* Soft blob standing in for a word icon until word_<id>.webp is delivered. */
  function uxBlob(id, cx, cy, r, grey) {
    let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const col = grey ? '#9aa4cf' : UX_HUE[h % UX_HUE.length];
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${col}" opacity=".9"/><path d="M${cx} ${cy - r * .5}L${cx + r * .15} ${cy - r * .12}L${cx + r * .5} ${cy - r * .1}L${cx + r * .2} ${cy + r * .1}L${cx + r * .3} ${cy + r * .5}L${cx} ${cy + r * .28}L${cx - r * .3} ${cy + r * .5}L${cx - r * .2} ${cy + r * .1}L${cx - r * .5} ${cy - r * .1}L${cx - r * .15} ${cy - r * .12}Z" fill="#fff" opacity=".8"/>`;
  }

  /* ---------- buttons ---------- */
  /* Screen-reader name: the Chinese words Anna says for that button (ui_<name> in lines.json); `fallback` when there is none. */
  function uxLabel(ui, fallback) {
    const t = ui ? lineText('ui_' + ui)[0] : '';
    return String(t || fallback || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }
  /* layoutHitRadius lives in src/lib/layout.js; a page or test that loads 70-ui without that lib still gets the same floor (30 = 64 CSS px). */
  const uxHitRadius = (r, ring) => (typeof layoutHitRadius === 'function' ? layoutHitRadius(r, ring) : Math.max(r + (ring ? 8 : 0), 30));
  /* o: { act, ui, icon, x, y, r, plate: 'light'|'gold'|'dark', cls, keep (tabbable: default true), ring }
     The picture is r big, but the part that takes a tap is never smaller than 64 CSS px on the reference tablet (layoutHitRadius):
     a small plate (the parent gear, the back arrows) keeps its looks and gets an invisible, larger touch area. cls 'ux-minor' marks
     a button that is not one of the screen's few main buttons. */
  function uxButton(o) {
    const r = o.r || 36, plate = o.plate || 'light';
    const fill = plate === 'gold' ? 'url(#goldGrad)' : plate === 'dark' ? '#141c52' : 'url(#plateGrad)';
    const stroke = plate === 'gold' ? '#fff3c9' : plate === 'dark' ? '#cfe6ff' : '#ffffff';
    const ink = plate === 'dark' ? '#f6f7ff' : uxInk;
    const ring = o.ring ? `<circle class="ux-ring" r="${r + 5}" fill="none" stroke="#ffd27a" stroke-width="5" stroke-linecap="round" stroke-dasharray="${(2 * Math.PI * (r + 5)).toFixed(1)}" style="--len:${(2 * Math.PI * (r + 5)).toFixed(1)}"/>` : '';
    return `<g transform="translate(${o.x} ${o.y})"><g class="ux-btn ${o.cls || ''}" data-act="${o.act}" data-ui="${o.ui || ''}" tabindex="${o.keep === false ? -1 : 0}" role="button" aria-label="${uxLabel(o.ui, o.act)}">
      <circle r="${uxHitRadius(r, o.ring)}" fill="#000" fill-opacity="0" pointer-events="all"/>
      <circle class="ux-plate" r="${r}" fill="${fill}" fill-opacity="${plate === 'dark' ? .78 : 1}" stroke="${stroke}" stroke-width="3" filter="url(#softShadow)"/>${ring}
      ${uxIcon(o.icon || o.act, r, ink)}</g></g>`;
  }
  /* Make an element a hoverable button: scale (CSS .ux-btn / .ux-tile), spoken name, hover tick, optional click. Safe to call twice. */
  function hoverable(el, uiName, onClick) {
    if (!el) return el;
    if (!el.__uxHover) {
      el.__uxHover = true;
      const hov = () => { if (uiName && !story) uxUiVoice(uiName); uxSfx('hover'); };   // a hover name must never cut into a scene's own voice
      el.addEventListener('pointerenter', hov);
      el.addEventListener('focus', () => { try { if (el.matches(':focus-visible')) hov(); } catch (e) {} });
    }
    if (onClick) {
      el.addEventListener('click', ev => { ev.stopPropagation(); uxWake(); uxSfx('click'); if (el.getAttribute('tabindex') === '-1') el.blur(); onClick(el, ev); });
      el.addEventListener('keydown', ev => {
        if ((ev.code === 'Enter' || ev.code === 'Space' || ev.code === 'NumpadEnter') && !ev.repeat) { ev.preventDefault(); ev.stopPropagation(); el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
      });
    }
    return el;
  }
  /* Wire every .ux-btn / .ux-tile / .ux-card under root: data-act picks the handler out of acts, data-ui is the spoken name. */
  function uxBind(root, acts) {
    root.querySelectorAll('.ux-btn, .ux-tile, .ux-card').forEach(n => {
      const act = n.dataset.act, fn = acts && acts[act];
      hoverable(n, n.dataset.ui, fn ? (el, ev) => fn(el, ev) : null);
    });
  }
  function uxNudge(el) {
    if (!el) return;
    el.classList.remove('ux-wig'); void el.getBoundingClientRect(); el.classList.add('ux-wig');
  }
  /* Press-and-hold: the ring fills for ms, then fn runs. Releasing early cancels. */
  function uxHold(el, ms, fn) {
    if (!el || el.__uxHold) return;
    el.__uxHold = true;
    let t = null;
    const start = ev => {
      if (ev.button) return;
      ev.stopPropagation(); uxWake();
      if (el.getAttribute('tabindex') === '-1' && ev.preventDefault) ev.preventDefault();
      el.style.setProperty('--hold', ms + 'ms'); el.classList.add('ux-hold');
      clearTimeout(t);
      t = setTimeout(() => { t = null; el.classList.remove('ux-hold'); fn(); }, ms);
    };
    const stop = () => { if (t) { clearTimeout(t); t = null; } el.classList.remove('ux-hold'); };
    el.addEventListener('pointerdown', start);
    for (const n of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(n, stop);
    el.addEventListener('click', ev => { ev.stopPropagation(); uxNudge(el); });
    el.addEventListener('keydown', ev => { if ((ev.code === 'Enter' || ev.code === 'Space') && !ev.repeat) { ev.preventDefault(); ev.stopPropagation(); start(ev); } });
    el.addEventListener('keyup', stop);
  }

  /* ---------- word cards ---------- */
  /* Card with picture and English word. o: { x, y, w, h, silhouette, isNew, label (default true), show, act } */
  function uxWordCard(wd, o) {
    const w = o.w || 190, h = o.h || 190, label = o.label !== false, gray = !!o.silhouette;
    const side = Math.min(w - 28, h - (label ? 64 : 28)), ix = (w - side) / 2, iy = 14;
    const ph = uxBlob(wd.id, w / 2, iy + side / 2, side * .38, gray);
    const pic = uxPic(wd.icon || 'word_' + wd.id, ix, iy, side, side, ph, gray ? 'filter="url(#silhouette)"' : '');
    const badge = o.isNew ? `<g transform="translate(${w - 18} 14) rotate(12)"><path d="M0 -30L8 -14L26 -18L16 -2L30 10L12 14L10 30L-4 18L-20 26L-16 8L-30 -4L-12 -8Z" fill="#ff6b9a" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><path d="M0 -13L3.5 -3.5L13 0L3.5 3.5L0 13L-3.5 3.5L-13 0L-3.5 -3.5Z" fill="#fff"/></g>` : '';
    const txt = label ? `<text class="latin" x="${w / 2}" y="${h - 20}" text-anchor="middle" font-size="${wd.en.length > 8 ? 26 : 32}" fill="${gray ? '#8d96bd' : '#3b2a6b'}">${wd.en}</text>` : '';
    return `<g transform="translate(${o.x} ${o.y})"><g class="ux-pop ${o.show ? 'show' : ''}" data-pop="${o.slot == null ? '' : o.slot}">
      <g class="ux-card" data-act="${o.act || 'word'}" data-word="${wd.id}" data-ui="" tabindex="0" role="button" lang="en" aria-label="${wd.en}">
        <rect class="ux-glowrect" x="-8" y="-8" width="${w + 16}" height="${h + 16}" rx="28" fill="none" stroke="#ffe27a" stroke-width="7" opacity="0"/>
        <rect class="ux-frame" width="${w}" height="${h}" rx="22" fill="#fffaf0" stroke="#ffd27a" stroke-width="4" filter="url(#softShadow)"/>
        ${pic}${txt}${badge}</g></g></g>`;
  }
  function uxConfetti(parent, x, y, n) {
    if (!parent) return;
    let s = '';
    const cols = ['#ff7aa8', '#ffd27a', '#8fd0ff', '#b8f09a', '#d4a8ff', '#fff'];
    for (let i = 0; i < (n || 30); i++) {
      const a = Math.random() * Math.PI * 2, d = 90 + Math.random() * 230;
      const dx = Math.cos(a) * d, dy = Math.sin(a) * d * .8 + 120 * Math.random(), rot = Math.round((Math.random() - .5) * 720);
      const c = cols[i % cols.length], sz = 7 + Math.random() * 8;
      const shape = i % 3 === 0 ? `<circle cx="${x}" cy="${y}" r="${(sz / 2).toFixed(1)}" fill="${c}"/>` : i % 3 === 1 ? `<rect x="${x}" y="${y}" width="${sz.toFixed(1)}" height="${(sz * .6).toFixed(1)}" fill="${c}"/>` : `<image href="${SRC('fx_star')}" x="${x - 9}" y="${y - 9}" width="18" height="18"/>`;
      s += `<g class="ux-conf" style="--dx:${dx.toFixed(0)}px;--dy:${dy.toFixed(0)}px;--rot:${rot}deg;animation-delay:${(Math.random() * .15).toFixed(2)}s">${shape}</g>`;
    }
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('pointer-events', 'none');
    parent.appendChild(g);
    g.innerHTML = s;
    setTimeout(() => g.remove(), 1900);
  }

  /* ---------- screens: shared plumbing ---------- */
  function uxInit() {
    if (uxState.inited) return;
    uxState.inited = true;
    try { if (typeof onSubtitle === 'function') onSubtitle(subtitleView); } catch (e) {}
    uxApplySettings();
  }
  /* A new screen replaces the previous one; async sequences compare tok to stop when the screen changed. */
  function uxScreen(name, isStory) {
    uxInit();
    const tok = { name, onKey: null };
    uxState.tok = tok;
    story = isStory ? tok : null;
    return tok;
  }
  const uxAlive = tok => uxState.tok === tok;
  function uxPaint(html) {
    const root = $('overlay');
    root.innerHTML = html;
    return root;
  }
  function uxClearOverlay() { $('overlay').textContent = ''; $('modal').textContent = ''; uxState.modal = null; }
  function uxInputReset() { try { if (typeof clearInput === 'function') clearInput(); } catch (e) {} }
  function uxApplySettings() {
    const on = !!uxSetting('subtitles'), b = document.body;
    const changed = b.classList.contains('subs') !== on;
    b.classList.toggle('subs', on);
    b.dataset.mode = uxSetting('mode') === 'duo' ? 'duo' : 'solo';
    if (!on) subtitleView(null);
    if (changed) dispatchEvent(new Event('resize'));   // 80-input refits the stage around the parent strip
  }
  /* The play flow belongs to 90-main: startGame(i) / goTitle() / enterRoom(i). These wrappers only keep this file
     usable if one of them is renamed (a plain game.start, no recall or chapter card). */
  const uxHooks = {
    play(i) {
      if (typeof startGame === 'function') { startGame(i); return; }
      uxClearOverlay(); story = null; uxState.tok = null;
      game.start(i === undefined ? 0 : i);
    },
    replay(i) {
      if (typeof enterRoom === 'function') { enterRoom(i); return; }
      uxHooks.play(i);
    },
    home() {
      if (typeof goTitle === 'function') { goTitle(); return; }
      uxStopVoice(); uxClearOverlay(); story = null;
      game.state = 'title'; try { game.load(0); } catch (e) {}
      showTitle();
    },
  };

  /* ---------- title ---------- */
  /* Four main buttons (start, rooms, wordbook, sticker book; PLAN D3). The two small corner buttons are not main buttons: "meet the
     sisters" (the wardrobe is a button inside that page) and the parent gear (a 2 s hold). */
  function showTitle() {
    const tok = uxScreen('title', false);
    uxClearOverlay();
    let cont = false;
    try { cont = !!(save.flags && save.flags.prologue) || LEVELS.some((_, i) => uxCleared(i)); } catch (e) {}
    const html = `<g class="page">
      <image href="${SRC('key')}" width="960" height="520" preserveAspectRatio="xMidYMid slice"/>
      <rect width="960" height="520" fill="url(#topFade)"/>
      <text x="480" y="92" text-anchor="middle" font-size="62" fill="#fffdf4" stroke="#1b2559" stroke-width="8" paint-order="stroke" stroke-linejoin="round">艾莎和安娜的冰堡</text>
      ${uxButton({ act: 'play', ui: cont ? 'continue' : 'start', icon: 'play', x: 480, y: 318, r: 66, plate: 'gold', cls: 'ux-pulse' })}
      ${uxButton({ act: 'rooms', ui: 'rooms', x: 372, y: 448, r: 36 })}
      ${uxButton({ act: 'words', ui: 'words', x: 480, y: 448, r: 36 })}
      ${uxButton({ act: 'stickers', ui: 'stickers', x: 588, y: 448, r: 36 })}
      ${uxButton({ act: 'meet', ui: 'meet', x: 42, y: 482, r: 24, cls: 'ux-minor' })}
      ${uxButton({ act: 'gear', ui: 'settings', icon: 'gear', x: 920, y: 484, r: 20, plate: 'dark', ring: true, cls: 'ux-minor' })}
    </g>`;
    const root = uxPaint(html);
    uxBind(root, {
      play: () => uxHooks.play(),
      rooms: () => showRooms(),
      words: () => showWordbook(),
      meet: () => showMeet(),
      stickers: el => { if (typeof showStickers === 'function') showStickers(); else uxNudge(el); },
      gear: null,
    });
    const gear = root.querySelector('[data-act="gear"]');
    uxHold(gear, 2000, () => { if (uxAlive(tok)) showSettings(); });
    try { if (typeof startMusic === 'function') startMusic('title'); } catch (e) {}
  }
  function hideTitle() {
    const t = uxState.tok;
    if (t && ['title', 'rooms', 'words', 'meet'].includes(t.name)) { uxState.tok = null; uxClearOverlay(); }
  }

  /* ---------- rooms ---------- */
  /* One tile per room: its picture plus 1-4 dots (position in its row of four, colour by row), earned stars underneath. */
  function showRooms() {
    uxScreen('rooms', false);
    const cols = 4, rows = Math.ceil(LEVELS.length / cols), k = rows > 2 ? .88 : 1, tw = 176 * k, th = 99 * k, gx = 28, rowH = th + 40;
    const x0 = (960 - (cols * tw + (cols - 1) * gx)) / 2, y0 = 70 + (450 - (rows * rowH - 12)) / 2;
    const hues = ['#ffd27a', '#ff9cc0', '#9fd6ff'];
    const tiles = LEVELS.map((lv, i) => {
      const col = i % cols, row = Math.floor(i / cols), x = x0 + col * (tw + gx), y = y0 + row * rowH;
      const open = uxUnlocked(i), st = uxRoomSave(lv.id).stars || [];
      const dots = Array.from({ length: col + 1 }, (_, k) => `<circle cx="${12 + k * 18}" cy="${th + 16}" r="6.5" fill="${hues[row % 3]}" stroke="#fff" stroke-width="1.5"/>`).join('');
      const stars = [0, 1, 2].map(k => `<path transform="translate(${tw - 66 + k * 24} ${th + 16}) scale(10)" d="M0 -.8L.22 -.25L.8 -.22L.35 .15L.5 .72L0 .4L-.5 .72L-.35 .15L-.8 -.22L-.22 -.25Z" fill="${st[k] ? '#ffd27a' : '#3b4a96'}" opacity="${st[k] ? 1 : .6}"/>`).join('');
      return `<g transform="translate(${x} ${y})"><g class="ux-tile ${open ? '' : 'locked'}" data-act="room" data-room="${i}" data-ui="room_${lv.id}" tabindex="0" role="button" aria-label="${uxLabel('room_' + lv.id, 'room ' + (i + 1))}">
        <rect class="ux-frame" x="-4" y="-4" width="${tw + 8}" height="${th + 8}" rx="14" fill="#fffaf0" stroke="${open ? '#ffd27a' : '#6a76b8'}" stroke-width="3" filter="url(#softShadow)"/>
        <image href="${SRC(lv.bg)}" width="${tw}" height="${th}" preserveAspectRatio="xMidYMid slice" clip-path="inset(0 round 10px)"/>
        ${open ? '' : `<rect width="${tw}" height="${th}" rx="10" fill="#0d1438" opacity=".6"/><g transform="translate(${tw / 2} ${th / 2}) scale(22)">${uxGlyph('lock', '#e8ecff')}</g>`}
        ${dots}${open ? stars : ''}</g></g>`;
    }).join('');
    const html = `<g class="page"><image href="${SRC('bg0')}" width="960" height="520" preserveAspectRatio="xMidYMid slice"/><rect width="960" height="520" fill="#0d1438" opacity=".62"/>
      ${tiles}${uxButton({ act: 'back', ui: 'back', x: 52, y: 44, r: 28 })}</g>`;
    const root = uxPaint(html);
    uxBind(root, {
      back: () => showTitle(),
      room: el => { const i = +el.dataset.room; if (uxUnlocked(i)) uxHooks.play(i); else uxNudge(el); },
    });
  }

  /* ---------- meet them ---------- */
  function showMeet() {
    const tok = uxScreen('meet', false);
    const ppl = [{ id: 'frost', name: 'Elsa · 艾莎', x: 270, hue: '#cfe6ff' }, { id: 'nuan', name: 'Anna · 安娜', x: 690, hue: '#ffd9a8' }];
    const cards = ppl.map(p => `<g transform="translate(${p.x} 0)"><g class="ux-card-wrap" data-person="${p.id}">
      <clipPath id="uxClip_${p.id}"><rect x="-135" y="76" width="270" height="360" rx="22"/></clipPath>
      <ellipse cx="0" cy="456" rx="130" ry="14" fill="#0d1438" opacity=".4"/>
      <g class="ux-person" data-act="person" data-who="${p.id}" tabindex="0" role="button" aria-label="${p.name}" style="cursor:pointer" data-ui="">
        <rect x="-135" y="76" width="270" height="360" rx="22" fill="${p.hue}" filter="url(#softShadow)"/>
        <text x="0" y="64" text-anchor="middle" fill="#fffdf4" font-size="26">${p.name}</text><g clip-path="url(#uxClip_${p.id})">${uxPic('portrait_' + p.id, -135, 76, 270, 360, `<rect x="-135" y="76" width="270" height="360" fill="${p.hue}" opacity=".8"/>`)}</g>
        <rect x="-135" y="76" width="270" height="360" rx="22" fill="none" stroke="${p.hue}" stroke-width="6"/>
      </g></g></g>`).join('');
    const html = `<g class="page"><image href="${SRC('bg0')}" width="960" height="520" preserveAspectRatio="xMidYMid slice"/><rect width="960" height="520" fill="#0d1438" opacity=".55"/>
      ${cards}${uxButton({ act: 'wardrobe', ui: 'wardrobe', x: 480, y: 290, r: 42 })}${uxButton({ act: 'back', ui: 'back', x: 52, y: 44, r: 28 })}</g>`;
    const root = uxPaint(html);
    uxBind(root, {
      back: () => { uxStopVoice(); showTitle(); },
      wardrobe: el => { uxStopVoice(); if (typeof showWardrobe === 'function') showWardrobe(true); else uxNudge(el); },
    });
    root.querySelectorAll('.ux-person').forEach(/** @param {HTMLElement} n */ n => {
      n.addEventListener('click', ev => {
        ev.stopPropagation(); uxWake();
        const who = n.dataset.who;
        root.querySelectorAll('.ux-person').forEach(m => m.classList.remove('ux-bob'));
        n.classList.add('ux-bob');
        uxLine('me_' + who).then(() => { if (uxAlive(tok)) n.classList.remove('ux-bob'); });
      });
      n.addEventListener('keydown', ev => { if ((ev.code === 'Enter' || ev.code === 'Space') && !ev.repeat) { ev.preventDefault(); ev.stopPropagation(); n.dispatchEvent(new MouseEvent('click', { bubbles: true })); } });
    });
  }

  /* ---------- wordbook ---------- */
  function uxBookPages() {
    const pages = [], all = uxAllWords();
    LEVELS.forEach(lv => {
      const ws = all.filter(w => w.room === lv.id);
      pages.push({ lv, words: (ws.length ? ws : uxRoomWords(lv)).slice(0, 3) });
    });
    const general = all.filter(w => !w.room);
    for (let i = 0; i < general.length; i += 3) pages.push({ lv: null, words: general.slice(i, i + 3) });
    return pages.filter(p => p.words.length);
  }
  function showWordbook(pageNo) {
    const tok = uxScreen('words', false);
    const pages = uxBookPages();
    let cur = Math.max(0, Math.min(pages.length - 1, pageNo || 0));
    const draw = () => {
      const pg = pages[cur];
      if (!pg) { showTitle(); return; }
      const n = pg.words.length, cw = 200, ch = 240, gap = 30, x0 = (960 - (n * cw + (n - 1) * gap)) / 2;
      const cards = pg.words.map((wd, k) => uxWordCard(wd, { x: x0 + k * (cw + gap), y: 150, w: cw, h: ch, silhouette: !uxWordKnown(wd.id), show: true })).join('');
      const head = pg.lv ? `<image href="${SRC(pg.lv.bg)}" x="400" y="26" width="160" height="90" preserveAspectRatio="xMidYMid slice" clip-path="inset(0 round 12px)"/><rect x="400" y="26" width="160" height="90" rx="12" fill="none" stroke="#ffd27a" stroke-width="3"/>`
        : `<g transform="translate(480 70) scale(34)">${uxGlyph('star')}</g>`;
      const dots = pages.map((_, k) => `<circle cx="${480 + (k - (pages.length - 1) / 2) * 16}" cy="478" r="${k === cur ? 6 : 4}" fill="${k === cur ? '#ffd27a' : '#8090d6'}"/>`).join('');
      const playable = uxReviewPool().length >= 3;   // the review game needs three words to choose between
      const html = `<g class="page"><image href="${SRC('bg0')}" width="960" height="520" preserveAspectRatio="xMidYMid slice"/><rect width="960" height="520" fill="#0d1438" opacity=".6"/>
        ${head}${cards}${dots}
        ${uxButton({ act: 'back', ui: 'back', x: 52, y: 44, r: 28 })}
        ${uxButton({ act: 'review', ui: 'start', icon: 'ear', x: 906, y: 50, r: 34, plate: 'gold', cls: playable ? '' : 'dim' })}
        ${cur > 0 ? `<g transform="translate(54 270) scale(-1 1)">${uxButton({ act: 'prev', ui: 'back', icon: 'next', x: 0, y: 0, r: 34 })}</g>` : ''}
        ${cur < pages.length - 1 ? uxButton({ act: 'nextpage', ui: 'next', icon: 'next', x: 906, y: 270, r: 34 }) : ''}</g>`;
      const root = uxPaint(html);
      uxBind(root, {
        back: () => { uxStopVoice(); showTitle(); },
        prev: () => { cur--; draw(); },
        nextpage: () => { cur++; draw(); },
        review: el => {
          if (!playable) { uxNudge(el); return; }
          uxStopVoice();
          showReview(() => showWordbook(cur));
        },
        word: el => {
          const id = el.dataset.word;
          const was = uxWordKnown(id);
          uxNudge(el);
          if (!was && !uxWordOpen(id)) return;   // a silhouette of a room not opened yet: hearing it would count as learned
          uxWordVoice(id).then(() => {
            if (!uxAlive(tok) || was) return;
            draw();
          });
        },
      });
    };
    draw();
  }

  /* ---------- parent settings ---------- */
  /* Learning progress for the parent page (PLAN-2 C5): per core word, how often it was heard, the share of quiz questions
     answered right at the first tap (null before the first question) and how many rooms ago it was last met (null: never
     stamped). `lastSeen` is the room clock, not a date: the save has no wall clock. */
  function uxProgressRows() {
    const now = save.roomClock || 0;
    return LEVELS.map(lv => ({
      room: lv.id,
      words: (lv.words || []).map(id => {
        const w = save.words[id] || {}, tries = (w.quiz || 0) + (w.wrong || 0);
        return {
          id, en: uxWord(id).en, heard: w.heard || 0,
          accuracy: tries ? Math.round(100 * (w.quiz || 0) / tries) : null,
          ago: w.lastSeen > 0 ? Math.max(0, now - w.lastSeen) : null,
        };
      }),
    }));
  }
  function uxPlayTimeText(sec) {
    const total = Math.max(0, Math.floor(sec || 0)), m = Math.floor(total / 60);
    if (m >= 60) return `${Math.floor(m / 60)} 小时 ${m % 60} 分`;
    return m >= 1 ? `${m} 分 ${total % 60} 秒` : `${total} 秒`;
  }
  function uxProgressHtml() {
    const rows = uxProgressRows(), colW = 288, x0 = 62;
    const head = [0, 1, 2].map(c => `<text x="${x0 + c * colW + 130}" y="112" font-size="15" fill="#a9b6e2" text-anchor="middle">听过</text><text x="${x0 + c * colW + 190}" y="112" font-size="15" fill="#a9b6e2" text-anchor="middle">首答对</text><text x="${x0 + c * colW + 250}" y="112" font-size="15" fill="#a9b6e2" text-anchor="middle">最近</text>`).join('');
    const body = rows.map((r, i) => {
      const y = 126 + i * 34;
      const cells = r.words.map((w, c) => {
        const x = x0 + c * colW, low = w.accuracy !== null && w.accuracy < 60;
        return `<text class="latin" x="${x}" y="${y + 22}" font-size="18" fill="${w.heard ? '#f6f7ff' : '#8d96bd'}">${w.en}</text>
          <text x="${x + 130}" y="${y + 22}" font-size="17" fill="${w.heard ? '#f6f7ff' : '#8d96bd'}" text-anchor="middle">${w.heard}</text>
          <text x="${x + 190}" y="${y + 22}" font-size="17" fill="${low ? '#ffb1c9' : '#f6f7ff'}" text-anchor="middle">${w.accuracy === null ? '—' : w.accuracy + '%'}</text>
          <text x="${x + 250}" y="${y + 22}" font-size="15" fill="#c9d3f5" text-anchor="middle">${w.ago === null ? '—' : w.ago === 0 ? '刚刚' : w.ago + ' 间前'}</text>`;
      }).join('');
      return `<rect x="50" y="${y}" width="860" height="32" rx="10" fill="#1b2563" opacity="${i % 2 ? 0 : .7}"/>${cells}`;
    }).join('');
    return `<g class="page"><rect width="960" height="520" fill="#0d1438" opacity=".7"/>
      <rect x="30" y="20" width="900" height="480" rx="24" fill="#141c52" stroke="#4a5aa6" stroke-width="2"/>
      <text x="480" y="70" text-anchor="middle" font-size="30" fill="#f6f7ff">学习进度</text>
      <text x="880" y="70" text-anchor="end" font-size="20" fill="#ffd27a">累计游玩 ${uxPlayTimeText(save.totalPlaySeconds)}</text>
      ${head}${body}
      ${uxButton({ act: 'back', ui: 'back', icon: 'back', x: 78, y: 50, r: 28, plate: 'dark' })}</g>`;
  }

  const UX_OPT_H = 62;   // a settings option is a button too: 62 stage units are 66 CSS px on the reference tablet
  function showSettings(view) {
    uxInit();
    uxInputReset();
    let page = view === 'progress' ? 'progress' : 'main';
    const render = () => {
      const root = $('modal');
      if (page === 'progress') {
        root.innerHTML = uxProgressHtml();
        uxBind(root, { back: () => { page = 'main'; render(); } });
        return;
      }
      const opt = (key, val, x, y, w, label, icon) => {
        const cur = uxSetting(key), on = (cur === val) || (typeof val === 'boolean' && !!cur === val);
        return `<g transform="translate(${x} ${y})"><g class="ux-opt ux-btn" data-act="set" data-key="${key}" data-val="${val}" data-ui="" tabindex="0" role="button" aria-label="${label}">
          <rect class="ux-bg" width="${w}" height="${UX_OPT_H}" rx="14" fill="${on ? '#ffd27a' : '#27357f'}" stroke="${on ? '#fff3c9' : '#4a5aa6'}" stroke-width="2"/>
          ${icon ? `<g transform="translate(26 ${UX_OPT_H / 2}) scale(17)">${uxGlyph(icon, on ? '#4a2c05' : '#f6f7ff')}</g>` : ''}
          <text x="${icon ? w / 2 + 14 : w / 2}" y="${UX_OPT_H / 2 + 8}" text-anchor="middle" font-size="20" fill="${on ? '#4a2c05' : '#f6f7ff'}">${label}</text></g></g>`;
      };
      const row = (y, label, opts) => `<text x="206" y="${y + UX_OPT_H / 2 + 8}" font-size="23" fill="#ffd27a">${label}</text>${opts}`;
      root.innerHTML = `<g class="page"><rect width="960" height="520" fill="#0d1438" opacity=".7"/>
        <rect x="150" y="30" width="660" height="450" rx="24" fill="#141c52" stroke="#4a5aa6" stroke-width="2"/>
        <text x="480" y="80" text-anchor="middle" font-size="30" fill="#f6f7ff">家长设置</text>
        ${row(100, '字幕', opt('subtitles', false, 336, 100, 216, '关') + opt('subtitles', true, 566, 100, 216, '开'))}
        ${row(170, '英文', opt('english', 'words', 336, 170, 216, '只念单词') + opt('english', 'words+phrases', 566, 170, 216, '单词 + 短语'))}
        ${row(240, '模式', opt('mode', 'solo', 336, 240, 216, '一个人玩', 'solo') + opt('mode', 'duo', 566, 240, 216, '和大人一起玩', 'duo'))}
        ${row(310, '声音', opt('sound', true, 336, 310, 216, '开') + opt('sound', false, 566, 310, 216, '关'))}
        <g transform="translate(336 394)"><g class="ux-opt ux-btn" data-act="progress" data-ui="" tabindex="0" role="button" aria-label="学习进度">
          <rect class="ux-bg" width="446" height="${UX_OPT_H}" rx="14" fill="#27357f" stroke="#4a5aa6" stroke-width="2"/>
          <g transform="translate(40 ${UX_OPT_H / 2}) scale(17)">${uxGlyph('words', '#f6f7ff')}</g>
          <text x="243" y="${UX_OPT_H / 2 + 8}" text-anchor="middle" font-size="20" fill="#f6f7ff">学习进度</text></g></g>
        ${uxButton({ act: 'close', ui: 'back', icon: 'close', x: 806, y: 30, r: 28, plate: 'dark' })}</g>`;
      uxBind(root, {
        close: () => { root.textContent = ''; uxState.modal = null; },
        progress: () => { page = 'progress'; render(); },
        set: el => {
          const v = el.dataset.val;
          uxPutSetting(el.dataset.key, v === 'true' ? true : v === 'false' ? false : v);
          uxApplySettings(); render();
        },
      });
    };
    uxState.modal = { name: 'settings' };
    render();
  }

  /* ---------- subtitles (parents) ---------- */
  function subtitleView(sub) {
    const box = $('subs');
    if (!box) return;
    if (!sub || sub.bubble || !uxSetting('subtitles') || !sub.segments || !sub.segments.length) { box.textContent = ''; return; }   // sub.bubble: a sister speaking in play, 50-talk draws that one above her head
    const SIZE = 22, maxW = 640;
    const toks = [];
    for (const seg of sub.segments) {
      if (seg.en) toks.push({ t: seg.text, en: true, w: seg.text.length * 15 + 8 });
      else for (const ch of seg.text) toks.push({ t: ch, en: false, w: ch.charCodeAt(0) < 128 ? 12 : SIZE });
    }
    const lines = [[]]; let wsum = 0;
    for (const t of toks) {
      if (wsum + t.w > maxW && lines[lines.length - 1].length && !'，。、！？：；」…'.includes(t.t)) { lines.push([]); wsum = 0; }
      lines[lines.length - 1].push(t); wsum += t.w;
    }
    const width = Math.max(...lines.map(l => l.reduce((a, t) => a + t.w, 0))) + 56, h = lines.length * 36 + 20;
    const cx = 450, y = 506 - h;
    const hue = sub.who === 'frost' ? '#8fb6ea' : sub.who === 'nuan' ? '#e2a45e' : '#b9a8ff';
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const text = lines.map((l, i) => {
      let spans = '';
      for (const t of l) spans += t.en ? `<tspan class="latin" font-size="${SIZE + 4}" fill="#ffd27a" text-decoration="underline">${esc(t.t)}</tspan>` : `<tspan fill="#f6f7ff">${esc(t.t)}</tspan>`;
      return `<text x="${cx}" y="${y + 36 + i * 36 - 8}" text-anchor="middle" font-size="${SIZE}" xml:space="preserve">${spans}</text>`;
    }).join('');
    box.innerHTML = `<rect x="${cx - width / 2}" y="${y}" width="${width}" height="${h}" rx="16" fill="#0d1438" opacity=".82" stroke="${hue}" stroke-width="2"/>${text}`;
  }

  /* ---------- HUD ---------- */
  const UX_PILLS = [
    { id: 'flake', img: 'flake', col: '#cfe6ff' }, { id: 'heart', img: 'heart', col: '#ffb1c9' }, { id: 'ball', img: 'ball', col: '#f6f7ff' },
    { id: 'block', img: 'iceblock', col: '#cfe6ff' }, { id: 'star', img: 'fx_star', col: '#ffe4a8' },
  ];
  const UX_KEYS = [
    { id: 'left', kbd: 'l', x: 836, y: 466, w: 36 }, { id: 'right', kbd: 'r', x: 916, y: 466, w: 36 },
    { id: 'up', kbd: 'up', x: 876, y: 426, w: 36 }, { id: 'space', kbd: 'space', x: 696, y: 466, w: 132 },
  ];
  /* The four round buttons of the top bar, 68 apart: 30 stage units of plate is 64 CSS px on the reference tablet and the hold rings
     (restart, home) widen the touch area, so they must not crowd each other. The key diagram may reach up to the first of them. */
  const UX_HUD_X = { restart: 700, home: 768, hint: 836, fs: 904 };
  function buildHud() {
    uxInit();
    const keys = UX_KEYS.map(k => {
      const r = 8;
      return `<g transform="translate(${k.x + k.w / 2} ${k.y + 18})"><g class="ux-key" id="uxK_${k.id}"><g transform="translate(${-k.w / 2} -18)">
        <rect class="kb" width="${k.w}" height="36" rx="${r}" fill="#27357f" stroke="#cfe6ff" stroke-width="2" opacity=".82"/>
        <g transform="translate(${k.w / 2} 18)">${uxPic('ui_key_' + k.id, -k.w / 2 + 3, -15, k.w - 6, 30, `<g transform="scale(${k.id === 'space' ? 13 : 12})">${uxGlyph('key_' + k.id, '#f6f7ff')}</g>`)}</g></g></g></g>`;
    }).join('');
    const pills = UX_PILLS.map(p => `<g id="uxP_${p.id}" visibility="hidden"><rect width="84" height="38" rx="19" fill="#141c52" opacity=".76"/>
      <image href="${SRC(p.img)}" x="8" y="5" width="28" height="28" preserveAspectRatio="xMidYMid meet"/><text class="latin" x="44" y="27" font-size="20" fill="${p.col}"></text></g>`).join('');
    $('hud').innerHTML = `<g id="uxHud" visibility="hidden">
      <g id="uxAvatars" transform="translate(38 38)">
        <g transform="translate(0 0)"><g id="uxAv" role="img" aria-label="艾莎，安娜陪伴">
          <circle r="34" fill="#000" fill-opacity="0" pointer-events="all"/>
          <circle r="29" fill="${'#ffd27a'}" stroke="#fff" stroke-width="3" filter="url(#softShadow)"/>
          <clipPath id="uxClipA"><circle r="25"/></clipPath>
          <g clip-path="url(#uxClipA)"><rect x="-25" y="-25" width="50" height="50" fill="#cfe0ff"/><image id="uxAvImg" x="-25" y="-25" width="50" height="50" preserveAspectRatio="xMidYMin slice"/></g>
          <g id="uxAvOther" transform="translate(30 20)"><circle r="14" fill="#cfe0ff" stroke="#fff" stroke-width="2" opacity=".95"/><clipPath id="uxClipB"><circle r="12"/></clipPath><image id="uxAvImg2" x="-12" y="-12" width="24" height="24" preserveAspectRatio="xMidYMin slice" clip-path="url(#uxClipB)"/></g>
        </g></g></g>
      <g id="uxPills" transform="translate(98 19)">${pills}</g>
      ${typeof restartRoomHeld === 'function' ? uxButton({ act: 'restart', ui: 'replay', icon: 'replay', x: UX_HUD_X.restart, y: 38, r: 30, plate: 'dark', keep: false, ring: true, cls: 'ux-minor' }) : ''}
      ${uxButton({ act: 'home', ui: 'back', icon: 'home', x: UX_HUD_X.home, y: 38, r: 30, plate: 'dark', keep: false, ring: true, cls: 'ux-minor' })}
      ${uxButton({ act: 'hint', ui: 'hint', icon: 'bulb', x: UX_HUD_X.hint, y: 38, r: 30, plate: 'dark', keep: false, cls: 'ux-minor' })}
      ${uxButton({ act: 'fs', ui: 'fullscreen', icon: 'fullscreen', x: UX_HUD_X.fs, y: 38, r: 30, plate: 'dark', keep: false, cls: 'ux-minor' })}
      <g id="uxKeysPos"><g id="uxKeys">${keys}</g></g></g>`;
    const root = $('hud');
    uxBind(root, {
      hint: el => {
        let tgt = null;
        try { tgt = game.guide && game.guide(); } catch (e) {}
        try { if (typeof playMelodyDemo === 'function') playMelodyDemo(.25); } catch (e) {}
        if (tgt && tgt.say) uxLine(tgt.say, { interrupt: true }); else uxNudge(el);
      },
      fs: () => {
        try {
          if (typeof toggleFullscreen === 'function') { toggleFullscreen(); return; }
          const d = document, r = d.documentElement;
          if (d.fullscreenElement) d.exitFullscreen(); else r.requestFullscreen();
        } catch (e) {}
      },
    });
    uxHold(root.querySelector('[data-act="home"]'), 1500, () => uxHooks.home());
    const restart = root.querySelector('[data-act="restart"]');   // a long press, never a tap: a stray finger must not wipe the room
    if (restart) uxHold(restart, 1000, () => { if (typeof restartRoomHeld === 'function') restartRoomHeld(); });
    uxState.hudBuilt = true; uxState.sig = '';
  }

  function hud(g) {
    g = g || game;
    if (!uxState.hudBuilt) buildHud();
    const root = $('uxHud');
    if (!root) return;
    if ((uxState.tick++ & 31) === 0) uxApplySettings();
    const show = g.state !== 'title' && !story && !uxState.modal;
    root.setAttribute('visibility', show ? 'visible' : 'hidden');
    if (!show) return;
    const solo = g.mode !== 'duo';
    /* avatar: the player's portrait big, the companion small */
    const me = 'frost', other = 'nuan';
    if (uxState.player !== me + g.mode) {
      uxState.player = me + g.mode;
      $('uxAvImg').setAttribute('href', SRC('portrait_' + me));
      $('uxAvImg2').setAttribute('href', SRC('portrait_' + other));
      $('uxAv').setAttribute('pointer-events', 'none');
    }
    /* counters with icons; only the kinds this room has, laid out left to right */
    const items = g.items || [];
    const cnt = k => { let a = 0, b = 0; for (const it of items) if (it.kind === k) { b++; if (it.got) a++; } return [a, b]; };
    const [f0, f1] = cnt('*'), [h0, h1] = cnt('h'), [b0, b1] = cnt('o');
    const st = g.stars ? [g.stars.got, g.stars.total] : cnt('+');
    const nb = g.blocks ? g.blocks.length : 0;
    const vals = { flake: [f0 + '/' + f1, f1 > 0], heart: [h0 + '/' + h1, h1 > 0], ball: [b0 + '/' + b1, b1 > 0], block: [nb + '/' + (typeof MAX_BLOCKS !== 'undefined' ? MAX_BLOCKS : 3), nb > 0], star: [st[0] + '/' + st[1], st[1] > 0] };
    let x = 0;
    for (const p of UX_PILLS) {
      const [txt, vis] = vals[p.id], n = $('uxP_' + p.id);
      if (!vis) { if (n.getAttribute('visibility') !== 'hidden') n.setAttribute('visibility', 'hidden'); continue; }
      if (n.getAttribute('visibility') !== 'visible') n.setAttribute('visibility', 'visible');
      n.setAttribute('transform', `translate(${x} 0)`);
      const t = n.lastElementChild;
      if (t.textContent !== txt) t.textContent = txt;
      x += 92;
    }
    /* keyboard diagram (solo only): game.kbd is kept by 80-input, teach = the key the tutorial asks for. A tap stays lit a moment. */
    /* The diagram rides in the top bar just after the counter pills (off the floor and the door).
       UX_KEYS span x 696..952, y 426..502 in stage units; KB_S keeps even 5 pills + diagram left of the buttons at x 750. */
    const kbX = 98 + x + 12, KB_S = Math.max(.34, Math.min(.62, (typeof restartRoomHeld === 'function' ? UX_HUD_X.restart - 44 - kbX : UX_HUD_X.home - 44 - kbX) / 256));   // 256 = width of UX_KEYS in stage units
    $('uxKeysPos').setAttribute('transform', `translate(${(kbX - 696 * KB_S).toFixed(1)} ${(14 - 426 * KB_S).toFixed(1)}) scale(${KB_S})`);
    const kroot = $('uxKeys'), kbd = g.kbd || {}, now = performance.now();
    kroot.setAttribute('visibility', solo ? 'visible' : 'hidden');
    if (solo) {
      for (const k of UX_KEYS) {
        if (kbd[k.kbd]) uxState.lit[k.id] = now;
        const n = $('uxK_' + k.id);
        n.classList.toggle('lit', !!kbd[k.kbd] || now - (uxState.lit[k.id] || -1e9) < 140);
        n.classList.toggle('teach', kbd.teach === k.kbd);
      }
    }
  }
