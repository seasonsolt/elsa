import { ferry, boardFloe, leaveFloe, scene } from './_kit.mjs';
/* Floe: two rivers, each with a floe that sails to and fro. Wait for it at the bank, hop on, ride across (the heart floats over the
   first river, the snowflake over the second), step off on the island and later on the far bank. */
export const duo = async (h) => {
  const river1 = { board: 5, boardX: 240, land: 12, landX: 360, to: 12 };   // the floe 0 sails between x = 240 and x = 360
  const river2 = { board: 13, boardX: 560, land: 19, landX: 680, to: 19 };  // the floe 1 between x = 560 and x = 680
  ferry(h, 'nuan', 0, river1);    // heart at (8,9) on the way
  ferry(h, 'frost', 0, river1);
  ferry(h, 'frost', 1, river2);   // snowflake at (16,9) on the way
  ferry(h, 'nuan', 1, river2);
  h.walk('frost', 21);
  h.walk('nuan', 21);             // the door
};

/* Solo: one sister rides both floes and takes every small star; the companion waits for the floe and hops on by herself. */
export const solo = async (h, me) => {
  // Scene: the player rides a floe, the companion stands on the bank. She waits for the floe to come by, hops on and rides with the
  // player: no blink, no splash (the harness fails on any splash).
  const other = me === 'nuan' ? 'frost' : 'nuan', s = scene('floe', me);
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
  h.expectStars();
  h.walk(me, 21);                 // the door
  if (!h.g.memoryFound) throw new Error('floe: the memory fragment was not found');
};
