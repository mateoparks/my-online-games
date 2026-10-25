// The town's four trades, inside (design: Resources and economy): the
// General Store, the paper mill, the smithy and the bindery. Each is a
// one-screen area behind a door spot on the town map, with its keeper behind
// a counter and a shop of offers priced from VL.TUNING.prices
// (systems/economy.js). README "Economy".
(() => {
  const { rect } = VL.ART;
  const prices = VL.TUNING.prices;

  VL.ART.addColors({
    jarBlue: '#4f7fc4',
    jarGreen: '#5aa05a',
    paperWhite: '#efe8d6',
    paperShade: '#cfc4a8',
    brick: '#8c4a3a',
    brickDark: '#6a3428',
    brickLight: '#ad6a55',
    fire: '#ff9a3c',
    fireLight: '#ffd36e',
  });

  // ---------- tiles ----------

  VL.defineTileset('interior', {
    '#': { solid: true, wall: true, interior: true, art: 'wallInside' },
    _: { floor: true, art: 'floor' },
    m: { door: true, floor: true, art: 'door' },
    // A counter the keeper stands behind; S across it talks (systems/economy.js).
    K: { solid: true, floor: true, counter: true, art: 'counter' },
    // Floor under furniture drawn as decor.
    n: { solid: true, floor: true, furniture: true, art: 'floor' },
  });

  VL.ART.defineTileStyle('counter', {
    ground(ctx, cell, t) {
      VL.ART.TILE_STYLES.floor.ground(ctx, cell, t);
      const { x, y } = cell;
      const left = !cell.near(-1, 0)?.counter;
      const right = !cell.near(1, 0)?.counter;
      const x0 = x + (left ? 1 : 0);
      const w = 16 - (left ? 1 : 0) - (right ? 1 : 0);
      rect(ctx, 'outline', x0, y + 1, w, 14);
      rect(ctx, 'woodLight', x0 + (left ? 1 : 0), y + 2, w - (left ? 1 : 0) - (right ? 1 : 0), 4);
      rect(ctx, 'wood', x0 + (left ? 1 : 0), y + 6, w - (left ? 1 : 0) - (right ? 1 : 0), 8);
      rect(ctx, 'woodDark', x0 + (left ? 1 : 0), y + 6, w - (left ? 1 : 0) - (right ? 1 : 0), 1);
      for (let seam = (cell.wx % 2) * 8 + 4; seam < 16; seam += 8) rect(ctx, 'woodDark', x + seam, y + 8, 1, 5);
    },
    shadow: (ctx, cell) => rect(ctx, 'shadow', cell.x, cell.y + 15, 16, 2),
  });

  // ---------- furniture ----------

  const shade = (ctx, x, y, w, h) => rect(ctx, 'shadow', x + 2, y + h, w - 2, 2);

  // A wall shelf `w` tiles wide, three boards of jars, boxes and bottles.
  VL.defineDecor('goodsShelf', (ctx, x, y, t, e) => {
    const w = (e.w || 4) * 16;
    shade(ctx, x, y - 4, w, 18);
    rect(ctx, 'outline', x, y - 6, w, 22);
    rect(ctx, 'woodDark', x + 1, y - 5, w - 2, 20);
    const goods = ['jarBlue', 'jarGreen', 'berry', 'gold', 'paperWhite', 'heart', 'shell'];
    for (let board = 0; board < 3; board += 1) {
      const by = y - 4 + board * 7;
      for (let gx = x + 3; gx < x + w - 5; gx += 5) {
        const pick = Math.floor(VL.ART.hash(gx, by, e.x) * goods.length);
        const tall = VL.ART.hash(gx, by, 9) > 0.5 ? 4 : 3;
        rect(ctx, goods[pick], gx, by + 5 - tall, 3, tall);
        rect(ctx, 'white', gx, by + 5 - tall, 1, 1);
      }
      rect(ctx, 'wood', x + 1, by + 5, w - 2, 2);
      rect(ctx, 'woodLight', x + 1, by + 5, w - 2, 1);
    }
  });

  // A barrel of berries (or of water for the smith's quench).
  VL.defineDecor('barrel', (ctx, x, y, t, e) => {
    VL.ART.drawShadow(ctx, x + 8, y + 14, 14);
    rect(ctx, 'outline', x + 2, y + 1, 12, 14);
    rect(ctx, 'wood', x + 3, y + 2, 10, 12);
    rect(ctx, 'woodLight', x + 4, y + 2, 2, 12);
    rect(ctx, 'metalDark', x + 3, y + 5, 10, 1);
    rect(ctx, 'metalDark', x + 3, y + 11, 10, 1);
    const fill = e.holds === 'water' ? ['water', 'waterLight'] : ['berry', 'berryLight'];
    rect(ctx, fill[0], x + 4, y + 2, 8, 2);
    if (e.holds === 'water') rect(ctx, fill[1], x + 5 + (Math.sin(t * 2) > 0 ? 1 : 0), y + 2, 3, 1);
    else for (let i = 0; i < 3; i += 1) rect(ctx, fill[1], x + 5 + i * 2, y + 2 + (i % 2), 1, 1);
  });

  // The mill's great gear, turned through the wall by the water wheel outside.
  VL.defineDecor('millGear', (ctx, x, y, t) => {
    const cx = x + 24;
    const cy = y + 10;
    shade(ctx, x, y + 10, 48, 16);
    rect(ctx, 'outline', x, y - 6, 48, 34);
    rect(ctx, 'wallInsideDark', x + 1, y - 5, 46, 32);
    const turn = t * 1.4;
    // Teeth, then a solid rim, then four spokes.
    for (let i = 0; i < 14; i += 1) {
      const a = turn + (i / 14) * Math.PI * 2;
      rect(ctx, 'woodDark', Math.round(cx + Math.cos(a) * 13) - 2, Math.round(cy + Math.sin(a) * 13) - 2, 4, 4);
    }
    for (let i = 0; i < 40; i += 1) {
      const a = (i / 40) * Math.PI * 2;
      rect(ctx, 'wood', Math.round(cx + Math.cos(a) * 10) - 1, Math.round(cy + Math.sin(a) * 10) - 1, 2, 2);
    }
    for (let r = 2; r < 10; r += 1) {
      for (let i = 0; i < 4; i += 1) {
        const a = turn + (i / 4) * Math.PI * 2;
        rect(ctx, 'woodLight', Math.round(cx + Math.cos(a) * r) - 1, Math.round(cy + Math.sin(a) * r) - 1, 2, 2);
      }
    }
    // The axle runs out through the wall to the water wheel.
    rect(ctx, 'woodDark', x - 14, cy - 1, cx - x + 14, 3);
    rect(ctx, 'outline', cx - 3, cy - 3, 6, 6);
    rect(ctx, 'metal', cx - 2, cy - 2, 4, 4);
  });

  // Sheets of new paper hung up to dry.
  VL.defineDecor('paperRack', (ctx, x, y, t, e) => {
    const w = (e.w || 5) * 16;
    rect(ctx, 'woodDark', x + 2, y - 4, 2, 18);
    rect(ctx, 'woodDark', x + w - 4, y - 4, 2, 18);
    for (const line of [y - 2, y + 6]) {
      rect(ctx, 'woodDark', x + 2, line, w - 4, 1);
      for (let px = x + 6; px < x + w - 12; px += 9) {
        const sway = Math.sin(t * 1.5 + px * 0.3) > 0.6 ? 1 : 0;
        rect(ctx, 'paperShade', px + sway, line + 1, 7, 6);
        rect(ctx, 'paperWhite', px + sway, line + 1, 6, 5);
      }
    }
  });

  // A vat of paper pulp, bubbling now and then.
  VL.defineDecor('vat', (ctx, x, y, t) => {
    VL.ART.drawShadow(ctx, x + 16, y + 28, 30);
    rect(ctx, 'outline', x + 1, y + 2, 30, 27);
    rect(ctx, 'wood', x + 2, y + 3, 28, 25);
    rect(ctx, 'woodDark', x + 2, y + 12, 28, 1);
    rect(ctx, 'woodDark', x + 2, y + 22, 28, 1);
    rect(ctx, 'paperShade', x + 4, y + 4, 24, 6);
    rect(ctx, 'paperWhite', x + 5, y + 5, 22, 3);
    if (Math.sin(t * 2.3) > 0.4) rect(ctx, 'white', x + 10 + Math.floor((t * 3) % 12), y + 5, 2, 2);
  });

  // The forge: a brick hearth with a fire that never quite settles.
  VL.defineDecor('forge', (ctx, x, y, t) => {
    shade(ctx, x, y + 10, 64, 16);
    rect(ctx, 'outline', x + 1, y - 6, 62, 34);
    rect(ctx, 'brick', x + 2, y - 5, 60, 32);
    for (let row = 0; row < 8; row += 1) {
      rect(ctx, 'brickDark', x + 2, y - 2 + row * 4, 60, 1);
      for (let col = (row % 2) * 4 + 3; col < 60; col += 8) rect(ctx, 'brickDark', x + col, y - 5 + row * 4, 1, 3);
    }
    rect(ctx, 'outline', x + 14, y + 8, 36, 18);
    rect(ctx, 'ink', x + 15, y + 9, 34, 17);
    const flicker = (i) => Math.round(Math.abs(Math.sin(t * 7 + i * 1.7)) * 4);
    for (let i = 0; i < 8; i += 1) {
      const fx = x + 17 + i * 4;
      const h = 6 + flicker(i);
      rect(ctx, 'fire', fx, y + 25 - h, 3, h);
      rect(ctx, 'fireLight', fx + 1, y + 25 - Math.max(2, h - 4), 1, Math.max(2, h - 4));
    }
    rect(ctx, 'ember', x + 16, y + 23, 32, 2);
    rect(ctx, 'brickLight', x + 2, y - 5, 60, 1);
  });

  // Tools hung on the wall: hammers, tongs and a spare blade.
  VL.defineDecor('toolRack', (ctx, x, y, t, e) => {
    const w = (e.w || 5) * 16;
    rect(ctx, 'woodDark', x + 2, y - 4, w - 4, 2);
    for (let i = 0, tx = x + 8; tx < x + w - 8; i += 1, tx += 14) {
      rect(ctx, 'woodDark', tx + 2, y - 2, 2, 12);
      if (i % 3 === 0) rect(ctx, 'metal', tx, y + 9, 6, 4);
      else if (i % 3 === 1) {
        rect(ctx, 'metal', tx + 1, y + 8, 1, 6);
        rect(ctx, 'metal', tx + 4, y + 8, 1, 6);
      } else rect(ctx, 'white', tx + 2, y + 9, 2, 6);
    }
  });

  // The anvil on its stump, by the counter.
  VL.defineDecor('anvil', (ctx, x, y) => {
    VL.ART.drawShadow(ctx, x + 8, y + 14, 14);
    rect(ctx, 'woodDark', x + 5, y + 8, 6, 6);
    rect(ctx, 'outline', x + 1, y + 2, 14, 7);
    rect(ctx, 'metalDark', x + 2, y + 3, 12, 5);
    rect(ctx, 'metal', x + 2, y + 3, 12, 1);
  });

  // Floor-to-ceiling bookcases: the binder still has books, for now.
  VL.defineDecor('bookcase', (ctx, x, y, t, e) => {
    const w = (e.w || 6) * 16;
    shade(ctx, x, y - 4, w, 18);
    rect(ctx, 'outline', x, y - 6, w, 22);
    rect(ctx, 'woodDark', x + 1, y - 5, w - 2, 20);
    const spines = ['heart', 'jarBlue', 'jarGreen', 'gold', 'npcPlum', 'roof', 'paperWhite'];
    for (let board = 0; board < 3; board += 1) {
      const by = y - 4 + board * 7;
      for (let bx = x + 2; bx < x + w - 3; bx += 2) {
        if (VL.ART.hash(bx, by, 3) < 0.12) continue;
        const pick = Math.floor(VL.ART.hash(bx, by, e.x + 1) * spines.length);
        rect(ctx, spines[pick], bx, by + (VL.ART.hash(bx, by, 7) > 0.7 ? 1 : 0), 2, 5);
      }
      rect(ctx, 'wood', x + 1, by + 5, w - 2, 2);
    }
  });

  // The binding press: a heavy screw over a stack of pages.
  VL.defineDecor('press', (ctx, x, y) => {
    VL.ART.drawShadow(ctx, x + 16, y + 28, 30);
    rect(ctx, 'outline', x + 3, y + 2, 26, 27);
    rect(ctx, 'woodDark', x + 4, y + 3, 4, 25);
    rect(ctx, 'woodDark', x + 24, y + 3, 4, 25);
    rect(ctx, 'wood', x + 4, y + 3, 24, 4);
    rect(ctx, 'metal', x + 15, y + 7, 2, 8);
    rect(ctx, 'metalDark', x + 10, y + 7, 12, 1);
    rect(ctx, 'wood', x + 8, y + 15, 16, 3);
    rect(ctx, 'paperShade', x + 9, y + 18, 14, 6);
    rect(ctx, 'paperWhite', x + 9, y + 18, 14, 1);
    rect(ctx, 'paperWhite', x + 9, y + 21, 14, 1);
    rect(ctx, 'wood', x + 8, y + 24, 16, 4);
  });

  // Spools of thread and a pot of glue on a little table.
  VL.defineDecor('threadTable', (ctx, x, y) => {
    VL.ART.drawShadow(ctx, x + 16, y + 28, 30);
    rect(ctx, 'outline', x + 1, y + 8, 30, 8);
    rect(ctx, 'wood', x + 2, y + 9, 28, 6);
    rect(ctx, 'woodLight', x + 2, y + 9, 28, 1);
    rect(ctx, 'woodDark', x + 4, y + 15, 3, 13);
    rect(ctx, 'woodDark', x + 25, y + 15, 3, 13);
    for (const [sx, c] of [[5, 'heart'], [10, 'jarBlue'], [15, 'gold']]) {
      rect(ctx, 'woodDark', x + sx, y + 3, 4, 6);
      rect(ctx, c, x + sx, y + 4, 4, 4);
    }
    rect(ctx, 'paperShade', x + 21, y + 3, 6, 6);
    rect(ctx, 'paperWhite', x + 22, y + 4, 4, 1);
  });

  VL.ART.defineSprite('item-paper', {
    colors: { w: 'paperWhite', s: 'paperShade' },
    rows: ['wwwwww', 'wssssw', 'wwwwww', 'wssssw', 'wwwwww', 'wsssww', 'wwwwww'],
  });

  // ---------- keepers ----------

  VL.defineNpcLook('shopkeeper', { head: 'bun', colors: { hair: 'hair', hairLight: 'hairLight', top: 'leaf', topDark: 'leafDark', topLight: 'leafLight' } });
  VL.defineNpcLook('miller', { head: 'hat', colors: { hair: 'npcSilver', hairLight: 'npcSilverLight', top: 'sand', topDark: 'sandDark', topLight: 'sandLight', hat: 'paperShade', hatLight: 'paperWhite' } });
  VL.defineNpcLook('smith', { head: 'short', colors: { hair: 'outline', hairLight: 'hair', top: 'roof', topDark: 'roofDark', topLight: 'roofLight', legs: 'woodDark' } });
  VL.defineNpcLook('binder', { head: 'bun', colors: { hair: 'npcSilver', hairLight: 'npcSilverLight', top: 'npcNavy', topDark: 'npcNavyDark', topLight: 'npcNavyLight' } });

  VL.defineNpc('shopkeeper', { name: 'Mabel', look: 'shopkeeper' });
  VL.defineNpc('miller', { name: 'Mr. Pell', look: 'miller' });
  VL.defineNpc('smith', { name: 'Brannock', look: 'smith' });
  VL.defineNpc('binder', { name: 'Miss Quill', look: 'binder' });

  const onlyBroken = (state) => state.inventory.brokenShells > 0 && state.inventory.shells === 0;

  VL.defineDialogue('shopkeeper', [
    {
      when: { flag: 'shopThief', notFlag: 'scolded:mabel' },
      say: ['Sticky Fingers! Don\'t think I didn\'t see that berry vanish.', 'I\'ll let it go this once. But that\'s your name in here from now on!'],
      set: 'scolded:mabel', shop: 'store',
    },
    { when: { flag: 'shopThief' }, say: 'Back again, Sticky Fingers? Keep your hands where I can see them!', shop: 'store' },
    {
      when: { notFlag: 'met:mabel' },
      say: ['Welcome to the General Store, {name}! I\'m Mabel.', 'I sell paper, berries and shovels for the beach. I buy berries too, at a whole shell each!'],
      set: 'met:mabel', shop: 'store',
    },
    { when: { test: onlyBroken }, say: 'Broken shells? Oh dear, those are only good for the craft basket. Whole shells spend here, {name}!', shop: 'store' },
    { say: 'What can I get you today, {name}?', shop: 'store' },
  ]);

  VL.defineDialogue('miller', [
    {
      when: { notFlag: 'met:pell' },
      say: ['The wheel turns and the paper comes! Pell\'s the name, miller by trade.', 'Bring me wood: five pieces buy a whole shell. And I sell the finest paper in town.'],
      set: 'met:pell', shop: 'mill',
    },
    { say: 'Wood for shells, shells for paper. Round and round, like my wheel!', shop: 'mill' },
  ]);

  VL.defineDialogue('smith', [
    {
      when: { notFlag: 'met:brannock' },
      say: ['Brannock\'s the name, and smithing\'s the game! Swords, shields and shovels.', 'Bring me wood and I\'ll make you wooden gear. For metal, bring me a lump of ore and some shells. One lump for each piece, mind!'],
      set: 'met:brannock', shop: 'smithy',
    },
    { when: { item: 'metalShovel', notFlag: 'dugSecret' }, say: 'That metal shovel bites hard ground, {name}. My gran always said folk buried their savings under the flowers in the fields by your hut.', shop: 'smithy' },
    { when: { has: { ore: 1 } }, say: 'Is that ore I see? Lovely! Pick what you want forged, {name}.', shop: 'smithy' },
    { say: 'Mind the sparks, {name}! What shall it be?', shop: 'smithy' },
  ]);

  VL.defineDialogue('binder', [
    {
      when: { notFlag: 'met:quill' },
      say: ['Oh! A visitor. I\'m Miss Quill. I bind books.', 'Loose pages blow away and get lost. Bring me five and I\'ll bind them into a proper book.'],
      set: 'met:quill', shop: 'bookbinder',
    },
    { when: { flag: 'pagesBound' }, say: 'A fine book, that. Look after it, {name}.', shop: 'bookbinder' },
    { say: 'How many pages have you found, {name}? Five makes a book.', shop: 'bookbinder' },
  ]);

  // ---------- shops ----------

  const owns = (id) => (state) => VL.hasItem(state, id);
  const flagOnce = (flag) => (state) => VL.firstTimeFlag(state, flag);
  const forge = (id) => (state) => VL.giveItem(state, id);

  VL.defineShop('store', {
    title: 'General Store',
    greeting: 'Have a look around, {name}.',
    offers: [
      { id: 'paper', name: 'Paper', icon: 'item-paper', cost: prices.paper, gain: { paper: 1 }, give: flagOnce('boughtPaper'), about: 'For maps and copies. Ink not included!' },
      { id: 'buyBerry', name: 'Berry', icon: 'item-berry', cost: prices.buyBerry, gain: { berries: 1 }, give: flagOnce('boughtBerries'), about: 'Fresh from the bush. Eat one to heal a heart.' },
      { id: 'sellBerry', name: 'Sell a berry', icon: 'item-berry', cost: prices.sellBerry, gain: { shells: 1 }, about: 'Mabel pays a whole shell for each berry.' },
      {
        id: 'woodShovel', name: 'Wood Shovel', icon: 'item-shovel-wood', cost: prices.shopShovel, give: forge('woodShovel'),
        soldOut: owns('woodShovel'), hidden: owns('metalShovel'), about: 'Digs the beach for shells. The smith makes them from wood, too.',
      },
    ],
  });

  VL.defineShop('mill', {
    title: 'Paper Mill',
    greeting: 'Wood in, shells out!',
    offers: [
      { id: 'millTrade', name: 'Wood for a shell', icon: 'icon-wood', cost: prices.millTrade, gain: { shells: 1 }, give: flagOnce('millTrade'), about: 'The mill pulps wood into paper.' },
      { id: 'paper', name: 'Paper', icon: 'item-paper', cost: prices.paper, gain: { paper: 1 }, give: flagOnce('boughtPaper'), about: 'Fresh from the drying racks.' },
    ],
  });

  // Metal gear is its own tier, not an upgrade: forging needs no wood piece,
  // and the wood offer steps aside while the metal one is owned. Each metal
  // offer has a cheaper twin shown once the Smith's Ledger is read; both are
  // sold out while the piece is owned, so the smith re-forges only lost gear.
  const GEAR = [
    { wood: 'woodSword', metal: 'metalSword', woodAbout: 'Weak, but it cuts bushes.', metalAbout: 'Hits twice as hard as wood.' },
    { wood: 'woodShield', metal: 'metalShield', woodAbout: 'Blocks small things.', metalAbout: 'Blocks more, even a diving gull.' },
    { wood: 'woodShovel', metal: 'metalShovel', woodAbout: 'Digs sand. Takes both hands.', metalAbout: 'Digs grass as well as sand.' },
  ];
  const woodOffers = GEAR.map((g) => ({
    id: g.wood, name: VL.ITEMS[g.wood].name, icon: `item-${VL.ITEMS[g.wood].icon}`, cost: prices[g.wood], give: forge(g.wood),
    soldOut: owns(g.wood), hidden: owns(g.metal), about: g.woodAbout,
  }));
  const metalOffers = (ledger) => GEAR.map((g) => ({
    id: ledger ? `${g.metal}Ledger` : g.metal, name: VL.ITEMS[g.metal].name, icon: `item-${VL.ITEMS[g.metal].icon}`,
    cost: ledger ? prices.metalGearLedger : prices.metalGear, give: forge(g.metal),
    soldOut: owns(g.metal), hidden: (state) => VL.smithsLedgerRead(state) !== ledger, about: g.metalAbout,
  }));
  VL.defineShop('smithy', {
    title: 'Smithy',
    greeting: 'Wood or metal, {name}?',
    offers: [...woodOffers, ...metalOffers(false), ...metalOffers(true)],
  });

  VL.definePopup('pagesBound', { title: 'Pages bound!', text: 'Miss Quill sews your loose pages into a real book at last.' });
  VL.defineShop('bookbinder', {
    title: 'Bindery',
    greeting: 'Five loose pages make a book.',
    offers: [
      {
        id: 'bindPages', name: 'Bind loose pages', icon: 'item-paper', cost: prices.binding,
        soldOut: VL.pagesBound,
        refuse(state) {
          const have = VL.loosePages(state);
          const need = VL.pagesToBind();
          return have < need ? `You have ${have} of ${need} pages. Bring me all ${need}!` : null;
        },
        give(state) {
          state.flags.pagesBound = true;
          VL.showPopup(state, 'pagesBound');
        },
        about: 'Sewn, glued and pressed by hand.',
      },
    ],
  });

  // ---------- the berry basket (the stealing easter egg) ----------

  // Mabel turns to tidy her shelves now and then. S on the basket while her
  // back is turned pockets a berry, once: she turns round at once, calls the
  // hero Sticky Fingers from then on, and never turns her back again.
  VL.tune({ shopTurnEvery: 6, shopTurnSeconds: 2.5 });

  VL.ART.defineSprite('prop-basket', {
    colors: { w: 'wood', d: 'woodDark', l: 'woodLight', b: 'berry', r: 'berryLight' },
    rows: ['.bbrbbb.', 'brbbbrbb', 'dwlwlwld', 'dwdwdwdd', '.dwdwdd.', '..dddd..'],
  });

  VL.defineEntity('berryBasket', {
    solid: true,
    onInteract(state) {
      const keeper = state.room.entities.find((e) => e.type === 'npc' && e.id === 'shopkeeper');
      if (state.flags.shopThief || keeper?.facing !== 'up') {
        VL.showMessage(state, { title: 'Mabel', text: 'Those berries are for sale, {name}! Come to the counter.' });
        return;
      }
      VL.addResource(state, 'berries', 1);
      state.flags.shopThief = true;
      VL.earned(state);
      keeper.facing = 'down';
      state.events.push({ type: 'pickup', kind: 'berries' });
      VL.showMessage(state, { text: 'You slip a berry into your pocket. Mabel spins round... did she see?' });
    },
    draw(ctx, basket, x, y) {
      VL.ART.drawShadow(ctx, x + 8, y + 13, 12);
      VL.ART.drawSprite(ctx, 'prop-basket', x + 4, y + 6);
    },
  });

  VL.defineSystem('shopWatch', {
    order: 31,
    update(state, actions, dt) {
      if (state.room.area !== 'shop' || state.flags.shopThief) return;
      const keeper = state.room.entities.find((e) => e.type === 'npc' && e.id === 'shopkeeper');
      if (!keeper) return;
      keeper.watch = (keeper.watch ?? 0) + dt;
      const { shopTurnEvery, shopTurnSeconds } = VL.TUNING;
      const cycle = keeper.watch % (shopTurnEvery + shopTurnSeconds);
      keeper.facing = cycle >= shopTurnEvery ? 'up' : 'down';
    },
  });

  // ---------- the buildings ----------

  // Where each door is on the town map (regions/town.js), the keeper, and
  // the tile in front of the counter where S reaches the keeper.
  VL.BUILDINGS = {
    shop: { door: 'shopDoor', outside: { screen: '2,0', tx: 11, ty: 4 }, npc: 'shopkeeper', shop: 'store' },
    paperMill: { door: 'paperMillDoor', outside: { screen: '3,-1', tx: 6, ty: 4 }, npc: 'miller', shop: 'mill' },
    blacksmith: { door: 'blacksmithDoor', outside: { screen: '3,0', tx: 6, ty: 4 }, npc: 'smith', shop: 'smithy' },
    bindery: { door: 'binderyDoor', outside: { screen: '3,-1', tx: 12, ty: 4 }, npc: 'binder', shop: 'bookbinder' },
  };

  const decor = (art, x, y, more = {}) => ({ type: 'decor', art, x, y, ...more });
  const LAYOUTS = {
    shop: {
      tiles: [
        '################',
        '#nnnn_____nnnn_#',
        '#______________#',
        '#_KKKKKKKKK____#',
        '#______________#',
        '#n____________n#',
        '#______________#',
        '#______________#',
        '#______________#',
        '#______m_______#',
        '################',
      ],
      entities: [decor('goodsShelf', 1, 1, { w: 4 }), decor('goodsShelf', 10, 1, { w: 4 }), decor('barrel', 1, 5), decor('barrel', 14, 5), { type: 'berryBasket', x: 13, y: 6 }],
    },
    paperMill: {
      tiles: [
        '################',
        '#nnn______nnnnn#',
        '#nnn___________#',
        '#___KKKKKKK____#',
        '#______________#',
        '#_nn________nn_#',
        '#_nn________nn_#',
        '#______________#',
        '#______________#',
        '#______m_______#',
        '################',
      ],
      entities: [decor('millGear', 1, 1), decor('paperRack', 10, 1, { w: 5 }), decor('vat', 2, 5), decor('vat', 12, 5)],
    },
    blacksmith: {
      tiles: [
        '################',
        '#nnnn____nnnnnn#',
        '#nnnn__________#',
        '#____KKKKK_____#',
        '#______________#',
        '#______________#',
        '#_n__________n_#',
        '#______________#',
        '#______________#',
        '#______m_______#',
        '################',
      ],
      entities: [decor('forge', 1, 1), decor('toolRack', 9, 1, { w: 6 }), decor('barrel', 2, 6, { holds: 'water' }), decor('anvil', 13, 6)],
    },
    bindery: {
      tiles: [
        '################',
        '#nnnnnn__nnnnnn#',
        '#______________#',
        '#_KKKKKKKKK____#',
        '#______________#',
        '#_nn_______nn__#',
        '#_nn_______nn__#',
        '#______________#',
        '#______________#',
        '#______m_______#',
        '################',
      ],
      entities: [decor('bookcase', 1, 1, { w: 6 }), decor('bookcase', 9, 1, { w: 6 }), decor('press', 2, 5), decor('threadTable', 11, 5)],
    },
  };

  for (const [id, building] of Object.entries(VL.BUILDINGS)) {
    const { outside } = building;
    building.talkAt = { tx: 7, ty: 4 };
    VL.defineArea(id, { tileset: 'interior' });
    VL.ART.setAreaLight(id, 'indoor');
    VL.addScreens(id, {
      '0,0': {
        tiles: LAYOUTS[id].tiles,
        entities: [
          ...LAYOUTS[id].entities,
          { type: 'npc', id: building.npc, x: 7, y: 2 },
          { type: 'door', x: 7, y: 9, to: { area: 'overworld', screen: outside.screen, tx: outside.tx, ty: outside.ty, facing: 'down' } },
        ],
      },
    });
    VL.fillSpot(building.door, { type: 'door', to: { area: id, screen: '0,0', tx: 7, ty: 8, facing: 'up' } });
    VL.defineLock(id, {
      ...VL.LOCKS[id],
      place: { area: id, screen: '0,0' },
      reached: (state) => Boolean(state.visited[`${id}:0,0`]),
    });
  }
})();
