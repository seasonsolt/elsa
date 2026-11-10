/* PLAN-2 A6: the save keeps "seen", never overwrites a save written by a newer build, and folds in another tab's progress.
   The save block of src/view/00-core.js (between its `save-block` markers) is run for real in a vm on top of a fake
   localStorage; nothing else of the view is loaded. */
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../src/view/00-core.js', import.meta.url), 'utf8');
const BEGIN = '/* >>> save-block', END = '/* <<< save-block */';
const block = source.slice(source.indexOf(BEGIN), source.indexOf(END));

function fakeStorage(initial = {}, { failWrites = false } = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data, writes: [],
    getItem: k => (data.has(k) ? data.get(k) : null),
    setItem(k, v) { if (failWrites) throw new Error('quota'); data.set(k, String(v)); this.writes.push([k, String(v)]); },
    removeItem: k => { data.delete(k); },
  };
}

/* Boots the save block like a page load would. `listeners` collects what it registers with addEventListener. */
function boot(storage) {
  const listeners = {};
  const context = {
    window: { localStorage: storage }, console, JSON, Math, Number, Object, Array, Set, String, Boolean,
    setTimeout: () => 1, clearTimeout() {},
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
    onSettingChanged() {},
  };
  const api = vm.runInNewContext(block + '\n({ save, saveWrite, setSetting, sanitizeSave, mergeSaveInto, mergeSaves, saveVersionTooNew, storedSaveIsNewer, defaultSave });', context);
  return { api, listeners, fire: (type, e) => (listeners[type] || []).forEach(fn => fn(e)) };
}
const plain = x => JSON.parse(JSON.stringify(x));
const KEY = 'icecastle.save';

export function seenSurvivesSanitizeAndAReload({ assert }) {
  const { api } = boot(fakeStorage());
  const clean = api.sanitizeSave({ words: { heart: { heard: 0, quiz: 0, seen: true }, door: { heard: 3, quiz: 1 } } });
  assert.equal(clean.words.heart.seen, true, 'seen is kept');
  assert.equal('seen' in clean.words.door, false, 'a word never met on a card gains no flag');
  assert.equal(clean.words.door.heard, 3);

  // a real round trip: mark seen, write, load again from the same storage
  const store = fakeStorage();
  const first = boot(store);
  first.api.save.words.star = { heard: 0, quiz: 0, seen: true };
  first.api.saveWrite();
  const second = boot(store);
  assert.equal(second.api.save.words.star.seen, true, 'silent play: the word book is still coloured after a reload');
}

export function aSaveFromANewerBuildIsPlayedButNeverOverwritten({ assert }) {
  const newer = JSON.stringify({ v: 99, rooms: { hall: { cleared: true, stars: [true, false, false], memory: false } }, words: {}, futureField: { keep: 'me' } });
  const store = fakeStorage({ [KEY]: newer });
  const { api, fire } = boot(store);
  assert.equal(api.save.rooms.hall.cleared, true, 'what it understands is still used for play');
  api.save.rooms.lake = { cleared: true, stars: [true, true, false], memory: true };
  assert.equal(api.saveWrite(), false);
  api.setSetting('subtitles', true);
  assert.equal(store.getItem(KEY), newer, 'the newer save is byte for byte what it was');
  assert.equal(store.writes.length, 0, 'nothing at all was written');

  // a newer build that appears while this page is open is respected too
  const store2 = fakeStorage({ [KEY]: JSON.stringify({ v: 2 }) });
  const b = boot(store2);
  store2.data.set(KEY, newer);
  b.api.saveWrite();
  assert.equal(store2.getItem(KEY), newer);
  fire('pagehide', {});

  // the current version is still written
  const store3 = fakeStorage({ [KEY]: JSON.stringify({ v: 2 }) });
  const c = boot(store3);
  c.api.save.flags.prologue = true;
  assert.equal(c.api.saveWrite(), true);
  assert.equal(JSON.parse(store3.getItem(KEY)).flags.prologue, true);
}

export function versionHelpersOnlyFlagStrictlyNewerSaves({ assert }) {
  const { api } = boot(fakeStorage());
  assert.equal(api.saveVersionTooNew({ v: 3 }), true);
  assert.equal(api.saveVersionTooNew({ v: 2 }), false);
  assert.equal(api.saveVersionTooNew({ v: 1 }), false);
  assert.equal(api.saveVersionTooNew({}), false);
  assert.equal(api.saveVersionTooNew(null), false);
  assert.equal(api.storedSaveIsNewer('{"v":7}'), true);
  assert.equal(api.storedSaveIsNewer('not json'), false);
  assert.equal(api.storedSaveIsNewer(null), false);
}

const tabA = () => ({
  v: 2, settings: { subtitles: true },
  rooms: { hall: { cleared: true, stars: [true, false, true], memory: false }, lake: { cleared: false, stars: [false, false, false], memory: false } },
  words: { heart: { heard: 9, quiz: 1, seen: true }, door: { heard: 2, quiz: 0 } },
  stickers: ['hall', 'words5_1'], unlocked: { rooms: 2 }, flags: { prologue: true },
});
const tabB = () => ({
  v: 2, settings: { subtitles: false },
  rooms: { hall: { cleared: true, stars: [true, true, false], memory: true }, lake: { cleared: true, stars: [true, false, false], memory: false }, slope: { cleared: true, stars: [true, false, false], memory: false } },
  words: { heart: { heard: 4, quiz: 3 }, star: { heard: 5, quiz: 0, seen: true } },
  stickers: ['lake', 'hall'], unlocked: { rooms: 4 }, flags: { tutorial: true },
});

export function mergingTwoSavesTakesTheUnionAndTheLargerCounters({ assert }) {
  const { api } = boot(fakeStorage());
  const m = plain(api.mergeSaves(tabA(), tabB()));
  assert.deepEqual(Object.keys(m.rooms).sort(), ['hall', 'lake', 'slope']);
  assert.deepEqual(m.rooms.hall, { cleared: true, stars: [true, true, true], memory: true });
  assert.equal(m.rooms.lake.cleared, true);
  assert.equal(m.rooms.slope.cleared, true);
  assert.deepEqual([...m.stickers].sort(), ['hall', 'lake', 'words5_1']);
  assert.equal(m.words.heart.heard, 9);
  assert.equal(m.words.heart.quiz, 3);
  assert.equal(m.words.heart.seen, true);
  assert.equal(m.words.door.heard, 2);
  assert.equal(m.words.star.heard, 5);
  assert.equal(m.words.star.seen, true);
  assert.equal(m.unlocked.rooms, 4);
  assert.equal(m.flags.prologue, true);
  assert.equal(m.flags.tutorial, true);
  assert.equal(m.settings.subtitles, true, 'settings stay as this tab has them');
}

export function mergingIsIdempotentAndNeverLosesAnything({ assert }) {
  const { api } = boot(fakeStorage());
  const once = plain(api.mergeSaves(tabA(), tabB()));
  const twice = plain(api.mergeSaves(once, tabB()));
  assert.deepEqual(twice, once, 'merging the same save a second time changes nothing');
  assert.deepEqual(plain(api.mergeSaves(once, once)), once, 'merging a save with itself changes nothing');
  assert.deepEqual(plain(api.mergeSaves(tabA(), tabA())), plain(api.sanitizeSave(tabA())), 'a save merged with itself is itself');
  // nothing of either side is lost, in either order
  const other = plain(api.mergeSaves(tabB(), tabA()));
  assert.deepEqual(Object.keys(other.rooms).sort(), Object.keys(once.rooms).sort());
  assert.deepEqual([...other.stickers].sort(), [...once.stickers].sort());
  assert.deepEqual(other.words, once.words);
}

export function theStorageEventMergesInPlaceAndWritesOnlyWhenSomethingChanged({ assert }) {
  const store = fakeStorage({ [KEY]: JSON.stringify(tabA()) });
  const { api, fire } = boot(store);
  const heldRoom = api.save.rooms.hall, heldWord = api.save.words.heart;
  const saveObject = api.save;

  fire('storage', { key: KEY, newValue: JSON.stringify(tabB()) });
  assert.equal(api.save, saveObject, 'the live save object is kept');
  assert.equal(api.save.rooms.hall, heldRoom, 'objects other code holds stay the live ones');
  assert.equal(api.save.words.heart, heldWord);
  assert.equal(heldRoom.memory, true);
  assert.equal(api.save.rooms.slope.cleared, true);
  assert.equal(JSON.parse(store.getItem(KEY)).rooms.slope.cleared, true, 'the union was written back');
  const writes = store.writes.length;

  fire('storage', { key: KEY, newValue: JSON.stringify(tabB()) });
  assert.equal(store.writes.length, writes, 'the same save again: nothing changed, nothing written');

  fire('storage', { key: 'something.else', newValue: JSON.stringify(tabB()) });
  fire('storage', { key: KEY, newValue: null });
  fire('storage', { key: KEY, newValue: '{broken' });
  fire('storage', { key: KEY, newValue: JSON.stringify({ v: 99, rooms: { garden: { cleared: true } } }) });
  assert.equal(store.writes.length, writes);
  assert.equal(api.save.rooms.garden, undefined, 'a newer build\'s save is not merged into an older model of it');
}
