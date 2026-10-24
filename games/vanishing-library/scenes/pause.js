// Pause (Esc): the world freezes under a menu with Resume and Save & Quit,
// plus the controls (never F: the chicken flight stays a secret).
(() => {
  VL.ART.addColors({ pauseShade: '#1b1b2480' });
  VL.PAUSE_OPTIONS = ['Resume', 'Save & Quit'];
  const BOX = { x: 40, y: 40, w: 176, h: 112 };
  const CONTROLS = ['↑↓←→ MOVE    S: TALK, PICK UP', '␣ MAIN HAND    D: OFF HAND', 'E: EQUIPMENT    ESC: PAUSE'];

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
      app.save();
      app.quit();
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
      CONTROLS.forEach((hint, i) => VL.ART.text(ctx, hint, centre, BOX.y + 60 + i * 9, { size: 'small', align: 'center', color: 'textDim' }));
      if (!app.storage.ok) VL.ART.text(ctx, 'SAVING IS OFF IN THIS BROWSER', centre, BOX.y + 94, { size: 'small', align: 'center', color: 'goldLight' });
    },
  });
})();
