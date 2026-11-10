/* The voice queue is src/lib/voice.js; it is loaded as a file with stand-ins for the page names it uses (audio, bus, game, LINES, ...). */
import { loadLib } from '../harness.mjs';

const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };

function setup({ missing = false, sound = true, fetchImpl = null } = {}) {
  const heard = [], sources = [], timers = new Map(), warns = [], fetched = [];
  let timer = 0;
  const audio = {
    currentTime: 0,
    decodeAudioData: (_, ok) => ok({ duration: 1 }),
    createBufferSource: () => {
      const src = { connect() {}, start() {}, stop() {} };
      sources.push(src); return src;
    },
  };
  const context = {
    audio, bus: { voice: {}, music: { gain: { setTargetAtTime() {} } } }, voiceOn: false,
    musicLevel: () => 1, soundWanted: () => sound,
    game: { state: 'play', player: 'nuan' }, story: null,
    LINES: { lines: {
      mixed: { who: 'companion', say: [{ w: 'heart' }, { w: 'door' }] },
      ui_next: { who: 'nuan', say: ['下一步'] }, ui_back: { who: 'nuan', say: ['返回'] },
      idle_1: { who: 'nuan', say: ['嗯'] },
    } },
    countWordHeard: id => heard.push(id), setting: () => 'words+phrases', assetURL: file => 'game/' + file,
    fetch: async url => {
      if (!/\.mp3$/.test(url)) return { ok: false, json: async () => ({}) };   // subs.json is not under test
      fetched.push(url);
      const ok = fetchImpl ? fetchImpl(url, fetched.length) : !missing;
      return { ok, arrayBuffer: async () => new ArrayBuffer(1), json: async () => ({}) };
    },
    setTimeout: (fn, ms) => { timers.set(++timer, { fn, ms }); return timer; },
    clearTimeout: id => timers.delete(id), performance: { now: () => 0 }, console: { warn: (...a) => warns.push(a.join(' ')) },
  };
  const voice = loadLib(['voice'], context, 'voice');
  const fire = ms => [...timers.entries()].filter(([, t]) => t.ms === ms).forEach(([id, t]) => { timers.delete(id); t.fn(); });
  return { voice, heard, sources, timers, context, warns, fetched, fire };
}

export async function annaStaysTheLearningVoiceWithElsaAsLead({ assert }) {
  const s = setup(); s.context.game.player = 'frost';
  const subtitles = []; s.voice.onSubtitle(p => { if (p) subtitles.push(p); });
  const done = s.voice.line('mixed'); await flush();
  assert.equal(subtitles[0].who, 'nuan', 'legacy companion lines belong to Anna');
  s.sources[0].onended(); await done;
  const word = s.voice.word('heart'); await flush();
  s.sources[1].onended(); assert.equal(await word, true);
}

export async function onlyCompletedAudibleClipsCountAsHeard({ assert }) {
  const s = setup(); const done = s.voice.line('mixed'); await flush();
  assert.deepEqual(s.heard, [], 'loading/starting is not hearing a complete word');
  s.sources[0].onended();
  assert.equal(await done, true);
  assert.deepEqual(s.heard, ['heart', 'door']);
}

export async function interruptingSpeechDoesNotCreditUnheardWords({ assert }) {
  const s = setup(); const first = s.voice.line('mixed'); await flush();
  const next = s.voice.word('star'); await flush();
  assert.equal(await first, false);
  assert.deepEqual(s.heard, []);
  s.sources[1].onended();
  assert.equal(await next, true);
  assert.deepEqual(s.heard, ['star']);
}

export async function missingAudioDoesNotCountOrStrandTheScene({ assert }) {
  const s = setup({ missing: true }); const done = s.voice.line('mixed'); await flush();
  [...s.timers.values()].filter(t => t.ms === 350).forEach(t => t.fn());
  assert.equal(await done, false);
  assert.deepEqual(s.heard, []);
  assert.equal(s.voice.busy, false);
}

export async function mutedSpeechAndStoppedQueuesDoNotCount({ assert }) {
  const s = setup({ sound: false }); const done = s.voice.line('mixed'); await flush();
  s.sources[0].onended();
  assert.equal(await done, false); assert.deepEqual(s.heard, []);
  const a = s.voice.line('mixed'), b = s.voice.line('mixed'); await flush();
  s.voice.stop();
  assert.equal(await a, false); assert.equal(await b, false); assert.equal(s.voice.busy, false);
}

export async function hoverNameNeverCutsNarrationOrCountsTwice({ assert }) {
  const s = setup(); const narration = s.voice.line('mixed'); await flush();
  s.voice.ui('next'); await flush();
  assert.equal(s.sources.length, 1, 'the hover name did not start while narration plays');
  assert.equal(s.voice.lastReason('ui_next'), 'interrupted');
  assert.equal(s.voice.busy, true);
  s.sources[0].onended();
  assert.equal(await narration, true, 'narration still completes');
  assert.deepEqual(s.heard, ['heart', 'door'], 'each word counted exactly once');
  assert.equal(s.voice.lastReason('mixed'), null);
  const hit = s.voice.word('star'); await flush();
  s.voice.ui('back'); s.fire(400); await flush();
  s.sources[1].onended();
  assert.equal(await hit, true, 'a word clip is not cut by a hover name either');
  assert.deepEqual(s.heard, ['heart', 'door', 'star']);
}

export async function hoverNameIsDroppedNotQueuedBehindSpeech({ assert }) {
  const s = setup(); const narration = s.voice.line('mixed'); await flush();
  s.voice.ui('next'); await flush();
  s.sources[0].onended(); await narration; await flush();
  assert.equal(s.sources.length, 1, 'nothing left to play once the narration is over');
  assert.equal(s.voice.busy, false);
}

export async function hoverNameMayCutAnotherHoverName({ assert }) {
  const s = setup(); s.voice.ui('next'); await flush();
  assert.equal(s.sources.length, 1, 'a hover name plays when nothing else speaks');
  s.voice.ui('back'); s.fire(400); await flush();
  assert.equal(s.sources.length, 2, 'the newer hover name replaces the old one');
  assert.equal(s.voice.lastReason('ui_next'), 'interrupted');
  s.sources[1].onended(); await flush();
  assert.equal(s.voice.lastReason('ui_back'), null);
}

export async function hoverNameDoesNotCutLowPriorityChatter({ assert }) {
  const s = setup(); const idle = s.voice.line('idle_1', { priority: 0, tag: 'idle', maxWait: 500 }); await flush();
  s.voice.ui('next'); await flush();
  assert.equal(s.sources.length, 1);
  s.sources[0].onended();
  assert.equal(await idle, true);
}

export async function hoverNamesAreSilentWhileASceneIsOpen({ assert }) {
  const s = setup(); s.context.story = { name: 'story' };
  s.voice.ui('next'); s.fire(400); await flush();
  assert.equal(s.fetched.length, 0, 'no file even requested');
  assert.equal(s.sources.length, 0);
  assert.equal(s.voice.busy, false);
  s.context.story = null;
  s.voice.ui('next'); await flush();
  assert.equal(s.sources.length, 1, 'hover names are back once the scene closes');
}

export async function aFailedLoadIsRetriedOnTheNextRequest({ assert }) {
  const s = setup({ fetchImpl: (_, n) => n > 1 });
  const first = s.voice.line('mixed'); await flush();
  s.fire(350);
  assert.equal(await first, false);
  assert.equal(s.voice.lastReason('mixed'), 'missing');
  assert.equal(s.sources.length, 0);
  const second = s.voice.line('mixed'); await flush();
  assert.equal(s.fetched.length, 2, 'the failure was not cached, the file is fetched again');
  assert.equal(s.sources.length, 1);
  s.sources[0].onended();
  assert.equal(await second, true);
  assert.deepEqual(s.heard, ['heart', 'door']);
  const third = s.voice.line('mixed'); await flush();
  assert.equal(s.fetched.length, 2, 'a loaded clip stays cached');
  s.sources[1].onended(); await third;
}

export async function aFileIsRetriedOnlyOnceAndWarnedAboutOnce({ assert }) {
  const s = setup({ missing: true });
  for (let i = 0; i < 3; i++) { const p = s.voice.line('mixed'); await flush(); s.fire(350); assert.equal(await p, false); }
  assert.equal(s.fetched.length, 2, 'first try plus exactly one retry; the second failure sticks');
  assert.equal(s.warns.filter(w => /could not load/.test(w)).length, 1, 'one warning per file');
  assert.equal(s.voice.busy, false);
}

export async function lastReasonSaysWhyACallDidNotComplete({ assert }) {
  const s = setup();
  assert.equal(s.voice.lastReason('mixed'), null, 'never called');
  // missing: no such line
  assert.equal(await s.voice.line('nope'), undefined);
  assert.equal(s.voice.lastReason('nope'), 'missing');
  // interrupted: cut by louder speech
  const cut = s.voice.line('mixed'); await flush();
  const word = s.voice.word('star'); await flush();
  assert.equal(await cut, false);
  assert.equal(s.voice.lastReason('mixed'), 'interrupted');
  s.sources[1].onended(); assert.equal(await word, true);
  assert.equal(s.voice.lastReason('word_star'), null);
  // expired: waited in the queue past maxWait
  const first = s.voice.line('mixed'); await flush();
  const waiting = s.voice.line('idle_1', { priority: 0, tag: 'idle', maxWait: 500 });
  s.fire(500);
  assert.equal(await waiting, false);
  assert.equal(s.voice.lastReason('idle_1'), 'expired');
  s.voice.stop(); assert.equal(await first, false);
  assert.equal(s.voice.lastReason('mixed'), 'interrupted', 'stop() is an interruption');
}

export async function lastReasonSaysMutedAndMissingFiles({ assert }) {
  const muted = setup({ sound: false }); const m = muted.voice.line('mixed'); await flush();
  muted.sources[0].onended();
  assert.equal(await m, false);
  assert.equal(muted.voice.lastReason('mixed'), 'muted');
  const gone = setup({ missing: true }); const g = gone.voice.line('mixed'); await flush();
  gone.fire(350);
  assert.equal(await g, false);
  assert.equal(gone.voice.lastReason('mixed'), 'missing');
}
