// The progression table (locks and keys), the solver that walks it from a new
// game to the ending, and the scripted-playthrough harness.
const assert = require('node:assert/strict');
const { test, read, loadGame, hold, heroTile } = require('./harness');
const { createPlaythrough, findPath } = require('./playthrough');

// Top-level headings of docs/vanishing-library-design.md; every lock cites one.
const DESIGN_SECTIONS = [
  'Starting and saving', 'Controls', 'Resources and economy', 'Tools: two tiers',
  'Books, pages and the library', 'Paper and ink', 'Chickens', 'People', 'The world',
  'The path through the game', 'Ending', 'Hearts and combat',
];

// A copy of the shipped table that a test can break without touching VL.LOCKS.
function copyTable(VL) {
  const copy = {};
  for (const [id, lock] of Object.entries(VL.LOCKS)) {
    copy[id] = {
      ...lock,
      needs: lock.needs.map((need) => (Array.isArray(need) ? need.slice() : need)),
      gives: lock.gives.slice(),
      loses: lock.loses.slice(),
      retires: lock.retires.slice(),
      supplies: { ...lock.supplies },
      count: { ...lock.count },
      consumes: { ...lock.consumes },
    };
  }
  return copy;
}

const problemsOf = (VL, table) => [...VL.solveProgression(table).problems];

// ---------- registry ----------

test('defineLock registers a lock with defaults and rejects an implemented duplicate', () => {
  const { VL } = loadGame();
  const lock = VL.defineLock('fixtureKey', { type: 'item', needs: ['start'], doc: '§ Controls', by: 'W99' });
  assert.equal(lock.id, 'fixtureKey');
  assert.deepEqual([...lock.gives], []);
  assert.equal(lock.renewable, false);
  assert.equal(lock.optional, false);
  assert.equal(VL.LOCKS.fixtureKey, lock);
  VL.defineLock('fixtureKey', { type: 'item', needs: ['start'], doc: '§ Controls', reached: () => true });
  assert.throws(() => VL.defineLock('fixtureKey', { doc: '§ Controls', reached: () => true }), /fixtureKey is already implemented/);
  assert.throws(() => VL.defineLock('fixtureKey', { doc: '§ Controls', by: 'W98' }), /fixtureKey is already implemented/, 'a planned entry cannot replace an implemented one');
});

test('a later item claims a planned lock by defining it with a reached predicate', () => {
  const { VL } = loadGame();
  assert.equal(VL.LOCKS.chestGear.reached, undefined, 'chestGear is planned until W5');
  assert.equal(VL.LOCKS.chestGear.by, 'W5');
  const claimed = VL.defineLock('chestGear', {
    type: 'item', needs: ['hutInside'], gives: ['woodSword', 'woodShield'],
    doc: '§ The path through the game, 1', reached: (state) => Boolean(state.flags.chest),
  });
  assert.equal(VL.LOCKS.chestGear, claimed);
  assert.equal(claimed.reached({ flags: { chest: true } }), true);
  assert.throws(() => VL.defineLock('chestGear', { doc: '§ Controls', reached: () => true }), /already implemented/);
});

test('defineLock insists on a design-doc citation, an owner for planned locks and a known type', () => {
  const { VL } = loadGame();
  assert.throws(() => VL.defineLock('noDoc', { by: 'W9' }), /noDoc must cite its design-doc section/);
  assert.throws(() => VL.defineLock('badDoc', { by: 'W9', doc: 'see the design' }), /badDoc must cite/);
  assert.throws(() => VL.defineLock('noOwner', { doc: '§ Controls' }), /planned lock noOwner must name the item/);
  assert.throws(() => VL.defineLock('badType', { doc: '§ Controls', by: 'W9', type: 'door' }), /badType: unknown type door/);
  assert.throws(() => VL.defineLock('notEvent', { doc: '§ Controls', by: 'W9', type: 'item', loses: ['wood'] }), /notEvent loses keys but is not an event/);
  assert.throws(() => VL.defineMilestones(['start']), /milestones are already defined/);
});

test('every lock cites a section of the design doc and every planned lock names its item', () => {
  const { VL } = loadGame();
  const ids = Object.keys(VL.LOCKS);
  assert.ok(ids.length >= 60, `${ids.length} locks seeded`);
  for (const lock of Object.values(VL.LOCKS)) {
    assert.ok(DESIGN_SECTIONS.some((section) => lock.doc.startsWith(`§ ${section}`)), `${lock.id} cites a design-doc section: ${lock.doc}`);
    if (!lock.reached) assert.match(lock.by, /^W\d+$/, `${lock.id} names its item`);
  }
});

test('milestones are locks in story order, from the start to the ending', () => {
  const { VL } = loadGame();
  assert.equal(VL.MILESTONES[0], 'start');
  assert.equal(VL.MILESTONES.at(-1), 'ending');
  assert.equal(new Set(VL.MILESTONES).size, VL.MILESTONES.length);
  for (const id of VL.MILESTONES) assert.ok(VL.LOCKS[id], `milestone ${id} is a lock`);
  for (const id of ['chestGear', 'scriptoriumKey', 'liftingGloves', 'd1Boss', 'woodsMapCopy', 'grapplingRope', 'd2Boss', 'shockwave', 'raft', 'slingshot', 'd3Boss', 'climbersAlmanac', 'highlands', 'mirrorShield', 'd4Boss', 'trapdoorOpen', 'marionettes']) {
    assert.ok(VL.MILESTONES.includes(id), `${id} is a milestone`);
  }
});

test('implemented place locks name screens that exist', () => {
  const { VL } = loadGame();
  let places = 0;
  for (const lock of Object.values(VL.LOCKS)) {
    if (!lock.reached || !lock.place) continue;
    places += 1;
    assert.ok(VL.screenExists(lock.place.area, lock.place.screen), `${lock.id}: ${lock.place.area} ${lock.place.screen} exists`);
  }
  assert.ok(places >= 1);
});

test('VL.progress lists the locks a live game has reached', () => {
  const { VL } = loadGame();
  const state = VL.newGame();
  assert.deepEqual([...VL.progress(state)], ['start']);
  VL.place(state, { area: 'hut', screen: '0,0', tx: 7, ty: 5 });
  assert.deepEqual([...VL.progress(state)], ['start', 'hutInside']);
});

// ---------- the solver on the shipped table ----------

test('the whole path solves: every milestone is reachable and nothing softlocks', () => {
  const { VL } = loadGame();
  const report = VL.solveProgression();
  assert.deepEqual([...report.problems], []);
  assert.equal(report.ok, true);
  assert.deepEqual([...report.stages.map((stage) => stage.event)], [null, 'shockwave', 'primerTaken']);
  const finalReached = new Set(report.stages.at(-1).reached);
  for (const id of VL.MILESTONES) assert.ok(finalReached.has(id), `${id} is reachable at the end`);
});

test('the shockwave: everything lost can be regained before Dungeon 3, and ore comes 3 before and 3 after', () => {
  const { VL } = loadGame();
  const report = VL.solveProgression();
  const shockwave = VL.LOCKS.shockwave;
  for (const key of ['woodSword', 'woodShield', 'woodShovel', 'metalSword', 'metalShield', 'metalShovel', 'worldMap', 'wood', 'paper', 'berries', 'ink', 'shells']) {
    assert.ok(shockwave.loses.includes(key), `the shockwave takes ${key}`);
  }
  assert.ok(shockwave.gives.includes('glowstone') && shockwave.gives.includes('brokenShells'));
  assert.deepEqual([...report.regained.shockwave].sort(), [...shockwave.loses].sort(), 'every loss is regained');
  const after = report.stages[1];
  assert.deepEqual([...after.spent], ['ore'], 'the lost metal gear was made from ore');
  assert.equal(report.stages[0].counts.ore, 3, 'three lumps before the shockwave');
  assert.equal(after.keys.includes('ore'), false);
  assert.equal(after.counts.ore, 3, 'three lumps after it, with every earlier one spent on the lost gear');
  for (const key of ['mortarPestle', 'liftingGloves', 'grapplingRope', 'scriptoriumKey', 'woodsMapCopy']) {
    assert.ok(after.keys.includes(key), `${key} is kept through the shockwave (forced by the path)`);
  }
  for (const key of ['chestGear', 'oreShallows', 'oreScriptorium', 'oreWoods']) {
    assert.ok(after.disabled.includes(key), `${key} is used up before the shockwave`);
  }
  assert.ok(!after.disabled.includes('bookChickenAlmanac'), 'a kept book stays findable after the shockwave');
});

test('the Primer: only the drawn world map and the Primer are missable, and only after Dungeon 3', () => {
  const { VL } = loadGame();
  const report = VL.solveProgression();
  assert.deepEqual({ ...report.missable }, { worldMap: 'primerTaken' }, 'the Primer itself is on the shelf until then, so only the drawing is missable');
  assert.ok(report.stages[1].reached.includes('worldMap'), 'the map can be redrawn after the shockwave');
  assert.ok(!report.stages[2].reached.includes('worldMap'));
});

// ---------- the solver on deliberately broken tables ----------

test('broken: without bare hands and the helper\'s wood, no sword can be regained after the shockwave', () => {
  const { VL } = loadGame();
  const table = copyTable(VL);
  table.bushBareHands.needs = ['start', ['woodSword', 'metalSword']];
  assert.deepEqual(problemsOf(VL, table), [], 'the helper\'s couple of wood alone is enough to climb back');
  delete table.helperWood;
  const problems = problemsOf(VL, table);
  for (const key of ['wood', 'woodSword', 'woodShield', 'woodShovel', 'paper', 'shells', 'worldMap']) {
    assert.ok(problems.includes(`after shockwave, ${key} cannot be regained`), problems.join('\n'));
  }
  assert.ok(!problems.includes('after shockwave, berries cannot be regained'), 'berry bushes still give berries');
  assert.ok(problems.includes('raft is unreachable'), 'the raft needs wood after the shockwave');
  assert.ok(problems.includes('ending is unreachable'));
});

test('broken: the thief takes the Primer at the shockwave, so the map cannot be redrawn', () => {
  const { VL } = loadGame();
  const table = copyTable(VL);
  table.shockwave.retires = ['primerOnShelf'];
  delete table.primerTaken;
  const problems = problemsOf(VL, table);
  assert.deepEqual(problems, ['after shockwave, worldMap cannot be regained']);
});

test('broken: one lump fewer after the shockwave leaves too few to re-forge the metal gear', () => {
  const { VL } = loadGame();
  const table = copyTable(VL);
  delete table.oreShipwreck;
  const problems = problemsOf(VL, table);
  assert.ok(problems.includes('after shockwave, counter ore: 3 needed to regain what was lost but only 2 can be found'), problems.join('\n'));
  assert.ok(problems.includes('counter ore: demand 6 exceeds supply 5'), 'three metal items, each made twice');
  // A lump moved to before the shockwave is kept as unused ore, so that is allowed.
  const moved = copyTable(VL);
  moved.oreLakeIsland.needs = ['lake'];
  const report = VL.solveProgression(moved);
  assert.deepEqual([...report.problems], []);
  assert.equal(report.stages[0].counts.ore, 4);
  assert.equal(report.stages[1].counts.ore, 3, 'one unused lump kept plus two found later');
});

test('broken: a cycle makes milestones unreachable', () => {
  const { VL } = loadGame();
  const table = copyTable(VL);
  table.scriptoriumKey.needs.push('d1Boss');
  const problems = problemsOf(VL, table);
  assert.ok(problems.includes('scriptoriumKey is unreachable'), problems.join('\n'));
  assert.ok(problems.includes('ending is unreachable'));
});

test('broken: a sixth page, a dangling key and a counter nothing supplies are reported', () => {
  const { VL } = loadGame();
  const table = copyTable(VL);
  table.climbersAlmanac.count = { pages: 6 };
  assert.ok(problemsOf(VL, table).includes('climbersAlmanac is unreachable'));
  const dangling = copyTable(VL);
  dangling.raft.needs.push('canoe');
  assert.deepEqual(problemsOf(VL, dangling), ['raft needs unknown key canoe']);
  const counter = copyTable(VL);
  counter.climbersAlmanac.count = { stamps: 1 };
  assert.deepEqual(problemsOf(VL, counter), ['climbersAlmanac uses counter stamps that nothing supplies']);
});

test('broken: a required item only reachable before an event, and a milestone listed out of order', () => {
  const { VL } = loadGame();
  const table = copyTable(VL);
  // Binding the Climber's Almanac needs the Primer, which the thief takes after Dungeon 3.
  table.climbersAlmanac.needs.push('primerOnShelf');
  const problems = problemsOf(VL, table);
  assert.ok(problems.includes('climbersAlmanac is required but unreachable after primerTaken'), problems.join('\n'));
  assert.ok(problems.includes('highlands is required but unreachable after primerTaken'));
  // A one-time chest whose contents the shockwave takes is simply used up, and what else it held is kept.
  const used = copyTable(VL);
  used.bookChickenAlmanac.gives.push('woodShovel');
  const report = VL.solveProgression(used);
  assert.deepEqual([...report.problems], []);
  assert.ok(report.stages[1].disabled.includes('bookChickenAlmanac') && report.stages[1].keys.includes('chickenAlmanacRead'));
  const milestones = VL.MILESTONES.slice();
  const i = milestones.indexOf('shockwave');
  [milestones[i], milestones[i + 1]] = [milestones[i + 1], milestones[i]];
  const order = [...VL.solveProgression(copyTable(VL), milestones).problems];
  assert.deepEqual(order, ['milestone shockwave is listed after raft but is reachable in an earlier stage']);
});

// ---------- the playthrough harness ----------

test('findPath routes through open tiles, across screen edges and through doors', () => {
  const { VL } = loadGame();
  const from = { area: 'overworld', screen: '1,1', tx: 8, ty: 5 };
  const inside = findPath(VL, from, { area: 'hut', screen: '0,0', tx: 7, ty: 5 });
  assert.ok(inside, 'a path into the hut exists');
  assert.equal(inside.at(-1).area, 'hut');
  assert.ok(inside.some((node) => node.via === 'door'));
  const west = findPath(VL, from, { area: 'overworld', screen: '0,1', tx: 14, ty: 5 });
  assert.ok(west.some((node) => node.via === 'edge'));
  assert.equal(findPath(VL, from, { area: 'overworld', screen: '1,1', tx: 7, ty: 1 }), null, 'a wall tile is unreachable');
});

test('drive.walkTo moves the hero with real input through doors and slides', () => {
  const { VL } = loadGame();
  const play = createPlaythrough(VL);
  const { drive } = play;
  drive.walkTo({ area: 'hut', screen: '0,0', tx: 7, ty: 5 });
  assert.equal(drive.state.player.area, 'hut');
  assert.deepEqual(heroTile(VL, drive.state), [7, 5]);
  drive.walkTo({ area: 'overworld', screen: '0,1', tx: 14, ty: 5 });
  assert.equal(drive.state.player.screen, '0,1');
  assert.deepEqual(heroTile(VL, drive.state), [14, 5]);
  assert.equal(drive.state.transition, null);
  assert.ok(drive.state.visited['overworld:0,1'] && drive.state.visited['hut:0,0']);
  assert.throws(() => drive.walkTo({ tx: 0, ty: 0 }), /no path/);
});

test('playthrough: steps cover a prefix of the milestones and drive the real game to the last one', () => {
  const { VL } = loadGame();
  const play = createPlaythrough(VL);
  const drivable = play.drivable();
  assert.ok(drivable.length >= 1 && drivable[0] === 'start', 'steps start at the start');
  const gap = VL.MILESTONES[drivable.length];
  if (gap) assert.equal(VL.LOCKS[gap].reached, undefined, `implemented milestone ${gap} has no playthrough steps`);
  const drive = play.playTo(drivable.at(-1));
  assert.ok(VL.progress(drive.state).includes(drivable.at(-1)));
  assert.throws(() => play.playTo(gap), new RegExp(`${gap} is not drivable yet`));
});

test('playthrough: a step that does not reach its milestone fails, and steps are registered once', () => {
  const { VL } = loadGame();
  const steps = { start() {}, hutInside() {} };
  const play = createPlaythrough(VL, { milestones: ['start', 'hutInside'], steps });
  assert.throws(() => play.playTo('hutInside'), /milestone hutInside was not reached/);
  const good = createPlaythrough(VL, {
    milestones: ['start', 'hutInside'],
    steps: { start() {}, hutInside: (drive) => drive.walkTo({ area: 'hut', screen: '0,0', tx: 7, ty: 7 }) },
  });
  assert.equal(good.playTo('hutInside').state.player.area, 'hut');
  const planned = createPlaythrough(VL, { milestones: ['start', 'chestGear'], steps: { start() {}, chestGear() {} } });
  assert.throws(() => planned.playTo('chestGear'), /chestGear is planned/);
  const { step } = require('./playthrough');
  assert.throws(() => step('start', () => {}), /steps for milestone start are already registered/);
});

test('drive.until reports where the hero is stuck', () => {
  const { VL } = loadGame();
  const { drive } = createPlaythrough(VL);
  assert.throws(() => drive.until(() => false, 0.1, ['up']), /not reached after 0.1 s .*overworld 1,1/);
  hold(VL, drive.state, [], 1 / 60);
  drive.press('interact');
  assert.equal(drive.state.player.moving, false);
});

test('README documents how an item registers locks and playthrough steps', () => {
  const readme = read('README.md');
  for (const word of ['VL.defineLock', 'VL.solveProgression', 'tests/steps/', 'milestones.js', 'renewable', 'loses', 'reached']) {
    assert.ok(readme.includes(word), `README mentions ${word}`);
  }
});
