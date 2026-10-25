// The raft and the oar (design: The path through the game, 5: "Rope + wood →
// raft, and wood or shells → oar"). Nell lashes the raft at the harbour once
// the shockwave has calmed the currents (regions/townsfolk.js, the `raftyard`
// shop in regions/buildings.js); Mabel sells an oar and Brannock makes one.
// With both, deep water is open ground: walk into it to push off, touch land
// to step ashore. README "Raft and water (W17)".
(() => {
  const { rect } = VL.ART;

  // ---------- art ----------

  VL.ART.addColors({ raftLash: '#e3cf9a' });
  const LOGS = { l: 'woodLight', w: 'wood', d: 'woodDark', r: 'raftLash' };
  // Seven logs side by side, lashed twice; seen from above, under his feet.
  VL.ART.defineSprite('prop-raft', {
    colors: LOGS,
    rows: [
      '.w..w..w..w..w..w..w.',
      'lwdlwdlwdlwdlwdlwdlwd',
      'rrrrrrrrrrrrrrrrrrrrr',
      'lwdlwdlwdlwdlwdlwdlwd',
      'lwdlwdlwdlwdlwdlwdlwd',
      'lwdlwdlwdlwdlwdlwdlwd',
      'lwdlwdlwdlwdlwdlwdlwd',
      'lwdlwdlwdlwdlwdlwdlwd',
      'rrrrrrrrrrrrrrrrrrrrr',
      'lwdlwdlwdlwdlwdlwdlwd',
      'lwdlwdlwdlwdlwdlwdlwd',
      '.d..d..d..d..d..d..d.',
    ],
  });
  VL.ART.defineSprite('item-raft', {
    colors: LOGS,
    rows: [
      '.w..w..w.',
      'lwdlwdlwd',
      'rrrrrrrrr',
      'lwdlwdlwd',
      'lwdlwdlwd',
      'rrrrrrrrr',
      '.d..d..d.',
    ],
  });
  VL.ART.defineSprite('item-oar', {
    colors: { l: 'woodLight', w: 'wood', d: 'woodDark' },
    rows: [
      '......lw',
      '.....lwd',
      '....wd..',
      '...wd...',
      '.lw.....',
      'lwwd....',
      'wwd.....',
      '.d......',
    ],
  });
  // The oar in his hands, blade down, upright beside him.
  VL.ART.defineSprite('fx-oar', {
    colors: { l: 'woodLight', w: 'wood', d: 'woodDark' },
    rows: ['lw', 'wd', 'wd', 'wd', 'wd', 'wd', 'wd', 'lwd', 'lwwd', 'lwwd', 'wwd', '.d'].map((row) => row.padEnd(4, '.')),
  });

  // ---------- the items ----------

  VL.defineItem('raft', {
    name: 'Raft',
    icon: 'raft',
    worn: true,
    about: 'Walk into deep water to paddle off. Touch land to step ashore.',
    popup: {
      title: 'You got a raft!',
      text: 'Nell lashed it with your rope. With an oar, walk into deep water to paddle off, and touch land to step ashore.',
    },
  });
  VL.defineItem('oar', {
    name: 'Oar',
    icon: 'oar',
    worn: true,
    about: 'Paddles a raft over deep water.',
    popup: { title: 'You got an oar!', text: 'It paddles a raft. With a raft, walk into deep water to push off.' },
  });

  VL.canRaft = (state) => VL.hasItem(state, 'raft') && VL.hasItem(state, 'oar');

  // Open water only: a dungeon's flooded floor is a pit, never sailed.
  const sailable = (info) => Boolean(info.water && !info.pit);
  VL.sailable = sailable;
  VL.defineHeroFooting('raft', (state, info) => sailable(info) && VL.canRaft(state));

  // On the raft while his feet are over water (he may still overlap the shore).
  VL.afloat = function afloat(state) {
    const { area, screen } = state.player;
    const { tx, ty } = VL.heroTile(state);
    return VL.canRaft(state) && sailable(VL.tileInfo(area, VL.tileAt(area, screen, tx, ty, state.room)));
  };

  // ---------- sailing ----------

  VL.tune({ raftPaddleSeconds: 0.5 });

  VL.defineSfx('raftSplash', [{ wave: 'noise', dur: 0.25, vol: 0.35, filter: { type: 'lowpass', freq: 1400, to: 300 } }], { gap: 0.2 });
  VL.defineSfx('raftPaddle', [{ wave: 'noise', dur: 0.12, vol: 0.18, filter: { type: 'bandpass', freq: 700, to: 400 } }], { gap: 0.2 });
  VL.SOUND.onEvent('raftLaunch', 'raftSplash');
  VL.SOUND.onEvent('raftLand', 'step');
  VL.SOUND.onEvent('raftPaddle', 'raftPaddle');

  VL.defineSystem('raft', {
    order: 11,
    update(state, actions, dt) {
      const player = state.player;
      const afloat = VL.afloat(state);
      if (afloat !== Boolean(player.afloat)) {
        player.afloat = afloat;
        player.paddle = 0;
        state.events.push({ type: afloat ? 'raftLaunch' : 'raftLand' });
      }
      if (afloat && player.moving) {
        player.paddle = (player.paddle || 0) + dt;
        if (player.paddle >= VL.TUNING.raftPaddleSeconds) {
          player.paddle -= VL.TUNING.raftPaddleSeconds;
          state.events.push({ type: 'raftPaddle' });
        }
      }
      oarless(state, actions);
    },
  });

  // Pushing against deep water with a raft but no oar says why, once a visit.
  function oarless(state, actions) {
    const player = state.player;
    if (state.room.oarTold || !VL.hasItem(state, 'raft') || VL.hasItem(state, 'oar')) return;
    if (!actions.held[player.facing] || player.flight || player.knockback || state.message) return;
    const ahead = VL.facingTile(state);
    if (!sailable(VL.tileInfo(player.area, VL.tileAt(player.area, player.screen, ahead.tx, ahead.ty, state.room)))) return;
    const [dx, dy] = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[player.facing];
    const { w, h } = VL.TUNING.heroBox;
    if (!VL.isBlocked(player.area, player.screen, player.x + dx * 0.5, player.y + dy * 0.5, w, h, state.room)) return;
    state.room.oarTold = true;
    VL.showMessage(state, { text: VL.OARLESS_TEXT });
  }
  VL.OARLESS_TEXT = 'The raft won\'t go far without an oar. Mabel sells them, and Brannock can make one from wood.';

  // ---------- drawing ----------

  VL.defineHeroLayer('raft', (ctx, state, x, y, t, pass) => {
    const player = state.player;
    if (!player.afloat || pass === 'overlay') return;
    const bob = Math.sin(t * 3) > 0 ? 1 : 0;
    if (pass === 'behind') {
      // Ripples spread round the logs; a wake trails while paddling.
      const ripple = Math.floor(t * 4) % 2;
      rect(ctx, 'foam', x - 13 - ripple, y + 3, 2, 1);
      rect(ctx, 'foam', x + 12 + ripple, y + 3, 2, 1);
      rect(ctx, 'waterLight', x - 9, y + 9 + bob, 18, 1);
      if (player.moving) {
        const [dx, dy] = { left: [1, 0], right: [-1, 0], up: [0, 1], down: [0, -1] }[player.facing];
        rect(ctx, 'foam', x + dx * 13 - 2, y + 2 + dy * 9, 4, 1);
        rect(ctx, 'foamDark', x + dx * 16 - 1, y + 3 + dy * 11, 2, 1);
      }
      VL.ART.drawSprite(ctx, 'prop-raft', x - 10, y - 4 + bob);
      return;
    }
    // The oar on his side away from where he looks; it dips while he paddles.
    const stroke = player.moving ? (Math.floor(t * 4) % 2) * 2 : 0;
    const side = player.facing === 'left' ? 4 : -9;
    VL.ART.drawSprite(ctx, 'fx-oar', x + side, y - 11 + bob + stroke);
  });

  // ---------- progression (README "Progression") ----------

  const doc = '§ The path through the game, 5';
  VL.defineLock('raft', {
    ...VL.LOCKS.raft,
    needs: [...VL.LOCKS.raft.needs, 'town'],
    replan: 'Nell lashes it on the harbour, in town',
    reached: (state) => VL.hasItem(state, 'raft'),
  });
  VL.defineLock('oar', { ...VL.LOCKS.oar, reached: (state) => VL.hasItem(state, 'oar') });
  // Sailing is access, not a possession: the solver works it out again from
  // the raft and the oar after every event, so an event that took either
  // would shut the water again.
  VL.defineLock('rafting', {
    ...VL.LOCKS.rafting,
    renewable: true,
    replan: 'repeatable access: it holds only while the raft and the oar are owned',
    doc,
    reached: VL.canRaft,
  });
})();
