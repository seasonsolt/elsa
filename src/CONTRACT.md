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

`art/build_page.py` belongs to the main session. It concatenates `src/*.js` (filename order) into the logic script and `src/view/*.js` (filename order) into one shared view scope, wrapped in `(() => { ... })()`.

**Shared view scope rule:** all `src/view/*.js` files share ONE scope. Any file may call a function from another file, but top-level code must not *execute* calls into a later file while loading. Use `function` declarations (hoisted) for every cross-file API. Top-level `const`/`let` may be read by other files only inside functions.

## 1. Logic API (agent a; node-testable, no DOM)

Current story/view policy: Elsa (`frost`) is always the solo lead, Anna (`nuan`) assists. Save sanitization migrates the old Anna selection to Elsa without losing progress. The generic engine below still supports either controlled character for physics regression tests and legacy callers; the story UI no longer exposes swapping.

```
KID_PHYS = { ...PHYS, speed: 180, coyote: 0.14, buffer: 0.18 }   // used when g.mode === 'solo'
createGame() → g, plus:
  g.mode: 'solo' | 'duo'        default 'solo'; set before g.start/g.load
  g.player: 'nuan' | 'frost'    player-controlled sister in solo (default 'nuan')
  g.swap()                      toggles g.player (solo); emits {type:'swap', player}
  g.blink(id, x, y)             teleports sister id (feet-safe position); emits {type:'blink', who:id, from:{x,y}, to:{x,y}}
  g.progress                    integer, increments on any real progress: collect, melt, freeze, block, gate open, door open,
                                memory found, player reaching a guide target. View uses it for the stuck timer.
  g.guide()                     → { i, c, r, say, x, y } current guide target (first not-yet-done entry of LEVELS[g.index].guide), or null
  g.stars                       { total, got } small decorative stars in this room
  g.memoryFound                 boolean
New tile '+' = small star (decorative, A3). Collected by either sister in any mode, does NOT gate the door.
  emits {type:'collect', kind:'+', x, y, n}   n = 1-based count of stars got in this room
'+' is added to TILE_CHARS.live. Each of the 4 current rooms gets 3–5 '+' (reachable; solutions must still pass).
Memory fragment: if not already in logic, logic owns pickup at level.memory; emits {type:'memory', id: level.memoryId}.
Splash event stays {type:'splash', who}; respawn {type:'respawn', who}.
Companion (companion.js): createCompanion(g) → { reset(), update(dt) }  — called by the view every fixed step BEFORE g.step(dt)
  in solo mode only. Writes only g.input[other] and g.press(other, ...), plus g.blink.
  companion.idle → seconds the player has not moved (view reads it for encouragement lines).
```

Level data cleanup (a): remove `start`, `open`, `chapter`, `diary`, `hint`, `par` from levels.js — the view now finds those lines by naming convention (§3). Keep `id name words goal map guide assists memory memoryId music bg glows`. Add `stars` is NOT a field; stars are '+' tiles in the map.

## 2. Save (agent d2, in 00-core.js)

```
save                       the object of PLAN §5 (v:2), loaded at startup, defaults on any failure; migrates icecastle.stars
saveWrite()                persist (try/catch)
setting(key) / setSetting(key, value)   subtitles, english ('words' | 'words+phrases'), mode, player, sound
noteWordHeard(wordId)      increments save.words[id].heard (+ dev counter, see §4)
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
| `miss_frost` `miss_nuan` | the other sister | sisters far apart (「姐姐，你在哪儿？」) |
| `together_<n>` | either | reunion, n = 1..2 (「Yay! 我们在一起啦！」) |
| `mem_<memoryId>` | Anna | memory fragment narration (≤ 15 s); memoryIds are those in levels.js |
| `me_frost` `me_nuan` | that sister | 「认识她们」 self-introduction |
| `win` `end` | Anna | ending pages |
| `ui_<name>` | Anna | hover name. names: `start` `continue` `next` `replay` `back` `words` `stickers` `wardrobe` `settings` `hint` `fullscreen` `swap` `solo` `duo` `sound` `quiz_skip` `meet` `rooms` `room_<lv>` |
| `cheer_<n>` | either | short fixed phrases: Yay / Good job / Let's go / Wow, n = 1..4 |

Current lines use `who: "frost" | "nuan"`; every English-bearing lesson/phrase belongs to Anna, Elsa speaks Chinese only. Anna's zh/en entries must have the same bilingual voice identity and pitch; English can be slower, never a different speaker. `narrator` is only a deprecated Anna voice alias and is not used by active lines. The parser retains legacy `companion` support and its two generated file variants, but runtime always selects Anna for such a line. Segment: string (zh voice of that speaker) | `{"w": wordId}` (en voice, the word's `en`) | `{"en": "Yay!"}` (fixed phrase; skipped/replaced by its zh gloss when setting english === 'words').

`words.json`: `[{ "id", "en", "zh", "icon": "word_<id>", "room": "<lv>" | null }]`. Write all ~38 words from PLAN A5 now (rooms 5–10 included, ids from the table; `room` uses these future ids: `slope` `spring` `bunny` `floe` `music` `garden` for rooms 3,5,6,7,8,10 — and `hall` `lake` `tower` `ballroom` for 1,2,4,9).

## 4. Audio and talk API (agent e)

```
voice.line(key, opts?) → Promise   play vo_<key>.mp3 (or __frost/__nuan for companion lines, by g.player);
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
  showRecall(prevLevel, done)      quick flash of 3 words + recall_<w>
  showClear(level, done)           stars (★ clear, ★ memory, ★ all small stars), then word cards, then quiz (3 questions, skippable)
  showWordbook()                   pages per room, grey silhouettes for unheard, click = voice.word
  showSettings()                   opened by 2 s long-press on the gear; subtitles / english / mode
  hoverable(el, uiName)            adds hover scale + voice.ui(uiName); every button uses it; hit area ≥ 64 CSS px
  hud(g)                           avatar (click = swap), counters with icons, hint bulb (click = voice.line(g.guide().say)), fullscreen,
                                   keyboard diagram (4 keys light up on press) — d2 calls hud(g) every frame
  subtitleView                     renders onSubtitle when subtitles on
d2 (00-core, 10-stage, 20-sisters, 30-fx, 80-input, 90-main):
  main loop: solo → companion.update(dt) → g.step(dt); events → audioOnEvents → talkOnEvents → fx
  guide: light column on g.guide() target, edge arrow when off-screen, stuck timer on g.progress:
         10 s → voice.line(target.say), 20 s → sparkle path; resets on progress
  input: solo keys ← → ↑ Space, Tab = g.swap(); duo keeps A/D/W/S/F and ← → ↑ ↓ Enter; Gamepad optional
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
| `1`–`5` | note steps | Solid steps. Stepping onto one emits `{type:'note', n, ok}` (n = 1..5 → do re mi so la). Level field `melody: [n, ...]`; stepping the next expected note advances `g.melody.pos`; a wrong note does nothing bad (pos stays, `ok:false`). Completing it emits `{type:'melody'}` and opens the door. The companion never steps on notes. |
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
