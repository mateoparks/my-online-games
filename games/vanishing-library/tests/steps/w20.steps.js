// Playthrough steps for the finale (W20): the trapdoor open after the
// Dragon, down to the workshop and the marionettes, then her show, his
// forgiveness, the ending, the credits and Continue (tests/finale-route.js
// has each milestone's play).
const { route } = require('../finale-route');

module.exports = (step) => {
  step('trapdoorOpen', route.trapdoorOpen);
  step('marionettes', route.marionettes);
  step('ending', route.ending);
};
