// { type: 'gull', x, y }: a cliff gull. It wheels over its spot, squawks and
// hangs in the air as a warning, then dives at where the hero stood and
// climbs back. Only the dive hurts, and it is too big for a wood shield.
(() => {
  VL.tune({ enemyGull: { hp: 2, damage: 1, sense: 112, circleSpeed: 40, diveSpeed: 120, riseSpeed: 45, warn: 0.6, between: 2 } });
  const T = () => VL.TUNING.enemyGull;
  const HIGH = 14;

  const colors = { f: 'metalDark', w: 'white', e: 'ink', y: 'gold', d: 'feather' };
  VL.ART.defineSprite('enemy-gull-0', {
    colors,
    rows: ['f............f', 'ff..........ff', '.ff...ww...ff.', '..fffwwwwfff..', '....wwewwy....', '.....wwww.....', '......dd......'],
  });
  VL.ART.defineSprite('enemy-gull-1', {
    colors,
    rows: ['......ww......', '.....wewwy....', 'fffwwwwwwwwfff', 'ff..wwwwww..ff', 'f....wwww....f', '......dd......'],
  });
  VL.ART.defineSprite('enemy-gull-dive', {
    colors,
    rows: ['...ww...', '..wewy..', '.fwwwwf.', 'ffwwwwff', 'f.wwww.f', '..wwww..', '...ww...', '...dd...'],
  });

  VL.defineSfx('squawk', [
    { wave: 'sawtooth', freq: 900, to: 650, dur: 0.12, vol: 0.12, filter: { type: 'bandpass', freq: 1400, q: 1.5 } },
    { wave: 'sawtooth', freq: 1000, to: 600, at: 0.14, dur: 0.16, vol: 0.12, filter: { type: 'bandpass', freq: 1400, q: 1.5 } },
  ], { gap: 0.4 });
  VL.SOUND.onEvent('squawk', 'squawk');

  function toward(state, gull, target, speed, dt) {
    const dx = target.x - gull.cx;
    const dy = target.y - gull.cy;
    const dist = Math.hypot(dx, dy);
    const stepSize = Math.min(dist, speed * dt);
    if (dist > 1e-6) VL.moveEnemy(state, gull, (dx / dist) * stepSize, (dy / dist) * stepSize);
    return dist - stepSize;
  }

  VL.defineEnemy('gull', {
    tuning: 'enemyGull',
    flies: true,
    size: 'big',
    body: { w: 12, h: 8 },
    faint: 'A cliff gull swooped down on you.',
    harmful: (gull) => gull.mode === 'dive',
    setup(state, gull) {
      gull.mode = 'circle';
      gull.timer = 1.5 + VL.random(state);
      gull.angle = VL.random(state) * Math.PI * 2;
      gull.alt = HIGH;
    },
    onTouch(state, gull) {
      gull.mode = 'rise';
    },
    onHit(state, gull) {
      gull.mode = 'rise';
    },
    think(state, gull, dt) {
      gull.timer -= dt;
      if (gull.mode === 'circle') {
        gull.angle += dt * 1.6;
        const target = { x: gull.home.x + Math.cos(gull.angle) * 20, y: gull.home.y + Math.sin(gull.angle) * 10 };
        toward(state, gull, target, T().circleSpeed, dt);
        if (gull.timer <= 0 && !(gull.calm > 0) && VL.toHero(state, gull).dist < T().sense) {
          gull.mode = 'aim';
          gull.timer = T().warn;
          state.events.push({ type: 'squawk' });
        }
      } else if (gull.mode === 'aim') {
        if (gull.timer > 0) return;
        const hero = VL.toHero(state, gull);
        gull.target = { x: gull.cx + hero.dx * 1.3, y: gull.cy + hero.dy * 1.3 };
        gull.mode = 'dive';
      } else if (gull.mode === 'dive') {
        gull.alt = Math.max(2, gull.alt - dt * 40);
        const before = [gull.cx, gull.cy];
        const left = toward(state, gull, gull.target, T().diveSpeed, dt);
        if (left <= 0.5 || (before[0] === gull.cx && before[1] === gull.cy)) gull.mode = 'rise';
      } else {
        gull.alt = Math.min(HIGH, gull.alt + dt * 20);
        if (toward(state, gull, gull.home, T().riseSpeed, dt) <= 0.5) {
          gull.mode = 'circle';
          gull.timer = T().between + VL.random(state);
        }
      }
    },
    draw(ctx, gull, cx, cy, t) {
      const alt = Math.round(gull.alt ?? HIGH);
      VL.ART.drawShadow(ctx, cx, cy + 5, gull.mode === 'dive' ? 10 : 8);
      if (gull.mode === 'dive') {
        VL.ART.drawSprite(ctx, 'enemy-gull-dive', cx - 4, cy - 5 - alt);
        return;
      }
      const flap = gull.mode === 'aim' ? Math.floor(t * 16) % 2 : Math.floor(t * 5) % 2;
      VL.ART.drawSprite(ctx, `enemy-gull-${flap}`, cx - 7, cy - 4 - alt);
    },
  });
})();
