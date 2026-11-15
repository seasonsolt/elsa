import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function elsaLeadsAndOldAnnaSavesKeepProgress({ assert, loadLib }) {
  const api = loadLib(['save'], {}, '({defaultSave,sanitizeSave})');
  assert.equal(api.defaultSave().settings.player, 'frost');
  const old = { settings: { player: 'nuan', sound: true }, rooms: { lake: { cleared: true, stars: [true, true, true] } },
    words: { ice: { heard: 12, quiz: 1 } }, outfit: { nuan: { dress: 2, hat: 'bow' } }, stickers: ['lake'], unlocked: { rooms: 3 } };
  const migrated = api.sanitizeSave(old);
  assert.equal(migrated.settings.player, 'frost');
  assert.equal(migrated.rooms.lake.cleared, true);
  assert.equal(migrated.words.ice.heard, 12);
  assert.equal(migrated.outfit.nuan.dress, 2);
  assert.equal(migrated.unlocked.rooms, 3);
}

export function allEnglishTeachingUsesAnnaAndNoExternalNarrator({ assert }) {
  const doc = JSON.parse(fs.readFileSync(new URL('../../src/content/lines.json', import.meta.url), 'utf8'));
  assert.match(doc.voices.nuan.zh[0], /^elevenlabs:/, 'Anna is an ElevenLabs voice (a cartoon girl, not a newsreader)');
  assert.equal(doc.voices.nuan.en[0], doc.voices.nuan.zh[0], 'Anna keeps one voice in both languages');
  for (const [key, line] of Object.entries(doc.lines)) {
    assert.ok(['frost', 'nuan'].includes(line.who), key + ': unexpected third speaker');
    if (line.say.some(s => typeof s === 'object' && (s.w || s.en))) assert.equal(line.who, 'nuan', key + ': English belongs to Anna');
  }
}

export function standaloneWordsUseTheSameAnnaVoiceAsMixedLessons({ assert }) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const script = `import sys,json;sys.path.insert(0,sys.argv[1]+'/art');import narration as n
c=n.Content(sys.argv[1]+'/src/content/lines.json',sys.argv[1]+'/src/content/words.json')
jobs=n.plan(c,None,True,'game',None);anna=c.voice('nuan','zh')[0]
assert all(s['voice']==c.voice('nuan','en') for j in jobs if j.name.startswith('word_') for s in j.segs)
assert all(s['voice'][0]==anna for j in jobs for s in j.segs if s['lang'] in ('en','mix')), 'every English word is said by Anna'
print(len(jobs))`;
  const result = spawnSync('python3', ['-c', script, root], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

export function narrationRejectsSistersSharingAChineseVoice({ assert }) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const script = `import sys,json,tempfile,pathlib;sys.path.insert(0,sys.argv[1]+'/art');import narration as n
root=pathlib.Path(sys.argv[1]);doc=json.loads((root/'src/content/lines.json').read_text())
doc['voices']['nuan']['zh'][0]=doc['voices']['frost']['zh'][0]
with tempfile.TemporaryDirectory() as tmp:
 p=pathlib.Path(tmp)/'lines.json';p.write_text(json.dumps(doc))
 try:n.Content(p,root/'src/content/words.json')
 except n.Fail as e:assert 'must not share' in str(e)
 else:raise AssertionError('Anna was allowed to sound like Elsa')`;
  const result = spawnSync('python3', ['-c', script, root], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}
