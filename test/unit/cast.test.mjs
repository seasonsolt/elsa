import fs from 'node:fs';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function elsaLeadsAndOldAnnaSavesKeepProgress({ assert }) {
  const source = fs.readFileSync(new URL('../../src/view/00-core.js', import.meta.url), 'utf8');
  const code = source.slice(source.indexOf('  const SETTING_CHECK'), source.indexOf('  function loadSave()'));
  const api = vm.runInNewContext(code + '\n({defaultSave,sanitizeSave});');
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
  for (const [key, line] of Object.entries(doc.lines)) {
    assert.ok(['frost', 'nuan'].includes(line.who), key + ': unexpected third speaker');
    if (line.say.some(s => typeof s === 'object' && (s.w || s.en))) assert.equal(line.who, 'nuan', key + ': English belongs to Anna');
  }
}

export function standaloneWordsUseTheSameAnnaVoiceAsMixedLessons({ assert }) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const script = `import sys,json;sys.path.insert(0,sys.argv[1]+'/art');import narration as n
c=n.Content(sys.argv[1]+'/src/content/lines.json',sys.argv[1]+'/src/content/words.json')
jobs=n.plan(c,None,True,'game',None);expected=c.voice('nuan','en')
assert all(s['voice']==expected for j in jobs for s in j.segs if s['lang']=='en')
assert all(s['voice']==expected for j in jobs if j.name.startswith('word_') for s in j.segs)
print(len(jobs))`;
  const result = spawnSync('python3', ['-c', script, root], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}
