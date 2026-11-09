  /* ===== d1 / view-ui: picture-button helpers, HUD, title, rooms, wordbook, meet-them, parent settings, subtitles =====
     Everything here is drawn as SVG strings into #hud / #overlay / #modal / #subs of the 960x520 stage.
     Private names carry the `ux` prefix so they cannot collide with the other view files (one shared scope).
     Cross-file names used (CONTRACT): voice.line/word/ui/stop, sfx, onSubtitle, setting/setSetting, save, markRoom, saveWrite,
     startMusic, wakeAudio, game, LEVELS, LINES, SRC, $. Each one is looked up through a guarded wrapper, so a missing piece
     degrades to silence instead of throwing. Nothing in this file calls into another file while the script is loading. */

  const uxState = { inited: false, tok: null, modal: null, hudBuilt: false, lit: {}, sig: '', player: '', tick: 0, seen: {} };
  const uxLocal = { subtitles: false, english: 'words+phrases', mode: 'solo', player: 'nuan', sound: true };
  const uxWait = ms => new Promise(r => setTimeout(r, ms));
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
  function uxLine(key, opts) {
    let p = null;
    try { if (typeof voice !== 'undefined' && voice && typeof voice.line === 'function') p = voice.line(key, opts); } catch (e) {}
    if (!p || typeof p.then !== 'function') return uxWait(800);
    return Promise.race([p.then(() => {}, () => {}), uxWait(20000)]);
  }
  function uxWordVoice(id) {
    let p = null;
    try { if (typeof voice !== 'undefined' && voice && typeof voice.word === 'function') p = voice.word(id); } catch (e) {}
    if (!p || typeof p.then !== 'function') return uxWait(900);
    return Promise.race([p.then(() => {}, () => {}), uxWait(8000)]);
  }
  function uxUiVoice(name) { try { if (typeof voice !== 'undefined' && voice && typeof voice.ui === 'function') voice.ui(name); } catch (e) {} }
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
  function uxRoomWords(lv) { return ((lv && lv.words) || []).map(uxWord); }
  function uxWordRec(id) {
    try { if (typeof save !== 'undefined' && save) { save.words = save.words || {}; return (save.words[id] = save.words[id] || { heard: 0, quiz: 0 }); } } catch (e) {}
    return (uxState.seen[id] = uxState.seen[id] || { heard: 0, quiz: 0 });
  }
  function uxWordKnown(id) { const r = uxWordRec(id); return !!(r.heard > 0 || r.seen); }
  function uxSaveNow() { try { if (typeof saveWrite === 'function') saveWrite(); } catch (e) {} }
  function uxRoomSave(id) { try { return (save.rooms && save.rooms[id]) || {}; } catch (e) { return {}; } }
  function uxCleared(i) { return !!uxRoomSave((LEVELS[i] || {}).id).cleared; }
  function uxUnlocked(i) {
    if (i === 0) return true;
    try { if (save.unlocked && save.unlocked.rooms > i) return true; } catch (e) {}
    return uxCleared(i - 1);
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
      case 'swap': return `<path d="M-.6 -.25H.5M.15 -.6L.55 -.25L.15 .1M.6 .35H-.5M-.15 0L-.55 .35L-.15 .7" ${st} stroke-width=".15"/>`;
      case 'home': return `<path d="M-.7 0L0 -.7L.7 0M-.5 -.1V.65H.5V-.1" ${st}/>`;
      case 'close': return `<path d="M-.5 -.5L.5 .5M.5 -.5L-.5 .5" ${st} stroke-width=".26"/>`;
      case 'lock': return `<path d="M-.3 -.1V-.35A.3 .3 0 0 1 .3 -.35V-.1" ${st} stroke-width=".16"/><rect x="-.5" y="-.1" width="1" height=".8" rx=".14" ${fl}/>`;
      case 'check': return `<path d="M-.6 .05L-.2 .5L.65 -.5" ${st} stroke-width=".26"/>`;
      default: return `<circle r=".55" ${fl}/>`;
    }
  }
  /* Picture with a placeholder. Browsers draw a broken-image icon for a missing <image>, so a picture is only emitted
     once a probe has loaded it; until then (or if it never exists) the placeholder shapes stand in. A successful probe
     swaps every placeholder of that name that is already on screen. */
  const uxImgState = {};
  function uxProbe(name) {
    if (uxImgState[name]) return;
    uxImgState[name] = 'wait';
    const im = new Image();
    im.onload = () => { uxImgState[name] = 'ok'; uxUpgrade(name); };
    im.onerror = () => { uxImgState[name] = 'bad'; };
    im.src = SRC(name);
  }
  const uxImgTag = (name, x, y, w, h, extra) => `<image href="${SRC(name)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet" ${extra || ''}/>`;
  function uxUpgrade(name) {
    document.querySelectorAll('[data-pic="' + name + '"]').forEach(g => {
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
  const UX_GLYPH_ONLY = ['rooms', 'home', 'close', 'swap', 'lock', 'check'];
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
  /* o: { act, ui, icon, x, y, r, plate: 'light'|'gold'|'dark', cls, keep (tabbable: default true), ring } */
  function uxButton(o) {
    const r = o.r || 36, plate = o.plate || 'light';
    const fill = plate === 'gold' ? 'url(#goldGrad)' : plate === 'dark' ? '#141c52' : 'url(#plateGrad)';
    const stroke = plate === 'gold' ? '#fff3c9' : plate === 'dark' ? '#cfe6ff' : '#ffffff';
    const ink = plate === 'dark' ? '#f6f7ff' : uxInk;
    const ring = o.ring ? `<circle class="ux-ring" r="${r + 5}" fill="none" stroke="#ffd27a" stroke-width="5" stroke-linecap="round" stroke-dasharray="${(2 * Math.PI * (r + 5)).toFixed(1)}" style="--len:${(2 * Math.PI * (r + 5)).toFixed(1)}"/>` : '';
    return `<g transform="translate(${o.x} ${o.y})"><g class="ux-btn ${o.cls || ''}" data-act="${o.act}" data-ui="${o.ui || ''}" tabindex="${o.keep === false ? -1 : 0}" role="button" aria-label="${o.ui || o.act}">
      <circle r="${r + (o.ring ? 8 : 0)}" fill="#000" fill-opacity="0" pointer-events="all"/>
      <circle class="ux-plate" r="${r}" fill="${fill}" fill-opacity="${plate === 'dark' ? .78 : 1}" stroke="${stroke}" stroke-width="3" filter="url(#softShadow)"/>${ring}
      ${uxIcon(o.icon || o.act, r, ink)}</g></g>`;
  }
  /* Make an element a hoverable button: scale (CSS .ux-btn / .ux-tile), spoken name, hover tick, optional click. Safe to call twice. */
  function hoverable(el, uiName, onClick) {
    if (!el) return el;
    if (!el.__uxHover) {
      el.__uxHover = true;
      const hov = () => { if (uiName) uxUiVoice(uiName); uxSfx('hover'); };
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
      <g class="ux-card" data-act="${o.act || 'word'}" data-word="${wd.id}" data-ui="" tabindex="0" role="button" aria-label="${wd.en}">
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
  function showTitle() {
    const tok = uxScreen('title', false);
    uxClearOverlay();
    let cont = false;
    try { cont = !!(save.flags && save.flags.prologue) || LEVELS.some((_, i) => uxCleared(i)); } catch (e) {}
    const html = `<g class="page">
      <image href="${SRC('key')}" width="960" height="520" preserveAspectRatio="xMidYMid slice"/>
      <rect width="960" height="520" fill="url(#topFade)"/>
      <text x="480" y="92" text-anchor="middle" font-size="62" fill="#fffdf4" stroke="#1b2559" stroke-width="8" paint-order="stroke" stroke-linejoin="round">霜霜和暖暖的冰堡</text>
      ${uxButton({ act: 'play', ui: cont ? 'continue' : 'start', icon: 'play', x: 480, y: 318, r: 66, plate: 'gold', cls: 'ux-pulse' })}
      ${uxButton({ act: 'rooms', ui: 'rooms', x: 372, y: 448, r: 36 })}
      ${uxButton({ act: 'words', ui: 'words', x: 480, y: 448, r: 36 })}
      ${uxButton({ act: 'meet', ui: 'meet', x: 588, y: 448, r: 36 })}
      ${uxButton({ act: 'stickers', ui: 'stickers', x: 48, y: 474, r: 30 })}
      ${uxButton({ act: 'wardrobe', ui: 'wardrobe', x: 118, y: 474, r: 30 })}
      ${uxButton({ act: 'gear', ui: 'settings', icon: 'gear', x: 912, y: 474, r: 28, plate: 'dark', ring: true })}
    </g>`;
    const root = uxPaint(html);
    uxBind(root, {
      play: () => uxHooks.play(),
      rooms: () => showRooms(),
      words: () => showWordbook(),
      meet: () => showMeet(),
      stickers: el => { if (typeof showStickers === 'function') showStickers(); else uxNudge(el); },
      wardrobe: el => { if (typeof showWardrobe === 'function') showWardrobe(); else uxNudge(el); },
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
      return `<g transform="translate(${x} ${y})"><g class="ux-tile ${open ? '' : 'locked'}" data-act="room" data-room="${i}" data-ui="room_${lv.id}" tabindex="0" role="button" aria-label="room ${i + 1}">
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
    const ppl = [{ id: 'frost', x: 270, hue: '#cfe6ff' }, { id: 'nuan', x: 690, hue: '#ffd9a8' }];
    const cards = ppl.map(p => `<g transform="translate(${p.x} 0)"><g class="ux-card-wrap" data-person="${p.id}">
      <clipPath id="uxClip_${p.id}"><rect x="-135" y="76" width="270" height="360" rx="22"/></clipPath>
      <ellipse cx="0" cy="456" rx="130" ry="14" fill="#0d1438" opacity=".4"/>
      <g class="ux-person" data-act="person" data-who="${p.id}" tabindex="0" role="button" aria-label="${p.id}" style="cursor:pointer" data-ui="">
        <rect x="-135" y="76" width="270" height="360" rx="22" fill="${p.hue}" filter="url(#softShadow)"/>
        <g clip-path="url(#uxClip_${p.id})">${uxPic('portrait_' + p.id, -135, 76, 270, 360, `<rect x="-135" y="76" width="270" height="360" fill="${p.hue}" opacity=".8"/>`)}</g>
        <rect x="-135" y="76" width="270" height="360" rx="22" fill="none" stroke="${p.hue}" stroke-width="6"/>
      </g></g></g>`).join('');
    const html = `<g class="page"><image href="${SRC('bg0')}" width="960" height="520" preserveAspectRatio="xMidYMid slice"/><rect width="960" height="520" fill="#0d1438" opacity=".55"/>
      ${cards}${uxButton({ act: 'back', ui: 'back', x: 52, y: 44, r: 28 })}</g>`;
    const root = uxPaint(html);
    uxBind(root, { back: () => { uxStopVoice(); showTitle(); } });
    root.querySelectorAll('.ux-person').forEach(n => {
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
      const html = `<g class="page"><image href="${SRC('bg0')}" width="960" height="520" preserveAspectRatio="xMidYMid slice"/><rect width="960" height="520" fill="#0d1438" opacity=".6"/>
        ${head}${cards}${dots}
        ${uxButton({ act: 'back', ui: 'back', x: 52, y: 44, r: 28 })}
        ${cur > 0 ? `<g transform="translate(54 270) scale(-1 1)">${uxButton({ act: 'prev', ui: 'back', icon: 'next', x: 0, y: 0, r: 34 })}</g>` : ''}
        ${cur < pages.length - 1 ? uxButton({ act: 'nextpage', ui: 'next', icon: 'next', x: 906, y: 270, r: 34 }) : ''}</g>`;
      const root = uxPaint(html);
      uxBind(root, {
        back: () => { uxStopVoice(); showTitle(); },
        prev: () => { cur--; draw(); },
        nextpage: () => { cur++; draw(); },
        word: el => {
          const id = el.dataset.word;
          const was = uxWordKnown(id);
          uxNudge(el);
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
  function showSettings() {
    uxInit();
    const render = () => {
      const opt = (key, val, x, y, w, label, icon) => {
        const cur = uxSetting(key), on = (cur === val) || (typeof val === 'boolean' && !!cur === val);
        return `<g class="ux-opt ux-btn" data-act="set" data-key="${key}" data-val="${val}" data-ui="" tabindex="0" role="button" aria-label="${label}" transform="translate(${x} ${y})">
          <rect class="ux-bg" width="${w}" height="56" rx="14" fill="${on ? '#ffd27a' : '#27357f'}" stroke="${on ? '#fff3c9' : '#4a5aa6'}" stroke-width="2"/>
          ${icon ? `<g transform="translate(26 28) scale(17)">${uxGlyph(icon, on ? '#4a2c05' : '#f6f7ff')}</g>` : ''}
          <text x="${icon ? w / 2 + 14 : w / 2}" y="36" text-anchor="middle" font-size="20" fill="${on ? '#4a2c05' : '#f6f7ff'}">${label}</text></g>`;
      };
      const row = (y, label, opts) => `<text x="206" y="${y + 36}" font-size="23" fill="#ffd27a">${label}</text>${opts}`;
      const html = `<g class="page"><rect width="960" height="520" fill="#0d1438" opacity=".7"/>
        <rect x="150" y="40" width="660" height="396" rx="24" fill="#141c52" stroke="#4a5aa6" stroke-width="2"/>
        <text x="480" y="98" text-anchor="middle" font-size="30" fill="#f6f7ff">家长设置</text>
        ${row(124, '字幕', opt('subtitles', false, 336, 124, 216, '关') + opt('subtitles', true, 566, 124, 216, '开'))}
        ${row(200, '英文', opt('english', 'words', 336, 200, 216, '只念单词') + opt('english', 'words+phrases', 566, 200, 216, '单词 + 短语'))}
        ${row(276, '模式', opt('mode', 'solo', 336, 276, 216, '一个人玩', 'solo') + opt('mode', 'duo', 566, 276, 216, '和大人一起玩', 'duo'))}
        ${row(352, '声音', opt('sound', true, 336, 352, 216, '开') + opt('sound', false, 566, 352, 216, '关'))}
        ${uxButton({ act: 'close', ui: 'back', icon: 'close', x: 806, y: 40, r: 28, plate: 'dark' })}</g>`;
      const root = $('modal');
      root.innerHTML = html;
      uxBind(root, {
        close: () => { root.textContent = ''; uxState.modal = null; },
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
        <g transform="translate(0 0)"><g class="ux-btn" id="uxAv" data-act="swap" data-ui="swap" tabindex="-1" role="button" aria-label="swap">
          <circle r="34" fill="#000" fill-opacity="0" pointer-events="all"/>
          <circle r="29" fill="${'#ffd27a'}" stroke="#fff" stroke-width="3" filter="url(#softShadow)"/>
          <clipPath id="uxClipA"><circle r="25"/></clipPath>
          <g clip-path="url(#uxClipA)"><rect x="-25" y="-25" width="50" height="50" fill="#cfe0ff"/><image id="uxAvImg" x="-25" y="-25" width="50" height="50" preserveAspectRatio="xMidYMin slice"/></g>
          <g id="uxAvOther" transform="translate(30 20)"><circle r="14" fill="#cfe0ff" stroke="#fff" stroke-width="2" opacity=".95"/><clipPath id="uxClipB"><circle r="12"/></clipPath><image id="uxAvImg2" x="-12" y="-12" width="24" height="24" preserveAspectRatio="xMidYMin slice" clip-path="url(#uxClipB)"/></g>
        </g></g></g>
      <g id="uxPills" transform="translate(98 19)">${pills}</g>
      ${uxButton({ act: 'home', ui: 'back', icon: 'home', x: 776, y: 38, r: 26, plate: 'dark', keep: false, ring: true })}
      ${uxButton({ act: 'hint', ui: 'hint', icon: 'bulb', x: 836, y: 38, r: 26, plate: 'dark', keep: false })}
      ${uxButton({ act: 'fs', ui: 'fullscreen', icon: 'fullscreen', x: 896, y: 38, r: 26, plate: 'dark', keep: false })}
      <g id="uxKeysPos"><g id="uxKeys">${keys}</g></g></g>`;
    const root = $('hud');
    uxBind(root, {
      swap: () => { try { if (game.mode !== 'solo') return; if (typeof swapPlayer === 'function') swapPlayer(); else game.swap(); } catch (e) {} },
      hint: el => {
        let tgt = null;
        try { tgt = game.guide && game.guide(); } catch (e) {}
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
    const me = solo ? (g.player || 'nuan') : 'nuan', other = me === 'nuan' ? 'frost' : 'nuan';
    if (uxState.player !== me + g.mode) {
      uxState.player = me + g.mode;
      $('uxAvImg').setAttribute('href', SRC('portrait_' + me));
      $('uxAvImg2').setAttribute('href', SRC('portrait_' + other));
      $('uxAv').setAttribute('pointer-events', solo ? 'auto' : 'none');
    }
    /* counters with icons; only the kinds this room has, laid out left to right */
    const items = g.items || [];
    const cnt = k => { let a = 0, b = 0; for (const it of items) if (it.kind === k) { b++; if (it.got) a++; } return [a, b]; };
    const [f0, f1] = cnt('*'), [h0, h1] = cnt('h'), [b0, b1] = cnt('o');
    const st = g.stars ? [g.stars.got, g.stars.total] : cnt('+');
    const nb = g.blocks ? g.blocks.length : 0;
    const vals = { flake: [f0 + '/' + f1, f1 > 0], heart: [h0 + '/' + h1, h1 > 0], ball: [b0 + '/' + b1, b1 > 0], block: [nb + '/' + (typeof MAX_BLOCKS !== 'undefined' ? MAX_BLOCKS : 3), nb > 0], star: [st[0] + '/' + st[1], st[1] > 0] };
    let x = 0, sig = '';
    for (const p of UX_PILLS) {
      const [txt, vis] = vals[p.id], n = $('uxP_' + p.id);
      if (!vis) { if (n.getAttribute('visibility') !== 'hidden') n.setAttribute('visibility', 'hidden'); continue; }
      sig += p.id + txt + '|';
      if (n.getAttribute('visibility') !== 'visible') n.setAttribute('visibility', 'visible');
      n.setAttribute('transform', `translate(${x} 0)`);
      const t = n.lastElementChild;
      if (t.textContent !== txt) t.textContent = txt;
      x += 92;
    }
    /* keyboard diagram (solo only): game.kbd is kept by 80-input, teach = the key the tutorial asks for. A tap stays lit a moment. */
    /* The diagram rides in the top bar just after the counter pills (off the floor and the door).
       UX_KEYS span x 696..952, y 426..502 in stage units; KB_S keeps even 5 pills + diagram left of the buttons at x 750. */
    const KB_S = .62, kbX = 98 + x + 12;
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
    $('uxAv').classList.toggle('ux-pulse', solo && kbd.teach === 'tab');
  }
