/* art/narration.py --prune (PLAN-2 B2) and the audio half of test/content_keys.mjs. Nothing here calls the network or ffmpeg. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkAudioFiles } from '../content_keys.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const narration = (args, cwd = ROOT) => spawnSync('python3', [path.join(ROOT, 'art/narration.py'), ...args], { cwd, encoding: 'utf8' });
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'narration-test-'));
const touch = (dir, name) => { fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true }); fs.writeFileSync(path.join(dir, name), 'x'); };
const listing = dir => fs.readdirSync(dir).sort();

export function pruneListsOrphansWithDryRunAndDeletesOnlyThemOtherwise({ assert }) {
  const dir = tmpDir();
  try {
    for (const f of ['vo_p1.mp3', 'word_heart.mp3', 'vo_tutor_swap.mp3', 'vo_ui_gone__nuan.mp3', 'vo_me_nuan__w.mp3', 'notes.txt', 'subs.json', 'heart.webp']) touch(dir, f);
    touch(dir, 'sample/vo_p1.mp3');
    const before = listing(dir);
    const dry = narration(['--prune', '--dry-run', '--out', dir]);
    assert.equal(dry.status, 0, dry.stderr);
    assert.deepEqual(dry.stdout.split('\n').filter(Boolean), ['vo_me_nuan__w.mp3', 'vo_tutor_swap.mp3', 'vo_ui_gone__nuan.mp3'], 'the orphans, sorted');
    assert.match(dry.stderr, /3 orphan mp3 file\(s\).*would be deleted/);
    assert.deepEqual(listing(dir), before, 'a dry run deletes nothing');
    const real = narration(['--prune', '--out', dir]);
    assert.equal(real.status, 0, real.stderr);
    assert.deepEqual(listing(dir), before.filter(f => !['vo_me_nuan__w.mp3', 'vo_tutor_swap.mp3', 'vo_ui_gone__nuan.mp3'].includes(f)), 'only the orphan mp3 files went');
    assert.ok(fs.existsSync(path.join(dir, 'sample/vo_p1.mp3')), 'sub-directories are left alone');
    const again = narration(['--prune', '--out', dir]);
    assert.match(again.stderr, /0 orphan mp3 file\(s\)/, 'idempotent');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

export function pruneRefusesToMixWithPartialRunsAndNeverCallsEverythingAnOrphan({ assert }) {
  const dir = tmpDir();
  try {
    touch(dir, 'vo_p1.mp3');
    for (const extra of [['--only', 'p1'], ['--all'], ['--sample', '2']]) {
      const r = narration(['--prune', ...extra, '--out', dir]);
      assert.equal(r.status, 2, extra.join(' '));
      assert.match(r.stderr, /--prune works on the whole output directory/);
    }
    assert.deepEqual(listing(dir), ['vo_p1.mp3']);
    const empty = path.join(dir, 'empty.json');
    fs.writeFileSync(empty, JSON.stringify({ lines: {} }));
    const r = narration(['--prune', '--lines', empty, '--out', dir]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /refusing to call every mp3 an orphan/);
    assert.deepEqual(listing(dir).filter(f => f.endsWith('.mp3')), ['vo_p1.mp3'], 'a broken lines.json cannot wipe the folder');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

export function contentKeysReportsOrphanAndMissingMp3({ assert }) {
  const dir = tmpDir();
  try {
    touch(dir, 'vo_p1.mp3');
    touch(dir, 'vo_gone.mp3');
    const problems = checkAudioFiles(dir);
    assert.ok(problems.some(p => p.includes('vo_gone.mp3') && p.includes('orphan')), 'the orphan is reported');
    assert.ok(problems.some(p => p.includes('vo_p2.mp3') && p.includes('missing')), 'a missing clip is reported');
    assert.ok(!problems.some(p => p.includes('vo_p1.mp3')), 'a present, expected clip is fine');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

export function gameHoldsExactlyTheMp3FilesTheContentNeeds({ assert }) {
  assert.deepEqual(checkAudioFiles(), []);
  const n = fs.readdirSync(path.join(ROOT, 'game')).filter(f => f.endsWith('.mp3')).length;
  const expected = narration(['--all', '--dry-run']).stdout.split('\n').filter(Boolean).length;
  assert.equal(n, expected, 'ls game/*.mp3 | wc -l equals the clips plan() expects');
}

export function narrationRejectsTheNarratorSpeakerAndEnglishInElsasLines({ assert }) {
  const dir = tmpDir();
  try {
    const doc = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/content/lines.json'), 'utf8'));
    const write = (name, d) => { const p = path.join(dir, name); fs.writeFileSync(p, JSON.stringify(d)); return p; };
    const run = lines => narration(['--dry-run', '--lines', lines, '--out', dir]);

    const narrator = JSON.parse(JSON.stringify(doc));
    narrator.lines.p1.who = 'narrator';
    const a = run(write('narrator.json', narrator));
    assert.equal(a.status, 2);
    assert.match(a.stderr, /who must be frost\|nuan\|companion/);

    const english = JSON.parse(JSON.stringify(doc));
    english.lines.me_frost.say.push({ en: 'Hello!' });
    const b = run(write('english.json', english));
    assert.equal(b.status, 2);
    assert.match(b.stderr, /Elsa speaks Chinese only/);

    const jenny = JSON.parse(JSON.stringify(doc));
    jenny.voices.narrator = jenny.voices.nuan;
    jenny.voices.frost.en = ['en-US-JennyNeural', '-15%', '-4Hz'];
    assert.equal(run(write('extra-voices.json', jenny)).status, 0, 'unused extra voice entries are ignored, not required');
    delete jenny.voices.nuan;
    assert.equal(run(write('no-anna.json', jenny)).status, 2, 'but Anna must have her voices');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
