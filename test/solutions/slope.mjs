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
};

/* Solo: one sister does it all. Down the first slide (memory fragment on the first landing), down the second, up the ledges
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
  h.expectStars();
  h.walk(me, 20);
  h.walk(me, 21);                 // the door
  if (!h.g.memoryFound) throw new Error('slope: the memory fragment was not found');
  const other = me === 'nuan' ? 'frost' : 'nuan';
  const slides = h.log.filter(e => e.type === 'slide' && e.who === other).length;
  if (slides < 3) throw new Error(`slope: the companion slid ${slides} times, she should slide down with the player`);
};
