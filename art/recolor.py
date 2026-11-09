"""Dress recolouring for the wardrobe (PLAN B2): hue-range mask over the cut sister sprites, only the dress changes.

Run from art/ with the tools venv:
    ../.tools/venv/bin/python recolor.py                    # SAMPLE: idle + run3, both sisters, both colours -> ../.tools/outfit-sample/
    ../.tools/venv/bin/python recolor.py --frames idle,run3 --out DIR
    ../.tools/venv/bin/python recolor.py --frames all --out DIR   # all 12 frames per sister (NOT run in S3: waits for user approval)

How it works (all numbers are in PARAMS below):
 1. soft mask = hue band * saturation ramp * value ramp * sprite alpha. Frost's dress is periwinkle (hue ~230-265), Nuan's is rust-red
    (hue ~350-15 wrapping through 0). Skin, hair, fur trim, white embroidery, boots, lantern, shawl are outside the band or too unsaturated.
 2. tiny isolated mask islands are dropped (speckle in the hair / lantern glow), the mask is feathered by a tiny blur.
 3. inside the mask the hue is replaced by the target hue (the original wander around the dress hue is kept at `keep` so the painted
    brushwork stays alive), saturation is scaled, and the luminance is matched back to the original so folds and shadows survive.
 4. result = mask*new + (1-mask)*original; alpha channel is never touched.
"""
import os, sys, argparse
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
GAME = os.path.join(ROOT, 'game')

FRAMES_SAMPLE = ('idle', 'run3')
FRAMES_ALL = ('idle', 'blink', 'jump', 'fall', 'cast', 'cheer', 'run1', 'run2', 'run3', 'run4', 'run5', 'run6')

# src: which pixels are "the dress". hue in degrees [lo, hi] (lo > hi means the band wraps through 0), feather = soft edge in degrees.
# smin: saturation ramp start (full at smin+sramp). vmin: value ramp start (full at vmin+.08). island: min mask-island size in px.
# center: the dress's average hue (used to keep a fraction `keep` of the painted hue wander).
PARAMS = {
    'frost': dict(hue=(214, 268), feather=6, smin=0.14, sramp=0.05, vmin=0.22, island=30, center=248,
                  colours={
                      'd1': dict(name='mint',  hue=156, sat=0.85, keep=0.30, lum=0.35, vgain=1.30),
                      'd2': dict(name='rose',  hue=346, sat=1.30, keep=0.30, lum=0.35, vgain=1.35),
                  }),
    'nuan':  dict(hue=(346, 14), feather=5, smin=0.52, sramp=0.08, vmin=0.22, island=30, center=2,
                  colours={
                      'd1': dict(name='teal',  hue=178, sat=0.80, keep=0.30, lum=0.80),
                      'd2': dict(name='lilac', hue=272, sat=0.62, keep=0.30, lum=0.80),
                  }),
}
# extra colour tried for the comparison only (merges with Nuan's mustard shawl, so not the proposal)
ALT_NUAN_YELLOW = dict(name='sunflower', hue=47, sat=0.90, keep=0.20, lum=0.80)


def rgb2hsv(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx, mn = rgb.max(-1), rgb.min(-1)
    d = mx - mn
    h = np.zeros_like(mx)
    nz = d > 1e-6
    rc = nz & (mx == r); gc = nz & (mx == g) & ~rc; bc = nz & ~rc & ~gc
    h[rc] = ((g - b)[rc] / d[rc]) % 6
    h[gc] = (b - r)[gc] / d[gc] + 2
    h[bc] = (r - g)[bc] / d[bc] + 4
    s = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0)
    return h * 60.0, s, mx


def hsv2rgb(h, s, v):
    h = (h % 360) / 60.0
    c = v * s
    x = c * (1 - np.abs(h % 2 - 1))
    z = np.zeros_like(h)
    i = np.floor(h).astype(int) % 6
    r = np.choose(i, [c, x, z, z, x, c]); g = np.choose(i, [x, c, c, x, z, z]); b = np.choose(i, [z, z, x, c, c, x])
    m = v - c
    return np.stack([r + m, g + m, b + m], -1)


def luma(rgb):
    return rgb[..., 0] * .2126 + rgb[..., 1] * .7152 + rgb[..., 2] * .0722


def ramp(x, lo, hi):
    t = np.clip((x - lo) / max(hi - lo, 1e-6), 0, 1)
    return t * t * (3 - 2 * t)


def hue_dist_to_band(h, lo, hi):
    """0 inside the band, else the angular distance (degrees) to the nearest band edge"""
    if lo <= hi:
        inside = (h >= lo) & (h <= hi)
        d = np.minimum(np.abs(h - lo), np.abs(h - hi))
    else:  # wraps through 0
        inside = (h >= lo) | (h <= hi)
        d = np.minimum(np.minimum(np.abs(h - lo), 360 - np.abs(h - lo)), np.minimum(np.abs(h - hi), 360 - np.abs(h - hi)))
    return np.where(inside, 0.0, d)


def dress_mask(rgba, p):
    rgb = rgba[..., :3].astype(float) / 255
    h, s, v = rgb2hsv(rgb)
    lo, hi = p['hue']
    mh = 1 - ramp(hue_dist_to_band(h, lo, hi), 0, p['feather'])
    ms = ramp(s, p['smin'] - p['sramp'], p['smin'] + p['sramp'])
    mv = ramp(v, p['vmin'], p['vmin'] + .08)
    m = mh * ms * mv * (rgba[..., 3] / 255.0)
    # drop tiny islands (hair strands, lantern glow, speckle)
    lab, n = ndi.label(m > .5)
    if n:
        sizes = ndi.sum(np.ones_like(m), lab, index=np.arange(1, n + 1))
        keepl = np.concatenate([[False], sizes >= p['island']])
        m = m * ndi.binary_dilation(keepl[lab], iterations=2)
    return np.clip(ndi.gaussian_filter(m, .6), 0, 1)


def recolor(rgba, p, col):
    """rgba uint8 HxWx4 -> (recoloured rgba uint8, mask float)"""
    m = dress_mask(rgba, p)
    rgb = rgba[..., :3].astype(float) / 255
    h, s, v = rgb2hsv(rgb)
    dh = (h - p['center'] + 180) % 360 - 180                      # signed wander around the dress hue
    nh = col['hue'] + dh * col['keep']
    ns = np.clip(s * col['sat'], 0, 1)
    new = hsv2rgb(nh, ns, np.clip(v * col.get('vgain', 1.0), 0, 1))
    # put the original brightness back: folds, shadows and the painted texture survive the hue change
    l0, l1 = luma(rgb), np.maximum(luma(new), 1e-3)
    gain = (l0 / l1) ** col['lum']
    new = np.clip(new * gain[..., None], 0, 1)
    out = rgb * (1 - m[..., None]) + new * m[..., None]
    o = rgba.copy()
    o[..., :3] = np.clip(out * 255 + .5, 0, 255).astype(np.uint8)
    return o, m


def load(sister, frame):
    return np.asarray(Image.open(os.path.join(GAME, f'{sister}_{frame}.webp')).convert('RGBA'))


def save(arr, path, q=82):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray(arr, 'RGBA').save(path, quality=q, method=6)


def compare(out_dir, frames=FRAMES_SAMPLE, zoom=3, extra=True):
    """compare.png: per sister and frame, original | colour 1 | colour 2 at `zoom`x on mid-grey; compare_alt.png adds Nuan in sunflower yellow"""
    from PIL import ImageDraw
    def sheet(rows, path):
        gap, lab = 24, 22
        cw = max(a.shape[1] for r in rows for a, _ in r) * zoom
        ch = max(a.shape[0] for r in rows for a, _ in r) * zoom
        W = gap + len(rows[0]) * (cw + gap)
        H = gap + len(rows) * (ch + lab + gap)
        c = Image.new('RGBA', (W, H), (128, 128, 128, 255)); d = ImageDraw.Draw(c)
        for ri, r in enumerate(rows):
            for ci, (a, label) in enumerate(r):
                im = Image.fromarray(a, 'RGBA'); im = im.resize((im.width * zoom, im.height * zoom), Image.LANCZOS)
                x = gap + ci * (cw + gap) + (cw - im.width) // 2; y = gap + ri * (ch + lab + gap)
                d.text((x, y), label, fill=(255, 255, 255, 255)); c.alpha_composite(im, (x, y + lab + ch - im.height))
        c.convert('RGB').save(path)
    rows = []
    for sister, p in PARAMS.items():
        for fr in frames:
            src = load(sister, fr)
            rows.append([(src, f'{sister}_{fr} original')] + [(recolor(src, p, col)[0], f"{sister}_{fr} {tag} {col['name']}") for tag, col in p['colours'].items()])
    sheet(rows, os.path.join(out_dir, 'compare.png'))
    if extra:
        rows = []
        for fr in frames:
            src = load('nuan', fr); p = PARAMS['nuan']
            rows.append([(src, f'nuan_{fr} original'), (recolor(src, p, ALT_NUAN_YELLOW)[0], f'nuan_{fr} alt sunflower')])
        sheet(rows, os.path.join(out_dir, 'compare_alt_yellow.png'))


# ---------------------------------------------------------------- hats (sample: cut the Codex sheet + mock on the head anchor)
HAT_NAMES = ('crown', 'bow', 'wreath', 'clip')      # sheet order: top-left, top-right, bottom-left, bottom-right
HAT_WIDTH = {'crown': 24, 'bow': 26, 'wreath': 30, 'clip': 15}   # px wide in the 26-px-head sprites (head is ~26 px wide)
# where the hat sits relative to the top of the head: (dx from headX in px, fraction of hat height that overlaps the head below the head-top line)
HAT_SISTER_DX = {'nuan': 4, 'frost': 0}   # Nuan's headX in sizes.json is pulled backwards by the hair buns
HAT_ANCHOR = {'crown': (1, 0.55), 'bow': (-2, 0.60), 'wreath': (1, 0.80), 'clip': (5, 0.85)}


def key_cutout(path):
    """magenta -> alpha (same recipe as slice.py cutout, which cannot be imported: it executes on import)"""
    KEY = np.array([255, 0, 255], float)
    a = np.asarray(Image.open(path).convert('RGB'), float)
    keyness = np.clip((np.minimum(a[..., 0], a[..., 2]) - a[..., 1]) / 255, 0, 1)
    d = np.linalg.norm(a - KEY, axis=2)
    alpha = np.clip((d - 60) / 110, 0, 1)
    alpha = np.where(keyness > .75, 0, alpha)
    al = alpha[..., None]
    rgb = np.clip(np.where(al > .02, (a - (1 - al) * KEY) / np.maximum(al, .02), a), 0, 255)
    spill = np.clip(np.minimum(rgb[..., 0], rgb[..., 2]) - rgb[..., 1] - 40, 0, None)
    fringe = alpha < .95
    rgb[..., 0] -= spill * fringe; rgb[..., 2] -= spill * fringe
    return np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8)


def cut_hats(sheet, out_dir):
    """2x2 grid -> hat_<name>.png (tight crop, full-res) in out_dir; returns {name: rgba}"""
    rgba = key_cutout(sheet)
    m = rgba[..., 3] > 40
    lab, n = ndi.label(ndi.binary_dilation(m, iterations=9))
    comps = []
    for i, sl in enumerate(ndi.find_objects(lab)):
        reg = (lab[sl] == i + 1) & m[sl]
        if reg.sum() < 800: continue
        crop = rgba[sl].copy(); crop[..., 3] = crop[..., 3] * (lab[sl] == i + 1)
        ys, xs = np.where(crop[..., 3] > 40)
        crop = crop[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        comps.append((sl[0].start + (ys.min() + ys.max()) / 2, sl[1].start + (xs.min() + xs.max()) / 2, crop))
    comps = sorted(comps, key=lambda c: -c[2].shape[0] * c[2].shape[1])[:4]
    if len(comps) != 4: raise SystemExit(f'expected 4 hats on the sheet, found {len(comps)}')
    top = sorted(sorted(comps, key=lambda c: c[0])[:2], key=lambda c: c[1]) + sorted(sorted(comps, key=lambda c: c[0])[2:], key=lambda c: c[1])
    out = {}
    for name, (_, _, crop) in zip(HAT_NAMES, top):
        out[name] = crop
        os.makedirs(out_dir, exist_ok=True)
        Image.fromarray(crop, 'RGBA').save(os.path.join(out_dir, f'hat_{name}.png'))
    return out


def head_top(rgba, head_x, half=11):
    """first row with sprite pixels in a +-half window around the head anchor (the top of the hair)"""
    x0, x1 = max(0, int(round(head_x - half))), min(rgba.shape[1], int(round(head_x + half)) + 1)
    rows = np.where((rgba[:, x0:x1, 3] > 60).any(1))[0]
    return int(rows[0]) if len(rows) else 0


def hat_scaled(crop, name):
    w = HAT_WIDTH[name]
    im = Image.fromarray(crop, 'RGBA')
    return im.resize((w, max(1, round(im.height * w / im.width))), Image.LANCZOS)


def place_hat(base_rgba, head_x, name, hat_im, pad=14, dx_extra=0):
    """composite a hat on a sprite (on a canvas padded on top so the hat can stick out); returns (rgba array, (dx, dy) used)"""
    dx, ov = HAT_ANCHOR[name]
    dx += dx_extra
    ht = head_top(base_rgba, head_x)
    H, W = base_rgba.shape[:2]
    can = Image.new('RGBA', (W + 2 * pad, H + pad + 4), (0, 0, 0, 0))
    can.alpha_composite(Image.fromarray(base_rgba, 'RGBA'), (pad, pad))
    x = round(pad + head_x + dx - hat_im.width / 2)
    y = round(pad + ht - hat_im.height * (1 - ov))
    can.alpha_composite(hat_im, (x, y))
    return np.asarray(can), (dx, ht)


def hats_mock(out_dir, sheet):
    import json
    crops = cut_hats(sheet, out_dir)
    sizes = json.load(open(os.path.join(HERE, 'sizes.json')))
    zoom = 4; gap = 16
    cells = []
    for sister in ('nuan', 'frost'):
        for fr in ('idle', 'run3'):
            base = load(sister, fr); hx = sizes[f'{sister}_{fr}'][2]
            line = []
            for name in HAT_NAMES:
                arr, _ = place_hat(base, hx, name, hat_scaled(crops[name], name), dx_extra=HAT_SISTER_DX[sister])
                line.append(arr)
            cells.append(line)
    cw = max(a.shape[1] for l in cells for a in l) * zoom; ch = max(a.shape[0] for l in cells for a in l) * zoom
    W = gap + 4 * (cw + gap); H = gap + len(cells) * (ch + gap)
    c = Image.new('RGBA', (W, H), (128, 128, 128, 255))
    for ri, line in enumerate(cells):
        for ci, a in enumerate(line):
            im = Image.fromarray(a, 'RGBA'); im = im.resize((im.width * zoom, im.height * zoom), Image.LANCZOS)
            c.alpha_composite(im, (gap + ci * (cw + gap) + (cw - im.width) // 2, gap + ri * (ch + gap) + ch - im.height))
    c.convert('RGB').save(os.path.join(out_dir, 'hats_mock.png'))
    # head-anchor table: per frame, head x and top-of-hair y in sprite px (the hat is placed from these + HAT_ANCHOR)
    table = {}
    for sister in ('nuan', 'frost'):
        for fr in FRAMES_ALL:
            base = load(sister, fr); hx = sizes[f'{sister}_{fr}'][2]
            table[f'{sister}_{fr}'] = [hx, head_top(base, hx)]
    json.dump({'hat_offsets': table, 'width': HAT_WIDTH, 'anchor': {k: list(v) for k, v in HAT_ANCHOR.items()}, 'sister_dx': HAT_SISTER_DX},
              open(os.path.join(out_dir, 'hat_offsets.json'), 'w'), indent=1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--frames', default=','.join(FRAMES_SAMPLE), help="comma list, or 'all'")
    ap.add_argument('--out', default=os.path.join(ROOT, '.tools', 'outfit-sample'))
    ap.add_argument('--masks', action='store_true', help='also write <sister>_<frame>_mask.png debug overlays')
    ap.add_argument('--hats', metavar='SHEET', help='cut a 2x2 hat sheet (magenta bg) into hat_*.png and render hats_mock.png')
    a = ap.parse_args()
    if a.hats:
        hats_mock(a.out, a.hats); print('hats ->', a.out); return
    frames = FRAMES_ALL if a.frames == 'all' else tuple(a.frames.split(','))
    for sister, p in PARAMS.items():
        for fr in frames:
            src = load(sister, fr)
            for tag, col in p['colours'].items():
                o, m = recolor(src, p, col)
                save(o, os.path.join(a.out, f'{sister}_{fr}_{tag}.webp'))
            if a.masks:
                _, m = recolor(src, p, p['colours']['d1'])
                dbg = src.copy(); dbg[..., :3] = (src[..., :3] * (1 - m[..., None] * .75) + np.array([0, 255, 0]) * m[..., None] * .75).astype(np.uint8)
                save(dbg, os.path.join(a.out, f'{sister}_{fr}_mask.png'))
    if tuple(frames) == FRAMES_SAMPLE: compare(a.out)
    print('done', a.out)


if __name__ == '__main__':
    main()
