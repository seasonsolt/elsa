"""Voice the kids' edition with ElevenLabs (Anna) and edge-tts (Elsa): line clips, companion variants, word readings and subtitle text.

Run with a Python that has edge_tts (the user's lemo venv is fine for this; never install into it):
    ~/lemo-opuscar/.venv/bin/python art/narration.py [flags]
Needs ffmpeg on PATH (mp3 encoder libmp3lame). A voice named "elevenlabs:<voice id>" is rendered by the ElevenLabs API and needs
ELEVENLABS_API_KEY in the environment (keep the key in your shell profile, never in the repository).

Input   src/content/lines.json  {"voices": {...}, "lines": {key: {who, say:[segments], art?}}, "pages"?: {...}}
        src/content/words.json  [{id, en, zh, icon, room}]
Output  <out>/vo_<key>.mp3                 frost / nuan lines
        <out>/vo_<key>__frost.mp3          legacy "companion" lines are rendered once per sister; the view always plays Anna's (__nuan)
        <out>/vo_<key>__nuan.mp3
        <out>/vo_<key>[__who]__w.mp3       only for lines with {"en": ...} segments: the "english = words only" variant,
                                           where each {"en","zh"} phrase becomes its zh gloss (skipped without a gloss)
        <out>/word_<id>.mp3                one word, Anna's en voice, slow
        <out>/subs.json                    subtitle text (English marked) plus the word table, see below
<out> defaults to ./game (relative to the current directory, like the old script).

Voices: lines.json "voices" maps speaker -> {"zh": entry, "en": entry}. An edge-tts entry is [voice, rate, pitch]; an ElevenLabs entry
is ["elevenlabs:<voice id>", speed as a rate ("-15%" = 0.85), model id]. An ElevenLabs speaker has one voice for both languages.

Segments (PLAN A4): a string is spoken with the speaker's zh voice, {"w": id} with the speaker's en voice (word text from
words.json), {"en": "Yay!"} with the en voice. With edge-tts every segment is its own request, English 15 % slower than the
voice's own en rate, and the segments are trimmed and joined with a 0.12 s gap. An ElevenLabs speaker reads the whole line in
one request at the zh entry's speed (one voice, unbroken intonation); its en entry sets the speed of the word readings.
Clips are loudness-normalised and encoded as 48 kbps mono mp3.

Flags
    (none)              only clips whose file is missing or whose recipe changed since the manifest was written (see below)
    --all               regenerate everything
    --only a,b,word_x   only these line keys / word_<id> ("words" = every word reading)
    --sample N          write N representative clips (mixed zh/en lines of every speaker first) into <out>/sample/, always
                        regenerated, no subs.json: for listening before the batch run
    --dry-run           print what would be generated as "name | reason | segments" (reason: missing, changed, unrecorded, forced),
                        no network, no ffmpeg
    --segments DIR      also keep every distinct synthesized segment as DIR/<id>.wav plus DIR/segments.json, for art/asr_check.py
                        (a whole ElevenLabs line is one segment, lang "mix" when it holds both languages)
    --prune             delete the .mp3 files directly in <out> that plan() does not expect any more (the clips of removed or renamed
                        lines, old speaker variants); every other file and sub-directory is left alone. With --dry-run only list them.
                        Never synthesizes. A normal run afterwards rewrites subs.json (and says if a clip is missing)
    --write-manifest    record the manifest for the clips now in <out> WITHOUT synthesizing anything: use it once when the audio is known to
                        match the text (a clip whose file is missing is not recorded). Do not combine with --sample/--only/--all/--prune/--dry-run
    --verify-manifest   check that the manifest and lines.json/words.json agree (no clip stale, unrecorded or without a line); lists the
                        differences as "name | kind" and exits 1, or 0 when they agree. test/content_keys.mjs runs it
    --manifest PATH     the manifest file (default <out>/vo_manifest.json)
    --lines/--words/--out PATH   override the default locations (used by tests)

vo_manifest.json (PLAN-2 B3): {"v": 1, "clips": {"vo_p1.mp3": sha1, ...}}. The hash covers what decides how a clip sounds: for every spoken
segment, in order, the voice, the effective rate, the pitch and the text (punctuation-only segments have no voice and are not part of it).
A normal run regenerates a clip when its file is missing or its hash differs from the manifest (an unlisted clip counts as "unrecorded"
and is regenerated too), then records the new hashes. Changing one line's text therefore redoes exactly the clips of that line.

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
SPEAKERS = ('frost', 'nuan')
EL_PREFIX = 'elevenlabs:'
EL_API = 'https://api.elevenlabs.io'
EL_SPEED = (0.7, 1.2)   # what the API accepts for voice_settings.speed
ANNA_EL = EL_PREFIX + 'BT0SH7Hb8NRPpT5xbCgg'   # ElevenLabs voice library "Lulu - Cute Little Witch": a playful Mandarin girl, one voice for zh and en
# Used when lines.json carries no "voices" block; mirrors lines.json.
DEFAULT_VOICES = {
    'frost': {'zh': ['zh-CN-XiaoxiaoNeural', '-6%', '-4Hz']},   # Elsa speaks Chinese only
    'nuan': {'zh': [ANNA_EL, '+0%', 'eleven_v4'], 'en': [ANNA_EL, '-15%', 'eleven_v4']},
}
MANIFEST_NAME = 'vo_manifest.json'
PUNCT_ONLY = re.compile(r'^[\W_]*$', re.UNICODE)   # nothing a voice could say
CJK_PUNCT = '，。！？、；：～…）」』'


class Fail(Exception):
    pass


# ---------------------------------------------------------------- data model

def slower(rate, pct=EN_SLOWER):
    """'-20%' made another 15 % slower -> '-32%' (speed factors multiply)."""
    m = re.fullmatch(r'([+-]?\d+)%', rate.strip())
    if not m:
        raise Fail(f'unsupported rate {rate!r}, expected something like "-20%"')
    return '%+d%%' % round(((1 + int(m.group(1)) / 100) * (1 - pct / 100) - 1) * 100)


def is_el(voice_name):
    return voice_name.startswith(EL_PREFIX)


def rate_factor(rate):
    """'-15%' -> 0.85"""
    m = re.fullmatch(r'([+-]?\d+)%', rate.strip())
    if not m:
        raise Fail(f'unsupported rate {rate!r}, expected something like "-15%"')
    return round(1 + int(m.group(1)) / 100, 4)


def join_spoken(parts):
    """Segment texts -> one sentence: a space where Latin text meets other text ("跟着 star 的光"), none next to CJK punctuation."""
    out = ''
    for p in (p.strip() for p in parts):
        if out and p and p[0] not in CJK_PUNCT and out[-1] not in CJK_PUNCT and ((out[-1].isascii() and not out[-1].isspace()) or (p[0].isascii() and p[0].isalnum())):
            out += ' '
        out += p
    return out


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
            for lang in ('zh', 'en') if who == 'nuan' else ('zh',):   # Elsa has no English voice: she speaks Chinese only
                v = self.voices.get(who, {}).get(lang)
                if not (isinstance(v, list) and len(v) == 3):
                    raise Fail(f'voices.{who}.{lang} must be [voice, rate, pitch] (edge-tts) or ["elevenlabs:<id>", rate, model]')
                if is_el(v[0]):
                    if not (EL_SPEED[0] <= rate_factor(v[1]) <= EL_SPEED[1]) or not str(v[2]).startswith('eleven_'):
                        raise Fail(f'voices.{who}.{lang}: an ElevenLabs entry is ["elevenlabs:<id>", rate within {EL_SPEED}, "eleven_<model>"]')
            zh, en = self.voices[who]['zh'], self.voices[who].get('en')
            if is_el(zh[0]) and en and (en[0], en[2]) != (zh[0], zh[2]):
                raise Fail(f'voices.{who}: an ElevenLabs speaker reads whole mixed sentences, so zh and en must name the same voice and model')
        if self.voices['nuan']['zh'][0] == self.voices['frost']['zh'][0]:
            raise Fail('Anna and Elsa must not share a Chinese voice: a child tells the sisters apart by ear')
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
            raise Fail(f'line {key}: who must be frost|nuan|companion, got {line.get("who")!r}')
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
        if line['who'] != 'nuan' and any(isinstance(seg, dict) for seg in line['say']):
            raise Fail(f'line {key}: Elsa speaks Chinese only, English segments belong to nuan')

    def voice(self, who, lang):
        v = self.voices[who][lang]
        return (v[0], v[1] if lang == 'zh' or is_el(v[0]) else slower(v[1]), v[2])   # an ElevenLabs en entry carries its own speed

    def spoken(self, key, who, words_only=False):
        """-> the segments to synthesize for one clip. An ElevenLabs speaker reads the whole line in one request: the model speaks
        both languages in one voice and a whole sentence keeps its intonation. edge-tts voices get one request per segment."""
        segs = self.segments(key, who, words_only)
        if not is_el(self.voices[who]['zh'][0]) or not any(s['voice'] for s in segs):
            return segs
        langs = {s['lang'] for s in segs if s['voice']}
        lang = langs.pop() if len(langs) == 1 else 'mix'
        return [{'text': join_spoken(s['text'] for s in segs), 'lang': lang, 'en': lang == 'en', 'voice': self.voice(who, 'zh')}]

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


def clip_hash(segs):
    """sha1 of what decides how one clip sounds: voice, effective rate, pitch and text of every spoken segment, in order."""
    spoken = [[*s['voice'], s['text']] for s in segs if s['voice']]
    return hashlib.sha1(json.dumps(spoken, ensure_ascii=False, separators=(',', ':')).encode('utf-8')).hexdigest()


class Job:
    """One mp3 to write: a list of segments (dicts with 'voice' possibly None). `reason` says why plan() picked it."""
    def __init__(self, name, segs, label, reason=''):
        self.name, self.segs, self.label, self.reason = name, [s for s in segs if s['voice']], label, reason

    @property
    def hash(self):
        return clip_hash(self.segs)


def plan(content, only, redo, out_dir, sample, manifest=None):
    """-> [Job]. Without --all/--only a clip is picked when its file is missing or, given a manifest ({file name: hash}), when its
    recorded hash differs ('changed') or is absent ('unrecorded'). manifest=None skips the hash check."""
    jobs = []
    if sample:
        return [Job(name, segs, label) for name, segs, label in sample_items(content, sample)]
    if only is not None:
        known = set(content.lines) | {f'word_{i}' for i in content.words} | {'words'}
        bad = sorted(only - known)
        if bad:
            raise Fail('--only: unknown key(s): ' + ', '.join(bad))

    def why(fname, segs):
        if redo or only is not None:
            return 'forced'
        if not os.path.exists(os.path.join(out_dir, fname)):
            return 'missing'
        if manifest is not None and manifest.get(fname) != clip_hash(segs):
            return 'changed' if fname in manifest else 'unrecorded'
        return ''

    want_words = only is None or 'words' in only or any(o.startswith('word_') for o in only)
    for key in content.lines:
        if only is not None and key not in only:
            continue
        for fname, sp, wo in content.outputs(key):
            segs = content.spoken(key, sp, wo)
            reason = why(fname, segs)
            if reason and any(s['voice'] for s in segs):
                jobs.append(Job(fname, segs, key, reason))
    if want_words:
        for wid, w in content.words.items():
            if only is not None and 'words' not in only and f'word_{wid}' not in only:
                continue
            fname = f'word_{wid}.mp3'
            segs = [{'text': w['en'], 'lang': 'en', 'en': True, 'voice': content.voice('nuan', 'en')}]
            reason = why(fname, segs)
            if reason:
                jobs.append(Job(fname, segs, f'word_{wid}', reason))
    return jobs


def expected_clips(content):
    """-> set of mp3 file names a full run of plan() writes: the complete set <out> should hold, no more and no less."""
    return {j.name for j in plan(content, None, True, '', None)}


def find_orphans(content, out_dir):
    """-> (orphans, missing): mp3 files in out_dir that plan() does not expect, and expected ones that are not there."""
    if not content.lines:
        raise Fail('lines.json has no lines (wrong --lines file?): refusing to call every mp3 an orphan')
    expected = expected_clips(content)
    try:
        present = {f for f in os.listdir(out_dir) if f.endswith('.mp3') and os.path.isfile(os.path.join(out_dir, f))}
    except OSError as e:
        raise Fail(f'cannot list {out_dir}: {e}')
    return sorted(present - expected), sorted(expected - present)


def current_hashes(content):
    """-> {file name: hash} for every clip a full run writes."""
    return {j.name: j.hash for j in plan(content, None, True, '', None)}


def load_manifest(path):
    """-> {file name: hash}, or None when there is no manifest file."""
    if not os.path.exists(path):
        return None
    doc = load_json(path, 'manifest')
    if not (isinstance(doc, dict) and doc.get('v') == 1 and isinstance(doc.get('clips'), dict)):
        raise Fail(f'{path} is not a v1 voice manifest ({{"v": 1, "clips": {{...}}}})')
    return doc['clips']


def write_manifest(path, clips):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    tmp = path + '.part'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump({'v': 1, 'clips': dict(sorted(clips.items()))}, f, indent=1, ensure_ascii=False)
        f.write('\n')
    os.replace(tmp, path)


def manifest_problems(content, manifest):
    """-> [(file name, kind)]: where the manifest and the content disagree. kind is 'stale' (the recipe changed since it was
    recorded), 'unrecorded' (a clip the content needs is not listed) or 'extra' (listed, but no line or word needs it)."""
    if not content.lines:
        raise Fail('lines.json has no lines (wrong --lines file?): refusing to compare it with the manifest')
    cur = current_hashes(content)
    out = [(n, 'stale') for n in cur if n in manifest and manifest[n] != cur[n]]
    out += [(n, 'unrecorded') for n in cur if n not in manifest]
    out += [(n, 'extra') for n in manifest if n not in cur]
    return sorted(out)


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
        items.append((fname, content.spoken(key, sp, wo), key))
    for wid in list(content.words)[:min(2, n)]:
        items.append((f'word_{wid}.mp3', [{'text': content.words[wid]['en'], 'lang': 'en', 'en': True, 'voice': content.voice('nuan', 'en')}], f'word_{wid}'))
    return items


# ---------------------------------------------------------------- synthesis

def run(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode != 0:
        raise Fail(f'{cmd[0]} failed: {r.stderr.strip()[-400:]}')
    return r


def synth_all(specs, tmp):
    """specs: {hash: (voice, text)} -> writes tmp/<hash>.raw.mp3, each through the service its voice names."""
    el = {h: vt for h, vt in specs.items() if is_el(vt[0][0])}
    if el:
        synth_elevenlabs(el, tmp)
    edge = {h: vt for h, vt in specs.items() if h not in el}
    if edge:
        asyncio.run(synth_edge(edge, tmp))


def synth_elevenlabs(specs, tmp):
    """ElevenLabs text-to-speech, 3 requests at a time, 4 tries each (429, 5xx and network errors back off). The key is read from ELEVENLABS_API_KEY."""
    import http.client
    import time
    import urllib.error
    import urllib.request
    from concurrent.futures import ThreadPoolExecutor
    key = os.environ.get('ELEVENLABS_API_KEY')
    if not key:
        raise Fail('ELEVENLABS_API_KEY is not set: lines.json names an ElevenLabs voice')

    def one(h, voice, text):
        body = {'text': text, 'model_id': voice[2]}
        if rate_factor(voice[1]) != 1:
            body['voice_settings'] = {'speed': rate_factor(voice[1])}
        url = f'{EL_API}/v1/text-to-speech/{voice[0][len(EL_PREFIX):]}?output_format=mp3_44100_128'
        err = ''
        for attempt in range(4):
            req = urllib.request.Request(url, data=json.dumps(body).encode('utf-8'),
                                         headers={'xi-api-key': key, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg'})
            try:
                with urllib.request.urlopen(req, timeout=120) as r:
                    data = r.read()
                if data:
                    with open(os.path.join(tmp, h + '.raw.mp3'), 'wb') as f:
                        f.write(data)
                    return
                err = 'no audio'
            except urllib.error.HTTPError as e:
                err = f'HTTP {e.code}: {e.read()[:300].decode("utf-8", "replace")}'
                if e.code not in (429, 500, 502, 503, 504):
                    break
            except (urllib.error.URLError, http.client.HTTPException, OSError) as e:   # incl. a dropped connection mid-body
                err = f'{type(e).__name__}: {e}'
            time.sleep(2 * (attempt + 1))
        raise Fail(f'ElevenLabs failed for {text!r}: {err}')

    with ThreadPoolExecutor(3) as ex:
        for fut in [ex.submit(one, h, v, t) for h, (v, t) in specs.items()]:
            fut.result()


async def synth_edge(specs, tmp):
    """edge-tts, 4 at a time, 3 tries each."""
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
    # -60 dB and 60 ms of kept lead/tail: a child voice starts and ends words softly, and a tighter cut turned "two" into "chew"
    # and "up" into "ah" (2026-11-10 ASR check)
    edge = 'silenceremove=start_periods=1:start_threshold=-60dB:start_silence=0.06'
    trim = f'{edge},areverse,{edge},areverse'
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


def generate(jobs, out_dir, seg_dir, record=None):
    specs = {}
    for job in jobs:
        for s in job.segs:
            specs[seg_hash(s['voice'], s['text'])] = (s['voice'], s['text'])
    with tempfile.TemporaryDirectory() as tmp:
        print(f'synthesizing {len(specs)} distinct segments for {len(jobs)} clips ...', file=sys.stderr)
        synth_all(specs, tmp)
        wavs = {h: to_wav(h, tmp) for h in specs}
        gap, tail = os.path.join(tmp, 'gap.wav'), os.path.join(tmp, 'tail.wav')
        silence(gap, GAP)
        silence(tail, TAIL)
        done = {}
        for job in jobs:
            out = os.path.join(out_dir, job.name)
            assemble(job, [wavs[seg_hash(s['voice'], s['text'])] for s in job.segs], tmp, out, gap, tail)
            done[job.name] = round(duration(out), 2)
            if record is not None:
                record[job.name] = job.hash
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
    ap.add_argument('--prune', action='store_true', help='delete the mp3 files in <out> that plan() does not expect (--dry-run: list them)')
    ap.add_argument('--write-manifest', action='store_true', help='record the manifest for the clips now in <out>, no synthesis')
    ap.add_argument('--verify-manifest', action='store_true', help='fail when the manifest and lines.json disagree')
    ap.add_argument('--manifest', metavar='PATH', help='manifest file (default <out>/vo_manifest.json)')
    ap.add_argument('--segments', metavar='DIR', help='keep per-segment wavs + segments.json for asr_check.py')
    ap.add_argument('--lines', default=os.path.join(HERE, '..', 'src', 'content', 'lines.json'))
    ap.add_argument('--words', default=os.path.join(HERE, '..', 'src', 'content', 'words.json'))
    ap.add_argument('--out', default='game')
    a = ap.parse_args(argv)
    try:
        content = Content(a.lines, a.words)
        only = {k.strip() for k in a.only.split(',') if k.strip()} if a.only else None
        out_dir = os.path.join(a.out, 'sample') if a.sample else a.out
        manifest_path = a.manifest or os.path.join(a.out, MANIFEST_NAME)
        if a.write_manifest or a.verify_manifest:
            if a.write_manifest and a.verify_manifest:
                raise Fail('--write-manifest and --verify-manifest are separate modes')
            if a.sample or only is not None or a.all or a.prune or (a.dry_run and a.write_manifest):
                raise Fail('--write-manifest / --verify-manifest work on the whole output directory: do not combine them with --sample / --only / --all / --prune / --dry-run')
            if a.write_manifest:
                cur = current_hashes(content)
                absent = sorted(n for n in cur if not os.path.isfile(os.path.join(a.out, n)))
                write_manifest(manifest_path, {n: h for n, h in cur.items() if n not in absent})
                if absent:
                    print(f'warning: {len(absent)} expected clip(s) have no file in {a.out} and are not recorded (a normal run generates them)', file=sys.stderr)
                print(f'recorded {len(cur) - len(absent)} clip(s) in {manifest_path}', file=sys.stderr)
                return 0
            manifest = load_manifest(manifest_path)
            if manifest is None:
                raise Fail(f'no voice manifest at {manifest_path} (run --write-manifest once the audio matches the text)')
            problems = manifest_problems(content, manifest)
            for name, kind in problems:
                print(name, '|', kind)
            print(f'{len(problems)} difference(s) between {manifest_path} and the content', file=sys.stderr)
            return 1 if problems else 0
        if a.prune:
            if a.sample or only is not None or a.all:
                raise Fail('--prune works on the whole output directory: do not combine it with --sample / --only / --all')
            orphans, missing = find_orphans(content, a.out)
            size = 0
            for f in orphans:
                size += os.path.getsize(os.path.join(a.out, f))
                print(f)
            if missing:
                print(f'warning: {len(missing)} expected clip(s) are missing from {a.out} (run without --prune to generate them)', file=sys.stderr)
            if not a.dry_run:
                for f in orphans:
                    os.remove(os.path.join(a.out, f))
            print(f'{len(orphans)} orphan mp3 file(s), {size / 1048576:.2f} MB, {"would be " if a.dry_run else ""}deleted from {a.out}', file=sys.stderr)
            return 0
        manifest = None
        if not a.sample:
            manifest = load_manifest(manifest_path)
            if manifest is None:
                manifest = {}
                print(f'note: no voice manifest at {manifest_path}: every existing clip counts as unrecorded '
                      '(--write-manifest records the current files without synthesizing)', file=sys.stderr)
        jobs = plan(content, only, a.all, out_dir, a.sample, manifest)
        if a.dry_run:
            for j in jobs:
                print(j.name, '|', j.reason or 'sample', '|', ' + '.join(f'{s["lang"]}:{s["text"]}' for s in j.segs))
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
            record = {}
            try:
                generate(jobs, out_dir, a.segments, record)
            finally:
                if record and not a.sample:   # clips already written stay recorded even when a later one fails
                    wanted = current_hashes(content)
                    write_manifest(manifest_path, {n: h for n, h in {**manifest, **record}.items() if n in wanted})
        print(f'{len(jobs)} clips written to {out_dir}' if jobs else 'nothing to do, every clip exists', file=sys.stderr)
        return 0
    except Fail as e:
        print('error:', e, file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
