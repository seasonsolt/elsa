  /* Sizes and gamepad focus picking (PLAN-2 D1, D2, D7). Pure: no page access, no clock. Plain global script (see src/lib/save.js).
     Free names: none. Helpers are prefixed `layout` because lib and view share one scope.

     The stage is an SVG of 960 x 520 stage units that 80-input.js (fitStage) scales to the screen; a hit target drawn in stage
     units is therefore `units * stageCssWidth / 960` CSS px big. The rule for children's fingers is 64 CSS px at the reference
     tablet (1024 x 768 landscape), where the stage is as wide as the screen (1024 px). Everything is computed here, from numbers,
     so a test can check it without a browser.

     Provided (hoisted, global):
       LAYOUT                              the numbers: stage size, 64 px target, 72 px touch key, reference viewport
       layoutStageWidth(availW, availH)    CSS width of the stage in a free area (fitStage uses this)
       layoutStageHeight(width)            its height
       layoutCssPx(units, stageCssW)       stage units -> CSS px
       layoutHitMin(stageCssW?)            the smallest hit size in stage units that is still LAYOUT.minHitCss big on screen
       layoutRefStageWidth()               stage width at the reference viewport (with the touch pad showing)
       layoutHitRadius(r, ring)            hit radius of a round picture button of plate radius r (a hold ring widens it)
       layoutPadPick(dir, cur, rects)      the rect a D-pad press moves the focus to ('l' 'r' 'u' 'd'), -1 when none lies that way
       layoutPadStart(rects)               where the focus first lands on a screen: the pulsing button, else the first one */
  const LAYOUT = Object.freeze({ stageW: 960, stageH: 520, minHitCss: 64, touchKeyCss: 72, refW: 1024, refH: 768, touchBarCss: 72 + 2 * 8, ringPad: 8 });

  function layoutStageWidth(availW, availH) { return Math.max(240, Math.floor(Math.min(availW, availH * (LAYOUT.stageW / LAYOUT.stageH)))); }
  function layoutStageHeight(width) { return Math.round(width / (LAYOUT.stageW / LAYOUT.stageH)); }
  function layoutCssPx(units, stageCssW) { return units * stageCssW / LAYOUT.stageW; }
  function layoutRefStageWidth() { return layoutStageWidth(LAYOUT.refW, LAYOUT.refH - LAYOUT.touchBarCss); }
  function layoutHitMin(stageCssW) { return Math.ceil(LAYOUT.minHitCss * LAYOUT.stageW / (stageCssW || layoutRefStageWidth())); }
  function layoutHitRadius(r, ring) { return Math.max(r + (ring ? LAYOUT.ringPad : 0), layoutHitMin() / 2); }

  /* rects: [{ x, y, w, h }] in one unit. A candidate must lie ahead of the focus along the pressed direction, not more than twice as
     far sideways as ahead (so down from the middle button never jumps to a far corner); the nearer along that axis and the straighter
     ahead, the better (sideways drift counts double). Ties go to the earlier rect. */
  function layoutPadPick(dir, cur, rects) {
    const from = rects[cur];
    if (!from) return -1;
    const fx = from.x + from.w / 2, fy = from.y + from.h / 2;
    let best = -1, bestScore = Infinity;
    rects.forEach((r, i) => {
      if (i === cur) return;
      const dx = r.x + r.w / 2 - fx, dy = r.y + r.h / 2 - fy;
      const along = dir === 'r' ? dx : dir === 'l' ? -dx : dir === 'd' ? dy : -dy;
      const across = dir === 'l' || dir === 'r' ? Math.abs(dy) : Math.abs(dx);
      if (along <= 1 || across > 2 * along) return;   // it must lie ahead, inside a cone about 127 degrees wide
      const score = along + 2 * across;
      if (score < bestScore) { best = i; bestScore = score; }
    });
    return best;
  }
  /* rects may carry `pulse: true` (the button the scene is waiting for). */
  function layoutPadStart(rects) {
    if (!rects.length) return -1;
    const i = rects.findIndex(r => r.pulse);
    return i >= 0 ? i : 0;
  }
