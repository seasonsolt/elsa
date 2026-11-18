  /* Main: the flow title -> (prologue) -> recall -> chapter -> play -> clear -> next, and the frame loop.
     Order inside a frame (CONTRACT §5): solo -> companion.update(dt) -> g.step(dt); then the frame's events go to
     audioOnEvents -> talkOnEvents -> fx. Only this file steps the game. */
  const STEP = 1 / 120;
  const playFlow = { phase: 'boot', token: 0, tutoring: false };   // phase: boot | title | story | intro | play | clear | win
  const newToken = () => ++playFlow.token;
  const stale = tok => tok !== playFlow.token;
  const sleep = ms => new Promise(ok => setTimeout(ok, ms));

  /* d1's story pages set `story`; if that name is ever gone, nothing is open. */
  function storyIsOpen() {
    try { return typeof story !== 'undefined' && !!story; } catch (e) { return false; }
  }

  /* One broken helper in another file must not freeze the picture: report it once and keep the loop alive. */
  const reported = new Set();
  function guarded(label, fn) {
    try { return fn(); } catch (e) {
      if (!reported.has(label + e.message)) { reported.add(label + e.message); console.error(`[${label}]`, e); }
      return undefined;
    }
  }

  const companion = typeof createCompanion === 'function' ? createCompanion(game) : null;
  game.companion = companion;

  /* A voice line that never throws and never waits for a line that does not exist. */
  function vline(key, opts) {
    if (!hasLineKey(key) || typeof voice === 'undefined' || !voice || typeof voice.line !== 'function') return Promise.resolve();
    try { return Promise.resolve(voice.line(key, opts)).catch(() => {}); } catch (e) { return Promise.resolve(); }
  }
  /* Wait until cond() holds, `ms` of GAME time pass or the flow moves on (token changes). Game time only runs while the room is
     live, so a hidden tab or the parent settings do not use up a lesson's waiting time. */
  async function waitUntil(cond, ms, tok) {
    const end = game.time + ms / 1000;
    while (!stale(tok) && !cond() && game.time < end) await sleep(100);
  }

  /* ---- settings that change the game itself ---- */
  function onSettingChanged(key, value) {
    if (key === 'mode') { game.mode = value; clearInput(); }
    else if (key === 'sound' && !value) voice.stop();
  }
  function applySettings() {
    game.mode = setting('mode');
  }

  /* ---- events ---- */
  function handleEvents() {
    const events = game.events.splice(0);
    if (typeof audioOnEvents === 'function') guarded('audioOnEvents', () => audioOnEvents(events, game));
    if (typeof talkOnEvents === 'function') guarded('talkOnEvents', () => talkOnEvents(events, game));
    guarded('fx', () => fxOnEvents(events));
    for (const e of events) if (e.type === 'clear') onRoomClear().catch(err => console.error('[clear]', err));
  }

  /* ---- flow ---- */
  function goTitle() {
    newToken();
    playFlow.phase = 'title';
    game.kbd.teach = null;
    if (typeof voice !== 'undefined' && voice && typeof voice.stop === 'function') guarded('voice.stop', () => voice.stop());
    clearInput();
    applySettings();
    game.state = 'title';
    game.load(0);
    handleEvents();
    if (typeof showTitle === 'function') showTitle();
  }

  const storyPages = keys => keys.filter(hasLineKey).map(k => ({ art: lineOf(k).art, vo: k, key: k, line: k, lines: lineText(k) }));

  /* Called by the title buttons. No argument: the very first time play the prologue, afterwards continue where the
     child left off. With a room index (the room picker): go straight to that room. */
  function startGame(index) {
    wakeOnce();
    if (typeof hideTitle === 'function') hideTitle();
    const target = Number.isInteger(index) && index >= 0 && index < LEVELS.length ? index : (save.flags.prologue ? nextRoomIndex() : 0);
    const pages = save.flags.prologue ? [] : storyPages(['p1', 'p2', 'p3']);
    if (pages.length && typeof openStory === 'function') {
      const tok = newToken();
      playFlow.phase = 'story';
      /* the three prologue paintings are not part of the title set (PLAN-2 D4): fetch them now, the pages open as soon as they are decoded */
      loadArt(ART.prologue, ART_PATIENCE).then(() => {
        if (stale(tok)) return;
        openStory(pages, () => { save.flags.prologue = true; saveWrite(); enterRoom(target); });
      });
    } else {
      save.flags.prologue = true; saveWrite();
      enterRoom(target);
    }
  }

  /* Recall of the previous room (plus up to two older words that are due, src/lib/review.js), the chapter card, then the room
     itself. The room is already drawn behind the cards. Entering a room moves the review clock on by one. */
  async function enterRoom(i) {
    const tok = newToken();
    const lv = LEVELS[i];
    reviewAdvanceClock(save); saveWrite();
    playFlow.phase = 'intro';
    playFlow.tutoring = false;
    game.kbd.teach = null;
    clearInput();
    applySettings();
    game.state = 'title';
    /* The room's pictures (background, tiles, toys, memory, word icons) are asked for first and decode while the recall and chapter
       cards are up (PLAN-2 D4); the room is drawn behind the cards already, with its pictures placed at once (artPending). */
    const recall = i > 0 && typeof uxRecallWords === 'function' ? uxRecallWords(LEVELS[i - 1].words || [], lv.words || []) : [];
    const art = roomArt(lv, LINES, { wear: save.outfit, extraWords: recall, last: i === LEVELS.length - 1 });
    loadArt(art);
    game.load(i);
    handleEvents();
    /* a card that fails to open must not strand the child on a blank screen: treat it as already closed */
    const card = (fn, level, extra) => new Promise(/** @param {(done?: any) => void} ok */ ok => { try { fn(level, ok, extra); } catch (e) { console.error(e); ok(); } });
    if (i > 0 && typeof showRecall === 'function') await card(showRecall, LEVELS[i - 1], recall);
    if (stale(tok)) return;
    if (typeof showChapter === 'function') await card(showChapter, lv);
    if (stale(tok)) return;
    await loadArt(art, ART_PATIENCE);   // normally long done; on a slow network at most one patience more, never a stranded child
    if (stale(tok)) return;
    beginPlay(i, tok);
  }

  function beginPlay(i, tok) {
    applySettings();
    /* enterRoom already loaded this room (and drew it behind the cards): going live must not load it a second time */
    if (game.index === i) game.state = 'play'; else game.start(i);
    if (companion) companion.reset();
    handleEvents();
    Object.assign(inputSeen, { move: false, jump: false, magic: false });
    playFlow.phase = 'play';
    flashPlayerMark(3);
    if (typeof startMusic === 'function') guarded('startMusic', () => startMusic(LEVELS[i].music));
    roomIntro(i, tok);
  }
  /* The HUD's restart: the screen being played starts again (a room with several screens keeps what its earlier screens gave). */
  function restartRoom() {
    if (playFlow.phase !== 'play') return;
    clearInput();
    game.restart();
    if (companion) companion.reset();
    handleEvents();
    flashPlayerMark(2);
  }

  /* The start_<room>_<n> lines belong to talkOnEvents (50-talk plays them when the room goes live). Here: wait until she
     has finished talking, then (first room, first time) the keyboard lessons. The game is live meanwhile. */
  async function roomIntro(i, tok) {
    if (i === 0 && !save.flags.tutorial && !inputSeen.move) game.kbd.teach = 'r';   // light the walking arrow immediately so the child can move right away
    await sleep(900);
    let quiet = 0;
    for (let n = 0; n < 200 && quiet < 8 && !stale(tok); n++) {   // 8 x 150 ms of silence in a row, at most 30 s
      if (i === 0 && !save.flags.tutorial) {
        game.kbd.teach = !inputSeen.move ? 'r' : !inputSeen.jump ? 'up' : !inputSeen.magic ? 'space' : null;
      }
      quiet = typeof voice !== 'undefined' && voice && voice.busy ? 0 : quiet + 1;
      await sleep(150);
    }
    if (stale(tok)) return;
    if (i === 0 && !save.flags.tutorial) await runTutorial(tok);
  }

  /* PLAN A2: the companion teaches the keys one by one; the keyboard diagram lights the key being taught. */
  async function runTutorial(tok) {
    const kbd = game.kbd;
    const ask = async (key, teach, done, ms) => {
      if (stale(tok)) return false;
      if (done()) return true;   // already mastered while exploring during the room intro
      kbd.teach = teach;
      const spoke = vline(key);
      if (!hasLineKey(key)) await waitUntil(() => false, 1500, tok);
      await Promise.race([spoke, waitUntil(done, 12000, tok)]);   // the key may be pressed while she is still talking
      await waitUntil(done, ms, tok);
      return !stale(tok);
    };
    if (!save.flags.fullscreenTip) {
      await vline('tutor_fullscreen');
      save.flags.fullscreenTip = true; saveWrite();
    }
    /* the walking lesson alternates the two arrows */
    playFlow.tutoring = true;   // the guide hint stays quiet while the keys are being taught
    const blinker = setInterval(() => { if (kbd.teach === 'l' || kbd.teach === 'r') kbd.teach = kbd.teach === 'l' ? 'r' : 'l'; }, 900);
    try {
      if (!await ask('tutor_move', 'r', () => inputSeen.move, 10000)) return;
      if (!await ask('tutor_jump', 'up', () => inputSeen.jump, 10000)) return;
      if (!await ask('tutor_magic', 'space', () => inputSeen.magic, 10000)) return;
      save.flags.tutorial = true; saveWrite();
    } finally {
      clearInterval(blinker);
      playFlow.tutoring = false;
      kbd.teach = null;
    }
  }

  /* The logic said 'clear': let the sisters cheer, record the stars, show the clear page, then on to the next room. */
  async function onRoomClear() {
    if (playFlow.phase !== 'play') return;
    const tok = newToken();   // everything started in this room (tutorial lines, the room intro) is stale from here on
    playFlow.phase = 'clear';
    game.kbd.teach = null;
    clearInput();
    const i = game.index, lv = LEVELS[i];
    const smalls = game.stars || { total: 0, got: 0 };
    markRoom(lv.id, { cleared: true, memory: !!game.memoryFound, stars: [true, !!game.memoryFound, smalls.total > 0 && smalls.got >= smalls.total] });
    await sleep(1500);
    if (stale(tok)) return;
    const next = () => {
      if (stale(tok)) return;
      if (i + 1 < LEVELS.length) enterRoom(i + 1); else finishGame();
    };
    if (typeof showClear === 'function') { try { showClear(lv, next); } catch (e) { console.error(e); next(); } } else next();
  }

  async function finishGame() {
    const tok = newToken();
    playFlow.phase = 'win';
    game.state = 'win';
    cheerBurst();
    if (typeof startMusic === 'function') guarded('startMusic', () => startMusic('end'));
    const art = loadArt(ART.ending, ART_PATIENCE);
    await sleep(2600);
    await art;
    if (stale(tok)) return;
    const pages = storyPages(['win', 'end']);
    const afterStory = () => { if (typeof showFinale === 'function') showFinale(goTitle); else goTitle(); };
    if (pages.length && typeof openStory === 'function') openStory(pages, afterStory); else afterStory();
  }

  /* ---- frame loop ---- */
  /* Play time for the parent page (PLAN-2 C5), in whole seconds. It runs while a room or a lesson is open: not on the title screens,
     not under the parent settings. `dt` is capped per frame, so a hidden tab adds almost nothing. */
  let playClock = 0;
  function countPlayTime(dt) {
    if (playFlow.phase === 'boot' || uxState.modal || (playFlow.phase === 'title' && !storyIsOpen())) return;
    playClock += dt;
    if (playClock < 1) return;
    const whole = Math.floor(playClock);
    playClock -= whole;
    save.totalPlaySeconds = (save.totalPlaySeconds || 0) + whole;
    saveSoon();
  }

  let last = 0, acc = 0;
  function frame(ms) {
    try {
      const dt = Math.min(.05, (ms - last) / 1000 || 0);
      last = ms;
      const now = ms / 1000;
      pollGamepad();
      countPlayTime(dt);
      const live = canPlay();
      if (live) {
        acc += dt;
        syncInput();
        while (acc >= STEP && game.state === 'play') {
          if (game.mode === 'solo' && companion) companion.update(STEP);
          game.step(STEP);
          acc -= STEP;
        }
        if (game.state !== 'play') acc = 0;
      } else { acc = 0; syncInput(); }
      handleEvents();
      drawSister('frost', now, dt);
      drawSister('nuan', now, dt);
      drawDuoTouchMark(now);
      const n = game.sisters.nuan, fr = game.sisters.frost;
      lanternGlow.setAttribute('cx', (n.x + n.w / 2 + n.dir * 6).toFixed(1));
      lanternGlow.setAttribute('cy', (n.y + n.h - 26).toFixed(1));
      lanternGlow.setAttribute('visibility', n.splash > 0 ? 'hidden' : 'visible');
      lanternGlow.setAttribute('opacity', (.72 + Math.sin(now * 7) * .08).toFixed(2));
      frostGlow.setAttribute('cx', (fr.x + fr.w / 2).toFixed(1));
      frostGlow.setAttribute('cy', (fr.y + fr.h - 34).toFixed(1));
      frostGlow.setAttribute('visibility', fr.splash > 0 ? 'hidden' : 'visible');
      drawItemBob(now);
      drawFishFrame(now, dt);
      if (typeof updateAmbient === 'function') updateAmbient(now, dt);
      if (typeof updateToys === 'function') guarded('toys', () => updateToys(dt, now));   // 15-toys (+ 75-rewards tick)
      updateFragment(now);
      fxFrame(dt, now, live);
      if (typeof hud === 'function') guarded('hud', () => hud(game));
    } catch (e) {
      if (!reported.has('frame' + e.message)) { reported.add('frame' + e.message); console.error('[frame]', e); }
    }
    requestAnimationFrame(frame);
  }

  /* Fit the stage first so Retina / fullscreen displays (hd.on) request game/hd/ directly in a single pass, then decode the title set. */
  fitStage();
  const ART = assetPlan(LEVELS, LINES, { wear: save.outfit });
  const titleLoad = loadArt(ART.title, ART_PATIENCE);

  if (DEV) {
    window.__dbg = { voice: typeof voice !== "undefined" ? voice : null, game, save, heardLog, playFlow, companion, guideFx, startGame, enterRoom, goTitle, inputSeen, saveWrite, markRoom, artStats, loadArt, ART, tyStats: typeof tyStats !== 'undefined' ? tyStats : null };
    try {
      const qa = /[?&]qa=([a-z]+)\b/.exec(location.search || '');
      if (qa) {
        save.unlocked.rooms = LEVELS.length;
        save.flags.prologue = true;
        for (const lv of LEVELS) {
          save.rooms[lv.id] = { cleared: true, memory: true, stars: [true, true, true] };
          for (const w of lv.words || []) save.words[w] = { heard: 8, quiz: 1, seen: true, lastSeen: 1 };
        }
        if (typeof awardStickers === 'function') awardStickers(null, true);
        if (qa[1] === 'win') {
          save.outfit.frost = { dress: 2, hat: 'crown' };
          save.outfit.nuan = { dress: 1, hat: 'wreath' };
          setTimeout(() => finishGame(), 400);
        }
      }
    } catch (e) {}
  }

  applySettings();
  game.load(0);
  handleEvents();
  game.state = 'title';
  playFlow.phase = 'title';
  if (typeof showTitle === 'function') showTitle();
  titleLoad.finally(() => { fitStage(); requestAnimationFrame(frame); });

  /* PLAN-2 D5: the offline worker (sw.js, generated by art/build_page.py). Not for ?dev=1, not from file://, not where the browser has none. */
  if (offlineWorkerAllowed(location.search, location.protocol, typeof navigator !== 'undefined' && 'serviceWorker' in navigator)) {
    const register = () => navigator.serviceWorker.register('sw.js').catch(e => console.warn('offline worker:', e && e.message));
    if (document.readyState === 'complete') register(); else addEventListener('load', register);
  }
