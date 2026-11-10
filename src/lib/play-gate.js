  /* When the room is live (PLAN-2 B5). Plain global script (see src/lib/save.js). No DOM access.
     Free names, supplied by the view scope: playFlow, game, storyIsOpen, uxState. */
  /* True while the room is live and nothing is covering it. */
  function canPlay() { return playFlow.phase === 'play' && game.state === 'play' && !storyIsOpen() && !uxState.modal; }
