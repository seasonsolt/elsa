/* PLAN-2 2C, view half: the quiz asks from rooms already cleared and stores every answer at once (C3), the recall brings older words
   back and marks them reviewed (C2), the wordbook's review game and its locked silhouettes (C4), the parent progress page (C5), and
   the clock and play time kept by 90-main.

   The scenes are the real src/view/60-story.js and src/view/70-ui.js together with the real src/lib/review.js and save.js, run in one
   vm scope like the build does, against a stand-in page: DOM nodes that keep their innerHTML, a voice that answers at once, timers that
   fire as soon as the event loop is free. Only the button binder and the confetti are replaced (see `page`). The three-rooms-in-a-row
   and play-time checks run the real 90-main in the fake page of input-safety.test.mjs. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { loadLogic } from '../harness.mjs';
import { viewEnv } from './input-safety.test.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const logic = loadLogic();
const LEVELS = logic.levels;
const WORDS = JSON.parse(read('src', 'content', 'words.json'));
const LINES = JSON.parse(read('src', 'content', 'lines.json'));
const wordsOf = id => [...LEVELS.find(lv => lv.id === id).words];
const flush = () => new Promise(r => setImmediate(r));
async function until(cond, what = 'the condition') {
  for (let i = 0; i < 600; i++) { if (cond()) return; await flush(); }
  throw new Error('gave up waiting for ' + what);
}

/* A DOM node that keeps what is written into it. Setting innerHTML / textContent drops the nodes made by querySelector, like replacing the children. */
function fakeNode() {
  const n = {
    kids: {}, _html: '', _text: '', style: {}, dataset: {},
    classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    setAttribute() {}, getAttribute: () => null, getBoundingClientRect: () => ({}), remove() {}, appendChild() {},
    querySelector(sel) { return (n.kids[sel] = n.kids[sel] || fakeNode()); },
    querySelectorAll: () => [],
    get innerHTML() { return n._html; },
    set innerHTML(v) { n._html = String(v); n.kids = {}; },
    get textContent() { return n._text; },
    set textContent(v) { n._text = String(v); n._html = ''; n.kids = {}; },
  };
  return n;
}

/** a save as `sanitizeSave` takes it: rooms cleared in order, their words learned, the next room open */
function progress(cleared, extra = {}) {
  const rooms = {}, words = {};
  for (const id of cleared) {
    rooms[id] = { cleared: true, stars: [true, false, false], memory: false };
    for (const w of wordsOf(id)) words[w] = { heard: 8, quiz: 1, seen: true, lastSeen: 1 };
  }
  return { rooms, words, unlocked: { rooms: cleared.length + 1 }, roomClock: cleared.length + 2, flags: { prologue: true }, ...extra };
}

/**
 * The real 60-story + 70-ui + review + save in one scope. `initial` is the save they start from.
 * Returns { api, env, nodes, keydown, stored() } where env.lines / env.words / env.writes record what the scenes did and
 * stored() is the JSON that the latest saveWrite() would have put in localStorage. `overrides` replace globals of the page (Image, timers, ...).
 */
function page(initial = {}, overrides = {}) {
  const env = { now: 5000, lines: [], words: [], preloads: [], writes: 0, json: null, randomCalls: 0, handlers: [] };
  const nodes = {};
  const M = Object.create(Math);
  M.random = () => { env.randomCalls++; return 0.5; };
  const body = { classList: { contains: () => false, toggle() {} }, dataset: {} };
  const context = {
    console, Promise, Math: M,
    setTimeout: fn => setImmediate(fn), clearTimeout: h => clearImmediate(h),
    performance: { now: () => env.now },
    Image: class { set src(v) { this._src = v; } },
    Event: class {}, dispatchEvent: () => true,
    document: { body, querySelectorAll: () => [] },
    addEventListener: (type, fn) => { if (type === 'keydown') env.handlers.push(fn); },
    $: id => (nodes[id] = nodes[id] || fakeNode()),
    SRC: n => n,
    LEVELS, LINES, WORDS,
    __initial: initial,
    __hooks: { wrote: text => { env.json = text; env.writes++; } },
    voice: {
      busy: false, stop() {}, ui() {},
      preload: keys => { env.preloads.push(keys); return Promise.resolve(); },
      line: key => { env.lines.push(key); return Promise.resolve(true); },
      word: id => { env.words.push(id); return Promise.resolve(true); },
    },
  };
  Object.assign(context, overrides);
  vm.createContext(context);
  const prelude = `
    const save = sanitizeSave(__initial);
    function saveWrite() { __hooks.wrote(JSON.stringify(save)); return true; }
    function saveSoon() {}
    function setting(k) { return save.settings[k]; }
    function setSetting(k, v) { save.settings[k] = v; return true; }
    const game = { index: 0, state: 'title', stars: { total: 0, got: 0 }, memoryFound: false };
    const hasLineKey = key => !!(LINES.lines && LINES.lines[key]);
    function lineText(key) {
      const L = LINES.lines[key];
      return L ? [L.say.map(seg => (typeof seg === 'string' ? seg : seg && seg.w ? seg.w : seg && seg.en ? seg.en : '')).join('')] : [];
    }`;
  const epilogue = `
    uxBind = (root, acts) => { root.__acts = acts; };
    uxConfetti = () => {};
    ({ save, current: () => story, showClear, showRecall, showReview, showWordbook, showSettings, recallWordsFor, reviewContext,
       uxWordOpen, uxReviewPool, uxReviewQueue, uxRecallWords, uxQuizPool, uxProgressRows, uxPlayTimeText, uxPic })`;
  const code = [read('src', 'lib', 'review.js'), read('src', 'lib', 'save.js'), prelude, read('src', 'view', '60-story.js'), read('src', 'view', '70-ui.js'), epilogue].join('\n');
  const api = vm.runInContext(code, context, { filename: 'learning-ui' });
  return {
    api, env, nodes, done: 0,
    overlay: context.$('overlay'), modal: context.$('modal'),
    keydown(code) {
      const e = { code, repeat: false, target: null, metaKey: false, ctrlKey: false, preventDefault() {}, stopImmediatePropagation() {} };
      for (const h of env.handlers) h(e);
    },
    stored: () => JSON.parse(env.json),
  };
}

const fakeCard = id => ({ dataset: { word: id }, classList: { add() {}, remove() {}, contains: () => false }, getBoundingClientRect: () => ({}) });
const tap = (body, id) => body.__acts.pick(fakeCard(id));
const shownIds = html => [...html.matchAll(/data-word="([^"]+)"/g)].map(m => m[1]);

/** wait for the next question of a quiz or review game: the cards shown and the word Anna asked for */
async function nextQuestion(p, prevHtml = '') {
  const body = p.overlay.querySelector('#uxBody');
  await until(() => body.innerHTML && body.innerHTML !== prevHtml, 'the next question');
  const asked = p.env.lines.filter(k => k.startsWith('quiz_') && !/^quiz_(right|wrong)_\d$/.test(k)).pop();
  return { body, html: body.innerHTML, shown: shownIds(body.innerHTML), target: asked.slice('quiz_'.length) };
}
async function toQuiz(p, levelId) {
  p.api.showClear(levelId, () => { p.done++; });
  const ctl = () => p.overlay.querySelector('#uxCtl');
  await until(() => p.api.current() && p.api.current().phase === 2 && ctl().innerHTML.includes('data-act="next"'), 'the word cards to be said');
  p.env.now = 60000;
  p.keydown('Enter');
  await until(() => p.api.current().phase === 3, 'the quiz');
}

/* ---------- C3: the quiz ---------- */

export function aPictureThatFailsToLoadIsTriedAgainAndThenReplacesItsPlaceholder({ assert }) {
  const images = [], timers = [], upgraded = [];
  const shownPlaceholder = name => ({ dataset: { box: '0,0,10,10', extra: '' }, insertAdjacentHTML: (where, html) => upgraded.push([name, html]), remove() {} });
  const p = page({}, {
    Image: class { set src(v) { this.src_ = v; images.push(this); } },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    document: { body: { classList: { contains: () => false, toggle() {} }, dataset: {} }, querySelectorAll: sel => [shownPlaceholder(sel.match(/data-pic="([^"]+)"/)[1])] },
  });
  const pic = name => p.api.uxPic(name, 0, 0, 10, 10, '<circle/>');
  const runTimer = () => timers.shift().fn();

  // a picture refused once (Cloudflare answered a burst with 429) loads on its retry and replaces the placeholder already on screen
  assert.match(pic('word_heart'), /data-pic="word_heart"/, 'first a placeholder');
  images.pop().onerror();
  assert.deepEqual(timers.map(t => t.ms), [2000], 'the failed probe is tried again later');
  assert.match(pic('word_heart'), /data-pic=/, 'meanwhile the placeholder stays, without a second request');
  assert.equal(images.length, 0);
  runTimer();
  images.pop().onload();
  assert.equal(upgraded.length, 1, 'the retry that loads swaps the placeholder on screen for the picture');
  assert.match(upgraded[0][1], /<image href="word_heart"/);
  assert.match(pic('word_heart'), /^<image href="word_heart"/, 'and later screens draw the picture at once');

  // a picture that never loads is asked for 1 + 3 times, then the placeholder stays for the session
  pic('word_nope');
  for (const ms of [2000, 5000, 15000]) { images.pop().onerror(); assert.equal(timers[0].ms, ms); runTimer(); }
  images.pop().onerror();
  assert.equal(timers.length, 0, 'no fifth try');
  pic('word_nope');
  assert.equal(images.length, 0, 'and no new request when it is drawn again');
}

export async function quizOptionsMixInWordsFromRoomsAlreadyClearedAndAreDistinctWithIcons({ assert }) {
  const p = page(progress(['hall', 'lake', 'slope']));
  const mine = wordsOf('slope'), others = [...wordsOf('hall'), ...wordsOf('lake')];
  await toQuiz(p, 'slope');
  let html = '';
  const asked = [];
  for (let q = 0; q < 3; q++) {
    const { body, html: h, shown, target } = await nextQuestion(p, html);
    html = h;
    asked.push(target);
    assert.equal(shown.length, 3, `question ${q + 1}: three cards`);
    assert.equal(new Set(shown).size, 3, `question ${q + 1}: three different cards`);
    assert.ok(shown.includes(target), `question ${q + 1}: the word asked for is among them`);
    assert.ok(mine.includes(target), 'the questions are about this room');
    assert.ok(shown.some(id => others.includes(id)), `question ${q + 1}: at least one card from a room cleared before (${shown})`);
    assert.ok(shown.every(id => mine.includes(id) || others.includes(id)), 'and nothing from a room never played');
    for (const id of shown) {
      const w = WORDS.find(x => x.id === id);
      assert.ok(w && w.icon, `${id} has an icon name`);
      assert.ok(fs.existsSync(path.join(ROOT, 'game', w.icon + '.webp')), `${id}: game/${w.icon}.webp exists`);
    }
    tap(body, target);
  }
  assert.deepEqual([...asked].sort(), [...mine].sort(), 'each word of the room is asked once');
  assert.equal(p.env.randomCalls, 0, 'questions and options were chosen without Math.random');
}

export async function theQuizIsFirstRoomOnlyWhenNoOtherRoomWasCleared({ assert }) {
  const p = page(progress(['hall']));
  const mine = wordsOf('hall');
  await toQuiz(p, 'hall');
  const { shown } = await nextQuestion(p);
  assert.deepEqual([...shown].sort(), [...mine].sort(), 'with nothing else learned the three cards are the room\'s three words');
}

export async function everyAnswerIsStoredAtOnceSoLeavingMidQuizLosesNothing({ assert }) {
  const p = page(progress(['hall', 'lake']));
  await toQuiz(p, 'lake');
  const before = p.env.writes;
  let html = '';

  const q1 = await nextQuestion(p, html); html = q1.html;
  tap(q1.body, q1.target);
  assert.ok(p.env.writes > before, 'a right answer is saved before anything else happens');
  assert.equal(p.stored().words[q1.target].quiz, 2, 'first-try right: the quiz counter went from 1 to 2 in the stored save');

  const q2 = await nextQuestion(p, html); html = q2.html;
  const wrongCard = q2.shown.find(id => id !== q2.target);
  const w0 = p.env.writes;
  tap(q2.body, wrongCard);
  assert.ok(p.env.writes > w0, 'a wrong tap is saved at once, too');
  assert.equal(p.stored().words[q2.target].wrong, 1, 'the miss is stored against the word that was asked');
  tap(q2.body, wrongCard);
  assert.equal(p.stored().words[q2.target].wrong, 1, 'tapping the same wrong card again does not count a second miss');
  tap(q2.body, q2.target);
  const after = p.stored().words[q2.target];
  assert.equal(after.quiz, 1, 'right after a miss is not a first-try answer: the counter stays');
  assert.equal(after.wrong, 1);

  const q3 = await nextQuestion(p, html);
  const ctl = p.overlay.querySelector('#uxCtl');
  ctl.__acts.skip();                                                    // quit before answering the last question
  assert.equal(p.api.current().phase, 4, 'the skip button leaves the quiz');
  const saved = p.stored().words;
  assert.equal(saved[q1.target].quiz, 2, 'the first answer survived the quit');
  assert.equal(saved[q2.target].wrong, 1, 'and so did the miss');
  assert.equal(saved[q3.target].quiz, 1, 'the question that was never answered added nothing');
  assert.equal(saved[q3.target].wrong, undefined);
}

export async function theSameSaveAsksTheSameQuestionsInTheSameOrder({ assert }) {
  const runs = [];
  for (let k = 0; k < 2; k++) {
    const p = page(progress(['hall', 'lake', 'slope']));
    await toQuiz(p, 'slope');
    const seen = [];
    let html = '';
    for (let q = 0; q < 3; q++) {
      const n = await nextQuestion(p, html); html = n.html;
      seen.push([n.target, ...n.shown]);
      tap(n.body, n.target);
    }
    runs.push(seen);
  }
  assert.deepEqual(runs[0], runs[1], 'nothing in the question order depends on the clock or on chance');
}

/* ---------- C2: recall ---------- */

export async function recallMarksOlderWordsReviewedAndStoresIt({ assert }) {
  const p = page(progress(['hall', 'lake'], { roomClock: 3 }));
  const lake = wordsOf('lake');
  p.api.showRecall('lake', () => { p.done++; }, [...lake, 'heart', 'star']);
  await until(() => p.done === 1, 'the recall to finish');
  const words = p.stored().words;
  assert.equal(words.heart.reviews, 1, 'an older word that came back counts as reviewed');
  assert.equal(words.heart.lastReviewed, 3);
  assert.equal(words.star.reviews, 1);
  for (const id of lake) assert.equal(words[id].reviews, undefined, `${id}: the recap of the room just left is not a spaced review`);
  assert.deepEqual(p.env.lines.filter(k => k.startsWith('recall_')), [...lake, 'heart', 'star'].map(id => 'recall_' + id), 'every card gets its recall line');
}

export async function aWordReviewedInThisRecallStaysOutOfTheNextOne({ assert }) {
  const p = page(progress(['hall', 'lake'], { roomClock: 3 }));
  const lake = wordsOf('lake'), hall = wordsOf('hall');
  const ctx = () => Object.assign(p.api.reviewContext(p.api.save), { exclude: wordsOf('tower') });
  const first = JSON.parse(JSON.stringify(p.api.recallWordsFor(lake, p.api.save.words, ctx())));
  assert.ok(first.slice(lake.length).every(id => hall.includes(id)) && first.length > lake.length, 'older hall words are due');
  p.api.showRecall('lake', () => { p.done++; }, first);
  await until(() => p.done === 1, 'the recall to finish');
  p.api.save.roomClock = 4;                                             // the next room
  const second = JSON.parse(JSON.stringify(p.api.recallWordsFor(wordsOf('slope'), p.api.save.words, ctx())));
  for (const id of first.slice(lake.length)) assert.equal(second.includes(id), false, `${id} was just reviewed and stays away for a room`);
}

export function aRecallNeverBringsBackGeneralWordsOrWordsOfLockedRooms({ assert }) {
  const save = progress(['hall', 'lake'], { unlocked: { rooms: 3 }, roomClock: 9 });
  save.words.hello = { heard: 9, quiz: 0, lastSeen: 1 };                // no room, no recall line
  save.words.sun = { heard: 9, quiz: 2, wrong: 3, lastSeen: 1, lastWrong: 1 };
  save.words.jump = { heard: 3, quiz: 0, lastSeen: 1 };                 // spring: still locked
  save.words.push = { heard: 3, quiz: 0, wrong: 1, lastSeen: 1, lastWrong: 1 };   // tower: still locked, and missed
  const p = page(save);
  const ids = JSON.parse(JSON.stringify(p.api.uxRecallWords(wordsOf('lake'), wordsOf('slope'))));
  assert.deepEqual(ids.slice(0, 3), wordsOf('lake'));
  const older = ids.slice(3);
  assert.ok(older.length >= 1 && older.length <= 2, `older words are added (${older})`);
  assert.ok(older.every(id => wordsOf('hall').includes(id)), `and only core words of open rooms (${older})`);
  for (const id of older) assert.ok(LINES.lines['recall_' + id], `recall_${id} exists`);
}

/* ---------- C4: wordbook, locked silhouettes, review game ---------- */

export function aSilhouetteOfALockedRoomIsSilentAndCannotBecomeLearned({ assert }) {
  const p = page({ rooms: {}, unlocked: { rooms: 1 }, words: {} });
  p.api.showWordbook(4);                                                // the spring page: jump up high
  p.overlay.__acts.word(fakeCard('jump'));
  assert.deepEqual(p.env.words, [], 'nothing is said for a word of a room that is still locked');
  assert.equal(p.api.save.words.jump, undefined, 'and nothing was recorded for it');
  assert.equal(p.api.uxWordOpen('jump'), false);

  p.api.showWordbook(0);                                                // the hall page: the room is open
  p.overlay.__acts.word(fakeCard('heart'));
  assert.deepEqual(p.env.words, ['heart'], 'a silhouette of an open room still says its word');

  p.api.save.words.jump = { heard: 1, quiz: 0 };                        // met before (an old save): a coloured card is allowed to speak
  p.api.showWordbook(4);
  p.overlay.__acts.word(fakeCard('jump'));
  assert.deepEqual(p.env.words, ['heart', 'jump']);
}

export function wordsOfLockedRoomsAreNeverInTheReviewPoolEvenIfAnOldSaveHeardThem({ assert }) {
  const save = progress(['hall', 'lake'], { unlocked: { rooms: 3 } });
  save.words.push = { heard: 3, quiz: 0 };                              // tower: still locked
  save.words.hello = { heard: 5, quiz: 0 };                             // belongs to no room
  const p = page(save);
  const pool = JSON.parse(JSON.stringify(p.api.uxReviewPool()));
  assert.equal(pool.includes('push'), false);
  assert.equal(pool.includes('hello'), false, 'only the core words of rooms are asked');
  assert.deepEqual([...pool].sort(), [...wordsOf('hall'), ...wordsOf('lake')].sort());
  assert.equal(p.api.uxReviewQueue(5).includes('push'), false);
  assert.equal(p.api.uxWordOpen('hello'), true, 'a general word is not locked, it is simply not part of a room');
}

export function theReviewQueueStartsWithMissedWordsAndStaysInOpenRooms({ assert }) {
  const save = progress(['hall', 'lake'], { unlocked: { rooms: 3 }, roomClock: 6 });
  save.words.fish = { heard: 8, quiz: 0, wrong: 2, lastSeen: 5, lastWrong: 5 };
  const p = page(save);
  const queue = JSON.parse(JSON.stringify(p.api.uxReviewQueue(5)));
  assert.equal(queue.length, 5);
  assert.equal(queue[0], 'fish', 'the word missed most recently comes first');
  assert.equal(new Set(queue).size, 5);
  const open = [...wordsOf('hall'), ...wordsOf('lake')];
  assert.ok(queue.every(id => open.includes(id)));
}

export function theWordbookOffersTheReviewGameAsAnImageButtonWithAnExistingName({ assert }) {
  const ready = page(progress(['hall', 'lake']));
  ready.api.showWordbook();
  const html = ready.overlay.innerHTML;
  const btn = html.match(/<g class="ux-btn ([^"]*)" data-act="review" data-ui="(\w+)"[\s\S]*?<circle r="(\d+)"/);
  assert.ok(btn, 'a review button is on the wordbook page');
  assert.ok(LINES.lines['ui_' + btn[2]], `its hover name ui_${btn[2]} is a line that exists`);
  assert.ok(Number(btn[3]) * 2 >= 64, 'at least 64 units wide');
  assert.equal(btn[1].includes('dim'), false);
  assert.ok(!/data-act="review"[\s\S]{0,400}<text/.test(html), 'a picture, no words');

  const empty = page({ rooms: {}, unlocked: { rooms: 1 }, words: { heart: { heard: 1, quiz: 0 } } });
  empty.api.showWordbook();
  assert.ok(/class="ux-btn dim" data-act="review"/.test(empty.overlay.innerHTML), 'with fewer than three words met the button is dimmed');
  empty.overlay.__acts.review(fakeCard('x'));
  assert.equal(empty.api.current(), null, 'and does not open the game');
}

export async function theReviewGameAsksFiveQuestionsFromTheQueueAndStoresEachAnswer({ assert }) {
  const save = progress(['hall', 'lake', 'slope'], { unlocked: { rooms: 4 }, roomClock: 8 });
  save.words.door = { heard: 8, quiz: 0, wrong: 1, lastSeen: 6, lastWrong: 6 };
  save.words.jump = { heard: 2, quiz: 0 };                              // spring, still locked
  const p = page(save);
  const queue = JSON.parse(JSON.stringify(p.api.uxReviewQueue(5)));
  assert.equal(queue[0], 'door');
  let left = 0;
  p.api.showReview(() => { left++; });
  assert.equal(p.api.current().name, 'review', 'the game is a scene of its own');
  const open = [...wordsOf('hall'), ...wordsOf('lake'), ...wordsOf('slope')];
  let html = '';
  const asked = [];
  for (let q = 0; q < 5; q++) {
    const n = await nextQuestion(p, html); html = n.html;
    asked.push(n.target);
    assert.equal(n.shown.length, 3);
    assert.equal(new Set(n.shown).size, 3);
    assert.ok(n.shown.includes(n.target));
    assert.ok(n.shown.every(id => open.includes(id)), `cards come from open rooms only (${n.shown}, asked ${n.target})`);
    const wrongFirst = q === 1;
    if (wrongFirst) tap(n.body, n.shown.find(id => id !== n.target));
    const writes = p.env.writes;
    tap(n.body, n.target);
    if (!wrongFirst) assert.ok(p.env.writes > writes, `question ${q + 1}: the answer is saved at once`);
  }
  assert.deepEqual(asked, queue, 'the questions are the queue, in its order');
  const stored = p.stored().words;
  assert.equal(stored[asked[0]].quiz, 1 + (save.words[asked[0]].quiz || 0), 'a first-try answer is counted like in the quiz');
  assert.equal(stored[asked[1]].wrong, (save.words[asked[1]].wrong || 0) + 1, 'a miss is counted against that word');
  await until(() => p.overlay.querySelector('#uxCtl').innerHTML.includes('data-act="done"'), 'the last page');
  p.overlay.querySelector('#uxCtl').__acts.done();
  assert.equal(left, 1, 'the done button hands back to the wordbook');
}

export async function aMissedWordInTheReviewGameComesBackFirst({ assert }) {
  const p = page(progress(['hall', 'lake'], { unlocked: { rooms: 3 }, roomClock: 5 }));
  p.api.showReview(() => {});
  const n = await nextQuestion(p);
  tap(n.body, n.shown.find(id => id !== n.target));
  tap(n.body, n.target);
  assert.equal(p.api.uxReviewQueue(5)[0], n.target, 'the word that was missed heads the next round');
}

export async function leavingTheReviewGameWithTheBackButtonKeepsWhatWasAnswered({ assert }) {
  const p = page(progress(['hall', 'lake'], { unlocked: { rooms: 3 }, roomClock: 5 }));
  let left = 0;
  p.api.showReview(() => { left++; });
  const q1 = await nextQuestion(p);
  tap(q1.body, q1.target);
  const q2 = await nextQuestion(p, q1.html);
  p.overlay.querySelector('#uxCtl').__acts.back();
  assert.equal(left, 1);
  assert.equal(p.stored().words[q1.target].quiz, 2, 'the answered question is in the stored save');
  assert.equal(p.stored().words[q2.target].quiz, 1, 'the open one is untouched');
}

export function theReviewGameIsNotOfferedWithFewerThanThreeWordsMet({ assert }) {
  const p = page({ rooms: {}, unlocked: { rooms: 1 }, words: { heart: { heard: 1, quiz: 0 }, star: { heard: 1, quiz: 0 } } });
  let left = 0;
  p.api.showReview(() => { left++; });
  assert.equal(left, 1, 'it hands straight back instead of opening a scene that cannot be played');
  assert.equal(p.api.current(), null);
}

/* ---------- C5: parent progress page ---------- */

export function progressRowsGiveHeardCountFirstTryShareAndRoomsSinceLastMet({ assert }) {
  const save = progress(['hall'], { roomClock: 5, totalPlaySeconds: 3905 });
  save.words.heart = { heard: 9, quiz: 2, wrong: 1, lastSeen: 4 };
  save.words.star = { heard: 3, quiz: 0 };
  save.words.door = { heard: 0, quiz: 0 };
  const p = page(save);
  const rows = JSON.parse(JSON.stringify(p.api.uxProgressRows()));
  assert.equal(rows.length, LEVELS.length);
  assert.deepEqual(rows[0].words.map(w => w.id), wordsOf('hall'));
  const [heart, star, door] = rows[0].words;
  assert.deepEqual(heart, { id: 'heart', en: 'heart', heard: 9, accuracy: 67, ago: 1 });
  assert.equal(star.accuracy, null, 'no quiz question yet: no share to show');
  assert.equal(star.ago, null, 'never stamped');
  assert.equal(door.heard, 0);
  assert.equal(p.api.uxPlayTimeText(0), '0 秒');
  assert.equal(p.api.uxPlayTimeText(59), '59 秒');
  assert.equal(p.api.uxPlayTimeText(125), '2 分 5 秒');
  assert.equal(p.api.uxPlayTimeText(3905), '1 小时 5 分');
}

export function theParentSettingsOpenTheProgressPageWithPlayTimeAndEveryCoreWord({ assert }) {
  const save = progress(['hall', 'lake'], { roomClock: 6, totalPlaySeconds: 3905 });
  save.words.heart = { heard: 9, quiz: 2, wrong: 1, lastSeen: 5 };
  const p = page(save);
  p.api.showSettings();
  assert.ok(p.modal.innerHTML.includes('data-act="progress"'), 'the settings page has the progress entry');
  assert.ok(p.modal.innerHTML.includes('家长设置'));
  p.modal.__acts.progress();
  const html = p.modal.innerHTML;
  assert.ok(html.includes('学习进度'));
  assert.ok(html.includes('累计游玩 1 小时 5 分'), 'total play time');
  assert.ok(html.includes('67%'), 'first-try share of heart');
  assert.ok(html.includes('1 间前'), 'rooms since heart was last met');
  for (const lv of LEVELS) for (const id of lv.words) assert.ok(html.includes('>' + id + '<'), `${id} has a row`);
  p.modal.__acts.back();
  assert.ok(p.modal.innerHTML.includes('家长设置'), 'the back arrow returns to the settings');
}

export function theSettingsButtonsAreMovedByAWrapperSoTheHoverScaleCannotThrowThemToTheCorner({ assert }) {
  const p = page(progress(['hall']));
  for (const view of [undefined, 'progress']) {
    p.api.showSettings(view);
    const html = p.modal.innerHTML;
    const buttons = html.match(/<g [^>]*class="ux-opt ux-btn"[^>]*>/g) || [];
    if (!view) assert.ok(buttons.length >= 9, 'the eight settings and the progress entry');
    for (const tag of buttons) assert.equal(/transform=/.test(tag), false, `a CSS hover transform replaces the transform attribute: ${tag}`);
    assert.equal((html.match(/<g[\s>]/g) || []).length, (html.match(/<\/g>/g) || []).length, 'the markup is balanced');
  }
}

/* ---------- 90-main: the review clock, the recall words, play time ---------- */

const MAIN_FILES = ['00-core', '10-stage', '20-sisters', '30-fx', '70-ui', '80-input', '90-main'];

export async function threeRoomsInARowBringTheFirstRoomsWordsBackInTheThirdRecall({ assert }) {
  const calls = [];
  const env = viewEnv.load(MAIN_FILES, {
    exports: ['enterRoom', 'save', 'noteWordHeard', 'LEVELS', 'playFlow'],
    globals: {
      voice: { busy: false, stop() {}, line: () => Promise.resolve(true) },
      showRecall: (lv, done, ids) => { calls.push({ room: lv.id, ids: [...ids] }); done(); },
      showChapter: (lv, done) => done(),
    },
  });
  const { enterRoom, save, noteWordHeard, LEVELS: levels } = env.exports;
  const words = i => [...levels[i].words];
  for (let i = 0; i < 3; i++) {
    await enterRoom(i);
    assert.equal(save.roomClock, i + 1, `room ${i + 1} entered: the review clock is ${i + 1}`);
    for (const id of words(i)) noteWordHeard(id);                       // what the chapter card and the play teach
  }
  assert.equal(calls.length, 2, 'the first room has no recall, the others do');
  assert.deepEqual(calls[0], { room: levels[0].id, ids: words(0) }, 'room 2 recalls room 1\'s three words and nothing older');
  const third = calls[1];
  assert.equal(third.room, levels[1].id);
  assert.deepEqual(third.ids.slice(0, 3), words(1), 'room 3 recalls room 2\'s words first');
  const older = third.ids.slice(3);
  assert.ok(older.length >= 1 && older.length <= 2, `then one or two older words (${older})`);
  assert.ok(older.some(id => words(0).includes(id)), 'and at least one of them is a word of the first room');
  assert.ok(older.every(id => !words(2).includes(id)), 'never a word of the room being entered');
  assert.ok(env.store.get('icecastle.save').includes('"roomClock":3'), 'the clock is saved with the room entry');
}

export async function replayingTheFirstRoomHasNoRecallAndStillMovesTheClock({ assert }) {
  const calls = [];
  const env = viewEnv.load(MAIN_FILES, {
    exports: ['enterRoom', 'save'],
    globals: { voice: { busy: false, stop() {}, line: () => Promise.resolve(true) }, showRecall: (lv, done, ids) => { calls.push(ids); done(); }, showChapter: (lv, done) => done() },
  });
  await env.exports.enterRoom(0);
  await env.exports.enterRoom(0);
  assert.deepEqual(calls, []);
  assert.equal(env.exports.save.roomClock, 2);
}

export function playTimeCountsWholeSecondsWhileARoomOrALessonIsOpen({ assert }) {
  const errors = [];
  const env = viewEnv.playPage('solo', { globals: { console: { log() {}, warn() {}, error: (...a) => errors.push(a) } } });
  const { frame, save, playFlow } = env.exports;
  let ms = 1000;
  const run = n => { for (let i = 0; i < n; i++) { ms += 50; frame(ms); } };
  assert.equal(save.totalPlaySeconds, 0);
  run(200);                                                             // 200 frames of 50 ms: ten seconds in a live room
  assert.ok(save.totalPlaySeconds >= 9 && save.totalPlaySeconds <= 10, `10 s of play counted as ${save.totalPlaySeconds}`);
  assert.ok(Number.isInteger(save.totalPlaySeconds), 'whole seconds');

  const t = save.totalPlaySeconds;
  frame(ms + 3600000);                                                  // the tab was hidden for an hour: one frame, dt capped at 50 ms
  ms += 3600000;
  assert.equal(save.totalPlaySeconds, t, 'a hidden tab adds nothing');

  playFlow.phase = 'title';
  run(100);
  assert.equal(save.totalPlaySeconds, t, 'the title screens are not play time');

  env.ctx.story = { name: 'review' };
  run(100);                                                             // 5 s inside a lesson scene opened from the title
  assert.ok(save.totalPlaySeconds - t >= 4 && save.totalPlaySeconds - t <= 5, `a scene counts (${save.totalPlaySeconds - t} s of 5)`);
  env.ctx.story = null;

  playFlow.phase = 'play';
  const u = save.totalPlaySeconds;
  env.ctx.uxState.modal = { name: 'settings' };
  run(100);
  assert.equal(save.totalPlaySeconds, u, 'the parent settings pause the count');
  assert.deepEqual(errors, [], 'the frames ran without errors');
}
