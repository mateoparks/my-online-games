// Game state: everything the save (W2) will persist plus transient play state.
// Later items add fields here; keep saved fields JSON-safe.
VL.createGame = function createGame({ name = 'Hero', seed = 1 } = {}) {
  return {
    name,
    rngState: seed >>> 0,
    hp: VL.TUNING.startMaxHp,
    maxHp: VL.TUNING.startMaxHp,
    flags: {},
    visited: {},

    // Transient from here down (never saved).
    time: 0,
    player: { area: null, screen: null, x: 0, y: 0, facing: 'down', moving: false },
    room: null,
    transition: null,
    events: [],
  };
};

VL.newGame = function newGame(options) {
  const state = VL.createGame(options);
  VL.place(state, VL.START);
  return state;
};
