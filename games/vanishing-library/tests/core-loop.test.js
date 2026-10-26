// W5, the core overworld loop: the hut chest, bushes and their drops, bare
// hands, berry bushes, beach shells, the first ore lump, popups shown once,
// the equipment screen and signs (design: Resources and economy, Controls,
// Everything on the canvas, The path through the game 1).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, read, loadGame, playApp, memoryStorage } = require('./harness');

const STEP = 1 / 60;
const plain = (value) => JSON.parse(JSON.stringify(value));

// Two screens the tests own: bushes and a berry bush on 0,0, open ground on 1,0.
function addGrove(VL) {
  VL.addScreens('grove', {
    '0,0': {
      tiles: [
        'TTTTTTTTTTTTTTTT',
        'T..............T',
        'T..B...Y.......T',
        'T..............T',
        'T...BB..........',
        'T...............',
        'T...............',
        'T..............T',
        'T..............T',
        'T..............T',
        'TTTTTTTTTTTTTTTT',
      ],
      entities: [],
    },
    '1,0': {
      tiles: [
        'TTTTTTTTTTTTTTTT',
        'T..............T',
        'T..............T',
        'T..............T',
        '...............T',
        '...............T',
        '...............T',
        'T..............T',
        'T..............T',
        'T..............T',
        'TTTTTTTTTTTTTTTT',
      ],
      entities: [],
    },
  });
}

function setup({ storage = false } = {}) {
  const context = loadGame();
  const { VL } = context;
  addGrove(VL);
  const sounds = [];
  VL.sfx = (name) => {
    sounds.push(name);
    return true;
  };
  let app;
  if (storage) {
    app = VL.createApp({ storage: VL.createStorage(memoryStorage()) });
    app.startGame(VL.newGame({ name: 'Robin' }), 0, { fresh: true });
    app.save();
    app.setScene('play');
  } else {
    app = playApp(VL);
  }
  const at = (where) => VL.place(app.game, { area: 'grove', screen: '0,0', ...where });
  const step = (actions = VL.noActions()) => app.update(actions, STEP);
  const press = (action) => step(VL.actions({ pressed: [action] }));
  const hold = (held, seconds) => {
    for (let t = 0; t < seconds - 1e-9; t += STEP) step(VL.actions({ held }));
  };
  // Closes every popup that is up, the way a player would (S).
  const closePopups = () => {
    for (let i = 0; i < 20 && VL.currentPopup(app.game); i += 1) {
      if (app.sceneId === 'play') step();
      hold([], 0.5);
      press('interact');
    }
    if (app.sceneId === 'popup') step();
  };
  return { VL, context, app, sounds, at, step, press, hold, closePopups, get game() { return app.game; } };
}

const entitiesOf = (game, type) => game.room.entities.filter((e) => e.type === type);

// ---------- saved state ----------

test('a new game has an empty inventory, no items, empty hands and no popups seen', () => {
  const { VL } = loadGame();
  const game = VL.newGame();
  assert.deepEqual(plain(game.inventory), { wood: 0, shells: 0, brokenShells: 0, berries: 0, ore: 0, paper: 0, ink: 0 });
  assert.deepEqual(plain(game.items), {});
  assert.deepEqual(plain(game.hands), { mainHand: null, offHand: null });
  assert.deepEqual(plain(game.popups), { seen: {}, queue: [] });
  assert.ok(VL.TRANSIENT_FIELDS.includes('message'), 'a sign\'s text is never saved');
});

test('the W5 fixture loads with every field intact', () => {
  const { VL } = loadGame();
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v1-W5.json'), 'utf8'));
  for (const field of ['inventory', 'items', 'hands', 'popups']) assert.ok(field in fixture, field);
  const storage = VL.createStorage(memoryStorage());
  storage.write(VL.slotKey(0), JSON.stringify(fixture));
  const read = VL.readSlot(storage, 0);
  assert.deepEqual([...read.resets], []);
  const game = VL.loadSlot(storage, 0);
  assert.equal(game.inventory.wood, fixture.inventory.wood);
  assert.ok(game.inventory.wood > 0 && game.items.woodSword && game.hands.mainHand === 'woodSword');
  assert.deepEqual(plain(game.popups), fixture.popups);
});

test('a save naming a popup or item a later version removed still loads and plays (R2)', () => {
  const t = setup({ storage: true });
  const { VL } = t;
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v1-W5.json'), 'utf8'));
  fixture.popups.queue = ['retiredPopup', 'wood', 'alsoRetired'];
  fixture.popups.seen.oldPopup = true;
  fixture.items.retiredSword = true;
  fixture.hands = { mainHand: 'retiredSword', offHand: 'woodShield' };
  t.app.storage.write(VL.slotKey(0), JSON.stringify(fixture));
  const app = VL.reloadApp(t.app);
  const step = (actions = VL.noActions()) => app.update(actions, STEP);
  assert.doesNotThrow(() => step());
  assert.equal(app.sceneId, 'popup');
  assert.equal(VL.currentPopup(app.game).id, 'wood', 'the unknown popup is skipped, not shown');
  assert.equal(app.game.popups.seen.retiredPopup, undefined, 'skipped, not marked seen');
  for (let i = 0; i < 30; i += 1) step();
  step(VL.actions({ pressed: ['interact'] }));
  assert.equal(app.game.popups.seen.wood, true);
  assert.doesNotThrow(() => step());
  assert.equal(VL.currentPopup(app.game), null, 'an unknown id at the end of the queue is dropped too');
  assert.equal(app.sceneId, 'play');
  assert.equal(VL.heldItem(app.game, 'mainHand'), null, 'a hand naming a removed item counts as empty');
  assert.equal(VL.ART.hudModel(app.game).mainHand, null);
  assert.equal(VL.hasItem(app.game, 'retiredSword'), false);
  assert.deepEqual(plain(VL.equipmentItems(app.game).map((item) => item.id)), ['woodSword', 'woodShield', 'berry']);
  const ctx = t.context.document.createElement('canvas').getContext('2d');
  step(VL.actions({ pressed: ['equipment'] }));
  assert.equal(app.sceneId, 'equipment');
  assert.doesNotThrow(() => VL.render(ctx, app, 0));
});

test('a hand only ever holds what the hero has: berries leaving by any path empty it (M2)', () => {
  const t = setup();
  const { VL } = t;
  t.game.inventory.berries = 2;
  VL.setHand(t.game, 'mainHand', 'berry');
  assert.equal(VL.heldItem(t.game, 'mainHand'), 'berry');
  VL.addResource(t.game, 'berries', -2);
  assert.equal(VL.heldItem(t.game, 'mainHand'), null);
  assert.equal(t.game.hands.mainHand, null, 'the saved hand is emptied too');
  assert.equal(VL.ART.hudModel(t.game).mainHand, null);
  // A path that changes the count directly (a later shop or shockwave) still
  // never shows or uses a berry the hero no longer has.
  t.game.inventory.berries = 1;
  VL.setHand(t.game, 'offHand', 'berry');
  t.game.inventory.berries = 0;
  assert.equal(VL.heldItem(t.game, 'offHand'), null);
  assert.equal(VL.ART.hudModel(t.game).offHand, null);
});

// ---------- the hut chest ----------

test('the hut chest holds the wood sword and shield: S opens it once, both go in hand, and it stays open', () => {
  const t = setup();
  const { VL } = t;
  const hut = VL.AREAS.hut.screens['0,0'];
  const chest = hut.entities.find((e) => e.type === 'chest');
  assert.ok(chest, 'a chest in the hut');
  VL.place(t.game, { area: 'hut', screen: '0,0', tx: chest.x, ty: chest.y + 1, facing: 'up' });
  t.press('interact');
  assert.ok(t.game.events.some((e) => e.type === 'earned'));
  assert.equal(VL.hasItem(t.game, 'woodSword'), true);
  assert.equal(VL.hasItem(t.game, 'woodShield'), true);
  assert.deepEqual(plain(t.game.hands), { mainHand: 'woodSword', offHand: 'woodShield' });
  assert.ok(VL.LOCKS.chestGear.reached(t.game), 'the chestGear milestone');
  assert.ok(t.sounds.includes('pickup'));
  assert.equal(entitiesOf(t.game, 'chest')[0].opened, true);
  assert.deepEqual(plain(t.game.popups.queue), ['woodSword', 'woodShield']);
  t.closePopups();
  assert.equal(t.app.sceneId, 'play');
  t.press('interact');
  assert.equal(t.game.popups.queue.length, 0, 'an open chest gives nothing more');
  VL.place(t.game, { area: 'hut', screen: '0,0', tx: 7, ty: 5 });
  assert.equal(entitiesOf(t.game, 'chest')[0].opened, true, 'still open on the next visit');
});

test('S reaches what the hero half faces, like the swing, but pulls only one bush (M6)', () => {
  const t = setup();
  const { VL } = t;
  const chest = VL.AREAS.hut.screens['0,0'].entities.find((e) => e.type === 'chest');
  VL.place(t.game, { area: 'hut', screen: '0,0', tx: chest.x, ty: chest.y + 1, facing: 'up' });
  t.game.player.x += 9;
  assert.notEqual(VL.facingTile(t.game).tx, chest.x, 'straight ahead is the next tile over');
  t.press('interact');
  assert.equal(VL.hasItem(t.game, 'woodSword'), true, 'the chest still opens');
  t.closePopups();
  // Grove row 4 has bushes at 4 and 5: straddling them from below, S pulls one.
  const t2 = setup();
  t2.at({ tx: 4, ty: 5, facing: 'up' });
  t2.game.player.x += 8;
  const hp = t2.game.hp;
  t2.press('interact');
  assert.equal(t2.game.hp, hp - t2.VL.TUNING.pullCost, 'one bush, one half heart');
  const bushes = [4, 5].filter((tx) => t2.VL.tileAt('grove', '0,0', tx, 4, t2.game.room) === 'B');
  assert.equal(bushes.length, 1, 'the other bush is still there');
});

test('the chest and a sign are solid', () => {
  const t = setup();
  const { VL } = t;
  const chest = VL.AREAS.hut.screens['0,0'].entities.find((e) => e.type === 'chest');
  VL.place(t.game, { area: 'hut', screen: '0,0', tx: chest.x, ty: chest.y + 1, facing: 'up' });
  t.hold(['up'], 0.5);
  assert.equal(VL.heroTile(t.game).ty, chest.y + 1, 'the hero stops below the chest');
  assert.equal(VL.isSolidAt('hut', '0,0', chest.x, chest.y, t.game.room), true);
  assert.equal(VL.isSolidAt('hut', '0,0', chest.x, chest.y), false, 'the tile itself is floor');
});

// ---------- bushes ----------

test('a bush drops a heart 2%, a whole shell 5% and wood 50% of the time (W29), otherwise nothing', () => {
  const { VL } = loadGame();
  assert.equal(VL.bushDrop(0), 'heart');
  assert.equal(VL.bushDrop(0.019), 'heart');
  assert.equal(VL.bushDrop(0.02), 'shell');
  assert.equal(VL.bushDrop(0.069), 'shell');
  assert.equal(VL.bushDrop(0.07), 'wood');
  assert.equal(VL.bushDrop(0.569), 'wood');
  assert.equal(VL.bushDrop(0.571), null);
  const state = { rngState: 7 };
  const counts = { heart: 0, shell: 0, wood: 0, null: 0 };
  const rolls = 40000;
  for (let i = 0; i < rolls; i += 1) counts[VL.bushDrop(VL.random(state))] += 1;
  assert.ok(Math.abs(counts.heart / rolls - 0.02) < 0.004, `hearts ${counts.heart}`);
  assert.ok(Math.abs(counts.shell / rolls - 0.05) < 0.006, `shells ${counts.shell}`);
  assert.ok(Math.abs(counts.wood / rolls - 0.5) < 0.01, `wood ${counts.wood}`);
});

test('the sword cuts the bush in front: it opens for this visit, rolls a drop, and regrows when you come back', () => {
  const t = setup();
  const { VL } = t;
  VL.giveItem(t.game, 'woodSword');
  t.closePopups();
  t.at({ tx: 4, ty: 3, facing: 'down' });
  t.game.rngState = 0;
  const roll = VL.random({ rngState: 0 });
  t.press('mainHand');
  assert.ok(t.sounds.includes('swing'));
  assert.ok(t.game.player.swing, 'the swing is under way');
  assert.equal(VL.isSolidAt('grove', '0,0', 4, 4, t.game.room), false, 'the bush is gone');
  assert.equal(VL.isSolidAt('grove', '0,0', 5, 4, t.game.room), true, 'its neighbour stands');
  assert.ok(VL.LOCKS.bushCut.reached(t.game));
  const drops = entitiesOf(t.game, 'drop');
  const expected = VL.bushDrop(roll);
  assert.deepEqual(plain(drops.map((d) => d.kind)), expected ? [expected] : []);
  assert.ok(entitiesOf(t.game, 'leaves').length, 'leaves fly');
  // Down through the gap (a drop there opens its popup), then off the east edge.
  t.hold(['down'], 0.45);
  t.closePopups();
  t.hold(['down'], 0.45);
  assert.ok(VL.heroTile(t.game).ty >= 5, 'below the bushes');
  t.hold(['right'], 4.8);
  assert.equal(t.game.player.screen, '1,0');
  t.hold(['left'], 4.8);
  assert.equal(t.game.player.screen, '0,0');
  assert.equal(VL.isSolidAt('grove', '0,0', 4, 4, t.game.room), true, 'the bush grew back');
});

test('the sword bounces off a berry bush', () => {
  const t = setup();
  const { VL } = t;
  VL.giveItem(t.game, 'woodSword');
  t.closePopups();
  t.at({ tx: 7, ty: 3, facing: 'up' });
  t.press('mainHand');
  assert.equal(VL.isSolidAt('grove', '0,0', 7, 2, t.game.room), true);
  assert.equal(VL.tileAt('grove', '0,0', 7, 2, t.game.room), 'Y', 'still full of berries');
  assert.ok(t.sounds.includes('tink'));
});

test('bare hands: S or Space pulls a bush for the same drops at half a heart each', () => {
  const t = setup();
  const { VL } = t;
  t.at({ tx: 3, ty: 3, facing: 'up' });
  const hp = t.game.hp;
  t.press('interact');
  assert.equal(t.game.hp, hp - 1, 'half a heart');
  assert.equal(VL.isSolidAt('grove', '0,0', 3, 2, t.game.room), false);
  assert.ok(t.sounds.includes('hurt'));
  assert.ok(VL.LOCKS.bushBareHands.reached(t.game));
  assert.deepEqual(plain(t.game.popups.queue), ['pull'], 'the first pull explains itself');
  t.closePopups();
  t.at({ tx: 4, ty: 5, facing: 'up' });
  t.press('mainHand');
  assert.equal(t.game.hp, hp - 2, 'Space pulls too while the main hand is empty');
  assert.equal(t.game.popups.queue.length, 0, 'the pull popup is shown once');
});

test('a shrub can win: pulling on the last half heart faints you, and you wake with everything', () => {
  const t = setup();
  const { VL } = t;
  t.game.inventory.wood = 3;
  t.at({ tx: 3, ty: 3, facing: 'up' });
  t.game.hp = 1;
  t.game.popups.seen.pull = true;
  t.press('interact');
  assert.equal(t.game.hp, 0);
  assert.equal(t.game.fainted.cause, 'shrub');
  assert.equal(t.app.sceneId, 'fainted');
  assert.ok(t.sounds.includes('faint'), 'fainting is heard');
  assert.match(VL.faintLine('shrub'), /shrub/);
  t.hold([], 1);
  t.press('interact');
  assert.equal(t.app.sceneId, 'play');
  assert.equal(t.game.hp, t.game.maxHp);
  assert.ok(t.game.inventory.wood >= 3);
});

test('with a sword in hand S does not pull a bush (no free hurt)', () => {
  const t = setup();
  const { VL } = t;
  VL.giveItem(t.game, 'woodSword');
  t.closePopups();
  t.at({ tx: 3, ty: 3, facing: 'up' });
  const hp = t.game.hp;
  t.press('interact');
  assert.equal(t.game.hp, hp);
  assert.equal(VL.isSolidAt('grove', '0,0', 3, 2, t.game.room), true);
});

// ---------- drops ----------

test('walking onto a drop picks it up: wood and shells are earned, a heart heals', () => {
  const t = setup();
  const { VL } = t;
  t.at({ tx: 8, ty: 6 });
  const drop = (kind, tx) => t.game.room.entities.push({ type: 'drop', kind, x: tx, y: 6, born: t.game.time });
  drop('wood', 9);
  drop('shell', 10);
  drop('heart', 11);
  t.game.hp = 2;
  t.hold(['right'], 0.45);
  assert.equal(t.game.inventory.wood, 1);
  assert.deepEqual(plain(t.game.popups.queue), ['wood']);
  assert.ok(t.sounds.includes('pickup'));
  t.closePopups();
  t.hold(['right'], 0.4);
  t.closePopups();
  t.hold(['right'], 0.4);
  t.closePopups();
  assert.equal(t.game.inventory.shells, 1);
  assert.ok(t.sounds.includes('shell'));
  assert.equal(VL.TUNING.heartDropHeal, 2, 'a heart drop heals one heart (two halves), tuned in one place');
  assert.equal(t.game.hp, 4, 'a heart is two half hearts');
  assert.equal(entitiesOf(t.game, 'drop').length, 0);
  drop('wood', 13);
  t.hold(['right'], 0.9);
  t.closePopups();
  assert.equal(t.game.inventory.wood, 2);
  assert.ok(!t.game.popups.queue.includes('wood'), 'the wood popup is shown once');
});

test('a heart never heals past full, and drops fade after a while', () => {
  const t = setup();
  const { VL } = t;
  t.at({ tx: 8, ty: 6 });
  t.game.room.entities.push({ type: 'drop', kind: 'heart', x: 9, y: 6, born: t.game.time });
  t.hold(['right'], 0.3);
  assert.equal(t.game.hp, t.game.maxHp);
  t.game.room.entities.push({ type: 'drop', kind: 'wood', x: 2, y: 8, born: t.game.time });
  t.hold([], VL.TUNING.dropSeconds + 0.2);
  assert.equal(entitiesOf(t.game, 'drop').length, 0);
});

// ---------- berries ----------

test('a berry bush: S picks its berries, it stays bare until you come back, and the sword never cuts it', () => {
  const t = setup();
  const { VL } = t;
  assert.equal(VL.LOCKS.berryBush.reached(t.game), false);
  t.at({ tx: 7, ty: 3, facing: 'up' });
  assert.equal(VL.LOCKS.berryBush.reached(t.game), true, 'seeing one is the place');
  t.press('interact');
  assert.equal(t.game.inventory.berries, VL.TUNING.berriesPerPick);
  assert.ok(t.game.events.some((e) => e.type === 'earned'), 'berries are earned');
  assert.ok(VL.LOCKS.berries.reached(t.game));
  assert.deepEqual(plain(t.game.popups.queue), ['berries']);
  assert.equal(t.game.hp, t.game.maxHp, 'picking never hurts');
  t.closePopups();
  t.press('interact');
  assert.equal(t.game.inventory.berries, VL.TUNING.berriesPerPick, 'nothing left to pick');
  assert.equal(VL.tileAt('grove', '0,0', 7, 2, t.game.room), 'u', 'a bare bush');
  t.hold(['down'], 0.4);
  t.hold(['right'], 2.5);
  t.hold(['left'], 2.5);
  t.at({ tx: 7, ty: 3, facing: 'up' });
  t.press('interact');
  assert.equal(t.game.inventory.berries, VL.TUNING.berriesPerPick * 2, 'they grew back');
});

test('eating a berry heals one heart; at full hearts nothing is eaten', () => {
  const t = setup();
  const { VL } = t;
  t.game.inventory.berries = 2;
  VL.setHand(t.game, 'mainHand', 'berry');
  t.at({ tx: 8, ty: 6 });
  t.press('mainHand');
  assert.equal(t.game.inventory.berries, 2, 'full hearts: kept');
  t.game.hp = 1;
  t.press('mainHand');
  assert.equal(t.game.hp, 3);
  assert.equal(t.game.inventory.berries, 1);
  assert.ok(t.sounds.includes('munch'));
  t.game.hp = 1;
  t.press('mainHand');
  assert.equal(t.game.inventory.berries, 0);
  assert.equal(t.game.hands.mainHand, null, 'the last berry empties the hand');
});

// ---------- the beach ----------

test('broken shells on the beach are picked up by walking over them and wash up again', () => {
  const t = setup();
  const { VL } = t;
  const screen = VL.AREAS.grove.screens['0,0'];
  screen.entities.push({ type: 'shell', x: 9, y: 6 });
  t.at({ tx: 8, ty: 6 });
  t.hold(['right'], 0.3);
  assert.equal(t.game.inventory.brokenShells, 1);
  assert.equal(t.game.inventory.shells, 0, 'broken shells are not money');
  assert.ok(VL.LOCKS.beachBrokenShells.reached(t.game));
  assert.deepEqual(plain(t.game.popups.queue), ['brokenShell']);
  t.closePopups();
  assert.equal(entitiesOf(t.game, 'shell').length, 0);
  t.at({ tx: 8, ty: 6 });
  assert.equal(entitiesOf(t.game, 'shell').length, 1, 'washed up again');
});

test('a whole shell with an id is found once', () => {
  const t = setup();
  const { VL } = t;
  VL.AREAS.grove.screens['0,0'].entities.push({ type: 'shell', whole: true, id: 'groveShell', x: 9, y: 6 });
  t.at({ tx: 8, ty: 6 });
  t.hold(['right'], 0.3);
  assert.equal(t.game.inventory.shells, 1);
  t.closePopups();
  t.at({ tx: 8, ty: 6 });
  assert.equal(entitiesOf(t.game, 'shell').length, 0);
});

test('the first ore lump glints in the shallows by the hut and is picked up once', () => {
  const t = setup();
  const { VL } = t;
  const lump = VL.AREAS.overworld.screens['1,1'].entities.find((e) => e.type === 'ore');
  assert.ok(lump, 'an ore lump on the hut screen');
  assert.equal(lump.id, 'oreShallows');
  assert.ok(VL.tileInfo('overworld', VL.tileAt('overworld', '1,1', lump.x, lump.y)).shallow, 'in the shallows');
  VL.place(t.game, { area: 'overworld', screen: '1,1', tx: lump.x - 1, ty: lump.y });
  t.hold(['right'], 0.3);
  assert.equal(t.game.inventory.ore, 1);
  assert.ok(VL.LOCKS.oreShallows.reached(t.game));
  assert.deepEqual(plain(t.game.popups.queue), ['ore']);
  VL.place(t.game, { area: 'overworld', screen: '1,1', tx: 8, ty: 5 });
  assert.equal(entitiesOf(t.game, 'ore').length, 0, 'taken for good');
});

test('a second lump hides in the Woods dead end, off the true path, without the water', () => {
  const t = setup();
  const { VL } = t;
  const spot = VL.SPOTS.oreWoods;
  const lump = VL.getScreen(spot.area, spot.screen).entities.find((e) => e.type === 'ore');
  assert.deepEqual([lump.id, lump.x, lump.y, Boolean(lump.wet)], ['oreWoods', spot.x, spot.y, false]);
  VL.place(t.game, { area: spot.area, screen: spot.screen, tx: spot.x - 1, ty: spot.y });
  t.hold(['right'], 0.3);
  assert.equal(t.game.inventory.ore, 1);
  assert.ok(VL.LOCKS.oreWoods.reached(t.game));
  assert.equal(VL.LOCKS.oreShallows.reached(t.game), false, 'each lump is its own find');
});

// ---------- popups ----------

test('popups: shown once each, over a paused world, and a queued one survives a reload', () => {
  const t = setup({ storage: true });
  const { VL } = t;
  VL.showPopup(t.game, 'wood');
  VL.showPopup(t.game, 'wood');
  assert.deepEqual(plain(t.game.popups.queue), ['wood'], 'queued once');
  t.step();
  assert.equal(t.app.sceneId, 'popup');
  const where = { ...t.game.player };
  t.hold(['left'], 0.3);
  assert.equal(t.game.player.x, where.x, 'the world is paused under a popup');
  const next = VL.reloadApp(t.app);
  assert.deepEqual(plain(next.game.popups.queue), ['wood'], 'still waiting after a reload');
  t.press('interact');
  assert.equal(t.app.sceneId, 'play');
  assert.equal(t.game.popups.seen.wood, true);
  VL.showPopup(t.game, 'wood');
  assert.equal(t.game.popups.queue.length, 0, 'never again');
  const after = VL.reloadApp(t.app);
  assert.equal(after.game.popups.seen.wood, true, 'seen is saved');
});

test('the controls popup comes once at the start, teaching the arrows, E and S but not Space', () => {
  const { VL } = loadGame();
  const app = VL.createApp({ storage: VL.createStorage(memoryStorage()) });
  app.update(VL.actions({ pressed: ['confirm'] }), STEP);
  app.update(VL.actions({ typed: 'Robin' }), STEP);
  app.update(VL.actions({ pressed: ['confirm'] }), STEP);
  assert.equal(app.sceneId, 'intro');
  for (let t = 0; t < 1; t += STEP) app.update(VL.noActions(), STEP);
  app.update(VL.actions({ pressed: ['interact'] }), STEP);
  app.update(VL.noActions(), STEP);
  assert.equal(app.sceneId, 'popup');
  const popup = VL.currentPopup(app.game);
  assert.equal(popup.id, 'controls');
  assert.match(popup.text, /←/);
  assert.match(popup.text, /\bE\b/);
  assert.match(popup.text, /\bS\b/);
  assert.doesNotMatch(popup.text, /Space|␣/);
});

test('a sign shows its words every time S is pressed facing it, and is never saved', () => {
  const t = setup();
  const { VL } = t;
  VL.AREAS.grove.screens['0,0'].entities.push({ type: 'sign', x: 10, y: 5, text: 'Bushes grow back.' });
  t.at({ tx: 10, ty: 6, facing: 'up' });
  t.hold(['up'], 0.3);
  assert.equal(VL.heroTile(t.game).ty, 6, 'a sign is solid');
  for (let i = 0; i < 2; i += 1) {
    t.press('interact');
    t.step();
    assert.equal(t.app.sceneId, 'popup');
    assert.equal(VL.currentPopup(t.game).text, 'Bushes grow back.');
    t.closePopups();
    assert.equal(t.app.sceneId, 'play');
  }
  assert.equal(t.game.popups.queue.length, 0);
  assert.equal('message' in VL.serializeSave(t.game), false);
});

test('every popup and sign fits its box and uses only letters the font has', () => {
  const { VL } = loadGame();
  for (const [id, popup] of Object.entries(VL.POPUPS)) {
    const text = VL.popupText(popup.text, { name: 'Bartholomewww' });
    const layout = VL.ART.popupLayout({ title: popup.title, text });
    assert.equal(layout.overflow, false, `popup ${id} is too long`);
    assert.deepEqual([...VL.ART.missingGlyphs(text + VL.popupText(popup.title, { name: 'Robin' }))], [], id);
  }
  for (const area of Object.values(VL.AREAS)) {
    for (const screen of Object.values(area.screens)) {
      for (const sign of screen.entities.filter((e) => e.type === 'sign')) {
        assert.equal(VL.ART.popupLayout({ title: sign.title, text: sign.text }).overflow, false, sign.text);
        assert.deepEqual([...VL.ART.missingGlyphs(sign.text + (sign.title || ''))], [], sign.text);
      }
    }
  }
});

// ---------- the equipment screen ----------

test('E opens the equipment screen: Space and D choose the hands, S eats a berry, E goes back', () => {
  const t = setup();
  const { VL } = t;
  VL.giveItem(t.game, 'woodSword');
  VL.giveItem(t.game, 'woodShield');
  t.game.inventory.berries = 1;
  t.closePopups();
  t.press('equipment');
  assert.equal(t.app.sceneId, 'equipment');
  const ids = () => plain(VL.equipmentItems(t.game).map((item) => item.id));
  assert.deepEqual(ids(), ['woodSword', 'woodShield', 'berry']);
  t.press('offHand');
  assert.deepEqual(plain(t.game.hands), { mainHand: null, offHand: 'woodSword' }, 'the sword moves to the off hand');
  t.press('right');
  t.press('mainHand');
  assert.deepEqual(plain(t.game.hands), { mainHand: 'woodShield', offHand: 'woodSword' });
  t.press('right');
  t.game.hp = 2;
  t.press('interact');
  assert.equal(t.game.hp, 4);
  assert.equal(t.game.inventory.berries, 0);
  assert.deepEqual(ids(), ['woodSword', 'woodShield']);
  const where = t.game.player.x;
  t.hold(['left'], 0.2);
  assert.equal(t.game.player.x, where, 'the world waits');
  t.press('equipment');
  assert.equal(t.app.sceneId, 'play');
  assert.equal(VL.ART.hudModel(t.game).mainHand, VL.ITEMS.woodShield.icon);
});

test('the equipment grid scrolls when the hero carries more than fits (M5)', () => {
  const t = setup();
  const { VL, context } = t;
  for (let i = 0; i < 10; i += 1) VL.defineItem(`testThing${i}`, { name: `Thing ${i}`, icon: i === 9 ? 'test-last' : 'sword-wood', about: 'A test thing.' });
  VL.ART.defineSprite('item-test-last', { colors: { g: 'gold' }, rows: ['gg', 'gg'] });
  VL.giveItem(t.game, 'woodSword');
  VL.giveItem(t.game, 'woodShield');
  for (let i = 0; i < 10; i += 1) VL.giveItem(t.game, `testThing${i}`);
  t.closePopups();
  assert.equal(VL.equipmentItems(t.game).length, 12);
  const drawn = [];
  const original = VL.ART.drawSprite;
  VL.ART.drawSprite = (ctx, id, ...rest) => {
    drawn.push(id);
    return original(ctx, id, ...rest);
  };
  const ctx = context.document.createElement('canvas').getContext('2d');
  t.press('equipment');
  VL.render(ctx, t.app, 0);
  assert.ok(!drawn.includes('item-test-last'), 'the twelfth item is below the visible rows at first');
  t.press('down');
  t.press('down');
  t.press('right');
  t.press('right');
  t.press('right');
  assert.equal(t.app.equipment.cursor, 11);
  drawn.length = 0;
  VL.render(ctx, t.app, 0);
  assert.ok(drawn.includes('item-test-last'), 'the grid scrolled to show the chosen item');
  t.press('mainHand');
  assert.equal(t.game.hands.mainHand, 'testThing9');
  t.press('mainHand');
  assert.equal(t.game.hands.mainHand, null, 'choosing it again empties the hand');
  t.press('up');
  t.press('up');
  drawn.length = 0;
  VL.render(ctx, t.app, 0);
  assert.ok(!drawn.includes('item-test-last'), 'and back up again');
  VL.ART.drawSprite = original;
});

test('a hand holding nothing it can use does nothing, and the shield is raised while D is held', () => {
  const t = setup();
  const { VL } = t;
  VL.giveItem(t.game, 'woodShield');
  t.closePopups();
  t.at({ tx: 8, ty: 6 });
  t.hold(['offHand'], 0.1);
  assert.equal(t.game.player.shield, true);
  t.step();
  assert.equal(t.game.player.shield, false);
});

// ---------- drawing ----------

test('render smoke: chest, drops, shells, ore, sign, swing, shield, popups and the equipment screen draw', () => {
  const t = setup();
  const { VL, context } = t;
  const ctx = context.document.createElement('canvas').getContext('2d');
  VL.AREAS.grove.screens['0,0'].entities.push(
    { type: 'chest', id: 'groveChest', x: 12, y: 2, contents: [{ resource: 'shells', amount: 5 }] },
    { type: 'sign', x: 12, y: 6, text: 'Hello.' },
    { type: 'shell', x: 9, y: 8 },
    { type: 'shell', whole: true, id: 'groveShell', x: 10, y: 8 },
    { type: 'ore', id: 'groveOre', x: 11, y: 8 },
  );
  VL.giveItem(t.game, 'woodSword');
  VL.giveItem(t.game, 'woodShield');
  t.game.inventory.berries = 3;
  t.closePopups();
  t.at({ tx: 4, ty: 3, facing: 'down' });
  t.game.room.entities.push({ type: 'drop', kind: 'wood', x: 6, y: 6, born: t.game.time }, { type: 'drop', kind: 'heart', x: 7, y: 6, born: t.game.time }, { type: 'drop', kind: 'shell', x: 8, y: 6, born: t.game.time });
  for (const facing of ['down', 'up', 'left', 'right']) {
    t.game.player.facing = facing;
    t.press('mainHand');
    for (let i = 0; i < 8; i += 1) {
      VL.render(ctx, t.app, i * 0.04);
      t.step(VL.actions({ held: ['offHand'] }));
    }
  }
  t.hold([], 0.5);
  t.press('interact');
  for (const id of Object.keys(VL.POPUPS)) {
    t.game.popups.queue = [id];
    t.step();
    assert.equal(t.app.sceneId, 'popup');
    VL.render(ctx, t.app, 1);
    t.game.popups.queue = [];
    t.app.setScene('play');
  }
  t.press('equipment');
  for (let i = 0; i < 4; i += 1) {
    VL.render(ctx, t.app, i);
    t.press('right');
  }
  assert.ok(ctx.calls.fillRect > 1000);
});

test('every string the popup and equipment screens draw is in the font', () => {
  const t = setup();
  const { VL, context } = t;
  const strings = [];
  const original = VL.ART.text;
  VL.ART.text = (ctx, str, x, y, options = {}) => {
    strings.push({ str: String(str), size: options.size || 'normal' });
    return original(ctx, str, x, y, options);
  };
  const ctx = context.document.createElement('canvas').getContext('2d');
  t.app.setScene('equipment');
  VL.render(ctx, t.app, 0);
  VL.giveItem(t.game, 'woodSword');
  VL.giveItem(t.game, 'woodShield');
  t.game.inventory.berries = 12;
  for (let i = 0; i < 3; i += 1) {
    VL.render(ctx, t.app, i);
    t.press('right');
  }
  t.app.setScene('popup');
  VL.render(ctx, t.app, 1);
  VL.ART.text = original;
  assert.ok(strings.some(({ str }) => str.includes('EQUIPMENT')));
  for (const { str, size } of strings) assert.deepEqual([...VL.ART.missingGlyphs(str, size)], [], `${str} (${size})`);
});

test('every sprite W5 draws with is defined, and the hero layers draw both passes', () => {
  const { VL } = loadGame();
  for (const id of ['prop-chest', 'prop-chest-open', 'prop-sign', 'pickup-wood', 'pickup-heart', 'pickup-shell-broken', 'pickup-ore', 'icon-wood', 'icon-ore', 'icon-berry', 'icon-shell-broken', 'item-berry']) {
    assert.ok(VL.ART.SPRITES[id], id);
  }
  for (const item of Object.values(VL.ITEMS)) assert.ok(VL.ART.SPRITES[`item-${item.icon}`], `item ${item.id} icon`);
  assert.ok(VL.HERO_LAYERS.some((layer) => layer.id === 'hands'));
});

// ---------- the table, steps and docs ----------

test('W5 claims its locks with the planned rules and implements the chestGear milestone', () => {
  const { VL } = loadGame();
  for (const id of ['chestGear', 'oreShallows', 'berryBush', 'bushBareHands', 'bushCut', 'berries', 'beachBrokenShells']) {
    assert.equal(typeof VL.LOCKS[id].reached, 'function', `${id} is implemented`);
    assert.equal(VL.LOCKS[id].replan, undefined, `${id} keeps the planned rule`);
  }
  const report = VL.solveProgression();
  assert.deepEqual([...report.problems], []);
});

test('the playthrough reloads after every milestone: progress set without VL.earned fails there', () => {
  const { VL } = loadGame();
  const { createPlaythrough } = require('./playthrough');
  VL.defineLock('fixtureFlag', { doc: '§ Starting and saving: Death', reached: (state) => Boolean(state.flags.fixture) });
  const forgetful = createPlaythrough(VL, { milestones: ['start', 'fixtureFlag'], steps: { start() {}, fixtureFlag: (drive) => { drive.state.flags.fixture = true; } } });
  assert.throws(() => forgetful.playTo('fixtureFlag'), /fixtureFlag did not survive a reload/);
  const careful = createPlaythrough(VL, {
    milestones: ['start', 'fixtureFlag'],
    steps: { start() {}, fixtureFlag: (drive) => { drive.state.flags.fixture = true; VL.earned(drive.state); drive.update(); } },
  });
  const before = careful.drive.app;
  assert.ok(VL.LOCKS.fixtureFlag.reached(careful.playTo('fixtureFlag').state));
  assert.notEqual(careful.drive.app, before, 'the page was reloaded');
  const slotless = createPlaythrough(VL, { app: playApp(VL), milestones: ['start'], steps: { start() {} } });
  assert.throws(() => slotless.playTo('start'), /needs a save slot/);
});

test('the real playthrough from the title reaches chestGear with the sword in hand, through reloads', () => {
  const { VL } = loadGame();
  const { createPlaythrough } = require('./playthrough');
  const app = VL.createApp({ storage: VL.createStorage(memoryStorage()) });
  const drive = createPlaythrough(VL, { app }).playTo('chestGear');
  assert.equal(drive.state.hands.mainHand, 'woodSword');
  assert.equal(drive.state.items.woodShield, true);
  assert.equal(drive.state.popups.seen.controls, true);
  assert.equal(drive.app.sceneId, 'play');
});

test('README documents the core loop for later items', () => {
  const readme = read('README.md');
  for (const word of ['VL.giveItem', 'VL.defineItem', 'VL.showPopup', 'VL.definePopup', 'VL.showMessage', 'VL.addResource', 'VL.setRoomTile', 'onInteract', 'prepare', 'VL.defineHeroLayer', 'state.inventory', 'state.hands', "'equipment'", 'bushDrops', 'cutTo']) {
    assert.ok(readme.includes(word), `README mentions ${word}`);
  }
});
