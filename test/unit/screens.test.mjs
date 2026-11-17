/* PLAN-2 E1: a room that goes on over a second screen. The first screen's goal leads to the next screen instead of clearing the room;
   the small stars and the memory fragment count for the whole room; the HUD restart only starts the current screen again. */

const SCREEN_1_ROWS = ['EA.+..*.....+......D....', '########################'];
const SCREEN_2_ROWS = ['EA....+.....m......D....', '########################'];

function twoScreens({ loadMap }, mode = 'duo') {
  return loadMap(SCREEN_1_ROWS, {
    guide: [{ c: 6, r: 11, say: 'guide_adhoc_1' }, { c: 19, r: 11, say: 'guide_adhoc_2' }],
    more: [{ map: SCREEN_2_ROWS.map(r => r.replace('m', '.')), memory: [12, 11], guide: [{ c: 19, r: 11, say: 'guide_adhoc_3' }] }],
  }, { mode });
}

export function theFirstScreensDoorLeadsToTheSecondScreenAndOnlyTheLastOneClearsTheRoom({ assert, loadMap }) {
  const h = twoScreens({ loadMap });
  const g = h.g;
  assert.equal(g.screens(), 2);
  assert.deepEqual({ ...g.stars }, { total: 3, got: 0 }, 'the small stars of both screens count from the start');
  h.walk('frost', 6);                       // the snowflake
  h.walk('frost', 19); h.walk('nuan', 19);
  assert.equal(h.count('pass'), 1, 'both at the open door: the screen is passed');
  assert.equal(g.state, 'play', 'not cleared: the room goes on');
  const at = { f: g.sisters.frost.x, n: g.sisters.nuan.x };
  h.nextScreen();
  assert.equal(g.screen, 1);
  const load = h.log.filter(e => e.type === 'load').pop();
  assert.equal(load.screen, 1, "the next screen is announced as a 'load' with its number");
  assert.ok(g.sisters.frost.x < at.f - 400 && g.sisters.nuan.x < at.n - 400, 'both sisters start the new screen at its spawn');
  assert.equal(g.stars.got, 2, 'the stars of the first screen are kept');
  assert.equal(h.count('clear'), 0);
  h.walk('frost', 12);                      // memory fragment, small star on the way
  assert.equal(g.memoryFound, true);
  h.walk('frost', 19); h.walk('nuan', 19);
  assert.equal(h.count('clear'), 1, "the last screen's door clears the room");
  assert.equal(g.stars.got, 3);
}

export function nothingMovesWhileTheNextScreenComes({ assert, loadMap }) {
  const h = twoScreens({ loadMap });
  const g = h.g;
  h.walk('frost', 6);
  h.walk('nuan', 19);
  g.input.frost.r = 1;
  h.waitFor(() => h.count('pass') === 1, 5, 'pass');
  const x = g.sisters.frost.x, t = g.time;
  while (g.time - t < 0.3) h.stepOnce();
  assert.equal(g.sisters.frost.x, x, 'a held key does nothing during the pass');
  assert.equal(g.screen, 0);
  while (g.screen === 0 && g.time - t < 2) h.stepOnce();
  assert.equal(g.screen, 1);
  assert.ok(g.time - t >= 0.55 && g.time - t <= 0.65, `the pass takes about 0.6 s (${(g.time - t).toFixed(2)})`);
  g.input.frost.r = 0;
}

export function theGuideFollowsTheScreenBeingPlayed({ assert, loadMap }) {
  const h = twoScreens({ loadMap });
  const g = h.g;
  assert.equal(g.guide().say, 'guide_adhoc_1');
  h.walk('frost', 6);
  assert.equal(g.guide().say, 'guide_adhoc_2');
  h.walk('frost', 19); h.walk('nuan', 19);
  h.nextScreen();
  assert.equal(g.guide().say, 'guide_adhoc_3', "the second screen's own guide list");
  assert.equal(g.level().memory[0], 12, 'g.level() is the screen being played');
}

export function restartingStartsOnlyTheCurrentScreenAgain({ assert, loadMap }) {
  const h = twoScreens({ loadMap });
  const g = h.g;
  h.walk('frost', 6);
  h.walk('frost', 19); h.walk('nuan', 19);
  h.nextScreen();
  h.walk('frost', 12);
  assert.equal(g.stars.got, 3); assert.equal(g.memoryFound, true);
  g.restart();
  assert.equal(g.screen, 1, 'still the second screen');
  assert.equal(g.stars.got, 2, 'the star found on this screen is to be found again, the first screen\'s stay');
  assert.equal(g.memoryFound, false, 'the fragment of this screen is back in its place');
  assert.ok(g.items.every(it => !it.got));
  assert.equal(g.state, 'play');
}

export function aSoloPlayerIsCarriedThroughToTheNextScreenByTheCompanion({ assert, loadMap }) {
  const h = twoScreens({ loadMap }, 'solo');
  const g = h.g;
  h.walk('frost', 6);
  h.walk('frost', 19);
  h.nextScreen();
  assert.equal(g.screen, 1);
  h.walk('frost', 19);
  h.waitFor(() => g.state !== 'play', 3, 'the room is cleared');
  assert.equal(h.count('clear'), 1, 'the companion blinks to the door of the last screen too');
}
