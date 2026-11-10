/* Input safety (PLAN-2 A1, A2 touch half, A8, A9): a 6 year old mashing keys must not change the save, wipe a room or skip a
   lesson, and the touch buttons must steer the sister the child picked.

   The view files are plain scripts that share one scope, so these tests do what art/build_page.py does: run the logic, then the
   real src/view files inside one function scope, against a small fake DOM. `viewEnv` is exported as an object (not a function)
   so test/run.mjs does not mistake it for a test; guide-timer.test.mjs reuses it. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

class FakeEl {
  constructor(tag, id = '') {
    this.tagName = String(tag || 'div').toUpperCase();
    this.id = id;
    this.attrs = {};
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.dataset = {};
    this.listeners = {};
    this._text = '';
    const classes = new Set();
    this.classList = { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c), toggle: c => (classes.has(c) ? classes.delete(c) : classes.add(c)) };
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
  appendChild(c) { if (c.parentNode) c.remove(); c.parentNode = this; this.children.push(c); return c; }
  insertBefore(c, before) {
    if (c.parentNode) c.remove();
    const i = before ? this.children.indexOf(before) : -1;
    c.parentNode = this;
    if (i < 0) this.children.push(c); else this.children.splice(i, 0, c);
    return c;
  }
  remove() {
    if (!this.parentNode) return;
    const i = this.parentNode.children.indexOf(this);
    if (i >= 0) this.parentNode.children.splice(i, 1);
    this.parentNode = null;
  }
  cloneNode() { return new FakeEl(this.tagName); }
  querySelector() { return new FakeEl('x'); }
  querySelectorAll() { return []; }
  addEventListener(type, fn) { (this.listeners[type] || (this.listeners[type] = [])).push(fn); }
  removeEventListener() {}
  dispatchEvent() { return true; }
  focus() {}
  blur() {}
  get textContent() { return this._text; }
  set textContent(v) { for (const c of this.children) c.parentNode = null; this.children = []; this._text = String(v); }
  set innerHTML(v) { this.textContent = ''; }
  get innerHTML() { return ''; }
}

/** Fake timers: setTimeout/performance.now run on a clock the test moves by hand. */
function makeClock() {
  const clock = { now: 0, timers: [], seq: 0 };
  clock.setTimeout = (fn, ms = 0) => { const id = ++clock.seq; clock.timers.push({ id, fn, at: clock.now + ms }); return id; };
  clock.clearTimeout = id => { clock.timers = clock.timers.filter(t => t.id !== id); };
  clock.setInterval = () => ++clock.seq;
  clock.clearInterval = () => {};
  const settle = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };
  /** move the wall clock forward `ms` in 50 ms steps, firing due timers and letting promises settle after each */
  clock.advance = async ms => {
    const end = clock.now + ms;
    while (clock.now < end) {
      clock.now = Math.min(end, clock.now + 50);
      const due = clock.timers.filter(t => t.at <= clock.now).sort((a, b) => a.at - b.at);
      clock.timers = clock.timers.filter(t => t.at > clock.now);
      for (const t of due) t.fn();
      await settle();
    }
    await settle();
  };
  clock.settle = settle;
  return clock;
}

/**
 * Load the real logic and the named src/view files (without .js) into one fake page.
 *   opts.touch       the device has a touch screen
 *   opts.globals     extra globals (stand-ins for the view files that are not loaded)
 *   opts.exports     names from the view scope to hand back
 * Returns { ctx, clock, pads, windowListeners, keydown(code, extra), exports }.
 */
function load(files, opts = {}) {
  const clock = makeClock();
  const elements = new Map();
  const getEl = id => { if (!elements.has(id)) elements.set(id, new FakeEl('div', id)); return elements.get(id); };
  const body = new FakeEl('body');
  const docListeners = {};
  const document = {
    getElementById: getEl,
    createElementNS: (ns, tag) => new FakeEl(tag),
    createElement: tag => new FakeEl(tag),
    body, documentElement: new FakeEl('html'),
    activeElement: body,
    querySelectorAll: () => [],
    addEventListener: (t, f) => { (docListeners[t] || (docListeners[t] = [])).push(f); },
    fullscreenElement: null,
  };
  const store = new Map();
  const windowListeners = [];
  const requested = [];
  const pads = { list: [] };
  class FakeImage {
    set src(v) { this._src = v; requested.push(v); }
    get src() { return this._src; }
    decode() { return Promise.resolve(); }
  }
  const sizes = JSON.parse(fs.readFileSync(path.join(ROOT, 'art', 'sizes.json'), 'utf8'));
  const lines = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'content', 'lines.json'), 'utf8'));
  const words = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'content', 'words.json'), 'utf8'));

  const ctx = {
    document, console, Math, JSON, Promise, Object, Array, Set, Map, Number, String, Boolean, Date, Infinity, NaN, Error,
    location: { search: '' },
    navigator: { maxTouchPoints: opts.touch ? 5 : 0, getGamepads: () => pads.list },
    getComputedStyle: () => ({}),
    requestAnimationFrame: () => 0,
    MouseEvent: class {},
    Image: FakeImage,
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, setInterval: clock.setInterval, clearInterval: clock.clearInterval,
    performance: { now: () => clock.now },
    addEventListener: (type, fn, capture) => windowListeners.push({ type, fn, capture: !!capture }),
    // stand-ins for view files that are not loaded here
    uxState: { modal: null },
    ...(opts.globals || {}),
  };
  ctx.window = ctx;
  ctx.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: k => { store.delete(k); } };
  if (opts.touch) ctx.ontouchstart = null;
  vm.createContext(ctx);

  const logicDir = path.join(ROOT, 'src');
  const logic = fs.readdirSync(logicDir).filter(f => f.endsWith('.js')).sort().map(f => fs.readFileSync(path.join(logicDir, f), 'utf8')).join('');
  vm.runInContext(logic, ctx, { filename: 'logic' });

  const viewDir = path.join(ROOT, 'src', 'view');
  let view = files.map(f => fs.readFileSync(path.join(viewDir, f + '.js'), 'utf8')).join('');
  view = view.replace("/*ASSET_VERSION*/'dev'", "'dev'").replace('/*SIZES*/{}', JSON.stringify(sizes)).replace('/*LINES*/{}', JSON.stringify(lines)).replace('/*WORDS*/[]', JSON.stringify(words));
  const names = ['game', ...(opts.exports || [])];
  const code = `(() => {\n${view}\nreturn { ${names.join(', ')} };\n})()`;
  const exportsObj = vm.runInContext(code, ctx, { filename: 'view' });

  const env = {
    ctx, clock, pads, windowListeners, requested, store, getEl, exports: exportsObj,
    /** dispatch a keydown to every window listener (capture ones first), like the browser would; returns whether anyone prevented it */
    keydown(code, extra = {}) {
      const ev = { type: 'keydown', code, repeat: false, metaKey: false, ctrlKey: false, altKey: false, target: body, prevented: false, stopped: false,
        preventDefault() { this.prevented = true; }, stopPropagation() {}, stopImmediatePropagation() { this.stopped = true; }, ...extra };
      const hear = windowListeners.filter(l => l.type === 'keydown');
      for (const l of [...hear.filter(l => l.capture), ...hear.filter(l => !l.capture)]) { if (ev.stopped) break; l.fn(ev); }
      return ev;
    },
    keyup(code) { for (const l of windowListeners.filter(l => l.type === 'keyup')) l.fn({ type: 'keyup', code }); },
    /** a pointerdown on the element with this id */
    tap(id) {
      let prevented = false;
      for (const fn of getEl(id).listeners.pointerdown || []) fn({ preventDefault() { prevented = true; } });
      return prevented;
    },
  };
  return env;
}


const MAIN_FILES = ['00-core', '10-stage', '20-sisters', '30-fx', '80-input', '90-main'];
const MAIN_EXPORTS = ['guideTick', 'guideFx', 'playFlow', 'save', 'view', 'pollGamepad', 'padState', 'restartRoomHeld', 'restartRoom', 'drawDuoTouchMark', 'drawGates', 'handleEvents',
  'T', 'frame', 'enterRoom', 'beginPlay', 'runTutorial', 'stale', 'newToken', 'canPlay', 'inputSeen', 'syncInput'];

/** A page with the play-side view files, a spy for advanceStory/voice, and the room live (phase 'play'). */
function playPage(mode = 'solo', opts = {}) {
  const spies = { advance: 0, voiceStops: 0, lastArg: undefined };
  const env = load(MAIN_FILES, {
    exports: MAIN_EXPORTS,
    globals: {
      advanceStory: a => { spies.advance++; spies.lastArg = a; },
      voice: { busy: true, stop: () => { spies.voiceStops++; }, line: () => Promise.resolve(true) },
      ...(opts.globals || {}),
    },
    ...opts,
  });
  const { game, playFlow, save } = env.exports;
  save.settings.mode = mode;
  game.mode = mode;
  game.load(0);
  game.events.splice(0);
  game.state = 'play';
  playFlow.phase = 'play';
  env.spies = spies;
  return env;
}

export const viewEnv = { load, playPage };

const snapshot = env => {
  const { game, playFlow, save } = env.exports;
  return JSON.stringify({ settings: save.settings, index: game.index, items: game.items.map(i => i.got), blocks: game.blocks.length, phase: playFlow.phase, state: game.state, loads: game.events.filter(e => e.type === 'load').length });
};

const PLAIN_KEYS = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(c => `Key${c}`),
  ...'0123456789'.split('').map(c => `Digit${c}`),
  ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
];

export function noPlainKeyChangesTheSaveOrTheRoomWhileYouPlay({ assert }) {
  for (const mode of ['solo', 'duo']) {
    const env = playPage(mode);
    const { game } = env.exports;
    game.items[0].got = true;          // something collected: a room restart would take it back
    let starts = 0;
    const start = game.start;
    game.start = i => { starts++; return start(i); };
    const before = snapshot(env);
    for (const code of PLAIN_KEYS) { env.keydown(code); env.keyup(code); }
    for (const code of ['KeyM', 'KeyR', 'KeyM', 'KeyR']) env.keydown(code);   // and again, the two that used to act
    assert.equal(snapshot(env), before, `${mode}: letters, digits and F keys leave settings, room index, items, phase and state alone`);
    assert.equal(game.items[0].got, true, `${mode}: the collected item is still collected (no restart)`);
    assert.equal(starts, 0, `${mode}: the room was not restarted`);
    assert.equal(env.exports.save.settings.sound, true, `${mode}: M no longer mutes`);
  }
}

export function theRestartButtonsHeldPressRestartsOnlyALiveRoom({ assert }) {
  const env = playPage('solo');
  const { game, playFlow, restartRoomHeld } = env.exports;
  let starts = 0;
  const start = game.start;
  game.start = i => { starts++; return start(i); };
  game.items[0].got = true;
  assert.equal(restartRoomHeld(), true, 'a live room restarts');
  assert.equal(starts, 1);
  assert.equal(game.items[0].got, false, 'the room is back to its start');
  assert.equal(game.state, 'play');

  game.items[0].got = true;
  playFlow.phase = 'clear';
  assert.equal(restartRoomHeld(), false, 'the clear page is not a live room');
  playFlow.phase = 'play'; env.ctx.story = { name: 'quiz' };
  assert.equal(restartRoomHeld(), false, 'a scene covers the room');
  env.ctx.story = null; env.ctx.uxState.modal = { name: 'settings' };
  assert.equal(restartRoomHeld(), false, 'the parent settings pause the room');
  assert.equal(game.items[0].got, true, 'none of those touched the room');
  assert.equal(starts, 1);
}

export function scenesIgnoreSpaceAndTheTouchPlayButtonsButEnterStillAdvances({ assert }) {
  for (const scene of ['chapter', 'recall', 'clear', 'quiz']) {
    const env = playPage('solo', { touch: true });
    const { game, playFlow } = env.exports;
    playFlow.phase = scene === 'clear' || scene === 'quiz' ? 'clear' : 'intro';
    env.ctx.story = { name: scene };
    const sister = game.sisters.frost;
    for (let i = 0; i < 10; i++) { env.keydown('Space'); env.keyup('Space'); }
    for (const id of ['tJump', 'tAct', 'tSwitch']) for (let i = 0; i < 10; i++) env.tap(id);
    assert.equal(env.spies.advance, 0, `${scene}: Space and the touch jump / magic buttons do not advance the scene`);
    assert.equal(env.spies.voiceStops, 0, `${scene}: the voice task is not ended`);
    assert.equal(env.exports.playFlow.phase, scene === 'clear' || scene === 'quiz' ? 'clear' : 'intro', `${scene}: phase unchanged`);
    assert.equal(sister.jumpBuf, 0, `${scene}: no jump leaked into the room`);
    env.keydown('Enter');
    assert.equal(env.spies.advance, 1, `${scene}: Enter still advances`);
  }
}

export function aGamepadLeavesASceneWithStartOnly({ assert }) {
  const env = playPage('solo');
  const { playFlow, pollGamepad } = env.exports;
  playFlow.phase = 'intro';
  env.ctx.story = { name: 'quiz' };
  const pad = down => ({ connected: true, axes: [0, 0], buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: down.includes(i) })) });
  env.pads.list = [pad([0])]; pollGamepad();      // A = jump
  env.pads.list = [pad([])]; pollGamepad();
  env.pads.list = [pad([2])]; pollGamepad();      // X = magic
  env.pads.list = [pad([])]; pollGamepad();
  assert.equal(env.spies.advance, 0, 'the play buttons do not advance a scene');
  env.pads.list = [pad([9])]; pollGamepad();      // Start
  assert.equal(env.spies.advance, 1, 'Start does');
  assert.equal(env.spies.lastArg, true, 'and says it is an Enter-like press, which strict scenes accept after their quiet second');
}

export function duoTouchJumpAndMagicActForTheSisterThePlayerPicked({ assert }) {
  const env = playPage('duo', { touch: true });
  const { game } = env.exports;
  const jumpBuf = id => game.sisters[id].jumpBuf, actBuf = id => game.sisters[id].actBuf;
  env.tap('tJump'); env.tap('tAct');
  assert.ok(jumpBuf('frost') > 0 && actBuf('frost') > 0, 'the touch buttons start on Elsa');
  assert.equal(jumpBuf('nuan'), 0, 'and not on Anna');
  for (const id of ['frost', 'nuan']) Object.assign(game.sisters[id], { jumpBuf: 0, actBuf: 0 });
  env.tap('tSwitch');
  env.tap('tJump'); env.tap('tAct');
  assert.ok(jumpBuf('nuan') > 0 && actBuf('nuan') > 0, 'after the switch they act for Anna');
  assert.equal(jumpBuf('frost'), 0, 'and no longer for Elsa');
  assert.equal(actBuf('frost'), 0);
  env.tap('tSwitch');
  Object.assign(game.sisters.nuan, { jumpBuf: 0, actBuf: 0 });
  env.tap('tJump');
  assert.ok(jumpBuf('frost') > 0, 'switching back returns to Elsa');
}

export function duoTouchMarksTheSisterTheButtonsSteer({ assert }) {
  const errors = [];
  const env = playPage('duo', { touch: true, globals: { console: { log() {}, warn() {}, error: (...a) => errors.push(a) } } });
  const { game, view, frame } = env.exports;
  const shown = id => view[id].mark.getAttribute('visibility');
  frame(1000); frame(1016);                        // the real frame loop: 20-sisters hides the marks, the touch mark puts one back
  assert.deepEqual(errors, [], 'a frame runs without errors');
  assert.equal(shown('frost'), 'visible', 'the marker starts on Elsa');
  assert.equal(shown('nuan'), 'hidden');
  env.tap('tSwitch');
  frame(1032);
  assert.equal(shown('nuan'), 'visible', 'it follows the switch button');
  assert.equal(shown('frost'), 'hidden');
  game.state = 'clear';
  frame(1048);
  assert.equal(shown('nuan'), 'hidden', 'and goes away when the room is not live');
}

export function noMarkIsDrawnForDuoWithoutATouchScreen({ assert }) {
  const env = playPage('duo', { touch: false });
  const { view, drawDuoTouchMark } = env.exports;
  view.frost.mark.setAttribute('visibility', 'hidden');
  drawDuoTouchMark(1);
  assert.equal(view.frost.mark.getAttribute('visibility'), 'hidden');
}

export function theGateColumnIsKeptAndOnlyItsTransformChanges({ assert }) {
  const env = playPage('solo');
  const { game, drawGates, T } = env.exports;
  game.gates.push({ c: 6, r: 8 }, { c: 6, r: 9 });
  game.plates.push({ c: 3, r: 10, down: false });
  const box = env.getEl('gates');
  drawGates(true);
  const column = box.children[0];
  assert.equal(column.attrs.class, 'gateArt');
  assert.equal(column.style.transform, 'translateY(0px)', 'closed');
  game.gatesOpen = true;
  drawGates();
  assert.equal(box.children[0], column, 'the same node is still there, so the CSS transition can play');
  assert.equal(column.style.transform, `translateY(${-2 * T * 0.9}px)`, 'only the transform moved');
  game.plates[0].down = true;
  game.gatesOpen = false;
  drawGates();
  assert.equal(box.children[0], column, 'closing keeps the node too');
  assert.equal(column.style.transform, 'translateY(0px)');
  const plates = box.children[1];
  assert.equal(plates.children.length, 1, 'plates are redrawn in their own group');
  assert.match(plates.children[0].attrs.href, /plate_down/);
  drawGates(true);
  assert.notEqual(box.children[0], column, 'a new room (fresh) starts from new nodes, without sliding');
}

export function aRoomIsLoadedOnceWhenTheChildEntersIt({ assert }) {
  let chapterDone = null;
  const env = playPage('solo', { globals: { showChapter: (lv, done) => { chapterDone = done; } } });
  const { game, enterRoom, playFlow } = env.exports;
  let loads = 0;
  const load = game.load;
  game.load = i => { loads++; return load(i); };
  const start = game.start;
  game.start = i => { loads++; return start(i); };
  playFlow.phase = 'title'; game.state = 'title';
  enterRoom(0);
  assert.equal(loads, 1, 'the room is loaded and drawn behind the chapter card');
  assert.equal(playFlow.phase, 'intro');
  assert.equal(game.state, 'title', 'not live while the card is up');
  chapterDone();
  return env.clock.settle().then(() => {
    assert.equal(loads, 1, 'going live does not load it again');
    assert.equal(playFlow.phase, 'play');
    assert.equal(game.state, 'play');
  });
}

export function theToyPicturesAreInTheFirstPreload({ assert }) {
  const env = playPage('solo');
  const wanted = ['tile_slope_r', 'tile_slope_l', 'spring_0', 'spring_1', 'floe_l', 'floe_m', 'floe_r', 'note_1', 'note_5_lit', 'flower_0', 'flower_2', 'bunny_idle', 'bunny_hop4', 'bunny_home', 'bunny_nest'];
  for (const name of wanted) assert.ok(env.requested.some(u => u.startsWith(`game/${name}.webp`)), `${name} is preloaded`);
}

export async function clearingARoomTakesANewTokenSoTheTutorialCannotTalkOverTheClearPage({ assert }) {
  const env = playPage('solo');
  const { game, playFlow, handleEvents, stale } = env.exports;
  const roomToken = playFlow.token;
  game.events.push({ type: 'clear' });
  handleEvents();
  assert.equal(playFlow.phase, 'clear');
  assert.notEqual(playFlow.token, roomToken, 'the clear page has its own token');
  assert.equal(stale(roomToken), true, 'everything the room started (tutorial lessons, room intro) is stale now');
}

export async function tutorialWaitsRunOnGameTimeNotTheWallClock({ assert }) {
  const lessons = [];
  const env = playPage('solo', { globals: { voice: { busy: false, stop() {}, line: key => { lessons.push(key); return new Promise(() => {}); } } } });
  const { game, save, playFlow, runTutorial } = env.exports;
  save.flags.fullscreenTip = true;
  save.flags.tutorial = false;
  const tok = playFlow.token;
  const running = runTutorial(tok);
  await env.clock.settle();
  assert.deepEqual(lessons, ['tutor_move'], 'the walking lesson is asked first');
  assert.equal(game.kbd.teach === 'r' || game.kbd.teach === 'l', true);

  await env.clock.advance(120000);                  // two minutes pass on the wall clock: the tab was hidden, the game did not run
  assert.deepEqual(lessons, ['tutor_move'], 'a hidden tab does not use up the lesson');
  assert.equal(save.flags.tutorial, false);

  game.time += 13;                                  // twelve seconds of play without the key: the first wait is over, the second starts
  await env.clock.advance(500);
  game.time += 11;
  await env.clock.advance(500);
  assert.deepEqual(lessons, ['tutor_move', 'tutor_jump'], 'game time moves the lesson on');
  playFlow.token++;                                 // end the run
  await env.clock.advance(300);
  assert.equal(game.kbd.teach, null, 'a stale run puts the key hints away');
  void running;
}

/* The same four scenes, but with the real 60-story / 70-ui cards instead of stand-ins: the keyboard half of PLAN-2 A2. */
export async function theRealLearningCardsIgnoreSpaceTenTimesOver({ assert }) {
  let stops = 0;
  const voice = { busy: false, stop: () => { stops++; }, line: () => new Promise(() => {}), word: () => Promise.resolve(true), wordInfo: () => null };
  const files = ['00-core', '10-stage', '20-sisters', '30-fx', '60-story', '70-ui', '80-input', '90-main'];
  for (const scene of ['chapter', 'recall', 'clear', 'quiz']) {
    const env = viewEnv.load(files, { exports: ['LEVELS', 'showChapter', 'showRecall', 'showClear', 'get story() { return story; }'], globals: { voice } });
    const { LEVELS, showChapter, showRecall, showClear } = env.exports;
    let done = 0;
    const finished = () => { done++; };
    if (scene === 'chapter') showChapter(LEVELS[0], finished);
    else if (scene === 'recall') showRecall(LEVELS[0], finished);
    else showClear(LEVELS[0], finished);
    await env.clock.advance(200);
    if (scene === 'quiz') {                                  // drive the clear page on to its quiz with Enter, the one key that is allowed
      await env.clock.advance(1200);
      env.keydown('Enter'); await env.clock.advance(3000);   // stars -> word cards
      env.keydown('Enter'); await env.clock.advance(500);    // word cards -> quiz
      assert.equal(env.exports.story.phase, 3, 'the quiz is open');
    }
    const open = env.exports.story;
    assert.ok(open, `${scene}: the scene is open`);
    const phase = open.phase, stopsBefore = stops;
    for (let i = 0; i < 10; i++) { env.keydown('Space'); env.keyup('Space'); }          // straight away: inside the first second
    await env.clock.advance(1500);
    for (let i = 0; i < 10; i++) { env.keydown('Space'); env.keyup('Space'); }          // and later
    assert.equal(done, 0, `${scene}: Space did not finish the scene`);
    assert.equal(env.exports.story, open, `${scene}: it is still the same open scene`);
    assert.equal(env.exports.story.phase, phase, `${scene}: it did not move on to another step`);
    assert.equal(stops, stopsBefore, `${scene}: the voice task was not ended`);
  }
}
