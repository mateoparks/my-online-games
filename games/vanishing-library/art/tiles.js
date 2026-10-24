// Tile styles for the base tileset: grass, flowers, sand, path, shallow and
// deep water with shore foam, trees, bushes, berry bushes, rocks, fences, the
// hut's walls and door, and interior walls and floors. Regions add their own
// styles the same way from their own files (README "Art kit").
(() => {
  const { rect, color } = VL.ART;

  const grassy = (info) => Boolean(info) && VL.ART.groundOf(info).name === 'grass';
  const SIDES = [['n', 0, -1], ['e', 1, 0], ['s', 0, 1], ['w', -1, 0]];

  // A ragged band `depth` px into the tile along one side, in `name`.
  function band(ctx, cell, side, name, depth, jitter, salt) {
    ctx.fillStyle = color(name);
    for (let i = 0; i < 16; i += 1) {
      const d = depth + Math.floor(VL.ART.hash(cell.wx * 16 + i, cell.wy * 16 + i, salt) * (jitter + 1));
      if (side === 'n') ctx.fillRect(cell.x + i, cell.y, 1, d);
      if (side === 's') ctx.fillRect(cell.x + i, cell.y + 16 - d, 1, d);
      if (side === 'w') ctx.fillRect(cell.x, cell.y + i, d, 1);
      if (side === 'e') ctx.fillRect(cell.x + 16 - d, cell.y + i, d, 1);
    }
  }

  // Foam where water meets land; it breathes a pixel in and out.
  function foam(ctx, cell, t) {
    const edges = VL.ART.wetEdges(cell);
    const surge = Math.sin(t * 2.2 + (cell.wx + cell.wy) * 0.9) > 0.3 ? 1 : 0;
    for (const [side] of SIDES) {
      if (!edges[side]) continue;
      band(ctx, cell, side, 'foamDark', 3 + surge, 0, 3);
      band(ctx, cell, side, 'foam', 1 + surge, 1, 4);
    }
  }

  function ripples(ctx, cell, t, name, count, speed) {
    ctx.fillStyle = color(name);
    for (let i = 0; i < count; i += 1) {
      const yy = Math.floor(cell.seed(i) * 14) + 1;
      const xx = Math.floor((cell.seed(i + 5) * 16 + t * speed) % 16);
      ctx.fillRect(cell.x + xx, cell.y + yy, Math.min(4, 16 - xx), 1);
    }
  }

  VL.ART.defineTileStyle('grass', {
    when: 'grass',
    priority: 10,
    ground(ctx, cell) {
      rect(ctx, cell.seed(0) > 0.5 ? 'grass' : 'grassAlt', cell.x, cell.y, 16, 16);
      for (let i = 0; i < 3; i += 1) {
        ctx.fillStyle = color(i ? 'grassDark' : 'grassLight');
        const gx = Math.floor(cell.seed(i + 1) * 13);
        const gy = Math.floor(cell.seed(i + 9) * 13);
        ctx.fillRect(cell.x + gx, cell.y + gy, 1, 2);
        ctx.fillRect(cell.x + gx + 2, cell.y + gy + 1, 1, 2);
      }
    },
  });

  VL.ART.defineTileStyle('flowers', {
    when: 'flowers',
    priority: 40,
    under: 'grass',
    ground(ctx, cell, t) {
      const sway = Math.sin(t * 1.5 + cell.wx) > 0.85 ? 1 : 0;
      [[4, 5, 'flowerPink'], [10, 9, 'flowerYellow'], [6, 11, 'flowerWhite']].forEach(([fx, fy, name], i) => {
        const x = cell.x + fx + (i === 1 ? sway : 0);
        const y = cell.y + fy;
        rect(ctx, 'grassDark', x, y + 2, 1, 2);
        ctx.fillStyle = color(name);
        ctx.fillRect(x - 1, y, 3, 1);
        ctx.fillRect(x, y - 1, 1, 3);
        rect(ctx, 'gold', x, y, 1, 1);
      });
    },
  });

  VL.ART.defineTileStyle('sand', {
    when: 'sand',
    priority: 30,
    ground(ctx, cell) {
      rect(ctx, 'sand', cell.x, cell.y, 16, 16);
      for (let i = 0; i < 4; i += 1) {
        rect(ctx, 'sandDark', cell.x + Math.floor(cell.seed(i) * 15), cell.y + Math.floor(cell.seed(i + 3) * 15), 2, 1);
      }
      for (let i = 0; i < 3; i += 1) {
        rect(ctx, 'sandLight', cell.x + Math.floor(cell.seed(i + 7) * 15), cell.y + Math.floor(cell.seed(i + 11) * 15), 1, 1);
      }
      for (const [side, dx, dy] of SIDES) {
        const other = cell.near(dx, dy);
        if (VL.ART.isWet(other)) band(ctx, cell, side, 'sandWet', 2, 1, 5);
        else if (grassy(other)) {
          band(ctx, cell, side, 'grassDark', 2, 2, 6);
          band(ctx, cell, side, 'grass', 1, 2, 6);
        }
      }
    },
  });

  VL.ART.defineTileStyle('path', {
    when: 'path',
    priority: 30,
    ground(ctx, cell) {
      rect(ctx, 'path', cell.x, cell.y, 16, 16);
      for (let i = 0; i < 4; i += 1) {
        rect(ctx, 'pathDark', cell.x + Math.floor(cell.seed(i) * 14), cell.y + Math.floor(cell.seed(i + 3) * 14), 2, 1);
      }
      for (let i = 0; i < 3; i += 1) {
        rect(ctx, 'pathLight', cell.x + Math.floor(cell.seed(i + 7) * 14), cell.y + Math.floor(cell.seed(i + 11) * 14), 1, 1);
      }
    },
  });

  VL.ART.defineTileStyle('water', {
    when: 'water',
    priority: 50,
    ground(ctx, cell, t) {
      rect(ctx, (cell.wx + cell.wy) % 2 ? 'waterAlt' : 'water', cell.x, cell.y, 16, 16);
      for (const [side, dx, dy] of SIDES) {
        if (cell.near(dx, dy)?.shallow) band(ctx, cell, side, 'waterLight', 1, 1, 8);
      }
      ripples(ctx, cell, t, 'waterLight', 2, 6);
      foam(ctx, cell, t);
    },
  });

  VL.ART.defineTileStyle('shallow', {
    when: 'shallow',
    priority: 50,
    ground(ctx, cell, t) {
      rect(ctx, 'shallow', cell.x, cell.y, 16, 16);
      for (let i = 0; i < 3; i += 1) {
        rect(ctx, 'sandWet', cell.x + Math.floor(cell.seed(i + 20) * 15), cell.y + Math.floor(cell.seed(i + 23) * 15), 2, 1);
      }
      ripples(ctx, cell, t, 'shallowLight', 2, 4);
      foam(ctx, cell, t);
    },
  });

  // Big round things sit on grass and cast a shadow down-right, like the mockup.
  function prop(name, when, priority, sprite, drop, shadow) {
    VL.ART.defineTileStyle(name, {
      when,
      priority,
      under: 'grass',
      shadow(ctx, cell) {
        rect(ctx, 'shadow', cell.x + shadow[0], cell.y + shadow[1], shadow[2], shadow[3]);
      },
      raised(ctx, cell) {
        VL.ART.drawSprite(ctx, sprite, cell.x, cell.y + drop);
      },
    });
  }

  VL.ART.defineSprite('tile-tree', {
    outline: false,
    colors: { d: 'leafDark', l: 'leaf', m: 'leafLight', s: 'leafShine', k: 'bark' },
    rows: [
      '......llldd.....',
      '....lmmmllldd...',
      '...lmmmmmllldd..',
      '..lmmssmmmllldd.',
      '..lmmmmmmmllldd.',
      '.llmmmmmmmlllldd',
      '.lllmmmmmslllldd',
      '.llllmmmlllllldd',
      '.dlllllllllllddd',
      '.dlllllllllllddd',
      '..dlllllllllddd.',
      '..ddllllllldddd.',
      '...dddlllddddd..',
      '....ddddddddd...',
      '......kkkk......',
      '......kkkk......',
    ],
  });

  VL.ART.defineSprite('tile-bush', {
    outline: false,
    colors: { d: 'bushDark', l: 'bush', s: 'bushShine' },
    rows: [
      '......llld......',
      '....llllllld....',
      '...llllllllld...',
      '...llssllllldd..',
      '..llllllllllld..',
      '..llllllllllldd.',
      '..lllllllsslldd.',
      '..dlllslllllddd.',
      '...llllllllldd..',
      '...dlllllllddd..',
      '....ddllldddd...',
      '.....ddddddd....',
      '.......ddd......',
    ],
  });

  VL.ART.defineSprite('tile-berry-bush', {
    outline: false,
    colors: { d: 'bushDark', l: 'bush', s: 'bushShine', b: 'berry', r: 'berryLight' },
    rows: [
      '......llld......',
      '....llllrbld....',
      '...llllllbbld...',
      '...llssllllldd..',
      '..lrbllllllld...',
      '..lbbllllllrbd..',
      '..lllllllssbbd..',
      '..dlllslllllddd.',
      '...llllrbllldd..',
      '...dlllbbllddd..',
      '....ddllldddd...',
      '.....ddddddd....',
      '.......ddd......',
    ],
  });

  VL.ART.defineSprite('tile-rock', {
    outline: false,
    colors: { d: 'rockDark', l: 'rock', m: 'rockLight', s: 'rockShade' },
    rows: [
      '......llld......',
      '....llllllld....',
      '...llmmmlllld...',
      '...lmmmmmllldd..',
      '..llmmmmmlllld..',
      '..llmmmmmlllldd.',
      '..lllmmmlsssldd.',
      '..dlllllllllddd.',
      '...llllllllldd..',
      '...dlllllllddd..',
      '....ddllldddd...',
      '.....ddddddd....',
      '.......ddd......',
    ],
  });

  prop('tree', 'tree', 70, 'tile-tree', 0, [3, 13, 14, 4]);
  // Bush and rock sprites are 13 rows, drawn 3px down so they sit on the tile.
  prop('bush', 'bush', 70, 'tile-bush', 3, [2, 12, 13, 3]);
  prop('berry', 'berry', 80, 'tile-berry-bush', 3, [2, 12, 13, 3]);
  prop('rock', 'rock', 70, 'tile-rock', 3, [2, 12, 13, 3]);
  VL.ART.defineTileStyle('fence', {
    when: 'fence',
    priority: 70,
    under: 'grass',
    shadow: (ctx, cell) => rect(ctx, 'shadow', cell.x + 5, cell.y + 13, 7, 2),
    raised(ctx, cell) {
      const { x, y } = cell;
      for (const [dx, from] of [[-1, 0], [1, 9]]) {
        if (!cell.near(dx, 0)?.fence) continue;
        rect(ctx, 'woodDark', x + from, y + 5, 7, 3);
        rect(ctx, 'wood', x + from, y + 5, 7, 1);
        rect(ctx, 'woodDark', x + from, y + 10, 7, 3);
        rect(ctx, 'wood', x + from, y + 10, 7, 1);
      }
      if (cell.near(0, -1)?.fence) rect(ctx, 'woodDark', x + 7, y, 2, 3);
      if (cell.near(0, 1)?.fence) rect(ctx, 'woodDark', x + 7, y + 15, 2, 1);
      rect(ctx, 'outline', x + 5, y + 2, 6, 13);
      rect(ctx, 'wood', x + 6, y + 3, 4, 11);
      rect(ctx, 'woodLight', x + 6, y + 3, 1, 10);
      rect(ctx, 'woodDark', x + 6, y + 13, 4, 1);
    },
  });

  // The hut: roof tiles above, a plaster facade with beams on the bottom row.
  const isBuilding = (info) => Boolean(info && !info.interior && (info.wall || (info.door && !info.floor)));

  function roof(ctx, cell) {
    const { x, y } = cell;
    rect(ctx, 'roof', x, y, 16, 16);
    for (let row = 0; row < 4; row += 1) {
      rect(ctx, 'roofDark', x, y + row * 4 + 3, 16, 1);
      const shift = (row + cell.wy * 4) % 2 ? 0 : 4;
      for (let seam = shift; seam < 16; seam += 8) rect(ctx, 'roofDark', x + seam, y + row * 4, 1, 3);
      rect(ctx, 'roofLight', x + ((shift + 2) % 8), y + row * 4, 2, 1);
    }
    if (!isBuilding(cell.near(0, -1))) {
      rect(ctx, 'outline', x, y, 16, 1);
      rect(ctx, 'roofLight', x, y + 1, 16, 2);
    }
    if (!isBuilding(cell.near(-1, 0))) rect(ctx, 'outline', x, y, 1, 16);
    if (!isBuilding(cell.near(1, 0))) rect(ctx, 'outline', x + 15, y, 1, 16);
  }

  function facade(ctx, cell) {
    const { x, y } = cell;
    rect(ctx, 'plaster', x, y, 16, 16);
    rect(ctx, 'plasterShade', x, y + 3, 16, 2);
    rect(ctx, 'roofDark', x, y, 16, 3);
    rect(ctx, 'outline', x, y + 3, 16, 1);
    rect(ctx, 'woodDark', x, y + 14, 16, 2);
    if (!isBuilding(cell.near(-1, 0))) {
      rect(ctx, 'woodDark', x, y + 3, 2, 13);
      rect(ctx, 'outline', x, y, 1, 16);
    }
    if (!isBuilding(cell.near(1, 0))) {
      rect(ctx, 'woodDark', x + 14, y + 3, 2, 13);
      rect(ctx, 'outline', x + 15, y, 1, 16);
    }
  }

  function hutWindow(ctx, x, y) {
    rect(ctx, 'woodDark', x + 4, y + 6, 8, 7);
    rect(ctx, 'water', x + 5, y + 7, 6, 5);
    rect(ctx, 'foam', x + 5, y + 7, 2, 1);
    rect(ctx, 'woodDark', x + 7, y + 7, 1, 5);
    rect(ctx, 'woodDark', x + 5, y + 9, 6, 1);
    rect(ctx, 'woodLight', x + 3, y + 13, 10, 1);
  }

  VL.ART.defineTileStyle('wall', {
    when: 'wall',
    priority: 60,
    ground(ctx, cell) {
      if (isBuilding(cell.near(0, 1))) {
        roof(ctx, cell);
      } else {
        facade(ctx, cell);
        if (isBuilding(cell.near(-1, 0)) && isBuilding(cell.near(1, 0)) && cell.seed(3) > 0.3) hutWindow(ctx, cell.x, cell.y);
      }
    },
    shadow(ctx, cell) {
      if (!isBuilding(cell.near(0, 1))) rect(ctx, 'shadow', cell.x, cell.y + 16, 16, 3);
    },
  });

  VL.ART.defineTileStyle('wallInside', {
    when: 'interior',
    priority: 65,
    ground(ctx, cell) {
      const { x, y } = cell;
      rect(ctx, 'wallInsideDark', x, y, 16, 16);
      if (cell.near(0, 1)?.floor) {
        rect(ctx, 'wallInside', x, y + 4, 16, 12);
        for (let seam = (cell.wx % 2) * 4 + 2; seam < 16; seam += 8) rect(ctx, 'wallInsideDark', x + seam, y + 4, 1, 10);
        rect(ctx, 'wallInsideLight', x, y + 4, 16, 1);
        rect(ctx, 'outline', x, y + 14, 16, 2);
      }
    },
  });

  VL.ART.defineTileStyle('floor', {
    when: 'floor',
    priority: 50,
    ground(ctx, cell) {
      const { x, y } = cell;
      rect(ctx, 'floor', x, y, 16, 16);
      for (let row = 0; row < 4; row += 1) {
        rect(ctx, 'floorDark', x, y + row * 4 + 3, 16, 1);
        rect(ctx, 'floorDark', x + Math.floor(cell.seed(row) * 14) + 1, y + row * 4, 1, 3);
        rect(ctx, 'floorLight', x + Math.floor(cell.seed(row + 4) * 12) + 2, y + row * 4 + 1, 3, 1);
      }
      if (cell.near(0, -1)?.interior) rect(ctx, 'shadow', x, y, 16, 3);
    },
  });

  // A door in the hut's facade, or (on a floor) the mat inside the door.
  VL.ART.defineTileStyle('door', {
    when: 'door',
    priority: 90,
    ground(ctx, cell, t) {
      const { x, y } = cell;
      if (cell.info.floor) {
        VL.ART.TILE_STYLES.floor.ground(ctx, cell, t);
        rect(ctx, 'outline', x + 1, y + 3, 14, 11);
        rect(ctx, 'rug', x + 2, y + 4, 12, 9);
        rect(ctx, 'rugLight', x + 3, y + 5, 10, 1);
        rect(ctx, 'rugLight', x + 3, y + 11, 10, 1);
        return;
      }
      facade(ctx, cell);
      rect(ctx, 'outline', x + 3, y + 5, 10, 11);
      rect(ctx, 'woodDark', x + 4, y + 6, 8, 10);
      rect(ctx, 'doorway', x + 5, y + 7, 6, 9);
      rect(ctx, 'woodLight', x + 4, y + 6, 8, 1);
    },
    shadow(ctx, cell) {
      if (!cell.info.floor) rect(ctx, 'shadow', cell.x, cell.y + 16, 16, 3);
    },
  });
})();
