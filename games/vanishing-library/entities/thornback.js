// The Thornback, the Hollow Oak's boss (design: The path through the game,
// 3: "an armored beetle; grapple off its plates, then use your sword"). It
// trundles after the hero, stamps when he is in line, then charges and bonks
// into the wall. A sword only clinks off its plates; the rope's hook yanks a
// plate off and flips it onto its back, legs waving, and then the sword
// counts. Three rounds, one per plate: each round's `life` taken while it is
// on its back sets it on its feet again, and the third beats it: marked
// `defeated` before it leaves the room (README "Dungeons", the boss room).
(() => {
  VL.tune({
    // hp is never run down (refilled on every hit); a round's life is.
    enemyThornback: { hp: 50, damage: 2 },
    // Per round (one per plate): 3 wood hits or 2 metal, about a second of
    // swinging, well inside the flip.
    thornbackRoundLife: 3,
    thornbackPlates: 3,
    thornbackWalkSpeed: 26,
    thornbackChargeSpeed: 125,
    thornbackWalkSeconds: 1.4,
    thornbackAimSeconds: 0.75,
    thornbackBonkSeconds: 1,
    thornbackFlippedSeconds: 3.5,
    thornbackRightSeconds: 0.45,
    thornbackDyingSeconds: 1.6,
    // How close to the hero's row or column counts as "in line".
    thornbackLine: 10,
  });
  const T = VL.TUNING;
  const DIRS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
  VL.THORNBACK_SWORD_NOTE = 'Its plates are too hard! Hook it with the rope.';

  // ---------- art ----------

  VL.ART.addColors({
    thorn: '#5f7a3a',
    thornDark: '#3c5226',
    thornLight: '#93b25a',
    thornSpike: '#e6d7a0',
    thornBelly: '#f0c48a',
    thornBellyDark: '#c08a52',
    thornSoft: '#e89aa6',
  });

  // Facing down (head at the bottom); 1-3 are the plates, a-c their
  // thorns, s the soft back a missing plate leaves.
  const DOWN = [
    '......kkkkkkkk......',
    '....kk11111111kk....',
    '...k1a11111111a1k...',
    'l.k11111111111111k.l',
    '.lk11111111111111kl.',
    '..kkkkkkkkkkkkkkkk..',
    'l.k22222222222222k.l',
    '.lk2b2222222222b2kl.',
    '..k22222222222222k..',
    '..kkkkkkkkkkkkkkkk..',
    'l.k33333333333333k.l',
    '.lk3c3333333333c3kl.',
    '..k33333333333333k..',
    '...kkkkkkkkkkkkkk...',
    '....kHHHHHHHHHHk....',
    '...kHHeHHHHHHeHHk...',
    '...kHHHHHHHHHHHHk...',
    '....kHHHHHHHHHHk....',
    '....nn..kkkk..nn....',
    '...n............n...',
  ];
  const transpose = (rows) => [...rows[0]].map((_, x) => rows.map((row) => row[x]).join(''));
  const colors = { k: 'thornDark', l: 'thornDark', H: 'thornLight', e: 'ink', n: 'thornSpike', p: 'thorn', t: 'thornSpike', s: 'thornSoft' };
  const withPlates = (rows, n) => rows.map((row) => row.replace(/[1-3a-c]/g, (ch) => {
    const plate = '123'.includes(ch) ? Number(ch) : 'abc'.indexOf(ch) + 1;
    if (plate > n) return 's';
    return '123'.includes(ch) ? 'p' : 't';
  }));
  for (let n = 0; n <= 3; n += 1) {
    const down = withPlates(DOWN, n);
    VL.ART.defineSprite(`enemy-thornback-${n}-down`, { colors, rows: down });
    VL.ART.defineSprite(`enemy-thornback-${n}-up`, { colors, rows: down.slice().reverse() });
    VL.ART.defineSprite(`enemy-thornback-${n}-right`, { colors, rows: transpose(down) });
    VL.ART.defineSprite(`enemy-thornback-${n}-left`, { mirrorOf: `enemy-thornback-${n}-right` });
  }
  // On its back: belly up, legs waving (two frames).
  const BELLY = [
    '......kkkkkkkk......',
    '....kkbbbbbbbbkk....',
    '...kbbBBbbbbBBbbk...',
    '..kbbbbbbbbbbbbbbk..',
    '..kbbBBbbbbbbBBbbk..',
    '..kbbbbbbbbbbbbbbk..',
    '..kbbbbBBbbBBbbbbk..',
    '..kbbbbbbbbbbbbbbk..',
    '...kbbbbbbbbbbbbk...',
    '....kkbbbbbbbbkk....',
    '......kkkkkkkk......',
  ];
  const legs = (frame) => (frame
    ? ['.l..l..........l..l.', 'l..l............l..l']
    : ['l..l............l..l', '.l..l..........l..l.']);
  for (const frame of [0, 1]) {
    VL.ART.defineSprite(`enemy-thornback-flipped-${frame}`, {
      colors: { k: 'thornBellyDark', b: 'thornBelly', B: 'thornBellyDark', l: 'thornDark' },
      rows: [...legs(frame), ...BELLY, ...legs(1 - frame).reverse()],
    });
  }
  VL.ART.defineSprite('fx-thorn-plate', {
    colors: { p: 'thorn', P: 'thornLight', t: 'thornSpike', k: 'thornDark' },
    rows: ['.t..t.', 'kPPPPk', 'kpppPk', '.kkkk.'],
  });

  // ---------- sound ----------

  VL.defineSfx('thornStomp', [{ wave: 'noise', dur: 0.12, vol: 0.4, filter: { type: 'lowpass', freq: 300, to: 120 } }], { gap: 0.18 });
  VL.defineSfx('thornBonk', [
    { wave: 'square', freq: 140, to: 70, dur: 0.12, vol: 0.3 },
    { wave: 'noise', dur: 0.18, vol: 0.35, filter: { type: 'lowpass', freq: 600, to: 200 } },
  ], { gap: 0.3 });
  VL.defineSfx('thornFlip', [
    { wave: 'triangle', freq: 700, to: 1100, dur: 0.1, vol: 0.3 },
    { wave: 'triangle', freq: 1100, to: 500, at: 0.1, dur: 0.18, vol: 0.3 },
  ], { gap: 0.3 });
  VL.SOUND.onEvent('thornStomp', 'thornStomp');
  VL.SOUND.onEvent('thornBonk', 'thornBonk');
  VL.SOUND.onEvent('thornFlip', 'thornFlip');
  VL.SOUND.onEvent('thornTink', 'wormTink');

  // ---------- behaviour ----------

  function setMode(beetle, mode) {
    beetle.mode = mode;
    beetle.timer = 0;
  }

  const inLine = (state, beetle) => {
    const aim = VL.toHero(state, beetle);
    if (Math.abs(aim.dx) <= T.thornbackLine) return aim.dy < 0 ? 'up' : 'down';
    if (Math.abs(aim.dy) <= T.thornbackLine) return aim.dx < 0 ? 'left' : 'right';
    return null;
  };

  VL.defineEnemy('thornback', {
    tuning: 'enemyThornback',
    size: 'big',
    body: { w: 22, h: 16 },
    rooted: true,
    faint: 'The Thornback rolled right over you.',
    harmful: (beetle) => ['walk', 'aim', 'charge'].includes(beetle.mode),
    setup(state, beetle) {
      beetle.life = T.thornbackRoundLife;
      beetle.rounds = T.thornbackPlates;
      beetle.plates = T.thornbackPlates;
      beetle.facing = 'down';
      setMode(beetle, 'walk');
    },
    think(state, beetle, dt) {
      beetle.timer += dt;
      const mode = beetle.mode;
      if (mode === 'walk') {
        const aim = VL.toHero(state, beetle);
        const away = beetle.calm > 0 ? -1 : 1;
        const len = Math.max(1, aim.dist);
        if (aim.dist > 4) VL.moveEnemy(state, beetle, (aim.dx / len) * away * T.thornbackWalkSpeed * dt, (aim.dy / len) * away * T.thornbackWalkSpeed * dt);
        beetle.facing = aim.side;
        const line = inLine(state, beetle);
        if (line && beetle.calm <= 0 && beetle.timer >= T.thornbackWalkSeconds) {
          beetle.facing = line;
          setMode(beetle, 'aim');
          state.events.push({ type: 'thornStomp' });
        }
      } else if (mode === 'aim') {
        if (beetle.timer >= T.thornbackAimSeconds) setMode(beetle, 'charge');
      } else if (mode === 'charge') {
        const [dx, dy] = DIRS[beetle.facing];
        if (!VL.moveEnemy(state, beetle, dx * T.thornbackChargeSpeed * dt, dy * T.thornbackChargeSpeed * dt)) {
          setMode(beetle, 'bonk');
          state.events.push({ type: 'thornBonk' });
        }
      } else if (mode === 'bonk') {
        if (beetle.timer >= T.thornbackBonkSeconds) setMode(beetle, 'walk');
      } else if (mode === 'flipped') {
        if (beetle.timer >= T.thornbackFlippedSeconds) setMode(beetle, 'righting');
      } else if (mode === 'righting') {
        if (beetle.timer >= T.thornbackRightSeconds) setMode(beetle, 'walk');
      } else if (mode === 'dying' && beetle.timer >= T.thornbackDyingSeconds) {
        // Beaten for good, then gone: the framework crowns it.
        beetle.defeated = true;
        state.room.entities = state.room.entities.filter((e) => e !== beetle);
        state.room.entities.push({ type: 'poof', x: (beetle.cx - 8) / 16, y: (beetle.cy - 8) / 16, born: state.time, age: 0 });
        state.events.push({ type: 'enemyDefeated', enemy: 'thornback', drop: null });
      }
    },
    // The rope's hook: a plate flies off and it lands on its back. A round
    // whose flip ran out has lost its plate already.
    onHook(state, beetle) {
      if (['flipped', 'dying'].includes(beetle.mode)) return true;
      if (beetle.plates > 0 && beetle.plates >= beetle.rounds) {
        beetle.plates -= 1;
        const hero = VL.heroCentre(state);
        state.room.entities.push({ type: 'thornPlate', x: 0, y: 0, gx: beetle.cx, gy: beetle.cy, tx: hero.x, ty: hero.y, t: 0 });
      }
      setMode(beetle, 'flipped');
      state.events.push({ type: 'thornFlip' });
      return true;
    },
    // Its hp is refilled on every hit; only a hit while it is on its back
    // takes `life`.
    onHit(state, beetle) {
      const damage = VL.ENEMIES.thornback.hp - beetle.hp;
      beetle.hp = VL.ENEMIES.thornback.hp;
      if (beetle.mode !== 'flipped') {
        beetle.hurt = 0;
        state.events.push({ type: 'thornTink' });
        state.dungeonNote = { text: VL.THORNBACK_SWORD_NOTE, t: 0 };
        return;
      }
      beetle.life -= damage;
      if (beetle.life > 0) return;
      beetle.rounds -= 1;
      if (beetle.rounds <= 0) {
        setMode(beetle, 'dying');
        return;
      }
      beetle.life = T.thornbackRoundLife;
      setMode(beetle, 'righting');
      state.events.push({ type: 'thornStomp' });
    },
    draw(ctx, beetle, cx, cy, t) {
      if (beetle.mode === 'dying' && Math.floor(t * 16) % 2) return;
      VL.ART.drawShadow(ctx, cx, cy + 9, 22);
      if (['flipped', 'righting', 'dying'].includes(beetle.mode)) {
        const frame = beetle.mode === 'flipped' ? Math.floor(t * 8) % 2 : 0;
        VL.ART.drawSprite(ctx, `enemy-thornback-flipped-${frame}`, cx - 10, cy - 12 + (beetle.mode === 'righting' ? -2 : 0));
        if (beetle.mode === 'flipped') VL.ART.drawSparkle(ctx, cx + 8, cy - 12, t);
        return;
      }
      const shake = beetle.mode === 'aim' ? Math.round(Math.sin(t * 60)) : 0;
      const sprite = `enemy-thornback-${beetle.plates}-${beetle.facing}`;
      const { w, h } = VL.ART.sprite(sprite);
      VL.ART.drawSprite(ctx, sprite, Math.round(cx - w / 2) + shake, Math.round(cy - h / 2) - 2);
      if (beetle.mode === 'bonk') {
        for (let i = 0; i < 3; i += 1) {
          const a = t * 6 + (i * Math.PI * 2) / 3;
          VL.ART.rect(ctx, 'goldLight', Math.round(cx + Math.cos(a) * 9) - 1, Math.round(cy - 14 + Math.sin(a) * 3), 2, 2);
        }
      }
    },
  });

  // A plate the hook yanked off, tumbling towards the hero and gone.
  VL.defineEntity('thornPlate', {
    draw(ctx, plate, x, y) {
      const k = VL.clamp(plate.t / 0.5, 0, 1);
      const px = plate.gx + (plate.tx - plate.gx) * k * 0.6;
      const py = plate.gy + (plate.ty - plate.gy) * k * 0.6 - Math.sin(Math.PI * k) * 12;
      VL.ART.drawSprite(ctx, 'fx-thorn-plate', Math.round(x + px - 3), Math.round(y + py - 2));
    },
  });

  VL.defineSystem('thornPlates', {
    order: 36,
    update(state, actions, dt) {
      const plates = state.room.entities.filter((e) => e.type === 'thornPlate');
      for (const plate of plates) plate.t += dt;
      if (plates.some((plate) => plate.t >= 0.5)) state.room.entities = state.room.entities.filter((e) => e.type !== 'thornPlate' || e.t < 0.5);
    },
  });
})();
