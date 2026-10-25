// { type: 'grapplePost', x, y }: a wooden stake with an iron ring. Solid;
// the grappling rope's hook catches on it and pulls the hero to the tile in
// front of it (systems/grappling-rope.js). Put one on each side of a gap so
// the way back is never cut off.
(() => {
  VL.ART.defineSprite('prop-grapple-post', {
    colors: { o: 'outline', w: 'wood', d: 'woodDark', l: 'woodLight', m: 'metal', k: 'metalDark', h: 'white' },
    rows: [
      '..kmmk..',
      '.m.hh.m.',
      '.m....m.',
      '..kmmk..',
      '..lwwd..',
      '.lwwwdd.',
      '.lwwwdd.',
      '.lwwwdd.',
      '.lwwwdd.',
      '.lwwwdd.',
      '.ddddddd',
    ],
  });

  VL.defineEntity('grapplePost', {
    solid: true,
    hookable: true,
    passable: () => false,
    draw(ctx, post, x, y) {
      VL.ART.drawShadow(ctx, x + 8, y + 14, 10);
      VL.ART.drawSprite(ctx, 'prop-grapple-post', x + 4, y + 3);
    },
  });
})();
