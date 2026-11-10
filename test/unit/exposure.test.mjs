/* test/exposure.mjs: the static counting rules, on small invented rooms, plus the real inputs it reads from the view source. */
import { computeExposure, exposureProblems, exposureReport, readObjectConst, repoInputs, summarize, renderMarkdown, THRESHOLD } from '../exposure.mjs';

const seg = (...s) => ({ say: s });
const W = id => ({ w: id });
const KIND = { h: 'heart' };
const CFG = { bunny: { max: 2 }, bunny_home: { max: 6 }, bloom: { max: 6 }, melody: { max: 99 }, note_ok: { max: 99, byN: true } };
const room = (extra = {}) => ({ id: 'r1', words: ['heart', 'door'], map: ['....', '.h.h', '....'], ...extra });
const row = (rows, w) => rows.find(r => r.word === w);

export function everyColumnIsCountedFromTheLinesThePlaybackUses({ assert }) {
  const lines = {
    learn_heart: seg('x', W('heart'), W('heart')), learn_door: seg(W('door'), W('heart')),
    ch_r1: seg(W('door')), start_r1_1: seg(W('heart')), start_r1_2: seg(W('heart'), W('door')), open_r1: seg(W('door')), clear_r1: seg(W('heart')),
  };
  const rows = computeExposure({ levels: [room()], lines, kindWord: KIND, toyCfg: CFG });
  const heart = row(rows, 'heart'), door = row(rows, 'door');
  assert.deepEqual([heart.learn, heart.chapter, heart.start, heart.open, heart.clear, heart.card], [3, 0, 2, 0, 1, 1], 'learn counts every room word\'s learn line');
  assert.deepEqual([door.learn, door.chapter, door.start, door.open, door.clear, door.card], [1, 1, 1, 1, 0, 1]);
  assert.equal(heart.inContext, 7);
  assert.equal(door.inContext, 5);
  assert.equal(door.low, door.inContext < THRESHOLD);
}

export function pickupsAreOneVoiceWordPlusThePickLineAndCycleThroughThree({ assert }) {
  const lines = { pick_heart_1: seg(W('heart')), pick_heart_2: seg('a'), pick_heart_3: seg(W('heart')) };
  const two = computeExposure({ levels: [room()], lines, kindWord: KIND, toyCfg: CFG });
  assert.equal(row(two, 'heart').pickup, (1 + 1) + (1 + 0), 'two hearts: voice.word + pick_1 (one hearing), voice.word + pick_2 (none)');
  const four = computeExposure({ levels: [room({ map: ['hhhh'] })], lines, kindWord: KIND, toyCfg: CFG });
  assert.equal(row(four, 'heart').pickup, 2 + 1 + 2 + 2, 'the 4th pickup wraps to pick_1');
  assert.equal(row(four, 'heart').inContext, row(two, 'heart').inContext, 'pickups are listed beside the in-context count, not inside it');
  assert.equal(row(four, 'door').pickup, 0, 'only the word of the picked tile gets pickup hearings');
}

export function toyLinesFollowTheViewCyclingAndCap({ assert }) {
  const lines = { toy_bunny_1: seg(W('heart')), toy_bunny_2: seg(W('door')), toy_bunny_home_1: seg(W('door')), toy_melody_1: seg(W('heart')), toy_note_ok_2: seg(W('door')), toy_note_ok_3: seg(W('door')) };
  const lv = room({ map: ['RRR.'], melody: [2, 3, 4] });
  const rows = computeExposure({ levels: [lv], lines, kindWord: {}, toyCfg: CFG });
  /* bunny: 3 events but max 2 -> toy_bunny_1, toy_bunny_2; bunny_home: 3 events, one line -> 3 plays; melody once; notes 2 and 3 exist, 4 does not */
  assert.equal(row(rows, 'heart').toy, 1 + 1);
  assert.equal(row(rows, 'door').toy, 1 + 3 + 2);
  assert.equal(row(rows, 'door').all, row(rows, 'door').inContext + row(rows, 'door').toy);
}

export function recallBelongsToTheNextRoomAndTheLastRoomHasNone({ assert }) {
  const lines = { recall_heart: seg(W('heart'), W('heart')) };
  const rows = computeExposure({ levels: [room(), room({ id: 'r2', words: ['heart'] })], lines, kindWord: {}, toyCfg: CFG });
  assert.equal(rows.find(r => r.room === 'r1' && r.word === 'heart').recall, 2);
  assert.equal(rows.find(r => r.room === 'r2').recall, 0);
}

export function aMissingLineCountsAsZeroNotAsAnError({ assert }) {
  const rows = computeExposure({ levels: [room()], lines: {}, kindWord: KIND, toyCfg: CFG });
  assert.deepEqual(rows.map(r => r.inContext), [1, 1], 'only the card remains');
}

export function theViewTablesAreReadFromTheSourceAndAMissingOneThrows({ assert }) {
  assert.deepEqual(readObjectConst('src/view/50-talk.js', 'KIND_WORD'), { h: 'heart', '*': 'snowflake', o: 'ball' });
  const toy = readObjectConst('src/view/15-toys.js', 'TY_LINES');
  assert.ok(toy.bunny.max > 0 && toy.note_ok.byN === true && toy.melody.hard === true);
  assert.throws(() => readObjectConst('src/view/50-talk.js', 'NO_SUCH_TABLE'), /no "const NO_SUCH_TABLE/);
}

export function theRealTableCoversEveryCoreWordOnceAndIsDeterministic({ assert, logic }) {
  const rows = computeExposure(repoInputs(logic));
  const expected = logic.levels.reduce((n, lv) => n + lv.words.length, 0);
  assert.equal(rows.length, expected, 'one row per core word of every room');
  assert.equal(new Set(rows.map(r => `${r.room}/${r.word}`)).size, rows.length);
  for (const r of rows) assert.ok(r.learn >= 3 && r.card === 1 && r.inContext >= 5, `${r.room}/${r.word} lost its learn line or its card`);
  assert.equal(renderMarkdown(rows), renderMarkdown(computeExposure(repoInputs(logic))));
  assert.equal(summarize(rows).words, expected);
}

export function theGateNamesEveryWordBelowTheThresholdAndAStaleDocument({ assert }) {
  const lines = { learn_heart: seg(W('heart'), W('heart'), W('heart')), learn_door: seg(W('door'), W('door'), W('door')), start_r1_1: seg(W('heart')), clear_r1: seg(W('heart')) };
  const rows = computeExposure({ levels: [room()], lines, kindWord: {}, toyCfg: CFG });
  assert.equal(row(rows, 'heart').inContext, THRESHOLD, 'a word exactly at the threshold passes');
  assert.equal(THRESHOLD, 6);
  assert.deepEqual(exposureProblems({ rows, stale: false, doc: 'x.md' }), [`r1/door: 4 in-context hearings, need at least ${THRESHOLD}`]);
  assert.deepEqual(exposureProblems({ rows: rows.filter(r => !r.low), stale: true, doc: 'x.md' }), ['x.md is stale: run node test/exposure.mjs --write']);
  const pickupsDoNotCount = computeExposure({ levels: [room({ words: ['heart'], map: ['hhhhhhhh'] })], lines: { pick_heart_1: seg(W('heart')) }, kindWord: KIND, toyCfg: CFG });
  assert.ok(row(pickupsDoNotCount, 'heart').all >= THRESHOLD && row(pickupsDoNotCount, 'heart').low, 'pickups lift "all" but never the gated in-context count');
}

/* The gate itself (PLAN-2 C1): fails the whole run when a core word has fewer than 6 in-context hearings in its own room, or when
   src/content/exposure.md is not what `node test/exposure.mjs --write` produces. */
export function everyCoreWordHasAtLeastSixInContextHearingsAndTheDocIsCurrent({ assert, logic }) {
  const problems = exposureProblems(exposureReport(logic));
  assert.deepEqual(problems, [], problems.join('\n'));
}
