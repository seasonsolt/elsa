/* Hall: every climb is a single jump now (two small steps beside the tall block). Both walk up the step and the block; Frost takes
   the snowflake on the block, Nuan climbs on to the one-way platform for the heart. Nuan melts the pink wall, both walk to the door. */
export const duo = async (h) => {
  h.walk('nuan', 4);              // heart at (4,11)
  h.hop('nuan', 5, false, { row: 9 });    // the step
  h.hop('nuan', 7, false, { row: 8 });    // top of the block
  h.walk('nuan', 11);
  h.hop('nuan', 12, false, { row: 6 });   // the second step
  h.hop('nuan', 11, false, { row: 5 });   // the one-way platform
  h.walk('nuan', 10);             // heart at (10,4)
  h.walk('nuan', 15);             // off the platform, over the step, down to the floor
  h.walk('nuan', 16);             // to the pink wall
  h.act('nuan');                  // melt it

  h.walk('frost', 4);
  h.hop('frost', 5, false, { row: 9 });
  h.hop('frost', 7, false, { row: 8 });
  h.walk('frost', 10);            // snowflake at (10,8)
  h.walk('frost', 13);            // off the block, down to the floor: snowflake at (13,11)
  h.walk('frost', 20);
  h.walk('nuan', 20);
};

/* Solo: the player does everything alone. The companion follows; if she is Nuan she melts the pink wall when the player comes
   near, if the player is Nuan she melts it herself. */
export const solo = async (h, me) => {
  h.hop(me, 2);                   // small star at (2,8), straight above the start
  h.walk(me, 4);                  // heart at (4,11)
  h.hop(me, 5, false, { row: 9 });        // the step
  h.hop(me, 7, false, { row: 8 });        // top of the block
  h.walk(me, 10);                 // snowflake at (10,8)
  h.walk(me, 11);
  h.hop(me, 12, false, { row: 6 });       // the second step
  h.hop(me, 11, false, { row: 5 });       // the one-way platform: small star at (11,5)
  h.walk(me, 10);                 // heart at (10,4)
  h.hop(me, 8);                   // memory fragment at (8,5)
  h.walk(me, 15);                 // off the platform, over the step, down to the floor
  h.walk(me, 13);                 // snowflake at (13,11)
  h.hop(me, 14);                  // small star at (14,8)
  h.walk(me, 16);                 // to the pink wall
  if (me === 'nuan') h.act(me);   // Nuan melts it herself; otherwise the companion does
  h.walk(me, 18);
  h.hop(me, 18);                  // small star at (18,8)
  h.expectStars();
  h.walk(me, 20);                 // the door: the companion is blinked there
  if (!h.g.memoryFound) throw new Error('hall: the memory fragment was not found');
};
