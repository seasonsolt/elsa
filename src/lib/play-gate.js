  /* When the room is live (PLAN-2 B5). Plain global script (see src/lib/save.js). No DOM access.
     Free names, supplied by the view scope: playFlow, game, storyIsOpen, uxState, isPortraitView. */
  /* True while the room is live and nothing is covering it (a parent modal, a story page, or the turn-the-tablet picture in portrait). */
  function canPlay() { return playFlow.phase === 'play' && game.state === 'play' && !storyIsOpen() && !uxState.modal && !isPortraitView(); }
