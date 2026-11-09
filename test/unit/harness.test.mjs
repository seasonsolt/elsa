/* Unit tests for the harness itself. Each export is one test; it gets { logic, loadLogic, makeHarness, assert }. */
import { StepError } from '../harness.mjs';

const throwsStep = (assert, fn, ...patterns) => {
  let err = null;
  try { fn(); } catch (e) { err = e; }
  assert.ok(err, 'expected the step to throw');
  assert.ok(err instanceof StepError, `expected a StepError, got ${err && err.stack}`);
  for (const p of patterns) assert.match(err.message, p);
};

export function walkStopsOnTheColumnCentre({ logic, makeHarness, assert }) {
  const h = makeHarness(logic, 'hall');
  h.walk('frost', 5);
  const s = h.g.sisters.frost;
  assert.ok(Math.abs(s.x + s.w / 2 - (5 * logic.T + logic.T / 2)) < 1, 'within a pixel of the column centre');
  assert.equal(s.ground, true);
  assert.deepEqual({ ...h.g.input.frost }, { l: 0, r: 0, d: 0 }, 'input is released after the step');
}

export function stuckWalkNamesRoomStepAndPosition({ logic, makeHarness, assert }) {
  const h = makeHarness(logic, 'hall');
  // the tall block stands between column 6 and column 12
  throwsStep(assert, () => h.walk('frost', 12), /\[hall\]/, /walk\(frost, 12\)/, /blocked/, /frost at x=[\d.]+ y=[\d.]+ \(col [\d.]+, feet on row \d+\)/);
}

export function timeoutNamesRoomStepAndPosition({ logic, makeHarness, assert }) {
  const h = makeHarness(logic, 'lake');
  throwsStep(assert, () => h.waitFor(() => false, 0.2, 'never'), /\[lake\]/, /waitFor\(never\)/, /timed out after 0\.2s/);
}

export function fizzFailsUnlessAllowed({ logic, makeHarness, assert }) {
  const h = makeHarness(logic, 'hall');
  throwsStep(assert, () => h.act('nuan'), /fizzled/);
  const ev = h.act('nuan', { fizz: true });
  assert.ok(ev.some(e => e.type === 'fizz'));
}

export function fallingIntoWaterFails({ logic, makeHarness, assert }) {
  const h = makeHarness(logic, 'lake');
  throwsStep(assert, () => h.walk('frost', 10), /water/);
}

export function frostCannotDoubleJump({ logic, makeHarness, assert }) {
  const h = makeHarness(logic, 'hall');
  throwsStep(assert, () => h.hop('frost', 3, true), /second jump/);
}

export function dropNeedsAPlatform({ logic, makeHarness, assert }) {
  const h = makeHarness(logic, 'hall');
  throwsStep(assert, () => h.drop('frost'), /nothing to drop through/);
}

export function stepsDoNothingOnceTheRoomIsCleared({ logic, makeHarness, assert }) {
  const h = makeHarness(logic, 'hall');
  h.g.state = 'clear';                    // as if the room was just won
  const t = h.ticks;
  h.walk('frost', 20); h.hop('nuan', 3); h.act('frost'); h.wait(1);
  assert.equal(h.ticks, t, 'no simulation steps after clear (the game would load the next room)');
  assert.equal(h.index, h.g.index);
}

export function soloModeOnlyDrivesThePlayer({ logic, makeHarness, assert }) {
  if (!logic.createCompanion) return;     // logic without companion.js (pre-S0 page): nothing to test
  const h = makeHarness(logic, 'hall', { mode: 'solo', player: 'nuan' });
  throwsStep(assert, () => h.walk('frost', 5), /companion/);
  h.walk('nuan', 5);                      // the player is fine
}

export function hopChecksTheLandingRowAndDelay({ logic, makeHarness, assert }) {
  const h = makeHarness(logic, 'hall');
  throwsStep(assert, () => h.hop('frost', 2, false, { row: 5 }), /expected row 5/);
  const h2 = makeHarness(logic, 'hall');
  const x0 = h2.g.sisters.frost.x;
  h2.hop('frost', 2, false, { delay: 5 });          // never steers within the jump: lands where it took off
  assert.ok(Math.abs(h2.g.sisters.frost.x - x0) < 1e-9);
}
