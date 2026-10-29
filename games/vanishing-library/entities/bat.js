// { type: 'bat', x, y }: a Woods bat. It dozes until the hero comes close,
// flutters at them in a wobbly line for a moment, flies off and dozes again.
// It flies, so trees don't stop it, but it never leaves its screen.
(() => {
  VL.tune({ enemyBat: { hp: 1, damage: 1, speed: 30, wake: 56, flutterSeconds: 2.4, leaveSeconds: 1.2, doze: 1.5 } });
  const T = () => VL.TUNING.enemyBat;

  VL.ART.addColors({ bat: '#5a4a7a', batLight: '#8f7bb8', batDark: '#2e2444' });
  const colors = { b: 'bat', L: 'batLight', w: 'batDark', e: 'goldLight', d: 'batDark' };
  VL.ART.defineSprite('enemy-bat-rest', { colors, rows: ['.b....b.', '.bbbbbb.', 'bbdbbdbb', 'bLbbbbdb', '.bbbbbb.', '..bbbb..', '...bb...'] });
  VL.ART.defineSprite('enemy-bat-0', {
    colors,
    rows: ['ww...b..b...ww', 'www..bbbb..www', '.wwwbebbebwww.', '..wwbLbbbbww..', '...wbbbbbbw...', '.....bbbb.....', '......bb......'],
  });
  VL.ART.defineSprite('enemy-bat-1', {
    colors,
    rows: ['.....b..b.....', '.....bbbb.....', '...wbebbebw...', '.wwwbLbbbbwww.', 'wwwwbbbbbbwwww', 'ww...bbbb...ww', 'w.....bb.....w'],
  });

  VL.defineEnemy('bat', {
    // Light enough for the rope to pull in (systems/grappling-rope.js).
    light: true,
    tuning: 'enemyBat',
    flies: true,
    body: { w: 10, h: 8 },
    faint: 'A bat flapped you silly.',
    harmful: (bat) => bat.mode !== 'rest',
    setup(state, bat) {
      bat.mode = 'rest';
      bat.timer = 0;
      bat.phase = 0;
    },
    onTouch(state, bat) {
      const hero = VL.toHero(state, bat);
      bat.vx = (-hero.dx / (hero.dist || 1)) * T().speed;
      bat.vy = (-hero.dy / (hero.dist || 1)) * T().speed;
      bat.mode = 'leave';
      bat.timer = T().leaveSeconds;
    },
    onHit(state, bat) {
      if (bat.mode === 'rest') bat.mode = 'flutter';
      bat.timer = T().flutterSeconds;
    },
    think(state, bat, dt) {
      bat.timer -= dt;
      bat.phase += dt;
      if (bat.mode === 'rest') {
        if (bat.timer <= 0 && !(bat.calm > 0) && VL.toHero(state, bat).dist < T().wake) {
          bat.mode = 'flutter';
          bat.timer = T().flutterSeconds;
        }
        return;
      }
      if (bat.mode === 'flutter') {
        const hero = VL.toHero(state, bat);
        const ux = hero.dx / (hero.dist || 1);
        const uy = hero.dy / (hero.dist || 1);
        const wobble = Math.sin(bat.phase * 7) * 34;
        VL.moveEnemy(state, bat, (ux * T().speed - uy * wobble) * dt, (uy * T().speed + ux * wobble) * dt);
        if (bat.timer <= 0) {
          const angle = VL.random(state) * Math.PI * 2;
          bat.vx = Math.cos(angle) * T().speed;
          bat.vy = Math.sin(angle) * T().speed;
          bat.mode = 'leave';
          bat.timer = T().leaveSeconds;
        }
        return;
      }
      if (!VL.moveEnemy(state, bat, bat.vx * dt, bat.vy * dt)) {
        bat.vx = -bat.vx;
        bat.vy = -bat.vy;
      }
      if (bat.timer <= 0) {
        bat.mode = 'rest';
        bat.timer = T().doze;
      }
    },
    draw(ctx, bat, cx, cy, t) {
      if (bat.mode === 'rest') {
        VL.ART.drawShadow(ctx, cx, cy + 6, 6);
        VL.ART.drawSprite(ctx, 'enemy-bat-rest', cx - 4, cy - 3 + (Math.floor(t * 1.5) % 2));
        return;
      }
      VL.ART.drawShadow(ctx, cx, cy + 9, 8);
      VL.ART.drawSprite(ctx, `enemy-bat-${Math.floor(t * 12) % 2}`, cx - 7, cy - 6);
    },
  });
})();
