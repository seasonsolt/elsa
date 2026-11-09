/* Music: five note steps on little ledges, the melody is red, yellow, blue = 1, 3, 5 (do, mi, so). The steps are in the wrong order
   on purpose: red (1) is the second ledge, yellow (3) the first, blue (5) the third; the orange (2) and green (4) ones, and the
   small stars, are there to explore. A wrong step is only a different tone, nothing is lost. Played here: red, then yellow, then
   blue; the door opens with the last one. */
export const duo = async (h) => {
  h.walk('nuan', 6);
  h.hop('nuan', 7, false, { row: 9 });      // ledge 2
  h.hop('nuan', 8);                         // red step (1): the first tone of the melody
  h.walk('nuan', 7);
  h.hop('nuan', 4);                         // ledge 1
  h.hop('nuan', 3);                         // yellow step (3): the second tone
  h.walk('nuan', 4);
  h.hop('nuan', 7);                         // ledge 2 again
  h.hop('nuan', 9);                         // over the red step (it is a little wall)
  h.hop('nuan', 12);                        // ledge 3
  h.hop('nuan', 13);                        // blue step (5): the melody is done, the door opens
  h.walk('nuan', 14);
  h.walk('nuan', 16);                       // off the ledge, down to the floor
  h.walk('nuan', 22);                       // the door
  h.walk('frost', 22);
};

/* Solo: the player plays the melody and takes every small star; the companion must never stand on a note step (checked after every
   step of the game) and never plays one (in solo only the player's steps count). */
export const solo = async (h, me) => {
  const other = me === 'nuan' ? 'frost' : 'nuan', g = h.g, step = g.step;
  g.step = dt => {
    step(dt);
    const s = g.sisters[other];
    if (s.noteAt) throw new Error(`music: the companion (${other}) stands on a note step at ${s.noteAt}`);
  };
  h.walk(me, 6);
  h.hop(me, 7, false, { row: 9 });          // ledge 2
  h.hop(me, 8);                             // red step (1): the first tone
  h.walk(me, 7);
  h.hop(me, 4);                             // ledge 1, small star at (5,8) on the way
  h.hop(me, 3);                             // yellow step (3): the second tone
  h.walk(me, 4);
  h.hop(me, 7);                             // ledge 2 again
  h.hop(me, 10);                            // small star at (10,8), down to the floor
  h.walk(me, 11);
  h.hop(me, 12, false, { row: 9 });         // ledge 3
  h.hop(me, 13);                            // blue step (5): the melody is done, the door opens
  h.walk(me, 14);
  h.hop(me, 14, false, { row: 7 });         // up to the high ledge
  h.hop(me, 16);                            // over the green step (4); small star at (16,6)
  h.walk(me, 17);
  h.walk(me, 18);                           // off the high ledge, down on ledge 4
  h.hop(me, 18);                            // the orange step (2), small star at (18,8)
  h.expectStars();
  h.walk(me, 19);
  h.walk(me, 22);                           // the door
  if (!h.g.memoryFound) throw new Error('music: the memory fragment was not found');
  if (h.g.melody && !h.g.melody.done) throw new Error('music: the melody was not played');
};
