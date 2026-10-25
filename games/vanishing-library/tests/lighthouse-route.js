// The Lighthouse played for real (W18): one function per lock on the way,
// each starting from wherever the hero stands (the statue after a faint, or
// where the last one left him). tests/steps/w18.steps.js strings them into
// the story milestones; tests/lighthouse.test.js runs them one lock at a
// time, fainting in between.
const assert = require('node:assert/strict');
const { findPath } = require('./playthrough');

const AREA = 'lighthouse';
const at = (screen, tx, ty) => ({ area: AREA, screen, tx, ty });
const d3 = (drive) => drive.VL.dungeonState(drive.state, AREA);
const settled = (state) => !state.transition;

// Turns the hero towards `dir` without stepping.
function face(drive, dir) {
  drive.hold([dir], 2 / 60);
  drive.hold([], 1 / 60);
}

const handHolding = (drive, id) => drive.VL.HANDS.find((hand) => drive.VL.heldItem(drive.state, hand) === id);

// A broken shell or a heap note on the way may stop a walk with its popup:
// read it and go on.
function walk(drive, target) {
  for (let tries = 0; tries < 6; tries += 1) {
    try {
      drive.walkTo(target);
      return;
    } catch (error) {
      if (!/not reached/.test(error.message)) throw error;
      drive.closePopups();
    }
  }
  drive.walkTo(target);
}

// Walks onto a pickup from the tile before it (a pickup's popup stops walkTo).
function pickUp(drive, before, dir, done) {
  walk(drive, before);
  drive.until(done, 2, [dir]);
  drive.closePopups();
}

// Puts the slingshot in the off hand (D) from the equipment screen, with real keys.
function equipSlingshot(drive) {
  const { VL } = drive;
  if (VL.heldItem(drive.state, 'offHand') === 'slingshot') return;
  drive.press('equipment');
  const index = VL.equipmentItems(drive.state).findIndex((item) => item.id === 'slingshot');
  while (drive.app.equipment.cursor % 4 < index % 4) drive.press('right');
  while (drive.app.equipment.cursor % 4 > index % 4) drive.press('left');
  while (drive.app.equipment.cursor < index) drive.press('down');
  drive.press('offHand');
  drive.press('equipment');
  assert.equal(VL.heldItem(drive.state, 'offHand'), 'slingshot');
}

// Fires one shell the way `dir` faces and waits for it to land.
function shoot(drive, dir) {
  face(drive, dir);
  const hand = handHolding(drive, 'slingshot');
  assert.ok(hand, 'the slingshot is in a hand');
  const shells = drive.state.inventory.brokenShells;
  drive.hold([], drive.VL.TUNING.slingshotCooldown);
  drive.press(hand);
  assert.equal(drive.state.inventory.brokenShells, shells - 1, `a shell fired (${dir})`);
  drive.until((state) => !state.room.entities.some((e) => e.type === 'slingPellet'), 2);
}

// Tops up from a heap: stand on `from`, face `dir`, S.
function scoop(drive, from, dir) {
  walk(drive, from);
  face(drive, dir);
  drive.press('interact');
  assert.ok(drive.state.inventory.brokenShells >= drive.VL.TUNING.shellHeapFill, 'the heap filled his pockets');
}

// The shockwave took the sword: bare-hand pulls on the home bushes until
// there is wood for one, then the smith makes it (W16's climb, scripted).
function ensureSword(drive) {
  const { VL } = drive;
  if (VL.hasItem(drive.state, 'woodSword') || VL.hasItem(drive.state, 'metalSword')) return;
  const price = VL.TUNING.prices.woodSword.wood;
  const bushesOn = (screen) => {
    const spots = [];
    VL.getScreen('overworld', screen).tiles.forEach((row, ty) => [...row].forEach((ch, tx) => {
      const info = VL.tileInfo('overworld', ch);
      if (info.cuttable && !info.berry && ty + 1 < VL.TUNING.rows) spots.push({ tx, ty });
    }));
    return spots;
  };
  const fight = drive.fight;
  drive.fight = true;
  for (let round = 0; round < 12 && drive.state.inventory.wood < price; round += 1) {
    for (const screen of ['1,1', '1,0']) {
      for (const { tx, ty } of bushesOn(screen)) {
        if (drive.state.inventory.wood >= price) break;
        const below = { area: 'overworld', screen, tx, ty: ty + 1 };
        if (!findPath(VL, { area: drive.state.player.area, screen: drive.state.player.screen, ...VL.heroTile(drive.state) }, below, drive.state)) continue;
        walk(drive, below);
        face(drive, 'up');
        drive.press('mainHand');
        if (drive.app.sceneId === 'fainted') {
          drive.hold([], 0.8);
          drive.press('interact');
        }
        drive.closePopups();
        drive.hold([], 0.1);
        const drop = drive.state.room.entities.find((e) => e.type === 'drop' && e.kind !== 'heart');
        if (drop) {
          walk(drive, { tx: drop.x, ty: drop.y });
          drive.closePopups();
        }
      }
      if (drive.state.inventory.wood >= price) break;
      // Bushes grow back once he has left the screen.
      walk(drive, { area: 'overworld', screen: '2,1', tx: 3, ty: 5 });
    }
  }
  assert.ok(drive.state.inventory.wood >= price, 'wood enough for a sword');
  walk(drive, { area: 'blacksmith', screen: '0,0', ...VL.BUILDINGS.blacksmith.talkAt });
  face(drive, 'up');
  drive.press('interact');
  for (let i = 0; i < 30 && drive.app.sceneId !== 'shop'; i += 1) {
    drive.hold([], 0.15);
    drive.press('interact');
  }
  assert.equal(drive.app.sceneId, 'shop', 'the smith opened his counter');
  const view = drive.app.shopView;
  const index = VL.shopRows(drive.state, view).findIndex((row) => row !== 'leave' && row.id === 'woodSword');
  while (view.cursor !== index) drive.press(view.cursor < index ? 'down' : 'up');
  drive.press('interact');
  drive.press('interact');
  drive.press('pause');
  drive.closePopups();
  drive.fight = fight;
  assert.ok(VL.hasItem(drive.state, 'woodSword'), 'a wood sword from the smith');
  if (VL.heldItem(drive.state, 'mainHand') !== 'woodSword') {
    drive.press('equipment');
    const at = VL.equipmentItems(drive.state).findIndex((item) => item.id === 'woodSword');
    while (drive.app.equipment.cursor % 4 < at % 4) drive.press('right');
    while (drive.app.equipment.cursor < at) drive.press('down');
    drive.press('mainHand');
    drive.press('equipment');
  }
}

const route = {
  lighthouseEntered(drive) {
    drive.closePopups();
    ensureSword(drive);
    walk(drive, { area: 'overworld', screen: '-1,1', tx: 7, ty: 5 });
    drive.until((state) => state.player.area === AREA && settled(state), 2, ['up']);
    drive.closePopups();
    walk(drive, at('0,0', 3, 3));
    drive.until((state) => state.savePoint?.area === AREA, 1, ['up']);
  },
  // Along the cellar's dark floor to key A.
  d3KeyA(drive) {
    pickUp(drive, at('-1,0', 2, 3), 'up', (state) => drive.VL.spotFound(state, 'd3KeyA'));
  },
  d3DoorA(drive) {
    walk(drive, at('0,-1', 14, 5));
    drive.until(() => d3(drive).doors.d3DoorA, 1, ['right']);
  },
  slingshot(drive) {
    walk(drive, at('1,-1', 5, 3));
    face(drive, 'up');
    drive.press('interact');
    drive.reload();
    assert.ok(drive.VL.hasItem(drive.state, 'slingshot'), 'the slingshot survives a reload before its popup closes');
    drive.closePopups();
    equipSlingshot(drive);
  },
  // The store's target lifts the bars into the cistern; there the floor
  // mirror is turned by hand and the island one by a shot, and the beam
  // lights the crystal that lifts the bars on key B.
  d3KeyB(drive) {
    const { VL } = drive;
    equipSlingshot(drive);
    if (drive.state.inventory.brokenShells < 3) scoop(drive, at('1,-1', 2, 7), 'down');
    if (!d3(drive).switches.d3TargetStore) {
      walk(drive, at('1,-1', 12, 4));
      shoot(drive, 'up');
      assert.ok(d3(drive).switches.d3TargetStore, 'the shot hit the store\'s target');
    }
    if (!d3(drive).switches.d3CrystalCistern) {
      walk(drive, at('1,0', 9, 2));
      face(drive, 'right');
      drive.press('interact');
      walk(drive, at('1,0', 10, 3));
      shoot(drive, 'down');
      drive.until(() => d3(drive).switches.d3CrystalCistern, 1);
      assert.ok(VL.roomLit(drive.state.room), 'the crystal lit the cistern');
    }
    pickUp(drive, at('1,0', 14, 8), 'down', (state) => VL.spotFound(state, 'd3KeyB'));
  },
  d3DoorB(drive) {
    equipSlingshot(drive);
    if (!d3(drive).switches.d3TargetStair) {
      if (drive.state.inventory.brokenShells < 1) scoop(drive, at('0,0', 12, 7), 'down');
      walk(drive, at('0,-1', 2, 4));
      shoot(drive, 'up');
      assert.ok(d3(drive).switches.d3TargetStair, 'the shot hit the stairwell\'s target');
    }
    walk(drive, at('0,-2', 14, 5));
    drive.until(() => d3(drive).doors.d3DoorB, 1, ['right']);
  },
  // The map from the dark stair, then the workshop's three mirrors.
  d3BossKey(drive) {
    const { VL } = drive;
    equipSlingshot(drive);
    if (!d3(drive).map) pickUp(drive, at('-1,-2', 6, 2), 'right', () => d3(drive).map);
    if (drive.state.inventory.brokenShells < 1) scoop(drive, at('0,-2', 2, 8), 'down');
    if (!d3(drive).switches.d3CrystalWorkshop) {
      walk(drive, at('1,-2', 5, 1));
      face(drive, 'left');
      drive.press('interact');
      walk(drive, at('1,-2', 5, 8));
      face(drive, 'left');
      drive.press('interact');
      walk(drive, at('1,-2', 9, 8));
      shoot(drive, 'right');
      drive.until(() => d3(drive).switches.d3CrystalWorkshop, 1);
    }
    pickUp(drive, at('1,-2', 14, 5), 'up', (state) => VL.spotFound(state, 'd3BossKey'));
  },
  d3BossDoor(drive) {
    walk(drive, at('0,-2', 7, 1));
    drive.until(() => d3(drive).doors.d3BossDoor, 1, ['up']);
  },
  d3Boss(drive) {
    equipSlingshot(drive);
    scoop(drive, at('0,-2', 2, 8), 'down');
    fightLensCrab(drive);
    drive.reload();
    assert.ok(drive.VL.bossBeaten(drive.state, AREA), 'the win survives a reload');
    drive.closePopups();
    // The heart container waits where the crab began, (7,3); the warp out
    // is at (7,8), so come up the side and across.
    walk(drive, at('0,-3', 6, 9));
    walk(drive, at('0,-3', 6, 4));
    walk(drive, at('0,-3', 7, 4));
    const maxHp = drive.state.maxHp;
    drive.until((state) => state.maxHp > maxHp, 1, ['up']);
    drive.closePopups();
  },
};

// The Lens Crab, fought with real keys: stand below it, in line, and shoot
// up at its face until both eyes are shut; then walk up and swing while it
// is dazed; back down when it wakes. Three rounds.
function fightLensCrab(drive) {
  const { VL } = drive;
  walk(drive, at('0,-2', 7, 1));
  // Fights are on from the doorway: the drive clears enemies otherwise.
  drive.fight = true;
  drive.until((state) => state.player.screen === '0,-3' && settled(state) && VL.heroTile(state).ty <= 8, 3, ['up']);
  const crab = () => drive.state.room.entities.find((e) => e.type === 'lensCrab');
  const sword = () => handHolding(drive, 'woodSword') || handHolding(drive, 'metalSword');
  const dazes = new Set();
  for (let i = 0; i < 400 && !VL.bossBeaten(drive.state, AREA); i += 1) {
    assert.ok(drive.state.hp > 0 && drive.app.sceneId === 'play', `the hero outlasts the Lens Crab (scene ${drive.app.sceneId})`);
    const c = crab();
    if (!c || ['dying', 'recover'].includes(c.mode)) {
      drive.hold([], 0.1);
      continue;
    }
    const hero = drive.state.player;
    if (c.mode === 'dazed') {
      dazes.add(c.rounds);
      // Up under it, then swing.
      const target = VL.tileOf(c.cx, c.cy + 16 + 14);
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
    // Below it on row 6 (clear of where the warp out will open, row 8),
    // in line with its face, and shoot.
    const row = VL.heroTile(drive.state).ty;
    if (row !== 6) {
      drive.hold([row < 6 ? 'down' : 'up'], 1 / 30);
      continue;
    }
    const dx = c.cx - hero.x;
    if (Math.abs(dx) > 8) {
      drive.hold([dx < 0 ? 'left' : 'right'], 1 / 30);
      continue;
    }
    if (drive.state.inventory.brokenShells < 1) {
      scoop(drive, at('0,-3', 2, 8), 'down');
      continue;
    }
    shoot(drive, 'up');
  }
  if (!VL.bossBeaten(drive.state, AREA)) drive.until((state) => VL.bossBeaten(state, AREA), 3);
  assert.deepEqual([...dazes].sort(), [1, 2, 3], 'beaten in three shoot-and-strike rounds');
  drive.fight = false;
}

const ROUTE = Object.keys(route);

module.exports = { route, ROUTE, at, face, shoot, scoop, equipSlingshot, ensureSword, walk };
