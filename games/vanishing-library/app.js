// Scenes own the screen: title, play, pause and so on. Each is
// { enter(app, data), update(app, actions, dt), draw(ctx, app, t) }.
VL.SCENES = {};

// The scene file that owns the first screen (the title) reassigns this.
VL.START_SCENE = 'play';

VL.defineScene = function defineScene(id, scene) {
  if (VL.SCENES[id]) throw new Error(`scene ${id} is already defined`);
  VL.SCENES[id] = { id, ...scene };
};

// World code has no app: it asks for a scene (a talk, a shop) and the app
// opens it after the step. Play holds back a popup queued in the same step,
// so only fainting in that step (no longer in play) drops the request.
VL.extendGame('sceneRequest', () => ({ sceneRequest: null }), { transient: true });
VL.requestScene = function requestScene(state, id, data) {
  state.sceneRequest = { id, data };
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
    // The slot's text as this app last read or wrote it, so a write can tell
    // when another window has saved there since (then this one stops).
    slotText: null,
    saveFailed: false,
    saveConflict: false,
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
      const request = app.game?.sceneRequest;
      if (request) {
        app.game.sceneRequest = null;
        if (app.sceneId === 'play') app.setScene(request.id, request.data);
      }
      // Autosave in every scene (a shop or a reward is earned outside play);
      // a failed write leaves the game dirty, so this is also the retry.
      if (app.game?.dirty) app.save();
      if (app.saveConflict && app.sceneId !== 'conflict') app.setScene('conflict');
    },
    draw(ctx, t) {
      VL.render(ctx, app, t);
    },
    // A fresh game's baseline is "the slot was empty when it was chosen", so
    // a game another window made there since is found at the first write.
    startGame(game, slot, { fresh = false } = {}) {
      app.game = game;
      app.slot = slot;
      app.slotText = slot === null || fresh ? null : app.storage.read(VL.slotKey(slot));
      app.savedAt = null;
      app.saveFailed = false;
      app.saveConflict = false;
    },
    // Writes the game to its slot; true when it was written. A game without
    // a slot (tests, the smoke) or with storage off just drops the dirty
    // mark. A write that fails keeps the game dirty and sets saveFailed
    // until one succeeds; a slot another window wrote since sets
    // saveConflict and is never overwritten. A slot that is gone (site data
    // cleared) holds nothing to keep, so it is simply written again.
    save() {
      const game = app.game;
      if (!game) return false;
      if (app.slot === null || !app.storage.ok) {
        game.dirty = false;
        return false;
      }
      const key = VL.slotKey(app.slot);
      const current = app.storage.read(key);
      if (typeof current === 'string' && current !== app.slotText) {
        app.saveConflict = true;
        game.dirty = false;
        return false;
      }
      const text = JSON.stringify(VL.serializeSave(game));
      const ok = current !== undefined && app.storage.write(key, text);
      if (ok) {
        app.slotText = text;
        app.savedAt = app.time;
      }
      game.dirty = !ok;
      app.saveFailed = !ok;
      return ok;
    },
    quit() {
      app.game = null;
      app.slot = null;
      app.slotText = null;
      app.saveFailed = false;
      app.saveConflict = false;
      app.setScene(VL.START_SCENE);
    },
  };
  app.setScene(VL.START_SCENE);
  return app;
};
