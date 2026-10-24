// { type: 'pot', x, y, respawn? }: a clay pot, solid. With the Lifting
// Gloves S lifts it and S throws it (systems/lifting.js); `respawn` puts it
// back on its spot a few seconds after it was taken, for rooms whose puzzle
// or boss needs pots.
VL.defineEntity('pot', {
  solid: true,
  liftable: 'pot',
  draw(ctx, pot, x, y) {
    VL.ART.drawShadow(ctx, x + 8, y + 14, 11);
    VL.ART.drawSprite(ctx, 'prop-pot', x + 3, y + 4);
  },
});
