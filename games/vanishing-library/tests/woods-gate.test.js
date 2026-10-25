// The Whispering Woods gate (W15): without the copied map every step from
// one Woods screen into another turns the hero back to the edge of the Woods;
// with it the paths are true and the scribes' marks show the way. Also the
// pathfinder's fixes this needed (edge rules, shutters seen from outside).
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

test('without the copied map, the first step deeper into the Woods turns the hero back to their edge, and says why', () => {
  const t = setup();
  const { VL } = t;
  t.place(ow('5,-1', 3, 1));
  t.until((g) => VL.heroTile(g).ty === VL.WOODS_ENTRY.ty, 2, ['up']);
  assert.deepEqual(plain([t.game.player.screen, VL.heroTile(t.game), t.game.player.facing]), ['5,-1', { tx: VL.WOODS_ENTRY.tx, ty: VL.WOODS_ENTRY.ty }, 'down']);
  assert.equal(t.game.visited['overworld:5,-2'], undefined, 'never set foot on the next screen');
  t.until(() => t.app.sceneId === 'popup', 1);
  assert.equal(VL.currentPopup(t.game).id, 'woodsLost', 'the first time explains');
  t.close();
  // The second time is a short message, not the whole explanation again.
  t.place(ow('5,-1', 3, 1));
  t.until((g) => g.message || t.app.sceneId === 'popup', 2, ['up']);
  assert.match(t.game.message.text, /trees whisper/);
});

test('without the map every crossing between two Woods screens turns back; with it none does, and leaving the Woods never does', () => {
  const t = setup();
  const { VL } = t;
  const pairs = woodsEdges(VL);
  assert.ok(pairs.length >= 10, `${pairs.length} Woods crossings`);
  for (const { from, to } of pairs) {
    const turn = VL.edgeTurn(t.game, 'overworld', from, to);
    assert.deepEqual(plain(turn && [turn.screen, turn.tx, turn.ty, turn.rule]), ['5,-1', VL.WOODS_ENTRY.tx, VL.WOODS_ENTRY.ty, 'woods'], `${from} -> ${to}`);
  }
  assert.equal(VL.edgeTurn(t.game, 'overworld', '5,-1', '5,0'), null, 'out to the east road');
  assert.equal(VL.edgeTurn(t.game, 'overworld', '5,0', '5,-1'), null, 'in from the east road');
  assert.equal(VL.edgeTurn(t.game, 'overworld', '2,0', '3,0'), null, 'anywhere else');
  t.game.items.woodsMapCopy = true;
  for (const { from, to } of pairs) assert.equal(VL.edgeTurn(t.game, 'overworld', from, to), null, `${from} -> ${to} with the map`);
});

test('a real walk into every Woods crossing without the map lands at the edge; with it, on the neighbour', () => {
  for (const copy of [false, true]) {
    const t = setup({ copy });
    const { VL } = t;
    for (const { from, to, tx, ty, dir } of woodsEdges(VL)) {
      t.place(ow(from, tx, ty, dir));
      t.game.popups.seen.woodsLost = true;
      t.game.popups.seen.woodsWithMap = true;
      t.until((g) => g.player.screen !== from || g.transition, 1, [dir]);
      t.until(settled, 1);
      t.close();
      assert.equal(t.game.player.screen, copy ? to : '5,-1', `${from} ${dir} ${copy ? 'with' : 'without'} the map`);
    }
  }
});

test('with the map, the route walks through to the Hollow Oak, and a first visit says how the map helps', () => {
  const t = setup({ copy: true });
  const { VL } = t;
  t.place(ow('5,0', 6, 2));
  const route = findPath(VL, { area: 'overworld', screen: '5,0', tx: 6, ty: 2 }, { area: 'overworld', screen: '7,-2', tx: 7, ty: 5 }, t.game);
  assert.ok(route, 'a path to the Hollow Oak');
  const screens = [...new Set(route.map((node) => node.screen))];
  assert.deepEqual(screens, ['5,0', ...VL.WOODS_ROUTE]);
  t.until((g) => g.player.screen === '5,-1' && settled(g), 2, ['up']);
  t.app.update(VL.noActions(), STEP);
  assert.equal(VL.currentPopup(t.game)?.id, 'woodsWithMap');
});

test('the pathfinder never crosses an edge that turns back: no way to the Hollow Oak without the map', () => {
  const t = setup();
  const { VL } = t;
  const from = { area: 'overworld', screen: '5,0', tx: 6, ty: 2 };
  assert.equal(findPath(VL, from, { area: 'overworld', screen: '7,-2', tx: 7, ty: 5 }, t.game), null);
  assert.ok(findPath(VL, from, { area: 'overworld', screen: '5,-1', tx: 6, ty: 8 }, t.game), 'the edge of the Woods is open to all');
  t.game.items.woodsMapCopy = true;
  assert.ok(findPath(VL, from, { area: 'overworld', screen: '7,-2', tx: 7, ty: 5 }, t.game));
});

test('a chicken flight stops short of a Woods edge without the map', () => {
  const t = setup();
  const { VL } = t;
  t.place(ow('5,-1', 3, 1));
  const plan = VL.planFlight(t.game, 'up');
  assert.ok(plan.land <= 1 && plan.reach <= 1, `stays on the screen: ${JSON.stringify(plain(plan))}`);
  t.game.items.woodsMapCopy = true;
  assert.ok(VL.planFlight(t.game, 'up').land >= 2, 'with the map it may glide on');
});

// ---------- the marks ----------

test('with the map, each route screen but the last has a mark beside its way on, and nothing else has one', () => {
  const t = setup({ copy: true });
  const { VL } = t;
  const route = VL.WOODS_ROUTE;
  const side = (from, to) => {
    const [ax, ay] = from.split(',').map(Number);
    const [bx, by] = to.split(',').map(Number);
    return [bx - ax, by - ay];
  };
  for (const key of VL.REGIONS.woods.screens) {
    t.place(ow(key, 7, 5));
    const marks = t.game.room.entities.filter((e) => e.type === 'woodsBlaze');
    const index = route.indexOf(key);
    if (index === -1 || index === route.length - 1) {
      assert.equal(marks.length, 0, `${key} has no mark`);
      continue;
    }
    assert.equal(marks.length, 1, `${key} has one mark`);
    const [dx, dy] = side(key, route[index + 1]);
    const mark = marks[0];
    const { cols, rows } = VL.TUNING;
    // On the edge it marks, on a tree, next to an open tile of that edge.
    if (dx) assert.equal(mark.x, dx < 0 ? 0 : cols - 1, key);
    else assert.equal(mark.y, dy < 0 ? 0 : rows - 1, key);
    assert.ok(VL.isSolidAt('overworld', key, mark.x, mark.y), `${key} mark on a tree`);
    const along = dx ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]];
    assert.ok(along.some(([ax, ay]) => !VL.isSolidAt('overworld', key, mark.x + ax, mark.y + ay)), `${key} mark beside the way on`);
  }
  const bare = setup();
  bare.place(ow('5,-1', 7, 5));
  assert.equal(bare.game.room.entities.filter((e) => e.type === 'woodsBlaze').length, 0, 'no marks without the map');
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
  for (const id of ['woodsLost', 'woodsWithMap']) {
    const popup = VL.POPUPS[id];
    assert.deepEqual(plain(VL.ART.missingGlyphs(`${popup.title} ${popup.text}`)), [], id);
    assert.ok(!VL.ART.popupLayout({ title: popup.title, text: popup.text }).overflow, id);
  }
  assert.match(VL.WOODS_TURNED_TEXT, /map of these woods/, 'every turn-back says what is needed');
  assert.deepEqual(plain(VL.ART.missingGlyphs(VL.WOODS_TURNED_TEXT)), []);
  assert.ok(!VL.ART.popupLayout({ text: VL.WOODS_TURNED_TEXT }).overflow);
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
