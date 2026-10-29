// The Grappling Rope (design: The path through the game, 3: "rope with a
// grappling hook (pull across gaps, yank things)"), the Hollow Oak's item.
// Its key throws the hook straight ahead over pits, water and low things: a
// post (`hookable`) pulls the hero across to the tile in front of it, a
// pickup is dragged back to him, a switch is thrown, a light enemy (W38) is
// reeled in to stand stunned before him at the cost of half a heart, any
// other enemy is stunned where it is (or answers `onHook`), a chicken sends
// back an egg, and anything else solid sends it back. README "The Grappling
// Rope (W15)".
(() => {
  VL.tune({
    ropeTiles: 6,
    ropeSpeed: 300,
    ropeReturnSpeed: 420,
    ropePullSpeed: 210,
    ropeStunSeconds: 1.5,
    // A light enemy reeled in stands this far before the hero's middle, in
    // the sword's reach and clear of his body.
    ropePullGap: 14,
    ropePullDamage: 1,
  });
  const T = VL.TUNING;
  const DIRS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
  // Things the hook brings back: walking onto them is how they are taken.
  const FETCHES = ['drop', 'shell', 'ore', 'smallKey', 'bossKey', 'dungeonMap', 'heartContainer'];
  // The hook leaves from the hero's middle, not his feet.
  const BODY = 6;

  // ---------- art ----------

  VL.ART.addColors({
    rope: '#c9a46a',
    ropeDark: '#8a6a3a',
  });
  VL.ART.defineSprite('item-grappling-rope', {
    colors: { r: 'rope', d: 'ropeDark', m: 'metal', l: 'white', k: 'metalDark' },
    rows: [
      '....m.m.',
      '....lmk.',
      '.rrr.m..',
      'rd..rm..',
      'r....d..',
      'rd..dr..',
      '.rrrr...',
    ],
  });
  VL.ART.defineSprite('fx-rope-hook', {
    colors: { m: 'metal', l: 'white', k: 'metalDark' },
    rows: ['m.l.m', 'mlllm', '.kmk.', '..k..'],
  });

  // ---------- the item ----------

  VL.defineItem('grapplingRope', {
    name: 'Grappling Rope',
    icon: 'grappling-rope',
    about: 'Throws a hook: posts pull you across, and things come back to you.',
    popup: {
      title: 'You got the Grappling Rope!',
      text: 'Put it in a hand and press that key to throw the hook. It catches on posts and pulls you over pits, and drags things back to you!',
    },
    use(state) {
      VL.throwRope(state);
    },
  });

  // ---------- throwing ----------

  VL.throwRope = function throwRope(state) {
    const player = state.player;
    if (player.rope || player.lifted || player.carrying || player.flight || state.transition || state.hp <= 0) return false;
    const [dx, dy] = DIRS[player.facing] || DIRS.down;
    player.rope = { dx, dy, len: 0, phase: 'out', room: state.room, carry: null, to: null, checked: null };
    state.events.push({ type: 'ropeThrow' });
    return true;
  };

  // The hook's point, in play-area pixels.
  VL.ropeTip = function ropeTip(state) {
    const { player } = state;
    const rope = player.rope;
    return { x: player.x + rope.dx * rope.len, y: player.y - BODY + rope.dy * rope.len };
  };

  const back = (state, rope, sound = 'ropeClink') => {
    rope.phase = 'back';
    if (sound) state.events.push({ type: sound });
  };

  function hitEnemy(state, rope, tip) {
    for (const e of state.room.entities) {
      if (!VL.isEnemy(e) || e.hp <= 0) continue;
      const body = VL.ENEMIES[e.type].body;
      const alt = e.alt || 0;
      if (Math.abs(tip.x - e.cx) * 2 >= body.w + 4 || Math.abs(tip.y - (e.cy - alt / 2)) * 2 >= body.h + alt + 4) continue;
      const def = VL.ENEMIES[e.type];
      if (def.light && !def.onHook) {
        reelIn(state, rope, e, def);
        return true;
      }
      if (!def.onHook?.(state, e)) {
        e.calm = Math.max(e.calm || 0, T.ropeStunSeconds);
        e.hurt = Math.max(e.hurt || 0, 0.2);
        state.events.push({ type: 'ropeStun', enemy: e.type });
      }
      back(state, rope, null);
      return true;
    }
    return false;
  }

  // The hook bites a light enemy: it is dragged back with the rope, harmless
  // and thinking nothing, until it stands before the hero or is stopped.
  function reelIn(state, rope, enemy, def) {
    rope.phase = 'reel';
    rope.enemy = enemy;
    enemy.knock = null;
    // The arrival hold (README "Combat"): it thinks nothing and is harmless.
    enemy.arriving = Infinity;
    def.onPulled?.(state, enemy);
    state.events.push({ type: 'ropeHooked' });
  }

  function endReel(state, rope, arrived) {
    const enemy = rope.enemy;
    state.player.rope = null;
    if (!state.room.entities.includes(enemy) || enemy.hp <= 0) return;
    enemy.arriving = 0;
    VL.stunEnemy(state, enemy, T.ropeStunSeconds);
    // A moment more before it may hurt him, standing right beside him.
    enemy.calm = Math.max(enemy.calm || 0, T.ropeStunSeconds + 0.6);
    if (!arrived) return;
    VL.hurtHero(state, { damage: T.ropePullDamage, size: VL.ENEMIES[enemy.type].size, from: { x: enemy.cx, y: enemy.cy }, cause: enemy.type, sure: true, knock: false });
  }

  function reel(state, rope, dt) {
    const { player } = state;
    const enemy = rope.enemy;
    if (!state.room.entities.includes(enemy) || enemy.hp <= 0) {
      player.rope = null;
      return;
    }
    const to = { x: player.x + rope.dx * T.ropePullGap, y: player.y - 5 + rope.dy * T.ropePullGap };
    const dx = to.x - enemy.cx;
    const dy = to.y - enemy.cy;
    const dist = Math.hypot(dx, dy);
    const step = Math.min(dist, T.ropeReturnSpeed * dt);
    const before = [enemy.cx, enemy.cy];
    // moveEnemy keeps a walker out of walls and water and every body on screen.
    if (dist > 1e-6) VL.moveEnemy(state, enemy, (dx / dist) * step, (dy / dist) * step);
    rope.len = Math.max(0, (enemy.cx - player.x) * rope.dx + (enemy.cy - (player.y - BODY)) * rope.dy);
    if (Math.hypot(to.x - enemy.cx, to.y - enemy.cy) < 0.5) endReel(state, rope, true);
    else if (Math.hypot(enemy.cx - before[0], enemy.cy - before[1]) < 1e-3) endReel(state, rope, false);
  }

  // What the hook meets on a tile it reaches. Returns true when it stops.
  function meet(state, rope, tx, ty) {
    const room = state.room;
    const { cols, rows } = T;
    if (tx < 0 || ty < 0 || tx >= cols || ty >= rows) {
      back(state, rope, null);
      return true;
    }
    for (const e of room.entities) {
      if (e.x !== tx || e.y !== ty || e === rope.carry) continue;
      const def = VL.ENTITIES[e.type];
      if (def?.hookable) {
        const land = { tx: tx - rope.dx, ty: ty - rope.dy };
        const hero = VL.heroTile(state);
        const open = !(land.tx === hero.tx && land.ty === hero.ty) && !VL.isSolidAt(room.area, room.screen, land.tx, land.ty, room);
        if (!open) {
          back(state, rope);
          return true;
        }
        rope.phase = 'pull';
        state.player.invuln = Math.max(state.player.invuln || 0, 0.1);
        rope.to = VL.tileCenter(land.tx, land.ty);
        rope.hooked = e;
        state.events.push({ type: 'ropeHooked' });
        return true;
      }
      if (FETCHES.includes(e.type) && !e.hidden) {
        rope.carry = e;
        back(state, rope, 'ropeHooked');
        return true;
      }
      if (e.type === 'switch') {
        if (VL.dungeonOf(state)) VL.throwSwitch(state, e);
        back(state, rope);
        return true;
      }
      if (e.solid || def?.solid) {
        back(state, rope);
        return true;
      }
    }
    const info = VL.tileInfo(room.area, VL.tileAt(room.area, room.screen, tx, ty, room));
    if (info.solid && !(info.pit || info.water || info.flyOver || info.low)) {
      back(state, rope);
      return true;
    }
    return false;
  }

  function fetched(state, rope) {
    const thing = rope.carry;
    if (!thing || !state.room.entities.includes(thing)) return;
    const { tx, ty } = VL.heroTile(state);
    thing.x = tx;
    thing.y = ty;
    VL.ENTITIES[thing.type].onStand?.(state, thing);
  }

  function update(state, dt) {
    const player = state.player;
    const rope = player.rope;
    if (rope.room !== state.room) {
      player.rope = null;
      return;
    }
    const max = T.ropeTiles * T.tile;
    if (rope.phase === 'out') {
      let left = T.ropeSpeed * dt;
      while (left > 0 && rope.phase === 'out') {
        const step = Math.min(2, left, max - rope.len);
        left -= step;
        rope.len += step;
        const tip = VL.ropeTip(state);
        if (hitEnemy(state, rope, tip)) break;
        if (VL.ropeHitsChicken?.(state, tip)) {
          rope.egg = true;
          back(state, rope, 'ropeHooked');
          break;
        }
        const { tx, ty } = VL.tileOf(tip.x, tip.y);
        const here = VL.heroTile(state);
        const key = `${tx},${ty}`;
        if (rope.checked !== key && !(tx === here.tx && ty === here.ty)) {
          rope.checked = key;
          if (meet(state, rope, tx, ty)) break;
        }
        if (rope.len >= max - 1e-6) back(state, rope, null);
      }
    } else if (rope.phase === 'back') {
      rope.len = Math.max(0, rope.len - T.ropeReturnSpeed * dt);
      if (rope.carry) {
        const tip = VL.ropeTip(state);
        rope.carry.x = (tip.x - 8) / T.tile;
        rope.carry.y = (tip.y - 8) / T.tile;
      }
      if (rope.len <= 0) {
        player.rope = null;
        fetched(state, rope);
        if (rope.egg) VL.splatEgg(state);
      }
    } else if (rope.phase === 'reel') {
      reel(state, rope, dt);
    } else if (rope.phase === 'pull') {
      // Over the pits, out of harm's way, straight to the post.
      player.knockback = null;
      player.invuln = Math.max(player.invuln || 0, 0.1);
      player.lift = 3;
      const dx = rope.to.x - player.x;
      const dy = rope.to.y - player.y;
      const dist = Math.hypot(dx, dy);
      const step = T.ropePullSpeed * dt;
      if (dist <= step) {
        player.x = rope.to.x;
        player.y = rope.to.y;
        player.rope = null;
        player.lift = 0;
        state.events.push({ type: 'ropeLand' });
        VL.standHooks(state);
        return;
      }
      player.x += (dx / dist) * step;
      player.y += (dy / dist) * step;
    }
  }

  VL.onFaint((state) => {
    if (state.player) {
      state.player.rope = null;
      state.player.lift = 0;
    }
  });

  // After the hands (20), which throw it; before combat (30).
  VL.defineSystem('rope', {
    order: 22,
    update(state, actions, dt) {
      if (state.player.rope) update(state, dt);
    },
  });

  // ---------- drawing ----------

  VL.defineHeroLayer('rope', (ctx, state, x, y, t, pass) => {
    const rope = state.player.rope;
    if (!rope || pass !== (rope.dy < 0 ? 'behind' : 'front')) return;
    const ox = x;
    const oy = y - BODY - Math.round(state.player.lift || 0);
    const len = rope.phase === 'pull' && rope.hooked
      ? Math.abs(rope.hooked.x * T.tile + 8 - state.player.x) + Math.abs(rope.hooked.y * T.tile + 8 - (state.player.y - BODY))
      : rope.len;
    for (let s = 4; s < len - 2; s += 3) {
      VL.ART.rect(ctx, (s / 3) % 2 ? 'rope' : 'ropeDark', Math.round(ox + rope.dx * s) - 1, Math.round(oy + rope.dy * s) - 1, 2, 2);
    }
    const hx = Math.round(ox + rope.dx * len);
    const hy = Math.round(oy + rope.dy * len);
    VL.ART.drawSprite(ctx, 'fx-rope-hook', hx - 2, hy - 2);
    if (rope.egg) VL.ART.drawSprite(ctx, 'fx-egg', hx - 2, hy + 1);
  });

  // ---------- sounds ----------

  VL.defineSfx('ropeThrow', [{ wave: 'noise', dur: 0.14, vol: 0.35, filter: { type: 'bandpass', freq: 2200, to: 900 } }], { gap: 0.1 });
  VL.defineSfx('ropeClink', [{ wave: 'triangle', freq: 1700, to: 1300, dur: 0.06, vol: 0.25 }], { gap: 0.08 });
  VL.defineSfx('ropeHook', [
    { wave: 'square', freq: 180, to: 120, dur: 0.06, vol: 0.25 },
    { wave: 'triangle', freq: 900, at: 0.03, dur: 0.08, vol: 0.25 },
  ], { gap: 0.1 });
  VL.defineSfx('ropeReel', [{ wave: 'triangle', freq: 300, to: 600, dur: 0.25, vol: 0.25 }], { gap: 0.2 });
  VL.SOUND.onEvent('ropeThrow', 'ropeThrow');
  VL.SOUND.onEvent('ropeClink', 'ropeClink');
  VL.SOUND.onEvent('ropeHooked', 'ropeHook');
  VL.SOUND.onEvent('ropeStun', 'ropeClink');
  VL.SOUND.onEvent('ropeLand', 'step');
})();
