  /* Sisters: every frame is an already-loaded image, shown one at a time. */
  const SPRITE = 84 / 170;   // game units per stored pixel; the elder sister stands 84 tall
  const RUN = ['run1', 'run2', 'run3', 'run4', 'run5', 'run6'];
  const FRAMES = ['idle', 'blink', ...RUN, 'jump', 'fall', 'cast', 'cheer'];
  const view = {};
  for (const id of ['nuan', 'frost']) {
    const shadow = el('ellipse', { rx: 22, ry: 5, fill: '#10184a', opacity: .34 }, $('shadows'));
    const root = el('g', {}, $('sisters'));
    const frames = {};
    for (const f of FRAMES) {
      const [w, h, ax] = SIZES[`${id}_${f}`];   // ax: the head's x in the image, so every frame lines up on the head
      frames[f] = img(`${id}_${f}`, -ax * SPRITE, 3 - h * SPRITE, w * SPRITE, h * SPRITE, root, { visibility: 'hidden' });
    }
    const mark = el('path', { d: 'M-8-104H8L0-93Z', fill: '#ffd27a', visibility: 'hidden' }, root);
    view[id] = { root, shadow, frames, mark, shown: null, castT: 0, stride: 0, airT: 0, idleT: 0, fadeIn: 0, markT: 0 };
  }
  const lanternGlow = el('circle', { r: 62, fill: 'url(#warm)' }, $('shadows'));
  const frostGlow = el('circle', { r: 58, fill: 'url(#cool)', opacity: .7 }, $('shadows'));

  /* Frame */
  const BLINK_FADE = .38;   // seconds a sister takes to fade back in after a magic blink
  /* Are the sisters standing together right now? (the talk module keeps the mood; this only reads it, and copes if it is gone) */
  const reunited = () => typeof heart !== 'undefined' && heart && heart.togetherT > .5;
  const celebrating = () => game.state === 'clear' || game.state === 'win';
  /* The sister the player steers in solo mode, null in duo. */
  const playerId = () => (game.mode === 'solo' ? 'frost' : null);

  function pickFrame(id, s, v, now) {
    if (celebrating()) return 'cheer';
    if (v.castT > 0) return 'cast';
    if (!s.ground) return s.vy < 0 ? 'jump' : 'fall';
    if (Math.abs(s.vx) > 1) return RUN[Math.floor(v.stride / 15) % RUN.length];
    return (now + (id === 'nuan' ? 1.7 : 0)) % 3.6 < .16 ? 'blink' : 'idle';
  }
  function drawSister(id, now, dt) {
    const s = game.sisters[id], v = view[id];
    if (!s) return;
    v.castT = Math.max(0, v.castT - dt);
    v.fadeIn = Math.max(0, v.fadeIn - dt);
    v.markT = Math.max(0, v.markT - dt);
    v.stride = s.ground && Math.abs(s.vx) > 1 ? v.stride + Math.abs(s.vx) * dt : 0;
    const hidden = s.splash > 0;
    v.root.setAttribute('visibility', hidden ? 'hidden' : 'visible');
    v.root.setAttribute('opacity', v.fadeIn > 0 ? (1 - v.fadeIn / BLINK_FADE).toFixed(2) : '1');
    v.shadow.setAttribute('visibility', hidden ? 'hidden' : 'visible');
    v.shadow.setAttribute('opacity', v.fadeIn > 0 ? ((1 - v.fadeIn / BLINK_FADE) * .34).toFixed(2) : '.34');
    const f = pickFrame(id, s, v, now);
    if (f !== v.shown && (f === 'run1' || f === 'run4') && typeof crunch === 'function') crunch(id === 'nuan' ? .8 : 1);
    if (!s.ground) v.airT += dt;
    else { if (v.airT > .18 && game.state === 'play' && !s.splash && typeof thud === 'function') thud(); v.airT = 0; }
    if (f !== v.shown) {
      if (v.shown) v.frames[v.shown].setAttribute('visibility', 'hidden');
      v.frames[f].removeAttribute('visibility');
      v.shown = f;
    }
    const cx = s.x + s.w / 2, feet = s.y + s.h;
    const moving = Math.abs(s.vx) > 1 && s.ground;
    const party = celebrating();
    const bob = moving ? 0 : party ? Math.abs(Math.sin(now * 5 + (id === 'nuan' ? 1 : 0))) * 12 : 0;
    const breath = !moving && s.ground && !party ? 1 + Math.sin(now * 2.2 + (id === 'nuan' ? 1 : 0)) * .012 : 1;
    v.idleT = s.ground && Math.abs(s.vx) < 1 && game.state === 'play' ? v.idleT + dt : 0;
    const other = game.sisters[id === 'frost' ? 'nuan' : 'frost'];
    const lookAt = (v.idleT > 2.5 || reunited()) && v.castT <= 0 && other ? (other.x > s.x ? 1 : -1) : s.dir;
    const dir = game.state === 'win' ? (Math.sin(now * 3 + (id === 'nuan' ? 1.5 : 0)) >= 0 ? 1 : -1) : lookAt;
    v.root.setAttribute('transform', `translate(${cx.toFixed(1)} ${(feet - bob).toFixed(1)}) scale(${dir} ${breath.toFixed(3)})`);
    v.shadow.setAttribute('cx', cx.toFixed(1));
    v.shadow.setAttribute('cy', (feet + 2).toFixed(1));
    /* a small golden marker above the sister the player steers: always on touch, and for a moment after a room starts or a swap */
    const mine = playerId() === id;
    v.mark.setAttribute('visibility', game.state === 'play' && mine && (isTouch || v.markT > 0) ? 'visible' : 'hidden');
    if (mine) v.mark.setAttribute('transform', `translate(0 ${(Math.sin(now * 6) * 3).toFixed(1)})`);
    if (typeof drawOutfit === 'function') drawOutfit(id, f, v.root);   // 75-rewards: dress colour + hat
  }
  /* Show the player marker on the steered sister for a few seconds. */
  function flashPlayerMark(seconds) {
    for (const id of ['frost', 'nuan']) view[id].markT = playerId() === id ? seconds : 0;
  }
