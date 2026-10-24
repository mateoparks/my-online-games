// { type: 'sign', x, y, text, title? }: a solid signpost; S facing it shows
// its words in a popup every time.
(() => {
  VL.ART.defineSprite('prop-sign', {
    colors: { d: 'woodDark', w: 'wood', l: 'woodLight' },
    rows: [
      'llllllllllll',
      'lwwwwwwwwwwd',
      'lwddwdddwwwd',
      'lwwwwwwwwwwd',
      'lwdddwddddwd',
      'lwwwwwwwwwwd',
      'dddddddddddd',
      '.....ld.....',
      '.....ld.....',
      '.....ld.....',
    ],
  });

  VL.defineEntity('sign', {
    solid: true,
    onInteract(state, sign) {
      VL.showMessage(state, { title: sign.title || null, text: sign.text });
      state.events.push({ type: 'read' });
    },
    draw(ctx, sign, x, y) {
      VL.ART.drawShadow(ctx, x + 8, y + 13, 8);
      VL.ART.drawSprite(ctx, 'prop-sign', x + 2, y + 4);
    },
  });
})();
