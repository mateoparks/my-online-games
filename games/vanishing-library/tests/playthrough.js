// Scripted playthrough: drives the real game (app.update with Actions) from a
// new game to a named milestone, running one registered step per milestone
// and checking each milestone's `reached` on the way. Steps are data:
// tests/steps/<item>.steps.js registers them (README "Progression").
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { playApp } = require('./harness');

const STEP = 1 / 60;
const DIRECTIONS = { right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] };
const registry = {};

function step(milestone, fn) {
  if (registry[milestone]) throw new Error(`steps for milestone ${milestone} are already registered`);
  registry[milestone] = fn;
}

function isWalkable(VL, area, screen, tx, ty) {
  if (VL.isSolidAt(area, screen, tx, ty)) return false;
  return !VL.getScreen(area, screen).entities.some((e) => e.x === tx && e.y === ty && (e.solid || VL.ENTITIES[e.type]?.solid));
}

const nodeKey = (node) => `${node.area}|${node.screen}|${node.tx}|${node.ty}`;

// Stepping onto a door tile teleports, so the tile itself is never a
// waypoint: walking towards it arrives at the door's target.
function stepTo(VL, area, screen, tx, ty, dir, via) {
  if (!isWalkable(VL, area, screen, tx, ty)) return null;
  const door = VL.getScreen(area, screen).entities.find((e) => e.type === 'door' && e.x === tx && e.y === ty);
  if (door) return { area: door.to.area, screen: door.to.screen, tx: door.to.tx, ty: door.to.ty, dir, via: 'door' };
  return { area, screen, tx, ty, dir, via };
}

// Breadth-first over tiles: neighbours within the screen, across open edges
// into the next screen, and through doors into their target.
function findPath(VL, from, to) {
  const { cols, rows } = VL.TUNING;
  const prev = new Map([[nodeKey(from), null]]);
  const queue = [from];
  while (queue.length) {
    const node = queue.shift();
    if (nodeKey(node) === nodeKey(to)) {
      const route = [];
      for (let n = node; n; n = prev.get(nodeKey(n))) route.unshift(n);
      return route;
    }
    const nexts = [];
    for (const [dir, [dx, dy]] of Object.entries(DIRECTIONS)) {
      const tx = node.tx + dx;
      const ty = node.ty + dy;
      if (tx >= 0 && tx < cols && ty >= 0 && ty < rows) {
        nexts.push(stepTo(VL, node.area, node.screen, tx, ty, dir, 'walk'));
        continue;
      }
      const screen = VL.neighborKey(node.screen, dx, dy);
      if (VL.screenExists(node.area, screen)) nexts.push(stepTo(VL, node.area, screen, tx - dx * cols, ty - dy * rows, dir, 'edge'));
    }
    for (const next of nexts.filter(Boolean)) {
      if (prev.has(nodeKey(next))) continue;
      prev.set(nodeKey(next), node);
      queue.push(next);
    }
  }
  return null;
}

function createDrive(VL, app) {
  const drive = {
    VL,
    app,
    get state() {
      return app.game;
    },
    update(actions = VL.noActions()) {
      app.update(actions, STEP);
    },
    press(action) {
      drive.update(VL.actions({ pressed: [action] }));
    },
    hold(held, seconds) {
      for (let t = 0; t < seconds - 1e-9; t += STEP) drive.update(VL.actions({ held }));
    },
    until(done, maxSeconds = 3, held = []) {
      for (let t = 0; t < maxSeconds - 1e-9 && !done(drive.state); t += STEP) drive.update(VL.actions({ held }));
      if (done(drive.state)) return;
      const { area, screen, x, y } = drive.state.player;
      throw new Error(`not reached after ${maxSeconds} s holding [${held}]: hero at ${area} ${screen} (${x.toFixed(1)},${y.toFixed(1)}), scene ${app.sceneId}`);
    },
    // Walks the shortest tile path with real held directions; `target` fields
    // default to the hero's area and screen.
    walkTo(target) {
      const player = drive.state.player;
      const here = { area: player.area, screen: player.screen, ...VL.heroTile(drive.state) };
      const goal = { area: here.area, screen: here.screen, ...target };
      const route = findPath(VL, here, goal);
      if (!route) throw new Error(`no path from ${here.area} ${here.screen} (${here.tx},${here.ty}) to ${goal.area} ${goal.screen} (${goal.tx},${goal.ty})`);
      for (const node of route.slice(1)) {
        const spot = VL.tileCenter(node.tx, node.ty);
        // Tile centres are 12 steps apart, so holding a direction lands on
        // the next centre exactly; the slack covers edge wrap and door arrival.
        drive.until((state) => state.player.area === node.area && state.player.screen === node.screen && !state.transition
          && Math.abs(state.player.x - spot.x) < 0.7 && Math.abs(state.player.y - spot.y) < 0.7, 3, [node.dir]);
      }
    },
  };
  return drive;
}

function createPlaythrough(VL, { milestones = VL.MILESTONES, steps = registry, app = playApp(VL) } = {}) {
  const drive = createDrive(VL, app);
  const drivable = () => {
    const ids = [];
    for (const id of milestones) {
      if (!steps[id]) break;
      ids.push(id);
    }
    return ids;
  };
  return {
    drive,
    drivable,
    playTo(milestone) {
      const index = milestones.indexOf(milestone);
      if (index === -1) throw new Error(`${milestone} is not a milestone`);
      const ready = drivable();
      if (index >= ready.length) throw new Error(`${milestone} is not drivable yet: no steps for ${milestones[ready.length]}`);
      for (const id of milestones.slice(0, index + 1)) {
        const lock = VL.LOCKS[id];
        if (!lock?.reached) throw new Error(`milestone ${id} is planned (no reached predicate), so its steps cannot be checked`);
        steps[id](drive);
        assert.ok(lock.reached(drive.state), `milestone ${id} was not reached by its steps`);
      }
      return drive;
    },
  };
}

module.exports = { step, registry, findPath, isWalkable, createPlaythrough };

const stepsDir = path.join(__dirname, 'steps');
for (const file of fs.readdirSync(stepsDir).filter((name) => name.endsWith('.steps.js')).sort()) {
  require(path.join(stepsDir, file))(step);
}
