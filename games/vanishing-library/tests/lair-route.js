// The Dragon's Lair played for real (W19): one function per lock on the
// way, each starting from wherever the hero stands (the statue after a
// faint, the last save point outside after a reload, or where the last one
// left him). tests/steps/w19.steps.js strings them into the story
// milestones; tests/lair.test.js runs them one lock at a time, fainting in
// between.
const assert = require('node:assert/strict');
const { route: climb, walk, flyFrom, ow } = require('./highlands-route');
const { equip, face, earnShells } = require('./metal-gear-route');

const AREA = 'lair';
const at = (screen, tx, ty) => ({ area: AREA, screen, tx, ty });
const d4 = (drive) => drive.VL.dungeonState(drive.state, AREA);
const settled = (state) => !state.transition;
const handHolding = (drive, id) => drive.VL.HANDS.find((hand) => drive.VL.heldItem(drive.state, hand) === id);

// Up from wherever he is to the lair's mouth: the hidden path, both chasms.
function toTheLair(drive) {
  const { state } = drive;
  if (state.player.area === AREA) return;
  const screen = state.player.screen;
  if (state.player.area !== 'overworld' || !['-1,-3', '-2,-3', '-2,-4', '-1,-4', '-1,-5'].includes(screen)) climb.highlands(drive);
  if (['-1,-3', '-2,-3', '-2,-4'].includes(drive.state.player.screen)) {
    if (!drive.VL.hasItem(drive.state, 'mirrorShield')) stockBerries(drive, berriesForTheShield(drive.state) + 2);
    walk(drive, ow('-2,-4', 12, 4));
    flyFrom(drive, ow('-2,-4', 12, 4), 'chickenGap', 'right');
    assert.equal(drive.state.player.screen, '-1,-4', 'over the second chasm');
  }
  // His hands are wanted for the sword and the shield from here on.
  if (drive.state.player.carrying) {
    face(drive, 'down');
    drive.press('interact');
    drive.hold([], 0.6);
  }
}

// Stands on `from` facing `dir` with the Mirror Shield raised until `done`.
function sendFireHome(drive, from, dir, done) {
  const { VL } = drive;
  equipShield(drive);
  walk(drive, from);
  face(drive, dir);
  const hand = handHolding(drive, 'mirrorShield');
  for (let i = 0; i < 12 && !done(drive.state); i += 1) {
    if (drive.app.sceneId === 'fainted') {
      drive.hold([], 0.8);
      drive.press('interact');
      return sendFireHome(drive, from, dir, done);
    }
    const tile = VL.heroTile(drive.state);
    if (tile.tx !== from.tx || tile.ty !== from.ty || drive.state.player.screen !== from.screen) {
      walk(drive, from);
      face(drive, dir);
    }
    drive.hold([hand], 0.5);
  }
  assert.ok(done(drive.state), `the fire went home from ${from.screen} (${from.tx},${from.ty})`);
}

function equipShield(drive) {
  const { VL } = drive;
  if (handHolding(drive, 'mirrorShield')) return;
  equip(drive, 'mirrorShield', 'offHand');
}

function equipSword(drive) {
  const { VL } = drive;
  if (handHolding(drive, 'metalSword')) return;
  equip(drive, VL.hasItem(drive.state, 'metalSword') ? 'metalSword' : 'woodSword', 'mainHand');
}

// Walks onto a pickup from the tile before it (a pickup's popup stops walkTo).
function pickUp(drive, before, dir, done) {
  walk(drive, before);
  drive.until(done, 2, [dir]);
  drive.closePopups();
}

// The shockwave took the metal sword; the Dragon and its guards want one
// (W35). The smith forges it again from an ore lump and shells from berries.
function forgeMetalSword(drive) {
  const { VL } = drive;
  drive.closePopups();
  if (!VL.hasItem(drive.state, 'metalSword')) {
    assert.ok(drive.state.inventory.ore >= 1, `an ore lump for the sword (${drive.state.inventory.ore})`);
    const price = VL.TUNING.prices.metalGear.shells;
    if (drive.state.inventory.shells < price) earnShells(drive, price);
    walk(drive, { area: 'blacksmith', screen: '0,0', ...VL.BUILDINGS.blacksmith.talkAt });
    face(drive, 'up');
    drive.press('interact');
    for (let i = 0; i < 30 && drive.app.sceneId !== 'shop'; i += 1) {
      drive.hold([], 0.15);
      drive.press('interact');
    }
    assert.equal(drive.app.sceneId, 'shop', 'the smith opened his counter');
    const view = drive.app.shopView;
    const index = VL.shopRows(drive.state, view).findIndex((row) => row !== 'leave' && /^metalSword/.test(row.id));
    assert.ok(index >= 0, 'the smith forges a metal sword');
    while (view.cursor !== index) drive.press(view.cursor < index ? 'down' : 'up');
    drive.press('interact');
    drive.press('interact');
    drive.press('pause');
    drive.closePopups();
    assert.ok(VL.hasItem(drive.state, 'metalSword'), `the metal sword is forged again (${JSON.stringify(drive.state.inventory)})`);
  }
  equip(drive, 'metalSword', 'mainHand');
}

// The cave mouth's two thorny guards, beaten with the metal sword from below.
function beatTheGuards(drive) {
  const { VL } = drive;
  if (drive.state.flags.lairGuards) return;
  equip(drive, 'metalSword', 'mainHand');
  // Fights are on from the screen below: the drive clears enemies otherwise.
  if (drive.state.player.screen === '-1,-5') walk(drive, ow('-1,-4', 7, 1));
  walk(drive, ow('-1,-4', 7, 0));
  drive.fight = true;
  for (const [x, y] of VL.LAIR_GUARDS.at) {
    for (let tries = 0; tries < 8; tries += 1) {
      const guard = drive.state.room.entities.find((e) => e.guard && e.x === x && e.y === y && e.hp > 0);
      if (!guard && drive.state.player.screen === '-1,-5') break;
      if (drive.app.sceneId === 'fainted') {
        drive.hold([], 0.8);
        drive.press('interact');
        drive.fight = false;
        return beatTheGuards(drive);
      }
      walk(drive, ow('-1,-5', x, y + 1));
      if (!drive.state.room.entities.some((e) => e.guard && e.x === x && e.y === y && e.hp > 0)) break;
      face(drive, 'up');
      drive.press(handHolding(drive, 'metalSword'));
      drive.hold([], 0.4);
      drive.closePopups();
    }
  }
  drive.hold([], 0.1);
  assert.ok(drive.state.flags.lairGuards, 'the metal sword beat both guards');
  drive.fight = false;
}


// The shield room (W42) is lava but for the square inside door A and the
// chest in the far corner: the route crosses along the top, 16 burns there
// and 15 back, eating a berry whenever the next step could faint him.
const SHIELD_THERE = [[14, 4], [14, 3], [14, 2], [14, 1], ...[13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2].map((x) => [x, 1])];
const SHIELD_BACK = [...[3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((x) => [x, 1]), [14, 2], [14, 3], [14, 4], [14, 5]];
const SHIELD_BURNS = SHIELD_THERE.length + SHIELD_BACK.length - 1;
function berriesForTheShield(state) {
  return Math.max(0, Math.ceil((SHIELD_BURNS + 1 - state.maxHp) / 2));
}

// Picks the first highland shelf's berry bush until he carries `least`,
// stepping off the screen and back for it to grow again.
function stockBerries(drive, least) {
  const { VL } = drive;
  for (let round = 0; round < 20 && drive.state.inventory.berries < least; round += 1) {
    walk(drive, ow('-1,-3', 10, 3));
    face(drive, 'right');
    const before = drive.state.inventory.berries;
    drive.press('interact');
    drive.closePopups();
    if (drive.state.inventory.berries > before || drive.state.inventory.berries < least) {
      walk(drive, ow('-2,-3', 13, 4));
      walk(drive, ow('-1,-3', 1, 4));
    }
  }
  assert.ok(drive.state.inventory.berries >= least, `${least} berries for the shield room (${drive.state.inventory.berries})`);
  VL.tidyHands(drive.state);
}

// Eats from the equipment screen (E, the cursor to the berries, S) up to full.
function eatUp(drive) {
  const { VL } = drive;
  drive.press('equipment');
  const index = VL.equipmentItems(drive.state).findIndex((item) => item.id === 'berry');
  assert.ok(index >= 0, 'berries on the equipment screen');
  while (drive.app.equipment.cursor % 4 < index % 4) drive.press('right');
  while (drive.app.equipment.cursor % 4 > index % 4) drive.press('left');
  while (drive.app.equipment.cursor < index) drive.press('down');
  while (drive.state.hp < drive.state.maxHp - 1 && drive.state.inventory.berries > 0) drive.press('interact');
  drive.press('equipment');
}

function crossLava(drive, path) {
  const { VL } = drive;
  for (const [tx, ty] of path) {
    if (drive.state.hp <= VL.TUNING.lavaDamage) eatUp(drive);
    const here = VL.heroTile(drive.state);
    const dir = tx > here.tx ? 'right' : tx < here.tx ? 'left' : ty > here.ty ? 'down' : 'up';
    const c = VL.tileCenter(tx, ty);
    drive.until((state) => {
      const now = VL.heroTile(state);
      return now.tx === tx && now.ty === ty && Math.abs(state.player.x - c.x) < 2 && Math.abs(state.player.y - c.y) < 2;
    }, 1.5, [dir]);
  }
}

const route = {
  dragonsLairEntered(drive) {
    drive.closePopups();
    toTheLair(drive);
    beatTheGuards(drive);
    walk(drive, ow('-1,-5', 7, 5));
    drive.until((state) => state.player.area === AREA && settled(state), 2, ['up']);
    drive.closePopups();
    walk(drive, at('0,0', 3, 3));
    drive.until((state) => state.savePoint?.area === AREA, 1, ['up']);
  },
  // The cellar's block shoved onto its plate lifts the bars on key A.
  d4KeyA(drive) {
    const { VL } = drive;
    if (!d4(drive).plates.d4PlateCellar) {
      walk(drive, at('-1,0', 9, 6));
      drive.until(() => d4(drive).plates.d4PlateCellar, 1.5, ['down']);
    }
    pickUp(drive, at('-1,0', 1, 3), 'up', (state) => VL.spotFound(state, 'd4KeyA'));
  },
  d4DoorA(drive) {
    walk(drive, at('0,-1', 1, 5));
    drive.until(() => d4(drive).doors.d4DoorA, 1, ['left']);
  },
  mirrorShield(drive) {
    const { VL } = drive;
    walk(drive, at('-1,-1', 14, 5));
    crossLava(drive, SHIELD_THERE);
    face(drive, 'left');
    drive.press('interact');
    assert.ok(VL.hasItem(drive.state, 'mirrorShield'), 'the Mirror Shield from the chest across the lava');
    assert.equal(VL.readSlot(drive.app.storage, drive.app.slot).save.items.mirrorShield, true, 'saved before its popup closes');
    drive.closePopups();
    crossLava(drive, SHIELD_BACK);
    assert.equal(drive.app.sceneId, 'play', 'back across on berries');
    drive.reload();
    assert.ok(VL.hasItem(drive.state, 'mirrorShield'), 'the Mirror Shield survives a reload');
    equipShield(drive);
    equipSword(drive);
  },
  // The hall's stone head, then the ledge's: each choked with its own fire.
  d4KeyB(drive) {
    const { VL } = drive;
    if (!d4(drive).switches.d4SpoutHall) sendFireHome(drive, at('0,-1', 11, 4), 'up', () => d4(drive).switches.d4SpoutHall);
    if (!d4(drive).switches.d4SpoutLedge) sendFireHome(drive, at('-1,-2', 9, 5), 'up', () => d4(drive).switches.d4SpoutLedge);
    if (!d4(drive).map) pickUp(drive, at('-1,-2', 4, 9), 'left', () => d4(drive).map);
    pickUp(drive, at('-1,-2', 1, 3), 'up', (state) => VL.spotFound(state, 'd4KeyB'));
  },
  d4DoorB(drive) {
    walk(drive, at('0,-2', 14, 5));
    drive.until(() => d4(drive).doors.d4DoorB, 1, ['right']);
  },
  // The forge: the block out of the stone head's line, then its fire home.
  d4BossKey(drive) {
    const { VL } = drive;
    if (!d4(drive).switches.d4SpoutForge) {
      const block = () => drive.state.room.entities.find((e) => e.type === 'pushBlock');
      walk(drive, at('1,-2', 4, 5));
      if (block() && block().y === 6 && block().x === 8) {
        walk(drive, at('1,-2', 8, 5));
        drive.until(() => block().y === 7 && !block().sliding, 1.5, ['down']);
      }
      sendFireHome(drive, at('1,-2', 9, 6), 'right', () => d4(drive).switches.d4SpoutForge);
    }
    pickUp(drive, at('1,-2', 10, 7), 'down', (state) => VL.spotFound(state, 'd4BossKey'));
  },
  d4BossDoor(drive) {
    equipSword(drive);
    walk(drive, at('0,-2', 7, 1));
    drive.until(() => d4(drive).doors.d4BossDoor, 1, ['up']);
  },
  d4Boss(drive) {
    const { VL } = drive;
    equipShield(drive);
    equipSword(drive);
    fightDragon(drive);
    drive.reload();
    assert.ok(VL.bossBeaten(drive.state, AREA), 'the win survives a reload');
    drive.closePopups();
    // The heart waits where the Dragon began, (7,2); the warp out opens at
    // (7,8) once it is taken, so come up the side and across.
    walk(drive, at('0,-3', 6, 9));
    walk(drive, at('0,-3', 6, 3));
    const maxHp = drive.state.maxHp;
    walk(drive, at('0,-3', 7, 3));
    drive.until((state) => state.maxHp > maxHp, 1, ['up']);
    drive.closePopups();
    walk(drive, at('0,-3', 7, 7));
    drive.until((state) => state.player.area === 'overworld' && settled(state), 2, ['down']);
    drive.hold([], 0.2);
    assert.deepEqual(drive.state.savePoint && [drive.state.savePoint.area, drive.state.savePoint.screen], ['overworld', '-1,-5'], 'the warp saved him on the doorstep');
  },
};

// The Dragon, fought with real keys: below it, in line, the Mirror Shield
// up towards it until its fire comes home; then up under it and the sword
// while it is dazed; back down when it wakes. Three rounds.
function fightDragon(drive) {
  const { VL } = drive;
  walk(drive, at('0,-2', 7, 1));
  drive.fight = true;
  drive.until((state) => state.player.screen === '0,-3' && settled(state) && VL.heroTile(state).ty <= 8, 3, ['up']);
  const dragon = () => drive.state.room.entities.find((e) => e.type === 'dragon');
  const sword = () => handHolding(drive, 'woodSword') || handHolding(drive, 'metalSword');
  const shield = () => handHolding(drive, 'mirrorShield');
  const dazes = new Set();
  for (let i = 0; i < 800 && !VL.bossBeaten(drive.state, AREA); i += 1) {
    if (drive.app.sceneId === 'fainted') throw new Error('the Dragon made him faint');
    assert.equal(drive.app.sceneId, 'play', `still fighting (scene ${drive.app.sceneId})`);
    const d = dragon();
    if (!d || ['dying', 'recover'].includes(d.mode)) {
      drive.hold([], 0.1);
      continue;
    }
    const hero = drive.state.player;
    // Fire on the way (W35: the second of a pair may still be coming when the
    // first has dazed it): stand and block it; the purple balls of the fan fly
    // wide of a hero who stays put.
    if (drive.state.room.entities.some((e) => e.type === 'dragonFire' && !e.bounced)) {
      if (hero.facing !== 'up') face(drive, 'up');
      drive.hold([shield()], 1 / 15);
      continue;
    }
    if (d.mode === 'dazed') {
      dazes.add(d.rounds);
      const target = VL.tileOf(d.cx, d.cy + 30);
      const here = VL.heroTile(drive.state);
      if (here.tx !== target.tx || here.ty !== target.ty) {
        try {
          drive.walkTo(at('0,-3', target.tx, target.ty));
        } catch (error) {
          if (!/not reached|no path/.test(error.message)) throw error;
        }
        continue;
      }
      face(drive, 'up');
      drive.press(sword());
      drive.hold([], 0.3);
      continue;
    }
    // Row 6 (clear of the warp's tile, row 8), in line with it, shield up.
    const row = VL.heroTile(drive.state).ty;
    if (row !== 6) {
      drive.hold([row < 6 ? 'down' : 'up'], 1 / 30);
      continue;
    }
    const dx = d.cx - hero.x;
    if (Math.abs(dx) > 10 && ['prowl', 'perch'].includes(d.mode)) {
      drive.hold([dx < 0 ? 'left' : 'right'], 1 / 30);
      continue;
    }
    if (hero.facing !== 'up') face(drive, 'up');
    drive.hold([shield()], 1 / 15);
  }
  if (!VL.bossBeaten(drive.state, AREA)) drive.until((state) => VL.bossBeaten(state, AREA), 3);
  assert.deepEqual([...dazes].sort(), [1, 2, 3], 'beaten in three bounce-and-strike rounds');
  drive.fight = false;
}

const ROUTE = Object.keys(route);

module.exports = { route, ROUTE, at, stockBerries, crossLava, toTheLair, sendFireHome, fightDragon, equipShield, equipSword, forgeMetalSword, beatTheGuards };
