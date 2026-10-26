// The finale played for real (W20): one function per milestone, each starting
// from wherever the hero stands (the hut after a reload or a faint, or where
// the last one left him). tests/steps/w20.steps.js strings them into the
// story; tests/finale.test.js runs them from the W19 fixture.
const assert = require('node:assert/strict');
const { walk, ow } = require('./highlands-route');
const { talkThrough } = require('./steps/w16.steps');
const { equip, face } = require('./metal-gear-route');

const ws = (screen, tx, ty) => ({ area: 'workshop', screen, tx, ty });
const settled = (state) => !state.transition;

function wake(drive) {
  if (drive.app.sceneId !== 'fainted') return false;
  drive.hold([], 0.8);
  drive.press('interact');
  drive.closePopups();
  return true;
}

// Into the square, then down the open trapdoor (walking onto it climbs down).
function downTheTrapdoor(drive) {
  const { state } = drive;
  if (state.player.area === 'workshop') return;
  walk(drive, ow('2,0', 3, 4));
  drive.closePopups();
  drive.until((s) => s.player.area === 'workshop' && settled(s), 2, ['up']);
}

// Down to the hall, talking through whatever is said on the way.
function toHall(drive) {
  downTheTrapdoor(drive);
  for (let i = 0; i < 3 && !(drive.state.player.screen === '0,-1' && settled(drive.state)); i += 1) {
    drive.hold([], 0.1);
    if (drive.app.sceneId === 'dialogue') talkThrough(drive);
    if (drive.state.player.screen === '0,0') walk(drive, ws('0,0', 7, 1));
    // The marionettes are enemies, which the playthrough clears unless fighting.
    drive.fight = true;
    drive.until((s) => s.player.screen === '0,-1' && settled(s), 2, ['up']);
  }
  drive.hold([], 0.1);
  if (drive.app.sceneId === 'dialogue') talkThrough(drive);
}

const handHolding = (drive, ids) => drive.VL.HANDS.find((hand) => ids.includes(drive.VL.heldItem(drive.state, hand)));

// Steers the hero (real held arrows) to a point beside a puppet's string,
// faces it and swings, until every puppet is down.
function fightMarionettes(drive) {
  const { VL } = drive;
  if (!handHolding(drive, ['woodSword', 'metalSword'])) equip(drive, VL.hasItem(drive.state, 'metalSword') ? 'metalSword' : 'woodSword', 'mainHand');
  const swordHand = handHolding(drive, ['woodSword', 'metalSword']);
  drive.fight = true;
  for (let frame = 0; frame < 60 * 120 && !drive.state.flags.marionettes; frame += 1) {
    if (wake(drive)) {
      toHall(drive);
      drive.fight = true;
      continue;
    }
    if (drive.app.sceneId !== 'play') {
      drive.closePopups();
      continue;
    }
    const player = drive.state.player;
    if (process.env.W20DEBUG && frame % 120 === 0) console.log(frame, drive.app.sceneId, drive.state.hp, player.screen, Math.round(player.x), Math.round(player.y), JSON.stringify(drive.state.room.entities.filter((e) => e.type === 'marionette').map((p) => [p.puppet, Math.round(p.cx), Math.round(p.cy), p.mode, p.strings.map((s) => s.cut ? 1 : 0).join('')])));
    const m = VL.puppetsUp(drive.state).find((p) => !(p.jerk > 0)) || VL.puppetsUp(drive.state)[0];
    if (!m) {
      drive.update();
      continue;
    }
    const string = m.strings.find((s) => !s.cut && (s.dx < 0) === (player.x < m.cx)) || m.strings.find((s) => !s.cut);
    const side = string.dx < 0 ? -1 : 1;
    const target = { x: VL.clamp(m.cx + side * VL.STRING_REACH.dx, 22, 234), y: VL.clamp(m.cy + VL.STRING_REACH.dy, 60, 150) };
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const held = [];
    if (Math.abs(dx) > 1.5) held.push(dx > 0 ? 'right' : 'left');
    if (Math.abs(dy) > 1.5) held.push(dy > 0 ? 'down' : 'up');
    if (held.length) {
      drive.update(VL.actions({ held }));
      continue;
    }
    face(drive, side < 0 ? 'right' : 'left');
    drive.press(swordHand);
    drive.hold([], 0.3);
  }
  assert.ok(drive.state.flags.marionettes, 'every string cut');
}

const route = {
  trapdoorOpen(drive) {
    walk(drive, ow('2,0', 5, 4));
    drive.closePopups();
  },
  marionettes(drive) {
    toHall(drive);
    fightMarionettes(drive);
  },
  // Her last show, the apology and his forgiveness, the ending and the
  // credits, back to the title, and Continue (the slot shows FINISHED).
  ending(drive) {
    const { VL } = drive;
    if (!drive.state.flags.forgiven) {
      toHall(drive);
      for (let i = 0; i < 6 && !drive.state.flags.forgiven; i += 1) {
        drive.until(() => drive.app.sceneId !== 'play', 3);
        if (drive.app.sceneId === 'dialogue') talkThrough(drive);
        else if (drive.app.sceneId === 'puppetShow') {
          for (let n = 0; n < 40 && drive.app.sceneId === 'puppetShow'; n += 1) {
            drive.hold([], 0.15);
            drive.press('interact');
          }
        }
      }
      assert.ok(drive.state.flags.forgiven, 'she is forgiven');
    }
    drive.until(() => drive.app.sceneId === 'ending', 3);
    for (let i = 0; i < 80 && drive.app.ending?.phase !== 'credits'; i += 1) {
      drive.hold([], 0.2);
      drive.press('interact');
    }
    assert.equal(drive.app.ending.phase, 'credits');
    assert.equal(drive.state.finished, true, 'finished as the credits roll');
    for (let i = 0; i < 4 && drive.app.sceneId === 'ending'; i += 1) {
      drive.hold([], 0.3);
      drive.press('interact');
    }
    assert.equal(drive.app.sceneId, 'title');
    assert.equal(drive.app.title.slots[drive.app.title.cursor].summary.finished, true, 'the slot shows FINISHED');
    drive.press('confirm');
    assert.equal(drive.app.sceneId, 'play');
    assert.deepEqual([drive.state.player.area, drive.state.player.screen], [VL.HOME_SAVE.area, VL.HOME_SAVE.screen], 'Continue wakes him at the hut');
  },
};

module.exports = { route, ROUTE: Object.keys(route), toHall, fightMarionettes, ws };
