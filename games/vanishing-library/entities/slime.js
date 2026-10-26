// { type: 'slime', x, y, tough? }: a field slime. It sits and wobbles, then
// hops: towards a hero who comes near, anywhere otherwise. A tough one (only
// the metal sword hurts it) wears woody thorns, as a tough spitter does.
(() => {
  VL.tune({ enemySlime: { hp: 2, damage: 1, hopSpeed: 31, hopSeconds: 0.45, rest: 0.7, sense: 80 } });
  const T = () => VL.TUNING.enemySlime;

  VL.ART.addColors({ slime: '#5cc48a', slimeLight: '#b8f0cc', slimeDark: '#2f8a5a' });
  const colors = { s: 'slime', L: 'slimeLight', d: 'slimeDark', e: 'ink' };
  VL.ART.defineSprite('enemy-slime', {
    colors,
    rows: ['....ssss....', '..ssLLssss..', '.ssLsssssss.', '.sssesssess.', 'ssssesssesss', 'ssssssssssss', 'sdssssssssds', '.dddddddddd.'],
  });
  VL.ART.defineSprite('enemy-slime-squash', {
    colors,
    rows: ['...ssssss...', '.sLLsssssss.', 'ssssesssesss', 'ssssssssssss', 'sdssssssssds', '.dddddddddd.'],
  });

  // Thorns poking out of its back, drawn under the body: [x, height] from its top-left.
  const THORNS = [[1, 3], [4, 4], [7, 4], [10, 3]];
  function thorns(ctx, x, y) {
    for (const [dx, h] of THORNS) VL.ART.rect(ctx, 'outline', x + dx - 1, y - h + 1, 3, h + 1);
    for (const [dx, h] of THORNS) {
      VL.ART.rect(ctx, 'bark', x + dx, y - h + 3, 1, h - 1);
      VL.ART.rect(ctx, 'woodLight', x + dx, y - h + 2, 1, 1);
    }
  }

  VL.defineEnemy('slime', {
    tuning: 'enemySlime',
    body: { w: 12, h: 8 },
    faint: 'You were out-wobbled by a slime.',
    setup(state, slime) {
      slime.mode = 'idle';
      slime.timer = T().rest * (0.5 + VL.random(state));
    },
    think(state, slime, dt) {
      slime.timer -= dt;
      if (slime.mode === 'idle') {
        if (slime.timer > 0) return;
        const hero = VL.toHero(state, slime);
        let angle = VL.random(state) * Math.PI * 2;
        if (slime.calm > 0) angle = Math.atan2(-hero.dy, -hero.dx);
        else if (hero.dist < T().sense) angle = Math.atan2(hero.dy, hero.dx);
        slime.vx = Math.cos(angle) * T().hopSpeed;
        slime.vy = Math.sin(angle) * T().hopSpeed;
        slime.mode = 'hop';
        slime.timer = T().hopSeconds;
        return;
      }
      const landed = !VL.moveEnemy(state, slime, slime.vx * dt, slime.vy * dt) || slime.timer <= 0;
      if (landed) {
        slime.mode = 'idle';
        slime.timer = T().rest * (0.8 + VL.random(state) * 0.8);
      }
    },
    draw(ctx, slime, cx, cy, t) {
      VL.ART.drawShadow(ctx, cx, cy + 5, 12);
      let top = cy - 4;
      let sprite = 'enemy-slime';
      if (slime.mode === 'hop') {
        const k = 1 - VL.clamp(slime.timer / T().hopSeconds, 0, 1);
        top = cy - 6 - Math.round(Math.sin(k * Math.PI) * 5);
      } else if (Math.floor(t * 3) % 2) {
        top = cy - 2;
        sprite = 'enemy-slime-squash';
      }
      if (slime.tough) thorns(ctx, cx - 6, top);
      VL.ART.drawSprite(ctx, sprite, cx - 6, top);
    },
  });
})();
