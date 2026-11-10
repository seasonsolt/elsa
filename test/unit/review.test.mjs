/* PLAN-2 C2 / C3: spaced review and quiz option picking. src/lib/review.js is pure; time is the room clock, randomness a seeded rng. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLib } from '../harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WORDS = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'content', 'words.json'), 'utf8'));
const plain = x => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
/* The functions of review.js, with results copied into this realm so deepEqual compares them with plain arrays and objects. */
const lib = () => {
  const raw = loadLib(['review'], {}, '({ reviewDue, recallWordsFor, recallOlderIds, quizOptions, noteQuizAnswer, noteReviewed, noteHeard, reviewContext, reviewAdvanceClock, reviewLearned, makeReviewRng })');
  return Object.fromEntries(Object.entries(raw).map(([k, fn]) => [k, k === 'makeReviewRng' ? fn : (...args) => plain(fn(...args))]));
};
const wordsOfRoom = room => WORDS.filter(w => w.room === room).map(w => w.id);
const ROOMS = [...new Set(WORDS.map(w => w.room))];

export function reviewIsPureAndDoesNotTouchThePage({ assert }) {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'review.js'), 'utf8');
  for (const bad of ['document', 'window', 'localStorage', 'Math.random', 'Date', 'performance', 'setTimeout']) assert.equal(src.includes(bad), false, `review.js must not use ${bad}`);
}

export function wrongAnswersComeFirstAndNeverLearnedWordsNeverDo({ assert }) {
  const { reviewDue } = lib();
  const words = {
    heart: { heard: 8, quiz: 2, lastSeen: 1 },                          // learned, long ago, answered right
    star: { heard: 8, quiz: 0, wrong: 1, lastSeen: 3, lastWrong: 3 },   // missed once, more recently
    door: { heard: 8, quiz: 0, wrong: 3, lastSeen: 3, lastWrong: 3 },   // missed three times
    water: { heard: 0, quiz: 0 },                                       // never learned
    ice: { heard: 0, quiz: 0, lastSeen: 1 },                            // a stamp alone is not learning
    fish: { heard: 0, quiz: 0, seen: true, lastSeen: 1 },               // met on a card with the sound off: learned
  };
  const due = reviewDue(words, { clock: 9 });
  assert.deepEqual(due, ['door', 'star', 'fish', 'heart'], 'open misses first (the most missed first), then the long overdue; the less practised before the better known');
  assert.equal(due.includes('water'), false, 'a word with no hearing at all is never due');
  assert.equal(due.includes('ice'), false, 'a record that only carries a timestamp is not a learned word');
  assert.deepEqual(reviewDue({ water: { heard: 0, quiz: 0 } }, { clock: 50 }), []);
  assert.deepEqual(reviewDue({}, { clock: 3 }), []);
  assert.deepEqual(reviewDue(null, { clock: 3 }), []);
}

export function aWordMetRecentlyIsNotDueYetAndOverdueWordsGoFirst({ assert }) {
  const { reviewDue } = lib();
  const words = { heart: { heard: 8, quiz: 1, lastSeen: 5 }, star: { heard: 8, quiz: 1, lastSeen: 3 }, door: { heard: 8, quiz: 1, lastSeen: 1 } };
  assert.deepEqual(reviewDue(words, { clock: 5 }), ['door', 'star'], 'a room after the last meeting a word is due; the oldest first');
  assert.deepEqual(reviewDue(words, { clock: 3 }), ['door'], 'the same room is too soon');
  assert.deepEqual(reviewDue(words, { clock: 6 }), ['door', 'star', 'heart']);
  assert.equal(reviewDue(words, { clock: 5, limit: 1 }).length, 1);
  assert.equal(reviewDue(words, { clock: 9, exclude: ['door'] }).includes('door'), false, 'excluded ids stay out');
}

export function aReviewedWordStaysAwayForTheNextRoomAndThenWaitsLonger({ assert }) {
  const { reviewDue, noteReviewed } = lib();
  const words = { heart: { heard: 8, quiz: 1, lastSeen: 1 } };
  assert.deepEqual(reviewDue(words, { clock: 3 }), ['heart']);
  noteReviewed(words, 'heart', { clock: 3 });
  assert.deepEqual(reviewDue(words, { clock: 3 }), [], 'not in the room it was reviewed in');
  assert.deepEqual(reviewDue(words, { clock: 4 }), [], 'nor in the next room');
  assert.deepEqual(reviewDue(words, { clock: 5 }), [], 'after a review the wait grows');
  assert.deepEqual(reviewDue(words, { clock: 6 }), ['heart']);
  // a missed word is also held back for the next room once reviewed
  const missed = { door: { heard: 8, quiz: 0, wrong: 1, lastSeen: 2, lastWrong: 2 } };
  assert.deepEqual(reviewDue(missed, { clock: 3 }), ['door']);
  noteReviewed(missed, 'door', { clock: 3 });
  assert.deepEqual(reviewDue(missed, { clock: 4 }), []);
  assert.deepEqual(reviewDue(missed, { clock: 5 }), [], 'settled misses fall back to normal spacing');
  assert.deepEqual(reviewDue(missed, { clock: 6 }), ['door']);
  assert.equal(missed.door.wrong, 1, 'the history of misses is kept');
}

export function theSameSaveAndClockAlwaysGiveTheSameAnswer({ assert }) {
  const { reviewDue, recallWordsFor } = lib();
  const words = {};
  for (const [i, w] of WORDS.entries()) words[w.id] = { heard: 3 + (i % 4), quiz: i % 3, wrong: i % 5 === 0 ? 1 : 0, lastSeen: 1 + (i % 6), lastWrong: i % 5 === 0 ? 2 : 0 };
  const a = reviewDue(plain(words), { clock: 12 }), b = reviewDue(plain(words), { clock: 12 });
  assert.deepEqual(a, b);
  const shuffledKeys = {};
  for (const id of Object.keys(words).reverse()) shuffledKeys[id] = words[id];
  assert.deepEqual(reviewDue(shuffledKeys, { clock: 12 }), a, 'the order of the keys in the save does not matter');
  assert.deepEqual(recallWordsFor(['heart', 'star', 'door'], plain(words), { clock: 12 }), recallWordsFor(['heart', 'star', 'door'], plain(words), { clock: 12 }));
  const before = JSON.stringify(words);
  reviewDue(words, { clock: 12 }); recallWordsFor(['heart'], words, { clock: 12 });
  assert.equal(JSON.stringify(words), before, 'reading the queue changes nothing');
}

export function aRecallIsThePreviousRoomPlusAtMostTwoDueOlderWords({ assert }) {
  const { recallWordsFor, recallOlderIds } = lib();
  const words = {};
  for (const id of ['heart', 'star', 'door', 'water', 'ice', 'fish', 'slide']) words[id] = { heard: 8, quiz: 1, lastSeen: 1 };
  words.fish.wrong = 1; words.fish.lastWrong = 1;
  const recall = recallWordsFor(['slide', 'ice', 'water'], words, { clock: 6 });
  assert.deepEqual(recall.slice(0, 3), ['slide', 'ice', 'water'], 'the previous room first, as given');
  assert.deepEqual(recall.slice(3), ['fish', 'door'], 'plus two older words, a missed one first');
  assert.deepEqual(recallOlderIds(['slide', 'ice', 'water'], recall), ['fish', 'door']);
  assert.equal(new Set(recall).size, 5, 'no word twice');
  assert.deepEqual(recallWordsFor(['slide'], {}, { clock: 6 }), ['slide'], 'nothing due: just the previous room');
  assert.deepEqual(recallWordsFor(['slide', 'slide'], { slide: { heard: 9, quiz: 0, lastSeen: 1 } }, { clock: 6 }), ['slide']);
  assert.equal(recallWordsFor(['slide'], words, { clock: 6, exclude: ['heart', 'star', 'door', 'water', 'ice', 'fish'] }).length, 1, 'the room being entered is never reviewed');
  assert.deepEqual(recallWordsFor([], words, { clock: 6 }).length, 2);
}

export function threeRoomsInARowTheThirdRecallBringsBackAWordOfTheFirst({ assert }) {
  const { recallWordsFor, recallOlderIds, noteReviewed, noteHeard, noteQuizAnswer, reviewAdvanceClock, reviewContext, reviewLearned } = lib();
  assert.ok(ROOMS.length >= 3);
  const save = { roomClock: 0, words: {} };
  const recalls = [];
  for (let i = 0; i < 3; i++) {
    reviewAdvanceClock(save);
    const ctx = reviewContext(save);
    const here = wordsOfRoom(ROOMS[i]);
    const prev = i ? wordsOfRoom(ROOMS[i - 1]) : [];
    const recall = recallWordsFor(prev, save.words, { ...ctx, exclude: here });
    recalls.push(recall);
    for (const id of recall) noteHeard(save.words, id, ctx);   // the recap is heard like any word
    for (const id of recallOlderIds(prev, recall)) noteReviewed(save.words, id, ctx);   // only the older ones count as a spaced review
    for (const id of here) for (let k = 0; k < 4; k++) noteHeard(save.words, id, ctx);
    for (const id of here) noteQuizAnswer(save.words, id, true, ctx);   // all answered right at the first try: the hardest case for coming back
  }
  assert.deepEqual(recalls[0], []);
  assert.deepEqual(recalls[1].slice(0, 3), wordsOfRoom(ROOMS[0]));
  const first = wordsOfRoom(ROOMS[0]);
  assert.ok(recalls[2].some(id => first.includes(id)), `room 3 recall ${recalls[2]} has a word of room 1`);
  assert.ok(recalls[2].length >= 4 && recalls[2].length <= 5);
  assert.deepEqual(reviewLearned(save.words, [...first, 'unknown', 'unknown']).sort(), [...first].sort());
}

export function quizOptionsHaveThreeDistinctWordsWithTheTargetAndAnotherRoomsWord({ assert }) {
  const { quizOptions, makeReviewRng } = lib();
  const room = wordsOfRoom(ROOMS[2]), others = [...wordsOfRoom(ROOMS[0]), ...wordsOfRoom(ROOMS[1])];
  const icons = new Map(WORDS.map(w => [w.id, w.icon]));
  const rng = makeReviewRng(7);
  for (let n = 0; n < 300; n++) {
    const target = room[n % 3];
    const opts = quizOptions(target, room, others, {}, rng);
    assert.equal(opts.length, 3);
    assert.equal(new Set(opts).size, 3, 'distinct');
    assert.ok(opts.includes(target));
    assert.ok(opts.some(id => others.includes(id)), 'at least one word from another room');
    for (const id of opts) assert.ok(icons.get(id), `${id} has an icon`);
  }
  // the very first room: nothing learned elsewhere, the room's own three words
  const first = quizOptions(room[0], room, [], {}, makeReviewRng(3));
  assert.deepEqual([...first].sort(), [...room].sort());
  // too few words to make three: fewer, never a repeat
  assert.deepEqual(quizOptions('a', ['a', 'a'], [], {}, makeReviewRng(1)), ['a']);
  assert.deepEqual(quizOptions('a', ['a'], ['a', 'b'], {}, makeReviewRng(1)).sort(), ['a', 'b']);
}

export function quizOptionsPreferWordsAnsweredWrongBefore({ assert }) {
  const { quizOptions, makeReviewRng } = lib();
  const room = wordsOfRoom(ROOMS[1]), a = wordsOfRoom(ROOMS[0]);
  const words = { [a[0]]: { heard: 8, quiz: 0, wrong: 2, lastSeen: 1, lastWrong: 1 }, [a[1]]: { heard: 8, quiz: 1, wrong: 1, lastSeen: 1, lastWrong: 1, lastReviewed: 2 } };
  const rng = makeReviewRng(11);
  let withOpen = 0, withSettled = 0, withClean = 0;
  for (let n = 0; n < 200; n++) {
    const opts = quizOptions(room[0], room, a, words, rng);
    if (opts.includes(a[0])) withOpen++;
    if (opts.includes(a[1])) withSettled++;
    if (opts.includes(a[2])) withClean++;
  }
  assert.equal(withOpen, 200, 'the unsettled miss is always among the distractors');
  assert.equal(withSettled, 200, 'then the settled miss');
  assert.equal(withClean, 0, 'a word never missed does not push them out');
  // with no misses anywhere every candidate gets used
  const seen = new Set();
  for (let n = 0; n < 200; n++) for (const id of quizOptions(room[0], room, a, {}, rng)) seen.add(id);
  for (const id of [...room, ...a]) assert.ok(seen.has(id), `${id} appears when nothing was missed`);
}

export function theTargetLandsInEachSlotAboutAThirdOfTheTime({ assert }) {
  const { quizOptions, makeReviewRng } = lib();
  const room = wordsOfRoom(ROOMS[2]), others = [...wordsOfRoom(ROOMS[0]), ...wordsOfRoom(ROOMS[1])];
  const N = 3000;
  for (const [label, others_] of [['with other rooms', others], ['first room', []]]) {
    const counts = [0, 0, 0];
    const rng = makeReviewRng(2024);
    for (let n = 0; n < N; n++) counts[quizOptions(room[0], room, others_, {}, rng).indexOf(room[0])]++;
    counts.forEach((c, slot) => assert.ok(c / N >= .30 && c / N <= .37, `${label}: slot ${slot} holds the target ${(100 * c / N).toFixed(1)}% of the time`));
  }
  // wrong-word preference must not skew the slot either
  const words = { [others[0]]: { heard: 8, quiz: 0, wrong: 2, lastSeen: 1, lastWrong: 1 } };
  const counts = [0, 0, 0];
  const rng = makeReviewRng(99);
  for (let n = 0; n < N; n++) counts[quizOptions(room[1], room, others, words, rng).indexOf(room[1])]++;
  counts.forEach((c, slot) => assert.ok(c / N >= .30 && c / N <= .37, `with a missed word: slot ${slot} ${(100 * c / N).toFixed(1)}%`));
}

export function theSameSeedGivesTheSameQuizAndNothingIsChanged({ assert }) {
  const { quizOptions, makeReviewRng } = lib();
  const room = wordsOfRoom(ROOMS[1]), others = wordsOfRoom(ROOMS[0]);
  const frozen = JSON.stringify([room, others]);
  const run = seed => { const r = makeReviewRng(seed); return [0, 1, 2, 3, 4].map(n => quizOptions(room[n % 3], room, others, {}, r)); };
  assert.deepEqual(run(5), run(5));
  assert.notDeepEqual(run(5), run(6));
  assert.equal(JSON.stringify([room, others]), frozen, 'the inputs are not shuffled in place');
  const r = makeReviewRng(1);
  for (let n = 0; n < 1000; n++) { const x = r(); assert.ok(x >= 0 && x < 1); }
}

export function quizAndReviewNotesUpdateTheWordRecord({ assert }) {
  const { noteQuizAnswer, noteReviewed, noteHeard, reviewDue, reviewAdvanceClock, reviewContext } = lib();
  const words = {};
  noteHeard(words, 'heart', { clock: 2 });
  assert.deepEqual(plain(words.heart), { heard: 1, quiz: 0, lastSeen: 2 });
  noteQuizAnswer(words, 'heart', true, { clock: 2 });
  assert.deepEqual(plain(words.heart), { heard: 1, quiz: 1, lastSeen: 2 });
  noteQuizAnswer(words, 'star', false, { clock: 2 });
  assert.deepEqual(plain(words.star), { heard: 0, quiz: 0, wrong: 1, lastWrong: 2, lastSeen: 2 });
  assert.deepEqual(reviewDue(words, { clock: 3 }), ['star', 'heart'], 'a missed word is due at once, before the one answered right');
  noteReviewed(words, 'star', { clock: 3 });
  assert.deepEqual(plain(words.star), { heard: 0, quiz: 0, wrong: 1, lastWrong: 2, lastSeen: 3, reviews: 1, lastReviewed: 3 });
  noteQuizAnswer(words, 'star', false, { clock: 3 });
  assert.equal(words.star.wrong, 2);
  assert.equal(words.star.lastWrong, 3, 'a miss after the review opens it again');
  assert.deepEqual(reviewDue(words, { clock: 5 }), ['star', 'heart']);
  // a right answer after an earlier miss (replaying the room) settles it
  noteQuizAnswer(words, 'star', true, { clock: 6 });
  assert.equal(words.star.quiz, 1);
  assert.equal(words.star.lastReviewed, 6);
  assert.deepEqual(reviewDue(words, { clock: 7 }), ['heart'], 'star is held back for the room after its answer');
  // an older clock never moves the stamps back
  noteHeard(words, 'heart', { clock: 1 });
  assert.equal(words.heart.lastSeen, 2);
  // bad input
  for (const bad of ['', null, undefined, 4, '__proto__']) {
    assert.equal(noteQuizAnswer(words, bad, true, { clock: 1 }), null);
    assert.equal(noteReviewed(words, bad, { clock: 1 }), null);
    assert.equal(noteHeard(words, bad, { clock: 1 }), null);
  }
  assert.equal(noteQuizAnswer(null, 'heart', true, { clock: 1 }), null);
  assert.deepEqual(Object.keys(words).sort(), ['heart', 'star']);
  // the clock helpers
  const save = {};
  assert.equal(reviewAdvanceClock(save), 1);
  assert.equal(reviewAdvanceClock(save), 2);
  assert.deepEqual(reviewContext(save), { clock: 2 });
  assert.deepEqual(reviewContext({}), { clock: 1 });
}
