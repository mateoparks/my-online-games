// The shockwave as a scene (rules in systems/shockwave.js): the ground
// shakes and rings of light sweep out, a white flash (the losses land here,
// and the hero is carried home), a few lines told on black, then he wakes
// in his hut holding the Glowstone. Gran Ottie's words live here too, since
// her file loads after the systems. README "The shockwave (W16)".
(() => {
  VL.SHOCKWAVE_TIMES = { rumble: 2.2, flash: 1.2, wake: 2 };
  VL.SHOCKWAVE_LINES = [
    'The Thornback crashed down, and the whole Hollow Oak shook. Something bright rolled out from under its shell...',
    'Then a great wave of light burst through the Woods, and everything went quiet.',
  ];

  VL.ART.addColors({ shockBlack: '#000000', shockLight: '#fff6d0' });

  VL.defineSfx('shockRumble', [
    { wave: 'noise', dur: 1.4, vol: 0.5, filter: { type: 'lowpass', freq: 220, to: 90 } },
    { wave: 'sine', freq: 55, to: 38, dur: 1.4, vol: 0.4 },
  ], { gap: 1 });
  VL.defineSfx('shockFlash', [
    { wave: 'triangle', freq: 784, dur: 0.6, vol: 0.3 },
    { wave: 'triangle', freq: 1175, at: 0.05, dur: 0.6, vol: 0.25 },
    { wave: 'noise', dur: 0.5, vol: 0.3, filter: { type: 'highpass', freq: 2500, to: 6000 } },
  ], { gap: 1 });
  VL.defineSfx('shockWake', [
    { wave: 'sine', freq: 523, dur: 0.25, vol: 0.25 },
    { wave: 'sine', freq: 659, at: 0.2, dur: 0.25, vol: 0.25 },
    { wave: 'sine', freq: 784, at: 0.4, dur: 0.5, vol: 0.25 },
  ], { gap: 1 });

  VL.afterThornback('shockwave', (state) => {
    state.flags.shockwaveDue = true;
  });

  // ---------- Gran Ottie, the helper ----------

  const price = () => VL.TUNING.prices.woodSword.wood;
  VL.addDialogue('gran', [
    {
      when: { flag: 'shockwave', notFlag: 'gave:helperWood' },
      say: [
        'There you are, {name}! You gave us all a fright.',
        'A great flash lit up the sky over the Woods. The miller and I found you at the edge of the trees, fast asleep and holding that glowing stone.',
        'I\'m afraid the blast scattered your sword and shield, your shovel and your map. Your wood, paper, berries and ink blew away, and your shells cracked into little pieces.',
        'But your books, your rope and everything you found in the dungeons are safe. And so are you, which matters most of all!',
        'Here, take some wood from my woodpile. The flash sent the slimes by your hut into hiding, so those fields will be quiet for a good while.',
      ],
      set: 'gave:helperWood',
      give: { helperWood: VL.TUNING.helperWood },
    },
    {
      when: { flag: 'gave:helperWood', notItem: ['woodSword', 'metalSword'] },
      say: 'Pull a bush or two for another piece of wood, dear. Brannock at the smithy will make you a new sword.',
    },
  ]);

  // ---------- the scene ----------

  const T = VL.SHOCKWAVE_TIMES;
  const TEXT_WIDTH = 216;
  const TEXT_TOP = 72;

  const pages = (game) => VL.SHOCKWAVE_LINES.map((line) => VL.ART.wrapText(VL.popupText(line, game), TEXT_WIDTH));

  function startPhase(view, phase) {
    view.phase = phase;
    view.t = 0;
    view.shown = 0;
    if (phase === 'rumble') VL.sfx('shockRumble');
    if (phase === 'flash') VL.sfx('shockFlash');
    if (phase === 'wake') VL.sfx('shockWake');
  }

  VL.defineScene('shockwave', {
    // data: { from: 'rumble' | 'dark' }. 'dark' resumes after a reload that
    // came after the losses were saved.
    enter(app, data = {}) {
      app.shockwave = { phase: null, t: 0, page: 0, shown: 0 };
      startPhase(app.shockwave, data.from === 'dark' ? 'dark' : 'rumble');
    },

    update(app, actions, dt) {
      const view = app.shockwave;
      const game = app.game;
      view.t += dt;
      if (view.phase === 'rumble' && view.t >= T.rumble) {
        VL.applyShockwave(game);
        VL.place(game, VL.SHOCKWAVE_WAKE);
        startPhase(view, 'flash');
      } else if (view.phase === 'flash' && view.t >= T.flash) {
        startPhase(view, 'dark');
      } else if (view.phase === 'dark') {
        const text = pages(game)[view.page].join('\n');
        view.shown = Math.min(text.length, view.shown + dt * VL.TUNING.talkCharsPerSecond);
        if (!VL.confirmed(actions)) return;
        if (view.shown < text.length) view.shown = text.length;
        else if (view.page + 1 < VL.SHOCKWAVE_LINES.length) {
          view.page += 1;
          view.shown = 0;
        } else startPhase(view, 'wake');
      } else if (view.phase === 'wake' && view.t >= T.wake) {
        VL.wakeFromShockwave(game);
        app.setScene('play');
      }
    },

    draw(ctx, app, t) {
      const view = app.shockwave;
      const game = app.game;
      const { width, height, hudHeight, rows, tile } = VL.TUNING;
      if (view.phase === 'rumble') {
        const k = view.t / T.rumble;
        const shake = Math.round(Math.sin(t * 60) * (1 + 2 * k));
        ctx.save();
        ctx.translate(shake, 0);
        VL.drawWorld(ctx, game, t);
        ctx.restore();
        // Rings of light sweeping out from the middle of the room.
        const cx = width / 2;
        const cy = hudHeight + (rows * tile) / 2;
        for (let ring = 0; ring < 3; ring += 1) {
          const r = ((view.t * 90 + ring * 40) % 160) + 4;
          for (let i = 0; i < 64; i += 1) {
            const a = (i / 64) * Math.PI * 2;
            VL.ART.rect(ctx, 'shockLight', Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 0.75), 2, 2);
          }
        }
        const white = VL.clamp((view.t - (T.rumble - 0.6)) / 0.6, 0, 1);
        if (white > 0) {
          ctx.save();
          ctx.globalAlpha = white;
          VL.ART.rect(ctx, 'white', 0, 0, width, height);
          ctx.restore();
        }
        return;
      }
      VL.ART.rect(ctx, 'shockBlack', 0, 0, width, height);
      if (view.phase === 'flash') {
        ctx.save();
        ctx.globalAlpha = VL.clamp(1 - view.t / T.flash, 0, 1);
        VL.ART.rect(ctx, 'white', 0, 0, width, height);
        ctx.restore();
        return;
      }
      if (view.phase === 'dark') {
        const shownText = pages(game)[view.page].join('\n').slice(0, Math.floor(view.shown));
        shownText.split('\n').forEach((row, i) => {
          VL.ART.text(ctx, row, width / 2, TEXT_TOP + i * (VL.ART.lineHeight('normal') + 2), { align: 'center', color: 'white' });
        });
        if (Math.floor(t * 2) % 2 === 0) VL.ART.text(ctx, 'S: NEXT', width - 8, 180, { size: 'small', align: 'right', color: 'textDim' });
        return;
      }
      // Waking: the hut fades in while he sleeps it off.
      VL.drawWorld(ctx, game, t);
      ctx.save();
      ctx.globalAlpha = VL.clamp(1 - view.t / (T.wake * 0.6), 0, 1);
      VL.ART.rect(ctx, 'shockBlack', 0, 0, width, height);
      ctx.restore();
      const { x, y } = game.player;
      for (let i = 0; i < 3; i += 1) {
        const rise = (view.t * 8 + i * 6) % 18;
        VL.ART.text(ctx, 'z', Math.round(x + 6 + i * 3), Math.round(hudHeight + y - 20 - rise), { size: 'small', color: 'white', shadow: 'outline' });
      }
    },
  });
})();
