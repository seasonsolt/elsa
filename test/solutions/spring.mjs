import { bounce } from './_kit.mjs';
/* Spring: the first mushroom throws a sister five tiles up, to the little ledge on the left (snowflake) or, steering right, onto the
   high shelf (a one-way ledge that goes on as the top of a tall wall). From the wall a second mushroom throws her up under the ceiling,
   where the heart is. A third mushroom on the right bank throws her to the high ledge there (snowflake); it also shuts the floor off,
   the way past it is up and over. Nuan takes the heart, Frost the two snowflakes. */
export const duo = async (h) => {
  h.hop('nuan', 2);               // small star at (2,8)
  h.walk('nuan', 3);
  bounce(h, 'nuan', 4, 7, 5);     // mushroom at (4,11), up onto the shelf
  h.walk('nuan', 8);              // small star at (8,4)
  h.hop('nuan', 10);              // memory fragment at (10,3)
  h.walk('nuan', 11);             // small star at (11,4)
  bounce(h, 'nuan', 12, 11, 2);   // the mushroom on the wall throws her up to the high ledge under the ceiling
  h.walk('nuan', 15);             // heart at (15,1)
  h.walk('nuan', 16);             // off the end of the ledge, down to the floor
  bounce(h, 'nuan', 17, 21, 5);   // the third mushroom is the way past it
  h.walk('nuan', 18);             // off the ledge, down on the far side

  h.walk('frost', 3);
  bounce(h, 'frost', 4, 2, 5);    // up onto the little ledge on the left
  h.walk('frost', 1);             // snowflake at (1,4)
  h.walk('frost', 3);             // off the ledge
  bounce(h, 'frost', 4, 7, 5);
  h.walk('frost', 11);
  bounce(h, 'frost', 12, 14, 2);
  h.walk('frost', 16);
  bounce(h, 'frost', 17, 21, 5);  // small star at (17,8) on the way
  h.walk('frost', 21);            // snowflake at (21,4)
  h.walk('frost', 18);            // off the ledge, down on the far side
  h.walk('frost', 21);
  h.walk('nuan', 21);             // the door
};

/* Solo: one sister does it all and takes every small star. The companion follows by the mushrooms. */
export const solo = async (h, me) => {
  h.hop(me, 2);                   // small star at (2,8)
  h.walk(me, 3);
  bounce(h, me, 4, 2, 5);         // up onto the little ledge on the left
  h.walk(me, 1);                  // snowflake at (1,4)
  h.walk(me, 3);                  // off the ledge
  bounce(h, me, 4, 7, 5);         // up onto the shelf
  h.walk(me, 6);                  // small star at (6,4)
  h.walk(me, 8);                  // small star at (8,4)
  h.hop(me, 10);                  // memory fragment at (10,3)
  h.walk(me, 11);                 // small star at (11,4)
  bounce(h, me, 12, 11, 2);       // the mushroom on the wall: up to the high ledge under the ceiling
  h.walk(me, 15);                 // heart at (15,1)
  h.walk(me, 16);                 // off the end of the ledge, down to the floor
  bounce(h, me, 17, 21, 5);       // small star at (17,8) on the way up
  h.walk(me, 21);                 // snowflake at (21,4)
  h.expectStars();
  h.walk(me, 18);                 // off the ledge
  h.walk(me, 21);                 // the door
  if (!h.g.memoryFound) throw new Error('spring: the memory fragment was not found');
  const other = me === 'nuan' ? 'frost' : 'nuan';
  const used = h.log.filter(e => e.type === 'bounce' && e.who === other).length;
  if (used < 2) throw new Error(`spring: the companion bounced ${used} times, she should follow the player up by the mushrooms`);
};
