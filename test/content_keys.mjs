#!/usr/bin/env node
/* Content key check: every voice line the view can ask for must exist in src/content/lines.json.

     node test/content_keys.mjs          standalone
     (also run by test/run.mjs as "content keys")

   How it works. The view builds line keys from prefixes (`'ch_' + lv.id`, `start_${lv.id}_${n}`, ...). This file lists the key
   FAMILIES the view plays and expands each one over the real rooms (src/levels.js) and words (src/content/words.json).
   Both directions are checked, so neither side can drift without a failure:
     1. every key of every family exists in lines.json (all rooms, all words, all variation numbers the view can pick)
     2. every family is still played by the view source (a stale entry here means a renamed prefix there)
     3. every string literal in src/view/*.js that looks like a line key is covered by a family or by the allow list
   Also: hover names (`ui: 'x'` in the view) have `ui_x`, `{"w"}` ids exist in words.json, every `art` image exists in game/,
   every word icon exists, and the guide keys of levels.js exist. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLogic } from './harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* variation counts: the largest n the view may ask for (50-talk counts keys until the first gap, 60-story cycles 1..3 / 1..4) */
const RANGES = { star: 5, splash: 2, idle: 2, together: 1, quiz_right: 3, quiz_wrong: 3, cheer: 4, pick: 3, start: 1 };
const PICK_WORDS = { h: 'heart', '*': 'snowflake', o: 'ball' };   // 50-talk KIND_WORD: collect kind -> word

/* Each family: `src` finds it in the view source, `keys(ctx)` lists what it can play. */
const FAMILIES = [
  { name: 'prologue', src: /'p1'[\s\S]*'p2'[\s\S]*'p3'/, keys: () => ['p1', 'p2', 'p3'] },
  { name: 'ending', src: /\['win', 'end'\]/, keys: () => ['win', 'end'] },
  { name: 'tutorial', src: /tutor_move[\s\S]*tutor_jump[\s\S]*tutor_magic/, keys: () => ['tutor_move', 'tutor_jump', 'tutor_magic'] },
  { name: 'fullscreen tip', src: /tutor_fullscreen/, keys: () => ['tutor_fullscreen'] },
  { name: 'chapter card', src: /'ch_' \+ lv\.id/, keys: c => c.levels.map(l => `ch_${l.id}`) },
  { name: 'clear page', src: /'clear_' \+ lv\.id/, keys: c => c.levels.map(l => `clear_${l.id}`) },
  { name: 'door open', src: /'open_' \+ /, keys: c => c.levels.map(l => `open_${l.id}`) },
  { name: 'room start', src: /`start_\$\{lv\.id\}_\$\{n\}`/, keys: c => c.levels.flatMap(l => nums(RANGES.start).map(n => `start_${l.id}_${n}`)) },
  { name: 'word intro', src: /'learn_' \+ /, keys: c => c.levels.flatMap(l => l.words.map(w => `learn_${w}`)) },
  { name: 'word recall', src: /'recall_' \+ /, keys: c => c.levels.flatMap(l => l.words.map(w => `recall_${w}`)) },
  { name: 'quiz question', src: /'quiz_' \+ target\.id/, keys: c => c.levels.flatMap(l => l.words.map(w => `quiz_${w}`)) },
  { name: 'quiz right', src: /'quiz_right_' \+ /, keys: () => nums(RANGES.quiz_right).map(n => `quiz_right_${n}`) },
  { name: 'quiz wrong', src: /'quiz_wrong_' \+ /, keys: () => nums(RANGES.quiz_wrong).map(n => `quiz_wrong_${n}`) },
  { name: 'cheer', src: /'cheer_' \+ /, keys: () => nums(RANGES.cheer).map(n => `cheer_${n}`) },
  { name: 'pick word', src: /`pick_\$\{w\}_\$\{/, keys: c => c.pickWords.flatMap(w => nums(RANGES.pick).map(n => `pick_${w}_${n}`)) },
  { name: 'small star', src: /'star_' \+ n/, keys: () => nums(RANGES.star).map(n => `star_${n}`) },
  { name: 'splash', src: /'splash_/, keys: () => nums(RANGES.splash).map(n => `splash_${n}`) },
  { name: 'idle', src: /'idle_'/, keys: () => nums(RANGES.idle).map(n => `idle_${n}`) },
  { name: 'together', src: /'together_'/, keys: () => nums(RANGES.together).map(n => `together_${n}`) },
  { name: 'miss', src: /'miss_' \+ /, keys: () => ['miss_frost', 'miss_nuan'] },
  { name: 'memory', src: /'mem_' \+ e\.id/, keys: c => c.levels.filter(l => l.memoryId).map(l => `mem_${l.memoryId}`) },
  { name: 'meet them', src: /'me_' \+ who/, keys: () => ['me_frost', 'me_nuan'] },
  { name: 'guide', src: /tgt\.say/, keys: c => c.levels.flatMap(l => (l.guide || []).map(g => g.say)) },
  { name: 'toy reaction', src: /`toy_\$\{family\}_/, keys: () => TOY_LINES.flatMap(([f, n]) => nums(n).map(i => `toy_${f}_${i}`)) },
  { name: 'hover names', src: /line\('ui_' \+ name/, keys: c => c.uiNames.map(n => `ui_${n}`) },
];
/* 15-toys plays toy_<family>_<n> (n = 1.. until the first gap; note_ok uses the note number 1..5): [family, how many the view may reach] */
const TOY_LINES = [['slide', 1], ['bounce', 1], ['bunny', 1], ['bunny_home', 1], ['floe', 1], ['note_ok', 5], ['note_wrong', 1], ['melody', 1], ['bloom', 1]];
const nums = n => Array.from({ length: n }, (_, i) => i + 1);

/* Literals that look like line keys but are not (sfx names, image names, game states, music themes). Each has a reason. */
const NOT_A_LINE = new Map([
  ['quiz_right', 'sfx name'], ['quiz_wrong', 'sfx name'], ['quiz_skip', 'hover name, covered by the ui_ family'],
  ['ui_key_', 'image name prefix (ui_key_left ...)'], ['win', 'game state / music theme'], ['end', 'music theme'],
  ['star_', 'prefix, joined with n'], ['splash_', 'prefix, joined with n'], ['idle_', 'prefix, joined with n'], ['together_', 'prefix, joined with n'],
  ['open_', 'prefix, joined with the room id'], ['miss_', 'prefix, joined with the player id'], ['mem_', 'prefix, joined with the memory id'],
  ['me_', 'prefix, joined with the sister id'], ['ui_', 'prefix, joined with the hover name'],
]);
const KEYISH = /^(p[123]|win|end|tutor_|ch_|learn_|recall_|start_|guide_|pick_|star_|open_|clear_|quiz_|splash_|idle_|miss_|together_|mem_|me_|ui_|cheer_|toy_)/;

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
}

export function checkContentKeys(logic = loadLogic()) {
  const problems = [];
  const lines = JSON.parse(read('src/content/lines.json')).lines || {};
  const words = JSON.parse(read('src/content/words.json'));
  const wordIds = new Set(words.map(w => w.id));
  const viewDir = path.join(ROOT, 'src/view');
  const view = fs.readdirSync(viewDir).filter(f => f.endsWith('.js')).sort().map(f => [f, stripComments(read(`src/view/${f}`))]);
  const all = view.map(v => v[1]).join('\n');

  /* hover names: `ui: 'x'` / `ui: cond ? 'a' : 'b'` anywhere in the view, plus the per-room tiles */
  const uiNames = new Set();
  for (const m of all.matchAll(/\bui:\s*([^,}]+)/g)) for (const q of m[1].matchAll(/'([a-z_]+)'/g)) uiNames.add(q[1]);
  if (/data-ui="room_\$\{lv\.id\}"/.test(all)) for (const l of logic.levels) uiNames.add(`room_${l.id}`);
  if (!uiNames.size) problems.push('found no hover names (ui: ...) in src/view: the scanner is stale');

  /* which words a room's items can speak */
  const pickWords = new Set();
  for (const lv of logic.levels) for (const row of lv.map) for (const ch of row) if (PICK_WORDS[ch]) pickWords.add(PICK_WORDS[ch]);
  const ctx = { levels: logic.levels, uiNames: [...uiNames], pickWords: [...pickWords] };

  const covered = new Set();
  for (const f of FAMILIES) {
    if (!f.src.test(all)) { problems.push(`family "${f.name}": the view no longer plays it (pattern ${f.src}); update test/content_keys.mjs`); continue; }
    for (const k of f.keys(ctx)) {
      covered.add(k);
      if (!lines[k]) problems.push(`family "${f.name}": lines.json has no "${k}"`);
    }
  }

  /* 3. literals in the view that look like line keys */
  for (const [file, text] of view) {
    for (const m of text.matchAll(/(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g)) {
      const s = m[2];
      if (!KEYISH.test(s) || /[\s.:/#]/.test(s) || /^[A-Z]/.test(s)) continue;
      if (NOT_A_LINE.has(s)) continue;
      if (lines[s] || covered.has(s)) continue;
      if (/\$\{/.test(s) || s.endsWith('_')) {   // a template or a prefix: the text around it must match one of the families above
        const around = text.slice(m.index, m.index + 80);
        if (!FAMILIES.some(f => f.src.test(around))) problems.push(`${file}: key ${m[0]} is not covered by any family in test/content_keys.mjs`);
        continue;
      }
      problems.push(`${file}: literal ${m[0]} looks like a line key but is neither in lines.json nor a known family`);
    }
  }

  /* 4. line contents */
  const images = new Set(fs.readdirSync(path.join(ROOT, 'game')).filter(f => f.endsWith('.webp')).map(f => f.replace(/\.webp$/, '')));
  for (const [k, def] of Object.entries(lines)) {
    if (!Array.isArray(def.say) || !def.say.length) { problems.push(`line "${k}" has no say[]`); continue; }
    for (const s of def.say) if (s && typeof s === 'object' && s.w !== undefined && !wordIds.has(s.w)) problems.push(`line "${k}": unknown word id "${s.w}"`);
    if (def.art && !images.has(def.art)) problems.push(`line "${k}": art "${def.art}" is not in game/`);
  }
  for (const lv of logic.levels) {
    if (!images.has(lv.bg)) problems.push(`room ${lv.id}: bg "${lv.bg}" is not in game/`);
    for (const w of lv.words) {
      const wd = words.find(x => x.id === w);
      if (!wd) problems.push(`room ${lv.id}: word "${w}" is not in words.json`);
      else if (!images.has(wd.icon)) problems.push(`word ${w}: icon "${wd.icon}" is not in game/`);
    }
  }
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const problems = checkContentKeys();
  if (problems.length) { console.error(problems.map(p => `FAIL ${p}`).join('\n')); process.exit(1); }
  console.log('content keys ok');
}
