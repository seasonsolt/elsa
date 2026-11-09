  /* ===== e / view-rewards: the six new toys (CONTRACT §9 state, §10 pictures) =====
     Slopes, spring mushrooms, note steps, bunny nests and ice flowers are read from game.grid; floes from game.floes,
     bunnies from game.bunnies, flowers from game.flowers, the melody from game.melody. Everything degrades: a picture that
     is not delivered yet is replaced by a small vector drawing (probed first, so no broken-image icon ever shows), and a
     piece of logic state that is not there yet simply draws nothing.
     Hooks (CONTRACT §7): 10-stage rebuild() calls drawToys(); 90-main frame() calls updateToys(dt, now).
     Events: the frame loop drains game.events before updateToys runs, so this file tees game.events.push once and reads
     its own copy. Private names carry the `ty` prefix (one shared view scope). */

  const TY_NOTE_COL = ['#ff6b6b', '#ffa94d', '#ffe066', '#69db7c', '#74c0fc'];   // red orange yellow green blue = do re mi so la
  const TY_NOTE_HZ = [523.25, 587.33, 659.25, 783.99, 880];
    const tyState = { springs: [], notes: [], flowers: [], floes: new Map(), bunnies: new Map(), melodySig: '', strip: null, lines: {} };
  const tyQueue = [];

  /* ---------- pictures: probe first, draw the vector placeholder until the picture is known to load ---------- */
  const tyImgState = {};
  const tyImgWait = {};
  function tyProbe(name, cb) {
    const st = tyImgState[name];
    if (st === 'ok') { cb(true); return; }
    if (st === 'bad') { cb(false); return; }
    (tyImgWait[name] || (tyImgWait[name] = [])).push(cb);
    if (st) return;
    tyImgState[name] = 'wait';
    const im = new Image();
    const done = ok => { tyImgState[name] = ok ? 'ok' : 'bad'; const l = tyImgWait[name] || []; tyImgWait[name] = []; l.forEach(f => { try { f(ok); } catch (e) {} }); };
    im.onload = () => done(true);
    im.onerror = () => done(false);
    im.src = SRC(name);
  }
  const tyHas = name => tyImgState[name] === 'ok';
  /* A <g> that holds the picture `name` in the box, or fallback(g) until the picture exists. */
  function tyPic(parent, name, x, y, w, h, fallback, extra) {
    const g = el('g', {}, parent);
    const put = () => { g.textContent = ''; img(name, x, y, w, h, g, Object.assign({ preserveAspectRatio: 'xMidYMax meet' }, extra)); };
    if (tyImgState[name] === 'ok') { put(); return g; }
    if (fallback) fallback(g);
    if (tyImgState[name] !== 'bad') tyProbe(name, ok => { if (ok) put(); });
    return g;
  }
  const tyShow = (node, on) => { if (node) node.setAttribute('visibility', on ? 'visible' : 'hidden'); };

  /* ---------- sound (own synthesis on the shared audio context; silent if audio is not awake) ---------- */
  function tyAudioReady() {
    try { return typeof audio !== 'undefined' && !!audio && typeof bus !== 'undefined' && !!bus && typeof bell === 'function'; } catch (e) { return false; }
  }
  function tyTone(n, soft) {
    if (!tyAudioReady() || !(n >= 1 && n <= 5)) return;
    try { bell(TY_NOTE_HZ[n - 1], audio.currentTime, soft ? .7 : 1.5, soft ? .05 : .11, bus.sfx, 'sine'); } catch (e) {}
  }
  function tyBoing() {
    if (!tyAudioReady()) return;
    try {
      const t = audio.currentTime, o = audio.createOscillator(), g = audio.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(260, t); o.frequency.exponentialRampToValueAtTime(820, t + .16); o.frequency.exponentialRampToValueAtTime(520, t + .32);
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.12, t + .02); g.gain.exponentialRampToValueAtTime(.0005, t + .36);
      o.connect(g).connect(bus.sfx); o.start(t); o.stop(t + .4);
    } catch (e) {}
  }
  function tySfx(name, n) { try { if (typeof sfx === 'function') sfx(name, n); } catch (e) {} }
  function tyBurst(x, y, kind, n, spread) { try { if (typeof burst === 'function' && SIZES['fx_' + kind]) burst(x, y, kind, n, spread); } catch (e) {} }
  function tyPuff(kind, x, y, size, life, rise) { try { if (typeof puff === 'function' && SIZES['fx_' + kind]) puff(kind, x, y, size, life, rise); } catch (e) {} }

  /* ---------- toy reaction lines: toy_<family>_<n>, played when the key exists (c-content writes them) ----------
     cool: seconds between two plays of a family, max: plays per room, byN: the variation is the note number (toy_note_ok_<n>
     names the colour of note n), hard: may interrupt a line that is still running (milestones). */
  const TY_LINES = {
    slide: { cool: 9, max: 4 }, bounce: { cool: 9, max: 4 }, bunny: { cool: 5, max: 6 }, bunny_home: { cool: 3, max: 6, wait: 3000 },
    floe: { cool: 9, max: 3 }, note_ok: { cool: 1, max: 99, byN: true, wait: 1200 }, note_wrong: { cool: 6, max: 3 },
    melody: { cool: 0, max: 99, hard: true }, bloom: { cool: 4, max: 6 },
  };
  function tyToyLine(family, n) {
    try {
      const cfg = TY_LINES[family];
      if (!cfg || game.state !== 'play' || typeof voice === 'undefined' || !voice || typeof voice.line !== 'function') return;
      if (typeof storyIsOpen === 'function' && storyIsOpen()) return;
      if (voice.busy && !cfg.hard) return;
      const rec = tyState.lines[family] || (tyState.lines[family] = { t: -99, n: 0, played: 0 }), now = performance.now() / 1000;
      if (now - rec.t < cfg.cool || rec.played >= cfg.max) return;
      let count = 0;
      while (hasLineKey(`toy_${family}_${count + 1}`)) count++;
      if (!count) return;
      const k = cfg.byN ? (n >= 1 && n <= count ? n : 0) : rec.n % count + 1;
      if (!k) return;
      rec.n++; rec.played++; rec.t = now;
      Promise.resolve(voice.line(`toy_${family}_${k}`, { priority: cfg.hard ? 1 : 0, interrupt: !!cfg.hard, maxWait: cfg.wait || 2500, tag: 'toy' })).catch(() => {});
    } catch (e) {}
  }

  /* ---------- vector placeholders ---------- */
  function tySlopeShape(g, dirR) {
    const pts = dirR ? `0,0 ${T},${T} 0,${T}` : `${T},0 ${T},${T} 0,${T}`;
    el('polygon', { points: pts, fill: '#a9d3f3' }, g);
    el('polygon', { points: dirR ? `0,${T * .45} ${T * .55},${T} 0,${T}` : `${T},${T * .45} ${T * .45},${T} ${T},${T}`, fill: '#86b8e3', opacity: .7 }, g);
    el('path', { d: dirR ? `M0 1L${T} ${T + 1}` : `M${T} 1L0 ${T + 1}`, stroke: '#ffffff', 'stroke-width': 4, 'stroke-linecap': 'round', fill: 'none' }, g);
    el('path', { d: dirR ? `M6 ${T * .62}L${T * .38} ${T - 5}` : `M${T - 6} ${T * .62}L${T * .62} ${T - 5}`, stroke: '#ffffff', 'stroke-width': 2, 'stroke-linecap': 'round', opacity: .7, fill: 'none' }, g);
  }
  function tySpringShape(g, squash) {
    if (!squash) {
      el('rect', { x: 14, y: 20, width: 12, height: 20, rx: 5, fill: '#fff3e6', stroke: '#e8cdb4', 'stroke-width': 1.5 }, g);
      el('ellipse', { cx: 20, cy: 15, rx: 19, ry: 13, fill: '#ff8fb3', stroke: '#e0607f', 'stroke-width': 1.5 }, g);
      el('circle', { cx: 12, cy: 12, r: 3.4, fill: '#fff' }, g); el('circle', { cx: 24, cy: 8, r: 2.8, fill: '#fff' }, g); el('circle', { cx: 29, cy: 16, r: 3, fill: '#fff' }, g);
    } else {
      el('rect', { x: 13, y: 29, width: 14, height: 11, rx: 5, fill: '#fff3e6', stroke: '#e8cdb4', 'stroke-width': 1.5 }, g);
      el('ellipse', { cx: 20, cy: 27, rx: 21, ry: 9, fill: '#ff8fb3', stroke: '#e0607f', 'stroke-width': 1.5 }, g);
      el('circle', { cx: 11, cy: 25, r: 3, fill: '#fff' }, g); el('circle', { cx: 22, cy: 22, r: 2.6, fill: '#fff' }, g); el('circle', { cx: 30, cy: 27, r: 3, fill: '#fff' }, g);
    }
  }
  function tyNoteShape(g, n, lit) {
    const col = TY_NOTE_COL[n - 1];
    if (lit) el('circle', { cx: T / 2, cy: T / 2, r: 34, fill: 'url(#warm)' }, g);
    el('rect', { x: 1, y: 2, width: T - 2, height: T - 2, rx: 9, fill: col, stroke: lit ? '#ffffff' : 'rgba(0,0,0,.25)', 'stroke-width': lit ? 3 : 2 }, g);
    el('rect', { x: 5, y: 5, width: T - 10, height: 9, rx: 5, fill: '#ffffff', opacity: lit ? .65 : .38 }, g);
    for (let k = 0; k < n; k++) el('circle', { cx: T / 2 + (k - (n - 1) / 2) * 6.5, cy: T * .68, r: 2.6, fill: '#ffffff', opacity: .92 }, g);
  }
  function tyNestShape(g) {
    el('ellipse', { cx: T / 2, cy: T - 4, rx: 18, ry: 14, fill: '#eaf5ff', stroke: '#bcd6f0', 'stroke-width': 2 }, g);
    el('ellipse', { cx: T / 2, cy: T - 6, rx: 13, ry: 7, fill: 'url(#warm)' }, g);
    el('path', { d: `M${T / 2 - 7} ${T - 2}V${T - 13}A7 7 0 0 1 ${T / 2 + 7} ${T - 13}V${T - 2}Z`, fill: '#4b3d7a' }, g);
    el('path', { d: `M${T / 2} ${T - 26}c-4-5-9 0-5 4l5 5 5-5c4-4-1-9-5-4z`, fill: '#ff8fb3' }, g);
  }
  const TY_PETAL = ['#ff8fb3', '#ffd166', '#c49bff', '#ff9f80'];
  function tyFlowerShape(g, stage, tone) {
    el('path', { d: 'M20 40C19 32 21 26 20 18', stroke: '#5fb27a', 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' }, g);
    el('path', { d: 'M20 31c-6-1-9-5-9-8c6 0 9 3 9 8z', fill: '#79c98f' }, g);
    if (stage === 0) {
      el('path', { d: 'M20 7C14 12 14 19 20 21C26 19 26 12 20 7Z', fill: '#cfe9ff', stroke: '#9cc6ea', 'stroke-width': 1.6 }, g);
      el('path', { d: 'M20 10V18', stroke: '#fff', 'stroke-width': 1.4, opacity: .8 }, g);
    } else if (stage === 1) {
      for (const a of [-32, 0, 32]) el('ellipse', { cx: 20, cy: 12, rx: 4.4, ry: 8, fill: TY_PETAL[tone % 4], opacity: .85, transform: `rotate(${a} 20 19)` }, g);
      el('circle', { cx: 20, cy: 17, r: 3, fill: '#fff3b0' }, g);
    } else {
      for (let k = 0; k < 5; k++) el('ellipse', { cx: 20, cy: 9.5, rx: 5.4, ry: 8, fill: TY_PETAL[tone % 4], stroke: 'rgba(255,255,255,.7)', 'stroke-width': 1, transform: `rotate(${k * 72} 20 17)` }, g);
      el('circle', { cx: 20, cy: 17, r: 4.2, fill: '#fff3b0', stroke: '#ffd166', 'stroke-width': 1.2 }, g);
    }
  }
  function tyFloeShape(g, w) {
    el('rect', { x: 0, y: 6, width: w, height: T - 6, rx: 12, fill: '#a9d9f7', stroke: '#e6f6ff', 'stroke-width': 2 }, g);
    el('rect', { x: 3, y: 4, width: w - 6, height: 11, rx: 6, fill: '#f6fcff' }, g);
    el('rect', { x: 4, y: T - 13, width: w - 8, height: 9, rx: 5, fill: '#7fb8e2', opacity: .6 }, g);
    for (let x = 22; x < w - 10; x += 38) el('path', { d: `M${x} 18l5 6-4 5`, stroke: '#ffffff', 'stroke-width': 1.6, fill: 'none', opacity: .75, 'stroke-linecap': 'round' }, g);
  }
  /* A bunny seen from the side facing right, origin at the feet. frame: 0 idle, 1..4 hop, 5 asleep at home. */
  function tyBunnyShape(g, frame) {
    const o = el('g', {}, g);
    const lift = frame === 2 ? 6 : frame === 3 ? 8 : 0, sq = frame === 1 || frame === 4 ? .84 : 1, ear = frame === 3 ? 26 : frame === 2 ? 12 : frame === 5 ? 70 : 0;
    const body = el('g', { transform: `translate(0 ${-lift}) scale(1 ${sq}) translate(0 ${sq === 1 ? 0 : 1.6})` }, o);
    if (frame === 5) {
      el('ellipse', { cx: 0, cy: -6, rx: 11, ry: 6.5, fill: '#ffffff', stroke: '#d4e6f7', 'stroke-width': 1.2 }, body);
      el('circle', { cx: 7, cy: -8, r: 5.5, fill: '#ffffff', stroke: '#d4e6f7', 'stroke-width': 1.2 }, body);
      el('ellipse', { cx: 3, cy: -14, rx: 2.6, ry: 6, fill: '#ffffff', stroke: '#d4e6f7', 'stroke-width': 1, transform: 'rotate(75 3 -10)' }, body);
      el('path', { d: 'M5 -9q2 1.4 4 0', stroke: '#4b3d7a', 'stroke-width': 1.2, fill: 'none', 'stroke-linecap': 'round' }, body);
      el('circle', { cx: -10, cy: -6, r: 3, fill: '#cfe6ff' }, body);
      return;
    }
    el('circle', { cx: -9, cy: -9, r: 3.2, fill: '#cfe6ff', stroke: '#a7c8ea', 'stroke-width': 1 }, body);
    el('ellipse', { cx: 1, cy: -8, rx: 9.5, ry: 7.5, fill: '#ffffff', stroke: '#d4e6f7', 'stroke-width': 1.4 }, body);
    el('ellipse', { cx: -2, cy: -2, rx: 4, ry: 2.4, fill: '#ffffff', stroke: '#d4e6f7', 'stroke-width': 1.2 }, body);
    el('ellipse', { cx: 6, cy: -17, rx: 2.8, ry: 7.5, fill: '#ffffff', stroke: '#d4e6f7', 'stroke-width': 1.2, transform: `rotate(${-8 - ear} 6 -13)` }, body);
    el('ellipse', { cx: 6, cy: -17, rx: 1.3, ry: 5, fill: '#ffb6cc', transform: `rotate(${-8 - ear} 6 -13)` }, body);
    el('ellipse', { cx: 11, cy: -16.5, rx: 2.8, ry: 7.5, fill: '#ffffff', stroke: '#d4e6f7', 'stroke-width': 1.2, transform: `rotate(${8 - ear} 11 -13)` }, body);
    el('circle', { cx: 9, cy: -13, r: 6, fill: '#ffffff', stroke: '#d4e6f7', 'stroke-width': 1.4 }, body);
    el('circle', { cx: 11.5, cy: -14, r: 1.2, fill: '#4b3d7a' }, body);
    el('circle', { cx: 14.6, cy: -12, r: 1.1, fill: '#ff8fb3' }, body);
  }

  /* ---------- build ---------- */
  function tyCells(test) {
    const out = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const ch = (game.grid[r] || [])[c];
      if (ch && test(ch)) out.push({ c, r, ch });
    }
    return out;
  }
  function tyTee() {
    const ev = game.events;
    if (!ev || ev.__toyTee) return;
    ev.__toyTee = true;
    const push = ev.push;
    ev.push = function (...items) {
      for (const e of items) if (e && tyQueue.length < 300) tyQueue.push(e);
      return push.apply(this, items);
    };
  }

  function drawToys() {
    tyTee();
    const base = layer('toysBase', 'goal'), flora = layer('toysFlora', 'items'), live = layer('toysLive', 'shadows'), strip = layer('toyHud', 'hud');
    for (const b of [base, flora, live, strip]) b.textContent = '';
    Object.assign(tyState, { springs: [], notes: [], flowers: [], melodySig: '', strip: null });
    tyState.floes.clear(); tyState.bunnies.clear(); tyState.lines = {};
    tyQueue.length = 0;
    if (!game.grid || !game.grid.length) return;

    for (const { c, r, ch } of tyCells(ch => ch === '/' || ch === '\\')) {
      const dirR = ch === '\\', x = c * T, y = r * T;
      const g = el('g', { transform: `translate(${x} ${y})` }, base);
      tyPic(g, dirR ? 'tile_slope_r' : 'tile_slope_l', -1, -1, T + 2, T + 2, n => tySlopeShape(n, dirR), { preserveAspectRatio: 'none' });
    }
    for (const { c, r } of tyCells(ch => ch === 'N')) {
      const g = el('g', { transform: `translate(${c * T} ${r * T})` }, base);
      tyPic(g, 'bunny_nest', T / 2 - 32, T - 46, 64, 46, n => tyNestShape(n));
    }
    for (const { c, r, ch } of tyCells(ch => ch >= '1' && ch <= '5' && ch.length === 1)) {
      const n = +ch, g = el('g', { transform: `translate(${c * T} ${r * T})` }, base), inner = el('g', {}, g);
      tyPic(inner, `note_${n}`, -1, -1, T + 2, T + 2, f => tyNoteShape(f, n, false), { preserveAspectRatio: 'none' });
      const lit = el('g', { opacity: 0 }, inner);
      tyPic(lit, `note_${n}_lit`, -1, -1, T + 2, T + 2, f => tyNoteShape(f, n, true), { preserveAspectRatio: 'none' });
      tyState.notes.push({ c, r, n, g, lit, inner, flash: 0, wob: 0 });
    }
    for (const { c, r } of tyCells(ch => ch === 'J')) {
      const g = el('g', { transform: `translate(${c * T} ${r * T})` }, flora), inner = el('g', {}, g);
      const f0 = tyPic(inner, 'spring_0', 0, -2, T, T + 2, n => tySpringShape(n, false));
      const f1 = tyPic(inner, 'spring_1', 0, -2, T, T + 2, n => tySpringShape(n, true));
      tyShow(f1, false);
      tyState.springs.push({ c, r, g, inner, f0, f1, t: 0 });
    }
    const list = Array.isArray(game.flowers) ? game.flowers : tyCells(ch => ch === 'F').map(f => ({ c: f.c, r: f.r, open: false }));
    list.forEach((fl, i) => {
      const g = el('g', { transform: `translate(${fl.c * T} ${fl.r * T})` }, flora);
      const glow = el('circle', { cx: T / 2, cy: T / 2, r: 30, fill: 'url(#warm)', opacity: 0 }, g);
      const inner = el('g', {}, g);
      const frames = [0, 1, 2].map(s => tyPic(inner, `flower_${s}`, -4, -8, T + 8, T + 8, n => tyFlowerShape(n, s, i)));
      const stage = fl.open ? 2 : 0;
      tyState.flowers.push({ c: fl.c, r: fl.r, g, glow, inner, frames, stage, target: fl.open ? 2 : 0, pop: 0, celebrated: !!fl.open });
      frames.forEach((f, s) => tyShow(f, s === stage));
    });
    tyBuildStrip(strip);
    updateToys(0, performance.now() / 1000);
  }

  /* The melody to follow, as a row of coloured dots at the top of the room (the companion shows it too, this one stays). */
  function tyBuildStrip(box) {
    const m = game.melody;
    if (!m || !Array.isArray(m.seq) || !m.seq.length) return;
    const n = m.seq.length, w = n * 30 + 14, x0 = 560 - w / 2;
    const g = el('g', { transform: `translate(${x0} 8)` }, box);
    el('rect', { width: w, height: 36, rx: 18, fill: '#141c52', opacity: .62 }, g);
    const chips = m.seq.map((k, i) => {
      const cg = el('g', { transform: `translate(${21 + i * 30} 18)` }, g), s = el('g', {}, cg);
      el('circle', { r: 11, fill: TY_NOTE_COL[(k | 0) - 1] || '#fff', stroke: '#ffffff', 'stroke-width': 2.5 }, s);
      for (let d = 0; d < (k | 0); d++) el('circle', { cx: (d - (k - 1) / 2) * 4.2, cy: 1, r: 1.5, fill: '#fff', opacity: .9 }, s);
      return s;
    });
    tyState.strip = { g, chips };
  }

  /* ---------- frame ---------- */
  function tyHandle(e) {
    const who = e.who && game.sisters[e.who];
    switch (e.type) {
      case 'slide': {   // the logic can repeat this while a sister rides a bumpy run of ramps: one puff and whoosh per second is plenty
        const t = performance.now(), k = 'slide' + e.who;
        if (t - (tyState.lines[k] || -1e9) < 1000) break;
        tyState.lines[k] = t;
        if (who) tyPuff('dust', who.x + who.w / 2, who.y + who.h, 44, .45);
        try { if (typeof whoosh === 'function') whoosh(false); } catch (err) {}
        tyToyLine('slide');
        break;
      }
      case 'bounce': {
        const sp = tyState.springs.find(s => s.c === e.c && s.r === e.r) || (who && tyState.springs.find(s => Math.abs((s.c + .5) * T - (who.x + who.w / 2)) < T && Math.abs((s.r + 1) * T - (who.y + who.h)) < T * 1.6));
        if (sp) { sp.t = .42; tyPuff('ring', (sp.c + .5) * T, sp.r * T + 6, 54, .5); tyBurst((sp.c + .5) * T, sp.r * T, 'star', 5, 110); }
        tyBoing();
        tyToyLine('bounce');
        break;
      }
      case 'note': {
        const n = e.n | 0;
        tyTone(n, e.ok === false);
        /* the event names the cell that was stepped on; fall back to every step of that note */
        const hit = tyState.notes.filter(s => s.c === e.c && s.r === e.r);
        for (const s of hit.length ? hit : tyState.notes.filter(s => s.n === n)) { if (e.ok === false) s.wob = .4; else { s.flash = .8; tyBurst((s.c + .5) * T, s.r * T, 'star', 3, 70); } }
        tyToyLine(e.ok === false ? 'note_wrong' : 'note_ok', n);
        break;
      }
      case 'melody':
        for (const s of tyState.notes) { s.flash = 1.4; tyBurst((s.c + .5) * T, s.r * T, 'star', 4, 100); }
        tySfx('unlock');
        tyToyLine('melody');
        break;
      case 'clear': case 'win':
        if (typeof awardStickers === 'function') awardStickers((LEVELS[game.index] || {}).id);   // markRoom has already run in this frame
        break;
      case 'bloom': {
        const f = tyState.flowers.find(x => x.c === e.c && x.r === e.r);
        if (f) { f.target = 2; f.celebrated = true; tyBurst((f.c + .5) * T, (f.r + .4) * T, 'heart', 5, 90); tyPuff('ring', (f.c + .5) * T, (f.r + .5) * T, 60, .55); }
        tySfx('star', e.n);
        if (e.total && e.n >= e.total) {
          for (const x of tyState.flowers) tyBurst((x.c + .5) * T, (x.r + .4) * T, 'star', 4, 120);
          tySfx('unlock');
        }
        tyToyLine('bloom');
        break;
      }
      case 'bunny':
        if (e.state === 'follow') { tySfx('pick'); tyToyLine('bunny'); }
        else if (e.state === 'home') { tySfx('unlock'); tyToyLine('bunny_home'); }
        break;
      case 'bunnysplash': tyPuff('splash', e.x, e.y, 46, .5); tySfx('splash'); break;
      case 'bunnyblink':
        if (e.from) { tyPuff('glow', e.from.x, e.from.y - 10, 50, .4); tyBurst(e.from.x, e.from.y - 10, 'star', 4, 70); }
        if (e.to) { tyPuff('ring', e.to.x, e.to.y - 10, 46, .45); tyBurst(e.to.x, e.to.y - 10, 'star', 4, 70); }
        break;
      case 'floe': {
        const f = tyState.floes.get(e.id);
        if (e.paused && f) { tyPuff('ring', f.cx, f.cy, 80, .6); tyBurst(f.cx, f.cy, 'flake', 6, 90); tySfx('blink'); tyToyLine('floe'); }
        break;
      }
    }
  }

  function tyUpdateSprings(dt) {
    for (const s of tyState.springs) {
      if (s.t > 0) s.t = Math.max(0, s.t - dt);
      const p = 1 - s.t / .42, squash = s.t > 0 && p < .38;
      tyShow(s.f0, !squash); tyShow(s.f1, squash);
      const sy = s.t <= 0 ? 1 : p < .3 ? 1 - .22 * (p / .3) : 1 + .14 * Math.sin((p - .3) / .7 * Math.PI * 2) * (1 - p);
      const sx = Math.min(1.12, 1 + (1 - sy) * .5);
      s.inner.setAttribute('transform', `translate(${T / 2} ${T}) scale(${sx.toFixed(3)} ${sy.toFixed(3)}) translate(${-T / 2} ${-T})`);
    }
  }
  function tyUpdateNotes(dt, now) {
    const done = game.melody && (game.melody.done || (game.melody.seq && game.melody.pos >= game.melody.seq.length));
    for (const s of tyState.notes) {
      s.flash = Math.max(0, s.flash - dt); s.wob = Math.max(0, s.wob - dt);
      const lit = Math.min(1, Math.max(s.flash / .5, done ? .85 : 0));
      s.lit.setAttribute('opacity', lit.toFixed(2));
      const dx = s.wob > 0 ? Math.sin(s.wob * 60) * 2.2 * (s.wob / .4) : 0, up = s.flash > 0 ? -Math.sin(Math.min(1, s.flash / .8) * Math.PI) * 2.5 : 0;
      s.inner.setAttribute('transform', `translate(${dx.toFixed(1)} ${up.toFixed(1)})`);
    }
  }
  function tyUpdateFlowers(dt, now) {
    const list = game.flowers;
    tyState.flowers.forEach((f, i) => {
      const src = Array.isArray(list) ? list[i] : null;
      if (src && src.open && f.target !== 2) {   // opened without an event reaching us: still celebrate
        f.target = 2;
        if (!f.celebrated) { tyBurst((f.c + .5) * T, (f.r + .4) * T, 'heart', 5, 90); f.celebrated = true; }
      }
      if (f.target === 2 && f.stage < 2) { f.stage = Math.min(2, f.stage + dt / .3); if (f.stage >= 2) f.pop = .5; }
      f.pop = Math.max(0, f.pop - dt);
      const shown = f.stage < .5 ? 0 : f.stage < 1.5 ? 1 : 2;
      f.frames.forEach((n, s) => tyShow(n, s === shown));
      const sc = 1 + (f.pop > 0 ? .28 * Math.sin(f.pop / .5 * Math.PI) : 0), sway = shown === 2 ? Math.sin(now * 2 + i) * 2.5 : 0;
      f.inner.setAttribute('transform', `translate(${T / 2} ${T}) rotate(${sway.toFixed(2)}) scale(${sc.toFixed(3)}) translate(${-T / 2} ${-T})`);
      f.glow.setAttribute('opacity', shown === 2 ? (.5 + Math.sin(now * 2.4 + i) * .15).toFixed(2) : '0');
    });
  }
  function tyUpdateFloes(dt, now) {
    const list = Array.isArray(game.floes) ? game.floes : [];
    const seen = new Set();
    for (const fl of list) {
      seen.add(fl.id);
      const w = fl.w;   // px, x / y = top-left, one tile tall (logic.js)
      let f = tyState.floes.get(fl.id);
      if (!f) {
        const live = layer('toysLive', 'shadows');
        const g = el('g', {}, live);
        const art = el('g', {}, g);
        tyFloeArt(art, w);
        const frost = el('g', { opacity: 0 }, g);
        el('rect', { x: -2, y: 1, width: w + 4, height: T - 1, rx: 12, fill: '#bfe9ff', opacity: .55, stroke: '#7fd0ff', 'stroke-width': 3 }, frost);
        for (let x = 14; x < w; x += 30) el('path', { d: `M${x} 8v12M${x - 5} 14h10M${x - 3.5} 10.5l7 7M${x + 3.5} 10.5l-7 7`, stroke: '#3a9ad9', 'stroke-width': 2, 'stroke-linecap': 'round', fill: 'none' }, frost);
        f = { g, frost, w, k: 0, cx: 0, cy: 0, prevPaused: false };
        tyState.floes.set(fl.id, f);
      }
      f.cx = fl.x + w / 2; f.cy = fl.y + T / 2;
      f.g.setAttribute('transform', `translate(${fl.x.toFixed(1)} ${fl.y.toFixed(1)})`);
      f.k += ((fl.paused ? 1 : 0) - f.k) * Math.min(1, dt * 8);
      f.frost.setAttribute('opacity', (f.k * (.75 + Math.sin(now * 5) * .2)).toFixed(2));
    }
    for (const [id, f] of tyState.floes) if (!seen.has(id)) { f.g.remove(); tyState.floes.delete(id); }
  }
  /* A floe is painted in three pieces (floe_l, floe_m, floe_r: one tile each); a one-tile floe is the middle piece.
     Until all three load (or if they never do) the vector slab stands in. */
  function tyFloeArt(art, w) {
    el('g', {}, art).appendChild(tyVector(w));
    const cells = Math.max(1, Math.round(w / T)), names = ['floe_l', 'floe_m', 'floe_r'];
    let left = names.length, dead = false;
    for (const nm of names) tyProbe(nm, ok => {
      if (!ok) dead = true;
      if (--left || dead) return;
      art.textContent = '';
      for (let i = 0; i < cells; i++) {
        const nm2 = cells === 1 ? 'floe_m' : i === 0 ? 'floe_l' : i === cells - 1 ? 'floe_r' : 'floe_m';
        img(nm2, i * T - 1, -2, T + 2, T + 2, art, { preserveAspectRatio: 'none' });
      }
    });
  }
  function tyVector(w) {
    const g = document.createElementNS(NS, 'g');
    tyFloeShape(g, w);
    return g;
  }
  function tyBunnyFrames(g) {
    const names = ['bunny_idle', 'bunny_hop1', 'bunny_hop2', 'bunny_hop3', 'bunny_hop4', 'bunny_home'];
    return names.map((nm, i) => {
      const f = tyPic(g, nm, -24, -36, 48, 36, n => tyBunnyShape(n, i === 5 ? 5 : i));
      tyShow(f, i === 0);
      return f;
    });
  }
  function tyUpdateBunnies(dt, now) {
    const list = Array.isArray(game.bunnies) ? game.bunnies : [];
    const seen = new Set();
    for (const b of list) {
      seen.add(b.id);
      const fx = b.x, fy = b.y;   // logic.js: x = centre, y = feet, in px
      let v = tyState.bunnies.get(b.id);
      if (!v) {
        const live = layer('toysLive', 'shadows');
        const g = el('g', {}, live);
        const halo = el('circle', { r: 26, cy: -12, fill: 'url(#cool)' }, g);
        el('ellipse', { rx: 11, ry: 3, cy: 1, fill: '#10184a', opacity: .28 }, g);
        const body = el('g', {}, g);
        v = { g, halo, body, frames: tyBunnyFrames(body), prevX: fx, prevY: fy, phase: 0, state: b.state, shown: 0, shake: Math.random() * 5 };
        tyState.bunnies.set(b.id, v);
      }
      if (b.state !== v.state) {   // a change of state is always worth a sparkle
        if (b.state === 'follow') { tyBurst(fx, fy - 12, 'star', 5, 90); tyPuff('ring', fx, fy - 12, 50, .45); }
        else if (b.state === 'home') { tyBurst(fx, fy - 12, 'heart', 7, 90); tyPuff('ring', fx, fy - 12, 60, .6); }
        v.state = b.state;
      }
      const dx = fx - v.prevX, dy = fy - v.prevY;
      v.prevX = fx; v.prevY = fy;
      let f = 0;
      if (b.state === 'home') f = 5;
      else if (Math.abs(dx) > .15 || Math.abs(dy) > .4) {
        v.phase += Math.abs(dx) / 7 + Math.abs(dy) / 14;
        f = Math.abs(dy) > .6 ? (dy < 0 ? 2 : 3) : 1 + Math.floor(v.phase) % 4;
      }
      if (f !== v.shown) { tyShow(v.frames[v.shown], false); tyShow(v.frames[f], true); v.shown = f; }
      const lost = b.state === 'lost' || b.state === undefined;
      const shiver = lost && Math.sin(now * .9 + v.shake) > .92 ? Math.sin(now * 55) * 1.2 : 0;
      const breath = f === 0 ? 1 + Math.sin(now * 2.6 + v.shake) * .025 : 1;
      v.g.setAttribute('transform', `translate(${(fx + shiver).toFixed(1)} ${fy.toFixed(1)})`);
      v.body.setAttribute('transform', `scale(${(b.dir < 0 ? -1 : 1)} ${breath.toFixed(3)})`);
      v.halo.setAttribute('visibility', lost ? 'visible' : 'hidden');
      v.halo.setAttribute('opacity', (.55 + Math.sin(now * 3 + v.shake) * .3).toFixed(2));
    }
    for (const [id, v] of tyState.bunnies) if (!seen.has(id)) { v.g.remove(); tyState.bunnies.delete(id); }
  }
  function tyUpdateStrip(now) {
    const s = tyState.strip, m = game.melody;
    if (!s) return;
    s.g.setAttribute('visibility', game.state === 'play' ? 'visible' : 'hidden');
    if (!m || !Array.isArray(m.seq)) return;
    const sig = m.pos + '/' + m.seq.length;
    s.chips.forEach((c, i) => {
      const done = i < m.pos, next = i === m.pos;
      c.setAttribute('opacity', done ? '1' : next ? '1' : '.42');
      c.setAttribute('transform', next ? `scale(${(1.12 + Math.sin(now * 6) * .1).toFixed(3)})` : done ? 'scale(.9)' : 'scale(1)');
    });
    tyState.melodySig = sig;
  }

  function updateToys(dt, now) {
    tyTee();
    while (tyQueue.length) { const e = tyQueue.shift(); try { tyHandle(e); } catch (err) { console.error('[toys]', err); } }
    if (!tyState.strip && game.melody && game.melody.seq && game.melody.seq.length) tyBuildStrip(layer('toyHud', 'hud'));
    tyUpdateSprings(dt);
    tyUpdateNotes(dt, now);
    tyUpdateFlowers(dt, now);
    tyUpdateFloes(dt, now);
    tyUpdateBunnies(dt, now);
    tyUpdateStrip(now);
    if (typeof rewardsTick === 'function') rewardsTick(dt, now);
  }
