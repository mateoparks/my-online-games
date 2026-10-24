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
    'save.js',
    'progression.js',
    'milestones.js',
    'items.js',
    'spots.js',
    'talk.js',
    'shop.js',
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
    'systems/foliage.js',
    'systems/hands.js',
    'systems/chickens.js',
    'systems/combat.js',
    'systems/economy.js',
    'systems/digging.js',
    'systems/library.js',
  ],

  entities: [
    'entities/door.js',
    'entities/spot.js',
    'entities/decor.js',
    'entities/save-point.js',
    'entities/npc.js',
    'entities/chest.js',
    'entities/sign.js',
    'entities/pickups.js',
    'entities/ore.js',
    'entities/chicken.js',
    'entities/crab.js',
    'entities/slime.js',
    'entities/bat.js',
    'entities/spitter.js',
    'entities/gull.js',
    'entities/heart-container.js',
    'entities/library-finds.js',
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
    'regions/townsfolk.js',
    'regions/buildings.js',
    'regions/library.js',
  ],

  dungeons: [
  ],

  scenes: [
    'scenes/play.js',
    'scenes/art-sheet.js',
    'scenes/title.js',
    'scenes/name.js',
    'scenes/intro.js',
    'scenes/pause.js',
    'scenes/fainted.js',
    'scenes/conflict.js',
    'scenes/dialogue.js',
    'scenes/shop.js',
    'scenes/popup.js',
    'scenes/equipment.js',
    'scenes/reading.js',
    'scenes/puppet-show.js',
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
