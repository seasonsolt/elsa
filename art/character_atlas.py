"""Import the approved Grok atlas. Run from anywhere after the legacy art slicer.

Requires Pillow, numpy and scipy (same environment as slice.py).
Internal frost/nuan IDs remain stable for saves, audio and game logic.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from repair_sprites import apply_all_repairs, remove_green_clean

ART = Path(__file__).resolve().parent
ROOT = ART.parent
ATLAS = ART / 'raw/elsa-anna-atlas.jpg'
# The generated sheet rearranged Anna's first eight poses; use the observed layout.
CELLS = {
    'frost': dict(zip(['idle', 'blink', 'run1', 'run2', 'run3', 'run4',
                       'run5', 'run6', 'jump', 'fall', 'cast', 'cheer'], range(12))),
    'nuan': dict(zip(['run1', 'run2', 'jump', 'fall', 'run5', 'run6',
                      'idle', 'blink', 'run3', 'run4', 'cast', 'cheer'], range(12, 24))),
}


def remove_green(image):
    return remove_green_clean(image)


def upscale4(image):
    """Real-ESRGAN x4plus-anime (art/hd.py finds the tool); plain Lanczos when the tool is not installed"""
    import subprocess, tempfile
    from hd import find_esrgan
    binary = find_esrgan()
    if binary:
        with tempfile.TemporaryDirectory() as tmp:
            src, out = Path(tmp) / 'in.png', Path(tmp) / 'out.png'
            image.save(src)
            subprocess.run([str(binary), '-i', str(src), '-o', str(out), '-n', 'realesrgan-x4plus-anime', '-m', str(binary.parent / 'models')],
                           capture_output=True)
            if out.is_file():
                return Image.open(out).convert('RGBA')
    print('realesrgan-ncnn-vulkan not found: word_fast is upscaled with Lanczos')
    return image.resize((image.width * 4, image.height * 4), Image.Resampling.LANCZOS)


def word_fast(run, game_dir, sizes):
    """The word card for "fast": Elsa in full stride with speed streaks and kicked-up snow (a rushing snowflake read as "snowflake")."""
    from PIL import ImageDraw, ImageFilter
    W, H = 1300, 1000
    fig = upscale4(run)
    fig = fig.resize((round(fig.width * 900 / fig.height), 900), Image.Resampling.LANCZOS)
    fx = W - fig.width
    canvas = Image.new('RGBA', (W, H))
    streaks = Image.new('RGBA', (W, H))
    draw = ImageDraw.Draw(streaks)
    # y, start, end (where the streak meets the cape or the back leg), width; each fades in towards the figure
    for y, x0, x1, w in [(260, 40, fx + 330, 40), (420, 0, fx + 60, 46), (590, 70, fx + 70, 40), (760, 170, fx + 200, 32)]:
        n = 80
        for k in range(n):
            t = k / (n - 1)
            xa = x0 + (x1 - x0) * t
            a, ww = int(255 * t ** 1.2), max(6, int(w * (.35 + .65 * t)))
            draw.line([(xa, y), (xa + (x1 - x0) / (n - 1) + 1, y)], fill=(120, 190, 240, a), width=ww)
            draw.line([(xa, y), (xa + (x1 - x0) / (n - 1) + 1, y)], fill=(255, 255, 255, a), width=max(3, ww // 3))
        draw.ellipse((x1 - w / 2, y - w / 2, x1 + w / 2, y + w / 2), fill=(120, 190, 240, 255))
        draw.ellipse((x1 - w / 5, y - w / 5, x1 + w / 5, y + w / 5), fill=(255, 255, 255, 255))
    canvas.alpha_composite(streaks.filter(ImageFilter.GaussianBlur(1.2)))
    draw = ImageDraw.Draw(canvas)
    for cx, cy, r in [(fx + 120, 900, 52), (fx + 30, 925, 40), (fx + 210, 935, 34), (fx - 60, 945, 26)]:
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(240, 248, 255, 240), outline=(140, 190, 235, 255), width=8)
    canvas.alpha_composite(fig, (fx, 50))
    icon = canvas.crop(canvas.getchannel('A').point(lambda a: 255 if a > 40 else 0).getbbox())
    k = 232 / max(icon.size)   # the size of every word icon (art/slice.py word_rule)
    icon = icon.resize((round(icon.width * k), round(icon.height * k)), Image.Resampling.LANCZOS)
    out = Image.new('RGBA', (256, 256))
    out.paste(icon, ((256 - icon.width) // 2, (256 - icon.height) // 2))
    out.save(game_dir / 'word_fast.webp', quality=80, method=6)
    sizes['word_fast'] = [256, 256]


def extract_frames():
    """the 24 cut-out frames of the atlas at its own resolution: { 'frost': { pose: image }, 'nuan': ... }, and the keyed atlas"""
    image = remove_green(Image.open(ATLAS))
    width, height = image.size
    rgba = np.array(image)
    labels, _ = ndi.label(rgba[..., 3] > 70)
    objects = ndi.find_objects(labels)
    cores = []
    for label, region in enumerate(objects, 1):
        if region and np.count_nonzero(labels[region] == label) > 800:
            cy = (region[0].start + region[0].stop) / 2
            cores.append((int(cy * 4 / height), region[1].start, label))
    cores.sort()
    if len(cores) != 24:
        raise ValueError(f'Expected 24 character silhouettes, found {len(cores)}')
    core_mask = np.isin(labels, [c[2] for c in cores])
    distance, nearest = ndi.distance_transform_edt(~core_mask, return_indices=True)
    owner = labels[tuple(nearest)]
    extracted = []
    for _, _, label in cores:
        pixels = rgba.copy()
        pixels[..., 3] = np.where((owner == label) & (distance < 28), pixels[..., 3], 0)
        cell = Image.fromarray(pixels)
        bbox = cell.getchannel('A').point(lambda a: 255 if a > 40 else 0).getbbox()
        extracted.append(cell.crop(bbox))
    frames = {who: {pose: extracted[index] for pose, index in cells.items()} for who, cells in CELLS.items()}
    apply_all_repairs(frames)
    return frames, image


def import_atlas(sizes, game_dir=None):
    game_dir = Path(game_dir) if game_dir is not None else ROOT / 'game'
    frames, image = extract_frames()
    for who in CELLS:
        scale = (170 if who == 'frost' else 153) / frames[who]['idle'].height
        for pose, cell in frames[who].items():
            cell = cell.resize((round(cell.width * scale), round(cell.height * scale)), Image.Resampling.LANCZOS)
            mask = np.asarray(cell.getchannel('A'))
            _, xs = np.where(mask[:max(1, round(cell.height * .22))] > 128)
            anchor = float(np.median(xs)) if len(xs) else cell.width / 2
            name = f'{who}_{pose}'
            cell.save(game_dir / f'{name}.webp', lossless=True)
            sizes[name] = [cell.width, cell.height, round(anchor, 1)]

        # Upper-body portraits from the approved idle pose, shared by meet cards and HUD.
        idle = frames[who]['idle']
        bust_h = round(idle.height * .57)
        bust_w = round(bust_h * .75)
        mask = np.asarray(idle.getchannel('A'))
        _, xs = np.where(mask[:round(idle.height * .22)] > 128)
        cx = float(np.median(xs))
        portrait = idle.crop((round(cx - bust_w / 2), 0, round(cx - bust_w / 2) + bust_w, bust_h))
        portrait = portrait.resize((312, 416), Image.Resampling.LANCZOS)
        portrait.save(game_dir / f'portrait_{who}.webp', lossless=True)
        sizes[f'portrait_{who}'] = [312, 416]
    word_fast(frames['frost']['run4'], game_dir, sizes)
    sizes['ui_meet'] = [256, 256]
    image.save(ART / 'raw/elsa-anna-atlas.png')


if __name__ == '__main__':
    import sys
    path = ART / 'sizes.json'
    sizes = json.loads(path.read_text())
    if '--word-fast' in sys.argv:            # only the "fast" word card, from the approved run frame
        word_fast(extract_frames()[0]['frost']['run4'], ROOT / 'game', sizes)
        path.write_text(json.dumps(sizes, indent=0) + '\n')
        sys.exit(0)
    import_atlas(sizes)
    path.write_text(json.dumps(sizes, indent=0) + '\n')
    print('Imported 24 character frames and 2 portraits.')
