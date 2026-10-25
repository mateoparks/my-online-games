// The spot ledger (README "Spots"): every spot on the map names the item that
// fills it (`by`), and LEDGER lists the spots still empty, by owner. An item
// that fills its spots deletes them here in the same change; the run is not
// finished until LEDGER is empty (W20 checks it), so no required find, door
// or chicken can be left as a bare marker.
const assert = require('node:assert/strict');
const { test, loadGame } = require('./harness');

// Entities sharing a tile with a spot nobody has filled: a lane that placed
// its own entity there instead of calling VL.fillSpot, so the find would
// exist twice once the spot is filled.
function squatters(VL) {
  const found = [];
  for (const id of VL.unfilledSpots()) {
    const spot = VL.SPOTS[id];
    for (const entity of VL.getScreen(spot.area, spot.screen).entities) {
      if (entity.x === spot.x && entity.y === spot.y && !(entity.type === 'spot' && entity.id === id)) {
        found.push(`${entity.type} ${entity.id || ''} on spot ${id}`.replace('  ', ' '));
      }
    }
  }
  return found;
}

const LEDGER = {
  W17: ['oreLakeIsland', 'shipwreckHatch'],
  W18: ['lighthouseDoor'],
  W19: ['lairDoor'],
};

test('the spot ledger: the spots no item has filled yet, by owner', () => {
  const { VL } = loadGame();
  const unfilled = {};
  for (const id of VL.unfilledSpots()) (unfilled[VL.SPOTS[id].by] ||= []).push(id);
  for (const list of Object.values(unfilled)) list.sort();
  assert.deepEqual(unfilled, LEDGER);
  assert.deepEqual([...VL.unplacedFills()], []);
});

test('every spot is owned by a later item, never W8 itself', () => {
  const { VL } = loadGame();
  for (const spot of Object.values(VL.SPOTS)) {
    const n = Number(spot.by.slice(1));
    assert.ok(n >= 5 && n <= 23 && n !== 8, `${spot.id} by ${spot.by}`);
  }
});

test('nothing but its filler sits on an unfilled spot', () => {
  assert.deepEqual(squatters(loadGame().VL), []);
});

test('the squatter check catches an entity placed on a spot instead of filling it', () => {
  const { VL } = loadGame();
  const spot = VL.SPOTS.lairDoor;
  VL.getScreen(spot.area, spot.screen).entities.push({ type: 'door', id: 'lairDoor', x: spot.x, y: spot.y });
  assert.deepEqual(squatters(VL), ['door lairDoor on spot lairDoor']);
});
