// Shared by every tests/*.test.js: the test runner, a fake DOM and canvas, a
// loader that runs the manifest's scripts in node:vm, and a fixture world.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const directory = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(directory, file), 'utf8');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    // Tests are synchronous: a promise would be counted ✓ before it settled.
    if (typeof fn()?.then === 'function') throw new Error('tests are synchronous; do not use an async test function');
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`✗ ${name}`);
    console.log(error.stack);
  }
}

const testCount = () => passed + failed;

// One summary whether game.test.js ran every file or a single file ran directly.
process.on('exit', () => {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
});

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
  const mediaQueries = [];
  return {
    innerWidth: 1024,
    innerHeight: 768,
    devicePixelRatio: 1,
    scrollY: 0,
    now: 0,
    frames,
    mediaQueries,
    // Each query records its listeners; a test fires `change` on the last one.
    matchMedia(media) {
      const query = {
        media,
        listeners: [],
        addEventListener(type, listener) {
          if (type === 'change') query.listeners.push(listener);
        },
        change() {
          for (const listener of query.listeners.splice(0)) listener({ matches: false });
        },
      };
      mediaQueries.push(query);
      return query;
    },
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

// An app in the play scene with a live game, whatever VL.START_SCENE is.
function playApp(VL) {
  const app = VL.createApp();
  if (!app.game) app.game = VL.newGame();
  if (app.sceneId !== 'play') app.setScene('play');
  return app;
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

module.exports = {
  test, testCount, read, directory,
  fakeContext, fakeCanvas, fakeDocument, fakeWindow,
  loadGame, addFixtureWorld, playState, playApp, hold, holdUntil, heroTile, keyEvent,
};
