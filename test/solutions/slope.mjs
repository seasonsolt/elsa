/* Slope: both sisters slide down the two ramps, then climb the zig-zag ledges on the right: Frost takes the snowflake on the second
   ledge, Nuan goes on up to the bridge for the heart and slides down once more. */
export const duo = async (h) => {
  h.walk('frost', 14);            // slide: the ramps do the work, small star at (6,6) on the way
  h.hop('frost', 16);             // ledge 1
  h.hop('frost', 18);             // ledge 2
  h.walk('frost', 19);            // snowflake at (19,6)
  h.walk('frost', 21);            // off the ledge, down to the floor

  h.walk('nuan', 14);
  h.hop('nuan', 16);
  h.hop('nuan', 18);
  h.hop('nuan', 17);              // ledge 3
  h.hop('nuan', 18);              // ledge 4
  h.hop('nuan', 19, false, { row: 2 });   // up onto the bridge
  h.walk('nuan', 12);             // heart at (12,2)
  h.walk('nuan', 3);
  h.drop('nuan');                 // down onto the start shelf
  h.walk('nuan', 14);             // and down the slides again
  h.walk('nuan', 21);
  h.walk('frost', 21);

  /* Screen 2, the snow hill: both start on the top of the hill, a slide goes down each side. The right one ends above a little pool:
     the slide is fast enough to fly over it (small star in the air). Steps lead up both sides to the bridges back to the top; the door
     is on a ledge just past the end of the right bridge, behind a pink wall. Frost takes the right snowflake, then the one in the little snow cave
     under the left slide; Nuan the left heart, then the right one, which opens the door, and melts the wall; Frost slides down the
     right side once more and climbs up to the door. */
  h.nextScreen();
  h.walk('frost', 18);            // down the right slide, over the pool, small star at (16,7)
  h.walk('frost', 22);            // small star at (22,10)
  h.hop('frost', 20, false, { row: 8 });
  h.hop('frost', 21, false, { row: 7 });
  h.walk('frost', 22);            // snowflake at (22,7), under the door's ledge
  h.walk('frost', 19);            // down onto the step below (out from under the ledge)
  h.hop('frost', 18, false, { row: 6 });
  h.hop('frost', 18, false, { row: 4 });
  h.hop('frost', 18, false, { row: 2 });  // the right bridge
  h.walk('frost', 11);            // back on the top of the hill
  h.walk('frost', 4);             // down the left slide, small star at (4,9)
  h.walk('frost', 8);             // into the snow cave under the slide: snowflake at (8,10)
  h.walk('frost', 3);
  h.hop('frost', 2, false, { row: 8 });
  h.hop('frost', 3, false, { row: 6 });
  h.hop('frost', 1, false, { row: 4 });
  h.hop('frost', 2, false, { row: 2 });   // the left bridge, small star at (1,2) on the way
  h.walk('frost', 1);
  h.walk('frost', 10);            // back on the top

  h.walk('nuan', 4);              // down the left slide
  h.hop('nuan', 2, false, { row: 8 });
  h.hop('nuan', 3, false, { row: 6 });
  h.hop('nuan', 1, false, { row: 4 });    // heart at (1,4)
  h.hop('nuan', 2, false, { row: 2 });
  h.walk('nuan', 10);             // back on the top
  h.walk('nuan', 18);             // down the right slide, over the pool
  h.hop('nuan', 19, false, { row: 8 });
  h.hop('nuan', 18, false, { row: 6 });
  h.hop('nuan', 18, false, { row: 4 });   // heart at (18,4): the door opens
  h.walk('nuan', 19);
  h.act('nuan');                  // melt the pink wall in front of the door's ledge
  h.walk('nuan', 22);             // the door, at the end of the right bridge
  h.walk('frost', 18);            // down the right slide once more
  h.hop('frost', 19, false, { row: 8 });
  h.hop('frost', 18, false, { row: 6 });
  h.hop('frost', 18, false, { row: 4 });
  h.walk('frost', 22);            // the door
};

/* Solo: Elsa does it all. Down the first slide (memory fragment on the first landing), down the second, up the ledges
   (snowflake), over the bridge for the heart and the high stars, back to the start shelf and down again, this time jumping for the
   star above the second slide. The last small star near the door is taken before the heart opens the door. */
export const solo = async (h, me) => {
  h.walk(me, 9);                  // first slide, small star at (6,6); the first landing
  h.hop(me, 9);                   // memory fragment at (9,6)
  h.walk(me, 14);                 // second slide
  h.hop(me, 16);                  // ledge 1
  h.hop(me, 18);                  // ledge 2
  h.walk(me, 19);                 // snowflake at (19,6)
  h.walk(me, 21);                 // off the ledge
  h.hop(me, 21);                  // small star at (21,9)
  h.walk(me, 14);
  h.hop(me, 16);
  h.hop(me, 18);
  h.hop(me, 17);                  // ledge 3
  h.hop(me, 18);                  // ledge 4
  h.hop(me, 19, false, { row: 2 });   // up onto the bridge
  h.walk(me, 16);                 // small star at (16,2)
  h.walk(me, 12);                 // heart at (12,2): the door opens
  h.walk(me, 9);                  // small star at (9,2)
  h.walk(me, 3);
  h.drop(me);                     // down onto the start shelf
  h.walk(me, 9);                  // slide again
  h.hop(me, 12);                  // small star at (11,7), above the second slide
  h.walk(me, 14);
  h.walk(me, 20);
  h.walk(me, 21);                 // the door

  /* Screen 2, the snow hill: down the right slide and over the pool (the small star in the air), the star in the corner, up the steps
     for the snowflake and the heart, over the bridge back to the top, down the left slide (small star where she lands), into the snow
     cave for the snowflake, up the steps for the heart and the star on the bridge, back to the top, down the right slide once more and
     up the steps to the door (Anna melts the pink wall in front of it). */
  h.nextScreen();
  h.walk(me, 18);                 // right slide, small star at (16,7) in the air
  h.walk(me, 22);                 // small star at (22,10)
  h.hop(me, 20, false, { row: 8 });
  h.hop(me, 21, false, { row: 7 });
  h.walk(me, 22);                 // snowflake at (22,7), under the door's ledge
  h.walk(me, 19);                 // down onto the step below (out from under the ledge)
  h.hop(me, 18, false, { row: 6 });
  h.hop(me, 18, false, { row: 4 });       // heart at (18,4)
  h.hop(me, 17, false, { row: 2 });       // the right bridge
  h.walk(me, 11);                 // back on the top of the hill
  h.walk(me, 4);                  // left slide, small star at (4,9)
  h.walk(me, 8);                  // into the snow cave under the slide: snowflake at (8,10)
  h.walk(me, 3);
  h.hop(me, 2, false, { row: 8 });
  h.hop(me, 3, false, { row: 6 });
  h.hop(me, 1, false, { row: 4 });        // heart at (1,4): the door opens
  h.hop(me, 2, false, { row: 2 });
  h.walk(me, 1);                  // small star at (1,2)
  h.walk(me, 10);                 // back on the top
  h.walk(me, 18);                 // right slide again
  h.hop(me, 19, false, { row: 8 });
  h.hop(me, 18, false, { row: 6 });
  h.hop(me, 19, false, { row: 4 });
  h.expectStars();
  h.walk(me, 22);                 // (Anna melts the pink wall) the door, on the ledge past the end of the right bridge
  if (!h.g.memoryFound) throw new Error('slope: the memory fragment was not found');
  const other = 'nuan';
  const slides = h.log.filter(e => e.type === 'slide' && e.who === other).length;
  if (slides < 3) throw new Error(`slope: the companion slid ${slides} times, she should slide down with the player`);
};
