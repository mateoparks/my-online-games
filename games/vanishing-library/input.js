// Keyboard → Actions. Physical key codes first, so WASD-free play works on
// any layout; key names as a fallback for browsers without `code`.
VL.KEYS = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyS: 'interact',
  Space: 'mainHand',
  KeyD: 'offHand',
  KeyE: 'equipment',
  KeyF: 'fly',
  KeyM: 'map',
  Escape: 'pause',
};

VL.KEY_NAMES = {
  s: 'interact',
  ' ': 'mainHand',
  d: 'offHand',
  e: 'equipment',
  f: 'fly',
  m: 'map',
};

VL.actionForKey = (event) => VL.KEYS[event.code] || VL.KEY_NAMES[(event.key || '').toLowerCase()] || null;

VL.createKeyboardInput = function createKeyboardInput(win, doc) {
  const held = new Set();
  const pressed = new Set();
  const controls = new Set(['BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT']);

  function clear() {
    held.clear();
    pressed.clear();
  }

  win.addEventListener('keydown', (event) => {
    const action = VL.actionForKey(event);
    if (!action) return;
    // Game keys must not scroll the page, but the header's links and the
    // theme toggle keep their keyboard behaviour.
    if (!controls.has(event.target?.tagName)) event.preventDefault();
    if (event.repeat || held.has(action)) return;
    held.add(action);
    pressed.add(action);
  });

  win.addEventListener('keyup', (event) => {
    const action = VL.actionForKey(event);
    if (action) held.delete(action);
  });

  win.addEventListener('blur', clear);
  doc.addEventListener('visibilitychange', () => {
    if (doc.hidden) clear();
  });

  return {
    clear,
    poll() {
      const actions = VL.noActions();
      for (const action of held) actions.held[action] = true;
      for (const action of pressed) {
        actions.held[action] = true;
        actions.pressed[action] = true;
      }
      pressed.clear();
      return actions;
    },
  };
};
