  /* Input (CONTRACT §5). Solo: ← → ↑ Space controls Elsa; Anna assists. Duo keeps the two-person layout.
     Everything the keys do goes through g.input / g.press; held keys are re-applied every frame by syncInput(). */
  const SOLO_KEYS = { ArrowLeft: 'l', ArrowRight: 'r', ArrowDown: 'd', ArrowUp: 'jump', Space: 'act', Enter: 'act', NumpadEnter: 'act' };
  const DUO_KEYS = {
    KeyA: ['frost', 'l'], KeyD: ['frost', 'r'], KeyS: ['frost', 'd'], KeyW: ['frost', 'jump'], KeyF: ['frost', 'act'],
    ArrowLeft: ['nuan', 'l'], ArrowRight: ['nuan', 'r'], ArrowDown: ['nuan', 'd'], ArrowUp: ['nuan', 'jump'],
    Enter: ['nuan', 'act'], NumpadEnter: ['nuan', 'act'], KeyL: ['nuan', 'act'],
  };
  const heldKeys = new Set();
  /* What the on-screen keyboard diagram (hud) shows: 1 while the key is down, and `teach` = the key the tutorial is
     currently asking for ('l' | 'r' | 'up' | 'space' | null). */
  game.kbd = { l: 0, r: 0, up: 0, space: 0, teach: null };
  const KBD_OF = { ArrowLeft: 'l', ArrowRight: 'r', ArrowUp: 'up', Space: 'space', Enter: 'space', NumpadEnter: 'space' };
  /* What the player has done since the room started, for the tutorial. */
  const inputSeen = { move: false, jump: false, magic: false };

  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (isTouch) document.body.classList.add('touch');
  const touchHeld = { l: 0, r: 0 };
  let touchDuoId = 'frost';

  /* canPlay() (the room is live and nothing covers it) is in src/lib/play-gate.js. */
  /* The sister the arrow keys steer right now. */
  const steered = () => (game.mode === 'solo' ? 'frost' : 'nuan');

  function clearInput() {
    heldKeys.clear();
    touchHeld.l = touchHeld.r = 0;
    for (const id of ['frost', 'nuan']) Object.assign(game.input[id], { l: 0, r: 0, d: 0 });
    for (const k of ['l', 'r', 'up', 'space']) game.kbd[k] = 0;
    document.querySelectorAll('#touch button.on').forEach(b => b.classList.remove('on'));
  }
  addEventListener('blur', clearInput);

  /* Gamepad: d-pad or left stick walks, A / up jumps, X / B magic; Elsa remains the solo lead. */
  const padState = { l: 0, r: 0, d: 0, jump: false, act: false, any: false, start: false };
  function pollGamepad() {
    let p = null;
    try { p = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(x => x && x.connected) || null; } catch (e) { p = null; }
    const was = { jump: padState.jump, act: padState.act, any: padState.any, start: padState.start };
    if (!p) { Object.assign(padState, { l: 0, r: 0, d: 0, jump: false, act: false, any: false, start: false }); return; }
    const b = i => !!(p.buttons[i] && p.buttons[i].pressed), ax = p.axes[0] || 0, ay = p.axes[1] || 0;
    padState.l = ax < -.45 || b(14) ? 1 : 0;
    padState.r = ax > .45 || b(15) ? 1 : 0;
    padState.d = ay > .75 || b(13) ? 1 : 0;
    padState.jump = b(0) || b(12) || ay < -.75;
    padState.act = b(2) || b(1) || b(7);
    padState.start = b(9);
    padState.any = padState.jump || padState.act || padState.start;
    if (padState.any && !was.any) wakeOnce();
    /* a scene (chapter card, recall, clear page, quiz) is left with the Start button only, like Enter on the keyboard */
    if (storyIsOpen()) { if (padState.start && !was.start) advanceStoryPage(true); return; }
    if (!canPlay()) return;
    if (padState.jump && !was.jump) pressPlay(steered(), 'jump');
    if (padState.act && !was.act) pressPlay(steered(), 'act');
  }

  /* A jump / magic press from any device. */
  function pressPlay(id, what) {
    if (!canPlay()) return;
    game.press(id, what);
    if (what === 'jump') inputSeen.jump = true; else inputSeen.magic = true;
  }

  /* Restart the room. There is deliberately no key for this (a mashed R used to wipe a nearly finished room): the only way in is
     the hud's restart button, which calls this once a 1 s long press has completed. Ignored unless the room is live. */
  function restartRoomHeld() {
    if (!canPlay()) return false;
    restartRoom();
    return true;
  }

  /* Duo on a touch screen: the touch buttons steer one sister at a time (touchDuoId), so she wears the golden marker. 20-sisters
     only marks the solo lead; the frame loop calls this right after drawing the sisters. */
  function drawDuoTouchMark(now) {
    if (!isTouch || game.mode !== 'duo') return;
    for (const id of ['frost', 'nuan']) {
      const m = view[id] && view[id].mark;
      if (!m) continue;
      const mine = id === touchDuoId;
      m.setAttribute('visibility', game.state === 'play' && mine ? 'visible' : 'hidden');
      if (mine) m.setAttribute('transform', `translate(0 ${(Math.sin(now * 6) * 3).toFixed(1)})`);
    }
  }

  /* Copy the held keys / gamepad / touch into g.input for whoever is player-controlled. In solo only the player's entry is
     written; the other sister belongs to the companion. */
  function syncInput() {
    if (!canPlay()) {
      for (const id of ['frost', 'nuan']) Object.assign(game.input[id], { l: 0, r: 0, d: 0 });
      return;
    }
    const k = c => heldKeys.has(c);
    if (game.mode === 'solo') {
      const inp = game.input.frost;
      inp.l = k('ArrowLeft') || padState.l || touchHeld.l ? 1 : 0;
      inp.r = k('ArrowRight') || padState.r || touchHeld.r ? 1 : 0;
      inp.d = k('ArrowDown') || padState.d ? 1 : 0;
    } else {
      const fi = game.input.frost, ni = game.input.nuan, tf = touchDuoId === 'frost', tn = !tf;
      fi.l = k('KeyA') || (tf && touchHeld.l) ? 1 : 0;
      fi.r = k('KeyD') || (tf && touchHeld.r) ? 1 : 0;
      fi.d = k('KeyS') ? 1 : 0;
      ni.l = k('ArrowLeft') || padState.l || (tn && touchHeld.l) ? 1 : 0;
      ni.r = k('ArrowRight') || padState.r || (tn && touchHeld.r) ? 1 : 0;
      ni.d = k('ArrowDown') || padState.d ? 1 : 0;
    }
    /* the tutorial only counts keys the player pressed, not what the companion is doing */
    const mine = game.mode === 'solo' ? [game.input.frost] : [game.input.frost, game.input.nuan];
    if (mine.some(i => i.l || i.r)) inputSeen.move = true;
  }

  /* ---- keyboard ---- */
  function wakeOnce() { if (typeof wakeAudio === 'function') { try { wakeAudio(); } catch (e) { console.error(e); } } }
  function advanceStoryPage(enterLike) { if (typeof advanceStory === 'function') advanceStory(enterLike === true); }
  /* Only Enter leaves a scene from the keyboard: Space and the arrows are play keys and a child mashing them must not skip lessons. */
  const ADVANCE_KEYS = ['Enter', 'NumpadEnter'];

  addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;   // leave browser shortcuts alone
    wakeOnce();
    if (storyIsOpen()) {
      if (!e.repeat && ADVANCE_KEYS.includes(e.code)) { e.preventDefault(); advanceStoryPage(true); }
      return;
    }
    const active = /** @type {HTMLElement | null} */ (document.activeElement);
    const onPseudoButton = active && active.getAttribute && active.getAttribute('role') === 'button' && !/^(BUTTON|A|INPUT)$/.test(active.tagName);
    if (playFlow.phase !== 'play') {
      /* menus: Enter / Space press the focused image button */
      if ((e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') && onPseudoButton) {
        e.preventDefault();
        if (!e.repeat) active.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }
      return;
    }
    const solo = game.mode === 'solo';
    const map = solo ? SOLO_KEYS : DUO_KEYS;
    const m = map[e.code];
    if (!m) return;
    e.preventDefault();
    if (active && active !== document.body && active.blur && !/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) active.blur();   // Space must not also click a focused button
    const kb = KBD_OF[e.code];
    if (kb) game.kbd[kb] = 1;
    const [id, what] = solo ? [steered(), m] : m;
    if (what === 'jump' || what === 'act') { if (!e.repeat) pressPlay(id, what); }
    else heldKeys.add(e.code);
  });
  addEventListener('keyup', e => {
    heldKeys.delete(e.code);
    const kb = KBD_OF[e.code];
    if (kb) game.kbd[kb] = 0;
  });
  addEventListener('pointerdown', wakeOnce, { capture: true });

  /* ---- touch (basic) ---- */
  function bindHold(id, key) {
    const b = $(id);
    if (!b) return;
    const on = e => { e.preventDefault(); wakeOnce(); b.classList.add('on'); touchHeld[key] = 1; inputSeen.move = true; };
    const off = () => { b.classList.remove('on'); touchHeld[key] = 0; };
    b.addEventListener('pointerdown', on);
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, off);
  }
  /* The jump / magic / duo-switch buttons are play controls: while a scene (chapter card, recall, clear page, quiz) is open they do nothing. */
  function bindTap(id, fn) {
    const b = $(id);
    if (!b) return;
    b.addEventListener('pointerdown', e => { e.preventDefault(); wakeOnce(); if (!storyIsOpen()) fn(); });
  }
  /* The sister the touch buttons act for: Elsa in solo, the one picked with the switch button in duo. */
  const touchId = () => (game.mode === 'solo' ? steered() : touchDuoId);
  bindHold('tLeft', 'l'); bindHold('tRight', 'r');
  bindTap('tJump', () => pressPlay(touchId(), 'jump'));
  bindTap('tAct', () => pressPlay(touchId(), 'act'));
  bindTap('tSwitch', () => {   // duo only (the button is hidden in solo): hand the touch buttons to the other sister
    if (game.mode === 'solo') return;
    clearInput();
    touchDuoId = touchDuoId === 'frost' ? 'nuan' : 'frost';
    const m = view[touchDuoId].mark;
    view[touchDuoId].markT = 2;
    if (m) m.setAttribute('visibility', 'visible');
  });

  /* ---- fullscreen and scaling ---- */
  function toggleFullscreen() {
    const d = document, root = d.documentElement;
    try {
      if (d.fullscreenElement || d.webkitFullscreenElement) { (d.exitFullscreen || d.webkitExitFullscreen).call(d); return; }
      const req = root.requestFullscreen || root.webkitRequestFullscreen;
      if (req) { const p = req.call(root); if (p && p.catch) p.catch(() => {}); }
    } catch (e) {}
  }

  /* The stage keeps its 960 x 520 proportions and takes whatever room the window has after the other blocks of the
     page (hint line, touch padState) and the body padding. Nothing may scroll: 1280x720, 1440x900 and 1920x1080 all fit. */
  const STAGE_RATIO = 960 / 520;
  function fitStage() {
    const st = $('stage'), body = document.body, root = document.documentElement;
    if (!st || !body) return;
    root.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    for (let pass = 0; pass < 2; pass++) {
      const cs = getComputedStyle(body);
      const px = k => parseFloat(cs[k]) || 0;
      const gap = px('rowGap');
      let others = 0, count = 0;
      for (const n of /** @type {HTMLElement[]} */ (Array.from(body.children))) {
        if (n === st || /^(SCRIPT|STYLE|LINK|META|TITLE)$/.test(n.tagName)) continue;
        const ns = getComputedStyle(n);
        if (ns.display === 'none' || ns.position === 'fixed' || ns.position === 'absolute') continue;
        others += n.offsetHeight + (parseFloat(ns.marginTop) || 0) + (parseFloat(ns.marginBottom) || 0);
        count++;
      }
      const availW = root.clientWidth - px('paddingLeft') - px('paddingRight');
      const availH = root.clientHeight - px('paddingTop') - px('paddingBottom') - others - gap * count;
      const w = Math.max(240, Math.floor(Math.min(availW, availH * STAGE_RATIO)));
      st.style.width = w + 'px';
      st.style.height = Math.round(w / STAGE_RATIO) + 'px';
      const info = $('info');
      if (info) info.style.width = w + 'px';
    }
  }
  addEventListener('resize', fitStage);
  addEventListener('orientationchange', fitStage);
  document.addEventListener('fullscreenchange', fitStage);
  document.addEventListener('webkitfullscreenchange', fitStage);
  /* Size changes the window events do not announce (the hint line or the touch pad appearing, a font arriving, the parent
     strip toggling) are caught by a ResizeObserver on the page and on the blocks beside the stage. It only queues one refit
     for the next animation frame, so a burst of changes costs one layout pass, and the refit changing #info's width settles
     after one more round (same values, nothing changes). A browser without ResizeObserver refits once a second instead. */
  let fitQueued = false;
  function queueFit() {
    if (fitQueued) return;
    fitQueued = true;
    requestAnimationFrame(() => { fitQueued = false; fitStage(); });
  }
  if (typeof ResizeObserver === 'function') {
    const fitObserver = new ResizeObserver(queueFit);
    fitObserver.observe(document.documentElement);
    fitObserver.observe(document.body);
    for (const n of document.body.children) if (n !== $('stage') && !/^(SCRIPT|STYLE|LINK|META|TITLE)$/.test(n.tagName)) fitObserver.observe(n);
  } else setInterval(fitStage, 1000);
