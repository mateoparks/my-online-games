// W34, Matthew's crab notes: the beach crabs turn on a hero who has beaten
// ten of them, and the lake island's eleven digging spots hide eleven crabs
// with a one-time reward (README "Crabs").
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, loadGame, playState, hold } = require('./harness');

const STEP = 1 / 60;
const ow = (screen, tx, ty, facing = 'up') => ({ area: 'overworld', screen, tx, ty, facing });
const crabsIn = (state) => state.room.entities.filter((e) => e.type === 'crab');

function beach(VL, where = ow('4,1', 8, 3), setup = () => {}) {
  const state = VL.createGame({ name: 'Robin' });
  state.popups.seen.controls = true;
  VL.giveItem(state, 'woodSword');
  state.popups.queue.length = 0;
  setup(state);
  VL.place(state, where);
  return state;
}

const hit = (VL, state, crab, item) => {
  crab.hurt = 0;
  VL.hitEnemy(state, crab, VL.TUNING.swordDamage[item], { x: crab.cx, y: crab.cy - 16 }, item);
};
const beat = (VL, state, crab, item = 'metalSword') => {
  for (let n = 0; n < 10 && state.room.entities.includes(crab); n += 1) hit(VL, state, crab, item);
  VL.updateWorld(state, VL.noActions(), STEP);
};

// ---------- angry crabs ----------

test('beating ten beach crabs turns the crabs against him for good: the popup says so once, and the count is saved', () => {
  const { VL } = loadGame();
  const state = beach(VL);
  assert.deepEqual(JSON.parse(JSON.stringify(state.crabs)), { killed: 0, angry: false, feast: false });
  for (let n = 1; n <= 10; n += 1) {
    VL.place(state, ow(n % 2 ? '4,1' : '5,1', 8, 3));
    state.popups.queue.length = 0;
    const crab = crabsIn(state)[0];
    beat(VL, state, crab);
    assert.equal(state.crabs.killed, n);
    assert.equal(state.crabs.angry, n >= 10, `after ${n}`);
  }
  assert.ok(state.popups.queue.includes('crabsAngry'));
  assert.equal(VL.POPUPS.crabsAngry.text, 'For killing so many, the crabs now consider you their enemy! Watch out!');
  const { title, text } = VL.POPUPS.crabsAngry;
  assert.equal(VL.ART.popupLayout({ title, text }).overflow, false);
  assert.deepEqual([...VL.ART.missingGlyphs(`${title}${text}`, 'normal')], []);
  const saved = VL.serializeSave(state);
  assert.deepEqual(JSON.parse(JSON.stringify(saved.crabs)), { killed: 10, angry: true, feast: false });
  // The crab still on this screen is angry at once.
  assert.ok(crabsIn(state).every((c) => c.angry));
});

test('the wreck\'s crabs and other enemies never count; only overworld beach crabs do', () => {
  const { VL } = loadGame();
  const state = beach(VL, { area: 'wreck', screen: '0,0', tx: 7, ty: 2, facing: 'down' });
  for (const crab of crabsIn(state)) beat(VL, state, crab);
  assert.equal(state.crabs.killed, 0);
  VL.place(state, ow('3,0', 7, 5));
  const slime = VL.spawnEnemy(state, 'slime', 7, 6);
  beat(VL, state, slime);
  assert.equal(state.crabs.killed, 0);
});

function angryBeach(VL, where = ow('4,1', 8, 2, 'down')) {
  return beach(VL, where, (state) => Object.assign(state.crabs, { killed: 10, angry: true }));
}

test('an angry crab takes one more hit: three with the wood sword, two with the metal one', () => {
  const { VL } = loadGame();
  for (const [item, hits] of [['woodSword', 3], ['metalSword', 2]]) {
    for (const angry of [false, true]) {
      const state = angry ? angryBeach(VL) : beach(VL);
      const crab = crabsIn(state)[0];
      let n = 0;
      while (n < 10 && state.room.entities.includes(crab)) {
        hit(VL, state, crab, item);
        n += 1;
      }
      assert.equal(n, angry ? hits : hits - 1, `${item}, ${angry ? 'angry' : 'calm'}`);
    }
  }
});

test('an angry crab chases him from the start, over the grass, but never off its own screen and never as fast as he walks', () => {
  const { VL } = loadGame();
  const state = angryBeach(VL, ow('4,1', 8, 1, 'down'));
  const crab = crabsIn(state)[0];
  const start = { x: crab.cx, y: crab.cy };
  const dist = () => Math.hypot(crab.cx - state.player.x, crab.cy - (state.player.y - 5));
  const before = dist();
  hold(VL, state, [], 1.5);
  assert.ok(dist() < before - 10, `closer: ${before.toFixed(1)} -> ${dist().toFixed(1)}`);
  assert.ok(crab.cy < start.y - 8, 'up off the sand');
  const tile = VL.tileInfo('overworld', VL.tileAt('overworld', '4,1', Math.floor(crab.cx / 16), Math.floor(crab.cy / 16)));
  assert.ok(!tile.sand, 'onto the grass');
  assert.ok(VL.TUNING.angryCrabSpeed < VL.TUNING.heroSpeed, 'he can always walk away');
  // He walks off the screen: it stays behind.
  VL.place(state, ow('4,1', 1, 3, 'left'));
  const again = crabsIn(state)[0];
  again.cx = 20;
  again.cy = 3 * 16 + 8;
  hold(VL, state, [], 0.1);
  state.player.x = -100;
  for (let t = 0; t < 3; t += STEP) VL.updateWorld(state, VL.noActions(), STEP);
  assert.ok(again.cx >= 0 && again.cx <= 256 && again.cy >= 0 && again.cy <= 176, 'still on the screen');
});

test('calm crabs keep to their sand rows, as before', () => {
  const { VL } = loadGame();
  const state = beach(VL, ow('4,1', 8, 1, 'down'));
  const crabs = crabsIn(state).map((c) => ({ c, y: c.cy }));
  hold(VL, state, [], 3);
  for (const { c, y } of crabs) assert.equal(c.cy, y);
});

test('a hero with no sword after the shockwave still meets no crab on the home screens', () => {
  const { VL } = loadGame();
  const state = beach(VL, ow('0,1', 8, 3), (s) => {
    Object.assign(s.crabs, { killed: 12, angry: true });
    s.flags.shockwave = true;
    delete s.items.woodSword;
    s.hands = { mainHand: null, offHand: null };
  });
  assert.equal(crabsIn(state).length, 0);
});

test('an old save without the crab count loads with none killed and calm crabs', () => {
  const { VL } = loadGame();
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v1-W33.json'), 'utf8'));
  assert.equal(raw.crabs, undefined);
  const state = VL.restoreGame(raw);
  assert.deepEqual(JSON.parse(JSON.stringify(state.crabs)), { killed: 0, angry: false, feast: false });
});

test('the W34 fixture has crabs angry, with the feast had, and loads them back', () => {
  const { VL } = loadGame();
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v1-W34.json'), 'utf8'));
  const state = VL.restoreGame(raw);
  assert.deepEqual(JSON.parse(JSON.stringify(state.crabs)), { killed: 13, angry: true, feast: true });
});

// ---------- the island's eleven crabs ----------

function island(VL, setup = () => {}) {
  const state = beach(VL, ow('3,-3', 8, 4, 'up'), (s) => {
    VL.giveItem(s, 'woodShovel');
    s.popups.seen.digKey = true;
    VL.markFound(s, 'oreLakeIsland');
    setup(s);
  });
  state.popups.queue.length = 0;
  return state;
}

// Digs every tile of the list from a neighbour, the hero put beside each.
function digAll(VL, state, tiles) {
  for (const { tx, ty } of tiles) {
    const sides = [[0, 1, 'up'], [0, -1, 'down'], [1, 0, 'left'], [-1, 0, 'right']];
    const [dx, dy, facing] = sides.find(([sx, sy]) => !VL.isSolidAt('overworld', '3,-3', tx + sx, ty + sy, state.room)
      && !state.room.entities.some((e) => e.type === 'bookTrunk' && e.x === tx + sx && e.y === ty + sy));
    const at = VL.tileCenter(tx + dx, ty + dy);
    Object.assign(state.player, { x: at.x, y: at.y, facing });
    state.player.dig = null;
    VL.updateWorld(state, VL.actions({ pressed: ['dig'] }), STEP);
    assert.ok(state.events.some((e) => e.type === 'dig'), `dug ${tx},${ty}`);
  }
}

test('the lake island has exactly eleven sand tiles to dig (the ore\'s, once picked up, among them)', () => {
  const { VL } = loadGame();
  const tiles = VL.islandDigTiles();
  assert.equal(tiles.length, 11);
  for (const { tx, ty } of tiles) assert.ok(VL.tileInfo('overworld', VL.tileAt('overworld', '3,-3', tx, ty)).sand);
});

test('digging all eleven brings a crab out of every hole; beating all eleven fills the purse and every heart, once, with a popup that says nothing of once', () => {
  const { VL } = loadGame();
  const state = island(VL);
  state.hp = 1;
  state.inventory.shells = 3;
  const tiles = VL.islandDigTiles();
  digAll(VL, state, tiles.slice(0, 10));
  assert.equal(crabsIn(state).length, 0, 'not before the last');
  digAll(VL, state, tiles.slice(10));
  const crabs = crabsIn(state);
  assert.equal(crabs.length, 11);
  assert.deepEqual(crabs.map((c) => `${Math.round((c.cx - 8) / 16)},${Math.round((c.cy - 8) / 16)}`).sort(), tiles.map((t) => `${t.tx},${t.ty}`).sort());
  assert.ok(crabs.every((c) => !c.angry), 'calm crabs while the crabs are calm');
  state.player.invuln = 999;
  for (const crab of crabs.slice(0, 10)) beat(VL, state, crab);
  assert.equal(state.crabs.feast, false, 'not before the last');
  assert.equal(state.crabs.killed, 0, 'the island crabs never count towards the ten');
  beat(VL, state, crabs[10]);
  assert.equal(state.crabs.feast, true);
  assert.equal(state.inventory.shells, VL.TUNING.shellCap, 'the small purse, full');
  assert.equal(state.hp, state.maxHp);
  assert.ok(state.popups.queue.includes('crabFeast'));
  const { title, text } = VL.POPUPS.crabFeast;
  assert.match(text, /purse/i);
  assert.match(text, /heart/i);
  assert.doesNotMatch(`${title} ${text}`, /once|again|never|only/i);
  assert.equal(VL.ART.popupLayout({ title, text }).overflow, false);
  assert.ok(VL.serializeSave(state).crabs.feast);
  // Again: the crabs come out, but beating them brings nothing.
  state.popups.queue.length = 0;
  VL.place(state, ow('3,-3', 8, 4, 'up'));
  state.hp = 1;
  state.inventory.shells = 0;
  digAll(VL, state, tiles);
  assert.equal(crabsIn(state).length, 11, 'the crabs come out every time');
  state.player.invuln = 999;
  for (const crab of crabsIn(state)) beat(VL, state, crab);
  assert.equal(state.hp, 1);
  assert.equal(state.inventory.shells, 0);
  assert.ok(!state.popups.queue.includes('crabFeast'));
});

test('with the Big Shell Purse the feast fills it to 50; with the crabs already angry, the island crabs are angry too', () => {
  const { VL } = loadGame();
  const state = island(VL, (s) => {
    s.items.shellPurse = true;
    Object.assign(s.crabs, { killed: 10, angry: true });
  });
  digAll(VL, state, VL.islandDigTiles());
  const crabs = crabsIn(state);
  assert.equal(crabs.length, 11);
  assert.ok(crabs.every((c) => c.angry && c.hp === VL.TUNING.enemyCrab.hp + 1));
  state.player.invuln = 999;
  for (const crab of crabs) beat(VL, state, crab);
  assert.equal(state.inventory.shells, 50);
  assert.equal(state.crabs.killed, 10, 'still not counted');
});

test('leaving the island before they are all beaten sends them home; the holes fill in for the next visit', () => {
  const { VL } = loadGame();
  const state = island(VL);
  digAll(VL, state, VL.islandDigTiles());
  state.player.invuln = 999;
  beat(VL, state, crabsIn(state)[0]);
  VL.place(state, ow('3,-3', 8, 4, 'up'));
  assert.equal(crabsIn(state).length, 0);
  assert.equal(state.crabs.feast, false);
});

test('the progression table: the island\'s crabs are optional, with the island and a shovel', () => {
  const { VL } = loadGame();
  const lock = VL.LOCKS.islandCrabs;
  assert.equal(lock.optional, true);
  assert.deepEqual(JSON.parse(JSON.stringify(lock.needs)), ['lakeIsland', ['woodShovel', 'metalShovel']]);
  assert.deepEqual([...VL.solveProgression().problems], []);
});
