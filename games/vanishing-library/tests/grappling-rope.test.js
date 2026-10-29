// The Grappling Rope (W15): the hook flies straight, over pits and low
// things; a post pulls the hero across, a pickup is dragged back to him, a
// switch is thrown, an enemy is stunned, and a wall sends it back. Tested in
// a room of the tests' own, so the Hollow Oak's layout can change freely.
const assert = require('node:assert/strict');
const { test, loadGame, playApp, fakeDocument } = require('./harness');

const STEP = 1 / 60;
const plain = (value) => JSON.parse(JSON.stringify(value));

// Pits across rows 4-5, a wall stub at (10,3), and the tests' own posts.
const ROOM = [
  '################',
  '#______________#',
  '#______________#',
  '#_________#____#',
  '#_oooo_________#',
  '#_oooo_________#',
  '#______________#',
  '#______________#',
  '#______________#',
  '#______________#',
  '################',
];

function setup({ entities = [], hand = 'mainHand' } = {}) {
  const { VL } = loadGame();
  VL.defineArea('ropeTest', { tileset: 'dungeon' });
  VL.addScreens('ropeTest', { '0,0': { tiles: ROOM, entities } });
  VL.defineDungeon('ropeTestDungeon', { area: 'ropeTest', entrance: { area: 'ropeTest', screen: '0,0', tx: 7, ty: 8 } });
  const app = playApp(VL);
  app.game.popups.seen.controls = true;
  VL.giveItem(app.game, 'grapplingRope');
  app.game.popups.queue.length = 0;
  if (VL.heldItem(app.game, hand) !== 'grapplingRope') VL.setHand(app.game, hand, 'grapplingRope');
  const t = {
    VL,
    app,
    get game() {
      return app.game;
    },
    get rope() {
      return app.game.player.rope;
    },
    place(tx, ty, facing) {
      VL.place(app.game, { area: 'ropeTest', screen: '0,0', tx, ty, facing });
    },
    step(actions = VL.noActions()) {
      app.update(actions, STEP);
    },
    press(action) {
      app.update(VL.actions({ pressed: [action] }), STEP);
    },
    hold(held, seconds) {
      for (let s = 0; s < seconds - 1e-9; s += STEP) app.update(VL.actions({ held }), STEP);
    },
    until(done, seconds = 2, held = []) {
      for (let s = 0; s < seconds - 1e-9 && !done(app.game); s += STEP) app.update(VL.actions({ held }), STEP);
      assert.ok(done(app.game), `reached within ${seconds} s`);
    },
    find: (type) => app.game.room.entities.find((e) => e.type === type),
  };
  return t;
}

const post = (x, y) => ({ type: 'grapplePost', x, y });

test('the rope is a hand item: its key throws the hook straight ahead, as far as TUNING.ropeTiles, and it comes back', () => {
  const t = setup();
  const { VL } = t;
  t.place(7, 8, 'up');
  t.press('mainHand');
  assert.ok(t.rope, 'the hook is out');
  assert.equal(t.rope.phase, 'out');
  let longest = 0;
  t.until((g) => {
    longest = Math.max(longest, g.player.rope?.len || 0);
    return !g.player.rope;
  }, 3);
  assert.ok(longest >= VL.TUNING.ropeTiles * VL.TUNING.tile - 2 && longest <= VL.TUNING.ropeTiles * VL.TUNING.tile + 2, `reached ${longest} px`);
  assert.deepEqual(plain(VL.heroTile(t.game)), { tx: 7, ty: 8 }, 'nothing to catch: the hero stays put');
});

test('while the hook is out the hero stands still and his other hand waits', () => {
  const t = setup();
  const { VL } = t;
  VL.giveItem(t.game, 'woodSword');
  VL.setHand(t.game, 'offHand', 'woodSword');
  t.place(7, 8, 'up');
  t.press('mainHand');
  const { x, y } = t.game.player;
  t.app.update(VL.actions({ held: ['left'], pressed: ['offHand'] }), STEP);
  t.hold(['left'], 0.1);
  assert.deepEqual([t.game.player.x, t.game.player.y], [x, y]);
  assert.ok(!t.game.player.swing, 'no swing with the rope out');
});

test('a post across the pits pulls the hero over them to the tile in front of it', () => {
  const t = setup({ entities: [post(3, 2)] });
  const { VL } = t;
  t.place(3, 7, 'up');
  t.press('mainHand');
  t.until((g) => g.player.rope?.phase === 'pull', 1);
  t.until((g) => !g.player.rope, 2);
  assert.deepEqual(plain(VL.heroTile(t.game)), { tx: 3, ty: 3 });
  assert.deepEqual([t.game.player.x, t.game.player.y], [VL.tileCenter(3, 3).x, VL.tileCenter(3, 3).y], 'set down on the tile centre');
  // And back the other way from a post on the near side.
  t.game.room.entities.push(post(3, 8));
  t.game.player.facing = 'down';
  t.press('mainHand');
  t.until((g) => !g.player.rope, 3);
  assert.deepEqual(plain(VL.heroTile(t.game)), { tx: 3, ty: 7 });
});

test('the hero is never hurt while being pulled', () => {
  const t = setup({ entities: [post(3, 2)] });
  const { VL } = t;
  t.place(3, 8, 'up');
  t.press('mainHand');
  t.until((g) => g.player.rope?.phase === 'pull', 1);
  const hp = t.game.hp;
  for (let i = 0; i < 20 && t.rope; i += 1) {
    assert.equal(VL.hurtHero(t.game, { damage: 2, from: { x: 0, y: 0 }, cause: 'slime' }), 'ignored');
    t.step();
  }
  assert.equal(t.game.hp, hp);
});

test('a wall or a solid thing sends the hook back; a post with no floor in front of it does not pull', () => {
  const t = setup({ entities: [post(10, 2), { type: 'sign', x: 5, y: 2, text: 'hi' }] });
  const { VL } = t;
  // The wall stub at (10,3) stands in front of the post at (10,2).
  t.place(10, 8, 'up');
  t.press('mainHand');
  t.until((g) => !g.player.rope, 2);
  assert.deepEqual(plain(VL.heroTile(t.game)), { tx: 10, ty: 8 });
  t.place(5, 8, 'up');
  t.press('mainHand');
  let furthest = 0;
  t.until((g) => {
    furthest = Math.max(furthest, g.player.rope?.len || 0);
    return !g.player.rope;
  }, 2);
  assert.ok(furthest < 6 * 16, `stopped at the sign: ${furthest}`);
  assert.deepEqual(plain(VL.heroTile(t.game)), { tx: 5, ty: 8 });
});

test('a pickup across the pits is dragged back and picked up', () => {
  const t = setup({ entities: [{ type: 'drop', kind: 'shell', x: 4, y: 2, born: 0 }] });
  const { VL } = t;
  t.place(4, 7, 'up');
  t.find('drop').born = t.game.time;
  const shells = t.game.inventory.shells;
  t.press('mainHand');
  t.until((g) => !g.player.rope, 3);
  assert.equal(t.game.inventory.shells, shells + 1);
  assert.equal(t.find('drop'), undefined);
});

test('a switch the hook hits is thrown, in a dungeon', () => {
  const t = setup({ entities: [{ type: 'switch', id: 'ropeTestSwitch', x: 12, y: 2 }] });
  const { VL } = t;
  t.place(12, 7, 'up');
  t.press('mainHand');
  t.until((g) => !g.player.rope, 2);
  assert.equal(VL.dungeonState(t.game, 'ropeTestDungeon').switches.ropeTestSwitch, true);
});

test('an enemy the hook hits is stunned (calm), not hurt', () => {
  const t = setup();
  const { VL } = t;
  t.place(12, 8, 'up');
  const slime = VL.spawnEnemy(t.game, 'slime', 12, 5);
  slime.arriving = 0;
  const hp = slime.hp;
  t.press('mainHand');
  t.until(() => slime.calm > 0, 1);
  assert.equal(slime.hp, hp);
  assert.ok(slime.calm >= VL.TUNING.ropeStunSeconds - 0.5);
});

test('a faint or a new room ends the rope', () => {
  const t = setup({ entities: [post(3, 1)] });
  const { VL } = t;
  t.place(3, 8, 'up');
  t.press('mainHand');
  VL.faint(t.game, 'slime');
  assert.equal(t.rope, null);
  VL.respawn(t.game);
  t.place(7, 8, 'up');
  t.press('mainHand');
  t.place(7, 7, 'up');
  t.step();
  assert.equal(t.rope, null);
});

test('the rope, its hook and the post draw', () => {
  const t = setup({ entities: [post(3, 2)] });
  const { VL } = t;
  const ctx = fakeDocument().createElement('canvas').getContext('2d');
  t.place(3, 7, 'up');
  t.press('mainHand');
  t.hold([], 0.1);
  VL.render(ctx, t.app, 0.2);
  for (const id of ['item-grappling-rope', 'prop-grapple-post', 'fx-rope-hook']) assert.ok(VL.ART.sprite(id), id);
  const item = VL.ITEMS.grapplingRope;
  assert.deepEqual(plain(VL.ART.missingGlyphs(`${item.name} ${item.about} ${item.popup.title} ${item.popup.text}`)), []);
  assert.ok(!VL.ART.popupLayout(item.popup).overflow, 'the popup fits');
});

// The hook flies over water and pits, so on the overworld it could fetch a
// pickup before its gate (a lake island's ore, a heart across a chasm). With
// the rope in hand and nothing else yet (the W15 save), every pickup the hero
// can't walk to is tried with the real hook from every walkable tile in line
// within reach: none may come back. A later item that places one in reach
// trips this and decides (README "The Grappling Rope").
const FETCHES = ['drop', 'shell', 'ore', 'smallKey', 'bossKey', 'dungeonMap', 'heartContainer'];

function loadW15(addScreens) {
  const { memoryStorage } = require('./harness');
  const fs = require('node:fs');
  const path = require('node:path');
  const { VL } = loadGame();
  if (addScreens) addScreens(VL);
  const text = fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v1-W15.json'), 'utf8');
  const storage = VL.createStorage(memoryStorage({ [VL.slotKey(0)]: text }));
  const app = VL.createApp({ storage });
  app.startGame(VL.loadSlot(storage, 0), 0);
  app.setScene('play');
  assert.ok(VL.hasItem(app.game, 'grapplingRope'));
  return { VL, app, game: app.game };
}

// Walks the area from `starts`, then hooks every pickup he can't walk to from
// every walkable tile in line within reach. Returns the pickups it was thrown
// at, and the ones it took from where they stand.
function hookSweep({ VL, app, game }, area, starts) {
  const { isWalkable } = require('./playthrough');
  const { cols, rows } = VL.TUNING;
  const key = (screen, tx, ty) => `${screen} ${tx},${ty}`;
  const seen = new Set();
  const queue = starts.map((p) => [p.screen, p.tx, p.ty]);
  for (const [s, x, y] of queue) seen.add(key(s, x, y));
  while (queue.length) {
    const [s, x, y] = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let [ns, nx, ny] = [s, x + dx, y + dy];
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) {
        ns = VL.neighborKey(s, dx, dy);
        if (!VL.screenExists(area, ns) || VL.edgeTurn(game, area, s, ns)) continue;
        nx -= dx * cols;
        ny -= dy * rows;
      }
      if (seen.has(key(ns, nx, ny)) || !isWalkable(VL, area, ns, nx, ny, game)) continue;
      seen.add(key(ns, nx, ny));
      queue.push([ns, nx, ny]);
    }
  }
  const DIRS = { right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] };
  const hooked = new Set();
  const fetched = [];
  for (const screen of Object.keys(VL.AREAS[area].screens)) {
    for (const thing of VL.getScreen(area, screen).entities) {
      if (!FETCHES.includes(thing.type) || thing.hidden) continue;
      if ([[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has(key(screen, thing.x + dx, thing.y + dy)))) continue;
      for (const [dir, [dx, dy]] of Object.entries(DIRS)) {
        for (let d = 2; d <= VL.TUNING.ropeTiles + 1; d += 1) {
          const [tx, ty] = [thing.x - dx * d, thing.y - dy * d];
          if (!seen.has(key(screen, tx, ty))) continue;
          hooked.add(thing.id ?? thing.spot);
          VL.place(game, { area, screen, tx, ty, facing: dir });
          game.popups.queue.length = 0;
          game.hands = { mainHand: 'grapplingRope', offHand: null };
          app.update(VL.actions({ pressed: ['mainHand'] }), STEP);
          for (let s = 0; s < 3 && game.player.rope; s += STEP) app.update(VL.noActions(), STEP);
          const there = game.room.entities.find((e) => e.type === thing.type && (e.id ?? e.spot) === (thing.id ?? thing.spot));
          if (!(there && there.x === thing.x && there.y === thing.y)) {
            fetched.push(`${thing.type} ${thing.id || thing.spot || ''} at ${key(screen, thing.x, thing.y)} from (${tx},${ty}) facing ${dir}`);
          }
        }
      }
    }
  }
  return { hooked, fetched, seen: seen.size };
}

test('on the overworld the hook never fetches a pickup the hero cannot walk to yet', () => {
  const world = loadW15();
  const { VL } = world;
  const { fetched, seen } = hookSweep(world, 'overworld', [VL.START, VL.WOODS_ENTRY]);
  assert.ok(seen > 1000, `${seen} tiles on foot`);
  // Since W38 the buried heart's corner is open (a ring of flowers), so no
  // overworld pickup is out of reach on foot today; the next test keeps the
  // sweep honest with two that are.
  assert.deepEqual(fetched, []);
});

test('the sweep is live: a shell walled in by trees stays put, and one ringed by water is caught coming back', () => {
  const world = loadW15((VL) => VL.addScreens('hookSweep', {
    '0,0': {
      tiles: [
        'TTTTTTTTTTTTTTTT',
        'TTTTTTTTTTWWWTTT',
        'TTTT.TTTTTW.WTTT',
        'TTTTTTTTTTWWWTTT',
        'T..............T',
        'T..............T',
        'T..............T',
        'T..............T',
        'T..............T',
        'T..............T',
        'TTTTTTTTTTTTTTTT',
      ],
      entities: [
        { type: 'shell', whole: true, id: 'sweepTrees', x: 4, y: 2 },
        { type: 'shell', whole: true, id: 'sweepWater', x: 11, y: 2 },
      ],
    },
  }));
  const { hooked, fetched } = hookSweep(world, 'hookSweep', [{ screen: '0,0', tx: 7, ty: 7 }]);
  assert.deepEqual([...hooked].sort(), ['sweepTrees', 'sweepWater'], 'the real hook is thrown at both');
  assert.ok(fetched.length > 0 && fetched.every((f) => f.includes('sweepWater')), fetched.join('; ') || 'nothing fetched');
});
