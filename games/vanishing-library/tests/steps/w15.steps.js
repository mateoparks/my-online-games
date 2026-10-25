// Playthrough steps for the milestones W15 implements: through the
// Whispering Woods with the copied map into the Hollow Oak, to the Grappling
// Rope, and on to the Thornback (tests/hollow-oak-route.js has each lock's
// play).
const { route } = require('../hollow-oak-route');

const run = (...ids) => (drive) => {
  for (const id of ids) route[id](drive);
};

module.exports = (step) => {
  step('hollowOakEntered', run('hollowOakEntered'));
  step('grapplingRope', run('d2KeyA', 'd2DoorA', 'grapplingRope'));
  step('d2Boss', run('d2KeyB', 'd2DoorB', 'd2BossKey', 'd2BossDoor', 'd2Boss'));
};
