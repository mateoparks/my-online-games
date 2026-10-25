// The raft and the water (W17): Nell's raft after the shockwave, the oar
// bought or made, sailing deep water (launching, landing, screen edges, what
// stops it), the lake island's ore, the shipwreck and its little dungeon,
// the two titled books out there, the locks, and the steps with real keys.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, loadGame, memoryStorage, hold, heroTile, fakeDocument } = require('./harness');
const { createPlaythrough, findPath } = require('./playthrough');
const w17 = require('./steps/w17.steps');

const plain = (value) => JSON.parse(JSON.stringify(value));
const W16_SAVE = fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v1-W16.json'), 'utf8');
const shared = loadGame().VL;

// A game after the shockwave (the W16 fixture), in play in slot 0 of an
// in-memory store, so a reload finds it.
function afterShockwave(VL = loadGame().VL, edit = (save) => save) {
  const storage = VL.createStorage(memoryStorage({ [VL.slotKey(0)]: JSON.stringify(edit(JSON.parse(W16_SAVE))) }));
  const app = VL.createApp({ storage });
  app.startGame(VL.loadSlot(storage, 0), 0);
  app.setScene('play');
  return { VL, app, drive: createPlaythrough(VL, { app }).drive };
}

// A bare game standing at `place`, holding whatever `items` says, no enemies.
function standing(VL, place, items = ['raft', 'oar']) {
  const state = VL.createGame();
  for (const id of items) state.items[id] = true;
  VL.place(state, { area: 'overworld', ...place });
  state.room.entities = state.room.entities.filter((e) => !VL.isEnemy(e));
  return state;
}

const where = (VL, state) => [state.player.screen, ...heroTile(VL, state)];

// ---------- prices, Nell and the oar ----------

test('the raft and the oar are priced in the one table, each within the first purse', () => {
  const VL = shared;
  const p = VL.TUNING.prices;
  assert.deepEqual(plain([p.raft, p.oarShells, p.oarWood]), [{ wood: 4 }, { shells: 8 }, { wood: 3 }]);
  assert.ok(p.oarShells.shells <= VL.TUNING.shellCap);
  const offer = (shop, id) => VL.SHOPS[shop].offers.find((o) => o.id === id);
  assert.equal(offer('raftyard', 'raft').cost, p.raft);
  assert.equal(offer('store', 'oar').cost, p.oarShells, 'Mabel sells one for shells');
  assert.equal(offer('smithy', 'oar').cost, p.oarWood, 'Brannock makes one from wood');
});

test('Nell lashes a raft only once the shockwave has calmed the currents, and only with the rope', () => {
  const VL = shared;
  const raft = VL.SHOPS.raftyard.offers.find((o) => o.id === 'raft');
  const before = VL.createGame();
  before.items.grapplingRope = true;
  before.inventory.wood = 9;
  const early = VL.buyOffer(before, raft);
  assert.deepEqual([early.ok, early.reason], [false, 'refused']);
  assert.match(early.text, /currents/);
  assert.equal(before.inventory.wood, 9, 'nothing paid');
  const { app } = afterShockwave(loadGame().VL);
  const game = app.game;
  const ropeless = plain(game.items);
  delete ropeless.grapplingRope;
  assert.match(VL.offerRefusal({ ...game, items: ropeless }, raft), /rope/);
  assert.equal(game.inventory.wood, 2, 'Gran\'s two pieces');
});

test('with four wood after the shockwave the raft is bought: wood spent, raft owned and worn, its popup queued, then sold out', () => {
  const { VL, app } = afterShockwave();
  const game = app.game;
  const raft = VL.SHOPS.raftyard.offers.find((o) => o.id === 'raft');
  assert.equal(VL.buyOffer(game, raft).reason, 'notEnough', 'two wood is not enough');
  game.inventory.wood = 5;
  assert.equal(VL.buyOffer(game, raft).ok, true);
  assert.deepEqual([VL.hasItem(game, 'raft'), game.inventory.wood], [true, 1]);
  assert.ok(!VL.HANDS.some((hand) => game.hands[hand] === 'raft'), 'worn, not held');
  assert.ok(game.popups.queue.includes('raft'));
  assert.ok(raft.soldOut(game));
  assert.equal(VL.LOCKS.raft.reached(game), true);
  assert.equal(VL.LOCKS.rafting.reached(game), false, 'no oar yet');
});

test('an oar from Mabel for shells or from Brannock for wood, either one, sold out once owned', () => {
  const VL = shared;
  for (const shop of ['store', 'smithy']) {
    const game = VL.createGame();
    Object.assign(game.inventory, { shells: 8, wood: 3 });
    const oar = VL.SHOPS[shop].offers.find((o) => o.id === 'oar');
    assert.equal(VL.buyOffer(game, oar).ok, true, shop);
    assert.ok(VL.hasItem(game, 'oar') && oar.soldOut(game), shop);
    assert.equal(VL.LOCKS.oar.reached(game), true);
  }
});

test('Nell\'s words: the currents before the shockwave, the raft after, then the oar, then how to sail', () => {
  const VL = shared;
  const game = VL.createGame();
  game.items.grapplingRope = true;
  assert.match(VL.pickDialogue(game, 'nell').say, /too wild/);
  assert.equal(VL.pickDialogue(game, 'nell').shop, undefined);
  game.flags.shockwave = true;
  const offer = VL.pickDialogue(game, 'nell');
  assert.equal(offer.shop, 'raftyard');
  assert.match(offer.say.join(' '), new RegExp(`${VL.TUNING.prices.raft.wood} wood`));
  game.items.raft = true;
  assert.match(VL.pickDialogue(game, 'nell').say, /oar/);
  game.items.oar = true;
  assert.match(VL.pickDialogue(game, 'nell').say.join(' '), /deep water/);
  assert.match(VL.LIBRARY_HINTS.raft[0].say, /Nell/, 'the librarian sends a stuck kid to Nell');
});

// ---------- sailing ----------

test('deep water: a wall without the raft; with a raft and no oar he is told why, once; with both he paddles off', () => {
  const VL = shared;
  const walker = standing(VL, { screen: '2,-3', tx: 8, ty: 5, facing: 'right' }, []);
  hold(VL, walker, ['right'], 1);
  assert.equal(heroTile(VL, walker)[0], 8, 'no raft: the water stops him');
  assert.ok(!walker.message);

  const oarless = standing(VL, { screen: '2,-3', tx: 8, ty: 5, facing: 'right' }, ['raft']);
  hold(VL, oarless, ['right'], 1);
  assert.equal(heroTile(VL, oarless)[0], 8);
  assert.equal(oarless.message.text, VL.OARLESS_TEXT);
  oarless.message = null;
  hold(VL, oarless, ['right'], 1);
  assert.equal(oarless.message, null, 'once a visit');

  const sailor = standing(VL, { screen: '2,-3', tx: 8, ty: 5, facing: 'right' });
  const events = [];
  for (let t = 0; t < 1; t += 1 / 60) {
    VL.updateWorld(sailor, VL.actions({ held: ['right'] }), 1 / 60);
    events.push(...sailor.events.map((e) => e.type));
  }
  assert.ok(heroTile(VL, sailor)[0] >= 11, `afloat on the lake (${where(VL, sailor)})`);
  assert.ok(VL.afloat(sailor) && sailor.player.afloat);
  assert.ok(events.includes('raftLaunch') && events.includes('raftPaddle'));
});

test('sailing crosses screen edges on the water and lands on the island; touching land steps ashore', () => {
  const VL = shared;
  const state = standing(VL, { screen: '2,-3', tx: 9, ty: 5, facing: 'right' });
  const events = [];
  for (let t = 0; t < 8 && !(state.player.screen === '3,-3' && heroTile(VL, state)[0] >= 8); t += 1 / 60) {
    VL.updateWorld(state, VL.actions({ held: ['right'] }), 1 / 60);
    events.push(...state.events.map((e) => e.type));
  }
  assert.deepEqual(where(VL, state), ['3,-3', 8, 5], 'on the island');
  assert.ok(events.includes('enterScreen') && events.includes('raftLand'));
  assert.ok(!VL.afloat(state) && !state.player.afloat, 'ashore');
  assert.ok(VL.LOCKS.lakeIsland.reached(state));
});

test('what stops the raft: the world\'s edge, the wreck\'s hull, the mill wheel, and solid land', () => {
  const VL = shared;
  const edge = standing(VL, { screen: '3,-3', tx: 3, ty: 1, facing: 'up' });
  hold(VL, edge, ['up'], 1.5);
  assert.deepEqual(where(VL, edge), ['3,-3', 3, 0], 'the world\'s edge');
  assert.ok(edge.player.y >= 0);
  const hull = standing(VL, { screen: '5,2', tx: 2, ty: 5, facing: 'right' });
  hold(VL, hull, ['right'], 1);
  assert.deepEqual(where(VL, hull), ['5,2', 2, 5], 'the hull is no landing');
  const wheel = standing(VL, { screen: '3,-1', tx: 9, ty: 5, facing: 'up' });
  hold(VL, wheel, ['up'], 1);
  assert.deepEqual(where(VL, wheel), ['3,-1', 9, 4], 'no paddling under the mill wheel');
  const cliff = standing(VL, { screen: '0,1', tx: 1, ty: 10, facing: 'left' });
  hold(VL, cliff, ['left'], 1.5);
  assert.equal(cliff.player.screen, '0,1', 'the lighthouse cliffs meet the sea: no way west');
});

test('the wreck has one landing, its stove-in side, onto the deck by the hatch', () => {
  const VL = shared;
  const state = standing(VL, { screen: '5,1', tx: 3, ty: 9, facing: 'down' });
  for (let t = 0; t < 4 && state.player.screen !== '5,2'; t += 1 / 60) VL.updateWorld(state, VL.actions({ held: ['down'] }), 1 / 60);
  assert.equal(state.player.screen, '5,2', 'down off the beach to the wreck');
  assert.ok(VL.LOCKS.shipwreck.reached(state), 'the shipwreck is reached on arriving');
  const landings = [];
  const deck = (tx, ty) => VL.tileInfo('overworld', VL.tileAt('overworld', '5,2', tx, ty)).bridge || VL.getScreen('overworld', '5,2').tiles[ty][tx] === 'b';
  for (let ty = 0; ty < 11; ty += 1) {
    for (let tx = 0; tx < 16; tx += 1) {
      if (!deck(tx, ty)) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ch = VL.getScreen('overworld', '5,2').tiles[ty + dy]?.[tx + dx];
        if (ch === 'W') landings.push([tx + dx, ty + dy]);
      }
    }
  }
  assert.deepEqual(landings, [[3, 6]]);
  state.player.x = VL.tileCenter(3, 6).x;
  state.player.y = VL.tileCenter(3, 6).y;
  hold(VL, state, ['right'], 0.5);
  assert.deepEqual(where(VL, state), ['5,2', 4, 6], 'aboard');
  assert.ok(!state.player.afloat);
});

test('the pathfinder sails only with the raft and the oar', () => {
  const VL = shared;
  const from = { area: 'overworld', screen: '2,-3', tx: 8, ty: 5 };
  const island = { area: 'overworld', screen: '3,-3', tx: 7, ty: 4 };
  for (const items of [[], ['raft'], ['oar']]) assert.equal(findPath(VL, from, island, standing(VL, from, items)), null, `${items}`);
  assert.ok(findPath(VL, from, island, standing(VL, from)));
});

test('nobody is stranded: from the island, the wreck\'s deck and every room below, the way home is open with the raft', () => {
  const VL = shared;
  const hut = { area: 'hut', screen: '0,0', tx: 6, ty: 5 };
  const state = standing(VL, { screen: '1,1', tx: 8, ty: 4 });
  for (const start of [
    { area: 'overworld', screen: '3,-3', tx: 7, ty: 4 },
    { area: 'overworld', screen: '5,2', tx: 4, ty: 6 },
    { area: 'wreck', screen: '0,0', tx: 7, ty: 3 },
    { area: 'wreck', screen: '0,1', tx: 7, ty: 1 },
  ]) assert.ok(findPath(VL, start, hut, state), `${start.area} ${start.screen}`);
});

// ---------- the island, the wreck, the books ----------

test('the island holds an ore lump and the Smith\'s Ledger; the rope cannot reach them from any shore', () => {
  const VL = shared;
  const island = VL.getScreen('overworld', '3,-3');
  assert.deepEqual(plain(island.entities.filter((e) => e.type === 'ore').map((e) => e.id)), ['oreLakeIsland']);
  assert.ok(island.entities.some((e) => e.type === 'bookTrunk' && e.id === 'bookSmithsLedger'));
  assert.ok(!island.tiles.some((row) => /[^Wwsjt]/.test(row)), 'nothing but water round the island');
});

test('below deck: the hatch leads down, the lint is clean, and the ore, the key and the page are where the table says', () => {
  const VL = shared;
  assert.deepEqual(plain(VL.dungeonProblems()), []);
  const hatch = VL.getScreen('overworld', '5,2').entities.find((e) => e.type === 'door');
  assert.deepEqual(plain(hatch.to), { area: 'wreck', screen: '0,0', tx: 7, ty: 1, facing: 'down' });
  assert.ok(VL.getScreen('overworld', '5,2').entities.some((e) => e.type === 'bookTrunk' && e.id === 'bookTideTables'));
  const ids = Object.values(VL.AREAS.wreck.screens).flatMap((s) => s.entities.map((e) => e.id).filter(Boolean));
  for (const id of ['wreckDoor', 'wreckKeyChest', 'oreShipwreck', 'pageShipwreck']) assert.ok(ids.includes(id), id);
  assert.ok(Object.keys(VL.AREAS.wreck.screens).length <= 4, 'a mini-dungeon');
  assert.deepEqual(plain(VL.LOCKS.oreShipwreck.needs), ['shipwreck', 'grapplingRope']);
  assert.deepEqual(plain(VL.LOCKS.pageShipwreck.needs), ['shipwreck', 'wreckDoor']);
  assert.equal(VL.LOCKS.pageShipwreck.supplies.pages, 1);
});

test('a faint below deck wakes him by the hold\'s lantern, and a reload there still sails home', () => {
  const { VL, app, drive } = afterShockwave();
  Object.assign(app.game.items, { raft: true, oar: true });
  VL.place(app.game, { area: 'wreck', screen: '0,0', tx: 7, ty: 4, facing: 'up' });
  drive.until((state) => state.savePoint?.area === 'wreck', 1, ['up']);
  drive.reload();
  assert.deepEqual([drive.state.player.area, ...heroTile(VL, drive.state)], ['wreck', 7, 3]);
  assert.ok(findPath(VL, { area: 'wreck', screen: '0,0', tx: 7, ty: 3 }, { area: 'hut', screen: '0,0', tx: 6, ty: 5 }, drive.state));
  VL.place(drive.state, { area: 'wreck', screen: '0,1', tx: 7, ty: 8 });
  VL.faint(drive.state, 'crab');
  VL.respawn(drive.state);
  assert.deepEqual([drive.state.player.area, drive.state.player.screen, ...heroTile(VL, drive.state)], ['wreck', '0,0', 7, 3]);
});

// ---------- progression ----------

test('the locks: the raft after the shockwave, sailing as repeatable access, the island and the wreck after it; the solver is clean', () => {
  const VL = shared;
  for (const id of ['raft', 'oar', 'rafting', 'lakeIsland', 'oreLakeIsland', 'shipwreck', 'oreShipwreck', 'pageShipwreck', 'wreckKeyChest', 'wreckDoor']) {
    assert.equal(typeof VL.LOCKS[id].reached, 'function', `${id} is claimed`);
  }
  assert.ok(VL.LOCKS.raft.needs.includes('shockwave') && VL.LOCKS.raft.needs.includes('grapplingRope'));
  assert.equal(VL.LOCKS.rafting.renewable, true);
  const report = VL.solveProgression();
  assert.deepEqual([...report.problems], []);
  for (const id of ['raft', 'rafting', 'lakeIsland', 'shipwreck', 'oreLakeIsland', 'oreShipwreck', 'pageShipwreck']) {
    assert.ok(!report.stages[0].reached.includes(id), `${id} waits for the shockwave`);
    assert.ok(report.stages[1].reached.includes(id), `${id} after it`);
  }
});

test('sailing is worked out again after an event: one that took the oar for good would shut the wreck (W3 review M1)', () => {
  const VL = loadGame().VL;
  const table = {};
  for (const [id, lock] of Object.entries(VL.LOCKS)) table[id] = { ...lock, needs: lock.needs.slice(), retires: lock.retires.slice() };
  table.storm = { ...table.primerTaken, id: 'storm', needs: ['lakeIsland'], retires: ['oar'], doc: '§ The world' };
  table.ending = { ...table.ending, needs: [...table.ending.needs, 'pageShipwreck'] };
  const problems = [...VL.solveProgression(table).problems];
  assert.ok(problems.some((p) => /shipwreck|pageShipwreck/.test(p) && /storm/.test(p)), problems.join('\n'));
});

// ---------- the steps, with real keys ----------

test('from waking after the shockwave: wood, a sword, an oar and Nell\'s raft; the island; the wreck, its books, ore and page; reloads between', () => {
  const { VL, drive } = afterShockwave();
  w17.raft(drive);
  assert.ok(VL.LOCKS.raft.reached(drive.state) && VL.LOCKS.rafting.reached(drive.state));
  drive.reload();
  w17.lakeIsland(drive);
  assert.ok(VL.LOCKS.lakeIsland.reached(drive.state) && VL.LOCKS.oreLakeIsland.reached(drive.state));
  drive.reload();
  w17.shipwreck(drive);
  for (const id of ['shipwreck', 'wreckKeyChest', 'wreckDoor', 'oreShipwreck', 'pageShipwreck']) assert.ok(VL.LOCKS[id].reached(drive.state), id);
  assert.equal(drive.state.inventory.ore, 3, 'the W16 save\'s lump, the island\'s and the wreck\'s');
  assert.ok(VL.loosePages(drive.state) >= 1);
});

test('the W17 fixture loads with no field reset: below deck with the raft and the oar, the wreck\'s door open', () => {
  const VL = loadGame().VL;
  const text = fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v1-W17.json'), 'utf8');
  const storage = VL.createStorage(memoryStorage({ [VL.slotKey(0)]: text }));
  assert.deepEqual(plain(VL.readSlot(storage, 0).resets), []);
  const game = VL.loadSlot(storage, 0);
  assert.ok(VL.canRaft(game) && VL.dungeonState(game, 'wreck').doors.wreckDoor);
  assert.deepEqual([game.player.area, game.player.screen], ['wreck', '0,0']);
  for (const id of ['raft', 'lakeIsland', 'shipwreck', 'oreShipwreck', 'pageShipwreck']) assert.ok(VL.LOCKS[id].reached(game), id);
});

// ---------- words and drawing ----------

test('every word of the raft, the oar, Nell and the wreck fits its font and box, with nothing crass', () => {
  const VL = shared;
  const lines = [VL.OARLESS_TEXT];
  for (const id of ['raft', 'oar']) lines.push(VL.POPUPS[id].title, VL.POPUPS[id].text, VL.ITEMS[id].about);
  for (const entry of VL.DIALOGUES.nell) lines.push(...[].concat(entry.say));
  const raft = VL.SHOPS.raftyard.offers[0];
  const game = VL.createGame();
  lines.push(raft.refuse(game), raft.about, VL.SHOPS.raftyard.title, VL.SHOPS.raftyard.greeting);
  for (const screen of Object.values(VL.AREAS.wreck.screens)) for (const e of screen.entities) if (e.type === 'sign') lines.push(e.title, e.text);
  for (const line of lines) {
    assert.deepEqual(plain(VL.ART.missingGlyphs(line.replace('{name}', 'Robin'))), [], line);
    assert.doesNotMatch(line, /\b(damn|darn|stupid|hell|god)\b/i, line);
  }
  const width = VL.ART.POPUP.width - VL.ART.POPUP.pad * 2;
  for (const text of [VL.OARLESS_TEXT, VL.POPUPS.raft.text, VL.POPUPS.oar.text]) assert.ok(VL.ART.wrapText(text, width).length <= VL.ART.POPUP.maxLines, text);
  assert.deepEqual(plain(VL.dialogueProblems()), []);
});

test('render: the raft under him and the oar beside him while afloat, and every room of the wreck', () => {
  const document = fakeDocument();
  const { VL } = loadGame({ document });
  const ctx = document.canvas.getContext('2d');
  for (const id of ['prop-raft', 'item-raft', 'item-oar', 'fx-oar', 'tile-wreck-crate']) assert.ok(VL.ART.SPRITES[id], id);
  const state = standing(VL, { screen: '2,-3', tx: 9, ty: 5, facing: 'right' });
  hold(VL, state, ['right'], 0.2);
  assert.ok(state.player.afloat);
  const drawn = [];
  const draw = VL.ART.drawSprite;
  VL.ART.drawSprite = (c, id, ...rest) => {
    drawn.push(id);
    return draw(c, id, ...rest);
  };
  VL.drawWorld(ctx, state, 1);
  VL.ART.drawSprite = draw;
  assert.ok(drawn.includes('prop-raft') && drawn.includes('fx-oar'));
  for (const screen of Object.keys(VL.AREAS.wreck.screens)) {
    VL.place(state, { area: 'wreck', screen, tx: 7, ty: 2 });
    assert.doesNotThrow(() => VL.drawWorld(ctx, state, 2), screen);
  }
});
