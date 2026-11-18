"""Large copies of the stage pictures for big screens (fullscreen, a Retina display): game/hd/<name>.webp at twice the stored size.

The technique of news-e-accs tools/make-wallpaper.sh: Real-ESRGAN upscales 4x, Lanczos brings the result to the target size, and the
opaque paintings (backgrounds, story and memory pictures) get a light grain back, because x4plus smooths the watercolour texture.
Pictures with transparency (the sisters, toys, doors) use the x4plus-anime model, whose clean edges suit the cut-out line art, and get
no grain. Both models are BSD-3 (Real-ESRGAN), so the copies ship with the game.

    python art/hd.py              makes the copies that are missing or whose picture changed (art/hd.json keeps a hash of each source)
    python art/hd.py --force      all of them
    python art/hd.py --only bg1,frost_idle

Needs Pillow and numpy (e.g. the venv of art/character_atlas.py) and realesrgan-ncnn-vulkan: REALESRGAN=path, on PATH, or
~/Applications/realesrgan, with its models/ directory next to it. Writes art/hd.json { name: sha256 of game/<name>.webp, first 12 },
which art/build_page.py puts into the page (the view swaps a picture for its large copy, see src/view/00-core.js). Run
python3 art/build_page.py afterwards. """
import argparse, hashlib, json, os, re, shutil, subprocess, sys, tempfile
from pathlib import Path

import numpy as np
from PIL import Image

ART = Path(__file__).resolve().parent
GAME = ART.parent / 'game'
HD = GAME / 'hd'
INDEX = ART / 'hd.json'
SCALE = 2
GRAIN = 3.0          # std of the grain on opaque paintings, in 8-bit levels
# the pictures drawn on the stage or across the whole stage; word icons, stickers, UI icons and glow effects stay as they are
STAGE = re.compile(r'^(bg\d*|bg_\w+|story_\w+|mem_\w+|key|portrait_\w+|(frost|nuan)_\w+|hat_\w+|door_\w+|flake|heart|ball|two|snowman|gate'
                   r'|iceblock|frozen|pinkice|shelf\d|drift\d|water|plate_\w+|brick|tile_slope_\w|spring_\d|floe\w*|note_\w+|flower_\d'
                   r'|bunny_\w+|fish_\d)$')


def find_esrgan():
    for cand in (os.environ.get('REALESRGAN'), shutil.which('realesrgan-ncnn-vulkan'),
                 str(Path.home() / 'Applications/realesrgan/realesrgan-ncnn-vulkan')):
        if cand and os.access(cand, os.X_OK):
            return Path(cand)
    return None


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()[:12]


def upscale(names, model, tmp, binary):
    """one run per model over a folder: the model loads once. The tool exits 0 even when it fails, so every output is checked."""
    run_in, run_out = tmp / f'{model}-in', tmp / f'{model}-out'
    run_in.mkdir(); run_out.mkdir()
    for n in names:
        Image.open(GAME / f'{n}.webp').save(run_in / f'{n}.png')
    log = subprocess.run([str(binary), '-i', str(run_in), '-o', str(run_out), '-n', model, '-m', str(binary.parent / 'models'), '-f', 'png'],
                         capture_output=True, text=True)
    missing = [n for n in names if not (run_out / f'{n}.png').is_file()]
    if missing:
        sys.exit(f'{model}: no output for {missing[:5]}\n{log.stderr[-2000:]}')
    return run_out


def finish(name, x4, opaque, rng):
    sd = Image.open(GAME / f'{name}.webp')
    im = Image.open(x4).convert('RGBA' if not opaque else 'RGB').resize((sd.width * SCALE, sd.height * SCALE), Image.LANCZOS)
    if opaque:
        a = np.asarray(im, np.float32)
        a += rng.normal(0, GRAIN, a.shape[:2])[..., None]          # one grain for all three channels: no colour speckle
        im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
        im.save(HD / f'{name}.webp', quality=80, method=6)
    else:
        im.save(HD / f'{name}.webp', quality=88, alpha_quality=90, method=6)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--only', default='')
    a = ap.parse_args()
    index = json.loads(INDEX.read_text()) if INDEX.exists() else {}
    names = sorted(p.stem for p in GAME.glob('*.webp') if STAGE.match(p.stem))
    if a.only:
        want = set(a.only.split(','))
        unknown = want - set(names)
        if unknown:
            sys.exit(f'not stage pictures: {sorted(unknown)}')
        names = [n for n in names if n in want]
    HD.mkdir(exist_ok=True)
    todo = [n for n in names if a.force or index.get(n) != digest(GAME / f'{n}.webp') or not (HD / f'{n}.webp').is_file()]
    print(f'{len(names)} stage pictures, {len(todo)} to make')
    if todo:
        binary = find_esrgan() or sys.exit('realesrgan-ncnn-vulkan not found: set REALESRGAN or put it on PATH')
        opaque = {n for n in todo if Image.open(GAME / f'{n}.webp').mode != 'RGBA'}
        rng = np.random.default_rng(7)
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            for model, group in (('realesrgan-x4plus', sorted(opaque)), ('realesrgan-x4plus-anime', sorted(set(todo) - opaque))):
                if not group:
                    continue
                print(f'{model}: {len(group)}')
                out = upscale(group, model, tmp, binary)
                for n in group:
                    finish(n, out / f'{n}.png', n in opaque, rng)
                    index[n] = digest(GAME / f'{n}.webp')
    # forget copies whose picture is gone
    for n in list(index):
        if not (GAME / f'{n}.webp').is_file():
            index.pop(n)
            (HD / f'{n}.webp').unlink(missing_ok=True)
    INDEX.write_text(json.dumps(dict(sorted(index.items())), indent=0) + '\n')
    total = sum(p.stat().st_size for p in HD.glob('*.webp'))
    print(f'game/hd: {len(index)} pictures, {total / 1e6:.1f} MB')


if __name__ == '__main__':
    main()
