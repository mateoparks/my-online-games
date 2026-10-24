// Home beach and the hut: a placeholder starter corner of the overworld
// (engine tests use their own fixture area, so this can be replaced freely).
VL.defineArea('overworld', { tileset: 'base' });
VL.defineArea('hut', { tileset: 'base' });

// Beach props stand on the floor around them, not on a square of grass.
VL.extendTileset('base', {
  t: { solid: true, tree: true, art: 'tree', ground: 'sand' },
  r: { solid: true, rock: true, art: 'rock', ground: 'sand' },
  o: { solid: true, rock: true, art: 'rock', ground: 'shallow' },
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
      { type: 'spot', id: 'bookMeadowRock', x: 7, y: 3, how: 'rock', lock: 'bookMeadowRock' },
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
    entities: [],
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
      'rsssssssssssssss',
      'rsssssssssssssss',
      'Wwwwwwwwwwwwwwww',
      'WWWWWWWWWWWWWWWW',
    ],
    entities: [],
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
      'ssssssssssssssst',
      'wwwwwwwwwwwwwwwo',
      'WWWWWWWWWWWWWWWW',
    ],
    entities: [
      { type: 'door', x: 8, y: 3, to: { area: 'hut', screen: '0,0', tx: 7, ty: 8, facing: 'up' } },
      { type: 'spot', id: 'oreShallows', x: 12, y: 9, how: 'pickup', lock: 'oreShallows' },
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
    ],
  },
});

VL.setStart({ area: 'overworld', screen: '1,1', tx: 8, ty: 5, facing: 'down' });
