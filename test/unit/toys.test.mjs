/* Unit tests for the six new toys of CONTRACT section 9: slopes, spring mushrooms, snow bunnies, ice floes, note steps, ice flowers.
   Tiny hand-made rooms through loadMap (test/harness.mjs): the BOTTOM rows of a 13 x 24 map, a short row repeats its last character.
   Each export is one test; it gets { logic, loadLogic, makeHarness, loadMap, assert }. */
import { DT } from '../harness.mjs';
import { checkStructure, checkReach, checkTiles, legalChars } from '../checks.mjs';

const AIR = '.'.repeat(24);
const FLOOR = '#'.repeat(24);
const near = (assert, actual, expected, tol, what) => assert.ok(Math.abs(actual - expected) <= tol, `${what}: ${actual} is not within ${tol} of ${expected}`);
const cx = s => s.x + s.w / 2, feet = s => s.y + s.h;
const count = (h, type) => h.log.filter(e => e.type === type).length;
const hold = (h, id, k, sec = 0) => { Object.assign(h.g.input[id], { l: 0, r: 0, d: 0 }, k); h.wait(sec); };

/* ------------------------------------------------------------------ slopes */

/* A hill: floor row 9 (y 360) on the left, three `\` ramp tiles (cols 9, 10, 11) step down to the floor at row 12 (y 480). */
function loadHill({ loadMap }, mode = 'duo', player = 'nuan') {
  return loadMap([
    '.E.A....................',
    '#########\\..............',
    '##########\\.............',
    '###########\\............',
    FLOOR,
  ], {}, { mode, player });
}

export function aRampSlidesYouDownhillAndHandsYouToTheFloor(ctx) {
  const { assert, logic } = ctx;
  const h = loadHill(ctx);
  const s = h.g.sisters.nuan;
  h.place('nuan', 9, 8);                               // drops onto the first ramp tile
  assert.ok(h.count('slide') >= 1, 'a slide starts');
  const start = cx(s);
  let top = 0;
  for (let i = 0; i < 400; i++) { hold(h, 'nuan', {}, DT); top = Math.max(top, Math.abs(s.vx)); }
  assert.ok(cx(s) > start + 100, `slid ${cx(s) - start}px downhill`);
  near(assert, feet(s), 480, 0.5, 'ended on the low floor');
  assert.equal(s.slope, 0, 'not on a ramp any more');
  assert.ok(top <= logic.TOYS.slideMax * logic.PHYS.speed + 0.01, `never faster than 1.6x the run speed (${top})`);
}

export function slideSpeedFollowsTheRunSpeedOfTheMode(ctx) {
  const { assert, logic } = ctx;
  for (const [mode, speed] of [['duo', logic.PHYS.speed], ['solo', logic.KID_PHYS.speed]]) {
    const h = loadHill(ctx, mode, 'nuan');
    const s = h.g.sisters.nuan;
    h.place('nuan', 9, 8);
    let top = 0;
    for (let i = 0; i < 160; i++) { hold(h, 'nuan', {}, DT); if (s.slope) top = Math.max(top, Math.abs(s.vx)); }
    near(assert, top, logic.TOYS.slideBase * speed, 2, `${mode} slide speed`);
  }
}

export function theArrowsAddAndTakeAwayALittle(ctx) {
  const { assert, logic } = ctx;
  const speedOn = key => {
    const h = loadHill(ctx);
    const s = h.g.sisters.nuan;
    h.place('nuan', 9, 8);
    let top = 0;
    for (let i = 0; i < 100; i++) { hold(h, 'nuan', key, DT); if (s.slope) top = Math.max(top, s.vx); }
    return top;
  };
  const v = logic.PHYS.speed;
  near(assert, speedOn({}), 1.4 * v, 2, 'no arrow');
  near(assert, speedOn({ r: 1 }), 1.6 * v, 2, 'with the slide');
  near(assert, speedOn({ l: 1 }), 1.2 * v, 2, 'against the slide: slower, but still downhill');
}

export function aRampCannotBeClimbed(ctx) {
  const { assert } = ctx;
  const h = loadHill(ctx);
  const s = h.g.sisters.nuan;
  h.place('nuan', 14, 11);                             // on the low floor at the bottom of the hill
  hold(h, 'nuan', { l: 1 }, 5);                        // walk up into it for five seconds
  assert.ok(feet(s) > 440, `still near the bottom (feet at ${feet(s)}), a slippery ramp is no staircase`);
}

export function theTallFaceOfARampIsAWall(ctx) {
  const { assert } = ctx;
  // a `/` wedge on the floor, high end on the right: coming from the right the wedge is a one-tile wall
  const h = ctx.loadMap([
    '.E.A.......' + '/' + '............',
    FLOOR,
  ], {}, { mode: 'duo' });
  h.place('nuan', 15, 11);
  const s = h.g.sisters.nuan;
  hold(h, 'nuan', { l: 1 }, 3);
  assert.ok(cx(s) >= 12 * 40 - 1, `the wedge stopped her at x=${cx(s)}`);
  assert.equal(feet(s), 480, 'and she did not climb it');
}

export function youCanJumpWhileSliding(ctx) {
  const { assert } = ctx;
  const h = loadHill(ctx);
  const s = h.g.sisters.nuan;
  h.place('nuan', 9, 8);
  h.wait(0.2);
  assert.ok(s.slope === 1 && s.ground, 'sliding');
  const x0 = cx(s), f0 = feet(s);
  h.g.press('nuan', 'jump');
  let peak = f0, left = false, last = x0;
  for (let i = 0; i < 100 && !(left && s.ground); i++) { hold(h, 'nuan', {}, DT); peak = Math.min(peak, feet(s)); if (!s.ground) left = true; last = cx(s); }
  assert.equal(count(h, 'jump'), 1, 'a normal jump happened');
  assert.ok(f0 - peak > 60, `she rose ${(f0 - peak).toFixed(0)}px`);
  assert.ok(last > x0 + 30, 'and carried her speed through the air');
}

export function aLeftRampSlidesToTheLeft(ctx) {
  const { assert } = ctx;
  // the hill mirrored: `/` tiles step down to the left
  const h = ctx.loadMap([
    '.................E.A....',
    '..............' + '/' + '#########',
    '.............' + '/' + '##########',
    '............' + '/' + '###########',
    FLOOR,
  ], {}, { mode: 'duo' });
  const s = h.g.sisters.nuan;
  h.place('nuan', 14, 8);
  const x0 = cx(s);
  assert.equal(s.slope, -1);
  h.wait(1);
  assert.ok(cx(s) < x0 - 100, `slid left (${x0} -> ${cx(s)})`);
  near(assert, feet(s), 480, 0.5, 'ended on the low floor');
}

export function slopesLeaveTheOldRulesAlone(ctx) {
  // without ramps the horizontal speed is exactly the run speed, in both modes
  const { assert, logic } = ctx;
  const h = ctx.loadMap(['.E.A....................', FLOOR], {}, { mode: 'duo' });
  hold(h, 'nuan', { r: 1 }, 0.3);
  assert.equal(h.g.sisters.nuan.vx, logic.PHYS.speed);
  assert.equal(h.g.sisters.nuan.slide, 0);
}

/* ---------------------------------------------------------------- spring mushrooms */

const springRoom = (ctx, mode = 'duo', player = 'nuan') => ctx.loadMap(['.E.A....................', '#########J##############'], {}, { mode, player });
const rise = (h, id, sec) => {
  const s = h.g.sisters[id], f0 = 480; let peak = f0;       // the floor (and the mushroom in it) is row 12: feet on top of it are at 480
  for (let i = 0; i < Math.round(sec / DT); i++) { hold(h, id, {}, DT); peak = Math.min(peak, feet(s)); }
  return f0 - peak;
};

export function pressingJumpOnASpringLaunchesSixTilesHigh(ctx) {
  const { assert, logic } = ctx;
  const h = springRoom(ctx);
  const s = h.g.sisters.nuan;
  h.walk('nuan', 9);                                   // along the floor onto the mushroom, no landing involved
  assert.equal(count(h, 'bounce'), 0, 'walking onto it does not bounce');
  assert.equal(feet(s), 480);
  h.g.press('nuan', 'jump');
  const up = rise(h, 'nuan', 1.2);
  const ev = h.log.filter(e => e.type === 'bounce');
  assert.ok(ev.length >= 1 && ev[0].who === 'nuan' && ev[0].c === 9 && ev[0].r === 12, 'a bounce event names the sister and the tile');
  assert.equal(count(h, 'jump'), 0, 'it is a bounce, not a jump');
  assert.ok(up >= 6 * 40 + 6 && up <= 6.5 * 40, `the launch rises ${(up / 40).toFixed(2)} tiles: a ledge 6 tiles up is reachable with margin, 7 is not`);
  assert.ok(up > 2.3 * 40 * 2.5, 'far above a normal jump');
  assert.equal(logic.TOYS.springV, 960);
}

export function landingOnASpringBounces(ctx) {
  const { assert } = ctx;
  const h = springRoom(ctx);
  h.place('frost', 9, 11);                             // dropped onto the mushroom
  const ev = h.log.filter(e => e.type === 'bounce');
  assert.ok(ev.length >= 1, 'landing bounced');
  assert.deepEqual(JSON.parse(JSON.stringify(ev[0])), { type: 'bounce', who: 'frost', c: 9, r: 12 });
  const up = rise(h, 'frost', 1.2);
  assert.ok(up > 5.5 * 40, `and she is still bouncing high (${up})`);
}

export function springBouncesAreHighForBothSistersAndNuanCanStillDoubleJump(ctx) {
  const { assert } = ctx;
  const h = springRoom(ctx);
  h.walk('nuan', 9);
  h.g.press('nuan', 'jump');
  const s = h.g.sisters.nuan;
  let peak = 480, doubled = false;
  for (let i = 0; i < 400; i++) {
    hold(h, 'nuan', {}, DT);
    peak = Math.min(peak, feet(s));
    if (!doubled && s.vy > 0 && !s.ground) { h.g.press('nuan', 'jump'); doubled = true; }
  }
  assert.ok(480 - peak > 6 * 40 + 60, `the double jump on top of the bounce reaches ${(480 - peak) / 40} tiles`);
  assert.equal(count(h, 'doublejump'), 1);
}

export function ordinaryJumpsAndFloorsAreUntouchedBySprings(ctx) {
  const { assert } = ctx;
  const h = springRoom(ctx);
  h.walk('nuan', 5);
  h.g.press('nuan', 'jump');
  const up = rise(h, 'nuan', 0.8);
  near(assert, up, 575 * 575 / 3600, 4, 'a normal jump is still 2.3 tiles');
  assert.equal(count(h, 'bounce'), 0);
}

export function aSpringIsSolidAndBlocksFromTheSide(ctx) {
  const { assert } = ctx;
  // the mushroom stands one tile above the floor: walking into it from the side does nothing
  const h = ctx.loadMap(['.E.A.......J...........', '########################'], {}, { mode: 'duo' });
  h.walk('nuan', 8);
  hold(h, 'nuan', { r: 1 }, 1);
  assert.ok(cx(h.g.sisters.nuan) < 11 * 40, 'it is a wall from the side');
  assert.equal(count(h, 'bounce'), 0);
}

/* ------------------------------------------------------------------ snow bunnies */

const plain = x => JSON.parse(JSON.stringify(x));       // objects made by the logic live in another vm realm
const ev = (h, type) => plain(h.log.filter(e => e.type === type));
/* one 24-character row from {char: col | [cols]} placements, '.' elsewhere: row({ E: 1, A: 3, R: [9, 12], D: 23 }) */
const row = spec => {
  const cells = Array(24).fill('.');
  for (const [ch, at] of Object.entries(spec)) for (const c of [].concat(at)) cells[c] = ch;
  return cells.join('');
};

export function aLostBunnyWakesAtOneAndAHalfTilesForFrostAndThreeForNuansLantern(ctx) {
  const { assert, logic } = ctx;
  assert.equal(logic.TOYS.bunnyWake, 60);
  assert.equal(logic.TOYS.bunnyWakeLantern, 120);
  // the bunny stands in column 8; "close" is measured from the sister's body to the middle of the bunny
  const wakeAt = (id, col) => {
    const h = ctx.loadMap(['E.A.....R...............', FLOOR], {}, { mode: 'duo' });
    assert.equal(h.g.bunnies.length, 1);
    assert.equal(h.g.bunnies[0].state, 'lost');
    h.place(id, col, 11);
    h.wait(0.2);
    return h.g.bunnies[0].state;
  };
  assert.equal(wakeAt('frost', 6), 'lost', 'Frost 67 px away');
  assert.equal(wakeAt('frost', 7), 'follow', 'Frost 27 px away');
  assert.equal(wakeAt('nuan', 4), 'lost', 'Nuan 147 px away');
  assert.equal(wakeAt('nuan', 5), 'follow', 'Nuan 107 px away: her lantern reaches');
}

export function aBunnyTrailsAboutThirtyPixelsBehindAndHopsOverASmallStep(ctx) {
  const { assert } = ctx;
  // a one-tile step in the floor at column 12
  const h = ctx.loadMap(['E.A.....R...#...........', FLOOR], {}, { mode: 'duo' });
  const b = h.g.bunnies[0], nuan = h.g.sisters.nuan;
  h.place('nuan', 6, 11);
  h.wait(0.2);
  assert.equal(b.state, 'follow');
  assert.deepEqual(ev(h, 'bunny'), [{ type: 'bunny', id: 0, state: 'follow' }]);
  h.walk('nuan', 4);
  h.walk('nuan', 10);
  h.wait(1);
  near(assert, cx(nuan) - b.x, 30, 6, 'she stands, the bunny trails about 30 px behind');
  // over the step: Nuan jumps it, the bunny hops it
  h.hop('nuan', 14);
  h.wait(1.5);
  assert.ok(b.x > 13 * 40 && b.x < cx(nuan), `the bunny is over the step too (x=${b.x})`);
  assert.equal(b.state, 'follow');
}

export function aBunnyFarFromHerSisterBlinksToHerAndNeverWalksIntoWater(ctx) {
  const { assert } = ctx;
  // water in columns 11-13: the bunny waits at the shore while Nuan is across it, then blinks over after a while
  const h = ctx.loadMap(['E.A.......R.............', '###########~~~##########'], {}, { mode: 'duo' });
  const b = h.g.bunnies[0];
  h.place('nuan', 9, 11);
  h.wait(0.2);
  assert.equal(b.state, 'follow');
  h.place('nuan', 15, 11);                              // across the water, 5 tiles from the bunny (not far enough to blink at once)
  h.wait(1.5);
  assert.ok(b.x < 11 * 40, `waits at the shore (x=${b.x})`);
  assert.equal(ev(h, 'bunnysplash').length, 0, 'never into the water');
  assert.equal(ev(h, 'bunnyblink').length, 0, 'not yet');
  h.wait(2);
  const blink = ev(h, 'bunnyblink');
  assert.equal(blink.length, 1, 'it was stuck for a while: it blinks to her');
  assert.ok(blink[0].to.x > 14 * 40, 'to the far shore');
  near(assert, nearestSisterDistance(h.g, b), 30, 40, 'next to her now');
}
const nearestSisterDistance = (g, b) => Math.min(...Object.values(g.sisters).map(s => Math.abs(cx(s) - b.x)));

export function aBunnyOnALedgeRightAboveHerSisterBlinksDownToHer(ctx) {
  const { assert } = ctx;
  // found in the browser: the bunny stood on a high ledge straight above the sister (no sideways gap, under 6 tiles) and never came down
  const h = ctx.loadMap(['E.A.....................', '...........R............', '..........===...........', '........................', '........................', '........................', FLOOR], {}, { mode: 'duo' });
  const b = h.g.bunnies[0];
  h.place('nuan', 12, 7);                               // up on the ledge beside the bunny: it wakes
  h.wait(0.2);
  assert.equal(b.state, 'follow');
  h.place('nuan', 11, 11);                              // down on the floor right under the bunny
  h.wait(1);
  assert.equal(ev(h, 'bunnyblink').length, 0, 'not at once');
  h.wait(2.5);
  assert.equal(ev(h, 'bunnyblink').length, 1, 'it waited a few seconds, then blinks to her');
  near(assert, b.y, 480, 1, 'on the floor beside her');
}

export function aBunnyFarAwayBlinksToTheSisterAtOnce(ctx) {
  const { assert } = ctx;
  const h = ctx.loadMap(['E.A.....R...............', FLOOR], {}, { mode: 'duo' });
  const b = h.g.bunnies[0];
  h.place('nuan', 8, 11);
  h.wait(0.1);
  assert.equal(b.state, 'follow');
  h.place('nuan', 22, 11);
  h.wait(0.1);
  assert.equal(ev(h, 'bunnyblink').length, 1);
  assert.ok(Math.abs(cx(h.g.sisters.nuan) - b.x) < 60, 'it stands beside her');
}

export function bunniesGoHomeAndTheyCountAsItemsForTheDoor(ctx) {
  const { assert } = ctx;
  // two bunnies (cols 6, 10), a heart (col 14), the nest (cols 17-18), the door (col 23)
  const h = ctx.loadMap([row({ E: 1, A: 3, R: [9, 12], h: 15, N: [18, 19], D: 23 }), FLOOR], {}, { mode: 'duo' });
  const g = h.g;
  assert.equal(g.bunnies.length, 2);
  assert.deepEqual(plain(g.bunnies.map(b => b.id)), [0, 1]);
  assert.equal(g.bunniesHome, 0);
  assert.equal(g.grid[11][18], 'N', 'the nest tile stays in the grid for the view');
  assert.equal(g.grid[11][9], '.', 'the R tile is air after loading');
  h.walk('nuan', 10);                                   // both bunnies wake up (her lantern), she takes the heart on the way
  h.walk('nuan', 16);
  assert.deepEqual(plain(g.bunnies.map(b => b.state)), ['follow', 'follow']);
  assert.equal(g.items.every(i => i.got), true, 'the heart is in');
  assert.equal(g.doorOpen, false, 'but the bunnies are not home');
  h.walk('nuan', 18);
  h.waitFor(() => g.bunniesHome === 2, 6, 'both bunnies home');
  assert.deepEqual(plain(g.bunnies.map(b => b.state)), ['home', 'home']);
  assert.equal(g.bunniesHome, 2);
  assert.deepEqual(ev(h, 'bunny').map(e => e.state), ['follow', 'follow', 'home', 'home']);
  assert.equal(g.doorOpen, true, 'the last bunny home opens the door');
  assert.equal(count(h, 'open'), 1);
  // home is home: she walks off, they stay
  const xs = plain(g.bunnies.map(b => b.x));
  h.walk('nuan', 22);
  h.wait(1);
  assert.deepEqual(plain(g.bunnies.map(b => b.x)), xs);
}

export function theDoorWaitsForTheLastBunnyEvenWithEverythingElseDone(ctx) {
  const { assert } = ctx;
  const h = ctx.loadMap(['.E.A..R..............D', FLOOR], {}, { mode: 'duo' });
  h.wait(0.5);
  assert.equal(h.g.doorOpen, false, 'no items, but one lost bunny');
  assert.equal(count(h, 'open'), 0);
}

export function bunniesDoNotBlockTheDoorInRoomsWithoutAny(ctx) {
  const { assert } = ctx;
  const h = ctx.loadMap(['.E.A..................D', FLOOR], {}, { mode: 'duo' });
  h.wait(0.1);
  assert.equal(h.g.doorOpen, true, 'nothing to collect: the door is open at once, like before');
}

export function aBunnyGuideEntryIsDoneOnceItFollowsAndTheNestEntryWhenAllAreHome(ctx) {
  const { assert } = ctx;
  const guide = [
    { c: 9, r: 11, say: 'g_b0', bunny: 0 }, { c: 12, r: 11, say: 'g_b1', bunny: 1 },
    { c: 17, r: 11, say: 'g_nest' }, { c: 23, r: 11, say: 'g_door' },
  ];
  const h = ctx.loadMap([row({ E: 1, A: 3, R: [9, 12], N: [17, 18], D: 23 }), FLOOR], { guide }, { mode: 'duo' });
  const g = h.g;
  h.wait(0.1);
  const at = () => JSON.parse(JSON.stringify(g.guide()));
  assert.deepEqual(at(), { i: 0, c: 9, r: 11, say: 'g_b0', x: 380, y: 460, bunny: 0 });
  const p0 = g.progress;
  h.place('frost', 8, 11);                              // Frost wakes the first one
  assert.equal(g.bunnies[0].state, 'follow');
  assert.equal(at().i, 1, 'next: the second bunny');
  assert.ok(g.progress > p0, 'waking a bunny is progress');
  h.place('frost', 11, 11);
  assert.equal(at().i, 2, 'next: the nest');
  h.walk('frost', 18);
  h.waitFor(() => g.bunniesHome === 2, 6, 'home');
  assert.equal(at().i, 3, 'next: the door');
}

/* ------------------------------------------------------------------ ice floes */

/* banks (cols 0-3 and 20-23) at row 10 (y 400); water in row 11 between them; a 3-tile floe in row 10, cols 5-7 */
const RIVER = (floeAt = 5) => [
  row({ E: 0, A: 2 }),
  '####' + '.'.repeat(16) + '####',
  '####' + '~'.repeat(16) + '####',
  FLOOR,
].map((r, i) => (i === 1 ? r.split('').map((ch, c) => (c >= floeAt && c < floeAt + 3 ? 'M' : ch)).join('') : r));
const river = (ctx, floeAt, extra = {}, opts = { mode: 'duo' }) => ctx.loadMap(RIVER(floeAt), extra, opts);

export function aFloeShuttlesAcrossTheWaterAtSixtyPixelsASecond(ctx) {
  const { assert, logic } = ctx;
  const h = river(ctx, 5);
  const f = h.g.floes[0];
  assert.equal(h.g.floes.length, 1);
  assert.deepEqual(plain({ y: f.y, w: f.w, paused: f.paused }), { y: 400, w: 120, paused: false });
  assert.ok(f.x >= 200 && f.x < 230, 'it starts where the M run is and has set off to the right');
  assert.equal(h.g.grid[10][5], '.', 'M is air in the grid: the floe is an entity');
  assert.equal(logic.TOYS.floeSpeed, 60);
  const x0 = f.x;
  h.wait(1);
  near(assert, f.x - x0, 60, 1, 'one second of travel');
  let lo = f.x, hi = f.x, turns = 0, dir = 1;
  for (let i = 0; i < 25 * 120; i++) {
    hold(h, 'nuan', {}, DT);
    lo = Math.min(lo, f.x); hi = Math.max(hi, f.x);
    const d = Math.sign(f.vx); if (d && d !== dir) { turns++; dir = d; }
  }
  near(assert, lo, 4 * 40, 1, 'turns at the left bank');
  near(assert, hi, 20 * 40 - 120, 1, 'turns at the right bank');
  assert.ok(turns >= 3, `back and forth (${turns} turns)`);
  assert.equal(f.y, 400);
}

export function aFloeTurnsWhenThereIsNoWaterUnderItsLeadingEdge(ctx) {
  const { assert } = ctx;
  const h = river(ctx, 5);
  const f = h.g.floes[0];
  h.g.grid[11][12] = 'I';                               // frozen water under the path ahead
  h.waitFor(() => f.vx < 0, 8, 'turns round');
  near(assert, f.x + f.w, 12 * 40, 1, 'its right edge stops at the ice');
  h.g.grid[11][12] = '~';
  h.g.grid[10][12] = 'B';                               // an ice block in its way works as well
  h.waitFor(() => f.vx > 0, 8, 'turns back');
  h.waitFor(() => f.vx < 0, 8, 'and turns again');
  near(assert, f.x + f.w, 12 * 40, 1, 'at the block');
}

export function aFloeCarriesWhoeverStandsOnIt(ctx) {
  const { assert } = ctx;
  const h = river(ctx, 5);
  const f = h.g.floes[0], nuan = h.g.sisters.nuan;
  h.waitFor(() => f.x < 161, 25, 'the floe is back at the bank');
  h.walk('nuan', 3);
  h.walk('nuan', 5);                                    // onto the floe from the bank: level with it
  assert.equal(nuan.ground, true);
  assert.equal(feet(nuan), 400);
  const x0 = cx(nuan), f0 = f.x;
  h.wait(2);
  near(assert, cx(nuan) - x0, f.x - f0, 0.6, 'she moved as far as the floe');
  assert.ok(f.x - f0 > 100, 'and that is a good way');
  assert.equal(nuan.ground, true);
  assert.equal(count(h, 'splash'), 0);
  // all the way to the far end and back, without ever leaving the floe
  const start = cx(nuan) - f.x;
  h.waitFor(() => f.x >= 20 * 40 - 120 - 1, 12, 'far bank');
  near(assert, cx(nuan) - f.x, start, 1.5, 'still standing on the same spot of the floe');
  assert.equal(count(h, 'splash'), 0);
}

export function standingStillOnAFloeIsNotTheSameAsStandingOnTheShore(ctx) {
  const { assert } = ctx;
  const h = river(ctx, 5);
  h.place('nuan', 6, 9);                                // blink onto the floe
  const nuan = h.g.sisters.nuan, f = h.g.floes[0];
  assert.equal(feet(nuan), 400);
  assert.ok(Math.abs(cx(nuan) - (f.x + 40 * 1.5)) < 80);
  h.wait(1);
  assert.equal(nuan.ground, true);
  assert.equal(count(h, 'splash'), 0);
}

export function frostsMagicHoldsAFloeStillForThreeSeconds(ctx) {
  const { assert, logic } = ctx;
  const h = river(ctx, 4);
  const f = h.g.floes[0], frost = h.g.sisters.frost;
  h.walk('frost', 3);
  const reach = Math.max(f.x - cx(frost), 0);
  assert.ok(reach <= logic.TOYS.floeReach, `the floe is in reach (${reach}px)`);
  const ev0 = h.act('frost');
  assert.deepEqual(plain(ev0.filter(e => e.type === 'floe')), [{ type: 'floe', id: 0, paused: true }]);
  assert.ok(ev0.some(e => e.type === 'magic' && e.who === 'frost'));
  assert.equal(count(h, 'freeze'), 0, 'the magic held the floe instead of freezing the water');
  assert.equal(f.paused, true);
  const x0 = f.x, t0 = h.time;
  h.waitFor(() => !f.paused, 4, 'it moves again');
  near(assert, h.time - t0, 3, 0.1, 'after three seconds');
  near(assert, f.x, x0, 0.6, 'and it did not move meanwhile');
  assert.deepEqual(ev(h, 'floe').map(e => e.paused), [true, false]);
  h.wait(1);
  assert.ok(f.x > x0 + 50, 'back to work');
}

export function actingAgainWhileHeldStartsTheThreeSecondsOver(ctx) {
  const { assert } = ctx;
  const h = river(ctx, 4);
  const f = h.g.floes[0];
  h.walk('frost', 3);
  h.act('frost');
  h.wait(2);
  h.act('frost');
  h.wait(2);
  assert.equal(f.paused, true, 'four seconds after the first act, one second after the second');
  assert.equal(ev(h, 'floe').filter(e => e.paused).length, 1, 'one pause event');
  h.waitFor(() => !f.paused, 3, 'then it is let go');
}

export function aFloeOutOfReachIsLeftAlone(ctx) {
  const { assert } = ctx;
  const h = river(ctx, 12);                              // 8 tiles away from the bank
  h.walk('frost', 3);
  h.face('frost', 'right');
  const ev0 = h.act('frost');
  assert.equal(ev0.some(e => e.type === 'floe'), false);
  assert.ok(ev0.some(e => e.type === 'freeze'), 'Frost freezes the water as she always did');
  assert.equal(h.g.floes[0].paused, false);
}

export function aBunnyHopsOntoAFloeAndRidesWithItsFriend(ctx) {
  const { assert } = ctx;
  const h = ctx.loadMap([
    row({ E: 1, A: 0, R: 3 }),
    '####' + 'MMM' + '.'.repeat(13) + '####',
    '####' + '~'.repeat(16) + '####',
    FLOOR,
  ], {}, { mode: 'duo' });
  const g = h.g, f = g.floes[0], b = g.bunnies[0], nuan = g.sisters.nuan, frost = g.sisters.frost;
  h.waitFor(() => f.x > 400, 12, 'the floe sails away');
  h.waitFor(() => f.x < 161, 15, 'and comes back to the bank');
  h.walk('frost', 1);
  h.act('frost');                                       // hold it there
  assert.equal(f.paused, true);
  h.walk('nuan', 3);                                    // wakes the bunny, which follows her
  h.walk('nuan', 6);
  assert.equal(b.state, 'follow');
  h.wait(1.2);
  assert.ok(b.x > f.x && b.x < f.x + f.w, `the bunny is on the floe (bunny ${b.x}, floe ${f.x}..${f.x + f.w})`);
  h.waitFor(() => !f.paused, 4, 'set off');
  const rel = b.x - f.x;
  h.wait(2);
  near(assert, b.x - f.x, rel, 14, 'it rides along');
  assert.ok(f.x > 200);
  assert.equal(ev(h, 'bunnysplash').length, 0);
  assert.ok(frost && nuan);
}

/* ------------------------------------------------------------------ note steps */

/* three notes in the floor, columns 8-10: do re mi; the door waits for the melody */
const notesRoom = (ctx, extra = {}, opts = { mode: 'duo' }) => ctx.loadMap([
  row({ E: 1, A: 3, D: 22 }),
  '########123#############',
], Object.assign({ melody: [1, 2, 3] }, extra), opts);
const notesOf = h => ev(h, 'note').map(e => `${e.n}${e.ok ? '+' : '-'}`);

export function steppingTheMelodyInOrderOpensTheDoor(ctx) {
  const { assert } = ctx;
  const h = notesRoom(ctx);
  const g = h.g;
  assert.deepEqual(plain(g.melody), { seq: [1, 2, 3], pos: 0, done: false });
  h.wait(0.3);
  assert.equal(g.doorOpen, false, 'no items at all, but the melody is not played yet');
  h.walk('nuan', 7);
  assert.deepEqual(notesOf(h), [], 'the floor next to the notes is silent');
  h.walk('nuan', 11);                                   // over do, re, mi
  assert.deepEqual(notesOf(h), ['1+', '2+', '3+']);
  assert.equal(g.melody.pos, 3);
  assert.equal(g.melody.done, true);
  assert.equal(count(h, 'melody'), 1);
  assert.equal(g.doorOpen, true);
  const types = h.log.map(e => e.type).filter(t => t === 'note' || t === 'melody' || t === 'open');
  assert.deepEqual(types, ['note', 'note', 'note', 'melody', 'open'], 'the melody completes, then the door opens');
  const first = ev(h, 'note')[0];
  assert.deepEqual([first.who, first.c, first.r], ['nuan', 8, 12]);
}

export function aWrongNoteDoesNothingBadAndThePlayerJustGoesOn(ctx) {
  const { assert } = ctx;
  const h = notesRoom(ctx);
  const g = h.g;
  h.place('nuan', 12, 11);                              // beyond the notes (blinked there: no steps played)
  h.walk('nuan', 7);                                    // from the wrong end: mi, re, do
  assert.deepEqual(notesOf(h), ['3-', '2-', '1+']);
  assert.equal(g.melody.pos, 1, 'do was right');
  assert.equal(g.melody.done, false);
  assert.equal(g.doorOpen, false);
  assert.equal(count(h, 'splash'), 0);
  h.walk('nuan', 11);                                   // and on: re, mi
  assert.deepEqual(notesOf(h), ['3-', '2-', '1+', '1-', '2+', '3+'], 'do again is wrong now (re is next), then re and mi');
  assert.equal(g.melody.done, true);
  assert.equal(g.doorOpen, true);
}

export function onceItIsPlayedTheStepsJustPlay(ctx) {
  const { assert } = ctx;
  const h = notesRoom(ctx);
  h.walk('nuan', 11);
  const n = count(h, 'note');
  h.walk('nuan', 7);
  const later = ev(h, 'note').slice(n);
  assert.deepEqual(later.map(e => [e.n, e.ok]), [[3, true], [2, true], [1, true]]);
  assert.equal(count(h, 'melody'), 1, 'it is completed only once');
}

export function hoppingOnTheSameStepPlaysItAgain(ctx) {
  const { assert } = ctx;
  const h = ctx.loadMap([row({ E: 1, A: 3 }), '########123#############'], { melody: [1, 1, 2, 3] }, { mode: 'duo' });
  h.walk('nuan', 8);
  h.hop('nuan', 8);
  h.hop('nuan', 8);
  assert.deepEqual(notesOf(h).slice(0, 2), ['1+', '1+'], 'standing still plays nothing more, a hop does');
  assert.equal(h.g.melody.pos, 2);
}

export function inSoloOnlyTheChildsSisterPlaysTheSteps(ctx) {
  const { assert } = ctx;
  const h = notesRoom(ctx, {}, { mode: 'solo', player: 'nuan' });
  h.place('frost', 9, 11);                              // the companion on re
  assert.deepEqual(notesOf(h), [], 'she plays nothing');
  assert.equal(h.g.melody.pos, 0);
  h.place('nuan', 8, 11);
  assert.deepEqual(notesOf(h), ['1+']);
  assert.equal(ev(h, 'note')[0].who, 'nuan');
  const g2 = notesRoom(ctx, {}, { mode: 'solo', player: 'frost' });
  g2.place('frost', 8, 11);
  assert.deepEqual(notesOf(g2), ['1+'], 'and the other way round');
}

export function noteStepsAreSolidSteps(ctx) {
  const { assert } = ctx;
  // do, re, mi as a staircase, each one tile higher than the one before
  const h = ctx.loadMap([
    row({ E: 1, A: 3, D: 22 }),
    '.........3..............',
    '........2...............',
    '#######1################',
  ].map((r, i) => (i === 0 ? r : i === 1 ? '.........3..............' : r)), { melody: [1, 2, 3] }, { mode: 'duo' });
  const nuan = h.g.sisters.nuan;
  h.walk('nuan', 6);
  h.hop('nuan', 7);
  assert.equal(feet(nuan), 480, 'on do, in the floor row');
  assert.ok(h.g.grid[12][7] === '1');
  assert.deepEqual(notesOf(h), ['1+']);
  h.hop('nuan', 8);
  assert.equal(feet(nuan), 440, 'on re, one tile higher');
  assert.deepEqual(notesOf(h), ['1+', '2+']);
}

export function aNoteGuideEntryIsDoneWhenTheMelodyHasPassedIt(ctx) {
  const { assert } = ctx;
  const guide = [{ c: 8, r: 12, say: 'n0', note: 0 }, { c: 9, r: 12, say: 'n1', note: 1 }, { c: 10, r: 12, say: 'n2', note: 2 }, { c: 22, r: 11, say: 'door' }];
  const h = notesRoom(ctx, { guide });
  const at = () => plain(h.g.guide());
  assert.deepEqual(at(), { i: 0, c: 8, r: 12, say: 'n0', x: 340, y: 500, note: 0 });
  h.walk('nuan', 8);
  assert.equal(at().i, 1, 'do is played: the next target is re');
  h.walk('nuan', 9);
  assert.equal(at().i, 2);
  assert.equal(at().note, 2);
  h.walk('nuan', 10);
  assert.equal(h.g.melody.done, true);
  assert.equal(at().i, 3, 'melody done: on to the door');
}

/* ------------------------------------------------------------------ ice flowers */

const garden = (ctx, extra = {}, opts = { mode: 'duo' }) => ctx.loadMap([row({ E: 1, A: 3, F: [8, 11] }), FLOOR], Object.assign({ goal: 'garden' }, extra), opts);

export function aFlowerBloomsWhenNuanTouchesItButNotFrostInDuo(ctx) {
  const { assert } = ctx;
  const h = garden(ctx);
  const g = h.g;
  assert.deepEqual(plain(g.flowers), [{ c: 8, r: 11, open: false }, { c: 11, r: 11, open: false }]);
  assert.equal(g.grid[11][8], '.', 'F is air in the grid');
  h.walk('frost', 9);
  assert.equal(g.flowers[0].open, false, 'Frost walks through the flower in duo: nothing');
  assert.equal(count(h, 'bloom'), 0);
  h.walk('nuan', 9);
  assert.equal(g.flowers[0].open, true);
  assert.deepEqual(ev(h, 'bloom'), [{ type: 'bloom', c: 8, r: 11, n: 1, total: 2 }]);
  assert.equal(g.state, 'play', 'one of two');
}

export function inSoloEitherSisterMakesFlowersBloom(ctx) {
  const { assert } = ctx;
  for (const player of ['frost', 'nuan']) {
    const h = garden(ctx, {}, { mode: 'solo', player });
    h.walk(player, 9);
    assert.equal(h.g.flowers[0].open, true, `${player} as the player`);
    assert.equal(count(h, 'bloom'), 1);
  }
}

export function nuansMagicBloomsFlowersWithinTwoTiles(ctx) {
  const { assert } = ctx;
  const h = garden(ctx);
  h.walk('nuan', 9);                                    // blooms the first one by touch ...
  h.walk('nuan', 9);
  const f2 = h.g.flowers[1];
  h.place('nuan', 14, 11);                              // 3 tiles from the second flower (col 11)
  h.act('nuan', { fizz: true });
  assert.equal(f2.open, false, 'three tiles is too far');
  assert.ok(ev(h, 'fizz').length >= 1, 'a fizzle');
  h.walk('nuan', 13);                                   // two tiles
  const ev0 = h.act('nuan');
  assert.equal(f2.open, true);
  assert.ok(ev0.some(e => e.type === 'bloom' && e.n === 2 && e.total === 2));
  assert.ok(ev0.some(e => e.type === 'magic' && e.who === 'nuan'));
}

export function frostsMagicDoesNotBloomFlowers(ctx) {
  const { assert } = ctx;
  const h = garden(ctx);
  h.place('frost', 9, 11);                              // standing next to the flower, not in it
  h.face('frost', 'right');
  h.act('frost', { fizz: true });
  assert.equal(count(h, 'bloom'), 0);
}

export function aGardenIsClearedByTheLastFlowerAndThenTheGameIsWon(ctx) {
  const { assert } = ctx;
  const h = garden(ctx);
  const g = h.g;
  h.walk('nuan', 9);
  h.wait(0.5);
  assert.equal(g.state, 'play');
  assert.equal(count(h, 'clear'), 0);
  h.walk('nuan', 12);
  assert.equal(g.state, 'clear');
  const types = h.log.map(e => e.type).filter(t => t === 'bloom' || t === 'clear');
  assert.deepEqual(types, ['bloom', 'bloom', 'clear'], 'the last bloom, then the room is clear');
  assert.deepEqual(ev(h, 'bloom').map(e => [e.n, e.total]), [[1, 2], [2, 2]]);
  assert.equal(g.door, null, 'there is no door in a garden');
  assert.equal(h.finish(), 'win', 'it is the last room, so the game is won after the clear screen');
  assert.equal(count(h, 'win'), 1);
}

export function flowersInARoomWithADoorAreOnlyDecoration(ctx) {
  const { assert } = ctx;
  const h = ctx.loadMap([row({ E: 1, A: 3, F: [8, 11], D: 22 }), FLOOR], {}, { mode: 'duo' });
  h.walk('nuan', 12);
  assert.equal(count(h, 'bloom'), 2);
  assert.equal(h.g.state, 'play', 'not cleared by flowers');
  assert.equal(h.g.doorOpen, true, 'nothing to collect: the door is open as usual');
}

export function aFlowerGuideEntryIsDoneWhenItHasBloomed(ctx) {
  const { assert } = ctx;
  const guide = [{ c: 8, r: 11, say: 'f0' }, { c: 11, r: 11, say: 'f1' }];
  const h = garden(ctx, { guide });
  const at = () => plain(h.g.guide());
  assert.equal(at().i, 0);
  h.walk('nuan', 9);
  assert.equal(at().i, 1);
  assert.equal(at().say, 'f1');
}

export function toyTilesAreAllLiveAndLoadAsDesigned(ctx) {
  const { assert, logic } = ctx;
  for (const ch of '/\\JRNM12345F') assert.ok(logic.TILE_CHARS.live.includes(ch), `${ch} is live`);
  assert.equal(logic.TILE_CHARS.future, '');
  assert.equal(logic.isSolidTile('J'), true);
  assert.equal(logic.isSolidTile('3'), true);
  assert.equal(logic.isSolidTile('/'), false);
  assert.equal(logic.isSolidTile('N'), false);
  assert.equal(logic.isSolidTile('G', false), true);
  assert.equal(logic.isSolidTile('G', true), false);
}

/* ------------------------------------------------------------------ level checks know the new toys */

const full = (rows, extra = {}) => {                      // a complete map for checkStructure: rows are the bottom rows, three small stars included
  const top = Array(13 - rows.length).fill(AIR);
  return Object.assign({ goal: 'door', map: top.concat(rows) }, extra);
};
const structure = lv => checkStructure(lv).join(' | ');

export function structureChecksKnowTheGardenGoalAndTheToys(ctx) {
  const { assert, logic } = ctx;
  const stars = row({ '+': [5, 6, 7] });
  const base = [stars, row({ E: 1, A: 3 }), FLOOR];
  assert.equal(structure(full([stars, row({ E: 1, A: 3, F: 9 }), FLOOR], { goal: 'garden' })), '');
  assert.match(structure(full(base, { goal: 'garden' })), /needs at least one ice flower/);
  assert.match(structure(full([stars, row({ E: 1, A: 3, F: 9, D: 20 }), FLOOR], { goal: 'garden' })), /has no door, but the map has a 'D' tile/);
  assert.match(structure(full([stars, row({ E: 1, A: 3, R: 9, D: 20 }), FLOOR])), /lost bunnies \(R\) but no bunny home/);
  assert.match(structure(full([stars, row({ E: 1, A: 3, N: 9, D: 20 }), FLOOR])), /bunny home \(N\) but no bunny/);
  assert.equal(structure(full([stars, row({ E: 1, A: 3, R: 9, N: 12, D: 20 }), FLOOR])), '');
  const notes = [stars, row({ E: 1, A: 3, D: 20 }), '########123#############'];
  assert.equal(structure(full(notes, { melody: [1, 2, 3, 2] })), '');
  assert.match(structure(full(notes, { melody: [1, 4] })), /note 4 but the map has no '4' step/);
  assert.match(structure(full(notes, { melody: [1, 9] })), /melody must be a list of notes 1\.\.5/);
  assert.match(structure(full([stars, row({ E: 1, A: 3, M: [5, 6], D: 20 }), '#####.~' + '#'.repeat(17)])), /floe \(M\) at col 5, row 11 needs water/);
  assert.equal(structure(full([stars, row({ E: 1, A: 3, M: [5, 6], D: 20 }), '#####~~' + '#'.repeat(17)])), '');
  const legal = legalChars(logic.TILE_CHARS);
  assert.deepEqual(checkTiles(full(notes), legal), []);
}

const reachOf = (ctx, rows, extra = {}) => { const h = ctx.loadMap(rows, extra); return checkReach(h.logic, h.index); };

export function reachSeesThatASpringMushroomThrowsSixTilesHigh(ctx) {
  const { assert } = ctx;
  const rows = j => [
    '.'.repeat(8) + 'h' + '.'.repeat(15),          // row 5: a heart standing on the ledge below
    '.'.repeat(6) + '#'.repeat(7) + '.'.repeat(11), // row 6: the ledge, 6 tiles above the floor surface
    AIR, AIR, AIR, AIR,
    row({ E: 1, A: 3 }),
    '####' + (j ? 'J' : '#') + '#'.repeat(19),
  ];
  assert.deepEqual(reachOf(ctx, rows(true)), []);
  assert.match(reachOf(ctx, rows(false)).join(), /nuan cannot reach the heart at col 8, row 5/);
}

export function reachSeesThatAFloeCarriesAcrossTheWater(ctx) {
  const { assert } = ctx;
  // two high banks and a deep river between them (Frost cannot freeze water that far below her feet): only a floe gets across
  const bank = '######' + '.'.repeat(12) + '######';
  const rows = floe => [
    row({ E: 1, A: 3, h: 22 }),
    bank, bank, bank,
    '######' + (floe ? 'MM' : '..') + '.'.repeat(10) + '######',
    '######' + '~'.repeat(12) + '######',
    '######' + '~'.repeat(12) + '######',
    '######' + '~'.repeat(12) + '######',
    FLOOR,
  ].map((r, i) => (i === 0 || i === 4 ? r : i >= 1 && i <= 3 ? r : r));
  assert.deepEqual(reachOf(ctx, rows(true)), []);
  assert.match(reachOf(ctx, rows(false)).join(), /nuan cannot reach the heart at col 22, row 4/);
}

export function reachSeesBunniesNestsFlowersAndNotes(ctx) {
  const { assert } = ctx;
  // a bunny and its nest on the floor: fine; high up where nobody goes: reported
  assert.deepEqual(reachOf(ctx, [row({ E: 1, A: 3, R: 20, N: 22 }), FLOOR]), []);
  const high = reachOf(ctx, [row({ R: 20, N: 22 }), AIR, AIR, row({ E: 1, A: 3 }), FLOOR]);
  assert.match(high.join(), /nobody can get near the lost bunny at col 20/);
  assert.match(high.join(), /nobody can get to the bunny home at col 22/);
  // flowers: Nuan has to get within two tiles
  assert.deepEqual(reachOf(ctx, [row({ E: 1, A: 3, F: 10 }), FLOOR]), []);
  assert.match(reachOf(ctx, [row({ F: 20 }), AIR, AIR, row({ E: 1, A: 3 }), FLOOR]).join(), /nuan cannot get to the ice flower at col 20, row 8/);
  // notes in the floor are fine; a step walled in on a high shelf is not
  assert.deepEqual(reachOf(ctx, [row({ E: 1, A: 3 }), '########123#############'], { melody: [1, 2, 3] }), []);
  const shelf = reachOf(ctx, [AIR, AIR, AIR, AIR, '#'.repeat(24).replace('#', '1'), row({ E: 1, A: 3 }), FLOOR], { melody: [1] });
  assert.match(shelf.join(), /nuan cannot get on the note step 1 at col 0, row 10/);
}

export function reachTreatsRampsAsGroundToWalkOn(ctx) {
  const { assert } = ctx;
  // the hill of the slope tests, with a heart at the foot of it, past the ramps
  const rows = [
    '.E.A....................',
    '#########\\..............',
    '##########\\.............',
    '###########\\............',
    '#'.repeat(24),
  ];
  rows[3] = rows[3].slice(0, 16) + 'h' + rows[3].slice(17);
  assert.deepEqual(reachOf(ctx, rows).filter(p => /heart/.test(p)), []);
  assert.deepEqual(reachOf(ctx, rows), []);
}

/* ------------------------------------------------------------------ regressions found by fuzzing */

export function standingOnTheFloorBesideARampIsStillStandingOnIt(ctx) {
  const { assert } = ctx;
  const h = loadHill(ctx);
  const s = h.g.sisters.nuan;
  h.place('nuan', 9, 8);
  h.wait(1.5);                                         // slid to the foot of the hill
  near(assert, feet(s), 480, 0.5, 'at the foot');
  for (let k = 0; k < 4; k++) {                        // back and forth beside the ramp: the floor next to a ramp is a floor
    hold(h, 'nuan', { l: 1 }, 0.5);
    hold(h, 'nuan', { r: 1 }, 0.5);
    assert.ok(feet(s) <= 480.01 && feet(s) > 440, `feet at ${feet(s)}`);
  }
  assert.equal(count(h, 'splash'), 0);
}

export function jumpingOffARampNextToABlockIsNotAHole(ctx) {
  const { assert } = ctx;
  // jump again and again while sliding down the hill, with an ice block hanging in the air beside the ramps
  const h = ctx.loadMap([
    '.E.A....................',
    '#########\\..............',
    '##########\\.............',
    '###########\\............',
    FLOOR,
  ], {});
  const s = h.g.sisters.nuan;
  h.g.grid[7][11] = 'B';
  h.g.grid[6][12] = 'B';
  for (let round = 0; round < 8; round++) {
    h.place('nuan', 9, 8);
    for (let i = 0; i < 300; i++) {
      if (i % 40 === 0) h.g.press('nuan', 'jump');
      hold(h, 'nuan', { r: round % 2 }, DT);
      assert.ok(Number.isFinite(s.x + s.y), 'finite');
      assert.ok(feet(s) <= 480.01 && s.y > 0, `feet at ${feet(s)}, x ${s.x}`);
      const c0 = Math.floor(s.x / 40), c1 = Math.floor((s.x + s.w - 0.01) / 40), r0 = Math.floor(s.y / 40), r1 = Math.floor((feet(s) - 0.01) / 40);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        if (h.g.grid[r][c] === 'B') assert.fail(`inside the ice block at ${c},${r}`);
      }
    }
  }
}

export function respawningAfterTheWaterNeverPutsYouInsideABlock(ctx) {
  const { assert } = ctx;
  const h = ctx.loadMap([row({ E: 0, A: 5 }), '###########~~~~~~~######'], {}, { mode: 'duo' });
  h.allowSplash = true;
  const s = h.g.sisters.nuan;
  h.walk('nuan', 6);                                     // her last steady spot
  h.allowSplash = true;
  hold(h, 'nuan', { r: 1 }, 1.0);                        // into the water
  assert.ok(s.splash > 0, 'in the water');
  const tc = Math.floor((s.safe.x + s.w / 2) / 40);
  h.g.grid[11][tc] = 'B';                                // somebody froze a block on her safe spot meanwhile
  Object.assign(h.g.input.nuan, { l: 0, r: 0, d: 0 });
  for (let i = 0; i < 200 && count(h, 'respawn') === 0; i++) { hold(h, 'nuan', {}, DT); }
  // the very moment she is back: not inside the block (she is put on the nearest free spot)
  const c0 = Math.floor(s.x / 40), c1 = Math.floor((s.x + s.w - 0.01) / 40), r0 = Math.floor(s.y / 40), r1 = Math.floor((feet(s) - 0.01) / 40);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) assert.notEqual(h.g.grid[r][c], 'B', `she came back inside the block at ${c},${r}`);
  assert.equal(count(h, 'respawn'), 1);
  assert.ok(Math.abs(cx(s) - (tc * 40 + 20)) <= 80, `and close to where she was (${cx(s)} vs ${tc * 40 + 20})`);
}

export function inSoloTheBunnyAlwaysFollowsTheChildNotTheCompanion(ctx) {
  const { assert } = ctx;
  const h = ctx.loadMap([row({ E: 1, A: 3, R: 12 }), FLOOR], {}, { mode: 'solo', player: 'nuan' });
  const b = h.g.bunnies[0];
  h.place('frost', 11, 11);                              // the companion is the one next to it
  h.wait(0.2);
  assert.equal(b.state, 'follow');
  assert.equal(b.leader, 'nuan');
  h.walk('nuan', 6);
  h.wait(2);
  assert.ok(Math.abs(b.x - cx(h.g.sisters.nuan)) < 140, 'it came to the child');
}

export function aSpringReachesALedgeSixTilesUpButNotSeven(ctx) {
  const { assert } = ctx;
  // the mushroom is in the floor at column 4; a ledge starts four columns further on, 6 (row 6) or 7 (row 5) tiles above the floor
  const room = ledgeRow => {
    const rows = [];
    for (let r = 4; r <= 12; r++) {
      if (r === 12) rows.push('####J###################');
      else if (r === 11) rows.push(row({ E: 1, A: 2 }));
      else if (r === ledgeRow) rows.push('.'.repeat(8) + '#'.repeat(5) + '.'.repeat(11));
      else rows.push(AIR);
    }
    return ctx.loadMap(rows, {}, { mode: 'duo' });
  };
  const six = room(6);
  six.walk('nuan', 4);
  six.hop('nuan', 8, false, { row: 5 });
  assert.equal(feet(six.g.sisters.nuan), 240, 'on the ledge six tiles above the floor');
  const seven = room(5);
  seven.walk('nuan', 4);
  assert.throws(() => seven.hop('nuan', 8, false, { row: 4 }), /landed|expected row/, 'seven tiles is too high');
}
