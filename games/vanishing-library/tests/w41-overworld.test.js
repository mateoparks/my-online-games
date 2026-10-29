// W41, Matthew's sixth playtest notes (overworld): the buried heart's nook
// of bushes back as W34 had it, five berries to one ink, and one chicken on
// the highlands' middle shelves, carried to whichever chasm he wants.
const assert = require('node:assert/strict');
const { test, loadGame, playState, hold, memoryStorage } = require('./harness');
const { createPlaythrough, findPath } = require('./playthrough');
const { walk, flyFrom, dropChicken } = require('./highlands-route');
const { face } = require('./metal-gear-route');

const plain = (value) => JSON.parse(JSON.stringify(value));
const ow = (screen, tx, ty, facing = 'up') => ({ area: 'overworld', screen, tx, ty, facing });

// ---------- the buried heart's bushes ----------

test('the buried heart lies in W34\'s nook of bushes again: bushes all round but the tree, the one in front cut to reach it, no flowers', () => {
  const { VL } = loadGame();
  const screen = VL.getScreen('overworld', '5,0');
  const spot = VL.SPOTS.heartFieldA;
  assert.deepEqual([spot.screen, spot.x, spot.y, spot.how], ['5,0', 14, 8, 'buried']);
  assert.deepEqual(plain(screen.tiles.slice(7, 10)), [
    'T.....B......BBT',
    'T..,.........B.T',
    'T.........,..BBT',
  ], 'the rows W34 left');
  const ring = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const ch = screen.tiles[8 + dy][14 + dx];
      if ((dx || dy) && !VL.tileInfo('overworld', ch).tree) ring.push(ch);
    }
  }
  assert.deepEqual(ring, ['B', 'B', 'B', 'B', 'B']);
  assert.ok(VL.tileInfo('overworld', 'B').cuttable, 'a bush is cut to get in');
  assert.equal(screen.tiles[8][14], '.', 'the heart\'s own square is bare grass');
  // On foot the nook is shut until a bush is cut for the visit.
  const state = playState(VL, ow('5,0', 11, 8));
  const to = { area: 'overworld', screen: '5,0', tx: 14, ty: 8 };
  assert.equal(findPath(VL, { area: 'overworld', screen: '5,0', tx: 11, ty: 8 }, to, state), null, 'shut in by the bushes');
  VL.setRoomTile(state, 13, 8, '.');
  assert.ok(findPath(VL, { area: 'overworld', screen: '5,0', tx: 11, ty: 8 }, to, state), 'open once the bush in front is cut');
});

// ---------- five berries to one ink ----------

function inkSetup() {
  const { VL } = loadGame();
  const app = VL.createApp();
  app.game = VL.newGame({ name: 'Robin' });
  app.setScene('play');
  app.game.popups.seen.controls = true;
  VL.place(app.game, ow('1,1', 4, 6));
  VL.giveItem(app.game, 'mortarPestle');
  app.game.popups.queue.length = 0;
  app.game.holdUp = null;
  const press = (action) => app.update(VL.actions({ pressed: [action] }), 1 / 60);
  return { VL, app, game: app.game, press };
}

test('the Mortar & Pestle grinds five berries into one ink', () => {
  const { VL, app, game, press } = inkSetup();
  assert.equal(VL.TUNING.berriesPerInk, 5);
  assert.equal(VL.TUNING.inkPerBerry, undefined, 'the old one-berry rate is gone');
  VL.addResource(game, 'berries', 7);
  game.hands.mainHand = 'mortarPestle';
  press('mainHand');
  assert.deepEqual([game.inventory.berries, game.inventory.ink], [2, 1]);
  assert.ok(game.flags.madeInk);
  for (let t = 0; t < VL.TUNING.grindSeconds + 0.1; t += 1 / 60) app.update(VL.noActions(), 1 / 60);
  while (VL.currentPopup(game)) VL.closePopup ? VL.closePopup(game) : game.popups.queue.shift();
  press('mainHand');
  assert.deepEqual([game.inventory.berries, game.inventory.ink], [2, 1], 'two berries are not enough');
});

test('with fewer than five berries the mortar says how many it takes, and nothing changes', () => {
  const { VL, game } = inkSetup();
  VL.addResource(game, 'berries', 4);
  assert.equal(VL.makeInk(game), false);
  assert.deepEqual([game.inventory.berries, game.inventory.ink], [4, 0]);
  assert.equal(game.flags.madeInk, undefined);
  assert.match(VL.currentPopup(game).text, /5 berries/);
  assert.equal(VL.makeInk(game, { quiet: true }), false, 'the equipment screen refuses too');
});

test('the mortar\'s words say five berries, and fit', () => {
  const { VL } = loadGame();
  const item = VL.ITEMS.mortarPestle;
  assert.match(item.about, /5 berries/);
  assert.match(item.popup.text, /5 berries/);
  assert.equal(VL.ART.popupLayout(item.popup).overflow, false);
  assert.deepEqual(plain(VL.ART.missingGlyphs(`${item.about} ${item.popup.text}`)), []);
});

test('one ink is three picks of a berry bush, and the bushes by the hut, in the Woods and on the highlands still regrow', () => {
  const { VL } = loadGame();
  assert.ok(Math.ceil(VL.TUNING.berriesPerInk / VL.TUNING.berriesPerPick) <= 3, 'no more than three picks');
  const bushes = [];
  for (const [key, screen] of Object.entries(VL.AREAS.overworld.screens)) {
    screen.tiles.forEach((row) => [...row].forEach((ch) => {
      const info = VL.tileInfo('overworld', ch);
      if (info.berry && !info.picked) bushes.push(key);
    }));
  }
  assert.deepEqual(bushes.sort(), ['-1,-3', '0,0', '7,-2']);
});

test('a bush picked three times (away and back between picks) makes an ink; the store\'s berries make one for 15 shells', () => {
  const { VL } = loadGame();
  const { drive } = createPlaythrough(VL);
  const g = drive.state;
  g.popups.seen.controls = true;
  let bush;
  for (const [ty, row] of VL.getScreen('overworld', '0,0').tiles.entries()) {
    const tx = [...row].findIndex((ch) => VL.tileInfo('overworld', ch).berry);
    if (tx !== -1) bush = { tx, ty };
  }
  for (let pick = 0; pick < 3; pick += 1) {
    VL.place(g, ow('0,0', bush.tx, bush.ty + 1, 'up'));
    assert.ok(VL.pickBerries(g, bush.tx, bush.ty), `pick ${pick + 1}`);
  }
  assert.ok(g.inventory.berries >= VL.TUNING.berriesPerInk);
  VL.giveItem(g, 'mortarPestle');
  assert.ok(VL.makeInk(g, { quiet: true }));
  assert.equal(g.inventory.ink, 1);
  const shells = VL.TUNING.prices.buyBerry.shells * VL.TUNING.berriesPerInk;
  assert.equal(shells, 15);
});

// ---------- one chicken on the middle shelves ----------

const MIDDLE = ['-1,-3', '-2,-3', '-2,-4'];

test('the middle shelves keep one chicken, between the two chasms; the ledge below and the lair side keep theirs', () => {
  const { VL } = loadGame();
  const hens = Object.values(VL.SPOTS).filter((s) => s.how === 'chicken' && VL.regionOf('overworld', s.screen) === 'highlands');
  assert.deepEqual(plain(hens.map((s) => [s.id, s.screen])).sort(), [['chickenHighlands', '-2,-3'], ['chickenLair', '-1,-4']]);
  assert.equal(VL.SPOTS.chickenGap, undefined);
  assert.equal(VL.SPOTS.chickenLedge.screen, '-1,-2');
  for (const key of MIDDLE) {
    const there = VL.getScreen('overworld', key).entities.filter((e) => e.type === 'chicken');
    assert.equal(there.length, key === '-2,-3' ? 1 : 0, key);
  }
});

// On the first shelf with the Almanac read and his hands empty, the ledge's
// chicken left at home.
function shelves() {
  const { VL } = loadGame();
  const { drive } = createPlaythrough(VL);
  const g = drive.state;
  g.flags.chickenAlmanacRead = true;
  g.items.climbersAlmanac = true;
  for (const id of ['controls', 'hiddenPathFound']) g.popups.seen[id] = true;
  VL.place(g, ow('-1,-3', 7, 8));
  return { VL, drive };
}

const tile = (drive) => [drive.state.player.screen, drive.VL.heroTile(drive.state).tx, drive.VL.heroTile(drive.state).ty];
const hensHere = (drive) => plain(drive.state.room.entities.filter((e) => e.type === 'chicken').map((e) => e.spot));

test('carried from its shelf to the second chasm, the one chicken flies him over to the lair side', () => {
  const { drive } = shelves();
  assert.deepEqual(hensHere(drive), [], 'no chicken by the first chasm');
  flyFrom(drive, ow('-2,-4', 12, 4), 'chickenHighlands', 'right');
  assert.deepEqual(tile(drive), ['-1,-4', 1, 4]);
  assert.equal(drive.state.player.carrying?.spot, 'chickenHighlands', 'it lands with him');
  assert.deepEqual(hensHere(drive), ['chickenLair']);
});

test('carried from its shelf to the first chasm, the one chicken flies him down to the ledge', () => {
  const { drive } = shelves();
  walk(drive, ow('-2,-4', 8, 5));
  assert.deepEqual(hensHere(drive), [], 'no chicken by the second chasm');
  flyFrom(drive, ow('-1,-3', 7, 9), 'chickenHighlands', 'down');
  assert.deepEqual(tile(drive), ['-1,-2', 7, 3]);
  assert.equal(drive.state.player.carrying?.spot, 'chickenHighlands');
});

test('the way back down from the lair: the lair\'s chicken over the second chasm, then either chicken over the first', () => {
  const { drive } = shelves();
  drive.VL.place(drive.state, ow('-1,-4', 3, 5));
  flyFrom(drive, ow('-1,-4', 1, 4), 'chickenLair', 'left');
  assert.deepEqual(tile(drive), ['-2,-4', 12, 4]);
  // Set down on the shelf, the lair's chicken is not needed: the middle one is fetched.
  flyFrom(drive, ow('-1,-3', 7, 9), 'chickenHighlands', 'down');
  assert.deepEqual(tile(drive), ['-1,-2', 7, 3]);
});

test('thrown into the chasm the chicken flaps back to him, and left on another shelf it is home at its spot next visit', () => {
  const { VL, drive } = shelves();
  flyFrom(drive, ow('-2,-4', 11, 4), 'chickenHighlands', 'left');
  // (A hop facing a wall: he stands by the chasm holding it.)
  walk(drive, ow('-2,-4', 12, 4));
  face(drive, 'right');
  drive.press('interact');
  assert.equal(drive.state.player.carrying, null, 'thrown');
  drive.until((state) => state.room.entities.some((e) => e.spot === 'chickenHighlands' && e.mode === 'idle'), 6);
  const hen = drive.state.room.entities.find((e) => e.spot === 'chickenHighlands');
  assert.ok(!VL.tileInfo('overworld', VL.tileAt('overworld', '-2,-4', hen.x, hen.y, drive.state.room)).chasm, 'back on the shelf');
  flyFrom(drive, ow('-2,-4', 12, 4), 'chickenHighlands', 'right');
  assert.deepEqual(tile(drive), ['-1,-4', 1, 4], 'and it still flies him over');
  // Fly back with the lair's, leave it, and the middle one is home again.
  VL.place(drive.state, ow('-1,-4', 3, 5));
  drive.state.player.carrying = null;
  flyFrom(drive, ow('-1,-4', 1, 4), 'chickenLair', 'left');
  dropChicken(drive);
  walk(drive, ow('-2,-3', 5, 3));
  assert.deepEqual(hensHere(drive), ['chickenHighlands']);
});

test('after a faint or a reload with the chicken in his arms, it is back at its spot and the climb still works', () => {
  for (const how of ['faint', 'reload']) {
    const { VL, drive } = shelves();
    flyFrom(drive, ow('-2,-4', 10, 5), 'chickenHighlands', 'up');
    assert.equal(drive.state.player.carrying?.spot, 'chickenHighlands');
    if (how === 'faint') {
      VL.faint(drive.state, 'gull');
      drive.until(() => drive.app.sceneId === 'fainted', 3);
      drive.hold([], 0.8);
      drive.press('interact');
      drive.closePopups();
    } else {
      drive.state.flags.chickenAlmanacRead = true;
      drive.app.save();
      drive.reload();
      drive.closePopups();
    }
    assert.ok(!drive.state.player.carrying, `${how}: hands empty`);
    // Back up on the first shelf (the ledge's chicken, as a player climbs).
    VL.place(drive.state, ow('-1,-3', 7, 8));
    walk(drive, ow('-2,-3', 5, 3));
    assert.deepEqual(hensHere(drive), ['chickenHighlands'], `${how}: home at its spot`);
    flyFrom(drive, ow('-2,-4', 12, 4), 'chickenHighlands', 'right');
    assert.deepEqual(tile(drive), ['-1,-4', 1, 4], how);
  }
});

test('the solver and both reachability models stay clean with one middle chicken', () => {
  const { VL } = loadGame();
  assert.deepEqual([...VL.solveProgression().problems], []);
});
