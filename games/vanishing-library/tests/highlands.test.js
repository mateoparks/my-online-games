// W19, the way into the highlands: the bindery binds the five pages into
// the Climber's Almanac, the Almanac opens the hidden path up the cliff base
// for good (VL.saveTile), and chickens at their spots carry the hero over
// the four-tile chasms there and back, landing with him.
const assert = require('node:assert/strict');
const { test, loadGame, playState, hold, heroTile, read, memoryStorage } = require('./harness');
const { findPath } = require('./playthrough');

const plain = (value) => JSON.parse(JSON.stringify(value));
const ow = (screen, tx, ty, facing = 'up') => ({ area: 'overworld', screen, tx, ty, facing });
const PATH = [[10, 4], [10, 5]];

function bound(VL, state) {
  const offer = VL.SHOPS.bookbinder.offers.find((o) => o.id === 'bindPages');
  offer.give(state);
}

// ---------- the Almanac ----------

test('binding the five pages gives the Climber\'s Almanac: worn, held up, its popup, and climbersAlmanac reached', () => {
  const { VL } = loadGame();
  const state = playState(VL, ow('2,1', 7, 5));
  state.popups.seen.controls = true;
  assert.ok(!VL.LOCKS.climbersAlmanac.reached(state));
  bound(VL, state);
  hold(VL, state, [], 0.1);
  assert.ok(VL.hasItem(state, 'climbersAlmanac'));
  assert.ok(VL.ITEMS.climbersAlmanac.worn, 'worn, so no hand is taken');
  assert.deepEqual([state.hands.mainHand, state.hands.offHand], [null, null]);
  assert.deepEqual(plain(state.holdUp.sprites), ['item-climbers-almanac']);
  assert.ok(state.popups.queue.includes('climbersAlmanac'));
  assert.ok(VL.LOCKS.climbersAlmanac.reached(state));
  assert.equal(plain(VL.serializeSave(state)).items.climbersAlmanac, true, 'saved at once');
});

test('a save that was bound before the Almanac existed gets the book on its first step', () => {
  const { VL } = loadGame();
  const state = playState(VL, ow('2,1', 7, 5));
  state.flags.pagesBound = true;
  hold(VL, state, [], 0.05);
  assert.ok(VL.hasItem(state, 'climbersAlmanac'));
});

test('the Almanac\'s words fit their boxes and the font', () => {
  const { VL } = loadGame();
  for (const box of [VL.POPUPS.climbersAlmanac, VL.POPUPS.hiddenPathFound]) {
    assert.deepEqual(plain(VL.ART.missingGlyphs(`${box.title} ${box.text}`)), [], box.text);
    assert.ok(!VL.ART.popupLayout(box).overflow, box.text);
  }
  assert.ok(VL.ART.SPRITES['item-climbers-almanac']);
});

// ---------- the hidden path ----------

test('without the Almanac the hidden path is solid cliff, in the real game too', () => {
  const { VL } = loadGame();
  const state = playState(VL, ow('-1,-2', 10, 6));
  for (const [tx, ty] of PATH) assert.ok(VL.isSolidAt('overworld', '-1,-2', tx, ty, state.room));
  assert.equal(findPath(VL, { area: 'overworld', screen: '-1,-2', tx: 10, ty: 6 }, { area: 'overworld', screen: '-1,-2', tx: 10, ty: 3 }, state), null);
  hold(VL, state, ['up'], 1);
  assert.equal(heroTile(VL, state)[1], 6, 'he walks into rock');
});

test('with the Almanac the hidden path opens for good (VL.saveTile), he climbs it, and its popup shows once there', () => {
  const { VL } = loadGame();
  const state = playState(VL, ow('-1,-1', 7, 5));
  state.popups.seen.controls = true;
  state.items.climbersAlmanac = true;
  hold(VL, state, [], 0.05);
  for (const [tx, ty] of PATH) assert.equal(VL.savedTile(state, 'overworld', '-1,-2', tx, ty), 'i', `${tx},${ty} saved open`);
  assert.equal(plain(VL.serializeSave(state)).tileChanges['overworld:-1,-2']['10,4'], 'i');
  assert.ok(!state.popups.queue.includes('hiddenPathFound'), 'its popup waits until he is there');
  VL.place(state, ow('-1,-2', 10, 6));
  for (const [tx, ty] of PATH) assert.ok(!VL.isSolidAt('overworld', '-1,-2', tx, ty, state.room), `${tx},${ty} passable`);
  hold(VL, state, [], 0.05);
  assert.ok(state.popups.queue.includes('hiddenPathFound'));
  state.popups.queue.length = 0;
  state.popups.seen.hiddenPathFound = true;
  assert.ok(findPath(VL, { area: 'overworld', screen: '-1,-2', tx: 10, ty: 6 }, { area: 'overworld', screen: '-1,-2', tx: 7, ty: 3 }, state), 'the pathfinder climbs it');
  hold(VL, state, ['up'], 1.6);
  assert.equal(heroTile(VL, state)[1], 3, 'up on the ledge');
});

test('the opened path survives a reload: a fresh game from the save finds it open as the screen is built', () => {
  const { VL } = loadGame();
  const state = playState(VL, ow('-1,-1', 7, 5));
  state.items.climbersAlmanac = true;
  hold(VL, state, [], 0.05);
  const storage = VL.createStorage(memoryStorage());
  VL.saveSlot(storage, 0, state);
  // The save itself holds the cleft: read it as data, before any room build
  // could reopen it from the Almanac.
  const { save } = VL.readSlot(storage, 0);
  for (const ty of [4, 5]) assert.equal(VL.savedTile(save, 'overworld', '-1,-2', 10, ty), 'i', `saved open at (10,${ty})`);
  const again = VL.loadSlot(storage, 0);
  VL.place(again, ow('-1,-2', 10, 6));
  assert.equal(VL.tileAt('overworld', '-1,-2', 10, 4, again.room), 'i');
  assert.ok(!VL.isSolidAt('overworld', '-1,-2', 10, 5, again.room));
});

test('the table: climbersAlmanac and highlands keep the plan, highlands is reached on the shelves above the chasm', () => {
  const { VL } = loadGame();
  for (const id of ['climbersAlmanac', 'highlands']) assert.ok(VL.LOCKS[id].reached, id);
  assert.deepEqual([...VL.LOCKS.highlands.needs].sort(), ['chickenFlightLong', 'cliffs', 'climbersAlmanac']);
  assert.deepEqual({ ...VL.LOCKS.climbersAlmanac.count }, { pages: 5 });
  const state = playState(VL, ow('-1,-2', 7, 3));
  assert.ok(!VL.LOCKS.highlands.reached(state), 'the ledge is the cliffs');
  VL.place(state, ow('-1,-3', 7, 8));
  assert.ok(VL.LOCKS.highlands.reached(state));
  assert.deepEqual([...VL.solveProgression().problems], []);
});

// ---------- the chickens ----------

// On the ledge with the path open, the Almanac read (or not), the ledge's
// chicken in his arms.
function onLedge({ almanacRead = true } = {}) {
  const { VL } = loadGame();
  const state = playState(VL, ow('-1,-2', 7, 3));
  Object.assign(state.items, { climbersAlmanac: true });
  state.flags.chickenAlmanacRead = almanacRead;
  for (const id of ['controls', 'hiddenPathFound']) state.popups.seen[id] = true;
  state.room.entities = state.room.entities.filter((e) => !VL.isEnemy(e));
  hold(VL, state, [], 0.05);
  const hen = state.room.entities.find((e) => e.type === 'chicken' && e.spot === 'chickenLedge');
  assert.ok(hen, 'a chicken waits on the ledge');
  assert.ok(VL.liftChicken(state, hen));
  state.player.facing = 'up';
  return { VL, state };
}

function fly(VL, state, facing) {
  state.player.facing = facing;
  VL.updateWorld(state, VL.actions({ pressed: ['fly'] }), 1 / 60);
  for (let t = 0; t < 6 && (state.player.flight || state.transition); t += 1 / 60) VL.updateWorld(state, VL.noActions(), 1 / 60);
  hold(VL, state, [], 0.05);
}

test('from the ledge a long flight crosses the chasm and its screen edge, and he lands holding the chicken', () => {
  const { VL, state } = onLedge();
  fly(VL, state, 'up');
  assert.deepEqual([state.player.screen, ...heroTile(VL, state)], ['-1,-3', 7, 9], 'set down on the first shelf');
  assert.equal(state.player.carrying?.spot, 'chickenLedge', 'the chicken lands with him');
  assert.ok(VL.LOCKS.highlands.reached(state));
  const hens = state.room.entities.filter((e) => e.type === 'chicken').map((e) => e.spot);
  assert.deepEqual(plain(hens), [], 'the first shelf has no chicken of its own since W41');
});

test('without the Chicken Keeper\'s Almanac read, a short flight falls short and flaps him back to the ledge', () => {
  const { VL, state } = onLedge({ almanacRead: false });
  fly(VL, state, 'up');
  assert.deepEqual([state.player.screen, ...heroTile(VL, state)], ['-1,-2', 7, 3]);
  assert.equal(state.hp, state.maxHp, 'no harm done');
});

test('every highland flight works both ways from a chicken at its spot, and a chicken carried off is back at its spot next visit', () => {
  const { VL } = loadGame();
  const state = playState(VL, ow('-2,-4', 12, 4));
  state.flags.chickenAlmanacRead = true;
  state.items.climbersAlmanac = true;
  for (const id of ['controls', 'hiddenPathFound']) state.popups.seen[id] = true;
  const takeOff = (place, spot, facing) => {
    VL.place(state, place);
    state.room.entities = state.room.entities.filter((e) => !VL.isEnemy(e));
    state.player.carrying = null;
    hold(VL, state, [], 0.05);
    // The middle shelves' one chicken (W41) is carried from its own screen.
    const home = VL.SPOTS[spot];
    if (home.screen !== place.screen) {
      VL.place(state, { area: 'overworld', screen: home.screen, tx: home.x, ty: home.y });
      assert.ok(VL.liftChicken(state, state.room.entities.find((e) => e.spot === spot)), `${spot} lifted on ${home.screen}`);
      VL.place(state, place);
      return flyNow(facing);
    }
    const hen = state.room.entities.find((e) => e.type === 'chicken' && e.spot === spot);
    assert.ok(hen, `${spot} is at its spot on ${place.screen}`);
    Object.assign(hen, { px: state.player.x, py: state.player.y + 6, mode: 'idle', idle: 99 });
    return flyNow(facing);
  };
  const flyNow = (facing) => {
    fly(VL, state, facing);
    return [state.player.screen, ...heroTile(VL, state)];
  };
  assert.deepEqual(takeOff(ow('-2,-4', 12, 4), 'chickenHighlands', 'right'), ['-1,-4', 1, 4], 'east over the second chasm');
  assert.equal(state.player.carrying?.spot, 'chickenHighlands');
  assert.ok(state.room.entities.some((e) => e.type === 'chicken' && e.spot === 'chickenLair'), 'the lair side keeps its own chicken');
  assert.deepEqual(takeOff(ow('-1,-4', 1, 5), 'chickenLair', 'left'), ['-2,-4', 12, 5], 'and back west');
  assert.deepEqual(takeOff(ow('-1,-3', 7, 9), 'chickenHighlands', 'down'), ['-1,-2', 7, 3], 'down to the ledge');
  // The ledge's chicken was carried up and left on the shelf: it is home again.
  state.player.carrying = null;
  VL.place(state, ow('-1,-2', 7, 3));
  assert.ok(state.room.entities.some((e) => e.type === 'chicken' && e.spot === 'chickenLedge'));
});

test('README documents the highlands', () => {
  const readme = read('README.md');
  for (const word of ['## The highlands (W19)', 'climbersAlmanac', 'VL.HIDDEN_PATH', 'hiddenPathFound']) assert.ok(readme.includes(word), word);
});
