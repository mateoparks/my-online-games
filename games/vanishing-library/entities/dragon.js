// The Dragon, the boss of the Dragon's Lair (design: The path through the
// game, 8: "Reflect its fire back, then use your sword"; Ending: "defeated as
// in Zelda: a cartoon puff, no gore"). It paces along the back of its hoard
// after the hero, draws breath (its chest glows) and breathes a ball of fire
// at him. The sword clinks off its scales; its own fire, bounced back by the
// Mirror Shield, knocks it to the floor, dazed, and then the sword counts.
// Three rounds, a little quicker each time; the third ends in a puff of
// smoke (marked `defeated` before it leaves the room, README "Dungeons").
// Nothing about it blinks: a hit shakes it instead (the flash guard, W18).
(() => {
  VL.tune({
    // hp is never run down (refilled on every hit); a round's life is.
    enemyDragon: { hp: 50, damage: 2 },
    dragonRoundLife: 2,
    dragonRounds: 3,
    dragonSpeed: 26,
    dragonSpeedUp: 1.3,
    dragonBreatheEvery: 2.2,
    dragonInhaleSeconds: 0.9,
    dragonFireSpeed: 78,
    dragonDazedSeconds: 3.8,
    dragonRecoverSeconds: 0.8,
    dragonDyingSeconds: 1.6,
  });
  const T = VL.TUNING;
  VL.DRAGON_SWORD_NOTE = 'Its scales are too tough! Bounce its own fire back at it.';
  VL.DRAGON_WORDS = { beaten: 'The Dragon is beaten!' };

  // ---------- art ----------

  VL.ART.addColors({
    dragon: '#c8432b',
    dragonLight: '#ef7a4e',
    dragonDark: '#82281d',
    dragonWing: '#6d2433',
    dragonWingLight: '#9c3a4a',
    dragonBelly: '#f2c46b',
    dragonBellyDark: '#c99a45',
    dragonHorn: '#efe3c4',
  });

  const W = 40;
  const H = 32;
  // Seen from the front: wings spread, horns, a pale belly, claws at the
  // bottom. `mouth`: shut, open (drawing breath) or none (dazed, eyes shut).
  function dragonRows({ mouth = 'shut', dazed = false, step = 0 }) {
    const g = Array.from({ length: H }, () => Array(W).fill('.'));
    const set = (x, y, c) => {
      if (x >= 0 && y >= 0 && x < W && y < H) g[y][x] = c;
    };
    const ellipse = (cx, cy, rx, ry, c) => {
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
          if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) set(x, y, c);
        }
      }
    };
    const drop = dazed ? 5 : 0;
    // Wings: fans of dark membrane with lighter ribs.
    for (const side of [-1, 1]) {
      for (let y = 4; y <= 21; y += 1) {
        const reach = Math.round(19 - Math.abs(y - 10) * 0.9 - (dazed ? 4 : 0));
        for (let i = 7; i <= reach; i += 1) set(20 + side * i, y + (dazed ? 3 : 0), (i + y) % 6 === 0 ? 'w' : 'W');
      }
    }
    ellipse(20, 20 + drop / 2, 10, 9, 'R');
    ellipse(17, 17 + drop / 2, 4, 3, 'L');
    ellipse(20, 22 + drop / 2, 5, 6, 'Y');
    for (let y = 18; y <= 27; y += 3) for (let x = 16; x <= 24; x += 1) if (g[y + Math.floor(drop / 2)]?.[x] === 'Y') set(x, y + Math.floor(drop / 2), 'y');
    // Claws.
    for (const fx of [12, 27]) {
      const lift = step && fx === 12 ? 1 : 0;
      ellipse(fx + 0.5, 28.5 - lift, 3, 2, 'D');
      for (let i = 0; i < 3; i += 1) set(Math.floor(fx - 1 + i * 1.5), 30 - lift, 'H');
    }
    // Head and horns.
    const hy = 8 + drop;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i += 1) set(20 + side * (5 + i), hy - 4 - i, 'H');
      set(20 + side * 5, hy - 3, 'H');
    }
    ellipse(20, hy, 7, 6, 'R');
    ellipse(20, hy + 3.5, 4.5, 3, 'L');
    if (dazed) {
      for (const ex of [16, 23]) for (let i = 0; i < 3; i += 1) set(ex + i - 1, hy - 1, 'k');
    } else {
      for (const ex of [16, 23]) {
        set(ex, hy - 2, 'e');
        set(ex + 1, hy - 2, 'e');
        set(ex, hy - 1, 'e');
        set(ex + 1, hy - 1, 'k');
      }
    }
    set(18, hy + 2, 'k');
    set(22, hy + 2, 'k');
    if (mouth === 'open') ellipse(20, hy + 4.5, 3, 1.8, 'f');
    else for (let x = 17; x <= 23; x += 1) set(x, hy + 5, 'D');
    return g.map((row) => row.join(''));
  }
  const colors = {
    R: 'dragon', L: 'dragonLight', D: 'dragonDark', W: 'dragonWing', w: 'dragonWingLight',
    Y: 'dragonBelly', y: 'dragonBellyDark', H: 'dragonHorn', e: 'white', k: 'ink', f: 'fireMid',
  };
  for (const step of [0, 1]) {
    VL.ART.defineSprite(`enemy-dragon-${step}`, { colors, rows: dragonRows({ step }) });
    VL.ART.defineSprite(`enemy-dragon-breath-${step}`, { colors, rows: dragonRows({ mouth: 'open', step }) });
  }
  VL.ART.defineSprite('enemy-dragon-dazed', { colors, rows: dragonRows({ dazed: true }) });

  // ---------- sound ----------

  VL.defineSfx('dragonRoar', [
    { wave: 'sawtooth', freq: 140, to: 70, dur: 0.6, vol: 0.25, filter: { type: 'lowpass', freq: 900 } },
    { wave: 'noise', dur: 0.5, vol: 0.2, filter: { type: 'bandpass', freq: 500 } },
  ], { gap: 0.6 });
  VL.defineSfx('dragonThud', [
    { wave: 'sine', freq: 110, to: 45, dur: 0.35, vol: 0.45 },
    { wave: 'noise', dur: 0.25, vol: 0.3, filter: { type: 'lowpass', freq: 600 } },
  ], { gap: 0.3 });
  VL.SOUND.onEvent('dragonInhale', 'dragonRoar');
  VL.SOUND.onEvent('dragonDazed', 'dragonThud');
  VL.SOUND.onEvent('dragonTink', 'clank');

  // ---------- behaviour ----------

  function setMode(dragon, mode) {
    dragon.mode = mode;
    dragon.timer = 0;
  }

  const fierce = (dragon) => T.dragonSpeedUp ** (T.dragonRounds - dragon.rounds);
  const awake = (dragon) => ['prowl', 'inhale'].includes(dragon.mode);

  VL.defineEnemy('dragon', {
    tuning: 'enemyDragon',
    size: 'big',
    body: { w: 34, h: 26 },
    rooted: true,
    faint: 'The Dragon\'s fire was just too hot.',
    harmful: awake,
    setup(state, dragon) {
      dragon.life = T.dragonRoundLife;
      dragon.rounds = T.dragonRounds;
      dragon.shake = 0;
      setMode(dragon, 'prowl');
    },
    think(state, dragon, dt) {
      dragon.timer += dt;
      dragon.step = (dragon.step || 0) + dt;
      dragon.shake = Math.max(0, (dragon.shake || 0) - dt);
      const mode = dragon.mode;
      if (mode === 'prowl') {
        const dx = state.player.x - dragon.cx;
        const away = dragon.calm > 0 ? -1 : 1;
        if (Math.abs(dx) > 4) VL.moveEnemy(state, dragon, Math.sign(dx) * away * T.dragonSpeed * fierce(dragon) * dt, 0);
        if (dragon.timer >= T.dragonBreatheEvery / fierce(dragon)) {
          setMode(dragon, 'inhale');
          state.events.push({ type: 'dragonInhale' });
        }
      } else if (mode === 'inhale') {
        if (dragon.timer >= T.dragonInhaleSeconds) {
          const mouth = { x: dragon.cx, y: dragon.cy - 2 };
          const hero = VL.heroCentre(state);
          const len = Math.hypot(hero.x - mouth.x, hero.y - mouth.y) || 1;
          const speed = T.dragonFireSpeed * fierce(dragon);
          VL.spawnFire(state, { cx: mouth.x, cy: mouth.y, vx: ((hero.x - mouth.x) / len) * speed, vy: ((hero.y - mouth.y) / len) * speed, owner: dragon });
          setMode(dragon, 'prowl');
        }
      } else if (mode === 'dazed') {
        if (dragon.timer >= T.dragonDazedSeconds) setMode(dragon, 'recover');
      } else if (mode === 'recover') {
        if (dragon.timer >= T.dragonRecoverSeconds) setMode(dragon, 'prowl');
      } else if (mode === 'dying' && dragon.timer >= T.dragonDyingSeconds) {
        // A cartoon puff, then gone: the framework crowns it.
        dragon.defeated = true;
        state.room.entities = state.room.entities.filter((e) => e !== dragon);
        state.room.entities.push({ type: 'poof', x: (dragon.cx - 8) / 16, y: (dragon.cy - 8) / 16, born: state.time, age: 0 });
        state.events.push({ type: 'enemyDefeated', enemy: 'dragon', drop: null });
      }
    },
    // Its own fire, bounced back: down it goes.
    onFire(state, dragon, ball) {
      if (ball.owner !== dragon || !awake(dragon)) return;
      setMode(dragon, 'dazed');
      dragon.shake = 0.3;
      state.events.push({ type: 'dragonDazed' });
    },
    // A shot only tinks off its scales.
    onShot(state) {
      state.events.push({ type: 'dragonTink' });
      return true;
    },
    // Its hp is refilled on every hit; only a hit while it is dazed takes
    // `life`. `hurt` is cleared so the framework's hurt blink never shows.
    onHit(state, dragon) {
      const damage = VL.ENEMIES.dragon.hp - dragon.hp;
      dragon.hp = VL.ENEMIES.dragon.hp;
      dragon.hurt = 0;
      dragon.shake = 0.25;
      if (dragon.mode !== 'dazed') {
        state.events.push({ type: 'dragonTink' });
        state.dungeonNote = { text: VL.DRAGON_SWORD_NOTE, t: 0 };
        return;
      }
      dragon.life -= damage;
      if (dragon.life > 0) return;
      dragon.rounds -= 1;
      if (dragon.rounds <= 0) {
        setMode(dragon, 'dying');
        return;
      }
      dragon.life = T.dragonRoundLife;
      setMode(dragon, 'recover');
    },
    draw(ctx, dragon, cx, cy, t) {
      const shake = dragon.shake > 0 ? Math.round(Math.sin(t * 60)) : 0;
      if (dragon.mode === 'dying') {
        // It shrinks away into a cloud of smoke.
        const k = VL.clamp(dragon.timer / T.dragonDyingSeconds, 0, 1);
        VL.ART.drawShadow(ctx, cx, cy + 14, Math.round(30 * (1 - k)) + 2);
        if (k < 0.6) VL.ART.drawSprite(ctx, 'enemy-dragon-dazed', Math.round(cx - W / 2), Math.round(cy - 16 + k * 10));
        for (let i = 0; i < 7; i += 1) {
          const a = (i / 7) * Math.PI * 2 + k * 2;
          const r = 6 + k * 16;
          const size = Math.round(4 + k * 4);
          VL.ART.rect(ctx, i % 2 ? 'dgnStoneLight' : 'white', Math.round(cx + Math.cos(a) * r - size / 2), Math.round(cy + Math.sin(a) * r * 0.6 - size / 2 - k * 6), size, size);
        }
        return;
      }
      VL.ART.drawShadow(ctx, cx, cy + 14, 32);
      const x = Math.round(cx - W / 2) + shake;
      const y = Math.round(cy - 16);
      if (dragon.mode === 'dazed' || dragon.mode === 'recover') {
        VL.ART.drawSprite(ctx, 'enemy-dragon-dazed', x + (dragon.mode === 'recover' ? Math.round(Math.sin(t * 30)) : 0), y);
        if (dragon.mode === 'dazed') {
          for (let i = 0; i < 3; i += 1) {
            const a = t * 4 + (i * Math.PI * 2) / 3;
            VL.ART.rect(ctx, 'goldLight', Math.round(cx + Math.cos(a) * 11) - 1, Math.round(y + 6 + Math.sin(a) * 3), 2, 2);
          }
        }
        return;
      }
      const step = dragon.mode === 'prowl' ? Math.floor((dragon.step || 0) * 4) % 2 : 0;
      VL.ART.drawSprite(ctx, `enemy-dragon${dragon.mode === 'inhale' ? '-breath' : ''}-${step}`, x, y);
      if (dragon.mode === 'inhale') {
        // Its chest glows brighter as it draws breath, steadily, never blinking.
        const k = VL.clamp(dragon.timer / T.dragonInhaleSeconds, 0, 1);
        const r = Math.round(1 + k * 4);
        VL.ART.rect(ctx, 'fireMid', Math.round(cx) - r, y + 20 - r, r * 2, r * 2);
        if (k > 0.5) VL.ART.rect(ctx, 'fireCore', Math.round(cx) - 1, y + 19, 2, 2);
      }
    },
  });
})();
