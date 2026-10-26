// The shipwreck below deck (design: The world, "Shipwreck: offshore, reachable
// by raft. A small mini-dungeon"; The path through the game, 5: "the
// shipwreck (ore and a page)"), on W13's framework. Also the lake island's
// ore and the two raft places' locks. README "The shipwreck (W17)".
//
//   hold (0,0): ladder up to the deck, ── locked door ── captain's cabin (1,0):
//   lantern, crabs                                        the page, a chest of shells
//        │
//   bilge (0,1): flooded; grapple posts across to the key's chest and the ore
(() => {
  const { rect } = VL.ART;
  const AREA = 'wreck';

  // ---------- tiles ----------

  VL.ART.addColors({
    wreckPlank: '#8a5a32',
    wreckPlankDark: '#5e3a1f',
    wreckPlankLight: '#a87444',
    wreckBilge: '#2f5f6e',
    wreckBilgeLight: '#4f8794',
  });

  VL.defineTileset(AREA, {
    ...VL.DUNGEON_TILES,
    '#': { ...VL.DUNGEON_TILES['#'], art: 'wreckWall' },
    _: { ...VL.DUNGEON_TILES._, art: 'wreckFloor' },
    m: { ...VL.DUNGEON_TILES.m, art: 'wreckLadder' },
    n: { ...VL.DUNGEON_TILES.n, art: 'wreckFloor' },
    // Seawater in the hold: a pit, so neither the raft nor a carried chicken
    // crosses it; thrown things splash.
    '~': { solid: true, pit: true, water: true, art: 'wreckBilge' },
    c: { solid: true, crate: true, art: 'wreckCrate' },
  });

  // The hull's inside: dark ribs, with a plank face where the floor meets it.
  VL.ART.defineTileStyle('wreckWall', {
    ground(ctx, cell) {
      const { x, y } = cell;
      rect(ctx, 'hullDark', x, y, 16, 16);
      if (!cell.near(0, 1)?.floor) return;
      rect(ctx, 'wreckPlankDark', x, y + 3, 16, 12);
      for (let row = 0; row < 3; row += 1) rect(ctx, 'wreckPlank', x, y + 4 + row * 4, 16, 3);
      if (cell.wx % 3 === 0) {
        rect(ctx, 'hullDark', x + 6, y + 2, 4, 13);
        rect(ctx, 'wreckPlankLight', x + 6, y + 2, 1, 13);
      }
      rect(ctx, 'outline', x, y + 15, 16, 1);
    },
  });

  // Deck planks, nailed, with the odd puddle.
  VL.ART.defineTileStyle('wreckFloor', {
    ground(ctx, cell) {
      const { x, y } = cell;
      rect(ctx, 'wreckPlank', x, y, 16, 16);
      for (let row = 0; row < 4; row += 1) {
        rect(ctx, 'wreckPlankDark', x, y + row * 4 + 3, 16, 1);
        const seam = (cell.wx * 5 + row * 7 + cell.wy * 3) % 16;
        rect(ctx, 'wreckPlankDark', x + seam, y + row * 4, 1, 3);
        rect(ctx, 'wreckPlankLight', x + ((seam + 8) % 16), y + row * 4, 2, 1);
      }
      if (cell.seed(1) > 0.85) rect(ctx, 'wreckBilgeLight', x + 3 + Math.floor(cell.seed(2) * 8), y + 9, 4, 2);
      if (cell.near(0, -1)?.wall) rect(ctx, 'shadow', x, y, 16, 3);
    },
  });

  // A ladder up through the hatch.
  VL.ART.defineTileStyle('wreckLadder', {
    under: 'wreckFloor',
    raised(ctx, cell) {
      const { x, y } = cell;
      rect(ctx, 'doorway', x + 2, y, 12, 14);
      rect(ctx, 'outline', x + 3, y - 2, 2, 16);
      rect(ctx, 'outline', x + 11, y - 2, 2, 16);
      rect(ctx, 'woodLight', x + 3, y - 2, 1, 16);
      rect(ctx, 'woodLight', x + 11, y - 2, 1, 16);
      for (let rung = 0; rung < 4; rung += 1) rect(ctx, 'wood', x + 4, y + rung * 4, 8, 2);
    },
  });

  VL.ART.defineTileStyle('wreckBilge', {
    ground(ctx, cell, t) {
      const { x, y } = cell;
      rect(ctx, 'wreckBilge', x, y, 16, 16);
      const drift = Math.floor(t * 3 + cell.wx) % 8;
      rect(ctx, 'wreckBilgeLight', x + drift, y + 5, 5, 1);
      rect(ctx, 'wreckBilgeLight', x + ((drift + 9) % 12), y + 11, 4, 1);
      if (cell.near(0, -1)?.floor) {
        rect(ctx, 'shadow', x, y, 16, 3);
        rect(ctx, 'foam', x + (Math.floor(t * 2) % 2), y + 3, 15, 1);
      }
    },
  });

  VL.ART.defineSprite('tile-wreck-crate', {
    outline: false,
    colors: { o: 'outline', d: 'woodDark', w: 'wood', l: 'woodLight' },
    rows: [
      'oooooooooooooo',
      'ollllllllllldo',
      'olwwwwwwwwwwdo',
      'olwdwwwwwwdwdo',
      'olwwdwwwwdwwdo',
      'olwwwdwwdwwwdo',
      'olwwwwddwwwwdo',
      'olwwwwddwwwwdo',
      'olwwwdwwdwwwdo',
      'olwwdwwwwdwwdo',
      'olwdwwwwwwdwdo',
      'oddddddddddddo',
      'oooooooooooooo',
    ],
  });
  VL.ART.defineTileStyle('wreckCrate', {
    under: 'wreckFloor',
    shadow: (ctx, cell) => rect(ctx, 'shadow', cell.x + 2, cell.y + 13, 14, 3),
    raised: (ctx, cell) => VL.ART.drawSprite(ctx, 'tile-wreck-crate', cell.x + 1, cell.y + 1),
  });

  // The captain's desk: a chart, an ink pot and a stub of candle.
  VL.defineDecor('wreckDesk', (ctx, x, y, t) => {
    VL.ART.drawShadow(ctx, x + 16, y + 15, 30);
    rect(ctx, 'outline', x + 1, y + 2, 30, 12);
    rect(ctx, 'woodDark', x + 2, y + 3, 28, 10);
    rect(ctx, 'wood', x + 2, y + 3, 28, 3);
    rect(ctx, 'parchment', x + 5, y + 4, 11, 6);
    rect(ctx, 'mapInk', x + 7, y + 6, 6, 1);
    rect(ctx, 'mapInk', x + 9, y + 8, 4, 1);
    rect(ctx, 'inkPot', x + 19, y + 5, 3, 3);
    rect(ctx, 'paperWhite', x + 25, y + 2, 2, 4);
    rect(ctx, Math.sin(t * 9) > 0 ? 'fire' : 'fireLight', x + 25, y, 2, 2);
  });

  VL.defineArea(AREA, { tileset: AREA });

  // ---------- the rooms ----------

  const post = (x, y) => ({ type: 'grapplePost', x, y });

  VL.addScreens(AREA, {
    // The hold, under the hatch: the ladder up, a lantern on the way down
    // (a faint or a reload wakes him here until the page is found), and the
    // cabin's locked door.
    '0,0': {
      tiles: [
        '#######m########',
        '#c_____________#',
        '#c_____________#',
        '#______________#',
        '#______________#',
        '#_______________',
        '#______________#',
        '#c____________c#',
        '#cc__________cc#',
        '#______________#',
        '#######_########',
      ],
      entities: [
        { type: 'door', x: 7, y: 0, to: { area: 'overworld', screen: '5,2', tx: 8, ty: 6, facing: 'down' } },
        { type: 'savePoint', x: 7, y: 3 },
        { type: 'lockedDoor', id: 'wreckDoor', kind: 'small', x: 15, y: 5, lock: 'wreckDoor' },
        { type: 'crab', x: 3, y: 4 },
        { type: 'crab', x: 12, y: 7 },
      ],
    },
    // The bilge: seawater across the hold. A post on each side, so the way
    // back is never cut off; the key's chest and the ore wait on the far side.
    '0,1': {
      tiles: [
        '#######_########',
        '#______________#',
        '#______________#',
        '#______________#',
        '#~~~~~~~~~~~~~~#',
        '#~~~~~~~~~~~~~~#',
        '#~~~~~~~~~~~~~~#',
        '#______________#',
        '#______________#',
        '#c____________c#',
        '################',
      ],
      entities: [
        { type: 'sign', x: 9, y: 1, title: 'Scratched on a beam', text: 'Bilge flooded! Crew: hook the far post and pull yourselves across.' },
        post(4, 2),
        post(11, 8),
        { type: 'chest', id: 'wreckKeyChest', x: 3, y: 9, contents: [{ smallKey: 'wreck' }] },
        { type: 'ore', id: 'oreShipwreck', x: 13, y: 9 },
      ],
    },
    // The captain's cabin.
    '1,0': {
      tiles: [
        '################',
        '#nn____________#',
        '#______________#',
        '#______________#',
        '#______________#',
        '_______________#',
        '#______________#',
        '#______________#',
        '#____________cc#',
        '#_____________c#',
        '################',
      ],
      entities: [
        { type: 'lockedDoor', id: 'wreckDoor', kind: 'small', x: 0, y: 5, lock: 'wreckDoor' },
        { type: 'decor', art: 'wreckDesk', x: 1, y: 1 },
        { type: 'page', id: 'pageShipwreck', x: 11, y: 3 },
        { type: 'chest', id: 'wreckShellChest', x: 7, y: 2, contents: [{ resource: 'shells', amount: 5 }] },
      ],
    },
  });

  // ---------- the way in, and the island ----------

  VL.fillSpot('shipwreckHatch', { type: 'door', to: { area: AREA, screen: '0,0', tx: 7, ty: 1, facing: 'down' } });
  VL.fillSpot('oreLakeIsland', { type: 'ore', id: 'oreLakeIsland' });

  // Once the page is found, the hold's lantern hands the save point to the
  // harbour, so no Continue or faint starts below deck out at sea (as a
  // beaten dungeon's warp does, README "The boss room").
  VL.WRECK_HOME = { area: 'overworld', screen: '2,1', tx: 8, ty: 7, facing: 'down' };
  VL.nameWakePlace(VL.WRECK_HOME, 'by the harbour');
  VL.moveSavePoint((state, point) => (point.area === AREA && VL.spotFound(state, 'pageShipwreck') ? VL.WRECK_HOME : null));

  VL.defineDungeon('wreck', {
    area: AREA,
    name: 'Shipwreck',
    entrance: { area: 'overworld', screen: '5,2', tx: 8, ty: 6, facing: 'down' },
    light: 'indoor',
  });

  // ---------- progression (README "Progression") ----------

  const doc = '§ The path through the game, 5';
  const found = (id) => (state) => VL.spotFound(state, id);
  const keys = 'smallKey:wreck';

  VL.defineLock('lakeIsland', {
    ...VL.LOCKS.lakeIsland,
    place: { area: 'overworld', screen: '3,-3' },
    reached: (state) => Boolean(state.visited['overworld:3,-3']),
  });
  VL.defineLock('oreLakeIsland', { ...VL.LOCKS.oreLakeIsland, reached: found('oreLakeIsland') });
  VL.defineLock('shipwreck', {
    ...VL.LOCKS.shipwreck,
    place: { area: 'overworld', screen: '5,2' },
    reached: (state) => VL.regionVisited(state, 'shipwreck'),
  });
  VL.defineLock('wreckKeyChest', { type: 'item', needs: ['shipwreck', 'grapplingRope'], supplies: { [keys]: 1 }, doc, reached: found('wreckKeyChest') });
  VL.defineLock('wreckDoor', { needs: ['shipwreck'], consumes: { [keys]: 1 }, doc, reached: (state) => Boolean(state.dungeons.wreck?.doors.wreckDoor) });
  VL.defineLock('oreShipwreck', {
    ...VL.LOCKS.oreShipwreck,
    needs: ['shipwreck', 'grapplingRope'],
    replan: 'below deck, across the flooded bilge on the rope',
    reached: found('oreShipwreck'),
  });
  VL.defineLock('pageShipwreck', {
    ...VL.LOCKS.pageShipwreck,
    needs: ['shipwreck', 'wreckDoor'],
    replan: 'in the captain\'s cabin, behind the wreck\'s locked door',
    reached: found('pageShipwreck'),
  });
})();
