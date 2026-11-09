  /* Particles: painted sparkles that fly, and one-shot puffs that swell and fade */
  const sparks = [];
  function burst(x, y, kind, n, spread) {
    const [w, h] = SIZES[`fx_${kind}`];
    for (let i = 0; i < n && sparks.length < 120; i++) {
      const a = Math.random() * Math.PI * 2, v = (spread || 120) * (.4 + Math.random() * .8);
      const size = 9 + Math.random() * 9;
      const node = img(`fx_${kind}`, -size * w / h / 2, -size / 2, size * w / h, size, $('fx'));
      sparks.push({ node, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 50, g: 300, spin: (Math.random() - .5) * 360, rot: Math.random() * 60, s0: 1, s1: .6, life: .5 + Math.random() * .4, max: .9 });
    }
  }
  function puff(kind, x, y, size, life, rise) {
    const [w, h] = SIZES[`fx_${kind}`];
    const node = img(`fx_${kind}`, -size * w / h / 2, -size / 2, size * w / h, size, $('fx'));
    sparks.push({ node, x, y, vx: 0, vy: -(rise || 0), g: 0, spin: 0, rot: 0, s0: .55, s1: 1.15, life, max: life });
  }
  function drawSparks(dt) {
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.life -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt;
      if (p.life <= 0) { p.node.remove(); sparks.splice(i, 1); continue; }
      const t = 1 - p.life / p.max, sc = p.s0 + (p.s1 - p.s0) * Math.min(1, t * 1.6);
      p.node.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${p.rot.toFixed(0)}) scale(${sc.toFixed(3)})`);
      p.node.setAttribute('opacity', Math.min(1, p.life / p.max * 2.2).toFixed(2));
    }
  }

  function clearFx() {
    for (const p of sparks) p.node.remove();
    sparks.length = 0;
    for (const g of ghosts) g.node.remove();
    ghosts.length = 0;
    for (const f of floaters) f.node.remove();
    floaters.length = 0;
  }

  /* Blink (PLAN A1): a sister vanishes in starlight here and fades back in there. The logic has already moved her, so a
     ghost copy of what is on screen fades out at the old spot while the real sprite fades in at the new one. */
  const ghosts = [];
  function blinkFx(e) {
    const v = view[e.who];
    if (!v) return;
    const copy = v.root.cloneNode(true);
    copy.removeAttribute('id');
    $('fx').appendChild(copy);
    ghosts.push({ node: copy, life: .4, max: .4 });
    /* from / to are feet-centre points, in game pixels */
    const from = e.from || { x: 0, y: 0 }, to = e.to || { x: 0, y: 0 };
    const mid = (game.sisters[e.who] ? game.sisters[e.who].h : 56) * .5;
    puff('glow', from.x, from.y - mid, 90, .5);
    burst(from.x, from.y - mid, 'star', 7, 100);
    puff('ring', to.x, to.y - mid, 80, .55);
    burst(to.x, to.y - mid, 'star', 7, 100);
    v.fadeIn = BLINK_FADE;
  }

  /* A rising number next to a little star: the count of small stars found in this room. */
  const floaters = [];
  function starCount(x, y, n) {
    const node = el('g', {}, $('fx'));
    starSprite(node, -12, 0, 20);
    const t = el('text', { x: 4, y: 8, 'font-size': 24, fill: '#fff4c9', stroke: '#6a4a10', 'stroke-width': 4, 'paint-order': 'stroke', 'stroke-linejoin': 'round' }, node);
    t.textContent = String(n);
    floaters.push({ node, x, y: y - 14, life: 1.1, max: 1.1 });
  }
  function drawFloaters(dt) {
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.life -= dt; f.y -= 38 * dt;
      if (f.life <= 0) { f.node.remove(); floaters.splice(i, 1); continue; }
      const t = 1 - f.life / f.max;
      f.node.setAttribute('transform', `translate(${f.x.toFixed(1)} ${f.y.toFixed(1)}) scale(${(.7 + Math.min(1, t * 4) * .4).toFixed(2)})`);
      f.node.setAttribute('opacity', Math.min(1, f.life / f.max * 2.5).toFixed(2));
    }
  }
  function drawGhosts(dt) {
    for (let i = ghosts.length - 1; i >= 0; i--) {
      const g = ghosts[i];
      g.life -= dt;
      if (g.life <= 0) { g.node.remove(); ghosts.splice(i, 1); continue; }
      g.node.setAttribute('opacity', (g.life / g.max).toFixed(2));
    }
  }

  /* ---- Guide (PLAN A3): a soft light column on the current target, an arrow when it is off screen, and the stuck timer.
     10 s without progress: the companion says the hint. 20 s: a trail of sparkles leads there. Any progress resets both. */
  const guideFx = { t: 0, seen: 0, nextSay: 10, key: '', fade: 0, nodes: [] };
  const GUIDE_SAY_AT = 10, GUIDE_PATH_AT = 20, GUIDE_REPEAT = 20;
  const guideBox = layer('guideBox', 'shadows');     // under the sisters
  const guideTop = layer('guideTop', 'talk');        // over everything in the room
  (function buildGuide() {
    const defs = $('stage').querySelector('defs');
    const add = (tag, attrs, kids) => {
      const n = el(tag, attrs, defs);
      for (const [k, a] of kids || []) el(k, a, n);
      return n;
    };
    add('linearGradient', { id: 'guideH', x1: 0, y1: 0, x2: 1, y2: 0 }, [
      ['stop', { offset: 0, 'stop-color': '#ffd95e', 'stop-opacity': 0 }], ['stop', { offset: .5, 'stop-color': '#ffd95e', 'stop-opacity': 1 }], ['stop', { offset: 1, 'stop-color': '#ffd95e', 'stop-opacity': 0 }]]);
    add('linearGradient', { id: 'guideV', x1: 0, y1: 0, x2: 0, y2: 1 }, [
      ['stop', { offset: 0, 'stop-color': '#fff', 'stop-opacity': 0 }], ['stop', { offset: 1, 'stop-color': '#fff', 'stop-opacity': 1 }]]);
    const mask = add('mask', { id: 'guideMask', maskUnits: 'userSpaceOnUse', x: -40, y: -200, width: 80, height: 230 });
    el('rect', { x: -40, y: -200, width: 80, height: 230, fill: 'url(#guideV)' }, mask);
    guideFx.beam = el('g', { visibility: 'hidden' }, guideBox);
    el('ellipse', { cx: 0, cy: 0, rx: 38, ry: 10, fill: 'url(#warm)' }, guideFx.beam);
    el('rect', { x: -32, y: -190, width: 64, height: 200, fill: 'url(#guideH)', mask: 'url(#guideMask)' }, guideFx.beam);
    guideFx.arrow = el('g', { visibility: 'hidden' }, guideTop);
    el('circle', { r: 26, fill: 'url(#warm)' }, guideFx.arrow);
    el('path', { d: 'M-14-12L6-12L6-22L22 0L6 22L6 12L-14 12Z', fill: '#ffd27a', stroke: '#8a5a12', 'stroke-width': 3, 'stroke-linejoin': 'round' }, guideFx.arrow);
    guideFx.trail = el('g', { visibility: 'hidden' }, guideTop);
    for (let i = 0; i < 16; i++) {
      const [w, h] = SIZES.fx_star || [56, 56], size = 12 + (i % 3) * 3;
      guideFx.nodes.push(img('fx_star', -size * w / h / 2, -size / 2, size * w / h, size, guideFx.trail));
    }
  })();

  function guideTarget() {
    if (typeof game.guide !== 'function') return null;
    try {
      const tg = game.guide();
      if (!tg) return null;
      return Object.assign({}, tg, { x: Number.isFinite(tg.x) ? tg.x : tg.c * T + T / 2, y: Number.isFinite(tg.y) ? tg.y : tg.r * T + T / 2 });
    } catch (e) { return null; }
  }
  function guideReset() {
    guideFx.t = 0; guideFx.seen = game.progress | 0; guideFx.nextSay = GUIDE_SAY_AT; guideFx.key = ''; guideFx.fade = 0;
    guideFx.beam.setAttribute('visibility', 'hidden');
    guideFx.arrow.setAttribute('visibility', 'hidden');
    guideFx.trail.setAttribute('visibility', 'hidden');
  }
  /* The sister whose position the trail starts from: the one the player steers (nearest to the target in duo). */
  function guideFrom(tg) {
    const mine = playerId();
    if (mine && game.sisters[mine]) return game.sisters[mine];
    const list = Object.values(game.sisters);
    list.sort((a, b) => Math.hypot(a.x - tg.x, a.y - tg.y) - Math.hypot(b.x - tg.x, b.y - tg.y));
    return list[0];
  }
  /* active: the room is being played right now (not in a card, a story page or the clear sequence) */
  function guideTick(dt, now, active) {
    const tg = active ? guideTarget() : null;
    if (!tg) { guideFx.beam.setAttribute('visibility', 'hidden'); guideFx.arrow.setAttribute('visibility', 'hidden'); guideFx.trail.setAttribute('visibility', 'hidden'); return; }
    const key = tg.i + ':' + tg.x + ':' + tg.y;
    const progressed = (game.progress | 0) !== guideFx.seen;
    if (progressed) { guideFx.seen = game.progress | 0; guideFx.t = 0; guideFx.nextSay = GUIDE_SAY_AT; }
    if (key !== guideFx.key) { guideFx.key = key; guideFx.fade = 0; }
    guideFx.fade = Math.min(1, guideFx.fade + dt * 2.2);
    guideFx.t += dt;
    if (guideFx.t >= guideFx.nextSay && !playFlow.tutoring) {
      guideFx.nextSay += GUIDE_REPEAT;
      if (tg.say && hasLineKey(tg.say)) vline(tg.say, { interrupt: false });
    }
    const stuck = guideFx.t >= GUIDE_SAY_AT, pathOn = guideFx.t >= GUIDE_PATH_AT;
    const x = tg.x, y = tg.y + 20;   // x/y are the target's centre; the column stands on the floor below it
    /* light column: always there, brighter and breathing once the player seems stuck */
    guideFx.beam.setAttribute('visibility', 'visible');
    guideFx.beam.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    guideFx.beam.setAttribute('opacity', (guideFx.fade * (stuck ? .8 + Math.sin(now * 4) * .2 : .5 + Math.sin(now * 2) * .08)).toFixed(2));
    /* arrow: on the screen edge when the target is out of view; a bobbing arrow right above it once stuck */
    const M = 14, off = x < M || x > 960 - M || tg.y < M || tg.y > 520 - M;
    if (off || stuck) {
      let ax, ay, ang;
      if (off) {
        const from = guideFrom(tg), cx = from ? from.x + from.w / 2 : 480, cy = from ? from.y + from.h / 2 : 260;
        ang = Math.atan2(tg.y - cy, tg.x - cx);
        ax = Math.max(34, Math.min(926, tg.x)); ay = Math.max(34, Math.min(486, tg.y));
      } else { ang = Math.PI / 2; ax = x; ay = tg.y - 64 + Math.sin(now * 5) * 7; }
      guideFx.arrow.setAttribute('visibility', 'visible');
      guideFx.arrow.setAttribute('transform', `translate(${ax.toFixed(1)} ${ay.toFixed(1)}) rotate(${(ang * 180 / Math.PI).toFixed(1)})`);
    } else guideFx.arrow.setAttribute('visibility', 'hidden');
    /* sparkle trail from the player to the target: an arc, with a bright wave running towards the target */
    if (pathOn) {
      const from = guideFrom(tg);
      if (from) {
        const sx = from.x + from.w / 2, sy = from.y + from.h / 2, ex = tg.x, ey = tg.y;
        const cx = (sx + ex) / 2, cy = Math.min(sy, ey) - 50 - Math.abs(ex - sx) * .08;
        const n = guideFx.nodes.length;
        guideFx.nodes.forEach((node, i) => {
          const u = (i + 1) / (n + 1), a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
          const px = a * sx + b * cx + c * ex, py = a * sy + b * cy + c * ey;
          const wave = .5 + .5 * Math.sin((now * 1.6 - u * 1.4) * Math.PI * 2);
          node.setAttribute('transform', `translate(${px.toFixed(1)} ${py.toFixed(1)}) scale(${(.55 + wave * .6).toFixed(2)})`);
          node.setAttribute('opacity', (.3 + wave * .7).toFixed(2));
        });
        guideFx.trail.setAttribute('visibility', 'visible');
      }
    } else guideFx.trail.setAttribute('visibility', 'hidden');
  }

  /* ---- Per-event visuals. Sounds and voices belong to audioOnEvents / talkOnEvents (called before this). ---- */
  function cheerBurst() {
    for (const s of Object.values(game.sisters)) {
      const x = s.x + s.w / 2, y = s.y;
      burst(x, y, 'star', 8, 140); burst(x, y, 'heart', 5, 110); burst(x, y, 'flake', 5, 110);
    }
  }
  function fxOnEvents(events) {
    let tiles = false;
    for (const e of events) {
      switch (e.type) {
        case 'load': rebuild(); tiles = false; break;
        case 'freeze': tiles = true; puff('ring', e.c * T + 20, e.r * T + 14, 64, .55); burst(e.c * T + 20, e.r * T + 10, 'flake', 5); view.frost.castT = .3; break;
        case 'block': tiles = true; puff('burst', e.c * T + 20, e.r * T + 20, 86, .5); burst(e.c * T + 20, e.r * T + 20, 'flake', 6); view.frost.castT = .3; break;
        case 'unblock': tiles = true; puff('dust', e.c * T + 20, e.r * T + 30, 44, .5); break;
        case 'melt': tiles = true; puff('glow', e.c * T + 20, e.r * T + 20, 96, .7); puff('steam', e.c * T + 20, e.r * T + 4, 70, 1.1, 40); burst(e.c * T + 20, e.r * T + 20, 'heart', 5); view.nuan.castT = .3; break;
        case 'fizz': burst(e.x, e.y + 20, e.who === 'frost' ? 'flake' : 'heart', 3, 70); view[e.who].castT = .22; break;
        case 'doublejump': puff('dust', e.x, e.y + 4, 36, .4); burst(e.x, e.y, 'star', 5, 90); break;
        case 'splash': puff('splash', e.x, e.y - 14, 70, .6); break;
        case 'respawn': { const s = game.sisters[e.who]; if (s) { puff('glow', s.x + s.w / 2, s.y + s.h / 2, 80, .5); burst(s.x + s.w / 2, s.y + s.h / 2, 'star', 4, 80); } break; }
        case 'collect':
          if (e.kind === '+') { burst(e.x, e.y, 'star', 7, 100); puff('ring', e.x, e.y, 56, .45); starCount(e.x, e.y, e.n || 1); }
          else burst(e.x, e.y, e.kind === 'h' ? 'heart' : e.kind === 'o' ? 'star' : 'flake', 8);
          drawItems();
          if (e.kind === 'o') drawGoal();
          break;
        case 'open': drawGoal(); if (game.door) { puff('glow', game.door.x, game.door.bottom - 50, 150, .9); burst(game.door.x, game.door.bottom - 60, 'star', 10, 130); } break;
        case 'gate': drawGates(); break;
        case 'blink': blinkFx(e); break;
        case 'memory': foundFragment(); break;
        case 'swap': flashPlayerMark(2.4); onPlayerSwapped(e); break;
        case 'clear': cheerBurst(); break;
      }
    }
    if (tiles) drawTiles();
  }

  /* Once per frame, after the logic has stepped. `play`: the room is live. */
  let shownBlocks = -1;
  function fxFrame(dt, now, play) {
    if (game.blocks.length !== shownBlocks) { shownBlocks = game.blocks.length; drawTiles(); }
    drawSparks(dt); drawGhosts(dt); drawFloaters(dt);
    guideTick(dt, now, play);
    if (game.state === 'win' && Math.random() < .25) burst(Math.random() * 960, 200 + Math.random() * 180, ['star', 'heart', 'flake'][Math.floor(Math.random() * 3)], 2, 90);
  }
