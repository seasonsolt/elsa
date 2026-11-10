  /* Word-heard bookkeeping (PLAN-2 B5): the saved counter and the per-room dev counter, fed by one call.
     Plain global script (see src/lib/save.js). No DOM access.
     Free names, supplied by the view scope: save, WORDS, LEVELS, game, saveSoon; noteHeard and reviewContext come from src/lib/review.js. */
  /* Dev counter: how often each word was heard, per room (?dev=1, CONTRACT §4 wordStats). */
  const heardLog = {};
  function noteWordHeard(wordId) {
    if (typeof wordId !== 'string' || !wordId) return;
    if (!noteHeard(save.words, wordId, reviewContext(save))) return;
    const word = WORDS.find(w => w.id === wordId);
    const lv = LEVELS[game.index], room = (word && word.room) || (lv && lv.id) || '?';
    const byRoom = heardLog[wordId] || (heardLog[wordId] = {});
    byRoom[room] = (byRoom[room] || 0) + 1;
    saveSoon();
  }
