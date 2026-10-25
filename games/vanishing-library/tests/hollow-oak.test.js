// Dungeon 2, the Hollow Oak (W15): the door in the Woods, the rooms and their
// lints, the rope crossings both ways, the locks in the table (and that the
// map tells the truth about them), the Thornback's fight and the hook W16
// hangs the shockwave on, the fixture, the playthrough one lock at a time
// with a faint after each, and a render smoke of every room.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, loadGame, memoryStorage, fakeDocument, read } = require('./harness');
const { createPlaythrough, registry, findPath } = require('./playthrough');
const { route, ROUTE, CROSSINGS, at } = require('./hollow-oak-route');

const STEP = 1 / 60;
const plain = (value) => JSON.parse(JSON.stringify(value));
const AREA = 'hollowOak';

// `storage: true` gives the game slot 0 of an in-memory store (t.slotText()).
function setup({ where, enemies = false, storage = false } = {}) {
  const { VL } = loadGame();
  const backing = memoryStorage();
  const app = storage ? VL.createApp({ storage: VL.createStorage(backing) }) : VL.createApp();
  if (storage) app.startGame(VL.newGame({ name: 'Robin' }), 0, { fresh: true });
  else app.game = VL.newGame({ name: 'Robin' });
  app.setScene('play');
  app.game.popups.seen.controls = true;
  const t = {
    VL,
    app,
    get game() {
      return app.game;
    },
    get d() {
      return VL.dungeonState(app.game, AREA);
    },
    place(place) {
      VL.place(app.game, place);
      if (!enemies) app.game.room.entities = app.game.room.entities.filter((e) => !VL.isEnemy(e) || e.type === 'thornback');
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
    slotText: () => backing.getItem(VL.slotKey(0)),
  };
  if (where) t.place(where);
  return t;
}

const oak = (screen, tx, ty, facing = 'up') => ({ area: AREA, screen, tx, ty, facing });

// ---------- the way in ----------

test('the Hollow Oak door: in from the clearing to the entrance hall, and the mat leads back out', () => {
  const { VL } = loadGame();
  const door = VL.getScreen('overworld', '7,-2').entities.find((e) => e.spot === 'hollowOakDoor');
  assert.equal(door.type, 'door');
  assert.deepEqual(plain(door.to), { area: AREA, screen: '0,0', tx: 7, ty: 9, facing: 'up' });
  const out = VL.getScreen(AREA, '0,0').entities.find((e) => e.type === 'door');
  assert.deepEqual(plain([out.x, out.y, out.to]), [7, 10, { area: 'overworld', screen: '7,-2', tx: 7, ty: 4, facing: 'down' }]);
  assert.ok(!VL.isSolidAt('overworld', '7,-2', 7, 4), 'the step outside is open ground');
  assert.equal(VL.DUNGEONS.hollowOak.name, 'Hollow Oak');
  assert.ok(!VL.unfilledSpots().includes('hollowOakDoor'));
});

// ---------- layout ----------

test('every lint is clean: locks, doors, blocks', () => {
  const { VL } = loadGame();
  assert.deepEqual([...VL.dungeonProblems()], []);
  const rooms = Object.keys(VL.AREAS.hollowOak.screens);
  assert.ok(rooms.length >= 8 && rooms.length <= 14, `${rooms.length} rooms`);
});

test('every rope crossing lands on open floor, and has a crossing back to where it started', () => {
  const t = setup();
  const { VL } = t;
  VL.giveItem(t.game, 'grapplingRope');
  t.game.popups.queue.length = 0;
  // Everything walkable once every door is open and every switch thrown.
  const d = t.d;
  for (const id of ['d2DoorA', 'd2DoorB', 'd2BossDoor']) d.doors[id] = true;
  d.switches.d2SwitchSap = true;
  const walk = (from, to) => Boolean(findPath(VL, from, to, t.game));
  for (const crossing of CROSSINGS) {
    assert.ok(!VL.isSolidAt(AREA, crossing.to.screen, crossing.to.tx, crossing.to.ty), `${crossing.to.screen} ${crossing.to.tx},${crossing.to.ty} is floor`);
    assert.ok(!walk(crossing.from, crossing.to), `${crossing.from.screen} (${crossing.from.tx},${crossing.from.ty}) needs the rope`);
    assert.ok(CROSSINGS.some((back) => walk(crossing.to, back.from) && walk(back.to, crossing.from)), `a way back from ${crossing.to.screen} (${crossing.to.tx},${crossing.to.ty})`);
    // The real hook does it: stand on `from`, face `dir`, land on `to`.
    t.place(oak(crossing.from.screen, crossing.from.tx, crossing.from.ty, crossing.dir));
    if (VL.heldItem(t.game, 'mainHand') !== 'grapplingRope') VL.setHand(t.game, 'mainHand', 'grapplingRope');
    t.press('mainHand');
    t.until((g) => !g.player.rope, 3);
    assert.deepEqual(plain([t.game.player.screen, VL.heroTile(t.game)]), [crossing.to.screen, { tx: crossing.to.tx, ty: crossing.to.ty }], `the hook from ${crossing.from.screen} ${crossing.dir}`);
  }
});

test('the map tells the truth: key A and door A without the rope; key B, door B, the switch and the boss key only with it', () => {
  const t = setup();
  const { VL } = t;
  const d = t.d;
  d.doors.d2DoorA = true;
  d.doors.d2DoorB = true;
  const from = at('0,0', 7, 8);
  const next = (e) => [[0, 1], [0, -1], [1, 0], [-1, 0]].map(([dx, dy]) => ({ area: AREA, screen: e.screen, tx: e.x + dx, ty: e.y + dy }));
  const reachable = (screen, id) => {
    const e = VL.getScreen(AREA, screen).entities.find((x) => x.id === id);
    return next({ ...e, screen }).some((spot) => findPath(VL, from, spot, t.game));
  };
  assert.ok(reachable('-1,-2', 'd2KeyA'), 'key A on foot');
  assert.ok(reachable('0,-2', 'd2DoorA'), 'door A on foot');
  assert.ok(!reachable('1,-1', 'd2KeyB'), 'key B sits on its island');
  assert.ok(!reachable('1,0', 'd2BossKey'), 'the boss key too');
  assert.ok(!reachable('1,0', 'd2SwitchSap'), 'and the switch');
  // Door B's near side lies past the vault's pits.
  assert.ok(!findPath(VL, from, at('1,-1', 12, 9), t.game), 'door B needs the rope');
  assert.ok(findPath(VL, from, at('1,-1', 2, 5), t.game), 'the ledge looks across at key B');
});

// ---------- the table ----------

test('W15 claims hollowOakEntered and d2Boss, and grapplingRope, with the doors they lie behind; one lock per key and door', () => {
  const { VL } = loadGame();
  for (const id of ['hollowOakEntered', 'grapplingRope', 'd2Boss', 'd2KeyA', 'd2DoorA', 'd2KeyB', 'd2DoorB', 'd2BossKey', 'd2BossDoor']) {
    assert.ok(VL.LOCKS[id].reached, `${id} is implemented`);
  }
  assert.deepEqual([...VL.LOCKS.grapplingRope.needs], ['hollowOakEntered', 'd2DoorA']);
  assert.match(VL.LOCKS.grapplingRope.replan, /mid-dungeon/);
  assert.ok(VL.LOCKS.d2Boss.needs.includes('d2BossDoor') && VL.LOCKS.d2Boss.needs.includes('grapplingRope'));
  assert.deepEqual([...VL.LOCKS.d2Boss.gives], ['heartD2']);
  assert.deepEqual({ ...VL.LOCKS.d2KeyB.supplies }, { 'smallKey:hollowOak': 1 });
  assert.deepEqual([...VL.LOCKS.d2DoorB.needs], ['grapplingRope'], 'key A can never be spent on door B');
  assert.deepEqual(plain(VL.LOCKS.hollowOakEntered.place), { area: AREA, screen: '0,0' });
  assert.deepEqual([...VL.solveProgression().problems], []);
});

test('every crossing the room data allows, not only the listed ones: from wherever a post can land the hero, he can walk out of the dungeon and reach every other landing', () => {
  const t = setup();
  const { VL } = t;
  VL.giveItem(t.game, 'grapplingRope');
  t.game.popups.queue.length = 0;
  const d = t.d;
  for (const id of ['d2DoorA', 'd2DoorB', 'd2BossDoor']) d.doors[id] = true;
  d.switches.d2SwitchSap = true;
  t.game.hands = { mainHand: 'grapplingRope', offHand: null };
  const DIRS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
  const tileKey = (p) => `${p.screen} ${p.tx},${p.ty}`;
  const open = (screen, tx, ty) => tx >= 0 && ty >= 0 && tx < VL.TUNING.cols && ty < VL.TUNING.rows && !VL.isSolidAt(AREA, screen, tx, ty);
  // Every tile a post can land the hero on (the hook always lands him in front of it).
  const landings = [];
  const crossings = [];
  for (const [screen, data] of Object.entries(VL.AREAS[AREA].screens)) {
    for (const post of data.entities.filter((e) => e.type === 'grapplePost')) {
      for (const [dir, [dx, dy]] of Object.entries(DIRS)) {
        const land = { area: AREA, screen, tx: post.x - dx, ty: post.y - dy };
        if (!open(screen, land.tx, land.ty)) continue;
        landings.push(land);
        // The real hook from every open tile behind that landing, within reach.
        for (let k = 1; k <= VL.TUNING.ropeTiles; k += 1) {
          const from = { area: AREA, screen, tx: land.tx - dx * k, ty: land.ty - dy * k };
          if (!open(screen, from.tx, from.ty)) continue;
          t.place(oak(screen, from.tx, from.ty, dir));
          t.press('mainHand');
          t.until((g) => !g.player.rope, 3);
          const to = { area: AREA, screen: t.game.player.screen, ...VL.heroTile(t.game) };
          if (tileKey(to) !== tileKey(from)) crossings.push({ from, to });
        }
      }
    }
  }
  assert.ok(landings.length >= 12 && crossings.length >= landings.length, `${landings.length} landings, ${crossings.length} crossings`);
  for (const c of crossings) assert.ok(landings.some((l) => tileKey(l) === tileKey(c.to)), `the hook from ${tileKey(c.from)} lands in front of a post`);
  // Walking components among the tiles that matter.
  const statue = oak('0,0', 3, 2);
  const tiles = [statue, ...landings, ...crossings.map((c) => c.from)];
  const comp = new Map();
  const reps = [];
  for (const tile of tiles) {
    if (comp.has(tileKey(tile))) continue;
    const rep = reps.findIndex((r) => findPath(VL, r, tile, t.game));
    if (rep === -1) reps.push(tile);
    comp.set(tileKey(tile), rep === -1 ? reps.length - 1 : rep);
  }
  const of = (tile) => comp.get(tileKey(tile));
  for (const land of landings) {
    const reached = new Set([of(land)]);
    for (let grew = true; grew;) {
      grew = false;
      for (const c of crossings) {
        if (reached.has(of(c.from)) && !reached.has(of(c.to))) {
          reached.add(of(c.to));
          grew = true;
        }
      }
    }
    assert.ok(reached.has(of(statue)), `from ${tileKey(land)} the hero can get back to the entrance`);
    for (const other of landings) assert.ok(reached.has(of(other)), `from ${tileKey(land)} the hero can reach ${tileKey(other)}`);
  }
});

// ---------- the Thornback ----------

function bossRoom(options) {
  const t = setup(options);
  t.d.doors.d2BossDoor = true;
  t.place(oak('0,-3', 7, 8));
  for (const id of ['woodSword', 'grapplingRope']) t.VL.giveItem(t.game, id);
  t.game.popups.queue.length = 0;
  t.game.hands = { mainHand: 'woodSword', offHand: 'grapplingRope' };
  return t;
}
const beetleOf = (t) => t.find('thornback');

test('the Thornback: a sword clinks off its plates and says to use the rope', () => {
  const t = bossRoom();
  const { VL } = t;
  const b = beetleOf(t);
  b.arriving = 0;
  VL.hitEnemy(t.game, b, 1, { x: 0, y: 0 });
  assert.equal(b.life, VL.TUNING.thornbackLife);
  assert.equal(t.game.dungeonNote.text, VL.THORNBACK_SWORD_NOTE);
  assert.ok(t.game.room.entities.includes(b));
});

test('the Thornback: the hook yanks a plate off and flips it; then the sword counts; it rights itself in time', () => {
  const t = bossRoom();
  const { VL } = t;
  const b = beetleOf(t);
  t.hold([], VL.TUNING.enemyArrivalSeconds + 0.05);
  // Line the hero up below it and throw.
  t.place(oak('0,-3', VL.tileOf(b.cx, b.cy).tx, 8, 'up'));
  const beetle = beetleOf(t);
  beetle.arriving = 0;
  t.press('offHand');
  t.until(() => beetle.mode === 'flipped', 1.5);
  assert.equal(beetle.plates, VL.TUNING.thornbackPlates - 1);
  assert.ok(t.game.room.entities.some((e) => e.type === 'thornPlate'), 'the plate flies off');
  assert.equal(VL.enemyHarmful(beetle), false, 'harmless on its back');
  VL.hitEnemy(t.game, beetle, 1, { x: 0, y: 0 });
  assert.equal(beetle.life, VL.TUNING.thornbackLife - 1);
  t.until(() => beetle.mode === 'walk', VL.TUNING.thornbackFlippedSeconds + VL.TUNING.thornbackRightSeconds + 0.5);
});

test('the Thornback charges when the hero is in line, and bonks into the wall', () => {
  const t = bossRoom();
  const { VL } = t;
  t.place(oak('0,-3', 2, 4, 'right'));
  const b = beetleOf(t);
  t.until(() => b.mode === 'aim', 4);
  t.game.player.invuln = 99;
  t.until(() => b.mode === 'charge', 1.5);
  t.until(() => b.mode === 'bonk', 3);
});

function beatThornback(t) {
  const { VL } = t;
  const b = beetleOf(t);
  b.arriving = 0;
  for (let i = 0; i < 20 && b.mode !== 'dying'; i += 1) {
    if (b.mode !== 'flipped') VL.ENEMIES.thornback.onHook(t.game, b);
    b.hurt = 0;
    VL.hitEnemy(t.game, b, 1, { x: 0, y: 0 });
  }
  assert.equal(b.mode, 'dying');
  t.until(() => VL.bossBeaten(t.game, AREA), VL.TUNING.thornbackDyingSeconds + 1);
}

test('beaten: it flips away for good, the heart and the warp appear, the win is saved, and nothing is taken', () => {
  const t = bossRoom();
  const { VL } = t;
  const calls = [];
  VL.afterThornback('probe', (state) => calls.push(VL.bossBeaten(state, AREA)));
  assert.throws(() => VL.afterThornback('probe', () => {}), /already defined/);
  t.game.inventory.wood = 3;
  t.game.inventory.shells = 7;
  const before = plain({ items: t.game.items, inventory: t.game.inventory, hands: t.game.hands });
  beatThornback(t);
  assert.deepEqual(calls, [], 'not in the step the win is written');
  t.step();
  assert.deepEqual(calls, [true], 'W16\'s hook runs in the next step, after the win is saved');
  assert.deepEqual(plain({ items: t.game.items, inventory: t.game.inventory, hands: t.game.hands }), before, 'the shockwave is W16\'s: nothing is lost here');
  t.step();
  const heart = t.find('heartContainer');
  assert.deepEqual([heart.id, heart.x, heart.y], ['heartD2', 7, 4]);
  assert.deepEqual([t.find('warp').x, t.find('warp').y], [7, 8]);
  assert.equal(t.find('shutter').closed, false, 'the bars behind him lift');
  assert.ok(VL.LOCKS.d2Boss.reached(t.game));
  t.place(oak('0,-3', 7, 7));
  assert.equal(t.find('thornback'), undefined, 'gone for good');
  assert.deepEqual(calls, [true], 'and never runs again');
});

test('the order W16 relies on: the win is written, then the hook runs, then its losses are written with its id; a reload anywhere neither loses the win nor applies the losses twice', () => {
  const t = bossRoom({ storage: true });
  const { VL } = t;
  const calls = [];
  VL.afterThornback('shockwave', (state) => {
    calls.push(state.inventory.wood);
    state.inventory.wood = 0;
  });
  t.game.inventory.wood = 3;
  t.app.save();
  const saved = () => JSON.parse(t.slotText());
  // A fresh app over a copy of the slot as it stands: a page reload there.
  const reloadFrom = (text) => {
    const storage = VL.createStorage(memoryStorage({ [VL.slotKey(0)]: text }));
    const app = VL.createApp({ storage });
    app.startGame(VL.loadSlot(storage, 0), 0);
    app.setScene('play');
    for (let s = 0; s < 0.5; s += STEP) app.update(VL.noActions(), STEP);
    return { app, saved: JSON.parse(storage.read(VL.slotKey(0))) };
  };

  beatThornback(t);
  const afterWin = t.slotText();
  assert.deepEqual([saved().dungeons.hollowOak.boss, saved().afterThornbackDone, saved().inventory.wood], [true, [], 3], 'the win is on disk before the hook runs');
  assert.deepEqual(calls, []);

  t.step();
  assert.deepEqual(calls, [3], 'the hook runs once the win is written');
  assert.deepEqual([saved().dungeons.hollowOak.boss, saved().afterThornbackDone, saved().inventory.wood], [true, ['shockwave'], 0], 'its losses and its id are written together');
  const afterHook = t.slotText();
  t.hold([], 1);
  assert.deepEqual(calls, [3], 'never again in this session');

  // Reloaded between the two writes: the win is kept and the hook runs once.
  const between = reloadFrom(afterWin);
  assert.deepEqual(calls, [3, 3], 'the hook runs once after that reload');
  assert.deepEqual([between.saved.dungeons.hollowOak.boss, between.saved.afterThornbackDone, between.saved.inventory.wood], [true, ['shockwave'], 0]);
  const again = reloadFrom(JSON.stringify(between.saved));
  assert.deepEqual(calls, [3, 3], 'and not after the next one');
  assert.equal(again.app.game.inventory.wood, 0);

  // Reloaded after both writes: nothing runs twice.
  const after = reloadFrom(afterHook);
  assert.deepEqual(calls, [3, 3], 'a reload after the losses never applies them again');
  assert.deepEqual([after.app.game.dungeons.hollowOak.boss, after.app.game.inventory.wood], [true, 0]);
});

test('a hook waits while the win could not be written, and runs once a write lands', () => {
  const t = bossRoom({ storage: true });
  const { VL } = t;
  const calls = [];
  VL.afterThornback('probe', () => calls.push(1));
  t.app.save();
  const write = t.app.storage.write;
  t.app.storage.write = () => false;
  beatThornback(t);
  t.hold([], 0.5);
  assert.ok(t.app.saveFailed && t.game.dirty);
  assert.deepEqual(calls, [], 'nothing runs before the win is safe');
  t.app.storage.write = write;
  t.step();
  assert.equal(JSON.parse(t.slotText()).dungeons.hollowOak.boss, true);
  t.step();
  assert.deepEqual(calls, [1]);
  assert.deepEqual(JSON.parse(t.slotText()).afterThornbackDone, ['probe']);
});

test('shut in with the Thornback, the hero can always faint his way out (it hurts while it walks and charges)', () => {
  const t = bossRoom();
  t.place(oak('0,-3', 7, 7, 'up'));
  t.game.hp = 2;
  t.until((g) => g.hp <= 0 || t.app.sceneId === 'fainted', 20);
});

// ---------- saving ----------

test('the W15 fixture loads with the Hollow Oak played through, no field reset', () => {
  const { VL } = loadGame();
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v1-W15.json'), 'utf8'));
  const d = fixture.dungeons.hollowOak;
  assert.ok(d.boss && d.bossKey && d.map && d.doors.d2DoorA && d.doors.d2DoorB && d.doors.d2BossDoor && d.switches.d2SwitchSap);
  const backing = memoryStorage({ [VL.slotKey(0)]: JSON.stringify(fixture) });
  const result = VL.readSlot(VL.createStorage(backing), 0);
  assert.deepEqual(plain(result.resets || []), []);
  const game = VL.loadSlot(VL.createStorage(backing), 0);
  assert.deepEqual(plain(game.dungeons.hollowOak), d);
  assert.ok(VL.hasItem(game, 'grapplingRope') && VL.hasItem(game, 'woodsMapCopy'));
  assert.equal(VL.heldItem(game, 'offHand'), 'grapplingRope');
  assert.ok(VL.LOCKS.d2Boss.reached(game));
});

test('the afterThornbackDone fixture loads with no field reset, and a hook added since runs once on the next load', () => {
  const { VL } = loadGame();
  const text = fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v1-W15-after.json'), 'utf8');
  assert.deepEqual(JSON.parse(text).afterThornbackDone, []);
  const backing = memoryStorage({ [VL.slotKey(0)]: text });
  assert.deepEqual(plain(VL.readSlot(VL.createStorage(backing), 0).resets), []);
  const calls = [];
  VL.afterThornback('later', () => calls.push(1));
  const storage = VL.createStorage(backing);
  const app = VL.createApp({ storage });
  app.startGame(VL.loadSlot(storage, 0), 0);
  app.setScene('play');
  for (let s = 0; s < 0.5; s += STEP) app.update(VL.noActions(), STEP);
  assert.deepEqual(calls, [1]);
  assert.deepEqual(JSON.parse(backing.getItem(VL.slotKey(0))).afterThornbackDone, ['later']);
});

// ---------- the playthrough, one lock at a time ----------

const BEFORE = ['named', 'start', 'chestGear', 'scriptoriumKey', 'scriptoriumEntered', 'liftingGloves', 'd1Boss', 'woodsMapCopy'];
const ROUTE_MILESTONES = [...BEFORE, ...ROUTE];

test('playthrough: the Woods and the Hollow Oak lock by lock, reloading after each, from the title to the Thornback', () => {
  const { VL } = loadGame();
  const play = createPlaythrough(VL, { milestones: ROUTE_MILESTONES, steps: { ...registry, ...route } });
  const drive = play.playTo('d2Boss');
  assert.ok(VL.hasItem(drive.state, 'grapplingRope'));
  assert.deepEqual(plain(drive.state.dungeons.hollowOak), {
    keysGiven: 0, bossKey: true, map: true, boss: true,
    doors: { d2DoorA: true, d2DoorB: true, d2BossDoor: true },
    plates: {},
    switches: { d2SwitchSap: true },
  });
  assert.ok(VL.spotFound(drive.state, 'heartD2'));
});

test('a faint anywhere in the Hollow Oak, after each lock, never leaves it unsolvable', () => {
  const { VL } = loadGame();
  const steps = { ...registry, ...route };
  for (let n = BEFORE.length + 1; n < ROUTE_MILESTONES.length; n += 1) {
    const play = createPlaythrough(VL, { milestones: ROUTE_MILESTONES, steps });
    const drive = play.playTo(ROUTE_MILESTONES[n - 1]);
    VL.faint(drive.state, 'thornback');
    drive.update();
    drive.hold([], 0.7);
    drive.press('interact');
    assert.deepEqual([drive.state.player.area, drive.state.player.screen, VL.heroTile(drive.state).tx, VL.heroTile(drive.state).ty], [AREA, '0,0', 3, 2], `woke at the statue after ${ROUTE_MILESTONES[n - 1]}`);
    for (const id of ROUTE_MILESTONES.slice(n)) {
      drive.fight = false;
      route[id](drive);
      assert.ok(VL.LOCKS[id].reached(drive.state), `${id} after fainting at ${ROUTE_MILESTONES[n - 1]}`);
    }
  }
});

// ---------- words and drawing ----------

test('every word the Hollow Oak says fits its box and its font', () => {
  const { VL } = loadGame();
  const texts = [];
  for (const screen of Object.values(VL.AREAS.hollowOak.screens)) for (const e of screen.entities) if (e.type === 'sign') texts.push([e.title, e.text]);
  assert.equal(texts.length, 3);
  for (const [title, text] of texts) {
    assert.deepEqual(plain(VL.ART.missingGlyphs(`${title || ''} ${text}`)), [], text);
    assert.ok(!VL.ART.popupLayout({ title, text }).overflow, `fits: ${text}`);
  }
  for (const note of [VL.THORNBACK_SWORD_NOTE, 'The Thornback is beaten!']) {
    assert.deepEqual(plain(VL.ART.missingGlyphs(note, 'small')), [], note);
    assert.ok(VL.ART.measureText(note, 'small') <= VL.TUNING.width - 8, note);
  }
  assert.deepEqual(plain(VL.ART.missingGlyphs(VL.faintLine('thornback'))), []);
});

test('render smoke: every Hollow Oak room draws, and the Thornback in each of its moods', () => {
  const t = setup({ where: oak('0,0', 7, 8), enemies: true });
  const { VL } = t;
  const ctx = fakeDocument().createElement('canvas').getContext('2d');
  const draw = () => {
    const before = Object.values(ctx.calls).reduce((sum, n) => sum + n, 0);
    VL.render(ctx, t.app, 0.4);
    return Object.values(ctx.calls).reduce((sum, n) => sum + n, 0) - before;
  };
  for (const screen of Object.keys(VL.AREAS.hollowOak.screens)) {
    t.place(oak(screen, 7, 7));
    t.step();
    assert.ok(draw() > 100, `${screen} draws`);
  }
  t.d.doors.d2BossDoor = true;
  t.place(oak('0,-3', 7, 8));
  const b = beetleOf(t);
  for (const plates of [3, 2, 1, 0]) {
    for (const facing of ['up', 'down', 'left', 'right']) {
      Object.assign(b, { plates, facing, mode: 'walk' });
      assert.ok(draw() > 50, `${plates} plates, facing ${facing}`);
    }
  }
  for (const mode of ['aim', 'charge', 'bonk', 'flipped', 'righting', 'dying']) {
    b.mode = mode;
    b.timer = 0.2;
    assert.ok(draw() > 50, mode);
  }
});

test('README documents the Woods gate, the rope and the Hollow Oak', () => {
  const readme = read('README.md');
  for (const word of ['## The Whispering Woods (W15)', '## The Grappling Rope (W15)', '## The Hollow Oak (W15)', 'VL.afterThornback', 'VL.defineEdgeRule', 'save-v1-W15.json', 'grapplePost']) {
    assert.ok(readme.includes(word), `README mentions ${word}`);
  }
});
