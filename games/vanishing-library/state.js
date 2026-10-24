// Game state: the fields the save persists plus transient play state.
VL.GAME_EXTENSIONS = [];

// A later file adds its own saved fields with VL.extendGame('inventory',
// (options) => ({ inventory: {} })) instead of editing this file. Keep them
// JSON-safe; a field two lanes both add is an error, not a silent override.
VL.extendGame = function extendGame(id, fields) {
  if (VL.GAME_EXTENSIONS.some((other) => other.id === id)) throw new Error(`game extension ${id} is already defined`);
  VL.GAME_EXTENSIONS.push({ id, fields });
};

VL.createGame = function createGame(options = {}) {
  const { name = 'Hero', seed = 1 } = options;
  const state = {
    name,
    rngState: seed >>> 0,
    hp: VL.TUNING.startMaxHp,
    maxHp: VL.TUNING.startMaxHp,
    flags: {},
    visited: {},
  };
  for (const { id, fields } of VL.GAME_EXTENSIONS) {
    for (const [key, value] of Object.entries(fields(options))) {
      if (key in state) throw new Error(`game extension ${id}: field ${key} already exists`);
      state[key] = value;
    }
  }
  return Object.assign(state, {
    // Transient from here down (never saved).
    time: 0,
    player: { area: null, screen: null, x: 0, y: 0, facing: 'down', moving: false },
    room: null,
    transition: null,
    events: [],
  });
};

VL.newGame = function newGame(options) {
  const state = VL.createGame(options);
  VL.place(state, VL.START);
  return state;
};
