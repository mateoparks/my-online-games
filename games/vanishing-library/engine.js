// The world update pipeline: systems registered from their own files run in
// order each step. Scenes (app.js) decide when the world updates at all.
VL.SYSTEMS = [];

VL.defineSystem = function defineSystem(id, system) {
  if (VL.SYSTEMS.some((other) => other.id === id)) throw new Error(`system ${id} is already defined`);
  const entry = { id, order: 100, ...system };
  const index = VL.SYSTEMS.findIndex((other) => other.order > entry.order);
  VL.SYSTEMS.splice(index === -1 ? VL.SYSTEMS.length : index, 0, entry);
  return entry;
};

// Place = { area, screen, tx, ty, facing? } in tiles, or x, y in pixels.
VL.place = function place(state, where) {
  VL.enterScreen(state, where);
};

VL.enterScreen = function enterScreen(state, where, slideDir) {
  const screen = VL.getScreen(where.area, where.screen);
  const player = state.player;
  if (slideDir) {
    // The outgoing screen slides out as the hero left it (a cut bush stays cut).
    state.transition = {
      dir: slideDir,
      t: 0,
      duration: VL.TUNING.slideSeconds,
      from: { area: player.area, screen: player.screen, room: state.room },
    };
  }
  const spot = where.x === undefined ? VL.tileCenter(where.tx, where.ty) : where;
  player.area = where.area;
  player.screen = where.screen;
  player.x = spot.x;
  player.y = spot.y;
  if (where.facing) player.facing = where.facing;
  const first = !state.visited[`${where.area}:${where.screen}`];
  state.visited[`${where.area}:${where.screen}`] = true;
  // `prepare(state, copy)` lets an entity type set up this visit's copy (an
  // opened chest) or leave it out by returning false (an ore lump already taken).
  state.room = {
    area: where.area,
    screen: where.screen,
    entities: screen.entities.map((entity) => ({ ...entity })).filter((entity) => VL.ENTITIES[entity.type]?.prepare?.(state, entity) !== false),
    standingOn: null,
    tiles: {},
  };
  for (const hook of VL.ROOM_HOOKS) hook(state);
  state.events.push({ type: 'enterScreen', area: where.area, screen: where.screen, first });
};

// Runs once a screen's room is built, before it is drawn or anything moves:
// a framework applies saved changes to the room here (dungeon tile changes,
// doors and shutters settled), so a screen slides in already changed.
VL.ROOM_HOOKS = [];
VL.onRoomBuilt = function onRoomBuilt(hook) {
  VL.ROOM_HOOKS.push(hook);
};

VL.heroTile = (state) => VL.tileOf(state.player.x, state.player.y);

// Things drawn with the hero (a sword swing, a raised shield): `draw(ctx,
// state, x, y, t, pass)` runs once with pass 'behind' and once with 'front',
// (x, y) being where the hero's feet are drawn.
VL.HERO_LAYERS = [];

VL.defineHeroLayer = function defineHeroLayer(id, draw) {
  if (VL.HERO_LAYERS.some((layer) => layer.id === id)) throw new Error(`hero layer ${id} is already defined`);
  VL.HERO_LAYERS.push({ id, draw });
};

VL.updateWorld = function updateWorld(state, actions, dt) {
  dt = Math.min(dt, VL.TUNING.maxDt);
  state.events.length = 0;
  state.time += dt;
  const transition = state.transition;
  if (transition) {
    transition.t += dt;
    if (transition.t >= transition.duration) state.transition = null;
    return;
  }
  for (const system of VL.SYSTEMS) system.update(state, actions, dt);
};

// A screen edge can lead somewhere other than the neighbour (the Whispering
// Woods without their map, W15): `turn(state, area, from, to)` returns the
// Place to go instead, or null. Walking follows it (movement.js), a chicken
// flight stops short of such an edge, and the playthrough never paths
// across one.
VL.EDGE_RULES = [];
VL.defineEdgeRule = function defineEdgeRule(id, turn) {
  if (VL.EDGE_RULES.some((rule) => rule.id === id)) throw new Error(`edge rule ${id} is already defined`);
  VL.EDGE_RULES.push({ id, turn });
};

// The first rule's Place, with `rule` naming it, or null.
VL.edgeTurn = function edgeTurn(state, area, from, to) {
  for (const rule of VL.EDGE_RULES) {
    const place = rule.turn(state, area, from, to);
    if (place) return { ...place, rule: rule.id };
  }
  return null;
};
