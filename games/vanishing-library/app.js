// Scenes own the screen: title, play, pause and so on. Each is
// { enter(app, data), update(app, actions, dt), draw(ctx, app, t) }.
VL.SCENES = {};

// The scene file that owns the first screen (the title) reassigns this.
VL.START_SCENE = 'play';

VL.defineScene = function defineScene(id, scene) {
  if (VL.SCENES[id]) throw new Error(`scene ${id} is already defined`);
  VL.SCENES[id] = { id, ...scene };
};

// `storage` comes from VL.createStorage; without one, saving is off.
VL.createApp = function createApp({ storage } = {}) {
  const app = {
    sceneId: null,
    scene: null,
    game: null,
    slot: null,
    storage: storage || VL.createStorage(null),
    time: 0,
    savedAt: null,
    setScene(id, data) {
      const scene = VL.SCENES[id];
      if (!scene) throw new Error(`unknown scene ${id}`);
      app.sceneId = id;
      app.scene = scene;
      scene.enter?.(app, data);
    },
    update(actions, dt) {
      dt = Math.min(dt, VL.TUNING.maxDt);
      app.time += dt;
      app.scene.update(app, actions, dt);
    },
    draw(ctx, t) {
      VL.render(ctx, app, t);
    },
    startGame(game, slot) {
      app.game = game;
      app.slot = slot;
      app.savedAt = null;
    },
    // Writes the game to its slot. A game without a slot (tests, the smoke)
    // or with storage off just drops the dirty mark.
    save() {
      const game = app.game;
      if (!game) return false;
      game.dirty = false;
      if (app.slot === null) return false;
      const ok = VL.saveSlot(app.storage, app.slot, game);
      if (ok) app.savedAt = app.time;
      return ok;
    },
    quit() {
      app.game = null;
      app.slot = null;
      app.setScene(VL.START_SCENE);
    },
  };
  app.setScene(VL.START_SCENE);
  return app;
};
