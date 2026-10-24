// { type: 'crab', x, y }: a beach crab. It scuttles sideways along its row,
// pauses, turns, and hurries at a hero who steps into its row nearby.
(() => {
  VL.tune({ enemyCrab: { hp: 2, damage: 1, speed: 26, chargeSpeed: 46, sense: 56 } });
  const T = () => VL.TUNING.enemyCrab;

  VL.ART.addColors({ crab: '#e0603a', crabLight: '#ffa77a', crabDark: '#a33a22' });
  const colors = { c: 'crab', L: 'crabLight', d: 'crabDark', e: 'ink' };
  const body = ['.cc......cc.', 'cLc......cLc', '.cc.e..e.cc.', '..cccccccc..', '.cLLccccccd.', '..ccccccdd..'];
  VL.ART.defineSprite('enemy-crab-0', { colors, rows: [...body, '.c.c....c.c.', 'c..c....c..c'] });
  VL.ART.defineSprite('enemy-crab-1', { colors, rows: [...body, '..c.c..c.c..', '.c..c..c..c.'] });
  // Claws open: drawn while it pauses, snapping.
  VL.ART.defineSprite('enemy-crab-snap', { colors, rows: ['c.c......c.c', 'cLc......cLc', '.cc.e..e.cc.', '..cccccccc..', '.cLLccccccd.', '..ccccccdd..', '.c.c....c.c.', 'c..c....c..c'] });

  VL.defineEnemy('crab', {
    tuning: 'enemyCrab',
    body: { w: 12, h: 8 },
    faint: 'A beach crab got the better of you.',
    setup(state, crab) {
      crab.mode = 'walk';
      crab.dir = VL.random(state) < 0.5 ? -1 : 1;
      crab.timer = 1 + VL.random(state);
    },
    think(state, crab, dt) {
      crab.timer -= dt;
      if (crab.mode === 'pause') {
        if (crab.timer > 0) return;
        crab.mode = 'walk';
        crab.dir = VL.random(state) < 0.5 ? -1 : 1;
        crab.timer = 1 + VL.random(state);
        return;
      }
      const hero = VL.toHero(state, crab);
      if (crab.calm > 0) {
        crab.dir = -Math.sign(hero.dx) || crab.dir;
        VL.moveEnemy(state, crab, crab.dir * T().speed * dt, 0);
        return;
      }
      const charging = Math.abs(hero.dy) < 10 && Math.abs(hero.dx) < T().sense;
      if (charging) crab.dir = Math.sign(hero.dx) || crab.dir;
      const speed = charging ? T().chargeSpeed : T().speed;
      if (!VL.moveEnemy(state, crab, crab.dir * speed * dt, 0)) crab.dir = -crab.dir;
      if (crab.timer <= 0 && !charging) {
        crab.mode = 'pause';
        crab.timer = 0.6;
      }
    },
    draw(ctx, crab, cx, cy, t) {
      VL.ART.drawShadow(ctx, cx, cy + 5, 12);
      const id = crab.mode === 'pause' ? (Math.floor(t * 4) % 2 ? 'enemy-crab-snap' : 'enemy-crab-0') : `enemy-crab-${Math.floor(t * 10) % 2}`;
      VL.ART.drawSprite(ctx, id, cx - 6, cy - 5);
    },
  });
})();
