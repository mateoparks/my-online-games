// The overworld map (W8): regions, spots, edges, reachability against the
// progression table, the Woods route, and a render smoke of every screen.
const assert = require('node:assert/strict');
const { test, read, loadGame, fakeDocument } = require('./harness');
const { createPlaythrough } = require('./playthrough');

const AREA = 'overworld';
const FLIGHT_KEYS = ['chickenFlightShort', 'chickenFlightLong'];
const HOWS = ['door', 'trunk', 'bush', 'rock', 'buried', 'pickup', 'chicken', 'stage', 'trapdoor'];

// Keys that open tiles or regions, read from the map: gate tiles, rocks
// (gloves), deep water (the raft), soft gates and chicken flight.
function gateKeys(VL) {
  const keys = new Set(FLIGHT_KEYS);
  for (const info of Object.values(VL.TILESETS.base)) {
    if (info.gate) keys.add(info.gate);
    if (info.rock) keys.add('liftingGloves');
    if (info.water) keys.add('rafting');
  }
  for (const region of Object.values(VL.REGIONS)) if (region.softGate) keys.add(region.softGate);
  return [...keys];
}

const shared = loadGame().VL;
// Gap widths a flight clears, read from the game (README "Flight contract"),
// so W7 retuning them is checked against the map.
const FLIGHT = Object.fromEntries(FLIGHT_KEYS.map((key) => [key, shared.TUNING[key]]));
const GATES = gateKeys(shared);

function world(VL) {
  const { cols, rows } = VL.TUNING;
  const screens = VL.AREAS[AREA].screens;
  const at = (gx, gy) => {
    const sx = Math.floor(gx / cols);
    const sy = Math.floor(gy / rows);
    const key = `${sx},${sy}`;
    if (!screens[key]) return null;
    const tx = gx - sx * cols;
    const ty = gy - sy * rows;
    return { key, tx, ty, info: VL.tileInfo(AREA, screens[key].tiles[ty][tx]) };
  };
  const global = (key, tx, ty) => {
    const [sx, sy] = key.split(',').map(Number);
    return [sx * cols + tx, sy * rows + ty];
  };
  return { at, global };
}

// One step of the hero with `keys`: walking, cutting bushes, lifting rocks
// (gloves), rafting deep water and gliding with a chicken over flyOver tiles
// (water, chasms). `launch` is where a flight may start: null means anywhere
// (a chicken can be carried; the worst case for a sequence break). `blocked`
// regions are impassable.
function moves(VL, keys, { blocked = [], launch = null, flight: maxFlight = Infinity } = {}) {
  const have = new Set(keys);
  const { at } = world(VL);
  const closed = new Set(blocked.flatMap((id) => VL.REGIONS[id].screens));
  const passable = (t) => Boolean(t) && !closed.has(t.key) && (
    !t.info.solid || t.info.cuttable || (t.info.gate && have.has(t.info.gate))
    || (t.info.rock && have.has('liftingGloves')) || (t.info.water && have.has('rafting')));
  // A soft gate (the Woods' map, W15) lets anyone onto the region's edge
  // and turns back every step from one of its screens to another.
  const entering = (from, to) => {
    const region = VL.regionOf(AREA, to.key);
    const gate = region && VL.REGIONS[region].softGate;
    return !gate || from.key === to.key || VL.regionOf(AREA, from.key) !== region || have.has(gate);
  };
  const longest = Math.min(maxFlight, Math.max(0, ...Object.entries(FLIGHT).filter(([key]) => have.has(key)).map(([, n]) => n)));
  return (gx, gy) => {
    const here = at(gx, gy);
    const flight = !launch || launch.has(`${gx},${gy}`) ? longest : 0;
    const out = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (let n = 1; n <= flight + 1; n += 1) {
        const next = at(gx + dx * n, gy + dy * n);
        if (!next) break;
        if (passable(next)) {
          if (entering(here, next)) out.push([gx + dx * n, gy + dy * n]);
          break;
        }
        if (!next.info.flyOver || n > flight) break;
      }
    }
    return out;
  };
}

function flood(starts, step) {
  const seen = new Set(starts.map((xy) => xy.join(',')));
  const queue = starts.slice();
  while (queue.length) {
    const [gx, gy] = queue.shift();
    for (const [nx, ny] of step(gx, gy)) {
      const id = `${nx},${ny}`;
      if (!seen.has(id)) {
        seen.add(id);
        queue.push([nx, ny]);
      }
    }
  }
  return seen;
}

// Tiles a chicken can be carried to on foot from its spot: with
// `chickens: 'spots'`, the only places a flight can start.
function chickenLaunches(VL, keys, blocked) {
  const { global } = world(VL);
  const chickens = Object.values(VL.SPOTS).filter((spot) => spot.area === AREA && spot.how === 'chicken');
  return flood(chickens.map((spot) => global(spot.screen, spot.x, spot.y)), moves(VL, keys, { blocked, flight: 0 }));
}

// Every tile the hero can stand on with `keys`, from the start.
function reach(VL, keys = [], { blocked = [], chickens = 'anywhere' } = {}) {
  const { global } = world(VL);
  const launch = chickens === 'spots' ? chickenLaunches(VL, keys, blocked) : null;
  const step = moves(VL, keys, { blocked, launch });
  const start = global(VL.START.screen, VL.START.tx, VL.START.ty);
  const seen = flood([start], step);
  return {
    has: (key, tx, ty) => seen.has(global(key, tx, ty).join(',')),
    near: (key, tx, ty) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has(global(key, tx + dx, ty + dy).join(','))),
    screen: (key) => {
      for (let ty = 0; ty < VL.TUNING.rows; ty += 1) for (let tx = 0; tx < VL.TUNING.cols; tx += 1) if (seen.has(global(key, tx, ty).join(','))) return true;
      return false;
    },
    size: seen.size,
    seen,
    step,
    start,
  };
}

// Everything a lock transitively needs (all any-of alternatives, through
// every lock that gives a key): what a player holds once the lock is open.
function allNeeds(VL, id) {
  const givers = {};
  for (const lock of Object.values(VL.LOCKS)) for (const key of [lock.id, ...lock.gives]) (givers[key] ||= []).push(lock);
  const out = new Set();
  const visit = (key) => {
    if (out.has(key)) return;
    out.add(key);
    for (const lock of givers[key] || []) lock.needs.flat().forEach(visit);
  };
  VL.LOCKS[id].needs.flat().forEach(visit);
  return out;
}

// What stands physically between the start and a lock: gate keys and outdoor
// places, followed through outdoor places only. A building or dungeon is
// entered by its door spot, so what it needs (the library for a book) says
// nothing about where on the map the thing lies.
function physicalNeeds(VL, needs) {
  const doors = new Set(Object.values(VL.SPOTS).filter((spot) => spot.how === 'door').map((spot) => spot.lock));
  const gates = new Set();
  const places = new Set();
  const walk = (list) => {
    for (const entry of list) {
      if (Array.isArray(entry)) continue;
      if (GATES.includes(entry)) gates.add(entry);
      const lock = VL.LOCKS[entry];
      if (lock?.type !== 'place' || doors.has(entry) || places.has(entry)) continue;
      places.add(entry);
      walk(lock.needs);
    }
  };
  walk(needs);
  return { gates: [...gates], places: [...places] };
}

const regionOfPlace = (VL, place) => Object.values(VL.REGIONS).find((region) => region.place === place);

// The lock opens exactly when its location does: reachable with the gate keys
// the table gives by then, and out of reach (even holding every other gate
// key) without any one of the gates or places between it and the start.
// `uncovers` are keys that open the find itself rather than the way to it
// (the gloves lift the rock a book is under).
function checkLocation(VL, label, lockId, reached, uncovers = []) {
  const problems = [];
  const lock = VL.LOCKS[lockId];
  const held = GATES.filter((key) => allNeeds(VL, lockId).has(key));
  if (!reached(reach(VL, held))) problems.push(`${label} (${lockId}) is out of reach with [${held}]`);
  const { gates, places } = physicalNeeds(VL, lock.needs);
  for (const gate of gates.filter((key) => !uncovers.includes(key))) {
    if (reached(reach(VL, GATES.filter((key) => key !== gate)))) problems.push(`${label} (${lockId}) is reachable without ${gate}`);
  }
  for (const place of places) {
    const region = regionOfPlace(VL, place);
    if (region && !region.screens.includes(VL.START.screen) && reached(reach(VL, GATES, { blocked: [region.id] }))) {
      problems.push(`${label} (${lockId}) is reachable without passing through ${region.id}`);
    }
  }
  return problems;
}

// ---------- the map ----------

test('flight lengths are whole tiles read from VL.TUNING (README "Flight contract")', () => {
  for (const key of FLIGHT_KEYS) assert.ok(Number.isInteger(FLIGHT[key]) && FLIGHT[key] > 0, `VL.TUNING.${key} = ${FLIGHT[key]}`);
});

test('the overworld has 30–45 screens, each in exactly one region', () => {
  const VL = shared;
  const keys = Object.keys(VL.AREAS[AREA].screens);
  assert.ok(keys.length >= 30 && keys.length <= 45, `${keys.length} screens`);
  for (const key of keys) assert.ok(VL.regionOf(AREA, key), `${key} is in a region`);
  for (const region of Object.values(VL.REGIONS)) {
    for (const key of region.screens) assert.ok(VL.screenExists(region.area, key), `${region.id} ${key} exists`);
    if (region.place) assert.ok(VL.LOCKS[region.place]?.type === 'place', `${region.id} opens the place lock ${region.place}`);
  }
  for (const id of ['beach', 'canyon', 'cliffs', 'eastRoad', 'highlands', 'homeFields', 'lake', 'shipwreck', 'town', 'woods']) assert.ok(VL.REGIONS[id], `region ${id}`);
});

test('no open tile on a screen edge leads off the world', () => {
  const VL = shared;
  const { cols, rows } = VL.TUNING;
  const problems = [];
  for (const key of Object.keys(VL.AREAS[AREA].screens)) {
    for (const [dx, dy, count, pick] of [[1, 0, rows, (i) => [cols - 1, i]], [-1, 0, rows, (i) => [0, i]], [0, 1, cols, (i) => [i, rows - 1]], [0, -1, cols, (i) => [i, 0]]]) {
      if (VL.screenExists(AREA, VL.neighborKey(key, dx, dy))) continue;
      for (let i = 0; i < count; i += 1) {
        const [tx, ty] = pick(i);
        if (!VL.tileInfo(AREA, VL.getScreen(AREA, key).tiles[ty][tx]).solid) problems.push(`${key} (${tx},${ty})`);
      }
    }
  }
  assert.deepEqual(problems, []);
});

test('with every key, every open tile of the overworld can be reached from the hut', () => {
  const VL = shared;
  const everything = reach(VL, GATES);
  const stranded = [];
  for (const [key, screen] of Object.entries(VL.AREAS[AREA].screens)) {
    screen.tiles.forEach((row, ty) => [...row].forEach((ch, tx) => {
      if (!VL.tileInfo(AREA, ch).solid && !everything.has(key, tx, ty)) stranded.push(`${key} (${tx},${ty})`);
    }));
  }
  assert.deepEqual(stranded, []);
});

test('each region opens with exactly the keys and places its lock needs', () => {
  const VL = shared;
  const problems = [];
  for (const region of Object.values(VL.REGIONS)) {
    // A soft-gated region's place is its heart (the Woods: the Hollow Oak's
    // clearing); its edge is open to all.
    const heart = region.softGate && VL.LOCKS[region.place]?.place;
    const inRegion = (r) => (heart ? r.screen(heart.screen) : region.screens.some((key) => r.screen(key)));
    if (!region.place) {
      if (!inRegion(reach(VL, GATES))) problems.push(`${region.id} is out of reach`);
      continue;
    }
    problems.push(...checkLocation(VL, `region ${region.id}`, region.place, inRegion));
  }
  assert.deepEqual(problems, []);
});

test('the gates hold: boulders, the hidden path, the lake island, the chasms, the Woods', () => {
  const VL = shared;
  const bare = reach(VL, ['chickenFlightShort']);
  assert.ok(bare.screen('4,0') && !bare.screen('5,0'), 'the canyon boulders stop the east road');
  assert.ok(!bare.has('-1,-2', 10, 3), 'the ledge is above the hidden path');
  assert.ok(!reach(VL, ['climbersAlmanac', 'chickenFlightShort']).screen('-1,-3'), 'a short flight falls short of the highlands');
  assert.ok(reach(VL, ['climbersAlmanac', 'chickenFlightLong']).screen('-1,-5'), 'long flights cross every chasm up to the lair');
  const noRaft = reach(VL, GATES.filter((key) => key !== 'rafting'));
  assert.ok(!noRaft.has('3,-3', 7, 4), 'the island is more than a long flight from every shore');
  assert.ok(!noRaft.screen('5,2'), 'the wreck too');
  const noMap = reach(VL, GATES.filter((key) => key !== 'woodsMapCopy'));
  assert.deepEqual([...VL.REGIONS.woods.screens.filter((key) => noMap.screen(key))], ['5,-1'], 'without the copied map, only the edge of the Woods');
});

// ---------- spots ----------

test('spots sit on tiles that fit how they are found, and name real locks', () => {
  const VL = shared;
  const problems = [];
  for (const spot of Object.values(VL.SPOTS)) {
    const info = VL.tileInfo(spot.area, VL.getScreen(spot.area, spot.screen).tiles[spot.y][spot.x]);
    const lock = spot.lock && VL.LOCKS[spot.lock];
    if (spot.lock && !lock) problems.push(`${spot.id}: no lock ${spot.lock}`);
    if (!HOWS.includes(spot.how)) problems.push(`${spot.id}: how ${spot.how}`);
    const needs = lock ? lock.needs : [];
    const fits = {
      rock: info.rock && needs.includes('liftingGloves'),
      bush: info.cuttable,
      buried: info.sand && needs.some((entry) => Array.isArray(entry) && entry.includes('woodShovel')),
      stage: info.stage,
      trapdoor: info.trapdoor && !info.solid,
    }[spot.how] ?? !info.solid;
    if (!fits) problems.push(`${spot.id} (${spot.how}) on '${VL.getScreen(spot.area, spot.screen).tiles[spot.y][spot.x]}' at ${spot.screen} (${spot.x},${spot.y})`);
  }
  assert.deepEqual(problems, []);
  assert.deepEqual([...VL.unplacedFills()], []);
});

test('every spot is reachable once its lock\'s needs are, and not before', () => {
  const VL = shared;
  const problems = [];
  for (const spot of Object.values(VL.SPOTS).filter((s) => s.area === AREA)) {
    const reached = (r) => r.near(spot.screen, spot.x, spot.y);
    if (!spot.lock) {
      if (!reached(reach(VL, GATES))) problems.push(`${spot.id} is out of reach`);
      continue;
    }
    problems.push(...checkLocation(VL, `spot ${spot.id}`, spot.lock, reached, spot.how === 'rock' ? ['liftingGloves'] : []));
  }
  assert.deepEqual(problems, []);
});

// R1: flights start only where a chicken lives (its spot, and wherever it can
// be carried from there on foot), so every flight in has a flight back.
test('nowhere is one-way: from every tile you can reach, you can get back to the hut', () => {
  const VL = shared;
  const problems = [];
  for (let mask = 0; mask < 1 << GATES.length; mask += 1) {
    const keys = GATES.filter((_, i) => mask & (1 << i));
    const r = reach(VL, keys, { chickens: 'spots' });
    const back = new Map();
    for (const id of r.seen) {
      const [gx, gy] = id.split(',').map(Number);
      for (const [nx, ny] of r.step(gx, gy)) {
        const to = `${nx},${ny}`;
        if (!back.has(to)) back.set(to, []);
        back.get(to).push(id);
      }
    }
    const home = new Set([r.start.join(',')]);
    const queue = [r.start.join(',')];
    while (queue.length) for (const from of back.get(queue.shift()) || []) if (!home.has(from)) home.add(from) && queue.push(from);
    const stuck = [...r.seen].filter((id) => !home.has(id));
    if (stuck.length) problems.push(`[${keys}]: ${stuck.length} tiles, e.g. ${stuck[0]}`);
  }
  assert.deepEqual(problems, []);
});

test('the highlands and the lair are reachable with chickens only at their spots', () => {
  const VL = shared;
  const r = reach(VL, GATES, { chickens: 'spots' });
  for (const key of VL.REGIONS.highlands.screens) assert.ok(r.screen(key), key);
  assert.ok(!reach(VL, GATES.filter((key) => key !== 'chickenFlightLong'), { chickens: 'spots' }).screen('-1,-3'));
});

test('the design\'s placements: books, pages, hearts, ore, entrances and town doors', () => {
  const VL = shared;
  const locks = new Set(Object.values(VL.SPOTS).map((spot) => spot.lock));
  const generic = Object.values(VL.LOCKS).filter((lock) => lock.doc === '§ Books, pages and the library: Hidden books');
  assert.equal(generic.length, 10, 'hiddenBooks is split into ten books');
  for (const id of [
    ...generic.map((lock) => lock.id),
    'hiddenBookSealed', 'bookHerbalist', 'bookTideTables', 'bookSmithsLedger', 'bookPrimer', 'bookDragons', 'bookChickenAlmanac',
    'pageFieldA', 'pageFieldB', 'heartFieldA', 'heartFieldB',
    'scriptoriumEntered', 'hollowOakEntered', 'lighthouseEntered', 'dragonsLairEntered', 'shipwreck',
    'library', 'shop', 'paperMill', 'bindery', 'blacksmith', 'puppetStage', 'trapdoorOpen', 'chickens', 'lostChicken',
  ]) assert.ok(locks.has(id), `${id} has a spot`);
  // Pages, hearts and the Woods ore are W8's claims, reached once picked up
  // at their spot. A book only counts once returned (W11), a titled one once read.
  const state = VL.newGame();
  for (const id of ['pageFieldA', 'pageFieldB', 'heartFieldA', 'heartFieldB', 'oreWoods']) {
    assert.equal(VL.LOCKS[id].reached(state), false, id);
    VL.markFound(state, id);
    assert.equal(VL.LOCKS[id].reached(state), true, id);
  }
  for (const lock of [...generic, ...['hiddenBookSealed', 'bookChickenAlmanac', 'bookPrimer'].map((id) => VL.LOCKS[id])]) {
    assert.equal(lock.by, 'W11', `${lock.id} is W11's`);
    const game = VL.newGame();
    VL.markFound(game, lock.id);
    assert.equal(lock.reached(game), false, `${lock.id} found is not yet returned`);
    VL.returnBooks(game);
    VL.finishReading(game, lock.id);
    assert.equal(lock.reached(game), true, `${lock.id} returned`);
  }
});

test('ore: three lumps on the map, two before the shockwave and the island\'s after', () => {
  const VL = shared;
  const ore = Object.values(VL.SPOTS).filter((spot) => VL.LOCKS[spot.lock]?.supplies.ore).map((spot) => spot.lock).sort();
  assert.deepEqual(ore, ['oreLakeIsland', 'oreShallows', 'oreWoods']);
  const [before] = VL.solveProgression().stages;
  assert.ok(before.reached.includes('oreShallows') && before.reached.includes('oreWoods'));
  assert.ok(!before.reached.includes('oreLakeIsland'));
  assert.equal(VL.SPOTS.oreShallows.screen, VL.START.screen, 'the first lump glints right by the hut');
});

test('three berry bushes, and one is reachable from the start with nothing', () => {
  const VL = shared;
  const bushes = [];
  for (const [key, screen] of Object.entries(VL.AREAS[AREA].screens)) {
    screen.tiles.forEach((row, ty) => [...row].forEach((ch, tx) => {
      if (VL.tileInfo(AREA, ch).berry) bushes.push([key, tx, ty]);
    }));
  }
  assert.equal(bushes.length, 3);
  const bare = reach(VL);
  assert.ok(bushes.some(([key, tx, ty]) => bare.near(key, tx, ty)), 'berryBush needs only the start');
  assert.deepEqual([...VL.LOCKS.berryBush.needs], ['start']);
});

test('fillSpot swaps a marker for the real entity, whichever loads first', () => {
  const { VL } = loadGame();
  VL.fillSpot('early', { type: 'door', to: { area: 'hut', screen: '0,0', tx: 7, ty: 8 } });
  assert.deepEqual([...VL.unplacedFills()], ['early']);
  const tiles = Array(11).fill('................');
  VL.addScreens('probe', { '0,0': { tiles, entities: [{ type: 'spot', id: 'early', x: 2, y: 3, how: 'door', by: 'W10' }, { type: 'spot', id: 'late', x: 4, y: 5, how: 'trunk', by: 'W11' }] } });
  assert.ok(VL.unfilledSpots().includes('late') && !VL.unfilledSpots().includes('early'));
  VL.fillSpot('late', { type: 'decor', art: 'well' });
  assert.ok(!VL.unfilledSpots().includes('late'));
  const entities = VL.getScreen('probe', '0,0').entities;
  assert.deepEqual(entities.map((e) => [e.type, e.x, e.y, e.spot]), [['door', 2, 3, 'early'], ['decor', 4, 5, 'late']]);
  assert.deepEqual([...VL.unplacedFills()], []);
  assert.throws(() => VL.fillSpot('late', { type: 'door' }), /spot late is already filled/);
  assert.throws(() => VL.addScreens('probe', { '1,0': { tiles, entities: [{ type: 'spot', id: 'late', x: 1, y: 1, by: 'W5' }] } }), /spot late is already placed/);
  assert.throws(() => VL.addScreens('probe', { '2,0': { tiles, entities: [{ type: 'spot', id: 'orphan', x: 1, y: 1 }] } }), /spot orphan must name the item that fills it/);
  assert.throws(() => VL.defineRegion('again', { area: 'overworld', screens: ['2,0'] }), /screen overworld 2,0 is already in region town/);
});

// ---------- the Woods ----------

test('the Woods: one route from the east road to the Hollow Oak, and a dead end with the ore', () => {
  const VL = shared;
  const { at, global } = world(VL);
  const woods = new Set(VL.REGIONS.woods.screens);
  const [ex, ey] = global('5,-1', 6, 10);
  const prev = new Map([[`${ex},${ey}`, null]]);
  const queue = [[ex, ey]];
  while (queue.length) {
    const [gx, gy] = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = at(gx + dx, gy + dy);
      const id = `${gx + dx},${gy + dy}`;
      if (!next || next.info.solid || !woods.has(next.key) || prev.has(id)) continue;
      prev.set(id, `${gx},${gy}`);
      queue.push([gx + dx, gy + dy]);
    }
  }
  const door = global('7,-2', VL.SPOTS.hollowOakDoor.x, VL.SPOTS.hollowOakDoor.y).join(',');
  assert.ok(prev.has(door), 'the Hollow Oak is reachable through the maze');
  const screens = [];
  for (let id = door; id; id = prev.get(id)) {
    const [gx, gy] = id.split(',').map(Number);
    const { key } = at(gx, gy);
    if (screens[0] !== key) screens.unshift(key);
  }
  assert.deepEqual(screens, [...VL.WOODS_ROUTE]);
  assert.equal(VL.SPOTS.oreWoods.screen, '6,-1');
  const ore = global('6,-1', VL.SPOTS.oreWoods.x, VL.SPOTS.oreWoods.y).join(',');
  assert.ok(prev.has(ore), 'the ore is in the maze');
  let onRoute = false;
  for (let id = door; id; id = prev.get(id)) if (id === ore) onRoute = true;
  assert.equal(onRoute, false, 'the ore is off the route');
});

test('the Woods: each wrong exit winds back to the route, never further in, within two screens', () => {
  const VL = shared;
  const { at, global } = world(VL);
  const route = VL.WOODS_ROUTE;
  const side = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };
  const loopScreens = new Set();
  for (const exit of VL.WOODS_WRONG_EXITS) {
    const first = VL.neighborKey(exit.from, ...side[exit.side]);
    assert.equal(VL.regionOf(AREA, first), 'woods', `${exit.from} ${exit.side} leads into the Woods`);
    assert.ok(!route.includes(first), `${first} is off the route`);
    assert.ok(route.indexOf(exit.back) <= route.indexOf(exit.from), `${exit.from} loops back, not ahead`);
    const starts = [];
    for (let ty = 0; ty < VL.TUNING.rows; ty += 1) for (let tx = 0; tx < VL.TUNING.cols; tx += 1) if (!at(...global(first, tx, ty)).info.solid) starts.push(global(first, tx, ty));
    const visited = new Set();
    const touched = new Set();
    flood(starts, (gx, gy) => {
      visited.add(at(gx, gy).key);
      const out = [];
      for (const [dx, dy] of Object.values(side)) {
        const next = at(gx + dx, gy + dy);
        if (!next || next.info.solid) continue;
        if (route.includes(next.key)) touched.add(next.key);
        else out.push([gx + dx, gy + dy]);
      }
      return out;
    });
    assert.deepEqual([...touched].sort(), [...new Set([exit.from, exit.back])].sort(), `${exit.from} ${exit.side}`);
    assert.ok(visited.size <= 2, `${exit.from} ${exit.side} winds through ${[...visited]}`);
    visited.forEach((key) => loopScreens.add(key));
  }
  const offRoute = [...VL.REGIONS.woods.screens].filter((key) => !route.includes(key));
  assert.deepEqual([...loopScreens].sort(), offRoute.sort(), 'every off-route Woods screen is a wrong turn');
});

// ---------- drawing and walking ----------

test('render smoke: every overworld screen draws on a fake canvas, every tile styled', () => {
  const { VL, document } = loadGame();
  const ctx = document.createElement('canvas').getContext('2d');
  for (const region of Object.values(VL.REGIONS)) {
    for (const key of region.screens) {
      const before = ctx.calls.fillRect || 0;
      VL.drawScreen(ctx, AREA, key, 0, 0, 0);
      VL.drawScreen(ctx, AREA, key, 0, 0, 1.7);
      assert.ok((ctx.calls.fillRect || 0) - before > 400, `${region.id} ${key} draws`);
      for (const row of VL.getScreen(AREA, key).tiles) {
        for (const ch of row) assert.notEqual(VL.ART.tileStyleFor(VL.tileInfo(AREA, ch)).name, 'missing', `${key} '${ch}'`);
      }
      for (const entity of VL.getScreen(AREA, key).entities.filter((e) => e.type === 'decor')) assert.ok(VL.DECOR[entity.art], `decor ${entity.art}`);
    }
  }
  assert.ok(Object.keys(VL.DECOR).length >= 10);
});

test('the hero walks with real input from the hut to every region open today', () => {
  const { VL } = loadGame();
  const { drive } = createPlaythrough(VL);
  // A page on the way opens its popup (W11); this walk is about the paths.
  for (const id of ['pageFieldA', 'pageFieldB']) VL.markFound(drive.state, id);
  const stops = [
    { screen: '2,0', tx: 3, ty: 4 }, // the trapdoor's edge, town square
    { screen: '2,-3', tx: 8, ty: 7 }, // the lake shore
    { screen: '5,1', tx: 12, ty: 6 }, // the far tide pools
    { screen: '4,0', tx: 3, ty: 5 }, // the canyon, up to the boulders
    { screen: '-1,1', tx: 7, ty: 5 }, // the lighthouse door
    { screen: '-1,-2', tx: 10, ty: 6 }, // where the trail ends under the hidden path
  ];
  for (const stop of stops) {
    drive.walkTo({ area: AREA, ...stop });
    assert.equal(drive.state.player.screen, stop.screen);
  }
});

test('with the gates opened, the hero walks through the Woods maze and up to the lair', () => {
  const { VL } = loadGame();
  // Stand-ins for W14's gloves, W19's Almanac and W7's flight: open the gate tiles.
  for (const ch of ['O', 'h', 'V']) VL.TILESETS.base[ch].solid = false;
  const { drive } = createPlaythrough(VL);
  drive.state.items.woodsMapCopy = true;
  drive.state.popups.seen.woodsWithMap = true;
  drive.walkTo({ area: AREA, screen: '7,-2', tx: 7, ty: 4 });
  drive.walkTo({ area: AREA, screen: '-1,-5', tx: 7, ty: 5 });
  assert.equal(drive.state.player.screen, '-1,-5');
});

test('README documents the overworld map, regions and spots', () => {
  const readme = read('README.md');
  for (const word of ['## Overworld map', 'VL.defineRegion', 'VL.fillSpot', 'VL.markFound', 'VL.defineDecor', 'softGate', 'gate:']) {
    assert.ok(readme.includes(word), `README mentions ${word}`);
  }
});
