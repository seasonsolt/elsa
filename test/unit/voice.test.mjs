import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../src/view/40-audio.js', import.meta.url), 'utf8');
const voiceSource = source.slice(source.indexOf('  const voice = (() => {'), source.indexOf('  const onSubtitle'));
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function setup({ missing = false, sound = true } = {}) {
  const heard = [], sources = [], timers = new Map();
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
    LINES: { lines: { mixed: { who: 'companion', say: [{ w: 'heart' }, { w: 'door' }] } } },
    countWordHeard: id => heard.push(id), setting: () => 'words+phrases', assetURL: file => 'game/' + file,
    fetch: async () => ({ ok: !missing, arrayBuffer: async () => new ArrayBuffer(1), json: async () => ({}) }),
    setTimeout: (fn, ms) => { timers.set(++timer, { fn, ms }); return timer; },
    clearTimeout: id => timers.delete(id), performance: { now: () => 0 }, console,
  };
  const voice = vm.runInNewContext(voiceSource + '\nvoice;', context);
  return { voice, heard, sources, timers };
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
