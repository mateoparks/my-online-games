// The Whispering Woods: a maze of look-alike screens north of the east road,
// with the Hollow Oak (Dungeon 2) at its heart. VL.WOODS_ROUTE is the one way
// through, which the copied map shows; the wrong exits loop back.
(() => {
  const { rect } = VL.ART;

  VL.ART.addColors({
    woodsFloor: '#4f8f45',
    woodsFloorAlt: '#4b8a42',
    woodsFloorDark: '#3a7034',
    woodsFloorLight: '#68a653',
    forestDark: '#163f27',
    forest: '#21573a',
    forestLight: '#337544',
    forestShine: '#5a9b54',
  });

  VL.extendTileset('base', {
    f: { moss: true, art: 'moss' },
    F: { solid: true, tree: true, art: 'woodsTree', ground: 'moss' },
    // Solid ground under the Hollow Oak's roots.
    G: { solid: true, footprint: true, art: 'moss' },
    // The tree in the pass below the Hollow Oak that the copied map opens.
    J: { solid: true, tree: true, art: 'woodsTree', ground: 'moss', gate: 'woodsMapCopy' },
  });

  // Shady forest floor with tufts, the odd fern and a few red mushrooms; never
  // a mushroom under a tree, where its red would read as a hidden book.
  VL.ART.defineTileStyle('moss', {
    ground(ctx, cell) {
      const { x, y } = cell;
      rect(ctx, cell.seed(0) > 0.5 ? 'woodsFloor' : 'woodsFloorAlt', x, y, 16, 16);
      for (let i = 0; i < 4; i += 1) {
        const gx = Math.floor(cell.seed(i + 1) * 13);
        const gy = Math.floor(cell.seed(i + 9) * 13);
        rect(ctx, i % 2 ? 'woodsFloorDark' : 'woodsFloorLight', x + gx, y + gy, 1, 2);
        rect(ctx, 'woodsFloorDark', x + gx + 2, y + gy + 1, 1, 2);
      }
      if (cell.seed(20) > 0.86 && !cell.info?.tree) {
        const mx = x + 3 + Math.floor(cell.seed(21) * 9);
        const my = y + 4 + Math.floor(cell.seed(22) * 8);
        rect(ctx, 'white', mx + 1, my + 2, 1, 2);
        rect(ctx, 'heart', mx, my, 3, 2);
        rect(ctx, 'white', mx + 1, my, 1, 1);
      } else if (cell.seed(20) > 0.72) {
        const fx = x + 3 + Math.floor(cell.seed(23) * 9);
        const fy = y + 4 + Math.floor(cell.seed(24) * 8);
        rect(ctx, 'leaf', fx, fy + 2, 5, 1);
        rect(ctx, 'leafLight', fx + 1, fy + 1, 3, 1);
        rect(ctx, 'leaf', fx + 2, fy, 1, 4);
      }
    },
  });

  VL.ART.defineSprite('tile-woods-tree', {
    outline: false,
    colors: { d: 'forestDark', l: 'forest', m: 'forestLight', s: 'forestShine', k: 'bark' },
    rows: [
      '.......ll.......',
      '......lmml......',
      '.....lmmsld.....',
      '....lmmmmlld....',
      '...lmmsmmllld...',
      '....lmmmllld....',
      '...lmmmmmllld...',
      '..lmmsmmmlllld..',
      '.lmmmmmmllllldd.',
      '...lmmmmlllldd..',
      '..lmmmmlllllldd.',
      '.lmmmmllllllddd.',
      'dllllllllllldddd',
      '.dddddddddddddd.',
      '......kkkk......',
      '......kkkk......',
    ],
  });

  VL.ART.defineTileStyle('woodsTree', {
    under: 'moss',
    shadow: (ctx, cell) => rect(ctx, 'shadow', cell.x + 3, cell.y + 13, 14, 4),
    raised: (ctx, cell) => VL.ART.drawSprite(ctx, 'tile-woods-tree', cell.x, cell.y),
  });

  // The Hollow Oak, anchored at its root footprint's top-left (5 × 3 tiles):
  // a huge trunk with spreading roots, a dark hollow over the doorway tile
  // (x + 32..48, y + 32..48) and a canopy reaching up off the screen.
  VL.defineDecor('hollowOak', (ctx, x, y, t) => {
    rect(ctx, 'shadow', x + 2, y + 44, 78, 4);
    // canopy: overlapping round leaf clumps, lit from the top-left
    const blob = (cx, cy, r, name) => {
      for (let dy = -r; dy <= r; dy += 1) {
        const half = Math.round(Math.sqrt(r * r - dy * dy) * 1.25);
        rect(ctx, name, x + cx - half, y + cy + dy, half * 2, 1);
      }
    };
    const clumps = [[14, -6, 11], [34, -12, 13], [56, -7, 11], [70, 2, 8], [6, 4, 8], [40, 0, 10]];
    for (const [cx, cy, r] of clumps) blob(cx, cy, r + 1, 'forestDark');
    for (const [cx, cy, r] of clumps) blob(cx, cy, r, 'forest');
    for (const [cx, cy, r] of clumps) blob(cx - 3, cy - 3, Math.round(r / 2), 'forestLight');
    for (const [cx, cy] of clumps) rect(ctx, 'forestShine', x + cx - 5, y + cy - 6, 2, 1);
    // trunk
    rect(ctx, 'outline', x + 17, y + 4, 46, 44);
    rect(ctx, 'bark', x + 18, y + 5, 44, 43);
    for (let i = 0; i < 6; i += 1) rect(ctx, 'woodDark', x + 21 + i * 7, y + 8, 2, 38 - (i % 3) * 6);
    rect(ctx, 'wood', x + 19, y + 5, 3, 40);
    // roots
    for (const [rx, w] of [[2, 18], [62, 16]]) {
      rect(ctx, 'outline', x + rx, y + 38, w, 10);
      rect(ctx, 'bark', x + rx + 1, y + 39, w - 2, 8);
      rect(ctx, 'wood', x + rx + 1, y + 39, w - 2, 1);
    }
    // the hollow
    rect(ctx, 'outline', x + 30, y + 22, 20, 26);
    rect(ctx, 'doorway', x + 31, y + 23, 18, 25);
    rect(ctx, 'woodDark', x + 31, y + 23, 18, 2);
    // glowing moss at the roots, breathing slowly
    if (Math.sin(t * 1.6) > -0.3) {
      rect(ctx, 'shallowLight', x + 8, y + 46, 2, 1);
      rect(ctx, 'shallowLight', x + 70, y + 45, 2, 1);
    }
  });

  const spot = (id, x, y, how, by, lock = id) => ({ type: 'spot', id, x, y, how, by, lock });

  VL.addScreens('overworld', {
    // The way in from the east road.
    '5,-1': {
      tiles: [
        'FFFffFFFFFFFFFFF',
        'FFFfffFFFFFFFFFF',
        'FFFFfffFFFFFFFFF',
        'FFFFFffffFFFFFFF',
        'FFfFFFFFffffFFFF',
        'fffffFFFFFfffFFF',
        'FFFfFFFFfffffFFF',
        'FFFffffffFFFffff',
        'FFFFFFfFFFFfffff',
        'FFFFFffFFFFFFFFF',
        'FFFFFFffFFFFFFFF',
      ],
      entities: [
        { type: 'bat', x: 10, y: 5 },
        // Down from the highlands (its id kept for old saves).
        spot('bookHighShelfB', 2, 4, 'trunk', 'W11'),
      ],
    },
    // Two pockets that never meet: a dead end from the west (with a secret
    // ore lump) and the true path from the north out to the east.
    '6,-1': {
      tiles: [
        'FFFFFFFFFFffFFFF',
        'FFFFFFFFFfffFFFF',
        'FFFFFFFFFffFFFFF',
        'FFFFFFFFFfffffff',
        'FFFFFFFFFFFfffff',
        'FFFFFFFFFFFFFfFF',
        'FFFFFFFFFFFFFfFF',
        'fffffFFFFFFFFfFF',
        'ffffffFFFFFFFfFF',
        'FFFffffFFFFFFfFF',
        'FFFFFFFFFFFFFfFF',
      ],
      entities: [
        spot('oreWoods', 6, 9, 'pickup', 'W5'),
      ],
    },
    '7,-1': {
      tiles: [
        'FFFFFFFffFFFFFFF',
        'FFFFFFfffFFFFFFF',
        'FFFFFFFJFFFFFFFF',
        'fffFFffffFFFFFFF',
        'ffffffFFffFFFFFF',
        'FFFFFFFFfffFFFFF',
        'FFFFFFFFFFffFFFF',
        'FFFFFFFFFFFfFFFF',
        'FFFFFFFFFFFffFFF',
        'FFFFFFFFFFFfFFFF',
        'FFFFFFFFFFFfFFFF',
      ],
      entities: [
        { type: 'bat', x: 8, y: 4 },
        spot('bookWoods', 12, 8, 'trunk', 'W11'),
      ],
    },
    '5,-2': {
      tiles: [
        'FFFFFFFFFFFFFFFF',
        'FFFFFFFFFFFFFFFF',
        'FFFFfffFFFFFFFFF',
        'FFFffFfffFFFFFFF',
        'FFFfFFFFffffffff',
        'FFffFFFFFfffffff',
        'fffFFFFFFFFFFFFF',
        'FFffFFFFFFFFFFFF',
        'FFFffFFFFFFFFFFF',
        'FFFffFFFFFFFFFFF',
        'FFFffFFFFFFFFFFF',
      ],
      entities: [
        spot('bookHerbalist', 11, 5, 'trunk', 'W11'),
      ],
    },
    '6,-2': {
      tiles: [
        'FFFfFFFFfFFFFFFF',
        'FFFfFFFFffFFFFFF',
        'FFffFFFFFfFFFFFF',
        'FFfFFFFFffFFFFFF',
        'ffffffFffffFFFFF',
        'ffffffffFfffFFFF',
        'FFFFFFFFFFffFFFF',
        'FFFFFFFFFffFFFFF',
        'FFFFFFFFFfffFFFF',
        'FFFFFFFFFFffFFFF',
        'FFFFFFFFFFffFFFF',
      ],
      entities: [
        { type: 'bat', x: 4, y: 5 },
      ],
    },
    // The heart of the Woods: the Hollow Oak.
    '7,-2': {
      tiles: [
        'FFFFFFFFFFFFFFFF',
        'FFFFFGGGGGFFFFFF',
        'FFFFFGGGGGFFFFFF',
        'FFFffGGfGGffFFFF',
        'FFfQfffffffffFFF',
        'FFffffffffffffFF',
        'FFFfffffffffffFF',
        'FFFFfffffffffFFF',
        'FFFFFFfffffFFFFF',
        'FFFFFFFfffFFFFFF',
        'FFFFFFFffFFFFFFF',
      ],
      entities: [
        // Thorny ones, which only a metal sword beats.
        { type: 'spitter', x: 4, y: 7, tough: true },
        { type: 'spitter', x: 12, y: 6, tough: true },
        { type: 'decor', art: 'hollowOak', x: 5, y: 1 },
        spot('hollowOakDoor', 7, 3, 'door', 'W15', 'hollowOakEntered'),
        spot('bookWreckDeck', 10, 8, 'trunk', 'W11'),
      ],
    },
    // Wrong turns (VL.WOODS_WRONG_EXITS): look-alike screens that wind back
    // to where you came from.
    '4,-2': {
      tiles: [
        'GFFFFFFFFFFFFFFF',
        'GFFFFFFFFFFFFFFF',
        'FFFFFfffffFFFFFF',
        'FFFFffFFFffFFFFF',
        'FFFffFFFFFfffFFF',
        'FFFfFFFFFFFFffFF',
        'FFffFFFFFFFFFfff',
        'FFfFFFFFFFFFFFFF',
        'FFffFFFFFFFFFFFF',
        'FFFfFFFFFFFFFFFF',
        'FFFfFFFFFFFFFFFF',
      ],
      entities: [
        { type: 'bat', x: 6, y: 2 },
      ],
    },
    '4,-1': {
      tiles: [
        'FFFfFFFFFFFFFFFF',
        'FFFffFFFFFFFFFFF',
        'FFFFffFFFFFFFFFF',
        'FFFFFfFFFFFFFFFF',
        'FFFFFffFFFFFFFFF',
        'FFFFFFfFFFffffff',
        'FFFFFFfFFffFFFFF',
        'FFFFFFffffFFFFFF',
        'FFFFFFFFFFFFFFFF',
        'FFFFFFFFFFFFFFFF',
        'FFFFGGGGGGGGFFFF',
      ],
      entities: [],
    },
    '6,-3': {
      tiles: [
        'FFFFFFFFFFFFFFFF',
        'FFFFFFFFFFFFFFFF',
        'FFFFFfffffFFFFFF',
        'FFFFffFFFffFFFFF',
        'FFFffFFFFFfFFFFF',
        'FFFfFFFFFFffFFFF',
        'FFffFFFFFFFfFFFF',
        'FFfFFFFFFFffFFFF',
        'FFffFFFFFffFFFFF',
        'FFFfFFFFffFFFFFF',
        'FFFfFFFFfFFFFFFF',
      ],
      entities: [],
    },
    '7,0': {
      tiles: [
        'FFFFFFFFFFFfFFFF',
        'FFFFFFFFFFffFFFF',
        'FFFFFFFFFFfFFFFF',
        'FFFFFFFFFffFFFFF',
        'FFFFFFFFFfFFFFFF',
        'fffFFFFFFffFFFFF',
        'FFfFFFFFFFfFFFFF',
        'FFffFFFFfffFFFFF',
        'FFFffffffFFFFFFF',
        'FFFFFFFFFFFFFFFF',
        'FFFFFFFFFFFFFFFF',
      ],
      entities: [],
    },
    '6,0': {
      tiles: [
        'FFFFFFFFFFFFFfFF',
        'FFFFFFFFFFFFffFF',
        'FFFFFFFFFFFffFFF',
        'FFFFFFFfffffFFFF',
        'FFFFFFFfFFFFFFFF',
        'FFFFFFFfffFFFfff',
        'FFFFFFFFFffFFfFF',
        'FFFFFFFFFFfffffF',
        'FFFFFFFFFFFFFFFF',
        'FFFFFFFFFFFFFFFF',
        'FFFFFFFFFFFFFFFF',
      ],
      entities: [
        { type: 'bat', x: 8, y: 3 },
        // Down from the highlands (its id kept for old saves).
        spot('bookHighShelfA', 14, 7, 'trunk', 'W11'),
      ],
    },
  });

  VL.WOODS_ROUTE = ['5,-1', '5,-2', '6,-2', '6,-1', '7,-1', '7,-2'];
  // Each wrong exit leaves a route screen and winds back to `back`, never
  // further in; W15 decides what the copied map changes about them.
  VL.WOODS_WRONG_EXITS = [
    { from: '5,-2', side: 'west', back: '5,-1' },
    { from: '6,-2', side: 'north', back: '6,-2' },
    { from: '7,-1', side: 'south', back: '6,-1' },
  ];

  VL.defineRegion('woods', {
    screens: ['5,-1', '6,-1', '7,-1', '5,-2', '6,-2', '7,-2', '4,-2', '4,-1', '6,-3', '7,0', '6,0'],
    place: 'woodsPaths',
  });
  // W34: the maze's paths are open to all from the east road; its heart, the
  // Oak's clearing past the gate tree (systems/woods-map.js), is `woods`.
  VL.defineLock('woodsPaths', {
    type: 'place', needs: ['eastRoad'], doc: '§ The world: Whispering Woods',
    reached: (state) => VL.regionVisited(state, 'woods'),
  });
  // Walking into the maze is not the place; reaching its heart is.
  VL.defineLock('woods', {
    ...VL.LOCKS.woods,
    reached: (state) => Boolean(state.visited['overworld:7,-2']),
    place: { area: 'overworld', screen: '7,-2' },
  });
})();
