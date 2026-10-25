// Registries (systems, entities, scenes) and the render smoke on a fake canvas.
const assert = require('node:assert/strict');
const { test, loadGame, addFixtureWorld, playState, playApp, hold, holdUntil } = require('./harness');

test('systems run in order and can be added by later files', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  const log = [];
  VL.defineSystem('late', { update: () => log.push('late') });
  VL.defineSystem('early', { order: 1, update: () => log.push('early') });
  const state = playState(VL, { area: 'test', screen: '0,0', tx: 8, ty: 2 });
  VL.updateWorld(state, VL.noActions(), 1 / 60);
  assert.deepEqual(log, ['early', 'late']);
  assert.ok(VL.SYSTEMS.some((system) => system.id === 'movement'));
});

test('entity types get stand hooks from the engine', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  const stood = [];
  VL.defineEntity('plate', { onStand: (state, entity) => stood.push(entity.id) });
  VL.AREAS.test.screens['0,0'].entities.push({ type: 'plate', id: 'p1', x: 8, y: 1 });
  const state = playState(VL, { area: 'test', screen: '0,0', tx: 8, ty: 2 });
  hold(VL, state, ['up'], 0.3);
  assert.deepEqual(stood, ['p1'], 'fires once while standing');
});

test('scenes are registered and the app starts in VL.START_SCENE', () => {
  const { VL } = loadGame();
  assert.ok(VL.SCENES.play);
  assert.ok(VL.SCENES[VL.START_SCENE], 'the start scene exists');
  const app = VL.createApp();
  assert.equal(app.sceneId, VL.START_SCENE);
  const entered = [];
  VL.defineScene('fixture', { enter: (a, data) => entered.push(data), update() {}, draw() {} });
  app.setScene('fixture', { slot: 1 });
  assert.equal(app.sceneId, 'fixture');
  assert.deepEqual(entered, [{ slot: 1 }]);
  assert.throws(() => app.setScene('nope'), /unknown scene/);
  app.game = null;
  app.setScene('play');
  assert.ok(app.game, 'entering play with no game starts one');
});

test('registries throw on a duplicate id so two lanes cannot silently clash', () => {
  const { VL } = loadGame();
  assert.throws(() => VL.defineSystem('movement', { update() {} }), /system movement/);
  assert.throws(() => VL.defineEntity('door', {}), /entity door/);
  assert.throws(() => VL.defineScene('play', { update() {}, draw() {} }), /scene play/);
  assert.throws(() => VL.defineTileset('base', {}), /tileset base/);
});

// ---------- extension hooks for later items (no edits to shared core files) ----------

test('VL.tune adds tuning numbers from a system file and rejects a clash', () => {
  const { VL } = loadGame();
  VL.tune({ crabSpeed: 40 });
  assert.equal(VL.TUNING.crabSpeed, 40);
  assert.throws(() => VL.tune({ crabSpeed: 50 }), /crabSpeed/);
  assert.throws(() => VL.tune({ heroSpeed: 90 }), /heroSpeed/);
});

test('VL.extendGame adds state fields to every new game and rejects a clash', () => {
  const { VL } = loadGame();
  VL.extendGame('satchel', () => ({ satchel: { wood: 0 } }));
  const state = VL.newGame();
  assert.deepEqual({ ...state.satchel }, { wood: 0 });
  assert.notEqual(VL.newGame().satchel, state.satchel, 'fresh per game');
  assert.throws(() => VL.extendGame('satchel', () => ({})), /satchel/);
  VL.extendGame('clash', () => ({ hp: 99 }));
  assert.throws(() => VL.newGame(), /hp/);
  VL.GAME_EXTENSIONS.pop();
  VL.extendGame('clock', () => ({ time: 0 }));
  assert.throws(() => VL.newGame(), /time/, 'a transient field name is a clash too');
});

test('VL.extendTileset adds characters to a legend and rejects a clash', () => {
  const { VL } = loadGame();
  VL.extendTileset('base', { '%': { solid: true, ore: true } });
  assert.equal(VL.tileInfo('overworld', '%').ore, true);
  assert.throws(() => VL.extendTileset('base', { T: {} }), /T/);
  assert.throws(() => VL.extendTileset('nope', { '%': {} }), /tileset nope/);
});

// ---------- rendering ----------

test('the renderer draws the live room entities, not the static screen data', () => {
  const { VL, document } = loadGame();
  addFixtureWorld(VL);
  const drawn = [];
  VL.defineEntity('crate', { draw: (ctx, entity) => drawn.push(entity) });
  VL.AREAS.test.screens['0,0'].entities.push({ type: 'crate', x: 4, y: 4 });
  const app = playApp(VL);
  VL.place(app.game, { area: 'test', screen: '0,0', tx: 8, ty: 2 });
  app.game.room.entities.find((e) => e.type === 'crate').opened = true;
  const ctx = document.createElement('canvas').getContext('2d');
  VL.render(ctx, app, 0);
  assert.equal(drawn.length, 1);
  assert.equal(drawn[0].opened, true, 'the draw hook sees the per-visit copy');
  app.game.room.entities = app.game.room.entities.filter((e) => e.type !== 'crate');
  VL.render(ctx, app, 0);
  assert.equal(drawn.length, 1, 'an entity removed from the room is not drawn');
});

test('render smoke: the play scene draws on a fake canvas, including a slide', () => {
  const { VL, document } = loadGame();
  addFixtureWorld(VL);
  const app = playApp(VL);
  VL.place(app.game, { area: 'test', screen: '0,0', tx: 14, ty: 5 });
  const ctx = document.createElement('canvas').getContext('2d');
  VL.render(ctx, app, 0);
  assert.ok(ctx.calls.fillRect > 100, 'tiles are drawn');
  hold(VL, app.game, ['right'], 0.6);
  assert.ok(app.game.transition);
  VL.render(ctx, app, 1);
  assert.ok(ctx.calls.save >= 1);
  VL.place(app.game, { area: 'room', screen: '0,0', tx: 7, ty: 8 });
  VL.render(ctx, app, 2);
});

// The camera pans the way the hero walked: the old screen leaves through the
// opposite edge, the new one enters from the edge the hero crossed, and the
// hero (drawn at the new screen's offset) never leaves the canvas, give or
// take the pixel one step past the edge rounds to.
test('a screen slide pans in the direction of travel and keeps the hero on the canvas', () => {
  const { VL, document } = loadGame();
  addFixtureWorld(VL);
  const { width, rows, tile } = VL.TUNING;
  const span = { x: width, y: rows * tile };
  const cases = [
    { dir: 'left', from: '1,1', tx: 0, ty: 2, to: '0,1', axis: 'x', sign: -1 },
    { dir: 'right', from: '0,0', tx: 15, ty: 5, to: '1,0', axis: 'x', sign: 1 },
    { dir: 'up', from: '0,1', tx: 9, ty: 0, to: '0,0', axis: 'y', sign: -1 },
    { dir: 'down', from: '1,0', tx: 5, ty: 10, to: '1,1', axis: 'y', sign: 1 },
  ];
  const draws = [];
  const drawScreen = VL.drawScreen;
  const drawHero = VL.ART.drawHero;
  VL.drawScreen = (ctx, area, key, ox, oy, ...rest) => {
    draws.push({ key, x: ox, y: oy });
    drawScreen(ctx, area, key, ox, oy, ...rest);
  };
  VL.ART.drawHero = (ctx, player, x, y, t) => {
    draws.push({ hero: true, x, y });
    drawHero(ctx, player, x, y, t);
  };
  const ctx = document.createElement('canvas').getContext('2d');
  for (const { dir, from, tx, ty, to, axis, sign } of cases) {
    const app = playApp(VL);
    VL.place(app.game, { area: 'test', screen: from, tx, ty });
    holdUntil(VL, app.game, [dir], (state) => Boolean(state.transition));
    const slide = app.game.transition;
    assert.equal(app.game.player.screen, to, `${dir}: entered ${to}`);
    for (const k of [0, 0.5, 0.999]) {
      slide.t = slide.duration * k;
      draws.length = 0;
      VL.render(ctx, app, 0);
      const hero = draws.find((d) => d.hero);
      assert.ok(hero.x >= -1 && hero.x <= width + 1 && hero.y >= -1 && hero.y <= span.y + 1, `${dir} at ${k}: hero drawn at ${hero.x},${hero.y} is on the canvas`);
      if (k !== 0.5) continue;
      const incoming = draws.find((d) => d.key === to);
      const outgoing = draws.find((d) => d.key === from);
      assert.ok(incoming && outgoing, `${dir}: both screens are drawn mid-slide`);
      assert.equal(incoming[axis], (sign * span[axis]) / 2, `${dir}: the new screen enters from the ${dir} edge`);
      assert.equal(outgoing[axis], (-sign * span[axis]) / 2, `${dir}: the old screen leaves through the far edge`);
      const other = axis === 'x' ? 'y' : 'x';
      assert.equal(incoming[other] + 0, 0, `${dir}: no drift on the other axis`);
      assert.equal(outgoing[other] + 0, 0);
    }
  }
  VL.drawScreen = drawScreen;
  VL.ART.drawHero = drawHero;
});

// Every registered scene is entered, stepped and drawn, so a new scene file is
// covered without editing this test. A scene whose `enter` needs data exports
// `smokeData(app)` to provide it.
test('render smoke: every scene enters, updates and draws on a fake canvas', () => {
  const { VL, document } = loadGame();
  addFixtureWorld(VL);
  VL.defineScene('needsData', {
    smokeData: () => ({ text: 'hi' }),
    enter(app, data) {
      if (!data?.text) throw new Error('needs data');
    },
    update() {},
    draw(ctx) {
      ctx.fillText('x', 0, 0);
    },
  });
  const ids = Object.keys(VL.SCENES);
  assert.ok(ids.includes('play') && ids.includes('needsData'));
  for (const id of ids) {
    const app = VL.createApp();
    if (!app.game) app.game = VL.newGame();
    const scene = VL.SCENES[id];
    app.setScene(id, scene.smokeData?.(app));
    const ctx = document.createElement('canvas').getContext('2d');
    VL.render(ctx, app, 0);
    app.update(VL.actions({ held: ['right'] }), 1 / 60);
    app.update(VL.actions({ pressed: ['interact'] }), 1 / 60);
    const total = () => Object.values(ctx.calls).reduce((sum, n) => sum + n, 0);
    const before = total();
    VL.render(ctx, app, 0.5);
    // VL.render itself makes one call (the background fillRect); the scene must add to it.
    assert.ok(total() - before > 1, `${id} draws something of its own`);
  }
});
