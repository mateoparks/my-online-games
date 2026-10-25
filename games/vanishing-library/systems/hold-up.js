// The "hold it up" moment: whatever the hero is handed by a person or finds
// in a chest, he lifts over his head for a moment with a jingle before the
// popup names it, so a kid sees exactly what they got. Every reward calls
// VL.holdUp; the play scene freezes the world while he holds it. README
// "Hold it up".
(() => {
  VL.tune({ holdUpSeconds: 1 });

  // { sprites, t }: play state, so a reload mid-hold just skips the pose.
  VL.extendGame('holdUp', () => ({ holdUp: null }), { transient: true });

  VL.defineSfx('holdUpJingle', [
    { wave: 'triangle', freq: 659, at: 0, dur: 0.1, vol: 0.35 },
    { wave: 'triangle', freq: 880, at: 0.1, dur: 0.1, vol: 0.35 },
    { wave: 'triangle', freq: 1319, at: 0.2, dur: 0.35, vol: 0.3 },
    { wave: 'sine', freq: 1760, at: 0.2, dur: 0.35, vol: 0.12 },
  ], { gap: 0.5 });
  // A reward with its own fanfare (a heart container, a big chest) holds up quietly.
  VL.SOUND.onEvent('holdUp', (event) => (event.quiet ? null : 'holdUpJingle'));

  // The sprite an item is drawn with in the HUD, held up the same.
  VL.itemSprite = (id) => `item-${VL.ITEMS[id]?.icon}`;

  // Lifts `sprite` overhead. Several things given at once (the hut chest's
  // sword and shield) are held up side by side in one pose.
  VL.holdUp = function holdUp(state, sprite, { quiet = false } = {}) {
    if (!VL.ART.SPRITES[sprite]) throw new Error(`holdUp: no sprite ${sprite}`);
    if (state.holdUp) {
      if (!state.holdUp.sprites.includes(sprite)) state.holdUp.sprites.push(sprite);
      return;
    }
    state.holdUp = { sprites: [sprite], t: 0 };
    if (state.player) {
      state.player.facing = 'down';
      state.player.holding = true;
      state.player.swing = null;
    }
    state.events.push({ type: 'holdUp', sprite, quiet });
  };

  // Advances a hold by dt. 'raise' while the item is up (the world waits),
  // 'popup' once it is time to name it, null when there is no hold (any more).
  VL.tickHoldUp = function tickHoldUp(state, dt) {
    const hold = state.holdUp;
    if (!hold) return null;
    hold.t += dt;
    if (hold.t < VL.TUNING.holdUpSeconds) return 'raise';
    if (VL.currentPopup(state)) return 'popup';
    state.holdUp = null;
    if (state.player) state.player.holding = false;
    return null;
  };

  // Arms up, facing the player.
  const colors = { h: 'hair', H: 'hairLight', s: 'skin', S: 'skinShade', e: 'ink', t: 'tunic', d: 'tunicDark', l: 'tunicLight', b: 'boots' };
  VL.ART.defineSprite('hero-hold', {
    colors,
    rows: [
      '.s..hhhh..s.',
      '.s.hHHhhh.s.',
      '.shhhhhhhhs.',
      '.shsssssshs.',
      '.ssessssess.',
      '.ssssssssss.',
      '.l.SSSSSS.l.',
      '..lttttttl..',
      '..ttttbbtt..',
      '..tttttttt..',
      '..dddddddd..',
      '..ttt..ttt..',
      '..bb....bb..',
      '..bb....bb..',
    ],
  });
  const heroFrame = VL.ART.heroFrame;
  VL.ART.heroFrame = (player, t) => (player.holding ? { sprite: 'hero-hold', bob: 0 } : heroFrame(player, t));

  // The things held, side by side over his head, with a glint.
  VL.defineHeroLayer('holdUp', (ctx, state, x, y, t, pass) => {
    if (pass !== 'front' || !state.holdUp || !state.player.holding) return;
    const sprites = state.holdUp.sprites.map((id) => VL.ART.sprite(id));
    const gap = 3;
    const total = sprites.reduce((sum, s) => sum + s.w, 0) + gap * (sprites.length - 1);
    const rise = Math.min(1, state.holdUp.t / 0.15);
    let left = Math.round(x - total / 2);
    for (const [i, s] of sprites.entries()) {
      const top = Math.round(y - 12 - s.h - 2 * rise);
      VL.ART.drawSprite(ctx, state.holdUp.sprites[i], left, top);
      left += s.w + gap;
    }
    VL.ART.drawSparkle(ctx, x + Math.round(total / 2) + 2, y - 14 - Math.max(...sprites.map((s) => s.h)), t);
  });
})();
