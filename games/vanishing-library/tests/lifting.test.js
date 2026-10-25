// The Lifting Gloves (W14): pots, rocks and the east road's boulders lifted
// and thrown, a throw's flight (over pits and desks, into switches, enemies
// and walls), the books under rocks, and the boulders that stay lifted.
const assert = require('node:assert/strict');
const { test, loadGame, memoryStorage, fakeDocument } = require('./harness');
const { findPath } = require('./playthrough');

const STEP = 1 / 60;
const plain = (value) => JSON.parse(JSON.stringify(value));

// A playing app with the hero at `where`; `gloves` owns them; `storage`
// gives the game slot 1 of an in-memory store so VL.reloadApp works.
function setup({ where, gloves = true, storage = false, enemies = false } = {}) {
  const { VL } = loadGame();
  let app = storage ? VL.createApp({ storage: VL.createStorage(memoryStorage()) }) : VL.createApp();
  if (storage) {
    app.startGame(VL.newGame({ name: 'Robin' }), 0, { fresh: true });
    app.save();
  } else app.game = VL.newGame({ name: 'Robin' });
  app.setScene('play');
  app.game.popups.seen.controls = true;
  if (gloves) app.game.items.liftingGloves = true;
  const t = {
    VL,
    get app() {
      return app;
    },
    get game() {
      return app.game;
    },
    place(place) {
      VL.place(app.game, place);
      if (!enemies) app.game.room.entities = app.game.room.entities.filter((e) => !VL.isEnemy(e));
    },
    step(actions = VL.noActions()) {
      app.update(actions, STEP);
    },
    hold(held, seconds) {
      for (let s = 0; s < seconds - 1e-9; s += STEP) app.update(VL.actions({ held }), STEP);
    },
    press(action) {
      app.update(VL.actions({ pressed: [action] }), STEP);
    },
    until(done, maxSeconds = 3, held = []) {
      for (let s = 0; s < maxSeconds - 1e-9 && !done(app.game); s += STEP) app.update(VL.actions({ held }), STEP);
      assert.ok(done(app.game), `reached within ${maxSeconds} s holding [${held}]`);
    },
    find: (type, where = {}) => app.game.room.entities.find((e) => e.type === type && Object.entries(where).every(([k, v]) => e[k] === v)),
    tileHere: (tx, ty) => VL.tileAt(app.game.room.area, app.game.room.screen, tx, ty, app.game.room),
    reload(place) {
      app = VL.reloadApp(app);
      if (place) t.place(place);
    },
    // Reads and closes a waiting message or popup with S.
    close() {
      t.step();
      for (let i = 0; i < 6 && app.sceneId === 'popup'; i += 1) {
        t.hold([], 0.4);
        t.press('interact');
      }
    },
  };
  if (where) t.place(where);
  return t;
}

const VL_tile = (t) => t.VL.heroTile(t.game);
const scr = (screen, tx, ty, facing) => ({ area: 'scriptorium', screen, tx, ty, facing });
const ow = (screen, tx, ty, facing) => ({ area: 'overworld', screen, tx, ty, facing });

// ---------- pots ----------

test('without the gloves a pot is too heavy: S says so and it stays; a pot only half faced says nothing', () => {
  const t = setup({ where: scr('1,0', 3, 8, 'left'), gloves: false });
  t.press('interact');
  assert.match(t.game.message.text, /too heavy to lift with your bare hands/);
  assert.ok(t.find('pot', { x: 2, y: 8 }), 'the pot is still there');
  assert.ok(!t.game.player.lifted);
  t.close();
  assert.equal(t.app.sceneId, 'play');
  // Most of a tile down, the pot is only half faced: no message.
  t.game.player.y += 12;
  t.press('interact');
  assert.ok(!t.game.message);
});

test('with the gloves S lifts a pot overhead; the same press never throws it, Space does not swing, S throws it', () => {
  const t = setup({ where: scr('1,0', 3, 8, 'left') });
  t.game.hands.mainHand = 'woodSword';
  t.game.items.woodSword = true;
  t.press('interact');
  assert.deepEqual(plain(t.game.player.lifted).kind, 'pot');
  assert.equal(t.find('pot', { x: 2, y: 8 }), undefined, 'gone from the floor');
  assert.equal(t.find('liftThrown'), undefined, 'not thrown by the press that lifted it');
  t.hold([], 0.2);
  t.press('mainHand');
  assert.ok(!t.game.player.swing, 'Space does not swing a sword while holding a pot');
  assert.ok(t.find('liftThrown'), 'Space throws it too');
  t.until((g) => !g.room.entities.some((e) => e.type === 'liftThrown'), 2);
  assert.ok(t.find('liftShards'), 'it shatters');
  assert.equal(t.game.player.lifted, null);
});

test('a thrown pot flies up to liftThrowTiles tiles over open floor, then shatters where it lands', () => {
  const t = setup({ where: scr('1,0', 7, 3, 'down') });
  t.game.room.entities.push({ type: 'pot', x: 7, y: 2 });
  t.hold(['up'], 2 / 60);
  t.press('interact');
  t.hold([], 0.2);
  t.hold(['down'], 2 / 60);
  const from = t.game.player.y - 4;
  t.press('interact');
  let thrown = t.find('liftThrown');
  let last = thrown;
  while (thrown) {
    last = { ...thrown };
    t.step();
    thrown = t.find('liftThrown');
  }
  const landed = t.find('liftShards');
  assert.ok(landed);
  assert.ok(Math.abs(landed.gy - from - t.VL.TUNING.liftThrowTiles * 16) <= 2, `landed ${landed.gy - from} px away`);
  assert.ok(last.z >= 0);
});

test('a throw flies over pits and hits the switch behind them; the switch stays thrown after a reload', () => {
  const t = setup({ where: scr('2,0', 6, 2, 'left'), storage: true });
  t.press('interact');
  assert.equal(t.game.player.lifted.kind, 'pot');
  t.hold([], 0.2);
  t.hold(['right'], 2 / 60);
  t.until((g) => VL_tile(t).tx === 7, 1, ['right']);
  t.hold(['right'], 2 / 60);
  t.press('interact');
  t.until((g) => g.dungeons.scriptorium.switches.d1SwitchPit, 1);
  t.reload(scr('2,0', 3, 6, 'down'));
  assert.equal(t.game.dungeons.scriptorium.switches.d1SwitchPit, true);
  assert.equal(t.find('shutter', { id: 'd1ShutterPit' }).closed, false, 'the bars round key B are up');
});
test('a throw passes over reading desks to the switch they hem in, but walls and closed bars stop it', () => {
  const t = setup({ where: scr('3,0', 12, 4, 'up') });
  t.game.room.entities.push({ type: 'pot', x: 11, y: 4 });
  t.hold(['left'], 2 / 60);
  t.press('interact');
  t.hold([], 0.2);
  t.hold(['up'], 2 / 60);
  t.press('interact');
  t.until((g) => g.dungeons.scriptorium.switches.d1SwitchDesk, 1);
  // Into the shut bars of the boss key's alcove: it shatters at them.
  const u = setup({ where: scr('3,0', 3, 4, 'up') });
  u.game.room.entities.push({ type: 'pot', x: 4, y: 4 });
  u.hold(['right'], 2 / 60);
  u.press('interact');
  u.hold([], 0.2);
  u.hold(['down'], 2 / 60);
  u.press('interact');
  u.until((g) => !g.room.entities.some((e) => e.type === 'liftThrown'), 1);
  const shards = u.find('liftShards');
  assert.ok(shards.gy < 6 * 16, `stopped before the bars at row 6 (y ${shards.gy})`);
  assert.equal(u.find('bossKey').hidden ?? false, false);
  assert.equal(u.VL.spotFound(u.game, 'd1BossKey'), false);
});

test('a thrown pot hurts an enemy it hits and shatters there', () => {
  const t = setup({ where: scr('1,-1', 7, 8, 'up'), enemies: true });
  t.game.room.entities = t.game.room.entities.filter((e) => !t.VL.isEnemy(e));
  const slime = t.VL.spawnEnemy(t.game, 'slime', 7, 6);
  slime.arriving = 0;
  t.game.room.entities.push({ type: 'pot', x: 8, y: 8 });
  t.hold(['right'], 2 / 60);
  t.press('interact');
  t.hold([], 0.2);
  t.hold(['up'], 2 / 60);
  const hp = slime.hp;
  t.press('interact');
  t.until(() => slime.hp < hp || !t.game.room.entities.includes(slime), 1);
  assert.ok(t.find('liftShards'));
});

test('a hit while holding drops what the hero holds; fainting empties his hands', () => {
  const t = setup({ where: scr('1,0', 3, 8, 'left') });
  t.press('interact');
  t.hold([], 0.2);
  const slime = t.VL.spawnEnemy(t.game, 'slime', 3, 8);
  slime.arriving = 0;
  t.until((g) => g.hp < g.maxHp, 1);
  assert.equal(t.game.player.lifted, null, 'dropped');
  assert.ok(t.find('liftShards'), 'and it broke');
  const u = setup({ where: scr('1,0', 3, 8, 'left') });
  u.press('interact');
  u.VL.faint(u.game, 'slime');
  u.step();
  assert.equal(u.game.player.lifted, null);
});

test('a pot marked respawn is back on its spot a few seconds after it is taken; others only on the next visit', () => {
  const t = setup({ where: scr('2,0', 6, 2, 'left') });
  t.press('interact');
  t.hold(['down'], 0.3);
  assert.equal(t.find('pot', { x: 5, y: 2 }), undefined);
  t.hold([], t.VL.TUNING.potRespawnSeconds);
  assert.ok(t.find('pot', { x: 5, y: 2 }), 'back on its stand');
  const u = setup({ where: scr('1,0', 3, 8, 'left') });
  u.press('interact');
  u.hold([], 5);
  assert.equal(u.find('pot', { x: 2, y: 8 }), undefined, 'a plain pot stays gone this visit');
  u.place(scr('1,0', 7, 7));
  assert.ok(u.find('pot', { x: 2, y: 8 }), 'and is back next visit');
});

test('a respawning pot waits while any part of the hero stands on its spot, so it never lands inside him', () => {
  const t = setup({ where: scr('2,0', 6, 2, 'left') });
  const { VL } = t;
  t.press('interact');
  t.hold(['down'], 0.3);
  t.press('interact');
  t.hold([], 1);
  assert.equal(t.find('pot', { x: 5, y: 2 }), undefined);
  // Centre on the tile below the spot, the top of his box still over it.
  const { tile, heroBox } = VL.TUNING;
  Object.assign(t.game.player, { x: 5 * tile + tile / 2, y: 3 * tile + heroBox.h / 2 - 1, facing: 'down' });
  assert.equal(VL.heroTile(t.game).ty, 3);
  t.hold([], VL.TUNING.potRespawnSeconds + 1);
  assert.equal(t.find('pot', { x: 5, y: 2 }), undefined, 'the pot waits');
  t.until((game) => !VL.heroBoxOverlaps(game, 5, 2), 1, ['right']);
  t.hold([], 0.1);
  assert.ok(t.find('pot', { x: 5, y: 2 }), 'and it comes back once he is clear');
});

test('no respawning pot sits in a doorway or on the tile just inside one', () => {
  const { VL } = loadGame();
  const app = VL.createApp();
  app.game = VL.newGame({ name: 'Robin' });
  for (const screen of ['1,0', '0,0', '1,-1', '2,-1', '2,0', '3,0', '1,-2']) {
    VL.place(app.game, { area: 'scriptorium', screen, tx: 7, ty: 5 });
    const room = app.game.room;
    const doorways = [];
    for (const e of room.entities) if (['door', 'lockedDoor'].includes(e.type)) doorways.push([e.x, e.y]);
    const { cols, rows } = VL.TUNING;
    for (let x = 0; x < cols; x += 1) for (const y of [0, rows - 1]) if (!VL.tileInfo('scriptorium', VL.tileAt('scriptorium', screen, x, y, room)).solid) doorways.push([x, y]);
    for (let y = 0; y < rows; y += 1) for (const x of [0, cols - 1]) if (!VL.tileInfo('scriptorium', VL.tileAt('scriptorium', screen, x, y, room)).solid) doorways.push([x, y]);
    for (const p of room.entities.filter((e) => e.type === 'pot' && e.respawn)) {
      for (const [x, y] of doorways) assert.ok(Math.abs(p.x - x) + Math.abs(p.y - y) > 1, `pot (${p.x},${p.y}) in ${screen} is clear of the doorway at (${x},${y})`);
    }
  }
});

test('holding something, F never starts a chicken flight and S never talks or opens', () => {
  const t = setup({ where: ow('2,0', 7, 5, 'down') });
  t.game.room.entities.push({ type: 'pot', x: 7, y: 6 });
  t.press('interact');
  t.game.room.entities.push({ type: 'chicken', x: 8, y: 5, px: 8 * 16 + 8, py: 5 * 16 + 12, mode: 'idle', z: 0, idle: 9, home: { x: 8, y: 5 } });
  t.press('fly');
  assert.ok(!t.game.player.flight, 'no flight while lifting');
  assert.ok(t.game.player.lifted, 'still holding the pot');
});

// ---------- the gloves ----------

test('the gloves are worn, never held: the big chest gives them, their popup explains S, and they fill no hand', () => {
  const t = setup({ where: scr('2,-1', 7, 5, 'up'), gloves: false, storage: true });
  const { VL } = t;
  t.game.items.woodSword = true;
  t.game.hands.mainHand = 'woodSword';
  t.press('interact');
  assert.ok(VL.hasItem(t.game, 'liftingGloves'));
  assert.ok(VL.spotFound(t.game, 'd1GlovesChest'));
  assert.deepEqual(plain(t.game.hands), { mainHand: 'woodSword', offHand: null }, 'no hand filled');
  assert.equal(VL.currentPopup(t.game).title, 'You got the Lifting Gloves!');
  assert.deepEqual(plain(VL.ART.missingGlyphs(VL.currentPopup(t.game).text)), []);
  assert.ok(!VL.ART.popupLayout({ title: VL.currentPopup(t.game).title, text: VL.currentPopup(t.game).text }).overflow);
  t.reload();
  assert.ok(VL.hasItem(t.game, 'liftingGloves'), 'saved at once');
  assert.ok(VL.LOCKS.liftingGloves.reached(t.game));
  t.place(scr('2,-1', 7, 5, 'up'));
  assert.equal(t.find('bigChest').opened, true, 'and the chest stays open');
});

// ---------- rocks and the books under them ----------

test('a rock lifted with the gloves leaves its ground for this visit only; without them S says it is too heavy', () => {
  const t = setup({ where: scr('1,0', 11, 5, 'right') });
  t.press('interact');
  assert.equal(t.game.player.lifted.kind, 'rock');
  assert.equal(t.tileHere(12, 5), '_', 'the corridor is open');
  t.place(scr('1,0', 11, 5, 'right'));
  assert.equal(t.tileHere(12, 5), 'r', 'back on the next visit');
  assert.equal(t.VL.savedTile(t.game, 'scriptorium', '1,0', 12, 5), null, 'never saved');
  // An overworld rock in a field leaves grass (W29: no rocks on the shore).
  const spot = t.VL.SPOTS.bookLakeShore;
  const rocks = [];
  for (const [key, screen] of Object.entries(t.VL.AREAS.overworld.screens)) {
    screen.tiles.forEach((row, ty) => [...row].forEach((ch, tx) => { if (ch === 'R') rocks.push({ key, tx, ty }); }));
  }
  assert.ok(spot && rocks.length, 'the map has field rocks');
  const u = setup({ gloves: false });
  const rock = rocks.find(({ key, tx, ty }) => !u.VL.isSolidAt('overworld', key, tx, ty + 1));
  u.place(ow(rock.key, rock.tx, rock.ty + 1, 'up'));
  u.press('interact');
  assert.match(u.game.message.text, /too heavy/);
  u.close();
  u.game.items.liftingGloves = true;
  u.press('interact');
  assert.equal(u.tileHere(rock.tx, rock.ty), '.');
});

test('each rock spot hides a book: lift the rock, walk onto it, and it is found for good (W8 spots, filled by W14)', () => {
  const t = setup({ storage: true });
  const { VL } = t;
  for (const id of ['bookMeadowRock', 'bookLakeShore', 'bookHighlands', 'bookScriptoriumRock']) {
    const spot = VL.SPOTS[id];
    assert.equal(spot.how, 'rock');
    assert.ok(spot.filled, `${id} is filled`);
    const book = VL.getScreen(spot.area, spot.screen).entities.find((e) => e.spot === id);
    assert.equal(book.type, 'rockBook');
    assert.ok(VL.tileInfo(spot.area, VL.getScreen(spot.area, spot.screen).tiles[spot.y][spot.x]).rock, `${id} lies under a rock`);
    // Lift it from an open side, then step on the book.
    const side = [[0, 1, 'up'], [0, -1, 'down'], [-1, 0, 'right'], [1, 0, 'left']].find(([dx, dy]) => !VL.isSolidAt(spot.area, spot.screen, spot.x + dx, spot.y + dy));
    t.place({ area: spot.area, screen: spot.screen, tx: spot.x + side[0], ty: spot.y + side[1], facing: side[2] });
    assert.equal(t.find('rockBook').uncovered, undefined, 'hidden under the rock');
    t.press('interact');
    assert.equal(t.find('rockBook').uncovered, true);
    t.hold([], 0.2);
    t.press('interact');
    t.until((g) => !g.room.entities.some((e) => e.type === 'liftThrown'), 2);
    t.until((g) => VL.spotFound(g, id), 1, [{ up: 'up', down: 'down', left: 'left', right: 'right' }[side[2]]]);
    assert.ok(VL.booksCarried(t.game).includes(id));
    t.close();
  }
  t.reload(ow(VL.SPOTS.bookScriptoriumRock.screen, 3, 6));
  assert.ok(VL.spotFound(t.game, 'bookScriptoriumRock'), 'found for good');
  assert.equal(t.find('rockBook'), undefined, 'and gone from under the rock');
});

// ---------- the east road's boulders ----------

test('the canyon boulders: too heavy without the gloves; lifted with them they stay lifted, through a reload and on the map', () => {
  const t = setup({ where: ow('4,0', 4, 5, 'right'), gloves: false, storage: true });
  const { VL } = t;
  t.press('interact');
  assert.match(t.game.message.text, /huge boulder/);
  t.close();
  assert.equal(findPath(VL, { area: 'overworld', screen: '4,0', tx: 4, ty: 5 }, { area: 'overworld', screen: '5,0', tx: 2, ty: 5 }, t.game), null, 'the road is shut');
  t.game.items.liftingGloves = true;
  t.press('interact');
  assert.equal(t.game.player.lifted.kind, 'boulder');
  assert.equal(VL.savedTile(t.game, 'overworld', '4,0', 5, 5), 'P');
  t.hold([], 0.2);
  t.press('interact');
  t.until((g) => !g.room.entities.some((e) => e.type === 'liftThrown'), 2);
  t.until((g) => VL.heroTile(g).tx === 5, 1, ['right']);
  t.press('interact');
  t.hold([], 0.2);
  t.press('interact');
  t.reload();
  assert.equal(VL.savedTile(t.game, 'overworld', '4,0', 6, 5), 'P', 'saved at once, through a reload');
  t.place(ow('4,0', 3, 5));
  assert.equal(t.tileHere(5, 5), 'P');
  assert.ok(findPath(VL, { area: 'overworld', screen: '4,0', tx: 3, ty: 5 }, { area: 'overworld', screen: '5,0', tx: 2, ty: 5 }, t.game), 'the road is open');
  assert.equal(VL.LOCKS.eastRoad.reached(t.game), false);
  t.until((g) => g.player.screen === '5,0' && !g.transition, 4, ['right']);
  assert.ok(VL.LOCKS.eastRoad.reached(t.game), 'the east road is reached');
});

// ---------- drawing ----------

test('render smoke: a lifted pot, rock and boulder, a pot in the air, shards, splashes and a book under a rock all draw', () => {
  const t = setup({ where: scr('1,0', 3, 8, 'left') });
  const { VL } = t;
  const ctx = fakeDocument().createElement('canvas').getContext('2d');
  const draw = () => {
    const before = Object.values(ctx.calls).reduce((sum, n) => sum + n, 0);
    VL.render(ctx, t.app, 0.4);
    return Object.values(ctx.calls).reduce((sum, n) => sum + n, 0) - before;
  };
  for (const kind of ['pot', 'rock', 'boulder']) {
    t.game.player.lifted = { kind, since: 0, t: 1 };
    assert.ok(draw() > 50);
  }
  t.game.player.lifted = null;
  t.game.room.entities.push({ type: 'liftThrown', kind: 'pot', gx: 60, gy: 60, x: 3, y: 3, z: 8 });
  for (const fx of ['shards', 'splash', 'fall']) t.game.room.entities.push({ type: 'liftShards', kind: 'rock', fx, gx: 80, gy: 80, x: 5, y: 5, t: 0.1, dur: 0.45 });
  assert.ok(draw() > 50);
  const spot = VL.SPOTS.bookScriptoriumRock;
  t.place(ow(spot.screen, spot.x, spot.y + 1, 'up'));
  assert.ok(draw() > 50);
  t.find('rockBook').uncovered = true;
  assert.ok(draw() > 50);
  for (const id of ['prop-pot', 'item-lifting-gloves', 'prop-big-chest', 'prop-big-chest-open']) assert.ok(VL.ART.sprite(id), id);
});

test('README documents lifting', () => {
  const readme = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'README.md'), 'utf8');
  for (const word of ['## Lifting (W14)', 'liftable', 'VL.giveWornItem', 'respawn', 'liftTo', 'low: true']) assert.ok(readme.includes(word), `README mentions ${word}`);
});
