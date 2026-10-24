// Saving (W2): storage that never throws, the three slots, the versioned save
// schema with migrations and default-filling, save points, earning, fainting.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test, read, loadGame, addFixtureWorld, memoryStorage, playState, hold } = require('./harness');
const { createPlaythrough } = require('./playthrough');

const blocked = () => {
  throw new Error('blocked');
};
const throwingStorage = { getItem: blocked, setItem: blocked, removeItem: blocked };

const fixturesDir = path.join(__dirname, 'fixtures');
const readFixture = (file) => JSON.parse(fs.readFileSync(path.join(fixturesDir, file), 'utf8'));
const fixtureV1 = () => readFixture('save-v1.json');
const fixtureFiles = () => fs.readdirSync(fixturesDir).filter((name) => /^save-.*\.json$/.test(name)).sort();

// ---------- storage ----------

test('createStorage probes the backing store and never throws afterwards', () => {
  const { VL } = loadGame();
  const memory = VL.createStorage(memoryStorage());
  assert.equal(memory.ok, true);
  assert.equal(memory.write('vanishing-library-x', 'a'), true);
  assert.equal(memory.read('vanishing-library-x'), 'a');
  memory.remove('vanishing-library-x');
  assert.equal(memory.read('vanishing-library-x'), null);
  for (const backing of [throwingStorage, undefined, null, () => { throw new Error('SecurityError'); }]) {
    const storage = VL.createStorage(backing);
    assert.equal(storage.ok, false);
    assert.equal(storage.write('vanishing-library-x', 'a'), false);
    assert.equal(storage.read('vanishing-library-x'), null);
    storage.remove('vanishing-library-x');
  }
  // A store whose getter works but whose writes fail (quota, private mode) is off too.
  const readOnly = { ...memoryStorage(), setItem: blocked };
  assert.equal(VL.createStorage(readOnly).ok, false);
  // A read that throws after boot (a corrupted store) is undefined, not null: nobody there, not "empty".
  const flaky = memoryStorage();
  const flakyStorage = VL.createStorage(flaky);
  flaky.getItem = blocked;
  assert.equal(flakyStorage.read('vanishing-library-x'), undefined);
  assert.equal(VL.readSlot(flakyStorage, 0).status, 'empty');
  // The probe leaves nothing behind.
  const backing = memoryStorage();
  VL.createStorage(backing);
  assert.equal(backing.map.size, 0);
});

test('slot keys carry the game prefix', () => {
  const { VL } = loadGame();
  assert.equal(VL.SLOT_COUNT, 3);
  assert.deepEqual([0, 1, 2].map(VL.slotKey), ['vanishing-library-slot-1', 'vanishing-library-slot-2', 'vanishing-library-slot-3']);
  assert.ok(VL.STORAGE_PROBE_KEY.startsWith('vanishing-library-'));
});

// ---------- schema ----------

test('a save carries v and the persistent fields only: no transient play state, no hp', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  VL.extendGame('satchel', () => ({ satchel: { wood: 2 } }));
  const state = playState(VL, { area: 'test', screen: '0,0', tx: 8, ty: 2 });
  state.hp = 1;
  state.flags.chest = true;
  const save = VL.serializeSave(state);
  assert.equal(save.v, VL.saveVersion());
  assert.equal(save.v, 1);
  assert.equal(save.name, 'Hero');
  assert.deepEqual({ ...save.flags }, { chest: true });
  assert.deepEqual({ ...save.satchel }, { wood: 2 }, 'extension fields are saved');
  assert.equal(save.savePoint, null);
  assert.equal(save.finished, false);
  for (const field of ['hp', 'time', 'player', 'room', 'transition', 'events', 'dirty', 'fainted']) {
    assert.equal(field in save, false, `${field} is not saved`);
  }
  assert.doesNotThrow(() => JSON.stringify(save));
  // Mutating the save never touches the live game.
  save.flags.other = true;
  assert.equal(state.flags.other, undefined);
});

test('save and load round trip: earnings kept, full hearts, back at the save point', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  VL.extendGame('satchel', () => ({ satchel: { wood: 0 } }));
  const storage = VL.createStorage(memoryStorage());
  const state = playState(VL, { area: 'test', screen: '0,0', tx: 8, ty: 2 });
  state.satchel.wood = 3;
  state.flags.chest = true;
  state.hp = 1;
  VL.touchSavePoint(state, { area: 'room', screen: '0,0', tx: 7, ty: 5, facing: 'down' });
  assert.equal(VL.saveSlot(storage, 1, state), true);
  const loaded = VL.loadSlot(storage, 1);
  assert.equal(loaded.name, 'Hero');
  assert.equal(loaded.satchel.wood, 3);
  assert.equal(loaded.flags.chest, true);
  assert.equal(loaded.hp, loaded.maxHp, 'loading gives full hearts');
  assert.equal(loaded.player.area, 'room');
  assert.equal(loaded.player.screen, '0,0');
  assert.deepEqual([loaded.player.x, loaded.player.y], [VL.tileCenter(7, 5).x, VL.tileCenter(7, 5).y]);
  assert.equal(loaded.player.facing, 'down');
  assert.ok(loaded.room && loaded.room.area === 'room', 'the room is rebuilt');
  assert.equal(loaded.dirty, false);
  assert.equal(loaded.fainted, null);
  assert.equal(loaded.visited['room:0,0'], true);
  assert.equal(VL.loadSlot(storage, 0), null, 'an empty slot loads as null');
});

test('a game with no save point, or one whose screen is gone, resumes at the start', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  const storage = VL.createStorage(memoryStorage());
  const state = playState(VL, { area: 'test', screen: '0,0', tx: 8, ty: 2 });
  VL.saveSlot(storage, 0, state);
  const fresh = VL.loadSlot(storage, 0);
  assert.equal(fresh.player.area, VL.START.area);
  assert.equal(fresh.player.screen, VL.START.screen);
  // A later item moved the hut: the player keeps everything and starts outside.
  VL.touchSavePoint(state, { area: 'gone', screen: '9,9', tx: 1, ty: 1 });
  state.flags.kept = true;
  VL.saveSlot(storage, 0, state);
  const moved = VL.loadSlot(storage, 0);
  assert.equal(moved.player.area, VL.START.area);
  assert.equal(moved.flags.kept, true);
  assert.equal(VL.readSlot(storage, 0).status, 'ok');
});

test('readSlot reports empty, ok with a summary, or damaged; a damaged slot can be deleted', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  const backing = memoryStorage();
  const storage = VL.createStorage(backing);
  assert.deepEqual({ ...VL.readSlot(storage, 0) }, { status: 'empty', text: null });
  const state = VL.newGame({ name: 'Kai' });
  state.maxHp = 10;
  state.finished = true;
  VL.saveSlot(storage, 1, state);
  const ok = VL.readSlot(storage, 1);
  assert.equal(ok.status, 'ok');
  assert.deepEqual({ ...ok.summary }, { name: 'Kai', hearts: 5, books: 0, finished: true });
  const damaged = ['{not json', '"42"', '[]', '{"v":1}', '{"v":"1","name":"X"}', '{"v":0,"name":"X"}', '{"v":1,"name":"X","maxHp":"lots"}', '{"v":1,"name":"X","maxHp":0}'];
  for (const text of damaged) {
    backing.setItem(VL.slotKey(2), text);
    assert.equal(VL.readSlot(storage, 2).status, 'damaged', text);
    assert.equal(VL.loadSlot(storage, 2), null, text);
  }
  VL.deleteSlot(storage, 2);
  assert.equal(VL.readSlot(storage, 2).status, 'empty');
  VL.deleteSlot(storage, 1);
  assert.equal(VL.readSlot(storage, 1).status, 'empty');
  assert.equal(backing.map.size, 0);
});

test('saving and reading with blocked storage fails softly', () => {
  const { VL } = loadGame();
  const storage = VL.createStorage(throwingStorage);
  assert.equal(VL.saveSlot(storage, 0, VL.newGame()), false);
  assert.equal(VL.loadSlot(storage, 0), null);
  assert.equal(VL.readSlot(storage, 0).status, 'empty');
  VL.deleteSlot(storage, 0);
});

test('the slot summary reads books through a source the owning item plugs in once', () => {
  const { VL } = loadGame();
  VL.extendGame('library', () => ({ books: ['a', 'b', 'c'] }));
  const save = VL.serializeSave(VL.newGame());
  assert.equal(VL.saveSummary(save).books, 0, 'no source yet');
  VL.slotSource('books', (s) => s.books.length);
  assert.equal(VL.saveSummary(save).books, 3);
  assert.throws(() => VL.slotSource('books', () => 0), /books/);
  assert.throws(() => VL.slotSource('shells', () => 0), /shells/);
});

test('an older save gets the defaults of fields added since, nested objects included', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  const storage = VL.createStorage(memoryStorage());
  const state = VL.newGame({ name: 'Old' });
  state.flags.chest = true;
  VL.saveSlot(storage, 0, state);
  // Two later items land: a new top-level field and a new key inside one the save already has.
  VL.extendGame('satchel', () => ({ satchel: { wood: 0, shells: 0 } }));
  const first = VL.loadSlot(storage, 0);
  assert.deepEqual({ ...first.satchel }, { wood: 0, shells: 0 });
  first.satchel.wood = 4;
  VL.saveSlot(storage, 0, first);
  VL.GAME_EXTENSIONS.pop();
  VL.extendGame('satchel', () => ({ satchel: { wood: 0, shells: 0, paper: 0 } }));
  const second = VL.loadSlot(storage, 0);
  assert.deepEqual({ ...second.satchel }, { wood: 4, shells: 0, paper: 0 });
  assert.equal(second.flags.chest, true);
  assert.equal(second.name, 'Old');
});

test('a committed v1 save still loads after a schema change, through a migration', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  const storage = VL.createStorage(memoryStorage());
  storage.write(VL.slotKey(0), JSON.stringify(fixtureV1()));
  const before = VL.loadSlot(storage, 0);
  assert.equal(before.name, 'Robin');
  assert.equal(before.maxHp, 8);
  assert.equal(before.hp, 8);
  assert.equal(before.flags.chest_hut, true);
  assert.deepEqual({ ...VL.readSlot(storage, 0).summary }, { name: 'Robin', hearts: 4, books: 0, finished: false });

  // The schema change: a later item renames the chest flag. Saves written
  // before it carry an older v and go through the migration on load.
  const next = VL.saveVersion() + 1;
  VL.defineMigration(next, (save) => {
    const flags = { ...save.flags };
    if ('chest_hut' in flags) {
      flags.hutChest = flags.chest_hut;
      delete flags.chest_hut;
    }
    return { ...save, flags };
  });
  assert.equal(VL.saveVersion(), next);
  const after = VL.loadSlot(storage, 0);
  assert.equal(after.flags.hutChest, true);
  assert.equal('chest_hut' in after.flags, false);
  assert.equal(after.maxHp, 8);
  assert.equal(VL.serializeSave(after).v, next, 'saved again at the current version');
  VL.saveSlot(storage, 0, after);
  assert.equal(JSON.parse(storage.read(VL.slotKey(0))).v, next);
  assert.equal(VL.loadSlot(storage, 0).flags.hutChest, true, 'a current save skips the migration');
});

test('migrations are sequential and each version is defined once', () => {
  const { VL } = loadGame();
  assert.equal(VL.saveVersion(), 1);
  assert.throws(() => VL.defineMigration(3, (s) => s), /2/);
  assert.throws(() => VL.defineMigration(1, (s) => s), /1/);
  VL.defineMigration(2, (s) => ({ ...s, two: true }));
  assert.throws(() => VL.defineMigration(2, (s) => s), /2/);
  VL.defineMigration(3, (s) => ({ ...s, three: true }));
  const migrated = VL.migrateSave({ v: 1, name: 'X' });
  assert.equal(migrated.v, 3);
  assert.equal(migrated.two && migrated.three, true);
  assert.equal(VL.migrateSave({ v: 2, name: 'X' }).three, true);
  assert.equal(VL.migrateSave({ v: 2, name: 'X' }).two, undefined, 'starts after its own version');
  assert.throws(() => VL.migrateSave({ v: 4, name: 'X' }), /newer/);
});

test('a save from a newer game reads as newer, never damaged, and is left as it is', () => {
  const { VL } = loadGame();
  const backing = memoryStorage();
  const storage = VL.createStorage(backing);
  const text = JSON.stringify({ v: VL.saveVersion() + 1, name: 'Kai', maxHp: 12, flags: { lots: true }, visited: {} });
  backing.setItem(VL.slotKey(0), text);
  const read = VL.readSlot(storage, 0);
  assert.equal(read.status, 'newer');
  assert.equal(VL.loadSlot(storage, 0), null, 'cannot be played by this page');
  assert.equal(backing.getItem(VL.slotKey(0)), text, 'untouched');
});

test('transient keys, hp and wrong-typed objects in a stored save take the fresh values', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  VL.extendGame('satchel', () => ({ satchel: { wood: 0 } }));
  VL.extendGame('library', () => ({ books: [] }));
  const backing = memoryStorage();
  const storage = VL.createStorage(backing);
  const base = { v: 1, name: 'X', maxHp: 6, flags: {}, visited: {} };
  // A field that was saved once and is transient now (or a hand edit).
  backing.setItem(VL.slotKey(0), JSON.stringify({ ...base, events: 'oops', fainted: { cause: 'shrub' }, hp: 1, player: null, time: 99 }));
  assert.equal(VL.readSlot(storage, 0).status, 'ok');
  const game = VL.loadSlot(storage, 0);
  assert.ok(Array.isArray(game.events), 'events is the fresh list');
  assert.equal(game.fainted, null);
  assert.equal(game.hp, 6);
  assert.equal(game.time, 0);
  assert.equal(game.player.area, VL.START.area);
  // An object or array field holding something else takes the default.
  backing.setItem(VL.slotKey(1), JSON.stringify({ ...base, satchel: null, books: 'none', savePoint: 'hut' }));
  assert.equal(VL.readSlot(storage, 1).status, 'ok');
  const typed = VL.loadSlot(storage, 1);
  assert.deepEqual({ ...typed.satchel }, { wood: 0 });
  assert.deepEqual([...typed.books], []);
  assert.equal(typed.player.area, VL.START.area, 'a bad save point means the start');
  // A number over a nested object default too.
  backing.setItem(VL.slotKey(2), JSON.stringify({ ...base, satchel: 5 }));
  assert.deepEqual({ ...VL.loadSlot(storage, 2).satchel }, { wood: 0 });
});

test('a saved field whose kind changed without a migration takes the default and is reported, either way round', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  // W5 saved satchel.wood as a number; a later item made it an object. Another item made coins a number.
  VL.extendGame('satchel', () => ({ satchel: { wood: { count: 0, metal: false } } }));
  VL.extendGame('coins', () => ({ coins: 0 }));
  const storage = VL.createStorage(memoryStorage());
  const savePoint = { area: 'test', screen: '0,0', tx: 8, ty: 2, facing: 'down' };
  const old = { v: 1, name: 'Robin', maxHp: 8, flags: { a: true }, visited: {}, savePoint, satchel: { wood: 3 }, coins: { gold: 5 } };
  storage.write(VL.slotKey(0), JSON.stringify(old));
  const read = VL.readSlot(storage, 0);
  assert.equal(read.status, 'ok');
  assert.deepEqual([...read.resets].sort(), ['coins', 'satchel.wood'], 'every reset is named by path');
  const game = VL.loadSlot(storage, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(game.satchel.wood)), { count: 0, metal: false });
  assert.equal(game.coins, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(game.savePoint)), savePoint, 'a null default takes any kind');
  VL.saveSlot(storage, 1, game);
  assert.deepEqual([...VL.readSlot(storage, 1).resets], [], 'a save at the current shape resets nothing');
});

test('a field left undefined is not written and takes its default on load', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  const storage = VL.createStorage(memoryStorage());
  const state = VL.newGame({ name: 'U' });
  state.savePoint = undefined;
  const save = VL.serializeSave(state);
  assert.equal('savePoint' in save, false);
  VL.saveSlot(storage, 0, state);
  assert.equal(VL.loadSlot(storage, 0).savePoint, null);
});

test('the v1 fixture is frozen: the W2-era save, never regenerated', () => {
  const fixture = fixtureV1();
  assert.equal(fixture.v, 1);
  assert.equal(fixture.name, 'Robin');
  assert.deepEqual(Object.keys(fixture).sort(), ['finished', 'flags', 'maxHp', 'name', 'rngState', 'savePoint', 'v', 'visited'], 'the fields W2 saved; a later schema adds a new save-v<N>-<item>.json fixture instead');
});

test('every committed fixture loads through the real migrations and defaults', () => {
  const { VL } = loadGame();
  const files = fixtureFiles();
  assert.ok(files.includes('save-v1.json'));
  for (const file of files) {
    const fixture = readFixture(file);
    assert.ok(Number.isInteger(fixture.v) && fixture.v >= 1 && fixture.v <= VL.saveVersion(), `${file}: v ${fixture.v}`);
    const backing = memoryStorage();
    const storage = VL.createStorage(backing);
    const text = JSON.stringify(fixture);
    backing.setItem(VL.slotKey(0), text);
    const read = VL.readSlot(storage, 0);
    assert.equal(read.status, 'ok', `${file} reads ok`);
    assert.equal(read.summary.name, fixture.name, file);
    // A field that silently took its default is the R2 failure: a kind change needs a migration.
    assert.deepEqual([...read.resets], [], `${file}: a saved field changed kind without a migration`);
    if (fixture.v === VL.saveVersion()) {
      for (const [key, value] of Object.entries(fixture)) assert.deepEqual(JSON.parse(JSON.stringify(read.save[key])), value, `${file}: ${key} survives a load`);
    }
    const game = VL.loadSlot(storage, 0);
    assert.ok(game, `${file} loads`);
    assert.equal(game.name, fixture.name);
    assert.equal(game.hp, game.maxHp);
    assert.equal(backing.getItem(VL.slotKey(0)), text, `${file}: reading never writes`);
    assert.equal(VL.serializeSave(game).v, VL.saveVersion(), `${file} saves again at the current version`);
  }
});

test('extendGame with transient: true adds play state that is never saved and resets on load', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  VL.extendGame('enemies', () => ({ knockback: null, cooldown: 0 }), { transient: true });
  VL.extendGame('satchel', () => ({ satchel: { wood: 0 } }));
  assert.ok(VL.TRANSIENT_FIELDS.includes('knockback') && VL.TRANSIENT_FIELDS.includes('cooldown'));
  const storage = VL.createStorage(memoryStorage());
  const state = playState(VL, { area: 'test', screen: '0,0', tx: 8, ty: 2 });
  assert.equal(state.cooldown, 0);
  state.cooldown = 3;
  state.satchel.wood = 2;
  const save = VL.serializeSave(state);
  assert.equal('cooldown' in save, false);
  assert.equal('knockback' in save, false);
  assert.equal(save.satchel.wood, 2);
  VL.saveSlot(storage, 0, state);
  const loaded = VL.loadSlot(storage, 0);
  assert.equal(loaded.cooldown, 0);
  assert.equal(loaded.knockback, null);
  assert.equal(loaded.satchel.wood, 2);
  VL.extendGame('again', () => ({ cooldown: 1 }));
  assert.throws(() => VL.createGame(), /cooldown/, 'a saved field cannot shadow a transient one');
});

test('a transient extension names the same fields for every game, or a key would leak into the save', () => {
  const { VL } = loadGame();
  VL.extendGame('aiming', (options) => (options.name ? { aim: null } : {}), { transient: true });
  assert.throws(() => VL.newGame({ name: 'Kai' }), /aim/);
});

test('every saved field is JSON-safe, for a new game and after the playthrough', () => {
  const context = loadGame();
  const { VL } = context;
  const JSONvm = vm.runInContext('JSON', context);
  const checkFields = (state, label) => {
    for (const key of Object.keys(state)) {
      if (VL.TRANSIENT_FIELDS.includes(key)) continue;
      const value = state[key];
      assert.notEqual(value, undefined, `${label}: ${key} is undefined (use null)`);
      assert.deepEqual(JSONvm.parse(JSONvm.stringify(value)), value, `${label}: ${key} does not survive JSON`);
    }
  };
  checkFields(VL.createGame(), 'a new game');
  const play = createPlaythrough(VL);
  const ids = play.drivable();
  checkFields(play.playTo(ids[ids.length - 1]).state, `after ${ids[ids.length - 1]}`);
  VL.extendGame('shells', () => ({ shellsTaken: new Set() }));
  assert.throws(() => checkFields(VL.createGame(), 'a Set'), /shellsTaken/);
});

// ---------- earning, save points, fainting ----------

test('earning marks the game dirty and raises an event; a save point is an earning too', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  const state = playState(VL, { area: 'test', screen: '0,0', tx: 8, ty: 2 });
  assert.equal(state.dirty, false);
  VL.earned(state);
  assert.equal(state.dirty, true);
  assert.ok(state.events.some((e) => e.type === 'earned'));
  state.dirty = false;
  VL.touchSavePoint(state, { area: 'test', screen: '0,0', tx: 8, ty: 2 });
  assert.deepEqual({ ...state.savePoint }, { area: 'test', screen: '0,0', tx: 8, ty: 2, facing: 'down' });
  assert.equal(state.dirty, true);
  assert.ok(state.events.some((e) => e.type === 'saved'));
});

test('standing on a savePoint entity sets the save point', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  VL.AREAS.test.screens['0,0'].entities.push({ type: 'savePoint', x: 8, y: 1 });
  const state = playState(VL, { area: 'test', screen: '0,0', tx: 8, ty: 2 });
  hold(VL, state, ['up'], 0.3);
  assert.equal(state.savePoint.area, 'test');
  assert.deepEqual([state.savePoint.tx, state.savePoint.ty], [8, 1]);
  assert.equal(state.dirty, true);
});

test('fainting keeps everything earned and respawns at the save point with full hearts', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  VL.extendGame('satchel', () => ({ satchel: { wood: 0 } }));
  const state = playState(VL, { area: 'test', screen: '0,0', tx: 8, ty: 2 });
  state.satchel.wood = 4;
  VL.touchSavePoint(state, { area: 'room', screen: '0,0', tx: 7, ty: 5 });
  VL.place(state, { area: 'test', screen: '1,0', tx: 8, ty: 2 });
  VL.faint(state, 'shrub');
  assert.equal(state.hp, 0);
  assert.equal(state.fainted.cause, 'shrub');
  VL.respawn(state);
  assert.equal(state.hp, state.maxHp);
  assert.equal(state.fainted, null);
  assert.equal(state.satchel.wood, 4);
  assert.equal(state.player.area, 'room');
  assert.equal(state.player.screen, '0,0');
  assert.deepEqual([state.player.x, state.player.y], [VL.tileCenter(7, 5).x, VL.tileCenter(7, 5).y]);
  assert.equal(state.player.moving, false);
  assert.equal(state.transition, null);
});

test('faint lines: a default, the shrub, and items add their own once', () => {
  const { VL } = loadGame();
  assert.equal(typeof VL.faintLine('default'), 'string');
  assert.match(VL.faintLine('shrub'), /shrub/);
  assert.equal(VL.faintLine('mystery'), VL.faintLine('default'));
  VL.addFaintLine('boulder', 'A boulder rolled you flat.');
  assert.equal(VL.faintLine('boulder'), 'A boulder rolled you flat.');
  assert.throws(() => VL.addFaintLine('boulder', 'again'), /boulder/);
  for (const [cause, line] of Object.entries(VL.FAINT_LINES)) {
    assert.deepEqual([...VL.ART.missingGlyphs(line)], [], cause);
  }
});

test('the hut has a save point on a walkable tile', () => {
  const { VL } = loadGame();
  const hut = VL.AREAS.hut.screens['0,0'];
  const point = hut.entities.find((e) => e.type === 'savePoint');
  assert.ok(point, 'a savePoint entity in the hut');
  assert.equal(VL.isSolidAt('hut', '0,0', point.x, point.y), false);
});

test('README documents saving', () => {
  const readme = read('README.md');
  for (const word of ['vanishing-library-slot-', 'VL.defineMigration', 'VL.saveVersion', 'VL.earned', 'VL.touchSavePoint', 'VL.slotSource', 'VL.faint', 'save-v1.json', 'VL.extendGame']) {
    assert.ok(readme.includes(word), `README mentions ${word}`);
  }
});
