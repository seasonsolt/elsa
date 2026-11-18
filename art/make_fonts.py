"""Subset ZCOOL KuaiLe (Chinese display) and Fredoka (English word cards) into game/font_zh.woff2 and game/font_en.woff2.

Eliminates the external fonts.googleapis.com dependency (PLAN-2 B6 / PLAN-99 P0-5) so typography renders identically offline
and behind restricted networks. Collects every character present in src/, art/page.template.html and manifest.webmanifest plus
ASCII and common CJK punctuation/digits.
"""
from pathlib import Path
import re
import tempfile
import urllib.request
from fontTools.subset import main as subset_main

ART = Path(__file__).resolve().parent
ROOT = ART.parent
GAME = ROOT / 'game'

SOURCES = {
    'font_zh': 'https://github.com/google/fonts/raw/main/ofl/zcoolkuaile/ZCOOLKuaiLe-Regular.ttf',
    'font_en': 'https://github.com/google/fonts/raw/main/ofl/fredoka/Fredoka%5Bwdth%2Cwght%5D.ttf',
}


def collect_chars():
    chars = set(chr(c) for c in range(32, 127))
    chars.update('，。、！？：；「」『』（）《》—…·～％＋－×÷★☆✓✕◀▶▲✦⇄•')
    for p in list((ROOT / 'src').rglob('*')) + [ART / 'page.template.html', ROOT / 'manifest.webmanifest']:
        if p.is_file() and p.suffix in ('.js', '.json', '.html', '.md', '.webmanifest'):
            chars.update(p.read_text(encoding='utf8'))
    return ''.join(sorted(c for c in chars if c.isprintable()))


def build():
    text = collect_chars()
    en_text = ''.join(sorted(c for c in text if ord(c) < 0x0250 or c in '—…•★☆'))
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        txt_all = tmp / 'all.txt'
        txt_en = tmp / 'en.txt'
        txt_all.write_text(text, encoding='utf8')
        txt_en.write_text(en_text, encoding='utf8')
        for name, url in SOURCES.items():
            ttf = tmp / f'{name}.ttf'
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=30) as r:
                ttf.write_bytes(r.read())
            out = GAME / f'{name}.woff2'
            subset_main([
                str(ttf),
                f'--text-file={txt_all if name == "font_zh" else txt_en}',
                '--flavor=woff2',
                '--layout-features=*',
                f'--output-file={out}',
            ])
            print(f'{out.relative_to(ROOT)}: {out.stat().st_size} bytes')


if __name__ == '__main__':
    build()
