// Tile legends. Each area names a tileset, so a region or dungeon can bring
// its own characters without clashing with another lane's.
VL.TILESETS = {};

VL.defineTileset = function defineTileset(id, legend) {
  if (VL.TILESETS[id]) throw new Error(`tileset ${id} is already defined`);
  VL.TILESETS[id] = legend;
  return legend;
};

// Add characters to an existing legend from a later file (e.g. ore, dig
// spots); a character another lane already took is an error, not a silent swap.
VL.extendTileset = function extendTileset(id, legend) {
  const target = VL.TILESETS[id];
  if (!target) throw new Error(`tileset ${id} is not defined`);
  for (const [ch, info] of Object.entries(legend)) {
    if (target[ch]) throw new Error(`tileset ${id} already has '${ch}'`);
    target[ch] = info;
  }
  return target;
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
