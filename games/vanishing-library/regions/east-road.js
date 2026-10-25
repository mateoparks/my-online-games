// The east road out of town: boulders choke the canyon until the Lifting
// Gloves (W14 makes them liftable), then on to the Whispering Woods.
(() => {
  VL.extendTileset('base', {
    // `gate` names the key that opens the tile; the tests walk the map with it.
    O: { solid: true, boulder: true, gate: 'liftingGloves', art: 'boulder', ground: 'path' },
  });

  VL.ART.defineSprite('tile-boulder', {
    outline: false,
    colors: { o: 'outline', d: 'rockDark', s: 'rockShade', l: 'rock', m: 'rockLight', g: 'leaf', G: 'leafLight' },
    rows: [
      '.....oooooo.....',
      '...oommmllloo...',
      '..ommmmmlllldo..',
      '.ommmGGmllllldo.',
      '.ommgGGGllllsdo.',
      'olmmggglllllsddo',
      'olmmmlllllllsddo',
      'ollmlllllldlsddo',
      'olllllllldllsddo',
      'oslllllllldssddo',
      '.osllllllssddddo',
      '.ossssssssddddo.',
      '..oddddddddddo..',
      '...oooooooooo...',
    ],
  });

  VL.ART.defineTileStyle('boulder', {
    under: 'grass',
    shadow: (ctx, cell) => VL.ART.rect(ctx, 'shadow', cell.x + 2, cell.y + 13, 14, 3),
    raised: (ctx, cell) => VL.ART.drawSprite(ctx, 'tile-boulder', cell.x, cell.y + 2),
  });

  const spot = (id, x, y, how, by, lock = id) => ({ type: 'spot', id, x, y, how, by, lock });

  VL.addScreens('overworld', {
    // The canyon and its boulders.
    '4,0': {
      tiles: [
        'TTTTCCCCCCCCTTTT',
        'T..,CCCCCCCC,..T',
        'T...CCCCCCCC...T',
        'T...CCCCCCCC.B.T',
        'T.B.CCCCCCCC...T',
        'PPPPPOOPPPPPPPPP',
        '....POOPPPPP....',
        'T...CCCCCCCC...T',
        'T...CCCCCCCC,..T',
        'T.,.CCCCCCCC...T',
        'TTTTCCCCCCCCTTTT',
      ],
      entities: [
        { type: 'slime', x: 13, y: 8 },
      ],
    },
    // The road ends at the dark edge of the Woods.
    '5,0': {
      tiles: [
        'TTTTTT..TTTTTTTT',
        'TTTTT,.P.TTTTTTT',
        'T...T..P.T...TTT',
        'T......P..B...TT',
        'T..,...P.......T',
        'PPPPPPPP....,..T',
        '....PP.........T',
        'T.....B......BBT',
        'T..,.........B.T',
        'T.........,..BBT',
        'TTTTTTTTTTTTTTTT',
      ],
      entities: [
        { type: 'slime', x: 3, y: 8 },
        { type: 'slime', x: 10, y: 6 },
        spot('heartFieldA', 14, 8, 'pickup', 'W6'),
        spot('bookEastRoad', 10, 3, 'bush', 'W11'),
        spot('bookPrimer', 2, 3, 'trunk', 'W11'),
      ],
    },
  });

  // The canyon's town side is open to anyone, so the road proper (the place)
  // starts past the boulders.
  VL.defineRegion('canyon', { screens: ['4,0'] });
  VL.defineRegion('eastRoad', { screens: ['5,0'], place: 'eastRoad' });
  VL.defineLock('eastRoad', {
    ...VL.LOCKS.eastRoad,
    reached: (state) => VL.regionVisited(state, 'eastRoad'),
    place: { area: 'overworld', screen: '5,0' },
  });
})();
