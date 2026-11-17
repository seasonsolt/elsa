import { ferry, boardFloe, leaveFloe, scene } from './_kit.mjs';
/* Floe: two rivers, each with a floe that sails to and fro. Wait for it at the bank, hop on, ride across (the heart floats over the
   first river, the snowflake over the second), step off on the island and later on the far bank. */

/* Screen 2: bunnies on the floes. The bunny home (N) is on the island in the middle. One bunny waits on the left bank (it follows at
   once), the other one is lost in the corner behind the door on the far bank: ride right to fetch it, ride left to bring it home, ride
   right again to the door. Frost's magic makes a docked floe wait (3 s), so the bunny can hop on and off behind its sister; a bunny
   that misses a floe blinks after her (logic.js), so it rides along either way. Both floes are two tiles long and sail four tiles
   (x = 200..360 on the first river, 560..720 on the second). */
const ride1 = { board: 4, boardX: 200, land: 11, landX: 360, to: 11 };            // left bank -> island
const ride2 = { board: 13, boardX: 560, land: 20, landX: 720, to: 20 };           // island -> right bank
const back2 = { board: 20, boardX: 720, dir: -1, landX: 560, to: 12 };            // right bank -> island (onto the bunny home)
const bunniesHome = h => h.waitFor(() => h.g.bunnies.every(b => b.state === 'home'), 6, 'both bunnies home');
/** wait until floe `i` touches the bank (its left edge at x) */
const docked = (h, i, x) => h.waitFor(() => Math.abs(h.g.floes[i].x - x) < 1, 14, `floe ${i} at x = ${x}`);

export const duo = async (h) => {
  const river1 = { board: 5, boardX: 240, land: 12, landX: 360, to: 12 };   // the floe 0 sails between x = 240 and x = 360
  const river2 = { board: 13, boardX: 560, land: 19, landX: 680, to: 19 };  // the floe 1 between x = 560 and x = 680
  ferry(h, 'nuan', 0, river1);    // heart at (8,9) on the way
  ferry(h, 'frost', 0, river1);
  ferry(h, 'frost', 1, river2);   // snowflake at (16,9) on the way
  ferry(h, 'nuan', 1, river2);
  h.walk('frost', 21);
  h.walk('nuan', 21);             // the door

  // Screen 2: Nuan's lantern woke the bank bunny at once. Frost's magic holds the floe at the bank (wait!) so Nuan, the bunny and she
  // all get on; they ride right together (heart on the way) and the bunny runs into its home on the island. Frost rides on alone to the
  // far bank (snowflake on the way), wakes the lost bunny behind the door and rides back left with it. Then both ride right to the door.
  h.nextScreen();
  h.walk('frost', 3);
  h.walk('nuan', 4);
  docked(h, 0, ride1.boardX);
  h.act('frost');                 // the floe waits at the bank
  h.hop('nuan', 6);
  h.walk('frost', 4);
  h.hop('frost', 5);
  docked(h, 0, ride1.landX);         // heart (7,9) on the way
  h.act('frost');                 // and waits at the island
  h.walk('nuan', 11);
  h.walk('frost', 13);
  ferry(h, 'frost', 1, ride2);    // snowflake (17,9)
  h.walk('frost', 22);            // the lost bunny (22,10) behind the door wakes up
  boardFloe(h, 'frost', 1, back2);   // back left to the island with it
  docked(h, 1, back2.landX);
  h.act('frost');                 // the floe waits, the bunny hops off behind her
  h.walk('frost', back2.to);
  bunniesHome(h);
  h.act('frost');                 // the floe waits again: both sisters ride the last floe together
  h.walk('nuan', 15);
  h.walk('frost', 14);
  docked(h, 1, ride2.landX);
  h.act('frost');                 // her magic: the floe waits at the bank while both step off
  h.walk('frost', 21);
  h.walk('nuan', 22);             // the door
};

/* Solo: Elsa rides both floes and takes every small star; the companion waits for the floe and hops on by herself. */
export const solo = async (h, me) => {
  // Scene: the player rides a floe, the companion stands on the bank. She waits for the floe to come by, hops on and rides with the
  // player: no blink, no splash (the harness fails on any splash).
  const other = 'nuan', s = scene('floe');
  s.place(other, 5, 10); s.place(me, 8, 10);
  const blinks = s.count('blink');
  let rode = 0;
  for (let i = 0; i < 10 * 120; i++) {
    s.wait(1 / 120);
    const c = s.g.sisters[other];
    if (s.g.floes.some(f => c.ground && Math.abs(c.y + c.h - f.y) < 0.5 && c.x + c.w / 2 >= f.x && c.x + c.w / 2 <= f.x + f.w)) rode++;
  }
  if (rode < 2 * 120) throw new Error(`floe: the companion rode a floe for only ${(rode / 120).toFixed(1)} s of 10, she should wait for it and hop on`);
  if (s.count('blink') !== blinks) throw new Error('floe: the companion had to blink, she should take the floe');
  const river1 = { board: 5, boardX: 240, land: 12, landX: 360, to: 12 };
  const river2 = { board: 13, boardX: 560, land: 19, landX: 680, to: 19 };
  h.hop(me, 3);                   // small star at (3,8)
  boardFloe(h, me, 0, river1);
  h.hop(me, 8);                   // small star at (8,7), heart at (8,9) on the way
  leaveFloe(h, me, 0, river1);
  h.hop(me, 12);                  // memory fragment at (12,9) on the island
  boardFloe(h, me, 1, river2);
  h.hop(me, 16);                  // small star at (16,7), snowflake at (16,9) on the way
  leaveFloe(h, me, 1, river2);
  h.walk(me, 19);
  h.hop(me, 19);                  // small star at (19,8)
  h.walk(me, 21);                 // the door
  if (!h.g.memoryFound) throw new Error('floe: the memory fragment was not found');

  // Screen 2: the bunnies follow the player (solo). Her magic holds the floe at the bank, so the companion and the bunny step on too.
  h.nextScreen();
  h.walk(me, 4);
  docked(h, 0, ride1.boardX);
  h.act(me);                      // the floe waits
  h.hop(me, 6);
  docked(h, 0, ride1.landX);      // heart (7,9) on the way
  h.act(me);
  h.walk(me, 11);                 // the bank bunny runs into its home
  h.hop(me, 12);                  // small star at (12,7) over the bunny home
  boardFloe(h, me, 1, ride2);
  h.hop(me, 17);                  // small star at (17,7), snowflake (17,9) on the way
  leaveFloe(h, me, 1, ride2);
  h.hop(me, 21);                  // small star at (21,7) over the door
  h.walk(me, 22);                 // the lost bunny in the corner wakes up
  boardFloe(h, me, 1, back2);     // left, back to the island with the bunny
  docked(h, 1, back2.landX);
  h.act(me);
  h.walk(me, back2.to);
  bunniesHome(h);
  boardFloe(h, me, 1, ride2);     // right again, to the door
  leaveFloe(h, me, 1, ride2);
  h.expectStars();
  h.walk(me, 21);                 // the door
};
