// W34, Matthew's fourth playtest notes (world, economy, controls, books).
const assert = require('node:assert/strict');
const { test, loadGame, playState, hold } = require('./harness');

const ow = (screen, tx, ty, facing = 'up') => ({ area: 'overworld', screen, tx, ty, facing });

// ---------- walking speed ----------

test('the hero walks at about 2/3 of the W30 pace, and the Swiftfoot Boots keep their speed', () => {
  const { VL } = loadGame();
  const [w30Walk, w30Boots] = [70, 70 * 1.35];
  assert.ok(Math.abs(VL.TUNING.heroSpeed / w30Walk - 2 / 3) < 0.02, `walk ${VL.TUNING.heroSpeed}`);
  const state = VL.newGame();
  assert.equal(VL.heroSpeed(state), VL.TUNING.heroSpeed);
  state.items.swiftfootBoots = true;
  assert.ok(Math.abs(VL.heroSpeed(state) - w30Boots) < 1, `boots ${VL.heroSpeed(state)}`);
});

test('what chases the hero slowed with him, so a bat, a slime or a paper wad is still as easy to dodge as before', () => {
  const { VL } = loadGame();
  const T = VL.TUNING;
  const ratio = T.heroSpeed / 70;
  for (const [name, now, w30] of [['bat', T.enemyBat.speed, 44], ['slime hop', T.enemySlime.hopSpeed, 46], ['paper wad', T.bookwormSpitSpeed, 64]]) {
    assert.ok(Math.abs(now / w30 - ratio) < 0.03, `${name}: ${now}`);
  }
});

// ---------- the metal shovel takes wood too ----------

const plain = (value) => JSON.parse(JSON.stringify(value));
const offerIn = (VL, shop, id) => VL.SHOPS[shop].offers.find((o) => o.id === id);

test('the smith forges a metal shovel from 3 wood, 1 ore lump and 10 shells (6 with the Smith\'s Ledger); the sword and shield are unchanged', () => {
  const { VL } = loadGame();
  assert.deepEqual(plain(offerIn(VL, 'smithy', 'metalShovel').cost), { wood: 3, ore: 1, shells: 10 });
  assert.deepEqual(plain(offerIn(VL, 'smithy', 'metalShovelLedger').cost), { wood: 3, ore: 1, shells: 6 });
  for (const id of ['metalSword', 'metalShield']) assert.deepEqual(plain(offerIn(VL, 'smithy', id).cost), { ore: 1, shells: 10 });
  const state = playState(VL, ow('3,0', 6, 4));
  Object.assign(state.inventory, { ore: 1, shells: 10, wood: 2 });
  assert.deepEqual(plain(VL.buyOffer(state, offerIn(VL, 'smithy', 'metalShovel'))), { ok: false, reason: 'notEnough', kind: 'wood' });
  state.inventory.wood = 3;
  assert.equal(VL.buyOffer(state, offerIn(VL, 'smithy', 'metalShovel')).ok, true);
  assert.deepEqual([state.inventory.wood, state.inventory.ore, state.inventory.shells], [0, 0, 0]);
  assert.ok(VL.hasItem(state, 'metalShovel'));
});

test('the progression table knows the metal shovel needs wood, and the solver stays clean', () => {
  const { VL } = loadGame();
  assert.ok(VL.LOCKS.metalShovel.needs.includes('wood'));
  assert.deepEqual([...VL.solveProgression().problems], []);
});
