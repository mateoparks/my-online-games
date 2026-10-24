// The Bookworm, the Old Scriptorium's boss (design: The path through the
// game, 2): it burrows under the floor, rumbles at the hole nearest the hero
// (never the one under him), rears up and spits paper wads, then dives
// again. A sword only bounces off its paper armour; a thrown pot on its head
// makes it flinch and dive. Three pots and it is beaten: it is marked
// `defeated` before it leaves the room (README "Dungeons", the boss room).
(() => {
  VL.tune({
    enemyBookworm: { hp: 50, damage: 2 },
    bookwormHits: 3,
    bookwormTravelSeconds: 1.1,
    bookwormRumbleSeconds: 0.9,
    bookwormUpSeconds: 2.8,
    bookwormUpFaster: 0.5,
    bookwormSpitSeconds: 1,
    bookwormSpitSpeed: 64,
    bookwormHurtSeconds: 0.7,
    bookwormDiveSeconds: 0.35,
    bookwormDyingSeconds: 1.6,
    bookwormNearest: 30,
  });
  const T = VL.TUNING;
  const OFF = -200;

  VL.ART.addColors({
    worm: '#e7a24d',
    wormLight: '#ffd28a',
    wormDark: '#a8622a',
    wormPaper: '#f3ecd7',
    wormPaperDark: '#c9bd98',
    wormHole: '#140f0c',
  });
  VL.ART.defineSprite('enemy-bookworm', {
    colors: { w: 'worm', l: 'wormLight', d: 'wormDark', p: 'wormPaper', q: 'wormPaperDark', g: 'metalDark', e: 'ink', h: 'white', r: 'heart' },
    rows: [
      '....pppppppp....',
      '...pqqqqqqqqp...',
      '..wwwwwwwwwwww..',
      '.wllwwwwwwwwwdw.',
      '.wgggggwwgggggw.',
      'wgh.e.gggh.e.gdw',
      'wg...eg.g...egdw',
      'wwgggggwwgggggdw',
      'wwwwwwwwwwwwwwdw',
      '.wwwwrrrrrrwwdw.',
      '.wwwwwrrrrwwwdw.',
      '..wwwwwwwwwwdd..',
      '...pqpqpqpqpq...',
    ],
  });
  VL.ART.defineSprite('enemy-bookworm-ouch', {
    colors: { w: 'worm', l: 'wormLight', d: 'wormDark', p: 'wormPaper', q: 'wormPaperDark', g: 'metalDark', e: 'ink', h: 'white', r: 'heart' },
    rows: [
      '....pppppppp....',
      '...pqqqqqqqqp...',
      '..wwwwwwwwwwww..',
      '.wllwwwwwwwwwdw.',
      '.wgggggwwgggggw.',
      'wge...egge...edw',
      'wg.eee.g.eee.gdw',
      'wwgggggwwgggggdw',
      'wwwwwwwwwwwwwwdw',
      '.wwwwwwrrwwwwdw.',
      '.wwwwwrwwrwwwdw.',
      '..wwwwwwwwwwdd..',
      '...pqpqpqpqpq...',
    ],
  });
  VL.ART.defineSprite('enemy-bookworm-segment', {
    colors: { w: 'worm', l: 'wormLight', d: 'wormDark', p: 'wormPaper', q: 'wormPaperDark' },
    rows: ['..pppppp..', '.pqqqqqqp.', 'wwlwwwwwdw', 'wllwwwwwdw', 'wwwwwwwwdw', '.wwwwwwdd.'],
  });
  VL.ART.defineSprite('shot-paper', {
    colors: { p: 'wormPaper', q: 'wormPaperDark', e: 'ink' },
    rows: ['.pp.', 'pqep', 'peqp', '.pp.'],
  });

  VL.defineSfx('wormRumble', [{ wave: 'noise', dur: 0.5, vol: 0.35, filter: { type: 'lowpass', freq: 260, to: 120 } }], { gap: 0.4 });
  VL.defineSfx('wormTink', [{ wave: 'triangle', freq: 1500, to: 1100, dur: 0.07, vol: 0.25 }, { wave: 'noise', dur: 0.05, vol: 0.2, filter: { type: 'highpass', freq: 2500 } }], { gap: 0.1 });
  VL.defineSfx('wormSpit', [{ wave: 'square', freq: 500, to: 260, dur: 0.08, vol: 0.18, filter: { type: 'lowpass', freq: 1400 } }], { gap: 0.1 });
  VL.SOUND.onEvent('wormRumble', 'wormRumble');
  VL.SOUND.onEvent('wormTink', 'wormTink');
  VL.SOUND.onEvent('wormSpit', 'wormSpit');
  VL.SOUND.onEvent('wormSurface', 'dungeonBlock');

  // Read from the map: setup runs while the room is still being built.
  const holesOf = (state) => {
    const { area, screen } = state.player;
    const holes = [];
    for (let ty = 0; ty < T.rows; ty += 1) {
      for (let tx = 0; tx < T.cols; tx += 1) {
        if (VL.tileInfo(area, VL.tileAt(area, screen, tx, ty)).hole) holes.push({ x: tx * T.tile + 8, y: ty * T.tile + 8 });
      }
    }
    return holes;
  };

  // The hole nearest the hero that is not right under him, so it surfaces
  // close enough to hit and never on top of him.
  VL.bookwormNextHole = function bookwormNextHole(state, worm) {
    const hero = VL.heroCentre(state);
    const choices = worm.holes.filter((hole) => hole.x !== worm.at.x || hole.y !== worm.at.y);
    const dist = (hole) => Math.hypot(hole.x - hero.x, hole.y - hero.y);
    const clear = choices.filter((hole) => dist(hole) >= T.bookwormNearest);
    if (clear.length) return clear.reduce((best, hole) => (dist(hole) < dist(best) ? hole : best));
    return choices.reduce((best, hole) => (dist(hole) > dist(best) ? hole : best));
  };

  // Out of the sword's and the throws' reach unless it is above ground.
  function place(worm) {
    const out = worm.mode === 'up' || worm.mode === 'hurt';
    worm.cx = out ? worm.at.x : OFF;
    worm.cy = out ? worm.at.y : OFF;
  }

  function setMode(worm, mode) {
    worm.mode = mode;
    worm.timer = 0;
    worm.spit = 0;
    worm.spat = false;
    place(worm);
  }

  VL.defineEnemy('bookworm', {
    tuning: 'enemyBookworm',
    size: 'big',
    body: { w: 14, h: 14 },
    rooted: true,
    faint: 'The Bookworm gave you a nasty nibble.',
    harmful: (worm) => worm.mode === 'up',
    setup(state, worm) {
      worm.holes = holesOf(state);
      worm.at = { x: worm.cx, y: worm.cy };
      worm.from = { ...worm.at };
      worm.to = { ...worm.at };
      worm.hits = 0;
      setMode(worm, 'under');
    },
    think(state, worm, dt) {
      worm.timer += dt;
      if (worm.mode === 'under') {
        const k = VL.clamp(worm.timer / T.bookwormTravelSeconds, 0, 1);
        worm.dust = { x: worm.from.x + (worm.to.x - worm.from.x) * k, y: worm.from.y + (worm.to.y - worm.from.y) * k };
        if (k >= 1) {
          worm.at = { ...worm.to };
          setMode(worm, 'rumble');
          state.events.push({ type: 'wormRumble' });
        }
      } else if (worm.mode === 'rumble') {
        if (worm.timer >= T.bookwormRumbleSeconds) {
          setMode(worm, 'up');
          state.events.push({ type: 'wormSurface' });
        }
      } else if (worm.mode === 'up') {
        // One paper wad per surfacing, aimed where the hero stands.
        worm.spit += dt;
        if (worm.spit >= T.bookwormSpitSeconds && !worm.spat) {
          worm.spat = true;
          const aim = VL.toHero(state, worm);
          const speed = T.bookwormSpitSpeed / Math.max(1, aim.dist);
          if (aim.dist >= 1) VL.spawnProjectile(state, { cx: worm.cx, cy: worm.cy, vx: aim.dx * speed, vy: aim.dy * speed, size: 'small', damage: 1, cause: 'bookworm', sprite: 'shot-paper', owner: worm });
          state.events.push({ type: 'wormSpit' });
        }
        if (worm.timer >= Math.max(1.2, T.bookwormUpSeconds - worm.hits * T.bookwormUpFaster)) setMode(worm, 'down');
      } else if (worm.mode === 'hurt') {
        if (worm.timer >= T.bookwormHurtSeconds) setMode(worm, 'down');
      } else if (worm.mode === 'down') {
        if (worm.timer >= T.bookwormDiveSeconds) {
          worm.from = { ...worm.at };
          worm.to = VL.bookwormNextHole(state, worm);
          setMode(worm, 'under');
        }
      } else if (worm.mode === 'dying' && worm.timer >= T.bookwormDyingSeconds) {
        // Beaten for good, then gone: the framework crowns it (README "Dungeons").
        worm.defeated = true;
        state.room.entities = state.room.entities.filter((e) => e !== worm);
        state.room.entities.push({ type: 'poof', x: (worm.at.x - 8) / 16, y: (worm.at.y - 8) / 16, born: state.time, age: 0 });
        state.events.push({ type: 'enemyDefeated', enemy: 'bookworm', drop: null });
      }
    },
    // Only a thrown pot (or rock) hurts it; a sword bounces off. Its hp never
    // runs down: the hits are counted here.
    onHit(state, worm) {
      worm.hp = VL.ENEMIES.bookworm.hp;
      if (worm.struckBy !== 'throw') {
        worm.hurt = 0;
        state.events.push({ type: 'wormTink' });
        state.dungeonNote = { text: 'Its paper armour is too tough for a sword!', t: 0 };
        return;
      }
      worm.hits += 1;
      setMode(worm, worm.hits >= T.bookwormHits ? 'dying' : 'hurt');
      if (worm.mode === 'dying') {
        worm.cx = worm.at.x;
        worm.cy = worm.at.y;
      }
    },
    draw(ctx, worm, cx, cy, t) {
      const x = cx + (worm.at.x - worm.cx);
      const y = cy + (worm.at.y - worm.cy);
      if (worm.mode === 'under') {
        const dx = cx + ((worm.dust || worm.at).x - worm.cx);
        const dy = cy + ((worm.dust || worm.at).y - worm.cy);
        for (let i = 0; i < 4; i += 1) VL.ART.rect(ctx, i % 2 ? 'wormPaperDark' : 'floorDark', Math.round(dx - 6 + i * 3 + Math.sin(t * 20 + i) * 1), Math.round(dy + 2 - (i % 2) * 2), 3, 2);
        return;
      }
      const shake = worm.mode === 'rumble' ? Math.round(Math.sin(t * 50)) : 0;
      VL.ART.rect(ctx, 'wormHole', x - 7 + shake, y + 2, 14, 5);
      if (worm.mode === 'rumble') {
        for (let i = 0; i < 3; i += 1) VL.ART.rect(ctx, 'wormPaper', x - 6 + i * 5, y - 2 - Math.round(Math.abs(Math.sin(t * 9 + i)) * 4), 2, 2);
        return;
      }
      const rise = worm.mode === 'down' ? 1 - VL.clamp(worm.timer / T.bookwormDiveSeconds, 0, 1) : worm.mode === 'dying' ? 1 - VL.clamp((worm.timer - 1.1) / 0.5, 0, 1) : 1;
      const sway = worm.mode === 'up' ? Math.round(Math.sin(t * 4) * 2) : 0;
      const top = y - Math.round(18 * rise);
      if (worm.mode === 'dying' && Math.floor(t * 16) % 2) return;
      VL.ART.drawSprite(ctx, 'enemy-bookworm-segment', x - 5, y - 2 - Math.round(4 * rise));
      VL.ART.drawSprite(ctx, 'enemy-bookworm-segment', x - 5 + Math.round(sway / 2), y - 2 - Math.round(10 * rise));
      VL.ART.drawSprite(ctx, worm.mode === 'hurt' || worm.mode === 'dying' ? 'enemy-bookworm-ouch' : 'enemy-bookworm', x - 8 + sway, top - 12);
    },
  });
})();
