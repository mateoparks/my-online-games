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
  // Every lock in the game is claimed now (W20 claimed the last), so the test plans its own.
  VL.defineLock('fixtureVault', { type: 'place', needs: ['fixtureDoor'], doc: '§ Ending: Confrontation', by: 'W99' });
  assert.equal(VL.LOCKS.fixtureVault.reached, undefined, 'fixtureVault is planned until claimed');
  assert.equal(VL.LOCKS.fixtureVault.by, 'W99');
  const claimed = VL.defineLock('fixtureVault', {
    type: 'place', needs: ['fixtureDoor'],
    doc: '§ Ending: Confrontation', reached: (state) => Boolean(state.flags.fixtureVault),
  });
  assert.equal(VL.LOCKS.fixtureVault, claimed);
  assert.equal(claimed.reached({ flags: { fixtureVault: true } }), true);
  assert.throws(() => VL.defineLock('fixtureVault', { doc: '§ Controls', reached: () => true }), /already implemented/);
});

test('a claim that changes the planned rule must say why (replan), so a loosened gate shows in the diff', () => {
  const { VL } = loadGame();
  // Locks of the test's own, planned and unclaimed.
  VL.defineLock('fixtureVault', { type: 'place', needs: ['fixtureDoor'], doc: '§ Ending: Confrontation', by: 'W99' });
  const planned = { needs: ['fixtureVault', ['woodSword', 'metalSword']], doc: '§ Ending: Confrontation' };
  VL.defineLock('fixtureFight', { ...planned, by: 'W99' });
  assert.throws(() => VL.defineLock('fixtureFight', { ...planned, needs: ['fixtureVault'], reached: () => true }), /fixtureFight is claimed with a different rule than planned \(needs\); say why with replan/);
  assert.throws(() => VL.defineLock('fixtureFight', { ...planned, optional: true, gives: ['view'], reached: () => true }), /than planned \(gives, optional\)/);
  assert.equal(VL.LOCKS.fixtureFight.reached, undefined, 'a refused claim leaves the plan in place');
  // Order inside needs (and inside an any-of) does not count as a change.
  const same = VL.defineLock('fixtureFight', { ...planned, needs: [['metalSword', 'woodSword'], 'fixtureVault'], reached: () => true });
  assert.equal(VL.LOCKS.fixtureFight, same);
  const loosened = VL.defineLock('fixtureVault', { type: 'place', needs: ['town'], doc: '§ Ending: Confrontation', replan: 'the vault opens off the square', reached: () => true });
  assert.equal(loosened.replan, 'the vault opens off the square');
});

test('an item splits a planned placeholder into its own locks without editing milestones.js', () => {
  const { VL } = loadGame();
  // W8 split the real hiddenBooks, so the test splits a placeholder of its own.
  VL.defineLock('fixtureBooks', { type: 'item', needs: ['town', 'library'], supplies: { books: 10 }, optional: true, doc: '§ Books, pages and the library: Hidden books', by: 'W99' });
  assert.deepEqual({ ...VL.LOCKS.fixtureBooks.supplies }, { books: 10 });
  const part = (books) => ({ type: 'item', needs: ['town', 'library'], supplies: { books }, optional: true, doc: '§ Books, pages and the library: Hidden books', reached: () => false });
  assert.throws(() => VL.splitLock('fixtureBooks', { bookUnderRock: part(4), bookInTrunk: part(5) }), /fixtureBooks supplies books 10 but its parts supply 9/);
  assert.throws(() => VL.splitLock('fixtureBooks', { bookUnderRock: part(5), oreWoods: part(5) }), /lock oreWoods already exists/);
  assert.ok(VL.LOCKS.fixtureBooks, 'a refused split leaves the placeholder');
  assert.throws(() => VL.splitLock('start', { a: part(1) }), /start is implemented, not a placeholder/);
  assert.throws(() => VL.splitLock('nothing', { a: part(1) }), /lock nothing does not exist/);
  // A split can only share out the placeholder's counters: it cannot hand out the placeholder's own
  // keys (that would loosen a gate without a replan) or counters the plan never promised.
  VL.defineLock('fixtureHatch', { needs: ['start'], doc: '§ The path through the game, 9', by: 'W99' });
  assert.throws(() => VL.splitLock('fixtureHatch', { stageRoom: { type: 'place', needs: ['start'], gives: ['fixtureHatch'], doc: '§ The path through the game, 9', by: 'W99' } }), /fixtureHatch is not a placeholder \(it supplies no counter\); claim it with defineLock/);
  assert.throws(() => VL.splitLock('fixtureBooks', { bookA: part(5), bookB: { ...part(5), gives: ['fixtureBooks'] } }), /part bookB gives fixtureBooks, which the placeholder stood for; claim it with defineLock and replan/);
  assert.throws(() => VL.splitLock('fixtureBooks', { bookA: part(5), bookB: { ...part(5), supplies: { books: 5, ore: 1 } } }), /part bookB supplies ore, which fixtureBooks does not/);
  VL.splitLock('fixtureBooks', { bookUnderRock: part(4), bookInTrunk: part(6) });
  assert.equal(VL.LOCKS.fixtureBooks, undefined);
  assert.equal(VL.LOCKS.bookInTrunk.supplies.books, 6);
  assert.throws(() => VL.defineLock('fixtureBooks', { ...part(1), reached: () => true }), /lock fixtureBooks was split into its parts/, 'a split id cannot come back with a looser rule');
  VL.defineLock('fixtureOre', { type: 'item', needs: ['start'], supplies: { ore: 1 }, optional: true, doc: '§ Tools: two tiers', by: 'W99' });
  assert.throws(() => VL.splitLock('fixtureOre', { hiddenBooks: { type: 'item', needs: ['start'], supplies: { ore: 1 }, doc: '§ Tools: two tiers', by: 'W99' } }), /lock hiddenBooks was split into its parts/);
  const report = VL.solveProgression();
  assert.deepEqual([...report.problems], []);
  assert.ok(report.stages.some((stage) => stage.reached.includes('swiftfootBoots')), 'the 30-book reward still adds up');
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
  assert.deepEqual(ids.filter((id) => !VL.LOCKS[id].reached), [], 'every lock is implemented (W20 claimed the last)');
  assert.ok(ids.length >= 60, `${ids.length} locks seeded`);
  for (const lock of Object.values(VL.LOCKS)) {
    assert.ok(DESIGN_SECTIONS.some((section) => lock.doc.startsWith(`§ ${section}`)), `${lock.id} cites a design-doc section: ${lock.doc}`);
    if (!lock.reached) assert.match(lock.by, /^W\d+$/, `${lock.id} names its item`);
  }
});

test('milestones are locks in story order, from the start to the ending', () => {
  const { VL } = loadGame();
  assert.deepEqual([...VL.MILESTONES.slice(0, 2)], ['named', 'start']);
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
  assert.equal(Object.keys(VL.LOCKS).length, 138, 'W17 2, W18 7 (W35: 6, no heaps), W30 twelve late books, the moss key and door C, and W19 6 keys and doors');
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
  assert.deepEqual([...VL.progress(state)], ['named', 'start', 'beach']);
  VL.place(state, { area: 'hut', screen: '0,0', tx: 7, ty: 5 });
  assert.deepEqual([...VL.progress(state)], ['named', 'start', 'hutInside', 'beach']);
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
  assert.deepEqual([...report.problems], [], 'a broken table has no stages to inspect');
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
  assert.deepEqual({ ...report.missable }, { bookPrimer: 'primerTaken', worldMap: 'primerTaken' }, 'the Primer is on the shelf until then; afterwards neither the book nor the drawing can be had');
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
  assert.ok(problems.includes('raft is unreachable: needs wood after shockwave'), 'the raft needs wood after the shockwave');
  assert.ok(problems.includes('ending is unreachable: needs marionettes after shockwave'));
  assert.ok(problems.includes('oar is unreachable: needs shells|wood after shockwave'), 'the oar, on sale only after the shockwave, needs wood or shells then');
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
    'a is required but unreachable after b then c',
    'smith is required but unreachable after b then c',
    'ending is required but unreachable after b then c',
    'after b then c, sword cannot be regained',
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

test('broken: a key spent on a door before an event stays spent after it', () => {
  const { VL } = loadGame();
  const milestones = ['start', 'wave', 'ending'];
  // Two keys, either of which opens door 1 before the wave, so neither key is forced on its own.
  // After the wave the last key can be wasted on an optional door 3, and door 2 hides the next key.
  const alternatives = {
    start: { type: 'place' },
    key1: { type: 'item', needs: ['start'], supplies: { k: 1 } }, key2: { type: 'item', needs: ['start'], supplies: { k: 1 } },
    door1: { needs: ['start'], consumes: { k: 1 } }, wave: { type: 'event', needs: ['door1'], gives: ['post'] },
    door2: { needs: ['post'], consumes: { k: 1 } }, key3: { type: 'item', needs: ['door2'], supplies: { k: 1 } },
    door3: { needs: ['post'], consumes: { k: 1 }, optional: true }, ending: { needs: ['door2'] },
  };
  assert.deepEqual(tableProblems(VL, alternatives, milestones), ['after wave, door2 needs 1 k but a player who spent k on everything else first has 0']);
  // The same debt when the door is listed before its only key.
  const doorFirst = {
    start: { type: 'place' },
    door1: { needs: ['start'], consumes: { k: 1 } }, key1: { type: 'item', needs: ['start'], supplies: { k: 1 } },
    wave: { type: 'event', needs: ['door1'], gives: ['post'] },
    door2: { needs: ['post'], consumes: { k: 1 } }, key2: { type: 'item', needs: ['door2'], supplies: { k: 1 } }, ending: { needs: ['door2'] },
  };
  assert.ok(tableProblems(VL, doorFirst, milestones).some((p) => p.startsWith('door2 is unreachable')), 'no key is left for door 2');
  // A key and door used up before the wave ask for nothing after it.
  const usedUp = {
    start: { type: 'place' },
    key1: { type: 'item', needs: ['start'], supplies: { k: 1 } }, door1: { needs: ['start'], consumes: { k: 1 } },
    wave: { type: 'event', needs: ['door1'], gives: ['post'] }, ending: { needs: ['post'] },
  };
  assert.deepEqual(tableProblems(VL, usedUp, milestones), []);
  assert.equal(solveTable(VL, usedUp, milestones).stages[1].counts.k, 0);
});

test('broken: a counter that is both counted and consumed is refused', () => {
  const { VL } = loadGame();
  const rules = {
    start: {}, pages: { needs: ['start'], supplies: { pages: 5 } },
    almanac: { needs: ['start'], consumes: { pages: 5 } }, atlas: { needs: ['start'], count: { pages: 5 } },
    ending: { needs: ['almanac', 'atlas'] },
  };
  assert.deepEqual(tableProblems(VL, rules, ['start', 'ending']), ['counter pages is counted by atlas and consumed by almanac; a counter is one or the other']);
  // Counters are scarce by definition: a place or a renewable source cannot hand them out.
  const place = { start: {}, mine: { type: 'place', needs: ['start'], supplies: { ore: 1 } }, sword: { needs: ['start'], consumes: { ore: 1 } }, ending: { needs: ['sword'] } };
  assert.deepEqual(tableProblems(VL, place, ['start', 'ending']), ['mine is a place but supplies ore; a place is access, not a possession']);
  const renewable = { ...place, mine: { needs: ['start'], supplies: { ore: 1 }, renewable: true } };
  assert.deepEqual(tableProblems(VL, renewable, ['start', 'ending']), ['mine is renewable but supplies ore; a counter is scarce']);
});

test('broken: an optional renewable lock that spends a counter would drain it', () => {
  const { VL } = loadGame();
  // Two keys, one door; a repeatable slot machine that eats a key is refused outright.
  const rules = {
    start: {}, key1: { needs: ['start'], supplies: { k: 1 } }, key2: { needs: ['start'], supplies: { k: 1 } },
    slot: { needs: ['start'], consumes: { k: 1 }, renewable: true, optional: true },
    door: { needs: ['start'], consumes: { k: 1 } }, ending: { needs: ['door'] },
  };
  assert.deepEqual(tableProblems(VL, rules, ['start', 'door', 'ending']), ['slot is optional and renewable but consumes k; a repeatable sink would drain it']);
  // Known limit: a required renewable consumer (re-forging metal gear) is assumed to spend its
  // counter once per stage, so the game must not let it repeat while the player still has the item.
  const forge = { ...rules, slot: { needs: ['start'], consumes: { k: 1 }, renewable: true } };
  assert.deepEqual(tableProblems(VL, forge, ['start', 'door', 'ending']), []);
});

test('a place that closes behind the player is modelled as an event, and then its contents are checked', () => {
  const { VL } = loadGame();
  const rules = {
    start: {}, dungeon: { needs: ['start'] }, bossKey: { needs: ['dungeon'] },
    boss: { type: 'event', needs: ['dungeon'], retires: ['dungeon'] },
    ending: { needs: ['boss', 'bossKey'] },
  };
  const problems = tableProblems(VL, rules, ['start', 'boss', 'ending']);
  assert.deepEqual(problems, ['ending is unreachable: needs bossKey after boss', 'bossKey is required but unreachable after boss'], 'the dungeon itself was forced, so sealing it is not a problem');
  // Written as the README says, with nothing left inside, the recipe is clean.
  const clean = {
    start: {}, dungeon: { type: 'place', needs: ['start'] }, boss: { needs: ['dungeon'] },
    seal: { type: 'event', needs: ['boss'], retires: ['dungeon'] }, ending: { needs: ['seal'] },
  };
  assert.deepEqual(tableProblems(VL, clean, ['start', 'boss', 'seal', 'ending']), []);
  // The inner room is forced (the boss stands in it), but the compass in it is not: once the
  // entrance seals, a player who left the compass behind is stuck. Access is worked out again
  // after every event, so the inner room does not stay "held" through the seal.
  const innerRoom = {
    start: {}, dungeon: { type: 'place', needs: ['start'] }, innerRoom: { type: 'place', needs: ['dungeon'] },
    compass: { type: 'item', needs: ['innerRoom'] }, boss: { needs: ['innerRoom'] },
    seal: { type: 'event', needs: ['boss'], retires: ['dungeon'] },
    door: { needs: ['seal', 'compass'] }, ending: { needs: ['door'] },
  };
  assert.deepEqual(tableProblems(VL, innerRoom, ['start', 'boss', 'seal', 'door', 'ending']), [
    'door is unreachable: needs compass after seal',
    'ending is unreachable: needs door after seal',
    'compass is required but unreachable after seal',
  ]);
  // Marking the dungeon optional (the workaround for a false alarm) must not hide that.
  const optionalDungeon = { ...innerRoom, dungeon: { type: 'place', needs: ['start'], optional: true } };
  assert.ok(tableProblems(VL, optionalDungeon, ['start', 'boss', 'seal', 'door', 'ending']).includes('compass is required but unreachable after seal'));
});

test('broken: access opened by gear an event takes does not stay open', () => {
  const { VL } = loadGame();
  // The boat reaches the island; the only boatyard is on the island; the storm (at home, after the
  // relic) takes the boat. The island was forced, but it is a place, not a possession.
  const boat = {
    start: {}, chest: { type: 'item', needs: ['start'], gives: ['boat'] },
    island: { type: 'place', needs: ['boat'] }, relic: { type: 'item', needs: ['island'] },
    boatyard: { needs: ['island'], gives: ['boat'], renewable: true },
    storm: { type: 'event', needs: ['relic'], loses: ['boat'] },
    cove: { type: 'place', needs: ['storm', 'boat'] }, ending: { needs: ['cove'] },
  };
  const problems = tableProblems(VL, boat, ['start', 'relic', 'storm', 'cove', 'ending']);
  assert.ok(problems.includes('after storm, boat cannot be regained'), problems.join('\n'));
  assert.ok(problems.includes('cove is unreachable: needs boat after storm'));
  assert.ok(!problems.includes('island is required but unreachable after storm'), 'the island was forced before the storm');
  // On the real table: a sword-cut hedge on the east road (W8) and the smith past the Woods (W10).
  // After the shockwave the player has no sword, and the only smith is behind the hedge.
  const table = copyTable(VL);
  table.eastRoad.needs = ['town', 'liftingGloves', ['woodSword', 'metalSword']];
  table.blacksmith.needs = ['woods'];
  const real = problemsOf(VL, table);
  for (const key of ['woodSword', 'metalSword', 'woodShield']) assert.ok(real.includes(`after shockwave, ${key} cannot be regained`), real.join('\n'));
  // W30: the Hollow Oak needs metal gear, so the smithy is forced before the shockwave (like the road).
  assert.ok(!real.includes('blacksmith is required but unreachable after shockwave'), real.join('\n'));
  // The Lighthouse's boss door wants a sword (a swordless kid would be shut in with the crab).
  assert.ok(real.includes('d3BossDoor is unreachable: needs metalSword|woodSword after shockwave'), real.join('\n'));
  assert.ok(!real.includes('eastRoad is required but unreachable after shockwave'), 'the road was forced before the shockwave');
});

test('a renewable source the event needed hands its gear out again afterwards', () => {
  const { VL } = loadGame();
  const rules = {
    start: {}, swordShop: { needs: ['start'], gives: ['sword'], renewable: true },
    boss: { needs: ['sword'] }, wave: { type: 'event', needs: ['boss'], loses: ['sword'] },
    final: { needs: ['wave', 'sword'] }, ending: { needs: ['final'] },
  };
  const report = solveTable(VL, rules, ['start', 'boss', 'wave', 'final', 'ending']);
  assert.deepEqual([...report.problems], []);
  assert.deepEqual([...report.regained.wave], ['sword']);
  assert.ok(!report.stages[1].keys.includes('swordShop'), 'a repeatable action is not a possession');
});

test('broken: retiring a renewable source, or a key one gives, stops it for good', () => {
  const { VL } = loadGame();
  const ferry = {
    start: {}, ferry: { needs: ['start'], renewable: true },
    wave: { type: 'event', needs: ['start'], retires: ['ferry'] },
    island: { type: 'place', needs: ['wave', 'ferry'] }, ending: { needs: ['island'] },
  };
  assert.deepEqual(tableProblems(VL, ferry, ['start', 'wave', 'island', 'ending']), [
    'island is unreachable: needs ferry after wave',
    'ending is unreachable: needs island after wave',
    'ferry is required but unreachable after wave',
  ]);
  const ticket = {
    start: {}, ferryOffice: { needs: ['start'], gives: ['ferryTicket'], renewable: true },
    wave: { type: 'event', needs: ['start'], retires: ['ferryTicket'] },
    island: { type: 'place', needs: ['wave', 'ferryTicket'] }, ending: { needs: ['island'] },
  };
  const problems = tableProblems(VL, ticket, ['start', 'wave', 'island', 'ending']);
  assert.ok(problems.includes('island is unreachable: needs ferryTicket after wave'), problems.join('\n'));
  // A retired key is gone even for a player who never collected its one-time source: on the real
  // table the Primer book itself cannot be found and returned once the thief has taken it.
  const report = VL.solveProgression();
  assert.ok(report.stages[2].disabled.includes('bookPrimer'));
  assert.equal(report.missable.bookPrimer, 'primerTaken');
});

test('broken: a beat reachable without the one before it is a sequence break unless the design allows it', () => {
  const { VL } = loadGame();
  const rules = { start: {}, d1: { needs: ['start'] }, d2: { needs: ['start'] }, ending: { needs: ['d1', 'd2'] } };
  assert.deepEqual(tableProblems(VL, rules, ['start', 'd1', 'd2', 'ending']), ['milestone d2 is reachable without d1 (a sequence break; list d1 as skippable in defineMilestones if the design allows it)']);
  assert.deepEqual(tableProblems(VL, rules, ['start', 'd1', 'd2', 'ending'], { skippable: ['d1'] }), []);
  // A skippable beat does not exempt the beat after it: that one is gated by the nearest beat that
  // is not skippable.
  const chain = { start: {}, a: { needs: ['start'] }, b: { needs: ['a'] }, c: { needs: ['start'] }, ending: { needs: ['c', 'b'] } };
  assert.deepEqual(tableProblems(VL, chain, ['start', 'a', 'b', 'c', 'ending'], { skippable: ['b'] }), ['milestone c is reachable without a (a sequence break; list a as skippable in defineMilestones if the design allows it)']);
  assert.deepEqual(tableProblems(VL, { ...chain, c: { needs: ['a'] } }, ['start', 'a', 'b', 'c', 'ending'], { skippable: ['b'] }), []);
  // On the real table: a shop that sells the Lifting Gloves lets the player skip Dungeon 1's gates.
  const table = copyTable(VL);
  table.buyGloves = { ...mk({ buyGloves: { type: 'item', needs: ['shop', 'shells'], gives: ['liftingGloves'], renewable: true } }).buyGloves, doc: '§ Resources and economy: Shop', by: 'W10' };
  const problems = problemsOf(VL, table);
  assert.ok(problems.includes('milestone d1Boss is reachable without liftingGloves (a sequence break; list liftingGloves as skippable in defineMilestones if the design allows it)'), problems.join('\n'));
  assert.ok(problems.includes('milestone liftingGloves is reachable without scriptoriumEntered (a sequence break; list scriptoriumEntered as skippable in defineMilestones if the design allows it)'), 'the gloves beat is met by the bought pair');
  assert.deepEqual([...VL.SKIPPABLE_MILESTONES], ['chestGear', 'raft', 'lakeIsland', 'shipwreck'], 'the chest can be skipped (the smith sells a sword); the island, the shipwreck and the lighthouse come in any order');
  // The lighthouse is gated by the shockwave (the Glowstone), not by the raft: with the raft a
  // gate, the transitive check reports the lighthouse as a sequence break.
  const raftGates = [...VL.solveProgression(copyTable(VL), VL.MILESTONES, { skippable: ['chestGear', 'lakeIsland', 'shipwreck'] }).problems];
  assert.deepEqual(raftGates, ['milestone lighthouseEntered is reachable without raft (a sequence break; list raft as skippable in defineMilestones if the design allows it)']);
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
  assert.ok(problems.includes('scriptoriumKey is unreachable: needs d1Boss'), problems.join('\n'));
  assert.ok(problems.includes('scriptoriumEntered is unreachable: needs scriptoriumKey'));
  assert.ok(problems[0].includes('is unreachable: needs '));
  assert.ok(problems.includes('ending is unreachable: needs marionettes'));
  // Root causes come first; the ore-spending fallout of the broken path comes after.
  const firstSpend = problems.findIndex((text) => text.includes('spent ore'));
  const lastUnreachable = problems.findLastIndex((text) => text.includes('is unreachable'));
  assert.ok(firstSpend === -1 || firstSpend > lastUnreachable, problems.join('\n'));
});

test('broken: a sixth page, a dangling key and a counter nothing supplies are reported', () => {
  const { VL } = loadGame();
  const table = copyTable(VL);
  table.climbersAlmanac.count = { pages: 6 };
  assert.ok(problemsOf(VL, table).includes('climbersAlmanac is unreachable: needs pages 6 (5 found) after shockwave then primerTaken'));
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
  const gated = [...VL.solveProgression(copyTable(VL), milestones, { skippable: ['chestGear', 'lakeIsland', 'shipwreck'] }).problems];
  assert.ok(gated.includes('milestone shockwave is reachable without raft (a sequence break; list raft as skippable in defineMilestones if the design allows it)'), gated.join('\n'));
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
  assert.ok(drivable.length >= 2 && drivable[0] === 'named' && drivable[1] === 'start', 'steps start at the title');
  const gap = VL.MILESTONES[drivable.length];
  if (gap) assert.equal(VL.LOCKS[gap].reached, undefined, `implemented milestone ${gap} has no playthrough steps`);
  // W20: the steps cover every milestone, so the real game is played from the title to the credits.
  assert.deepEqual(drivable, [...VL.MILESTONES], 'the playthrough reaches the ending');
  const drive = play.playTo(drivable.at(-1));
  assert.ok(VL.progress(drive.state).includes(drivable.at(-1)));
  assert.equal(drive.state.finished, true, 'the game is finished');
});

test('playthrough: a step that does not reach its milestone fails, and steps are registered once', () => {
  const { VL } = loadGame();
  const steps = { start() {}, hutInside() {} };
  const play = createPlaythrough(VL, { milestones: ['start', 'hutInside'], steps });
  assert.throws(() => play.playTo('hutInside'), /milestone hutInside was not reached/);
  const good = createPlaythrough(VL, {
    milestones: ['start', 'hutInside'],
    // The lantern saves the visit, so it survives the reload after the step.
    steps: { start() {}, hutInside: (drive) => drive.walkTo({ area: 'hut', screen: '0,0', tx: 2, ty: 2 }) },
  });
  assert.equal(good.playTo('hutInside').state.player.area, 'hut');
  VL.defineLock('fixtureVault', { type: 'place', needs: ['start'], doc: '§ Ending: Confrontation', by: 'W99' });
  const planned = createPlaythrough(VL, { milestones: ['start', 'fixtureVault'], steps: { start() {}, fixtureVault() {} } });
  assert.throws(() => planned.playTo('fixtureVault'), /fixtureVault is planned/);
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
  const shipped = VL.reloadApp;
  delete VL.reloadApp;
  assert.throws(() => drive.reload(), /drive\.reload needs a reload hook \(W2\)/);
  VL.reloadApp = shipped;
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
  for (const word of ['VL.defineLock', 'VL.solveProgression', 'tests/steps/', 'milestones.js', 'renewable', 'loses', 'reached', 'replan', 'VL.splitLock', 'VL.defineResources', 'skippable', 'drive.reload', 'retires', '...VL.LOCKS.woodSword', 'Known limits']) {
    assert.ok(readme.includes(word), `README mentions ${word}`);
  }
});
