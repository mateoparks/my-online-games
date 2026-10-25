// W29, Matthew's second playtest notes: clear shore barriers, the Woods
// spitters only a metal sword beats, the tree gate before the Hollow Oak,
// shells and digging, the dig key, the berry bushes spread along the story,
// the purses and bushes that give wood more often.
const assert = require('node:assert/strict');
const { test, loadGame, playState, hold } = require('./harness');

const plain = (value) => JSON.parse(JSON.stringify(value));
const ow = (screen, tx, ty, facing = 'up') => ({ area: 'overworld', screen, tx, ty, facing });
const shared = loadGame().VL;

// ---------- shore barriers ----------

const SHORE = new Set(['sand', 'shallow']);
const groundName = (VL, info) => VL.ART.groundOf(info).name;
const onShore = (VL, info) => SHORE.has(groundName(VL, info));
const liftable = (info) => Boolean(info.rock || info.boulder);

function overworldTiles(VL, visit) {
  for (const [key, screen] of Object.entries(VL.AREAS.overworld.screens)) {
    screen.tiles.forEach((row, ty) => [...row].forEach((ch, tx) => visit(key, tx, ty, VL.tileInfo('overworld', ch), ch)));
  }
}

test('nothing liftable stands on the sand or in the shallows, where lifting it would open nothing', () => {
  const VL = shared;
  const problems = [];
  overworldTiles(VL, (key, tx, ty, info, ch) => {
    if (liftable(info) && onShore(VL, info)) problems.push(`${key} (${tx},${ty}) '${ch}' on ${groundName(VL, info)}`);
  });
  assert.deepEqual(problems, []);
});

test('every shore edge that is blocked looks blocked: a barrier that cannot be lifted, never open sand into nothing', () => {
  const VL = shared;
  const { cols, rows } = VL.TUNING;
  const problems = [];
  overworldTiles(VL, (key, tx, ty, info, ch) => {
    const sides = [];
    if (tx === 0) sides.push([-1, 0]);
    if (tx === cols - 1) sides.push([1, 0]);
    if (ty === 0) sides.push([0, -1]);
    if (ty === rows - 1) sides.push([0, 1]);
    for (const [dx, dy] of sides) {
      const shore = info.sand || info.shallow || onShore(VL, info);
      if (!shore) continue;
      const other = VL.neighborKey(key, dx, dy);
      const ox = (tx + dx + cols) % cols;
      const oy = (ty + dy + rows) % rows;
      const open = !VL.isSolidAt('overworld', key, tx, ty);
      const across = VL.screenExists('overworld', other) && !VL.isSolidAt('overworld', other, ox, oy);
      if (open && !across) problems.push(`${key} (${tx},${ty}) '${ch}' looks open but leads nowhere`);
      if (!open && liftable(info)) problems.push(`${key} (${tx},${ty}) '${ch}' blocks the edge but can be lifted`);
    }
  });
  assert.deepEqual(problems, []);
});

test('the shore barrier is driftwood: solid, drawn on the sand, and S or the gloves never move it', () => {
  const { VL } = loadGame();
  const info = VL.tileInfo('overworld', 'j');
  assert.equal(info.solid, true);
  assert.equal(liftable(info), false);
  assert.equal(groundName(VL, info), 'sand');
  assert.ok(VL.ART.TILE_STYLES[info.art], 'it has a look');
  // The hut's beach, east end: the driftwood the brief asks for.
  assert.equal(VL.getScreen('overworld', '1,1').tiles[8][15], 'j');
  const state = playState(VL, ow('1,1', 14, 8, 'right'));
  state.items.liftingGloves = true;
  hold(VL, state, [], 0.1);
  VL.updateWorld(state, VL.actions({ pressed: ['interact'] }), 1 / 60);
  assert.ok(!state.player.lifted);
  assert.equal(VL.tileAt('overworld', '1,1', 15, 8, state.room), 'j');
  assert.ok(!state.message, 'no "too heavy": it is simply part of the shore');
});

test('a rock standing in the shallows would leave shallow water when lifted, never itself again', () => {
  const { VL } = loadGame();
  assert.equal(VL.liftedGround({ rock: true, ground: 'shallow' }), 'w');
});

test('the shallows at a blocked edge end in deep water, as on the harbour beach (hut, lake mouth, harbour, far beach)', () => {
  const VL = shared;
  for (const [key, tx, ty] of [['1,1', 15, 9], ['2,1', 0, 8], ['3,-2', 0, 2], ['3,-2', 15, 2], ['5,1', 15, 8]]) {
    assert.equal(VL.getScreen('overworld', key).tiles[ty][tx], 'W', `${key} (${tx},${ty})`);
  }
  for (const [key, tx, ty] of [['0,1', 0, 7], ['0,1', 0, 8], ['3,-2', 0, 3], ['3,-2', 15, 3], ['5,1', 15, 5]]) {
    assert.equal(VL.getScreen('overworld', key).tiles[ty][tx], 'j', `${key} (${tx},${ty})`);
  }
});
