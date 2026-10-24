// Fainting: the world dims under a note that nothing earned is lost, then a
// press wakes the hero at the last save point (design: Death).
(() => {
  VL.ART.addColors({ faintShade: '#1b1b24b0' });
  const WAKE_AFTER = 0.6;
  const BOX = { x: 24, y: 64, w: 208, h: 60 };
  const LINES = ['Everything you found is still yours.', 'You wake up at your last save point.'];

  VL.defineScene('fainted', {
    enter(app) {
      app.faintScreen = { t: 0 };
    },

    update(app, actions, dt) {
      const screen = app.faintScreen;
      screen.t += dt;
      if (screen.t < WAKE_AFTER || !VL.confirmed(actions)) return;
      VL.respawn(app.game);
      app.setScene('play');
    },

    draw(ctx, app, t) {
      VL.drawWorld(ctx, app.game, t);
      VL.ART.rect(ctx, 'faintShade', 0, 0, VL.TUNING.width, VL.TUNING.height);
      VL.ART.drawBox(ctx, BOX.x, BOX.y, BOX.w, BOX.h);
      const centre = VL.TUNING.width / 2;
      VL.ART.text(ctx, VL.faintLine(app.game.fainted?.cause), centre, BOX.y + 8, { align: 'center', color: 'goldLight', shadow: 'boxShade' });
      LINES.forEach((line, i) => VL.ART.text(ctx, line, centre, BOX.y + 22 + i * 10, { align: 'center', color: 'text' }));
      if (app.faintScreen.t >= WAKE_AFTER && Math.floor(t * 2.5) % 2 === 0) {
        VL.ART.text(ctx, 'S: WAKE UP', centre, BOX.y + BOX.h - 12, { size: 'small', align: 'center', color: 'goldLight' });
      }
    },
  });
})();
