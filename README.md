# 艾莎和安娜的冰堡

A storybook platformer for young children about Elsa and Anna, 艾莎 (frost) and 安娜 (nuan), in an ice castle. Chinese voice guidance, English core-word learning, desktop first.

- Play: open `ice-castle.html` from a local web server (`python3 -m http.server`), assets load from `game/`.
- Build: `cd art && python3 slice.py && cp game/* ../game/ && python3 build_page.py`.
- Development plan: [PLAN.md](PLAN.md).
- Character art: approved Grok sheet `art/raw/elsa-anna-atlas.jpg`. Run `python art/character_atlas.py` (Pillow, numpy, scipy), then `python3 art/build_page.py` to rebuild frames, portraits and title art. The full art slicer also imports this sheet last. Internal `frost` / `nuan` IDs mean Elsa / Anna and stay stable for existing saves.
- Wardrobe: after rebuilding the characters, run `python art/recolor.py --publish` and `python3 art/build_page.py`. This writes 48 dress-colour frames (12 poses × 2 sisters × 2 extra colours), four hats and per-pose head offsets. The full art slicer does this automatically. Elsa has mint/rose gowns; Anna has teal/lilac skirts with her magenta cape preserved.
- Release package: `python3 art/package_release.py --out /path/to/elsa-anna.zip`. Includes the built page, current audio/images and a checksum manifest; excludes authoring files, QA saves and obsolete narration. Serve the extracted folder over HTTP. Asset fingerprints prevent old portraits, costumes or narration from surviving a release in the browser cache.
- `castle3d/` is an earlier, shelved 3D experiment.
