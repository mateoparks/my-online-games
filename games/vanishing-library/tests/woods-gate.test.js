// The Whispering Woods gate (W15, reworked by W34): the Woods are open to
// explore without the copied map, but the trees in the pass below the Hollow
// Oak (7,-1) stay shut until the copy is owned; no turn-backs, no marks. Also
// the pathfinder's fixes this needed (edge rules, shutters seen from outside).
const assert = require('node:assert/strict');
const { test, loadGame, playApp, fakeDocument } = require('./harness');
const { findPath } = require('./playthrough');

const STEP = 1 / 60;
const plain = (value) => JSON.parse(JSON.stringify(value));
const ow = (screen, tx, ty, facing = 'up') => ({ area: 'overworld', screen, tx, ty, facing });

function setup({ copy = false } = {}) {
  const { VL } = loadGame();
  const app = playApp(VL);
  app.game.popups.seen.controls = true;
  if (copy) app.game.items.woodsMapCopy = true;
  const t = {
    VL,
    app,
    get game() {
      return app.game;
    },
    place(where) {
      VL.place(app.game, where);
      app.game.room.entities = app.game.room.entities.filter((e) => !VL.isEnemy(e));
    },
    hold(held, seconds) {
      for (let s = 0; s < seconds - 1e-9; s += STEP) app.update(VL.actions({ held }), STEP);
    },
    until(done, seconds, held = []) {
      for (let s = 0; s < seconds - 1e-9 && !done(app.game); s += STEP) app.update(VL.actions({ held }), STEP);
      assert.ok(done(app.game), `reached within ${seconds} s holding [${held}]`);
    },
    close() {
      app.update(VL.noActions(), STEP);
      for (let i = 0; i < 8 && app.sceneId === 'popup'; i += 1) {
        t.hold([], 0.4);
        app.update(VL.actions({ pressed: ['interact'] }), STEP);
      }
    },
  };
  return t;
}

const settled = (g) => !g.transition;

// Every pair of Woods screens that share an open edge tile.
function woodsEdges(VL) {
  const { cols, rows } = VL.TUNING;
  const woods = VL.REGIONS.woods.screens;
  const pairs = [];
  for (const from of woods) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const to = VL.neighborKey(from, dx, dy);
      if (!woods.includes(to)) continue;
      const length = dx ? rows : cols;
      for (let i = 0; i < length; i += 1) {
        const tx = dx ? (dx < 0 ? 0 : cols - 1) : i;
        const ty = dy ? (dy < 0 ? 0 : rows - 1) : i;
        if (!VL.isSolidAt('overworld', from, tx, ty) && !VL.isSolidAt('overworld', from, tx + dx, ty + dy)) {
          pairs.push({ from, to, tx, ty, dir: { '1,0': 'right', '-1,0': 'left', '0,1': 'down', '0,-1': 'up' }[`${dx},${dy}`] });
          break;
        }
      }
    }
  }
  return pairs;
}

// ---------- the gate ----------

const OAK = { area: 'overworld', screen: '7,-2', tx: 7, ty: 5 };
const PASS = { area: 'overworld', screen: '7,-1', tx: 7, ty: 3 };

test('without the copied map every crossing between two Woods screens leads on to the neighbour (W34: no turning back)', () => {
  for (const copy of [false, true]) {
    const t = setup({ copy });
    const { VL } = t;
    const pairs = woodsEdges(VL);
    assert.ok(pairs.length >= 10, `${pairs.length} Woods crossings`);
    for (const { from, to, tx, ty, dir } of pairs) {
      assert.equal(VL.edgeTurn(t.game, 'overworld', from, to), null, `${from} -> ${to}`);
      t.place(ow(from, tx, ty, dir));
      t.game.popups.seen.woodsWithMap = true;
      t.until((g) => g.player.screen !== from || g.transition, 1, [dir]);
      t.until(settled, 1);
      t.close();
      assert.equal(t.game.player.screen, to, `${from} ${dir} ${copy ? 'with' : 'without'} the map`);
    }
  }
});

test('without the map the hero walks to every Woods screen but the Oak\'s clearing: the pass below it is all trees until the copy opens one', () => {
  const t = setup();
  const { VL } = t;
  const from = { area: 'overworld', screen: '5,0', tx: 6, ty: 2 };
  for (const key of VL.REGIONS.woods.screens.filter((k) => k !== '7,-2')) {
    const screen = VL.getScreen('overworld', key);
    const open = [];
    screen.tiles.forEach((row, ty) => [...row].forEach((ch, tx) => {
      if (!VL.isSolidAt('overworld', key, tx, ty, null)) open.push({ tx, ty });
    }));
    assert.ok(open.some((spot) => findPath(VL, from, { area: 'overworld', screen: key, ...spot }, t.game)), `${key} can be reached`);
  }
  assert.ok(findPath(VL, from, PASS, t.game), 'the pass below the Oak is reached');
  assert.equal(findPath(VL, from, OAK, t.game), null, 'but not the Oak');
  const gate = VL.WOODS_GATE_TREE;
  assert.equal(VL.tileAt('overworld', gate.screen, gate.tx, gate.ty), 'J');
  // A tree in every column of the pass's row: no way round it.
  const row = VL.getScreen('overworld', '7,-1').tiles[gate.ty];
  assert.ok([...row].every((ch, tx) => VL.isSolidAt('overworld', '7,-1', tx, gate.ty, null)), row);
  t.game.items.woodsMapCopy = true;
  t.hold([], 0.05);
  assert.equal(VL.savedTile(t.game, 'overworld', gate.screen, gate.tx, gate.ty), 'P', 'one tree is a dirt path now');
  assert.ok(findPath(VL, from, OAK, t.game), 'and the Oak is reached');
});

test('with the map, the route walks through to the Hollow Oak, and a first visit says the copy shows the way (nothing about marks)', () => {
  const t = setup({ copy: true });
  const { VL } = t;
  t.place(ow('5,0', 6, 2));
  const route = findPath(VL, { area: 'overworld', screen: '5,0', tx: 6, ty: 2 }, OAK, t.game);
  assert.ok(route, 'a path to the Hollow Oak');
  const screens = [...new Set(route.map((node) => node.screen))];
  assert.deepEqual(screens, ['5,0', ...VL.WOODS_ROUTE]);
  t.until((g) => g.player.screen === '5,-1' && settled(g), 3, ['up']);
  t.app.update(VL.noActions(), STEP);
  assert.equal(VL.currentPopup(t.game)?.id, 'woodsWithMap');
  assert.doesNotMatch(VL.POPUPS.woodsWithMap.text, /mark|blue/i);
});

test('no turn-back popup and no scribes\' marks are left in the Woods, with the map or without', () => {
  for (const copy of [false, true]) {
    const t = setup({ copy });
    const { VL } = t;
    assert.equal(VL.POPUPS.woodsLost, undefined);
    assert.equal(VL.ENTITIES.woodsBlaze, undefined);
    for (const key of VL.REGIONS.woods.screens) {
      t.place(ow(key, 7, 5));
      assert.ok(!t.game.room.entities.some((e) => /blaze/i.test(e.type)), key);
    }
  }
});

test('the librarian still says where a map of the Woods can be copied', () => {
  const { VL } = loadGame();
  assert.match(VL.LIBRARY_HINTS.woodsMapCopy[0].say, /mural of the Woods in the Scriptorium/);
});

test('the copy shows where the hero stands in the Woods', () => {
  const t = setup({ copy: true });
  const { VL } = t;
  const ctx = fakeDocument().createElement('canvas').getContext('2d');
  const box = { x: 10, y: 20, w: 200, h: 120 };
  assert.equal(VL.woodsMapHere(t.game), null, 'not in the Woods');
  t.place(ow('6,-2', 7, 5));
  assert.equal(VL.woodsMapHere(t.game), '6,-2');
  VL.drawWoodsMapPicture(ctx, box, 0.1, t.game);
  t.app.setScene('copyView', { id: 'woodsMapCopy' });
  t.app.scene.draw(ctx, t.app, 0.3);
});

test('every word the Woods say fits its box and its font', () => {
  const { VL } = loadGame();
  const popup = VL.POPUPS.woodsWithMap;
  assert.deepEqual(plain(VL.ART.missingGlyphs(`${popup.title} ${popup.text}`)), []);
  assert.ok(!VL.ART.popupLayout({ title: popup.title, text: popup.text }).overflow);
});

// ---------- the pathfinder, seen from outside a dungeon ----------

test('findPath from the overworld into a dungeon reads its shutters and doors from their own area (W14 QA note 1)', () => {
  const { VL } = loadGame();
  const state = VL.newGame();
  VL.place(state, ow('2,-2', 8, 5));
  state.items.scriptoriumKey = true;
  const from = { area: 'overworld', screen: '2,-2', tx: 8, ty: 5 };
  const behindBars = { area: 'scriptorium', screen: '0,0', tx: 4, ty: 5 };
  assert.equal(findPath(VL, from, behindBars, state), null, 'the gallery bars are down');
  VL.dungeonState(state, 'scriptorium').plates.d1PlateGallery = true;
  assert.ok(findPath(VL, from, behindBars, state), 'the latched plate lifts them');
  const vault = { area: 'scriptorium', screen: '2,-1', tx: 7, ty: 6 };
  assert.equal(findPath(VL, from, vault, state), null, 'door A is locked');
  VL.dungeonState(state, 'scriptorium').doors.d1DoorA = true;
  assert.ok(findPath(VL, from, vault, state), 'door A opened, seen from outside');
});
