// W12, paper and ink: the Mortar & Pestle (berries → ink), copying a mural
// or tablet, the drawn world map (M), the Herbalist's marks, losing the map
// and drawing it again (design: Paper and ink, Resources and economy: Ink,
// Books: Herbalist's Notes and Cartographer's Primer, Controls).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test, read, loadGame, playApp, memoryStorage, fakeContext } = require('./harness');

const STEP = 1 / 60;
const plain = (value) => JSON.parse(JSON.stringify(value));

// `dungeon: true` loads W13's sample dungeon (tests/sample-dungeon.js), so
// the seams with the real dungeon framework are tested without a stub.
function setup({ storage = false, dungeon = false } = {}) {
  const context = loadGame();
  if (dungeon) vm.runInContext(read('tests/sample-dungeon.js'), context, { filename: 'tests/sample-dungeon.js' });
  const { VL } = context;
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
  const t = {
    VL,
    get app() { return app; },
    get game() { return app.game; },
    step: (actions = VL.noActions()) => app.update(actions, STEP),
    press: (action) => app.update(VL.actions({ pressed: [action] }), STEP),
    wait(seconds) {
      for (let s = 0; s < seconds - 1e-9; s += STEP) app.update(VL.noActions(), STEP);
    },
    at: (where) => VL.place(app.game, where),
    reload() {
      app = VL.reloadApp(app, { save: true });
      return app;
    },
    closePopups() {
      for (let i = 0; i < 20 && (VL.currentPopup(app.game) || app.sceneId === 'popup'); i += 1) {
        if (app.sceneId === 'play') t.step();
        t.wait(0.4);
        t.press('interact');
      }
      if (app.sceneId === 'popup') t.step();
    },
  };
  return t;
}

const readPrimer = (VL, game) => {
  game.library.returned.push('bookPrimer');
  game.library.read.push('bookPrimer');
};
const give = (VL, game, counts) => {
  for (const [kind, n] of Object.entries(counts)) VL.addResource(game, kind, n);
};
// A spot in the open field south of the hut, facing a wall-less tile.
const FIELD = { area: 'overworld', screen: '1,1', tx: 4, ty: 6, facing: 'up' };

// ---------- the Mortar & Pestle ----------

test('the Mortar & Pestle is a hand tool: its key grinds berries into ink (five to one, W41)', () => {
  const t = setup();
  const { VL } = t;
  t.at(FIELD);
  VL.giveItem(t.game, 'mortarPestle');
  t.closePopups();
  assert.equal(VL.heldItem(t.game, 'mainHand'), 'mortarPestle', 'it lands in an empty hand');
  const n = VL.TUNING.berriesPerInk;
  give(VL, t.game, { berries: 2 * n });
  t.press('mainHand');
  assert.deepEqual([t.game.inventory.berries, t.game.inventory.ink], [n, 1]);
  assert.ok(t.game.flags.madeInk);
  assert.ok(t.game.player.grind, 'the grinding shows with the hero');
  t.press('mainHand');
  assert.equal(t.game.inventory.ink, 1, 'one grind at a time');
  t.wait(VL.TUNING.grindSeconds + 0.05);
  assert.equal(t.game.player.grind, null);
  t.press('mainHand');
  assert.deepEqual([t.game.inventory.berries, t.game.inventory.ink], [0, 2]);
  assert.equal(VL.heldItem(t.game, 'mainHand'), 'mortarPestle', 'the tool stays in hand when the berries run out');
});

test('grinding with no berries says what is missing and changes nothing', () => {
  const t = setup();
  const { VL } = t;
  t.at(FIELD);
  VL.giveItem(t.game, 'mortarPestle');
  t.closePopups();
  t.press('mainHand');
  assert.equal(t.game.inventory.ink, 0);
  assert.equal(t.game.flags.madeInk, undefined);
  assert.match(VL.currentPopup(t.game).text, /berries/i);
});

test('ink is kept by Save & Quit right after grinding', () => {
  const t = setup({ storage: true });
  const { VL } = t;
  t.at(FIELD);
  VL.giveItem(t.game, 'mortarPestle');
  give(VL, t.game, { berries: VL.TUNING.berriesPerInk });
  t.closePopups();
  t.press('mainHand');
  t.reload();
  assert.equal(t.game.inventory.ink, 1);
  assert.ok(VL.hasItem(t.game, 'mortarPestle'));
  assert.ok(VL.LOCKS.ink.reached(t.game));
});

test('S on the mortar in the equipment screen grinds too, and the screen counts paper and ink', () => {
  const t = setup();
  const { VL } = t;
  VL.giveItem(t.game, 'mortarPestle');
  give(VL, t.game, { berries: VL.TUNING.berriesPerInk, paper: 3 });
  t.closePopups();
  t.press('equipment');
  assert.equal(t.app.sceneId, 'equipment');
  t.app.equipment.cursor = VL.equipmentItems(t.game).findIndex((item) => item.id === 'mortarPestle');
  VL.addResource(t.game, 'berries', VL.TUNING.berriesPerInk);
  t.press('interact');
  t.press('interact');
  assert.deepEqual([t.game.inventory.berries, t.game.inventory.ink], [0, 2], 'one grind per S, no waiting while paused');
  const drawn = [];
  const ctx = fakeContext();
  const sprite = VL.ART.drawSprite;
  VL.ART.drawSprite = (c, id, ...rest) => {
    drawn.push(id);
    return sprite(c, id, ...rest);
  };
  t.app.draw(ctx, 0);
  VL.ART.drawSprite = sprite;
  assert.ok(drawn.includes('icon-paper') && drawn.includes('icon-ink'), 'paper and ink are shown with the other resources');
});

// ---------- copying ----------

const MURAL = { type: 'copyable', copy: 'woodsMapCopy', look: 'mural', x: 4, y: 5 };

function atMural(t, entity = MURAL) {
  t.at(FIELD);
  t.game.room.entities.push({ ...entity });
}

test('S at a mural with no paper or ink describes it and says what copying needs', () => {
  const t = setup();
  const { VL } = t;
  atMural(t);
  t.press('interact');
  const popup = VL.currentPopup(t.game);
  assert.match(popup.text, /paper and ink/);
  assert.equal(VL.hasItem(t.game, 'woodsMapCopy'), false);
  t.closePopups();
  give(VL, t.game, { paper: 1 });
  t.press('interact');
  assert.match(VL.currentPopup(t.game).text, /need ink/, 'only what is missing');
  assert.equal(t.game.inventory.paper, 1, 'nothing is spent');
});

test('with paper and ink, S copies the mural into its item, once', () => {
  const t = setup({ storage: true });
  const { VL } = t;
  atMural(t);
  give(VL, t.game, { paper: 2, ink: 2 });
  t.press('interact');
  assert.ok(VL.hasItem(t.game, 'woodsMapCopy'));
  assert.deepEqual([t.game.inventory.paper, t.game.inventory.ink], [1, 1]);
  assert.ok(t.game.events.some((e) => e.type === 'copied' && e.copy === 'woodsMapCopy'));
  assert.equal(VL.currentPopup(t.game).id, 'woodsMapCopy', 'the copy explains itself');
  t.reload();
  assert.ok(VL.hasItem(t.game, 'woodsMapCopy'), 'a copy is earned');
  assert.ok(VL.LOCKS.woodsMapCopy.reached(t.game));
  t.closePopups();
  atMural(t);
  t.press('interact');
  assert.match(VL.currentPopup(t.game).text, /already/);
  assert.deepEqual([t.game.inventory.paper, t.game.inventory.ink], [1, 1], 'a second copy costs nothing because none is made');
});

test('copyable is generic: a later item defines its own copy and places a tablet', () => {
  const t = setup();
  const { VL } = t;
  VL.defineCopy('testRubbing', {
    name: 'Tablet Rubbing',
    icon: 'woods-map',
    about: 'Runes, copied.',
    seen: 'Old runes are carved into the stone.',
    popup: { title: 'A rubbing!', text: 'You copied the runes.' },
    picture() {},
  });
  atMural(t, { type: 'copyable', copy: 'testRubbing', look: 'tablet', x: 4, y: 5 });
  t.press('interact');
  assert.match(VL.currentPopup(t.game).text, /^Old runes are carved into the stone\./);
  t.closePopups();
  give(VL, t.game, { paper: 1, ink: 1 });
  t.press('interact');
  assert.ok(VL.hasItem(t.game, 'testRubbing'));
  assert.throws(() => VL.defineCopy('testRubbing', { name: 'x', icon: 'woods-map', about: 'x', picture() {} }), /already defined/);
  const placed = Object.values(VL.AREAS).flatMap((area) => Object.values(area.screens).flatMap((screen) => screen.entities)).filter((e) => e.type === 'copyable');
  for (const entity of placed) assert.ok(VL.COPIES[entity.copy] && ['mural', 'tablet'].includes(entity.look), JSON.stringify(entity));
});

test('a copy held in a hand, or chosen with S on the equipment screen, opens to be looked at', () => {
  const t = setup();
  const { VL } = t;
  t.at(FIELD);
  VL.giveItem(t.game, 'woodsMapCopy');
  t.closePopups();
  assert.equal(VL.heldItem(t.game, 'mainHand'), 'woodsMapCopy');
  t.press('mainHand');
  assert.equal(t.app.sceneId, 'copyView');
  t.app.draw(fakeContext(), 0);
  t.wait(0.4);
  t.press('interact');
  assert.equal(t.app.sceneId, 'play');
  t.press('equipment');
  t.app.equipment.cursor = VL.equipmentItems(t.game).findIndex((item) => item.id === 'woodsMapCopy');
  t.press('interact');
  assert.equal(t.app.sceneId, 'copyView');
  t.wait(0.4);
  t.press('pause');
  assert.equal(t.app.sceneId, 'equipment', 'back where it was opened');
});

// ---------- visits ----------

test('the first visit to a screen is kept by Save & Quit right after exploring', () => {
  const t = setup({ storage: true });
  const { VL } = t;
  const walk = (dir, from) => {
    for (let i = 0; i < 120 && t.game.player.screen === from; i += 1) t.app.update(VL.actions({ held: [dir] }), STEP);
  };
  t.wait(0.1);
  assert.equal(t.game.dirty, false);
  assert.equal(t.game.visited['overworld:1,0'], undefined);
  t.at({ area: 'overworld', screen: '1,1', tx: 7, ty: 0, facing: 'up' });
  walk('up', '1,1');
  assert.equal(t.game.player.screen, '1,0');
  t.reload();
  assert.ok(t.game.visited['overworld:1,0'], 'still visited after a reload right away');
  t.at({ area: 'overworld', screen: '1,0', tx: 7, ty: 10, facing: 'down' });
  t.step();
  let earned = false;
  for (let i = 0; i < 120 && t.game.player.screen === '1,0'; i += 1) {
    t.app.update(VL.actions({ held: ['down'] }), STEP);
    earned = earned || t.game.events.some((e) => e.type === 'earned');
  }
  assert.equal(t.game.player.screen, '1,1');
  assert.equal(earned, false, 'a screen seen before earns nothing');
});

test('going through a door to a new inside is kept too', () => {
  const t = setup({ storage: true });
  const { VL } = t;
  // The hut door is up from the start tile.
  for (let i = 0; i < 240 && t.game.player.area === 'overworld'; i += 1) t.app.update(VL.actions({ held: ['up'] }), STEP);
  assert.equal(t.game.player.area, 'hut');
  t.reload();
  assert.ok(t.game.visited['hut:0,0']);
});

test('walking over a screen edge to a new screen is saved by the end of that step', () => {
  const t = setup({ storage: true });
  const { VL } = t;
  // Up from the hut screen (1,1) into the home field (1,0).
  t.at({ area: 'overworld', screen: '1,1', tx: 7, ty: 0, facing: 'up' });
  for (let i = 0; i < 120 && t.game.player.screen === '1,1'; i += 1) t.app.update(VL.actions({ held: ['up'] }), STEP);
  assert.equal(t.game.player.screen, '1,0');
  t.reload();
  assert.ok(t.game.visited['overworld:1,0']);
});

// ---------- drawing the world map ----------

function readyToDraw(t) {
  const { VL } = t;
  readPrimer(VL, t.game);
  give(VL, t.game, { paper: 1, ink: 1 });
  t.game.popups.seen.mapReady = true;
}

test('M with no map says what drawing one needs: the Primer, then paper and ink', () => {
  const t = setup();
  const { VL } = t;
  t.at(FIELD);
  t.press('map');
  assert.equal(t.app.sceneId, 'popup');
  assert.match(VL.currentPopup(t.game).text, /no map/i);
  t.closePopups();
  readPrimer(VL, t.game);
  t.game.popups.seen.mapReady = true;
  give(VL, t.game, { ink: 1 });
  t.press('map');
  assert.match(VL.currentPopup(t.game).text, /need paper/);
  assert.doesNotMatch(VL.currentPopup(t.game).text, /ink/);
  t.closePopups();
  t.game.library.gone.push('bookPrimer');
  give(VL, t.game, { paper: 1 });
  t.press('map');
  assert.match(VL.currentPopup(t.game).text, /Primer/, 'the Primer must still be on the shelf');
  assert.equal(VL.hasItem(t.game, 'worldMap'), false);
});

test('a hero with no ink and no Mortar & Pestle is told where ink comes from, in the Primer and at M', () => {
  const t = setup();
  const { VL } = t;
  const saysWhere = (text) => /berries/.test(text) && /Mortar & Pestle/.test(text) && /Scriptorium/.test(text);
  const book = VL.BOOKS.bookPrimer;
  assert.ok(saysWhere(book.reading.join(' ')), 'the reading');
  for (const page of book.reading) assert.equal(VL.ART.popupLayout({ text: VL.popupText(page, { name: 'Ñandú Élodïe' }) }).overflow, false, page);
  readPrimer(VL, t.game);
  const primerPopup = VL.POPUPS.primerRead;
  assert.ok(saysWhere(primerPopup.text), 'the popup after the reading');
  assert.equal(VL.ART.popupLayout(primerPopup).overflow, false);
  t.game.popups.seen.mapReady = true;
  t.at(FIELD);
  give(VL, t.game, { paper: 1 });
  t.press('map');
  const noInk = VL.currentPopup(t.game);
  assert.ok(saysWhere(noInk.text), noInk.text);
  assert.equal(VL.ART.popupLayout(noInk).overflow, false);
  assert.deepEqual(plain(VL.ART.missingGlyphs(noInk.text)), []);
  t.closePopups();
  VL.giveItem(t.game, 'mortarPestle');
  t.press('map');
  assert.doesNotMatch(VL.currentPopup(t.game).text, /Scriptorium/, 'with the mortar in hand, just what is missing');
});

test('M asks before drawing; No keeps the paper and ink', () => {
  const t = setup();
  const { VL } = t;
  t.at(FIELD);
  readyToDraw(t);
  t.press('map');
  assert.equal(t.app.sceneId, 'worldMap');
  assert.equal(t.app.worldMapView.mode, 'ask');
  t.press('right');
  t.press('interact');
  assert.equal(t.app.sceneId, 'play');
  assert.deepEqual([t.game.inventory.paper, t.game.inventory.ink], [1, 1]);
  t.press('map');
  t.press('map');
  assert.equal(t.app.sceneId, 'play', 'M again backs out');
  assert.equal(VL.hasItem(t.game, 'worldMap'), false);
});

test('drawing spends paper and ink and shows every screen already visited at once', () => {
  const t = setup({ storage: true });
  const { VL } = t;
  const before = ['1,1', '0,0', '1,0', '2,0', '2,-1', '3,-1', '-1,-1'];
  for (const screen of before) t.at({ area: 'overworld', screen, tx: 7, ty: 5 });
  t.at({ area: 'hut', screen: '0,0', tx: 7, ty: 5 });
  t.at(FIELD);
  readyToDraw(t);
  t.press('map');
  t.press('interact');
  assert.equal(t.app.worldMapView.mode, 'drawing');
  assert.deepEqual([t.game.inventory.paper, t.game.inventory.ink], [0, 0]);
  assert.ok(VL.hasItem(t.game, 'worldMap'));
  const view = VL.mapView(t.game);
  assert.deepEqual(plain(view.screens).sort(), before.slice().sort(), 'every overworld screen ever visited, and no interior');
  t.wait(VL.TUNING.mapRevealSeconds + 0.2);
  assert.equal(t.app.worldMapView.mode, 'view');
  t.app.draw(fakeContext(), 1);
  t.reload();
  assert.ok(VL.hasItem(t.game, 'worldMap'), 'the map is earned');
  assert.ok(VL.LOCKS.worldMap.reached(t.game));
});

test('a key press finishes the drawing at once, and the map then fills in as the hero explores', () => {
  const t = setup();
  const { VL } = t;
  t.at(FIELD);
  readyToDraw(t);
  t.press('map');
  t.press('interact');
  t.wait(0.05);
  t.press('interact');
  assert.equal(t.app.worldMapView.mode, 'view');
  t.press('map');
  assert.equal(t.app.sceneId, 'play');
  t.closePopups();
  assert.equal(VL.mapView(t.game).screens.includes('3,0'), false);
  t.at({ area: 'overworld', screen: '3,0', tx: 7, ty: 5 });
  assert.ok(VL.mapView(t.game).screens.includes('3,0'));
  t.press('map');
  assert.equal(t.app.sceneId, 'worldMap');
  assert.equal(t.app.worldMapView.mode, 'view', 'with a map, M just opens it');
});

test('the map marks the hero: the screen and tile outdoors, the building\'s door indoors', () => {
  const t = setup();
  const { VL } = t;
  t.at({ area: 'overworld', screen: '2,0', tx: 5, ty: 6 });
  assert.deepEqual(plain(VL.mapView(t.game).hero), { screen: '2,0', tx: 5, ty: 6 });
  const door = VL.SPOTS.libraryDoor;
  t.at({ area: 'library', screen: '0,0', tx: 7, ty: 7 });
  assert.deepEqual(plain(VL.mapView(t.game).hero), { screen: door.screen, tx: door.x, ty: door.y });
  t.at({ area: 'hut', screen: '0,0', tx: 7, ty: 5 });
  assert.equal(VL.mapView(t.game).hero.screen, '1,1', 'the hut sits on the start screen');
});

test('region names show for regions the hero has visited', () => {
  const t = setup();
  const { VL } = t;
  t.at({ area: 'overworld', screen: '2,0', tx: 7, ty: 5 });
  const names = plain(VL.mapView(t.game).labels.map((l) => l.name));
  assert.ok(names.includes('TOWN') && names.includes('BEACH'), names.join());
  assert.equal(names.includes('WOODS'), false);
  for (const name of Object.values(VL.REGION_NAMES)) if (name) assert.deepEqual(plain(VL.ART.missingGlyphs(name, 'small')), [], name);
  assert.deepEqual(Object.keys(VL.REGIONS).filter((id) => !(id in VL.REGION_NAMES)), [], 'every region has a name entry');
});

test('the Herbalist\'s Notes mark every berry bush on the map, visited or not', () => {
  const t = setup();
  const { VL } = t;
  t.at(FIELD);
  assert.deepEqual(plain(VL.mapView(t.game).marks), []);
  t.game.library.returned.push('bookHerbalist');
  t.game.library.read.push('bookHerbalist');
  const marks = VL.mapView(t.game).marks;
  assert.ok(marks.length >= 2 && marks.every((m) => m.kind === 'berries'), JSON.stringify(marks));
  for (const mark of marks) assert.ok(VL.tileInfo('overworld', VL.getScreen('overworld', mark.screen).tiles[mark.ty][mark.tx]).berry);
  assert.ok(marks.some((m) => !t.game.visited[`overworld:${m.screen}`]), 'a bush on a screen not visited yet is marked too');
  VL.giveItem(t.game, 'worldMap');
  t.closePopups();
  t.press('map');
  const drawn = [];
  const sprite = VL.ART.drawSprite;
  VL.ART.drawSprite = (c, id, ...rest) => {
    drawn.push(id);
    return sprite(c, id, ...rest);
  };
  t.app.draw(fakeContext(), 0);
  VL.ART.drawSprite = sprite;
  assert.equal(drawn.filter((id) => id === 'icon-berry').length, marks.length + 1, 'a berry on the map for each bush, and one in the key');
});

test('with the Primer read, paper and ink in hand, a popup tells the player about M once', () => {
  const t = setup();
  const { VL } = t;
  t.at(FIELD);
  readPrimer(VL, t.game);
  give(VL, t.game, { paper: 1 });
  t.wait(0.1);
  assert.equal(VL.currentPopup(t.game), null);
  give(VL, t.game, { ink: 1 });
  t.wait(0.1);
  assert.equal(VL.currentPopup(t.game)?.id, 'mapReady');
  assert.match(VL.currentPopup(t.game).text, /M/);
  t.closePopups();
  t.wait(0.1);
  assert.equal(VL.currentPopup(t.game), null);
});

// ---------- the shockwave hook ----------

test('VL.loseWorldMap takes the map (hand too) and keeps the visits, so it can be drawn again', () => {
  const t = setup({ storage: true });
  const { VL } = t;
  t.at({ area: 'overworld', screen: '2,0', tx: 7, ty: 5 });
  readyToDraw(t);
  t.press('map');
  t.press('interact');
  t.wait(VL.TUNING.mapRevealSeconds + 0.2);
  t.press('map');
  t.closePopups();
  VL.setHand(t.game, 'offHand', 'worldMap');
  assert.equal(VL.loseWorldMap(t.game), true);
  assert.equal(VL.hasItem(t.game, 'worldMap'), false);
  assert.equal(t.game.hands.offHand, null);
  assert.equal(VL.loseWorldMap(t.game), false, 'nothing to lose twice');
  t.step();
  t.reload();
  assert.equal(VL.hasItem(t.game, 'worldMap'), false, 'the loss is saved');
  assert.equal(VL.LOCKS.worldMap.reached(t.game), false);
  t.closePopups();
  t.at({ area: 'overworld', screen: '3,0', tx: 7, ty: 5 });
  t.press('map');
  assert.match(VL.currentPopup(t.game).text, /paper/);
  t.closePopups();
  give(VL, t.game, { paper: 1, ink: 1 });
  t.closePopups();
  t.press('map');
  assert.equal(t.app.worldMapView.mode, 'ask');
  t.press('interact');
  assert.ok(VL.hasItem(t.game, 'worldMap'));
  const screens = VL.mapView(t.game).screens;
  assert.ok(screens.includes('2,0') && screens.includes('3,0'), 'the redrawn map has screens from before and after the loss');
});

// ---------- M inside and outside dungeons ----------

test('M opens the world map only outside dungeons: inside one it belongs to the dungeon map', () => {
  const t = setup();
  const { VL } = t;
  t.at(FIELD);
  VL.giveItem(t.game, 'worldMap');
  t.closePopups();
  const shipped = VL.dungeonOf;
  VL.dungeonOf = () => ({ id: 'testDungeon', area: 'overworld' });
  t.press('map');
  assert.notEqual(t.app.sceneId, 'worldMap', 'inside a dungeon the world map stays shut');
  assert.equal(VL.inDungeon(t.game), true);
  if (t.app.sceneId !== 'play') t.app.setScene('play');
  VL.dungeonOf = () => null;
  t.press('map');
  assert.equal(t.app.sceneId, 'worldMap');
  VL.dungeonOf = shipped;
});

test('inside a dungeon the world map opens from no key, and the "press M" popup waits', () => {
  const t = setup();
  const { VL } = t;
  t.at(FIELD);
  VL.giveItem(t.game, 'worldMap');
  t.closePopups();
  assert.equal(VL.heldItem(t.game, 'mainHand'), 'worldMap');
  VL.dungeonOf = () => ({ id: 'testDungeon', area: 'overworld' });
  t.press('mainHand');
  assert.notEqual(t.app.sceneId, 'worldMap', 'not from its hand key');
  assert.match(VL.currentPopup(t.game).text, /press M for a map of this place/);
  t.closePopups();
  t.app.setScene('play');
  t.press('equipment');
  t.app.equipment.cursor = VL.equipmentItems(t.game).findIndex((item) => item.id === 'worldMap');
  t.press('interact');
  assert.equal(t.app.sceneId, 'equipment', 'not from the equipment screen');
  t.press('equipment');
  t.closePopups();
  const fresh = setup();
  fresh.at(FIELD);
  readPrimer(fresh.VL, fresh.game);
  give(fresh.VL, fresh.game, { paper: 1, ink: 1 });
  fresh.VL.dungeonOf = () => ({ id: 'testDungeon', area: 'overworld' });
  fresh.wait(0.1);
  assert.equal(fresh.VL.currentPopup(fresh.game), null, 'no "press M" inside a dungeon');
  fresh.VL.dungeonOf = () => null;
  fresh.wait(0.1);
  assert.equal(fresh.VL.currentPopup(fresh.game)?.id, 'mapReady', 'it shows once he is back outside');
});

// The real W13 framework, no stub: the sample dungeon is entered from its
// own yard (not an overworld screen) and its rooms share keys like '0,0'
// and '1,0' with the overworld.
const YARD = { area: 'sampleYard', screen: '0,0', tx: 8, ty: 4, facing: 'up' };
const HALL = { area: 'sample', screen: '0,0', tx: 8, ty: 7, facing: 'up' };

test('in a real dungeon M opens the dungeon map and never the world map, by any path', () => {
  const t = setup({ dungeon: true });
  const { VL } = t;
  t.at(HALL);
  readPrimer(VL, t.game);
  give(VL, t.game, { paper: 1, ink: 1 });
  t.wait(0.1);
  assert.equal(VL.currentPopup(t.game), null, 'no "press M" popup inside');
  // No world map yet, and everything there to draw one: M is still the dungeon's.
  t.press('map');
  assert.equal(t.app.sceneId, 'dungeonMap');
  t.press('map');
  assert.equal(t.app.sceneId, 'play');
  assert.equal(t.app.worldMapView, undefined, 'nothing asked to draw');
  assert.equal(VL.hasItem(t.game, 'worldMap'), false);
  // With the world map in hand: not by M, its hand key or the equipment screen.
  VL.giveItem(t.game, 'worldMap');
  t.closePopups();
  t.press('map');
  assert.equal(t.app.sceneId, 'dungeonMap');
  t.press('map');
  t.press('mainHand');
  assert.notEqual(t.app.sceneId, 'worldMap');
  t.closePopups();
  t.app.setScene('play');
  t.press('equipment');
  t.app.equipment.cursor = VL.equipmentItems(t.game).findIndex((item) => item.id === 'worldMap');
  t.press('interact');
  assert.equal(t.app.sceneId, 'equipment');
  t.press('equipment');
  t.closePopups();
  // Out in the yard (no dungeon) M is the world map again.
  t.at(YARD);
  t.press('map');
  assert.equal(t.app.sceneId, 'worldMap');
});

test('first visits to dungeon rooms fire the room hooks and are kept by a save, but never ink an overworld screen', () => {
  const t = setup({ dungeon: true, storage: true });
  const { VL } = t;
  t.at(FIELD);
  VL.giveItem(t.game, 'worldMap');
  t.closePopups();
  const inks = () => {
    const drawn = [];
    const rect = VL.ART.rect;
    VL.ART.rect = (c, color, ...rest) => {
      drawn.push(`${color}@${rest.join(',')}`);
      return rect(c, color, ...rest);
    };
    t.app.draw(fakeContext(), 0);
    VL.ART.rect = rect;
    return drawn.filter((d) => d.startsWith('map'));
  };
  for (const key of ['0,0', '1,0', '0,-1', '0,-2']) assert.equal(t.game.visited[`overworld:${key}`], undefined, `overworld ${key} is unvisited`);
  t.at(YARD);
  t.press('map');
  const screensBefore = VL.mapView(t.game).screens;
  const before = inks();
  t.press('map');
  // Walk in through the yard door: a real first visit inside a step.
  const savedAt = t.app.savedAt;
  for (let s = 0; s < 3 && t.game.player.area !== 'sample'; s += STEP) t.app.update(VL.actions({ held: ['up'] }), STEP);
  assert.equal(t.game.player.area, 'sample');
  assert.equal(t.game.visited['sample:0,0'], true);
  assert.ok(t.game.room.dungeonReady, 'the room hooks ran as the room was built');
  assert.equal(t.game.room.entities.find((e) => e.type === 'shutter').solid, true, 'its shutter settled before the first step');
  assert.equal(t.app.savedAt, savedAt, 'a first visit saves nothing by itself (W44)');
  for (const key of ['1,0', '0,-1', '0,-2']) {
    t.at({ area: 'sample', screen: key, tx: 8, ty: 8 });
    assert.ok(t.game.room.dungeonReady, `${key} is prepared as it is built, before any step`);
  }
  t.at(YARD);
  assert.deepEqual(plain(VL.mapView(t.game).screens), plain(screensBefore));
  t.press('map');
  assert.equal(t.app.sceneId, 'worldMap');
  assert.deepEqual(inks(), before, 'the drawn map is unchanged by the dungeon rooms');
  // A reload keeps the dungeon visit, and still keeps it off the world map.
  t.reload();
  assert.equal(t.game.visited['sample:0,0'], true);
  assert.deepEqual(plain(VL.mapView(t.game).screens), plain(screensBefore));
});

test("W13's VL.saveTile shows on the drawn world map; a change inside a dungeon does not", () => {
  const t = setup({ dungeon: true });
  const { VL } = t;
  t.at(FIELD);
  VL.giveItem(t.game, 'worldMap');
  t.closePopups();
  const inks = () => {
    const drawn = [];
    const rect = VL.ART.rect;
    VL.ART.rect = (c, color, ...rest) => {
      drawn.push(`${color}@${rest.join(',')}`);
      return rect(c, color, ...rest);
    };
    t.app.draw(fakeContext(), 0);
    VL.ART.rect = rect;
    return drawn.filter((d) => d.startsWith('map'));
  };
  t.game.visited['overworld:0,0'] = true;
  assert.notEqual(VL.getScreen('overworld', '0,0').tiles[5][5], 'W');
  t.press('map');
  const before = inks();
  t.press('map');
  t.at(HALL);
  VL.saveTile(t.game, 5, 5, 'W');
  t.at(FIELD);
  t.press('map');
  assert.deepEqual(inks(), before, "the dungeon room's '0,4' is not the overworld's");
  t.press('map');
  VL.saveTile(t.game, 0, 4, 'W');
  assert.equal(VL.mapTiles(t.game, '1,1')[4][0], 'W');
  t.press('map');
  const after = inks();
  assert.ok(after.filter((d) => d.startsWith('mapWater')).length > before.filter((d) => d.startsWith('mapWater')).length, 'the saved water is inked in');
});

test('region names never cover a mark, the hero or each other, with everything visited and both books read', () => {
  const t = setup();
  const { VL } = t;
  for (const key of Object.keys(VL.AREAS.overworld.screens)) t.game.visited[`overworld:${key}`] = true;
  for (const book of ['bookHerbalist', 'bookSmithsLedger']) {
    t.game.library.returned.push(book);
    t.game.library.read.push(book);
  }
  const { cols, rows } = VL.TUNING;
  const bounds = VL.mapBounds();
  const at = (key, tx, ty) => {
    const [x, y] = key.split(',').map(Number);
    return { x: (x - bounds.minX) * cols + tx, y: (y - bounds.minY) * rows + ty };
  };
  const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const marks = VL.mapView(t.game).marks;
  assert.ok(marks.some((m) => m.kind === 'ore') && marks.some((m) => m.kind === 'berries'));
  const markRects = marks.map((m) => {
    const sprite = VL.ART.sprite(m.kind === 'ore' ? 'icon-ore' : 'icon-berry');
    const p = at(m.screen, m.tx, m.ty);
    return { x: p.x - Math.floor(sprite.w / 2), y: p.y - Math.floor(sprite.h / 2), w: sprite.w, h: sprite.h };
  });
  // The hero stands where a plate would most like to go on every screen in turn.
  for (const screen of Object.keys(VL.AREAS.overworld.screens)) {
    t.at({ area: 'overworld', screen, tx: 8, ty: 4 });
    const { labels, hero } = VL.mapView(t.game);
    assert.ok(labels.length >= 8, labels.map((l) => l.name).join());
    const p = at(hero.screen, hero.tx, hero.ty);
    const heroRect = { x: p.x - 2, y: p.y - 2, w: 5, h: 5 };
    labels.forEach((label, i) => {
      for (const mark of markRects) assert.ok(!hit(label, mark), `${label.name} covers a mark (hero on ${screen})`);
      assert.ok(!hit(label, heroRect), `${label.name} covers the hero on ${screen}`);
      for (const other of labels.slice(i + 1)) assert.ok(!hit(label, other), `${label.name} covers ${other.name}`);
      assert.ok(label.w >= VL.ART.measureText(label.name, 'small'), label.name);
    });
  }
});

test('the drawn map shows saved tile changes (VL.saveTile) and redraws when they change', () => {
  const t = setup();
  const { VL } = t;
  t.at(FIELD);
  VL.giveItem(t.game, 'worldMap');
  t.closePopups();
  const inks = () => {
    const drawn = [];
    const rect = VL.ART.rect;
    VL.ART.rect = (c, color, ...rest) => {
      drawn.push(`${color}@${rest.join(',')}`);
      return rect(c, color, ...rest);
    };
    t.app.draw(fakeContext(), 0);
    VL.ART.rect = rect;
    return drawn.filter((d) => d.startsWith('map'));
  };
  t.press('map');
  const before = inks();
  assert.equal(VL.mapTiles(t.game, '1,1')[4][0], '.');
  t.game.tileChanges = { 'overworld:1,1': { '0,4': 'W' } };
  assert.equal(VL.mapTiles(t.game, '1,1')[4][0], 'W');
  assert.equal(VL.getScreen('overworld', '1,1').tiles[4][0], '.', 'the screen itself is untouched');
  const after = inks();
  assert.notDeepEqual(after, before);
  assert.ok(after.filter((d) => d.startsWith('mapWater')).length > before.filter((d) => d.startsWith('mapWater')).length);
  t.game.tileChanges = {};
  assert.deepEqual(inks(), before, 'and back again when the change goes');
});

test('M does nothing in the middle of a screen slide or once the hero has fainted', () => {
  const t = setup();
  const { VL } = t;
  t.at(FIELD);
  VL.giveItem(t.game, 'worldMap');
  t.closePopups();
  t.game.transition = { dir: 'up', t: 0, duration: 1, from: { area: 'overworld', screen: '1,0', room: t.game.room } };
  t.press('map');
  assert.equal(t.app.sceneId, 'play');
  t.game.transition = null;
  t.game.hp = 0;
  t.step();
  assert.equal(t.app.sceneId, 'fainted');
});

// ---------- progression, saving, art, docs ----------

test('W12 claims ink, worldMap and woodsMapCopy with the planned rules', () => {
  const { VL } = loadGame();
  for (const id of ['ink', 'worldMap', 'woodsMapCopy']) {
    assert.ok(VL.LOCKS[id].reached, `${id} is claimed`);
  }
  const game = VL.newGame();
  assert.equal(VL.LOCKS.ink.reached(game), false);
  game.flags.madeInk = true;
  game.inventory.ink = 0;
  assert.ok(VL.LOCKS.ink.reached(game), 'ink marks the source, not the stock');
  assert.ok(VL.LOCKS.shockwave.loses.includes('worldMap'), 'the shockwave takes the map (W16 calls VL.loseWorldMap)');
});

test('the W12 save fixture loads with its map, copy, tool, ink and visits kept', () => {
  const { VL } = loadGame();
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v1-W12.json'), 'utf8'));
  const storage = VL.createStorage(memoryStorage({ [VL.slotKey(0)]: JSON.stringify(fixture) }));
  const slot = VL.readSlot(storage, 0);
  assert.deepEqual(plain(slot.resets || []), []);
  const game = VL.loadSlot(storage, 0);
  for (const id of ['worldMap', 'woodsMapCopy', 'mortarPestle']) assert.ok(VL.hasItem(game, id), id);
  assert.equal(game.inventory.ink, fixture.inventory.ink);
  assert.ok(game.inventory.ink > 0 && game.flags.madeInk);
  assert.deepEqual(plain(game.visited), fixture.visited);
  assert.ok(Object.keys(fixture.visited).length > 5);
  assert.deepEqual(plain(VL.mapView(game).screens).sort(), Object.keys(fixture.visited).filter((k) => k.startsWith('overworld:')).map((k) => k.slice(10)).sort());
});

test('W12 art and sounds: every sprite it draws exists and every sound it plays is defined', () => {
  const { VL } = loadGame();
  for (const id of ['item-mortar', 'item-world-map', 'item-woods-map', 'icon-ink', 'icon-paper', 'prop-mural', 'prop-tablet']) assert.ok(VL.ART.SPRITES[id], id);
  for (const name of ['pestleGrind', 'penScratch', 'mapUnfold']) assert.equal(typeof VL.sfx(name), 'boolean', name);
  for (const id of ['mortarPestle', 'worldMap', 'woodsMapCopy', 'mapReady']) {
    const popup = VL.POPUPS[id];
    assert.ok(popup, id);
    assert.equal(VL.ART.popupLayout(popup).overflow, false, `${id} fits a popup`);
    assert.deepEqual(plain(VL.ART.missingGlyphs(popup.text)), [], id);
  }
});

test('README documents paper and ink', () => {
  const readme = read('README.md');
  for (const word of ['## Paper and ink (W12)', 'VL.loseWorldMap', 'VL.defineCopy', 'copyable', 'VL.mapView', 'VL.inDungeon', 'save-v1-W12.json', 'mortarPestle']) {
    assert.ok(readme.includes(word), `README mentions ${word}`);
  }
});
