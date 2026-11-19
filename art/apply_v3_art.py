"""Convert generated v3_art, story, and memory masters into softened storybook game/*.webp assets, update art/sizes.json, and verify ART_TITLE budget."""
import argparse
import json
import re
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ART = Path(__file__).resolve().parent
ROOT = ART.parent
GAME = ROOT / 'game'
RAW = ART / 'raw'
V3 = ROOT / '.tools' / 'v3_art'
STORY_GARDEN = ROOT.parent / 'story' / '.tools' / 'art_candidates' / 'codex_bg_garden.png'
STORY_WIN = ROOT / '.tools' / 'art_candidates' / 'codex_story_win.png'

STAGE_W, STAGE_H = 1672, 906
PAINT_W, PAINT_H = 1280, 720

PRESETS = {
    'story': {
        'r': 2,
        'eps': 0.0035,
        'g_sigma': 0.42,
        'bloom_r': 14,
        'bloom_amt': 0.16,
        'mist_r': 9,
        'mist_amt': 0.09,
        'shadow_lift': 0.032,
        'contrast': 0.94,
        'sat': 0.95,
    },
    'bg': {
        'r': 3,
        'eps': 0.0050,
        'g_sigma': 0.62,
        'bloom_r': 17,
        'bloom_amt': 0.18,
        'mist_r': 11,
        'mist_amt': 0.12,
        'shadow_lift': 0.042,
        'contrast': 0.92,
        'sat': 0.91,
    },
}


def _box_filter(arr, r):
    """O(N) 2D box filter over (H, W) or (H, W, C) float array using edge padding."""
    d = 2 * r + 1
    pad_spec = ((r, r), (r, r)) + ((0, 0),) * (arr.ndim - 2)
    p = np.pad(arr.astype(np.float64), pad_spec, mode='edge')
    z0 = np.zeros((1,) + p.shape[1:], dtype=np.float64)
    c0 = np.concatenate([z0, np.cumsum(p, axis=0)], axis=0)
    h_sum = (c0[d:] - c0[:-d]) / d
    z1 = np.zeros((h_sum.shape[0], 1) + h_sum.shape[2:], dtype=np.float64)
    c1 = np.concatenate([z1, np.cumsum(h_sum, axis=1)], axis=1)
    return ((c1[:, d:] - c1[:, :-d]) / d).astype(np.float32)


def _gauss_f32(arr, sigma):
    """Exact separable 1D Gaussian convolution in float32 with edge clamping."""
    if sigma <= 0:
        return arr
    rad = max(1, int(np.ceil(sigma * 2.5)))
    t = np.arange(-rad, rad + 1, dtype=np.float32)
    k = np.exp(-0.5 * (t / sigma) ** 2)
    k /= np.sum(k)
    pad_spec = ((rad, rad), (0, 0)) + ((0, 0),) * (arr.ndim - 2)
    p = np.pad(arr.astype(np.float32), pad_spec, mode='edge')
    h_out = sum(k[i] * p[i:i + arr.shape[0]] for i in range(len(k)))
    pad_spec2 = ((0, 0), (rad, rad)) + ((0, 0),) * (arr.ndim - 2)
    p2 = np.pad(h_out, pad_spec2, mode='edge')
    return sum(k[i] * p2[:, i:i + arr.shape[1]] for i in range(len(k)))


def soften_storybook(im, preset='story'):
    """Apply edge-preserving guided smoothing, warm pro-mist bloom, Orton mist, and gentle tone easing."""
    cfg = PRESETS[preset]
    x = np.asarray(im.convert('RGB'), dtype=np.float32) / 255.0

    # Stage A: edge-preserving guided filter (luminance guide I, RGB input p)
    guide = 0.299 * x[:, :, 0] + 0.587 * x[:, :, 1] + 0.114 * x[:, :, 2]
    r = cfg['r']
    mean_i = _box_filter(guide, r)
    mean_p = _box_filter(x, r)
    mean_ii = _box_filter(guide * guide, r)
    mean_ip = _box_filter(guide[..., None] * x, r)
    var_i = np.maximum(0.0, mean_ii - mean_i * mean_i)
    cov_ip = mean_ip - mean_i[..., None] * mean_p
    a = cov_ip / (var_i[..., None] + cfg['eps'])
    b = mean_p - a * mean_i[..., None]
    mean_a = _box_filter(a, r)
    mean_b = _box_filter(b, r)
    base = np.clip(mean_a * guide[..., None] + mean_b, 0.0, 1.0)

    # Stage B: whisper optical Gaussian softening
    base = np.clip(_gauss_f32(base, cfg['g_sigma']), 0.0, 1.0)

    # Stage C: warm Pro-Mist halation bloom + Orton soft mist diffusion
    hi = np.clip((base - 0.50) / 0.50, 0.0, 1.0) ** 1.35
    bloom_src = hi * np.array([1.04, 1.01, 0.96], dtype=np.float32)
    bloom = np.clip(_gauss_f32(bloom_src, cfg['bloom_r']), 0.0, 1.0)
    screened = 1.0 - (1.0 - base) * (1.0 - np.clip(bloom * cfg['bloom_amt'], 0.0, 0.95))
    mist = np.clip(_gauss_f32(base, cfg['mist_r']), 0.0, 1.0)
    out = (1.0 - cfg['mist_amt']) * screened + cfg['mist_amt'] * mist

    # Stage D: shadow lift, micro-contrast easing, and gentle saturation relief
    sl = cfg['shadow_lift']
    out = np.clip(out * (1.0 - sl) + sl * np.array([1.02, 1.00, 0.98], dtype=np.float32), 0.0, 1.0)
    out = np.clip(0.5 + (out - 0.5) * cfg['contrast'], 0.0, 1.0)
    luma = 0.299 * out[:, :, 0] + 0.587 * out[:, :, 1] + 0.114 * out[:, :, 2]
    out = np.clip(luma[..., None] + (out - luma[..., None]) * cfg['sat'], 0.0, 1.0)

    return Image.fromarray(np.clip(out * 255.0 + 0.5, 0.0, 255.0).astype(np.uint8), mode='RGB')


def sharpness_stats(im):
    a = np.asarray(im.convert('RGB'), dtype=np.float32)
    lum = 0.299 * a[:, :, 0] + 0.587 * a[:, :, 1] + 0.114 * a[:, :, 2]
    lap = -4 * lum[1:-1, 1:-1] + lum[:-2, 1:-1] + lum[2:, 1:-1] + lum[1:-1, :-2] + lum[1:-1, 2:]
    return float(np.mean(np.abs(lap))), float(np.percentile(np.abs(lap), 95))


def save_stage_bg(src_path, out_name, sizes, quality=78, preset='bg', raw_out=None):
    im = Image.open(src_path).convert('RGB')
    tw = STAGE_W
    th = round(im.height * tw / im.width)
    im = im.resize((tw, th), Image.BICUBIC)
    im = soften_storybook(im, preset=preset)
    if raw_out is not None:
        im.save(raw_out)
    if th >= STAGE_H:
        # Anchor towards the lower/middle floor so gameplay terrain stays framed cleanly
        y0 = max(0, min(th - STAGE_H, round((th - STAGE_H) * 0.65)))
        im = im.crop((0, y0, tw, y0 + STAGE_H))
    else:
        im = im.resize((STAGE_W, STAGE_H), Image.BICUBIC)
    im.save(GAME / f'{out_name}.webp', quality=quality, method=6)
    sizes[out_name] = [STAGE_W, STAGE_H]


def save_fixed_painting(src_path, out_name, quality=80, preset='story'):
    im = Image.open(src_path).convert('RGB').resize((PAINT_W, PAINT_H), Image.BICUBIC)
    im = soften_storybook(im, preset=preset)
    im.save(GAME / f'{out_name}.webp', quality=quality, method=6)


def save_portraits_and_meet(key_path):
    src = Image.open(key_path).convert('RGB')
    W, H = src.size

    def crop_bust(cx_frac, y0_frac, h_frac, out_name):
        ch = round(H * h_frac)
        cw = round(ch * 0.75)
        y0 = max(0, min(H - ch, round(H * y0_frac)))
        x0 = max(0, min(W - cw, round(W * cx_frac - cw / 2)))
        crop = src.crop((x0, y0, x0 + cw, y0 + ch)).resize((312, 416), Image.BICUBIC)
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
    sq = sq.resize((256, 256), Image.BICUBIC)

    mask = Image.new('L', (256, 256), 0)
    ImageDraw.Draw(mask).ellipse((4, 4, 251, 251), fill=255)
    ring_img = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
    ring_img.paste(sq, (0, 0), mask)
    ImageDraw.Draw(ring_img).ellipse((3, 3, 252, 252), outline=(255, 224, 140, 255), width=8)
    ring_img.save(GAME / 'ui_meet.webp', quality=88, method=6)


def save_seamless_brick(src_path):
    size = 480
    im = Image.open(src_path).convert('RGB').resize((size, size), Image.BICUBIC)
    im = soften_storybook(im, preset='bg')
    a = np.asarray(im, np.float32)
    # Cross-fade a narrow fringe across opposing boundaries so <pattern> repeats seamlessly
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
    tile.resize((480, 480), Image.BICUBIC).save(V3 / 'verify_brick_2x2.png')


def check_title_budget():
    txt = (ROOT / 'src' / 'lib' / 'assets.js').read_text(encoding='utf8')
    m = re.search(r'/\*TITLE_ART\*/const ART_TITLE = (\[[\s\S]*?\]);/\*END_TITLE_ART\*/', txt)
    arr = json.loads(m.group(1))
    title_bytes = sum((GAME / f).stat().st_size for f in arr)
    total_bytes = sum(p.stat().st_size for p in GAME.glob('*.webp'))
    print(f'ART_TITLE: {title_bytes:,} bytes (limit 2,000,000, tot/3={total_bytes // 3:,})')
    return title_bytes, total_bytes


def run_preview():
    samples = [
        ('mem_gloves', RAW / 'mem_gloves.png', (PAINT_W, PAINT_H), 'story'),
        ('key', V3 / 'v3_key.png', (STAGE_W, round(Image.open(V3 / 'v3_key.png').height * STAGE_W / Image.open(V3 / 'v3_key.png').width)), 'story'),
        ('bg0', V3 / 'v3_bg0.png', (STAGE_W, round(Image.open(V3 / 'v3_bg0.png').height * STAGE_W / Image.open(V3 / 'v3_bg0.png').width)), 'bg'),
        ('story_win', STORY_WIN, (PAINT_W, PAINT_H), 'story'),
    ]
    for name, src_path, sz, preset in samples:
        assert src_path.is_file(), f'missing {src_path}'
        raw_im = Image.open(src_path).convert('RGB').resize(sz, Image.BICUBIC)
        soft_im = soften_storybook(raw_im, preset=preset)
        b_lap, b_p95 = sharpness_stats(raw_im)
        a_lap, a_p95 = sharpness_stats(soft_im)
        out_path = V3 / f'soft_preview_{name}.png'
        soft_im.save(out_path)
        print(f'{name:12s} [{preset:5s}] before mean|lap|={b_lap:5.2f} p95={b_p95:5.2f} -> after mean|lap|={a_lap:5.2f} p95={a_p95:5.2f} ({out_path.name})')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--preview', action='store_true')
    args = ap.parse_args()
    if args.preview:
        run_preview()
        return

    sizes_path = ART / 'sizes.json'
    sizes = json.loads(sizes_path.read_text(encoding='utf8'))

    key_src = V3 / 'v3_key.png'
    assert key_src.is_file(), f'missing {key_src}'
    RAW.mkdir(parents=True, exist_ok=True)
    soft_key_raw = RAW / 'v3_key.png'

    # 1. Softened key art + portraits + ui_meet
    save_stage_bg(key_src, 'key', sizes, quality=80, preset='story', raw_out=soft_key_raw)
    sizes.pop('key', None)  # keep existing key layout clean; only update bg* & sticker_board
    save_portraits_and_meet(soft_key_raw)

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
        save_stage_bg(path, name, sizes, quality=q, preset='bg')

    # 3. Sticker board
    sb = V3 / 'v3_sticker_board.png'
    assert sb.is_file(), f'missing {sb}'
    save_fixed_painting(sb, 'sticker_board', quality=80, preset='story')
    sizes['sticker_board'] = [PAINT_W, PAINT_H]

    # 4. Seamless crystal brick texture
    br = V3 / 'v3_brick.png'
    assert br.is_file(), f'missing {br}'
    save_seamless_brick(br)

    # 5. Story paintings (4)
    stories = [
        ('story_prologue', RAW / 'story_prologue.png'),
        ('story_winter', RAW / 'story_winter.png'),
        ('story_thaw', RAW / 'story_thaw.png'),
        ('story_win', STORY_WIN),
    ]
    for name, path in stories:
        assert path.is_file(), f'missing {path}'
        save_fixed_painting(path, name, quality=80, preset='story')

    # 6. Memory paintings (10)
    memories = [
        'mem_door', 'mem_gloves', 'mem_fall', 'mem_lake',
        'mem_m5', 'mem_m6', 'mem_m7', 'mem_m8', 'mem_m9', 'mem_m10',
    ]
    for name in memories:
        path = RAW / f'{name}.png'
        assert path.is_file(), f'missing {path}'
        save_fixed_painting(path, name, quality=80, preset='story')

    sizes_path.write_text(json.dumps(sizes, indent=0) + '\n', encoding='utf8')

    title_bytes, total_bytes = check_title_budget()
    if title_bytes > 1_900_000:
        # Auto-tune key & bg0 slightly if needed to keep plenty of margin under 2 MB
        for q in (74, 70):
            save_stage_bg(key_src, 'key', sizes, quality=q, preset='story')
            sizes.pop('key', None)
            save_stage_bg(V3 / 'v3_bg0.png', 'bg0', sizes, quality=q - 2, preset='bg')
            sizes_path.write_text(json.dumps(sizes, indent=0) + '\n', encoding='utf8')
            title_bytes, total_bytes = check_title_budget()
            if title_bytes <= 1_900_000:
                break


if __name__ == '__main__':
    main()
