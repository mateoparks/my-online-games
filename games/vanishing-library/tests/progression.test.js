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

test('a claim that changes the planned rule must say why (replan), so a loosened gate shows in the diff', () => {
  const { VL } = loadGame();
  const planned = { type: 'place', needs: ['town', 'liftingGloves'], doc: '§ The path through the game, 2' };
  assert.throws(() => VL.defineLock('eastRoad', { ...planned, needs: ['town'], reached: () => true }), /eastRoad is claimed with a different rule than planned \(needs\); say why with replan/);
  assert.throws(() => VL.defineLock('eastRoad', { ...planned, optional: true, gives: ['view'], reached: () => true }), /than planned \(gives, optional\)/);
  assert.equal(VL.LOCKS.eastRoad.reached, undefined, 'a refused claim leaves the plan in place');
  // Order inside needs (and inside an any-of) does not count as a change.
  const same = VL.defineLock('eastRoad', { ...planned, needs: ['liftingGloves', 'town'], reached: () => true });
  assert.equal(VL.LOCKS.eastRoad, same);
  const d2 = VL.LOCKS.d2Boss;
  VL.defineLock('d2Boss', { ...d2, needs: ['hollowOakEntered', 'grapplingRope', ['metalSword', 'woodSword']], by: undefined, reached: () => true });
  const loosened = VL.defineLock('scriptoriumEntered', { type: 'place', needs: ['town'], doc: '§ The world: Old Scriptorium', replan: 'the door is open; the key is decorative', reached: () => true });
  assert.equal(loosened.replan, 'the door is open; the key is decorative');
});

test('an item splits a planned placeholder into its own locks without editing milestones.js', () => {
  const { VL } = loadGame();
  assert.deepEqual({ ...VL.LOCKS.hiddenBooks.supplies }, { books: 10 });
  const part = (books) => ({ type: 'item', needs: ['town', 'library'], supplies: { books }, optional: true, doc: '§ Books, pages and the library: Hidden books', reached: () => false });
  assert.throws(() => VL.splitLock('hiddenBooks', { bookUnderRock: part(4), bookInTrunk: part(5) }), /hiddenBooks supplies books 10 but its parts supply 9/);
  assert.throws(() => VL.splitLock('hiddenBooks', { bookUnderRock: part(5), oreWoods: part(5) }), /lock oreWoods already exists/);
  assert.ok(VL.LOCKS.hiddenBooks, 'a refused split leaves the placeholder');
  assert.throws(() => VL.splitLock('start', { a: part(1) }), /start is implemented, not a placeholder/);
  assert.throws(() => VL.splitLock('nothing', { a: part(1) }), /lock nothing does not exist/);
  VL.splitLock('hiddenBooks', { bookUnderRock: part(4), bookInTrunk: part(6) });
  assert.equal(VL.LOCKS.hiddenBooks, undefined);
  assert.equal(VL.LOCKS.bookInTrunk.supplies.books, 6);
  const report = VL.solveProgression();
  assert.deepEqual([...report.problems], []);
  assert.ok(report.stages[0].reached.includes('swiftfootBoots'), 'the 15-book reward still adds up');
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

test('the trapdoor is under the puppet stage, a place of its own', () => {
  const { VL } = loadGame();
  assert.equal(VL.LOCKS.puppetStage.type, 'place');
  assert.equal(VL.LOCKS.puppetStage.by, 'W11');
  assert.deepEqual([...VL.LOCKS.trapdoorOpen.needs], ['d4Boss', 'puppetStage']);
  assert.equal(Object.keys(VL.LOCKS).length, 88);
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

test('broken: without bare hands, the helper\'s couple of wood is not enough to climb back after the shockwave', () => {
  const { VL } = loadGame();
  const table = copyTable(VL);
  // Bushes now need a sword, so the only wood after the shockwave is the helper's one-time gift:
  // a wood sword alone costs 3 wood (§ Tools), so a gift of "a couple" can't pay for the sword,
  // raft, oar and shield. Wood is a declared resource, so a one-time gift never counts.
  table.bushBareHands.needs = ['start', ['woodSword', 'metalSword']];
  const problems = problemsOf(VL, table);
  for (const key of ['wood', 'woodSword', 'woodShield', 'woodShovel', 'paper', 'shells', 'worldMap']) {
    assert.ok(problems.includes(`after shockwave, ${key} cannot be regained`), problems.join('\n'));
  }
  assert.ok(!problems.includes('after shockwave, berries cannot be regained'), 'berry bushes still give berries');
  assert.ok(problems.includes('raft is unreachable'), 'the raft needs wood after the shockwave');
  assert.ok(problems.includes('ending is unreachable'));
  assert.ok(problems.includes('oar is required but unreachable after shockwave'));
  assert.ok(!problems.includes('helperWood is unreachable'), 'the gift itself still happens; it just proves nothing');
  // Treating wood as a plain key is what hid this: then the gift "pays" for everything forever.
  assert.deepEqual([...VL.solveProgression(table, VL.MILESTONES, { resources: new Set() }).problems], []);
  assert.deepEqual([...VL.RESOURCES].sort(), ['berries', 'brokenShells', 'ink', 'paper', 'shells', 'wood']);
});

// A minimal table with defineLock's defaults filled in (events and counters included).
function mk(rules) {
  const table = {};
  for (const [id, rule] of Object.entries(rules)) {
    table[id] = {
      needs: [], gives: [], supplies: {}, count: {}, consumes: {}, loses: [], retires: [],
      renewable: false, optional: false, type: 'flag', ...rule, id,
    };
  }
  return table;
}
const solveTable = (VL, rules, milestones, options = {}) => VL.solveProgression(mk(rules), milestones, { resources: new Set(), skippable: [], ...options });
const tableProblems = (VL, rules, milestones, options) => [...solveTable(VL, rules, milestones, options).problems];

test('broken: a one-time gift of a resource is spent once, so two locks cannot both live on it', () => {
  const { VL } = loadGame();
  const rules = {
    start: {}, helper: { needs: ['start'], gives: ['wood'] },
    raft: { needs: ['wood'] }, sword: { needs: ['wood'] }, ending: { needs: ['raft', 'sword'] },
  };
  assert.deepEqual(tableProblems(VL, rules, ['start', 'ending']), [], 'as a plain key, wood is had forever');
  assert.deepEqual(tableProblems(VL, rules, ['start', 'ending'], { resources: new Set(['wood']) }), ['resource wood has no renewable source']);
  const bushes = { ...rules, bush: { needs: ['start'], gives: ['wood'], renewable: true } };
  assert.deepEqual(tableProblems(VL, bushes, ['start', 'ending'], { resources: new Set(['wood']) }), []);
});

test('broken: two events available at once are checked in every order', () => {
  const { VL } = loadGame();
  // e1 loses the sword; e2 needs it and opens the only forge. The story lists e2 first, but a
  // player who walks into e1 first is stuck.
  const lostGear = {
    start: {}, chest: { needs: ['start'], gives: ['sword'] },
    e2: { type: 'event', needs: ['sword'], gives: ['forge'] }, smith: { needs: ['forge'], gives: ['sword'], renewable: true },
    e1: { type: 'event', needs: ['start'], loses: ['sword'] },
    ending: { needs: ['e1', 'e2'] },
  };
  const report = solveTable(VL, lostGear, ['start', 'e2', 'e1', 'ending']);
  assert.deepEqual([...report.orders].map((order) => [...order]), [['e2', 'e1'], ['e1']], 'the story order first, then the other');
  assert.deepEqual([...report.stages.map((stage) => stage.event)], [null, 'e2', 'e1'], 'stages follow the story order');
  assert.ok(report.problems.includes('after e1, sword cannot be regained'), [...report.problems].join('\n'));
  assert.ok(report.problems.includes('e2 is required but unreachable after e1'));
  // e1 retires a place e2 needs; the place is optional (it is only somewhere to stand).
  const altar = {
    start: {}, altar: { needs: ['start'], optional: true },
    e2: { type: 'event', needs: ['altar'], gives: ['relic'] }, e1: { type: 'event', needs: ['start'], retires: ['altar'] },
    ending: { needs: ['e1', 'relic'] },
  };
  const problems = tableProblems(VL, altar, ['start', 'e2', 'e1', 'ending']);
  assert.ok(problems.includes('e2 is required but unreachable after e1'), problems.join('\n'));
  assert.ok(problems.includes('ending is required but unreachable after e1'));
  // Three events, one order broken deep in the tree: the report names the whole order.
  const deep = {
    start: {}, chest: { needs: ['start'], gives: ['sword'] },
    a: { type: 'event', needs: ['sword'], gives: ['forge'] }, smith: { needs: ['forge'], gives: ['sword'], renewable: true },
    b: { type: 'event', needs: ['start'] }, c: { type: 'event', needs: ['b'], loses: ['sword'] },
    ending: { needs: ['a', 'b', 'c', 'sword'] },
  };
  const deepReport = solveTable(VL, deep, ['start', 'a', 'b', 'c', 'ending'], { skippable: ['a'] });
  assert.deepEqual([...deepReport.orders].map((order) => [...order]), [['a', 'b', 'c'], ['b', 'a', 'c'], ['b', 'c']]);
  assert.deepEqual([...deepReport.problems], [
    'after b then c, sword cannot be regained',
    'a is required but unreachable after b then c',
    'smith is required but unreachable after b then c',
    'ending is required but unreachable after b then c',
  ]);
});

test('broken: the real table plus a thief event that strikes on the first library visit', () => {
  const { VL } = loadGame();
  const table = copyTable(VL);
  table.thief = { ...table.primerTaken, id: 'thief', needs: ['library'], retires: ['sealedBook'], loses: [] };
  table.hiddenBookSealed.gives = ['sealedBook'];
  table.scriptoriumKey.needs = ['sealedBook', 'library'];
  const report = VL.solveProgression(table);
  assert.deepEqual([...report.orders].map((order) => [...order]), [['shockwave', 'primerTaken', 'thief'], ['shockwave', 'thief', 'primerTaken'], ['thief']]);
  assert.ok(report.problems.includes('scriptoriumKey is required but unreachable after thief'), [...report.problems].join('\n'));
  assert.ok(report.problems.includes('ending is required but unreachable after thief'));
});

test('an event that takes a key and hands it straight back is not a softlock', () => {
  const { VL } = loadGame();
  const rules = {
    start: {}, chest: { needs: ['start'], gives: ['k'] },
    wave: { type: 'event', needs: ['chest'], loses: ['k'], gives: ['k'] },
    ending: { needs: ['wave', 'k'] },
  };
  assert.deepEqual(tableProblems(VL, rules, ['start', 'wave', 'ending']), []);
});

test('broken: small keys spent on the wrong door first', () => {
  const { VL } = loadGame();
  // One key, two doors; the second key is behind door B. Opening A first strands the player.
  const keys = {
    start: {}, key1: { needs: ['start'], supplies: { k: 1 } },
    doorA: { needs: ['start'], consumes: { k: 1 } }, roomA: { needs: ['doorA'] },
    doorB: { needs: ['start'], consumes: { k: 1 } }, key2: { needs: ['doorB'], supplies: { k: 1 } },
    boss: { needs: ['doorB', 'doorA'] }, ending: { needs: ['boss'] },
  };
  assert.deepEqual(tableProblems(VL, keys, ['start', 'ending']), ['doorB needs 1 k but a player who spent k on everything else first has 0']);
  // The mirror image (key 2 behind A) strands a player who opens B first.
  const mirror = { ...keys, key2: { needs: ['doorA'], supplies: { k: 1 } } };
  assert.deepEqual(tableProblems(VL, mirror, ['start', 'ending']), ['doorA needs 1 k but a player who spent k on everything else first has 0']);
  // Both keys in the open: either order works.
  const safe = { ...keys, key2: { needs: ['start'], supplies: { k: 1 } } };
  assert.deepEqual(tableProblems(VL, safe, ['start', 'ending']), []);
  // After an event the check starts from what the worst-case player holds then.
  const later = {
    start: {}, wave: { type: 'event', needs: ['start'] },
    key1: { needs: ['wave'], supplies: { k: 1 } },
    doorA: { needs: ['wave'], consumes: { k: 1 } }, doorB: { needs: ['wave'], consumes: { k: 1 } }, key2: { needs: ['doorB'], supplies: { k: 1 } },
    ending: { needs: ['doorA', 'doorB'] },
  };
  assert.deepEqual(tableProblems(VL, later, ['start', 'wave', 'ending']), ['after wave, doorB needs 1 k but a player who spent k on everything else first has 0']);
});

test('broken: a counter that is both counted and consumed is refused', () => {
  const { VL } = loadGame();
  const rules = {
    start: {}, pages: { needs: ['start'], supplies: { pages: 5 } },
    almanac: { needs: ['start'], consumes: { pages: 5 } }, atlas: { needs: ['start'], count: { pages: 5 } },
    ending: { needs: ['almanac', 'atlas'] },
  };
  assert.deepEqual(tableProblems(VL, rules, ['start', 'ending']), ['counter pages is counted by atlas and consumed by almanac; a counter is one or the other']);
});

test('a place that closes behind the player is modelled as an event, and then its contents are checked', () => {
  const { VL } = loadGame();
  const rules = {
    start: {}, dungeon: { needs: ['start'] }, bossKey: { needs: ['dungeon'] },
    boss: { type: 'event', needs: ['dungeon'], retires: ['dungeon'] },
    ending: { needs: ['boss', 'bossKey'] },
  };
  const problems = tableProblems(VL, rules, ['start', 'boss', 'ending']);
  assert.ok(problems.includes('bossKey is required but unreachable after boss'), problems.join('\n'));
});

test('broken: a beat reachable without the one before it is a sequence break unless the design allows it', () => {
  const { VL } = loadGame();
  const rules = { start: {}, d1: { needs: ['start'] }, d2: { needs: ['start'] }, ending: { needs: ['d1', 'd2'] } };
  assert.deepEqual(tableProblems(VL, rules, ['start', 'd1', 'd2', 'ending']), ['milestone d2 is reachable without d1 (a sequence break; list d1 as skippable in defineMilestones if the design allows it)']);
  assert.deepEqual(tableProblems(VL, rules, ['start', 'd1', 'd2', 'ending'], { skippable: ['d1'] }), []);
  // On the real table: a shop that sells the Lifting Gloves lets the player skip Dungeon 1's gates.
  const table = copyTable(VL);
  table.buyGloves = { ...mk({ buyGloves: { type: 'item', needs: ['shop', 'shells'], gives: ['liftingGloves'], renewable: true } }).buyGloves, doc: '§ Resources and economy: Shop', by: 'W10' };
  const problems = problemsOf(VL, table);
  assert.ok(problems.includes('milestone d1Boss is reachable without liftingGloves (a sequence break; list liftingGloves as skippable in defineMilestones if the design allows it)'), problems.join('\n'));
  assert.ok(problems.includes('milestone liftingGloves is reachable without scriptoriumEntered (a sequence break; list scriptoriumEntered as skippable in defineMilestones if the design allows it)'), 'the gloves beat is met by the bought pair');
  assert.deepEqual([...VL.SKIPPABLE_MILESTONES], ['chestGear', 'lakeIsland', 'shipwreck'], 'the chest can be skipped (the smith sells a sword); the island, the shipwreck and the lighthouse come in any order');
  const unknown = [...VL.solveProgression(copyTable(VL), VL.MILESTONES, { skippable: ['dragon'] }).problems];
  assert.deepEqual(unknown, ['skippable milestone dragon is not a milestone']);
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
  assert.deepEqual(order, [
    'milestone shockwave is listed after raft but is reachable in an earlier stage',
    'milestone shockwave is reachable without raft (a sequence break; list raft as skippable in defineMilestones if the design allows it)',
  ]);
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

test('drive.reload swaps in the app a reload hook returns, and says what is missing without one', () => {
  const { VL } = loadGame();
  const { drive } = createPlaythrough(VL);
  assert.throws(() => drive.reload(), /drive\.reload needs a reload hook \(W2\)/);
  const { playApp } = require('./harness');
  let reloads = 0;
  const reloaded = createPlaythrough(VL, {
    reload(app) {
      reloads += 1;
      const next = playApp(VL);
      next.game = app.game;
      return next;
    },
  });
  const before = reloaded.drive.app;
  reloaded.drive.walkTo({ area: 'hut', screen: '0,0', tx: 7, ty: 5 });
  reloaded.drive.reload();
  assert.equal(reloads, 1);
  assert.notEqual(reloaded.drive.app, before);
  assert.equal(reloaded.drive.state.player.area, 'hut', 'drive.state follows the new app');
  reloaded.drive.press('interact');
});

test('README documents how an item registers locks and playthrough steps', () => {
  const readme = read('README.md');
  for (const word of ['VL.defineLock', 'VL.solveProgression', 'tests/steps/', 'milestones.js', 'renewable', 'loses', 'reached', 'replan', 'VL.splitLock', 'VL.defineResources', 'skippable', 'drive.reload', 'retires']) {
    assert.ok(readme.includes(word), `README mentions ${word}`);
  }
});
