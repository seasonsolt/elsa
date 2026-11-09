/* Test harness (PLAN S0-2): loads the game logic in node and drives it the way a player would.

   Loading:   loadLogic()                    evaluates src/*.js in filename order (companion, levels, logic), like build_page.py
              loadLogic({ html: 'file' })    evaluates the <script id="logic"> of a built page instead
   Driving:   makeHarness(logic, levelId, { mode, player }) -> h
              h.walk / hop / act / face / drop / wait / waitFor / place, see below.
   Ad-hoc:    loadMap(rows, extra, { mode, player }) -> h     a tiny hand-made room (a private copy of the logic, src/levels.js untouched)
   Every step advances the game with g.step(1/120) and acts ONLY through the input API (g.input[id].l/r/d and g.press),
   it never writes physics state. Reading positions is fine, a player sees the screen.

   Steps are synchronous (they return when finished); solutions are async functions so `await` in front of a step is
   allowed but not needed. A step that cannot finish throws a StepError whose message names the room, the step, the step
   number, and the position of the sister it was driving. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DT = 1 / 120;

/* The pre-S0-3 page had no `id` on its levels; this lets the harness (and the solutions) run against it too. */
const LEGACY_IDS = ['hall', 'lake', 'tower', 'ballroom'];

const EXPORTS = `;({
  createGame,
  createCompanion: typeof createCompanion === 'function' ? createCompanion : null,
  LEVELS, T, COLS, ROWS, PHYS,
  KID_PHYS: typeof KID_PHYS === 'undefined' ? null : KID_PHYS,
  MAX_BLOCKS: typeof MAX_BLOCKS === 'undefined' ? null : MAX_BLOCKS,
  TOYS: typeof TOYS === 'undefined' ? null : TOYS,
  isSolidTile: typeof isSolidTile === 'undefined' ? null : isSolidTile,
  TILE_CHARS: typeof TILE_CHARS === 'undefined' ? null : TILE_CHARS,
})`;

export class StepError extends Error {
  constructor(message) { super(message); this.name = 'StepError'; }
}

/** Evaluate the logic and return { createGame, createCompanion|null, LEVELS, levels, T, COLS, ROWS, PHYS, MAX_BLOCKS, TILE_CHARS|null, source }.
 *  `levels` is LEVELS with an `id` guaranteed on each entry (legacy pages get one by position). */
export function loadLogic({ html = null } = {}) {
  let code, source;
  if (html) {
    const file = path.resolve(html);
    const page = fs.readFileSync(file, 'utf8');
    const m = page.match(/<script id="logic">([\s\S]*?)<\/script>/);
    if (!m) throw new Error(`${file}: no <script id="logic"> found`);
    code = m[1];
    source = `html:${path.relative(ROOT, file) || file}`;
  } else {
    const dir = path.join(ROOT, 'src');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort();
    if (!files.length) throw new Error(`no logic sources in ${dir}`);
    code = files.map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('');
    source = `src:${files.join('+')}`;
  }
  const api = vm.runInNewContext(code + '\n' + EXPORTS, {}, { filename: source });
  const levels = api.LEVELS.map((lv, i) => (lv.id ? lv : Object.assign({}, lv, { id: LEGACY_IDS[i] || `level${i}` })));
  return Object.assign(api, { levels, source });
}

/** A tiny hand-made room for unit tests, on a private copy of the logic (the real LEVELS are not touched).
 *  rows: strings, the BOTTOM rows of a 13 x 24 map. Missing top rows are empty air; a row shorter than 24 is padded by repeating its last
 *  character (so '#####' is a floor to the edge and '#...' ends in air). Row 0 is made of walls. Needs one 'E' and one 'A'.
 *  extra: fields of the level object ({ melody: [1, 2, 3], goal: 'garden', guide: [...] }); the id is 'adhoc' and it is the LAST level,
 *  so a clear ends in 'win'. opts as for makeHarness (mode defaults to 'duo'). Returns the harness; h.logic is the private logic. */
export function loadMap(rows, extra = {}, opts = {}) {
  const logic = loadLogic();
  const { ROWS, COLS } = logic;
  if (rows.length > ROWS) throw new Error(`loadMap: ${rows.length} rows, at most ${ROWS}`);
  const full = Array(ROWS - rows.length).fill('.'.repeat(COLS)).concat(rows.map(r => {
    if (r.length > COLS) throw new Error(`loadMap: row '${r}' is wider than ${COLS}`);
    return r + r[r.length - 1].repeat(COLS - r.length);
  }));
  full[0] = '#'.repeat(COLS);
  const flat = full.join('');
  for (const ch of 'EA') if (flat.split(ch).length !== 2) throw new Error(`loadMap: the map needs exactly one '${ch}'`);
  const level = Object.assign({ id: 'adhoc', name: { en: 'Test', zh: '测试' }, words: [], goal: 'door', guide: [], assists: [], music: 'x', bg: 'x', glows: [] }, extra, { map: full });
  logic.LEVELS.push(level);
  logic.levels.push(level);
  const h = makeHarness(logic, 'adhoc', opts);
  h.logic = logic;
  return h;
}

const dirOf = d => (d === 'left' || d === 'l' || d === -1 ? -1 : d === 'right' || d === 'r' || d === 1 ? 1 : 0);

export function makeHarness(logic, levelId, opts = {}) {
  const { T } = logic;
  const speed = () => (g.mode === 'solo' && logic.KID_PHYS ? logic.KID_PHYS : logic.PHYS).speed;
  const index = logic.levels.findIndex(l => l.id === levelId);
  if (index < 0) throw new Error(`unknown level id '${levelId}' (have: ${logic.levels.map(l => l.id).join(', ')})`);
  const level = logic.levels[index];
  const isLast = index === logic.levels.length - 1;
  const mode = opts.mode || 'duo';
  const player = opts.player || null;
  const trace = !!opts.trace;

  const g = logic.createGame();
  /* Solo mode (PLAN A1, src/CONTRACT.md §1): g.mode / g.player are set before g.start, the companion is driven once per step
     BEFORE g.step and only touches g.input / g.press / g.blink. Duo sets g.mode = 'duo' explicitly (the default is 'solo'). */
  let companion = null;
  g.mode = mode;
  if (mode === 'solo') {
    if (!player) throw new Error('solo mode needs { player: "frost" | "nuan" }');
    g.player = player;
  }
  g.start(index);
  if (mode === 'solo') {
    if (!logic.createCompanion) throw new Error('solo mode needs createCompanion() in companion.js');
    companion = logic.createCompanion(g, { player });
    companion.reset();
  }

  const log = [];             // every event since the start, in order
  let ticks = 0;              // simulation steps taken
  let stepNo = 0;             // solution steps called
  let allowSplash = !!opts.allowSplash;

  const sis = id => {
    const s = g.sisters[id];
    if (!s) throw new Error(`no sister '${id}' (use 'frost' or 'nuan')`);
    return s;
  };
  const cx = s => s.x + s.w / 2;
  const feetRow = s => Math.floor((s.y + s.h - 1) / T);
  const where = s => `${s.id} at x=${s.x.toFixed(1)} y=${s.y.toFixed(1)} (col ${(cx(s) / T).toFixed(2)}, feet on row ${feetRow(s)}) ground=${s.ground}${s.splash > 0 ? ' in-water' : ''}`;
  const playing = () => g.state === 'play';

  function begin(name, id, args) {
    stepNo++;
    if (trace) console.log(`    #${stepNo} ${name}(${args}) t=${g.time.toFixed(2)} | ${Object.values(g.sisters).map(s => `${s.id[0]} col ${(cx(s) / T).toFixed(1)} row ${feetRow(s)}`).join(', ')}`);
    return { label: `${name}(${args})`, id, n: stepNo, start: ticks };
  }
  function fail(st, why) {
    const s = st.id ? g.sisters[st.id] : null;
    const other = s ? Object.values(g.sisters).filter(o => o !== s).map(where) : [];
    throw new StepError(`[${level.id}] step #${st.n} ${st.label}: ${why}${s ? ` | ${where(s)}` : ''}${other.length ? ` | other: ${other.join('; ')}` : ''} | t=${g.time.toFixed(2)}s state=${g.state}`);
  }
  function mine(st, id) {
    sis(id);
    if (mode === 'solo' && id !== player) fail(st, `${id} is driven by the companion in solo mode; a solo solution may only drive '${player}'`);
  }
  const release = id => { Object.assign(g.input[id], { l: 0, r: 0, d: 0 }); };

  /* One simulation step. Throws on timeout or when the sister driven by the step falls in the water. */
  function tick(st, maxTicks) {
    if (ticks - st.start >= maxTicks) fail(st, `timed out after ${(maxTicks * DT).toFixed(1)}s`);
    if (companion) companion.update(DT);
    g.step(DT);
    ticks++;
    const ev = g.events.splice(0);
    for (const e of ev) {
      log.push(e);
      if (e.type === 'splash' && !allowSplash) fail(st, 'fell into the water (pass allowSplash to the harness if that is intended)');
    }
    return ev;
  }
  const secs = s => Math.ceil(s / DT);

  /* A freshly loaded room has the sisters hanging in the air for a moment (they spawn on the floor but are not "grounded" until
     the first step). Let them land before the first step of the solution, so a solution may start with a hop. */
  for (let i = 0; i < secs(1) && !Object.values(g.sisters).every(s => s.ground); i++) {
    if (companion) companion.update(DT);
    g.step(DT);
    ticks++;
    log.push(...g.events.splice(0));
  }

  const h = {
    g, level, levelId: level.id, index, mode, player, log,
    get ticks() { return ticks; },
    get time() { return g.time; },
    get state() { return g.state; },
    set allowSplash(v) { allowSplash = !!v; },

    /** where the sister is: { col, row, x, y, ground } (col is fractional, row is the row of the feet) */
    pos(id) { const s = sis(id); return { col: cx(s) / T, row: feetRow(s), x: s.x, y: s.y, ground: s.ground, dir: s.dir }; },
    /** Test setup: put the sister with her feet centre on the middle of tile (col, row) (g.blink) and let her settle. Not a player action. */
    place(id, col, row) {
      const st = begin('place', id, `${id}, ${col}, ${row}`);
      const s = sis(id);
      if (!g.blink(id, col * T + T / 2, (row + 1) * T)) fail(st, `no room to stand at col ${col}, row ${row}`);
      g.events.splice(0);
      for (let i = 0; i < 30; i++) { g.step(DT); ticks++; }
      log.push(...g.events.splice(0));
      return where(s);
    },

    /** number of events of this type seen so far */
    count(type) { return log.filter(e => e.type === type).length; },

    /** Walk to the centre of column `col` (left/right only), then settle on the ground. Falls off ledges on the way if the route does. */
    walk(id, col, o = {}) {
      const st = begin('walk', id, `${id}, ${col}`);
      mine(st, id);
      if (!playing()) return;
      const s = sis(id), target = col * T + T / 2, stepPx = speed() * DT;
      const max = secs(o.timeout ?? (Math.abs(cx(s) - target) / speed() * 1.6 + 2.5));
      let still = 0, lastX = s.x;
      while (playing()) {
        const dx = target - cx(s);
        if (Math.abs(dx) <= stepPx / 2) break;
        g.input[id].l = dx < 0 ? 1 : 0; g.input[id].r = dx > 0 ? 1 : 0;
        tick(st, max);
        still = Math.abs(s.x - lastX) < 1e-6 ? still + 1 : 0;
        lastX = s.x;
        if (still >= 40) { release(id); fail(st, `blocked, cannot get to column ${col}`); }
      }
      release(id);
      while (playing() && !(s.ground && s.splash <= 0)) tick(st, max);
    },

    /** Jump from the ground and steer towards column `col` in the air, landing within one tile of it.
     *  dbl: press jump again at the top of the arc (only Nuan can; the step fails if no double jump happened).
     *  o.delay: seconds to rise straight up before steering; o.row: expect to land with the feet on this tile row. */
    hop(id, col, dbl = false, o = {}) {
      const st = begin('hop', id, `${id}, ${col}${dbl ? ', dbl' : ''}${o.delay ? `, delay ${o.delay}` : ''}`);
      mine(st, id);
      if (!playing()) return;
      const s = sis(id), target = col * T + T / 2, stepPx = speed() * DT;
      if (!s.ground) fail(st, 'must start on the ground');
      const max = secs(o.timeout ?? 4);
      g.press(id, 'jump');
      let left = false, doubled = false, sawDouble = false, steered = 0;
      while (playing()) {
        const dx = target - cx(s), go = steered * DT >= (o.delay || 0);
        const move = go && Math.abs(dx) > stepPx / 2 ? Math.sign(dx) : 0;
        g.input[id].l = move < 0 ? 1 : 0; g.input[id].r = move > 0 ? 1 : 0;
        if (dbl && !doubled && left && s.vy >= 0) { g.press(id, 'jump'); doubled = true; }
        const ev = tick(st, max);
        steered++;
        if (ev.some(e => e.type === 'doublejump')) sawDouble = true;
        if (!s.ground) left = true;
        if (left && s.ground && s.splash <= 0) break;
      }
      release(id);
      if (!playing()) return;
      if (dbl && !sawDouble) fail(st, 'the second jump did not happen (this sister cannot double jump?)');
      if (Math.abs(cx(s) - target) > T) fail(st, `landed at col ${(cx(s) / T).toFixed(2)}, more than one tile from column ${col}`);
      if (o.row != null && feetRow(s) !== o.row) fail(st, `landed with the feet on row ${feetRow(s)}, expected row ${o.row}`);
    },

    /** Use the magic. Returns the events it produced. A fizzle (nothing happened) fails the step unless o.fizz is set. */
    act(id, o = {}) {
      const st = begin('act', id, id);
      mine(st, id);
      if (!playing()) return [];
      g.press(id, 'act');
      const ev = tick(st, 10);
      if (!o.fizz && ev.some(e => e.type === 'fizz')) fail(st, 'the magic fizzled (nothing in reach)');
      return ev;
    },

    /** Face left (-1 / 'left') or right (1 / 'right') without ending up anywhere else: a tap away and a tap back. */
    face(id, dir) {
      const st = begin('face', id, `${id}, ${dir}`);
      mine(st, id);
      const d = dirOf(dir);
      if (!d) fail(st, 'direction must be -1/1 or left/right');
      if (!playing()) return;
      const s = sis(id);
      if (s.dir === d) return;
      for (const to of [-d, d]) {
        g.input[id].l = to < 0 ? 1 : 0; g.input[id].r = to > 0 ? 1 : 0;
        tick(st, 10);
      }
      release(id);
      if (s.dir !== d) fail(st, 'could not turn');
    },

    /** Press Down to fall through a one-way platform, then wait until standing again. */
    drop(id, o = {}) {
      const st = begin('drop', id, id);
      mine(st, id);
      if (!playing()) return;
      const s = sis(id);
      if (!s.ground) fail(st, 'must start on the ground');
      const max = secs(o.timeout ?? 3);
      g.input[id].d = 1;
      tick(st, max);
      release(id);
      let left = !s.ground;
      for (let i = 0; playing() && !left; i++) {
        if (i > 30) fail(st, 'did not fall: nothing to drop through here');
        tick(st, max);
        left = !s.ground;
      }
      while (playing() && !(s.ground && s.splash <= 0)) tick(st, max);
    },

    /** Stand still (no input from the solution) for `sec` seconds. */
    wait(sec) {
      const st = begin('wait', null, `${sec}`);
      const n = secs(sec);
      for (let i = 0; i < n && playing(); i++) tick(st, n + 1);
    },

    /** Assert that every small star ('+') of the room has been collected by now. */
    expectStars() {
      const st = begin('expectStars', null, '');
      if (g.stars.got !== g.stars.total) {
        const left = g.items.filter(i => i.kind === '+' && !i.got).map(i => `${i.c},${i.r}`);
        fail(st, `${g.stars.got}/${g.stars.total} small stars collected (missing: ${left.join(' ')})`);
      }
    },

    /** Stand still until cond(h) is true; fails after `maxSec`. */
    waitFor(cond, maxSec = 5, what = 'condition') {
      const st = begin('waitFor', null, what);
      const max = secs(maxSec);
      while (playing() && !cond(h)) tick(st, max);
    },

    /** End of a solution: on the last room the 'clear' state still has to run out into 'win'; otherwise the game is NOT stepped
     *  any further (it would load the next room). Returns the final state. */
    finish() {
      if (isLast && g.state === 'clear') {
        const st = begin('finish', null, 'win');
        const max = secs(4);
        while (g.state === 'clear') tick(st, max);
      }
      return g.state;
    },
    expectedFinalState: isLast ? 'win' : 'clear',
  };
  return h;
}
