// W44, Matthew's notes: save lanterns and a homier hut. Only a lantern, Save &
// Quit and the credits save; a faint goes back to the last save; seven
// lanterns (the hut's on a nightstand); old saves wake at the new lanterns.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, read, loadGame, memoryStorage, fakeContext, hold } = require('./harness');
const { findPath } = require('./playthrough');

const STEP = 1 / 60;
const plain = (value) => JSON.parse(JSON.stringify(value));
const shared = loadGame().VL;
const fixtureText = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
const tileOf = (VL, state) => [state.player.area, state.player.screen, VL.heroTile(state).tx, VL.heroTile(state).ty];
const placeOf = (p) => [p.area, p.screen, p.tx, p.ty];

function slotApp(VL, game = VL.newGame({ name: 'Robin' })) {
  const backing = memoryStorage();
  const app = VL.createApp({ storage: VL.createStorage(backing) });
  app.startGame(game, 0, { fresh: true });
  app.save();
  app.setScene('play');
  game.popups.seen.controls = true;
  return { app, backing };
}

// ---------- the seven lanterns ----------

test('seven lanterns, each a savePoint where the table says, and no other save point anywhere', () => {
  const VL = shared;
  assert.deepEqual(Object.keys(VL.SAVE_LANTERNS), ['hut', 'library', 'scriptorium', 'woods', 'lighthouse', 'wreck', 'lair']);
  const found = [];
  for (const [area, def] of Object.entries(VL.AREAS)) {
    for (const [screen, s] of Object.entries(def.screens)) {
      for (const e of s.entities) if (e.type === 'savePoint') found.push([area, screen, e.x, e.y]);
    }
  }
  assert.deepEqual(found.sort(), Object.values(VL.SAVE_LANTERNS).map(placeOf).sort());
  assert.equal(VL.ENTITIES.saveStatue, undefined, 'the entrance statues are gone');
  for (const lantern of Object.values(VL.SAVE_LANTERNS)) {
    assert.ok(VL.standsFirm(null, lantern), `${placeOf(lantern)} is open ground`);
  }
});

// Flood fill over a screen's own tiles from the lantern, the door into the
// dungeon (and the Woods' gate tree) shut: the lantern can be reached from
// the screen's edges before the dungeon opens, and it stands on nobody's path.
function reachableEdges(VL, lantern, shut) {
  const { cols, rows } = VL.TUNING;
  const screen = VL.getScreen(lantern.area, lantern.screen);
  const open = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows && !shut.some(([sx, sy]) => sx === x && sy === y)
    && !VL.tileInfo(lantern.area, screen.tiles[y][x]).solid
    && !screen.entities.some((e) => e.x === x && e.y === y && (e.solid || VL.ENTITIES[e.type]?.solid));
  const seen = new Set([`${lantern.tx},${lantern.ty}`]);
  const queue = [[lantern.tx, lantern.ty]];
  const edges = new Set();
  while (queue.length) {
    const [x, y] = queue.shift();
    if (x === 0) edges.add('west');
    if (x === cols - 1) edges.add('east');
    if (y === 0) edges.add('north');
    if (y === rows - 1) edges.add('south');
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const key = `${x + dx},${y + dy}`;
      if (seen.has(key) || !open(x + dx, y + dy)) continue;
      seen.add(key);
      queue.push([x + dx, y + dy]);
    }
  }
  return edges;
}

test('each lantern by a dungeon stands just outside its door, reachable over open ground before the dungeon opens', () => {
  const VL = shared;
  for (const [id, lantern] of Object.entries(VL.SAVE_LANTERNS)) {
    if (!lantern.dungeon || id === 'wreck') continue;
    const dungeon = VL.DUNGEONS[lantern.dungeon];
    assert.equal(lantern.area, 'overworld', `${id}: outside`);
    if (id === 'woods') {
      assert.equal(lantern.screen, VL.neighborKey(dungeon.entrance.screen, 0, 1), 'the Woods lantern is on the screen below the Hollow Oak');
      const gate = VL.WOODS_GATE_TREE;
      assert.equal(gate.screen, lantern.screen);
      const edges = reachableEdges(VL, lantern, [[gate.tx, gate.ty]]);
      assert.ok(edges.has('south') && !edges.has('north'), `${id}: from the south, with the gate tree still standing (before the map is copied): ${[...edges]}`);
      continue;
    }
    assert.equal(lantern.screen, dungeon.entrance.screen, `${id}: on the screen of its door`);
    const door = VL.getScreen('overworld', lantern.screen).entities.find((e) => e.type === 'door' && e.to?.area === dungeon.area);
    const edges = reachableEdges(VL, lantern, [[door.x, door.y]]);
    assert.ok(edges.size > 0, `${id}: reached from an edge of the screen with the door shut`);
    assert.ok(Math.abs(door.x - lantern.tx) + Math.abs(door.y - lantern.ty) <= 5, `${id}: near the door`);
  }
  assert.equal(VL.SAVE_LANTERNS.wreck.area, 'wreck', 'the shipwreck\'s stays inside, as Matthew asked');
});

test('the Woods lantern can be walked to and used before the map is copied', () => {
  const { VL } = loadGame();
  const { app } = slotApp(VL);
  const game = app.game;
  assert.equal(VL.hasItem(game, 'woodsMapCopy'), false);
  const lantern = VL.SAVE_LANTERNS.woods;
  VL.place(game, { area: 'overworld', screen: lantern.screen, tx: 11, ty: 10, facing: 'up' });
  game.room.entities = game.room.entities.filter((e) => !VL.isEnemy(e));
  const route = findPath(VL, { area: 'overworld', screen: lantern.screen, tx: 11, ty: 10 }, lantern, game);
  assert.ok(route, 'a path from the south edge');
  for (const node of route.slice(1)) {
    const spot = VL.tileCenter(node.tx, node.ty);
    for (let i = 0; i < 60 && (Math.abs(game.player.x - spot.x) > 0.7 || Math.abs(game.player.y - spot.y) > 0.7); i += 1) app.update(VL.actions({ held: [node.dir] }), STEP);
  }
  assert.deepEqual(placeOf(game.savePoint), placeOf(lantern), 'saved there');
});

test('every lantern is a safe place to wake: nothing hurts him standing there for fifteen seconds', () => {
  for (const [id, lantern] of Object.entries(shared.SAVE_LANTERNS)) {
    const { VL } = loadGame();
    const game = VL.newGame({ name: 'Robin' });
    game.flags['met:gran'] = true;
    VL.saveGame(game, lantern);
    VL.faint(game, 'default');
    VL.respawn(game);
    assert.deepEqual(tileOf(VL, game), placeOf(lantern), `${id}: woke there`);
    const hp = game.hp;
    hold(VL, game, [], 15);
    assert.ok(game.hp >= hp - 1, `${id}: fifteen seconds cost at most half a heart (${hp - game.hp})`);
  }
});

// ---------- the hut ----------

test('the hut: a bed, an empty bookshelf, the lantern on a nightstand saved from the step in front, indoors and cosy', () => {
  const VL = shared;
  const hut = VL.getScreen('hut', '0,0');
  const decor = (art) => hut.entities.find((e) => e.type === 'decor' && e.art === art);
  for (const art of ['hutBed', 'hutNightstand', 'hutShelf', 'hutRug', 'hutWindow', 'hutTable', 'hutPlant']) assert.ok(decor(art), art);
  const lantern = hut.entities.find((e) => e.type === 'savePoint');
  assert.deepEqual([lantern.x, lantern.y, lantern.on], [VL.HOME_SAVE.tx, VL.HOME_SAVE.ty, 'nightstand']);
  const stand = decor('hutNightstand');
  assert.deepEqual([stand.x, stand.y], [lantern.x, lantern.y - 1], 'the nightstand stands right behind the step');
  for (const art of ['hutBed', 'hutNightstand', 'hutShelf', 'hutTable', 'hutPlant']) {
    const e = decor(art);
    assert.ok(VL.isSolidAt('hut', '0,0', e.x, e.y), `${art} is furniture he walks round`);
  }
  assert.ok(VL.isSolidAt('hut', '0,0', decor('hutBed').x, decor('hutBed').y + 1), 'the bed is two tiles long');
  assert.ok(VL.isSolidAt('hut', '0,0', decor('hutShelf').x + 1, decor('hutShelf').y), 'the shelf two tiles wide');
  assert.ok(!VL.isSolidAt('hut', '0,0', decor('hutRug').x + 1, decor('hutRug').y + 1), 'the rug is walked on');
  const door = { area: 'hut', screen: '0,0', tx: 7, ty: 8 };
  for (const spot of [VL.HOME_SAVE, VL.SHOCKWAVE_WAKE, { ...VL.SHOCKWAVE_HELPER, tx: VL.SHOCKWAVE_HELPER.x, ty: VL.SHOCKWAVE_HELPER.y }, { tx: 12, ty: 3 }]) {
    assert.ok(findPath(VL, door, { area: 'hut', screen: '0,0', tx: spot.tx, ty: spot.ty }), `(${spot.tx},${spot.ty}) is reached from the door`);
  }
  assert.equal(VL.ART.lightFor('hut'), 'indoor');
  const sign = VL.getScreen('overworld', '1,1').entities.find((e) => e.type === 'sign');
  assert.match(sign.text, /lantern inside/);
});

test('render smoke: the hut and the screen of every lantern draw, the nightstand\'s lantern up on it', () => {
  const { VL } = loadGame();
  const app = VL.createApp();
  app.game = VL.newGame({ name: 'Robin' });
  app.setScene('play');
  for (const lantern of Object.values(VL.SAVE_LANTERNS)) {
    VL.place(app.game, lantern);
    const ctx = fakeContext();
    VL.render(ctx, app, 0.4);
    assert.ok(Object.values(ctx.calls).reduce((a, b) => a + b, 0) > 100, `${lantern.area} ${lantern.screen} draws`);
  }
  const drawn = [];
  const drawSprite = VL.ART.drawSprite;
  VL.ART.drawSprite = (ctx, id, x, y) => {
    drawn.push([id, x, y]);
    return drawSprite(ctx, id, x, y);
  };
  VL.place(app.game, { area: 'hut', screen: '0,0', tx: 7, ty: 6 });
  VL.drawScreen(fakeContext(), 'hut', '0,0', 0, 0, 0, app.game.room);
  VL.ART.drawSprite = drawSprite;
  const lit = drawn.find(([id]) => id.startsWith('prop-lantern'));
  assert.ok(lit, 'the lantern is drawn');
  assert.ok(lit[2] < VL.HOME_SAVE.ty * VL.TUNING.tile, 'up on the nightstand, above the step');
});

// ---------- what saves ----------

test('only a save writes: a find, a boss, a book, a story beat write nothing and flash nothing', () => {
  const { VL } = loadGame();
  const { app, backing } = slotApp(VL);
  const before = backing.getItem(VL.slotKey(0));
  const savedAt = app.savedAt;
  const game = app.game;
  VL.place(game, { area: 'overworld', screen: '1,0', tx: 5, ty: 6 });
  VL.giveHeartContainer(game);
  VL.dungeonState(game, 'scriptorium').boss = true;
  VL.bossDefeated(game, 'hollowOak');
  VL.markFound(game, 'bookRiverside');
  game.flags.trapdoorOpen = true;
  for (let i = 0; i < 30; i += 1) app.update(VL.noActions(), STEP);
  assert.equal(backing.getItem(VL.slotKey(0)), before);
  assert.equal(app.savedAt, savedAt, 'no SAVED flash');
  assert.equal(game.dirty, false);
});

test('a lantern saves the game as it is, and he wakes at it on Continue without saving again on the first step', () => {
  const { VL } = loadGame();
  const { app, backing } = slotApp(VL);
  const lantern = VL.SAVE_LANTERNS.scriptorium;
  app.game.inventory.wood = 4;
  VL.place(app.game, { ...lantern, ty: lantern.ty + 1, facing: 'up' });
  for (let i = 0; i < 30 && !app.game.savePoint; i += 1) app.update(VL.actions({ held: ['up'] }), STEP);
  assert.deepEqual(placeOf(app.game.savePoint), placeOf(lantern));
  const saved = JSON.parse(backing.getItem(VL.slotKey(0)));
  assert.equal(saved.inventory.wood, 4);
  const next = VL.reloadApp(app);
  assert.deepEqual(tileOf(VL, next.game), placeOf(lantern));
  const text = backing.getItem(VL.slotKey(0));
  for (let i = 0; i < 10; i += 1) next.update(VL.actions({ held: ['left'] }), STEP);
  assert.equal(backing.getItem(VL.slotKey(0)), text, 'waking on it is not stepping on it');
  assert.equal(next.savedAt, null);
});

// ---------- Save & Quit: where Continue starts ----------

test('Save & Quit wakes him exactly where he stood on the overworld, facing the same way', () => {
  const { VL } = loadGame();
  const { app } = slotApp(VL);
  VL.place(app.game, { area: 'overworld', screen: '1,0', tx: 5, ty: 6, facing: 'left' });
  app.game.inventory.shells = 3;
  const next = VL.reloadApp(app, { save: true });
  assert.deepEqual(tileOf(VL, next.game), ['overworld', '1,0', 5, 6]);
  assert.equal(next.game.player.facing, 'left');
  assert.equal(next.game.inventory.shells, 3);
  assert.equal(VL.quitPlace(next.game).words, 'right here');
});

test('Save & Quit where he cannot stand after a reload (afloat on the raft, mid-flight) wakes him where he came onto the screen, or at his last save', () => {
  const { VL } = loadGame();
  const game = VL.newGame({ name: 'Robin' });
  Object.assign(game.items, { raft: true, oar: true });
  VL.saveGame(game, VL.HOME_SAVE);
  VL.place(game, { area: 'overworld', screen: '1,1', tx: 6, ty: 7, facing: 'down' });
  game.player.y = VL.tileCenter(6, 10).y;
  assert.deepEqual(plain(VL.quitPlace(game)), { place: { area: 'overworld', screen: '1,1', tx: 6, ty: 7, facing: 'down' }, words: 'where you came in' }, 'on deep water: the shore he came from');
  game.player.flight = { t: 0 };
  game.player.y = VL.tileCenter(6, 7).y;
  assert.equal(VL.quitPlace(game).words, 'where you came in', 'carried by a chicken');
  game.player.flight = null;
  game.room.entry = { area: 'overworld', screen: '1,1', tx: 6, ty: 10, facing: 'down' };
  game.player.y = VL.tileCenter(6, 10).y;
  assert.deepEqual(plain(VL.quitPlace(game)), { place: plain(VL.HOME_SAVE), words: 'at your last save' }, 'sailed in: his last save');
});

test('Save & Quit in a dungeon wakes him where he came into the room (rooms come back fresh); on a lantern, at the lantern; below the trapdoor, at his last save', () => {
  const { VL } = loadGame();
  const game = VL.newGame({ name: 'Robin' });
  VL.saveGame(game, VL.HOME_SAVE);
  VL.place(game, { area: 'scriptorium', screen: '1,0', tx: 7, ty: 9, facing: 'up' });
  Object.assign(game.player, VL.tileCenter(4, 4));
  assert.deepEqual(plain(VL.quitPlace(game)), { place: { area: 'scriptorium', screen: '1,0', tx: 7, ty: 9, facing: 'up' }, words: 'where you came in' });
  VL.place(game, VL.FINALE.arrival);
  assert.deepEqual(plain(VL.quitPlace(game)), { place: plain(VL.HOME_SAVE), words: 'at your last save' });
  VL.place(game, { area: 'wreck', screen: '0,0', tx: 7, ty: 4, facing: 'up' });
  hold(VL, game, ['up'], 0.3);
  assert.deepEqual(placeOf(VL.quitPlace(game).place), ['wreck', '0,0', 7, 3], 'on the hold\'s lantern');
});

// ---------- fainting ----------

test('a faint goes back to the last save: items, books, flags, dungeon state and story beats since are gone; full hearts at its place', () => {
  const { VL } = loadGame();
  const { app, backing } = slotApp(VL);
  const game = app.game;
  game.items.woodSword = true;
  VL.saveGame(game, VL.SAVE_LANTERNS.library);
  app.update(VL.noActions(), STEP);
  const written = backing.getItem(VL.slotKey(0));
  game.items.grapplingRope = true;
  VL.markFound(game, 'bookRiverside');
  VL.dungeonState(game, 'scriptorium').boss = true;
  game.flags.shockwave = true;
  game.maxHp += 2;
  VL.place(game, { area: 'overworld', screen: '1,0', tx: 5, ty: 6 });
  game.hp = 1;
  VL.faint(game, 'crab');
  app.update(VL.noActions(), STEP);
  for (let i = 0; i < 60; i += 1) app.update(VL.noActions(), STEP);
  app.update(VL.actions({ pressed: ['interact'] }), STEP);
  assert.equal(app.sceneId, 'play');
  assert.deepEqual(tileOf(VL, game), placeOf(VL.SAVE_LANTERNS.library));
  assert.ok(game.items.woodSword && !game.items.grapplingRope);
  assert.equal(VL.spotFound(game, 'bookRiverside'), false);
  assert.equal(VL.bossBeaten(game, 'scriptorium'), false);
  assert.equal(game.flags.shockwave, undefined);
  assert.equal(game.hp, game.maxHp);
  assert.equal(game.maxHp, VL.TUNING.startMaxHp);
  assert.equal(backing.getItem(VL.slotKey(0)), written, 'a faint writes nothing');
  // And a second faint goes back to the same save.
  game.inventory.wood = 9;
  VL.faint(game, 'crab');
  VL.respawn(game);
  assert.equal(game.inventory.wood, 0);
});

test('the faint screen\'s words: kid-friendly, back to the last save, fit their box and the font', () => {
  const VL = shared;
  const lines = plain(VL.faintLines({ name: 'Robin', look: VL.DEFAULT_LOOK }));
  assert.deepEqual(lines, ['You wake up at your last save.', 'Anything found since then is', 'waiting to be found again.']);
  for (const line of lines) {
    assert.deepEqual(plain(VL.ART.missingGlyphs(line)), [], line);
    assert.ok(VL.ART.measureText(line) <= 224 - 8, `${line} fits`);
    assert.doesNotMatch(line, /still yours|\{/);
  }
});

// ---------- old saves ----------

test('old save points that are no lantern now wake him at the lantern outside that dungeon, each one', () => {
  const VL = shared;
  const lantern = (id) => placeOf(VL.SAVE_LANTERNS[id]);
  const cases = [
    [{ area: 'scriptorium', screen: '1,0', tx: 3, ty: 2 }, lantern('scriptorium'), 'the Scriptorium statue'],
    [{ area: 'hollowOak', screen: '0,0', tx: 3, ty: 2 }, lantern('woods'), 'the Hollow Oak statue'],
    [{ area: 'lighthouse', screen: '0,0', tx: 3, ty: 2 }, lantern('lighthouse'), 'the Lighthouse statue'],
    [{ area: 'lair', screen: '0,0', tx: 3, ty: 2 }, lantern('lair'), 'the Lair statue'],
    [{ area: 'lair', screen: '0,0', tx: 3, ty: 3 }, lantern('lair'), 'W42\'s step below the Lair statue'],
    ...['scriptorium', 'hollowOak', 'lighthouse', 'lair'].map((id) => [{ ...VL.DUNGEONS[id].entrance }, lantern(Object.keys(VL.SAVE_LANTERNS).find((k) => VL.SAVE_LANTERNS[k].dungeon === id)), `${id}'s doorstep (the boss warp's save)`]),
    [{ area: 'hut', screen: '0,0', tx: 2, ty: 2 }, lantern('hut'), 'the hut lantern'],
    [{ area: 'hut', screen: '0,0', tx: 3, ty: 2 }, lantern('hut'), 'the W2 hut lantern'],
    [{ area: 'hut', screen: '0,0', tx: 6, ty: 5 }, lantern('hut'), 'the shockwave\'s wake'],
    [{ area: 'wreck', screen: '0,0', tx: 7, ty: 3 }, lantern('wreck'), 'the hold\'s lantern'],
    [{ area: 'overworld', screen: '2,1', tx: 8, ty: 7 }, ['overworld', '2,1', 8, 7], 'anywhere else is left as it was'],
  ];
  for (const [old, want, label] of cases) {
    const migrated = VL.migrateSave({ v: 1, name: 'Robin', savePoint: { ...old, facing: 'down' } });
    assert.deepEqual(placeOf(migrated.savePoint), want, label);
  }
  assert.equal(VL.migrateSave({ v: 1, name: 'Robin', savePoint: null }).savePoint, null);
  assert.equal(VL.migrateSave({ v: 1, name: 'Robin' }).savePoint, null);
  const current = { v: 2, name: 'Robin', savePoint: { area: 'lair', screen: '0,0', tx: 3, ty: 3, facing: 'up' } };
  assert.deepEqual(plain(VL.migrateSave(current).savePoint), current.savePoint, 'a save written since (Save & Quit in a room) is never moved');
});

test('every committed fixture loads him onto ground he can stand on', () => {
  const { VL } = loadGame();
  for (const name of fs.readdirSync(path.join(__dirname, 'fixtures')).filter((f) => /^save-.*\.json$/.test(f))) {
    const storage = VL.createStorage(memoryStorage({ [VL.slotKey(0)]: fixtureText(name) }));
    const game = VL.loadSlot(storage, 0);
    if (game.player.area === 'sample') continue;
    const here = { area: game.player.area, screen: game.player.screen, ...VL.heroTile(game) };
    assert.ok(VL.standsFirm(game, here), `${name}: ${placeOf(here)}`);
  }
});

test('the W44 fixture: a Save & Quit save at version 2 wakes him where he quit, field for field', () => {
  const { VL } = loadGame();
  const text = fixtureText('save-v2-W44.json');
  const raw = JSON.parse(text);
  assert.equal(raw.v, 2);
  assert.equal('pendingChest' in raw, false);
  const storage = VL.createStorage(memoryStorage({ [VL.slotKey(0)]: text }));
  const game = VL.loadSlot(storage, 0);
  assert.deepEqual(tileOf(VL, game), placeOf(raw.savePoint));
  assert.equal(game.player.facing, 'left');
  assert.deepEqual(plain(game.lastSave), raw, 'the save he would go back to is the file, unchanged');
});

test('README documents the W44 saving rules', () => {
  const readme = read('README.md');
  for (const word of ['VL.saveGame', 'VL.quitPlace', 'VL.quitRule', 'VL.SAVE_LANTERNS', 'VL.keepThroughFaint', 'save-v2-W44.json', 'lastSave', 'drive.saveAndQuit']) {
    assert.ok(readme.includes(word), `README mentions ${word}`);
  }
  assert.equal(readme.split('VL.earned').length, 2, 'VL.earned is named once, as retired');
});
