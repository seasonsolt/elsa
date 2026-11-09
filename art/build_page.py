"""Assemble ../ice-castle.html from sources. Never reads the built page.

  art/page.template.html   HTML/CSS/SVG skeleton with /*LOGIC*/ and /*VIEW*/ placeholders
  src/*.js                 game logic group, inlined into <script id="logic"> in FILENAME order:
                             companion.js, levels.js, logic.js
                           Plain global const/function scripts. Order is not load-bearing as long as a file touches
                           another file's top-level bindings only inside functions (LEVELS is read by createGame()
                           when a level is loaded, never while the script is being evaluated).
  src/view/*.js            view fragments, concatenated in FILENAME order (00-core ... 90-main) and wrapped in one
                           IIFE inside <script id="view">. The fragments are cut at top-level statements and share
                           one scope, so a file may use names from earlier files at load time and from any file
                           inside functions. Each file must end with a newline.
  art/sizes.json           replaces /*SIZES*/{} in view/00-core.js
  src/content/lines.json   replaces /*LINES*/{} in view/00-core.js
  src/content/words.json   replaces /*WORDS*/[] in view/00-core.js

Run from anywhere:  python3 art/build_page.py
"""
import json
import hashlib
import re
from pathlib import Path

ART = Path(__file__).resolve().parent
ROOT = ART.parent
SRC = ROOT / 'src'
OUT = ROOT / 'ice-castle.html'


def join(files):
    parts = []
    for f in files:
        t = f.read_text(encoding='utf8')
        assert t.endswith('\n'), f'{f} must end with a newline'
        parts.append(t)
    return ''.join(parts)


def once(text, marker, replacement, where):
    assert text.count(marker) == 1, f'{where}: expected exactly one {marker!r}, found {text.count(marker)}'
    return text.replace(marker, replacement)


logic_files = sorted(SRC.glob('*.js'))
view_files = sorted((SRC / 'view').glob('*.js'))
assert logic_files and view_files, 'no sources found under src/'

logic = join(logic_files)
view = join(view_files)
asset_hash = hashlib.sha256()
for asset in sorted((ROOT / 'game').iterdir()):
    if asset.suffix not in ('.webp', '.mp3', '.json'):
        continue
    asset_hash.update(asset.name.encode())
    asset_hash.update(hashlib.sha256(asset.read_bytes()).digest())
asset_version = asset_hash.hexdigest()[:12]
view = once(view, "/*ASSET_VERSION*/'dev'", json.dumps(asset_version), 'view')
view = once(view, '/*SIZES*/{}', json.dumps(json.load(open(ART / 'sizes.json', encoding='utf8')), separators=(',', ':')), 'view')
view = once(view, '/*LINES*/{}', json.dumps(json.load(open(SRC / 'content' / 'lines.json', encoding='utf8')), ensure_ascii=False, separators=(',', ':')), 'view')
view = once(view, '/*WORDS*/[]', json.dumps(json.load(open(SRC / 'content' / 'words.json', encoding='utf8')), ensure_ascii=False, separators=(',', ':')), 'view')
for name, text in (('logic', logic), ('view', view)):
    assert '</script' not in text.lower(), f'{name} contains </script>'

page = (ART / 'page.template.html').read_text(encoding='utf8')
page = re.sub(r'href="(game/[^"?]+)"', lambda m: f'href="{m[1]}?v={asset_version}"', page)
page = once(page, '/*LOGIC*/\n', logic, 'template')
page = once(page, '/*VIEW*/\n', '(() => {\n' + view + '})();\n', 'template')
OUT.write_text(page, encoding='utf8')
print(f'{OUT}: {len(page)} chars; logic {[f.name for f in logic_files]}; view {[f.name for f in view_files]}')
