// Playthrough steps for the milestones W14 implements: into the Old
// Scriptorium with the librarian's key, through it to the Lifting Gloves,
// then on to the Bookworm (tests/scriptorium-route.js has each lock's play).
const { route } = require('../scriptorium-route');

const run = (...ids) => (drive) => {
  for (const id of ids) route[id](drive);
};

module.exports = (step) => {
  step('scriptoriumEntered', run('scriptoriumEntered'));
  step('liftingGloves', run('woodsMural', 'd1KeyA', 'd1DoorA', 'liftingGloves'));
  step('d1Boss', run('d1KeyB', 'oreScriptorium', 'd1DoorB', 'd1BossKey', 'd1BossDoor', 'd1Boss'));
};
