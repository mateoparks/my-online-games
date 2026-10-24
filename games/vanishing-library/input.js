// Keyboard → Actions. Physical key codes first, so the letter keys sit in the
// same place on any layout; key names as a fallback for browsers without `code`.
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
  const textFields = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
  const buttons = new Set(['BUTTON', 'A']);

  function clear() {
    held.clear();
    pressed.clear();
  }

  win.addEventListener('keydown', (event) => {
    const action = VL.actionForKey(event);
    if (!action) return;
    // Browser shortcuts (Cmd/Ctrl+S, Alt+…) stay the browser's.
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const tag = event.target?.tagName;
    if (textFields.has(tag)) return;
    // Space activates a focused header link or the theme toggle, so it is
    // theirs; the toggle keeps focus after a click, so arrows must still play.
    if (buttons.has(tag) && action === 'mainHand') return;
    event.preventDefault();
    if (event.repeat || held.has(action)) return;
    held.add(action);
    pressed.add(action);
  });

  // No modifier check here: a key released while Cmd is down must still clear.
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
