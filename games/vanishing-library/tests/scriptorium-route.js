// The Old Scriptorium played for real (W14): one function per lock on the
// way, each starting from wherever the hero stands (the statue after a
// faint, or where the last one left him). tests/steps/w14.steps.js strings
// them into the story milestones; tests/scriptorium.test.js runs them one
// lock at a time, fainting in between.
const assert = require('node:assert/strict');

const AREA = 'scriptorium';
const at = (screen, tx, ty) => ({ area: AREA, screen, tx, ty });
const d1 = (drive) => drive.VL.dungeonState(drive.state, 'scriptorium');
const here = (drive) => drive.state.player;
const settled = (drive) => !drive.state.transition;

// Turns the hero towards `dir` without stepping (the tile there is solid or
// a step's slack is harmless), S lifts what is there, S again throws it.
function face(drive, dir) {
  drive.hold([dir], 2 / 60);
  drive.hold([], 1 / 60);
}

function lift(drive, dir) {
  face(drive, dir);
  drive.press('interact');
  assert.ok(drive.state.player.lifted, `lifted something ${dir} of the hero at ${here(drive).screen} (${drive.VL.heroTile(drive.state).tx},${drive.VL.heroTile(drive.state).ty})`);
  drive.hold([], 0.2);
}

function toss(drive, dir) {
  face(drive, dir);
  drive.press('interact');
  drive.until((state) => !state.room.entities.some((e) => e.type === 'liftThrown'), 2);
}

// The entrance's east corridor and the vault's south corridor hold a rock
// each, back on every visit; the pathfinder sees them as walls.
function eastFromEntrance(drive) {
  drive.walkTo(at('1,0', 11, 5));
  lift(drive, 'right');
  toss(drive, 'right');
  drive.until((state) => state.player.screen === '2,0' && !state.transition, 3, ['right']);
}

function westToEntrance(drive) {
  drive.walkTo(at('2,0', 1, 5));
  drive.until((state) => state.player.screen === '1,0' && !state.transition && drive.VL.heroTile(state).tx === 13, 3, ['left']);
  lift(drive, 'left');
  toss(drive, 'down');
}

const EAST_WING = ['2,0', '3,0'];
const inEastWing = (drive) => here(drive).area === AREA && EAST_WING.includes(here(drive).screen);

// Walks to `target` across the rocks as needed.
function go(drive, target) {
  const east = EAST_WING.includes(target.screen);
  if (east && !inEastWing(drive)) eastFromEntrance(drive);
  if (!east && inEastWing(drive)) westToEntrance(drive);
  drive.walkTo(target);
}

// Walks onto a pickup from the tile before it (a pickup's popup stops walkTo).
function pickUp(drive, before, dir, done) {
  go(drive, before);
  drive.until(done, 2, [dir]);
  drive.closePopups();
}

const route = {
  scriptoriumEntered(drive) {
    drive.closePopups();
    drive.walkTo({ area: 'overworld', screen: '2,-2', tx: 8, ty: 4 });
    drive.until((state) => state.player.area === AREA && settled(drive), 2, ['up']);
    drive.walkTo(at('1,0', 3, 3));
    drive.until((state) => state.savePoint?.area === AREA, 1, ['up']);
  },
  woodsMural(drive) {
    go(drive, at('0,0', 7, 2));
  },
  d1KeyA(drive) {
    go(drive, at('0,0', 10, 8));
    drive.until((state) => state.room.entities.find((e) => e.type === 'pushBlock').x === 12, 1.5, ['right']);
    drive.reload();
    assert.equal(d1(drive).plates.d1PlateGallery, true, 'the latched plate survives a reload');
    pickUp(drive, at('0,0', 4, 6), 'up', (state) => drive.VL.spotFound(state, 'd1KeyA'));
  },
  d1DoorA(drive) {
    if (!d1(drive).map) pickUp(drive, at('1,-1', 3, 9), 'left', () => d1(drive).map);
    go(drive, at('1,-1', 14, 5));
    drive.until(() => d1(drive).doors.d1DoorA, 1, ['right']);
  },
  liftingGloves(drive) {
    go(drive, at('2,-1', 7, 5));
    face(drive, 'up');
    drive.press('interact');
    drive.reload();
    assert.ok(drive.VL.hasItem(drive.state, 'liftingGloves'), 'the gloves survive a reload before their popup closes');
    drive.closePopups();
  },
  d1KeyB(drive) {
    go(drive, at('2,0', 6, 2));
    lift(drive, 'left');
    drive.walkTo(at('2,0', 7, 2));
    toss(drive, 'right');
    assert.equal(d1(drive).switches.d1SwitchPit, true, 'a pot thrown over the pits throws the switch');
    pickUp(drive, at('2,0', 3, 6), 'down', (state) => drive.VL.spotFound(state, 'd1KeyB'));
  },
  oreScriptorium(drive) {
    pickUp(drive, at('2,0', 13, 7), 'down', (state) => drive.VL.spotFound(state, 'oreScriptorium'));
  },
  d1DoorB(drive) {
    go(drive, at('2,0', 14, 5));
    drive.until(() => d1(drive).doors.d1DoorB, 1, ['right']);
  },
  // Two throws (W42): over the desks at the first switch, which lifts the
  // niche's gate, then through the gate over its desk at the second.
  d1BossKey(drive) {
    if (!d1(drive).switches.d1SwitchDesk) {
      go(drive, at('3,0', 13, 5));
      lift(drive, 'right');
      drive.walkTo(at('3,0', 12, 4));
      toss(drive, 'up');
      assert.equal(d1(drive).switches.d1SwitchDesk, true, 'a pot thrown over the desks throws the first switch');
    }
    if (!d1(drive).switches.d1SwitchNiche) {
      go(drive, at('3,0', 13, 5));
      drive.until((state) => state.room.entities.some((e) => e.type === 'pot' && e.x === 14 && e.y === 5), 6);
      lift(drive, 'right');
      drive.walkTo(at('3,0', 12, 5));
      toss(drive, 'down');
      assert.equal(d1(drive).switches.d1SwitchNiche, true, 'a pot thrown through the gate throws the second switch');
    }
    pickUp(drive, at('3,0', 3, 5), 'down', (state) => drive.VL.spotFound(state, 'd1BossKey'));
  },
  d1BossDoor(drive) {
    go(drive, at('1,-1', 7, 1));
    drive.until(() => d1(drive).doors.d1BossDoor, 1, ['up']);
  },
  d1Boss(drive) {
    fightBookworm(drive);
    drive.reload();
    assert.ok(drive.VL.bossBeaten(drive.state, 'scriptorium'), 'the win survives a reload');
    // Back in for the heart container, which waited where the worm began,
    // round the warp out (7,8) so as not to step on it.
    drive.closePopups();
    go(drive, at('1,-2', 6, 9));
    drive.walkTo(at('1,-2', 6, 6));
    drive.until((state) => drive.VL.heroTile(state).tx === 7, 1, ['right']);
    const maxHp = drive.state.maxHp;
    drive.until((state) => state.maxHp > maxHp, 1, ['up']);
    drive.closePopups();
  },
};

// The Bookworm, fought with real keys: stand two tiles below its first hole,
// where every surfacing is straight up or straight along the row; fetch a
// pot from a corner, wait for the head, turn to it and throw.
const POST = { tx: 7, ty: 7 };
const CORNER_POTS = [{ pot: [2, 9], from: [3, 9], dir: 'left' }, { pot: [13, 9], from: [12, 9], dir: 'right' }, { pot: [2, 2], from: [3, 2], dir: 'left' }, { pot: [13, 2], from: [12, 2], dir: 'right' }];

function fightBookworm(drive) {
  const { VL } = drive;
  go(drive, at('1,-1', 7, 1));
  // Fights are on from the doorway: the drive clears enemies otherwise.
  drive.fight = true;
  drive.until((state) => state.player.screen === '1,-2' && !state.transition && VL.heroTile(state).ty <= 8, 3, ['up']);
  const worm = () => drive.state.room.entities.find((e) => e.type === 'bookworm');
  const tryWalk = (target) => {
    try {
      drive.walkTo(target);
      return true;
    } catch (error) {
      // Knocked off the path by a paper wad: try again from where he is.
      if (!/not reached|no path/.test(error.message)) throw error;
      return false;
    }
  };
  for (let round = 0; round < 30 && !VL.bossBeaten(drive.state, 'scriptorium'); round += 1) {
    assert.ok(drive.state.hp > 0, 'the hero outlasts the Bookworm');
    if (!drive.state.player.lifted) {
      const ready = CORNER_POTS.find(({ pot }) => drive.state.room.entities.some((e) => e.type === 'pot' && e.x === pot[0] && e.y === pot[1]));
      if (!ready) {
        drive.hold([], 0.5);
        continue;
      }
      if (!tryWalk(at('1,-2', ...ready.from))) continue;
      face(drive, ready.dir);
      drive.press('interact');
      continue;
    }
    if (!tryWalk(at('1,-2', POST.tx, POST.ty))) continue;
    const up = (state) => !state.player.lifted || !worm() || worm().mode === 'up';
    drive.until(up, 6);
    const w = worm();
    if (!w || !drive.state.player.lifted) continue;
    const hole = VL.tileOf(w.at.x, w.at.y);
    const hero = VL.heroTile(drive.state);
    const dir = hole.tx === hero.tx ? (hole.ty < hero.ty ? 'up' : 'down') : hole.tx < hero.tx ? 'left' : 'right';
    face(drive, dir);
    drive.press('interact');
    drive.hold([], 0.6);
  }
  if (!VL.bossBeaten(drive.state, 'scriptorium')) drive.until((state) => VL.bossBeaten(state, 'scriptorium'), 3);
  drive.fight = false;
}

const ROUTE = Object.keys(route);

module.exports = { route, ROUTE, go, lift, toss, face, at };
