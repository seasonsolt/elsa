/* Unit tests for the static level checks: each broken level must be caught, the real ones must pass. */
import { checkMapSize, checkTiles, checkStructure, checkLevelList, checkReach, legalChars } from '../checks.mjs';

const hall = logic => logic.levels.find(l => l.id === 'hall');
const withMap = (lv, edit) => { const map = lv.map.slice(); edit(map); return Object.assign({}, lv, { map }); };
const setCell = (map, c, r, ch) => { map[r] = map[r].slice(0, c) + ch + map[r].slice(c + 1); };

export function mapSizeIsChecked({ logic, assert }) {
  assert.deepEqual(checkMapSize(hall(logic)), []);
  assert.match(checkMapSize(withMap(hall(logic), m => m.pop())).join(), /12 rows/);
  assert.match(checkMapSize(withMap(hall(logic), m => { m[3] += '.'; })).join(), /row 3 has 25 columns/);
}

export function illegalTilesAreCaught({ logic, assert }) {
  const legal = legalChars(logic.TILE_CHARS);
  assert.deepEqual(checkTiles(hall(logic), legal), []);
  assert.match(checkTiles(withMap(hall(logic), m => setCell(m, 3, 3, '?')), legal).join(), /illegal tile "\?" at col 3, row 3/);
}

export function futureTilesAreLegal({ logic, assert }) {
  if (!logic.TILE_CHARS) return;          // pre-S0-3 page: no registry yet
  const legal = legalChars(logic.TILE_CHARS);
  for (const ch of '/\\JRNM12345F') assert.ok(legal.has(ch), `${ch} is a registered future tile`);
  assert.deepEqual(checkTiles(withMap(hall(logic), m => setCell(m, 3, 3, 'J')), legal), []);
}

export function structureProblemsAreCaught({ logic, assert }) {
  assert.deepEqual(checkStructure(hall(logic)), []);
  assert.match(checkStructure(withMap(hall(logic), m => setCell(m, 1, 11, '.'))).join(), /Frost spawn/);
  assert.match(checkStructure(Object.assign({}, hall(logic), { goal: 'snowman' })).join(), /needs exactly one 'S'/);
  assert.match(checkStructure(withMap(hall(logic), m => setCell(m, 3, 3, 'G'))).join(), /no pressure plate/);
}

export function duplicateIdsAreCaught({ logic, assert }) {
  assert.deepEqual(checkLevelList(logic.levels), []);
  assert.match(checkLevelList([{ id: 'a' }, { id: 'a' }]).join(), /duplicate level id 'a'/);
}

export function reachabilityPassesTheRealLevels({ logic, assert }) {
  logic.levels.forEach((lv, i) => assert.deepEqual(checkReach(logic, i), [], lv.id));
}

/* The smoke check must not be vacuous: break a fresh copy of the logic and expect a complaint. */
function broken(loadLogic, id, edit) {
  const logic = loadLogic();
  const i = logic.levels.findIndex(l => l.id === id);
  const lv = logic.LEVELS[i];                       // the array the game itself reads
  lv.map = lv.map.slice();
  edit(lv.map);
  return checkReach(logic, i);
}

export function reachabilityCatchesASealedItem({ loadLogic, assert }) {
  const problems = broken(loadLogic, 'hall', m => { setCell(m, 12, 11, '#'); setCell(m, 14, 11, '#'); setCell(m, 13, 10, '#'); });
  assert.match(problems.join(), /frost cannot reach the snowflake at col 13, row 11/);
}

export function reachabilityCatchesAnUnmeltableWall({ loadLogic, assert }) {
  const problems = broken(loadLogic, 'hall', m => { for (const r of [9, 10, 11]) setCell(m, 17, r, '#'); });
  assert.match(problems.join(), /cannot reach the door/);
}

export function reachabilityCatchesAMissingPlate({ loadLogic, assert }) {
  const problems = broken(loadLogic, 'tower', m => setCell(m, 8, 11, '.'));
  assert.match(problems.join(), /cannot reach/);
}

export function smallStarsAreCheckedForCountAndReach({ logic, loadLogic, assert }) {
  const stripped = withMap(hall(logic), m => { for (let r = 0; r < m.length; r++) m[r] = m[r].replace(/\+/g, '.'); });
  assert.match(checkStructure(stripped).join(), /3-5 small stars \(\+\), found 0/);
  const crowded = withMap(hall(logic), m => { for (const c of [3, 4, 5]) setCell(m, c, 2, '+'); });
  assert.match(checkStructure(crowded).join(), /found 7/);
  // a star sealed into the wall of the hall cannot be reached by anybody
  const problems = broken(loadLogic, 'hall', m => { setCell(m, 3, 2, '+'); for (const [c, r] of [[2, 2], [4, 2], [3, 1], [3, 3]]) setCell(m, c, r, '#'); });
  assert.match(problems.join(), /small star at col 3, row 2/);
}
