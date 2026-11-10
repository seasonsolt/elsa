  /* Word-heard bookkeeping (PLAN-2 B5): the saved counter and the per-room dev counter, fed by one call.
     Plain global script (see src/lib/save.js). No DOM access.
     Free names, supplied by the view scope: save, WORDS, LEVELS, game, saveSoon. */
  /* Dev counter: how often each word was heard, per room (?dev=1, CONTRACT §4 wordStats). */
  const heardLog = {};
  function noteWordHeard(wordId) {
    if (typeof wordId !== 'string' || !wordId) return;
    const w = save.words[wordId] || (save.words[wordId] = { heard: 0, quiz: 0 });
    w.heard++;
    const word = WORDS.find(w => w.id === wordId);
    const lv = LEVELS[game.index], room = (word && word.room) || (lv && lv.id) || '?';
    const byRoom = heardLog[wordId] || (heardLog[wordId] = {});
    byRoom[room] = (byRoom[room] || 0) + 1;
    saveSoon();
  }
