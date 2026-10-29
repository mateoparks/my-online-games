// Under the puppet stage (design: The path through the game, 9; Ending
// (decided)): Mrs. Fenwick's hidden workshop, the hall where her giant
// marionettes dance, and the tunnel she carried the books along to the
// dragon. Not a dungeon: no keys, no lantern, nothing that shuts behind him;
// a faint, a reload or Save & Quit wakes him at his last lantern and the
// ladder is always there. The rules are systems/finale.js; this file is the
// place, who stands in it and what everyone says. README "The finale (W20)".
//
//   tunnel (-1,-1) ── hall (0,-1): her gallery, the three marionettes
//                         │
//                     workshop (0,0): the ladder up to the square
(() => {
  const { rect } = VL.ART;
  const AREA = 'workshop';

  VL.FINALE = {
    area: AREA,
    square: '2,0',
    workshop: '0,0',
    hall: '0,-1',
    tunnel: '-1,-1',
    // Down the trapdoor, and back up the ladder beside it.
    arrival: { area: AREA, screen: '0,0', tx: 7, ty: 8, facing: 'up' },
    up: { area: 'overworld', screen: '2,0', tx: 3, ty: 4, facing: 'down' },
    // Where Mr. Fenwick stands once he has followed the hero down.
    librarianAt: { '0,0': { x: 10, y: 8 }, '0,-1': { x: 12, y: 9 }, '-1,-1': { x: 9, y: 6 } },
    wifeAt: { x: 7, y: 3 },
  };

  // ---------- tiles ----------

  VL.ART.addColors({ galleryRail: '#b98a52', railDark: '#4a3a30', rubble: '#7d6b5c', rubbleDark: '#584a3f', rubbleLight: '#a08e7c' });

  VL.defineTileset(AREA, {
    ...VL.DUNGEON_TILES,
    // The ladder up to the trapdoor.
    L: { floor: true, ladder: true, art: 'wsLadder' },
    // Her gallery over the hall: solid, out of reach.
    g: { solid: true, gallery: true, art: 'wsGallery' },
    // Rocks fallen across the tunnel.
    r: { solid: true, rubble: true, art: 'wsRubble' },
    // The tunnel's floor, with the little cart rails she pushed the books along.
    t: { floor: true, art: 'wsRails' },
  });
  VL.defineArea(AREA, { tileset: AREA });
  // Mr. Fenwick only follows him down the ladder, so Continue never starts below.
  VL.quitRule(AREA, 'lastSave');
  VL.ART.setAreaLight(AREA, 'indoor');

  VL.ART.defineTileStyle('wsLadder', {
    ground(ctx, cell) {
      VL.ART.TILE_STYLES.floor.ground(ctx, cell);
      const { x, y } = cell;
      rect(ctx, 'shadow', x + 2, y, 12, 16);
      rect(ctx, 'woodDark', x + 3, y, 2, 16);
      rect(ctx, 'woodDark', x + 11, y, 2, 16);
      for (let rung = 2; rung < 16; rung += 4) {
        rect(ctx, 'wood', x + 5, y + rung, 6, 2);
        rect(ctx, 'woodLight', x + 5, y + rung, 6, 1);
      }
    },
  });

  VL.ART.defineTileStyle('wsGallery', {
    ground(ctx, cell) {
      const { x, y } = cell;
      rect(ctx, 'wallInsideDark', x, y, 16, 16);
      if (!cell.near(0, 1)?.floor) {
        rect(ctx, 'woodDark', x, y + 6, 16, 10);
        for (let seam = 0; seam < 16; seam += 4) rect(ctx, 'wood', x + seam, y + 7, 3, 9);
        return;
      }
      // The front of the gallery: a carved rail, posts and the curtain below.
      rect(ctx, 'woodDark', x, y, 16, 6);
      rect(ctx, 'galleryRail', x, y, 16, 2);
      rect(ctx, 'railDark', x + (cell.wx % 2 ? 2 : 10), y + 2, 2, 4);
      rect(ctx, 'curtainDark', x, y + 6, 16, 10);
      for (let fold = 1; fold < 16; fold += 5) rect(ctx, 'curtain', x + fold, y + 6, 2, 10);
      rect(ctx, 'outline', x, y + 15, 16, 1);
    },
  });

  VL.ART.defineTileStyle('wsRubble', {
    ground(ctx, cell) {
      const { x, y } = cell;
      rect(ctx, 'wallInsideDark', x, y, 16, 16);
      for (let i = 0; i < 4; i += 1) {
        const rx = x + Math.floor(cell.seed(i) * 10);
        const ry = y + Math.floor(cell.seed(i + 4) * 10);
        rect(ctx, 'outline', rx, ry, 7, 6);
        rect(ctx, 'rubble', rx + 1, ry + 1, 5, 4);
        rect(ctx, 'rubbleLight', rx + 1, ry + 1, 3, 1);
        rect(ctx, 'rubbleDark', rx + 2, ry + 4, 4, 1);
      }
    },
  });

  VL.ART.defineTileStyle('wsRails', {
    ground(ctx, cell) {
      VL.ART.TILE_STYLES.floor.ground(ctx, cell);
      const { x, y } = cell;
      for (let tie = 1; tie < 16; tie += 5) rect(ctx, 'woodDark', x + tie, y + 4, 3, 8);
      rect(ctx, 'metalDark', x, y + 5, 16, 1);
      rect(ctx, 'metalDark', x, y + 10, 16, 1);
    },
  });

  // ---------- decor ----------

  // Her workbench: half-carved puppet parts, paint pots and a lamp.
  VL.defineDecor('wsWorkbench', (ctx, x, y, t) => {
    VL.ART.drawShadow(ctx, x + 32, y + 15, 60);
    rect(ctx, 'outline', x + 1, y + 1, 62, 13);
    rect(ctx, 'wood', x + 2, y + 2, 60, 11);
    rect(ctx, 'woodLight', x + 2, y + 2, 60, 1);
    rect(ctx, 'skin', x + 6, y + 4, 6, 5);
    rect(ctx, 'ink', x + 7, y + 6, 1, 1);
    rect(ctx, 'ink', x + 10, y + 6, 1, 1);
    rect(ctx, 'skin', x + 16, y + 6, 4, 2);
    rect(ctx, 'skin', x + 22, y + 5, 2, 5);
    for (const [px, color] of [[30, 'heart'], [36, 'tunic'], [42, 'gold'], [48, 'npcNavy']]) {
      rect(ctx, 'outline', x + px - 1, y + 4, 5, 6);
      rect(ctx, color, x + px, y + 5, 3, 4);
    }
    rect(ctx, 'woodDark', x + 55, y - 4, 2, 8);
    const flicker = Math.sin(t * 7) > 0 ? 1 : 0;
    rect(ctx, 'gold', x + 54, y - 7 + flicker, 4, 3);
    rect(ctx, 'goldLight', x + 55, y - 6 + flicker, 2, 1);
  });

  // A wall shelf of puppet heads, all smiling; some look like people in town.
  VL.defineDecor('wsHeads', (ctx, x, y) => {
    rect(ctx, 'outline', x, y + 10, 64, 4);
    rect(ctx, 'woodDark', x + 1, y + 11, 62, 2);
    const heads = [['npcSilver', 'npcPlum'], ['hair', 'npcNavy'], ['npcBlonde', 'npcRose'], ['outline', 'roof'], ['npcBlack', 'npcNavy', 'skinBrown'], ['hair', 'leaf']];
    heads.forEach(([hair, neck, skin = 'skin'], i) => {
      const hx = x + 3 + i * 10;
      rect(ctx, 'outline', hx - 1, y + 1, 9, 10);
      rect(ctx, skin, hx, y + 2, 7, 8);
      rect(ctx, hair, hx, y + 2, 7, 2);
      rect(ctx, 'ink', hx + 1, y + 5, 1, 1);
      rect(ctx, 'ink', hx + 5, y + 5, 1, 1);
      rect(ctx, 'woodDark', hx + 2, y + 7, 3, 1);
      rect(ctx, neck, hx + 2, y + 9, 3, 2);
    });
  });

  // Crates of library books, stamped and sooty.
  VL.defineDecor('wsCrates', (ctx, x, y) => {
    for (const [cx, cy] of [[0, 2], [16, 2], [8, 17]]) {
      VL.ART.drawShadow(ctx, x + cx + 7, y + cy + 13, 14);
      rect(ctx, 'outline', x + cx, y + cy, 15, 13);
      rect(ctx, 'wood', x + cx + 1, y + cy + 1, 13, 11);
      rect(ctx, 'woodDark', x + cx + 1, y + cy + 5, 13, 1);
      for (let b = 0; b < 4; b += 1) rect(ctx, ['heart', 'tunic', 'gold', 'npcNavy'][b], x + cx + 2 + b * 3, y + cy - 2, 2, 4);
      rect(ctx, 'outline', x + cx + 4, y + cy + 8, 5, 1);
    }
  });

  // The table with her postcard from home and the map with the line to the mountain.
  VL.defineDecor('wsTable', (ctx, x, y) => {
    VL.ART.drawShadow(ctx, x + 16, y + 15, 30);
    rect(ctx, 'outline', x + 1, y + 2, 30, 12);
    rect(ctx, 'wood', x + 2, y + 3, 28, 10);
    rect(ctx, 'woodLight', x + 2, y + 3, 28, 1);
    rect(ctx, 'white', x + 5, y + 5, 9, 6);
    rect(ctx, 'showSky', x + 6, y + 6, 7, 2);
    rect(ctx, 'grassDark', x + 6, y + 8, 7, 2);
    rect(ctx, 'roof', x + 9, y + 7, 2, 2);
    rect(ctx, 'sandLight', x + 17, y + 4, 11, 8);
    rect(ctx, 'leaf', x + 18, y + 6, 4, 4);
    rect(ctx, 'heart', x + 21, y + 5, 6, 1);
    rect(ctx, 'heart', x + 26, y + 5, 1, 4);
  });

  // Mrs. Fenwick up on her gallery, working the three control bars.
  VL.defineDecor('wsPuppeteer', (ctx, x, y, t) => {
    const bob = Math.round(Math.sin(t * 4) * 1);
    VL.ART.drawSprite(ctx, 'npc-librarianWife-down-0', x + 2, y + 2 + bob);
    for (const [dx, phase] of [[-14, 0], [6, 1.5], [24, 3]]) {
      const lift = Math.round(Math.sin(t * 3 + phase) * 2);
      rect(ctx, 'outline', x + dx - 1, y + 17 + lift, 10, 3);
      rect(ctx, 'woodLight', x + dx, y + 18 + lift, 8, 1);
    }
  });

  // Pages blown along the tunnel floor.
  VL.defineDecor('wsPages', (ctx, x, y) => {
    for (const [px, py] of [[2, 4], [21, 9], [40, 3], [58, 11], [74, 6]]) {
      rect(ctx, 'outline', x + px - 1, y + py - 1, 7, 6);
      rect(ctx, 'white', x + px, y + py, 5, 4);
      rect(ctx, 'textDim', x + px + 1, y + py + 1, 3, 1);
    }
  });

  // { type: 'finaleNote', x, y, text, title? }: something to read on solid
  // furniture (drawn by decor), S facing it shows its words.
  VL.defineEntity('finaleNote', {
    solid: true,
    onInteract(state, note) {
      VL.showMessage(state, { title: note.title || null, text: note.text });
      state.events.push({ type: 'read' });
    },
  });
  const note = (x, y, text, title = null) => ({ type: 'finaleNote', x, y, text, title });

  const BENCH = 'Her workbench: paint pots, carved wooden hands, and a puppet nose that isn\'t finished yet.';
  const HEADS = 'Rows of puppet heads, all smiling. Some of them look a lot like people from town!';
  const CRATES = 'Crates of books, stamped LIBRARY. A few have little sooty claw marks on them.';
  const POSTCARD = 'A faded postcard: "Greetings from Little Wending, over the hills." On the back, in neat writing: "Home. One day."';
  const MAP = 'A map of the island. A line runs from this cellar all the way to the mountain, with a little dragon drawn at the end.';
  const RUBBLE = 'Rocks came tumbling down across the tunnel when the Dragon fell. Beyond them, it climbs on and on, all the way up to the Dragon\'s Lair.';

  VL.addScreens(AREA, {
    // The workshop under the stage.
    '0,0': {
      tiles: [
        '#######__#######',
        '#nnnn______nnnn#',
        '#______________#',
        '#______________#',
        '#_nn________nn_#',
        '#______________#',
        '#nn__________nn#',
        '#nn__________nn#',
        '#______________#',
        '#______L_______#',
        '################',
      ],
      entities: [
        { type: 'decor', art: 'wsWorkbench', x: 1, y: 1 },
        { type: 'decor', art: 'wsHeads', x: 11, y: 0 },
        { type: 'decor', art: 'wsTable', x: 2, y: 4 },
        { type: 'decor', art: 'wsTable', x: 12, y: 4 },
        { type: 'decor', art: 'wsCrates', x: 1, y: 6 },
        { type: 'decor', art: 'wsCrates', x: 13, y: 6 },
        ...[1, 2, 3, 4].map((x) => note(x, 1, BENCH)),
        ...[11, 12, 13, 14].map((x) => note(x, 1, HEADS)),
        note(2, 4, POSTCARD, 'A postcard'),
        note(3, 4, POSTCARD, 'A postcard'),
        note(12, 4, MAP, 'A map'),
        note(13, 4, MAP, 'A map'),
        ...[[1, 6], [2, 6], [1, 7], [2, 7], [13, 6], [14, 6], [13, 7], [14, 7]].map(([x, y]) => note(x, y, CRATES)),
        { type: 'door', x: 7, y: 9, to: VL.FINALE.up },
      ],
    },
    // The hall: her gallery above, the three giant marionettes below.
    '0,-1': {
      tiles: [
        '################',
        '#gggggggggggggg#',
        '#gggggggggggggg#',
        '#______________#',
        '#______________#',
        '_______________#',
        '_______________#',
        '#______________#',
        '#______________#',
        '#______________#',
        '#######__#######',
      ],
      entities: [
        { type: 'marionette', puppet: 'dragon', x: 3, y: 5 },
        { type: 'marionette', puppet: 'hero', x: 8, y: 5 },
        { type: 'marionette', puppet: 'librarian', x: 12, y: 5 },
      ],
    },
    // The tunnel to the dragon, blocked by a rockfall.
    '-1,-1': {
      tiles: [
        '################',
        '################',
        '###rrrr#########',
        '###r__r#########',
        '###____#########',
        '###tttttttttttt_',
        '###tttttttttttt_',
        '################',
        '################',
        '################',
        '################',
      ],
      entities: [
        { type: 'decor', art: 'wsPages', x: 5, y: 5 },
        note(4, 2, RUBBLE, 'A rockfall'),
        note(5, 2, RUBBLE, 'A rockfall'),
      ],
    },
  });

  // ---------- who stands where ----------

  VL.onRoomBuilt((state) => {
    const { room } = state;
    // From the Dragon's fall she is down below, so her stage stands empty.
    const away = VL.finaleUnderway(state) || (!state.flags.forgiven && Boolean(VL.LOCKS.d4Boss.reached?.(state)));
    if (!away) return;
    if (room.area === 'overworld' && room.screen === VL.FINALE.square) {
      room.entities = room.entities.filter((e) => !(e.type === 'npc' && e.id === 'librarianWife'));
      for (const e of room.entities) if (e.type === 'decor' && e.art === 'puppetBooth') e.empty = true;
      return;
    }
    if (room.area !== AREA) return;
    // Mr. Fenwick follows the hero down, wherever he goes below.
    const at = VL.FINALE.librarianAt[room.screen];
    if (at) room.entities.push({ type: 'npc', id: 'librarian', talk: 'librarianFinale', x: at.x, y: at.y, facing: 'left' });
    if (room.screen !== VL.FINALE.hall) return;
    if (state.flags.marionettes) VL.wifeComesDown(state);
    else room.entities.push({ type: 'decor', art: 'wsPuppeteer', x: 7, y: 0, speaker: 'librarianWife', speakerBox: { x: 1, y: 0, w: 14, h: 21 } });
  });

  // Off her gallery and onto the hall floor (at once on a later visit, or in
  // the pause after the last puppet falls), beside the hero, never on him.
  VL.wifeComesDown = function wifeComesDown(state) {
    const { room, player } = state;
    if (room.entities.some((e) => e.type === 'npc' && e.id === 'librarianWife')) return;
    room.entities = room.entities.filter((e) => e.art !== 'wsPuppeteer');
    const { x, y } = VL.FINALE.wifeAt;
    const clear = (tx) => {
      const c = VL.tileCenter(tx, y);
      return Math.abs(c.x - player.x) >= 16 || Math.abs(c.y - player.y) >= 16;
    };
    const tx = [x, x + 1, x - 1, x + 2].find(clear) ?? x - 2;
    room.entities.push({ type: 'npc', id: 'librarianWife', talk: 'wifeFinale', x: tx, y, facing: 'down' });
    state.events.push({ type: 'wifeComesDown' });
  };

  VL.SOUND.onEvent('marionettesBeaten', 'dungeonBoss');

  // ---------- the words ----------

  const HIM = VL.LIBRARIAN;
  const HER = 'Mrs. Fenwick';
  VL.FINALE_WORDS = {
    emptyStage: 'The stage is empty, and every puppet is gone.',
    followed: [
      [HIM, '{name}! I came down right behind you. I saw the trapdoor open from the library window.'],
      [HIM, 'Puppets... paint... and look, crates of books! Our books! But who would hide them down here?'],
      [HIM, 'Whatever is going on, we find out together. Lead the way, {name}.'],
    ],
    confronted: [
      [HER, 'Oh! {name}... and you too, dear? You were never supposed to find this place.'],
      [HIM, 'My dear? What are you doing up there? And why are those puppets so very big?'],
      [HER, 'Please, both of you, go back up! My puppets will see you out. Off you go, my lovelies!'],
    ],
    showAsked: [
      [HER, 'Stop! Please, that\'s enough. Oh, {name}, my puppets could have hurt you. Whatever was I thinking?'],
      [HIM, 'My dear... the books. All this time, was it you?'],
      [HER, 'Yes. Let me tell it the only way I know how. One last show.'],
    ],
    forgiven: [
      [HER, 'I\'m so sorry, my dear. I only wanted to go home.'],
      [HIM, 'Oh, my sweetheart, I\'m sorry I didn\'t realize how much you missed home.'],
      [HER, 'Let\'s fix this! Let\'s bring back all the books and fill the library!'],
      [HIM, 'Yes, and then let\'s plan a visit to your home town together!'],
      [HER, 'Oh! Do you mean it? Then I\'ll put on a puppet show there, all about this town.'],
    ],
  };

  VL.defineDialogue('librarianFinale', [
    { when: { flag: 'marionettes' }, say: 'Let her speak, {name}. I want to hear it all.' },
    { when: { flag: 'finale:confronted' }, say: 'Careful, {name}! Those puppets are bigger than both of us.' },
    { say: 'Stay close, {name}. I don\'t like the look of this at all.' },
  ]);
  VL.defineDialogue('wifeFinale', [
    { say: 'Let me tell it properly, dear. One last show.' },
  ]);

  // After the ending she is kind again; before it, back in town, everyone
  // has heard about the Dragon.
  VL.addDialogue('librarianWife', [
    { when: { flag: 'forgiven' }, say: ['Hello, {name}! The shelves are full, and my shows are happy ones now.', 'Press S at the stage, dear. This one has a hero in it, and it ends well!'] },
  ]);
  const hero = (say) => ({ when: { progress: 'd4Boss', notFlag: 'forgiven' }, say });
  const after = (say) => ({ when: { flag: 'forgiven' }, say });
  VL.addDialogue('gran', [
    ...VL.bossHintEntries(['marionettes']),
    after('I\'m writing a book, {name}! Seventy years by this well. Miss Quill says it will be ever so long.'),
    hero('You beat the Dragon? The whole town is talking about you, {name}!'),
  ]);
  VL.addDialogue('nell', [
    after('My book is all about fish. Chapter one: splash. I\'m still working on chapter two.'),
    hero('A dragon! Beaten by our {name}! I\'ll tell the fish all about it.'),
  ]);
  VL.addDialogue('bramble', [
    after('The librarian waters his flowers every morning again. And he hums while he does it!'),
    hero('Did you see? Mrs. Fenwick\'s stage is empty today. Not like her at all.'),
  ]);
  VL.addDialogue('juniper', [
    after('Mr. Pell makes the paper, Miss Quill binds the pages, and we all write. Our town makes its own books now!'),
    hero('My heart is still pounding, {name}! You fought a real dragon!'),
  ]);
})();
