// W32, the polish pass: the Mirror Shield lands in the off hand, nothing
// hides under the HUD, save points say where he wakes, broken shells show in
// the counts, and the flash guard's red rule (that one lives in smoke.js).
const assert = require('node:assert/strict');
const { test, loadGame } = require('./harness');

const plain = (value) => JSON.parse(JSON.stringify(value));

// ---------- 1. the Mirror Shield is always in a hand ----------

test('the Mirror Shield goes into the off hand even when it is full; the old item stays in the bag', () => {
  const { VL } = loadGame();
  const game = VL.newGame({ name: 'Robin' });
  for (const id of ['woodSword', 'slingshot']) game.items[id] = true;
  game.hands = { mainHand: 'woodSword', offHand: 'slingshot' };
  VL.giveItem(game, 'mirrorShield');
  assert.deepEqual(plain(game.hands), { mainHand: 'woodSword', offHand: 'mirrorShield' });
  assert.ok(VL.hasItem(game, 'slingshot'), 'the slingshot is still his, in the equipment list');
  assert.ok(VL.equipmentItems(game).some((item) => item.id === 'slingshot'));
  const popup = VL.POPUPS.mirrorShield.text;
  assert.ok(/off hand/.test(popup) && /\bD\b/.test(popup), popup);
});

test('the Mirror Shield over a two-handed shovel frees both hands and takes the off hand', () => {
  const { VL } = loadGame();
  const game = VL.newGame({ name: 'Robin' });
  game.items.woodShovel = true;
  game.hands = { mainHand: 'woodShovel', offHand: 'woodShovel' };
  VL.giveItem(game, 'mirrorShield');
  assert.deepEqual(plain(game.hands), { mainHand: null, offHand: 'mirrorShield' });
});

test('the Mirror Shield already owned and moved to the bag is not pushed back into a hand', () => {
  const { VL } = loadGame();
  const game = VL.newGame({ name: 'Robin' });
  for (const id of ['woodSword', 'slingshot', 'mirrorShield']) game.items[id] = true;
  game.hands = { mainHand: 'woodSword', offHand: 'slingshot' };
  VL.giveItem(game, 'mirrorShield');
  assert.deepEqual(plain(game.hands), { mainHand: 'woodSword', offHand: 'slingshot' });
});

test('other gear still only fills an empty hand (a forged metal shield leaves the wood one held)', () => {
  const { VL } = loadGame();
  const game = VL.newGame({ name: 'Robin' });
  for (const id of ['woodSword', 'woodShield']) game.items[id] = true;
  game.hands = { mainHand: 'woodSword', offHand: 'woodShield' };
  VL.giveItem(game, 'metalShield');
  assert.deepEqual(plain(game.hands), { mainHand: 'woodSword', offHand: 'woodShield' });
});
