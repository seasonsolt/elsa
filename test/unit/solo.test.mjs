/* Unit tests for the solo-mode rules of logic.js (src/CONTRACT.md §1): KID_PHYS, relaxations, swap, blink, progress, guide, small stars,
   memory pickup. The scenes are set up through the public API (g.blink puts a sister somewhere) and read from g. */
import { DT } from '../harness.mjs';
import { soloGame } from '../solo-kit.mjs';

/* objects made inside the logic's vm context have another Object.prototype: compare them as plain data */
const plain = x => JSON.parse(JSON.stringify(x));
const fresh = ({ loadLogic }, id, o = {}) => soloGame({ loadLogic }, id, Object.assign({ companion: false }, o));

/* walk `sid` to the right for `sec` seconds and return how far she went (px) */
function distanceInHalfASecond(k, sid) {
  const s = k.g.sisters[sid], x0 = s.x;
  k.run(0.5, g => { g.input[sid].r = 1; });
  return s.x - x0;
}

export function kidPhysIsUsedInSoloOnly({ loadLogic, assert }) {
  const logic = loadLogic();
  assert.equal(logic.KID_PHYS.speed, 180);
  assert.equal(logic.KID_PHYS.coyote, 0.14);
  assert.equal(logic.KID_PHYS.buffer, 0.18);
  assert.equal(logic.KID_PHYS.jump, logic.PHYS.jump, 'the jump height must stay the same, only the pace changes');
  assert.equal(logic.PHYS.speed, 220, 'duo keeps the original numbers');
  const solo = fresh({ loadLogic }, 'hall', { mode: 'solo' }), duo = fresh({ loadLogic }, 'hall', { mode: 'duo' });
  assert.ok(Math.abs(distanceInHalfASecond(solo, 'nuan') - 90) < 3, 'solo: 180 px/s');
  assert.ok(Math.abs(distanceInHalfASecond(duo, 'nuan') - 110) < 3, 'duo: 220 px/s');
  solo.g.press('nuan', 'jump'); duo.g.press('nuan', 'jump');
  assert.equal(solo.g.sisters.nuan.jumpBuf, 0.18);
  assert.equal(duo.g.sisters.nuan.jumpBuf, 0.12);
}

export function defaultsAreSoloWithNuan({ logic, assert }) {
  const g = logic.createGame();
  assert.equal(g.mode, 'solo');
  assert.equal(g.player, 'nuan');
  assert.deepEqual(plain(g.stars), { total: 0, got: 0 });
  assert.equal(g.memoryFound, false);
  assert.equal(g.guide !== undefined && typeof g.guide, 'function');
}

export function eitherSisterCollectsInSoloOnly({ loadLogic, assert }) {
  for (const [mode, expectFrostHeart] of [['solo', true], ['duo', false]]) {
    const k = fresh({ loadLogic }, 'hall', { mode });
    const heart = k.g.items.find(i => i.kind === 'h'), flake = k.g.items.find(i => i.kind === '*');
    k.place('frost', heart.c, heart.r);
    assert.equal(heart.got, expectFrostHeart, `${mode}: Frost on a heart`);
    k.place('nuan', flake.c, flake.r);
    assert.equal(flake.got, mode === 'solo', `${mode}: Nuan on a snowflake`);
  }
}

export function bothSistersDoubleJumpInSolo({ loadLogic, assert }) {
  for (const [mode, sid, expected] of [['solo', 'frost', 1], ['solo', 'nuan', 1], ['duo', 'nuan', 1], ['duo', 'frost', 0]]) {
    const k = fresh({ loadLogic }, 'hall', { mode });
    const s = k.g.sisters[sid];
    k.g.press(sid, 'jump');
    k.run(0.3);
    assert.ok(!s.ground, 'in the air');
    k.g.press(sid, 'jump');
    k.run(0.1);
    assert.equal(k.count('doublejump'), expected, `${mode}/${sid}`);
  }
}

export function swapTogglesThePlayerInSolo({ loadLogic, assert }) {
  const k = fresh({ loadLogic }, 'hall', { mode: 'solo' });
  k.g.input.nuan.r = 1;
  k.g.swap();
  assert.equal(k.g.player, 'frost');
  assert.deepEqual(plain(k.g.events.splice(0).filter(e => e.type === 'swap')), [{ type: 'swap', player: 'frost' }]);
  assert.equal(k.g.input.nuan.r, 0, 'a swap lets go of the keys');
  k.g.swap();
  assert.equal(k.g.player, 'nuan');
  const d = fresh({ loadLogic }, 'hall', { mode: 'duo' });
  d.g.swap();
  assert.equal(d.g.player, 'nuan', 'duo: nobody to swap');
  assert.equal(d.g.events.filter(e => e.type === 'swap').length, 0);
}

export function blinkMovesASisterAndSaysSo({ loadLogic, assert }) {
  const k = fresh({ loadLogic }, 'hall');
  const s = k.g.sisters.frost, T = k.logic.T;
  const from = { x: s.x + s.w / 2, y: s.y + s.h };
  assert.equal(k.g.blink('frost', 16 * T + T / 2, 12 * T), true);
  const ev = k.g.events.find(e => e.type === 'blink');
  assert.equal(ev.who, 'frost');
  assert.deepEqual(plain(ev.from), from);
  assert.deepEqual(plain(ev.to), { x: 16 * T + T / 2, y: 12 * T });
  assert.equal(s.vx, 0);
  k.run(0.5);
  assert.ok(s.ground && Math.abs(k.col('frost') - 16.5) < 0.01 && k.row('frost') === 11, 'stands where she was sent');
}

export function blinkNeverBuriesASisterInAWallOrWater({ loadLogic, assert }) {
  const k = fresh({ loadLogic }, 'lake');
  const T = k.logic.T;
  // the middle of a wall: she is put next to it, not inside
  assert.equal(k.g.blink('nuan', 19 * T + T / 2, 9 * T), true);                   // inside the wall column (col 19)
  k.run(0.5);
  assert.ok(k.g.sisters.nuan.splash <= 0 && !k.g.events.some(e => e.type === 'splash'));
  assert.ok(k.g.sisters.nuan.ground);
  // straight onto water: nudged to a dry spot or refused, never a splash
  k.g.blink('nuan', 10 * T + T / 2, 11 * T);
  k.run(0.5);
  assert.equal(k.count('splash'), 0);
  // blink while the sister is in the water brings her out
  k.place('frost', 2, 10);
  k.g.sisters.frost.splash = 0.5;
  assert.equal(k.g.blink('frost', 3 * T + T / 2, 11 * T), true);
  assert.equal(k.g.sisters.frost.splash, 0);
  // not while the room is not being played
  k.g.state = 'clear';
  assert.equal(k.g.blink('frost', 3 * T, 11 * T), false);
}

export function progressCountsRealProgressOnly({ loadLogic, assert }) {
  const k = fresh({ loadLogic }, 'tower', { mode: 'solo' });
  const T = k.logic.T, g = k.g;
  assert.equal(g.progress, 0);
  k.run(1);
  assert.equal(g.progress, 0, 'standing around is not progress');
  const flake = g.items.find(i => i.kind === '*');
  k.place('frost', flake.c, flake.r);
  assert.equal(g.progress, 1, 'collect');
  const heart = g.items.find(i => i.kind === 'h');
  k.place('nuan', heart.c, heart.r);
  assert.equal(g.progress, 2, 'collect');
  const plate = g.plates[0];
  k.place('frost', plate.c, plate.r);
  assert.equal(g.gatesOpen, true);
  assert.equal(g.progress, 3 + 1, 'plate reached (guide) and gate open');   // guide entry 3 is the plate, the gate opens
  k.g.blink('frost', 2 * T, 12 * T);
  k.run(0.3);
  assert.equal(g.progress, 4, 'the gate closing is not progress');
}

export function magicCountsAsProgress({ loadLogic, assert }) {
  const lake = fresh({ loadLogic }, 'lake', { mode: 'duo' });
  lake.place('frost', 5, 10);
  lake.g.press('frost', 'act'); lake.run(0.1);
  assert.equal(lake.count('freeze'), 3);
  assert.equal(lake.g.progress, 1, 'one cast = one step of progress, not three');
  lake.g.press('frost', 'act'); lake.run(0.1);                                   // faces the same water again from the old spot: ice at 9..11 is out of reach
  const hall = fresh({ loadLogic }, 'hall', { mode: 'duo' });
  hall.place('nuan', 16, 11);
  hall.g.press('nuan', 'act'); hall.run(0.1);
  assert.ok(hall.count('melt') >= 3);
  assert.equal(hall.g.progress, 1, 'melting a wall is one step');
  hall.place('frost', 4, 11);
  hall.g.sisters.frost.dir = 1;
  const before = hall.g.progress;
  hall.g.press('frost', 'act'); hall.run(0.1);
  assert.equal(hall.count('block'), 1);
  assert.equal(hall.g.progress, before + 1, 'an ice block');
}

export function guideLeadsThroughTheRoom({ loadLogic, assert }) {
  const k = fresh({ loadLogic }, 'hall');
  const g = k.g, T = k.logic.T, list = k.logic.levels[0].guide;
  let target = g.guide();
  assert.deepEqual(plain({ i: target.i, c: target.c, r: target.r, say: target.say, x: target.x, y: target.y }),
    { i: 0, c: list[0].c, r: list[0].r, say: list[0].say, x: list[0].c * T + T / 2, y: list[0].r * T + T / 2 });
  // collected out of order: the first entry that is not done yet is next
  const item = (c, r) => g.items.find(i => i.c === c && i.r === r);
  k.place('nuan', 13, 11);                            // the snowflake at (13,11), entry 3
  target = g.guide();
  assert.equal(target.i, 0, 'entry 0 (the heart at 4,11) is still open');
  k.place('nuan', 4, 11);
  assert.ok(item(4, 11).got);
  assert.equal(g.guide().i, 1, 'entries 0 and 3 are done, 1 is next');
  k.place('nuan', 10, 8);
  k.place('nuan', 10, 4);
  assert.equal(g.guide().i, 4, 'only the door is left');
  assert.equal(g.guide().say, list[4].say);
  assert.equal(g.doorOpen, true);
  k.place('nuan', 20, 11);
  assert.equal(g.guide(), null, 'every entry done');
}

export function guideDoorEntryNeedsAnOpenDoor({ loadLogic, assert }) {
  const k = fresh({ loadLogic }, 'hall');
  k.place('nuan', 20, 11);
  assert.equal(k.g.doorOpen, false);
  assert.equal(k.g.guide().i, 0, 'standing at a closed door does not finish its entry');
  assert.equal(k.g.progress, 0);
}

export function guideReachingAPlateIsProgress({ loadLogic, assert }) {
  const k = fresh({ loadLogic }, 'tower');
  const plateEntry = k.logic.levels.find(l => l.id === 'tower').guide.findIndex(e => k.g.plates.some(p => p.c === e.c && p.r === e.r));
  assert.ok(plateEntry >= 0, 'the tower guide leads to the plate');
  const p0 = k.g.progress;
  k.place('frost', k.g.plates[0].c, k.g.plates[0].r);
  assert.equal(k.g.guideDone[plateEntry], true);
  assert.ok(k.g.progress > p0);
}

export function smallStarsAreCountedAndNeverGateTheDoor({ loadLogic, assert }) {
  for (const mode of ['solo', 'duo']) {
    const k = fresh({ loadLogic }, 'hall', { mode });
    const stars = k.g.items.filter(i => i.kind === '+');
    assert.ok(stars.length >= 3 && stars.length <= 5, `3-5 stars per room, got ${stars.length}`);
    assert.deepEqual(plain(k.g.stars), { total: stars.length, got: 0 });
    // either sister takes a star, in any mode
    k.place('frost', stars[0].c, stars[0].r);
    k.place('nuan', stars[1].c, stars[1].r);
    const picked = k.log.filter(e => e.type === 'collect' && e.kind === '+');
    assert.deepEqual(picked.map(e => e.n), [1, 2], `${mode}: n counts 1, 2`);
    assert.deepEqual(plain(picked[0]), { type: 'collect', kind: '+', x: stars[0].x, y: stars[0].y, n: 1 });
    assert.equal(k.g.stars.got, 2);
    // a star is only taken once
    k.place('frost', stars[0].c, stars[0].r);
    assert.equal(k.g.stars.got, 2);
    // the door opens when every item is in, whatever the stars say
    assert.equal(k.g.doorOpen, false);
    for (const it of k.g.items.filter(i => i.kind !== '+')) k.place(mode === 'duo' && it.kind === '*' ? 'frost' : 'nuan', it.c, it.r);
    assert.equal(k.g.doorOpen, true, `${mode}: door open with ${k.g.stars.got}/${k.g.stars.total} stars`);
    assert.ok(k.g.stars.got < k.g.stars.total);
  }
}

export function aStarIsNotAnItemForTheCountsOfTheHud({ logic, assert }) {
  const g = logic.createGame();
  g.start(0);
  for (const kind of '*ho') assert.ok(g.items.some(i => i.kind === kind) || kind === 'o');
  assert.ok(g.items.some(i => i.kind === '+'), '+ items are listed like the others, with kind "+"');
  assert.ok(logic.TILE_CHARS.live.includes('+'));
}

export function everyRoomHasThreeToFiveStars({ logic, assert }) {
  logic.levels.forEach((lv, i) => {
    const g = logic.createGame();
    g.load(i);
    assert.ok(g.stars.total >= 3 && g.stars.total <= 5, `${lv.id}: ${g.stars.total} stars`);
    assert.equal(g.grid.flat().includes('+'), false, 'a star is an item, not a tile in the grid');
  });
}

export function memoryFragmentIsPickedUpOnce({ loadLogic, assert }) {
  for (const mode of ['solo', 'duo']) {
    const k = fresh({ loadLogic }, 'hall', { mode });
    const [c, r] = k.logic.levels[0].memory;
    assert.equal(k.g.memoryFound, false);
    k.place('frost', 2, 11);
    assert.equal(k.count('memory'), 0);
    k.place('nuan', c, r + 1);                       // standing just under the fragment
    const ev = k.log.filter(e => e.type === 'memory');
    assert.equal(ev.length, 1, mode);
    assert.equal(ev[0].id, 'm1');
    assert.equal(k.g.memoryFound, true);
    const p = k.g.progress;
    k.place('nuan', c, r + 1);
    assert.equal(k.count('memory'), 1, 'only once');
    assert.equal(k.g.progress, p);
  }
}

export function loadingARoomResetsTheRoomState({ loadLogic, assert }) {
  const k = fresh({ loadLogic }, 'hall');
  const [c, r] = k.logic.levels[0].memory;
  k.place('nuan', c, r + 1);
  k.place('nuan', 2, 8);
  assert.ok(k.g.memoryFound && k.g.progress > 0);
  k.g.start(1);
  assert.equal(k.g.memoryFound, false);
  assert.equal(k.g.progress, 0);
  assert.equal(k.g.stars.got, 0);
  assert.equal(k.g.guide().i, 0);
}

export function inSoloTheCompanionJoinsThePlayerAtTheDoor({ loadLogic, assert }) {
  for (const player of ['nuan', 'frost']) {
    const k = fresh({ loadLogic }, 'hall', { player });
    for (const it of k.g.items.filter(i => i.kind !== '+')) k.place(player, it.c, it.r);
    assert.equal(k.g.doorOpen, true);
    const other = player === 'nuan' ? 'frost' : 'nuan';
    assert.ok(Math.abs(k.col(other) - 20.5) > 3, 'the other sister is far from the door');
    k.log.length = 0;
    k.place(player, 20, 11);
    assert.equal(k.g.state, 'clear', `${player} alone at the door is enough`);
    const blink = k.log.find(e => e.type === 'blink' && e.who === other);
    assert.equal(blink.who, other, 'the other sister is carried by magic');
    assert.ok(Math.abs(blink.to.x - k.g.door.x) < 44);
    assert.equal(k.count('clear'), 1);
  }
  // duo: both have to be there
  const d = fresh({ loadLogic }, 'hall', { mode: 'duo' });
  for (const it of d.g.items.filter(i => i.kind !== '+')) d.place(it.kind === '*' ? 'frost' : 'nuan', it.c, it.r);
  d.place('nuan', 20, 11);
  assert.equal(d.g.state, 'play');
  d.place('frost', 20, 11);
  assert.equal(d.g.state, 'clear');
}

export function theDoorWaitsForTheCompanionToSurface({ loadLogic, assert }) {
  const k = fresh({ loadLogic }, 'hall');
  for (const it of k.g.items.filter(i => i.kind !== '+')) k.place('nuan', it.c, it.r);
  k.g.sisters.frost.splash = 0.3;                    // the companion is in the middle of falling in the water
  k.place('nuan', 20, 11);
  k.g.sisters.frost.splash = 0.3;
  assert.equal(k.g.state, 'play');
  k.run(0.1);
  assert.equal(k.g.state, 'play', 'not while she is in the water');
  k.run(1);
  assert.equal(k.g.state, 'clear');
}

export function theDuoRoomsPlayLikeTheOriginals({ loadLogic, assert }) {
  // in duo nothing of the solo rules leaks in: the same input, the same distance as the old PHYS, one sister can still not take the other's item
  const k = fresh({ loadLogic }, 'tower', { mode: 'duo' });
  const flake = k.g.items.find(i => i.kind === '*');
  k.place('nuan', flake.c, flake.r);
  assert.equal(flake.got, false);
  assert.equal(k.g.mode, 'duo');
  assert.ok(DT > 0);
}
