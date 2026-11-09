"""Import the approved Grok atlas. Run from anywhere after the legacy art slicer.

Requires Pillow, numpy and scipy (same environment as slice.py).
Internal frost/nuan IDs remain stable for saves, audio and game logic.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

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
    rgb = np.asarray(image.convert('RGB'), dtype=np.float32)
    # Blue cloth, pale hair and skin have no dominant green. Feather only the key edge.
    excess = rgb[..., 1] - np.maximum(rgb[..., 0], rgb[..., 2])
    alpha = np.clip((100 - excess) / 65, 0, 1)
    # Suppress JPEG green spill on partially covered edge pixels.
    rgb[..., 1] -= np.maximum(excess, 0) * (1 - alpha)
    return Image.fromarray(np.dstack((rgb, alpha * 255)).clip(0, 255).astype('uint8'))


def import_atlas(sizes, game_dir=None):
    game_dir = Path(game_dir) if game_dir is not None else ROOT / 'game'
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
    frames = {}
    for who, cells in CELLS.items():
        frames[who] = {}
        for pose, index in cells.items():
            frames[who][pose] = extracted[index]
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
    # The title previously contained the original sisters, so replace its figures too.
    cover = Image.open(game_dir / 'bg0.webp').convert('RGBA').resize((960, 520), Image.Resampling.LANCZOS)
    for who, cx in [('frost', 270), ('nuan', 700)]:
        figure = frames[who]['idle'].copy()
        scale = 365 / figure.height
        figure = figure.resize((round(figure.width * scale), 365), Image.Resampling.LANCZOS)
        cover.alpha_composite(figure, (round(cx - figure.width / 2), 155))
    cover.convert('RGB').save(game_dir / 'key.webp', quality=90)
    meet = Image.new('RGBA', (256, 256))
    for who, x in [('frost', 0), ('nuan', 128)]:
        portrait = Image.open(game_dir / f'portrait_{who}.webp')
        portrait = portrait.resize((128, 171), Image.Resampling.LANCZOS)
        meet.alpha_composite(portrait, (x, 43))
    meet.save(game_dir / 'ui_meet.webp', lossless=True)
    sizes['ui_meet'] = [256, 256]
    image.save(ART / 'raw/elsa-anna-atlas.png')


if __name__ == '__main__':
    path = ART / 'sizes.json'
    sizes = json.loads(path.read_text())
    import_atlas(sizes)
    path.write_text(json.dumps(sizes, indent=0) + '\n')
    print('Imported 24 character frames and 2 portraits.')
