// Tilesets, world data invariants (run over every area), movement, edges, doors.
const assert = require('node:assert/strict');
const { test, loadGame, addFixtureWorld, playState, hold, holdUntil, heroTile } = require('./harness');

// ---------- tiles and world data ----------

test('tilesets: the base legend has the expected tile kinds', () => {
  const { VL } = loadGame();
  const base = VL.TILESETS.base;
  assert.equal(base['.'].solid, undefined);
  assert.equal(base.T.solid, true);
  assert.equal(base.B.cuttable, true);
  assert.equal(base.Y.berry, true);
  assert.equal(base.W.water, true);
  assert.equal(base.w.shallow, true);
  assert.equal(base.D.door, true);
  assert.equal(base.m.door, true);
  assert.equal(base.s.sand, true);
});

test('areas can use their own tileset', () => {
  const { VL } = loadGame();
  VL.defineTileset('cave', { '#': { solid: true }, '.': {} });
  VL.defineArea('cave', { tileset: 'cave' });
  VL.addScreens('cave', { '0,0': { tiles: Array(11).fill('#..............#'), entities: [] } });
  assert.equal(VL.tileInfo('cave', '#').solid, true);
  assert.equal(VL.isSolidAt('cave', '0,0', 0, 0), true);
  assert.equal(VL.isSolidAt('cave', '0,0', 1, 0), false);
});

test('every screen in every area is 16×11 with known tiles', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  let screens = 0;
  for (const [areaId, area] of Object.entries(VL.AREAS)) {
    for (const [key, screen] of Object.entries(area.screens)) {
      screens += 1;
      assert.equal(screen.tiles.length, 11, `${areaId} ${key} rows`);
      for (const row of screen.tiles) {
        assert.equal(row.length, 16, `${areaId} ${key} cols`);
        for (const ch of row) assert.ok(VL.tileset(areaId)[ch], `unknown tile ${ch} in ${areaId} ${key}`);
      }
    }
  }
  assert.ok(screens >= 6);
});

test('open screen edges line up with their neighbours', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  const sides = [
    { dx: 1, dy: 0, mine: (i) => [15, i], theirs: (i) => [0, i], count: 11 },
    { dx: -1, dy: 0, mine: (i) => [0, i], theirs: (i) => [15, i], count: 11 },
    { dx: 0, dy: 1, mine: (i) => [i, 10], theirs: (i) => [i, 0], count: 16 },
    { dx: 0, dy: -1, mine: (i) => [i, 0], theirs: (i) => [i, 10], count: 16 },
  ];
  for (const [areaId, area] of Object.entries(VL.AREAS)) {
    for (const key of Object.keys(area.screens)) {
      for (const side of sides) {
        const other = VL.neighborKey(key, side.dx, side.dy);
        if (!VL.screenExists(areaId, other)) continue;
        for (let i = 0; i < side.count; i += 1) {
          const [mx, my] = side.mine(i);
          const [tx, ty] = side.theirs(i);
          assert.equal(
            VL.isSolidAt(areaId, key, mx, my),
            VL.isSolidAt(areaId, other, tx, ty),
            `${areaId} ${key} (${mx},${my}) vs ${other} (${tx},${ty})`,
          );
        }
      }
    }
  }
});

test('doors lead to walkable tiles on existing screens, and the start is walkable', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  let doors = 0;
  for (const [areaId, area] of Object.entries(VL.AREAS)) {
    for (const [key, screen] of Object.entries(area.screens)) {
      for (const entity of screen.entities.filter((e) => e.type === 'door')) {
        doors += 1;
        assert.ok(VL.screenExists(entity.to.area, entity.to.screen), `${areaId} ${key} door target exists`);
        assert.equal(VL.isSolidAt(entity.to.area, entity.to.screen, entity.to.tx, entity.to.ty), false);
        assert.equal(VL.isSolidAt(areaId, key, entity.x, entity.y), false, 'door tile is walkable');
      }
    }
  }
  assert.ok(doors >= 4);
  assert.equal(VL.isSolidAt(VL.START.area, VL.START.screen, VL.START.tx, VL.START.ty), false);
});

test('tile lookups wrap into the neighbour and are solid off the world edge', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  assert.equal(VL.neighborKey('1,1', -1, 0), '0,1');
  assert.equal(VL.neighborKey('0,0', 0, 1), '0,1');
  assert.equal(VL.tileAt('test', '0,0', 16, 5), '.', 'wraps into 1,0');
  assert.equal(VL.tileAt('test', '0,0', -1, 5), null, 'no screen west of 0,0');
  assert.equal(VL.isSolidAt('test', '0,0', -1, 5), true);
  assert.equal(VL.isSolidAt('test', '1,0', 16, 5), true, 'open tile but no neighbour');
  assert.equal(VL.isSolidAt('test', '0,0', -1, -1), true, 'diagonals are solid');
});

// ---------- movement ----------

test('walking moves the hero and sets facing', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  const state = playState(VL, { area: 'test', screen: '0,0', tx: 8, ty: 2, facing: 'down' });
  const { x, y } = state.player;
  hold(VL, state, ['left'], 0.25);
  assert.ok(state.player.x < x - 15);
  assert.equal(state.player.y, y);
  assert.equal(state.player.facing, 'left');
  assert.equal(state.player.moving, true);
  hold(VL, state, ['up'], 0.25);
  assert.equal(state.player.facing, 'up');
  hold(VL, state, [], 1 / 60);
  assert.equal(state.player.moving, false);
});

test('diagonal movement is normalized', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  const state = playState(VL, { area: 'test', screen: '0,0', tx: 8, ty: 2 });
  const { x, y } = state.player;
  hold(VL, state, ['right', 'down'], 0.5);
  const distance = Math.hypot(state.player.x - x, state.player.y - y);
  assert.ok(Math.abs(distance - VL.TUNING.heroSpeed * 0.5) < 2, `moved ${distance}`);
});

test('solid tiles block and the hero slides along walls', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  // The fixture has a lone tree at tile (8,4); start directly below it.
  const state = playState(VL, { area: 'test', screen: '0,0', tx: 8, ty: 6 });
  const { x } = state.player;
  hold(VL, state, ['up'], 1);
  const wallY = 80 + VL.TUNING.heroBox.h / 2;
  assert.ok(Math.abs(state.player.y - wallY) < 1, `stopped at the tree: ${state.player.y}`);
  assert.equal(state.player.x, x);
  hold(VL, state, ['up', 'left'], 0.15);
  assert.ok(Math.abs(state.player.y - wallY) < 1, 'still against the tree');
  assert.ok(state.player.x < x - 6, 'slid left along it');
});

test('crossing an open edge changes screen, records the visit, wraps and slides', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  const state = playState(VL, { area: 'test', screen: '0,0', tx: 14, ty: 5 });
  holdUntil(VL, state, ['right'], (s) => s.player.screen === '1,0', 0.5);
  assert.equal(state.visited['test:1,0'], true);
  assert.ok(state.player.x < 8, `wrapped to the left edge: ${state.player.x}`);
  assert.equal(state.transition.dir, 'right');
  assert.equal(state.transition.from.area, 'test');
  assert.equal(state.transition.from.screen, '0,0');
  assert.ok(state.events.some((event) => event.type === 'enterScreen'));
  const xDuring = state.player.x;
  hold(VL, state, ['right'], 0.1);
  assert.equal(state.player.x, xDuring, 'input is ignored while the slide runs');
  hold(VL, state, ['right'], VL.TUNING.slideSeconds);
  assert.equal(state.transition, null);
  assert.ok(state.player.x > xDuring, 'walking resumes after the slide');
});

test('all four edge directions transition', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  const cases = [
    { from: '0,0', tx: 14, ty: 5, dir: 'right', to: '1,0' },
    { from: '1,0', tx: 1, ty: 5, dir: 'left', to: '0,0' },
    { from: '0,0', tx: 9, ty: 9, dir: 'down', to: '0,1' },
    { from: '0,1', tx: 9, ty: 1, dir: 'up', to: '0,0' },
  ];
  for (const c of cases) {
    const state = playState(VL, { area: 'test', screen: c.from, tx: c.tx, ty: c.ty });
    hold(VL, state, [c.dir], 0.5);
    assert.equal(state.player.screen, c.to, `${c.dir} from ${c.from}`);
    assert.equal(state.transition.dir, c.dir);
  }
});

test('an open edge with no neighbour is a wall', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  const state = playState(VL, { area: 'test', screen: '1,0', tx: 14, ty: 5 });
  hold(VL, state, ['right'], 1);
  assert.equal(state.player.screen, '1,0');
  assert.ok(state.player.x <= 256 - VL.TUNING.heroBox.w / 2 + 1e-6);
  assert.equal(state.transition, null);
});

test('doors lead inside without a slide and the mat leads back out', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  const state = playState(VL, { area: 'test', screen: '0,1', tx: 3, ty: 5 });
  holdUntil(VL, state, ['up'], (s) => s.player.area === 'room');
  assert.equal(state.player.screen, '0,0');
  assert.equal(state.transition, null, 'doors do not slide');
  assert.equal(state.player.facing, 'up');
  assert.deepEqual(heroTile(VL, state), [7, 8]);
  assert.equal(state.visited['room:0,0'], true);
  assert.ok(state.events.some((event) => event.type === 'door'));
  holdUntil(VL, state, ['down'], (s) => s.player.area === 'test');
  assert.equal(state.player.screen, '0,1');
  assert.equal(state.player.facing, 'down');
  assert.deepEqual(heroTile(VL, state), [3, 4]);
  hold(VL, state, [], 0.5);
  assert.equal(state.player.area, 'test', 'standing still beside the door does not re-enter it');
});

test('entering a screen rebuilds the room from the screen entities', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  const state = playState(VL, { area: 'test', screen: '0,1', tx: 8, ty: 5 });
  assert.equal(state.room.entities.length, 1);
  state.room.entities[0].opened = true;
  VL.place(state, { area: 'test', screen: '0,0', tx: 8, ty: 2 });
  VL.place(state, { area: 'test', screen: '0,1', tx: 8, ty: 5 });
  assert.equal(state.room.entities[0].opened, undefined, 'fresh copies each visit');
  assert.notEqual(state.room.entities[0], VL.AREAS.test.screens['0,1'].entities[0]);
});

test('a new game starts at VL.START', () => {
  const { VL } = loadGame();
  const state = VL.newGame();
  assert.equal(state.player.area, VL.START.area);
  assert.equal(state.player.screen, VL.START.screen);
  assert.equal(state.visited[`${VL.START.area}:${VL.START.screen}`], true);
  assert.equal(state.hp, VL.TUNING.startMaxHp);
});
