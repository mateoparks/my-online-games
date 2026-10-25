// Names of everything the player can do. Input turns keys into these;
// game logic only ever reads Actions, so touch controls can be added later.
// `confirm` (Enter) and `erase` (Backspace/Delete) are for menus; `typed` is
// the text typed since the last poll, for the on-canvas name field.
VL.ACTIONS = ['up', 'down', 'left', 'right', 'interact', 'mainHand', 'offHand', 'equipment', 'fly', 'dig', 'map', 'pause', 'confirm', 'erase'];

VL.noActions = function noActions() {
  const held = {};
  const pressed = {};
  for (const action of VL.ACTIONS) {
    held[action] = false;
    pressed[action] = false;
  }
  return { held, pressed, typed: '', typedAfterConfirm: '' };
};

// Actions from name lists; pressed actions count as held too.
VL.actions = function actions({ held = [], pressed = [], typed = '' } = {}) {
  const result = VL.noActions();
  for (const action of held) result.held[action] = true;
  for (const action of pressed) {
    result.held[action] = true;
    result.pressed[action] = true;
  }
  result.typed = typed;
  return result;
};

VL.heldOnly = function heldOnly(actions) {
  return { held: actions.held, pressed: VL.noActions().pressed, typed: '' };
};

// Menus and prompts accept Enter, S or Space.
VL.confirmed = (actions) => Boolean(actions.pressed.confirm || actions.pressed.interact || actions.pressed.mainHand);

VL.clamp = (value, low, high) => Math.min(high, Math.max(low, value));

VL.smoothstep = (k) => k * k * (3 - 2 * k);

// Seeded random so drops are reproducible in tests: mulberry32 on state.rngState.
VL.random = function random(state) {
  state.rngState = (state.rngState + 0x6d2b79f5) >>> 0;
  let t = state.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
