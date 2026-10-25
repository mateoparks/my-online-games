// The Woods and the Hollow Oak played for real (W15): one function per lock
// on the way, each starting from wherever the hero stands (the statue after
// a faint, or where the last one left him). tests/steps/w15.steps.js strings
// them into the story milestones; tests/hollow-oak.test.js runs them one lock
// at a time, fainting in between.
const assert = require('node:assert/strict');
const { findPath } = require('./playthrough');

const AREA = 'hollowOak';
const at = (screen, tx, ty) => ({ area: AREA, screen, tx, ty });
const d2 = (drive) => drive.VL.dungeonState(drive.state, AREA);
const settled = (state) => !state.transition;

// Turns the hero towards `dir` without stepping.
function face(drive, dir) {
  drive.hold([dir], 2 / 60);
  drive.hold([], 1 / 60);
}

const handHolding = (drive, id) => drive.VL.HANDS.find((hand) => drive.VL.heldItem(drive.state, hand) === id);

// Faces `dir`, throws the hook and waits for it to come back or pull him over.
function rope(drive, dir) {
  face(drive, dir);
  const hand = handHolding(drive, 'grapplingRope');
  assert.ok(hand, 'the rope is in a hand');
  drive.press(hand);
  assert.ok(drive.state.player.rope, `the hook is out (${dir})`);
  drive.until((state) => !state.player.rope, 3);
}

// Every crossing the rope makes in the Hollow Oak: stand on `from`, face
// `dir`, and the post pulls the hero to `to`.
const CROSSINGS = [
  { from: at('1,-2', 7, 5), dir: 'down', to: at('1,-2', 7, 8) },
  { from: at('1,-2', 4, 8), dir: 'up', to: at('1,-2', 4, 5) },
  { from: at('1,-1', 3, 8), dir: 'right', to: at('1,-1', 6, 8) },
  { from: at('1,-1', 6, 2), dir: 'left', to: at('1,-1', 2, 2) },
  { from: at('1,0', 12, 1), dir: 'left', to: at('1,0', 9, 1) },
  { from: at('1,0', 10, 8), dir: 'right', to: at('1,0', 13, 8) },
];

const key = (place) => `${place.area} ${place.screen} ${place.tx},${place.ty}`;
const here = (drive) => ({ area: drive.state.player.area, screen: drive.state.player.screen, ...drive.VL.heroTile(drive.state) });

// Walks to `target`, crossing pits with the rope where the way needs it
// (the pathfinder sees pits and posts as walls): the fewest crossings.
function go(drive, target) {
  const { VL } = drive;
  const path = (from, to) => findPath(VL, from, to, drive.state);
  const start = here(drive);
  const plans = [{ at: start, via: [] }];
  const seen = new Set([key(start)]);
  for (let i = 0; i < plans.length; i += 1) {
    const plan = plans[i];
    if (path(plan.at, target)) {
      for (const crossing of plan.via) {
        drive.walkTo(crossing.from);
        rope(drive, crossing.dir);
        assert.equal(key(here(drive)), key(crossing.to), `the rope crossed from ${key(crossing.from)}`);
      }
      drive.walkTo(target);
      return;
    }
    for (const crossing of CROSSINGS) {
      if (seen.has(key(crossing.to)) || !VL.hasItem(drive.state, 'grapplingRope') || !path(plan.at, crossing.from)) continue;
      seen.add(key(crossing.to));
      plans.push({ at: crossing.to, via: [...plan.via, crossing] });
    }
  }
  throw new Error(`no way from ${key(start)} to ${key(target)}, even with the rope`);
}

// Walks onto a pickup from the tile before it (a pickup's popup stops walkTo).
function pickUp(drive, before, dir, done) {
  go(drive, before);
  drive.until(done, 2, [dir]);
  drive.closePopups();
}

// Picks the rope from the equipment screen into the off hand (D), with
// real keys, where the shield was.
function equipRope(drive) {
  const { VL } = drive;
  if (VL.heldItem(drive.state, 'offHand') === 'grapplingRope') return;
  drive.press('equipment');
  const index = VL.equipmentItems(drive.state).findIndex((item) => item.id === 'grapplingRope');
  while (drive.app.equipment.cursor % 4 < index % 4) drive.press('right');
  while (drive.app.equipment.cursor < index) drive.press('down');
  drive.press('offHand');
  drive.press('equipment');
  assert.equal(VL.heldItem(drive.state, 'offHand'), 'grapplingRope');
}

// Lifts the two canyon boulders in the way, if they are still there.
function clearCanyon(drive) {
  const { VL } = drive;
  for (const tx of [5, 6]) {
    if (VL.savedTile(drive.state, 'overworld', '4,0', tx, 5) !== null) continue;
    drive.walkTo({ area: 'overworld', screen: '4,0', tx: tx - 1, ty: 5 });
    face(drive, 'right');
    drive.press('interact');
    assert.ok(drive.state.player.lifted, `lifted the boulder at (${tx},5)`);
    drive.hold([], 0.2);
    face(drive, 'down');
    drive.press('interact');
    drive.until((state) => !state.room.entities.some((e) => e.type === 'liftThrown'), 2);
  }
}

const route = {
  hollowOakEntered(drive) {
    drive.closePopups();
    clearCanyon(drive);
    drive.walkTo({ area: 'overworld', screen: '5,0', tx: 6, ty: 1 });
    // The first step into the Woods with the map says how it helps.
    drive.until((state) => state.player.screen === '5,-1' && settled(state), 2, ['up']);
    drive.closePopups();
    drive.walkTo({ area: 'overworld', screen: '7,-2', tx: 7, ty: 4 });
    drive.until((state) => state.player.area === AREA && settled(state), 2, ['up']);
    drive.walkTo(at('0,0', 3, 3));
    drive.until((state) => state.savePoint?.area === AREA, 1, ['up']);
  },
  // The map first, from its nook on the way through the tangle.
  d2KeyA(drive) {
    if (!d2(drive).map) pickUp(drive, at('-1,-1', 1, 4), 'up', () => d2(drive).map);
    pickUp(drive, at('-1,-2', 3, 3), 'right', (state) => drive.VL.spotFound(state, 'd2KeyA'));
  },
  d2DoorA(drive) {
    go(drive, at('0,-2', 14, 5));
    drive.until(() => d2(drive).doors.d2DoorA, 1, ['right']);
  },
  grapplingRope(drive) {
    go(drive, at('1,-2', 7, 4));
    face(drive, 'up');
    drive.press('interact');
    drive.reload();
    assert.ok(drive.VL.hasItem(drive.state, 'grapplingRope'), 'the rope survives a reload before its popup closes');
    drive.closePopups();
    equipRope(drive);
  },
  d2KeyB(drive) {
    equipRope(drive);
    go(drive, at('1,-1', 9, 2));
    rope(drive, 'down');
    assert.ok(drive.VL.spotFound(drive.state, 'd2KeyB'), 'the hook dragged key B off its island');
    drive.closePopups();
  },
  d2DoorB(drive) {
    equipRope(drive);
    go(drive, at('1,-1', 12, 9));
    drive.until(() => d2(drive).doors.d2DoorB, 1, ['down']);
  },
  // The switch first (the bars into the entrance lift: a way back), then
  // the key, both on the island in the sap.
  d2BossKey(drive) {
    equipRope(drive);
    if (!d2(drive).switches.d2SwitchSap) {
      go(drive, at('1,0', 1, 5));
      rope(drive, 'right');
      assert.equal(d2(drive).switches.d2SwitchSap, true, 'the hook threw the switch on the island');
    }
    go(drive, at('1,0', 6, 2));
    rope(drive, 'down');
    assert.ok(drive.VL.spotFound(drive.state, 'd2BossKey'), 'the hook dragged the boss key off its island');
    drive.closePopups();
  },
  d2BossDoor(drive) {
    go(drive, at('0,-2', 7, 1));
    drive.until(() => d2(drive).doors.d2BossDoor, 1, ['up']);
  },
  d2Boss(drive) {
    equipRope(drive);
    fightThornback(drive);
    drive.reload();
    assert.ok(drive.VL.bossBeaten(drive.state, AREA), 'the win survives a reload');
    drive.closePopups();
    // The heart container waits where the beetle began, (7,4); the warp
    // out is at (7,8), so come up the side and across.
    go(drive, at('0,-3', 5, 4));
    const maxHp = drive.state.maxHp;
    drive.until((state) => state.maxHp > maxHp, 1, ['right']);
    drive.closePopups();
  },
};

// The Thornback, fought with real keys: wait in the middle of the den for
// it to come into line, hook it (a plate flies off and it flips), then walk
// up beside it and swing until it rights itself; again until it is beaten,
// which takes a round per plate.
function fightThornback(drive) {
  const { VL } = drive;
  go(drive, at('0,-2', 7, 1));
  // Fights are on from the doorway: the drive clears enemies otherwise.
  drive.fight = true;
  drive.until((state) => state.player.screen === '0,-3' && settled(state) && VL.heroTile(state).ty <= 8, 3, ['up']);
  const beetle = () => drive.state.room.entities.find((e) => e.type === 'thornback');
  const sword = () => handHolding(drive, 'woodSword') || handHolding(drive, 'metalSword');
  const tryWalk = (target) => {
    try {
      drive.walkTo(target);
      return true;
    } catch (error) {
      // Knocked off the path: try again from where he is.
      if (!/not reached|no path/.test(error.message)) throw error;
      return false;
    }
  };
  const roundsFlipped = new Set();
  for (let round = 0; round < 200 && !VL.bossBeaten(drive.state, AREA); round += 1) {
    assert.ok(drive.state.hp > 0, 'the hero outlasts the Thornback');
    const b = beetle();
    if (!b) {
      drive.hold([], 0.2);
      continue;
    }
    if (b.mode === 'flipped') {
      roundsFlipped.add(b.rounds);
      const bt = VL.tileOf(b.cx, b.cy);
      const spots = [[0, 1, 'up'], [0, -1, 'down'], [-1, 0, 'right'], [1, 0, 'left']]
        .map(([dx, dy, dir]) => ({ tx: bt.tx + dx, ty: bt.ty + dy, dir }))
        .filter(({ tx, ty }) => tx >= 1 && ty >= 2 && tx <= 14 && ty <= 9);
      const hero = VL.heroTile(drive.state);
      spots.sort((a, c) => Math.abs(a.tx - hero.tx) + Math.abs(a.ty - hero.ty) - Math.abs(c.tx - hero.tx) - Math.abs(c.ty - hero.ty));
      const spot = spots[0];
      if (!(hero.tx === spot.tx && hero.ty === spot.ty) && !tryWalk(at('0,-3', spot.tx, spot.ty))) continue;
      face(drive, spot.dir);
      for (let i = 0; i < 6 && beetle()?.mode === 'flipped'; i += 1) {
        drive.press(sword());
        drive.hold([], 0.32);
      }
      continue;
    }
    if (['dying', 'righting'].includes(b.mode)) {
      drive.hold([], 0.2);
      continue;
    }
    // In line, close enough: hook it.
    const { x, y } = drive.state.player;
    const dx = b.cx - x;
    const dy = b.cy - (y - 6);
    const reach = VL.TUNING.ropeTiles * VL.TUNING.tile;
    let dir = null;
    if (Math.abs(dy) < 7 && Math.abs(dx) < reach) dir = dx < 0 ? 'left' : 'right';
    else if (Math.abs(dx) < 9 && Math.abs(dy) < reach) dir = dy < 0 ? 'up' : 'down';
    if (dir) {
      rope(drive, dir);
      continue;
    }
    drive.hold([], 1 / 30);
  }
  if (!VL.bossBeaten(drive.state, AREA)) drive.until((state) => VL.bossBeaten(state, AREA), 3);
  assert.deepEqual([...roundsFlipped].sort(), [1, 2, 3], 'beaten in three flip-and-strike rounds');
  drive.fight = false;
}

const ROUTE = Object.keys(route);

module.exports = { route, ROUTE, go, rope, face, at, equipRope, clearCanyon, CROSSINGS };
