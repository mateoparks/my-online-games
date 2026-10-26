// The Slingshot (design: The path through the game, 6: "Slingshot, with
// broken shells as ammo (hit far switches, stun enemies)"), the Lighthouse's
// item. Its key fires a broken shell straight ahead, over pits and water: an
// entity whose type has `onShot` answers it (a target, a mirror), an enemy
// is stunned (or answers its own `onShot`: the Lens Crab), and anything else
// solid stops it. README "The Slingshot (W18)".
(() => {
  VL.tune({
    slingshotTiles: 10,
    slingshotSpeed: 240,
    slingshotCooldown: 0.3,
    slingshotStunSeconds: 2.5,
  });
  const T = VL.TUNING;
  const DIRS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
  // Shots leave from the hero's middle, not his feet.
  const BODY = 6;

  // ---------- art ----------

  VL.ART.defineSprite('item-slingshot', {
    colors: { w: 'wood', d: 'woodDark', l: 'woodLight', b: 'heart', s: 'shell' },
    rows: [
      'l....l',
      'wb..bw',
      'wbbbbd',
      '.wssd.',
      '..wd..',
      '..wd..',
      '..dd..',
    ],
  });
  VL.ART.defineSprite('fx-sling-pellet', {
    colors: { s: 'shell', d: 'shellDark' },
    rows: ['.s.', 'sds', '.s.'],
  });
  VL.ART.defineSprite('fx-stun-star', {
    outline: false,
    colors: { y: 'goldLight', g: 'gold' },
    rows: ['.y.', 'ygy', '.y.'],
  });

  // ---------- the item ----------

  VL.defineItem('slingshot', {
    name: 'Slingshot',
    icon: 'slingshot',
    about: 'Fires broken shells: hits targets far away and stuns creatures.',
    popup: {
      title: 'You got the Slingshot!',
      text: 'Press its key to fire a broken shell. It hits targets out of reach and stuns creatures. Shell heaps keep you stocked!',
    },
    use(state) {
      VL.fireSlingshot(state);
    },
  });

  VL.OUT_OF_SHELLS = {
    dungeon: 'Out of shells! The beaches outside are covered in them.',
    outside: 'Out of broken shells! The beaches are covered in them.',
  };

  function outOfShells(state) {
    state.events.push({ type: 'slingEmpty' });
    if (VL.dungeonOf(state)) state.dungeonNote = { text: VL.OUT_OF_SHELLS.dungeon, t: 0 };
    else VL.showMessage(state, { text: VL.OUT_OF_SHELLS.outside });
  }

  // A broken shell flies from his middle the way he faces; each costs one.
  VL.fireSlingshot = function fireSlingshot(state) {
    const player = state.player;
    if (player.sling > 0 || player.lifted || player.carrying || player.flight || player.rope || state.transition || state.hp <= 0) return false;
    if (state.inventory.brokenShells <= 0) {
      outOfShells(state);
      return false;
    }
    VL.addResource(state, 'brokenShells', -1);
    const [dx, dy] = DIRS[player.facing] || DIRS.down;
    player.sling = T.slingshotCooldown;
    player.slingFacing = player.facing;
    // Drawn at gx, gy (x, y stay 0 so the room's draw offset is all it adds).
    state.room.entities.push({
      type: 'slingPellet', x: 0, y: 0, gx: player.x, gy: player.y - BODY, dx, dy, dist: 0, room: state.room, from: VL.heroTile(state),
    });
    state.events.push({ type: 'slingFire' });
    return true;
  };

  // A creature hit by a shell holds still, harmless, for a moment: W6's
  // arrival hold (README "Combat") is exactly that, so a stun reuses it.
  VL.stunEnemy = function stunEnemy(state, enemy, seconds = T.slingshotStunSeconds) {
    enemy.arriving = Math.max(enemy.arriving || 0, seconds);
    enemy.stunned = Math.max(enemy.stunned || 0, seconds);
    enemy.hurt = Math.max(enemy.hurt || 0, 0.15);
    state.events.push({ type: 'slingStun', enemy: enemy.type });
  };

  const gone = (state, pellet, sound) => {
    pellet.done = true;
    if (sound) state.events.push({ type: sound });
  };

  function hitsEnemy(state, pellet) {
    for (const e of state.room.entities) {
      if (!VL.isEnemy(e) || e.hp <= 0) continue;
      const body = VL.ENEMIES[e.type].body;
      const alt = e.alt || 0;
      if (Math.abs(pellet.gx - e.cx) * 2 >= body.w + 4 || Math.abs(pellet.gy - (e.cy - alt / 2)) * 2 >= body.h + alt + 4) continue;
      const def = VL.ENEMIES[e.type];
      if (!def.onShot?.(state, e, pellet)) VL.stunEnemy(state, e);
      gone(state, pellet, null);
      return true;
    }
    return false;
  }

  // What the shell meets on a tile it reaches: true when it stops there.
  function meets(state, pellet, tx, ty) {
    const room = state.room;
    if (tx < 0 || ty < 0 || tx >= T.cols || ty >= T.rows) {
      gone(state, pellet, 'slingTink');
      return true;
    }
    for (const e of room.entities) {
      if (e.x !== tx || e.y !== ty || e === pellet) continue;
      const def = VL.ENTITIES[e.type];
      if (def?.onShot) {
        def.onShot(state, e, pellet);
        gone(state, pellet, 'slingHit');
        return true;
      }
      // W13's levers too, as README "Switches" promised.
      if (e.type === 'switch') {
        if (VL.dungeonOf(state)) VL.throwSwitch(state, e);
        gone(state, pellet, 'slingHit');
        return true;
      }
      if (e.solid || def?.solid) {
        gone(state, pellet, 'slingTink');
        return true;
      }
    }
    const info = VL.tileInfo(room.area, VL.tileAt(room.area, room.screen, tx, ty, room));
    if (info.solid && !(info.pit || info.water || info.flyOver || info.low)) {
      gone(state, pellet, 'slingTink');
      return true;
    }
    return false;
  }

  function fly(state, pellet, dt) {
    const max = T.slingshotTiles * T.tile;
    let left = T.slingshotSpeed * dt;
    while (left > 0 && !pellet.done) {
      const step = Math.min(2, left);
      left -= step;
      pellet.dist += step;
      pellet.gx += pellet.dx * step;
      pellet.gy += pellet.dy * step;
      if (hitsEnemy(state, pellet)) break;
      const { tx, ty } = VL.tileOf(pellet.gx, pellet.gy);
      const key = `${tx},${ty}`;
      if (pellet.checked !== key && !(tx === pellet.from.tx && ty === pellet.from.ty)) {
        pellet.checked = key;
        if (meets(state, pellet, tx, ty)) break;
      }
      if (pellet.dist >= max) gone(state, pellet, null);
    }
  }

  // After the hands (20), which fire it, and the rope (22); before combat (30).
  VL.defineSystem('slingshot', {
    order: 24,
    update(state, actions, dt) {
      const player = state.player;
      if (player.sling > 0) player.sling = Math.max(0, player.sling - dt);
      const room = state.room;
      if (!room) return;
      for (const e of room.entities) {
        if (e.stunned > 0) e.stunned = Math.max(0, e.stunned - dt);
      }
      const pellets = room.entities.filter((e) => e.type === 'slingPellet');
      if (!pellets.length) return;
      for (const pellet of pellets) {
        if (pellet.room !== room) pellet.done = true;
        else fly(state, pellet, dt);
      }
      room.entities = room.entities.filter((e) => e.type !== 'slingPellet' || !e.done);
    },
  });

  VL.onFaint((state) => {
    if (state.player) state.player.sling = 0;
  });

  // ---------- drawing ----------

  VL.defineEntity('slingPellet', {
    glowsInDark: true,
    draw(ctx, pellet, x, y) {
      VL.ART.drawSprite(ctx, 'fx-sling-pellet', Math.round(x + pellet.gx) - 1, Math.round(y + pellet.gy) - 1);
    },
  });

  // The slingshot held out the way he fired.
  const HELD = { right: [5, -12], left: [-11, -12], down: [-3, -6], up: [-3, -22] };
  VL.defineHeroLayer('slingshot', (ctx, state, x, y, t, pass) => {
    const player = state.player;
    if (player.sling > 0 && pass === (player.slingFacing === 'up' ? 'behind' : 'front')) {
      const [dx, dy] = HELD[player.slingFacing] || HELD.down;
      VL.ART.drawSprite(ctx, 'item-slingshot', x + dx, y + dy);
    }
  });

  // Stars over a stunned creature, over the dark (after systems/darkness.js).
  VL.defineHeroLayer('stunStars', (ctx, state, x, y, t, pass) => {
    const player = state.player;
    if (pass !== 'front') return;
    const ox = x - Math.round(player.x);
    const oy = y - Math.round(player.y);
    for (const e of state.room?.entities || []) {
      if (!(e.stunned > 0) || !VL.isEnemy(e)) continue;
      for (let i = 0; i < 3; i += 1) {
        const a = t * 5 + (i * Math.PI * 2) / 3;
        const top = e.cy - (VL.ENEMIES[e.type].body.h / 2) - (e.alt || 0) - 4;
        VL.ART.drawSprite(ctx, 'fx-stun-star', Math.round(ox + e.cx + Math.cos(a) * 7) - 1, Math.round(oy + top + Math.sin(a) * 2) - 1);
      }
    }
  }, { steady: true });

  // Broken shells left, beside the slingshot in its HUD slot: the HUD's
  // shell count is whole shells only.
  const drawHud = VL.ART.drawHud;
  VL.ART.drawHud = function drawHudWithAmmo(ctx, state, t) {
    drawHud(ctx, state, t);
    if (!state?.inventory) return;
    for (const slot of VL.ART.HUD_LAYOUT.slots) {
      if (VL.heldItem(state, slot.hand) !== 'slingshot') continue;
      const { slotY, slotW, slotH } = VL.ART.HUD_LAYOUT;
      // Bottom-right inside the frame, its drop shadow included.
      VL.ART.text(ctx, String(state.inventory.brokenShells), slot.x + slotW - 3, slotY + slotH - 7, { size: 'small', align: 'right', color: 'text', shadow: 'outline' });
    }
  };

  // ---------- sounds ----------

  VL.defineSfx('slingFire', [
    { wave: 'triangle', freq: 420, to: 900, dur: 0.07, vol: 0.3 },
    { wave: 'noise', at: 0.02, dur: 0.06, vol: 0.2, filter: { type: 'bandpass', freq: 2600, to: 1800 } },
  ], { gap: 0.08 });
  VL.defineSfx('slingTink', [{ wave: 'triangle', freq: 1900, to: 1500, dur: 0.05, vol: 0.22 }], { gap: 0.06 });
  VL.defineSfx('slingHit', [
    { wave: 'square', freq: 520, dur: 0.04, vol: 0.2 },
    { wave: 'triangle', freq: 1040, at: 0.04, dur: 0.08, vol: 0.3 },
  ], { gap: 0.08 });
  VL.defineSfx('slingStun', [
    { wave: 'triangle', freq: 1200, to: 600, dur: 0.12, vol: 0.28 },
    { wave: 'triangle', freq: 1500, to: 800, at: 0.08, dur: 0.12, vol: 0.2 },
  ], { gap: 0.15 });
  VL.SOUND.onEvent('slingFire', 'slingFire');
  VL.SOUND.onEvent('slingTink', 'slingTink');
  VL.SOUND.onEvent('slingHit', 'slingHit');
  VL.SOUND.onEvent('slingStun', 'slingStun');
  VL.SOUND.onEvent('slingEmpty', 'bump');
})();
