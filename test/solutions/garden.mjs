/* Garden: eight ice flowers, Nuan's lantern opens them when she touches them (in duo only Nuan's touch counts). Frost freezes the pond
   so Nuan can get across, then Nuan climbs the terraces (the fourth one is the highest) and comes down to the last flower on the right
   floor: all open = clear and, this being the last room, the ending. */
export const duo = async (h) => {
  h.hop('nuan', 2, false, { row: 9 });    // the little tower on the left: step
  h.hop('nuan', 3, false, { row: 7 });    // ledge
  h.hop('nuan', 2, false, { row: 5 });    // top
  h.walk('nuan', 1);              // flower at (1,5)
  h.walk('nuan', 3);              // off the top, down to the ledge
  h.walk('nuan', 5);              // and to the floor
  h.walk('nuan', 4);              // flower at (4,11)
  h.walk('frost', 6);
  h.act('frost');                 // ice on the pond, columns 7..9
  h.walk('nuan', 12);             // flower at (12,11)
  h.hop('nuan', 13, false, { row: 9 });   // terrace 1
  h.walk('nuan', 12);             // flower at (12,9)
  h.walk('nuan', 14);
  h.hop('nuan', 16, false, { row: 7 });   // terrace 2
  h.walk('nuan', 17);             // flower at (17,7)
  h.hop('nuan', 20, false, { row: 5 });   // terrace 3
  h.walk('nuan', 21);             // flower at (21,5)
  h.walk('nuan', 19);
  h.hop('nuan', 18, false, { row: 3 });   // terrace 4
  h.walk('nuan', 16);             // flower at (16,3)
  h.drop('nuan');                 // down to terrace 2
  h.drop('nuan');                 // and to the floor
  h.walk('nuan', 21);             // the last flower at (21,11): the garden is open

  /* Screen 2, the ice greenhouse: three floors, each with a wide pond and a pink ice wall, and the steps up in the shaft on the right.
     The sisters start on the lower floor near the shaft: a flower in its corner, then left over the pond to the wall and the flower
     behind it and back, up the step to the middle floor, left over its pond to its wall and the flower behind it and back, up the
     next step to the top floor, left over its pond to the last wall: behind it the last flower. The twist: some flowers sleep behind pink ice; Nuan's warm magic
     melts the wall, then the flower can be woken. Frost goes ahead and freezes the three ponds (each is five wide: freeze, step onto
     the ice, freeze again), Nuan melts the three walls and wakes the six flowers. */
  h.nextScreen();
  h.walk('nuan', 22);             // flower at (22,11)
  h.walk('frost', 13);
  h.face('frost', 'left');
  h.act('frost');                 // ice on the lower pond, columns 12..10
  h.walk('frost', 10);
  h.act('frost');                 // and 9..8
  h.walk('nuan', 6);
  h.act('nuan');                  // the pink wall in column 5 melts
  h.walk('nuan', 1);              // flower at (1,11)
  h.walk('frost', 18);
  h.hop('frost', 19, false, { row: 9 });  // step
  h.hop('frost', 17, false, { row: 7 });  // the middle floor
  h.walk('frost', 14);
  h.face('frost', 'left');
  h.act('frost');                 // ice on the middle pond, columns 13..11
  h.walk('frost', 11);
  h.act('frost');                 // and 10..9
  h.walk('nuan', 18);
  h.hop('nuan', 19, false, { row: 9 });   // step
  h.hop('nuan', 17, false, { row: 7 });   // the middle floor
  h.walk('nuan', 15);             // flower at (15,7)
  h.walk('nuan', 6);
  h.act('nuan');                  // the pink wall in column 5 melts
  h.walk('nuan', 1);              // flower at (1,7)
  h.walk('frost', 17);
  h.hop('frost', 18, false, { row: 5 });  // step in the shaft
  h.hop('frost', 16, false, { row: 3 });  // the top floor
  h.walk('frost', 15);
  h.face('frost', 'left');
  h.act('frost');                 // ice on the top pond, columns 14..12
  h.walk('frost', 12);
  h.act('frost');                 // and 11..10
  h.walk('nuan', 17);
  h.hop('nuan', 18, false, { row: 5 });   // step in the shaft
  h.hop('nuan', 16, false, { row: 3 });   // the top floor
  h.walk('nuan', 16);             // flower at (16,3)
  h.walk('nuan', 7);
  h.act('nuan');                  // the pink wall in column 6 melts
  h.walk('nuan', 1);              // the last flower at (1,3): the garden is open
};

/* Solo: one sister does it all and takes every small star (Elsa freezes the pond herself). The
   companion keeps away from the flowers until the child has opened one, so the first flower is the player's. */
export const solo = async (h, me) => {
  const other = 'nuan', g = h.g, step = g.step;
  const touches = (s, f) => s.x < (f.c + 1) * 40 + 4 && s.x + s.w > f.c * 40 - 4 && s.y < (f.r + 1) * 40 && s.y + s.h > f.r * 40;
  g.step = dt => {                // until the child has opened a flower the companion keeps out of reach of every one of them
    const none = g.flowers.every(f => !f.open);
    step(dt);
    const c = g.sisters[other];
    if (none && g.flowers.some(f => f.open) && !g.flowers.some(f => f.open && touches(g.sisters[me], f)) && g.flowers.some(f => f.open && touches(c, f))) {
      throw new Error('garden: the companion opened the first flower');
    }
  };
  h.hop(me, 2, false, { row: 9 });        // the little tower on the left: step
  h.hop(me, 3, false, { row: 7 });        // ledge
  h.hop(me, 2, false, { row: 5 });        // top
  h.walk(me, 1);                  // flower at (1,5): the first one
  h.walk(me, 3);                  // off the top, down to the ledge
  h.walk(me, 5);                  // and to the floor
  h.walk(me, 4);                  // flower at (4,11)
  h.hop(me, 6);                   // small star at (6,8)
  h.face(me, 'right'); h.act(me); // Elsa freezes the pond herself
  h.waitFor(() => [7, 8, 9].every(c => h.g.grid[12][c] === 'I'), 6, 'ice on the pond');
  h.walk(me, 8);
  h.hop(me, 8);                   // small star at (8,9)
  h.walk(me, 12);                 // flower at (12,11)
  h.hop(me, 13, false, { row: 9 });       // terrace 1
  h.walk(me, 14);                 // memory fragment at (14,9)
  h.walk(me, 12);                 // flower at (12,9)
  h.walk(me, 14);
  h.hop(me, 16, false, { row: 7 });       // terrace 2
  h.walk(me, 15);                 // small star at (15,6)
  h.walk(me, 17);                 // flower at (17,7)
  h.hop(me, 19, false, { row: 5 });       // terrace 3
  h.walk(me, 19);                 // small star at (19,4)
  h.walk(me, 21);                 // flower at (21,5)
  h.walk(me, 19);
  h.hop(me, 18, false, { row: 3 });       // terrace 4
  h.walk(me, 16);                 // flower at (16,3)
  if (!h.g.memoryFound) throw new Error('garden: the memory fragment was not found');
  h.drop(me);                     // down to terrace 2
  h.drop(me);                     // and to the floor
  h.walk(me, 21);                 // the last flower at (21,11)

  /* Screen 2, the ice greenhouse: Elsa wakes the first flower herself (the companion keeps away until then, the check above still
     runs), freezes the lower pond in two goes, and the companion melts the pink wall when Elsa comes up to it; the flower behind it,
     back over the ice and up the step in the shaft; the middle floor the same way (a flower, the pond, the wall, a flower behind it,
     back); up the next step to the top floor: a flower, the pond (small star over it), the last wall, and the last flower behind it. */
  const iced = (r, cols) => cols.every(c => h.g.grid[r][c] === 'I');
  h.nextScreen();
  h.walk(me, 22);                 // flower at (22,11): the first one
  h.walk(me, 13);
  h.face(me, 'left'); h.act(me);  // ice on the lower pond ...
  h.walk(me, 10);
  h.act(me);                      // ... all the way across
  h.waitFor(() => iced(12, [8, 9, 10, 11, 12]), 6, 'ice on the lower pond');
  h.walk(me, 6);                  // small star at (7,10)
  h.waitFor(() => h.g.grid[11][5] !== 'X', 6, 'the companion melts the first pink wall');
  h.walk(me, 1);                  // flower at (1,11)
  h.walk(me, 18);                 // back over the ice
  h.hop(me, 20, false, { row: 9 });       // step, small star at (20,9)
  h.walk(me, 19);
  h.hop(me, 17, false, { row: 7 });       // the middle floor
  h.walk(me, 15);                 // flower at (15,7)
  h.walk(me, 14);
  h.face(me, 'left'); h.act(me);  // ice on the middle pond ...
  h.walk(me, 11);
  h.act(me);                      // ... all the way across
  h.waitFor(() => iced(8, [9, 10, 11, 12, 13]), 6, 'ice on the middle pond');
  h.walk(me, 6);
  h.waitFor(() => h.g.grid[7][5] !== 'X', 6, 'the companion melts the second pink wall');
  h.walk(me, 1);                  // flower at (1,7)
  h.walk(me, 17);                 // back over the ice
  h.hop(me, 18, false, { row: 5 });       // step in the shaft
  h.hop(me, 16, false, { row: 3 });       // the top floor: flower at (16,3)
  h.walk(me, 15);
  h.face(me, 'left'); h.act(me);  // ice on the top pond ...
  h.walk(me, 12);                 // small star at (13,2)
  h.act(me);                      // ... all the way across
  h.waitFor(() => iced(4, [10, 11, 12, 13, 14]), 6, 'ice on the top pond');
  h.walk(me, 7);
  h.waitFor(() => h.g.grid[3][6] !== 'X', 6, 'the companion melts the last pink wall');
  h.expectStars();
  h.walk(me, 1);                  // the last flower at (1,3)
};
