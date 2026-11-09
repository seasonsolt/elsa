/* Lake: Frost freezes a path over the water (3 tiles per cast). The three high platforms are reached by little steps, every climb is
   a single jump. Nuan takes the heart on the high left platform, Frost the snowflake on the high right one, Nuan melts the pink wall,
   both walk to the door. */
export const duo = async (h) => {
  h.walk('frost', 4);             // snowflake at (4,9)
  h.walk('frost', 5);
  h.act('frost');                 // ice on 6..8
  h.walk('frost', 8);
  h.act('frost');                 // 9..11
  h.walk('frost', 11);
  h.act('frost');                 // 12..14
  h.walk('frost', 14);
  h.act('frost');                 // 15..16, the water is gone

  h.walk('nuan', 4);
  h.hop('nuan', 5, false, { row: 8 });    // low step
  h.walk('nuan', 7);
  h.hop('nuan', 8, false, { row: 6 });    // middle platform
  h.hop('nuan', 7, false, { row: 4 });    // step on the left
  h.hop('nuan', 5, false, { row: 3 });    // high platform on the left
  h.walk('nuan', 3);              // heart at (3,3)
  h.walk('nuan', 6);              // off the platform, down the steps
  h.walk('nuan', 8);
  h.walk('nuan', 7);
  h.walk('nuan', 4);
  h.walk('nuan', 18);             // over the ice to the far bank, next to the pink wall

  h.walk('frost', 4);
  h.hop('frost', 5, false, { row: 8 });
  h.walk('frost', 7);
  h.hop('frost', 8, false, { row: 6 });
  h.walk('frost', 10);
  h.hop('frost', 11, false, { row: 4 });  // step on the right
  h.hop('frost', 13, false, { row: 3 });  // high platform on the right
  h.walk('frost', 13);            // snowflake at (13,3)
  h.walk('frost', 17);            // off the platform, down to the bank
  h.act('nuan');                  // melt the pink wall
  h.walk('nuan', 21);
  h.walk('frost', 21);
};

/* Solo: the player climbs the steps for everything first (heart, snowflake and the small stars on the way), comes down the left side,
   and crosses the lake last (Frost freezes it herself, otherwise the companion freezes ahead of the player). */
export const solo = async (h, me) => {
  h.walk(me, 4);                  // snowflake at (4,9)
  h.hop(me, 5, false, { row: 8 });        // low step
  h.walk(me, 7);
  h.hop(me, 8, false, { row: 6 });        // middle platform
  h.walk(me, 11);                 // small star at (11,6)
  h.hop(me, 11, false, { row: 4 });       // step on the right
  h.hop(me, 13, false, { row: 3 });       // high platform on the right
  h.walk(me, 13);                 // snowflake at (13,3)
  h.walk(me, 15);
  h.walk(me, 12);                 // back to the step
  h.walk(me, 10);                 // down to the middle platform
  h.walk(me, 8);
  h.hop(me, 7, false, { row: 4 });        // step on the left
  h.hop(me, 5, false, { row: 3 });        // high platform on the left
  h.walk(me, 5);                  // small star at (5,3)
  h.walk(me, 1);                  // memory fragment at (1,3), at the far end of the platform
  h.walk(me, 3);                  // heart at (3,3)
  h.walk(me, 6);                  // off the platform, down the steps
  h.walk(me, 8);
  h.walk(me, 7);
  h.walk(me, 4);
  h.walk(me, 5);
  if (me === 'frost') {           // the lake: otherwise the companion freezes ahead of the player
    h.act(me);                    // ice on 6..8
    h.walk(me, 8); h.act(me);     // 9..11
    h.walk(me, 11); h.act(me);    // 12..14
    h.walk(me, 14); h.act(me);    // 15..16
  }
  h.walk(me, 18);                 // across the water, small star at (10,9) on the way
  h.hop(me, 18);                  // small star at (18,8)
  if (me === 'nuan') h.act(me);   // Nuan melts the pink wall herself, otherwise the companion does
  h.expectStars();
  h.walk(me, 21);                 // the door
  if (!h.g.memoryFound) throw new Error('lake: the memory fragment was not found');
};
