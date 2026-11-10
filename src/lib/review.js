  /* Spaced review and quiz option picking (PLAN-2 C2, C3). Pure: no storage, no DOM, no clock, no random source of its own.
     Plain global script (see src/lib/save.js). Time comes in as a "room clock" (a whole number that goes up by one every time the
     child enters a room, kept in save.roomClock, first room = 1) and randomness as an `rng` function returning [0, 1).
     Free names: none. Helpers are prefixed `rv` / `review` because lib and view share one scope.

     `saveWords` is save.words: { [wordId]: { heard, quiz, seen?, wrong?, lastSeen?, lastWrong?, lastReviewed?, reviews? } }
       heard         times the word was heard in full (noteWordHeard in heard.js)
       quiz          quiz questions answered right at the first try
       wrong         quiz questions that were not answered right at the first try
       seen          met on a card even with the sound off
       lastSeen      room clock of the latest encounter (heard, quiz, review)
       lastWrong     room clock of the latest wrong quiz answer
       lastReviewed  room clock of the latest review (recall card, or a right answer after a miss)
       reviews       how many times it was reviewed; stretches the gap to the next review
     The previous room's words in a recall are the recap of that room, not a spaced review: hear them with noteHeard like any word,
     but call noteReviewed only for recallOlderIds(...), otherwise the recap would keep them out of the very next recall.
     "Open miss": wrong > 0 and lastWrong >= lastReviewed, i.e. missed and not reviewed since. Open misses come first.
     `context` is { clock, exclude?, limit? }: clock = the room clock now; exclude = word ids that must not come back (the words of
     the room being entered); limit = at most this many ids from reviewDue.

     Provided (hoisted, global):
       reviewDue(saveWords, context)                          -> word ids due for review, most urgent first
       recallWordsFor(prevRoomWords, saveWords, context)      -> the previous room's words, then at most 2 due older words
       recallOlderIds(prevRoomWords, recall)                  -> just the older words of such a list: the ones to noteReviewed
       quizOptions(targetId, roomWords, learnedOtherRoomWords, saveWords, rng) -> up to 3 distinct ids, the target among them
       noteQuizAnswer(saveWords, id, firstTry, context)       -> counts one quiz question; the record, or null for a bad id
       noteReviewed(saveWords, id, context)                   -> an OLDER word was shown again in a recall; the record, or null
       noteHeard(saveWords, id, context)                      -> heard + 1 and lastSeen; the record, or null
       reviewContext(save) / reviewAdvanceClock(save)         -> { clock } of a save / enter a room: bump save.roomClock, return it
       reviewLearned(saveWords, ids)                          -> the ids of `ids` the child has met (never-learned ones dropped)
       makeReviewRng(seed)                                    -> a seeded mulberry32 generator for tests and daily seeds */
  const REVIEW_INTERVALS = [1, 3, 6, 12];   // rooms that must pass since the last encounter, by how often the word was reviewed already
  const REVIEW_GAP = 2;                     // a reviewed word stays away for the next room: back after at least this many ticks
  const REVIEW_OLD_MAX = 2;                 // older words added to the previous room's words in a recall

  function rvNat(v) { return Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0; }
  function rvClock(context) { return Math.max(1, rvNat(context && context.clock)); }
  function rvValidId(id) { return typeof id === 'string' && id !== '' && id !== '__proto__'; }
  function rvRecord(saveWords, id) {
    if (!saveWords || typeof saveWords !== 'object' || !rvValidId(id)) return null;
    const w = saveWords[id];
    if (w && typeof w === 'object') return w;
    return (saveWords[id] = { heard: 0, quiz: 0 });
  }
  function rvLearned(w) { return !!w && typeof w === 'object' && (rvNat(w.heard) > 0 || !!w.seen || rvNat(w.quiz) > 0 || rvNat(w.wrong) > 0); }
  function rvOpenMiss(w) { return rvNat(w.wrong) > 0 && rvNat(w.lastWrong) >= rvNat(w.lastReviewed); }
  function rvByText(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

  /* Fisher-Yates, in place; `rng` must return [0, 1). */
  function rvShuffle(list, rng) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.min(i, Math.floor(rng() * (i + 1)));
      const t = list[i]; list[i] = list[j]; list[j] = t;
    }
    return list;
  }
  function makeReviewRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function reviewContext(save) { return { clock: Math.max(1, rvNat(save && save.roomClock)) }; }
  function reviewAdvanceClock(save) { save.roomClock = rvNat(save.roomClock) + 1; return save.roomClock; }
  function reviewLearned(saveWords, ids) {
    const out = [];
    for (const id of ids || []) if (rvValidId(id) && !out.includes(id) && saveWords && rvLearned(saveWords[id])) out.push(id);
    return out;
  }

  function reviewDue(saveWords, context) {
    const clock = rvClock(context);
    const skip = new Set((context && context.exclude) || []);
    const open = [], spaced = [];
    for (const id of Object.keys(saveWords || {})) {
      const w = saveWords[id];
      if (!rvValidId(id) || skip.has(id) || !rvLearned(w)) continue;
      const lastReviewed = rvNat(w.lastReviewed);
      if (lastReviewed > 0 && clock - lastReviewed < REVIEW_GAP) continue;   // reviewed within the last room
      if (rvOpenMiss(w)) { open.push({ id, wrong: rvNat(w.wrong), at: rvNat(w.lastWrong) }); continue; }
      const gap = REVIEW_INTERVALS[Math.min(rvNat(w.reviews), REVIEW_INTERVALS.length - 1)];
      const overdue = clock - rvNat(w.lastSeen) - gap;
      if (overdue >= 0) spaced.push({ id, overdue, quiz: rvNat(w.quiz) });
    }
    open.sort((a, b) => b.wrong - a.wrong || a.at - b.at || rvByText(a.id, b.id));
    spaced.sort((a, b) => b.overdue - a.overdue || a.quiz - b.quiz || rvByText(a.id, b.id));
    const ids = open.concat(spaced).map(x => x.id);
    const limit = context && Number.isFinite(context.limit) ? Math.max(0, Math.floor(context.limit)) : ids.length;
    return ids.slice(0, limit);
  }

  function recallWordsFor(prevRoomWords, saveWords, context) {
    const prev = [];
    for (const id of prevRoomWords || []) if (rvValidId(id) && !prev.includes(id)) prev.push(id);
    const exclude = prev.concat((context && context.exclude) || []);
    const older = reviewDue(saveWords, Object.assign({}, context, { exclude, limit: REVIEW_OLD_MAX }));
    return prev.concat(older);
  }

  function recallOlderIds(prevRoomWords, recall) { return (recall || []).filter(id => !(prevRoomWords || []).includes(id)); }

  /* Up to 3 distinct ids (fewer only when the words given are too few): the target, one word from another room whenever
     `learnedOtherRoomWords` has any, and a third from the other rooms or the target's room. Among equals, words answered wrong
     before are preferred (open misses most), then the rng decides. The result is shuffled so the target lands anywhere. */
  function quizOptions(targetId, roomWords, learnedOtherRoomWords, saveWords, rng) {
    const rand = typeof rng === 'function' ? rng : makeReviewRng(1);
    const taken = new Set([targetId]);
    const fresh = list => {
      const out = [];
      for (const id of list || []) if (rvValidId(id) && !taken.has(id) && !out.includes(id)) out.push(id);
      return out;
    };
    const others = fresh(learnedOtherRoomWords);
    const sameRoom = fresh(roomWords).filter(id => !others.includes(id));
    const weight = id => {
      const w = saveWords && saveWords[id];
      return !w || typeof w !== 'object' ? 0 : rvOpenMiss(w) ? 2 : rvNat(w.wrong) > 0 ? 1 : 0;
    };
    const ranked = list => rvShuffle(list.slice(), rand).sort((a, b) => weight(b) - weight(a));   // stable: ties keep the shuffled order
    const picks = [targetId];
    if (others.length) picks.push(ranked(others)[0]);
    const rest = ranked(others.concat(sameRoom).filter(id => !picks.includes(id)));
    while (picks.length < 3 && rest.length) picks.push(rest.shift());
    return rvShuffle(picks, rand);
  }

  function noteHeard(saveWords, id, context) {
    const w = rvRecord(saveWords, id);
    if (!w) return null;
    w.heard = rvNat(w.heard) + 1;
    w.lastSeen = Math.max(rvNat(w.lastSeen), rvClock(context));
    return w;
  }
  function noteQuizAnswer(saveWords, id, firstTry, context) {
    const w = rvRecord(saveWords, id);
    if (!w) return null;
    const clock = rvClock(context);
    const missedBefore = rvOpenMiss(w);
    if (firstTry) {
      w.quiz = rvNat(w.quiz) + 1;
      if (missedBefore && clock > rvNat(w.lastWrong)) w.lastReviewed = Math.max(rvNat(w.lastReviewed), clock);   // knew it now: the old miss is settled
    } else {
      w.wrong = rvNat(w.wrong) + 1;
      w.lastWrong = Math.max(rvNat(w.lastWrong), clock);
    }
    w.lastSeen = Math.max(rvNat(w.lastSeen), clock);
    return w;
  }
  function noteReviewed(saveWords, id, context) {
    const w = rvRecord(saveWords, id);
    if (!w) return null;
    const clock = rvClock(context);
    w.reviews = rvNat(w.reviews) + 1;
    w.lastReviewed = Math.max(rvNat(w.lastReviewed), clock);
    w.lastSeen = Math.max(rvNat(w.lastSeen), clock);
    return w;
  }
