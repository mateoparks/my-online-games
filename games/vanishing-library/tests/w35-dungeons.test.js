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
