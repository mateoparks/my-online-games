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
// world, or diagonally past a corner, it returns null (solid). `room`
// (state.room) applies this visit's changes to its own screen: a cut bush,
// a picked berry bush (VL.setRoomTile).
VL.tileAt = function tileAt(areaId, key, tx, ty, room) {
  const { cols, rows } = VL.TUNING;
  const dx = tx < 0 ? -1 : tx >= cols ? 1 : 0;
  const dy = ty < 0 ? -1 : ty >= rows ? 1 : 0;
  if (dx && dy) return null;
  if (dx || dy) {
    const other = VL.neighborKey(key, dx, dy);
    if (!VL.screenExists(areaId, other)) return null;
    return VL.tileAt(areaId, other, tx - dx * cols, ty - dy * rows, room);
  }
  const changed = room && room.area === areaId && room.screen === key ? room.tiles?.[`${tx},${ty}`] : undefined;
  return changed ?? VL.getScreen(areaId, key).tiles[ty][tx];
};

VL.setRoomTile = function setRoomTile(state, tx, ty, ch) {
  state.room.tiles[`${tx},${ty}`] = ch;
};

// With `room`, the visit's solid entities (a chest, a sign) block too.
VL.isSolidAt = function isSolidAt(areaId, key, tx, ty, room) {
  if (VL.tileInfo(areaId, VL.tileAt(areaId, key, tx, ty, room)).solid) return true;
  if (!room || room.area !== areaId || room.screen !== key) return false;
  return room.entities.some((e) => e.x === tx && e.y === ty && (e.solid || VL.ENTITIES[e.type]?.solid));
};

// Does a box centred at (x, y) in play-area pixels overlap a solid tile?
VL.isBlocked = function isBlocked(areaId, key, x, y, w, h, room) {
  const { tile } = VL.TUNING;
  const left = Math.floor((x - w / 2) / tile);
  const right = Math.floor((x + w / 2 - 1e-6) / tile);
  const top = Math.floor((y - h / 2) / tile);
  const bottom = Math.floor((y + h / 2 - 1e-6) / tile);
  for (let ty = top; ty <= bottom; ty += 1) {
    for (let tx = left; tx <= right; tx += 1) {
      if (VL.isSolidAt(areaId, key, tx, ty, room)) return true;
    }
  }
  return false;
};

// Feet position for standing on a tile: the hero's feet box sits in the
// bottom half of the tile, so the sprite reads as standing on it.
VL.tileCenter = (tx, ty) => ({ x: tx * VL.TUNING.tile + VL.TUNING.tile / 2, y: ty * VL.TUNING.tile + 12 });

VL.tileOf = (x, y) => ({ tx: Math.floor(x / VL.TUNING.tile), ty: Math.floor(y / VL.TUNING.tile) });
