"""Multilingual voice check (copied from the opuscar-film skill, MIT, see art/LICENSE.lemo-opuscar; run by art/asr_check.py): transcribe each line and compare it with the script.

  "$LIB/.venv/bin/python" asr_check.py LINES.json VOICES_DIR [--lang auto|zh|en|ja|...] [--model small] [--max-err 0.1]

Why this exists: the library's core/tts/asr_check.py is English-only (base.en model, language
forced to en, normaliser keeps only a-z/0-9). On Chinese voice it hallucinates English or digits
and reports every line as DIFF, right or wrong, so it can't verify a Chinese film.
This script handles any language whisper knows:
  - CJK text is compared character by character, other text word by word (edit distance);
  - OK when the error rate is <= --max-err (default 0.1);
  - NEAR when a CJK line differs by exactly one swapped character. Whisper often writes a
    homophone (幕→目, 灯→登) for a line the TTS read correctly; read it, and if the swap is a
    homophone, the line is fine. NEAR does not fail the run;
  - DIFF otherwise: regenerate the line (tts_edge.py --only <id>);
  - lines.json keeps the library format: [{"id", "text", "asr"?}]. "asr" overrides the expected
    text, e.g. for names whisper spells differently.
Writes VOICES_DIR/words.json (per-line word timings, same shape as the library's) for subtitle
and lip-sync placement. Exit code 1 if any line is DIFF.
First run downloads the whisper model (small ≈ 460 MB) from Hugging Face.
"""
import argparse
import json
import os
import re
import sys

import librosa
import numpy as np
import soundfile as sf
from faster_whisper import WhisperModel

CJK = re.compile(r"[぀-ヿ㐀-䶿一-鿿가-힯]")
# nudges whisper toward Simplified Chinese instead of Traditional
PROMPTS = {"zh": "以下是普通话的句子，使用简体中文。"}


def tokens(s, cjk):
    s = s.lower().replace("'", "").replace("-", " ")
    if cjk:
        return list(re.sub(r"[\W_]", "", s))
    return re.sub(r"[^\w ]", " ", s).split()


def edit_distance(a, b):
    prev = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        cur = [i]
        for j, y in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x != y)))
        prev = cur
    return prev[-1]


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("lines")
    ap.add_argument("voices")
    ap.add_argument("--lang", default="auto", help="auto = zh if the line has CJK characters, else en")
    ap.add_argument("--model", default="small", help="faster-whisper model (multilingual: base, small, medium)")
    ap.add_argument("--max-err", type=float, default=0.1, help="max character/word error rate per line")
    args = ap.parse_args()

    model = WhisperModel(args.model, device="cpu", compute_type="int8")
    bad, words = 0, {}
    for line in json.load(open(args.lines, encoding="utf-8")):
        want = line.get("asr", line["text"])
        lang = args.lang if args.lang != "auto" else ("zh" if CJK.search(want) else "en")
        cjk = lang in ("zh", "ja", "ko") or bool(CJK.search(want))
        want_t = tokens(want, cjk)
        if not want_t:
            print("SKIP", line["id"], "| nothing to compare in the expected text")
            continue
        y, sr = sf.read(os.path.join(args.voices, line["id"] + ".wav"))
        if y.ndim > 1:
            y = y.mean(1)
        y = librosa.resample(y, orig_sr=sr, target_sr=16000)
        pad = np.zeros(int(0.6 * 16000))  # short lines are misheard without some air around them
        segs, _ = model.transcribe(np.concatenate([pad, y, pad]).astype(np.float32), beam_size=5,
                                   language=lang, word_timestamps=True, initial_prompt=PROMPTS.get(lang))
        segs = list(segs)
        got = "".join(s.text for s in segs).strip() if cjk else " ".join(s.text.strip() for s in segs)
        words[line["id"]] = [(w.word.strip(), round(w.start - 0.6, 3), round(w.end - 0.6, 3))
                             for s in segs for w in s.words]
        got_t = tokens(got, cjk)
        dist = edit_distance(want_t, got_t)
        err = dist / len(want_t)
        if err <= args.max_err:
            tag = "OK  "
        elif cjk and dist == 1 and len(got_t) == len(want_t):
            tag = "NEAR"  # one swapped character: almost always a whisper homophone (幕→目), not a TTS misread
        else:
            tag = "DIFF"
            bad += 1
        print(tag, line["id"], f"err={err:.2f}", "|", want, "→", got)
    with open(os.path.join(args.voices, "words.json"), "w", encoding="utf-8") as f:
        json.dump(words, f, ensure_ascii=False, indent=0)
    print("mismatches:", bad)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
