// Playthrough steps for the milestones W2 implements: a new game from the
// title screen, named on the canvas, through the intro, then a page reload
// that finds the save. An app a test built already past the title has
// nothing to do here.
module.exports = (step) => {
  step('named', (drive) => {
    const { VL } = drive;
    if (drive.app.sceneId !== 'title') return;
    drive.press('confirm');
    drive.update(VL.actions({ typed: 'Robin' }));
    drive.press('confirm');
    drive.hold([], VL.INTRO.skipAfter + 0.1);
    drive.press('interact');
    if (drive.app.sceneId !== 'play') throw new Error(`named: expected to be playing, scene is ${drive.app.sceneId}`);
    drive.reload();
  });
};
