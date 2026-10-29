// W38, Matthew's fifth playtest notes (world, combat and Easter eggs): the
// rope pulls light enemies in, the egg on his face, the Lighthouse's map, the
// wreck's five shells, the metal shovel on paths and forest floor, and the
// quiet fields after the shockwave.
const assert = require('node:assert/strict');
const { test, loadGame, playState, hold, holdUntil, fakeDocument } = require('./harness');
const { findPath } = require('./playthrough');

const ow = (screen, tx, ty, facing = 'up') => ({ area: 'overworld', screen, tx, ty, facing });
const here = (screen, tx, ty, facing = 'up') => ({ area: 'w38', screen, tx, ty, facing });

const OPEN = [
  'TTTTTTTTTTTTTTTT',
  'T..............T',
  'T..............T',
  'T..............T',
  'T..............T',
  'T...............',
  'T..............T',
  'T..............T',
  'T..............T',
  'T..............T',
  'TTTTTTTTTTTTTTTT',
];

// Two open fields side by side, and a third (alone) with a row of water the
// hook flies over but a slime can't cross.
function addArea(VL) {
  VL.addScreens('w38', {
    '0,0': { tiles: OPEN, entities: [] },
    '1,0': { tiles: OPEN.map((row, y) => (y === 5 ? `.${row.slice(1, 15)}T` : row)), entities: [] },
    '5,5': { tiles: OPEN.map((row, y) => (y === 4 ? 'TWWWWWWWWWWWWWWT' : y === 5 ? 'T..............T' : row)), entities: [] },
  });
}

function setup(where = here('0,0', 7, 7)) {
  const ctx = loadGame();
  const { VL } = ctx;
  addArea(VL);
  const state = playState(VL, where);
  VL.giveItem(state, 'grapplingRope');
  if (VL.heldItem(state, 'mainHand') !== 'grapplingRope') VL.setHand(state, 'mainHand', 'grapplingRope');
  state.popups.queue.length = 0;
  state.popups.seen.controls = true;
  const press = (action) => VL.updateWorld(state, VL.actions({ pressed: [action] }), 1 / 60);
  const enemy = (type, tx, ty) => {
    const e = VL.spawnEnemy(state, type, tx, ty);
    e.arriving = 0;
    return e;
  };
  return { VL, state, press, enemy, ctx };
}

const overlapHero = (state, e, VL) => {
  const body = VL.ENEMIES[e.type].body;
  return Math.abs(e.cx - state.player.x) * 2 < 10 + body.w && Math.abs(e.cy - (state.player.y - 5)) * 2 < 14 + body.h;
};

// ---------- the rope pulls light enemies in ----------

test('the slimes, bats, gulls and beach crabs are the light enemies; the Lens Crab, the bosses and the rest are not', () => {
  const { VL } = loadGame();
  const light = Object.keys(VL.ENEMIES).filter((type) => VL.ENEMIES[type].light).sort();
  assert.deepEqual(light, ['bat', 'crab', 'gull', 'slime']);
});

// The hero stands mid-field; each light enemy waits four tiles off in the
// direction he faces.
const PULL_FROM = { up: [7, 1], down: [7, 9], left: [3, 5], right: [11, 5] };
for (const type of ['slime', 'bat', 'gull', 'crab']) for (const [facing, [ex, ey]] of Object.entries(PULL_FROM)) {
  test(`the hook pulls a ${type} right up to him facing ${facing}: half a heart off, and it sits stunned in front of him long enough for a swing`, () => {
    const { VL, state, press, enemy } = setup(here('0,0', 7, 5, facing));
    const e = enemy(type, ex, ey);
    const { hp } = state;
    press('mainHand');
    hold(VL, state, [], 0.8);
    assert.equal(state.player.rope, null, 'the rope is back');
    assert.equal(state.hp, hp - 1, 'half a heart');
    assert.ok(e.stunned > VL.TUNING.swingSeconds + 0.3, `stunned for ${e.stunned}`);
    assert.equal(e.hp, VL.ENEMIES[type].hp, 'the pull itself does not hurt it');
    const [fx, fy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[facing];
    const ahead = (e.cx - state.player.x) * fx + (e.cy - (state.player.y - 5)) * fy;
    const aside = (e.cx - state.player.x) * fy + (e.cy - (state.player.y - 5)) * fx;
    assert.ok(Math.abs(aside) < 1, `straight in front (${aside} aside)`);
    assert.ok(Math.abs(ahead - VL.TUNING.ropePullGap) < 1, `${ahead} px in front`);
    assert.ok(!overlapHero(state, e, VL), 'not on top of him');
    const { tx, ty } = VL.tileOf(e.cx, e.cy);
    assert.ok(!VL.isSolidAt('w38', '0,0', tx, ty, state.room), 'on open ground');
    assert.ok(VL.ART.SPRITES['fx-stun-star'], 'dizzy stars');
    // It holds still and harmless while stunned...
    const at = [e.cx, e.cy];
    const hpNow = state.hp;
    hold(VL, state, [], 0.5);
    assert.deepEqual([e.cx, e.cy], at, 'holds still');
    assert.equal(state.hp, hpNow);
    // ... and a swing at once lands on it.
    state.items.woodSword = true;
    VL.setHand(state, 'offHand', 'woodSword');
    press('offHand');
    hold(VL, state, [], 0.1);
    assert.ok(e.hp < VL.ENEMIES[type].hp || !state.room.entities.includes(e), 'the sword hits it');
  });
}

test('the half heart gets past a raised shield and the hurt flash: it is the price of the pull', () => {
  const { VL, state, enemy } = setup();
  state.items.metalShield = true;
  VL.setHand(state, 'offHand', 'metalShield');
  const e = enemy('slime', 7, 3);
  const { hp } = state;
  state.player.invuln = 0.5;
  VL.updateWorld(state, VL.actions({ pressed: ['mainHand'], held: ['offHand'] }), 1 / 60);
  hold(VL, state, ['offHand'], 0.8);
  assert.equal(state.hp, hp - 1);
  assert.ok(e.stunned > 0);
});

test('on the last half heart, the pull faints him', () => {
  const { VL, state, press, enemy } = setup();
  enemy('slime', 7, 3);
  state.hp = 1;
  press('mainHand');
  hold(VL, state, [], 0.8);
  assert.equal(state.hp, 0);
  assert.ok(state.fainted);
});

test('a pull never drags a slime into water or a wall: it stops at the edge, stunned, and the hero is not hurt', () => {
  const { VL, state, press, enemy } = setup(here('5,5', 7, 8));
  const e = enemy('slime', 7, 2);
  const { hp } = state;
  press('mainHand');
  hold(VL, state, [], 1);
  assert.equal(state.hp, hp, 'it never reached him');
  assert.ok(e.stunned > 0, 'stunned where it stopped');
  const body = VL.ENEMIES.slime.body;
  assert.ok(!VL.isBlocked('w38', '5,5', e.cx, e.cy, body.w, body.h, state.room), 'not inside the water');
  assert.ok(e.cy + body.h / 2 <= 4 * 16 + 1e-6, 'on the far side');
});

test('other enemies are hooked as before: a tough spitter is stunned where it stands, and nobody is hurt', () => {
  const { VL } = loadGame();
  const state = playState(VL, ow('7,-2', 4, 4, 'down'));
  VL.giveItem(state, 'grapplingRope');
  if (VL.heldItem(state, 'mainHand') !== 'grapplingRope') VL.setHand(state, 'mainHand', 'grapplingRope');
  state.popups.queue.length = 0;
  hold(VL, state, [], 1);
  const plant = state.room.entities.find((e) => e.type === 'spitter' && e.x === 4 && e.y === 7);
  const at = [plant.cx, plant.cy];
  const { hp } = state;
  VL.updateWorld(state, VL.actions({ pressed: ['mainHand'] }), 1 / 60);
  hold(VL, state, [], 0.4);
  assert.deepEqual([plant.cx, plant.cy], at);
  assert.ok(plant.calm > 0);
  assert.ok(!(plant.stunned > 0), 'only calmed, as before');
  assert.equal(state.hp, hp);
});

// ---------- egg on his face ----------

function egged() {
  const t = setup();
  const { VL, state } = t;
  const hen = { type: 'chicken', x: 7, y: 3 };
  VL.setUpChicken(state, hen);
  state.room.entities.push(hen);
  t.hen = hen;
  return t;
}

test('the hook at a chicken brings back an egg that splats on his face; the chicken is not hurt', () => {
  const { VL, state, press, hen } = egged();
  const events = [];
  press('mainHand');
  for (let s = 0; s < 1; s += 1 / 60) {
    VL.updateWorld(state, VL.noActions(), 1 / 60);
    events.push(...state.events.map((e) => e.type));
  }
  assert.ok(VL.eggOnFace(state), 'egg on his face');
  assert.ok(events.includes('eggSplat'));
  assert.ok(!events.includes('chickenHit'), 'not hit');
  assert.equal(state.room.chickens?.hits || 0, 0, 'no step towards the swarm');
  assert.ok(state.room.entities.includes(hen), 'the hen is still there');
  assert.equal(hen.mode === 'hop', false);
  assert.doesNotThrow(() => VL.sfx('eggSplat'), 'a splat sound');
});

test('with egg on his face the arrows go the other way, and Space and D swap hands', () => {
  const { VL, state, press } = egged();
  VL.splatEgg(state);
  const start = { x: state.player.x, y: state.player.y };
  hold(VL, state, ['up'], 0.3);
  assert.ok(state.player.y > start.y, 'up goes down');
  assert.equal(state.player.facing, 'down');
  hold(VL, state, ['left'], 0.3);
  assert.ok(state.player.x > start.x, 'left goes right');
  const y = state.player.y;
  hold(VL, state, ['down'], 0.3);
  assert.ok(state.player.y < y, 'down goes up');
  const x = state.player.x;
  hold(VL, state, ['right'], 0.3);
  assert.ok(state.player.x < x, 'right goes left');
  // Rope in the main hand, sword in the off hand: Space swings, D throws.
  state.items.woodSword = true;
  VL.setHand(state, 'offHand', 'woodSword');
  press('mainHand');
  assert.ok(state.player.swing, 'Space uses the off hand');
  assert.ok(!state.player.rope);
  hold(VL, state, [], 0.5);
  press('offHand');
  assert.ok(state.player.rope, 'D uses the main hand');
});

test('the swap lives in the actions, not the keys: the filter flips a copy and leaves the input untouched', () => {
  const { VL, state } = egged();
  VL.splatEgg(state);
  const actions = VL.actions({ held: ['up', 'left'], pressed: ['mainHand'] });
  const flipped = VL.filterActions(state, actions);
  assert.deepEqual([flipped.held.down, flipped.held.right, flipped.held.up, flipped.held.left], [true, true, false, false]);
  assert.deepEqual([flipped.pressed.offHand, flipped.pressed.mainHand], [true, false]);
  assert.deepEqual([actions.held.up, actions.pressed.mainHand], [true, true], 'the original is unchanged');
  state.room.egg = null;
  assert.equal(VL.filterActions(state, actions), actions, 'no egg, no change');
});

test('every person who talks, shopkeepers and the librarian too, only says "Looks like you have some egg on your face" while it is there', () => {
  const { VL, state } = egged();
  state.name = 'Robin';
  VL.splatEgg(state);
  const ids = Object.keys(VL.NPCS);
  assert.ok(ids.includes('librarian') && ids.includes('shopkeeper'), ids.join(' '));
  for (const id of ids) {
    state.sceneRequest = null;
    assert.equal(VL.talkTo(state, { type: 'npc', id, x: 9, y: 7 }), true, id);
    const { id: scene, data } = state.sceneRequest;
    assert.equal(scene, 'dialogue');
    assert.deepEqual(JSON.parse(JSON.stringify(data.pages.map((page) => page.join(' ')))), ['Looks like you have some egg on your face, Robin.'], id);
    assert.equal(data.shop, null, `${id}: no shop`);
    assert.ok(!data.end || (!data.end.set && !data.end.give), `${id}: no hand-in, no gift`);
  }
  state.room.egg = null;
  state.sceneRequest = null;
  VL.talkTo(state, { type: 'npc', id: 'shopkeeper', x: 9, y: 7 });
  assert.notEqual(state.sceneRequest.data.pages[0].join(' '), 'Looks like you have some egg on your face, Robin.');
});

test('any new screen clears the egg: an edge, a door or warp, a faint; and it is never saved', () => {
  const { VL, state } = egged();
  // He walks off the east edge holding left (it's on his face).
  VL.place(state, here('0,0', 14, 5, 'right'));
  VL.splatEgg(state);
  for (let i = 0; i < 120 && state.player.screen === '0,0'; i += 1) VL.updateWorld(state, VL.actions({ held: ['left'] }), 1 / 60);
  assert.equal(state.player.screen, '1,0');
  assert.ok(!VL.eggOnFace(state), 'an edge');
  VL.splatEgg(state);
  VL.place(state, here('0,0', 7, 7));
  assert.ok(!VL.eggOnFace(state), 'a door or a warp (both place him)');
  VL.splatEgg(state);
  const save = JSON.stringify(VL.serializeSave(state));
  assert.doesNotMatch(save, /egg/i, 'not saved');
  assert.ok(!VL.eggOnFace(VL.restoreGame(JSON.parse(save))), 'a reload clears it');
  VL.faint(state, 'slime');
  assert.ok(!VL.eggOnFace(state), 'a faint');
});

test('after the egg clears on a new screen, the arrow he is still holding does not walk him straight back until he lets go', () => {
  const { VL, state } = egged();
  VL.place(state, here('0,0', 14, 5, 'right'));
  VL.splatEgg(state);
  // Holding left walks him off the east edge (it's on his face)...
  for (let i = 0; i < 120 && state.player.screen === '0,0'; i += 1) VL.updateWorld(state, VL.actions({ held: ['left'] }), 1 / 60);
  assert.equal(state.player.screen, '1,0');
  assert.ok(!VL.eggOnFace(state));
  // ... and the same held left, now plain left again, is ignored.
  hold(VL, state, ['left'], 1);
  assert.equal(state.player.screen, '1,0', 'not walked back west');
  const x = state.player.x;
  hold(VL, state, ['left'], 0.3);
  assert.equal(state.player.x, x, 'still waiting for the key to be let go');
  // Once he lets go, left is left.
  hold(VL, state, [], 0.1);
  holdUntil(VL, state, ['left'], () => state.player.screen === '0,0');
  assert.ok(!VL.eggOnFace(state), 'left walks left, back west');
  // A screen change without the egg sets no hold.
  hold(VL, state, [], 1);
  VL.place(state, here('1,0', 7, 7));
  const y = state.player.y;
  hold(VL, state, ['up'], 0.2);
  assert.ok(state.player.y < y, 'no hold without an egg');
});

test('the splat draws over his face in every facing, on top of the hero', () => {
  const { VL, state } = egged();
  VL.splatEgg(state);
  const ctx = fakeDocument().createElement('canvas').getContext('2d');
  for (const facing of ['down', 'up', 'left', 'right']) {
    state.player.facing = facing;
    const drawn = [];
    const original = VL.ART.drawSprite;
    VL.ART.drawSprite = (c, id, ...rest) => {
      drawn.push(id);
      return original(c, id, ...rest);
    };
    try {
      VL.drawWorld(ctx, state, 0);
    } finally {
      VL.ART.drawSprite = original;
    }
    const hero = drawn.findIndex((id) => id.startsWith('hero-'));
    const egg = drawn.findIndex((id) => id.startsWith('fx-egg-face'));
    assert.ok(hero >= 0 && egg > hero, `${facing}: egg after hero (${drawn.join(',')})`);
  }
});

// Where the hero sprite and the splat land, from one drawWorld.
function drawnAt(VL, state) {
  const ctx = fakeDocument().createElement('canvas').getContext('2d');
  const drawn = [];
  const original = VL.ART.drawSprite;
  VL.ART.drawSprite = (c, id, x, y, ...rest) => {
    drawn.push({ id, x, y });
    return original(c, id, x, y, ...rest);
  };
  try {
    VL.drawWorld(ctx, state, 0);
  } finally {
    VL.ART.drawSprite = original;
  }
  return { hero: drawn.find((d) => d.id.startsWith('hero-')), egg: drawn.find((d) => d.id.startsWith('fx-egg-face')) };
}

// W37's face boxes from the hero sprite's top-left (README "Hero look"):
// down/hold columns 2-9, left 1-6, right 5-10, rows 2-6 counting the brow;
// up has no face, so the drips sit at the sides of the head.
const FACE_BOX = { down: [2, 9], left: [0, 6], right: [5, 11], up: [0, 11] };

test('the splat sits on the face in every look (each clothes colour, short or long hair, boy or girl), every facing and frame', () => {
  const { VL, state } = egged();
  VL.splatEgg(state);
  for (const outfit of VL.HERO_OUTFITS) {
    for (const hair of VL.HERO_HAIRS) {
      for (const gender of VL.HERO_GENDERS) {
        state.look = { outfit, hair, gender };
        for (const facing of ['down', 'up', 'left', 'right']) {
          for (const moving of [false, true]) {
            Object.assign(state.player, { facing, moving });
            const { hero, egg } = drawnAt(VL, state);
            const where = `${outfit} ${hair} ${gender} ${facing}${moving ? ' walking' : ''}`;
            assert.equal(egg?.id, `fx-egg-face-${facing}`, where);
            const sprite = VL.ART.sprite(egg.id);
            const [lo, hi] = FACE_BOX[facing];
            assert.ok(egg.x - hero.x >= lo && egg.x - hero.x + sprite.w - 1 <= hi, `${where}: columns ${egg.x - hero.x}..`);
            assert.ok(egg.y - hero.y >= 2 && egg.y - hero.y + sprite.h - 1 <= 6, `${where}: rows ${egg.y - hero.y}..`);
          }
        }
      }
    }
  }
});

test('holding something up (facing the camera) the splat is the face-on one, whichever way he last faced', () => {
  const { VL, state } = egged();
  VL.splatEgg(state);
  state.look = { outfit: 'pink', hair: 'long', gender: 'girl' };
  for (const facing of ['down', 'up', 'left', 'right']) {
    Object.assign(state.player, { facing, holding: true });
    const { hero, egg } = drawnAt(VL, state);
    assert.match(hero.id, /^hero-hold/, facing);
    assert.equal(egg?.id, 'fx-egg-face-down', facing);
    assert.deepEqual([egg.x - hero.x, egg.y - hero.y], [2, 2], facing);
  }
});

test('the egg line is the same for a boy and a girl, by name, with no word left for the hero', () => {
  for (const gender of ['boy', 'girl']) {
    const { VL, state } = egged();
    state.name = 'Robin';
    state.look = { outfit: 'blue', hair: 'long', gender };
    VL.splatEgg(state);
    VL.talkTo(state, { type: 'npc', id: 'librarian', x: 9, y: 7 });
    assert.deepEqual(JSON.parse(JSON.stringify(state.sceneRequest.data.pages.map((page) => page.join(' ')))), ['Looks like you have some egg on your face, Robin.'], gender);
  }
});

// ---------- the Lighthouse's map ----------

test('the Lighthouse map lies on foot from the entrance, early, as in the Scriptorium and the Hollow Oak', () => {
  const { VL } = loadGame();
  const state = VL.newGame();
  const onFoot = (id) => {
    const dungeon = VL.DUNGEONS[id];
    const [key, map] = Object.entries(VL.AREAS[dungeon.area].screens)
      .flatMap(([k, s]) => s.entities.filter((e) => e.type === 'dungeonMap').map((e) => [k, e]))[0];
    return findPath(VL, { area: dungeon.area, screen: '0,0', tx: 7, ty: 9 }, { area: dungeon.area, screen: key, tx: map.x, ty: map.y }, state);
  };
  assert.ok(onFoot('hollowOak') && onFoot('lighthouse'));
  const map = VL.getScreen('lighthouse', '-1,0').entities.find((e) => e.type === 'dungeonMap');
  assert.equal(map?.id, 'd3Map', 'in the cellar, its id kept for old saves');
});

test('the map stair keeps a reason to climb it: a chest of broken shells for the slingshot', () => {
  const { VL } = loadGame();
  const stair = VL.getScreen('lighthouse', '-1,-2').entities;
  assert.ok(!stair.some((e) => e.type === 'dungeonMap'));
  const chest = stair.find((e) => e.type === 'chest');
  assert.deepEqual(JSON.parse(JSON.stringify(chest.contents)), [{ resource: 'brokenShells', amount: 5 }]);
  assert.ok(!VL.isSolidAt('lighthouse', '-1,-2', chest.x - 1, chest.y), 'S from the floor beside it');
  assert.deepEqual([...VL.dungeonProblems()], []);
  assert.deepEqual([...VL.solveProgression().problems], []);
});

test('with the map, the map screen draws every room, the unvisited ones in dark stone', () => {
  const { VL } = loadGame();
  const app = VL.createApp();
  app.game = VL.newGame();
  VL.place(app.game, { area: 'lighthouse', screen: '0,0', tx: 7, ty: 8 });
  VL.dungeonState(app.game, 'lighthouse').map = true;
  app.setScene('dungeonMap');
  const fills = [];
  const original = VL.ART.rect;
  VL.ART.rect = (ctx, name, ...rest) => {
    fills.push(name);
    return original(ctx, name, ...rest);
  };
  try {
    app.scene.draw(fakeDocument().createElement('canvas').getContext('2d'), app, 0);
  } finally {
    VL.ART.rect = original;
  }
  const rooms = Object.keys(VL.AREAS.lighthouse.screens).length;
  assert.equal(fills.filter((n) => n === 'dgnStoneDark').length, rooms - 1);
  assert.equal(fills.filter((n) => n === 'dgnStoneLight').length, 1);
});

// ---------- the wreck's five shells ----------

function wreckChest(shells) {
  const { VL } = loadGame();
  if (typeof shells === 'function') shells = shells(VL);
  const state = playState(VL, { area: 'wreck', screen: '1,0', tx: 7, ty: 3, facing: 'up' });
  state.inventory.shells = shells;
  state.popups.queue.length = 0;
  const chest = state.room.entities.find((e) => e.id === 'wreckShellChest');
  return { VL, state, chest };
}

test('the wreck\'s chest gives five whole shells and says so', () => {
  const { VL, state, chest } = wreckChest(0);
  VL.ENTITIES.chest.onInteract(state, chest);
  assert.equal(state.inventory.shells, 5);
  assert.ok(chest.opened);
  assert.match(VL.currentPopup(state).title, /five whole shells/i);
});

test('with too little room in the purse the chest stays shut and says why; with room it opens', () => {
  const { VL, state, chest } = wreckChest((V) => V.TUNING.shellCap - 2);
  VL.ENTITIES.chest.onInteract(state, chest);
  assert.equal(chest.opened, false);
  assert.ok(!state.flags['found:wreckShellChest']);
  assert.equal(state.inventory.shells, VL.TUNING.shellCap - 2);
  const popup = VL.currentPopup(state);
  assert.match(`${popup.title} ${popup.text}`, /room|fit/i);
  assert.match(popup.text, /five|5/i);
  state.message = null;
  state.inventory.shells = VL.TUNING.shellCap - 5;
  VL.ENTITIES.chest.onInteract(state, chest);
  assert.ok(chest.opened);
  assert.equal(state.inventory.shells, VL.TUNING.shellCap);
});

// ---------- the metal shovel on paths and the forest floor ----------

function digAt(screen, tx, ty, facing, shovel = 'metalShovel') {
  const { VL } = loadGame();
  const state = playState(VL, ow(screen, tx, ty, facing));
  state.room.entities = state.room.entities.filter((e) => !VL.isEnemy(e));
  VL.giveItem(state, shovel);
  state.popups.queue.length = 0;
  state.popups.seen.digKey = true;
  const result = VL.dig(state, shovel);
  return { VL, state, result, ahead: VL.facingTile(state) };
}

test('the metal shovel digs the road and the Whispering Woods floor; a hole keeps its ground', () => {
  for (const [screen, tx, ty, facing, ch, flag] of [['1,1', 8, 5, 'right', 'P', 'path'], ['5,-1', 6, 7, 'down', 'f', 'moss']]) {
    const { VL, state, result, ahead } = digAt(screen, tx, ty, facing);
    assert.equal(VL.tileAt('overworld', screen, ahead.tx, ahead.ty), ch, `${screen} faces ${ch}`);
    assert.notEqual(result, 'blocked', `${ch} dug`);
    const info = VL.tileInfo('overworld', VL.tileAt('overworld', screen, ahead.tx, ahead.ty, state.room));
    assert.ok(info.hole && info[flag] && !info.solid, `a ${flag} hole, still walkable`);
    assert.ok(info.art, 'with its own look');
  }
});

test('the wood shovel still only digs sand', () => {
  for (const [screen, tx, ty, facing] of [['1,1', 8, 5, 'right'], ['5,-1', 6, 7, 'down']]) {
    const { result } = digAt(screen, tx, ty, facing, 'woodShovel');
    assert.equal(result, 'blocked');
  }
});

test('paths and forest floor turn up what grass does, and their holes last the visit like every hole', () => {
  const { VL } = loadGame();
  const state = VL.newGame();
  for (const ground of ['path', 'moss']) {
    assert.equal(VL.digChance(state, ground), VL.TUNING.digDirtChance);
    for (let i = 0; i < 200; i += 1) assert.ok([null, 'shell'].includes(VL.digFind(state, ground)), 'never a broken shell, like grass');
  }
  const { VL: V2, state: s2, ahead } = digAt('1,1', 8, 5, 'right');
  assert.deepEqual(JSON.parse(JSON.stringify(s2.tileChanges)), {}, 'nothing saved');
  V2.place(s2, ow('1,1', 8, 5, 'right'));
  assert.equal(V2.tileAt('overworld', '1,1', ahead.tx, ahead.ty, s2.room), 'P', 'filled in next visit');
});

test('no gate is dug: the Woods gate tree, doors and bridges refuse the shovel, and the opened gate path comes back on the next visit', () => {
  const { VL } = loadGame();
  const gate = VL.WOODS_GATE_TREE;
  const state = playState(VL, ow(gate.screen, gate.tx, gate.ty + 1, 'up'));
  state.room.entities = state.room.entities.filter((e) => !VL.isEnemy(e));
  VL.giveItem(state, 'metalShovel');
  state.popups.queue.length = 0;
  assert.equal(VL.dig(state, 'metalShovel'), 'blocked', 'the gate tree');
  state.player.dig = null;
  state.items.woodsMapCopy = true;
  VL.place(state, ow(gate.screen, gate.tx, gate.ty + 1, 'up'));
  assert.equal(VL.tileAt('overworld', gate.screen, gate.tx, gate.ty, state.room), 'P', 'open');
  assert.notEqual(VL.dig(state, 'metalShovel'), 'blocked');
  assert.equal(VL.savedTile(state, 'overworld', gate.screen, gate.tx, gate.ty), 'P', 'still saved open');
  VL.place(state, ow(gate.screen, gate.tx, gate.ty + 1, 'up'));
  assert.equal(VL.tileAt('overworld', gate.screen, gate.tx, gate.ty, state.room), 'P', 'and a path again next visit');
  // Every hole is walkable, so a dug path never blocks a way through.
  for (const ch of Object.values(VL.DIG_HOLES)) assert.ok(!VL.tileInfo('overworld', ch).solid, ch);
  // Door and bridge tiles are neither grass, sand, path nor forest floor.
  for (const ch of ['D', 'b', 'm', 'Z']) {
    const info = VL.tileInfo('overworld', ch);
    assert.ok(!info.grass && !info.sand && !info.path && !info.moss, ch);
  }
});

test('the metal shovel\'s words say it digs paths and the forest floor too', () => {
  const { VL } = loadGame();
  const item = VL.ITEMS.metalShovel;
  assert.match(item.popup.text, /path/i);
  assert.equal(VL.ART.popupLayout(item.popup).overflow, false);
});

// ---------- the quiet fields after the shockwave ----------

test('after the shockwave the fields by the hut stay quiet, sword or no sword, until the Lighthouse; Gran says so', () => {
  const { VL } = loadGame();
  const game = VL.newGame();
  const enemiesOn = (screen) => {
    VL.place(game, { area: 'overworld', screen, tx: 8, ty: 5 });
    return game.room.entities.filter((e) => VL.isEnemy(e)).length;
  };
  const before = Object.fromEntries(VL.SHOCKWAVE_QUIET.map((screen) => [screen, enemiesOn(screen)]));
  VL.applyShockwave(game);
  for (const screen of VL.SHOCKWAVE_QUIET) assert.equal(enemiesOn(screen), 0, `${screen} quiet`);
  game.items.woodSword = true;
  game.items.metalSword = true;
  for (const screen of VL.SHOCKWAVE_QUIET) assert.equal(enemiesOn(screen), 0, `${screen} still quiet with a sword`);
  game.visited['lighthouse:0,0'] = true;
  for (const screen of VL.SHOCKWAVE_QUIET) assert.equal(enemiesOn(screen), before[screen], `${screen} back after the Lighthouse`);
  const line = VL.DIALOGUES.gran.find((entry) => entry.when?.flag === 'shockwave').say.join(' ');
  assert.match(line, /slimes/);
  assert.match(line, /good while/);
  assert.doesNotMatch(line, /\b(he|him|his)\b/i);
});
