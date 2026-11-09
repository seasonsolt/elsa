/* Tower: little steps lead up every platform now, so every climb is a single jump. Frost takes the snowflake on the left platform
   (the one-way platforms let her through from below) and drops an ice block on the plate to hold the gate open; Nuan takes the
   hearts, the first one on the high left platform. On the far side Frost takes the snowflake, Nuan climbs up to the second heart and
   melts the pink wall, both walk to the door. */
export const duo = async (h) => {
  // left side
  h.walk('frost', 3);
  h.hop('frost', 4, false, { row: 9 });   // step on the floor
  h.hop('frost', 4, false, { row: 7 });   // platform at row 8
  h.walk('frost', 3);             // snowflake at (3,7)
  h.walk('frost', 7);             // off the platform, down to the floor

  h.walk('nuan', 3);
  h.hop('nuan', 4, false, { row: 9 });
  h.hop('nuan', 4, false, { row: 7 });
  h.hop('nuan', 5, false, { row: 5 });    // step on the right of it
  h.walk('nuan', 6);
  h.hop('nuan', 8, false, { row: 4 });    // platform at row 5
  h.hop('nuan', 6, false, { row: 2 });    // high platform on the left
  h.walk('nuan', 3);              // heart at (3,2)
  h.walk('nuan', 7);              // off the platform, down to the floor

  // the gate: an ice block on the plate keeps it open
  h.face('frost', 'right');
  h.act('frost');                 // block on the plate at (8,11)
  h.hop('nuan', 9);               // over the block
  h.walk('nuan', 13);             // through the open gate
  h.hop('frost', 9);
  h.walk('frost', 13);

  // right side
  h.hop('frost', 14, false, { row: 9 });  // step
  h.hop('frost', 15, false, { row: 8 });  // platform at row 9
  h.walk('frost', 15);            // snowflake at (15,8)
  h.walk('frost', 17);            // off the platform, down to the floor

  h.walk('nuan', 13);
  h.hop('nuan', 14, false, { row: 9 });
  h.hop('nuan', 15, false, { row: 8 });
  h.walk('nuan', 16);
  h.hop('nuan', 17, false, { row: 6 });
  h.hop('nuan', 16, false, { row: 5 });   // platform at row 6
  h.walk('nuan', 14);
  h.hop('nuan', 13, false, { row: 3 });   // step under the high platform
  h.hop('nuan', 15, false, { row: 2 });   // high platform
  h.walk('nuan', 16);             // heart at (16,2)
  h.drop('nuan');                 // down through the platforms
  h.drop('nuan');
  h.drop('nuan');
  h.walk('nuan', 18);
  h.act('nuan');                  // melt the pink wall
  h.walk('nuan', 21);
  h.walk('frost', 21);
};

/* Solo: the player climbs everything by the steps and collects everything. The companion stands on the plate while the player goes
   through the gate and blinks across afterwards; Nuan (as companion or player) melts the pink wall. */
export const solo = async (h, me) => {
  // left side
  h.walk(me, 6);                  // small star at (6,10)
  h.walk(me, 3);
  h.hop(me, 4, false, { row: 9 });        // step on the floor
  h.hop(me, 4, false, { row: 7 });        // platform at row 8
  h.walk(me, 3);                  // snowflake at (3,7)
  h.walk(me, 4);
  h.hop(me, 5, false, { row: 5 });        // step on the right of it
  h.walk(me, 6);
  h.hop(me, 8, false, { row: 4 });        // platform at row 5
  h.walk(me, 9);                  // small star at (9,4)
  h.walk(me, 8);
  h.hop(me, 6, false, { row: 2 });        // high platform on the left
  h.walk(me, 3);                  // heart at (3,2)
  h.walk(me, 7);                  // off the platform, down to the floor

  // the gate: the companion holds the plate
  h.walk(me, 13);                 // through the gate
  // right side
  h.hop(me, 14, false, { row: 9 });       // step
  h.hop(me, 15, false, { row: 8 });       // platform at row 9
  h.walk(me, 15);                 // snowflake at (15,8)
  h.walk(me, 16);
  h.hop(me, 17, false, { row: 6 });
  h.hop(me, 16, false, { row: 5 });       // platform at row 6
  h.walk(me, 15);                 // small star at (15,5)
  h.walk(me, 14);
  h.hop(me, 13, false, { row: 3 });       // step under the high platform
  h.hop(me, 15, false, { row: 2 });       // high platform
  h.walk(me, 18);                 // memory fragment at (18,2)
  h.walk(me, 16);                 // heart at (16,2)
  h.drop(me);                     // down through the platforms
  h.drop(me);
  h.drop(me);
  h.walk(me, 18);
  h.hop(me, 18);                  // small star at (18,8)
  if (me === 'nuan') h.act(me);   // Nuan melts the pink wall herself, otherwise the companion does
  h.expectStars();
  h.walk(me, 21);                 // the door
  if (!h.g.memoryFound) throw new Error('tower: the memory fragment was not found');
};
