// Playthrough steps for the raft (W17), from waking after the shockwave with
// Gran's wood: bushes for wood (bare hands, then a wood sword), an oar from
// the smith, Nell's raft; across the lake to the island's ore and the Smith's
// Ledger; out to the wreck for the Tide Tables, then below deck over the
// bilge on the rope for the ore and the key, and the page in the cabin.
const assert = require('node:assert/strict');
const { findPath } = require('../playthrough');
const { rope, face, equipRope } = require('../hollow-oak-route');
const { talkThrough } = require('./w16.steps');

const ow = (screen, tx, ty) => ({ area: 'overworld', screen, tx, ty });
const wreck = (screen, tx, ty) => ({ area: 'wreck', screen, tx, ty });
const here = (drive) => ({ area: drive.state.player.area, screen: drive.state.player.screen, ...drive.VL.heroTile(drive.state) });

// Walks there, reading any popup on the way (a broken shell's) and waking
// from a faint, as a player would.
function walk(drive, target) {
  for (let tries = 0; tries < 8; tries += 1) {
    try {
      drive.walkTo(target);
      return;
    } catch (error) {
      if (!/not reached/.test(error.message)) throw error;
      if (drive.app.sceneId === 'fainted') {
        drive.hold([], 0.8);
        drive.press('interact');
      }
      drive.closePopups();
    }
  }
  drive.walkTo(target);
}

const BUSH_SCREENS = ['1,1', '1,0'];

// Cuts (or, with no sword, pulls) the home bushes until he carries `wood`,
// leaving each screen so its bushes grow back. Returns the presses made.
function gatherWood(drive, wood) {
  const { VL } = drive;
  let presses = 0;
  for (let round = 0; round < 30 && drive.state.inventory.wood < wood; round += 1) {
    const screen = BUSH_SCREENS[round % BUSH_SCREENS.length];
    VL.getScreen('overworld', screen).tiles.forEach((row, ty) => [...row].forEach((ch, tx) => {
      const info = VL.tileInfo('overworld', ch);
      if (drive.state.inventory.wood >= wood || !info.cuttable || info.berry || ty + 1 >= VL.TUNING.rows) return;
      const below = ow(screen, tx, ty + 1);
      if (!findPath(VL, here(drive), below, drive.state)) return;
      walk(drive, below);
      face(drive, 'up');
      drive.press('mainHand');
      presses += 1;
      drive.hold([], 0.3);
      if (drive.app.sceneId === 'fainted') {
        drive.hold([], 0.8);
        drive.press('interact');
      }
      drive.closePopups();
      const drop = drive.state.room.entities.find((e) => e.type === 'drop');
      if (drop && drive.state.player.screen === screen) walk(drive, { tx: drop.x, ty: drop.y });
      drive.closePopups();
    }));
  }
  assert.ok(drive.state.inventory.wood >= wood, `${wood} wood after ${presses} presses`);
  return presses;
}

// Talks to a keeper across the counter, through to the shop, and buys.
function buyAt(drive, building, id) {
  const { VL } = drive;
  walk(drive, { area: building, screen: '0,0', ...VL.BUILDINGS[building].talkAt });
  face(drive, 'up');
  drive.press('interact');
  talkThrough(drive);
  shopBuy(drive, id);
}

function shopBuy(drive, id) {
  const { VL } = drive;
  assert.equal(drive.app.sceneId, 'shop', `a shop opened for ${id}`);
  const view = drive.app.shopView;
  const index = VL.shopRows(drive.state, view).findIndex((row) => row !== 'leave' && row.id === id);
  assert.ok(index >= 0, `the shop offers ${id}`);
  while (view.cursor !== index) drive.press(view.cursor < index ? 'down' : 'up');
  drive.press('interact');
  drive.press('interact');
  drive.press('pause');
  drive.closePopups();
}

// Walks up to Nell on the harbour, wherever she has strolled, and talks.
function talkToNell(drive) {
  const { VL } = drive;
  for (let tries = 0; tries < 6; tries += 1) {
    walk(drive, ow('2,1', 9, 6));
    const nell = drive.state.room.entities.find((e) => e.type === 'npc' && e.id === 'nell');
    const sides = [[0, 1, 'up'], [-1, 0, 'right'], [1, 0, 'left'], [0, -1, 'down']]
      .map(([dx, dy, dir]) => ({ at: ow('2,1', nell.x + dx, nell.y + dy), dir }))
      .filter(({ at }) => findPath(VL, here(drive), at, drive.state));
    walk(drive, sides[0].at);
    face(drive, sides[0].dir);
    drive.press('interact');
    if (drive.app.sceneId === 'dialogue') return;
  }
  throw new Error('could not reach Nell to talk');
}

function raft(drive) {
  const { VL } = drive;
  const prices = VL.TUNING.prices;
  drive.closePopups();
  if (!VL.hasItem(drive.state, 'woodSword')) {
    gatherWood(drive, prices.woodSword.wood);
    buyAt(drive, 'blacksmith', 'woodSword');
    assert.equal(VL.heldItem(drive.state, 'mainHand'), 'woodSword', 'the new sword is in the main hand');
  }
  gatherWood(drive, prices.raft.wood + prices.oarWood.wood);
  buyAt(drive, 'blacksmith', 'oar');
  assert.ok(VL.hasItem(drive.state, 'oar'), 'Brannock made an oar');
  talkToNell(drive);
  talkThrough(drive);
  shopBuy(drive, 'raft');
  assert.ok(VL.hasItem(drive.state, 'raft'), 'Nell lashed a raft');
  drive.reload();
  assert.ok(VL.canRaft(drive.state), 'the raft and the oar survive a reload');
  drive.closePopups();
}

// Sails from the lake's west shore to the island, takes the ore and opens
// the Smith's Ledger's trunk.
function lakeIsland(drive) {
  const { VL } = drive;
  walk(drive, ow('2,-3', 8, 5));
  walk(drive, ow('3,-3', 6, 4));
  drive.until((state) => VL.spotFound(state, 'oreLakeIsland'), 1, ['right']);
  drive.reload();
  assert.ok(VL.spotFound(drive.state, 'oreLakeIsland'), 'the island\'s ore survives a reload');
  drive.closePopups();
  walk(drive, ow('3,-3', 10, 4));
  face(drive, 'up');
  drive.press('interact');
  drive.closePopups();
  assert.ok(VL.spotFound(drive.state, 'bookSmithsLedger'), 'the Smith\'s Ledger was in the island\'s trunk');
}

// Out past the tide pools to the wreck: the Tide Tables on deck, then below.
function shipwreck(drive) {
  const { VL } = drive;
  walk(drive, ow('5,2', 9, 6));
  face(drive, 'right');
  drive.press('interact');
  drive.closePopups();
  assert.ok(VL.spotFound(drive.state, 'bookTideTables'), 'the Tide Tables were in the deck\'s trunk');
  walk(drive, wreck('0,0', 7, 2));
  belowDeck(drive);
}

// The hold, over the bilge on the rope for the key and the ore, back, and
// through the locked door to the page.
function belowDeck(drive) {
  const { VL } = drive;
  equipRope(drive);
  walk(drive, wreck('0,1', 11, 3));
  rope(drive, 'down');
  assert.deepEqual([drive.state.player.screen, VL.heroTile(drive.state).tx, VL.heroTile(drive.state).ty], ['0,1', 11, 7], 'the post pulled him over the bilge');
  walk(drive, wreck('0,1', 12, 9));
  drive.until((state) => VL.spotFound(state, 'oreShipwreck'), 1, ['right']);
  drive.closePopups();
  walk(drive, wreck('0,1', 4, 9));
  face(drive, 'left');
  drive.press('interact');
  drive.closePopups();
  assert.equal(VL.smallKeys(drive.state, 'wreck'), 1, 'the chest held the wreck\'s key');
  walk(drive, wreck('0,1', 4, 7));
  rope(drive, 'up');
  assert.deepEqual([VL.heroTile(drive.state).tx, VL.heroTile(drive.state).ty], [4, 3], 'and the other post pulled him back');
  walk(drive, wreck('0,0', 14, 5));
  drive.until((state) => state.dungeons.wreck?.doors.wreckDoor, 1, ['right']);
  walk(drive, wreck('1,0', 10, 3));
  drive.until((state) => VL.spotFound(state, 'pageShipwreck'), 1, ['right']);
  drive.closePopups();
  drive.reload();
  assert.ok(VL.spotFound(drive.state, 'pageShipwreck') && VL.spotFound(drive.state, 'oreShipwreck'), 'the page and the ore survive a reload');
  assert.deepEqual([drive.state.player.area, drive.state.player.screen], ['wreck', '0,0'], 'he wakes by the hold\'s lantern');
  drive.closePopups();
}

module.exports = (step) => {
  step('raft', raft);
  step('lakeIsland', lakeIsland);
  step('shipwreck', shipwreck);
};
Object.assign(module.exports, { walk, gatherWood, buyAt, shopBuy, talkToNell, raft, lakeIsland, shipwreck, belowDeck, ow, wreck });
