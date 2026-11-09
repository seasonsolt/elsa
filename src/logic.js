/* Game rules: plain global const/function declarations, no module syntax, so this file can be inlined in a <script>
   and also evaluated in node (new Function / vm). It reads LEVELS (levels.js) only when a level is loaded.
   Since S3 it also holds the six new toys (src/CONTRACT.md section 9): ramps / and backslash, spring mushrooms J, snow bunnies R + nests N,
   ice floes M, note steps 1-5 with LEVELS[i].melody, and ice flowers F (goal 'garden'). Their numbers are in TOYS. */
const T = 40, COLS = 24, ROWS = 13;
const PHYS = { gravity: 1800, speed: 220, jump: 575, maxFall: 900, coyote: 0.09, buffer: 0.12 };
/* Solo mode (a child plays, PLAN A2): slower, more forgiving. Same jump height, so every room keeps its geometry. */
const KID_PHYS = Object.assign({}, PHYS, { speed: 180, coyote: 0.14, buffer: 0.18 });
const MAX_BLOCKS = 3;

/* Every legal map character (the meanings are listed in levels.js). All of them are live since S3; `future` stays for the next reservation. */
const TILE_CHARS = {
  live: '.#=~XIBGP*hoDSEA+/\\JRNM12345F',
  future: '',
};

/* The six new toys of PLAN B1 (src/CONTRACT.md section 9). All numbers in one place; the view and level design read them from here. */
const TOYS = {
  springV: 960,              // px/s up when launched by a spring mushroom J: ~252 px = 6.3 tiles of rise with gravity 1800 (a normal jump is 2.3),
                             // so a ledge exactly 6 tiles above the mushroom's top is reachable with some margin, a 7-tile one is not
  slideBase: 1.4,            // sliding speed on a slope, times the run speed of the mode (solo 180 -> 252 px/s)
  slideInput: 0.2,           // holding the arrow with / against the slide adds / takes away this much (so 1.2 .. 1.6 times the run speed)
  slideMax: 1.6,             // hard cap of the horizontal speed while sliding or flying off a slide
  slideAcc: 1000,            // px/s^2 the slide speeds up (about 0.25 s from rest)
  slideStep: 12,             // px a body may climb along a ramp in one step; a taller edge is a wall
  floeSpeed: 60,             // px/s of a moving ice floe
  floePause: 3,              // s a floe stands still after Frost's magic
  floeReach: 3 * T,          // Frost's magic pauses floes whose box is within this many px
  bunnyW: 22, bunnyH: 22,    // body of a snow bunny
  bunnyWake: 1.5 * T,        // a lost bunny starts to follow a sister this close (box to box)
  bunnyWakeLantern: 3 * T,   // ... this close when the sister is Nuan (her lantern)
  bunnyGap: 30,              // px a following bunny keeps behind the one ahead
  bunnyHop: 470,             // px/s of a bunny's hop (1.5 tiles: over a 1-tile step)
  bunnyFar: 6 * T,           // a following bunny blinks to the leader when farther than this
  bunnyStuck: 2.5,           // ... or when it has not got closer for this many seconds (and is > 2 tiles away)
  nestPull: 2.5 * T,         // a following bunny this close to a nest tile N (leader within 3.5 tiles of it) walks in
  bloomReach: 2 * T,         // Nuan's magic blooms flowers this close
};

/* Solid for walking: walls, ice, the spring mushroom and the note steps, and an iron gate while it is shut.
   (Slopes are not solid, they are a surface; floes are entities. Both have their own rules in createGame.) */
function isSolidTile(ch, gatesOpen) {
  return ch === '#' || ch === 'X' || ch === 'I' || ch === 'B' || ch === 'J' || (ch >= '1' && ch <= '5') || (ch === 'G' && !gatesOpen);
}

function createGame() {
  const g = {
    state: 'title', index: 0, grid: [], items: [], blocks: [], events: [],
    sisters: {}, plates: [], gates: [], gatesOpen: false, door: null, goal: 'door',
    doorOpen: false, clearT: 0, time: 0,
    input: { frost: { l: 0, r: 0, d: 0 }, nuan: { l: 0, r: 0, d: 0 } },
    /* PLAN A1: 'solo' = one child plays g.player, companion.js drives the other sister; 'duo' = two players, the original rules.
       Set before g.start / g.load. */
    mode: 'solo', player: 'nuan',
    progress: 0,                       // counts real progress (the view's stuck timer watches it)
    stars: { total: 0, got: 0 },       // small decorative '+' stars of the room
    memory: null, memoryFound: false,  // hidden memory fragment: { c, r, x, y } of LEVELS[i].memory
    guideDone: [],
    /* S3 toys (CONTRACT section 9). Rebuilt by g.load. */
    floes: [],                         // [{ id, x, y, w, vx, paused }]  x, y = top-left in px, w in px, 1 tile tall
    bunnies: [],                       // [{ id, c, r, x, y, state, dir, ... }]  x = centre, y = feet in px; state lost | follow | home
    bunniesHome: 0,
    melody: null,                      // { seq, pos, done } when the room has LEVELS[i].melody
    flowers: [],                       // [{ c, r, open }]
  };
  const phys = () => (g.mode === 'solo' ? KID_PHYS : PHYS);
  let nests = [];                      // [{ c, r }] bunny homes of this room
  const otherOf = id => (id === 'frost' ? 'nuan' : 'frost');
  const emit = (type, data) => g.events.push(Object.assign({ type }, data));

  function makeSister(id, c, r) {
    const w = 26, h = id === 'frost' ? 58 : 54;
    const x = c * T + (T - w) / 2, y = (r + 1) * T - h;
    return { id, x, y, w, h, vx: 0, vy: 0, dir: 1, ground: false, coyote: 0, jumpBuf: 0, actBuf: 0,
      doubled: false, dropT: 0, splash: 0, atGoal: false, safe: { x, y },
      slide: 0, slope: 0, slackT: 0, noteAt: null };   // slide: px/s of ramp momentum; slope: +1 / -1 while standing on a ramp (downhill direction); noteAt: the note step she stands on
  }

  g.load = i => {
    const lv = LEVELS[i];
    g.index = i; g.items = []; g.blocks = []; g.plates = []; g.gates = [];
    g.gatesOpen = false; g.doorOpen = false; g.goal = lv.goal || 'door'; g.door = null;
    g.floes = []; g.bunnies = []; g.bunniesHome = 0; g.flowers = []; nests = [];
    g.melody = lv.melody && lv.melody.length ? { seq: lv.melody.slice(), pos: 0, done: false } : null;
    g.progress = 0; g.stars = { total: 0, got: 0 }; g.memoryFound = false; g.guideDone = (lv.guide || []).map(() => false);
    g.memory = lv.memory ? { c: lv.memory[0], r: lv.memory[1], x: lv.memory[0] * T + T / 2, y: lv.memory[1] * T + T / 2 } : null;
    g.grid = lv.map.map((row, r) => row.split('').map((ch, c) => {
      if (ch === 'R') { addBunny(c, r); return '.'; }
      if (ch === 'F') { g.flowers.push({ c, r, open: false }); return '.'; }
      if (ch === 'N') nests.push({ c, r });                 // stays in the grid: the view draws the nest from it
      if (ch === 'M') return '.';                          // floes are entities, made below from the runs of M
      if (ch === 'E') { g.sisters.frost = makeSister('frost', c, r); return '.'; }
      if (ch === 'A') { g.sisters.nuan = makeSister('nuan', c, r); return '.'; }
      if (ch === '*' || ch === 'h' || ch === 'o' || ch === '+') {
        g.items.push({ kind: ch, c, r, x: c * T + T / 2, y: r * T + T / 2, got: false });
        if (ch === '+') g.stars.total++;
        return '.';
      }
      if (ch === 'D' || ch === 'S') { g.door = { c, r, x: c * T + T / 2, bottom: (r + 1) * T }; return '.'; }
      if (ch === 'P') g.plates.push({ c, r, down: false });
      if (ch === 'G') g.gates.push({ c, r });
      return ch;
    }));
    lv.map.forEach((row, r) => {
      for (const m of row.matchAll(/M+/g)) {
        g.floes.push({ id: g.floes.length, x: m.index * T, y: r * T, w: m[0].length * T, vx: TOYS.floeSpeed, paused: false, pauseT: 0, dir: 1 });
      }
    });
    emit('load');
  };

  /* A lost snow bunny. Bodies of bunnies use the same moveX / moveY as the sisters. */
  function addBunny(c, r) {
    const w = TOYS.bunnyW, h = TOYS.bunnyH, x = c * T + (T - w) / 2, y = (r + 1) * T - h;
    const b = { id: g.bunnies.length, c, r, state: 'lost', dir: 1, leader: null, order: 0, safe: { x, y }, stuckT: 0, jumpCool: 0,
      body: { x, y, w, h, vx: 0, vy: 0, ground: false, dropT: 0, slide: 0, slope: 0, slackT: 0 } };
    b.x = x + w / 2; b.y = y + h;
    g.bunnies.push(b);
  }

  const cell = (c, r) => (c < 0 || c >= COLS || r < 0 || r >= ROWS) ? '#' : g.grid[r][c];
  const hardSolid = ch => isSolidTile(ch, g.gatesOpen);

  function overlapsTile(s, c, r) {
    return s.x < (c + 1) * T && s.x + s.w > c * T && s.y < (r + 1) * T && s.y + s.h > r * T;
  }

  /* slack: the feet may dip this far into a solid tile of row minRow or below without a hit, except in the column under the middle of
     the body. A body standing on a ramp has half its width over the neighbouring floor, which is higher than the ramp surface under
     its centre (that floor is in the ramp's row). */
  function hits(s, x, y, slack = 0, minRow = 0) {
    const c0 = Math.floor(x / T), c1 = Math.floor((x + s.w - 0.001) / T);
    const r0 = Math.floor(y / T), r1 = Math.floor((y + s.h - 0.001) / T), mid = Math.floor((x + s.w / 2) / T);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      if (hardSolid(cell(c, r)) && !(slack && c !== mid && r >= minRow && y + s.h - r * T <= slack)) return { c, r };
    }
    return null;
  }
  const rampSlack = s => (s.slope || s.slackT > 0 ? s.w / 2 + 2 : 0);   // (slackT: a moment after the body left a ramp)

  function moveX(s, dx) {
    if (!dx) return;
    const hit = hits(s, s.x + dx, s.y, rampSlack(s), s.rampRow);
    if (!hit) { s.x += dx; return; }
    s.x = dx > 0 ? hit.c * T - s.w : (hit.c + 1) * T;
    s.vx = 0; s.slide = 0;
  }

  function moveY(s, dy) {
    s.ground = false;
    if (dy > 0) {
      const oldBottom = s.y + s.h, newBottom = oldBottom + dy;
      const hit = hits(s, s.x, s.y + dy, rampSlack(s), s.rampRow);
      if (hit) { s.y = hit.r * T - s.h; s.vy = 0; s.ground = true; return; }
      if (s.dropT <= 0) {
        const r = Math.floor((newBottom - 0.001) / T);
        const top = r * T;
        if (oldBottom <= top + 0.001 && newBottom > top) {
          const c0 = Math.floor(s.x / T), c1 = Math.floor((s.x + s.w - 0.001) / T);
          for (let c = c0; c <= c1; c++) if (cell(c, r) === '=') {
            s.y = top - s.h; s.vy = 0; s.ground = true; return;
          }
        }
        for (const f of g.floes) {        // an ice floe is a one-way platform too (and Down drops through it)
          if (s.x < f.x + f.w && s.x + s.w > f.x && oldBottom <= f.y + 0.001 && newBottom > f.y) {
            s.y = f.y - s.h; s.vy = 0; s.ground = true; return;
          }
        }
      }
      s.y += dy;
    } else if (dy < 0) {
      const hit = hits({ w: s.w, h: -dy }, s.x, s.y + dy);          // only what is above the head can stop a rising body
      if (hit) { s.y = (hit.r + 1) * T; s.vy = 0; return; }
      s.y += dy;
    }
  }

  /* ---------- ramps ( / and backslash ) ----------
     A ramp tile is not solid, it is a surface: the backslash is high on the left and runs down to the right, `/` the other way round.
     A body (sister or bunny) stands on the surface under the centre of its feet. Ramps are slippery: standing on one slides downhill. */
  const isRamp = ch => ch === '/' || ch === '\\';
  const rampY = (c, r, cx) => {
    const ch = cell(c, r);
    if (!isRamp(ch)) return null;
    const u = Math.min(T, Math.max(0, cx - c * T));
    return r * T + (ch === '\\' ? u : T - u);
  };

  /* After a body moved: put it on the ramp surface under it, or stop it at the high face of a ramp (a step taller than slideStep is a wall).
     prev = { x, feet, ground } from before the move. Sets s.slope (+1 downhill to the right, -1 to the left, 0 not on a ramp). */
  function rampSnap(s, prev, dt) {
    rampSnapNow(s, prev, false);
    s.slackT = s.slope ? 0.25 : Math.max(0, (s.slackT || 0) - dt);
  }
  function rampSnapNow(s, prev, noWall) {
    const cx = s.x + s.w / 2, c = Math.floor(cx / T), feet = s.y + s.h;
    const was = s.slope;
    s.slope = 0;
    if (c < 0 || c >= COLS) return;
    const rf = Math.floor((feet - 0.001) / T), moved = Math.abs(s.x - prev.x);
    const entering = Math.floor((prev.x + s.w / 2) / T) !== c;
    for (const r of [rf, rf + 1, rf - 1]) {
      const surf = rampY(c, r, cx);
      if (surf == null) continue;
      const below = feet - surf;                          // > 0: the feet are inside the ramp
      if (entering && !noWall && below > TOYS.slideStep) {
        s.x = prev.x; s.vx = 0; s.slide = 0;
        return rampSnapNow(s, prev, true);
      }
      if (s.vy < 0) continue;                             // going up: pass through
      const ok = prev.ground ? (below >= -(TOYS.slideStep + moved) && below <= TOYS.slideStep)
        : (below >= 0 && prev.feet <= surf + moved + 1);
      if (!ok) continue;
      s.y = surf - s.h; s.vy = 0; s.ground = true;
      s.slope = cell(c, r) === '\\' ? 1 : -1; s.rampRow = r;
      if (!was) s.slide = s.vx;                           // keep the speed you ran onto the ramp with
      return;
    }
  }

  /* ---------- spring mushrooms (J) ---------- */
  function springBelow(s) {
    const r = Math.floor((s.y + s.h + 0.5) / T);
    for (const c of [Math.floor((s.x + s.w / 2) / T), Math.floor(s.x / T), Math.floor((s.x + s.w - 0.001) / T)]) {
      if (cell(c, r) === 'J') return { c, r };
    }
    return null;
  }

  function bounce(s, sp) {
    s.vy = -TOYS.springV; s.jumpBuf = 0; s.coyote = 0; s.ground = false; s.doubled = false;
    emit('bounce', { who: s.id, c: sp.c, r: sp.r });
  }

  /* ---------- note steps (1..5) ---------- */
  function stepNotes(s) {
    let at = null, n = 0;
    if (s.ground) {
      const r = Math.floor((s.y + s.h + 0.5) / T), c = Math.floor((s.x + s.w / 2) / T), ch = cell(c, r);
      if (ch >= '1' && ch <= '5') { at = c + ',' + r; n = Number(ch); }
    }
    const fresh = at && at !== s.noteAt;
    s.noteAt = at;
    if (!fresh || (g.mode === 'solo' && s.id !== g.player)) return;     // solo: only the child's sister plays the steps
    const m = g.melody, playing = m && !m.done;
    const ok = !playing || n === m.seq[m.pos];
    if (playing && ok) { m.pos++; g.progress++; }
    emit('note', { n, ok, who: s.id, c: Math.floor((s.x + s.w / 2) / T), r: Math.floor((s.y + s.h + 0.5) / T), pos: m ? m.pos : 0 });
    if (playing && m.pos >= m.seq.length) { m.done = true; g.progress++; emit('melody'); }
  }

  /* ---------- ice floes (M) ---------- */
  /* may the floe move one more step in `dir`: nothing solid ahead in its row, and water under the leading edge */
  function floeCanGo(f, dir, step) {
    const nx = f.x + dir * step, r = Math.floor(f.y / T);
    const col = dir > 0 ? Math.floor((nx + f.w - 0.001) / T) : Math.floor(nx / T);
    return !hardSolid(cell(col, r)) && cell(col, r + 1) === '~';
  }

  const rides = (b, f) => b.ground && Math.abs(b.y + b.h - f.y) < 0.5 && b.x + b.w / 2 >= f.x && b.x + b.w / 2 <= f.x + f.w;

  function updateFloes(dt) {
    const bodies = Object.values(g.sisters).concat(g.bunnies.map(b => b.body));
    for (const f of g.floes) {
      if (f.pauseT > 0) {
        f.pauseT -= dt;
        if (f.pauseT <= 0) { f.pauseT = 0; f.paused = false; emit('floe', { id: f.id, paused: false }); }
      }
      let d = 0;
      if (!f.paused) {
        const step = TOYS.floeSpeed * dt;
        if (floeCanGo(f, f.dir, step)) d = f.dir * step;
        else if (floeCanGo(f, -f.dir, step)) { f.dir = -f.dir; d = f.dir * step; }
      }
      f.vx = d ? d / dt : 0;
      if (!d) continue;
      const riders = bodies.filter(b => !(b.splash > 0) && rides(b, f));
      f.x += d;
      for (const b of riders) moveX(b, d);
    }
  }

  /* Frost's magic: floes within reach stand still for a few seconds. Returns true when it did something. */
  function pauseFloes(s) {
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    let any = false;
    for (const f of g.floes) {
      const dx = Math.max(f.x - cx, 0, cx - (f.x + f.w)), dy = Math.max(f.y - cy, 0, cy - (f.y + T));
      if (Math.hypot(dx, dy) > TOYS.floeReach) continue;
      if (!f.paused) { f.paused = true; f.vx = 0; emit('floe', { id: f.id, paused: true }); }
      f.pauseT = TOYS.floePause; any = true;
    }
    if (any) { g.progress++; emit('magic', { who: 'frost' }); }
    return any;
  }

  function freeze(fromC, r, dir) {
    let n = 0;
    for (let c = fromC; n < 3 && cell(c, r) === '~'; c += dir, n++) {
      g.grid[r][c] = 'I';
      emit('freeze', { c, r });
    }
    if (n) g.progress++;
    return n;
  }

  function canBlock(c, r) {
    const ch = cell(c, r);
    if (ch !== '.' && ch !== 'P') return false;
    if (g.items.some(it => !it.got && it.kind !== '+' && it.c === c && it.r === r)) return false;   // (a small star never blocks the magic)
    if (g.door && c === g.door.c && (r === g.door.r || r === g.door.r - 1)) return false;
    if (g.floes.some(f => f.x < (c + 1) * T && f.x + f.w > c * T && f.y < (r + 1) * T && f.y + T > r * T)) return false;
    if (g.bunnies.some(b => overlapsTile(b.body, c, r))) return false;
    return !Object.values(g.sisters).some(s => overlapsTile(s, c, r));
  }

  function frostMagic(s) {
    if (pauseFloes(s)) return;                       // a floe in reach: the magic holds it still instead
    const fc = s.dir > 0 ? Math.floor((s.x + s.w - 0.001) / T) + 1 : Math.floor(s.x / T) - 1;
    const fr = Math.floor((s.y + s.h - 0.001) / T);
    const own = Math.floor((s.x + s.w / 2) / T);
    for (let r = fr; r <= fr + 3; r++) {
      if (cell(fc, r) === '~' && freeze(fc, r, s.dir)) { emit('magic', { who: 'frost' }); return; }
      if (cell(own, r) === '~' && freeze(own, r, s.dir)) { emit('magic', { who: 'frost' }); return; }
    }
    for (const r of [fr, fr - 1]) {
      if (canBlock(fc, r)) {
        if (g.blocks.length >= MAX_BLOCKS) removeBlock(g.blocks[0]);
        g.blocks.push({ c: fc, r, under: g.grid[r][fc] });
        g.grid[r][fc] = 'B';
        emit('block', { c: fc, r });
        g.progress++;
        return;
      }
    }
    emit('fizz', { who: 'frost', x: s.x + s.w / 2, y: s.y });
  }

  function removeBlock(b) {
    g.blocks.splice(g.blocks.indexOf(b), 1);
    g.grid[b.r][b.c] = b.under;
    emit('unblock', { c: b.c, r: b.r });
  }

  function nuanMagic(s) {
    const pad = 26;
    const box = { x: s.x - pad, y: s.y - 10, w: s.w + pad * 2, h: s.h + 20 };
    const seeds = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (g.grid[r][c] === 'X' && overlapsTile(box, c, r)) seeds.push([c, r]);
    }
    const bloomed = bloomNear(s);
    if (!seeds.length) {
      if (bloomed) emit('magic', { who: 'nuan' });
      else emit('fizz', { who: 'nuan', x: s.x + s.w / 2, y: s.y });
      return;
    }
    while (seeds.length) {
      const [c, r] = seeds.pop();
      if (cell(c, r) !== 'X') continue;
      g.grid[r][c] = '.';
      emit('melt', { c, r });
      seeds.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
    }
    g.progress++;
    emit('magic', { who: 'nuan' });
  }

  function updateSister(s, dt) {
    if (s.splash > 0) {
      s.splash -= dt;
      s.slide = 0; s.slope = 0; s.slackT = 0; s.noteAt = null;
      if (s.splash <= 0) {
        let { x, y } = s.safe;
        if (hits(s, x, y)) {                         // an ice block (or a closed gate) has come to stand on the spot: the nearest free place
          const pos = placeBody(s, x + s.w / 2, y + s.h);
          if (pos) { x = pos.x; y = pos.y; }
        }
        s.x = x; s.y = y; s.vx = 0; s.vy = 0; s.ground = false;
        emit('respawn', { who: s.id });
      }
      return;
    }
    const P = phys();
    const inp = g.input[s.id];
    const move = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
    if (s.slope) {
      // standing on a ramp: slide downhill; the arrows add or take away a little (1.2 .. 1.6 times the run speed)
      const target = s.slope * TOYS.slideBase * P.speed + move * TOYS.slideInput * P.speed;
      const acc = TOYS.slideAcc * dt;
      s.slide += Math.max(-acc, Math.min(acc, target - s.slide));
      s.vx = s.slide;
      if (!move && Math.abs(s.slide) > 30) s.dir = s.slide > 0 ? 1 : -1;
    } else {
      // off the ramp the slide speed is only momentum: it fades quickly on the ground, slowly in the air
      const fade = (s.ground ? 1800 : 500) * dt;
      s.slide = Math.abs(s.slide) <= fade ? 0 : s.slide - Math.sign(s.slide) * fade;
      const cap = TOYS.slideMax * P.speed;
      s.vx = Math.max(-cap, Math.min(cap, move * P.speed + s.slide));
    }
    if (move) s.dir = move;
    if (inp.d) s.dropT = 0.18;
    s.dropT = Math.max(0, s.dropT - dt);
    s.coyote = s.ground ? P.coyote : Math.max(0, s.coyote - dt);
    s.jumpBuf = Math.max(0, s.jumpBuf - dt);

    if (s.jumpBuf > 0) {
      if (s.coyote > 0) {
        const sp = s.ground ? springBelow(s) : null;
        if (sp) bounce(s, sp);                  // pressing jump on a spring mushroom launches ~6 tiles
        else {
          s.vy = -P.jump; s.jumpBuf = 0; s.coyote = 0; s.ground = false; s.doubled = false;
          emit('jump', { who: s.id });
        }
      } else if ((s.id === 'nuan' || g.mode === 'solo') && !s.doubled) {   // solo: both sisters double jump
        s.vy = -P.jump; s.jumpBuf = 0; s.doubled = true;
        emit('doublejump', { x: s.x + s.w / 2, y: s.y + s.h });
      }
    }
    if (s.actBuf > 0) {
      s.actBuf = 0;
      if (s.id === 'frost') frostMagic(s); else nuanMagic(s);
    }

    const prev = { x: s.x, feet: s.y + s.h, ground: s.ground };
    const wasSlope = s.slope;
    s.vy = Math.min(P.maxFall, s.vy + P.gravity * dt);
    moveX(s, s.vx * dt);
    moveY(s, s.vy * dt);
    rampSnap(s, prev, dt);
    if (s.slope && !wasSlope) emit('slide', { who: s.id });
    if (s.ground && !prev.ground) {                // a landing on a spring mushroom bounces
      const sp = springBelow(s);
      if (sp) bounce(s, sp);
    }
    if (s.ground) s.doubled = false;
    stepNotes(s);

    const footR = Math.floor((s.y + s.h - 6) / T), midC = Math.floor((s.x + s.w / 2) / T);
    if (cell(midC, footR) === '~') {
      s.splash = 0.75;
      emit('splash', { x: s.x + s.w / 2, y: s.y + s.h });
      return;
    }
    if (s.ground && steadyUnder(s)) s.safe = { x: s.x, y: s.y };
  }

  /* both feet on something that stays (wall, ice, one-way platform): a good place to come back to after the water */
  function steadyUnder(s) {
    const below = Math.floor((s.y + s.h + 1) / T);
    const left = cell(Math.floor(s.x / T), below), right = cell(Math.floor((s.x + s.w - 0.001) / T), below);
    const steady = ch => ch === '#' || ch === 'I' || ch === '=';
    return steady(left) && steady(right);
  }

  function updateGates() {
    const sisters = Object.values(g.sisters);
    let pressed = false;
    for (const p of g.plates) {
      p.down = cell(p.c, p.r) === 'B' || sisters.some(s => s.splash <= 0 && overlapsTile(s, p.c, p.r));
      pressed = pressed || p.down;
    }
    const blocked = g.gates.some(gt => sisters.some(s => overlapsTile(s, gt.c, gt.r)));
    const next = pressed || (g.gatesOpen && blocked);
    if (next !== g.gatesOpen) { g.gatesOpen = next; if (next) g.progress++; emit('gate', { open: next }); }
  }

  function collect() {
    const solo = g.mode === 'solo';
    for (const it of g.items) {
      if (it.got) continue;
      for (const s of Object.values(g.sisters)) {
        if (s.splash > 0) continue;
        // duo: snowflakes are Frost's, hearts Nuan's. Solo: either sister takes either. Small stars: always either.
        if (!solo && ((it.kind === '*' && s.id !== 'frost') || (it.kind === 'h' && s.id !== 'nuan'))) continue;
        const dx = Math.abs(s.x + s.w / 2 - it.x), dy = Math.abs(s.y + s.h / 2 - it.y);
        if (dx < 28 && dy < s.h / 2 + 14) {
          it.got = true; g.progress++;
          if (it.kind === '+') { g.stars.got++; emit('collect', { kind: '+', x: it.x, y: it.y, n: g.stars.got }); }
          else emit('collect', { kind: it.kind, x: it.x, y: it.y });
          break;
        }
      }
    }
  }

  /* The door opens when every item is taken, every bunny is home and the melody (if the room has one) is played.
     A garden room (goal 'garden') has no door: it is cleared by the flowers instead. */
  function updateDoor() {
    if (g.goal === 'garden' || g.doorOpen) return;
    const open = g.items.every(it => it.got || it.kind === '+') && g.bunnies.every(b => b.state === 'home') && (!g.melody || g.melody.done);
    if (open) { g.doorOpen = true; g.progress++; emit('open'); }
  }

  /* ---------- snow bunnies (R) ---------- */
  /* a lost bunny wakes when a sister is this close (box to box); the next steps keep it trailing behind the one ahead */
  const boxDist = (s, x, y) => Math.hypot(Math.max(s.x - x, 0, x - (s.x + s.w)), Math.max(s.y - y, 0, y - (s.y + s.h)));

  /* walking one step further in `dir` would drop a body into water (an ice floe at its height counts as ground) */
  function wetAhead(body, dir) {
    const x = body.x + body.w / 2 + dir * (body.w / 2 + 4), c = Math.floor(x / T), feet = body.y + body.h;
    if (g.floes.some(f => x >= f.x && x <= f.x + f.w && Math.abs(f.y - feet) <= 6)) return false;
    for (let r = Math.floor((feet - 1) / T); r < ROWS; r++) {
      const ch = cell(c, r);
      if (ch === '~') return true;
      if (hardSolid(ch) || ch === '=' || isRamp(ch)) return false;
    }
    return false;
  }

  /* the nest this bunny should walk into: it is close, and so is the sister it follows */
  function nestFor(body, lead) {
    const bx = body.x + body.w / 2, br = Math.floor((body.y + body.h - 1) / T);
    for (const n of nests) {
      const nx = n.c * T + T / 2;
      if (Math.abs(br - n.r) <= 1 && Math.abs(bx - nx) <= TOYS.nestPull
        && Math.abs(lead.x + lead.w / 2 - nx) <= TOYS.nestPull + T && Math.abs(Math.floor((lead.y + lead.h - 1) / T) - n.r) <= 1) return nx;
    }
    return null;
  }

  function bunnyHome(b) {
    b.state = 'home'; b.body.vx = 0; g.bunniesHome++; g.progress++;
    emit('bunny', { id: b.id, state: 'home' });
  }

  function updateBunnies(dt) {
    if (!g.bunnies.length) return;
    const P = phys(), solo = g.mode === 'solo';
    const sisters = Object.values(g.sisters);
    // 1. lost bunnies wake up
    for (const b of g.bunnies) {
      if (b.state !== 'lost') continue;
      const bx = b.body.x + b.body.w / 2, by = b.body.y + b.body.h / 2;
      let who = null, best = Infinity;
      for (const s of sisters) {
        if (s.splash > 0) continue;
        const d = boxDist(s, bx, by);
        if (d <= (s.id === 'nuan' ? TOYS.bunnyWakeLantern : TOYS.bunnyWake) && d < best) { who = s; best = d; }
      }
      if (!who) continue;
      b.state = 'follow'; b.leader = who.id; b.order = 1 + Math.max(0, ...g.bunnies.map(o => o.order));
      g.progress++; emit('bunny', { id: b.id, state: 'follow' });
    }
    // 2. followers walk behind the one ahead (the sister, then each bunny in the order they woke up)
    const chains = {};
    for (const b of g.bunnies) if (b.state === 'follow') {
      if (solo) b.leader = g.player;
      (chains[b.leader] = chains[b.leader] || []).push(b);
    }
    const driving = new Map();
    for (const id of Object.keys(chains)) {
      const lead = g.sisters[id], list = chains[id].sort((p, q) => p.order - q.order);
      list.forEach((b, i) => driving.set(b, { lead, ahead: i ? list[i - 1].body : lead }));
    }
    for (const b of g.bunnies) {
      const body = b.body, d = driving.get(b);
      const prev = { x: body.x, feet: body.y + body.h, ground: body.ground };
      let want = 0, far = false, farDx = false;
      b.jumpCool -= dt;
      if (d) {
        const bcx = body.x + body.w / 2, lead = d.lead;
        let tx = d.ahead.x + d.ahead.w / 2, gap = TOYS.bunnyGap;
        const nest = nestFor(body, lead);
        if (nest != null) { tx = nest; gap = 2; }
        const dx = tx - bcx;
        if (Math.abs(dx) > gap) want = Math.sign(dx);
        if (want && wetAhead(body, want)) want = 0;
        const vmax = P.speed * 1.1;
        body.vx = want * Math.min(vmax, 25 + (Math.abs(dx) - gap) * 10);
        if (want) b.dir = want;
        if (want && body.ground && b.jumpCool <= 0 && hits(body, body.x + want * 3, body.y)) {     // hop over a one-tile step
          body.vy = -TOYS.bunnyHop; b.jumpCool = 0.35;
        }
        far = Math.hypot(lead.x + lead.w / 2 - bcx, lead.y + lead.h - (body.y + body.h)) > TOYS.bunnyFar;
        // not close to the one ahead: more than two tiles sideways, or more than two tiles above / below the sister (a ledge right over her head)
        farDx = Math.abs(dx) > 2 * T || Math.abs(lead.y + lead.h - (body.y + body.h)) > 2 * T;
      } else body.vx = 0;
      body.vy = Math.min(P.maxFall, body.vy + P.gravity * dt);
      moveX(body, body.vx * dt);
      moveY(body, body.vy * dt);
      rampSnap(body, prev, dt);
      const mid = Math.floor((body.x + body.w / 2) / T);
      if (cell(mid, Math.floor((body.y + body.h - 6) / T)) === '~') {      // into the water: back to dry ground
        emit('bunnysplash', { id: b.id, x: body.x + body.w / 2, y: body.y + body.h });
        body.x = b.safe.x; body.y = b.safe.y; body.vx = 0; body.vy = 0; body.ground = false;
      } else if (body.ground && steadyUnder(body)) b.safe = { x: body.x, y: body.y };
      if (b.state === 'follow' && body.ground && cell(mid, Math.floor((body.y + body.h - 1) / T)) === 'N') bunnyHome(b);
      // lost the trail (too far, or standing still more than two tiles from the one ahead): blink to the sister, like the sisters' own magic
      if (d && b.state === 'follow') {
        b.stuckT = farDx && Math.abs(body.x - prev.x) < 0.05 ? b.stuckT + dt : 0;
        const lead = d.lead;
        if ((far || b.stuckT > TOYS.bunnyStuck) && lead.ground && lead.splash <= 0) {
          const pos = placeBody(body, lead.x + lead.w / 2 - lead.dir * TOYS.bunnyGap, lead.y + lead.h);
          if (pos) {
            const from = { x: body.x + body.w / 2, y: body.y + body.h };
            body.x = pos.x; body.y = pos.y; body.vx = 0; body.vy = 0; body.ground = false; body.slope = 0; body.slide = 0; b.stuckT = 0;
            emit('bunnyblink', { id: b.id, from, to: { x: body.x + body.w / 2, y: body.y + body.h } });
          }
        }
      }
    }
    for (const b of g.bunnies) { b.x = b.body.x + b.body.w / 2; b.y = b.body.y + b.body.h; }
  }

  /* ---------- ice flowers (F) ---------- */
  function bloom(f) {
    f.open = true; g.progress++;
    emit('bloom', { c: f.c, r: f.r, n: g.flowers.filter(x => x.open).length, total: g.flowers.length });
  }

  /* Nuan's magic: flowers within two tiles open. Returns how many did. */
  function bloomNear(s) {
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    let n = 0;
    for (const f of g.flowers) {
      if (!f.open && Math.hypot(f.c * T + T / 2 - cx, f.r * T + T / 2 - cy) <= TOYS.bloomReach) { bloom(f); n++; }
    }
    return n;
  }

  /* Touching a flower opens it: either sister in solo, only Nuan in duo. */
  function updateFlowers() {
    for (const f of g.flowers) {
      if (f.open) continue;
      for (const s of Object.values(g.sisters)) {
        if (s.splash > 0 || (g.mode === 'duo' && s.id !== 'nuan')) continue;
        if (s.x < (f.c + 1) * T + 4 && s.x + s.w > f.c * T - 4 && s.y < (f.r + 1) * T && s.y + s.h > f.r * T) { bloom(f); break; }
      }
    }
  }

  /* The hidden memory fragment: either sister picks it up by touching it (same reach the view used to use). */
  function collectMemory() {
    const m = g.memory;
    if (!m || g.memoryFound) return;
    for (const s of Object.values(g.sisters)) {
      if (s.splash > 0 || m.x < s.x - 12 || m.x > s.x + s.w + 12 || m.y < s.y - 12 || m.y > s.y + s.h + 6) continue;
      g.memoryFound = true; g.progress++;
      emit('memory', { id: LEVELS[g.index].memoryId, x: m.x, y: m.y });
      return;
    }
  }

  /* Guide (PLAN A3): LEVELS[i].guide is the order a stuck player is led through. An entry is done when the item standing there is
     collected, or, for a plain spot (plate, door, snowman), when a sister reaches it (the door only once it is open). */
  function updateGuide() {
    const list = LEVELS[g.index].guide || [];
    list.forEach((e, i) => {
      if (g.guideDone[i]) return;
      // a bunny: done once it follows (or is home); a note: once the melody went past it; a flower: once it bloomed; a nest: once all bunnies are home
      const bunny = e.bunny != null ? g.bunnies.find(b => b.id === e.bunny) : g.bunnies.find(b => b.c === e.c && b.r === e.r);
      if (e.bunny != null || bunny) { if (!bunny || bunny.state !== 'lost') g.guideDone[i] = true; return; }
      if (e.note != null) { if (!g.melody || g.melody.done || g.melody.pos > e.note) g.guideDone[i] = true; return; }
      const flower = g.flowers.find(f => f.c === e.c && f.r === e.r);
      if (flower) { if (flower.open) g.guideDone[i] = true; return; }
      if (g.grid[e.r][e.c] === 'N') { if (g.bunnies.length && g.bunniesHome === g.bunnies.length) g.guideDone[i] = true; return; }
      const item = g.items.find(it => it.c === e.c && it.r === e.r && it.kind !== '+');
      if (item) { if (item.got) g.guideDone[i] = true; return; }          // collecting already counted as progress
      const isGoal = g.door && g.door.c === e.c && g.door.r === e.r;
      if (isGoal && !g.doorOpen) return;
      for (const s of Object.values(g.sisters)) {
        if (s.splash > 0 || Math.abs(s.x + s.w / 2 - (e.c * T + T / 2)) > T * 0.75) continue;
        if (s.y < (e.r + 1) * T && s.y + s.h > e.r * T) { g.guideDone[i] = true; g.progress++; return; }
      }
    });
  }

  function checkGoal() {
    const list = Object.values(g.sisters);
    if (g.goal === 'garden') {                     // no door: every flower open clears the room
      if (g.flowers.length && g.flowers.every(f => f.open)) { g.state = 'clear'; g.clearT = 1.5; emit('clear'); }
      return;
    }
    if (!g.door) return;                           // a room without a door or a snowman cannot be left through one
    const atDoor = s => g.doorOpen && s.ground && s.splash <= 0
      && Math.abs(s.x + s.w / 2 - g.door.x) < 44
      && Math.abs(s.y + s.h - g.door.bottom) < 4;
    for (const s of list) s.atGoal = atDoor(s);
    if (g.mode === 'solo') {
      // the player reached the goal: the companion's magic carries her there too
      const me = g.sisters[g.player], other = g.sisters[otherOf(g.player)];
      if (me.atGoal && !other.atGoal && other.splash <= 0) {
        const side = me.x + me.w / 2 >= g.door.x ? -1 : 1;
        if (g.blink(other.id, g.door.x + side * 22, g.door.bottom)) { other.ground = true; other.atGoal = atDoor(other); }
      }
    }
    if (list.every(s => s.atGoal)) {
      g.state = 'clear'; g.clearT = 1.5;
      emit('clear');
    }
  }

  g.start = i => { g.load(i); g.state = 'play'; };
  g.press = (id, what) => {
    if (g.state !== 'play') return;
    const s = g.sisters[id];
    if (what === 'jump') s.jumpBuf = phys().buffer;
    if (what === 'act') s.actBuf = 1;
  };

  /* Solo: switch the sister the child controls. */
  g.swap = () => {
    if (g.mode !== 'solo') return;
    g.player = otherOf(g.player);
    for (const id of ['frost', 'nuan']) Object.assign(g.input[id], { l: 0, r: 0, d: 0 });
    emit('swap', { player: g.player });
  };

  /* Magic blink (PLAN A1): teleport sister `id` so that her feet centre is at (x, y) in pixels (y = the ground line, like door.bottom).
     The spot is nudged to the nearest place where she fits and does not stand in water. Returns true when she moved.
     Emits { type: 'blink', who, from: {x, y}, to: {x, y} } with the same feet-centre convention. */
  /* Where body `s` fits when its feet centre should be at (x, y): the nearest place where it does not overlap anything solid
     and does not stand over water; { x, y } top-left, or null. */
  function placeBody(s, x, y) {
    const fits = (nx, ny) => {
      if (hits(s, nx, ny)) return false;
      const feet = ny + s.h;
      if (g.floes.some(f => nx + s.w / 2 >= f.x && nx + s.w / 2 <= f.x + f.w && f.y >= feet - 2 && f.y <= feet + 10)) return true;   // on an ice floe
      const midC = Math.floor((nx + s.w / 2) / T);
      for (let r = Math.floor((ny + s.h - 6) / T); r < ROWS; r++) {     // what she would land on: never water
        const ch = cell(midC, r);
        if (ch === '~') return false;
        if (hardSolid(ch) || isRamp(ch) || (ch === '=' && r * T >= ny + s.h - 1)) return true;
      }
      return true;
    };
    for (const dy of [0, -8, -T / 2, -T, -T * 1.5, -T * 2]) {
      for (const dx of [0, -T / 2, T / 2, -T, T, -T * 1.5, T * 1.5]) {
        const nx = x - s.w / 2 + dx, ny = y - s.h + dy;
        if (nx >= 0 && nx + s.w <= COLS * T && ny >= 0 && fits(nx, ny)) return { x: nx, y: ny };
      }
    }
    return null;
  }

  g.blink = (id, x, y) => {
    const s = g.sisters[id];
    if (!s || g.state !== 'play') return false;
    const pos = placeBody(s, x, y);
    if (!pos) return false;
    const from = { x: s.x + s.w / 2, y: s.y + s.h };
    s.x = pos.x; s.y = pos.y; s.vx = 0; s.vy = 0; s.ground = false; s.splash = 0;
    s.coyote = 0; s.jumpBuf = 0; s.actBuf = 0; s.doubled = false; s.dropT = 0; s.slide = 0; s.slope = 0; s.noteAt = null;
    if (steadyUnder(s)) s.safe = { x: s.x, y: s.y };
    emit('blink', { who: id, from, to: { x: s.x + s.w / 2, y: s.y + s.h } });
    return true;
  };

  g.guide = () => {
    const list = LEVELS[g.index].guide || [];
    const i = list.findIndex((e, k) => !g.guideDone[k]);
    if (i < 0) return null;
    const e = list[i];
    const out = { i, c: e.c, r: e.r, say: e.say, x: e.c * T + T / 2, y: e.r * T + T / 2 };
    if (e.bunny != null) out.bunny = e.bunny;
    if (e.note != null) out.note = e.note;
    return out;
  };

  g.step = dt => {
    g.time += dt;
    if (g.state === 'clear') {
      g.clearT -= dt;
      if (g.clearT <= 0) {
        if (g.index + 1 < LEVELS.length) g.start(g.index + 1);
        else { g.state = 'win'; emit('win'); }
      }
      return;
    }
    if (g.state !== 'play') return;
    updateFloes(dt);
    updateSister(g.sisters.frost, dt);
    updateSister(g.sisters.nuan, dt);
    updateGates();
    collect();
    updateBunnies(dt);
    updateFlowers();
    updateDoor();
    collectMemory();
    updateGuide();
    checkGoal();
  };
  return g;
}
