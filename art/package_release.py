"""Package the built static game, omitting obsolete audio and all authoring/QA files.

Run after build_page.py: python3 art/package_release.py --out /path/to/game.zip
"""
import argparse
import hashlib
import json
import re
from pathlib import Path
import zipfile

from narration import Content, plan

ROOT = Path(__file__).resolve().parent.parent


def package(out):
    page = (ROOT / 'ice-castle.html').read_bytes()
    content = Content(ROOT / 'src/content/lines.json', ROOT / 'src/content/words.json')
    jobs = plan(content, None, True, str(ROOT / 'game'), None)
    files = {p.name: p for p in (ROOT / 'game').glob('*.webp')}
    files.update({j.name: ROOT / 'game' / j.name for j in jobs})
    files['subs.json'] = ROOT / 'game/subs.json'
    payload = {'index.html': page, 'ice-castle.html': page}
    for name, path in sorted(files.items()):
        data = path.read_bytes()
        if not data:
            raise ValueError(f'Empty release asset: {name}')
        payload['game/' + name] = data
    total = sum(map(len, payload.values()))
    if total > 40_000_000:
        raise ValueError(f'Release exceeds 40 MB: {total}')
    version = re.search(rb'const ASSET_VERSION = "([a-f0-9]+)"', page)
    if not version:
        raise ValueError('Build the page with asset fingerprints before packaging')
    manifest = {'asset_version': version[1].decode(), 'runtime_bytes': total,
                'audio_files': len(jobs), 'webp_files': sum(n.endswith('.webp') for n in files),
                'files': {name: hashlib.sha256(data).hexdigest() for name, data in sorted(payload.items())}}
    payload['manifest.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
    payload['README.txt'] = ('艾莎和安娜的冰堡\n\n解压后在文件夹中启动静态网页服务器，例如：\n'
                             'python3 -m http.server 8000\n\n打开 http://localhost:8000/ 开始游戏。\n'
                             '进度保存在当前浏览器中。配音需要通过点击开始按钮启用。\n').encode()
    out = Path(out); out.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for name, data in sorted(payload.items()):
            z.writestr(name, data)
    with zipfile.ZipFile(out) as z:
        assert z.testzip() is None
        for name, sha in manifest['files'].items():
            assert hashlib.sha256(z.read(name)).hexdigest() == sha, name
    return {'path': str(out), 'zip_bytes': out.stat().st_size, 'runtime_bytes': total,
            'audio_files': len(jobs), 'asset_version': manifest['asset_version'],
            'sha256': hashlib.sha256(out.read_bytes()).hexdigest()}


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--out', required=True)
    args = ap.parse_args()
    print(json.dumps(package(args.out), indent=2))
