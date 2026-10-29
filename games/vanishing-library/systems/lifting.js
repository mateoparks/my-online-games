// The Lifting Gloves (design: The path through the game, 2): with them S
// lifts a pot, a rock or an east-road boulder overhead and S (or either
// hand key) throws it. A throw flies over pits, water and low furniture,
// throws a switch it hits, hurts an enemy it hits, and shatters. README "Lifting
// (W14)".
(() => {
  VL.tune({
    liftThrowTiles: 4,
    liftThrowSpeed: 150,
    liftThrowDamage: 2,
    liftRiseSeconds: 0.15,
    potRespawnSeconds: 3,
  });
  const T = VL.TUNING;
  const DIRS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
  const THROW_HEIGHT = 14;

  // ---------- art ----------

  VL.ART.addColors({
    potClay: '#c0703f',
    potClayDark: '#7f4226',
    potClayLight: '#e39a62',
    glove: '#c98a3c',
    gloveDark: '#8a5622',
    gloveLight: '#efc06e',
  });
  VL.ART.defineSprite('prop-pot', {
    colors: { d: 'potClayDark', c: 'potClay', l: 'potClayLight', k: 'doorway' },
    rows: [
      '..dddddd..',
      '.dkkkkkkd.',
      '..dccccd..',
      '.dcllcccd.',
      'dcllccccd.',
      'dcllcccccd',
      'dclcccccdd',
      'dcccccccdd',
      '.dcccccdd.',
      '..dddddd..',
    ],
  });
  VL.ART.defineSprite('item-lifting-gloves', {
    colors: { d: 'gloveDark', g: 'glove', l: 'gloveLight' },
    rows: [
      '.l.l.l..',
      'lglglg..',
      'gggggg.l',
      'ggggggll',
      'ggggggg.',
      'dggggg..',
      '.dddd...',
    ],
  });
  const LIFTED_SPRITE = { pot: 'prop-pot', rock: 'tile-rock', boulder: 'tile-boulder' };
  const SHARD_COLORS = { pot: ['potClay', 'potClayDark', 'potClayLight'], rock: ['rock', 'rockDark', 'rockLight'], boulder: ['rock', 'rockDark', 'rockShade'] };

  // ---------- sound ----------

  VL.defineSfx('liftHeave', [{ wave: 'triangle', freq: 180, to: 320, dur: 0.12, vol: 0.35 }], { gap: 0.1 });
  VL.defineSfx('potSmash', [
    { wave: 'noise', dur: 0.16, vol: 0.4, filter: { type: 'highpass', freq: 1800 } },
    { wave: 'triangle', freq: 1900, to: 1400, at: 0.02, dur: 0.08, vol: 0.2 },
  ], { gap: 0.06 });
  VL.defineSfx('rockCrunch', [{ wave: 'noise', dur: 0.22, vol: 0.45, filter: { type: 'lowpass', freq: 900, to: 250 } }], { gap: 0.06 });
  VL.SOUND.onEvent('lift', 'liftHeave');
  VL.SOUND.onEvent('liftThrow', 'swing');
  VL.SOUND.onEvent('shatter', (event) => (event.kind === 'pot' ? 'potSmash' : 'rockCrunch'));
  VL.SOUND.onEvent('liftSplash', 'dunk');

  // ---------- the gloves ----------

  VL.defineItem('liftingGloves', {
    name: 'Lifting Gloves',
    icon: 'lifting-gloves',
    worn: true,
    about: 'Always on. S lifts pots and rocks, and S again throws them.',
    popup: { title: 'You got the Lifting Gloves!', text: 'Face a pot or a rock and press S to lift it. Press S again to throw it!' },
  });

  // Worn, not held: owned without filling a hand (like the Swiftfoot Boots).
  VL.giveWornItem = function giveWornItem(state, id) {
    if (!VL.ITEMS[id]) throw new Error(`no item ${id}`);
    state.items[id] = true;
    if (VL.ITEMS[id].popup) VL.showPopup(state, id);
    state.events.push({ type: 'pickup', kind: 'item' });
    VL.earned(state);
  };

  // ---------- what can be lifted ----------

  // A lifted rock leaves the ground it stood on.
  const GROUND = { grass: '.', sand: 's', shallow: 'w', scree: ':', path: 'P', floor: '_' };
  VL.liftedGround = (info) => info.liftTo || GROUND[info.ground || 'grass'];

  const tileKind = (info) => (info.boulder ? 'boulder' : info.rock ? 'rock' : null);
  // Thrown things pass over these (pits, water, chasms, desks).
  const lowTile = (info) => Boolean(info.pit || info.water || info.flyOver || info.low);

  const TOO_HEAVY = {
    pot: 'This pot is far too heavy to lift with your bare hands.',
    rock: 'This rock is far too heavy to lift with your bare hands.',
    boulder: 'A huge boulder blocks the way. Nobody could lift that with bare hands.',
  };

  function hold(state, kind) {
    state.player.lifted = { kind, since: state.time, t: 0 };
    state.events.push({ type: 'lift', kind });
  }

  function liftEntity(state, entity) {
    const room = state.room;
    room.entities = room.entities.filter((e) => e !== entity);
    if (entity.respawn) (room.respawns || (room.respawns = [])).push({ entity: { ...entity }, at: state.time + T.potRespawnSeconds });
    hold(state, VL.ENTITIES[entity.type].liftable);
  }

  function liftTile(state, tx, ty, kind, info) {
    // A boulder stays lifted for good (the east road); a rock is back next visit.
    if (kind === 'boulder') VL.saveTile(state, tx, ty, VL.liftedGround(info));
    else VL.setRoomTile(state, tx, ty, VL.liftedGround(info));
    for (const e of state.room.entities) if (e.x === tx && e.y === ty) e.uncovered = true;
    hold(state, kind);
  }

  // S facing something liftable: tile by tile, like VL.interact. Anything
  // else S could mean (a chest, a person, berries, a bush) is left to it.
  // Returns true when the press was used.
  VL.tryLift = function tryLift(state) {
    const room = state.room;
    const gloves = VL.hasItem(state, 'liftingGloves');
    const tiles = VL.facingTiles(state);
    for (let i = 0; i < tiles.length; i += 1) {
      const { tx, ty } = tiles[i];
      const entity = room.entities.find((e) => e.x === tx && e.y === ty && (VL.ENTITIES[e.type]?.liftable || VL.takesS(state, e)));
      if (entity) {
        const kind = VL.ENTITIES[entity.type].liftable;
        if (!kind) return false;
        if (gloves) liftEntity(state, entity);
        else if (i === 0) VL.showMessage(state, { text: TOO_HEAVY[kind] });
        else return false;
        return true;
      }
      const info = VL.tileInfo(room.area, VL.tileAt(room.area, room.screen, tx, ty, room));
      const kind = tileKind(info);
      if (kind) {
        if (gloves) liftTile(state, tx, ty, kind, info);
        else if (i === 0) VL.showMessage(state, { text: TOO_HEAVY[kind] });
        else return false;
        return true;
      }
      if (info.berry || info.cuttable) return false;
    }
    return false;
  };

  // ---------- throwing ----------

  function throwLifted(state) {
    const player = state.player;
    const [dx, dy] = DIRS[player.facing] || DIRS.down;
    const { kind } = player.lifted;
    player.lifted = null;
    const thrown = { type: 'liftThrown', kind, gx: player.x, gy: player.y - 4, z: THROW_HEIGHT, dx, dy, travelled: 0, total: T.liftThrowTiles * T.tile };
    sync(thrown);
    state.room.entities.push(thrown);
    state.events.push({ type: 'liftThrow', kind });
  }

  const sync = (e) => {
    const { tx, ty } = VL.tileOf(e.gx, e.gy);
    e.x = VL.clamp(tx, 0, T.cols - 1);
    e.y = VL.clamp(ty, 0, T.rows - 1);
  };

  function shatter(state, thrown, fx = 'shards') {
    const room = state.room;
    room.entities = room.entities.filter((e) => e !== thrown);
    const piece = { type: 'liftShards', kind: thrown.kind, fx, gx: thrown.gx, gy: thrown.gy, t: 0, dur: 0.45 };
    sync(piece);
    room.entities.push(piece);
    state.events.push({ type: fx === 'splash' ? 'liftSplash' : 'shatter', kind: thrown.kind });
  }

  const enemyBox = (e) => {
    const body = VL.ENEMIES[e.type].body;
    return { x: e.cx - body.w / 2, y: e.cy - body.h / 2 - (e.alt || 0), w: body.w, h: body.h + (e.alt || 0) };
  };

  // What a throw runs into at (gx, gy): a solid thing on that tile (a switch
  // is thrown, a block, a chest, bars), a wall it can't pass over, an
  // enemy (hurt), or the edge of the screen.
  function strike(state, thrown) {
    const room = state.room;
    const { gx, gy } = thrown;
    if (gx < 0 || gy < 0 || gx >= T.width || gy >= T.rows * T.tile) return 'edge';
    for (const e of room.entities) {
      if (!VL.isEnemy(e) || e.hp <= 0) continue;
      const box = enemyBox(e);
      if (gx + 4 > box.x && gx - 4 < box.x + box.w && gy + 4 > box.y && gy - 4 < box.y + box.h) {
        e.struckBy = 'throw';
        VL.hitEnemy(state, e, T.liftThrowDamage, { x: gx - thrown.dx * 8, y: gy - thrown.dy * 8 });
        e.struckBy = null;
        return 'enemy';
      }
    }
    const { tx, ty } = VL.tileOf(gx, gy);
    const thing = room.entities.find((e) => e.x === tx && e.y === ty && e !== thrown && (e.solid || VL.ENTITIES[e.type]?.solid));
    if (thing) {
      if (thing.type === 'switch' && VL.dungeonOf(state)) VL.throwSwitch(state, thing);
      return 'thing';
    }
    const info = VL.tileInfo(room.area, VL.tileAt(room.area, room.screen, tx, ty, room));
    return info.solid && !lowTile(info) ? 'wall' : null;
  }

  function updateThrown(state, thrown, dt) {
    let left = T.liftThrowSpeed * dt;
    while (left > 0) {
      const step = Math.min(2, left, thrown.total - thrown.travelled);
      left -= step;
      const before = { gx: thrown.gx, gy: thrown.gy };
      thrown.gx += thrown.dx * step;
      thrown.gy += thrown.dy * step;
      thrown.travelled += step;
      const hit = strike(state, thrown);
      if (hit) {
        if (hit !== 'enemy') Object.assign(thrown, before);
        sync(thrown);
        shatter(state, thrown);
        return;
      }
      if (thrown.travelled >= thrown.total - 1e-6) {
        sync(thrown);
        const room = state.room;
        const info = VL.tileInfo(room.area, VL.tileAt(room.area, room.screen, thrown.x, thrown.y, room));
        shatter(state, thrown, info.water ? 'splash' : info.pit || info.flyOver ? 'fall' : 'shards');
        return;
      }
    }
    const k = thrown.travelled / thrown.total;
    thrown.z = Math.max(0, THROW_HEIGHT * (1 - k) + 6 * Math.sin(Math.PI * k));
    sync(thrown);
  }

  // A pot with `respawn` sits back on its spot a few seconds after it was
  // taken (puzzle rooms and the boss room never run out), once the spot is clear.
  function updateRespawns(state) {
    const room = state.room;
    if (!room.respawns?.length) return;
    room.respawns = room.respawns.filter(({ entity, at }) => {
      if (state.time < at) return true;
      const busy = VL.heroBoxOverlaps(state, entity.x, entity.y) || room.entities.some((e) => e.x === entity.x && e.y === entity.y && (e.solid || VL.ENTITIES[e.type]?.solid || VL.isEnemy(e)));
      if (busy) return true;
      room.entities.push({ ...entity });
      return false;
    });
  }

  // ---------- the systems ----------

  // Before the stage (18), the counters (19), the hands (20) and the chickens
  // (25): a press the gloves used is spent here, so nothing else acts on it too.
  VL.defineSystem('lifting', {
    order: 15,
    update(state, actions, dt) {
      const player = state.player;
      if (state.hp <= 0) {
        player.lifted = null;
        return;
      }
      if (player.lifted) {
        player.lifted.t += dt;
        const pressed = ['interact', 'mainHand', 'offHand'].some((action) => actions.pressed[action]);
        if (pressed && player.lifted.since !== state.time && !player.flight) throwLifted(state);
        for (const action of ['interact', 'mainHand', 'offHand', 'fly']) actions.pressed[action] = false;
        return;
      }
      if (!actions.pressed.interact || player.carrying || player.flight || state.transition) return;
      if (VL.tryLift(state)) actions.pressed.interact = false;
    },
  });

  // After combat (30): a hit drops what the hero holds (it shatters at his feet).
  VL.defineSystem('thrown', {
    order: 35,
    update(state, actions, dt) {
      const player = state.player;
      if (player.lifted && state.events.some((event) => event.type === 'heroHurt')) {
        const dropped = { kind: player.lifted.kind, gx: player.x, gy: player.y - 4 };
        player.lifted = null;
        sync(dropped);
        shatter(state, dropped);
      }
      for (const e of state.room.entities.slice()) {
        if (e.type === 'liftThrown') updateThrown(state, e, dt);
        else if (e.type === 'liftShards') {
          e.t += dt;
          if (e.t >= e.dur) state.room.entities = state.room.entities.filter((other) => other !== e);
        }
      }
      updateRespawns(state);
    },
  });

  // ---------- drawing ----------

  function drawLifted(ctx, kind, x, bottom) {
    const sprite = VL.ART.sprite(LIFTED_SPRITE[kind]);
    VL.ART.drawSprite(ctx, LIFTED_SPRITE[kind], Math.round(x - sprite.w / 2), Math.round(bottom - sprite.h));
  }

  VL.defineHeroLayer('lifting', (ctx, state, x, y, t, pass) => {
    const lifted = state.player.lifted;
    if (pass !== 'front' || !lifted) return;
    const k = VL.smoothstep(VL.clamp(lifted.t / T.liftRiseSeconds, 0, 1));
    drawLifted(ctx, lifted.kind, x, y - 6 - k * 10 - Math.round(state.player.lift || 0));
  });

  VL.defineEntity('liftThrown', {
    draw(ctx, thrown, x, y) {
      const gx = x - thrown.x * T.tile + thrown.gx;
      const gy = y - thrown.y * T.tile + thrown.gy;
      VL.ART.drawShadow(ctx, gx, gy + 4, thrown.kind === 'pot' ? 9 : 11);
      drawLifted(ctx, thrown.kind, gx, gy + 6 - Math.round(thrown.z));
    },
  });

  VL.defineEntity('liftShards', {
    draw(ctx, piece, x, y) {
      const gx = x - piece.x * T.tile + piece.gx;
      const gy = y - piece.y * T.tile + piece.gy;
      const k = VL.clamp(piece.t / piece.dur, 0, 1);
      if (piece.fx === 'fall') {
        const r = Math.max(1, Math.round(5 * (1 - k)));
        VL.ART.rect(ctx, SHARD_COLORS[piece.kind][1], gx - r, gy - r, r * 2, r * 2);
        return;
      }
      const colors = piece.fx === 'splash' ? ['foam', 'white', 'waterLight'] : SHARD_COLORS[piece.kind];
      for (let i = 0; i < 7; i += 1) {
        const a = (i / 7) * Math.PI * 2 + 0.4;
        const r = 2 + k * 10;
        const px = Math.round(gx + Math.cos(a) * r);
        const py = Math.round(gy + Math.sin(a) * r * 0.6 - Math.sin(Math.PI * k) * 6);
        VL.ART.rect(ctx, colors[i % 3], px, py, i % 2 ? 2 : 3, 2);
      }
    },
  });
})();
