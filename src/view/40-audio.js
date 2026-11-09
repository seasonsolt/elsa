  /* Sound: an original procedural score (music box, pad, reverb), wind, effects, and the voice (lazy mp3 clips, see `voice` below) */
  let audio = null, muted = false, bus = null, voiceOn = false, wantSong;   // wantSong: undefined = title theme once audio wakes, null = silence
  // key: tonic as a MIDI note; prog: [semitones from the tonic, 'M' | 'm'] per bar; beats per bar
  const THEMES = {
    title: { bpm: 70, beats: 4, key: 62, minor: true, prog: [[0, 'm'], [-4, 'M'], [3, 'M'], [-2, 'M']], seed: 3 },
    0: { bpm: 82, beats: 4, key: 62, minor: true, prog: [[0, 'm'], [-2, 'M'], [-4, 'M'], [-5, 'm']], seed: 11 },
    1: { bpm: 76, beats: 4, key: 57, minor: true, prog: [[0, 'm'], [-4, 'M'], [3, 'M'], [-2, 'M']], seed: 23 },
    2: { bpm: 96, beats: 4, key: 64, minor: true, prog: [[0, 'm'], [-4, 'M'], [3, 'M'], [-2, 'M'], [0, 'm'], [5, 'm'], [-5, 'M'], [-5, 'M']], seed: 31 },
    3: { bpm: 132, beats: 3, key: 65, minor: false, prog: [[0, 'M'], [-3, 'm'], [5, 'M'], [7, 'M']], seed: 47 },
    end: { bpm: 72, beats: 4, key: 62, minor: false, prog: [[0, 'M'], [7, 'M'], [-3, 'm'], [5, 'M']], seed: 59 },
  };
  // Rooms past the first four reuse a base tune with its own seed, so every room still has its own melody.
  for (let n = 4; n < 10; n++) THEMES[n] = Object.assign({}, THEMES[n % 4], { seed: 101 + n * 17 });
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  function rng(seed) { return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  // Each theme gets a fixed eight-bar tune, so every room has its own recognisable melody.
  for (const th of Object.values(THEMES)) {
    const r = rng(th.seed), scale = th.minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
    let deg = 7;
    th.tune = [];
    for (let bar = 0; bar < 8; bar++) {
      const [off, q] = th.prog[bar % th.prog.length];
      const chord = [0, q === 'M' ? 4 : 3, 7].map(x => ((off + x) % 12 + 12) % 12);
      const notes = [];
      for (let beat = 0; beat < th.beats; beat++) {
        if (beat && r() < .45) { notes.push(null); continue; }
        deg = Math.max(3, Math.min(13, deg + Math.round((r() - .5) * 4)));
        let n = Math.floor(deg / 7) * 12 + scale[deg % 7];
        if (beat === 0) { // land on a chord tone at the start of every bar
          let best = n, bd = 99;
          for (let k = -4; k <= 4; k++) if (chord.includes(((n + k) % 12 + 12) % 12) && Math.abs(k) < bd) { bd = Math.abs(k); best = n + k; }
          n = best;
        }
        notes.push(n);
      }
      th.tune.push(notes);
    }
  }
  function impulse(sec) {
    const len = Math.round(audio.sampleRate * sec), buf = audio.createBuffer(2, len, audio.sampleRate);
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    return buf;
  }
  let noiseBuf = null;
  function wakeAudio() {
    if (audio) { if (audio.state === 'suspended') audio.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audio = new AC();
    const master = audio.createGain(); master.gain.value = soundWanted() ? 1 : 0; masterOn = soundWanted();
    const comp = audio.createDynamicsCompressor();
    master.connect(comp).connect(audio.destination);
    const verb = audio.createConvolver(); verb.buffer = impulse(3);
    const wet = audio.createGain(); wet.gain.value = .55; verb.connect(wet).connect(master);
    const mk = (v, send) => { const g = audio.createGain(); g.gain.value = v; g.connect(master); if (send) { const s = audio.createGain(); s.gain.value = send; g.connect(s).connect(verb); } return g; };
    bus = { master, music: mk(0, .9), sfx: mk(.9, .4), voice: mk(1.15, .05), wind: mk(0) };
    noiseBuf = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate);
    const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    startWind();
    setInterval(() => { syncMaster(); schedule(); }, 60);
    song = null;
    if (wantSong !== null) startMusic(wantSong === undefined ? 'title' : wantSong);
  }
  /* Master volume follows the mute toggle (`muted`) and the settings flag setting('sound') (false / 'off'). */
  let masterOn = true;
  function soundWanted() {
    if (muted) return false;
    try { if (typeof setting === 'function') { const v = setting('sound'); if (v === false || v === 'off' || v === 0) return false; } } catch (e) {}
    return true;
  }
  function syncMaster() {
    const on = soundWanted();
    if (audio && bus && on !== masterOn) { masterOn = on; bus.master.gain.setTargetAtTime(on ? 1 : 0, audio.currentTime, .05); }
  }
  function bell(f, t, dur, vol, dest, type) {
    t = Math.max(t, audio.currentTime);
    const g = audio.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .006); g.gain.exponentialRampToValueAtTime(.0004, t + dur);
    g.connect(dest);
    [[f, type || 'sine', 1], [f * 3.01, 'sine', .22], [f * 2, 'triangle', .12]].forEach(([fr, ty, v], k) => {
      const o = audio.createOscillator(), og = audio.createGain();
      o.type = ty; o.frequency.value = fr; og.gain.value = v;
      if (k) { og.gain.setValueAtTime(v, t); og.gain.exponentialRampToValueAtTime(.0004, t + dur * .35); }
      o.connect(og).connect(g); o.start(t); o.stop(t + dur + .05);
    });
  }
  function pad(freqs, t, dur, vol) {
    const lp = audio.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const g = audio.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + dur * .35); g.gain.linearRampToValueAtTime(0, t + dur * 1.15);
    lp.connect(g).connect(bus.music);
    for (const f of freqs) for (const det of [-5, 5]) {
      const o = audio.createOscillator(); o.type = 'triangle'; o.frequency.value = f; o.detune.value = det;
      o.connect(lp); o.start(t); o.stop(t + dur * 1.2);
    }
  }
  function noise(t, dur, vol, type, freq, dest, q) {
    const src = audio.createBufferSource(); src.buffer = noiseBuf; src.playbackRate.value = .8 + Math.random() * .4;
    const f = audio.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q || .8;
    const g = audio.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0005, t + dur);
    src.connect(f).connect(g).connect(dest); src.start(t, Math.random()); src.stop(t + dur + .02);
    return f;
  }
  function startWind() {
    const src = audio.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = audio.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = .6;
    const lfo = audio.createOscillator(), depth = audio.createGain(); lfo.frequency.value = .07; depth.gain.value = 260;
    lfo.connect(depth).connect(f.frequency);
    const swell = audio.createOscillator(), sd = audio.createGain(), g = audio.createGain();
    swell.frequency.value = .11; sd.gain.value = .35; g.gain.value = .65; swell.connect(sd).connect(g.gain);
    src.connect(f).connect(g).connect(bus.wind);
    src.start(); lfo.start(); swell.start();
  }
  /* Music scheduler: eighth notes, looked ahead a quarter second */
  let song = null, step = 0, nextT = 0;
  /* startMusic(themeKey): 'title' | 'end' | a room's `music` key (LEVELS[i].music). Unknown keys fall back to one of the
     base tunes; calling it with the theme already playing is a no-op, so any file may call it freely. */
  function startMusic(name) {
    wantSong = name;
    if (name === null || name === undefined) { stopMusic(); return; }
    if (!THEMES[name]) name = Number.isInteger(+name) ? +name % 4 : 'title';
    if (name === song && audio) return;
    song = name;
    if (!audio) return;
    const now = audio.currentTime;
    bus.music.gain.cancelScheduledValues(now);
    bus.music.gain.setTargetAtTime(0, now, .15);
    step = 0; nextT = now + .7;
    bus.music.gain.setTargetAtTime(musicLevel(), now + .7, .4);
    bus.wind.gain.setTargetAtTime(windBase(), now, 1.2);
  }
  function stopMusic() {
    wantSong = null; song = null;
    if (!audio) return;
    bus.music.gain.cancelScheduledValues(audio.currentTime);
    bus.music.gain.setTargetAtTime(0, audio.currentTime, .25);
    bus.wind.gain.setTargetAtTime(0, audio.currentTime, .6);
  }
  const setMusic = startMusic;   // old name, kept so callers that were not rewritten still work
  /* The wind swells when the sisters drift apart (50-talk); m is 0..1. */
  function windMood(m) { if (audio) bus.wind.gain.setTargetAtTime(windBase() + m * .24, audio.currentTime, .5); }
  const musicLevel = () => voiceOn ? .3 : 1;
  const windBase = () => song === 'end' ? 0 : song === 1 ? .1 : .07;
  function schedule() {
    if (!audio || song === null || audio.state !== 'running') return;
    const th = THEMES[song], e8 = 30 / th.bpm, per = th.beats * 2;
    if (nextT < audio.currentTime - .2) nextT = audio.currentTime + .05;
    while (nextT < audio.currentTime + .25) {
      const bar = Math.floor(step / per) % 8, i = step % per, [off, q] = th.prog[bar % th.prog.length];
      const root = th.key + off, chord = [0, q === 'M' ? 4 : 3, 7, 12, q === 'M' ? 16 : 15, 19];
      if (i === 0) pad([root - 12, root - 5, root + (q === 'M' ? 4 : 3) - 12], nextT, e8 * per, .045);
      if (i === 0 || (th.beats === 3 && i % 2 === 0)) bell(hz(root - 24 + (i ? 7 : 0)), nextT, 1.4, i ? .05 : .08, bus.music, 'sine');
      const arp = [0, 1, 2, 3, 4, 3, 2, 1][i % 8];
      if (song === 2 || i % 2 === 1 || th.beats === 3) bell(hz(root + chord[arp]), nextT, .9, .045, bus.music);
      if (i % 2 === 0) { const n = th.tune[bar][i / 2]; if (n !== null) bell(hz(th.key + 12 + n), nextT + (Math.random() - .5) * .012, 1.8, .085, bus.music); }
      nextT += e8; step++;
    }
  }
  /* Voice: lazy mp3 clips, one at a time, a small priority queue, the music ducks underneath.
       voice.line(key, opts)  opts { interrupt, priority 0..2 (default 1), maxWait ms, tag, subtitle:false }
       voice.word(id) / voice.ui(name) / voice.stop() / voice.busy / voice.preload(keys)
     Every call returns quickly and never rejects: a missing or slow file just plays as silence for ~0.35 s so a story that
     waits on the promise keeps moving (subtitles, if wanted, stay up for a reading time). */
  const voice = (() => {
    const FILE_WAIT = 2500, SILENT_MS = 350, CACHE_MAX = 48, QUEUE_MAX = 4;
    const bufs = new Map();              // file -> Promise<AudioBuffer | null>, least recently used first
    const queue = [], listeners = [];
    let cur = null, seq = 0, SUBS = null, subsAsked = false, subTimer = 0, uiTimer = 0, uiLast = { name: '', t: -1e9 };
    const warned = new Set();
    const speakable = t => /[\p{L}\p{N}]/u.test(t);
    const lineDef = key => {
      const L = typeof LINES === 'object' && LINES;
      return (L && ((L.lines && L.lines[key]) || (L.pages && L.pages[key]))) || null;
    };
    const isEn = s => s && typeof s === 'object' && s.en !== undefined;
    const hasEn = def => def.say.some(isEn);
    const wordsOnly = () => { try { return typeof setting === 'function' && setting('english') === 'words'; } catch (e) { return false; } };
    const wordText = id => (SUBS && SUBS.words && SUBS.words[id] && SUBS.words[id].en) || String(id);
    /* "companion" = whichever sister is not the one the child plays */
    const speakerOf = def => def.who !== 'companion' ? def.who : (typeof game === 'object' && game.player === 'frost' ? 'nuan' : 'frost');
    function segmentsOf(key, def, wMode) {
      const e = SUBS && SUBS.lines && SUBS.lines[key];
      if (e) return (wMode && e.w !== undefined ? e.w || [] : e.s).map(([text, en]) => ({ text, en: !!en }));
      const out = [];
      for (const s of def.say) {
        if (typeof s === 'string') out.push({ text: s, en: false });
        else if (s.w !== undefined) out.push({ text: wordText(s.w), en: true });
        else if (!wMode) out.push({ text: s.en, en: true });
        else if (s.zh) out.push({ text: s.zh, en: false });
      }
      return out.filter(x => x.text);
    }
    function loadSubs() {   // subtitle table written by narration.py; small, fetched once, never awaited
      if (subsAsked || typeof fetch !== 'function') return;
      subsAsked = true;
      fetch(assetURL('subs.json')).then(r => r.ok ? r.json() : null).then(j => { if (j && j.lines) SUBS = j; }).catch(() => {});
    }
    function load(file) {
      if (!audio) return Promise.resolve(null);
      let p = bufs.get(file);
      if (p) bufs.delete(file);
      else p = fetch(assetURL(file)).then(r => r.ok ? r.arrayBuffer() : null).then(b => b && new Promise((ok, no) => audio.decodeAudioData(b, ok, no))).catch(() => null);
      bufs.set(file, p);
      while (bufs.size > CACHE_MAX) bufs.delete(bufs.keys().next().value);
      return p;
    }
    function emitSub(payload) { for (const fn of listeners) { try { fn(payload); } catch (e) {} } }
    const inPlay = () => typeof game === 'object' && game.state === 'play' && !(typeof story !== 'undefined' && story);
    function duck() {
      voiceOn = cur !== null;
      if (audio && bus) bus.music.gain.setTargetAtTime(musicLevel(), audio.currentTime, voiceOn ? .3 : .5);
    }
    function start(job) {
      cur = job;
      clearTimeout(subTimer);
      emitSub(job.sub && job.segments.length ? { key: job.key, who: job.who, segments: job.segments, bubble: (job.who === 'frost' || job.who === 'nuan') && inPlay() } : null);
      duck();
      const go = buf => {
        if (cur !== job) return;
        if (!buf || !audio || !bus) { job.silent = true; job.timer = setTimeout(() => finish(job), SILENT_MS); return; }
        const src = audio.createBufferSource();
        src.buffer = buf; src.connect(bus.voice);
        job.audible = soundWanted();
        src.onended = () => finish(job, true);
        job.src = src;
        src.start(audio.currentTime + .08);
      };
      if (job.file && audio) {
        let t = 0;
        Promise.race([load(job.file), new Promise(ok => { t = setTimeout(() => ok(null), FILE_WAIT); })]).then(b => { clearTimeout(t); go(b); });
      } else Promise.resolve().then(() => go(null));
    }
    function finish(job, completed = false) {
      if (cur !== job) return;
      cur = null;
      const heard = completed && job.audible && soundWanted();
      if (heard) for (const id of job.words) countWordHeard(id);
      clearTimeout(job.timer);
      if (job.src) { job.src.onended = null; try { job.src.stop(); } catch (e) {} job.src = null; }
      pump();
      duck();
      if (!cur && job.sub && job.segments.length) {
        // a clip without sound keeps its subtitle up for a reading time; a real clip clears it at once
        if (job.silent) { const keep = Math.max(0, Math.min(8000, job.segments.reduce((n, s) => n + s.text.length, 0) * 220) - SILENT_MS); subTimer = setTimeout(() => emitSub(null), Math.max(900, keep)); }
        else emitSub(null);
      }
      job.resolve(!!heard);
    }
    function drop(job) { clearTimeout(job.expire); job.resolve(false); }
    function pump() { while (!cur && queue.length) { const j = queue.shift(); clearTimeout(j.expire); start(j); } }
    function submit(job) {
      if (job.tag) for (let i = queue.length - 1; i >= 0; i--) if (queue[i].tag === job.tag) drop(queue.splice(i, 1)[0]);
      if (job.interrupt && (!cur || cur.prio <= job.prio)) {
        for (let i = queue.length - 1; i >= 0; i--) if (queue[i].prio <= job.prio) drop(queue.splice(i, 1)[0]);
        if (cur) finish(cur);
      }
      if (!cur && !queue.length) { start(job); return; }
      queue.push(job);
      queue.sort((a, b) => b.prio - a.prio || a.seq - b.seq);
      while (queue.length > QUEUE_MAX) drop(queue.pop());
      if (isFinite(job.maxWait)) job.expire = setTimeout(() => { const i = queue.indexOf(job); if (i >= 0) { queue.splice(i, 1); drop(job); } }, job.maxWait);
    }
    function make(fields, opts) {
      const prio = opts.priority != null ? opts.priority : 1;
      return Object.assign({ prio, interrupt: !!opts.interrupt, tag: opts.tag || '', seq: ++seq, maxWait: opts.maxWait != null ? opts.maxWait : prio >= 2 ? Infinity : 4000,
        sub: opts.subtitle !== false, words: [], segments: [], file: null, silent: false }, fields);
    }
    function line(key, opts) {
      opts = opts || {};
      loadSubs();
      return new Promise(resolve => {
        const def = lineDef(key);
        if (!def || !Array.isArray(def.say)) {
          if (!warned.has(key)) { warned.add(key); try { console.warn('voice.line: no line', key); } catch (e) {} }
          resolve(); return;
        }
        const who = speakerOf(def), wMode = wordsOnly() && hasEn(def), segments = segmentsOf(key, def, wMode);
        // words-only variant with nothing left to say (every {"en"} lacks a zh gloss): no file, just the subtitle
        const voiced = !wMode || def.say.some(s => typeof s === 'string' ? speakable(s) : s.w !== undefined || (s.zh && speakable(s.zh)));
        const file = voiced ? `vo_${key}${def.who === 'companion' ? '__' + who : ''}${wMode ? '__w' : ''}.mp3` : null;
        const words = def.say.filter(s => s && s.w !== undefined).map(s => s.w);
        submit(make({ kind: 'line', key, who, file, segments, words, resolve }, opts));
      });
    }
    function word(id, opts) {
      opts = Object.assign({ interrupt: true, tag: 'word', maxWait: 1500, subtitle: false }, opts);
      return new Promise(resolve => submit(make({ kind: 'word', key: 'word_' + id, who: 'narrator', file: `word_${id}.mp3`, words: [id], resolve }, opts)));
    }
    /* Hover names: debounced 400 ms, at most one waiting; hovering back to the name that already played cancels the pending one. */
    function ui(name) {
      const now = performance.now();
      if (name === uiLast.name && now - uiLast.t < 400) { clearTimeout(uiTimer); return; }
      const run = () => { uiLast = { name, t: performance.now() }; line('ui_' + name, { interrupt: true, tag: 'ui', maxWait: 600, subtitle: false }); };
      clearTimeout(uiTimer);
      const wait = uiLast.t + 400 - now;
      if (wait > 0) uiTimer = setTimeout(run, wait); else run();
    }
    function stop() {
      clearTimeout(uiTimer);
      while (queue.length) drop(queue.pop());
      if (cur) finish(cur);
      clearTimeout(subTimer);
      emitSub(null);
    }
    /* Warm the cache for lines that are likely to play soon (needs the audio context, i.e. after the first click). */
    function preload(keys) {
      if (!audio) return Promise.resolve();
      loadSubs();
      const files = [];
      for (const key of keys) {
        const def = lineDef(key);
        if (!def && /^word_/.test(key)) { files.push(key + '.mp3'); continue; }
        if (!def || !Array.isArray(def.say)) continue;
        const wMode = wordsOnly() && hasEn(def);
        files.push(`vo_${key}${def.who === 'companion' ? '__' + speakerOf(def) : ''}${wMode ? '__w' : ''}.mp3`);
      }
      return files.reduce((p, f) => p.then(() => load(f)), Promise.resolve()).then(() => {});
    }
    return {
      line, word, ui, stop, preload,
      wordInfo: id => (SUBS && SUBS.words && SUBS.words[id]) || null,   // { en, zh, room } once game/subs.json has loaded
      get busy() { return cur !== null; },
      onSubtitle(fn) { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; },
    };
  })();
  const onSubtitle = fn => voice.onSubtitle(fn);
  // old names, for callers that were not rewritten: a story page's `vo` is a line key
  const playVoice = id => { if (id) voice.line(id, { interrupt: true, priority: 2 }); };
  const stopVoice = () => voice.stop();
  /* Effects */
  function tones(notes, type, len, vol) {
    if (!audio) return;
    notes.forEach((f, i) => bell(f, audio.currentTime + i * len * .7, len * 2.4, (vol || .06) * 1.5, bus.sfx, type === 'square' ? 'triangle' : type));
  }
  function crunch(v) { if (audio) noise(audio.currentTime, .07, .05 * (v || 1), 'bandpass', 2600 + Math.random() * 1400, bus.sfx, 1.2); }
  function thud() {
    if (!audio) return;
    const t = audio.currentTime, o = audio.createOscillator(), g = audio.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(55, t + .12);
    g.gain.setValueAtTime(.12, t); g.gain.exponentialRampToValueAtTime(.0005, t + .16);
    o.connect(g).connect(bus.sfx); o.start(t); o.stop(t + .2);
    crunch(1.4);
  }
  function whoosh(up) {
    if (!audio) return;
    const f = noise(audio.currentTime, .32, .07, 'bandpass', up ? 500 : 1800, bus.sfx, 1.5);
    f.frequency.exponentialRampToValueAtTime(up ? 2400 : 400, audio.currentTime + .3);
  }
  function splashSound() {
    if (!audio) return;
    const f = noise(audio.currentTime, .55, .16, 'lowpass', 3000, bus.sfx);
    f.frequency.exponentialRampToValueAtTime(300, audio.currentTime + .5);
    [0, .09, .2].forEach(d => bell(700 + Math.random() * 500, audio.currentTime + d, .12, .03, bus.sfx));
  }

  /* Sound effects by name: 'pick' 'star' 'click' 'hover' 'blink' 'splash' 'quiz_right' 'quiz_wrong' 'page' 'unlock'.
     sfx('star', n) climbs a little with the star count. Unknown names and a locked audio context are ignored. */
  function sfx(name, n) {
    if (!audio || !bus) return;
    const t = audio.currentTime;
    switch (name) {
      case 'pick': tones([784, 1175], 'triangle', .1, .05); break;
      case 'star': { const f = [1047, 1175, 1319, 1568, 1760][Math.max(0, Math.min(4, (n | 0) - 1))]; tones([f, f * 1.5], 'sine', .09, .045); break; }
      case 'click': crunch(.7); bell(1500, t, .06, .025, bus.sfx, 'sine'); break;
      case 'hover': bell(1760, t, .08, .012, bus.sfx, 'sine'); break;
      case 'blink': tones([1568, 2093, 2637], 'sine', .06, .04); break;
      case 'splash': splashSound(); break;
      case 'quiz_right': tones([523, 659, 784, 1047], 'triangle', .1, .05); break;
      case 'quiz_wrong': tones([392, 330], 'sine', .14, .035); break;
      case 'page': { const f = noise(t, .25, .06, 'bandpass', 900, bus.sfx, 1); f.frequency.exponentialRampToValueAtTime(2600, t + .2); break; }
      case 'unlock': tones([523, 659, 784, 1047, 1319], 'sine', .1, .05); break;
    }
  }
  /* The frame's game events -> sounds (90-main calls this before talkOnEvents). Also keeps the music on the room's `music` key. */
  function audioOnEvents(events, g) {
    if (!events) return;
    g = g || game;
    for (const e of events) {
      switch (e.type) {
        case 'load': { const lv = LEVELS[g.index]; if (lv && lv.music !== undefined) startMusic(lv.music); break; }
        case 'freeze': tones([880, 1175], 'sine', .14); break;
        case 'block': tones([660, 990], 'triangle', .12); break;
        case 'melt': whoosh(false); tones([392, 523, 659], 'sine', .18); break;
        case 'fizz': tones([220], 'sine', .1, .03); break;
        case 'jump': whoosh(true); tones([e.who === 'frost' ? 440 : 494], 'sine', .08, .02); break;
        case 'doublejump': whoosh(true); tones([659, 988], 'sine', .08, .035); break;
        case 'splash': sfx('splash'); break;
        case 'collect':
          if (e.kind === '+') sfx('star', e.n);
          else tones(e.kind === 'h' ? [659, 880] : e.kind === 'o' ? [392, 494, 587] : [988, 1319], 'triangle', .12);
          break;
        case 'open': tones([523, 659, 784, 1047], 'triangle', .16); break;
        case 'gate': tones(e.open ? [330, 440] : [440, 330], 'square', .08, .02); break;
        case 'memory': tones([784, 988, 1175, 1568], 'sine', .2, .05); break;
        case 'blink': sfx('blink'); break;
        case 'swap': sfx('click'); break;
        case 'clear': tones([523, 659, 784, 659, 784, 1047], 'triangle', .17); break;
        case 'win': startMusic('end'); tones([523, 659, 784, 1047, 1319], 'sine', .24); break;
      }
    }
  }
