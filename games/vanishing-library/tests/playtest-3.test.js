// W30, Matthew's third playtest notes: a word when a wood sword does nothing
// to a tough enemy, the Hollow Oak's grass room and metal-only enemies, the
// boss gate in every dungeon, and the library's rewards at 10, 20 and 30 books.
const assert = require('node:assert/strict');
const { test, loadGame, playState, hold } = require('./harness');

const ow = (screen, tx, ty, facing = 'up') => ({ area: 'overworld', screen, tx, ty, facing });

// ---------- note 1: the wood sword's word ----------

function clearing(sword) {
  const { VL } = loadGame();
  const state = playState(VL, ow('7,-2', 4, 6, 'down'));
  VL.giveItem(state, sword);
  state.popups.queue.length = 0;
  hold(VL, state, [], 1);
  const plant = state.room.entities.find((e) => e.type === 'spitter' && e.x === 4 && e.y === 7);
  return { VL, state, plant };
}

const swing = (VL, state) => {
  VL.updateWorld(state, VL.actions({ pressed: ['mainHand'] }), 1 / 60);
  hold(VL, state, [], 0.5);
};

test('a wood sword on a tough spitter says it does nothing, and hints at something stronger', () => {
  const { VL, state, plant } = clearing('woodSword');
  assert.equal(state.message, null);
  swing(VL, state);
  assert.ok(state.room.entities.includes(plant), 'still there');
  const shown = VL.currentPopup(state);
  assert.ok(shown, 'a message pops up');
  assert.equal(shown.text, 'Hmm, this wood sword seems to do nothing to them. Perhaps you need something a bit stronger.');
  assert.equal(VL.ART.popupLayout({ title: shown.title, text: shown.text }).overflow, false, 'it fits the popup');
  assert.deepEqual([...VL.ART.missingGlyphs(`${shown.title}${shown.text}`, 'normal')], []);
});

test('the word comes once per visit, not on every clink', () => {
  const { VL, state } = clearing('woodSword');
  swing(VL, state);
  assert.ok(state.message);
  state.message = null;
  for (let i = 0; i < 4; i += 1) swing(VL, state);
  assert.equal(state.message, null, 'no second message this visit');
  VL.place(state, ow('7,-2', 4, 6, 'down'));
  state.popups.queue.length = 0;
  hold(VL, state, [], 1);
  swing(VL, state);
  assert.ok(state.message, 'a new visit says it again');
});

test('a metal sword, a thrown rock or an ordinary enemy never brings the word', () => {
  {
    const { VL, state } = clearing('metalSword');
    swing(VL, state);
    assert.equal(state.message, null, 'the metal sword works, nothing to say');
  }
  {
    const { VL, state, plant } = clearing('woodSword');
    VL.hitEnemy(state, plant, 1, { x: 0, y: 0 }, undefined);
    VL.hitEnemy(state, plant, 1, { x: 0, y: 0 }, 'throw');
    assert.equal(state.message, null, 'a throw only clinks');
  }
  {
    const { VL } = loadGame();
    const state = playState(VL, ow('3,0', 7, 5));
    VL.giveItem(state, 'woodSword');
    state.popups.queue.length = 0;
    const slime = VL.spawnEnemy(state, 'slime', 7, 6);
    VL.hitEnemy(state, slime, 1, { x: 0, y: 0 }, 'woodSword');
    assert.equal(state.message, null);
  }
});

// ---------- note 3: the boss gate, in every dungeon ----------

const BOSS_ROOMS = {
  scriptorium: { screen: '1,-2', gate: [7, 10], boss: 'bookworm', heart: 'heartD1', inside: [7, 8] },
  hollowOak: { screen: '0,-3', gate: [7, 10], boss: 'thornback', heart: 'heartD2', inside: [7, 8] },
  lighthouse: { screen: '0,-3', gate: [7, 10], boss: 'lensCrab', heart: 'heartD3', inside: [7, 8] },
  lair: { screen: '0,-3', gate: [7, 10], boss: 'dragon', heart: 'heartD4', inside: [7, 8] },
};

// A game standing just inside a dungeon's boss room, the boss door open.
function inBossRoom(id, { VL = loadGame().VL } = {}) {
  const room = BOSS_ROOMS[id];
  const state = playState(VL, { area: VL.DUNGEONS[id].area, screen: room.screen, tx: room.gate[0], ty: room.gate[1], facing: 'up' });
  for (const door of Object.values(VL.AREAS[VL.DUNGEONS[id].area].screens).flatMap((s) => s.entities)) {
    if (door.type === 'lockedDoor' && door.kind === 'boss') VL.dungeonState(state, id).doors[door.id] = true;
  }
  state.flags.shockwaveDue = true;
  state.flags.shockwave = true;
  state.flags.shockwaveWoke = true;
  state.popups.queue.length = 0;
  return { VL, state, room };
}
const gateOf = (state, id) => state.room.entities.find((e) => e.type === 'shutter' && e.bossGate);
const warpOf = (state) => state.room.entities.find((e) => e.type === 'warp');
const heroAt = (VL, state) => [VL.heroTile(state).tx, VL.heroTile(state).ty];

test('every dungeon gets its boss gate from the framework: bars on the tile the boss door lands the hero on', () => {
  const VL = loadGame().VL;
  for (const [id, room] of Object.entries(BOSS_ROOMS)) {
    const screen = VL.getScreen(VL.DUNGEONS[id].area, room.screen);
    const gates = screen.entities.filter((e) => e.type === 'shutter' && e.bossGate);
    assert.equal(gates.length, 1, `${id}: one gate`);
    assert.deepEqual([gates[0].x, gates[0].y], room.gate, `${id}: on the doorway`);
    assert.deepEqual(JSON.parse(JSON.stringify(gates[0].open)), { bossDone: true });
    assert.ok(!screen.entities.some((e) => e.type === 'shutter' && e.open.bossBeaten), `${id}: no hand-made bars left`);
  }
  assert.deepEqual([...VL.dungeonProblems()], []);
});

for (const id of Object.keys(BOSS_ROOMS)) {
  test(`${id}: stepping in shuts the gate; it stays shut with no way out until the boss is beaten and its heart taken, then the warp appears and the gate opens`, () => {
    const { VL, state, room } = inBossRoom(id);
    hold(VL, state, ['up'], 0.6);
    hold(VL, state, [], 0.1);
    const gate = gateOf(state, id);
    assert.ok(gate.closed && gate.solid, 'shut behind him');
    assert.equal(warpOf(state), undefined, 'no way out while the boss lives');
    hold(VL, state, ['down'], 1.5);
    assert.equal(state.player.screen, room.screen, 'the gate holds');
    state.room.entities = state.room.entities.filter((e) => !VL.isEnemy(e));
    VL.bossDefeated(state, id);
    hold(VL, state, [], 0.1);
    assert.ok(VL.bossBeaten(state, id));
    assert.ok(gateOf(state, id).solid, 'still shut with the heart on the floor');
    assert.equal(warpOf(state), undefined, 'and still no warp');
    assert.equal(VL.dungeonCondition(state, { bossDone: true }), false);
    const heart = state.room.entities.find((e) => e.type === 'heartContainer');
    VL.ENTITIES.heartContainer.onStand(state, heart);
    state.holdUp = null;
    hold(VL, state, [], 0.1);
    assert.ok(VL.spotFound(state, room.heart));
    assert.ok(warpOf(state), 'the warp appears once the heart is taken');
    assert.ok(!gateOf(state, id).closed && !gateOf(state, id).solid, 'and the gate opens');
    assert.equal(VL.dungeonCondition(state, { bossDone: true }), true);
  });

  test(`${id}: fainting in the boss room wakes him at the dungeon's entrance statue with every door and key kept, and the gate lets him back in`, () => {
    const { VL, state } = inBossRoom(id);
    const d = VL.dungeonState(state, id);
    d.keysGiven = 1;
    hold(VL, state, ['up'], 0.6);
    hold(VL, state, [], 0.1);
    state.savePoint = null;
    // The statue sets the save point as he passes it on the way in.
    const statue = Object.entries(VL.AREAS[VL.DUNGEONS[id].area].screens).flatMap(([key, s]) => s.entities.filter((e) => e.type === 'saveStatue').map((e) => ({ key, ...e })))[0];
    state.savePoint = { area: VL.DUNGEONS[id].area, screen: statue.key, tx: statue.x, ty: statue.y, facing: 'down' };
    const doors = JSON.stringify(d.doors);
    VL.faint(state, 'shrub');
    VL.respawn(state);
    assert.deepEqual([state.player.area, state.player.screen, ...heroAt(VL, state)], [VL.DUNGEONS[id].area, statue.key, statue.x, statue.y]);
    assert.equal(JSON.stringify(d.doors), doors, 'doors stay open');
    assert.equal(VL.smallKeys(state, id), 1, 'keys kept');
    assert.equal(VL.bossBeaten(state, id), false);
    const gate = VL.getScreen(VL.DUNGEONS[id].area, BOSS_ROOMS[id].screen).entities.find((e) => e.bossGate);
    assert.ok(VL.ENTITIES.shutter.passable(state, gate, VL.DUNGEONS[id].area), 'the gate always lets him in (the pathfinder agrees)');
  });

  test(`${id}: a save from before the gate that beat the boss and took the heart finds the gate open and the warp waiting`, () => {
    const { VL, state, room } = inBossRoom(id);
    VL.dungeonState(state, id).boss = true;
    VL.markFound(state, room.heart);
    VL.place(state, { area: VL.DUNGEONS[id].area, screen: room.screen, tx: room.inside[0], ty: room.inside[1], facing: 'down' });
    hold(VL, state, [], 0.1);
    assert.ok(!gateOf(state, id).solid);
    assert.ok(warpOf(state));
  });
}

test('the Hollow Oak: the shockwave always follows the heart, since the gate keeps him in the den until he takes it', () => {
  const { VL } = loadGame();
  const state = playState(VL, { area: 'hollowOak', screen: '0,-3', tx: 7, ty: 10, facing: 'up' });
  VL.dungeonState(state, 'hollowOak').doors.d2BossDoor = true;
  state.popups.queue.length = 0;
  hold(VL, state, ['up'], 0.6);
  state.room.entities = state.room.entities.filter((e) => !VL.isEnemy(e));
  VL.bossDefeated(state, 'hollowOak');
  state.flags.shockwaveDue = true;
  hold(VL, state, ['down'], 2);
  assert.equal(state.player.screen, '0,-3', 'still in the den');
  assert.equal(state.sceneRequest, null, 'no knock-out with the heart on the floor');
});

test('the framework refuses a hand-made boss gate and needs a boss door (or boss.gate) to put its own on', () => {
  const { VL } = loadGame();
  const tiles = ['################', ...Array(9).fill('#______________#'), '#######_########'];
  VL.defineEnemy('w30Probe', { tuning: 'enemySlime', body: { w: 8, h: 8 }, size: 'small', think() {}, draw() {} });
  const entrance = { area: 'overworld', screen: '0,0', tx: 3, ty: 3, facing: 'down' };
  VL.defineArea('w30Old', { tileset: 'dungeon' });
  VL.addScreens('w30Old', { '0,0': { tiles, entities: [{ type: 'shutter', x: 7, y: 10, open: { bossBeaten: true } }, { type: 'w30Probe', x: 7, y: 4 }] } });
  assert.throws(() => VL.defineDungeon('w30Old', { area: 'w30Old', entrance, boss: { screen: '0,0', type: 'w30Probe', heart: 'h1', warp: { tx: 7, ty: 8 } } }), /boss gate is the framework's/);
  VL.defineArea('w30NoDoor', { tileset: 'dungeon' });
  VL.addScreens('w30NoDoor', { '0,0': { tiles, entities: [{ type: 'w30Probe', x: 7, y: 4 }] } });
  assert.throws(() => VL.defineDungeon('w30NoDoor', { area: 'w30NoDoor', entrance, boss: { screen: '0,0', type: 'w30Probe', heart: 'h2', warp: { tx: 7, ty: 8 } } }), /boss\.gate/);
  VL.defineArea('w30Gate', { tileset: 'dungeon' });
  VL.addScreens('w30Gate', { '0,0': { tiles, entities: [{ type: 'w30Probe', x: 7, y: 4 }] } });
  VL.defineDungeon('w30Gate', { area: 'w30Gate', entrance, boss: { screen: '0,0', type: 'w30Probe', heart: 'h3', warp: { tx: 7, ty: 8 }, gate: { tx: 7, ty: 10 } } });
  const gate = VL.getScreen('w30Gate', '0,0').entities.find((e) => e.bossGate);
  assert.deepEqual([gate.x, gate.y, gate.id], [7, 10, 'w30GateBossGate']);
});

// ---------- note 4: the library's rewards at 10, 20 and 30 books ----------

// W34 moved most of them down from the highlands (tests/playtest-4.test.js).
const LATE_BOOKS = {
  bookCliffLedge: 'climbersAlmanac', bookHighShelfA: 'woodsPaths', bookHighShelfB: 'woodsPaths', bookHighScree: 'lighthouseEntered',
  bookHighGapA: 'grapplingRope', bookHighGapB: 'wreckDoor', bookHighPathA: 'slingshot', bookHighPathB: 'lighthouseEntered',
  bookLairA: 'highlands', bookLairB: 'd3DoorA', bookLakeIsland: 'lakeIsland', bookWreckDeck: 'woods',
};

test('rewards come at 10, 20 and 30 books returned, in the order heart, Big Shell Purse, Swiftfoot Boots, and the solver counts the same', () => {
  const { VL } = loadGame();
  assert.deepEqual(JSON.parse(JSON.stringify(VL.TUNING.libraryRewards)), { heartLibrary: 10, shellPurse: 20, swiftfootBoots: 30 });
  assert.deepEqual(['heartLibrary', 'shellPurse', 'swiftfootBoots'].map((id) => VL.LOCKS[id].count.books), [10, 20, 30]);
  const state = VL.createGame();
  const ids = Object.keys(VL.BOOKS);
  const owed = [];
  for (let n = 1; n <= 30; n += 1) {
    state.library.returned = ids.slice(0, n);
    const reward = VL.pendingReward(state);
    if (reward) {
      owed.push(`${reward}@${n}`);
      state.flags[`reward:${reward}`] = true;
    }
  }
  assert.deepEqual(owed, ['heartLibrary@10', 'shellPurse@20', 'swiftfootBoots@30']);
});

test('the librarian names the new counts', () => {
  const { VL } = loadGame();
  const words = (id) => VL.REWARD_SPEECH[id].join(' ');
  assert.match(words('heartLibrary'), /^Ten books/);
  assert.match(words('shellPurse'), /^Twenty books/);
  assert.match(words('swiftfootBoots'), /^Thirty books/);
});

test('at least 30 books can be returned over the game: 12 new untitled books lie in the late places (the highlands, the cliff ledge, the lake island, the shipwreck deck)', () => {
  const { VL } = loadGame();
  const supplied = Object.values(VL.LOCKS).reduce((sum, lock) => sum + (lock.supplies.books || 0), 0);
  assert.ok(supplied >= 32, `${supplied} books in the table`);
  assert.ok(Object.keys(VL.BOOKS).length >= 32);
  for (const [id, place] of Object.entries(LATE_BOOKS)) {
    const book = VL.BOOKS[id];
    assert.equal(book?.kind, 'generic', id);
    assert.deepEqual([...VL.ART.missingGlyphs(`${book.title} ${book.blurb}`, 'normal')], [], id);
    assert.ok(VL.LOCKS[id].needs.flat().includes(place), `${id} needs ${place}`);
    assert.ok(VL.SPOTS[id]?.filled, `${id} lies on the map`);
    assert.equal(VL.getScreen(VL.SPOTS[id].area, VL.SPOTS[id].screen).entities.find((e) => e.spot === id).type, 'bookTrunk');
  }
});

// The trunks are solid, and the overworld's reach test counts tiles only, so
// check here that no new trunk cuts its screen in two or stands boxed in: the
// open ground of its screen (tiles and the screen's other solid things) falls
// into as many connected pieces with the trunk as without it.
test('no new book trunk blocks a passage on its screen; each stands on open ground with at least one open side', () => {
  const { VL } = loadGame();
  const { cols, rows } = VL.TUNING;
  const pieces = (blocked) => {
    const seen = new Set();
    let count = 0;
    for (let ty = 0; ty < rows; ty += 1) {
      for (let tx = 0; tx < cols; tx += 1) {
        if (blocked(tx, ty) || seen.has(`${tx},${ty}`)) continue;
        count += 1;
        const todo = [[tx, ty]];
        seen.add(`${tx},${ty}`);
        while (todo.length) {
          const [x, y] = todo.pop();
          for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || blocked(nx, ny) || seen.has(`${nx},${ny}`)) continue;
            seen.add(`${nx},${ny}`);
            todo.push([nx, ny]);
          }
        }
      }
    }
    return count;
  };
  for (const id of Object.keys(LATE_BOOKS)) {
    const spot = VL.SPOTS[id];
    const screen = VL.getScreen(spot.area, spot.screen);
    const trunk = screen.entities.find((e) => e.spot === id);
    assert.ok(VL.ENTITIES.bookTrunk.solid || trunk.solid, 'the trunk is solid, so this check matters');
    const others = screen.entities.filter((e) => e !== trunk && (e.solid || VL.ENTITIES[e.type]?.solid));
    const ground = (tx, ty) => VL.tileInfo(spot.area, screen.tiles[ty][tx]).solid || others.some((e) => e.x === tx && e.y === ty);
    assert.equal(ground(trunk.x, trunk.y), false, `${id} stands on open ground`);
    const withTrunk = (tx, ty) => ground(tx, ty) || (tx === trunk.x && ty === trunk.y);
    assert.equal(pieces(withTrunk), pieces(ground), `${id} at ${spot.screen} (${trunk.x},${trunk.y}) splits the open ground or stands alone`);
    const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => {
      const [x, y] = [trunk.x + dx, trunk.y + dy];
      return x >= 0 && y >= 0 && x < cols && y < rows && !ground(x, y);
    });
    assert.ok(sides.length >= 1, `${id} has an open side to stand on`);
  }
});

test('old saves: rewards given under 5/10/15 are never given twice, and none is lost', () => {
  const { VL } = loadGame();
  const ids = Object.keys(VL.BOOKS);
  // Heart taken at 5, 7 books now: nothing at 10, the purse at 20.
  const a = VL.createGame();
  a.library.returned = ids.slice(0, 7);
  a.flags['reward:heartLibrary'] = true;
  assert.equal(VL.pendingReward(a), null);
  a.library.returned = ids.slice(0, 10);
  assert.equal(VL.pendingReward(a), null, 'no second heart at 10');
  a.library.returned = ids.slice(0, 20);
  assert.equal(VL.pendingReward(a), 'shellPurse');
  // Heart and purse at 5 and 10, 12 books now: nothing until the boots at 30.
  const b = VL.createGame();
  b.library.returned = ids.slice(0, 12);
  b.flags['reward:heartLibrary'] = true;
  b.flags['reward:shellPurse'] = true;
  b.items.shellPurse = true;
  assert.equal(VL.pendingReward(b), null);
  assert.equal(VL.nextRewardAt(b), 30);
  assert.ok(VL.hasItem(b, 'shellPurse'), 'kept');
  // All three at 15: kept, nothing more.
  const c = VL.createGame();
  c.library.returned = ids.slice(0, 16);
  for (const id of ['heartLibrary', 'shellPurse', 'swiftfootBoots']) c.flags[`reward:${id}`] = true;
  assert.equal(VL.pendingReward(c), null);
  assert.equal(VL.nextRewardAt(c), null);
});

// ---------- note 2: the Hollow Oak's grass room and its metal-only enemies ----------

const oak = (screen, tx, ty, facing = 'up') => ({ area: 'hollowOak', screen, tx, ty, facing });

function oakWith(items, place) {
  const { VL } = loadGame();
  const state = playState(VL, place);
  for (const id of items) VL.giveItem(state, id);
  state.popups.queue.length = 0;
  state.popups.seen.digKey = true;
  return { VL, state };
}
const key = (state, id) => state.room.entities.find((e) => e.type === 'smallKey' && e.id === id);
const dig = (VL, state) => {
  VL.updateWorld(state, VL.actions({ pressed: ['dig'] }), 1 / 60);
  hold(VL, state, [], 0.4);
};

test('the moss room: an odd patch of grass west of the entrance, no sign, and a small key under it', () => {
  const { VL } = loadGame();
  const room = VL.getScreen('hollowOak', '-1,0');
  const grass = room.tiles.flatMap((row, ty) => [...row].map((ch, tx) => ({ ch, tx, ty }))).filter(({ ch }) => VL.tileInfo('hollowOak', ch).grass);
  assert.ok(grass.length >= 12, `${grass.length} grass tiles`);
  assert.ok(!room.entities.some((e) => e.type === 'sign'), 'nothing hints at it but the grass');
  const k = room.entities.find((e) => e.id === 'd2KeyMoss');
  assert.equal(k.reveal, 'dug');
  assert.ok(VL.tileInfo('hollowOak', room.tiles[k.y][k.x]).grass, 'under the grass');
  assert.equal(VL.getScreen('hollowOak', '0,0').tiles[5][0], '_', 'the entrance opens west into it');
});

test('a wood shovel cannot dig the grass; the metal shovel digs up the key, which is then picked up and counted', () => {
  {
    const { VL, state } = oakWith(['woodShovel'], oak('-1,0', 8, 5, 'right'));
    assert.equal(VL.dig(state, 'woodShovel'), 'blocked');
    assert.ok(key(state, 'd2KeyMoss').hidden);
  }
  const { VL, state } = oakWith(['metalShovel'], oak('-1,0', 8, 5, 'right'));
  assert.ok(key(state, 'd2KeyMoss').hidden, 'not shown before the dig');
  dig(VL, state);
  assert.ok(!key(state, 'd2KeyMoss').hidden, 'the key comes up into the hole');
  assert.equal(VL.smallKeys(state, 'hollowOak'), 0, 'not counted until picked up');
  hold(VL, state, ['right'], 0.6);
  assert.ok(VL.spotFound(state, 'd2KeyMoss'));
  assert.equal(VL.smallKeys(state, 'hollowOak'), 1);
});

test('the tangle\'s key A appears only once both thorny spitters are beaten, which only a metal sword does', () => {
  const { VL } = loadGame();
  const tough = VL.getScreen('hollowOak', '-1,-2').entities.filter((e) => VL.ENEMIES[e.type]);
  assert.ok(tough.length >= 2 && tough.every((e) => e.tough), 'every enemy in the tangle is thorny');
  for (const [sword, beaten] of [['woodSword', false], ['metalSword', true]]) {
    const { VL: V, state } = oakWith([sword], oak('-1,-2', 3, 9));
    hold(V, state, [], 1);
    assert.ok(key(state, 'd2KeyA').hidden);
    for (const e of state.room.entities.filter((x) => V.isEnemy(x))) for (let i = 0; i < 4; i += 1) { e.hurt = 0; V.hitEnemy(state, e, V.TUNING.swordDamage[sword], { x: 0, y: 0 }, sword); }
    state.message = null;
    hold(V, state, [], 0.1);
    assert.equal(!key(state, 'd2KeyA').hidden, beaten, `${sword}: key ${beaten ? 'shown' : 'still hidden'}`);
  }
});

test('door C guards the way up from the root hall, so both keys are spent before the rope; the solver says Dungeon 2 needs the metal sword and the metal shovel', () => {
  const { VL } = loadGame();
  assert.ok(VL.getScreen('hollowOak', '0,-1').entities.some((e) => e.type === 'lockedDoor' && e.id === 'd2DoorC'));
  assert.equal(VL.getScreen('hollowOak', '0,-2').tiles[7][0], '#', 'no way round through the tangle');
  assert.deepEqual([...VL.LOCKS.d2KeyA.needs.flat()].sort(), ['hollowOakEntered', 'metalSword']);
  assert.deepEqual([...VL.LOCKS.d2KeyMoss.needs.flat()].sort(), ['hollowOakEntered', 'metalShovel']);
  for (const id of ['metalSword', 'metalShovel']) assert.ok(VL.LOCKS.d2Boss.needs.includes(id), id);
  const report = VL.solveProgression();
  assert.deepEqual([...report.problems], []);
  assert.deepEqual([...VL.dungeonProblems()], []);
  // Without either, the Thornback is out of reach.
  for (const id of ['metalSword', 'metalShovel']) {
    const without = Object.fromEntries(Object.entries(VL.LOCKS).filter(([lock]) => lock !== id));
    const r = VL.solveProgression(without);
    assert.ok(r.problems.some((p) => /d2Boss|d2Key|unknown/.test(p)), `${id}: ${r.problems[0]}`);
  }
});

test('both metal tools are affordable and reachable before Dungeon 2: three ore lumps, and each costs no more than the first purse holds', () => {
  const { VL } = loadGame();
  const ore = ['oreShallows', 'oreScriptorium', 'oreWoods'].filter((id) => VL.LOCKS[id].supplies.ore === 1);
  assert.equal(ore.length, 3);
  const price = VL.TUNING.prices.metalGear;
  assert.equal(price.ore, 1);
  assert.ok(price.shells <= VL.TUNING.shellCap);
  const report = VL.solveProgression();
  for (const id of ['metalSword', 'metalShovel', 'd2Boss']) assert.ok(report.stages[0].reached.includes(id), id);
});

test('a townsperson mentions the metal shovel and grass only between Dungeon 1 and Dungeon 2', () => {
  const { VL } = loadGame();
  const state = VL.newGame({ name: 'Robin' });
  const says = () => [].concat(VL.pickDialogue(state, 'juniper').say).join(' ');
  assert.doesNotMatch(says(), /shovel/);
  VL.LOCKS.d1Boss.reached = () => true;
  assert.match(says(), /metal shovel/);
  assert.match(says(), /grass/);
  VL.LOCKS.d2Boss.reached = () => true;
  assert.doesNotMatch(says(), /shovel/);
});

test('an old save that had opened door A finds door C open with its keys unchanged', () => {
  const { VL } = loadGame();
  const state = VL.createGame();
  const d = VL.dungeonState(state, 'hollowOak');
  d.doors.d2DoorA = true;
  VL.markFound(state, 'd2KeyA');
  const before = VL.smallKeys(state, 'hollowOak');
  VL.place(state, oak('0,-1', 7, 2));
  assert.equal(d.doors.d2DoorC, true);
  assert.equal(VL.smallKeys(state, 'hollowOak'), before);
});
