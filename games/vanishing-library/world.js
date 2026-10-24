// Areas hold screens keyed 'x,y'. A screen is { tiles: string[rows], entities: [] }
// with entity x,y in tiles. Regions and dungeons add screens from their own files.
VL.AREAS = {};
VL.ENTITIES = {};
VL.START = null;

VL.defineArea = function defineArea(id, config = {}) {
  const area = VL.AREAS[id] || (VL.AREAS[id] = { id, tileset: 'base', screens: {} });
  if (config.tileset) area.tileset = config.tileset;
  if (config.screens) VL.addScreens(id, config.screens);
  return area;
};

VL.addScreens = function addScreens(areaId, screens) {
  const area = VL.defineArea(areaId);
  for (const [key, screen] of Object.entries(screens)) {
    if (area.screens[key]) throw new Error(`screen ${areaId} ${key} is already defined`);
    area.screens[key] = { tiles: screen.tiles, entities: screen.entities || [] };
    VL.registerSpots(areaId, key, area.screens[key]);
  }
};

// ---------- spots ----------

// A spot is a named marker in a screen's entities, { type: 'spot', id, x, y,
// how, lock? }: where a later item puts its book, ore, door or chicken. That
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

  // A find is permanent, so it lives in the saved flags under its spot id.
  VL.markFound = (state, id) => {
    state.flags[`found:${id}`] = true;
  };
  VL.spotFound = (state, id) => Boolean(state.flags[`found:${id}`]);
})();

// ---------- regions ----------

// Named groups of screens (town, woods, …), each optionally the place lock it
// opens. `softGate` names a key the region needs that is not a tile: the
// Woods maze lets you walk in, but only the copied map gets you through.
VL.REGIONS = {};
VL.REGION_OF = {};

VL.defineRegion = function defineRegion(id, { area = 'overworld', screens, place = null, softGate = null }) {
  if (VL.REGIONS[id]) throw new Error(`region ${id} is already defined`);
  for (const key of screens) {
    const owner = VL.REGION_OF[`${area}:${key}`];
    if (owner) throw new Error(`screen ${area} ${key} is already in region ${owner}`);
    VL.REGION_OF[`${area}:${key}`] = id;
  }
  VL.REGIONS[id] = { id, area, screens: screens.slice(), place, softGate };
  return VL.REGIONS[id];
};

VL.regionOf = (area, key) => VL.REGION_OF[`${area}:${key}`] || null;

VL.regionVisited = (state, id) => {
  const region = VL.REGIONS[id];
  return region.screens.some((key) => Boolean(state.visited[`${region.area}:${key}`]));
};

// Entity types: { onStand(state, entity), draw(ctx, entity, x, y, t), ... }.
VL.defineEntity = function defineEntity(type, hooks) {
  if (VL.ENTITIES[type]) throw new Error(`entity ${type} is already defined`);
  VL.ENTITIES[type] = hooks;
};

VL.setStart = function setStart(place) {
  VL.START = place;
};

VL.tileset = (areaId) => VL.TILESETS[VL.AREAS[areaId].tileset];

// Unknown characters count as solid so a typo in map data can't open a hole.
VL.tileInfo = (areaId, ch) => (ch === null ? { solid: true } : VL.tileset(areaId)[ch] || { solid: true });

VL.screenExists = (areaId, key) => Boolean(VL.AREAS[areaId]?.screens[key]);

VL.getScreen = function getScreen(areaId, key) {
  const screen = VL.AREAS[areaId]?.screens[key];
  if (!screen) throw new Error(`no screen ${areaId} ${key}`);
  return screen;
};

VL.neighborKey = function neighborKey(key, dx, dy) {
  const [x, y] = key.split(',').map(Number);
  return `${x + dx},${y + dy}`;
};

// A lookup just past an edge reads the neighbouring screen, so collision works
// across edges and the hero can only cross where both sides are open. Off the
// world, or diagonally past a corner, it returns null (solid).
VL.tileAt = function tileAt(areaId, key, tx, ty) {
  const { cols, rows } = VL.TUNING;
  const dx = tx < 0 ? -1 : tx >= cols ? 1 : 0;
  const dy = ty < 0 ? -1 : ty >= rows ? 1 : 0;
  if (dx && dy) return null;
  if (dx || dy) {
    const other = VL.neighborKey(key, dx, dy);
    if (!VL.screenExists(areaId, other)) return null;
    return VL.tileAt(areaId, other, tx - dx * cols, ty - dy * rows);
  }
  return VL.getScreen(areaId, key).tiles[ty][tx];
};

VL.isSolidAt = (areaId, key, tx, ty) => Boolean(VL.tileInfo(areaId, VL.tileAt(areaId, key, tx, ty)).solid);

// Does a box centred at (x, y) in play-area pixels overlap a solid tile?
VL.isBlocked = function isBlocked(areaId, key, x, y, w, h) {
  const { tile } = VL.TUNING;
  const left = Math.floor((x - w / 2) / tile);
  const right = Math.floor((x + w / 2 - 1e-6) / tile);
  const top = Math.floor((y - h / 2) / tile);
  const bottom = Math.floor((y + h / 2 - 1e-6) / tile);
  for (let ty = top; ty <= bottom; ty += 1) {
    for (let tx = left; tx <= right; tx += 1) {
      if (VL.isSolidAt(areaId, key, tx, ty)) return true;
    }
  }
  return false;
};

// Feet position for standing on a tile: the hero's feet box sits in the
// bottom half of the tile, so the sprite reads as standing on it.
VL.tileCenter = (tx, ty) => ({ x: tx * VL.TUNING.tile + VL.TUNING.tile / 2, y: ty * VL.TUNING.tile + 12 });

VL.tileOf = (x, y) => ({ tx: Math.floor(x / VL.TUNING.tile), ty: Math.floor(y / VL.TUNING.tile) });
