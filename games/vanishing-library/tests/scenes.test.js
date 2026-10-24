// Scenes (W2): title and slots, on-canvas name entry, the intro, pause with
// Save & Quit, autosave, fainting; and the typed-text input they need.
const assert = require('node:assert/strict');
const { test, read, loadGame, addFixtureWorld, memoryStorage, fakeDocument, fakeWindow, keyEvent } = require('./harness');
const { createPlaythrough } = require('./playthrough');

const blocked = () => {
  throw new Error('blocked');
};
const throwingStorage = { getItem: blocked, setItem: blocked, removeItem: blocked };

const STEP = 1 / 60;
const press = (VL, app, action) => app.update(VL.actions({ pressed: [action] }), STEP);
const type = (VL, app, typed) => app.update(VL.actions({ typed }), STEP);
const wait = (VL, app, seconds, held = []) => {
  for (let t = 0; t < seconds - 1e-9; t += STEP) app.update(VL.actions({ held }), STEP);
};

// An app with a memory store, on the title screen.
function titleApp(VL, backing = memoryStorage()) {
  return { app: VL.createApp({ storage: VL.createStorage(backing) }), backing };
}

// Drives title → name → intro → play for a new game in slot `slot`.
function newGameTo(VL, app, name, slot = 0, stopAt = 'play') {
  for (let i = 0; i < slot; i += 1) press(VL, app, 'down');
  press(VL, app, 'confirm');
  assert.equal(app.sceneId, 'name');
  type(VL, app, name);
  press(VL, app, 'confirm');
  assert.equal(app.sceneId, 'intro');
  if (stopAt === 'intro') return;
  wait(VL, app, 1);
  press(VL, app, 'interact');
  assert.equal(app.sceneId, 'play');
  // W5's controls popup opens on the first step of play; read and close it
  // in exactly one second, so the HUD's blinking notes keep their phase.
  wait(VL, app, 1 - STEP);
  assert.equal(app.sceneId, 'popup');
  press(VL, app, 'interact');
  assert.equal(app.sceneId, 'play');
}

// Records every string the kit draws during a draw.
function drawnText(VL, document, app, t = 0) {
  const strings = [];
  const original = VL.ART.text;
  VL.ART.text = (ctx, str, ...rest) => {
    strings.push(String(str));
    return original(ctx, str, ...rest);
  };
  const ctx = document.createElement('canvas').getContext('2d');
  VL.render(ctx, app, t);
  VL.ART.text = original;
  return strings;
}

// ---------- input: Enter, Backspace, typed text ----------

test('Enter confirms, Backspace and Delete erase, and typed text is collected per poll', () => {
  const { VL } = loadGame();
  const win = fakeWindow();
  const input = VL.createKeyboardInput(win, fakeDocument());
  assert.ok(VL.ACTIONS.includes('confirm') && VL.ACTIONS.includes('erase'));
  win.dispatch('keydown', keyEvent('Enter'));
  assert.equal(input.poll().pressed.confirm, true);
  win.dispatch('keyup', keyEvent('Enter'));
  win.dispatch('keydown', keyEvent('NumpadEnter', { key: 'Enter' }));
  assert.equal(input.poll().pressed.confirm, true);
  win.dispatch('keyup', keyEvent('NumpadEnter', { key: 'Enter' }));
  for (const code of ['Backspace', 'Delete']) {
    const event = keyEvent(code);
    win.dispatch('keydown', event);
    assert.equal(event.prevented, true, `${code} is prevented`);
    const actions = input.poll();
    assert.equal(actions.pressed.erase, true, code);
    assert.equal(actions.typed, '\b', `${code} erases in the name field`);
    win.dispatch('keyup', keyEvent(code));
  }
  // Typed characters never reach the browser (Firefox opens Quick Find on ' and /).
  for (const key of ["'", '/', 'r']) {
    const event = keyEvent('Quote', { key });
    win.dispatch('keydown', event);
    assert.equal(event.prevented, true, `${key} is prevented`);
  }
  input.poll();
  for (const key of ['R', 'o', 'b', ' ', '1', '!']) win.dispatch('keydown', keyEvent(`Key${key.toUpperCase()}`, { key }));
  win.dispatch('keydown', keyEvent('KeyB', { key: 'b', repeat: true }));
  win.dispatch('keydown', keyEvent('Backspace'));
  win.dispatch('keydown', keyEvent('Backspace', { repeat: true }));
  const actions = input.poll();
  assert.equal(actions.typed, 'Rob 1!b\b\b', 'repeats type again; Backspace types \\b');
  assert.equal(input.poll().typed, '', 'cleared by the poll');
  win.dispatch('keydown', keyEvent('ArrowLeft'));
  win.dispatch('keydown', keyEvent('Escape'));
  win.dispatch('keydown', keyEvent('ShiftLeft', { key: 'Shift' }));
  assert.equal(input.poll().typed, '', 'only printable characters are typed');
});

test('typed text leaves modifier chords, text fields and the header controls alone', () => {
  const { VL } = loadGame();
  const win = fakeWindow();
  const input = VL.createKeyboardInput(win, fakeDocument());
  win.dispatch('keydown', keyEvent('KeyR', { key: 'r', metaKey: true }));
  win.dispatch('keydown', keyEvent('KeyR', { key: 'r', target: { tagName: 'INPUT' } }));
  win.dispatch('keydown', keyEvent('Space', { key: ' ', target: { tagName: 'BUTTON' } }));
  assert.equal(input.poll().typed, '');
  // Enter activates a focused button or link, so it is theirs, not a confirm.
  for (const tagName of ['BUTTON', 'A']) {
    const enter = keyEvent('Enter', { target: { tagName } });
    win.dispatch('keydown', enter);
    assert.equal(enter.prevented, false, `${tagName} keeps Enter`);
    assert.equal(input.poll().pressed.confirm, false, `${tagName} keeps Enter`);
    win.dispatch('keyup', keyEvent('Enter'));
  }
  const onCanvas = keyEvent('Enter', { target: { tagName: 'CANVAS' } });
  win.dispatch('keydown', onCanvas);
  assert.equal(onCanvas.prevented, true);
  assert.equal(input.poll().pressed.confirm, true);
});

test('actions carry typed text; heldOnly drops it', () => {
  const { VL } = loadGame();
  assert.equal(VL.noActions().typed, '');
  const actions = VL.actions({ typed: 'ab', pressed: ['confirm'] });
  assert.equal(actions.typed, 'ab');
  assert.equal(VL.heldOnly(actions).typed, '');
  assert.equal(VL.confirmed(VL.actions({ pressed: ['confirm'] })), true);
  assert.equal(VL.confirmed(VL.actions({ pressed: ['interact'] })), true);
  assert.equal(VL.confirmed(VL.actions({ pressed: ['mainHand'] })), true);
  assert.equal(VL.confirmed(VL.actions({ pressed: ['offHand'] })), false);
});

// ---------- the start ----------

test('the game starts on the title screen with the app holding its storage', () => {
  const { VL } = loadGame();
  assert.equal(VL.START_SCENE, 'title');
  const bare = VL.createApp();
  assert.equal(bare.sceneId, 'title');
  assert.equal(bare.game, null);
  assert.equal(bare.slot, null);
  assert.equal(bare.storage.ok, false, 'no storage given: saving is off');
  const { app } = titleApp(VL);
  assert.equal(app.storage.ok, true);
});

test('new game: slot → typed name → intro → play, saved as soon as it is named', () => {
  const { VL } = loadGame();
  const { app, backing } = titleApp(VL);
  press(VL, app, 'confirm');
  assert.equal(app.sceneId, 'name');
  type(VL, app, 'Robin');
  assert.equal(app.naming.text, 'Robin');
  press(VL, app, 'confirm');
  assert.equal(app.sceneId, 'intro');
  assert.equal(app.game.name, 'Robin');
  assert.equal(app.slot, 0);
  assert.equal(JSON.parse(backing.getItem('vanishing-library-slot-1')).name, 'Robin', 'the slot holds the new game');
  press(VL, app, 'confirm');
  assert.equal(app.sceneId, 'intro', 'a press in the first moments does not skip');
  wait(VL, app, 1);
  press(VL, app, 'interact');
  assert.equal(app.sceneId, 'play');
  assert.equal(app.game.player.area, VL.START.area, 'the hero stands outside the hut');
});

test('name entry: 12 characters at most, backspace, only characters the font has, Hero by default', () => {
  const { VL } = loadGame();
  const { app } = titleApp(VL);
  press(VL, app, 'confirm');
  type(VL, app, 'Bartholomew Quill');
  assert.equal(app.naming.text, 'Bartholomew ');
  type(VL, app, '\b\b\b\b\b');
  assert.equal(app.naming.text, 'Barthol');
  type(VL, app, '€{');
  assert.equal(app.naming.text, 'Barthol', 'characters the font cannot draw are ignored');
  type(VL, app, '\b\b\b\b\b\b\b\b\b\b');
  assert.equal(app.naming.text, '');
  // Game keys are letters here: S and E type nothing and do nothing.
  press(VL, app, 'interact');
  press(VL, app, 'equipment');
  press(VL, app, 'mainHand');
  assert.equal(app.sceneId, 'name');
  assert.equal(app.game, null);
  type(VL, app, '   ');
  press(VL, app, 'confirm');
  assert.equal(app.game.name, 'Hero', 'blank name defaults');
  assert.equal(app.sceneId, 'intro');
});

test('the name scene is text entry, so letter shortcuts (W21 mute on N) stay off while typing', () => {
  const { VL } = loadGame();
  assert.equal(VL.SCENES.name.textEntry, true);
  for (const id of ['title', 'intro', 'pause', 'fainted', 'play']) assert.equal(Boolean(VL.SCENES[id].textEntry), false, id);
});

test('name entry trims spaces and Esc goes back to the title without a game', () => {
  const { VL } = loadGame();
  const { app, backing } = titleApp(VL);
  press(VL, app, 'down');
  press(VL, app, 'confirm');
  assert.equal(app.naming.slot, 1);
  type(VL, app, ' Kai ');
  press(VL, app, 'pause');
  assert.equal(app.sceneId, 'title');
  assert.equal(app.game, null);
  assert.equal(app.title.cursor, 1, 'back on the slot that was chosen');
  assert.equal(backing.map.size, 0);
  press(VL, app, 'confirm');
  type(VL, app, ' Kai ');
  press(VL, app, 'confirm');
  assert.equal(app.game.name, 'Kai');
  assert.equal(app.slot, 1);
});

test('the intro shows the three weathered lines, then plays on its own', () => {
  const { VL, document } = loadGame();
  assert.equal(VL.INTRO_LINES.length, 3);
  assert.equal(VL.INTRO_LINES.join(' '), 'In a world where books mysteriously disappear, one brave adventurer has set out to save his culture from oblivion...');
  for (const line of VL.INTRO_LINES) {
    assert.deepEqual([...VL.ART.missingGlyphs(line)], [], line);
    assert.ok(VL.ART.wrapText(line, 232).length <= 2, 'each line fits in two rows');
  }
  const { app } = titleApp(VL);
  newGameTo(VL, app, 'Ash', 0, 'intro');
  const early = drawnText(VL, document, app, 0.1);
  assert.equal(early.some((s) => s.includes('oblivion')), false, 'the last line is not up yet');
  wait(VL, app, VL.INTRO.lineDelay * 2 + VL.INTRO.fade + 0.1);
  const late = drawnText(VL, document, app, 8);
  assert.ok(late.some((s) => s.includes('oblivion')), 'the last line has faded in');
  wait(VL, app, VL.INTRO.total);
  assert.equal(app.sceneId, 'popup', 'the intro ends by itself, into play with the controls popup (W5)');
  assert.equal(VL.currentPopup(app.game).id, 'controls');
});

// ---------- title and slots ----------

test('the title lists the three slots with name, hearts and books, Empty or Damaged', () => {
  const { VL, document } = loadGame();
  const backing = memoryStorage();
  const storage = VL.createStorage(backing);
  const kai = VL.newGame({ name: 'Kai' });
  kai.maxHp = 10;
  VL.saveSlot(storage, 1, kai);
  backing.setItem(VL.slotKey(2), '{broken');
  const app = VL.createApp({ storage });
  assert.deepEqual([...app.title.slots.map((s) => s.status)], ['empty', 'ok', 'damaged']);
  const strings = drawnText(VL, document, app);
  assert.ok(strings.some((s) => /Empty/i.test(s)));
  assert.ok(strings.some((s) => s.includes('Kai')));
  assert.ok(strings.some((s) => /Damaged/i.test(s)));
  assert.ok(strings.some((s) => /books/i.test(s)));
  assert.ok(!strings.some((s) => /saving is off/i.test(s)), 'no storage note when saving works');
});

test('title cursor moves and wraps; a damaged slot cannot be started; a saved one continues at full hearts', () => {
  const { VL } = loadGame();
  const backing = memoryStorage();
  const storage = VL.createStorage(backing);
  const kai = VL.newGame({ name: 'Kai' });
  kai.hp = 1;
  kai.flags.chest = true;
  VL.touchSavePoint(kai, { area: 'hut', screen: '0,0', tx: 3, ty: 2 });
  VL.saveSlot(storage, 1, kai);
  backing.setItem(VL.slotKey(2), '{broken');
  const app = VL.createApp({ storage });
  assert.equal(app.title.cursor, 0);
  press(VL, app, 'up');
  assert.equal(app.title.cursor, 2, 'wraps upwards');
  press(VL, app, 'confirm');
  assert.equal(app.sceneId, 'title', 'a damaged slot does not start');
  assert.equal(app.game, null);
  press(VL, app, 'down');
  assert.equal(app.title.cursor, 0, 'wraps downwards');
  press(VL, app, 'down');
  press(VL, app, 'confirm');
  assert.equal(app.sceneId, 'play');
  assert.equal(app.slot, 1);
  assert.equal(app.game.name, 'Kai');
  assert.equal(app.game.hp, app.game.maxHp);
  assert.equal(app.game.flags.chest, true);
  assert.equal(app.game.player.area, 'hut');
});

test('a save from a newer game shows as needing a newer page: no delete, no start, untouched', () => {
  const { VL, document } = loadGame();
  const backing = memoryStorage();
  const storage = VL.createStorage(backing);
  const text = JSON.stringify({ v: VL.saveVersion() + 1, name: 'Kai', maxHp: 12, flags: { lots: true }, visited: {} });
  backing.setItem(VL.slotKey(0), text);
  const app = VL.createApp({ storage });
  assert.equal(app.title.slots[0].status, 'newer');
  const strings = drawnText(VL, document, app);
  assert.ok(strings.some((s) => /newer/i.test(s)), 'says it was saved by a newer game');
  assert.ok(strings.some((s) => /reload/i.test(s)), 'says to reload the page');
  assert.ok(!strings.some((s) => /damaged/i.test(s)));
  assert.ok(!strings.some((s) => /delete it/i.test(s)), 'no delete hint on the card');
  press(VL, app, 'erase');
  assert.equal(app.title.confirmDelete, false, 'cannot be deleted');
  press(VL, app, 'confirm');
  assert.equal(app.sceneId, 'title', 'cannot be started');
  assert.equal(app.game, null);
  assert.equal(backing.getItem(VL.slotKey(0)), text, 'left exactly as it was');
});

test('the muted icon and its note sit under the shore on the title, not over the title text', () => {
  const { VL, document } = loadGame();
  assert.ok(VL.SCENES.title.soundIndicator, 'the title says where the sound indicator goes');
  const app = VL.createApp({ storage: VL.createStorage(memoryStorage()) });
  const sprites = [];
  const texts = [];
  const { drawSprite, text } = VL.ART;
  VL.ART.drawSprite = (ctx, name, x, y, ...rest) => {
    sprites.push({ name, x, y });
    return drawSprite(ctx, name, x, y, ...rest);
  };
  VL.ART.text = (ctx, str, x, y, ...rest) => {
    texts.push({ str: String(str), x, y });
    return text(ctx, str, x, y, ...rest);
  };
  const ctx = document.createElement('canvas').getContext('2d');
  VL.SOUND.toggleMute();
  assert.equal(VL.SOUND.muted, true);
  VL.render(ctx, app, 0.2);
  VL.SOUND.drawIndicator(ctx, app, 0.2);
  VL.ART.drawSprite = drawSprite;
  VL.ART.text = text;
  const icon = sprites.find((s) => s.name === 'icon-sound-off');
  assert.ok(icon, 'the muted icon is drawn');
  assert.ok(icon.y >= 140 && icon.y + 7 <= VL.TUNING.height && icon.x + 9 <= VL.TUNING.width, `icon at ${icon.x},${icon.y}`);
  const note = texts.find((s) => s.str === VL.SOUND.NOTE.off);
  assert.ok(note, 'the note is drawn');
  assert.ok(note.y >= 140, `note at ${note.x},${note.y}`);
  VL.SOUND.setMuted(false);
});

test('typing N in the name field types a letter; on the title N toggles mute', () => {
  const { VL, window } = loadGame();
  const app = VL.createApp({ storage: VL.createStorage(memoryStorage()) });
  VL.app = app;
  press(VL, app, 'confirm');
  assert.equal(app.sceneId, 'name');
  window.dispatch('keydown', keyEvent('KeyN', { key: 'n' }));
  assert.equal(VL.SOUND.muted, false, 'no mute while naming');
  press(VL, app, 'pause');
  assert.equal(app.sceneId, 'title');
  window.dispatch('keydown', keyEvent('KeyN', { key: 'n' }));
  assert.equal(VL.SOUND.muted, true, 'N mutes on the title');
  VL.SOUND.setMuted(false);
});

test('deleting a slot asks first, defaults to No, and erases on Yes', () => {
  const { VL, document } = loadGame();
  const backing = memoryStorage();
  const storage = VL.createStorage(backing);
  VL.saveSlot(storage, 0, VL.newGame({ name: 'Kai' }));
  backing.setItem(VL.slotKey(1), '{broken');
  const app = VL.createApp({ storage });
  press(VL, app, 'erase');
  assert.equal(app.title.confirmDelete, true);
  assert.ok(drawnText(VL, document, app).some((s) => s.includes('Kai') && /delete/i.test(s)), 'asks by name');
  press(VL, app, 'confirm');
  assert.equal(app.title.confirmDelete, false);
  assert.equal(VL.readSlot(storage, 0).status, 'ok', 'No is the default');
  press(VL, app, 'erase');
  press(VL, app, 'pause');
  assert.equal(app.title.confirmDelete, false, 'Esc cancels');
  assert.equal(VL.readSlot(storage, 0).status, 'ok');
  press(VL, app, 'erase');
  press(VL, app, 'left');
  press(VL, app, 'confirm');
  assert.equal(VL.readSlot(storage, 0).status, 'empty');
  assert.equal(app.title.slots[0].status, 'empty', 'the list refreshes');
  press(VL, app, 'erase');
  assert.equal(app.title.confirmDelete, false, 'nothing to delete on an empty slot');
  press(VL, app, 'down');
  press(VL, app, 'erase');
  assert.equal(app.title.confirmDelete, true, 'a damaged slot can be deleted');
  press(VL, app, 'right');
  press(VL, app, 'left');
  press(VL, app, 'confirm');
  assert.equal(app.title.slots[1].status, 'empty');
});

// ---------- play: autosave, pause, fainting ----------

test('earning anything in play autosaves to the slot and flashes Saved', () => {
  const { VL, document } = loadGame();
  addFixtureWorld(VL);
  const { app, backing } = titleApp(VL);
  newGameTo(VL, app, 'Robin');
  const game = app.game;
  VL.place(game, { area: 'test', screen: '0,0', tx: 8, ty: 2 });
  game.flags.chest = true;
  const before = backing.getItem('vanishing-library-slot-1');
  wait(VL, app, 0.2);
  assert.equal(backing.getItem('vanishing-library-slot-1'), before, 'nothing saves until something is earned');
  VL.earned(game);
  app.update(VL.noActions(), STEP);
  assert.equal(game.dirty, false);
  assert.equal(JSON.parse(backing.getItem('vanishing-library-slot-1')).flags.chest, true);
  assert.ok(drawnText(VL, document, app, app.time).some((s) => /saved/i.test(s)), 'the Saved flash');
  wait(VL, app, 3);
  assert.ok(!drawnText(VL, document, app, app.time).some((s) => /saved/i.test(s)), 'the flash fades');
  // A save point is an earning too: stand on one.
  VL.AREAS.test.screens['0,0'].entities.push({ type: 'savePoint', x: 8, y: 1 });
  VL.place(game, { area: 'test', screen: '0,0', tx: 8, ty: 2 });
  wait(VL, app, 0.3, ['up']);
  const saved = JSON.parse(backing.getItem('vanishing-library-slot-1'));
  assert.deepEqual([saved.savePoint.tx, saved.savePoint.ty], [8, 1]);
});

test('Esc pauses: the world freezes, Resume continues, Save & Quit saves and returns to the title', () => {
  const { VL, document } = loadGame();
  addFixtureWorld(VL);
  const { app, backing } = titleApp(VL);
  newGameTo(VL, app, 'Robin');
  const game = app.game;
  VL.place(game, { area: 'test', screen: '0,0', tx: 8, ty: 2 });
  press(VL, app, 'pause');
  assert.equal(app.sceneId, 'pause');
  const x = game.player.x;
  wait(VL, app, 0.5, ['right']);
  assert.equal(game.player.x, x, 'paused');
  const paused = drawnText(VL, document, app);
  assert.ok(paused.some((s) => /resume/i.test(s)));
  assert.ok(paused.some((s) => /N: SOUND ON\/OFF/.test(s)), 'lists the sound key for W21');
  assert.ok(!paused.some((s) => /\bF\b/.test(s)), 'chicken flight stays a secret');
  assert.ok(!paused.some((s) => s.includes('␣')), 'Space is not mentioned before a main-hand item');
  game.items.woodSword = true;
  game.hands.mainHand = 'woodSword';
  assert.ok(drawnText(VL, document, app).some((s) => s.includes('␣ MAIN HAND')), 'and is once the hero holds one');
  press(VL, app, 'pause');
  assert.equal(app.sceneId, 'play', 'Esc resumes');
  press(VL, app, 'pause');
  press(VL, app, 'confirm');
  assert.equal(app.sceneId, 'play', 'Resume is the first choice');
  game.flags.chest = true;
  press(VL, app, 'pause');
  press(VL, app, 'down');
  press(VL, app, 'confirm');
  assert.equal(app.sceneId, 'title');
  assert.equal(app.game, null);
  assert.equal(app.slot, null);
  assert.equal(JSON.parse(backing.getItem('vanishing-library-slot-1')).flags.chest, true, 'Save & Quit saved');
  assert.equal(app.title.slots[0].summary.name, 'Robin', 'the title shows the saved game');
});

test('a failed write keeps the game dirty, says so on the canvas, retries, and Save & Quit stays put', () => {
  const { VL, document } = loadGame();
  addFixtureWorld(VL);
  const { app, backing } = titleApp(VL);
  newGameTo(VL, app, 'Kai');
  const game = app.game;
  VL.place(game, { area: 'test', screen: '0,0', tx: 8, ty: 2 });
  const working = backing.setItem;
  backing.setItem = () => {
    const error = new Error('QuotaExceededError');
    error.name = 'QuotaExceededError';
    throw error;
  };
  game.flags.chest = true;
  VL.earned(game);
  app.update(VL.noActions(), STEP);
  assert.equal(game.dirty, true, 'still dirty after the failed write');
  assert.equal(app.storage.ok, true);
  assert.equal(JSON.parse(backing.getItem('vanishing-library-slot-1')).flags.chest, undefined);
  assert.ok(drawnText(VL, document, app, app.time).some((s) => /could not save/i.test(s)), 'the play scene says so');
  assert.ok(!drawnText(VL, document, app, app.time).some((s) => /^saved$/i.test(s)), 'no SAVED flash');
  press(VL, app, 'pause');
  assert.ok(drawnText(VL, document, app).some((s) => /could not save/i.test(s)), 'the pause menu says so');
  press(VL, app, 'down');
  press(VL, app, 'confirm');
  assert.equal(app.sceneId, 'pause', 'Save & Quit does not pretend it saved');
  assert.equal(app.game, game);
  // The browser frees space: the next step's retry writes and the note goes.
  backing.setItem = working;
  app.update(VL.noActions(), STEP);
  assert.equal(game.dirty, false);
  assert.equal(JSON.parse(backing.getItem('vanishing-library-slot-1')).flags.chest, true);
  assert.ok(!drawnText(VL, document, app).some((s) => /could not save/i.test(s)));
  press(VL, app, 'confirm');
  assert.equal(app.sceneId, 'title', 'Save & Quit works again');
});

test('when saving keeps failing, a second Save & Quit asks to quit without saving, No by default', () => {
  const { VL, document } = loadGame();
  addFixtureWorld(VL);
  const { app, backing } = titleApp(VL);
  newGameTo(VL, app, 'Kai');
  const game = app.game;
  VL.place(game, { area: 'test', screen: '0,0', tx: 8, ty: 2 });
  const working = backing.setItem;
  let writes = 0;
  backing.setItem = () => {
    writes += 1;
    throw new Error('QuotaExceededError');
  };
  game.flags.chest = true;
  VL.earned(game);
  press(VL, app, 'pause');
  const asking = () => drawnText(VL, document, app).some((s) => /quit without saving/i.test(s));
  assert.equal(asking(), false, 'not asked before Save & Quit');
  press(VL, app, 'down');
  press(VL, app, 'confirm');
  assert.equal(app.sceneId, 'pause', 'the first press only tries to save');
  assert.equal(asking(), false, 'one press never asks');
  press(VL, app, 'confirm');
  assert.equal(asking(), true, 'the second press asks');
  const dialog = drawnText(VL, document, app);
  assert.ok(dialog.some((s) => /grown-up/i.test(s)), 'tells the kid who can help');
  press(VL, app, 'confirm');
  assert.equal(app.sceneId, 'pause', 'No is the default: an accidental press does not quit');
  assert.equal(asking(), false, 'No goes back to the pause menu');
  assert.equal(app.game, game);
  assert.equal(game.dirty, true, 'and keeps retrying');
  const before = writes;
  app.update(VL.noActions(), STEP);
  assert.ok(writes > before, 'retried');
  // Esc in the dialog is No too, and does not leave the pause menu.
  press(VL, app, 'confirm');
  assert.equal(asking(), true, 'asks again straight away after a failed try');
  press(VL, app, 'pause');
  assert.equal(app.sceneId, 'pause');
  assert.equal(asking(), false);
  // Yes quits to the title without writing.
  press(VL, app, 'confirm');
  press(VL, app, 'left');
  backing.setItem = working;
  const stored = backing.getItem('vanishing-library-slot-1');
  let wrote = false;
  backing.setItem = (...args) => {
    wrote = true;
    return working(...args);
  };
  press(VL, app, 'confirm');
  assert.equal(app.sceneId, 'title');
  assert.equal(app.game, null);
  assert.equal(wrote, false, 'Yes does not write');
  assert.equal(backing.getItem('vanishing-library-slot-1'), stored);
  assert.equal(app.title.slots[0].summary.name, 'Kai', 'the last good save is still there');
});

test('when saving works, a second Save & Quit press never asks to quit without saving', () => {
  const { VL, document } = loadGame();
  addFixtureWorld(VL);
  const { app } = titleApp(VL);
  newGameTo(VL, app, 'Robin');
  press(VL, app, 'pause');
  press(VL, app, 'down');
  press(VL, app, 'confirm');
  assert.equal(app.sceneId, 'title', 'one press saves and quits');
  // A failing first try that then succeeds quits normally on the second press.
  const { app: app2, backing } = titleApp(VL);
  newGameTo(VL, app2, 'Ash');
  const working = backing.setItem;
  backing.setItem = () => {
    throw new Error('full');
  };
  VL.earned(app2.game);
  press(VL, app2, 'pause');
  press(VL, app2, 'down');
  press(VL, app2, 'confirm');
  assert.equal(app2.sceneId, 'pause');
  backing.setItem = working;
  press(VL, app2, 'confirm');
  assert.equal(app2.sceneId, 'title', 'saved this time: no question');
  assert.ok(!drawnText(VL, document, app2).some((s) => /quit without saving/i.test(s)));
});

test('an earning in any scene is saved the same step, not only in play', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  const { app, backing } = titleApp(VL);
  newGameTo(VL, app, 'Kai');
  VL.defineScene('earningScene', {
    update(a) {
      a.game.flags.bought = true;
      VL.earned(a.game);
    },
    draw() {},
  });
  app.setScene('earningScene');
  app.update(VL.noActions(), STEP);
  assert.equal(app.game.dirty, false);
  assert.equal(JSON.parse(backing.getItem('vanishing-library-slot-1')).flags.bought, true);
});

test('two windows on one slot: the stale one stops instead of overwriting the newer progress', () => {
  const { VL, document } = loadGame();
  addFixtureWorld(VL);
  const backing = memoryStorage();
  const a = VL.createApp({ storage: VL.createStorage(backing) });
  newGameTo(VL, a, 'Kai');
  const b = VL.createApp({ storage: VL.createStorage(backing) });
  press(VL, b, 'confirm');
  assert.equal(b.sceneId, 'play');
  b.game.flags.bookOne = true;
  VL.earned(b.game);
  b.update(VL.noActions(), STEP);
  assert.equal(JSON.parse(backing.getItem(VL.slotKey(0))).flags.bookOne, true);
  // Window A, which knows nothing of that, earns a shell.
  a.game.flags.shell = true;
  VL.earned(a.game);
  a.update(VL.noActions(), STEP);
  const saved = JSON.parse(backing.getItem(VL.slotKey(0)));
  assert.equal(saved.flags.bookOne, true, 'window B\'s book is kept');
  assert.equal(saved.flags.shell, undefined, 'window A did not write');
  assert.equal(a.sceneId, 'conflict');
  assert.ok(drawnText(VL, document, a).some((s) => /another window/i.test(s)), 'window A is told');
  press(VL, a, 'interact');
  assert.equal(a.sceneId, 'title');
  assert.equal(a.title.slots[0].status, 'ok');
  assert.equal(a.game, null);
  // Window B plays on untouched.
  b.game.flags.bookTwo = true;
  VL.earned(b.game);
  b.update(VL.noActions(), STEP);
  assert.equal(b.sceneId, 'play');
  assert.equal(JSON.parse(backing.getItem(VL.slotKey(0))).flags.bookTwo, true);
  // Save & Quit in a stale window is refused the same way.
  const c = VL.createApp({ storage: VL.createStorage(backing) });
  press(VL, c, 'confirm');
  b.game.flags.bookThree = true;
  VL.earned(b.game);
  b.update(VL.noActions(), STEP);
  press(VL, c, 'pause');
  press(VL, c, 'down');
  press(VL, c, 'confirm');
  assert.equal(c.sceneId, 'conflict');
  assert.equal(JSON.parse(backing.getItem(VL.slotKey(0))).flags.bookThree, true);
});

test('a stale Empty card never overwrites a game another window made in that slot since', () => {
  const { VL, document } = loadGame();
  addFixtureWorld(VL);
  const backing = memoryStorage();
  const a = VL.createApp({ storage: VL.createStorage(backing) });
  assert.equal(a.title.slots[0].status, 'empty');
  const b = VL.createApp({ storage: VL.createStorage(backing) });
  newGameTo(VL, b, 'Kai');
  b.game.flags.bookOne = true;
  VL.earned(b.game);
  b.update(VL.noActions(), STEP);
  // Window A, still showing Empty, names a hero for the same slot.
  press(VL, a, 'confirm');
  assert.equal(a.sceneId, 'name');
  type(VL, a, 'Zed');
  press(VL, a, 'confirm');
  const saved = JSON.parse(backing.getItem(VL.slotKey(0)));
  assert.equal(saved.name, 'Kai', 'Kai\'s game is kept');
  assert.equal(saved.flags.bookOne, true);
  assert.equal(a.sceneId, 'conflict');
  assert.ok(drawnText(VL, document, a).some((s) => /another window/i.test(s)), 'window A is told');
  press(VL, a, 'interact');
  assert.equal(a.sceneId, 'title');
  assert.equal(a.title.slots[0].summary.name, 'Kai', 'the title now shows Kai');
});

test('a slot that vanished under a playing window is written back, not reported as a newer game', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  const { app, backing } = titleApp(VL);
  newGameTo(VL, app, 'Kai');
  backing.removeItem(VL.slotKey(0)); // site data cleared, or deleted from another window
  app.game.flags.bookOne = true;
  VL.earned(app.game);
  app.update(VL.noActions(), STEP);
  assert.equal(app.sceneId, 'play');
  assert.equal(app.saveConflict, false);
  assert.equal(JSON.parse(backing.getItem(VL.slotKey(0))).flags.bookOne, true, 'the game is saved again');
});

test('a read that throws is a failed save that keeps trying, not a conflict', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  const { app, backing } = titleApp(VL);
  newGameTo(VL, app, 'Kai');
  const working = backing.getItem;
  backing.getItem = blocked;
  app.game.flags.bookOne = true;
  VL.earned(app.game);
  app.update(VL.noActions(), STEP);
  assert.equal(app.sceneId, 'play');
  assert.equal(app.saveConflict, false);
  assert.equal(app.saveFailed, true);
  assert.equal(app.game.dirty, true, 'still dirty, so the write is retried');
  backing.getItem = working;
  app.update(VL.noActions(), STEP);
  assert.equal(app.saveFailed, false);
  assert.equal(JSON.parse(backing.getItem(VL.slotKey(0))).flags.bookOne, true, 'the retry wrote it');
});

test('deleting from a stale card refreshes the title instead of deleting what another window saved there', () => {
  const { VL, document } = loadGame();
  const backing = memoryStorage();
  const storage = VL.createStorage(backing);
  VL.saveSlot(storage, 0, VL.newGame({ name: 'Kai' }));
  const app = VL.createApp({ storage });
  press(VL, app, 'erase');
  assert.ok(drawnText(VL, document, app).some((s) => s.includes('Kai') && /delete/i.test(s)));
  // Another window plays on in that slot while the dialog is open.
  VL.saveSlot(storage, 0, VL.newGame({ name: 'Zed' }));
  press(VL, app, 'left');
  press(VL, app, 'confirm');
  assert.equal(app.title.confirmDelete, false, 'the dialog closes');
  assert.equal(VL.readSlot(storage, 0).summary.name, 'Zed', 'the newer save is kept');
  assert.equal(app.title.slots[0].summary.name, 'Zed', 'the card shows what is really there');
  press(VL, app, 'erase');
  press(VL, app, 'left');
  press(VL, app, 'confirm');
  assert.equal(VL.readSlot(storage, 0).status, 'empty', 'deleting what the card shows works');
});

test('a slot card with more than ten hearts shows one heart and a count instead of overlapping rows', () => {
  const { VL, document } = loadGame();
  const storage = VL.createStorage(memoryStorage());
  const kai = VL.newGame({ name: 'Kai' });
  kai.maxHp = 24;
  VL.saveSlot(storage, 0, kai);
  const robin = VL.newGame({ name: 'Robin' });
  robin.maxHp = 20;
  VL.saveSlot(storage, 1, robin);
  const app = VL.createApp({ storage });
  const sprites = [];
  const texts = [];
  const { drawSprite, text } = VL.ART;
  VL.ART.drawSprite = (ctx, name, x, y, ...rest) => {
    sprites.push({ name, x, y });
    return drawSprite(ctx, name, x, y, ...rest);
  };
  VL.ART.text = (ctx, str, x, y, ...rest) => {
    texts.push(String(str));
    return text(ctx, str, x, y, ...rest);
  };
  VL.render(document.createElement('canvas').getContext('2d'), app, 0);
  VL.ART.drawSprite = drawSprite;
  VL.ART.text = text;
  const hearts = sprites.filter((s) => s.name === 'heart-full');
  const inCard = (card) => hearts.filter((h) => h.y >= 44 + card * 28 && h.y < 44 + (card + 1) * 28);
  assert.equal(inCard(0).length, 1, 'twelve hearts: one heart');
  assert.ok(texts.includes('x12'), 'and the count');
  assert.equal(inCard(1).length, 10, 'ten hearts still draw as a row');
  for (const h of hearts) assert.ok(h.y + 6 <= 44 + Math.floor((h.y - 44) / 28) * 28 + 24, `heart at y ${h.y} stays inside its card`);
});

test('the intro is a black screen whose weathering fades letter pixels but never erases them', () => {
  const { VL, document } = loadGame();
  const { app } = titleApp(VL);
  newGameTo(VL, app, 'Ash', 0, 'intro');
  wait(VL, app, 2); // the first line has fully faded in
  let alpha = 1;
  const base = document.createElement('canvas').getContext('2d');
  const ctx = new Proxy({}, {
    get: (_, property) => (property === 'globalAlpha' ? alpha : base[property]),
    set: (_, property, value) => {
      if (property === 'globalAlpha') alpha = value;
      return true;
    },
  });
  const rects = [];
  const { rect } = VL.ART;
  VL.ART.rect = (c, name, x, y, w, h) => {
    rects.push({ name, x, y, w, h, alpha: c.globalAlpha });
    return rect(c, name, x, y, w, h);
  };
  VL.render(ctx, app, 2);
  VL.ART.rect = rect;
  const { width, height } = VL.TUNING;
  assert.ok(rects.some((r) => r.x === 0 && r.y === 0 && r.w === width && r.h === height && VL.PALETTE[r.name] === '#000000'), 'a black screen (design)');
  const weathering = rects.filter((r) => r.w === 1 && r.h === 1);
  assert.ok(weathering.length > 20, 'the lines are weathered');
  for (const r of weathering) assert.ok(r.alpha > 0 && r.alpha <= 0.6, `a weathering pixel only dims the letter (alpha ${r.alpha})`);
});

test('the pause menu says Continue starts at the last save point when Save & Quit is chosen', () => {
  const { VL, document } = loadGame();
  addFixtureWorld(VL);
  const { app } = titleApp(VL);
  newGameTo(VL, app, 'Robin');
  press(VL, app, 'pause');
  const hint = (strings) => strings.some((s) => /last save point/i.test(s));
  assert.equal(hint(drawnText(VL, document, app)), false, 'not while Resume is chosen');
  press(VL, app, 'down');
  assert.equal(hint(drawnText(VL, document, app)), true);
  app.storage = VL.createStorage(null);
  assert.equal(hint(drawnText(VL, document, app)), false, 'nothing is saved with saving off');
});

test('fainting shows its screen, then respawns at the save point with full hearts and the earnings kept', () => {
  const { VL, document } = loadGame();
  addFixtureWorld(VL);
  const { app, backing } = titleApp(VL);
  newGameTo(VL, app, 'Robin');
  const game = app.game;
  VL.touchSavePoint(game, { area: 'room', screen: '0,0', tx: 7, ty: 5 });
  VL.place(game, { area: 'test', screen: '1,0', tx: 8, ty: 2 });
  game.flags.chest = true;
  VL.earned(game);
  app.update(VL.noActions(), STEP);
  let seen = 0;
  VL.defineSystem('spy', { update: (state, actions) => { if (actions.pressed.interact) seen += 1; } });
  VL.faint(game, 'shrub');
  app.update(VL.noActions(), STEP);
  assert.equal(app.sceneId, 'fainted');
  assert.ok(drawnText(VL, document, app).some((s) => /shrub/i.test(s)), 'names the cause');
  press(VL, app, 'interact');
  assert.equal(app.sceneId, 'fainted', 'a press in the first moments is ignored');
  wait(VL, app, 1);
  press(VL, app, 'interact');
  assert.equal(app.sceneId, 'play');
  assert.equal(seen, 0, 'the confirming press never reaches the world');
  assert.equal(game.hp, game.maxHp);
  assert.equal(game.player.area, 'room');
  assert.equal(game.flags.chest, true);
  assert.equal(JSON.parse(backing.getItem('vanishing-library-slot-1')).flags.chest, true, 'earnings were already saved');
});

test('with storage blocked the game still plays and the title says saving is off', () => {
  const { VL, document } = loadGame();
  addFixtureWorld(VL);
  const app = VL.createApp({ storage: VL.createStorage(throwingStorage) });
  assert.ok(drawnText(VL, document, app).some((s) => /saving is off/i.test(s)));
  newGameTo(VL, app, 'Ash');
  VL.place(app.game, { area: 'test', screen: '0,0', tx: 8, ty: 2 });
  VL.earned(app.game);
  app.update(VL.noActions(), STEP);
  assert.equal(app.game.dirty, false);
  const x = app.game.player.x;
  wait(VL, app, 0.3, ['right']);
  assert.ok(app.game.player.x > x, 'still playable');
  press(VL, app, 'pause');
  assert.ok(drawnText(VL, document, app).some((s) => /saving is off/i.test(s)), 'the pause menu says so too');
  press(VL, app, 'down');
  press(VL, app, 'confirm');
  assert.equal(app.sceneId, 'title');
});

test('a finished game shows as finished on its slot and continues from its last save', () => {
  const { VL } = loadGame();
  const backing = memoryStorage();
  const storage = VL.createStorage(backing);
  const hero = VL.newGame({ name: 'Robin' });
  VL.touchSavePoint(hero, { area: 'hut', screen: '0,0', tx: 3, ty: 2 });
  hero.finished = true;
  VL.saveSlot(storage, 0, hero);
  const app = VL.createApp({ storage });
  assert.equal(app.title.slots[0].summary.finished, true);
  press(VL, app, 'confirm');
  assert.equal(app.sceneId, 'play');
  assert.equal(app.game.player.area, 'hut');
});

test('every string the new scenes draw is in the font', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  const backing = memoryStorage();
  const storage = VL.createStorage(backing);
  VL.saveSlot(storage, 0, VL.newGame({ name: 'Kai' }));
  backing.setItem(VL.slotKey(1), '{broken');
  backing.setItem(VL.slotKey(2), JSON.stringify({ v: VL.saveVersion() + 1, name: 'New', maxHp: 6, flags: {}, visited: {} }));
  const strings = [];
  const original = VL.ART.text;
  VL.ART.text = (ctx, str, x, y, options = {}) => {
    strings.push({ str: String(str), size: options.size || 'normal' });
    return original(ctx, str, x, y, options);
  };
  const ctx = fakeDocument().createElement('canvas').getContext('2d');
  const app = VL.createApp({ storage });
  app.saveFailed = true;
  for (const scene of ['title', 'name', 'intro', 'play', 'pause', 'fainted', 'conflict']) {
    if (!app.game) app.game = VL.newGame({ name: 'Kai' });
    app.setScene(scene, scene === 'name' ? { slot: 0 } : undefined);
    if (scene === 'name') app.naming.text = 'Kai';
    if (scene === 'title') app.title.confirmDelete = true;
    if (scene === 'pause') app.pause.askQuit = true;
    for (const t of [0, 1, 5, 12]) VL.render(ctx, app, t);
  }
  VL.ART.text = original;
  assert.ok(strings.length > 20);
  for (const { str, size } of strings) assert.deepEqual([...VL.ART.missingGlyphs(str, size)], [], str);
});

// ---------- the playthrough from the title ----------

test('the playthrough drives the real title: named is the first milestone and a reload keeps the game', () => {
  const { VL } = loadGame();
  assert.equal(VL.MILESTONES[0], 'named');
  assert.equal(VL.MILESTONES[1], 'start');
  assert.ok(VL.LOCKS.named.reached, 'W2 claims named');
  const backing = memoryStorage();
  const app = VL.createApp({ storage: VL.createStorage(backing) });
  const play = createPlaythrough(VL, { app });
  const drive = play.playTo('start');
  assert.notEqual(drive.app, app, 'the steps reloaded the page');
  assert.equal(drive.app.sceneId, 'play');
  assert.equal(drive.state.name, 'Robin');
  assert.equal(drive.app.slot, 0);
  assert.equal(JSON.parse(backing.getItem('vanishing-library-slot-1')).name, 'Robin');
  assert.ok(VL.progress(drive.state).includes('start'));
});

test('VL.reloadApp is a real reload: only what was saved comes back; without a slot it lands on the title', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  const backing = memoryStorage();
  const app = VL.createApp({ storage: VL.createStorage(backing) });
  newGameTo(VL, app, 'Robin');
  VL.touchSavePoint(app.game, { area: 'room', screen: '0,0', tx: 7, ty: 5 });
  app.game.flags.chest = true;
  app.update(VL.noActions(), STEP);
  app.game.flags.forgotten = true;
  app.game.hp = 1;
  const next = VL.reloadApp(app);
  assert.notEqual(next, app);
  assert.equal(next.sceneId, 'play');
  assert.equal(next.slot, 0);
  assert.equal(next.game.flags.chest, true, 'earned, so saved');
  assert.equal(next.game.flags.forgotten, undefined, 'set without VL.earned: a reload loses it');
  assert.equal(next.game.hp, next.game.maxHp);
  assert.equal(next.game.player.area, 'room');
  assert.equal(VL.reloadApp(next, { save: true }).game.flags.forgotten, undefined, 'the option saves the dirty game only');
  next.game.flags.kept = true;
  VL.earned(next.game);
  assert.equal(VL.reloadApp(next, { save: true }).game.flags.kept, true);
  const bare = VL.reloadApp(VL.createApp());
  assert.equal(bare.sceneId, 'title');
  assert.equal(bare.game, null);
});

test('README documents the scenes and the typed input', () => {
  const readme = read('README.md');
  for (const word of ['scenes/title.js', "'title'", 'actions.typed', 'confirm', 'erase', 'Save & Quit', 'fainted']) {
    assert.ok(readme.includes(word), `README mentions ${word}`);
  }
});
