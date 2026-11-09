# Game tests

Plain node (v18+), no npm packages.

```bash
node test/run.mjs                              # logic from src/*.js
node test/run.mjs --html ice-castle.html       # logic from a built page
node test/run.mjs --only lake --trace          # one room, print every step with both sisters' positions
node test/run.mjs --no-unit                    # skip test/unit
```

Exit code 1 when anything fails. `SKIP` is not a failure but a finished room has none: every room has a `solo` solution.

## What runs

Per room (`src/levels.js`): map is 13 x 24, every tile character is registered (`TILE_CHARS` in `logic.js`), one spawn each and the goal tile that matches `goal` (`door`, `snowman`, or `garden`: no door, at least one `F`), bunnies need a nest, a `melody` needs its steps, a floe needs water under it, an item reachability smoke check, the `duo` solution and
the `solo` solution (once with Nuan, once with Frost as the player). Then every test in `test/unit/*.test.mjs`.

The reachability check (`checks.mjs`) is deliberately generous: a grid search with approximate jump reach, Frost's ice
and Nuan's melting. It catches sealed-off items and missing plates, it does not prove a room is solvable. The solutions
do that. The approximations are listed at the top of the check.

## Content keys

`test/content_keys.mjs` (also run by `run.mjs`, standalone: `node test/content_keys.mjs`) checks that every voice line key the view
can ask for (`ch_<lv>`, `learn_<w>`, `pick_<w>_<n>`, `ui_<name>`, ...) exists in `src/content/lines.json` for all rooms, that a
family it lists is still played by `src/view/*.js`, that no unknown key-like literal appears in the view, that `{"w"}` ids exist,
and that every `art` / word icon / room background image is in `game/`. Add a family there when the view starts playing a new one.

## Writing a solution

`test/solutions/<levelId>.mjs`, one per room, a player's-eye script over the input API:

```js
export const duo = async (h) => {
  h.walk('nuan', 4);          // to the middle of column 4, then stands on the ground
  h.face('frost', 'right');   // act uses the direction she faces
  h.act('frost');             // ice block / ice path; a fizzle is an error unless { fizz: true }
  h.hop('frost', 6);          // jump, steer to column 6, land within one tile; hop(id, col, true) double-jumps (Nuan)
  h.drop('nuan');             // down through a one-way platform
  h.wait(0.5);
};
export const solo = async (h, me) => {   // drives only `me` ('nuan' or 'frost'); the companion does the rest
  h.walk(me, 4);
  if (me === 'nuan') h.act(me);           // things only Nuan can do are hers to do when she is the player
  h.expectStars();                        // every small star '+' of the room is in (checked before the door)
};
```

- Steps: `walk(id, col)`, `hop(id, col, dbl, { delay, row })`, `act(id, { fizz })`, `face(id, dir)`, `drop(id)`,
  `wait(sec)`, `waitFor(cond, maxSec)`. They are synchronous; `await` is allowed but not needed.
- The sister you do not mention stands still. Do things one sister at a time.
- Every step ends with the game stepped at 1/120 s through `g.input` / `g.press` only. A step that cannot finish
  throws with the room id, step name, step number and the sister's position. Falling in the water is an error.
- The solution ends when both are at the goal (the step loop stops once the state is `clear`). `run.mjs` then asserts
  `clear`, or `win` on the last room.
- `solo` runs in solo mode (`g.mode = 'solo'`, `KID_PHYS`, the companion stepped before every `g.step`), once with Nuan and once
  with Frost as `me`. It may only drive `me`; the harness throws if it touches the other sister. In solo both sisters collect
  everything and both double jump, so `hop(me, col, true)` works for Frost too. The same code runs for both players: branch on
  `me` only for what only that sister can do (Nuan melts a wall herself, Frost freezes water herself; when the other sister is the
  companion she does it when the player comes near).
- Solo physics are slower (180 px/s) and a hop ends at the first landing, so a landing spot that worked in duo may be a column
  deeper into the platform here. Do not stand beside the door before the last small star: reaching the door ends the room.
- `h.expectStars()` fails the step unless every `+` is collected, which proves each small star is reachable.
- The file name is the room's `id` (`levels.js`).

## Hand-made rooms (S3 toys)

`loadMap(rows, extra, { mode, player })` from `test/harness.mjs` (also in the unit-test context as `loadMap`) builds a tiny room on a **private
copy of the logic**, so `src/levels.js` stays untouched, and returns an ordinary harness `h` (`h.logic` is that private logic, `h.g` the game).
`rows` are the BOTTOM rows of the 13 x 24 map (missing top rows are air, row 0 is walls); a row shorter than 24 repeats its last character, so
`'#####'` is a floor to the edge. It needs one `E` and one `A`. `extra` is merged into the level object (`{ melody: [1, 2, 3], goal: 'garden',
guide: [...] }`); the id is `adhoc`, it is the last level, so a clear ends in `win`. Mode defaults to `duo`.
`h.place(id, col, row)` puts a sister with her feet on tile (col, row) (a blink plus 0.25 s of settling): test set-up, not a player action.
`h.allowSplash = true` lets a step go through water. `test/unit/toys.test.mjs` is the example: slopes, springs, bunnies, floes, notes, flowers,
and the level checks (`checks.mjs`) that know them.

## Unit tests

Drop `test/unit/<name>.test.mjs`. `test/solo-kit.mjs` (`soloGame`, `prng`) builds a game plus companion that is stepped by hand,
with `place(sister, col, row)` (via `g.blink`), `run(sec, each)` and an event log; used by `solo.test.mjs` (KID_PHYS, relaxations,
swap, blink, progress, guide, small stars, memory) and `companion.test.mjs` (follow, jump, wait at water, three blink triggers,
melt, freeze, plate, assists, role swap, a seeded random-player fuzz, and a check that the companion touches nothing but
`g.input`, `g.press` and `g.blink`). Objects made by the logic live in another vm realm: compare them with `JSON.parse(JSON.stringify(x))`. Every exported function is one test (a default export counts as well, named after
the file); it gets `{ logic, loadLogic, makeHarness, assert }` and fails by throwing (`assert` is `node:assert/strict`).

## Rule

**No green, no merge.** Any new room or logic change must come with a solution that passes `node test/run.mjs`, and
`python3 art/build_page.py` must still build. A change that breaks an existing solution has to fix the solution in the
same change and say why.
