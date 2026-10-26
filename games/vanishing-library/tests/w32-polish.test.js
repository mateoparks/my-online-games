// W32, the polish pass: the Mirror Shield lands in the off hand, nothing
// hides under the HUD, save points say where he wakes, broken shells show in
// the counts, and the flash guard's red rule (that one lives in smoke.js).
const assert = require('node:assert/strict');
const { test, loadGame } = require('./harness');

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
  const popup = VL.POPUPS.mirrorShield.text;
  assert.ok(/off hand/.test(popup) && /\bD\b/.test(popup), popup);
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
