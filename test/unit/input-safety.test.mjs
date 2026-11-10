/* Input safety (PLAN-2 A1, A2 touch half, A8, A9): a 6 year old mashing keys must not change the save, wipe a room or skip a
   lesson, and the touch buttons must steer the sister the child picked.

   The view files are plain scripts that share one scope, so these tests do what art/build_page.py does: run the logic, then the
   real src/lib files and the src/view files inside one function scope, against a small fake DOM. `viewEnv` is exported as an object (not a function)
   so test/run.mjs does not mistake it for a test; guide-timer.test.mjs reuses it. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { libNames } from '../harness.mjs';

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

/** matchMedia stand-in: the page asks (pointer: coarse) and (orientation: portrait); the test flips them with media.set(name, bool). */
function makeMedia({ coarse = false, portrait = false } = {}) {
  const state = { coarse, portrait };
  const watchers = [];
  const nameOf = q => (/pointer:\s*coarse/.test(q) ? 'coarse' : /orientation:\s*portrait/.test(q) ? 'portrait' : null);
  return {
    state,
    matchMedia: q => {
      const name = nameOf(q), listeners = [];
      watchers.push({ name, listeners });
      return { media: q, get matches() { return name ? state[name] : false; }, addEventListener: (t, f) => { if (t === 'change') listeners.push(f); }, removeEventListener() {} };
    },
    set(name, value) { state[name] = value; for (const w of watchers) if (w.name === name) for (const f of w.listeners) f({ matches: value }); },
  };
}

/**
 * Load the real logic and the named src/view files (without .js) into one fake page.
 *   opts.touch       the main pointer is a finger ((pointer: coarse) matches); opts.maxTouchPoints / opts.ontouchstart only decorate the device
 *   opts.portrait    the screen starts in portrait
 *   opts.globals     extra globals (stand-ins for the view files that are not loaded)
 *   opts.localStorage  the storage object the page sees (default: a plain Map-backed one, readable as `env.store`)
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
  const media = makeMedia({ coarse: !!opts.touch, portrait: !!opts.portrait });
  const sizes = JSON.parse(fs.readFileSync(path.join(ROOT, 'art', 'sizes.json'), 'utf8'));
  const lines = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'content', 'lines.json'), 'utf8'));
  const words = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'content', 'words.json'), 'utf8'));

  const ctx = {
    document, console, Math, JSON, Promise, Object, Array, Set, Map, Number, String, Boolean, Date, Infinity, NaN, Error,
    location: { search: '' },
    navigator: { maxTouchPoints: opts.maxTouchPoints !== undefined ? opts.maxTouchPoints : opts.touch ? 5 : 0, getGamepads: () => pads.list },
    matchMedia: media.matchMedia,
    getComputedStyle: () => ({}),
    requestAnimationFrame: () => 0,
    MouseEvent: class { constructor(type, init) { this.type = type; Object.assign(this, init); } },
    Event: class { constructor(type) { this.type = type; } },
    dispatchEvent: () => true,
    DOMPoint: class { constructor(x, y) { this.x = x; this.y = y; } matrixTransform() { return new ctx.DOMPoint(this.x, this.y); } },
    Image: FakeImage,
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, setInterval: clock.setInterval, clearInterval: clock.clearInterval,
    performance: { now: () => clock.now },
    addEventListener: (type, fn, capture) => windowListeners.push({ type, fn, capture: !!capture }),
    removeEventListener: (type, fn) => { const i = windowListeners.findIndex(l => l.type === type && l.fn === fn); if (i >= 0) windowListeners.splice(i, 1); },
    // stand-ins for view files that are not loaded here
    uxState: { modal: null },
    ...(opts.globals || {}),
  };
  ctx.window = ctx;
  ctx.localStorage = opts.localStorage || { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: k => { store.delete(k); } };
  if (opts.touch || opts.ontouchstart) ctx.ontouchstart = null;
  vm.createContext(ctx);

  const logicDir = path.join(ROOT, 'src');
  const logic = fs.readdirSync(logicDir).filter(f => f.endsWith('.js')).sort().map(f => fs.readFileSync(path.join(logicDir, f), 'utf8')).join('');
  vm.runInContext(logic, ctx, { filename: 'logic' });

  const viewDir = path.join(ROOT, 'src', 'view');
  const libDir = path.join(ROOT, 'src', 'lib');
  // in front of the view files, like the build; a test that passes its own `voice` stand-in leaves the real queue out (a `const voice` here would shadow it)
  const lib = libNames().filter(n => !(n === 'voice' && opts.globals && opts.globals.voice)).map(n => fs.readFileSync(path.join(libDir, n + '.js'), 'utf8')).join('');
  let view = lib + files.map(f => fs.readFileSync(path.join(viewDir, f + '.js'), 'utf8')).join('');
  view = view.replace("/*ASSET_VERSION*/'dev'", "'dev'").replace('/*SIZES*/{}', JSON.stringify(sizes)).replace('/*LINES*/{}', JSON.stringify(lines)).replace('/*WORDS*/[]', JSON.stringify(words));
  const names = ['game', ...(opts.exports || [])];
  const code = `(() => {\n${view}\nreturn { ${names.join(', ')} };\n})()`;
  const exportsObj = vm.runInContext(code, ctx, { filename: 'view' });

  const env = {
    ctx, clock, pads, windowListeners, requested, store, getEl, media, exports: exportsObj,
    /** dispatch a keydown to every window listener (capture ones first), like the browser would; returns whether anyone prevented it */
    keydown(code, extra = {}) {
      const ev = { type: 'keydown', code, repeat: false, metaKey: false, ctrlKey: false, altKey: false, target: body, prevented: false, stopped: false,
        preventDefault() { this.prevented = true; }, stopPropagation() {}, stopImmediatePropagation() { this.stopped = true; }, ...extra };
      const hear = windowListeners.filter(l => l.type === 'keydown');
      for (const l of [...hear.filter(l => l.capture), ...hear.filter(l => !l.capture)]) { if (ev.stopped) break; l.fn(ev); }
      return ev;
    },
    keyup(code) { for (const l of windowListeners.filter(l => l.type === 'keyup')) l.fn({ type: 'keyup', code }); },
    /** a window event (pointermove, pointerdown, blur ...) to every listener of that type; returns whether anyone prevented it */
    fire(type, init = {}) {
      const ev = { type, prevented: false, preventDefault() { this.prevented = true; }, stopPropagation() {}, ...init };
      for (const l of [...windowListeners.filter(l => l.type === type)]) l.fn(ev);
      return ev;
    },
    /** an event on the element with this id (pointerdown, pointerup, contextmenu ...); returns it, so `.prevented` can be read */
    on(id, type, init = {}) {
      const ev = { type, prevented: false, preventDefault() { this.prevented = true; }, stopPropagation() {}, ...init };
      for (const fn of getEl(id).listeners[type] || []) fn(ev);
      return ev;
    },
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

/* ---- PLAN-2 D1: touch mode, the touch keys, the sticker drag ---- */
const isTouchMode = env => env.ctx.document.body.classList.contains('touch');

export function touchModeComesFromThePointerTypeOrAFirstFingerNotFromMaxTouchPoints({ assert }) {
  /* a laptop with a touch screen: it reports touch points and has ontouchstart, but its main pointer is the mouse */
  const laptop = playPage('solo', { maxTouchPoints: 10, ontouchstart: true });
  assert.equal(isTouchMode(laptop), false, 'touch points alone do not make a touch device');
  laptop.fire('pointerdown', { pointerType: 'mouse' });
  assert.equal(isTouchMode(laptop), false);
  laptop.fire('pointerdown', { pointerType: 'touch' });
  assert.equal(isTouchMode(laptop), true, 'the first real finger does');
  laptop.fire('pointerdown', { pointerType: 'mouse' });
  assert.equal(isTouchMode(laptop), false, 'a mouse click on a machine whose main pointer is the mouse ends it again');

  /* a tablet: (pointer: coarse) from the start */
  const tablet = playPage('solo', { touch: true });
  assert.equal(isTouchMode(tablet), true);
  tablet.fire('pointerdown', { pointerType: 'mouse' });
  assert.equal(isTouchMode(tablet), true, 'a coarse main pointer stays in touch mode');
  tablet.media.set('coarse', false);
  assert.equal(isTouchMode(tablet), false, 'and follows the media query when it changes (a keyboard and mouse dock)');
  tablet.media.set('coarse', true);
  assert.equal(isTouchMode(tablet), true);
}

export function theDuoMarkFollowsTheDecidedTouchModeLiveNotAValueFixedAtLoad({ assert }) {
  const env = playPage('duo', { maxTouchPoints: 5 });
  const { view, drawDuoTouchMark } = env.exports;
  view.frost.mark.setAttribute('visibility', 'hidden');
  drawDuoTouchMark(1);
  assert.equal(view.frost.mark.getAttribute('visibility'), 'hidden', 'no touch mode, no marker');
  env.fire('pointerdown', { pointerType: 'touch' });
  drawDuoTouchMark(1);
  assert.equal(view.frost.mark.getAttribute('visibility'), 'visible', 'after the first finger the marker shows');
}

export function aTouchKeyBelongsToTheFingerThatPressedItAndNeverStaysStuck({ assert }) {
  const env = playPage('solo', { touch: true });
  const { game, syncInput } = env.exports;
  const key = env.getEl('tLeft'), captured = [], released = [];
  key.setPointerCapture = id => captured.push(id);
  key.releasePointerCapture = id => released.push(id);
  const held = () => { syncInput(); return game.input.frost.l; };

  const down = env.on('tLeft', 'pointerdown', { pointerId: 1, pointerType: 'touch' });
  assert.equal(down.prevented, true, 'the press is not also a click, a scroll or a text selection');
  assert.deepEqual(captured, [1], 'the key captures that finger, so its lift and its cancel always arrive here');
  assert.equal(held(), 1);
  assert.ok(key.classList.contains('on'));

  env.on('tLeft', 'pointerup', { pointerId: 2 });
  assert.equal(held(), 1, 'another finger lifting does not let go');

  env.on('tLeft', 'pointercancel', { pointerId: 1 });
  assert.equal(held(), 0, 'a cancel (the system took the touch) lets go');
  assert.equal(key.classList.contains('on'), false);

  env.on('tLeft', 'pointerdown', { pointerId: 3 });
  const menu = env.on('tLeft', 'contextmenu');
  assert.equal(menu.prevented, true, 'a long press opens no system menu');
  assert.equal(held(), 0, 'and cannot leave the key down');

  env.on('tLeft', 'pointerdown', { pointerId: 4 });
  env.on('tLeft', 'lostpointercapture', { pointerId: 4 });
  assert.equal(held(), 0, 'losing the capture lets go');

  env.on('tLeft', 'pointerdown', { pointerId: 5 });
  env.on('tLeft', 'pointerdown', { pointerId: 6 });
  env.on('tLeft', 'pointerup', { pointerId: 5 });
  assert.equal(held(), 1, 'a second finger takes the key over; the first one lifting does not release it');
  env.on('tLeft', 'pointerup', { pointerId: 6 });
  assert.equal(held(), 0);

  env.on('tLeft', 'pointerdown', { pointerId: 7 });
  env.on('tLeft', 'pointerleave', { pointerId: 7 });
  assert.equal(held(), 1, 'a captured finger that slides off still holds the key (the lift will arrive)');
  env.fire('blur');
  assert.equal(held(), 0, 'the window losing focus lets go');
  env.on('tLeft', 'pointerdown', { pointerId: 8 });
  assert.equal(held(), 1, 'and the key works again at once: no owner is left behind');
  env.on('tLeft', 'pointerup', { pointerId: 8 });
  assert.equal(held(), 0);

  /* a browser without pointer capture: leaving the key is the only way to learn the finger moved away */
  const bare = playPage('solo', { touch: true });
  const g2 = bare.exports.game;
  bare.on('tRight', 'pointerdown', { pointerId: 1 });
  bare.exports.syncInput();
  assert.equal(g2.input.frost.r, 1);
  bare.on('tRight', 'pointerleave', { pointerId: 1 });
  bare.exports.syncInput();
  assert.equal(g2.input.frost.r, 0, 'without capture a finger that slides off lets go');
}

export function noTouchControlOpensTheSystemMenuOnALongPress({ assert }) {
  const env = playPage('duo', { touch: true });
  for (const id of ['tLeft', 'tRight', 'tJump', 'tAct', 'tSwitch', 'touch', 'stage']) {
    assert.equal(env.on(id, 'contextmenu').prevented, true, `${id}: contextmenu is stopped`);
  }
}

/* A stand-in sticker that records the listeners the book puts on it, in a book that opens with one sticker in its tray. */
function stickerBook() {
  const voice = { busy: false, stop() {}, line: () => Promise.resolve(true), word: () => Promise.resolve(true), wordInfo: () => null, ui() {}, preload: () => Promise.resolve() };
  const env = load(['00-core', '10-stage', '15-toys', '20-sisters', '30-fx', '60-story', '70-ui', '75-rewards', '80-input', '90-main'],
    { exports: ['save', 'showStickers'], globals: { voice, advanceStory() {} } });
  const { save } = env.exports;
  save.stickers = ['hall'];
  save.board = [];
  const listeners = {}, captured = [], released = [];
  const item = {
    dataset: { id: 'hall', from: 'tray' },
    parentNode: { setAttribute() {} },
    addEventListener: (type, fn) => { (listeners[type] || (listeners[type] = [])).push(fn); },
    setPointerCapture: id => captured.push(id),
    releasePointerCapture: id => released.push(id),
  };
  const overlay = env.getEl('overlay');
  overlay.querySelectorAll = sel => (sel === '.rw-item' ? [item] : []);
  overlay.getScreenCTM = () => ({ inverse: () => ({}) });
  return { env, save, item, listeners, captured, released, start: () => env.exports.showStickers(0) };
}
const pointerEvent = (pointerId, x, y, extra = {}) => ({ button: 0, pointerId, clientX: x, clientY: y, preventDefault() {}, stopPropagation() {}, ...extra });
const lastOf = (list, type) => list[type][list[type].length - 1];

export function aStickerDragFollowsOnePointerAndCapturesIt({ assert }) {
  const b = stickerBook();
  b.start();
  assert.ok(b.listeners.pointerdown && b.listeners.pointerdown.length >= 1, 'the sticker listens for a press');
  lastOf(b.listeners, 'pointerdown')(pointerEvent(7, 100, 100));
  assert.deepEqual(b.captured, [7], 'the sticker captures the pointer that picked it up');
  const proxy = b.env.getEl('rwDrag').children[0];
  assert.match(proxy.attrs.transform, /^translate\(100 100\)/);

  const movesBefore = b.env.windowListeners.filter(l => l.type === 'pointermove').length;
  lastOf(b.listeners, 'pointerdown')(pointerEvent(8, 400, 300));   // a second finger on the same sticker
  assert.equal(b.env.windowListeners.filter(l => l.type === 'pointermove').length, movesBefore, 'a second finger does not start another drag');
  assert.deepEqual(b.captured, [7]);

  b.env.fire('pointermove', pointerEvent(9, 600, 400));
  assert.match(proxy.attrs.transform, /^translate\(100 100\)/, 'a move of another pointer does not drag it');
  b.env.fire('pointerup', pointerEvent(9, 600, 400));
  assert.equal(b.save.board.length, 0, 'nor does another pointer lifting drop it');
  assert.equal(b.env.windowListeners.some(l => l.type === 'pointerup'), true, 'the drag is still open');

  b.env.fire('pointermove', pointerEvent(7, 300, 200));
  assert.match(proxy.attrs.transform, /^translate\(300\.0 200\.0\)/, 'its own pointer moves it');
  b.env.fire('pointerup', pointerEvent(7, 300, 200));
  assert.equal(b.save.board.length, 1, 'its own lift drops it on the board');
  assert.equal(b.save.board[0].id, 'hall');
  assert.deepEqual(b.released, [7], 'the capture is let go');
  assert.equal(b.env.windowListeners.some(l => ['pointermove', 'pointerup', 'pointercancel'].includes(l.type)), false, 'and the window listeners are removed');
}

export function aCancelledStickerDragPutsTheStickerBackAndFreesTheNextDrag({ assert }) {
  const b = stickerBook();
  b.start();
  lastOf(b.listeners, 'pointerdown')(pointerEvent(3, 100, 100));
  b.env.fire('pointermove', pointerEvent(3, 300, 200));
  b.env.fire('pointercancel', pointerEvent(4, 300, 200));
  assert.equal(b.env.windowListeners.some(l => l.type === 'pointercancel'), true, 'a cancel of another pointer is ignored');
  b.env.fire('pointercancel', pointerEvent(3, 300, 200));
  assert.equal(b.save.board.length, 0, 'a cancelled drag places nothing');
  assert.deepEqual(b.released, [3]);
  lastOf(b.listeners, 'pointerdown')(pointerEvent(5, 100, 100));
  assert.deepEqual(b.captured, [3, 5], 'the next finger can pick a sticker up');
  b.env.fire('pointermove', pointerEvent(5, 300, 200));
  b.env.on('x', 'noop');
  lastOf(b.listeners, 'lostpointercapture')(pointerEvent(5, 300, 200));
  assert.equal(b.save.board.length, 0, 'a capture lost without a lift also drops it back');
  b.env.fire('pointerup', pointerEvent(5, 300, 200));
  assert.equal(b.save.board.length, 0, 'and a late lift does nothing');
}

/* ---- PLAN-2 D7: the gamepad moves a focus ring over the buttons of every screen that is not a live room ---- */
const PAD = { A: 0, B: 1, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
function menuPage() {
  const lines = [];
  const voice = { busy: false, stop() {}, line: (key, opts) => { lines.push({ key, opts }); return Promise.resolve(true); }, word: () => Promise.resolve(true), wordInfo: () => null, ui() {}, preload: () => Promise.resolve() };
  const env = load(['00-core', '10-stage', '20-sisters', '30-fx', '60-story', '70-ui', '80-input', '90-main'],
    { exports: ['playFlow', 'pollGamepad', 'padState', 'save', 'uxState', 'get story() { return story; }', 'set story(v) { story = v; }'], globals: { voice } });
  const state = { targets: [] };
  /** a stand-in role="button" element: where it is on the screen, which class it has, and the clicks it received */
  const button = (act, rect, { ui = '', classes = [] } = {}) => ({
    act, dataset: { act, ui }, clicks: [], classList: { contains: c => classes.includes(c) }, closest: () => null,
    getBoundingClientRect: () => ({ left: rect[0], top: rect[1], width: rect[2], height: rect[3], right: rect[0] + rect[2], bottom: rect[1] + rect[3] }),
    dispatchEvent(ev) { this.clicks.push(ev.type); return true; },
  });
  env.getEl('overlay').querySelectorAll = sel => (sel === '[role="button"]' ? state.targets : []);
  env.getEl('stage').getScreenCTM = () => ({ inverse: () => ({}) });
  const ringRect = env.getEl('padRect');
  env.getEl('padFocus').firstElementChild = ringRect;
  const pad = down => ({ connected: true, axes: [0, 0], buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: down.includes(i) })) });
  const tap = (...buttons) => { env.pads.list = [pad(buttons)]; env.exports.pollGamepad(); env.pads.list = [pad([])]; env.exports.pollGamepad(); };
  const ring = () => env.getEl('padFocus').getAttribute('visibility') || 'hidden';
  return { env, lines, state, button, tap, ring, ringRect, voice, names: () => lines.map(l => l.key) };
}
/** the title: play (pulsing) in the middle, three below it, the small meet button in the left corner */
function titleButtons(m) {
  return {
    play: m.button('play', [400, 200, 160, 160], { ui: 'start', classes: ['ux-pulse'] }),
    rooms: m.button('rooms', [300, 380, 80, 80], { ui: 'rooms' }),
    words: m.button('words', [440, 380, 80, 80], { ui: 'words' }),
    stickers: m.button('stickers', [580, 380, 80, 80], { ui: 'stickers' }),
    meet: m.button('meet', [20, 440, 50, 50], { ui: 'meet' }),
  };
}

export function theDPadMovesTheRingBetweenTitleButtonsAndAPressesTheFocusedOne({ assert }) {
  const m = menuPage();
  const t = titleButtons(m);
  m.state.targets = Object.values(t);
  assert.equal(m.ring(), 'hidden', 'no ring before the pad is used');

  m.tap(PAD.A);
  assert.equal(m.ring(), 'visible', 'the first press shows the ring');
  assert.equal(t.play.clicks.length, 0, 'and presses nothing');
  assert.deepEqual(m.names(), ['ui_start'], 'it lands on the button the screen waits for and says its name');
  assert.equal(m.lines[0].opts.priority, 0, 'quietly: the name never cuts a lesson');
  assert.equal(m.lines[0].opts.tag, 'ui');

  m.tap(PAD.DOWN);
  assert.equal(m.names().at(-1), 'ui_words', 'down from play: the button right below');
  m.tap(PAD.RIGHT);
  assert.equal(m.names().at(-1), 'ui_stickers');
  m.tap(PAD.LEFT); m.tap(PAD.LEFT);
  assert.equal(m.names().at(-1), 'ui_rooms');
  m.tap(PAD.LEFT);
  assert.equal(m.names().at(-1), 'ui_meet', 'the small corner button is reachable too');
  m.tap(PAD.LEFT);
  assert.equal(m.names().at(-1), 'ui_meet', 'at the edge the ring stays');

  m.tap(PAD.A);
  assert.equal(t.meet.clicks.length, 1, 'A presses the focused button with a click');
  assert.deepEqual(Object.values(t).map(b => b.clicks.length), [0, 0, 0, 0, 1]);
  assert.deepEqual(JSON.parse(JSON.stringify(m.env.exports.padState.nav)), { l: 0, r: 0, u: 0, d: 0 });

  const x = m.ringRect.attrs;
  assert.ok(Number(x.width) > 50 && Number(x.height) > 50, 'the ring is drawn round the button');
  m.tap(PAD.UP);
  assert.equal(m.names().at(-1), 'ui_meet', 'nothing above the corner: stays');
  m.tap(PAD.RIGHT);
  assert.equal(m.names().at(-1), 'ui_rooms');
}

export function holdingADirectionMovesTheRingOnlyOnce({ assert }) {
  const m = menuPage();
  const t = titleButtons(m);
  m.state.targets = [t.rooms, t.words, t.stickers];
  m.tap(PAD.A);
  const held = { connected: true, axes: [0, 0], buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: i === PAD.RIGHT })) };
  m.env.pads.list = [held];
  for (let i = 0; i < 20; i++) m.env.exports.pollGamepad();
  assert.deepEqual(m.names(), ['ui_rooms', 'ui_words'], 'one step for one press, however long it is held');
}

export function aGamepadStickMovesTheRingToo({ assert }) {
  const m = menuPage();
  const t = titleButtons(m);
  m.state.targets = [t.rooms, t.words, t.stickers];
  m.tap(PAD.A);
  m.env.pads.list = [{ connected: true, axes: [0.9, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false })) }];
  m.env.exports.pollGamepad();
  assert.equal(m.names().at(-1), 'ui_words');
}

export function aMashedAKeyNeverSkipsALessonButAPressedFocusedButtonDoes({ assert }) {
  const m = menuPage();
  const { exports: x } = m.env;
  const go = m.button('go', [800, 400, 100, 100], { ui: 'next', classes: ['ux-pulse'] });
  const cards = [0, 1, 2].map(k => m.button('word', [100 + k * 230, 200, 200, 200]));
  m.state.targets = [...cards, go];
  x.story = { name: 'chapter', strict: true, openedAt: m.env.clock.now, onKey() { m.advanced = (m.advanced || 0) + 1; } };
  x.playFlow.phase = 'intro';

  for (let i = 0; i < 6; i++) m.tap(PAD.A, PAD.B);
  assert.equal(m.ring(), 'hidden', 'inside the quiet first second the pad does nothing at all');
  assert.equal([...cards, go].reduce((n, b) => n + b.clicks.length, 0), 0);

  return m.env.clock.advance(1100).then(() => {
    for (let i = 0; i < 12; i++) m.tap(PAD.A);
    assert.equal(m.ring(), 'visible', 'then the first A shows the ring (on the pulsing next button)');
    assert.equal([...cards, go].reduce((n, b) => n + b.clicks.length, 0), 0, 'but a lesson is never left by mashing A: a ring that A put there is not pressable');
    m.tap(PAD.RIGHT);                                   // nothing lies to the right of the next button: the ring stays, but a d-pad press has now armed it
    assert.equal(m.names().at(-1), 'ui_next');
    m.tap(PAD.A);
    assert.equal(go.clicks.length, 1, 'a d-pad press arms the ring: now A is a deliberate press of the button it shows');
    assert.equal([...cards, go].reduce((n, b) => n + b.clicks.length, 0), 1);
    m.state.targets = [m.button('go', [800, 400, 100, 100], { classes: ['ux-pulse'] })];   // the page is painted again
    m.tap(PAD.A);
    assert.equal(m.state.targets[0].clicks.length, 0, 'on a new page the old focus is gone, so A only shows the ring again');
    assert.equal(m.ring(), 'visible');
    for (let i = 0; i < 3; i++) m.tap(PAD.B);
    assert.equal(m.state.targets[0].clicks.length, 0, 'B (the magic button) does not leave a lesson');
    m.tap(PAD.START);
    assert.equal(m.advanced, 1, 'Start still leaves a scene like Enter does');
  });
}

export function bGoesBackOnMenuScreensOnly({ assert }) {
  const m = menuPage();
  const back = m.button('back', [20, 20, 70, 70], { ui: 'back' });
  const rooms = m.button('room', [300, 200, 150, 90]);
  m.state.targets = [back, rooms];
  m.tap(PAD.B);
  assert.equal(back.clicks.length, 1, 'B presses the back button of a menu screen');
  m.env.exports.story = { name: 'review', strict: true, openedAt: -5000 };
  m.tap(PAD.B);
  assert.equal(back.clicks.length, 1, 'but not inside a lesson or the review game');
}

export function theRingStaysOutOfTheRoomTheParentSettingsAndMouseUse({ assert }) {
  const m = menuPage();
  const t = titleButtons(m);
  m.state.targets = Object.values(t);
  m.tap(PAD.A);
  assert.equal(m.ring(), 'visible');
  m.env.fire('pointerdown', { pointerType: 'mouse' });
  assert.equal(m.ring(), 'hidden', 'a mouse press puts the ring away');

  m.tap(PAD.A);
  assert.equal(m.ring(), 'visible');
  m.env.exports.uxState.modal = { name: 'settings' };
  m.tap(PAD.DOWN); m.tap(PAD.A);
  assert.equal(m.ring(), 'hidden', 'the parent settings are not driven by the pad');
  assert.equal(Object.values(t).reduce((n, b) => n + b.clicks.length, 0), 0);
  m.env.exports.uxState.modal = null;

  /* in a live room the pad plays: no ring, no clicks */
  const { game, playFlow } = m.env.exports;
  game.mode = 'solo'; game.load(0); game.state = 'play'; playFlow.phase = 'play';
  m.tap(PAD.A); m.tap(PAD.DOWN);
  assert.equal(m.ring(), 'hidden');
  assert.equal(Object.values(t).reduce((n, b) => n + b.clicks.length, 0), 0, 'A in a room is a jump, not a click');
  assert.ok(game.sisters.frost.jumpBuf > 0, 'it jumped');
}

export function aButtonThatIsNotOnScreenYetCannotTakeTheRing({ assert }) {
  const m = menuPage();
  const hidden = m.button('word', [100, 200, 200, 200]);
  hidden.closest = () => ({ classList: { contains: c => c === 'show' ? false : false } });
  const shown = m.button('word', [400, 200, 200, 200]);
  shown.closest = () => ({ classList: { contains: c => c === 'show' } });
  const flat = m.button('word', [700, 200, 0, 0]);
  m.state.targets = [hidden, shown, flat];
  m.tap(PAD.A);
  m.tap(PAD.A);
  assert.deepEqual([hidden.clicks.length, shown.clicks.length, flat.clicks.length], [0, 1, 0], 'a card that has not popped up and a zero-size shape are skipped');
}
