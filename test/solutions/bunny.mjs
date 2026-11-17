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

  h.nextScreen();
  /* Screen 2: the nest is up on the left hill. Two slides run down into a hollow, one from each hill, with a ladder of little steps
     over each slide; from the top of the right ladder more steps lead up to a high bridge over the hollow. The bunnies can hop UP a
     slide (the sisters cannot, they slide down): a sister climbs the left ladder and the bunnies behind her hop up the slide below her
     to the nest. One bunny is in the hollow, one on the right hill (with the snowflake), one on the bridge (with the heart; walking off
     the left end of the bridge drops her onto the left ladder). The door is on the right hill. */
  const upLeft = id => {          // up the left ladder onto the hill with the nest; the bunnies hop up the slide
    h.hop(id, 8, false, { row: 9 });
    h.hop(id, 7, false, { row: 7 });
    h.hop(id, 5, false, { row: 6 });
    h.hop(id, 3, false, { row: 6 });
    h.walk(id, 2);
  };
  const upRight = id => {         // up the right ladder onto the right hill
    h.walk(id, 14);
    h.hop(id, 15, false, { row: 9 });
    h.hop(id, 16, false, { row: 7 });
    h.hop(id, 18, false, { row: 6 });
    h.hop(id, 20, false, { row: 6 });
  };
  h.walk('nuan', 9);              // her lantern wakes the bunny in the hollow
  upLeft('nuan');
  h.waitFor(h => h.g.bunniesHome === 1, 10, 'the hollow bunny at home');

  upRight('frost');               // snowflake at (20,6)
  h.walk('frost', 21);            // the bunny there wakes up
  h.walk('frost', 9);             // down the right slide with the bunny (small star at (17,9)), across the hollow
  upLeft('frost');
  h.waitFor(h => h.g.bunniesHome === 2, 10, 'the right bunny at home');

  h.walk('nuan', 12);             // down the left slide, small star at (6,9)
  upRight('nuan');
  h.hop('nuan', 19, false, { row: 4 });    // on up to the bridge
  h.walk('nuan', 16);
  h.hop('nuan', 15, false, { row: 2 });
  h.walk('nuan', 7);              // small star at (14,2), her lantern wakes the bunny, heart at (9,2); off the end of the bridge,
                                  // down onto the lowest step of the left ladder
  h.hop('nuan', 7, false, { row: 7 });     // the bunny hops up the slide below
  h.hop('nuan', 5, false, { row: 6 });
  h.hop('nuan', 3, false, { row: 6 });
  h.walk('nuan', 2);
  h.waitFor(h => h.g.bunniesHome === 3, 10, 'all three bunnies at home');
  for (const id of ['frost', 'nuan']) {    // down the left slide and up the right ladder to the door
    h.walk(id, 12);
    upRight(id);
    h.walk(id, 22);
  }
};

/* Solo: the player does everything and the bunnies follow her (in solo she is always their leader). Elsa freezes the pit
   herself. */
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
  h.face(me, 'right'); h.act(me); // Elsa freezes the pit herself
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
  h.walk(me, 19);                 // off the step
  h.walk(me, 22);                 // the door

  h.nextScreen();
  const upLeft = () => {          // up the left ladder onto the hill with the nest; the bunnies hop up the slide below her
    h.hop(me, 8, false, { row: 9 });
    h.hop(me, 7, false, { row: 7 });
    h.hop(me, 5, false, { row: 6 });
    h.hop(me, 3, false, { row: 6 });
    h.walk(me, 2);
  };
  const upRight = () => {         // up the right ladder onto the right hill
    h.walk(me, 14);
    h.hop(me, 15, false, { row: 9 });
    h.hop(me, 16, false, { row: 7 });
    h.hop(me, 18, false, { row: 6 });
    h.hop(me, 20, false, { row: 6 });
  };
  h.walk(me, 9);                  // the bunny in the hollow wakes up
  upLeft();
  h.waitFor(h => h.g.bunniesHome === 1, 10, 'the hollow bunny at home');
  h.walk(me, 12);                 // down the left slide, small star at (6,9)
  upRight();                      // snowflake at (20,6)
  h.walk(me, 21);                 // the bunny there wakes up
  h.walk(me, 9);                  // down the right slide with it (small star at (17,9)), across the hollow
  upLeft();
  h.waitFor(h => h.g.bunniesHome === 2, 10, 'the right bunny at home');
  h.walk(me, 12);                 // down the left slide again
  upRight();
  h.hop(me, 19, false, { row: 4 });   // on up to the bridge
  h.walk(me, 16);
  h.hop(me, 15, false, { row: 2 });
  h.walk(me, 7);                  // small star at (14,2), the bunny wakes up, heart at (9,2); off the end of the bridge, down onto
                                  // the lowest step of the left ladder
  h.hop(me, 7, false, { row: 7 });    // the bunny hops up the slide below
  h.hop(me, 5, false, { row: 6 });
  h.hop(me, 3, false, { row: 6 });
  h.walk(me, 2);
  h.waitFor(h => h.g.bunniesHome === 3, 10, 'all three bunnies at home');
  h.expectStars();
  h.walk(me, 12);                 // down the left slide
  upRight();
  h.walk(me, 22);                 // the door
  if (!h.g.memoryFound) throw new Error('bunny: the memory fragment was not found');
};
