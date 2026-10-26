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
