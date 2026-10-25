// Playthrough steps for the milestones W18 implements: into the Lighthouse
// with the Glowstone, through it to the Slingshot, and on to the Lens Crab
// (tests/lighthouse-route.js has each lock's play).
const { route } = require('../lighthouse-route');

const run = (...ids) => (drive) => {
  for (const id of ids) route[id](drive);
};

module.exports = (step) => {
  step('lighthouseEntered', run('lighthouseEntered'));
  step('slingshot', run('d3KeyA', 'd3DoorA', 'slingshot'));
  step('d3Boss', run('d3KeyB', 'd3DoorB', 'd3BossKey', 'd3BossDoor', 'd3Boss'));
};
