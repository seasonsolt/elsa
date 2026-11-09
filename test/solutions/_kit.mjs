/* Helpers shared by the solutions of the S3 rooms (not a room: the runner only loads <room id>.mjs).
   They only use what a player has: the arrow keys (g.input) and the jump / act presses, through the harness steps. */

import { loadLogic, makeHarness } from '../harness.mjs';

export const T = 40;
/** column of the middle of a sister, fractional */
export const colOf = (h, id) => (h.g.sisters[id].x + h.g.sisters[id].w / 2) / T;
export const rowOf = (h, id) => { const s = h.g.sisters[id]; return Math.floor((s.y + s.h - 1) / T); };
const release = (h, id) => Object.assign(h.g.input[id], { l: 0, r: 0, d: 0 });

/** Hold left/right until cond() is true (the harness ticks the game, nothing else moves the sister). */
export function holdUntil(h, id, dir, cond, maxSec = 4, what = 'condition') {
  h.g.input[id].l = dir < 0 ? 1 : 0; h.g.input[id].r = dir > 0 ? 1 : 0;
  try { h.waitFor(cond, maxSec, what); } finally { release(h, id); }
}

/** Hold toward `col` until her middle is within `tol` tiles of it (works in the air and on a spring, unlike walk/hop). */
export function steerTo(h, id, col, tol = 0.2, maxSec = 4) {
  const dir = Math.sign(col - colOf(h, id)) || 1;
  holdUntil(h, id, dir, () => (colOf(h, id) - col) * dir >= -tol, maxSec, `steer ${id} to col ${col}`);
}

/** Press jump on the ground and keep steering toward `col` (like hop, but without the "land within one tile" rule and without
 *  waiting for a landing, so it also works for a launch from a spring mushroom). */
export function leap(h, id, col, { until = null, maxSec = 3 } = {}) {
  h.g.press(id, 'jump');
  const dir = Math.sign(col - colOf(h, id)) || 1;
  const done = until || (() => h.g.sisters[id].ground && h.g.sisters[id].vy === 0 && h.g.sisters[id].y < 1e9 && (colOf(h, id) - col) * dir >= -0.2);
  holdUntil(h, id, dir, done, maxSec, `leap ${id} to col ${col}`);
}

/** Wait (nobody moves) until the sister stands still on ordinary ground (not on a spring that is about to throw her up again). */
export function settle(h, id, maxSec = 3) {
  h.waitFor(() => { const s = h.g.sisters[id]; return s.ground && !s.slope && Math.abs(s.vx) < 1; }, maxSec, `${id} settles`);
}

/** Wait for a floe (index i) to have its x within `dx` pixels of x0 (its left edge) */
export const floeAt = (h, i, x0, dx = 6) => Math.abs(h.g.floes[i].x - x0) <= dx;

/** Jump onto the spring mushroom in column `springCol` (from the ground next to it), let it throw her up, steer to `toCol` in the
 *  air and wait until she stands again (on the row `row` when given). Fails if no bounce happened. */
export function bounce(h, id, springCol, toCol, row = null) {
  const n = h.count('bounce');
  h.g.press(id, 'jump');
  steerTo(h, id, springCol, 0.25, 2);                       // over the mushroom, then let go and drop onto it
  h.waitFor(() => h.count('bounce') > n, 2, `${id} lands on the spring in column ${springCol}`);
  steerTo(h, id, toCol, 0.2, 3);
  settle(h, id, 3);
  if (row != null && rowOf(h, id) !== row) throw new Error(`bounce: ${id} landed on row ${rowOf(h, id)}, expected ${row} (col ${colOf(h, id).toFixed(2)})`);
}

/** Board floe `i` from the bank at column `board`: wait there until the floe is about to touch the bank (its edge `boardX` in
 *  pixels, within 22 px, not sailing away) and hop onto it (`dir` = +1 when the floe is to the right of the bank). */
export function boardFloe(h, id, i, { board, boardX, dir = 1 }) {
  const f = () => h.g.floes[i];
  h.walk(id, board);
  h.waitFor(() => Math.abs(f().x - boardX) < 22 && f().vx * dir <= 0, 14, `floe ${i} comes to the bank`);
  h.hop(id, board + dir * 2);
}

/** Ride floe `i` until its left edge is at `landX` pixels (it has docked at the far bank) and walk off to column `to`. */
export function leaveFloe(h, id, i, { landX, to }) {
  h.waitFor(() => Math.abs(h.g.floes[i].x - landX) < 8, 14, `floe ${i} docks at the far bank`);
  h.walk(id, to);
}

/** boardFloe + leaveFloe: cross a river. */
export function ferry(h, id, i, o) { boardFloe(h, id, i, o); leaveFloe(h, id, i, o); }

/** A fresh solo game of `room` for a small scene check (the solutions use it to prove how the companion behaves in the room's own toy):
 *  place the sisters with h.place and let the game run with h.waitFor / h.wait. */
export function scene(room, me) { return makeHarness(loadLogic(), room, { mode: 'solo', player: me }); }
