// Registry names are global: two items that both call VL.defineSfx('squawk')
// (or any VL.define<Kind>('name')) each pass alone and break the game at load
// once merged. This scans the source rather than loading it, so it still names
// both files when the clash stops every other test from loading.
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { test, read, loadGame } = require('./harness');

function manifestFiles() {
  const context = vm.createContext({});
  vm.runInContext(read('manifest.js'), context, { filename: 'manifest.js' });
  return context.VL.scriptFiles();
}

// `VL.defineSfx('squawk'`, `VL.ART.defineSprite("hen"` ... -> { 'Sfx squawk': [files], 'ART.Sprite hen': [files] }
// An enemy is also an entity, so the two share one namespace.
function literalDefinitions(files, source = read) {
  const where = {};
  const call = /VL\.(ART\.)?define([A-Z]\w*)\(\s*(['"])([^'"]+)\3/g;
  for (const file of files) {
    for (const [, art, kind, , name] of source(file).matchAll(call)) {
      const key = `${art || ''}${kind === 'Enemy' ? 'Entity' : kind} ${name}`;
      (where[key] ||= []).push(file);
    }
  }
  return where;
}

test('no registry name is defined by two different script files', () => {
  const clashes = Object.entries(literalDefinitions(manifestFiles()))
    .filter(([, files]) => new Set(files).size > 1)
    .map(([key, files]) => `define ${key} in ${[...new Set(files)].join(' and ')}`);
  assert.deepEqual(clashes, []);
});

test('the scan sees the clash that broke the W6 + W7 merge', () => {
  const sources = { 'a.js': "VL.defineSfx('squawk', [", 'b.js': 'VL.defineSfx("squawk", [' };
  assert.deepEqual({ ...literalDefinitions(['a.js', 'b.js'], (file) => sources[file]) }, { 'Sfx squawk': ['a.js', 'b.js'] });
});

test('the scan also sees the art kit\'s names, and an enemy clashing with an entity', () => {
  const sources = {
    'a.js': "VL.ART.defineSprite('hen', {",
    'b.js': "VL.ART.defineSprite('hen', {\nVL.defineEnemy('crab', {",
    'c.js': "VL.defineEntity('crab', {",
  };
  const found = { ...literalDefinitions(['a.js', 'b.js', 'c.js'], (file) => sources[file]) };
  assert.deepEqual(found['ART.Sprite hen'], ['a.js', 'b.js']);
  assert.deepEqual(found['Entity crab'], ['b.js', 'c.js']);
});

test('the whole manifest loads without throwing', () => {
  assert.doesNotThrow(() => loadGame());
});
