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
    state.transition = {
      dir: slideDir,
      t: 0,
      duration: VL.TUNING.slideSeconds,
      from: { area: player.area, screen: player.screen },
    };
  }
  const spot = where.x === undefined ? VL.tileCenter(where.tx, where.ty) : where;
  player.area = where.area;
  player.screen = where.screen;
  player.x = spot.x;
  player.y = spot.y;
  if (where.facing) player.facing = where.facing;
  state.visited[`${where.area}:${where.screen}`] = true;
  state.room = {
    area: where.area,
    screen: where.screen,
    entities: screen.entities.map((entity) => ({ ...entity })),
    standingOn: null,
  };
  state.events.push({ type: 'enterScreen', area: where.area, screen: where.screen });
};

VL.heroTile = (state) => VL.tileOf(state.player.x, state.player.y);

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
