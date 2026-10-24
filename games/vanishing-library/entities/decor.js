// { type: 'decor', art, x, y, ... }: scenery bigger than a tile (buildings,
// the lighthouse, the water wheel, signboards), drawn over solid footprint
// tiles. Painters are registered by name from the region file that uses them.
VL.DECOR = {};

VL.defineDecor = function defineDecor(name, draw) {
  if (VL.DECOR[name]) throw new Error(`decor ${name} is already defined`);
  VL.DECOR[name] = draw;
};

VL.defineEntity('decor', {
  draw(ctx, entity, x, y, t) {
    const paint = VL.DECOR[entity.art];
    if (!paint) throw new Error(`no decor ${entity.art}`);
    paint(ctx, x, y, t, entity);
  },
});
