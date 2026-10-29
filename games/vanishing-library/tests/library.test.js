// W11, the library and its people: books found and returned, the librarian's
// readings and their effects, rewards at 5/10/15, shelves emptying on story
// events, hints by progress, the wife's stages and puppet shows, the
// trapdoor, and the lost-chicken kid (design: Books, pages and the library;
// People; Chickens: The lost chicken).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, loadGame, playApp, memoryStorage, read, fakeContext } = require('./harness');

const STEP = 1 / 60;
const plain = (value) => JSON.parse(JSON.stringify(value));

// `slotText` starts from that save in slot 1 instead of a new game.
function setup({ storage = false, slotText = null } = {}) {
  const { VL } = loadGame();
  VL.sfx = () => true;
  let app;
  if (slotText) {
    const store = VL.createStorage(memoryStorage({ [VL.slotKey(0)]: slotText }));
    app = VL.createApp({ storage: store });
    app.startGame(VL.loadSlot(store, 0), 0);
    app.setScene('play');
  } else if (storage) {
    app = VL.createApp({ storage: VL.createStorage(memoryStorage()) });
    app.startGame(VL.newGame({ name: 'Robin' }), 0, { fresh: true });
    app.save();
    app.setScene('play');
  } else {
    app = playApp(VL);
    app.game.name = 'Robin';
  }
  app.game.popups.seen.controls = true;
  app.game.popups.queue.length = 0;
  const step = (actions = VL.noActions()) => app.update(actions, STEP);
  const press = (action) => step(VL.actions({ pressed: [action] }));
  const hold = (held, seconds) => {
    for (let t = 0; t < seconds - 1e-9; t += STEP) step(VL.actions({ held }));
  };
  const at = (where) => VL.place(app.game, where);
  // Presses S through every scene until play is idle again; returns the
  // scenes it passed through.
  const pressThrough = (max = 80) => {
    const seen = [];
    for (let i = 0; i < max; i += 1) {
      if (app.sceneId === 'play' && !app.game.libraryChain && !app.game.libraryOffer && !VL.currentPopup(app.game) && !app.game.sceneRequest) return seen;
      hold([], 0.35);
      if (!seen.includes(app.sceneId)) seen.push(app.sceneId);
      if (app.sceneId !== 'play') press('interact');
    }
    throw new Error(`still in ${app.sceneId} after ${max} presses`);
  };
  // S at the librarian's desk, then through everything he has to say.
  const visitLibrarian = () => {
    at({ area: 'library', screen: '0,0', ...VL.LIBRARY_TALK_AT, facing: 'up' });
    press('interact');
    assert.equal(app.sceneId, 'dialogue', 'S at the desk talks to the librarian');
    return pressThrough();
  };
  const leaveAndEnterLibrary = () => {
    at({ area: 'overworld', screen: '2,-1', tx: 5, ty: 5, facing: 'down' });
    at({ area: 'library', screen: '0,0', tx: 7, ty: 8, facing: 'up' });
  };
  return { VL, app, step, press, hold, at, pressThrough, visitLibrarian, leaveAndEnterLibrary, get game() { return app.game; } };
}

const GENERIC = ['bookRiverside', 'bookBeachBuried', 'bookCliffRoad', 'bookLighthouse', 'bookEastRoad', 'bookWoods', 'bookScriptoriumRock', 'bookLakeShore', 'bookHighlands', 'bookMeadowRock'];
// W30: twelve more untitled books in the late places.
const LATE = ['bookCliffLedge', 'bookHighShelfA', 'bookHighShelfB', 'bookHighScree', 'bookHighGapA', 'bookHighGapB', 'bookHighPathA', 'bookHighPathB', 'bookLairA', 'bookLairB', 'bookLakeIsland', 'bookWreckDeck'];
const TITLED = ['bookHerbalist', 'bookTideTables', 'bookSmithsLedger', 'bookPrimer', 'bookDragons', 'bookChickenAlmanac'];
const find = (VL, game, ids) => ids.forEach((id) => VL.markFound(game, id));

// Returns books straight through the rules (no talking), reading the titled ones.
function returnAndRead(VL, game, ids) {
  find(VL, game, ids);
  VL.returnBooks(game);
  for (let id = VL.nextReading(game); id; id = VL.nextReading(game)) VL.finishReading(game, id);
}

// ---------- the books ----------

test('every book on the map has words: twenty-two untitled, six titled and the sealed one', () => {
  const { VL } = loadGame();
  const books = Object.values(VL.BOOKS);
  assert.deepEqual(plain(books.filter((b) => b.kind === 'generic').map((b) => b.id).sort()), [...GENERIC, ...LATE, ...VL.BOOKWORM_BUNDLE, ...VL.HOARD_BOOKS].sort());
  assert.deepEqual(plain(books.filter((b) => b.kind === 'titled').map((b) => b.id).sort()), [...TITLED].sort());
  assert.deepEqual(plain(books.filter((b) => b.kind === 'sealed').map((b) => b.id)), ['hiddenBookSealed']);
  for (const book of books) {
    // The Bookworm's bundle and the Dragon's hoard are counted by the d1Boss
    // and d4Boss locks, not found on the map.
    if (![...VL.BOOKWORM_BUNDLE, ...VL.HOARD_BOOKS].includes(book.id)) {
      assert.ok(VL.SPOTS[book.id], `${book.id} has a spot on the map`);
      assert.ok(VL.LOCKS[book.id]?.reached, `${book.id}'s lock is claimed`);
    }
    VL.ART.color(book.color);
    VL.ART.sprite(book.icon);
    const words = [book.title, book.blurb || '', ...[].concat(book.reading || [])].map((text) => VL.popupText(text, { name: 'Ñandú Élodïe' })).join(' ');
    assert.deepEqual(plain(VL.ART.missingGlyphs(words)), [], `${book.id} can be drawn`);
  }
});

test('the 29 books on the map plus the Bookworm\'s bundle and the Dragon\'s hoard reach every reward', () => {
  const { VL } = loadGame();
  const supplied = Object.values(VL.LOCKS).reduce((sum, lock) => sum + (lock.supplies.books || 0), 0);
  assert.equal(Object.keys(VL.BOOKS).length, 29 + VL.BOOKWORM_BUNDLE.length + VL.HOARD_BOOKS.length);
  assert.ok(supplied >= Math.max(...Object.values(VL.TUNING.libraryRewards)), `${supplied} books in the table`);
});

test('a trunk opens once with S: its book is found, carried and saved', () => {
  const t = setup({ storage: true });
  const { VL } = t;
  const spot = VL.SPOTS.hiddenBookSealed;
  t.at({ area: 'overworld', screen: spot.screen, tx: spot.x, ty: spot.y + 1, facing: 'up' });
  const box = t.game.room.entities.find((e) => e.type === 'bookTrunk' && e.id === 'hiddenBookSealed');
  assert.ok(box && !box.opened, 'a closed trunk on its spot');
  assert.ok(VL.isBlocked(spot.area, spot.screen, spot.x * 16 + 8, spot.y * 16 + 8, 4, 4, t.game.room), 'trunks are solid');
  t.press('interact');
  assert.ok(box.opened);
  assert.deepEqual(plain(VL.booksCarried(t.game)), ['hiddenBookSealed']);
  assert.equal(t.game.dirty, false, 'saved at once');
  const popup = VL.currentPopup(t.game);
  assert.equal(popup.title, 'You found a book!');
  assert.ok(popup.text.includes('The Scriptorium Register'));
  t.pressThrough();
  assert.ok(t.game.popups.seen.firstBook, 'the first book explains the library');
  t.at({ area: 'overworld', screen: spot.screen, tx: spot.x, ty: spot.y + 1, facing: 'up' });
  assert.ok(t.game.room.entities.find((e) => e.type === 'bookTrunk' && e.id === 'hiddenBookSealed').opened, 'still open next visit');
  t.press('interact');
  assert.equal(VL.currentPopup(t.game), null, 'an empty trunk says nothing');
});

test('a book in a bush peeks out, shows once the bush is cut, and is picked up by walking onto it', () => {
  const t = setup();
  const { VL } = t;
  const spot = VL.SPOTS.bookCliffRoad;
  VL.giveItem(t.game, 'woodSword');
  t.game.popups.queue.length = 0;
  t.at({ area: 'overworld', screen: spot.screen, tx: spot.x, ty: spot.y - 1, facing: 'down' });
  t.game.room.entities = t.game.room.entities.filter((e) => !VL.isEnemy(e));
  const book = t.game.room.entities.find((e) => e.type === 'bushBook');
  t.step();
  assert.equal(book.revealed, false, 'hidden while the bush stands');
  VL.cutBush(t.game, spot.x, spot.y, 'sword');
  t.step();
  assert.equal(book.revealed, true);
  t.hold(['down'], 0.4);
  assert.ok(VL.spotFound(t.game, 'bookCliffRoad'), 'walking onto it picks it up');
  assert.ok(!t.game.room.entities.includes(book));
  t.at({ area: 'overworld', screen: spot.screen, tx: spot.x, ty: spot.y - 1, facing: 'down' });
  assert.ok(!t.game.room.entities.some((e) => e.type === 'bushBook'), 'gone for good');
});

test('the pages in the fields are picked up once, and the bindery counts them', () => {
  const t = setup();
  const { VL } = t;
  const spot = VL.SPOTS.pageFieldA;
  t.at({ area: 'overworld', screen: spot.screen, tx: spot.x - 1, ty: spot.y, facing: 'right' });
  assert.equal(VL.loosePages(t.game), 0);
  t.hold(['right'], 0.3);
  assert.ok(VL.spotFound(t.game, 'pageFieldA'));
  assert.equal(VL.loosePages(t.game), 1);
  assert.equal(VL.currentPopup(t.game).title, 'A loose page!');
});

// ---------- returning books ----------

test('the librarian takes every carried book; the count of books returned ever only goes up', () => {
  const t = setup({ storage: true });
  const { VL } = t;
  find(VL, t.game, ['bookRiverside', 'bookCliffRoad']);
  const scenes = t.visitLibrarian();
  assert.ok(scenes.includes('dialogue'));
  assert.deepEqual(plain(t.game.library.returned), ['bookRiverside', 'bookCliffRoad']);
  assert.deepEqual(plain(VL.booksCarried(t.game)), []);
  assert.equal(t.game.library.trips, 1);
  assert.equal(t.game.dirty, false);
  find(VL, t.game, ['bookWoods']);
  t.visitLibrarian();
  assert.equal(VL.booksReturned(t.game), 3);
  assert.equal(t.game.library.lastTripAt, 2);
  // The thief takes some back; the count stays.
  t.game.library.gone.push('bookRiverside');
  assert.equal(VL.booksReturned(t.game), 3);
  assert.equal(VL.saveSummary(VL.serializeSave(t.game)).books, 3, 'the slot card shows books returned');
});

test('bringing the first book before ever meeting him: he introduces himself first, then takes it, and never again', () => {
  const t = setup();
  const { VL } = t;
  const talk = () => {
    t.at({ area: 'library', screen: '0,0', ...VL.LIBRARY_TALK_AT, facing: 'up' });
    t.press('interact');
    const words = t.app.dialogue.pages.flat().join(' ');
    t.pressThrough();
    return words;
  };
  find(VL, t.game, ['hiddenBookSealed']);
  const first = talk();
  assert.ok(first.indexOf('I\'m Mr. Fenwick') >= 0 && first.indexOf('I\'m Mr. Fenwick') < first.indexOf('Are those... books?'), first);
  assert.ok(VL.hasItem(t.game, 'scriptoriumKey'), 'the reading and the key follow');
  assert.ok(t.game.flags['met:fenwick']);
  assert.ok(!talk().includes('A visitor'), 'no second introduction');
  find(VL, t.game, ['bookRiverside']);
  const later = talk();
  assert.ok(later.startsWith('Are those... books?') && !later.includes('A visitor'), later);
});

test('handing books in, he says a line about each untitled one and the count', () => {
  const { VL } = loadGame();
  const game = VL.newGame({ name: 'Robin' });
  find(VL, game, ['bookRiverside', 'bookTideTables']);
  const ids = VL.returnBooks(game);
  const speech = VL.returnSpeech(game, ids);
  assert.equal(speech.length, 2, 'one untitled book, then the tally');
  assert.ok(speech[0].includes('Rocks and How to Lift Them'));
  assert.ok(speech[1].includes('2 books') && speech[1].includes('10 more'), 'the boots at 12 next (W36)');
});

// ---------- readings ----------

test('each titled book is read once, in its own scene, and its effect switches on only then', () => {
  const t = setup();
  const { VL } = t;
  find(VL, t.game, ['bookTideTables', 'bookSmithsLedger']);
  t.at({ area: 'library', screen: '0,0', ...VL.LIBRARY_TALK_AT, facing: 'up' });
  t.press('interact');
  // Through the hand-in talk to the first reading.
  for (let i = 0; i < 30 && t.app.sceneId !== 'reading'; i += 1) {
    t.hold([], 0.35);
    if (t.app.sceneId !== 'play') t.press('interact');
  }
  assert.equal(t.app.sceneId, 'reading');
  assert.equal(t.app.reading.id, 'bookTideTables');
  assert.equal(VL.tideTablesRead(t.game), false, 'not until the reading ends');
  assert.equal(VL.digChance(t.game, 'sand'), VL.TUNING.digChance);
  t.pressThrough();
  assert.equal(VL.tideTablesRead(t.game), true);
  assert.equal(VL.digChance(t.game, 'sand'), VL.TUNING.digChanceTideTables);
  assert.equal(VL.smithsLedgerRead(t.game), true, 'the next reading followed on its own');
  assert.deepEqual(plain(t.game.library.read), ['bookTideTables', 'bookSmithsLedger']);
  assert.equal(VL.finishReading(t.game, 'bookTideTables'), false, 'never read twice');
  const scenes = t.visitLibrarian();
  assert.ok(!scenes.includes('reading'), 'nothing more to read');
});

test('Esc during a reading still switches the effect on', () => {
  const t = setup();
  const { VL } = t;
  find(VL, t.game, ['bookChickenAlmanac']);
  VL.returnBooks(t.game);
  t.app.setScene('reading', { book: 'bookChickenAlmanac' });
  t.press('pause');
  assert.equal(t.game.flags.chickenAlmanacRead, true);
  assert.equal(VL.chickenFlightTiles(t.game), VL.TUNING.chickenFlightLong, 'chickens carry the hero farther');
  assert.equal(t.app.sceneId, 'popup', 'and the popup tells about F');
});

test('the effects: Herbalist marks, Ledger ore and cheaper forging, Primer, Dragons, Almanac, the sealed book\'s key', () => {
  const { VL } = loadGame();
  const game = VL.newGame();
  assert.deepEqual(plain(VL.mapMarks(game)), []);
  returnAndRead(VL, game, ['bookHerbalist', 'bookSmithsLedger', 'bookPrimer', 'bookDragons', 'bookChickenAlmanac', 'hiddenBookSealed']);
  const marks = plain(VL.mapMarks(game));
  assert.deepEqual(marks.filter((m) => m.kind === 'berries').map((m) => m.screen).sort(), ['-1,-3', '0,0', '7,-2'], 'the three berry bushes (hut, Woods, highlands since W29)');
  // W34: the Ledger's rumour is of the wreck's ore, marked over the hatch.
  assert.deepEqual(marks.filter((m) => m.kind === 'ore').map((m) => m.screen), ['5,2']);
  VL.markFound(game, 'oreShipwreck');
  assert.ok(!VL.mapMarks(game).some((m) => m.kind === 'ore'), 'no mark once the ore is found');
  assert.ok(VL.smithsLedgerRead(game));
  assert.ok(VL.primerOnShelf(game));
  for (const id of ['bookHerbalist', 'bookSmithsLedger', 'bookPrimer', 'bookDragons', 'bookChickenAlmanac', 'hiddenBookSealed', 'scriptoriumKey']) {
    assert.ok(VL.LOCKS[id].reached(game), `${id} reached`);
  }
  assert.ok(game.flags.chickenAlmanacRead);
  assert.ok(VL.hasItem(game, 'scriptoriumKey'));
  assert.equal(game.hands.mainHand, null, 'the key is kept, not held');
  for (const id of ['herbalistRead', 'smithsLedgerRead', 'primerRead', 'dragonsRead', 'chickenAlmanacRead', 'scriptoriumKey']) {
    assert.ok(game.popups.queue.includes(id), `${id} popup`);
  }
});

test('a book found but not returned does nothing yet', () => {
  const { VL } = loadGame();
  const game = VL.newGame();
  find(VL, game, [...TITLED, 'hiddenBookSealed']);
  for (const id of [...TITLED, 'hiddenBookSealed', 'scriptoriumKey']) assert.equal(VL.LOCKS[id].reached(game), false, id);
  assert.ok(!game.flags.chickenAlmanacRead);
});

// ---------- rewards ----------

test('rewards at 12, 20 and 30 books returned (W36): the Swiftfoot Boots, the Big Shell Purse, a heart', () => {
  const t = setup({ storage: true });
  const { VL } = t;
  assert.deepEqual(plain(VL.TUNING.libraryRewards), { swiftfootBoots: 12, shellPurse: 20, heartLibrary: 30 });
  assert.deepEqual([VL.LOCKS.swiftfootBoots.count.books, VL.LOCKS.shellPurse.count.books, VL.LOCKS.heartLibrary.count.books], [12, 20, 30], 'the solver counts the same books');
  const hearts = t.game.maxHp;
  const books = [...GENERIC, ...LATE];
  find(VL, t.game, books.slice(0, 11));
  t.visitLibrarian();
  assert.equal(VL.pendingReward(t.game), null);
  assert.ok(!VL.hasItem(t.game, 'swiftfootBoots'), 'eleven books is not enough');
  find(VL, t.game, books.slice(11, 12));
  t.visitLibrarian();
  assert.ok(VL.hasItem(t.game, 'swiftfootBoots'), 'the boots at twelve');
  assert.equal(t.game.hands.mainHand, null, 'worn, not held');
  assert.ok(!VL.hasItem(t.game, 'shellPurse'));
  find(VL, t.game, books.slice(12, 20));
  t.visitLibrarian();
  assert.ok(VL.hasItem(t.game, 'shellPurse'));
  assert.equal(t.game.maxHp, hearts, 'no heart yet');
  find(VL, t.game, [...books.slice(20), ...TITLED.slice(0, 5), 'hiddenBookSealed', ...VL.BOOKWORM_BUNDLE.slice(0, 2)]);
  t.visitLibrarian();
  assert.equal(t.game.maxHp, hearts + VL.TUNING.heartContainerHp, 'a heart at thirty: felt at once');
  for (const id of ['shellPurse', 'heartLibrary', 'swiftfootBoots']) assert.ok(VL.LOCKS[id].reached(t.game), id);
  t.visitLibrarian();
  assert.equal(t.game.maxHp, hearts + VL.TUNING.heartContainerHp, 'each reward once');
  assert.equal(t.game.dirty, false);
});

test('the librarian\'s words match each reward and its count', () => {
  const { VL } = loadGame();
  const words = (id) => VL.REWARD_SPEECH[id].join(' ');
  assert.match(words('swiftfootBoots'), /^Twelve books/);
  assert.match(words('swiftfootBoots'), /Swiftfoot Boots/);
  assert.match(words('shellPurse'), /^Twenty books/);
  assert.match(words('shellPurse'), /shell purse/);
  assert.match(words('heartLibrary'), /^Thirty books/);
  assert.doesNotMatch(words('heartLibrary'), /purse/i);
});

test('a save that got the Big Shell Purse at five books keeps it, gets the boots at 12 and the heart at 30 (W36), and never a second purse', () => {
  const text = fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v1-W26.json'), 'utf8');
  const t = setup({ slotText: text });
  const { VL } = t;
  const fixture = JSON.parse(text);
  assert.equal(VL.booksReturned(t.game), 7);
  assert.ok(VL.hasItem(t.game, 'shellPurse'));
  t.step();
  assert.equal(t.game.inventory.shells, 140, 'the purse still holds more than the first one');
  assert.equal(VL.pendingReward(t.game), null, 'the boots wait for twelve books');
  find(VL, t.game, ['bookWoods']);
  t.visitLibrarian();
  assert.equal(VL.booksReturned(t.game), 8);
  assert.ok(VL.returnSpeech(t.game, []).at(-1).includes('Bring me 4 more'), 'the next goal is the boots, not the purse it already has');
  find(VL, t.game, ['bookScriptoriumRock', 'bookLakeShore', ...LATE.slice(0, 2)]);
  const seen = t.visitLibrarian();
  assert.equal(VL.booksReturned(t.game), 12);
  assert.ok(VL.hasItem(t.game, 'swiftfootBoots'), 'the boots, once');
  assert.equal(t.game.maxHp, fixture.maxHp, 'no heart yet');
  assert.equal(VL.pendingReward(t.game), null);
  assert.equal(seen.filter((scene) => scene === 'popup').length <= 1, true, 'no second purse');
  assert.equal(VL.nextRewardAt(t.game), 30, 'the heart next: the purse at 20 is already had');
  find(VL, t.game, [...LATE.slice(2), ...GENERIC].filter((id) => !VL.spotFound(t.game, id)));
  t.visitLibrarian();
  assert.equal(t.game.maxHp, fixture.maxHp, `still no heart at ${VL.booksReturned(t.game)}`);
  find(VL, t.game, [...TITLED, ...VL.BOOKWORM_BUNDLE, ...VL.HOARD_BOOKS].filter((id) => !VL.spotFound(t.game, id)));
  t.visitLibrarian();
  assert.ok(VL.booksReturned(t.game) >= 30, `${VL.booksReturned(t.game)} books`);
  assert.equal(t.game.maxHp, fixture.maxHp + VL.TUNING.heartContainerHp, 'the heart, once');
  t.visitLibrarian();
  assert.equal(t.game.maxHp, fixture.maxHp + VL.TUNING.heartContainerHp, 'and no second heart');
  assert.equal(t.game.dirty, false);
});

test('two rewards earned in one trip both come, one after the other', () => {
  const t = setup();
  const { VL } = t;
  find(VL, t.game, [...GENERIC, ...LATE]);
  t.visitLibrarian();
  assert.ok(VL.hasItem(t.game, 'shellPurse'));
  assert.ok(VL.rewardGiven(t.game, 'swiftfootBoots'));
});

test('the purse holds 15 whole shells; the Big Shell Purse holds 50 (W29; W34, was 250)', () => {
  const t = setup();
  const { VL } = t;
  VL.addResource(t.game, 'shells', 150);
  t.step();
  assert.equal(t.game.inventory.shells, 15);
  assert.ok(t.game.popups.queue.includes('purseFull'), 'the purse says why, and who might help');
  t.game.popups.queue.length = 0;
  t.app.setScene('play');
  t.game.items.shellPurse = true;
  VL.addResource(t.game, 'shells', 2000);
  t.step();
  assert.equal(t.game.inventory.shells, 50);
});

test('a full purse turns a trade away before the wood or the berry is paid', () => {
  const { VL } = loadGame();
  const game = VL.newGame({ name: 'Robin' });
  const offer = (shop, id) => VL.SHOPS[shop].offers.find((o) => o.id === id);
  VL.addResource(game, 'wood', 10);
  VL.addResource(game, 'berries', 2);
  VL.addResource(game, 'shells', VL.TUNING.shellCap);
  for (const [shop, id] of [['mill', 'millTrade'], ['store', 'sellBerry']]) {
    const result = VL.buyOffer(game, offer(shop, id));
    assert.deepEqual(plain(result), { ok: false, reason: 'refused', text: 'Your purse is full!' }, id);
    assert.equal(VL.offerRefusal(game, offer(shop, id)), 'Your purse is full!', `${id}: the shop scene says why`);
  }
  assert.equal(game.inventory.wood, 10);
  assert.equal(game.inventory.berries, 2);
  assert.equal(VL.buyOffer(game, offer('store', 'paper')).ok, true, 'buying with shells still works at the cap');
  assert.equal(VL.buyOffer(game, offer('mill', 'millTrade')).ok, true, 'and once there is room, trading does too');
  game.items.shellPurse = true;
  game.inventory.shells = VL.TUNING.shellCap;
  assert.equal(VL.buyOffer(game, offer('store', 'sellBerry')).ok, true, 'the Big Shell Purse has room');
});

test('the Swiftfoot Boots make the hero run faster for good', () => {
  const t = setup();
  const { VL } = t;
  t.at({ area: 'overworld', screen: '2,0', tx: 3, ty: 7, facing: 'right' });
  const walk = () => {
    const x0 = t.game.player.x;
    t.hold(['right'], 0.5);
    return t.game.player.x - x0;
  };
  const plainRun = walk();
  t.game.items.swiftfootBoots = true;
  t.at({ area: 'overworld', screen: '2,0', tx: 3, ty: 7, facing: 'right' });
  const booted = walk();
  assert.ok(Math.abs(booted / plainRun - VL.TUNING.swiftfootSpeed) < 0.05, `${plainRun} px, then ${booted} px`);
});

// ---------- the shelves empty on story events ----------

test('the shelves fill as books come back, and show a gap where one went missing', () => {
  const t = setup();
  const { VL } = t;
  find(VL, t.game, GENERIC.slice(0, 6));
  t.visitLibrarian();
  const shelves = t.game.room.entities.filter((e) => e.type === 'libraryShelf');
  assert.equal(shelves.length, 3);
  assert.equal(shelves.reduce((n, s) => n + s.books.filter((b) => !b.gone).length, 0), 6, 'all six up on the shelves');
  const places = new Set(GENERIC.map((id) => JSON.stringify(VL.shelfPlace(id))));
  assert.equal(places.size, GENERIC.length, 'every book has its own place');
  t.game.library.gone.push('bookRiverside');
  t.step();
  const gap = shelves.flatMap((s) => s.books).find((b) => b.id === 'bookRiverside');
  assert.equal(gap.gone, true);
  const ctx = fakeContext();
  VL.drawWorld(ctx, t.game, 0);
  assert.ok(ctx.calls.fillRect > 0);
});

test('books vanish only on the next visit after a return trip or a boss, never on real time', () => {
  const t = setup({ storage: true });
  const { VL } = t;
  find(VL, t.game, GENERIC.slice(0, 3));
  t.visitLibrarian();
  t.leaveAndEnterLibrary();
  assert.deepEqual(plain(t.game.library.gone), [], 'the books just brought in are safe');
  find(VL, t.game, GENERIC.slice(3, 5));
  t.visitLibrarian();
  assert.deepEqual(plain(t.game.library.gone), [], 'nothing goes while the hero is in the room');
  // A week away: reload, walk around, come back with nothing new.
  t.leaveAndEnterLibrary();
  assert.deepEqual(plain(t.game.library.gone), ['bookRiverside'], 'one from an earlier trip, the oldest');
  t.leaveAndEnterLibrary();
  t.leaveAndEnterLibrary();
  assert.deepEqual(plain(t.game.library.gone), ['bookRiverside'], 'coming back again changes nothing');
  // A dungeon boss beaten: two more on the next visit.
  VL.dungeonState(t.game, 'scriptorium').boss = true;
  t.leaveAndEnterLibrary();
  assert.deepEqual(plain(t.game.library.gone), ['bookRiverside', 'bookBeachBuried', 'bookCliffRoad']);
  assert.equal(VL.booksReturned(t.game), 5, 'the count never goes down');
});

test('the thief never takes a book the librarian has yet to read', () => {
  const { VL } = loadGame();
  const game = VL.newGame();
  find(VL, game, ['bookDragons', 'bookRiverside']);
  VL.returnBooks(game);
  find(VL, game, ['bookWoods']);
  VL.returnBooks(game);
  game.library.stolen.trips = 0;
  VL.TUNING.libraryTheftPerTrip = 5;
  assert.deepEqual(plain(VL.applyThefts(game)), ['bookRiverside'], 'the unread Dragons book stays');
});

test('the Cartographer\'s Primer stays until Dungeon 3 is beaten, then goes first', () => {
  const { VL } = loadGame();
  const game = VL.newGame();
  returnAndRead(VL, game, ['bookPrimer', 'bookRiverside']);
  returnAndRead(VL, game, ['bookWoods']);
  VL.TUNING.libraryTheftPerTrip = 9;
  VL.TUNING.libraryTheftPerBoss = 9;
  game.library.stolen.trips = 0;
  assert.deepEqual(plain(VL.applyThefts(game)), ['bookRiverside'], 'the Primer is safe before Dungeon 3');
  assert.ok(VL.primerOnShelf(game));
  assert.equal(VL.LOCKS.primerTaken.reached(game), false);
  VL.dungeonState(game, 'lighthouse').boss = true;
  assert.deepEqual(plain(VL.applyThefts(game)).slice(0, 1), ['bookPrimer']);
  assert.equal(VL.primerOnShelf(game), false);
  assert.ok(VL.LOCKS.primerTaken.reached(game));
  assert.ok(VL.bookRead(game, 'bookPrimer'), 'what a book gave is kept');
});

test('after Dungeon 3, a Primer handed in but not yet read stays until he has read it', () => {
  const { VL } = loadGame();
  const game = VL.newGame();
  VL.dungeonState(game, 'lighthouse').boss = true;
  find(VL, game, ['bookPrimer']);
  VL.returnBooks(game);
  // A Save & Quit before the reading, then back into the library.
  VL.applyThefts(game);
  assert.ok(VL.primerOnShelf(game), 'never a book he has yet to read');
  VL.finishReading(game, 'bookPrimer');
  assert.deepEqual(plain(VL.applyThefts(game)), ['bookPrimer'], 'read, it goes on the next visit');
});

test('the librarian notices a missing book once', () => {
  const t = setup();
  const { VL } = t;
  t.game.flags['met:fenwick'] = true;
  returnAndRead(VL, t.game, ['bookRiverside']);
  t.game.library.gone.push('bookRiverside');
  assert.ok(VL.pickDialogue(t.game, 'librarian').say.includes('already gone'));
  t.visitLibrarian();
  assert.ok(!VL.pickDialogue(t.game, 'librarian').say.includes('already gone'));
});

// ---------- hints by progress ----------

test('the librarian has a hint for every story beat, so a kid is never stuck with nothing', () => {
  const { VL } = loadGame();
  const beats = VL.MILESTONES.filter((id) => !['named', 'start'].includes(id));
  assert.deepEqual(plain(beats.filter((id) => !VL.LIBRARY_HINTS[id])), []);
  // Walk the story by marking each beat reached in turn: the hint always names the next one.
  const done = new Set();
  for (const id of VL.MILESTONES) {
    const lock = VL.LOCKS[id];
    VL.LOCKS[id] = { ...lock, reached: () => done.has(id) };
  }
  const game = VL.newGame({ name: 'Robin' });
  game.flags['met:fenwick'] = true;
  const said = [];
  for (const id of beats) {
    assert.equal(VL.nextMilestone(game), id);
    const words = [].concat(VL.pickDialogue(game, 'librarian').say).join(' ');
    assert.ok(VL.LIBRARY_HINTS[id].some((hint) => hint.say === words), `the hint before ${id}`);
    said.push(words);
    done.add(id);
  }
  assert.equal(new Set(said).size, said.length, 'a new nudge at every beat');
  assert.ok(VL.pickDialogue(game, 'librarian').say.includes('brighter'), 'the kind fallback once the story is done');
});

test('hints pick up what the player is missing: the Almanac at the highlands, the dragon book before the shield', () => {
  const { VL } = loadGame();
  const game = VL.newGame();
  game.flags['met:fenwick'] = true;
  VL.nextMilestone = () => 'highlands';
  assert.ok(VL.pickDialogue(game, 'librarian').say.includes('Chicken Keeper\'s Almanac'));
  returnAndRead(VL, game, ['bookChickenAlmanac']);
  assert.ok(VL.pickDialogue(game, 'librarian').say.includes('hidden path'));
  VL.nextMilestone = () => 'mirrorShield';
  assert.ok(VL.pickDialogue(game, 'librarian').say.includes('Book of Dragons'));
  returnAndRead(VL, game, ['bookDragons']);
  assert.ok(VL.pickDialogue(game, 'librarian').say.includes('own fire'));
});

test('a new game\'s first hint points at the trunk by the puppet stage', () => {
  const { VL } = loadGame();
  const game = VL.newGame();
  game.flags['met:fenwick'] = true;
  VL.LOCKS.chestGear.reached = () => true;
  assert.equal(VL.nextMilestone(game), 'scriptoriumKey');
  assert.ok(VL.pickDialogue(game, 'librarian').say.includes('puppet stage'));
  assert.equal(VL.SPOTS.hiddenBookSealed.screen, VL.SPOTS.puppetStage.screen);
});

// ---------- the librarian's wife ----------

// The boss locks belong to the dungeon items; a test flag stands in for them.
function bossesBeaten(VL, game, ...ids) {
  for (const id of ['d1Boss', 'd2Boss']) {
    VL.LOCKS[id].reached = (state) => Boolean(state.flags[`test:${id}`]);
    game.flags[`test:${id}`] = ids.includes(id);
  }
}

test('her stages follow the books returned ever and the bosses beaten, and her greetings get shorter', () => {
  const { VL } = loadGame();
  const game = VL.newGame({ name: 'Robin' });
  game.flags['met:wife'] = true;
  game.room = { wifeTalked: false };
  const stagesBy = (...bosses) => {
    bossesBeaten(VL, game, ...bosses);
    return GENERIC.concat(TITLED).map((_, n) => {
      game.library.returned = GENERIC.concat(TITLED).slice(0, n);
      return VL.wifeStage(game);
    });
  };
  assert.deepEqual(stagesBy(), [0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 'no stage 2 before Dungeon 1 is beaten');
  assert.deepEqual(stagesBy('d1Boss'), [0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2], 'no stage 3 before Dungeon 2 is beaten');
  assert.deepEqual(stagesBy('d1Boss', 'd2Boss'), [0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3]);
  assert.deepEqual(stagesBy('d2Boss').slice(12), [1, 1, 1, 1], 'each stage needs the one before it');
  const greetings = [];
  bossesBeaten(VL, game, 'd1Boss', 'd2Boss');
  for (const n of [0, 3, 7, 12]) {
    game.library.returned = GENERIC.concat(TITLED).slice(0, n);
    greetings[VL.wifeStage(game)] = [].concat(VL.pickDialogue(game, 'librarianWife').say).join(' ');
  }
  for (let i = 1; i < greetings.length; i += 1) assert.ok(greetings[i].length < greetings[i - 1].length, `stage ${i} is shorter: ${greetings[i]}`);
  assert.equal(greetings[3], 'Hm. Hello.');
});

test('every book the overworld holds, returned before Dungeon 1, keeps her friendly-ish: no cool greeting, no Nosy Ned, no misdirection', () => {
  const t = setup();
  const { VL } = t;
  t.game.flags['met:wife'] = true;
  t.game.library.returned = GENERIC.concat(TITLED, ['hiddenBookSealed']);
  bossesBeaten(VL, t.game);
  assert.equal(VL.wifeStage(t.game), 1);
  t.game.room.wifeTalked = true;
  for (const id of Object.keys(VL.WIFE_MISDIRECTION)) {
    VL.nextMilestone = () => id;
    assert.ok(!Object.values(VL.WIFE_MISDIRECTION).includes(VL.pickDialogue(t.game, 'librarianWife').say), id);
  }
  t.at({ area: 'overworld', screen: '2,0', tx: 4, ty: 3, facing: 'up' });
  t.press('interact');
  assert.equal(t.app.puppetShow.show.title, 'Sir Bumble\'s Busy Day');
});

test('from her third stage, her second talk in a visit points the wrong way; his hint points the right way', () => {
  const t = setup();
  const { VL } = t;
  t.game.flags['met:wife'] = true;
  t.game.flags['met:fenwick'] = true;
  VL.LOCKS.chestGear.reached = () => true;
  t.game.library.returned = GENERIC.slice(0, 8);
  t.game.flags['reward:shellPurse'] = true;
  t.game.flags['reward:heartLibrary'] = true;
  bossesBeaten(VL, t.game, 'd1Boss');
  assert.equal(VL.wifeStage(t.game), 2);
  t.at({ area: 'overworld', screen: '2,0', tx: 6, ty: 4, facing: 'up' });
  const talk = () => {
    t.press('interact');
    const words = t.app.dialogue.pages.flat().join(' ');
    t.press('pause');
    return words;
  };
  const first = talk();
  assert.ok(first.includes('Another book'), first);
  const second = talk();
  assert.equal(second, VL.WIFE_MISDIRECTION.scriptoriumKey, 'books in the lake: the wrong way');
  assert.match([].concat(VL.pickDialogue(t.game, 'librarian').say).join(' '), /trunk by the puppet stage/, 'the librarian sends you to the trunk');
  // A fresh visit starts with a greeting again.
  t.at({ area: 'overworld', screen: '2,0', tx: 6, ty: 4, facing: 'up' });
  assert.ok(talk().includes('Another book'));
});

test('she never misleads early on: a first play-through meets a friendly puppeteer', () => {
  const { VL } = loadGame();
  const game = VL.newGame();
  game.flags['met:wife'] = true;
  game.room = { wifeTalked: true };
  game.library.returned = GENERIC.slice(0, 6);
  for (const id of Object.keys(VL.WIFE_MISDIRECTION)) {
    VL.nextMilestone = () => id;
    assert.ok(!Object.values(VL.WIFE_MISDIRECTION).includes(VL.pickDialogue(game, 'librarianWife').say), id);
  }
});

test('S at the stage plays the show for her stage; the shows run to the end and back to play', () => {
  const t = setup();
  const { VL } = t;
  assert.equal(VL.PUPPET_SHOWS.length, 4);
  bossesBeaten(VL, t.game, 'd1Boss', 'd2Boss');
  for (let stage = 0; stage < 4; stage += 1) {
    t.game.library.returned = GENERIC.concat(TITLED).slice(0, [0, 3, 7, 12][stage]);
    t.at({ area: 'overworld', screen: '2,0', tx: 4, ty: 3, facing: 'up' });
    t.press('interact');
    assert.equal(t.app.sceneId, 'puppetShow', `stage ${stage}`);
    assert.equal(t.app.puppetShow.show, VL.PUPPET_SHOWS[stage]);
    const beats = [];
    for (let i = 0; i < 40 && t.app.sceneId === 'puppetShow'; i += 1) {
      if (!beats.includes(t.app.puppetShow.beat)) beats.push(t.app.puppetShow.beat);
      t.hold([], 0.2);
      t.press('interact');
    }
    assert.equal(t.app.sceneId, 'play');
    assert.equal(beats.length, VL.PUPPET_SHOWS[stage].beats.length, 'every beat shown');
  }
});

test('the meddling hero comes to a bad end only in her later shows, and every show is drawable', () => {
  const { VL } = loadGame();
  const words = (show) => show.beats.map((b) => b.say).join(' ');
  assert.ok(!/Ned/.test(words(VL.PUPPET_SHOWS[0])) && !/Ned/.test(words(VL.PUPPET_SHOWS[1])));
  assert.ok(/nosy/i.test(words(VL.PUPPET_SHOWS[2])) && /far, far from here/.test(words(VL.PUPPET_SHOWS[3])));
  for (const show of VL.PUPPET_SHOWS) {
    for (const beat of show.beats) {
      const text = VL.popupText(beat.say, { name: 'Ñandú Élodïe' });
      assert.deepEqual(plain(VL.ART.missingGlyphs(`${show.title} ${text}`)), []);
      assert.equal(VL.ART.popupLayout({ title: beat.speaker, text }).overflow, false, beat.say);
    }
  }
  const app = playApp(VL);
  const ctx = fakeContext();
  for (let i = 0; i < VL.PUPPET_SHOWS.length; i += 1) {
    app.setScene('puppetShow', { show: i });
    app.update(VL.noActions(), STEP);
    app.draw(ctx, 1);
  }
  assert.ok(ctx.calls.fillRect > 0);
});

test('Nosy Ned is a meddling young hero, but not the player\'s own hero: his own colours and a cap', () => {
  const { VL } = loadGame();
  const nedShows = VL.PUPPET_SHOWS.filter((show) => show.beats.some((beat) => /Ned/.test(beat.say)));
  assert.equal(nedShows.length, 2);
  for (const show of nedShows) {
    for (const beat of show.beats) assert.equal(beat.cast.hero, undefined, `${show.title}: "${beat.say}" casts the hero puppet`);
    assert.ok(show.beats.some((beat) => beat.cast.ned !== undefined), `${show.title} casts Ned`);
  }
  const colours = (id) => new Set(VL.ART.SPRITES[id].def.rows.join('').split('').filter((ch) => ch !== '.').map((ch) => VL.ART.SPRITES[id].def.colors[ch]));
  const ned = colours('puppet-ned');
  for (const heroColour of ['hair', 'tunic', 'tunicDark']) assert.ok(!ned.has(heroColour), `Ned has the hero's ${heroColour}`);
  assert.ok(VL.ART.SPRITES['puppet-ned'].def.rows.length > VL.ART.SPRITES['puppet-hero'].def.rows.length, 'a cap on top');
  assert.ok(colours('puppet-ned').has('skin'), 'still a young hero, face and all');
});

test('the trapdoor in front of the stage is there all game and can\'t be opened before the finale', () => {
  const t = setup();
  const { VL } = t;
  const spot = VL.SPOTS.trapdoor;
  t.at({ area: 'overworld', screen: spot.screen, tx: spot.x, ty: spot.y + 1, facing: 'up' });
  assert.ok(!VL.isSolidAt(spot.area, spot.screen, spot.x, spot.y), 'walk over it');
  t.press('interact');
  assert.equal(t.app.sceneId, 'popup');
  assert.equal(VL.currentPopup(t.game).title, 'Trapdoor');
  assert.ok(VL.currentPopup(t.game).text.includes('shut fast'));
  assert.equal(t.game.player.area, 'overworld', 'it goes nowhere');
  assert.equal(VL.LOCKS.trapdoorOpen.reached(t.game), false, 'shut until the finale opens it (W20)');
});

// ---------- the lost-chicken kid ----------

test('Pip asks about Henrietta; carrying her back gives a page, and she stays home for good', () => {
  const t = setup({ storage: true });
  const { VL } = t;
  const kid = VL.getScreen('overworld', '2,1').entities.find((e) => e.type === 'npc' && e.id === 'chickenKid');
  assert.ok(kid, 'Pip lives in the harbour');
  assert.ok(VL.pickDialogue(t.game, 'chickenKid').say.join(' ').includes('Henrietta'));
  // Lift the lost chicken on the cliffs.
  const spot = VL.SPOTS.lostChicken;
  t.at({ area: 'overworld', screen: spot.screen, tx: spot.x, ty: spot.y });
  const hen = t.game.room.entities.find((e) => e.type === 'chicken' && e.lost);
  VL.liftChicken(t.game, hen);
  assert.ok(VL.chickenWithHero(t.game, 'lostChicken'));
  // Back to the harbour, facing Pip.
  t.at({ area: 'overworld', screen: '2,1', tx: kid.x, ty: kid.y + 1, facing: 'up' });
  t.game.room.entities.find((e) => e.id === 'chickenKid').x = kid.x;
  t.press('interact');
  assert.equal(t.app.sceneId, 'dialogue');
  assert.ok(t.app.dialogue.pages.flat().join(' ').includes('You found her'));
  t.pressThrough();
  assert.ok(!VL.chickenWithHero(t.game, 'lostChicken'), 'Pip has her now');
  assert.ok(!t.game.player.carrying);
  assert.ok(VL.LOCKS.lostChicken.reached(t.game));
  assert.ok(VL.LOCKS.pageLostChicken.reached(t.game));
  assert.equal(VL.loosePages(t.game), 1);
  assert.ok(t.game.popups.seen.pageFound);
  assert.equal(t.game.dirty, false);
  t.at({ area: 'overworld', screen: spot.screen, tx: spot.x, ty: spot.y });
  assert.ok(!t.game.room.entities.some((e) => e.type === 'chicken' && e.lost), 'not back on the cliffs');
  assert.ok(VL.pickDialogue(t.game, 'chickenKid').say.includes('laying eggs'));
});

// ---------- saving ----------

test('the save fixture with library progress loads with nothing reset', () => {
  const { VL } = loadGame();
  const file = path.join(__dirname, 'fixtures', 'save-v1-W11.json');
  const fixture = JSON.parse(fs.readFileSync(file, 'utf8'));
  const storage = VL.createStorage(memoryStorage({ [VL.slotKey(0)]: JSON.stringify(fixture) }));
  const slot = VL.readSlot(storage, 0);
  assert.deepEqual(plain(slot.resets || []), []);
  assert.equal(slot.summary.books, fixture.library.returned.length);
  const game = VL.loadSlot(storage, 0);
  assert.deepEqual(plain(game.library), fixture.library);
  assert.ok(VL.hasItem(game, 'scriptoriumKey'));
  assert.ok(VL.LOCKS.bookTideTables.reached(game));
});

test('a save naming books this game doesn\'t know, or missing part of the library, still plays', () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v1-W11.json'), 'utf8'));
  fixture.library.returned.push('bookRenamedLater');
  fixture.library.read.push('bookRenamedLater');
  const t = setup({ slotText: JSON.stringify(fixture) });
  const { VL } = t;
  assert.equal(VL.booksReturned(t.game), 6, 'an unknown book still counts');
  t.leaveAndEnterLibrary();
  assert.ok(t.game.room.entities.some((e) => e.type === 'libraryShelf'), 'the shelves draw from the known books');
  t.visitLibrarian();
  assert.equal(VL.booksReturned(t.game), 6);
  assert.equal(VL.nextReading(t.game), null, 'only known books are read');

  const partial = { ...fixture, flags: { 'met:fenwick': true }, library: { returned: ['bookRiverside', 'bookPrimer'] } };
  const p = setup({ slotText: JSON.stringify(partial) });
  assert.deepEqual(plain(p.game.library.read), [], 'missing fields take their defaults');
  p.leaveAndEnterLibrary();
  p.visitLibrarian();
  assert.ok(VL.bookRead(p.game, 'bookPrimer'), 'the Primer is read on the next talk');
  assert.equal(VL.booksReturned(p.game), 2);
});

test('progress in the library survives a reload at any point of a visit', () => {
  const t = setup({ storage: true });
  const { VL } = t;
  find(VL, t.game, ['bookChickenAlmanac', 'bookRiverside']);
  t.game.flags['met:fenwick'] = true; // a one-page talk, without his introduction
  t.at({ area: 'library', screen: '0,0', ...VL.LIBRARY_TALK_AT, facing: 'up' });
  t.press('interact');
  t.hold([], 0.35);
  t.press('interact');
  t.hold([], 0.35);
  t.press('interact');
  // The talk ended (books handed in): Save & Quit and reload before the reading.
  const app = VL.reloadApp(t.app, { save: true });
  assert.equal(VL.booksReturned(app.game), 2);
  assert.ok(!app.game.flags.chickenAlmanacRead, 'not read yet');
  assert.equal(VL.nextReading(app.game), 'bookChickenAlmanac', 'the reading waits for the next talk');
  assert.ok(VL.pickDialogue(app.game, 'librarian').say.includes('where were we'));
});

// ---------- docs ----------

test('README documents the library', () => {
  const readme = read('README.md');
  for (const word of ['## Library', 'VL.defineBook', 'VL.findBook', 'VL.returnBooks', 'VL.mapMarks', 'VL.primerOnShelf', 'VL.applyThefts', 'save-v1-W11.json']) {
    assert.ok(readme.includes(word), `README mentions ${word}`);
  }
});
