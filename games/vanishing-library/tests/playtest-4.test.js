// W34, Matthew's fourth playtest notes (world, economy, controls, books).
const assert = require('node:assert/strict');
const { test, loadGame, playState, hold } = require('./harness');

const ow = (screen, tx, ty, facing = 'up') => ({ area: 'overworld', screen, tx, ty, facing });

// ---------- walking speed ----------

test('the hero walks at about 2/3 of the W30 pace, and the Swiftfoot Boots keep their speed', () => {
  const { VL } = loadGame();
  const [w30Walk, w30Boots] = [70, 70 * 1.35];
  assert.ok(Math.abs(VL.TUNING.heroSpeed / w30Walk - 2 / 3) < 0.02, `walk ${VL.TUNING.heroSpeed}`);
  const state = VL.newGame();
  assert.equal(VL.heroSpeed(state), VL.TUNING.heroSpeed);
  state.items.swiftfootBoots = true;
  assert.ok(Math.abs(VL.heroSpeed(state) - w30Boots) < 1, `boots ${VL.heroSpeed(state)}`);
});

test('what chases the hero slowed with him, so a bat, a slime or a paper wad is still as easy to dodge as before', () => {
  const { VL } = loadGame();
  const T = VL.TUNING;
  const ratio = T.heroSpeed / 70;
  for (const [name, now, w30] of [['bat', T.enemyBat.speed, 44], ['slime hop', T.enemySlime.hopSpeed, 46], ['paper wad', T.bookwormSpitSpeed, 64]]) {
    assert.ok(Math.abs(now / w30 - ratio) < 0.03, `${name}: ${now}`);
  }
});

// ---------- the metal shovel takes wood too ----------

const plain = (value) => JSON.parse(JSON.stringify(value));
const offerIn = (VL, shop, id) => VL.SHOPS[shop].offers.find((o) => o.id === id);

test('the smith forges a metal shovel from 3 wood, 1 ore lump and 10 shells (6 with the Smith\'s Ledger); the sword and shield are unchanged', () => {
  const { VL } = loadGame();
  assert.deepEqual(plain(offerIn(VL, 'smithy', 'metalShovel').cost), { wood: 3, ore: 1, shells: 10 });
  assert.deepEqual(plain(offerIn(VL, 'smithy', 'metalShovelLedger').cost), { wood: 3, ore: 1, shells: 6 });
  for (const id of ['metalSword', 'metalShield']) assert.deepEqual(plain(offerIn(VL, 'smithy', id).cost), { ore: 1, shells: 10 });
  const state = playState(VL, ow('3,0', 6, 4));
  Object.assign(state.inventory, { ore: 1, shells: 10, wood: 2 });
  assert.deepEqual(plain(VL.buyOffer(state, offerIn(VL, 'smithy', 'metalShovel'))), { ok: false, reason: 'notEnough', kind: 'wood' });
  state.inventory.wood = 3;
  assert.equal(VL.buyOffer(state, offerIn(VL, 'smithy', 'metalShovel')).ok, true);
  assert.deepEqual([state.inventory.wood, state.inventory.ore, state.inventory.shells], [0, 0, 0]);
  assert.ok(VL.hasItem(state, 'metalShovel'));
});

test('the progression table knows the metal shovel needs wood, and the solver stays clean', () => {
  const { VL } = loadGame();
  assert.ok(VL.LOCKS.metalShovel.needs.includes('wood'));
  assert.deepEqual([...VL.solveProgression().problems], []);
});

// ---------- the berries popup ----------

test('the first berries popup says how to eat one, and leaves the regrowing for him to find out', () => {
  const { VL } = loadGame();
  const { text } = VL.POPUPS.berries;
  assert.match(text, /heal a heart/);
  assert.doesNotMatch(text, /grow/i);
});

// ---------- X closes the equipment and the maps ----------

const { fakeDocument } = require('./harness');

function drawnStrings(VL, app) {
  const strings = [];
  const original = VL.ART.text;
  VL.ART.text = (ctx, str, ...rest) => {
    strings.push(String(str));
    return original(ctx, str, ...rest);
  };
  try {
    VL.render(fakeDocument().createElement('canvas').getContext('2d'), app, 0);
  } finally {
    VL.ART.text = original;
  }
  return strings;
}

const press = (VL, app, action) => app.update(VL.actions({ pressed: [action] }), 1 / 60);

test('the equipment view closes with X as well as E and Esc, and its footer says X: BACK', () => {
  const { VL } = loadGame();
  for (const key of ['dig', 'equipment', 'pause']) {
    const app = VL.createApp();
    app.game = VL.newGame();
    app.setScene('play');
    press(VL, app, 'equipment');
    assert.equal(app.sceneId, 'equipment');
    for (const list of [[], ['woodSword'], ['woodSword', 'woodShield', 'woodShovel', 'grapplingRope', 'liftingGloves', 'slingshot']]) {
      for (const id of list) app.game.items[id] = true;
      const footer = drawnStrings(VL, app).find((s) => /BACK/.test(s));
      assert.match(footer, /X: BACK$/, footer);
      assert.doesNotMatch(footer, /E: BACK/);
    }
    press(VL, app, key);
    assert.equal(app.sceneId, 'play', `${key} goes back to the game`);
    assert.equal(app.game.player.dig ?? null, null, 'X closing the view does not dig');
  }
});

test('the world map and the woods copy close with X, M or Esc; the map\'s footer says X: CLOSE', () => {
  const { VL } = loadGame();
  for (const key of ['dig', 'map', 'pause']) {
    const app = VL.createApp();
    app.game = VL.newGame();
    app.setScene('play');
    VL.giveItem(app.game, 'worldMap');
    app.game.popups.queue.length = 0;
    app.setScene('worldMap', { mode: 'view' });
    const strings = drawnStrings(VL, app);
    assert.ok(strings.includes('X: CLOSE'), strings.join('|'));
    assert.ok(!strings.includes('M: CLOSE'));
    press(VL, app, key);
    assert.equal(app.sceneId, 'play', `${key} closes the world map`);
    app.setScene('copyView', { id: 'woodsMapCopy' });
    for (let i = 0; i < 30; i += 1) app.update(VL.actions({}), 1 / 60);
    press(VL, app, key);
    assert.equal(app.sceneId, 'play', `${key} closes the woods copy`);
  }
  // Asked whether to draw one, X says no like M.
  const app = VL.createApp();
  app.game = VL.newGame();
  app.setScene('worldMap', { mode: 'ask', back: 'play' });
  press(VL, app, 'dig');
  assert.equal(app.sceneId, 'play');
});

test('a dungeon map closes with X, M or Esc, and its footer says X: BACK', () => {
  const { VL } = loadGame();
  for (const key of ['dig', 'map', 'pause']) {
    const app = VL.createApp();
    app.game = VL.newGame();
    VL.place(app.game, { area: 'scriptorium', screen: '1,0', tx: 7, ty: 8, facing: 'up' });
    app.setScene('play');
    app.setScene('dungeonMap');
    for (const map of [false, true]) {
      VL.dungeonState(app.game, 'scriptorium').map = map;
      const footer = drawnStrings(VL, app).find((s) => /BACK/.test(s));
      assert.match(footer, /X: BACK$/, footer);
      assert.doesNotMatch(footer, /M: BACK/);
    }
    press(VL, app, key);
    assert.equal(app.sceneId, 'play', `${key} closes the dungeon map`);
  }
});

// ---------- the Woods without the map ----------

test('the progression table: the Woods\' paths need only the east road; the ore, the Herbalist and the Woods book lie on them; the Oak\'s clearing still needs the copy', () => {
  const { VL } = loadGame();
  assert.deepEqual(plain(VL.LOCKS.woodsPaths.needs), ['eastRoad']);
  assert.equal(VL.LOCKS.woodsPaths.type, 'place');
  for (const id of ['oreWoods', 'bookHerbalist', 'bookWoods']) {
    assert.ok(VL.LOCKS[id].needs.includes('woodsPaths') && !VL.LOCKS[id].needs.includes('woods'), id);
  }
  assert.deepEqual(plain(VL.LOCKS.woods.needs), ['eastRoad', 'woodsMapCopy']);
  const state = VL.newGame();
  assert.equal(VL.LOCKS.woodsPaths.reached(state), false);
  VL.place(state, ow('6,-1', 10, 3));
  assert.equal(VL.LOCKS.woodsPaths.reached(state), true);
  assert.deepEqual([...VL.solveProgression().problems], []);
});

// ---------- enemy heart drops ----------

test('a beaten enemy drops a heart about 70% less often than before (0.2 -> 0.06); shells drop as often as ever', () => {
  const { VL } = loadGame();
  const { heart, shell } = VL.TUNING.enemyDrops;
  assert.ok(Math.abs(heart - 0.2 * 0.3) < 1e-9, `heart ${heart}`);
  assert.equal(shell, 0.2);
  const counts = { heart: 0, shell: 0, null: 0 };
  for (let i = 0; i < 1000; i += 1) counts[VL.enemyDrop((i + 0.5) / 1000)] += 1;
  assert.deepEqual(counts, { heart: 60, shell: 200, null: 740 });
});

// ---------- a dungeon map's popup, in every dungeon ----------

test('each dungeon\'s map brings its own "A dungeon map!" popup, so it shows in every dungeon, once each', () => {
  const { VL } = loadGame();
  const maps = [];
  for (const dungeon of Object.values(VL.DUNGEONS)) {
    for (const [screen, def] of Object.entries(VL.AREAS[dungeon.area].screens)) {
      for (const e of def.entities || []) if (e.type === 'dungeonMap') maps.push({ dungeon: dungeon.id, screen, ...e });
    }
  }
  assert.deepEqual(maps.map((m) => m.dungeon).sort(), ['hollowOak', 'lair', 'lighthouse', 'scriptorium']);
  const state = VL.newGame();
  state.popups.seen.controls = true;
  const shown = [];
  for (const map of maps) {
    VL.place(state, { area: VL.DUNGEONS[map.dungeon].area, screen: map.screen, tx: map.x, ty: map.y === 0 ? 1 : map.y - 1, facing: 'down' });
    state.popups.queue.length = 0;
    const entity = state.room.entities.find((e) => e.type === 'dungeonMap');
    VL.ENTITIES.dungeonMap.onStand(state, entity);
    assert.ok(VL.dungeonState(state, map.dungeon).map, `${map.dungeon}'s map is taken`);
    const id = state.popups.queue.find((p) => /dungeonMap/.test(p));
    assert.ok(id, `${map.dungeon} pops up its map`);
    assert.equal(VL.POPUPS[id].title, 'A dungeon map!');
    shown.push(id);
    state.popups.seen[id] = true;
  }
  assert.equal(new Set(shown).size, 4, 'four popups, one per dungeon');
  // An old save that saw the first one (id dungeonMap) still sees the others.
  assert.equal(VL.DUNGEON_MAP_POPUPS.scriptorium, 'dungeonMap');
});
