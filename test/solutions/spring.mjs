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

  h.nextScreen();
  /* Screen 2: up with the mushrooms, down with the slides. The sisters start in a little den under the start ledge; the mushroom in
     its corner throws them up onto it. A slide runs down into a hollow whose mushroom throws a sister onto the middle hill or, steering
     back, onto the little ledge over the slide (snowflake; walking off it drops her back into the hollow). A second slide, ledge (small
     star) and mushroom lead to the far hill and the door. The heart is on the long shelf under the ceiling: only the corner mushroom on
     the far hill throws her up there, through the thin end of the shelf; from the heart she drops through its other thin end onto the
     start ledge and slides and bounces across once more. */
  bounce(h, 'frost', 3, 2, 7);    // out of the den onto the start ledge
  h.walk('frost', 8);             // down the first slide, small star at (5,8) on the way
  bounce(h, 'frost', 9, 6, 5);    // the mushroom in the hollow, steering back onto the ledge over the slide
  h.walk('frost', 6);             // snowflake at (6,5)
  h.walk('frost', 8);             // off the ledge, back into the hollow
  bounce(h, 'frost', 9, 11, 7);   // up onto the middle hill
  h.hop('frost', 11);             // small star at (11,4) over the hill
  h.walk('frost', 17);            // down the second slide
  bounce(h, 'frost', 18, 19, 7);  // up onto the far hill
  h.walk('frost', 20);            // the door

  bounce(h, 'nuan', 3, 2, 7);
  h.walk('nuan', 8);
  bounce(h, 'nuan', 9, 11, 7);
  h.walk('nuan', 17);
  bounce(h, 'nuan', 18, 15, 5);   // back onto the ledge over the second slide
  h.walk('nuan', 15);             // small star at (15,5)
  h.walk('nuan', 17);             // off the ledge
  bounce(h, 'nuan', 18, 19, 7);
  h.walk('nuan', 21);
  bounce(h, 'nuan', 22, 22, 2);   // the corner mushroom: up through the end of the shelf
  h.walk('nuan', 2);              // small star at (12,2), heart at (2,2)
  h.drop('nuan');                 // down through the end of the shelf, back where they started
  h.walk('nuan', 8);              // and across once more
  bounce(h, 'nuan', 9, 11, 7);
  h.walk('nuan', 17);
  bounce(h, 'nuan', 18, 19, 7);
  h.walk('nuan', 20);             // the door
};

/* Solo: Elsa does it all and takes every small star. The companion follows by the mushrooms. */
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
  h.walk(me, 18);                 // off the ledge
  h.walk(me, 21);                 // the door

  h.nextScreen();
  bounce(h, me, 3, 2, 7);         // out of the den onto the start ledge
  h.walk(me, 8);                  // first slide, small star at (5,8)
  bounce(h, me, 9, 6, 5);         // back onto the ledge over the slide
  h.walk(me, 6);                  // snowflake at (6,5)
  h.walk(me, 8);                  // off the ledge
  bounce(h, me, 9, 11, 7);        // up onto the middle hill
  h.hop(me, 11);                  // small star at (11,4) over the hill
  h.walk(me, 17);                 // second slide
  bounce(h, me, 18, 15, 5);       // back onto the ledge over the second slide
  h.walk(me, 15);                 // small star at (15,5)
  h.walk(me, 17);                 // off the ledge
  bounce(h, me, 18, 19, 7);       // up onto the far hill
  h.walk(me, 21);
  bounce(h, me, 22, 22, 2);       // the corner mushroom: up onto the shelf
  h.walk(me, 2);                  // small star at (12,2), heart at (2,2)
  h.drop(me);                     // back down to the start
  h.walk(me, 8);                  // and across once more
  bounce(h, me, 9, 11, 7);
  h.walk(me, 17);
  bounce(h, me, 18, 19, 7);
  h.expectStars();
  h.walk(me, 20);                 // the door
  if (!h.g.memoryFound) throw new Error('spring: the memory fragment was not found');
  const other = 'nuan';
  const used = h.log.filter(e => e.type === 'bounce' && e.who === other).length;
  if (used < 2) throw new Error(`spring: the companion bounced ${used} times, she should follow the player up by the mushrooms`);
};
