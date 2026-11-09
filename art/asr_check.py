"""Proofread the generated voices with ASR (PLAN A4): zh segments with --lang zh, English with --lang en.

Why per segment: a finished clip mixes Chinese and English, and one whisper language setting reads only one of them well.
narration.py keeps every distinct synthesized segment when given --segments, so the check runs on those:

    ~/lemo-opuscar/.venv/bin/python art/narration.py --all --segments .tools/tmp/segs      # or --only k1,k2
    python3 art/asr_check.py .tools/tmp/segs [--python .tools/venv/bin/python] [--model small] [--max-err 0.1]

It calls ~/.claude/skills/opuscar-film/scripts/asr_check.py (needs faster-whisper, librosa, soundfile: install them into
ROOT/.tools/venv, never into the lemo venv). That script reads LINES.json ([{"id","text"}]) and VOICES_DIR/<id>.wav, so
this wrapper writes one LINES.json per language and links the wavs into a scratch directory.

Judging, after the skill script has printed its own verdicts:
  - zh segments: the skill's verdict stands (OK / NEAR / DIFF; NEAR is a likely homophone and does not fail). A DIFF on a
    segment of one or two characters is listed as SHORT instead: whisper makes things up on so little audio, so listen to it.
  - English single words: pass when the transcript CONTAINS the word (whisper likes to add "a", "the" or a full stop;
    digits are read as number words, "1" == "one"). DIFF only when the word is missing.
  - English phrases ("Good job!"): the skill's error-rate verdict.
Exit code 1 when anything is DIFF; every DIFF is listed again at the end with the clips that use it.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SKILL = os.path.expanduser('~/.claude/skills/opuscar-film/scripts/asr_check.py')
DIGITS = {'0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four', '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine', '10': 'ten'}
RESULT = re.compile(r'^(OK  |NEAR|DIFF|SKIP)\s+(\S+)(?:\s+err=([\d.]+))?\s*\|\s*(.*?)\s*→\s*(.*)$')


def words_of(text):
    text = re.sub(r"[^\w' ]", ' ', text.lower().replace("'", ''))
    return [DIGITS.get(t, t) for t in text.split()]


def run_skill(python, items, seg_dir, lang, model, max_err, tmp, tag):
    """items: manifest entries. Returns {id: (tag, err, want, got)}."""
    vdir = os.path.join(tmp, tag)
    os.makedirs(vdir)
    for it in items:
        os.symlink(os.path.abspath(os.path.join(seg_dir, it['id'] + '.wav')), os.path.join(vdir, it['id'] + '.wav'))
    lines = os.path.join(tmp, tag + '.json')
    with open(lines, 'w', encoding='utf-8') as f:
        json.dump([{'id': it['id'], 'text': it['text']} for it in items], f, ensure_ascii=False)
    cmd = [python, SKILL, lines, vdir, '--lang', lang, '--model', model, '--max-err', str(max_err)]
    print(f'== {lang}: {len(items)} segments', flush=True)
    p = subprocess.run(cmd, capture_output=True, text=True)
    out = {}
    for row in p.stdout.splitlines():
        print(row, flush=True)
        m = RESULT.match(row)
        if m:
            out[m.group(2)] = (m.group(1).strip(), float(m.group(3) or 0), m.group(4), m.group(5))
    if p.returncode not in (0, 1) or (not out and items):
        sys.stderr.write(p.stderr[-1500:])
        raise SystemExit(f'asr_check.py failed for {lang} (exit {p.returncode}); is faster-whisper installed in {python}?')
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('segments', help='the --segments directory written by narration.py')
    ap.add_argument('--python', default=os.path.join(ROOT, '.tools', 'venv', 'bin', 'python'))
    ap.add_argument('--model', default='small')
    ap.add_argument('--max-err', type=float, default=0.1)
    a = ap.parse_args(argv)
    manifest = json.load(open(os.path.join(a.segments, 'segments.json'), encoding='utf-8'))
    if not os.path.exists(SKILL):
        raise SystemExit(f'missing {SKILL}')
    zh = [m for m in manifest if m['lang'] == 'zh']
    en = [m for m in manifest if m['lang'] == 'en']
    bad = []
    with tempfile.TemporaryDirectory() as tmp:
        res_zh = run_skill(a.python, zh, a.segments, 'zh', a.model, a.max_err, tmp, 'zh') if zh else {}
        res_en = run_skill(a.python, en, a.segments, 'en', a.model, a.max_err, tmp, 'en') if en else {}
    short = []
    for it in zh:
        verdict = res_zh.get(it['id'])
        if verdict is None:
            bad.append((it, 'no result', ''))
        elif verdict[0] == 'DIFF' and len(re.sub(r'[\W_]', '', it['text'])) <= 2:
            short.append((it, verdict[3]))   # whisper makes things up on 1-2 characters (it repeats its own prompt); listen instead
        elif verdict[0] == 'DIFF':
            bad.append((it, f'err={verdict[1]:.2f}', verdict[3]))
    for it in en:
        verdict = res_en.get(it['id'])
        want = words_of(it['text'])
        if verdict is None:
            bad.append((it, 'no result', ''))
        elif len(want) == 1:
            ok = want[0] in words_of(verdict[3])
            print(('OK   ' if ok else 'DIFF ') + it['id'], f'word {it["text"]!r} in {verdict[3]!r}')
            if not ok:
                bad.append((it, 'word not heard', verdict[3]))
        elif verdict[0] == 'DIFF':
            bad.append((it, f'err={verdict[1]:.2f}', verdict[3]))
    print(f'\n{len(zh)} zh + {len(en)} en segments checked, {len(bad)} DIFF, {len(short)} too short to judge')
    for it, got in short:
        print(f'  SHORT {it["id"]} [zh] {it["text"]!r} heard {got!r}; used by {", ".join(it["used_by"][:6])}: listen to it')
    for it, why, got in bad:
        print(f'  DIFF {it["id"]} [{it["lang"]}] {it["text"]!r} ({why}) heard {got!r}; used by {", ".join(it["used_by"][:6])}')
        print(f'       regenerate: narration.py --only {",".join(it["used_by"][:6])}')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
