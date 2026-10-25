// The lake north of town, fed out through the river. Its island sits more
// than a long chicken flight from every shore, so only the raft (W17) gets
// there: the island's ore is one of the three after the shockwave.
(() => {
  const { rect } = VL.ART;

  VL.ART.addColors({
    reed: '#5f9a3e',
    reedDark: '#3f7330',
    cattail: '#6b4226',
  });

  VL.extendTileset('base', {
    e: { shallow: true, reeds: true, art: 'reeds' },
  });

  // Reeds stand in the shallows and sway a little.
  VL.ART.defineTileStyle('reeds', {
    under: 'shallow',
    raised(ctx, cell, t) {
      for (let i = 0; i < 4; i += 1) {
        const rx = cell.x + 2 + Math.floor(cell.seed(i + 30) * 12);
        const height = 7 + Math.floor(cell.seed(i + 34) * 6);
        const sway = Math.sin(t * 1.3 + cell.wx + i) > 0.5 ? 1 : 0;
        const top = cell.y + 14 - height;
        rect(ctx, i % 2 ? 'reedDark' : 'reed', rx, top + 2, 1, height - 2);
        rect(ctx, 'cattail', rx + sway, top, 2, 3);
      }
    },
  });

  const spot = (id, x, y, how, by, lock = id) => ({ type: 'spot', id, x, y, how, by, lock });

  VL.addScreens('overworld', {
    // The west shore, up the path past the Scriptorium.
    '2,-3': {
      tiles: [
        'TTTTTTTTWWWWWWWW',
        'T..,....wwWWWWWW',
        'T.Y....wwWWWWWWW',
        'T......weWWWWWWW',
        'T..R...wwWWWWWWW',
        'T.....,.wWWWWWWW',
        'T........wWWWWWW',
        'T..B....wwWWWWWW',
        'T.......ewWWWWWW',
        'TT.......wwWWWWW',
        'TT..TTTTTWWWWWWW',
      ],
      entities: [
        { type: 'slime', x: 4, y: 6 },
        spot('bookLakeShore', 3, 4, 'rock', 'W14'),
        spot('pageFieldB', 8, 8, 'pickup', 'W11'),
      ],
    },
    // Open water and the island.
    '3,-3': {
      tiles: [
        'WWWWWWWWWWWWWWWW',
        'WWWWWWWwwWWWWWWW',
        'WWWWWWwsswwWWWWW',
        'WWWWWwsstsswWWWW',
        'WWWWWwsssjswWWWW',
        'WWWWWWwssswWWWWW',
        'WWWWWWWwwwWWWWWW',
        'WWWWWWWWWWWWWWWW',
        'WWWWWWWWWWWWWWWW',
        'WWWWWWWWWWWWWWWW',
        'WWWWWWWWWWWWWWWW',
      ],
      entities: [
        spot('oreLakeIsland', 7, 4, 'pickup', 'W17'),
        spot('bookSmithsLedger', 10, 3, 'trunk', 'W11'),
      ],
    },
  });

  VL.defineRegion('lake', { screens: ['2,-3', '3,-3'], place: 'lake' });
  VL.defineLock('lake', {
    ...VL.LOCKS.lake,
    reached: (state) => VL.regionVisited(state, 'lake'),
    place: { area: 'overworld', screen: '2,-3' },
  });
})();
