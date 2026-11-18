/* Voice manifest (PLAN-2 B3): game/vo_manifest.json = sha1(voice, rate, pitch, texts) per clip, used by art/narration.py to redo only what
   changed, and checked against lines.json by test/content_keys.mjs. Nothing here calls the network or ffmpeg; every test works in a temp
   folder with stand-in mp3 files and copies of lines.json, the real content files are only read. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkVoiceManifest, checkAudioFiles } from '../content_keys.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LINES = path.join(ROOT, 'src/content/lines.json');
const narration = args => spawnSync('python3', [path.join(ROOT, 'art/narration.py'), ...args], { cwd: ROOT, encoding: 'utf8' });
const narration2 = (args, env) => spawnSync('python3', [path.join(ROOT, 'art/narration.py'), ...args], { cwd: ROOT, encoding: 'utf8', env });
const rows = r => r.stdout.split('\n').filter(Boolean).map(l => l.split(' | '));
const names = r => rows(r).map(x => x[0]);

/* a temp out folder holding a stand-in file for every clip the content needs, with the manifest recorded for them */
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-manifest-test-'));
  const all = names(narration(['--all', '--dry-run', '--out', dir]));
  for (const n of all) fs.writeFileSync(path.join(dir, n), 'x');
  const w = narration(['--write-manifest', '--out', dir]);
  if (w.status !== 0) throw new Error('--write-manifest failed: ' + w.stderr);
  return { dir, all, manifestPath: path.join(dir, 'vo_manifest.json'), cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

/* a copy of lines.json with `edit(doc)` applied, written next to the fixture */
function editedLines(dir, edit) {
  const doc = JSON.parse(fs.readFileSync(LINES, 'utf8'));
  edit(doc);
  const p = path.join(dir, 'lines.edited.json');
  fs.writeFileSync(p, JSON.stringify(doc));
  return p;
}

/* a line that renders to exactly one mp3: spoken by one sister, plain Chinese text only */
function oneClipLine(doc) {
  const key = Object.keys(doc.lines).find(k => doc.lines[k].who === 'frost' && doc.lines[k].say.every(s => typeof s === 'string' && /[一-鿿]/.test(s)));
  if (!key) throw new Error('no plain frost line to edit');
  return key;
}

export function writeManifestRecordsTheCurrentFilesWithoutSynthesizing({ assert }) {
  const fx = fixture();
  try {
    const doc = JSON.parse(fs.readFileSync(fx.manifestPath, 'utf8'));
    assert.equal(doc.v, 1);
    assert.deepEqual(Object.keys(doc.clips), [...fx.all].sort(), 'one entry per expected clip, sorted');
    assert.ok(Object.values(doc.clips).every(h => /^[0-9a-f]{40}$/.test(h)), 'sha1 hex');
    assert.equal(Object.keys(doc.clips).length, narration(['--all', '--dry-run', '--out', fx.dir]).stdout.split('\n').filter(Boolean).length);

    fs.rmSync(path.join(fx.dir, 'vo_p1.mp3'));
    const again = narration(['--write-manifest', '--out', fx.dir]);
    assert.equal(again.status, 0, again.stderr);
    assert.match(again.stderr, /1 expected clip\(s\) have no file/);
    assert.ok(!('vo_p1.mp3' in JSON.parse(fs.readFileSync(fx.manifestPath, 'utf8')).clips), 'a clip without a file is not recorded');

    for (const extra of [['--sample', '2'], ['--only', 'p1'], ['--all'], ['--prune'], ['--dry-run'], ['--verify-manifest']]) {
      const r = narration(['--write-manifest', ...extra, '--out', fx.dir]);
      assert.equal(r.status, 2, extra.join(' '));
    }
  } finally { fx.cleanup(); }
}

export function dryRunListsNothingWhenNothingChangedAndExactlyTheEditedClipAfterOneTextEdit({ assert }) {
  const fx = fixture();
  try {
    const none = narration(['--dry-run', '--out', fx.dir]);
    assert.equal(none.status, 0, none.stderr);
    assert.deepEqual(names(none), [], 'no content change: 0 clips');
    assert.match(none.stderr, /^0 clips would be written/m);

    const key = oneClipLine(JSON.parse(fs.readFileSync(LINES, 'utf8')));
    const lines = editedLines(fx.dir, d => { d.lines[key].say[0] += '呀'; });
    const one = narration(['--dry-run', '--lines', lines, '--out', fx.dir]);
    assert.equal(one.status, 0, one.stderr);
    assert.deepEqual(rows(one).map(r => r.slice(0, 2)), [[`vo_${key}.mp3`, 'changed']], 'one edited line: exactly its clip');
    assert.match(one.stderr, /^1 clips would be written/m);

    /* editing it back (same bytes as the real file) is a zero again */
    assert.deepEqual(names(narration(['--dry-run', '--lines', LINES, '--out', fx.dir])), []);
  } finally { fx.cleanup(); }
}

export function companionAndWordsOnlyVariantsAreHashedPerOutputFile({ assert }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-manifest-test-'));
  try {
    const write = (name, d) => { const p = path.join(dir, name); fs.writeFileSync(p, JSON.stringify(d)); return p; };
    const mk = (c, en, zh) => ({ lines: { c: { who: 'companion', say: [c] }, n: { who: 'nuan', say: ['好', { en, zh }] } } });
    const words = write('words.json', [{ id: 'ice', en: 'ice', zh: '冰', icon: 'ice', room: 'x' }]);
    const base = write('base.json', mk('你好', 'Yay!', '耶'));
    const args = lines => ['--lines', lines, '--words', words, '--out', dir];
    const all = names(narration(['--all', '--dry-run', ...args(base)]));
    assert.deepEqual(all.sort(), ['vo_c__frost.mp3', 'vo_c__nuan.mp3', 'vo_n.mp3', 'vo_n__w.mp3', 'word_ice.mp3']);
    for (const n of all) fs.writeFileSync(path.join(dir, n), 'x');
    assert.equal(narration(['--write-manifest', ...args(base)]).status, 0);
    const listed = lines => names(narration(['--dry-run', ...args(write('e.json', lines))]));
    assert.deepEqual(listed(mk('你好', 'Yay!', '耶')), []);
    assert.deepEqual(listed(mk('你好呀', 'Yay!', '耶')), ['vo_c__frost.mp3', 'vo_c__nuan.mp3'], 'both sisters speak a companion line');
    assert.deepEqual(listed(mk('你好', 'Yay yay!', '耶')), ['vo_n.mp3'], 'the English text is not in the words-only variant');
    assert.deepEqual(listed(mk('你好', 'Yay!', '耶耶')), ['vo_n__w.mp3'], 'the gloss is not in the full variant');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

export function voiceRatePitchAndPunctuationDecideTheHash({ assert }) {
  const fx = fixture();
  try {
    /* Anna's English rate changes: only clips with English segments are redone */
    const slow = editedLines(fx.dir, d => { d.voices.nuan.en[1] = '-9%'; });
    const r = narration(['--dry-run', '--lines', slow, '--out', fx.dir]);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(rows(r).length > 0, 'an en rate change redoes something');
    assert.ok(rows(r).every(x => x[1] === 'changed' && /\ben:/.test(x[2])), 'only clips with English segments: ' + rows(r).filter(x => !/\ben:/.test(x[2])).map(x => x[0]).join(','));
    /* Elsa's rate/model changes: every Elsa clip and no Anna clip */
    const pitch = editedLines(fx.dir, d => {
      if (String(d.voices.frost.zh[0]).startsWith('elevenlabs:')) d.voices.frost.zh[1] = '-9%';
      else d.voices.frost.zh[2] = '-9Hz';
    });
    const p = rows(narration(['--dry-run', '--lines', pitch, '--out', fx.dir]));
    assert.ok(p.length > 0 && p.every(x => x[2].startsWith('zh:') || x[2].includes('zh:')), 'Elsa pitch redoes Chinese clips');
    assert.ok(p.every(x => !x[0].includes('__nuan') && !x[0].startsWith('word_')), 'never an Anna-only clip');
    /* a punctuation-only segment has no voice, so it cannot change how the clip sounds */
    const key = oneClipLine(JSON.parse(fs.readFileSync(LINES, 'utf8')));
    const dots = editedLines(fx.dir, d => { d.lines[key].say.push('…'); });
    assert.deepEqual(names(narration(['--dry-run', '--lines', dots, '--out', fx.dir])), []);
  } finally { fx.cleanup(); }
}

export function aMissingFileAndAnUnlistedClipAreRedoneWithTheirReason({ assert }) {
  const fx = fixture();
  try {
    fs.rmSync(path.join(fx.dir, 'vo_p1.mp3'));
    const doc = JSON.parse(fs.readFileSync(fx.manifestPath, 'utf8'));
    delete doc.clips['vo_p2.mp3'];
    fs.writeFileSync(fx.manifestPath, JSON.stringify(doc));
    assert.deepEqual(rows(narration(['--dry-run', '--out', fx.dir])).map(r => r.slice(0, 2)), [['vo_p1.mp3', 'missing'], ['vo_p2.mp3', 'unrecorded']]);
    const fileProblems = checkAudioFiles(fx.dir);
    assert.equal(fileProblems.length, 1, fileProblems.join('\n'));
    assert.match(fileProblems[0], /vo_p1\.mp3 is missing/, 'content_keys: only the missing file is a file problem, not the unlisted one');
    assert.deepEqual(names(narration(['--all', '--dry-run', '--only', 'p1', '--out', fx.dir])), ['vo_p1.mp3'], '--only still forces');
    assert.equal(rows(narration(['--only', 'p1', '--dry-run', '--out', fx.dir]))[0][1], 'forced');

    fs.rmSync(fx.manifestPath);
    const bare = narration(['--dry-run', '--out', fx.dir]);
    assert.equal(bare.status, 0, bare.stderr);
    assert.match(bare.stderr, /no voice manifest/);
    assert.equal(rows(bare).length, fx.all.length, 'without a manifest nothing is known to be current: every clip is redone');
  } finally { fx.cleanup(); }
}

export function verifyManifestFailsWhenTheManifestAndLinesDisagree({ assert }) {
  const fx = fixture();
  try {
    const ok = narration(['--verify-manifest', '--out', fx.dir]);
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.deepEqual(checkVoiceManifest(fx.dir), [], 'in agreement: no problem');

    const key = oneClipLine(JSON.parse(fs.readFileSync(LINES, 'utf8')));
    const edited = editedLines(fx.dir, d => { d.lines[key].say[0] += '呀'; });
    const stale = narration(['--verify-manifest', '--lines', edited, '--out', fx.dir]);
    assert.equal(stale.status, 1);
    assert.deepEqual(rows(stale), [[`vo_${key}.mp3`, 'stale']]);

    const gone = editedLines(fx.dir, d => { delete d.lines[key]; });
    assert.deepEqual(rows(narration(['--verify-manifest', '--lines', gone, '--out', fx.dir])), [[`vo_${key}.mp3`, 'extra']]);

    /* the same through test/content_keys.mjs, with the real lines.json and a doctored manifest */
    const doc = JSON.parse(fs.readFileSync(fx.manifestPath, 'utf8'));
    doc.clips[`vo_${key}.mp3`] = '0'.repeat(40);
    delete doc.clips['vo_p2.mp3'];
    doc.clips['vo_gone.mp3'] = '1'.repeat(40);
    fs.writeFileSync(fx.manifestPath, JSON.stringify(doc));
    const problems = checkVoiceManifest(fx.dir);
    assert.equal(problems.length, 3, problems.join('\n'));
    assert.ok(problems.some(p => p.includes(`vo_${key}.mp3`) && /changed/.test(p)));
    assert.ok(problems.some(p => p.includes('vo_p2.mp3') && /does not list/.test(p)));
    assert.ok(problems.some(p => p.includes('vo_gone.mp3') && /no line or word needs/.test(p)));

    fs.rmSync(fx.manifestPath);
    const none = checkVoiceManifest(fx.dir);
    assert.equal(none.length, 1);
    assert.match(none[0], /no voice manifest/);
  } finally { fx.cleanup(); }
}

/* Stand-ins for edge-tts, ffmpeg and ffprobe so a real (non-dry) run can be exercised without the network or the encoder:
   edge_tts.Communicate.save writes a few bytes, the fake ffmpeg writes its last argument (an output file) unless that is "-", the fake
   ffprobe prints a duration. */
function fakeToolchain(dir) {
  const bin = path.join(dir, 'fakebin'), py = path.join(dir, 'fakepy');
  fs.mkdirSync(bin); fs.mkdirSync(py);
  fs.writeFileSync(path.join(py, 'edge_tts.py'), [
    'class Communicate:',
    '    def __init__(self, text, voice, rate=None, pitch=None): self.text = text',
    '    async def save(self, path):',
    '        open(path, "wb").write(b"RAW" * 50)',
    ''].join('\n'));
  fs.writeFileSync(path.join(bin, 'ffmpeg'), '#!/bin/sh\nfor last; do :; done\n[ "$last" = "-" ] || head -c 600 /dev/zero | tr "\\0" "M" > "$last"\n');
  fs.writeFileSync(path.join(bin, 'ffprobe'), '#!/bin/sh\necho 1.5\n');
  fs.chmodSync(path.join(bin, 'ffmpeg'), 0o755); fs.chmodSync(path.join(bin, 'ffprobe'), 0o755);
  return { ...process.env, PATH: bin + path.delimiter + process.env.PATH, PYTHONPATH: py };
}

export function aRealRunRedoesOnlyTheEditedClipAndRecordsIt({ assert }) {
  const fx = fixture();
  try {
    const env = fakeToolchain(fx.dir);
    const key = oneClipLine(JSON.parse(fs.readFileSync(LINES, 'utf8')));
    const lines = editedLines(fx.dir, d => { d.lines[key].say[0] += '呀'; });
    const doc = JSON.parse(fs.readFileSync(fx.manifestPath, 'utf8'));
    const before = doc.clips[`vo_${key}.mp3`];
    doc.clips['vo_gone.mp3'] = '1'.repeat(40);
    fs.writeFileSync(fx.manifestPath, JSON.stringify(doc));

    const run = narration2(['--lines', lines, '--out', fx.dir], env);
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stderr, /1 clips written/);
    const after = JSON.parse(fs.readFileSync(fx.manifestPath, 'utf8')).clips;
    assert.notEqual(after[`vo_${key}.mp3`], before, 'the new recipe is recorded');
    assert.ok(!('vo_gone.mp3' in after), 'entries nobody needs are dropped');
    assert.equal(Object.keys(after).length, fx.all.length);
    const touched = fx.all.filter(n => fs.readFileSync(path.join(fx.dir, n), 'utf8') !== 'x');
    assert.deepEqual(touched, [`vo_${key}.mp3`], 'every other clip file is left alone');

    assert.deepEqual(names(narration(['--dry-run', '--lines', lines, '--out', fx.dir])), [], 'redone: nothing left to do');
    assert.equal(narration(['--verify-manifest', '--lines', lines, '--out', fx.dir]).status, 0);
    const second = narration2(['--lines', lines, '--out', fx.dir], env);
    assert.match(second.stderr, /nothing to do/);
  } finally { fx.cleanup(); }
}

export function manifestIsDeterministicAndIdempotent({ assert }) {
  const fx = fixture();
  try {
    const first = fs.readFileSync(fx.manifestPath, 'utf8');
    assert.equal(narration(['--write-manifest', '--out', fx.dir]).status, 0);
    assert.equal(fs.readFileSync(fx.manifestPath, 'utf8'), first, 'no clock, no randomness: the same bytes again');
    assert.ok(first.endsWith('\n'));
  } finally { fx.cleanup(); }
}
