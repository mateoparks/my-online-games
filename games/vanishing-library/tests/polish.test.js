// W24 polish from QA: the theme toggle and the game's Enter/Space, corner
// assist, menu sounds, full storage at boot, title and mute races, gift
// guards, berries ahead of a diagonal NPC, the Hollow Oak crossfire, the
// load-names scan and a flight's dip under the HUD.
const assert = require('node:assert/strict');
const { test, loadGame, memoryStorage, fakeDocument, fakeWindow, keyEvent } = require('./harness');

const STEP = 1 / 60;
const press = (VL, app, action) => app.update(VL.actions({ pressed: [action] }), STEP);
const type = (VL, app, typed) => app.update(VL.actions({ typed }), STEP);

const titleApp = (VL, backing = memoryStorage()) => VL.createApp({ storage: VL.createStorage(backing) });

// ---------- 1. the theme toggle never takes the game's Enter and Space ----------

const BUTTON = { tagName: 'BUTTON' };

test('a toggle focused by a mouse click leaves Enter and Space to the game, and focus goes to the canvas', () => {
  const { VL } = loadGame();
  const win = fakeWindow();
  const doc = fakeDocument();
  const input = VL.createKeyboardInput(win, doc);
  doc.dispatch('pointerdown', { target: BUTTON });
  for (const [code, action] of [['Enter', 'confirm'], ['Space', 'mainHand']]) {
    doc.canvas.focused = false;
    const event = keyEvent(code, { key: code === 'Space' ? ' ' : code, target: BUTTON });
    win.dispatch('keydown', event);
    assert.equal(event.prevented, true, `${code} does not activate the toggle`);
    assert.equal(input.poll().pressed[action], true, `${code} is the game's`);
    assert.equal(doc.canvas.focused, true, `${code} moves focus to the canvas, so its keyup cannot click the toggle`);
    win.dispatch('keyup', keyEvent(code));
  }
});

test('a toggle reached with Tab keeps its own Enter and Space', () => {
  const { VL } = loadGame();
  const win = fakeWindow();
  const doc = fakeDocument();
  const input = VL.createKeyboardInput(win, doc);
  doc.dispatch('pointerdown', { target: BUTTON });
  win.dispatch('keydown', keyEvent('Tab', { key: 'Tab', target: { tagName: 'CANVAS' } }));
  win.dispatch('keyup', keyEvent('Tab', { key: 'Tab' }));
  for (const code of ['Enter', 'Space']) {
    const event = keyEvent(code, { key: code === 'Space' ? ' ' : code, target: BUTTON });
    win.dispatch('keydown', event);
    assert.equal(event.prevented, false, `${code} activates the deliberately focused toggle`);
    const actions = input.poll();
    assert.equal(actions.pressed.confirm || actions.pressed.mainHand, false);
    assert.equal(actions.typed, '', 'and types nothing into the game');
    win.dispatch('keyup', keyEvent(code));
  }
});

test('name entry: ↓ picks START, and S, Space or Enter there starts the game', () => {
  for (const confirm of ['interact', 'mainHand', 'confirm']) {
    const { VL } = loadGame();
    const app = titleApp(VL);
    press(VL, app, 'confirm');
    type(VL, app, 'Sam');
    press(VL, app, 'down');
    assert.equal(app.naming.onStart, true);
    // A real S or Space press also types its character; on START it is the press that counts.
    app.update(VL.actions({ pressed: [confirm], typed: { interact: 's', mainHand: ' ', confirm: '' }[confirm] }), STEP);
    assert.equal(app.sceneId, 'intro', confirm);
    assert.equal(app.game.name, 'Sam', `${confirm} adds nothing to the name`);
  }
});

test('name entry: ↑ or typing a letter on START goes back to the field', () => {
  const { VL } = loadGame();
  const app = titleApp(VL);
  press(VL, app, 'confirm');
  type(VL, app, 'Sa');
  press(VL, app, 'down');
  press(VL, app, 'up');
  assert.equal(app.naming.onStart, false);
  press(VL, app, 'interact');
  assert.equal(app.sceneId, 'name', 'S in the field is only a letter');
  press(VL, app, 'down');
  type(VL, app, 'm');
  assert.equal(app.naming.onStart, false);
  assert.equal(app.naming.text, 'Sam');
});

module.exports = { titleApp, press, type, STEP };
