// Spots and regions: the overworld's placement markers and named screen
// groups (README "Overworld map"). world.js's addScreens registers each
// screen's spots as it is added.

// ---------- spots ----------

// A spot is a named marker in a screen's entities, { type: 'spot', id, x, y,
// how, lock, by }: where item `by` puts its book, ore, door or chicken. That
// item swaps in its real entity with VL.fillSpot from its own file, so it
// never edits the region file. Fills and screens may load in either order.
(() => {
  VL.SPOTS = {};
  const pendingFills = {};

  function applyFill(id) {
    const spot = VL.SPOTS[id];
    const entities = VL.getScreen(spot.area, spot.screen).entities;
    const index = entities.findIndex((entity) => entity.type === 'spot' && entity.id === id);
    entities[index] = { ...pendingFills[id], x: spot.x, y: spot.y, spot: id };
    spot.filled = true;
    delete pendingFills[id];
  }

  VL.registerSpots = function registerSpots(areaId, key, screen) {
    for (const entity of screen.entities) {
      if (entity.type !== 'spot') continue;
      if (VL.SPOTS[entity.id]) throw new Error(`spot ${entity.id} is already placed`);
      if (!/^W\d+$/.test(entity.by || '')) throw new Error(`spot ${entity.id} must name the item that fills it (by: 'W…')`);
      VL.SPOTS[entity.id] = { ...entity, area: areaId, screen: key, filled: false };
      if (pendingFills[entity.id]) applyFill(entity.id);
    }
  };

  VL.fillSpot = function fillSpot(id, entity) {
    if (VL.SPOTS[id]?.filled || pendingFills[id]) throw new Error(`spot ${id} is already filled`);
    pendingFills[id] = entity;
    if (VL.SPOTS[id]) applyFill(id);
  };

  // Fills whose spot no region placed: a typo in an id, caught by the tests.
  VL.unplacedFills = () => Object.keys(pendingFills);
  // Spots no item has filled yet: tests/spot-ledger.test.js pins them by owner.
  VL.unfilledSpots = () => Object.values(VL.SPOTS).filter((spot) => !spot.filled).map((spot) => spot.id);

  // Picked up (or opened) at its spot. Permanent, so it lives in the saved
  // flags under the spot id. A book counts only once returned, which W11
  // decides; see README "Spots".
  VL.markFound = (state, id) => {
    state.flags[`found:${id}`] = true;
  };
  VL.spotFound = (state, id) => Boolean(state.flags[`found:${id}`]);
})();

// ---------- regions ----------

// Named groups of screens (town, woods, …), each optionally the place lock it
// opens.
VL.REGIONS = {};
VL.REGION_OF = {};

VL.defineRegion = function defineRegion(id, { area = 'overworld', screens, place = null }) {
  if (VL.REGIONS[id]) throw new Error(`region ${id} is already defined`);
  for (const key of screens) {
    const owner = VL.REGION_OF[`${area}:${key}`];
    if (owner) throw new Error(`screen ${area} ${key} is already in region ${owner}`);
    VL.REGION_OF[`${area}:${key}`] = id;
  }
  VL.REGIONS[id] = { id, area, screens: screens.slice(), place };
  return VL.REGIONS[id];
};

VL.regionOf = (area, key) => VL.REGION_OF[`${area}:${key}`] || null;

VL.regionVisited = (state, id) => {
  const region = VL.REGIONS[id];
  return region.screens.some((key) => Boolean(state.visited[`${region.area}:${key}`]));
};
