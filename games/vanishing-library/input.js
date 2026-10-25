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
  KeyX: 'dig',
  KeyM: 'map',
  Escape: 'pause',
  Enter: 'confirm',
  NumpadEnter: 'confirm',
  Backspace: 'erase',
  Delete: 'erase',
};

VL.KEY_NAMES = {
  s: 'interact',
  ' ': 'mainHand',
  d: 'offHand',
  e: 'equipment',
  f: 'fly',
  x: 'dig',
  m: 'map',
  enter: 'confirm',
  backspace: 'erase',
  delete: 'erase',
};

VL.actionForKey = (event) => VL.KEYS[event.code] || VL.KEY_NAMES[(event.key || '').toLowerCase()] || null;

VL.createKeyboardInput = function createKeyboardInput(win, doc) {
  const held = new Set();
  const pressed = new Set();
  let typed = '';
  // Where `typed` stood when Enter was pressed, so a scene Enter opens can
  // take the letters typed after it in the same frame.
  let confirmAt = null;
  // Keys held down when Enter was pressed: their key repeat does not type.
  const down = new Set();
  const stale = new Set();
  const textFields = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
  // A header control reached with Tab keeps the keys that activate it. One
  // that only has focus because it was clicked (the theme toggle keeps focus
  // after a click) does not: a kid's next Enter or Space is for the game.
  const controlKeys = { BUTTON: new Set(['mainHand', 'confirm']), A: new Set(['confirm']) };
  let focusFromPointer = false;
  doc.addEventListener('pointerdown', () => {
    focusFromPointer = true;
  }, true);

  function clear() {
    held.clear();
    pressed.clear();
    typed = '';
    confirmAt = null;
    down.clear();
    stale.clear();
  }

  win.addEventListener('keydown', (event) => {
    // Browser shortcuts (Cmd/Ctrl+S, Alt+…) stay the browser's.
    if (event.key === 'Tab') focusFromPointer = false;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const tag = event.target?.tagName;
    if (textFields.has(tag)) return;
    const action = VL.actionForKey(event);
    if (action && controlKeys[tag]?.has(action)) {
      if (!focusFromPointer) return;
      // Off the control, so the keyup (Space activates on keyup) cannot click it.
      doc.getElementById('game')?.focus();
    }
    const key = event.key || '';
    if (!event.repeat) down.add(event.code);
    if (action === 'confirm' && !event.repeat) {
      if (confirmAt === null) confirmAt = typed.length;
      for (const code of down) if (code !== event.code) stale.add(code);
    }
    // Typed text keeps key repeat (holding Backspace clears a name).
    if (event.repeat && stale.has(event.code)) {
      // Held from before Enter: not typing into what Enter opened.
    } else if (key === 'Backspace' || key === 'Delete') typed += '\b';
    else if (key.length === 1) typed += key;
    // A typed character is the game's too: ' and / open Firefox's Quick Find.
    if (!action && key.length !== 1) return;
    event.preventDefault();
    if (!action) return;
    if (event.repeat || held.has(action)) return;
    held.add(action);
    pressed.add(action);
  });

  // No modifier check here: a key released while Cmd is down must still clear.
  // macOS Chrome drops the keyup of other keys while Cmd is held, so releasing
  // Cmd clears everything rather than leave the hero walking.
  win.addEventListener('keyup', (event) => {
    if (event.key === 'Meta') {
      held.clear();
      return;
    }
    down.delete(event.code);
    stale.delete(event.code);
    const action = VL.actionForKey(event);
    if (action) held.delete(action);
  });

  win.addEventListener('blur', clear);
  doc.addEventListener('visibilitychange', () => {
    if (doc.hidden) clear();
  });

  return {
    clear,
    // Sound asks before taking N as mute: right after Enter it is a letter.
    confirmPending: () => confirmAt !== null,
    poll() {
      const actions = VL.noActions();
      for (const action of held) actions.held[action] = true;
      for (const action of pressed) {
        actions.held[action] = true;
        actions.pressed[action] = true;
      }
      actions.typed = typed;
      actions.typedAfterConfirm = confirmAt === null ? '' : typed.slice(confirmAt);
      pressed.clear();
      typed = '';
      confirmAt = null;
      return actions;
    },
  };
};
