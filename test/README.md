# Game tests

The tests are plain node (v18+) and need no npm packages. Lint and the type check are dev tools installed with `npm ci`.

```bash
make check                                     # the whole gate: eslint, tsc --checkJs, node test/run.mjs, fresh build == ice-castle.html
node test/run.mjs                              # logic from src/*.js
node test/run.mjs --html ice-castle.html       # logic from a built page
node test/run.mjs --only lake --trace          # one room, print every step with both sisters' positions
node test/run.mjs --no-unit                    # skip test/unit
```

Browser acceptance: run `node test/build-browser-review.mjs`, serve the repository, open
`/.tools/s56/review.html`, and click **Run acceptance**. This uses its own save key and accelerates
audio/scene timing only in the generated fixture. It checks all ten chapter/clear/quiz flows,
every word heard at least once per room (including skipped chapters; the in-context count is the static exposure gate), the quiz leaving only through its skip button, progress/settings persistence,
parent-modal pause, stickers, and 10/20-second hints. This complements the 30 input-driven physics
solutions; accelerated audio is not a human listening test or a child play-time measurement.

Exit code 1 when anything fails. `make check` is what CI runs (`.github/workflows/check.yml` only calls it); run it before committing. Its last step
builds the page into `.tools/fresh-ice-castle.html` and requires it to be byte-identical to `ice-castle.html` as it is in the working tree (staged or
not), so a source change cannot land without the rebuilt page: after changing `src/` or `art/page.template.html` run `make build` (= `python3 art/build_page.py`).
Lint covers `src/` and `test/` (`eslint.config.mjs`); the type check (`tsconfig.json`) covers `src/*.js`, `src/lib/*.js` and `src/view/*.js` as global scripts,
with `types/page.d.ts` for vendor-prefixed browser members. `test/`, `art/` and `castle3d/` are not type-checked.

Exit code 1 when anything fails. `SKIP` is not a failure but a finished room has none: every room has a `solo` solution.
The solo column is `solo/frost`: Elsa is the only solo player, Anna is the companion (there is no run with Anna as the player).

## What runs

Per room (`src/levels.js`): map is 13 x 24, every tile character is registered (`TILE_CHARS` in `logic.js`), one spawn each and the goal tile that matches `goal` (`door`, `snowman`, or `garden`: no door, at least one `F`), bunnies need a nest, a `melody` needs its steps, a floe needs water under it, an item reachability smoke check, the `duo` solution and
the `solo` solution (Elsa drives, the companion Anna does the rest). Then every test in `test/unit/*.test.mjs`.

The reachability check (`checks.mjs`) is deliberately generous: a grid search with approximate jump reach, Frost's ice
and Nuan's melting. It catches sealed-off items and missing plates, it does not prove a room is solvable. The solutions
do that. The approximations are listed at the top of the check.

## Content keys

`test/content_keys.mjs` (also run by `run.mjs`, standalone: `node test/content_keys.mjs`) checks that every voice line key the view
can ask for (`ch_<lv>`, `learn_<w>`, `pick_<w>_<n>`, `ui_<name>`, ...) exists in `src/content/lines.json` for all rooms, that a
family it lists is still played by `src/view/*.js`, that no unknown key-like literal appears in the view, that `{"w"}` ids exist,
and that every `art` / word icon / room background image is in `game/`. Add a family there when the view starts playing a new one.
It also asks `art/narration.py` (`--dry-run` and `--prune --dry-run`, no network, no ffmpeg) whether `game/` holds exactly the mp3 files the
content needs: a missing clip and an orphan mp3 (the clip of a removed or renamed line) both fail. After deleting or renaming a line run
`python3 art/narration.py --prune` to delete the orphans, then `python3 art/narration.py` to generate what is missing and rewrite `game/subs.json`.

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
export const solo = async (h, me) => {   // drives only `me` (always 'frost', Elsa); the companion Anna does the rest
  h.walk(me, 4);
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
- `solo` runs in solo mode (`g.mode = 'solo'`, `KID_PHYS`, the companion stepped before every `g.step`) with Elsa (`frost`) as `me`. It
  may only drive `me`; the harness throws if it touches Anna. In solo both sisters collect everything and both double jump, so
  `hop(me, col, true)` works for Elsa. Elsa freezes water herself; Anna melts a wall when Elsa comes near.
- Solo physics are slower (180 px/s) and a hop ends at the first landing, so a landing spot that worked in duo may be a column
  deeper into the platform here. Do not stand beside the door before the last small star: reaching the door ends the room.
- `h.expectStars()` fails the step unless every `+` is collected, which proves each small star is reachable.
- The file name is the room's `id` (`levels.js`).

## Hand-made rooms (S3 toys)

`loadMap(rows, extra, { mode })` from `test/harness.mjs` (also in the unit-test context as `loadMap`) builds a tiny room on a **private
copy of the logic**, so `src/levels.js` stays untouched, and returns an ordinary harness `h` (`h.logic` is that private logic, `h.g` the game).
`rows` are the BOTTOM rows of the 13 x 24 map (missing top rows are air, row 0 is walls); a row shorter than 24 repeats its last character, so
`'#####'` is a floor to the edge. It needs one `E` and one `A`. `extra` is merged into the level object (`{ melody: [1, 2, 3], goal: 'garden',
guide: [...] }`); the id is `adhoc`, it is the last level, so a clear ends in `win`. Mode defaults to `duo`.
`h.place(id, col, row)` puts a sister with her feet on tile (col, row) (a blink plus 0.25 s of settling): test set-up, not a player action.
`h.allowSplash = true` lets a step go through water. `test/unit/toys.test.mjs` is the example: slopes, springs, bunnies, floes, notes, flowers,
and the level checks (`checks.mjs`) that know them.

## Voice files (`game/`)

Besides the key families, `content_keys.mjs` asks `art/narration.py` about the audio: a missing mp3 (`--dry-run`, reason `missing`), an orphan mp3
(`--prune --dry-run`) and a `game/vo_manifest.json` that disagrees with the content (`--verify-manifest`: stale, unrecorded or extra clip) each fail the run.
The manifest holds `sha1(voice, rate, pitch, text)` per clip; a normal `python3 art/narration.py` redoes exactly the clips whose hash changed or whose file
is missing, `--write-manifest` records the files now present without synthesizing (use it only when the audio is known to match), `--prune` deletes orphans.
`test/unit/vo-manifest.test.mjs` and `narration.test.mjs` cover these hermetically (temp directories, stand-in `edge_tts` / `ffmpeg`, no network).

## Exposure report

`test/exposure.mjs` statically counts, per room and core word, the hearings in context on a normal playthrough and prints the table (`node test/exposure.mjs`,
`--write` regenerates `src/content/exposure.md`, `--check` exits 1 below the threshold of 6 or when that file is stale). `run.mjs` prints it and a word below 6
or a stale `exposure.md` fails the run (also under `--no-unit`); the clear page has no top-up loop any more (PLAN-2 C1). It reads the item-kind and toy tables from the view source, so a renamed table fails loudly.
`test/unit/exposure.test.mjs` pins the counting rules.

## View libs (`src/lib`)

Pure view logic (save sanitizing and merging, the voice queue, the word-heard counters, `canPlay`, spaced review `review.js`, sizes and gamepad focus picking `layout.js`, the picture plan and the offline-worker rule `assets.js`) lives in `src/lib/*.js` as plain global scripts without
`document` / `window`. Tests load them as files: `loadLib(names, context, expr)` from `test/harness.mjs` (also in the unit-test context) evaluates the named
lib files (all of them when `names` is null) in a fresh vm context holding the stand-ins you pass (`audio`, `game`, `LINES` ... as each file header lists),
and returns the value of `expr`, e.g. `loadLib(['voice', 'heard'], { ...stand-ins }, '({ voice })')`. Code that needs the real page (storage, the storage event,
`fitStage`) runs the real view fragment in a fake page (`test/unit/input-safety.test.mjs`, `save.test.mjs`, `fit-stage.test.mjs`). Unit tests do not cut view
sources apart with `source.indexOf` / `source.slice`.

## Learning, tablet and offline tests (PLAN-2 2C, 2D)

- `review.test.mjs` (review.js: due order, wrong first, quiz options, save migration), `learning.test.mjs`, `learning-ui.test.mjs` (the real quiz, recall, wordbook review and parent progress page in a stand-in page; three rooms in a row; play time).
- `layout.test.mjs`: the numbers of `layout.js`, the gamepad focus picking, and every screen painted in the fake page (title, rooms, wordbook, meet, settings, stickers, wardrobe, HUD, story page, chapter, recall, clear, quiz, review): each button, card, tile and sticker must have a hit shape of at least 64 CSS px at 1024 x 768. The title keeps four main buttons (`ux-minor` marks the corner ones).
- `input-safety.test.mjs` also covers touch mode (`pointer: coarse`, first touch, mouse ends it), the touch keys per finger, the long-press menu, sticker drag by pointer id and the gamepad ring (first press only shows it, learning scenes ignore a mashed A). The fake page has `matchMedia` (`env.media.set`), `Event`, `DOMPoint`, `env.fire` and `env.on`.
- `assets.test.mjs`: the title set is under 2 MB (real file sizes in `game/`), every listed name has a file, every picture in `game/` is in a list or named on demand, each room lists its own background, tiles, toys, memory painting and words; `loadArt` patience and re-asking in the real `00-core` / `90-main` in the fake page; no stand-in is replaced (`tyStats.replaced` is 0).
- `offline.test.mjs`: `sw.js` is the stamped template (`build_page.py` output; only the stamps may differ), the cache name changes with the assets and with the page, the worker logic in a fake worker scope (precache, cache-first, `?dev=1` bypass, old caches deleted). `voice-suspend.test.mjs`: `voice.suspend()`, the watchdog and the context state change.
- Browser-only checks that no node test can make (service worker install, offline reload, Resource Timing of the title) are listed in PLAN-2 section 7; a real iPad is the user's.

## Unit tests

Drop `test/unit/<name>.test.mjs`. `test/solo-kit.mjs` (`soloGame`, `prng`) builds a game plus companion that is stepped by hand,
with `place(sister, col, row)` (via `g.blink`), `run(sec, each)` and an event log; used by `solo.test.mjs` (KID_PHYS, relaxations,
blink, progress, guide, small stars, memory) and `companion.test.mjs` (follow, jump, wait at water, three blink triggers,
melt, plate, assists, a seeded random-player fuzz, and a check that the companion touches nothing but
`g.input`, `g.press` and `g.blink`). Objects made by the logic live in another vm realm: compare them with `JSON.parse(JSON.stringify(x))`. Every exported function is one test (a default export counts as well, named after
the file); it gets `{ logic, loadLogic, loadLib, makeHarness, loadMap, assert, ROOT, options }` and fails by throwing (`assert` is `node:assert/strict`).

## Rule

**No green, no merge.** Any new room or logic change must come with a solution that passes `node test/run.mjs`, and
`python3 art/build_page.py` must still build. A change that breaks an existing solution has to fix the solution in the
same change and say why.
