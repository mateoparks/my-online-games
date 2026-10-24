// The highlands above the cliff base: rocky shelves split by chasms that are
// four tiles across (a long chicken flight, W7/W19; a short one falls short),
// climbing to the Dragon's Lair (Dungeon 4).
(() => {
  const { rect } = VL.ART;

  VL.ART.addColors({
    chasm: '#232b36',
    chasmDeep: '#121820',
    scree: '#b9ae98',
    screeAlt: '#b4a993',
    screeDark: '#998e79',
    screeLight: '#d3c9b3',
    caveGlow: '#ff8a3a38',
    ember: '#ff9a4a',
  });

  VL.extendTileset('base', {
    V: { solid: true, chasm: true, flyOver: true, art: 'chasm' },
    ':': { scree: true, art: 'scree' },
    k: { solid: true, rock: true, art: 'rock', ground: 'scree' },
  });

  // Looking down into a chasm: the far wall shows on its north side, a lit
  // lip on the near (south) side, darkness in between.
  VL.ART.defineTileStyle('chasm', {
    ground(ctx, cell) {
      const { x, y } = cell;
      const open = (dx, dy) => {
        const other = cell.near(dx, dy);
        return other !== null && !other.chasm;
      };
      rect(ctx, 'chasmDeep', x, y, 16, 16);
      if (cell.seed(2) > 0.6) rect(ctx, 'chasm', x + Math.floor(cell.seed(3) * 12), y + 6 + Math.floor(cell.seed(4) * 8), 3, 1);
      if (open(0, -1)) {
        rect(ctx, 'cliffFace', x, y, 16, 4);
        rect(ctx, 'cliffFaceDark', x, y + 4, 16, 3);
        rect(ctx, 'chasm', x, y + 7, 16, 2);
        rect(ctx, 'cliffFaceLight', x + Math.floor(cell.seed(5) * 12), y + 1, 3, 1);
      }
      if (open(0, 1)) {
        rect(ctx, 'cliffEdge', x, y + 13, 16, 1);
        rect(ctx, 'cliffTopLight', x, y + 14, 16, 2);
      }
      if (open(-1, 0)) rect(ctx, 'cliffFaceDark', x, y, 2, 16);
      if (open(1, 0)) rect(ctx, 'cliffFaceDark', x + 14, y, 2, 16);
    },
  });

  VL.ART.defineTileStyle('scree', {
    ground(ctx, cell) {
      const { x, y } = cell;
      rect(ctx, cell.seed(0) > 0.5 ? 'scree' : 'screeAlt', x, y, 16, 16);
      for (let i = 0; i < 5; i += 1) {
        const px = x + Math.floor(cell.seed(i + 1) * 14);
        const py = y + Math.floor(cell.seed(i + 7) * 14);
        rect(ctx, 'screeDark', px, py + 1, 2, 1);
        rect(ctx, 'screeLight', px, py, 2, 1);
      }
      if (cell.seed(30) > 0.7) {
        const tx = x + 2 + Math.floor(cell.seed(31) * 11);
        const ty = y + 2 + Math.floor(cell.seed(32) * 11);
        rect(ctx, 'grassDark', tx, ty, 1, 2);
        rect(ctx, 'grass', tx + 1, ty - 1, 1, 3);
        rect(ctx, 'grassDark', tx + 2, ty, 1, 2);
      }
    },
  });

  // The lair's mouth, anchored one tile up-left of the entrance tile (3 × 2
  // tiles): a jagged arch with a warm glow breathing inside and a few coins
  // from the hoard glinting on the threshold.
  VL.defineDecor('lairCave', (ctx, x, y, t) => {
    rect(ctx, 'outline', x + 9, y + 5, 30, 27);
    rect(ctx, 'cliffEdge', x + 10, y + 6, 28, 26);
    rect(ctx, 'ink', x + 14, y + 10, 20, 22);
    rect(ctx, 'cliffEdge', x + 14, y + 10, 3, 3);
    rect(ctx, 'cliffEdge', x + 31, y + 10, 3, 4);
    for (let i = 0; i < 5; i += 1) rect(ctx, 'cliffFaceDark', x + 12 + i * 6, y + 3 + (i % 2) * 2, 4, 4);
    if (Math.sin(t * 1.1) > -0.2) rect(ctx, 'caveGlow', x + 15, y + 16, 18, 16);
    rect(ctx, 'ember', x + 23, y + 27, 2, 1);
    rect(ctx, 'gold', x + 18, y + 30, 2, 1);
    rect(ctx, 'goldLight', x + 28, y + 29, 1, 1);
    rect(ctx, 'gold', x + 30, y + 31, 2, 1);
    VL.ART.drawSparkle(ctx, x + 19, y + 29, t);
  });

  const spot = (id, x, y, how, by, lock = id) => ({ type: 'spot', id, x, y, how, by, lock });

  VL.addScreens('overworld', {
    // Where a chicken from the ledge below sets you down.
    '-1,-3': {
      tiles: [
        'CCCCCCCCCCCCCCCC',
        'CCCCCCCCCCCCCCCC',
        'CC:::::::::CCCCC',
        ':::k::::::::CCCC',
        ':::::::::::::CCC',
        '::::::::::::::CC',
        'CC:::::k:::::::C',
        'CCC::::::::::::C',
        'CCCC::::::::::CC',
        'CVVVV::::::VVVVC',
        'CVVVVVVVVVVVVVVC',
      ],
      entities: [
        spot('chickenHighlands', 6, 5, 'chicken', 'W7', null),
      ],
    },
    '-2,-3': {
      tiles: [
        'CCCC::CCCCCCCCCC',
        'CCC::::CCCCCCCCC',
        'CC::::::CCCCCCCC',
        'CC::::::::::::::',
        'CC::k:::::::::::',
        'CCC:::::::::::::',
        'CCCC:::::::::CCC',
        'CCCCC:::::::CCCC',
        'CCCCCCC::k:CCCCC',
        'CCCCCCCCCCCCCCCC',
        'CCCCCCCCCCCCCCCC',
      ],
      entities: [
        spot('bookHighlands', 9, 8, 'rock', 'W14'),
      ],
    },
    // A chasm to the east: the next shelf is a long flight away.
    '-2,-4': {
      tiles: [
        'CCCCCCCCCCCCCVVV',
        'CCCCCCCCCCCCCVVV',
        'CC:::::::::::VVV',
        'C::::::::::::VVV',
        'C:k::::::::::VVV',
        'C::::::::::::VVV',
        'CC::::::::::CVVV',
        'CCC:::::k:::CVVV',
        'CCCC::::::CCCVVV',
        'CCCC::::CCCCCVVV',
        'CCCC::CCCCCCCVVV',
      ],
      entities: [
        spot('chickenGap', 11, 4, 'chicken', 'W7', null),
      ],
    },
    '-1,-4': {
      tiles: [
        'VCCCCC::CCCCCCCC',
        'VCCCC:::CCCCCCCC',
        'V:::::::::CCCCCC',
        'V:::::::::::CCCC',
        'V::k:::::::::CCC',
        'V:::::::::::::CC',
        'V:::::::::k:::CC',
        'VC:::::::::::CCC',
        'VCC::::::::CCCCC',
        'VCCCC:::CCCCCCCC',
        'VCCCCCCCCCCCCCCC',
      ],
      // The way back west over the chasm (W7 keeps a chicken here).
      entities: [
        spot('chickenLair', 2, 5, 'chicken', 'W7', null),
      ],
    },
    // The Dragon's Lair.
    '-1,-5': {
      tiles: [
        'CCCCCCCCCCCCCCCC',
        'CCCCCCCCCCCCCCCC',
        'CCCCCCCCCCCCCCCC',
        'CCCCCCCCCCCCCCCC',
        'CCCCCCC:CCCCCCCC',
        'CC:::::::::::CCC',
        'C:::k::::::::::C',
        'C::::::::::k:::C',
        'CC:::::::::::::C',
        'CCC::::::::::CCC',
        'CCCCCC::CCCCCCCC',
      ],
      entities: [
        { type: 'decor', art: 'lairCave', x: 6, y: 3 },
        spot('lairDoor', 7, 4, 'door', 'W19', 'dragonsLairEntered'),
      ],
    },
  });

  VL.defineRegion('highlands', { screens: ['-1,-3', '-2,-3', '-2,-4', '-1,-4', '-1,-5'], place: 'highlands' });
})();
