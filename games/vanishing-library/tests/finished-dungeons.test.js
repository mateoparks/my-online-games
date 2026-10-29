// W31, finished dungeons wake him at home: once a dungeon's boss is beaten
// and its heart taken, a save point in it (its entrance statue, or the
// doorstep the warp out saves) hands on to the hut's lantern for every
// Continue, reload and faint (design: Starting and saving). Every dungeon
// with a boss gets this from the framework, the wreck keeps its harbour, and
// the shockwave after the Hollow Oak still starts where it always did.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, loadGame, memoryStorage, heroTile } = require('./harness');
const { createPlaythrough } = require('./playthrough');

const plain = (value) => JSON.parse(JSON.stringify(value));
const shared = loadGame().VL;
const BOSS_DUNGEONS = Object.values(shared.DUNGEONS).filter((d) => d.boss).map((d) => d.id);

function statueOf(VL, id) {
  const { area } = VL.DUNGEONS[id];
  const [screen, statue] = Object.entries(VL.AREAS[area].screens).flatMap(([key, s]) => s.entities.filter((e) => e.type === 'saveStatue').map((e) => [key, e]))[0];
  return { area, screen, tx: statue.x, ty: statue.y, facing: 'down' };
}

// Every boss beaten before this one, so the game is in a state play can
// reach: the shockwave has happened once the Hollow Oak is behind him.
function storyBefore(VL, game, id) {
  for (const other of BOSS_DUNGEONS) {
    if (other === id) break;
    VL.dungeonState(game, other).boss = true;
    VL.markFound(game, VL.DUNGEONS[other].boss.heart);
  }
  if (BOSS_DUNGEONS.indexOf(id) > BOSS_DUNGEONS.indexOf('hollowOak')) {
    Object.assign(game.flags, { shockwaveDue: true, shockwave: true, shockwaveWoke: true, 'gave:helperWood': true });
    game.afterThornbackDone = ['shockwave'];
  }
}

// A saved game in slot 0 whose save point is `point`, in play, with `stage`
// of this dungeon done: 'none', 'boss' (beaten, heart on the floor) or 'done'.
function savedAt(id, point, stage, edit = () => {}) {
  const { VL } = loadGame();
  const game = VL.createGame({ name: 'Robin' });
  storyBefore(VL, game, id);
  if (stage !== 'none') VL.dungeonState(game, id).boss = true;
  if (stage === 'done') VL.markFound(game, VL.DUNGEONS[id].boss.heart);
  if (id === 'hollowOak' && stage === 'done') Object.assign(game.flags, { shockwaveDue: true, shockwave: true, shockwaveWoke: true, 'gave:helperWood': true });
  game.savePoint = { ...point };
  edit(VL, game);
  const storage = VL.createStorage(memoryStorage({ [VL.slotKey(0)]: JSON.stringify(VL.serializeSave(game)) }));
  const app = VL.createApp({ storage });
  app.startGame(VL.loadSlot(storage, 0), 0);
  app.setScene('play');
  return { VL, storage, app, drive: createPlaythrough(VL, { app }).drive };
}

const woke = (VL, state) => [state.player.area, state.player.screen, ...heroTile(VL, state)];
const at = (place) => [place.area, place.screen, place.tx, place.ty];

// Continue from the title, a plain reload, Save & Quit then Continue, and a
// faint far away played through its scene with a key press.
function everyWake({ VL, storage, drive }) {
  const wakes = {};
  wakes.continue = woke(VL, VL.loadSlot(storage, 0));
  drive.reload();
  wakes.reload = woke(VL, drive.state);
  drive.closePopups();
  drive.app.save();
  drive.reload();
  wakes.saveAndQuit = woke(VL, drive.state);
  drive.closePopups();
  VL.place(drive.state, { area: 'overworld', screen: '5,2', tx: 5, ty: 6, facing: 'down' });
  VL.faint(drive.state, 'crab');
  drive.update();
  drive.hold([], 0.7);
  drive.press('interact');
  drive.hold([], 0.2);
  wakes.faint = woke(VL, drive.state);
  return wakes;
}

const all = (place) => ({ continue: at(place), reload: at(place), saveAndQuit: at(place), faint: at(place) });

test('the hut\'s lantern is VL.HOME_SAVE, and every dungeon with a boss is covered here, the Lair too', () => {
  const VL = shared;
  const lantern = VL.getScreen('hut', '0,0').entities.find((e) => e.type === 'savePoint');
  assert.deepEqual(plain(VL.HOME_SAVE), { area: 'hut', screen: '0,0', tx: lantern.x, ty: lantern.y, facing: 'down' });
  for (const id of ['scriptorium', 'hollowOak', 'lighthouse', 'lair']) assert.ok(BOSS_DUNGEONS.includes(id), id);
  assert.ok(!BOSS_DUNGEONS.includes('wreck'), 'the wreck has no boss; it keeps W17\'s harbour rule');
});

for (const id of BOSS_DUNGEONS) {
  test(`${id}: before it is finished, every Continue, reload and faint wakes him at its entrance statue`, () => {
    const statue = statueOf(shared, id);
    for (const stage of ['none', 'boss']) {
      const t = savedAt(id, statue, stage);
      assert.deepEqual(everyWake(t), all(statue), `${stage === 'none' ? 'the boss not yet beaten' : 'the boss beaten, the heart still on the floor'}`);
      assert.deepEqual(plain(t.drive.state.savePoint), statue, 'the save point itself is kept');
    }
  });

  test(`${id}: once finished (boss beaten, heart taken), every Continue, reload and faint wakes him at the hut's lantern, from the statue or the doorstep the warp saved`, () => {
    for (const point of [statueOf(shared, id), plain(shared.DUNGEONS[id].entrance)]) {
      const t = savedAt(id, point, 'done');
      assert.deepEqual(everyWake(t), all(shared.HOME_SAVE), `saved at ${at(point).join(' ')}`);
      assert.equal(t.drive.state.player.facing, 'down');
    }
  });

  test(`${id}: once finished, touching its statue again still saves, and a faint inside it wakes him at home`, () => {
    const t = savedAt(id, shared.HOME_SAVE, 'done');
    const { VL, drive } = t;
    const statue = statueOf(VL, id);
    VL.place(drive.state, { ...statue, ty: statue.ty + 1, facing: 'up' });
    drive.state.room.entities = drive.state.room.entities.filter((e) => !VL.isEnemy(e));
    drive.until((state) => state.savePoint?.area === statue.area, 1, ['up']);
    assert.deepEqual(plain(drive.state.savePoint), statue);
    VL.faint(drive.state, 'crab');
    VL.respawn(drive.state);
    assert.deepEqual(woke(VL, drive.state), at(VL.HOME_SAVE));
  });
}

test('a finished dungeon moves only its own save points: an unfinished dungeon\'s statue, the hut and the overworld stay put', () => {
  const statue = statueOf(shared, 'lighthouse');
  const t = savedAt('lighthouse', statue, 'none');
  assert.ok(shared.DUNGEONS.scriptorium && t.VL.bossDone(t.app.game, 'scriptorium'), 'the Scriptorium is finished in this game');
  assert.deepEqual(everyWake(t), all(statue));
  const place = { area: 'overworld', screen: '1,1', tx: 8, ty: 5, facing: 'down' };
  assert.deepEqual(woke(t.VL, savedAt('lighthouse', place, 'done').app.game), at(place));
});

test('the wreck keeps W17\'s harbour once its page is found, with every boss dungeon finished', () => {
  const { VL } = loadGame();
  const point = { area: 'wreck', screen: '0,0', tx: 7, ty: 3, facing: 'down' };
  const t = savedAt(BOSS_DUNGEONS[BOSS_DUNGEONS.length - 1], point, 'done', (_, game) => {
    game.flags['found:pageShipwreck'] = true;
  });
  assert.deepEqual(everyWake(t), all(plain(VL.WRECK_HOME)));
});

// The shockwave (W16; W30 ratify 2): until it has happened, the Hollow Oak
// keeps its save point, the statue or the doorstep the warp out saves, so a
// reload in the breath after the heart (or an old save from before W16)
// still starts the rumble where he was, not at home.
for (const [where, point] of [['statue', statueOf(shared, 'hollowOak')], ['doorstep', plain(shared.DUNGEONS.hollowOak.entrance)]]) {
  test(`the Hollow Oak before the shockwave: beaten and its heart taken, a reload still wakes him at the ${where} and the shockwave starts there`, () => {
    const t = savedAt('hollowOak', point, 'done', (_, game) => {
      for (const flag of ['shockwave', 'shockwaveWoke', 'gave:helperWood']) delete game.flags[flag];
    });
    const { VL, drive } = t;
    assert.deepEqual(woke(VL, VL.loadSlot(t.storage, 0)), at(point), 'Continue');
    drive.reload();
    assert.deepEqual(woke(VL, drive.state), at(point), 'reload');
    drive.until(() => drive.app.sceneId === 'shockwave', 3);
    assert.equal(drive.app.shockwave.phase, 'rumble');
    assert.deepEqual(woke(VL, drive.state), at(point), 'the ground shakes where he woke');
  });
}

test('the W15 fixture (the Thornback beaten and its heart taken, before W16) still continues at the Hollow Oak\'s statue', () => {
  const { VL } = loadGame();
  for (const name of ['save-v1-W15.json', 'save-v1-W15-after.json']) {
    const storage = VL.createStorage(memoryStorage({ [VL.slotKey(0)]: fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8') }));
    assert.deepEqual(woke(VL, VL.loadSlot(storage, 0)), at(statueOf(VL, 'hollowOak')), name);
  }
});

test('after the shockwave he wakes in the hut where Gran found him, exactly as before', () => {
  const { VL } = loadGame();
  const storage = VL.createStorage(memoryStorage({ [VL.slotKey(0)]: fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v1-W16.json'), 'utf8') }));
  assert.deepEqual(woke(VL, VL.loadSlot(storage, 0)), at(VL.SHOCKWAVE_WAKE));
});

test('the W18 fixture (saved at the Lighthouse statue, the Lens Crab beaten and its heart taken) continues at the hut\'s lantern', () => {
  const { VL } = loadGame();
  const text = fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v1-W18.json'), 'utf8');
  assert.deepEqual(plain(JSON.parse(text).savePoint), statueOf(VL, 'lighthouse'), 'the fixture is saved at the statue');
  const storage = VL.createStorage(memoryStorage({ [VL.slotKey(0)]: text }));
  const game = VL.loadSlot(storage, 0);
  assert.deepEqual(woke(VL, game), at(VL.HOME_SAVE));
  assert.deepEqual(plain(game.savePoint), statueOf(VL, 'lighthouse'), 'nothing in the save is rewritten');
});

test('W31 saves nothing new: no game field was added', () => {
  const { VL } = loadGame();
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v1-W18.json'), 'utf8'));
  // Fields added since, each with its own fixture: W34's crab count
  // (save-v1-W34.json) and W37's look (save-v1-W37.json).
  const later = ['crabs', 'look'];
  assert.deepEqual(Object.keys(VL.serializeSave(VL.createGame({ name: 'Robin' }))).filter((key) => !(key in fixture) && !later.includes(key)), []);
});
