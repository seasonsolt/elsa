/* Unit tests for the companion AI (src/companion.js, PLAN A1): follow, jump, wait at water, magic blink (three triggers),
   the generic helps (melt, freeze, plate) and the assists of the room data. Scenes are set up with g.blink through the kit. */
import { soloGame, prng } from '../solo-kit.mjs';

const mk = (ctx, id, o) => soloGame({ loadLogic: ctx.loadLogic }, id, o);
const holdRight = sid => g => { g.input[sid].r = 1; };
const blinksOf = (k, who) => k.log.filter(e => e.type === 'blink' && e.who === who);

/* a copy of the room map with some cells changed; edits are [col, row, char] */
const withCells = (...edits) => lv => {
  const map = lv.map.slice();
  for (const [c, r, ch] of edits) map[r] = map[r].slice(0, c) + ch + map[r].slice(c + 1);
  lv.map = map;
};

export function followsAboutThirtySixPixelsBehind({ assert, ...ctx }) {
  const k = mk(ctx, 'hall');
  k.place('nuan', 3, 11);
  k.run(1, holdRight('nuan'));                         // the player walks right for a second
  k.run(2);                                            // and stops
  const n = k.g.sisters.nuan, f = k.g.sisters.frost;
  const gap = (n.x + n.w / 2) - (f.x + f.w / 2);
  assert.ok(gap > 24 && gap < 48, `the companion stands about 36 px behind (gap ${gap.toFixed(1)})`);
  assert.equal(f.dir, 1, 'and looks at the player');
  assert.equal(blinksOf(k, 'frost').length, 0, 'nothing to blink about');
}

export function lookAtThePlayerWhenThereIsNothingToDo({ assert, ...ctx }) {
  const k = mk(ctx, 'hall');
  k.place('nuan', 3, 11);
  k.run(0.5, holdRight('nuan'));
  k.run(0.5, g => { g.input.nuan.l = 1; });            // the player turns back for a moment ...
  k.run(2);
  const f = k.g.sisters.frost, n = k.g.sisters.nuan;
  assert.equal(f.dir, Math.sign(n.x - f.x) || f.dir, 'she faces the player');
}

export function idleCountsTheSecondsThePlayerStandsStill({ assert, ...ctx }) {
  const k = mk(ctx, 'hall');
  k.run(3.5);
  assert.ok(k.co.idle >= 3.3 && k.co.idle <= 3.6, `idle ${k.co.idle}`);
  k.run(0.3, holdRight('nuan'));
  assert.equal(k.co.idle, 0, 'moving resets it');
  k.run(1);
  assert.ok(k.co.idle > 0.5 && k.co.idle < 1.1, `counts again from the stop (${k.co.idle})`);
}

export function blinksWhenMoreThanSixTilesAway({ assert, ...ctx }) {
  const k = mk(ctx, 'hall');
  k.place('nuan', 15, 11);                             // 13 tiles from the start
  k.run(0.3);
  const b = blinksOf(k, 'frost');
  assert.ok(b.length >= 1, 'blink event for the companion');
  assert.ok(Math.abs(k.col('frost') - k.col('nuan')) < 1.5 && k.row('frost') === 11, 'she is next to the player now');
  assert.ok(k.col('frost') < k.col('nuan'), 'behind the player');
}

export function blinksWhenMoreThanThreeTilesHigher({ assert, ...ctx }) {
  // 4 tiles of height, 1 tile sideways: closer than 6 tiles, so only the height rule can fire in the first moments
  const k = mk(ctx, 'tower');
  k.place('frost', 4, 11);
  k.place('nuan', 3, 7);                               // on the one-way platform at row 8
  k.log.length = 0;
  k.run(0.15);
  assert.equal(blinksOf(k, 'frost').length, 1);
  assert.equal(k.row('frost'), 7, 'up on the platform with the player');
}

export function blinksAfterTwoSecondsWithoutGettingCloser({ assert, ...ctx }) {
  // a seven tiles high wall between them: closer than 6 tiles, not 3 tiles higher, nothing she can jump
  const k = mk(ctx, 'hall', { edit: withCells(...[5, 6, 7, 8, 9, 10, 11].map(r => [5, r, '#'])) });
  k.place('frost', 3, 11);
  k.place('nuan', 6, 11);
  k.log.length = 0;
  k.run(1.7);
  assert.equal(blinksOf(k, 'frost').length, 0, 'she keeps trying for a while');
  k.run(1.2);
  assert.equal(blinksOf(k, 'frost').length, 1, 'then the magic helps');
  assert.ok(k.col('frost') > 5.5, 'on the player side of the wall');
}

export function doesNotBlinkWhileTheyAreTogether({ assert, ...ctx }) {
  const k = mk(ctx, 'hall');
  k.place('nuan', 3, 11);
  k.log.length = 0;
  k.run(6, g => { g.input.nuan.r = (Math.floor(g.time * 2) % 2); });          // wander about
  assert.equal(blinksOf(k, 'frost').length, 0);
}

export function jumpsWallsInsteadOfBlinking({ assert, ...ctx }) {
  const k = mk(ctx, 'hall');
  k.place('frost', 5, 11);
  k.place('nuan', 9, 8);                               // on top of the three tiles high block, three tiles away
  k.log.length = 0;
  k.run(2.5);
  assert.equal(k.row('frost'), 8, 'she is up on the block as well');
  assert.equal(blinksOf(k, 'frost').length, 0, 'by jumping');
  assert.ok(k.log.some(e => e.type === 'jump' && e.who === 'frost'));
  assert.ok(k.log.some(e => e.type === 'doublejump'), 'a wall of three tiles takes a second jump');
}

export function dropsDownThroughAPlatformToFollow({ assert, ...ctx }) {
  const k = mk(ctx, 'hall');
  k.place('frost', 10, 5);                             // on the one-way platform
  k.place('nuan', 10, 8);                              // the player is on the block below
  k.log.length = 0;
  k.run(2);
  assert.ok(k.row('frost') >= 8, `she came down (row ${k.row('frost')})`);
  assert.equal(blinksOf(k, 'frost').length, 0);
}

export function waitsAtTheWaterInsteadOfJumpingIn({ assert, ...ctx }) {
  const k = mk(ctx, 'ballroom', { player: 'frost' });  // the companion is Nuan: she cannot freeze the pit
  k.place('nuan', 4, 11);
  k.place('frost', 9, 11);                             // the player is on the other side of the 3 tile pit
  k.log.length = 0;
  k.run(1.5);
  assert.equal(k.count('splash'), 0, 'no splash');
  assert.ok(k.col('nuan') < 5, `she waits at the edge (col ${k.col('nuan').toFixed(2)})`);
  assert.equal(k.count('blink'), 0);
  k.run(1.2);
  assert.equal(blinksOf(k, 'nuan').length, 1, 'and the magic brings her over after two seconds');
  assert.equal(k.count('splash'), 0);
}

export function freezesAPathAcrossTheLakeAheadOfThePlayer({ assert, ...ctx }) {
  const k = mk(ctx, 'lake', { player: 'nuan' });
  k.log.length = 0;
  // Nuan simply walks to the far bank; Frost (the companion) freezes the water just before she gets there
  k.run(14, g => { g.input.nuan.r = k.col('nuan') < 18 ? 1 : 0; });
  assert.equal(k.count('splash'), 0, 'dry feet all the way');
  assert.ok(k.col('nuan') > 17.5, `reached the far bank (col ${k.col('nuan').toFixed(1)})`);
  const frozen = k.log.filter(e => e.type === 'freeze').map(e => e.c);
  assert.deepEqual([...new Set(frozen)].sort((a, b) => a - b), [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], 'the whole lake');
  assert.ok(k.log.filter(e => e.type === 'magic' && e.who === 'frost').length >= 4, 'three or two tiles per cast');
  assert.ok(blinksOf(k, 'frost').length >= 4, 'she blinks to the water edge for each cast');
}

export function freezesNoMoreThanThreeTilesPerCast({ assert, ...ctx }) {
  const k = mk(ctx, 'lake', { player: 'nuan' });
  k.place('nuan', 4, 10);
  k.log.length = 0;
  k.run(0.2, g => { g.input.nuan.r = 1; });
  k.run(0.3);
  assert.equal(k.log.filter(e => e.type === 'freeze').length, 3);
}

export function doesNotFreezeWhenThePlayerIsFarFromTheWater({ assert, ...ctx }) {
  const k = mk(ctx, 'lake', { player: 'nuan' });
  k.run(2);
  assert.equal(k.count('freeze'), 0);
  assert.equal(k.count('magic'), 0);
}

export function meltsAPinkWallWhenNuanIsTheCompanion({ assert, ...ctx }) {
  const k = mk(ctx, 'hall', { player: 'frost' });
  k.place('frost', 13, 11);
  k.log.length = 0;
  k.run(1.2, g => { g.input.frost.r = k.col('frost') < 15 ? 1 : 0; });
  assert.ok(k.count('melt') >= 3, 'the three tiles of the wall');
  assert.ok(k.log.some(e => e.type === 'magic' && e.who === 'nuan'));
  assert.ok(k.g.grid.every(row => !row.includes('X')), 'the wall is gone');
  assert.equal(blinksOf(k, 'nuan').length >= 1, true, 'she came to the wall by magic');
}

export function leavesThePinkWallToNuanWhenFrostIsTheCompanion({ assert, ...ctx }) {
  const k = mk(ctx, 'hall', { player: 'nuan' });
  k.place('nuan', 16, 11);
  k.log.length = 0;
  k.run(3);
  assert.equal(k.count('melt'), 0, 'Frost cannot melt, the player has to press the magic key herself');
  assert.equal(k.count('magic'), 0);
}

export function standsOnThePlateWhilePlayerGoesThroughTheGate({ assert, ...ctx }) {
  for (const [player, helper] of [['nuan', 'frost'], ['frost', 'nuan']]) {
    const k = mk(ctx, 'tower', { player });
    const plate = k.g.plates[0];
    k.place(player, 6, 11);
    k.log.length = 0;
    k.run(1.3, holdRight(player));                      // towards the gate
    const h = k.g.sisters[helper];
    assert.ok(h.x < (plate.c + 1) * 40 && h.x + h.w > plate.c * 40, `${helper} stands on the plate`);
    assert.equal(k.g.gatesOpen, true);
    k.run(3, g => { g.input[player].r = k.col(player) < 13.5 ? 1 : 0; });          // and through the gate
    assert.ok(k.col(player) > 13, `${player} is on the other side`);
    assert.equal(k.g.gatesOpen, true, 'still held, the player is not 3 tiles past the gate yet');
    assert.ok(h.x < (plate.c + 1) * 40 && h.x + h.w > plate.c * 40, 'still on the plate');
    // the player is three tiles past the gate: the companion follows by magic and the gate closes behind
    k.run(3, g => { g.input[player].r = k.col(player) < 17 ? 1 : 0; });
    k.run(0.5);
    assert.ok(k.col(helper) > 13, `${helper} is across too`);
    assert.ok(blinksOf(k, helper).length >= 2, 'one blink to the plate, one across');
    assert.equal(k.g.gatesOpen, false, 'the gate is closed again');
    assert.equal(k.count('splash'), 0);
  }
}

export function doesNotGoBackToThePlateAfterPassing({ assert, ...ctx }) {
  const k = mk(ctx, 'tower', { player: 'nuan' });
  k.place('nuan', 6, 11);
  k.run(4.5, g => { g.input.nuan.r = k.col('nuan') < 17 ? 1 : 0; });
  k.log.length = 0;
  k.run(3);
  assert.equal(blinksOf(k, 'frost').length, 0, 'she stays with the player on the far side');
  assert.ok(k.col('frost') > 13);
}

export function letsGoOfThePlateWhenThePlayerWalksAway({ assert, ...ctx }) {
  const k = mk(ctx, 'tower', { player: 'nuan' });
  k.place('nuan', 7, 11);
  k.run(1);
  assert.equal(k.g.gatesOpen, true, 'holding');
  k.run(2.6, g => { g.input.nuan.l = 1; });             // the player turns around and goes back to the far left
  assert.ok(k.col('nuan') < 4.5);
  k.run(0.5);
  assert.equal(k.g.gatesOpen, false, 'plate free again');
  assert.ok(Math.abs(k.col('frost') - k.col('nuan')) < 6.5, 'and she is with the player');
}

export function assistBlockIsDoneOnceByTheRightSister({ assert, ...ctx }) {
  const assist = who => lv => { lv.assists = [{ when: { near: [3, 11], r: 2 }, who, do: 'block', from: [5, 11], dir: 1 }]; };
  const k = mk(ctx, 'hall', { player: 'nuan', edit: assist('frost') });
  k.place('nuan', 3, 11);
  k.log.length = 0;
  k.run(2);
  const blocks = k.log.filter(e => e.type === 'block');
  assert.equal(blocks.length, 1, 'once');
  assert.deepEqual([blocks[0].c, blocks[0].r], [6, 11], 'next to the spot she was sent to');
  assert.ok(blinksOf(k, 'frost').some(b => Math.abs(b.to.x - (5 * 40 + 20)) < 1), 'she blinked to tile 5');
  // nobody else's job
  const k2 = mk(ctx, 'hall', { player: 'nuan', edit: assist('nuan') });
  k2.place('nuan', 3, 11);
  k2.log.length = 0;
  k2.run(2);
  assert.equal(k2.count('block'), 0, 'an assist for Nuan is ignored when the companion is Frost');
  // and not before the player is near
  const k3 = mk(ctx, 'hall', { player: 'nuan', edit: assist('any') });
  k3.place('nuan', 15, 11);
  k3.log.length = 0;
  k3.run(2);
  assert.equal(k3.count('block'), 0, 'player far away: nothing');
}

export function assistFreezeAndMeltUseTheGivenSpot({ assert, ...ctx }) {
  // water the generic rule would not look at: far from the player, but the room data says to freeze it as soon as she is near (13,1)
  const edit = lv => { lv.assists = [{ when: { near: [2, 10], r: 4 }, who: 'frost', do: 'freeze', from: [5, 10], dir: 1 }]; };
  const k = mk(ctx, 'lake', { player: 'nuan', edit });
  k.log.length = 0;
  k.run(1);                                            // the player has not moved; the spawn (col 2) is near enough
  assert.equal(k.log.filter(e => e.type === 'freeze').length, 3);
  assert.equal(k.count('magic'), 1);
  const melt = lv => { lv.assists = [{ when: { near: [14, 11], r: 5 }, who: 'nuan', do: 'melt', from: [16, 11], dir: 1 }]; };
  const m = mk(ctx, 'hall', { player: 'frost', edit: melt });
  m.place('frost', 12, 11);
  m.log.length = 0;
  m.run(0.5);
  assert.ok(m.count('melt') >= 3, 'melted from the given spot');
}

export function assistStandOnPlateHoldsThePlateWhenTheGateIsClosed({ assert, ...ctx }) {
  const edit = lv => { lv.assists = [{ when: { gateClosed: true, near: [2, 11], r: 3 }, who: 'any', do: 'standOnPlate' }]; };
  const k = mk(ctx, 'tower', { player: 'nuan', edit });
  k.run(0.5);                                          // the player is at the spawn, far from the gate: only the assist can do this
  const plate = k.g.plates[0], f = k.g.sisters.frost;
  assert.ok(f.x < (plate.c + 1) * 40 && f.x + f.w > plate.c * 40, 'Frost stands on the plate');
  assert.equal(k.g.gatesOpen, true);
}

export function swappingTheControlledSisterSwapsTheRoles({ assert, ...ctx }) {
  const k = mk(ctx, 'hall', { player: 'nuan' });
  k.place('frost', 14, 11);
  k.log.length = 0;
  k.g.swap();                                          // now Frost is the player, Nuan the companion
  k.g.input.frost.l = 1;                               // (her keys belong to the player, the companion must leave them alone)
  k.run(0.3, g => { g.input.frost.l = 1; });
  assert.ok(blinksOf(k, 'nuan').length >= 1, 'Nuan, now the companion, comes to the player');
  assert.equal(blinksOf(k, 'frost').filter(b => b.from.x > 0 && k.log.indexOf(b) > 0).length, 0, 'Frost is not teleported by the companion');
  assert.ok(Math.abs(k.col('nuan') - k.col('frost')) < 3);
}

export function theCompanionOnlyUsesTheInputApi({ assert, ...ctx }) {
  const k = mk(ctx, 'tower', { player: 'nuan' });
  const forbidden = what => () => { throw new Error(`the companion may not touch ${what}`); };
  const readOnly = (obj, name) => new Proxy(obj, { set: forbidden(name), deleteProperty: forbidden(name), defineProperty: forbidden(name) });
  const sisters = new Proxy(k.g.sisters, { get: (t, id) => (typeof id === 'string' && t[id] ? readOnly(t[id], `sisters.${id}`) : t[id]) });
  const grid = readOnly(k.g.grid.map(row => readOnly(row, 'grid')), 'grid');
  const g = new Proxy(k.g, {
    get(t, key) {
      if (key === 'sisters') return sisters;
      if (key === 'grid') return grid;
      const v = t[key];
      return typeof v === 'function' ? v.bind(t) : v;
    },
    set(t, key, value) { throw new Error(`the companion may not set g.${String(key)}`); },
  });
  const co = k.logic.createCompanion(g);
  co.reset();
  for (let i = 0; i < 1800; i++) {                     // 15 s of a player walking right through the tower
    k.g.input.nuan.r = i % 360 < 300 ? 1 : 0;
    if (i % 90 === 0) k.g.press('nuan', 'jump');
    co.update(1 / 120);
    k.g.step(1 / 120);
    k.g.events.splice(0);
  }
  assert.ok(true);
}

export function theCompanionStaysWithAWanderingPlayer({ assert, ...ctx }) {
  // fuzz: a player who walks, jumps and uses the magic at random; the companion must never be left far away for long
  const rooms = ctx.logic.levels.map(l => l.id);
  for (const id of rooms) {
    for (const [seed, player] of [[1, 'nuan'], [2, 'frost'], [3, 'nuan']]) {
      const k = mk(ctx, id, { player });
      const rnd = prng(seed * 7919 + id.length);
      const other = player === 'nuan' ? 'frost' : 'nuan';
      let keyT = 0, dir = 0, apart = 0, worst = 0, companionSplashes = 0;
      for (let i = 0; i < 120 * 45; i++) {
        k.step(g => {
          if ((keyT -= 1 / 120) <= 0) {
            keyT = 0.1 + rnd() * 1.1; dir = rnd() < 0.2 ? 0 : rnd() < 0.5 ? -1 : 1;
            g.input[player].l = dir < 0 ? 1 : 0; g.input[player].r = dir > 0 ? 1 : 0; g.input[player].d = rnd() < 0.08 ? 1 : 0;
          }
          if (rnd() < 0.012) g.press(player, 'jump');
          if (rnd() < 0.004) g.press(player, 'act');
        });
        if (k.g.state !== 'play') break;
        const a = k.g.sisters[player], b = k.g.sisters[other];
        const d = Math.hypot(a.x - b.x, a.y - b.y) / 40;
        apart = d > 7.5 ? apart + 1 / 120 : 0;
        worst = Math.max(worst, apart);
      }
      companionSplashes = k.log.filter(e => e.type === 'splash').length;
      assert.ok(worst < 3.5, `${id}/${player}: the companion was left behind for ${worst.toFixed(1)} s`);
      assert.ok(companionSplashes < 12, `${id}/${player}: ${companionSplashes} splashes`);
    }
  }
}
