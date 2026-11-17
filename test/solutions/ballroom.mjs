import { bounce } from './_kit.mjs';
/* Ballroom: little steps lead up to every platform (left, right, the middle one and the two high ones), each climb is a single jump.
   Nuan takes the heart on the left platform and the snowballs (middle, high left, high right), Frost the snowflake on the right
   platform. When the snowman is built both stand next to it. The pits only matter to someone who steps off the edge. */
export const duo = async (h) => {
  // Frost: the right side, up to the snowflake
  h.walk('frost', 15);            // small star at (15,10)
  h.hop('frost', 17, false, { row: 9 });  // step
  h.hop('frost', 18, false, { row: 8 });  // right platform
  h.walk('frost', 20);            // snowflake at (20,8)
  h.walk('frost', 17);            // off the platform, down the step
  h.walk('frost', 15);            // and down to the floor

  // Nuan: the left platform, the middle one, then the two high ones
  h.walk('nuan', 8);              // small star at (8,10)
  h.hop('nuan', 7, false, { row: 9 });
  h.walk('nuan', 6);
  h.hop('nuan', 5, false, { row: 8 });    // left platform
  h.walk('nuan', 3);              // heart at (3,8)
  h.walk('nuan', 5);
  h.hop('nuan', 6, false, { row: 6 });    // step
  h.hop('nuan', 8, false, { row: 5 });    // middle platform
  h.walk('nuan', 12);             // snowball at (12,5)
  h.walk('nuan', 8);
  h.hop('nuan', 7, false, { row: 4 });    // step to the high left platform
  h.walk('nuan', 6);
  h.hop('nuan', 5, false, { row: 2 });
  h.walk('nuan', 2);              // snowball at (2,2)
  h.walk('nuan', 6);              // off the platform, down the steps to the middle platform
  h.walk('nuan', 8);
  h.walk('nuan', 15);
  h.hop('nuan', 16, false, { row: 4 });   // step to the high right platform
  h.hop('nuan', 18, false, { row: 2 });
  h.walk('nuan', 21);             // snowball at (21,2)
  h.walk('nuan', 17);             // off the platform, down to the middle platform and the floor
  h.walk('nuan', 15);
  h.walk('nuan', 12);
  h.drop('nuan');
  h.walk('nuan', 13);             // the snowman
  h.walk('frost', 13);

  /* Screen 2: the snowballs are up high and the snowman is built on the stage in the middle. The twist: no steps up from the floor,
     a spring mushroom at each balcony throws a sister up, and it is also the only way back out of the corner under the balcony.
     From a balcony little steps lead on up to its top shelf and to the stage. Frost bounces up on the left, drops into the corner
     for the snowflake, bounces up again and climbs to the top shelf (snowball) and the stage (snowball); Nuan does the same on the
     right (heart in the corner, snowball on the top shelf) and comes over to the stage. Both stand at the snowman up there. */
  h.nextScreen();
  h.walk('frost', 7);
  bounce(h, 'frost', 6, 3, 7);    // up onto the left balcony
  h.walk('frost', 2);
  h.drop('frost');                // down into the corner: snowflake at (2,11)
  h.walk('frost', 5);
  bounce(h, 'frost', 6, 5, 7);    // and up again
  h.walk('frost', 6);
  h.hop('frost', 7, false, { row: 5 });   // step
  h.hop('frost', 5, false, { row: 3 });   // top shelf
  h.walk('frost', 2);             // snowball at (2,3)
  h.walk('frost', 6);             // off the shelf, down to the balcony
  h.hop('frost', 7, false, { row: 5 });   // step
  h.hop('frost', 10, false, { row: 4 });  // the stage: snowball at (10,4)
  h.walk('frost', 11);            // beside the snowman

  h.walk('nuan', 16);
  bounce(h, 'nuan', 17, 20, 7);   // up onto the right balcony
  h.walk('nuan', 21);
  h.drop('nuan');                 // down into the corner: heart at (21,11)
  h.walk('nuan', 18);
  bounce(h, 'nuan', 17, 18, 7);   // and up again
  h.walk('nuan', 17);
  h.hop('nuan', 16, false, { row: 5 });   // step
  h.hop('nuan', 18, false, { row: 3 });   // top shelf
  h.walk('nuan', 21);             // snowball at (21,3)
  h.walk('nuan', 17);             // off the shelf, down to the balcony
  h.hop('nuan', 16, false, { row: 5 });   // step
  h.hop('nuan', 13, false, { row: 4 });   // the stage: the snowman
};

/* Solo: the player climbs everything by the steps and takes every small star. */
export const solo = async (h, me) => {
  h.walk(me, 8);                  // small star at (8,10)
  h.hop(me, 7, false, { row: 9 });        // step beside the left pit
  h.walk(me, 6);
  h.hop(me, 5, false, { row: 8 });        // left platform
  h.walk(me, 3);                  // heart at (3,8)
  h.walk(me, 5);
  h.hop(me, 6, false, { row: 6 });        // step
  h.hop(me, 8, false, { row: 5 });        // middle platform
  h.walk(me, 9);                  // small star at (9,5)
  h.walk(me, 12);                 // snowball at (12,5)
  h.walk(me, 8);
  h.hop(me, 7, false, { row: 4 });        // step to the high left platform
  h.walk(me, 6);
  h.hop(me, 5, false, { row: 2 });
  h.walk(me, 2);                  // snowball at (2,2)
  h.walk(me, 6);                  // off the platform, down the steps
  h.walk(me, 8);
  h.walk(me, 15);
  h.hop(me, 16, false, { row: 4 });       // step to the high right platform
  h.hop(me, 18, false, { row: 2 });
  h.walk(me, 19);                 // memory fragment at (19,2)
  h.walk(me, 21);                 // snowball at (21,2)
  h.walk(me, 17);                 // off the platform, down the steps
  h.walk(me, 15);
  h.walk(me, 16);
  h.walk(me, 18);                 // the right platform
  h.walk(me, 20);                 // snowflake at (20,8)
  h.walk(me, 22);                 // small star at (22,8)
  h.walk(me, 17);                 // off the platform, down the step to the floor
  h.walk(me, 15);                 // small star at (15,10)
  h.walk(me, 13);                 // the snowman
  if (!h.g.memoryFound) throw new Error('ballroom: the memory fragment was not found');

  /* Screen 2: Elsa bounces up onto the left balcony, drops into the corner (small star, snowflake), bounces up again, climbs to the
     top shelf (snowball), back down to the balcony and up the step to the stage (snowball, small star; the snowman waits there),
     over the right step to the right top shelf (snowball), down to the right balcony (small star) and into the corner (heart),
     bounces up again and climbs back to the snowman on the stage. The companion follows by the spring mushrooms (or her blink). */
  h.nextScreen();
  h.walk(me, 7);
  bounce(h, me, 6, 3, 7);         // up onto the left balcony
  h.walk(me, 2);
  h.drop(me);                     // down into the corner: snowflake at (2,11)
  h.walk(me, 5);                  // small star at (4,10)
  bounce(h, me, 6, 5, 7);         // and up again
  h.walk(me, 6);
  h.hop(me, 7, false, { row: 5 });        // step
  h.hop(me, 5, false, { row: 3 });        // top shelf
  h.walk(me, 2);                  // snowball at (2,3)
  h.walk(me, 6);                  // off the shelf, down to the balcony
  h.hop(me, 7, false, { row: 5 });        // step
  h.hop(me, 10, false, { row: 4 });       // the stage: snowball at (10,4)
  h.walk(me, 13);                 // past the snowman, small star at (13,4)
  h.hop(me, 15, false, { row: 5 });       // step on the right
  h.walk(me, 16);
  h.hop(me, 18, false, { row: 3 });       // top shelf
  h.walk(me, 21);                 // snowball at (21,3)
  h.walk(me, 17);                 // off the shelf, down to the balcony (small star at (18,6))
  h.walk(me, 21);
  h.drop(me);                     // down into the corner: heart at (21,11)
  h.expectStars();
  h.walk(me, 18);
  bounce(h, me, 17, 18, 7);       // and up again
  h.walk(me, 17);
  h.hop(me, 16, false, { row: 5 });       // step
  h.hop(me, 13, false, { row: 4 });       // the stage
  h.walk(me, 12);                 // the snowman
};
