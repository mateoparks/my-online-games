// The Lens Crab, the Lighthouse's boss (design: The path through the game,
// 6: "a giant hermit crab wearing the lighthouse lens; shoot its eyes, then
// strike"). It scuttles along the top of the lamp room after the hero, and
// now and then the lens gathers the light and throws a bolt of it at him.
// The sword clinks off the lens; a slingshot shot from in front shuts an
// eye, and with both shut it slumps, dazed, and the sword counts. Three
// rounds; each round's `life` taken while it is dazed wakes it up again,
// and the third beats it: marked `defeated` before it leaves the room
// (README "Dungeons", the boss room).
(() => {
  VL.tune({
    // hp is never run down (refilled on every hit); a round's life is.
    enemyLensCrab: { hp: 50, damage: 1 },
    // Per round: 2 wood hits or 1 metal, well inside the daze.
    lensCrabRoundLife: 2,
    lensCrabRounds: 3,
    lensCrabSpeed: 30,
    lensCrabSpeedUp: 1.25,
    lensCrabGlintEvery: 2.6,
    lensCrabGlintSeconds: 0.8,
    lensCrabBoltSpeed: 90,
    lensCrabEyeSeconds: 5,
    lensCrabDazedSeconds: 3.6,
    lensCrabRecoverSeconds: 0.7,
    lensCrabDyingSeconds: 1.6,
  });
  const T = VL.TUNING;
  VL.LENS_CRAB_SWORD_NOTE = 'The lens is too hard! Shoot its eyes first.';
  VL.LENS_CRAB_BACK_NOTE = 'Its eyes are in front. Shoot from below!';

  // ---------- art ----------

  VL.ART.addColors({
    lensGlass: '#a9dcf2',
    lensGlassLight: '#effaff',
    lensGlassDark: '#6fb0d0',
    lensCrab: '#e0603c',
    lensCrabLight: '#ff9a6a',
    lensCrabDark: '#9c3420',
    lensBolt: '#fff6b0',
  });

  const W = 30;
  const H = 24;
  // The crab drawn on a grid: the glass dome of the lens, its brass band,
  // and the crab under it, eyes on stalks in front.
  function crabRows({ left, right, frame, dazed }) {
    const g = Array.from({ length: H }, () => Array(W).fill('.'));
    const set = (x, y, c) => {
      if (x >= 0 && y >= 0 && x < W && y < H) g[y][x] = c;
    };
    const top = dazed ? 2 : 0;
    for (let y = 0; y <= 12; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const nx = (x + 0.5 - 15) / 14.5;
        const ny = (y + 0.5 - 13) / 13;
        const r = Math.hypot(nx, ny);
        if (r > 1) continue;
        let c = 'G';
        if ((r > 0.5 && r < 0.6) || (r > 0.8 && r < 0.88)) c = 'D';
        if (((x - 9) ** 2) / 9 + ((y - 5) ** 2) / 4 <= 1) c = 'L';
        set(x + (dazed ? 1 : 0), y + top, c);
      }
    }
    for (let x = 1; x < W - 1; x += 1) {
      set(x, 13 + top, x % 5 === 2 ? 'Y' : 'B');
      set(x, 14 + top, 'b');
    }
    const body = dazed ? 2 : 0;
    for (let y = 14; y <= 21; y += 1) {
      for (let x = 0; x < W; x += 1) {
        if (((x + 0.5 - 15) / 10) ** 2 + ((y + 0.5 - 18) / 3.6) ** 2 > 1) continue;
        if (y < 15 + top) continue;
        set(x, y + body, y <= 16 ? 'R' : 'r');
      }
    }
    for (const [cx, side] of [[4, -1], [25, 1]]) {
      const cy = (dazed ? 20 : 18);
      for (let y = -3; y <= 3; y += 1) {
        for (let x = -3; x <= 3; x += 1) if (x * x + y * y <= 9) set(cx + x, cy + y, x * side < 0 && y < 0 ? 'R' : 'r');
      }
      set(cx + side * 2, cy - 3, '.');
      set(cx + side * 3, cy - 2, '.');
      set(cx + side * 1, cy - 1, 'd');
      set(cx + side * 2, cy - 1, 'd');
    }
    const legY = 21 + body;
    const shift = frame ? 1 : 0;
    for (const x of [8, 11, 18, 21]) {
      set(x + shift, legY, 'd');
      set(x + shift + (x < 15 ? -1 : 1), legY + 1, 'd');
    }
    const eye = (x0, open) => {
      for (let y = 0; y < 3; y += 1) for (let x = 0; x < 3; x += 1) set(x0 + x, 16 + body + y, open ? 'w' : 'r');
      if (open) set(x0 + 1, 17 + body, 'e');
      else for (let x = 0; x < 3; x += 1) set(x0 + x, 17 + body, 'd');
      set(x0 + 1, 15 + body, 'd');
    };
    eye(10, left);
    eye(17, right);
    return g.map((row) => row.join(''));
  }
  const colors = {
    G: 'lensGlass', L: 'lensGlassLight', D: 'lensGlassDark', B: 'gold', Y: 'goldLight', b: 'woodDark',
    r: 'lensCrab', R: 'lensCrabLight', d: 'lensCrabDark', w: 'white', e: 'ink',
  };
  for (const frame of [0, 1]) {
    for (const [name, left, right] of [['open', true, true], ['left', false, true], ['right', true, false], ['shut', false, false]]) {
      VL.ART.defineSprite(`enemy-lens-crab-${name}-${frame}`, { colors, rows: crabRows({ left, right, frame }) });
    }
  }
  VL.ART.defineSprite('enemy-lens-crab-dazed', { colors, rows: crabRows({ left: false, right: false, frame: 0, dazed: true }) });
  VL.ART.defineSprite('fx-lens-bolt', {
    colors: { y: 'lensBolt', w: 'white' },
    rows: ['.y.', 'ywy', '.y.'],
  });

  // ---------- sound ----------

  VL.defineSfx('crabEye', [
    { wave: 'square', freq: 700, to: 300, dur: 0.1, vol: 0.25 },
    { wave: 'triangle', freq: 1400, at: 0.04, dur: 0.08, vol: 0.2 },
  ], { gap: 0.15 });
  VL.defineSfx('crabDazed', [
    { wave: 'triangle', freq: 900, to: 300, dur: 0.35, vol: 0.3 },
    { wave: 'triangle', freq: 1200, to: 400, at: 0.1, dur: 0.35, vol: 0.2 },
  ], { gap: 0.3 });
  VL.defineSfx('lensGlint', [{ wave: 'sine', freq: 1500, to: 2600, dur: 0.5, vol: 0.18 }], { gap: 0.4 });
  VL.SOUND.onEvent('crabEye', 'crabEye');
  VL.SOUND.onEvent('crabDazed', 'crabDazed');
  VL.SOUND.onEvent('lensGlint', 'lensGlint');
  VL.SOUND.onEvent('lensBolt', 'slingFire');
  VL.SOUND.onEvent('crabTink', 'slingTink');

  // ---------- behaviour ----------

  function setMode(crab, mode) {
    crab.mode = mode;
    crab.timer = 0;
  }

  const speed = (crab) => T.lensCrabSpeed * T.lensCrabSpeedUp ** (T.lensCrabRounds - crab.rounds);

  function openEyes(crab) {
    crab.eyes = { left: true, right: true };
    crab.eyeTimer = 0;
  }

  VL.defineEnemy('lensCrab', {
    tuning: 'enemyLensCrab',
    size: 'big',
    body: { w: 28, h: 20 },
    rooted: true,
    faint: 'The Lens Crab\'s light was just too bright.',
    harmful: (crab) => ['scuttle', 'glint'].includes(crab.mode),
    setup(state, crab) {
      crab.life = T.lensCrabRoundLife;
      crab.rounds = T.lensCrabRounds;
      openEyes(crab);
      setMode(crab, 'scuttle');
    },
    think(state, crab, dt) {
      crab.timer += dt;
      crab.step = (crab.step || 0) + dt;
      if (crab.eyeTimer > 0 && ['scuttle', 'glint'].includes(crab.mode)) {
        crab.eyeTimer -= dt;
        if (crab.eyeTimer <= 0) openEyes(crab);
      }
      const mode = crab.mode;
      if (mode === 'scuttle') {
        const dx = state.player.x - crab.cx;
        const away = crab.calm > 0 ? -1 : 1;
        if (Math.abs(dx) > 3) VL.moveEnemy(state, crab, Math.sign(dx) * away * speed(crab) * dt, 0);
        if (crab.timer >= T.lensCrabGlintEvery) {
          setMode(crab, 'glint');
          state.events.push({ type: 'lensGlint' });
        }
      } else if (mode === 'glint') {
        if (crab.timer >= T.lensCrabGlintSeconds) {
          const aim = VL.toHero(state, crab);
          const len = Math.max(1, aim.dist);
          VL.spawnProjectile(state, {
            cx: crab.cx, cy: crab.cy + 8, vx: (aim.dx / len) * T.lensCrabBoltSpeed, vy: (aim.dy / len) * T.lensCrabBoltSpeed,
            size: 'small', damage: 1, cause: 'lensCrab', sprite: 'fx-lens-bolt', owner: crab,
          });
          state.events.push({ type: 'lensBolt' });
          setMode(crab, 'scuttle');
        }
      } else if (mode === 'dazed') {
        if (crab.timer >= T.lensCrabDazedSeconds) setMode(crab, 'recover');
      } else if (mode === 'recover') {
        if (crab.timer >= T.lensCrabRecoverSeconds) {
          openEyes(crab);
          setMode(crab, 'scuttle');
        }
      } else if (mode === 'dying' && crab.timer >= T.lensCrabDyingSeconds) {
        // Beaten for good, then gone: the framework crowns it.
        crab.defeated = true;
        state.room.entities = state.room.entities.filter((e) => e !== crab);
        state.room.entities.push({ type: 'poof', x: (crab.cx - 8) / 16, y: (crab.cy - 8) / 16, born: state.time, age: 0 });
        state.events.push({ type: 'enemyDefeated', enemy: 'lensCrab', drop: null });
      }
    },
    // A shell from in front (flying up at its face) shuts the nearer open
    // eye; with both shut it is dazed. Anything else bounces off the lens.
    onShot(state, crab, pellet) {
      if (!['scuttle', 'glint'].includes(crab.mode)) {
        state.events.push({ type: 'crabTink' });
        return true;
      }
      if (!(pellet.dy < 0)) {
        state.events.push({ type: 'crabTink' });
        state.dungeonNote = { text: VL.LENS_CRAB_BACK_NOTE, t: 0 };
        return true;
      }
      const near = pellet.gx < crab.cx ? 'left' : 'right';
      const side = crab.eyes[near] ? near : near === 'left' ? 'right' : 'left';
      crab.eyes[side] = false;
      crab.eyeTimer = T.lensCrabEyeSeconds;
      state.events.push({ type: 'crabEye' });
      if (!crab.eyes.left && !crab.eyes.right) {
        setMode(crab, 'dazed');
        state.events.push({ type: 'crabDazed' });
      }
      return true;
    },
    // Its hp is refilled on every hit; only a hit while it is dazed takes `life`.
    onHit(state, crab) {
      const damage = VL.ENEMIES.lensCrab.hp - crab.hp;
      crab.hp = VL.ENEMIES.lensCrab.hp;
      if (crab.mode !== 'dazed') {
        crab.hurt = 0;
        state.events.push({ type: 'crabTink' });
        state.dungeonNote = { text: VL.LENS_CRAB_SWORD_NOTE, t: 0 };
        return;
      }
      crab.life -= damage;
      if (crab.life > 0) return;
      crab.rounds -= 1;
      if (crab.rounds <= 0) {
        setMode(crab, 'dying');
        return;
      }
      crab.life = T.lensCrabRoundLife;
      setMode(crab, 'recover');
    },
    draw(ctx, crab, cx, cy, t) {
      if (crab.mode === 'dying' && Math.floor(t * 16) % 2) return;
      VL.ART.drawShadow(ctx, cx, cy + 10, 28);
      const x = Math.round(cx - W / 2);
      const y = Math.round(cy - 14);
      if (['dazed', 'recover', 'dying'].includes(crab.mode)) {
        const wobble = crab.mode === 'recover' ? Math.round(Math.sin(t * 40)) : 0;
        VL.ART.drawSprite(ctx, 'enemy-lens-crab-dazed', x + wobble, y);
        if (crab.mode === 'dazed') {
          for (let i = 0; i < 3; i += 1) {
            const a = t * 5 + (i * Math.PI * 2) / 3;
            VL.ART.rect(ctx, 'goldLight', Math.round(cx + Math.cos(a) * 10) - 1, Math.round(y + 2 + Math.sin(a) * 3), 2, 2);
          }
        }
        return;
      }
      const eyes = crab.eyes.left && crab.eyes.right ? 'open' : crab.eyes.left ? 'right' : crab.eyes.right ? 'left' : 'shut';
      const frame = crab.mode === 'scuttle' ? Math.floor((crab.step || 0) * 8) % 2 : 0;
      VL.ART.drawSprite(ctx, `enemy-lens-crab-${eyes}-${frame}`, x, y);
      if (crab.mode === 'glint') {
        const k = Math.min(1, crab.timer / T.lensCrabGlintSeconds);
        VL.ART.drawSparkle(ctx, x + 9, y + 4, t * (1 + k * 3));
        if (k > 0.5) VL.ART.drawSparkle(ctx, x + 20, y + 7, t * 3);
      }
    },
  });
})();
