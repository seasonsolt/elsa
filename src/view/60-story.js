  /* ===== d1 / view-ui: story pages and the blocking scenes (chapter card, recall, clear page + quiz, ending) =====
     Every scene is picture + voice. `story` stays truthy while a blocking scene is open, so the main loop can keep the game
     paused exactly like before. Helpers (uxButton, uxWordCard, ...) live in 70-ui.js and are only called at run time. */
  let story = null;

  /* The prologue: 3 pages, picture + one line from Anna each (lines p1..p3 name their art in lines.json). */
  const PROLOGUE = [
    { vo: 'p1', get art() { return uxLineArt('p1', 'story_prologue'); } },
    { vo: 'p2', get art() { return uxLineArt('p2', 'story_winter'); } },
    { vo: 'p3', get art() { return uxLineArt('p3', 'key'); } },
  ];

  /* Keys while a scene is open: game keys never leak through. Plain story pages (prologue, memories, ending) advance on
     Space / Enter / Escape. The learning scenes (chapter card, recall, clear page + quiz) are `strict`: a child mashing the
     magic key must not skip them, so only on-screen buttons and Enter act, nothing reacts in the first second after the
     scene opens, and the quiz skip is a button only. */
  const STORY_QUIET_MS = 1000;
  /* What a key does while `scene` is open: 'pass' (a focused button takes it), 'advance' (the scene's main action) or 'swallow'. */
  function storyKeyAction(scene, code, repeat, now, onBtn) {
    const enter = code === 'Enter' || code === 'NumpadEnter';
    if (scene && scene.strict) {
      if (now - scene.openedAt < STORY_QUIET_MS || !enter) return 'swallow';
      if (onBtn) return 'pass';
      return repeat ? 'swallow' : 'advance';
    }
    const activate = enter || code === 'Space';
    if (onBtn && activate) return 'pass';
    if (activate || code === 'Escape') return repeat ? 'swallow' : 'advance';
    return 'swallow';
  }
  /* A scene that only the on-screen buttons and Enter may move. */
  function storyStrict(s) { s.strict = true; s.openedAt = performance.now(); return s; }
  /* The gamepad (80-input) moves a focus ring over the on-screen buttons and A presses the focused one, which is a button press
     like a click. A learning scene still ignores the pad in its quiet first second, and a pad press with no ring on screen only
     places the ring, so mashing A never skips a lesson. */
  function storyAcceptsPad(now) { return !story || !story.strict || now - story.openedAt >= STORY_QUIET_MS; }

  addEventListener('keydown', e => {
    const modal = uxState.modal;
    if (!modal && !story) return;
    uxWake();
    const t = /** @type {HTMLElement | null} */ (e.target), onBtn = t && t.classList && t.classList.contains && (t.classList.contains('ux-btn') || t.classList.contains('ux-card') || t.classList.contains('ux-tile'));
    if (modal) {
      if (e.code === 'Escape') { e.preventDefault(); $('modal').textContent = ''; uxState.modal = null; }
      else if (!onBtn && e.code !== 'F11' && !e.metaKey && !e.ctrlKey) e.stopImmediatePropagation();
      return;
    }
    const action = storyKeyAction(story, e.code, e.repeat, performance.now(), onBtn);
    if (action === 'pass') return;
    const activating = ['Enter', 'NumpadEnter', 'Space', 'Escape'].includes(e.code);
    if (!activating && (e.metaKey || e.ctrlKey || e.code === 'F11')) return;
    if (activating) e.preventDefault();
    e.stopImmediatePropagation();
    if (action === 'advance' && story.onKey) story.onKey();
  }, true);

  /* ---------- story pages ---------- */
  /* pages: [{ art, vo }] (art: image name, vo: voice line key). Older fields (title, lines, next) are ignored: no reading. */
  function openStory(pages, done) {
    const s = uxScreen('story', true);
    s.pages = pages; s.i = 0; s.done = done; s.onKey = () => uxStoryNext(s);
    uxInputReset();
    renderStory();
  }
  /* The funnel for touch and gamepad presses (80-input): strict scenes ignore a plain call, a jump or magic tap must not skip a
     lesson. `enterLike` (the gamepad's Start button, the same deliberate press as Enter) moves them after the quiet second. */
  function advanceStory(enterLike) {
    if (!story || !story.onKey) return;
    if (story.strict && !(enterLike === true && performance.now() - story.openedAt >= STORY_QUIET_MS)) return;
    story.onKey();
  }
  function uxStoryNext(s) {
    if (!uxAlive(s)) return;
    uxStopVoice();
    s.i++;
    if (s.i < s.pages.length) { renderStory(); return; }
    uxEnd(s, s.done);
  }
  function uxEnd(s, done) {
    if (!uxAlive(s)) return;
    uxState.tok = null; story = null;
    uxStopVoice();
    $('overlay').textContent = '';
    if (done) done();
  }
  function renderStory() {
    const s = story;
    if (!s || s.name !== 'story') return;
    const p = s.pages[s.i], n = s.pages.length, me = s.i;
    const art = p.art || (p.vo && uxLineArt(p.vo));
    const dots = n > 1 ? s.pages.map((_, k) => `<circle cx="${480 + (k - (n - 1) / 2) * 18}" cy="492" r="${k === me ? 6 : 4.5}" fill="${k === me ? '#ffd27a' : '#8090d6'}"/>`).join('') : '';
    const root = uxPaint(`<g class="page">
      ${art ? `<image href="${SRC(art)}" width="960" height="520" preserveAspectRatio="xMidYMid slice"/>` : '<rect width="960" height="520" fill="#141c52"/>'}
      <rect y="360" width="960" height="160" fill="url(#bottomFade)"/>${dots}
      ${uxButton({ act: 'next', ui: 'next', icon: 'next', x: 880, y: 456, r: 38, plate: 'gold' })}</g>`);
    uxBind(root, { next: () => uxStoryNext(s) });
    if (p.vo) uxLine(p.vo).then(() => { if (uxAlive(s) && s.i === me) { const b = root.querySelector('[data-act="next"]'); if (b) b.classList.add('ux-pulse'); } });
    else root.querySelector('[data-act="next"]').classList.add('ux-pulse');
  }

  /* ---------- chapter card ---------- */
  function uxCardRow(words, y, w, h, gap, extra) {
    const n = words.length, x0 = (960 - (n * w + (n - 1) * gap)) / 2;
    return words.map((wd, k) => uxWordCard(wd, Object.assign({ x: x0 + k * (w + gap), y, w, h, slot: k }, extra && extra(wd, k)))).join('');
  }
  const uxPopSlot = (root, k) => { const n = root.querySelector(`[data-pop="${k}"]`); if (n) n.classList.add('show'); return n; };

  /* Room picture, one sentence from Anna, then the 3 words pop up one by one: "this level we look for heart", "say it", 1.5 s ear/mouth pause. */
  function showChapter(level, done) {
    const lv = uxLevel(level), words = uxRoomWords(lv), s = storyStrict(uxScreen('chapter', true));
    uxInputReset();
    /* the clear page of this room comes next: have its sentence, the quiz questions and the answers warm in the cache */
    uxPreload([uxKey('clear', lv.id), ...words.map(w => uxKey('quiz', w.id)), ...words.map(w => uxKey('word', w.id)), 'quiz_right_1', 'quiz_right_2', 'quiz_right_3', 'quiz_wrong_1', 'quiz_wrong_2', 'quiz_wrong_3']);
    const n = words.length, cw = 190, gap = 26, x0 = (960 - (n * cw + (n - 1) * gap)) / 2;
    const root = uxPaint(`<g class="page"><image href="${SRC(uxLineArt('ch_' + lv.id, lv.bg))}" width="960" height="520" preserveAspectRatio="xMidYMid slice"/>
      <rect y="220" width="960" height="300" fill="url(#bottomFade)"/>
      ${uxCardRow(words, 296, cw, 190, gap)}
      <g id="uxCue" opacity="0" class="ux-soft"><g id="uxEar">${uxIcon('ear', 30)}</g><g id="uxMouth" visibility="hidden" class="ux-bounce"><circle class="ux-ripple" r="28" fill="none" stroke="#ffd27a" stroke-width="3.5"/><circle class="ux-ripple ux-ripple2" r="28" fill="none" stroke="#fff3c9" stroke-width="2.5"/>${uxIcon('mouth', 30)}</g></g>
      ${uxButton({ act: 'go', ui: 'next', icon: 'next', x: 886, y: 452, r: 38, plate: 'gold' })}</g>`);
    const finish = () => uxEnd(s, done);
    s.onKey = finish;
    uxBind(root, { go: finish, word: el => { uxNudge(el); uxWordVoice(el.dataset.word); } });
    const cue = root.querySelector('#uxCue'), ear = root.querySelector('#uxEar'), mouth = root.querySelector('#uxMouth');
    const setCue = (k, kind) => {
      cue.setAttribute('transform', `translate(${x0 + k * (cw + gap) + cw / 2} 262)`);
      cue.setAttribute('opacity', kind ? '1' : '0');
      ear.setAttribute('visibility', kind === 'ear' ? 'visible' : 'hidden');
      mouth.setAttribute('visibility', kind === 'mouth' ? 'visible' : 'hidden');
    };
    (async () => {
      await uxLine('ch_' + lv.id);
      for (let k = 0; k < n; k++) {
        if (!uxAlive(s)) return;
        uxPopSlot(root, k); uxSfx('page'); setCue(k, 'ear');
        await uxLine('learn_' + words[k].id);
        if (!uxAlive(s)) return;
        setCue(k, 'mouth');
        await uxWait(1500);
        if (!uxAlive(s)) return;
        uxSfx('star');
        uxConfetti(root.querySelector('.page'), x0 + k * (cw + gap) + cw / 2, 262, 8);
        setCue(k, null);
        await uxWait(250);
      }
      if (!uxAlive(s)) return;
      const b = root.querySelector('[data-act="go"]'); if (b) b.classList.add('ux-pulse');
    })();
  }

  /* ---------- recall (start of the next room) ---------- */
  /* The words of the room just left, then up to two older ones that are due for review (90-main builds `ids` with recallWordsFor;
     without `ids` it is just that room's words). An older word counts as reviewed once its line has been said, which keeps it
     out of the next recall. The room's own words are not marked: their recap is not a spaced review (src/lib/review.js). */
  function showRecall(prevLevel, done, ids) {
    const lv = prevLevel == null ? null : uxLevel(prevLevel), own = lv ? lv.words || [] : [];
    const words = uxWordList(Array.isArray(ids) ? ids : own);
    if (!lv || !words.length) { if (done) done(); return; }
    const s = storyStrict(uxScreen('recall', true));
    uxInputReset();
    const older = recallOlderIds(own, words.map(w => w.id));
    uxPreload(words.map(w => uxKey('recall', w.id)));
    const wide = words.length > 3;   // up to five cards: smaller, so the row still fits the page
    const root = uxPaint(`<g class="page"><image href="${SRC(lv.bg)}" width="960" height="520" preserveAspectRatio="xMidYMid slice"/><rect width="960" height="520" fill="#0d1438" opacity=".5"/>
      ${wide ? uxCardRow(words, 150, 156, 196, 16) : uxCardRow(words, 140, 200, 230, 30)}
      ${uxButton({ act: 'skip', ui: 'next', icon: 'next', x: 886, y: 452, r: 34 })}</g>`);
    const finish = () => uxEnd(s, done);
    s.onKey = finish;
    uxBind(root, { skip: finish, word: el => { uxNudge(el); uxWordVoice(el.dataset.word); } });
    (async () => {
      for (let k = 0; k < words.length; k++) {
        if (!uxAlive(s)) return;
        uxPopSlot(root, k); uxSfx('page');
        await uxLine('recall_' + words[k].id);
        if (!uxAlive(s)) return;
        if (older.includes(words[k].id)) uxNoteReviewed(words[k].id);
        await uxWait(200);
      }
      await uxWait(500);
      finish();
    })();
  }

  /* ---------- clear page: stars, word cards, quiz ---------- */
  const UX_STAR_D = 'M0 -.8L.22 -.25L.8 -.22L.35 .15L.5 .72L0 .4L-.5 .72L-.35 .15L-.8 -.22L-.22 -.25Z';
  function uxStarsHtml(got) {
    const icon = [
      uxPic('door_open', -22, -34, 44, 68, `<rect x="-18" y="-30" width="36" height="60" rx="10" fill="#9fd6ff"/>`),
      uxPic('fx_glow', -34, -32, 68, 60, `<circle r="26" fill="#ffd27a" opacity=".6"/>`),
      uxPic('fx_star', -22, -22, 44, 44, `<g transform="scale(20)"><path d="${UX_STAR_D}" fill="#ffd27a"/></g>`),
    ];
    return got.map((g, k) => `<g transform="translate(${(k - 1) * 138} 0)"><g class="ux-pop" data-pop="s${k}">
      ${g ? '<circle r="62" fill="#fff0b8" opacity=".3"/>' : ''}
      <path d="${UX_STAR_D}" transform="scale(58)" fill="${g ? 'url(#goldGrad)' : '#1d2766'}" stroke="${g ? '#fff3c9' : '#5a6fca'}" stroke-width=".06" stroke-linejoin="round" opacity="${g ? 1 : .8}"/>
      <g transform="translate(0 78)" opacity="${g ? 1 : .35}">${icon[k]}</g></g></g>`).join('');
  }

  function showClear(level, done) {
    const lv = uxLevel(level), idx = uxLevelIndex(lv), words = uxRoomWords(lv), s = storyStrict(uxScreen('clear', true));
    uxInputReset();
    /* the next room opens with the recall of these words, then its chapter card: warm those lines while this page is up */
    const nextLv = LEVELS[idx + 1];
    if (nextLv) uxPreload([...words.map(w => uxKey('recall', w.id)), uxKey('ch', nextLv.id), ...uxRoomWords(nextLv).map(w => uxKey('learn', w.id))]);
    const g = game, memory = !!g.memoryFound;
    const small = !g.stars || g.stars.total === 0 ? true : g.stars.got >= g.stars.total;
    const got = [true, memory, small];   // 90-main has already stored these with markRoom()
    s.phase = 0; s.seq = 0;

    uxPaint(`<g class="page"><image id="uxBg" href="${SRC(uxLineArt('clear_' + lv.id, lv.bg))}" width="960" height="520" preserveAspectRatio="xMidYMid slice"/>
      <rect width="960" height="520" fill="#0d1438" opacity=".55"/>
      <g id="uxStars" class="ux-star" style="transform:translate(480px,170px) scale(1)">${uxStarsHtml(got)}</g>
      <g id="uxBody"></g><g id="uxCtl"></g></g>`);
    const root = $('overlay'), body = root.querySelector('#uxBody'), ctl = root.querySelector('#uxCtl'), stars = /** @type {HTMLElement} */ (root.querySelector('#uxStars'));
    const word = el => { uxNudge(el); uxWordVoice(el.dataset.word); };
    const mark = () => { const me = ++s.seq; return () => uxAlive(s) && s.seq === me; };
    const setCtl = html => { ctl.innerHTML = html; uxBind(ctl, { next: () => s.onKey && s.onKey(), skip: () => finishPage(), replay: () => { if (uxAlive(s)) { uxEnd(s, null); uxHooks.replay(idx); } }, done: () => uxEnd(s, done) }); };
    const nextBtn = (act, ui) => uxButton({ act, ui, icon: 'next', x: 886, y: 452, r: 38, plate: 'gold' });

    /* A: stars pop, Anna's sentence */
    const phaseStars = () => {
      s.phase = 1; const ok = mark();
      s.onKey = () => { if (ok()) phaseWords(); };
      setCtl(nextBtn('next', 'next'));
      (async () => {
        const line = uxLine('clear_' + lv.id);
        for (let k = 0; k < 3; k++) {
          await uxWait(k ? 650 : 350);
          if (!ok()) return;
          uxPopSlot(root, 's' + k);
          if (got[k]) { uxSfx('star'); uxConfetti(root.querySelector('.page'), 480 + (k - 1) * 138, 170, 14); }
        }
        await line;
        await uxWait(500);
        if (ok()) phaseWords();
      })();
    };

    /* B: word cards, each said once; sparkle badge (no text) the first time. The next button shows as soon as all three have
       been said. Nothing is repeated to pad a count: the words come back in later recalls, quizzes and the review game. */
    const phaseWords = () => {
      s.phase = 2; const ok = mark();
      let ready = false;
      stars.style.transform = 'translate(480px,52px) scale(.42)';
      s.onKey = () => { if (ok() && ready) { uxStopVoice(); phaseQuiz(); } };
      const rec = words.map(w => uxWordRec(w.id));
      const isNew = rec.map(r => !r.seen);
      body.innerHTML = uxCardRow(words, 128, 200, 238, 30, (wd, k) => ({ isNew: isNew[k] }));
      uxBind(body, { word });
      setCtl('');
      (async () => {
        await uxWait(300);
        for (let k = 0; k < words.length; k++) {
          if (!ok()) return;
          uxPopSlot(root, k); uxSfx('page');
          rec[k].seen = true;
          await uxWordVoice(words[k].id);
          await uxWait(200);
        }
        if (!ok()) return;
        uxSaveNow();
        ready = true; setCtl(nextBtn('next', 'next')); ctl.querySelector('[data-act="next"]').classList.add('ux-pulse');
      })();
    };

    /* C: quiz, 3 big picture cards, spoken question, skippable. The wrong answers come from rooms already cleared, and every
       answer is stored as it is given (storyQuestion), so skipping or leaving half way loses nothing. */
    const phaseQuiz = () => {
      s.phase = 3; const ok = mark();
      s.onKey = null;   // the quiz has no keyboard way out: skip is the on-screen button only
      if (!words.length) { finishPage(); return; }
      const ids = words.map(w => w.id), rng = storyRng(), order = storyShuffle(words, rng), pool = uxQuizPool(lv);
      (async () => {
        for (let q = 0; q < order.length; q++) {
          if (!ok()) return;
          setCtl(uxButton({ act: 'skip', ui: 'quiz_skip', icon: 'next', x: 886, y: 452, r: 34 }));
          await storyQuestion(ok, body, order[q], quizOptions(order[q].id, ids, pool, save.words, rng), q, order.length);
          await uxWait(600);
        }
        if (ok()) { uxSaveNow(); finishPage(); }
      })();
    };

    /* D: done. Next is the big button; replay is the small one. */
    function finishPage() {
      if (!uxAlive(s)) return;
      s.phase = 4; ++s.seq;
      uxStopVoice();
      stars.style.transform = 'translate(480px,150px) scale(.8)';
      body.innerHTML = '';
      s.onKey = () => uxEnd(s, done);
      setCtl(uxButton({ act: 'done', ui: 'next', icon: 'next', x: 600, y: 360, r: 56, plate: 'gold', cls: 'ux-pulse' }) + uxButton({ act: 'replay', ui: 'replay', x: 360, y: 360, r: 42 }));
      uxLine('cheer_' + (1 + Math.floor(Math.random() * 4)));
      uxConfetti(root.querySelector('.page'), 480, 150, 24);
    }
    phaseStars();
  }

  /* ---------- questions: "which picture is it?", for the clear-page quiz and the wordbook's review game ---------- */
  /* Randomness comes from a seeded generator (src/lib/review.js), seeded from the save's room clock and a counter, never from the
     time of day: the same save asked the same way gives the same questions. */
  let storyDraws = 0;
  function storyRng() { return makeReviewRng(((save.roomClock || 0) * 7919 + ++storyDraws * 104729) >>> 0); }
  /* Fisher-Yates on a copy. */
  function storyShuffle(list, rng) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.min(i, Math.floor(rng() * (i + 1)));
      const t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out;
  }

  /* One question: the picture cards pop up, Anna asks for `target` (quiz_<word>), and it ends when the child taps that card and
     the cheer has been said. A first wrong tap is stored at once as a miss; a right tap with no miss before it is stored at once
     as a first-try answer. Either way one answer per question, saved before the next question starts (uxNoteQuiz).
     target: the word asked for; ids: the word ids shown (3). q / total: the question number, for the dots and the cheer. */
  function storyQuestion(ok, body, target, ids, q, total) {
    const dots = Array.from({ length: total }, (_, k) => `<circle cx="${480 + (k - (total - 1) / 2) * 22}" cy="${112}" r="7" fill="${k < q ? '#ffd27a' : k === q ? '#fff' : '#5a6fca'}"/>`).join('');
    body.innerHTML = dots + uxCardRow(uxWordList(ids), 150, 210, 210, 28, () => ({ label: false, act: 'pick', show: false }));
    let wrong = 0, solved = false;
    /** @type {(value?: any) => void} */ let resolve = () => {};
    const result = new Promise(r => { resolve = r; });
    uxBind(body, {
      pick: el => {
        if (!ok() || solved) return;
        if (el.dataset.word === target.id) {
          solved = true;
          uxSfx('quiz_right'); uxConfetti(body, 480, 250, 36);
          if (!wrong) uxNoteQuiz(target.id, true);
          body.querySelectorAll('.ux-glowrect').forEach(n => { n.classList.remove('ux-glow'); n.setAttribute('opacity', '0'); });
          uxLine('quiz_right_' + (1 + q % 3), { interrupt: true }).then(() => resolve());
        } else {
          if (!wrong) uxNoteQuiz(target.id, false);
          wrong++; uxSfx('quiz_wrong');
          el.classList.remove('ux-shake'); void el.getBoundingClientRect(); el.classList.add('ux-shake');
          const right = body.querySelector(`[data-word="${target.id}"] .ux-glowrect`);
          if (right) right.classList.add('ux-glow');
          uxLine('quiz_wrong_' + (1 + (wrong - 1) % 3), { interrupt: true });
        }
      },
    });
    [0, 1, 2].forEach(k => { const n = body.querySelectorAll('[data-pop]')[k]; if (n) setTimeout(() => n.classList.add('show'), 80 * k); });
    uxLine('quiz_' + target.id);
    return result;
  }

  /* ---------- review game (wordbook): Anna says a word, the child taps its picture; 5 questions ---------- */
  const REVIEW_QUESTIONS = 5;
  /* done() runs when the child leaves. The questions are the words most in need of review (uxReviewQueue); the cards are the same
     as in the quiz, and each answer is stored the same way, so a missed word comes back sooner. */
  function showReview(done) {
    const queue = uxReviewQueue(REVIEW_QUESTIONS), pool = uxReviewPool();
    if (pool.length < 3 || !queue.length) { if (done) done(); return; }
    const s = storyStrict(uxScreen('review', true));
    uxInputReset();
    uxPreload([...queue.map(id => uxKey('quiz', id)), 'quiz_right_1', 'quiz_right_2', 'quiz_right_3', 'quiz_wrong_1', 'quiz_wrong_2', 'quiz_wrong_3']);
    uxPaint(`<g class="page"><image href="${SRC('bg0')}" width="960" height="520" preserveAspectRatio="xMidYMid slice"/><rect width="960" height="520" fill="#0d1438" opacity=".6"/>
      <g id="uxBody"></g><g id="uxCtl"></g></g>`);
    const root = $('overlay'), body = root.querySelector('#uxBody'), ctl = root.querySelector('#uxCtl');
    const setCtl = html => { ctl.innerHTML = html; uxBind(ctl, { back: () => uxEnd(s, done), done: () => uxEnd(s, done), replay: () => { if (uxAlive(s)) { uxEnd(s, null); showReview(done); } } }); };
    const rng = storyRng(), ok = () => uxAlive(s);
    (async () => {
      for (let q = 0; q < queue.length; q++) {
        if (!ok()) return;
        const target = uxWord(queue[q]), room = LEVELS.find(lv => (lv.words || []).includes(target.id)), roomIds = room ? room.words || [] : [];
        setCtl(uxButton({ act: 'back', ui: 'back', x: 52, y: 44, r: 34 }));
        const shown = quizOptions(target.id, reviewLearned(save.words, roomIds), pool.filter(id => !roomIds.includes(id)), save.words, rng);
        await storyQuestion(ok, body, target, shown, q, queue.length);
        await uxWait(600);
      }
      if (!uxAlive(s)) return;
      uxSaveNow();
      uxStopVoice();
      s.onKey = () => uxEnd(s, done);
      body.innerHTML = '';
      setCtl(uxButton({ act: 'done', ui: 'next', icon: 'next', x: 600, y: 300, r: 56, plate: 'gold', cls: 'ux-pulse' }) + uxButton({ act: 'replay', ui: 'replay', x: 360, y: 300, r: 42 }));
      uxLine('cheer_' + (1 + (storyDraws % 4)));
      uxConfetti(root.querySelector('.page'), 480, 200, 24);
    })();
  }

  /* ---------- grand finale keepsake album: spring petals, dressed-up sisters & visual adventure badges ---------- */
  function showFinale(done) {
    const s = uxScreen('finale', true);
    uxInputReset();
    const finish = () => uxEnd(s, done);
    s.onKey = finish;
    let totalStars = 0;
    for (const lv of LEVELS) {
      const r = save.rooms && save.rooms[lv.id];
      if (r && Array.isArray(r.stars)) totalStars += r.stars.filter(Boolean).length;
    }
    const stickerCount = Array.isArray(save.stickers) ? save.stickers.length : 0;
    const wordCount = Object.values(save.words || {}).filter(w => w && ((w.heard || 0) > 0 || w.seen)).length;
    const badge = (cx, cy, iconHtml, num) => `<g transform="translate(${cx} ${cy})">
      <rect x="-78" y="-26" width="156" height="52" rx="26" fill="#141c52" opacity=".86" stroke="#ffd27a" stroke-width="2.5"/>
      <g transform="translate(-44 0)">${iconHtml}</g>
      <text class="latin" x="16" y="8" text-anchor="middle" font-size="25" fill="#fff3c9">${num}</text></g>`;
    const petals = Array.from({ length: 18 }, (_, i) => {
      const px = 45 + ((i * 53) % 870), delay = -(i * .37).toFixed(2), col = ['#ffc2d9', '#ffe699', '#d8c2ff', '#ffd6b0'][i % 4];
      return `<g transform="translate(${px} 0)"><ellipse class="fin-petal" rx="${6 + (i % 3) * 2}" ry="${3.5 + (i % 2) * 1.5}" fill="${col}" style="animation-delay:${delay}s"/></g>`;
    }).join('');
    if (typeof loadArt === 'function') loadArt(['bg_garden']);
    const root = uxPaint(`<g class="page">
      <image href="${SRC('bg_garden')}" width="960" height="520" preserveAspectRatio="xMidYMid slice"/>
      <rect width="960" height="520" fill="#0d1438" opacity=".38"/>
      <g pointer-events="none">${petals}</g>
      <rect x="210" y="38" width="540" height="316" rx="34" fill="#fffaf0" stroke="#ffd27a" stroke-width="5" filter="url(#softShadow)"/>
      <rect x="224" y="52" width="512" height="288" rx="24" fill="#27357f" opacity=".12" stroke="#d9c69e" stroke-width="2"/>
      <circle cx="385" cy="195" r="95" fill="url(#cool)"/><circle cx="575" cy="200" r="90" fill="url(#warm)"/>
      <g id="finFrost" transform="translate(385 322) scale(2.45)"></g>
      <g id="finNuan" transform="translate(575 322) scale(-2.45 2.45)"></g>
      ${badge(284, 396, uxPic('fx_star', -18, -18, 36, 36, `<path d="${UX_STAR_D}" transform="scale(18)" fill="#ffd27a"/>`), `${totalStars}/${LEVELS.length * 3}`)}
      ${badge(480, 396, uxIcon('sticker', 20, '#ffd27a'), String(stickerCount))}
      ${badge(676, 396, uxIcon('book', 20, '#cfe6ff'), String(wordCount))}
      ${uxButton({ act: 'wardrobe', ui: 'wardrobe', icon: 'wardrobe', x: 356, y: 468, r: 34 })}
      ${uxButton({ act: 'stickers', ui: 'stickers', icon: 'sticker', x: 452, y: 468, r: 34 })}
      ${uxButton({ act: 'done', ui: 'back', icon: 'home', x: 584, y: 464, r: 42, plate: 'gold', cls: 'ux-pulse' })}</g>`);
    [['frost', '#finFrost'], ['nuan', '#finNuan']].forEach(([who, sel]) => {
      const box = root.querySelector(sel);
      if (!box || typeof SIZES === 'undefined') return;
      const o = (save.outfit && save.outfit[who]) || { dress: 0, hat: null };
      const k = o.dress && typeof rwDressReady === 'function' && rwDressReady(who, o.dress) ? o.dress : 0;
      const fname = k ? `${who}_cheer_d${k}` : `${who}_cheer`;
      const sz = SIZES[`${who}_cheer`] || [80, 168, 40];
      if (typeof img === 'function' && typeof SPRITE === 'number') {
        img(fname, -sz[2] * SPRITE, 3 - sz[1] * SPRITE, sz[0] * SPRITE, sz[1] * SPRITE, box);
        if (typeof rwPlaceHat === 'function') rwPlaceHat(box, who, 'cheer', o.hat);
      }
    });
    uxBind(root, {
      done: finish,
      wardrobe: () => { uxEnd(s, null); if (typeof showWardrobe === 'function') showWardrobe(false); else finish(); },
      stickers: () => { uxEnd(s, null); if (typeof showStickers === 'function') showStickers(); else finish(); },
    });
    uxSfx('unlock');
    uxConfetti(root.querySelector('.page'), 480, 180, 36);
    uxLine('cheer_' + (1 + (storyDraws % 4)));
  }
