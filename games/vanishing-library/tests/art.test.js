// The art kit (W4): palette, sprite outlines, fonts and text metrics, tile
// style choice and shore edges, hero frames, HUD model, popups, and the
// art sheet scene.
const assert = require('node:assert/strict');
const { test, read, loadGame, addFixtureWorld, playApp, fakeDocument } = require('./harness');

// A context that records the colour of every pixel filled with fillRect.
function pixelContext() {
  const pixels = new Map();
  const ctx = {
    pixels,
    fillStyle: null,
    fillRect(x, y, w, h) {
      for (let j = y; j < y + h; j += 1) for (let i = x; i < x + w; i += 1) pixels.set(`${i},${j}`, ctx.fillStyle);
    },
    at: (x, y) => pixels.get(`${x},${y}`) ?? null,
  };
  return ctx;
}

const artFiles = () => loadGame().VL.FILES.art.map(read).join('\n');

// ---------- palette ----------

test('palette: named colours, lower-case hex, and an unknown name is an error', () => {
  const { VL } = loadGame();
  assert.equal(VL.ART.color('heart'), '#e2443c');
  assert.equal(VL.ART.color('outline'), '#18242a');
  for (const [name, value] of Object.entries(VL.PALETTE)) assert.match(value, /^#[0-9a-f]{6}([0-9a-f]{2})?$/, name);
  assert.throws(() => VL.ART.color('hart'), /no palette colour hart/);
});

test('palette: a later file adds colours, and a clash or a bad value is an error', () => {
  const { VL } = loadGame();
  VL.ART.addColors({ mossDark: '#2a4a2a' });
  assert.equal(VL.ART.color('mossDark'), '#2a4a2a');
  assert.throws(() => VL.ART.addColors({ heart: '#ff0000' }), /heart is already defined/);
  assert.throws(() => VL.ART.addColors({ pink: 'pink' }), /pink must be/);
  assert.throws(() => VL.ART.addColors({ loud: '#FF0000' }), /loud must be/);
});

test('in-canvas colours do not depend on the page theme', () => {
  const source = artFiles();
  for (const word of ['data-theme', 'getComputedStyle', 'var(--', 'prefers-color-scheme', 'document.']) {
    assert.ok(!source.includes(word), `art files must not read ${word}`);
  }
});

// ---------- sprites ----------

test('sprites get a 1px outline on the 4 sides of every filled pixel, never diagonally', () => {
  const { VL } = loadGame();
  VL.ART.defineSprite('plus', { colors: { x: 'heart' }, rows: ['.x.', 'xxx', '.x.'] });
  const { grid, offset, width, height } = VL.ART.spritePixels(VL.ART.SPRITES.plus.def);
  assert.equal(offset, -1);
  assert.equal(width, 5);
  assert.equal(height, 5);
  const map = grid.map((row) => row.map((name) => (name === 'outline' ? 'o' : name === 'heart' ? 'x' : '.')).join(''));
  assert.deepEqual([...map], [
    '..o..',
    '.oxo.',
    'oxxxo',
    '.oxo.',
    '..o..',
  ]);
});

test('sprites: outline false, a custom outline colour, and drawing keeps the top-left at (x, y)', () => {
  const { VL } = loadGame();
  VL.ART.defineSprite('dot', { outline: false, colors: { x: 'heart' }, rows: ['x'] });
  VL.ART.defineSprite('ringed', { outline: 'gold', colors: { x: 'heart' }, rows: ['x'] });
  assert.equal(VL.ART.spritePixels(VL.ART.SPRITES.dot.def).width, 1);
  const ctx = pixelContext();
  VL.ART.drawSprite(ctx, 'ringed', 10, 20);
  assert.equal(ctx.at(10, 20), VL.PALETTE.heart);
  assert.equal(ctx.at(9, 20), VL.PALETTE.gold);
  assert.equal(ctx.at(10, 19), VL.PALETTE.gold);
  assert.equal(ctx.at(9, 19), null, 'no corner pixel');
  assert.equal(ctx.pixels.size, 5);
});

test('sprites: mirrorOf flips left-right; bad definitions are errors', () => {
  const { VL } = loadGame();
  VL.ART.defineSprite('arrow', { colors: { a: 'heart', b: 'gold' }, rows: ['ab.'] });
  VL.ART.defineSprite('arrowBack', { mirrorOf: 'arrow' });
  assert.deepEqual([...VL.ART.SPRITES.arrowBack.def.rows], ['.ba']);
  assert.throws(() => VL.ART.defineSprite('arrow', { colors: { a: 'heart' }, rows: ['a'] }), /already defined/);
  assert.throws(() => VL.ART.defineSprite('ragged', { colors: { a: 'heart' }, rows: ['aa', 'a'] }), /every row/);
  assert.throws(() => VL.ART.defineSprite('typo', { colors: { a: 'heart' }, rows: ['ab'] }), /'b' has no colour/);
  assert.throws(() => VL.ART.defineSprite('raw', { colors: { a: '#ff0000' }, rows: ['a'] }), /no palette colour/);
  assert.throws(() => VL.ART.defineSprite('lost', { mirrorOf: 'nope' }), /no sprite nope/);
  assert.throws(() => VL.ART.drawSprite(pixelContext(), 'nope', 0, 0), /no sprite nope/);
});

test('every shipped sprite compiles', () => {
  const { VL } = loadGame();
  for (const id of Object.keys(VL.ART.SPRITES)) assert.ok(VL.ART.sprite(id).runs.length > 0, id);
});

// ---------- text ----------

test('text metrics: glyph widths plus 1px gaps, per size', () => {
  const { VL } = loadGame();
  assert.equal(VL.ART.measureText('A'), 5);
  assert.equal(VL.ART.measureText('AB'), 11);
  assert.equal(VL.ART.measureText('Hi'), 5 + 1 + 1);
  assert.equal(VL.ART.measureText('A A'), 5 + 1 + 3 + 1 + 5);
  assert.equal(VL.ART.measureText(''), 0);
  assert.equal(VL.ART.measureText('AB', 'large'), 22);
  assert.equal(VL.ART.measureText('ab', 'small'), VL.ART.measureText('AB', 'small'), 'small draws lower case as capitals');
  assert.equal(VL.ART.measureText('042', 'small'), 11);
  assert.equal(VL.ART.measureText('AB\nA'), 11, 'widest line');
  assert.equal(VL.ART.lineHeight('normal'), 10);
  assert.equal(VL.ART.lineHeight('small'), 7);
  assert.equal(VL.ART.lineHeight('large'), 20);
});

test('text: unknown characters are reported and drawn as "?"', () => {
  const { VL } = loadGame();
  assert.deepEqual([...VL.ART.missingGlyphs('Hi, {name}!')], ['{', '}']);
  assert.deepEqual([...VL.ART.missingGlyphs('shells 042', 'small')], []);
  assert.equal(VL.ART.measureText('{'), VL.ART.measureText('?'));
});

test('text: every font covers letters, digits and common punctuation', () => {
  const { VL } = loadGame();
  const normal = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!?\'":;-+=()/&%*<>←→↑↓';
  assert.deepEqual([...VL.ART.missingGlyphs(normal)], []);
  assert.deepEqual([...VL.ART.missingGlyphs('ABCXYZ0123456789 .,!?:-+/\'()␣←→↑↓', 'small')], []);
});

test('text wraps at spaces inside the width, breaks a word that cannot fit, and honours \\n', () => {
  const { VL } = loadGame();
  const lines = VL.ART.wrapText('The librarian reads the book with you.', 100);
  assert.ok(lines.length > 1);
  for (const line of lines) assert.ok(VL.ART.measureText(line) <= 100, line);
  assert.equal(lines.join(' '), 'The librarian reads the book with you.');
  const long = VL.ART.wrapText('Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 40);
  assert.ok(long.length > 1);
  for (const line of long) assert.ok(VL.ART.measureText(line) <= 40);
  assert.deepEqual([...VL.ART.wrapText('One\nTwo', 200)], ['One', 'Two']);
});

test('text draws glyph pixels at (x, y) and aligns centre and right', () => {
  const { VL } = loadGame();
  const ctx = pixelContext();
  const width = VL.ART.text(ctx, 'I', 10, 20, { color: 'gold' });
  assert.equal(width, 3);
  assert.equal(ctx.at(10, 20), VL.PALETTE.gold, 'top-left of the I');
  assert.equal(ctx.at(11, 23), VL.PALETTE.gold, 'stem');
  assert.equal(ctx.at(10, 23), null);
  const right = pixelContext();
  VL.ART.text(right, 'I', 20, 0, { align: 'right' });
  assert.equal(right.at(19, 0), VL.PALETTE.text);
  assert.equal(right.at(20, 0), null);
  const shadowed = pixelContext();
  VL.ART.text(shadowed, 'I', 0, 0, { shadow: 'outline' });
  assert.equal(shadowed.at(3, 1), VL.PALETTE.outline, 'shadow 1px down-right');
  assert.equal(shadowed.at(0, 0), VL.PALETTE.text);
});

// ---------- tiles ----------

test('tile choice: each base tile character gets its style', () => {
  const { VL } = loadGame();
  const expected = {
    '.': 'grass', ',': 'flowers', s: 'sand', P: 'path', T: 'tree', R: 'rock', B: 'bush', Y: 'berry',
    W: 'water', w: 'shallow', X: 'fence', H: 'wall', D: 'door', '#': 'wallInside', _: 'floor', m: 'door',
  };
  for (const [ch, style] of Object.entries(expected)) assert.equal(VL.ART.tileStyleFor(VL.TILESETS.base[ch]).name, style, ch);
});

test('tile choice: art picks a style by name, higher priority wins, and gaps are loud', () => {
  const { VL } = loadGame();
  assert.equal(VL.ART.tileStyleFor({ sand: true, art: 'path' }).name, 'path');
  assert.equal(VL.ART.tileStyleFor({ art: 'nope' }).name, 'missing');
  assert.equal(VL.ART.tileStyleFor({ solid: true }).name, 'missing');
  VL.ART.defineTileStyle('dig', { when: 'dig', priority: 35, ground() {} });
  assert.equal(VL.ART.tileStyleFor({ sand: true, dig: true }).name, 'dig');
  VL.ART.defineTileStyle('lowDig', { when: 'dig', priority: 5, ground() {} });
  assert.equal(VL.ART.tileStyleFor({ dig: true }).name, 'dig');
  assert.throws(() => VL.ART.defineTileStyle('grass', {}), /tile style grass is already defined/);
});

test('every character of every shipped tileset has a tile style', () => {
  const { VL } = loadGame();
  for (const [id, legend] of Object.entries(VL.TILESETS)) {
    for (const [ch, info] of Object.entries(legend)) assert.notEqual(VL.ART.tileStyleFor(info).name, 'missing', `${id} '${ch}'`);
  }
});

test('shore: water meets land on the sides where the neighbour is dry, across screen edges too', () => {
  const { VL } = loadGame();
  const edges = (lookup, tx, ty) => ({ ...VL.ART.wetEdges({ near: (dx, dy) => lookup(tx + dx, ty + dy) }) });
  const map = ['ssW', 'wWW', 'WWW'];
  const lookup = (tx, ty) => (map[ty]?.[tx] ? VL.TILESETS.base[map[ty][tx]] : null);
  assert.deepEqual(edges(lookup, 2, 0), { n: false, e: false, s: false, w: true }, 'null off the map is more water');
  assert.deepEqual(edges(lookup, 0, 1), { n: true, e: false, s: false, w: false }, 'shallow counts as wet');
  assert.deepEqual(edges(lookup, 1, 1), { n: true, e: false, s: false, w: false });
  addFixtureWorld(VL);
  VL.addScreens('test', { '2,0': { tiles: Array(11).fill('WWWWWWWWWWWWWWWW'), entities: [] } });
  const screenLookup = (tx, ty) => {
    const ch = VL.tileAt('test', '2,0', tx, ty);
    return ch === null ? null : VL.tileInfo('test', ch);
  };
  assert.equal(VL.ART.wetEdges({ near: (dx, dy) => screenLookup(0 + dx, 4 + dy) }).w, true, 'the open edge of 1,0 is grass');
  assert.equal(VL.ART.wetEdges({ near: (dx, dy) => screenLookup(0 + dx, 0 + dy) }).w, true, 'tree border of 1,0');
});

test('tiles draw in passes: every ground before any shadow, every shadow before any raised', () => {
  const { VL } = loadGame();
  const order = [];
  VL.ART.defineTileStyle('probe', { ground: () => order.push('ground'), shadow: () => order.push('shadow'), raised: () => order.push('raised') });
  VL.ART.drawTiles(pixelContext(), () => ({ art: 'probe' }), 0, 0, 0);
  const cells = VL.TUNING.cols * VL.TUNING.rows;
  assert.equal(order.length, cells * 3);
  assert.equal(order.lastIndexOf('ground'), cells - 1);
  assert.equal(order.indexOf('raised'), cells * 2);
});

test('water ripples move with time, and the same tile and time draw the same pixels', () => {
  const { VL } = loadGame();
  const draw = (t) => {
    const ctx = pixelContext();
    VL.ART.drawTiles(ctx, () => VL.TILESETS.base.W, 0, 0, t);
    return [...ctx.pixels.values()].join();
  };
  assert.equal(draw(1), draw(1));
  assert.notEqual(draw(1), draw(1.5));
});

// ---------- hero ----------

test('hero: 4 directions × stand and 2 walk frames; right mirrors left', () => {
  const { VL } = loadGame();
  for (const facing of ['down', 'up', 'left', 'right']) {
    for (let frame = 0; frame < 3; frame += 1) {
      const { w, h } = VL.ART.sprite(`hero-${facing}-${frame}`);
      assert.deepEqual([w, h], [12, 14], `hero-${facing}-${frame}`);
    }
  }
  const left = VL.ART.SPRITES['hero-left-1'].def.rows;
  assert.deepEqual([...VL.ART.SPRITES['hero-right-1'].def.rows], [...left.map((row) => [...row].reverse().join(''))]);
});

test('hero frames: standing shows frame 0, walking alternates 1 and 2', () => {
  const { VL } = loadGame();
  assert.equal(VL.ART.heroFrame({ facing: 'left', moving: false }, 0.3).sprite, 'hero-left-0');
  const walking = new Set();
  for (let t = 0; t < 1; t += 1 / 60) walking.add(VL.ART.heroFrame({ facing: 'up', moving: true }, t).sprite);
  assert.deepEqual([...walking].sort(), ['hero-up-1', 'hero-up-2']);
  assert.equal(VL.ART.heroFrame({ facing: 'sideways', moving: false }, 0).sprite, 'hero-down-0');
});

test('the hero is drawn with its boots ending 3px below the feet point', () => {
  const { VL } = loadGame();
  const ctx = pixelContext();
  VL.ART.drawHero(ctx, { facing: 'down', moving: false }, 100, 100, 0);
  const boots = VL.PALETTE.boots;
  const bootRows = [...ctx.pixels].filter(([, color]) => color === boots).map(([key]) => Number(key.split(',')[1]));
  assert.equal(Math.max(...bootRows), 103);
});

// ---------- HUD and popups ----------

test('HUD hearts: two half-hearts each, rounded to full, half and empty', () => {
  const { VL } = loadGame();
  const hearts = (hp, maxHp) => [...VL.ART.hudModel({ hp, maxHp }).hearts];
  assert.deepEqual(hearts(6, 6), ['full', 'full', 'full']);
  assert.deepEqual(hearts(5, 6), ['full', 'full', 'half']);
  assert.deepEqual(hearts(1, 6), ['half', 'empty', 'empty']);
  assert.deepEqual(hearts(0, 6), ['empty', 'empty', 'empty']);
  assert.equal(hearts(20, 20).length, 10);
});

test('HUD values come from sources the owning files plug in once', () => {
  const { VL } = loadGame();
  const state = { hp: 6, maxHp: 6, purse: 7, hands: { main: 'sword-wood' } };
  assert.equal(VL.ART.hudModel(state).shells, 0);
  assert.equal(VL.ART.hudModel(state).mainHand, null);
  VL.ART.hudSource('shells', (s) => s.purse);
  VL.ART.hudSource('mainHand', (s) => s.hands.main);
  assert.equal(VL.ART.hudModel(state).shells, 7);
  assert.equal(VL.ART.hudModel(state).mainHand, 'sword-wood');
  assert.throws(() => VL.ART.hudSource('shells', () => 1), /already has a source/);
  assert.throws(() => VL.ART.hudSource('rupees', () => 1), /no HUD value rupees/);
});

test('HUD draws hearts, the shell count and filled slots with their item sprite', () => {
  const { VL } = loadGame();
  const ctx = pixelContext();
  VL.ART.drawHudModel(ctx, { hearts: ['full', 'half'], shells: 42, mainHand: 'sword-wood', offHand: null });
  const { heartX, heartY, slots, slotY } = VL.ART.HUD_LAYOUT;
  assert.equal(ctx.at(heartX + 1, heartY + 1), VL.PALETTE.heartLight);
  assert.equal(ctx.at(slots[0].x, slotY + 2), VL.PALETTE.text, 'filled slot frame');
  assert.equal(ctx.at(slots[1].x, slotY + 2), VL.PALETTE.slotEmpty, 'empty slot frame');
  const used = new Set(ctx.pixels.values());
  assert.ok(used.has(VL.PALETTE.wood), 'the sword sprite is in the slot');
});

test('popups wrap inside the box, sit inside the canvas and flag text that is too long', () => {
  const { VL } = loadGame();
  const { width, height, hudHeight } = VL.TUNING;
  for (const at of ['top', 'center', 'bottom']) {
    const layout = VL.ART.popupLayout({ title: 'Wood Sword', text: 'You found a wood sword! Press Space to swing it.', at });
    assert.ok(layout.x >= 0 && layout.x + layout.w <= width, at);
    assert.ok(layout.y >= hudHeight && layout.y + layout.h <= height, at);
    for (const line of layout.lines) assert.ok(VL.ART.measureText(line) <= layout.w - 12, line);
    assert.equal(layout.overflow, false);
  }
  const long = VL.ART.popupLayout({ text: 'word '.repeat(80) });
  assert.equal(long.overflow, true);
  assert.equal(long.lines.length, VL.ART.POPUP.maxLines);
  const ctx = pixelContext();
  const drawn = VL.ART.drawPopup(ctx, { text: 'Hi' }, 0);
  assert.equal(ctx.at(drawn.x, drawn.y), null, 'clipped corner');
  assert.equal(ctx.at(drawn.x + 1, drawn.y), VL.PALETTE.outline);
});

// ---------- light and integration ----------

test('light: areas default to day; a mood is set once per area', () => {
  const { VL } = loadGame();
  assert.equal(VL.ART.lightFor('overworld'), 'day');
  VL.ART.setAreaLight('cellar', 'dark');
  assert.equal(VL.ART.lightFor('cellar'), 'dark');
  assert.throws(() => VL.ART.setAreaLight('cellar', 'day'), /already has a light/);
  assert.throws(() => VL.ART.setAreaLight('attic', 'disco'), /no light disco/);
});

test('the play scene draws through the kit: tiles, hero, light and HUD', () => {
  const { VL, document } = loadGame();
  const used = [];
  for (const name of ['drawScreenTiles', 'drawHero', 'drawLight', 'drawHud']) {
    const original = VL.ART[name];
    VL.ART[name] = (...args) => {
      used.push(name);
      return original(...args);
    };
  }
  const app = playApp(VL);
  VL.render(document.createElement('canvas').getContext('2d'), app, 0);
  assert.deepEqual(used, ['drawScreenTiles', 'drawHero', 'drawLight', 'drawHud']);
});

test('the art sheet scene draws every page and pages with left and right', () => {
  const { VL } = loadGame({ document: fakeDocument() });
  const app = VL.createApp();
  app.setScene('artSheet', { page: 0 });
  for (let page = 0; page < VL.ART_SHEET_PAGES; page += 1) {
    const ctx = pixelContext();
    Object.assign(ctx, { save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, translate() {}, createRadialGradient: () => ({ addColorStop() {} }) });
    VL.render(ctx, app, page * 0.37);
    assert.ok(ctx.pixels.size > 30000, `page ${page + 1} fills the canvas`);
    app.update(VL.actions({ pressed: ['right'] }), 1 / 60);
  }
  assert.equal(app.artPage, 0, 'wraps around');
  app.update(VL.actions({ pressed: ['left'] }), 1 / 60);
  assert.equal(app.artPage, VL.ART_SHEET_PAGES - 1);
});

test('README has the art kit style guide', () => {
  const readme = read('README.md');
  for (const word of ['## Art kit', 'VL.ART.defineSprite', 'VL.PALETTE', 'VL.ART.addColors', 'VL.ART.defineTileStyle', 'VL.ART.text', 'outline', "'small'", "'large'"]) {
    assert.ok(readme.includes(word), `README mentions ${word}`);
  }
});

test('the art section loads art.js first; other art files only use it', () => {
  const { VL } = loadGame();
  assert.equal(VL.FILES.art[0], 'art.js');
});
