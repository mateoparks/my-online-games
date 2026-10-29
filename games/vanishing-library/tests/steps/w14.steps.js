// Playthrough steps for the milestones W14 implements: into the Old
// Scriptorium with the librarian's key, through it to the Lifting Gloves,
// then on to the Bookworm (tests/scriptorium-route.js has each lock's play).
// Also W12's woodsMapCopy, since its mural hangs in the Scriptorium: berries
// picked, three sold for shells, paper bought, five ground into ink (W41) and
// the mural copied, all with real keys.
const { route, at } = require('../scriptorium-route');

const run = (...ids) => (drive) => {
  for (const id of ids) route[id](drive);
};

// The berry bush nearest the hut, and an open tile beside it.
function berryBush(VL) {
  const [sx, sy] = VL.START.screen.split(',').map(Number);
  const bushes = [];
  for (const [key, screen] of Object.entries(VL.AREAS.overworld.screens)) {
    screen.tiles.forEach((row, ty) => [...row].forEach((ch, tx) => {
      if (!VL.tileInfo('overworld', ch).berry) return;
      const [x, y] = key.split(',').map(Number);
      for (const [dx, dy, facing] of [[0, 1, 'up'], [-1, 0, 'right'], [1, 0, 'left'], [0, -1, 'down']]) {
        if (!VL.isSolidAt('overworld', key, tx + dx, ty + dy)) {
          bushes.push({ far: Math.abs(x - sx) + Math.abs(y - sy), stand: { area: 'overworld', screen: key, tx: tx + dx, ty: ty + dy }, facing });
          return;
        }
      }
    }));
  }
  return bushes.sort((a, b) => a.far - b.far)[0];
}

function pickBerries(drive, bush) {
  drive.walkTo(bush.stand);
  drive.hold([bush.facing], 2 / 60);
  const before = drive.state.inventory.berries;
  drive.press('interact');
  drive.closePopups();
  if (drive.state.inventory.berries <= before) throw new Error('woodsMapCopy: no berries picked');
}

// Talks to the keeper across the counter and buys each offer in turn.
function buy(drive, building, ids) {
  const { VL } = drive;
  drive.walkTo({ area: building, screen: '0,0', ...VL.BUILDINGS[building].talkAt });
  drive.hold(['up'], 2 / 60);
  drive.press('interact');
  for (let i = 0; i < 20 && drive.app.sceneId !== 'shop'; i += 1) {
    drive.hold([], 0.4);
    drive.press('interact');
  }
  if (drive.app.sceneId !== 'shop') throw new Error(`woodsMapCopy: the ${building} shop did not open (${drive.app.sceneId})`);
  for (const id of ids) {
    const view = drive.app.shopView;
    const rows = VL.shopRows(drive.state, view);
    const index = rows.findIndex((row) => row !== 'leave' && row.id === id);
    while (view.cursor !== index) drive.press(view.cursor < index ? 'down' : 'up');
    drive.press('interact');
    drive.press('interact');
  }
  drive.press('pause');
}

function grindInk(drive) {
  const { VL } = drive;
  drive.press('equipment');
  const index = VL.equipmentItems(drive.state).findIndex((item) => item.id === 'mortarPestle');
  while (drive.app.equipment.cursor < index) drive.press('right');
  const ink = drive.state.inventory.ink;
  drive.press('interact');
  drive.hold([], 0.6);
  drive.press('equipment');
  if (drive.state.inventory.ink <= ink) throw new Error('woodsMapCopy: no ink ground');
}

module.exports = (step) => {
  step('scriptoriumEntered', run('scriptoriumEntered'));
  step('liftingGloves', run('woodsMural', 'd1KeyA', 'd1DoorA', 'liftingGloves'));
  step('d1Boss', run('d1KeyB', 'oreScriptorium', 'd1DoorB', 'd1BossKey', 'd1BossDoor', 'd1Boss'));
  step('woodsMapCopy', (drive) => {
    const { VL } = drive;
    drive.closePopups();
    const bush = berryBush(VL);
    const want = 3 + VL.TUNING.berriesPerInk;
    for (let pick = 0; drive.state.inventory.berries < want; pick += 1) {
      if (pick > 6) throw new Error('woodsMapCopy: the bush never gave enough berries');
      // Berries regrow once the hero has been away.
      if (pick) drive.walkTo({ area: 'hut', screen: '0,0', tx: 7, ty: 8 });
      pickBerries(drive, bush);
    }
    // W36: the store's paper costs 3 shells.
    buy(drive, 'shop', ['sellBerry', 'sellBerry', 'sellBerry', 'paper']);
    if (drive.state.inventory.paper < 1) throw new Error('woodsMapCopy: no paper bought');
    grindInk(drive);
    drive.walkTo(at('0,0', 7, 2));
    drive.hold(['up'], 2 / 60);
    drive.press('interact');
    drive.reload();
    if (!VL.hasItem(drive.state, 'woodsMapCopy')) throw new Error('woodsMapCopy: the copy did not survive a reload');
    drive.closePopups();
  });
};
