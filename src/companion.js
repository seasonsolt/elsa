/* Companion AI (PLAN A1): in solo mode the sister the child does not control is driven from here.
   Plain global function, no module syntax: inlined in a <script> and loadable in node.

   Rules of the house
   - It may only write g.input[other], call g.press(other, ...) and g.blink(other, ...). It never touches positions or physics.
   - The view calls update(dt) once per fixed step BEFORE g.step(dt), in solo mode only, and reset() when a room is (re)loaded.
     A new room or a swap of the controlled sister is also noticed here, so reset() is a convenience, not a requirement.
   - companion.idle: seconds the player has not moved (the view says an encouraging line after a few).

   Priorities, highest first (PLAN A1)
     1. the room's `assists` (levels.js)                    2. generic help: melt a pink wall (Nuan), freeze water ahead (Frost),
     hold the plate while the player passes a closed gate   3. follow 36 px behind, jump walls, wait at water
     4. magic blink: > 6 tiles away, > 3 tiles of height difference, or 2 s without getting closer   5. look at the player

   The S3 toys (src/CONTRACT.md section 9)
     ramps / and \\   passable: she walks and slides like the player; a spot on a ramp counts as a place to stand (blink)
     spring J         solid like a wall; when the player is much higher she walks to a mushroom, lets it throw her up and steers to the
                      player in the air (springHelp); the blink stays the fallback
     lost bunnies R   nothing to do, they follow the player (the logic makes the player their leader in solo)
     ice floe M       at the water's edge she waits for a floe to come within reach and then steps / hops on; no generic ice in a room with floes
     note steps 1..5  she never jumps near them, never blinks onto one and never counts a note step as a place to stand
     ice flowers F    she keeps away from a flower until the player has made one bloom; then her own touch (and, for Nuan, her magic) may
   Positions: `cx` is the horizontal centre of a sister in pixels, her "feet" are s.y + s.h; a tile is T px. */
function createCompanion(g, opts) {
  const FOLLOW = 36;            // px behind the player
  const DEAD = 10;              // px: close enough to the follow point to stand still
  const FAR = 6 * T;            // blink when farther than this ...
  const HIGH = 3 * T;           // ... or when the height difference is larger than this ...
  const STUCK = 2;              // ... or when she has not got closer for this many seconds
  const BLINK_COOL = 1;         // s between two follow blinks
  const HELP_COOL = 0.5;        // s between two helps
  const GATE_NEAR = 6 * T, GATE_FAR = 7 * T, GATE_PASS = 3 * T;
  const HOLD_MAX = 8, HOLD_WAIT = 3, HOLD_COOL = 4;   // s on the plate at most / s before she gives it up when the player stays far on her own side / s before she tries again

  let st = null;
  const other = id => (id === 'frost' ? 'nuan' : 'frost');
  const cxOf = s => s.x + s.w / 2;
  const feetOf = s => s.y + s.h;
  const rowOf = s => Math.floor((s.y + s.h - 1) / T);
  const chAt = (c, r) => (c < 0 || c >= COLS || r < 0 || r >= ROWS) ? '#' : g.grid[r][c];
  /* the logic's own rule (walls, ice, blocks, the spring mushroom J, note steps, a shut gate); ramps are NOT solid, floes are entities */
  const solid = ch => (typeof isSolidTile === 'function'
    ? isSolidTile(ch, g.gatesOpen)
    : (ch === '#' || ch === 'X' || ch === 'I' || ch === 'B' || ch === 'J' || (ch >= '1' && ch <= '5') || (ch === 'G' && !g.gatesOpen)));
  const isRamp = ch => ch === '/' || ch === '\\';
  const isNote = ch => ch >= '1' && ch <= '5' && ch.length === 1;
  const sign = v => (v > 0 ? 1 : v < 0 ? -1 : 0);

  function fresh() {
    return {
      items: g.items, player: g.player,
      px: 0, py: 0, idle: 0, pMoved: false,
      dir: 1, runT: 0,              // the way the player is heading (stable: a short tap the other way does not flip it)
      blinkCool: 0, helpCool: 0, jumpCool: 0,
      best: Infinity, stuckT: 0,
      hold: null,                   // standing on a plate: { plate, gate, side }
      fired: [],                    // assists already done
      forceBlink: false,
      hopT: 0, floeT: 0,            // s left of a hop onto a floe / s since she last stood on a floe
      spring: null, springCool: 0,  // { phase: 'walk' | 'fly', col, t, jt }: using a spring mushroom to follow the player up
      bloomCool: 0,
      holdT: 0, holdCool: 0,        // s since she took the plate / s before she may take it again after giving up
    };
  }
  st = fresh();

  /* ---------- geometry helpers ---------- */

  const onFloe = (x, y) => g.floes.some(f => x >= f.x && x <= f.x + f.w && Math.abs(f.y - y) <= 6);
  const floeOf = s => (s.ground ? g.floes.find(f => cxOf(s) >= f.x && cxOf(s) <= f.x + f.w && Math.abs(f.y - feetOf(s)) <= 2) : null) || null;
  const ridesFloe = s => !!floeOf(s);

  /* ice flowers (S3): until the player has made one bloom the companion keeps out of their reach (the child does it first) */
  const flowerHold = () => g.flowers.length > 0 && g.flowers.every(f => !f.open);
  function inFlowerZone(x0, x1, y0, y1) {
    for (const f of g.flowers) {
      if (!f.open && x0 < (f.c + 1) * T + 4 && x1 > f.c * T - 4 && y0 < (f.r + 1) * T && y1 > f.r * T) return true;
    }
    return false;
  }

  /* a sister can stand in tile (c, r): room for the body, not water, something to stand on (never a note step: those are the child's) */
  function standCell(c, r) {
    if (solid(chAt(c, r)) || solid(chAt(c, r - 1)) || chAt(c, r) === '~' || chAt(c, r) === '=') return false;
    if (isRamp(chAt(c, r))) return true;                      // the surface of a ramp
    const below = chAt(c, r + 1);
    if (isNote(below)) return false;
    return solid(below) || below === '=';
  }

  /* does a body centred on x with its feet on row r fit and stand? (used to pick a blink spot) */
  function fitsStand(x, r, w, h) {
    const c0 = Math.floor((x - w / 2) / T), c1 = Math.floor((x + w / 2 - 0.001) / T);
    for (let c = c0; c <= c1; c++) if (solid(chAt(c, r)) || solid(chAt(c, r - 1))) return false;
    if (flowerHold() && inFlowerZone(x - w / 2, x + w / 2, (r + 1) * T - (h || 58), (r + 1) * T)) return false;
    if (onFloe(x, (r + 1) * T)) return true;
    return standCell(Math.floor(x / T), r);
  }

  /* walking one tile further in `dir` would drop her into water */
  function waterAhead(s, dir) {
    const c = Math.floor(cxOf(s) / T) + dir, r0 = rowOf(s);
    if (solid(chAt(c, r0))) return false;
    for (let r = r0; r < ROWS; r++) {
      const ch = chAt(c, r);
      if (ch === '~') return true;
      if (solid(ch) || ch === '=') return false;
    }
    return false;
  }

  /* something solid directly in front of her body (feet row): its tile character, or null */
  function wallAhead(s, dir) {
    const c = Math.floor((cxOf(s) + dir * (s.w / 2 + 6)) / T), r = Math.floor((s.y + s.h - 1) / T);
    return solid(chAt(c, r)) ? chAt(c, r) : null;
  }

  /* until the player has made a flower bloom: a closed flower within reach of a jump straight above or beside her */
  function flowerAbove(c) {
    if (!flowerHold()) return false;
    const x = cxOf(c);
    return g.flowers.some(f => !f.open && Math.abs(f.c * T + T / 2 - x) <= 1.6 * T && f.r * T < c.y && c.y - f.r * T < 5.2 * T);
  }

  /* note steps close by: she does not jump there (a jump might land on one), the blink has to bring her */
  function notesNear(c) {
    const col = Math.floor(cxOf(c) / T), r0 = rowOf(c);
    for (let r = r0 - 5; r <= r0 + 1; r++) for (let k = col - 3; k <= col + 3; k++) if (isNote(chAt(k, r))) return true;
    return false;
  }

  /* ---------- actions (blink + magic) ---------- */

  /* Blink to the feet-centre (x, y) and, optionally, use the magic facing `dir`. The facing comes from a tiny step of movement
     in the same tick (the logic turns her before the magic is read), then she is back in the dead zone of the follow code. */
  function cast(cid, x, y, dir) {
    const inp = g.input[cid];
    if (x != null && !g.blink(cid, x, y)) return false;
    inp.l = dir < 0 ? 1 : 0; inp.r = dir > 0 ? 1 : 0;
    g.press(cid, 'act');
    st.helpCool = HELP_COOL;
    st.best = Infinity; st.stuckT = 0;
    return true;
  }

  const spotOf = (c, r) => [c * T + T / 2, (r + 1) * T];

  /* ---------- 1. assists from the room data ---------- */

  function nearPlayer(a, p) {
    const w = a.when || {};
    if (w.gateClosed && g.gatesOpen) return false;
    if (w.near) {
      const dx = (cxOf(p) - (w.near[0] * T + T / 2)) / T, dy = (p.y + p.h / 2 - (w.near[1] * T + T / 2)) / T;
      if (Math.hypot(dx, dy) > (w.r == null ? 3 : w.r)) return false;
    }
    return true;
  }

  function runAssists(p, c, cid) {
    const list = (LEVELS[g.index] && LEVELS[g.index].assists) || [];
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (st.fired[i] || (a.who && a.who !== 'any' && a.who !== cid) || !nearPlayer(a, p)) continue;
      if (a.do === 'standOnPlate') {
        if (!st.hold && !g.gatesOpen && startHold(p, cid, i)) return true;
        continue;
      }
      if (st.helpCool > 0 || !a.from) continue;
      const dir = a.dir || 1;
      st.fired[i] = true;
      const [x, y] = spotOf(a.from[0], a.from[1]);
      if (cast(cid, x, y, dir)) return true;
    }
    return false;
  }

  /* ---------- 2. generic help ---------- */

  /* Stand on a plate while the player gets through the gate; blink across once she is 3 tiles beyond it. */
  function startHold(p, cid, assistIndex) {
    if (!g.gates.length || !g.plates.length) return false;
    const pcx = cxOf(p);
    let gate = g.gates[0];
    for (const gt of g.gates) if (Math.abs(gt.c * T + T / 2 - pcx) < Math.abs(gate.c * T + T / 2 - pcx)) gate = gt;
    let plate = g.plates[0];
    for (const pl of g.plates) if (Math.abs(pl.c * T + T / 2 - pcx) < Math.abs(plate.c * T + T / 2 - pcx)) plate = pl;
    const [x, y] = spotOf(plate.c, plate.r);
    if (!g.blink(cid, x, y)) return false;
    st.hold = { plate, gate, side: sign(pcx - (gate.c * T + T / 2)) || 1, assist: assistIndex };
    st.helpCool = HELP_COOL; st.holdT = 0;
    return true;
  }

  function plateHelp(p, c, cid) {
    if (st.hold) {
      const h = st.hold, dx = cxOf(p) - (h.gate.c * T + T / 2);
      const passed = sign(dx) === -h.side && Math.abs(dx) >= GATE_PASS;
      const high = Math.abs(feetOf(p) - (h.plate.r + 1) * T) > 3 * T;     // up on a platform, not at the gate
      const idle = st.holdT > HOLD_WAIT && (high || (sign(dx) === h.side && Math.abs(dx) > GATE_PASS));   // standing about, not going through
      if ((st.holdT > HOLD_MAX && !passed) || idle) {       // the player is not going through after all: give the plate up for a while
        st.hold = null; st.holdCool = HOLD_COOL;
        return false;
      }
      if (passed || Math.abs(dx) > GATE_FAR) {
        if (passed && h.assist != null) st.fired[h.assist] = true;
        st.hold = null; st.forceBlink = passed;           // across the gate to the player's side
        return false;
      }
      const pl = h.plate;
      if (!(c.x < (pl.c + 1) * T && c.x + c.w > pl.c * T && c.y < (pl.r + 1) * T && c.y + c.h > pl.r * T)) {
        const [x, y] = spotOf(pl.c, pl.r);
        g.blink(cid, x, y);
      }
      return true;                                         // stands still on the plate
    }
    if (g.gatesOpen || !g.gates.length || !g.plates.length || st.helpCool > 0 || st.holdCool > 0) return false;
    const pcx = cxOf(p), pr = rowOf(p);
    // a gate close by that the player is heading for (not one she has just come through)
    const near = g.gates.some(gt => Math.abs(gt.c * T + T / 2 - pcx) < GATE_NEAR && Math.abs(gt.r - pr) <= 4
      && sign(gt.c * T + T / 2 - pcx) === st.dir);
    return near && startHold(p, cid, null);
  }

  /* Nuan: the player is close to a pink wall in front of her, melt it. */
  function meltHelp(p, c, cid) {
    if (cid !== 'nuan' || !p.ground) return false;
    const pc = Math.floor(cxOf(p) / T), pr = rowOf(p);
    for (const d of [p.dir, -p.dir]) {
      for (let k = 1; k <= 3; k++) {
        const wc = pc + d * k;
        if (solid(chAt(wc, pr)) && chAt(wc, pr) !== 'X') break;
        if (chAt(wc, pr) === 'X' || chAt(wc, pr - 1) === 'X') {
          const sc = wc - d;
          if (!standCell(sc, pr)) break;
          const [x, y] = spotOf(sc, pr);
          return cast(cid, x, y, d);
        }
      }
    }
    return false;
  }

  /* Frost: the player is about to walk into water ahead of her (up to 3 tiles away), freeze a path. */
  function freezeHelp(p, c, cid) {
    if (cid !== 'frost' || !p.ground || g.floes.length) return false;     // (near a floe her magic pauses it: no ice in a river room)
    const pc = Math.floor(cxOf(p) / T), pr = rowOf(p), d = p.dir;
    for (let k = 1; k <= 3; k++) {
      const wc = pc + d * k;
      if (solid(chAt(wc, pr))) return false;
      let water = false;
      for (let r = pr; r <= pr + 3 && !water; r++) water = chAt(wc, r) === '~';
      if (!water) continue;
      const sc = wc - d;
      if (!standCell(sc, pr)) return false;
      const [x, y] = spotOf(sc, pr);
      return cast(cid, x, y, d);
    }
    return false;
  }

  /* ---------- 3 + 4. follow and blink ---------- */

  function blinkBehind(p, cid) {
    const pcx = cxOf(p), pr = rowOf(p), y = feetOf(p);
    for (const x of [pcx - st.dir * FOLLOW, pcx - st.dir * 2 * FOLLOW, pcx + st.dir * FOLLOW, pcx]) {
      if (fitsStand(x, pr, g.sisters[cid].w, g.sisters[cid].h) && g.blink(cid, x, y)) {
        st.blinkCool = BLINK_COOL; st.best = Infinity; st.stuckT = 0; st.forceBlink = false;
        return true;
      }
    }
    return false;
  }

  function follow(p, c, cid, dt) {
    const inp = g.input[cid];
    const pcx = cxOf(p), ccx = cxOf(c);
    // on a floe while the player is on firm ground: go right up to her (onto the bank), a floe sails away from under a bystander
    let tx = st.floeT > 0 && !ridesFloe(p) ? pcx : pcx - st.dir * FOLLOW;
    const pf = floeOf(p);
    if (pf) tx = Math.max(pf.x + 14, Math.min(pf.x + pf.w - 14, tx));       // the player sails: her place is on the floe, not in the water behind it
    const dy = feetOf(p) - feetOf(c);
    const dist = Math.hypot(tx - ccx, dy);

    // 4. magic blink
    // "no progress": she is not at her place, the player is standing still, and she is not getting any closer
    if (st.pMoved || dist < DEAD + 4 || dist < st.best - 6) { st.best = dist; st.stuckT = 0; }
    else st.stuckT += dt;
    const high = c.ground && Math.abs(dy) > HIGH;                 // measured on the ground, not in the middle of a jump
    const lost = Math.hypot(pcx - ccx, dy) > FAR || high || st.stuckT > STUCK;
    if ((st.forceBlink || (lost && st.blinkCool <= 0)) && p.ground && blinkBehind(p, cid)) return;

    // 3. follow
    const want = tx - ccx;
    let mv = Math.abs(want) > DEAD ? sign(want) : 0;
    let hop = false;                                        // a floe is within reach: jump onto it
    if (mv && waterAhead(c, mv)) {                          // wait at the water, unless a floe comes by
      if (c.ground) { const f = floeStep(c, mv); mv = f.mv; hop = f.jump; if (hop) st.hopT = 0.8; }
      else if (st.hopT <= 0) mv = 0;                        // (in the air only the hop onto a floe goes on over the water, until she is over it)
    }
    if (mv && !c.ground && st.hopT > 0 && g.floes.some(f => f.y >= feetOf(c) - 4 && f.y - feetOf(c) < 3 * T && ccx >= f.x + 8 && ccx <= f.x + f.w - 8)) mv = 0;
    if (mv && c.ground && flowerHold() && inFlowerZone(c.x + mv * 14, c.x + c.w + mv * 14, c.y, c.y + c.h)) mv = 0;   // the child blooms the first flower
    inp.l = mv < 0 ? 1 : 0; inp.r = mv > 0 ? 1 : 0;

    const toward = mv || sign(pcx - ccx);
    const climb = dy < -T * 0.7 && Math.abs(pcx - ccx) <= 3 * T       // the player stands higher, close by
      && !(dy < -2.6 * T && springNear(c) != null && st.springCool <= 0);   // (out of reach of a jump but not of a mushroom: springHelp waits for its moment)
    const wall = mv !== 0 ? wallAhead(c, mv) : null;
    const blocked = !!wall && wall !== 'J';                 // a spring mushroom is not jumped at by accident (springHelp does that)
    const jumpOk = !notesNear(c) && !flowerAbove(c) && !ridesFloe(c);   // never hop around the note steps, up into an unopened flower, or on a floe (it sails away from under her)
    if (c.ground) {
      if (hop && st.jumpCool <= 0) { g.press(cid, 'jump'); st.jumpCool = 0.5; }
      else if (jumpOk && (blocked || climb) && st.jumpCool <= 0) { g.press(cid, 'jump'); st.jumpCool = 0.3; }
      else if (!mv && dy > T * 0.8 && Math.abs(pcx - ccx) < 1.5 * T && chAt(Math.floor(ccx / T), rowOf(c) + 1) === '=') inp.d = 1;   // down through a platform
    } else if (jumpOk && !c.doubled && c.vy >= -40 && ((blocked && wallAhead(c, mv) && wallAhead(c, mv) !== 'J') || (climb && feetOf(c) > feetOf(p) + 8))) {
      g.press(cid, 'jump');                                  // second jump at the top of the first
    }

    // 5. nothing to do: look at the player
    if (!mv && c.ground && Math.abs(pcx - ccx) > 6 && c.dir !== toward) { inp.l = toward < 0 ? 1 : 0; inp.r = toward > 0 ? 1 : 0; }
  }

  /* ---------- the S3 toys ---------- */

  /* A river room: she stands at the water's edge. A floe at her height that is about to touch the bank (or sails towards it) is stepped
     onto (gap <= 24 px) or hopped onto (<= 64 px, not while it sails away); otherwise she waits. { mv, jump } */
  function floeStep(c, mv) {
    const feet = feetOf(c);
    let best = null;
    for (const f of g.floes) {
      if (Math.abs(f.y - feet) > 6) continue;
      const gap = mv > 0 ? f.x - (c.x + c.w) : c.x - (f.x + f.w);
      if (gap < -2) continue;                               // she is on it or past it
      if (!best || gap < best.gap) best = { f, gap };
    }
    if (!best) return { mv: 0, jump: false };
    const away = best.f.vx * mv > 0 && best.f.paused === false;
    if (best.gap <= 24) return { mv, jump: false };
    if (best.gap <= 64 && (!away || best.gap <= 36)) return { mv, jump: true };
    return { mv: 0, jump: false };
  }

  /* The player stands much higher than she does and there is a spring mushroom in her row: walk to it, jump onto it (landing on it throws
     her up about six tiles), steer to the player in the air. Returns true while it is her turn. Gives up after a few seconds
     (then the blink brings her). */
  function springHelp(p, c, cid, dt) {
    const inp = g.input[cid];
    let ss = st.spring;
    if (ss) {
      ss.t += dt;
      const dx = cxOf(p) - cxOf(c);
      if (ss.phase === 'fly') {
        if (c.ground || ss.t > 3.5) { st.spring = null; st.springCool = c.ground ? 0.5 : 4; return false; }
        inp.l = dx < -6 ? 1 : 0; inp.r = dx > 6 ? 1 : 0;
        return true;
      }
      if (!c.ground && c.vy < -620) { ss.phase = 'fly'; ss.t = 0; return true; }      // thrown up
      if (ss.t > 4.5 || c.splash > 0) { st.spring = null; st.springCool = 6; return false; }
      const jx = ss.col * T + T / 2, jd = jx - cxOf(c);
      if (c.ground) {
        const mv = sign(jd);
        if (Math.abs(jd) > T * 1.15) {                        // walk up to it (never into the water)
          if (waterAhead(c, mv)) { st.spring = null; st.springCool = 6; return false; }
          inp.l = mv < 0 ? 1 : 0; inp.r = mv > 0 ? 1 : 0;
        } else if (st.jumpCool <= 0) {                        // next to it: hop onto its top
          inp.l = mv < 0 ? 1 : 0; inp.r = mv > 0 ? 1 : 0;
          g.press(cid, 'jump'); st.jumpCool = 0.6; ss.jt = 0;
        } else if (Math.abs(jd) > T * 0.9) { inp.l = mv < 0 ? 1 : 0; inp.r = mv > 0 ? 1 : 0; }
      } else if (ss.jt != null) {                             // in the first hop: lean towards the mushroom for a moment, then drop straight down
        ss.jt += dt;
        if (ss.jt < 0.22 && Math.abs(jd) > 10) { const mv = sign(jd); inp.l = mv < 0 ? 1 : 0; inp.r = mv > 0 ? 1 : 0; }
      }
      return true;
    }
    if (st.springCool > 0 || !c.ground || feetOf(c) - feetOf(p) < 2.6 * T || !(p.ground || p.vy < -600)) return false;
    const col = springNear(c);
    if (col == null) return false;
    st.spring = { phase: 'walk', col, t: 0, jt: null };
    return true;
  }

  /* the column of a spring mushroom standing in her row within nine tiles (the nearest), or null */
  function springNear(c) {
    const r0 = rowOf(c), c0 = Math.floor(cxOf(c) / T);
    for (let k = 0; k <= 9; k++) for (const d of (k ? [-k, k] : [0])) if (chAt(c0 + d, r0) === 'J') return c0 + d;
    return null;
  }

  /* Nuan as the companion: once the child has made a flower bloom, a flower within her reach blooms with her lantern magic. */
  function bloomHelp(p, c, cid) {
    if (cid !== 'nuan' || !g.flowers.length || flowerHold() || st.bloomCool > 0 || !c.ground) return false;
    const x = cxOf(c), y = c.y + c.h / 2;
    const near = g.flowers.some(f => !f.open && Math.hypot(f.c * T + T / 2 - x, f.r * T + T / 2 - y) <= 70);
    if (!near) return false;
    st.bloomCool = 1.2;
    g.press(cid, 'act');
    return true;
  }

  /* ---------- the public object ---------- */

  function update(dt) {
    if (!g.sisters.frost || !g.sisters.nuan) return;
    if (st.items !== g.items || st.player !== g.player) st = fresh();
    const pid = g.player, cid = other(pid);
    const inp = g.input[cid];
    inp.l = 0; inp.r = 0; inp.d = 0;
    if (g.state !== 'play') return;
    const p = g.sisters[pid], c = g.sisters[cid];

    // the way the player is heading, and how long she has been standing still
    const pin = g.input[pid], heading = (pin.r ? 1 : 0) - (pin.l ? 1 : 0);
    if (heading) { st.runT += dt; if (st.runT > 0.25 || st.dir === heading) st.dir = heading; } else st.runT = 0;
    st.pMoved = Math.abs(p.x - st.px) + Math.abs(p.y - st.py) >= 0.5;
    if (!st.pMoved && !heading) st.idle += dt; else st.idle = 0;
    st.px = p.x; st.py = p.y;
    if (ridesFloe(c)) st.floeT = 0.8; else st.floeT -= dt;
    st.blinkCool -= dt; st.helpCool -= dt; st.jumpCool -= dt; st.springCool -= dt; st.bloomCool -= dt; st.hopT -= dt; st.holdT += dt; st.holdCool -= dt;

    if (c.splash > 0 || p.splash > 0) { st.stuckT = 0; return; }
    if (runAssists(p, c, cid)) return;
    if (plateHelp(p, c, cid)) { st.stuckT = 0; return; }
    if (st.helpCool <= 0 && (meltHelp(p, c, cid) || freezeHelp(p, c, cid))) return;
    if (springHelp(p, c, cid, dt)) { st.stuckT = 0; return; }
    if (bloomHelp(p, c, cid)) return;
    follow(p, c, cid, dt);
  }

  return {
    reset() { st = fresh(); },
    update,
    get idle() { return st.idle; },
  };
}
