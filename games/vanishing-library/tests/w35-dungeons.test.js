// W35, Matthew's fourth playtest notes on the dungeons and bosses: seeds that
// fly over the Hollow Oak's roots, boss hints only from Gran Ottie after a
// faint, no shell heaps in the Lighthouse, lava that hurts instead of
// blocking, the Dragon and its guards needing the metal sword, metal-only
// enemies in the Lighthouse, no mirror signs, no stray twinkle in the hoard,
// a hit the Dragon shows, and no string hint at the marionettes.
const assert = require('node:assert/strict');
const { test, loadGame, playState, hold } = require('./harness');

const plain = (value) => JSON.parse(JSON.stringify(value));

// ---------- 1. the Hollow Oak's north-west room: seeds over the roots ----------

function tangleNorth({ tx = 11, ty = 7 } = {}) {
  const { VL } = loadGame();
  const state = playState(VL, { area: 'hollowOak', screen: '-1,-2', tx, ty, facing: 'up' });
  state.popups.queue.length = 0;
  return { VL, state };
}

test('in the tangle\'s north room a spitter\'s seed flies over the roots and still hits him', () => {
  const { VL, state } = tangleNorth();
  const plant = state.room.entities.find((e) => e.type === 'spitter' && e.x === 11 && e.y === 3);
  assert.ok(plant.overWalls, 'placed to spit over the walls');
  for (const ty of [4, 5, 6]) assert.ok(VL.isSolidAt('hollowOak', '-1,-2', 11, ty), `a root at (11,${ty}) between them`);
  const hp = state.hp;
  hold(VL, state, [], 4);
  assert.ok(state.hp < hp, 'the seed crossed three roots and hit him');
});

test('a seed over the walls flies on to the edge of the screen', () => {
  const { VL, state } = tangleNorth({ tx: 1, ty: 9 });
  const plant = state.room.entities.find((e) => e.type === 'spitter' && e.x === 11 && e.y === 3);
  const seed = VL.spawnProjectile(state, { cx: plant.cx, cy: plant.cy + 7, vx: 0, vy: 75, size: 'small', damage: 1, cause: 'spitter', sprite: 'fx-seed', owner: plant, overWalls: true });
  let lowest = 0;
  for (let i = 0; i < 240 && state.room.entities.includes(seed); i += 1) {
    VL.updateWorld(state, VL.actions({}), 1 / 60);
    lowest = Math.max(lowest, seed.cy);
  }
  assert.ok(!state.room.entities.includes(seed), 'gone in the end');
  assert.ok(lowest > VL.TUNING.rows * VL.TUNING.tile - 16, `it reached the bottom row (${lowest.toFixed(0)})`);
});

test('every other spitter\'s seed still stops at a wall', () => {
  const { VL } = loadGame();
  const over = [];
  for (const [area, def] of Object.entries(VL.AREAS)) {
    for (const [key, screen] of Object.entries(def.screens)) {
      for (const e of screen.entities) if (e.overWalls) over.push(`${area} ${key} (${e.x},${e.y})`);
    }
  }
  assert.deepEqual(over, ['hollowOak -1,-2 (11,3)', 'hollowOak -1,-2 (5,7)']);
  const state = playState(VL, { area: 'hollowOak', screen: '-1,-2', tx: 11, ty: 7, facing: 'up' });
  const seed = VL.spawnProjectile(state, { cx: 11 * 16 + 8, cy: 3 * 16 + 15, vx: 0, vy: 75, size: 'small', damage: 1, cause: 'spitter', sprite: 'fx-seed' });
  hold(VL, state, [], 0.3);
  assert.ok(!state.room.entities.includes(seed), 'an ordinary seed stops at the first root');
});
