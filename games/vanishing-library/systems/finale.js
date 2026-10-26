// The finale (design: The path through the game, 9; Ending (decided)): back
// in town after the Dragon, the trapdoor in front of the puppet stage hangs
// open; below it are Mrs. Fenwick's workshop and the tunnel to the dragon.
// Mr. Fenwick follows the hero down, she sets three giant marionettes on them
// (entities/marionette.js: cut every string; she is never fought), then
// confesses through one last puppet show, he forgives her, and the ending
// plays (scenes/finale.js). Every beat is a saved flag, set as it ends, so a
// reload anywhere picks up at the next one. The place and its words live in
// dungeons/workshop.js. README "The finale (W20)".
(() => {
  VL.tune({
    // A breath between the last puppet falling and her coming down.
    finaleWinPause: 1.2,
  });

  // The beats, in order. `trapdoorOpen`, `marionettes` and `forgiven` are the
  // story's; the rest are the conversations between them.
  VL.FINALE_BEATS = ['trapdoorOpen', 'finale:followed', 'finale:confronted', 'marionettes', 'finale:showAsked', 'finale:shown', 'forgiven'];

  const flag = (state, id) => Boolean(state.flags[id]);
  const reached = (state, id) => Boolean(VL.LOCKS[id]?.reached?.(state));

  VL.trapdoorIsOpen = (state) => flag(state, 'trapdoorOpen');
  // From the open trapdoor until she is forgiven: she is below, not at her stage.
  VL.finaleUnderway = (state) => VL.trapdoorIsOpen(state) && !flag(state, 'forgiven');
  // Once she is forgiven the books are all back for good, and she steals no more.
  VL.libraryFull = (state) => flag(state, 'forgiven');

  // A talk with more than one speaker: lines are [speaker, text] pairs, each
  // its own page (or pages); `end` is VL.endTalk's.
  VL.conversation = function conversation(state, lines, end = null) {
    const pages = [];
    const speakers = [];
    for (const [speaker, text] of lines) {
      for (const page of VL.dialoguePages(text, state)) {
        pages.push(page);
        speakers.push(VL.popupText(speaker, state));
      }
    }
    VL.requestScene(state, 'dialogue', { speaker: speakers[0], speakers, pages, end });
  };

  // What S at the stage does: nothing while she is away, her kind shows once
  // she is forgiven (one after the other through a visit), her arc before.
  VL.stageShow = function stageShow(state) {
    if (VL.finaleUnderway(state)) return { message: VL.FINALE_WORDS.emptyStage };
    if (VL.libraryFull(state)) {
      const kind = state.room.kindShows || 0;
      state.room.kindShows = kind + 1;
      return { show: { kind } };
    }
    return { show: { show: VL.wifeStage(state) } };
  };

  VL.definePopup('trapdoorOpen', {
    title: 'The trapdoor is open!',
    text: 'In front of the puppet stage, the trapdoor hangs open over a ladder going down into the dark. And where is Mrs. Fenwick?',
  });

  // The ending brings home every book he carries (the hoard's three among
  // them), so none is left to hand in afterwards. `finale:booksHome` marks it
  // done; a save forgiven before W33 lacks it, so its carried books are still
  // due (and books found after the ending are ordinary finds again).
  VL.booksDueHome = (state) => (flag(state, 'forgiven') && !flag(state, 'finale:booksHome') ? VL.booksCarried(state) : []);
  function bringBooksHome(state) {
    const ids = VL.booksDueHome(state);
    state.library.returned.push(...ids);
    state.flags['finale:booksHome'] = true;
    VL.earned(state);
    return ids;
  }

  // She gives back every book she took, and the shelves fill for good.
  VL.defineGift('finaleForgiven', (state) => {
    state.library.gone = [];
    state.library.noticed = 0;
    bringBooksHome(state);
    state.events.push({ type: 'finaleForgiven' });
  });

  // An older save forgiven without them: quietly, on the first step after loading.
  VL.defineSystem('finaleBooksHome', {
    order: 1,
    update(state) {
      if (flag(state, 'forgiven') && !flag(state, 'finale:booksHome')) bringBooksHome(state);
    },
  });

  const busy = (state) => Boolean(state.sceneRequest || state.transition || state.holdUp || VL.currentPopup(state)
    || state.hp <= 0 || state.player.carrying || state.player.flight);
  const inRoom = (state, area, screen) => state.room.area === area && state.room.screen === screen;

  VL.defineSystem('finale', {
    order: 97,
    update(state, actions, dt) {
      if (state.finished || busy(state)) return;
      const words = VL.FINALE_WORDS;
      if (!flag(state, 'trapdoorOpen')) {
        // Back in town as a hero: the square shows what the Dragon's fall let loose.
        if (inRoom(state, 'overworld', VL.FINALE.square) && reached(state, 'd4Boss')) {
          state.flags.trapdoorOpen = true;
          for (const hatch of state.room.entities) if (hatch.type === 'trapdoor') hatch.open = true;
          VL.showPopup(state, 'trapdoorOpen');
          state.events.push({ type: 'trapdoorOpened' });
          VL.earned(state);
        }
        return;
      }
      // Forgiven: the ending plays wherever he is (a reload during it starts it again).
      if (flag(state, 'forgiven')) {
        VL.requestScene(state, 'ending');
        return;
      }
      if (state.room.area !== VL.FINALE.area) return;
      if (state.room.screen === VL.FINALE.workshop && !flag(state, 'finale:followed')) {
        VL.conversation(state, words.followed, { set: 'finale:followed' });
        return;
      }
      if (state.room.screen !== VL.FINALE.hall) return;
      if (!flag(state, 'finale:confronted')) {
        VL.conversation(state, words.confronted, { set: 'finale:confronted' });
        return;
      }
      if (!flag(state, 'marionettes')) return;
      state.room.finaleWait = (state.room.finaleWait || 0) + dt;
      if (state.room.finaleWait < VL.TUNING.finaleWinPause) return;
      VL.wifeComesDown(state);
      if (!flag(state, 'finale:showAsked')) VL.conversation(state, words.showAsked, { set: 'finale:showAsked' });
      else if (!flag(state, 'finale:shown')) VL.requestScene(state, 'puppetShow', { confession: true, end: { set: 'finale:shown' } });
      else VL.conversation(state, words.forgiven, { set: 'forgiven', give: { finaleForgiven: true } });
    },
  });

  VL.defineSfx('trapdoorCreak', [
    { wave: 'sawtooth', freq: 180, to: 120, dur: 0.35, vol: 0.12, filter: { type: 'lowpass', freq: 900 } },
    { wave: 'triangle', freq: 90, at: 0.3, dur: 0.25, vol: 0.25 },
  ], { gap: 1 });
  VL.SOUND.onEvent('trapdoorOpened', 'trapdoorCreak');
  VL.SOUND.onEvent('finaleForgiven', 'libraryChime');

  // ---------- progression (README "Progression") ----------

  VL.defineLock('trapdoorOpen', { ...VL.LOCKS.trapdoorOpen, reached: (state) => VL.trapdoorIsOpen(state) });
  VL.defineLock('workshop', { ...VL.LOCKS.workshop, reached: (state) => Boolean(state.visited['workshop:0,0']), place: { area: 'workshop', screen: '0,0' } });
  VL.defineLock('marionettes', { ...VL.LOCKS.marionettes, reached: (state) => flag(state, 'marionettes') });
  VL.defineLock('ending', { ...VL.LOCKS.ending, reached: (state) => Boolean(state.finished) });
})();
