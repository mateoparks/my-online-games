// Tile legends. Each area names a tileset, so a region or dungeon can bring
// its own characters without clashing with another lane's.
VL.TILESETS = {};

VL.defineTileset = function defineTileset(id, legend) {
  VL.TILESETS[id] = legend;
  return legend;
};

VL.defineTileset('base', {
  '.': { grass: true },
  ',': { grass: true, flowers: true },
  s: { sand: true },
  P: { path: true },
  T: { solid: true, tree: true },
  R: { solid: true, rock: true },
  B: { solid: true, bush: true, cuttable: true },
  Y: { solid: true, bush: true, berry: true },
  W: { solid: true, water: true, flyOver: true },
  w: { shallow: true },
  X: { solid: true, fence: true },
  H: { solid: true, wall: true },
  D: { door: true },
  '#': { solid: true, wall: true, interior: true },
  _: { floor: true },
  m: { door: true, floor: true },
});
