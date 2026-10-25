// The Climber's Almanac and the way into the highlands (design: The path
// through the game, 7; Books, pages and the library: Missing pages). Miss
// Quill binds the five loose pages into it (W10's bindery sets pagesBound);
// it shows the hidden path up the cliff base to a ledge, where a chicken
// carries a hero who has had the Chicken Keeper's Almanac read to him across
// the chasms (systems/chickens.js). README "The highlands (W19)".
(() => {
  const { rect } = VL.ART;

  // The hidden path's two tiles on the cliff base (regions/cliffs.js `h`),
  // turned into a climb for good once the Almanac is owned.
  VL.HIDDEN_PATH = { area: 'overworld', screen: '-1,-2', tiles: [[10, 4], [10, 5]], opensTo: 'i' };

  VL.extendTileset('base', {
    i: { art: 'hiddenPathOpen', ground: 'scree' },
  });

  // A cleft in the cliff: scree underfoot, the rock close on both sides,
  // worn footholds and the vine the Almanac's sketch shows.
  VL.ART.defineTileStyle('hiddenPathOpen', {
    ground(ctx, cell, t) {
      VL.ART.TILE_STYLES.scree.ground(ctx, cell, t);
      const { x, y } = cell;
      rect(ctx, 'cliffFaceDark', x, y, 3, 16);
      rect(ctx, 'cliffFaceDark', x + 13, y, 3, 16);
      rect(ctx, 'cliffEdge', x + 3, y, 1, 16);
      rect(ctx, 'cliffEdge', x + 12, y, 1, 16);
      for (const fy of [3, 9, 15]) {
        rect(ctx, 'cliffEdge', x + 4, y + fy, 8, 1);
        rect(ctx, 'screeLight', x + 4, y + fy - 1, 8, 1);
      }
      for (let i = 0; i < 6; i += 1) rect(ctx, i % 2 ? 'leafDark' : 'leaf', x + 1 + (i % 2), y + 1 + i * 2 + (i > 2 ? 2 : 0), 1, 2);
    },
  });

  VL.ART.defineSprite('item-climbers-almanac', {
    colors: { o: 'outline', c: 'rock', d: 'rockDark', s: 'white', g: 'leaf', p: 'parchmentLight', b: 'woodDark' },
    rows: [
      'oooooooo',
      'obccccco',
      'obccscco',
      'obcdcdco',
      'obddgddo',
      'obgddgdo',
      'obpppppo',
      'oooooooo',
    ],
  });

  VL.defineItem('climbersAlmanac', {
    name: 'Climber\'s Almanac',
    icon: 'climbers-almanac',
    worn: true,
    about: 'Five pages bound into one book. It shows a hidden path up the cliffs.',
    popup: {
      title: 'The Climber\'s Almanac!',
      text: 'Your five pages make one book. A sketch shows a hidden path up the rocks, past the cliff road. From its ledge, maybe a chicken could help?',
    },
  });

  VL.definePopup('hiddenPathFound', {
    title: 'The hidden path!',
    text: 'Just like the sketch in the Almanac: footholds and a vine, hidden in the cliff. It climbs to a ledge above.',
  });

  // Binding gives the book; a save bound before the book existed gets it too.
  function bindAlmanac(state) {
    if (!state.flags?.pagesBound || state.items.climbersAlmanac) return;
    VL.giveWornItem(state, 'climbersAlmanac');
    VL.holdUp(state, VL.itemSprite('climbersAlmanac'), { sound: 'fanfare' });
  }

  function openHiddenPath(state) {
    const path = VL.HIDDEN_PATH;
    if (!VL.hasItem(state, 'climbersAlmanac')) return;
    for (const [tx, ty] of path.tiles) {
      if (!VL.savedTile(state, path.area, path.screen, tx, ty)) VL.saveTile(state, tx, ty, path.opensTo, path);
    }
  }

  VL.onRoomBuilt(openHiddenPath);
  VL.defineSystem('climbersAlmanac', {
    order: 97,
    update(state) {
      bindAlmanac(state);
      openHiddenPath(state);
      const { area, screen } = state.player;
      if (area === VL.HIDDEN_PATH.area && screen === VL.HIDDEN_PATH.screen && VL.hasItem(state, 'climbersAlmanac') && !state.holdUp) {
        VL.showPopup(state, 'hiddenPathFound');
      }
    },
  });

  // ---------- progression (README "Progression") ----------

  VL.defineLock('climbersAlmanac', { ...VL.LOCKS.climbersAlmanac, reached: (state) => VL.hasItem(state, 'climbersAlmanac') });
  VL.defineLock('highlands', {
    ...VL.LOCKS.highlands,
    reached: (state) => VL.regionVisited(state, 'highlands'),
    place: { area: 'overworld', screen: '-1,-3' },
  });
})();
