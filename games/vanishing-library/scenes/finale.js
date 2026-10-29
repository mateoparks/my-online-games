// The ending (design: Ending (decided), Final scenes before the credits):
// back in the library, the town fills the shelves with the hoard's books, a
// book about the hero goes on the shelf, the town cheers the hero by name, a
// line about the town writing its own books, then the credits and the title. The game is
// marked finished as the credits begin, so a reload from there on shows the
// slot as FINISHED; Continue wakes him at his last save point before the
// finale (the hut), in the world after the ending. README "The finale (W20)".
(() => {
  VL.ENDING_TIMES = { fadeIn: 1.2, fadeOut: 1.2, fillPerSecond: 0.35, creditsSpeed: 14 };
  const T = VL.ENDING_TIMES;

  // Where everyone stands in the library (tiles); the hero faces the desk.
  const HERO_AT = { area: 'library', screen: '0,0', tx: 7, ty: 6, facing: 'up' };
  // The speakers stand on row 5, where a box at the bottom leaves them in
  // view, and the shelves along the top stay clear of every box.
  const PARTY = [
    { id: 'librarianWife', x: 9, y: 3, facing: 'down' },
    { id: 'gran', x: 3, y: 5, facing: 'right' },
    { id: 'juniper', x: 5, y: 5, facing: 'right' },
    { id: 'nell', x: 10, y: 5, facing: 'left' },
    { id: 'binder', x: 12, y: 5, facing: 'left' },
    { id: 'chickenKid', x: 3, y: 7, facing: 'up' },
    { id: 'shopkeeper', x: 5, y: 7, facing: 'up' },
    { id: 'smith', x: 10, y: 7, facing: 'up' },
    { id: 'miller', x: 12, y: 7, facing: 'up' },
  ];

  // Each beat is a page of words: `speaker`, `at` (where the box goes, clear
  // of whoever is in the picture), `fill` (how full the shelves get), `party`
  // (the town is there), `heroBook`, `cheer` (everyone hops).
  VL.ENDING_BEATS = [
    { say: 'The whole town helped carry the Dragon\'s hoard home, and the books went back on the shelves. This time, they stayed.', at: 'bottom', fill: 1, party: true },
    { speaker: 'Miss Quill', say: 'And here\'s a brand-new one I bound myself: "The Adventures of {name}"!', at: 'bottom', party: true, heroBook: true },
    { speaker: 'Gran Ottie', say: 'Three cheers for {name}!', at: 'bottom', party: true, heroBook: true },
    { speaker: 'Everyone', say: 'Hip, hip, hooray! Hip, hip, hooray! Hip, hip, HOORAY!', at: 'bottom', party: true, heroBook: true, cheer: true },
    { say: 'Before long, the whole town was reading and writing books of its own, and Miss Quill\'s bindery was busy day and night.', at: 'bottom', party: true, heroBook: true },
  ];

  // Blank strings are gaps; `big` lines are titles.
  VL.CREDITS = [
    { big: 'THE VANISHING LIBRARY' },
    '',
    'Starring {name}',
    '',
    'Mr. Fenwick, the librarian',
    'Mrs. Fenwick, puppeteer',
    'Gran Ottie, by the well',
    'Nell, down at the pier',
    'Pip, and Henrietta the chicken',
    'Mabel at the shop',
    'Mr. Pell at the paper mill',
    'Brannock the smith',
    'Miss Quill at the bindery',
    'Juniper and Mr. Bramble',
    '',
    'Game design: Matthew',
    'Made for the Coding with AI class',
    '',
    'Thank you for playing, {name}!',
    '',
    '',
    { big: 'THE END' },
  ];
  const LINE = 14;
  const creditsHeight = () => VL.CREDITS.length * LINE;

  VL.defineSfx('endingTune', [
    { wave: 'triangle', freq: 523, dur: 0.3, vol: 0.25 },
    { wave: 'triangle', freq: 659, at: 0.25, dur: 0.3, vol: 0.25 },
    { wave: 'triangle', freq: 784, at: 0.5, dur: 0.3, vol: 0.25 },
    { wave: 'triangle', freq: 1047, at: 0.75, dur: 0.7, vol: 0.25 },
  ], { gap: 1 });

  const beatOf = (view) => VL.ENDING_BEATS[view.beat];
  const textOf = (view, game) => VL.popupText(beatOf(view).say, game);
  const shelves = (game) => game.room.entities.filter((e) => e.type === 'libraryShelf');

  function stage(game) {
    VL.place(game, HERO_AT);
    game.room.entities = game.room.entities.filter((e) => !(e.type === 'npc' && e.id !== 'librarian'));
    for (const shelf of shelves(game)) shelf.fill = 0;
  }

  function startPhase(view, phase) {
    view.phase = phase;
    view.t = 0;
  }

  // The credits begin: the game is finished for good (saved this step).
  function finish(app, view) {
    startPhase(view, 'credits');
    app.game.finished = true;
    VL.earned(app.game);
    VL.sfx('endingTune');
  }

  VL.defineScene('ending', {
    enter(app) {
      stage(app.game);
      app.ending = { phase: 'fadeIn', t: 0, beat: 0, shown: 0, fill: 0, party: false };
    },

    update(app, actions, dt) {
      const view = app.ending;
      const game = app.game;
      view.t += dt;
      if (view.phase === 'fadeIn') {
        // Esc skips to the credits here too, fading out from as dark as it is.
        if (actions.pressed.pause) {
          const dark = Math.max(0, 1 - view.t / T.fadeIn);
          startPhase(view, 'fadeOut');
          view.t = dark * T.fadeOut;
          return;
        }
        if (view.t >= T.fadeIn) startPhase(view, 'beats');
        return;
      }
      if (view.phase === 'beats') {
        // Esc skips to the credits.
        if (actions.pressed.pause) {
          startPhase(view, 'fadeOut');
          return;
        }
        const beat = beatOf(view);
        if (beat.fill !== undefined) view.fill = Math.min(beat.fill, view.fill + dt * T.fillPerSecond);
        for (const shelf of shelves(game)) {
          shelf.fill = view.fill;
          shelf.heroBook = Boolean(beat.heroBook);
        }
        if (beat.party && !view.party) {
          view.party = true;
          for (const who of PARTY) game.room.entities.push({ type: 'npc', ...who });
        }
        // The cheer: everyone in town hops (a small, steady bounce).
        for (const npc of game.room.entities.filter((e) => e.type === 'npc')) {
          npc.walk = beat.cheer ? { fromX: npc.x, fromY: npc.y - 0.15 * Math.abs(Math.sin(app.time * 5 + npc.x)), t: 0 } : null;
        }
        const text = textOf(view, game);
        view.shown = Math.min(text.length, view.shown + dt * VL.TUNING.talkCharsPerSecond);
        if (!VL.confirmed(actions)) return;
        if (view.shown < text.length || (beat.fill !== undefined && view.fill < beat.fill)) {
          view.shown = text.length;
          if (beat.fill !== undefined) view.fill = beat.fill;
          return;
        }
        VL.sfx('menuMove');
        if (view.beat + 1 < VL.ENDING_BEATS.length) {
          view.beat += 1;
          view.shown = 0;
        } else startPhase(view, 'fadeOut');
        return;
      }
      if (view.phase === 'fadeOut') {
        if (view.t >= T.fadeOut) finish(app, view);
        return;
      }
      // The credits roll up; S (or Esc) jumps to the end, and once THE END is
      // up, goes back to the title.
      const end = creditsHeight() + VL.TUNING.height / 2 - LINE;
      const rolled = Math.min(end, view.t * T.creditsSpeed);
      if (!VL.confirmed(actions) && !actions.pressed.pause) return;
      if (rolled < end) view.t = end / T.creditsSpeed;
      else {
        VL.sfx('menuSelect');
        app.quit();
      }
    },

    draw(ctx, app, t) {
      const view = app.ending;
      const game = app.game;
      const { width, height } = VL.TUNING;
      if (view.phase === 'credits') {
        VL.ART.rect(ctx, 'ink', 0, 0, width, height);
        const end = creditsHeight() + height / 2 - LINE;
        const rolled = Math.min(end, view.t * T.creditsSpeed);
        VL.CREDITS.forEach((line, i) => {
          const y = Math.round(height - rolled + i * LINE);
          if (y < -LINE || y > height) return;
          if (typeof line === 'string') {
            if (line) VL.ART.text(ctx, VL.popupText(line, game), width / 2, y, { align: 'center', color: 'text' });
          } else VL.ART.text(ctx, VL.popupText(line.big, game), width / 2, y - 2, { size: 'large', align: 'center', color: 'goldLight', shadow: 'outline' });
        });
        if (rolled >= end && Math.floor(t * 2) % 2 === 0) VL.ART.text(ctx, 'S: BACK TO THE TITLE', width - 8, 180, { size: 'small', align: 'right', color: 'textDim' });
        return;
      }
      const beat = view.phase === 'beats' ? beatOf(view) : null;
      VL.drawWorld(ctx, game, t, { hud: false });
      if (beat) {
        const text = textOf(view, game);
        // Typed along the final line breaks, so words never jump between lines.
        let left = Math.floor(view.shown);
        const typed = VL.ART.wrapText(text, VL.ART.POPUP.width - VL.ART.POPUP.pad * 2, 'normal').map((line) => {
          const part = line.slice(0, Math.max(0, left));
          left -= line.length + 1;
          return part;
        });
        VL.ART.drawPopup(ctx, { title: beat.speaker ? VL.popupText(beat.speaker, game) : null, text: typed.join('\n'), at: beat.at, prompt: view.shown >= text.length }, t);
      }
      const dark = view.phase === 'fadeIn' ? 1 - view.t / T.fadeIn : view.phase === 'fadeOut' ? view.t / T.fadeOut : 0;
      if (dark > 0) {
        ctx.save();
        ctx.globalAlpha = VL.clamp(dark, 0, 1);
        VL.ART.rect(ctx, 'ink', 0, 0, width, height);
        ctx.restore();
      }
    },
  });
})();
