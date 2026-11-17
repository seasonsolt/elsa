/* Music: five note steps on little ledges, the melody is red, yellow, blue = 1, 3, 5 (do, mi, so). The steps are in the wrong order
   on purpose: red (1) is the second ledge, yellow (3) the first, blue (5) the third; the orange (2) and green (4) ones, and the
   small stars, are there to explore. A wrong step is only a different tone, nothing is lost. Played here: red, then yellow, then
   blue; the door opens with the last one.

   Screen 2: the song is longer, red, yellow, blue, yellow, red = 1, 3, 5, 3, 1 (up the scale and back down), and the note steps are
   the stairs of a tower. Red on the floor is the step up to the long shelf, yellow at the shelf's left end the step up to the top
   shelf. Up there the door stands on a small platform at the left end (closed until the song is played: hop over it); blue waits at
   the far right end, on the way back come yellow and red, and from that red it is a hop onto the door's platform. Nothing but a note
   step reaches the next shelf (each is three tiles above the last), so the way up plays the song. */
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

  // Screen 2: Nuan plays the way up (red, yellow) and waits on the top shelf; Frost climbs after her (her red and yellow are only
  // tones now), hops over the door's platform, runs right to blue and back: yellow, then red beside the platform. The door opens with
  // that red.
  h.nextScreen();
  h.walk('nuan', 20);
  h.hop('nuan', 21);                        // red (1), the step up from the floor
  h.hop('nuan', 20, false, { row: 8 });     // onto the long shelf
  h.walk('nuan', 3);
  h.hop('nuan', 2);                         // yellow (3), the step up from the shelf
  h.hop('nuan', 3, false, { row: 5 });      // onto the top shelf
  h.walk('frost', 20);
  h.hop('frost', 21);
  h.hop('frost', 20, false, { row: 8 });
  h.walk('frost', 3);
  h.hop('frost', 2);
  h.hop('frost', 3, false, { row: 5 });
  h.hop('frost', 5, false, { row: 4 });     // onto the door's platform (closed)
  h.walk('frost', 7);                       // and down on the other side
  h.hop('frost', 10);                       // over red and yellow (a wrong step is only a tone)
  h.walk('frost', 11);
  h.hop('frost', 13);
  h.walk('frost', 20);
  h.hop('frost', 21);                       // blue (5), at the far end
  h.walk('frost', 19);
  h.walk('frost', 13);
  h.hop('frost', 12);                       // yellow (3)
  h.walk('frost', 10);
  h.walk('frost', 9);
  h.hop('frost', 8);                        // red (1): the song is done, the door opens
  h.hop('frost', 6, false, { row: 4 });     // onto the door's platform
  h.walk('frost', 5);                       // the door
  h.hop('nuan', 4, false, { row: 4 });
  h.walk('nuan', 5);
};

/* Solo: the player plays the melody and takes every small star; the companion must never stand on a note step (checked after every
   step of the game) and never plays one (in solo only the player's steps count). */
export const solo = async (h, me) => {
  const other = 'nuan', g = h.g, step = g.step;
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
  h.walk(me, 19);
  h.walk(me, 22);                           // the door
  if (!h.g.memoryFound) throw new Error('music: the memory fragment was not found');
  if (h.g.melody && !h.g.melody.done) throw new Error('music: the melody was not played');

  // Screen 2: the tower. The companion never uses the note steps, she follows by blinking onto the shelves.
  h.nextScreen();
  h.walk(me, 20);
  h.hop(me, 21);                            // red (1), the step up from the floor
  h.hop(me, 22);                            // down beside it: small star at (22,8) on the way
  h.hop(me, 21);                            // back on red (only a tone)
  h.hop(me, 20, false, { row: 8 });         // onto the long shelf
  h.walk(me, 3);
  h.hop(me, 2);                             // yellow (3), the step up from the shelf
  h.hop(me, 1);                             // down to the shelf's end: small star at (1,6) on the way
  h.hop(me, 2);                             // back on yellow (only a tone)
  h.hop(me, 3, false, { row: 5 });          // onto the top shelf
  h.hop(me, 5, false, { row: 4 });          // onto the door's platform (closed until the song is played)
  h.walk(me, 7);                            // and down on the other side
  h.hop(me, 10);                            // over red and yellow (a wrong step is only a tone)
  h.walk(me, 11);
  h.hop(me, 13);
  h.walk(me, 20);
  h.hop(me, 21);                            // blue (5), at the far end
  h.hop(me, 22);                            // down into the corner: small star at (22,4) on the way
  h.hop(me, 20);                            // back over blue (only a tone)
  h.walk(me, 13);
  h.hop(me, 12);                            // yellow (3)
  h.hop(me, 12);                            // straight up from it: small star at (12,2)
  h.walk(me, 10);
  h.walk(me, 9);
  h.hop(me, 8);                             // red (1): the song is done, the door opens
  h.hop(me, 6, false, { row: 4 });          // onto the door's platform
  h.expectStars();
  h.walk(me, 5);                            // the door
  if (!h.g.melody.done) throw new Error('music: the second melody was not played');
};
