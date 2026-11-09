  /* ===== d1 / view-ui: story pages and the blocking scenes (chapter card, recall, clear page + quiz, ending) =====
     Every scene is picture + voice. `story` stays truthy while a blocking scene is open, so the main loop can keep the game
     paused exactly like before. Helpers (uxButton, uxWordCard, ...) live in 70-ui.js and are only called at run time. */
  let story = null;

  /* The prologue: 3 pages, picture + one narrator line each (lines p1..p3 name their art in lines.json). */
  const PROLOGUE = [
    { vo: 'p1', get art() { return uxLineArt('p1', 'story_prologue'); } },
    { vo: 'p2', get art() { return uxLineArt('p2', 'story_winter'); } },
    { vo: 'p3', get art() { return uxLineArt('p3', 'key'); } },
  ];

  /* Keys while a scene is open: Space / Enter / Escape do the scene's main action; game keys never leak through. */
  addEventListener('keydown', e => {
    const modal = uxState.modal;
    if (!modal && !story) return;
    uxWake();
    const t = e.target, onBtn = t && t.classList && t.classList.contains && (t.classList.contains('ux-btn') || t.classList.contains('ux-card') || t.classList.contains('ux-tile'));
    if (modal) {
      if (e.code === 'Escape') { e.preventDefault(); $('modal').textContent = ''; uxState.modal = null; }
      else if (!onBtn && e.code !== 'F11' && !e.metaKey && !e.ctrlKey) e.stopImmediatePropagation();
      return;
    }
    if (onBtn && (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter')) return;
    if (['Enter', 'NumpadEnter', 'Space', 'Escape'].includes(e.code)) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (!e.repeat) advanceStory();
    } else if (!e.metaKey && !e.ctrlKey && e.code !== 'F11') e.stopImmediatePropagation();
  }, true);

  /* ---------- story pages ---------- */
  /* pages: [{ art, vo }] (art: image name, vo: voice line key). Older fields (title, lines, next) are ignored: no reading. */
  function openStory(pages, done) {
    const s = uxScreen('story', true);
    s.pages = pages; s.i = 0; s.done = done; s.onKey = () => uxStoryNext(s);
    uxInputReset();
    renderStory();
  }
  function advanceStory() { if (story && story.onKey) story.onKey(); }
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

  /* Room picture, one narrator sentence, then the 3 words pop up one by one: "this level we look for heart", "say it", 1.5 s ear/mouth pause. */
  function showChapter(level, done) {
    const lv = uxLevel(level), words = uxRoomWords(lv), s = uxScreen('chapter', true);
    uxInputReset();
    const n = words.length, cw = 190, gap = 26, x0 = (960 - (n * cw + (n - 1) * gap)) / 2;
    const root = uxPaint(`<g class="page"><image href="${SRC(uxLineArt('ch_' + lv.id, lv.bg))}" width="960" height="520" preserveAspectRatio="xMidYMid slice"/>
      <rect y="220" width="960" height="300" fill="url(#bottomFade)"/>
      ${uxCardRow(words, 296, cw, 190, gap)}
      <g id="uxCue" opacity="0" class="ux-soft"><g id="uxEar">${uxIcon('ear', 30)}</g><g id="uxMouth" visibility="hidden" class="ux-bounce">${uxIcon('mouth', 30)}</g></g>
      ${uxButton({ act: 'go', ui: 'next', icon: 'next', x: 886, y: 452, r: 38, plate: 'gold' })}</g>`);
    const finish = () => uxEnd(s, done);
    s.onKey = finish;
    uxBind(root, { go: finish, word: el => { uxNudge(el); uxWordVoice(el.dataset.word); } });
    const cue = root.querySelector('#uxCue'), ear = root.querySelector('#uxEar'), mouth = root.querySelector('#uxMouth');
    const setCue = (k, kind) => {
      cue.setAttribute('transform', `translate(${x0 + k * (cw + gap) + cw / 2} 262)`);
      cue.setAttribute('opacity', kind ? 1 : 0);
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
        setCue(k, null);
        await uxWait(250);
      }
      if (!uxAlive(s)) return;
      const b = root.querySelector('[data-act="go"]'); if (b) b.classList.add('ux-pulse');
    })();
  }

  /* ---------- recall (start of the next room) ---------- */
  function showRecall(prevLevel, done) {
    const lv = prevLevel == null ? null : uxLevel(prevLevel), words = lv ? uxRoomWords(lv) : [];
    if (!lv || !words.length) { if (done) done(); return; }
    const s = uxScreen('recall', true);
    uxInputReset();
    const root = uxPaint(`<g class="page"><image href="${SRC(lv.bg)}" width="960" height="520" preserveAspectRatio="xMidYMid slice"/><rect width="960" height="520" fill="#0d1438" opacity=".5"/>
      ${uxCardRow(words, 140, 200, 230, 30)}
      ${uxButton({ act: 'skip', ui: 'next', icon: 'next', x: 886, y: 452, r: 34 })}</g>`);
    const finish = () => uxEnd(s, done);
    s.onKey = finish;
    uxBind(root, { skip: finish, word: el => { uxNudge(el); uxWordVoice(el.dataset.word); } });
    (async () => {
      for (let k = 0; k < words.length; k++) {
        if (!uxAlive(s)) return;
        uxPopSlot(root, k); uxSfx('page');
        await uxLine('recall_' + words[k].id);
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
    const lv = uxLevel(level), idx = uxLevelIndex(lv), words = uxRoomWords(lv), s = uxScreen('clear', true);
    uxInputReset();
    const g = game, memory = !!g.memoryFound;
    const small = !g.stars || g.stars.total === 0 ? true : g.stars.got >= g.stars.total;
    const got = [true, memory, small];   // 90-main has already stored these with markRoom()
    s.phase = 0; s.seq = 0;

    uxPaint(`<g class="page"><image id="uxBg" href="${SRC(uxLineArt('clear_' + lv.id, lv.bg))}" width="960" height="520" preserveAspectRatio="xMidYMid slice"/>
      <rect width="960" height="520" fill="#0d1438" opacity=".55"/>
      <g id="uxStars" class="ux-star" style="transform:translate(480px,170px) scale(1)">${uxStarsHtml(got)}</g>
      <g id="uxBody"></g><g id="uxCtl"></g></g>`);
    const root = $('overlay'), body = root.querySelector('#uxBody'), ctl = root.querySelector('#uxCtl'), stars = root.querySelector('#uxStars');
    const word = el => { uxNudge(el); uxWordVoice(el.dataset.word); };
    const mark = () => { const me = ++s.seq; return () => uxAlive(s) && s.seq === me; };
    const setCtl = html => { ctl.innerHTML = html; uxBind(ctl, { next: () => s.onKey && s.onKey(), skip: () => finishPage(), replay: () => { if (uxAlive(s)) { uxEnd(s, null); uxHooks.replay(idx); } }, done: () => uxEnd(s, done) }); };
    const nextBtn = (act, ui) => uxButton({ act, ui, icon: 'next', x: 886, y: 452, r: 38, plate: 'gold' });

    /* A: stars pop, narrator sentence */
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

    /* B: word cards, each said once; sparkle badge (no text) the first time */
    const phaseWords = () => {
      s.phase = 2; const ok = mark();
      stars.style.transform = 'translate(480px,52px) scale(.42)';
      s.onKey = () => { if (ok()) phaseQuiz(); };
      const rec = words.map(w => uxWordRec(w.id));
      const isNew = rec.map(r => !r.seen);
      body.innerHTML = uxCardRow(words, 128, 200, 238, 30, (wd, k) => ({ isNew: isNew[k] }));
      uxBind(body, { word });
      setCtl('');
      (async () => {
        await uxWait(500);
        for (let k = 0; k < words.length; k++) {
          if (!ok()) return;
          uxPopSlot(root, k); uxSfx('page');
          rec[k].seen = true;
          await uxWordVoice(words[k].id);
          await uxWait(250);
        }
        uxSaveNow();
        if (ok()) { setCtl(nextBtn('next', 'next')); ctl.querySelector('[data-act="next"]').classList.add('ux-pulse'); }
      })();
    };

    /* C: quiz, 3 big picture cards, spoken question, skippable */
    const phaseQuiz = () => {
      s.phase = 3; const ok = mark();
      s.onKey = () => finishPage();
      if (!words.length) { finishPage(); return; }
      const order = words.map((_, k) => k).sort(() => Math.random() - .5);
      (async () => {
        for (let q = 0; q < order.length; q++) {
          if (!ok()) return;
          const target = words[order[q]];
          const shown = words.slice().sort(() => Math.random() - .5);
          const dots = order.map((_, k) => `<circle cx="${480 + (k - (order.length - 1) / 2) * 22}" cy="${112}" r="7" fill="${k < q ? '#ffd27a' : k === q ? '#fff' : '#5a6fca'}"/>`).join('');
          body.innerHTML = dots + uxCardRow(shown, 150, 210, 210, 28, () => ({ label: false, act: 'pick', show: false }));
          setCtl(uxButton({ act: 'skip', ui: 'quiz_skip', icon: 'next', x: 886, y: 452, r: 34 }));
          let wrong = 0, solved = false, resolve = null;
          const result = new Promise(r => { resolve = r; });
          uxBind(body, {
            pick: el => {
              if (!ok() || solved) return;
              if (el.dataset.word === target.id) {
                solved = true;
                uxSfx('quiz_right'); uxConfetti(body, 480, 250, 36);
                uxWordRec(target.id).quiz = (uxWordRec(target.id).quiz || 0) + (wrong ? 0 : 1);
                body.querySelectorAll('.ux-glowrect').forEach(n => { n.classList.remove('ux-glow'); n.setAttribute('opacity', 0); });
                uxLine('quiz_right_' + (1 + q % 3), { interrupt: true }).then(() => resolve());
              } else {
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
          await result;
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
