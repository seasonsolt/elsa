/* Word-heard bookkeeping (src/lib/heard.js) and the play gate (src/lib/play-gate.js), loaded as files, no view scope needed. */
export function recallCountsForTheWordLearningRoom({ assert, loadLib }) {
  const context = {
    save: { words: {} }, WORDS: [{ id: 'heart', room: 'hall' }],
    LEVELS: [{ id: 'hall' }, { id: 'lake' }], game: { index: 1 }, saveSoon() {},
  };
  const api = loadLib(['review', 'heard'], context, '({heardLog,noteWordHeard})');
  api.noteWordHeard('heart');
  assert.equal(context.save.words.heart.heard, 1);
  assert.equal(api.heardLog.heart.hall, 1);
  assert.equal(api.heardLog.heart.lake, undefined, 'recall must not credit the next room');
}

export function aHearingStampsTheRoomClockSoReviewCanTellHowLongAgo({ assert, loadLib }) {
  const context = { save: { words: {}, roomClock: 4 }, WORDS: [], LEVELS: [{ id: 'hall' }], game: { index: 0 }, saveSoon() {} };
  const api = loadLib(['review', 'heard'], context, '({noteWordHeard})');
  api.noteWordHeard('heart');
  context.save.roomClock = 7;
  api.noteWordHeard('heart');
  assert.equal(context.save.words.heart.heard, 2);
  assert.equal(context.save.words.heart.lastSeen, 7);
  api.noteWordHeard('__proto__');
  assert.deepEqual(Object.keys(context.save.words), ['heart'], 'a bad id leaves no record behind');
}

export function aWordWithoutARoomIsCreditedToTheRoomYouAreIn({ assert, loadLib }) {
  const saved = [];
  const context = { save: { words: {} }, WORDS: [], LEVELS: [{ id: 'hall' }, { id: 'lake' }], game: { index: 1 }, saveSoon: () => saved.push(1) };
  const api = loadLib(['review', 'heard'], context, '({heardLog,noteWordHeard})');
  api.noteWordHeard('hello');
  api.noteWordHeard('hello');
  api.noteWordHeard('');
  api.noteWordHeard(7);
  assert.equal(context.save.words.hello.heard, 2);
  assert.equal(api.heardLog.hello.lake, 2);
  assert.deepEqual(Object.keys(context.save.words), ['hello'], 'empty and non-string ids are ignored');
  assert.equal(saved.length, 2, 'every counted hearing asks for a (coalesced) save');
}

export function parentModalPausesGameplay({ assert, loadLib }) {
  const context = { playFlow: { phase: 'play' }, game: { state: 'play' }, uxState: { modal: null }, storyIsOpen: () => false, isPortraitView: () => false };
  const canPlay = loadLib(['play-gate'], context, 'canPlay');
  assert.equal(canPlay(), true);
  context.uxState.modal = { name: 'settings' };
  assert.equal(canPlay(), false, 'parent modal must pause the physics and input');
  context.uxState.modal = null; context.playFlow.phase = 'intro';
  assert.equal(canPlay(), false);
  context.playFlow.phase = 'play'; context.game.state = 'clear';
  assert.equal(canPlay(), false, 'a cleared room is not live');
  context.game.state = 'play'; context.storyIsOpen = () => true;
  assert.equal(canPlay(), false, 'a story page covers the room');
  context.storyIsOpen = () => false; context.isPortraitView = () => true;
  assert.equal(canPlay(), false, 'the turn-the-tablet picture covers the room: it must not run unseen');
  context.isPortraitView = () => false;
  assert.equal(canPlay(), true);
}
