// Dungeon 1, the Old Scriptorium (design: The path through the game, 2):
// the librarian's key opens it; the Lifting Gloves lie mid-dungeon; pots
// are thrown at switches and at the Bookworm; the Woods mural hangs by the
// entrance. Built on W13's framework (README "How to build a dungeon").
//
//                     boss (1,-2): the Bookworm
//                          │ boss door
//   gallery (0,0)    stacks (1,-1) ─door A─ vault (2,-1): the gloves
//   mural, block → key A    │ map                │ rock
//        └───── entrance (1,0) ──rock── pit room (2,0) ─door B─ copying hall (3,0)
//                            (overworld)   pot → switch → key B,   pot over desks →
//                                          ore                     switch → gate → pot →
//                                                                  switch → boss key
(() => {
  const { rect } = VL.ART;
  const DUNGEON = 'scriptorium';

  // ---------- tiles ----------

  VL.ART.addColors({
    scrStone: '#8a8478',
    scrStoneDark: '#5e594f',
    scrStoneLight: '#b3ac9c',
    scrFloor: '#6f6a62',
    scrFloorDark: '#57524b',
    scrFloorLight: '#857f75',
    scrMoss: '#5f7f45',
  });

  VL.defineTileset('scriptorium', {
    ...VL.DUNGEON_TILES,
    '#': { ...VL.DUNGEON_TILES['#'], art: 'scrWall' },
    _: { ...VL.DUNGEON_TILES._, art: 'scrFloor' },
    S: { solid: true, shelf: true, art: 'scrShelf' },
    r: { solid: true, rock: true, liftTo: '_', art: 'scrRock' },
    // Low enough to throw a pot over, too wide to walk past.
    d: { solid: true, low: true, desk: true, art: 'scrDesk' },
    h: { floor: true, hole: true, art: 'scrHole' },
  });

  VL.ART.defineTileStyle('scrWall', {
    ground(ctx, cell) {
      const { x, y } = cell;
      rect(ctx, 'scrStoneDark', x, y, 16, 16);
      if (!cell.near(0, 1)?.floor) return;
      rect(ctx, 'scrStone', x, y + 3, 16, 12);
      for (let row = 0; row < 3; row += 1) {
        rect(ctx, 'scrStoneDark', x, y + 6 + row * 4, 16, 1);
        rect(ctx, 'scrStoneDark', x + ((cell.wx + row) % 2) * 8 + 3, y + 3 + row * 4, 1, 3);
      }
      rect(ctx, 'scrStoneLight', x, y + 3, 16, 1);
      if (cell.seed(1) > 0.7) rect(ctx, 'scrMoss', x + Math.floor(cell.seed(2) * 12), y + 12, 3, 2);
      rect(ctx, 'outline', x, y + 15, 16, 1);
    },
  });

  VL.ART.defineTileStyle('scrFloor', {
    ground(ctx, cell) {
      const { x, y } = cell;
      rect(ctx, 'scrFloor', x, y, 16, 16);
      const shift = (cell.wy % 2) * 4;
      rect(ctx, 'scrFloorDark', x, y + 7, 16, 1);
      rect(ctx, 'scrFloorDark', x, y + 15, 16, 1);
      rect(ctx, 'scrFloorDark', x + shift + 3, y, 1, 7);
      rect(ctx, 'scrFloorDark', x + 11 - shift, y + 8, 1, 7);
      rect(ctx, 'scrFloorLight', x + Math.floor(cell.seed(1) * 12) + 1, y + 2 + Math.floor(cell.seed(2) * 3), 2, 1);
      if (cell.near(0, -1)?.wall || cell.near(0, -1)?.shelf) rect(ctx, 'shadow', x, y, 16, 3);
    },
  });

  const SPINES = ['heart', 'tunic', 'gold', 'water', 'leaf', 'berry', 'roof'];
  VL.ART.defineTileStyle('scrShelf', {
    under: 'scrFloor',
    raised(ctx, cell) {
      const { x, y } = cell;
      rect(ctx, 'outline', x, y - 6, 16, 22);
      rect(ctx, 'woodDark', x + 1, y - 5, 14, 20);
      for (let board = 0; board < 3; board += 1) {
        const top = y - 4 + board * 6;
        for (let i = 0; i < 6; i += 1) {
          if (cell.seed(board * 7 + i) < 0.18) continue;
          const tall = cell.seed(board * 7 + i + 30) > 0.5 ? 5 : 4;
          rect(ctx, SPINES[Math.floor(cell.seed(board * 9 + i + 60) * SPINES.length)], x + 2 + i * 2, top + 5 - tall, 2, tall);
        }
        rect(ctx, 'wood', x + 1, top + 5, 14, 1);
      }
      rect(ctx, 'woodLight', x + 1, y - 5, 14, 1);
    },
  });

  VL.ART.defineTileStyle('scrRock', {
    under: 'scrFloor',
    raised: (ctx, cell) => VL.ART.drawSprite(ctx, 'tile-rock', cell.x, cell.y + 3),
  });

  VL.ART.defineTileStyle('scrDesk', {
    under: 'scrFloor',
    shadow: (ctx, cell) => rect(ctx, 'shadow', cell.x + 1, cell.y + 13, 14, 3),
    raised(ctx, cell) {
      const { x, y } = cell;
      rect(ctx, 'outline', x, y + 3, 16, 9);
      rect(ctx, 'wood', x + 1, y + 4, 14, 4);
      rect(ctx, 'woodLight', x + 1, y + 4, 14, 1);
      rect(ctx, 'woodDark', x + 1, y + 8, 14, 3);
      rect(ctx, 'woodDark', x + 2, y + 11, 2, 4);
      rect(ctx, 'woodDark', x + 12, y + 11, 2, 4);
      if (cell.seed(3) > 0.5) {
        rect(ctx, 'white', x + 4, y + 4, 7, 3);
        rect(ctx, 'ink', x + 7, y + 4, 1, 3);
      } else {
        rect(ctx, 'ink', x + 10, y + 3, 2, 2);
        rect(ctx, 'white', x + 12, y + 1, 1, 3);
      }
    },
  });

  VL.ART.defineTileStyle('scrHole', {
    under: 'scrFloor',
    shadow(ctx, cell) {
      const { x, y } = cell;
      rect(ctx, 'wormHole', x + 3, y + 5, 10, 7);
      rect(ctx, 'wormHole', x + 2, y + 7, 12, 3);
      rect(ctx, 'scrFloorLight', x + 3, y + 12, 10, 1);
      rect(ctx, 'wormPaper', x + 1, y + 4, 2, 1);
      rect(ctx, 'wormPaper', x + 13, y + 11, 2, 1);
    },
  });

  VL.defineArea('scriptorium', { tileset: 'scriptorium' });

  // ---------- the rooms ----------

  const pot = (x, y, respawn = true) => ({ type: 'pot', x, y, respawn });

  VL.addScreens('scriptorium', {
    // The entrance hall: the way out, pots too heavy until the gloves.
    '1,0': {
      tiles: [
        '#######_########',
        '#SS#_______#SS##',
        '#______________#',
        '#______________#',
        '#__________#####',
        '____________r___',
        '#__________#####',
        '#______________#',
        '#______________#',
        '#______________#',
        '#######m########',
      ],
      entities: [
        { type: 'door', x: 7, y: 10, to: { area: 'overworld', screen: '2,-2', tx: 8, ty: 4, facing: 'down' } },
        { type: 'sign', x: 10, y: 2, title: 'Old Scriptorium', text: 'Quiet, please! Scribes at work. (The last scribe went home a hundred years ago.)' },
        pot(2, 8, false),
        pot(13, 8, false),
      ],
    },
    // The gallery: the Woods mural, and a block to push onto the plate for key A.
    '0,0': {
      tiles: [
        '################',
        '#SSSS######SSSS#',
        '#______________#',
        '#______________#',
        '#__###_________#',
        '#__#_#__________',
        '#__#_#_________#',
        '#______________#',
        '#______________#',
        '#______________#',
        '################',
      ],
      entities: [
        { type: 'copyable', x: 7, y: 1, copy: 'woodsMapCopy', look: 'mural' },
        { type: 'pushBlock', x: 11, y: 8 },
        { type: 'pressurePlate', id: 'd1PlateGallery', x: 12, y: 8, latch: true, weight: 'block' },
        { type: 'sign', x: 9, y: 9, title: 'A note from the scribes', text: 'Pushed the block the wrong way? Step out of the room and in again, and it will be back where it started.' },
        { type: 'shutter', id: 'd1ShutterGallery', x: 4, y: 6, open: { plate: 'd1PlateGallery' } },
        { type: 'smallKey', id: 'd1KeyA', x: 4, y: 5, lock: 'd1KeyA' },
        { type: 'slime', x: 9, y: 3 },
        pot(1, 2, false),
        pot(14, 2, false),
      ],
    },
    // The great stacks: the map, door A east to the vault, the boss door north.
    '1,-1': {
      tiles: [
        '#######_########',
        '#SSS##___##SSS##',
        '#______________#',
        '#_SS_SS__SS_SS_#',
        '#______________#',
        '#_SS_SS__SS_SS__',
        '#______________#',
        '#_SS_SS__SS_SS_#',
        '#______________#',
        '#______________#',
        '#######_########',
      ],
      entities: [
        { type: 'lockedDoor', id: 'd1BossDoor', kind: 'boss', x: 7, y: 0, lock: 'd1BossDoor', oneWay: true },
        { type: 'lockedDoor', id: 'd1DoorA', kind: 'small', x: 15, y: 5, lock: 'd1DoorA' },
        { type: 'dungeonMap', id: 'd1Map', x: 2, y: 9 },
        { type: 'slime', x: 4, y: 4 },
        { type: 'slime', x: 11, y: 8 },
      ],
    },
    // The vault: the Lifting Gloves in the big chest; a rock to lift on the way south.
    '2,-1': {
      tiles: [
        '################',
        '#SSSS######SSSS#',
        '#______________#',
        '#______________#',
        '#______________#',
        '_______________#',
        '#______________#',
        '#______________#',
        '#######_########',
        '#######r########',
        '#######_########',
      ],
      entities: [
        { type: 'lockedDoor', id: 'd1DoorA', kind: 'small', x: 0, y: 5, lock: 'd1DoorA' },
        { type: 'bigChest', id: 'd1GlovesChest', x: 7, y: 4, item: 'liftingGloves' },
        { type: 'bat', x: 12, y: 3 },
        pot(3, 7),
        pot(12, 7),
      ],
    },
    // The pit room: throw a pot over the pits at the switch, and key B is free.
    // The ore lump waits in the corner.
    '2,0': {
      tiles: [
        '#######_########',
        '#_______ooooo__#',
        '#_______oo_oo__#',
        '#_______ooooo__#',
        '#______________#',
        '________________',
        '#______________#',
        '#_#_#__________#',
        '#_#_#__________#',
        '#_###__________#',
        '################',
      ],
      entities: [
        { type: 'switch', id: 'd1SwitchPit', x: 10, y: 2 },
        { type: 'shutter', id: 'd1ShutterPit', x: 3, y: 7, open: { switch: 'd1SwitchPit' } },
        { type: 'smallKey', id: 'd1KeyB', x: 3, y: 8, lock: 'd1KeyB' },
        { type: 'lockedDoor', id: 'd1DoorB', kind: 'small', x: 15, y: 5, lock: 'd1DoorB' },
        { type: 'ore', id: 'oreScriptorium', x: 13, y: 8 },
        { type: 'slime', x: 11, y: 7 },
        pot(5, 2),
        pot(5, 4),
        pot(13, 4),
      ],
    },
    // The copying hall: a switch hemmed in by reading desks, and a second
    // in a walled niche, sealed by a gate until the first is thrown (W42).
    // A pot over the desks throws the first; through the open gate, a pot
    // over the niche's desk throws the second, and the boss key is free.
    '3,0': {
      tiles: [
        '################',
        '#SSSSSSSSSS#S#S#',
        '#__________d_d_#',
        '#__________ddd_#',
        '#______________#',
        '_______________#',
        '#_#_#______#_#_#',
        '#_#_#___dd_#d#_#',
        '#_###______#_#_#',
        '#__________###_#',
        '################',
      ],
      entities: [
        { type: 'lockedDoor', id: 'd1DoorB', kind: 'small', x: 0, y: 5, lock: 'd1DoorB' },
        { type: 'switch', id: 'd1SwitchDesk', x: 12, y: 2 },
        { type: 'shutter', id: 'd1ShutterNiche', x: 12, y: 6, open: { switch: 'd1SwitchDesk' } },
        { type: 'switch', id: 'd1SwitchNiche', x: 12, y: 8 },
        { type: 'shutter', id: 'd1ShutterBossKey', x: 3, y: 6, open: { switch: 'd1SwitchNiche' } },
        { type: 'bossKey', id: 'd1BossKey', x: 3, y: 7, lock: 'd1BossKey' },
        { type: 'bat', x: 7, y: 3 },
        { type: 'bat', x: 9, y: 9 },
        pot(7, 9),
        pot(14, 5),
        pot(9, 4),
      ],
    },
    // The Bookworm's den: holes in the floor, pots in every corner.
    '1,-2': {
      tiles: [
        '################',
        '#SSSSSSSSSSSSSS#',
        '#______________#',
        '#___h______h___#',
        '#______________#',
        '#__SS__h___SS__#',
        '#______________#',
        '#___h______h___#',
        '#______________#',
        '#______________#',
        '#######_########',
      ],
      entities: [
        { type: 'bookworm', x: 7, y: 5 },
        pot(2, 2),
        pot(13, 2),
        pot(2, 9),
        pot(13, 9),
      ],
    },
  });

  // ---------- the way in ----------

  VL.fillSpot('scriptoriumDoor', {
    type: 'door',
    to: { area: 'scriptorium', screen: '1,0', tx: 7, ty: 9, facing: 'up' },
    needs: 'scriptoriumKey',
    locked: 'The great door is locked. A wax seal is pressed into the keyhole. Have you seen that mark on a book somewhere?',
  });

  // ---------- the treasure ----------

  const bookworm = (id, title, color, blurb) => VL.defineBook(id, { kind: 'generic', title, color, blurb });
  bookworm('bookWormAtlas', 'An Atlas, Slightly Nibbled', 'water', 'Half the sea is missing. I suppose the Bookworm found it the tastiest part.');
  bookworm('bookWormRiddles', 'One Hundred Riddles', 'gold', 'What has a spine but no bones? This book! And, I suppose, every other book.');
  bookworm('bookWormScribes', 'Tales of the Old Scribes', 'roof', 'The scribes wrote with feather quills. One scribe tried a carrot, just once.');
  VL.BOOKWORM_BUNDLE = ['bookWormAtlas', 'bookWormRiddles', 'bookWormScribes'];

  // The books it had been nibbling come back up with it (design: "a bundle of books").
  VL.giveBookBundle = function giveBookBundle(state, ids) {
    for (const id of ids) VL.markFound(state, id);
    VL.showMessage(state, { title: 'A bundle of books!', text: 'The Bookworm left behind three books it had been nibbling. Take them to the library!' });
    VL.showPopup(state, 'firstBook');
    state.events.push({ type: 'pickup', kind: 'book' });
  };

  VL.defineDungeon(DUNGEON, {
    area: 'scriptorium',
    name: 'Old Scriptorium',
    entrance: { area: 'overworld', screen: '2,-2', tx: 8, ty: 4, facing: 'down' },
    boss: {
      screen: '1,-2',
      type: 'bookworm',
      heart: 'heartD1',
      warp: { tx: 7, ty: 8 },
      onDefeat(state) {
        VL.giveItem(state, 'mortarPestle');
        VL.giveBookBundle(state, VL.BOOKWORM_BUNDLE);
        VL.holdUp(state, VL.itemSprite('mortarPestle'));
        VL.holdUp(state, 'pickup-book');
      },
    },
    light: 'indoor',
  });

  // ---------- progression (README "Progression") ----------

  const doc = '§ The path through the game, 2';
  const visited = (screen) => (state) => Boolean(state.visited[`scriptorium:${screen}`]);
  const door = (id) => (state) => Boolean(state.dungeons.scriptorium?.doors[id]);
  const found = (id) => (state) => VL.spotFound(state, id);
  const keys = `smallKey:${DUNGEON}`;

  VL.defineLock('scriptoriumEntered', { ...VL.LOCKS.scriptoriumEntered, place: { area: 'scriptorium', screen: '1,0' }, reached: visited('1,0') });
  VL.defineLock('woodsMural', { ...VL.LOCKS.woodsMural, place: { area: 'scriptorium', screen: '0,0' }, reached: visited('0,0') });
  VL.defineLock('d1KeyA', { type: 'item', needs: ['scriptoriumEntered'], supplies: { [keys]: 1 }, doc, reached: found('d1KeyA') });
  VL.defineLock('d1DoorA', { needs: ['scriptoriumEntered'], consumes: { [keys]: 1 }, doc, reached: door('d1DoorA') });
  VL.defineLock('liftingGloves', {
    ...VL.LOCKS.liftingGloves,
    needs: ['scriptoriumEntered', 'd1DoorA'],
    replan: 'found mid-dungeon: the gloves lie behind the first locked door',
    reached: (state) => VL.hasItem(state, 'liftingGloves'),
  });
  VL.defineLock('d1KeyB', { type: 'item', needs: ['liftingGloves'], supplies: { [keys]: 1 }, doc, reached: found('d1KeyB') });
  VL.defineLock('d1DoorB', { needs: ['liftingGloves'], consumes: { [keys]: 1 }, doc, reached: door('d1DoorB') });
  VL.defineLock('d1BossKey', { type: 'item', needs: ['d1DoorB'], gives: [`bossKey:${DUNGEON}`], doc, reached: found('d1BossKey') });
  VL.defineLock('d1BossDoor', { needs: ['scriptoriumEntered', `bossKey:${DUNGEON}`], doc, reached: door('d1BossDoor') });
  VL.defineLock('oreScriptorium', { ...VL.LOCKS.oreScriptorium, reached: found('oreScriptorium') });
  VL.defineLock('d1Boss', {
    ...VL.LOCKS.d1Boss,
    needs: ['scriptoriumEntered', 'liftingGloves', 'd1BossDoor'],
    replan: 'the boss room lies behind the boss door',
    reached: (state) => VL.bossBeaten(state, DUNGEON),
  });
})();
