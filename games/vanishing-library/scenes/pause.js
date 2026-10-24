// Pause (Esc): the world freezes under a menu with Resume and Save & Quit,
// plus the controls (never F: the chicken flight stays a secret).
(() => {
  VL.ART.addColors({ pauseShade: '#1b1b2480' });
  VL.PAUSE_OPTIONS = ['Resume', 'Save & Quit'];
  const BOX = { x: 40, y: 40, w: 176, h: 112 };
  // Space is not mentioned until the player holds a main-hand item (design: Controls).
  const controls = (state) => [
    '↑↓←→ MOVE    S: TALK, PICK UP',
    VL.ART.hudModel(state).mainHand ? '␣ MAIN HAND    D: OFF HAND' : 'D: OFF HAND',
    'E: EQUIPMENT    N: SOUND ON/OFF',
    'ESC: BACK TO THE GAME',
  ];

  VL.defineScene('pause', {
    enter(app) {
      app.pause = { cursor: 0 };
    },

    update(app, actions) {
      const pause = app.pause;
      const { pressed } = actions;
      if (pressed.pause) {
        app.setScene('play');
        return;
      }
      if (pressed.up || pressed.down) pause.cursor = 1 - pause.cursor;
      if (!VL.confirmed(actions)) return;
      if (VL.PAUSE_OPTIONS[pause.cursor] === 'Resume') {
        app.setScene('play');
        return;
      }
      // With saving off there is nothing to write; a write that fails keeps
      // the player here with the note rather than quitting as if it saved.
      if (app.save() || !app.storage.ok) app.quit();
    },

    draw(ctx, app, t) {
      VL.drawWorld(ctx, app.game, t);
      VL.ART.rect(ctx, 'pauseShade', 0, 0, VL.TUNING.width, VL.TUNING.height);
      VL.ART.drawBox(ctx, BOX.x, BOX.y, BOX.w, BOX.h);
      const centre = BOX.x + BOX.w / 2;
      VL.ART.text(ctx, 'PAUSED', centre, BOX.y + 8, { align: 'center', color: 'goldLight', shadow: 'boxShade' });
      VL.PAUSE_OPTIONS.forEach((option, i) => {
        const y = BOX.y + 26 + i * 12;
        const chosen = i === app.pause.cursor;
        if (chosen) VL.ART.text(ctx, '→', centre - 44, y, { color: 'goldLight' });
        VL.ART.text(ctx, option, centre - 32, y, { color: chosen ? 'goldLight' : 'text' });
      });
      if (VL.PAUSE_OPTIONS[app.pause.cursor] === 'Save & Quit' && app.storage.ok) {
        VL.ART.text(ctx, 'CONTINUE STARTS AT YOUR LAST SAVE POINT', centre, BOX.y + 48, { size: 'small', align: 'center', color: 'textDim' });
      }
      controls(app.game).forEach((hint, i) => VL.ART.text(ctx, hint, centre, BOX.y + 58 + i * 9, { size: 'small', align: 'center', color: 'textDim' }));
      if (!app.storage.ok) VL.ART.text(ctx, 'SAVING IS OFF IN THIS BROWSER', centre, BOX.y + 97, { size: 'small', align: 'center', color: 'goldLight' });
      else if (app.saveFailed) VL.ART.text(ctx, 'COULD NOT SAVE. STILL TRYING', centre, BOX.y + 97, { size: 'small', align: 'center', color: 'heartLight' });
    },
  });
})();
