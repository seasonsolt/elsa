"""Assemble ../ice-castle.html from sources. Never reads the built page.

  art/page.template.html   HTML/CSS/SVG skeleton with /*LOGIC*/ and /*VIEW*/ placeholders
  src/*.js                 game logic group, inlined into <script id="logic"> in FILENAME order:
                             companion.js, levels.js, logic.js
                           Plain global const/function scripts. Order is not load-bearing as long as a file touches
                           another file's top-level bindings only inside functions (LEVELS is read by createGame()
                           when a level is loaded, never while the script is being evaluated).
  src/lib/*.js             pure view helpers (voice queue, save sanitize/merge, word-heard bookkeeping, canPlay): plain
                           global scripts without document/window access, also loaded directly by the node tests
                           (test/harness.mjs loadLib). Placed in FILENAME order in front of the view fragments, inside the
                           same IIFE and scope, so view code and tests see the same names. Not part of the logic group.
  src/view/*.js            view fragments, concatenated in FILENAME order (00-core ... 90-main) and wrapped in one
                           IIFE inside <script id="view">. The fragments are cut at top-level statements and share
                           one scope, so a file may use names from earlier files at load time and from any file
                           inside functions. Each file must end with a newline.
  art/sizes.json           replaces /*SIZES*/{} in view/00-core.js
  art/hd.json              its names replace /*HD*/[] in view/00-core.js: the pictures with a large copy in game/hd/ (art/hd.py)
  src/content/lines.json   replaces /*LINES*/{} in view/00-core.js
  src/content/words.json   replaces /*WORDS*/[] in view/00-core.js
  art/sw.template.js       the offline worker (PLAN-2 D5). Stamped with the asset version, a hash of the built page and the precache list
                           (page, manifest, icons, game/subs.json and the title set read from src/lib/assets.js), and written as sw.js in
                           the folder of the built page: ../sw.js for the default build, next to PATH with --out. sw.js is generated,
                           edit the template. The cache name holds ASSET_VERSION, so a new build replaces the old caches on the next open.
  manifest.webmanifest     web app manifest (hand-written, at the repository root); the page links it, together with the icons made by
                           art/make_icons.py. Its bytes and the game/ icons are part of the asset fingerprint.

Run from anywhere:  python3 art/build_page.py
                    python3 art/build_page.py --out PATH   build somewhere else (make check compares a fresh build with ice-castle.html;
                                                           sw.js lands next to PATH, so the Makefile can compare that one too)
"""
import json
import argparse
import hashlib
import re
from pathlib import Path

ART = Path(__file__).resolve().parent
ROOT = ART.parent
SRC = ROOT / 'src'
OUT = ROOT / 'ice-castle.html'

args = argparse.ArgumentParser(description='Assemble ice-castle.html from sources.')
args.add_argument('--out', type=Path, default=OUT, help='where to write the page (default: ice-castle.html at the repository root)')
OUT = args.parse_args().out


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
lib_files = sorted((SRC / 'lib').glob('*.js'))
view_files = sorted((SRC / 'view').glob('*.js'))
assert logic_files and lib_files and view_files, 'no sources found under src/'

logic = join(logic_files)
view = join(lib_files) + join(view_files)
MANIFEST = ROOT / 'manifest.webmanifest'
SW_TEMPLATE = ART / 'sw.template.js'
asset_hash = hashlib.sha256()
GAME = ROOT / 'game'
for asset in sorted(list(GAME.iterdir()) + list((GAME / 'hd').glob('*.webp'))):
    if asset.suffix not in ('.webp', '.mp3', '.json', '.png', '.woff2'):
        continue
    asset_hash.update(asset.relative_to(GAME).as_posix().encode())
    asset_hash.update(hashlib.sha256(asset.read_bytes()).digest())
asset_hash.update(b'manifest.webmanifest')
asset_hash.update(hashlib.sha256(MANIFEST.read_bytes()).digest())
asset_version = asset_hash.hexdigest()[:12]
view = once(view, "/*ASSET_VERSION*/'dev'", json.dumps(asset_version), 'view')
view = once(view, '/*SIZES*/{}', json.dumps(json.load(open(ART / 'sizes.json', encoding='utf8')), separators=(',', ':')), 'view')
HD_INDEX = ART / 'hd.json'
hd_names = sorted(json.loads(HD_INDEX.read_text(encoding='utf8'))) if HD_INDEX.exists() else []
view = once(view, '/*HD*/[]', json.dumps(hd_names, separators=(',', ':')), 'view')
view = once(view, '/*LINES*/{}', json.dumps(json.load(open(SRC / 'content' / 'lines.json', encoding='utf8')), ensure_ascii=False, separators=(',', ':')), 'view')
view = once(view, '/*WORDS*/[]', json.dumps(json.load(open(SRC / 'content' / 'words.json', encoding='utf8')), ensure_ascii=False, separators=(',', ':')), 'view')
for name, text in (('logic', logic), ('view', view)):
    assert '</script' not in text.lower(), f'{name} contains </script>'

page = (ART / 'page.template.html').read_text(encoding='utf8')
page = re.sub(r'href="(game/[^"?]+)"', lambda m: f'href="{m[1]}?v={asset_version}"', page)
page = re.sub(r'url\("(game/[^"?]+)"\)', lambda m: f'url("{m[1]}?v={asset_version}")', page)
page = once(page, '/*LOGIC*/\n', logic, 'template')
page = once(page, '/*VIEW*/\n', '(() => {\n' + view + '})();\n', 'template')
# the app head (PLAN-2 D5): manifest, icons and the colours of an installed page. Plain URLs, not fingerprinted: the manifest names its icons the same way.
APP_HEAD = """<meta name="theme-color" content="#141c46">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" href="game/icon-192.png">
<link rel="apple-touch-icon" href="game/apple-touch-icon.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="冰堡">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
"""
page = once(page, '<title>艾莎和安娜的冰堡</title>\n', '<title>艾莎和安娜的冰堡</title>\n' + APP_HEAD, 'template')
OUT.write_text(page, encoding='utf8')


def title_art():
    """The picture names of the title set: the literal between the TITLE_ART markers of src/lib/assets.js (valid JSON on purpose)."""
    text = (SRC / 'lib' / 'assets.js').read_text(encoding='utf8')
    m = re.search(r'/\*TITLE_ART\*/const ART_TITLE = (\[.*?\]);/\*END_TITLE_ART\*/', text, re.S)
    assert m, 'src/lib/assets.js: the ART_TITLE literal between /*TITLE_ART*/ and /*END_TITLE_ART*/ is missing'
    names = json.loads(m[1])
    assert names and len(set(names)) == len(names) and all(isinstance(n, str) and n.endswith('.webp') for n in names), 'ART_TITLE must be a list of unique .webp file names'
    return names


def make_sw():
    shell = ['ice-castle.html', 'manifest.webmanifest', 'game/icon-192.png', 'game/icon-512.png', 'game/icon-maskable-512.png', 'game/apple-touch-icon.png']
    fonts = [f'game/{f}?v={asset_version}' for f in ('font_zh.woff2', 'font_en.woff2') if (GAME / f).is_file()]
    precache = shell + fonts + [f'game/subs.json?v={asset_version}'] + [f'game/{n}?v={asset_version}' for n in title_art()]
    for path in precache:
        assert (ROOT / path.split('?')[0]).is_file() or path == 'ice-castle.html', f'precache entry without a file: {path}'
    sw = SW_TEMPLATE.read_text(encoding='utf8')
    assert sw.endswith('\n')
    sw = once(sw, "/*ASSET_VERSION*/'dev'", json.dumps(asset_version), 'sw template')
    sw = once(sw, "/*PAGE_HASH*/'dev'", json.dumps(hashlib.sha256(page.encode('utf8')).hexdigest()[:12]), 'sw template')
    sw = once(sw, '/*PRECACHE*/[]', json.dumps(precache, ensure_ascii=False, indent=2), 'sw template')
    return sw


sw_out = OUT.with_name('sw.js')
sw_out.write_text(make_sw(), encoding='utf8')
print(f'{OUT}: {len(page)} chars; logic {[f.name for f in logic_files]}; lib {[f.name for f in lib_files]}; view {[f.name for f in view_files]}')
print(f'{sw_out}: offline worker, asset version {asset_version}')
