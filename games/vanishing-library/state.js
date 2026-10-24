// Game state: the fields the save persists plus transient play state.
VL.GAME_EXTENSIONS = [];

// A later file adds its own saved fields with VL.extendGame('inventory',
// (options) => ({ inventory: {} })) instead of editing this file. Keep them
// JSON-safe; a field two lanes both add is an error, not a silent override.
// `{ transient: true }` adds play state that is never saved (enemies,
// cooldowns): it joins VL.TRANSIENT_FIELDS and resets on load.
VL.extendGame = function extendGame(id, fields, { transient = false } = {}) {
  if (VL.GAME_EXTENSIONS.some((other) => other.id === id)) throw new Error(`game extension ${id} is already defined`);
  VL.GAME_EXTENSIONS.push({ id, fields, transient });
  if (transient) VL.TRANSIENT_FIELDS.push(...Object.keys(fields({})));
};

// Play state that is never saved (save.js strips these fields).
const transientState = () => ({
  time: 0,
  player: { area: null, screen: null, x: 0, y: 0, facing: 'down', moving: false },
  room: null,
  transition: null,
  events: [],
  dirty: false,
  fainted: null,
});
VL.TRANSIENT_FIELDS = Object.keys(transientState());

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
  const transient = transientState();
  for (const { id, fields, transient: isTransient } of VL.GAME_EXTENSIONS) {
    for (const [key, value] of Object.entries(fields(options))) {
      if (key in state || key in transient) throw new Error(`game extension ${id}: field ${key} already exists`);
      // The transient list was learned from fields({}): a key that appears only
      // for some options would be saved.
      if (isTransient && !VL.TRANSIENT_FIELDS.includes(key)) throw new Error(`game extension ${id}: transient field ${key} must exist for every game`);
      (isTransient ? transient : state)[key] = value;
    }
  }
  // Extension fields sit above this line so they are part of the saved state.
  return Object.assign(state, transient);
};

VL.newGame = function newGame(options) {
  const state = VL.createGame(options);
  VL.place(state, VL.START);
  return state;
};
