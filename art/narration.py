"""Voice the kids' edition with edge-tts: line clips, companion variants, word readings and subtitle text.

Run with a Python that has edge_tts (the user's lemo venv is fine for this; never install into it):
    ~/lemo-opuscar/.venv/bin/python art/narration.py [flags]
Needs ffmpeg on PATH (mp3 encoder libmp3lame).

Input   src/content/lines.json  {"voices": {...}, "lines": {key: {who, say:[segments], art?}}, "pages"?: {...}}
        src/content/words.json  [{id, en, zh, icon, room}]
Output  <out>/vo_<key>.mp3                 narrator / frost / nuan / fixed-voice lines
        <out>/vo_<key>__frost.mp3          "companion" lines are rendered once per sister; the view picks by g.player
        <out>/vo_<key>__nuan.mp3
        <out>/vo_<key>[__who]__w.mp3       only for lines with {"en": ...} segments: the "english = words only" variant,
                                           where each {"en","zh"} phrase becomes its zh gloss (skipped without a gloss)
        <out>/word_<id>.mp3                one word, narrator en voice, slow
        <out>/subs.json                    subtitle text (English marked) plus the word table, see below
<out> defaults to ./game (relative to the current directory, like the old script).

Segments (PLAN A4): a string is spoken with the speaker's zh voice, {"w": id} with the speaker's en voice (word text from
words.json), {"en": "Yay!"} with the en voice. English segments are 15 % slower than the voice's own en rate. Segments are
trimmed, joined with a 0.12 s gap, loudness-normalised and encoded as 48 kbps mono mp3.

Flags
    (none)              only clips whose file is missing
    --all               regenerate everything
    --only a,b,word_x   only these line keys / word_<id> ("words" = every word reading)
    --sample N          write N representative clips (mixed zh/en lines of every speaker first) into <out>/sample/, always
                        regenerated, no subs.json: for listening before the batch run
    --dry-run           print what would be generated, no network, no ffmpeg
    --segments DIR      also keep every distinct synthesized segment as DIR/<id>.wav plus DIR/segments.json, for art/asr_check.py
    --lines/--words/--out PATH   override the default locations (used by tests)

subs.json (always rewritten from lines + words, whatever the other flags):
    {"v": 1,
     "words": {id: {"en", "zh", "room"}},
     "lines": {key: {"who": "nuan", "comp": false,
                     "s": [[text, isEnglish(0|1)], ...],      # subtitle segments, english = "words + phrases"
                     "w": [[text, 0|1], ...] | null}}}       # only when the line has {"en"} segments; null = nothing to say
"""
import argparse
import asyncio
import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
GAP = 0.12            # seconds of silence between segments
TAIL = 0.10           # a little air after the last segment so the mp3 never ends on a click
EN_SLOWER = 15        # percent, on top of the voice's own en rate
SAMPLE_RATE = 24000
BITRATE = '48k'
LOUDNESS = 'I=-18:TP=-2:LRA=11'
SPEAKERS = ('narrator', 'frost', 'nuan')
# Used when lines.json carries no "voices" block; mirrors PLAN A4.
DEFAULT_VOICES = {
    'narrator': {'zh': ['zh-CN-XiaoxiaoNeural', '-8%', '+0Hz'], 'en': ['en-US-JennyNeural', '-20%', '+0Hz']},
    'frost': {'zh': ['zh-CN-XiaoxiaoNeural', '-6%', '-4Hz'], 'en': ['en-US-JennyNeural', '-15%', '-4Hz']},
    'nuan': {'zh': ['zh-CN-XiaoyiNeural', '+4%', '+8Hz'], 'en': ['en-US-AriaNeural', '-10%', '+4Hz']},
}
PUNCT_ONLY = re.compile(r'^[\W_]*$', re.UNICODE)   # nothing a voice could say


class Fail(Exception):
    pass


# ---------------------------------------------------------------- data model

def slower(rate, pct=EN_SLOWER):
    """'-20%' made another 15 % slower -> '-32%' (speed factors multiply)."""
    m = re.fullmatch(r'([+-]?\d+)%', rate.strip())
    if not m:
        raise Fail(f'unsupported rate {rate!r}, expected something like "-20%"')
    return '%+d%%' % round(((1 + int(m.group(1)) / 100) * (1 - pct / 100) - 1) * 100)


def load_json(path, what):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError) as e:
        raise Fail(f'cannot read {what} {path}: {e}')


class Content:
    def __init__(self, lines_path, words_path):
        doc = load_json(lines_path, 'lines')
        if not isinstance(doc, dict) or not isinstance(doc.get('lines'), dict):
            raise Fail(f'{lines_path} has no "lines" object (old S0 format?)')
        self.voices = doc.get('voices') or DEFAULT_VOICES
        for who in SPEAKERS:
            for lang in ('zh', 'en'):
                v = self.voices.get(who, {}).get(lang)
                if not (isinstance(v, list) and len(v) == 3):
                    raise Fail(f'voices.{who}.{lang} must be [voice, rate, pitch]')
        self.lines = dict(doc.get('pages') or {})
        self.lines.update(doc['lines'])
        words = load_json(words_path, 'words')
        if not isinstance(words, list):
            raise Fail(f'{words_path} must be a list')
        self.words = {}
        for w in words:
            if not w.get('id') or not w.get('en'):
                raise Fail(f'word without id/en: {w}')
            self.words[w['id']] = w
        for key, line in self.lines.items():
            self.check(key, line)

    def check(self, key, line):
        if line.get('who') not in SPEAKERS + ('companion',):
            raise Fail(f'line {key}: who must be narrator|frost|nuan|companion, got {line.get("who")!r}')
        if not isinstance(line.get('say'), list) or not line['say']:
            raise Fail(f'line {key}: "say" must be a non-empty list')
        for seg in line['say']:
            if isinstance(seg, str):
                continue
            if isinstance(seg, dict) and isinstance(seg.get('w'), str):
                if seg['w'] not in self.words:
                    raise Fail(f'line {key}: word {seg["w"]!r} is not in words.json')
            elif not (isinstance(seg, dict) and isinstance(seg.get('en'), str)):
                raise Fail(f'line {key}: bad segment {seg!r}')

    def voice(self, who, lang):
        v = self.voices[who][lang]
        return (v[0], v[1] if lang == 'zh' else slower(v[1]), v[2])

    def segments(self, key, who, words_only=False):
        """-> [{text, lang, voice, en}] where en marks English for the subtitle. Punctuation-only text is kept for the
        subtitle but has no voice (voice is None)."""
        out = []
        for seg in self.lines[key]['say']:
            if isinstance(seg, str):
                text, lang = seg, 'zh'
            elif 'w' in seg:
                text, lang = self.words[seg['w']]['en'], 'en'
            elif words_only:
                text, lang = seg.get('zh', ''), 'zh'
            else:
                text, lang = seg['en'], 'en'
            if not text.strip():
                continue
            out.append({'text': text, 'lang': lang, 'en': lang == 'en',
                        'voice': None if PUNCT_ONLY.match(text) else self.voice(who, lang)})
        return out

    def has_en_phrase(self, key):
        return any(isinstance(s, dict) and 'en' in s for s in self.lines[key]['say'])

    def outputs(self, key):
        """-> [(file name, speaker, words_only)] for one line."""
        who = self.lines[key]['who']
        speakers = [('frost', '__frost'), ('nuan', '__nuan')] if who == 'companion' else [(who, '')]
        outs = [(f'vo_{key}{suf}.mp3', sp, False) for sp, suf in speakers]
        if self.has_en_phrase(key):
            outs += [(f'vo_{key}{suf}__w.mp3', sp, True) for sp, suf in speakers]
        return outs


def subs_doc(content):
    lines = {}
    for key, line in content.lines.items():
        who = line['who']
        sp = 'nuan' if who == 'companion' else who   # subtitle text does not depend on the voice, only the speaker label
        ent = {'who': who, 'comp': who == 'companion',
               's': [[s['text'], int(s['en'])] for s in content.segments(key, sp)]}
        if content.has_en_phrase(key):
            w = [[s['text'], int(s['en'])] for s in content.segments(key, sp, True)]
            ent['w'] = w if any(s['voice'] for s in content.segments(key, sp, True)) else None
        lines[key] = ent
    return {'v': 1, 'words': {i: {'en': w['en'], 'zh': w.get('zh', ''), 'room': w.get('room')} for i, w in content.words.items()}, 'lines': lines}


# ---------------------------------------------------------------- planning

def seg_hash(voice, text):
    return hashlib.sha1('\x00'.join((*voice, text)).encode('utf-8')).hexdigest()[:12]


class Job:
    """One mp3 to write: a list of segments (dicts with 'voice' possibly None)."""
    def __init__(self, name, segs, label):
        self.name, self.segs, self.label = name, [s for s in segs if s['voice']], label


def plan(content, only, redo, out_dir, sample):
    jobs = []
    if sample:
        return [Job(name, segs, label) for name, segs, label in sample_items(content, sample)]
    if only is not None:
        known = set(content.lines) | {f'word_{i}' for i in content.words} | {'words'}
        bad = sorted(only - known)
        if bad:
            raise Fail('--only: unknown key(s): ' + ', '.join(bad))
    want_words = only is None or 'words' in only or any(o.startswith('word_') for o in only)
    for key in content.lines:
        if only is not None and key not in only:
            continue
        for fname, sp, wo in content.outputs(key):
            if redo or only is not None or not os.path.exists(os.path.join(out_dir, fname)):
                segs = content.segments(key, sp, wo)
                if any(s['voice'] for s in segs):
                    jobs.append(Job(fname, segs, key))
    if want_words:
        for wid, w in content.words.items():
            if only is not None and 'words' not in only and f'word_{wid}' not in only:
                continue
            fname = f'word_{wid}.mp3'
            if redo or only is not None or not os.path.exists(os.path.join(out_dir, fname)):
                jobs.append(Job(fname, [{'text': w['en'], 'lang': 'en', 'en': True, 'voice': content.voice('narrator', 'en')}], f'word_{wid}'))
    return jobs


def sample_items(content, n):
    """N clips that show how zh and en mix: lines with {"w"} first, spread over speakers, then phrase lines, then plain ones;
    plus up to two word readings."""
    def kind(key):
        say = content.lines[key]['say']
        return 0 if any(isinstance(s, dict) and 'w' in s for s in say) else 1 if any(isinstance(s, dict) for s in say) else 2
    order = sorted(content.lines, key=lambda k: (kind(k), k))
    picked, seen = [], {}
    for key in order:               # first pass: at most one line per (kind, speaker)
        tag = (kind(key), content.lines[key]['who'])
        if tag not in seen and len(picked) < n:
            seen[tag] = 1
            picked.append(key)
    for key in order:               # second pass: fill up
        if key not in picked and len(picked) < n:
            picked.append(key)
    items = []
    for key in picked:
        fname, sp, wo = content.outputs(key)[0]
        items.append((fname, content.segments(key, sp, wo), key))
    for wid in list(content.words)[:min(2, n)]:
        items.append((f'word_{wid}.mp3', [{'text': content.words[wid]['en'], 'lang': 'en', 'en': True, 'voice': content.voice('narrator', 'en')}], f'word_{wid}'))
    return items


# ---------------------------------------------------------------- synthesis

def run(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode != 0:
        raise Fail(f'{cmd[0]} failed: {r.stderr.strip()[-400:]}')
    return r


async def synth_all(specs, tmp):
    """specs: {hash: (voice, text)} -> writes tmp/<hash>.raw.mp3; 4 at a time, 3 tries each."""
    import edge_tts
    sem = asyncio.Semaphore(4)

    async def one(h, voice, text):
        raw = os.path.join(tmp, h + '.raw.mp3')
        async with sem:
            for attempt in range(3):
                try:
                    await edge_tts.Communicate(text, voice[0], rate=voice[1], pitch=voice[2]).save(raw)
                    if os.path.getsize(raw) > 0:
                        return
                except Exception as e:
                    if attempt == 2:
                        raise Fail(f'edge-tts failed for {text!r} ({voice[0]}): {e}')
                await asyncio.sleep(1.5 * (attempt + 1))
            raise Fail(f'edge-tts returned no audio for {text!r}')

    await asyncio.gather(*(one(h, v, t) for h, (v, t) in specs.items()))


def to_wav(h, tmp):
    raw, wav = os.path.join(tmp, h + '.raw.mp3'), os.path.join(tmp, h + '.wav')
    trim = 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse'
    run(['ffmpeg', '-v', 'error', '-y', '-i', raw, '-af', trim, '-ar', str(SAMPLE_RATE), '-ac', '1', wav])
    if os.path.getsize(wav) < 400:
        raise Fail(f'segment {h} came out empty after trimming')
    return wav


def silence(path, sec):
    run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', f'anullsrc=r={SAMPLE_RATE}:cl=mono', '-t', str(sec), path])


def loudnorm_filter(joined):
    """Two-pass loudnorm (a single pass misbehaves on clips shorter than a few seconds). Falls back to a plain encode."""
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', joined, '-af', f'loudnorm={LOUDNESS}:print_format=json', '-f', 'null', '-'],
                       capture_output=True, text=True)
    m = re.search(r'\{[^{}]*"input_i"[^{}]*\}', r.stderr, re.S)
    if r.returncode == 0 and m:
        try:
            d = json.loads(m.group(0))
            vals = {k: float(d[k]) for k in ('input_i', 'input_tp', 'input_lra', 'input_thresh', 'target_offset')}
            if all(math.isfinite(v) for v in vals.values()):
                return (f'loudnorm={LOUDNESS}:measured_I={vals["input_i"]}:measured_TP={vals["input_tp"]}:measured_LRA={vals["input_lra"]}'
                        f':measured_thresh={vals["input_thresh"]}:offset={vals["target_offset"]}:linear=true')
        except (ValueError, KeyError):
            pass
    return None


def assemble(job, wavs, tmp, out_path, gap_wav, tail_wav):
    parts = []
    for i, w in enumerate(wavs):
        if i:
            parts.append(gap_wav)
        parts.append(w)
    parts.append(tail_wav)
    lst = os.path.join(tmp, 'concat.txt')
    with open(lst, 'w') as f:
        f.write(''.join("file '%s'\n" % p.replace("'", "'\\''") for p in parts))
    joined = os.path.join(tmp, 'joined.wav')
    run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-c:a', 'pcm_s16le', joined])
    af = loudnorm_filter(joined)
    os.makedirs(os.path.dirname(out_path) or '.', exist_ok=True)
    part = out_path + '.part'
    cmd = ['ffmpeg', '-v', 'error', '-y', '-i', joined] + (['-af', af] if af else []) + \
          ['-ar', str(SAMPLE_RATE), '-ac', '1', '-c:a', 'libmp3lame', '-b:a', BITRATE, '-f', 'mp3', part]
    run(cmd)
    os.replace(part, out_path)


def duration(path):
    return float(run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path]).stdout)


def generate(jobs, out_dir, seg_dir):
    specs = {}
    for job in jobs:
        for s in job.segs:
            specs[seg_hash(s['voice'], s['text'])] = (s['voice'], s['text'])
    with tempfile.TemporaryDirectory() as tmp:
        print(f'synthesizing {len(specs)} distinct segments for {len(jobs)} clips ...', file=sys.stderr)
        asyncio.run(synth_all(specs, tmp))
        wavs = {h: to_wav(h, tmp) for h in specs}
        gap, tail = os.path.join(tmp, 'gap.wav'), os.path.join(tmp, 'tail.wav')
        silence(gap, GAP)
        silence(tail, TAIL)
        done = {}
        for job in jobs:
            out = os.path.join(out_dir, job.name)
            assemble(job, [wavs[seg_hash(s['voice'], s['text'])] for s in job.segs], tmp, out, gap, tail)
            done[job.name] = round(duration(out), 2)
            print(f'  {job.name}  {done[job.name]:.2f}s  {os.path.getsize(out) // 1024} KB', file=sys.stderr)
        if seg_dir:
            os.makedirs(seg_dir, exist_ok=True)
            manifest = {}
            for job in jobs:
                for s in job.segs:
                    h = seg_hash(s['voice'], s['text'])
                    m = manifest.setdefault(h, {'id': 'seg_' + h, 'text': s['text'], 'lang': s['lang'], 'voice': s['voice'][0], 'used_by': []})
                    if job.label not in m['used_by']:
                        m['used_by'].append(job.label)
            for h in manifest:
                shutil.copyfile(wavs[h], os.path.join(seg_dir, 'seg_' + h + '.wav'))
            with open(os.path.join(seg_dir, 'segments.json'), 'w', encoding='utf-8') as f:
                json.dump(list(manifest.values()), f, ensure_ascii=False, indent=1)
            print(f'kept {len(manifest)} segment wavs in {seg_dir}', file=sys.stderr)
    return done


# ---------------------------------------------------------------- main

def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0], formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--all', action='store_true', help='regenerate everything')
    ap.add_argument('--only', help='comma separated line keys / word_<id> / words')
    ap.add_argument('--sample', type=int, metavar='N', help='write N representative clips into <out>/sample/')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--segments', metavar='DIR', help='keep per-segment wavs + segments.json for asr_check.py')
    ap.add_argument('--lines', default=os.path.join(HERE, '..', 'src', 'content', 'lines.json'))
    ap.add_argument('--words', default=os.path.join(HERE, '..', 'src', 'content', 'words.json'))
    ap.add_argument('--out', default='game')
    a = ap.parse_args(argv)
    try:
        content = Content(a.lines, a.words)
        only = {k.strip() for k in a.only.split(',') if k.strip()} if a.only else None
        out_dir = os.path.join(a.out, 'sample') if a.sample else a.out
        jobs = plan(content, only, a.all, out_dir, a.sample)
        if a.dry_run:
            for j in jobs:
                print(j.name, '|', ' + '.join(f'{s["lang"]}:{s["text"]}' for s in j.segs))
            print(f'{len(jobs)} clips would be written to {out_dir}', file=sys.stderr)
            return 0
        if not a.sample:
            os.makedirs(a.out, exist_ok=True)
            with open(os.path.join(a.out, 'subs.json'), 'w', encoding='utf-8') as f:
                json.dump(subs_doc(content), f, ensure_ascii=False, separators=(',', ':'))
        if jobs:
            if not shutil.which('ffmpeg') or not shutil.which('ffprobe'):
                raise Fail('ffmpeg/ffprobe not found on PATH')
            os.makedirs(out_dir, exist_ok=True)
            generate(jobs, out_dir, a.segments)
        print(f'{len(jobs)} clips written to {out_dir}' if jobs else 'nothing to do, every clip exists', file=sys.stderr)
        return 0
    except Fail as e:
        print('error:', e, file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
