#!/usr/bin/env node
/* Word exposure report (PLAN-2 B7): for every room and every core word, how often the child hears the word IN CONTEXT on a normal
   playthrough, counted statically from src/content/lines.json, src/content/words.json, src/levels.js and the way the view plays lines.

     node test/exposure.mjs              print the table and the summary
     node test/exposure.mjs --write      also regenerate src/content/exposure.md (never edit that file by hand)
     node test/exposure.mjs --check      exit 1 when a core word is below the threshold (6) or exposure.md is stale
   This is a gate (PLAN-2 C1): test/run.mjs prints the table, and test/unit/exposure.test.mjs fails the run on the same problems
   (exposureProblems below). The threshold counts "in-context" only; pickups and toy lines never make up for a short room.

   What counts as one hearing: one {"w": id} segment of a line the view plays, or one voice.word(id) call. The playthrough is the
   normal one: chapter card watched, every start line played, every required item picked up, door opened, clear page watched once.
   Not counted: the quiz (skippable), small stars, stuck hints and the hint bulb, splash / idle lines, the clear page's top-up round
   (a repeated bare word, not a context; 2C removes it), word-book taps.
     learn    learn_<w> of every room word, played one after the other on the chapter card (the word's own line carries it 3 times)
     chapter  ch_<room>
     start    start_<room>_1..n, all of them, in order, and next_<room>_1..n when the room has a second screen (PLAN-2 E1)
     open     one door line per screen: open_<room> on the first, open_<room>_<k> on screen k when it exists (else open_<room> again);
              a garden has no door: open_<room>_<k> as it moves on to screen k, open_<room> as the last screen is cleared
     clear    clear_<room>
     card     the clear page says each card's word once
     in-context = the sum of the columns above (the figure PLAN-2 F9 / C1 talk about).
   Beside it, not part of it:
     pickup   per required item (tile h * o, every screen) whose word is a core word of the room: voice.word(w) + pick_<w>_<((k-1) mod 3)+1>;
              assumes every clip plays to the end (a quick second pickup interrupts the first)
     toy      toy_<family>_<n> lines the toys CAN play when their events are forced by the layout (every bunny follows and goes home,
              every flower blooms, each melody note is played), run through the same cycling and per-room cap as src/view/15-toys.js.
              Upper bound only: the view drops a toy line when another line is still speaking or the cooldown has not passed.
     recall   recall_<w> at the start of the NEXT room (review, not in-context).

   The item-kind -> word map (50-talk.js KIND_WORD) and the toy caps (15-toys.js TY_LINES) are read from the view source, so they
   cannot drift from what the game does. A pattern that no longer matches is an error, not a silent zero. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, loadLogic } from './harness.mjs';

export const THRESHOLD = 6;
const DOC = 'src/content/exposure.md';
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** The object literal assigned to `const NAME =` in a view file, evaluated (the literals hold plain data only). */
export function readObjectConst(file, name) {
  const src = read(file), at = src.search(new RegExp(`const ${name}\\s*=\\s*\\{`));
  if (at < 0) throw new Error(`${file}: no "const ${name} = {" found; update test/exposure.mjs`);
  const open = src.indexOf('{', at);
  let depth = 0, end = -1;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) { end = i; break; }
  }
  if (end < 0) throw new Error(`${file}: unbalanced braces after "const ${name}"`);
  return new Function(`return (${src.slice(open, end + 1)});`)();
}

/** Compute the table. `levels` come from the logic (id, words, map, melody), `lines` is lines.json's `lines`.
 *  kindWord: item tile -> word id; toyCfg: toy family -> { max, byN }. Returns rows in room order, word order. */
export function computeExposure({ levels, lines, kindWord, toyCfg }) {
  const hearings = (key, w) => {
    const def = lines[key];
    return def && Array.isArray(def.say) ? def.say.filter(s => s && typeof s === 'object' && s.w === w).length : 0;
  };
  const count = (map, ch) => map.reduce((n, row) => n + [...row].filter(c => c === ch).length, 0);
  const numbered = prefix => { let n = 0; while (lines[`${prefix}${n + 1}`]) n++; return n; };
  const rows = [];
  levels.forEach((lv, idx) => {
    const next = levels[idx + 1];
    const screens = [lv, ...(lv.more || [])], map = screens.flatMap(sc => sc.map), melodies = screens.filter(sc => sc.melody).map(sc => sc.melody);
    /* the view's openKey: screen k (0-based) says open_<room>_<k+1>; a garden says open_<room>_<k+2> as it moves on and open_<room> last */
    const openKeys = screens.map((sc, k) => {
      const garden = (k ? sc.goal : lv.goal) === 'garden', n = garden ? (k < screens.length - 1 ? k + 2 : 0) : (k ? k + 1 : 0);
      return n && lines[`open_${lv.id}_${n}`] ? `open_${lv.id}_${n}` : `open_${lv.id}`;
    });
    /* toy lines per word: run each forced event through the view's own cycling (k = plays so far mod lines + 1) and cap */
    const toyEvents = { bunny: count(map, 'R'), bunny_home: count(map, 'R'), bloom: count(map, 'F'), melody: melodies.length };
    const toyKeys = [];
    for (const [family, events] of Object.entries(toyEvents)) {
      const cfg = toyCfg[family], n = numbered(`toy_${family}_`);
      for (let i = 0; cfg && n && i < Math.min(events, cfg.max); i++) toyKeys.push(`toy_${family}_${i % n + 1}`);
    }
    if (toyCfg.note_ok) for (const note of melodies.flat()) if (lines[`toy_note_ok_${note}`]) toyKeys.push(`toy_note_ok_${note}`);

    for (const w of lv.words) {
      const row = { room: lv.id, word: w, learn: 0, chapter: 0, start: 0, pickup: 0, open: 0, clear: 0, card: 1, toy: 0, recall: 0 };
      for (const x of lv.words) row.learn += hearings(`learn_${x}`, w);
      row.chapter = hearings(`ch_${lv.id}`, w);
      for (let n = 1; lines[`start_${lv.id}_${n}`]; n++) row.start += hearings(`start_${lv.id}_${n}`, w);
      if (lv.more) for (let n = 1; lines[`next_${lv.id}_${n}`]; n++) row.start += hearings(`next_${lv.id}_${n}`, w);
      for (const [ch, word] of Object.entries(kindWord)) {
        if (word !== w) continue;
        for (let k = 1; k <= count(map, ch); k++) row.pickup += 1 + hearings(`pick_${w}_${(k - 1) % 3 + 1}`, w);
      }
      for (const key of openKeys) row.open += hearings(key, w);
      row.clear = hearings(`clear_${lv.id}`, w);
      row.inContext = row.learn + row.chapter + row.start + row.open + row.clear + row.card;
      for (const key of toyKeys) row.toy += hearings(key, w);
      row.all = row.inContext + row.pickup + row.toy;
      if (next) row.recall = hearings(`recall_${w}`, w);
      row.low = row.inContext < THRESHOLD;
      rows.push(row);
    }
  });
  return rows;
}

/** The inputs from the repository: logic levels, lines.json, and the two tables the view source defines. */
export function repoInputs(logic = loadLogic()) {
  return {
    levels: logic.levels,
    lines: JSON.parse(read('src/content/lines.json')).lines,
    kindWord: readObjectConst('src/view/50-talk.js', 'KIND_WORD'),
    toyCfg: readObjectConst('src/view/15-toys.js', 'TY_LINES'),
  };
}

export const summarize = rows => ({
  words: rows.length,
  low: rows.filter(r => r.low).length,
  lowWithExtras: rows.filter(r => r.all < THRESHOLD).length,
  below8: rows.filter(r => r.inContext < 8).length,
  below8WithExtras: rows.filter(r => r.all < 8).length,
  min: Math.min(...rows.map(r => r.inContext)),
  max: Math.max(...rows.map(r => r.inContext)),
});

const COLS = [['room', 'room'], ['word', 'word'], ['learn', 'learn'], ['chapter', 'chapter'], ['start', 'start'], ['open', 'open'], ['clear', 'clear'],
  ['card', 'card'], ['inContext', 'in-context'], ['pickup', '+pickup'], ['toy', '+toy'], ['all', 'all'], ['recall', 'recall']];

/** Plain-text table for the terminal; a row below the threshold is marked with "<". */
export function formatTable(rows) {
  const cells = rows.map(r => COLS.map(([k]) => String(r[k])).concat(r.low ? '<' : ''));
  const head = COLS.map(c => c[1]).concat('');
  const width = head.map((h, i) => Math.max(h.length, ...cells.map(c => c[i].length)));
  const line = c => c.map((x, i) => (i < 2 ? x.padEnd(width[i]) : x.padStart(width[i]))).join('  ').trimEnd();
  return [line(head), line(width.map(w => '-'.repeat(w))), ...cells.map(line)].join('\n');
}

export function formatSummary(rows) {
  const s = summarize(rows);
  return `${s.low} of ${s.words} core words are below ${THRESHOLD} in-context hearings (${s.lowWithExtras} when pickups and toy lines all play); `
    + `below 8: ${s.below8} (${s.below8WithExtras} with pickups and toy lines); in-context ranges ${s.min}..${s.max}`;
}

/** src/content/exposure.md. Deterministic: same inputs, same text. */
export function renderMarkdown(rows) {
  const md = rows.map(r => `| ${r.room} | ${r.word} | ${COLS.slice(2).map(([k]) => r[k]).join(' | ')} | ${r.low ? 'below ' + THRESHOLD : ''} |`);
  return `# Word exposure (generated)

Generated by \`node test/exposure.mjs --write\` from \`lines.json\`, \`words.json\`, \`levels.js\` and the view source. Do not edit it by hand: change the
content or the script and regenerate. \`node test/run.mjs\` prints the same table as a report.

## What is counted

One hearing is one \`{"w": id}\` segment of a line the view plays, or one \`voice.word(id)\` call, for a core word of the room it is played in, on a
normal playthrough: chapter card watched, every start line played, door opened, clear page watched once.

| Column | Source |
|---|---|
| learn | \`learn_<w>\` of every word of the room, played one after the other on the chapter card |
| chapter | \`ch_<room>\` |
| start | \`start_<room>_1..n\`, all of them |
| open | \`open_<room>\` (in the garden it plays as the room clears) |
| clear | \`clear_<room>\` |
| card | the clear page says each card's word once |
| **in-context** | the sum of the columns above; the threshold is ${THRESHOLD} (PLAN-2 C1) |
| +pickup | per required item (tile \`h\` \`*\` \`o\`) whose word is a core word of the room: \`voice.word(w)\` plus \`pick_<w>_<((k-1) mod 3)+1>\`; assumes each clip plays to the end |
| +toy | \`toy_<family>_<n>\` lines the toys can play when the layout forces their events (bunnies, flowers, melody), with the view's cycling and per-room caps. An upper bound: the view drops a toy line while another line speaks or inside its cooldown, so it is not part of in-context |
| all | in-context + pickup + toy |
| recall | \`recall_<w>\` at the start of the next room (review, not in-context) |

Not counted: the quiz (skippable), small stars, stuck hints and the hint bulb, splash and idle lines, the top-up round on the clear page (a repeated bare
word, not a context; PLAN-2 C1 removes it), word-book taps.

## Table

| room | word | learn | chapter | start | open | clear | card | in-context | +pickup | +toy | all | recall | |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
${md.join('\n')}

## Summary

${formatSummary(rows)}.
`;
}

/** The problems that fail the gate, one sentence each: every core word below THRESHOLD in-context hearings, and a stale exposure.md. */
export function exposureProblems(rep) {
  const out = rep.rows.filter(r => r.low).map(r => `${r.room}/${r.word}: ${r.inContext} in-context hearings, need at least ${THRESHOLD}`);
  if (rep.stale) out.push(`${rep.doc} is stale: run node test/exposure.mjs --write`);
  return out;
}

/** Everything the CLI and run.mjs need. `stale` is true when exposure.md differs from what the script generates now. */
export function exposureReport(logic) {
  const rows = computeExposure(repoInputs(logic));
  const md = renderMarkdown(rows);
  const onDisk = fs.existsSync(path.join(ROOT, DOC)) ? read(DOC) : null;
  return { rows, text: formatTable(rows), summary: formatSummary(rows), markdown: md, stale: onDisk !== md, doc: DOC };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const bad = args.filter(a => !['--write', '--check'].includes(a));
  if (bad.length) { console.error(`unknown argument ${bad[0]}\nusage: node test/exposure.mjs [--write] [--check]`); process.exit(2); }
  const rep = exposureReport();
  console.log(rep.text + '\n\n' + rep.summary);
  if (args.includes('--write')) {
    fs.writeFileSync(path.join(ROOT, DOC), rep.markdown);
    console.log(`wrote ${DOC}`);
  } else if (rep.stale) console.log(`${DOC} is stale: run node test/exposure.mjs --write`);
  if (args.includes('--check')) {
    const problems = exposureProblems(args.includes('--write') ? { ...rep, stale: false } : rep);
    if (problems.length) { console.error('exposure check FAILED:\n  ' + problems.join('\n  ')); process.exit(1); }
  }
}
