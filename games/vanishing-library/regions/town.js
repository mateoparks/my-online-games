// Town: the library, shop, paper mill on the river, bindery, blacksmith and
// the puppet stage with its trapdoor, plus the harbour and the Old
// Scriptorium's grounds just north. Building doors are spots that W10/W11 fill.
(() => {
  const { rect } = VL.ART;

  VL.ART.addColors({
    curtain: '#7a3a8c',
    curtainDark: '#552767',
    curtainLight: '#a45cb8',
    slate: '#56677a',
    slateDark: '#3c4a5a',
    slateLight: '#7a8ea3',
    stone: '#a9a497',
    stoneDark: '#7c776b',
    stoneLight: '#c9c4b5',
  });

  VL.extendTileset('base', {
    b: { bridge: true, art: 'bridge' },
    q: { solid: true, stage: true, art: 'stage' },
    Z: { trapdoor: true, art: 'trapdoor' },
    // Solid ground under a decor building, drawn as plain grass.
    x: { solid: true, footprint: true, art: 'grass' },
  });

  // Planks over water. Boards run across the way you walk: a bridge with land
  // or more bridge to its left or right is crossed sideways, otherwise it's a pier.
  VL.ART.defineTileStyle('bridge', {
    ground(ctx, cell, t) {
      VL.ART.TILE_STYLES.water.ground(ctx, cell, t);
      const { x, y } = cell;
      const across = [-1, 1].some((dx) => {
        const other = cell.near(dx, 0);
        return other && (other.bridge || !VL.ART.isWet(other));
      });
      if (across) {
        rect(ctx, 'shadow', x, y + 14, 16, 2);
        rect(ctx, 'wood', x, y + 2, 16, 12);
        for (let seam = 3; seam < 16; seam += 4) rect(ctx, 'woodDark', x + seam, y + 3, 1, 10);
        rect(ctx, 'woodLight', x, y + 3, 16, 1);
        rect(ctx, 'woodDark', x, y + 1, 16, 2);
        rect(ctx, 'woodDark', x, y + 12, 16, 2);
        rect(ctx, 'outline', x, y + 14, 16, 1);
      } else {
        rect(ctx, 'shadow', x + 13, y, 2, 16);
        rect(ctx, 'wood', x + 2, y, 12, 16);
        for (let seam = 3; seam < 16; seam += 4) rect(ctx, 'woodDark', x + 3, y + seam, 10, 1);
        rect(ctx, 'woodLight', x + 3, y, 1, 16);
        rect(ctx, 'woodDark', x + 1, y, 2, 16);
        rect(ctx, 'woodDark', x + 12, y, 2, 16);
      }
    },
  });

  // The front of the puppet stage's wooden platform; the booth is decor above it.
  VL.ART.defineTileStyle('stage', {
    ground(ctx, cell) {
      const { x, y } = cell;
      VL.ART.TILE_STYLES.path.ground(ctx, cell);
      rect(ctx, 'woodLight', x, y, 16, 3);
      rect(ctx, 'wood', x, y + 3, 16, 10);
      for (let seam = (cell.wx % 2) * 4 + 2; seam < 16; seam += 8) rect(ctx, 'woodDark', x + seam, y + 3, 1, 10);
      rect(ctx, 'woodDark', x, y + 3, 16, 1);
      rect(ctx, 'outline', x, y + 13, 16, 1);
    },
    shadow: (ctx, cell) => rect(ctx, 'shadow', cell.x, cell.y + 14, 16, 2),
  });

  // Visible all game, opened only for the finale (W20 fills the spot).
  VL.ART.defineTileStyle('trapdoor', {
    ground(ctx, cell) {
      const { x, y } = cell;
      VL.ART.TILE_STYLES.path.ground(ctx, cell);
      rect(ctx, 'outline', x + 2, y + 2, 12, 12);
      rect(ctx, 'woodDark', x + 3, y + 3, 10, 10);
      rect(ctx, 'wood', x + 3, y + 3, 10, 9);
      for (let seam = 5; seam < 13; seam += 3) rect(ctx, 'woodDark', x + seam, y + 3, 1, 9);
      rect(ctx, 'metalDark', x + 3, y + 5, 10, 1);
      rect(ctx, 'metalDark', x + 3, y + 10, 10, 1);
      rect(ctx, 'metalDark', x + 7, y + 7, 2, 2);
      rect(ctx, 'metal', x + 7, y + 7, 1, 1);
    },
  });

  // ---------- decor ----------

  const icons = {
    book: { colors: { r: 'tunicDark', w: 'white' }, rows: ['.rr.rr.', 'rwwrwwr', 'rwwrwwr', '.rrrrr.'] },
    shell: { colors: { s: 'shell', S: 'shellDark' }, rows: ['.sssss.', 'sSsSsSs', '.sSsSs.', '..sss..'] },
    wheel: { colors: { w: 'woodDark' }, rows: ['..www..', '.w.w.w.', 'wwwwwww', '.w.w.w.', '..www..'] },
    anvil: { colors: { m: 'rockDark', l: 'rock' }, rows: ['lllllll', '.mmmmmm', '..mmm..', '.mmmmm.'] },
    thread: { colors: { w: 'woodDark', t: 'berry', l: 'berryLight' }, rows: ['wwwww', '.tlt.', '.ttt.', 'wwwww'] },
  };
  for (const [name, def] of Object.entries(icons)) VL.ART.defineSprite(`sign-${name}`, { outline: false, ...def });

  // A signboard hanging from a bracket on the facade beside a door.
  VL.defineDecor('sign', (ctx, x, y, t, sign) => {
    rect(ctx, 'woodDark', x + 1, y + 4, 12, 1);
    rect(ctx, 'woodDark', x + 3, y + 5, 1, 2);
    rect(ctx, 'woodDark', x + 10, y + 5, 1, 2);
    rect(ctx, 'shadow', x + 3, y + 16, 11, 1);
    rect(ctx, 'outline', x + 1, y + 7, 13, 9);
    rect(ctx, 'wood', x + 2, y + 8, 11, 7);
    rect(ctx, 'woodLight', x + 2, y + 8, 11, 1);
    const icon = VL.ART.sprite(`sign-${sign.icon}`);
    VL.ART.drawSprite(ctx, `sign-${sign.icon}`, x + 2 + Math.floor((11 - icon.w) / 2), y + 9 + Math.floor((6 - icon.h) / 2));
  });

  // The paper mill's wheel turns in the river; 8 paddles and a foamy splash.
  VL.defineDecor('waterWheel', (ctx, x, y, t) => {
    const cx = x + 16;
    const cy = y + 22;
    const turn = t * 1.4;
    for (let i = 0; i < 24; i += 1) {
      const a = (i / 24) * Math.PI * 2;
      rect(ctx, 'woodDark', Math.round(cx + Math.cos(a) * 12) - 1, Math.round(cy + Math.sin(a) * 12) - 1, 2, 2);
    }
    for (let i = 0; i < 8; i += 1) {
      const a = turn + (i / 8) * Math.PI * 2;
      for (let r = 2; r <= 14; r += 2) rect(ctx, r > 11 ? 'woodLight' : 'wood', Math.round(cx + Math.cos(a) * r) - 1, Math.round(cy + Math.sin(a) * r) - 1, 2, 2);
    }
    rect(ctx, 'outline', cx - 2, cy - 2, 5, 5);
    rect(ctx, 'metalDark', cx - 1, cy - 1, 3, 3);
    rect(ctx, 'metal', cx - 1, cy - 1, 1, 1);
    const surge = Math.sin(t * 6) > 0 ? 1 : 0;
    rect(ctx, 'foamDark', cx - 12, cy + 12 + surge, 24, 2);
    rect(ctx, 'foam', cx - 9 + surge, cy + 13, 18, 1);
  });

  // The town well: a stone ring under a little red roof, 2 tiles wide.
  VL.defineDecor('well', (ctx, x, y) => {
    VL.ART.drawShadow(ctx, x + 16, y + 13, 30, 'shadow');
    rect(ctx, 'outline', x + 2, y + 2, 28, 12);
    rect(ctx, 'stone', x + 3, y + 3, 26, 10);
    rect(ctx, 'stoneLight', x + 3, y + 3, 26, 2);
    for (let i = 0; i < 4; i += 1) rect(ctx, 'stoneDark', x + 5 + i * 7, y + 6, 1, 6);
    rect(ctx, 'stoneDark', x + 3, y + 9, 26, 1);
    rect(ctx, 'water', x + 6, y + 3, 20, 2);
    rect(ctx, 'woodDark', x + 4, y - 10, 2, 13);
    rect(ctx, 'woodDark', x + 26, y - 10, 2, 13);
    rect(ctx, 'woodDark', x + 5, y - 7, 22, 1);
    rect(ctx, 'metalDark', x + 15, y - 6, 1, 4);
    rect(ctx, 'wood', x + 13, y - 2, 5, 4);
    rect(ctx, 'outline', x, y - 15, 32, 6);
    rect(ctx, 'roof', x + 1, y - 14, 30, 4);
    rect(ctx, 'roofLight', x + 1, y - 14, 30, 1);
    rect(ctx, 'roofDark', x + 1, y - 11, 30, 1);
  });

  // The wife's puppet booth over the stage: curtains, a scalloped valance and
  // two puppets bobbing through a show.
  VL.defineDecor('puppetBooth', (ctx, x, y, t) => {
    rect(ctx, 'outline', x + 1, y - 9, 62, 26);
    rect(ctx, 'woodDark', x + 2, y - 8, 4, 24);
    rect(ctx, 'woodDark', x + 58, y - 8, 4, 24);
    rect(ctx, 'curtainDark', x + 6, y - 2, 52, 18);
    for (let fold = 8; fold < 58; fold += 6) rect(ctx, 'curtain', x + fold, y - 2, 3, 18);
    rect(ctx, 'ink', x + 18, y, 28, 11);
    rect(ctx, 'curtainLight', x + 17, y, 1, 11);
    rect(ctx, 'curtainLight', x + 46, y, 1, 11);
    rect(ctx, 'curtain', x + 2, y - 8, 60, 6);
    for (let s = 0; s < 10; s += 1) rect(ctx, 'curtainLight', x + 4 + s * 6, y - 3, 4, 2);
    rect(ctx, 'gold', x + 2, y - 8, 60, 1);
    rect(ctx, 'goldLight', x + 26, y - 7, 12, 3);
    const bob = (phase) => (Math.sin(t * 3 + phase) > 0 ? 1 : 0);
    // A little dragon puppet and a little hero puppet, kept friendly.
    const dy = bob(0);
    rect(ctx, 'leaf', x + 22, y + 5 + dy, 7, 5);
    rect(ctx, 'leafLight', x + 23, y + 5 + dy, 3, 1);
    rect(ctx, 'ink', x + 27, y + 6 + dy, 1, 1);
    rect(ctx, 'leaf', x + 20, y + 3 + dy, 2, 2);
    const hy = bob(2);
    rect(ctx, 'skin', x + 37, y + 3 + hy, 4, 4);
    rect(ctx, 'hair', x + 37, y + 3 + hy, 4, 1);
    rect(ctx, 'tunic', x + 36, y + 7 + hy, 6, 4);
  });

  // The Old Scriptorium: grey stone and slate, ivy, an arched door with a
  // gold seal (the librarian's key opens it).
  VL.defineDecor('scriptorium', (ctx, x, y, t) => {
    const w = 80;
    rect(ctx, 'shadow', x + 4, y + 47, w - 4, 3);
    rect(ctx, 'outline', x, y + 6, w, 42);
    rect(ctx, 'stone', x + 1, y + 7, w - 2, 40);
    for (let row = 0; row < 5; row += 1) {
      rect(ctx, 'stoneDark', x + 1, y + 13 + row * 7, w - 2, 1);
      for (let col = (row % 2) * 6 + 4; col < w - 2; col += 12) rect(ctx, 'stoneDark', x + col, y + 7 + row * 7, 1, 6);
    }
    rect(ctx, 'stoneLight', x + 1, y + 7, w - 2, 1);
    // slate roof and a small bell tower
    rect(ctx, 'outline', x - 2, y - 6, w + 4, 14);
    rect(ctx, 'slate', x - 1, y - 5, w + 2, 12);
    for (let row = 0; row < 3; row += 1) rect(ctx, 'slateDark', x - 1, y - 2 + row * 4, w + 2, 1);
    rect(ctx, 'slateLight', x - 1, y - 5, w + 2, 1);
    rect(ctx, 'outline', x + 33, y - 20, 14, 16);
    rect(ctx, 'stone', x + 34, y - 19, 12, 14);
    rect(ctx, 'ink', x + 37, y - 16, 6, 6);
    rect(ctx, 'gold', x + 39, y - 13 + (Math.sin(t * 2) > 0.6 ? 1 : 0), 2, 2);
    rect(ctx, 'outline', x + 31, y - 24, 18, 5);
    rect(ctx, 'slate', x + 32, y - 23, 16, 3);
    // arched windows
    for (const wx of [10, 62]) {
      rect(ctx, 'outline', x + wx, y + 16, 8, 14);
      rect(ctx, 'slateDark', x + wx + 1, y + 17, 6, 12);
      rect(ctx, 'slateLight', x + wx + 2, y + 18, 1, 4);
    }
    // the door, centred on the doorway tile (x + 32..48)
    rect(ctx, 'outline', x + 33, y + 25, 14, 23);
    rect(ctx, 'woodDark', x + 34, y + 26, 12, 22);
    rect(ctx, 'wood', x + 35, y + 28, 4, 20);
    rect(ctx, 'wood', x + 41, y + 28, 4, 20);
    rect(ctx, 'stoneLight', x + 34, y + 25, 12, 1);
    rect(ctx, 'gold', x + 38, y + 36, 4, 4);
    rect(ctx, 'goldLight', x + 38, y + 36, 2, 1);
    // ivy
    for (let i = 0; i < 9; i += 1) {
      const vx = x + 2 + Math.floor(VL.ART.hash(i, 7, 3) * 26);
      const vy = y + 8 + Math.floor(VL.ART.hash(i, 9, 4) * 30);
      rect(ctx, i % 3 ? 'leaf' : 'leafLight', vx, vy, 2, 2);
    }
    for (let i = 0; i < 7; i += 1) {
      const vx = x + 52 + Math.floor(VL.ART.hash(i, 11, 3) * 26);
      const vy = y + 8 + Math.floor(VL.ART.hash(i, 13, 4) * 30);
      rect(ctx, i % 3 ? 'leafDark' : 'leaf', vx, vy, 2, 2);
    }
  });

  // ---------- screens ----------

  const spot = (id, x, y, how, lock = id) => ({ type: 'spot', id, x, y, how, lock });
  const door = (id, lock, x, y) => spot(id, x, y, 'door', lock);
  const sign = (x, y, icon) => ({ type: 'decor', art: 'sign', icon, x, y });

  VL.addScreens('overworld', {
    // The Old Scriptorium's grounds, just north of town; the lake is beyond.
    '2,-2': {
      tiles: [
        'TT..TTTTTTTTTTTW',
        'T...,.xxxxx..,.T',
        'T.....xxxxx....T',
        'T..B..xxPxx..B.T',
        'T.......P......T',
        'T..R....P....,.T',
        'T.......P.......',
        'T,......PPPPPPPP',
        'T.......P......T',
        'TT......P.....TT',
        'T.TTTTT.P.TTTTTT',
      ],
      entities: [
        { type: 'decor', art: 'scriptorium', x: 6, y: 1 },
        door('scriptoriumDoor', 'scriptoriumEntered', 8, 3),
        spot('bookScriptoriumRock', 3, 5, 'rock'),
      ],
    },
    // The river comes down from the lake; a footbridge to the east meadow.
    '3,-2': {
      tiles: [
        'WWWWWWWWWWWWWWWW',
        'WWWWWWWWWWWWWWWW',
        'owwwwwwwwWWwwwwo',
        'rssssssswWWwsssr',
        'T...B...wWWw...T',
        'T.......wWWw.B.T',
        '........wWWw...T',
        'PPPPPPPPPbbPPP.T',
        'T...P...wWWw...T',
        'T...P....WW..,.T',
        'TTTTPTTTTWWTTTTT',
      ],
      entities: [
        spot('bookRiverside', 4, 4, 'bush'),
        spot('chickenRiverside', 12, 3, 'chicken', 'chickens'),
      ],
    },
    // The library, the heart of town.
    '2,-1': {
      tiles: [
        'T.TTTTT...TTTTTT',
        'T.......P......T',
        'T.HHHHHHP..,...T',
        'T.HHHHHHP....B.T',
        'T.HHHDHHP......T',
        '.....P..P.......',
        '.....PPPPPPPPPPP',
        'T.......P......T',
        'T..,....P...,..T',
        'T.......P......T',
        'TTTTTTT.P.TTTTTT',
      ],
      entities: [
        door('libraryDoor', 'library', 5, 4),
        sign(6, 4, 'book'),
        spot('bookHerbalist', 13, 3, 'bush'),
        spot('pageFieldA', 14, 9, 'search'),
      ],
    },
    // The paper mill and its water wheel on the river, the bindery across it.
    '3,-1': {
      tiles: [
        'TTTTPTTTTWWTTTTT',
        'T...P....WW....T',
        'T...PHHHHWWHHH.T',
        'T...PHDHHWWHDH.T',
        'T...P...wWWwP..T',
        '.PPPP...wWWwP..T',
        '.P..PPPPPbbPP..T',
        'T...P...wWWw.,.T',
        'T...P..,wWWw...T',
        'T...P....WW..B.T',
        'TTTTPTTTTWWTTTTT',
      ],
      entities: [
        door('paperMillDoor', 'paperMill', 6, 3),
        sign(7, 3, 'wheel'),
        { type: 'decor', art: 'waterWheel', x: 9, y: 1 },
        door('binderyDoor', 'bindery', 12, 3),
        sign(13, 3, 'thread'),
        spot('bookPrimer', 14, 4, 'trunk'),
      ],
    },
    // The town square: puppet stage (trapdoor in front), well and shop.
    '2,0': {
      tiles: [
        'TTTTTTT.P.TTTTTT',
        'T.xxxx..P......T',
        'T.qqqq..P.HHHH.T',
        'T..Z.,..P.HDHH.T',
        'T.PPPPPPPPPPP..T',
        'T.P....xx...P...',
        'T.P.........PPPP',
        'T.PPPPPPPPPPP...',
        'T.....,P.....,.T',
        'T.B....P.......T',
        'TTTTTT.PP.TTTTTT',
      ],
      entities: [
        { type: 'decor', art: 'puppetBooth', x: 2, y: 1 },
        spot('puppetStage', 3, 2, 'stage'),
        spot('trapdoor', 3, 3, 'trapdoor', 'trapdoorOpen'),
        door('shopDoor', 'shop', 11, 3),
        sign(12, 3, 'shell'),
        { type: 'decor', art: 'well', x: 7, y: 5 },
        spot('hiddenBookSealed', 1, 3, 'trunk'),
        spot('chickenSquare', 10, 8, 'chicken', 'chickens'),
      ],
    },
    // The blacksmith by the river; the east road leaves past the bridge.
    '3,0': {
      tiles: [
        'TTTTPTTTTWWTTTTT',
        'T...P....WW....T',
        'T...PHHHwWWw.,.T',
        'T...PHDHwWWw...T',
        'T...P.P.wWWw...T',
        '.PPPPPPPPbbPPPPP',
        '.P......wWWw....',
        '.P.,....wWWw...T',
        'T.PP....wWWw.B.T',
        'T..P.....WW....T',
        'TTTP.TTTTWWTTTTT',
      ],
      entities: [
        door('blacksmithDoor', 'blacksmith', 6, 3),
        sign(7, 3, 'anvil'),
        spot('bookSmithsLedger', 1, 1, 'trunk'),
      ],
    },
    // The harbour: the chicken coop, a pier, and the beach path from the hut.
    '2,1': {
      tiles: [
        'TTTTTT.PP.TTTTTT',
        'T......PP......T',
        'T.XXXX.PP..,...T',
        'T.X..X.PP......T',
        '..X..X.PP......T',
        'PPPPPPPPPPPPPPPs',
        '...sssssssssssss',
        'ssssssssssssssss',
        'owwwwwwwbwwwwwww',
        'WWWWWWWWbWWWWWWW',
        'WWWWWWWWWWWWWWWW',
      ],
      entities: [
        spot('chickenCoop', 4, 3, 'chicken', 'chickens'),
        spot('bookChickenAlmanac', 3, 3, 'search'),
        spot('bookDragons', 14, 1, 'trunk'),
      ],
    },
    // The river meets the sea.
    '3,1': {
      tiles: [
        'TTTP.TTTTWWTTTTT',
        'T..P.....WW....T',
        'T..P..,.wWWw.,.T',
        'T..PPPPPPbbPPPP.',
        'T.......wWWw....',
        'sssssssswWWwssss',
        'sssssssswWWwssss',
        'ssssssswwWWwwsss',
        'wwwwwwwwwWWwwwww',
        'WWWWWWWWWWWWWWWW',
        'WWWWWWWWWWWWWWWW',
      ],
      entities: [],
    },
  });

  VL.defineRegion('town', { screens: ['2,-2', '3,-2', '2,-1', '3,-1', '2,0', '3,0', '2,1', '3,1'], place: 'town' });
  VL.defineLock('town', {
    ...VL.LOCKS.town,
    reached: (state) => VL.regionVisited(state, 'town'),
    place: { area: 'overworld', screen: '2,0' },
  });
})();
