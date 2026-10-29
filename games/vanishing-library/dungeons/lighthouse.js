// Dungeon 3, the Lighthouse (design: The path through the game, 6): on the
// cliffs, pitch dark inside, so only the Glowstone lets the hero in; the
// Slingshot lies mid-dungeon; dark floors, mirrors that bounce the beam,
// targets across gaps; the Lens Crab in the lamp room at the top. Built on
// W13's framework (README "How to build a dungeon").
//
//                       lamp room (0,-3): the Lens Crab
//                            │ boss door
//   stair (-1,-2) ────── gallery (0,-2) ─door B─ workshop (1,-2): beam → boss key
//   dark floor, shells       │ bars (target)
//                       stairwell (0,-1) ─door A─ store (1,-1): the Slingshot
//                            │                        │ bars (target)
//   cellar (-1,0) ──── entrance (0,0)             cistern (1,0): beam → key B
//   dark floor, map, key A   statue, door out
(() => {
  const { rect } = VL.ART;
  const DUNGEON = 'lighthouse';
  const SWORD_WORDS = 'Something huge is moving up there! Better bring a sword.';
  const SHELL_WORDS = `Better bring ${VL.TUNING.lensCrabShellsAtDoor} broken shells for your slingshot up there!`;

  // ---------- tiles ----------

  VL.ART.addColors({
    lhStone: '#8a93a4',
    lhStoneDark: '#5b6374',
    lhStoneLight: '#b8c0ce',
    lhMortar: '#d6dbe4',
    lhPlank: '#9a7048',
    lhPlankDark: '#6e4e2e',
    lhPlankLight: '#ba8c5e',
    lhWater: '#1d4a66',
    lhWaterDark: '#112f44',
    lhWaterLight: '#3d7ba0',
  });

  VL.defineTileset(DUNGEON, {
    ...VL.DUNGEON_TILES,
    '#': { ...VL.DUNGEON_TILES['#'], art: 'lhWall' },
    _: { ...VL.DUNGEON_TILES._, art: 'lhFloor' },
    // Sea water in the cistern: a gap like a pit (shots and the beam cross it).
    x: { solid: true, pit: true, art: 'lhWater' },
  });

  // Whitewashed stone blocks, mortar lines staggered row by row.
  VL.ART.defineTileStyle('lhWall', {
    ground(ctx, cell) {
      const { x, y } = cell;
      rect(ctx, 'lhStoneDark', x, y, 16, 16);
      if (!cell.near(0, 1)?.floor) return;
      rect(ctx, 'lhStone', x, y + 2, 16, 13);
      rect(ctx, 'lhStoneLight', x, y + 2, 16, 1);
      const offset = Math.abs(cell.wx) % 2 ? 4 : 12;
      rect(ctx, 'lhMortar', x, y + 8, 16, 1);
      rect(ctx, 'lhMortar', x + offset, y + 3, 1, 5);
      rect(ctx, 'lhMortar', x + ((offset + 8) % 16), y + 9, 1, 5);
      rect(ctx, 'outline', x, y + 15, 16, 1);
    },
  });

  // Worn floorboards running across the room.
  VL.ART.defineTileStyle('lhFloor', {
    ground(ctx, cell) {
      const { x, y } = cell;
      rect(ctx, 'lhPlank', x, y, 16, 16);
      for (const row of [0, 5, 10, 15]) rect(ctx, 'lhPlankDark', x, y + row, 16, 1);
      // Rooms west and north of the entrance have negative world coordinates.
      rect(ctx, 'lhPlankDark', x + ((((cell.wx * 5 + cell.wy * 3) % 14) + 14) % 14) + 1, y + 1, 1, 4);
      rect(ctx, 'lhPlankLight', x + Math.floor(cell.seed(1) * 12) + 1, y + 6 + Math.floor(cell.seed(2) * 3), 3, 1);
      if (cell.near(0, -1)?.wall) rect(ctx, 'shadow', x, y, 16, 3);
    },
  });

  VL.ART.defineTileStyle('lhWater', {
    ground(ctx, cell, t) {
      const { x, y } = cell;
      rect(ctx, 'lhWater', x, y, 16, 16);
      if (!cell.near(0, -1)?.pit) rect(ctx, 'lhWaterDark', x, y, 16, 4);
      const shift = Math.floor(t * 3 + cell.seed(1) * 8) % 8;
      rect(ctx, 'lhWaterLight', x + shift + 2, y + 7 + Math.floor(cell.seed(2) * 5), 4, 1);
      rect(ctx, 'lhWaterLight', x + ((shift + 9) % 12), y + 12, 3, 1);
    },
  });

  VL.defineArea(DUNGEON, { tileset: DUNGEON });

  // ---------- the rooms ----------

  const lamp = (id, x, y) => ({ type: 'glowLamp', id, x, y });
  // Books down from the highlands (ids kept for old saves).
  const trunk = (id, x, y) => ({ type: 'spot', id, x, y, how: 'trunk', by: 'W11', lock: id });

  VL.addScreens(DUNGEON, {
    // The entrance: the statue, the door out.
    '0,0': {
      tiles: [
        '#######_########',
        '#__#___________#',
        '#______________#',
        '#______________#',
        '#______________#',
        '_______________#',
        '#______________#',
        '#______________#',
        '#______________#',
        '#______________#',
        '#######m########',
      ],
      entities: [
        trunk('bookHighPathB', 13, 8),
        { type: 'door', x: 7, y: 10, to: { area: 'overworld', screen: '-1,1', tx: 7, ty: 5, facing: 'down' } },
        { type: 'saveStatue', x: 3, y: 2 },
        { type: 'sign', x: 10, y: 2, title: 'The Lighthouse', text: 'The keeper\'s old lamps still line the dark rooms. Hold your Glowstone up to one (S) and it will burn again.' },
      ],
    },
    // The cellar: a dark floor, one narrow way between the pits, the map on
    // it (found early, as in the other dungeons, W38) and key A at its end.
    '-1,0': {
      tiles: [
        '################',
        '#oooooooooooooo#',
        '#o__oo______ooo#',
        '#o_ooo_oooo_ooo#',
        '#o_ooo_oooo____#',
        '#o_ooo_oooo_____',
        '#o_ooo_ooooo___#',
        '#o_ooo_oooooooo#',
        '#o_____oooooooo#',
        '#oooooooooooooo#',
        '################',
      ],
      entities: [
        { type: 'smallKey', id: 'd3KeyA', x: 2, y: 2, lock: 'd3KeyA' },
        { type: 'dungeonMap', id: 'd3Map', x: 8, y: 2 },
        lamp('d3LampCellarA', 14, 6),
        lamp('d3LampCellarB', 3, 2),
        { type: 'bat', x: 9, y: 7 },
      ],
    },
    // The stairwell: door A east; the way up is barred until the target
    // across the pits is hit.
    '0,-1': {
      tiles: [
        '#######_########',
        '#o_oo__________#',
        '#oooo__________#',
        '#oooo__________#',
        '#______________#',
        '#_______________',
        '#______________#',
        '#______________#',
        '#______________#',
        '#______________#',
        '#######_########',
      ],
      entities: [
        trunk('bookHighScree', 14, 9),
        { type: 'shellTarget', id: 'd3TargetStair', x: 2, y: 1 },
        { type: 'shutter', id: 'd3ShutterStair', x: 7, y: 0, open: { switch: 'd3TargetStair' } },
        { type: 'lockedDoor', id: 'd3DoorA', kind: 'small', x: 15, y: 5, lock: 'd3DoorA' },
        { type: 'sign', x: 10, y: 1, title: 'The keeper\'s note', text: 'Hit the target and the bars go up. My old slingshot is in the store room.' },
        { type: 'slime', x: 11, y: 7, tough: true },
      ],
    },
    // The store room: the Slingshot in the big chest, and a target to try it on.
    '1,-1': {
      tiles: [
        '################',
        '#__________o_o_#',
        '#__________ooo_#',
        '#__________ooo_#',
        '#______________#',
        '_______________#',
        '#______________#',
        '#______________#',
        '#______________#',
        '#______________#',
        '#######_########',
      ],
      entities: [
        trunk('bookLairB', 2, 9),
        { type: 'lockedDoor', id: 'd3DoorA', kind: 'small', x: 0, y: 5, lock: 'd3DoorA' },
        { type: 'bigChest', id: 'd3SlingChest', x: 5, y: 2, item: 'slingshot' },
        { type: 'shellTarget', id: 'd3TargetStore', x: 12, y: 1 },
        { type: 'shutter', id: 'd3ShutterStore', x: 7, y: 10, open: { switch: 'd3TargetStore' } },
      ],
    },
    // The cistern: the beam from the lamp shaft, a mirror on the floor and
    // one on an island in the water; lit, the crystal lifts the bars on key B.
    '1,0': {
      tiles: [
        '#######_########',
        '#______________#',
        '#______________#',
        '#______________#',
        '#_______xxxxx__#',
        '#_______xxxxx__#',
        '#_______xxxxx__#',
        '#_______xxxxx#_#',
        '#_______xx_xx#_#',
        '#_______xxxxx#_#',
        '################',
      ],
      entities: [
        trunk('bookHighPathA', 2, 5),
        { type: 'beamSource', x: 1, y: 2, dir: 'right' },
        { type: 'beamMirror', x: 10, y: 2, turn: '/' },
        { type: 'beamMirror', x: 10, y: 8, turn: '\\' },
        { type: 'beamCrystal', id: 'd3CrystalCistern', x: 3, y: 8 },
        { type: 'shutter', id: 'd3ShutterKeyB', x: 14, y: 7, open: { switch: 'd3CrystalCistern' } },
        { type: 'smallKey', id: 'd3KeyB', x: 14, y: 9, lock: 'd3KeyB' },
        { type: 'bat', x: 5, y: 5 },
      ],
    },
    // The gallery: door B east, the boss door north, a warning in the stone.
    '0,-2': {
      tiles: [
        '#######_########',
        '#______________#',
        '#______________#',
        '#__#________#__#',
        '#______________#',
        '________________',
        '#______________#',
        '#__#________#__#',
        '#______________#',
        '#______________#',
        '#######_########',
      ],
      entities: [
        { type: 'lockedDoor', id: 'd3BossDoor', kind: 'boss', x: 7, y: 0, lock: 'd3BossDoor', oneWay: true, wants: { items: ['woodSword', 'metalSword'], note: SWORD_WORDS, has: { brokenShells: VL.TUNING.lensCrabShellsAtDoor }, hasNote: SHELL_WORDS } },
        { type: 'lockedDoor', id: 'd3DoorB', kind: 'small', x: 15, y: 5, lock: 'd3DoorB' },
        { type: 'sign', x: 5, y: 1, title: 'Carved in the stone', text: 'A crab as big as a cart took the great lens for its shell! Nobody has climbed to the lamp since.' },
        lamp('d3LampGalleryA', 2, 2),
        lamp('d3LampGalleryB', 13, 2),
        { type: 'slime', x: 11, y: 8, tough: true },
        { type: 'bat', x: 4, y: 6 },
      ],
    },
    // The stair: another dark floor, a chest of slingshot shells at the top.
    '-1,-2': {
      tiles: [
        '################',
        '#oooooooooooooo#',
        '#oo_____ooooooo#',
        '#oo_ooooooooooo#',
        '#oo_oooooooooo_#',
        '#oo_ooooo_______',
        '#oo_ooooo_ooooo#',
        '#oo_ooooo_ooooo#',
        '#o________ooooo#',
        '#oooooooooooooo#',
        '################',
      ],
      entities: [
        { type: 'chest', id: 'd3ShellChest', x: 7, y: 2, contents: [{ resource: 'brokenShells', amount: 5 }], found: { title: 'Five broken shells!', text: 'The old keeper\'s spares. Just right for a slingshot.' } },
        lamp('d3LampMapA', 14, 4),
        lamp('d3LampMapB', 2, 8),
        { type: 'bat', x: 11, y: 2 },
      ],
    },
    // The workshop: the beam through three mirrors (one on an island in the
    // pit) to the crystal that lifts the bars on the boss key.
    '1,-2': {
      tiles: [
        '################',
        '#______________#',
        '#_____________##',
        '#____________#_#',
        '#______________#',
        '_______________#',
        '#_________ooooo#',
        '#_________ooooo#',
        '#_________oo_oo#',
        '#_________ooooo#',
        '################',
      ],
      entities: [
        { type: 'lockedDoor', id: 'd3DoorB', kind: 'small', x: 0, y: 5, lock: 'd3DoorB' },
        { type: 'beamSource', x: 13, y: 2, dir: 'left' },
        { type: 'beamMirror', x: 4, y: 2, turn: '\\' },
        { type: 'beamMirror', x: 4, y: 8, turn: '/' },
        { type: 'beamMirror', x: 12, y: 8, turn: '\\' },
        { type: 'beamCrystal', id: 'd3CrystalWorkshop', x: 12, y: 4 },
        { type: 'shutter', id: 'd3ShutterBossKey', x: 14, y: 4, open: { switch: 'd3CrystalWorkshop' } },
        { type: 'bossKey', id: 'd3BossKey', x: 14, y: 3, lock: 'd3BossKey' },
        { type: 'bat', x: 8, y: 3 },
      ],
    },
    // The lamp room at the top: the Lens Crab.
    '0,-3': {
      tiles: [
        '################',
        '#______________#',
        '#______________#',
        '#______________#',
        '#______________#',
        '#______________#',
        '#______________#',
        '#______________#',
        '#______________#',
        '#______________#',
        '#######_########',
      ],
      entities: [
        { type: 'lensCrab', x: 7, y: 3 },
      ],
    },
  });

  VL.defineDarkRooms(DUNGEON, ['-1,0', '1,0', '0,-2', '-1,-2', '1,-2']);

  // ---------- the way in ----------

  VL.LIGHTHOUSE_SWORD_WORDS = SWORD_WORDS;
  VL.LIGHTHOUSE_SHELL_WORDS = SHELL_WORDS;
  VL.LIGHTHOUSE_DARK_WORDS = 'Pitch dark in there! You can\'t see a thing. You\'d need a light of your own.';
  VL.fillSpot('lighthouseDoor', {
    type: 'door', needs: 'glowstone', locked: VL.LIGHTHOUSE_DARK_WORDS,
    to: { area: DUNGEON, screen: '0,0', tx: 7, ty: 9, facing: 'up' },
  });

  // ---------- the boss and its rewards ----------

  VL.LIGHTHOUSE_TREASURE = { title: 'Inside the lens!', text: 'Tucked in the Lens Crab\'s shell: a lump of ore and a loose page!' };

  VL.defineDungeon(DUNGEON, {
    area: DUNGEON,
    name: 'Lighthouse',
    entrance: { area: 'overworld', screen: '-1,1', tx: 7, ty: 5, facing: 'down' },
    boss: {
      screen: '0,-3',
      type: 'lensCrab',
      heart: 'heartD3',
      warp: { tx: 7, ty: 8 },
      // Ore and the last page, held up together (design: "Reward: ore, a
      // heart and the last missing page"); the heart waits on the floor.
      onDefeat(state) {
        state.dungeonNote = { text: 'The Lens Crab is beaten!', t: 0 };
        VL.markFound(state, 'oreLighthouse');
        VL.addResource(state, 'ore', 1);
        VL.holdUp(state, 'pickup-ore', { sound: 'fanfare' });
        VL.holdUp(state, 'pickup-page');
        VL.showMessage(state, VL.LIGHTHOUSE_TREASURE);
        VL.findPage(state, 'pageLighthouse');
        VL.earned(state);
      },
    },
    light: 'indoor',
  });

  // ---------- progression (README "Progression") ----------

  const doc = '§ The path through the game, 6';
  const door = (id) => (state) => Boolean(state.dungeons[DUNGEON]?.doors[id]);
  const found = (id) => (state) => VL.spotFound(state, id);
  const keys = `smallKey:${DUNGEON}`;

  VL.defineLock('lighthouseEntered', { ...VL.LOCKS.lighthouseEntered, place: { area: DUNGEON, screen: '0,0' }, reached: (state) => Boolean(state.visited[`${DUNGEON}:0,0`]) });
  VL.defineLock('d3KeyA', { type: 'item', needs: ['lighthouseEntered'], supplies: { [keys]: 1 }, doc, reached: found('d3KeyA') });
  VL.defineLock('d3DoorA', { needs: ['lighthouseEntered'], consumes: { [keys]: 1 }, doc, reached: door('d3DoorA') });
  VL.defineLock('slingshot', {
    ...VL.LOCKS.slingshot,
    needs: ['lighthouseEntered', 'd3DoorA'],
    replan: 'found mid-dungeon: the Slingshot lies behind the first locked door',
    reached: (state) => VL.hasItem(state, 'slingshot'),
  });
  // Key B and door B lie past targets only a shot can hit.
  VL.defineLock('d3KeyB', { type: 'item', needs: ['slingshot'], supplies: { [keys]: 1 }, doc, reached: found('d3KeyB') });
  VL.defineLock('d3DoorB', { needs: ['slingshot'], consumes: { [keys]: 1 }, doc, reached: door('d3DoorB') });
  VL.defineLock('d3BossKey', { type: 'item', needs: ['d3DoorB'], gives: [`bossKey:${DUNGEON}`], doc, reached: found('d3BossKey') });
  VL.defineLock('d3BossDoor', { needs: ['slingshot', 'brokenShells', `bossKey:${DUNGEON}`, ['woodSword', 'metalSword']], doc, reached: door('d3BossDoor') });
  VL.defineLock('d3Boss', {
    ...VL.LOCKS.d3Boss,
    needs: ['lighthouseEntered', 'slingshot', 'brokenShells', ['woodSword', 'metalSword'], 'd3BossDoor'],
    replan: 'the boss room lies behind the boss door',
    reached: (state) => VL.bossBeaten(state, DUNGEON),
  });
})();
