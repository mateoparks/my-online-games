// Run with: node games/jumping-dude/surfaces.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'surfaces.js'), 'utf8');
const context = vm.createContext({});
vm.runInContext(source, context);
const { beltUpdate, beltDraw } = context;
const step = 1 / 120;
const block = (sides, extra = {}) => ({
  x: 100, y: 100, w: 100, h: 100, belt: { speed: 120, sides }, ...extra
});
const player = (x, y, extra = {}) => ({
  x, y, w: 10, h: 20, vy: 0, onGround: false, ...extra
});
function run(p, walls, dt = step, count = 1) {
  const level = { player: p, standing: [], touched: new Set() };
  for (let i = 0; i < count; i++) beltUpdate(level, walls, dt, 800);
  return level;
}

for (const direction of [-1, 1]) {
  const floor = block({ top: direction });
  const p = player(145, 80, { onGround: true });
  const level = run(p, [floor], step, 10);
  assert.equal(p.x, 145 + direction * 10, 'floor carries in either direction');
  assert.equal(p.y, 80);
  assert.equal(level.standing[0], floor);
  run(p, [floor], step, 200);
  assert.equal(p.x, direction > 0 ? 190 : 100, 'floor stops at its end');

  const ceiling = block({ bottom: direction });
  const under = player(145, 200);
  run(under, [ceiling], step, 10);
  assert.equal(under.x, 145 + direction * 10, 'ceiling pushes horizontally');
  assert.equal(under.beltVx, direction * 120, 'continued contact does not accumulate momentum');
  run(under, [ceiling], step, 200);
  assert.equal(under.x, direction > 0 ? 190 : 100, 'ceiling stops at its end');

  for (const side of ['left', 'right']) {
    const wall = block({ [side]: direction });
    const beside = player(side === 'left' ? 90 : 200, 140);
    run(beside, [wall], step, 10);
    assert.equal(beside.y, 140 + direction * 10, `${side} wall pushes vertically`);
    assert.equal(beside.vy, direction * 120, 'continued wall contact does not accumulate momentum');
    run(beside, [wall], step, 200);
    assert.equal(beside.y, direction > 0 ? 180 : 100, 'wall stops at its end');
  }
}

// A brief contact imparts velocity once; leaving contact does not refresh it.
for (const direction of [-1, 1]) {
  const ceiling = block({ bottom: direction });
  const under = player(145, 200);
  run(under, [ceiling]);
  assert.equal(under.beltVx, direction * 120);
  under.y += 1;
  under.beltVx *= 0.5; // Representative engine-supplied decay.
  const startX = under.x;
  for (let i = 0; i < 10; i++) {
    under.vx = 0; // The engine replaces input velocity each tick.
    under.vx += under.beltVx || 0;
    under.x += under.vx * step;
    run(under, [ceiling]);
  }
  assert.equal(under.beltVx, direction * 60, 'no additional ceiling impulse');
  assert.equal(under.x, startX + direction * 5, 'ceiling momentum survives vx resets');

  for (const side of ['left', 'right']) {
    const wall = block({ [side]: direction });
    const beside = player(side === 'left' ? 90 : 200, 140);
    run(beside, [wall]);
    assert.equal(beside.vy, direction * 120);
    beside.x += side === 'left' ? -1 : 1;
    beside.vy *= 0.5;
    const startY = beside.y;
    for (let i = 0; i < 10; i++) {
      beside.y += beside.vy * step;
      run(beside, [wall]);
    }
    assert.equal(beside.vy, direction * 60, 'no additional wall impulse');
    assert.equal(beside.y, startY + direction * 5, 'wall momentum persists after contact');
  }
}
const floorOnly = player(145, 80, { onGround: true });
run(floorOnly, [block({ top: 1 })]);
assert.equal(floorOnly.vy, 0);
assert.equal(floorOnly.beltVx, undefined, 'floor transport does not impart momentum');

// Each side of the same block can have its own direction.
const around = block({ top: 1, right: 1, bottom: -1, left: -1 });
for (const [p, axis, expected] of [
  [player(140, 80, { onGround: true }), 'x', 141],
  [player(200, 140), 'y', 141],
  [player(140, 200), 'x', 139],
  [player(90, 140), 'y', 139]
]) {
  run(p, [around]);
  assert.equal(p[axis], expected);
}

// Never pull a player back onto an end when already partly past it.
const pastEnd = player(195, 80, { onGround: true });
run(pastEnd, [block({ top: 1 })]);
assert.equal(pastEnd.x, 195);
const narrow = block({ top: 1 }, { w: 4 });
const narrowPlayer = player(97, 80, { onGround: true });
run(narrowPlayer, [narrow], 1);
assert.equal(narrowPlayer.x, 99);

// Axis sweeps stop at intervening obstacles even for a very large step.
for (const direction of [-1, 1]) {
  const floor = block({ top: direction });
  const obstacle = { x: direction > 0 ? 170 : 120, y: 60, w: 10, h: 40 };
  const p = player(145, 80, { onGround: true });
  run(p, [floor, obstacle], 1);
  assert.equal(p.x, direction > 0 ? 160 : 130, 'horizontal sweep blocks walls');
  const wall = block({ left: direction });
  const barrier = { x: 70, y: direction > 0 ? 175 : 115, w: 30, h: 10 };
  const beside = player(90, 140, { vy: direction * 20 });
  run(beside, [wall, barrier], 1);
  assert.equal(beside.y, direction > 0 ? 155 : 125, 'vertical sweep blocks floors and ceilings');
  assert.equal(beside.vy, 0);
}
const edgeFloor = block({ top: 1 }, { x: 750 });
const atScreenEdge = player(785, 80, { onGround: true });
run(atScreenEdge, [edgeFloor], 1);
assert.equal(atScreenEdge.x, 790);

const supportingFloor = { x: 70, y: 160, w: 30, h: 20 };
const lifted = player(90, 140, { onGround: true });
const liftedLevel = run(lifted, [block({ left: -1 }), supportingFloor]);
assert.equal(lifted.y, 139);
assert.equal(lifted.onGround, false);
assert.equal(liftedLevel.standing.length, 0);
const lowerFloor = { x: 70, y: 165, w: 30, h: 20 };
const lowered = player(90, 140, { vy: 20 });
const loweredLevel = run(lowered, [block({ left: 1 }), lowerFloor], 1);
assert.equal(lowered.y, 145);
assert.equal(lowered.onGround, true);
assert.equal(lowered.vy, 0);
assert.equal(loweredLevel.standing[0], lowerFloor);

// One-way platforms block only downward crossings from above.
const oneWay = { x: 160, y: 60, w: 10, h: 100, oneWay: true };
const across = player(145, 80, { onGround: true });
run(across, [block({ top: 1 }), oneWay], 1);
assert.equal(across.x, 190, 'horizontal transport passes through one-way sides');
const overhead = { x: 70, y: 120, w: 30, h: 10, oneWay: true };
const upward = player(90, 140);
run(upward, [block({ left: -1 }), overhead], 1);
assert.equal(upward.y, 100, 'upward transport passes through one-way undersides');
const below = player(90, 140);
run(below, [block({ left: 1 }), overhead], 1);
assert.equal(below.y, 180, 'downward transport from below does not catch one-way platforms');
const landing = player(90, 140);
const landingLevel = run(landing, [block({ left: 1 }), { ...overhead, y: 175 }], 1);
assert.equal(landing.y, 155, 'downward transport from above lands on one-way platforms');
assert.equal(landing.vy, 0);
assert.equal(landingLevel.standing.length, 1);
for (const [sides, p] of [
  [{ left: -1 }, player(90, 140)],
  [{ bottom: 1 }, player(145, 200)]
]) {
  const before = { ...p };
  run(p, [block(sides, { oneWay: true })]);
  assert.deepEqual(p, before, 'one-way platforms cannot push from sides or underside');
}

// No effect after contact is lost, or from inactive solids/invalid time.
for (const p of [player(145, 79), player(89, 140), player(145, 201), player(145, 80)]) {
  const before = { ...p };
  const level = run(p, [around], step, 50);
  assert.deepEqual(p, before);
  assert.equal(level.standing.length, 0);
}
for (const property of ['gone', 'fake', 'waitsToAppear']) {
  const p = player(145, 80, { onGround: true });
  run(p, [block({ top: 1 }, { [property]: true })], step, 5);
  assert.equal(p.x, 145);
}
const p = player(145, 80, { onGround: true });
run(p, [around], NaN);
assert.equal(p.x, 145);
const smallSteps = player(145, 80, { onGround: true });
const largeSteps = player(145, 80, { onGround: true });
run(smallSteps, [around], step, 20);
run(largeSteps, [around], 2 * step, 10);
assert.equal(smallSteps.x, largeSteps.x);

// Drawing paints each selected edge and points each chevron in its direction.
const lines = [];
const rectangles = [];
const canvas = {
  save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, stroke() {},
  fillRect(...args) { rectangles.push(args); },
  moveTo(x, y) { lines.push(['move', x, y]); },
  lineTo(x, y) { lines.push(['line', x, y]); }
};
beltDraw(canvas, around, { sand: 'sand', ink: 'ink' });
assert.deepEqual(rectangles, [[100, 100, 100, 10], [190, 100, 10, 100],
  [100, 190, 100, 10], [100, 100, 10, 100]]);
assert.ok(lines[1][1] > lines[0][1], 'top arrow points right');
const rightArrow = lines[21];
assert.ok(lines[22][2] > rightArrow[2], 'right arrow points down');
const previous = rectangles.length;
beltDraw(canvas, { ...around, hidden: true }, { sand: 'sand', ink: 'ink' });
assert.equal(rectangles.length, previous);
const lineCount = lines.length;
beltDraw(canvas, narrow, { sand: 'sand', ink: 'ink' });
assert.ok(lines.length > lineCount, 'short edges still draw a direction');

// Exercise the documented hook with the real collision routine and real solids().
const element = {
  textContent: '', hidden: false, addEventListener() {}, focus() {}, blur() {},
  getContext: () => ({ measureText: text => ({ width: text.length * 13 }) })
};
const engine = vm.createContext({
  document: { getElementById: () => element, documentElement: {} },
  window: { addEventListener() {} }, location: { search: '' },
  localStorage: { getItem: () => null, setItem() {} }, URLSearchParams,
  performance: { now: () => 0 }, requestAnimationFrame() {}
});
for (const file of ['levels.js', 'surfaces.js', 'game.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), engine, { filename: file });
}
vm.runInContext(`
  level.things = [{ kind: 'solid', x: 100, y: 100, w: 100, h: 100,
    belt: { speed: 120, sides: { top: 1 } } }];
  Object.assign(level.player, { x: 120, y: 66, vy: 0, onGround: true });
  for (let i = 0; i < 10; i++) { updatePlayer(STEP); beltUpdate(level, solids(), STEP, W); }
  globalThis.result = { x: level.player.x, y: level.player.y, standing: level.standing.length };
`, engine);
assert.equal(engine.result.x, 130);
assert.equal(engine.result.y, 66);
assert.equal(engine.result.standing, 1);

// Exercise ceiling and wall impulses against the real player integrator.
const hookedEngine = vm.createContext({
  document: { getElementById: () => element, documentElement: {} },
  window: { addEventListener() {} }, location: { search: '' },
  localStorage: { getItem: () => null, setItem() {} }, URLSearchParams,
  performance: { now: () => 0 }, requestAnimationFrame() {}
});
vm.runInContext(fs.readFileSync(path.join(__dirname, 'levels.js'), 'utf8'), hookedEngine);
vm.runInContext(source, hookedEngine);
const gameSource = fs.readFileSync(path.join(__dirname, 'game.js'), 'utf8');
vm.runInContext(gameSource, hookedEngine);
vm.runInContext(`
  level.things = [{ kind: 'solid', x: 100, y: 100, w: 100, h: 100,
    belt: { speed: 120, sides: { bottom: 1 } } }];
  Object.assign(level.player, { x: 120, y: 200, vy: -120, onGround: false, beltVx: 0 });
  updatePlayer(STEP);
  beltUpdate(level, solids(), STEP, W);
  const afterTouch = level.player.x;
  updatePlayer(STEP);
  beltUpdate(level, solids(), STEP, W);
  const afterSeparation = level.player.x;
  updatePlayer(STEP);
  beltUpdate(level, solids(), STEP, W);
  globalThis.ceilingResult = { afterTouch, afterSeparation, x: level.player.x,
    y: level.player.y, impulse: level.player.beltVx };

  level.things = [{ kind: 'solid', x: 100, y: 100, w: 100, h: 100,
    belt: { speed: 120, sides: { left: -1 } } }];
  Object.assign(level.player, { x: 84, y: 130, vy: 0, onGround: false, beltVx: 0 });
  updatePlayer(STEP);
  beltUpdate(level, solids(), STEP, W);
  const afterWallTouch = level.player.y;
  level.player.x = 83;
  updatePlayer(STEP);
  beltUpdate(level, solids(), STEP, W);
  globalThis.wallResult = { afterWallTouch, y: level.player.y, vy: level.player.vy };
`, hookedEngine);
assert.equal(hookedEngine.ceilingResult.afterTouch, 121);
assert.equal(hookedEngine.ceilingResult.afterSeparation, 122);
assert.ok(hookedEngine.ceilingResult.x > 122);
assert.ok(hookedEngine.ceilingResult.y > 200, 'player has left the ceiling');
assert.ok(hookedEngine.ceilingResult.impulse > 0 && hookedEngine.ceilingResult.impulse < 120);
assert.ok(hookedEngine.wallResult.y < hookedEngine.wallResult.afterWallTouch);
assert.ok(hookedEngine.wallResult.vy < 0);

console.log('Moving surface tests passed.');
