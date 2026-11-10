# 艾莎和安娜的冰堡

A storybook platformer for young children about Elsa and Anna, 艾莎 (frost) and 安娜 (nuan), in an ice castle. Chinese voice guidance, English core-word learning, desktop first.

Elsa is the solo lead (← → ↑ Space); Anna follows and helps. Existing saves keep progress and outfits while switching the lead to Elsa. Anna voices all English learning, word cards, quizzes, hints and menus; stories and memories are her conversations with Elsa. Elsa retains Chinese dialogue. There is no active third-person narrator or solo character-swap control.

Anna's Mandarin and English use the same bilingual voice, `en-US-EmmaMultilingualNeural`, with the same pitch. English is slowed for learning. The narration tool rejects configurations that assign different voice identities or pitches to her two languages.

- Play: open `ice-castle.html` from a local web server (`python3 -m http.server`), assets load from `game/`.
- Build: `cd art && python3 slice.py && cp game/* ../game/ && python3 build_page.py`.
- Development plans: [PLAN.md](PLAN.md) (kids' edition), [PLAN-2.md](PLAN-2.md) (phase two: fixes, clean-up, learning system, tablet and offline). Names that cross files: [src/CONTRACT.md](src/CONTRACT.md).
- Checks: `npm ci && make check` runs ESLint, `tsc --checkJs`, the node tests (`node test/run.mjs`, see [test/README.md](test/README.md)) and requires `ice-castle.html` to equal a fresh build; CI runs the same. After changing `src/` or the template, `make build` (= `python3 art/build_page.py`) and keep the result.
- Source layout: `src/*.js` is the logic group, `src/lib/*.js` the pure view helpers (voice queue, save, word counters; loaded directly by the tests), `src/view/*.js` the view fragments, all inlined by `art/build_page.py`.
- Voice: `python3 art/narration.py` makes only the clips whose text or voice changed (`game/vo_manifest.json`); `--prune` deletes clips no line needs; `--dry-run` lists what would be made. Needs edge-tts and ffmpeg for a real run.
- Word exposure: `node test/exposure.mjs` prints how often each core word is heard in context per room; `--write` regenerates `src/content/exposure.md`.
- Character art: approved Grok sheet `art/raw/elsa-anna-atlas.jpg`. Run `python art/character_atlas.py` (Pillow, numpy, scipy), then `python3 art/build_page.py` to rebuild frames, portraits and title art. The full art slicer also imports this sheet last. Internal `frost` / `nuan` IDs mean Elsa / Anna and stay stable for existing saves.
- Wardrobe: after rebuilding the characters, run `python art/recolor.py --publish` and `python3 art/build_page.py`. This writes 48 dress-colour frames (12 poses × 2 sisters × 2 extra colours), four hats and per-pose head offsets. The full art slicer does this automatically. Elsa has mint/rose gowns; Anna has teal/lilac skirts with her magenta cape preserved.
- Release package: `python3 art/package_release.py --out /path/to/elsa-anna.zip`. Includes the built page, current audio/images and a checksum manifest; excludes authoring files, QA saves and obsolete narration. Serve the extracted folder over HTTP. Asset fingerprints prevent old portraits, costumes or narration from surviving a release in the browser cache.
- `castle3d/` is an earlier, shelved 3D experiment.
