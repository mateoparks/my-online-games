// The play scene: the world updates and is drawn. Title, pause and popups are
// other scenes that switch to and from this one.
VL.defineScene('play', {
  enter(app) {
    if (!app.game) app.game = VL.newGame();
  },
  update(app, actions, dt) {
    VL.updateWorld(app.game, actions, dt);
  },
  draw(ctx, app, t) {
    VL.drawWorld(ctx, app.game, t);
  },
});
