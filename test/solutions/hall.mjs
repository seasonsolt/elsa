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

  /* Screen 2: three floors with a ladder of one-way steps in the middle. On every floor a pink wall at the right closes a little room
     with a treasure; the left side of the upper floors is open, with a gap by the wall to drop back down. The middle floor is low (two
     tiles), so the top floor and its door stay below the HUD. Nuan goes up first, melts the three walls and takes the two hearts, then
     Frost climbs after her for the three snowflakes. The door is on the top floor. */
  h.nextScreen();
  h.walk('nuan', 16);
  h.act('nuan');                  // the pink wall on the ground floor
  h.walk('nuan', 21);             // heart at (21,11)
  h.walk('nuan', 12);
  h.hop('nuan', 12, false, { row: 9 });   // the ladder
  h.hop('nuan', 12, false, { row: 7 });   // second floor
  h.walk('nuan', 16);
  h.act('nuan');                  // the pink wall on the second floor
  h.walk('nuan', 2);              // heart at (2,7)
  h.walk('nuan', 12);
  h.hop('nuan', 12, false, { row: 5 });
  h.hop('nuan', 12, false, { row: 4 });   // top floor
  h.walk('nuan', 16);
  h.act('nuan');                  // the pink wall on the top floor
  h.walk('nuan', 8);

  h.walk('frost', 3);             // snowflake at (3,11)
  h.walk('frost', 12);
  h.hop('frost', 12, false, { row: 9 });
  h.hop('frost', 12, false, { row: 7 });
  h.walk('frost', 21);            // snowflake at (21,7), behind the melted wall
  h.walk('frost', 12);
  h.hop('frost', 12, false, { row: 5 });
  h.hop('frost', 12, false, { row: 4 });
  h.walk('frost', 21);            // snowflake at (21,3), behind the melted wall
  h.walk('frost', 4);
  h.walk('nuan', 4);
};

/* Solo: the player does everything alone. Elsa is the player; the companion Anna follows and melts the pink wall
   when Elsa comes near. */
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
                                  // (Anna, the companion, melts the wall when Elsa stands in front of it)
  h.walk(me, 18);
  h.hop(me, 18);                  // small star at (18,8)
  h.walk(me, 20);                 // the door: the companion is blinked there
  if (!h.g.memoryFound) throw new Error('hall: the memory fragment was not found');

  /* Screen 2: up the ladder floor by floor; on each floor Anna melts the pink wall at the right when Elsa comes near it. */
  h.nextScreen();
  h.walk(me, 3);                  // snowflake at (3,11)
  h.walk(me, 14);
  h.hop(me, 14);                  // small star at (14,9)
  h.walk(me, 16);                 // (Anna melts the pink wall)
  h.walk(me, 21);                 // heart at (21,11)
  h.walk(me, 12);
  h.hop(me, 12, false, { row: 9 });       // the ladder
  h.hop(me, 12, false, { row: 7 });       // second floor
  h.walk(me, 21);                 // small star at (15,6) on the way (Anna melts the pink wall), snowflake at (21,7)
  h.walk(me, 2);                  // small star at (8,6) on the way, heart at (2,7)
  h.walk(me, 12);
  h.hop(me, 12, false, { row: 5 });
  h.hop(me, 12, false, { row: 4 });       // top floor
  h.walk(me, 16);                 // (Anna melts the pink wall)
  h.walk(me, 21);                 // snowflake at (21,3)
  h.walk(me, 10);
  h.hop(me, 10);                  // small star at (10,2)
  h.expectStars();
  h.walk(me, 4);                  // the door
};
