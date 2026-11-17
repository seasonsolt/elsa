/* Lazy picture loading (PLAN-2 D4). The plan is the pure src/lib/assets.js: this file adds up real file sizes against the 2 MB budget
   (3.9 row "D4"), checks that every picture a list names exists and that no picture of game/ is left out of the story without being
   named as on-demand here, and runs the real 00-core / 90-main in a fake page to see which pictures are requested when. */
import fs from 'node:fs';
import path from 'node:path';
import { viewEnv } from './input-safety.test.mjs';

const budget = 2_000_000;

function plan(ROOT, loadLib, loadLogic, opts) {
  const lib = loadLib(['assets'], {}, '({ assetPlan, roomArt, ART_TITLE, outfitArt })');
  const logic = loadLogic();
  const lines = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'content', 'lines.json'), 'utf8'));
  return { lib, levels: logic.LEVELS, lines, p: lib.assetPlan(logic.LEVELS, lines, opts) };
}
const bytes = (ROOT, names) => names.reduce((n, name) => n + fs.statSync(path.join(ROOT, 'game', `${name}.webp`)).size, 0);

export function theTitleSetStaysUnderTwoMegabytesOfImages({ assert, ROOT, loadLib, loadLogic }) {
  const { p } = plan(ROOT, loadLib, loadLogic);
  const size = bytes(ROOT, p.title);
  assert.ok(size <= budget, `the pictures decoded before the title is interactive are ${size} bytes, the budget is ${budget} (it was 6.5 MB when everything loaded at once)`);
  const total = fs.readdirSync(path.join(ROOT, 'game')).filter(f => f.endsWith('.webp')).reduce((n, f) => n + fs.statSync(path.join(ROOT, 'game', f)).size, 0);
  assert.ok(size < total / 3, 'and the title set is a small part of all pictures');
}

export function everyPictureOfThePlanExistsAndNoListRepeatsAName({ assert, ROOT, loadLib, loadLogic }) {
  const { p, levels } = plan(ROOT, loadLib, loadLogic, { wear: { frost: { dress: 1, hat: 'crown' }, nuan: { dress: 2, hat: null } } });
  const lists = { title: p.title, prologue: p.prologue, ending: p.ending, ...Object.fromEntries(p.rooms.map((r, i) => [`room ${levels[i].id}`, r])) };
  for (const [what, names] of Object.entries(lists)) {
    assert.equal(new Set(names).size, names.length, `${what}: no name twice`);
    for (const n of names) assert.ok(fs.existsSync(path.join(ROOT, 'game', `${n}.webp`)), `${what}: game/${n}.webp exists`);
  }
  assert.equal(p.rooms.length, levels.length, 'one list per room');
  assert.ok(p.prologue.includes('story_prologue') && p.ending.includes('story_thaw'), 'prologue and ending paintings come from the story lines');
}

export function theTitleSetHoldsTheUiTheSistersAndTheFirstRoomButNoLaterRoom({ assert, ROOT, loadLib, loadLogic }) {
  const { p, lib, levels } = plan(ROOT, loadLib, loadLogic);
  const title = new Set(p.title);
  const files = fs.readdirSync(path.join(ROOT, 'game')).filter(f => f.endsWith('.webp')).map(f => f.slice(0, -5));
  for (const n of files.filter(f => f.startsWith('ui_'))) assert.ok(title.has(n), `${n}: every UI picture is in the title set`);
  for (const who of ['frost', 'nuan']) for (const f of ['idle', 'blink', 'run1', 'run6', 'jump', 'fall', 'cast', 'cheer']) assert.ok(title.has(`${who}_${f}`), `${who}_${f}: the sisters are drawn from the first frame`);
  const firstRoom = lib.roomArt(levels[0], plan(ROOT, loadLib, loadLogic).lines).filter(n => !/^(word_|sticker_|mem_)/.test(n));
  for (const n of firstRoom) assert.ok(title.has(n), `${n}: what the first room draws is in the title set`);
  for (const n of p.title) assert.ok(!/^(tile_slope_|spring_|floe_|note_|flower_|bunny_|fish_|mem_|story_|word_|sticker_|hat_|bg_|bg[1-9])/.test(n), `${n}: a later room's or a story picture is not in the title set`);
  assert.ok(!p.title.some(n => /_d[12]$/.test(n)), 'no outfit frame without a worn outfit');
}

export function eachRoomListsItsOwnBackgroundTilesToysMemoryAndWords({ assert, ROOT, loadLib, loadLogic }) {
  const { p, levels, lines } = plan(ROOT, loadLib, loadLogic);
  levels.forEach((lv, i) => {
    const room = new Set(p.rooms[i]);
    assert.ok(room.has(lv.bg), `${lv.id}: background ${lv.bg}`);
    for (const w of lv.words) assert.ok(room.has(`word_${w}`), `${lv.id}: word icon ${w}`);
    assert.ok(room.has(lines.lines[`mem_${lv.memoryId}`].art), `${lv.id}: memory painting`);
    assert.ok(room.has(`sticker_${lv.id}`), `${lv.id}: its sticker (the clear page awards it)`);
    const chars = new Set([lv, ...(lv.more || [])].map(sc => sc.map.join('')).join(''));   // every screen of the room
    const has = (ch, name) => assert.equal(room.has(name), chars.has(ch), `${lv.id}: ${name} iff the map has '${ch}'`);
    has('\\', 'tile_slope_r'); has('/', 'tile_slope_l'); has('J', 'spring_0'); has('M', 'floe_m'); has('R', 'bunny_hop1'); has('N', 'bunny_nest'); has('F', 'flower_2');
    has('G', 'gate'); has('S', 'snowman');
    for (let n = 1; n <= 5; n++) has(String(n), `note_${n}_lit`);
    assert.equal(room.has('fish_1'), lv.words.includes('fish'), `${lv.id}: the lake fish`);
    assert.equal(room.has('story_thaw'), i === levels.length - 1, `${lv.id}: the ending painting loads with the last room only`);
  });
}

export function wornOutfitsAndRecallWordsAreAddedToTheLists({ assert, ROOT, loadLib, loadLogic }) {
  const { lib, levels, lines } = plan(ROOT, loadLib, loadLogic);
  const wear = { frost: { dress: 2, hat: 'crown' }, nuan: { dress: 0, hat: null } };
  const withWear = lib.assetPlan(levels, lines, { wear });
  assert.ok(withWear.title.includes('frost_run3_d2') && withWear.title.includes('hat_crown'), 'the worn dress and hat of Elsa are fetched with the title set');
  assert.ok(!withWear.title.some(n => n.startsWith('nuan_') && /_d\d$/.test(n)), 'Anna wears none');
  assert.ok(!withWear.title.includes('frost_run3_d1'), 'the dress she does not wear stays on the server');
  const extra = lib.roomArt(levels[2], lines, { extraWords: ['door', 'heart'] });
  assert.ok(extra.includes('word_door') && extra.includes('word_heart'), 'the older words of a recall card get their icons');
  assert.equal(lib.outfitArt(undefined).length, 0, 'no save, no outfit');
}

export function everyPictureInGameIsInThePlanOrNamedOnDemandHere({ assert, ROOT, loadLib, loadLogic }) {
  const { p } = plan(ROOT, loadLib, loadLogic);
  const named = new Set([...p.title, ...p.prologue, ...p.ending, ...p.rooms.flat()]);
  // loaded when the child opens the page that shows them (word book, sticker book, wardrobe, review game) or wears them
  const onDemand = /^(word_|sticker_|hat_|.*_d[12]$)/;
  const spare = new Set(['floe', 'tile_slope_l']);   // painted, but no code or map uses them (tile_slope_l: no room has a '/' ramp yet; roomArt would load it)
  const loose = fs.readdirSync(path.join(ROOT, 'game')).filter(f => f.endsWith('.webp')).map(f => f.slice(0, -5)).filter(n => !named.has(n) && !onDemand.test(n) && !spare.has(n));
  assert.deepEqual(loose, [], 'a picture that no list names and that is not an on-demand kind: add it to src/lib/assets.js (or to the on-demand kinds in this test)');
}

/* ---------- the real 00-core and 90-main in a fake page ---------- */
const FILES = ['00-core', '10-stage', '15-toys', '20-sisters', '30-fx', '80-input', '90-main'];
const EXPORTS = ['enterRoom', 'startGame', 'playFlow', 'save', 'tyStats', 'loadArt', 'artStats', 'ART', 'LEVELS'];

/** An Image whose decode() and onload wait for the test: gate.release() lets every pending one finish (the network answering). */
function gatedImage(gate) {
  return class {
    constructor() { gate.imgs.push(this); }
    set src(v) { this._src = v; gate.srcs.push(v); if (gate.open) Promise.resolve().then(() => this.onload && this.onload()); }
    get src() { return this._src; }
    decode() { return gate.open ? Promise.resolve() : new Promise(ok => gate.waiting.push(ok)); }
  };
}
const gate = () => ({
  open: false, srcs: [], waiting: [], imgs: [],
  release() { this.open = true; this.waiting.splice(0).forEach(f => f()); for (const im of this.imgs) if (im.onload) Promise.resolve().then(() => im.onload()); },
});
const names = srcs => srcs.map(u => u.replace(/^game\//, '').replace(/\.webp.*$/, ''));

export async function theFakePageRequestsOnlyTheTitleSetBeforeTheTitleIsInteractive({ assert, ROOT }) {
  const env = viewEnv.load(FILES, { exports: EXPORTS });
  const { ART } = env.exports;
  await env.clock.settle();
  const asked = names(env.requested);
  assert.deepEqual([...asked].sort(), [...ART.title].sort(), 'exactly the title set was requested');
  const size = asked.reduce((n, a) => n + fs.statSync(path.join(ROOT, 'game', `${a}.webp`)).size, 0);
  assert.ok(size <= budget, `${size} bytes of images requested at load, at most ${budget}`);
  for (const n of ['bg1', 'bg_slope', 'tile_slope_r', 'mem_door', 'story_prologue', 'word_heart', 'frost_idle_d1']) assert.ok(!asked.includes(n), `${n} is not requested yet`);
}

export async function aRoomsPicturesAreRequestedBeforeItIsDrawnAndDecodedBeforePlayBegins({ assert }) {
  const g = gate();
  let recallDone = null, chapterDone = null;
  const env = viewEnv.load(FILES, { exports: EXPORTS, globals: { Image: gatedImage(g), showRecall: (lv, done) => { recallDone = done; }, showChapter: (lv, done) => { chapterDone = done; } } });
  const { enterRoom, playFlow, tyStats, LEVELS: levels } = env.exports;
  g.release();                                      // the title set arrives
  await env.clock.settle();
  g.open = false;
  const before = g.srcs.length;
  playFlow.phase = 'title';
  const slope = levels.findIndex(lv => lv.id === 'slope');
  enterRoom(slope);
  await env.clock.settle();
  const asked = names(g.srcs.slice(before));
  for (const n of ['bg_slope', 'tile_slope_r', 'word_slide', 'word_fast', 'word_down', 'mem_m5', 'sticker_slope']) assert.ok(asked.includes(n), `${n} is requested as the room is entered`);
  assert.ok(!asked.some(n => /^(bg_music|bg_garden|floe_|note_|flower_|story_thaw)/.test(n)), 'and nothing of the other rooms');
  assert.equal(playFlow.phase, 'intro', 'the recall card (or the chapter card) is up, play has not begun');
  g.release();                                      // the room arrives while the cards are up
  await env.clock.settle();
  if (recallDone) { recallDone(); await env.clock.settle(); }
  assert.equal(playFlow.phase, 'intro', 'the chapter card is still up');
  chapterDone();
  await env.clock.settle();
  assert.equal(playFlow.phase, 'play', 'the cards closed with the pictures decoded: play begins at once');
  assert.equal(tyStats.replaced, 0, 'no vector stand-in was drawn and later replaced by a picture (the DEV counter of PLAN-2 3.9)');
}

export async function aSlowNetworkDelaysPlayByAtMostOnePatienceAndNeverStrandsTheChild({ assert }) {
  const g = gate();
  let chapterDone = null;
  const env = viewEnv.load(FILES, { exports: EXPORTS, globals: { Image: gatedImage(g), showChapter: (lv, done) => { chapterDone = done; } } });
  const { enterRoom, playFlow } = env.exports;
  g.release(); await env.clock.settle(); g.open = false;      // the title set is in, the next pictures never arrive
  playFlow.phase = 'title';
  enterRoom(0);
  await env.clock.settle();
  chapterDone();
  await env.clock.advance(1000);
  assert.equal(playFlow.phase, 'intro', 'play waits for the pictures a moment');
  await env.clock.advance(700);
  assert.equal(playFlow.phase, 'play', 'but not longer than the patience of 1.5 s: a slow network never strands the child');
}

export async function thePrologueOpensWhenItsPaintingsAreDecodedOrThePatienceIsUp({ assert }) {
  for (const arrives of [true, false]) {
    const g = gate();
    const opened = [];
    const env = viewEnv.load(FILES, { exports: EXPORTS, globals: { Image: gatedImage(g), openStory: pages => { opened.push(pages.map(p => p.art)); }, hideTitle() {} } });
    const { startGame, save } = env.exports;
    g.release(); await env.clock.settle(); g.open = false;
    save.flags.prologue = false;
    startGame(0);
    await env.clock.settle();
    assert.equal(opened.length, 0, 'not before the paintings are in');
    assert.ok(names(g.srcs).includes('story_prologue') && names(g.srcs).includes('story_winter'), 'the prologue paintings are requested when the child presses play');
    if (arrives) g.release(); else await env.clock.advance(1600);
    await env.clock.settle();
    assert.equal(opened.length, 1, arrives ? 'opens once they are decoded' : 'opens after the patience');
  }
}

export async function aFailedPictureIsAskedForAgainNextTime({ assert }) {
  let fail = true;
  const asked = [];
  class Flaky { set src(v) { asked.push(v); } decode() { return fail ? Promise.reject(new Error('net')) : Promise.resolve(); } }
  const env = viewEnv.load(['00-core'], { exports: ['loadArt', 'artStats', 'artPending'], globals: { Image: Flaky } });
  const { loadArt, artStats, artPending } = env.exports;
  await loadArt(['bg_music']);
  assert.equal(artStats.failed, 1);
  assert.equal(artPending('bg_music'), false, 'a failed picture is not "on its way"');
  fail = false;
  await loadArt(['bg_music', 'bg_music']);
  assert.equal(asked.length, 2, 'the second call fetched it once more (and the repeated name only once)');
  await loadArt(['bg_music']);
  assert.equal(asked.length, 2, 'a decoded picture is not fetched again');
}
