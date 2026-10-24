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

// `VL.defineSfx('squawk'`, `VL.defineEnemy("gull"` ... -> { 'Sfx squawk': [files] }
function literalDefinitions(files, source = read) {
  const where = {};
  const call = /VL\.define([A-Z]\w*)\(\s*(['"])([^'"]+)\2/g;
  for (const file of files) {
    for (const [, kind, , name] of source(file).matchAll(call)) {
      const key = `${kind} ${name}`;
      (where[key] ||= []).push(file);
    }
  }
  return where;
}

test('no registry name is defined by two different script files', () => {
  const clashes = Object.entries(literalDefinitions(manifestFiles()))
    .filter(([, files]) => new Set(files).size > 1)
    .map(([key, files]) => `define${key} in ${[...new Set(files)].join(' and ')}`);
  assert.deepEqual(clashes, []);
});

test('the scan sees the clash that broke the W6 + W7 merge', () => {
  const sources = { 'a.js': "VL.defineSfx('squawk', [", 'b.js': 'VL.defineSfx("squawk", [' };
  assert.deepEqual({ ...literalDefinitions(['a.js', 'b.js'], (file) => sources[file]) }, { 'Sfx squawk': ['a.js', 'b.js'] });
});

test('the whole manifest loads without throwing', () => {
  assert.doesNotThrow(() => loadGame());
});
