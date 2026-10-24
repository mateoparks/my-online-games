// Beaches and tide pools: the home beach (screens in home.js), the tide pools
// east of the harbour, and the shipwreck offshore, reached only by raft (W17).
(() => {
  const { rect } = VL.ART;

  VL.ART.addColors({
    sail: '#e9dfc6',
    sailDark: '#c7b997',
    hullDark: '#4a2e1b',
    starfish: '#f08a4b',
    starfishLight: '#ffc08a',
  });

  VL.extendTileset('base', {
    // Solid water under the wreck's hull: no foam ring, and no raft through it.
    y: { solid: true, footprint: true, art: 'water' },
  });

  VL.ART.defineSprite('decor-starfish', {
    colors: { s: 'starfish', l: 'starfishLight' },
    rows: ['..s..', '.sls.', 'sllls', '.sls.', 's...s'],
  });
  VL.defineDecor('starfish', (ctx, x, y, t, decor) => {
    VL.ART.drawSprite(ctx, 'decor-starfish', x + (decor.dx ?? 5), y + (decor.dy ?? 5));
  });

  // The wreck, anchored at its footprint's top-left tile: a broken hull over
  // the `y` tiles, a deck over the `b` tiles, the stove-in side where a raft
  // comes alongside, a snapped mast with a torn sail, and the hatch (spot).
  VL.defineDecor('wreck', (ctx, x, y, t) => {
    const bob = Math.sin(t * 1.2) > 0 ? 1 : 0;
    rect(ctx, 'shadow', x + 4, y + 61, 152, 3);
    rect(ctx, 'outline', x + 1, y + 2, 158, 59);
    rect(ctx, 'hullDark', x + 2, y + 3, 156, 57);
    rect(ctx, 'woodDark', x + 2, y + 3, 156, 6);
    for (let plank = 0; plank < 3; plank += 1) rect(ctx, 'woodDark', x + 2, y + 50 + plank * 4, 156, 1);
    rect(ctx, 'outline', x + 15, y + 13, 114, 36);
    rect(ctx, 'wood', x + 16, y + 14, 112, 34);
    for (let seam = 20; seam < 128; seam += 6) rect(ctx, 'woodDark', x + seam, y + 14, 1, 34);
    rect(ctx, 'woodLight', x + 16, y + 14, 112, 1);
    // stern cabin
    rect(ctx, 'outline', x + 129, y + 9, 26, 40);
    rect(ctx, 'woodDark', x + 130, y + 10, 24, 38);
    rect(ctx, 'wood', x + 130, y + 10, 24, 3);
    rect(ctx, 'water', x + 137, y + 20, 8, 6);
    rect(ctx, 'woodDark', x + 140, y + 20, 1, 6);
    // the stove-in side
    rect(ctx, 'water', x, y + 32, 16, 16);
    rect(ctx, 'foam', x + 1, y + 33 + bob, 2, 13);
    rect(ctx, 'woodDark', x + 2, y + 31, 13, 2);
    rect(ctx, 'woodDark', x + 2, y + 47, 9, 2);
    // the hatch over the spot tile (x + 80..96, y + 16..32)
    rect(ctx, 'outline', x + 81, y + 17, 14, 14);
    rect(ctx, 'doorway', x + 82, y + 18, 12, 12);
    rect(ctx, 'woodDark', x + 82, y + 18, 12, 2);
    // mast and torn sail
    rect(ctx, 'outline', x + 103, y - 30, 6, 50);
    rect(ctx, 'bark', x + 104, y - 29, 4, 48);
    rect(ctx, 'outline', x + 108, y - 26, 24, 22);
    rect(ctx, 'sail', x + 109, y - 25, 22, 20);
    rect(ctx, 'sailDark', x + 109, y - 12, 22, 7);
    rect(ctx, 'water', x + 124, y - 9, 7, 4);
    rect(ctx, 'sailDark', x + 118, y - 25, 1, 13);
    for (let i = 0; i < 7; i += 1) rect(ctx, 'leaf', x + 8 + i * 22, y + 55 + (i % 2), 3, 5);
  });

  const spot = (id, x, y, how, lock = id) => ({ type: 'spot', id, x, y, how, lock });
  const starfish = (x, y, dx, dy) => ({ type: 'decor', art: 'starfish', x, y, dx, dy });

  VL.addScreens('overworld', {
    // Tide pools east of the harbour.
    '4,1': {
      tiles: [
        'TTTTTTTTTTTTTTTT',
        'TT.,........TTTT',
        'T......B....TTTT',
        '..............TT',
        '................',
        'sssssrssssssssss',
        'sswwssssswwwssss',
        'swwwwsssswowsrss',
        'wwwwwwwwwwwwwwww',
        'WWWWWWWWWWWWWWWW',
        'WWWWWWWWWWWWWWWW',
      ],
      entities: [
        spot('bookBeachBuried', 7, 5, 'buried'),
        starfish(2, 6, 4, 6),
        starfish(11, 6, 2, 3),
      ],
    },
    // The far end of the beach, under the eastern bluffs.
    '5,1': {
      tiles: [
        'TTTTTTTTTTTTTTTT',
        'TTTT.....TTTTTTT',
        'TT.....,...TTTTT',
        'T.....B.......TT',
        '..............RT',
        'sssssssssssssssr',
        'ssswwsssssssssst',
        'sswwwwssssssssrr',
        'wwwwwwwwwwwwwwwo',
        'WWWWWWWWWWWWWWWW',
        'WWWWWWWWWWWWWWWW',
      ],
      entities: [
        spot('bookTideTables', 10, 5, 'trunk'),
        starfish(4, 6, 6, 8),
      ],
    },
    // The shipwreck, offshore.
    '5,2': {
      tiles: [
        'WWWWWWWWWWWWWWWW',
        'WWWWWWWWWWWWWWWW',
        'WWWWWWWWWWWWWWWW',
        'WWWWWWWWWWWWWWWW',
        'WWWWyyyyyyyyWWWW',
        'WWWyybbbbbbyyWWW',
        'WWWWbbbbbbbyyWWW',
        'WWWWyyyyyyyyWWWW',
        'WWWWWWWWWWWWWWWW',
        'WWWWWWWWWWWWWWWW',
        'WWWWWWWWWWWWWWWW',
      ],
      entities: [
        { type: 'decor', art: 'wreck', x: 3, y: 4 },
        spot('shipwreckHatch', 8, 5, 'door', 'shipwreck'),
      ],
    },
  });

  VL.defineRegion('homeFields', { screens: ['0,0', '1,0'] });
  VL.defineRegion('beach', { screens: ['0,1', '1,1', '4,1', '5,1'], place: 'beach' });
  VL.defineRegion('shipwreck', { screens: ['5,2'], place: 'shipwreck' });
  VL.defineLock('beach', {
    ...VL.LOCKS.beach,
    reached: (state) => VL.regionVisited(state, 'beach'),
    place: { area: 'overworld', screen: '0,1' },
  });
})();
