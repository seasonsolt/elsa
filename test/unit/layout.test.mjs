/* Sizes and screens for tablets (PLAN-2 D1, D2, D3, PLAN-2 3.9 row "D1 / D2"; the scripted part, the real iPad is the user's).

   D2 rule: every clickable target is at least 64 CSS px on the reference tablet, 1024 x 768 landscape, where the 960 x 520 stage is as wide
   as the screen (src/lib/layout.js computes the scale). There is no browser here, so the real view files run in the fake page of
   input-safety.test.mjs and every screen's markup is captured as it is painted; the hit shape of each button / card / tile / sticker is read
   from that markup (a round button's invisible hit circle, a card's frame rect) and converted with layoutCssPx.
   The HTML parts (the touch keys, the turn-the-tablet picture) are read from art/page.template.html. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLib } from '../harness.mjs';
import { viewEnv } from './input-safety.test.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEMPLATE = fs.readFileSync(path.join(ROOT, 'art', 'page.template.html'), 'utf8');
const layout = () => loadLib(['layout'], {}, '({ LAYOUT, layoutStageWidth, layoutStageHeight, layoutCssPx, layoutHitMin, layoutRefStageWidth, layoutHitRadius, layoutPadPick, layoutPadStart })');

/** The clickable things in a piece of painted markup: [{ act, cls, size }] where size is the smaller side of the hit shape in stage units. */
function targetsIn(html) {
  const tags = [...html.matchAll(/<g\b[^>]*?(?:role="button"|\brw-item\b)[^>]*>/g)];
  return tags.map((m, k) => {
    const body = html.slice(m.index + m[0].length, k + 1 < tags.length ? tags[k + 1].index : html.length);
    const shape = [...body.matchAll(/<(?:circle|rect)\b[^>]*>/g)].map(x => x[0]).find(t => !/fill="none"/.test(t));
    const num = (tag, name) => { const v = new RegExp(`\\b${name}="([-\\d.]+)"`).exec(tag); return v ? +v[1] : NaN; };
    let size = NaN;
    if (shape && shape.startsWith('<circle')) size = 2 * num(shape, 'r');
    else if (shape) size = Math.min(num(shape, 'width'), num(shape, 'height'));
    return { act: (/data-act="([^"]*)"/.exec(m[0]) || [])[1] || (/rw-item/.test(m[0]) ? 'sticker' : '?'), cls: (/class="([^"]*)"/.exec(m[0]) || [])[1] || '', size, tag: m[0] };
  });
}

const FILES = ['00-core', '10-stage', '15-toys', '20-sisters', '30-fx', '60-story', '70-ui', '75-rewards', '80-input', '90-main'];
const EXPORTS = ['LEVELS', 'WORDS', 'save', 'showTitle', 'showRooms', 'showWordbook', 'showMeet', 'showSettings', 'showStickers', 'showWardrobe', 'buildHud',
  'showChapter', 'showRecall', 'showClear', 'showReview', 'openStory', 'get story() { return story; }'];

/** A fake page whose every painted innerHTML is recorded in `painted` ([id, html]). Restore with page.done(). */
function page(save = {}) {
  const voice = { busy: false, stop() {}, line: () => Promise.resolve(true), word: () => Promise.resolve(true), wordInfo: () => null, ui() {}, preload: () => Promise.resolve() };
  const env = viewEnv.load(FILES, { exports: EXPORTS, globals: { voice } });
  const proto = Object.getPrototypeOf(env.getEl('overlay'));
  const original = Object.getOwnPropertyDescriptor(proto, 'innerHTML');
  const painted = [];
  Object.defineProperty(proto, 'innerHTML', { configurable: true, get() { return ''; }, set(v) { painted.push([this.id, String(v)]); this.textContent = ''; } });
  const x = env.exports;
  const everything = ['hall', 'lake', 'slope', 'tower', 'spring', 'bunny', 'floe', 'music', 'ballroom', 'garden'];
  for (const id of everything) x.save.rooms[id] = { cleared: true, stars: [true, true, true], memory: true };
  x.save.unlocked.rooms = everything.length;
  for (const w of x.WORDS) x.save.words[w.id] = { heard: 8, quiz: 1, seen: true, lastSeen: 1 };
  x.save.stickers = ['hall', 'lake', 'slope', 'tower', 'spring', 'bunny', 'floe', 'music', 'ballroom', 'garden', 'hall_gold', 'lake_gold', 'slope_gold', 'tower_gold',
    'spring_gold', 'bunny_gold', 'floe_gold', 'music_gold', 'ballroom_gold', 'garden_gold', 'words5_1', 'words5_2', 'words5_3'];
  x.save.board = [{ id: 'hall', x: .3, y: .4 }];
  Object.assign(x.save, save);
  return { env, x, painted, done() { Object.defineProperty(proto, 'innerHTML', original); } };
}

const html = p => p.painted.map(([, h]) => h).join('\n');

export function theSizeRuleIsPlainNumbers({ assert }) {
  const L = layout();
  assert.equal(L.LAYOUT.minHitCss, 64);
  assert.equal(L.LAYOUT.touchKeyCss, 72);
  assert.equal(L.layoutRefStageWidth(), 1024, 'at 1024 x 768 landscape (touch pad showing) the stage is as wide as the screen');
  assert.equal(L.layoutCssPx(960, 1024), 1024);
  assert.equal(L.layoutHitMin(), 60, '60 stage units are 64 CSS px there');
  assert.equal(L.layoutCssPx(L.layoutHitMin(), L.layoutRefStageWidth()), 64);
  assert.equal(L.layoutHitRadius(26, false), 30, 'a small plate gets a bigger hit area');
  assert.equal(L.layoutHitRadius(26, true), 34, 'a hold ring widens it');
  assert.equal(L.layoutHitRadius(66, false), 66, 'a big plate keeps its own size');
  /* the formula fitStage used before the move: the same widths, so the stage fits as it did */
  for (const [w, h] of [[1280, 720], [1440, 900], [1920, 1080], [1024, 600], [320, 200], [900, 800]]) {
    assert.equal(L.layoutStageWidth(w, h), Math.max(240, Math.floor(Math.min(w, h * (960 / 520)))));
  }
  assert.equal(L.layoutStageHeight(900), Math.round(900 / (960 / 520)));
}

export function everyScreensButtonIsAtLeast64CssPxOnTheReferenceTablet({ assert }) {
  const L = layout(), stageW = L.layoutRefStageWidth();
  const p = page();
  try {
    const { x } = p;
    x.showTitle(); x.showRooms(); x.showWordbook(0); x.showWordbook(5); x.showMeet(); x.showSettings(); x.showSettings('progress');
    x.showStickers(0); x.showStickers(1); x.showWardrobe();
    x.save.flags.prologue = false; x.showTitle(); x.save.flags.prologue = true;
    x.buildHud();
    x.openStory([{ art: 'key', vo: 'p1' }, { art: 'key', vo: 'p2' }], () => {});
    const all = targetsIn(html(p));
    assert.ok(all.length > 60, `a lot of targets were painted (${all.length})`);
    const acts = new Set(all.map(t => t.act));
    for (const a of ['play', 'rooms', 'words', 'stickers', 'meet', 'gear', 'wardrobe', 'back', 'room', 'prev', 'nextpage', 'review', 'word', 'set', 'progress', 'close',
      'hint', 'fs', 'home', 'restart', 'person', 'sticker', 'next']) assert.ok(acts.has(a), `${a} was on a painted screen`);
    const small = all.filter(t => !(L.layoutCssPx(t.size, stageW) >= L.LAYOUT.minHitCss));
    assert.deepEqual(small.map(t => `${t.act} ${t.size}`), [], 'no target is smaller than 64 CSS px (NaN counts as a failure: the hit shape was not found)');
  } finally { p.done(); }
}

export async function theScenesButtonsAreBigEnoughToo({ assert }) {
  const L = layout(), stageW = L.layoutRefStageWidth();
  const checked = [];
  for (const scene of ['chapter', 'recall', 'clear', 'quiz', 'review']) {
    const p = page();
    try {
      const { x, env } = p;
      const none = () => {};
      if (scene === 'chapter') x.showChapter(x.LEVELS[1], none);
      else if (scene === 'recall') x.showRecall(x.LEVELS[0], none);
      else if (scene === 'review') x.showReview(none);
      else x.showClear(x.LEVELS[1], none);
      await env.clock.advance(300);
      if (scene === 'quiz') {
        await env.clock.advance(1200);
        env.keydown('Enter'); await env.clock.advance(3000);
        env.keydown('Enter'); await env.clock.advance(500);
      } else if (scene === 'clear') {
        await env.clock.advance(8000);   // through the star page and the word cards to the finish page
        env.keydown('Enter'); await env.clock.advance(300);
      }
      if (scene === 'review') await env.clock.advance(1500);
      const targets = targetsIn(html(p));
      assert.ok(targets.length >= 2, `${scene}: buttons were painted (${targets.length})`);
      for (const t of targets) assert.ok(L.layoutCssPx(t.size, stageW) >= L.LAYOUT.minHitCss, `${scene}: ${t.act} is ${L.layoutCssPx(t.size, stageW).toFixed(1)} CSS px`);
      checked.push(scene);
    } finally { p.done(); }
  }
  assert.equal(checked.length, 5);
}

export function theHudButtonsDoNotCrowdEachOther({ assert }) {
  const p = page();
  try {
    p.x.buildHud();
    const hudHtml = p.painted.filter(([id]) => id === 'hud').map(([, h]) => h).join('');
    const buttons = [...hudHtml.matchAll(/<g transform="translate\(([\d.]+) ([\d.]+)\)"><g class="ux-btn[^"]*" data-act="(\w+)"[\s\S]*?<circle r="([\d.]+)" fill="#000"/g)]
      .map(m => ({ act: m[3], x: +m[1], r: +m[4] }));
    assert.deepEqual(buttons.map(b => b.act), ['restart', 'home', 'hint', 'fs']);
    for (let i = 1; i < buttons.length; i++) {
      const gap = buttons[i].x - buttons[i - 1].x - buttons[i].r - buttons[i - 1].r;
      assert.ok(gap > -10, `${buttons[i - 1].act} and ${buttons[i].act}: touch areas overlap by at most the hold ring (${gap})`);
      assert.ok(buttons[i].x - buttons[i - 1].x >= 68, 'and the plates are 68 apart or more');
    }
    assert.ok(buttons[3].x + buttons[3].r <= 960, 'the last one is on the stage');
  } finally { p.done(); }
}

export function theTitleHasFourMainButtonsAndTwoSmallOnes({ assert }) {
  for (const returning of [false, true]) {
    const p = page();
    try {
      p.x.save.flags.prologue = returning;
      p.painted.length = 0;
      p.x.showTitle();
      const t = targetsIn(html(p));
      const main = t.filter(b => !/\bux-minor\b/.test(b.cls)).map(b => b.act).sort();
      assert.deepEqual(main, ['play', 'rooms', 'stickers', 'words'], 'start, rooms, wordbook, sticker book');
      assert.deepEqual(t.filter(b => /\bux-minor\b/.test(b.cls)).map(b => b.act).sort(), ['gear', 'meet'], 'the sisters page and the parent gear are small corner buttons');
      assert.ok(!t.some(b => b.act === 'wardrobe'), 'the wardrobe is not on the title');
      const gear = t.find(b => b.act === 'gear'), play = t.find(b => b.act === 'play');
      assert.ok(gear.size < play.size / 2, 'the gear is small');
    } finally { p.done(); }
  }
}

export function theWardrobeIsAButtonOnTheMeetTheSistersPage({ assert }) {
  const p = page();
  try {
    p.painted.length = 0;
    p.x.showMeet();
    const t = targetsIn(html(p));
    assert.ok(t.some(b => b.act === 'wardrobe'), 'meet has the wardrobe button');
    assert.deepEqual(t.filter(b => b.act === 'person').length, 2, 'next to the two sisters');
  } finally { p.done(); }
}

export function thePadPicksTheNeighbourInTheDirectionPressed({ assert }) {
  const { layoutPadPick: pick, layoutPadStart: start } = layout();
  /* a title: big play button in the middle, three below, a small one in each lower corner */
  const R = (x, y, w = 100, h = 100, extra = {}) => ({ x, y, w, h, ...extra });
  const rects = [R(430, 250, 140, 140, { pulse: true }), R(320, 400), R(430, 400), R(540, 400), R(10, 440, 60, 60), R(890, 440, 60, 60)];
  assert.equal(start(rects), 0, 'the pulsing button first');
  assert.equal(start(rects.map(r => ({ ...r, pulse: false }))), 0, 'else the first');
  assert.equal(start([]), -1);
  assert.equal(pick('d', 0, rects), 2, 'down from play: the one straight below');
  assert.equal(pick('r', 1, rects), 2);
  assert.equal(pick('r', 2, rects), 3);
  assert.equal(pick('l', 2, rects), 1);
  assert.equal(pick('r', 3, rects), 5, 'past the last of the row: the corner button');
  assert.equal(pick('l', 1, rects), 4);
  assert.equal(pick('u', 2, rects), 0);
  assert.equal(pick('u', 0, rects), -1, 'nothing above play');
  assert.equal(pick('d', 2, rects), -1, 'nothing below the row');
  assert.equal(pick('r', 5, rects), -1);
  assert.equal(pick('r', 99, rects), -1, 'a stale index picks nothing');
  /* a grid of room tiles: straight up and down keep the column */
  const tiles = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) tiles.push(R(40 + c * 200, 80 + r * 120, 176, 99));
  assert.equal(pick('d', 1, tiles), 5);
  assert.equal(pick('u', 10, tiles), 6);
  assert.equal(pick('r', 3, tiles), -1, 'no wrap round the row end');
  assert.equal(pick('r', 5, tiles), 6);
}

/* ---- art/page.template.html ---- */
const cssBlock = selector => {
  const m = new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\#]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(TEMPLATE);
  return m ? m[1] : '';
};
const px = (block, prop) => { const m = new RegExp(`(?:^|[;\\s])${prop}:\\s*([\\d.]+)px`).exec(block); return m ? +m[1] : NaN; };

export function theTouchKeysAre72PxEachWayAndSwallowTheSystemMenu({ assert }) {
  const keys = cssBlock('#touch button');
  assert.ok(px(keys, 'min-height') >= 72, `touch keys are at least 72 px tall (${px(keys, 'min-height')})`);
  assert.ok(px(keys, 'min-width') >= 72, 'and 72 px wide');
  assert.match(keys, /touch-action:\s*none/);
  assert.match(keys, /-webkit-touch-callout:\s*none/, 'no iOS callout on a long press');
  assert.match(keys, /user-select:\s*none/);
  const ids = [...TEMPLATE.matchAll(/<button id="(t\w+)"/g)].map(m => m[1]);
  assert.deepEqual(ids, ['tLeft', 'tRight', 'tJump', 'tAct', 'tSwitch']);
  assert.match(cssBlock('#stage'), /-webkit-touch-callout:\s*none/, 'nor on the stage (held hud buttons)');
}

export function aPortraitScreenShowsOnlyAPictureAndHidesTheGame({ assert }) {
  const m = /@media \(orientation: portrait\) \{([\s\S]*?)\n\}/.exec(TEMPLATE);
  assert.ok(m, 'there is a portrait rule');
  assert.match(m[1], /#turn\s*\{\s*display:\s*flex/, 'it shows the hint');
  const hidden = /([^{}]*)\{\s*display:\s*none\s*!important/.exec(m[1]);
  assert.ok(hidden, 'and hides things');
  for (const sel of ['#stage', '#touch', '#info']) assert.ok(hidden[1].includes(sel), `${sel} is hidden in portrait (so no game button can be pressed)`);
  assert.match(cssBlock('#turn'), /display:\s*none/, 'in landscape the hint is off');
  const turn = /<div id="turn"[^>]*>([\s\S]*?)<\/div>/.exec(TEMPLATE);
  assert.ok(turn, 'the hint is in the page');
  assert.doesNotMatch(turn[1], /<text\b/, 'a picture: no text element');
  assert.equal(turn[1].replace(/<[^>]*>/g, '').trim(), '', 'and no text at all');
  assert.ok(turn[1].includes('class="tablet"'), 'a tablet that turns');
}

export function theStageAndTheKeysDoNotNeedAMouse({ assert }) {
  assert.match(TEMPLATE, /<html lang="zh-CN">/);
  assert.match(TEMPLATE, /<g id="padFocus"[^>]*pointer-events="none"/, 'the gamepad ring never takes a click');
}
