// A popup over the paused world: a once-only explanation (VL.showPopup) or a
// sign's words (VL.showMessage). S, Space or Enter closes it once it has been
// up a moment, so a press meant for the world never skips it.
(() => {
  const READY = 0.3;

  VL.defineScene('popup', {
    enter(app) {
      app.popupView = { t: 0 };
      VL.sfx('popup');
    },

    update(app, actions, dt) {
      const view = app.popupView;
      view.t += dt;
      if (actions.pressed.pause) {
        app.setScene('pause');
        return;
      }
      if (!VL.currentPopup(app.game)) {
        app.setScene('play');
        return;
      }
      if (view.t < READY || !VL.confirmed(actions)) return;
      VL.dismissPopup(app.game);
      VL.sfx('menuSelect');
      if (VL.currentPopup(app.game)) {
        app.setScene('popup');
        return;
      }
      VL.graceAfterPopup(app.game);
      app.setScene('play');
    },

    draw(ctx, app, t) {
      const game = app.game;
      VL.drawWorld(ctx, game, t);
      const popup = VL.currentPopup(game) || { title: null, text: '' };
      // Out of the hero's way: at the top when the hero is low on the screen.
      const at = game.player.y > (VL.TUNING.rows * VL.TUNING.tile) / 2 ? 'top' : 'bottom';
      VL.ART.drawPopup(ctx, { title: popup.title, text: popup.text, at, prompt: app.popupView.t >= READY }, t);
    },
  });
})();
