// Node test for The Vanishing Library: loads the classic scripts listed in
// manifest.js into a node:vm context with a fake DOM and canvas.
// Run: node games/vanishing-library/game.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const directory = __dirname;
const read = (file) => fs.readFileSync(path.join(directory, file), 'utf8');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`✗ ${name}`);
    console.log(error.stack);
  }
}

// ---------- fakes ----------

function fakeContext() {
  const calls = {};
  const stubs = {
    calls,
    measureText: () => ({ width: 8 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  };
  return new Proxy(stubs, {
    get(target, property) {
      if (property in target) return target[property];
      return () => {
        calls[property] = (calls[property] || 0) + 1;
      };
    },
    set() {
      return true;
    },
  });
}

function fakeCanvas() {
  const ctx = fakeContext();
  const listeners = new Map();
  return {
    width: 0,
    height: 0,
    style: {},
    dataset: {},
    focused: false,
    getContext: () => ctx,
    getBoundingClientRect: () => ({ top: 100, left: 0 }),
    focus() {
      this.focused = true;
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    dispatch(type, event = {}) {
      listeners.get(type)?.(event);
    },
  };
}

function fakeDocument() {
  const canvas = fakeCanvas();
  const listeners = new Map();
  return {
    canvas,
    readyState: 'complete',
    hidden: false,
    getElementById: (id) => (id === 'game' ? canvas : null),
    createElement: (tag) => (tag === 'canvas' ? fakeCanvas() : { style: {} }),
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    dispatch(type, event = {}) {
      listeners.get(type)?.(event);
    },
  };
}

function fakeWindow(overrides = {}) {
  const listeners = new Map();
  const frames = [];
  return {
    innerWidth: 1024,
    innerHeight: 768,
    devicePixelRatio: 1,
    scrollY: 0,
    now: 0,
    frames,
    performance: {
      now() {
        return this.now;
      },
    },
    requestAnimationFrame: (frame) => frames.push(frame),
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    dispatch(type, event = {}) {
      listeners.get(type)?.(event);
    },
    ...overrides,
  };
}

function loadGame({ withMain = false, document = fakeDocument(), window = fakeWindow() } = {}) {
  const context = vm.createContext({ console, document, window });
  vm.runInContext(read('manifest.js'), context, { filename: 'manifest.js' });
  const files = context.VL.scriptFiles().filter((file) => withMain || file !== 'main.js');
  for (const file of files) vm.runInContext(read(file), context, { filename: file });
  context.document = document;
  context.window = window;
  return context;
}

// A fixture area the tests own, so content changes in regions/ don't break engine tests.
function addFixtureWorld(VL) {
  VL.addScreens('test', {
    '0,0': {
      tiles: [
        'TTTTTTTTTTTTTTTT',
        'T..............T',
        'T..............T',
        'T..............T',
        'T.......T.......',
        'T...............',
        'T...............',
        'T..............T',
        'T..............T',
        'T..............T',
        'TTTTTTTT....TTTT',
      ],
      entities: [],
    },
    '1,0': {
      tiles: [
        'TTTTTTTTTTTTTTTT',
        'T..............T',
        'T..............T',
        'T..............T',
        '................',
        '................',
        '................',
        'T..............T',
        'T..............T',
        'T..............T',
        'TTTT....TTTTTTTT',
      ],
      entities: [],
    },
    '0,1': {
      tiles: [
        'TTTTTTTT....TTTT',
        'T..............T',
        'T...............',
        'T..D............',
        'T..............T',
        'T..............T',
        'T..............T',
        'T..............T',
        'T..............T',
        'T..............T',
        'TTTTTTTTTTTTTTTT',
      ],
      entities: [
        { type: 'door', x: 3, y: 3, to: { area: 'room', screen: '0,0', tx: 7, ty: 8, facing: 'up' } },
      ],
    },
    '1,1': {
      tiles: [
        'TTTT....TTTTTTTT',
        'T..............T',
        '...............T',
        '...............T',
        'T..............T',
        'T..............T',
        'T..............T',
        'T..............T',
        'T..............T',
        'T..............T',
        'TTTTTTTTTTTTTTTT',
      ],
      entities: [],
    },
  });
  VL.addScreens('room', {
    '0,0': {
      tiles: [
        '################',
        '#______________#',
        '#______________#',
        '#______________#',
        '#______________#',
        '#______________#',
        '#______________#',
        '#______________#',
        '#______________#',
        '#______m_______#',
        '################',
      ],
      entities: [
        { type: 'door', x: 7, y: 9, to: { area: 'test', screen: '0,1', tx: 3, ty: 4, facing: 'down' } },
      ],
    },
  });
}

function playState(VL, place) {
  const state = VL.createGame();
  VL.place(state, place);
  return state;
}

function hold(VL, state, held, seconds) {
  const actions = VL.actions({ held });
  for (let t = 0; t < seconds - 1e-9; t += 1 / 60) VL.updateWorld(state, actions, 1 / 60);
}

function holdUntil(VL, state, held, done, maxSeconds = 2) {
  const actions = VL.actions({ held });
  for (let t = 0; t < maxSeconds && !done(state); t += 1 / 60) VL.updateWorld(state, actions, 1 / 60);
  assert.ok(done(state), 'condition reached');
}

// Plain arrays so assert.deepEqual doesn't trip over vm-realm prototypes.
const heroTile = (VL, state) => [VL.heroTile(state).tx, VL.heroTile(state).ty];

const keyEvent = (code, extra = {}) => ({
  code,
  key: code.startsWith('Key') ? code.slice(3).toLowerCase() : code,
  repeat: false,
  prevented: false,
  preventDefault() {
    this.prevented = true;
  },
  ...extra,
});

// ---------- page shell and layout contract ----------

const html = read('index.html');
const css = read('game.css');

test('index.html uses the site shell and has nothing game-related outside the canvas', () => {
  assert.ok(html.indexOf('assets/theme.js') < html.indexOf('assets/site.css'), 'theme.js loads before site.css');
  assert.match(html, /<link rel="stylesheet" href="game.css">/);
  assert.match(html, /href="\.\.\/\.\.\/index\.html">&larr; All games</);
  assert.match(html, /class="theme-toggle"/);
  assert.match(html, /<canvas id="game" width="256" height="192"/);
  const main = html.match(/<main>([\s\S]*?)<\/main>/)[1];
  assert.doesNotMatch(main, /<(button|form|input|p|h1|ul)\b/, 'main holds only the canvas');
});

test('index.html loads scripts through the manifest, not hand-written tags', () => {
  assert.match(html, /<script src="manifest.js"><\/script>/);
  assert.match(html, /VL\.scriptFiles\(\)/);
  assert.doesNotMatch(html, /<script src="(?!manifest\.js|\.\.\/\.\.\/assets\/theme\.js)/, 'no other script tags');
});

test('game.css widens main for the canvas and keeps the pixels crisp', () => {
  assert.match(css, /\.game-page main\s*{[^}]*max-width:\s*none/);
  assert.match(css, /#game\s*{[^}]*image-rendering:\s*pixelated/);
});

test('manifest lists existing files once, with main.js last', () => {
  const { VL } = loadGame();
  const files = VL.scriptFiles();
  assert.equal(new Set(files).size, files.length, 'no duplicates');
  for (const file of files) assert.ok(fs.existsSync(path.join(directory, file)), `${file} exists`);
  assert.equal(files.at(-1), 'main.js');
  for (const section of ['core', 'art', 'systems', 'entities', 'regions', 'dungeons', 'scenes', 'boot']) {
    assert.ok(Array.isArray(VL.FILES[section]), `section ${section}`);
  }
});

test('README documents the layout contract', () => {
  const readme = read('README.md');
  for (const word of ['manifest.js', 'VL.addScreens', 'VL.defineSystem', 'VL.defineScene', 'VL.defineEntity', 'VL.defineTileset']) {
    assert.ok(readme.includes(word), `README mentions ${word}`);
  }
});

// ---------- display ----------

test('fitScale picks the largest whole-number scale that fits, never below 1', () => {
  const { VL } = loadGame();
  assert.equal(VL.fitScale(1024, 700), 3);
  assert.equal(VL.fitScale(1600, 900), 4);
  assert.equal(VL.fitScale(1600, 575), 2, 'height limits too');
  assert.equal(VL.fitScale(100, 100), 1);
  assert.equal(VL.fitScale(1024, 700, 2), 7, 'scales in device pixels');
});

test('the screen buffer is 256×192 and presents at the integer scale', () => {
  const { VL, document } = loadGame();
  const screen = VL.createScreen(document.canvas, document);
  assert.equal(screen.buffer.width, 256);
  assert.equal(screen.buffer.height, 192);
  assert.equal(screen.fit(1024, 700, 1), 3);
  assert.equal(document.canvas.width, 768);
  assert.equal(document.canvas.height, 576);
  assert.equal(document.canvas.style.width, '768px');
  assert.equal(document.canvas.dataset.scale, '3');
  screen.fit(1024, 700, 2);
  assert.equal(document.canvas.width, 256 * 7);
  assert.equal(document.canvas.style.width, '896px', 'CSS size is device pixels over dpr');
  screen.present();
  assert.equal(document.canvas.getContext().calls.drawImage, 1);
});

// ---------- loop ----------

test('the loop runs fixed steps and clamps a long frame gap', () => {
  const { VL } = loadGame();
  const steps = [];
  let now = 0;
  const frames = [];
  const loop = VL.createLoop({
    poll: () => VL.actions({ pressed: ['interact'] }),
    update: (actions, dt) => steps.push({ dt, interact: actions.pressed.interact }),
    draw: () => {},
    now: () => now,
    raf: (frame) => frames.push(frame),
  });
  loop.start();
  frames.shift()();
  assert.equal(steps.length, 1, 'first frame runs one step');
  now = 16.7;
  frames.shift()();
  assert.equal(steps.length, 2);
  assert.equal(steps[1].dt, VL.TUNING.step);
  now += 5000;
  frames.shift()();
  const maxSteps = Math.round(VL.TUNING.maxFrame / VL.TUNING.step);
  assert.ok(steps.length - 2 <= maxSteps, `a 5 s gap runs at most ${maxSteps} steps`);
  assert.ok(steps.length - 2 >= maxSteps - 1);
  const pressedCount = steps.slice(2).filter((step) => step.interact).length;
  assert.equal(pressedCount, 1, 'a press counts for one step per frame');
  loop.stop();
  const before = frames.length;
  frames.shift()?.();
  assert.equal(frames.length, before - 1, 'a stopped loop does not reschedule');
});

test('app.update clamps dt', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  const app = VL.createApp();
  VL.place(app.game, { area: 'test', screen: '0,0', tx: 8, ty: 2 });
  const x0 = app.game.player.x;
  app.update(VL.actions({ held: ['right'] }), 5);
  assert.ok(app.game.player.x - x0 <= VL.TUNING.heroSpeed * VL.TUNING.maxDt + 1e-6);
  assert.ok(app.game.player.x > x0);
});

// ---------- input ----------

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
  VL.createKeyboardInput(win, fakeDocument());
  const arrow = keyEvent('ArrowDown');
  win.dispatch('keydown', arrow);
  assert.equal(arrow.prevented, true);
  const onButton = keyEvent('Space', { target: { tagName: 'BUTTON' } });
  win.dispatch('keydown', onButton);
  assert.equal(onButton.prevented, false);
});

test('letter keys also match by key name for other keyboard layouts', () => {
  const { VL } = loadGame();
  const win = fakeWindow();
  const input = VL.createKeyboardInput(win, fakeDocument());
  win.dispatch('keydown', { code: '', key: 'e', repeat: false, preventDefault() {} });
  assert.equal(input.poll().pressed.equipment, true);
});

// ---------- tiles and world data ----------

test('tilesets: the base legend has the expected tile kinds', () => {
  const { VL } = loadGame();
  const base = VL.TILESETS.base;
  assert.equal(base['.'].solid, undefined);
  assert.equal(base.T.solid, true);
  assert.equal(base.B.cuttable, true);
  assert.equal(base.Y.berry, true);
  assert.equal(base.W.water, true);
  assert.equal(base.w.shallow, true);
  assert.equal(base.D.door, true);
  assert.equal(base.m.door, true);
  assert.equal(base.s.sand, true);
});

test('areas can use their own tileset', () => {
  const { VL } = loadGame();
  VL.defineTileset('cave', { '#': { solid: true }, '.': {} });
  VL.defineArea('cave', { tileset: 'cave' });
  VL.addScreens('cave', { '0,0': { tiles: Array(11).fill('#..............#'), entities: [] } });
  assert.equal(VL.tileInfo('cave', '#').solid, true);
  assert.equal(VL.isSolidAt('cave', '0,0', 0, 0), true);
  assert.equal(VL.isSolidAt('cave', '0,0', 1, 0), false);
});

test('every screen in every area is 16×11 with known tiles', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  let screens = 0;
  for (const [areaId, area] of Object.entries(VL.AREAS)) {
    for (const [key, screen] of Object.entries(area.screens)) {
      screens += 1;
      assert.equal(screen.tiles.length, 11, `${areaId} ${key} rows`);
      for (const row of screen.tiles) {
        assert.equal(row.length, 16, `${areaId} ${key} cols`);
        for (const ch of row) assert.ok(VL.tileset(areaId)[ch], `unknown tile ${ch} in ${areaId} ${key}`);
      }
    }
  }
  assert.ok(screens >= 6);
});

test('open screen edges line up with their neighbours', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  const sides = [
    { dx: 1, dy: 0, mine: (i) => [15, i], theirs: (i) => [0, i], count: 11 },
    { dx: -1, dy: 0, mine: (i) => [0, i], theirs: (i) => [15, i], count: 11 },
    { dx: 0, dy: 1, mine: (i) => [i, 10], theirs: (i) => [i, 0], count: 16 },
    { dx: 0, dy: -1, mine: (i) => [i, 0], theirs: (i) => [i, 10], count: 16 },
  ];
  for (const [areaId, area] of Object.entries(VL.AREAS)) {
    for (const key of Object.keys(area.screens)) {
      for (const side of sides) {
        const other = VL.neighborKey(key, side.dx, side.dy);
        if (!VL.screenExists(areaId, other)) continue;
        for (let i = 0; i < side.count; i += 1) {
          const [mx, my] = side.mine(i);
          const [tx, ty] = side.theirs(i);
          assert.equal(
            VL.isSolidAt(areaId, key, mx, my),
            VL.isSolidAt(areaId, other, tx, ty),
            `${areaId} ${key} (${mx},${my}) vs ${other} (${tx},${ty})`,
          );
        }
      }
    }
  }
});

test('doors lead to walkable tiles on existing screens, and the start is walkable', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  let doors = 0;
  for (const [areaId, area] of Object.entries(VL.AREAS)) {
    for (const [key, screen] of Object.entries(area.screens)) {
      for (const entity of screen.entities.filter((e) => e.type === 'door')) {
        doors += 1;
        assert.ok(VL.screenExists(entity.to.area, entity.to.screen), `${areaId} ${key} door target exists`);
        assert.equal(VL.isSolidAt(entity.to.area, entity.to.screen, entity.to.tx, entity.to.ty), false);
        assert.equal(VL.isSolidAt(areaId, key, entity.x, entity.y), false, 'door tile is walkable');
      }
    }
  }
  assert.ok(doors >= 4);
  assert.equal(VL.isSolidAt(VL.START.area, VL.START.screen, VL.START.tx, VL.START.ty), false);
});

test('tile lookups wrap into the neighbour and are solid off the world edge', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  assert.equal(VL.neighborKey('1,1', -1, 0), '0,1');
  assert.equal(VL.neighborKey('0,0', 0, 1), '0,1');
  assert.equal(VL.tileAt('test', '0,0', 16, 5), '.', 'wraps into 1,0');
  assert.equal(VL.tileAt('test', '0,0', -1, 5), null, 'no screen west of 0,0');
  assert.equal(VL.isSolidAt('test', '0,0', -1, 5), true);
  assert.equal(VL.isSolidAt('test', '1,0', 16, 5), true, 'open tile but no neighbour');
  assert.equal(VL.isSolidAt('test', '0,0', -1, -1), true, 'diagonals are solid');
});

// ---------- movement ----------

test('walking moves the hero and sets facing', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  const state = playState(VL, { area: 'test', screen: '0,0', tx: 8, ty: 2, facing: 'down' });
  const { x, y } = state.player;
  hold(VL, state, ['left'], 0.25);
  assert.ok(state.player.x < x - 15);
  assert.equal(state.player.y, y);
  assert.equal(state.player.facing, 'left');
  assert.equal(state.player.moving, true);
  hold(VL, state, ['up'], 0.25);
  assert.equal(state.player.facing, 'up');
  hold(VL, state, [], 1 / 60);
  assert.equal(state.player.moving, false);
});

test('diagonal movement is normalized', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  const state = playState(VL, { area: 'test', screen: '0,0', tx: 8, ty: 2 });
  const { x, y } = state.player;
  hold(VL, state, ['right', 'down'], 0.5);
  const distance = Math.hypot(state.player.x - x, state.player.y - y);
  assert.ok(Math.abs(distance - VL.TUNING.heroSpeed * 0.5) < 2, `moved ${distance}`);
});

test('solid tiles block and the hero slides along walls', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  // The fixture has a lone tree at tile (8,4); start directly below it.
  const state = playState(VL, { area: 'test', screen: '0,0', tx: 8, ty: 6 });
  const { x } = state.player;
  hold(VL, state, ['up'], 1);
  const wallY = 80 + VL.TUNING.heroBox.h / 2;
  assert.ok(Math.abs(state.player.y - wallY) < 1, `stopped at the tree: ${state.player.y}`);
  assert.equal(state.player.x, x);
  hold(VL, state, ['up', 'left'], 0.15);
  assert.ok(Math.abs(state.player.y - wallY) < 1, 'still against the tree');
  assert.ok(state.player.x < x - 6, 'slid left along it');
});

test('crossing an open edge changes screen, records the visit, wraps and slides', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  const state = playState(VL, { area: 'test', screen: '0,0', tx: 14, ty: 5 });
  holdUntil(VL, state, ['right'], (s) => s.player.screen === '1,0', 0.5);
  assert.equal(state.visited['test:1,0'], true);
  assert.ok(state.player.x < 8, `wrapped to the left edge: ${state.player.x}`);
  assert.equal(state.transition.dir, 'right');
  assert.equal(state.transition.from.area, 'test');
  assert.equal(state.transition.from.screen, '0,0');
  assert.ok(state.events.some((event) => event.type === 'enterScreen'));
  const xDuring = state.player.x;
  hold(VL, state, ['right'], 0.1);
  assert.equal(state.player.x, xDuring, 'input is ignored while the slide runs');
  hold(VL, state, ['right'], VL.TUNING.slideSeconds);
  assert.equal(state.transition, null);
  assert.ok(state.player.x > xDuring, 'walking resumes after the slide');
});

test('all four edge directions transition', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  const cases = [
    { from: '0,0', tx: 14, ty: 5, dir: 'right', to: '1,0' },
    { from: '1,0', tx: 1, ty: 5, dir: 'left', to: '0,0' },
    { from: '0,0', tx: 9, ty: 9, dir: 'down', to: '0,1' },
    { from: '0,1', tx: 9, ty: 1, dir: 'up', to: '0,0' },
  ];
  for (const c of cases) {
    const state = playState(VL, { area: 'test', screen: c.from, tx: c.tx, ty: c.ty });
    hold(VL, state, [c.dir], 0.5);
    assert.equal(state.player.screen, c.to, `${c.dir} from ${c.from}`);
    assert.equal(state.transition.dir, c.dir);
  }
});

test('an open edge with no neighbour is a wall', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  const state = playState(VL, { area: 'test', screen: '1,0', tx: 14, ty: 5 });
  hold(VL, state, ['right'], 1);
  assert.equal(state.player.screen, '1,0');
  assert.ok(state.player.x <= 256 - VL.TUNING.heroBox.w / 2 + 1e-6);
  assert.equal(state.transition, null);
});

test('doors lead inside without a slide and the mat leads back out', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  const state = playState(VL, { area: 'test', screen: '0,1', tx: 3, ty: 5 });
  holdUntil(VL, state, ['up'], (s) => s.player.area === 'room');
  assert.equal(state.player.screen, '0,0');
  assert.equal(state.transition, null, 'doors do not slide');
  assert.equal(state.player.facing, 'up');
  assert.deepEqual(heroTile(VL, state), [7, 8]);
  assert.equal(state.visited['room:0,0'], true);
  assert.ok(state.events.some((event) => event.type === 'door'));
  holdUntil(VL, state, ['down'], (s) => s.player.area === 'test');
  assert.equal(state.player.screen, '0,1');
  assert.equal(state.player.facing, 'down');
  assert.deepEqual(heroTile(VL, state), [3, 4]);
  hold(VL, state, [], 0.5);
  assert.equal(state.player.area, 'test', 'standing still beside the door does not re-enter it');
});

test('entering a screen rebuilds the room from the screen entities', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  const state = playState(VL, { area: 'test', screen: '0,1', tx: 8, ty: 5 });
  assert.equal(state.room.entities.length, 1);
  state.room.entities[0].opened = true;
  VL.place(state, { area: 'test', screen: '0,0', tx: 8, ty: 2 });
  VL.place(state, { area: 'test', screen: '0,1', tx: 8, ty: 5 });
  assert.equal(state.room.entities[0].opened, undefined, 'fresh copies each visit');
  assert.notEqual(state.room.entities[0], VL.AREAS.test.screens['0,1'].entities[0]);
});

test('a new game starts at VL.START', () => {
  const { VL } = loadGame();
  const state = VL.newGame();
  assert.equal(state.player.area, VL.START.area);
  assert.equal(state.player.screen, VL.START.screen);
  assert.equal(state.visited[`${VL.START.area}:${VL.START.screen}`], true);
  assert.equal(state.hp, VL.TUNING.startMaxHp);
});

// ---------- registries ----------

test('systems run in order and can be added by later files', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  const log = [];
  VL.defineSystem('late', { update: () => log.push('late') });
  VL.defineSystem('early', { order: 1, update: () => log.push('early') });
  const state = playState(VL, { area: 'test', screen: '0,0', tx: 8, ty: 2 });
  VL.updateWorld(state, VL.noActions(), 1 / 60);
  assert.deepEqual(log, ['early', 'late']);
  assert.ok(VL.SYSTEMS.some((system) => system.id === 'movement'));
});

test('entity types get stand hooks from the engine', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  const stood = [];
  VL.defineEntity('plate', { onStand: (state, entity) => stood.push(entity.id) });
  VL.AREAS.test.screens['0,0'].entities.push({ type: 'plate', id: 'p1', x: 8, y: 1 });
  const state = playState(VL, { area: 'test', screen: '0,0', tx: 8, ty: 2 });
  hold(VL, state, ['up'], 0.3);
  assert.deepEqual(stood, ['p1'], 'fires once while standing');
});

test('scenes are registered and the app starts in VL.START_SCENE', () => {
  const { VL } = loadGame();
  assert.ok(VL.SCENES.play);
  assert.equal(VL.START_SCENE, 'play');
  const app = VL.createApp();
  assert.equal(app.sceneId, 'play');
  assert.ok(app.game, 'the play scene starts a game');
  const entered = [];
  VL.defineScene('title', { enter: (a, data) => entered.push(data), update() {}, draw() {} });
  app.setScene('title', { slot: 1 });
  assert.equal(app.sceneId, 'title');
  assert.deepEqual(entered, [{ slot: 1 }]);
  assert.throws(() => app.setScene('nope'), /unknown scene/);
});

// ---------- rendering ----------

test('render smoke: the play scene draws on a fake canvas, including a slide', () => {
  const { VL, document } = loadGame();
  addFixtureWorld(VL);
  const app = VL.createApp();
  VL.place(app.game, { area: 'test', screen: '0,0', tx: 14, ty: 5 });
  const ctx = document.createElement('canvas').getContext('2d');
  VL.render(ctx, app, 0);
  assert.ok(ctx.calls.fillRect > 100, 'tiles are drawn');
  hold(VL, app.game, ['right'], 0.6);
  assert.ok(app.game.transition);
  VL.render(ctx, app, 1);
  assert.ok(ctx.calls.save >= 1);
  VL.place(app.game, { area: 'room', screen: '0,0', tx: 7, ty: 8 });
  VL.render(ctx, app, 2);
});

test('boot wires the canvas, fits on resize, and runs frames', () => {
  const document = fakeDocument();
  const window = fakeWindow({ innerWidth: 1024, innerHeight: 700 });
  const { VL } = loadGame({ withMain: true, document, window });
  assert.ok(VL.app, 'the app is exposed for debugging');
  assert.equal(document.canvas.dataset.scale, '3');
  window.innerWidth = 1600;
  window.innerHeight = 1000;
  window.dispatch('resize');
  assert.equal(document.canvas.dataset.scale, '4');
  assert.equal(window.frames.length, 1);
  window.frames.shift()();
  assert.ok(document.canvas.getContext().calls.drawImage >= 1, 'a frame presented the buffer');
  document.canvas.dispatch('click');
  assert.equal(document.canvas.focused, true);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
