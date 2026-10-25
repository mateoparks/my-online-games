// Dungeon 2, the Hollow Oak (design: The path through the game, 3): deep in
// the Whispering Woods; the Grappling Rope lies mid-dungeon; grapple posts
// over pits and a looping tangle of roots; the Thornback at the top. Built on
// W13's framework (README "How to build a dungeon"); its boss's defeat is
// where W16's shockwave hooks in (VL.afterThornback).
//
//                       boss (0,-3): the Thornback
//                            │ boss door
//   tangle N (-1,-2) ── great hollow (0,-2) ─door A─ rope vault (1,-2): the rope
//   key A   │                │                        │ pits, posts
//   tangle S (-1,-1) ── root hall (0,-1) ── pit garden (1,-1): key B on an island
//   map                      │                        │ door B
//                       entrance (0,0) ─bars─ sap well (1,0): switch, boss key
//                       statue, door out
(() => {
  const { rect } = VL.ART;
  const DUNGEON = 'hollowOak';

  // ---------- tiles ----------

  VL.ART.addColors({
    oakBark: '#6b4a2b',
    oakBarkDark: '#45301c',
    oakBarkLight: '#8f6a41',
    oakFloor: '#a07a4c',
    oakFloorDark: '#82603a',
    oakFloorLight: '#bf9963',
    oakMoss: '#6f9a45',
  });

  VL.defineTileset('hollowOak', {
    ...VL.DUNGEON_TILES,
    '#': { ...VL.DUNGEON_TILES['#'], art: 'oakWall' },
    _: { ...VL.DUNGEON_TILES._, art: 'oakFloor' },
    R: { solid: true, roots: true, art: 'oakRoots' },
  });

  VL.ART.defineTileStyle('oakWall', {
    ground(ctx, cell) {
      const { x, y } = cell;
      rect(ctx, 'oakBarkDark', x, y, 16, 16);
      if (!cell.near(0, 1)?.floor) return;
      rect(ctx, 'oakBark', x, y + 2, 16, 13);
      for (let i = 0; i < 3; i += 1) rect(ctx, 'oakBarkDark', x + 2 + i * 5 + ((cell.wx + i) % 2), y + 3, 1, 11);
      rect(ctx, 'oakBarkLight', x, y + 2, 16, 1);
      if (cell.seed(1) > 0.65) rect(ctx, 'oakMoss', x + Math.floor(cell.seed(2) * 12), y + 13, 4, 2);
      rect(ctx, 'outline', x, y + 15, 16, 1);
    },
  });

  // Heartwood: growth rings in the floor.
  VL.ART.defineTileStyle('oakFloor', {
    ground(ctx, cell) {
      const { x, y } = cell;
      rect(ctx, 'oakFloor', x, y, 16, 16);
      const ring = (cell.wx * 7 + cell.wy * 3) % 16;
      rect(ctx, 'oakFloorDark', x, y + (ring % 8) + 4, 16, 1);
      rect(ctx, 'oakFloorDark', x + ((ring * 3) % 12) + 2, y, 1, 3);
      rect(ctx, 'oakFloorLight', x + Math.floor(cell.seed(1) * 12) + 1, y + 1 + Math.floor(cell.seed(2) * 3), 3, 1);
      if (cell.near(0, -1)?.wall || cell.near(0, -1)?.roots) rect(ctx, 'shadow', x, y, 16, 3);
    },
  });

  // A knot of roots, twisting up out of the floor (two shapes, picked per tile).
  const ROOT_COLORS = { o: 'outline', b: 'oakBark', d: 'oakBarkDark', l: 'oakBarkLight', m: 'oakMoss' };
  VL.ART.defineSprite('tile-oak-roots-0', {
    outline: false,
    colors: ROOT_COLORS,
    rows: [
      '.....oo...oo....',
      '....olbo.olbo...',
      '...olbdbolbdo...',
      '..olbbdbbbbdbo..',
      '.olbmmbdbbbdbbo.',
      '.olbbbbdblbdbbo.',
      'olbbdbbdbllbdbbo',
      'olbdbbdbbblbdbdo',
      'olbdbbdbbbbdbbdo',
      '.olbbdbblbbdbdo.',
      '.olbdbbblbbbdbo.',
      'olbdo.olbbo.odbo',
      'obdo..obddo..odo',
      '.oo...oddo....o.',
      '.......oo.......',
    ],
  });
  VL.ART.defineSprite('tile-oak-roots-1', {
    outline: false,
    colors: ROOT_COLORS,
    rows: [
      '......oooo......',
      '....oolbbboo....',
      '...olbbdbbbdo...',
      '..olbdbbbdbbbo..',
      '.olbbdbllbdbbdo.',
      '.olbdbbbldbbbdo.',
      'olbbdbbbdbmmbbdo',
      'olbdbblbdbbbbddo',
      'olbdbbbbdblbbbdo',
      '.olbdbbbdbbbbdo.',
      '..olbdbbdbbbdo..',
      '.olbo.olbbo.olo.',
      'olbo..obdo...obo',
      'odo...oddo....oo',
      '.o.....oo.......',
    ],
  });
  VL.ART.defineTileStyle('oakRoots', {
    under: 'oakFloor',
    shadow: (ctx, cell) => rect(ctx, 'shadow', cell.x + 2, cell.y + 13, 13, 3),
    raised: (ctx, cell) => VL.ART.drawSprite(ctx, `tile-oak-roots-${cell.seed(3) > 0.5 ? 1 : 0}`, cell.x, cell.y + 1),
  });

  VL.defineArea(DUNGEON, { tileset: 'hollowOak' });

  // ---------- the rooms ----------

  const post = (x, y) => ({ type: 'grapplePost', x, y });

  VL.addScreens(DUNGEON, {
    // The entrance: the statue, the door out, and bars east that the sap
    // well's switch lifts (a way back once it is thrown).
    '0,0': {
      tiles: [
        '#######_########',
        '#RR#_______#RR##',
        '#______________#',
        '#______________#',
        '#______________#',
        '#_______________',
        '#______________#',
        '#__R________R__#',
        '#______________#',
        '#______________#',
        '#######m########',
      ],
      entities: [
        { type: 'door', x: 7, y: 10, to: { area: 'overworld', screen: '7,-2', tx: 7, ty: 4, facing: 'down' } },
        { type: 'saveStatue', x: 3, y: 2 },
        { type: 'sign', x: 10, y: 2, title: 'The Hollow Oak', text: 'Mind the pits! The old woodsmen crossed them with a rope and a hook.' },
        { type: 'shutter', id: 'd2ShutterSap', x: 15, y: 5, open: { switch: 'd2SwitchSap' } },
      ],
    },
    // The root hall: the crossroads.
    '0,-1': {
      tiles: [
        '#######_########',
        '#RR____R____RR_#',
        '#______________#',
        '#__RR______RR__#',
        '#______________#',
        '________________',
        '#______________#',
        '#__RR______RR__#',
        '#______________#',
        '#R____________R#',
        '#######_########',
      ],
      entities: [
        { type: 'slime', x: 4, y: 5 },
        { type: 'slime', x: 11, y: 8 },
      ],
    },
    // The tangle: two rooms of roots that loop back on themselves. The map
    // waits in a nook of the south one, key A deep in the north one.
    '-1,-1': {
      tiles: [
        '###_############',
        '#R__RR_____R___#',
        '#R_RR__RRR_R_R_#',
        '#__R__RR_R___R_#',
        '#_RR_RR__RRRRR_#',
        '#____R__R_______',
        '#RRR_R_RR_RRRR_#',
        '#____R_R__R____#',
        '#_RRRR_R_RR_RR_#',
        '#______R_______#',
        '################',
      ],
      entities: [
        { type: 'dungeonMap', id: 'd2Map', x: 1, y: 3 },
        { type: 'bat', x: 9, y: 7 },
      ],
    },
    '-1,-2': {
      tiles: [
        '################',
        '#______R_______#',
        '#_RRRR_R_RRRRR_#',
        '#_R__R_R_R___R_#',
        '#_R_RR_R_R_R_R_#',
        '#_R____R___R___#',
        '#_RRRRRRRRRR_RR#',
        '#___R___________',
        '#_R_R_RRRRRRRR_#',
        '#_R___R######R_#',
        '###_############',
      ],
      entities: [
        { type: 'smallKey', id: 'd2KeyA', x: 4, y: 3, lock: 'd2KeyA' },
        { type: 'bat', x: 11, y: 3 },
      ],
    },
    // The great hollow: door A east, the boss door north, a warning carved
    // in the bark.
    '0,-2': {
      tiles: [
        '#######_########',
        '#RR##_____##RR##',
        '#______________#',
        '#__R________R__#',
        '#______________#',
        '#_______________',
        '#______________#',
        '_______________#',
        '#__R________R__#',
        '#______________#',
        '#######_########',
      ],
      entities: [
        { type: 'lockedDoor', id: 'd2BossDoor', kind: 'boss', x: 7, y: 0, lock: 'd2BossDoor', oneWay: true },
        { type: 'lockedDoor', id: 'd2DoorA', kind: 'small', x: 15, y: 5, lock: 'd2DoorA' },
        { type: 'sign', x: 9, y: 1, title: 'Carved in the bark', text: 'Beware the Thornback! Its back is all armour. Pull its plates off, and it\'s just a big beetle.' },
        { type: 'spitter', x: 12, y: 9 },
        { type: 'slime', x: 4, y: 4 },
      ],
    },
    // The rope vault: the rope in the big chest, and the first pits. A post
    // on each side, so the way back is never cut off.
    '1,-2': {
      tiles: [
        '################',
        '#RR##########RR#',
        '#______________#',
        '#______________#',
        '#______________#',
        '_______________#',
        '#oooooooooooooo#',
        '#oooooooooooooo#',
        '#______________#',
        '#______________#',
        '##########_#####',
      ],
      entities: [
        { type: 'lockedDoor', id: 'd2DoorA', kind: 'small', x: 0, y: 5, lock: 'd2DoorA' },
        { type: 'bigChest', id: 'd2RopeChest', x: 7, y: 3, item: 'grapplingRope' },
        { type: 'sign', x: 12, y: 2, title: 'A woodsman\'s note', text: 'Face a post across the pit and throw the hook. Hold on tight!' },
        post(4, 4),
        post(7, 9),
        { type: 'bat', x: 12, y: 8 },
      ],
    },
    // The pit garden: a ledge from the root hall looks across the pits at
    // key B on its island; the rope pulls it over. Door B leads down.
    '1,-1': {
      tiles: [
        '##########_#####',
        '#___oo_________#',
        '#___oo_________#',
        '#___oo__oooo___#',
        '#___oo__o__o___#',
        '____oo__o__o___#',
        '#___oo__oooo___#',
        '#___oo_________#',
        '#___oo_________#',
        '#___oo_________#',
        '############_###',
      ],
      entities: [
        { type: 'smallKey', id: 'd2KeyB', x: 9, y: 4, lock: 'd2KeyB' },
        { type: 'lockedDoor', id: 'd2DoorB', kind: 'small', x: 12, y: 10, lock: 'd2DoorB' },
        post(1, 2),
        post(7, 8),
        { type: 'spitter', x: 14, y: 2 },
      ],
    },
    // The sap well: a pit runs down the room; across it, a ring of pits
    // round an island holds the boss key and the switch that lifts the bars
    // into the entrance.
    '1,0': {
      tiles: [
        '############_###',
        '#__________o___#',
        '#__________o___#',
        '#__ooooooo_o___#',
        '#__o_____o_o___#',
        '___o_____o_o___#',
        '#__o_____o_o___#',
        '#__ooooooo_o___#',
        '#__________o___#',
        '#__________o___#',
        '################',
      ],
      entities: [
        { type: 'lockedDoor', id: 'd2DoorB', kind: 'small', x: 12, y: 0, lock: 'd2DoorB' },
        { type: 'switch', id: 'd2SwitchSap', x: 4, y: 5 },
        { type: 'bossKey', id: 'd2BossKey', x: 6, y: 5, lock: 'd2BossKey' },
        post(8, 1),
        post(14, 8),
        { type: 'slime', x: 2, y: 9 },
      ],
    },
    // The Thornback's den.
    '0,-3': {
      tiles: [
        '################',
        '#RRR########RRR#',
        '#______________#',
        '#______________#',
        '#______________#',
        '#______________#',
        '#______________#',
        '#______________#',
        '#______________#',
        '#R____________R#',
        '#######_########',
      ],
      entities: [
        { type: 'shutter', id: 'd2ShutterBoss', x: 7, y: 10, open: { bossBeaten: true } },
        { type: 'thornback', x: 7, y: 4 },
      ],
    },
  });

  // ---------- the way in ----------

  VL.fillSpot('hollowOakDoor', { type: 'door', to: { area: DUNGEON, screen: '0,0', tx: 7, ty: 9, facing: 'up' } });

  // ---------- the boss, and the hook for what follows it ----------

  // W16's shockwave attaches here: each hook runs once, as the Thornback
  // falls, after the win and its heart are saved (design: The path through
  // the game, 4).
  VL.THORNBACK_DEFEAT_HOOKS = [];
  VL.afterThornback = (hook) => VL.THORNBACK_DEFEAT_HOOKS.push(hook);

  VL.defineDungeon(DUNGEON, {
    area: DUNGEON,
    name: 'Hollow Oak',
    entrance: { area: 'overworld', screen: '7,-2', tx: 7, ty: 4, facing: 'down' },
    boss: {
      screen: '0,-3',
      type: 'thornback',
      heart: 'heartD2',
      warp: { tx: 7, ty: 8 },
      onDefeat(state) {
        state.dungeonNote = { text: 'The Thornback is beaten!', t: 0 };
        for (const hook of VL.THORNBACK_DEFEAT_HOOKS) hook(state);
      },
    },
    light: 'indoor',
  });

  // ---------- progression (README "Progression") ----------

  const doc = '§ The path through the game, 3';
  const door = (id) => (state) => Boolean(state.dungeons[DUNGEON]?.doors[id]);
  const found = (id) => (state) => VL.spotFound(state, id);
  const keys = `smallKey:${DUNGEON}`;

  VL.defineLock('hollowOakEntered', { ...VL.LOCKS.hollowOakEntered, place: { area: DUNGEON, screen: '0,0' }, reached: (state) => Boolean(state.visited[`${DUNGEON}:0,0`]) });
  VL.defineLock('d2KeyA', { type: 'item', needs: ['hollowOakEntered'], supplies: { [keys]: 1 }, doc, reached: found('d2KeyA') });
  VL.defineLock('d2DoorA', { needs: ['hollowOakEntered'], consumes: { [keys]: 1 }, doc, reached: door('d2DoorA') });
  VL.defineLock('grapplingRope', {
    ...VL.LOCKS.grapplingRope,
    needs: ['hollowOakEntered', 'd2DoorA'],
    replan: 'found mid-dungeon: the rope lies behind the first locked door',
    reached: (state) => VL.hasItem(state, 'grapplingRope'),
  });
  VL.defineLock('d2KeyB', { type: 'item', needs: ['grapplingRope'], supplies: { [keys]: 1 }, doc, reached: found('d2KeyB') });
  VL.defineLock('d2DoorB', { needs: ['grapplingRope'], consumes: { [keys]: 1 }, doc, reached: door('d2DoorB') });
  VL.defineLock('d2BossKey', { type: 'item', needs: ['d2DoorB'], gives: [`bossKey:${DUNGEON}`], doc, reached: found('d2BossKey') });
  VL.defineLock('d2BossDoor', { needs: ['hollowOakEntered', `bossKey:${DUNGEON}`], doc, reached: door('d2BossDoor') });
  VL.defineLock('d2Boss', {
    ...VL.LOCKS.d2Boss,
    needs: ['hollowOakEntered', 'grapplingRope', ['woodSword', 'metalSword'], 'd2BossDoor'],
    replan: 'the boss room lies behind the boss door',
    reached: (state) => VL.bossBeaten(state, DUNGEON),
  });
})();
