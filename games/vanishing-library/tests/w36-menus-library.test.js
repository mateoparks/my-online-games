// W36, Matthew's fifth playtest notes on the menus, the shop, the equipment
// view and the library: X leaves a shop, dearer paper at the store, books
// carried and pages found in the equipment view, a Scriptorium key of its
// own, wrapped (and scrolling) descriptions, re-reading a book still on the
// shelves, and the library's rewards reordered (boots 12, purse 20, heart 30).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, loadGame, playApp, memoryStorage, fakeContext } = require('./harness');

const STEP = 1 / 60;
const plain = (value) => JSON.parse(JSON.stringify(value));

function setup({ slotText = null } = {}) {
  const { VL } = loadGame();
  VL.sfx = () => true;
  let app;
  if (slotText) {
    const store = VL.createStorage(memoryStorage({ [VL.slotKey(0)]: slotText }));
    app = VL.createApp({ storage: store });
    app.startGame(VL.loadSlot(store, 0), 0);
    app.setScene('play');
  } else {
    app = playApp(VL);
    app.game.name = 'Robin';
  }
  app.game.popups.seen.controls = true;
  app.game.popups.queue.length = 0;
  const step = (actions = VL.noActions()) => app.update(actions, STEP);
  const press = (action) => step(VL.actions({ pressed: [action] }));
  const wait = (seconds) => {
    for (let t = 0; t < seconds - 1e-9; t += STEP) step();
  };
  const at = (where) => VL.place(app.game, where);
  const atDesk = () => at({ area: 'library', screen: '0,0', ...VL.LIBRARY_TALK_AT, facing: 'up' });
  // Presses S until the scene is `id` (or play is idle); returns the scenes passed.
  const pressUntil = (done, max = 120) => {
    const seen = [];
    for (let i = 0; i < max; i += 1) {
      if (done()) return seen;
      wait(0.35);
      if (!seen.includes(app.sceneId)) seen.push(app.sceneId);
      if (done()) return seen;
      if (app.sceneId !== 'play') press('interact');
    }
    throw new Error(`not done, still in ${app.sceneId}`);
  };
  const idle = () => app.sceneId === 'play' && !app.game.libraryChain && !VL.currentPopup(app.game) && !app.game.sceneRequest && !app.game.holdUp && !app.game.libraryOffer;
  return { VL, app, step, press, wait, at, atDesk, pressUntil, idle, get game() { return app.game; } };
}

// Every string a scene draws, with where and how big.
function drawnText(VL, app) {
  const strings = [];
  const original = VL.ART.text;
  VL.ART.text = (ctx, str, x, y, options = {}) => {
    strings.push({ str: String(str), x, y, size: options.size || 'normal', align: options.align || 'left' });
    return original(ctx, str, x, y, options);
  };
  try {
    VL.render(fakeContext(), app, 0);
  } finally {
    VL.ART.text = original;
  }
  return strings;
}

const GENERIC = ['bookRiverside', 'bookBeachBuried', 'bookCliffRoad', 'bookLighthouse', 'bookEastRoad', 'bookWoods', 'bookScriptoriumRock', 'bookLakeShore', 'bookHighlands', 'bookMeadowRock',
  'bookCliffLedge', 'bookHighShelfA', 'bookHighShelfB', 'bookHighScree', 'bookHighGapA', 'bookHighGapB', 'bookHighPathA', 'bookHighPathB', 'bookLairA', 'bookLairB', 'bookLakeIsland', 'bookWreckDeck'];
const find = (VL, game, ids) => ids.forEach((id) => VL.markFound(game, id));

// ---------- 1. X leaves a shop ----------

test('X leaves a shop, like Leave or Esc, and backs out of a Yes/No question first', () => {
  const t = setup();
  const { VL } = t;
  t.game.inventory.shells = 10;
  t.app.setScene('shop', { shop: 'store' });
  t.press('dig');
  assert.equal(t.app.sceneId, 'play', 'X while browsing goes back to play');
  t.app.setScene('shop', { shop: 'store' });
  t.press('interact');
  assert.equal(t.app.shopView.mode, 'ask', 'S on paper asks Yes/No');
  t.press('dig');
  assert.equal(t.app.sceneId, 'shop');
  assert.equal(t.app.shopView.mode, 'browse', 'X answers the question with no');
  assert.equal(t.game.inventory.shells, 10, 'nothing bought');
  t.press('dig');
  assert.equal(t.app.sceneId, 'play');
});

test('every counter shows X beside Leave', () => {
  const t = setup();
  const { VL } = t;
  for (const id of Object.keys(VL.SHOPS)) {
    t.app.setScene('shop', { shop: id });
    const view = t.app.shopView;
    view.cursor = VL.shopRows(t.game, view).length - 1;
    view.scroll = Math.max(0, view.cursor - 6);
    const strings = drawnText(VL, t.app);
    const leave = strings.find((s) => s.str === 'Leave');
    assert.ok(leave, `${id}: Leave is drawn`);
    assert.ok(strings.some((s) => s.str === 'X' && s.y >= leave.y - 1 && s.y <= leave.y + 3), `${id}: an X on the Leave row`);
  }
});

// ---------- 2. paper: 3 shells at the store, 2 at the mill ----------

test('paper costs 3 shells at the General Store and 2 at the paper mill, from the one price table', () => {
  const { VL } = loadGame();
  const offer = (shop, id) => VL.SHOPS[shop].offers.find((o) => o.id === id);
  assert.deepEqual(plain(offer('store', 'paper').cost), { shells: 3 });
  assert.deepEqual(plain(offer('mill', 'paper').cost), { shells: 2 });
  assert.equal(offer('store', 'paper').cost, VL.TUNING.prices.storePaper, 'the store reads its own price line');
  assert.equal(offer('mill', 'paper').cost, VL.TUNING.prices.paper);
  const game = VL.newGame({ name: 'Robin' });
  game.inventory.shells = 5;
  assert.equal(VL.buyOffer(game, offer('store', 'paper')).ok, true);
  assert.equal(game.inventory.shells, 2);
  assert.equal(VL.buyOffer(game, offer('store', 'paper')).reason, 'notEnough');
  assert.equal(VL.buyOffer(game, offer('mill', 'paper')).ok, true);
  assert.equal(game.inventory.shells, 0);
  assert.ok(game.flags.boughtPaper);
});

// ---------- 3 and 4. the equipment view counts books and pages ----------

test('the equipment view shows the books not yet handed in and the pages found of five', () => {
  const t = setup();
  const { VL } = t;
  t.app.setScene('equipment');
  let strings = drawnText(VL, t.app).map((s) => s.str);
  assert.ok(strings.includes('0 books to return'), strings.join(' | '));
  assert.ok(strings.includes(`0/${VL.pagesToBind()} pages`), strings.join(' | '));
  find(VL, t.game, ['bookRiverside']);
  VL.markFound(t.game, 'pageFieldA');
  strings = drawnText(VL, t.app).map((s) => s.str);
  assert.ok(strings.includes('1 book to return'), strings.join(' | '));
  assert.ok(strings.includes('1/5 pages'), strings.join(' | '));
  find(VL, t.game, ['bookBeachBuried', 'bookCliffRoad']);
  VL.markFound(t.game, 'pageFieldB');
  VL.markFound(t.game, 'pageLostChicken');
  VL.returnBooks(t.game);
  find(VL, t.game, ['bookLighthouse', 'bookEastRoad']);
  strings = drawnText(VL, t.app).map((s) => s.str);
  assert.ok(strings.includes('2 books to return'), 'handed-in books no longer count');
  assert.ok(strings.includes('3/5 pages'));
  assert.equal(VL.booksCarried(t.game).length, 2);
});

test('everything the equipment view draws fits inside its box, in the font', () => {
  const t = setup();
  const { VL } = t;
  for (const id of Object.keys(VL.ITEMS)) t.game.items[id] = true;
  t.game.inventory.berries = 3;
  Object.assign(t.game.inventory, { wood: 99, shells: 50, brokenShells: 99, ore: 9, paper: 99, ink: 99 });
  find(VL, t.game, GENERIC.slice(0, 12));
  t.app.setScene('equipment');
  const box = { left: 16, right: 240 };
  const count = VL.equipmentItems(t.game).length;
  for (let i = 0; i < count; i += 1) {
    t.app.equipment.cursor = i;
    t.app.equipment.about = 0;
    for (const s of drawnText(VL, t.app)) {
      const w = VL.ART.measureText(s.str, s.size);
      const left = s.align === 'center' ? s.x - w / 2 : s.align === 'right' ? s.x - w : s.x;
      assert.ok(left >= box.left + 4 && left + w <= box.right - 4, `"${s.str}" at ${left}..${left + w} on item ${i}`);
      assert.deepEqual(plain(VL.ART.missingGlyphs(s.str, s.size)), [], s.str);
    }
  }
});

// ---------- 6. long descriptions wrap, and scroll when they overflow ----------

test('an item\'s description wraps, and one too long for its lines scrolls with the arrows, with cues', () => {
  const t = setup();
  const { VL } = t;
  VL.defineItem('w36LongThing', {
    name: 'Very Long Thing', icon: 'swiftfoot',
    about: 'This one goes on and on. It has far more to say than two lines can hold, so the words scroll down a line at a time and back up again.',
  });
  VL.defineItem('w36Other', { name: 'Other Thing', icon: 'swiftfoot', about: 'Short.' });
  t.game.items.w36LongThing = true;
  t.game.items.w36Other = true;
  t.app.setScene('equipment');
  const list = VL.equipmentItems(t.game);
  t.app.equipment.cursor = list.findIndex((item) => item.id === 'w36LongThing');
  const cursor = t.app.equipment.cursor;
  const lines = VL.equipmentAboutLines(t.game, list[cursor]);
  assert.ok(lines.length > VL.EQUIPMENT_ABOUT_LINES, `${lines.length} lines`);
  const shown = () => drawnText(VL, t.app).map((s) => s.str);
  assert.ok(shown().includes(lines[0]));
  assert.ok(!shown().includes(lines.at(-1)), 'the last line is below the fold');
  assert.ok(VL.equipmentAboutCues(t.app).down && !VL.equipmentAboutCues(t.app).up, 'a cue says there is more below');
  for (let i = 0; i < lines.length - VL.EQUIPMENT_ABOUT_LINES; i += 1) t.press('down');
  assert.equal(t.app.equipment.cursor, cursor, 'Down read on instead of moving');
  assert.ok(shown().includes(lines.at(-1)), 'the last line scrolled into view');
  assert.ok(VL.equipmentAboutCues(t.app).up && !VL.equipmentAboutCues(t.app).down);
  t.press('up');
  assert.equal(t.app.equipment.cursor, cursor, 'Up reads back first');
  t.app.equipment.about = 0;
  t.press('right');
  t.press('left');
  assert.equal(t.app.equipment.about, 0, 'a new item starts at its first line');
});

test('every item\'s description today fits its lines, so no arrow press is ever taken from the grid', () => {
  const { VL } = loadGame();
  const game = VL.newGame({ name: 'Ñandú Élodïe' });
  for (const item of Object.values(VL.ITEMS)) {
    assert.ok(VL.equipmentAboutLines(game, item).length <= VL.EQUIPMENT_ABOUT_LINES, item.id);
  }
});

// ---------- 5. the Scriptorium key looks like no other key ----------

test('the Scriptorium key is an old bronze library key with a wax seal, unlike the small and boss keys', () => {
  const { VL } = loadGame();
  const key = VL.ART.sprite('item-scriptorium-key');
  const small = VL.ART.sprite('item-small-key');
  const boss = VL.ART.sprite('item-boss-key');
  assert.equal(VL.ITEMS.scriptoriumKey.icon, 'scriptorium-key');
  for (const other of [small, boss]) assert.ok(key.w !== other.w || key.h !== other.h, 'a size of its own');
  const def = VL.ART.SPRITES['item-scriptorium-key'];
  const colors = Object.values(def.def.colors || {});
  assert.ok(colors.some((c) => /bronze/i.test(c)), `bronze, not dungeon gold: ${colors}`);
  assert.ok(colors.includes('heart'), 'a red wax seal on the bow');
  assert.ok(!colors.includes('gold'), 'no gold: those are the dungeon keys');
  assert.ok(key.h <= 18 && key.w <= 22, 'fits an equipment cell');
});

// ---------- 7. re-reading a book still on the shelves ----------

function shelfGame() {
  const t = setup();
  const { VL } = t;
  find(VL, t.game, ['bookRiverside', 'bookBeachBuried', 'bookHerbalist', 'hiddenBookSealed']);
  VL.returnBooks(t.game);
  for (let id = VL.nextReading(t.game); id; id = VL.nextReading(t.game)) VL.finishReading(t.game, id);
  t.game.flags['met:fenwick'] = true;
  t.game.popups.queue.length = 0;
  t.game.holdUp = null;
  return t;
}

test('the game knows which books are on the shelves: returned, less the ones that vanished again', () => {
  const t = shelfGame();
  const { VL } = t;
  const sorted = (ids) => plain(ids).sort();
  assert.deepEqual(sorted(VL.booksOnShelf(t.game)), sorted(['bookRiverside', 'bookBeachBuried', 'bookHerbalist', 'hiddenBookSealed']));
  t.game.library.gone.push('bookBeachBuried');
  assert.deepEqual(sorted(VL.rereadable(t.game)), sorted(['bookRiverside', 'bookHerbalist', 'hiddenBookSealed']));
});

test('after his usual words the librarian offers to read a book again; a vanished one is not offered', () => {
  const t = shelfGame();
  const { VL } = t;
  t.game.library.gone.push('bookBeachBuried');
  t.game.library.noticed = 1;
  t.atDesk();
  t.press('interact');
  assert.equal(t.app.sceneId, 'dialogue');
  const words = t.app.dialogue.pages.flat().join(' ');
  const hint = VL.LIBRARY_HINTS[VL.nextMilestone(t.game)][0].say;
  assert.ok(words.includes(VL.popupText(hint, t.game).slice(0, 30)), `his hint first: ${words}`);
  t.pressUntil(() => t.app.sceneId === 'libraryShelf');
  const rows = VL.shelfRows(t.game);
  assert.deepEqual(plain(rows), ['no', ...VL.rereadable(t.game)]);
  assert.deepEqual(plain(rows).sort(), ['bookHerbalist', 'bookRiverside', 'hiddenBookSealed', 'no']);
  assert.equal(rows[1], 'bookRiverside');
  assert.equal(t.app.libraryShelf.cursor, 0, '"No, thank you" first, so a kid pressing on goes back to play');
  t.press('down');
  t.press('interact');
  assert.equal(t.app.sceneId, 'reading');
  assert.equal(t.app.reading.id, 'bookRiverside');
  assert.ok(t.app.reading.pages.flat().join(' ').includes('Step one: be very strong'), 'an untitled book reads its blurb');
  t.pressUntil(t.idle);
  assert.equal(t.app.sceneId, 'play');
});

test('re-reading a titled book replays its pages and changes nothing: no second effect, no reward, saved state the same', () => {
  const t = shelfGame();
  const { VL } = t;
  const before = JSON.stringify({ library: t.game.library, flags: t.game.flags, items: t.game.items, maxHp: t.game.maxHp, popups: t.game.popups });
  t.app.setScene('libraryShelf');
  t.app.libraryShelf.cursor = VL.shelfRows(t.game).indexOf('bookHerbalist');
  t.press('interact');
  assert.equal(t.app.sceneId, 'reading');
  assert.deepEqual(plain(t.app.reading.pages), plain(VL.dialoguePages(VL.BOOKS.bookHerbalist.reading, t.game)));
  t.pressUntil(t.idle);
  const after = JSON.stringify({ library: t.game.library, flags: t.game.flags, items: t.game.items, maxHp: t.game.maxHp, popups: t.game.popups });
  assert.equal(after, before);
});

test('the sealed register read again tells of the key he already has instead of handing over another', () => {
  const t = shelfGame();
  const { VL } = t;
  const words = VL.rereadWords(VL.BOOKS.hiddenBookSealed).join(' ');
  assert.doesNotMatch(words, /Take it/);
  assert.match(words, /key/i);
  for (const book of Object.values(VL.BOOKS)) {
    const text = VL.rereadWords(book).map((line) => VL.popupText(line, { name: 'Ñandú Élodïe' })).join(' ');
    assert.ok(text.length > 0, book.id);
    assert.deepEqual(plain(VL.ART.missingGlyphs(text)), [], book.id);
  }
});

test('X, Esc or "No, thank you" close the shelf; with no book on the shelves he never asks', () => {
  const t = shelfGame();
  const { VL } = t;
  for (const key of ['dig', 'pause', 'interact']) {
    t.app.setScene('libraryShelf');
    t.press(key);
    assert.equal(t.app.sceneId, 'play', key);
  }
  const bare = setup();
  bare.game.flags['met:fenwick'] = true;
  bare.atDesk();
  bare.press('interact');
  const seen = bare.pressUntil(bare.idle);
  assert.ok(!seen.includes('libraryShelf'), seen.join(' '));
});

test('he still hands in books, reads the new ones and gives a reward due before the shelf is offered', () => {
  const t = shelfGame();
  const { VL } = t;
  find(VL, t.game, [...GENERIC.slice(2, 12), 'bookTideTables']);
  t.atDesk();
  t.press('interact');
  const seen = t.pressUntil(() => t.app.sceneId === 'libraryShelf');
  assert.ok(seen.includes('reading'), `the Tide Tables read first: ${seen}`);
  assert.ok(VL.bookRead(t.game, 'bookTideTables'));
  assert.ok(VL.hasItem(t.game, 'swiftfootBoots'), 'the 12-book boots given first');
  assert.ok(VL.shelfRows(t.game).includes('bookTideTables'), 'the new books are on offer');
  t.press('interact');
  assert.equal(t.app.sceneId, 'play');
});

test('the shelf scene draws every title inside its box, in the font, and scrolls with cues', () => {
  const t = setup();
  const { VL } = t;
  find(VL, t.game, [...GENERIC, 'bookHerbalist', 'bookTideTables', 'hiddenBookSealed']);
  VL.returnBooks(t.game);
  for (let id = VL.nextReading(t.game); id; id = VL.nextReading(t.game)) VL.finishReading(t.game, id);
  t.app.setScene('libraryShelf');
  const rows = VL.shelfRows(t.game);
  for (let i = 0; i < rows.length; i += 1) {
    for (const s of drawnText(VL, t.app)) {
      const w = VL.ART.measureText(s.str, s.size);
      const left = s.align === 'center' ? s.x - w / 2 : s.align === 'right' ? s.x - w : s.x;
      assert.ok(left >= 20 && left + w <= 236, `"${s.str}" at ${left}..${left + w}`);
      assert.deepEqual(plain(VL.ART.missingGlyphs(s.str, s.size)), [], s.str);
    }
    if (i < rows.length - 1) t.press('down');
  }
  assert.equal(t.app.libraryShelf.cursor, rows.length - 1);
  assert.ok(t.app.libraryShelf.scroll > 0, 'the list scrolled');
  const strings = drawnText(VL, t.app).map((s) => s.str);
  assert.ok(strings.includes('↑'), 'a cue for more above');
});

// ---------- 8. rewards: boots at 12, purse at 20, heart at 30 ----------

test('the library\'s rewards: the Swiftfoot Boots at 12 books, the Big Shell Purse at 20, a heart container at 30', () => {
  const { VL } = loadGame();
  assert.deepEqual(plain(VL.TUNING.libraryRewards), { swiftfootBoots: 12, shellPurse: 20, heartLibrary: 30 });
  assert.deepEqual(['swiftfootBoots', 'shellPurse', 'heartLibrary'].map((id) => VL.LOCKS[id].count.books), [12, 20, 30], 'the solver counts the same');
  const words = (id) => VL.REWARD_SPEECH[id].join(' ');
  assert.match(words('swiftfootBoots'), /^Twelve books/);
  assert.match(words('shellPurse'), /^Twenty books/);
  assert.match(words('heartLibrary'), /^Thirty books/);
  for (const id of Object.keys(VL.REWARD_SPEECH)) assert.doesNotMatch(words(id), /\b(he|him|his)\b/i, 'the hero is {name} or you');
});

test('12 books give the boots, 20 the purse, 30 the heart, each once, through his talk', () => {
  const t = setup();
  const { VL } = t;
  const hearts = t.game.maxHp;
  const visit = () => {
    t.atDesk();
    t.press('interact');
    t.pressUntil(t.idle);
  };
  find(VL, t.game, GENERIC.slice(0, 11));
  visit();
  assert.equal(VL.hasItem(t.game, 'swiftfootBoots'), false, 'eleven is not enough');
  find(VL, t.game, GENERIC.slice(11, 12));
  visit();
  assert.ok(VL.hasItem(t.game, 'swiftfootBoots'), 'the boots at twelve');
  assert.equal(t.game.maxHp, hearts);
  find(VL, t.game, GENERIC.slice(12, 20));
  visit();
  assert.ok(VL.hasItem(t.game, 'shellPurse'), 'the purse at twenty');
  assert.equal(t.game.maxHp, hearts, 'no heart yet');
  find(VL, t.game, [...GENERIC.slice(20), ...VL.BOOKWORM_BUNDLE, ...VL.HOARD_BOOKS, 'bookHerbalist', 'bookPrimer']);
  visit();
  assert.ok(VL.booksReturned(t.game) >= 30);
  assert.equal(t.game.maxHp, hearts + VL.TUNING.heartContainerHp, 'the heart at thirty');
  visit();
  assert.equal(t.game.maxHp, hearts + VL.TUNING.heartContainerHp, 'once');
});

test('an older save that got the heart at 10 never gets a second at 30, and one with 12 to 29 books and no boots gets them next visit', () => {
  const text = fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v1-W35.json'), 'utf8');
  const save = JSON.parse(text);
  save.library.returned.push(...GENERIC.slice(0, 8));
  for (const id of GENERIC.slice(0, 8)) save.flags[`found:${id}`] = true;
  save.flags['reward:heartLibrary'] = true;
  delete save.flags['reward:swiftfootBoots'];
  delete save.items.swiftfootBoots;
  const t = setup({ slotText: JSON.stringify(save) });
  const { VL } = t;
  const hearts = t.game.maxHp;
  assert.equal(VL.pendingReward(t.game), 'swiftfootBoots');
  t.atDesk();
  t.press('interact');
  t.pressUntil(t.idle);
  assert.ok(VL.hasItem(t.game, 'swiftfootBoots'), 'the boots on the next visit');
  assert.equal(t.game.maxHp, hearts);
  find(VL, t.game, [...GENERIC.slice(8), ...VL.HOARD_BOOKS]);
  t.atDesk();
  t.press('interact');
  t.pressUntil(t.idle);
  assert.ok(VL.booksReturned(t.game) >= 30, `${VL.booksReturned(t.game)} books`);
  assert.equal(t.game.maxHp, hearts, 'no second heart');
  assert.equal(VL.pendingReward(t.game), null);
  assert.equal(VL.nextRewardAt(t.game), null, 'nothing left to promise');
});

test('the 40-shell binding still needs the 50-shell purse (W34), and the purse still comes at 20 books', () => {
  const { VL } = loadGame();
  assert.ok(VL.TUNING.prices.binding.shells > VL.TUNING.shellCap);
  assert.ok(VL.TUNING.prices.binding.shells <= VL.TUNING.shellCapPurse);
  assert.ok(VL.LOCKS.climbersAlmanac.needs.includes('shellPurse'));
  assert.equal(VL.TUNING.libraryRewards.shellPurse, 20);
  const result = VL.solveProgression();
  assert.deepEqual(plain(result.problems), []);
  const stageOf = (id) => result.stages.findIndex((stage) => stage.reached.includes(id));
  assert.ok(stageOf('shellPurse') >= 0 && stageOf('shellPurse') <= stageOf('climbersAlmanac'), 'the purse before the binding');
  assert.ok(stageOf('swiftfootBoots') === 0, 'twelve books come before the shockwave, so the boots do too');
  assert.ok(stageOf('heartLibrary') >= 0, 'the heart at thirty is reachable');
});
