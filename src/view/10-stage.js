  /* Tiles */
  const isSolid = ch => '#XIB'.includes(ch);
  const cellAt = (c, r) => (r < 0 || r >= ROWS || c < 0 || c >= COLS) ? '#' : game.grid[r][c];

  /* Nearest ground / platform / ramp / floe surface directly beneath (x, feetY), so shadows stay on the floor when jumping. */
  function groundYBelow(x, feetY) {
    let best = ROWS * T;
    if (Array.isArray(game.floes)) {
      for (const fl of game.floes) if (x >= fl.x - 4 && x <= fl.x + fl.w + 4 && fl.y >= feetY - 8 && fl.y < best) best = fl.y;
    }
    const c = Math.max(0, Math.min(COLS - 1, Math.floor(x / T)));
    const r0 = Math.max(0, Math.floor((feetY - 6) / T));
    for (let r = r0; r < ROWS; r++) {
      const ch = cellAt(c, r);
      let y = -1;
      if (ch === '\\') y = r * T + Math.max(0, Math.min(T, x - c * T));
      else if (ch === '/') y = (r + 1) * T - Math.max(0, Math.min(T, x - c * T));
      else if ('#XIB=J12345'.includes(ch) || (ch === 'G' && !game.gatesOpen)) y = r * T;
      else if (ch === '~') y = r * T + 8;
      if (y >= feetY - 8 && y < best) { best = y; break; }
    }
    return best;
  }

  function runs(test) {
    const out = [];
    for (let r = 0; r < ROWS; r++) {
      let start = -1;
      for (let c = 0; c <= COLS; c++) {
        const on = c < COLS && test(c, r);
        if (on && start < 0) start = c;
        if (!on && start >= 0) { out.push({ r, c: start, len: c - start }); start = -1; }
      }
    }
    return out;
  }

  function drawTiles() {
    const box = $('tiles');
    box.textContent = '';
    let wall = '', rim = '', hi = '';
    const under = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (game.grid[r][c] !== '#') continue;
      const x = c * T, y = r * T;
      wall += `M${x} ${y}h${T}v${T}h-${T}z`;
      if (r > 0 && cellAt(c, r - 1) !== '#') hi += `M${x} ${y + 1.5}h${T}`;
      if (r < ROWS - 1 && cellAt(c, r + 1) !== '#') { rim += `M${x} ${y + T}h${T}`; under.push([x, y + T]); }
      if (cellAt(c + 1, r) !== '#') { rim += `M${x + T} ${y}v${T}`; hi += `M${x + T - 1.5} ${y}v${T}`; }
      if (cellAt(c - 1, r) !== '#') { rim += `M${x} ${y}v${T}`; hi += `M${x + 1.5} ${y}v${T}`; }
    }
    el('path', { d: wall, fill: 'url(#brick)' }, box);
    el('path', { d: wall, fill: '#2c4296', opacity: .16 }, box);
    el('path', { d: rim, stroke: '#1d2d70', 'stroke-width': 3, 'stroke-linecap': 'round', opacity: .52, fill: 'none' }, box);
    el('path', { d: hi, stroke: '#b8e6ff', 'stroke-width': 2.2, 'stroke-linecap': 'round', opacity: .55, fill: 'none' }, box);
    for (const [x, y] of under) el('rect', { x, y, width: T, height: 16, fill: 'url(#under)' }, box);

    for (const run of runs((c, r) => cellAt(c, r) === '~')) {
      el('rect', { x: run.c * T, y: run.r * T + 7, width: run.len * T, height: T - 7, fill: '#23509f' }, box);
      el('rect', { class: 'shimmer', x: run.c * T, y: run.r * T + 4, width: run.len * T, height: 30, fill: 'url(#water)' }, box);
    }
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const ch = game.grid[r][c], x = c * T, y = r * T;
      if (ch === 'X') img('pinkice', x - 1, y - 1, T + 2, T + 2, box, { class: 'shimmer' });
      else if (ch === 'I') img('frozen', x, y, T, T, box);
      else if (ch === 'B') {
        const b = game.blocks;
        const next = b.length >= MAX_BLOCKS && b[0].c === c && b[0].r === r;
        img('iceblock', x, y, T, T, box, { opacity: next ? .55 : 1 });
      }
    }
    for (const run of runs((c, r) => cellAt(c, r) === '=')) {
      const w = run.len * T, n = Math.max(1, Math.round(run.len / 3)), piece = w / n;
      for (let i = 0; i < n; i++) img('shelf' + ((run.c + i) % 3), run.c * T + i * piece - 5, run.r * T - 6, piece + 10, Math.min(46, piece * .36 + 6), box);
    }
    for (const run of runs((c, r) => {
      if (r === 0) return false;
      const ch = cellAt(c, r), up = cellAt(c, r - 1);
      return ch === '#' && !isSolid(up) && up !== '=' && up !== '~';
    })) {
      const w = run.len * T, n = Math.max(1, Math.round(run.len / 2.5)), piece = w / n;
      for (let i = 0; i < n; i++) img('drift' + ((run.c + run.r + i) % 2), run.c * T + i * piece - 6, run.r * T - 9, piece + 12, 19, box);
    }
  }

  function drawGoal() {
    const box = $('goal');
    box.textContent = '';
    const d = game.door;
    if (!d) return;   // the garden room has no door: its goal is the flowers
    const g = el('g', { transform: `translate(${d.x} ${d.bottom + 3})` }, box);
    if (game.goal === 'snowman') {
      const got = game.items.filter(i => i.kind === 'o' && i.got).length;
      el('ellipse', { rx: 40, ry: 7, fill: '#10184a', opacity: got ? .3 : .12 }, g);
      if (got === 1) img('ball', -24, -48, 48, 48, g);
      if (got === 2) img('two', -30, -86, 60, 86, g);
      if (got >= 3) {
        el('circle', { cy: -60, r: 92, fill: 'url(#cool)' }, g);
        const sm = img('snowman', -46, -126, 92, 126, g, { id: 'snowmanArt' });
        if (typeof snowmanHatFalling === 'function' && snowmanHatFalling()) sm.setAttribute('clip-path', 'inset(22% 0 0 0)');
      }
      return;
    }
    if (game.doorOpen) el('circle', { cy: -56, r: 112, fill: 'url(#warm)', class: 'flicker' }, g);
    if (game.doorOpen) img('door_open', -40, -119, 80, 122, g);
    else img('door_closed', -39, -115, 78, 115, g);
  }

  /* The gate columns are kept between calls and only their transform changes, so the CSS transition (.gateArt) slides them up and
     down when a plate is pressed. They are rebuilt only when the room's gates are different (a new room: `fresh`, no animation). */
  const gateView = { key: '', cols: [], plates: null };
  function drawGates(fresh) {
    const box = $('gates');
    const cols = new Map();
    for (const gt of game.gates) cols.set(gt.c, [...(cols.get(gt.c) || []), gt.r]);
    const spec = [...cols].map(([c, rows]) => ({ c, top: Math.min(...rows) * T, h: rows.length * T }));
    const key = spec.map(s => `${s.c},${s.top},${s.h}`).join(';');
    const kept = gateView.plates && gateView.plates.parentNode === box && gateView.cols.every(n => n.parentNode === box);
    if (fresh || key !== gateView.key || !kept) {
      box.textContent = '';
      gateView.key = key;
      gateView.cols = spec.map(s => {
        const a = el('g', { class: 'gateArt' }, box);
        img('gate', s.c * T - 4, s.top, T + 8, s.h, a);
        return a;
      });
      gateView.plates = el('g', {}, box);
    }
    gateView.cols.forEach((a, i) => { a.style.transform = `translateY(${game.gatesOpen ? -spec[i].h * .9 : 0}px)`; });
    const plates = gateView.plates;
    plates.textContent = '';
    for (const p of game.plates) {
      const x = p.c * T, bottom = (p.r + 1) * T + 2;
      if (p.down) img('plate_down', x + 1, bottom - 11, T - 2, 11, plates);
      else img('plate_up', x + 1, bottom - 20, T - 2, 20, plates);
    }
  }

  function drawItems() {
    const box = $('items');
    box.textContent = '';
    game.items.forEach((it, i) => {
      const g = el('g', { 'data-i': i }, box);
      if (it.kind === '*') { el('circle', { r: 28, fill: 'url(#cool)' }, g); img('flake', -15, -18, 30, 36, g); }
      if (it.kind === 'h') { el('circle', { r: 28, fill: 'url(#rose)' }, g); img('heart', -16, -15, 32, 30, g); }
      if (it.kind === 'o') { el('circle', { r: 28, fill: 'url(#cool)' }, g); img('ball', -17, -17, 34, 34, g); }
      if (it.kind === '+') starSprite(g, 0, 0, 24, 'warm');
    });
  }

  /* The little decorative star ('+', PLAN A3) and every other 'fx_star' use: a soft glow with the painted star on it. */
  function starSprite(parent, x, y, size, glow) {
    const [w, h] = SIZES.fx_star || [56, 56];
    if (glow) el('circle', { cx: x, cy: y, r: size * 1.15, fill: `url(#${glow})` }, parent);
    return img('fx_star', x - size * w / h / 2, y - size / 2, size * w / h, size, parent);
  }

  function drawGlows() {
    const box = $('glows');
    box.textContent = '';
    game.level().glows.forEach(([x, y, r, fill], i) => {
      el('circle', { class: 'flicker', cx: x, cy: y, r, fill: `url(#${fill})`, style: `animation-delay:-${i * .9}s` }, box);
    });
  }

  function drawItemBob(now) {
    const nodes = $('items').children;
    game.items.forEach((it, i) => {
      const n = nodes[i];
      if (!n) return;
      if (it.got) { n.setAttribute('visibility', 'hidden'); return; }
      const sway = Math.sin(now * 1.6 + i) * 6;
      const pulse = it.kind === '+' ? 1 + Math.sin(now * 4 + i * 1.7) * .1 : 1;
      n.setAttribute('transform', `translate(${it.x} ${(it.y + Math.sin(now * 2.4 + i) * 3).toFixed(1)}) rotate(${it.kind === 'h' ? 0 : it.kind === '+' ? (sway * 2).toFixed(1) : sway.toFixed(1)}) scale(${pulse.toFixed(3)})`);
    });
  }

  /* Fish under the lake (PLAN A5: water, ice, fish). Two painted frames, swimming to and fro inside each stretch of water.
     They are decoration only: drawn when the room names the word 'fish' and both frames exist, hidden over frozen cells. */
  const fishSwarm = [];
  function drawFish() {
    const box = layer('decor', 'goal');
    box.textContent = '';
    fishSwarm.length = 0;
    const lv = LEVELS[game.index];
    if (!lv || !(lv.words || []).includes('fish') || !SIZES.fish_1 || !SIZES.fish_2) return;
    for (const run of runs((c, r) => cellAt(c, r) === '~')) {
      const n = Math.max(1, Math.round(run.len / 4));
      for (let k = 0; k < n; k++) {
        const size = 17 + ((run.c + k) % 3) * 3;
        const frames = [1, 2].map(f => {
          const [w, h] = SIZES['fish_' + f];
          return img('fish_' + f, -size * w / h / 2, -size / 2, size * w / h, size, box, { visibility: 'hidden' });
        });
        const x0 = run.c * T + 14, x1 = (run.c + run.len) * T - 14;
        fishSwarm.push({ frames, x0, x1, x: x0 + (x1 - x0) * ((k + .5) / n), y: run.r * T + 22 + (k % 2) * 7, dir: k % 2 ? -1 : 1, v: 20 + ((run.c * 7 + k * 5) % 5) * 5, ph: k * 1.3, row: run.r });
      }
    }
  }
  function drawFishFrame(now, dt) {
    for (const f of fishSwarm) {
      f.x += f.dir * f.v * dt;
      if (f.x > f.x1) { f.x = f.x1; f.dir = -1; } else if (f.x < f.x0) { f.x = f.x0; f.dir = 1; }
      const wet = cellAt(Math.floor(f.x / T), f.row) === '~';
      const frame = Math.floor(now * 4 + f.ph) % 2;
      f.frames.forEach((node, i) => {
        node.setAttribute('visibility', wet && i === frame ? 'visible' : 'hidden');
        node.setAttribute('transform', `translate(${f.x.toFixed(1)} ${(f.y + Math.sin(now * 1.7 + f.ph) * 3).toFixed(1)}) scale(${f.dir} 1)`);
      });
    }
  }

  /* Ambient room life & subtle stage background parallax: golden light-butterflies in garden, drifting chime-motes in music. */
  const ambientSwarm = [];
  let bgParallaxX = 0;
  function drawAmbient() {
    ambientSwarm.length = 0;
    const lv = LEVELS[game.index];
    if (!lv) return;
    const box = layer('ambient', 'shadows');
    box.textContent = '';
    if (lv.id === 'garden') {
      const spots = [[190, 175], [370, 210], [560, 155], [750, 195], [470, 290]];
      spots.forEach(([x, y], i) => {
        const g = el('g', { opacity: .88 }, box);
        el('circle', { r: 12, fill: 'url(#warm)', opacity: .65 }, g);
        const wL = el('path', { d: 'M0 0C-9 -9 -12 -1 -4 4C-10 8 -5 12 0 5Z', fill: i % 2 ? '#ffe699' : '#ffc6dc', opacity: .92 }, g);
        const wR = el('path', { d: 'M0 0C9 -9 12 -1 4 4C10 8 5 12 0 5Z', fill: i % 2 ? '#fff2bf' : '#ffdbe9', opacity: .92 }, g);
        ambientSwarm.push({ kind: 'butterfly', g, wL, wR, x0: x, y0: y, ph: i * 1.4 });
      });
    } else if (lv.id === 'music') {
      const spots = [[180, 165], [340, 130], [510, 150], [670, 135], [810, 170]];
      const cols = ['#ff8aa8', '#ffd27a', '#8be0ff', '#a8f0c6', '#d4b8ff'];
      spots.forEach(([x, y], i) => {
        const g = el('g', { opacity: .72 }, box);
        el('circle', { r: 10, fill: 'url(#cool)', opacity: .55 }, g);
        el('path', { d: 'M-2 3a3.2 2.4 -20 1 0 4 0V-7l5 1.8v2.6l-5-1.6', fill: cols[i % cols.length], stroke: cols[i % cols.length], 'stroke-width': 1.2, 'stroke-linecap': 'round' }, g);
        ambientSwarm.push({ kind: 'note', g, x0: x, y0: y, ph: i * 1.25 });
      });
    }
  }
  function updateAmbient(now, dt) {
    const lead = game.sisters[game.mode === 'solo' ? 'frost' : (game.active || 'frost')] || game.sisters.frost;
    const targetPx = lead ? (480 - (lead.x + lead.w / 2)) / 480 * 7.5 : 0;
    bgParallaxX += (targetPx - bgParallaxX) * Math.min(1, dt * 4);
    const px = bgParallaxX.toFixed(2);
    $('bg').setAttribute('transform', `translate(${px} 0)`);
    $('glows').setAttribute('transform', `translate(${px} 0)`);
    for (const a of ambientSwarm) {
      if (a.kind === 'butterfly') {
        const x = a.x0 + Math.sin(now * .75 + a.ph) * 42 + Math.cos(now * 1.6 + a.ph) * 12;
        const y = a.y0 + Math.cos(now * 1.1 + a.ph) * 22 + Math.sin(now * 2.3 + a.ph) * 6;
        const flap = (.32 + Math.abs(Math.sin(now * 9.5 + a.ph)) * .68).toFixed(2);
        const tilt = (Math.cos(now * .75 + a.ph) * 14).toFixed(1);
        a.g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${tilt})`);
        a.wL.setAttribute('transform', `scale(${flap} 1)`);
        a.wR.setAttribute('transform', `scale(${flap} 1)`);
      } else {
        const x = a.x0 + Math.sin(now * .6 + a.ph) * 18;
        const y = a.y0 + Math.cos(now * .9 + a.ph) * 14;
        const pulse = (.85 + Math.sin(now * 2.4 + a.ph) * .15).toFixed(2);
        a.g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${pulse})`);
      }
    }
  }

  /* The memory fragment: a glowing star that waits at level.memory until the logic reports it found (event 'memory'). */
  let fragNode = null;
  function drawFragment() {
    const box = $('memory');
    box.textContent = '';
    fragNode = null;
    const lv = game.level();   // the fragment of the screen being played
    if (!lv || !lv.memory || game.memoryFound) return;
    const [c, r] = lv.memory;
    fragNode = el('g', { 'data-x': c * T + T / 2, 'data-y': r * T + T / 2 }, box);
    img('fx_glow', -26, -24, 52, 46, fragNode, { opacity: .8 });
    starSprite(fragNode, 0, 0, 26);
  }
  function updateFragment(now) {
    if (!fragNode) return;
    const mx = +fragNode.dataset.x, my = +fragNode.dataset.y;
    fragNode.setAttribute('transform', `translate(${mx} ${(my + Math.sin(now * 2) * 4).toFixed(1)}) scale(${(1 + Math.sin(now * 3.1) * .08).toFixed(3)})`);
  }
  function foundFragment() {
    if (!fragNode) return;
    const mx = +fragNode.dataset.x, my = +fragNode.dataset.y;
    fragNode.remove(); fragNode = null;
    burst(mx, my, 'star', 8, 110);
    puff('ring', mx, my, 90, .7);
  }

  /* Everything that depends on the room: called for the 'load' event, whenever the logic (re)loads a level. */
  function rebuild() {
    const lv = LEVELS[game.index];
    $('bg').setAttribute('href', SRC(lv.bg));
    drawTiles(); drawGlows(); drawItems(); drawGoal(); drawGates(true); drawFish(); drawAmbient(); drawFragment();
    if (typeof drawToys === 'function') drawToys();   // 15-toys
    clearFx();
    guideReset();
  }
