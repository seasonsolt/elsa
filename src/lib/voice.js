  /* The voice queue (PLAN-2 B5): lazy mp3 clips, priorities, word counting. Plain global script (see src/lib/save.js).
     It touches no DOM; the audio graph and the page state are reached through names of the shared view scope.
     Free names, supplied by 40-audio.js and the rest of the view: audio, bus, voiceOn (assigned here), musicLevel, soundWanted,
     game, story, LINES, setting, assetURL, countWordHeard, and the host globals fetch, setTimeout, clearTimeout, performance, console.
     Nothing here runs at load except building the `voice` object, so the load order against the view files does not matter. */
  /* Voice: lazy mp3 clips, one at a time, a small priority queue, the music ducks underneath.
       voice.line(key, opts)  opts { interrupt, priority 0..2 (default 1), maxWait ms, tag, subtitle:false }
       voice.word(id) / voice.ui(name) / voice.stop() / voice.busy / voice.preload(keys) / voice.lastReason(key)
     Every call returns quickly and never rejects: a missing or slow file just plays as silence for ~0.35 s so a story that
     waits on the promise keeps moving (subtitles, if wanted, stay up for a reading time).
     The promise resolves true when the clip was heard to the end (audible, not muted, not cut), false otherwise.
     WHY it was false: voice.lastReason(key) -> the reason of the most recent call for that key (the line key, 'word_<id>'
     for voice.word, 'ui_<name>' for hover names), set before the promise resolves; null when it completed or was never called.
       'missing'     no such line, or its mp3 failed to load / decode / arrive in time (played as silence)
       'interrupted' cut by louder speech or voice.stop(), dropped from the queue, or a hover name that found speech playing
       'muted'       the clip ran to the end but sound was off, so nothing was heard
       'expired'     waited in the queue longer than maxWait without getting its turn
     A failed mp3 load is not cached: the next request fetches it once more (a second failure is cached), one console warning per file.
     voice.ui (hover names) is priority 0, tag 'ui': it may cut another 'ui' clip but never anything else, it is dropped instead of
     queued behind speech, and it says nothing at all while a story / learning scene (`story`) is open. */
  const voice = (() => {
    const FILE_WAIT = 2500, SILENT_MS = 350, CACHE_MAX = 48, QUEUE_MAX = 4;
    const bufs = new Map();              // file -> Promise<AudioBuffer | null>, least recently used first
    const queue = [], listeners = [];
    let cur = null, seq = 0, SUBS = null, subsAsked = false, subTimer = 0, uiTimer = 0, uiLast = { name: '', t: -1e9 };
    const warned = new Set(), warnedFiles = new Set(), failures = new Map();   // failures: file -> failed loads so far
    const reasons = new Map();           // key -> why the latest call for it did not complete (null = it did)
    const storyOpen = () => typeof story !== 'undefined' && !!story;
    function settle(job, ok, reason) { reasons.set(job.key, ok ? null : reason); job.resolve(ok); }
    const speakable = t => /[\p{L}\p{N}]/u.test(t);
    const lineDef = key => {
      const L = typeof LINES === 'object' && LINES;
      return (L && ((L.lines && L.lines[key]) || (L.pages && L.pages[key]))) || null;
    };
    const isEn = s => s && typeof s === 'object' && s.en !== undefined;
    const hasEn = def => def.say.some(isEn);
    const wordsOnly = () => { try { return typeof setting === 'function' && setting('english') === 'words'; } catch (e) { return false; } };
    const wordText = id => (SUBS && SUBS.words && SUBS.words[id] && SUBS.words[id].en) || String(id);
    /* Anna is the stable learning companion, including legacy companion line definitions. */
    const speakerOf = def => def.who !== 'companion' ? def.who : 'nuan';
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
      else {
        p = fetch(assetURL(file)).then(r => r.ok ? r.arrayBuffer() : null).then(b => b && new Promise((ok, no) => audio.decodeAudioData(b, ok, no))).catch(() => null);
        p = p.then(b => {
          if (b) { failures.delete(file); return b; }
          // a failed load is not remembered as silence: the next request tries once more, the second failure sticks
          const n = (failures.get(file) || 0) + 1;
          failures.set(file, n);
          if (!warnedFiles.has(file)) { warnedFiles.add(file); try { console.warn('voice: could not load', file); } catch (e) {} }
          if (n < 2 && bufs.get(file) === p) bufs.delete(file);
          return null;
        });
      }
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
        if (!buf || !audio || !bus) { job.silent = true; job.timer = setTimeout(() => finish(job, false, 'missing'), SILENT_MS); return; }
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
    function finish(job, completed = false, why) {
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
      settle(job, !!heard, why || (completed ? 'muted' : 'interrupted'));
    }
    function drop(job, why) { clearTimeout(job.expire); settle(job, false, why || 'interrupted'); }
    function pump() { while (!cur && queue.length) { const j = queue.shift(); clearTimeout(j.expire); start(j); } }
    function submit(job) {
      // hover names never cut or wait behind other speech: with anything but 'ui' speech around they are simply not said
      if (job.tag === 'ui' && ((cur && cur.tag !== 'ui') || queue.some(j => j.tag !== 'ui'))) { settle(job, false, 'interrupted'); return; }
      if (job.tag) for (let i = queue.length - 1; i >= 0; i--) if (queue[i].tag === job.tag) drop(queue.splice(i, 1)[0]);
      if (job.interrupt && (!cur || cur.prio <= job.prio)) {
        for (let i = queue.length - 1; i >= 0; i--) if (queue[i].prio <= job.prio) drop(queue.splice(i, 1)[0]);
        if (cur) finish(cur);
      }
      if (!cur && !queue.length) { start(job); return; }
      queue.push(job);
      queue.sort((a, b) => b.prio - a.prio || a.seq - b.seq);
      while (queue.length > QUEUE_MAX) drop(queue.pop());
      if (isFinite(job.maxWait)) job.expire = setTimeout(() => { const i = queue.indexOf(job); if (i >= 0) { queue.splice(i, 1); drop(job, 'expired'); } }, job.maxWait);
    }
    function make(fields, opts) {
      const prio = opts.priority != null ? opts.priority : 1;
      return Object.assign({ prio, interrupt: !!opts.interrupt, tag: opts.tag || '', seq: ++seq, maxWait: opts.maxWait != null ? opts.maxWait : prio >= 2 ? Infinity : 4000,
        sub: opts.subtitle !== false, words: [], segments: [], file: null, silent: false }, fields);
    }
    function line(key, opts) {
      opts = opts || {};
      loadSubs();
      return new Promise(/** @param {(played?: boolean) => void} resolve */ resolve => {
        const def = lineDef(key);
        if (!def || !Array.isArray(def.say)) {
          if (!warned.has(key)) { warned.add(key); try { console.warn('voice.line: no line', key); } catch (e) {} }
          reasons.set(key, 'missing');
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
      return new Promise(resolve => submit(make({ kind: 'word', key: 'word_' + id, who: 'nuan', file: `word_${id}.mp3`, words: [id], resolve }, opts)));
    }
    /* Hover names: debounced 400 ms, at most one waiting; hovering back to the name that already played cancels the pending one.
       Priority 0 and tag 'ui' (see submit): never cuts narration, learn_*, quiz_* or word clips, and silent while a scene is open. */
    function ui(name) {
      if (storyOpen()) { clearTimeout(uiTimer); return; }
      const now = performance.now();
      if (name === uiLast.name && now - uiLast.t < 400) { clearTimeout(uiTimer); return; }
      const run = () => { if (storyOpen()) return; uiLast = { name, t: performance.now() }; line('ui_' + name, { interrupt: true, priority: 0, tag: 'ui', maxWait: 600, subtitle: false }); };
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
      lastReason: key => reasons.has(key) ? reasons.get(key) : null,
      wordInfo: id => (SUBS && SUBS.words && SUBS.words[id]) || null,   // { en, zh, room } once game/subs.json has loaded
      get busy() { return cur !== null; },
      onSubtitle(fn) { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; },
    };
  })();
