// Node test for the Jumping Dude Game. Loads the game scripts into a
// node:vm context with a fake DOM, then checks every level two ways:
//   1. a naive player who just holds → dies or meets a locked door;
//   2. a bot that knows the traps can reach the real door.
// Run: node games/jumping-dude/game.test.js
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fakeElement(drawnText, strokes, paths) {
  return {
    textContent: '', hidden: true,
    focus() {}, blur() {}, addEventListener() {},
    getContext: () => new Proxy({}, { get: (_, name) => {
      if (name === 'measureText') return text => ({ width: text.length * 13 });
      if (name === 'fillText') return text => drawnText.push(text);
      if (name === 'stroke') return () => strokes.push(true);
      if (name === 'lineTo' || name === 'rotate') return (...args) => paths.push([name, ...args]);
      return () => {};
    } })
  };
}

function loadGame() {
  const elements = {};
  const store = {};
  const drawnText = [];
  const strokes = [];
  const paths = [];
  const context = {
    document: { getElementById: id => (elements[id] ??= fakeElement(drawnText, strokes, paths)), documentElement: {}, activeElement: null },
    window: { addEventListener() {} },
    location: { search: '' },
    localStorage: { getItem: key => store[key] ?? null, setItem: (key, value) => { store[key] = value; } },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    performance: { now: () => 0 },
    requestAnimationFrame() {},
    confirm: () => true,
    URLSearchParams
  };
  vm.createContext(context);
  for (const file of ['levels.js', 'surfaces.js', 'game.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), context, { filename: file });
  }
  vm.runInContext('globalThis.game = { get level() { return level; }, input, update, startLevel, draw, drawHud, drawFan, fanReaches, win, goNext, LEVELS, STEP };', context);
  return { game: context.game, elements, drawnText, strokes, paths };
}

const { game, elements } = loadGame();
const p = () => game.level.player;
const center = () => p().x + p().w / 2;

// ---- Bot moves: generators that yield one tick of intended input at a time.
// Directions are what the bot *means*; the driver flips them on reversed levels.

function* wait(seconds) {
  for (let t = 0; t < seconds / game.STEP; t++) yield {};
}

function* go(x) {
  const dir = x > center() ? 'right' : 'left';
  while (dir === 'right' ? center() < x : center() > x) yield { [dir]: true };
}

function* hold(dir, seconds) {
  for (let t = 0; t < seconds / game.STEP; t++) yield { [dir]: true };
}

// Jump (holding the direction) and keep going until we land again.
// `to` steers like a person aiming for a spot: toward it, then hands off.
function* jump(dir, { holdJump = 1, steer = dir, steerTime = Infinity, steerDelay = 0, to } = {}) {
  yield dir ? { [dir]: true } : {};
  yield dir ? { jump: true, [dir]: true } : { jump: true };
  let ticks = 0;
  while (!p().onGround || ticks < 3) {
    ticks++;
    const t = ticks * game.STEP;
    let steering = !!steer && t < steerTime ? steer : null;
    if (to !== undefined) steering = Math.abs(to - center()) > 3 ? (to > center() ? 'right' : 'left') : null;
    if (t <= steerDelay) steering = null;
    yield { jump: t < holdJump, [steering]: !!steering };
  }
}

function* jumpFrom(x, dir, options) {
  yield* go(x);
  yield* jump(dir, options);
}

function* waitFor(predicate, intent = {}) {
  let ticks = 0;
  while (!predicate()) {
    if (++ticks > 120 * 10) throw new Error('waitFor timed out');
    yield intent;
  }
}

function thing(predicate) {
  return game.level.things.find(predicate);
}

function* reachSecondBlock() {
  yield* jumpFrom(145, 'right', { to: 250 });
  yield* jumpFrom(260, 'right', { to: 400 });
}

function* rideLowPlatform() {
  yield* jumpFrom(135, 'right', { to: 245 });
  const lift = thing(t => t.sink);
  yield* waitFor(() => lift.y >= 335);
}

function* reachTowerThird() {
  yield* jumpFrom(185, null, { to: 185 });
  yield* go(185);
  yield* jump(null, { to: 153, steerDelay: 2 * game.STEP });
  yield* go(170);
  yield* jump(null, { to: 190, steerDelay: 2 * game.STEP });
}

function* reachTowerTop() {
  yield* reachTowerThird();
  yield* jump(null, { holdJump: 0.1, to: 190 });
}

function* descendTower() {
  yield* go(260);
  yield* waitFor(() => p().y >= 180);
  yield* go(244);
  yield* waitFor(() => p().onGround, { left: true });
  yield* go(300);
}

// `lag` (seconds) makes the bot notice reversed controls late, like a person.
function play(levelIndex, script, { maxSeconds = 40, lag = 0, onTick } = {}) {
  game.startLevel(levelIndex);
  const input = game.input;
  let wasJump = false;
  const steps = script();
  const flips = [];
  for (let tick = 0; tick < maxSeconds / game.STEP; tick++) {
    const next = steps.next();
    const intent = next.done ? {} : next.value;
    flips.push(game.level.reversed);
    const flip = flips[Math.max(0, flips.length - 1 - Math.round(lag / game.STEP))];
    input.left = !!(flip ? intent.right : intent.left);
    input.right = !!(flip ? intent.left : intent.right);
    if (intent.jump && !wasJump) input.jumpBuffer = 0.12;
    input.jumpHeld = !!intent.jump;
    wasJump = !!intent.jump;
    game.update(game.STEP);
    if (onTick) onTick(tick);
    if (game.level.mode !== 'play') break;
  }
  return {
    mode: game.level.mode,
    x: Math.round(p().x),
    y: Math.round(p().y),
    message: elements.message.textContent
  };
}

// ---- One solution per level

const SOLUTIONS = [
  // Trust Me: hop the tile, hop the spikes, tease the block, chase the door home,
  // leaping from the fallen block over the floor that drops away.
  function* () {
    yield* jumpFrom(160, 'right');
    yield* jumpFrom(330, 'right');
    yield* waitFor(() => thing(t => t.look === 'block').motion, { right: true });
    yield* hold('left', 0.3);
    yield* wait(0.4);
    yield* jumpFrom(560, 'right');
    yield* go(705);
    yield* wait(1);
    yield* jumpFrom(680, 'left', { to: 620 });
    yield* jumpFrom(608, 'left');
    yield* jumpFrom(470, 'left');
    yield* jumpFrom(260, 'left');
    yield* go(37);
    yield* wait(0.2);
  },
  // 2. Now You See It: land on the invisible block, then take the long jump over the spikes.
  function* () {
    yield* jumpFrom(225, 'right');
    yield* jumpFrom(352, 'right', { holdJump: 0.15 });
    yield* jumpFrom(480, 'right');
    yield* go(781);
    yield* wait(0.3);
  },
  // 3. Bridge Out: skip the fake platform.
  function* () {
    yield* jumpFrom(172, 'right');
    yield* jump('right');
    yield* jump('right');
    yield* go(755);
    yield* wait(0.2);
  },
  // 4. Boing: hop the first spring, ride the second, jump the ledge spikes.
  function* () {
    yield* jumpFrom(220, 'right');
    yield* go(430);
    yield* waitFor(() => !p().onGround, { right: true });
    yield* waitFor(() => p().onGround, { right: true });
    yield* jumpFrom(610, 'right');
    yield* go(755);
    yield* wait(0.2);
  },
  // 5. Press Your Luck: stop on button A, hop the block, press B and leap clear, walk through the gate.
  function* () {
    yield* go(160);
    yield* wait(0.8);
    yield* jumpFrom(178, 'right');
    yield* jumpFrom(306, 'right', { holdJump: 0.3 });
    yield* jump('right');
    yield* go(735);
    yield* wait(0.2);
  },
  // 6. Keep Away: chase the key upstairs, take the step back down, hop the door spikes.
  function* () {
    yield* go(370);
    yield* wait(1);
    yield* go(215);
    yield* jump('right', { steerTime: 0.25 });
    yield* go(250);
    yield* jump('left');
    yield* go(130);
    yield* wait(0.2);
    yield* go(160);
    yield* jump('right');
    yield* jump('right');
    yield* jumpFrom(560, 'right');
    yield* go(755);
    yield* wait(0.2);
  },
  // 7. Backwards Day: hop the pits and stop before the controls flip back.
  function* () {
    yield* jumpFrom(316, 'right');
    yield* jumpFrom(450, 'right');
    yield* go(650);
    yield* wait(0.1);
    yield* hold('right', 0.12);
    yield* wait(0.3);
    yield* go(755);
    yield* wait(0.2);
  },
  // 8. Rush Hour: tease the first crusher, time the piston, tease the double crusher twice.
  function* () {
    yield* go(258);
    yield* hold('right', 0.06);
    yield* hold('left', 0.1);
    yield* wait(1.3);
    yield* go(395);
    const piston = thing(t => t.look === 'crusher' && t.actions[0].on === 'start');
    yield* waitFor(() => piston.motion && piston.motion.phase === 'rest');
    yield* go(500);
    yield* hold('right', 0.1);
    yield* wait(1.2);
    yield* go(530);
    yield* hold('right', 0.06);
    yield* hold('left', 0.1);
    yield* wait(1.2);
    yield* go(735);
    yield* wait(0.2);
  },
  // 9. Fake Out: make the words fall, dodge "stairs.", climb the rest.
  function* () {
    yield* go(568);
    yield* hold('left', 0.4);
    yield* wait(1.4);
    yield* go(250);
    yield* jump('left', { to: 203 });
    yield* jump('right', { to: 282 });
    yield* jump('right', { to: 357 });
    yield* jump('right', { to: 434 });
    yield* jump('right', { to: 493 });
    yield* jump('right', { to: 600 });
    yield* go(635);
    yield* wait(0.2);
  },
  // Encore: hop the pit, ride the spring, tease the block, chase the door twice.
  function* () {
    yield* jumpFrom(225, 'right');
    yield* jumpFrom(480, 'right');
    yield* waitFor(() => thing(t => t.look === 'block').motion, { right: true });
    yield* hold('left', 0.3);
    yield* wait(0.4);
    yield* jumpFrom(605, 'right');
    yield* go(705);
    yield* wait(1);
    yield* jumpFrom(700, 'left');
    yield* go(560);
    yield* waitFor(() => !p().onGround, { left: true });
    yield* waitFor(() => p().onGround, { left: true });
    yield* wait(1.2);
    yield* jumpFrom(310, 'left');
    yield* go(37);
    yield* wait(0.2);
  },
  // 11. Out of Reach: find the invisible step, grab the key, then do the rest backwards.
  function* () {
    yield* go(130);
    yield* wait(1.2);
    yield* go(160);
    yield* jump('right', { steer: false });
    yield* go(110);
    yield* jump('right', { to: 190 });
    yield* jump('left', { to: 78 });
    yield* wait(0.2);
    yield* jump('right', { to: 260 });
    yield* go(316);
    yield* wait(0.2);
    yield* jump('right', { to: 440 });
    yield* wait(0.8);
    yield* go(545);
    yield* waitFor(() => !p().onGround, { right: true });
    yield* waitFor(() => p().onGround, { right: true });
    yield* go(735);
    yield* wait(0.2);
  },
  // 12. Moving On: ride, hop the crumbling step, ride, jump past the crumbling landing.
  function* () {
    const [p1, p2, p3] = game.level.things.filter(t => t.kind === 'solid' && t.h === 16);
    yield* go(100);
    yield* waitFor(() => p1.motion.phase === 'rest');
    yield* jump('right', { to: 150 });
    yield* waitFor(() => p1.motion.phase === 'hold');
    yield* waitFor(() => p().x + 8 > p1.x + 44, { right: true });
    yield* jump('right', { to: p2.x + 20 });
    yield* jump('right', { to: 530 });
    yield* waitFor(() => p3.motion.phase === 'back' && p3.motion.t > 0.8);
    yield* jump('right', { to: 760 });
    yield* go(767);
    yield* wait(0.2);
  },
  // 13. Run: hop the pit, tease the crusher, hop the spikes, tease the block, hop it.
  function* () {
    yield* jumpFrom(185, 'right');
    yield* go(318);
    yield* hold('left', 0.08);
    const crusher = thing(t => t.look === 'crusher');
    yield* waitFor(() => crusher.motion && crusher.motion.phase === 'back' && crusher.motion.t > 0.45);
    yield* jumpFrom(505, 'right', { to: 610 });
    yield* go(625);
    yield* wait(0.4);
    yield* jump('right');
    yield* go(765);
    yield* wait(0.2);
  },
  // 14. Flip Flop: follow the flips (with human reaction time), ignore the fake one, stop at the last.
  function* () {
    yield* jumpFrom(182, 'right');
    yield* jumpFrom(382, 'right');
    yield* jumpFrom(562, 'right');
    yield* go(720);
    yield* wait(0.3);
    yield* go(767);
    yield* wait(0.2);
  },
  // 15. The Long Way Back: hop the fake floor, tease the block, take the key, climb out.
  function* () {
    yield* jumpFrom(285, 'right');
    yield* go(520);
    yield* hold('left', 0.1);
    yield* wait(0.4);
    yield* jumpFrom(540, 'right');
    const ride = thing(t => t.kind === 'solid' && t.x === 480 && t.h === 16);
    yield* go(773);
    yield* go(750);
    yield* jump('left', { to: 655 });
    yield* waitFor(() => ride.motion && ride.motion.phase === 'rest');
    yield* jump('left', { to: 520 });
    yield* waitFor(() => ride.motion.phase === 'hold');
    yield* go(ride.x + 8);
    yield* jump('left', { to: 215 });
    yield* jump('left', { to: 55 });
    yield* go(55);
    yield* wait(0.2);
  },
  // 16. Double Trouble: every trap goes off twice (the pole three times).
  function* () {
    const pole = thing(t => t.kind === 'pole');
    // Jump high over the jumping spikes, and keep running when they chase.
    yield* jumpFrom(100, 'right');
    yield* go(300);
    // Let the pole fall toward you, hop to stand it back up, then clear it.
    yield* go(334);
    yield* go(322);
    yield* waitFor(() => pole.actions[0].state === 'done');
    yield* jump('right', { steer: false });
    yield* waitFor(() => pole.actions[1].state === 'done');
    yield* jumpFrom(350, 'right');
    // It falls the other way: keep going, then stop short of the block.
    yield* go(560);
    yield* go(596);
    yield* hold('left', 0.1);
    yield* wait(0.4);
    // Jump the block instead of riding it into the ceiling.
    yield* jumpFrom(605, 'right');
    yield* go(765);
    yield* wait(0.2);
  },
  // 17. Second Guess: clear the hidden spikes, bait the block, and cross the pit.
  function* () {
    yield* jumpFrom(150, 'right');
    yield* go(350);
    yield* hold('left', 0.2);
    yield* wait(0.4);
    yield* jumpFrom(365, 'right');
    yield* jumpFrom(480, 'right');
    yield* jumpFrom(610, 'right');
    yield* go(765);
    yield* wait(0.2);
  },
  // 18. Keys to Chaos: skip the first button, collect the key, and press the platform.
  function* () {
    yield* jumpFrom(120, 'right', { to: 250 });
    yield* go(310);
    yield* jump('left', { to: 250 });
    yield* go(250);
    yield* jump('left');
    yield* go(115);
    yield* wait(0.2);
    yield* jump('right', { to: 250 });
    yield* jumpFrom(270, 'right', { to: 385 });
    assert.ok(game.level.signals.has('b') && !game.level.signals.has('a'), 'the wrong buttons were pressed');
    yield* jump('right', { to: 500 });
    yield* wait(1);
    yield* go(632);
    yield* hold('left', 0.2);
    yield* wait(0.4);
    yield* jumpFrom(635, 'right');
    yield* go(765);
    yield* wait(0.2);
  },
  // 19. No Standing: climb the crumbling steps and catch the moving platform.
  function* () {
    yield* jumpFrom(135, 'right', { to: 200 });
    yield* jump('right', { to: 315 });
    yield* jump('right', { to: 435 });
    const ride = thing(t => t.kind === 'solid' && t.actions.some(a => a.on === 'start'));
    yield* jump('right', { to: 555 });
    yield* waitFor(() => ride.x > 585);
    yield* jump('right', { to: 710 });
    yield* go(765);
    yield* wait(0.2);
  },
  // 20. Rush and Crush: bait the crushers and hop the final spikes.
  function* () {
    yield* go(218);
    yield* hold('right', 0.06);
    yield* hold('left', 0.1);
    yield* wait(1.3);
    yield* go(365);
    const piston = thing(t => t.look === 'crusher' && t.actions[0].on === 'start');
    yield* waitFor(() => piston.motion && piston.motion.phase === 'back');
    yield* waitFor(() => piston.motion && piston.motion.phase === 'rest');
    yield* go(480);
    yield* hold('right', 0.06);
    yield* wait(1.2);
    yield* go(510);
    yield* hold('right', 0.06);
    yield* hold('left', 0.1);
    yield* wait(1.2);
    yield* jumpFrom(575, 'right');
    yield* go(765);
    yield* wait(0.2);
  },
  // 21. No Time to Think: stay ahead of the wall through the trap sequence.
  function* () {
    yield* jumpFrom(185, 'right');
    yield* jumpFrom(320, 'right');
    yield* go(445);
    yield* hold('left', 0.12);
    yield* wait(0.3);
    yield* jumpFrom(455, 'right');
    yield* jumpFrom(550, 'right');
    yield* go(765);
    yield* wait(0.2);
  },
  // 22. Low Expectations: short jumps under the ceiling spikes.
  function* () {
    yield* jumpFrom(170, 'right', { holdJump: 0.05 });
    yield* jumpFrom(380, 'right', { holdJump: 0.05 });
    yield* go(765);
    yield* wait(0.2);
  },
  // 23. Round Trip: follow the blocks and catch the returning one.
  function* () {
    yield* reachSecondBlock();
    const moving = thing(t => t.look === 'block' && t.actions.some(a => a.semicircle));
    yield* waitFor(() => moving.motion && moving.motion.phase === 'hold');
    yield* go(450);
    yield* waitFor(() => p().onGround && p().y + p().h > 200, { right: true });
    assert.ok(game.level.standing.includes(moving), 'did not land on the returning block');
    assert.strictEqual(moving.motion.phase, 'back');
    yield* jump('right', { to: 632 });
    yield* jump('right', { to: 710 });
    yield* go(755);
    yield* wait(0.2);
  },
  // 24. Late and Fragile: jump early for the delayed takeoff.
  function* () {
    yield* go(210);
    yield { right: true, jump: true };
    yield* waitFor(() => !p().onGround, { right: true, jump: true });
    yield* waitFor(() => p().onGround, { right: true, jump: true });
    yield* go(400);
    yield* jump('right', { steer: false });
    yield* wait(0.5);
    yield* jump('right');
    yield* jumpFrom(550, 'right');
    yield* go(765);
    yield* wait(0.2);
  },
  // 25. Stay a While: wait for the sticky platform, then cross the sinking one.
  function* () {
    yield* jumpFrom(120, 'right', { to: 210 });
    yield* wait(0.8);
    yield* jump('right', { to: 340 });
    yield* jump('right', { to: 470 });
    yield* jump('right', { to: 580 });
    yield* jump('right', { to: 700 });
    yield* go(765);
    yield* wait(0.2);
  },
  // 26. Copy and Gust: use the mimicking platform to cross the wind.
  function* () {
    yield* jumpFrom(125, 'right', { to: 255 });
    yield* go(315);
    yield* jump('right', { to: 430 });
    yield* jump('right', { to: 565 });
    yield* jump('right', { to: 670 });
    yield* jumpFrom(680, 'right');
    yield* go(765);
    yield* wait(0.2);
  },
  // 27. Fine Print: use the one-way platforms after the checkpoint.
  function* () {
    yield* go(145);
    yield* jump('right', { to: 205 });
    yield* jump('right', { to: 320 });
    yield* jump('right', { to: 445 });
    yield* jump('right', { to: 570 });
    yield* jump('right', { to: 625 });
    yield* go(662);
    yield* hold('left', 0.15);
    yield* wait(0.5);
    yield* jumpFrom(670, 'right');
    yield* go(765);
    yield* wait(0.2);
  },
  // 28. Key Exchange: climb back to the fake key, then find the real one.
  function* () {
    yield* jumpFrom(175, 'right', { to: 290 });
    yield* go(295);
    yield* jump('left', { to: 195 });
    yield* jump('left', { to: 60 });
    yield* go(60);
    yield* go(125);
    yield* waitFor(() => p().onGround);
    yield* jumpFrom(175, 'right');
    yield* go(340);
    yield* waitFor(() => p().onGround);
    yield* jumpFrom(420, 'right');
    yield* go(552);
    yield* hold('left', 0.15);
    yield* wait(0.5);
    yield* jumpFrom(560, 'right');
    yield* go(765);
    yield* wait(0.2);
  },
  // 29. Belt It Out: ride the floor belt and avoid the overhead belt.
  function* () {
    yield* jumpFrom(315, 'right', { to: 410 });
    yield* jump('right', { to: 500 });
    yield* jumpFrom(605, 'right');
    yield* go(765);
    yield* wait(0.2);
  },
  // 30. Under Pressure: ride down, then make a low jump under the spikes.
  function* () {
    yield* rideLowPlatform();
    yield* jumpFrom(305, 'right', { holdJump: 0.02, to: 365 });
    yield* jumpFrom(500, 'right');
    yield* go(765);
    yield* wait(0.2);
  },
  // 31. Balancing Act: work both sinking platforms down.
  function* () {
    yield* jumpFrom(120, 'right', { to: 180 });
    const gate = thing(t => t.look === 'gate');
    const right = thing(t => t.sink && t.sink.id === 'right');
    const low = () => right.y >= right.baseY + right.sink.depth - right.sink.tolerance;
    for (let i = 0; i < 20; i++) {
      yield* wait(0.35);
      yield* jump('right', { to: 290 });
      yield* wait(0.35);
      if (low() && gate.actions[0].state !== 'idle') break;
      yield* jump('left', { to: 180 });
    }
    assert.notStrictEqual(gate.actions[0].state, 'idle', 'first platform did not open the gate');
    assert.ok(low(), 'second platform was not lowered');
    yield* jump('right', { to: 430 });
    yield* jumpFrom(450, 'right');
    yield* go(765);
    yield* wait(0.2);
  },
  // 32. Blown Away: use the gust and land on the two narrow safe spots.
  function* () {
    yield* jumpFrom(145, 'right', { to: 350 });
    yield* jump('left', { to: 500 });
    yield* jumpFrom(520, 'right', { to: 645 });
    yield* jump('right', { to: 750 });
    yield* go(765);
    yield* wait(0.2);
  },
  // 33. Up and Down: climb, drop between the spikes, and tap for the key.
  function* () {
    yield* reachTowerTop();
    yield* descendTower();
    yield* jump(null, { holdJump: 0.02, to: 300 });
    yield* go(765);
    yield* wait(0.2);
  }
];

// Levels 1 and 10 trade places; keep their walkthroughs attached.
[SOLUTIONS[0], SOLUTIONS[9]] = [SOLUTIONS[9], SOLUTIONS[0]];

// How slow the bot's reactions are on each level, in seconds.
const LAG = { 13: 0.15, 17: 0.1, 20: 0.1 };

if (require.main !== module) {
  module.exports = { game, play, SOLUTIONS, LAG, p, thing };
  return;
}

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    failures++;
    console.log(`not ok - ${name}\n  ${error.message}`);
  }
}

check('level 1 and level 10 are swapped', () => {
  assert.strictEqual(game.LEVELS[0].name, 'Encore');
  assert.strictEqual(game.LEVELS[9].name, 'Trust Me');
});

check('every level has a solution', () => {
  assert.strictEqual(game.LEVELS.length, 33);
  assert.strictEqual(SOLUTIONS.length, game.LEVELS.length);
});

check('level counts and completion screens reflect every level', () => {
  const { game: testGame, elements: testElements, drawnText } = loadGame();
  assert.strictEqual(Number(testElements['level-count'].textContent), testGame.LEVELS.length);
  for (const index of [0, 10, 15, testGame.LEVELS.length - 1]) {
    testGame.startLevel(index);
    drawnText.length = 0;
    testGame.drawHud({ sky: '', muted: '', ink: '' });
    assert.ok(drawnText.includes(`LEVEL ${index + 1} / ${testGame.LEVELS.length} · ${testGame.LEVELS[index].name.toUpperCase()}`));
    testGame.win();
    assert.strictEqual(testElements['win-title'].textContent, index === testGame.LEVELS.length - 1
      ? `All ${testGame.LEVELS.length} levels cleared` : `Level ${index + 1} cleared`);
    assert.strictEqual(testElements.next.textContent, index === testGame.LEVELS.length - 1
      ? 'Play again from level 1' : 'Next level →');
    if (index === 15) {
      testGame.goNext();
      assert.strictEqual(testGame.level.index, 16);
    }
  }
});

check('level 22: a full jump hits the ceiling while a short jump clears the spikes', () => {
  const result = play(21, function* () {
    yield* jumpFrom(170, 'right');
  });
  assert.strictEqual(result.mode, 'dead', JSON.stringify(result));
  const ceiling = thing(t => t.kind === 'spikes' && t.dir === 'down');
  assert.ok(p().x + p().w > ceiling.x && p().x < ceiling.x + ceiling.w &&
    p().y < ceiling.y + ceiling.h && p().y + p().h > ceiling.y, 'the full jump did not hit the ceiling');
});

check('level 18: either button opens the gate and the other closes it', () => {
  for (const [first, second] of [['a', 'b'], ['b', 'a']]) {
    for (const delay of [0.12, 1.1]) {
      const { game: testGame } = loadGame();
      testGame.startLevel(17);
      const player = testGame.level.player;
      const gate = testGame.level.things.find(t => t.look === 'gate');
      const press = button => {
        Object.assign(player, { x: button === 'a' ? 155 : 375, y: button === 'a' ? 306 : 216, vy: 0, onGround: true });
        testGame.update(testGame.STEP);
        assert.ok(testGame.level.signals.has(button), `${button} was not pressed`);
        Object.assign(player, { x: 60, y: 306, vy: 0, onGround: true });
      };
      const advance = seconds => {
        for (let t = 0; t < seconds / testGame.STEP; t++) testGame.update(testGame.STEP);
      };
      press(first);
      advance(delay);
      assert.ok(gate.y < 0, `${first} did not open the gate`);
      press(first);
      assert.ok(!testGame.level.signals.has('gate-close'), 'the same button closed the gate');
      press(second);
      assert.strictEqual(gate.motion.phase, 'back', `${second} did not close the gate`);
      advance(1.1);
      assert.ok(Math.abs(gate.y) < 0.01, 'the gate did not return to its closed position');
    }
  }
});

check('delayed jumps and fragile ceilings react to player movement', () => {
  const { game: testGame } = loadGame();
  testGame.startLevel(23);
  const player = testGame.level.player;
  Object.assign(player, { x: 150, y: 306, vy: 0, onGround: true });
  testGame.update(testGame.STEP);
  testGame.input.jumpBuffer = 0.12;
  testGame.input.jumpHeld = true;
  testGame.update(testGame.STEP);
  assert.ok(player.onGround && player.queuedJump !== null, 'jump should be queued');
  for (let i = 0; i < 31; i++) testGame.update(testGame.STEP);
  assert.ok(!player.onGround && player.vy < 0, 'queued jump never launched');
  const block = testGame.level.things.find(t => t.look === 'block');
  Object.assign(player, { x: 465, y: 210, vy: 0, onGround: false });
  testGame.update(testGame.STEP);
  assert.strictEqual(block.motion.type, 'fall', 'high jump did not dislodge the ceiling');
});

check('sticky platforms hold the player and sinking platforms return when empty', () => {
  const { game: testGame } = loadGame();
  testGame.startLevel(24);
  const player = testGame.level.player;
  const sticky = testGame.level.things.find(t => t.sticky);
  const sink = testGame.level.things.find(t => t.sink);
  Object.assign(player, { x: sticky.x + 10, y: sticky.y - player.h, vy: 0, onGround: true });
  testGame.update(testGame.STEP);
  const x = player.x;
  testGame.input.right = true;
  for (let i = 0; i < 20; i++) testGame.update(testGame.STEP);
  assert.strictEqual(player.x, x, 'sticky surface did not hold the player');
  testGame.input.right = false;
  Object.assign(player, { x: sink.x + 10, y: sink.y - player.h, vy: 0, onGround: true, stickyTimer: 0 });
  for (let i = 0; i < 30; i++) testGame.update(testGame.STEP);
  assert.ok(sink.y > sink.baseY && Math.abs(player.y + player.h - sink.y) < 0.01, 'platform did not sink with player');
  Object.assign(player, { x: 50, y: 306, vy: 0, onGround: true });
  for (let i = 0; i < 40; i++) testGame.update(testGame.STEP);
  assert.ok(Math.abs(sink.y - sink.baseY) < 0.01, 'empty platform did not rise');
});

check('fans are visible and spin, pushing until blocked by solid geometry', () => {
  const { game: testGame, strokes, paths } = loadGame();
  testGame.startLevel(25);
  const player = testGame.level.player;
  const mimic = testGame.level.things.find(t => t.mimic);
  const fan = testGame.level.things.find(t => t.kind === 'fan');
  testGame.input.right = true;
  for (let i = 0; i < 10; i++) testGame.update(testGame.STEP);
  assert.ok(mimic.x > mimic.baseX, 'mimic did not follow');
  testGame.input.right = false;
  testGame.level.time = 1.6;
  testGame.drawFan(fan, { muted: '', sand: '', ink: '', ground: '' });
  assert.ok(strokes.length > 0, 'inactive fan was not visible');
  assert.ok(!paths.some(path => path[0] === 'lineTo'), 'airflow lines were drawn');
  const inactiveAngle = paths.find(path => path[0] === 'rotate')[1];
  paths.length = 0;
  testGame.level.time = 2.2;
  testGame.drawFan(fan, { muted: '', sand: '', ink: '', ground: '' });
  assert.notStrictEqual(paths.find(path => path[0] === 'rotate')[1], inactiveAngle, 'fan blades did not spin');
  testGame.level.things = [fan, mimic];
  Object.assign(player, { x: 350, y: 300, vy: 0, onGround: false });
  testGame.level.time = 1.6;
  testGame.update(testGame.STEP);
  assert.strictEqual(player.x, 350, 'inactive gust pushed the player');
  Object.assign(player, { x: 350, y: 300, vy: 0, onGround: false });
  testGame.level.time = 0.1;
  testGame.update(testGame.STEP);
  assert.ok(Math.abs(player.x - (350 + 110 * testGame.STEP)) < 0.01, 'gust strength was not doubled');
  Object.assign(mimic, { x: 200, y: 290, w: 40, h: 60 });
  Object.assign(player, { x: 350, y: 300, vy: 0, onGround: false });
  testGame.update(testGame.STEP);
  assert.strictEqual(player.x, 350, 'solid did not shield the player in the game');
  mimic.y = 200;
  testGame.update(testGame.STEP);
  assert.ok(player.x > 350, 'moving the blocker did not restore airflow');
  const wall = { x: 200, y: 290, w: 40, h: 60 };
  assert.ok(!testGame.fanReaches(fan, player, [wall]), 'wall did not block the fan');
  wall.y = 200;
  assert.ok(testGame.fanReaches(fan, player, [wall]), 'wall blocked air above it');
  wall.y = 290;
  wall.x = 400;
  assert.ok(testGame.fanReaches(fan, player, [wall]), 'wall behind the player blocked air');
  const reverseFan = { x: 800, y: fan.y, speed: -110 };
  assert.ok(!testGame.fanReaches(reverseFan, player, [wall]), 'wall did not block a leftward fan');
  wall.x = 200;
  assert.ok(testGame.fanReaches(reverseFan, player, [wall]), 'leftward fan blocked on the wrong side');
  Object.assign(player, { x: 50, y: 306, vy: 0, onGround: true });
  testGame.update(testGame.STEP);
  assert.ok(player.x > 50, 'fan did not push a grounded player');
  const probe = { x: 350, y: fan.y - 44 - 34, w: 16, h: 34 };
  assert.ok(!testGame.fanReaches(fan, probe, []), 'fan pushed above its visible height');
  probe.y++;
  assert.ok(testGame.fanReaches(fan, probe, []), 'fan missed a player entering its top edge');
  probe.y = fan.y - 4;
  assert.ok(!testGame.fanReaches(fan, probe, []), 'fan pushed below its visible height');
  probe.y--;
  assert.ok(testGame.fanReaches(fan, probe, []), 'fan missed a player entering its bottom edge');
  Object.assign(player, { x: 350, y: 100, vy: 0, onGround: false });
  testGame.update(testGame.STEP);
  assert.strictEqual(player.x, 350, 'player above the fan was pushed in the game');
});

check('decoy checkpoint and fake key reveal their traps without granting progress', () => {
  const { game: testGame } = loadGame();
  testGame.startLevel(26);
  let player = testGame.level.player;
  const hiddenSpikes = testGame.level.things.find(t => t.kind === 'spikes');
  Object.assign(player, { x: 130, y: 306, vy: 0, onGround: true });
  testGame.update(testGame.STEP);
  assert.ok(testGame.level.signals.has('checkpoint') && !hiddenSpikes.hidden);
  testGame.startLevel(26);
  assert.strictEqual(testGame.level.player.x, testGame.LEVELS[26].spawn, 'fake checkpoint changed the spawn');
  testGame.startLevel(27);
  player = testGame.level.player;
  const realKey = testGame.level.things.find(t => t.kind === 'key' && !t.fake);
  assert.ok(realKey.hidden);
  Object.assign(player, { x: 55, y: 96, vy: 0, onGround: true });
  testGame.update(testGame.STEP);
  assert.ok(!testGame.level.hasKey && !realKey.hidden, 'fake key granted access or failed to reveal the real key');
  Object.assign(player, { x: 335, y: 306, vy: 0, onGround: true });
  testGame.update(testGame.STEP);
  assert.ok(testGame.level.hasKey, 'real key was not collectible');
});

check('level 27: skipping the checkpoint drops the floor and covers the far end in spikes', () => {
  let checkpoint = false;
  let floorDropped = false;
  let farSpikes = false;
  play(26, function* () {
    yield* jumpFrom(75, 'right', { to: 205 });
    yield* wait(0.5);
  }, { onTick() {
    checkpoint ||= game.level.signals.has('checkpoint');
    const floor = thing(t => t.kind === 'solid' && t.x === 190 && t.w === 420);
    const spikes = thing(t => t.kind === 'spikes' && t.x === 610);
    floorDropped ||= !!floor.motion || floor.gone;
    farSpikes ||= !spikes.hidden;
  } });
  assert.ok(!checkpoint, 'the checkpoint was not actually skipped');
  assert.ok(floorDropped && farSpikes, 'skipping the flag did not trigger both hazards');
  Object.assign(p(), { x: 650, y: 306, vy: 0, onGround: true });
  game.input.left = false;
  game.input.right = false;
  game.update(game.STEP);
  assert.strictEqual(game.level.mode, 'dead', 'far-end spikes did not punish the skipped checkpoint');

  const result = play(26, SOLUTIONS[26]);
  assert.strictEqual(result.mode, 'won', JSON.stringify(result));
  assert.ok(game.level.signals.has('checkpoint'), 'winning route skipped the checkpoint');
  assert.ok(thing(t => t.kind === 'spikes' && t.x === 610).hidden, 'checkpoint route triggered far-end spikes');
  assert.ok(!thing(t => t.kind === 'solid' && t.x === 190 && t.w === 420).gone, 'checkpoint route dropped the floor');
});

check('level 28: the fake key requires the elevated detour before the real key appears', () => {
  let lower = false;
  let middle = false;
  let upper = false;
  let fake = false;
  let real = false;
  const result = play(27, SOLUTIONS[27], { onTick() {
    lower ||= game.level.standing.some(t => t.y === 270);
    middle ||= game.level.standing.some(t => t.y === 200);
    upper ||= game.level.standing.some(t => t.y === 130);
    if (game.level.signals.has('fake-key')) {
      assert.ok(lower && middle && upper, 'fake key was reached without climbing the detour');
      fake = true;
    }
    if (game.level.hasKey) {
      assert.ok(fake, 'real key was collected before the decoy');
      real = true;
    }
  } });
  assert.strictEqual(result.mode, 'won', JSON.stringify(result));
  assert.ok(lower && middle && upper && fake && real, 'the full key detour was not completed');
  assert.ok(game.level.things.filter(t => t.kind === 'spikes' && (t.x === 35 || t.x === 215))
    .every(t => !t.hidden), 'detour spikes did not reveal themselves');
});

check('level 28: overshooting the fake key hits the hidden spikes', () => {
  const result = play(27, function* () {
    yield* jumpFrom(175, 'right', { to: 290 });
    yield* go(295);
    yield* jump('left', { to: 195 });
    yield* jump('left', { to: 60 });
    yield* go(42);
  });
  assert.strictEqual(result.mode, 'dead', JSON.stringify(result));
  assert.ok(game.level.signals.has('fake-key'), 'did not reach the fake key first');
});

check('one-way blinking platforms allow upward passage and disappear on schedule', () => {
  const { game: testGame } = loadGame();
  testGame.startLevel(26);
  const player = testGame.level.player;
  const platform = testGame.level.things.find(t => t.blink);
  testGame.level.things = [platform];
  Object.assign(player, { x: platform.x + 10, y: platform.y + platform.h + 1, vy: -500, onGround: false });
  for (let i = 0; i < 20; i++) testGame.update(testGame.STEP);
  assert.ok(player.y < platform.y, 'one-way platform blocked upward movement');
  testGame.level.time = 2.2;
  Object.assign(player, { x: platform.x + 10, y: platform.y - player.h - 1, vy: 200, onGround: false });
  testGame.update(testGame.STEP);
  assert.ok(!player.onGround && player.y + player.h > platform.y, 'inactive platform caught the player');
  testGame.level.time = 0;
  Object.assign(player, { x: platform.x + 10, y: platform.y - player.h - 1, vy: 200, onGround: false });
  testGame.update(testGame.STEP);
  assert.ok(player.onGround, 'active platform did not catch the player');
});

check('level 29: floor, wall, and ceiling belts affect the player', () => {
  const { game: testGame } = loadGame();
  testGame.startLevel(28);
  const player = testGame.level.player;
  Object.assign(player, { x: 180, y: 306, vy: 0, onGround: true });
  for (let i = 0; i < 180; i++) testGame.update(testGame.STEP);
  assert.ok(Math.abs(player.x - 324) < 0.01, 'floor belt did not carry to its end');

  Object.assign(player, { x: 474, y: 250, vy: 0, onGround: false });
  testGame.update(testGame.STEP);
  assert.ok(player.vy < 0, 'wall belt did not push upward');

  Object.assign(player, { x: 520, y: 270, vy: -200, onGround: false, beltVx: 0 });
  testGame.update(testGame.STEP);
  const afterTouch = player.x;
  assert.ok(player.beltVx < 0, 'ceiling belt did not push left');
  testGame.update(testGame.STEP);
  assert.ok(player.x < afterTouch, 'ceiling push did not continue after contact');
});

check('new level scenes render with their mechanics', () => {
  const { game: testGame, drawnText } = loadGame();
  for (let i = 23; i < testGame.LEVELS.length; i++) {
    testGame.startLevel(i);
    testGame.draw();
  }
  for (const mark of ['D', 'S']) {
    assert.ok(drawnText.includes(mark), `missing surface marking ${mark}`);
  }
  for (const mark of ['W', 'M', '↑', 'B', '↑B']) {
    assert.ok(!drawnText.includes(mark), `unnecessary surface marking ${mark}`);
  }
});

check('level 30: a full jump from the lowered platform hits the ceiling', () => {
  const result = play(29, function* () {
    yield* rideLowPlatform();
    yield* jumpFrom(305, 'right');
  });
  assert.strictEqual(result.mode, 'dead', JSON.stringify(result));
  assert.ok(p().y < 270, 'the full jump did not reach the ceiling spikes');
});

check('level 31: the first platform opens the gate, but cannot reach the exit alone', () => {
  let gateOpenedWithSecondHigh = false;
  let reachedExit = false;
  const result = play(30, function* () {
    yield* jumpFrom(120, 'right', { to: 180 });
    const gate = thing(t => t.look === 'gate');
    yield* waitFor(() => gate.actions[0].state !== 'idle');
    yield* go(220);
    yield* hold('right', 8 * game.STEP);
    yield* jump('right', { to: 430 });
  }, { onTick() {
    const gate = thing(t => t.look === 'gate');
    const right = thing(t => t.sink && t.sink.id === 'right');
    if (gate.actions[0].state !== 'idle' && right.y === right.baseY) gateOpenedWithSecondHigh = true;
    if (game.level.standing.some(t => t.x === 395)) reachedExit = true;
  } });
  assert.ok(gateOpenedWithSecondHigh, 'gate did not open with only the first platform down');
  assert.strictEqual(result.mode, 'dead', JSON.stringify(result));
  assert.ok(!reachedExit, 'jump from the first platform reached the exit');
});

check('level 31: alternating platforms lowers the second enough to reach the exit', () => {
  let crossings = 0;
  let previous = null;
  let openedFirst = false;
  const result = play(30, SOLUTIONS[30], { onTick() {
    const pads = game.level.things.filter(t => t.sink && t.sink.id);
    const current = pads.find(t => game.level.standing.includes(t));
    if (current && current !== previous) {
      if (previous) crossings++;
      previous = current;
    }
    const gate = thing(t => t.look === 'gate');
    if (gate.actions[0].state !== 'idle' && !openedFirst) {
      const left = pads.find(t => t.sink.id === 'left');
      openedFirst = left.y >= left.baseY + left.sink.depth - left.sink.tolerance;
    }
  } });
  assert.strictEqual(result.mode, 'won', JSON.stringify(result));
  assert.ok(crossings >= 4, 'did not alternate between the platforms');
  assert.ok(openedFirst, 'gate opened before the first platform was down');
});

check('level 32: the gust, narrow lip, and collapsing landing all matter', () => {
  let gust = false;
  let lip = false;
  let collapse = false;
  let safeStrip = false;
  const result = play(31, SOLUTIONS[31], { onTick() {
    if (!p().onGround && p().vx > 210) gust = true;
    if (game.level.standing.some(t => t.x === 340 && t.w === 26)) lip = true;
    if (game.level.things.some(t => t.x === 570 && t.motion && t.motion.type === 'fall')) collapse = true;
    if (game.level.standing.some(t => t.x === 630 && t.w === 30)) safeStrip = true;
  } });
  assert.strictEqual(result.mode, 'won', JSON.stringify(result));
  assert.ok(gust && lip && collapse && safeStrip, 'the intended precision route was not used');
});

check('level 33: climb, reveal the spikes, relocate the key, and return for it', () => {
  let relocated = false;
  const tiers = new Set();
  let upperFallSpikes = false;
  let lowerFallSpikes = false;
  let returned = false;
  const result = play(32, SOLUTIONS[32], { onTick() {
    if (game.level.signals.has('first-platform')) {
      const keys = game.level.things.filter(t => t.kind === 'key');
      relocated ||= keys.find(t => t.x === 160).gone && !keys.find(t => t.x === 290).hidden &&
        !thing(t => t.kind === 'spikes' && t.x === 136 && t.y === 250).hidden;
    }
    for (const platform of game.level.standing.filter(t => t.oneWay)) tiers.add(platform.y);
    if (!thing(t => t.kind === 'spikes' && t.x === 236 && t.y === 170).hidden) upperFallSpikes = true;
    if (!thing(t => t.kind === 'spikes' && t.x === 257).hidden) lowerFallSpikes = true;
    if (p().onGround && p().x >= 234 && p().x < 272 && !game.level.hasKey) returned = true;
  } });
  assert.strictEqual(result.mode, 'won', JSON.stringify(result));
  assert.ok(relocated && [270, 200, 130, 60].every(y => tiers.has(y)) &&
    upperFallSpikes && lowerFallSpikes && returned,
    'the route skipped part of the tower or key detour');
});

check('level 33: open ground reaches the locked door without bypassing the tower', () => {
  const result = play(32, function* () { yield* hold('right', 5); }, { maxSeconds: 5 });
  assert.strictEqual(result.mode, 'play', JSON.stringify(result));
  assert.ok(game.level.lockedNoted && !game.level.hasKey, 'door was not reached and locked');
  assert.ok(p().x > 750, 'the ground route was blocked');
  const { game: testGame } = loadGame();
  testGame.startLevel(32);
  testGame.level.signals.add('first-platform');
  Object.assign(testGame.level.player, { x: 290, y: 306, vy: 0, onGround: true });
  testGame.update(testGame.STEP);
  testGame.input.jumpBuffer = 0.12;
  testGame.input.jumpHeld = true;
  for (let i = 0; i < 80; i++) testGame.update(testGame.STEP);
  assert.ok(!testGame.level.hasKey, 'the relocated key was reachable before climbing the tower');
});

check('level 33: full jumps hit the spikes above the top platform and the key', () => {
  let result = play(32, function* () {
    yield* reachTowerThird();
    yield* jump(null, { to: 190 });
  });
  assert.strictEqual(result.mode, 'dead', JSON.stringify(result));
  assert.ok(game.level.signals.has('top-platform'), 'did not reach the top platform');
  result = play(32, function* () {
    yield* reachTowerTop();
    yield* descendTower();
    yield* jump(null, { to: 300 });
  });
  assert.strictEqual(result.mode, 'dead', JSON.stringify(result));
  assert.ok(game.level.hasKey, 'did not jump for the relocated key');
});

check('level 33: falling straight down hits one of the opposing spikes', () => {
  for (const x of [249, 260]) {
    const result = play(32, function* () {
      yield* reachTowerTop();
      yield* go(240);
      yield* go(x);
      yield* wait(1);
    });
    assert.strictEqual(result.mode, 'dead', `x=${x}: ${JSON.stringify(result)}`);
    assert.ok(p().x >= 236 && p().x < 272, 'did not reach the falling corridor');
  }
});

check('level 23: jumping from the second block triggers its return but misses the exit', () => {
  let returning = false;
  const result = play(22, function* () {
    yield* reachSecondBlock();
    const moving = thing(t => t.look === 'block' && t.actions.some(a => a.semicircle));
    yield* waitFor(() => moving.motion && moving.motion.phase === 'hold');
    yield* jump('right', { to: 650 });
  }, { onTick() {
    const moving = thing(t => t.look === 'block' && t.actions.some(a => a.semicircle));
    if (moving.motion && moving.motion.phase === 'back') returning = true;
  } });
  assert.ok(returning, 'the block did not return after jumping');
  assert.strictEqual(result.mode, 'dead', JSON.stringify(result));
});

check('level 23: leaving early reverses the block before it reaches the far side', () => {
  let reversedEarly = false;
  play(22, function* () {
    yield* reachSecondBlock();
    const moving = thing(t => t.look === 'block' && t.actions.some(a => a.semicircle));
    yield* waitFor(() => moving.motion && moving.motion.phase === 'go' && moving.motion.t >= 0.3);
    yield* jump('right', { to: 650 });
  }, { onTick() {
    const moving = thing(t => t.look === 'block' && t.actions.some(a => a.semicircle));
    if (moving.motion && moving.motion.phase === 'back' && moving.x < 500) reversedEarly = true;
  } });
  assert.ok(reversedEarly, 'the block did not reverse while still moving out');
});

check('level 23: landing spikes appear nearby and punish walking past the edge', () => {
  let reachedLedge = false;
  const result = play(22, function* () {
    const trap = thing(t => t.kind === 'spikes');
    assert.ok(trap.hidden, 'spikes should start hidden');
    yield* reachSecondBlock();
    const moving = thing(t => t.look === 'block' && t.actions.some(a => a.semicircle));
    yield* waitFor(() => moving.motion && moving.motion.phase === 'hold');
    assert.ok(trap.hidden, 'spikes appeared before approaching the landing');
    yield* go(450);
    yield* waitFor(() => game.level.standing.includes(moving), { right: true });
    yield* jump('right', { to: 632 });
    assert.ok(!trap.hidden, 'spikes did not appear near the landing');
    assert.ok(p().onGround && p().y + p().h === 250 && p().x + p().w <= trap.x,
      'did not land safely before the spikes');
    reachedLedge = true;
    yield* go(700);
  });
  assert.ok(reachedLedge, 'did not reach the landing');
  assert.strictEqual(result.mode, 'dead', JSON.stringify(result));
  assert.ok(p().x + p().w > 650 && p().x < 674, 'did not hit the landing spikes');
});

game.LEVELS.forEach((def, i) => {
  if (i !== 32) {
    check(`level ${i + 1} (${def.name}): holding right dies`, () => {
      const result = play(i, function* () { yield* hold('right', 15); });
      assert.strictEqual(result.mode, 'dead', `naive player survived: ${JSON.stringify(result)}`);
    });
  }
  check(`level ${i + 1} (${def.name}): the bot can beat it`, () => {
    const result = play(i, SOLUTIONS[i], { lag: LAG[i] || 0 });
    assert.strictEqual(result.mode, 'won', JSON.stringify(result));
  });
});

check('level 10: the floor past the fallen block holds on the way out but drops on the way back', () => {
  const trapdoor = () => thing(t => t.kind === 'solid' && t.x === 530);
  const result = play(9, function* () {
    yield* jumpFrom(160, 'right');
    yield* jumpFrom(330, 'right');
    yield* waitFor(() => thing(t => t.look === 'block').motion, { right: true });
    yield* hold('left', 0.3);
    yield* wait(0.4);
    yield* jumpFrom(560, 'right');
    assert.ok(!trapdoor().motion && !trapdoor().gone, 'the floor fell before the door fled');
    yield* go(705);
    yield* wait(1);
    yield* jumpFrom(680, 'left');
  });
  assert.strictEqual(result.mode, 'dead', JSON.stringify(result));
  assert.ok(trapdoor().motion || trapdoor().gone, 'the floor never dropped');
});

if (failures) {
  console.log(`\n${failures} failing`);
  process.exit(1);
}
console.log('\nall passing');
