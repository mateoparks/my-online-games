// Home beach and the hut: a placeholder starter corner of the overworld
// (engine tests use their own fixture area, so this can be replaced freely).
VL.defineArea('overworld', { tileset: 'base' });
// The hut uses the town's interior tiles (regions/buildings.js): its `n` is
// floor under furniture drawn as decor.
VL.defineArea('hut', { tileset: 'interior' });
VL.ART.setAreaLight('hut', 'indoor');

// Beach props stand on the floor around them, not on a square of grass.
// Where the shore is blocked it shows driftwood, which nothing lifts: a rock
// there would promise a way through (README "Overworld map", shore barriers).
VL.extendTileset('base', {
  t: { solid: true, tree: true, art: 'tree', ground: 'sand' },
  j: { solid: true, driftwood: true, art: 'driftwood', ground: 'sand' },
});

VL.ART.addColors({
  driftwood: '#9c6b40',
  driftwoodLight: '#c99863',
  driftwoodDark: '#4a3020',
  driftwoodGrain: '#6e4527',
  driftwoodEnd: '#ecd3a0',
  driftwoodRing: '#c09060',
});

// A long brown log lying on its side, its pale cut end showing rings and a
// branch still reaching out of it: low, warm and long, so it never reads as
// one of the round grey rocks a hero can lift.
VL.ART.defineSprite('tile-driftwood', {
  outline: false,
  colors: { d: 'driftwoodDark', l: 'driftwood', L: 'driftwoodLight', k: 'driftwoodGrain', E: 'driftwoodEnd', r: 'driftwoodRing', c: 'driftwoodDark' },
  rows: [
    '............dd..',
    '...........dLd..',
    '..........dLd...',
    '.dddddddddLdddd.',
    'dEEdLLLLLLLLLLdd',
    'ErrElllkkklllLLd',
    'ErcEllllllllkkld',
    'ErrEkkllllllllld',
    'dEEdllllllkkllld',
    '.dddddddddddddd.',
  ],
});
VL.ART.defineTileStyle('driftwood', {
  under: 'sand',
  shadow: (ctx, cell) => VL.ART.rect(ctx, 'shadow', cell.x + 1, cell.y + 13, 15, 3),
  raised: (ctx, cell) => VL.ART.drawSprite(ctx, 'tile-driftwood', cell.x, cell.y + 5),
});

VL.addScreens('overworld', {
  '0,0': {
    tiles: [
      'TTTTTTTTTTTTTTTT',
      'T..............T',
      'T..B.....,...Y.T',
      'T......R.......T',
      'T...............',
      'T......,........',
      'T...............',
      'T..............T',
      'T.....B....,...T',
      'T..............T',
      'TTTTTTTT....TTTT',
    ],
    entities: [
      { type: 'spot', id: 'bookMeadowRock', x: 7, y: 3, how: 'rock', by: 'W14', lock: 'bookMeadowRock' },
    ],
  },
  '1,0': {
    tiles: [
      'TTTTTTTTTTTTTTTT',
      'T.......B......T',
      'T..............T',
      'T...R.....,....T',
      '...............T',
      '....B..........T',
      '...............T',
      'T.....B....,...T',
      'T..............T',
      'T..............T',
      'TTTTTT....TTTTTT',
    ],
    entities: [
      { type: 'slime', x: 10, y: 5 },
      { type: 'slime', x: 7, y: 2 },
    ],
  },
  '0,1': {
    tiles: [
      'TTTTTTTT....TTTT',
      'T..............T',
      'T.R.......B....T',
      'T..............T',
      'T...............',
      'T......R........',
      'T...............',
      'jsssssssssssssss',
      'jsssssssssssssss',
      'Wwwwwwwwwwwwwwww',
      'WWWWWWWWWWWWWWWW',
    ],
    entities: [
      { type: 'crab', x: 4, y: 7 },
      { type: 'shell', x: 6, y: 8 },
      { type: 'shell', whole: true, id: 'shellHomeBeach', x: 11, y: 7 },
    ],
  },
  '1,1': {
    tiles: [
      'TTTTTT....TTTTTT',
      'T......HHHH....T',
      'T......HHHH....T',
      'T......HDHH....T',
      '........P.......',
      '........PPPPPPPP',
      '....B...P..B....',
      'ssssssssssssssss',
      'sssssssssssssssj',
      'wwwwwwwwwwwwwwwW',
      'WWWWWWWWWWWWWWWW',
    ],
    entities: [
      { type: 'door', x: 8, y: 3, to: { area: 'hut', screen: '0,0', tx: 7, ty: 8, facing: 'up' } },
      { type: 'sign', x: 10, y: 4, text: 'Home. Step up to the lantern inside to save your adventure.' },
      { type: 'shell', x: 3, y: 8 },
      { type: 'shell', x: 13, y: 7 },
      { type: 'spot', id: 'oreShallows', x: 12, y: 9, how: 'pickup', by: 'W5', lock: 'oreShallows' },
    ],
  },
});

// Home (W44): a bed, an empty bookshelf waiting for books, and the save
// lantern on the nightstand, saved from the step in front of it.
VL.HOME_SAVE = { area: 'hut', screen: '0,0', tx: 2, ty: 2, facing: 'down' };

(() => {
  const { rect } = VL.ART;
  VL.ART.addColors({
    hutQuilt: '#4f7cac',
    hutQuiltLight: '#7aa4cf',
    hutQuiltDark: '#34567a',
    hutPillow: '#f3ecdc',
    hutPillowShade: '#d6cbb2',
    hutRug: '#b0703a',
    hutRugDark: '#87532a',
    hutRugLight: '#e0b46a',
    hutSky: '#9fd4f0',
    hutSkyLight: '#e3f5fc',
    hutPot: '#b5653a',
    hutPotDark: '#7d4224',
  });

  // Head against the back wall, two tiles long, the quilt turned down.
  VL.defineDecor('hutBed', (ctx, x, y) => {
    rect(ctx, 'shadow', x + 3, y + 31, 13, 2);
    rect(ctx, 'outline', x + 1, y - 5, 14, 36);
    rect(ctx, 'wood', x + 2, y - 4, 12, 6);
    rect(ctx, 'woodLight', x + 2, y - 4, 12, 1);
    rect(ctx, 'woodDark', x + 2, y + 1, 12, 1);
    rect(ctx, 'hutPillow', x + 2, y + 2, 12, 9);
    rect(ctx, 'hutPillowShade', x + 3, y + 8, 10, 1);
    rect(ctx, 'white', x + 4, y + 3, 4, 1);
    rect(ctx, 'hutQuiltLight', x + 2, y + 11, 12, 3);
    rect(ctx, 'hutQuilt', x + 2, y + 14, 12, 14);
    rect(ctx, 'hutQuiltDark', x + 11, y + 14, 3, 14);
    for (let row = y + 17; row < y + 27; row += 5) rect(ctx, 'hutQuiltLight', x + 4, row, 6, 1);
    rect(ctx, 'woodDark', x + 2, y + 28, 12, 2);
    rect(ctx, 'wood', x + 2, y + 28, 12, 1);
  });

  // A little bedside table; the lantern on it is the savePoint entity's.
  VL.defineDecor('hutNightstand', (ctx, x, y) => {
    rect(ctx, 'shadow', x + 3, y + 15, 12, 2);
    rect(ctx, 'outline', x + 2, y + 5, 12, 11);
    rect(ctx, 'wood', x + 3, y + 6, 10, 9);
    rect(ctx, 'woodLight', x + 3, y + 6, 10, 2);
    rect(ctx, 'woodDark', x + 3, y + 10, 10, 1);
    rect(ctx, 'gold', x + 7, y + 12, 2, 1);
  });

  // A bookshelf two tiles wide, every board bare for now.
  VL.defineDecor('hutShelf', (ctx, x, y) => {
    rect(ctx, 'shadow', x + 2, y + 15, 30, 2);
    rect(ctx, 'outline', x + 1, y - 10, 30, 26);
    rect(ctx, 'woodDark', x + 2, y - 9, 28, 24);
    for (const board of [-3, 4, 11]) {
      rect(ctx, 'wood', x + 2, y + board, 28, 2);
      rect(ctx, 'woodLight', x + 2, y + board, 28, 1);
    }
    rect(ctx, 'woodLight', x + 2, y - 9, 1, 24);
  });

  // A woven rug in the middle of the room.
  VL.defineDecor('hutRug', (ctx, x, y) => {
    rect(ctx, 'hutRugDark', x, y + 2, 96, 40);
    rect(ctx, 'hutRug', x + 2, y + 4, 92, 36);
    for (let i = 0; i < 92; i += 8) {
      rect(ctx, 'hutRugLight', x + 4 + i, y + 7, 4, 1);
      rect(ctx, 'hutRugLight', x + 4 + i, y + 36, 4, 1);
    }
    rect(ctx, 'hutRugLight', x + 40, y + 19, 16, 6);
    rect(ctx, 'hutRug', x + 42, y + 21, 12, 2);
  });

  // A window in the back wall, with a bit of sky.
  VL.defineDecor('hutWindow', (ctx, x, y) => {
    rect(ctx, 'outline', x + 2, y + 4, 12, 9);
    rect(ctx, 'hutSky', x + 3, y + 5, 10, 7);
    rect(ctx, 'hutSkyLight', x + 4, y + 6, 3, 1);
    rect(ctx, 'woodDark', x + 8, y + 5, 1, 7);
    rect(ctx, 'woodDark', x + 3, y + 8, 10, 1);
    rect(ctx, 'woodLight', x + 1, y + 13, 14, 1);
  });

  // A small table with a cup and a sprig in a jar.
  VL.defineDecor('hutTable', (ctx, x, y) => {
    VL.ART.drawShadow(ctx, x + 8, y + 15, 14);
    rect(ctx, 'outline', x + 1, y + 4, 14, 8);
    rect(ctx, 'wood', x + 2, y + 5, 12, 6);
    rect(ctx, 'woodLight', x + 2, y + 5, 12, 1);
    rect(ctx, 'woodDark', x + 3, y + 11, 2, 4);
    rect(ctx, 'woodDark', x + 11, y + 11, 2, 4);
    rect(ctx, 'white', x + 4, y + 2, 3, 3);
    rect(ctx, 'hutPot', x + 9, y + 2, 3, 3);
    rect(ctx, 'leafLight', x + 9, y - 1, 1, 3);
    rect(ctx, 'leaf', x + 11, y - 2, 1, 4);
  });

  // A potted fern in the corner.
  VL.defineDecor('hutPlant', (ctx, x, y) => {
    VL.ART.drawShadow(ctx, x + 8, y + 15, 10);
    rect(ctx, 'outline', x + 4, y + 8, 8, 7);
    rect(ctx, 'hutPot', x + 5, y + 9, 6, 5);
    rect(ctx, 'hutPotDark', x + 9, y + 9, 2, 5);
    rect(ctx, 'leaf', x + 3, y + 2, 10, 6);
    rect(ctx, 'leafLight', x + 5, y, 3, 5);
    rect(ctx, 'leafDark', x + 9, y + 3, 3, 4);
    rect(ctx, 'leafShine', x + 6, y + 1, 1, 2);
  });
})();

VL.addScreens('hut', {
  '0,0': {
    tiles: [
      '################',
      '#nn__nn________#',
      '#n_____________#',
      '#______________#',
      '#______________#',
      '#______________#',
      '#___________n__#',
      '#______________#',
      '#_____________n#',
      '#______m_______#',
      '################',
    ],
    entities: [
      { type: 'decor', art: 'hutRug', x: 4, y: 5 },
      { type: 'decor', art: 'hutWindow', x: 9, y: 0 },
      { type: 'decor', art: 'hutBed', x: 1, y: 1 },
      { type: 'decor', art: 'hutNightstand', x: 2, y: 1 },
      { type: 'decor', art: 'hutShelf', x: 5, y: 1 },
      { type: 'decor', art: 'hutTable', x: 12, y: 6 },
      { type: 'decor', art: 'hutPlant', x: 14, y: 8 },
      { type: 'door', x: 7, y: 9, to: { area: 'overworld', screen: '1,1', tx: 8, ty: 4, facing: 'down' } },
      { type: 'savePoint', x: VL.HOME_SAVE.tx, y: VL.HOME_SAVE.ty, on: 'nightstand' },
      { type: 'chest', id: 'hutChest', x: 12, y: 2, contents: [{ item: 'woodSword' }, { item: 'woodShield' }] },
    ],
  },
});

VL.setStart({ area: 'overworld', screen: '1,1', tx: 8, ty: 5, facing: 'down' });
