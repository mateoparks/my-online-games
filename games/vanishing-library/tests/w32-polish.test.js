// W32, the polish pass: the Mirror Shield lands in the off hand, nothing
// hides under the HUD, save points say where he wakes, broken shells show in
// the counts, and the flash guard's red rule (that one lives in smoke.js).
const assert = require('node:assert/strict');
const { test, loadGame, fakeDocument, memoryStorage } = require('./harness');

const plain = (value) => JSON.parse(JSON.stringify(value));

// ---------- 1. the Mirror Shield is always in a hand ----------

test('the Mirror Shield goes into the off hand even when it is full; the old item stays in the bag', () => {
  const { VL } = loadGame();
  const game = VL.newGame({ name: 'Robin' });
  for (const id of ['woodSword', 'slingshot']) game.items[id] = true;
  game.hands = { mainHand: 'woodSword', offHand: 'slingshot' };
  VL.giveItem(game, 'mirrorShield');
  assert.deepEqual(plain(game.hands), { mainHand: 'woodSword', offHand: 'mirrorShield' });
  assert.ok(VL.hasItem(game, 'slingshot'), 'the slingshot is still his, in the equipment list');
  assert.ok(VL.equipmentItems(game).some((item) => item.id === 'slingshot'));
  const popup = VL.popupText(VL.POPUPS.mirrorShield.text, game);
  assert.ok(/off hand/.test(popup) && /\bD\b/.test(popup), popup);
});

test('the Mirror Shield moves a one-handed off-hand item into an empty main hand, not the bag', () => {
  const { VL } = loadGame();
  const game = VL.newGame({ name: 'Robin' });
  game.items.slingshot = true;
  game.hands = { mainHand: null, offHand: 'slingshot' };
  VL.giveItem(game, 'mirrorShield');
  assert.deepEqual(plain(game.hands), { mainHand: 'slingshot', offHand: 'mirrorShield' });
});

test('the Mirror Shield over a two-handed shovel frees both hands and takes the off hand', () => {
  const { VL } = loadGame();
  const game = VL.newGame({ name: 'Robin' });
  game.items.woodShovel = true;
  game.hands = { mainHand: 'woodShovel', offHand: 'woodShovel' };
  VL.giveItem(game, 'mirrorShield');
  assert.deepEqual(plain(game.hands), { mainHand: null, offHand: 'mirrorShield' });
});

test('the Mirror Shield already owned and moved to the bag is not pushed back into a hand', () => {
  const { VL } = loadGame();
  const game = VL.newGame({ name: 'Robin' });
  for (const id of ['woodSword', 'slingshot', 'mirrorShield']) game.items[id] = true;
  game.hands = { mainHand: 'woodSword', offHand: 'slingshot' };
  VL.giveItem(game, 'mirrorShield');
  assert.deepEqual(plain(game.hands), { mainHand: 'woodSword', offHand: 'slingshot' });
});

test('other gear still only fills an empty hand (a forged metal shield leaves the wood one held)', () => {
  const { VL } = loadGame();
  const game = VL.newGame({ name: 'Robin' });
  for (const id of ['woodSword', 'woodShield']) game.items[id] = true;
  game.hands = { mainHand: 'woodSword', offHand: 'woodShield' };
  VL.giveItem(game, 'metalShield');
  assert.deepEqual(plain(game.hands), { mainHand: 'woodSword', offHand: 'woodShield' });
});

// ---------- 2. nothing important hides under the HUD ----------

// A context that keeps every filled rectangle, in the coordinates drawn.
function recordingContext() {
  const rects = [];
  let dx = 0;
  let dy = 0;
  const stack = [];
  const ctx = new Proxy({}, {
    get(_, property) {
      if (property === 'rects') return rects;
      if (property === 'fillRect') return (x, y, w, h) => rects.push({ x: x + dx, y: y + dy, w, h });
      if (property === 'translate') return (x, y) => { dx += x; dy += y; };
      if (property === 'save') return () => stack.push([dx, dy]);
      if (property === 'restore') return () => { [dx, dy] = stack.pop() || [0, 0]; };
      if (property === 'measureText') return () => ({ width: 8 });
      if (property.startsWith?.('create')) return () => ({ addColorStop() {} });
      if (property === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return () => {};
    },
    set: () => true,
  });
  return ctx;
}

const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// What each still thing in a room paints inside `area` (play-area pixels).
function paintedUnder(VL, room, area) {
  const under = [];
  for (const entity of room.entities) {
    if (VL.isEnemy(entity)) continue;
    const ctx = recordingContext();
    VL.ENTITIES[entity.type]?.draw?.(ctx, entity, entity.x * VL.TUNING.tile, entity.y * VL.TUNING.tile, 0);
    if (ctx.rects.some((r) => r.w > 0 && r.h > 0 && meets(r, area))) under.push(`${entity.type}${entity.art ? ` ${entity.art}` : ''}${entity.id ? ` ${entity.id}` : ''} (${entity.x},${entity.y})`);
  }
  return under;
}

test('the dungeon keys HUD covers nothing in any dungeon room, the hoard spilled or not (W18 QA 3, W19 QA 4)', () => {
  const { VL } = loadGame();
  const game = VL.newGame({ name: 'Robin' });
  const under = [];
  for (const dungeon of Object.values(VL.DUNGEONS)) {
    for (const screen of Object.keys(VL.AREAS[dungeon.area].screens)) {
      VL.place(game, { area: dungeon.area, screen, tx: 7, ty: 5, facing: 'up' });
      under.push(...paintedUnder(VL, game.room, VL.DUNGEON_HUD).map((s) => `${dungeon.area} ${screen} ${s}`));
      for (const decor of game.room.entities.filter((e) => e.art === 'lairHoard')) {
        decor.spilled = true;
        under.push(...paintedUnder(VL, game.room, VL.DUNGEON_HUD).map((s) => `${dungeon.area} ${screen} spilled ${s}`));
      }
    }
  }
  assert.deepEqual(under, []);
});

test('under the dungeon keys HUD every room has only plain terrain: no door, hole or other tile to find', () => {
  const { VL } = loadGame();
  const game = VL.newGame({ name: 'Robin' });
  const { tile } = VL.TUNING;
  const box = VL.DUNGEON_HUD;
  const plain = (info) => !info.door && !info.hole && ['wall', 'floor', 'shelf', 'roots', 'pit', 'rock'].some((kind) => info[kind]);
  const under = [];
  for (const dungeon of Object.values(VL.DUNGEONS)) {
    for (const screen of Object.keys(VL.AREAS[dungeon.area].screens)) {
      VL.place(game, { area: dungeon.area, screen, tx: 7, ty: 5, facing: 'up' });
      for (let ty = Math.floor(box.y / tile); ty * tile < box.y + box.h; ty += 1) {
        for (let tx = Math.floor(box.x / tile); tx * tile < box.x + box.w; tx += 1) {
          const ch = VL.tileAt(dungeon.area, screen, tx, ty, game.room);
          if (!plain(VL.tileInfo(dungeon.area, ch))) under.push(`${dungeon.area} ${screen} '${ch}' (${tx},${ty})`);
        }
      }
    }
  }
  assert.deepEqual(under, []);
});

test('the keys HUD is drawn inside VL.DUNGEON_HUD', () => {
  const { VL } = loadGame();
  const game = VL.newGame({ name: 'Robin' });
  VL.place(game, { area: 'lair', screen: '0,0', tx: 7, ty: 5, facing: 'up' });
  VL.dungeonState(game, 'lair').bossKey = true;
  VL.dungeonState(game, 'lair').keys = 9;
  const ctx = recordingContext();
  const layer = VL.HERO_LAYERS.find((l) => l.id === 'dungeonHud' || l.name === 'dungeonHud');
  layer.draw(ctx, game, 0, 0, 0, 'overlay');
  const box = VL.DUNGEON_HUD;
  const outside = ctx.rects.filter((r) => r.x < box.x || r.y < box.y || r.x + r.w > box.x + box.w || r.y + r.h > box.y + box.h);
  assert.ok(ctx.rects.length > 0);
  assert.deepEqual(outside, []);
  // A room's note (the longest a save point says) is drawn by the same layer, clear of the keys.
  game.dungeonNote = { text: 'Your journey is saved. You\'ll wake up by the harbour.', t: 0 };
  const withNote = recordingContext();
  layer.draw(withNote, game, 0, 0, 0, 'overlay');
  const note = withNote.rects.slice(ctx.rects.length);
  assert.ok(note.length > 0, 'the note is drawn');
  assert.deepEqual(note.filter((r) => meets(r, box)), [], 'the note keeps above the keys');
});

// The HUD bar's own pixels (past its background and bottom line), and a note's.
function hudPixels(VL, game) {
  const ctx = recordingContext();
  VL.ART.drawHud(ctx, game, 0);
  return ctx.rects.slice(2);
}

function notePixels(VL, app, t) {
  const ctx = recordingContext();
  const original = VL.drawWorld;
  VL.drawWorld = () => {};
  try {
    VL.SCENES.play.draw(ctx, app, t);
  } finally {
    VL.drawWorld = original;
  }
  return ctx.rects;
}

test('SAVED and COULD NOT SAVE sit in the HUD bar, clear of the hearts, the shell counts and the hand slots', () => {
  const { VL } = loadGame();
  const app = VL.createApp();
  app.game = VL.newGame({ name: 'Robin' });
  const game = app.game;
  game.maxHp = 40;
  game.hp = 40;
  game.inventory.shells = 250;
  game.inventory.brokenShells = 999;
  for (const id of ['woodSword', 'mirrorShield']) game.items[id] = true;
  game.hands = { mainHand: 'woodSword', offHand: 'mirrorShield' };
  const hud = hudPixels(VL, game);
  app.savedAt = app.time;
  const saved = notePixels(VL, app, 0);
  app.saveFailed = true;
  const failed = notePixels(VL, app, 0);
  for (const [name, note] of [['SAVED', saved], ['COULD NOT SAVE', failed]]) {
    assert.ok(note.length > 0, `${name} is drawn`);
    assert.ok(note.every((r) => r.y >= 0 && r.y + r.h <= VL.TUNING.hudHeight - 1), `${name} is inside the HUD bar`);
    assert.deepEqual(note.filter((r) => hud.some((h) => meets(r, h))), [], `${name} touches nothing else in the HUD`);
  }
});

// ---------- 3. a save point says where he will wake ----------

function drawnText(VL, app, t = 1) {
  const strings = [];
  const original = VL.ART.text;
  VL.ART.text = (ctx, str, ...rest) => {
    strings.push(String(str));
    return original(ctx, str, ...rest);
  };
  try {
    VL.render(fakeDocument().createElement('canvas').getContext('2d'), app, t);
  } finally {
    VL.ART.text = original;
  }
  return strings;
}

// The Scriptorium's statue, with its boss beaten and (when `done`) the heart taken.
function atScriptoriumStatue({ done }) {
  const { VL } = loadGame();
  const app = VL.createApp({ storage: VL.createStorage(memoryStorage()) });
  app.game = VL.newGame({ name: 'Robin' });
  app.setScene('play');
  const game = app.game;
  game.popups.seen.controls = true;
  const [screen, statue] = Object.entries(VL.AREAS.scriptorium.screens).flatMap(([key, s]) => s.entities.filter((e) => e.type === 'saveStatue').map((e) => [key, e]))[0];
  VL.place(game, { area: 'scriptorium', screen, tx: statue.x, ty: statue.y, facing: 'down' });
  VL.dungeonState(game, 'scriptorium').boss = true;
  if (done) VL.markFound(game, VL.DUNGEONS.scriptorium.boss.heart);
  VL.ENTITIES.saveStatue.onStand(game, statue);
  return { VL, app, game };
}

test('a statue in a dungeon still to finish says the journey is saved; a finished one says he wakes at home', () => {
  const open = atScriptoriumStatue({ done: false });
  assert.equal(open.game.dungeonNote.text, 'The statue glows. Your journey is saved.');
  assert.equal(open.VL.wakeWords(open.game), null);
  const done = atScriptoriumStatue({ done: true });
  assert.equal(done.VL.wakeWords(done.game), 'at home');
  assert.equal(done.game.dungeonNote.text, 'Your journey is saved. You\'ll wake up at home.');
});

test('the faint screen and the pause menu name where he wakes when it is not the save point', () => {
  for (const [done, faint, pause] of [[false, 'You wake up at your last save point.', 'CONTINUE STARTS AT YOUR LAST SAVE POINT'], [true, 'You wake up at home.', 'CONTINUE STARTS AT HOME']]) {
    const { VL, app, game } = atScriptoriumStatue({ done });
    app.setScene('pause');
    app.pause.cursor = VL.PAUSE_OPTIONS.indexOf('Save & Quit');
    assert.ok(drawnText(VL, app).includes(pause), `pause, done ${done}`);
    app.setScene('play');
    VL.faint(game, 'crab');
    app.setScene('fainted');
    assert.ok(drawnText(VL, app).includes(faint), `faint, done ${done}`);
  }
});

test('the wreck\'s lantern, once the page is found, says he wakes by the harbour; before it, it only saves', () => {
  for (const page of [false, true]) {
    const { VL } = loadGame();
    const game = VL.newGame({ name: 'Robin' });
    const [screen, lantern] = Object.entries(VL.AREAS.wreck.screens).flatMap(([key, s]) => s.entities.filter((e) => e.type === 'savePoint').map((e) => [key, e]))[0];
    VL.place(game, { area: 'wreck', screen, tx: lantern.x, ty: lantern.y, facing: 'down' });
    if (page) game.flags['found:pageShipwreck'] = true;
    VL.ENTITIES.savePoint.onStand(game, lantern);
    assert.equal(game.dungeonNote?.text ?? null, page ? 'Your journey is saved. You\'ll wake up by the harbour.' : null);
    assert.equal(VL.wakeWords(game), page ? 'by the harbour' : null);
  }
});

test('when the save cannot be written, the statue and the lantern never say the journey is saved, and do once a retry works', () => {
  for (const done of [false, true]) {
    const { VL } = loadGame();
    const backing = memoryStorage();
    const app = VL.createApp({ storage: VL.createStorage(backing) });
    app.startGame(VL.newGame({ name: 'Robin' }), 0, { fresh: true });
    app.setScene('play');
    const game = app.game;
    game.popups.seen.controls = true;
    const [screen, statue] = Object.entries(VL.AREAS.scriptorium.screens).flatMap(([key, s]) => s.entities.filter((e) => e.type === 'saveStatue').map((e) => [key, e]))[0];
    VL.place(game, { area: 'scriptorium', screen, tx: statue.x, ty: statue.y, facing: 'down' });
    VL.dungeonState(game, 'scriptorium').boss = true;
    if (done) VL.markFound(game, VL.DUNGEONS.scriptorium.boss.heart);
    const setItem = backing.setItem;
    backing.setItem = () => { throw new Error('full'); };
    VL.ENTITIES.saveStatue.onStand(game, statue);
    app.update(VL.noActions(), VL.TUNING.step);
    assert.ok(app.saveFailed, 'the write failed');
    const failed = game.dungeonNote.text;
    assert.ok(!/is saved/i.test(failed) && /could not save/i.test(failed), failed);
    if (done) assert.ok(/wake up at home/.test(failed), failed);
    assert.ok(drawnText(VL, app).includes(failed), 'the failed words are what is drawn');
    backing.setItem = setItem;
    app.update(VL.noActions(), VL.TUNING.step);
    assert.ok(!app.saveFailed, 'the retry worked');
    assert.equal(game.dungeonNote.text, done ? 'Your journey is saved. You\'ll wake up at home.' : 'The statue glows. Your journey is saved.');
  }
  const { VL } = loadGame();
  const backing = memoryStorage();
  const app = VL.createApp({ storage: VL.createStorage(backing) });
  app.startGame(VL.newGame({ name: 'Robin' }), 0, { fresh: true });
  const game = app.game;
  const [screen, lantern] = Object.entries(VL.AREAS.wreck.screens).flatMap(([key, s]) => s.entities.filter((e) => e.type === 'savePoint').map((e) => [key, e]))[0];
  VL.place(game, { area: 'wreck', screen, tx: lantern.x, ty: lantern.y, facing: 'down' });
  game.flags['found:pageShipwreck'] = true;
  backing.setItem = () => { throw new Error('full'); };
  VL.ENTITIES.savePoint.onStand(game, lantern);
  app.save();
  assert.equal(game.dungeonNote.text, 'Could not save yet. You\'ll wake up by the harbour.');
});

test('the hut\'s lantern out in the world shows no note: he wakes right there', () => {
  const { VL } = loadGame();
  const game = VL.newGame({ name: 'Robin' });
  VL.place(game, VL.HOME_SAVE);
  const lantern = game.room.entities.find((e) => e.type === 'savePoint');
  VL.ENTITIES.savePoint.onStand(game, lantern);
  assert.equal(game.dungeonNote ?? null, null);
  assert.equal(VL.wakeWords(game), null);
});

// ---------- 4. broken shells show in the counts ----------

function hudStrings(VL, game) {
  const strings = [];
  const sprites = [];
  const { text, drawSprite } = VL.ART;
  VL.ART.text = (ctx, str, ...rest) => {
    strings.push(String(str));
    return text(ctx, str, ...rest);
  };
  VL.ART.drawSprite = (ctx, id, ...rest) => {
    sprites.push(id);
    return drawSprite(ctx, id, ...rest);
  };
  try {
    VL.ART.drawHud(fakeDocument().createElement('canvas').getContext('2d'), game, 0);
  } finally {
    Object.assign(VL.ART, { text, drawSprite });
  }
  return { strings, sprites };
}

test('the HUD shows broken shells beside the whole ones once he has any, so 000 after the shockwave is not the whole story', () => {
  const { VL } = loadGame();
  const game = VL.newGame({ name: 'Robin' });
  const none = hudStrings(VL, game);
  assert.ok(!none.sprites.includes('icon-shell-broken'), 'no broken shells, no extra count');
  game.inventory.brokenShells = 7;
  const some = hudStrings(VL, game);
  assert.ok(some.sprites.includes('icon-shell-broken'));
  assert.ok(some.strings.includes('7'), some.strings.join('|'));
});

test('the broken-shell count never runs into the whole shells or the hand slots, even at 999', () => {
  const { VL } = loadGame();
  const game = VL.newGame({ name: 'Robin' });
  game.inventory.shells = 250;
  for (const n of [1, 99, 999]) {
    game.inventory.brokenShells = n;
    const ctx = recordingContext();
    VL.ART.drawHud(ctx, game, 0);
    const layout = VL.ART.HUD_LAYOUT;
    const right = layout.brokenX + 10 + VL.ART.measureText(String(n), 'normal');
    assert.ok(layout.brokenX > layout.shellX + 10 + VL.ART.measureText('250', 'normal'), 'after the whole shells');
    assert.ok(right < layout.slots[0].x, `${n} ends before the main-hand slot`);
  }
});

test('a shop\'s "YOU HAVE" line counts broken shells too when it deals in shells, and still fits its box', () => {
  const { VL } = loadGame();
  const app = VL.createApp();
  app.game = VL.newGame({ name: 'Robin' });
  Object.assign(app.game.inventory, { shells: 250, brokenShells: 999, wood: 99, ore: 9 });
  app.setScene('shop', { shop: 'smithy' });
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
  const line = strings.find((s) => s.startsWith('YOU HAVE'));
  assert.ok(/250 shells {2}999 broken\b/.test(line), line);
  assert.ok(VL.ART.measureText(line, 'small') <= 224 - 16, `${line} fits`);
  app.game.inventory.brokenShells = 0;
  strings.length = 0;
  VL.ART.text = (ctx, str, ...rest) => {
    strings.push(String(str));
    return original(ctx, str, ...rest);
  };
  try {
    VL.render(fakeDocument().createElement('canvas').getContext('2d'), app, 0);
  } finally {
    VL.ART.text = original;
  }
  assert.ok(!strings.find((s) => s.startsWith('YOU HAVE')).includes('broken'), 'none, not "0 broken shells"');
});
