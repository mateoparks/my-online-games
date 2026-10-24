// Scenes own the screen: title, play, pause and so on. Each is
// { enter(app, data), update(app, actions, dt), draw(ctx, app, t) }.
VL.SCENES = {};

// W2 points this at its title scene once that exists.
VL.START_SCENE = 'play';

VL.defineScene = function defineScene(id, scene) {
  VL.SCENES[id] = { id, ...scene };
};

VL.createApp = function createApp() {
  const app = {
    sceneId: null,
    scene: null,
    game: null,
    time: 0,
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
  };
  app.setScene(VL.START_SCENE);
  return app;
};
