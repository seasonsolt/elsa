#!/usr/bin/env node
/* Test runner (PLAN S0-2). No dependencies.

     node test/run.mjs                      logic from src/*.js
     node test/run.mjs --html ice-castle.html     logic from a built page (or any page with a <script id="logic">)
     node test/run.mjs --only lake          one level
     node test/run.mjs --trace              print every solution step (position of both sisters)
     node test/run.mjs --no-unit            skip test/unit

   Per level: map size, tile characters, structure, item reachability (smoke), the 'duo' solution, and the 'solo' solution
   once with Nuan and once with Frost as the player (SKIPPED only while a room's `solo` is null, which a finished room must not be). Then every test in test/unit/*.test.mjs.
   Then test/content_keys.mjs (view line keys vs src/content/lines.json). Exit code 1 when anything failed. SKIPPED is not a failure. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { ROOT, loadLogic, makeHarness, loadMap } from './harness.mjs';
import { checkContentKeys } from './content_keys.mjs';
import { checkMapSize, checkTiles, checkStructure, checkLevelList, checkReach, legalChars } from './checks.mjs';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const o = { html: null, only: null, trace: false, unit: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--html') o.html = argv[++i];
    else if (a === '--only') o.only = argv[++i];
    else if (a === '--trace') o.trace = true;
    else if (a === '--no-unit') o.unit = false;
    else if (a === '--help' || a === '-h') { console.log('usage: node test/run.mjs [--html FILE] [--only LEVEL_ID] [--trace] [--no-unit]'); process.exit(0); }
    else { console.error(`unknown argument ${a}`); process.exit(2); }
  }
  return o;
}

const OK = 'ok', FAIL = 'FAIL', SKIP = 'SKIP';
const pass = (note = '') => ({ status: OK, note });
const fail = (msg) => ({ status: FAIL, msg });
const skip = (note = '') => ({ status: SKIP, note });

/* a check that returns a problem list */
const fromProblems = problems => (problems.length ? fail(problems.join('\n')) : pass());

async function loadSolutions(id) {
  const file = path.join(TEST_DIR, 'solutions', `${id}.mjs`);
  if (!fs.existsSync(file)) return { error: `missing ${path.relative(ROOT, file)}: every level needs a solution file` };
  try { return { mod: await import(pathToFileURL(file).href) }; }
  catch (e) { return { error: `cannot load ${path.relative(ROOT, file)}: ${e.message}` }; }
}

async function runSolution(logic, id, kind, fn, o, player) {
  let h;
  try {
    h = makeHarness(logic, id, { mode: kind, player, trace: o.trace });
    if (o.trace) console.log(`  ${id} ${kind}${player ? `/${player}` : ''}`);
    await fn(h, player);
    const state = h.finish();
    if (h.g.index !== h.index) return fail(`ended in level ${h.g.index}, expected to stay in ${h.index}`);
    if (state !== h.expectedFinalState) {
      const left = h.g.items.filter(i => !i.got).map(i => `${i.kind}@${i.c},${i.r}`);
      return fail(`solution ended with state '${state}', expected '${h.expectedFinalState}'${left.length ? ` (items left: ${left.join(' ')})` : ''}${h.g.doorOpen ? '' : ' (door never opened)'}`);
    }
    return pass(`${h.time.toFixed(0)}s`);
  } catch (e) {
    return fail(e && e.stack && !(e.name === 'StepError') ? e.stack : String(e && e.message || e));
  }
}

async function levelResults(logic, index, o) {
  const lv = logic.levels[index];
  const res = {};
  res.map = fromProblems(checkMapSize(lv, logic.ROWS, logic.COLS));
  res.tiles = fromProblems(checkTiles(lv, legalChars(logic.TILE_CHARS)));
  res.shape = fromProblems(checkStructure(lv));
  res.reach = res.map.status === OK && res.tiles.status === OK ? fromProblems(checkReach(logic, index)) : skip('map invalid');

  const { mod, error } = await loadSolutions(lv.id);
  if (error) {
    res.duo = fail(error); res.nuan = fail(error); res.frost = fail(error);
    return res;
  }
  res.duo = typeof mod.duo === 'function' ? await runSolution(logic, lv.id, 'duo', mod.duo, o, null) : fail("solution file must export `duo` (async (h) => {...})");
  if (!('solo' in mod)) {
    const m = fail("solution file must export `solo` (null until companion exists)");
    res.nuan = m; res.frost = m;
  } else if (mod.solo == null) {
    res.nuan = skip('solo null'); res.frost = skip('solo null');
  } else if (typeof mod.solo !== 'function') {
    const m = fail('`solo` must be null or an async function (h, me) => {...}');
    res.nuan = m; res.frost = m;
  } else {
    res.nuan = await runSolution(logic, lv.id, 'solo', mod.solo, o, 'nuan');
    res.frost = await runSolution(logic, lv.id, 'solo', mod.solo, o, 'frost');
  }
  return res;
}

/* unit tests: test/unit/*.test.mjs, default export function and/or named function exports; each gets (ctx) */
async function unitResults(logic, o) {
  const dir = path.join(TEST_DIR, 'unit');
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const ctx = { logic, loadLogic, makeHarness, loadMap, assert, ROOT, options: o };
  for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.test.mjs')).sort()) {
    const base = f.replace(/\.test\.mjs$/, '');
    let mod;
    try { mod = await import(pathToFileURL(path.join(dir, f)).href); }
    catch (e) { out.push({ name: base, result: fail(`cannot load ${f}: ${e.stack || e.message}`) }); continue; }
    const tests = [];
    if (typeof mod.default === 'function') tests.push([base, mod.default]);
    for (const [name, fn] of Object.entries(mod)) if (name !== 'default' && typeof fn === 'function') tests.push([`${base}.${name}`, fn]);
    if (!tests.length) out.push({ name: base, result: fail('no tests: export a default function or named functions') });
    for (const [name, fn] of tests) {
      try { await fn(ctx); out.push({ name, result: pass() }); }
      catch (e) { out.push({ name, result: fail(e && e.stack ? e.stack.split('\n').slice(0, 6).join('\n') : String(e)) }); }
    }
  }
  return out;
}

/* ---------- main ---------- */
const o = parseArgs(process.argv.slice(2));
let logic;
try { logic = loadLogic({ html: o.html }); }
catch (e) { console.error(`cannot load the game logic: ${e.message}`); process.exit(1); }
console.log(`logic from ${logic.source}; ${logic.levels.length} levels`);

const rows = [];
let failures = 0;
const listProblems = checkLevelList(logic.levels);
if (listProblems.length) { failures++; console.log(`FAIL level list: ${listProblems.join('; ')}`); }

const selected = logic.levels.map((lv, i) => [lv, i]).filter(([lv]) => !o.only || lv.id === o.only);
if (!selected.length) { console.error(`no level with id '${o.only}'`); process.exit(2); }
for (const [lv, i] of selected) rows.push({ id: lv.id, res: await levelResults(logic, i, o) });

const COLS = [['map', 'map'], ['tiles', 'tiles'], ['shape', 'shape'], ['reach', 'reach'], ['duo', 'duo'], ['nuan', 'solo/nuan'], ['frost', 'solo/frost']];
const cell = r => r.status + (r.status === OK && r.note ? ` ${r.note}` : '');
const width = COLS.map(([k, title]) => Math.max(title.length, ...rows.map(r => cell(r.res[k]).length)));
const idW = Math.max(5, ...rows.map(r => r.id.length));
const line = cols => cols.map((c, i) => (i === 0 ? c.padEnd(idW) : c.padEnd(width[i - 1]))).join('  ').trimEnd();
console.log('\n' + line(['level', ...COLS.map(c => c[1])]));
console.log(line(['-'.repeat(idW), ...width.map(w => '-'.repeat(w))]));
for (const r of rows) console.log(line([r.id, ...COLS.map(([k]) => cell(r.res[k]))]));

const details = [];
for (const r of rows) for (const [k, title] of COLS) {
  const x = r.res[k];
  if (x.status === FAIL) { failures++; details.push(`${r.id} / ${title}:\n  ${x.msg.split('\n').join('\n  ')}`); }
}

let unit = [];
if (o.unit) {
  unit = await unitResults(logic, o);
  if (unit.length) {
    console.log('\nunit tests');
    for (const u of unit) console.log(`  ${u.result.status.padEnd(4)}  ${u.name}`);
  }
  for (const u of unit) if (u.result.status === FAIL) { failures++; details.push(`unit ${u.name}:\n  ${u.result.msg.split('\n').join('\n  ')}`); }
}

/* every voice line the view asks for exists in lines.json (test/content_keys.mjs); not tied to --only / --no-unit */
let keyProblems = [];
try { keyProblems = checkContentKeys(logic); } catch (e) { keyProblems = [`content key check crashed: ${e.stack || e.message}`]; }
console.log(`\ncontent keys  ${keyProblems.length ? FAIL : OK}`);
if (keyProblems.length) { failures++; details.push(`content keys:\n  ${keyProblems.join('\n  ')}`); }

const skipped = rows.reduce((n, r) => n + Object.values(r.res).filter(x => x.status === SKIP).length, 0);
if (details.length) console.log('\nFAILURES\n' + details.join('\n\n'));
console.log(`\n${failures ? 'FAILED' : 'PASSED'}: ${failures} failure(s), ${skipped} skipped, ${unit.filter(u => u.result.status === OK).length} unit test(s) ok`);
process.exitCode = failures ? 1 : 0;
