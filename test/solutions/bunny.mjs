/* Bunny: Nuan climbs the two steps on the left for the heart. Frost wakes the bunny on the left floor and the one on the mound,
   hops over the mound, freezes the pit (the bunnies cannot cross water), wakes the third bunny on the far bank and walks to the
   nest with all three behind her. Then she climbs the two steps on the right for the snowflake and both go to the door. */
export const duo = async (h) => {
  h.hop('nuan', 4);               // step 1 (small star at (4,8) on the way)
  h.hop('nuan', 2);               // step 2
  h.walk('nuan', 2);              // heart at (2,6)
  h.walk('nuan', 4);              // off the step, down to the floor

  h.walk('frost', 6);             // the first bunny wakes up
  h.hop('frost', 9);              // the second bunny, on the mound at (10,10), wakes up
  h.walk('frost', 9);
  h.hop('frost', 11);             // over the mound, the bunnies follow
  h.face('frost', 'right');
  h.act('frost');                 // ice on the pit, columns 12..14
  h.walk('frost', 16);            // the third bunny wakes up
  h.walk('frost', 19);            // the nest at (19,11)
  h.waitFor(h => h.g.bunniesHome === 3, 15, 'all three bunnies at home');
  h.hop('frost', 19, false, { row: 9 });   // step 1 on the right
  h.hop('frost', 21);             // step 2
  h.walk('frost', 21);            // snowflake at (21,6)
  h.walk('frost', 19);            // off the step
  h.walk('frost', 22);            // the door

  h.walk('nuan', 9);
  h.hop('nuan', 11);              // over the mound
  h.walk('nuan', 22);
};

/* Solo: the player does everything and the bunnies follow her (in solo she is always their leader). Frost freezes the pit
   herself; when Nuan plays, the companion Frost freezes it as she walks up to it. */
export const solo = async (h, me) => {
  h.hop(me, 3);                   // step 1
  h.walk(me, 4);                  // small star at (4,8)
  h.walk(me, 3);
  h.hop(me, 2);                   // step 2
  h.walk(me, 2);                  // heart at (2,6)
  h.walk(me, 4);                  // off the step, down to the floor
  h.walk(me, 6);                  // the first bunny wakes up
  h.walk(me, 9);                  // the second one, on the mound, wakes up
  h.hop(me, 9);                   // small star at (9,8)
  h.hop(me, 11);                  // over the mound
  if (me === 'frost') { h.face(me, 'right'); h.act(me); }     // otherwise the companion freezes the pit
  h.waitFor(() => [12, 13, 14].every(c => h.g.grid[12][c] === 'I'), 6, 'ice on the pit');
  h.walk(me, 13);
  h.hop(me, 13);                  // memory fragment at (13,9)
  h.walk(me, 15);
  h.hop(me, 16);                  // small star at (16,8); the third bunny wakes up
  h.walk(me, 19);                 // the nest at (19,11)
  h.waitFor(h => h.g.bunniesHome === 3, 15, 'all three bunnies at home');
  h.hop(me, 19, false, { row: 9 });  // step 1 on the right, small star at (19,8)
  h.hop(me, 21);                  // step 2
  h.walk(me, 21);                 // snowflake at (21,6)
  h.expectStars();
  h.walk(me, 19);                 // off the step
  h.walk(me, 22);                 // the door
  if (!h.g.memoryFound) throw new Error('bunny: the memory fragment was not found');
};
