"""Convert generated v3_art masters into game/*.webp assets, update art/sizes.json, and verify ART_TITLE budget."""
import json
import re
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ART = Path(__file__).resolve().parent
ROOT = ART.parent
GAME = ROOT / 'game'
RAW = ART / 'raw'
V3 = ROOT / '.tools' / 'v3_art'
STORY_GARDEN = ROOT.parent / 'story' / '.tools' / 'art_candidates' / 'codex_bg_garden.png'

STAGE_W, STAGE_H = 1672, 906


def save_stage_bg(src_path, out_name, sizes, quality=78):
    im = Image.open(src_path).convert('RGB')
    tw = STAGE_W
    th = round(im.height * tw / im.width)
    im = im.resize((tw, th), Image.LANCZOS)
    if th >= STAGE_H:
        # Anchor towards the lower/middle floor so gameplay terrain stays framed cleanly
        y0 = max(0, min(th - STAGE_H, round((th - STAGE_H) * 0.65)))
        im = im.crop((0, y0, tw, y0 + STAGE_H))
    else:
        im = im.resize((STAGE_W, STAGE_H), Image.LANCZOS)
    im.save(GAME / f'{out_name}.webp', quality=quality, method=6)
    sizes[out_name] = [STAGE_W, STAGE_H]


def save_portraits_and_meet(key_path):
    src = Image.open(key_path).convert('RGB')
    W, H = src.size

    def crop_bust(cx_frac, y0_frac, h_frac, out_name):
        ch = round(H * h_frac)
        cw = round(ch * 0.75)
        y0 = max(0, min(H - ch, round(H * y0_frac)))
        x0 = max(0, min(W - cw, round(W * cx_frac - cw / 2)))
        crop = src.crop((x0, y0, x0 + cw, y0 + ch)).resize((312, 416), Image.LANCZOS)
        crop.save(GAME / f'{out_name}.webp', quality=86, method=6)

    # Elsa on left (~0.235*W, higher head ~0.20*H), Anna on right (~0.725*W, head ~0.29*H)
    crop_bust(0.235, 0.145, 0.60, 'portrait_frost')
    crop_bust(0.725, 0.225, 0.60, 'portrait_nuan')

    # Circular gold-rimmed dual medallion for ui_meet (256x256 RGBA)
    band_h = round(H * 0.68)
    half_w = band_h // 2
    pad = round(half_w * 0.06)
    ly0 = max(0, min(H - band_h, round(H * 0.11)))
    ry0 = max(0, min(H - band_h, round(H * 0.18)))
    lx0 = max(0, round(W * 0.24 - half_w / 2))
    rx0 = min(W - half_w, max(pad, round(W * 0.745 - half_w / 2)))

    left = src.crop((lx0, ly0, lx0 + half_w + pad, ly0 + band_h)).convert('RGBA')
    right = src.crop((rx0 - pad, ry0, rx0 + half_w, ry0 + band_h)).convert('RGBA')
    blend_w = pad * 2
    rmask = Image.new('L', (right.width, band_h), 255)
    rd = ImageDraw.Draw(rmask)
    for x in range(blend_w):
        rd.line([(x, 0), (x, band_h)], fill=round(255 * x / max(1, blend_w - 1)))
    right.putalpha(rmask)

    sq = Image.new('RGBA', (band_h, band_h))
    sq.paste(left, (0, 0))
    sq.alpha_composite(right, (half_w - pad, 0))
    sq = sq.resize((256, 256), Image.LANCZOS)

    mask = Image.new('L', (256, 256), 0)
    ImageDraw.Draw(mask).ellipse((4, 4, 251, 251), fill=255)
    ring_img = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
    ring_img.paste(sq, (0, 0), mask)
    ImageDraw.Draw(ring_img).ellipse((3, 3, 252, 252), outline=(255, 224, 140, 255), width=8)
    ring_img.save(GAME / 'ui_meet.webp', quality=88, method=6)


def save_seamless_brick(src_path):
    size = 480
    im = Image.open(src_path).convert('RGB').resize((size, size), Image.LANCZOS)
    a = np.asarray(im, np.float32)
    # Cross-fade a narrow 36px fringe across opposing boundaries so <pattern> repeats seamlessly
    pad = 14
    w = 0.5 * (1.0 - np.cos(np.pi * np.arange(pad, dtype=np.float32) / (pad - 1)))
    left = a[:, :pad].copy()
    right = a[:, -pad:].copy()
    a[:, :pad] = (1 - w[None, :, None]) * 0.5 * (left + right[:, ::-1]) + w[None, :, None] * left
    a[:, -pad:] = (1 - w[None, ::-1, None]) * 0.5 * (left[:, ::-1] + right) + w[None, ::-1, None] * right
    top = a[:pad, :].copy()
    bot = a[-pad:, :].copy()
    a[:pad, :] = (1 - w[:, None, None]) * 0.5 * (top + bot[::-1, :]) + w[:, None, None] * top
    a[-pad:, :] = (1 - w[::-1, None, None]) * 0.5 * (top[::-1, :] + bot) + w[::-1, None, None] * bot
    out = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    out.save(GAME / 'brick.webp', quality=82, method=6)
    tile = Image.new('RGB', (size * 2, size * 2))
    for gy in (0, size):
        for gx in (0, size):
            tile.paste(out, (gx, gy))
    tile.resize((480, 480), Image.LANCZOS).save(V3 / 'verify_brick_2x2.png')


def check_title_budget():
    txt = (ROOT / 'src' / 'lib' / 'assets.js').read_text(encoding='utf8')
    m = re.search(r'/\*TITLE_ART\*/const ART_TITLE = (\[[\s\S]*?\]);/\*END_TITLE_ART\*/', txt)
    arr = json.loads(m.group(1))
    title_bytes = sum((GAME / f).stat().st_size for f in arr)
    total_bytes = sum(p.stat().st_size for p in GAME.glob('*.webp'))
    print(f'ART_TITLE: {title_bytes:,} bytes (limit 2,000,000, tot/3={total_bytes // 3:,})')
    return title_bytes, total_bytes


def main():
    sizes_path = ART / 'sizes.json'
    sizes = json.loads(sizes_path.read_text(encoding='utf8'))

    key_src = V3 / 'v3_key.png'
    assert key_src.is_file(), f'missing {key_src}'
    RAW.mkdir(parents=True, exist_ok=True)
    shutil.copy2(key_src, RAW / 'v3_key.png')

    # 1. Key art + portraits + ui_meet
    save_stage_bg(key_src, 'key', sizes, quality=80)
    sizes.pop('key', None)  # keep existing key layout clean; only update bg* & sticker_board
    save_portraits_and_meet(key_src)

    # 2. All 10 room backgrounds
    bgs = [
        ('bg0', V3 / 'v3_bg0.png', 76),
        ('bg1', V3 / 'v3_bg1.png', 78),
        ('bg_slope', V3 / 'v3_bg_slope.png', 78),
        ('bg2', V3 / 'v3_bg2.png', 78),
        ('bg_spring', V3 / 'v3_bg_spring.png', 78),
        ('bg_bunny', V3 / 'v3_bg_bunny.png', 78),
        ('bg_floe', V3 / 'v3_bg_floe.png', 78),
        ('bg_music', V3 / 'v3_bg_music.png', 78),
        ('bg3', V3 / 'v3_bg3.png', 78),
        ('bg_garden', STORY_GARDEN, 78),
    ]
    for name, path, q in bgs:
        assert path.is_file(), f'missing {path}'
        save_stage_bg(path, name, sizes, quality=q)

    # 3. Sticker board
    sb = V3 / 'v3_sticker_board.png'
    assert sb.is_file(), f'missing {sb}'
    Image.open(sb).convert('RGB').resize((1280, 720), Image.LANCZOS).save(GAME / 'sticker_board.webp', quality=80, method=6)
    sizes['sticker_board'] = [1280, 720]

    # 4. Seamless crystal brick texture
    br = V3 / 'v3_brick.png'
    assert br.is_file(), f'missing {br}'
    save_seamless_brick(br)

    sizes_path.write_text(json.dumps(sizes, indent=0) + '\n', encoding='utf8')

    title_bytes, total_bytes = check_title_budget()
    if title_bytes > 1_900_000:
        # Auto-tune key & bg0 slightly if needed to keep plenty of margin under 2 MB
        for q in (74, 70):
            save_stage_bg(key_src, 'key', sizes, quality=q)
            sizes.pop('key', None)
            save_stage_bg(V3 / 'v3_bg0.png', 'bg0', sizes, quality=q - 2)
            sizes_path.write_text(json.dumps(sizes, indent=0) + '\n', encoding='utf8')
            title_bytes, total_bytes = check_title_budget()
            if title_bytes <= 1_900_000:
                break


if __name__ == '__main__':
    main()
