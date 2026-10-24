// The play scene: the world updates and is drawn. Esc pauses, earning
// anything autosaves, and hearts running out hands over to the fainted scene.
(() => {
  const SAVED_FLASH = 1.5;

  VL.defineScene('play', {
    enter(app) {
      if (!app.game) app.game = VL.newGame();
    },
    update(app, actions, dt) {
      const game = app.game;
      if (actions.pressed.pause) {
        app.setScene('pause');
        return;
      }
      VL.updateWorld(game, actions, dt);
      if (game.dirty) app.save();
      if (game.hp <= 0) app.setScene('fainted');
    },
    draw(ctx, app, t) {
      VL.drawWorld(ctx, app.game, t);
      if (app.savedAt !== null && app.time - app.savedAt < SAVED_FLASH) {
        VL.ART.text(ctx, 'SAVED', VL.TUNING.width - 4, VL.TUNING.hudHeight + 3, { size: 'small', align: 'right', color: 'goldLight', shadow: 'outline' });
      }
    },
  });
})();
