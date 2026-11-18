  /* Which pictures load when, and whether the offline worker may run (PLAN-2 D4, D5). Plain global script (see src/lib/save.js):
     no DOM, no browser globals, no Image objects; everything comes in as arguments, so a test can add up the file sizes of a list.
     Free names: none.
       assetPlan(levels, lines, opts)  -> { title, prologue, ending, rooms }   picture names (no ".webp"), rooms[i] for LEVELS[i]
       roomArt(level, lines, opts)     -> the pictures one room needs on top of the title set
       offlineWorkerAllowed(search, protocol, hasApi)
     opts: { wear: save.outfit, extraWords: [word ids the recall card shows], last: true for the final room }.
     The title list is one literal on purpose: art/build_page.py reads it (the markers around it) to fill the precache list of
     sw.js, so what the page loads before it is interactive and what the service worker keeps for offline play cannot drift apart.
     It must stay valid JSON, and it names files (with .webp), not pictures. A test sums the file sizes of the list against the 2 MB budget and checks that it covers the first room. */
  const ART_FRAMES = ['idle', 'blink', 'run1', 'run2', 'run3', 'run4', 'run5', 'run6', 'jump', 'fall', 'cast', 'cheer'];
  /*TITLE_ART*/const ART_TITLE = [
    "key.webp", "bg0.webp",
    "ui_back.webp", "ui_book.webp", "ui_bulb.webp", "ui_duo.webp", "ui_ear.webp", "ui_fullscreen.webp", "ui_gear.webp",
    "ui_key_left.webp", "ui_key_right.webp", "ui_key_up.webp", "ui_key_space.webp", "ui_keys.webp", "ui_meet.webp", "ui_mouth.webp",
    "ui_next.webp", "ui_play.webp", "ui_replay.webp", "ui_solo.webp", "ui_sticker.webp", "ui_wardrobe.webp",
    "fx_burst.webp", "fx_dust.webp", "fx_flake.webp", "fx_glow.webp", "fx_heart.webp", "fx_ring.webp", "fx_splash.webp", "fx_star.webp", "fx_steam.webp",
    "frost_idle.webp", "frost_blink.webp", "frost_run1.webp", "frost_run2.webp", "frost_run3.webp", "frost_run4.webp", "frost_run5.webp", "frost_run6.webp", "frost_jump.webp", "frost_fall.webp", "frost_cast.webp", "frost_cheer.webp",
    "nuan_idle.webp", "nuan_blink.webp", "nuan_run1.webp", "nuan_run2.webp", "nuan_run3.webp", "nuan_run4.webp", "nuan_run5.webp", "nuan_run6.webp", "nuan_jump.webp", "nuan_fall.webp", "nuan_cast.webp", "nuan_cheer.webp",
    "portrait_frost.webp", "portrait_nuan.webp",
    "brick.webp", "water.webp", "drift0.webp", "drift1.webp", "iceblock.webp", "frozen.webp",
    "shelf0.webp", "shelf1.webp", "shelf2.webp", "pinkice.webp", "flake.webp", "heart.webp", "ball.webp", "door_closed.webp", "door_open.webp"
  ];/*END_TITLE_ART*/
  /* what one map character puts on the stage, beyond the title set (walls, water, drifts, and the ice blocks and frozen water that Elsa's
     magic makes in any room: they are never in a map, so they are always loaded; the HUD counters flake, heart, ball are in the title set too) */
  const ART_TILES = {
    '=': ['shelf0', 'shelf1', 'shelf2'], X: ['pinkice'], I: ['frozen'], B: ['iceblock'], G: ['gate'], P: ['plate_up', 'plate_down'],
    '*': ['flake'], h: ['heart'], o: ['ball'], D: ['door_closed', 'door_open'], S: ['ball', 'two', 'snowman', 'hat_snowman'],
    '/': ['tile_slope_l'], '\\': ['tile_slope_r'], J: ['spring_0', 'spring_1'],
    R: ['bunny_idle', 'bunny_hop1', 'bunny_hop2', 'bunny_hop3', 'bunny_hop4', 'bunny_home'], N: ['bunny_nest', 'bunny_home'],
    M: ['floe_l', 'floe_m', 'floe_r'], F: ['flower_0', 'flower_1', 'flower_2'],
    1: ['note_1', 'note_1_lit'], 2: ['note_2', 'note_2_lit'], 3: ['note_3', 'note_3_lit'], 4: ['note_4', 'note_4_lit'], 5: ['note_5', 'note_5_lit'],
  };

  function roomArt(level, lines, opts) {
    const o = opts || {}, L = (lines && lines.lines) || {}, out = [];
    const add = name => { if (name && !out.includes(name)) out.push(name); };
    const lineArt = key => { const d = L[key]; if (d && d.art) add(d.art); };
    add(level.bg);
    const chars = new Set((level.map || []).concat(...(level.more || []).map(s => s.map)).join(''));   // every screen of the room
    for (const ch of chars) (ART_TILES[ch] || []).forEach(add);
    (level.words || []).concat(o.extraWords || []).forEach(w => add(`word_${w}`));
    if ((level.words || []).includes('fish')) { add('fish_1'); add('fish_2'); }
    lineArt(`ch_${level.id}`); lineArt(`clear_${level.id}`);
    if (level.memoryId) lineArt(`mem_${level.memoryId}`);
    add(`sticker_${level.id}`); add(`sticker_${level.id}_gold`);
    if (o.last) { lineArt('win'); lineArt('end'); }
    return out.concat(outfitArt(o.wear)).filter((n, i, a) => a.indexOf(n) === i);
  }
  /* The dress frames and hats the sisters wear: only the worn ones are fetched (the other dresses stay on the server). */
  function outfitArt(wear) {
    const out = [];
    for (const who of ['frost', 'nuan']) {
      const w = wear && wear[who];
      if (!w) continue;
      if (w.dress === 1 || w.dress === 2) for (const f of ART_FRAMES) out.push(`${who}_${f}_d${w.dress}`);
      if (typeof w.hat === 'string' && w.hat) out.push(`hat_${w.hat}`);
    }
    return out;
  }
  function assetPlan(levels, lines, opts) {
    const o = opts || {}, L = (lines && lines.lines) || {};
    const arts = keys => keys.map(k => L[k] && L[k].art).filter(Boolean).filter((n, i, a) => a.indexOf(n) === i);
    return {
      title: ART_TITLE.map(f => f.replace(/\.webp$/, '')).concat(outfitArt(o.wear)).filter((n, i, a) => a.indexOf(n) === i),
      prologue: arts(['p1', 'p2', 'p3']),
      ending: arts(['win', 'end']),
      rooms: levels.map((lv, i) => roomArt(lv, lines, { wear: o.wear, last: i === levels.length - 1 })),
    };
  }
  /* The offline worker (PLAN-2 D5) is registered on a real http(s) page only, never for ?dev=1 and never from file://. */
  function offlineWorkerAllowed(search, protocol, hasApi) {
    return !!hasApi && /^https?:$/.test(String(protocol)) && !/[?&]dev=1\b/.test(String(search || ''));
  }
