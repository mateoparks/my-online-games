// W29, Matthew's second playtest notes: clear shore barriers, the Woods
// spitters only a metal sword beats, the tree gate before the Hollow Oak,
// shells and digging, the dig key, the berry bushes spread along the story,
// the purses and bushes that give wood more often.
const assert = require('node:assert/strict');
const { test, loadGame, playState, hold } = require('./harness');

const plain = (value) => JSON.parse(JSON.stringify(value));
const ow = (screen, tx, ty, facing = 'up') => ({ area: 'overworld', screen, tx, ty, facing });
const shared = loadGame().VL;

// ---------- shore barriers ----------

const SHORE = new Set(['sand', 'shallow']);
const groundName = (VL, info) => VL.ART.groundOf(info).name;
const onShore = (VL, info) => SHORE.has(groundName(VL, info));
const liftable = (info) => Boolean(info.rock || info.boulder);

function overworldTiles(VL, visit) {
  for (const [key, screen] of Object.entries(VL.AREAS.overworld.screens)) {
    screen.tiles.forEach((row, ty) => [...row].forEach((ch, tx) => visit(key, tx, ty, VL.tileInfo('overworld', ch), ch)));
  }
}

test('nothing liftable stands on the sand or in the shallows, where lifting it would open nothing', () => {
  const VL = shared;
  const problems = [];
  overworldTiles(VL, (key, tx, ty, info, ch) => {
    if (liftable(info) && onShore(VL, info)) problems.push(`${key} (${tx},${ty}) '${ch}' on ${groundName(VL, info)}`);
  });
  assert.deepEqual(problems, []);
});

test('every shore edge that is blocked looks blocked: a barrier that cannot be lifted, never open sand into nothing', () => {
  const VL = shared;
  const { cols, rows } = VL.TUNING;
  const problems = [];
  overworldTiles(VL, (key, tx, ty, info, ch) => {
    const sides = [];
    if (tx === 0) sides.push([-1, 0]);
    if (tx === cols - 1) sides.push([1, 0]);
    if (ty === 0) sides.push([0, -1]);
    if (ty === rows - 1) sides.push([0, 1]);
    for (const [dx, dy] of sides) {
      const shore = info.sand || info.shallow || onShore(VL, info);
      if (!shore) continue;
      const other = VL.neighborKey(key, dx, dy);
      const ox = (tx + dx + cols) % cols;
      const oy = (ty + dy + rows) % rows;
      const open = !VL.isSolidAt('overworld', key, tx, ty);
      const across = VL.screenExists('overworld', other) && !VL.isSolidAt('overworld', other, ox, oy);
      if (open && !across) problems.push(`${key} (${tx},${ty}) '${ch}' looks open but leads nowhere`);
      if (!open && liftable(info)) problems.push(`${key} (${tx},${ty}) '${ch}' blocks the edge but can be lifted`);
    }
  });
  assert.deepEqual(problems, []);
});

test('the shore barrier is driftwood: solid, drawn on the sand, and S or the gloves never move it', () => {
  const { VL } = loadGame();
  const info = VL.tileInfo('overworld', 'j');
  assert.equal(info.solid, true);
  assert.equal(liftable(info), false);
  assert.equal(groundName(VL, info), 'sand');
  assert.ok(VL.ART.TILE_STYLES[info.art], 'it has a look');
  // The hut's beach, east end: the driftwood the brief asks for.
  assert.equal(VL.getScreen('overworld', '1,1').tiles[8][15], 'j');
  const state = playState(VL, ow('1,1', 14, 8, 'right'));
  state.items.liftingGloves = true;
  hold(VL, state, [], 0.1);
  VL.updateWorld(state, VL.actions({ pressed: ['interact'] }), 1 / 60);
  assert.ok(!state.player.lifted);
  assert.equal(VL.tileAt('overworld', '1,1', 15, 8, state.room), 'j');
  assert.ok(!state.message, 'no "too heavy": it is simply part of the shore');
});

test('a rock standing in the shallows would leave shallow water when lifted, never itself again', () => {
  const { VL } = loadGame();
  assert.equal(VL.liftedGround({ rock: true, ground: 'shallow' }), 'w');
});

test('the shallows at a blocked edge end in deep water, as on the harbour beach (hut, lake mouth, harbour, far beach)', () => {
  const VL = shared;
  for (const [key, tx, ty] of [['1,1', 15, 9], ['2,1', 0, 8], ['3,-2', 0, 2], ['3,-2', 15, 2], ['5,1', 15, 8]]) {
    assert.equal(VL.getScreen('overworld', key).tiles[ty][tx], 'W', `${key} (${tx},${ty})`);
  }
  for (const [key, tx, ty] of [['0,1', 0, 7], ['0,1', 0, 8], ['3,-2', 0, 3], ['3,-2', 15, 3], ['5,1', 15, 5]]) {
    assert.equal(VL.getScreen('overworld', key).tiles[ty][tx], 'j', `${key} (${tx},${ty})`);
  }
});

// ---------- the Woods spitters by the Hollow Oak ----------

function clearingWithSword(sword) {
  const { VL } = loadGame();
  const state = playState(VL, ow('7,-2', 4, 6, 'down'));
  VL.giveItem(state, sword);
  assert.equal(VL.heldItem(state, 'mainHand'), sword);
  state.popups.queue.length = 0;
  hold(VL, state, [], 1);
  const plant = state.room.entities.find((e) => e.type === 'spitter' && e.x === 4 && e.y === 7);
  return { VL, state, plant };
}

test('the spitters by the Hollow Oak shrug off a wood sword: no damage, just a clink', () => {
  const { VL, state, plant } = clearingWithSword('woodSword');
  assert.ok(plant, 'a spitter guards the clearing at (4,7)');
  const hp = plant.hp;
  const events = [];
  for (let i = 0; i < 6; i += 1) {
    VL.updateWorld(state, VL.actions({ pressed: ['mainHand'] }), 1 / 60);
    events.push(...state.events.map((e) => e.type));
    hold(VL, state, [], 0.5);
  }
  assert.equal(plant.hp, hp, 'not a scratch');
  assert.ok(state.room.entities.includes(plant), 'still there');
  assert.ok(events.includes('tink'), 'the blade clinks off');
  assert.ok(!events.includes('enemyHit'));
});

test('a metal sword beats them', () => {
  const { VL, state, plant } = clearingWithSword('metalSword');
  for (let i = 0; i < 6 && state.room.entities.includes(plant); i += 1) {
    VL.updateWorld(state, VL.actions({ pressed: ['mainHand'] }), 1 / 60);
    hold(VL, state, [], 0.5);
  }
  assert.ok(!state.room.entities.includes(plant), 'beaten');
});

test('only the clearing\'s spitters are that tough; every other enemy still falls to a wood sword', () => {
  const VL = shared;
  const tough = [];
  for (const [areaId, area] of Object.entries(VL.AREAS)) {
    for (const [key, screen] of Object.entries(area.screens)) {
      for (const e of screen.entities) if (e.tough) tough.push(`${areaId} ${key} ${e.type} (${e.x},${e.y})`);
    }
  }
  assert.deepEqual(tough, ['overworld 7,-2 spitter (4,7)', 'overworld 7,-2 spitter (12,6)']);
  assert.deepEqual(plain(VL.TUNING.toughSwords), ['metalSword']);
});

test('they never block the way (enemies are never solid), so the metal sword stays a choice before Dungeon 2, and it is affordable: one ore and no more shells than the first purse holds', () => {
  const VL = shared;
  assert.ok(!VL.ENTITIES.spitter.solid);
  assert.deepEqual(plain(VL.LOCKS.d2Boss.needs), ['hollowOakEntered', 'grapplingRope', ['woodSword', 'metalSword'], 'd2BossDoor']);
  const { ore, shells } = VL.TUNING.prices.metalGear;
  assert.equal(ore, 1);
  assert.ok(shells <= VL.TUNING.shellCap, `${shells} shells fit in a ${VL.TUNING.shellCap}-shell purse`);
  // Ore before Dungeon 2: the home shallows from the start, the Scriptorium.
  assert.deepEqual(plain(VL.LOCKS.oreShallows.needs), ['beach']);
  assert.deepEqual(plain(VL.LOCKS.oreScriptorium.needs), ['scriptoriumEntered', 'liftingGloves']);
});

// ---------- the trees before the Hollow Oak ----------

test('trees close the pass from 7,-1 up to the Hollow Oak until the Woods map is copied', () => {
  const { VL } = loadGame();
  const { findPath, isWalkable } = require('./playthrough');
  const gate = VL.WOODS_GATE_TREE;
  assert.deepEqual(plain(gate), { area: 'overworld', screen: '7,-1', tx: 7, ty: 2, opensTo: 'P' });
  const screen = VL.getScreen('overworld', '7,-1');
  assert.equal(VL.tileInfo('overworld', screen.tiles[2][7]).gate, 'woodsMapCopy', 'a tree that the map opens');
  assert.ok(VL.tileInfo('overworld', screen.tiles[2][6]).tree, 'and its neighbour, a plain tree');
  // Every way from the south of 7,-1 to the north of it crosses row 2 there.
  const state = playState(VL, ow('7,-1', 7, 3));
  assert.equal(isWalkable(VL, 'overworld', '7,-1', 7, 2, state), false);
  state.items.woodsMapCopy = true;
  const below = { area: 'overworld', screen: '7,-1', tx: 7, ty: 3 };
  const above = { area: 'overworld', screen: '7,-1', tx: 7, ty: 1 };
  assert.equal(findPath(VL, below, above, state), null, 'the map alone is not a path until the tree is gone');
});

test('copying the map turns one tree into a dirt path, saved for good (VL.saveTile) and walked through to the Oak', () => {
  const { VL } = loadGame();
  const { findPath } = require('./playthrough');
  const state = playState(VL, ow('3,-1', 8, 5));
  hold(VL, state, [], 0.1);
  assert.equal(VL.savedTile(state, 'overworld', '7,-1', 7, 2), null, 'no map, no path');
  VL.giveItem(state, 'woodsMapCopy');
  hold(VL, state, [], 0.1);
  assert.equal(VL.savedTile(state, 'overworld', '7,-1', 7, 2), 'P');
  const save = plain(VL.serializeSave(state));
  assert.equal(save.tileChanges['overworld:7,-1']['7,2'], 'P', 'in the save');
  VL.place(state, ow('7,-1', 7, 3));
  assert.equal(VL.tileAt('overworld', '7,-1', 7, 2, state.room), 'P');
  assert.equal(VL.tileAt('overworld', '7,-1', 6, 2, state.room), 'F', 'only one tree moves');
  const route = findPath(VL, { area: 'overworld', screen: '7,-1', tx: 7, ty: 3 }, { area: 'overworld', screen: '7,-2', tx: 7, ty: 5 }, state);
  assert.ok(route, 'up the new path to the clearing');
});

test('a save that copied the map before the trees existed finds the path open as it loads', () => {
  const { VL } = loadGame();
  const state = playState(VL, ow('5,0', 6, 2));
  state.items.woodsMapCopy = true;
  VL.place(state, ow('5,-1', 6, 8));
  assert.equal(VL.savedTile(state, 'overworld', '7,-1', 7, 2), 'P');
});

// ---------- shells on the seashore, and digging ----------

const SEASHORE = ['0,1', '1,1', '2,1', '3,1', '4,1', '5,1'];

test('every seashore screen has at least one broken shell lying on the sand', () => {
  const VL = shared;
  for (const key of SEASHORE) {
    const screen = VL.getScreen('overworld', key);
    const broken = screen.entities.filter((e) => e.type === 'shell' && !e.whole);
    assert.ok(broken.length >= 1, `${key} has a broken shell`);
    for (const e of broken) assert.ok(VL.tileInfo('overworld', screen.tiles[e.y][e.x]).sand, `${key} (${e.x},${e.y}) on sand`);
  }
});

test('digging the beach: a whole shell 20% of the time (30% with the Tide Tables), a broken shell 50%', () => {
  const { VL } = loadGame();
  assert.equal(VL.TUNING.digChance, 0.2);
  assert.equal(VL.TUNING.digChanceTideTables, 0.3);
  assert.equal(VL.TUNING.digBrokenChance, 0.5);
  const rates = (read) => {
    const game = VL.createGame({ seed: 29 });
    const count = { shell: 0, brokenShell: 0, null: 0 };
    for (let i = 0; i < 4000; i += 1) count[VL.digFind(game, 'sand', read)] += 1;
    return { shell: count.shell / 4000, broken: count.brokenShell / 4000 };
  };
  const plainRates = rates(false);
  const tide = rates(true);
  assert.ok(Math.abs(plainRates.shell - 0.2) < 0.025, `whole ${plainRates.shell}`);
  assert.ok(Math.abs(plainRates.broken - 0.5) < 0.025, `broken ${plainRates.broken}`);
  assert.ok(Math.abs(tide.shell - 0.3) < 0.025, `whole with the book ${tide.shell}`);
  assert.ok(Math.abs(tide.broken - 0.5) < 0.025, `broken with the book ${tide.broken}`);
  // Grass (the metal shovel) keeps its own odds and turns up no broken shells.
  const game = VL.createGame({ seed: 29 });
  for (let i = 0; i < 500; i += 1) assert.notEqual(VL.digFind(game, 'dirt', false), 'brokenShell');
});

test('a broken shell dug up pops out and is picked up like one on the beach', () => {
  const { VL } = loadGame();
  const state = playState(VL, ow('1,1', 5, 7, 'down'));
  VL.giveItem(state, 'woodShovel');
  state.popups.queue.length = 0;
  VL.random = () => 0.5;
  assert.equal(VL.dig(state, 'woodShovel'), 'brokenShell');
  const drop = state.room.entities.find((e) => e.type === 'drop');
  assert.deepEqual([drop.kind, drop.x, drop.y], ['brokenShell', 5, 8]);
  VL.random = () => 0.99;
  hold(VL, state, ['down'], 0.6);
  assert.equal(state.inventory.brokenShells, 1);
  assert.ok(VL.LOCKS.beachBrokenShells.reached(state));
});
