// The sample dungeon: a four-room dungeon the tests and the browser smoke
// load on top of the game (never in the manifest). It is also the worked
// example for README "Dungeons": every framework piece is used once, and
// its locks show how a dungeon registers its keys with the solver.
//
//   yard ─door─ hall (0,0) ─shutter(cleared)─ block room (1,0): block → plate → key, the map
//                 │ locked door (1 small key)
//               switch room (0,-1): switch → boss key; a pit
//                 │ boss door
//               boss room (0,-2): the golem, then a heart and the warp out
(() => {
  // ---------- the yard outside ----------

  VL.addScreens('sampleYard', {
    '0,0': {
      tiles: [
        'TTTTTTTTTTTTTTTT',
        'T......HHH.....T',
        'T......HHH.....T',
        'T......HDH.....T',
        'T..............T',
        'T..............T',
        'T..............T',
        'T..............T',
        'T..............T',
        'T..............T',
        'TTTTTTTTTTTTTTTT',
      ],
      entities: [
        { type: 'door', x: 8, y: 3, to: { area: 'sample', screen: '0,0', tx: 7, ty: 9, facing: 'up' } },
        { type: 'chest', id: 'sampleChest', x: 3, y: 6, contents: [{ item: 'woodSword' }] },
      ],
    },
  });

  // ---------- the rooms ----------

  VL.defineTileset('sampleDungeon', { ...VL.DUNGEON_TILES });
  VL.defineArea('sample', { tileset: 'sampleDungeon' });
  VL.addScreens('sample', {
    // The entrance hall: the statue, a slime, a shutter east that lifts
    // once it is beaten, a locked door north.
    '0,0': {
      tiles: [
        '#######_########',
        '#______________#',
        '#______________#',
        '#______________#',
        '#______________#',
        '#_______________',
        '#______________#',
        '#______________#',
        '#______________#',
        '#______________#',
        '#######m########',
      ],
      entities: [
        { type: 'door', x: 7, y: 10, to: { area: 'sampleYard', screen: '0,0', tx: 8, ty: 4, facing: 'down' } },
        { type: 'saveStatue', x: 2, y: 1 },
        { type: 'slime', x: 9, y: 5 },
        { type: 'shutter', id: 'sampleShutterEast', x: 15, y: 5, open: { cleared: true } },
        { type: 'lockedDoor', id: 'sampleDoorNorth', kind: 'small', x: 7, y: 0, lock: 'sampleDoorNorth' },
      ],
    },
    // The block room: the block onto the plate lifts the shutter round the key.
    '1,0': {
      tiles: [
        '################',
        '#______________#',
        '#______________#',
        '#____#####_____#',
        '#____#___#_____#',
        '_____#___#_____#',
        '#____##_##_____#',
        '#______________#',
        '#______________#',
        '#______________#',
        '################',
      ],
      entities: [
        { type: 'dungeonMap', id: 'sampleMap', x: 2, y: 2 },
        { type: 'pressurePlate', id: 'samplePlate', x: 12, y: 8, latch: true, weight: 'block' },
        { type: 'pushBlock', x: 11, y: 8 },
        { type: 'shutter', id: 'sampleShutterKey', x: 7, y: 6, open: { plate: 'samplePlate' } },
        { type: 'smallKey', id: 'sampleKey', x: 7, y: 4, lock: 'sampleKey' },
      ],
    },
    // The switch room: the lever lifts the shutter round the boss key.
    '0,-1': {
      tiles: [
        '#######_########',
        '#______________#',
        '#___________oo_#',
        '#___________oo_#',
        '#_____#####____#',
        '#_____#___#____#',
        '#_____##_##____#',
        '#______________#',
        '#______________#',
        '#______________#',
        '#######_########',
      ],
      entities: [
        { type: 'lockedDoor', id: 'sampleDoorNorth', kind: 'small', x: 7, y: 10, lock: 'sampleDoorNorth' },
        { type: 'switch', id: 'sampleSwitch', x: 3, y: 3 },
        { type: 'shutter', id: 'sampleShutterBossKey', x: 8, y: 6, open: { switch: 'sampleSwitch' } },
        { type: 'bossKey', id: 'sampleBossKey', x: 8, y: 5, lock: 'sampleBossKey' },
        { type: 'lockedDoor', id: 'sampleBossDoor', kind: 'boss', x: 7, y: 0, lock: 'sampleBossDoor', oneWay: true },
      ],
    },
    // The boss room: bars drop on the entry tile behind the hero until the
    // golem falls (the boss door is one-sided: this room is only reached through it).
    '0,-2': {
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
        { type: 'sampleGolem', x: 7, y: 4 },
      ],
    },
  });

  // ---------- the boss ----------

  VL.tune({ enemySampleGolem: { hp: 3, damage: 1 } });
  VL.ART.defineSprite('enemy-sample-golem', {
    colors: { s: 'dgnStone', d: 'dgnStoneDark', l: 'dgnStoneLight', e: 'heart' },
    rows: [
      '..llllllll..',
      '.lssssssssl.',
      '.lsessssesl.',
      '.lssssssssl.',
      '..ssssssss..',
      'llssssssssll',
      'lsssssssssdl',
      'lsddssssddsl',
      '.ddssssssdd.',
      '..ssssssss..',
      '..ss....ss..',
      '..dd....dd..',
    ],
  });
  VL.defineEnemy('sampleGolem', {
    tuning: 'enemySampleGolem',
    size: 'big',
    body: { w: 12, h: 12 },
    rooted: true,
    faint: 'The golem was too heavy for you.',
    // Stomps where it stands (a boss the tests can walk up to); it hurts to touch.
    think(state, golem, dt) {
      golem.timer += dt;
    },
    draw(ctx, golem, cx, cy, t) {
      VL.ART.drawShadow(ctx, cx, cy + 7, 14);
      VL.ART.drawSprite(ctx, 'enemy-sample-golem', cx - 6, cy - 7 + (Math.floor(t * 2) % 2));
    },
  });

  VL.defineDungeon('sample', {
    area: 'sample',
    name: 'Sample Vault',
    entrance: { area: 'sampleYard', screen: '0,0', tx: 8, ty: 4, facing: 'down' },
    boss: { screen: '0,-2', type: 'sampleGolem', heart: 'heartSample', warp: { tx: 7, ty: 7 } },
  });

  // ---------- its locks (README "Progression") ----------

  const doc = '§ The world: Each dungeon has Zelda conventions';
  VL.defineLock('sampleEntered', { type: 'place', needs: ['start'], place: { area: 'sample', screen: '0,0' }, doc, reached: (state) => Boolean(state.visited['sample:0,0']) });
  VL.defineLock('sampleKey', { type: 'item', needs: ['sampleEntered'], supplies: { 'smallKey:sample': 1 }, doc, reached: (state) => VL.spotFound(state, 'sampleKey') });
  VL.defineLock('sampleDoorNorth', { needs: ['sampleEntered'], consumes: { 'smallKey:sample': 1 }, doc, reached: (state) => Boolean(state.dungeons.sample?.doors.sampleDoorNorth) });
  VL.defineLock('sampleBossKey', { type: 'item', needs: ['sampleDoorNorth'], gives: ['bossKey:sample'], doc, reached: (state) => VL.spotFound(state, 'sampleBossKey') });
  VL.defineLock('sampleBossDoor', { needs: ['sampleDoorNorth', 'bossKey:sample'], doc, reached: (state) => Boolean(state.dungeons.sample?.doors.sampleBossDoor) });
  VL.defineLock('sampleBoss', { needs: ['sampleBossDoor', ['woodSword', 'metalSword']], gives: ['heartSample'], doc, reached: (state) => VL.bossBeaten(state, 'sample') });
})();
