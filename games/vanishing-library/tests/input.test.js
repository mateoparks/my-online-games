// Keyboard → Actions: mapping, the pressed latch, repeat, blur, preventDefault.
const assert = require('node:assert/strict');
const { test, loadGame, fakeDocument, fakeWindow, keyEvent } = require('./harness');

test('keys map to actions: held and pressed', () => {
  const { VL } = loadGame();
  const win = fakeWindow();
  const doc = fakeDocument();
  const input = VL.createKeyboardInput(win, doc);
  const expected = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    KeyS: 'interact', Space: 'mainHand', KeyD: 'offHand', KeyE: 'equipment', KeyF: 'fly', Escape: 'pause', KeyM: 'map',
  };
  for (const [code, action] of Object.entries(expected)) {
    win.dispatch('keydown', keyEvent(code));
    const actions = input.poll();
    assert.equal(actions.held[action], true, `${code} held`);
    assert.equal(actions.pressed[action], true, `${code} pressed`);
    assert.equal(input.poll().pressed[action], false, `${code} pressed only once`);
    assert.equal(input.poll().held[action], true, `${code} still held`);
    win.dispatch('keyup', keyEvent(code));
    assert.equal(input.poll().held[action], false, `${code} released`);
  }
});

test('a key pressed and released between polls still counts once', () => {
  const { VL } = loadGame();
  const win = fakeWindow();
  const input = VL.createKeyboardInput(win, fakeDocument());
  win.dispatch('keydown', keyEvent('KeyF'));
  win.dispatch('keyup', keyEvent('KeyF'));
  assert.equal(input.poll().pressed.fly, true);
  assert.equal(input.poll().pressed.fly, false);
});

test('key repeat does not re-press and unknown keys are ignored', () => {
  const { VL } = loadGame();
  const win = fakeWindow();
  const input = VL.createKeyboardInput(win, fakeDocument());
  win.dispatch('keydown', keyEvent('KeyS'));
  input.poll();
  win.dispatch('keydown', keyEvent('KeyS', { repeat: true }));
  assert.equal(input.poll().pressed.interact, false);
  const stray = keyEvent('KeyZ');
  win.dispatch('keydown', stray);
  assert.equal(stray.prevented, false);
  const actions = input.poll();
  assert.deepEqual(Object.values(actions.pressed).filter(Boolean), []);
});

test('held keys clear on blur and when the tab hides', () => {
  const { VL } = loadGame();
  const win = fakeWindow();
  const doc = fakeDocument();
  const input = VL.createKeyboardInput(win, doc);
  win.dispatch('keydown', keyEvent('ArrowLeft'));
  win.dispatch('blur');
  assert.equal(input.poll().held.left, false);
  win.dispatch('keydown', keyEvent('ArrowLeft'));
  doc.hidden = true;
  doc.dispatch('visibilitychange');
  assert.equal(input.poll().held.left, false);
});

test('game keys stop page scrolling but leave the header controls usable', () => {
  const { VL } = loadGame();
  const win = fakeWindow();
  const input = VL.createKeyboardInput(win, fakeDocument());
  const arrow = keyEvent('ArrowDown');
  win.dispatch('keydown', arrow);
  assert.equal(arrow.prevented, true);
  assert.equal(input.poll().held.down, true);
  // Space on the focused theme toggle toggles the theme and does nothing in the game.
  const onButton = keyEvent('Space', { target: { tagName: 'BUTTON' } });
  win.dispatch('keydown', onButton);
  assert.equal(onButton.prevented, false);
  assert.equal(input.poll().pressed.mainHand, false, 'the control owns Space');
  // Arrows with the toggle focused (it keeps focus after a click) still move the hero.
  const arrowOnButton = keyEvent('ArrowLeft', { target: { tagName: 'BUTTON' } });
  win.dispatch('keydown', arrowOnButton);
  assert.equal(arrowOnButton.prevented, true);
  assert.equal(input.poll().held.left, true);
  const inField = keyEvent('ArrowLeft', { target: { tagName: 'INPUT' } });
  win.dispatch('keydown', inField);
  assert.equal(inField.prevented, false);
  win.dispatch('keyup', keyEvent('ArrowLeft'));
  win.dispatch('keydown', inField);
  assert.equal(input.poll().pressed.left, false, 'text fields own every key');
});

test('modifier chords are left to the browser, but the release still clears the key', () => {
  const { VL } = loadGame();
  const win = fakeWindow();
  const input = VL.createKeyboardInput(win, fakeDocument());
  for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) {
    const chord = keyEvent('KeyS', { [modifier]: true });
    win.dispatch('keydown', chord);
    assert.equal(chord.prevented, false, `${modifier}+S is not prevented`);
    assert.equal(input.poll().pressed.interact, false, `${modifier}+S is not a game key`);
  }
  win.dispatch('keydown', keyEvent('ArrowRight'));
  assert.equal(input.poll().held.right, true);
  win.dispatch('keyup', keyEvent('ArrowRight', { metaKey: true }));
  assert.equal(input.poll().held.right, false, 'released while a modifier is down still clears');
});

test('letter keys also match by key name for other keyboard layouts', () => {
  const { VL } = loadGame();
  const win = fakeWindow();
  const input = VL.createKeyboardInput(win, fakeDocument());
  win.dispatch('keydown', { code: '', key: 'e', repeat: false, preventDefault() {} });
  assert.equal(input.poll().pressed.equipment, true);
});
