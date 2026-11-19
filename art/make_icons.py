"""Make the app icons of the offline page (PLAN-2 D5):

  game/icon-192.png, game/icon-512.png        full-bleed radiant square key art featuring both sisters
  game/icon-maskable-512.png                  circular crystal medallion framed safely inside 80% for launcher masks
  game/apple-touch-icon.png                   180 x 180, opaque full-bleed square

Run from anywhere: python3 art/make_icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
GAME = ROOT / 'game'
RAW = ROOT / 'art' / 'raw'
TOP, BOTTOM = (0x2a, 0x3a, 0x86), (0x14, 0x1c, 0x46)


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


def compose_square_key(src_path, size):
    """Bring the two smiling sisters smoothly together into a radiant full-bleed square composition."""
    src = Image.open(src_path).convert('RGB')
    W, H = src.size
    crop_h = round(H * 0.74)
    half_w = crop_h // 2
    pad = round(half_w * 0.06)

    ly0 = max(0, min(H - crop_h, round(H * 0.10)))
    ry0 = max(0, min(H - crop_h, round(H * 0.17)))
    left_x0 = max(0, round(W * 0.24 - half_w / 2))
    right_x0 = min(W - half_w, max(pad, round(W * 0.745 - half_w / 2)))

    left = src.crop((left_x0, ly0, left_x0 + half_w + pad, ly0 + crop_h)).convert('RGBA')
    right = src.crop((right_x0 - pad, ry0, right_x0 + half_w, ry0 + crop_h)).convert('RGBA')

    blend_w = pad * 2
    mask = Image.new('L', (right.width, crop_h), 255)
    md = ImageDraw.Draw(mask)
    for x in range(blend_w):
        md.line([(x, 0), (x, crop_h)], fill=round(255 * x / max(1, blend_w - 1)))
    right.putalpha(mask)

    canvas = Image.new('RGBA', (crop_h, crop_h))
    canvas.paste(left, (0, 0))
    canvas.alpha_composite(right, (half_w - pad, 0))
    return canvas.convert('RGB').resize((size, size), Image.BICUBIC)


def maskable_icon(size, art_fraction):
    img = background(size)
    art = Image.open(GAME / 'ui_meet.webp').convert('RGBA')
    bbox = art.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
    if bbox:
        art = art.crop(bbox)
    scale = size * art_fraction / max(art.size)
    art = art.resize((round(art.width * scale), round(art.height * scale)), Image.BICUBIC)
    img.paste(art, ((size - art.width) // 2, (size - art.height) // 2), art)
    return img


def main():
    v3_key = RAW / 'v3_key.png'
    if v3_key.is_file():
        big = compose_square_key(v3_key, 512)
        big.save(GAME / 'icon-512.png', optimize=True)
        big.resize((192, 192), Image.BICUBIC).save(GAME / 'icon-192.png', optimize=True)
        big.resize((180, 180), Image.BICUBIC).save(GAME / 'apple-touch-icon.png', optimize=True)
    else:
        big = maskable_icon(512, .84)
        big.save(GAME / 'icon-512.png', optimize=True)
        big.resize((192, 192), Image.BICUBIC).save(GAME / 'icon-192.png', optimize=True)
        maskable_icon(180, .84).save(GAME / 'apple-touch-icon.png', optimize=True)
    maskable_icon(512, .68).save(GAME / 'icon-maskable-512.png', optimize=True)
    for name in ('icon-192', 'icon-512', 'icon-maskable-512', 'apple-touch-icon'):
        print(f'game/{name}.png', (GAME / f'{name}.png').stat().st_size, 'bytes')


if __name__ == '__main__':
    main()
