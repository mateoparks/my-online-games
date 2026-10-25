// Playthrough steps for the milestones W19 implements: the last pages and
// the Climber's Almanac, up the hidden path and over the chasms with the
// chickens, into the Dragon's Lair, the Mirror Shield, and the Dragon
// (tests/highlands-route.js and tests/lair-route.js have each lock's play).
const { route: highlands } = require('../highlands-route');
const { route: lair } = require('../lair-route');

const run = (...steps) => (drive) => {
  for (const play of steps) play(drive);
};

module.exports = (step) => {
  step('climbersAlmanac', run(highlands.climbersAlmanac));
  step('highlands', run(highlands.highlands));
  step('dragonsLairEntered', run(lair.dragonsLairEntered));
  step('mirrorShield', run(lair.d4KeyA, lair.d4DoorA, lair.mirrorShield));
  step('d4Boss', run(lair.d4KeyB, lair.d4DoorB, lair.d4BossKey, lair.d4BossDoor, lair.d4Boss));
};
