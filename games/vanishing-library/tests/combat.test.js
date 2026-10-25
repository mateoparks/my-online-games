// W6, combat and enemies: sword and shield tiers, hero damage, knockback,
// invulnerability with flashing, shield blocking from the front, enemy drops,
// fainting into W2's respawn, the overworld roster and where it lives, and
// heart containers (design: Hearts and combat, Tools: two tiers, Anti-goals,
// Resources and economy).
const assert = require('node:assert/strict');
const { test, loadGame, playApp, memoryStorage, fakeContext } = require('./harness');

const STEP = 1 / 60;
const plain = (value) => JSON.parse(JSON.stringify(value));
const ROSTER = ['crab', 'slime', 'bat', 'spitter', 'gull'];

// An open walled arena the tests own: 0,0 opens east (rows 4-6) into 1,0.
function addArena(VL) {
  VL.addScreens('arena', {
    '0,0': {
      tiles: [
        'TTTTTTTTTTTTTTTT',
        'T..............T',
        'T..............T',
        'T..............T',
        'T...............',
        'T...............',
        'T...............',
        'T..............T',
        'T..............T',
        'T..............T',
        'TTTTTTTTTTTTTTTT',
      ],
      entities: [{ type: 'crab', x: 10, y: 8 }],
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

// A practice target: never moves on its own, so the rules show plainly.
function addDummy(VL) {
  VL.defineEnemy('dummy', { hp: 2, damage: 1, size: 'small', body: { w: 10, h: 10 }, think() {}, draw() {} });
  VL.defineEnemy('bigDummy', { hp: 2, damage: 2, size: 'big', body: { w: 10, h: 10 }, think() {}, draw() {} });
  VL.defineEnemy('stump', { hp: 2, damage: 1, rooted: true, body: { w: 10, h: 10 }, think() {}, draw() {} });
}

function setup({ storage = false } = {}) {
  const context = loadGame();
  const { VL } = context;
  addArena(VL);
  addDummy(VL);
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
  app.game.popups.seen.controls = true;
  const events = [];
  const step = (actions = VL.noActions()) => {
    app.update(actions, STEP);
    events.push(...app.game.events.map((e) => e.type));
  };
  const hold = (held, seconds) => {
    for (let t = 0; t < seconds - 1e-9; t += STEP) step(VL.actions({ held }));
  };
  const press = (action, held = []) => step(VL.actions({ pressed: [action], held }));
  // The hero in the arena with nothing else there (the crab is cleared).
  const at = (tx, ty, facing = 'right', screen = '0,0') => {
    VL.place(app.game, { area: 'arena', screen, tx, ty, facing });
    app.game.room.entities = app.game.room.entities.filter((e) => !VL.ENEMIES[e.type]);
  };
  const spawn = (type, tx, ty) => VL.spawnEnemy(app.game, type, tx, ty);
  // Gear without its popup, which would pause the world.
  const give = (id) => {
    VL.giveItem(app.game, id);
    app.game.popups.queue.length = 0;
  };
  const enemies = () => app.game.room.entities.filter((e) => VL.ENEMIES[e.type]);
  return { VL, app, sounds, events, step, hold, press, at, spawn, give, enemies, get game() { return app.game; }, get player() { return app.game.player; } };
}

// Puts an enemy's body just touching the hero's on one side.
function touch(t, enemy, side) {
  const p = t.player;
  const [dx, dy] = { right: [9, 0], left: [-9, 0], up: [0, -11], down: [0, 11] }[side];
  enemy.cx = p.x + dx;
  enemy.cy = p.y - 5 + dy;
}

// ---------- tiers ----------

test('sword and shield tiers are data: wood and metal damage and what each shield blocks', () => {
  const { VL } = loadGame();
  assert.deepEqual(plain(VL.TUNING.swordDamage), { woodSword: 1, metalSword: 2 });
  assert.deepEqual(plain(VL.TUNING.shieldBlocks), { woodShield: ['small'], metalShield: ['small', 'big'] });
  for (const id of ['woodSword', 'metalSword']) assert.ok(VL.ITEMS[id].sword, `${id} is a sword`);
  for (const id of ['woodShield', 'metalShield']) assert.ok(VL.ITEMS[id], `${id} is an item`);
  assert.equal(VL.ITEMS.metalShield.prefers, 'offHand');
  for (const id of ['item-sword-metal', 'item-shield-metal', 'swing-sword-metal-up', 'swing-sword-metal-left', 'swing-sword-metal-right', 'swing-sword-metal-down']) {
    assert.ok(VL.ART.SPRITES[id], id);
  }
});

test('every sword has a damage entry and swing sprites, every shield its held sprite, and only swords hurt', () => {
  const { VL } = loadGame();
  for (const [id, item] of Object.entries(VL.ITEMS).filter(([, def]) => def.sword)) {
    assert.ok(VL.TUNING.swordDamage[id] > 0, `${id} in TUNING.swordDamage`);
    for (const dir of ['up', 'down', 'left', 'right']) assert.ok(VL.ART.SPRITES[`swing-${item.icon}-${dir}`], `swing-${item.icon}-${dir}`);
  }
  for (const id of Object.keys(VL.TUNING.shieldBlocks)) assert.ok(VL.ART.SPRITES[`item-${VL.ITEMS[id].icon}`], `item-${VL.ITEMS[id].icon}`);
  const t = setup();
  t.at(5, 5);
  const dummy = t.spawn('dummy', 6, 5);
  dummy.cx = 104;
  dummy.cy = 88;
  t.player.swing = { t: 0, item: 'stick', facing: 'right' };
  t.step();
  assert.equal(dummy.hp, t.VL.ENEMIES.dummy.hp, 'an item with no swordDamage entry does no harm');
});

test('a flier is hit where it is drawn, above its shadow', () => {
  const t = setup();
  const { VL } = t;
  t.give('woodSword');
  t.at(5, 5, 'right');
  t.game.hp = 99;
  const gull = t.spawn('gull', 6, 5);
  gull.cx = t.player.x + 14;
  gull.cy = t.player.y + 20;
  gull.alt = 14;
  gull.mode = 'circle';
  gull.timer = 99;
  const hp = gull.hp;
  t.press('mainHand');
  assert.equal(gull.hp, hp - VL.TUNING.swordDamage.woodSword, 'the blade reaches the bird drawn at hero height');
});

test('the wood sword takes two hits to beat a 2-heart enemy, the metal sword one', () => {
  for (const [sword, swings] of [['woodSword', 2], ['metalSword', 1]]) {
    const t = setup();
    t.give(sword);
    t.at(5, 5);
    const dummy = t.spawn('dummy', 6, 5);
    let count = 0;
    while (t.enemies().includes(dummy) && count < 5) {
      dummy.cx = 104;
      dummy.cy = 88;
      dummy.knock = null;
      t.press('mainHand');
      count += 1;
      t.hold([], 0.5);
    }
    assert.equal(count, swings, sword);
  }
});

test('a swing hits what is in front of the hero once, never what is behind', () => {
  const t = setup();
  t.give('woodSword');
  t.at(5, 5, 'right');
  const front = t.spawn('dummy', 6, 5);
  const behind = t.spawn('dummy', 4, 5);
  front.hp = 5;
  t.press('mainHand');
  t.hold([], t.VL.TUNING.swingSeconds + 0.1);
  assert.equal(front.hp, 4, 'one hit for the whole swing');
  assert.equal(behind.hp, 2, 'nothing behind');
  assert.ok(t.events.includes('enemyHit'));
  assert.ok(t.sounds.includes('hit'));
});

test('bare hands never hurt an enemy (S and Space only pull bushes)', () => {
  const t = setup();
  t.at(5, 5);
  const dummy = t.spawn('dummy', 6, 5);
  t.press('mainHand');
  t.press('interact');
  t.hold([], 0.3);
  assert.equal(dummy.hp, 2);
});

test('a hit enemy is knocked back away from the hero and flashes; a rooted one stays put', () => {
  const t = setup();
  t.give('woodSword');
  t.at(5, 5);
  const dummy = t.spawn('dummy', 6, 5);
  const stump = t.spawn('stump', 5, 6);
  const x0 = dummy.cx;
  t.press('mainHand');
  assert.ok(dummy.hurt > 0, 'flashes');
  t.hold([], 0.3);
  assert.ok(dummy.cx > x0 + 10, `knocked from ${x0} to ${dummy.cx}`);
  t.game.player.facing = 'down';
  t.hold([], 0.3);
  const s0 = [stump.cx, stump.cy];
  t.press('mainHand');
  t.hold([], 0.3);
  assert.equal(stump.hp, 1);
  assert.deepEqual([stump.cx, stump.cy], s0);
});

test('an enemy knocked into a wall stops at the wall', () => {
  const t = setup();
  t.give('woodSword');
  t.at(13, 2);
  const dummy = t.spawn('dummy', 14, 2);
  dummy.hp = 9;
  t.press('mainHand');
  t.hold([], 0.4);
  assert.ok(dummy.cx + 5 <= 15 * 16 + 1e-6, `stopped at the wall: ${dummy.cx}`);
});

// ---------- the hero gets hurt ----------

test('touching an enemy costs its damage in half hearts, with a hurt sound', () => {
  const t = setup();
  t.at(5, 5);
  const dummy = t.spawn('dummy', 9, 5);
  touch(t, dummy, 'right');
  const hp = t.game.hp;
  t.step();
  assert.equal(t.game.hp, hp - 1);
  assert.ok(t.events.includes('heroHurt'));
  assert.ok(t.sounds.includes('hurt'));
});

test('knockback pushes the hero away from what hit them, and the arrows do nothing meanwhile', () => {
  const t = setup();
  t.at(6, 5);
  const dummy = t.spawn('dummy', 9, 5);
  touch(t, dummy, 'right');
  const x0 = t.player.x;
  const y0 = t.player.y;
  t.step(t.VL.actions({ held: ['right'] }));
  assert.ok(t.player.knockback, 'knocked back');
  t.hold(['right'], t.VL.TUNING.knockbackSeconds);
  assert.ok(t.player.x < x0 - 15, `pushed left from ${x0} to ${t.player.x}`);
  assert.equal(t.player.y, y0);
  assert.equal(t.player.knockback, null, 'over');
  const x1 = t.player.x;
  t.hold(['right'], 0.1);
  assert.ok(t.player.x > x1, 'walking again');
});

test('the Swiftfoot Boots do not lengthen a knockback', () => {
  const pushed = (boots) => {
    const t = setup();
    if (boots) t.game.items.swiftfootBoots = true;
    t.at(6, 5);
    touch(t, t.spawn('dummy', 9, 5), 'right');
    t.step(t.VL.actions({ held: ['right'] }));
    assert.ok(t.player.knockback, 'knocked back');
    const x0 = t.player.x;
    while (t.player.knockback) t.step(t.VL.actions({ held: ['right'] }));
    return x0 - t.player.x;
  };
  assert.equal(pushed(true), pushed(false));
});

test('knockback stops at walls and never carries the hero off the screen', () => {
  const t = setup();
  t.at(1, 5);
  const left = t.spawn('dummy', 9, 5);
  touch(t, left, 'right');
  t.hold([], 0.4);
  assert.ok(t.player.x >= 16 + t.VL.TUNING.heroBox.w / 2 - 1e-6, `stopped at the wall at ${t.player.x}`);

  t.at(15, 5);
  const right = t.spawn('dummy', 9, 5);
  touch(t, right, 'left');
  t.hold([], 0.4);
  assert.equal(t.player.screen, '0,0', 'still on the same screen');
  assert.ok(t.player.x < 256, `x ${t.player.x}`);
  assert.equal(t.game.transition, null);
});

test('after a hit the hero is invulnerable for a while and flashes, then can be hurt again', () => {
  const t = setup();
  const { VL } = t;
  t.at(6, 5);
  const dummy = t.spawn('dummy', 9, 5);
  const fresh = t.spawn('dummy', 9, 8);
  const hp = t.game.hp;
  let pinned = dummy;
  const pin = () => touch(t, pinned, 'right');
  pin();
  t.step();
  assert.equal(t.game.hp, hp - 1);
  assert.ok(t.player.flash > 0, 'flashing');
  for (let s = 0; s < VL.TUNING.invulnSeconds - 0.1; s += STEP) {
    pin();
    t.step();
  }
  assert.equal(t.game.hp, hp - 1, 'no damage while invulnerable');
  // The first dummy is calm now (one approach, one hit), so a fresh one tries.
  pinned = fresh;
  for (let s = 0; s < 0.3; s += STEP) {
    pin();
    t.step();
  }
  assert.equal(t.game.hp, hp - 2, 'hurt again once it wears off');
});

test('the flashing hero is drawn on some frames and not others, and always when not flashing', () => {
  const t = setup();
  const { VL } = t;
  t.at(6, 5);
  let drawn = 0;
  const drawHero = VL.ART.drawHero;
  VL.ART.drawHero = (...args) => {
    drawn += 1;
    return drawHero(...args);
  };
  const ctx = fakeContext();
  let frames = 0;
  for (let flash = VL.TUNING.invulnSeconds; flash > 0; flash -= STEP) {
    t.player.flash = flash;
    VL.drawWorld(ctx, t.game, 0);
    frames += 1;
  }
  assert.ok(drawn > frames * 0.3 && drawn < frames * 0.7, `${drawn} of ${frames} frames drawn`);
  t.player.flash = 0;
  drawn = 0;
  for (let i = 0; i < 10; i += 1) VL.drawWorld(ctx, t.game, i * STEP);
  assert.equal(drawn, 10);
});

// ---------- the shield ----------

test('a raised wood shield blocks a small enemy from the front: no damage, the enemy bounces off', () => {
  const t = setup();
  t.give('woodShield');
  t.at(6, 5, 'right');
  const dummy = t.spawn('dummy', 9, 5);
  touch(t, dummy, 'right');
  const x0 = dummy.cx;
  const hp = t.game.hp;
  t.step(t.VL.actions({ held: ['offHand'] }));
  assert.equal(t.game.hp, hp);
  assert.ok(t.events.includes('blocked'));
  assert.ok(t.sounds.includes('clank'));
  t.hold(['offHand'], 0.3);
  assert.ok(dummy.cx > x0 + 10, 'bounced away');
  assert.ok(!(t.player.flash > 0), 'a block is not a hurt');
});

test('the shield only guards the way the hero faces, and only while raised', () => {
  for (const side of ['left', 'up', 'down']) {
    const t = setup();
    t.give('woodShield');
    t.at(6, 5, 'right');
    const dummy = t.spawn('dummy', 9, 5);
    touch(t, dummy, side);
    const hp = t.game.hp;
    t.step(t.VL.actions({ held: ['offHand'] }));
    assert.equal(t.game.hp, hp - 1, `hurt from the ${side}`);
  }
  const t = setup();
  t.give('woodShield');
  t.at(6, 5, 'right');
  const dummy = t.spawn('dummy', 9, 5);
  touch(t, dummy, 'right');
  const hp = t.game.hp;
  t.step();
  assert.equal(t.game.hp, hp - 1, 'shield down');
});

test('wood blocks only small things; metal blocks big ones too', () => {
  for (const [shield, blocked] of [['woodShield', false], ['metalShield', true]]) {
    const t = setup();
    t.give(shield);
    t.at(6, 5, 'right');
    const big = t.spawn('bigDummy', 9, 5);
    touch(t, big, 'right');
    const hp = t.game.hp;
    t.step(t.VL.actions({ held: ['offHand'] }));
    assert.equal(t.game.hp, blocked ? hp : hp - 2, shield);
  }
});

test('a shield held in the main hand blocks with Space held', () => {
  const t = setup();
  t.give('metalShield');
  t.VL.setHand(t.game, 'mainHand', 'metalShield');
  t.at(6, 5, 'right');
  const dummy = t.spawn('dummy', 9, 5);
  touch(t, dummy, 'right');
  const hp = t.game.hp;
  t.step(t.VL.actions({ held: ['mainHand'] }));
  assert.equal(t.game.hp, hp);
  assert.equal(t.player.shieldItem, 'metalShield');
});

test('a seed flies straight, stops at a wall, hurts the hero, and a raised shield facing it stops it', () => {
  const t = setup();
  const { VL } = t;
  t.at(8, 5, 'right');
  VL.spawnProjectile(t.game, { cx: 8 * 16 + 8 + 40, cy: 87, vx: -70, vy: 0, size: 'small', damage: 1, cause: 'spitter', sprite: 'fx-seed' });
  const hp = t.game.hp;
  t.hold([], 1);
  assert.equal(t.game.hp, hp - 1, 'hit');
  assert.equal(t.game.room.entities.filter((e) => e.type === 'projectile').length, 0, 'gone after hitting');

  t.at(8, 5, 'right');
  t.give('woodShield');
  t.player.flash = 0;
  t.player.invuln = 0;
  VL.spawnProjectile(t.game, { cx: 8 * 16 + 8 + 40, cy: 87, vx: -70, vy: 0, size: 'small', damage: 1, cause: 'spitter', sprite: 'fx-seed' });
  const hp2 = t.game.hp;
  t.hold(['offHand'], 1);
  assert.equal(t.game.hp, hp2, 'blocked');
  assert.ok(t.events.includes('blocked'));
  assert.equal(t.game.room.entities.filter((e) => e.type === 'projectile').length, 0);

  t.at(8, 2, 'down');
  VL.spawnProjectile(t.game, { cx: 3 * 16 + 8, cy: 5 * 16 + 8, vx: -70, vy: 0, size: 'small', damage: 1, cause: 'spitter', sprite: 'fx-seed' });
  t.hold([], 1);
  assert.equal(t.game.room.entities.filter((e) => e.type === 'projectile').length, 0, 'stopped by the wall');
});

// ---------- drops, defeat and respawn ----------

test('a beaten enemy goes up in a puff and may drop a heart or a shell (TUNING.enemyDrops)', () => {
  const { VL } = loadGame();
  const { heart, shell } = VL.TUNING.enemyDrops;
  assert.ok(heart > 0 && shell > 0 && heart + shell < 1);
  for (const [roll, kind] of [[0, 'heart'], [heart + shell / 2, 'shell'], [0.999, null]]) {
    const t = setup();
    t.VL.random = () => roll;
    t.give('metalSword');
    t.at(5, 5);
    t.spawn('dummy', 6, 5);
    t.press('mainHand');
    assert.equal(t.enemies().length, 0, 'beaten');
    assert.ok(t.game.room.entities.some((e) => e.type === 'poof'));
    assert.ok(t.events.includes('enemyDefeated'));
    assert.ok(t.sounds.includes('poof'));
    const drops = t.game.room.entities.filter((e) => e.type === 'drop');
    assert.deepEqual(drops.map((d) => d.kind), kind ? [kind] : []);
    if (kind) assert.deepEqual([drops[0].x, drops[0].y], [6, 5], 'on the tile it was beaten on');
  }
});

test('enemy drops are picked up like bush drops: a heart heals, a shell counts', () => {
  const t = setup();
  t.VL.random = () => 0;
  t.give('metalSword');
  t.at(5, 5);
  t.game.hp = 2;
  t.spawn('dummy', 6, 5);
  t.press('mainHand');
  t.hold(['right'], 0.4);
  assert.equal(t.game.hp, 2 + t.VL.TUNING.heartDropHeal);
});

test('a drop from a flier over a tree lands on the nearest open tile', () => {
  const t = setup();
  t.VL.random = () => 0;
  t.give('metalSword');
  t.at(1, 1, 'up');
  const dummy = t.spawn('dummy', 1, 0);
  t.press('mainHand');
  assert.equal(dummy.hp, 0);
  const drop = t.game.room.entities.find((e) => e.type === 'drop');
  assert.ok(drop, 'dropped');
  assert.ok(!t.VL.isSolidAt('arena', '0,0', drop.x, drop.y, t.game.room), `on an open tile ${drop.x},${drop.y}`);
});

test('enemies come back on re-entering a screen, at full strength; nothing follows the hero across', () => {
  const t = setup();
  const { VL } = t;
  t.give('woodSword');
  VL.place(t.game, { area: 'arena', screen: '0,0', tx: 9, ty: 8, facing: 'right' });
  const crab = t.enemies()[0];
  assert.equal(crab.type, 'crab');
  crab.hp = 1;
  crab.cx = t.player.x + 14;
  crab.cy = t.player.y - 4;
  t.press('mainHand');
  assert.equal(t.enemies().length, 0, 'beaten');
  VL.place(t.game, { area: 'arena', screen: '0,0', tx: 14, ty: 5, facing: 'right' });
  t.game.room.entities = t.game.room.entities.filter((e) => !VL.ENEMIES[e.type]);
  t.hold(['right'], 1.2);
  assert.equal(t.player.screen, '1,0');
  assert.equal(t.enemies().length, 0, 'no enemy came along');
  t.hold(['left'], 1.2);
  assert.equal(t.player.screen, '0,0');
  const back = t.enemies();
  assert.equal(back.length, 1);
  assert.equal(back[0].hp, VL.ENEMIES.crab.hp);
});

test('every roster enemy stays on its own screen, whatever the hero does', () => {
  for (const type of ROSTER) {
    const t = setup();
    t.at(14, 5);
    t.game.hp = 99;
    const enemy = t.spawn(type, 12, 5);
    for (let s = 0; s < 20; s += STEP) {
      t.player.invuln = 1;
      t.step();
      assert.equal(t.player.screen, '0,0');
      assert.ok(enemy.cx >= 0 && enemy.cx <= 256 && enemy.cy >= 0 && enemy.cy <= 176, `${type} at ${enemy.cx},${enemy.cy}`);
    }
  }
});

test('walking enemies never walk into solid tiles', () => {
  for (const type of ['crab', 'slime']) {
    const t = setup();
    t.at(3, 3);
    t.game.hp = 99;
    const enemy = t.spawn(type, 1, 8);
    const def = t.VL.ENEMIES[type];
    for (let s = 0; s < 20; s += STEP) {
      t.player.invuln = 1;
      t.step();
      assert.ok(!t.VL.isBlocked('arena', '0,0', enemy.cx, enemy.cy, def.body.w, def.body.h, t.game.room), `${type} in a wall at ${enemy.cx},${enemy.cy}`);
    }
  }
});

test('enemies never block a path: none is solid, so a corridor is never walled off', () => {
  const { VL } = loadGame();
  for (const type of ROSTER) assert.ok(!VL.ENTITIES[type].solid, type);
});

// ---------- fainting ----------

test('hearts running out faints the hero with the enemy\'s line; waking keeps everything and resets the screen', () => {
  const t = setup({ storage: true });
  const { VL } = t;
  t.give('woodSword');
  VL.addResource(t.game, 'shells', 7);
  t.step();
  t.at(6, 5);
  const crab = t.spawn('crab', 9, 5);
  t.game.hp = 1;
  touch(t, crab, 'right');
  t.step();
  assert.equal(t.game.hp, 0);
  assert.equal(t.app.sceneId, 'fainted');
  assert.equal(t.game.fainted.cause, 'crab');
  assert.notEqual(VL.faintLine('crab'), VL.faintLine('default'));
  t.hold([], 1);
  t.press('interact');
  assert.equal(t.app.sceneId, 'play');
  assert.equal(t.game.hp, t.game.maxHp, 'full hearts');
  assert.deepEqual([t.player.area, t.player.screen], [VL.START.area, VL.START.screen], 'at the last save point (the start)');
  assert.equal(t.player.knockback, null);
  assert.ok(!(t.player.flash > 0) && !(t.player.invuln > 0));
  assert.equal(t.game.inventory.shells, 7);
  assert.ok(VL.hasItem(t.game, 'woodSword'));
});

test('a knockback ends when the hero is moved to another room mid-push (a door, a respawn)', () => {
  const t = setup();
  const { VL } = t;
  t.at(6, 5);
  const dummy = t.spawn('dummy', 9, 5);
  touch(t, dummy, 'right');
  t.step();
  assert.ok(t.player.knockback);
  VL.place(t.game, { area: 'arena', screen: '1,0', tx: 8, ty: 5, facing: 'right' });
  const where = [t.player.x, t.player.y];
  t.step();
  assert.equal(t.player.knockback, null);
  assert.deepEqual([t.player.x, t.player.y], where, 'not pushed in the new room');
});

test('combat does not wrap W2\'s VL.respawn: fainting itself settles the hero', () => {
  const { VL } = loadGame();
  assert.equal(VL.respawn.name, 'respawn');
});

test('every roster enemy has its own faint line, in words the font has and kind to kids', () => {
  const { VL } = loadGame();
  for (const type of ROSTER) {
    const line = VL.faintLine(type);
    assert.notEqual(line, VL.faintLine('default'), type);
    assert.equal(VL.ART.missingGlyphs(line, 'normal').length, 0, line);
    assert.ok(VL.ART.measureText(line, 'normal') <= 196, `${line} fits the faint box`);
  }
});

// ---------- the roster ----------

test('the roster is kid-friendly: small damage, few hits, long invulnerability', () => {
  const { VL } = loadGame();
  assert.ok(VL.TUNING.invulnSeconds >= 1);
  for (const type of ROSTER) {
    const def = VL.ENEMIES[type];
    assert.ok(def, type);
    assert.ok(def.damage >= 1 && def.damage <= 2, `${type} damage ${def.damage}`);
    const hits = Math.ceil(def.hp / VL.TUNING.swordDamage.woodSword);
    assert.ok(hits >= 1 && hits <= 3, `${type} takes ${hits} wood hits`);
  }
});

// Where each roster enemy starts so that it comes at a hero standing on 8,5.
const APPROACH = { crab: [12, 5], slime: [5, 5], bat: [10, 4], spitter: [8, 1], gull: [4, 3] };

test('one approach, one hit: every roster enemy backs off after hurting the hero and stays harmless for TUNING.enemyCalmSeconds', () => {
  const { VL } = loadGame();
  assert.ok(VL.TUNING.enemyCalmSeconds >= VL.TUNING.invulnSeconds + 1, 'the hero gets a real moment to walk away once the flashing stops');
  for (const type of ROSTER) {
    const t = setup();
    t.at(8, 5);
    t.game.hp = 99;
    const enemy = t.spawn(type, ...APPROACH[type]);
    const hurts = () => t.events.filter((e) => e === 'heroHurt').length;
    for (let s = 0; s < 10 && !hurts(); s += STEP) t.step();
    assert.equal(hurts(), 1, `${type} came at the hero and hit`);
    t.hold([], t.VL.TUNING.enemyCalmSeconds);
    assert.equal(hurts(), 1, `${type} hit a hero standing still more than once in ${t.VL.TUNING.enemyCalmSeconds} s`);
    if (!t.VL.ENEMIES[type].rooted) {
      const gap = Math.hypot(enemy.cx - t.player.x, enemy.cy - (t.player.y - 5));
      assert.ok(gap > 16, `${type} backed off (${gap.toFixed(1)} px away)`);
    }
  }
});

test('a seed that hits calms the spitter that spat it', () => {
  const t = setup();
  t.at(8, 5);
  t.game.hp = 99;
  const spitter = t.spawn('spitter', 8, 1);
  for (let s = 0; s < 6 && !t.events.includes('heroHurt'); s += STEP) t.step();
  assert.ok(t.events.includes('heroHurt'));
  assert.ok(spitter.calm > 0, 'calm');
});

test('a bat that hits flies off, so a hero standing still is not hit again while it leaves and dozes', () => {
  const t = setup();
  const { VL } = t;
  t.at(8, 5);
  t.game.hp = 99;
  const bat = t.spawn('bat', 10, 4);
  for (let s = 0; s < 5 && !t.events.includes('heroHurt'); s += STEP) t.step();
  assert.ok(t.events.includes('heroHurt'));
  assert.equal(bat.mode, 'leave');
  const hp = t.game.hp;
  t.hold([], VL.TUNING.enemyBat.leaveSeconds + VL.TUNING.enemyBat.doze);
  assert.equal(t.game.hp, hp);
});

// A player who walks the shortest path with real input and, when knocked off
// it, steers back to the middle of the tile and plans again. The hero's box
// touches the row below from the tile's centre line, so it steers to just
// above it.
function steerTo(drive, goal) {
  const { VL } = drive;
  const { findPath } = require('./playthrough');
  let lost = 0;
  const update = (held) => {
    drive.update(VL.actions({ held }));
    for (const e of drive.state.events) if (e.type === 'heroHurt') lost += e.damage;
    assert.ok(drive.state.hp > 0, `fainted on ${drive.state.player.screen}`);
  };
  const near = (spot) => {
    const p = drive.state.player;
    return Math.abs(p.x - spot.x) < 1.5 && p.y <= spot.y + 1e-6 && p.y > spot.y - 3.5;
  };
  for (let plan = 0; plan < 60; plan += 1) {
    while (drive.state.player.knockback || drive.state.transition) update([]);
    for (let i = 0; i < 60; i += 1) {
      const p = drive.state.player;
      const { tx, ty } = VL.heroTile(drive.state);
      const c = VL.tileCenter(tx, ty);
      if (p.y > c.y) update(['up']);
      else if (p.y < c.y - 3) update(['down']);
      else if (Math.abs(p.x - c.x) > 1.5) update([p.x < c.x ? 'right' : 'left']);
      else break;
    }
    const p = drive.state.player;
    const route = findPath(VL, { area: p.area, screen: p.screen, ...VL.heroTile(drive.state) }, { area: p.area, ...goal });
    assert.ok(route, `a path to ${goal.screen}`);
    let knocked = false;
    for (const node of route.slice(1)) {
      const spot = VL.tileCenter(node.tx, node.ty);
      const there = () => drive.state.player.screen === node.screen && !drive.state.transition && near(spot);
      for (let t = 0; t < 3 && !there() && !knocked; t += STEP) {
        update([node.dir]);
        knocked = Boolean(drive.state.player.knockback);
      }
      if (knocked) break;
      assert.ok(there(), `stuck on the way to ${node.screen} ${node.tx},${node.ty}`);
    }
    if (!knocked) return lost;
  }
  throw new Error(`kept getting knocked off the way to ${goal.screen}`);
}

test('damage budget: walking from the hut through the Woods to the Hollow Oak, never swinging, costs at most half the starting hearts', () => {
  for (const seed of [1, 2, 3]) {
    const { VL } = loadGame();
    // Stand-ins for the gate items, as in W8's Woods walk.
    for (const ch of ['O', 'h', 'V']) VL.TILESETS.base[ch].solid = false;
    const { createPlaythrough } = require('./playthrough');
    const { drive } = createPlaythrough(VL);
    drive.fight = true;
    drive.state.popups.seen.controls = true;
    drive.state.rngState = seed * 7919;
    const lost = steerTo(drive, { screen: '7,-2', tx: 7, ty: 4 });
    assert.equal(drive.state.player.screen, '7,-2');
    assert.ok(lost <= VL.TUNING.startMaxHp / 2, `seed ${seed}: lost ${lost} half hearts of ${VL.TUNING.startMaxHp}`);
  }
});

test('a hero who walks onto any enemy screen can stand and look around for a moment unhurt', () => {
  const { VL } = loadGame();
  const { cols, rows } = VL.TUNING;
  const STAND = 1.5;
  let checked = 0;
  for (const [key, screen] of Object.entries(VL.AREAS.overworld.screens)) {
    if (!screen.entities.some((e) => VL.ENEMIES[e.type])) continue;
    for (const [dx, dy, facing] of [[-1, 0, 'right'], [1, 0, 'left'], [0, -1, 'down'], [0, 1, 'up']]) {
      const next = VL.neighborKey(key, dx, dy);
      if (!VL.screenExists('overworld', next)) continue;
      const length = dx ? rows : cols;
      for (let i = 0; i < length; i += 1) {
        const tx = dx ? (dx < 0 ? 0 : cols - 1) : i;
        const ty = dy ? (dy < 0 ? 0 : rows - 1) : i;
        const nx = dx ? (dx < 0 ? cols - 1 : 0) : i;
        const ny = dy ? (dy < 0 ? rows - 1 : 0) : i;
        if (VL.isSolidAt('overworld', key, tx, ty) || VL.isSolidAt('overworld', next, nx, ny)) continue;
        const app = playApp(VL);
        app.game.popups.seen.controls = true;
        VL.place(app.game, { area: 'overworld', screen: key, tx, ty, facing });
        const hp = app.game.hp;
        for (let s = 0; s < STAND; s += STEP) app.update(VL.noActions(), STEP);
        assert.equal(app.game.hp, hp, `hurt within ${STAND} s of walking into ${key} at ${tx},${ty}`);
        checked += 1;
      }
    }
  }
  assert.ok(checked > 40, `${checked} entries checked`);
});

test('enemies on a screen the hero just entered hold still and are harmless for TUNING.enemyArrivalSeconds', () => {
  const t = setup();
  const { VL } = t;
  assert.ok(VL.TUNING.enemyArrivalSeconds > 0);
  VL.place(t.game, { area: 'arena', screen: '0,0', tx: 9, ty: 8, facing: 'right' });
  const crab = t.enemies()[0];
  const at = [crab.cx, crab.cy];
  touch(t, crab, 'right');
  const pinned = [crab.cx, crab.cy];
  const hp = t.game.hp;
  t.hold([], VL.TUNING.enemyArrivalSeconds - 0.05);
  assert.equal(t.game.hp, hp, 'harmless');
  assert.deepEqual([crab.cx, crab.cy], pinned, 'still');
  assert.notDeepEqual(pinned, at);
  t.hold([], 0.1);
  assert.equal(t.game.hp, hp - 1, 'then it is a crab again');
});

test('a beach crab scuttles sideways only', () => {
  const t = setup();
  t.at(2, 2);
  const crab = t.spawn('crab', 8, 7);
  const y0 = crab.cy;
  const xs = new Set();
  for (let s = 0; s < 5; s += STEP) {
    t.step();
    xs.add(Math.round(crab.cx));
    assert.equal(crab.cy, y0);
  }
  assert.ok(xs.size > 5, 'it moved');
});

test('a slime hops towards a hero who comes near', () => {
  const t = setup();
  t.at(10, 5);
  const slime = t.spawn('slime', 6, 5);
  const d0 = Math.abs(slime.cx - t.player.x);
  t.hold([], 2.5);
  assert.ok(Math.abs(slime.cx - t.player.x) < d0 - 8, `closer: ${d0} → ${Math.abs(slime.cx - t.player.x)}`);
});

test('a bat rests until the hero comes near, then flutters at them', () => {
  const t = setup();
  t.at(13, 8);
  const bat = t.spawn('bat', 3, 2);
  t.hold([], 3);
  assert.deepEqual([bat.mode, bat.cx, bat.cy], ['rest', 3 * 16 + 8, 2 * 16 + 8]);
  t.at(5, 3);
  t.game.room.entities.push(bat);
  const d0 = Math.hypot(bat.cx - t.player.x, bat.cy - t.player.y);
  let nearest = d0;
  for (let s = 0; s < 0.8; s += STEP) {
    t.step();
    nearest = Math.min(nearest, Math.hypot(bat.cx - t.player.x, bat.cy - t.player.y));
  }
  assert.notEqual(bat.mode, 'rest');
  assert.ok(nearest < d0 - 4, `came closer: ${d0.toFixed(1)} → ${nearest.toFixed(1)}`);
});

test('a spitter never moves and spits seeds straight at a hero in range, after a puff-up warning', () => {
  for (const [tx, ty, axis] of [[10, 5, 'x'], [6, 9, 'y']]) {
    const t = setup();
    t.at(tx, ty);
    t.game.hp = 99;
    const spitter = t.spawn('spitter', 6, 5);
    const home = [spitter.cx, spitter.cy];
    let seed = null;
    let warned = false;
    for (let s = 0; s < 5 && !seed; s += STEP) {
      t.step();
      if (spitter.mode === 'puff') warned = true;
      seed = t.game.room.entities.find((e) => e.type === 'projectile');
    }
    assert.ok(seed, 'spat');
    assert.ok(warned, 'puffed up first');
    assert.ok(t.events.includes('spit'));
    if (axis === 'x') assert.ok(seed.vx > 0 && seed.vy === 0, 'straight right');
    else assert.ok(seed.vy > 0 && seed.vx === 0, 'straight down');
    t.hold([], 2);
    assert.deepEqual([spitter.cx, spitter.cy], home);
  }
});

test('a spitter ignores a hero out of range', () => {
  const t = setup();
  t.at(14, 9);
  t.spawn('spitter', 1, 1);
  t.hold([], 5);
  assert.equal(t.game.room.entities.filter((e) => e.type === 'projectile').length, 0);
});

test('a cliff gull squawks before it dives, and only hurts while diving', () => {
  const t = setup();
  const { VL } = t;
  assert.equal(VL.ENEMIES.gull.size, 'big', 'a wood shield cannot stop it');
  for (const mode of ['circle', 'aim', 'rise']) assert.equal(VL.ENEMIES.gull.harmful({ mode }), false, mode);
  assert.equal(VL.ENEMIES.gull.harmful({ mode: 'dive' }), true);
  t.at(8, 6);
  t.game.hp = 99;
  t.spawn('gull', 4, 3);
  for (let s = 0; s < 8 && !t.events.includes('heroHurt'); s += STEP) t.step();
  assert.ok(t.events.includes('heroHurt'), 'it dived on the hero');
  assert.ok(t.events.indexOf('squawk') !== -1 && t.events.indexOf('squawk') < t.events.indexOf('heroHurt'), 'warned first');
  assert.ok(t.sounds.includes('squawk'));
});

// ---------- placement ----------

const REGION_ENEMIES = {
  beach: ['crab'],
  homeFields: ['slime'],
  eastRoad: ['slime'],
  canyon: ['slime'],
  lake: ['slime'],
  woods: ['bat', 'spitter'],
  cliffs: ['gull'],
  highlands: ['gull'],
};

test('enemies live where the design puts them: crabs on beaches, slimes in fields, bats and spitters in the Woods, gulls on the cliffs', () => {
  const { VL } = loadGame();
  const seen = {};
  for (const [key, screen] of Object.entries(VL.AREAS.overworld.screens)) {
    const region = VL.regionOf('overworld', key);
    for (const e of screen.entities.filter((entity) => VL.ENEMIES[entity.type])) {
      assert.ok(REGION_ENEMIES[region]?.includes(e.type), `${e.type} in ${region} ${key}`);
      (seen[region] ||= new Set()).add(e.type);
    }
  }
  for (const [region, types] of Object.entries(REGION_ENEMIES)) {
    if (region === 'lake' || region === 'canyon') continue;
    for (const type of types) assert.ok(seen[region]?.has(type), `${type} somewhere in ${region}`);
  }
});

test('the start and home meadow are calm, and no enemy sits in town', () => {
  const { VL } = loadGame();
  const calm = [VL.START.screen, '0,0', ...VL.REGIONS.town.screens];
  for (const key of calm) {
    assert.deepEqual(plain(VL.getScreen('overworld', key).entities.filter((e) => VL.ENEMIES[e.type]).map((e) => e.type)), [], key);
  }
});

test('every placed enemy starts on an open tile, off any spot, at least two tiles in from an open edge', () => {
  const { VL } = loadGame();
  const { cols, rows } = VL.TUNING;
  for (const [key, screen] of Object.entries(VL.AREAS.overworld.screens)) {
    for (const e of screen.entities.filter((entity) => VL.ENEMIES[entity.type])) {
      assert.ok(Number.isInteger(e.x) && Number.isInteger(e.y), `${e.type} at whole tiles in ${key}`);
      assert.ok(!VL.isSolidAt('overworld', key, e.x, e.y), `${e.type} at ${key} ${e.x},${e.y} is on open ground`);
      assert.ok(!screen.entities.some((other) => other !== e && other.x === e.x && other.y === e.y), `${e.type} shares ${key} ${e.x},${e.y}`);
      assert.ok(e.x >= 2 && e.y >= 2 && e.x <= cols - 3 && e.y <= rows - 3, `${e.type} at ${key} ${e.x},${e.y} is too near an edge`);
    }
  }
});

// ---------- heart containers ----------

test('W6 fills both overworld heart-container spots', () => {
  const { VL } = loadGame();
  for (const id of ['heartFieldA', 'heartFieldB']) {
    const spot = VL.SPOTS[id];
    assert.ok(spot.filled, id);
    const entity = VL.getScreen(spot.area, spot.screen).entities.find((e) => e.spot === id);
    assert.equal(entity.type, 'heartContainer');
    assert.equal(entity.id, id);
  }
});

function standOn(t, id) {
  const spot = t.VL.SPOTS[id];
  t.VL.place(t.game, { area: spot.area, screen: spot.screen, tx: spot.x, ty: spot.y, facing: 'down' });
  t.game.room.entities = t.game.room.entities.filter((e) => !t.VL.ENEMIES[e.type]);
  t.hold(['left'], 0.05);
}

test('a heart container adds a heart, fills every heart, and explains itself once', () => {
  const t = setup({ storage: true });
  const { VL } = t;
  const max = t.game.maxHp;
  t.game.hp = 1;
  standOn(t, 'heartFieldA');
  assert.equal(t.game.maxHp, max + VL.TUNING.heartContainerHp);
  assert.equal(VL.TUNING.heartContainerHp, 2, 'one whole heart');
  assert.equal(t.game.hp, t.game.maxHp);
  assert.ok(VL.spotFound(t.game, 'heartFieldA'));
  assert.ok(VL.LOCKS.heartFieldA.reached(t.game));
  assert.equal(t.app.sceneId, 'play', 'held up first');
  t.hold([], VL.TUNING.holdUpSeconds);
  assert.equal(t.app.sceneId, 'popup');
  assert.equal(VL.currentPopup(t.game).id, 'heartContainer');
  assert.ok(t.sounds.includes('fanfare'));
  t.hold([], 0.5);
  t.press('interact');
  assert.equal(t.app.sceneId, 'play');
  standOn(t, 'heartFieldB');
  assert.equal(t.game.maxHp, max + 4);
  assert.equal(t.app.sceneId, 'play', 'no second popup');
  assert.equal(VL.currentPopup(t.game), null);
});

test('a heart container is saved at once, and is gone for good once taken', () => {
  const t = setup({ storage: true });
  const { VL } = t;
  const max = t.game.maxHp;
  standOn(t, 'heartFieldA');
  const reloaded = VL.reloadApp(t.app);
  assert.equal(reloaded.game.maxHp, max + 2, 'saved without anything else happening');
  assert.equal(reloaded.game.hp, max + 2, 'loads with every heart full');
  const spot = VL.SPOTS.heartFieldA;
  VL.place(reloaded.game, { area: spot.area, screen: spot.screen, tx: spot.x - 1, ty: spot.y });
  assert.ok(!reloaded.game.room.entities.some((e) => e.type === 'heartContainer'), 'not there on the next visit');
});

test('VL.giveHeartContainer is there for boss rewards: no spot, same reward', () => {
  const t = setup();
  const max = t.game.maxHp;
  t.VL.giveHeartContainer(t.game);
  assert.equal(t.game.maxHp, max + 2);
  assert.equal(t.game.hp, max + 2);
});

test('the heart-container popup and the metal gear popups fit and use the font', () => {
  const { VL } = loadGame();
  for (const id of ['heartContainer', 'metalSword', 'metalShield']) {
    const popup = VL.POPUPS[id];
    assert.ok(popup, id);
    const layout = VL.ART.popupLayout({ title: popup.title, text: VL.popupText(popup.text, { name: 'Robin' }) });
    assert.ok(!layout.overflow, id);
    assert.equal(VL.ART.missingGlyphs(`${popup.title}${popup.text}`, 'normal').length, 0, id);
  }
});

// ---------- drawing ----------

test('render smoke: every enemy in every mode, seeds, puffs, heart containers, a flashing hero, a block and metal gear draw', () => {
  const t = setup();
  const { VL } = t;
  const ctx = fakeContext();
  t.give('metalSword');
  t.give('metalShield');
  t.at(8, 5);
  const modes = { crab: ['walk', 'pause'], slime: ['idle', 'hop'], bat: ['rest', 'flutter', 'leave'], spitter: ['wait', 'puff'], gull: ['circle', 'aim', 'dive', 'rise'] };
  for (const [type, list] of Object.entries(modes)) {
    for (const mode of list) {
      const enemy = t.spawn(type, 3, 3);
      enemy.mode = mode;
      enemy.hurt = 0.1;
    }
  }
  VL.spawnProjectile(t.game, { cx: 40, cy: 40, vx: 70, vy: 0, size: 'small', damage: 1, cause: 'spitter', sprite: 'fx-seed' });
  t.game.room.entities.push({ type: 'poof', x: 2, y: 2, born: t.game.time, age: 0.1 });
  t.game.room.entities.push({ type: 'heartContainer', id: 'x', x: 4, y: 4 });
  t.player.flash = 0.5;
  t.player.shield = true;
  t.player.shieldItem = 'metalShield';
  t.player.blockedAt = t.game.time;
  t.player.swing = { t: 0.1, item: 'metalSword', facing: 'right' };
  for (let i = 0; i < 12; i += 1) VL.drawWorld(ctx, t.game, i * 0.13);
  assert.ok(ctx.calls.fillRect > 0);
});

// ---------- the playthrough ----------

test('scripted playthroughs walk past enemies (cleared each step) unless a step sets drive.fight', () => {
  const { VL } = loadGame();
  const { createPlaythrough } = require('./playthrough');
  const { drive } = createPlaythrough(VL);
  const beachCrabs = () => drive.state.room.entities.filter((e) => e.type === 'crab').length;
  VL.place(drive.state, { area: 'overworld', screen: '0,1', tx: 8, ty: 3 });
  assert.equal(beachCrabs(), 1, 'the home beach has its crab');
  drive.update();
  assert.equal(beachCrabs(), 0);
  drive.fight = true;
  VL.place(drive.state, { area: 'overworld', screen: '0,1', tx: 8, ty: 3 });
  drive.update();
  assert.equal(beachCrabs(), 1);
});

test('drive.fight is reset before every milestone step, so one step\'s fight never leaks into the next', () => {
  const { VL } = loadGame();
  const { createPlaythrough, registry } = require('./playthrough');
  const [first, second] = VL.MILESTONES;
  let seen = null;
  const steps = {
    [first]: (drive) => {
      registry[first](drive);
      drive.fight = true;
    },
    [second]: (drive) => {
      seen = drive.fight;
      registry[second](drive);
    },
  };
  createPlaythrough(VL, { steps }).playTo(second);
  assert.equal(seen, false);
});

// ---------- townsfolk (W9) ----------

// A townsperson standing at tx,ty in the arena, with one line to say.
function addTownsperson(t, tx, ty) {
  t.VL.defineNpc('tester', { name: 'Tess', look: 'townsfolk' });
  t.VL.defineDialogue('tester', [{ say: 'Hello, {name}!' }]);
  const npc = { type: 'npc', id: 'tester', x: tx, y: ty };
  t.game.room.entities.push(npc);
  return npc;
}

test('S on a townsperson only talks: no swing with a sword in hand, no bush pulled bare-handed', () => {
  for (const sword of [true, false]) {
    const t = setup();
    t.at(5, 5, 'right');
    if (sword) t.give('woodSword');
    addTownsperson(t, 6, 5);
    const hp = t.game.hp;
    t.press('interact');
    assert.equal(t.app.sceneId, 'dialogue', `sword ${sword}`);
    assert.ok(!t.player.swing, `sword ${sword}: no swing`);
    assert.ok(!t.events.includes('swing') && !t.events.includes('pullHurt'), `sword ${sword}: ${t.events}`);
    assert.equal(t.game.hp, hp);
  }
});

test('enemies wait while a dialogue or a shop is open, and only touch the hero once play resumes', () => {
  const t = setup();
  t.at(5, 5, 'right');
  addTownsperson(t, 6, 5);
  t.press('interact');
  assert.equal(t.app.sceneId, 'dialogue');
  const crab = t.spawn('crab', 4, 5);
  touch(t, crab, 'left');
  const hp = t.game.hp;
  const where = [crab.cx, crab.cy];
  t.hold([], 3);
  t.app.setScene('shop', t.VL.SCENES.shop.smokeData());
  t.hold([], 3);
  assert.equal(t.game.hp, hp, 'no harm while talking or shopping');
  assert.deepEqual([crab.cx, crab.cy], where, 'the crab waited too');
  t.press('pause');
  assert.equal(t.app.sceneId, 'play', 'Esc leaves the shop');
  t.step();
  assert.ok(t.game.hp < hp, 'the crab was really touching: back in play it hurts');
});

test('the sword passes through townsfolk: no hit, no push, and an enemy behind still gets hit', () => {
  const t = setup();
  t.at(5, 5, 'right');
  t.give('woodSword');
  const npc = addTownsperson(t, 6, 5);
  const dummy = t.spawn('dummy', 6, 5);
  dummy.cx = 104;
  dummy.cy = 88;
  t.press('mainHand');
  t.hold([], 0.3);
  assert.ok(t.game.room.entities.includes(npc), 'the townsperson is still there');
  assert.deepEqual([npc.x, npc.y, npc.knock, npc.hp], [6, 5, undefined, undefined]);
  assert.equal(dummy.hp, t.VL.ENEMIES.dummy.hp - 1, 'the swing still reached the enemy');
  assert.equal(t.events.filter((e) => e === 'enemyHit').length, 1);
});

test('knockback never pushes the hero into a townsperson\'s tile', () => {
  for (const side of ['left', 'right', 'up', 'down']) {
    const t = setup();
    t.at(7, 5, side);
    const [dx, dy] = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[side];
    const back = { left: 'right', right: 'left', up: 'down', down: 'up' }[side];
    addTownsperson(t, 7 - dx, 5 - dy);
    touch(t, t.spawn('dummy', 7 + dx, 5 + dy), side);
    t.step();
    assert.ok(t.player.knockback || t.game.hp < t.game.maxHp, `${side}: hurt`);
    t.hold([], 0.4);
    const { tile, heroBox } = t.VL.TUNING;
    const p = t.player;
    const box = { l: p.x - heroBox.w / 2, r: p.x + heroBox.w / 2, t: p.y - heroBox.h / 2, b: p.y + heroBox.h / 2 };
    const npcTile = { l: (7 - dx) * tile, r: (8 - dx) * tile, t: (5 - dy) * tile, b: (6 - dy) * tile };
    const inside = box.l < npcTile.r && box.r > npcTile.l && box.t < npcTile.b && box.b > npcTile.t;
    assert.ok(!inside, `${side}, pushed ${back}: hero box ${JSON.stringify(box)} overlaps the townsperson's tile`);
  }
});
