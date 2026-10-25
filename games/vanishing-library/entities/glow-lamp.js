// { type: 'glowLamp', id, x, y }: an old lamp on an iron stand in a dark
// room. S with the Glowstone lights it for good (saved like a switch, in
// the dungeon's `switches`); a dark room whose lamps are all lit is lit
// (systems/darkness.js).
(() => {
  VL.ART.addColors({ lampIron: '#3a3f4a', lampIronLight: '#6a7180', lampFlame: '#ffcf5a', lampFlameLight: '#fff4c0' });

  const colors = { i: 'lampIron', l: 'lampIronLight', g: 'glowstoneDark', f: 'lampFlame', w: 'lampFlameLight', d: 'dgnStoneDark' };
  VL.ART.defineSprite('prop-glow-lamp', {
    colors,
    rows: [
      '..lll..',
      '.i...i.',
      '.i...i.',
      '.i...i.',
      '.iiiii.',
      '...i...',
      '...i...',
      '...i...',
      '..iii..',
      '.ddddd.',
    ],
  });
  VL.ART.defineSprite('prop-glow-lamp-lit', {
    colors,
    rows: [
      '..lll..',
      '.i.w.i.',
      '.iwfwi.',
      '.iffgi.',
      '.iiiii.',
      '...i...',
      '...i...',
      '...i...',
      '..iii..',
      '.ddddd.',
    ],
  });

  VL.LAMP_COLD = 'A cold old lamp. It needs a light to get it going.';

  VL.defineEntity('glowLamp', {
    solid: true,
    lightsRoom: true,
    glintsInDark: true,
    prepare(state, lamp) {
      const dungeon = VL.dungeonOfArea(state.player.area);
      lamp.on = Boolean(dungeon && VL.dungeonState(state, dungeon.id).switches[lamp.id]);
    },
    onInteract(state, lamp) {
      if (lamp.on) return;
      if (!VL.hasItem(state, 'glowstone')) {
        VL.showMessage(state, { text: VL.LAMP_COLD });
        return;
      }
      VL.throwSwitch(state, lamp);
      state.events.push({ type: 'lampLit' });
    },
    draw(ctx, lamp, x, y, t) {
      VL.ART.drawShadow(ctx, x + 8, y + 14, 8);
      VL.ART.drawSprite(ctx, lamp.on ? 'prop-glow-lamp-lit' : 'prop-glow-lamp', x + 4, y + 2);
      if (lamp.on && Math.floor(t * 6) % 2) VL.ART.rect(ctx, 'lampFlameLight', x + 8, y + 3, 1, 1);
    },
  });

  VL.defineSfx('lampLit', [
    { wave: 'noise', dur: 0.25, vol: 0.3, filter: { type: 'lowpass', freq: 900, to: 2400 } },
    { wave: 'triangle', freq: 330, to: 660, at: 0.05, dur: 0.25, vol: 0.25 },
  ], { gap: 0.2 });
  VL.SOUND.onEvent('lampLit', 'lampLit');
})();
