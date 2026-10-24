// The play scene: the world updates and is drawn. Esc pauses, E opens the
// equipment screen, a save flashes SAVED (the app saves after every step),
// a waiting popup opens over the world, and hearts running out hands over
// to the fainted scene.
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
      if (actions.pressed.equipment && !game.transition) {
        app.setScene('equipment');
        return;
      }
      VL.updateWorld(game, actions, dt);
      if (game.hp <= 0) app.setScene('fainted');
      // A talk asked for this step (VL.requestScene) goes first; a popup the
      // same step queued waits for play again.
      else if (VL.currentPopup(game) && !game.transition && !game.sceneRequest) app.setScene('popup');
    },
    draw(ctx, app, t) {
      VL.drawWorld(ctx, app.game, t);
      const note = { size: 'small', align: 'right', color: 'goldLight', shadow: 'outline' };
      if (app.saveFailed) {
        if (Math.floor(t * 2) % 2 === 0) VL.ART.text(ctx, 'COULD NOT SAVE', VL.TUNING.width - 4, VL.TUNING.hudHeight + 3, { ...note, color: 'heartLight' });
      } else if (app.savedAt !== null && app.time - app.savedAt < SAVED_FLASH) {
        VL.ART.text(ctx, 'SAVED', VL.TUNING.width - 4, VL.TUNING.hudHeight + 3, note);
      }
    },
  });
})();
