// Dungeon 4, the Dragon's Lair (W19): the door at the top of the highlands,
// the rooms and their lints, fire and the Mirror Shield, the stone heads
// only their own fire chokes, the Dragon, the hoard spilling, the locks in
// the table (and that the map tells the truth about them), the fixture, the
// playthrough one lock at a time with a faint after each, and a render smoke.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, loadGame, memoryStorage, fakeDocument, read } = require('./harness');
const { createPlaythrough, registry, findPath } = require('./playthrough');
const { route, ROUTE, at } = require('./lair-route');

const STEP = 1 / 60;
const plain = (value) => JSON.parse(JSON.stringify(value));
const AREA = 'lair';
const lr = (screen, tx, ty, facing = 'up') => ({ area: AREA, screen, tx, ty, facing });
const SWORDS = ['woodSword', 'metalSword'];

function setup({ where, enemies = false, items = [] } = {}) {
  const { VL } = loadGame();
  const app = VL.createApp();
  app.game = VL.newGame({ name: 'Robin' });
  app.setScene('play');
  for (const id of ['controls', 'dungeonMap']) app.game.popups.seen[id] = true;
  for (const id of items) app.game.items[id] = true;
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
      if (!enemies) app.game.room.entities = app.game.room.entities.filter((e) => !VL.isEnemy(e) || e.type === 'dragon');
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
    // A sword in the main hand and `shield` in the off hand.
    arm(shield = 'mirrorShield', sword = 'woodSword') {
      app.game.items[sword] = true;
      if (shield) app.game.items[shield] = true;
      app.game.hands = { mainHand: sword, offHand: shield };
      app.game.popups.queue.length = 0;
    },
  };
  if (where) t.place(where);
  return t;
}

function fixtureApp(VL, name) {
  const text = fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
  const storage = VL.createStorage(memoryStorage({ [VL.slotKey(0)]: text }));
  const app = VL.createApp({ storage });
  app.startGame(VL.loadSlot(storage, 0), 0);
  app.setScene('play');
  return app;
}

// ---------- the way in ----------

test('the lair door at the top of the highlands leads into the entrance hall, and the mat leads back out', () => {
  const t = setup({ where: { area: 'overworld', screen: '-1,-5', tx: 7, ty: 5, facing: 'up' } });
  const { VL } = t;
  const door = VL.getScreen('overworld', '-1,-5').entities.find((e) => e.spot === 'lairDoor');
  assert.deepEqual(plain([door.type, door.to]), ['door', { area: AREA, screen: '0,0', tx: 7, ty: 9, facing: 'up' }]);
  assert.deepEqual([...VL.unfilledSpots()], [], 'the last spot is filled');
  t.until((g) => g.player.area === AREA, 1, ['up']);
  assert.deepEqual([t.game.player.screen, VL.heroTile(t.game).tx, VL.heroTile(t.game).ty], ['0,0', 7, 9]);
  assert.ok(VL.LOCKS.dragonsLairEntered.reached(t.game));
  const out = VL.getScreen(AREA, '0,0').entities.find((e) => e.type === 'door');
  assert.deepEqual(plain([out.x, out.y, out.to]), [7, 10, plain(VL.DUNGEONS.lair.entrance)]);
  assert.equal(VL.DUNGEONS.lair.name, 'Dragon\'s Lair');
});

test('the doorstep is safe: Continue after the win lands there, and nothing hurts him while he stands still', () => {
  const t = setup({ enemies: true });
  const { VL } = t;
  const step = VL.DUNGEONS.lair.entrance;
  assert.ok(!VL.isSolidAt(step.area, step.screen, step.tx, step.ty));
  t.game.savePoint = { ...step };
  t.place(lr('0,0', 7, 7));
  VL.faint(t.game);
  t.hold([], 0.7);
  t.press('interact');
  assert.deepEqual([t.game.player.area, t.game.player.screen, VL.heroTile(t.game).tx, VL.heroTile(t.game).ty], [step.area, step.screen, step.tx, step.ty]);
  const hp = t.game.hp;
  t.hold([], 15);
  assert.equal(t.game.hp, hp);
});

// ---------- layout ----------

test('every lint is clean: locks, doors, blocks; 8 to 14 rooms; lava is no chicken flight', () => {
  const { VL } = loadGame();
  assert.deepEqual([...VL.dungeonProblems()], []);
  const rooms = Object.keys(VL.AREAS.lair.screens);
  assert.ok(rooms.length >= 8 && rooms.length <= 14, `${rooms.length} rooms`);
  for (const [ch, info] of Object.entries(VL.TILESETS.lair)) assert.ok(!info.flyOver, `${ch} is not flyOver`);
  assert.ok(VL.TILESETS.lair['~'].solid && VL.TILESETS.lair['~'].pit);
});

test('the dungeon keys HUD never covers a lair thing (the top-right tiles)', () => {
  const { VL } = loadGame();
  const { width, tile } = VL.TUNING;
  const fromCol = Math.floor((width - 34) / tile);
  const toRow = Math.floor(24 / tile);
  const under = [];
  for (const [screen, data] of Object.entries(VL.AREAS[AREA].screens)) {
    for (const e of data.entities || []) if (e.type !== 'decor' && e.x >= fromCol && e.y <= toRow) under.push(`${screen} ${e.type} (${e.x},${e.y})`);
  }
  assert.deepEqual(under, []);
});

test('the map tells the truth: key A and door A on foot; key B, door B and the boss key only past stone heads the shield must choke', () => {
  const t = setup();
  const { VL } = t;
  const d = t.d;
  const from = at('0,0', 7, 8);
  const beside = (screen, id) => {
    const e = VL.getScreen(AREA, screen).entities.find((x) => x.id === id);
    return [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => findPath(VL, from, at(screen, e.x + dx, e.y + dy), t.game));
  };
  assert.ok(!beside('-1,0', 'd4KeyA'), 'key A waits behind the cellar\'s bars');
  d.plates.d4PlateCellar = true;
  assert.ok(beside('-1,0', 'd4KeyA'), 'the plate pressed, key A on foot');
  assert.ok(findPath(VL, from, at('0,-1', 1, 5), t.game), 'door A on foot');
  assert.ok(!findPath(VL, from, at('0,-2', 7, 5), t.game), 'the great cave waits on the hall\'s stone head');
  d.doors.d4DoorA = true;
  assert.ok(findPath(VL, from, at('-1,-1', 7, 3), t.game), 'the Mirror Shield past door A');
  d.switches.d4SpoutHall = true;
  assert.ok(findPath(VL, from, at('0,-2', 7, 5), t.game));
  assert.ok(!beside('-1,-2', 'd4KeyB'), 'key B waits on the ledge\'s stone head');
  d.switches.d4SpoutLedge = true;
  assert.ok(beside('-1,-2', 'd4KeyB'));
  // Stone heads sit in the wall or across lava: no sword reaches them.
  for (const [screen, id] of [['0,-1', 'd4SpoutHall'], ['-1,-2', 'd4SpoutLedge'], ['1,-2', 'd4SpoutForge']]) assert.ok(!beside(screen, id), `${id} is out of reach`);
  d.doors.d4DoorB = true;
  t.place(lr('1,-2', 1, 5));
  const key = t.game.room.entities.find((e) => e.id === 'd4BossKey');
  const bossKey = () => findPath(VL, at('1,-2', 1, 5), at('1,-2', key.x, key.y - 1), t.game);
  assert.ok(!bossKey(), 'the boss key sits behind the forge\'s bars');
  d.switches.d4SpoutForge = true;
  assert.ok(bossKey());
});

// ---------- fire and the Mirror Shield ----------

// Facing up in the hall, under its stone head, with `shield` raised (or not).
function underTheHallSpout({ shield = 'mirrorShield', raise = true } = {}) {
  const t = setup({ where: lr('0,-1', 11, 4) });
  t.arm(shield);
  t.game.player.facing = 'up';
  const held = raise && shield ? ['offHand'] : [];
  return { t, held };
}

test('the Mirror Shield: worn in a hand, held up it bounces fire home; it blocks what a metal shield blocks', () => {
  const { VL } = loadGame();
  assert.deepEqual(plain(VL.TUNING.shieldBlocks.mirrorShield), ['small', 'big', 'fire']);
  for (const shield of ['woodShield', 'metalShield']) assert.ok(!VL.TUNING.shieldBlocks[shield].includes('fire'), `${shield} does not stop fire`);
  assert.equal(VL.ITEMS.mirrorShield.prefers, 'offHand');
  const chest = VL.getScreen(AREA, '-1,-1').entities.find((e) => e.type === 'bigChest');
  assert.equal(chest.item, 'mirrorShield');
});

test('a stone head breathes fire at the hero in its line; the Mirror Shield raised sends it home and chokes the head for good', () => {
  const { t, held } = underTheHallSpout();
  const { VL } = t;
  const hp = t.game.hp;
  t.until(() => t.find('dragonFire'), 3, held);
  const ball = t.find('dragonFire');
  assert.equal(ball.owner.id, 'd4SpoutHall');
  t.until(() => t.d.switches.d4SpoutHall, 3, held);
  assert.equal(t.game.hp, hp, 'not a scratch');
  assert.ok(!t.find('dragonFire'), 'the fire went out in its mouth');
  const bars = t.game.room.entities.find((e) => e.id === 'd4BarsHall');
  t.hold([], 0.1);
  assert.ok(!bars.closed, 'the bars lift');
  // Choked: no more fire, even standing in its line.
  t.hold([], 4);
  assert.ok(!t.find('dragonFire'));
  t.place(lr('0,-1', 11, 4));
  assert.ok(t.game.room.entities.find((e) => e.id === 'd4SpoutHall').on, 'still choked on the next visit');
});

test('no other shield stops fire: wood or metal raised, he is hurt (a full heart) and told; nor does a Mirror Shield facing away', () => {
  for (const shield of ['woodShield', 'metalShield', null]) {
    const { t, held } = underTheHallSpout({ shield });
    const hp = t.game.hp;
    t.until((g) => g.hp < hp, 3, held);
    assert.equal(hp - t.game.hp, t.VL.TUNING.fireDamage, `${shield}: a full heart`);
    assert.ok(!t.d.switches.d4SpoutHall);
    if (shield) assert.equal(t.game.dungeonNote?.text, t.VL.SHIELD_FIRE_NOTE, `${shield} says why`);
  }
  const { t } = underTheHallSpout();
  const hp = t.game.hp;
  t.game.player.facing = 'down';
  t.until((g) => g.hp < hp, 3, ['offHand']);
  assert.ok(!t.d.switches.d4SpoutHall, 'a shield facing away bounces nothing');
});

test('fire flies over lava and stops at walls and blocks; a block in its line hides the hero from the head', () => {
  const t = setup({ where: lr('1,-2', 4, 6, 'right') });
  const { VL } = t;
  const head = t.game.room.entities.find((e) => e.id === 'd4SpoutForge');
  assert.ok(!VL.spoutSees(t.game, head), 'the block stands between');
  t.hold([], 3);
  assert.ok(!t.find('dragonFire'), 'no fire for a hero it cannot see');
  t.game.room.entities = t.game.room.entities.filter((e) => e.type !== 'pushBlock');
  assert.ok(VL.spoutSees(t.game, head), 'with the block shoved aside it sees him over the lava');
  assert.ok(VL.fireStops(t.game, 0, 6), 'the wall stops fire');
  assert.ok(!VL.fireStops(t.game, 13, 6), 'lava does not');
  t.place(lr('1,-2', 4, 5));
  assert.ok(!VL.spoutSees(t.game, head), 'out of its line');
});

test('only its own fire chokes a stone head: not the sword, a shot, the rope, or S', () => {
  const t = setup({ where: lr('0,-1', 11, 4) });
  const { VL } = t;
  const head = t.game.room.entities.find((e) => e.id === 'd4SpoutHall');
  assert.ok(VL.ENTITIES.fireSpout.isSwitch && VL.ENTITIES.fireSpout.solid);
  assert.equal(VL.ENTITIES.fireSpout.onShot, undefined, 'a shot tinks off it');
  VL.ENTITIES.fireSpout.onInteract(t.game, head);
  assert.equal(VL.currentPopup(t.game).text, VL.SPOUT_WORDS);
  t.game.message = null;
  // Another head's fire, or the Dragon's, does not count.
  VL.ENTITIES.fireSpout.onFire(t.game, head, { owner: { type: 'fireSpout', id: 'd4SpoutLedge' } });
  assert.ok(!t.d.switches.d4SpoutHall);
  VL.ENTITIES.fireSpout.onFire(t.game, head, { owner: head });
  assert.ok(t.d.switches.d4SpoutHall);
});

test('the choked heads survive a reload (saved in the dungeon\'s switches)', () => {
  const t = setup({ where: lr('0,-1', 11, 4) });
  const { VL } = t;
  t.d.switches.d4SpoutHall = true;
  const storage = VL.createStorage(memoryStorage());
  VL.saveSlot(storage, 0, t.game);
  const again = VL.loadSlot(storage, 0);
  VL.place(again, lr('0,-1', 11, 4));
  assert.ok(again.room.entities.find((e) => e.id === 'd4SpoutHall').on);
});

// ---------- the boss door and the Dragon ----------

test('the boss door: with the boss key but no sword it stays shut and says why; with one it opens', () => {
  const t = setup({ where: lr('0,-2', 7, 1) });
  const { VL } = t;
  VL.giveBossKey(t.game, AREA);
  t.hold(['up'], 0.6);
  assert.ok(!t.d.doors.d4BossDoor);
  assert.equal(t.game.dungeonNote?.text, VL.LAIR_SWORD_WORDS);
  t.arm();
  t.hold(['up'], 0.6);
  assert.ok(t.d.doors.d4BossDoor);
});

function bossRoom() {
  const t = setup();
  t.d.doors.d4BossDoor = true;
  t.place(lr('0,-3', 7, 6));
  t.arm();
  return t;
}
const dragonOf = (t) => t.find('dragon');

test('the Dragon: the sword clinks off its scales and says to bounce its fire back', () => {
  const t = bossRoom();
  const { VL } = t;
  const d = dragonOf(t);
  d.arriving = 0;
  VL.hitEnemy(t.game, d, 1, { x: 0, y: 0 }, 'woodSword');
  assert.deepEqual([d.life, d.rounds, d.mode], [VL.TUNING.dragonRoundLife, 3, 'prowl']);
  assert.equal(t.game.dungeonNote.text, VL.DRAGON_SWORD_NOTE);
  assert.equal(d.hurt, 0, 'no hurt blink');
});

test('the Dragon breathes fire at the hero; bounced home with the Mirror Shield it falls dazed, and then the sword counts', () => {
  const t = bossRoom();
  const { VL } = t;
  const d = dragonOf(t);
  t.game.player.facing = 'up';
  t.until(() => t.find('dragonFire'), VL.TUNING.dragonBreatheEvery + VL.TUNING.dragonInhaleSeconds + 1, ['offHand']);
  assert.equal(t.find('dragonFire').owner, d);
  t.until(() => d.mode === 'dazed', 3, ['offHand']);
  assert.equal(VL.enemyHarmful(d), false, 'harmless while dazed');
  VL.hitEnemy(t.game, d, 1, { x: 0, y: 0 }, 'woodSword');
  assert.equal(d.life, VL.TUNING.dragonRoundLife - 1);
  t.game.player.invuln = 99;
  t.until(() => d.mode === 'prowl', VL.TUNING.dragonDazedSeconds + VL.TUNING.dragonRecoverSeconds + 0.3);
  assert.equal(d.life, VL.TUNING.dragonRoundLife - 1, 'the hit already landed still counts');
});

test('the Dragon\'s fire hurts a hero without the Mirror Shield a full heart, so it can make him faint; a shot only tinks', () => {
  const t = bossRoom();
  const { VL } = t;
  t.arm('metalShield');
  const hp = t.game.hp;
  t.game.player.facing = 'up';
  t.until((g) => g.hp < hp, 6, ['offHand']);
  assert.equal(hp - t.game.hp, 2);
  const d = dragonOf(t);
  assert.equal(VL.ENEMIES.dragon.onShot(t.game, d), true);
  assert.equal(d.mode === 'dazed', false);
  assert.equal(VL.faintLine('dragon'), 'The Dragon\'s fire was just too hot.');
});

test('the Dragon takes three bounce-and-strike rounds, then goes up in a puff of smoke', () => {
  const t = bossRoom();
  const { VL } = t;
  const d = dragonOf(t);
  d.arriving = 0;
  t.game.player.invuln = 99;
  for (let round = 1; round <= 3; round += 1) {
    t.until(() => d.mode === 'prowl' || d.mode === 'inhale', 2);
    VL.ENEMIES.dragon.onFire(t.game, d, { owner: d });
    assert.equal(d.mode, 'dazed', `round ${round}: dazed`);
    for (let hit = 1; hit <= VL.TUNING.dragonRoundLife; hit += 1) VL.hitEnemy(t.game, d, 1, { x: 0, y: 0 }, 'woodSword');
    if (round < 3) assert.equal(d.mode, 'recover', `round ${round} done: it shakes itself awake`);
  }
  assert.equal(d.mode, 'dying');
  t.until(() => VL.bossBeaten(t.game, AREA), VL.TUNING.dragonDyingSeconds + 0.5);
  // A spout's fire would not have dazed it.
  const again = bossRoom();
  const other = dragonOf(again);
  VL.ENEMIES.dragon.onFire(again.game, other, { owner: { type: 'fireSpout' } });
  assert.equal(other.mode, 'prowl');
});

test('beaten: the hoard spills three books (held up), a heart where it stood, the gate shut and no warp until the heart is taken, and d4Boss reached', () => {
  const t = bossRoom();
  const { VL } = t;
  const d = dragonOf(t);
  Object.assign(d, { mode: 'dying', timer: 99, arriving: 0 });
  t.step();
  assert.ok(VL.bossBeaten(t.game, AREA));
  for (const id of VL.HOARD_BOOKS) assert.ok(VL.spotFound(t.game, id), id);
  assert.deepEqual(plain(VL.booksCarried(t.game)), [...VL.HOARD_BOOKS]);
  assert.deepEqual(plain(t.game.holdUp.sprites), ['pickup-book']);
  assert.equal(VL.currentPopup(t.game).title, VL.HOARD_WORDS.title);
  assert.ok(t.game.room.entities.find((e) => e.art === 'lairHoard').spilled, 'books all over the floor');
  const heart = t.game.room.entities.find((e) => e.type === 'heartContainer' && e.id === 'heartD4');
  assert.deepEqual([heart?.x, heart?.y], [7, 2]);
  assert.ok(t.game.room.entities.find((e) => e.bossGate).closed, 'the gate stays shut with the heart on the floor');
  assert.ok(!t.game.room.entities.some((e) => e.type === 'warp'));
  assert.ok(VL.LOCKS.d4Boss.reached(t.game));
  VL.ENTITIES.heartContainer.onStand(t.game, heart);
  t.game.holdUp = null;
  t.game.message = null;
  t.game.popups.queue.length = 0;
  t.step();
  assert.ok(t.game.room.entities.some((e) => e.type === 'warp' && e.x === 7 && e.y === 8), 'the warp once the heart is taken');
  t.place(lr('0,-3', 7, 6));
  assert.ok(t.game.room.entities.find((e) => e.art === 'lairHoard').spilled, 'still spilled on the next visit');
  assert.ok(!t.find('dragon'));
});

// ---------- the table ----------

test('W19 claims dragonsLairEntered, mirrorShield and d4Boss with the doors they lie behind; one lock per key and door; the hoard supplies three books', () => {
  const { VL } = loadGame();
  for (const id of ['dragonsLairEntered', 'mirrorShield', 'd4Boss', 'd4KeyA', 'd4DoorA', 'd4KeyB', 'd4DoorB', 'd4BossKey', 'd4BossDoor']) assert.ok(VL.LOCKS[id].reached, `${id} is implemented`);
  assert.deepEqual([...VL.LOCKS.mirrorShield.needs], ['dragonsLairEntered', 'd4DoorA']);
  assert.deepEqual([...VL.LOCKS.d4DoorB.needs], ['mirrorShield'], 'key A can never be spent on door B');
  assert.ok(VL.LOCKS.d4BossDoor.needs.some((need) => Array.isArray(need) && SWORDS.every((s) => need.includes(s))));
  assert.ok(VL.LOCKS.d4Boss.needs.includes('d4BossDoor') && VL.LOCKS.d4Boss.needs.includes('mirrorShield'));
  assert.deepEqual({ ...VL.LOCKS.d4Boss.supplies }, { books: 3 });
  assert.deepEqual([...VL.LOCKS.d4Boss.gives], ['heartD4']);
  assert.deepEqual(plain(VL.LOCKS.dragonsLairEntered.place), { area: AREA, screen: '0,0' });
  assert.deepEqual([...VL.solveProgression().problems], []);
});

// ---------- the fixture ----------

test('the W19 fixture (played through to the Dragon) loads with no field reset', () => {
  const { VL } = loadGame();
  const text = fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v1-W19.json'), 'utf8');
  const backing = memoryStorage({ [VL.slotKey(0)]: text });
  assert.deepEqual(plain(VL.readSlot(VL.createStorage(backing), 0).resets || []), []);
  const game = VL.loadSlot(VL.createStorage(backing), 0);
  const d = plain(game.dungeons.lair);
  assert.deepEqual([d.boss, d.bossKey, d.map], [true, true, true]);
  assert.deepEqual(Object.keys(d.doors).sort(), ['d4BossDoor', 'd4DoorA', 'd4DoorB']);
  assert.ok(VL.hasItem(game, 'mirrorShield') && VL.hasItem(game, 'climbersAlmanac') && VL.LOCKS.d4Boss.reached(game));
  assert.equal(game.tileChanges['overworld:-1,-2']['10,4'], 'i', 'the hidden path open');
  assert.deepEqual(plain([game.savePoint.area, game.savePoint.screen]), ['overworld', '-1,-5'], 'Continue starts on the lair\'s doorstep');
});

// ---------- the playthrough, one lock at a time ----------

const BEFORE = ['named', 'start', 'chestGear', 'scriptoriumKey', 'scriptoriumEntered', 'liftingGloves', 'd1Boss', 'woodsMapCopy', 'hollowOakEntered', 'grapplingRope', 'd2Boss', 'shockwave', 'raft', 'lakeIsland', 'shipwreck', 'lighthouseEntered', 'slingshot', 'd3Boss', 'climbersAlmanac', 'highlands'];

test('the W19 steps drive the story milestones from the title to the Dragon, reloading after each', () => {
  const { VL } = loadGame();
  for (const id of ['climbersAlmanac', 'highlands', 'dragonsLairEntered', 'mirrorShield', 'd4Boss']) assert.equal(typeof registry[id], 'function', id);
  const drive = createPlaythrough(VL).playTo('d4Boss');
  assert.ok(VL.LOCKS.d4Boss.reached(drive.state) && VL.spotFound(drive.state, 'heartD4'));
  assert.deepEqual(plain([drive.state.player.area, drive.state.player.screen]), ['overworld', '-1,-5'], 'out on the doorstep');
});

test('a faint anywhere in the lair, after each lock, never leaves it unsolvable', () => {
  const { VL } = loadGame();
  const steps = { ...registry, ...route };
  for (let n = 1; n < ROUTE.length; n += 1) {
    const play = createPlaythrough(VL, { milestones: [...BEFORE, ...ROUTE], steps });
    const drive = play.playTo(ROUTE[n - 1]);
    VL.faint(drive.state, 'dragon');
    drive.update();
    drive.hold([], 0.7);
    drive.press('interact');
    assert.deepEqual([drive.state.player.area, drive.state.player.screen, VL.heroTile(drive.state).tx, VL.heroTile(drive.state).ty], [AREA, '0,0', 3, 2], `woke at the statue after ${ROUTE[n - 1]}`);
    for (const id of ROUTE.slice(n)) {
      drive.fight = false;
      route[id](drive);
      assert.ok(VL.LOCKS[id].reached(drive.state), `${id} after fainting at ${ROUTE[n - 1]}`);
    }
  }
});

// ---------- words and drawing ----------

test('every word the lair says fits its box and its font', () => {
  const { VL } = loadGame();
  const boxes = [];
  for (const screen of Object.values(VL.AREAS.lair.screens)) for (const e of screen.entities) if (e.type === 'sign') boxes.push({ title: e.title, text: e.text });
  assert.equal(boxes.length, 3);
  boxes.push(VL.POPUPS.mirrorShield, VL.HOARD_WORDS, { text: VL.SPOUT_WORDS });
  for (const id of VL.HOARD_BOOKS) boxes.push({ title: 'You found a book!', text: VL.BOOKS[id].blurb });
  for (const box of boxes) {
    assert.deepEqual(plain(VL.ART.missingGlyphs(`${box.title || ''} ${box.text}`)), [], box.text);
    assert.ok(!VL.ART.popupLayout(box).overflow, `fits: ${box.text}`);
  }
  for (const note of [VL.LAIR_SWORD_WORDS, VL.DRAGON_SWORD_NOTE, VL.SHIELD_FIRE_NOTE, VL.DRAGON_WORDS.beaten]) {
    assert.deepEqual(plain(VL.ART.missingGlyphs(note, 'small')), [], note);
    assert.ok(VL.ART.measureText(note, 'small') <= VL.TUNING.width - 8, note);
  }
  assert.deepEqual(plain(VL.ART.missingGlyphs(VL.faintLine('dragon'))), []);
});

test('render smoke: every lair room draws, fire in flight, the heads charged and choked, the Dragon in each of its moods, and the hoard spilled', () => {
  const t = setup({ enemies: true });
  const { VL } = t;
  const ctx = fakeDocument().createElement('canvas').getContext('2d');
  const draw = () => {
    const before = Object.values(ctx.calls).reduce((sum, n) => sum + n, 0);
    VL.render(ctx, t.app, 0.4);
    return Object.values(ctx.calls).reduce((sum, n) => sum + n, 0) - before;
  };
  t.d.doors.d4BossDoor = true;
  for (const screen of Object.keys(VL.AREAS.lair.screens)) {
    t.place(lr(screen, 7, screen === '0,-3' ? 8 : 5));
    t.step();
    assert.ok(draw() > 100, `${screen} draws`);
  }
  t.place(lr('0,-1', 11, 4));
  t.arm();
  t.until(() => t.find('dragonFire'), 3);
  assert.ok(draw() > 100, 'fire in flight');
  t.game.room.entities.find((e) => e.type === 'fireSpout').on = true;
  assert.ok(draw() > 100, 'a choked head');
  t.place(lr('0,-3', 7, 8));
  const d = dragonOf(t);
  for (const mode of ['prowl', 'inhale', 'dazed', 'recover', 'dying']) {
    Object.assign(d, { mode, timer: 0.5, shake: mode === 'prowl' ? 0.2 : 0 });
    assert.ok(draw() > 50, mode);
  }
  t.game.room.entities.find((e) => e.art === 'lairHoard').spilled = true;
  assert.ok(draw() > 100, 'the hoard spilled');
  for (const id of ['item-shield-mirror', 'item-climbers-almanac', 'prop-fire-spout', 'prop-fire-spout-cold', 'fx-fire-0', 'fx-fire-1', 'enemy-dragon-0', 'enemy-dragon-breath-0', 'enemy-dragon-dazed']) {
    assert.ok(VL.ART.SPRITES[id], id);
  }
});

test('README documents the lair, fire, the Mirror Shield and the Dragon', () => {
  const readme = read('README.md');
  for (const word of ['## The Dragon\'s Lair (W19)', 'save-v1-W19.json', 'fireSpout', 'VL.spawnFire', 'onFire', 'mirrorShield', 'HOARD_BOOKS']) {
    assert.ok(readme.includes(word), `README mentions ${word}`);
  }
});
