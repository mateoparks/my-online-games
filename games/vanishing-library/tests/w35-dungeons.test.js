// W35, Matthew's fourth playtest notes on the dungeons and bosses: seeds that
// fly over the Hollow Oak's roots, boss hints only from Gran Ottie after a
// faint, no shell heaps in the Lighthouse, lava that hurts instead of
// blocking, the Dragon and its guards needing the metal sword, metal-only
// enemies in the Lighthouse, no mirror signs, no stray twinkle in the hoard,
// a hit the Dragon shows, and no string hint at the marionettes.
const assert = require('node:assert/strict');
const { test, loadGame, playState, hold } = require('./harness');

const plain = (value) => JSON.parse(JSON.stringify(value));

// ---------- 1. the Hollow Oak's north-west room: seeds over the roots ----------

function tangleNorth({ tx = 11, ty = 7 } = {}) {
  const { VL } = loadGame();
  const state = playState(VL, { area: 'hollowOak', screen: '-1,-2', tx, ty, facing: 'up' });
  state.popups.queue.length = 0;
  return { VL, state };
}

test('in the tangle\'s north room a spitter\'s seed flies over the roots and still hits him', () => {
  const { VL, state } = tangleNorth();
  const plant = state.room.entities.find((e) => e.type === 'spitter' && e.x === 11 && e.y === 3);
  assert.ok(plant.overWalls, 'placed to spit over the walls');
  for (const ty of [4, 5, 6]) assert.ok(VL.isSolidAt('hollowOak', '-1,-2', 11, ty), `a root at (11,${ty}) between them`);
  const hp = state.hp;
  hold(VL, state, [], 4);
  assert.ok(state.hp < hp, 'the seed crossed three roots and hit him');
});

test('a seed over the walls flies on to the edge of the screen', () => {
  const { VL, state } = tangleNorth({ tx: 1, ty: 9 });
  const plant = state.room.entities.find((e) => e.type === 'spitter' && e.x === 11 && e.y === 3);
  const seed = VL.spawnProjectile(state, { cx: plant.cx, cy: plant.cy + 7, vx: 0, vy: 75, size: 'small', damage: 1, cause: 'spitter', sprite: 'fx-seed', owner: plant, overWalls: true });
  let lowest = 0;
  for (let i = 0; i < 240 && state.room.entities.includes(seed); i += 1) {
    VL.updateWorld(state, VL.actions({}), 1 / 60);
    lowest = Math.max(lowest, seed.cy);
  }
  assert.ok(!state.room.entities.includes(seed), 'gone in the end');
  assert.ok(lowest > VL.TUNING.rows * VL.TUNING.tile - 16, `it reached the bottom row (${lowest.toFixed(0)})`);
});

test('every other spitter\'s seed still stops at a wall', () => {
  const { VL } = loadGame();
  const over = [];
  for (const [area, def] of Object.entries(VL.AREAS)) {
    for (const [key, screen] of Object.entries(def.screens)) {
      for (const e of screen.entities) if (e.overWalls) over.push(`${area} ${key} (${e.x},${e.y})`);
    }
  }
  assert.deepEqual(over, ['hollowOak -1,-2 (11,3)', 'hollowOak -1,-2 (5,7)']);
  const state = playState(VL, { area: 'hollowOak', screen: '-1,-2', tx: 11, ty: 7, facing: 'up' });
  const seed = VL.spawnProjectile(state, { cx: 11 * 16 + 8, cy: 3 * 16 + 15, vx: 0, vy: 75, size: 'small', damage: 1, cause: 'spitter', sprite: 'fx-seed' });
  hold(VL, state, [], 0.3);
  assert.ok(!state.room.entities.includes(seed), 'an ordinary seed stops at the first root');
});

// ---------- 2. boss hints: only from Gran Ottie, after a faint ----------

const BOSSES = {
  scriptorium: { type: 'bookworm', lock: 'd1Boss' },
  hollowOak: { type: 'thornback', lock: 'd2Boss' },
  lighthouse: { type: 'lensCrab', lock: 'd3Boss' },
  lair: { type: 'dragon', lock: 'd4Boss' },
};

function inBossRoom(id, VL = loadGame().VL) {
  const dungeon = VL.DUNGEONS[id];
  const state = playState(VL, { area: dungeon.area, screen: dungeon.boss.screen, tx: 7, ty: 8, facing: 'up' });
  state.flags.shockwave = true;
  state.flags.shockwaveDue = true;
  state.flags.shockwaveWoke = true;
  state.flags['gave:helperWood'] = true;
  state.items.woodSword = true;
  state.popups.queue.length = 0;
  return { VL, state };
}

function inHall(VL = loadGame().VL) {
  const state = playState(VL, { area: VL.FINALE.area, screen: VL.FINALE.hall, tx: 7, ty: 9, facing: 'up' });
  state.flags['finale:confronted'] = true;
  state.popups.queue.length = 0;
  return { VL, state };
}

const granSays = (VL, state) => [].concat(VL.pickDialogue(state, 'gran').say).join(' ');

for (const id of [...Object.keys(BOSSES), 'marionettes']) {
  test(`${id}: Gran Ottie gives no hint until he faints to it; then she tells how it's done, until it is beaten`, () => {
    const { VL, state } = id === 'marionettes' ? inHall() : inBossRoom(id);
    state.flags['met:gran'] = true;
    const hint = VL.BOSS_HINTS[id].say.join(' ');
    assert.notEqual(granSays(VL, state), hint, 'nothing before a faint');
    VL.faint(state, 'default');
    assert.equal(state.flags[VL.bossFaintFlag(id)], true, 'the faint is remembered');
    assert.ok(state.dirty, 'and saved');
    VL.respawn(state);
    assert.equal(granSays(VL, state), hint);
    for (const other of Object.keys(VL.BOSS_HINTS).filter((o) => o !== id)) assert.equal(VL.bossHintDue(state, other), false, `not ${other}'s`);
    if (id === 'marionettes') state.flags.marionettes = true;
    else VL.dungeonState(state, id).boss = true;
    assert.notEqual(granSays(VL, state), hint, 'quiet about it once it is beaten');
  });
}

test('a faint anywhere but a boss room, or in a beaten boss\'s room, marks no boss', () => {
  const { VL } = loadGame();
  const out = playState(VL, { area: 'overworld', screen: '1,0', tx: 7, ty: 5 });
  VL.faint(out, 'default');
  const room = inBossRoom('lair', VL).state;
  VL.dungeonState(room, 'lair').boss = true;
  VL.faint(room, 'default');
  for (const state of [out, room]) {
    assert.deepEqual(Object.keys(state.flags).filter((k) => k.startsWith('bossFainted:')), []);
  }
});

test('every boss hint fits the font, and her first talk after a faint is the hint', () => {
  const { VL } = loadGame();
  for (const [id, hint] of Object.entries(VL.BOSS_HINTS)) {
    for (const line of hint.say) {
      assert.deepEqual([...VL.ART.missingGlyphs(line.replace('{name}', 'Robin'), 'normal')], [], `${id}: ${line}`);
      assert.doesNotMatch(line, /\b(he|him|his|she|her)\b/i, `no pronoun for the hero: ${line}`);
    }
  }
  const { state } = inBossRoom('scriptorium', VL);
  VL.faint(state, 'default');
  VL.respawn(state);
  assert.equal(granSays(VL, state), VL.BOSS_HINTS.scriptorium.say.join(' '), 'even before she has said hello');
});

test('in town during the finale (the Dragon beaten), a faint to the marionettes still gets her hint first', () => {
  const { VL, state } = inHall();
  for (const id of Object.keys(BOSSES)) VL.dungeonState(state, id).boss = true;
  assert.ok(VL.LOCKS.d4Boss.reached(state));
  VL.faint(state, 'default');
  assert.equal(granSays(VL, state), VL.BOSS_HINTS.marionettes.say.join(' '));
});

test('a wrong hit on any boss says nothing: no note, no popup (the clink is the only answer)', () => {
  for (const [id, { type }] of Object.entries(BOSSES)) {
    const { VL, state } = inBossRoom(id);
    hold(VL, state, [], 0.1);
    const boss = state.room.entities.find((e) => e.type === type);
    assert.ok(boss, `${id}: its boss`);
    boss.hp -= 1;
    VL.ENEMIES[type].onHit(state, boss);
    if (VL.ENEMIES[type].onShot) VL.ENEMIES[type].onShot(state, boss, { dx: 0, dy: 1, gx: boss.cx, gy: boss.cy });
    assert.equal(state.dungeonNote, null, `${id}: no note`);
    assert.equal(state.message, null, `${id}: no message`);
  }
  for (const name of ['THORNBACK_SWORD_NOTE', 'LENS_CRAB_SWORD_NOTE', 'LENS_CRAB_BACK_NOTE', 'DRAGON_SWORD_NOTE', 'MARIONETTE_NOTE']) {
    assert.equal(loadGame().VL[name], undefined, `${name} is gone`);
  }
});

test('the marionettes: a clonk off a puppet\'s body opens no popup, and nobody tells him about the strings', () => {
  const { VL, state } = inHall();
  VL.giveItem(state, 'woodSword');
  state.popups.queue.length = 0;
  hold(VL, state, [], 0.2);
  const puppet = state.room.entities.find((e) => e.type === 'marionette');
  for (let i = 0; i < 20; i += 1) {
    state.player.swing = { item: 'woodSword', facing: 'up', t: 0 };
    VL.ENEMIES.marionette.onHit(state, puppet);
    hold(VL, state, [], 0.3);
  }
  assert.equal(state.message, null);
  const words = JSON.stringify([VL.FINALE_WORDS, VL.DIALOGUES.librarianFinale.map((e) => e.say)]);
  assert.doesNotMatch(words, /string/i, 'no word about strings in the finale talk');
});

test('no sign in any dungeon, and none of the librarian\'s boss nudges, tells how to beat a boss', () => {
  const { VL } = loadGame();
  const clue = /plates? off|hook (a|its) plate|its eyes|then strike|mirror|shiny shield|own fire|strings?|pot or two|thrown/i;
  for (const id of Object.keys(VL.DUNGEONS)) {
    for (const [key, screen] of Object.entries(VL.AREAS[VL.DUNGEONS[id].area].screens)) {
      for (const sign of screen.entities.filter((e) => e.type === 'sign')) assert.doesNotMatch(sign.text, clue, `${id} ${key}: ${sign.text}`);
    }
  }
  for (const id of ['d1Boss', 'd2Boss', 'd3Boss']) {
    for (const hint of VL.LIBRARY_HINTS[id]) assert.doesNotMatch(hint.say, clue, `${id}: ${hint.say}`);
  }
  const lair = Object.values(VL.AREAS.lair.screens).flatMap((s) => s.entities.filter((e) => e.type === 'sign'));
  assert.equal(lair.length, 1, 'only the warning at the entrance is left in the Lair');
});

test('the dragon hint lives in A Child\'s Book of Dragons: the mirror and the metal, and the librarian recalls it once read', () => {
  const { VL } = loadGame();
  const book = VL.BOOKS.bookDragons;
  const text = JSON.stringify(book);
  assert.match(text, /mirror/i);
  assert.match(text, /metal/i);
  const state = VL.newGame({ name: 'Robin' });
  const [unread, recalled] = VL.LIBRARY_HINTS.d4Boss;
  assert.ok(unread.when(state) && !/mirror|fire/i.test(unread.say), 'before the book, no hint');
  assert.match(recalled.say, /dragon book/);
  assert.equal(VL.ART.popupLayout({ title: VL.POPUPS.dragonsRead.title, text: VL.POPUPS.dragonsRead.text }).overflow, false, 'its popup fits');
});

// ---------- 3. no shell heaps in the Lighthouse ----------

test('the Lighthouse has no shell heaps; broken shells come only from the beaches (and digging), which the solver knows', () => {
  const { VL } = loadGame();
  const heaps = Object.values(VL.AREAS).flatMap((a) => Object.values(a.screens)).flatMap((s) => s.entities).filter((e) => /heap/i.test(e.type));
  assert.deepEqual(heaps, []);
  assert.equal(VL.ENTITIES.shellHeap, undefined);
  assert.equal(VL.LOCKS.lighthouseShells, undefined);
  const sources = Object.entries(VL.LOCKS).filter(([, lock]) => lock.renewable && [].concat(lock.gives || []).includes('brokenShells')).map(([id]) => id);
  assert.deepEqual(sources, ['beachBrokenShells']);
  assert.deepEqual([...VL.LOCKS.beachBrokenShells.needs], ['beach'], 'only the beach: no tool, never lost');
  assert.ok(VL.LOCKS.d3Boss.needs.includes('brokenShells'));
  assert.deepEqual([...VL.solveProgression().problems], []);
  assert.doesNotMatch(VL.OUT_OF_SHELLS.dungeon, /heap/i);
  assert.ok(VL.ART.measureText(VL.OUT_OF_SHELLS.dungeon, 'small') <= VL.TUNING.width - 8);
});

test('every beach broken shell comes back on the next visit, so a kid can always gather more', () => {
  const { VL } = loadGame();
  const state = playState(VL, { area: 'overworld', screen: '1,1', tx: 3, ty: 7, facing: 'down' });
  state.popups.seen.brokenShell = true;
  hold(VL, state, ['down'], 0.4);
  assert.equal(state.inventory.brokenShells, 1);
  VL.place(state, { area: 'overworld', screen: '0,1', tx: 7, ty: 5 });
  VL.place(state, { area: 'overworld', screen: '1,1', tx: 3, ty: 7, facing: 'down' });
  hold(VL, state, ['down'], 0.4);
  assert.equal(state.inventory.brokenShells, 2);
});

// ---------- 4. lava: walkable, each step onto it hurts ----------

// The cellar: floor at (6,5), lava at (7,3)..(10,4) above-right of it.
function cellar(hp) {
  const { VL } = loadGame();
  const state = playState(VL, { area: 'lair', screen: '-1,0', tx: 7, ty: 5, facing: 'up' });
  state.room.entities = state.room.entities.filter((e) => !VL.isEnemy(e));
  state.popups.queue.length = 0;
  if (hp) state.hp = hp;
  return { VL, state };
}
const tileNow = (VL, state) => [VL.heroTile(state).tx, VL.heroTile(state).ty];
function stepTo(VL, state, dir, tile) {
  for (let i = 0; i < 120 && tileNow(VL, state).join() !== tile.join(); i += 1) VL.updateWorld(state, VL.actions({ held: [dir] }), 1 / 60);
  assert.deepEqual(tileNow(VL, state), tile, `reached ${tile}`);
  hold(VL, state, [], 0.1);
}

test('lava can be walked on: the first step onto it hurts, standing on it doesn\'t, every new lava tile hurts again', () => {
  const { VL, state } = cellar();
  assert.equal(VL.tileInfo('lair', VL.tileAt('lair', '-1,0', 7, 4)).lava, true);
  const full = state.hp;
  stepTo(VL, state, 'up', [7, 4]);
  assert.equal(state.hp, full - VL.TUNING.lavaDamage, 'one step in, one burn');
  hold(VL, state, [], 5);
  assert.equal(state.hp, full - VL.TUNING.lavaDamage, 'no timer: standing still is safe');
  stepTo(VL, state, 'up', [7, 3]);
  assert.equal(state.hp, full - 2 * VL.TUNING.lavaDamage, 'lava to lava burns again');
  stepTo(VL, state, 'right', [8, 3]);
  assert.equal(state.hp, full - 3 * VL.TUNING.lavaDamage);
  stepTo(VL, state, 'down', [8, 4]);
  stepTo(VL, state, 'down', [8, 5]);
  assert.equal(state.hp, full - 4 * VL.TUNING.lavaDamage, 'stepping off is free');
  stepTo(VL, state, 'up', [8, 4]);
  assert.equal(state.hp, full - 5 * VL.TUNING.lavaDamage, 'and back on burns');
});

test('a step onto lava at the last half heart faints him, and he wakes at the Lair\'s statue with everything kept', () => {
  const { VL, state } = cellar(1);
  state.savePoint = { area: 'lair', screen: '0,0', tx: 3, ty: 3, facing: 'down' };
  VL.dungeonState(state, 'lair').keysGiven = 1;
  stepTo(VL, state, 'up', [7, 4]);
  assert.equal(state.hp, 0);
  assert.deepEqual(plain(state.fainted), { cause: 'lava' });
  assert.match(VL.faintLine('lava'), /lava/);
  VL.respawn(state);
  assert.deepEqual([state.player.area, state.player.screen], ['lair', '0,0']);
  assert.equal(state.hp, state.maxHp);
  assert.equal(VL.dungeonState(state, 'lair').keysGiven, 1);
});

test('lava stays shut to everything but his feet: no block, no enemy, no knockback, and the scripted hero never plans across it', () => {
  const { VL, state } = cellar();
  const info = VL.tileInfo('lair', '~');
  assert.ok(info.solid && info.pit && !info.flyOver, 'still a solid pit for blocks, enemies, chickens and fire');
  assert.ok(VL.isSolidAt('lair', '-1,0', 7, 4), 'solid to anything that isn\'t the hero');
  const { isWalkable } = require('./playthrough');
  assert.equal(isWalkable(VL, 'lair', '-1,0', 7, 4, state), false, 'the planner keeps off it');
  // Knocked back towards the lava, he stops at its edge.
  Object.assign(state.player, VL.tileCenter(7, 5));
  state.player.knockback = { vx: 0, vy: -120, t: 0.5, room: state.room };
  const hp = state.hp;
  hold(VL, state, [], 0.6);
  assert.deepEqual(tileNow(VL, state), [7, 5]);
  assert.equal(state.hp, hp);
});

test('lava opens no new ground: the floor reached over lava is the floor reached without it, so nothing ever needs a step on it', () => {
  const { VL } = loadGame();
  const { cols, rows } = VL.TUNING;
  const reach = (overLava) => {
    const seen = new Set();
    const queue = [['0,0', 7, 9]];
    while (queue.length) {
      const [key, tx, ty] = queue.shift();
      const id = `${key}|${tx},${ty}`;
      if (seen.has(id)) continue;
      const info = VL.tileInfo('lair', VL.tileAt('lair', key, tx, ty));
      if (info.solid && !(overLava && info.lava)) continue;
      seen.add(id);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = tx + dx;
        const y = ty + dy;
        if (x >= 0 && y >= 0 && x < cols && y < rows) queue.push([key, x, y]);
        else {
          const next = VL.neighborKey(key, dx, dy);
          if (VL.screenExists('lair', next)) queue.push([next, (x + cols) % cols, (y + rows) % rows]);
        }
      }
    }
    return [...seen].filter((id) => {
      const [key, xy] = id.split('|');
      const [x, y] = xy.split(',').map(Number);
      return !VL.tileInfo('lair', VL.tileAt('lair', key, x, y)).lava;
    }).sort();
  };
  assert.deepEqual(reach(true), reach(false));
  assert.ok(reach(false).length > 500);
});

// ---------- 5. the Dragon wants the metal sword; thorny guards at the cave mouth ----------

const fs = require('node:fs');
const path = require('node:path');
const { memoryStorage } = require('./harness');

function dazedDragon(sword) {
  const { VL, state } = inBossRoom('lair');
  VL.dungeonState(state, 'lair').doors.d4BossDoor = true;
  state.items[sword] = true;
  state.items.mirrorShield = true;
  state.hands = { mainHand: sword, offHand: 'mirrorShield' };
  hold(VL, state, [], 0.1);
  const dragon = state.room.entities.find((e) => e.type === 'dragon');
  dragon.arriving = 0;
  VL.ENEMIES.dragon.onFire(state, dragon, { owner: dragon });
  assert.equal(dragon.mode, 'dazed');
  return { VL, state, dragon };
}

test('the wood sword never hurts the Dragon, not even dazed, and says nothing; the metal sword does', () => {
  {
    const { VL, state, dragon } = dazedDragon('woodSword');
    for (let i = 0; i < 6; i += 1) {
      dragon.hurt = 0;
      VL.hitEnemy(state, dragon, VL.TUNING.swordDamage.woodSword, VL.heroCentre(state), 'woodSword');
    }
    assert.deepEqual([dragon.life, dragon.rounds, dragon.mode], [VL.TUNING.dragonRoundLife, VL.TUNING.dragonRounds, 'dazed']);
    assert.equal(state.message, null, 'no popup');
    assert.equal(state.dungeonNote, null, 'no note');
    VL.hitEnemy(state, dragon, VL.TUNING.liftThrowDamage, VL.heroCentre(state));
    assert.equal(dragon.life, VL.TUNING.dragonRoundLife, 'nor a thrown pot');
  }
  {
    const { VL, state, dragon } = dazedDragon('metalSword');
    VL.hitEnemy(state, dragon, VL.TUNING.swordDamage.metalSword, VL.heroCentre(state), 'metalSword');
    assert.equal(dragon.rounds, VL.TUNING.dragonRounds - 1, 'one metal hit ends the round');
  }
});

function lairMouth({ sword = 'metalSword', flags = {} } = {}) {
  const { VL } = loadGame();
  const state = VL.createGame();
  Object.assign(state.flags, flags);
  state.items[sword] = true;
  state.hands = { mainHand: sword, offHand: null };
  VL.place(state, { area: 'overworld', screen: '-1,-5', tx: 7, ty: 8, facing: 'up' });
  state.popups.queue.length = 0;
  const guards = () => state.room.entities.filter((e) => e.guard);
  const door = () => state.room.entities.find((e) => e.type === 'door' && e.shutUntil === 'lairGuards');
  return { VL, state, guards, door };
}

test('two thorny guards hold the cave mouth: the door stays shut and says so while they stand', () => {
  const { VL, state, guards, door } = lairMouth();
  assert.deepEqual(plain(guards().map((g) => [g.type, g.x, g.y, g.tough])), [['spitter', 6, 6, true], ['spitter', 8, 6, true]]);
  assert.ok(door().solid);
  const { findPath } = require('./playthrough');
  const from = { area: 'overworld', screen: '-1,-5', tx: 7, ty: 8 };
  assert.equal(findPath(VL, from, { area: 'lair', screen: '0,0', tx: 7, ty: 9 }, state), null, 'the planner sees it shut');
  state.player.invuln = 99;
  Object.assign(state.player, VL.tileCenter(7, 5));
  hold(VL, state, ['up'], 0.5);
  assert.equal(state.player.area, 'overworld', 'not in');
  assert.equal(state.message?.text, VL.LAIR_GUARD_WORDS);
  assert.deepEqual([...VL.ART.missingGlyphs(VL.LAIR_GUARD_WORDS)], []);
});

test('a wood sword only clinks off the guards (with W30\'s "Clink!" word); the metal sword beats them for good and the door opens', () => {
  {
    const { VL, state, guards } = lairMouth({ sword: 'woodSword' });
    hold(VL, state, [], 0.6);
    VL.hitEnemy(state, guards()[0], 1, VL.heroCentre(state), 'woodSword');
    assert.equal(guards()[0].hp, VL.ENEMIES.spitter.hp);
    assert.equal(state.message?.title, 'Clink!');
  }
  const { VL, state, guards, door } = lairMouth();
  hold(VL, state, [], 0.6);
  for (const g of guards()) VL.hitEnemy(state, g, VL.TUNING.swordDamage.metalSword, VL.heroCentre(state), 'metalSword');
  hold(VL, state, [], 0.1);
  assert.equal(state.flags.lairGuards, true);
  assert.ok(state.dirty, 'saved');
  assert.equal(door().solid, false);
  assert.ok(VL.LOCKS.lairGuards.reached(state));
  VL.place(state, { area: 'overworld', screen: '-1,-5', tx: 7, ty: 8, facing: 'up' });
  assert.deepEqual(plain(guards()), [], 'gone for good');
  assert.equal(door().solid, false);
});

test('guards cleared without a fight (as the playthrough clears enemies) never open the door', () => {
  const { VL, state, door } = lairMouth();
  state.room.entities = state.room.entities.filter((e) => !VL.isEnemy(e));
  hold(VL, state, [], 0.5);
  assert.equal(state.flags.lairGuards, undefined);
  assert.ok(door().solid);
});

test('the guards are out of line with the doorstep, so a hero who stands there is never shot', () => {
  const { VL, state } = lairMouth();
  Object.assign(state.player, VL.tileCenter(7, 5));
  const hp = state.hp;
  hold(VL, state, [], 12);
  assert.equal(state.hp, hp);
});

test('the table: the guards need the metal sword, the Lair needs the guards, the Dragon and its door need the metal sword, and the whole path solves with the sword forged again after the shockwave', () => {
  const { VL } = loadGame();
  assert.deepEqual([...VL.LOCKS.lairGuards.needs], ['highlands', 'metalSword']);
  assert.deepEqual([...VL.LOCKS.dragonsLairEntered.needs], ['highlands', 'lairGuards']);
  assert.ok(VL.LOCKS.d4BossDoor.needs.includes('metalSword'));
  assert.ok(VL.LOCKS.d4Boss.needs.includes('metalSword'));
  assert.ok(VL.LOCKS.shockwave.loses.includes('metalSword'), 'the shockwave takes it, so it must be forged again');
  const lair = VL.getScreen('lair', '0,-2').entities.find((e) => e.id === 'd4BossDoor');
  assert.deepEqual([...lair.wants.items], ['metalSword']);
  const report = VL.solveProgression();
  assert.deepEqual([...report.problems], []);
});

test('an old save standing in the Lair with only a wood sword: the Dragon can\'t be hurt, but the way out, an ore lump and the smith\'s metal sword are all there', () => {
  const { VL } = loadGame();
  const save = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v1-W19.json'), 'utf8'));
  save.dungeons.lair.boss = false;
  save.savePoint = { area: 'lair', screen: '0,0', tx: 3, ty: 2, facing: 'down' };
  const storage = VL.createStorage(memoryStorage({ [VL.slotKey(0)]: JSON.stringify(save) }));
  const state = VL.loadSlot(storage, 0);
  VL.respawn(state);
  assert.deepEqual([state.player.area, VL.hasItem(state, 'woodSword'), VL.hasItem(state, 'metalSword')], ['lair', true, false]);
  assert.ok(state.inventory.ore >= 1, 'ore for the smith');
  // Out through the door, past the guards (who only spit), and the smith sells the sword.
  VL.place(state, VL.DUNGEONS.lair.entrance);
  assert.equal(state.room.entities.filter((e) => e.guard).length, 2);
  assert.equal(state.flags.lairGuards, undefined);
  const offer = VL.shopOffers(state, VL.SHOPS.smithy).find((o) => /^metalSword/.test(o.id));
  assert.ok(offer, 'the smith forges a metal sword');
  assert.ok(offer.cost.ore <= state.inventory.ore && offer.cost.shells <= VL.shellCap(state));
});

test('the W19 fixture (the Dragon beaten before the guards existed) finds the cave mouth clear', () => {
  const { VL } = loadGame();
  const text = fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v1-W19.json'), 'utf8');
  const storage = VL.createStorage(memoryStorage({ [VL.slotKey(0)]: text }));
  const state = VL.loadSlot(storage, 0);
  VL.place(state, { area: 'overworld', screen: '-1,-5', tx: 7, ty: 8, facing: 'up' });
  assert.deepEqual(plain(state.room.entities.filter((e) => e.guard)), []);
  assert.equal(state.flags.lairGuards, true);
});

// ---------- 6. metal-only enemies in the Lighthouse, never in the way ----------

test('the Lighthouse holds thorny slimes only the metal sword beats, and nothing in it needs them beaten', () => {
  const { VL } = loadGame();
  const tough = Object.entries(VL.AREAS.lighthouse.screens).flatMap(([key, s]) => s.entities.filter((e) => e.tough).map((e) => `${key} ${e.type}`));
  assert.deepEqual(tough, ['0,-1 slime', '0,-2 slime']);
  const all = Object.values(VL.AREAS.lighthouse.screens).flatMap((s) => s.entities);
  assert.ok(!all.some((e) => e.reveal === 'cleared'), 'no key waits for a cleared room');
  for (const [id, lock] of Object.entries(VL.LOCKS).filter(([id]) => /^d3|^lighthouse|^slingshot$/.test(id))) {
    assert.ok(!(lock.needs || []).includes('metalSword'), `${id} needs no metal sword (any sword will do)`);
  }
  const state = playState(VL, { area: 'lighthouse', screen: '0,-1', tx: 7, ty: 5 });
  state.popups.queue.length = 0;
  const slime = state.room.entities.find((e) => e.type === 'slime');
  slime.arriving = 0;
  VL.hitEnemy(state, slime, 1, VL.heroCentre(state), 'woodSword');
  assert.equal(slime.hp, VL.ENEMIES.slime.hp, 'the wood sword clinks');
  assert.equal(state.message?.title, 'Clink!');
  VL.hitEnemy(state, slime, VL.TUNING.swordDamage.metalSword, VL.heroCentre(state), 'metalSword');
  assert.ok(!state.room.entities.includes(slime), 'the metal sword beats it');
});

test('a tough slime wears woody thorns, in every pose; a plain one doesn\'t', () => {
  const { VL } = loadGame();
  const painted = (slime, t) => {
    const colors = [];
    const ctx = new Proxy({}, { get: (o, p) => (p === 'fillStyle' ? undefined : () => {}), set: (o, p, v) => { if (p === 'fillStyle') colors.push(v); return true; } });
    VL.ENEMIES.slime.draw(ctx, slime, 100, 100, t);
    return colors;
  };
  const bark = VL.ART.color('bark');
  for (const pose of [{ mode: 'idle', t: 0 }, { mode: 'idle', t: 0.4 }, { mode: 'hop', timer: 0.2, t: 0 }]) {
    assert.ok(painted({ tough: true, ...pose }, pose.t).includes(bark), JSON.stringify(pose));
    assert.ok(!painted({ ...pose }, pose.t).includes(bark));
  }
});

// ---------- 8. no stray twinkle in the hoard ----------

test('the Dragon\'s hoard room twinkles nowhere: the old sparkle by the book pile (nothing was ever there) is gone', () => {
  const { VL, state } = inBossRoom('lair');
  hold(VL, state, [], 0.1);
  const sparkles = [];
  const real = VL.ART.drawSparkle;
  VL.ART.drawSparkle = (ctx, x, y) => sparkles.push([x, y]);
  try {
    const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
    for (const t of [0, 0.7, 1.9, 3.3]) VL.drawScreen(ctx, 'lair', '0,-3', 0, 0, t, state.room);
  } finally {
    VL.ART.drawSparkle = real;
  }
  assert.deepEqual(sparkles, []);
});

// ---------- 9. a hit on the Dragon shows ----------

test('a hit that counts tints the Dragon a pale pink for a moment and it cries out; a clink doesn\'t; nothing blinks', () => {
  const { VL, state, dragon } = dazedDragon('metalSword');
  const drawn = () => {
    const ids = [];
    const real = VL.ART.drawSprite;
    VL.ART.drawSprite = (ctx, id) => ids.push(id);
    try {
      VL.ENEMIES.dragon.draw(new Proxy({}, { get: () => () => {}, set: () => true }), dragon, 120, 60, state.time);
    } finally {
      VL.ART.drawSprite = real;
    }
    return ids;
  };
  assert.deepEqual(drawn(), ['enemy-dragon-dazed']);
  state.events.length = 0;
  VL.hitEnemy(state, dragon, 1, VL.heroCentre(state), 'metalSword');
  assert.ok(state.events.some((e) => e.type === 'dragonHurt'), 'it cries out');
  assert.deepEqual(drawn(), ['enemy-dragon-hit'], 'tinted');
  // Steady for its whole moment, then back: one change each way, never a strobe.
  const frames = [];
  for (let i = 0; i < 40; i += 1) {
    VL.ENEMIES.dragon.think(state, dragon, 1 / 60);
    frames.push(drawn()[0]);
  }
  const changes = frames.filter((id, i) => i && id !== frames[i - 1]).length;
  assert.equal(changes, 1, frames.join());
  assert.ok(frames.filter((id) => id === 'enemy-dragon-hit').length >= 0.3 * 60 - 1, 'held long enough to see');
  // A wood sword clinks: no tint, no cry.
  const wood = dazedDragon('woodSword');
  wood.state.events.length = 0;
  VL.hitEnemy(wood.state, wood.dragon, 1, VL.heroCentre(wood.state), 'woodSword');
  assert.ok(!(wood.dragon.tint > 0));
  assert.ok(!wood.state.events.some((e) => e.type === 'dragonHurt'));
});

test('the hit tint is a pale pink, not a saturated red (the flash guard\'s red check)', () => {
  const { VL } = loadGame();
  for (const name of ['dragonHit', 'dragonHitLight', 'dragonHitDark']) {
    const hex = VL.ART.color(name);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    assert.ok(r / (r + g + b) < 0.8, `${name} ${hex}`);
  }
});
