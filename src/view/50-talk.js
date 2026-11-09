  /* Talk: the sisters speak (voice-first), the castle's soft mood, the memory fragment and the word exposure counter.
       talkOnEvents(events, g)   called once per frame by 90-main after audioOnEvents; also advances the mood, the idle timer and the bubble
       wordStats()               dev: { [wordId]: { [levelId]: times heard } }, counted once per {"w"} segment / voice.word call
     A speech bubble only shows while subtitles are on (setting('subtitles')); without them the child just hears the line. */
  /* Names other files read or assign (S0 callers): the mood object, the room clock, the memory fragment state. */
  const heart = { mood: 0, aloneT: 0, alone: false, apart: false, togetherT: 0, puffT: 0, windT: 0, warned: false };
  let levelT0 = 0;
  const memGot = LEVELS.map(() => false);
  let memNode = null;
  // Everything else lives in this closure so its generic names (say, room, tick, ...) cannot clash with other view files.
  const TK = (() => {
    const wordLog = {};
    const KIND_WORD = { h: 'heart', '*': 'snowflake', o: 'ball' };   // collect kind -> core word (exposure.md, request 1)
    const isDev = () => { try { return /[?&]dev=1(&|$)/.test(location.search); } catch (e) { return false; } };
    const storyOpen = () => typeof story !== 'undefined' && !!story;
    const subtitlesOn = () => { try { const v = typeof setting === 'function' ? setting('subtitles') : false; return !!v && v !== 'off' && v !== 'false'; } catch (e) { return false; } };
    const curLevel = () => LEVELS[game.index] || null;

    /* A word counts for the room where it is learned, whichever room it is heard in (recall lines play in the next room). */
    function wordRoom(id) {
      const lv = LEVELS.find(l => l.words && l.words.includes(id));
      if (lv) return lv.id;
      const info = voice.wordInfo(id);
      return (info && info.room) || (curLevel() && curLevel().id) || '_';
    }
    function countWordHeard(id) {
      const row = wordLog[id] || (wordLog[id] = {}), room = wordRoom(id);
      row[room] = (row[room] || 0) + 1;
      try { if (typeof noteWordHeard === 'function') noteWordHeard(id); } catch (e) {}
    }
    function wordStats() {
      const out = {};
      for (const id of Object.keys(wordLog)) out[id] = Object.assign({}, wordLog[id]);
      return out;
    }
    function logRoomWords(lv) {
      if (!isDev() || !lv || !lv.words) return;
      const rows = lv.words.map(w => ({ word: w, heard: (wordLog[w] || {})[lv.id] || 0, target: 8, ok: ((wordLog[w] || {})[lv.id] || 0) >= 8 }));
      try { console.log('word exposure, room ' + lv.id); console.table(rows); } catch (e) {}
    }

    /* Per-room talk state, rebuilt on every 'load' event */
    let room = null, clock = 0, snowExtra = null;
    const freshRoom = () => ({
      token: Math.random(), picks: {}, stars: 0, loadedAt: performance.now() / 1000, startPending: true, startAt: 0, starting: false, preloaded: false,
      idleT: 0, idleN: 0, idleNext: 0, sig: '', farT: 0, farSpoken: false, farNext: 0, splashAt: -99, splashN: 0, togetherN: 0, spokeAt: -99,
    });
    const hasLine = key => !!(typeof LINES === 'object' && LINES && LINES.lines && LINES.lines[key]);
    const nowSec = () => performance.now() / 1000;
    function say(key, opts) {
      if (!hasLine(key)) return Promise.resolve();
      room.spokeAt = nowSec();
      return voice.line(key, opts);
    }
    const countKeys = prefix => { let n = 0; while (hasLine(prefix + (n + 1))) n++; return n; };
    const pickN = (prefix, avoid) => { const n = countKeys(prefix); if (!n) return 0; let k = 1 + Math.floor(Math.random() * n); if (n > 1 && k === avoid) k = k % n + 1; return k; };

    function talkOnEvents(events, g) {
      g = g || game;
      if (!room) room = freshRoom();
      for (const e of events || []) {
        switch (e.type) {
          case 'load': onLoad(g); break;
          case 'collect': onCollect(e, g); break;
          case 'respawn': onRespawn(e, g); break;
          case 'open': say('open_' + (curLevel() || {}).id, { tag: 'open', maxWait: 8000 }); break;
          case 'memory': onMemory(e, g); break;
          case 'swap': room.idleT = 0; break;
          case 'clear':
            logRoomWords(curLevel());
            // a room with no door (the garden) never emits 'open': its "everything is open" line plays as the room clears
            if (g.goal === 'garden') say('open_' + (curLevel() || {}).id, { tag: 'open', maxWait: 8000 });
            break;
        }
      }
      tick(g);
    }
    function onLoad(g) {
      room = freshRoom();
      levelT0 = g.time || 0;
      Object.assign(heart, { mood: 0, aloneT: 0, alone: false, apart: false, togetherT: 0 });
      memGot[g.index] = !!g.memoryFound;
      // the fragment is drawn by 10-stage.js drawFragment(); talk only narrates it (onMemory)
      hideBubble();
      if (isDev()) window.__wordStats = wordStats;
    }
    function onCollect(e) {
      if (e.kind === '+') {
        const n = Math.min(5, e.n || ++room.stars);
        room.stars = Math.max(room.stars, n);
        say('star_' + n, { tag: 'star', maxWait: 2500 });
        return;
      }
      const w = KIND_WORD[e.kind] || e.word;
      if (!w) return;
      const k = room.picks[w] = (room.picks[w] || 0) + 1;
      voice.word(w);   // the bare word first (interrupts a pick line still running), then the companion's sentence
      say(`pick_${w}_${(k - 1) % 3 + 1}`, { tag: 'pick', maxWait: 3500 });
    }
    function onRespawn(e, g) {
      if (g.mode === 'solo' && e.who !== g.player) return;   // the AI sister is never the one being comforted
      const t = nowSec();
      if (t - room.splashAt < 5) return;
      room.splashAt = t;
      const k = pickN('splash_', room.splashN);
      if (k) { room.splashN = k; say('splash_' + k, { interrupt: true, tag: 'splash', maxWait: 2000 }); }
    }
    function onMemory(e, g) {
      memGot[g.index] = true;
      if (memNode) {
        if (typeof burst === 'function') burst(+memNode.dataset.x, +memNode.dataset.y, 'star', 10, 110);
        memNode.remove(); memNode = null;
      }
      const key = 'mem_' + e.id, def = hasLine(key) ? LINES.lines[key] : null;
      if (!def) return;
      if (def.art && typeof openStory === 'function') openStory([{ art: def.art, vo: key, lines: plainText(def) }]);
      else voice.line(key, { interrupt: true, priority: 2 });
    }
    function plainText(def) {
      return [def.say.map(s => typeof s === 'string' ? s : s.w !== undefined ? ((voice.wordInfo(s.w) || {}).en || s.w) : s.en).join('')];
    }

    /* ---- per-frame work; safe to call more than once a frame (the second call sees dt ~ 0) ---- */
    function tick(g) {
      g = g || game;
      if (!room) room = freshRoom();
      const t = nowSec(), dt = clock ? Math.min(.1, t - clock) : 0;
      if (!clock || dt > .0005) {
        clock = t;
        if (g.state === 'play' && !storyOpen()) { stepStart(g, t); stepIdle(g, dt, t); stepMood(g, dt); }
        stepMemory(g, t);
      }
      placeBubble(g);
    }
    function stepStart(g, t) {
      const lv = curLevel();
      if (!room.preloaded && lv && audio) {
        room.preloaded = true;
        const keys = [...lv.words.map(w => 'word_' + w), 'open_' + lv.id, 'star_1', 'star_2', 'star_3', 'splash_1', 'splash_2'];
        for (let n = 1; hasLine(`start_${lv.id}_${n}`); n++) keys.unshift(`start_${lv.id}_${n}`);
        for (const w of lv.words) for (let n = 1; n <= 3; n++) if (hasLine(`pick_${w}_${n}`)) keys.push(`pick_${w}_${n}`);
        voice.preload(keys);
      }
      if (!room.startPending) return;
      if (!room.startAt) room.startAt = t + .6;
      if (t < room.startAt || !lv) return;
      room.startPending = false;
      const token = room.token, keys = [];
      for (let n = 1; hasLine(`start_${lv.id}_${n}`); n++) keys.push(`start_${lv.id}_${n}`);
      if (!keys.length) return;
      room.starting = true;
      (async () => {
        for (const key of keys) {
          if (room.token !== token || game.state !== 'play') break;
          await say(key, { tag: 'start', maxWait: Infinity });
        }
        if (room.token === token) room.starting = false;
      })();
    }
    /* The child stands still: after 3 s a gentle nudge from the companion, at most 3 in a row, 10 s apart. Solo only. */
    function stepIdle(g, dt, t) {
      const s = g.sisters[g.player || 'frost'], inp = (g.input && g.input[g.player || 'frost']) || {};
      if (!s) return;
      const sig = [Math.round(s.x), Math.round(s.y), g.progress, inp.l ? 1 : 0, inp.r ? 1 : 0].join();
      if (sig !== room.sig) { room.sig = sig; room.idleT = 0; room.idleN = 0; return; }
      room.idleT += dt;
      if (g.mode !== 'solo' || room.starting || (typeof playFlow === 'object' && playFlow.tutoring) || room.idleN >= 3 || room.idleT < 3 || t < room.idleNext || voice.busy || t - room.spokeAt < 4) return;
      const k = pickN('idle_', room.idleLast);
      if (!k) return;
      room.idleLast = k; room.idleN++; room.idleNext = t + 10;
      say('idle_' + k, { priority: 0, tag: 'idle', maxWait: 500 });
    }

    /* Mood, softened: the further apart the sisters drift the heavier the snow falls and the louder the wind; no shivering,
       a gentle call across the castle, and hearts when they meet again. */
    function stepMood(g, dt) {
      const f = g.sisters.frost, n = g.sisters.nuan;
      const d = Math.hypot(f.x - n.x, (f.y + f.h - n.y - n.h) * .7);
      const target = Math.min(1, Math.max(0, (d - 220) / 280));
      heart.mood += (target - heart.mood) * Math.min(1, dt * (target > heart.mood ? .4 : 1.3));
      const chill = $('chill'), front = $('snowFront');
      if (chill) chill.setAttribute('opacity', (heart.mood * .3).toFixed(2));
      if (front) {
        front.setAttribute('opacity', (.55 + heart.mood * .45).toFixed(2));
        if (!snowExtra && heart.mood > .2 && typeof fillSnow === 'function') { snowExtra = el('g', { opacity: 0 }, front); fillSnow(snowExtra, 14, true); }
        if (snowExtra) snowExtra.setAttribute('opacity', Math.min(1, heart.mood * 1.3).toFixed(2));
      }
      if ((heart.windT -= dt) < 0) { heart.windT = .3; windMood(heart.mood); }
      if (heart.mood > .4) heart.apart = true;
      // far apart for a few seconds: the companion calls out once (key = the sister being called, i.e. the player)
      if (g.mode === 'solo' && heart.mood > .55) {
        room.farT += dt;
        if (room.farT > 3.5 && !room.farSpoken) { room.farSpoken = true; say('miss_' + (g.player || 'frost'), { tag: 'miss', maxWait: 1500 }); }
        if (room.farT > 25) { room.farT = 0; room.farSpoken = false; }
      } else if (heart.mood < .2) { room.farT = 0; room.farSpoken = false; }
      const still = s => s.ground && Math.abs(s.vx) < 1 && !s.splash;
      if (d < 58 && still(f) && still(n)) {
        heart.togetherT += dt;
        if (heart.togetherT > 1.2) {
          if (heart.apart) {
            heart.apart = false;
            const k = room.togetherN++ % Math.max(1, countKeys('together_')) + 1;
            say('together_' + k, { interrupt: true, tag: 'together', maxWait: 3000 });
          }
          if ((heart.puffT -= dt) <= 0) { heart.puffT = 1.8; if (typeof burst === 'function') burst((f.x + n.x + f.w) / 2, Math.min(f.y, n.y) - 4, 'heart', 1, 26); }
        }
      } else heart.togetherT = 0;
    }

    /* ---- the speech bubble: subtitles on, a line from a sister, play in progress ---- */
    const bubble = { who: '', segs: null, rows: 0, w: 0, fade: 0 };
    const esc = t => String(t).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const cw = c => c.charCodeAt(0) > 255 ? 15 : 8.4;
    function rowsOf(segs, max) {
      const rows = [[]]; let w = 0;
      for (const s of segs) {
        let buf = '';
        const flush = () => { if (buf) rows[rows.length - 1].push({ text: buf, en: s.en }); buf = ''; };
        for (const ch of s.text) {
          if (w + cw(ch) > max && !'，。、！？：；」…—,.!?'.includes(ch) && ch !== ' ') { flush(); rows.push([]); w = 0; }
          buf += ch; w += cw(ch);
        }
        flush();
      }
      return rows.filter(r => r.length);
    }
    function showBubble(p) {
      const box = $('talk');
      if (!box) return;
      const frost = p.who === 'frost', fill = frost ? '#eef6ff' : '#fff3df', line = frost ? '#8fb6ea' : '#e2a45e', ink = frost ? '#1b2559' : '#4a2c05', en = frost ? '#2d6bd1' : '#c4520a';
      const rows = rowsOf(p.segments, 360);
      if (!rows.length) return;
      const w = Math.max(...rows.map(r => r.reduce((n, s) => n + [...s.text].reduce((m, c) => m + cw(c), 0), 0))) + 34, h = rows.length * 20 + 14;
      const text = rows.map((r, i) => `<text x="0" y="${-h + 24 + i * 20}" text-anchor="middle" font-size="15" fill="${ink}">${r.map(s => s.en ? `<tspan fill="${en}" font-weight="700">${esc(s.text)}</tspan>` : esc(s.text)).join('')}</text>`).join('');
      box.innerHTML = `<g id="bubble"><g id="bubbleTail"><path d="M-8 0L0 11L8 0Z" fill="${fill}" stroke="${line}" stroke-width="1.5"/></g>
        <rect x="${-w / 2}" y="${-h}" width="${w}" height="${h}" rx="12" fill="${fill}" stroke="${line}" stroke-width="1.5"/>
        <g id="bubbleCover"><path d="M-7 -1L7 -1" stroke="${fill}" stroke-width="3"/></g>${text}</g>`;
      Object.assign(bubble, { who: p.who, w, h, fade: 1, gone: 0 });
    }
    function hideBubble() { const box = $('talk'); if (box) box.textContent = ''; bubble.who = ''; }
    voice.onSubtitle(p => {
      if (p && p.bubble && subtitlesOn()) showBubble(p);
      else if (bubble.who) bubble.gone = nowSec();   // fade out after a short linger
    });
    function placeBubble(g) {
      const box = $('talk'), b = bubble.who ? $('bubble') : null;
      if (!box) return;
      box.setAttribute('visibility', storyOpen() || g.state !== 'play' ? 'hidden' : 'visible');
      if (!b) return;
      if (bubble.gone && nowSec() - bubble.gone > .5) { hideBubble(); return; }
      const s = g.sisters[bubble.who];
      if (!s) return;
      const x = s.x + s.w / 2, y = s.y + s.h - (bubble.who === 'frost' ? 84 : 76) - 10;   // just above the painted head
      const bx = Math.max(bubble.w / 2 + 8, Math.min(952 - bubble.w / 2, x)), off = (x - bx).toFixed(1);
      b.setAttribute('transform', `translate(${bx.toFixed(1)} ${Math.max(bubble.h + 10, y).toFixed(1)})`);
      $('bubbleTail').setAttribute('transform', `translate(${off} 0)`);
      $('bubbleCover').setAttribute('transform', `translate(${off} 0)`);
      b.setAttribute('opacity', bubble.gone ? Math.max(0, 1 - (nowSec() - bubble.gone) / .5).toFixed(2) : '1');
    }

    /* ---- memory fragment: the glow only; logic picks it up and emits 'memory' (see onMemory) ---- */
    function drawMemory() {
      const box = $('memory');
      if (!box) return;
      box.textContent = '';
      memNode = null;
      const lv = curLevel(), mem = lv && lv.memory;
      if (!mem || memGot[game.index] || game.memoryFound) return;
      const [c, r] = mem;
      memNode = el('g', { 'data-x': c * T + T / 2, 'data-y': r * T + T / 2 }, box);
      img('fx_glow', -26, -24, 52, 46, memNode, { opacity: .8 });
      img('fx_star', -13, -13, 26, 26, memNode);
    }
    function stepMemory(g, t) {
      if (!memNode) return;
      if (g.memoryFound) { memNode.remove(); memNode = null; return; }
      const mx = +memNode.dataset.x, my = +memNode.dataset.y;
      memNode.setAttribute('transform', `translate(${mx} ${(my + Math.sin(t * 2) * 4).toFixed(1)}) scale(${(1 + Math.sin(t * 3.1) * .08).toFixed(3)})`);
    }

    const spoken = { game: new Set(), room: new Set() };
    function speak(key, delay, perRoom) {   // old API: a line once per game / per room
      const set = perRoom ? spoken.room : spoken.game;
      if (set.has(key) || !hasLine(key)) return;
      set.add(key);
      setTimeout(() => voice.line(key), (delay || 0) * 1000);
    }
    function resetTalk() { spoken.room.clear(); hideBubble(); }
    return { talkOnEvents, countWordHeard, wordStats, tick, drawMemory, speak, resetTalk };
  })();
  function talkOnEvents(events, g) { return TK.talkOnEvents(events, g); }
  function countWordHeard(id) { return TK.countWordHeard(id); }
  function wordStats() { return TK.wordStats(); }
  function drawMemory() { return TK.drawMemory(); }

  /* ---- old entry points, kept so callers that were not rewritten still run ---- */
  function speak(key, delay, perRoom) { TK.speak(key, delay, perRoom); }
  function resetTalk() { TK.resetTalk(); }
  function drawTalk() { TK.tick(game); }
  function updateMood() { TK.tick(game); }
  function updateMemory() { TK.tick(game); }
