// { type: 'fireSpout', id, x, y, dir }: a stone dragon's head that breathes
// a ball of fire `dir`-wards whenever the hero stands in its line of sight.
// A switch only its own fire throws: bounced back by the Mirror Shield, the
// fire chokes it for good (saved like a switch), and the bars it names lift.
// Neither the sword, the rope nor a shot can throw it, so whatever it opens
// lies behind the Mirror Shield (README "The Dragon's Lair (W19)").
(() => {
  VL.tune({ spoutChargeSeconds: 0.8, spoutRestSeconds: 1.2, spoutFireSpeed: 72 });
  const T = VL.TUNING;
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  VL.SPOUT_WORDS = 'A stone dragon\'s head, warm to the touch. Its mouth is black with soot.';

  const colors = { o: 'outline', s: 'dgnStone', d: 'dgnStoneDark', l: 'dgnStoneLight', e: 'fireMid', k: 'ink', g: 'gold' };
  const head = [
    '.l......l.',
    '.ll....ll.',
    'lssssssssl',
    'sseksseksd',
    'ssssssssdd',
    'sdssssssdd',
    'sdkkkkkkdd',
    '.dkkkkkkd.',
    '..dddddd..',
  ];
  const cold = head.map((row) => row.replace(/e/g, 'd'));
  VL.ART.defineSprite('prop-fire-spout', { colors, rows: head });
  VL.ART.defineSprite('prop-fire-spout-cold', { colors, rows: cold });

  // Is the hero in its line, with nothing that stops fire in between?
  VL.spoutSees = function spoutSees(state, spout) {
    const [dx, dy] = DIRS[spout.dir] || DIRS.down;
    const hero = VL.heroTile(state);
    const along = dx ? hero.tx - spout.x : hero.ty - spout.y;
    const across = dx ? Math.abs(state.player.y - 5 - (spout.y * T.tile + 8)) : Math.abs(state.player.x - (spout.x * T.tile + 8));
    if (along * (dx || dy) <= 0 || across > 6) return false;
    for (let n = 1; n < Math.abs(along); n += 1) {
      if (VL.fireStops(state, spout.x + dx * n, spout.y + dy * n, spout)) return false;
    }
    return true;
  };

  function breathe(state, spout) {
    const [dx, dy] = DIRS[spout.dir] || DIRS.down;
    VL.spawnFire(state, {
      cx: spout.x * T.tile + 8 + dx * 10, cy: spout.y * T.tile + 8 + dy * 10,
      vx: dx * T.spoutFireSpeed, vy: dy * T.spoutFireSpeed, owner: spout,
    });
  }

  VL.defineEntity('fireSpout', {
    isSwitch: true,
    solid: true,
    prepare(state, spout) {
      const dungeon = VL.dungeonOfArea(state.player.area);
      spout.on = Boolean(dungeon && VL.dungeonState(state, dungeon.id).switches[spout.id]);
      spout.charge = 0;
      spout.rest = T.spoutRestSeconds / 2;
    },
    onInteract(state) {
      VL.showMessage(state, { text: VL.SPOUT_WORDS });
    },
    // Its own fire, bounced home: choked for good.
    onFire(state, spout, ball) {
      if (ball.owner !== spout || !VL.dungeonOf(state)) return;
      if (VL.throwSwitch(state, spout)) state.events.push({ type: 'spoutChoked' });
    },
    draw(ctx, spout, x, y, t) {
      VL.ART.drawShadow(ctx, x + 8, y + 15, 10);
      VL.ART.drawSprite(ctx, spout.on ? 'prop-fire-spout-cold' : 'prop-fire-spout', x + 3, y + 4);
      if (spout.on) {
        // A thread of smoke from the choked mouth.
        const k = (t * 0.7) % 1;
        VL.ART.rect(ctx, 'dgnStoneLight', x + 7 + Math.round(Math.sin(t * 3) * 1.5), y + 3 - Math.round(k * 4), 2, 1);
        return;
      }
      // The glow grows steadily as it draws breath (no blinking).
      const k = VL.clamp((spout.charge || 0) / T.spoutChargeSeconds, 0, 1);
      if (k > 0) {
        const r = Math.round(1 + k * 3);
        VL.ART.rect(ctx, 'fireMid', x + 8 - r, y + 11 - Math.floor(r / 2), r * 2, r);
        VL.ART.rect(ctx, 'fireCore', x + 7, y + 11, 2, 1);
      }
    },
  });

  VL.defineSfx('spoutChoke', [
    { wave: 'noise', dur: 0.5, vol: 0.3, filter: { type: 'lowpass', freq: 1200, to: 200 } },
    { wave: 'triangle', freq: 500, to: 160, at: 0.05, dur: 0.4, vol: 0.25 },
  ], { gap: 0.3 });
  VL.SOUND.onEvent('spoutChoked', 'spoutChoke');

  VL.defineSystem('fireSpouts', {
    order: 32,
    update(state, actions, dt) {
      if (state.hp <= 0) return;
      for (const spout of state.room.entities.filter((e) => e.type === 'fireSpout' && !e.on)) {
        if (spout.rest > 0) {
          spout.rest -= dt;
          continue;
        }
        if (spout.charge > 0 || VL.spoutSees(state, spout)) spout.charge += dt;
        if (spout.charge >= T.spoutChargeSeconds) {
          breathe(state, spout);
          spout.charge = 0;
          spout.rest = T.spoutRestSeconds;
        }
      }
    },
  });
})();
