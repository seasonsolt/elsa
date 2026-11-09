  /* ===== e / view-rewards: sticker book, wardrobe, hat overlay, sticker-earned celebration (PLAN B2, CONTRACT §11) =====
     Save fields used: save.stickers[] (ids), save.board[{id,x,y}] (x, y are fractions 0..1 of the sticker board, the
     sticker's centre), save.outfit[who] {dress 0..2, hat id|null}.
     Sticker ids: '<lv>' (room cleared), '<lv>_gold' (all three stars), 'words5_<k>' (every 5 words heard). Pictures:
     sticker_<id> (words5_<k> uses sticker_words5), sticker_board; dresses '<who>_<frame>_d<k>' (all twelve frames or none);
     hats 'hat_<id>' with head offsets in SIZES.hat_offsets (see rwHatOffset). Anything not delivered is drawn as a vector shape.
     The screens reuse the picture-button helpers of 70-ui (uxScreen, uxPaint, uxButton, uxBind, uxPic, ...).
     Private names carry the `rw` prefix (one shared view scope). */

  const RW_UNLOCK = { dress1: 3, dress2: 6, bow: 3, clip: 6, wreath: 10, crown: 10 };   // stickers needed (PLAN B2: 3 / 6 / 10)
  const RW_HATS = ['bow', 'clip', 'wreath', 'crown'];
  const RW_DRESS_COL = { frost: ['#78bce2', '#75d8b8', '#ef6e9f'], nuan: ['#285e9b', '#2b8c89', '#8055ad'] };
  const RW_HAT_W = 28, RW_HAT_SINK = 7;   // hat width in game units, and how far its lower edge sits into the hair
  const RW_BOARD = { x: 40, y: 78, w: 672, h: 378 };
  const RW_STICKER = 76;                  // size of a sticker on the board
  const rwState = { ver: 0, toasts: [], toast: null, fresh: new Set(), wordsAt: -1, tick: 0, drawn: { frost: null, nuan: null } };

  /* ---------- the catalogue and the save ---------- */
  const rwSave = () => { try { return save; } catch (e) { return null; } };
  const rwHas = id => { const s = rwSave(); return !!(s && Array.isArray(s.stickers) && s.stickers.includes(id)); };
  const rwCount = () => { const s = rwSave(); return s && Array.isArray(s.stickers) ? s.stickers.length : 0; };
  const rwWordsKnown = () => { const s = rwSave(); return !s ? 0 : WORDS.filter(w => { const r = s.words && s.words[w.id]; return r && (r.heard > 0 || r.seen); }).length; };
  function rwCatalog() {
    const out = [];
    LEVELS.forEach((lv, i) => { out.push({ id: lv.id, room: i, gold: false }); out.push({ id: lv.id + '_gold', room: i, gold: true }); });
    for (let k = 1; k <= Math.floor(WORDS.length / 5); k++) out.push({ id: 'words5_' + k, words: k });
    return out;
  }
  const rwImgName = id => (/^words5_/.test(id) ? 'sticker_words5' : 'sticker_' + id);

  /* Give every sticker the save has earned the right to. levelId limits the room checks (null: all rooms). Returns the new ids.
     quiet: no celebration (the book catches up silently when it opens). Safe to call any number of times. */
  function awardStickers(levelId, quiet) {
    const s = rwSave();
    if (!s) return [];
    if (!Array.isArray(s.stickers)) s.stickers = [];
    const added = [];
    const give = id => { if (!s.stickers.includes(id)) { s.stickers.push(id); added.push(id); } };
    for (const lv of LEVELS) {
      if (levelId && lv.id !== levelId) continue;
      const r = s.rooms && s.rooms[lv.id];
      if (!r) continue;
      if (r.cleared) give(lv.id);
      if (r.cleared && r.stars && r.stars[0] && r.stars[1] && r.stars[2]) give(lv.id + '_gold');
    }
    const known = rwWordsKnown();
    rwState.wordsAt = known;
    for (let k = 1; k <= Math.floor(known / 5); k++) give('words5_' + k);
    if (added.length) {
      const before = s.stickers.length - added.length;
      try { saveWrite(); } catch (e) {}
      added.forEach(id => rwState.fresh.add(id));
      if (!quiet) {
        added.forEach(id => rwState.toasts.push({ id }));
        if ([3, 6, 10].some(n => before < n && s.stickers.length >= n)) rwState.toasts.push({ wardrobe: true });
      }
    }
    return added;
  }

  /* ---------- sticker pictures ---------- */
  function rwStickerPlaceholder(id, s) {
    const r = s / 2, st = 'stroke="#ffffff" stroke-width="' + Math.max(3, s * .06).toFixed(1) + '"';
    if (/^words5_/.test(id)) {
      return `<circle r="${r}" fill="#ff9cc0" ${st}/><g transform="scale(${(s * .3).toFixed(1)})">${uxGlyph('book')}</g>`;
    }
    const gold = /_gold$/.test(id), lvId = id.replace(/_gold$/, ''), i = Math.max(0, LEVELS.findIndex(l => l.id === lvId));
    const col = UX_HUE[i % UX_HUE.length];
    const ring = gold ? `<circle r="${(r - s * .07).toFixed(1)}" fill="none" stroke="#ffd27a" stroke-width="${(s * .07).toFixed(1)}"/>` : '';
    return `<circle r="${r}" fill="${gold ? '#fff3c9' : col}" ${st}/><circle r="${(r * .62).toFixed(1)}" fill="${gold ? '#ffd27a' : '#ffffff'}" opacity="${gold ? 1 : .55}"/>${ring}<g transform="scale(${(s * .27).toFixed(1)})">${uxGlyph('star')}</g>`;
  }
  const rwStickerArt = (id, s) => uxPic(rwImgName(id), -s / 2, -s / 2, s, s, rwStickerPlaceholder(id, s));
  /* The same, but for a sticker that is not earned yet: a grey shape. */
  const rwSilhouette = s => `<circle r="${s / 2}" fill="#8d96bd" opacity=".45" stroke="#c6ccea" stroke-width="2.5" stroke-dasharray="7 6"/>`;

  /* ---------- the celebration ---------- */
  function rwToastLayer() {
    let g = $('rewardPop');
    if (!g) { g = el('g', { id: 'rewardPop', 'pointer-events': 'none', 'aria-hidden': 'true' }); const subs = $('subs'); if (subs && subs.parentNode) subs.parentNode.insertBefore(g, subs); else $('stage').appendChild(g); }
    return g;
  }
  function rwStartToast(t) {
    const box = rwToastLayer();
    box.textContent = '';
    const g = el('g', {}, box), size = game.state === 'play' ? 104 : 130;
    const rays = el('g', {}, g), pop = el('g', {}, g);
    el('circle', { r: size * .95, fill: 'url(#warm)' }, g);
    for (let k = 0; k < 8; k++) el('path', { d: `M${size * .52} -4L${size * .98} 0L${size * .52} 4Z`, fill: '#ffe27a', opacity: .75, transform: `rotate(${k * 45})` }, rays);
    pop.innerHTML = t.wardrobe
      ? `<circle r="${size / 2}" fill="url(#plateGrad)" stroke="#fff" stroke-width="4"/><g transform="scale(${(size * .3).toFixed(1)})">${uxGlyph('wardrobe')}</g>`
      : rwStickerArt(t.id, size);
    rwState.toast = { g, rays, pop, t: 0, size, cx: 480, cy: game.state === 'play' ? 300 : 330 };
    g.setAttribute('transform', 'translate(480 330) scale(0)');
    try { sfx('unlock'); } catch (e) {}
    try { uxConfetti(box, rwState.toast.cx, rwState.toast.cy, 24); } catch (e) {}
  }
  function rwToastTick(dt) {
    let T0 = rwState.toast;
    if (!T0 && rwState.toasts.length) { rwStartToast(rwState.toasts.shift()); T0 = rwState.toast; }
    if (!T0) return;
    T0.t += dt;
    const t = T0.t, IN = .55, HOLD = 1.9, OUT = .45;
    let sc, y = T0.cy, op = 1;
    if (t < IN) { const u = t / IN, c1 = 1.9; sc = 1 + (c1 + 1) * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); }
    else if (t < IN + HOLD) sc = 1 + Math.sin((t - IN) * 5) * .035;
    else { const u = Math.min(1, (t - IN - HOLD) / OUT); sc = 1 - u * .25; y -= u * 40; op = 1 - u; }
    T0.g.setAttribute('transform', `translate(${T0.cx} ${y.toFixed(1)}) scale(${Math.max(0, sc).toFixed(3)})`);
    T0.g.setAttribute('opacity', op.toFixed(2));
    T0.rays.setAttribute('transform', `rotate(${(t * 40).toFixed(1)})`);
    T0.pop.setAttribute('transform', `rotate(${(Math.sin(t * 6) * 4 * Math.max(0, 1 - t / 1.2)).toFixed(2)})`);
    if (t > IN + HOLD + OUT) { T0.g.remove(); rwState.toast = null; }
  }
  /* Called every frame by updateToys (15-toys): the celebration, and now and then a look at the words heard. */
  function rewardsTick(dt) {
    try {
      rwToastTick(Math.min(dt, .05));
      if ((++rwState.tick & 63) === 0 && rwWordsKnown() !== rwState.wordsAt) awardStickers(null);
    } catch (e) { if (!rwState.err) { rwState.err = 1; console.error('[rewards]', e); } }
  }

  /* ---------- pointer helpers ---------- */
  function rwPoint(ev) {
    const m = $('overlay').getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }
  const rwInBoard = p => p.x >= RW_BOARD.x && p.x <= RW_BOARD.x + RW_BOARD.w && p.y >= RW_BOARD.y && p.y <= RW_BOARD.y + RW_BOARD.h;
  const rwClamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ---------- sticker book ---------- */
  function showStickers(pageNo) {
    try { rwShowStickers(pageNo || 0); } catch (e) { console.error('[stickers]', e); try { showTitle(); } catch (e2) {} }
  }
  function rwShowStickers(pageNo) {
    const tok = uxScreen('stickers', false);
    awardStickers(null, true);
    const per = 18, cols = 3, cell = 64, tx0 = 738, ty0 = 112;
    let page = pageNo, first = true;
    const earned = () => rwSave().stickers.filter(id => rwCatalog().some(c => c.id === id));
    const board = () => rwSave().board;
    const free = () => earned().filter(id => !board().some(b => b.id === id));
    /* the tray shows the stickers that are not on the board, then grey shapes for the room stickers still to win */
    const trayList = () => {
      const out = free().map(id => ({ id, got: true }));
      for (const c of rwCatalog()) if (!c.words && !c.gold && !rwHas(c.id)) out.push({ id: c.id, got: false });
      return out;
    };

    const draw = () => {
      const list = trayList(), pages = Math.max(1, Math.ceil(list.length / per));
      page = rwClamp(page, 0, pages - 1);
      const tray = list.slice(page * per, page * per + per).map((it, k) => {
        const x = tx0 + (k % cols) * cell + cell / 2, y = ty0 + Math.floor(k / cols) * cell + cell / 2;
        if (!it.got) return `<g transform="translate(${x} ${y})">${rwSilhouette(52)}</g>`;
        return `<g transform="translate(${x} ${y})"><g class="ux-btn rw-item ${rwState.fresh.has(it.id) ? 'ux-bounce' : ''}" data-id="${it.id}" data-from="tray" data-ui="" tabindex="-1">
          <circle r="31" fill="#000" fill-opacity="0" pointer-events="all"/>${rwStickerArt(it.id, 56)}</g></g>`;
      }).join('');
      const placed = board().filter(b => rwHas(b.id)).map(b => {
        const x = RW_BOARD.x + b.x * RW_BOARD.w, y = RW_BOARD.y + b.y * RW_BOARD.h;
        return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><g class="ux-btn rw-item" data-id="${b.id}" data-from="board" data-ui="" tabindex="-1">
          <circle r="${RW_STICKER / 2 + 2}" fill="#000" fill-opacity="0" pointer-events="all"/>${rwStickerArt(b.id, RW_STICKER)}</g></g>`;
      }).join('');
      const B = RW_BOARD;
      const boardArt = uxPic('sticker_board', B.x, B.y, B.w, B.h,
        `<rect x="${B.x}" y="${B.y}" width="${B.w}" height="${B.h}" rx="20" fill="#27357f"/>
         <rect x="${B.x}" y="${B.y + B.h * .62}" width="${B.w}" height="${B.h * .38}" rx="20" fill="#3b4a96"/>
         <path d="M${B.x + 120} ${B.y + B.h * .7}V${B.y + B.h * .34}l24 -34 24 34V${B.y + B.h * .7}ZM${B.x + 250} ${B.y + B.h * .7}V${B.y + B.h * .2}l40 -50 40 50V${B.y + B.h * .7}ZM${B.x + 410} ${B.y + B.h * .7}V${B.y + B.h * .36}l24 -34 24 34V${B.y + B.h * .7}Z" fill="#5a6fca" opacity=".8"/>
         <circle cx="${B.x + B.w - 90}" cy="${B.y + 70}" r="32" fill="#fff3c9" opacity=".85"/>`, 'clip-path="inset(0 round 20px)"');
      const html = `<g class="${first ? 'page' : ''}"><image href="${SRC('bg0')}" width="960" height="520" preserveAspectRatio="xMidYMid slice"/><rect width="960" height="520" fill="#0d1438" opacity=".62"/>
        ${boardArt}<rect id="rwBoardRing" x="${B.x}" y="${B.y}" width="${B.w}" height="${B.h}" rx="20" fill="none" stroke="#ffd27a" stroke-width="5" opacity="0"/>
        <g id="rwPlaced">${placed}</g>
        <rect x="${tx0 - 10}" y="${ty0 - 14}" width="${cols * cell + 20}" height="${per / cols * cell + 24}" rx="18" fill="#141c52" opacity=".55"/>
        ${tray}
        ${uxButton({ act: 'back', ui: 'back', x: 52, y: 44, r: 28 })}
        ${page > 0 ? `<g transform="translate(${tx0 + 40} 486) scale(-1 1)">${uxButton({ act: 'prev', ui: 'back', icon: 'next', x: 0, y: 0, r: 26 })}</g>` : ''}
        ${page < pages - 1 ? uxButton({ act: 'nextpage', ui: 'next', icon: 'next', x: tx0 + 150, y: 486, r: 26 }) : ''}
        <g id="rwDrag" pointer-events="none"></g></g>`;
      first = false;
      const root = uxPaint(html);
      uxBind(root, { back: () => showTitle(), prev: () => { page--; draw(); }, nextpage: () => { page++; draw(); } });
      root.querySelectorAll('.rw-item').forEach(n => n.addEventListener('pointerdown', ev => startDrag(ev, n)));
      rwState.fresh.clear();
    };

    /* a free spot for a sticker that was only tapped */
    const spot = () => {
      const taken = board().map(b => ({ x: b.x * RW_BOARD.w, y: b.y * RW_BOARD.h }));
      for (let k = 0; k < 60; k++) {
        const x = (.1 + ((k * 0.213) % .8)) * RW_BOARD.w, y = (.16 + ((k * 0.137 + Math.floor(k / 5) * .11) % .7)) * RW_BOARD.h;
        if (taken.every(t => Math.hypot(t.x - x, t.y - y) > RW_STICKER * .8)) return { fx: x / RW_BOARD.w, fy: y / RW_BOARD.h };
      }
      return { fx: .15 + Math.random() * .7, fy: .2 + Math.random() * .6 };
    };
    const place = (id, fx, fy) => {
      const b = board();
      const i = b.findIndex(x => x.id === id);
      if (i >= 0) b.splice(i, 1);
      b.push({ id, x: +rwClamp(fx, .06, .94).toFixed(4), y: +rwClamp(fy, .08, .94).toFixed(4) });   // last = on top
    };

    const startDrag = (ev, n) => {
      if (ev.button) return;
      ev.preventDefault(); ev.stopPropagation(); uxWake();
      const id = n.dataset.id, from = n.dataset.from, p0 = rwPoint(ev), dragBox = $('rwDrag');
      if (!dragBox) return;
      const proxy = el('g', { transform: `translate(${p0.x} ${p0.y}) scale(1.12)` }, dragBox);
      proxy.innerHTML = rwStickerArt(id, RW_STICKER);
      n.parentNode.setAttribute('opacity', '.28');
      uxSfx('click');
      let moved = false;
      const ring = $('rwBoardRing');
      const move = e => {
        const p = rwPoint(e);
        if (Math.hypot(p.x - p0.x, p.y - p0.y) > 6) moved = true;
        proxy.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(1.12)`);
        if (ring) ring.setAttribute('opacity', moved && rwInBoard(p) ? '.9' : '0');
      };
      const end = (e, cancel) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancelUp);
        proxy.remove();
        if (!uxAlive(tok)) return;
        if (!cancel) {
          const p = rwPoint(e);
          if (!moved) {
            if (from === 'tray') { const s = spot(); place(id, s.fx, s.fy); uxSfx('pick'); }
            else { place(id, board().find(b => b.id === id).x, board().find(b => b.id === id).y); uxNudge(n.parentNode); }
          } else if (rwInBoard(p)) { place(id, (p.x - RW_BOARD.x) / RW_BOARD.w, (p.y - RW_BOARD.y) / RW_BOARD.h); uxSfx('pick'); }
          else if (from === 'board') { const i = board().findIndex(b => b.id === id); if (i >= 0) board().splice(i, 1); }
          uxSaveNow();
        }
        draw();
      };
      const up = e => end(e, false), cancelUp = e => end(e, true);
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancelUp);
    };
    draw();
  }

  /* ---------- dress and hat ---------- */
  const rwDressName = (who, frame, k) => (k ? `${who}_${frame}_d${k}` : `${who}_${frame}`);
  /* A dress colour counts as delivered only when all twelve frames load (a half-dressed run cycle would look broken). */
  function rwDressReady(who, k) {
    if (!k) return true;
    let all = true;
    for (const f of FRAMES) {
      const name = rwDressName(who, f, k), st = tyImgState[name];
      if (st === 'ok') continue;
      all = false;
      if (!st) tyProbe(name, () => { rwState.ver++; });
    }
    return all;
  }
  function rwHatOffset(who, frame) {
    const ho = SIZES.hat_offsets;
    if (!ho) return [0, 0, 1, 0];
    const v = (ho[who] && ho[who][frame]) || ho[`${who}_${frame}`] || ho[frame];
    if (Array.isArray(v)) return [+v[0] || 0, +v[1] || 0, +v[2] || 1, +v[3] || 0];
    if (v && typeof v === 'object') return [+v.x || 0, +v.y || 0, +(v.s || v.scale) || 1, +(v.r || v.rot) || 0];
    return [0, 0, 1, 0];
  }
  /* The hat on a sister's head, as one <image> kept inside `parent` (the sister's own group: it flips with her).
     Head anchor: x = 0 is the head's x of the frame (SIZES [w, h, ax]), the top of the frame image is the top of the head;
     hat_offsets are [dx, dy, scale?, rotation°?] in game units from there (dy > 0 = lower). */
  function rwPlaceHat(parent, who, frame, hatId) {
    let n = parent.__rwHat;
    if (!hatId || !tyHas('hat_' + hatId)) {
      if (hatId && tyImgState['hat_' + hatId] === undefined) tyProbe('hat_' + hatId, () => { rwState.ver++; });
      if (n) n.setAttribute('visibility', 'hidden');
      return;
    }
    if (!n) { n = el('image', { 'data-rw': 'hat', preserveAspectRatio: 'xMidYMax meet' }, parent); parent.__rwHat = n; }
    const key = hatId + '|' + frame;
    if (n.__key !== key) {
      n.__key = key;
      n.setAttribute('href', SRC('hat_' + hatId));
      const sz = SIZES[`${who}_${frame}`] || [80, 168, 40], hs = SIZES['hat_' + hatId];
      const top = 3 - sz[1] * SPRITE, [dx, dy, sc, rot] = rwHatOffset(who, frame);
      const w = RW_HAT_W * sc, h = (hs && hs[0] ? RW_HAT_W * hs[1] / hs[0] : RW_HAT_W) * sc, by = top + RW_HAT_SINK + dy;
      n.setAttribute('x', (dx - w / 2).toFixed(2)); n.setAttribute('y', (by - h).toFixed(2));
      n.setAttribute('width', w.toFixed(2)); n.setAttribute('height', h.toFixed(2));
      if (rot) n.setAttribute('transform', `rotate(${rot} ${dx} ${by})`); else n.removeAttribute('transform');
    }
    n.removeAttribute('visibility');
  }
  /* Hook of 20-sisters: after a sister is drawn. Applies her chosen dress colour (swapping the frame pictures) and hat. */
  function drawOutfit(id, frame, node) {
    if (!node) return;
    try {
      const s = rwSave(), o = s && s.outfit && s.outfit[id];
      if (!o) return;
      const st = rwState.drawn[id] || (rwState.drawn[id] = { dress: -1, ver: -1, imgs: null });
      if (!st.imgs) {
        st.imgs = {};
        for (const c of node.children) {
          if (c.tagName !== 'image') continue;
          const m = /\/([a-z]+)_([a-z0-9]+)\.webp$/.exec((c.getAttribute('href') || '').split('?')[0]);
          if (m && m[1] === id && FRAMES.includes(m[2])) st.imgs[m[2]] = c;
        }
      }
      if (st.dress !== o.dress || st.ver !== rwState.ver) {
        st.dress = o.dress; st.ver = rwState.ver;
        const k = o.dress && rwDressReady(id, o.dress) ? o.dress : 0;
        for (const f of FRAMES) if (st.imgs[f]) st.imgs[f].setAttribute('href', SRC(rwDressName(id, f, k)));
      }
      rwPlaceHat(node, id, frame, o.hat);
    } catch (e) { if (!rwState.drawErr) { rwState.drawErr = 1; console.error('[outfit]', e); } }
  }

  /* ---------- wardrobe ---------- */
  function showWardrobe() {
    try { rwShowWardrobe(); } catch (e) { console.error('[wardrobe]', e); try { showTitle(); } catch (e2) {} }
  }
  function rwShowWardrobe() {
    const tok = uxScreen('wardrobe', false);
    awardStickers(null, true);
    let first = true;
    const outfit = who => rwSave().outfit[who];
    /* one choice: a round swatch. state: 'on' selected, 'open' free to pick, 'lock' not earned yet, 'miss' not delivered yet */
    const choice = (who, kind, val, x, y, art, need, ready) => {
      const own = kind === 'dress' ? outfit(who).dress === val : outfit(who).hat === val;
      const enough = rwCount() >= need;
      const st = !ready ? 'miss' : !enough ? 'lock' : own ? 'on' : 'open';
      const pip = st === 'lock' ? `<g transform="translate(14 14)"><circle r="14" fill="#141c52" stroke="#fff" stroke-width="2"/><g transform="scale(10) translate(0 -.02)">${uxGlyph('lock', '#e8ecff')}</g></g>
        <g transform="translate(-4 24)"><path transform="translate(-6 0) scale(8)" d="M0 -.8L.22 -.25L.8 -.22L.35 .15L.5 .72L0 .4L-.5 .72L-.35 .15L-.8 -.22L-.22 -.25Z" fill="#ffd27a"/><text class="latin" x="6" y="7" font-size="19" fill="#fff" stroke="#141c52" stroke-width="4" paint-order="stroke">${need}</text></g>` : '';
      return `<g transform="translate(${x} ${y})"><g class="ux-btn rw-choice" data-who="${who}" data-kind="${kind}" data-val="${val === null ? '' : val}" data-state="${st}" data-ui="" tabindex="0" role="button" aria-label="${kind}">
        <circle r="34" fill="#000" fill-opacity="0" pointer-events="all"/>
        <circle r="29" fill="${st === 'miss' || st === 'lock' ? '#8d96bd' : '#fffaf0'}" fill-opacity="${st === 'miss' || st === 'lock' ? .55 : 1}" stroke="${st === 'on' ? '#ffd27a' : '#ffffff'}" stroke-width="${st === 'on' ? 6 : 3}" filter="url(#softShadow)"/>
        <g ${st === 'miss' || st === 'lock' ? 'filter="url(#silhouette)"' : ''}>${art}</g>${pip}</g></g>`;
    };
    const draw = () => {
      let html = `<g class="${first ? 'page' : ''}"><image href="${SRC('bg0')}" width="960" height="520" preserveAspectRatio="xMidYMid slice"/><rect width="960" height="520" fill="#0d1438" opacity=".62"/>`;
      ['frost', 'nuan'].forEach((who, i) => {
        const cx = i ? 710 : 250, o = outfit(who);
        html += `<rect x="${cx - 170}" y="46" width="340" height="276" rx="26" fill="${who === 'frost' ? '#cfe6ff' : '#ffd9a8'}" opacity=".9" filter="url(#softShadow)"/>
          <g class="rw-prev" data-who="${who}" transform="translate(${cx} 306) scale(2.5)"></g>`;
        const dress = [0, 1, 2].map(k => {
          const ready = rwDressReady(who, k), need = k ? RW_UNLOCK['dress' + k] : 0;
          const art = `<circle r="19" fill="${RW_DRESS_COL[who][k]}"/><path d="M-13 -6Q0 -17 13 -6" stroke="#fff" stroke-width="3" fill="none" opacity=".6" stroke-linecap="round"/>`;
          return choice(who, 'dress', k, cx - 76 + k * 76, 372, art, need, ready);
        }).join('');
        const hatList = RW_HATS.filter(h => tyHas('hat_' + h));
        RW_HATS.forEach(h => { if (!tyImgState['hat_' + h]) tyProbe('hat_' + h, ok => { if (ok && uxAlive(tok)) draw(); }); });
        const hats = hatList.length ? [null, ...hatList].map((h, k, a) => {
          const x = cx + (k - (a.length - 1) / 2) * 70;
          const art = h === null ? `<g transform="scale(15)">${uxGlyph('close', '#8d96bd')}</g>` : `<image href="${SRC('hat_' + h)}" x="-22" y="-22" width="44" height="44" preserveAspectRatio="xMidYMid meet"/>`;
          return choice(who, 'hat', h, x, 448, art, h === null ? 0 : RW_UNLOCK[h], true);
        }).join('') : '';
        html += dress + hats;
      });
      html += uxButton({ act: 'back', ui: 'back', x: 52, y: 44, r: 28 }) + '</g>';
      first = false;
      const root = uxPaint(html);
      uxBind(root, { back: () => showTitle() });
      root.querySelectorAll('.rw-prev').forEach(node => {
        const who = node.dataset.who, o = outfit(who), sz = SIZES[who + '_idle'] || [80, 168, 40];
        const k = o.dress && rwDressReady(who, o.dress) ? o.dress : 0;
        img(rwDressName(who, 'idle', k), -sz[2] * SPRITE, 3 - sz[1] * SPRITE, sz[0] * SPRITE, sz[1] * SPRITE, node);
        rwPlaceHat(node, who, 'idle', o.hat);
      });
      root.querySelectorAll('.rw-choice').forEach(n => hoverable(n, '', () => {
        const who = n.dataset.who, kind = n.dataset.kind, val = n.dataset.val, state = n.dataset.state;
        if (state === 'lock' || state === 'miss') { n.classList.remove('ux-shake'); void n.getBoundingClientRect(); n.classList.add('ux-shake'); return; }
        if (!uxAlive(tok)) return;
        const o = outfit(who);
        if (kind === 'dress') o.dress = +val; else o.hat = val === '' ? null : val;
        uxSaveNow(); uxSfx('pick'); draw();
      }));
    };
    draw();
    /* pictures that finish loading while the wardrobe is open (dress colours, hats) bring their choices to life */
    let seen = rwState.ver;
    const watch = setInterval(() => {
      if (!uxAlive(tok)) { clearInterval(watch); return; }
      if (rwState.ver !== seen) { seen = rwState.ver; draw(); }
    }, 300);
  }
