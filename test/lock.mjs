#!/usr/bin/env node
/* Behaviour lock of the rooms (PLAN-2 E1): before the logic learns to hold several screens per room, the way every existing room plays
   is written down, and test/unit/behavior-lock.test.mjs replays it after every change.

     node test/lock.mjs --write     runs every room's duo and solo solution, records the player's keys on every simulation step (the
                                    "tape") and the events the game produced, into test/lock/rooms.json

   A replay builds the same game the harness builds (start, companion, the landing steps), feeds the tape step by step and must produce
   the same events. Only the first screen of a room is locked: the replay drops `more` (the later screens) from every level, so a room
   still ends in 'clear' there. Rewrite the lock only when a change to the first screens is intended. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, DT, loadLogic, makeHarness } from './harness.mjs';

export const LOCK_FILE = path.join(ROOT, 'test', 'lock', 'rooms.json');
const BITS = { l: 1, r: 2, d: 4 };

/** the level list with only the first screen of every room */
export function firstScreensOnly(logic) {
  for (const lv of logic.LEVELS) delete lv.more;
  return logic;
}

const round = v => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, round(x)])) : v);
/** one event as a stable line: the step it happened on, its type and every field (numbers to 1/1000) */
export const eventLine = (tick, e) => `${tick} ${e.type} ${JSON.stringify(round(Object.fromEntries(Object.entries(e).filter(([k]) => k !== 'type'))))}`;

/** where both sisters stand every 30 steps (a quarter second): catches a change in movement that produces no event */
const posLine = (tick, g) => `${tick} at ${Object.values(g.sisters).map(x => `${x.id[0]}${Math.round(x.x * 1000) / 1000},${Math.round(x.y * 1000) / 1000}`).join(' ')}`;

const inputBits = inp => (inp.l ? BITS.l : 0) | (inp.r ? BITS.r : 0) | (inp.d ? BITS.d : 0);

/** Run `solution` in a harness and record { tape, events }. tape: { keys: [[tick, frostBits, nuanBits]...] (only when they change),
 *  presses: [[tick, 'frost' | 'nuan', 'jump' | 'act']...] }; the players are both sisters in duo, Elsa only in solo. */
export async function recordRoom(logic, id, mode, solution) {
  const h = makeHarness(logic, id, { mode, player: mode === 'solo' ? 'frost' : undefined });
  const g = h.g, players = mode === 'solo' ? ['frost'] : ['frost', 'nuan'];
  const keys = [], presses = [], events = [];
  let tick = 0, pending = [], lastKeys = '';
  const press = g.press;
  g.press = (who, what) => { if (players.includes(who)) pending.push([who, what]); return press(who, what); };
  const step = g.step;
  g.step = dt => {
    const k = [players.includes('frost') ? inputBits(g.input.frost) : 0, players.includes('nuan') ? inputBits(g.input.nuan) : 0];
    if (k.join() !== lastKeys) { keys.push([tick, ...k]); lastKeys = k.join(); }
    for (const [who, what] of pending) presses.push([tick, who, what]);
    pending = [];
    step(dt);
    for (const e of g.events) events.push(eventLine(tick, e));
    if (tick % 30 === 29) events.push(posLine(tick, g));
    tick++;
  };
  /* presses made between the last step and the solution's end never reach the game: they are not part of the run */
  const before = h.log.length;
  await solution(h, mode === 'solo' ? 'frost' : undefined);
  h.finish();
  if (h.log.length < before) throw new Error('lost events');
  return { tape: { keys, presses, ticks: tick }, events, end: endState(g) };
}

/** Replay a tape in a fresh harness of `logic` and return { events, end } the same way recordRoom does. */
export function replayRoom(logic, id, mode, tape) {
  const h = makeHarness(logic, id, { mode, player: mode === 'solo' ? 'frost' : undefined });
  const g = h.g, events = [];
  const byTick = new Map();
  for (const [t, who, what] of tape.presses) (byTick.get(t) || byTick.set(t, []).get(t)).push([who, what]);
  let k = 0;
  const players = mode === 'solo' ? ['frost'] : ['frost', 'nuan'];
  for (let tick = 0; tick < tape.ticks; tick++) {
    while (k < tape.keys.length && tape.keys[k][0] === tick) {
      const [, f, n] = tape.keys[k++];
      for (const [who, bits] of [['frost', f], ['nuan', n]]) {
        if (!players.includes(who)) continue;
        Object.assign(g.input[who], { l: bits & BITS.l ? 1 : 0, r: bits & BITS.r ? 1 : 0, d: bits & BITS.d ? 1 : 0 });
      }
    }
    for (const [who, what] of byTick.get(tick) || []) g.press(who, what);
    for (const e of h.stepOnce()) events.push(eventLine(tick, e));
    if (tick % 30 === 29) events.push(posLine(tick, g));
  }
  return { events, end: endState(g) };
}

function endState(g) {
  const s = Object.values(g.sisters).map(x => `${x.id}@${Math.round(x.x * 1000) / 1000},${Math.round(x.y * 1000) / 1000}`);
  return `${g.state} index=${g.index} stars=${g.stars.got}/${g.stars.total} memory=${g.memoryFound} ${s.join(' ')}`;
}

async function writeLock() {
  const logic = firstScreensOnly(loadLogic());
  const out = {};
  for (const lv of logic.levels) {
    const mod = await import(pathToFileURL(path.join(ROOT, 'test', 'solutions', `${lv.id}.mjs`)).href);
    out[lv.id] = {};
    for (const mode of ['duo', 'solo']) {
      const rec = await recordRoom(firstScreensOnly(loadLogic()), lv.id, mode, mode === 'duo' ? mod.duo : mod.solo);
      out[lv.id][mode] = rec;
      console.log(`${lv.id} ${mode}: ${rec.tape.ticks} steps (${(rec.tape.ticks * DT).toFixed(1)} s), ${rec.events.length} events, ${rec.end}`);
    }
  }
  fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });
  fs.writeFileSync(LOCK_FILE, JSON.stringify(out) + '\n');
  console.log(`${path.relative(ROOT, LOCK_FILE)}: ${(fs.statSync(LOCK_FILE).size / 1024).toFixed(0)} KiB`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--write')) await writeLock();
  else { console.log('usage: node test/lock.mjs --write'); process.exitCode = 2; }
}
