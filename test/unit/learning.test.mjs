import fs from 'node:fs';
import vm from 'node:vm';

export function recallCountsForTheWordLearningRoom({ assert }) {
  const source = fs.readFileSync(new URL('../../src/view/00-core.js', import.meta.url), 'utf8');
  const code = source.slice(source.indexOf('  const heardLog ='), source.indexOf('  const roomIndex ='));
  const context = {
    save: { words: {} }, WORDS: [{ id: 'heart', room: 'hall' }],
    LEVELS: [{ id: 'hall' }, { id: 'lake' }], game: { index: 1 }, saveSoon() {},
  };
  const api = vm.runInNewContext(code + '\n({heardLog,noteWordHeard});', context);
  api.noteWordHeard('heart');
  assert.equal(context.save.words.heart.heard, 1);
  assert.equal(api.heardLog.heart.hall, 1);
  assert.equal(api.heardLog.heart.lake, undefined, 'recall must not credit the next room');
}

export function parentModalPausesGameplay({ assert }) {
  const source = fs.readFileSync(new URL('../../src/view/80-input.js', import.meta.url), 'utf8');
  const code = source.split('\n').find(s => s.includes('function canPlay()'));
  const context = { playFlow: { phase: 'play' }, game: { state: 'play' }, uxState: { modal: null }, storyIsOpen: () => false };
  const canPlay = vm.runInNewContext(code + '\ncanPlay;', context);
  assert.equal(canPlay(), true);
  context.uxState.modal = { name: 'settings' };
  assert.equal(canPlay(), false, 'parent modal must pause the physics and input');
  context.uxState.modal = null; context.playFlow.phase = 'intro';
  assert.equal(canPlay(), false);
}
