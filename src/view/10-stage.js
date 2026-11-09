  /* Tiles */
  const isSolid = ch => '#XIB'.includes(ch);
  const cellAt = (c, r) => (r < 0 || r >= ROWS || c < 0 || c >= COLS) ? '#' : game.grid[r][c];

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
    let wall = '', rim = '';
    const under = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (game.grid[r][c] !== '#') continue;
      const x = c * T, y = r * T;
      wall += `M${x} ${y}h${T}v${T}h-${T}z`;
      if (r < ROWS - 1 && cellAt(c, r + 1) !== '#') { rim += `M${x} ${y + T}h${T}`; under.push([x, y + T]); }
      if (cellAt(c + 1, r) !== '#') rim += `M${x + T} ${y}v${T}`;
      if (cellAt(c - 1, r) !== '#') rim += `M${x} ${y}v${T}`;
    }
    el('path', { d: wall, fill: 'url(#brick)' }, box);
    el('path', { d: wall, fill: '#26337f', opacity: .44 }, box);
    el('path', { d: rim, stroke: '#1a2565', 'stroke-width': 3, 'stroke-linecap': 'round', opacity: .62, fill: 'none' }, box);
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
      if (got >= 3) { el('circle', { cy: -60, r: 92, fill: 'url(#cool)' }, g); img('snowman', -46, -126, 92, 126, g); }
      return;
    }
    if (game.doorOpen) el('circle', { cy: -56, r: 112, fill: 'url(#warm)', class: 'flicker' }, g);
    if (game.doorOpen) img('door_open', -40, -119, 80, 122, g);
    else img('door_closed', -39, -115, 78, 115, g);
  }

  function drawGates() {
    const box = $('gates');
    box.textContent = '';
    const cols = new Map();
    for (const gt of game.gates) cols.set(gt.c, [...(cols.get(gt.c) || []), gt.r]);
    for (const [c, rows] of cols) {
      const top = Math.min(...rows) * T, h = rows.length * T;
      const a = el('g', { class: 'gateArt', style: `transform:translateY(${game.gatesOpen ? -h * .9 : 0}px)` }, box);
      img('gate', c * T - 4, top, T + 8, h, a);
    }
    for (const p of game.plates) {
      const x = p.c * T, bottom = (p.r + 1) * T + 2;
      if (p.down) img('plate_down', x + 1, bottom - 11, T - 2, 11, box);
      else img('plate_up', x + 1, bottom - 20, T - 2, 20, box);
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
    LEVELS[game.index].glows.forEach(([x, y, r, fill], i) => {
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

  /* The memory fragment: a glowing star that waits at level.memory until the logic reports it found (event 'memory'). */
  let fragNode = null;
  function drawFragment() {
    const box = $('memory');
    box.textContent = '';
    fragNode = null;
    const lv = LEVELS[game.index];
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
    drawTiles(); drawGlows(); drawItems(); drawGoal(); drawGates(); drawFish(); drawFragment();
    if (typeof drawToys === 'function') drawToys();   // 15-toys
    clearFx();
    guideReset();
  }
