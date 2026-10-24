// The play scene: the world updates and is drawn. W2 wraps it with title,
// pause and popups by switching scenes.
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
