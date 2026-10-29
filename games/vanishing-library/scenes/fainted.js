// Fainting: the world dims under a note that nothing earned is lost, then a
// press wakes the hero at the last save point (design: Death).
(() => {
  VL.ART.addColors({ faintShade: '#1b1b24b0' });
  const WAKE_AFTER = 0.6;
  const BOX = { x: 28, y: 64, w: 200, h: 60 };
  // A treasure that counts only once carried out (the Mirror Shield across
  // the lava) went back to its chest: say so, and that the rest is kept.
  const WIDE_BOX = { x: 16, y: 59, w: 224, h: 70 };
  VL.faintLines = (game) => {
    const returned = game.fainted?.returned;
    const kept = returned
      ? [`The ${VL.ITEMS[returned]?.name || 'treasure'} slipped back into its chest.`, 'Everything else you found is still yours.']
      : ['Everything you found is still yours.'];
    return [...kept, `You wake up ${VL.wakeWords(game) || 'at your last save point'}.`].map((line) => VL.popupText(line, game));
  };

  VL.defineScene('fainted', {
    enter(app) {
      app.faintScreen = { t: 0 };
    },

    update(app, actions, dt) {
      const screen = app.faintScreen;
      screen.t += dt;
      if (screen.t < WAKE_AFTER || !VL.confirmed(actions)) return;
      VL.sfx('menuSelect');
      VL.respawn(app.game);
      app.setScene('play');
    },

    draw(ctx, app, t) {
      VL.drawWorld(ctx, app.game, t);
      VL.ART.rect(ctx, 'faintShade', 0, 0, VL.TUNING.width, VL.TUNING.height);
      const lines = VL.faintLines(app.game);
      const box = lines.length > 2 ? WIDE_BOX : BOX;
      VL.ART.drawBox(ctx, box.x, box.y, box.w, box.h);
      const centre = VL.TUNING.width / 2;
      VL.ART.text(ctx, VL.popupText(VL.faintLine(app.game.fainted?.cause), app.game), centre, box.y + 8, { align: 'center', color: 'goldLight', shadow: 'boxShade' });
      lines.forEach((line, i) => VL.ART.text(ctx, line, centre, box.y + 22 + i * 10, { align: 'center', color: 'text' }));
      if (app.faintScreen.t >= WAKE_AFTER && Math.floor(t * 2.5) % 2 === 0) {
        VL.ART.text(ctx, 'S: WAKE UP', centre, box.y + box.h - 12, { size: 'small', align: 'center', color: 'goldLight' });
      }
    },
  });
})();
