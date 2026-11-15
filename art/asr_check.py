"""Proofread the generated voices with ASR (PLAN A4): zh segments with --lang zh, English with --lang en.

Why per segment: a finished clip mixes Chinese and English, and one whisper language setting reads only one of them well.
narration.py keeps every distinct synthesized segment when given --segments, so the check runs on those:

    ~/lemo-opuscar/.venv/bin/python art/narration.py --all --segments .tools/tmp/segs      # or --only k1,k2
    python3 art/asr_check.py .tools/tmp/segs [--python .tools/venv/bin/python] [--model small] [--max-err 0.1] [--report art/2c-voice-report.json]

It calls art/asr_whisper.py, a copy of the opuscar-film skill's asr_check.py so the check does not depend on anything outside
the repository (needs faster-whisper, librosa, soundfile: install them into ROOT/.tools/venv, never into the lemo venv).
--report writes the per-segment text, transcript, verdict and duration as JSON. That script reads LINES.json ([{"id","text"}]) and VOICES_DIR/<id>.wav, so
this wrapper writes one LINES.json per language and links the wavs into a scratch directory.

Judging, after the skill script has printed its own verdicts:
  - zh segments: the skill's verdict stands (OK / NEAR / DIFF; NEAR is a likely homophone and does not fail). A DIFF on a
    segment of one or two characters is listed as SHORT instead: whisper makes things up on so little audio, so listen to it.
  - English single words: pass when the transcript CONTAINS the word (whisper likes to add "a", "the" or a full stop;
    digits are read as number words, "1" == "one"). DIFF only when the word is missing.
  - English phrases ("Good job!"): the skill's error-rate verdict.
  - mixed lines (lang "mix": an ElevenLabs speaker reads a whole zh/en line as one segment): transcribed twice, as zh and as en,
    because whisper in zh mode often writes a clearly spoken English word as its Chinese translation (fast -> 快). The Chinese
    characters of the zh pass are scored by how many the line lost or changed (extras are ignored: they are mostly translated English
    words); OK within --max-err, NEAR for one character, else DIFF. Every English word must appear in Latin letters in either pass,
    otherwise DIFF ("word not heard").
Exit code 1 when anything is DIFF; every DIFF is listed again at the end with the clips that use it.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import wave

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SKILL = os.path.join(HERE, 'asr_whisper.py')
DIGITS = {'0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four', '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine', '10': 'ten'}
RESULT = re.compile(r'^(OK  |NEAR|DIFF|SKIP)\s+(\S+)(?:\s+err=([\d.]+))?\s*\|\s*(.*?)\s*→\s*(.*)$')


def words_of(text):
    text = re.sub(r"[^\w' ]", ' ', text.lower().replace("'", ''))
    return [DIGITS.get(t, t) for t in text.split()]


def latin_words(text):
    return [DIGITS.get(t, t) for t in re.findall(r"[a-z']+|\d+", text.lower().replace("'", ''))]


def cjk_chars(text):
    return [c for c in text if '\u4e00' <= c <= '\u9fff']


def lcs(a, b):
    prev = [0] * (len(b) + 1)
    for x in a:
        cur = [0]
        for j, y in enumerate(b, 1):
            cur.append(prev[j - 1] + 1 if x == y else max(prev[j], cur[j - 1]))
        prev = cur
    return prev[-1]


def judge_mix(text, got, max_err, got_en=''):
    """-> (verdict, why) for a whole mixed line. Chinese: the share of the line's characters the zh pass lost or changed; extra
    characters do not count, they are mostly whisper writing an English word as its translation. English: each word in either pass."""
    want_c, got_c = cjk_chars(text), cjk_chars(got)
    dist = len(want_c) - lcs(want_c, got_c)
    err = dist / max(1, len(want_c))
    heard = set(latin_words(got)) | set(latin_words(got_en))
    missing = [w for w in dict.fromkeys(latin_words(text)) if w not in heard]
    if missing:
        return 'DIFF', 'word not heard: ' + ', '.join(missing)
    if err <= max_err:
        return 'OK', ''
    if dist == 1:
        return 'NEAR', ''
    return 'DIFF', f'err={err:.2f}'


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
    ap.add_argument('--report', metavar='PATH', help='write per-segment results as JSON')
    a = ap.parse_args(argv)
    manifest = json.load(open(os.path.join(a.segments, 'segments.json'), encoding='utf-8'))
    if not os.path.exists(SKILL):
        raise SystemExit(f'missing {SKILL}')
    zh = [m for m in manifest if m['lang'] == 'zh']
    en = [m for m in manifest if m['lang'] == 'en']
    mix = [m for m in manifest if m['lang'] == 'mix']
    bad = []
    with tempfile.TemporaryDirectory() as tmp:
        res_zh = run_skill(a.python, zh, a.segments, 'zh', a.model, a.max_err, tmp, 'zh') if zh else {}
        res_en = run_skill(a.python, en, a.segments, 'en', a.model, a.max_err, tmp, 'en') if en else {}
        res_mix = run_skill(a.python, mix, a.segments, 'zh', a.model, a.max_err, tmp, 'mix') if mix else {}
        res_mix_en = run_skill(a.python, mix, a.segments, 'en', a.model, a.max_err, tmp, 'mix_en') if mix else {}
    short = []
    judged = {}   # segment id -> (verdict, transcript)
    for it in zh:
        verdict = res_zh.get(it['id'])
        if verdict is None:
            bad.append((it, 'no result', ''))
            judged[it['id']] = ('NO_RESULT', '')
        elif verdict[0] == 'DIFF' and len(re.sub(r'[\W_]', '', it['text'])) <= 2:
            short.append((it, verdict[3]))   # whisper makes things up on 1-2 characters (it repeats its own prompt); listen instead
            judged[it['id']] = ('SHORT', verdict[3])
        elif verdict[0] == 'DIFF':
            bad.append((it, f'err={verdict[1]:.2f}', verdict[3]))
            judged[it['id']] = ('DIFF', verdict[3])
        else:
            judged[it['id']] = (verdict[0], verdict[3])
    for it in en:
        verdict = res_en.get(it['id'])
        want = words_of(it['text'])
        if verdict is None:
            bad.append((it, 'no result', ''))
            judged[it['id']] = ('NO_RESULT', '')
        elif len(want) == 1:
            ok = want[0] in words_of(verdict[3])
            print(('OK   ' if ok else 'DIFF ') + it['id'], f'word {it["text"]!r} in {verdict[3]!r}')
            if not ok:
                bad.append((it, 'word not heard', verdict[3]))
            judged[it['id']] = ('OK' if ok else 'DIFF', verdict[3])
        elif verdict[0] == 'DIFF':
            bad.append((it, f'err={verdict[1]:.2f}', verdict[3]))
            judged[it['id']] = ('DIFF', verdict[3])
        else:
            judged[it['id']] = (verdict[0], verdict[3])
    for it in mix:
        res = res_mix.get(it['id'])
        if res is None:
            bad.append((it, 'no result', ''))
            judged[it['id']] = ('NO_RESULT', '')
            continue
        got_en = (res_mix_en.get(it['id']) or ('', 0, '', ''))[3]
        verdict, why = judge_mix(it['text'], res[3], a.max_err, got_en)
        print(f'{verdict:5}{it["id"]} mixed {it["text"]!r} -> {res[3]!r} / en {got_en!r}' + (f' ({why})' if why else ''))
        if verdict == 'DIFF':
            bad.append((it, why, res[3] + ' / en: ' + got_en))
        judged[it['id']] = (verdict, res[3] + ' / en: ' + got_en)
    if a.report:
        rows = []
        for it in zh + en + mix:
            with wave.open(os.path.join(a.segments, it['id'] + '.wav')) as w:
                seconds = round(w.getnframes() / w.getframerate(), 2)
            verdict, got = judged[it['id']]
            rows.append({'id': it['id'], 'lang': it['lang'], 'text': it['text'], 'transcript': got, 'verdict': verdict,
                         'duration_s': seconds, 'used_by': it['used_by']})
        with open(a.report, 'w', encoding='utf-8') as f:
            json.dump({'segments': rows}, f, ensure_ascii=False, indent=1)
    print(f'\n{len(zh)} zh + {len(en)} en + {len(mix)} mixed segments checked, {len(bad)} DIFF, {len(short)} too short to judge')
    for it, got in short:
        print(f'  SHORT {it["id"]} [zh] {it["text"]!r} heard {got!r}; used by {", ".join(it["used_by"][:6])}: listen to it')
    for it, why, got in bad:
        print(f'  DIFF {it["id"]} [{it["lang"]}] {it["text"]!r} ({why}) heard {got!r}; used by {", ".join(it["used_by"][:6])}')
        print(f'       regenerate: narration.py --only {",".join(it["used_by"][:6])}')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
