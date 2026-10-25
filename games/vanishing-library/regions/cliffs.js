// The cliffs west of town: the cliff road, the lighthouse on its headland
// (Dungeon 3, dark until the Glowstone), and the cliff base where the
// Climber's Almanac's hidden path climbs to a ledge over the highland chasm.
(() => {
  const { rect } = VL.ART;

  VL.ART.addColors({
    cliffTop: '#857a68',
    cliffTopLight: '#a09580',
    cliffFace: '#7b6f5e',
    cliffFaceDark: '#5a5045',
    cliffFaceLight: '#958873',
    cliffEdge: '#3a332b',
    lampGlow: '#ffe9a050',
  });

  VL.extendTileset('base', {
    C: { solid: true, cliff: true, art: 'cliff' },
    // Looks like cliff; W19 opens it once the Almanac is bound.
    h: { solid: true, cliff: true, gate: 'climbersAlmanac', art: 'hiddenPath' },
  });

  const cliffy = (info) => Boolean(info?.cliff);

  // A block of cliff tiles reads as a rocky plateau with a lit rim on top and
  // a banded face on the south side, the way a top-down cliff is seen.
  VL.ART.defineTileStyle('cliff', {
    ground(ctx, cell) {
      const { x, y } = cell;
      const above = cell.near(0, -1);
      const below = cell.near(0, 1);
      const face = below !== null && !cliffy(below);
      if (face) {
        rect(ctx, 'cliffFace', x, y, 16, 16);
        for (let band = 0; band < 4; band += 1) {
          const by = y + 1 + band * 4;
          rect(ctx, 'cliffFaceDark', x, by + 2, 16, 1);
          const cx = x + Math.floor(cell.seed(band) * 13);
          rect(ctx, 'cliffFaceLight', cx, by, 3, 1);
          rect(ctx, 'cliffFaceDark', cx + Math.floor(cell.seed(band + 4) * 3), by + 3, 1, 2);
        }
        rect(ctx, 'cliffEdge', x, y + 15, 16, 1);
      } else {
        rect(ctx, 'cliffTop', x, y, 16, 16);
        for (let i = 0; i < 4; i += 1) {
          const px = x + Math.floor(cell.seed(i + 8) * 14);
          const py = y + Math.floor(cell.seed(i + 12) * 14);
          rect(ctx, i % 2 ? 'cliffFace' : 'cliffTopLight', px, py, 2, 1);
        }
      }
      if (above !== null && !cliffy(above)) {
        rect(ctx, 'cliffEdge', x, y, 16, 1);
        rect(ctx, 'cliffTopLight', x, y + 1, 16, 2);
      }
      const left = cell.near(-1, 0);
      const right = cell.near(1, 0);
      if (left !== null && !cliffy(left)) {
        rect(ctx, 'cliffEdge', x, y, 1, 16);
        rect(ctx, 'cliffTopLight', x + 1, y, 1, 16);
      }
      if (right !== null && !cliffy(right)) {
        rect(ctx, 'cliffFaceDark', x + 14, y, 1, 16);
        rect(ctx, 'cliffEdge', x + 15, y, 1, 16);
      }
    },
    shadow(ctx, cell) {
      const below = cell.near(0, 1);
      if (below !== null && !cliffy(below)) rect(ctx, 'shadow', cell.x, cell.y + 16, 16, 4);
    },
  });

  // The hidden path: cliff with a thread of vine and a few handholds, easy to
  // miss until the Almanac tells you where to look.
  VL.ART.defineTileStyle('hiddenPath', {
    ground(ctx, cell, t) {
      VL.ART.TILE_STYLES.cliff.ground(ctx, cell, t);
      const { x, y } = cell;
      for (let i = 0; i < 6; i += 1) rect(ctx, i % 2 ? 'leafDark' : 'leaf', x + 6 + (i % 3), y + 1 + i * 2 + (i > 2 ? 2 : 0), 1, 2);
      rect(ctx, 'cliffFaceLight', x + 4, y + 5, 2, 1);
      rect(ctx, 'cliffFaceLight', x + 10, y + 11, 2, 1);
    },
    shadow: (ctx, cell, t) => VL.ART.TILE_STYLES.cliff.shadow(ctx, cell, t),
  });

  // The lighthouse, anchored at its footprint's top-left (3 × 3 tiles): a
  // tapering red-and-white tower, gallery, a lamp that pulses, and a dark
  // doorway over the door tile (x + 16..32, y + 32..48).
  VL.defineDecor('lighthouse', (ctx, x, y, t) => {
    rect(ctx, 'shadow', x + 6, y + 46, 42, 3);
    const top = y - 6;
    const bottom = y + 46;
    for (let yy = top; yy < bottom; yy += 1) {
      const w = 26 + Math.round(((yy - top) / (bottom - top)) * 12);
      const left = x + 24 - Math.floor(w / 2);
      const red = Math.floor((yy - top) / 13) % 2 === 1;
      rect(ctx, 'outline', left - 1, yy, w + 2, 1);
      rect(ctx, red ? 'heart' : 'white', left, yy, w, 1);
      rect(ctx, red ? 'roofDark' : 'plasterShade', left + w - 5, yy, 5, 1);
      rect(ctx, red ? 'heartLight' : 'white', left + 2, yy, 2, 1);
    }
    for (const wy of [4, 20]) {
      rect(ctx, 'ink', x + 22, y + wy, 4, 6);
      rect(ctx, 'shallowLight', x + 22, y + wy, 1, 2);
    }
    rect(ctx, 'outline', x + 17, y + 31, 14, 17);
    rect(ctx, 'doorway', x + 18, y + 32, 12, 16);
    rect(ctx, 'outline', x + 5, y - 10, 38, 5);
    rect(ctx, 'woodDark', x + 6, y - 9, 36, 3);
    for (let post = 8; post < 42; post += 5) rect(ctx, 'outline', x + post, y - 13, 1, 4);
    rect(ctx, 'outline', x + 5, y - 14, 38, 1);
    rect(ctx, 'outline', x + 13, y - 22, 22, 13);
    rect(ctx, 'shallowLight', x + 14, y - 21, 20, 11);
    const bright = Math.sin(t * 2.4) > 0;
    rect(ctx, bright ? 'goldLight' : 'gold', x + 19, y - 19, 10, 7);
    rect(ctx, 'outline', x + 12, y - 28, 24, 7);
    rect(ctx, 'roofDark', x + 13, y - 27, 22, 5);
    rect(ctx, 'roof', x + 14, y - 27, 10, 2);
    rect(ctx, 'outline', x + 23, y - 31, 2, 4);
    if (bright) rect(ctx, 'lampGlow', x + 4, y - 26, 40, 22);
  });

  const spot = (id, x, y, how, by, lock = id) => ({ type: 'spot', id, x, y, how, by, lock });

  VL.addScreens('overworld', {
    // The cliff road leaving town to the west.
    '1,-1': {
      tiles: [
        'CCCCCCCCCCCCCCCC',
        'CCCCCCCCCCCCCCCC',
        'CCCC..CCCCC...CC',
        'T........CC....T',
        'T..,.........R.T',
        '..........PPPPPP',
        'PPPPPPPPPPP.....',
        'T....B.......,.T',
        'T..R......B....T',
        'TT.....,......TT',
        'TTTTTTTTTTTTTTTT',
      ],
      entities: [
        { type: 'gull', x: 7, y: 4 },
        spot('bookCliffRoad', 5, 7, 'bush', 'W11'),
      ],
    },
    // A heart container on the ledge up the gap in the rocks.
    '0,-1': {
      tiles: [
        'CCCCCCCCCCCCCCCC',
        'C...CCCCCCCCCCCC',
        'C...CC....,.CCCC',
        'CCC.CC.........T',
        'T.........B....T',
        '................',
        'PPPPPPPPPPPPPPPP',
        'T.....,........T',
        'T..B...........T',
        'TT..........R.TT',
        'TTTTTTTTTTTTTTTT',
      ],
      entities: [
        { type: 'gull', x: 8, y: 4 },
        spot('heartFieldB', 1, 1, 'pickup', 'W6'),
        spot('lostChicken', 13, 8, 'chicken', 'W7'),
      ],
    },
    '-1,-1': {
      tiles: [
        'TTTTT.PTTTTTTTTC',
        'T.....P........C',
        'T..B..P.......CC',
        'T.....P..R....CC',
        'T,....P........C',
        'T.....PPPPPPPPP.',
        'T.....P........P',
        'T.....P.....,..T',
        'T..,..P........T',
        'TT....P....B..TT',
        'TTTTT.PTTTTTTTTT',
      ],
      entities: [
        { type: 'gull', x: 10, y: 7 },
      ],
    },
    // Down towards the sea cliffs.
    '-1,0': {
      tiles: [
        'TTTTT.PTTTTTTTTT',
        'T.....P........T',
        'T..,..P.....B..T',
        'C.....P........T',
        'CC....P.....,..T',
        'CC....P..R.....T',
        'C.....P........T',
        'C.....PP.......T',
        'CC.....PPPP....T',
        'CCC.......P....T',
        'CCCCCCCCCC.PCCCx',
      ],
      entities: [
        { type: 'gull', x: 11, y: 4 },
      ],
    },
    // The lighthouse headland.
    '-1,1': {
      tiles: [
        'CTTTTTTTTT.PTTTT',
        'C.....xxx.PP...C',
        'C.....xxxPP....C',
        'C.,...xxxP..,..C',
        'C.....xPxP.....C',
        'CC.....PPP....CC',
        'CC...........CCC',
        'CCC.,......CCCCC',
        'CCCCCCCCCCCCCCCC',
        'WWWWWWWWWWWWWWWC',
        'WWWWWWWWWWWWWWWC',
      ],
      entities: [
        { type: 'gull', x: 3, y: 6 },
        { type: 'decor', art: 'lighthouse', x: 6, y: 2 },
        spot('lighthouseDoor', 7, 4, 'door', 'W18', 'lighthouseEntered'),
        spot('bookLighthouse', 2, 3, 'trunk', 'W11'),
      ],
    },
    // The cliff base. The trail ends at the hidden path; above it a ledge,
    // and a chasm only a long chicken flight crosses.
    '-1,-2': {
      tiles: [
        'CVVVVVVVVVVVVVVC',
        'CVVVVVVVVVVVVVVC',
        'CVVVVVVVVVVVVVVC',
        'CCCCC::::::CCCCC',
        'CCCCCCCCCChCCCCC',
        'CCCCCCCCCChCCCCC',
        'T.,....PPPP.B..T',
        'T......P.......T',
        'T..B..PP....,..T',
        'T.....P........T',
        'TTTTT.PTTTTTTTTC',
      ],
      entities: [
        { type: 'gull', x: 12, y: 8 },
        spot('chickenLedge', 7, 3, 'chicken', 'W7', null),
        spot('bookCliffLedge', 5, 3, 'trunk', 'W11'),
      ],
    },
  });

  VL.defineRegion('cliffs', { screens: ['1,-1', '0,-1', '-1,-1', '-1,0', '-1,1', '-1,-2'], place: 'cliffs' });
  VL.defineLock('cliffs', {
    ...VL.LOCKS.cliffs,
    reached: (state) => VL.regionVisited(state, 'cliffs'),
    place: { area: 'overworld', screen: '1,-1' },
  });
})();
