/* Stuck timer of the guide (PLAN-2 A4). The companion says the hint after 10 s and the sparkle path appears after 20 s, counted
   from the moment the guide target changed. Building ice, pausing a floe or any other g.progress tick does not reset it: a child
   who mashes the magic key in the same spot is exactly the child who needs the hint. */
import { viewEnv } from './input-safety.test.mjs';

const FRAME = 1 / 60;

/** The hall with Elsa as the player and a voice that records what is asked, stepped by hand frame by frame (no companion). */
function setup() {
  const said = [];
  let env = null;
  const voice = { busy: false, stop() {}, line: key => { said.push({ key, at: clockOf(env) }); return Promise.resolve(true); } };
  env = viewEnv.playPage('solo', { globals: { voice } });
  const { game, guideTick, guideFx, T } = env.exports;
  let now = 0;
  const clockOf = () => now;
  game.load(0);
  game.events.splice(0);
  game.state = 'play';
  /* Elsa stands in the open part of the hall (four free spots around her for ice), Anna is far away, the first target is out of reach */
  game.blink('frost', 15 * T + T / 2, 12 * T);
  game.blink('nuan', 21 * T + T / 2, 12 * T);
  for (let i = 0; i < 60; i++) game.step(1 / 120);
  game.events.splice(0);
  const rig = {
    env, game, guideFx, said, T,
    get now() { return now; },
    guideSays: () => said.filter(s => /^guide_/.test(s.key)),
    /** `sec` of play: the physics stepped at 1/120, the guide ticked per frame, `each(now)` called before every frame */
    run(sec, each) {
      const end = now + sec;
      while (now < end - 1e-9) {
        if (each) each(now);
        game.step(FRAME / 2); game.step(FRAME / 2);
        game.events.splice(0);
        now += FRAME;
        guideTick(FRAME, now, true);
      }
    },
  };
  guideTick(FRAME, now, true);   // the first frame registers the target
  return rig;
}

/** press the magic key every 0.3 s, turning round on the spot each time, so every press finds a free spot and the logic counts progress */
function masher() {
  let next = 0, side = 1;
  return t => {
    if (t < next) return;
    next = t + 0.3; side = -side;
    rigGame.sisters.frost.dir = side;
    rigGame.press('frost', 'act');
  };
}
let rigGame = null;

export function mashingMagicInPlaceDoesNotPostponeTheHintOrThePath({ assert }) {
  const r = setup();
  rigGame = r.game;
  const mash = masher();
  const start = r.game.guide();
  assert.ok(start, 'the hall has a guide target to begin with');
  r.run(9.7, mash);
  assert.ok(r.game.progress >= 20, `the mashing keeps making progress in the logic's eyes (${r.game.progress} ticks in 9.7 s): it builds and replaces ice, which is what used to reset the timer`);
  assert.equal(r.guideSays().length, 0, 'nothing is said before the 10th second');
  r.run(0.9, mash);                                  // up to ~10.6 s
  assert.equal(r.guideSays().length, 1, 'the hint is asked once, in the 10th to 11th second');
  assert.match(r.guideSays()[0].key, /^guide_hall_1$/);
  assert.ok(r.guideSays()[0].at >= 9.95 && r.guideSays()[0].at <= 11, `it came at ${r.guideSays()[0].at.toFixed(2)} s`);
  assert.equal(r.guideFx.trail.getAttribute('visibility'), 'hidden', 'no sparkle path yet');
  r.run(9.0, mash);                                  // ~19.6 s
  assert.equal(r.guideFx.trail.getAttribute('visibility'), 'hidden', 'still no sparkle path just before the 20th second');
  r.run(1.0, mash);                                  // ~20.6 s
  assert.equal(r.guideFx.trail.getAttribute('visibility'), 'visible', 'the sparkle path shows after the 20th second');
  assert.equal(r.game.guide().i, start.i, 'all this time the target stayed the same');
  r.run(5, mash);                                    // 25.6 s
  assert.equal(r.guideSays().length, 1, 'the hint repeats every 20 s, not before');
}

export function reachingTheGuideTargetStartsTheTimerAgain({ assert }) {
  const r = setup();
  rigGame = r.game;
  r.run(8, null);
  const first = r.game.guide();
  assert.equal(r.guideSays().length, 0);
  r.game.blink('frost', first.x, (first.r + 1) * r.T);   // the child gets there: the next target takes over
  r.run(0.3, null);
  const second = r.game.guide();
  assert.ok(second && second.i !== first.i, 'the guide moved on to the next target');
  assert.ok(r.guideFx.t < 0.6, `the timer was reset by the new target (t = ${r.guideFx.t.toFixed(2)})`);
  r.run(9, null);                                         // 9.3 s after the change: the 10 s of the OLD timer are long over
  assert.equal(r.guideSays().length, 0, 'no hint for the new target yet');
  r.run(1.5, null);
  assert.equal(r.guideSays().length, 1, 'the hint comes 10 s after the target changed');
  assert.equal(r.guideSays()[0].key, second.say);
}

export function aNewRoomOrARestartClearsTheTimer({ assert }) {
  const r = setup();
  rigGame = r.game;
  r.run(6, null);
  assert.ok(r.guideFx.t > 5.9);
  r.game.start(r.game.index);
  r.env.exports.handleEvents();
  assert.equal(r.guideFx.t, 0, 'the load event resets the guide');
  assert.equal(r.guideFx.key, '');
}
