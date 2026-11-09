/* Helpers for the unit tests of solo mode and the companion: a game + companion pair that is stepped by hand.
   Unit tests may set a scene up through the public API (g.blink moves a sister, g.input / g.press drive her) and may read anything. */
import { DT } from './harness.mjs';

/** A fresh solo game in room `id` with a companion. `edit(levelObject)` may change the room's data (it works on a private copy of the logic).
 *  Returns { g, co, logic, log, run(sec, each?), step(each?), at(id), col(id) }. */
export function soloGame({ loadLogic }, id, { player = 'nuan', mode = 'solo', edit = null, companion = true } = {}) {
  const logic = loadLogic();
  const index = logic.levels.findIndex(l => l.id === id);
  if (index < 0) throw new Error(`no room '${id}'`);
  if (edit) edit(logic.LEVELS[index]);
  const g = logic.createGame();
  g.mode = mode; g.player = player;
  g.start(index);
  const co = companion ? logic.createCompanion(g) : null;
  if (co) co.reset();
  const log = [];
  const step = each => {
    if (each) each(g);
    if (co && g.mode === 'solo') co.update(DT);
    g.step(DT);
    log.push(...g.events.splice(0));
  };
  const kit = {
    g, co, logic, log, step,
    /** step for `sec` seconds, calling each(g) before every step; the player's keys are let go of at the end of a run that drove them */
    run(sec, each) {
      const n = Math.round(sec / DT);
      for (let i = 0; i < n; i++) step(each);
      if (each) Object.assign(g.input[g.player], { l: 0, r: 0, d: 0 });
    },
    col: sid => (g.sisters[sid].x + g.sisters[sid].w / 2) / logic.T,
    row: sid => Math.floor((g.sisters[sid].y + g.sisters[sid].h - 1) / logic.T),
    count: type => log.filter(e => e.type === type).length,
    /** put a sister with her feet centre on tile (c, r) and let her settle */
    place(sid, c, r) {
      if (!g.blink(sid, c * logic.T + logic.T / 2, (r + 1) * logic.T)) throw new Error(`cannot place ${sid} at ${c},${r}`);
      for (let i = 0; i < 30; i++) { g.step(DT); log.push(...g.events.splice(0)); }
    },
  };
  for (let i = 0; i < 120 && !Object.values(g.sisters).every(s => s.ground); i++) { g.step(DT); g.events.splice(0); }
  return kit;
}

/** a tiny seeded PRNG so "random" tests replay the same way */
export function prng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
