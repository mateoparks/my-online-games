// Playthrough step for the shockwave (W16): the ground shakes after the
// Thornback, a reload with nothing saved since that plays it again (W44),
// the lines told on black,
// waking at home with the Glowstone, and Gran Ottie's wood.
const assert = require('node:assert/strict');

// Presses S through a talk, a fresh press per page, as a player would.
function talkThrough(drive) {
  for (let i = 0; i < 40 && drive.app.sceneId === 'dialogue'; i += 1) {
    drive.hold([], 0.15);
    drive.press('interact');
  }
  assert.notEqual(drive.app.sceneId, 'dialogue', 'the talk ended');
}

function shockwave(drive) {
  const { VL } = drive;
  drive.until(() => drive.app.sceneId === 'shockwave', 4);
  drive.until((state) => state.flags.shockwave, VL.SHOCKWAVE_TIMES.rumble + 0.5);
  // A closed tab: nothing was saved since, so the knock-out comes again.
  drive.reload({ save: false });
  assert.equal(drive.state.flags.shockwave, undefined, 'the losses were never saved');
  drive.until(() => drive.app.sceneId === 'shockwave', 6);
  drive.until((state) => state.flags.shockwave, VL.SHOCKWAVE_TIMES.rumble + 0.5);
  drive.until(() => drive.app.sceneId === 'shockwave' && drive.app.shockwave.phase === 'dark', 3);
  for (let i = 0; i < 30 && drive.app.shockwave?.phase === 'dark'; i += 1) {
    drive.hold([], 0.2);
    drive.press('interact');
  }
  drive.until(() => drive.app.sceneId === 'play', VL.SHOCKWAVE_TIMES.wake + 0.5);
  drive.closePopups();
  drive.until(() => drive.app.sceneId === 'dialogue', 2);
  talkThrough(drive);
  drive.closePopups();
  assert.ok(drive.state.flags['gave:helperWood'], 'Gran handed over the wood');
}

module.exports = (step) => {
  step('shockwave', shockwave);
};
module.exports.talkThrough = talkThrough;
