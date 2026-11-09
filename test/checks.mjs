/* Static checks on level data (PLAN S0-2). Each check returns an array of problem strings, empty when fine.
   They take plain data so unit tests can feed them broken levels. */

/* Fallback when the logic does not export TILE_CHARS (pre-S0-3 pages). */
export const DEFAULT_TILE_CHARS = { live: '.#=~XIBGP*hoDSEA+/\\JRNM12345F', future: '' };

export function legalChars(tileChars) {
  const t = tileChars || DEFAULT_TILE_CHARS;
  return new Set((t.live + t.future).split(''));
}

export function checkMapSize(level, ROWS = 13, COLS = 24) {
  const problems = [];
  const map = level.map;
  if (!Array.isArray(map)) return ['map is not an array'];
  if (map.length !== ROWS) problems.push(`map has ${map.length} rows, expected ${ROWS}`);
  map.forEach((row, r) => {
    if (typeof row !== 'string') problems.push(`row ${r} is not a string`);
    else if (row.length !== COLS) problems.push(`row ${r} has ${row.length} columns, expected ${COLS}`);
  });
  return problems;
}

export function checkTiles(level, legal) {
  const problems = [];
  (level.map || []).forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      if (!legal.has(row[c])) problems.push(`illegal tile ${JSON.stringify(row[c])} at col ${c}, row ${r}`);
    }
  });
  return problems;
}

/* Things every room needs: one spawn each, the goal tile that matches `goal`, plates when there are gates. */
export function checkStructure(level) {
  const problems = [];
  const flat = (level.map || []).join('');
  const count = ch => flat.split(ch).length - 1;
  for (const [ch, what] of [['E', 'Frost spawn (E)'], ['A', 'Nuan spawn (A)']]) {
    if (count(ch) !== 1) problems.push(`expected exactly one ${what}, found ${count(ch)}`);
  }
  const goal = level.goal || 'door';
  if (goal !== 'door' && goal !== 'snowman' && goal !== 'garden') problems.push(`unknown goal '${goal}'`);
  if (goal === 'garden') {
    // no door: the room is cleared when every ice flower has bloomed
    if (count('F') < 1) problems.push("goal 'garden' needs at least one ice flower (F)");
    for (const ch of 'DS') if (count(ch)) problems.push(`goal 'garden' has no door, but the map has a '${ch}' tile`);
  } else {
    const [want, other] = goal === 'snowman' ? ['S', 'D'] : ['D', 'S'];
    if (count(want) !== 1) problems.push(`goal '${goal}' needs exactly one '${want}' tile, found ${count(want)}`);
    if (count(other) !== 0) problems.push(`goal '${goal}' but the map also has a '${other}' tile`);
  }
  // the new toys (CONTRACT section 9)
  if (count('R') && !count('N')) problems.push('map has lost bunnies (R) but no bunny home (N)');
  if (count('N') && !count('R')) problems.push('map has a bunny home (N) but no bunny (R)');
  const melody = level.melody;
  if (melody != null) {
    if (!Array.isArray(melody) || !melody.length || melody.some(n => !Number.isInteger(n) || n < 1 || n > 5)) problems.push('melody must be a list of notes 1..5');
    else for (const n of new Set(melody)) if (!count(String(n))) problems.push(`melody uses note ${n} but the map has no '${n}' step`);
  }
  (level.map || []).forEach((row, r) => {
    for (const m of row.matchAll(/M+/g)) {
      for (let c = m.index; c < m.index + m[0].length; c++) {
        if (((level.map[r + 1] || '')[c]) !== '~') problems.push(`ice floe (M) at col ${c}, row ${r} needs water (~) right below it`);
      }
    }
  });
  if (count('G') && !count('P')) problems.push('map has gates (G) but no pressure plate (P)');
  if (count('+') < 3 || count('+') > 5) problems.push(`a room needs 3-5 small stars (+), found ${count('+')}`);
  return problems;
}

export function checkLevelList(levels) {
  const problems = [];
  const seen = new Set();
  levels.forEach((lv, i) => {
    if (!lv.id) problems.push(`level ${i} has no id`);
    else if (seen.has(lv.id)) problems.push(`duplicate level id '${lv.id}'`);
    seen.add(lv.id);
  });
  return problems;
}

/* ---------- item reachability smoke check ----------
   Question: can each sister, in principle, get to every item she may collect and to the goal?
   This is a SMOKE check, deliberately generous. It will not prove a level is solvable (the solutions do that) but it
   catches sealed-off items, a missing plate, a wall nobody can melt, and similar data mistakes.

   Model (cells are tile coordinates, a "stand" is a cell with something solid under it):
   - A sister stands in a cell that is passable, not water, not a one-way platform tile, with a solid tile or platform below.
     Solid = # X I B and a closed gate G.  Water ~ is never stood on and ends a fall.
   - Walk: one cell left/right if that cell and the one above it (head room) are passable; no ground there means she falls
     straight down to the first stand (a fall into water is not allowed). Down through a '=' platform is allowed.
   - Jump: from a stand to any stand up to `up` rows higher and `dx` columns away (`dxUp` when going up), if an
     "up, across, down" or "across, then down" corridor of passable cells exists.
       Nuan: up 4 rows (a double jump is about 4.6 tiles), dx 5, dxUp 4.
       Frost: up 4 rows (a single jump is 2.3, the rest stands for her ice-block steps, we do NOT model the 3 block limit
              or whether there is free air for the steps), dx 3, dxUp 2.
   - Frost's magic freezes water: from a stand she turns up to 3 water cells in a row, starting beside her, into ice, in
     the first row from her feet down to 3 rows below that has water (same rule as the logic).
   - Nuan's magic melts a pink ice wall (X) when she can stand beside it (one column, rows of her body), and the whole
     connected wall goes.
   - A gate (G) counts as open as soon as either sister can reach a plate (someone, or a block, can hold it).
   - Items: '*' only Frost, 'h' only Nuan, 'o' and the small stars '+' either. Collectable when she can stand in the item's column at most `up`
     rows below the item with a clear column in between (she jumps up to it).
   - Goal: both sisters need a stand in the goal's row within one column of the door / snowman.
   The new toys (src/CONTRACT.md section 9), all generously:
   - J (spring mushroom) and the note steps 1-5 are solid. From a stand directly on a J a sister may jump up to 6 rows.
   - A ramp (/ \\) is passable and counts as a stand cell, slippery or not.
   - A floe (M) counts as solid ice along the whole stretch it can sail, all of it at once.
   - A lost bunny must have a stand within 3 columns (2 rows) of it, the bunny home N must have a stand beside it; the bunnies' own walk
     (hops over one tile, no water, no climbing) is NOT modelled, their blink covers a lost trail.
   - Every note the melody uses and every flower (Nuan within 2 tiles) must be reachable by Nuan.
   Not modelled: coyote time, exact jump arcs, ceilings over the corridor beyond head room, blocks as obstacles. */

const MOB = {
  frost: { up: 4, dx: 3, dxUp: 2 },
  nuan: { up: 4, dx: 5, dxUp: 4 },
};

export function checkReach(logic, index) {
  const g = logic.createGame();
  g.load(index);
  const { COLS, ROWS } = logic;
  const grid = g.grid.map(r => r.slice());
  const world = { gate: false };
  const at = (c, r) => (c < 0 || c >= COLS || r < 0 || r >= ROWS) ? '#' : grid[r][c];
  const solid = ch => ch === '#' || ch === 'X' || ch === 'I' || ch === 'B' || ch === 'J' || (ch >= '1' && ch <= '5') || (ch === 'G' && !world.gate);
  const ramp = ch => ch === '/' || ch === '\\';
  const pass = (c, r) => !solid(at(c, r));
  const ground = (c, r) => { const ch = at(c, r); return solid(ch) || ch === '=' || ramp(ch); };
  const canStand = (c, r) => pass(c, r) && at(c, r) !== '~' && at(c, r) !== '=' && (ramp(at(c, r)) || ground(c, r + 1));
  const key = (c, r) => r * COLS + c;

  // ice floes: the whole stretch a floe sails over counts as ice (same turning rules as logic.js, pixel by pixel)
  for (const f of g.floes) {
    const r = Math.floor(f.y / logic.T);
    const okAt = (x, dir) => {               // may it be at x, judged by the edge it leads with
      const col = dir > 0 ? Math.floor((x + f.w - 0.001) / logic.T) : Math.floor(x / logic.T);
      return !solid(at(col, r)) && at(col, r + 1) === '~';
    };
    let lo = f.x, hi = f.x;
    while (okAt(hi + 1, 1)) hi++;
    while (okAt(lo - 1, -1)) lo--;
    for (let c = Math.floor(lo / logic.T); c <= Math.floor((hi + f.w - 0.001) / logic.T); c++) if (r >= 0 && grid[r][c] !== undefined && !solid(grid[r][c])) grid[r][c] = 'I';
  }

  const rect = (c0, c1, r0, r1) => {         // every cell of the rectangle passable
    for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++) {
      for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) if (!pass(c, r)) return false;
    }
    return true;
  };
  function fallFrom(c, r0) {                   // first stand below in column c, starting at row r0, or null
    for (let r = r0; r < ROWS; r++) {
      const ch = at(c, r);
      if (ch === '~' || solid(ch)) return null;
      if (canStand(c, r)) return r;
    }
    return null;
  }
  function jumpClear(c, r, c2, r2) {
    const top = Math.min(r, r2) - 1;           // the row above the higher stand: head room
    const upAcrossDown = rect(c, c, top, r) && rect(c, c2, top, top + 1) && rect(c2, c2, top, r2);
    const acrossDown = r2 >= r && rect(c, c2, r - 1, r) && rect(c2, c2, r - 1, r2);
    return upAcrossDown || acrossDown;
  }

  function reachFrom(start, mob) {
    const seen = new Set([key(start[0], start[1])]);
    const todo = [start];
    const add = (c, r) => { if (!seen.has(key(c, r))) { seen.add(key(c, r)); todo.push([c, r]); } };
    while (todo.length) {
      const [c, r] = todo.pop();
      for (const d of [-1, 1]) {                                  // walk, or walk off an edge
        const c2 = c + d;
        if (!pass(c2, r) || !pass(c2, r - 1)) continue;
        if (canStand(c2, r)) add(c2, r);
        else { const r2 = fallFrom(c2, r); if (r2 != null) add(c2, r2); }
      }
      if (at(c, r + 1) === '=') { const r2 = fallFrom(c, r + 1); if (r2 != null) add(c, r2); }   // drop through
      const m = at(c, r + 1) === 'J' ? Object.assign({}, mob, { up: 6 }) : mob;   // a spring mushroom throws 6 tiles high
      for (let dc = -m.dx; dc <= m.dx; dc++) {                // jump
        for (let r2 = r - m.up; r2 < ROWS; r2++) {
          const c2 = c + dc;
          if (!dc && r2 === r) continue;
          if (r2 < r && Math.abs(dc) > m.dxUp) continue;
          if (canStand(c2, r2) && jumpClear(c, r, c2, r2)) add(c2, r2);
        }
      }
    }
    return seen;
  }

  const spawn = id => {
    const s = g.sisters[id];
    return [Math.floor((s.x + s.w / 2) / logic.T), Math.floor((s.y + s.h - 1) / logic.T)];
  };
  const problems = [];
  for (const id of ['frost', 'nuan']) {
    const [c, r] = spawn(id);
    if (!canStand(c, r)) problems.push(`${id} does not start on solid ground (col ${c}, row ${r})`);
  }
  if (problems.length) return problems;

  const sets = {};
  const recompute = () => { for (const id of ['frost', 'nuan']) sets[id] = reachFrom(spawn(id), MOB[id]); };
  const cells = id => [...sets[id]].map(k => [k % COLS, Math.floor(k / COLS)]);

  recompute();
  for (let changed = true, guard = 0; changed && guard < 50; guard++) {
    changed = false;
    // gates: any sister on a plate
    if (!world.gate && g.plates.some(p => ['frost', 'nuan'].some(id => sets[id].has(key(p.c, p.r))))) { world.gate = true; changed = true; }
    // Nuan melts pink walls she can stand beside
    for (const [c, r] of cells('nuan')) {
      for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 0; dr++) {
        if (at(c + dc, r + dr) !== 'X') continue;
        const todo = [[c + dc, r + dr]];
        while (todo.length) {
          const [x, y] = todo.pop();
          if (at(x, y) !== 'X') continue;
          grid[y][x] = '.';
          todo.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }
        changed = true;
      }
    }
    // Frost freezes water beside her, first row with water from her feet down, up to 3 cells
    for (const [c, r] of cells('frost')) {
      for (const d of [-1, 1]) {
        for (let rr = r; rr <= r + 3; rr++) {
          if (at(c + d, rr) !== '~') continue;
          for (let x = c + d, n = 0; n < 3 && at(x, rr) === '~'; x += d, n++) grid[rr][x] = 'I';
          changed = true;
          break;
        }
      }
    }
    if (changed) recompute();
  }

  const label = it => `${it.kind === '*' ? 'snowflake' : it.kind === 'h' ? 'heart' : it.kind === '+' ? 'small star' : 'snowball'} at col ${it.c}, row ${it.r}`;
  for (const it of g.items) {
    const who = it.kind === '*' ? ['frost'] : it.kind === 'h' ? ['nuan'] : ['frost', 'nuan'];   // 'o' and '+': either sister
    const ok = who.some(id => cells(id).some(([c, r]) => {
      if (c !== it.c || r < it.r || r - it.r > MOB[id].up) return false;
      for (let y = it.r; y <= r; y++) if (!pass(c, y)) return false;
      return true;
    }));
    if (!ok) problems.push(`${who.join('/')} cannot reach the ${label(it)}`);
  }
  const standNear = (id, c0, r0, dc, dr) => cells(id).some(([c, r]) => Math.abs(c - c0) <= dc && Math.abs(r - r0) <= dr);
  for (const b of g.bunnies) {
    if (!['frost', 'nuan'].some(id => standNear(id, b.c, b.r, 3, 2))) problems.push(`nobody can get near the lost bunny at col ${b.c}, row ${b.r}`);
  }
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (at(c, r) === 'N' && !['frost', 'nuan'].some(id => standNear(id, c, r, 1, 1))) problems.push(`nobody can get to the bunny home at col ${c}, row ${r}`);
  }
  if (g.melody) {
    const need = new Set(g.melody.seq.map(String));
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (need.has(at(c, r)) && !cells('nuan').some(([cc, rr]) => cc === c && rr === r - 1)) problems.push(`nuan cannot get on the note step ${at(c, r)} at col ${c}, row ${r}`);
    }
  }
  for (const f of g.flowers) {
    if (!standNear('nuan', f.c, f.r, 2, 1)) problems.push(`nuan cannot get to the ice flower at col ${f.c}, row ${f.r}`);
  }
  if (g.door) {
    for (const id of ['frost', 'nuan']) {
      const ok = cells(id).some(([c, r]) => r === g.door.r && Math.abs(c - g.door.c) <= 1);
      if (!ok) problems.push(`${id} cannot reach the ${g.goal} at col ${g.door.c}, row ${g.door.r}`);
    }
  }
  return problems;
}
