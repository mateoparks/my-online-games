// Combat (design: Hearts and combat, Tools: two tiers, Anti-goals). The sword
// hits enemies, enemies and their seeds hurt the hero, a raised shield turns
// them away from the front, and anything that hurts knocks back. Enemy types
// live one per file in entities/, registered with VL.defineEnemy. README "Combat".
(() => {
  VL.tune({
    swordDamage: { woodSword: 1, metalSword: 2 },
    shieldBlocks: { woodShield: ['small'], metalShield: ['small', 'big'] },
    invulnSeconds: 1.2,
    // After an enemy hurts the hero (or is blocked) it backs off and is
    // harmless this long, so one approach costs at most one hit.
    enemyCalmSeconds: 2.5,
    // Enemies hold still and harmless this long after the hero walks in.
    enemyArrivalSeconds: 0.6,
    // Nothing hurts the hero this long after a popup or a talk closes: the
    // world was frozen mid-dive under it (wave-3 QA: a gull hit in 0.5 s).
    popupGraceSeconds: 0.8,
    knockbackSpeed: 170,
    knockbackSeconds: 0.16,
    blockShoveSeconds: 0.07,
    enemyHurtSeconds: 0.3,
    enemyKnockbackSpeed: 180,
    enemyKnockbackSeconds: 0.15,
    // One roll per beaten enemy, exclusive bands.
    enemyDrops: { heart: 0.2, shell: 0.2 },
  });

  const POOF_SECONDS = 0.4;
  const SPARK_SECONDS = 0.18;
  // Bodies stay this far inside the screen, so nothing ever crosses an edge.
  const MARGIN = 6;

  // ---------- art ----------

  const metal = { l: 'white', L: 'metal', d: 'metalDark', k: 'hilt' };
  const bladeUp = ['..l..', '.lLl.', '.lLl.', '.lLl.', '.lLl.', '.lLl.', 'ddddd', '..k..', '..k..', '..d..'];
  const transpose = (rows) => [...rows[0]].map((_, x) => rows.map((row) => row[x]).join(''));
  VL.ART.defineSprite('swing-sword-metal-up', { colors: metal, rows: bladeUp });
  VL.ART.defineSprite('swing-sword-metal-down', { colors: metal, rows: bladeUp.slice().reverse() });
  VL.ART.defineSprite('swing-sword-metal-left', { colors: metal, rows: transpose(bladeUp) });
  VL.ART.defineSprite('swing-sword-metal-right', { mirrorOf: 'swing-sword-metal-left' });
  VL.ART.defineSprite('item-sword-metal', { colors: metal, rows: ['..l..', '.lLl.', '.lLl.', '.lLl.', '.lLl.', 'ddddd', '..k..', '..k..', '..d..'] });
  VL.ART.defineSprite('item-shield-metal', {
    colors: { l: 'white', L: 'metal', d: 'metalDark', g: 'gold' },
    rows: ['.dddddd.', 'dllLLlld', 'dlLLLLLd', 'dLLggLLd', 'dLLggLLd', '.dLLLLd.', '..dLLd..', '...dd...'],
  });
  VL.ART.defineSprite('fx-seed', { colors: { s: 'leafLight', d: 'leaf' }, rows: ['.s.', 'ssd', '.d.'] });

  // ---------- metal gear (forged by W10's smith) ----------

  VL.defineItem('metalSword', {
    name: 'Metal Sword',
    icon: 'sword-metal',
    sword: true,
    about: 'Hits twice as hard as wood.',
    popup: { title: 'You got a Metal Sword!', text: 'It hits twice as hard as the wood one. Press Space to swing it.' },
    use(state, hand) {
      VL.swing(state, 'metalSword', hand);
    },
  });

  VL.defineItem('metalShield', {
    name: 'Metal Shield',
    icon: 'shield-metal',
    prefers: 'offHand',
    about: 'Blocks more than wood, even a diving gull.',
    popup: { title: 'You got a Metal Shield!', text: 'It stops more than the wood one, even a diving gull. Hold D to raise it.' },
    hold(state) {
      state.player.shield = true;
    },
  });

  // ---------- geometry ----------

  const overlap = (a, b) => Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;
  const heroBody = (player) => ({ x: player.x, y: player.y - 5, w: 10, h: 14 });
  const enemyBody = (enemy) => ({ x: enemy.cx, y: enemy.cy, w: VL.ENEMIES[enemy.type].body.w, h: VL.ENEMIES[enemy.type].body.h });
  // A flier is drawn `alt` px above its shadow; the blade hits it there too.
  function swordTarget(enemy) {
    const body = enemyBody(enemy);
    const alt = enemy.alt || 0;
    return { ...body, y: body.y - alt / 2, h: body.h + alt };
  }

  // Where the blade reaches, as a box centred off the hero's feet.
  const REACH = { right: [13, -6, 18, 20], left: [-13, -6, 18, 20], up: [0, -22, 20, 18], down: [0, 8, 20, 18] };
  function swordBox(player, facing) {
    const [dx, dy, w, h] = REACH[facing] || REACH.down;
    return { x: player.x + dx, y: player.y + dy, w, h };
  }

  // The side something comes from, seen from the hero's body.
  function sideOf(player, from) {
    const dx = from.x - player.x;
    const dy = from.y - (player.y - 5);
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
    return dy >= 0 ? 'down' : 'up';
  }

  function away(from, to, fallback) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    if (length < 1e-6) return fallback;
    return [dx / length, dy / length];
  }

  const BACK = { up: [0, 1], down: [0, -1], left: [1, 0], right: [-1, 0] };

  const inBounds = (x, y) => ({
    x: VL.clamp(x, MARGIN, VL.TUNING.width - MARGIN),
    y: VL.clamp(y, MARGIN, VL.TUNING.rows * VL.TUNING.tile - MARGIN),
  });

  // Sub-pixel steps with axis-separated collision, like the hero's walk, so a
  // pushed body slides along a wall and stops flush. `box` is { w, h, oy }:
  // the collision box centred `oy` below (x, y). Returns false when blocked.
  function moveBox(state, pos, dx, dy, box) {
    const room = state.room;
    let free = true;
    for (const [axis, amount] of [['x', dx], ['y', dy]]) {
      const direction = Math.sign(amount);
      let remaining = Math.abs(amount);
      while (remaining > 1e-9) {
        const stepSize = Math.min(0.5, remaining) * direction;
        const next = { x: pos.x, y: pos.y };
        next[axis] += stepSize;
        // Only a step further out is refused, so a body already at the edge
        // (the hero just arrived) can still be pushed back in.
        const bounded = inBounds(next.x, next.y);
        const hitEdge = bounded[axis] !== next[axis] && Math.sign(next[axis] - bounded[axis]) === direction;
        if (hitEdge || (box && VL.isBlocked(room.area, room.screen, next.x, next.y + (box.oy || 0), box.w, box.h, room))) {
          free = false;
          break;
        }
        pos[axis] = next[axis];
        remaining -= Math.abs(stepSize);
      }
    }
    return free;
  }

  // ---------- enemies ----------

  // { hp, damage (half hearts), size ('small' | 'big', what a shield must be
  // rated for), body: { w, h }, flies, rooted, faint (the fainted line),
  // drops?: { heart, shell }, setup(state, enemy), think(state, enemy, dt),
  // harmful(enemy), draw(ctx, enemy, cx, cy, t) } with (cx, cy) the body's
  // centre in pixels. An enemy in a region file is { type, x, y } in tiles.
  VL.ENEMIES = {};

  // `tuning: 'enemyCrab'` reads hp and damage live from VL.TUNING.enemyCrab,
  // so a balance pass only touches the numbers.
  VL.defineEnemy = function defineEnemy(type, def) {
    if (VL.ENEMIES[type]) throw new Error(`enemy ${type} is already defined`);
    const enemy = { type, damage: 1, size: 'small', body: { w: 10, h: 10 }, flies: false, rooted: false, harmful: () => true, ...def };
    if (def.tuning) {
      for (const stat of ['hp', 'damage']) {
        Object.defineProperty(enemy, stat, { enumerable: true, get: () => VL.TUNING[def.tuning][stat] });
      }
    }
    VL.ENEMIES[type] = enemy;
    VL.defineEntity(type, {
      enemy: true,
      prepare(state, copy) {
        startEnemy(state, copy);
        copy.arriving = VL.TUNING.enemyArrivalSeconds;
      },
      draw(ctx, copy, x, y, t) {
        const cx = x + 8 + (copy.cx - (copy.x * 16 + 8));
        const cy = y + 8 + (copy.cy - (copy.y * 16 + 8));
        if (copy.hurt > 0 && Math.floor(copy.hurt * 30) % 2 === 0) return;
        enemy.draw(ctx, copy, Math.round(cx), Math.round(cy), t);
      },
    });
    if (def.faint) VL.addFaintLine(type, def.faint);
    return enemy;
  };

  function startEnemy(state, copy) {
    const def = VL.ENEMIES[copy.type];
    copy.cx = copy.x * 16 + 8;
    copy.cy = copy.y * 16 + 8;
    copy.home = { x: copy.cx, y: copy.cy };
    copy.hp = def.hp;
    copy.mode = null;
    copy.timer = 0;
    copy.hurt = 0;
    copy.knock = null;
    copy.calm = 0;
    copy.arriving = 0;
    def.setup?.(state, copy);
  }

  // Draw hooks get the cell from entity.x/y, so keep them following the body.
  function sync(enemy) {
    enemy.x = (enemy.cx - 8) / 16;
    enemy.y = (enemy.cy - 8) / 16;
  }

  VL.spawnEnemy = function spawnEnemy(state, type, tx, ty) {
    if (!VL.ENEMIES[type]) throw new Error(`no enemy ${type}`);
    const enemy = { type, x: tx, y: ty };
    startEnemy(state, enemy);
    state.room.entities.push(enemy);
    return enemy;
  };

  VL.isEnemy = (entity) => Boolean(VL.ENEMIES[entity.type]);

  // Invulnerable without the hurt flash: nothing happened to the hero.
  VL.graceAfterPopup = function graceAfterPopup(state) {
    state.player.invuln = Math.max(state.player.invuln || 0, VL.TUNING.popupGraceSeconds);
  };

  // Whether touching this enemy hurts now. A calm enemy (it just hurt the
  // hero) backs off in its own `think` by reading `enemy.calm > 0`.
  VL.enemyHarmful = (enemy) => !(enemy.calm > 0) && !(enemy.arriving > 0) && VL.ENEMIES[enemy.type].harmful(enemy);

  // Moves an enemy by (dx, dy): fliers anywhere on the screen, walkers only
  // over open ground. False when something stopped it.
  VL.moveEnemy = function moveEnemy(state, enemy, dx, dy) {
    const def = VL.ENEMIES[enemy.type];
    const pos = { x: enemy.cx, y: enemy.cy };
    const free = moveBox(state, pos, dx, dy, def.flies ? null : def.body);
    enemy.cx = pos.x;
    enemy.cy = pos.y;
    sync(enemy);
    return free;
  };

  VL.heroCentre = (state) => ({ x: state.player.x, y: state.player.y - 5 });

  // From an enemy to the hero's body: { dx, dy, dist, side }, `side` being
  // the straight-line direction that is closest.
  VL.toHero = function toHero(state, enemy) {
    const hero = VL.heroCentre(state);
    const dx = hero.x - enemy.cx;
    const dy = hero.y - enemy.cy;
    const side = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'down' : 'up');
    return { dx, dy, dist: Math.hypot(dx, dy), side };
  };

  // ---------- the hero gets hurt ----------

  // The shield the hero has up this step, if any: whichever hand holds a
  // shield with its key held (README "Combat").
  function raisedShield(state, actions) {
    if (!state.player.shield) return null;
    for (const hand of VL.HANDS) {
      const id = VL.heldItem(state, hand);
      if (id && VL.TUNING.shieldBlocks[id] && actions.held[hand]) return id;
    }
    return null;
  }

  function knockHero(state, from, seconds) {
    const player = state.player;
    const [ux, uy] = away(from, VL.heroCentre(state), BACK[player.facing] || [0, 1]);
    const speed = VL.TUNING.knockbackSpeed;
    // Tied to the room, so a teleport mid-push (a door, a respawn) ends it.
    player.knockback = { vx: ux * speed, vy: uy * speed, t: seconds, room: state.room };
  }

  // `hit` = { damage, size, from: { x, y }, cause }. Returns 'blocked',
  // 'hurt' or 'ignored' (already fainted, or still invulnerable).
  VL.hurtHero = function hurtHero(state, hit) {
    const player = state.player;
    // Carried by a chicken (systems/chickens.js), the hero is out of reach.
    if (state.hp <= 0 || player.invuln > 0 || player.flight) return 'ignored';
    const shield = player.shieldItem;
    if (shield && (VL.TUNING.shieldBlocks[shield] || []).includes(hit.size || 'small') && sideOf(player, hit.from) === player.facing) {
      knockHero(state, hit.from, VL.TUNING.blockShoveSeconds);
      player.blockedAt = state.time;
      state.events.push({ type: 'blocked', cause: hit.cause });
      return 'blocked';
    }
    state.hp = Math.max(0, state.hp - hit.damage);
    player.invuln = VL.TUNING.invulnSeconds;
    player.flash = VL.TUNING.invulnSeconds;
    knockHero(state, hit.from, VL.TUNING.knockbackSeconds);
    state.events.push({ type: 'heroHurt', cause: hit.cause, damage: hit.damage });
    if (state.hp <= 0) {
      settleHero(player);
      VL.faint(state, hit.cause);
    }
    return 'hurt';
  };

  // Fainting starts the hero afresh: no push, flashing or invulnerability
  // carries over to the save point.
  function settleHero(player) {
    player.knockback = null;
    player.invuln = 0;
    player.flash = 0;
  }

  function moveHero(state, dt) {
    const player = state.player;
    const knock = player.knockback;
    if (!knock) return;
    if (knock.room !== state.room) {
      player.knockback = null;
      return;
    }
    const { w, h } = VL.TUNING.heroBox;
    const pos = { x: player.x, y: player.y };
    moveBox(state, pos, knock.vx * dt, knock.vy * dt, { w, h });
    player.x = pos.x;
    player.y = pos.y;
    knock.t -= dt;
    if (knock.t <= 1e-9) player.knockback = null;
  }

  // ---------- the sword hits ----------

  function knockEnemy(state, enemy, from) {
    if (VL.ENEMIES[enemy.type].rooted) return;
    const [ux, uy] = away(from, { x: enemy.cx, y: enemy.cy }, BACK[state.player.facing] || [0, -1]);
    const speed = VL.TUNING.enemyKnockbackSpeed;
    enemy.knock = { vx: ux * speed, vy: uy * speed, t: VL.TUNING.enemyKnockbackSeconds };
  }

  // A drop needs open ground: a bat beaten over a tree drops beside it.
  function dropTile(state, enemy) {
    const { tx, ty } = VL.tileOf(enemy.cx, enemy.cy);
    const { cols, rows } = VL.TUNING;
    const room = state.room;
    for (let r = 0; r <= 2; r += 1) {
      for (let dy = -r; dy <= r; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = tx + dx;
          const y = ty + dy;
          if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
          if (!VL.isSolidAt(room.area, room.screen, x, y, room)) return { tx: x, ty: y };
        }
      }
    }
    return null;
  }

  VL.enemyDrop = function enemyDrop(roll, drops = VL.TUNING.enemyDrops) {
    if (roll < drops.heart) return 'heart';
    if (roll < drops.heart + drops.shell) return 'shell';
    return null;
  };

  function defeat(state, enemy) {
    const room = state.room;
    room.entities = room.entities.filter((e) => e !== enemy);
    room.entities.push({ type: 'poof', x: enemy.x, y: enemy.y, born: state.time, age: 0 });
    const kind = VL.enemyDrop(VL.random(state), VL.ENEMIES[enemy.type].drops);
    const tile = kind && dropTile(state, enemy);
    if (tile) room.entities.push({ type: 'drop', kind, x: tile.tx, y: tile.ty, born: state.time });
    state.events.push({ type: 'enemyDefeated', enemy: enemy.type, drop: tile ? kind : null });
  }

  VL.hitEnemy = function hitEnemy(state, enemy, damage, from) {
    if (enemy.hurt > 0 || enemy.hp <= 0) return false;
    enemy.hp -= damage;
    enemy.hurt = VL.TUNING.enemyHurtSeconds;
    state.events.push({ type: 'enemyHit', enemy: enemy.type });
    if (enemy.hp <= 0) {
      defeat(state, enemy);
      return true;
    }
    knockEnemy(state, enemy, from);
    VL.ENEMIES[enemy.type].onHit?.(state, enemy);
    return true;
  };

  function swordHits(state, enemies) {
    const player = state.player;
    const swing = player.swing;
    if (!swing) return;
    const box = swordBox(player, swing.facing);
    const damage = VL.TUNING.swordDamage[swing.item] ?? 0;
    if (!damage) return;
    for (const enemy of enemies) {
      if (enemy.hitBy === swing || !overlap(box, swordTarget(enemy))) continue;
      enemy.hitBy = swing;
      VL.hitEnemy(state, enemy, damage, VL.heroCentre(state));
    }
  }

  function contacts(state, enemies) {
    const body = heroBody(state.player);
    for (const enemy of enemies) {
      const def = VL.ENEMIES[enemy.type];
      if (state.hp <= 0 || !state.room.entities.includes(enemy) || !VL.enemyHarmful(enemy) || !overlap(body, enemyBody(enemy))) continue;
      const from = { x: enemy.cx, y: enemy.cy };
      const result = VL.hurtHero(state, { damage: def.damage, size: def.size, from, cause: enemy.type });
      if (result === 'ignored') continue;
      if (result === 'blocked') knockEnemy(state, enemy, VL.heroCentre(state));
      enemy.calm = VL.TUNING.enemyCalmSeconds;
      def.onTouch?.(state, enemy, result);
    }
  }

  // ---------- projectiles ----------

  // { cx, cy, vx, vy, size, damage, cause, sprite, owner? }: flies straight
  // until it hits the hero, a solid tile or the screen edge. A hit calms the
  // enemy that is its `owner`.
  VL.spawnProjectile = function spawnProjectile(state, shot) {
    const projectile = { type: 'projectile', ...shot };
    sync(projectile);
    state.room.entities.push(projectile);
    return projectile;
  };

  function updateProjectiles(state, dt) {
    const room = state.room;
    const player = state.player;
    const { width, rows, tile } = VL.TUNING;
    for (const shot of room.entities.filter((e) => e.type === 'projectile')) {
      shot.cx += shot.vx * dt;
      shot.cy += shot.vy * dt;
      sync(shot);
      const { tx, ty } = VL.tileOf(shot.cx, shot.cy);
      let gone = shot.cx < 0 || shot.cy < 0 || shot.cx >= width || shot.cy >= rows * tile || VL.isSolidAt(room.area, room.screen, tx, ty, room);
      if (!gone && state.hp > 0 && overlap(heroBody(player), { x: shot.cx, y: shot.cy, w: 4, h: 4 })) {
        const from = { x: player.x - shot.vx, y: player.y - 5 - shot.vy };
        gone = VL.hurtHero(state, { damage: shot.damage, size: shot.size, from, cause: shot.cause }) !== 'ignored';
        if (gone && shot.owner) shot.owner.calm = VL.TUNING.enemyCalmSeconds;
      }
      if (gone) room.entities = room.entities.filter((e) => e !== shot);
    }
  }

  VL.defineEntity('projectile', {
    draw(ctx, shot, x, y) {
      const sprite = VL.ART.sprite(shot.sprite);
      VL.ART.drawShadow(ctx, x + 8, y + 14, 4);
      VL.ART.drawSprite(ctx, shot.sprite, x + 8 - Math.floor(sprite.w / 2), y + 8 - Math.floor(sprite.h / 2));
    },
  });

  // A cartoon puff where an enemy was beaten.
  VL.defineEntity('poof', {
    draw(ctx, poof, x, y) {
      const k = VL.clamp((poof.age || 0) / POOF_SECONDS, 0, 1);
      const r = 2 + k * 7;
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2;
        const size = k < 0.6 ? 4 : 3;
        VL.ART.rect(ctx, i % 2 ? 'foam' : 'white', Math.round(x + 8 + Math.cos(a) * r - size / 2), Math.round(y + 8 + Math.sin(a) * r - size / 2 - k * 3), size, size);
      }
      if (k < 0.5) VL.ART.rect(ctx, 'white', x + 6, y + 6, 4, 4);
    },
  });

  // ---------- drawing on the hero ----------

  const SPARK = { right: [9, -8], left: [-9, -8], up: [0, -18], down: [0, 1] };
  VL.defineHeroLayer('combat', (ctx, state, x, y, t, pass) => {
    const player = state.player;
    if (pass !== 'front' || player.blockedAt === undefined || state.time - player.blockedAt > SPARK_SECONDS) return;
    const [dx, dy] = SPARK[player.facing] || SPARK.down;
    const r = 2 + Math.round(((state.time - player.blockedAt) / SPARK_SECONDS) * 4);
    VL.ART.rect(ctx, 'goldLight', x + dx - r, y + dy, r * 2 + 1, 1);
    VL.ART.rect(ctx, 'goldLight', x + dx, y + dy - r, 1, r * 2 + 1);
    VL.ART.rect(ctx, 'white', x + dx - 1, y + dy - 1, 3, 3);
  });

  // ---------- sounds ----------

  VL.defineSfx('clank', [
    { wave: 'square', freq: 1250, to: 900, dur: 0.07, vol: 0.2 },
    { wave: 'triangle', freq: 2500, at: 0.01, dur: 0.12, vol: 0.3 },
  ], { gap: 0.1 });
  VL.defineSfx('poof', [
    { wave: 'noise', dur: 0.22, vol: 0.4, filter: { type: 'lowpass', freq: 2600, to: 400 } },
    { wave: 'triangle', freq: 300, to: 700, dur: 0.12, vol: 0.3 },
  ], { gap: 0.08 });
  VL.SOUND.onEvent('enemyHit', 'hit');
  VL.SOUND.onEvent('heroHurt', 'hurt');
  VL.SOUND.onEvent('blocked', 'clank');
  VL.SOUND.onEvent('enemyDefeated', 'poof');

  // ---------- the system ----------

  VL.defineSystem('combat', {
    order: 30,
    update(state, actions, dt) {
      const player = state.player;
      player.shieldItem = raisedShield(state, actions);
      if (player.invuln > 0) player.invuln = Math.max(0, player.invuln - dt);
      if (player.flash > 0) player.flash = Math.max(0, player.flash - dt);
      if (state.hp <= 0) {
        settleHero(player);
        return;
      }
      moveHero(state, dt);
      const enemies = state.room.entities.filter(VL.isEnemy);
      for (const enemy of enemies) {
        if (enemy.hurt > 0) enemy.hurt = Math.max(0, enemy.hurt - dt);
        if (enemy.calm > 0) enemy.calm = Math.max(0, enemy.calm - dt);
        if (enemy.arriving > 0) {
          enemy.arriving = Math.max(0, enemy.arriving - dt);
        } else if (enemy.knock) {
          VL.moveEnemy(state, enemy, enemy.knock.vx * dt, enemy.knock.vy * dt);
          enemy.knock.t -= dt;
          if (enemy.knock.t <= 1e-9) enemy.knock = null;
        } else {
          VL.ENEMIES[enemy.type].think(state, enemy, dt);
        }
        sync(enemy);
      }
      swordHits(state, enemies);
      contacts(state, enemies);
      updateProjectiles(state, dt);
      for (const poof of state.room.entities.filter((e) => e.type === 'poof')) poof.age = state.time - poof.born;
      state.room.entities = state.room.entities.filter((e) => e.type !== 'poof' || e.age < POOF_SECONDS);
    },
  });
})();
