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

test('the rope\'s pull carries him over lava without a burn, and never lands him on it', () => {
  const { VL, state } = cellar();
  // A post at (7,1): the pull runs up over the lava at (7,4) and (7,3) to (7,2).
  state.room.entities.push({ type: 'grapplePost', x: 7, y: 1, solid: true });
  assert.ok(VL.tileInfo('lair', VL.tileAt('lair', '-1,0', 7, 3)).lava && !VL.tileInfo('lair', VL.tileAt('lair', '-1,0', 7, 2)).lava);
  const hp = state.hp;
  let overLava = 0;
  assert.ok(VL.throwRope(state));
  for (let i = 0; i < 180 && (state.player.rope || i < 2); i += 1) {
    VL.updateWorld(state, VL.actions({}), 1 / 60);
    const { tx, ty } = VL.heroTile(state);
    if (VL.tileInfo('lair', VL.tileAt('lair', '-1,0', tx, ty)).lava) overLava += 1;
  }
  assert.ok(overLava > 0, 'he crossed the lava');
  assert.deepEqual(tileNow(VL, state), [7, 2]);
  assert.equal(state.hp, hp, 'no burn in the air');
  // A post with lava in front of it sends the hook back: lava is solid to it.
  const { VL: V2, state: s2 } = cellar();
  Object.assign(s2.player, V2.tileCenter(7, 6), { facing: 'up' });
  s2.room.entities.push({ type: 'grapplePost', x: 7, y: 2, solid: true });
  V2.throwRope(s2);
  for (let i = 0; i < 120 && s2.player.rope; i += 1) V2.updateWorld(s2, V2.actions({}), 1 / 60);
  assert.deepEqual(tileNow(V2, s2), [7, 6], 'no pull onto (7,3)');
});

test('lava opens no new ground: no lava tile joins two stretches of floor that a gate (bars, a locked door, a push block) or a wall keeps apart', () => {
  const { VL } = loadGame();
  const { cols, rows } = VL.TUNING;
  const screens = Object.keys(VL.AREAS.lair.screens);
  // Every gate counts as a wall in both runs, so a detour over lava around
  // one shows up as two floor stretches the lava joins.
  const gates = new Set();
  for (const key of screens) {
    for (const e of VL.getScreen('lair', key).entities) {
      if (['shutter', 'lockedDoor', 'pushBlock'].includes(e.type) || e.solid || VL.ENTITIES[e.type]?.solid) gates.add(`${key}|${e.x},${e.y}`);
    }
  }
  const lava = (key, x, y) => Boolean(VL.tileInfo('lair', VL.tileAt('lair', key, x, y)).lava);
  const open = (key, x, y, overLava, walls) => {
    if (walls.has(`${key}|${x},${y}`)) return false;
    const info = VL.tileInfo('lair', VL.tileAt('lair', key, x, y));
    return !info.solid || (overLava && Boolean(info.lava));
  };
  // Labels every open tile with its stretch of floor, across screen edges.
  const stretches = (overLava, walls) => {
    const label = new Map();
    let n = 0;
    for (const key of screens) {
      for (let ty = 0; ty < rows; ty += 1) {
        for (let tx = 0; tx < cols; tx += 1) {
          if (label.has(`${key}|${tx},${ty}`) || !open(key, tx, ty, overLava, walls)) continue;
          n += 1;
          const queue = [[key, tx, ty]];
          label.set(`${key}|${tx},${ty}`, n);
          while (queue.length) {
            const [k, cx, cy] = queue.shift();
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              let [nk, x, y] = [k, cx + dx, cy + dy];
              if (x < 0 || y < 0 || x >= cols || y >= rows) {
                nk = VL.neighborKey(k, dx, dy);
                if (!VL.screenExists('lair', nk)) continue;
                [x, y] = [(x + cols) % cols, (y + rows) % rows];
              }
              const id = `${nk}|${x},${y}`;
              if (label.has(id) || !open(nk, x, y, overLava, walls)) continue;
              label.set(id, n);
              queue.push([nk, x, y]);
            }
          }
        }
      }
    }
    return label;
  };
  const lavaJoins = (walls) => {
    const dry = stretches(false, walls);
    const wet = stretches(true, walls);
    const joined = new Map();
    for (const [id, wetLabel] of wet) {
      const [key, xy] = id.split('|');
      const [x, y] = xy.split(',').map(Number);
      if (lava(key, x, y)) continue;
      if (!joined.has(wetLabel)) joined.set(wetLabel, new Set());
      joined.get(wetLabel).add(dry.get(id));
    }
    return { dry, merged: [...joined.values()].filter((set) => set.size > 1).map((set) => [...set].join('+')) };
  };
  const { dry, merged } = lavaJoins(gates);
  assert.deepEqual(merged, [], 'a lava step joins floor that is apart without it');
  assert.ok(dry.size > 500, 'the floor was read');
  assert.ok(gates.size >= 10, 'the gates were read');
  // The check has teeth: bars down the cellar's column 8, with only its
  // lava (8,3) and (8,4) left open, cut the west half off but for the lava.
  assert.ok(lava('-1,0', 8, 3) && lava('-1,0', 8, 4));
  const barred = new Set(gates);
  for (const y of [1, 2, 5, 6, 7, 8, 9]) barred.add(`-1,0|8,${y}`);
  assert.notDeepEqual(lavaJoins(barred).merged, [], 'a detour over lava round a gate is caught');
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

// ---------- the marionettes' standoff by a wall ----------

test('a puppet on the wall side of a hero who stands by that wall picks a spot on his open side, never against the wall on top of him', () => {
  for (const wall of ['left', 'right']) {
    const { VL, state } = inHall();
    hold(VL, state, [], 0.1);
    const b = VL.MARIONETTE_BOUNDS;
    const { min } = VL.MARIONETTE_STANDOFF;
    const m = state.room.entities.find((e) => e.type === 'marionette' && !e.fallen);
    const toward = wall === 'left' ? -1 : 1;
    state.player.x = wall === 'left' ? b.left + 4 : b.right - 4;
    m.cx = state.player.x + toward * 3;
    m.cy = state.player.y;
    m.target = null;
    m.mode = 'drift';
    m.jerk = 0;
    VL.ENEMIES.marionette.think(state, m, 1 / 60);
    const side = Math.sign(m.target.x - state.player.x);
    assert.equal(side, -toward, `${wall} wall: it goes round to his open side (target ${m.target.x.toFixed(0)}, hero ${state.player.x})`);
    assert.ok(Math.abs(m.target.x - state.player.x) >= min - 1e-9, 'at least the standoff away');
  }
});

// ---------- the W35 fixture ----------

test('the W35 fixture (played to the Dragon with the metal sword forged again and the guards beaten, then a faint to it) loads with nothing reset, and Gran has its hint', () => {
  const { VL } = loadGame();
  const text = fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v1-W35.json'), 'utf8');
  const storage = VL.createStorage(memoryStorage({ [VL.slotKey(0)]: text }));
  const slot = VL.readSlot(storage, 0);
  assert.equal(slot.status, 'ok');
  assert.deepEqual(plain(slot.resets || []), []);
  const game = VL.loadSlot(storage, 0);
  assert.equal(game.flags['bossFainted:lair'], true);
  assert.equal(game.flags.lairGuards, true);
  assert.ok(VL.hasItem(game, 'metalSword') && !VL.bossBeaten(game, 'lair'));
  VL.respawn(game);
  assert.deepEqual([game.player.area, game.player.screen], ['lair', '0,0'], 'Continue at the Lair\'s statue');
  game.flags['met:gran'] = true;
  assert.equal([].concat(VL.pickDialogue(game, 'gran').say).join(' '), VL.BOSS_HINTS.lair.say.join(' '));
  VL.place(game, { area: 'overworld', screen: '-1,-5', tx: 7, ty: 8, facing: 'up' });
  assert.deepEqual(plain(game.room.entities.filter((e) => e.guard)), [], 'the guards stay beaten');
});

// ---------- the Dragon, trickier round by round (Matthew's decision) ----------

// A Dragon in the given round, awake, the hero below it with the Mirror Shield.
function dragonRound(round, { shield = true } = {}) {
  const { VL, state } = inBossRoom('lair');
  VL.dungeonState(state, 'lair').doors.d4BossDoor = true;
  Object.assign(state.items, { metalSword: true, mirrorShield: true });
  state.hands = { mainHand: 'metalSword', offHand: shield ? 'mirrorShield' : null };
  hold(VL, state, [], 0.1);
  const dragon = state.room.entities.find((e) => e.type === 'dragon');
  dragon.arriving = 0;
  dragon.rounds = VL.TUNING.dragonRounds - round + 1;
  dragon.mode = round >= 2 ? 'perch' : 'prowl';
  dragon.timer = 0;
  state.player.invuln = 0;
  return { VL, state, dragon };
}
// Steps the world, recording each ball of fire the moment it is breathed.
function watchFire(VL, state, seconds, held = []) {
  const seen = [];
  for (let t = 0; t < seconds; t += 1 / 60) {
    VL.updateWorld(state, VL.actions({ held }), 1 / 60);
    for (const ball of state.room.entities.filter((e) => e.type === 'dragonFire' && !seen.some((s) => s.ball === e))) seen.push({ ball, at: state.time, vx: ball.vx, vy: ball.vy, wild: Boolean(ball.wild) });
  }
  return seen;
}

test('round one is as before: it paces after the hero and breathes one ball at a time', () => {
  const { VL, state, dragon } = dragonRound(1);
  state.player.invuln = 99;
  const balls = watchFire(VL, state, VL.TUNING.dragonBreatheEvery + VL.TUNING.dragonInhaleSeconds + 0.3);
  assert.equal(balls.length, 1);
  assert.equal(balls[0].wild, false);
  assert.ok(!VL.TUNING.dragonPerches.includes(Math.round(dragon.cx)) || dragon.mode !== 'perch');
});

test('round two: it flies to one of its perches, draws breath there, then breathes two balls in a row, each aimed at him', () => {
  const { VL, state, dragon } = dragonRound(2);
  state.player.invuln = 99;
  const inhaleAt = [];
  let breathAt = null;
  const balls = [];
  for (let t = 0; t < 6 && balls.length < 2; t += 1 / 60) {
    VL.updateWorld(state, VL.actions({}), 1 / 60);
    if (dragon.mode === 'inhale' && breathAt === null) {
      breathAt = state.time;
      inhaleAt.push(Math.round(dragon.cx));
    }
    for (const ball of state.room.entities.filter((e) => e.type === 'dragonFire' && !balls.some((b) => b.ball === e))) balls.push({ ball, at: state.time });
  }
  assert.ok(VL.TUNING.dragonPerches.some((x) => Math.abs(x - inhaleAt[0]) <= 2), `drew breath on a perch (${inhaleAt[0]})`);
  assert.equal(balls.length, 2, 'a pair');
  assert.ok(balls[0].at - breathAt >= VL.TUNING.dragonInhaleSeconds - 1e-6, 'the breath is drawn first (the wind-up)');
  assert.ok(balls[1].at - balls[0].at >= VL.TUNING.dragonVolleyGap - 1e-6, 'one after the other');
  assert.ok(balls.every((b) => !b.ball.wild), 'both can be bounced');
  for (const { ball } of balls) assert.ok(ball.vy > 0, 'aimed down at him');
});

test('round three: a longer breath, then a fan of three: only the middle one bounces off the Mirror Shield; the purple ones hurt through it', () => {
  const { VL, state, dragon } = dragonRound(3);
  state.player.invuln = 99;
  const balls = [];
  let breathAt = null;
  for (let t = 0; t < 8 && balls.length < 3; t += 1 / 60) {
    VL.updateWorld(state, VL.actions({}), 1 / 60);
    if (dragon.mode === 'inhale' && breathAt === null) breathAt = state.time;
    for (const ball of state.room.entities.filter((e) => e.type === 'dragonFire' && !balls.includes(e))) balls.push(ball);
  }
  assert.equal(balls.length, 3, 'a fan of three, breathed together');
  assert.ok(state.time - breathAt >= VL.TUNING.dragonFanInhaleSeconds - 1e-6, 'a longer wind-up before it');
  assert.deepEqual(balls.map((b) => Boolean(b.wild)), [false, true, true], 'the middle one is the ordinary one');
  const angle = (b) => Math.atan2(b.vy, b.vx);
  assert.ok(Math.abs(Math.abs(angle(balls[1]) - angle(balls[0])) - VL.TUNING.dragonFanSpread) < 1e-6);
  assert.ok(Math.abs(Math.abs(angle(balls[2]) - angle(balls[0])) - VL.TUNING.dragonFanSpread) < 1e-6);
  // A purple ball straight at a raised Mirror Shield hurts him.
  const t = dragonRound(1);
  t.state.player.facing = 'up';
  const hero = VL.heroCentre(t.state);
  const hp = t.state.hp;
  VL.spawnFire(t.state, { cx: hero.x, cy: hero.y - 40, vx: 0, vy: 80, owner: t.dragon, wild: true });
  hold(t.VL, t.state, ['offHand'], 0.8);
  assert.equal(t.state.hp, hp - VL.TUNING.fireDamage, 'not bounced, it burns');
  assert.equal(t.state.dungeonNote, null, 'and says nothing');
});

test('the fan is fair: a hero who stands in its middle line, shield up, bounces the middle ball and the purple ones fly wide of him', () => {
  const { VL, state, dragon } = dragonRound(3);
  state.player.facing = 'up';
  Object.assign(state.player, VL.tileCenter(VL.tileOf(dragon.cx, dragon.cy).tx, 6));
  const hp = state.hp;
  let dazed = false;
  for (let t = 0; t < 8 && !dazed; t += 1 / 60) {
    VL.updateWorld(state, VL.actions({ held: ['offHand'] }), 1 / 60);
    dazed = dragon.mode === 'dazed';
    // Stand where it will breathe: under its perch, once it is on one.
    if (dragon.perched && dragon.mode === 'perch') Object.assign(state.player, VL.tileCenter(VL.tileOf(dragon.cx, dragon.cy).tx, 6), { facing: 'up' });
  }
  assert.ok(dazed, 'the middle ball came home');
  assert.equal(state.hp, hp, 'no purple ball touched him');
});

test('the same hits win as before, and a faint resets the fight to round one', () => {
  const { VL, state, dragon } = dragonRound(1);
  state.player.invuln = 99;
  let hits = 0;
  for (let round = 1; round <= 3; round += 1) {
    assert.equal(VL.dragonRound(dragon), round);
    VL.ENEMIES.dragon.onFire(state, dragon, { owner: dragon });
    VL.hitEnemy(state, dragon, VL.TUNING.swordDamage.metalSword, VL.heroCentre(state), 'metalSword');
    hits += 1;
    for (let t = 0; t < 2 && !['perch', 'prowl', 'dying'].includes(dragon.mode); t += 1 / 60) VL.updateWorld(state, VL.actions({}), 1 / 60);
  }
  assert.equal(dragon.mode, 'dying');
  assert.equal(hits, VL.TUNING.dragonRounds, 'one metal hit a round, three rounds');
  const again = dragonRound(3);
  again.state.player.invuln = 0;
  again.state.hp = 1;
  VL.faint(again.state, 'dragon');
  VL.respawn(again.state);
  VL.place(again.state, { area: 'lair', screen: '0,-3', tx: 7, ty: 8, facing: 'up' });
  const fresh = again.state.room.entities.find((e) => e.type === 'dragon');
  assert.deepEqual([VL.dragonRound(fresh), fresh.mode, fresh.life], [1, 'prowl', VL.TUNING.dragonRoundLife]);
});

test('the purple fire and the fan\'s glow are drawn in their own colours, none a saturated red', () => {
  const { VL } = loadGame();
  for (const name of ['wildFireCore', 'wildFireMid', 'wildFireEdge']) {
    const hex = VL.ART.color(name);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    assert.ok(r / (r + g + b) < 0.8, `${name} ${hex}`);
  }
  assert.ok(VL.ART.SPRITES['fx-fire-wild-0'] && VL.ART.SPRITES['fx-fire-wild-1']);
});

// ---------- the boss doors check what the fight wants on every entry ----------

// In the room below a boss door, at its foot, with the boss key, a sword and
// `shells` broken shells; no other enemies about.
function atBossDoor(area, { shells = 0, sword = 'woodSword', opened = false, beaten = false } = {}) {
  const { VL } = loadGame();
  const state = VL.createGame();
  state.items[sword] = true;
  state.items.slingshot = true;
  state.items.mirrorShield = true;
  state.hands = { mainHand: sword, offHand: 'slingshot' };
  state.inventory.brokenShells = shells;
  const d = VL.dungeonState(state, area);
  d.bossKey = true;
  if (opened) d.doors[area === 'lighthouse' ? 'd3BossDoor' : 'd4BossDoor'] = true;
  d.boss = beaten;
  VL.place(state, { area, screen: '0,-2', tx: 7, ty: 1, facing: 'up' });
  state.room.entities = state.room.entities.filter((e) => !VL.isEnemy(e));
  state.popups.queue.length = 0;
  const door = () => state.room.entities.find((e) => e.type === 'lockedDoor' && e.kind === 'boss');
  const tryDoor = () => hold(VL, state, ['up'], 1);
  return { VL, state, d, door, tryDoor };
}

test('the Lighthouse boss door wants enough broken shells for the fight, from the tuning, with margin over a perfect fight', () => {
  const { VL } = loadGame();
  const least = VL.TUNING.lensCrabShellsAtDoor;
  assert.equal(least, 12);
  assert.ok(least >= 2 * VL.TUNING.lensCrabRounds, 'two eyes a round, every round');
  const door = VL.getScreen('lighthouse', '0,-2').entities.find((e) => e.id === 'd3BossDoor');
  assert.deepEqual(plain(door.wants.has), { brokenShells: least });
  assert.ok(VL.LOCKS.d3BossDoor.needs.includes('brokenShells'), 'the table knows');
  assert.equal(VL.RESOURCE_CAPS?.brokenShells, undefined, 'no cap, so the count is always reachable');
  const note = VL.LIGHTHOUSE_SHELL_WORDS;
  assert.match(note, /12 broken shells/);
  assert.deepEqual(plain(VL.ART.missingGlyphs(note, 'small')), []);
  assert.ok(VL.ART.measureText(note, 'small') <= VL.TUNING.width - 8, 'fits on one line');
  assert.deepEqual([...VL.dungeonProblems()], []);
  VL.LOCKS.d3BossDoor.needs = VL.LOCKS.d3BossDoor.needs.filter((need) => need !== 'brokenShells');
  assert.ok(VL.dungeonProblems().some((p) => p.includes('d3BossDoor wants brokenShells')), 'the lint sees a lock that forgot the shells');
});

test('with one shell too few the Lighthouse boss door stays shut and asks for shells; with enough he walks in', () => {
  const few = atBossDoor('lighthouse', { shells: VL_LEAST() - 1 });
  few.tryDoor();
  assert.equal(few.state.player.screen, '0,-2', 'not in');
  assert.ok(!few.d.doors.d3BossDoor);
  assert.equal(few.state.dungeonNote?.text, few.VL.LIGHTHOUSE_SHELL_WORDS);
  const enough = atBossDoor('lighthouse', { shells: VL_LEAST() });
  enough.tryDoor();
  assert.ok(enough.d.doors.d3BossDoor);
  enough.tryDoor();
  assert.equal(enough.state.player.screen, '0,-3', 'in with the Lens Crab');
});

test('a sword still comes first: no sword and no shells says the sword words', () => {
  const t = atBossDoor('lighthouse', { shells: 0, sword: 'slingshot' });
  delete t.state.items.woodSword;
  t.state.hands = { mainHand: 'slingshot', offHand: null };
  t.tryDoor();
  assert.equal(t.state.dungeonNote?.text, t.VL.LIGHTHOUSE_SWORD_WORDS);
});

test('opened before, the crab unbeaten, too few shells now (he fainted inside and came back short): shut again, and no way round it for the planner', () => {
  const t = atBossDoor('lighthouse', { shells: VL_LEAST() - 1, opened: true });
  assert.ok(t.door().solid && !t.door().open, 'shut on entry');
  const { isWalkable } = require('./playthrough');
  assert.equal(isWalkable(t.VL, 'lighthouse', '0,-2', 7, 0, t.state), false);
  t.tryDoor();
  assert.equal(t.state.player.screen, '0,-2');
  assert.equal(t.state.dungeonNote?.text, t.VL.LIGHTHOUSE_SHELL_WORDS);
  assert.ok(t.d.doors.d3BossDoor, 'the saved door is kept: only the visit shuts it');
  t.state.inventory.brokenShells = VL_LEAST();
  t.tryDoor();
  assert.equal(t.state.player.screen, '0,-3', 'enough again: in');
});

test('shells spent in the room below an open boss door shut it again (never on him); the crab beaten, it is open with none', () => {
  const t = atBossDoor('lighthouse', { shells: VL_LEAST(), opened: true });
  Object.assign(t.state.player, t.VL.tileCenter(7, 4));
  hold(t.VL, t.state, [], 0.1);
  assert.ok(t.door().open);
  t.state.inventory.brokenShells -= 1;
  hold(t.VL, t.state, [], 0.1);
  assert.ok(t.door().solid && !t.door().open, 'shut once he is short');
  const beaten = atBossDoor('lighthouse', { shells: 0, opened: true, beaten: true });
  assert.ok(beaten.door().open && !beaten.door().solid);
  beaten.tryDoor();
  assert.equal(beaten.state.player.screen, '0,-3');
});

test('once inside the lamp room nothing changes: the shells he spends there shut nothing on him', () => {
  const t = atBossDoor('lighthouse', { shells: VL_LEAST() });
  t.tryDoor();
  t.tryDoor();
  assert.equal(t.state.player.screen, '0,-3');
  t.state.inventory.brokenShells = 0;
  hold(t.VL, t.state, [], 0.5);
  assert.equal(t.state.player.screen, '0,-3');
  assert.ok(!t.state.room.entities.some((e) => e.type === 'lockedDoor'), 'no door in the boss room to shut');
});

test('the Lair door, opened before with the metal sword, the Dragon unbeaten, only a wood sword now: shut, with the sword words', () => {
  const t = atBossDoor('lair', { sword: 'woodSword', opened: true });
  assert.ok(t.door().solid && !t.door().open);
  t.tryDoor();
  assert.equal(t.state.player.screen, '0,-2');
  assert.equal(t.state.dungeonNote?.text, t.VL.LAIR_SWORD_WORDS);
  const metal = atBossDoor('lair', { sword: 'metalSword', opened: true });
  metal.tryDoor();
  assert.equal(metal.state.player.screen, '0,-3');
});

test('an old save (the W19 fixture) with the Lair door already open, the Dragon unbeaten and only wood: stopped at the door, not shut in', () => {
  const { VL } = loadGame();
  const save = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v1-W19.json'), 'utf8'));
  save.dungeons.lair.boss = false;
  assert.ok(save.dungeons.lair.doors.d4BossDoor, 'the fixture opened it long ago');
  const storage = VL.createStorage(memoryStorage({ [VL.slotKey(0)]: JSON.stringify(save) }));
  const state = VL.loadSlot(storage, 0);
  assert.deepEqual([VL.hasItem(state, 'woodSword'), VL.hasItem(state, 'metalSword')], [true, false]);
  VL.place(state, { area: 'lair', screen: '0,-2', tx: 7, ty: 1, facing: 'up' });
  state.room.entities = state.room.entities.filter((e) => !VL.isEnemy(e));
  state.popups.queue.length = 0;
  hold(VL, state, ['up'], 1);
  assert.equal(state.player.screen, '0,-2');
  assert.equal(state.dungeonNote?.text, VL.LAIR_SWORD_WORDS);
});

function VL_LEAST() {
  return loadGame().VL.TUNING.lensCrabShellsAtDoor;
}
