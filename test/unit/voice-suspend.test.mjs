/* Audio suspend and resume (PLAN-2 D6). A hidden tab, a locked tablet or a call puts the AudioContext to sleep; a clip in flight can then
   never end. The voice queue must end its job ('interrupted', no word counted), the music must come back up, and the page must resume the
   context when it returns. The queue is src/lib/voice.js with the stand-ins of voice.test.mjs; the wiring (visibilitychange, statechange) is
   the real src/view/40-audio.js in a small page with a fake AudioContext. The decoded-clip cache is bounded to 24. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { loadLib, ROOT } from '../harness.mjs';

const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };

function setup({ state, sound = true, lines } = {}) {
  const heard = [], sources = [], timers = new Map(), fetched = [], levels = [];
  let timer = 0;
  const audio = {
    currentTime: 0, state,
    decodeAudioData: (_, ok) => ok({ duration: 1 }),
    createBufferSource: () => { const src = { connect() {}, start() {}, stop() {} }; sources.push(src); return src; },
  };
  const context = {
    audio, bus: { voice: {}, music: { gain: { setTargetAtTime: (v, t, c) => levels.push(v) } } }, voiceOn: false,
    musicLevel: () => (context.voiceOn ? .3 : 1), soundWanted: () => sound,
    game: { state: 'play' }, story: null,
    LINES: { lines: lines || {
      one: { who: 'nuan', say: [{ w: 'heart' }] }, two: { who: 'nuan', say: [{ w: 'door' }] }, three: { who: 'nuan', say: [{ w: 'star' }] },
    } },
    countWordHeard: id => heard.push(id), setting: () => 'words+phrases', assetURL: file => 'game/' + file,
    fetch: async url => { if (/\.mp3$/.test(url)) fetched.push(url); return { ok: /\.mp3$/.test(url), arrayBuffer: async () => new ArrayBuffer(1), json: async () => ({}) }; },
    setTimeout: (fn, ms) => { timers.set(++timer, { fn, ms }); return timer; },
    clearTimeout: id => timers.delete(id), performance: { now: () => 0 }, console: { warn() {} },
  };
  const voice = loadLib(['voice'], context, 'voice');
  return { voice, heard, sources, timers, context, fetched, levels, audio };
}

export async function suspendEndsTheCurrentJobAsInterruptedAndPutsTheMusicBack({ assert }) {
  const s = setup();
  const first = s.voice.line('one'), second = s.voice.line('two', { maxWait: Infinity });
  await flush();
  assert.equal(s.voice.busy, true);
  assert.equal(s.context.voiceOn, true, 'the music is ducked while she talks');
  s.voice.suspend();
  assert.equal(await first, false, 'the clip in flight resolves false');
  assert.equal(await second, false, 'so does the one waiting behind it: nothing may start on a sleeping context');
  assert.equal(s.voice.lastReason('one'), 'interrupted');
  assert.equal(s.voice.lastReason('two'), 'interrupted');
  assert.equal(s.voice.busy, false);
  assert.equal(s.context.voiceOn, false);
  assert.equal(s.levels[s.levels.length - 1], 1, 'the music level is back to full');
  assert.deepEqual(s.heard, [], 'a clip that did not finish counts no word');
  assert.equal(s.sources.length, 1, 'and the queued line never started');
}

export async function suspendWithNothingPlayingStillRestoresTheMusicLevel({ assert }) {
  const s = setup();
  s.context.voiceOn = true;                          // a ducked level left behind
  s.voice.suspend();
  assert.equal(s.context.voiceOn, false);
  assert.equal(s.levels[s.levels.length - 1], 1);
  const next = s.voice.line('one'); await flush();
  s.sources[0].onended();
  assert.equal(await next, true, 'the queue works as before after a suspend');
  assert.deepEqual(s.heard, ['heart']);
}

export async function aClipStartedOnASleepingContextIsGivenUpInsteadOfHangingForever({ assert }) {
  const s = setup({ state: 'suspended' });
  const done = s.voice.line('one'); await flush();
  assert.equal(s.voice.busy, true);
  const watchdog = [...s.timers.values()].filter(t => t.ms > 1000);
  assert.equal(watchdog.length, 1, 'one watchdog: the clip length (1 s) plus a short grace');
  watchdog[0].fn();
  assert.equal(await done, false);
  assert.equal(s.voice.lastReason('one'), 'interrupted');
  assert.equal(s.voice.busy, false, 'the job is gone: no ducked music for ever');
  assert.deepEqual(s.heard, []);
}

export async function aSleepingContextThatWakesInTimeStillPlaysTheClipToTheEnd({ assert }) {
  const s = setup({ state: 'suspended' });
  const done = s.voice.line('one'); await flush();
  s.audio.state = 'running';
  s.sources[0].onended();
  assert.equal(await done, true);
  assert.deepEqual(s.heard, ['heart']);
  assert.equal([...s.timers.values()].filter(t => t.ms > 1000).length, 0, 'finishing cleared the watchdog');
}

export async function aRunningContextGetsNoWatchdog({ assert }) {
  const s = setup({ state: 'running' });
  const done = s.voice.line('one'); await flush();
  assert.equal([...s.timers.values()].filter(t => t.ms > 1000).length, 0);
  s.sources[0].onended();
  assert.equal(await done, true);
}

export async function theDecodedClipCacheKeepsAbout24ClipsAndForgetsTheOldest({ assert }) {
  const lines = {};
  for (let i = 0; i < 30; i++) lines[`l${i}`] = { who: 'nuan', say: [`你好${i}`] };
  const s = setup({ lines });
  await s.voice.preload(Object.keys(lines));
  assert.equal(s.fetched.length, 30);
  await s.voice.preload(['l29', 'l10']);
  assert.equal(s.fetched.length, 30, 'recent clips are still decoded');
  await s.voice.preload(['l0']);
  assert.equal(s.fetched.length, 31, 'l0 was dropped long ago (30 clips, room for 24) and is fetched again');
  await s.voice.preload(['l7']);
  assert.equal(s.fetched.length, 31, 'l7 is one of the 24 newest and is still decoded');
  await s.voice.preload(['l6']);
  assert.equal(s.fetched.length, 32, 'l6 was the oldest of the 24 and went when l0 came back');
}

/* ---------- the wiring in 40-audio.js ---------- */
function fakeAudioContext(log) {
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime(v) { log.levels.push(v); } });
  const node = () => { const n = { connect: x => x || n, disconnect() {}, start() {}, stop() {}, gain: param(), frequency: param(), Q: param(), detune: param(), playbackRate: param(), buffer: null }; return n; };
  return class {
    constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 8000; this.destination = {}; log.ctx = this; }
    createGain() { const n = node(); log.gains.push(n); return n; }
    createDynamicsCompressor() { return node(); }
    createConvolver() { return node(); }
    createBiquadFilter() { return node(); }
    createOscillator() { return node(); }
    createBufferSource() { const n = node(); log.sources.push(n); return n; }
    createBuffer(ch, len) { return { duration: 1, getChannelData: () => new Float32Array(len) }; }
    decodeAudioData(_, ok) { ok({ duration: 1 }); }
    suspend() { log.calls.push('suspend'); this.state = 'suspended'; return Promise.resolve(); }
    resume() { log.calls.push('resume'); this.state = 'running'; return Promise.resolve(); }
  };
}

function audioPage() {
  const log = { levels: [], calls: [], sources: [], gains: [], ctx: null };
  const listeners = {};
  const document = { hidden: false, addEventListener: (t, f) => { (listeners[t] || (listeners[t] = [])).push(f); } };
  const heard = [];
  const ctx = {
    document, console, Math, JSON, Promise, Object, Array, Set, Map, Number, String, Boolean, Date, Float32Array, ArrayBuffer, Infinity, NaN, Error,
    setTimeout, clearTimeout, setInterval: () => 0, performance: { now: () => 0 },
    game: { state: 'play' }, LEVELS: [], LINES: { lines: { demo: { who: 'nuan', say: [{ w: 'heart' }] } } },
    setting: () => true, assetURL: f => 'game/' + f, countWordHeard: id => heard.push(id),
    fetch: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1), json: async () => ({}) }),
  };
  ctx.window = ctx;
  ctx.AudioContext = fakeAudioContext(log);
  vm.createContext(ctx);
  const code = ['lib/voice.js', 'view/40-audio.js'].map(f => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8')).join('');
  vm.runInContext(code, ctx, { filename: 'audio-page' });
  const run = expr => vm.runInContext(expr, ctx);
  return { log, document, listeners, run, heard };
}

export async function theAudioPageHooksVisibilityChangeAndTheContextsStateChange({ assert }) {
  const p = audioPage();
  assert.equal((p.listeners.visibilitychange || []).length, 1, 'one visibilitychange listener');
  p.run('wakeAudio()');
  assert.equal(typeof p.log.ctx.onstatechange, 'function', 'and the context reports its state changes');
}

export async function whenTheContextSleepsTheVoiceJobEndsInterruptedAndTheMusicComesBack({ assert }) {
  const p = audioPage();
  p.run('wakeAudio()');
  const done = p.run("voice.line('demo')");
  await flush();
  assert.equal(p.run('voice.busy'), true, 'a clip is playing');
  assert.equal(p.run('voiceOn'), true);
  p.log.ctx.state = 'interrupted';                   // the call came in
  p.log.ctx.onstatechange();
  assert.equal(await done, false);
  assert.equal(p.run("voice.lastReason('demo')"), 'interrupted');
  assert.equal(p.run('voice.busy'), false);
  assert.equal(p.run('voiceOn'), false);
  assert.equal(p.log.levels[p.log.levels.length - 1], 1, 'the music target is back at full level');
  assert.deepEqual(p.heard, []);
}

export async function aRunningContextDoesNotCutTheVoice({ assert }) {
  const p = audioPage();
  p.run('wakeAudio()');
  p.run("voice.line('demo')");
  await flush();
  p.log.ctx.onstatechange();                         // 'running' again: nothing to do
  assert.equal(p.run('voice.busy'), true);
}

export async function hidingThePageEndsTheJobAndSleepsTheContextAndComingBackResumesIt({ assert }) {
  const p = audioPage();
  p.run('wakeAudio()');
  const done = p.run("voice.line('demo')");
  await flush();
  p.document.hidden = true;
  p.listeners.visibilitychange.forEach(f => f());
  assert.equal(await done, false);
  assert.equal(p.run("voice.lastReason('demo')"), 'interrupted');
  assert.deepEqual(p.log.calls, ['suspend'], 'the context was put to sleep with the page');
  assert.equal(p.log.ctx.state, 'suspended');
  p.document.hidden = false;
  p.listeners.visibilitychange.forEach(f => f());
  await flush();
  assert.deepEqual(p.log.calls, ['suspend', 'resume'], 'and woken when the child comes back');
  assert.equal(p.log.ctx.state, 'running');
  const again = p.run("voice.line('demo')");
  await flush();
  p.log.sources[p.log.sources.length - 1].onended();
  assert.equal(await again, true, 'speech works again after the return');
  assert.deepEqual(p.heard, ['heart']);
}

export async function comingBackWithAContextThatIsAlreadyRunningDoesNotResumeAgain({ assert }) {
  const p = audioPage();
  p.run('wakeAudio()');
  p.document.hidden = false;
  p.listeners.visibilitychange.forEach(f => f());
  assert.deepEqual(p.log.calls, []);
  p.document.hidden = true;                          // hidden before any sound was woken: no context, nothing to suspend (no throw)
  const q = audioPage();
  q.document.hidden = true;
  q.listeners.visibilitychange.forEach(f => f());
  assert.deepEqual(q.log.calls, []);
}
