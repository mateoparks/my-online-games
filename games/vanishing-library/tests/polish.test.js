// W24 polish from QA: the theme toggle and the game's Enter/Space, corner
// assist, menu sounds, full storage at boot, title and mute races, gift
// guards, berries ahead of a diagonal NPC, the Hollow Oak crossfire, the
// load-names scan and a flight's dip under the HUD.
const assert = require('node:assert/strict');
const { test, loadGame, memoryStorage, fakeDocument, fakeWindow, keyEvent, playState, playApp, hold } = require('./harness');

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

// ---------- 2. corner assist ----------

// A 1-tile gap in a wall row (5,3), a 1-tile gap in a wall column (8,6), and
// the W5 snag: a wall row below with a gap at 6,10.
function cornerWorld(VL) {
  VL.addScreens('corners', {
    '0,0': {
      tiles: [
        'TTTTTTTTTTTTTTTT',
        'T..............T',
        'T..............T',
        'TTTTT.TTTTTTTTTT',
        'T.......T......T',
        'T.......T......T',
        'T..............T',
        'T.......T......T',
        'T.......T......T',
        'T..............T',
        'TTTTTT.TTTTTTTTT',
      ],
      entities: [],
    },
  });
}

function cornerState(VL, x, y) {
  cornerWorld(VL);
  const state = playState(VL, { area: 'corners', screen: '0,0', tx: 1, ty: 1 });
  state.player.x = x;
  state.player.y = y;
  return state;
}

test('corner assist: walking up into a 1-tile gap a few pixels off slides the hero into line', () => {
  for (const off of [-9, -4, 4, 9]) {
    const { VL } = loadGame();
    const state = cornerState(VL, 5 * 16 + 8 + off, 4 * 16 + 12);
    hold(VL, state, ['up'], 1);
    assert.ok(state.player.y < 3 * 16, `${off} px off: through the gap (y ${state.player.y})`);
  }
});

test('corner assist: walking right into a 1-tile gap in a wall column, a few pixels off', () => {
  for (const off of [-5, 3, 5]) {
    const { VL } = loadGame();
    const state = cornerState(VL, 6 * 16 + 8, 6 * 16 + 12 + off);
    hold(VL, state, ['right'], 1);
    assert.ok(state.player.x > 9 * 16, `${off} px off: through the gap (x ${state.player.x})`);
  }
});

test('corner assist: stopped flush above a wall row, the hero still walks sideways (the W5 snag)', () => {
  const { VL } = loadGame();
  const state = cornerState(VL, 6 * 16 + 8, 157);
  hold(VL, state, ['left'], 0.5);
  assert.ok(state.player.x < 5 * 16, `walked left (x ${state.player.x})`);
});

test('corner assist: a hero well off the gap stays square against the wall', () => {
  const { VL } = loadGame();
  const far = cornerState(VL, 5 * 16 + 8 + 12, 4 * 16 + 12);
  hold(VL, far, ['up'], 0.5);
  assert.equal(far.player.x, 5 * 16 + 20, 'no nudge from 12 px away');
  assert.ok(Math.abs(far.player.y - (4 * 16 + 4)) < 1e-6, 'flush against the wall');
});

// ---------- 3. menu sounds ----------

function recordSfx(VL) {
  const played = [];
  const original = VL.sfx;
  VL.sfx = (name) => {
    played.push(name);
    return original(name);
  };
  return played;
}

test('menu sounds: title moves and picks, the delete dialog, and name entry', () => {
  const { VL } = loadGame();
  const backing = memoryStorage();
  const app = titleApp(VL, backing);
  const played = recordSfx(VL);
  press(VL, app, 'down');
  press(VL, app, 'up');
  assert.deepEqual(played.splice(0), ['menuMove', 'menuMove'], 'title cursor');
  press(VL, app, 'confirm');
  assert.deepEqual(played.splice(0), ['menuSelect'], 'an empty slot opens name entry');
  type(VL, app, 'Kit');
  press(VL, app, 'down');
  press(VL, app, 'down');
  assert.deepEqual(played.splice(0), ['menuMove'], 'onto START once');
  press(VL, app, 'interact');
  assert.ok(played.splice(0).includes('menuSelect'), 'START');
  // Back at the title with Kit in slot 1: the delete dialog.
  const again = titleApp(VL, backing);
  played.length = 0;
  press(VL, again, 'erase');
  press(VL, again, 'left');
  press(VL, again, 'left');
  press(VL, again, 'right');
  press(VL, again, 'confirm');
  assert.deepEqual(played.splice(0), ['menuSelect', 'menuMove', 'menuMove', 'menuSelect'], 'delete dialog');
});

test('menu sounds: pause, its quit dialog, fainted and the conflict screen', () => {
  const { VL } = loadGame();
  const app = titleApp(VL);
  app.startGame(VL.newGame(), null);
  app.setScene('pause');
  const played = recordSfx(VL);
  press(VL, app, 'down');
  assert.deepEqual(played.splice(0), ['menuMove']);
  press(VL, app, 'up');
  press(VL, app, 'confirm');
  assert.deepEqual(played.splice(0), ['menuMove', 'menuSelect'], 'Resume');
  app.setScene('pause');
  app.pause.askQuit = true;
  press(VL, app, 'left');
  press(VL, app, 'confirm');
  assert.deepEqual(played.splice(0), ['menuMove', 'menuSelect'], 'quit dialog');
  app.startGame(VL.newGame(), null);
  app.setScene('fainted');
  for (let i = 0; i < 60; i += 1) app.update(VL.actions(), STEP);
  played.length = 0;
  press(VL, app, 'interact');
  assert.ok(played.includes('menuSelect'), 'waking up');
  app.setScene('conflict');
  played.length = 0;
  press(VL, app, 'confirm');
  assert.deepEqual(played.splice(0), ['menuSelect'], 'conflict');
});

// ---------- 4. storage full when the page loads ----------

test('storage full at boot: saving is off, but the saved slots still list and continue', () => {
  const { VL } = loadGame();
  const backing = memoryStorage();
  const first = titleApp(VL, backing);
  press(VL, first, 'confirm');
  type(VL, first, 'Robin');
  press(VL, first, 'confirm');
  const full = {
    getItem: backing.getItem,
    setItem() {
      throw new Error('QuotaExceededError');
    },
    removeItem: backing.removeItem,
  };
  const storage = VL.createStorage(full);
  assert.equal(storage.ok, false, 'the boot probe could not write');
  const app = VL.createApp({ storage });
  assert.equal(app.title.slots[0].status, 'ok', 'Robin is not shown as Empty');
  assert.equal(app.title.slots[0].summary.name, 'Robin');
  press(VL, app, 'confirm');
  assert.equal(app.sceneId, 'play', 'Continue works');
  assert.equal(app.game.name, 'Robin');
  assert.equal(app.save(), false, 'nothing is written');
  assert.equal(JSON.parse(backing.getItem('vanishing-library-slot-1')).name, 'Robin', 'the save is untouched');
});

// ---------- 5. title cursor after Save & Quit, the mute note, N/Enter races ----------

test('Save & Quit puts the title cursor back on the slot just played', () => {
  const { VL } = loadGame();
  const app = titleApp(VL);
  press(VL, app, 'down');
  press(VL, app, 'confirm');
  type(VL, app, 'Two');
  press(VL, app, 'confirm');
  assert.equal(app.slot, 1);
  app.setScene('pause');
  press(VL, app, 'down');
  press(VL, app, 'confirm');
  assert.equal(app.sceneId, 'title');
  assert.equal(app.title.cursor, 1);
});

test('the "Sound off (N)" note does not follow the player onto name entry', () => {
  const { VL } = loadGame();
  const app = titleApp(VL);
  VL.SOUND.toggleMute();
  assert.ok(VL.SOUND.currentNote(), 'the title shows the note');
  press(VL, app, 'confirm');
  assert.equal(app.sceneId, 'name');
  assert.equal(VL.SOUND.currentNote(), null);
  VL.SOUND.setMuted(false);
});

test('Enter then N in one frame: N is a letter in the name, not a mute', () => {
  const { VL } = loadGame();
  const win = fakeWindow();
  const input = VL.createKeyboardInput(win, fakeDocument());
  win.dispatch('keydown', keyEvent('Enter', { key: 'Enter' }));
  assert.equal(input.confirmPending(), true, 'sound asks this before taking N as mute');
  win.dispatch('keydown', keyEvent('KeyN'));
  const actions = input.poll();
  assert.equal(input.confirmPending(), false);
  assert.equal(actions.typedAfterConfirm, 'n');
  const app = titleApp(VL);
  app.update(actions, STEP);
  assert.equal(app.sceneId, 'name');
  assert.equal(app.naming.text, 'n', 'the N reaches the name field');
  const soundWindow = fakeWindow({ localStorage: memoryStorage() });
  VL.SOUND.install(soundWindow);
  VL.input = { confirmPending: () => true };
  soundWindow.dispatch('keydown', keyEvent('KeyN'));
  assert.equal(VL.SOUND.muted, false, 'sound leaves an N right after Enter to the game');
});

test('N held through Enter does not keep typing into the name', () => {
  const { VL } = loadGame();
  const win = fakeWindow();
  const input = VL.createKeyboardInput(win, fakeDocument());
  win.dispatch('keydown', keyEvent('KeyN'));
  win.dispatch('keydown', keyEvent('KeyN', { repeat: true }));
  input.poll();
  win.dispatch('keydown', keyEvent('Enter', { key: 'Enter' }));
  input.poll();
  for (let i = 0; i < 3; i += 1) win.dispatch('keydown', keyEvent('KeyN', { repeat: true }));
  assert.equal(input.poll().typed, '', 'repeats of a key held before Enter are dropped');
  win.dispatch('keyup', keyEvent('KeyN'));
  win.dispatch('keydown', keyEvent('KeyN'));
  win.dispatch('keydown', keyEvent('KeyN', { repeat: true }));
  assert.equal(input.poll().typed, 'nn', 'a fresh press types and repeats again');
});

// ---------- 6. gifts must be guarded; S picks the berries straight ahead ----------

test('dialogue problems: a gift that can be handed over again and again is reported', () => {
  const { VL } = loadGame();
  VL.defineDialogue('farm', [{ say: 'Wood for you, every time!', give: { wood: 2 } }]);
  VL.defineDialogue('halfGuarded', [
    { when: { notFlag: 'gave:a' }, say: 'x', set: ['gave:a', 'gave:b'], give: { wood: 1 } },
    { say: 'z' },
  ]);
  VL.defineDialogue('guarded', [
    { when: { notFlag: 'gave:wood' }, say: 'x', set: 'gave:wood', give: { wood: 2 } },
    { when: { notItem: 'woodSword' }, say: 'y', give: { item: 'woodSword' } },
    { say: 'z' },
  ]);
  VL.defineDialogue('meantToRepeat', [{ say: 'Have a berry.', give: { berries: 1 }, repeat: true }]);
  const problems = VL.dialogueProblems().join('\n');
  assert.match(problems, /farm: entry 1 gives a gift without a guard/);
  assert.match(problems, /halfGuarded: entry 1 gives a gift without a guard/);
  assert.doesNotMatch(problems, /guarded: entry/);
  assert.doesNotMatch(problems, /meantToRepeat/);
});

test('S at a berry bush straight ahead picks berries, even with a person on the half-faced tile', () => {
  const { VL } = loadGame();
  VL.defineNpc('picker', { name: 'Pip', look: 'townsfolk' });
  VL.defineDialogue('picker', [{ say: 'Hi!' }]);
  VL.addScreens('berries', {
    '0,0': {
      tiles: [
        'TTTTTTTTTTTTTTTT',
        'T..............T',
        'T..............T',
        'T..............T',
        'T......Y.......T',
        'T..............T',
        'T..............T',
        'T..............T',
        'T..............T',
        'T..............T',
        'TTTTTTTTTTTTTTTT',
      ],
      entities: [{ type: 'npc', id: 'picker', x: 8, y: 4 }],
    },
  });
  const state = playState(VL, { area: 'berries', screen: '0,0', tx: 7, ty: 5, facing: 'up' });
  state.player.x += 5;
  const reach = VL.facingTiles(state).map(({ tx, ty }) => `${tx},${ty}`);
  assert.deepEqual([...reach], ['7,4', '8,4']);
  assert.equal(VL.interact(state), true);
  assert.ok(state.inventory.berries > 0, 'berries picked');
  assert.equal(state.sceneRequest, null, 'no talk');
  // With the bush picked, the next S talks to Pip.
  VL.interact(state);
  assert.equal(state.sceneRequest?.id, 'dialogue');
});

// ---------- 7. standing still is never a fast faint ----------

// Kids stop to look around; the walk-past budget (combat.test.js) misses that.
test('damage budget: standing still for 10 s on any open tile of an enemy screen costs at most 4 half hearts', () => {
  const { VL } = loadGame();
  const SECONDS = 10;
  const BUDGET = 4;
  const over = [];
  let checked = 0;
  for (const [key, screen] of Object.entries(VL.AREAS.overworld.screens)) {
    if (!screen.entities.some((e) => VL.ENEMIES[e.type])) continue;
    for (let ty = 0; ty < VL.TUNING.rows; ty += 1) {
      for (let tx = 0; tx < VL.TUNING.cols; tx += 1) {
        if (VL.isSolidAt('overworld', key, tx, ty)) continue;
        const app = playApp(VL);
        app.game.popups.seen.controls = true;
        VL.place(app.game, { area: 'overworld', screen: key, tx, ty, facing: 'up' });
        app.game.maxHp = 999;
        app.game.hp = 999;
        for (let s = 0; s < SECONDS && app.game.player.screen === key; s += STEP) app.update(VL.noActions(), STEP);
        const lost = 999 - app.game.hp;
        if (lost > BUDGET) over.push(`${key} at ${tx},${ty}: ${lost}`);
        checked += 1;
      }
    }
  }
  assert.ok(checked > 1000, `${checked} tiles checked`);
  assert.deepEqual(over, []);
});

test('the Hollow Oak spitters are on different rows, so no tile is in both lines of fire', () => {
  const { VL } = loadGame();
  const rows = VL.AREAS.overworld.screens['7,-2'].entities.filter((e) => e.type === 'spitter').map((e) => e.y);
  assert.equal(rows.length, 2);
  assert.notEqual(rows[0], rows[1]);
});

module.exports = { titleApp, press, type, STEP };
