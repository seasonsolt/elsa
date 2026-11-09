# Word exposure plan (PLAN A5: every core word heard at least 8 times per room)

## Current runtime guarantee (Elsa-lead revision)

Elsa now speaks Chinese only. Anna owns every English word, learning line, hint and recap; `who: companion` and `narrator` below are historical S3 terminology. The old authored-count tables are design history, not evidence for the revised dialogue. Actual audible completions are counted per run; the clear-page picture review fills each room's three core words up to eight before offering the quiz/next control. Skipped chapter cards and interrupted dialogue therefore do not lose the learning target. Missing audio or muted play remains navigable and is never falsely credited as heard. The browser acceptance fixture verifies all 30 core words, including deliberately skipped chapters.

## Historical S3 authored-count tables

Final room order (CONTRACT section 8): hall, lake, slope, tower, spring, bunny, floe, music, ballroom, garden.
Numbers are computed from `lines.json`, `words.json` and the room maps in `levels.js` by `.tools/tmp/guide-lines/check3.mjs`
(`node .tools/tmp/guide-lines/check3.mjs`; it is the old `.tools/tmp/c-content-s3/check2.mjs` plus the guide checks: every guide entry of
`levels.js` has a `guide_<lv>_<n>` line in order, it is a companion line with at least one `{"w"}`, and when the target tile is a heart,
snowflake, door, bunny, nest, flower or a note step the line carries that word. It fails when a core word drops below 8 even with the quiz,
and when a new room's guaranteed count is below 8). Re-run it after any change to a line, a map or a guide.
All ten rooms are in `levels.js` now. The six new rooms (slope, spring, bunny, floe, music, garden) have their real item, toy and
`guide_*` counts below (taken from the final maps and guide arrays); the stuck-hint column of every room is the number of `guide_<lv>_*`
lines that carry the word. The guaranteed column is unchanged by the layouts: none of the 18 new core words is a pickup, so they all live on
authored moments plus the toy events, and every one is at 8 or more without them.

## How a "hearing" is counted

- One hearing = one `{"w": id}` segment played by `voice.line`, or one `voice.word(id)` call. `voice.line` already counts every
  `{"w"}` segment through `noteWordHeard`, so a line that says the word twice counts twice (it is spoken twice).
- Counted for the word's own room (the room where the word is learned), not for the room the dev counter happens to be in
  when it is played (see "Requests" 3).
- **Guaranteed** = plays in every normal playthrough, no matter how the child plays: chapter learn line, the start lines,
  the required pickups, the door/gate open line, the clear sentence, the clear word card.
- **Not counted in the guarantee** (bonus, listed separately): quiz (skippable), small stars (optional), stuck hints and the
  hint bulb, splash lines, the recall in the next room, the word-book card clicks.
- Lines the child may interrupt are assumed to be queued, not dropped (start lines are 2-4 short sentences, about 3 s each).

Sources (key -> what it produces):

| Source | Key | Per word |
|---|---|---|
| learn (chapter card) | `learn_<w>` | 3: "...<w>。看，<w>就是…。跟我说：<w>！" |
| card (clear page) | none, `voice.word(w)` per card | 1 |
| start | `start_<lv>_<n>` | as authored, see tables |
| open | `open_<lv>` | as authored |
| clear | `clear_<lv>` | as authored |
| pickup (required) | `voice.word(w)` on collect + `pick_<w>_<n>` | 2 per item (word + companion sentence) |
| quiz | `quiz_<w>` | 1 |
| small star | `star_<n>` | `star` word once per small star (1-5); `one` `two` `three` once per room |
| stuck hint | `guide_<lv>_<n>` (levels.js `guide` say) | 0-1 each, only when stuck or the bulb is clicked |
| splash | `splash_2`, `splash_4` | `water` once each, only when she falls in |
| recall | `recall_<w>` in the next room | 2 each, bonus |
| toy reaction | `toy_<toy>_<n>` (see "Toy reaction lines") | 0-2 per event, bonus |

Pickup rule assumed (see Requests 1): `h` heart -> `heart`, `*` snowflake -> `snowflake`, `o` snowball -> `ball`; the k-th pickup of
a word in a room plays `pick_<w>_<((k-1) mod 3)+1>`. `+` small star -> `star_<n>`.

## Room 1 of 10, hall (冰堡大厅): heart, star, door

Items in the map: 2 hearts, 2 snowflakes, 4 small stars.

| Word | learn | start | pickup | open | clear | card | **guaranteed** | quiz | small stars | stuck hint |
|---|---|---|---|---|---|---|---|---|---|---|
| heart | 3 | 1 (`start_hall_3`) | 4 (2 hearts x 2) | 0 | 1 | 1 | **10** | +1 | 0 | +2 (`guide_hall_1`, `_3`) |
| star | 3 | 3 (`start_hall_1`, `_3`, `_4`) | 0 | 0 | 1 | 1 | **8** | +1 | +4 | 0 |
| door | 3 | 2 (`start_hall_3`, `_4`) | 0 | 1 | 1 | 1 | **8** | +1 | 0 | +1 (`guide_hall_5`) |

## Room 2 of 10, lake (冰湖长廊): water, ice, fish

Items: 1 heart, 2 snowflakes, 4 small stars. No core word is a pickup, so all three live on authored moments.

| Word | learn | start | pickup | open | clear | card | **guaranteed** | quiz | stuck hint | splash |
|---|---|---|---|---|---|---|---|---|---|---|
| water | 3 | 2 (`start_lake_1`, `_3`) | 0 | 1 | 1 | 1 | **8** | +1 | +1 (`guide_lake_4`) | +2 |
| ice | 3 | 2 (`start_lake_3`, `_4`) | 0 | 1 | 1 | 1 | **8** | +1 | +2 (`guide_lake_2`, `_4`) | 0 |
| fish | 3 | 2 (`start_lake_2`, `_4`) | 0 | 1 | 1 | 1 | **8** | +1 | 0 | 0 |

## Room 3 of 10, slope (雪坡滑梯): slide, fast, down

New toy: slope `\` (6 tiles, two slides). Items in the map: 1 heart, 1 snowflake, 5 small stars. No pickup is a core word, so all three live on
authored moments plus the slide reaction. The level designer's route goes down the two slides, so `toy_slide_*` is expected
at least once in a normal run (not verified in a browser), but the talk code throttles it (one per 6 s), so it stays margin.

| Word | learn | start | open | clear | card | **guaranteed** | quiz | stuck hint | `toy_slide_*` (per slide start) |
|---|---|---|---|---|---|---|---|---|---|
| slide | 3 | 2 (`start_slope_1`, `_3`) | 1 | 1 | 1 | **8** | +1 | +1 (`guide_slope_1`) | 1 line (`_1`) |
| fast | 3 | 3 (`start_slope_2`, `_3` x2) | 1 | 1 | 1 | **9** | +1 | +1 (`guide_slope_2`) | 2 lines (`_2` x2, `_4`) |
| down | 3 | 2 (`start_slope_2`, `_4`) | 1 | 1 | 1 | **8** | +1 | +2 (`guide_slope_1`, `_2`) | 1 line (`_3` x2) |

## Room 4 of 10, tower (机关塔楼): push, open, gate

Items: 2 hearts, 2 snowflakes, 4 small stars.

| Word | learn | start | pickup | open | clear | card | **guaranteed** | quiz | stuck hint |
|---|---|---|---|---|---|---|---|---|---|
| push | 3 | 3 (`start_tower_2`, `_3`, `_4`) | 0 | 0 | 1 | 1 | **8** | +1 | +1 (`guide_tower_3`) |
| open | 3 | 2 (`start_tower_2`, `_4`) | 0 | 1 | 1 | 1 | **8** | +1 | +1 (`guide_tower_3`) |
| gate | 3 | 4 (`start_tower_1`..`_4`) | 0 | 1 | 1 | 1 | **10** | +1 | +2 (`guide_tower_3`, `_4`) |

## Room 5 of 10, spring (弹弹雪床): jump, up, high

New toy: spring mushroom `J`. NOTE: the room id `spring` is the mushroom room; the word `spring` (春天) belongs to the garden. No line in this
room says the word `spring`; the mushroom is "蘑菇" in Chinese only (`check2.mjs` fails if `{"w":"spring"}` appears outside the garden, win and end).

Items in the map: 1 heart, 2 snowflakes, 5 small stars, 3 mushrooms. The designer's route goes up and over the wall by mushroom (the wall and the third
mushroom cut the floor), so several bounces are expected in every run; `toy_bounce_*` is still throttled (one per 4 s), hence margin.

| Word | learn | start | open | clear | card | **guaranteed** | quiz | stuck hint | `toy_bounce_*` (per bounce) |
|---|---|---|---|---|---|---|---|---|---|
| jump | 3 | 2 (`start_spring_1`, `_4`) | 1 | 1 | 1 | **8** | +1 | +2 (`guide_spring_1`, `_3`) | 2 lines (`_1`, `_4`) |
| up | 3 | 3 (`start_spring_2`, `_4` x2) | 1 | 1 | 1 | **9** | +1 | +2 (`guide_spring_1`, `_5`) | 2 lines (`_1` x2, `_4`) |
| high | 3 | 2 (`start_spring_2`, `_3`) | 1 | 1 | 1 | **8** | +1 | +1 (`guide_spring_4`) | 2 lines (`_2`, `_3`) |

## Room 6 of 10, bunny (雪兔窝): bunny, home, carrot

New toy: lost bunnies `R` and bunny home `N` (3 bunnies, 1 nest; also 1 heart, 1 snowflake, 4 small stars). `carrot` is decoration at the home, never an interaction, so it depends on authored lines.
The three bunny events (`bunny` follow x3, `bunny` home x3) are forced by the room goal, so the toy lines below are as good as guaranteed.

| Word | learn | start | open | clear | card | **guaranteed** | quiz | stuck hint | toy lines (event-forced) |
|---|---|---|---|---|---|---|---|---|---|
| bunny | 3 | 3 (`start_bunny_1`, `_2`, `_4`) | 1 | 1 | 1 | **9** | +1 | +3 (`guide_bunny_2`, `_3`, `_4`) | +3 (`toy_bunny_1..3`) +1 (`toy_bunny_home_1`) |
| home | 3 | 3 (`start_bunny_1`, `_2`, `_4`) | 0 | 1 | 1 | **8** | +1 | +1 (`guide_bunny_6`) | +3 (`toy_bunny_home_1..3`) |
| carrot | 3 | 2 (`start_bunny_3` x2) | 1 | 1 | 1 | **8** | +1 | +1 (`guide_bunny_6`) | +1 (`toy_bunny_home_2`) |

## Room 7 of 10, floe (浮冰河): left, right, wait

New toy: moving ice floe `M` (2 floes of 2 tiles, one per river; also 1 heart, 1 snowflake, 4 small stars). Frost's pause is optional (the
companion/player may never use it), so `toy_floe_*` is bonus only. Riding the floes is forced by the layout but has no line of its own.

| Word | learn | start | open | clear | card | **guaranteed** | quiz | stuck hint | `toy_floe_*` (pause) |
|---|---|---|---|---|---|---|---|---|---|
| left | 3 | 3 (`start_floe_1`, `_3`, `_4`) | 1 | 1 | 1 | **9** | +1 | +1 (`guide_floe_1`) | 0 |
| right | 3 | 2 (`start_floe_1`, `_4`) | 1 | 1 | 1 | **8** | +1 | +2 (`guide_floe_5`, `_6`) | 0 |
| wait | 3 | 3 (`start_floe_2`, `_3`, `_4`) | 1 | 1 | 1 | **9** | +1 | +2 (`guide_floe_1`, `_3`) | +1 per pause (`_1`, `_2`) |

## Room 8 of 10, music (音乐楼梯): red, yellow, blue

New toy: note steps `1`..`5` = red, orange, yellow, green, blue. Only red, yellow and blue are core words; orange (橙色) and green (绿色) are
spoken in Chinese only (no word id, no card, no quiz). The melody is `[1, 3, 5]` = red, yellow, blue (steps scrambled on the map as 3, 1, 5, 2, 4 from left to right; 4 small stars), so the three
core words are exactly the three notes of the tune. The start lines name the colours as a general fact ("each step has a colour") and never as
a melody, which stays true. `music` (generic word) is said once in `start_music_2`. Playing the tune forces one correct step on each of notes
1, 3 and 5, so `toy_note_ok_1`, `_3`, `_5` play once each in every run (throttle permitting), plus `toy_melody_*`.

| Word | learn | start | open | clear | card | **guaranteed** | quiz | stuck hint | `toy_note_ok_<n>` |
|---|---|---|---|---|---|---|---|---|---|
| red | 3 | 2 (`start_music_1`, `_3`) | 1 | 1 | 1 | **8** | +1 | +1 (`guide_music_1`) | +1 per correct step on note 1 (forced once) |
| yellow | 3 | 2 (`start_music_1`, `_3`) | 1 | 1 | 1 | **8** | +1 | +1 (`guide_music_2`) | +1 per correct step on note 3 (forced once) |
| blue | 3 | 2 (`start_music_1`, `_3`) | 1 | 1 | 1 | **8** | +1 | +1 (`guide_music_3`) | +1 per correct step on note 5 (forced once) |

## Room 9 of 10, ballroom (星光舞厅): snowman, ball, hat

Items: 1 heart, 1 snowflake, 3 snowballs, 4 small stars. The goal is the snowman spot, so `open_ballroom` is "all snowballs found".

| Word | learn | start | pickup | open | clear | card | **guaranteed** | quiz | stuck hint |
|---|---|---|---|---|---|---|---|---|---|
| snowman | 3 | 2 (`start_ballroom_2`, `_3`) | 0 | 1 | 1 | 1 | **8** | +1 | +1 (`guide_ballroom_6`) |
| ball | 3 | 1 (`start_ballroom_1`) | 6 (3 snowballs x 2) | 1 | 1 | 1 | **13** | +1 | +3 (`guide_ballroom_2`..`_4`) |
| hat | 3 | 2 (`start_ballroom_3`, `_4`) | 0 | 1 | 1 | 1 | **8** | +1 | +1 (`guide_ballroom_6`) |

`ball` is high because it is the only core word that is a pickup three times; `hat` appears in `clear_ballroom` right as the hat drops.

## Room 10 of 10, garden (春天花园): flower, warm, spring

New toy: ice flowers `F` (8 flowers, no door, 4 small stars; `goal: 'garden'`). All flowers bloomed = clear, then the game ends (`win`, `end`). `open_garden` is the "all flowers
bloomed" moment and plays right before `clear_garden`; if the view skips `open_*` in garden rooms the guarantee drops by 1 per word (to 7), so
see Requests 7. The bloom events are forced by the room goal.

With 8 flowers the bloom lines play 8 times if the talk code follows the table below: `n = 1..7` cycle `_1`, `_2`, `_3` and the 8th is `_4`. So `flower` is said 8 more times (every `toy_bloom_*`
carries it), `warm` twice (`_2` at flowers 2 and 5) and `spring` once (`_4`, the last flower; also in `end`).

| Word | learn | start | open | clear | card | **guaranteed** | quiz | stuck hint | `toy_bloom_*` (per flower, cycling) |
|---|---|---|---|---|---|---|---|---|---|
| flower | 3 | 2 (`start_garden_1`, `_3`) | 1 | 1 | 1 | **8** | +1 | +8 (`guide_garden_1`..`_8`) | +8 (every flower) |
| warm | 3 | 2 (`start_garden_2`, `_4`) | 1 | 1 | 1 | **8** | +1 | +1 (`guide_garden_5`) | +2 (`_2` at flowers 2 and 5) |
| spring | 3 | 2 (`start_garden_3`, `_4`) | 1 | 1 | 1 | **8** | +1 | +1 (`guide_garden_8`) | +1 (`_4`, the last flower); also in `end` |

## Margins and honest weak spots

- The guarantee is 8 to 13, never above 13: it sits exactly on the target for most words. The margin is the quiz (+1), the toy reaction
  lines (new rooms), the stuck hints and the bulb, and for `star` the 1-5 small stars (+1 each).
- If the child skips the quiz, does not get stuck and ignores the small stars, she still hears every word 8 times, provided the view plays
  `learn_*`, the start lines, `open_<lv>`, `clear_<lv>` and the clear word cards (Requests 2 and 7).
- Words that are neither pickups nor tied to a game event (`water`, `ice`, `fish`, `push`, `open`, `gate`, `snowman`, `hat`, `left`, `right`,
  `carrot`) depend entirely on the authored moments above.
- `toy_*` lines are NOT in the "guaranteed" column even when the game forces the event (bunnies, melody, flowers), because a throttled or
  interrupted line may be dropped. They are the margin.
- Words outside the cycle (`snowflake`, `one` `two` `three`, `sun`, `hello`, `yay`, `music`) are not graded. `one` `two` `three` are also heard
  in `toy_bunny_1..3` (one of each per bunny room) as well as through `star_1..3`; `music` once in `start_music_2`; `sun` and `spring` in `end`.

## Toy reaction lines (new in S3; keys `toy_<toy>_<n>`, all `who: companion`, all sister-neutral)

The view/talk code plays them when the matching logic event arrives (CONTRACT section 9). Every line is 1 short sentence (about 2 s) so it
fits between steps. The talk code should throttle them like `idle_` (never queue more than one, skip while a start/learn line is running,
suggest at least 2.5 s between two toy lines). `n` below is what the key's number means; it is NOT always a random variation.

| Event (logic) | Keys | What `n` is | Notes |
|---|---|---|---|
| `slide` (a slide starts) | `toy_slide_1..4` | random variation, avoid repeating the last | words: slide, fast, down. The event fires often; play at most one per 6 s. |
| `bounce` | `toy_bounce_1..4` | random variation, avoid repeating the last | words: jump, up, high. At most one per 4 s. |
| `bunny` with `state:'follow'` | `toy_bunny_1..3` | how many bunnies are following or home in this room (1, 2, 3; cap at 3) | counts "bunny, one!", "bunny, two!", "bunny, three!". Use `g.bunnies` to count. A bunny that falls back to `lost` and follows again should not replay. |
| `bunny` with `state:'home'` | `toy_bunny_home_1..3` | how many bunnies are home (`g.bunniesHome`, cap at 3) | `_3` is the last one; it plays just before `open_bunny`. |
| `floe` with `paused:true` | `toy_floe_1..3` | random variation | words: wait. Ignore `paused:false`. At most one per 8 s. |
| `note` with `ok:true` | `toy_note_ok_1..5` | **the note number** `ev.n` (1 red, 2 orange, 3 yellow, 4 green, 5 blue) | `_1` `_3` `_5` carry the words red, yellow, blue; `_2` `_4` are Chinese only ("橙色，叮！", "绿色，叮！"). Play at most one per 1.5 s; the next step may interrupt it (`interrupt:true`). |
| `note` with `ok:false` | `toy_note_wrong_1..3` | random variation, avoid repeating | Soft and short; at most one per 6 s, never two wrong lines in a row on the same note. |
| `melody` | `toy_melody_1..2` | random variation | Short ("Yay! 我们弹完啦！") because `open_music` follows within a second. |
| `bloom` | `toy_bloom_1..4` | `ev.n === ev.total` -> `_4` (the last flower, no matter how many flowers); otherwise cycle `_1`, `_2`, `_3` | `_4` carries `flower` and `spring`; `open_garden` and `clear_garden` follow. |

No `pick_<w>` lines were written for the new words (`bunny`, `home`, `carrot`, `red`, `yellow`, `blue`, `flower`): the new toys emit their
own events instead of `collect`, and a `toy_*` line already carries the word, so playing `voice.word(w)` first and a `pick_` line after would
say it twice. The existing `pick_heart_*`, `pick_snowflake_*`, `pick_ball_*` still cover the three collectable tile kinds
(`h`, `*`, `o`) in every room.

## Guide lines of the six new rooms (written after the layouts)

`guide_<lv>_<n>` exists for every entry of every `guide` array in `levels.js` (slope 5, spring 7, bunny 7, floe 6, music 4, garden 8 = 37 lines).
All are `who: companion`, one short sentence in the style of the hall and lake guides: Chinese carrying the target's English word (`heart`,
`snowflake`, `door`, `bunny`, `home`, `flower`, `red`, `yellow`, `blue`) followed by its Chinese meaning, and where the target is only a spot to stand
on (a landing, a mushroom, a floe, a bank) the room's own core words (`slide`, `down`, `jump`, `up`, `wait`, `left`, `right` ...). They are stuck hints
and the hint bulb, so they count as margin, never as guaranteed. Two things to know:
- Wording that depends on the layout was written from the maps: the `guide_bunny_4` pit needs ice (`ice` is a lake word, a harmless extra
  hearing; it is credited to the lake room by the word's own room), `guide_garden_3` says to freeze the pond, the floe lines
  never say which way a floe moves because the floes shuttle both ways, and `left`/`right` are only used as places (`guide_floe_1` the left bank,
  `guide_floe_5`/`_6` going right to the bank and the door).
- `guide_music_4` is only reached once the melody is done (the guide walks note entries first), so "the door is open" is true when it is said.
- The word `spring` (season) appears only in `guide_garden_8`; the spring mushroom room never says it (the check enforces this).
`test/content_keys.mjs` fails for any `guide` say key in `levels.js` that has no line, and `check3.mjs` also checks order, the companion voice and
the target word.

## Story logic (what changed in the old lines)

- `clear_ballroom` no longer ends the story: the snowman is built, the hat drops, and "a warm wind from outside" points to the garden.
- `win` now follows the garden ("花园里开满了花"), `end` keeps `art: story_thaw`: sun, spring returns, the ice flowers became real flowers and the
  snowman from childhood stands in the flowers wearing its hat.
- `recall_<w>` is per word, so the chain slope -> lake words, tower -> slope, spring -> tower, bunny -> spring, floe -> bunny, music -> floe,
  ballroom -> music, garden -> ballroom works with the existing 3-words-of-the-previous-room rule. Nothing in the old `ch_*`, `start_*`, `open_*`
  or `me_*` says "first room" or "last room"; they were not changed.
- Memories: `m1` hall (painting), `m3` lake (ice mirror), `m5` slope (ice slide), `m2` tower (scarf), `m6` spring (snow bed), `m7` bunny (a
  little bunny's nest), `m8` floe (floe boat), `m9` music (ice wind chimes), `m4` ballroom (snow heap), `m10` garden (the first snowman in the
  garden). Each is 32-44 Chinese characters (limit 60) with `art: mem_<id>`.

## Requests to the view agents (nothing here is edited by agent c)

1. **Pickup mapping (`50-talk.js`)**: tile kind -> word as above, `voice.word(w)` then `pick_<w>_<n>`. Pick lines exist only for `heart`,
   `snowflake`, `ball`. Small stars play `star_<n>` (n = `ev.n`, capped at 5), not a pick line.
2. **Clear word cards (`showClear`)**: call `voice.word(id)` once per card when it flips. That is the "card" column.
3. **Dev counter attribution (`noteWordHeard`)**: `recall_<w>` plays in the next room; attribute by `words.json[w].room` (the word's own
   room) so the dev table matches this file (50-talk already does).
4. **Optional hooks that would add margin**: `voice.word('ice')` on a `freeze`/`block` event in the lake, `voice.word('push')` when a plate is
   pressed, `voice.word('gate')` + `voice.word('open')` on `gate{open:true}`, `voice.word('hat')` when the snowman completes,
   `voice.word('left'|'right')` when a rider's floe turns.
5. Segments with no Chinese character (a lone "。") were dropped from the lines on purpose, so edge-tts is never given nothing to say.
   Subtitles built from `say` have no trailing punctuation; the view may add it.
6. **Toy lines (talk code)**: play `toy_*` as in the table above. They exist in `lines.json` today, so the content-keys test does not know
   them yet; `test/content_keys.mjs` should get a "toy reactions" family (agent a owns the test files) when the view plays them.
7. **Garden**: `goal: 'garden'` clears when all flowers bloom. Please still play `open_garden` (the "all bloomed" sentence) and `clear_garden`
   before `win`/`end`, or the garden words fall to 7 hearings each. If the view prefers to skip `open_garden`, say so and `clear_garden`
   can be lengthened.
8. **Missing art** (agent d): `bg_slope` `bg_spring` `bg_bunny` `bg_floe` `bg_music` `bg_garden` (chapter cards, `ch_<lv>.art`) and
   `mem_m5` ... `mem_m10` (`mem_<id>.art`) are referenced by `lines.json` and not yet in `game/`; `node test/run.mjs` reports exactly those 12
   until they land.
