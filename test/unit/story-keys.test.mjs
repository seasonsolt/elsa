/* PLAN-2 A2 / A5 / C1: the learning scenes (chapter card, recall, clear page, quiz) only answer to on-screen buttons and Enter,
   and the clear page offers "next" as soon as the three cards were said once: nothing is repeated to pad a count.
   src/view/60-story.js is run for real inside a vm together with src/lib/review.js; the helpers it takes from 70-ui.js / 90-main.js
   are stubs below, and the stubs record what the scenes do (bound button handlers, voice calls, the scene token). The real 70-ui
   helpers and the quiz / review game are covered in learning-ui.test.mjs. */
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../src/lib/review.js', import.meta.url), 'utf8') + fs.readFileSync(new URL('../../src/view/60-story.js', import.meta.url), 'utf8');
const flush = () => new Promise(r => setImmediate(r));
const settle = async (n = 6) => { for (let i = 0; i < n; i++) await flush(); };

function fakeNode() {
  const kids = {};
  const n = {
    innerHTML: '', textContent: '', style: {}, dataset: {},
    classList: { add() {}, remove() {}, contains: () => false },
    setAttribute() {}, getBoundingClientRect: () => ({}),
    querySelector: sel => (kids[sel] = kids[sel] || fakeNode()),
    querySelectorAll: () => [],
  };
  return n;
}

/* wordMode: 'auto' resolves every word call with `autoResult` at once; 'manual' queues them in env.pending for the test. */
function setupWithStory(opts = {}) {
  const { wordMode = 'auto', autoResult = true } = opts;
  const env = {
    now: 0, handlers: [], stopVoice: 0, lines: [], wordCalls: [], pending: [], preloads: [], waits: [], manualWaits: false,
    saves: 0, reviewed: [], quiz: [],
  };
  const overlay = fakeNode();
  const LEVELS = [
    { id: 'hall', words: ['heart', 'star', 'door'], bg: 'bg0' },
    { id: 'lake', words: ['ice', 'fish', 'water'], bg: 'bg1' },
  ];
  const recs = new Map();
  let setStory = null;
  const context = {
    console, setTimeout, clearTimeout, Math, Promise,
    performance: { now: () => env.now },
    addEventListener: (type, fn) => { if (type === 'keydown') env.handlers.push(fn); },
    $: id => (id === 'overlay' ? overlay : fakeNode()),
    LEVELS, game: { stars: { total: 0, got: 0 }, memoryFound: false }, save: { words: {}, roomClock: 3 },
    SRC: n => n,
    uxState: { modal: null, tok: null },
    uxWake() {}, uxInputReset() {}, uxSfx() {}, uxConfetti() {}, uxNudge() {}, uxSaveNow() { env.saves++; },
    uxPaint: html => { env.painted = html; return overlay; },
    uxButton: o => `[btn:${o.act}]`, uxIcon: () => '', uxPic: () => '', uxWordCard: wd => `[card:${wd.id}]`,
    uxBind: (root, acts) => { root.__acts = acts; },
    uxAlive: tok => context.uxState.tok === tok,
    uxLevel: x => (x && typeof x === 'object' ? x : LEVELS.find(l => l.id === x) || LEVELS[0]),
    uxLevelIndex: lv => Math.max(0, LEVELS.indexOf(lv)),
    uxWordList: ids => ids.map(id => ({ id, en: id, icon: 'word_' + id })),
    uxRoomWords: lv => context.uxWordList(lv.words),
    uxQuizPool: () => [],
    uxNoteQuiz: (id, firstTry) => env.quiz.push([id, firstTry]),
    uxNoteReviewed: id => env.reviewed.push(id),
    uxLineArt: (k, fallback) => fallback || null,
    uxWordRec: id => recs.get(id) || (recs.set(id, { heard: 0, quiz: 0 }), recs.get(id)),
    uxKey: (stem, id) => stem + '_' + id,
    uxPreload: keys => env.preloads.push(keys),
    uxStopVoice() { env.stopVoice++; },
    uxHooks: { replay() {} },
    uxLine(key) { env.lines.push(key); return Promise.resolve(); },
    uxWordVoice(id) {
      env.wordCalls.push(id);
      if (wordMode === 'auto') return Promise.resolve(autoResult);
      return new Promise(resolve => env.pending.push({ id, resolve }));
    },
    uxWait() { return env.manualWaits ? new Promise(resolve => env.waits.push(resolve)) : Promise.resolve(); },
    uxScreen(name, isStory) {
      const tok = { name, onKey: null };
      context.uxState.tok = tok;
      setStory(isStory ? tok : null);
      return tok;
    },
  };
  const api = vm.runInNewContext(`
    ${source}
    ({ showChapter, showRecall, showClear, openStory, advanceStory, storyKeyAction,
       current: () => story, setStory: v => { story = v; } });
  `, context);
  setStory = api.setStory;
  return { env, api, overlay, context, LEVELS };
}

const key = (env, code, extra = {}) => {
  const e = Object.assign({ code, repeat: false, target: null, metaKey: false, ctrlKey: false, prevented: 0, stopped: 0 }, extra);
  e.preventDefault = () => { e.prevented++; };
  e.stopImmediatePropagation = () => { e.stopped++; };
  for (const h of env.handlers) h(e);
  return e;
};
const mash = (env, code, n) => { for (let i = 0; i < n; i++) key(env, code); };

/* ---------- A2: keyboard ---------- */

export async function chapterCardIgnoresSpaceAndWaitsAQuietSecondForEnter({ assert }) {
  const { env, api } = setupWithStory({ wordMode: 'manual' });
  env.manualWaits = true;                      // the card's timers never fire: the scene stays open
  let done = 0;
  api.showChapter('hall', () => done++);
  const scene = api.current();
  env.now = 400;
  mash(env, 'Enter', 5);                       // inside the first second even Enter is ignored
  assert.equal(done, 0);
  env.now = 1500;
  mash(env, 'Space', 10);
  assert.equal(done, 0, 'Space must not skip the chapter card');
  assert.equal(api.current(), scene);
  assert.equal(env.stopVoice, 0, 'Space must not end the voice task either');
  const space = key(env, 'Space');
  assert.equal(space.stopped, 1, 'the key must not leak to the game either');
  api.advanceStory();                          // touch jump / magic and gamepad presses arrive here
  assert.equal(done, 0, 'touch and gamepad presses cannot skip a learning scene');
  key(env, 'Enter');
  assert.equal(done, 1, 'Enter still leaves the card');
}

export async function gamepadStartIsEnterLikeButOnlyAfterTheQuietSecond({ assert }) {
  const { env, api } = setupWithStory({ wordMode: 'manual' });
  env.manualWaits = true;
  let done = 0;
  api.showChapter('hall', () => done++);
  env.now = 400;
  api.advanceStory(true);
  assert.equal(done, 0, 'Start inside the first second does nothing, like Enter');
  env.now = 1500;
  api.advanceStory();
  api.advanceStory(false);
  assert.equal(done, 0, 'a plain touch / pad press still cannot skip');
  api.advanceStory(true);
  assert.equal(done, 1, 'Start leaves the card after the quiet second, so a gamepad-only child is never stranded');
}

export async function recallIgnoresSpaceButSkipButtonAndEnterWork({ assert }) {
  const { env, api } = setupWithStory({ wordMode: 'manual' });
  env.manualWaits = true;
  let done = 0;
  api.showRecall('hall', () => done++);
  env.now = 2000;
  mash(env, 'Space', 10);
  assert.equal(done, 0);
  key(env, 'Enter');
  assert.equal(done, 1);
  // and the on-screen button
  const again = setupWithStory({ wordMode: 'manual' });
  again.env.manualWaits = true;
  let done2 = 0;
  again.api.showRecall('hall', () => done2++);
  again.overlay.__acts.skip();
  assert.equal(done2, 1, 'the skip button works at any time');
}

export async function clearPageIgnoresSpaceInEveryPhaseAndQuizSkipIsButtonOnly({ assert }) {
  const { env, api, overlay } = setupWithStory({ wordMode: 'auto' });
  let done = 0;
  api.showClear('hall', () => done++);
  await settle();
  const scene = api.current();
  env.now = 5000;
  assert.equal(scene.phase, 2, 'words phase, next button shown');
  const stops = env.stopVoice;
  mash(env, 'Space', 10);
  assert.equal(scene.phase, 2, 'Space must not move the word cards on');
  assert.equal(env.stopVoice, stops);
  api.advanceStory(); mash(env, 'Space', 3);
  assert.equal(scene.phase, 2);

  key(env, 'Enter');                           // Enter -> quiz
  await settle();
  assert.equal(scene.phase, 3, 'Enter reaches the quiz');
  const stopsInQuiz = env.stopVoice;
  mash(env, 'Space', 10); mash(env, 'Enter', 10); api.advanceStory();
  assert.equal(scene.phase, 3, 'neither Space nor Enter nor a touch tap skips the quiz');
  assert.equal(env.stopVoice, stopsInQuiz);
  assert.equal(done, 0);

  const ctl = overlay.querySelector('#uxCtl');
  assert.ok(ctl.innerHTML.includes('[btn:skip]'), 'the on-screen skip button is there');
  ctl.__acts.skip();                           // the button does skip
  assert.equal(scene.phase, 4);
  mash(env, 'Space', 10);
  assert.equal(done, 0, 'Space does not leave the last page either');
  assert.equal(scene.phase, 4);
  key(env, 'Enter');
  assert.equal(done, 1, 'Enter still leaves the clear page');
}

export async function clearPageStarsPhaseIgnoresSpaceToo({ assert }) {
  const { env, api } = setupWithStory({ wordMode: 'manual' });
  api.showClear('hall', () => {});
  const scene = api.current();
  env.manualWaits = true;
  env.now = 3000;
  assert.equal(scene.phase, 1);
  mash(env, 'Space', 10);
  assert.equal(scene.phase, 1);
  key(env, 'Enter');
  assert.equal(scene.phase, 2, 'Enter on the stars page goes on to the word cards');
}

export async function plainStoryPagesStillAdvanceOnSpace({ assert }) {
  const { env, api } = setupWithStory();
  let done = 0;
  api.openStory([{ vo: 'p1', art: 'a' }, { vo: 'p2', art: 'b' }], () => done++);
  const page = api.current();
  assert.ok(!page.strict);
  key(env, 'Space');
  assert.equal(page.i, 1, 'Space turns a prologue page');
  api.advanceStory();
  assert.equal(done, 1, 'a touch / gamepad press still turns the last page');
}

export function keyPolicyIsPureAndQuietForTheFirstSecond({ assert }) {
  const { api: a } = setupWithStory();
  const scene = { strict: true, openedAt: 100 };
  assert.equal(a.storyKeyAction(scene, 'Enter', false, 1099, false), 'swallow');
  assert.equal(a.storyKeyAction(scene, 'Enter', false, 1100, false), 'advance');
  assert.equal(a.storyKeyAction(scene, 'Enter', true, 1100, false), 'swallow', 'a held Enter does not repeat');
  assert.equal(a.storyKeyAction(scene, 'Enter', false, 1100, true), 'pass', 'a focused button takes Enter');
  for (const code of ['Space', 'Escape', 'ArrowUp', 'KeyW', 'KeyF']) assert.equal(a.storyKeyAction(scene, code, false, 9999, false), 'swallow', code);
  assert.equal(a.storyKeyAction(scene, 'Space', false, 9999, true), 'swallow', 'Space on a focused button is still ignored');
  assert.equal(a.storyKeyAction({}, 'Space', false, 0, false), 'advance');
}

/* ---------- A5 / C1: clear page word cards ---------- */

export async function nextButtonAppearsOnceThreeCardsWereSaidOnce({ assert }) {
  const { env, api, overlay } = setupWithStory({ wordMode: 'manual' });
  api.showClear('hall', () => {});
  await settle();
  const ctl = overlay.querySelector('#uxCtl');
  assert.equal(env.pending.length, 1, 'first card is being said');
  assert.ok(!ctl.innerHTML.includes('[btn:next]'));
  for (let k = 0; k < 3; k++) { env.pending.shift().resolve(true); await settle(); }
  assert.ok(ctl.innerHTML.includes('[btn:next]'), 'next is there right after the third card');
  assert.ok(env.saves >= 1, 'seen is saved as soon as the cards were said');
}

export async function eachWordCardIsSaidOnceAndNothingIsRepeatedToPadTheCount({ assert }) {
  for (const result of [true, false]) {   // heard, or cut off / muted: either way the page does not go round again
    const { env, api } = setupWithStory({ wordMode: 'manual' });
    api.showClear('hall', () => {});
    await settle();
    for (let i = 0; i < 3; i++) { await settle(); assert.ok(env.pending.length, 'clip ' + (i + 1) + ' is queued'); env.pending.shift().resolve(result); }
    await settle(20);
    assert.deepEqual(env.wordCalls, ['heart', 'star', 'door'], 'exactly the three cards, once each, in order');
    assert.equal(env.pending.length, 0, 'no fourth clip is waiting');
    env.now = 5000;
    key(env, 'Enter');
    await settle(20);
    assert.equal(api.current().phase, 3);
    assert.equal(env.wordCalls.length, 3, 'nor does the quiz bring a top-up round back');
  }
}

export function theViewHasNoTopUpLoopLeft({ assert }) {
  for (const f of fs.readdirSync(new URL('../../src/view/', import.meta.url))) {
    const text = fs.readFileSync(new URL('../../src/view/' + f, import.meta.url), 'utf8');
    assert.ok(!text.includes('round < 8'), f + ': no clear-page round loop');
    assert.ok(!text.includes('wordBaseline'), f + ': no per-room hearing baseline');
  }
  assert.ok(!/sort\(\(\) => Math\.random\(\) - \.5\)/.test(source), 'the quiz shuffles with Fisher-Yates, not a biased sort');
}

export async function aWordCardTappedOnTheClearPageSaysItAgainWithoutDisturbingTheScene({ assert }) {
  const { env, api, overlay } = setupWithStory({ wordMode: 'manual' });
  api.showClear('hall', () => {});
  await settle();
  for (let k = 0; k < 3; k++) { env.pending.shift().resolve(true); await settle(); }
  const body = overlay.querySelector('#uxBody');
  body.__acts.word({ dataset: { word: 'star' } });
  assert.equal(env.wordCalls.length, 4, 'the tap is the child\'s own replay');
  assert.equal(api.current().phase, 2, 'and the page stays where it is');
}

/* ---------- preload ---------- */

export async function sceneOpeningsWarmTheLinesThatComeNext({ assert }) {
  const a = setupWithStory({ wordMode: 'manual' });
  a.api.showChapter('hall', () => {});
  const chapter = a.env.preloads[0];
  for (const k of ['clear_hall', 'quiz_heart', 'quiz_star', 'quiz_door', 'word_heart', 'quiz_right_1', 'quiz_wrong_3']) assert.ok(chapter.includes(k), 'chapter card preloads ' + k);

  const b = setupWithStory({ wordMode: 'manual' });
  b.api.showClear('hall', () => {});
  const clear = b.env.preloads[0];
  for (const k of ['recall_heart', 'recall_door', 'ch_lake', 'learn_ice', 'learn_fish', 'learn_water']) assert.ok(clear.includes(k), 'clear page preloads ' + k);

  const last = setupWithStory({ wordMode: 'manual' });
  last.api.showClear('lake', () => {});
  assert.equal(last.env.preloads.length, 0, 'there is no next room after the last one');
}

/* ---------- C2: recall with older words ---------- */

export async function recallShowsThePreviousRoomsWordsThenDueOnesAndMarksOnlyTheOlderOnesReviewed({ assert }) {
  const { env, api } = setupWithStory({ wordMode: 'manual' });
  let done = 0;
  api.showRecall('hall', () => done++, ['heart', 'star', 'door', 'ice', 'fish']);
  await settle();
  const cards = env.painted.match(/\[card:\w+\]/g);
  assert.deepEqual(cards, ['[card:heart]', '[card:star]', '[card:door]', '[card:ice]', '[card:fish]'], 'three of the room and two older ones');
  await settle(20);
  assert.deepEqual(env.lines, ['recall_heart', 'recall_star', 'recall_door', 'recall_ice', 'recall_fish']);
  assert.deepEqual(env.reviewed, ['ice', 'fish'], 'only the older words are marked: the recap of the room just left is not a spaced review');
  assert.ok(env.preloads.some(k => k.includes('recall_ice')), 'the older lines are warmed too');
}

export async function recallWithoutAWordListShowsTheRoomsOwnWordsAndMarksNone({ assert }) {
  const { env, api } = setupWithStory({ wordMode: 'manual' });
  api.showRecall('hall', () => {});
  await settle(20);
  assert.deepEqual(env.lines, ['recall_heart', 'recall_star', 'recall_door']);
  assert.deepEqual(env.reviewed, []);
}

export async function skippingTheRecallEarlyDoesNotMarkWordsThatWereNeverSaid({ assert }) {
  const { env, api, overlay } = setupWithStory({ wordMode: 'manual' });
  env.manualWaits = true;
  let done = 0;
  api.showRecall('hall', () => done++, ['heart', 'star', 'door', 'ice']);
  await settle();
  overlay.__acts.skip();
  env.manualWaits = false;
  for (const w of env.waits.splice(0)) w();
  await settle(20);
  assert.equal(done, 1);
  assert.deepEqual(env.reviewed, [], 'the older word was never reached');
}
