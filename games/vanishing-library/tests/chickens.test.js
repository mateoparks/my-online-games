// W7, chickens: wandering and clucking, lift (S) and throw, the secret F
// flight (2 tiles, 4 after the Almanac) with its water splash and edge/solid
// safety, chickens kept at their spots, the swarm, and the lost chicken that
// follows the hero (design: Chickens, Controls; README "Chickens").
const assert = require('node:assert/strict');
const { test, read, loadGame, playApp, fakeContext } = require('./harness');

const STEP = 1 / 60;
const { tile } = loadGame().VL.TUNING;

// A yard the tests own, two screens wide. Row 3: a 2-tile pond; row 4: a
// 4-tile pond; row 5: a pond wider than any flight; row 6: a tree; row 8: a
// 4-tile channel across the screen edge into 1,0; row 9: a 2-tile chasm.
function addYard(VL) {
  VL.addScreens('yard', {
    '0,0': {
      tiles: [
        'TTTTTTTTTTTTTTTT',
        'T..............T',
        'T..............T',
        'T...WW.........T',
        'T...WWWW.......T',
        'T..WWWWWWWW....T',
        'T....T.........T',
        'T...............',
        'T.............WW',
        'T...VV.........T',
        'TTTTTTTTTTTTTTTT',
      ],
      entities: [
        { type: 'chicken', spot: 'yardHen', x: 10, y: 2 },
        { type: 'chicken', spot: 'yardLost', x: 12, y: 6, lost: true },
      ],
    },
    '1,0': {
      tiles: [
        'TTTTTTTTTTTTTTTT',
        'T..............T',
        'T..............T',
        'T..............T',
        'T..............T',
        'T..............T',
        'T..............T',
        '...............T',
        'WW.............T',
        'T..............T',
        'TTTTTTTTTTTTTTTT',
      ],
      entities: [],
    },
  });
}

function setup() {
  const { VL } = loadGame();
  addYard(VL);
  const sounds = [];
  VL.sfx = (name) => {
    sounds.push(name);
    return true;
  };
  const app = playApp(VL);
  const state = () => app.game;
  const step = (actions = VL.noActions()) => app.update(actions, STEP);
  const press = (action) => step(VL.actions({ pressed: [action] }));
  const hold = (held, seconds) => {
    for (let t = 0; t < seconds - 1e-9; t += STEP) step(VL.actions({ held }));
  };
  const wait = (seconds) => hold([], seconds);
  const until = (done, seconds = 5) => {
    for (let t = 0; t < seconds && !done(); t += STEP) step();
    assert.ok(done(), 'condition reached in time');
  };
  const at = (where) => VL.place(app.game, { area: 'yard', screen: '0,0', ...where });
  const chickens = () => app.game.room.entities.filter((e) => e.type === 'chicken');
  const chicken = (spot) => chickens().find((e) => e.spot === spot);
  // Stands the hero on (tx, ty) facing `facing` with a chicken at his feet,
  // the way a player walks up to one and turns.
  const inFront = (spot = 'yardHen') => {
    const hen = chicken(spot);
    const [dx, dy] = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[app.game.player.facing];
    const px = app.game.player.x + dx * 12;
    const py = app.game.player.y + dy * 16;
    Object.assign(hen, { px, py, x: VL.tileOf(px, py).tx, y: VL.tileOf(px, py).ty, mode: 'idle', idle: 99 });
    return hen;
  };
  const withChicken = (tx, ty, facing, spot = 'yardHen') => {
    app.game.player.carrying = null;
    at({ tx, ty, facing });
    return inFront(spot);
  };
  const tileOf = () => [VL.heroTile(app.game).tx, VL.heroTile(app.game).ty];
  const fly = () => {
    press('fly');
    until(() => !app.game.player.flight, 6);
  };
  return { VL, app, state, step, press, hold, wait, until, at, chickens, chicken, inFront, withChicken, tileOf, fly, sounds };
}

// ---------- tuning and placement ----------

test('flight lengths are W7 tuning, out of config.js (README "Flight contract")', () => {
  const { VL } = loadGame();
  assert.equal(VL.TUNING.chickenFlightShort, 2);
  assert.equal(VL.TUNING.chickenFlightLong, 4);
  assert.ok(!read('config.js').includes('chickenFlight'), 'config.js no longer holds the flight lengths');
  assert.ok(read('systems/chickens.js').includes('chickenFlightShort: 2'));
});

test('all seven chicken spots hold a chicken, the lost one marked lost', () => {
  const { VL } = loadGame();
  const spots = Object.values(VL.SPOTS).filter((spot) => spot.how === 'chicken');
  // W41 took one off the highlands' middle shelves (eight before).
  assert.equal(spots.length, 7);
  for (const spot of spots) {
    assert.ok(spot.filled, `${spot.id} is filled`);
    const entity = VL.getScreen(spot.area, spot.screen).entities.find((e) => e.spot === spot.id);
    assert.equal(entity.type, 'chicken', spot.id);
    assert.equal(Boolean(entity.lost), spot.id === 'lostChicken', spot.id);
  }
});

// ---------- wandering ----------

test('chickens wander near home on open ground, peck and cluck, without touching the game\'s random numbers', () => {
  const { VL, app, at, wait, chicken, sounds } = setup();
  at({ tx: 2, ty: 1 });
  const rng = app.game.rngState;
  const hen = chicken('yardHen');
  const seen = new Set();
  for (let i = 0; i < 60 * 40; i += 1) {
    wait(STEP);
    const { tx, ty } = VL.tileOf(hen.px, hen.py);
    seen.add(`${tx},${ty}`);
    assert.ok(Math.abs(tx - 10) <= VL.TUNING.chickenWander && Math.abs(ty - 2) <= VL.TUNING.chickenWander, `stays near home, at ${tx},${ty}`);
    assert.ok(!VL.isSolidAt('yard', '0,0', tx, ty, app.game.room), `never on a solid tile (${tx},${ty})`);
    assert.deepEqual([hen.x, hen.y], [tx, ty], 'its tile follows its feet, so S finds it');
  }
  assert.ok(seen.size > 2, `it walked about (${seen.size} tiles)`);
  assert.equal(app.game.rngState, rng, 'drops stay reproducible');
  assert.ok(sounds.includes('cluck'), 'it clucks now and then');
});

test('a chicken\'s first pause is within the idle range, like every later one', () => {
  const { VL, app } = setup();
  for (let i = 0; i < 40; i += 1) {
    const c = { type: 'chicken', spot: `idle${i}`, x: 1 + (i % 12), y: 1 + (i % 8) };
    VL.setUpChicken(app.game, c);
    assert.ok(c.idle >= VL.TUNING.chickenIdleMin && c.idle <= VL.TUNING.chickenIdleMax, `${c.idle}`);
  }
});

// ---------- lift and throw ----------

test('S facing a chicken lifts it over the hero\'s head; the same press never throws it', () => {
  const { app, press, withChicken, chickens, sounds } = setup();
  const hen = withChicken(7, 2, 'right');
  press('interact');
  assert.equal(app.game.player.carrying, hen);
  assert.ok(!chickens().includes(hen), 'it left the ground');
  assert.ok(sounds.includes('cluck'));
});

test('carrying a chicken, the hero walks with it and S throws it ahead, where it lands on open ground', () => {
  const { app, press, hold, wait, withChicken, chickens, sounds, tileOf } = setup();
  const hen = withChicken(4, 7, 'right');
  press('interact');
  hold(['right'], 0.2);
  assert.equal(app.game.player.carrying, hen, 'still held while walking');
  const [tx] = tileOf();
  press('interact');
  assert.equal(app.game.player.carrying, null);
  assert.ok(chickens().includes(hen) && hen.mode === 'air');
  assert.ok(sounds.includes('flap'));
  wait(1.5);
  assert.equal(hen.z, 0);
  assert.ok(hen.x >= tx + 2, `thrown a few tiles (from ${tx} to ${hen.x})`);
  assert.equal(hen.y, 7);
});

test('a throw stops at a tree, never goes through it or off the world', () => {
  const { VL, app, press, wait, withChicken } = setup();
  const hen = withChicken(3, 6, 'right');
  press('interact');
  press('interact');
  wait(1.5);
  assert.ok(hen.x <= 4, `landed short of the tree (x ${hen.x})`);
  const edge = withChicken(1, 2, 'left', 'yardLost');
  press('interact');
  press('interact');
  wait(1.5);
  assert.ok(edge.px >= 0 && !VL.isSolidAt('yard', '0,0', edge.x, edge.y, app.game.room), 'landed inside the yard');
});

test('a chicken thrown into water splashes and flutters back to land: never lost', () => {
  const { VL, app, press, wait, withChicken, sounds, until } = setup();
  const hen = withChicken(2, 4, 'right');
  press('interact');
  press('interact');
  until(() => app.game.events.some((e) => e.type === 'chickenSplash') || sounds.includes('dunk'), 2);
  until(() => hen.mode === 'idle' || hen.mode === 'walk', 4);
  wait(0.1);
  assert.ok(!VL.isSolidAt('yard', '0,0', hen.x, hen.y, app.game.room), `back on land at ${hen.x},${hen.y}`);
  assert.ok(app.game.room.entities.includes(hen));
});

test('while carrying, S throws instead of pulling, and Space does not swing', () => {
  const { VL, app, press, withChicken } = setup();
  VL.giveItem(app.game, 'woodSword');
  app.game.popups.queue.length = 0;
  withChicken(7, 2, 'right');
  press('interact');
  const hp = app.game.hp;
  press('mainHand');
  assert.ok(!app.game.player.swing, 'no swing with a chicken overhead');
  assert.equal(app.game.hp, hp);
});

test('carrying a chicken up to a townsperson, S talks instead of throwing it at them (the lost chicken goes home this way)', () => {
  const { VL, app, press, withChicken } = setup();
  VL.defineNpc('henKid', { name: 'Pip', look: 'townsfolk' });
  VL.defineDialogue('henKid', [{ say: 'My chicken!' }]);
  const hen = withChicken(5, 2, 'right');
  press('interact');
  app.game.room.entities.push({ type: 'npc', id: 'henKid', x: 6, y: 2 });
  press('interact');
  assert.equal(app.sceneId, 'dialogue');
  assert.equal(app.game.player.carrying, hen, 'still in hand');
  assert.ok(!app.game.room.entities.includes(hen), 'not thrown');
});

// ---------- flight ----------

test('F with no chicken nearby does nothing (the flight stays a secret)', () => {
  const { app, at, press, tileOf } = setup();
  at({ tx: 3, ty: 3, facing: 'right' });
  press('fly');
  assert.ok(!app.game.player.flight);
  assert.deepEqual(tileOf(), [3, 3]);
});

test('short flight: F next to a chicken clears a 2-tile pond and lands 3 tiles on, chicken in hand', () => {
  const { app, press, step, withChicken, tileOf, fly, sounds } = setup();
  const hen = withChicken(3, 3, 'right');
  press('fly');
  assert.ok(app.game.player.flight, 'took off');
  assert.equal(app.game.player.carrying, hen, 'the chicken carries the hero');
  step();
  step();
  assert.ok(app.game.player.lift > 0, 'off the ground');
  fly();
  assert.deepEqual(tileOf(), [6, 3]);
  assert.equal(app.game.player.lift, 0);
  assert.equal(app.game.player.carrying, hen, 'it lands with the hero');
  assert.ok(sounds.includes('flap'));
});

test('long flight after the Almanac: clears a 4-tile pond and lands 5 tiles on', () => {
  const { app, withChicken, tileOf, fly } = setup();
  app.game.flags.chickenAlmanacRead = true;
  withChicken(3, 4, 'right');
  fly();
  assert.deepEqual(tileOf(), [8, 4]);
});

test('a carried chicken flies too: F while holding one', () => {
  const { app, press, withChicken, tileOf, fly } = setup();
  withChicken(3, 3, 'up');
  press('interact');
  app.game.player.facing = 'right';
  fly();
  assert.deepEqual(tileOf(), [6, 3]);
});

test('too far: a short flight over a 4-tile pond splashes down and the chicken flaps the hero back to where he took off', () => {
  const { VL, app, withChicken, fly, sounds, step, press } = setup();
  withChicken(3, 4, 'right');
  const from = { x: app.game.player.x, y: app.game.player.y };
  press('fly');
  let farthest = from.x;
  let splashed = false;
  for (let i = 0; i < 60 * 6 && app.game.player.flight; i += 1) {
    step();
    farthest = Math.max(farthest, app.game.player.x);
    if (app.game.player.flight?.phase === 'dip') splashed = true;
  }
  assert.ok(splashed && sounds.includes('dunk'), 'a splash');
  assert.ok(farthest >= from.x + 2.5 * VL.TUNING.tile, 'it did fly out over the water');
  assert.deepEqual([app.game.player.x, app.game.player.y], [from.x, from.y], 'back exactly where he took off');
  assert.equal(app.game.player.lift, 0);
  fly();
});

test('a pond wider than the long flight splashes too, and a chasm makes the chicken turn back tired', () => {
  const { app, withChicken, fly, tileOf, sounds } = setup();
  app.game.flags.chickenAlmanacRead = true;
  withChicken(2, 5, 'right');
  fly();
  assert.deepEqual(tileOf(), [2, 5]);
  assert.ok(sounds.includes('dunk'));
  sounds.length = 0;
  app.game.flags.chickenAlmanacRead = false;
  withChicken(3, 9, 'right');
  fly();
  assert.deepEqual(tileOf(), [6, 9], 'a 2-tile chasm is a short flight');
  withChicken(6, 9, 'left');
  fly();
  assert.deepEqual(tileOf(), [3, 9], 'and back');
});

test('landing runs the stand hooks once, as a step would (a door, a save point)', () => {
  const { VL, app, withChicken, fly, hold, wait } = setup();
  const stood = [];
  VL.defineEntity('henPad', { onStand: (state, e) => stood.push(e.id) });
  withChicken(3, 3, 'right');
  app.game.room.entities.push({ type: 'henPad', id: 'far', x: 6, y: 3 });
  fly();
  assert.deepEqual(stood, ['far'], 'fired on landing');
  hold(['down'], 0.05);
  wait(0.1);
  assert.deepEqual(stood, ['far'], 'not again on the next step');
});

test('a townsperson never wanders onto the take-off tile while the hero is out, so he always flies back to open ground', () => {
  const { VL, app, press, step, withChicken } = setup();
  VL.defineNpc('henWalker', { name: 'Wren', look: 'townsfolk', wander: 1 });
  withChicken(2, 5, 'right');
  const npc = { type: 'npc', id: 'henWalker', x: 2, y: 4 };
  app.game.room.entities.push(npc);
  // Restless and set on the take-off tile: it tries a step down (DIRS[1] in
  // entities/npc.js) every frame it is not already walking.
  const random = VL.random;
  VL.random = (owner) => (owner === npc ? 0.3 : random(owner));
  const start = [app.game.player.x, app.game.player.y];
  press('fly');
  let onStart = false;
  for (let i = 0; i < 60 * 6 && app.game.player.flight; i += 1) {
    if (npc.idle !== undefined) npc.idle = 0;
    step();
    if (npc.x === 2 && npc.y === 5) onStart = true;
  }
  assert.deepEqual([app.game.player.x, app.game.player.y], start, 'flew back');
  assert.ok(!onStart, 'nobody stepped onto the take-off tile');
  assert.ok(!VL.isBlocked('yard', '0,0', start[0], start[1], VL.TUNING.heroBox.w, VL.TUNING.heroBox.h, app.game.room));
});

test('one tile back from a gap, a flight lands on the edge tile (no splash), and a second F crosses', () => {
  const { app, withChicken, tileOf, fly, sounds } = setup();
  withChicken(2, 3, 'right');
  fly();
  assert.deepEqual(tileOf(), [3, 3], 'short: onto the edge of the 2-tile pond');
  fly();
  assert.deepEqual(tileOf(), [6, 3], 'then over it');
  app.game.flags.chickenAlmanacRead = true;
  withChicken(2, 4, 'right');
  fly();
  assert.deepEqual(tileOf(), [3, 4], 'long: onto the edge of the 4-tile pond');
  fly();
  assert.deepEqual(tileOf(), [8, 4], 'then over it');
  assert.ok(!sounds.includes('dunk'), 'never a splash');
});

// Ponds with islands: row 2 is .WW.WW. (the far shore 6 away), row 4 is
// .WW.W. (the far shore 5 away).
function addIsles(VL) {
  VL.addScreens('isle', {
    '0,0': {
      tiles: [
        'TTTTTTTTTTTTTTTT',
        'T..............T',
        'T.WW.WW........T',
        'T..............T',
        'T.WW.W.........T',
        'T..............T',
        'T..............T',
        'T..............T',
        'T..............T',
        'T..............T',
        'TTTTTTTTTTTTTTTT',
      ],
      entities: [{ type: 'chicken', spot: 'isleHen', x: 10, y: 8 }],
    },
  });
}

test('a flight over an island lands on the farthest open tile in reach: the island, or the far shore', () => {
  for (const almanac of [false, true]) {
    const { VL, app, inFront, tileOf, fly, sounds } = setup();
    addIsles(VL);
    app.game.flags.chickenAlmanacRead = almanac;
    const from = (ty) => {
      app.game.player.carrying = null;
      VL.place(app.game, { area: 'isle', screen: '0,0', tx: 1, ty, facing: 'right' });
      inFront('isleHen');
    };
    from(2);
    fly();
    assert.deepEqual(tileOf(), [4, 2], `almanac ${almanac}: onto the island, the far shore out of reach`);
    from(4);
    fly();
    assert.deepEqual(tileOf(), almanac ? [6, 4] : [4, 4], `almanac ${almanac}: as far as it reaches`);
    assert.ok(!sounds.includes('dunk'), `almanac ${almanac}: never a splash`);
  }
});

test('a solid in the way: the flight lands before it, or hops in place against it', () => {
  const { app, withChicken, fly, tileOf, step, press } = setup();
  app.game.flags.chickenAlmanacRead = true;
  withChicken(1, 6, 'right');
  fly();
  assert.deepEqual(tileOf(), [4, 6], 'landed short of the tree');
  withChicken(4, 6, 'right');
  press('fly');
  let highest = 0;
  for (let i = 0; i < 120 && app.game.player.flight; i += 1) {
    step();
    highest = Math.max(highest, app.game.player.lift);
  }
  assert.ok(highest > 0, 'a hop');
  assert.deepEqual(tileOf(), [4, 6], 'never through the tree');
});

test('the world edge stops a flight like a wall', () => {
  const { app, withChicken, fly, tileOf } = setup();
  withChicken(1, 2, 'left');
  fly();
  assert.deepEqual(tileOf(), [1, 2]);
  assert.equal(app.game.player.screen, '0,0');
});

test('a long flight across a screen edge rides through the slide, hero and chicken in the air, and lands on the far screen', () => {
  const { VL, app, step, press, withChicken, tileOf } = setup();
  app.game.flags.chickenAlmanacRead = true;
  const hen = withChicken(13, 8, 'right');
  press('fly');
  let slid = false;
  for (let i = 0; i < 60 * 6 && app.game.player.flight; i += 1) {
    step();
    if (app.game.transition) {
      slid = true;
      assert.ok(app.game.player.lift > 0, 'up in the air during the slide');
      assert.equal(app.game.player.carrying, hen);
    }
  }
  assert.ok(slid, 'the screen slid');
  assert.equal(app.game.player.screen, '1,0');
  assert.deepEqual(tileOf(), [2, 8], '5 tiles from take-off');
  assert.equal(app.game.player.carrying, hen);
  assert.ok(!VL.isBlocked('yard', '1,0', app.game.player.x, app.game.player.y, VL.TUNING.heroBox.w, VL.TUNING.heroBox.h, app.game.room));
});

test('a flight sees solid things placed on the far screen, and turns back with a splash instead of flying out for nothing', () => {
  const { VL, app, withChicken, fly, tileOf, sounds } = setup();
  VL.defineEntity('henPost', { solid: true });
  VL.getScreen('yard', '1,0').entities.push({ type: 'henPost', x: 2, y: 8 });
  app.game.flags.chickenAlmanacRead = true;
  withChicken(13, 8, 'right');
  assert.equal(VL.planFlight(app.game).land, 0, 'the far landing tile is taken');
  fly();
  assert.deepEqual([app.game.player.screen, ...tileOf()], ['0,0', 13, 8], 'back where he took off');
  assert.ok(sounds.includes('dunk'), 'and said so with a splash');
});

test('something moving onto the landing tile mid-flight turns the chicken back, squawking', () => {
  const { VL, app, press, step, withChicken, until, tileOf, sounds } = setup();
  VL.defineEntity('henPost', { solid: true });
  withChicken(3, 3, 'right');
  press('fly');
  step();
  app.game.room.entities.push({ type: 'henPost', x: 6, y: 3 });
  until(() => !app.game.player.flight, 6);
  assert.deepEqual(tileOf(), [3, 3]);
  assert.ok(sounds.includes('henSquawk'));
});

test('the flight is drawn: the hero lifted with the chicken flapping overhead, and a splash', () => {
  const { VL, app, press, step, withChicken } = setup();
  const canvas = fakeContext();
  withChicken(3, 4, 'right');
  press('fly');
  for (let i = 0; i < 60 * 4 && app.game.player.flight; i += 1) {
    step();
    VL.drawWorld(canvas, app.game, i * STEP);
  }
  assert.ok(canvas.calls.fillRect > 0);
});

// ---------- the flight contract on the real map ----------

function overworld() {
  const { VL } = loadGame();
  const app = playApp(VL);
  const step = () => app.update(VL.noActions(), STEP);
  const flyFrom = (screen, tx, ty, facing, almanac = true) => {
    app.game.flags.chickenAlmanacRead = almanac;
    VL.place(app.game, { area: 'overworld', screen, tx, ty, facing });
    // On a shelf with no chicken of its own (W41), the middle one is brought along.
    if (!app.game.player.carrying && !app.game.room.entities.some((e) => e.type === 'chicken')) {
      const spot = VL.SPOTS.chickenHighlands;
      VL.place(app.game, { area: 'overworld', screen: spot.screen, tx: spot.x, ty: spot.y });
      assert.ok(VL.liftChicken(app.game, app.game.room.entities.find((e) => e.spot === spot.id)));
      VL.place(app.game, { area: 'overworld', screen, tx, ty, facing });
    }
    // A chicken still in hand from the last flight carries him again.
    const hen = app.game.player.carrying ? null : app.game.room.entities.find((e) => e.type === 'chicken');
    if (hen) Object.assign(hen, { px: app.game.player.x + 4, py: app.game.player.y, x: tx, y: ty, mode: 'idle', idle: 99 });
    app.update(VL.actions({ pressed: ['fly'] }), STEP);
    assert.ok(app.game.player.flight, `took off from ${screen}`);
    for (let i = 0; i < 60 * 8 && app.game.player.flight; i += 1) step();
    return [app.game.player.screen, VL.heroTile(app.game).tx, VL.heroTile(app.game).ty];
  };
  return { VL, app, flyFrom };
}

test('flight contract: the long flight crosses both highland chasms over their screen edges, and the chicken comes too', () => {
  const { app, flyFrom } = overworld();
  assert.deepEqual([...flyFrom('-1,-2', 7, 3, 'up')], ['-1,-3', 7, 9], 'the ledge up to the highlands');
  assert.ok(app.game.player.carrying);
  assert.deepEqual([...flyFrom('-1,-3', 7, 9, 'down')], ['-1,-2', 7, 3], 'and back down to the ledge');
  assert.deepEqual([...flyFrom('-2,-4', 12, 4, 'right')], ['-1,-4', 1, 4], 'east over the last chasm');
  assert.deepEqual([...flyFrom('-1,-4', 1, 4, 'left')], ['-2,-4', 12, 4], 'and west again from the lair side');
});

test('flight contract: the short flight falls short of the highlands and brings the hero back to the ledge', () => {
  const { flyFrom } = overworld();
  assert.deepEqual([...flyFrom('-1,-2', 7, 3, 'up', false)], ['-1,-2', 7, 3]);
  assert.deepEqual([...flyFrom('-2,-4', 12, 4, 'right', false)], ['-2,-4', 12, 4]);
});

test('flight contract: from one tile back, the long flight lands on the clifftop edge, and a second F crosses', () => {
  const { flyFrom } = overworld();
  assert.deepEqual([...flyFrom('-1,-3', 7, 8, 'down')], ['-1,-3', 7, 9], 'onto the edge above the ledge');
  assert.deepEqual([...flyFrom('-1,-3', 7, 9, 'down')], ['-1,-2', 7, 3], 'then down to the ledge');
  assert.deepEqual([...flyFrom('-2,-4', 11, 4, 'right')], ['-2,-4', 12, 4], 'onto the edge of the last chasm');
  assert.deepEqual([...flyFrom('-2,-4', 12, 4, 'right')], ['-1,-4', 1, 4], 'then over to the lair side');
  assert.deepEqual([...flyFrom('-1,-4', 2, 4, 'left')], ['-1,-4', 1, 4], 'back west: onto the lair-side edge');
  assert.deepEqual([...flyFrom('-1,-4', 1, 4, 'left')], ['-2,-4', 12, 4], 'then over');
});

// ---------- chickens stay at their spots ----------

test('a chicken carried off is back at its spot on the next visit, and never doubled while carried', () => {
  const { app, press, hold, withChicken, chicken, at, chickens } = setup();
  withChicken(13, 2, 'right');
  press('interact');
  hold(['right'], 0.6);
  hold(['down'], 0.01);
  at({ screen: '1,0', tx: 3, ty: 2 });
  at({ tx: 8, ty: 2 });
  assert.equal(chickens().filter((e) => e.spot === 'yardHen').length, 0, 'the one in hand is not doubled');
  press('interact');
  at({ screen: '1,0', tx: 3, ty: 2 });
  at({ tx: 8, ty: 2 });
  assert.ok(chicken('yardHen'), 'thrown and left behind: back at its spot');
  assert.deepEqual([chicken('yardHen').x, chicken('yardHen').y], [10, 2]);
});

test('respawn: a highland chicken is always at its spot, and a flight leaves one on each side', () => {
  const { app, flyFrom } = overworld();
  flyFrom('-2,-4', 12, 4, 'right');
  const lair = app.game.room.entities.filter((e) => e.type === 'chicken');
  assert.equal(lair.length, 1, 'chickenLair waits at -1,-4');
  assert.equal(lair[0].spot, 'chickenLair');
  assert.equal(app.game.player.carrying.spot, 'chickenHighlands', 'and the one carried over the chasm is in hand');
});

// ---------- the swarm ----------

test('swarm: hit a chicken too often and its friends flap round the hero, harmless, then fly off', () => {
  const { VL, app, step, press, wait, withChicken, inFront, chickens, sounds } = setup();
  VL.giveItem(app.game, 'woodSword');
  app.game.popups.queue.length = 0;
  const hp = app.game.hp;
  withChicken(7, 2, 'right');
  for (let i = 0; i < VL.TUNING.chickenSwarmHits - 1; i += 1) {
    inFront();
    press('mainHand');
    wait(0.5);
  }
  assert.ok(sounds.includes('henSquawk'));
  assert.equal(app.game.room.entities.filter((e) => e.type === 'chickenSwarm').length, 0, 'no swarm yet');
  inFront();
  press('mainHand');
  step();
  const swarm = () => app.game.room.entities.filter((e) => e.type === 'chickenSwarm');
  assert.equal(swarm().length, VL.TUNING.chickenSwarmSize);
  wait(VL.TUNING.chickenSwarmSeconds / 2);
  const close = swarm().filter((e) => Math.hypot(e.px - app.game.player.x, e.py - app.game.player.y) < 40);
  assert.ok(close.length >= 3, `they mob the hero (${close.length} close)`);
  assert.equal(app.game.hp, hp, 'harmless');
  wait(VL.TUNING.chickenSwarmSeconds + 4);
  assert.equal(swarm().length, 0, 'and fly off');
  assert.equal(app.game.hp, hp);
  assert.ok(chickens().length >= 1, 'the chicken itself is still about');
});

// ---------- the lost chicken ----------

test('the lost chicken follows the hero once found, across screen edges, until W11\'s kid takes it', () => {
  const { VL, app, press, hold, wait, withChicken, chicken, at } = setup();
  const lost = withChicken(12, 6, 'right', 'yardLost');
  assert.ok(!VL.chickenWithHero(app.game, 'yardLost'));
  press('interact');
  assert.ok(VL.chickenWithHero(app.game, 'yardLost'));
  press('interact');
  wait(1);
  at({ tx: 12, ty: 7 });
  const gap = () => Math.hypot(lost.px - app.game.player.x, lost.py - app.game.player.y);
  wait(3);
  assert.ok(gap() < 32, `it caught up (${Math.round(gap())} px)`);
  hold(['right'], 1.5);
  assert.equal(app.game.player.screen, '1,0');
  wait(2);
  const here = app.game.room.entities.find((e) => e.spot === 'yardLost');
  assert.ok(here, 'it came along to the next screen');
  assert.ok(Math.hypot(here.px - app.game.player.x, here.py - app.game.player.y) < 32);
  assert.ok(VL.chickenWithHero(app.game, 'yardLost'));
  assert.ok(VL.takeChicken(app.game, 'yardLost'));
  assert.ok(!VL.chickenWithHero(app.game, 'yardLost'));
  assert.ok(!app.game.room.entities.includes(here));
  VL.markFound(app.game, 'yardLost');
  at({ tx: 3, ty: 2 });
  assert.equal(chicken('yardLost'), undefined, 'home with the kid, gone from its spot');
});

// ---------- with W6 combat ----------

// A practice enemy that never moves, so contact is under the test's control.
function addDummy(VL) {
  VL.defineEnemy('henDummy', { hp: 2, damage: 1, size: 'small', body: { w: 10, h: 10 }, think() {}, draw() {} });
}

// Puts an enemy's body just touching the hero on his right.
function touchRight(app, enemy) {
  enemy.cx = app.game.player.x + 9;
  enemy.cy = app.game.player.y - 5;
}

test('with combat: a hit while carrying knocks the hero back with the chicken still in hand', () => {
  const { VL, app, press, wait, withChicken } = setup();
  addDummy(VL);
  const hen = withChicken(7, 2, 'right');
  press('interact');
  const x = app.game.player.x;
  const hp = app.game.hp;
  touchRight(app, VL.spawnEnemy(app.game, 'henDummy', 8, 2));
  wait(0.3);
  assert.equal(app.game.hp, hp - 1, 'hurt');
  assert.ok(app.game.player.x < x - 4, `knocked back (${x} -> ${app.game.player.x})`);
  assert.equal(app.game.player.carrying, hen, 'still held');
  assert.ok(!app.game.room.entities.includes(hen), 'not dropped');
});

test('with combat: a thrown chicken sails past an enemy, neither hurting the other', () => {
  const { VL, app, press, wait, withChicken } = setup();
  addDummy(VL);
  const hen = withChicken(3, 2, 'right');
  press('interact');
  const dummy = VL.spawnEnemy(app.game, 'henDummy', 5, 2);
  press('interact');
  wait(1.5);
  assert.equal(dummy.hp, VL.ENEMIES.henDummy.hp);
  assert.ok(hen.mode === 'idle' || hen.mode === 'walk', `landed (${hen.mode})`);
  assert.ok(hen.x >= 5, `flew past it (x ${hen.x})`);
});

test('with combat: the hero is out of reach in the air, so a flight never loses hearts or gets knocked about', () => {
  const { VL, app, press, step, withChicken, tileOf, fly } = setup();
  addDummy(VL);
  withChicken(3, 3, 'right');
  const hp = app.game.hp;
  press('fly');
  for (let i = 0; i < 6; i += 1) step();
  const dummy = VL.spawnEnemy(app.game, 'henDummy', 5, 3);
  for (let i = 0; i < 20; i += 1) {
    touchRight(app, dummy);
    step();
  }
  assert.equal(app.game.hp, hp, 'no damage mid-flight');
  assert.ok(!app.game.player.knockback && !app.game.player.invuln, 'no push, no i-frames');
  VL.ENEMIES.henDummy.harmful = () => false;
  fly();
  assert.deepEqual(tileOf(), [6, 3], 'landed where planned');
});

test('with combat: F while being knocked back takes off cleanly (the chicken scoops him up)', () => {
  const { VL, app, press, step, withChicken } = setup();
  addDummy(VL);
  withChicken(7, 2, 'right');
  touchRight(app, VL.spawnEnemy(app.game, 'henDummy', 8, 2));
  step();
  assert.ok(app.game.player.knockback, 'pushed');
  press('fly');
  assert.ok(app.game.player.flight, 'took off');
  assert.equal(app.game.player.knockback, null);
});

test('with combat: the swarm never hurts, flashes or calms anything, and real enemies still work during it', () => {
  const { VL, app, press, step, wait, withChicken, inFront } = setup();
  addDummy(VL);
  VL.giveItem(app.game, 'woodSword');
  app.game.popups.queue.length = 0;
  withChicken(7, 2, 'right');
  for (let i = 0; i < VL.TUNING.chickenSwarmHits; i += 1) {
    inFront();
    press('mainHand');
    wait(0.5);
  }
  assert.ok(app.game.room.entities.some((e) => e.type === 'chickenSwarm'), 'swarming');
  const hp = app.game.hp;
  wait(1);
  assert.deepEqual([app.game.hp, app.game.player.invuln || 0, app.game.player.flash || 0], [hp, 0, 0]);
  const dummy = VL.spawnEnemy(app.game, 'henDummy', 8, 2);
  touchRight(app, dummy);
  step();
  assert.equal(app.game.hp, hp - 1, 'an enemy still hurts');
  assert.ok(dummy.calm > 0, 'and calms after its one hit');
});

test('with combat: the sword passes through townsfolk but still bops a chicken, and a chicken is no enemy', () => {
  const { VL, app, press, at, chicken } = setup();
  VL.giveItem(app.game, 'woodSword');
  app.game.popups.queue.length = 0;
  VL.defineNpc('henTester', { name: 'Tess', look: 'townsfolk' });
  VL.defineDialogue('henTester', [{ say: 'Hello!' }]);
  at({ tx: 5, ty: 2, facing: 'right' });
  const npc = { type: 'npc', id: 'henTester', x: 6, y: 2 };
  app.game.room.entities.push(npc);
  const hen = chicken('yardHen');
  // Followers trot through anything (README "Chickens"), so one can stand at a townsperson's feet.
  const feet = VL.tileCenter(6, 2);
  Object.assign(hen, { px: feet.x + 3, py: feet.y, x: 6, y: 2, mode: 'idle', idle: 99 });
  const seen = [];
  press('mainHand');
  seen.push(...app.game.events.map((e) => e.type));
  assert.ok(seen.includes('chickenHit'), seen.join());
  assert.ok(!seen.includes('enemyHit'));
  assert.ok(!VL.isEnemy(hen));
  assert.ok(app.game.room.entities.includes(npc));
  assert.deepEqual([npc.x, npc.y, npc.knock, npc.hp], [6, 2, undefined, undefined]);
});

// ---------- safety, progression, sound, docs ----------

test('a faint mid-flight never leaves the hero hanging in the air', () => {
  const { VL, app, press, step, withChicken } = setup();
  withChicken(3, 3, 'right');
  press('fly');
  step();
  VL.respawn(app.game);
  step();
  assert.ok(!app.game.player.flight);
  assert.equal(app.game.player.lift, 0);
});

test('W7 claims the chicken locks: chickens, and both flights', () => {
  const { VL } = loadGame();
  for (const id of ['chickens', 'chickenFlightShort', 'chickenFlightLong']) assert.equal(typeof VL.LOCKS[id].reached, 'function', id);
  const state = VL.newGame();
  assert.ok(!VL.LOCKS.chickens.reached(state));
  state.visited['overworld:2,1'] = true;
  assert.ok(VL.LOCKS.chickens.reached(state) && VL.LOCKS.chickenFlightShort.reached(state));
  assert.ok(!VL.LOCKS.chickenFlightLong.reached(state));
  state.flags.chickenAlmanacRead = true;
  assert.ok(VL.LOCKS.chickenFlightLong.reached(state));
  assert.equal(VL.chickenFlightTiles(state), VL.TUNING.chickenFlightLong);
});

test('chicken events make their sounds', () => {
  const { VL } = loadGame();
  for (const name of ['henSquawk', 'flap', 'dunk']) assert.ok(VL.SOUND.EFFECTS[name], name);
});

test('README documents chickens and the flight', () => {
  const readme = read('README.md');
  for (const word of ['## Chickens', 'VL.chickenWithHero', 'VL.takeChicken', 'chickenAlmanacRead', 'chickenSwarmHits']) assert.ok(readme.includes(word), word);
});
