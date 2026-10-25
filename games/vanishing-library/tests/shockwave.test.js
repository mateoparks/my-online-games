// The shockwave (W16): hung on VL.afterThornback, it waits for the heart
// container, takes exactly what the progression table says, wakes the hero
// at home holding the Glowstone, and Gran Ottie hands over a couple of wood.
// Then the gentle climb back: quiet home fields while swordless, and a pull
// that faints keeps its drop. Reloads at every point, the fixture, the words.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, loadGame, memoryStorage, fakeDocument } = require('./harness');
const { createPlaythrough, findPath } = require('./playthrough');
const { talkThrough } = require('./steps/w16.steps');

const STEP = 1 / 60;
const plain = (value) => JSON.parse(JSON.stringify(value));
const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
const LOST_ITEMS = ['woodSword', 'woodShield', 'woodShovel', 'metalSword', 'metalShield', 'metalShovel', 'worldMap'];
const KEPT_ITEMS = ['scriptoriumKey', 'liftingGloves', 'mortarPestle', 'woodsMapCopy', 'grapplingRope', 'shellPurse', 'swiftfootBoots'];

// A game loaded from `text` into slot 0 of an in-memory store, in play:
// t.reload() is a page reload (no save first), t.saved() the slot on disk.
function load(text, { VL = loadGame().VL } = {}) {
  const backing = memoryStorage({ [VL.slotKey(0)]: text });
  const storage = VL.createStorage(backing);
  let app = VL.createApp({ storage });
  app.startGame(VL.loadSlot(storage, 0), 0);
  app.setScene('play');
  const t = {
    VL,
    get app() {
      return app;
    },
    get game() {
      return app.game;
    },
    get scene() {
      return app.sceneId;
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
    until(done, seconds, held = []) {
      for (let s = 0; s < seconds - 1e-9 && !done(app); s += STEP) app.update(VL.actions({ held }), STEP);
      assert.ok(done(app), `reached within ${seconds} s (scene ${app.sceneId})`);
    },
    reload() {
      app = VL.reloadApp(app);
    },
    saved: () => JSON.parse(backing.getItem(VL.slotKey(0))),
    closePopups() {
      for (let i = 0; i < 12; i += 1) {
        if (app.sceneId === 'play' && (app.game.holdUp || VL.currentPopup(app.game))) t.until(() => app.sceneId !== 'play' || (!app.game.holdUp && !VL.currentPopup(app.game)), 2);
        if (app.sceneId !== 'popup') return;
        t.hold([], 0.4);
        t.press('interact');
      }
    },
  };
  return t;
}

// The W15 save: the Thornback beaten and its heart taken, saved before any
// hook existed. `edit` changes it first.
function beaten(edit = (save) => save, options) {
  const save = JSON.parse(fixture('save-v1-W15-after.json'));
  return load(JSON.stringify(edit(save) || save), options);
}

// Through the scene to play in the hut, the Glowstone held up and named.
function throughScene(t) {
  t.until((app) => app.sceneId === 'shockwave', 3);
  t.until((app) => app.shockwave.phase === 'dark', t.VL.SHOCKWAVE_TIMES.rumble + t.VL.SHOCKWAVE_TIMES.flash + 0.2);
  for (let i = 0; i < 30 && t.app.shockwave?.phase === 'dark'; i += 1) {
    t.hold([], 0.2);
    t.press('interact');
  }
  t.until((app) => app.sceneId === 'play', t.VL.SHOCKWAVE_TIMES.wake + 0.2);
}

// ---------- the hook and when the knock-out comes ----------

test('a save that beat the Thornback before W16: the hook marks the shockwave due on the next load, saved with its id, and takes nothing yet', () => {
  const t = beaten();
  const before = plain({ items: t.game.items, inventory: t.game.inventory });
  assert.deepEqual(plain(t.game.afterThornbackDone), []);
  t.step();
  t.step();
  assert.deepEqual([t.saved().afterThornbackDone, t.saved().flags.shockwaveDue], [['shockwave'], true]);
  assert.deepEqual(plain({ items: t.game.items, inventory: t.game.inventory }), before, 'nothing is lost before the scene');
  assert.equal(t.scene, 'play');
});

test('the knock-out waits in the Hollow Oak until the heart container is taken, then a breath, then the ground shakes', () => {
  const t = beaten((save) => {
    delete save.flags['found:heartD2'];
  });
  const { VL } = t;
  VL.place(t.game, { area: 'hollowOak', screen: '0,-3', tx: 7, ty: 6, facing: 'up' });
  t.hold([], 3);
  assert.equal(t.scene, 'play', 'not while the heart lies on the floor');
  assert.ok(t.game.room.entities.some((e) => e.type === 'heartContainer'));
  const maxHp = t.game.maxHp;
  t.until((app) => app.game.maxHp > maxHp, 1, ['up']);
  t.closePopups();
  t.hold([], VL.TUNING.shockwaveDelay - 0.3);
  assert.equal(t.scene, 'play', 'a breath first');
  t.until((app) => app.sceneId === 'shockwave', 0.6);
  assert.equal(t.app.shockwave.phase, 'rumble');
  assert.ok(!t.game.flags.shockwave && VL.hasItem(t.game, 'woodSword'), 'the losses wait for the flash');
});

test('leaving the Hollow Oak without the heart: the shockwave comes outside and keeps the heart for him', () => {
  const t = beaten((save) => {
    delete save.flags['found:heartD2'];
  });
  const { VL } = t;
  const maxHp = t.game.maxHp;
  VL.place(t.game, { area: 'overworld', screen: '7,-2', tx: 7, ty: 4, facing: 'down' });
  t.game.room.entities = t.game.room.entities.filter((e) => !VL.isEnemy(e));
  t.until((app) => app.sceneId === 'shockwave', 3);
  t.until((app) => app.game.flags.shockwave, VL.SHOCKWAVE_TIMES.rumble + 0.2);
  assert.equal(t.game.maxHp, maxHp + VL.TUNING.heartContainerHp, 'hearts are kept, the one left behind too');
  assert.ok(VL.spotFound(t.game, 'heartD2'));
});

// ---------- what it takes and keeps ----------

// Everything the design names, and some of each kind besides.
function loaded(VL, game) {
  for (const id of [...LOST_ITEMS, ...KEPT_ITEMS]) game.items[id] = true;
  Object.assign(game.inventory, { wood: 4, shells: 7, brokenShells: 2, berries: 3, ore: 1, paper: 2, ink: 1 });
  game.hands = { mainHand: 'metalSword', offHand: 'grapplingRope' };
  game.flags['found:heartD2'] = true;
  game.flags.pagesBound = true;
  game.library.returned = ['hiddenBookSealed', 'bookPrimer'];
  game.maxHp = 10;
  return game;
}

test('the losses: sword, shield, shovel (wood and metal), the map, wood, paper, berries and ink; whole shells crack into broken ones; nothing else changes', () => {
  const { VL } = loadGame();
  const game = loaded(VL, VL.newGame({ name: 'Robin' }));
  const before = plain(VL.serializeSave(game));
  assert.equal(VL.applyShockwave(game), true);
  const after = plain(VL.serializeSave(game));
  for (const id of LOST_ITEMS) assert.equal(VL.hasItem(game, id), false, `${id} is lost`);
  for (const id of KEPT_ITEMS) assert.equal(VL.hasItem(game, id), true, `${id} is kept`);
  assert.deepEqual(after.inventory, { wood: 0, shells: 0, brokenShells: 9, berries: 0, ore: 1, paper: 0, ink: 0 }, 'unused ore is kept');
  assert.equal(VL.hasItem(game, 'glowstone'), true, 'he wakes holding the Glowstone');
  assert.deepEqual(after.hands, { mainHand: null, offHand: 'grapplingRope' }, 'a hand that held lost gear is empty');
  assert.deepEqual(after.savePoint, plain(VL.SHOCKWAVE_WAKE), 'he wakes at home, and comes back there');
  // Every other saved field, hearts, books, pages and quest flags included, is as it was.
  const changed = Object.keys(after).filter((key) => JSON.stringify(after[key]) !== JSON.stringify(before[key]));
  assert.deepEqual(changed.sort(), ['flags', 'hands', 'inventory', 'items', 'savePoint']);
  assert.deepEqual(Object.keys(after.flags).filter((f) => !(f in before.flags)), ['shockwave']);
  assert.deepEqual([after.maxHp, after.library, after.visited], [before.maxHp, before.library, before.visited]);
  assert.equal(VL.applyShockwave(game), false, 'once only');
  assert.equal(game.inventory.brokenShells, 9);
});

test('the real shockwave is the modelled one: every key the table loses is lost, what it gives is given, and the solver regains it all', () => {
  const { VL } = loadGame();
  const lock = VL.LOCKS.shockwave;
  const game = loaded(VL, VL.newGame());
  for (const id of ['woodSword', 'metalShield', 'woodShovel', 'worldMap']) assert.ok(VL.LOCKS[id].reached(game), `${id} reached before`);
  VL.applyShockwave(game);
  for (const key of lock.loses) {
    if (VL.RESOURCE_KINDS.includes(key)) assert.equal(game.inventory[key], 0, `${key} is gone`);
    else assert.equal(VL.LOCKS[key].reached(game), false, `${key} reads as lost`);
  }
  assert.deepEqual([...lock.gives].sort(), ['brokenShells', 'glowstone']);
  assert.ok(VL.hasItem(game, 'glowstone') && game.inventory.brokenShells > 0);
  assert.ok(lock.reached(game) && typeof VL.LOCKS.helperWood.reached === 'function', 'both locks are claimed');
  const report = VL.solveProgression();
  assert.deepEqual([...report.problems], []);
  assert.deepEqual([...report.regained.shockwave].sort(), [...lock.loses].sort());
  // A key the shockwave can't take is a bug, never a quiet half-loss.
  const loses = lock.loses;
  lock.loses = [...loses, 'nothingLikeThis'];
  assert.throws(() => VL.applyShockwave(loaded(VL, VL.newGame())), /cannot take nothingLikeThis/);
  lock.loses = loses;
});

// ---------- the scene, and reloads at every point ----------

test('the scene: the ground shakes, the losses land at the flash and he is carried home; the story is told on black; he wakes in his hut', () => {
  const t = beaten();
  const { VL } = t;
  t.until((app) => app.sceneId === 'shockwave', 3);
  const phases = new Set();
  for (let s = 0; s < VL.SHOCKWAVE_TIMES.rumble - 0.1; s += STEP) {
    t.step();
    phases.add(t.app.shockwave.phase);
  }
  assert.deepEqual([...phases], ['rumble']);
  assert.ok(VL.hasItem(t.game, 'woodSword'), 'nothing is lost while the ground shakes');
  t.until((app) => app.shockwave.phase === 'flash', 0.3);
  assert.ok(t.game.flags.shockwave && !VL.hasItem(t.game, 'woodSword'));
  assert.equal(t.saved().flags.shockwave, true, 'the losses are written as they land');
  assert.deepEqual([t.game.player.area, t.game.player.screen], ['hut', '0,0']);
  t.until((app) => app.shockwave.phase === 'dark', VL.SHOCKWAVE_TIMES.flash + 0.1);
  t.hold([], 5);
  assert.equal(t.app.shockwave.phase, 'dark', 'the lines wait for a press');
  assert.equal(t.app.shockwave.page, 0);
  t.press('interact');
  assert.equal(t.app.shockwave.page, 1);
  t.hold([], 0.1);
  t.press('interact');
  t.press('interact');
  assert.equal(t.app.shockwave.phase, 'wake');
  t.until((app) => app.sceneId === 'play', VL.SHOCKWAVE_TIMES.wake + 0.1);
  assert.deepEqual([t.game.player.area, VL.heroTile(t.game).tx, VL.heroTile(t.game).ty], ['hut', VL.SHOCKWAVE_WAKE.tx, VL.SHOCKWAVE_WAKE.ty]);
  assert.equal(t.saved().flags.shockwaveWoke, true);
});

test('reloads: before the flash the scene plays again with nothing lost; after it, the story resumes on black at home with nothing lost twice; after waking, never again', () => {
  const early = beaten();
  const { VL } = early;
  early.until((app) => app.sceneId === 'shockwave', 3);
  early.hold([], 1);
  early.reload();
  assert.ok(!early.game.flags.shockwave && VL.hasItem(early.game, 'woodSword'));
  early.until((app) => app.sceneId === 'shockwave', 3);
  assert.equal(early.app.shockwave.phase, 'rumble');

  const late = beaten();
  late.until((app) => app.game.flags.shockwave, 5);
  late.game.inventory.shells = 4;
  late.app.save();
  late.reload();
  assert.deepEqual([late.game.player.area, late.game.player.screen], ['hut', '0,0'], 'loaded at home');
  late.step();
  late.step();
  assert.deepEqual([late.scene, late.app.shockwave.phase], ['shockwave', 'dark']);
  throughScene(late);
  assert.deepEqual([late.game.inventory.shells, late.game.inventory.brokenShells], [4, 0], 'shells earned since are never cracked again');
  late.closePopups();
  late.reload();
  late.hold([], 2);
  assert.notEqual(late.scene, 'shockwave');
  assert.equal(late.saved().afterThornbackDone.filter((id) => id === 'shockwave').length, 1);
});

// ---------- waking, and Gran Ottie ----------

test('waking: he holds the Glowstone up, it is named, and then Gran Ottie talks to him and hands over two pieces of wood, held up, once', () => {
  const t = beaten();
  const { VL } = t;
  throughScene(t);
  assert.deepEqual(plain(t.game.holdUp.sprites), ['item-glowstone']);
  assert.equal(t.game.player.holding, true);
  t.until((app) => app.sceneId === 'popup', VL.TUNING.holdUpSeconds + 0.1);
  assert.equal(VL.currentPopup(t.game).id, 'glowstone');
  const gran = t.game.room.entities.find((e) => e.type === 'npc' && e.id === 'gran');
  assert.ok(gran, 'Gran is in the hut');
  t.closePopups();
  t.until((app) => app.sceneId === 'dialogue', 0.5);
  assert.equal(t.app.dialogue.speaker, 'Gran Ottie');
  const words = t.app.dialogue.pages.flat().join(' ');
  assert.ok(words.includes(t.game.name), 'by name');
  assert.match(words, /sword/);
  assert.equal(t.game.inventory.wood, 0);
  talkThrough({ app: t.app, hold: (held, s) => t.hold(held, s), press: (a) => t.press(a) });
  assert.equal(t.game.inventory.wood, VL.TUNING.helperWood);
  assert.equal(t.saved().inventory.wood, 2, 'the gift and its flag are saved together');
  assert.equal(t.saved().flags['gave:helperWood'], true);
  assert.deepEqual(plain(t.game.holdUp.sprites), ['icon-wood']);
  t.until((app) => app.sceneId === 'popup', VL.TUNING.holdUpSeconds + 0.1);
  assert.equal(VL.currentPopup(t.game).id, 'helperWood');
  t.closePopups();
  t.hold([], 1);
  assert.equal(t.scene, 'play', 'she does not start again');
  assert.ok(VL.LOCKS.helperWood.reached(t.game));
  // Talking to her again: the nudge, no more wood.
  t.app.game.player.facing = 'right';
  VL.talkTo(t.game, gran);
  t.step();
  assert.match(t.app.dialogue.pages.flat().join(' '), /Brannock/);
  talkThrough({ app: t.app, hold: (held, s) => t.hold(held, s), press: (a) => t.press(a) });
  assert.equal(t.game.inventory.wood, 2);
});

test('Esc ends Gran\'s talk and still hands the wood over; a reload before she talks has her talk again', () => {
  const t = beaten();
  const { VL } = t;
  throughScene(t);
  t.closePopups();
  t.reload();
  t.until((app) => app.sceneId === 'dialogue', 1);
  t.press('pause');
  t.closePopups();
  assert.equal(t.game.inventory.wood, 2);
  assert.ok(t.game.flags['gave:helperWood']);
});

test('Gran stays in the hut until she has given the wood, then goes home to her well; in town she nudges a swordless hero to the smithy', () => {
  const { VL } = loadGame();
  const game = VL.newGame({ name: 'Robin' });
  VL.place(game, VL.SHOCKWAVE_WAKE);
  assert.ok(!game.room.entities.some((e) => e.type === 'npc'), 'never before the shockwave');
  VL.applyShockwave(game);
  VL.place(game, VL.SHOCKWAVE_WAKE);
  const gran = game.room.entities.filter((e) => e.type === 'npc');
  assert.deepEqual(plain(gran.map((e) => [e.id, e.x, e.y])), [['gran', VL.SHOCKWAVE_HELPER.x, VL.SHOCKWAVE_HELPER.y]]);
  assert.ok(!VL.isSolidAt('hut', '0,0', VL.SHOCKWAVE_HELPER.x, VL.SHOCKWAVE_HELPER.y), 'she stands on open floor');
  assert.ok(findPath(VL, { area: 'hut', screen: '0,0', tx: VL.SHOCKWAVE_WAKE.tx, ty: VL.SHOCKWAVE_WAKE.ty }, { area: 'hut', screen: '0,0', tx: 7, ty: 8 }, game), 'she never blocks the door');
  game.flags['gave:helperWood'] = true;
  VL.place(game, VL.SHOCKWAVE_WAKE);
  assert.ok(!game.room.entities.some((e) => e.type === 'npc'));
  assert.match([].concat(VL.pickDialogue(game, 'gran').say).join(' '), /Brannock/);
  game.items.woodSword = true;
  assert.doesNotMatch([].concat(VL.pickDialogue(game, 'gran').say).join(' '), /Brannock/, 'not once he has a sword');
});

// ---------- the climb back ----------

test('the climb is short: Gran\'s wood and one more piece make a wood sword', () => {
  const { VL } = loadGame();
  assert.equal(VL.TUNING.prices.woodSword.wood - VL.TUNING.helperWood, 1, 'the popup and Gran say "one more"');
  assert.match(VL.POPUPS.helperWood.text, new RegExp(`${VL.TUNING.prices.woodSword.wood} wood`));
});

test('the home corner is quiet while he has no sword after the shockwave; the slimes and crabs come back with a sword', () => {
  const { VL } = loadGame();
  const game = VL.newGame();
  const enemiesOn = (screen) => {
    VL.place(game, { area: 'overworld', screen, tx: 8, ty: 5 });
    return game.room.entities.filter((e) => VL.isEnemy(e)).length;
  };
  const before = Object.fromEntries(VL.SHOCKWAVE_QUIET.map((screen) => [screen, enemiesOn(screen)]));
  assert.ok(before['1,0'] >= 2 && before['0,1'] >= 1, 'slimes in the fields and a crab on the beach');
  VL.applyShockwave(game);
  for (const screen of VL.SHOCKWAVE_QUIET) assert.equal(enemiesOn(screen), 0, `${screen} is quiet`);
  game.items.woodSword = true;
  for (const screen of VL.SHOCKWAVE_QUIET) assert.equal(enemiesOn(screen), before[screen], `${screen} is back to normal`);
});

test('a pull that faints the hero keeps what the bush dropped', () => {
  const { VL } = loadGame();
  const app = VL.createApp();
  app.game = VL.newGame();
  app.setScene('play');
  const game = app.game;
  game.popups.seen.controls = game.popups.seen.pull = true;
  VL.bushDrop = () => 'wood';
  const bush = VL.getScreen('overworld', '1,1').tiles.findIndex((row) => row.includes('B'));
  const bx = VL.getScreen('overworld', '1,1').tiles[bush].indexOf('B');
  VL.place(game, { area: 'overworld', screen: '1,1', tx: bx, ty: bush + 1, facing: 'up' });
  game.hp = 1;
  app.update(VL.actions({ pressed: ['interact'] }), STEP);
  assert.equal(app.sceneId, 'fainted');
  assert.equal(game.inventory.wood, 1, 'the wood is his');
  for (let s = 0; s < 1; s += STEP) app.update(VL.noActions(), STEP);
  app.update(VL.actions({ pressed: ['interact'] }), STEP);
  assert.equal(app.sceneId, 'play');
  assert.equal(game.inventory.wood, 1, 'and still his after waking');
  assert.ok(game.popups.queue.includes('wood') || game.popups.seen.wood, 'and the find is explained');
});

test('the climb with real keys: from waking at home, bare-hand pulls on the home bushes to a third piece of wood, then the smith makes a sword', () => {
  const t = beaten();
  const { VL } = t;
  throughScene(t);
  t.closePopups();
  t.until((app) => app.sceneId === 'dialogue', 0.5);
  talkThrough({ app: t.app, hold: (held, s) => t.hold(held, s), press: (a) => t.press(a) });
  t.closePopups();
  const play = createPlaythrough(VL, { app: t.app });
  const { drive } = play;
  drive.fight = true;
  let pulls = 0;
  let faints = 0;
  // A broken shell on the way stops him with its popup: read it and go on.
  const walk = (target) => {
    for (let tries = 0; tries < 6; tries += 1) {
      try {
        drive.walkTo(target);
        return;
      } catch (error) {
        if (!/not reached/.test(error.message)) throw error;
        drive.closePopups();
      }
    }
    drive.walkTo(target);
  };
  const bushesOn = (screen) => {
    const spots = [];
    VL.getScreen('overworld', screen).tiles.forEach((row, ty) => [...row].forEach((ch, tx) => {
      if (VL.tileInfo('overworld', ch).cuttable && !VL.tileInfo('overworld', ch).berry && ty + 1 < VL.TUNING.rows) spots.push({ tx, ty });
    }));
    return spots;
  };
  for (let round = 0; round < 12 && drive.state.inventory.wood < 3; round += 1) {
    for (const screen of ['1,1', '1,0']) {
      for (const { tx, ty } of bushesOn(screen)) {
        if (drive.state.inventory.wood >= 3) break;
        const below = { area: 'overworld', screen, tx, ty: ty + 1 };
        if (!findPath(VL, { area: drive.state.player.area, screen: drive.state.player.screen, ...VL.heroTile(drive.state) }, { ...below }, drive.state)) continue;
        walk(below);
        drive.hold(['up'], 0.05);
        const hp = drive.state.hp;
        drive.press('mainHand');
        assert.ok(drive.state.hp < hp || drive.app.sceneId === 'fainted', 'the pull hurt: it was a bush');
        pulls += 1;
        if (drive.app.sceneId === 'fainted') {
          faints += 1;
          drive.hold([], 0.8);
          drive.press('interact');
        }
        drive.closePopups();
        drive.hold([], 0.1);
        assert.ok(!drive.state.room.entities.some((e) => VL.isEnemy(e)), 'no enemy on the way');
        // Walk onto a drop, if there is one.
        const drop = drive.state.room.entities.find((e) => e.type === 'drop' && e.kind !== 'heart');
        if (drop) {
          walk({ tx: drop.x, ty: drop.y });
          drive.closePopups();
        }
      }
      if (drive.state.inventory.wood >= 3) break;
      // Bushes grow back once he has left the screen.
      walk({ area: 'overworld', screen: '2,1', tx: 3, ty: 5 });
    }
  }
  assert.ok(drive.state.inventory.wood >= 3, `three wood after ${pulls} pulls`);
  assert.ok(pulls <= 40, `${pulls} pulls`);
  const smithy = VL.BUILDINGS.blacksmith;
  walk({ area: 'blacksmith', screen: '0,0', ...smithy.talkAt });
  drive.hold(['up'], 0.05);
  drive.press('interact');
  drive.until(() => drive.app.sceneId === 'dialogue', 0.5);
  talkThrough(drive);
  assert.equal(drive.app.sceneId, 'shop');
  const offer = VL.SHOPS.smithy.offers.find((o) => o.id === 'woodSword');
  assert.equal(VL.buyOffer(drive.state, offer).ok, true, `a wood sword after ${pulls} pulls and ${faints} faints`);
});

// ---------- the playthrough, the fixture, the words ----------

test('playthrough: from the title through the Thornback to waking at home with Gran\'s wood, reloading after each milestone', () => {
  const { VL } = loadGame();
  const drive = createPlaythrough(VL).playTo('shockwave');
  const game = drive.state;
  assert.ok(VL.LOCKS.helperWood.reached(game) && VL.hasItem(game, 'glowstone'));
  assert.deepEqual([VL.hasItem(game, 'woodSword'), VL.hasItem(game, 'woodShield'), game.inventory.wood], [false, false, 2]);
  assert.ok(VL.hasItem(game, 'grapplingRope') && VL.hasItem(game, 'liftingGloves') && VL.hasItem(game, 'mortarPestle'));
  assert.deepEqual([game.player.area, game.player.screen], ['hut', '0,0']);
});

test('the W16 fixture loads with no field reset, after the shockwave and Gran\'s gift, and nothing runs again', () => {
  const text = fixture('save-v1-W16.json');
  const save = JSON.parse(text);
  assert.ok(save.flags.shockwave && save.flags.shockwaveWoke && save.flags['gave:helperWood'] && save.items.glowstone);
  const { VL } = loadGame();
  assert.deepEqual(plain(VL.readSlot(VL.createStorage(memoryStorage({ [VL.slotKey(0)]: text })), 0).resets), []);
  const t = load(text, { VL });
  t.hold([], 2);
  assert.equal(t.scene, 'play');
  assert.deepEqual(plain(t.game.inventory), save.inventory);
  assert.ok(!t.game.room.entities.some((e) => e.type === 'npc'), 'Gran has gone home');
});

test('every word of the shockwave fits its font and its box, with nothing crass', () => {
  const { VL } = loadGame();
  const lines = [...VL.SHOCKWAVE_LINES];
  for (const entry of VL.DIALOGUES.gran.slice(0, 2)) lines.push(...[].concat(entry.say));
  for (const id of ['glowstone', 'helperWood']) lines.push(VL.POPUPS[id].title, VL.POPUPS[id].text);
  lines.push(VL.ITEMS.glowstone.about);
  for (const line of lines) assert.deepEqual(plain(VL.ART.missingGlyphs(line.replace('{name}', 'Robin'))), [], line);
  for (const line of VL.SHOCKWAVE_LINES) assert.ok(VL.ART.wrapText(line, 216).length <= 5, `${line} fits on black`);
  for (const id of ['glowstone', 'helperWood']) {
    assert.ok(VL.ART.wrapText(VL.POPUPS[id].text, VL.ART.POPUP.width - VL.ART.POPUP.pad * 2).length <= VL.ART.POPUP.maxLines, `${id} popup fits`);
  }
  assert.deepEqual(plain(VL.dialogueProblems()), []);
});

test('render: every phase of the scene draws, and the Glowstone has its sprite', () => {
  const document = fakeDocument();
  const { VL } = loadGame({ document });
  const ctx = document.canvas.getContext('2d');
  const app = VL.createApp();
  app.game = VL.newGame();
  app.setScene('play');
  assert.ok(VL.ART.SPRITES['item-glowstone']);
  for (const from of ['rumble', 'dark']) {
    app.setScene('shockwave', { from });
    for (let s = 0; s < 12 && app.sceneId === 'shockwave'; s += 0.1) {
      assert.doesNotThrow(() => app.draw(ctx, s));
      app.update(VL.actions({ pressed: s > 4 ? ['interact'] : [] }), 0.1);
    }
  }
  assert.equal(app.sceneId, 'play');
});
