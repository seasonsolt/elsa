  /* Input (CONTRACT §5). Solo: ← → ↑ Space, Tab swaps the sisters. Duo keeps the two-person layout.
     Everything the keys do goes through g.input / g.press / g.swap; held keys are re-applied every frame by syncInput(). */
  const SOLO_KEYS = { ArrowLeft: 'l', ArrowRight: 'r', ArrowDown: 'd', ArrowUp: 'jump', Space: 'act', Enter: 'act', NumpadEnter: 'act' };
  const DUO_KEYS = {
    KeyA: ['frost', 'l'], KeyD: ['frost', 'r'], KeyS: ['frost', 'd'], KeyW: ['frost', 'jump'], KeyF: ['frost', 'act'],
    ArrowLeft: ['nuan', 'l'], ArrowRight: ['nuan', 'r'], ArrowDown: ['nuan', 'd'], ArrowUp: ['nuan', 'jump'],
    Enter: ['nuan', 'act'], NumpadEnter: ['nuan', 'act'], KeyL: ['nuan', 'act'],
  };
  const heldKeys = new Set();
  /* What the on-screen keyboard diagram (hud) shows: 1 while the key is down, and `teach` = the key the tutorial is
     currently asking for ('l' | 'r' | 'up' | 'space' | 'tab' | null). */
  game.kbd = { l: 0, r: 0, up: 0, space: 0, tab: 0, teach: null };
  const KBD_OF = { ArrowLeft: 'l', ArrowRight: 'r', ArrowUp: 'up', Space: 'space', Enter: 'space', NumpadEnter: 'space', Tab: 'tab' };
  /* What the player has done since the room started, for the tutorial. */
  const inputSeen = { move: false, jump: false, magic: false, swap: false };

  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (isTouch) document.body.classList.add('touch');
  const touchHeld = { l: 0, r: 0 };
  let touchDuoId = 'frost';

  /* True while the room is live and nothing is covering it. */
  function canPlay() { return playFlow.phase === 'play' && game.state === 'play' && !storyIsOpen() && !uxState.modal; }
  /* The sister the arrow keys steer right now. */
  const steered = () => (game.mode === 'solo' ? game.player || 'nuan' : 'nuan');

  function clearInput() {
    heldKeys.clear();
    touchHeld.l = touchHeld.r = 0;
    for (const id of ['frost', 'nuan']) Object.assign(game.input[id], { l: 0, r: 0, d: 0 });
    for (const k of ['l', 'r', 'up', 'space', 'tab']) game.kbd[k] = 0;
    document.querySelectorAll('#touch button.on').forEach(b => b.classList.remove('on'));
  }
  addEventListener('blur', clearInput);

  /* Gamepad (optional, cheap): d-pad or left stick walks, A / up jumps, X / B magic, Y swaps. */
  const padState = { l: 0, r: 0, d: 0, jump: false, act: false, swap: false, any: false };
  function pollGamepad() {
    let p = null;
    try { p = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(x => x && x.connected) || null; } catch (e) { p = null; }
    const was = { jump: padState.jump, act: padState.act, swap: padState.swap, any: padState.any };
    if (!p) { Object.assign(padState, { l: 0, r: 0, d: 0, jump: false, act: false, swap: false, any: false }); return; }
    const b = i => !!(p.buttons[i] && p.buttons[i].pressed), ax = p.axes[0] || 0, ay = p.axes[1] || 0;
    padState.l = ax < -.45 || b(14) ? 1 : 0;
    padState.r = ax > .45 || b(15) ? 1 : 0;
    padState.d = ay > .75 || b(13) ? 1 : 0;
    padState.jump = b(0) || b(12) || ay < -.75;
    padState.act = b(2) || b(1) || b(7);
    padState.swap = b(3) || b(4);
    padState.any = padState.jump || padState.act || padState.swap || b(9);
    if (padState.any && !was.any) wakeOnce();
    if (storyIsOpen()) { if (padState.any && !was.any) advanceStoryPage(); return; }
    if (!canPlay()) return;
    if (padState.jump && !was.jump) pressPlay(steered(), 'jump');
    if (padState.act && !was.act) pressPlay(steered(), 'act');
    if (padState.swap && !was.swap) swapPlayer();
  }

  /* A jump / magic press from any device. */
  function pressPlay(id, what) {
    if (!canPlay()) return;
    game.press(id, what);
    if (what === 'jump') inputSeen.jump = true; else inputSeen.magic = true;
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
      const inp = game.input[game.player || 'nuan'];
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
    const mine = game.mode === 'solo' ? [game.input[game.player || 'nuan']] : [game.input.frost, game.input.nuan];
    if (mine.some(i => i.l || i.r)) inputSeen.move = true;
  }

  /* ---- swap (solo) ---- */
  function swapPlayer() {
    if (!canPlay() || game.mode !== 'solo') return false;
    if (typeof game.swap === 'function') game.swap();   // emits {type:'swap', player}
    else { game.player = game.player === 'nuan' ? 'frost' : 'nuan'; game.events.push({ type: 'swap', player: game.player }); }
    return true;
  }
  /* Called for the 'swap' event, wherever the swap came from (Tab, the avatar in the hud, the gamepad). */
  function onPlayerSwapped(e) {
    if (e && (e.player === 'nuan' || e.player === 'frost')) game.player = e.player;
    setSetting('player', game.player);
    for (const id of ['frost', 'nuan']) Object.assign(game.input[id], { l: 0, r: 0, d: 0 });
    inputSeen.swap = true;
  }

  /* ---- keyboard ---- */
  function wakeOnce() { if (typeof wakeAudio === 'function') { try { wakeAudio(); } catch (e) { console.error(e); } } }
  function advanceStoryPage() { if (typeof advanceStory === 'function') advanceStory(); }
  const ADVANCE_KEYS = ['Enter', 'NumpadEnter', 'Space', 'ArrowUp', 'KeyW', 'KeyF', 'KeyL', 'Escape'];

  addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;   // leave browser shortcuts alone
    wakeOnce();
    if (storyIsOpen()) {
      if (!e.repeat && ADVANCE_KEYS.includes(e.code)) { e.preventDefault(); advanceStoryPage(); }
      return;
    }
    const active = document.activeElement;
    const onPseudoButton = active && active.getAttribute && active.getAttribute('role') === 'button' && !/^(BUTTON|A|INPUT)$/.test(active.tagName);
    if (playFlow.phase !== 'play') {
      /* menus: Enter / Space press the focused image button */
      if ((e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') && onPseudoButton) {
        e.preventDefault();
        if (!e.repeat) active.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }
      return;
    }
    if (e.code === 'KeyM' && !e.repeat) { setSetting('sound', !setting('sound')); return; }
    if (e.code === 'KeyR' && !e.repeat && game.state === 'play') { restartRoom(); return; }
    if (e.code === 'Tab') { e.preventDefault(); if (!e.repeat) { game.kbd.tab = 1; swapPlayer(); } return; }
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
  function bindTap(id, fn) {
    const b = $(id);
    if (!b) return;
    b.addEventListener('pointerdown', e => { e.preventDefault(); wakeOnce(); if (storyIsOpen()) advanceStoryPage(); else fn(); });
  }
  bindHold('tLeft', 'l'); bindHold('tRight', 'r');
  bindTap('tJump', () => pressPlay(steered(), 'jump'));
  bindTap('tAct', () => pressPlay(steered(), 'act'));
  bindTap('tSwitch', () => {
    if (game.mode === 'solo') { swapPlayer(); return; }
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
      for (const n of body.children) {
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
