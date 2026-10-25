// The metal shovel and the metal sword, earned for real before the Hollow
// Oak (W30: its moss room's key is dug with the metal shovel and its tangle's
// thorny spitters fall only to the metal sword). Berries picked and sold for
// ten shells, the shallows ore picked up, the shovel forged, the meadow's
// buried shells dug up with it, then the sword forged with the Scriptorium's
// ore. Every press is a real key.
const assert = require('node:assert/strict');

const ow = (screen, tx, ty) => ({ area: 'overworld', screen, tx, ty });

function face(drive, dir) {
  drive.hold([dir], 2 / 60);
  drive.hold([], 1 / 60);
}

// The berry bush nearest the hut, with a walkable tile beside it.
function berryBush(VL) {
  const [sx, sy] = VL.START.screen.split(',').map(Number);
  const bushes = [];
  for (const [key, screen] of Object.entries(VL.AREAS.overworld.screens)) {
    screen.tiles.forEach((row, ty) => [...row].forEach((ch, tx) => {
      const info = VL.tileInfo('overworld', ch);
      if (!info.berry || info.picked) return;
      const [x, y] = key.split(',').map(Number);
      for (const [dx, dy, facing] of [[0, 1, 'up'], [-1, 0, 'right'], [1, 0, 'left'], [0, -1, 'down']]) {
        if (!VL.isSolidAt('overworld', key, tx + dx, ty + dy)) {
          bushes.push({ far: Math.abs(x - sx) + Math.abs(y - sy), stand: ow(key, tx + dx, ty + dy), facing });
          return;
        }
      }
    }));
  }
  return bushes.sort((a, b) => a.far - b.far)[0];
}

// Talks to a keeper across the counter and picks each offer in turn.
function buy(drive, building, ids) {
  const { VL } = drive;
  drive.walkTo({ area: building, screen: '0,0', ...VL.BUILDINGS[building].talkAt });
  face(drive, 'up');
  drive.press('interact');
  for (let i = 0; i < 20 && drive.app.sceneId !== 'shop'; i += 1) {
    drive.hold([], 0.4);
    drive.press('interact');
  }
  assert.equal(drive.app.sceneId, 'shop', `the ${building} shop opened`);
  for (const id of ids) {
    const view = drive.app.shopView;
    const rows = VL.shopRows(drive.state, view);
    const index = rows.findIndex((row) => row !== 'leave' && row.id === id);
    assert.ok(index >= 0, `${building} sells ${id}`);
    while (view.cursor !== index) drive.press(view.cursor < index ? 'down' : 'up');
    drive.press('interact');
    drive.press('interact');
  }
  drive.press('pause');
  drive.closePopups();
}

// Picks the item into `hand` from the equipment screen (E), as a player would.
function equip(drive, id, hand) {
  const { VL } = drive;
  if (VL.heldItem(drive.state, hand) === id) return;
  drive.press('equipment');
  const index = VL.equipmentItems(drive.state).findIndex((item) => item.id === id);
  assert.ok(index >= 0, `${id} is on the equipment screen`);
  while (drive.app.equipment.cursor % 4 < index % 4) drive.press('right');
  while (drive.app.equipment.cursor % 4 > index % 4) drive.press('left');
  while (drive.app.equipment.cursor < index) drive.press('down');
  drive.press(hand);
  drive.press('equipment');
  assert.equal(VL.heldItem(drive.state, hand), id);
}

function earnShells(drive, least) {
  const { VL } = drive;
  const bush = berryBush(VL);
  for (let round = 0; round < 12 && drive.state.inventory.shells + drive.state.inventory.berries < least; round += 1) {
    drive.walkTo(bush.stand);
    face(drive, bush.facing);
    drive.press('interact');
    drive.closePopups();
    // Berries grow back once the hero has been away.
    drive.walkTo({ area: 'hut', screen: '0,0', tx: 7, ty: 8 });
  }
  const sells = Math.max(0, least - drive.state.inventory.shells);
  buy(drive, 'shop', Array(sells).fill('sellBerry'));
  assert.ok(drive.state.inventory.shells >= least, `${least} shells earned (${drive.state.inventory.shells})`);
}

function metalGear(drive) {
  const { VL } = drive;
  drive.closePopups();
  if (!VL.hasItem(drive.state, 'metalShovel')) {
    if (!VL.spotFound(drive.state, 'oreShallows')) {
      drive.walkTo(ow('1,1', 12, 8));
      drive.until((state) => VL.spotFound(state, 'oreShallows'), 2, ['down']);
      drive.closePopups();
    }
    earnShells(drive, VL.TUNING.prices.metalGear.shells);
    buy(drive, 'blacksmith', ['metalShovel']);
    assert.ok(VL.hasItem(drive.state, 'metalShovel'), 'the metal shovel is forged');
  }
  if (!VL.hasItem(drive.state, 'metalSword')) {
    // The smith's tip: savings buried under the flowers by the hut.
    const secret = VL.BURIED_SECRETS.secretMeadow;
    if (!VL.spotFound(drive.state, secret.id)) {
      drive.walkTo(ow(secret.screen, secret.tx - 1, secret.ty));
      face(drive, 'right');
      drive.press('dig');
      drive.hold([], 0.4);
      drive.closePopups();
      assert.ok(VL.spotFound(drive.state, secret.id), 'the meadow\'s buried shells dug up');
    }
    if (drive.state.inventory.shells < VL.TUNING.prices.metalGear.shells) earnShells(drive, VL.TUNING.prices.metalGear.shells);
    buy(drive, 'blacksmith', ['metalSword']);
    assert.ok(VL.hasItem(drive.state, 'metalSword'), `the metal sword is forged (${JSON.stringify(drive.state.inventory)}, scene ${drive.app.sceneId})`);
  }
  equip(drive, 'metalSword', 'mainHand');
}

module.exports = { metalGear, equip, buy, face, earnShells };
