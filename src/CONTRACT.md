# S1 interface contract

Written by the main session before S1. The S1 agents work in parallel and cannot see each other, so this file fixes every name that crosses a file boundary. **Code against these names exactly.** If you need something that isn't here, don't invent a cross-file name: implement a fallback inside your own files and write the gap in your delivery note.

PLAN.md is still the spec. This file only pins down names and shapes.

## 0. Ownership

| Agent | Owns (only these files may be edited) |
|---|---|
| a. logic-companion | `src/logic.js` `src/levels.js` `src/companion.js` `test/**` |
| b. content-writer | `src/content/lines.json` `src/content/words.json` `src/content/exposure.md` |
| c. art-codex | `art/prompt_*.txt` `art/raw/**` `art/slice.py` `art/sizes.json` `art/STYLE.md`(read only) `art/game/**` `game/**`(copy of slice output only) |
| d1. view-ui | `src/view/60-story.js` `src/view/70-ui.js` `art/page.template.html` |
| d2. view-play | `src/view/00-core.js` `src/view/10-stage.js` `src/view/20-sisters.js` `src/view/30-fx.js` `src/view/80-input.js` `src/view/90-main.js` |
| e. view-audio-talk | `src/view/40-audio.js` `src/view/50-talk.js` `art/narration.py` |

`art/build_page.py` belongs to the main session. It concatenates `src/*.js` (filename order) into the logic script, then `src/lib/*.js` and `src/view/*.js` (each in filename order, lib first) into one shared view scope, wrapped in `(() => { ... })()`. Phase two added `src/lib/`; ownership for phase two is in section 12.

**Shared view scope rule:** all `src/lib/*.js` and `src/view/*.js` files share ONE scope. Any file may call a function from another file, but top-level code must not *execute* calls into a later file while loading. Use `function` declarations (hoisted) for every cross-file API. Top-level `const`/`let` may be read by other files only inside functions.

## 1. Logic API (agent a; node-testable, no DOM)

Current story/view policy: Elsa (`frost`) is always the solo lead, Anna (`nuan`) is the companion. The sisters cannot trade places and there is no solo run with Anna as the player (removed in phase two, PLAN-2 B1); duo mode keeps both sisters player-controlled. Save sanitization still migrates an old `settings.player: 'nuan'` to Elsa without losing progress.

```
KID_PHYS = { ...PHYS, speed: 180, coyote: 0.14, buffer: 0.18 }   // used when g.mode === 'solo'
createGame() → g, plus:
  g.mode: 'solo' | 'duo'        default 'solo'; set before g.start/g.load
  g.player: 'frost'             the player-controlled sister in solo: fixed, nothing assigns it
  g.blink(id, x, y)             teleports sister id (feet-safe position); emits {type:'blink', who:id, from:{x,y}, to:{x,y}}
  g.progress                    integer, increments on any real progress: collect, melt, freeze, block, gate open, door open,
                                memory found, player reaching a guide target. Not used for the stuck timer (see guide in section 5).
  g.guide()                     → { i, c, r, say, x, y } current guide target (first not-yet-done entry of LEVELS[g.index].guide), or null
  g.stars                       { total, got } small decorative stars in this room
  g.memoryFound                 boolean
New tile '+' = small star (decorative, A3). Collected by either sister in any mode, does NOT gate the door.
  emits {type:'collect', kind:'+', x, y, n}   n = 1-based count of stars got in this room
'+' is added to TILE_CHARS.live. Each of the 4 current rooms gets 3–5 '+' (reachable; solutions must still pass).
Memory fragment: if not already in logic, logic owns pickup at level.memory; emits {type:'memory', id: level.memoryId}.
Splash event is {type:'splash', x, y} (where the water was hit, no `who`: the view only draws a puff); the sister who fell is named by the {type:'respawn', who} that follows when she is put back.
Companion (companion.js): createCompanion(g) → { reset(), update(dt) }  — called by the view every fixed step BEFORE g.step(dt)
  in solo mode only. Writes only g.input[other] and g.press(other, ...), plus g.blink.
  companion.idle → seconds the player has not moved (view reads it for encouragement lines).
```

Level data cleanup (a): remove `start`, `open`, `chapter`, `diary`, `hint`, `par` from levels.js — the view now finds those lines by naming convention (§3). Keep `id name words goal map guide assists memory memoryId music bg glows`. Add `stars` is NOT a field; stars are '+' tiles in the map.

## 2. Save (agent d2, in 00-core.js)

```
save                       the object of PLAN §5 (v:3), loaded at startup, defaults on any failure; migrates icecastle.stars
saveWrite()                persist (try/catch)
setting(key) / setSetting(key, value)   subtitles, english ('words' | 'words+phrases'), mode, player, sound
noteWordHeard(wordId)      increments save.words[id].heard (+ dev counter, see §4); lives in src/lib/heard.js
markRoom(levelId, patch)   merges into save.rooms[id]; unlock next room on clear
```

## 3. Line keys (agent b writes them; d1/d2/e play them by these exact keys)

All keys live in `lines.json` → `lines`. `<lv>` is the level id (`hall`, `lake`, `tower`, `ballroom`); `<w>` a word id; `<n>` 1-based.

| Key | Who | When |
|---|---|---|
| `p1` `p2` `p3` | Anna | prologue conversation with Elsa, 3 pages (each also names `art`) |
| `ch_<lv>` | Anna | chapter card: room picture + one sentence |
| `learn_<w>` | Anna | chapter card word intro and speaking together (view then waits 1.5 s with ear/mouth anim) |
| `recall_<w>` | Anna | next room start: 「还记得 door 吗？」 for previous room's 3 words |
| `start_<lv>_<n>` | either | lines at room start, played in order |
| `guide_<lv>_<n>` | Anna | stuck hint for guide entry n (matches levels.js guide `say`), embeds the target's word |
| `pick_<w>_<n>` | Anna | variations after picking an item of word w (「又一个 heart！」), n = 1..3 |
| `star_<n>` | either | small star count, n = 1..5: `[{"en":"Star!"}, {"en":"One!"}]` style |
| `open_<lv>` | either | door / gate opens |
| `clear_<lv>` | Anna | clear page sentence |
| `quiz_<w>` | Anna | 「哪个是 heart？点一点！」 |
| `quiz_right_<n>` `quiz_wrong_<n>` | Anna | n = 1..3 variations |
| `tutor_move` `tutor_jump` `tutor_magic` `tutor_fullscreen` | Anna | first-time keyboard teaching; fullscreen tip for parents |
| `splash_<n>` | Anna | encouragement after falling in water, n = 1..4 |
| `idle_<n>` | Anna | player idle > 3 s, n = 1..4 |
| `miss_frost` | Anna | sisters far apart (「姐姐，你在哪儿？」) |
| `together_<n>` | either | reunion, n = 1..2 (「Yay! 我们在一起啦！」) |
| `mem_<memoryId>` | Anna | memory fragment narration (≤ 15 s); memoryIds are those in levels.js |
| `me_frost` `me_nuan` | that sister | 「认识她们」 self-introduction |
| `win` `end` | Anna | ending pages |
| `ui_<name>` | Anna | hover name. names: `start` `continue` `next` `replay` `back` `words` `stickers` `wardrobe` `settings` `hint` `fullscreen` `solo` `duo` `sound` `quiz_skip` `meet` `rooms` `room_<lv>` |
| `cheer_<n>` | either | short fixed phrases: Yay / Good job / Let's go / Wow, n = 1..4 |

Current lines use `who: "frost" | "nuan"`; every English-bearing lesson/phrase belongs to Anna, Elsa speaks Chinese only. Anna's zh/en entries must have the same bilingual voice identity and pitch; English can be slower, never a different speaker. Elsa has a Chinese voice only (`voices.frost` has no `en`; art/narration.py rejects English segments in her lines). The parser retains legacy `companion` support and its two generated file variants, but runtime always selects Anna for such a line. Segment: string (zh voice of that speaker) | `{"w": wordId}` (en voice, the word's `en`) | `{"en": "Yay!"}` (fixed phrase; skipped/replaced by its zh gloss when setting english === 'words').

`words.json`: `[{ "id", "en", "zh", "icon": "word_<id>", "room": "<lv>" | null }]`. Write all ~38 words from PLAN A5 now (rooms 5–10 included, ids from the table; `room` uses these future ids: `slope` `spring` `bunny` `floe` `music` `garden` for rooms 3,5,6,7,8,10 — and `hall` `lake` `tower` `ballroom` for 1,2,4,9).

## 4. Audio and talk API (agent e)

```
voice.line(key, opts?) → Promise   play vo_<key>.mp3 (a legacy `who: "companion"` line plays vo_<key>__nuan.mp3, Anna's; the `__w` suffix is the words-only variant);
                                   ducks music; opts {interrupt:true|false, priority}; resolves when finished or skipped;
                                   counts words only after audible completion; resolves true then, otherwise false; fires subtitle callback
voice.word(wordId) → Promise       Anna's word_<id>.mp3 (slow standard pronunciation); same voice as mixed lessons
voice.ui(name)                     hover name (ui_<name>), debounced 400 ms, never queues more than one
voice.stop()
voice.busy → boolean
onSubtitle(fn)                     fn({ key, who, segments:[{text, en:boolean}] } | null)  — d1 renders when setting('subtitles')
sfx(name)                          'pick' 'star' 'click' 'hover' 'blink' 'splash' 'quiz_right' 'quiz_wrong' 'page' 'unlock'
audioOnEvents(events, g)           called by 90-main each frame with the frame's events (before talkOnEvents)
talkOnEvents(events, g)            50-talk: pick lines, star counting, splash, mood/reunion, memory narration, idle lines
wordStats()                        dev: { [wordId]: { [levelId]: count } }; also console.table on clear when ?dev=1
startMusic(themeKey) / stopMusic()
```

Missing mp3 files must never throw or block: resolve after a short delay and keep the game playable (audio is lazy-loaded).

## 5. UI and play API (agents d1, d2)

```
d1 (60-story, 70-ui):
  openStory(pages, done)           keep existing behaviour; pages now image + voice, text only when subtitles on
  showTitle() / hideTitle()        image buttons: start (big play), words, stickers(placeholder for S3), wardrobe(placeholder), meet, rooms
  showChapter(level, done)         room picture + ch_<lv> + 3 word cards with learn_<w> + 1.5 s repeat pause
  showRecall(prevLevel, done, wordIds?)  quick flash of the previous room's 3 words + up to 2 due older words (recallWordsFor) + recall_<w>; notes only the older ones as reviewed
  showClear(level, done)           stars (★ clear, ★ memory, ★ all small stars), then word cards, then quiz (3 questions, skippable)
  showWordbook()                   pages per room, grey silhouettes for unheard (locked rooms stay silent), click = voice.word; ear button = showReview
  showReview(done)                 5 questions from reviewDue (open core words only) with the quiz cards; quiz_<w> asks
  showSettings()                   opened by 2 s long-press on the gear; subtitles / english / mode
  hoverable(el, uiName)            adds hover scale + voice.ui(uiName); every button uses it; hit area ≥ 64 CSS px
  hud(g)                           avatar (Elsa big, Anna small; not clickable), counters with icons, hint bulb (click = voice.line(g.guide().say)), fullscreen,
                                   keyboard diagram (4 keys light up on press) — d2 calls hud(g) every frame
  subtitleView                     renders onSubtitle when subtitles on
d2 (00-core, 10-stage, 20-sisters, 30-fx, 80-input, 90-main):
  main loop: solo → companion.update(dt) → g.step(dt); events → audioOnEvents → talkOnEvents → fx
  guide: light column on g.guide() target, edge arrow when off-screen, stuck timer on the target:
         10 s → voice.line(target.say), 20 s → sparkle path; resets only when the target changes (g.progress does
         not: building ice or pausing a floe over and over is not getting closer)
  input: solo keys ← → ↑ Space; duo keeps A/D/W/S/F and ← → ↑ ↓ Enter; Gamepad optional
  blink fx: star-light fade out/in + sfx('blink'); small-star '+' drawing using fx_star
  tutorial: first room first time → tutor_move / tutor_jump / tutor_magic, keyboard diagram highlights the key being taught
  flow: title → (first time: prologue) → recall(prev) → chapter → play → clear → next
  scaling: fit 1280×720 / 1440×900 / 1920×1080 with no scrollbars
```

Text on screen: only the logo, English words on word cards / wordbook, numbers with icons, parent settings, subtitles (PLAN A4). `#hint` and key legends are hidden unless subtitles are on.

## 6. Image names (agent c delivers into game/, others reference)

- Word icons: `word_<id>.webp` for every id in words.json.
- UI: `ui_book` `ui_bulb` `ui_gear` `ui_fullscreen` `ui_play` `ui_next` `ui_replay` `ui_back` `ui_keys` (4-key diagram base) `ui_key_left` `ui_key_right` `ui_key_up` `ui_key_space` `ui_ear` `ui_mouth` `ui_sticker` `ui_wardrobe` `ui_solo` `ui_duo` `ui_meet`.
- `fish_1` `fish_2` `hat_snowman`, `mem_gloves` (now: scarf knitting), `mem_fall` (now: laughing in the snow heap).

Until an image exists the view draws a simple placeholder (rounded rect + emoji-free shape) — never a broken image icon, never text.

---

# S3 addendum (10 rooms, rewards)

Everything above still holds. This addendum fixes the S3 names. Ownership for S3 replaces §0.

## 7. S3 ownership

| Agent | Owns |
|---|---|
| a. logic-mechanics | `src/logic.js` `test/unit/**` `test/harness.mjs` `test/checks.mjs` `test/run.mjs` `test/README.md` |
| b. level-design (runs after a) | `src/levels.js` `src/companion.js` `test/solutions/**` `test/solo-kit.mjs` |
| c. content-writer | `src/content/lines.json` `src/content/words.json` `src/content/exposure.md` |
| d. art-rooms | `art/prompt_*.txt` (new) `art/raw/**` (new) `art/slice.py` `art/sizes.json` `game/**` (new files only) |
| e. view-rewards | `src/view/15-toys.js` (new: drawing of the six new toys) `src/view/75-rewards.js` (new: sticker book, wardrobe, hat overlay) `art/page.template.html`; may add **one-line hook calls** in `src/view/10-stage.js` (rebuild → `drawToys()`), `src/view/90-main.js` (frame → `updateToys(dt, now)`), `src/view/20-sisters.js` (after drawing a sister → `drawOutfit(id, frame, node)`), `src/view/70-ui.js` (title stickers/wardrobe buttons → `showStickers()` / `showWardrobe()`) |
| f. art-outfits | `art/recolor.py` (new) `art/prompt_hats*.txt` `art/raw/hats*` `.tools/outfit-sample/**` — **sample only in S3** |

## 8. Room order (final)

`LEVELS` ids in order: `hall` `lake` `slope` `tower` `spring` `bunny` `floe` `music` `ballroom` `garden`. Room numbers in PLAN A5/B1 tables = this order. The game ends (`win`) after `garden`, not after `ballroom`. Memories: existing `m1`–`m4` stay with hall/lake/tower/ballroom (by their current `memoryId`); new rooms get `m5`–`m10` in room order (slope m5, spring m6, bunny m7, floe m8, music m9, garden m10). Backgrounds: new rooms use `bg_<id>` (e.g. `bg_slope`); chapter cards reuse the background (`ch_<lv>` line's `art` = `bg_<id>`).

## 9. New toys — logic API (agent a; b and e code against it)

Tiles (already reserved in TILE_CHARS.future; a moves them to live):

| Char | Toy | Rules |
|---|---|---|
| `/` `\` | slope | Full-tile ramp: `\` goes down to the right, `/` down to the left. Standing on it slides downhill at up to 1.6× run speed (player input adds/brakes a little), jumping works while sliding. Emits `{type:'slide', who}` when a slide starts. |
| `J` | spring mushroom | Solid on top. Landing on it (or pressing jump on it) launches to ≈ 6 tiles high. Emits `{type:'bounce', who, c, r}`. |
| `R` | lost bunny | Entity, not a tile after load. States `lost` → `follow` (when any sister comes within 1.5 tiles; Nuan's lantern: within 3 tiles if Nuan) → `home` (when it reaches a `N` tile while following). Followers trail the player (≈ 30 px apart, hop over 1-tile steps; blink to the player if > 6 tiles away). Emits `{type:'bunny', id, state}`. All bunnies home = room's item requirement (door opens when every item + every bunny is done). |
| `N` | bunny home | Non-solid decoration tile where bunnies settle. |
| `M` | moving ice floe | Entity 1 tile tall, width = run of consecutive `M` in the map. Moves horizontally at 60 px/s. It reverses when the tile ahead in its own row is solid, or when the tile below its leading edge is not water `~` (so it shuttles along the water surface; b places `M` runs directly above `~` rows). Solid on top, carries riders. Frost's act within 3 tiles pauses it 3 s: `{type:'floe', id, paused:true|false}`. |
| `1`–`5` | note steps | Solid steps. Stepping onto one emits `{type:'note', n, ok, who, c, r, pos}` (n = 1..5 → do re mi so la, i.e. C D E G A, drawn red orange yellow green blue). Level field `melody: [n, ...]`; stepping the next expected note advances `g.melody.pos`; a wrong note does nothing bad (pos stays, `ok:false`). Completing it emits `{type:'melody'}` and opens the door. The companion never steps on notes. |
| `F` | ice flower | Non-solid. Any sister touching it (solo) / Nuan touching or acting within 2 tiles (duo) makes it bloom: `{type:'bloom', c, r, n, total}`. In `goal:'garden'` rooms, all flowers bloomed = clear (then `win` since it is the last room). |

State the view can read: `g.floes[] {id,x,y,w,vx,paused}`, `g.bunnies[] {id,x,y,state,dir}`, `g.melody {seq,pos}` (or null), `g.flowers[] {c,r,open}`, `g.bunniesHome` count. Springs and slopes are read from `g.grid`.

`g.guide()` must also handle bunny entries (`{c, r, say, bunny: id}` done when that bunny is following/home), note entries (done when melody pos passes them) and flowers (done when bloomed).

Companion (b): springs → follow through; bunnies → nothing; floes → wait for the floe to come near, then jump; notes → stays off them and never blinks onto one; flowers → may bloom nearby ones only after the player has bloomed one (let the child do it first).

## 10. New images (agent d delivers; e draws)

- Tiles/entities: `tile_slope_r` (`\`), `tile_slope_l` (`/`), `spring_0` `spring_1` (squash), `floe`, `note_1` … `note_5` (red, orange, yellow, green, blue), `note_1_lit` … `note_5_lit`, `flower_0` (ice bud) `flower_1` (opening) `flower_2` (bloom), `bunny_idle`, `bunny_hop1` … `bunny_hop4`, `bunny_home`.
- Rooms: `bg_slope` `bg_spring` `bg_bunny` `bg_floe` `bg_music` `bg_garden` (16:9 like bg0–bg3, same size), `mem_m5` … `mem_m10`.
- Stickers: `sticker_<lv>` and `sticker_<lv>_gold` for the 10 rooms, `sticker_words5` (one shared image for every 5-word sticker is fine), `sticker_board` (big castle background for the sticker book).
- Outfits (f, after user approval in S4): `<sister>_<frame>_d1.webp` `<sister>_<frame>_d2.webp`, hats `hat_crown` `hat_bow` `hat_wreath` `hat_clip`, `hat_offsets.json` per frame (in sizes.json as `hat_offsets`).

## 11. Rewards (agent e)

Save fields of PLAN §5: `stickers[]`, `board[{id,x,y}]`, `outfit`. Award rules per PLAN B2 (room clear → `<lv>`, all 3 stars → `<lv>_gold`, every 5 words heard → `words5_<k>`); awarding happens in `markRoom`-adjacent code in 75-rewards (`awardStickers(levelId)` called from showClear — e adds the one-line hook in 70-ui). Wardrobe unlocks at 3 / 6 / 10 stickers. Until outfit images exist, the wardrobe shows the dresses as locked silhouettes and the hats only if their images exist — never broken images.

---

# Phase two addendum (PLAN-2: fixes, clean-up, tooling)

Everything above still holds except where a section above was corrected in place (splash and note event shapes, the fixed player, the voice file names). This addendum fixes the names that phase two added.

## 12. Ownership and files

| Area | Files |
|---|---|
| Logic group (one `<script id="logic">`) | `src/companion.js` `src/levels.js` `src/logic.js`: plain globals, filename order, no module syntax |
| Pure view helpers (`src/lib/`, new) | `save.js` `voice.js` `heard.js` `play-gate.js` `review.js` `layout.js` `assets.js`: plain global scripts without `document` / `window`; inlined in front of the view fragments, loaded directly by the node tests |
| View fragments | `src/view/00-core.js` ... `90-main.js`, one shared scope, filename order |
| Content | `src/content/lines.json` `words.json`; `exposure.md` is GENERATED by `node test/exposure.mjs --write`, never edited by hand |
| Voice | `art/narration.py` and `game/vo_manifest.json` (written by the tool, not by hand) |
| Gate | `package.json` `eslint.config.mjs` `tsconfig.json` `types/page.d.ts` `Makefile` `.github/workflows/check.yml` |

Agents edit only the files their package lists; a change needed elsewhere goes into the delivery note.

## 13. `src/lib` rules

- A lib file is a plain script written like a view fragment (indented two spaces, ends with a newline). It declares top-level `const` / `function` names that the rest of the view may use, and lists in its header the page names it expects ("Free names").
- It must not touch `document` or `window` (checked with `grep -rnE "document|window" src/lib`); the page (audio graph, storage, DOM) reaches it only through those free names, so a test can supply stand-ins.
- Tests load it with `loadLib(names, context, expr)` from `test/harness.mjs`; tests do not cut view sources apart with `source.indexOf` / `source.slice`.
- The build puts lib files before the view fragments in the same IIFE, so view code and tests see the same names.
- What lives where: `save.js` `SETTING_CHECK` `SAVE_VERSION` `defaultSave` `sanitizeSave` `saveVersionTooNew` `storedSaveIsNewer` `mergeSaveInto` `mergeSaves` (the `save` object, `saveWrite`, `loadSave` and the storage event stay in `view/00-core.js`); `voice.js` the `voice` queue (`40-audio.js` keeps the audio graph and `sfx`); `heard.js` `heardLog` and `noteWordHeard` (stamps `lastSeen` through `noteHeard`); `play-gate.js` `canPlay` (false in a scene, under the parent settings and in portrait); `layout.js` and `assets.js` (section 18); `review.js` (PLAN-2 C2/C3, pure, no clock and no `Math.random`: time is `save.roomClock`, randomness an `rng` argument) `reviewDue` `recallWordsFor` `recallOlderIds` `quizOptions` `noteQuizAnswer` `noteReviewed` `noteHeard` `reviewContext` `reviewAdvanceClock` `reviewLearned` `makeReviewRng`. Save v3 adds per word `wrong` `lastSeen` `lastWrong` `lastReviewed` `reviews` and per save `totalPlaySeconds` `roomClock`.

## 14. Fixed player

`g.player` is `'frost'` and nothing assigns it. In solo no key, button, event or line lets the sisters trade places (the `#tSwitch` touch button remains for duo only), and no solo run has Anna as the player; `test/unit/legacy-removed.test.mjs` bans the old names from `src/` and `art/narration.py`. Saves with `settings.player: 'nuan'` migrate to Elsa in `sanitizeSave`. Only Anna speaks English: `voices` in `lines.json` holds exactly `frost` (a `zh` entry only) and `nuan`, and `art/narration.py` rejects English segments in Elsa's lines.

## 15. Gate: `make check`

`make check` runs, in order: `eslint .`, `tsc -p tsconfig.json` (`--checkJs` over `src/*.js`, `src/lib/*.js`, `src/view/*.js` as global scripts, plus `types/page.d.ts` for vendor-prefixed browser members), `node test/run.mjs`, and a build check (a fresh `python3 art/build_page.py --out ...` must be byte-identical to `ice-castle.html` in the working tree, staged or not). CI runs only `make check`. Not type-checked: `test/` (linted only), `art/` and `castle3d/`. Cross-file globals are known to ESLint by parsing each script's top-level declarations (`eslint.config.mjs`), so there is no list to maintain; a name used but declared nowhere fails both ESLint (`no-undef`) and `tsc`.

## 16. Voice manifest and pruning

- `game/vo_manifest.json` = `{"v":1,"clips":{file: sha1}}`; the hash covers, per spoken segment in order, voice, effective rate, pitch and text. `python3 art/narration.py` (no flags) makes only the clips whose file is missing, whose hash changed or that are not listed, then records them; `--dry-run` lists them as `name | reason | segments`.
- `--prune` deletes the `.mp3` files directly in `game/` that `plan()` does not expect (`--dry-run` lists them); `--write-manifest` records the files now present without synthesizing; `--verify-manifest` exits 1 on any stale, unrecorded or extra entry.
- `test/content_keys.mjs` fails on a missing clip, an orphan clip or a manifest that disagrees with `lines.json`; `art/package_release.py` refuses to package then.
- After editing a line: run `python3 art/narration.py` with edge-tts available (see the docstring of `art/narration.py`), then rebuild and run `make check`.

## 17. Exposure report

`test/exposure.mjs` counts, per room and core word, the in-context hearings of a normal playthrough (chapter card, start lines, door open, clear sentence, clear card; beside them pickups and toy lines) from `lines.json`, `levels.js` and the view's own tables (`KIND_WORD` in `50-talk.js`, `TY_LINES` in `15-toys.js`, read from the source). `node test/run.mjs` prints it and fails on a core word below the threshold (6) or on a stale `exposure.md` (PLAN-2 C1). `node test/exposure.mjs --write` regenerates `src/content/exposure.md`.

## 18. Phase two, steps 2C and 2D: learning view, tablet, offline

**Learning (2C).** The quiz and the review game ask from the rooms already cleared (`quizOptions` in `src/lib/review.js`: at least one option from another room once two rooms are cleared, wrong words first) and store every answer at once (`uxNoteQuiz`, `uxNoteReviewed` in `70-ui.js`); `showRecall` takes the previous room's words plus at most two due older ones (`uxRecallWords`), the ear button of the wordbook starts `showReview`, and the parent settings (2 s long press on the gear) have a progress page (`uxProgressHtml`: heard count, first-try accuracy, last meeting per word, total play time). `90-main.js` counts play time into `save.totalPlaySeconds` (`countPlayTime`) and moves `save.roomClock` on by one per `enterRoom`. All new text is on the parent pages; a child reads nothing.

**Touch and sizes (D1, D2).** `src/lib/layout.js` holds the numbers (`LAYOUT`: 960 x 520 stage, 64 CSS px hit target, 72 px touch key, 1024 x 768 reference tablet) and the stage fit (`layoutStageWidth`, `layoutStageHeight`, moved out of `fitStage`). A picture button is drawn at any size but its hit circle is at least `layoutHitMin()` stage units (`uxHitRadius` in `70-ui.js`), which is 64 CSS px at the reference tablet. Touch mode comes from `matchMedia('(pointer: coarse)')` or a first `pointerdown` of type touch; a mouse press ends a touch mode that only a finger started. The left and right touch keys belong to the finger that pressed them (pointer capture, released on `pointerup`, `pointercancel`, `lostpointercapture`); `contextmenu` is stopped on keys, pad and stage; `isPortraitView()` is true in portrait, where the page shows only the `#turn` picture and `canPlay()` is false.

**Title (D3).** Four main buttons: start, rooms, wordbook, stickers. `meet` and the parent gear are corner buttons marked `ux-minor` (not main buttons). The wardrobe is a button on the meet page.

**Gamepad (D7).** `80-input.js` `padMenu`: outside a live room the first D-pad, stick or A press only shows the gold ring (`#padFocus`) on the pulsing button, else the first; then the D-pad moves it (`layoutPadPick`, cone limited), A presses the focused button, B presses the `back` button on menu screens, Start leaves a scene like Enter. `uxPadName` speaks the focused button's `ui_*` name quietly (priority 0, tag `ui`). Learning scenes (`story.strict`) ignore the pad in their quiet first second (`storyAcceptsPad`) and A presses only a ring that a D-pad press put there, so a child mashing A never skips a lesson. Hold-to-open buttons and cards that have not popped up are skipped. Sticker book items have no `role="button"`, so the pad cannot press them (back and paging work).

**Lazy pictures (D4).** `src/lib/assets.js`: `assetPlan(levels, lines, opts)` returns `{ title, prologue, ending, rooms }` (picture names); `roomArt(level, lines, opts)` is one room's set (background, tiles from the map characters, toys, word icons, memory painting, sticker, worn outfit). The title set is one JSON literal between `/*TITLE_ART*/` and `/*END_TITLE_ART*/`; `art/build_page.py` reads the same literal for the precache of `sw.js`. `00-core.js` `loadArt(names, patience)` decodes each picture once and resolves on decode or after the patience (`ART_PATIENCE` 1500 ms: a slow network never strands the child; a failed picture is asked for again next time); `artPending(name)` says a picture is on its way, and `15-toys.js` then places it at once instead of a vector stand-in (`tyStats.replaced` stays 0). `90-main.js` awaits only the title set before the first frame; `enterRoom` asks for the room's set before `game.load` and awaits it (with the patience) once the cards close; `startGame` loads the prologue, `finishGame` the ending. The title set is under 2 MB (`assets.test.mjs` adds up the real file sizes). With `?dev=1`, `window.__dbg` has `artStats`, `loadArt`, `ART`, `tyStats`.

**Offline (D5).** `art/sw.template.js` is the template; `art/build_page.py` stamps it and writes `sw.js` next to the built page (it is generated: edit the template, never `sw.js`). The cache is named `icecastle-<ASSET_VERSION>-<page hash>`: `ASSET_VERSION` fingerprints `game/` (incl. icons) and the manifest, the page hash covers code-only builds. Install precaches the page, `manifest.webmanifest`, the four icons, `game/subs.json` and the title set, then `skipWaiting`; activate deletes older `icecastle-*` caches and claims the open pages, so a new build is served from the next open on (the open that finds the new worker still shows the old page). Fetch: the page and everything under `game/` are cache-first (room pictures and voice clips are stored on first use, so a room played once works offline); `?dev=1` pages, other origins and non-GET requests go to the network. `offlineWorkerAllowed(search, protocol, hasApi)` decides in `90-main.js` whether to register (not for `?dev=1`, `file:`, or without the API). Icons are made by `art/make_icons.py` from `ui_meet.webp`; `art/package_release.py` ships `sw.js`, the manifest and the icons and refuses a release whose `sw.js` belongs to another build or precaches a missing file. `make check` compares both `ice-castle.html` and `sw.js` with a fresh build.

**Audio suspend (D6).** `voice.suspend()` (`src/lib/voice.js`) ends the current job and drops the queue as `'interrupted'` (no word counted, music level restored); `40-audio.js` calls it and suspends the audio context when the page is hidden or the context leaves `running`, and resumes (also from `'interrupted'`) on return. A clip that starts on a suspended context has a watchdog (clip length + 1.5 s). The decoded-clip cache holds 24 clips.

