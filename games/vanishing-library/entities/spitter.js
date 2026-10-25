// { type: 'spitter', x, y }: a Woods plant rooted to its tile. It turns its
// mouth to a hero in range, puffs up as a warning, then spits a seed straight
// along that line, so stepping out of line or raising a shield beats it.
(() => {
  VL.tune({ enemySpitter: { hp: 2, damage: 1, range: 96, warn: 0.45, reload: 2.2, seedSpeed: 75 } });
  const T = () => VL.TUNING.enemySpitter;

  VL.ART.addColors({ spitter: '#b0569a', spitterLight: '#e79ad0', spitterDark: '#6e2d60' });

  // A round pod, lit top-left and shaded bottom-right like every sprite.
  function pod(size) {
    const r = size / 2;
    const rows = [];
    for (let y = 0; y < size; y += 1) {
      let row = '';
      for (let x = 0; x < size; x += 1) {
        const dx = x + 0.5 - r;
        const dy = y + 0.5 - r;
        const d = Math.hypot(dx, dy);
        if (d > r) row += '.';
        else if (Math.hypot(dx + r * 0.4, dy + r * 0.4) < r * 0.35) row += 'L';
        else if (dx + dy > r * 0.9) row += 'd';
        else row += 'p';
      }
      rows.push(row);
    }
    return rows;
  }
  const colors = { p: 'spitter', L: 'spitterLight', d: 'spitterDark' };
  VL.ART.defineSprite('enemy-spitter', { colors, rows: pod(10) });
  VL.ART.defineSprite('enemy-spitter-puff', { colors, rows: pod(12) });
  VL.ART.defineSprite('enemy-spitter-leaves', {
    outline: false,
    colors: { g: 'leaf', l: 'leafLight' },
    rows: ['gl..........lg', '.ggl......lgg.', '..gggl..lggg..', '....gggggg....'],
  });

  VL.defineSfx('spit', [
    { wave: 'noise', dur: 0.06, vol: 0.4, filter: { type: 'bandpass', freq: 1800, q: 2 } },
    { wave: 'square', freq: 700, to: 300, dur: 0.07, vol: 0.18 },
  ], { gap: 0.1 });
  VL.SOUND.onEvent('spit', 'spit');

  const AIM = { right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] };
  const THORNS = [[-0.7, -0.7], [0.7, -0.7], [-1, 0.1], [1, 0.1], [0, -1]];

  VL.defineEnemy('spitter', {
    tuning: 'enemySpitter',
    rooted: true,
    body: { w: 12, h: 12 },
    faint: 'A spitter plant pelted you with seeds.',
    setup(state, plant) {
      plant.mode = 'wait';
      plant.timer = 1;
      plant.aim = 'down';
    },
    think(state, plant, dt) {
      plant.timer -= dt;
      if (plant.mode === 'wait') {
        const hero = VL.toHero(state, plant);
        if (hero.dist < T().range * 1.5) plant.aim = hero.side;
        if (plant.timer <= 0 && !(plant.calm > 0) && hero.dist < T().range) {
          plant.mode = 'puff';
          plant.timer = T().warn;
        }
        return;
      }
      if (plant.timer > 0) return;
      const [ax, ay] = AIM[plant.aim];
      VL.spawnProjectile(state, {
        cx: plant.cx + ax * 7,
        cy: plant.cy + ay * 7,
        vx: ax * T().seedSpeed,
        vy: ay * T().seedSpeed,
        size: 'small',
        damage: VL.ENEMIES.spitter.damage,
        cause: 'spitter',
        sprite: 'fx-seed',
        owner: plant,
      });
      state.events.push({ type: 'spit' });
      plant.mode = 'wait';
      plant.timer = T().reload;
    },
    draw(ctx, plant, cx, cy) {
      VL.ART.drawShadow(ctx, cx, cy + 7, 12);
      VL.ART.drawSprite(ctx, 'enemy-spitter-leaves', cx - 7, cy + 3);
      const puffed = plant.mode === 'puff';
      const size = puffed ? 12 : 10;
      // A tough one (placed with `tough: true`) bristles with woody thorns.
      if (plant.tough) {
        const r = size / 2 + 1;
        for (const [tx, ty] of THORNS) {
          VL.ART.rect(ctx, 'outline', cx + tx * r - 2, cy - 2 + ty * r - 2, 4, 4);
          VL.ART.rect(ctx, 'bark', cx + tx * r - 1, cy - 2 + ty * r - 1, 2, 2);
        }
      }
      VL.ART.drawSprite(ctx, puffed ? 'enemy-spitter-puff' : 'enemy-spitter', cx - size / 2, cy - size / 2 - 2);
      // The mouth points where the next seed goes.
      const [ax, ay] = AIM[plant.aim] || AIM.down;
      const mx = cx + ax * (size / 2 - 1) - 1;
      const my = cy - 2 + ay * (size / 2 - 1) - 1;
      VL.ART.rect(ctx, 'outline', mx - 1, my - 1, 4, 4);
      VL.ART.rect(ctx, puffed ? 'berryLight' : 'doorway', mx, my, 2, 2);
    },
  });
})();
