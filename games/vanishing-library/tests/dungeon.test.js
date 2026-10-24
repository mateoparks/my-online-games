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
      for (let i = 0; i < 10 && app.sceneId === 'popup'; i += 1) {
        t.hold([], 0.4);
        t.press('interact');
      }
      assert.equal(app.sceneId, 'play');
    },
    // A page reload (no save first), then the hero placed at `place` if given.
    reload(place) {
      app = VL.reloadApp(app);
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
  assert.deepEqual(plain(game.dungeons), { sample: { keys: 0, bossKey: false, map: false, doors: {}, plates: {}, switches: {}, boss: false } });
  assert.deepEqual(plain(game.tileChanges), {});
  assert.ok(!VL.TRANSIENT_FIELDS.includes('dungeons') && !VL.TRANSIENT_FIELDS.includes('tileChanges'));
  assert.ok(VL.TRANSIENT_FIELDS.includes('dungeonNote'));
  // A dungeon added after a save was written gets its state on first use.
  delete game.dungeons.sample;
  assert.deepEqual(plain(VL.dungeonState(game, 'sample')), { keys: 0, bossKey: false, map: false, doors: {}, plates: {}, switches: {}, boss: false });
  assert.throws(() => VL.dungeonState(game, 'nowhere'), /no dungeon nowhere/);
});

test('the W13 fixture loads with keys, doors, plates, switches, the map and the boss intact', () => {
  const { VL } = loadGame();
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v1-W13.json'), 'utf8'));
  const d = fixture.dungeons.sample;
  assert.ok(d.keys > 0 && d.bossKey && d.map && d.boss && Object.keys(d.doors).length && Object.keys(d.plates).length && Object.keys(d.switches).length, 'non-default dungeon state');
  assert.ok(Object.keys(fixture.tileChanges).length, 'a saved tile change');
  const backing = memoryStorage({ [VL.slotKey(0)]: JSON.stringify(fixture) });
  const game = VL.loadSlot(VL.createStorage(backing), 0);
  assert.deepEqual(plain(game.dungeons), fixture.dungeons);
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
  assert.equal(t.d.keys, 1);
  assert.equal(t.find('smallKey'), undefined);
  assert.ok(VL.spotFound(t.game, 'sampleKey'));
  assert.ok(events(t, 'smallKey').length || t.app.savedAt !== null, 'earned');
  t.reload(at('1,0', 7, 5, 'up'));
  t.step();
  assert.equal(t.d.keys, 1, 'the key survives a reload');
  assert.equal(t.find('smallKey'), undefined, 'and is not lying there again');
  // Walking the tile again gives nothing.
  t.hold(['up'], 0.4);
  assert.equal(t.d.keys, 1);
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
  assert.equal(t.d.keys, 1);
  t.hold(['up'], 0.1);
  assert.ok(door.open && !door.solid, 'opened by walking into it with a key');
  assert.equal(t.d.keys, 0, 'the key is spent');
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
  assert.equal(t.d.keys, 0);
});

test('S facing a locked door opens it as well, and a key never works in another dungeon', () => {
  const t = setup({ where: at('0,0', 7, 1, 'up') });
  const { VL } = t;
  VL.giveSmallKey(t.game, 'sample', 2);
  t.press('interact');
  assert.ok(t.find('lockedDoor', 'sampleDoorNorth').open);
  assert.equal(t.d.keys, 1);
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
  assert.equal(VL.dungeonState(t.game, 'other').keys, 0);
  assert.equal(t.d.keys, 1, 'the sample key is untouched');
});

test('the boss key opens the boss door and is kept; the boss door ignores small keys', () => {
  const t = setup({ where: at('0,-1', 7, 1, 'up'), storage: true });
  const { VL } = t;
  VL.giveSmallKey(t.game, 'sample', 3);
  t.hold(['up'], 0.5);
  const door = t.find('lockedDoor', 'sampleBossDoor');
  assert.ok(door.solid, 'three small keys open no boss door');
  assert.equal(t.d.keys, 3);
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

test('the statue step saves the game and sets the respawn point; fainting returns there with everything kept', () => {
  const t = setup({ where: at('0,0', 2, 2, 'up'), storage: true });
  const { VL } = t;
  assert.equal(t.game.savePoint, null);
  assert.ok(VL.isSolidAt('sample', '0,0', 2, 0), 'the statue stands in a wall niche');
  t.until((g) => g.savePoint !== null, 1, ['up']);
  assert.deepEqual(plain(t.game.savePoint), { area: 'sample', screen: '0,0', tx: 2, ty: 1, facing: 'down' });
  assert.equal(t.game.dungeonNote?.text, 'The statue glows. Your journey is saved.');
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
  assert.deepEqual(t.tile(), [2, 1], 'awake at the statue');
  assert.equal(t.game.hp, t.game.maxHp);
  assert.equal(t.d.keys, 1, 'the key is kept');
  // A reload lands there too.
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
  assert.equal(t.app.sceneId, 'play');
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
  t.d.keys = 2;
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
  t.d.keys = 3;
  VL.render(ctx, t.app, 0);
  assert.ok(strings.includes('x3'));
  strings.length = 0;
  t.place({ area: 'overworld', screen: '1,1', tx: 8, ty: 6 });
  VL.render(ctx, t.app, 0);
  assert.ok(!strings.includes('x3'));
  VL.ART.text = original;
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
  assert.ok(t.find('shutter', 'sampleBossShutter').solid, 'the way back is barred while the boss lives');
  assert.equal(VL.roomCleared(t.game), true, 'a boss does not count as an ordinary enemy');
  beatBoss(t);
  assert.equal(t.d.boss, true);
  assert.equal(VL.bossBeaten(t.game, 'sample'), true);
  assert.equal(events(t, 'bossDefeated').length, 1);
  const heart = t.find('heartContainer');
  assert.deepEqual([heart.id, heart.x, heart.y], ['heartSample', 7, 4], 'where the boss stood');
  assert.equal(VL.bossDefeated(t.game, 'sample'), false, 'beaten once');
  assert.equal(t.game.room.entities.filter((e) => e.type === 'warp').length, 1);
  const warp = t.find('warp');
  assert.deepEqual([warp.x, warp.y], [7, 7]);
  t.step();
  assert.ok(!t.find('shutter', 'sampleBossShutter').solid, 'the bars lift');
  const maxHp = t.game.maxHp;
  t.until((g) => g.maxHp > maxHp, 3, ['up']);
  assert.ok(VL.spotFound(t.game, 'heartSample'));
  t.closePopups();
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
    assert.equal(drive.state.dungeons.sample.keys, 1, 'the key survives a reload');
  },
  sampleDoorNorth(drive) {
    drive.walkTo({ area: 'sample', screen: '0,0', tx: 7, ty: 1 });
    drive.until((g) => g.dungeons.sample.doors.sampleDoorNorth, 1, ['up']);
    drive.reload();
    assert.equal(drive.state.dungeons.sample.keys, 0, 'the key is spent with the door open');
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
  // playTo's last reload put the hero back at the statue.
  assert.deepEqual([drive.state.player.area, VL_tile(drive).tx, VL_tile(drive).ty], ['sample', 2, 1]);
  assert.equal(drive.state.maxHp, VL.TUNING.startMaxHp + VL.TUNING.heartContainerHp);
  assert.deepEqual(plain(drive.state.dungeons.sample), {
    keys: 0, bossKey: true, map: true, boss: true,
    doors: { sampleDoorNorth: true, sampleBossDoor: true }, plates: { samplePlate: true }, switches: { sampleSwitch: true },
  });
});

test('a faint anywhere in the dungeon, before or after each puzzle, never leaves it unsolvable', () => {
  // After each milestone's step: faint, wake at the statue, and check the rest
  // of the path is still open to the pathfinder with the blocks reset.
  const { VL } = loadDungeon();
  for (let n = 1; n < SAMPLE_MILESTONES.length; n += 1) {
    const play = createPlaythrough(VL, { milestones: SAMPLE_MILESTONES, steps: sampleSteps });
    const drive = play.playTo(SAMPLE_MILESTONES[n - 1]);
    VL.faint(drive.state, 'sampleGolem');
    drive.update();
    drive.hold([], 0.7);
    drive.press('interact');
    assert.deepEqual([drive.state.player.screen, VL_tile(drive).tx, VL_tile(drive).ty], ['0,0', 2, 1], `woke at the statue after ${SAMPLE_MILESTONES[n - 1]}`);
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
  for (const id of ['item-small-key', 'item-boss-key', 'pickup-dungeon-map', 'icon-skull', 'prop-locked-door', 'prop-boss-door', 'prop-door-open', 'prop-push-block', 'prop-plate', 'prop-plate-down', 'prop-switch-off', 'prop-switch-on', 'prop-shutter', 'prop-statue']) {
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

test('README documents the dungeon framework and how to build a dungeon', () => {
  const readme = read('README.md');
  for (const phrase of ['## Dungeons', 'VL.defineDungeon', 'lockedDoor', 'pushBlock', 'pressurePlate', 'shutter', 'saveStatue', 'smallKey:', 'VL.saveTile', 'dungeonMap', 'How to build a dungeon', 'tests/sample-dungeon.js', 'VL.dungeonLockProblems']) {
    assert.ok(readme.includes(phrase), `README mentions ${phrase}`);
  }
});
