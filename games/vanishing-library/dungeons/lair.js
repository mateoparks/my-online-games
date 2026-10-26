// Dungeon 4, the Dragon's Lair (design: The path through the game, 8): a
// cave at the top of the highlands, warm with lava; the Mirror Shield lies
// mid-dungeon, stone dragon heads breathe fire that only it sends home, and
// the Dragon sleeps on its hoard of stolen books at the top. Built on W13's
// framework (README "How to build a dungeon").
//
//                       hoard (0,-3): the Dragon
//                            │ boss door
//   ledge (-1,-2) ────── great cave (0,-2) ─door B─ forge (1,-2)
//   spout → key B, map       │ bars (spout)         block, spout → boss key
//   shield room (-1,-1) ─door A─ hall (0,-1)
//   the Mirror Shield            │
//   cellar (-1,0) ─────── entrance (0,0)
//   block on plate → key A   statue, door out to overworld -1,-5
(() => {
  const { rect } = VL.ART;
  const DUNGEON = 'lair';
  const SWORD_WORDS = 'A great snore comes from up there! Better bring a metal sword.';

  // ---------- tiles ----------

  VL.ART.addColors({
    lairRock: '#6a4b3e',
    lairRockDark: '#45302a',
    lairRockLight: '#8c6a57',
    lairFloor: '#9a7a5c',
    lairFloorDark: '#7d5f45',
    lairFloorLight: '#b8987a',
    lava: '#e8572a',
    lavaDark: '#b33a1e',
    lavaLight: '#ff9a4a',
  });

  VL.defineTileset(DUNGEON, {
    ...VL.DUNGEON_TILES,
    '#': { ...VL.DUNGEON_TILES['#'], art: 'lairWall' },
    _: { ...VL.DUNGEON_TILES._, art: 'lairFloor' },
    // Lava: a gap like a pit (fire crosses it; no chicken flies it, no block
    // or enemy goes in). The hero may walk on it, and each step in hurts.
    '~': { solid: true, pit: true, lava: true, hurts: true, art: 'lairLava' },
  });

  VL.tune({ lavaDamage: 1 });
  VL.defineHeroFooting('lava', (state, info) => Boolean(info.lava));
  VL.addFaintLine('lava', 'The lava was much too hot to walk on!');
  // Each step onto a lava tile burns once; standing still on it is safe.
  // In the air he is never burned: a chicken flight, or the rope's pull to a
  // post (which never lands him on lava, since lava is solid to the hook).
  VL.defineSystem('lavaBurns', {
    order: 12,
    update(state) {
      const player = state.player;
      if (state.hp <= 0 || player.flight || player.rope?.phase === 'pull' || state.transition) return;
      const { tx, ty } = VL.heroTile(state);
      const room = state.room;
      const here = `${room.area}:${room.screen}:${tx},${ty}`;
      if (!VL.tileInfo(room.area, VL.tileAt(room.area, room.screen, tx, ty, room)).lava) {
        player.onLava = null;
        return;
      }
      if (player.onLava === here) return;
      player.onLava = here;
      state.hp = Math.max(0, state.hp - VL.TUNING.lavaDamage);
      state.events.push({ type: 'heroHurt', cause: 'lava', damage: VL.TUNING.lavaDamage });
      if (state.hp <= 0) {
        player.knockback = null;
        VL.faint(state, 'lava');
      }
    },
  });

  VL.ART.defineTileStyle('lairWall', {
    ground(ctx, cell) {
      const { x, y } = cell;
      rect(ctx, 'lairRockDark', x, y, 16, 16);
      const below = cell.near(0, 1);
      if (!below?.floor && !below?.lava) return;
      rect(ctx, 'lairRock', x, y + 2, 16, 13);
      rect(ctx, 'lairRockLight', x + Math.floor(cell.seed(1) * 10), y + 3, 5, 1);
      rect(ctx, 'lairRockDark', x + Math.floor(cell.seed(2) * 12), y + 8 + Math.floor(cell.seed(3) * 4), 4, 1);
      rect(ctx, 'outline', x, y + 15, 16, 1);
    },
  });

  VL.ART.defineTileStyle('lairFloor', {
    ground(ctx, cell) {
      const { x, y } = cell;
      rect(ctx, 'lairFloor', x, y, 16, 16);
      for (let i = 0; i < 3; i += 1) {
        rect(ctx, 'lairFloorDark', x + Math.floor(cell.seed(i + 1) * 13), y + Math.floor(cell.seed(i + 4) * 13), 3, 2);
        rect(ctx, 'lairFloorLight', x + Math.floor(cell.seed(i + 7) * 14), y + Math.floor(cell.seed(i + 10) * 14), 2, 1);
      }
      if (cell.near(0, -1)?.wall) rect(ctx, 'shadow', x, y, 16, 3);
      // The lava's warmth on the floor beside it.
      if (cell.near(0, -1)?.lava) rect(ctx, 'caveGlow', x, y, 16, 4);
      if (cell.near(0, 1)?.lava) rect(ctx, 'caveGlow', x, y + 12, 16, 4);
      if (cell.near(-1, 0)?.lava) rect(ctx, 'caveGlow', x, y, 4, 16);
      if (cell.near(1, 0)?.lava) rect(ctx, 'caveGlow', x + 12, y, 4, 16);
    },
  });

  // Slow-moving crust on bright lava; the highlights drift, never blink.
  VL.ART.defineTileStyle('lairLava', {
    ground(ctx, cell, t) {
      const { x, y } = cell;
      rect(ctx, 'lava', x, y, 16, 16);
      if (!cell.near(0, -1)?.lava) rect(ctx, 'lavaDark', x, y, 16, 3);
      const drift = Math.floor(t * 2 + cell.seed(1) * 12) % 12;
      rect(ctx, 'lavaLight', x + 2 + drift, y + 6 + Math.floor(cell.seed(2) * 4), 3, 1);
      rect(ctx, 'lavaDark', x + ((drift + 6) % 12) + 1, y + 11, 4, 2);
    },
  });

  VL.defineArea(DUNGEON, { tileset: DUNGEON });

  // ---------- the rooms ----------

  const spout = (id, x, y, dir) => ({ type: 'fireSpout', id, x, y, dir });

  VL.addScreens(DUNGEON, {
    // The entrance: the statue, the door out, a warning.
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
        { type: 'door', x: 7, y: 10, to: { area: 'overworld', screen: '-1,-5', tx: 7, ty: 5, facing: 'down' } },
        { type: 'saveStatue', x: 3, y: 2 },
        { type: 'sign', x: 10, y: 2, title: 'Scratched on the rock', text: 'Turn back! The Dragon sleeps on a mountain of books up there, and it does not like visitors.' },
      ],
    },
    // The cellar: a block shoved onto the plate lifts the bars on key A.
    '-1,0': {
      tiles: [
        '################',
        '#_#____________#',
        '#_#____________#',
        '#______~~~~____#',
        '#______~~~~____#',
        '#_______________',
        '#__~~__________#',
        '#__~~___#_#____#',
        '#_______#_#____#',
        '#_______###____#',
        '################',
      ],
      entities: [
        { type: 'smallKey', id: 'd4KeyA', x: 1, y: 1, lock: 'd4KeyA' },
        { type: 'shutter', id: 'd4BarsKeyA', x: 1, y: 2, open: { plate: 'd4PlateCellar' } },
        { type: 'pushBlock', x: 9, y: 7 },
        { type: 'pressurePlate', id: 'd4PlateCellar', x: 9, y: 8, weight: 'block', latch: true },
        { type: 'slime', x: 12, y: 7 },
        { type: 'bat', x: 5, y: 2 },
      ],
    },
    // The hall: door A west; the way up barred until the stone head across
    // the lava is choked with its own fire.
    '0,-1': {
      tiles: [
        '#######_########',
        '#_________~~~__#',
        '#_________~~~__#',
        '#______________#',
        '#______________#',
        '_______________#',
        '#______________#',
        '#______________#',
        '#______________#',
        '#______________#',
        '#######_########',
      ],
      entities: [
        spout('d4SpoutHall', 11, 0, 'down'),
        { type: 'shutter', id: 'd4BarsHall', x: 7, y: 0, open: { switch: 'd4SpoutHall' } },
        { type: 'lockedDoor', id: 'd4DoorA', kind: 'small', x: 0, y: 5, lock: 'd4DoorA' },
        { type: 'bat', x: 4, y: 7 },
      ],
    },
    // The shield room: the Mirror Shield in the big chest.
    '-1,-1': {
      tiles: [
        '################',
        '#______________#',
        '#______________#',
        '#_____#__#_____#',
        '#______________#',
        '#_______________',
        '#______________#',
        '#_____#__#_____#',
        '#______________#',
        '#______________#',
        '################',
      ],
      entities: [
        { type: 'lockedDoor', id: 'd4DoorA', kind: 'small', x: 15, y: 5, lock: 'd4DoorA' },
        { type: 'bigChest', id: 'd4ShieldChest', x: 7, y: 2, item: 'mirrorShield' },
        { type: 'slime', x: 3, y: 8 },
      ],
    },
    // The great cave: the boss door north, door B east, the ledge west.
    '0,-2': {
      tiles: [
        '#######_########',
        '#______________#',
        '#__~~______~~__#',
        '#__~~______~~__#',
        '#______________#',
        '________________',
        '#______________#',
        '#__~~______~~__#',
        '#__~~______~~__#',
        '#______________#',
        '#######_########',
      ],
      entities: [
        { type: 'lockedDoor', id: 'd4BossDoor', kind: 'boss', x: 7, y: 0, lock: 'd4BossDoor', oneWay: true, wants: { items: ['metalSword'], note: SWORD_WORDS } },
        { type: 'lockedDoor', id: 'd4DoorB', kind: 'small', x: 15, y: 5, lock: 'd4DoorB' },
        { type: 'bat', x: 10, y: 4 },
        { type: 'bat', x: 4, y: 6 },
      ],
    },
    // The ledge: the dungeon map, and key B behind bars that a stone head
    // across the lava keeps shut.
    '-1,-2': {
      tiles: [
        '################',
        '#_#_____~~~____#',
        '#_#_____~~~____#',
        '#_______~~~____#',
        '#______________#',
        '#_______________',
        '#______________#',
        '#__~~~~________#',
        '#__~~~~________#',
        '#______________#',
        '################',
      ],
      entities: [
        spout('d4SpoutLedge', 9, 0, 'down'),
        { type: 'shutter', id: 'd4BarsKeyB', x: 1, y: 2, open: { switch: 'd4SpoutLedge' } },
        { type: 'smallKey', id: 'd4KeyB', x: 1, y: 1, lock: 'd4KeyB' },
        { type: 'dungeonMap', id: 'd4Map', x: 3, y: 9 },
        { type: 'slime', x: 12, y: 8 },
      ],
    },
    // The forge: a stone head in the east wall breathes along row 6, but a
    // block stands in its way; shove it aside and send the fire home, and
    // the bars on the boss key lift.
    '1,-2': {
      tiles: [
        '################',
        '#______________#',
        '#______________#',
        '#______________#',
        '#___________~~~#',
        '____________~~~#',
        '#___________~~~#',
        '#___________~~~#',
        '#________#_#####',
        '#________#_#####',
        '################',
      ],
      entities: [
        { type: 'lockedDoor', id: 'd4DoorB', kind: 'small', x: 0, y: 5, lock: 'd4DoorB' },
        spout('d4SpoutForge', 15, 6, 'left'),
        { type: 'pushBlock', x: 8, y: 6 },
        { type: 'shutter', id: 'd4BarsBossKey', x: 10, y: 8, open: { switch: 'd4SpoutForge' } },
        { type: 'bossKey', id: 'd4BossKey', x: 10, y: 9, lock: 'd4BossKey' },
        { type: 'bat', x: 4, y: 2 },
      ],
    },
    // The hoard: the Dragon on its mountain of stolen books.
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
        { type: 'decor', art: 'lairHoard', x: 0, y: 0 },
        { type: 'dragon', x: 7, y: 2 },
      ],
    },
  });

  // ---------- the hoard ----------

  const BOOK_COLORS = ['heart', 'water', 'leaf', 'gold', 'roof', 'tunic', 'berry'];
  // Piles of books (and a few shells) along the back of the hoard room; once
  // the Dragon is beaten they lie spilled across the floor.
  // A book or shell that would land under the keys readout slides left of it.
  const clearOfHud = (left, top, w, h) => {
    const box = VL.DUNGEON_HUD;
    return top < box.y + box.h && top + h > box.y && left + w > box.x ? box.x - w : left;
  };
  VL.defineDecor('lairHoard', (ctx, x, y, _t, decor) => {
    const spilled = decor.spilled;
    const count = spilled ? 46 : 26;
    for (let i = 0; i < count; i += 1) {
      const h = (n) => VL.ART.hash(i, n, 19);
      const flat = h(3) > 0.5;
      const w = flat ? 7 : 4;
      const hgt = flat ? 3 : 6;
      const top = spilled ? 20 + Math.floor(h(2) * 120) : 16 + Math.floor(h(2) * 22);
      const bx = x + clearOfHud(18 + Math.floor(h(1) * 214) - 1, top - 1, w + 2, hgt + 2) + 1;
      const by = y + top;
      rect(ctx, 'outline', bx - 1, by - 1, w + 2, hgt + 2);
      rect(ctx, BOOK_COLORS[i % BOOK_COLORS.length], bx, by, w, hgt);
      rect(ctx, 'paperWhite', flat ? bx : bx + w - 1, flat ? by + hgt - 1 : by, flat ? w : 1, flat ? 1 : hgt);
    }
    for (let i = 0; i < 9; i += 1) {
      const top = 18 + Math.floor(VL.ART.hash(i, 6, 23) * (spilled ? 110 : 20));
      const sx = x + clearOfHud(24 + Math.floor(VL.ART.hash(i, 5, 23) * 200), top, 3, 3);
      const sy = y + top;
      rect(ctx, 'shell', sx, sy, 3, 2);
      rect(ctx, 'shellDark', sx, sy + 2, 3, 1);
    }
    if (spilled) return;
    // The mountain itself, behind where the Dragon sleeps: books laid flat
    // in rows, each row a little narrower than the one under it.
    for (let row = 0; row < 6; row += 1) {
      const width = 104 - row * 16;
      const by = y + 46 - row * 4;
      for (let bx = x + 128 - width / 2, i = 0; bx < x + 128 + width / 2 - 6; bx += 8, i += 1) {
        const shift = (row % 2) * 4;
        rect(ctx, 'outline', bx + shift - 1, by - 1, 9, 5);
        rect(ctx, BOOK_COLORS[(i * 3 + row) % BOOK_COLORS.length], bx + shift, by, 7, 3);
        rect(ctx, 'paperWhite', bx + shift, by + 2, 7, 1);
      }
    }
  });

  const hoardDecor = (state) => state.room.entities.find((e) => e.type === 'decor' && e.art === 'lairHoard');
  VL.onRoomBuilt((state) => {
    const room = state.room;
    if (room.area !== DUNGEON || room.screen !== '0,-3') return;
    const decor = hoardDecor(state);
    if (decor) decor.spilled = VL.bossBeaten(state, DUNGEON);
  });

  const hoardBook = (id, title, color, blurb) => VL.defineBook(id, { kind: 'generic', title, color, blurb });
  hoardBook('bookHoardRecipes', 'Soups for a Rainy Day', 'leaf', 'Every soup has a little too much pepper in it. Somebody has been sneezing on these pages.');
  hoardBook('bookHoardLullabies', 'Lullabies for Big Creatures', 'water', 'Songs to hum to a drowsy whale, a tired bear, and, on the last page, a sleepy dragon.');
  hoardBook('bookHoardMaps', 'The Town as It Used to Be', 'gold', 'Old maps of the town. The library is in all of them, right in the middle.');
  VL.HOARD_BOOKS = ['bookHoardRecipes', 'bookHoardLullabies', 'bookHoardMaps'];
  VL.HOARD_WORDS = {
    title: 'The hoard spills out!',
    text: 'Books everywhere: the library\'s missing ones! You gather up three to carry home. The rest will need a lot more arms.',
  };

  // ---------- the way in ----------

  // Two thorny guards hold the cave mouth until the metal sword beats them,
  // for good, so he learns what the Dragon needs before its gate shuts.
  VL.LAIR_GUARDS = { screen: '-1,-5', at: [[6, 6], [8, 6]] };
  VL.LAIR_GUARD_WORDS = 'Two thorny guards stand in the cave mouth, and they won\'t let you by!';
  VL.fillSpot('lairDoor', {
    type: 'door',
    shutUntil: 'lairGuards',
    locked: VL.LAIR_GUARD_WORDS,
    to: { area: DUNGEON, screen: '0,0', tx: 7, ty: 9, facing: 'up' },
  });
  const atLairMouth = (room) => room.area === 'overworld' && room.screen === VL.LAIR_GUARDS.screen;
  VL.onRoomBuilt((state) => {
    const room = state.room;
    if (!atLairMouth(room)) return;
    // A save from before the guards that already beat the Dragon finds the way clear.
    if (!state.flags.lairGuards && VL.bossBeaten(state, DUNGEON)) state.flags.lairGuards = true;
    if (state.flags.lairGuards) return;
    room.lairGuards = VL.LAIR_GUARDS.at.map(([x, y]) => Object.assign(VL.spawnEnemy(state, 'spitter', x, y), { tough: true, guard: true }));
  });
  // Only guards really beaten (hp run out) count, so a room the playthrough
  // cleared of enemies never opens the door.
  VL.defineSystem('lairGuards', {
    order: 32,
    update(state) {
      const room = state.room;
      if (!atLairMouth(room) || state.flags.lairGuards || !room.lairGuards?.every((g) => g.hp <= 0)) return;
      state.flags.lairGuards = true;
      VL.earned(state);
      const door = room.entities.find((e) => e.type === 'door' && e.shutUntil === 'lairGuards');
      if (door) door.solid = false;
    },
  });

  VL.LAIR_SWORD_WORDS = SWORD_WORDS;

  // ---------- the boss and its rewards ----------

  VL.defineDungeon(DUNGEON, {
    area: DUNGEON,
    name: 'Dragon\'s Lair',
    entrance: { area: 'overworld', screen: '-1,-5', tx: 7, ty: 5, facing: 'down' },
    boss: {
      screen: '0,-3',
      type: 'dragon',
      heart: 'heartD4',
      warp: { tx: 7, ty: 8 },
      // Its book hoard spills out (design: "Its book hoard spills out").
      onDefeat(state) {
        state.dungeonNote = { text: VL.DRAGON_WORDS.beaten, t: 0 };
        const decor = hoardDecor(state);
        if (decor) decor.spilled = true;
        for (const id of VL.HOARD_BOOKS) VL.markFound(state, id);
        VL.holdUp(state, 'pickup-book', { sound: 'fanfare' });
        VL.showMessage(state, VL.HOARD_WORDS);
        VL.showPopup(state, 'firstBook');
        state.events.push({ type: 'pickup', kind: 'book' });
        VL.earned(state);
      },
    },
    light: 'indoor',
  });

  // ---------- progression (README "Progression") ----------

  const doc = '§ The path through the game, 8';
  const door = (id) => (state) => Boolean(state.dungeons[DUNGEON]?.doors[id]);
  const found = (id) => (state) => VL.spotFound(state, id);
  const keys = `smallKey:${DUNGEON}`;

  VL.defineLock('lairGuards', { type: 'flag', needs: ['highlands', 'metalSword'], doc, reached: (state) => Boolean(state.flags.lairGuards) });
  VL.defineLock('dragonsLairEntered', {
    ...VL.LOCKS.dragonsLairEntered,
    needs: ['highlands', 'lairGuards'],
    replan: 'thorny guards that only the metal sword beats hold the cave mouth (W35)',
    place: { area: DUNGEON, screen: '0,0' },
    reached: (state) => Boolean(state.visited[`${DUNGEON}:0,0`]),
  });
  VL.defineLock('d4KeyA', { type: 'item', needs: ['dragonsLairEntered'], supplies: { [keys]: 1 }, doc, reached: found('d4KeyA') });
  VL.defineLock('d4DoorA', { needs: ['dragonsLairEntered'], consumes: { [keys]: 1 }, doc, reached: door('d4DoorA') });
  VL.defineLock('mirrorShield', {
    ...VL.LOCKS.mirrorShield,
    needs: ['dragonsLairEntered', 'd4DoorA'],
    replan: 'found mid-dungeon: the Mirror Shield lies behind the first locked door',
    reached: (state) => VL.hasItem(state, 'mirrorShield'),
  });
  // Key B, door B and the boss key lie past stone heads only the shield chokes.
  VL.defineLock('d4KeyB', { type: 'item', needs: ['mirrorShield'], supplies: { [keys]: 1 }, doc, reached: found('d4KeyB') });
  VL.defineLock('d4DoorB', { needs: ['mirrorShield'], consumes: { [keys]: 1 }, doc, reached: door('d4DoorB') });
  VL.defineLock('d4BossKey', { type: 'item', needs: ['d4DoorB'], gives: [`bossKey:${DUNGEON}`], doc, reached: found('d4BossKey') });
  VL.defineLock('d4BossDoor', { needs: ['mirrorShield', `bossKey:${DUNGEON}`, 'metalSword'], doc, reached: door('d4BossDoor') });
  VL.defineLock('d4Boss', {
    ...VL.LOCKS.d4Boss,
    needs: ['dragonsLairEntered', 'mirrorShield', 'metalSword', 'd4BossDoor'],
    supplies: { books: VL.HOARD_BOOKS.length },
    replan: 'the boss room lies behind the boss door, its scales take only the metal sword (W35), and its hoard spills a bundle of books (as the Bookworm\'s)',
    reached: (state) => VL.bossBeaten(state, DUNGEON),
  });
})();
