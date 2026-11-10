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

  /* Touch mode (PLAN-2 D1) is decided by what the screen's main pointer is, never by maxTouchPoints (a laptop with a touch screen
     reports touch points and is still used with a mouse): (pointer: coarse) at the start and whenever it changes, or the first real
     finger that touches the page. A mouse click ends a touch mode that only a finger started. The pad (#touch) and the golden
     marker above the steered sister show in touch mode. */
  const coarseQuery = typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)') : null;
  const portraitQuery = typeof matchMedia === 'function' ? matchMedia('(orientation: portrait)') : null;
  let sawTouch = false;
  let isTouch = !!(coarseQuery && coarseQuery.matches);
  if (isTouch) document.body.classList.add('touch');
  const touchHeld = { l: 0, r: 0 };
  /* which pointer (finger) holds the left / right touch key right now; clearInput lets go of both */
  const touchOwner = { l: null, r: null };
  let touchDuoId = 'frost';
  function touchWanted() { return sawTouch || !!(coarseQuery && coarseQuery.matches); }
  function setTouchMode(on) {
    if (on === isTouch) return;
    isTouch = on;
    if (on) document.body.classList.add('touch'); else { document.body.classList.remove('touch'); clearInput(); }
    queueFit();
  }
  /* A media query that changes while the page is open (the screen turned, a mouse was plugged in). */
  function watchQuery(q, fn) {
    if (!q) return;
    try { if (q.addEventListener) q.addEventListener('change', fn); else if (q.addListener) q.addListener(fn); } catch (e) {}
  }
  /* The game is landscape. In portrait the page shows only the turn-the-tablet picture (CSS hides the stage and the pad), so no held
     key may stay down when the screen turns. Other code may read this. */
  function isPortraitView() { return !!(portraitQuery && portraitQuery.matches); }
  watchQuery(coarseQuery, () => setTouchMode(touchWanted()));
  watchQuery(portraitQuery, () => { clearInput(); padFocusClear(); queueFit(); });

  /* canPlay() (the room is live and nothing covers it) is in src/lib/play-gate.js. */
  /* The sister the arrow keys steer right now. */
  const steered = () => (game.mode === 'solo' ? 'frost' : 'nuan');

  function clearInput() {
    heldKeys.clear();
    touchHeld.l = touchHeld.r = 0;
    touchOwner.l = touchOwner.r = null;
    for (const id of ['frost', 'nuan']) Object.assign(game.input[id], { l: 0, r: 0, d: 0 });
    for (const k of ['l', 'r', 'up', 'space']) game.kbd[k] = 0;
    document.querySelectorAll('#touch button.on').forEach(b => b.classList.remove('on'));
  }
  addEventListener('blur', clearInput);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearInput(); });   // the lift of a finger is lost when the app is left

  /* Gamepad. In a room: d-pad or left stick walks, A / up jumps, X / B magic; Elsa remains the solo lead. Everywhere else (title, rooms,
     wordbook, story pages, quiz, review) the d-pad moves a visible focus ring between the on-screen buttons, A presses the focused one
     and B goes back (PLAN-2 D7). Start leaves a story scene like Enter does. */
  const padState = { l: 0, r: 0, d: 0, jump: false, act: false, any: false, start: false, ok: false, back: false, nav: { l: 0, r: 0, u: 0, d: 0 } };
  function padReset() {
    Object.assign(padState, { l: 0, r: 0, d: 0, jump: false, act: false, any: false, start: false, ok: false, back: false, nav: { l: 0, r: 0, u: 0, d: 0 } });
  }
  function pollGamepad() {
    let p = null;
    try { p = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(x => x && x.connected) || null; } catch (e) { p = null; }
    const was = { jump: padState.jump, act: padState.act, any: padState.any, start: padState.start, ok: padState.ok, back: padState.back, nav: Object.assign({}, padState.nav) };
    if (!p) { padReset(); padFocusClear(); return; }
    const b = i => !!(p.buttons[i] && p.buttons[i].pressed), ax = p.axes[0] || 0, ay = p.axes[1] || 0;
    padState.l = ax < -.45 || b(14) ? 1 : 0;
    padState.r = ax > .45 || b(15) ? 1 : 0;
    padState.d = ay > .75 || b(13) ? 1 : 0;
    padState.jump = b(0) || b(12) || ay < -.75;
    padState.act = b(2) || b(1) || b(7);
    padState.start = b(9);
    padState.ok = b(0);
    padState.back = b(1);
    padState.nav = { l: padState.l, r: padState.r, u: ay < -.75 || b(12) ? 1 : 0, d: padState.d };
    padState.any = padState.jump || padState.act || padState.start || padState.l + padState.r + padState.nav.u + padState.d > 0;
    if (padState.any && !was.any) wakeOnce();
    /* a scene (chapter card, recall, clear page, quiz) is left with the Start button only, like Enter on the keyboard */
    if (storyIsOpen() && padState.start && !was.start) advanceStoryPage(true);
    if (!canPlay()) { padMenu(was); return; }
    padFocusClear();
    if (padState.jump && !was.jump) pressPlay(steered(), 'jump');
    if (padState.act && !was.act) pressPlay(steered(), 'act');
  }

  /* ---- gamepad focus ring ---- */
  const padFocus = { el: null, armed: false };
  /* The buttons the pad can reach on the current screen: everything role="button" in the overlay that is on screen (a word card
     that has not popped up yet is not), except the hold-to-open ones (the parent gear). Rects are screen pixels, only compared. */
  function padTargets() {
    const out = [], root = $('overlay');
    if (!root || !root.querySelectorAll) return out;
    for (const el of /** @type {HTMLElement[]} */ (Array.from(root.querySelectorAll('[role="button"]')))) {
      if (/** @type {any} */ (el).__uxHold || !el.getBoundingClientRect) continue;
      const pop = el.closest ? el.closest('.ux-pop') : null;
      if (pop && !pop.classList.contains('show')) continue;
      const r = el.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) continue;
      out.push({ el, x: r.left, y: r.top, w: r.width, h: r.height, pulse: el.classList.contains('ux-pulse') });
    }
    return out;
  }
  function padFocusClear() {
    padFocus.el = null; padFocus.armed = false;
    const ring = $('padFocus');
    if (ring && ring.getAttribute('visibility') !== 'hidden') ring.setAttribute('visibility', 'hidden');
  }
  /* Put the ring round the focused button (stage units), every frame while it is shown: cards pop up and wiggle. */
  function padFocusDraw() {
    const el = padFocus.el, ring = $('padFocus');
    if (!ring) return;
    const st = /** @type {any} */ ($('stage')), m = el && st && st.getScreenCTM ? st.getScreenCTM() : null;
    if (!el || !m || !el.getBoundingClientRect || el.isConnected === false) { if (el && el.isConnected === false) padFocus.el = null; if (ring.getAttribute('visibility') !== 'hidden') ring.setAttribute('visibility', 'hidden'); return; }
    const r = el.getBoundingClientRect(), inv = m.inverse();
    const a = new DOMPoint(r.left, r.top).matrixTransform(inv), c = new DOMPoint(r.right, r.bottom).matrixTransform(inv);
    const box = ring.firstElementChild, pad = 7;
    if (box) {
      box.setAttribute('x', (a.x - pad).toFixed(1)); box.setAttribute('y', (a.y - pad).toFixed(1));
      box.setAttribute('width', (c.x - a.x + 2 * pad).toFixed(1)); box.setAttribute('height', (c.y - a.y + 2 * pad).toFixed(1));
    }
    ring.setAttribute('visibility', 'visible');
  }
  /* `byDirection`: a d-pad press put the ring here. Inside a learning scene only such a ring can be pressed with A (see padMenu). */
  function padFocusSet(t, byDirection) {
    padFocus.el = t.el; padFocus.armed = byDirection;
    padFocusDraw();
    uxSfx('hover');
    uxPadName(t.el.dataset && t.el.dataset.ui);
  }
  /* What the pad does on a screen that is not a live room. The first press only shows the ring (on the button the scene waits for,
     else the first one); after that the d-pad moves it and A presses the focused button. A learning scene (chapter card, recall,
     clear page, quiz, review) is stricter, like the keyboard: it ignores the pad in its quiet first second, and A presses only a
     ring that a d-pad press has put there, so a child mashing A (the jump button) can never skip a lesson. */
  function padMenu(was) {
    if (uxState.modal) { padFocusClear(); return; }   // the parent settings are for a grown-up with a mouse
    const targets = padTargets();
    const cur = padFocus.el ? targets.findIndex(t => t.el === padFocus.el) : -1;
    if (cur < 0 && padFocus.el) padFocusClear();
    if (!targets.length) return;
    const dir = ['l', 'r', 'u', 'd'].find(k => padState.nav[k] && !was.nav[k]);
    const ok = padState.ok && !was.ok, back = padState.back && !was.back;
    if (!dir && !ok && !back) { padFocusDraw(); return; }
    if (!storyAcceptsPad(performance.now())) return;
    if (back && !storyIsOpen()) {
      const t = targets.find(x => x.el.dataset && x.el.dataset.act === 'back');
      if (t) padActivate(t.el);
      return;
    }
    const strict = storyIsOpen() && !!story.strict;
    if (cur < 0) { if (dir || ok) padFocusSet(targets[layoutPadStart(targets)], !!dir || !strict); return; }
    if (dir) {
      const j = layoutPadPick(dir, cur, targets);
      if (j >= 0) padFocusSet(targets[j], true); else { padFocus.armed = true; padFocusDraw(); }
    } else if (ok && (padFocus.armed || !strict)) padActivate(targets[cur].el);
  }
  function padActivate(el) { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); }

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
  /* The first real finger switches touch mode on; a mouse click switches it off again unless the screen's main pointer is a finger.
     Any pointer press also puts the gamepad ring away: the mouse or the finger is in charge now. */
  addEventListener('pointerdown', e => {
    padFocusClear();
    if (e.pointerType === 'touch') { sawTouch = true; setTouchMode(true); }
    else if (e.pointerType === 'mouse') { sawTouch = false; setTouchMode(touchWanted()); }
  }, { capture: true });

  /* ---- touch ---- */
  /* A held key (left / right) belongs to the finger that pressed it. The key captures that pointer, so the lift or the cancel always
     arrives here, even when the finger slid away or the system took the touch for a long-press menu; a different finger cannot let go
     of it, and a new press simply takes it over, so a lost lift can never leave it stuck. */
  function bindHold(id, key) {
    const b = $(id);
    if (!b) return;
    let captured = false;
    const on = e => {
      e.preventDefault(); wakeOnce();
      touchOwner[key] = e.pointerId;
      captured = false;
      try { if (b.setPointerCapture) { b.setPointerCapture(e.pointerId); captured = true; } } catch (err) {}
      b.classList.add('on'); touchHeld[key] = 1; inputSeen.move = true;
    };
    const off = e => {
      if (e && e.pointerId !== undefined && touchOwner[key] !== null && e.pointerId !== touchOwner[key]) return;
      touchOwner[key] = null;
      b.classList.remove('on'); touchHeld[key] = 0;
    };
    b.addEventListener('pointerdown', on);
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, off);
    b.addEventListener('pointerleave', e => { if (!captured) off(e); });   // without pointer capture a finger that slides off lets go
    b.addEventListener('contextmenu', e => { e.preventDefault(); off(null); });
  }
  /* The jump / magic / duo-switch buttons are play controls: while a scene (chapter card, recall, clear page, quiz) is open they do nothing. */
  function bindTap(id, fn) {
    const b = $(id);
    if (!b) return;
    b.addEventListener('pointerdown', e => { e.preventDefault(); wakeOnce(); if (!storyIsOpen()) fn(); });
    b.addEventListener('contextmenu', e => e.preventDefault());
  }
  /* A long press on the stage (a held hud button) or on the pad must never open the system menu. */
  for (const id of ['stage', 'touch']) { const n = $(id); if (n) n.addEventListener('contextmenu', e => e.preventDefault()); }
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
      const w = layoutStageWidth(availW, availH);
      st.style.width = w + 'px';
      st.style.height = layoutStageHeight(w) + 'px';
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
