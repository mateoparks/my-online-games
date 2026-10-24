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
    'progression.js',
    'milestones.js',
  ],

  art: [
    'art.js',
    'art/font.js',
    'art/tiles.js',
    'art/hero.js',
    'art/sprites.js',
    'art/ui.js',
  ],

  systems: [
    'systems/movement.js',
    'systems/sound.js',
  ],

  entities: [
    'entities/door.js',
    'entities/spot.js',
    'entities/decor.js',
  ],

  regions: [
    'regions/home.js',
    'regions/town.js',
    'regions/beach.js',
    'regions/lake.js',
    'regions/east-road.js',
    'regions/woods.js',
    'regions/cliffs.js',
    'regions/highlands.js',
    'regions/finds.js',
  ],

  dungeons: [
  ],

  scenes: [
    'scenes/play.js',
    'scenes/art-sheet.js',
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
