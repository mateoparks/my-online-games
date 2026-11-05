// Node test for the Jumping Dude Game. Loads levels.js and game.js into a
// node:vm context with a fake DOM, then checks every level two ways:
//   1. a naive player who just holds → dies (it's a rage game, after all);
//   2. a bot that knows the traps can reach the real door.
// Run: node games/jumping-dude/game.test.js
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fakeElement() {
  return {
    textContent: '', hidden: true,
    focus() {}, blur() {}, addEventListener() {},
    getContext: () => new Proxy({}, { get: (_, name) => (name === 'measureText' ? text => ({ width: text.length * 13 }) : () => {}) })
  };
}

function loadGame() {
  const elements = {};
  const store = {};
  const context = {
    document: { getElementById: id => (elements[id] ??= fakeElement()), documentElement: {}, activeElement: null },
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
  for (const file of ['levels.js', 'game.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), context, { filename: file });
  }
  vm.runInContext('globalThis.game = { get level() { return level; }, input, update, startLevel, LEVELS, STEP };', context);
  return { game: context.game, elements };
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
function* jump(dir, { holdJump = 1, steer = dir, steerTime = Infinity, to } = {}) {
  yield { [dir]: true };
  yield { jump: true, [dir]: true };
  let ticks = 0;
  while (!p().onGround || ticks < 3) {
    ticks++;
    const t = ticks * game.STEP;
    let steering = !!steer && t < steerTime ? steer : null;
    if (to !== undefined) steering = Math.abs(to - center()) > 3 ? (to > center() ? 'right' : 'left') : null;
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
  // 1. Trust Me: hop the tile, hop the spikes, tease the block, chase the door home,
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
  // 10. Encore: hop the pit, ride the spring, tease the block, chase the door twice.
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
  // 11. The Last Door: find the invisible step, grab the key, then do the rest backwards.
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
  // 12. Just Kidding: ride, hop the crumbling step, ride, jump past the crumbling landing.
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
  // 15. The Actual Last Door: hop the fake floor, tease the block, take the key, climb out.
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
  }
];

// How slow the bot's reactions are on each level, in seconds.
const LAG = { 13: 0.15 };

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

check('there are 16 levels and 16 solutions', () => {
  assert.strictEqual(game.LEVELS.length, 16);
  assert.strictEqual(SOLUTIONS.length, 16);
});

game.LEVELS.forEach((def, i) => {
  check(`level ${i + 1} (${def.name}): holding right dies`, () => {
    const result = play(i, function* () { yield* hold('right', 15); });
    assert.strictEqual(result.mode, 'dead', `naive player survived: ${JSON.stringify(result)}`);
  });
  check(`level ${i + 1} (${def.name}): the bot can beat it`, () => {
    const result = play(i, SOLUTIONS[i], { lag: LAG[i] || 0 });
    assert.strictEqual(result.mode, 'won', JSON.stringify(result));
  });
});

check('level 1: the floor past the fallen block holds on the way out but drops on the way back', () => {
  const trapdoor = () => thing(t => t.kind === 'solid' && t.x === 530);
  const result = play(0, function* () {
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
