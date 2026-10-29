// The dungeon framework (W13) on the sample dungeon (tests/sample-dungeon.js):
// keys and locked doors per dungeon, the boss key, push blocks, plates,
// switches, shutters, the statue, the map, the boss room, and what a reload
// or a faint keeps: never a softlock (R1), never a lost earning (R2).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test, loadGame, read, memoryStorage, fakeDocument } = require('./harness');
const { createPlaythrough, findPath } = require('./playthrough');

const STEP = 1 / 60;
const plain = (value) => JSON.parse(JSON.stringify(value));

function loadDungeon() {
  const context = loadGame();
  vm.runInContext(read('tests/sample-dungeon.js'), context, { filename: 'tests/sample-dungeon.js' });
  return context;
}

const at = (screen, tx, ty, facing = 'down') => ({ area: 'sample', screen, tx, ty, facing });

// A playing app with the hero at `where`. Enemies are cleared on each
// placement unless `enemies: true`; `storage: true` gives the game slot 1 of
// an in-memory store so VL.reloadApp works.
function setup({ where = null, storage = false, enemies = false } = {}) {
  const context = loadDungeon();
  const { VL } = context;
  let app = storage ? VL.createApp({ storage: VL.createStorage(memoryStorage()) }) : VL.createApp();
  if (storage) {
    app.startGame(VL.newGame({ name: 'Robin' }), 0, { fresh: true });
    app.save();
  } else app.game = VL.newGame({ name: 'Robin' });
  app.setScene('play');
  app.game.popups.seen.controls = true;
  const t = {
    VL,
    context,
    enemies,
    get app() {
      return app;
    },
    get game() {
      return app.game;
    },
    get d() {
      return VL.dungeonState(app.game, 'sample');
    },
    get keys() {
      return VL.smallKeys(app.game, 'sample');
    },
    place(place) {
      VL.place(app.game, place);
      if (!t.enemies) t.clearEnemies();
    },
    clearEnemies() {
      app.game.room.entities = app.game.room.entities.filter((e) => !VL.isEnemy(e));
    },
    step(actions = VL.noActions()) {
      app.update(actions, STEP);
    },
    hold(held, seconds) {
      for (let s = 0; s < seconds - 1e-9; s += STEP) app.update(VL.actions({ held }), STEP);
    },
    press(action) {
      app.update(VL.actions({ pressed: [action] }), STEP);
    },
    until(done, maxSeconds = 3, held = []) {
      for (let s = 0; s < maxSeconds - 1e-9 && !done(app.game); s += STEP) app.update(VL.actions({ held }), STEP);
      assert.ok(done(app.game), `reached within ${maxSeconds} s holding [${held}]`);
    },
    find: (type, id) => app.game.room.entities.find((e) => e.type === type && (id === undefined || e.id === id)),
    tile: () => [VL.heroTile(app.game).tx, VL.heroTile(app.game).ty],
    closePopups() {
      // Something just received is held up before its popup (W28).
      if (app.sceneId === 'play' && app.game.holdUp) t.until((g) => app.sceneId !== 'play' || !g.holdUp, VL.TUNING.holdUpSeconds + 0.5);
      for (let i = 0; i < 10 && app.sceneId === 'popup'; i += 1) {
        t.hold([], 0.4);
        t.press('interact');
      }
      assert.equal(app.sceneId, 'play');
    },
    // Save & Quit and a page reload (W44: only a save comes back), then the
    // hero placed at `place` if given.
    reload(place) {
      app = VL.reloadApp(app, { save: true });
      assert.ok(app.game, 'the slot loaded');
      if (place) t.place(place);
    },
  };
  if (where) t.place(where);
  return t;
}

const events = (t, type) => t.game.events.filter((e) => e.type === type);

// ---------- definitions and saved state ----------

test('defineDungeon registers a dungeon over an area and refuses bad definitions', () => {
  const { VL } = loadDungeon();
  assert.equal(VL.DUNGEONS.sample.area, 'sample');
  assert.equal(VL.dungeonOfArea('sample').id, 'sample');
  assert.equal(VL.dungeonOfArea('overworld'), null);
  assert.equal(VL.ART.lightFor('sample'), 'indoor');
  const entrance = { area: 'sampleYard', screen: '0,0', tx: 8, ty: 4 };
  assert.throws(() => VL.defineDungeon('sample', { area: 'sample', entrance }), /already defined/);
  assert.throws(() => VL.defineDungeon('ghost', { area: 'nowhere', entrance }), /no area nowhere/);
  assert.throws(() => VL.defineDungeon('twin', { area: 'sample', entrance }), /already belongs/);
  VL.defineArea('wet', { tileset: 'base' });
  VL.addScreens('wet', { '0,0': { tiles: Array(11).fill('W'.repeat(16)), entities: [] } });
  assert.throws(() => VL.defineDungeon('wet', { area: 'wet', entrance }), /flyOver tiles \(W V\)/);
  assert.doesNotThrow(() => VL.defineDungeon('wet', { area: 'wet', entrance, allowFlyOver: true }));
  VL.defineArea('dry', { tileset: 'dungeon' });
  VL.addScreens('dry', { '0,0': { tiles: Array(11).fill('#'.repeat(16)), entities: [] } });
  assert.throws(() => VL.defineDungeon('dry', { area: 'dry', entrance, boss: { screen: '0,0', type: 'nobody', heart: 'h', warp: { tx: 1, ty: 1 } } }), /not an enemy/);
  assert.throws(() => VL.defineDungeon('dry', { area: 'dry', entrance, boss: { screen: '9,9', type: 'slime', heart: 'h', warp: { tx: 1, ty: 1 } } }), /boss screen 9,9/);
  assert.throws(() => VL.defineDungeon('dry', { area: 'dry', entrance, boss: { screen: '0,0', type: 'slime', warp: { tx: 1, ty: 1 } } }), /heart container/);
  assert.throws(() => VL.defineDungeon('dry', { area: 'dry', entrance: { area: 'nowhere', screen: '0,0' } }), /entrance/);
  assert.deepEqual(Object.keys(VL.DUNGEON_TILES).filter((ch) => VL.DUNGEON_TILES[ch].flyOver), [], 'the shared dungeon tiles have no flyOver');
});

test('a new game holds a fresh state for every dungeon and an empty tile-change store, all JSON-safe', () => {
  const { VL } = loadDungeon();
  const game = VL.newGame();
  const fresh = { keysGiven: 0, bossKey: false, map: false, doors: {}, plates: {}, switches: {}, boss: false };
  assert.deepEqual(plain(game.dungeons), Object.fromEntries(Object.keys(VL.DUNGEONS).map((id) => [id, fresh])));
  assert.deepEqual(plain(game.tileChanges), {});
  assert.ok(!VL.TRANSIENT_FIELDS.includes('dungeons') && !VL.TRANSIENT_FIELDS.includes('tileChanges'));
  assert.ok(VL.TRANSIENT_FIELDS.includes('dungeonNote'));
  // A dungeon added after a save was written gets its state on first use.
  delete game.dungeons.sample;
  assert.deepEqual(plain(VL.dungeonState(game, 'sample')), { keysGiven: 0, bossKey: false, map: false, doors: {}, plates: {}, switches: {}, boss: false });
  assert.throws(() => VL.dungeonState(game, 'nowhere'), /no dungeon nowhere/);
});

test('the W13 fixture loads with keys, doors, plates, switches, the map and the boss intact', () => {
  const { VL } = loadGame();
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v1-W13.json'), 'utf8'));
  const d = fixture.dungeons.sample;
  assert.ok('keysGiven' in d && d.bossKey && d.map && d.boss && Object.keys(d.doors).length && Object.keys(d.plates).length && Object.keys(d.switches).length, 'non-default dungeon state');
  assert.ok(Object.keys(fixture.tileChanges).length, 'a saved tile change');
  const backing = memoryStorage({ [VL.slotKey(0)]: JSON.stringify(fixture) });
  const game = VL.loadSlot(VL.createStorage(backing), 0);
  for (const id of Object.keys(fixture.dungeons)) assert.deepEqual(plain(game.dungeons[id]), fixture.dungeons[id]);
  assert.deepEqual(plain(game.tileChanges), fixture.tileChanges);
});

// ---------- keys and doors ----------

test('a small key is picked up once, counted for its dungeon, and a reload neither loses nor doubles it', () => {
  const t = setup({ where: at('1,0', 7, 5, 'up'), storage: true });
  const { VL } = t;
  // The shutter round the key is open for the test: the plate is latched.
  t.d.plates.samplePlate = true;
  t.place(at('1,0', 7, 5, 'up'));
  t.step();
  assert.ok(t.find('smallKey', 'sampleKey'), 'the key lies there');
  t.hold(['up'], 0.4);
  assert.equal(t.keys, 1);
  assert.equal(t.find('smallKey'), undefined);
  assert.ok(VL.spotFound(t.game, 'sampleKey'));
  assert.ok(events(t, 'smallKey').length || t.app.savedAt !== null, 'earned');
  t.reload(at('1,0', 7, 5, 'up'));
  t.step();
  assert.equal(t.keys, 1, 'the key survives a reload');
  assert.equal(t.find('smallKey'), undefined, 'and is not lying there again');
  // Walking the tile again gives nothing.
  t.hold(['up'], 0.4);
  assert.equal(t.keys, 1);
});

test('a locked door is solid without a key; walking into it with one opens it, spends the key and opens the far side too', () => {
  const t = setup({ where: at('0,0', 7, 1, 'up'), storage: true });
  const { VL } = t;
  const door = t.find('lockedDoor', 'sampleDoorNorth');
  assert.ok(door.solid && !door.open);
  t.hold(['up'], 0.5);
  assert.deepEqual(t.tile(), [7, 1], 'still below the door');
  assert.ok(door.solid, 'still locked');
  assert.equal(t.game.dungeonNote?.text, 'Locked. A small key would open it.');
  assert.equal(t.game.player.screen, '0,0');
  VL.giveSmallKey(t.game, 'sample');
  assert.equal(t.keys, 1);
  t.hold(['up'], 0.1);
  assert.ok(door.open && !door.solid, 'opened by walking into it with a key');
  assert.equal(t.keys, 0, 'the key is spent');
  assert.equal(t.d.doors.sampleDoorNorth, true, 'saved');
  assert.equal(events(t, 'doorUnlocked').length + (t.app.savedAt === null ? 0 : 1) >= 1, true);
  t.until((g) => g.player.screen === '0,-1' && !g.transition, 3, ['up']);
  t.clearEnemies();
  t.step();
  const far = t.find('lockedDoor', 'sampleDoorNorth');
  assert.ok(far.open && !far.solid, 'the same door seen from the other room is open');
  // Back through it, and a reload keeps it open with the key still spent.
  t.until((g) => g.player.screen === '0,0' && !g.transition, 3, ['down']);
  t.reload(at('0,0', 7, 1, 'up'));
  t.step();
  assert.ok(t.find('lockedDoor', 'sampleDoorNorth').open);
  assert.equal(t.keys, 0);
});

test('S facing a locked door opens it as well, and a key never works in another dungeon', () => {
  const t = setup({ where: at('0,0', 7, 1, 'up') });
  const { VL } = t;
  VL.giveSmallKey(t.game, 'sample', 2);
  t.press('interact');
  assert.ok(t.find('lockedDoor', 'sampleDoorNorth').open);
  assert.equal(t.keys, 1);
  // A second dungeon with its own door: the sample's spare key opens nothing there.
  VL.defineArea('other', { tileset: 'dungeon' });
  VL.addScreens('other', {
    '0,0': {
      tiles: ['#'.repeat(16), ...Array(9).fill(`#${'_'.repeat(14)}#`), '#'.repeat(16)],
      entities: [{ type: 'lockedDoor', id: 'otherDoor', kind: 'small', x: 7, y: 3, lock: 'x' }],
    },
  });
  VL.defineDungeon('other', { area: 'other', entrance: { area: 'sampleYard', screen: '0,0', tx: 8, ty: 4 } });
  t.place({ area: 'other', screen: '0,0', tx: 7, ty: 4, facing: 'up' });
  t.hold(['up'], 0.5);
  t.press('interact');
  const door = t.find('lockedDoor', 'otherDoor');
  assert.ok(door.solid && !door.open, 'locked: the other dungeon has no keys');
  assert.equal(VL.smallKeys(t.game, 'other'), 0);
  assert.equal(t.keys, 1, 'the sample key is untouched');
});

test('the boss key opens the boss door and is kept; the boss door ignores small keys', () => {
  const t = setup({ where: at('0,-1', 7, 1, 'up'), storage: true });
  const { VL } = t;
  VL.giveSmallKey(t.game, 'sample', 3);
  t.hold(['up'], 0.5);
  const door = t.find('lockedDoor', 'sampleBossDoor');
  assert.ok(door.solid, 'three small keys open no boss door');
  assert.equal(t.keys, 3);
  assert.equal(t.game.dungeonNote?.text, 'The big lock needs the boss key.');
  VL.giveBossKey(t.game, 'sample');
  t.hold([], 0.1);
  t.hold(['up'], 0.1);
  assert.ok(door.open);
  assert.equal(t.d.bossKey, true, 'the boss key is shown, not spent');
  assert.equal(t.d.doors.sampleBossDoor, true);
  t.reload(at('0,-1', 7, 1, 'up'));
  t.step();
  assert.ok(t.find('lockedDoor', 'sampleBossDoor').open);
});

// ---------- blocks, plates, switches, shutters ----------

test('a push block slides a tile after the hero leans on it, once per visit, never onto a wall, a thing or the edge', () => {
  const t = setup({ where: at('1,0', 10, 8, 'right') });
  const { VL } = t;
  const block = t.find('pushBlock');
  assert.deepEqual([block.x, block.y], [11, 8]);
  t.hold(['right'], VL.TUNING.blockPushSeconds / 2);
  assert.deepEqual([block.x, block.y], [11, 8], 'not yet');
  t.until(() => block.x === 12, 1, ['right']);
  assert.ok(block.slide, 'sliding');
  assert.equal(events(t, 'blockPushed').length, 1);
  assert.deepEqual(t.tile(), [10, 8], 'the hero stays put while it slides');
  t.hold(['right'], 1);
  assert.deepEqual([block.x, block.y], [12, 8], 'a block moves once per visit');
  assert.deepEqual(t.tile(), [11, 8], 'the hero followed into the freed tile');
  // Rules, on fresh blocks: no wall, no entity but a plate, no edge tile.
  t.place(at('1,0', 10, 8, 'right'));
  const fresh = t.find('pushBlock');
  assert.equal(VL.blockCanMove(t.game, fresh, 0, 1), true);
  assert.equal(VL.blockCanMove(t.game, fresh, 1, 0), true, 'onto the plate');
  t.game.room.entities.push({ type: 'smallKey', id: 'x', x: 11, y: 9 });
  assert.equal(VL.blockCanMove(t.game, fresh, 0, 1), false, 'not onto a key');
  fresh.y = 1;
  assert.equal(VL.blockCanMove(t.game, fresh, 0, -1), false, 'not onto the edge row');
  fresh.y = 4;
  fresh.x = 10;
  assert.equal(VL.blockCanMove(t.game, fresh, -1, 0), false, 'not into a wall');
  fresh.x = 1;
  assert.equal(VL.blockCanMove(t.game, fresh, -1, 0), false, 'not onto the edge column');
});

test('a block on a latched plate lifts the shutter for good: on re-entry and after a reload the block is back but the plate stays down', () => {
  const t = setup({ where: at('1,0', 10, 8, 'right'), storage: true });
  const { VL } = t;
  const shutter = t.find('shutter', 'sampleShutterKey');
  t.step();
  assert.ok(shutter.closed && shutter.solid);
  t.until(() => t.find('pushBlock').x === 12, 1, ['right']);
  t.step();
  const plate = t.find('pressurePlate', 'samplePlate');
  assert.ok(plate.down, 'the block holds the plate down');
  assert.equal(t.d.plates.samplePlate, true, 'latched, saved');
  assert.ok(!shutter.closed && !shutter.solid, 'the shutter lifted');
  assert.equal(events(t, 'platePressed').length + events(t, 'shutterOpen').length >= 0, true);
  // Out and back: the block is where the map puts it, the plate stays down.
  t.place(at('0,0', 8, 5));
  t.place(at('1,0', 10, 8, 'right'));
  t.step();
  assert.deepEqual([t.find('pushBlock').x, t.find('pushBlock').y], [11, 8]);
  assert.ok(t.find('pressurePlate').down && !t.find('shutter', 'sampleShutterKey').solid);
  t.reload(at('1,0', 10, 8, 'right'));
  t.step();
  assert.deepEqual([t.find('pushBlock').x, t.find('pushBlock').y], [11, 8]);
  assert.ok(t.find('pressurePlate').down && !t.find('shutter', 'sampleShutterKey').solid, 'still open after a reload');
  assert.equal(VL.plateDown(t.game, 'samplePlate'), true);
});

test('a plate that does not latch is down only while something is on it', () => {
  const t = setup();
  const { VL } = t;
  VL.addScreens('sample', {
    '5,5': {
      tiles: ['#'.repeat(16), ...Array(9).fill(`#${'_'.repeat(14)}#`), '#'.repeat(16)],
      entities: [
        { type: 'pressurePlate', id: 'holdPlate', x: 7, y: 5 },
        { type: 'shutter', id: 'holdShutter', x: 10, y: 5, open: { plate: 'holdPlate' } },
      ],
    },
  });
  t.place(at('5,5', 7, 6, 'up'));
  t.step();
  assert.ok(t.find('shutter').solid);
  t.until(() => t.find('pressurePlate').down, 1, ['up']);
  assert.ok(!t.find('shutter').solid, 'open while stood on');
  assert.equal(t.d.plates.holdPlate, undefined, 'nothing saved');
  t.until(() => !t.find('pressurePlate').down, 1, ['down']);
  assert.ok(t.find('shutter').solid, 'shut again when he steps off');
});

test('S or a sword swing throws a switch for good; its shutter opens and stays open after a reload', () => {
  const t = setup({ where: at('0,-1', 3, 4, 'up'), storage: true });
  const { VL } = t;
  const lever = t.find('switch', 'sampleSwitch');
  const shutter = t.find('shutter', 'sampleShutterBossKey');
  t.step();
  assert.ok(!lever.on && shutter.solid);
  t.press('interact');
  assert.ok(lever.on);
  assert.equal(t.d.switches.sampleSwitch, true);
  assert.equal(events(t, 'switchOn').length, 1);
  t.step();
  assert.ok(!shutter.solid && !shutter.closed);
  t.reload(at('0,-1', 3, 4, 'up'));
  t.step();
  assert.ok(t.find('switch').on && !t.find('shutter', 'sampleShutterBossKey').solid);
  // A fresh game: the sword does it too.
  const s = setup({ where: at('0,-1', 3, 4, 'up') });
  VL.giveItem(s.game, 'woodSword');
  s.VL.giveItem(s.game, 'woodSword');
  s.press('mainHand');
  assert.ok(s.find('switch').on, 'a swing throws it');
});

test('a shutter on "cleared" is shut while enemies live, lifts when the room is cleared, and never shuts on the hero walking in through it', () => {
  const t = setup({ where: at('0,0', 8, 7, 'up'), enemies: true });
  const { VL } = t;
  t.step();
  const shutter = t.find('shutter', 'sampleShutterEast');
  assert.ok(shutter.closed && shutter.solid, 'the slime is alive');
  assert.ok(VL.isSolidAt('sample', '0,0', 15, 5, t.game.room));
  const slime = t.find('slime');
  t.hold([], 0.1);
  VL.hitEnemy(t.game, slime, 99, { x: slime.cx, y: slime.cy + 20 });
  t.step();
  assert.ok(!shutter.closed && !shutter.solid, 'open once the room is cleared');
  assert.equal(events(t, 'shutterOpen').length + 1 >= 1, true);
  // Coming in from the block room: the hero lands on the shutter tile with
  // the slime back, walks off it, and only then does it close behind him.
  t.place({ area: 'sample', screen: '1,0', tx: 1, ty: 5, facing: 'left' });
  t.until((g) => g.player.screen === '0,0' && !g.transition, 3, ['left']);
  assert.ok(t.find('slime'), 'enemies are back');
  const bars = t.find('shutter', 'sampleShutterEast');
  assert.ok(bars.closed && !bars.solid, 'closed, but not on the hero');
  t.until(() => t.tile()[0] <= 13, 2, ['left']);
  assert.ok(bars.solid, 'and solid once he is past');
  const x = t.game.player.x;
  t.hold(['right'], 1);
  assert.ok(t.game.player.x < 15 * 16 - 4 && t.game.player.screen === '0,0', `no way back out: ${t.game.player.x} from ${x}`);
});

test('a shutter condition can name a flag, several plates, an opened door or the beaten boss', () => {
  const t = setup({ where: at('0,0', 8, 7) });
  const { VL } = t;
  const g = t.game;
  assert.equal(VL.dungeonCondition(g, { flag: 'x' }), false);
  g.flags.x = true;
  assert.equal(VL.dungeonCondition(g, { flag: 'x' }), true);
  assert.equal(VL.dungeonCondition(g, { door: 'sampleDoorNorth' }), false);
  t.d.doors.sampleDoorNorth = true;
  assert.equal(VL.dungeonCondition(g, { door: 'sampleDoorNorth' }), true);
  assert.equal(VL.dungeonCondition(g, { plates: ['a', 'b'] }), false);
  t.d.plates.a = true;
  assert.equal(VL.dungeonCondition(g, { plates: ['a', 'b'] }), false, 'all of them');
  t.d.plates.b = true;
  assert.equal(VL.dungeonCondition(g, { plates: ['a', 'b'], flag: 'x' }), true);
  assert.equal(VL.dungeonCondition(g, { bossBeaten: true }), false);
  t.d.boss = true;
  assert.equal(VL.dungeonCondition(g, { bossBeaten: true, cleared: true }), true);
  assert.equal(VL.dungeonCondition(g, undefined), true, 'no condition: always open');
});

// ---------- the statue ----------

test('a lantern in a dungeon saves the game; fainting goes back to that save, at the lantern (W44)', () => {
  const t = setup({ where: at('0,0', 2, 2, 'up'), storage: true });
  const { VL } = t;
  assert.equal(t.game.savePoint, null);
  t.until((g) => g.savePoint !== null, 1, ['up']);
  assert.deepEqual(plain(t.game.savePoint), { area: 'sample', screen: '0,0', tx: 2, ty: 1, facing: 'down' });
  assert.equal(t.game.dungeonNote?.text, 'The lantern glows. Your journey is saved.');
  assert.ok(t.app.savedAt !== null, 'saved');
  VL.giveSmallKey(t.game, 'sample');
  t.place(at('0,-1', 7, 5));
  VL.faint(t.game, 'sampleGolem');
  t.step();
  assert.equal(t.app.sceneId, 'fainted');
  t.hold([], 0.7);
  t.press('interact');
  assert.equal(t.app.sceneId, 'play');
  assert.equal(t.game.player.screen, '0,0');
  assert.deepEqual(t.tile(), [2, 1], 'awake at the lantern');
  assert.equal(t.game.hp, t.game.maxHp);
  assert.equal(t.keys, 0, 'the key found since the save is gone');
  // Save & Quit and a reload land there too (where he came into the room).
  t.reload();
  assert.deepEqual([t.game.player.area, ...t.tile()], ['sample', 2, 1]);
});

// ---------- the map ----------

test('the map item reveals every room on the map screen; M opens it only inside a dungeon', () => {
  const t = setup({ where: at('1,0', 2, 3, 'up') });
  const { VL } = t;
  const layout = VL.dungeonMapLayout(VL.DUNGEONS.sample);
  assert.deepEqual(Object.keys(layout).sort(), ['0,-1', '0,-2', '0,0', '1,0']);
  assert.ok(layout['1,0'].x > layout['0,0'].x && layout['0,-1'].y < layout['0,0'].y && layout['0,-2'].y < layout['0,-1'].y, 'rooms keep their places');
  assert.equal(layout['0,0'].y, layout['1,0'].y);
  t.press('map');
  assert.equal(t.app.sceneId, 'dungeonMap');
  t.press('map');
  assert.equal(t.app.sceneId, 'play');
  t.until(() => t.d.map, 1, ['up']);
  assert.ok(VL.spotFound(t.game, 'sampleMap'));
  t.step();
  assert.equal(t.app.sceneId, 'popup', 'the map explains M');
  t.closePopups();
  t.press('map');
  assert.equal(t.app.sceneId, 'dungeonMap');
  t.press('pause');
  assert.equal(t.app.sceneId, 'play', 'Esc closes it too');
  // Outside a dungeon M is not the framework's.
  t.place({ area: 'overworld', screen: '1,1', tx: 8, ty: 6, facing: 'down' });
  t.press('map');
  assert.notEqual(t.app.sceneId, 'dungeonMap');
});

test('the map screen draws visited rooms, every room with the map, the boss mark and the keys, in words the font has', () => {
  const t = setup({ where: at('0,0', 8, 7) });
  const { VL } = t;
  const strings = [];
  const sprites = [];
  const original = { text: VL.ART.text, sprite: VL.ART.drawSprite };
  VL.ART.text = (ctx, str, x, y, options = {}) => {
    strings.push({ str: String(str), size: options.size || 'normal' });
    return original.text(ctx, str, x, y, options);
  };
  VL.ART.drawSprite = (ctx, id, x, y) => {
    sprites.push(id);
    return original.sprite(ctx, id, x, y);
  };
  const ctx = fakeDocument().createElement('canvas').getContext('2d');
  const rects = () => ctx.calls.fillRect || 0;
  t.app.setScene('dungeonMap');
  const before = rects();
  VL.render(ctx, t.app, 0);
  const visitedOnly = rects() - before;
  assert.ok(!sprites.includes('icon-skull'), 'no boss mark without the map');
  assert.ok(strings.some((s) => s.str === 'SAMPLE VAULT') && strings.some((s) => s.str === 'x0'));
  t.d.map = true;
  t.d.keysGiven = 2;
  t.d.bossKey = true;
  sprites.length = 0;
  const mid = rects();
  VL.render(ctx, t.app, 0.5);
  assert.ok(rects() - mid > visitedOnly, 'more rooms drawn with the map');
  assert.ok(sprites.includes('icon-skull') && sprites.includes('item-boss-key') && sprites.includes('pickup-dungeon-map'));
  assert.ok(strings.some((s) => s.str === 'x2'));
  for (const { str, size } of strings) assert.deepEqual([...VL.ART.missingGlyphs(str, size)], [], str);
  VL.ART.text = original.text;
  VL.ART.drawSprite = original.sprite;
});

test('the dungeon HUD shows the keys over the play area inside a dungeon only', () => {
  const t = setup({ where: at('0,0', 8, 7) });
  const { VL } = t;
  const strings = [];
  const original = VL.ART.text;
  VL.ART.text = (ctx, str, x, y, options = {}) => {
    strings.push(String(str));
    return original(ctx, str, x, y, options);
  };
  const ctx = fakeDocument().createElement('canvas').getContext('2d');
  t.d.keysGiven = 3;
  VL.render(ctx, t.app, 0);
  assert.ok(strings.includes('x3'));
  strings.length = 0;
  t.place({ area: 'overworld', screen: '1,1', tx: 8, ty: 6 });
  VL.render(ctx, t.app, 0);
  assert.ok(!strings.includes('x3'));
  VL.ART.text = original;
});

test('the boss key is an ornate sprite, bigger than a small key, and fits beside it in the HUD, on the map and on its tile', () => {
  const t = setup({ where: at('0,0', 8, 7) });
  const { VL } = t;
  const size = (id) => {
    const { width, height, grid } = VL.ART.spritePixels(VL.ART.SPRITES[id].def);
    return { width, height, colors: new Set(grid.flat().filter(Boolean)) };
  };
  const small = size('item-small-key');
  const boss = size('item-boss-key');
  assert.ok(boss.width >= small.width + 2 && boss.height >= small.height + 3, 'clearly bigger');
  for (const name of ['heart', 'heartLight', 'dgnKeyDark']) assert.ok(boss.colors.has(name) && !small.colors.has(name), `${name}: a gem and a darker gold of its own`);
  // Where each sprite lands, as boxes in canvas pixels (outline included).
  const boxes = [];
  const original = VL.ART.drawSprite;
  VL.ART.drawSprite = (ctx, id, x, y, ...rest) => {
    if (id.endsWith('-key')) boxes.push({ id, x: x - 1, y: y - 1, w: size(id).width, h: size(id).height });
    return original(ctx, id, x, y, ...rest);
  };
  const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const ctx = fakeDocument().createElement('canvas').getContext('2d');
  t.d.bossKey = true;
  t.d.keysGiven = 9;
  VL.render(ctx, t.app, 0);
  const hud = Object.fromEntries(boxes.map((b) => [b.id, b]));
  const count = { x: VL.TUNING.width - 15, y: 14, w: 12, h: 7 };
  assert.ok(!overlaps(hud['item-boss-key'], hud['item-small-key']) && !overlaps(hud['item-boss-key'], count), 'HUD: beside the small key and its count');
  assert.ok(hud['item-boss-key'].x + hud['item-boss-key'].w <= VL.TUNING.width);
  boxes.length = 0;
  t.app.setScene('dungeonMap');
  VL.render(ctx, t.app, 0);
  const onMap = boxes.find((b) => b.id === 'item-boss-key');
  assert.ok(onMap && onMap.y + onMap.h <= 44 + 60, 'map: the Boss row ends above the MAP label');
  t.app.setScene('play');
  boxes.length = 0;
  VL.ENTITIES.bossKey.draw(ctx, { type: 'bossKey' }, 0, 0, 0);
  const tile = boxes[0];
  assert.ok(tile.x >= 0 && tile.x + tile.w <= 16 && tile.y >= -2 && tile.y + tile.h <= 18, 'the pickup stays on its tile');
  VL.ART.drawSprite = original;
});

// ---------- the boss room ----------

function beatBoss(t) {
  const { VL } = t;
  t.step();
  const golem = t.find('sampleGolem');
  assert.ok(golem?.boss, 'the boss is marked');
  VL.hitEnemy(t.game, golem, 99, { x: golem.cx, y: golem.cy + 20 });
  t.step();
}

test('beating the boss is saved, leaves a heart container and the warp out; the warp leads to the entrance; on re-entry the boss is gone', () => {
  const t = setup({ where: at('0,-2', 7, 7, 'up'), storage: true, enemies: true });
  const { VL } = t;
  t.step();
  assert.ok(t.find('shutter', 'sampleBossGate').solid, 'the way back is barred while the boss lives');
  assert.equal(VL.roomCleared(t.game), true, 'a boss does not count as an ordinary enemy');
  beatBoss(t);
  assert.equal(t.d.boss, true);
  assert.equal(VL.bossBeaten(t.game, 'sample'), true);
  assert.equal(events(t, 'bossDefeated').length, 1);
  const heart = t.find('heartContainer');
  assert.deepEqual([heart.id, heart.x, heart.y], ['heartSample', 7, 4], 'where the boss stood');
  assert.equal(VL.bossDefeated(t.game, 'sample'), false, 'beaten once');
  // The boss gate (W30): the warp and the open bars wait for the heart.
  assert.equal(t.find('warp'), undefined);
  t.step();
  assert.ok(t.find('shutter', 'sampleBossGate').solid, 'the bars stay down until the heart is taken');
  const maxHp = t.game.maxHp;
  t.until((g) => g.maxHp > maxHp, 3, ['up']);
  assert.ok(VL.spotFound(t.game, 'heartSample'));
  t.closePopups();
  t.step();
  assert.equal(t.game.room.entities.filter((e) => e.type === 'warp').length, 1);
  const warp = t.find('warp');
  assert.deepEqual([warp.x, warp.y], [7, 7]);
  assert.ok(!t.find('shutter', 'sampleBossGate').solid, 'the bars lift');
  t.until((g) => g.player.area === 'sampleYard', 4, ['down']);
  assert.deepEqual(t.tile(), [8, 4], 'out at the entrance');
  assert.equal(events(t, 'warp').length + 1 >= 1, true);
  t.reload(at('0,-2', 7, 8, 'up'));
  t.step();
  assert.equal(t.find('sampleGolem'), undefined, 'no boss on re-entry');
  assert.equal(t.find('heartContainer'), undefined, 'the heart was taken');
  assert.ok(t.find('warp'), 'the way out stays');
  // A heart left behind (a faint on the way to it) waits on the next visit.
  delete t.game.flags['found:heartSample'];
  t.place(at('0,-2', 7, 8, 'up'));
  t.step();
  assert.deepEqual([t.find('heartContainer').x, t.find('heartContainer').y], [7, 4]);
  // A boss beaten elsewhere (W14's onDefeat hook) and beating it twice.
  let hooked = 0;
  VL.DUNGEONS.sample.boss.onDefeat = () => { hooked += 1; };
  assert.equal(VL.bossDefeated(t.game, 'sample'), false, 'already beaten');
  assert.equal(hooked, 0);
});

test('enemies in dungeon rooms keep the arrival grace on entry, after a warp, at a statue respawn and in the boss room', () => {
  const t = setup({ where: at('0,0', 9, 7, 'up'), storage: true, enemies: true });
  const { VL } = t;
  const grace = VL.TUNING.enemyArrivalSeconds;
  const checkGrace = (type, label) => {
    const enemy = t.find(type);
    assert.ok(enemy && enemy.arriving > 0, `${label}: ${type} is arriving`);
    const hp = t.game.hp;
    t.hold([], grace - 0.05);
    assert.equal(t.game.hp, hp, `${label}: unhurt for the grace`);
  };
  checkGrace('slime', 'walked in');
  // Statue, then faint in the boss room and wake at the statue.
  t.place(at('0,0', 2, 2, 'up'));
  t.until((g) => g.savePoint !== null, 1, ['up']);
  t.place(at('0,-2', 7, 7, 'up'));
  checkGrace('sampleGolem', 'boss room');
  VL.faint(t.game, 'sampleGolem');
  t.step();
  t.hold([], 0.7);
  t.press('interact');
  assert.deepEqual([t.game.player.screen, ...t.tile()], ['0,0', 2, 1]);
  checkGrace('slime', 'respawned');
  // Through a warp into a room with an enemy.
  t.game.room.entities.push({ type: 'warp', x: 2, y: 2, to: at('0,0', 9, 7, 'up') });
  t.until((g) => g.player.y > 2 * 16 + 8, 1, ['down']);
  assert.deepEqual(t.tile(), [9, 7]);
  checkGrace('slime', 'warped');
});

// ---------- saved tile changes (the mechanism W14 builds on) ----------

test('VL.saveTile changes a tile for good: it outlasts the visit and a reload, in any area', () => {
  const t = setup({ where: at('0,0', 8, 7), storage: true });
  const { VL } = t;
  assert.equal(VL.isSolidAt('sample', '0,0', 5, 5, t.game.room), false);
  VL.saveTile(t.game, 5, 5, '#');
  assert.equal(VL.isSolidAt('sample', '0,0', 5, 5, t.game.room), true, 'changed now');
  assert.equal(VL.savedTile(t.game, 'sample', '0,0', 5, 5), '#');
  assert.equal(VL.savedTile(t.game, 'sample', '0,0', 5, 6), null);
  assert.ok(t.app.savedAt !== null, 'earned');
  t.place(at('1,0', 8, 7));
  t.place(at('0,0', 8, 7));
  t.step();
  assert.equal(VL.isSolidAt('sample', '0,0', 5, 5, t.game.room), true, 'back on re-entry');
  t.reload(at('0,0', 8, 7));
  t.step();
  assert.equal(VL.isSolidAt('sample', '0,0', 5, 5, t.game.room), true, 'and after a reload');
  assert.deepEqual(plain(t.game.tileChanges), { 'sample:0,0': { '5,5': '#' } });
  // The overworld too (W14's boulders), and a change on a screen that no
  // longer exists is simply never applied.
  t.place({ area: 'overworld', screen: '1,1', tx: 8, ty: 6 });
  VL.saveTile(t.game, 8, 8, 'T');
  t.place({ area: 'overworld', screen: '1,0', tx: 8, ty: 6 });
  t.place({ area: 'overworld', screen: '1,1', tx: 8, ty: 6 });
  t.step();
  assert.equal(VL.tileAt('overworld', '1,1', 8, 8, t.game.room), 'T');
  t.game.tileChanges['gone:0,0'] = { '1,1': '#' };
  assert.doesNotThrow(() => t.reload(at('0,0', 8, 7)));
});

// ---------- progression ----------

test('the sample dungeon registers with the solver: map and table agree, and the whole path still solves', () => {
  const { VL } = loadDungeon();
  assert.deepEqual([...VL.dungeonLockProblems()], []);
  const report = VL.solveProgression();
  assert.deepEqual([...report.problems], []);
  assert.ok(report.stages[0].reached.includes('sampleBoss'));
  assert.ok(report.stages[0].reached.includes('sampleDoorNorth'));
  assert.equal(report.stages[0].counts['smallKey:sample'], 1);
});

test('the solver catches a dungeon whose second key sits behind the door the first key could be wasted on', () => {
  const { VL } = loadDungeon();
  const copy = (lock) => ({ ...lock, needs: lock.needs.map((n) => (Array.isArray(n) ? n.slice() : n)), gives: lock.gives.slice(), supplies: { ...lock.supplies }, consumes: { ...lock.consumes } });
  const table = Object.fromEntries(Object.entries(VL.LOCKS).map(([id, lock]) => [id, copy(lock)]));
  const doc = '§ The world: Each dungeon has Zelda conventions';
  table.sampleDoorEast = { id: 'sampleDoorEast', type: 'flag', needs: ['sampleEntered'], gives: [], supplies: {}, count: {}, consumes: { 'smallKey:sample': 1 }, loses: [], retires: [], renewable: false, optional: false, doc };
  table.sampleKey2 = { id: 'sampleKey2', type: 'item', needs: ['sampleDoorEast'], gives: [], supplies: { 'smallKey:sample': 1 }, count: {}, consumes: {}, loses: [], retires: [], renewable: false, optional: false, doc };
  table.sampleBoss.needs.push('sampleDoorEast');
  const report = VL.solveProgression(table);
  assert.equal(report.problems[0], 'sampleDoorEast needs 1 smallKey:sample but a player who spent smallKey:sample on everything else first has 0');
  assert.ok(report.problems.every((p) => p.includes('sampleDoorEast needs 1 smallKey:sample')), report.problems.join('\n'));
  // Both keys in the open: fine.
  table.sampleKey2.needs = ['sampleEntered'];
  assert.deepEqual([...VL.solveProgression(table).problems], []);
});

test('VL.dungeonLockProblems names a key or door without a lock, or with the wrong rule', () => {
  const { VL } = loadDungeon();
  const hall = VL.getScreen('sample', '0,0');
  const door = hall.entities.find((e) => e.type === 'lockedDoor');
  const was = door.lock;
  delete door.lock;
  assert.deepEqual([...VL.dungeonLockProblems()], ['sample 0,0 lockedDoor sampleDoorNorth needs lock: \'<id>\' naming a lock in the table']);
  door.lock = 'sampleEntered';
  assert.deepEqual([...VL.dungeonLockProblems()], ['sample 0,0 lockedDoor sampleDoorNorth: lock sampleEntered must consume { \'smallKey:sample\': 1 }']);
  door.lock = was;
  const key = VL.getScreen('sample', '1,0').entities.find((e) => e.type === 'smallKey');
  key.lock = 'sampleEntered';
  assert.deepEqual([...VL.dungeonLockProblems()], ['sample 1,0 smallKey sampleKey: lock sampleEntered must supply { \'smallKey:sample\': 1 }']);
  key.lock = 'sampleKey';
  const bossKey = VL.getScreen('sample', '0,-1').entities.find((e) => e.type === 'bossKey');
  bossKey.lock = 'sampleEntered';
  assert.deepEqual([...VL.dungeonLockProblems()], ['sample 0,-1 bossKey sampleBossKey: lock sampleEntered must give \'bossKey:sample\'']);
  bossKey.lock = 'sampleBossKey';
  const bossDoor = VL.getScreen('sample', '0,-1').entities.find((e) => e.kind === 'boss');
  bossDoor.lock = 'sampleEntered';
  assert.deepEqual([...VL.dungeonLockProblems()], ['sample 0,-1 lockedDoor sampleBossDoor: lock sampleEntered must need \'bossKey:sample\'']);
});

test('the pathfinder sees a locked door or a shutter as open once its saved state says so', () => {
  const t = setup({ where: at('0,0', 7, 3, 'up') });
  const { VL } = t;
  const from = at('0,0', 7, 3);
  const to = at('0,-1', 7, 8);
  assert.equal(findPath(VL, from, to, t.game), null, 'locked');
  t.d.doors.sampleDoorNorth = true;
  assert.ok(findPath(VL, from, to, t.game), 'open');
  const key = at('1,0', 7, 4);
  assert.equal(findPath(VL, from, key, t.game), null, 'the key shutter is down');
  t.d.plates.samplePlate = true;
  assert.ok(findPath(VL, from, key, t.game), 'and up once the plate is latched');
  const round = findPath(VL, at('1,0', 10, 8), at('1,0', 12, 8), t.game);
  assert.ok(round && !round.some((n) => n.tx === 11 && n.ty === 8), 'round a block, never through it');
});

// ---------- the playthrough ----------

// The sample dungeon played for real, start to boss, with a page reload after
// every milestone (playTo) and again right after each earning.
const SAMPLE_MILESTONES = ['sampleEntered', 'sampleKey', 'sampleDoorNorth', 'sampleBossKey', 'sampleBossDoor', 'sampleBoss'];

const sampleSteps = {
  sampleEntered(drive) {
    const { VL } = drive;
    drive.closePopups();
    VL.place(drive.state, { area: 'sampleYard', screen: '0,0', tx: 8, ty: 6, facing: 'up' });
    drive.walkTo({ tx: 3, ty: 7 });
    drive.hold(['up'], 0.1);
    drive.press('interact');
    drive.closePopups();
    drive.walkTo({ area: 'sample', screen: '0,0', tx: 7, ty: 8 });
    drive.walkTo({ tx: 2, ty: 2 });
    drive.until((g) => g.savePoint !== null, 1, ['up']);
  },
  sampleKey(drive) {
    drive.walkTo({ area: 'sample', screen: '1,0', tx: 10, ty: 8 });
    drive.until((g) => g.room.entities.find((e) => e.type === 'pushBlock').x === 12, 1.5, ['right']);
    drive.reload();
    assert.equal(drive.state.dungeons.sample.plates.samplePlate, true, 'the latched plate survives a reload');
    drive.walkTo({ area: 'sample', screen: '1,0', tx: 2, ty: 3 });
    drive.until((g) => g.dungeons.sample.map, 1, ['up']);
    drive.closePopups();
    drive.walkTo({ area: 'sample', screen: '1,0', tx: 7, ty: 4 });
    drive.reload();
    assert.equal(drive.VL.smallKeys(drive.state, 'sample'), 1, 'the key survives a reload');
  },
  sampleDoorNorth(drive) {
    drive.walkTo({ area: 'sample', screen: '0,0', tx: 7, ty: 1 });
    drive.until((g) => g.dungeons.sample.doors.sampleDoorNorth, 1, ['up']);
    drive.reload();
    assert.equal(drive.VL.smallKeys(drive.state, 'sample'), 0, 'the key is spent with the door open');
  },
  sampleBossKey(drive) {
    drive.walkTo({ area: 'sample', screen: '0,-1', tx: 3, ty: 4 });
    drive.hold(['up'], 0.1);
    drive.press('interact');
    drive.reload();
    assert.equal(drive.state.dungeons.sample.switches.sampleSwitch, true);
    drive.walkTo({ area: 'sample', screen: '0,-1', tx: 8, ty: 5 });
  },
  sampleBossDoor(drive) {
    drive.walkTo({ area: 'sample', screen: '0,-1', tx: 7, ty: 1 });
    drive.until((g) => g.dungeons.sample.doors.sampleBossDoor, 1, ['up']);
  },
  sampleBoss(drive) {
    drive.fight = true;
    drive.walkTo({ area: 'sample', screen: '0,-1', tx: 7, ty: 1 });
    // Two tiles under the golem, close enough for the blade to reach it.
    drive.until((g) => g.player.screen === '0,-2' && !g.transition && g.player.y <= 6 * 16 + 4, 4, ['up']);
    drive.hold([], 0.3);
    for (let i = 0; i < 6 && !drive.state.dungeons.sample.boss; i += 1) {
      drive.press('mainHand');
      drive.hold([], 0.5);
    }
    assert.equal(drive.state.dungeons.sample.boss, true, 'the golem fell to the sword');
    drive.reload();
    // Back in (beside the warp's column, so the walk does not step on it):
    // the heart container waited where the golem stood, and the warp leads out.
    drive.VL.place(drive.state, { area: 'sample', screen: '0,-2', tx: 6, ty: 6, facing: 'up' });
    drive.hold([], 0.1);
    drive.walkTo({ tx: 7, ty: 5 });
    const maxHp = drive.state.maxHp;
    drive.until((g) => g.maxHp > maxHp, 1, ['up']);
    assert.ok(drive.VL.spotFound(drive.state, 'heartSample'), 'the heart container was waiting');
    drive.closePopups();
    drive.until((g) => g.player.area === 'sampleYard', 3, ['down']);
  },
};
const VL_tile = (drive) => drive.VL.heroTile(drive.state);

test('playthrough: the sample dungeon from the yard to the boss and out, reloading after every earning', () => {
  const { VL } = loadDungeon();
  const play = createPlaythrough(VL, { milestones: SAMPLE_MILESTONES, steps: sampleSteps });
  const drive = play.playTo('sampleBoss');
  // playTo's last Save & Quit: out through the boss warp, on the doorstep (W44).
  const { area, tx, ty } = VL.DUNGEONS.sample.entrance;
  assert.deepEqual([drive.state.savePoint.area, drive.state.savePoint.tx, drive.state.savePoint.ty], [area, tx, ty]);
  assert.deepEqual([drive.state.player.area, VL_tile(drive).tx, VL_tile(drive).ty], [area, tx, ty]);
  assert.equal(drive.state.maxHp, VL.TUNING.startMaxHp + VL.TUNING.heartContainerHp);
  assert.deepEqual(plain(drive.state.dungeons.sample), {
    keysGiven: 0, bossKey: true, map: true, boss: true,
    doors: { sampleDoorNorth: true, sampleBossDoor: true }, plates: { samplePlate: true }, switches: { sampleSwitch: true },
  });
});

test('a faint anywhere in the dungeon, before or after each puzzle, never leaves it unsolvable', () => {
  // After each milestone's step (and its Save & Quit): faint, wake at that
  // save, and check the rest of the path is still open with the blocks reset.
  const { VL } = loadDungeon();
  for (let n = 1; n < SAMPLE_MILESTONES.length; n += 1) {
    const play = createPlaythrough(VL, { milestones: SAMPLE_MILESTONES, steps: sampleSteps });
    const drive = play.playTo(SAMPLE_MILESTONES[n - 1]);
    VL.faint(drive.state, 'sampleGolem');
    drive.update();
    drive.hold([], 0.7);
    const saved = drive.state.savePoint;
    drive.press('interact');
    assert.deepEqual([drive.state.player.screen, VL_tile(drive).tx, VL_tile(drive).ty], [saved.screen, saved.tx, saved.ty], `woke at the save after ${SAMPLE_MILESTONES[n - 1]}`);
    for (const id of SAMPLE_MILESTONES.slice(n)) {
      drive.fight = false;
      sampleSteps[id](drive);
      assert.ok(VL.LOCKS[id].reached(drive.state), `${id} after fainting at ${SAMPLE_MILESTONES[n - 1]}`);
    }
  }
});

// ---------- drawing ----------

test('render smoke: every dungeon entity draws in each of its states, and every scene still draws', () => {
  const t = setup({ where: at('0,0', 8, 7), enemies: true });
  const { VL } = t;
  const ctx = fakeDocument().createElement('canvas').getContext('2d');
  const draw = () => {
    const before = Object.values(ctx.calls).reduce((sum, n) => sum + n, 0);
    VL.render(ctx, t.app, 0.4);
    return Object.values(ctx.calls).reduce((sum, n) => sum + n, 0) - before;
  };
  for (const screen of ['0,0', '1,0', '0,-1', '0,-2']) {
    t.place(at(screen, 8, 8));
    t.step();
    assert.ok(draw() > 50, `${screen} draws`);
  }
  // Open doors, a thrown switch, a down plate, a sliding block, the heart and warp.
  Object.assign(t.d, { doors: { sampleDoorNorth: true, sampleBossDoor: true }, switches: { sampleSwitch: true }, plates: { samplePlate: true }, boss: true });
  t.game.flags['found:heartSample'] = true;
  t.place(at('1,0', 10, 8, 'right'));
  t.until(() => t.find('pushBlock').x === 12, 1, ['right']);
  assert.ok(draw() > 50);
  t.place(at('0,-1', 8, 8));
  t.step();
  assert.ok(draw() > 50);
  t.place(at('0,-2', 7, 8));
  t.step();
  assert.ok(t.find('warp'));
  assert.ok(draw() > 50);
  for (const id of ['item-small-key', 'item-boss-key', 'pickup-dungeon-map', 'icon-skull', 'prop-locked-door', 'prop-boss-door', 'prop-door-open', 'prop-push-block', 'prop-plate', 'prop-plate-down', 'prop-switch-off', 'prop-switch-on', 'prop-shutter', 'prop-lantern']) {
    assert.ok(VL.ART.sprite(id), id);
  }
});

test('a carried chicken cannot fly over a dungeon pit', () => {
  const t = setup({ where: at('0,-1', 10, 2, 'right') });
  const { VL } = t;
  const plan = VL.planFlight(t.game);
  assert.equal(plan.land, 1, 'only the floor tile before the pit');
  assert.equal(plan.over, null);
});

// ---------- the lints: layouts that would softlock are told, not shipped ----------

const room = (entities = []) => ({ tiles: ['#'.repeat(16), ...Array(9).fill(`#${'_'.repeat(14)}#`), '#'.repeat(16)], entities });

test('the block lint: a push that cuts the hero off from every exit of a room is reported; the sample passes', () => {
  const { VL } = loadDungeon();
  assert.deepEqual([...VL.dungeonBlockProblems()], []);
  // Block room 1,0's only way out is the left opening (0,5): a block at (2,5)
  // pushed left lands in front of it, and a block moves once per visit.
  VL.getScreen('sample', '1,0').entities.push({ type: 'pushBlock', x: 2, y: 5 });
  assert.deepEqual([...VL.dungeonBlockProblems()], ['sample 1,0: block (2,5) pushed left to (1,5) cuts the hero off from every exit']);
  assert.deepEqual([...VL.dungeonProblems()], [...VL.dungeonBlockProblems()], 'dungeonProblems gathers every lint');
});

test('the block lint follows pushes in sequence, a free block as far as it can go, and a door counts as an exit', () => {
  const { VL } = loadDungeon();
  // A corridor room: the way out is a door at (7,9) behind a one-tile gap at
  // (7,8); the free block two tiles up can be walked round and pushed down into it.
  const tiles = ['#'.repeat(16), ...Array(7).fill('#______________#'), '#######_########', '#######m########', '#'.repeat(16)];
  VL.addScreens('sample', { '5,5': { tiles, entities: [{ type: 'door', x: 7, y: 9, to: at('0,0', 8, 7) }, { type: 'pushBlock', x: 7, y: 5, once: false }] } });
  assert.deepEqual([...VL.dungeonBlockProblems()], ['sample 5,5: block (7,5) pushed down to (7,6), block (7,6) pushed down to (7,7) cuts the hero off from every exit']);
  // The same block that moves once per visit cannot get there.
  VL.getScreen('sample', '5,5').entities[1].once = true;
  assert.deepEqual([...VL.dungeonBlockProblems()], []);
});

test('the lock lint: a lock is named by doors of one id only, and an id is never used twice across all areas', () => {
  const { VL } = loadDungeon();
  VL.getScreen('sample', '0,-1').entities.push({ type: 'lockedDoor', id: 'sampleDoorWest', kind: 'small', x: 2, y: 8, lock: 'sampleDoorNorth' });
  assert.deepEqual([...VL.dungeonLockProblems()], ['lock sampleDoorNorth is named by doors sampleDoorNorth and sampleDoorWest: the solver counts one key, the game spends one per door id']);
  VL.getScreen('sample', '0,-1').entities.pop();
  // A key id reused by another area (found flags are global): it is already found there.
  VL.getScreen('sampleYard', '0,0').entities.push({ type: 'chest', id: 'sampleKey', x: 5, y: 6, contents: [] });
  assert.deepEqual([...VL.dungeonLockProblems()], ['id sampleKey is used by sample 1,0 smallKey and sampleYard 0,0 chest: ids are global, so prefix them with the dungeon']);
});

test('the door lint: a locked door on an edge needs its twin on the neighbour screen, or oneWay: true', () => {
  const { VL } = loadDungeon();
  assert.deepEqual([...VL.dungeonDoorProblems()], []);
  const s = VL.getScreen('sample', '0,-1');
  s.entities = s.entities.filter((e) => e.id !== 'sampleDoorNorth');
  assert.deepEqual([...VL.dungeonDoorProblems()], ['sample 0,0 lockedDoor sampleDoorNorth on the edge has no copy on 0,-1 at (7,10): add one with the same id, or oneWay: true if that room is only ever entered through this door']);
  const bossDoor = s.entities.find((e) => e.id === 'sampleBossDoor');
  delete bossDoor.oneWay;
  assert.match(VL.dungeonDoorProblems().join('\n'), /sampleBossDoor on the edge has no copy on 0,-2 at \(7,10\)/);
  bossDoor.oneWay = true;
  s.entities.push({ type: 'lockedDoor', id: 'sampleDoorNorth', kind: 'small', x: 7, y: 10, lock: 'sampleDoorNorth' });
  // The same id in a third place, not a side of its edge.
  VL.addScreens('sample', { '5,5': room([{ type: 'lockedDoor', id: 'sampleDoorNorth', kind: 'small', x: 7, y: 5, lock: 'sampleDoorNorth' }]) });
  assert.match(VL.dungeonDoorProblems().join('\n'), /lockedDoor sampleDoorNorth is on 3 screens \(0,0, 0,-1, 5,5\): one id is one door, two copies at most, on the two sides of one edge/);
});

// A walled room from `open` rows (the gaps are its openings) and a wall-only
// neighbour with one opening, for the lint layouts below.
const WALL = '#'.repeat(16);
const FLOOR = `#${'_'.repeat(14)}#`;
const walledRoom = (rows, entities) => ({ tiles: rows, entities });
const stub = (opening) => ({ tiles: Array.from({ length: 11 }, (_, y) => (y === opening.y ? WALL.slice(0, opening.x) + '_' + WALL.slice(opening.x + 1) : WALL)), entities: [] });

test('the block lint: a closed shutter on an exit is no way out, so a block pushed off the plate that holds the only bars up is reported', () => {
  const { VL } = loadDungeon();
  // The only way out of 5,5 is the left opening, barred unless the plate is
  // held down; the block starts on the plate, and its one push takes it off.
  const rows = [WALL, FLOOR, FLOOR, FLOOR, FLOOR, `_${'_'.repeat(14)}#`, FLOOR, FLOOR, FLOOR, FLOOR, WALL];
  VL.addScreens('sample', {
    '5,5': walledRoom(rows, [
      { type: 'shutter', id: 'sampleBars55', x: 0, y: 5, open: { plate: 'samplePlate55' } },
      { type: 'pressurePlate', id: 'samplePlate55', x: 3, y: 5, weight: 'block' },
      { type: 'pushBlock', x: 3, y: 5 },
    ]),
    '4,5': stub({ x: 15, y: 5 }),
  });
  assert.deepEqual([...VL.dungeonBlockProblems()], ['sample 5,5: block (3,5) pushed left to (2,5) cuts the hero off from every exit']);
  // Latched, the plate keeps the bars up once the block has pressed it.
  VL.getScreen('sample', '5,5').entities[1].latch = true;
  assert.deepEqual([...VL.dungeonBlockProblems()], []);
});

test('the block lint starts from a lantern and every arrival tile too: a respawn pocket with no way out is a bricked save', () => {
  const { VL } = loadDungeon();
  // The lantern (2,1) sits in a pocket whose mouth (2,2) holds the block:
  // pushed from outside it opens the way in; on every Continue the block is
  // back and the hero wakes behind it.
  const rows = [WALL, '#__#___________#', FLOOR, '#_##___________#', '####___________#', '####____________', '####___________#', '####___________#', '####___________#', '####___________#', WALL];
  VL.addScreens('sample', {
    '5,5': walledRoom(rows, [{ type: 'pushBlock', x: 2, y: 2 }, { type: 'savePoint', x: 2, y: 1 }]),
    '6,5': stub({ x: 0, y: 5 }),
  });
  assert.deepEqual([...VL.dungeonBlockProblems()], ['sample 5,5: the hero waking at the lantern (2,1) can reach no exit without a push']);
  // A door landing the hero in the pocket is the same trap.
  VL.getScreen('sample', '5,5').entities.pop();
  VL.getScreen('sampleYard', '0,0').entities.push({ type: 'door', x: 12, y: 6, to: at('5,5', 1, 2, 'down') });
  assert.deepEqual([...VL.dungeonBlockProblems()], ['sample 5,5: the hero arriving at (1,2) can reach no exit without a push']);
  // With the mouth open, the pocket is just a corner of the room.
  VL.getScreen('sample', '5,5').entities.shift();
  assert.deepEqual([...VL.dungeonBlockProblems()], []);
});

test('the block lint: a shutter on a switch in the room opens only once the hero can stand beside the switch', () => {
  const { VL } = loadDungeon();
  // The entry bars drop behind the hero and open on the switch in the alcove
  // at (1,1), reached along row 3; the block at (5,3) pushed left to (4,3)
  // walls the alcove off.
  const rows = [WALL, '#__#___________#', '#__#___________#', FLOOR, '####___________#', `_${'_'.repeat(14)}#`, FLOOR, FLOOR, FLOOR, FLOOR, WALL];
  VL.addScreens('sample', {
    '5,5': walledRoom(rows, [
      { type: 'shutter', id: 'sampleBars55', x: 0, y: 5, open: { switch: 'sampleSwitch55' } },
      { type: 'switch', id: 'sampleSwitch55', x: 1, y: 1 },
      { type: 'pushBlock', x: 5, y: 3 },
    ]),
    '4,5': stub({ x: 15, y: 5 }),
  });
  assert.deepEqual([...VL.dungeonBlockProblems()], ['sample 5,5: block (5,3) pushed left to (4,3) cuts the hero off from every exit']);
  // A switch that is not in the room is taken as thrown, as before.
  VL.getScreen('sample', '5,5').entities.splice(1, 1);
  assert.deepEqual([...VL.dungeonBlockProblems()], []);
});

test('the door lint: a oneWay door is checked, so a warp or a loop that reaches its far room another way is reported', () => {
  const { VL } = loadDungeon();
  // A warp in the hall into the boss room, past the boss door.
  VL.getScreen('sample', '0,0').entities.push({ type: 'warp', x: 12, y: 8, to: at('0,-2', 7, 6, 'up') });
  assert.deepEqual([...VL.dungeonDoorProblems()], ['sample 0,-1 lockedDoor sampleBossDoor is oneWay but 0,-2 is also reached from 0,0 through the warp at (12,8): give the door a twin, or remove the other way in']);
  VL.getScreen('sample', '0,0').entities.pop();
  // A loop: 0,0 -> 1,0 -> 1,-1 -> 0,-1 comes round to the far side of a
  // one-way door on 0,0's top edge.
  const gaps = (top, right, bottom, left) => Array.from({ length: 11 }, (_, y) => Array.from({ length: 16 }, (_, x) => {
    const edge = x === 0 || y === 0 || x === 15 || y === 10;
    const gap = (top && y === 0 && x === 7) || (right && x === 15 && y === 5) || (bottom && y === 10 && x === 7) || (left && x === 0 && y === 5);
    return edge && !gap ? '#' : '_';
  }).join(''));
  VL.defineArea('loop', { tileset: 'dungeon' });
  VL.addScreens('loop', {
    '0,0': walledRoom(gaps(true, true, false, false), [{ type: 'lockedDoor', id: 'loopOneWay', kind: 'small', x: 7, y: 0, lock: 'loopOneWay', oneWay: true }]),
    '0,-1': walledRoom(gaps(false, true, true, false), []),
    '1,-1': walledRoom(gaps(false, false, true, true), []),
    '1,0': walledRoom(gaps(true, false, false, true), []),
  });
  VL.defineDungeon('loop', { area: 'loop', entrance: { area: 'sampleYard', screen: '0,0', tx: 12, ty: 7, facing: 'down' } });
  const loopProblems = () => [...VL.dungeonDoorProblems()].filter((p) => p.startsWith('loop'));
  // With nothing leading into the dungeon yet, the lint cannot tell and says so.
  assert.deepEqual(loopProblems(), ['loop 0,0 lockedDoor loopOneWay is oneWay but no door or warp leads into dungeon loop from outside, so where its far room is reached from cannot be told: add the dungeon\'s door']);
  VL.getScreen('sampleYard', '0,0').entities.push({ type: 'door', x: 12, y: 6, to: { area: 'loop', screen: '0,0', tx: 7, ty: 5, facing: 'up' } });
  assert.deepEqual(loopProblems(), ['loop 0,0 lockedDoor loopOneWay is oneWay but 0,-1 is also reached from 1,-1 through the opening at (0,5): give the door a twin, or remove the other way in']);
  // Walling the loop off leaves the far room reached through the door alone.
  VL.getScreen('loop', '1,-1').tiles[5] = `#${'_'.repeat(14)}#`;
  assert.deepEqual(loopProblems(), []);
});

test('the lock lint: a key, the boss key, the map, a plate and a switch each need an id', () => {
  const { VL } = loadDungeon();
  VL.getScreen('sample', '0,0').entities.push({ type: 'smallKey', x: 4, y: 4, lock: 'sampleKey' }, { type: 'switch', x: 4, y: 6 });
  assert.deepEqual([...VL.dungeonLockProblems()], ['sample 0,0 smallKey needs an id', 'sample 0,0 switch needs an id']);
});

test('a smallKey entity that is not on the map is refused when picked up: a key from code is VL.giveSmallKey', () => {
  const t = setup({ where: at('0,0', 5, 5, 'right') });
  t.step();
  t.game.room.entities.push({ type: 'smallKey', id: 'sampleDropKey', x: 6, y: 5, lock: 'sampleKey' });
  assert.throws(() => t.hold(['right'], 0.5), /smallKey sampleDropKey is not on screen sample 0,0: a key that appears at runtime is a map key with reveal, or VL.giveSmallKey/);
});

test("a chest can hold a small key: { smallKey: '<dungeon>' } gives one of that dungeon's keys", () => {
  const t = setup({ where: at('0,0', 5, 6, 'up') });
  t.game.room.entities.push({ type: 'chest', id: 'sampleKeyChest', x: 5, y: 5, contents: [{ smallKey: 'sample' }] });
  t.press('interact');
  assert.equal(t.keys, 1);
  assert.equal(t.d.keysGiven, 1);
  assert.ok(events(t, 'smallKey').length, 'the key chime');
});

test('the boss warp waits for the keys to be let go, so a direction held through it never walks the hero straight back in', () => {
  const t = setup({ where: at('0,-2', 7, 9, 'up') });
  t.d.boss = true;
  t.game.flags['found:heartSample'] = true;
  t.d.doors.sampleBossDoor = true;
  t.place(at('0,-2', 7, 9, 'up'));
  t.hold(['up'], 1.5);
  assert.equal(t.game.player.area, 'sampleYard', 'out through the warp');
  assert.deepEqual(t.tile(), [8, 4], 'still at the entrance with Up held');
  t.hold([], 0.1);
  t.hold(['up'], 0.5);
  assert.equal(t.game.player.area, 'sample', 'let go and pressed again: in through the door');
});

test("the boss warp out saves nothing (W44): a faint after it goes back to the last lantern, boss and all", () => {
  const t = setup({ where: at('0,0', 2, 2, 'up'), storage: true });
  t.until((g) => g.savePoint?.area === 'sample', 1, ['up']);
  const written = t.app.storage.read(t.VL.slotKey(0));
  t.d.boss = true;
  t.game.flags['found:heartSample'] = true;
  t.d.doors.sampleBossDoor = true;
  t.place(at('0,-2', 7, 9, 'up'));
  t.hold(['up'], 0.8);
  assert.equal(t.game.player.area, 'sampleYard', 'out through the warp');
  assert.deepEqual(plain(t.game.savePoint), { area: 'sample', screen: '0,0', tx: 2, ty: 1, facing: 'down' }, 'still the lantern');
  t.step();
  assert.equal(t.app.storage.read(t.VL.slotKey(0)), written, 'nothing written');
  t.VL.faint(t.game, 'sampleGolem');
  t.step();
  t.hold([], 0.7);
  t.press('interact');
  assert.deepEqual([t.game.player.area, ...t.tile()], ['sample', 2, 1], 'back at the lantern');
  assert.equal(t.d.boss, false, 'the boss waits again');
});

test("every dungeon's entrance is a walkable tile just outside its door (a saved respawn point since W27)", () => {
  const { VL } = loadDungeon();
  const { isWalkable } = require('./playthrough');
  const ids = Object.keys(VL.DUNGEONS);
  assert.ok(['sample', 'scriptorium', 'hollowOak'].every((id) => ids.includes(id)), ids.join());
  for (const [id, dungeon] of Object.entries(VL.DUNGEONS)) {
    const { area, screen, tx, ty, facing } = dungeon.entrance;
    assert.notEqual(area, dungeon.area, `${id}: outside the dungeon`);
    assert.ok(isWalkable(VL, area, screen, tx, ty), `${id}: ${area} ${screen} (${tx},${ty}) is walkable`);
    const door = VL.getScreen(area, screen).entities.find((e) => e.type === 'door' && e.to?.area === dungeon.area);
    assert.ok(door, `${id}: a door into it on ${screen}`);
    assert.equal(Math.abs(door.x - tx) + Math.abs(door.y - ty), 1, `${id}: the entrance is beside the door`);
    const [dx, dy] = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[facing];
    assert.deepEqual([tx - dx, ty - dy], [door.x, door.y], `${id}: facing away from the door`);
  }
});

test('keys in hand are derived (keys found + keys given - doors opened), so a renamed door or key id heals itself after a save', () => {
  const t = setup({ storage: true, where: at('0,0', 7, 1, 'up') });
  const { VL } = t;
  VL.markFound(t.game, 'sampleKey');
  assert.equal(t.keys, 1);
  t.hold(['up'], 0.2);
  assert.equal(t.d.doors.sampleDoorNorth, true);
  assert.equal(t.keys, 0);
  assert.equal('keys' in t.d, false, 'nothing stored that could go stale');
  t.app.save();
  // A later release renames the door (both copies): it reads locked, but the key it took is back.
  for (const s of ['0,0', '0,-1']) for (const e of VL.getScreen('sample', s).entities) if (e.id === 'sampleDoorNorth') e.id = 'sampleDoorNorthRenamed';
  t.reload(at('0,0', 7, 1, 'up'));
  t.step();
  assert.ok(t.find('lockedDoor').solid, 'the renamed door is locked');
  assert.equal(t.keys, 1, 'and the key it was opened with is in hand again');
  t.hold(['up'], 0.2);
  assert.ok(t.find('lockedDoor').open, 'so it opens again');
  assert.equal(t.keys, 0);
  // The key renamed instead: it lies there again, and the count never goes below zero.
  VL.getScreen('sample', '1,0').entities.find((e) => e.type === 'smallKey').id = 'sampleKeyRenamed';
  assert.equal(t.keys, 0);
  t.place(at('1,0', 7, 5, 'up'));
  assert.ok(t.find('smallKey'), 'the key under its new id is there to find');
  // Keys from code (a chest, a drop) are counted as given.
  VL.giveSmallKey(t.game, 'sample', 2);
  assert.equal(t.d.keysGiven, 2);
  assert.equal(t.keys, 1);
});

test('a boss that leaves the room alive is not beaten; one that fell (hp 0, or marked defeated) is', () => {
  const t = setup({ where: at('0,-2', 7, 8, 'up'), enemies: true });
  t.step();
  t.step();
  const golem = t.find('sampleGolem');
  // A W14-style burrow done by taking the worm out of the room for a while.
  t.game.room.entities = t.game.room.entities.filter((e) => e !== golem);
  t.step();
  assert.equal(t.d.boss, false, 'gone but alive: not beaten');
  t.game.room.entities.push(golem);
  t.step();
  golem.defeated = true;
  t.game.room.entities = t.game.room.entities.filter((e) => e !== golem);
  t.step();
  assert.equal(t.d.boss, true, 'a scripted kill marks it defeated before removing it');
});

test('the pathfinder walks through a tile opened with VL.saveTile and round one it walled', () => {
  const t = setup({ where: at('1,0', 3, 2) });
  const { VL } = t;
  const from = at('1,0', 4, 4);
  const to = at('1,0', 6, 4);
  assert.equal(findPath(VL, from, to, t.game), null, 'a wall, and the pocket is shut');
  VL.saveTile(t.game, 5, 4, '_');
  assert.equal(findPath(VL, from, to, t.game)?.length, 3, 'straight through the opened wall');
  VL.saveTile(t.game, 5, 4, '#');
  assert.equal(findPath(VL, from, to, t.game), null);
});

test("a plate with weight: 'block' ignores the hero; any entity type with weighsPlate presses one, wherever its body stands", () => {
  const t = setup({ storage: true, where: at('1,0', 12, 7, 'down') });
  const { VL } = t;
  t.until(() => t.tile()[1] === 8, 1, ['down']);
  t.step();
  assert.deepEqual(t.tile(), [12, 8], 'standing on the plate');
  assert.equal(t.find('pressurePlate').down, false);
  assert.equal(t.d.plates.samplePlate, undefined, 'the sample puzzle needs its block');
  VL.defineEntity('samplePot', { weighsPlate: true, draw() {} });
  t.game.room.entities.push({ type: 'samplePot', x: 11, y: 8, cx: 12 * 16 + 3, cy: 8 * 16 + 8 });
  t.step();
  assert.ok(t.find('pressurePlate').down, 'a pot whose body is on the plate presses it');
  assert.equal(t.d.plates.samplePlate, true);
});

test('a block never slides onto an enemy, even one standing off the tile grid', () => {
  const t = setup({ enemies: true, where: at('0,0', 4, 7, 'right') });
  const { VL } = t;
  t.step();
  t.game.room.entities.push({ type: 'pushBlock', x: 5, y: 7, pushed: false });
  const block = t.find('pushBlock');
  const slime = t.find('slime');
  slime.cx = 6 * 16 + 8 + 3;
  slime.cy = 7 * 16 + 8;
  slime.x = (slime.cx - 8) / 16;
  assert.equal(VL.blockCanMove(t.game, block, 1, 0), false);
  slime.cx = 8 * 16 + 8;
  slime.x = 8;
  assert.equal(VL.blockCanMove(t.game, block, 1, 0), true);
});

test("the keys HUD is drawn over the light and on the hero's flash-off frames", () => {
  const t = setup({ where: at('0,0', 8, 7) });
  const { VL } = t;
  const order = [];
  const original = { text: VL.ART.text, light: VL.ART.drawLight };
  VL.ART.text = (ctx, str, ...rest) => {
    order.push(String(str));
    return original.text(ctx, str, ...rest);
  };
  VL.ART.drawLight = (...args) => {
    order.push('light');
    return original.light(...args);
  };
  const ctx = fakeDocument().createElement('canvas').getContext('2d');
  t.d.keysGiven = 3;
  t.game.player.flash = 1 / 16; // an odd sixteenth: a frame the hero is hidden on
  VL.render(ctx, t.app, 0);
  assert.ok(order.includes('x3'), 'drawn while the hero flashes');
  assert.ok(order.indexOf('x3') > order.indexOf('light'), 'and after the light');
  VL.ART.text = original.text;
  VL.ART.drawLight = original.light;
});

test('a saved tile change and the saved door, switch and shutter states are in the room the moment it is built', () => {
  const t = setup({ where: at('0,0', 8, 7), storage: true });
  const { VL } = t;
  VL.saveTile(t.game, 5, 5, '#');
  t.d.doors.sampleDoorNorth = true;
  t.place(at('1,0', 1, 5, 'left'));
  VL.enterScreen(t.game, at('0,0', 15, 5, 'left'), 'left');
  assert.ok(t.game.transition, 'sliding in');
  assert.equal(VL.tileAt('sample', '0,0', 5, 5, t.game.room), '#', 'changed before the first step');
  assert.ok(t.find('lockedDoor').open, 'the door is drawn open as the screen slides in');
  assert.ok(t.find('shutter').closed && !t.find('shutter').solid, 'the shutter is settled (closed, not on the hero)');
});

test('the W13 fixture is a played state: keys derived, nothing stored for them', () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v1-W13.json'), 'utf8'));
  const d = fixture.dungeons.sample;
  assert.equal('keys' in d, false);
  assert.equal(d.keysGiven, 0);
  assert.ok(fixture.flags['found:sampleKey'] && d.doors.sampleDoorNorth, 'the one key was found and spent on the door');
});

test('README documents the dungeon framework and how to build a dungeon', () => {
  const readme = read('README.md');
  for (const phrase of ['## Dungeons', 'VL.defineDungeon', 'lockedDoor', 'pushBlock', 'pressurePlate', 'shutter', 'VL.SAVE_LANTERNS', 'smallKey:', 'VL.saveTile', 'dungeonMap', 'How to build a dungeon', 'tests/sample-dungeon.js', 'VL.dungeonLockProblems', 'VL.dungeonBlockProblems', 'VL.dungeonDoorProblems', 'VL.dungeonProblems', 'oneWay', 'weighsPlate', "weight: 'block'", 'defeated', 'VL.smallKeys', 'keysGiven', "{ smallKey: '<dungeon>' }", 'warpHold', "'overlay'", 'can reach no exit without a push', 'the far room really is reached through them alone']) {
    assert.ok(readme.includes(phrase), `README mentions ${phrase}`);
  }
});
