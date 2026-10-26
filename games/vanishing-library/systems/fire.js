// Dragon fire and the Mirror Shield (design: The path through the game, 8:
// "Mirror Shield (reflects fire)"; A Child's Book of Dragons: dragons can't
// stand their own fire). A ball of fire flies straight over floors, pits
// and lava and stops at walls and anything solid. No wood or metal shield
// stops it; the Mirror Shield raised towards it bounces it back at whatever
// breathed it (a fire spout or the Dragon), which answers with `onFire`.
// README "The Dragon's Lair (W19)".
(() => {
  VL.tune({
    fireDamage: 2,
    fireBounceSpeedUp: 1.3,
  });
  const T = VL.TUNING;
  T.shieldBlocks.mirrorShield = ['small', 'big', 'fire'];

  VL.SHIELD_FIRE_NOTE = 'Ouch! That shield can\'t stop fire.';

  // ---------- art ----------

  VL.ART.addColors({
    mirrorRim: '#c9a227',
    mirrorFace: '#bfe7f5',
    mirrorShine: '#f4fdff',
    fireCore: '#fff2a8',
    fireMid: '#ffb03a',
    fireEdge: '#e8572a',
  });

  VL.ART.defineSprite('item-shield-mirror', {
    colors: { r: 'mirrorRim', f: 'mirrorFace', s: 'mirrorShine', d: 'metalDark' },
    rows: ['.rrrrrr.', 'rssffffr', 'rsfffffr', 'rffsfffr', 'rfffsffr', '.rffffr.', '..rffr..', '...rr...'],
  });
  for (const frame of [0, 1]) {
    VL.ART.defineSprite(`fx-fire-${frame}`, {
      colors: { c: 'fireCore', m: 'fireMid', e: 'fireEdge' },
      rows: frame
        ? ['..ee..', '.emme.', 'emccme', 'emccme', '.emme.', '..ee..']
        : ['..e...', '.emme.', 'emccme', 'emcme.', '.emme.', '...e..'],
    });
  }

  // ---------- the Mirror Shield ----------

  VL.defineItem('mirrorShield', {
    name: 'Mirror Shield',
    icon: 'shield-mirror',
    prefers: 'offHand',
    takesHand: 'offHand',
    about: 'Bounces fire back where it came from. Blocks everything a metal shield does.',
    popup: {
      title: 'You got the Mirror Shield!',
      text: 'It\'s in your off hand now. Hold D to raise it towards a ball of fire and it bounces right back! E swaps what you hold.',
    },
    hold(state) {
      state.player.shield = true;
    },
  });

  // ---------- fire ----------

  // { cx, cy, vx, vy, owner, damage }: owner is the entity that breathed it,
  // kept by reference so a bounced ball flies home to it.
  VL.spawnFire = function spawnFire(state, fire) {
    const ball = { type: 'dragonFire', damage: T.fireDamage, bounced: false, age: 0, ...fire };
    syncTile(ball);
    state.room.entities.push(ball);
    state.events.push({ type: 'fireBreathed' });
    return ball;
  };

  function syncTile(ball) {
    ball.x = Math.floor(ball.cx / T.tile);
    ball.y = Math.floor(ball.cy / T.tile);
  }

  // Fire crosses anything you could see across: floors, pits, lava, water.
  VL.fireStops = function fireStops(state, tx, ty, ignore) {
    const room = state.room;
    if (tx < 0 || ty < 0 || tx >= T.cols || ty >= T.rows) return true;
    const info = VL.tileInfo(room.area, VL.tileAt(room.area, room.screen, tx, ty, room));
    if (info.solid && !info.pit && !info.water) return true;
    return room.entities.some((e) => e !== ignore && e.x === tx && e.y === ty && e.type !== 'dragonFire' && (e.solid || VL.ENTITIES[e.type]?.solid) && !VL.isEnemy(e));
  };

  const near = (a, b, w, h) => Math.abs(a.x - b.x) * 2 < w && Math.abs(a.y - b.y) * 2 < h;

  // The side the ball is on, seen from the hero's body.
  function sideOf(state, ball) {
    const dx = ball.cx - state.player.x;
    const dy = ball.cy - (state.player.y - 5);
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
    return dy >= 0 ? 'down' : 'up';
  }

  function bounce(state, ball) {
    const speed = Math.hypot(ball.vx, ball.vy) * T.fireBounceSpeedUp;
    ball.bounced = true;
    aimHome(ball, speed);
    state.player.blockedAt = state.time;
    state.events.push({ type: 'fireBounced' });
  }

  function ownerCentre(owner) {
    if (owner.cx !== undefined) return { x: owner.cx, y: owner.cy };
    return { x: owner.x * T.tile + 8, y: owner.y * T.tile + 8 };
  }

  function aimHome(ball, speed) {
    const home = ownerCentre(ball.owner);
    const dx = home.x - ball.cx;
    const dy = home.y - ball.cy;
    const len = Math.hypot(dx, dy) || 1;
    ball.vx = (dx / len) * speed;
    ball.vy = (dy / len) * speed;
  }

  function ownerHit(state, ball) {
    const owner = ball.owner;
    const home = ownerCentre(owner);
    const body = VL.isEnemy(owner) ? VL.ENEMIES[owner.type].body : { w: 16, h: 16 };
    if (!near({ x: ball.cx, y: ball.cy }, home, body.w + 4, body.h + 4)) return false;
    const def = VL.isEnemy(owner) ? VL.ENEMIES[owner.type] : VL.ENTITIES[owner.type];
    def?.onFire?.(state, owner, ball);
    return true;
  }

  function updateFire(state, dt) {
    const room = state.room;
    const player = state.player;
    for (const ball of room.entities.filter((e) => e.type === 'dragonFire')) {
      ball.age += dt;
      if (ball.bounced && room.entities.includes(ball.owner)) aimHome(ball, Math.hypot(ball.vx, ball.vy));
      ball.cx += ball.vx * dt;
      ball.cy += ball.vy * dt;
      syncTile(ball);
      let gone = false;
      if (ball.bounced) {
        gone = ownerHit(state, ball) || VL.fireStops(state, ball.x, ball.y, ball.owner);
      } else {
        gone = VL.fireStops(state, ball.x, ball.y, ball.owner);
        if (!gone && state.hp > 0 && near({ x: ball.cx, y: ball.cy }, { x: player.x, y: player.y - 5 }, 14, 18)) {
          if (player.shieldItem === 'mirrorShield' && sideOf(state, ball) === player.facing) {
            bounce(state, ball);
            continue;
          }
          const shielded = player.shieldItem && sideOf(state, ball) === player.facing;
          const result = VL.hurtHero(state, { damage: ball.damage, size: 'fire', from: { x: ball.cx - ball.vx, y: ball.cy - ball.vy }, cause: ball.owner?.type === 'dragon' ? 'dragon' : 'fireSpout' });
          if (result === 'hurt' && shielded && VL.dungeonOf(state)) state.dungeonNote = { text: VL.SHIELD_FIRE_NOTE, t: 0 };
          gone = result !== 'ignored';
        }
      }
      if (gone) {
        room.entities = room.entities.filter((e) => e !== ball);
        state.events.push({ type: 'fireOut' });
      }
    }
  }

  VL.defineEntity('dragonFire', {
    draw(ctx, ball, x, y, t) {
      const px = x + Math.round(ball.cx - ball.x * T.tile);
      const py = y + Math.round(ball.cy - ball.y * T.tile);
      VL.ART.drawShadow(ctx, px, py + 7, 4);
      VL.ART.drawSprite(ctx, `fx-fire-${Math.floor(t * 8) % 2}`, px - 3, py - 3);
    },
  });

  // ---------- sounds ----------

  VL.defineSfx('fireWhoosh', [
    { wave: 'noise', dur: 0.4, vol: 0.35, attack: 0.05, filter: { type: 'bandpass', freq: 700, to: 1500 } },
    { wave: 'sawtooth', freq: 160, to: 90, dur: 0.3, vol: 0.12 },
  ], { gap: 0.25 });
  VL.defineSfx('fireBounce', [
    { wave: 'triangle', freq: 1500, to: 2400, dur: 0.12, vol: 0.3 },
    { wave: 'noise', at: 0.02, dur: 0.2, vol: 0.25, filter: { type: 'highpass', freq: 1800 } },
  ], { gap: 0.1 });
  VL.SOUND.onEvent('fireBreathed', 'fireWhoosh');
  VL.SOUND.onEvent('fireBounced', 'fireBounce');

  VL.defineSystem('fire', {
    // After combat (30), which raises the shield for this step.
    order: 31,
    update(state, actions, dt) {
      updateFire(state, dt);
    },
  });
})();
