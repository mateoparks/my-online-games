// W40: the player chooses the main-hand and off-hand keys (Esc → Controls),
// saved per slot; the input layer maps the chosen keys to the hand actions
// and every text naming a hand key shows the chosen one.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, read, loadGame, fakeDocument, fakeWindow, keyEvent, memoryStorage, playApp } = require('./harness');

const STEP = 1 / 60;
const plain = (value) => JSON.parse(JSON.stringify(value));
const fixture = (file) => fs.readFileSync(path.join(__dirname, 'fixtures', file), 'utf8');
const press = (VL, app, action, keys = []) => app.update(VL.actions({ pressed: action ? [action] : [], keys }), STEP);
// A real key press as the scene sees it: its actions under the game's binding, and its code.
const key = (VL, app, code) => app.update(VL.actions({ pressed: VL.actionsForKey(keyEvent(code), VL.handKeys(app.game)), keys: [code] }), STEP);
const CUSTOM = { mainHand: 'KeyQ', offHand: 'Digit1' };

function drawnText(VL, app, t = 0) {
  const strings = [];
  const original = VL.ART.text;
  VL.ART.text = (ctx, str, ...rest) => {
    strings.push(String(str));
    return original(ctx, str, ...rest);
  };
  try {
    VL.render(fakeDocument().createElement('canvas').getContext('2d'), app, t);
  } finally {
    VL.ART.text = original;
  }
  return strings;
}

function controlsApp(VL) {
  const app = playApp(VL);
  VL.place(app.game, { area: 'overworld', screen: '1,1', tx: 8, ty: 6 });
  press(VL, app, 'pause');
  assert.equal(app.sceneId, 'pause');
  app.pause.cursor = VL.PAUSE_OPTIONS.indexOf('Controls');
  press(VL, app, 'confirm');
  assert.equal(app.sceneId, 'controls');
  return app;
}

// ---------- saved per slot ----------

test('a new game uses Space for the main hand and D for the off hand, and saves the binding', () => {
  const { VL } = loadGame();
  assert.deepEqual(plain(VL.DEFAULT_HAND_KEYS), { mainHand: 'Space', offHand: 'KeyD' });
  const game = VL.newGame();
  assert.deepEqual(plain(VL.handKeys(game)), { mainHand: 'Space', offHand: 'KeyD' });
  game.handKeys = { ...CUSTOM };
  assert.deepEqual(plain(VL.serializeSave(game).handKeys), CUSTOM);
  assert.deepEqual(plain(VL.handKeys(null)), plain(VL.DEFAULT_HAND_KEYS), 'no game (the title) is the default');
});

test('an odd saved binding (reserved, shared, unknown) falls back to Space and D', () => {
  const { VL } = loadGame();
  for (const handKeys of [{ mainHand: 'KeyS', offHand: 'KeyD' }, { mainHand: 'KeyQ', offHand: 'KeyQ' }, { mainHand: 'Comma', offHand: 'KeyD' }, { mainHand: 7, offHand: null }, null]) {
    assert.deepEqual(plain(VL.handKeys({ handKeys })), plain(VL.DEFAULT_HAND_KEYS), JSON.stringify(handKeys));
  }
});

test('an older save (W37) has no binding and plays with Space and D', () => {
  const { VL } = loadGame();
  const raw = JSON.parse(fixture('save-v1-W37.json'));
  assert.equal(raw.handKeys, undefined);
  assert.deepEqual(plain(VL.handKeys(VL.restoreGame(raw))), { mainHand: 'Space', offHand: 'KeyD' });
});

test('the W40 fixture (Q for the main hand, 1 for the off hand) loads with nothing reset and keeps its keys', () => {
  const { VL } = loadGame();
  const storage = VL.createStorage(memoryStorage({ [VL.slotKey(0)]: fixture('save-v1-W40.json') }));
  const slot = VL.readSlot(storage, 0);
  assert.equal(slot.status, 'ok');
  assert.deepEqual(plain(slot.resets || []), []);
  assert.deepEqual(plain(VL.handKeys(VL.loadSlot(storage, 0))), CUSTOM);
});

// ---------- which keys may be chosen ----------

test('any letter or digit that is not the game\'s, and Space, can be chosen; every key the game binds is refused', () => {
  const { VL } = loadGame();
  const game = VL.newGame();
  const reserved = ['KeyS', 'KeyE', 'KeyX', 'KeyF', 'KeyM', 'KeyN'];
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const code = `Key${letter}`;
    const choice = VL.handKeyChoice(game, 'offHand', code);
    if (reserved.includes(code)) assert.equal(choice, 'taken', code);
    else assert.equal(choice, 'ok', code);
  }
  for (let d = 0; d <= 9; d += 1) assert.equal(VL.handKeyChoice(game, 'mainHand', `Digit${d}`), 'ok');
  for (const code of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Escape', 'Enter', 'NumpadEnter', 'Backspace', 'Delete']) {
    assert.equal(VL.handKeyChoice(game, 'mainHand', code), 'taken', code);
  }
  // Everything the input already binds, and the mute key, is taken.
  for (const code of [...Object.keys(VL.KEYS), VL.SOUND.MUTE_CODE]) assert.equal(VL.handKeyChoice(game, 'mainHand', code), 'taken', code);
  for (const code of ['Comma', 'ShiftLeft', 'Tab', 'BracketLeft', 'F1', 'Quote']) assert.equal(VL.handKeyChoice(game, 'mainHand', code), 'notAKey', code);
  assert.equal(VL.handKeyChoice(game, 'mainHand', 'KeyD'), 'otherHand', 'both hands never share a key');
  assert.equal(VL.handKeyChoice(game, 'offHand', 'Space'), 'otherHand');
  assert.equal(VL.handKeyChoice(game, 'mainHand', 'Space'), 'ok', 'its own key again is fine');
  game.handKeys = { mainHand: 'KeyQ', offHand: 'KeyD' };
  assert.equal(VL.handKeyChoice(game, 'offHand', 'Space'), 'ok', 'Space is free once the main hand has moved');
});

test('a number pad digit counts as that digit', () => {
  const { VL } = loadGame();
  assert.equal(VL.keyCode(keyEvent('Numpad4')), 'Digit4');
  assert.equal(VL.keyCode({ key: 'q' }), 'KeyQ', 'a browser without `code` names the key');
  assert.equal(VL.keyCode({ key: ' ' }), 'Space');
  assert.equal(VL.keyCode({ key: '7' }), 'Digit7');
});

// ---------- the input layer ----------

test('the chosen keys give the hand actions, and Space and D only do while they are chosen', () => {
  const { VL } = loadGame();
  const win = fakeWindow();
  const input = VL.createKeyboardInput(win, fakeDocument());
  const tap = (code) => {
    win.dispatch('keydown', keyEvent(code));
    win.dispatch('keyup', keyEvent(code));
    return input.poll().pressed;
  };
  assert.deepEqual([tap('Space').mainHand, tap('KeyD').offHand], [true, true], 'Space and D by default');
  input.setHands(CUSTOM);
  const q = tap('KeyQ');
  assert.deepEqual([q.mainHand, q.offHand], [true, false]);
  assert.equal(tap('Digit1').offHand, true);
  assert.equal(tap('Numpad1').offHand, true, 'the number pad 1 too');
  const space = tap('Space');
  assert.deepEqual([space.mainHand, space.offHand, space.space], [false, false, true], 'Space is only Space now (menus still take it)');
  const d = tap('KeyD');
  assert.equal(d.offHand, false, 'D does nothing');
  assert.equal(tap('KeyS').interact, true, 'the other keys are unchanged');
});

test('a header button reached with Tab keeps Space whichever hand it uses; a letter hand key stays the game\'s', () => {
  const { VL } = loadGame();
  const win = fakeWindow();
  const doc = fakeDocument();
  const input = VL.createKeyboardInput(win, doc);
  input.setHands({ mainHand: 'KeyQ', offHand: 'Space' });
  const BUTTON = { tagName: 'BUTTON' };
  const space = keyEvent('Space', { key: ' ', target: BUTTON });
  win.dispatch('keydown', space);
  assert.equal(space.prevented, false, 'the button gets Space');
  assert.equal(input.poll().pressed.offHand, false);
  win.dispatch('keyup', keyEvent('Space'));
  const q = keyEvent('KeyQ', { target: BUTTON });
  win.dispatch('keydown', q);
  assert.equal(q.prevented, true);
  assert.equal(input.poll().pressed.mainHand, true, 'Q never activates a button');
});

test('held keys clear when the binding changes, not when it stays the same', () => {
  const { VL } = loadGame();
  const win = fakeWindow();
  const input = VL.createKeyboardInput(win, fakeDocument());
  input.setHands(CUSTOM);
  win.dispatch('keydown', keyEvent('KeyQ'));
  input.poll();
  input.setHands({ ...CUSTOM });
  assert.equal(input.poll().held.mainHand, true, 'the same keys: still held');
  input.setHands({ mainHand: 'KeyQ', offHand: 'KeyD' });
  assert.equal(input.poll().held.mainHand, false, 'a new binding lets go of everything');
  win.dispatch('keyup', keyEvent('KeyQ'));
  assert.equal(input.poll().held.mainHand, false);
});

test('the input passes on the codes pressed (not key repeats), for the Controls screen to capture', () => {
  const { VL } = loadGame();
  const win = fakeWindow();
  const input = VL.createKeyboardInput(win, fakeDocument());
  win.dispatch('keydown', keyEvent('KeyQ'));
  win.dispatch('keydown', keyEvent('KeyQ', { repeat: true }));
  win.dispatch('keydown', keyEvent('Comma', { key: ',' }));
  win.dispatch('keydown', keyEvent('Numpad3', { key: '3' }));
  assert.deepEqual(plain(input.poll().keys), ['KeyQ', 'Comma', 'Digit3']);
  assert.deepEqual(plain(input.poll().keys), []);
});

test('menus take Enter, S and Space whatever the hands use: D for the main hand does not confirm', () => {
  const { VL } = loadGame();
  assert.equal(VL.confirmed(VL.actions({ pressed: ['space'] })), true);
  assert.equal(VL.confirmed(VL.actions({ pressed: ['mainHand'] })), false, 'the main-hand key is not a menu key');
  const app = playApp(VL);
  VL.place(app.game, { area: 'overworld', screen: '1,1', tx: 8, ty: 6 });
  app.game.handKeys = { mainHand: 'KeyD', offHand: 'Space' };
  press(VL, app, 'pause');
  key(VL, app, 'KeyD');
  assert.equal(app.sceneId, 'pause', 'D (the main hand now) does not pick Resume');
  key(VL, app, 'Space');
  assert.equal(app.sceneId, 'play', 'Space (the off hand now) still does');
});

test('the shield is raised with the chosen off-hand key, through the real input', () => {
  const { VL } = loadGame();
  const win = fakeWindow();
  const input = VL.createKeyboardInput(win, fakeDocument());
  const app = playApp(VL);
  VL.place(app.game, { area: 'overworld', screen: '1,1', tx: 8, ty: 6 });
  VL.giveItem(app.game, 'woodShield');
  app.game.popups.queue.length = 0;
  app.game.handKeys = { ...CUSTOM };
  input.setHands(VL.handKeys(app.game));
  win.dispatch('keydown', keyEvent('KeyD'));
  app.update(input.poll(), STEP);
  assert.ok(!app.game.player.shield, 'D does nothing now');
  win.dispatch('keyup', keyEvent('KeyD'));
  win.dispatch('keydown', keyEvent('Digit1'));
  app.update(input.poll(), STEP);
  assert.ok(app.game.player.shield, '1 raises it');
});

test('egg on his face swaps the chosen keys: Q uses the off hand and 1 the main hand', () => {
  const { VL } = loadGame();
  const game = VL.newGame();
  VL.place(game, { area: 'overworld', screen: '1,1', tx: 8, ty: 6 });
  game.handKeys = { ...CUSTOM };
  game.room.egg = { at: 0 };
  const q = VL.filterActions(game, VL.actions({ pressed: VL.actionsForKey(keyEvent('KeyQ'), VL.handKeys(game)) }));
  assert.deepEqual([q.pressed.mainHand, q.pressed.offHand], [false, true]);
  const one = VL.filterActions(game, VL.actions({ pressed: VL.actionsForKey(keyEvent('Digit1'), VL.handKeys(game)) }));
  assert.deepEqual([one.pressed.mainHand, one.pressed.offHand], [true, false]);
});

// ---------- the Controls screen ----------

test('the pause menu has Controls; it lists both hands, and Esc or X goes back to the pause menu on it', () => {
  const { VL } = loadGame();
  assert.deepEqual([...VL.PAUSE_OPTIONS], ['Resume', 'Save & Quit', 'Controls']);
  const app = controlsApp(VL);
  const shown = drawnText(VL, app);
  assert.ok(shown.some((s) => /MAIN HAND/i.test(s)) && shown.some((s) => /OFF HAND/i.test(s)), shown.join(' | '));
  assert.ok(shown.includes('Space') && shown.includes('D'), 'the keys as they are');
  for (const back of ['pause', 'dig']) {
    press(VL, app, back);
    assert.equal(app.sceneId, 'pause', back);
    assert.equal(VL.PAUSE_OPTIONS[app.pause.cursor], 'Controls', 'the cursor stays on Controls');
    press(VL, app, 'confirm');
    assert.equal(app.sceneId, 'controls');
  }
});

test('choose a hand, press a key: it is taken and saved; reserved keys and the other hand\'s are refused with a note', () => {
  const { VL } = loadGame();
  const app = controlsApp(VL);
  const game = app.game;
  game.dirty = false;
  press(VL, app, 'confirm');
  assert.equal(app.controls.capture, 'mainHand');
  assert.ok(drawnText(VL, app).some((s) => /PRESS A KEY/i.test(s)), 'asks for a key');
  for (const code of ['KeyS', 'ArrowLeft', 'Enter']) {
    key(VL, app, code);
    assert.equal(app.controls.capture, 'mainHand', `${code} refused, still waiting`);
    assert.match(app.controls.note, /taken/i);
    assert.ok(drawnText(VL, app).some((s) => /taken/i.test(s)), 'the note is on the canvas');
  }
  key(VL, app, 'KeyD');
  assert.match(app.controls.note, /off hand/i, 'the other hand\'s key says so');
  key(VL, app, 'Comma');
  assert.match(app.controls.note, /letter, a number or Space/i);
  assert.deepEqual(plain(VL.handKeys(game)), plain(VL.DEFAULT_HAND_KEYS), 'nothing changed yet');
  key(VL, app, 'KeyQ');
  assert.equal(app.controls.capture, null);
  assert.deepEqual(plain(VL.handKeys(game)), { mainHand: 'KeyQ', offHand: 'KeyD' });
  assert.ok(drawnText(VL, app).includes('Q'));
  // A save happened (the app saves a dirty game after the step).
  assert.equal(game.dirty, false);
  assert.deepEqual(plain(VL.serializeSave(game).handKeys), { mainHand: 'KeyQ', offHand: 'KeyD' });
  // The off hand can take Space now.
  press(VL, app, 'down');
  press(VL, app, 'confirm');
  assert.equal(app.controls.capture, 'offHand');
  key(VL, app, 'Space');
  assert.deepEqual(plain(VL.handKeys(game)), { mainHand: 'KeyQ', offHand: 'Space' });
});

test('Esc or X while waiting for a key backs out with nothing changed; Reset puts back Space and D', () => {
  const { VL } = loadGame();
  const app = controlsApp(VL);
  const game = app.game;
  game.handKeys = { ...CUSTOM };
  for (const code of ['Escape', 'KeyX']) {
    press(VL, app, 'confirm');
    assert.equal(app.controls.capture, 'mainHand');
    key(VL, app, code);
    assert.equal(app.controls.capture, null, `${code} backs out`);
    assert.equal(app.sceneId, 'controls', 'and stays on the Controls screen');
    assert.deepEqual(plain(VL.handKeys(game)), CUSTOM);
  }
  const rows = VL.CONTROLS_ROWS;
  app.controls.cursor = rows.indexOf('reset');
  assert.ok(drawnText(VL, app).some((s) => /Reset to Space and D/i.test(s)));
  press(VL, app, 'confirm');
  assert.deepEqual(plain(VL.handKeys(game)), plain(VL.DEFAULT_HAND_KEYS));
  app.controls.cursor = rows.indexOf('back');
  press(VL, app, 'confirm');
  assert.equal(app.sceneId, 'pause');
});

test('the capture press itself is not taken as the new key', () => {
  const { VL } = loadGame();
  const app = controlsApp(VL);
  key(VL, app, 'Space');
  assert.equal(app.controls.capture, 'mainHand', 'Space picked the row');
  assert.deepEqual(plain(VL.handKeys(app.game)), plain(VL.DEFAULT_HAND_KEYS));
});

// ---------- every text names the chosen keys ----------

test('popupText fills {mainKey} and {offKey} with the chosen keys', () => {
  const { VL } = loadGame();
  const game = VL.newGame();
  assert.equal(VL.popupText('{mainKey} and {offKey}', game), 'Space and D');
  game.handKeys = { ...CUSTOM };
  assert.equal(VL.popupText('{mainKey} and {offKey}', game), 'Q and 1');
  assert.equal(VL.popupText('{mainKey}', null), 'Space', 'no game: the default');
});

test('the sword and shield popups, the shovel\'s about, the pause list, the equipment view and the HUD show the chosen keys', () => {
  const { VL } = loadGame();
  const app = playApp(VL);
  const game = app.game;
  VL.place(game, { area: 'overworld', screen: '1,1', tx: 8, ty: 6 });
  game.handKeys = { mainHand: 'KeyQ', offHand: 'Digit1' };
  VL.giveItem(game, 'woodSword');
  VL.giveItem(game, 'woodShield');
  assert.match(VL.currentPopup(game).text, /Press Q to swing/);
  VL.dismissPopup(game);
  assert.match(VL.currentPopup(game).text, /Hold 1 to raise/);
  VL.dismissPopup(game);
  for (const id of ['woodShovel', 'metalShield', 'mirrorShield']) {
    const item = VL.ITEMS[id];
    const words = [item.about, item.popup?.text, VL.POPUPS[item.popup]?.text].filter((s) => typeof s === 'string').map((s) => VL.popupText(s, game)).join(' ');
    assert.doesNotMatch(words, /\bSpace\b|\bD\b/, id);
  }
  assert.match(VL.popupText(VL.ITEMS.woodShovel.about, game), /Q or 1 digs/);
  assert.deepEqual([VL.ART.hudModel(game).mainKey, VL.ART.hudModel(game).offKey], ['Q', '1']);
  assert.ok(VL.pauseControls(game).some((line) => line.includes('Q: MAIN HAND') && line.includes('1: OFF HAND')));
  assert.equal(VL.handMarks(game, 'woodSword'), 'Q');
  app.setScene('equipment');
  const shown = drawnText(VL, app);
  assert.ok(shown.some((s) => s.includes('Q/1: HOLD')), shown.join(' | '));
  assert.ok(shown.includes('Q MAIN') && shown.includes('1 OFF'));
  game.handKeys = { ...VL.DEFAULT_HAND_KEYS };
  assert.ok(VL.pauseControls(game).some((line) => line.includes('␣ MAIN HAND    D: OFF HAND')), 'the default reads as before');
  assert.deepEqual([VL.ART.hudModel(game).mainKey, VL.ART.hudModel(game).offKey], ['␣', 'D']);
});

// The same string scanner as tests/hero-look.test.js: literals outside comments.
function literals(source) {
  const out = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === '/' && source[i + 1] === '/') {
      i = source.indexOf('\n', i);
      if (i < 0) break;
    } else if (c === '/' && source[i + 1] === '*') {
      i = source.indexOf('*/', i) + 2;
    } else if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      let s = '';
      while (j < source.length && source[j] !== c) {
        s += source[j] === '\\' ? source[j + 1] : source[j];
        j += source[j] === '\\' ? 2 : 1;
      }
      out.push(s);
      i = j + 1;
    } else {
      i += 1;
    }
  }
  return out;
}

// Text that names Space or D but not as a hand key.
const NOT_HANDS = [
  ['scenes/pause.js', 'ASK A GROWN-UP TO FREE UP SPACE'],
  // The art sheet's font specimen shows the ␣ glyph.
  ['scenes/art-sheet.js', 'Small: HEARTS 3/5  SHELLS 042  ␣ D ← → ↑ ↓'],
  // Space as a key that can be chosen.
  ['scenes/controls.js', 'Pick a letter, a number or Space.'],
  ['scenes/controls.js', 'ANY FREE LETTER OR NUMBER, OR SPACE'],
];
const HAND_KEY = /\b(Space|SPACE)\b|␣|(^|[\s/(])D($|[\s:/,.)])/;

test('no game text names a hand key outside {mainKey} and {offKey} (allow-list for other uses)', () => {
  const { VL } = loadGame();
  const strays = [];
  const used = new Set();
  for (const file of VL.scriptFiles()) {
    for (const text of literals(read(file))) {
      // Sentences and labels only: code strings (key codes, sprite rows) have no spaces.
      if (!/\s/.test(text) || !HAND_KEY.test(text.replace(/\$\{[^}]*\}/g, ''))) continue;
      const other = NOT_HANDS.findIndex(([where, part]) => where === file && text.includes(part));
      if (other === -1) strays.push(`${file}: ${text}`);
      else used.add(other);
    }
  }
  assert.deepEqual(strays, [], 'a hand key in text is {mainKey} / {offKey} (or VL.handKeyMark for the small labels)');
  assert.deepEqual(NOT_HANDS.filter((_, i) => !used.has(i)), [], 'every allow-list entry still matches');
  for (const said of ['Press Space to swing it.', 'Hold D to raise it.', '␣/D: HOLD', 'D OFF', 'Space or D digs']) assert.match(said, HAND_KEY, said);
});
