// Home beach and the hut: a placeholder starter corner of the overworld
// (engine tests use their own fixture area, so this can be replaced freely).
VL.defineArea('overworld', { tileset: 'base' });
VL.defineArea('hut', { tileset: 'base' });

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
      { type: 'sign', x: 10, y: 4, text: 'Home. Step on the lantern inside to save your adventure.' },
      { type: 'shell', x: 3, y: 8 },
      { type: 'shell', x: 13, y: 7 },
      { type: 'spot', id: 'oreShallows', x: 12, y: 9, how: 'pickup', by: 'W5', lock: 'oreShallows' },
    ],
  },
});

VL.addScreens('hut', {
  '0,0': {
    tiles: [
      '################',
      '#______________#',
      '#______________#',
      '#______________#',
      '#______________#',
      '#______________#',
      '#______________#',
      '#______________#',
      '#______________#',
      '#______m_______#',
      '################',
    ],
    entities: [
      { type: 'door', x: 7, y: 9, to: { area: 'overworld', screen: '1,1', tx: 8, ty: 4, facing: 'down' } },
      { type: 'savePoint', x: 2, y: 2 },
      { type: 'chest', id: 'hutChest', x: 12, y: 2, contents: [{ item: 'woodSword' }, { item: 'woodShield' }] },
    ],
  },
});

VL.setStart({ area: 'overworld', screen: '1,1', tx: 8, ty: 5, facing: 'down' });
