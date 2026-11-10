"""Make the app icons of the offline page (PLAN-2 D5) from art that is already in game/: no downloads, no new painting.

  game/icon-192.png, game/icon-512.png        manifest icons (purpose "any"): the two sisters (ui_meet.webp) on the night-blue stage colour
  game/icon-maskable-512.png                  the same with the sisters inside the 80 % safe circle, for round / squircle launcher masks
  game/apple-touch-icon.png                   180 x 180, opaque (iOS rounds the corners itself)

Run from anywhere:  python3 art/make_icons.py        (needs Pillow: use the .tools venv of PLAN.md 2.4 when the system python has none)
The output is checked in; run this again only when ui_meet.webp changes. build_page.py puts the icons into the asset fingerprint.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
GAME = ROOT / 'game'
TOP, BOTTOM = (0x2a, 0x3a, 0x86), (0x14, 0x1c, 0x46)   # the stage background and --night of the page


def background(size):
    img = Image.new('RGB', (size, size))
    d = ImageDraw.Draw(img)
    for y in range(size):
        t = y / (size - 1)
        d.line([(0, y), (size, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(TOP, BOTTOM)))
    glow = Image.new('L', (size, size), 0)
    ImageDraw.Draw(glow).ellipse([size * .2, size * .22, size * .8, size * .82], fill=110)
    glow = glow.filter(ImageFilter.GaussianBlur(size * .12))
    return Image.composite(Image.new('RGB', (size, size), (0xcf, 0xe6, 0xff)), img, glow.point(lambda v: v * 3 // 10))


def icon(size, art_fraction):
    img = background(size)
    art = Image.open(GAME / 'ui_meet.webp').convert('RGBA')
    art = art.crop(art.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox())   # the figures without the empty margin of the icon
    scale = size * art_fraction / max(art.size)
    art = art.resize((round(art.width * scale), round(art.height * scale)), Image.LANCZOS)
    img.paste(art, ((size - art.width) // 2, (size - art.height) // 2), art)
    return img


def main():
    big = icon(512, .84)
    big.save(GAME / 'icon-512.png', optimize=True)
    big.resize((192, 192), Image.LANCZOS).save(GAME / 'icon-192.png', optimize=True)
    icon(512, .62).save(GAME / 'icon-maskable-512.png', optimize=True)
    icon(180, .84).save(GAME / 'apple-touch-icon.png', optimize=True)
    for name in ('icon-192', 'icon-512', 'icon-maskable-512', 'apple-touch-icon'):
        print(f'game/{name}.png', (GAME / f'{name}.png').stat().st_size, 'bytes')


if __name__ == '__main__':
    main()
