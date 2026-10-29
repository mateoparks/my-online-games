// W34, Matthew's fourth playtest notes (world, economy, controls, books).
const assert = require('node:assert/strict');
const { test, loadGame, playState, hold } = require('./harness');

const ow = (screen, tx, ty, facing = 'up') => ({ area: 'overworld', screen, tx, ty, facing });

// ---------- walking speed ----------

test('the hero walks at about 2/3 of the W30 pace, and the Swiftfoot Boots keep their speed', () => {
  const { VL } = loadGame();
  const [w30Walk, w30Boots] = [70, 70 * 1.35];
  assert.ok(Math.abs(VL.TUNING.heroSpeed / w30Walk - 2 / 3) < 0.02, `walk ${VL.TUNING.heroSpeed}`);
  const state = VL.newGame();
  assert.equal(VL.heroSpeed(state), VL.TUNING.heroSpeed);
  state.items.swiftfootBoots = true;
  assert.ok(Math.abs(VL.heroSpeed(state) - w30Boots) < 1, `boots ${VL.heroSpeed(state)}`);
});

test('what chases the hero slowed with him, so a bat, a slime, a paper wad or a charging crab is still as easy to dodge as before', () => {
  const { VL } = loadGame();
  const T = VL.TUNING;
  const ratio = T.heroSpeed / 70;
  for (const [name, now, w30] of [['bat', T.enemyBat.speed, 44], ['slime hop', T.enemySlime.hopSpeed, 46], ['paper wad', T.bookwormSpitSpeed, 64], ['crab charge', T.enemyCrab.chargeSpeed, 46]]) {
    assert.ok(Math.abs(now / w30 - ratio) < 0.03, `${name}: ${now}`);
  }
});

// ---------- the metal shovel takes wood too ----------

const plain = (value) => JSON.parse(JSON.stringify(value));
const offerIn = (VL, shop, id) => VL.SHOPS[shop].offers.find((o) => o.id === id);

test('the smith forges a metal shovel from 3 wood, 1 ore lump and 10 shells (6 with the Smith\'s Ledger); the sword and shield are unchanged', () => {
  const { VL } = loadGame();
  assert.deepEqual(plain(offerIn(VL, 'smithy', 'metalShovel').cost), { wood: 3, ore: 1, shells: 10 });
  assert.deepEqual(plain(offerIn(VL, 'smithy', 'metalShovelLedger').cost), { wood: 3, ore: 1, shells: 6 });
  for (const id of ['metalSword', 'metalShield']) assert.deepEqual(plain(offerIn(VL, 'smithy', id).cost), { ore: 1, shells: 10 });
  const state = playState(VL, ow('3,0', 6, 4));
  Object.assign(state.inventory, { ore: 1, shells: 10, wood: 2 });
  assert.deepEqual(plain(VL.buyOffer(state, offerIn(VL, 'smithy', 'metalShovel'))), { ok: false, reason: 'notEnough', kind: 'wood' });
  state.inventory.wood = 3;
  assert.equal(VL.buyOffer(state, offerIn(VL, 'smithy', 'metalShovel')).ok, true);
  assert.deepEqual([state.inventory.wood, state.inventory.ore, state.inventory.shells], [0, 0, 0]);
  assert.ok(VL.hasItem(state, 'metalShovel'));
});

test('the progression table knows the metal shovel needs wood, and the solver stays clean', () => {
  const { VL } = loadGame();
  assert.ok(VL.LOCKS.metalShovel.needs.includes('wood'));
  assert.deepEqual([...VL.solveProgression().problems], []);
});

// ---------- the berries popup ----------

test('the first berries popup says how to eat one, and leaves the regrowing for him to find out', () => {
  const { VL } = loadGame();
  const { text } = VL.POPUPS.berries;
  assert.match(text, /heal a heart/);
  assert.doesNotMatch(text, /grow/i);
});

// ---------- X closes the equipment and the maps ----------

const { fakeDocument } = require('./harness');

function drawnStrings(VL, app) {
  const strings = [];
  const original = VL.ART.text;
  VL.ART.text = (ctx, str, ...rest) => {
    strings.push(String(str));
    return original(ctx, str, ...rest);
  };
  try {
    VL.render(fakeDocument().createElement('canvas').getContext('2d'), app, 0);
  } finally {
    VL.ART.text = original;
  }
  return strings;
}

const press = (VL, app, action) => app.update(VL.actions({ pressed: [action] }), 1 / 60);

test('the equipment view closes with X as well as E and Esc, and its footer says X: BACK', () => {
  const { VL } = loadGame();
  for (const key of ['dig', 'equipment', 'pause']) {
    const app = VL.createApp();
    app.game = VL.newGame();
    app.setScene('play');
    press(VL, app, 'equipment');
    assert.equal(app.sceneId, 'equipment');
    for (const list of [[], ['woodSword'], ['woodSword', 'woodShield', 'woodShovel', 'grapplingRope', 'liftingGloves', 'slingshot']]) {
      for (const id of list) app.game.items[id] = true;
      const footer = drawnStrings(VL, app).find((s) => /BACK/.test(s));
      assert.match(footer, /X: BACK$/, footer);
      assert.doesNotMatch(footer, /E: BACK/);
    }
    press(VL, app, key);
    assert.equal(app.sceneId, 'play', `${key} goes back to the game`);
    assert.equal(app.game.player.dig ?? null, null, 'X closing the view does not dig');
  }
});

test('the world map and the woods copy close with X, M or Esc; the map\'s footer says X: CLOSE', () => {
  const { VL } = loadGame();
  for (const key of ['dig', 'map', 'pause']) {
    const app = VL.createApp();
    app.game = VL.newGame();
    app.setScene('play');
    VL.giveItem(app.game, 'worldMap');
    app.game.popups.queue.length = 0;
    app.setScene('worldMap', { mode: 'view' });
    const strings = drawnStrings(VL, app);
    assert.ok(strings.includes('X: CLOSE'), strings.join('|'));
    assert.ok(!strings.includes('M: CLOSE'));
    press(VL, app, key);
    assert.equal(app.sceneId, 'play', `${key} closes the world map`);
    app.setScene('copyView', { id: 'woodsMapCopy' });
    for (let i = 0; i < 30; i += 1) app.update(VL.actions({}), 1 / 60);
    press(VL, app, key);
    assert.equal(app.sceneId, 'play', `${key} closes the woods copy`);
  }
  // Asked whether to draw one, X says no like M.
  const app = VL.createApp();
  app.game = VL.newGame();
  app.setScene('worldMap', { mode: 'ask', back: 'play' });
  press(VL, app, 'dig');
  assert.equal(app.sceneId, 'play');
});

test('a dungeon map closes with X, M or Esc, and its footer says X: BACK', () => {
  const { VL } = loadGame();
  for (const key of ['dig', 'map', 'pause']) {
    const app = VL.createApp();
    app.game = VL.newGame();
    VL.place(app.game, { area: 'scriptorium', screen: '1,0', tx: 7, ty: 8, facing: 'up' });
    app.setScene('play');
    app.setScene('dungeonMap');
    for (const map of [false, true]) {
      VL.dungeonState(app.game, 'scriptorium').map = map;
      const footer = drawnStrings(VL, app).find((s) => /BACK/.test(s));
      assert.match(footer, /X: BACK$/, footer);
      assert.doesNotMatch(footer, /M: BACK/);
    }
    press(VL, app, key);
    assert.equal(app.sceneId, 'play', `${key} closes the dungeon map`);
  }
});

// ---------- the Woods without the map ----------

test('the progression table: the Woods\' paths need only the east road; the ore, the Herbalist and the Woods book lie on them; the Oak\'s clearing still needs the copy', () => {
  const { VL } = loadGame();
  assert.deepEqual(plain(VL.LOCKS.woodsPaths.needs), ['eastRoad']);
  assert.equal(VL.LOCKS.woodsPaths.type, 'place');
  for (const id of ['oreWoods', 'bookHerbalist', 'bookWoods']) {
    assert.ok(VL.LOCKS[id].needs.includes('woodsPaths') && !VL.LOCKS[id].needs.includes('woods'), id);
  }
  assert.deepEqual(plain(VL.LOCKS.woods.needs), ['eastRoad', 'woodsMapCopy']);
  const state = VL.newGame();
  assert.equal(VL.LOCKS.woodsPaths.reached(state), false);
  VL.place(state, ow('6,-1', 10, 3));
  assert.equal(VL.LOCKS.woodsPaths.reached(state), true);
  assert.deepEqual([...VL.solveProgression().problems], []);
});

// ---------- enemy heart drops ----------

test('a beaten enemy drops a heart about 70% less often than before (0.2 -> 0.06); shells drop as often as ever', () => {
  const { VL } = loadGame();
  const { heart, shell } = VL.TUNING.enemyDrops;
  assert.ok(Math.abs(heart - 0.2 * 0.3) < 1e-9, `heart ${heart}`);
  assert.equal(shell, 0.2);
  const counts = { heart: 0, shell: 0, null: 0 };
  for (let i = 0; i < 1000; i += 1) counts[VL.enemyDrop((i + 0.5) / 1000)] += 1;
  assert.deepEqual(counts, { heart: 60, shell: 200, null: 740 });
});

// ---------- a dungeon map's popup, in every dungeon ----------

test('each dungeon\'s map brings its own "A dungeon map!" popup, so it shows in every dungeon, once each', () => {
  const { VL } = loadGame();
  const maps = [];
  for (const dungeon of Object.values(VL.DUNGEONS)) {
    for (const [screen, def] of Object.entries(VL.AREAS[dungeon.area].screens)) {
      for (const e of def.entities || []) if (e.type === 'dungeonMap') maps.push({ dungeon: dungeon.id, screen, ...e });
    }
  }
  assert.deepEqual(maps.map((m) => m.dungeon).sort(), ['hollowOak', 'lair', 'lighthouse', 'scriptorium']);
  const state = VL.newGame();
  state.popups.seen.controls = true;
  const shown = [];
  for (const map of maps) {
    VL.place(state, { area: VL.DUNGEONS[map.dungeon].area, screen: map.screen, tx: map.x, ty: map.y === 0 ? 1 : map.y - 1, facing: 'down' });
    state.popups.queue.length = 0;
    const entity = state.room.entities.find((e) => e.type === 'dungeonMap');
    VL.ENTITIES.dungeonMap.onStand(state, entity);
    assert.ok(VL.dungeonState(state, map.dungeon).map, `${map.dungeon}'s map is taken`);
    const id = state.popups.queue.find((p) => /dungeonMap/.test(p));
    assert.ok(id, `${map.dungeon} pops up its map`);
    assert.equal(VL.POPUPS[id].title, 'A dungeon map!');
    shown.push(id);
    state.popups.seen[id] = true;
  }
  assert.equal(new Set(shown).size, 4, 'four popups, one per dungeon');
  // An old save that saw the first one (id dungeonMap) still sees the others.
  assert.equal(VL.DUNGEON_MAP_POPUPS.scriptorium, 'dungeonMap');
});

// ---------- the metal sword's popup ----------

test('the metal sword\'s popup says it hits twice as hard and to equip it with E, not to swing it with Space', () => {
  const { VL } = loadGame();
  const { title, text } = VL.ITEMS.metalSword.popup;
  assert.match(text, /twice as hard/);
  assert.match(text, /\bE\b.*equip/);
  assert.doesNotMatch(text, /Space|swing/);
  assert.equal(VL.ART.popupLayout({ title, text }).overflow, false);
  assert.deepEqual([...VL.ART.missingGlyphs(`${title}${text}`, 'normal')], []);
});

// ---------- the east road's heart container, buried ----------

// It lies in the corner by the trees (a ring of flowers since W38); the tile
// in front is cleared for this visit.
function roadHeart(VL, shovel) {
  const state = playState(VL, ow('5,0', 12, 8, 'right'));
  state.room.entities = state.room.entities.filter((e) => !VL.isEnemy(e));
  VL.setRoomTile(state, 13, 8, '.');
  state.player.x = VL.tileCenter(13, 8).x;
  if (shovel) VL.giveItem(state, shovel);
  state.popups.queue.length = 0;
  state.popups.seen.digKey = true;
  state.popups.seen.controls = true;
  const heart = () => state.room.entities.find((e) => e.type === 'heartContainer');
  const dig = () => {
    VL.updateWorld(state, VL.actions({ pressed: ['dig'] }), 1 / 60);
    hold(VL, state, [], 0.5);
  };
  return { state, heart, dig };
}

test('the east road\'s heart container lies buried: nothing shows and walking over it finds nothing', () => {
  const { VL } = loadGame();
  const { state, heart } = roadHeart(VL, null);
  assert.equal(VL.SPOTS.heartFieldA.how, 'buried');
  assert.ok(heart() && heart().hidden, 'there, but hidden');
  const maxHp = state.maxHp;
  hold(VL, state, ['right'], 0.6);
  assert.equal(VL.heroTile(state).tx, 14, 'standing on its tile');
  assert.equal(state.maxHp, maxHp);
  assert.ok(!VL.spotFound(state, 'heartFieldA'));
  assert.ok(VL.SPOTS.heartFieldB.how === 'pickup', 'the cliff ledge\'s heart still sits in the open');
});

test('digging exactly that tile with the metal shovel brings the heart up into the hole, once; a wood shovel can\'t dig grass, and any other tile is just a hole', () => {
  const { VL } = loadGame();
  {
    const { state, heart, dig } = roadHeart(VL, 'woodShovel');
    dig();
    assert.ok(heart().hidden, 'the wood shovel bounces off grass');
  }
  {
    const { state, heart, dig } = roadHeart(VL, 'metalShovel');
    state.player.facing = 'left';
    dig();
    assert.equal(VL.tileAt('overworld', '5,0', 12, 8, state.room), '*', 'a hole in the grass beside it');
    assert.ok(heart().hidden, 'the tile beside it hides nothing');
  }
  const { state, heart, dig } = roadHeart(VL, 'metalShovel');
  dig();
  assert.equal(heart().hidden, false, 'up it comes');
  const maxHp = state.maxHp;
  hold(VL, state, ['right'], 0.6);
  assert.equal(state.maxHp, maxHp + VL.TUNING.heartContainerHp);
  assert.ok(VL.spotFound(state, 'heartFieldA'));
  VL.place(state, ow('5,0', 13, 8, 'right'));
  assert.equal(heart(), undefined, 'only once');
});

test('the progression table: the buried heart needs the metal shovel and stays optional; the solver is clean', () => {
  const { VL } = loadGame();
  const lock = VL.LOCKS.heartFieldA;
  assert.equal(lock.optional, true);
  assert.ok(lock.needs.includes('metalShovel'));
  assert.deepEqual([...VL.solveProgression().problems], []);
});

// ---------- the wreck's hatch, on the deck's south side ----------

test('the wreck\'s hatch is on the south side of the deck: holding Up out of the hold leaves him on deck, not back down the hatch', () => {
  const { VL } = loadGame();
  const hatch = VL.getScreen('overworld', '5,2').entities.find((e) => e.type === 'door');
  assert.deepEqual([hatch.x, hatch.y], [8, 6]);
  const deck = VL.getScreen('overworld', '5,2').tiles;
  assert.notEqual(deck[hatch.y + 1][hatch.x], 'b', 'the deck\'s south row');
  assert.deepEqual(plain(VL.DUNGEONS.wreck.entrance), { area: 'overworld', screen: '5,2', tx: 8, ty: 5, facing: 'up' });
  const state = playState(VL, { area: 'wreck', screen: '0,0', tx: 7, ty: 2, facing: 'up' });
  state.popups.seen.controls = true;
  const areas = [state.player.area];
  for (let t = 0; t < 4; t += 1 / 60) {
    VL.updateWorld(state, VL.actions({ held: ['up'] }), 1 / 60);
    if (areas.at(-1) !== state.player.area) areas.push(state.player.area);
  }
  assert.deepEqual(areas, ['wreck', 'overworld'], 'out once, and he stays out');
  assert.deepEqual([state.player.screen, VL.heroTile(state).tx, VL.heroTile(state).ty, state.player.facing], ['5,2', 8, 5, 'up']);
  // Walking down onto the hatch takes him below.
  for (let t = 0; t < 1 && state.player.area !== 'wreck'; t += 1 / 60) VL.updateWorld(state, VL.actions({ held: ['down'] }), 1 / 60);
  assert.equal(state.player.area, 'wreck');
});

// ---------- where the books lie ----------

const bookLocks = (VL) => Object.keys(VL.LOCKS).filter((id) => VL.LOCKS[id].supplies.books && VL.SPOTS[id]);
const regionOfSpot = (VL, id) => {
  const spot = VL.SPOTS[id];
  if (spot.area === 'overworld') return VL.regionOf('overworld', spot.screen);
  return spot.area;
};

// The ids the W30 highlands books kept when W34 moved them down.
const FROM_THE_HIGHLANDS = ['bookHighShelfA', 'bookHighShelfB', 'bookHighScree', 'bookHighGapA', 'bookHighGapB', 'bookHighPathA', 'bookHighPathB', 'bookHighlands', 'bookLairB'];

test('only two books lie in the highlands: A Child\'s Book of Dragons and Ashton Co-op; the rest are spread out, a couple on the shipwreck and a couple in the Woods, never piled on one screen', () => {
  const { VL } = loadGame();
  const by = {};
  const onScreen = {};
  for (const id of bookLocks(VL)) {
    (by[regionOfSpot(VL, id)] ||= []).push(id);
    (onScreen[`${VL.SPOTS[id].area} ${VL.SPOTS[id].screen}`] ||= []).push(id);
  }
  assert.deepEqual(by.highlands.sort(), ['bookDragons', 'bookLairA']);
  const moved = (ids = []) => ids.filter((id) => FROM_THE_HIGHLANDS.includes(id));
  assert.equal(moved([...by.shipwreck, ...(by.wreck || [])]).length, 2, `shipwreck: ${by.shipwreck} / ${by.wreck}`);
  assert.equal(moved(by.woods).length, 2, `woods: ${by.woods}`);
  for (const [screen, ids] of Object.entries(onScreen)) assert.ok(ids.length <= 2, `${screen}: ${ids}`);
  for (const [region, ids] of Object.entries(by)) assert.ok(ids.length <= 5, `${region}: ${ids}`);
  assert.ok(by.shipwreck.length + (by.wreck || []).length <= 4, `shipwreck: ${by.shipwreck} / ${by.wreck}`);
});

test('a book that left the highlands no longer names them: retitled where it sits now, ids kept', () => {
  const { VL } = loadGame();
  for (const id of FROM_THE_HIGHLANDS) {
    const { title, blurb } = VL.BOOKS[id];
    assert.doesNotMatch(`${title} ${blurb}`, /highland|mountain/i, `${id}: ${title}`);
  }
  assert.equal(VL.BOOKS.bookHighShelfA.title, 'A Squirrel\'s Guide to Trees');
  assert.equal(VL.BOOKS.bookLairB.title, 'Stars Over the Sea');
});

test('the Chicken Keeper\'s Almanac is on the shipwreck\'s deck now, and the Captain\'s Logbook took its trunk by the Hollow Oak; the librarian\'s hint follows it', () => {
  const { VL } = loadGame();
  assert.deepEqual([VL.SPOTS.bookChickenAlmanac.screen, VL.SPOTS.bookChickenAlmanac.how], ['5,2', 'trunk']);
  assert.deepEqual([VL.SPOTS.bookWreckDeck.screen, VL.SPOTS.bookWreckDeck.x, VL.SPOTS.bookWreckDeck.y], ['7,-2', 10, 8]);
  assert.deepEqual(plain(VL.LOCKS.bookChickenAlmanac.needs), ['shipwreck', 'library']);
  assert.ok(VL.LOCKS.bookWreckDeck.needs.includes('woods'));
  const hint = VL.LIBRARY_HINTS.highlands[0].say;
  assert.match(hint, /wreck/);
  assert.doesNotMatch(hint, /Woods/);
});

test('Ashton Co-op: a book near the end, and the librarian says "Adventures in learning! Or maybe just adventures. Who knows?"', () => {
  const { VL } = loadGame();
  const book = VL.BOOKS.bookLairA;
  assert.equal(book.kind, 'generic');
  assert.equal(book.title, 'Ashton Co-op');
  assert.equal(book.blurb, 'Adventures in learning! Or maybe just adventures. Who knows?');
  assert.equal(VL.SPOTS.bookLairA.screen, '-1,-5', 'on the lair\'s doorstep');
  assert.deepEqual([...VL.ART.missingGlyphs(`"${book.title}." ${book.blurb}`, 'normal')], []);
});

test('the book margins: the 10-book heart before the shockwave, the purse after it but well before the binding needs it, and the boots in reach', () => {
  const { VL } = loadGame();
  const result = VL.solveProgression();
  assert.deepEqual([...result.problems], []);
  const before = result.stages[0];
  assert.ok(before.counts.books >= 10 + 3 && before.counts.books < 20, `before the shockwave: ${before.counts.books}`);
  assert.ok(before.reached.includes('heartLibrary') && !before.reached.includes('shellPurse'));
  // Every book a kid can find before the binding (nothing behind the Climber's Almanac or the highlands).
  const after = (id, key) => {
    const needs = VL.LOCKS[id].needs.flat();
    return needs.includes(key) || needs.some((n) => VL.LOCKS[n] && n !== id && after(n, key));
  };
  const books = Object.keys(VL.LOCKS).filter((id) => VL.LOCKS[id].supplies.books);
  const beforeBinding = books.filter((id) => !after(id, 'climbersAlmanac')).reduce((n, id) => n + VL.LOCKS[id].supplies.books, 0);
  assert.ok(beforeBinding >= 20 + 6, `${beforeBinding} books before the binding`);
  const total = books.reduce((n, id) => n + VL.LOCKS[id].supplies.books, 0);
  assert.ok(total >= 30 + 5, `${total} books in all`);
});

// ---------- the Smith's Ledger: a rumour of ore on the wreck ----------

test('the Smith\'s Ledger tells of a rumour of ore on the old shipwreck (not the Woods), and once read that ore gleams on a drawn map until it is found', () => {
  const { VL } = loadGame();
  const book = VL.BOOKS.bookSmithsLedger;
  const words = [...book.reading, VL.POPUPS.smithsLedgerRead.text].join(' ');
  assert.match(words, /rumou?r/i);
  assert.match(words, /shipwreck|wreck/);
  assert.doesNotMatch(words, /Woods/);
  const { title, text } = VL.POPUPS.smithsLedgerRead;
  assert.equal(VL.ART.popupLayout({ title, text }).overflow, false);
  const game = VL.newGame();
  VL.markFound(game, 'bookSmithsLedger');
  assert.deepEqual(plain(VL.mapMarks(game)), [], 'nothing before it is read');
  VL.returnBooks(game);
  VL.finishReading(game, VL.nextReading(game));
  const hatch = VL.getScreen('overworld', '5,2').entities.find((e) => e.type === 'door');
  assert.deepEqual(plain(VL.mapMarks(game)), [{ kind: 'ore', area: 'overworld', screen: '5,2', tx: hatch.x, ty: hatch.y }]);
  game.visited['overworld:5,2'] = true;
  assert.deepEqual(plain(VL.mapView(game).marks), [{ kind: 'ore', screen: '5,2', tx: hatch.x, ty: hatch.y }], 'drawn on the overworld map, over the hatch');
  VL.markFound(game, 'oreShipwreck');
  assert.deepEqual(plain(VL.mapMarks(game)), [], 'gone once the ore is found');
});

test('the rumoured ore\'s mark gleams on the drawn map', () => {
  const { VL } = loadGame();
  const app = VL.createApp();
  app.game = VL.newGame({ name: 'Robin' });
  VL.giveItem(app.game, 'worldMap');
  app.game.library.returned.push('bookSmithsLedger');
  app.game.library.read.push('bookSmithsLedger');
  app.game.flags['found:bookSmithsLedger'] = true;
  assert.ok(VL.mapMarks(app.game).some((m) => m.kind === 'ore'));
  app.setScene('worldMap', { mode: 'view' });
  const original = VL.ART.drawSparkle;
  let sparkles = 0;
  VL.ART.drawSparkle = (...args) => {
    sparkles += 1;
    return original(...args);
  };
  try {
    VL.render(fakeDocument().createElement('canvas').getContext('2d'), app, 0.1);
  } finally {
    VL.ART.drawSparkle = original;
  }
  assert.ok(sparkles >= 1);
});

// ---------- the Big Shell Purse holds 50; the binding costs 40 ----------

test('with all five pages but only the small purse, Miss Quill says plainly that her price won\'t fit in it and where a bigger purse comes from; with the Big Shell Purse she binds', () => {
  const { VL } = loadGame();
  VL.loosePages = () => VL.pagesToBind();
  const offer = offerIn(VL, 'bookbinder', 'bindPages');
  const state = VL.newGame({ name: 'Robin' });
  state.inventory.shells = VL.TUNING.shellCap;
  const refused = VL.buyOffer(state, offer);
  assert.equal(refused.reason, 'refused');
  assert.match(refused.text, /40 shells/);
  assert.match(refused.text, /purse holds only 15/);
  assert.match(refused.text, /Mr\. Fenwick/);
  assert.ok(VL.ART.wrapText(refused.text, 208).length <= 2, 'fits the counter\'s two note lines');
  state.items.shellPurse = true;
  state.inventory.shells = 39;
  assert.deepEqual(plain(VL.buyOffer(state, offer)), { ok: false, reason: 'notEnough', kind: 'shells' });
  state.inventory.shells = 40;
  assert.deepEqual(plain(VL.buyOffer(state, offer)), { ok: true });
  assert.equal(state.flags.pagesBound, true);
});

test('the Big Shell Purse holds 50 whole shells (the first one 15), and its words say so', () => {
  const { VL } = loadGame();
  assert.equal(VL.TUNING.shellCap, 15);
  assert.equal(VL.TUNING.shellCapPurse, 50);
  assert.match(VL.ITEMS.shellPurse.about, /\b50\b/);
  assert.match(VL.ITEMS.shellPurse.popup.text, /\b50\b.*\b15\b/);
  const state = playState(VL, ow('1,1', 8, 5));
  state.popups.seen.controls = true;
  VL.addResource(state, 'shells', 40);
  hold(VL, state, [], 0.05);
  assert.equal(state.inventory.shells, 15);
  assert.ok(state.popups.queue.includes('purseFull'));
  state.items.shellPurse = true;
  VL.addResource(state, 'shells', 400);
  hold(VL, state, [], 0.05);
  assert.equal(state.inventory.shells, 50);
  // The big purse has its own words: no talk of the small one or of finding a bigger one.
  assert.ok(state.popups.queue.includes('bigPurseFull') || state.popups.seen.bigPurseFull);
  assert.doesNotMatch(VL.POPUPS.bigPurseFull.text, /\b15\b|librarian|bigger/);
  const fresh = playState(VL, ow('1,1', 8, 5));
  fresh.popups.seen.controls = true;
  fresh.items.shellPurse = true;
  VL.addResource(fresh, 'shells', 60);
  hold(VL, fresh, [], 0.05);
  assert.ok(fresh.popups.queue.includes('bigPurseFull') || fresh.popups.seen.bigPurseFull);
  assert.ok(!fresh.popups.queue.includes('purseFull') && !fresh.popups.seen.purseFull, 'never the small purse\'s words');
});

test('an old save holding more than 50 shells in the Big Shell Purse keeps them; nothing more goes in until he spends below 50', () => {
  const { VL } = loadGame();
  const fs = require('node:fs');
  const path = require('node:path');
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v1-W26.json'), 'utf8'));
  assert.equal(raw.inventory.shells, 140);
  const state = VL.restoreGame(raw);
  VL.place(state, ow('1,1', 8, 5));
  state.popups.queue.length = 0;
  hold(VL, state, [], 0.1);
  assert.equal(state.inventory.shells, 140, 'kept as it loads');
  VL.addResource(state, 'shells', 1);
  hold(VL, state, [], 0.05);
  assert.equal(state.inventory.shells, 140, 'a picked-up shell does not fit');
  VL.addResource(state, 'shells', -100);
  VL.addResource(state, 'shells', 30);
  hold(VL, state, [], 0.05);
  assert.equal(state.inventory.shells, 50, 'below the cap it fills to 50 again');
});

test('binding the five pages costs 40 shells, so it needs the Big Shell Purse: the table says so, and the librarian\'s hint says where to get one', () => {
  const { VL } = loadGame();
  assert.deepEqual(plain(VL.TUNING.prices.binding), { shells: 40 });
  assert.equal(offerIn(VL, 'bookbinder', 'bindPages').cost.shells, 40);
  assert.ok(VL.TUNING.prices.binding.shells > VL.TUNING.shellCap && VL.TUNING.prices.binding.shells <= VL.TUNING.shellCapPurse);
  assert.ok(VL.LOCKS.climbersAlmanac.needs.includes('shellPurse'));
  assert.deepEqual([...VL.solveProgression().problems], []);
  // Without the purse in the table, the binding (and all after it) is out of reach.
  const without = Object.fromEntries(Object.entries(VL.LOCKS).filter(([id]) => id !== 'shellPurse'));
  assert.ok(VL.solveProgression(without).problems.some((p) => /climbersAlmanac|unknown key shellPurse/.test(p)));
  const hints = VL.LIBRARY_HINTS.climbersAlmanac;
  const purseHint = hints.find((h) => h.when);
  assert.match(purseHint.say, /purse/);
  const state = VL.newGame({ name: 'Robin' });
  assert.equal(Boolean(purseHint.when(state)), true, 'said while he has no Big Shell Purse');
  state.items.shellPurse = true;
  assert.equal(Boolean(purseHint.when(state)), false);
});
