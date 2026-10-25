// W10, the town economy: the shop, paper mill, blacksmith and bindery with
// their keepers, one price table, shovels and digging, whole vs broken
// shells, and re-forging after the shockwave (design: Resources and economy,
// Tools: two tiers, The path through the game 4).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, loadGame, playApp, memoryStorage } = require('./harness');

const STEP = 1 / 60;
const plain = (value) => JSON.parse(JSON.stringify(value));
const BUILDINGS = ['shop', 'paperMill', 'blacksmith', 'bindery'];

function setup({ storage = false } = {}) {
  const { VL } = loadGame();
  VL.sfx = () => true;
  let app;
  if (storage) {
    app = VL.createApp({ storage: VL.createStorage(memoryStorage()) });
    app.startGame(VL.newGame({ name: 'Robin' }), 0, { fresh: true });
    app.save();
    app.setScene('play');
  } else {
    app = playApp(VL);
  }
  app.game.popups.seen.controls = true;
  app.game.popups.queue.length = 0;
  const step = (actions = VL.noActions()) => app.update(actions, STEP);
  const press = (action) => step(VL.actions({ pressed: [action] }));
  const hold = (held, seconds) => {
    for (let t = 0; t < seconds - 1e-9; t += STEP) step(VL.actions({ held }));
  };
  const closePopups = () => {
    for (let i = 0; i < 20 && VL.currentPopup(app.game); i += 1) {
      if (app.sceneId === 'play') step();
      hold([], 0.5);
      press('interact');
    }
    if (app.sceneId === 'popup') step();
  };
  const at = (where) => VL.place(app.game, where);
  return { VL, app, step, press, hold, closePopups, at, get game() { return app.game; } };
}

const offer = (VL, shop, id) => {
  const found = VL.SHOPS[shop].offers.find((o) => o.id === id);
  assert.ok(found, `${shop} sells ${id}`);
  return found;
};
// What the counter shows right now (hidden offers left off).
const showing = (VL, state, shop) => plain(VL.shopOffers(state, VL.SHOPS[shop]).map((o) => o.id));
const give = (VL, state, counts) => {
  for (const [kind, n] of Object.entries(counts)) VL.addResource(state, kind, n);
};

// ---------- resources and the price table ----------

test('paper and ink are resources: counted, saved, spent and shown in shops', () => {
  const { VL } = loadGame();
  assert.ok(VL.RESOURCE_KINDS.includes('paper') && VL.RESOURCE_KINDS.includes('ink'));
  const game = VL.newGame();
  assert.equal(game.inventory.paper, 0);
  assert.equal(game.inventory.ink, 0);
  VL.addResource(game, 'paper', 2);
  assert.equal(VL.purse(game, 'paper'), 2);
  assert.equal(VL.currencyName('paper', 2), 'paper');
});

test('one price table in VL.TUNING holds every price, starting from the design doc', () => {
  const { VL } = loadGame();
  const p = VL.TUNING.prices;
  assert.deepEqual(plain(p), {
    paper: { shells: 2 },
    buyBerry: { shells: 3 },
    sellBerry: { berries: 1 },
    millTrade: { wood: 5 },
    woodSword: { wood: 3 },
    woodShield: { wood: 4 },
    woodShovel: { wood: 4 },
    shopShovel: { shells: 15 },
    metalGear: { ore: 1, shells: 10 },
    metalGearLedger: { ore: 1, shells: 6 },
    binding: { shells: 15 },
    raft: { wood: 4 },
    oarShells: { shells: 8 },
    oarWood: { wood: 3 },
  });
  assert.equal(VL.TUNING.digChance, 0.2);
  assert.equal(VL.TUNING.digChanceTideTables, 0.3);
  // Every offer's cost is the table's entry, so retuning one line retunes the counter.
  const costOf = {
    store: { paper: p.paper, buyBerry: p.buyBerry, sellBerry: p.sellBerry, woodShovel: p.shopShovel, oar: p.oarShells },
    mill: { millTrade: p.millTrade, paper: p.paper },
    smithy: {
      woodSword: p.woodSword, woodShield: p.woodShield, woodShovel: p.woodShovel,
      metalSword: p.metalGear, metalShield: p.metalGear, metalShovel: p.metalGear,
      metalSwordLedger: p.metalGearLedger, metalShieldLedger: p.metalGearLedger, metalShovelLedger: p.metalGearLedger,
      oar: p.oarWood,
    },
    bookbinder: { bindPages: p.binding },
    raftyard: { raft: p.raft },
  };
  for (const [shop, offers] of Object.entries(costOf)) {
    assert.deepEqual(plain(VL.SHOPS[shop].offers.map((o) => o.id)).sort(), Object.keys(offers).sort(), `${shop}'s offers`);
    for (const [id, cost] of Object.entries(offers)) assert.equal(offer(VL, shop, id).cost, cost, `${shop} ${id} costs the table's price`);
  }
  // Trades pay one whole shell.
  for (const [shop, id] of [['store', 'sellBerry'], ['mill', 'millTrade']]) {
    assert.deepEqual(plain(offer(VL, shop, id).gain), { shells: 1 });
    assert.equal(VL.offerVerb(offer(VL, shop, id)), 'Trade');
  }
});

// ---------- the buildings ----------

test('each building door fills its spot, leads inside and back out', () => {
  const t = setup();
  const { VL } = t;
  for (const id of BUILDINGS) {
    const building = VL.BUILDINGS[id];
    const spot = VL.SPOTS[building.door];
    assert.equal(spot.filled, true, `${building.door} is filled`);
    const door = VL.getScreen(spot.area, spot.screen).entities.find((e) => e.spot === building.door);
    assert.equal(door.type, 'door');
    assert.deepEqual(plain(door.to), { area: id, screen: '0,0', tx: 7, ty: 8, facing: 'up' });
    // Walk up onto the door from the tile below it.
    t.at({ area: spot.area, screen: spot.screen, tx: spot.x, ty: spot.y + 1, facing: 'up' });
    t.hold(['up'], 0.5);
    assert.equal(t.game.player.area, id, `the ${id} door goes inside`);
    assert.equal(VL.LOCKS[id].reached(t.game), true, `${id} is reached once inside`);
    // And out through the mat.
    for (let i = 0; i < 60 && t.game.player.area === id; i += 1) t.step(VL.actions({ held: ['down'] }));
    assert.deepEqual([t.game.player.area, t.game.player.screen], [spot.area, spot.screen], `the ${id} mat goes back out`);
    assert.deepEqual([VL.heroTile(t.game).tx, VL.heroTile(t.game).ty], [spot.x, spot.y + 1], `back out below the ${id} door`);
  }
});

test('S at the counter talks to the keeper behind it; the shop opens after the last page', () => {
  const t = setup();
  const { VL } = t;
  for (const id of BUILDINGS) {
    const building = VL.BUILDINGS[id];
    t.at({ area: id, screen: '0,0', ...building.talkAt, facing: 'up' });
    t.press('interact');
    assert.equal(t.app.sceneId, 'dialogue', `S at the ${id} counter talks`);
    assert.equal(t.app.dialogue.speaker, VL.NPCS[building.npc].name);
    for (let i = 0; i < 12 && t.app.sceneId === 'dialogue'; i += 1) t.press('interact');
    assert.equal(t.app.sceneId, 'shop', `${id}: the shop opens after talking`);
    assert.equal(t.app.shopView.shop.id, building.shop);
    t.press('pause');
    assert.equal(t.app.sceneId, 'play');
  }
});

test('the counter: S facing away, or a step back from it, does not talk', () => {
  const t = setup();
  const { VL } = t;
  const { talkAt } = VL.BUILDINGS.shop;
  t.at({ area: 'shop', screen: '0,0', ...talkAt, facing: 'down' });
  t.press('interact');
  assert.equal(t.app.sceneId, 'play');
  t.at({ area: 'shop', screen: '0,0', tx: talkAt.tx, ty: talkAt.ty + 1, facing: 'up' });
  t.press('interact');
  assert.equal(t.app.sceneId, 'play');
});

test('the counter: S facing any counter tile, or a counter end from the side, talks to the keeper', () => {
  const t = setup();
  const { VL } = t;
  for (const id of BUILDINGS) {
    const counter = [];
    for (let tx = 0; tx < 16; tx += 1) if (VL.tileInfo(id, VL.tileAt(id, '0,0', tx, 3)).counter) counter.push(tx);
    assert.ok(counter.length >= 5, `${id} has a counter on row 3`);
    const spots = [
      ...counter.map((tx) => ({ tx, ty: 4, facing: 'up' })),
      { tx: counter[0] - 1, ty: 3, facing: 'right' },
      { tx: counter.at(-1) + 1, ty: 3, facing: 'left' },
    ];
    for (const spot of spots) {
      t.at({ area: id, screen: '0,0', ...spot });
      const keeper = t.game.room.entities.find((e) => e.type === 'npc');
      keeper.facing = 'up';
      t.press('interact');
      const where = `${id}: S at ${spot.tx},${spot.ty} facing ${spot.facing}`;
      assert.equal(t.app.sceneId, 'dialogue', `${where} talks`);
      assert.equal(t.app.dialogue.speaker, VL.NPCS[VL.BUILDINGS[id].npc].name, `${where} reaches the keeper`);
      assert.notEqual(keeper.facing, 'up', `${where}: the keeper turns to the hero`);
      for (let i = 0; i < 20 && t.app.sceneId !== 'play'; i += 1) t.press(t.app.sceneId === 'shop' ? 'pause' : 'interact');
      assert.equal(t.app.sceneId, 'play');
    }
    // Floor beside the counter is just floor.
    t.at({ area: id, screen: '0,0', tx: counter.at(-1) + 2, ty: 4, facing: 'up' });
    t.press('interact');
    assert.equal(t.app.sceneId, 'play', `${id}: S past the counter's end does nothing`);
  }
});

test('every keeper is placed, defined and has words; their dialogue checks clean', () => {
  const { VL } = loadGame();
  for (const id of BUILDINGS) {
    const { npc } = VL.BUILDINGS[id];
    const placed = VL.getScreen(id, '0,0').entities.find((e) => e.type === 'npc');
    assert.equal(placed.id, npc, `${npc} keeps the ${id}`);
    assert.ok(VL.DIALOGUES[VL.NPCS[npc].talk]);
  }
  assert.deepEqual([...VL.dialogueProblems()], []);
  assert.equal(VL.ART.lightFor('shop'), 'indoor');
});

// ---------- the general store ----------

test('the store: paper, berries bought and sold, and a wood shovel for shells', () => {
  const { VL } = loadGame();
  const game = VL.newGame();
  // A full first purse (15 whole shells since W29).
  give(VL, game, { shells: 15, berries: 1 });
  assert.equal(VL.buyOffer(game, offer(VL, 'store', 'paper')).ok, true);
  assert.deepEqual([game.inventory.paper, game.inventory.shells], [1, 13]);
  assert.equal(VL.buyOffer(game, offer(VL, 'store', 'buyBerry')).ok, true);
  assert.deepEqual([game.inventory.berries, game.inventory.shells], [2, 10]);
  assert.equal(VL.LOCKS.buyBerries.reached(game), true);
  assert.equal(VL.buyOffer(game, offer(VL, 'store', 'sellBerry')).ok, true);
  assert.deepEqual([game.inventory.berries, game.inventory.shells], [1, 11]);
  give(VL, game, { shells: 4 });
  assert.equal(VL.buyOffer(game, offer(VL, 'store', 'woodShovel')).ok, true);
  assert.equal(VL.hasItem(game, 'woodShovel'), true);
  assert.equal(game.inventory.shells, 0);
  assert.equal(VL.buyOffer(game, offer(VL, 'store', 'woodShovel')).reason, 'soldOut', 'one shovel is enough');
});

test('whole shells are money, broken ones are not', () => {
  const { VL } = loadGame();
  const game = VL.newGame();
  give(VL, game, { brokenShells: 30 });
  const result = VL.buyOffer(game, offer(VL, 'store', 'paper'));
  assert.deepEqual([result.ok, result.reason, result.kind], [false, 'notEnough', 'shells']);
  assert.equal(game.inventory.brokenShells, 30, 'nothing taken');
  // Every price, trade and gain in town is whole shells, never broken ones.
  for (const shop of Object.values(VL.SHOPS)) {
    for (const o of shop.offers) {
      assert.ok(!('brokenShells' in o.cost) && !('brokenShells' in (o.gain || {})), `${shop.id} ${o.id}`);
    }
  }
  // The shopkeeper has a word for a purse of broken shells.
  game.flags['met:mabel'] = true;
  const line = VL.pickDialogue(game, 'shopkeeper');
  assert.match([].concat(line.say).join(' '), /broken/i);
});

test('stealing: a berry from the basket only while Mabel\'s back is turned, and she remembers', () => {
  const t = setup({ storage: true });
  const { VL } = t;
  const basket = VL.getScreen('shop', '0,0').entities.find((e) => e.type === 'berryBasket');
  t.at({ area: 'shop', screen: '0,0', tx: basket.x, ty: basket.y + 1, facing: 'up' });
  const keeper = () => t.game.room.entities.find((e) => e.id === 'shopkeeper');
  // Watched: a word from Mabel, nothing taken.
  t.press('interact');
  assert.equal(t.game.inventory.berries, 0);
  assert.equal(VL.currentPopup(t.game).title, 'Mabel');
  t.closePopups();
  // She turns to her shelves for a moment every so often.
  t.hold([], VL.TUNING.shopTurnEvery + 0.2);
  assert.equal(keeper().facing, 'up');
  t.press('interact');
  assert.equal(t.game.inventory.berries, 1);
  assert.equal(t.game.flags.shopThief, true);
  assert.equal(t.game.dirty, false, 'saved at once');
  assert.equal(keeper().facing, 'down', 'she spins round');
  t.closePopups();
  // Never again: she keeps watching, and the basket gives nothing more.
  t.hold([], VL.TUNING.shopTurnEvery + VL.TUNING.shopTurnSeconds);
  assert.equal(keeper().facing, 'down');
  t.press('interact');
  assert.equal(t.game.inventory.berries, 1);
  t.closePopups();
  // Her words: a scolding once, then the nickname.
  const said = () => [].concat(VL.pickDialogue(t.game, 'shopkeeper').say).join(' ');
  assert.match(said(), /Sticky Fingers! Don't think/);
  VL.endTalk(t.game, { set: 'scolded:mabel' });
  assert.match(said(), /Back again, Sticky Fingers/);
  assert.equal(VL.pickDialogue(t.game, 'shopkeeper').shop, 'store', 'she still sells to you');
});

// ---------- the paper mill ----------

test('the paper mill: 5 wood for 1 shell, and paper for 2 shells', () => {
  const { VL } = loadGame();
  const game = VL.newGame();
  give(VL, game, { wood: 4 });
  assert.equal(VL.buyOffer(game, offer(VL, 'mill', 'millTrade')).reason, 'notEnough', '4 wood is not enough');
  VL.addResource(game, 'wood', 6);
  assert.equal(VL.buyOffer(game, offer(VL, 'mill', 'millTrade')).ok, true);
  assert.deepEqual([game.inventory.wood, game.inventory.shells], [5, 1]);
  assert.equal(VL.LOCKS.millShells.reached(game), true);
  assert.equal(VL.buyOffer(game, offer(VL, 'mill', 'millTrade')).ok, true);
  assert.deepEqual([game.inventory.wood, game.inventory.shells], [0, 2]);
  assert.equal(VL.LOCKS.paper.reached(game), false);
  assert.equal(VL.buyOffer(game, offer(VL, 'mill', 'paper')).ok, true);
  assert.deepEqual([game.inventory.paper, game.inventory.shells], [1, 0]);
  assert.equal(VL.LOCKS.paper.reached(game), true);
  assert.equal(VL.shopQuestion({ asking: offer(VL, 'mill', 'millTrade') }), 'Trade 5 wood for 1 shell?');
});

// ---------- the blacksmith ----------

test('the smith makes wood gear from wood, one of each while you have it', () => {
  const { VL } = loadGame();
  const game = VL.newGame();
  give(VL, game, { wood: 11 });
  for (const [id, wood] of [['woodSword', 8], ['woodShield', 4], ['woodShovel', 0]]) {
    assert.equal(VL.buyOffer(game, offer(VL, 'smithy', id)).ok, true, id);
    assert.equal(VL.hasItem(game, id), true);
    assert.equal(game.inventory.wood, wood);
    assert.equal(VL.LOCKS[id].reached(game), true);
  }
  give(VL, game, { wood: 9 });
  for (const id of ['woodSword', 'woodShield', 'woodShovel']) assert.equal(VL.buyOffer(game, offer(VL, 'smithy', id)).reason, 'soldOut', id);
  assert.equal(game.inventory.wood, 9);
});

test('the smith forges metal gear from 1 ore and 10 shells each; no ore, no forging', () => {
  const { VL } = loadGame();
  const game = VL.newGame();
  give(VL, game, { shells: 30 });
  const sword = offer(VL, 'smithy', 'metalSword');
  assert.deepEqual([VL.buyOffer(game, sword).reason, VL.buyOffer(game, sword).kind], ['notEnough', 'ore']);
  give(VL, game, { ore: 2 });
  assert.equal(VL.buyOffer(game, sword).ok, true);
  assert.deepEqual([game.inventory.ore, game.inventory.shells], [1, 20]);
  assert.equal(VL.hasItem(game, 'metalSword'), true);
  assert.equal(VL.LOCKS.metalSword.reached(game), true);
  // W3 known limit: the smith re-forges only gear that was lost, never a second one.
  assert.equal(VL.buyOffer(game, sword).reason, 'soldOut');
  assert.equal(game.inventory.ore, 1);
  assert.equal(VL.buyOffer(game, offer(VL, 'smithy', 'metalShovel')).ok, true);
  assert.equal(VL.hasItem(game, 'metalShovel'), true);
  assert.deepEqual([game.inventory.ore, game.inventory.shells], [0, 10]);
});

test('metal is its own tier: forging needs no wood gear, and the wood offer steps aside once you hold metal', () => {
  const { VL } = loadGame();
  const game = VL.newGame();
  assert.deepEqual(showing(VL, game, 'smithy'), ['woodSword', 'woodShield', 'woodShovel', 'metalSword', 'metalShield', 'metalShovel']);
  give(VL, game, { ore: 1, shells: 10 });
  assert.equal(VL.buyOffer(game, offer(VL, 'smithy', 'metalShield')).ok, true, 'no wood shield needed');
  assert.deepEqual(showing(VL, game, 'smithy'), ['woodSword', 'woodShovel', 'metalSword', 'metalShield', 'metalShovel']);
});

test('the Smith\'s Ledger, once read, makes forging cost fewer shells', () => {
  const { VL } = loadGame();
  const game = VL.newGame();
  VL.markFound(game, 'bookSmithsLedger');
  VL.returnBooks(game);
  assert.equal(VL.smithsLedgerRead(game), false, 'returned but not read yet');
  VL.finishReading(game, 'bookSmithsLedger');
  assert.equal(VL.smithsLedgerRead(game), true);
  assert.deepEqual(showing(VL, game, 'smithy'), ['woodSword', 'woodShield', 'woodShovel', 'metalSwordLedger', 'metalShieldLedger', 'metalShovelLedger']);
  give(VL, game, { ore: 1, shells: 6 });
  assert.equal(VL.buyOffer(game, offer(VL, 'smithy', 'metalSwordLedger')).ok, true);
  assert.deepEqual([game.inventory.ore, game.inventory.shells], [0, 0]);
  assert.equal(VL.buyOffer(game, offer(VL, 'smithy', 'metalSwordLedger')).reason, 'soldOut');
  assert.equal(VL.buyOffer(game, offer(VL, 'smithy', 'metalSword')).reason, 'soldOut', 'both prices know the sword is owned');
});

// The shockwave (W16) as the progression table states it: everything it
// `loses` is taken, and whole shells become broken ones.
function shockwave(VL, game) {
  game.flags.shockwave = true;
  for (const key of VL.LOCKS.shockwave.loses) {
    if (VL.ITEMS[key]) delete game.items[key];
    else if (key !== 'shells' && VL.RESOURCE_KINDS.includes(key)) game.inventory[key] = 0;
  }
  game.inventory.brokenShells += game.inventory.shells;
  game.inventory.shells = 0;
  VL.tidyHands(game);
}

test('after the shockwave: lost gear can be bought and forged again, with the ore you kept', () => {
  const { VL } = loadGame();
  const game = VL.newGame();
  give(VL, game, { ore: 2, shells: 20, wood: 4, paper: 2 });
  for (const id of ['metalSword', 'metalShield']) assert.equal(VL.buyOffer(game, offer(VL, 'smithy', id)).ok, true);
  VL.giveItem(game, 'woodShovel');
  give(VL, game, { ore: 1, shells: 7 });
  shockwave(VL, game);
  assert.deepEqual([VL.hasItem(game, 'metalSword'), VL.hasItem(game, 'woodShovel'), game.inventory.shells, game.inventory.brokenShells, game.inventory.ore],
    [false, false, 0, 7, 1], 'gear and whole shells gone, unused ore kept');
  assert.deepEqual(plain(game.hands), { mainHand: null, offHand: null });
  assert.deepEqual(showing(VL, game, 'smithy'), ['woodSword', 'woodShield', 'woodShovel', 'metalSword', 'metalShield', 'metalShovel', 'oar'], 'everything is for sale again');
  // Broken shells buy nothing; the climb back starts with wood.
  assert.equal(VL.buyOffer(game, offer(VL, 'smithy', 'metalSword')).kind, 'shells');
  give(VL, game, { wood: 3 });
  assert.equal(VL.buyOffer(game, offer(VL, 'smithy', 'woodSword')).ok, true);
  give(VL, game, { shells: 10 });
  assert.equal(VL.buyOffer(game, offer(VL, 'smithy', 'metalSword')).ok, true, 're-forged from the kept lump');
  assert.equal(game.inventory.ore, 0);
  assert.equal(VL.buyOffer(game, offer(VL, 'smithy', 'metalShield')).kind, 'ore', 'each metal item needs its own lump');
});

test('after the shockwave: lost gear reads as lost, but paper (a source, like berries) stays reached', () => {
  const t = setup();
  const { VL } = t;
  const game = t.game;
  give(VL, game, { shells: 20 });
  assert.equal(VL.buyOffer(game, offer(VL, 'mill', 'paper')).ok, true);
  game.flags.pickedBerries = true;
  VL.giveItem(game, 'woodSword');
  assert.deepEqual(['paper', 'berries', 'woodSword'].map((id) => VL.LOCKS[id].reached(game)), [true, true, true]);
  shockwave(VL, game);
  assert.equal(game.inventory.paper, 0, 'the shockwave takes the paper');
  assert.equal(VL.LOCKS.woodSword.reached(game), false, 'gear lost reads as lost');
  assert.deepEqual([VL.LOCKS.paper.reached(game), VL.LOCKS.berries.reached(game)], [true, true], 'renewable sources stay open');
  assert.ok(VL.LOCKS.paper.renewable && VL.LOCKS.berries.renewable);
});

// ---------- the bindery ----------

test('the bindery binds five loose pages for 15 shells, once', () => {
  const { VL } = loadGame();
  // Stand-ins for the page finds later items claim (W11, W17, W18).
  const pageLocks = Object.values(VL.LOCKS).filter((lock) => lock.supplies.pages);
  assert.equal(pageLocks.reduce((sum, lock) => sum + lock.supplies.pages, 0), VL.LOCKS.climbersAlmanac.count.pages, 'the table has exactly enough pages');
  for (const lock of pageLocks) {
    if (!lock.reached) VL.defineLock(lock.id, { ...lock, reached: (state) => Boolean(state.flags[`test:${lock.id}`]) });
  }
  const game = VL.newGame();
  const bind = offer(VL, 'bookbinder', 'bindPages');
  give(VL, game, { shells: 20 });
  assert.equal(VL.loosePages(game), 0);
  let result = VL.buyOffer(game, bind);
  assert.equal(result.reason, 'refused');
  assert.match(result.text, /0 of 5/);
  // Implemented page locks read the found flag, stand-ins the test flag.
  const findPage = (lock) => {
    VL.markFound(game, lock.id);
    game.flags[`test:${lock.id}`] = true;
  };
  pageLocks.slice(0, 4).forEach(findPage);
  assert.equal(VL.loosePages(game), 4);
  assert.match(VL.buyOffer(game, bind).text, /4 of 5/);
  assert.equal(game.inventory.shells, 20, 'a refusal takes nothing');
  pageLocks.forEach(findPage);
  assert.equal(VL.loosePages(game), 5);
  result = VL.buyOffer(game, bind);
  assert.equal(result.ok, true);
  assert.equal(game.inventory.shells, 5);
  assert.equal(VL.pagesBound(game), true);
  assert.equal(VL.buyOffer(game, bind).reason, 'soldOut');
  assert.ok(game.popups.queue.includes('pagesBound'), 'a popup waits for play (no scene from inside a shop)');
});

// ---------- shovels and digging ----------

// A beach screen the tests own: sand, grass, water and a rock.
function addDunes(VL) {
  VL.addScreens('dunes', {
    '0,0': {
      tiles: [
        'TTTTTTTTTTTTTTTT',
        'T..............T',
        'T..,...........T',
        'T..............T',
        'Tsssssssssssssss',
        'Tsssssssssssssss',
        'Tsssssrsssssssss',
        'Tsssssssssssssss',
        'Tsssssssssssssss',
        'wwwwwwwwwwwwwwww',
        'WWWWWWWWWWWWWWWW',
      ],
      entities: [],
    },
    '1,0': {
      tiles: [
        'TTTTTTTTTTTTTTTT',
        'T..............T',
        'T..............T',
        'T..............T',
        'sssssssssssssssT',
        'sssssssssssssssT',
        'sssssssssssssssT',
        'sssssssssssssssT',
        'sssssssssssssssT',
        'wwwwwwwwwwwwwwww',
        'WWWWWWWWWWWWWWWW',
      ],
      entities: [],
    },
  });
}

function digSetup(shovel = 'woodShovel') {
  const t = setup();
  addDunes(t.VL);
  t.at({ area: 'dunes', screen: '0,0', tx: 4, ty: 5, facing: 'right' });
  if (shovel) {
    t.VL.giveItem(t.game, shovel);
    t.game.popups.queue.length = 0;
    t.game.popups.seen.digKey = true; // the dig key's own popup (W29) is tested elsewhere
  }
  return t;
}

const drops = (game) => game.room.entities.filter((e) => e.type === 'drop');

test('the shovel is two-handed: it fills both hands, and Space or D digs', () => {
  const t = digSetup();
  const { VL } = t;
  assert.deepEqual(plain(t.game.hands), { mainHand: 'woodShovel', offHand: 'woodShovel' });
  t.press('mainHand');
  assert.equal(VL.tileAt('dunes', '0,0', 5, 5, t.game.room), VL.DIG_HOLES.sand, 'Space dug the sand ahead');
  t.hold([], 0.5);
  t.game.player.facing = 'down';
  t.press('offHand');
  assert.equal(VL.tileAt('dunes', '0,0', 4, 6, t.game.room), VL.DIG_HOLES.sand, 'D digs too');
  // Anything else in either hand puts the shovel down; picking it again empties both.
  VL.giveItem(t.game, 'woodSword');
  VL.setHand(t.game, 'mainHand', 'woodSword');
  assert.deepEqual(plain(t.game.hands), { mainHand: 'woodSword', offHand: null });
  VL.setHand(t.game, 'offHand', 'woodShovel');
  assert.deepEqual(plain(t.game.hands), { mainHand: 'woodShovel', offHand: 'woodShovel' });
  VL.setHand(t.game, 'mainHand', 'woodShovel');
  assert.deepEqual(plain(t.game.hands), { mainHand: null, offHand: null });
  // Given while the hands are full, it waits in the equipment screen.
  const game = VL.newGame();
  VL.giveItem(game, 'woodSword');
  VL.giveItem(game, 'metalShovel');
  assert.deepEqual(plain(game.hands), { mainHand: 'woodSword', offHand: null });
});

test('the equipment grid marks a two-handed shovel with both keys, a one-handed item with its own', () => {
  const t = setup();
  const { VL } = t;
  VL.giveItem(t.game, 'woodShovel');
  assert.equal(VL.handMarks(t.game, 'woodShovel'), '␣D');
  VL.giveItem(t.game, 'woodShield');
  VL.setHand(t.game, 'offHand', 'woodShield');
  assert.equal(VL.handMarks(t.game, 'woodShield'), 'D');
  assert.equal(VL.handMarks(t.game, 'woodShovel'), '');
});

test('digging sand: a whole shell 20% of the time (seeded), a hole either way (W29 odds)', () => {
  const t = digSetup();
  const { VL } = t;
  const rolls = [0.19, 0.71];
  VL.random = () => rolls.shift();
  assert.equal(VL.dig(t.game, 'woodShovel'), 'shell');
  assert.equal(drops(t.game).length, 1);
  assert.deepEqual([drops(t.game)[0].kind, drops(t.game)[0].x, drops(t.game)[0].y], ['shell', 5, 5]);
  assert.equal(VL.LOCKS.digShells.reached(t.game), true);
  t.hold([], VL.TUNING.digSeconds + 0.05);
  t.game.player.facing = 'down';
  assert.equal(VL.dig(t.game, 'woodShovel'), 'empty');
  assert.equal(drops(t.game).length, 1);
});

test('digging odds come from the seeded random numbers: about 20%, or 30% with the Tide Tables read (W29 odds)', () => {
  const { VL } = loadGame();
  const rate = (read) => {
    const game = VL.createGame({ seed: 2024 });
    let shells = 0;
    for (let i = 0; i < 2000; i += 1) if (VL.digFind(game, 'sand', read) === 'shell') shells += 1;
    return shells / 2000;
  };
  const plainRate = rate(false);
  const tideRate = rate(true);
  assert.ok(plainRate > 0.17 && plainRate < 0.23, `plain ${plainRate}`);
  assert.ok(tideRate > 0.27 && tideRate < 0.33, `tide tables ${tideRate}`);
  assert.equal(rate(false), plainRate, 'the same seed digs the same shells');
  // The book switches it on once the librarian has read it (W11).
  const game = VL.newGame();
  VL.markFound(game, 'bookTideTables');
  VL.returnBooks(game);
  assert.equal(VL.digChance(game, 'sand'), 0.2);
  VL.finishReading(game, 'bookTideTables');
  assert.equal(VL.digChance(game, 'sand'), 0.3);
});

test('a wood shovel digs sand only; the metal one digs grass too; never rock, water or a hole', () => {
  const t = digSetup();
  const { VL } = t;
  const at = (tx, ty, facing) => {
    t.hold([], VL.TUNING.digSeconds + 0.05);
    VL.place(t.game, { area: 'dunes', screen: '0,0', tx, ty, facing });
  };
  at(4, 4, 'up');
  assert.equal(VL.dig(t.game, 'woodShovel'), 'blocked', 'grass is too hard for wood');
  assert.equal(VL.tileAt('dunes', '0,0', 4, 3, t.game.room), '.');
  at(5, 6, 'right');
  assert.equal(VL.dig(t.game, 'woodShovel'), 'blocked', 'a rock');
  at(4, 8, 'down');
  assert.equal(VL.dig(t.game, 'woodShovel'), 'blocked', 'the shallows');
  at(8, 5, 'right');
  assert.notEqual(VL.dig(t.game, 'woodShovel'), 'blocked');
  t.hold([], VL.TUNING.digSeconds + 0.05);
  assert.equal(VL.dig(t.game, 'woodShovel'), 'blocked', 'a hole is dug once a visit');
  VL.giveItem(t.game, 'metalShovel');
  t.game.popups.queue.length = 0;
  at(4, 4, 'up');
  assert.notEqual(VL.dig(t.game, 'metalShovel'), 'blocked', 'metal digs the grass');
  assert.equal(VL.tileAt('dunes', '0,0', 4, 3, t.game.room), VL.DIG_HOLES.dirt);
  // Holes are this visit's: they are gone when the hero comes back.
  VL.place(t.game, { area: 'dunes', screen: '0,0', tx: 8, ty: 5 });
  assert.equal(VL.tileAt('dunes', '0,0', 9, 5, t.game.room), 's');
});

test('one dig at a time, and the dig is drawn with the hero', () => {
  const t = digSetup();
  const { VL } = t;
  assert.notEqual(VL.dig(t.game, 'woodShovel'), false);
  assert.equal(VL.dig(t.game, 'woodShovel'), false, 'still digging');
  assert.ok(t.game.player.dig);
  t.hold([], VL.TUNING.digSeconds + 0.05);
  assert.equal(t.game.player.dig, null);
});

test('the buried book on the beach is dug up once with any shovel', () => {
  const t = setup({ storage: true });
  const { VL } = t;
  const spot = VL.SPOTS.bookBeachBuried;
  assert.equal(spot.filled, true);
  VL.giveItem(t.game, 'woodShovel');
  t.closePopups();
  t.at({ area: spot.area, screen: spot.screen, tx: spot.x - 1, ty: spot.y, facing: 'right' });
  t.game.room.entities = t.game.room.entities.filter((e) => !VL.isEnemy(e));
  t.press('mainHand');
  assert.equal(VL.spotFound(t.game, 'bookBeachBuried'), true);
  assert.ok(t.game.popups.queue.includes('buriedBook'));
  assert.equal(t.game.dirty, false, 'earned, so the app saved it');
  t.closePopups();
  t.at({ area: spot.area, screen: spot.screen, tx: spot.x - 1, ty: spot.y, facing: 'right' });
  assert.ok(!t.game.room.entities.some((e) => e.type === 'buried'), 'gone on the next visit');
});

test('buried secrets in the fields: only the metal shovel finds them, once', () => {
  const t = setup();
  const { VL } = t;
  const secrets = Object.values(VL.BURIED_SECRETS);
  assert.ok(secrets.length >= 2);
  for (const secret of secrets) {
    const info = VL.tileInfo(secret.area, VL.tileAt(secret.area, secret.screen, secret.tx, secret.ty));
    assert.ok(info.grass && !info.solid, `${secret.id} lies under grass`);
  }
  const secret = secrets[0];
  const standBy = () => {
    t.hold([], VL.TUNING.digSeconds + 0.05);
    VL.place(t.game, { area: secret.area, screen: secret.screen, tx: secret.tx, ty: secret.ty + 1, facing: 'up' });
    t.game.room.entities = t.game.room.entities.filter((e) => !VL.isEnemy(e));
  };
  VL.giveItem(t.game, 'woodShovel');
  VL.giveItem(t.game, 'metalShovel');
  t.game.popups.queue.length = 0;
  t.game.popups.seen.digKey = true; // the dig key's own popup (W29) is tested elsewhere
  standBy();
  assert.equal(VL.dig(t.game, 'woodShovel'), 'blocked');
  standBy();
  const before = t.game.inventory.shells;
  assert.equal(VL.dig(t.game, 'metalShovel'), 'secret');
  assert.equal(t.game.inventory.shells, before + secret.shells);
  assert.equal(VL.LOCKS.buriedSecrets.reached(t.game), true);
  standBy();
  assert.notEqual(VL.dig(t.game, 'metalShovel'), 'secret', 'found once');
});

// ---------- the progression table ----------

test('every economy lock is claimed, with the planned rules', () => {
  const { VL } = loadGame();
  const ids = ['shop', 'paperMill', 'blacksmith', 'bindery', 'buyBerries', 'digShells', 'millShells', 'paper', 'woodSword', 'woodShield', 'woodShovel', 'metalSword', 'metalShield', 'metalShovel', 'buriedSecrets'];
  for (const id of ids) {
    assert.equal(typeof VL.LOCKS[id].reached, 'function', `${id} is implemented`);
    assert.equal(VL.LOCKS[id].replan, undefined, `${id} keeps the planned rule`);
  }
  for (const id of BUILDINGS) assert.deepEqual(plain(VL.LOCKS[id].place), { area: id, screen: '0,0' });
  const w10 = Object.values(VL.LOCKS).filter((lock) => lock.by === 'W10').map((lock) => lock.id);
  assert.deepEqual(plain(w10).sort(), ids.slice().sort(), 'every lock planned for W10 is one of these');
});

test('the solver: the economy cannot softlock, before or after the shockwave', () => {
  const { VL } = loadGame();
  const report = VL.solveProgression();
  assert.deepEqual([...report.problems], []);
  const [before, after] = report.stages;
  for (const id of ['shop', 'paperMill', 'blacksmith', 'paper', 'millShells', 'woodShovel', 'digShells', 'metalSword']) {
    assert.ok(before.reached.includes(id), `${id} before the shockwave`);
  }
  for (const id of ['woodSword', 'woodShield', 'woodShovel', 'metalSword', 'metalShield', 'metalShovel', 'paper', 'millShells', 'digShells', 'buyBerries']) {
    assert.ok(after.reached.includes(id), `${id} again after the shockwave`);
  }
  assert.deepEqual([...report.regained.shockwave].sort(), [...VL.LOCKS.shockwave.loses].sort());
});

test('broken: a smith who never forges again would leave lost metal gear for good', () => {
  const { VL } = loadGame();
  const table = Object.fromEntries(Object.entries(VL.LOCKS).map(([id, lock]) => [id, { ...lock }]));
  for (const id of ['metalSword', 'metalShield', 'metalShovel', 'woodSword', 'woodShield']) table[id].renewable = false;
  const problems = [...VL.solveProgression(table).problems];
  assert.ok(problems.some((p) => /after shockwave, (wood|metal)Sword cannot be regained/.test(p)), problems.join('\n'));
});

// ---------- saving ----------

test('the W10 fixture: paper, ink and a shovel survive a load', () => {
  const { VL } = loadGame();
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v1-W10.json'), 'utf8'));
  assert.ok(fixture.inventory.paper > 0 && fixture.inventory.ink > 0 && fixture.items.woodShovel);
  const backing = memoryStorage({ [VL.slotKey(0)]: JSON.stringify(fixture) });
  const game = VL.loadSlot(VL.createStorage(backing), 0);
  assert.deepEqual([game.inventory.paper, game.inventory.ink, VL.hasItem(game, 'woodShovel')], [fixture.inventory.paper, fixture.inventory.ink, true]);
  assert.deepEqual(plain(game.hands), plain(fixture.hands));
});

test('render: every building and a dig draw without error', () => {
  const t = setup();
  const { VL } = t;
  const ctx = VL.ART ? require('./harness').fakeContext() : null;
  for (const id of BUILDINGS) {
    t.at({ area: id, screen: '0,0', tx: 7, ty: 8, facing: 'up' });
    for (let i = 0; i < 3; i += 1) t.step();
    VL.drawWorld(ctx, t.game, 1.3);
  }
  addDunes(VL);
  VL.giveItem(t.game, 'metalShovel');
  t.at({ area: 'dunes', screen: '0,0', tx: 4, ty: 5, facing: 'right' });
  VL.dig(t.game, 'metalShovel');
  VL.drawWorld(ctx, t.game, 0.1);
  for (const id of ['woodShovel', 'metalShovel']) assert.ok(VL.ART.SPRITES[`item-${VL.ITEMS[id].icon}`], `${id} has a sprite`);
});

// ---------- with W7 chickens ----------

// Lifts the first chicken on overworld `screen` from in front of the hero.
function liftHen(t, screen, spot) {
  const { VL } = t;
  t.at({ area: 'overworld', screen, tx: 4, ty: 4, facing: 'up' });
  const hen = t.game.room.entities.find((e) => e.type === 'chicken' && (!spot || e.spot === spot));
  const px = t.game.player.x;
  const py = t.game.player.y - 16;
  Object.assign(hen, { px, py, x: VL.tileOf(px, py).tx, y: VL.tileOf(px, py).ty, mode: 'idle', idle: 99 });
  t.press('interact');
  assert.equal(t.game.player.carrying, hen, 'lifted');
  t.hold([], 0.2);
  return hen;
}

// Walks in through the building's door from the tile below it.
function walkIn(t, id) {
  const spot = t.VL.SPOTS[t.VL.BUILDINGS[id].door];
  t.at({ area: spot.area, screen: spot.screen, tx: spot.x, ty: spot.y + 1, facing: 'up' });
  t.hold(['up'], 0.5);
  assert.equal(t.game.player.area, id, `in the ${id}`);
}

test('with chickens: a chicken carried into a building stays in hand, and S at the counter talks instead of throwing it', () => {
  const t = setup();
  const { VL } = t;
  for (const id of BUILDINGS) {
    t.game.player.carrying = null;
    const hen = liftHen(t, '2,1');
    walkIn(t, id);
    t.at({ area: id, screen: '0,0', ...VL.BUILDINGS[id].talkAt, facing: 'up' });
    t.press('interact');
    assert.equal(t.app.sceneId, 'dialogue', `${id}: S at the counter talks`);
    assert.equal(t.game.player.carrying, hen, `${id}: the chicken is still in hand`);
    assert.ok(!t.game.room.entities.includes(hen), `${id}: not thrown over the counter`);
    for (let i = 0; i < 20 && t.app.sceneId !== 'play'; i += 1) t.press(t.app.sceneId === 'shop' ? 'pause' : 'interact');
    assert.equal(t.app.sceneId, 'play');
    assert.equal(t.game.player.carrying, hen, `${id}: still in hand after the shop`);
    // Away from the counter, S throws it as anywhere else.
    t.at({ area: id, screen: '0,0', tx: 7, ty: 7, facing: 'down' });
    t.press('interact');
    assert.equal(t.game.player.carrying, null, `${id}: S away from the counter throws`);
  }
});

test('with chickens: the lost chicken trots into a shop behind the hero and never blocks the counter', () => {
  const t = setup();
  const { VL } = t;
  const spot = VL.SPOTS.lostChicken;
  const hen = liftHen(t, spot.screen, 'lostChicken');
  t.game.player.facing = 'down';
  t.press('interact');
  assert.equal(t.game.player.carrying, null, 'thrown');
  walkIn(t, 'shop');
  t.hold([], 1);
  assert.ok(t.game.room.entities.includes(hen), 'it came into the shop');
  assert.ok(VL.chickenWithHero(t.game, 'lostChicken'));
  // Even standing on the hero's talking tile, it does not get in the way.
  const { talkAt } = VL.BUILDINGS.shop;
  t.at({ area: 'shop', screen: '0,0', ...talkAt, facing: 'up' });
  t.hold([], 0.2);
  Object.assign(hen, { px: t.game.player.x, py: t.game.player.y - 8, x: talkAt.tx, y: talkAt.ty, mode: 'follow' });
  t.press('interact');
  assert.equal(t.app.sceneId, 'dialogue', 'S at the counter still talks');
  assert.equal(t.game.player.carrying, null, 'and does not pick the chicken up');
});
