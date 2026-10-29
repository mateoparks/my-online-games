// W9: NPCs and dialogue. Accented glyphs and name entry, dialogue conditions,
// {name}, paging, the typewriter, talking with S, wandering townsfolk, and the
// shop/trade framework W10 fills.
const assert = require('node:assert/strict');
const { test, loadGame, memoryStorage, fakeContext } = require('./harness');

const STEP = 1 / 60;
const ACCENTED_LOWER = 'áàâäãåæéèêëíìîïóòôöõøúùûüýÿñç';
const ACCENTED_UPPER = 'ÁÀÂÄÃÅÆÉÈÊËÍÌÎÏÓÒÔÖÕØÚÙÛÜÝŸÑÇ';
const LONG_NAME = 'Ñandú Élodïe';

function pixelContext() {
  const pixels = new Map();
  const ctx = {
    pixels,
    fillStyle: null,
    fillRect(x, y, w, h) {
      for (let j = y; j < y + h; j += 1) for (let i = x; i < x + w; i += 1) pixels.set(`${i},${j}`, ctx.fillStyle);
    },
  };
  return ctx;
}
const inked = (ctx) => [...ctx.pixels.keys()].map((key) => key.split(',').map(Number));

const OPEN_ROOM = [
  'TTTTTTTTTTTTTTTT',
  'T..............T',
  'T..............T',
  'T..............T',
  'T..............T',
  'T..............T',
  'T..............T',
  'T..............T',
  'T..............T',
  'T..............T',
  'TTTTTTTTTTTTTTTT',
];

// A walled room with an NPC two tiles above the hero's start, and a game in it.
function talkWorld(VL, { npc = {}, entities = [], tiles = OPEN_ROOM } = {}) {
  VL.addScreens('talk', {
    '0,0': {
      tiles,
      entities: [{ type: 'npc', id: 'tester', x: 7, y: 4, ...npc }, ...entities],
    },
  });
}

function defineTester(VL, entries = [{ say: 'Hello, {name}!' }], npc = {}) {
  VL.defineNpc('tester', { name: 'Tess', look: 'townsfolk', ...npc });
  VL.defineDialogue('tester', entries);
}

// An app in play with the hero just below the NPC, facing it.
function talkApp(VL, { name = 'Robin', tx = 7, ty = 5, facing = 'up' } = {}) {
  const app = VL.createApp();
  app.game = VL.newGame({ name });
  app.setScene('play');
  VL.place(app.game, { area: 'talk', screen: '0,0', tx, ty, facing });
  return app;
}

const press = (VL, app, action) => app.update(VL.actions({ pressed: [action] }), STEP);
const wait = (VL, app, seconds) => {
  for (let t = 0; t < seconds - 1e-9; t += STEP) app.update(VL.noActions(), STEP);
};
const npcIn = (state, id = 'tester') => state.room.entities.find((e) => e.type === 'npc' && e.id === id);

function withPurse(VL, state, amounts) {
  state.inventory = { ...state.inventory, ...amounts };
}

// ---------- accented glyphs ({name} appears in dialogue) ----------

test('fonts draw accented Latin letters and ¡ ¿ in every size', () => {
  const { VL } = loadGame();
  const all = `${ACCENTED_LOWER}${ACCENTED_UPPER}¡¿`;
  assert.deepEqual([...VL.ART.missingGlyphs(all)], []);
  assert.deepEqual([...VL.ART.missingGlyphs(all, 'large')], []);
  assert.deepEqual([...VL.ART.missingGlyphs(all, 'small')], [], 'small draws them as capitals');
});

test('an accented letter is its base letter plus a mark above (or a cedilla below), same width', () => {
  const { VL } = loadGame();
  const pairs = [['é', 'e'], ['ñ', 'n'], ['ü', 'u'], ['ö', 'o'], ['ç', 'c'], ['á', 'a'], ['í', 'i'], ['ó', 'o'], ['ú', 'u'], ['à', 'a'], ['É', 'E'], ['Ñ', 'N'], ['Ç', 'C'], ['Ö', 'O'], ['ý', 'y'], ['Ý', 'Y'], ['ÿ', 'y'], ['å', 'a'], ['Å', 'A']];
  for (const size of ['normal', 'small']) {
    for (const [accented, base] of pairs) {
      const a = pixelContext();
      const b = pixelContext();
      VL.ART.text(a, accented, 0, 20, { size });
      VL.ART.text(b, base, 0, 20, { size });
      if (!(accented === 'í' && size === 'normal')) assert.equal(VL.ART.measureText(accented, size), VL.ART.measureText(base, size), `${accented} ${size} width`);
      const extra = inked(a).filter(([x, y]) => !b.pixels.has(`${x},${y}`));
      assert.ok(extra.length > 0, `${accented} ${size} has a mark`);
      if (accented === 'ç' || accented === 'Ç') continue;
      if (accented === 'í' && size === 'normal') {
        // Drawn dotless and 3px wide: a mark above the x-height, a 5px stem below it.
        assert.ok(inked(a).some(([, y]) => y < 21) && inked(a).filter(([, y]) => y >= 22).length === 5);
        continue;
      }
      const top = Math.min(...inked(b).map(([, y]) => y));
      for (const [, y] of extra) assert.ok(y < top, `${accented} ${size}: mark pixel at y ${y} sits above the letter (top ${top})`);
      for (const [x, y] of inked(b)) assert.ok(a.pixels.has(`${x},${y}`), `${accented} ${size} keeps ${base}'s pixel ${x},${y}`);
    }
  }
});

test('a capital\'s accent rises above the cell but stays inside a popup title', () => {
  const { VL } = loadGame();
  const ctx = pixelContext();
  VL.ART.text(ctx, 'É', 0, 20);
  const ys = inked(ctx).map(([, y]) => y);
  assert.ok(Math.min(...ys) < 20 && Math.min(...ys) >= 20 - VL.ART.POPUP.pad + 2, `top ${Math.min(...ys)}`);
  const large = pixelContext();
  VL.ART.text(large, 'É', 0, 40, { size: 'large' });
  assert.ok(Math.min(...inked(large).map(([, y]) => y)) < 40, 'large scales the rise');
});

test('name entry accepts accented letters, joins a typed accent with its letter, and drops what the font lacks', () => {
  const { VL } = loadGame();
  const app = VL.createApp({ storage: VL.createStorage(memoryStorage()) });
  for (const [typed, expected] of [['Élodie', 'Élodie'], ['Zoë', 'Zoë'], ['Ñandú', 'Ñandú'], ['Françoise', 'Françoise'], ['Renée', 'Renée'], ['A€B', 'AB']]) {
    app.setScene('name', { slot: 0 });
    app.update(VL.actions({ typed }), STEP);
    assert.equal(app.naming.text, expected, JSON.stringify(typed));
  }
  // W37: boy or girl must be picked before START.
  press(VL, app, 'down');
  press(VL, app, 'left');
  app.update(VL.actions({ pressed: ['confirm'] }), STEP);
  assert.equal(app.game.name, 'AB');
});

// ---------- {name} ----------

test('{name} becomes the hero\'s name everywhere in a line, Hero when unnamed', () => {
  const { VL } = loadGame();
  const state = VL.createGame({ name: 'Élodie' });
  assert.equal(VL.popupText('Hi {name}! {name}, wait.', state), 'Hi Élodie! Élodie, wait.');
  assert.equal(VL.popupText('Hi {name}.', { name: '' }), 'Hi Hero.');
  assert.equal(VL.popupText('No name here.', state), 'No name here.');
});

// ---------- conditions ----------

test('dialogue: the first entry whose conditions all hold wins', () => {
  const { VL } = loadGame();
  VL.defineLock('w9TestLock', { type: 'flag', doc: '§ test', reached: (state) => Boolean(state.flags.lockOpen) });
  // Stands in for W5's VL.hasItem, so the test owns what the hero carries.
  VL.hasItem = (state, id) => Boolean(state.testItems?.[id]);
  VL.defineDialogue('pick', [
    { when: { flag: 'a', notFlag: 'b' }, say: 'a only' },
    { when: { flag: ['a', 'b'] }, say: 'a and b' },
    { when: { progress: 'w9TestLock' }, say: 'lock' },
    { when: { item: 'woodSword' }, say: 'sword' },
    { when: { has: { shells: 10 } }, say: 'rich' },
    { when: { test: (state) => state.name === 'Pip' }, say: 'pip' },
    { when: { notProgress: 'w9TestLock', notItem: 'woodSword', flag: 'quiet' }, say: 'quiet' },
    { say: 'default' },
  ]);
  const state = VL.newGame();
  const said = () => VL.pickDialogue(state, 'pick').say;
  assert.equal(said(), 'default');
  state.flags.quiet = true;
  assert.equal(said(), 'quiet');
  state.flags.a = true;
  assert.equal(said(), 'a only');
  state.flags.b = true;
  assert.equal(said(), 'a and b', 'every listed flag must be set');
  delete state.flags.a;
  state.flags.lockOpen = true;
  assert.equal(said(), 'lock');
  delete state.flags.lockOpen;
  state.testItems = { woodSword: true };
  assert.equal(said(), 'sword');
  state.testItems = {};
  state.inventory = { ...(state.inventory || {}), shells: 10 };
  assert.equal(said(), 'rich');
  state.inventory.shells = 9;
  state.name = 'Pip';
  assert.equal(said(), 'pip');
});

test('dialogue: no matching entry gives null, and a misspelt condition is an error at definition', () => {
  const { VL } = loadGame();
  VL.defineDialogue('picky', [{ when: { flag: 'never' }, say: 'x' }]);
  assert.equal(VL.pickDialogue(VL.newGame(), 'picky'), null);
  assert.throws(() => VL.defineDialogue('typo', [{ when: { flags: 'a' }, say: 'x' }]), /unknown condition flags/);
  assert.throws(() => VL.defineDialogue('picky', [{ say: 'x' }]), /already defined/);
  assert.throws(() => VL.defineDialogue('silent', [{ when: {} }]), /say/);
  assert.throws(() => VL.pickDialogue(VL.newGame(), 'nobody'), /no dialogue nobody/);
});

test('dialogue problems name unknown locks, items and resources, unreachable entries, missing fallbacks and glyphs', () => {
  const { VL } = loadGame();
  VL.defineDialogue('broken', [
    { say: 'everyone' },
    { when: { flag: 'x' }, say: 'never shown' },
  ]);
  VL.defineDialogue('noFallback', [{ when: { progress: 'noSuchLock' }, say: 'Price: 5€' }]);
  VL.defineDialogue('typos', [
    { when: { item: 'shelPurse', has: { shell: 3 } }, say: 'x' },
    { when: { notItem: 'woodSword' }, say: 'y', give: { item: 'swiftBoots' } },
    { say: 'z' },
  ]);
  const problems = VL.dialogueProblems().join('\n');
  assert.match(problems, /typos: unknown resource shell\b/);
  assert.match(problems, /typos: unknown item shelPurse/);
  assert.match(problems, /typos: unknown item swiftBoots/);
  assert.doesNotMatch(problems, /unknown item woodSword/);
  assert.match(problems, /broken: entry 2 can never be picked/);
  assert.match(problems, /noFallback: no entry without conditions/);
  assert.match(problems, /noFallback: unknown lock noSuchLock/);
  assert.match(problems, /noFallback: .*€/);
});

// ---------- paging ----------

test('paging: a long line splits into popup-sized pages, words kept in order', () => {
  const { VL } = loadGame();
  const state = VL.createGame({ name: LONG_NAME });
  const words = 'The tide brings in shells every morning and the gulls fight over them, {name}, so be quick if you want the whole ones before they are broken on the rocks by the waves and the wind.';
  const pages = VL.dialoguePages(words, state);
  const { width, pad, maxLines } = VL.ART.POPUP;
  assert.ok(pages.length >= 2, `${pages.length} pages`);
  for (const page of pages) {
    assert.ok(page.length >= 1 && page.length <= maxLines);
    for (const line of page) assert.ok(VL.ART.measureText(line) <= width - pad * 2, line);
  }
  assert.equal(pages.flat().join(' '), VL.popupText(words, state));
});

test('paging: each string of a list starts a new page; \\n forces a line break', () => {
  const { VL } = loadGame();
  const state = VL.createGame({ name: 'Robin' });
  const pages = VL.dialoguePages(['One.', 'Two,\n{name}.'], state);
  assert.deepEqual(JSON.parse(JSON.stringify(pages)), [['One.'], ['Two,', 'Robin.']]);
});

// ---------- talking ----------

test('S facing an NPC opens the dialogue scene; the NPC turns to the hero', () => {
  const { VL } = loadGame();
  talkWorld(VL);
  defineTester(VL);
  const app = talkApp(VL);
  npcIn(app.game).facing = 'left';
  press(VL, app, 'interact');
  assert.equal(app.sceneId, 'dialogue');
  assert.equal(npcIn(app.game).facing, 'down');
  assert.equal(app.dialogue.speaker, 'Tess');
  assert.deepEqual(JSON.parse(JSON.stringify(app.dialogue.pages)), [['Hello, Robin!']]);
});

test('S facing away, or an NPC out of reach, does not talk', () => {
  const { VL } = loadGame();
  talkWorld(VL);
  defineTester(VL);
  const away = talkApp(VL, { facing: 'down' });
  press(VL, away, 'interact');
  assert.equal(away.sceneId, 'play');
  const far = talkApp(VL, { ty: 7 });
  press(VL, far, 'interact');
  assert.equal(far.sceneId, 'play');
});

test('an NPC with nothing to say stays silent', () => {
  const { VL } = loadGame();
  talkWorld(VL);
  defineTester(VL, [{ when: { flag: 'never' }, say: 'x' }]);
  const app = talkApp(VL);
  press(VL, app, 'interact');
  assert.equal(app.sceneId, 'play');
});

test('an entry\'s `set` flags are earned (saved) when the talk ends, and change the next talk', () => {
  const { VL } = loadGame();
  talkWorld(VL);
  defineTester(VL, [
    { when: { notFlag: 'met:tester' }, say: 'Nice to meet you!', set: 'met:tester' },
    { say: 'Hello again.' },
  ]);
  const app = talkApp(VL);
  app.game.dirty = false;
  const earned = [];
  const original = VL.earned;
  VL.earned = (state) => {
    earned.push(true);
    return original(state);
  };
  press(VL, app, 'interact');
  assert.equal(app.game.flags['met:tester'], undefined, 'not while the words are still showing');
  assert.equal(app.dialogue.pages[0][0], 'Nice to meet you!');
  press(VL, app, 'interact');
  press(VL, app, 'interact');
  VL.earned = original;
  assert.equal(app.sceneId, 'play');
  assert.equal(app.game.flags['met:tester'], true);
  assert.equal(earned.length, 1);
  press(VL, app, 'interact');
  assert.equal(app.dialogue.pages[0][0], 'Hello again.');
});

test('Esc still counts as heard: the entry\'s flags and gifts land', () => {
  const { VL } = loadGame();
  talkWorld(VL);
  defineTester(VL, [
    { when: { notFlag: 'gave:wood' }, say: ['Here, take some wood.', 'It was a gift from the mill.'], set: 'gave:wood', give: { wood: 2 } },
    { say: 'Build something nice.' },
  ]);
  const app = talkApp(VL);
  press(VL, app, 'interact');
  press(VL, app, 'pause');
  assert.equal(app.sceneId, 'play');
  assert.equal(app.game.inventory.wood, 2);
  assert.equal(app.game.flags['gave:wood'], true);
});

test('an NPC that gives keeps talking: words first, then the gift and its popup, then the rest of the conversation', () => {
  const { VL } = loadGame();
  talkWorld(VL);
  defineTester(VL, [
    { when: { notItem: 'woodSword' }, say: 'Take this sword, {name}.', give: { item: 'woodSword', shells: 3 } },
    { say: 'Swing it well.' },
  ]);
  const app = talkApp(VL);
  press(VL, app, 'interact');
  assert.equal(app.sceneId, 'dialogue');
  assert.equal(VL.hasItem(app.game, 'woodSword'), false, 'nothing is handed over before the words');
  press(VL, app, 'interact');
  press(VL, app, 'interact');
  assert.equal(app.sceneId, 'popup', 'the gift\'s popup follows the talk at once');
  assert.equal(VL.currentPopup(app.game).id, 'woodSword');
  assert.equal(VL.hasItem(app.game, 'woodSword'), true);
  assert.equal(app.game.inventory.shells, 3);
  wait(VL, app, 0.5);
  press(VL, app, 'interact');
  assert.equal(app.sceneId, 'play');
  press(VL, app, 'interact');
  assert.equal(app.sceneId, 'dialogue');
  assert.equal(app.dialogue.pages[0][0], 'Swing it well.');
  press(VL, app, 'interact');
  press(VL, app, 'interact');
  assert.equal(app.game.inventory.shells, 3, 'given once');
});

test('a talk and a popup asked for in the same step: the talk shows, then the popup', () => {
  const { VL } = loadGame();
  talkWorld(VL);
  defineTester(VL, [{ say: 'Hello!' }]);
  const talk = VL.ENTITIES.npc.onInteract;
  VL.ENTITIES.npc.onInteract = (state, entity) => {
    talk(state, entity);
    VL.giveItem(state, 'woodShield');
  };
  const app = talkApp(VL);
  press(VL, app, 'interact');
  assert.equal(app.sceneId, 'dialogue');
  press(VL, app, 'interact');
  press(VL, app, 'interact');
  assert.equal(app.sceneId, 'popup');
  assert.equal(VL.currentPopup(app.game).id, 'woodShield');
});

test('gifts are checked: an unknown kind fails at definition, and later items add kinds', () => {
  const { VL } = loadGame();
  assert.throws(() => VL.defineDialogue('typo', [{ say: 'x', give: { shell: 1 } }]), /unknown gift shell/);
  assert.throws(() => VL.defineDialogue('fn', [{ say: 'x', give: () => {} }]), /give is/);
  VL.defineGift('heartContainer', (state, n) => {
    state.maxHp += 2 * n;
  });
  assert.throws(() => VL.defineGift('heartContainer', () => {}), /already defined/);
  talkWorld(VL);
  defineTester(VL, [{ say: 'A heart for you.', give: { heartContainer: 1 } }]);
  const app = talkApp(VL);
  const before = app.game.maxHp;
  press(VL, app, 'interact');
  press(VL, app, 'interact');
  press(VL, app, 'interact');
  assert.equal(app.game.maxHp, before + 2);
});

test('later items add conditions and put their lines ahead of an NPC\'s own', () => {
  const { VL } = loadGame();
  VL.defineCondition('testBooks', (state, least) => (state.testBooks || 0) >= least);
  assert.throws(() => VL.defineCondition('testBooks', () => true), /already defined/);
  VL.defineDialogue('testKeeper', [{ when: { testBooks: 5 }, say: 'Five!' }, { say: 'Welcome.' }]);
  VL.addDialogue('testKeeper', [{ when: { flag: 'shockwave' }, say: 'Did you feel that?' }]);
  assert.throws(() => VL.addDialogue('nobody', [{ say: 'x' }]), /no dialogue nobody/);
  assert.throws(() => VL.addDialogue('testKeeper', [{ when: { book: 1 }, say: 'x' }]), /unknown condition book/);
  const state = VL.newGame();
  assert.equal(VL.pickDialogue(state, 'testKeeper').say, 'Welcome.');
  state.testBooks = 5;
  assert.equal(VL.pickDialogue(state, 'testKeeper').say, 'Five!');
  state.flags.shockwave = true;
  assert.equal(VL.pickDialogue(state, 'testKeeper').say, 'Did you feel that?');
});

test('S on an NPC only talks: a bush or berry bush the hero half faces is left alone', () => {
  const { VL } = loadGame();
  const tiles = [...OPEN_ROOM];
  tiles[4] = 'T.....Y.B......T';
  talkWorld(VL, { tiles });
  defineTester(VL);
  for (const side of [-5, 5]) {
    const app = talkApp(VL);
    app.game.player.x += side;
    const reach = VL.facingTiles(app.game).map(({ tx, ty }) => `${tx},${ty}`);
    assert.ok(reach.includes('7,4') && reach.length > 1, `${side}: ${reach}`);
    const hp = app.game.hp;
    press(VL, app, 'interact');
    assert.equal(app.sceneId, 'dialogue');
    assert.equal(app.game.hp, hp, 'no bush pulled');
    assert.equal(app.game.inventory.berries, 0, 'no berries picked');
    assert.equal(VL.tileAt('talk', '0,0', 6, 4, app.game.room), 'Y');
    assert.equal(VL.tileAt('talk', '0,0', 8, 4, app.game.room), 'B');
  }
});

test('talking adds no saved field: only flags an entry sets reach the save', () => {
  const { VL } = loadGame();
  talkWorld(VL);
  defineTester(VL);
  const app = talkApp(VL);
  const before = Object.keys(VL.serializeSave(app.game)).sort();
  press(VL, app, 'interact');
  assert.deepEqual(Object.keys(VL.serializeSave(app.game)).sort(), before);
  assert.ok(!before.includes('sceneRequest'));
});

// ---------- the typewriter ----------

test('typewriter: text reveals over time, a press completes the page, the next press advances', () => {
  const { VL } = loadGame();
  talkWorld(VL);
  defineTester(VL, [{ say: ['The first page is here.', 'And the second.'] }]);
  const app = talkApp(VL);
  const sounds = [];
  VL.sfx = (name) => {
    sounds.push(name);
    return true;
  };
  press(VL, app, 'interact');
  const view = app.dialogue;
  assert.equal(view.page, 0);
  assert.equal(VL.dialogueRevealed(view), '');
  wait(VL, app, 0.2);
  const partial = VL.dialogueRevealed(view);
  assert.ok(partial.length > 0 && partial.length < 'The first page is here.'.length, partial);
  assert.ok('The first page is here.'.startsWith(partial));
  assert.ok(sounds.includes('talk'), 'blips while typing');
  press(VL, app, 'interact');
  assert.equal(VL.dialogueRevealed(view), 'The first page is here.');
  assert.equal(view.page, 0, 'completing does not advance');
  press(VL, app, 'interact');
  assert.equal(view.page, 1);
  assert.equal(VL.dialogueRevealed(view), '');
  wait(VL, app, 3);
  assert.equal(VL.dialogueRevealed(view), 'And the second.');
  press(VL, app, 'interact');
  assert.equal(app.sceneId, 'play');
});

test('typewriter: Space and Enter work like S; Esc ends the talk at once', () => {
  const { VL } = loadGame();
  talkWorld(VL);
  defineTester(VL, [{ say: ['One.', 'Two.'] }]);
  const app = talkApp(VL);
  press(VL, app, 'interact');
  press(VL, app, 'mainHand');
  press(VL, app, 'confirm');
  assert.equal(app.dialogue.page, 1);
  press(VL, app, 'pause');
  assert.equal(app.sceneId, 'play');
});

test('holding S never skips text: only a fresh press finishes or turns a page', () => {
  const { VL } = loadGame();
  talkWorld(VL);
  defineTester(VL, [{ say: ['The first page is here.', 'And the second.'] }]);
  const app = talkApp(VL);
  press(VL, app, 'interact');
  for (let i = 0; i < 600; i += 1) app.update(VL.actions({ held: ['interact', 'confirm', 'mainHand'] }), STEP);
  assert.equal(app.sceneId, 'dialogue');
  assert.equal(app.dialogue.page, 0);
  assert.equal(VL.dialogueRevealed(app.dialogue), 'The first page is here.', 'typed out by time alone');
});

test('the world waits while the NPC talks, and the dialogue box keeps one size', () => {
  const { VL } = loadGame();
  talkWorld(VL);
  defineTester(VL, [{ say: ['Short.', 'A much longer page that needs two lines in the box at least, maybe three.'] }]);
  const app = talkApp(VL);
  press(VL, app, 'interact');
  const time = app.game.time;
  app.update(VL.actions({ held: ['left'] }), STEP);
  assert.equal(app.game.time, time);
  const sizes = [];
  const original = VL.ART.drawPopup;
  VL.ART.drawPopup = (ctx, popup, t) => {
    const layout = original(ctx, popup, t);
    sizes.push(layout.h);
    return layout;
  };
  const ctx = fakeContext();
  VL.render(ctx, app, 0);
  press(VL, app, 'interact');
  press(VL, app, 'interact');
  VL.render(ctx, app, 0);
  VL.ART.drawPopup = original;
  assert.equal(sizes.length, 2);
  assert.equal(sizes[0], sizes[1]);
});

test('a dialogue entry with `shop` opens that shop when the talk ends', () => {
  const { VL } = loadGame();
  talkWorld(VL);
  VL.defineShop('stall', { title: 'Stall', offers: [{ id: 'paper', name: 'Paper', cost: { shells: 2 }, gain: { ore: 1 } }] });
  defineTester(VL, [{ say: 'Take a look!', shop: 'stall' }]);
  const app = talkApp(VL);
  press(VL, app, 'interact');
  press(VL, app, 'interact');
  press(VL, app, 'interact');
  assert.equal(app.sceneId, 'shop');
  assert.equal(app.shopView.shop.title, 'Stall');
});

// ---------- wandering ----------

test('NPCs wander within their range, never onto walls, entities or the hero, and pause near the hero', () => {
  const { VL } = loadGame();
  talkWorld(VL, {
    npc: { wander: 2 },
    entities: [{ type: 'npc', id: 'tester', x: 7, y: 5 }, { type: 'decor', art: 'nothing', x: 8, y: 4 }],
  });
  VL.defineDecor('nothing', () => {});
  defineTester(VL);
  const state = VL.newGame();
  VL.place(state, { area: 'talk', screen: '0,0', tx: 2, ty: 8 });
  const [walker, stander] = state.room.entities;
  const seen = new Set();
  for (let i = 0; i < 60 * 40; i += 1) {
    VL.updateWorld(state, VL.noActions(), STEP);
    seen.add(`${walker.x},${walker.y}`);
    assert.ok(Math.abs(walker.x - 7) <= 2 && Math.abs(walker.y - 4) <= 2, `left its range: ${walker.x},${walker.y}`);
    assert.ok(!(walker.x === 8 && walker.y === 4), 'stepped on the decor');
    assert.ok(!(walker.x === stander.x && walker.y === stander.y), 'stepped on the other NPC');
  }
  assert.equal(`${stander.x},${stander.y}`, '7,5', 'wander 0 stands still');
  assert.ok(seen.size >= 4, `visited ${seen.size} tiles`);
  // Next to the hero it holds still, so a kid can walk up and talk.
  VL.place(state, { area: 'talk', screen: '0,0', tx: 7, ty: 5 });
  const npc = state.room.entities[0];
  const where = `${npc.x},${npc.y}`;
  assert.equal(where, '7,4');
  for (let i = 0; i < 60 * 10; i += 1) VL.updateWorld(state, VL.noActions(), STEP);
  assert.equal(`${npc.x},${npc.y}`, where);
});

test('wandering is the same every visit, and never touches the game\'s own random numbers', () => {
  const { VL } = loadGame();
  talkWorld(VL, { npc: { wander: 2 } });
  defineTester(VL);
  const path = () => {
    const state = VL.newGame({ seed: 7 });
    VL.place(state, { area: 'talk', screen: '0,0', tx: 2, ty: 8 });
    const rng = state.rngState;
    const steps = [];
    for (let i = 0; i < 60 * 10; i += 1) {
      VL.updateWorld(state, VL.noActions(), STEP);
      steps.push(`${state.room.entities[0].x},${state.room.entities[0].y}`);
    }
    assert.equal(state.rngState, rng);
    return steps.join(' ');
  };
  assert.equal(path(), path());
});

test('an NPC walking between tiles is drawn between them, facing the way it walks', () => {
  const { VL } = loadGame();
  talkWorld(VL, { npc: { wander: 3 } });
  defineTester(VL);
  const state = VL.newGame();
  VL.place(state, { area: 'talk', screen: '0,0', tx: 2, ty: 8 });
  const npc = state.room.entities[0];
  let checked = false;
  for (let i = 0; i < 60 * 20 && !checked; i += 1) {
    VL.updateWorld(state, VL.noActions(), STEP);
    if (npc.walk && npc.walk.t > 0.05 && npc.walk.t < VL.TUNING.npcStepSeconds - 0.05) {
      const at = VL.npcFeet(npc, 0, 0);
      const to = VL.npcFeet({ x: npc.x, y: npc.y }, 0, 0);
      const from = VL.npcFeet({ x: npc.walk.fromX, y: npc.walk.fromY }, 0, 0);
      const between = (a, b, c) => (a - b) * (a - c) < 0;
      assert.ok(between(at.x, from.x, to.x) || between(at.y, from.y, to.y), JSON.stringify({ at, from, to }));
      const dir = { '1,0': 'right', '-1,0': 'left', '0,1': 'down', '0,-1': 'up' }[`${npc.x - npc.walk.fromX},${npc.y - npc.walk.fromY}`];
      assert.equal(npc.facing, dir);
      checked = true;
    }
  }
  assert.ok(checked, 'saw a step');
});

// ---------- the shop framework ----------

function shopWorld(VL) {
  VL.defineShop('testShop', {
    title: 'Test Shop',
    greeting: 'Welcome, {name}!',
    offers: [
      { id: 'paper', name: 'Paper', cost: { shells: 2 }, gain: { ore: 1 }, about: 'For maps and copies.' },
      { id: 'sword', name: 'Wood Sword', cost: { wood: 3 }, give: (state) => { state.flags.gotSword = true; }, soldOut: (state) => Boolean(state.flags.gotSword) },
      { id: 'hidden', name: 'Secret', cost: { shells: 1 }, gain: { berries: 1 }, hidden: (state) => !state.flags.secret },
      { id: 'trade', name: 'Shell', cost: { wood: 5 }, gain: { shells: 1 } },
      { id: 'combo', name: 'Fancy', cost: { shells: 3, wood: 1 }, gain: { ore: 2 } },
    ],
  });
}

test('shop rules: prices, what is short, sold out, and a buy pays every cost or none', () => {
  const { VL } = loadGame();
  shopWorld(VL);
  const state = VL.newGame();
  withPurse(VL, state, { shells: 4, wood: 0, ore: 0, berries: 0 });
  const shop = VL.SHOPS.testShop;
  const offer = (id) => shop.offers.find((o) => o.id === id);
  assert.deepEqual(VL.shopOffers(state, shop).map((o) => o.id), ['paper', 'sword', 'trade', 'combo']);
  state.flags.secret = true;
  assert.ok(VL.shopOffers(state, shop).some((o) => o.id === 'hidden'));

  assert.equal(VL.priceText({ shells: 2 }), '2 shells');
  assert.equal(VL.priceText({ shells: 1 }), '1 shell');
  assert.equal(VL.priceText({ shells: 3, wood: 1 }), '3 shells, 1 wood');
  assert.equal(VL.shortfall(state, { shells: 4 }), null);
  assert.equal(VL.shortfall(state, { shells: 5 }), 'shells');
  assert.equal(VL.shortfall(state, { shells: 1, wood: 1 }), 'wood');

  assert.deepEqual({ ...VL.buyOffer(state, offer('combo')) }, { ok: false, reason: 'notEnough', kind: 'wood' });
  assert.equal(state.inventory.shells, 4, 'a failed buy spends nothing');
  assert.deepEqual({ ...VL.buyOffer(state, offer('sword')) }, { ok: false, reason: 'notEnough', kind: 'wood' });

  state.dirty = false;
  assert.equal(VL.buyOffer(state, offer('paper')).ok, true);
  assert.deepEqual([state.inventory.shells, state.inventory.ore], [2, 1]);
  assert.equal(state.dirty, true, 'a buy is earned, so it saves');
  assert.ok(state.events.some((e) => e.type === 'bought' && e.offer === 'paper'));

  state.inventory.wood = 8;
  assert.equal(VL.buyOffer(state, offer('sword')).ok, true);
  assert.equal(state.flags.gotSword, true);
  assert.equal(state.inventory.wood, 5);
  assert.deepEqual({ ...VL.buyOffer(state, offer('sword')) }, { ok: false, reason: 'soldOut' });
  assert.equal(state.inventory.wood, 5);
  assert.equal(VL.buyOffer(state, offer('trade')).ok, true);
  assert.deepEqual([state.inventory.wood, state.inventory.shells], [0, 3]);
});

test('an offer can refuse with its own reason, in the rules and the scene, spending nothing', () => {
  const { VL } = loadGame();
  VL.defineShop('bindery', {
    title: 'Bindery',
    offers: [{ id: 'bind', name: 'Binding', cost: { shells: 1 }, give: (state) => { state.flags.bound = true; }, refuse: (state) => (state.flags.pages ? null : 'Bring me pages first, {name}!') }],
  });
  const state = VL.newGame({ name: 'Robin' });
  withPurse(VL, state, { shells: 5 });
  const offer = VL.SHOPS.bindery.offers[0];
  assert.deepEqual({ ...VL.buyOffer(state, offer) }, { ok: false, reason: 'refused', text: 'Bring me pages first, {name}!' });
  assert.equal(state.inventory.shells, 5);
  const app = VL.createApp();
  app.game = state;
  app.setScene('shop', { shop: 'bindery' });
  press(VL, app, 'interact');
  assert.equal(app.shopView.mode, 'browse');
  assert.equal(app.shopView.note.text, 'Bring me pages first, Robin!');
  state.flags.pages = true;
  press(VL, app, 'interact');
  press(VL, app, 'interact');
  assert.equal(state.flags.bound, true);
  assert.equal(state.inventory.shells, 4);
});

test('shop definitions are checked: costs, duplicate ids, and a shop with no offers', () => {
  const { VL } = loadGame();
  const make = (id, offers) => () => VL.defineShop(id, { title: 'X', offers });
  assert.throws(make('a', []), /no offers/);
  assert.throws(make('b', [{ id: 'x', name: 'X', cost: {} }]), /cost/);
  assert.throws(make('c', [{ id: 'x', name: 'X', cost: { shells: 0 } }]), /cost/);
  assert.throws(make('d', [{ id: 'x', name: 'X', cost: { shells: 1.5 } }]), /cost/);
  assert.throws(make('e', [{ id: 'x', name: 'X', cost: { shells: 1 }, gain: { ore: 1 } }, { id: 'x', name: 'Y', cost: { shells: 1 }, gain: { ore: 1 } }]), /twice/);
  assert.throws(make('f', [{ id: 'x', name: 'X', cost: { shells: 1 } }]), /gives nothing/);
  make('g', [{ id: 'x', name: 'X', cost: { shells: 1 }, gain: { ore: 1 } }])();
  assert.throws(make('g', [{ id: 'x', name: 'X', cost: { shells: 1 }, gain: { ore: 1 } }]), /already defined/);
});

function shopApp(VL, amounts) {
  shopWorld(VL);
  const app = VL.createApp();
  app.game = VL.newGame({ name: 'Zoë' });
  withPurse(VL, app.game, amounts);
  app.setScene('play');
  VL.openShop(app.game, 'testShop');
  app.update(VL.noActions(), STEP);
  assert.equal(app.sceneId, 'shop');
  return app;
}

test('shop scene: the cursor moves and wraps over offers and Leave, with sounds', () => {
  const { VL } = loadGame();
  const sounds = [];
  VL.sfx = (name) => {
    sounds.push(name);
    return true;
  };
  const app = shopApp(VL, { shells: 0, wood: 0 });
  const view = app.shopView;
  assert.equal(view.cursor, 0);
  press(VL, app, 'down');
  assert.equal(view.cursor, 1);
  press(VL, app, 'up');
  press(VL, app, 'up');
  assert.equal(view.cursor, 4, 'wraps to Leave (4 offers + Leave)');
  assert.equal(VL.shopRows(app.game, view)[view.cursor], 'leave');
  assert.ok(sounds.includes('menuMove'));
  press(VL, app, 'confirm');
  assert.equal(app.sceneId, 'play');
});

test('shop scene: not enough says so and buys nothing; enough asks, and Yes buys', () => {
  const { VL } = loadGame();
  const sounds = [];
  VL.sfx = (name) => {
    sounds.push(name);
    return true;
  };
  const app = shopApp(VL, { shells: 1, wood: 0, ore: 0 });
  const view = app.shopView;
  press(VL, app, 'interact');
  assert.equal(view.mode, 'browse');
  assert.match(view.note.text, /Not enough shells/);
  assert.equal(view.note.bad, true);
  assert.equal(app.game.inventory.shells, 1);
  assert.ok(sounds.includes('nope'));
  app.game.inventory.shells = 5;
  press(VL, app, 'interact');
  assert.equal(view.mode, 'ask');
  assert.match(VL.shopQuestion(view), /Buy Paper for 2 shells\?/);
  press(VL, app, 'right');
  press(VL, app, 'interact');
  assert.equal(view.mode, 'browse', 'No goes back');
  assert.equal(app.game.inventory.shells, 5);
  press(VL, app, 'interact');
  press(VL, app, 'interact');
  assert.deepEqual([app.game.inventory.shells, app.game.inventory.ore], [3, 1]);
  assert.equal(view.note.bad, false);
  assert.ok(sounds.includes('shell'));
});

test('shop scene: a trade asks as a trade, sold out says so, and Esc backs out then leaves', () => {
  const { VL } = loadGame();
  const app = shopApp(VL, { shells: 0, wood: 9 });
  const view = app.shopView;
  press(VL, app, 'down');
  press(VL, app, 'interact');
  press(VL, app, 'interact');
  assert.equal(app.game.flags.gotSword, true);
  press(VL, app, 'interact');
  assert.match(view.note.text, /Sold out/);
  press(VL, app, 'down');
  press(VL, app, 'interact');
  assert.match(VL.shopQuestion(view), /Trade 5 wood for 1 shell\?/);
  press(VL, app, 'pause');
  assert.equal(view.mode, 'browse');
  assert.equal(app.sceneId, 'shop');
  press(VL, app, 'pause');
  assert.equal(app.sceneId, 'play');
});

test('shop scene draws the offers, their prices, the purse and the note', () => {
  const { VL } = loadGame();
  const app = shopApp(VL, { shells: 1, wood: 2, ore: 0 });
  press(VL, app, 'interact');
  const strings = [];
  const original = VL.ART.text;
  VL.ART.text = (ctx, str, ...rest) => {
    strings.push(String(str));
    return original(ctx, str, ...rest);
  };
  VL.render(fakeContext(), app, 0);
  VL.ART.text = original;
  const all = strings.join('|');
  for (const expected of ['Test Shop', 'Paper', 'Wood Sword', 'Shell', 'Leave', 'Not enough shells!']) assert.ok(all.includes(expected), `${expected} in ${all}`);
  assert.ok(!all.includes('Secret'), 'a hidden offer is not drawn');
  assert.ok(/\b2\b/.test(all) && /\b3\b/.test(all), 'prices drawn');
  assert.ok(all.includes('5') && all.includes('→'), 'a trade shows what it gives');
});

// ---------- the townsfolk ----------

test('every NPC placed on the map is defined, with a fallback line and drawable words', () => {
  const { VL } = loadGame();
  const placed = [];
  for (const area of Object.values(VL.AREAS)) {
    for (const [key, screen] of Object.entries(area.screens)) {
      for (const entity of screen.entities) if (entity.type === 'npc') placed.push({ ...entity, area: area.id, key });
    }
  }
  assert.ok(placed.filter((npc) => VL.regionOf(npc.area, npc.key) === 'town').length >= 3, 'townsfolk in town');
  for (const npc of placed) {
    const def = VL.NPCS[npc.id];
    assert.ok(def, `npc ${npc.id} on ${npc.key} is defined`);
    assert.ok(VL.DIALOGUES[def.talk], `${npc.id} has dialogue ${def.talk}`);
    assert.ok(VL.ART.SPRITES[`npc-${def.look}-down-0`], `${npc.id} look ${def.look}`);
    assert.equal(VL.isSolidAt(npc.area, npc.key, npc.x, npc.y), false, `${npc.id} stands on open ground`);
  }
  assert.deepEqual([...VL.dialogueProblems()], []);
  const state = VL.createGame({ name: LONG_NAME });
  for (const [id, entries] of Object.entries(VL.DIALOGUES)) {
    for (const entry of entries) {
      for (const page of VL.dialoguePages(entry.say, state)) {
        assert.ok(page.length <= VL.ART.POPUP.maxLines, id);
        assert.deepEqual([...VL.ART.missingGlyphs(page.join(''))], [], `${id}: ${page.join(' ')}`);
      }
    }
  }
});

// R1: a wandering NPC is solid once W5's entity collision is in, so it must
// never stand where it would cut a screen in two.
test('no townsperson can stand where it splits its screen or blocks the way up to something', () => {
  const { VL } = loadGame();
  const { cols, rows } = VL.TUNING;
  const solidThing = (e) => e.type !== 'npc' && (e.solid || VL.ENTITIES[e.type]?.solid);
  let checked = 0;
  for (const area of Object.values(VL.AREAS)) {
    for (const [key, screen] of Object.entries(area.screens)) {
      for (const entity of screen.entities.filter((e) => e.type === 'npc')) {
        const room = { area: area.id, screen: key, entities: screen.entities.map((e) => ({ ...e })), tiles: {} };
        const npc = room.entities.find((e) => e.type === 'npc' && e.id === entity.id && e.x === entity.x && e.y === entity.y);
        const range = entity.wander ?? VL.NPCS[entity.id].wander;
        // People move, so only tiles and solid things count as walls here.
        const wall = (tx, ty) => VL.isSolidAt(area.id, key, tx, ty) || room.entities.some((e) => solidThing(e) && e.x === tx && e.y === ty);
        const open = (tx, ty, blocked) => tx >= 0 && ty >= 0 && tx < cols && ty < rows && !(tx === blocked.tx && ty === blocked.ty) && !wall(tx, ty);
        const parts = (blocked) => {
          const seen = new Set();
          let count = 0;
          for (let ty = 0; ty < rows; ty += 1) {
            for (let tx = 0; tx < cols; tx += 1) {
              if (!open(tx, ty, blocked) || seen.has(`${tx},${ty}`)) continue;
              count += 1;
              const queue = [[tx, ty]];
              seen.add(`${tx},${ty}`);
              while (queue.length) {
                const [x, y] = queue.pop();
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                  if (open(x + dx, y + dy, blocked) && !seen.has(`${x + dx},${y + dy}`)) {
                    seen.add(`${x + dx},${y + dy}`);
                    queue.push([x + dx, y + dy]);
                  }
                }
              }
            }
          }
          return count;
        };
        const whole = parts({ tx: -9, ty: -9 });
        const others = room.entities.filter((e) => e !== npc);
        assert.ok(!others.some((e) => e.type !== 'npc' && Math.abs(e.x - npc.x) + Math.abs(e.y - npc.y) === 1), `${entity.id} is placed beside something on ${key}`);
        for (let ty = entity.y - range; ty <= entity.y + range; ty += 1) {
          for (let tx = entity.x - range; tx <= entity.x + range; tx += 1) {
            const here = tx === entity.x && ty === entity.y;
            if (!here && !VL.npcMayStand(room, npc, tx, ty)) continue;
            checked += 1;
            assert.equal(parts({ tx, ty }), whole, `${entity.id} at ${tx},${ty} on ${key} splits the screen`);
          }
        }
      }
    }
  }
  assert.ok(checked > 0);
});

test('wandering keeps off tiles beside things, and follows this visit\'s tiles', () => {
  const { VL } = loadGame();
  const tiles = [...OPEN_ROOM];
  tiles[4] = 'T.....B.B......T';
  talkWorld(VL, { npc: { wander: 2 }, tiles, entities: [{ type: 'sign', x: 7, y: 2, text: 'Hi' }] });
  defineTester(VL);
  const app = talkApp(VL, { ty: 8 });
  const room = app.game.room;
  const npc = npcIn(app.game);
  assert.equal(VL.npcMayStand(room, npc, 7, 3), false, 'beside the sign');
  assert.equal(VL.npcMayStand(room, npc, 6, 3), true);
  assert.equal(VL.npcMayStand(room, npc, 6, 4), false, 'a bush');
  VL.setRoomTile(app.game, 6, 4, '.');
  assert.equal(VL.npcMayStand(room, npc, 6, 4), true, 'cut this visit');
  for (let i = 0; i < 60 * 60; i += 1) {
    app.update(VL.noActions(), STEP);
    assert.ok(!(npc.x === 7 && npc.y === 3), 'never beside the sign');
  }
});

test('render: a conversation draws the speaker and only the revealed text', () => {
  const { VL } = loadGame();
  talkWorld(VL);
  defineTester(VL, [{ say: 'Bonjour, {name}!' }]);
  const app = talkApp(VL, { name: 'Élodie' });
  press(VL, app, 'interact');
  wait(VL, app, 0.1);
  // The popup box draws its words with the kit's own text, so record what it is given.
  const drawn = () => {
    const strings = [];
    const original = VL.ART.drawPopup;
    VL.ART.drawPopup = (ctx, popup, t) => {
      strings.push(popup.title, ...popup.text.split('\n'));
      return original(ctx, popup, t);
    };
    VL.render(fakeContext(), app, 0);
    VL.ART.drawPopup = original;
    return strings;
  };
  const early = drawn();
  assert.ok(early.includes('Tess'));
  assert.ok(!early.some((s) => s.includes('Élodie!')), 'not all revealed at first');
  press(VL, app, 'interact');
  assert.ok(drawn().some((s) => s.startsWith('Bonjour, Élodie!')));
});
