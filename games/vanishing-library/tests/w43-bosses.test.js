// W43 (Matthew's sixth playtest): the Dragon has twice the life, and the four
// dungeon bosses show a life meter while they are fought.
const assert = require('node:assert/strict');
const { test, loadGame, playState, hold } = require('./harness');

const BOSSES = {
  scriptorium: { type: 'bookworm', name: 'BOOKWORM' },
  hollowOak: { type: 'thornback', name: 'THORNBACK' },
  lighthouse: { type: 'lensCrab', name: 'LENS CRAB' },
  lair: { type: 'dragon', name: 'DRAGON' },
};

function inBossRoom(id, VL = loadGame().VL) {
  const dungeon = VL.DUNGEONS[id];
  const state = playState(VL, { area: dungeon.area, screen: dungeon.boss.screen, tx: 7, ty: 8, facing: 'up' });
  Object.assign(state.flags, { shockwave: true, shockwaveDue: true, shockwaveWoke: true, 'gave:helperWood': true });
  Object.assign(state.items, { woodSword: true, metalSword: true, mirrorShield: true });
  state.hands = { mainHand: 'metalSword', offHand: 'mirrorShield' };
  state.popups.queue.length = 0;
  const boss = state.room.entities.find((e) => e.type === dungeon.boss.type);
  boss.arriving = 0;
  return { VL, state, boss };
}

// A context that keeps every filled rectangle, in the coordinates drawn.
function recordingContext() {
  const rects = [];
  let dx = 0;
  let dy = 0;
  const stack = [];
  return new Proxy({}, {
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
}
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const meterLayer = (VL) => VL.HERO_LAYERS.find((layer) => layer.id === 'bossMeter');
function drawMeter(VL, state, t = 0) {
  const ctx = recordingContext();
  meterLayer(VL).draw(ctx, state, 0, 0, t, 'overlay');
  return ctx.rects;
}

// ---------- 1. the Dragon: twice the life ----------

// Dazes it with its own fire and strikes once with the metal sword; steps the
// world until it is up again (or dying). Returns the round the hit landed in.
function bounceAndStrike(VL, state, dragon) {
  const round = VL.dragonRound(dragon);
  VL.ENEMIES.dragon.onFire(state, dragon, { owner: dragon });
  assert.equal(dragon.mode, 'dazed');
  VL.hitEnemy(state, dragon, VL.TUNING.swordDamage.metalSword, VL.heroCentre(state), 'metalSword');
  for (let t = 0; t < 3 && !['perch', 'prowl', 'dying'].includes(dragon.mode); t += 1 / 60) VL.updateWorld(state, VL.actions({}), 1 / 60);
  return round;
}

test('the Dragon has twice its old life: six metal-sword hits (it was three), two in each of its three rounds', () => {
  const { VL, state, boss: dragon } = inBossRoom('lair');
  state.player.invuln = 999;
  assert.equal(VL.TUNING.dragonRounds, 3, 'still three rounds');
  assert.equal(VL.TUNING.dragonRoundLife * VL.TUNING.dragonRounds, 2 * (2 * 3), 'double W35\'s 3 rounds x 2 life');
  const rounds = [];
  for (let i = 0; i < 20 && dragon.mode !== 'dying'; i += 1) rounds.push(bounceAndStrike(VL, state, dragon));
  assert.equal(dragon.mode, 'dying');
  assert.deepEqual(rounds, [1, 1, 2, 2, 3, 3]);
});

test('a hit that does not end its round wakes the Dragon: each hit needs its own fire bounced home', () => {
  const { VL, state, boss: dragon } = inBossRoom('lair');
  state.player.invuln = 999;
  VL.ENEMIES.dragon.onFire(state, dragon, { owner: dragon });
  VL.hitEnemy(state, dragon, VL.TUNING.swordDamage.metalSword, VL.heroCentre(state), 'metalSword');
  assert.equal(dragon.life, VL.TUNING.dragonRoundLife - VL.TUNING.swordDamage.metalSword, 'the hit counts');
  assert.equal(dragon.tint > 0, true, 'and tints it');
  assert.equal(dragon.mode, 'recover', 'it shakes itself awake');
  assert.equal(VL.dragonRound(dragon), 1, 'still in round one');
  // A second swing while it is getting up only clinks.
  dragon.hurt = 0;
  VL.hitEnemy(state, dragon, VL.TUNING.swordDamage.metalSword, VL.heroCentre(state), 'metalSword');
  assert.equal(dragon.life, VL.TUNING.dragonRoundLife - VL.TUNING.swordDamage.metalSword);
  hold(VL, state, [], VL.TUNING.dragonRecoverSeconds + 0.1);
  assert.equal(dragon.mode, 'prowl', 'back to round one\'s pacing');
});

test('each round keeps its own attack after its first hit: round two still breathes pairs, round three the fan', () => {
  const { VL, state, boss: dragon } = inBossRoom('lair');
  state.player.invuln = 999;
  for (let i = 0; i < 3; i += 1) bounceAndStrike(VL, state, dragon);
  assert.equal(VL.dragonRound(dragon), 2);
  assert.equal(dragon.mode, 'perch', 'flies to its perches again after the round\'s first hit');
  for (let i = 0; i < 2; i += 1) bounceAndStrike(VL, state, dragon);
  assert.equal(VL.dragonRound(dragon), 3);
  const fan = [];
  for (let t = 0; t < 8 && fan.length < 3; t += 1 / 60) {
    VL.updateWorld(state, VL.actions({}), 1 / 60);
    for (const ball of state.room.entities.filter((e) => e.type === 'dragonFire' && !fan.includes(e))) fan.push(ball);
  }
  assert.deepEqual(fan.map((b) => Boolean(b.wild)), [false, true, true]);
});

// ---------- 2. a life meter for the four bosses ----------

test('every dungeon boss has a life meter with a name the small font can draw; the marionettes have none', () => {
  const { VL } = loadGame();
  const bosses = [...Object.values(VL.DUNGEONS).filter((d) => d.boss).map((d) => d.boss.type)].sort();
  assert.deepEqual([...Object.keys(VL.BOSS_METERS)].sort(), bosses);
  assert.deepEqual(bosses, Object.values(BOSSES).map((b) => b.type).sort());
  for (const { type, name } of Object.values(BOSSES)) {
    assert.equal(VL.BOSS_METERS[type].name, name);
    assert.deepEqual([...VL.ART.missingGlyphs(name, 'small')], []);
  }
  assert.equal(VL.BOSS_METERS.marionette, undefined);
});

for (const [id, { type, name }] of Object.entries(BOSSES)) {
  test(`${id}: the meter shows from the start of the fight, full, and is gone once the ${type} is beaten`, () => {
    const { VL, state, boss } = inBossRoom(id);
    const meter = VL.bossMeter(state);
    assert.ok(meter, 'shown as the fight starts');
    assert.equal(meter.name, name);
    assert.equal(meter.left, meter.total);
    assert.ok(meter.total > 0);
    assert.ok(drawMeter(VL, state).length > 0, 'drawn');
    boss.defeated = true;
    state.room.entities = state.room.entities.filter((e) => e !== boss);
    hold(VL, state, [], 1 / 60);
    assert.equal(VL.bossBeaten(state, id), true);
    assert.equal(VL.bossMeter(state), null);
    assert.deepEqual(drawMeter(VL, state), []);
    // Back in the room after the win: still none.
    VL.place(state, { area: VL.DUNGEONS[id].area, screen: VL.DUNGEONS[id].boss.screen, tx: 7, ty: 8, facing: 'up' });
    assert.equal(VL.bossMeter(state), null);
  });
}

test('the meter drains with every hit that counts, and not for one that only clinks', () => {
  const { VL } = loadGame();
  {
    const { state, boss: worm } = inBossRoom('scriptorium', VL);
    const full = VL.bossMeter(state);
    worm.hits = 1;
    assert.deepEqual([VL.bossMeter(state).left, VL.bossMeter(state).total], [full.total - 1, full.total]);
  }
  for (const id of ['hollowOak', 'lighthouse', 'lair']) {
    const { state, boss } = inBossRoom(id, VL);
    const full = VL.bossMeter(state);
    boss.life -= 1;
    assert.equal(VL.bossMeter(state).left, full.total - 1, `${id}: a round's life`);
    boss.rounds -= 1;
    boss.life = VL.TUNING[{ hollowOak: 'thornbackRoundLife', lighthouse: 'lensCrabRoundLife', lair: 'dragonRoundLife' }[id]];
    assert.equal(VL.bossMeter(state).left, full.total - boss.life, `${id}: a round done`);
  }
  // The real thing: the Dragon struck while dazed, then a clink while it is up.
  const { state, boss: dragon } = inBossRoom('lair', VL);
  const before = VL.bossMeter(state).left;
  VL.hitEnemy(state, dragon, VL.TUNING.swordDamage.metalSword, VL.heroCentre(state), 'metalSword');
  assert.equal(VL.bossMeter(state).left, before, 'a clink takes nothing');
  VL.ENEMIES.dragon.onFire(state, dragon, { owner: dragon });
  VL.hitEnemy(state, dragon, VL.TUNING.swordDamage.metalSword, VL.heroCentre(state), 'metalSword');
  assert.equal(VL.bossMeter(state).left, before - VL.TUNING.swordDamage.metalSword);
  assert.equal(VL.bossMeter(state).total, VL.TUNING.dragonRoundLife * VL.TUNING.dragonRounds);
});

test('the meter reads empty while the boss goes up in smoke (it never goes below zero)', () => {
  const { VL, state, boss: dragon } = inBossRoom('lair');
  state.player.invuln = 999;
  for (let i = 0; i < 20 && dragon.mode !== 'dying'; i += 1) bounceAndStrike(VL, state, dragon);
  assert.equal(VL.bossMeter(state).left, 0);
  const { state: oak, boss: beetle } = inBossRoom('hollowOak', VL);
  Object.assign(beetle, { rounds: 0, life: -1, mode: 'dying' });
  assert.equal(VL.bossMeter(oak).left, 0);
});

test('the drawn bar is as long as the life left, and lost life drains away smoothly, never blinking', () => {
  const { VL, state, boss: dragon } = inBossRoom('lair');
  const box = VL.BOSS_METER;
  const fill = (rects) => rects.filter((r) => r.color === 'heart');
  // Colour each rect by what VL.ART.rect was asked for.
  const colored = (t) => {
    const rects = [];
    const rect = VL.ART.rect;
    VL.ART.rect = (ctx, color, x, y, w, h) => { rects.push({ color, x, y, w, h }); return rect(ctx, color, x, y, w, h); };
    try { meterLayer(VL).draw(recordingContext(), state, 0, 0, t, 'overlay'); } finally { VL.ART.rect = rect; }
    return rects;
  };
  const full = fill(colored(0));
  assert.equal(full.length, 1);
  const barW = full[0].w;
  dragon.life -= VL.TUNING.swordDamage.metalSword;
  const ghost = (rects) => rects.filter((r) => r.color === 'heartLight' && r.h > 1);
  const right = fill(colored(0.02));
  assert.equal(right[0].w, Math.round((barW * (VL.bossMeter(state).left)) / VL.bossMeter(state).total));
  assert.ok(ghost(colored(0.04)).length === 1, 'the lost part is still showing, lighter');
  const widths = [];
  for (let t = 0.05; t < 1.2; t += 1 / 60) widths.push(ghost(colored(t)).reduce((sum, r) => sum + r.w, 0));
  for (let i = 1; i < widths.length; i += 1) assert.ok(widths[i] <= widths[i - 1], 'the light part only ever shrinks');
  assert.equal(widths[widths.length - 1], 0, 'and is gone');
  // Steady: the same state draws the same pixels at any time.
  const a = JSON.stringify(colored(5));
  for (const t of [5.1, 5.27, 6, 9.5]) assert.equal(JSON.stringify(colored(t)), a);
  for (const r of colored(9)) assert.ok(r.x >= box.x && r.y >= box.y && r.x + r.w <= box.x + box.w && r.y + r.h <= box.y + box.h, `inside VL.BOSS_METER: ${JSON.stringify(r)}`);
});

// ---------- 3. where it sits ----------

// The meter sits at the bottom, in the wall row (no boss, hero or exit there):
// left of the boss gate, clear of the keys readout and the HUD bar.
test('the meter sits in the bottom wall row of every boss room, clear of the gate, the keys and the HUD', () => {
  const { VL } = loadGame();
  const { tile, rows, width } = VL.TUNING;
  const box = VL.BOSS_METER;
  assert.ok(box.x >= 0 && box.x + box.w <= width && box.y >= (rows - 1) * tile && box.y + box.h <= rows * tile, JSON.stringify(box));
  assert.equal(meets(box, VL.DUNGEON_HUD), false);
  for (const id of Object.keys(BOSSES)) {
    const { state } = inBossRoom(id, VL);
    const { area, boss } = VL.DUNGEONS[id];
    for (let tx = Math.floor(box.x / tile); tx * tile < box.x + box.w; tx += 1) {
      const info = VL.tileInfo(area, VL.tileAt(area, boss.screen, tx, rows - 1, state.room));
      assert.ok(info.wall && info.solid, `${id}: a plain wall under the meter at ${tx}`);
    }
    for (const e of state.room.entities.filter((x) => !VL.isEnemy(x))) {
      const ctx = recordingContext();
      VL.ENTITIES[e.type]?.draw?.(ctx, e, e.x * tile, e.y * tile, 0);
      assert.deepEqual(ctx.rects.filter((r) => r.w > 0 && r.h > 0 && meets(r, box)), [], `${id}: ${e.type} (${e.x},${e.y}) under the meter`);
    }
  }
});

test('no boss, in any of its moves, is ever drawn under the meter, even pressed against the bottom wall', () => {
  const { VL } = loadGame();
  const { tile, rows } = VL.TUNING;
  const box = VL.BOSS_METER;
  const MODES = ['walk', 'aim', 'charge', 'bonk', 'flipped', 'righting', 'dying', 'under', 'rumble', 'up', 'hurt', 'down', 'scuttle', 'glint', 'dazed', 'recover', 'prowl', 'perch', 'inhale', 'volley'];
  const under = [];
  for (const id of Object.keys(BOSSES)) {
    const { state, boss } = inBossRoom(id, VL);
    const def = VL.ENEMIES[boss.type];
    const lowest = rows * tile - tile - def.body.h / 2;
    for (let cx = box.x; cx <= box.x + box.w + 16; cx += 4) {
      for (const mode of MODES) {
        for (const t of [0, 0.2, 0.45, 0.8, 1.3]) {
          // Walkers can reach the bottom wall; the Dragon keeps to its row, the Bookworm to its holes.
          const cy = boss.type === 'dragon' ? boss.cy : boss.type === 'bookworm' ? Math.max(...boss.holes.map((h) => h.y)) : lowest;
          const e = { ...boss, mode, timer: 0.5, cx, cy, at: { x: cx, y: cy }, tint: 0.2, shake: 0, step: t };
          e.x = (cx - 8) / tile;
          e.y = (cy - 8) / tile;
          const ctx = recordingContext();
          VL.ENTITIES[boss.type].draw(ctx, e, e.x * tile, e.y * tile, t);
          if (ctx.rects.some((r) => r.w > 0 && r.h > 0 && meets(r, box))) under.push(`${boss.type} ${mode} at ${cx},${cy}`);
        }
      }
    }
    void state;
  }
  assert.deepEqual([...new Set(under)], []);
});

test('the hero at the very bottom of a boss room is drawn clear of the meter', () => {
  const { VL } = loadGame();
  const box = VL.BOSS_METER;
  const { state } = inBossRoom('lair', VL);
  for (const tx of [1, 3, 5, 6]) {
    Object.assign(state.player, VL.tileCenter(tx, 9));
    hold(VL, state, ['down'], 0.6);
    const ctx = recordingContext();
    VL.ART.drawHero(ctx, state.player, Math.round(state.player.x), Math.round(state.player.y), 0, state.look);
    assert.deepEqual(ctx.rects.filter((r) => r.w > 0 && r.h > 0 && meets(r, box)), [], `hero at ${state.player.x},${state.player.y}`);
  }
});

test('the meter hides while a popup is up (so no box ever half-covers it) and during a screen slide', () => {
  const { VL, state } = inBossRoom('lair');
  assert.ok(drawMeter(VL, state).length > 0);
  VL.showMessage(state, { text: 'Hello' });
  assert.deepEqual(drawMeter(VL, state), []);
  state.message = null;
  state.transition = { t: 0, duration: 1, dir: 'up', from: { area: 'lair', screen: '0,-2' } };
  assert.deepEqual(drawMeter(VL, state), []);
  state.transition = null;
  assert.ok(drawMeter(VL, state).length > 0);
});

test('outside a boss room there is no meter, and none in the marionettes\' hall', () => {
  const { VL } = loadGame();
  const field = playState(VL, { area: 'overworld', screen: '0,0', tx: 7, ty: 5, facing: 'up' });
  assert.equal(VL.bossMeter(field), null);
  const lairHall = playState(VL, { area: 'lair', screen: '0,0', tx: 7, ty: 5, facing: 'up' });
  assert.equal(VL.bossMeter(lairHall), null);
  const hall = playState(VL, { area: VL.FINALE.area, screen: VL.FINALE.hall, tx: 7, ty: 9, facing: 'up' });
  assert.equal(VL.bossMeter(hall), null);
  assert.deepEqual(drawMeter(VL, hall), []);
});
