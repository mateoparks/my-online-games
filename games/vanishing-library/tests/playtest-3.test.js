// W30, Matthew's third playtest notes: a word when a wood sword does nothing
// to a tough enemy, the Hollow Oak's grass room and metal-only enemies, the
// boss gate in every dungeon, and the library's rewards at 10, 20 and 30 books.
const assert = require('node:assert/strict');
const { test, loadGame, playState, hold } = require('./harness');

const ow = (screen, tx, ty, facing = 'up') => ({ area: 'overworld', screen, tx, ty, facing });

// ---------- note 1: the wood sword's word ----------

function clearing(sword) {
  const { VL } = loadGame();
  const state = playState(VL, ow('7,-2', 4, 6, 'down'));
  VL.giveItem(state, sword);
  state.popups.queue.length = 0;
  hold(VL, state, [], 1);
  const plant = state.room.entities.find((e) => e.type === 'spitter' && e.x === 4 && e.y === 7);
  return { VL, state, plant };
}

const swing = (VL, state) => {
  VL.updateWorld(state, VL.actions({ pressed: ['mainHand'] }), 1 / 60);
  hold(VL, state, [], 0.5);
};

test('a wood sword on a tough spitter says it does nothing, and hints at something stronger', () => {
  const { VL, state, plant } = clearing('woodSword');
  assert.equal(state.message, null);
  swing(VL, state);
  assert.ok(state.room.entities.includes(plant), 'still there');
  const shown = VL.currentPopup(state);
  assert.ok(shown, 'a message pops up');
  assert.equal(shown.text, 'Hmm, this wood sword seems to do nothing to them. Perhaps you need something a bit stronger.');
  assert.equal(VL.ART.popupLayout({ title: shown.title, text: shown.text }).overflow, false, 'it fits the popup');
  assert.deepEqual([...VL.ART.missingGlyphs(`${shown.title}${shown.text}`, 'normal')], []);
});

test('the word comes once per visit, not on every clink', () => {
  const { VL, state } = clearing('woodSword');
  swing(VL, state);
  assert.ok(state.message);
  state.message = null;
  for (let i = 0; i < 4; i += 1) swing(VL, state);
  assert.equal(state.message, null, 'no second message this visit');
  VL.place(state, ow('7,-2', 4, 6, 'down'));
  state.popups.queue.length = 0;
  hold(VL, state, [], 1);
  swing(VL, state);
  assert.ok(state.message, 'a new visit says it again');
});

test('a metal sword, a thrown rock or an ordinary enemy never brings the word', () => {
  {
    const { VL, state } = clearing('metalSword');
    swing(VL, state);
    assert.equal(state.message, null, 'the metal sword works, nothing to say');
  }
  {
    const { VL, state, plant } = clearing('woodSword');
    VL.hitEnemy(state, plant, 1, { x: 0, y: 0 }, undefined);
    VL.hitEnemy(state, plant, 1, { x: 0, y: 0 }, 'throw');
    assert.equal(state.message, null, 'a throw only clinks');
  }
  {
    const { VL } = loadGame();
    const state = playState(VL, ow('3,0', 7, 5));
    VL.giveItem(state, 'woodSword');
    state.popups.queue.length = 0;
    const slime = VL.spawnEnemy(state, 'slime', 7, 6);
    VL.hitEnemy(state, slime, 1, { x: 0, y: 0 }, 'woodSword');
    assert.equal(state.message, null);
  }
});

// ---------- note 3: the boss gate, in every dungeon ----------

const BOSS_ROOMS = {
  scriptorium: { screen: '1,-2', gate: [7, 10], boss: 'bookworm', heart: 'heartD1', inside: [7, 8] },
  hollowOak: { screen: '0,-3', gate: [7, 10], boss: 'thornback', heart: 'heartD2', inside: [7, 8] },
};

// A game standing just inside a dungeon's boss room, the boss door open.
function inBossRoom(id, { VL = loadGame().VL } = {}) {
  const room = BOSS_ROOMS[id];
  const state = playState(VL, { area: VL.DUNGEONS[id].area, screen: room.screen, tx: room.gate[0], ty: room.gate[1], facing: 'up' });
  for (const door of Object.values(VL.AREAS[VL.DUNGEONS[id].area].screens).flatMap((s) => s.entities)) {
    if (door.type === 'lockedDoor' && door.kind === 'boss') VL.dungeonState(state, id).doors[door.id] = true;
  }
  state.flags.shockwaveDue = true;
  state.flags.shockwave = true;
  state.flags.shockwaveWoke = true;
  state.popups.queue.length = 0;
  return { VL, state, room };
}
const gateOf = (state, id) => state.room.entities.find((e) => e.type === 'shutter' && e.bossGate);
const warpOf = (state) => state.room.entities.find((e) => e.type === 'warp');
const heroAt = (VL, state) => [VL.heroTile(state).tx, VL.heroTile(state).ty];

test('every dungeon gets its boss gate from the framework: bars on the tile the boss door lands the hero on', () => {
  const VL = loadGame().VL;
  for (const [id, room] of Object.entries(BOSS_ROOMS)) {
    const screen = VL.getScreen(VL.DUNGEONS[id].area, room.screen);
    const gates = screen.entities.filter((e) => e.type === 'shutter' && e.bossGate);
    assert.equal(gates.length, 1, `${id}: one gate`);
    assert.deepEqual([gates[0].x, gates[0].y], room.gate, `${id}: on the doorway`);
    assert.deepEqual(JSON.parse(JSON.stringify(gates[0].open)), { bossDone: true });
    assert.ok(!screen.entities.some((e) => e.type === 'shutter' && e.open.bossBeaten), `${id}: no hand-made bars left`);
  }
  assert.deepEqual([...VL.dungeonProblems()], []);
});

for (const id of Object.keys(BOSS_ROOMS)) {
  test(`${id}: stepping in shuts the gate; it stays shut with no way out until the boss is beaten and its heart taken, then the warp appears and the gate opens`, () => {
    const { VL, state, room } = inBossRoom(id);
    hold(VL, state, ['up'], 0.6);
    hold(VL, state, [], 0.1);
    const gate = gateOf(state, id);
    assert.ok(gate.closed && gate.solid, 'shut behind him');
    assert.equal(warpOf(state), undefined, 'no way out while the boss lives');
    hold(VL, state, ['down'], 1.5);
    assert.equal(state.player.screen, room.screen, 'the gate holds');
    state.room.entities = state.room.entities.filter((e) => !VL.isEnemy(e));
    VL.bossDefeated(state, id);
    hold(VL, state, [], 0.1);
    assert.ok(VL.bossBeaten(state, id));
    assert.ok(gateOf(state, id).solid, 'still shut with the heart on the floor');
    assert.equal(warpOf(state), undefined, 'and still no warp');
    assert.equal(VL.dungeonCondition(state, { bossDone: true }), false);
    const heart = state.room.entities.find((e) => e.type === 'heartContainer');
    VL.ENTITIES.heartContainer.onStand(state, heart);
    state.holdUp = null;
    hold(VL, state, [], 0.1);
    assert.ok(VL.spotFound(state, room.heart));
    assert.ok(warpOf(state), 'the warp appears once the heart is taken');
    assert.ok(!gateOf(state, id).closed && !gateOf(state, id).solid, 'and the gate opens');
    assert.equal(VL.dungeonCondition(state, { bossDone: true }), true);
  });

  test(`${id}: fainting in the boss room wakes him at the dungeon's entrance statue with every door and key kept, and the gate lets him back in`, () => {
    const { VL, state } = inBossRoom(id);
    const d = VL.dungeonState(state, id);
    d.keysGiven = 1;
    hold(VL, state, ['up'], 0.6);
    hold(VL, state, [], 0.1);
    state.savePoint = null;
    // The statue sets the save point as he passes it on the way in.
    const statue = Object.entries(VL.AREAS[VL.DUNGEONS[id].area].screens).flatMap(([key, s]) => s.entities.filter((e) => e.type === 'saveStatue').map((e) => ({ key, ...e })))[0];
    state.savePoint = { area: VL.DUNGEONS[id].area, screen: statue.key, tx: statue.x, ty: statue.y, facing: 'down' };
    const doors = JSON.stringify(d.doors);
    VL.faint(state, 'shrub');
    VL.respawn(state);
    assert.deepEqual([state.player.area, state.player.screen, ...heroAt(VL, state)], [VL.DUNGEONS[id].area, statue.key, statue.x, statue.y]);
    assert.equal(JSON.stringify(d.doors), doors, 'doors stay open');
    assert.equal(VL.smallKeys(state, id), 1, 'keys kept');
    assert.equal(VL.bossBeaten(state, id), false);
    const gate = VL.getScreen(VL.DUNGEONS[id].area, BOSS_ROOMS[id].screen).entities.find((e) => e.bossGate);
    assert.ok(VL.ENTITIES.shutter.passable(state, gate, VL.DUNGEONS[id].area), 'the gate always lets him in (the pathfinder agrees)');
  });

  test(`${id}: a save from before the gate that beat the boss and took the heart finds the gate open and the warp waiting`, () => {
    const { VL, state, room } = inBossRoom(id);
    VL.dungeonState(state, id).boss = true;
    VL.markFound(state, room.heart);
    VL.place(state, { area: VL.DUNGEONS[id].area, screen: room.screen, tx: room.inside[0], ty: room.inside[1], facing: 'down' });
    hold(VL, state, [], 0.1);
    assert.ok(!gateOf(state, id).solid);
    assert.ok(warpOf(state));
  });
}

test('the Hollow Oak: the shockwave always follows the heart, since the gate keeps him in the den until he takes it', () => {
  const { VL } = loadGame();
  const state = playState(VL, { area: 'hollowOak', screen: '0,-3', tx: 7, ty: 10, facing: 'up' });
  VL.dungeonState(state, 'hollowOak').doors.d2BossDoor = true;
  state.popups.queue.length = 0;
  hold(VL, state, ['up'], 0.6);
  state.room.entities = state.room.entities.filter((e) => !VL.isEnemy(e));
  VL.bossDefeated(state, 'hollowOak');
  state.flags.shockwaveDue = true;
  hold(VL, state, ['down'], 2);
  assert.equal(state.player.screen, '0,-3', 'still in the den');
  assert.equal(state.sceneRequest, null, 'no knock-out with the heart on the floor');
});

test('the framework refuses a hand-made boss gate and needs a boss door (or boss.gate) to put its own on', () => {
  const { VL } = loadGame();
  const tiles = ['################', ...Array(9).fill('#______________#'), '#######_########'];
  VL.defineEnemy('w30Probe', { tuning: 'enemySlime', body: { w: 8, h: 8 }, size: 'small', think() {}, draw() {} });
  const entrance = { area: 'overworld', screen: '0,0', tx: 3, ty: 3, facing: 'down' };
  VL.defineArea('w30Old', { tileset: 'dungeon' });
  VL.addScreens('w30Old', { '0,0': { tiles, entities: [{ type: 'shutter', x: 7, y: 10, open: { bossBeaten: true } }, { type: 'w30Probe', x: 7, y: 4 }] } });
  assert.throws(() => VL.defineDungeon('w30Old', { area: 'w30Old', entrance, boss: { screen: '0,0', type: 'w30Probe', heart: 'h1', warp: { tx: 7, ty: 8 } } }), /boss gate is the framework's/);
  VL.defineArea('w30NoDoor', { tileset: 'dungeon' });
  VL.addScreens('w30NoDoor', { '0,0': { tiles, entities: [{ type: 'w30Probe', x: 7, y: 4 }] } });
  assert.throws(() => VL.defineDungeon('w30NoDoor', { area: 'w30NoDoor', entrance, boss: { screen: '0,0', type: 'w30Probe', heart: 'h2', warp: { tx: 7, ty: 8 } } }), /boss\.gate/);
  VL.defineArea('w30Gate', { tileset: 'dungeon' });
  VL.addScreens('w30Gate', { '0,0': { tiles, entities: [{ type: 'w30Probe', x: 7, y: 4 }] } });
  VL.defineDungeon('w30Gate', { area: 'w30Gate', entrance, boss: { screen: '0,0', type: 'w30Probe', heart: 'h3', warp: { tx: 7, ty: 8 }, gate: { tx: 7, ty: 10 } } });
  const gate = VL.getScreen('w30Gate', '0,0').entities.find((e) => e.bossGate);
  assert.deepEqual([gate.x, gate.y, gate.id], [7, 10, 'w30GateBossGate']);
});
