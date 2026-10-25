// Dungeon 3, the Lighthouse (W18): the door only the Glowstone opens, the
// rooms and their lints, dark rooms and their lamps, the Slingshot and its
// shells, targets across gaps, the beam and its mirrors, the Lens Crab, the
// rewards and the thief taking the Primer after it, the locks in the table
// (and that the map tells the truth about them), the fixture, the
// playthrough one lock at a time with a faint after each, and a render smoke.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, loadGame, memoryStorage, fakeDocument, read } = require('./harness');
const { createPlaythrough, registry, findPath } = require('./playthrough');
const { route, ROUTE, at } = require('./lighthouse-route');

const STEP = 1 / 60;
const plain = (value) => JSON.parse(JSON.stringify(value));
const AREA = 'lighthouse';
const lh = (screen, tx, ty, facing = 'up') => ({ area: AREA, screen, tx, ty, facing });

function setup({ where, enemies = false, items = ['glowstone'] } = {}) {
  const { VL } = loadGame();
  const app = VL.createApp();
  app.game = VL.newGame({ name: 'Robin' });
  app.setScene('play');
  app.game.popups.seen.controls = true;
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
      if (!enemies) app.game.room.entities = app.game.room.entities.filter((e) => !VL.isEnemy(e) || e.type === 'lensCrab');
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
    // The slingshot in the main hand, `n` broken shells.
    arm(n = 10) {
      app.game.items.slingshot = true;
      app.game.hands = { mainHand: 'slingshot', offHand: null };
      app.game.inventory.brokenShells = n;
    },
    // Faces `dir` and fires, then waits for the shell to land.
    shoot(dir) {
      app.game.player.facing = dir;
      app.game.player.sling = 0;
      t.press('mainHand');
      t.until((g) => !g.room.entities.some((e) => e.type === 'slingPellet'), 2);
    },
  };
  if (where) t.place(where);
  return t;
}

// A loaded save in play, in slot 0 of an in-memory store.
function fixtureApp(VL, name) {
  const text = fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
  const storage = VL.createStorage(memoryStorage({ [VL.slotKey(0)]: text }));
  const app = VL.createApp({ storage });
  app.startGame(VL.loadSlot(storage, 0), 0);
  app.setScene('play');
  return app;
}

// ---------- the way in ----------

test('the Lighthouse door: dark and shut without the Glowstone, in to the entrance hall with it, and the mat leads back out', () => {
  const t = setup({ items: [], where: { area: 'overworld', screen: '-1,1', tx: 7, ty: 5, facing: 'up' } });
  const { VL } = t;
  const door = VL.getScreen('overworld', '-1,1').entities.find((e) => e.spot === 'lighthouseDoor');
  assert.deepEqual(plain([door.type, door.needs, door.to]), ['door', 'glowstone', { area: AREA, screen: '0,0', tx: 7, ty: 9, facing: 'up' }]);
  assert.ok(!VL.unfilledSpots().includes('lighthouseDoor'));
  t.hold(['up'], 0.6);
  assert.equal(t.game.player.area, 'overworld', 'no light, no way in');
  const lit = setup({ where: { area: 'overworld', screen: '-1,1', tx: 7, ty: 5, facing: 'up' } });
  lit.until((g) => g.player.area === AREA, 1, ['up']);
  t.app.game = lit.game;
  assert.deepEqual([t.game.player.screen, VL.heroTile(t.game).tx, VL.heroTile(t.game).ty], ['0,0', 7, 9]);
  const out = VL.getScreen(AREA, '0,0').entities.find((e) => e.type === 'door');
  assert.deepEqual(plain([out.x, out.y, out.to]), [7, 10, plain(VL.DUNGEONS.lighthouse.entrance)]);
  assert.ok(VL.LOCKS.lighthouseEntered.reached(t.game));
  assert.equal(VL.DUNGEONS.lighthouse.name, 'Lighthouse');
});

test('without the Glowstone, walking into the Lighthouse door says why', () => {
  const t = setup({ items: [], where: { area: 'overworld', screen: '-1,1', tx: 7, ty: 5, facing: 'up' } });
  const { VL } = t;
  t.hold(['up'], 0.6);
  assert.equal(t.app.sceneId === 'popup' || Boolean(VL.currentPopup(t.game)), true, 'a message shows');
  assert.equal(VL.currentPopup(t.game).text, VL.LIGHTHOUSE_DARK_WORDS);
});

test('the doorstep is safe: Continue after the win lands there, and nothing hurts him while he stands still', () => {
  const t = setup({ enemies: true });
  const { VL } = t;
  const step = VL.DUNGEONS.lighthouse.entrance;
  assert.ok(!VL.isSolidAt(step.area, step.screen, step.tx, step.ty));
  t.game.savePoint = { ...step };
  t.place(lh('0,0', 7, 7));
  VL.faint(t.game);
  t.hold([], 0.7);
  t.press('interact');
  assert.deepEqual([t.game.player.area, t.game.player.screen, VL.heroTile(t.game).tx, VL.heroTile(t.game).ty], [step.area, step.screen, step.tx, step.ty], 'woke on the doorstep');
  const hp = t.game.hp;
  t.hold([], 15);
  assert.ok(t.game.hp >= hp - 1, `fifteen seconds standing on the doorstep costs at most half a heart (${hp - t.game.hp})`);
});

// ---------- layout ----------

test('every lint is clean: locks, doors, blocks; 8 to 14 rooms', () => {
  const { VL } = loadGame();
  assert.deepEqual([...VL.dungeonProblems()], []);
  const rooms = Object.keys(VL.AREAS.lighthouse.screens);
  assert.ok(rooms.length >= 8 && rooms.length <= 14, `${rooms.length} rooms`);
  assert.equal(VL.TILESETS.lighthouse.x.flyOver, undefined, 'the cistern water is no chicken flight');
});

test('the map tells the truth: key A and door A on foot; key B, door B and the boss key only past targets a shot must hit', () => {
  const t = setup();
  const { VL } = t;
  const d = t.d;
  for (const id of ['d3DoorA', 'd3DoorB']) d.doors[id] = true;
  const from = at('0,0', 7, 8);
  const reachable = (screen, id) => {
    const e = VL.getScreen(AREA, screen).entities.find((x) => x.id === id);
    return [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => findPath(VL, from, at(screen, e.x + dx, e.y + dy), t.game));
  };
  assert.ok(reachable('-1,0', 'd3KeyA'), 'key A on foot');
  assert.ok(findPath(VL, from, at('0,-1', 14, 5), t.game), 'door A on foot');
  assert.ok(!findPath(VL, from, at('0,-2', 7, 5), t.game), 'the gallery (door B, the boss door) waits on the stairwell target');
  assert.ok(!findPath(VL, from, at('1,0', 7, 1), t.game), 'the cistern waits on the store target');
  // Targets, and the island mirrors, have no floor beside them: only a shot reaches them.
  for (const [screen, id] of [['0,-1', 'd3TargetStair'], ['1,-1', 'd3TargetStore']]) assert.ok(!reachable(screen, id), `${id} is out of reach`);
  for (const [screen, x, y] of [['1,0', 10, 8], ['1,-2', 12, 8]]) {
    assert.ok(![[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => !VL.isSolidAt(AREA, screen, x + dx, y + dy)), `the mirror at ${screen} (${x},${y}) stands on an island`);
  }
  d.switches.d3TargetStore = true;
  d.switches.d3TargetStair = true;
  assert.ok(!reachable('1,0', 'd3KeyB'), 'key B sits behind the cistern\'s bars');
  d.switches.d3CrystalCistern = true;
  t.place(lh('1,0', 7, 1));
  assert.ok(findPath(VL, at('1,0', 7, 1), at('1,0', 14, 8), t.game), 'lit, the bars lift on key B');
});

// ---------- dark rooms ----------

test('dark rooms: black past the Glowstone\'s light until every lamp is lit (S with the Glowstone), and lit for good through a reload', () => {
  const t = setup({ where: lh('-1,0', 14, 5, 'down') });
  const { VL } = t;
  assert.deepEqual(Object.keys(VL.DARK_ROOMS).filter((k) => k.startsWith(`${AREA}:`)).sort(), ['lighthouse:-1,-2', 'lighthouse:-1,0', 'lighthouse:0,-2', 'lighthouse:1,-2', 'lighthouse:1,0']);
  assert.ok(VL.roomIsDark(t.game));
  assert.ok(!VL.roomIsDark({ ...t.game, room: { ...t.game.room, screen: '0,0' } }), 'the entrance is not dark');
  t.press('interact');
  assert.ok(t.d.switches.d3LampCellarA, 'the lamp below him is lit');
  assert.ok(VL.roomIsDark(t.game), 'one of two: still dark');
  t.place(lh('-1,0', 2, 2, 'right'));
  t.press('interact');
  assert.ok(!VL.roomIsDark(t.game), 'both lit: the cellar is lit');
  t.place(lh('-1,0', 14, 5));
  assert.ok(!VL.roomIsDark(t.game), 'and stays lit on the next visit');
});

test('a lamp without the Glowstone stays cold and says so', () => {
  const t = setup({ items: [], where: lh('-1,0', 14, 5, 'down') });
  const { VL } = t;
  t.press('interact');
  assert.ok(!t.d.switches.d3LampCellarA);
  assert.equal(VL.currentPopup(t.game).text, VL.LAMP_COLD);
});

test('fair in the dark: the Glowstone lights a wide circle, and every key, switch, mirror, lamp and door in a dark room glints', () => {
  const { VL } = loadGame();
  const game = VL.newGame();
  game.items.glowstone = true;
  assert.ok(VL.glowRadius(game).inner >= 2.5 * VL.TUNING.tile, 'two and a half tiles clear all round');
  assert.ok(VL.glowRadius(game).outer >= 5 * VL.TUNING.tile, 'and a glow out to five');
  delete game.items.glowstone;
  assert.ok(VL.glowRadius(game).outer < 2 * VL.TUNING.tile, 'without it, a hand\'s breadth');
  const PUZZLE = ['smallKey', 'bossKey', 'dungeonMap', 'switch', 'shellTarget', 'beamMirror', 'beamCrystal', 'glowLamp', 'lockedDoor', 'shutter', 'shellHeap', 'beamSource', 'bigChest'];
  for (const key of Object.keys(VL.DARK_ROOMS)) {
    const [area, screen] = key.split(':');
    for (const e of VL.getScreen(area, screen).entities) {
      if (!PUZZLE.includes(e.type)) continue;
      const def = VL.ENTITIES[e.type];
      assert.ok(VL.DARK_GLINTS.has(e.type) || def.glintsInDark || def.glowsInDark, `${e.type} in ${key} shows in the dark`);
    }
  }
});

test('render: a dark room draws the dark over the room, with glints past the light; a lit one does not', () => {
  const t = setup({ where: lh('-1,0', 14, 5), enemies: true });
  const { VL } = t;
  const base = fakeDocument().createElement('canvas').getContext('2d');
  let gradients = 0;
  const ctx = new Proxy(base, {
    get(target, property) {
      if (property !== 'createRadialGradient') return base[property];
      return (...args) => {
        gradients += 1;
        return base.createRadialGradient(...args);
      };
    },
    set: () => true,
  });
  const sparkles = [];
  const sparkle = VL.ART.drawSparkle;
  VL.ART.drawSparkle = (c, x, y, time) => {
    sparkles.push([x, y]);
    return sparkle(c, x, y, time);
  };
  VL.render(ctx, t.app, 1);
  assert.equal(gradients, 2, 'the dark and the area light');
  assert.ok(sparkles.length >= 2, 'the lamp and key glint past the light');
  t.d.switches.d3LampCellarA = true;
  t.d.switches.d3LampCellarB = true;
  t.place(lh('-1,0', 14, 5));
  gradients = 0;
  VL.render(ctx, t.app, 1);
  VL.ART.drawSparkle = sparkle;
  assert.equal(gradients, 1, 'lit: the area light only');
});

test('a hurt hero flashing in a dark room never flashes the dark or the beam with him (no strobe)', () => {
  const t = setup({ where: lh('-1,0', 14, 5) });
  const { VL } = t;
  const base = fakeDocument().createElement('canvas').getContext('2d');
  let gradients = 0;
  const ctx = new Proxy(base, {
    get(target, property) {
      if (property !== 'createRadialGradient') return base[property];
      return (...args) => {
        gradients += 1;
        return base.createRadialGradient(...args);
      };
    },
    set: () => true,
  });
  let heroDrawn = 0;
  const drawHero = VL.ART.drawHero;
  VL.ART.drawHero = (...args) => {
    heroDrawn += 1;
    return drawHero(...args);
  };
  const beamRects = [];
  const rect = VL.ART.rect;
  VL.ART.rect = (c, color, ...rest) => {
    if (color === 'beamGlow') beamRects.push(rest);
    return rect(c, color, ...rest);
  };
  try {
    for (const flash of [0.5, 0.45, 0.4, 0.35]) {
      t.game.player.flash = flash;
      gradients = 0;
      VL.render(ctx, t.app, 1);
      assert.equal(gradients, 2, `flash ${flash}: the dark and the area light are drawn`);
    }
    assert.equal(heroDrawn, 2, 'the hero himself still flashes (2 of the 4 frames)');
    t.place(lh('1,0', 9, 2, 'right'));
    t.game.player.flash = 0.45;
    VL.render(ctx, t.app, 1);
    assert.ok(beamRects.length > 0, 'the beam is drawn on the hero\'s off frame');
  } finally {
    VL.ART.drawHero = drawHero;
    VL.ART.rect = rect;
  }
});

// ---------- the Slingshot ----------

test('the Slingshot: each shot costs one broken shell; with none it says where to find more and fires nothing', () => {
  const t = setup({ where: lh('0,0', 7, 6) });
  const { VL } = t;
  t.arm(2);
  t.shoot('right');
  assert.equal(t.game.inventory.brokenShells, 1);
  t.shoot('right');
  assert.equal(t.game.inventory.brokenShells, 0);
  t.game.player.sling = 0;
  t.press('mainHand');
  assert.ok(!t.game.room.entities.some((e) => e.type === 'slingPellet'), 'nothing fired');
  assert.equal(t.game.dungeonNote.text, VL.OUT_OF_SHELLS.dungeon);
  // Outside, the beaches.
  t.place({ area: 'overworld', screen: '1,1', tx: 7, ty: 6 });
  t.game.player.sling = 0;
  t.press('mainHand');
  assert.equal(VL.currentPopup(t.game).text, VL.OUT_OF_SHELLS.outside);
});

test('the Slingshot: a shell flies over pits and water, stops at a wall, and goes no farther than its range', () => {
  const t = setup({ where: lh('1,0', 10, 3, 'down') });
  const { VL } = t;
  t.arm();
  let farthest = 0;
  t.game.player.facing = 'left';
  t.game.player.sling = 0;
  t.press('mainHand');
  for (let s = 0; s < 2; s += STEP) {
    const p = t.find('slingPellet');
    if (!p) break;
    farthest = Math.min(farthest, p.gx - t.game.player.x);
    t.step();
  }
  assert.ok(farthest < -8 * VL.TUNING.tile && farthest >= -9.6 * VL.TUNING.tile, `stopped at the west wall (${farthest})`);
  t.place(lh('0,0', 7, 1, 'down'));
  t.game.player.sling = 0;
  t.press('mainHand');
  let dist = 0;
  for (let s = 0; s < 2; s += STEP) {
    const p = t.find('slingPellet');
    if (!p) break;
    dist = p.dist;
    t.step();
  }
  assert.ok(dist <= VL.TUNING.slingshotTiles * VL.TUNING.tile);
});

test('targets across a gap: a shot throws one for good; S, the sword and the rope\'s hook do not', () => {
  const t = setup({ where: lh('0,-1', 2, 4, 'up') });
  const { VL } = t;
  // The rope first: it reaches, but a target is not a switch.
  VL.giveItem(t.game, 'grapplingRope');
  t.game.popups.queue.length = 0;
  t.game.hands = { mainHand: 'grapplingRope', offHand: null };
  t.press('mainHand');
  t.until((g) => !g.player.rope, 3);
  assert.ok(!t.d.switches.d3TargetStair, 'the hook bounces off a target');
  t.arm();
  t.shoot('up');
  assert.ok(t.d.switches.d3TargetStair, 'the shot hit it');
  const shutter = t.game.room.entities.find((e) => e.id === 'd3ShutterStair');
  t.step();
  assert.equal(shutter.closed, false, 'the bars are up');
  t.place(lh('0,-1', 7, 3));
  assert.equal(t.game.room.entities.find((e) => e.id === 'd3ShutterStair').closed, false, 'and stay up');
});

test('a shot throws a W13 lever across a pit too', () => {
  const t = setup({ where: lh('1,0', 10, 3, 'down') });
  const { VL } = t;
  t.arm();
  t.game.room.entities.push({ type: 'switch', id: 'd3TestLever', x: 10, y: 6 });
  t.shoot('down');
  assert.ok(t.d.switches.d3TestLever);
  assert.equal(VL.LOCKS.d3Boss.reached(t.game), false);
});

test('the Slingshot stuns a creature: it holds still and is harmless for a moment, unhurt', () => {
  const t = setup({ where: lh('0,-1', 6, 7, 'right'), enemies: true });
  const { VL } = t;
  t.arm();
  const slime = t.find('slime');
  slime.arriving = 0;
  Object.assign(t.game.player, VL.tileCenter(VL.tileOf(slime.cx, slime.cy).tx - 3, VL.tileOf(slime.cx, slime.cy).ty));
  t.shoot('right');
  assert.ok(slime.stunned > 0 && slime.arriving > 0, 'stunned');
  assert.equal(slime.hp, VL.ENEMIES.slime.hp, 'unhurt');
  assert.equal(VL.enemyHarmful(slime), false);
  const at0 = [slime.cx, slime.cy];
  t.hold([], 1);
  assert.deepEqual([slime.cx, slime.cy], at0, 'holds still');
  t.hold([], VL.TUNING.slingshotStunSeconds);
  assert.ok(!(slime.stunned > 0));
});

test('shell heaps top the hero up as often as he likes, so a kid never runs dry: one in the entrance, beside every shot puzzle and in the boss room', () => {
  const t = setup({ where: lh('0,0', 12, 7, 'down') });
  const { VL } = t;
  t.press('interact');
  assert.equal(t.game.inventory.brokenShells, VL.TUNING.shellHeapFill);
  assert.ok(VL.LOCKS.lighthouseShells.reached(t.game));
  t.game.inventory.brokenShells = 3;
  t.press('interact');
  assert.equal(t.game.inventory.brokenShells, VL.TUNING.shellHeapFill, 'again');
  const heaps = (screen) => VL.getScreen(AREA, screen).entities.filter((e) => e.type === 'shellHeap').length;
  for (const screen of ['0,0', '1,-1', '1,0', '0,-2', '0,-3']) assert.ok(heaps(screen) >= 1, `a heap in ${screen}`);
  assert.ok(heaps('0,-3') >= 2, 'two in the boss room');
  assert.ok(VL.TUNING.shellHeapFill >= 10);
});

test('the HUD shows the broken shells left beside the slingshot in its slot', () => {
  const t = setup({ where: lh('0,0', 7, 6) });
  const { VL } = t;
  t.arm(7);
  const texts = [];
  const text = VL.ART.text;
  VL.ART.text = (ctx, str, ...rest) => {
    texts.push(String(str));
    return text(ctx, str, ...rest);
  };
  VL.ART.drawHud(fakeDocument().createElement('canvas').getContext('2d'), t.game, 0);
  VL.ART.text = text;
  assert.ok(texts.includes('7'));
});

// ---------- the beam ----------

test('the beam: it bends at mirrors, stops at walls, and the crystal it reaches is lit for good', () => {
  const t = setup({ where: lh('1,0', 9, 2, 'right') });
  const { VL } = t;
  const [first] = VL.roomBeams(t.game.room);
  assert.equal(first.crystal, null, 'as found, the floor mirror sends it up into the wall');
  t.press('interact');
  const mirror = t.game.room.entities.find((e) => e.type === 'beamMirror' && e.x === 10 && e.y === 2);
  assert.equal(mirror.turn, '\\', 'S turns the floor mirror');
  assert.equal(VL.roomBeams(t.game.room)[0].crystal, null, 'down over the water to the island mirror, which sends it off east');
  t.arm();
  t.place(lh('1,0', 10, 3, 'down'));
  t.game.room.entities.find((e) => e.type === 'beamMirror' && e.x === 10 && e.y === 2).turn = '\\';
  t.shoot('down');
  assert.equal(t.game.room.entities.find((e) => e.type === 'beamMirror' && e.x === 10 && e.y === 8).turn, '/', 'a shot turns the island mirror');
  t.step();
  assert.ok(t.d.switches.d3CrystalCistern, 'the crystal is lit');
  assert.ok(VL.roomLit(t.game.room) && !VL.roomIsDark(t.game), 'and the cistern with it');
  t.step();
  assert.equal(t.game.room.entities.find((e) => e.id === 'd3ShutterKeyB').closed, false);
  t.place(lh('1,0', 7, 1));
  assert.ok(!VL.roomIsDark(t.game), 'lit for good, the mirrors as found again');
});

test('the workshop\'s beam: three mirrors (one on an island) reach the crystal, and only that way', () => {
  const t = setup({ where: lh('1,-2', 7, 4) });
  const { VL } = t;
  const mirrors = t.game.room.entities.filter((e) => e.type === 'beamMirror');
  assert.equal(mirrors.length, 3);
  const solutions = [];
  for (let n = 0; n < 8; n += 1) {
    mirrors.forEach((m, i) => { m.turn = (n >> i) & 1 ? '/' : '\\'; });
    if (VL.roomBeams(t.game.room)[0].crystal) solutions.push(mirrors.map((m) => m.turn).join(''));
  }
  assert.deepEqual(solutions, ['/\\/']);
  assert.notEqual(VL.getScreen(AREA, '1,-2').entities.filter((e) => e.type === 'beamMirror').map((m) => m.turn).join(''), '/\\/', 'not solved as found');
  assert.deepEqual(plain(VL.reflectBeam('/', 1, 0)), [0, -1]);
});

test('the beam passes the hero and pits but a closed shutter stops it', () => {
  const t = setup({ where: lh('1,0', 5, 2) });
  const { VL } = t;
  const room = t.game.room;
  const [beam] = VL.roomBeams(room);
  assert.equal(beam.points[1].x, 10 * 16 + 8, 'over the hero to the mirror');
  room.entities.push({ type: 'shutter', x: 6, y: 2, closed: true, solid: true });
  assert.equal(VL.roomBeams(room)[0].points[1].x, 5 * 16 + 16, 'stopped at the bars');
});

// ---------- the Lens Crab ----------

test('the boss door: with the boss key but no sword it stays shut and says a sword is needed; with one it opens', () => {
  const t = setup({ where: null });
  const { VL } = t;
  t.arm();
  t.place(lh('0,-2', 7, 1, 'up'));
  t.hold(['up'], 0.6);
  assert.equal(t.game.dungeonNote.text, 'The big lock needs the boss key.', 'no key: the key comes first');
  t.d.bossKey = true;
  t.game.dungeonNote = null;
  t.hold([], 0.1);
  t.hold(['up'], 0.6);
  assert.ok(!t.d.doors.d3BossDoor, 'no sword: still shut');
  assert.equal(t.game.player.screen, '0,-2');
  assert.equal(t.game.dungeonNote.text, VL.LIGHTHOUSE_SWORD_WORDS);
  VL.giveItem(t.game, 'woodSword');
  t.game.popups.queue.length = 0;
  t.hold([], 0.1);
  t.hold(['up'], 0.6);
  assert.ok(t.d.doors.d3BossDoor, 'a wood sword opens it');
  assert.ok(VL.LOCKS.d3BossDoor.needs.some((need) => Array.isArray(need) && need.includes('woodSword') && need.includes('metalSword')), 'the solver knows: any sword');
  VL.LOCKS.d3BossDoor.needs = VL.LOCKS.d3BossDoor.needs.filter((need) => !Array.isArray(need));
  assert.ok(VL.dungeonProblems().some((p) => p.includes('d3BossDoor wants woodSword or metalSword')), 'the lint sees a door that wants what its lock does not need');
});

function bossRoom() {
  const t = setup({ where: null });
  const { VL } = t;
  t.d.doors.d3BossDoor = true;
  t.place(lh('0,-3', 7, 7));
  for (const id of ['woodSword', 'slingshot']) VL.giveItem(t.game, id);
  t.game.popups.queue.length = 0;
  t.game.hands = { mainHand: 'woodSword', offHand: 'slingshot' };
  t.game.inventory.brokenShells = 15;
  return t;
}
const crabOf = (t) => t.find('lensCrab');

test('the Lens Crab: a sword clinks off the lens and says to shoot its eyes', () => {
  const t = bossRoom();
  const { VL } = t;
  const c = crabOf(t);
  c.arriving = 0;
  VL.hitEnemy(t.game, c, 1, { x: 0, y: 0 }, 'woodSword');
  assert.deepEqual([c.life, c.rounds, c.mode], [VL.TUNING.lensCrabRoundLife, 3, 'scuttle']);
  assert.equal(t.game.dungeonNote.text, VL.LENS_CRAB_SWORD_NOTE);
});

test('the Lens Crab: two shots at its face from below shut both eyes and daze it; the sword then counts; it wakes in time', () => {
  const t = bossRoom();
  const { VL } = t;
  const c = crabOf(t);
  t.hold([], VL.TUNING.enemyArrivalSeconds + 0.05);
  for (let i = 0; i < 2; i += 1) {
    Object.assign(t.game.player, VL.tileCenter(VL.tileOf(c.cx, c.cy).tx, 6), { facing: 'up', invuln: 5, sling: 0 });
    t.press('offHand');
    t.until(() => !t.find('slingPellet'), 1);
  }
  assert.equal(c.mode, 'dazed');
  assert.equal(VL.enemyHarmful(c), false, 'harmless while dazed');
  VL.hitEnemy(t.game, c, 1, { x: 0, y: 0 }, 'woodSword');
  assert.equal(c.life, VL.TUNING.lensCrabRoundLife - 1);
  t.until(() => c.mode === 'scuttle', VL.TUNING.lensCrabDazedSeconds + VL.TUNING.lensCrabRecoverSeconds + 0.3);
  assert.deepEqual(plain(c.eyes), { left: true, right: true }, 'eyes open again');
  assert.equal(c.life, VL.TUNING.lensCrabRoundLife - 1, 'the hit already landed still counts');
});

test('the Lens Crab: a shot from above or the side bounces off the lens; one eye shut opens again if the other is not hit', () => {
  const t = bossRoom();
  const { VL } = t;
  const c = crabOf(t);
  c.arriving = 0;
  VL.ENEMIES.lensCrab.onShot(t.game, c, { dy: 1, gx: c.cx });
  assert.deepEqual(plain(c.eyes), { left: true, right: true });
  assert.equal(t.game.dungeonNote.text, VL.LENS_CRAB_BACK_NOTE);
  VL.ENEMIES.lensCrab.onShot(t.game, c, { dy: -1, gx: c.cx - 5 });
  assert.deepEqual(plain(c.eyes), { left: false, right: true });
  t.game.player.invuln = 99;
  t.hold([], VL.TUNING.lensCrabEyeSeconds + 0.2);
  assert.deepEqual(plain(c.eyes), { left: true, right: true });
});

test('the Lens Crab takes three shoot-and-strike rounds; it throws light bolts a wood shield blocks', () => {
  const t = bossRoom();
  const { VL } = t;
  const c = crabOf(t);
  c.arriving = 0;
  t.game.player.invuln = 99;
  t.until(() => t.game.room.entities.some((e) => e.type === 'projectile' && e.owner === c), VL.TUNING.lensCrabGlintEvery + VL.TUNING.lensCrabGlintSeconds + 0.5);
  const bolt = t.game.room.entities.find((e) => e.type === 'projectile');
  assert.ok(VL.TUNING.shieldBlocks.woodShield.includes(bolt.size), 'a wood shield blocks it');
  for (let round = 1; round <= 3; round += 1) {
    t.until(() => c.mode === 'scuttle' || c.mode === 'glint', 2);
    VL.ENEMIES.lensCrab.onShot(t.game, c, { dy: -1, gx: c.cx - 1 });
    VL.ENEMIES.lensCrab.onShot(t.game, c, { dy: -1, gx: c.cx - 1 });
    assert.equal(c.mode, 'dazed', `round ${round}: dazed`);
    for (let hit = 1; hit <= VL.TUNING.lensCrabRoundLife; hit += 1) {
      c.hurt = 0;
      VL.hitEnemy(t.game, c, 1, { x: 0, y: 0 }, 'woodSword');
    }
    if (round < 3) assert.equal(c.mode, 'recover', `round ${round} done: it shakes itself awake`);
  }
  assert.equal(c.mode, 'dying');
  t.until(() => VL.bossBeaten(t.game, AREA), VL.TUNING.lensCrabDyingSeconds + 0.5);
});

test('beaten: the ore and the last page held up together, a heart container where it stood, the warp out, and d3Boss reached', () => {
  const t = bossRoom();
  const { VL } = t;
  const c = crabOf(t);
  const ore = t.game.inventory.ore;
  c.mode = 'dying';
  c.timer = 99;
  c.arriving = 0;
  t.step();
  assert.ok(VL.bossBeaten(t.game, AREA));
  assert.equal(t.game.inventory.ore, ore + 1);
  assert.ok(VL.spotFound(t.game, 'pageLighthouse') && VL.spotFound(t.game, 'oreLighthouse'));
  assert.deepEqual(plain(t.game.holdUp.sprites), ['pickup-ore', 'pickup-page']);
  assert.ok(t.game.room.entities.some((e) => e.type === 'heartContainer' && e.id === 'heartD3' && e.x === 7 && e.y === 3));
  assert.ok(t.game.room.entities.some((e) => e.type === 'warp' && e.x === 7 && e.y === 8));
  assert.ok(VL.LOCKS.d3Boss.reached(t.game));
  assert.ok(VL.loosePages(t.game) >= 1, 'the bindery counts the page');
});

test('after Dungeon 3, the thief takes the Primer on the next visit to the library (W11\'s rule fires on the real win)', () => {
  const { VL } = loadGame();
  const game = VL.newGame();
  game.flags['found:bookPrimer'] = true;
  VL.returnBooks(game);
  VL.finishReading(game, 'bookPrimer');
  VL.applyThefts(game);
  assert.ok(VL.primerOnShelf(game), 'safe before Dungeon 3');
  VL.dungeonState(game, AREA).boss = true;
  assert.ok(VL.LOCKS.d3Boss.reached(game));
  assert.deepEqual(plain(VL.applyThefts(game)).slice(0, 1), ['bookPrimer']);
  assert.ok(VL.LOCKS.primerTaken.reached(game));
});

// ---------- the table ----------

test('W18 claims lighthouseEntered, slingshot and d3Boss with the doors they lie behind; one lock per key and door; the heaps supply shells', () => {
  const { VL } = loadGame();
  for (const id of ['lighthouseEntered', 'slingshot', 'd3Boss', 'd3KeyA', 'd3DoorA', 'd3KeyB', 'd3DoorB', 'd3BossKey', 'd3BossDoor', 'lighthouseShells']) {
    assert.ok(VL.LOCKS[id].reached, `${id} is implemented`);
  }
  assert.deepEqual([...VL.LOCKS.lighthouseEntered.needs], ['cliffs', 'glowstone']);
  assert.deepEqual([...VL.LOCKS.slingshot.needs], ['lighthouseEntered', 'd3DoorA']);
  assert.deepEqual([...VL.LOCKS.d3DoorB.needs], ['slingshot'], 'key A can never be spent on door B');
  assert.ok(VL.LOCKS.d3Boss.needs.includes('d3BossDoor') && VL.LOCKS.d3Boss.needs.includes('brokenShells'));
  assert.deepEqual({ ...VL.LOCKS.d3Boss.supplies }, { ore: 1, pages: 1 });
  assert.deepEqual([...VL.LOCKS.lighthouseShells.gives], ['brokenShells']);
  assert.deepEqual(plain(VL.LOCKS.lighthouseEntered.place), { area: AREA, screen: '0,0' });
  assert.deepEqual([...VL.solveProgression().problems], []);
});

// ---------- the fixture ----------

test('the W18 fixture (played through to the Lens Crab) loads with no field reset', () => {
  const { VL } = loadGame();
  const text = fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v1-W18.json'), 'utf8');
  const backing = memoryStorage({ [VL.slotKey(0)]: text });
  assert.deepEqual(plain(VL.readSlot(VL.createStorage(backing), 0).resets || []), []);
  const game = VL.loadSlot(VL.createStorage(backing), 0);
  const d = plain(game.dungeons.lighthouse);
  assert.deepEqual([d.boss, d.bossKey, d.map], [true, true, true]);
  assert.deepEqual(Object.keys(d.doors).sort(), ['d3BossDoor', 'd3DoorA', 'd3DoorB']);
  assert.ok(VL.hasItem(game, 'slingshot') && VL.LOCKS.d3Boss.reached(game));
});

// ---------- the playthrough, one lock at a time ----------

const BEFORE = ['named', 'start', 'chestGear', 'scriptoriumKey', 'scriptoriumEntered', 'liftingGloves', 'd1Boss', 'woodsMapCopy', 'hollowOakEntered', 'grapplingRope', 'd2Boss', 'shockwave'];

test('playthrough: from the title through the shockwave and the Lighthouse, lock by lock, reloading after each, to the Lens Crab', () => {
  const { VL } = loadGame();
  const play = createPlaythrough(VL, { milestones: [...BEFORE, ...ROUTE], steps: { ...registry, ...route } });
  const drive = play.playTo('d3Boss');
  assert.ok(VL.hasItem(drive.state, 'slingshot') && VL.spotFound(drive.state, 'heartD3'));
  assert.ok(VL.LOCKS.d3Boss.reached(drive.state));
});

test('the W18 steps drive the story milestones lighthouseEntered, slingshot and d3Boss', () => {
  const { VL } = loadGame();
  for (const id of ['lighthouseEntered', 'slingshot', 'd3Boss']) assert.equal(typeof registry[id], 'function', id);
  const play = createPlaythrough(VL, { app: fixtureApp(VL, 'save-v1-W16.json'), milestones: ['lighthouseEntered', 'slingshot', 'd3Boss'] });
  assert.ok(VL.LOCKS.d3Boss.reached(play.playTo('d3Boss').state));
});

test('a faint anywhere in the Lighthouse, after each lock, never leaves it unsolvable', () => {
  const { VL } = loadGame();
  for (let n = 1; n < ROUTE.length; n += 1) {
    const play = createPlaythrough(VL, { app: fixtureApp(VL, 'save-v1-W16.json'), milestones: ROUTE, steps: route });
    const drive = play.playTo(ROUTE[n - 1]);
    VL.faint(drive.state, 'lensCrab');
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

test('every word the Lighthouse says fits its box and its font', () => {
  const { VL } = loadGame();
  const boxes = [];
  for (const screen of Object.values(VL.AREAS.lighthouse.screens)) for (const e of screen.entities) if (e.type === 'sign') boxes.push({ title: e.title, text: e.text });
  assert.equal(boxes.length, 3);
  boxes.push(VL.POPUPS.slingshot ?? { title: VL.ITEMS.slingshot.popup.title, text: VL.ITEMS.slingshot.popup.text });
  boxes.push(VL.LIGHTHOUSE_TREASURE, { text: VL.LIGHTHOUSE_DARK_WORDS }, { text: VL.LAMP_COLD }, { text: VL.TARGET_WORDS }, { text: VL.OUT_OF_SHELLS.outside });
  for (const box of boxes) {
    assert.deepEqual(plain(VL.ART.missingGlyphs(`${box.title || ''} ${box.text}`)), [], box.text);
    assert.ok(!VL.ART.popupLayout(box).overflow, `fits: ${box.text}`);
  }
  const notes = [VL.LIGHTHOUSE_SWORD_WORDS, VL.LENS_CRAB_SWORD_NOTE, VL.LENS_CRAB_BACK_NOTE, VL.OUT_OF_SHELLS.dungeon, VL.SHELL_HEAP_WORDS.full, VL.SHELL_HEAP_WORDS.scooped(VL.TUNING.shellHeapFill), 'The Lens Crab is beaten!'];
  for (const note of notes) {
    assert.deepEqual(plain(VL.ART.missingGlyphs(note, 'small')), [], note);
    assert.ok(VL.ART.measureText(note, 'small') <= VL.TUNING.width - 8, note);
  }
  assert.deepEqual(plain(VL.ART.missingGlyphs(VL.faintLine('lensCrab'))), []);
});

test('render smoke: every Lighthouse room draws, dark and lit, the beam, the slingshot fired, and the Lens Crab in each of its moods', () => {
  const t = setup({ enemies: true });
  const { VL } = t;
  const ctx = fakeDocument().createElement('canvas').getContext('2d');
  const draw = () => {
    const before = Object.values(ctx.calls).reduce((sum, n) => sum + n, 0);
    VL.render(ctx, t.app, 0.4);
    return Object.values(ctx.calls).reduce((sum, n) => sum + n, 0) - before;
  };
  t.d.doors.d3BossDoor = true;
  for (const screen of Object.keys(VL.AREAS.lighthouse.screens)) {
    t.place(lh(screen, 7, screen === '0,-3' ? 8 : 5));
    t.step();
    assert.ok(draw() > 100, `${screen} draws`);
  }
  t.place(lh('1,0', 5, 4, 'up'));
  t.arm();
  t.press('mainHand');
  assert.ok(t.find('slingPellet'));
  assert.ok(draw() > 100, 'a shell in flight, in the dark');
  t.place(lh('0,-3', 7, 8));
  const c = crabOf(t);
  for (const eyes of [{ left: true, right: true }, { left: false, right: true }, { left: true, right: false }]) {
    for (const mode of ['scuttle', 'glint']) {
      Object.assign(c, { eyes, mode, timer: 0.5 });
      assert.ok(draw() > 50, `${mode} ${JSON.stringify(eyes)}`);
    }
  }
  for (const mode of ['dazed', 'recover', 'dying']) {
    Object.assign(c, { mode, timer: 0.2 });
    assert.ok(draw() > 20, mode);
  }
  for (const id of ['item-slingshot', 'prop-shell-heap', 'prop-glow-lamp', 'prop-glow-lamp-lit', 'prop-shell-target', 'prop-shell-target-hit', 'prop-mirror-slash', 'prop-mirror-backslash', 'prop-crystal', 'prop-crystal-lit', 'prop-beam-source', 'enemy-lens-crab-dazed']) {
    assert.ok(VL.ART.SPRITES[id], id);
  }
});

test('README documents the Lighthouse, the Slingshot, dark rooms and the beam', () => {
  const readme = read('README.md');
  for (const word of ['## The Lighthouse (W18)', '## The Slingshot (W18)', '## Dark rooms (W18)', '## The beam (W18)', 'save-v1-W18.json', 'shellHeap', 'VL.defineDarkRooms', 'onShot']) {
    assert.ok(readme.includes(word), `README mentions ${word}`);
  }
});
