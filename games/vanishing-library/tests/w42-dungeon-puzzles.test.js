// W42, Matthew's sixth playtest notes on three dungeon rooms: the Hollow
// Oak's moss key comes up only from the last of its grass dug in one visit,
// the Scriptorium's boss key waits behind two switches (the second sealed
// until the first opens a gate), and the Lair's Mirror Shield lies across a
// room of lava too wide to cross there and back on hearts alone, his only
// once he walks out alive (a faint or a reload puts it back in the chest).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, loadGame, playState, hold, memoryStorage } = require('./harness');

const plain = (value) => JSON.parse(JSON.stringify(value));
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// ---------- 1. the Hollow Oak's moss room: dig every grass tile ----------

const MOSS = { area: 'hollowOak', screen: '-1,0' };

function mossRoom(items = ['metalShovel']) {
  const { VL } = loadGame();
  const state = playState(VL, { ...MOSS, tx: 2, ty: 5, facing: 'right' });
  for (const id of items) VL.giveItem(state, id);
  state.popups.queue.length = 0;
  state.popups.seen.digKey = true;
  return { VL, state };
}

const grassTiles = (VL, state) => {
  const tiles = [];
  for (let ty = 0; ty < VL.TUNING.rows; ty += 1) {
    for (let tx = 0; tx < VL.TUNING.cols; tx += 1) {
      if (VL.tileAt(MOSS.area, MOSS.screen, tx, ty, state.room) === ',') tiles.push([tx, ty]);
    }
  }
  return tiles;
};
const mossKey = (state) => state.room.entities.find((e) => e.type === 'smallKey' && e.id === 'd2KeyMoss');

// Stands west of the tile (a floor tile or a hole already dug) facing it, and digs.
function digAt(VL, state, tx, ty, shovel = 'metalShovel') {
  Object.assign(state.player, VL.tileCenter(tx - 1, ty), { facing: 'right' });
  hold(VL, state, [], VL.TUNING.digSeconds + 0.05);
  return VL.dig(state, shovel);
}

test('the moss room\'s key waits under a whole patch of grass (W42), and there is nothing else in the room', () => {
  const { VL, state } = mossRoom();
  const key = VL.getScreen(MOSS.area, MOSS.screen).entities.find((e) => e.id === 'd2KeyMoss');
  assert.equal(key.reveal, 'dugAll');
  assert.equal(grassTiles(VL, state).length, 18);
  assert.deepEqual(plain(VL.getScreen(MOSS.area, MOSS.screen).entities.map((e) => e.type)), ['smallKey'], 'no enemy can stand on a grass tile, no block can cover one');
  // Grass and its holes are ground he walks on, and the patch stands clear of
  // the walls, so every tile can be dug from beside it.
  for (const ch of [',', VL.DIG_HOLES.dirt]) assert.ok(!VL.tileInfo(MOSS.area, ch).solid, `${ch} is walkable`);
  for (const [tx, ty] of grassTiles(VL, state)) {
    assert.ok(DIRS.every(([dx, dy]) => !VL.isSolidAt(MOSS.area, MOSS.screen, tx + dx, ty + dy)), `(${tx},${ty}) is open on every side`);
  }
});

test('the key comes up in the last grass tile dug, wherever that is, and not before', () => {
  for (const order of ['forward', 'backward', 'shuffled']) {
    const { VL, state } = mossRoom();
    let tiles = grassTiles(VL, state).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (order === 'backward') tiles.reverse();
    if (order === 'shuffled') tiles = tiles.map((t, i) => [(i * 7) % tiles.length, t]).sort((a, b) => a[0] - b[0]).map(([, t]) => t);
    const last = tiles[tiles.length - 1];
    for (const [tx, ty] of tiles.slice(0, -1)) {
      assert.notEqual(digAt(VL, state, tx, ty), 'find', `(${tx},${ty}) is not the last`);
      assert.ok(mossKey(state).hidden, `still hidden after (${tx},${ty})`);
    }
    assert.equal(digAt(VL, state, ...last), 'find');
    const key = mossKey(state);
    assert.deepEqual([key.hidden, key.x, key.y], [false, ...last], `${order}: up in the last hole`);
    // Walked onto, it is found and counted.
    hold(VL, state, ['right'], 0.6);
    assert.ok(VL.spotFound(state, 'd2KeyMoss'), `${order}: picked up`);
    assert.equal(VL.smallKeys(state, 'hollowOak'), 1);
  }
});

test('the last tile decides, not the key\'s old tile: digging (9,5) first gives nothing', () => {
  const { VL, state } = mossRoom();
  assert.notEqual(digAt(VL, state, 9, 5), 'find');
  assert.ok(mossKey(state).hidden);
});

test('leaving partway starts the patch over; leaving with the key up but untaken puts it back under', () => {
  const { VL, state } = mossRoom();
  const tiles = grassTiles(VL, state).sort((a, b) => a[0] - b[0]);
  for (const [tx, ty] of tiles.slice(0, 10)) digAt(VL, state, tx, ty);
  assert.equal(grassTiles(VL, state).length, 8);
  VL.place(state, { area: 'hollowOak', screen: '0,0', tx: 2, ty: 5, facing: 'left' });
  VL.place(state, { ...MOSS, tx: 2, ty: 5, facing: 'right' });
  assert.equal(grassTiles(VL, state).length, 18, 'every hole filled in again');
  assert.ok(mossKey(state).hidden);
  for (const [tx, ty] of tiles) digAt(VL, state, tx, ty);
  assert.equal(mossKey(state).hidden, false);
  VL.place(state, { area: 'hollowOak', screen: '0,0', tx: 2, ty: 5, facing: 'left' });
  VL.place(state, { ...MOSS, tx: 2, ty: 5, facing: 'right' });
  assert.ok(mossKey(state).hidden, 'not taken, so back under the grass');
  assert.equal(VL.spotFound(state, 'd2KeyMoss'), false);
});

test('once found the key stays found: a reload or a new visit never brings it back, and a dug patch gives no second key', () => {
  const { VL, state } = mossRoom();
  for (const [tx, ty] of grassTiles(VL, state).sort((a, b) => a[0] - b[0])) digAt(VL, state, tx, ty);
  hold(VL, state, ['right'], 0.6);
  assert.ok(VL.spotFound(state, 'd2KeyMoss'));
  const saved = VL.serializeSave(state);
  assert.equal(saved.flags['found:d2KeyMoss'], true, 'saved like any key');
  VL.place(state, { ...MOSS, tx: 2, ty: 5, facing: 'right' });
  assert.equal(mossKey(state), undefined);
  for (const [tx, ty] of grassTiles(VL, state).sort((a, b) => a[0] - b[0])) assert.notEqual(digAt(VL, state, tx, ty), 'find');
  assert.equal(VL.smallKeys(state, 'hollowOak'), 1);
});

test('only the metal shovel digs the patch (W30): the wood shovel is refused on every grass tile', () => {
  const { VL, state } = mossRoom(['woodShovel']);
  for (const [tx, ty] of grassTiles(VL, state)) assert.equal(digAt(VL, state, tx, ty, 'woodShovel'), 'blocked');
  assert.equal(grassTiles(VL, state).length, 18);
  assert.ok(mossKey(state).hidden);
  assert.deepEqual([...VL.LOCKS.d2KeyMoss.needs.flat()].sort(), ['hollowOakEntered', 'metalShovel']);
});

test('a grass dig elsewhere (the overworld\'s buried heart) still comes up from its own tile alone', () => {
  const { VL } = loadGame();
  const spot = VL.SPOTS.heartFieldA;
  const state = playState(VL, { area: 'overworld', screen: spot.screen, tx: spot.x - 1, ty: spot.y, facing: 'right' });
  VL.giveItem(state, 'metalShovel');
  state.popups.queue.length = 0;
  assert.equal(VL.dig(state, 'metalShovel'), 'find');
  assert.equal(state.room.entities.find((e) => e.id === 'heartFieldA').hidden, false);
});

// ---------- 2. the Scriptorium's copying hall: two switches ----------

const HALL = { area: 'scriptorium', screen: '3,0' };

function hall({ desk = false, niche = false, keyFound = false } = {}) {
  const { VL } = loadGame();
  const state = VL.createGame();
  const d = VL.dungeonState(state, 'scriptorium');
  if (desk) d.switches.d1SwitchDesk = true;
  if (niche) d.switches.d1SwitchNiche = true;
  if (keyFound) VL.markFound(state, 'd1BossKey');
  state.items.liftingGloves = true;
  VL.place(state, { ...HALL, tx: 1, ty: 5, facing: 'right' });
  state.room.entities = state.room.entities.filter((e) => !VL.isEnemy(e));
  hold(VL, state, [], 0.05);
  return { VL, state };
}
const byId = (state, id) => state.room.entities.find((e) => e.id === id);

// Every tile the hero can walk to from the door.
function standable(VL, state, area, screen, from) {
  const seen = new Set([from.join()]);
  const queue = [from];
  while (queue.length) {
    const [x, y] = queue.shift();
    for (const [dx, dy] of DIRS) {
      const [nx, ny] = [x + dx, y + dy];
      if (nx < 0 || ny < 0 || nx >= VL.TUNING.cols || ny >= VL.TUNING.rows || seen.has(`${nx},${ny}`)) continue;
      if (VL.isSolidAt(area, screen, nx, ny, state.room)) continue;
      seen.add(`${nx},${ny}`);
      queue.push([nx, ny]);
    }
  }
  return [...seen].map((s) => s.split(',').map(Number));
}

// Whether anything flying straight (a pot, a shot, the hook) from a tile he
// can stand on reaches `target`: it crosses open and low tiles (desks, pits)
// and stops at walls, shelves and solid things (closed bars).
function linesInto(VL, state, target) {
  const { area, screen } = HALL;
  const lines = [];
  for (const [sx, sy] of standable(VL, state, area, screen, [1, 5])) {
    for (const [dx, dy] of DIRS) {
      for (let [x, y] = [sx + dx, sy + dy]; x >= 0 && y >= 0 && x < VL.TUNING.cols && y < VL.TUNING.rows; x += dx, y += dy) {
        if (x === target.x && y === target.y) {
          lines.push(`(${sx},${sy}) ${dx},${dy}`);
          break;
        }
        if (state.room.entities.some((e) => e.x === x && e.y === y && (e.solid || VL.ENTITIES[e.type]?.solid))) break;
        const info = VL.tileInfo(area, VL.tileAt(area, screen, x, y, state.room));
        if (info.solid && !(info.low || info.pit || info.water || info.flyOver)) break;
      }
    }
  }
  return lines;
}

test('the copying hall has two switches: the desk switch opens the niche\'s gate, the niche\'s switch lifts the boss key\'s bars', () => {
  const { VL } = loadGame();
  const screen = VL.getScreen(HALL.area, HALL.screen);
  const of = (id) => screen.entities.find((e) => e.id === id);
  assert.equal(of('d1SwitchDesk').type, 'switch');
  assert.equal(of('d1SwitchNiche').type, 'switch');
  assert.deepEqual(plain(of('d1ShutterNiche').open), { switch: 'd1SwitchDesk' });
  assert.deepEqual(plain(of('d1ShutterBossKey').open), { switch: 'd1SwitchNiche' });
  assert.deepEqual([...VL.dungeonProblems()], []);
});

test('before the gate opens nothing reaches the niche\'s switch: no straight line from anywhere he stands, no tile beside it', () => {
  const { VL, state } = hall();
  const niche = byId(state, 'd1SwitchNiche');
  assert.deepEqual(linesInto(VL, state, niche), []);
  const tiles = standable(VL, state, HALL.area, HALL.screen, [1, 5]);
  assert.deepEqual(tiles.filter(([x, y]) => Math.abs(x - niche.x) <= 1 && Math.abs(y - niche.y) <= 1).map(String), [], 'no tile beside it, even corner to corner');
  // The desk switch is in reach of a throw from the start.
  assert.ok(linesInto(VL, state, byId(state, 'd1SwitchDesk')).length > 0);
  // Once the gate is up a throw can reach it, but still no tile beside it: only a throw will do.
  const open = hall({ desk: true });
  assert.ok(linesInto(open.VL, open.state, byId(open.state, 'd1SwitchNiche')).length > 0, 'through the open gate');
  assert.deepEqual(standable(open.VL, open.state, HALL.area, HALL.screen, [1, 5]).filter(([x, y]) => Math.abs(x - niche.x) <= 1 && Math.abs(y - niche.y) <= 1).map(String), []);
});

// Lifts the pot at `pot`, stands on `at` facing `dir`, throws; waits for it to land.
function throwPot(VL, state, pot, at, dir) {
  state.room.entities.push({ type: 'pot', x: pot[0], y: pot[1] });
  const side = { right: [-1, 0], left: [1, 0], up: [0, 1], down: [0, -1] };
  const toPot = Object.entries(side).find(([, [dx, dy]]) => !VL.isSolidAt(HALL.area, HALL.screen, pot[0] + dx, pot[1] + dy, state.room));
  Object.assign(state.player, VL.tileCenter(pot[0] + toPot[1][0], pot[1] + toPot[1][1]), { facing: toPot[0] });
  VL.updateWorld(state, VL.actions({ pressed: ['interact'] }), 1 / 60);
  assert.ok(state.player.lifted, 'lifted');
  hold(VL, state, [], 0.3);
  Object.assign(state.player, VL.tileCenter(...at), { facing: dir });
  VL.updateWorld(state, VL.actions({ pressed: ['interact'] }), 1 / 60);
  for (let i = 0; i < 120 && state.room.entities.some((e) => e.type === 'liftThrown'); i += 1) VL.updateWorld(state, VL.actions({}), 1 / 60);
}

test('a pot thrown at the shut gate shatters on it; thrown over the desks it throws the first switch and the gate lifts', () => {
  const { VL, state } = hall();
  const d = VL.dungeonState(state, 'scriptorium');
  const gate = byId(state, 'd1ShutterNiche');
  throwPot(VL, state, [9, 5], [gate.x, gate.y - 1], 'down');
  assert.equal(d.switches.d1SwitchNiche, undefined, 'the gate stopped it');
  assert.ok(gate.closed);
  throwPot(VL, state, [10, 4], [12, 4], 'up');
  assert.equal(d.switches.d1SwitchDesk, true);
  hold(VL, state, [], 0.1);
  assert.equal(gate.closed, false, 'the gate is up');
  assert.ok(byId(state, 'd1ShutterBossKey').closed, 'the boss key still behind its bars');
});

test('through the open gate, a pot over the niche\'s desk throws the second switch, and the boss key is free', () => {
  const { VL, state } = hall({ desk: true });
  const d = VL.dungeonState(state, 'scriptorium');
  const gate = byId(state, 'd1ShutterNiche');
  throwPot(VL, state, [9, 5], [gate.x, gate.y - 1], 'down');
  assert.equal(d.switches.d1SwitchNiche, true);
  hold(VL, state, [], 0.1);
  assert.equal(byId(state, 'd1ShutterBossKey').closed, false);
});

test('a sword swung from the open gate cannot throw the niche\'s switch (a desk stands between): only a throw does', () => {
  const { VL, state } = hall({ desk: true });
  VL.giveItem(state, 'woodSword');
  state.popups.queue.length = 0;
  const gate = byId(state, 'd1ShutterNiche');
  Object.assign(state.player, VL.tileCenter(gate.x, gate.y), { facing: 'down' });
  VL.updateWorld(state, VL.actions({ pressed: ['mainHand'] }), 1 / 60);
  hold(VL, state, [], 0.4);
  VL.updateWorld(state, VL.actions({ pressed: ['interact'] }), 1 / 60);
  hold(VL, state, [], 0.2);
  assert.equal(VL.dungeonState(state, 'scriptorium').switches.d1SwitchNiche, undefined);
});

test('both switches are saved: on the next visit the gate and the bars are still up', () => {
  const { VL, state } = hall({ desk: true, niche: true });
  assert.equal(byId(state, 'd1ShutterNiche').closed, false);
  assert.equal(byId(state, 'd1ShutterBossKey').closed, false);
  assert.ok(byId(state, 'd1SwitchDesk').on && byId(state, 'd1SwitchNiche').on);
  const saved = VL.serializeSave(state);
  assert.deepEqual(plain(saved.dungeons.scriptorium.switches), { d1SwitchDesk: true, d1SwitchNiche: true });
});

test('a save from before W42 that threw the desk switch but left the boss key finds the gate up and the second switch to throw', () => {
  const { VL, state } = hall({ desk: true });
  assert.equal(byId(state, 'd1ShutterNiche').closed, false);
  assert.ok(byId(state, 'd1ShutterBossKey').closed);
  const done = hall({ desk: true, keyFound: true });
  assert.equal(done.state.room.entities.some((e) => e.type === 'bossKey'), false, 'a key already taken stays taken');
});

test('the copying hall never runs out of pots: every pot there comes back', () => {
  const { VL } = loadGame();
  const pots = VL.getScreen(HALL.area, HALL.screen).entities.filter((e) => e.type === 'pot');
  assert.ok(pots.length >= 2);
  assert.ok(pots.every((p) => p.respawn), 'all respawn');
});

// ---------- 3. the Lair's Mirror Shield room: a floor of lava ----------

const SHIELD = { area: 'lair', screen: '-1,-1' };
const ENTRANCE = [14, 5];

// Every heart container in the table: those it names and those bosses give.
function mostHp(VL) {
  const hearts = new Set();
  for (const [id, lock] of Object.entries(VL.LOCKS)) {
    for (const key of [id, ...(lock.gives || [])]) if (/^heart/.test(key)) hearts.add(key);
  }
  return { hearts: [...hearts].sort(), hp: VL.TUNING.startMaxHp + hearts.size * VL.TUNING.heartContainerHp };
}

// The fewest lava tiles stepped onto between two sets of tiles, letting him
// cut every corner (a diagonal step that skips the tile beside it), which no
// real walk beats: a 0-1 search over every tile he may stand on.
function fewestBurns(VL, from, to) {
  const { area, screen } = SHIELD;
  const { cols, rows } = VL.TUNING;
  const room = VL.getScreen(area, screen);
  const solid = (x, y) => room.entities.some((e) => e.x === x && e.y === y && (e.solid || VL.ENTITIES[e.type]?.solid) && e.type !== 'lockedDoor');
  const stand = (x, y) => {
    if (x < 0 || y < 0 || x >= cols || y >= rows || solid(x, y)) return false;
    const info = VL.tileInfo(area, VL.tileAt(area, screen, x, y));
    return !info.solid || Boolean(info.lava);
  };
  const lava = (x, y) => Boolean(VL.tileInfo(area, VL.tileAt(area, screen, x, y)).lava);
  const dist = new Map(from.map((t) => [t.join(), 0]));
  const deque = from.map((t) => [...t, 0]);
  while (deque.length) {
    const [x, y, d] = deque.shift();
    if (d > dist.get(`${x},${y}`)) continue;
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const [nx, ny] = [x + dx, y + dy];
        if ((!dx && !dy) || !stand(nx, ny)) continue;
        const nd = d + (lava(nx, ny) ? 1 : 0);
        if (nd >= (dist.get(`${nx},${ny}`) ?? Infinity)) continue;
        dist.set(`${nx},${ny}`, nd);
        if (nd === d) deque.unshift([nx, ny, nd]);
        else deque.push([nx, ny, nd]);
      }
    }
  }
  return Math.min(...to.map((t) => dist.get(t.join()) ?? Infinity));
}

function shieldRoomTrip(VL) {
  const chest = VL.getScreen(SHIELD.area, SHIELD.screen).entities.find((e) => e.type === 'bigChest');
  const beside = [];
  for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) if (dx || dy) beside.push([chest.x + dx, chest.y + dy]);
  const there = fewestBurns(VL, [ENTRANCE], beside);
  const back = Math.min(...beside.map((b) => fewestBurns(VL, [b], [ENTRANCE])));
  return { chest, there, back, round: there + back };
}

test('the shield room is lava from wall to wall but for the entrance square and the chest\'s', () => {
  const { VL } = loadGame();
  const room = VL.getScreen(SHIELD.area, SHIELD.screen);
  const chest = room.entities.find((e) => e.type === 'bigChest');
  assert.equal(chest.item, 'mirrorShield');
  const dry = [];
  for (let ty = 1; ty < VL.TUNING.rows - 1; ty += 1) {
    for (let tx = 1; tx < VL.TUNING.cols - 1; tx += 1) if (!VL.tileInfo(SHIELD.area, room.tiles[ty][tx]).lava) dry.push(`${tx},${ty}`);
  }
  assert.deepEqual(dry.sort(), [ENTRANCE.join(), `${chest.x},${chest.y}`].sort());
  assert.ok(room.entities.some((e) => e.type === 'lockedDoor' && e.id === 'd4DoorA' && e.x === ENTRANCE[0] + 1 && e.y === ENTRANCE[1]), 'door A beside the entrance square');
  // Nothing to fight, no post for the rope, nothing a chicken may fly over.
  assert.deepEqual(plain(room.entities.map((e) => e.type).sort()), ['bigChest', 'lockedDoor']);
  for (const row of room.tiles) for (const ch of row) assert.ok(!VL.tileInfo(SHIELD.area, ch).flyOver);
});

test('with every heart container, there and back is more lava than his hearts: 23 burns at the fewest against 20 half hearts', () => {
  const { VL } = loadGame();
  const most = mostHp(VL);
  assert.deepEqual(most.hearts, ['heartD1', 'heartD2', 'heartD3', 'heartD4', 'heartFieldA', 'heartFieldB', 'heartLibrary']);
  assert.equal(most.hp, 20);
  const trip = shieldRoomTrip(VL);
  assert.deepEqual([trip.there, trip.back], [12, 11]);
  assert.ok(trip.round * VL.TUNING.lavaDamage > most.hp, `${trip.round} burns against ${most.hp}`);
});

// Walks the hero tile by tile with real held arrows, eating a berry from the
// equipment screen whenever another step could faint him. Returns the burns.
function walkPath(VL, app, path, { eat = true } = {}) {
  const game = () => app.game;
  let burns = 0;
  for (const [tx, ty] of path) {
    if (app.sceneId !== 'play') break;
    if (eat) {
      while (game().hp <= VL.TUNING.lavaDamage && game().inventory.berries > 0) {
        app.update(VL.actions({ pressed: ['equipment'] }), 1 / 60);
        const items = VL.equipmentItems(game());
        const index = items.findIndex((item) => item.id === 'berry');
        app.equipment.cursor = index;
        while (game().hp < game().maxHp - 1 && game().inventory.berries > 0) app.update(VL.actions({ pressed: ['interact'] }), 1 / 60);
        app.update(VL.actions({ pressed: ['equipment'] }), 1 / 60);
      }
    }
    const here = VL.heroTile(game());
    const dir = tx > here.tx ? 'right' : tx < here.tx ? 'left' : ty > here.ty ? 'down' : 'up';
    const hp = game().hp;
    for (let i = 0; i < 90 && app.sceneId === 'play'; i += 1) {
      const now = VL.heroTile(game());
      const c = VL.tileCenter(tx, ty);
      if (now.tx === tx && now.ty === ty && Math.abs(game().player.x - c.x) < 2 && Math.abs(game().player.y - c.y) < 2) break;
      app.update(VL.actions({ held: [dir] }), 1 / 60);
    }
    burns += Math.max(0, hp - game().hp);
  }
  return burns;
}

// In the shield room on the entrance square, saved at the Lair's statue,
// holding the wood sword and the metal shield, into slot 1 of `storage`.
function shieldApp(VL, { maxHp, berries, storage = VL.createStorage(memoryStorage()) }) {
  const app = VL.createApp({ storage });
  app.startGame(VL.newGame({ name: 'Robin' }), 0, { fresh: true });
  app.setScene('play');
  const game = app.game;
  for (const id of ['controls', 'dungeonMap', 'berries', 'digKey']) game.popups.seen[id] = true;
  Object.assign(game.items, { woodSword: true, metalShield: true });
  game.hands = { mainHand: 'woodSword', offHand: 'metalShield' };
  VL.dungeonState(game, 'lair').doors.d4DoorA = true;
  game.maxHp = maxHp;
  game.hp = maxHp;
  game.inventory.berries = berries;
  VL.touchSavePoint(game, STATUE);
  VL.place(game, { ...SHIELD, tx: ENTRANCE[0], ty: ENTRANCE[1], facing: 'left' });
  return app;
}

const STATUE = { area: 'lair', screen: '0,0', tx: 3, ty: 3, facing: 'up' };
const saved = (VL, app) => VL.readSlot(app.storage, 0).save;
const where = (VL, state) => [state.player.area, state.player.screen, VL.heroTile(state).tx, VL.heroTile(state).ty];
const shieldChest = (state) => state.room.entities.find((e) => e.type === 'bigChest' && e.id === 'd4ShieldChest');

// The shield is back in its chest and the hands are as they were before it.
function shieldReturned(VL, state, label) {
  assert.equal(VL.hasItem(state, 'mirrorShield'), false, `${label}: no shield`);
  assert.equal(VL.spotFound(state, 'd4ShieldChest'), false, `${label}: the chest is shut again`);
  assert.equal(state.pendingChest, null, `${label}: nothing pending`);
  assert.deepEqual(plain(state.hands), { mainHand: 'woodSword', offHand: 'metalShield' }, `${label}: the metal shield back in the off hand`);
  assert.equal(VL.LOCKS.mirrorShield.reached(state), false, `${label}: the lock is not reached`);
}

// Along the top: west along row 1 to the chest, then back.
const ROW_THERE = [];
for (let y = 4; y >= 1; y -= 1) ROW_THERE.push([14, y]);
for (let x = 13; x >= 2; x -= 1) ROW_THERE.push([x, 1]);
const ROW_BACK = [];
for (let x = 3; x <= 14; x += 1) ROW_BACK.push([x, 1]);
for (let y = 2; y <= 5; y += 1) ROW_BACK.push([14, y]);

function openChest(VL, app) {
  app.update(VL.actions({ held: ['left'] }), 2 / 60);
  app.update(VL.actions({ pressed: ['interact'] }), 1 / 60);
  for (let i = 0; i < 600 && app.sceneId !== 'play' || (i < 600 && app.game.holdUp); i += 1) {
    if (app.sceneId === 'popup' && app.popupView?.t >= 0.3) app.update(VL.actions({ pressed: ['interact'] }), 1 / 60);
    else app.update(VL.actions({}), 1 / 60);
  }
}

test('with every heart and no berries he faints on the way back, and the Mirror Shield slips back into its chest', () => {
  const { VL } = loadGame();
  const app = shieldApp(VL, { maxHp: 20, berries: 0 });
  walkPath(VL, app, ROW_THERE, { eat: false });
  assert.equal(app.sceneId, 'play', 'he reaches the chest on hearts');
  openChest(VL, app);
  assert.ok(VL.hasItem(app.game, 'mirrorShield'), 'his to use at once');
  assert.equal(VL.heldItem(app.game, 'offHand'), 'mirrorShield');
  assert.equal(app.game.pendingChest.item, 'mirrorShield', 'but only once he leaves');
  assert.equal(VL.LOCKS.mirrorShield.reached(app.game), false);
  assert.equal(saved(VL, app).pendingChest.item, 'mirrorShield', 'the autosave knows it is pending');
  walkPath(VL, app, ROW_BACK, { eat: false });
  assert.equal(app.sceneId, 'fainted', 'too far to walk back');
  assert.deepEqual(plain(app.game.fainted), { cause: 'lava', returned: 'mirrorShield' });
  shieldReturned(VL, app.game, 'on fainting');
  assert.equal(shieldChest(app.game).opened, false, 'the chest under the faint screen is shut');
  const lines = plain(VL.faintLines(app.game));
  assert.equal(lines[0], 'The Mirror Shield slipped back into its chest.');
  assert.equal(lines[1], 'Everything else you found is still yours.');
  assert.ok(!lines.includes('Everything you found is still yours.'));
  // The save already has it back in the chest, so a reload now agrees.
  shieldReturned(VL, VL.restoreGame(saved(VL, app)), 'the save after the faint');
  for (let i = 0; i < 60; i += 1) app.update(VL.actions({}), 1 / 60);
  app.update(VL.actions({ pressed: ['interact'] }), 1 / 60);
  assert.equal(app.sceneId, 'play');
  assert.deepEqual(where(VL, app.game), ['lair', '0,0', 3, 3], 'he wakes at the statue');
  shieldReturned(VL, app.game, 'awake');
  // Back at the chest it is shut and full, and opens again.
  VL.place(app.game, { ...SHIELD, tx: 2, ty: 1, facing: 'left' });
  assert.equal(shieldChest(app.game).opened, false);
  openChest(VL, app);
  assert.ok(VL.hasItem(app.game, 'mirrorShield'), 'the chest gives it again');
  assert.equal(app.game.pendingChest.item, 'mirrorShield');
});

test('any other faint keeps the plain words', () => {
  const { VL } = loadGame();
  const game = playState(VL, { area: 'lair', screen: '0,0', tx: 3, ty: 4 });
  VL.faint(game, 'default');
  assert.deepEqual(plain(VL.faintLines(game)), ['Everything you found is still yours.', 'You wake up at your last save point.']);
  assert.deepEqual(plain(game.fainted), { cause: 'default' });
});

test('a reload, or Save & Quit then Continue, while the shield is still pending puts it back in the chest too', () => {
  const { VL } = loadGame();
  const app = shieldApp(VL, { maxHp: 20, berries: 0 });
  VL.place(app.game, { ...SHIELD, tx: 2, ty: 1, facing: 'left' });
  openChest(VL, app);
  assert.equal(saved(VL, app).items.mirrorShield, true, 'saved the moment it is taken');
  const reloaded = VL.reloadApp(app);
  shieldReturned(VL, reloaded.game, 'after a reload');
  assert.deepEqual(where(VL, reloaded.game), ['lair', '0,0', 3, 3], 'he wakes at the statue');
  assert.ok(!reloaded.game.popups.queue.includes('mirrorShield'), 'no popup for a shield he does not have');
  VL.place(reloaded.game, { ...SHIELD, tx: 2, ty: 1, facing: 'left' });
  assert.equal(shieldChest(reloaded.game).opened, false, 'the chest is full again');

  // Save & Quit (the pause menu's save, then quit), then Continue on the title.
  const quitter = shieldApp(VL, { maxHp: 20, berries: 0 });
  VL.place(quitter.game, { ...SHIELD, tx: 2, ty: 1, facing: 'left' });
  openChest(VL, quitter);
  quitter.update(VL.actions({ pressed: ['pause'] }), 1 / 60);
  assert.equal(quitter.sceneId, 'pause');
  quitter.update(VL.actions({ pressed: ['down'] }), 1 / 60);
  quitter.update(VL.actions({ pressed: ['interact'] }), 1 / 60);
  assert.equal(quitter.game, null, 'quit to the title');
  assert.equal(saved(VL, quitter).pendingChest.item, 'mirrorShield', 'quit with the shield pending');
  const continued = VL.loadSlot(quitter.storage, 0);
  shieldReturned(VL, continued, 'after Continue');
  assert.deepEqual(where(VL, continued), ['lair', '0,0', 3, 3]);
});

test('walking out of the lava room alive makes the shield his for good, across a reload', () => {
  const { VL } = loadGame();
  const app = shieldApp(VL, { maxHp: 20, berries: 6 });
  walkPath(VL, app, ROW_THERE);
  openChest(VL, app);
  walkPath(VL, app, ROW_BACK);
  assert.equal(app.game.pendingChest?.item, 'mirrorShield', 'still pending on the entrance square');
  for (let i = 0; i < 120 && app.game.player.screen === SHIELD.screen; i += 1) app.update(VL.actions({ held: ['right'] }), 1 / 60);
  assert.equal(app.game.player.screen, '0,-1', 'out through door A');
  app.update(VL.actions({}), 1 / 60);
  assert.equal(app.game.pendingChest, null);
  assert.ok(VL.LOCKS.mirrorShield.reached(app.game), 'the lock is reached');
  assert.equal(saved(VL, app).pendingChest, null, 'saved as his');
  const reloaded = VL.reloadApp(app);
  assert.ok(VL.hasItem(reloaded.game, 'mirrorShield') && VL.spotFound(reloaded.game, 'd4ShieldChest'));
  assert.equal(VL.heldItem(reloaded.game, 'offHand'), 'mirrorShield');
  // A faint later, even back in the lava room, keeps it.
  VL.place(reloaded.game, { ...SHIELD, tx: ENTRANCE[0], ty: ENTRANCE[1] });
  VL.faint(reloaded.game, 'lava');
  assert.ok(VL.hasItem(reloaded.game, 'mirrorShield'));
  assert.deepEqual(plain(reloaded.game.fainted), { cause: 'lava' });
});

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

test('the W42 fixture (saved with the shield pending on the lava) continues at the statue, the shield back in its chest', () => {
  const { VL } = loadGame();
  const raw = JSON.parse(fixture('save-v1-W42.json'));
  assert.equal(raw.pendingChest.item, 'mirrorShield');
  assert.equal(raw.items.mirrorShield, true);
  const storage = VL.createStorage(memoryStorage({ [VL.slotKey(0)]: fixture('save-v1-W42.json') }));
  const slot = VL.readSlot(storage, 0);
  assert.deepEqual(plain(slot.resets), []);
  const game = VL.loadSlot(storage, 0);
  shieldReturned(VL, game, 'the W42 fixture');
  assert.deepEqual(where(VL, game), ['lair', '0,0', 3, 3]);
});

test('older saves: one without the field loads with nothing pending; one that has the shield keeps it, and a chest whose item he owns pends nothing', () => {
  const { VL } = loadGame();
  const before = VL.loadSlot(VL.createStorage(memoryStorage({ [VL.slotKey(0)]: fixture('save-v1-W40.json') })), 0);
  assert.equal(before.pendingChest, null);
  const holder = VL.loadSlot(VL.createStorage(memoryStorage({ [VL.slotKey(0)]: fixture('save-v1-W19.json') })), 0);
  assert.ok(VL.hasItem(holder, 'mirrorShield') && VL.LOCKS.mirrorShield.reached(holder));
  assert.equal(holder.pendingChest, null);
  const app = shieldApp(VL, { maxHp: 20, berries: 0 });
  app.game.items.mirrorShield = true;
  VL.place(app.game, { ...SHIELD, tx: 2, ty: 1, facing: 'left' });
  openChest(VL, app);
  assert.equal(app.game.pendingChest, null, 'nothing to lose: he already had it');
  VL.faint(app.game, 'lava');
  assert.ok(VL.hasItem(app.game, 'mirrorShield'));
});

test('with berries to eat on the way, the round trip is made, even on the fewest hearts he can have there', () => {
  const { VL } = loadGame();
  // Twelve half hearts: the start and the first three bosses' hearts, all the Lair asks.
  for (const [maxHp, berries] of [[20, 6], [12, 10]]) {
    const app = shieldApp(VL, { maxHp, berries });
    let burns = walkPath(VL, app, ROW_THERE);
    openChest(VL, app);
    burns += walkPath(VL, app, ROW_BACK);
    assert.equal(app.sceneId, 'play', `${maxHp} half hearts and ${berries} berries: he made it`);
    assert.deepEqual([VL.heroTile(app.game).tx, VL.heroTile(app.game).ty], ENTRANCE);
    assert.equal(burns, 31, 'the walk along the top: 16 there, 15 back');
    assert.ok(VL.hasItem(app.game, 'mirrorShield'));
  }
});

test('a diagonal walk burns no less than the fewest-burns count', () => {
  const { VL } = loadGame();
  const app = shieldApp(VL, { maxHp: 40, berries: 0 });
  const start = app.game.hp;
  for (let i = 0; i < 600 && VL.heroTile(app.game).tx > 2; i += 1) app.update(VL.actions({ held: VL.heroTile(app.game).ty > 1 ? ['left', 'up'] : ['left'] }), 1 / 60);
  assert.ok(start - app.game.hp >= shieldRoomTrip(VL).there, `${start - app.game.hp} burns`);
});
