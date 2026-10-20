const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const directory = __dirname;
const gameSource = fs.readFileSync(path.join(directory, 'game.js'), 'utf8');
const gameHtml = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
const saveKey = 'escape-alpha-centauri-save';
const cacheX = 10.5 * 48;
const mainWreckX = 38.2 * 48;

class Element {
  constructor() {
    this.value = '';
    this.textContent = '';
    this.disabled = false;
    this.hidden = false;
    this.open = false;
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  dispatch(type) {
    this.listeners.get(type)?.({ preventDefault() {} });
  }

  focus() {
    this.focused = true;
  }

  showModal() {
    this.open = true;
  }

  close() {
    this.open = false;
    this.dispatch('close');
  }
}

function createCanvasContext() {
  return new Proxy({}, {
    get(target, property) {
      if (property === 'createLinearGradient') return () => ({ addColorStop() {} });
      return () => {};
    },
    set() {
      return true;
    },
  });
}

function boot(savedGame) {
  const ids = [
    'game', 'status', 'active-objective', 'game-dialog', 'panel-title',
    'quests-panel', 'inventory-panel', 'cache-panel', 'quest-active',
    'inventory-total', 'inventory-alloy', 'inventory-reactor-coil', 'cache-carried-total',
    'carried-alloy-count', 'carried-reactor-coil-count', 'cached-alloy-count',
    'cached-reactor-coil-count', 'kit-status', 'navigation-module-status',
    'reactor-core-status', 'shelter-status', 'fabricate-kit', 'repair-navigation-module',
    'rebuild-reactor-core', 'deploy-shelter', 'start-new-expedition', 'reset-save',
    'reset-confirmation', 'cancel-reset', 'confirm-reset', 'close-panel',
    'close-panel-footer', 'store-alloy-one', 'store-alloy-all',
    'store-reactor-coil-one', 'store-reactor-coil-all', 'take-alloy-one',
    'take-alloy-all', 'take-reactor-coil-one', 'take-reactor-coil-all',
    'complete-first-signal', 'complete-wreck-beacon', 'complete-navigation',
    'complete-main-wreck', 'complete-reactor', 'complete-shelter',
    'memory-first-signal', 'memory-wreck-beacon', 'memory-navigation',
    'memory-main-wreck', 'memory-reactor', 'memory-shelter',
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, new Element()]));
  elements.game.width = 960;
  elements.game.height = 480;
  elements.game.getContext = createCanvasContext;

  const values = new Map();
  if (savedGame) values.set(saveKey, JSON.stringify(savedGame));
  const localStorage = {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const windowListeners = new Map();
  const window = {
    addEventListener(type, listener) {
      windowListeners.set(type, listener);
    },
  };

  vm.runInNewContext(gameSource, {
    window,
    document: { querySelector: (selector) => elements[selector.slice(1)] },
    localStorage,
    performance: { now: () => 0 },
    requestAnimationFrame() {},
    console,
    Math,
    Set,
    Array,
    Object,
    Number,
    JSON,
  }, { filename: 'game.js' });

  return {
    elements,
    saved: () => JSON.parse(values.get(saveKey)),
    hasSavedGame: () => values.has(saveKey),
    pressKey: (key) => windowListeners.get('keydown')?.({
      key,
      code: key === ' ' ? 'Space' : '',
      repeat: false,
      preventDefault() {},
    }),
  };
}

function inventory(carriedAlloy = 0, cachedAlloy = 0, carriedCoils = 0, cachedCoils = 0) {
  return {
    carried: { alloy: carriedAlloy, 'reactor-coil': carriedCoils },
    cached: { alloy: cachedAlloy, 'reactor-coil': cachedCoils },
  };
}

function save(overrides = {}) {
  return {
    version: 10,
    player: { x: cacheX, facing: 1 },
    inventory: inventory(),
    milestones: { firstSignal: false, wreckBeacon: false, mainWreck: false },
    upgrades: { climbingKit: false },
    repairs: { navigationModule: false, reactorCoreRepaired: false },
    construction: { emergencyShelter: false },
    tileChanges: [],
    drops: [],
    ...overrides,
  };
}

assert.match(gameHtml, /id="game-dialog"/);
assert.match(gameHtml, /id="start-new-expedition"/);
assert.match(gameHtml, /id="reset-confirmation"/);
assert.match(gameHtml, /Move 1/);
assert.match(gameHtml, /Quests: Q/);
assert.doesNotMatch(gameHtml, /id="memory-dialog"/);

{
  const { elements, pressKey } = boot();
  pressKey('q');
  assert.equal(elements['game-dialog'].open, true);
  assert.equal(elements['panel-title'].textContent, 'Quests and memories');
  assert.equal(elements['quests-panel'].hidden, false);
  elements['close-panel'].dispatch('click');
  assert.equal(elements['game-dialog'].open, false);
  assert.equal(elements.game.focused, true);

  pressKey('i');
  assert.equal(elements['panel-title'].textContent, 'Carried inventory');
  assert.equal(elements['inventory-total'].textContent, 0);
}

{
  const { elements, saved, pressKey } = boot(save({ inventory: inventory(2, 3, 0, 1) }));
  pressKey('e');
  assert.equal(elements['panel-title'].textContent, 'Salvage cache');
  elements['store-alloy-one'].dispatch('click');
  assert.deepEqual(saved().inventory, inventory(1, 4, 0, 1));
  elements['store-alloy-all'].dispatch('click');
  assert.deepEqual(saved().inventory, inventory(0, 5, 0, 1));
  elements['take-alloy-all'].dispatch('click');
  assert.deepEqual(saved().inventory, inventory(2, 3, 0, 1), 'Move all honors the two-item capacity');
  assert.equal(elements['cache-carried-total'].textContent, 2);
}

{
  const { elements, saved, pressKey } = boot(save({
    inventory: inventory(1, 2, 0, 0),
    player: { x: cacheX, facing: 1 },
  }));
  pressKey('e');
  elements['store-alloy-one'].dispatch('click');
  assert.equal(saved().milestones.firstSignal, true, 'cache transfer unlocks and persists the first memory');
  assert.equal(elements['memory-first-signal'].hidden, false);
}

{
  const { elements, saved, pressKey } = boot(save({
    player: { x: mainWreckX, facing: 1 },
    milestones: { firstSignal: true, wreckBeacon: true, mainWreck: false },
    repairs: { navigationModule: true, reactorCoreRepaired: false },
  }));
  pressKey('e');
  assert.equal(saved().milestones.mainWreck, true, 'E keeps main-wreck contextual interaction');
  assert.equal(elements['game-dialog'].open, false);
  pressKey('q');
  assert.equal(elements['complete-main-wreck'].hidden, false);
  assert.equal(elements['memory-main-wreck'].hidden, false);
}

{
  const { elements, saved, pressKey } = boot(save({
    inventory: inventory(0, 6, 0, 0),
    milestones: { firstSignal: true, wreckBeacon: true, mainWreck: false },
  }));
  pressKey('e');
  elements['repair-navigation-module'].dispatch('click');
  assert.equal(saved().repairs.navigationModule, true);
  assert.equal(elements['memory-navigation'].hidden, false);
}

{
  const { elements, saved, pressKey } = boot(save({
    inventory: inventory(0, 0, 0, 3),
    milestones: { firstSignal: true, wreckBeacon: true, mainWreck: true },
    repairs: { navigationModule: true, reactorCoreRepaired: false },
  }));
  pressKey('e');
  elements['rebuild-reactor-core'].dispatch('click');
  assert.equal(saved().repairs.reactorCoreRepaired, true);
  elements['deploy-shelter'].dispatch('click');
  assert.equal(saved().construction.emergencyShelter, true);
}

{
  const legacy = {
    version: 1,
    player: { x: cacheX, facing: 1 },
    inventory: { alloy: 7 },
    tileChanges: [],
    drops: [],
  };
  const { saved } = boot(legacy);
  assert.equal(saved().version, 10);
  assert.deepEqual(saved().inventory, inventory(2, 5));
  assert.deepEqual(saved().construction, { emergencyShelter: false });
}

{
  const { elements, hasSavedGame, saved, pressKey } = boot(save({
    inventory: inventory(1, 6, 1, 3),
    milestones: { firstSignal: true, wreckBeacon: true, mainWreck: true },
    upgrades: { climbingKit: true },
    repairs: { navigationModule: true, reactorCoreRepaired: true },
    construction: { emergencyShelter: true },
  }));
  elements['start-new-expedition'].dispatch('click');
  assert.equal(elements['reset-confirmation'].open, true);
  elements['cancel-reset'].dispatch('click');
  assert.equal(elements['reset-confirmation'].open, false);
  assert.equal(elements['start-new-expedition'].focused, true, 'cancelling returns focus to the initiating control');
  assert.equal(saved().construction.emergencyShelter, true, 'cancelling retains the saved expedition');

  pressKey('q');
  elements['reset-save'].dispatch('click');
  assert.equal(elements['reset-confirmation'].open, true, 'the paused dialog also offers a new expedition');
  elements.game.focused = false;
  elements['confirm-reset'].dispatch('click');
  assert.equal(hasSavedGame(), false, 'confirmation clears the local saved expedition');
  assert.equal(elements['game-dialog'].open, false);
  assert.equal(elements['reset-confirmation'].open, false);
  assert.equal(elements['inventory-total'].textContent, 0);
  assert.equal(elements['active-objective'].textContent, 'Follow the emergency signal east.');
  assert.equal(elements['complete-shelter'].hidden, true, 'confirmation restores baseline progression');
  assert.equal(elements.game.focused, true, 'confirmation returns keyboard play to the canvas');
}

console.log('Escape from Alpha Centauri dialog, cache transfer, reset confirmation, persistence, and contextual interaction tests passed.');
