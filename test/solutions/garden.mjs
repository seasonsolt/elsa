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
};

/* Solo: one sister does it all and takes every small star (Frost freezes the pond herself, otherwise the companion does). The
   companion keeps away from the flowers until the child has opened one, so the first flower is the player's. */
export const solo = async (h, me) => {
  const other = me === 'nuan' ? 'frost' : 'nuan', g = h.g, step = g.step;
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
  if (me === 'frost') { h.face(me, 'right'); h.act(me); }     // otherwise the companion freezes the pond
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
  h.expectStars();
  if (!h.g.memoryFound) throw new Error('garden: the memory fragment was not found');
  h.drop(me);                     // down to terrace 2
  h.drop(me);                     // and to the floor
  h.walk(me, 21);                 // the last flower at (21,11)
};
