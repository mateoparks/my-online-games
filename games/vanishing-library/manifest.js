var VL = globalThis.VL || (globalThis.VL = {});

// The one list of game scripts. index.html loads them in this order and
// game.test.js loads the same list into node:vm. Sections load top to bottom;
// add a new file at the end of its section (see README.md).
VL.FILES = {
  core: [
    'config.js',
    'util.js',
    'tiles.js',
    'world.js',
    'state.js',
    'engine.js',
    'app.js',
    'screen.js',
    'loop.js',
  ],

  art: [
    'art.js',
  ],

  systems: [
    'systems/movement.js',
  ],

  entities: [
    'entities/door.js',
  ],

  regions: [
    'regions/home.js',
  ],

  dungeons: [
  ],

  scenes: [
    'scenes/play.js',
  ],

  boot: [
    'render.js',
    'input.js',
    'main.js',
  ],
};

VL.scriptFiles = function scriptFiles() {
  return [].concat(...Object.values(VL.FILES));
};
