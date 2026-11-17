/* PLAN-2 E1: the first screen of every room plays exactly as it did before rooms could hold several screens.
   test/lock/rooms.json holds, per room and mode, the player's keys on every simulation step of the room's solution and what the game
   did (every event, and where both sisters stood every quarter second). Replaying the keys must give the same record. The lock is
   rewritten with `node test/lock.mjs --write` only when a change to a first screen is intended. */
import fs from 'node:fs';
import { LOCK_FILE, firstScreensOnly, replayRoom } from '../lock.mjs';

export function everyRoomsFirstScreenReplaysExactlyAsRecorded({ assert, loadLogic }) {
  const lock = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
  const ids = Array.from(firstScreensOnly(loadLogic()).levels, lv => lv.id);   // a plain array: the levels come from the logic's vm realm
  assert.deepEqual(Object.keys(lock), ids, 'the lock covers every room, in room order');
  for (const id of ids) for (const mode of ['duo', 'solo']) {
    const rec = lock[id][mode];
    const got = replayRoom(firstScreensOnly(loadLogic()), id, mode, rec.tape);
    const at = got.events.findIndex((line, i) => line !== rec.events[i]);
    if (at >= 0 || got.events.length !== rec.events.length) {
      const i = at >= 0 ? at : Math.min(got.events.length, rec.events.length);
      assert.fail(`${id} ${mode}: the replay differs at record line ${i}\n  expected ${rec.events[i]}\n  got      ${got.events[i]}`);
    }
    assert.equal(got.end, rec.end, `${id} ${mode}: end state`);
  }
}
