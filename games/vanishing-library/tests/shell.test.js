// Page shell, manifest and README contract, display scaling, the frame loop, boot.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, read, directory, loadGame, addFixtureWorld, playApp, fakeDocument, fakeWindow, keyEvent } = require('./harness');

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
  // The padding under the canvas must not exceed the 16px gutter fit() leaves, or the page scrolls.
  assert.match(css, /\.game-page main\s*{[^}]*padding:\s*1rem;/);
  assert.match(read('main.js'), /const gutter = 16;/);
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

test('fitScale picks the largest whole number of device pixels per logical pixel, never below 1', () => {
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
  assert.equal(document.canvas.style.width, '896px', 'CSS size is device pixels over dpr (3.5 CSS px per logical px here)');
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

test('every tap reaches exactly one step on a 144 Hz display', () => {
  const { VL } = loadGame();
  const win = fakeWindow();
  const input = VL.createKeyboardInput(win, fakeDocument());
  const steps = [];
  let now = 0;
  const frames = [];
  const loop = VL.createLoop({
    poll: input.poll,
    update: (actions) => steps.push(actions.pressed.interact),
    draw: () => {},
    now: () => now,
    raf: (frame) => frames.push(frame),
  });
  loop.start();
  frames.shift()();
  // Most 6.9 ms frames run no step at all; a tap on such a frame must still land.
  let taps = 0;
  for (let i = 0; i < 40; i += 1) {
    now += 1000 / 144;
    if (i % 3 === 0) {
      win.dispatch('keydown', keyEvent('KeyS'));
      win.dispatch('keyup', keyEvent('KeyS'));
      taps += 1;
    }
    frames.shift()();
  }
  for (let i = 0; i < 3; i += 1) {
    now += 1000 / 144;
    frames.shift()();
  }
  assert.equal(steps.filter(Boolean).length, taps, 'one step per tap');
  assert.ok(steps.length < 43, 'fewer steps than frames');
});

test('app.update clamps dt', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  const app = playApp(VL);
  VL.place(app.game, { area: 'test', screen: '0,0', tx: 8, ty: 2 });
  const x0 = app.game.player.x;
  app.update(VL.actions({ held: ['right'] }), 5);
  assert.ok(app.game.player.x - x0 <= VL.TUNING.heroSpeed * VL.TUNING.maxDt + 1e-6);
  assert.ok(app.game.player.x > x0);
});

// ---------- boot ----------

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
  // Moving the window to a 2× monitor changes devicePixelRatio with no resize.
  assert.deepEqual(window.mediaQueries.map((q) => q.media), ['(resolution: 1dppx)']);
  window.devicePixelRatio = 2;
  window.mediaQueries.at(-1).change();
  assert.equal(document.canvas.dataset.scale, '9', 'refits in device pixels on a pixel-ratio change');
  assert.equal(document.canvas.style.width, `${(256 * 9) / 2}px`);
  assert.equal(window.mediaQueries.at(-1).media, '(resolution: 2dppx)', 'watches the new ratio next');
  assert.equal(window.frames.length, 1);
  window.frames.shift()();
  assert.ok(document.canvas.getContext().calls.drawImage >= 1, 'a frame presented the buffer');
  document.canvas.dispatch('click');
  assert.equal(document.canvas.focused, true);
});
