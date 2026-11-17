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

  /* Screen 2, the ice step: the door is up at the top of this side, on a ledge behind a pink wall; the snowflake and the heart are behind the
     gate. Its plate is up on a shelf three tiles high, too high for one jump: Frost makes an ice block on the floor as a step and
     stands on the plate while Nuan goes through; Nuan stands on the second plate on the far side to let Frost through. Frost climbs
     to the snowflake, Nuan to the heart; on the way back they hold the plates for each other again, then both climb the step and the
     platforms to the second heart (Nuan) and snowflake (Frost) of this side; Nuan melts the pink wall in front of the door. */
  h.nextScreen();
  h.walk('frost', 3);
  h.face('frost', 'right');
  h.act('frost');                 // an ice block on the floor at (4,11): a step
  h.hop('frost', 4, false, { row: 10 });  // onto the block
  h.hop('frost', 5, false, { row: 8 });   // up on the shelf, small star at (5,8)
  h.walk('frost', 8);             // on the plate: the gate opens
  h.hop('nuan', 6);               // over the ice step
  h.walk('nuan', 14);             // through the gate, onto the plate on the far side
  h.drop('frost');                // down through the shelf
  h.walk('frost', 22);            // through the gate, small star at (22,11) in the corner
  h.walk('frost', 15);

  // the far side
  h.hop('frost', 16, false, { row: 9 });
  h.walk('frost', 17);            // small star at (17,9)
  h.hop('frost', 19, false, { row: 7 });
  h.walk('frost', 20);            // small star at (20,6)
  h.hop('frost', 21, false, { row: 5 });
  h.walk('frost', 22);            // snowflake at (22,5)
  h.walk('frost', 20);            // off the platform, down onto the one below
  h.drop('frost');                // and down to the floor
  h.walk('frost', 15);

  h.hop('nuan', 16, false, { row: 9 });
  h.hop('nuan', 19, false, { row: 7 });
  h.hop('nuan', 17, false, { row: 5 });
  h.hop('nuan', 15, false, { row: 3 });
  h.walk('nuan', 13);             // heart at (13,3)
  h.drop('nuan');                 // down to the floor
  h.walk('nuan', 14);             // on the plate: the gate opens
  h.walk('frost', 5);             // back through the gate, to the ice step
  h.hop('frost', 4, false, { row: 10 });
  h.hop('frost', 5, false, { row: 8 });
  h.walk('frost', 8);             // on the plate again
  h.walk('nuan', 5);              // back through the gate

  // up to the door
  h.hop('nuan', 4, false, { row: 10 });
  h.hop('nuan', 5, false, { row: 8 });
  h.hop('nuan', 3, false, { row: 6 });
  h.walk('nuan', 1);              // heart at (1,6): the door opens once Frost has her snowflake
  h.walk('nuan', 3);
  h.hop('nuan', 4, false, { row: 4 });    // the top platform
  h.walk('nuan', 7);
  h.act('nuan');                  // melt the pink wall
  h.walk('nuan', 10);             // the door

  h.walk('frost', 5);
  h.hop('frost', 3, false, { row: 6 });
  h.hop('frost', 4, false, { row: 4 });
  h.walk('frost', 6);             // snowflake at (6,4): the door opens
  h.walk('frost', 10);            // the door
};

/* Solo: the player climbs everything by the steps and collects everything. The companion stands on the plate while the player goes
   through the gate and blinks across afterwards; Anna melts the pink wall. */
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
                                  // (Anna melts the pink wall for her)
  h.walk(me, 21);                 // the door

  /* Screen 2, the ice step: Elsa makes an ice block on the floor as a step up to the shelf (small star), comes down and walks to the
     gate: Anna holds the plate up on the shelf and blinks across after her. On the far side Elsa takes the small star in the corner
     and climbs for the small stars, the snowflake and the heart, comes down, and Anna holds the plate on that side for the way back. Then Elsa climbs the step and the
     platforms to the heart and the snowflake of this side, Anna melts the pink wall and Elsa goes in at the door. */
  h.nextScreen();
  h.walk(me, 3);
  h.face(me, 'right');
  h.act(me);                      // an ice block on the floor at (4,11): a step
  h.hop(me, 4, false, { row: 10 });       // onto the block
  h.hop(me, 5, false, { row: 8 });        // up on the shelf, small star at (5,8)
  h.drop(me);                     // down through the shelf
  h.walk(me, 10);                 // towards the gate
  h.waitFor(() => h.g.gatesOpen, 3, 'Anna holds the plate');
  h.walk(me, 22);                 // through the gate, small star at (22,11) in the corner
  h.walk(me, 15);
  h.hop(me, 16, false, { row: 9 });
  h.walk(me, 17);                 // small star at (17,9)
  h.hop(me, 19, false, { row: 7 });
  h.walk(me, 20);                 // small star at (20,6)
  h.hop(me, 21, false, { row: 5 });
  h.walk(me, 22);                 // snowflake at (22,5)
  h.walk(me, 20);                 // down onto the platform below
  h.walk(me, 19);
  h.hop(me, 17, false, { row: 5 });
  h.hop(me, 15, false, { row: 3 });
  h.walk(me, 13);                 // heart at (13,3)
  h.drop(me);                     // down to the floor
  h.waitFor(() => h.g.gatesOpen, 3, 'Anna holds the plate on this side');
  h.walk(me, 5);                  // back through the gate, to the ice step
  h.hop(me, 4, false, { row: 10 });
  h.hop(me, 5, false, { row: 8 });
  h.hop(me, 3, false, { row: 6 });
  h.walk(me, 1);                  // heart at (1,6)
  h.walk(me, 3);
  h.hop(me, 4, false, { row: 4 });
  h.walk(me, 6);                  // snowflake at (6,4): the door opens
  h.walk(me, 7);
  h.expectStars();
  h.walk(me, 10);                 // (Anna melts the pink wall) the door
  if (!h.g.memoryFound) throw new Error('tower: the memory fragment was not found');
};
