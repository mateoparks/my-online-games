// Dungeon 1, the Old Scriptorium (W14): the door the librarian's key opens,
// the rooms and their lints, the locks in the table, the Bookworm's fight,
// the rewards, the fixture, a playthrough one lock at a time with a faint
// after each, and a render smoke of every room.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, loadGame, memoryStorage, fakeDocument, read } = require('./harness');
const { createPlaythrough, registry } = require('./playthrough');
const { route, ROUTE } = require('./scriptorium-route');

const STEP = 1 / 60;
const plain = (value) => JSON.parse(JSON.stringify(value));
const scr = (screen, tx, ty, facing) => ({ area: 'scriptorium', screen, tx, ty, facing });

function setup({ where, storage = false, enemies = false, gloves = true } = {}) {
  const { VL } = loadGame();
  let app = storage ? VL.createApp({ storage: VL.createStorage(memoryStorage()) }) : VL.createApp();
  if (storage) {
    app.startGame(VL.newGame({ name: 'Robin' }), 0, { fresh: true });
    app.save();
  } else app.game = VL.newGame({ name: 'Robin' });
  app.setScene('play');
  app.game.popups.seen.controls = true;
  if (gloves) app.game.items.liftingGloves = true;
  const t = {
    VL,
    get app() {
      return app;
    },
    get game() {
      return app.game;
    },
    get d() {
      return VL.dungeonState(app.game, 'scriptorium');
    },
    place(place) {
      VL.place(app.game, place);
      if (!enemies) app.game.room.entities = app.game.room.entities.filter((e) => !VL.isEnemy(e) || e.type === 'bookworm');
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
    find: (type) => app.game.room.entities.find((e) => e.type === type),
    close() {
      t.step();
      for (let i = 0; i < 8 && app.sceneId === 'popup'; i += 1) {
        t.hold([], 0.4);
        t.press('interact');
      }
    },
    reload(place) {
      app = VL.reloadApp(app);
      if (place) t.place(place);
    },
  };
  if (where) t.place(where);
  return t;
}

// ---------- the way in ----------

test('the Scriptorium door: shut without the librarian\'s key (S and walking into it say why), open with it', () => {
  const t = setup({ where: { area: 'overworld', screen: '2,-2', tx: 8, ty: 4, facing: 'up' } });
  const { VL } = t;
  const door = t.game.room.entities.find((e) => e.type === 'door' && e.spot === 'scriptoriumDoor');
  assert.equal(door.solid, true);
  t.press('interact');
  assert.match(t.game.message.text, /great door is locked/);
  t.close();
  t.hold(['up'], 0.4);
  assert.equal(t.game.player.area, 'overworld', 'the hero stays outside');
  assert.match(t.game.message.text, /great door is locked/, 'walking into it says why');
  t.close();
  t.hold(['up'], 0.4);
  assert.equal(t.app.sceneId, 'play', 'once per visit');
  t.game.items.scriptoriumKey = true;
  t.place({ area: 'overworld', screen: '2,-2', tx: 8, ty: 4, facing: 'up' });
  assert.equal(VL.LOCKS.scriptoriumEntered.reached(t.game), false);
  t.until((g) => g.player.area === 'scriptorium', 1, ['up']);
  assert.deepEqual([t.game.player.screen, VL.heroTile(t.game).tx, VL.heroTile(t.game).ty], ['1,0', 7, 9]);
  assert.ok(VL.LOCKS.scriptoriumEntered.reached(t.game));
  // And out again by the mat.
  t.until((g) => g.player.area === 'overworld', 1, ['down']);
  assert.deepEqual([t.game.player.screen, VL.heroTile(t.game).tx, VL.heroTile(t.game).ty], ['2,-2', 8, 4]);
});

test('the statue by the entrance saves and is where a faint wakes the hero', () => {
  const t = setup({ where: scr('1,0', 3, 4, 'up'), storage: true });
  t.until((g) => g.savePoint?.area === 'scriptorium', 1, ['up']);
  t.VL.faint(t.game, 'bookworm');
  t.step();
  t.hold([], 0.7);
  t.press('interact');
  assert.deepEqual([t.game.player.screen, t.VL.heroTile(t.game).tx, t.VL.heroTile(t.game).ty], ['1,0', 3, 2]);
});

// ---------- the layout ----------

test('seven rooms in a readable layout, no gap a chicken could fly, and the framework\'s lints pass', () => {
  const { VL } = loadGame();
  const rooms = Object.keys(VL.AREAS.scriptorium.screens);
  assert.ok(rooms.length >= 6 && rooms.length <= 10, `${rooms.length} rooms`);
  assert.deepEqual(plain(rooms.sort()), ['0,0', '1,-1', '1,-2', '1,0', '2,-1', '2,0', '3,0']);
  const legend = VL.TILESETS.scriptorium;
  assert.deepEqual(Object.keys(legend).filter((ch) => legend[ch].flyOver), []);
  assert.deepEqual([...VL.dungeonProblems()], []);
  assert.equal(VL.DUNGEONS.scriptorium.boss.type, 'bookworm');
  // One of each: the map, the statue, two small keys and their doors, the boss key and door.
  const all = rooms.flatMap((key) => VL.getScreen('scriptorium', key).entities);
  const count = (type) => all.filter((e) => e.type === type).length;
  assert.equal(count('dungeonMap'), 1);
  assert.equal(count('saveStatue'), 1);
  assert.equal(count('smallKey'), 2);
  assert.equal(new Set(all.filter((e) => e.type === 'lockedDoor' && e.kind === 'small').map((e) => e.id)).size, 2);
  assert.equal(count('bossKey'), 1);
  assert.equal(count('pushBlock'), 1);
  assert.equal(count('bigChest'), 1);
  assert.ok(all.some((e) => e.type === 'copyable' && e.copy === 'woodsMapCopy' && e.look === 'mural'), 'the Woods mural hangs in the gallery');
  assert.ok(all.some((e) => e.type === 'ore' && e.id === 'oreScriptorium'));
});

test('before the gloves only the first door can take the first key: the pit room, door B and the copying hall lie past rocks', () => {
  const { VL } = loadGame();
  const { findPath } = require('./playthrough');
  const game = VL.newGame();
  VL.place(game, scr('1,0', 7, 8));
  const from = scr('1,0', 7, 8);
  for (const target of [scr('2,0', 7, 5), scr('3,0', 5, 5), scr('2,-1', 7, 9)]) {
    VL.dungeonState(game, 'scriptorium').doors.d1DoorA = true;
    const route = findPath(VL, from, target, game);
    assert.equal(route, null, `${target.screen} (${target.tx},${target.ty}) is behind a rock`);
  }
  assert.ok(findPath(VL, from, scr('2,-1', 7, 7), game), 'the vault is through door A');
});

// ---------- the progression table ----------

test('every Scriptorium lock is claimed or added; the gloves and the boss say why their needs grew; the whole path solves', () => {
  const { VL } = loadGame();
  for (const id of ['scriptoriumEntered', 'liftingGloves', 'oreScriptorium', 'woodsMural', 'd1Boss', 'd1KeyA', 'd1DoorA', 'd1KeyB', 'd1DoorB', 'd1BossKey', 'd1BossDoor']) {
    assert.ok(VL.LOCKS[id]?.reached, `${id} is implemented`);
  }
  for (const id of ['scriptoriumEntered', 'oreScriptorium', 'woodsMural']) assert.equal(VL.LOCKS[id].replan, undefined, `${id} keeps the plan`);
  assert.match(VL.LOCKS.liftingGloves.replan, /behind the first locked door/);
  assert.deepEqual(plain(VL.LOCKS.liftingGloves.needs), ['scriptoriumEntered', 'd1DoorA']);
  assert.match(VL.LOCKS.d1Boss.replan, /boss door/);
  assert.deepEqual(plain(VL.LOCKS.d1Boss.gives), ['mortarPestle', 'heartD1']);
  assert.equal(VL.LOCKS.d1Boss.supplies.books, 3);
  assert.deepEqual(plain(VL.LOCKS.oreScriptorium.needs), ['scriptoriumEntered', 'liftingGloves'], 'the ore lies past the gloves');
  assert.deepEqual([...VL.solveProgression().problems], []);
});

test('the solver: a key used up before an event is not asked for again after it (the Scriptorium\'s doors after the shockwave)', () => {
  const { VL } = loadGame();
  const report = VL.solveProgression();
  assert.ok(report.stages.length > 1, 'the shockwave is a stage');
  const after = report.stages[1];
  for (const id of ['d1KeyA', 'd1DoorA']) assert.ok([...after.disabled].includes(id), `${id} is used up before the shockwave`);
  assert.deepEqual([...report.problems].filter((p) => p.includes('smallKey:scriptorium')), []);
  // Still caught before an event: a door that wastes the only key.
  const table = Object.fromEntries(Object.entries(VL.LOCKS).map(([id, lock]) => [id, { ...lock, needs: lock.needs.slice(), consumes: { ...lock.consumes }, supplies: { ...lock.supplies } }]));
  table.d1DoorB = { ...table.d1DoorB, needs: ['scriptoriumEntered'] };
  const problems = [...VL.solveProgression(table).problems];
  assert.ok(problems.some((p) => p.startsWith('d1DoorA needs 1 smallKey:scriptorium')), problems.join('\n'));
});

// ---------- the Bookworm ----------

function bossRoom() {
  const t = setup({ where: scr('1,-2', 7, 9, 'up'), storage: true });
  t.d.doors.d1BossDoor = true;
  return t;
}
const wormOf = (t) => t.find('bookworm');
const tileOf = (t, w) => t.VL.tileOf(w.at.x, w.at.y);

test('the Bookworm burrows, rumbles, rears up and dives on a readable beat, harmless except while it is up', () => {
  const t = bossRoom();
  const worm = wormOf(t);
  assert.ok(worm.boss, 'marked as the boss');
  const seen = [];
  for (let s = 0; s < 12; s += STEP) {
    t.step();
    if (seen.at(-1)?.mode !== worm.mode) seen.push({ mode: worm.mode, at: tileOf(t, worm), harmful: t.VL.enemyHarmful(worm) });
    t.game.hp = t.game.maxHp;
  }
  assert.deepEqual(seen.slice(0, 5).map((s) => s.mode), ['under', 'rumble', 'up', 'down', 'under']);
  for (const s of seen) assert.equal(s.harmful, s.mode === 'up' && s.harmful, `${s.mode} ${s.harmful}`);
  assert.deepEqual([seen[1].at.tx, seen[1].at.ty], [7, 5], 'first up at its own hole');
  // Every hole it uses is a hole tile.
  for (const s of seen) assert.ok(t.VL.tileInfo('scriptorium', t.VL.getScreen('scriptorium', '1,-2').tiles[s.at.ty][s.at.tx]).hole);
});

test('it surfaces at the hole nearest the hero, never the one he stands on, and spits one paper wad each time it is up', () => {
  const t = bossRoom();
  const { VL } = t;
  const worm = wormOf(t);
  worm.at = { x: 7 * 16 + 8, y: 5 * 16 + 8 };
  t.game.player.x = 4 * 16 + 8;
  t.game.player.y = 7 * 16 + 12;
  assert.deepEqual(plain(VL.tileOf(VL.bookwormNextHole(t.game, worm).x, VL.bookwormNextHole(t.game, worm).y)), { tx: 4, ty: 3 }, 'not (4,7) under him');
  t.game.player.x = 9 * 16 + 8;
  t.game.player.y = 7 * 16 + 12;
  assert.deepEqual(plain(VL.tileOf(VL.bookwormNextHole(t.game, worm).x, VL.bookwormNextHole(t.game, worm).y)), { tx: 11, ty: 7 });
  t.until(() => worm.mode === 'up', 4);
  t.until(() => worm.mode !== 'up', 4);
  assert.equal(t.game.room.entities.filter((e) => e.type === 'projectile' && e.sprite === 'shot-paper').length <= 1, true);
});

test('a sword bounces off its paper armour; three thrown pots beat it, and it is marked beaten before it leaves the room', () => {
  const t = bossRoom();
  const { VL } = t;
  const worm = wormOf(t);
  t.until(() => worm.mode === 'up', 4);
  VL.hitEnemy(t.game, worm, 2, { x: worm.cx, y: worm.cy + 20 });
  assert.equal(worm.hits, 0, 'a sword does not count');
  assert.equal(worm.hp, VL.ENEMIES.bookworm.hp);
  assert.match(t.game.dungeonNote.text, /too tough for a sword/);
  for (let i = 0; i < VL.TUNING.bookwormHits; i += 1) {
    t.until(() => worm.mode === 'up', 8);
    worm.struckBy = 'throw';
    VL.hitEnemy(t.game, worm, VL.TUNING.liftThrowDamage, { x: worm.cx, y: worm.cy + 20 });
    worm.struckBy = null;
    assert.equal(worm.hits, i + 1);
    assert.equal(VL.bossBeaten(t.game, 'scriptorium'), false, 'not before it is gone');
    if (i < VL.TUNING.bookwormHits - 1) {
      assert.equal(worm.mode, 'hurt');
      t.until(() => worm.mode === 'under', 2);
    }
  }
  assert.equal(worm.mode, 'dying');
  t.until(() => VL.bossBeaten(t.game, 'scriptorium'), VL.TUNING.bookwormDyingSeconds + 0.5);
  assert.equal(worm.defeated, true);
  assert.ok(!t.game.room.entities.includes(worm));
});

test('a pot thrown at the risen head counts; one thrown while it is underground flies over the hole', () => {
  const t = bossRoom();
  const { VL } = t;
  const worm = wormOf(t);
  t.game.player.x = 7 * 16 + 8;
  t.game.player.y = 7 * 16 + 12;
  t.game.player.facing = 'up';
  t.game.player.lifted = { kind: 'pot', since: -1, t: 1 };
  t.press('interact');
  t.until((g) => !g.room.entities.some((e) => e.type === 'liftThrown'), 2);
  assert.equal(worm.hits, 0, 'nothing to hit while it is under the floor');
  t.until(() => worm.mode === 'up', 4);
  t.game.player.lifted = { kind: 'pot', since: -1, t: 1 };
  t.press('interact');
  t.until(() => worm.hits === 1, 1);
});

test('beating it: the heart container where it began, the warp out, the Mortar & Pestle and a bundle of three books, all saved', () => {
  const t = bossRoom();
  const { VL } = t;
  const worm = wormOf(t);
  worm.hits = VL.TUNING.bookwormHits - 1;
  t.until(() => worm.mode === 'up', 4);
  worm.struckBy = 'throw';
  VL.hitEnemy(t.game, worm, 2, { x: worm.cx, y: worm.cy + 20 });
  t.until(() => VL.bossBeaten(t.game, 'scriptorium'), 3);
  assert.ok(VL.hasItem(t.game, 'mortarPestle'), 'the Mortar & Pestle');
  for (const id of VL.BOOKWORM_BUNDLE) assert.ok(VL.booksCarried(t.game).includes(id), `${id} is carried`);
  assert.match(t.game.message.text, /three books/);
  const heart = t.game.room.entities.find((e) => e.type === 'heartContainer');
  assert.deepEqual([heart.id, heart.x, heart.y], ['heartD1', 7, 5]);
  assert.deepEqual([t.find('warp').x, t.find('warp').y], [7, 8]);
  assert.equal(t.find('shutter').closed, false, 'the bars behind him lift');
  t.reload(scr('1,-2', 6, 6, 'up'));
  assert.ok(VL.LOCKS.d1Boss.reached(t.game));
  assert.ok(VL.hasItem(t.game, 'mortarPestle'));
  assert.equal(t.find('bookworm'), undefined, 'gone for good');
  assert.ok(t.find('heartContainer'), 'the heart waits until taken');
  // The library counts the bundle once it is handed in.
  const before = VL.booksReturned(t.game);
  VL.returnBooks(t.game);
  assert.equal(VL.booksReturned(t.game), before + 3);
});

test('shut in with the Bookworm, the hero can always faint his way out (it bites while it is up)', () => {
  const t = bossRoom();
  t.place(scr('1,-2', 7, 6, 'up'));
  t.game.room.entities = t.game.room.entities.filter((e) => e.type !== 'pot');
  t.game.hp = 1;
  t.until((g) => g.hp <= 0 || t.app.sceneId === 'fainted', 20);
});

// ---------- saving ----------

test('the W14 fixture loads with the Scriptorium played through and a boulder lifted, no field reset', () => {
  const { VL } = loadGame();
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v1-W14.json'), 'utf8'));
  const d = fixture.dungeons.scriptorium;
  assert.ok(d.boss && d.bossKey && d.map && d.doors.d1DoorA && d.doors.d1DoorB && d.doors.d1BossDoor && d.plates.d1PlateGallery && d.switches.d1SwitchPit && d.switches.d1SwitchDesk);
  assert.equal(fixture.tileChanges['overworld:4,0']['5,5'], 'P');
  const backing = memoryStorage({ [VL.slotKey(0)]: JSON.stringify(fixture) });
  const result = VL.readSlot(VL.createStorage(backing), 0);
  assert.deepEqual(plain(result.resets || []), []);
  const game = VL.loadSlot(VL.createStorage(backing), 0);
  assert.deepEqual(plain(game.dungeons.scriptorium), d);
  assert.ok(VL.hasItem(game, 'liftingGloves') && VL.hasItem(game, 'mortarPestle'));
  assert.ok(VL.LOCKS.d1Boss.reached(game));
});

// ---------- the playthrough, one lock at a time ----------

const BEFORE = ['named', 'start', 'chestGear', 'scriptoriumKey'];
const ROUTE_MILESTONES = [...BEFORE, ...ROUTE];

test('playthrough: the Scriptorium lock by lock, reloading after each, from the title to the Bookworm', () => {
  const { VL } = loadGame();
  const play = createPlaythrough(VL, { milestones: ROUTE_MILESTONES, steps: { ...registry, ...route } });
  const drive = play.playTo('d1Boss');
  assert.ok(VL.hasItem(drive.state, 'liftingGloves'));
  assert.equal(drive.state.inventory.ore >= 1, true, 'the Scriptorium ore');
  assert.deepEqual(plain(drive.state.dungeons.scriptorium), {
    keysGiven: 0, bossKey: true, map: true, boss: true,
    doors: { d1DoorA: true, d1DoorB: true, d1BossDoor: true },
    plates: { d1PlateGallery: true },
    switches: { d1SwitchPit: true, d1SwitchDesk: true },
  });
});

test('a faint anywhere in the Scriptorium, after each lock, never leaves it unsolvable', () => {
  const { VL } = loadGame();
  const steps = { ...registry, ...route };
  for (let n = BEFORE.length + 1; n < ROUTE_MILESTONES.length; n += 1) {
    const play = createPlaythrough(VL, { milestones: ROUTE_MILESTONES, steps });
    const drive = play.playTo(ROUTE_MILESTONES[n - 1]);
    VL.faint(drive.state, 'bookworm');
    drive.update();
    drive.hold([], 0.7);
    drive.press('interact');
    assert.deepEqual([drive.state.player.area, drive.state.player.screen, VL.heroTile(drive.state).tx, VL.heroTile(drive.state).ty], ['scriptorium', '1,0', 3, 2], `woke at the statue after ${ROUTE_MILESTONES[n - 1]}`);
    for (const id of ROUTE_MILESTONES.slice(n)) {
      drive.fight = false;
      route[id](drive);
      assert.ok(VL.LOCKS[id].reached(drive.state), `${id} after fainting at ${ROUTE_MILESTONES[n - 1]}`);
    }
  }
});

// ---------- words and drawing ----------

test('every word the Scriptorium says fits its box and its font', () => {
  const { VL } = loadGame();
  const texts = [];
  for (const screen of Object.values(VL.AREAS.scriptorium.screens)) for (const e of screen.entities) if (e.type === 'sign') texts.push([e.title, e.text]);
  const door = VL.getScreen('overworld', '2,-2').entities.find((e) => e.spot === 'scriptoriumDoor');
  texts.push([null, door.locked]);
  texts.push(['A bundle of books!', 'The Bookworm left behind three books it had been nibbling. Take them to the library!']);
  for (const [title, text] of texts) {
    assert.deepEqual(plain(VL.ART.missingGlyphs(`${title || ''} ${text}`)), [], text);
    assert.ok(!VL.ART.popupLayout({ title, text }).overflow, `fits: ${text}`);
  }
  for (const id of VL.BOOKWORM_BUNDLE) {
    const book = VL.BOOKS[id];
    assert.deepEqual(plain(VL.ART.missingGlyphs(`${book.title} ${book.blurb}`)), [], id);
  }
  assert.deepEqual(plain(VL.ART.missingGlyphs('Its paper armour is too tough for a sword!', 'small')), []);
  assert.ok(VL.ART.measureText('Its paper armour is too tough for a sword!', 'small') <= VL.TUNING.width - 8);
});

test('render smoke: every Scriptorium room draws, and the Bookworm in each of its moods', () => {
  const t = setup({ where: scr('1,0', 7, 8), enemies: true });
  const { VL } = t;
  const ctx = fakeDocument().createElement('canvas').getContext('2d');
  const draw = () => {
    const before = Object.values(ctx.calls).reduce((sum, n) => sum + n, 0);
    VL.render(ctx, t.app, 0.4);
    return Object.values(ctx.calls).reduce((sum, n) => sum + n, 0) - before;
  };
  for (const screen of Object.keys(VL.AREAS.scriptorium.screens)) {
    t.place(scr(screen, 7, 7));
    t.step();
    assert.ok(draw() > 100, `${screen} draws`);
  }
  t.place(scr('1,-2', 7, 8));
  const worm = wormOf(t);
  for (const mode of ['under', 'rumble', 'up', 'hurt', 'down', 'dying']) {
    worm.mode = mode;
    worm.timer = 0.2;
    worm.dust = { x: 100, y: 80 };
    assert.ok(draw() > 50, mode);
  }
  for (const id of ['enemy-bookworm', 'enemy-bookworm-ouch', 'enemy-bookworm-segment', 'shot-paper']) assert.ok(VL.ART.sprite(id), id);
});

test('README documents the Scriptorium', () => {
  const readme = read('README.md');
  for (const word of ['## The Old Scriptorium (W14)', 'bookworm', 'VL.BOOKWORM_BUNDLE', 'save-v1-W14.json', 'needs: \'scriptoriumKey\'']) assert.ok(readme.includes(word), `README mentions ${word}`);
});
