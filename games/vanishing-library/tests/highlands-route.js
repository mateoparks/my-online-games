// The way to the highlands played for real (W19), from wherever the
// Lighthouse left the hero: the last two loose pages (the field by the
// library, and Henrietta carried home to Pip), the Chicken Keeper's Almanac
// from its trunk on the wreck, trunks opened until 20 books earn the Big
// Shell Purse (W34), every carried book handed in and read, berries sold for
// the binding's 40 shells, Miss Quill's Climber's Almanac; then up the hidden
// path and over both chasms with the chickens, to the lair's mouth.
const assert = require('node:assert/strict');
const { findPath } = require('./playthrough');
const { gatherWood } = require('./steps/w17.steps');
const { talkThrough } = require('./steps/w16.steps');
const { buy, face } = require('./metal-gear-route');

const ow = (screen, tx, ty) => ({ area: 'overworld', screen, tx, ty });
const here = (drive) => ({ area: drive.state.player.area, screen: drive.state.player.screen, ...drive.VL.heroTile(drive.state) });

// Walks there, reading any popup on the way, waking from a faint, and
// waiting for a townsperson who strolled into the way to stroll on.
function walk(drive, target) {
  for (let tries = 0; tries < 10; tries += 1) {
    try {
      drive.walkTo(target);
      return;
    } catch (error) {
      if (!/not reached/.test(error.message)) throw error;
      if (drive.app.sceneId === 'fainted') {
        drive.hold([], 0.8);
        drive.press('interact');
      }
      drive.closePopups();
      // Back off a step so a townsperson standing in the way can stroll on.
      const back = { up: 'down', down: 'up', left: 'right', right: 'left' }[drive.state.player.facing];
      // A step's worth (21 px, 0.3 s at the W30 pace), past the shy distance.
      drive.hold([tries % 2 ? back : ['left', 'right', 'up', 'down'][tries % 4]], 21 / drive.VL.TUNING.heroSpeed);
      drive.hold([], 1.2);
    }
  }
  drive.walkTo(target);
}

// Stands beside a townsperson wherever they have strolled to, faces them, S.
function talkTo(drive, screen, id, near) {
  const { VL } = drive;
  for (let tries = 0; tries < 8; tries += 1) {
    walk(drive, ow(screen, ...near));
    const npc = drive.state.room.entities.find((e) => e.type === 'npc' && e.id === id);
    assert.ok(npc, `${id} is on ${screen}`);
    const side = [[0, 1, 'up'], [-1, 0, 'right'], [1, 0, 'left'], [0, -1, 'down']]
      .map(([dx, dy, dir]) => ({ at: ow(screen, npc.x + dx, npc.y + dy), dir }))
      .find(({ at }) => findPath(VL, here(drive), at, drive.state));
    if (!side) continue;
    walk(drive, side.at);
    face(drive, side.dir);
    drive.press('interact');
    if (drive.app.sceneId === 'dialogue') return;
  }
  throw new Error(`could not reach ${id} to talk`);
}

// Walks onto a pickup from the tile beside it.
function pickUp(drive, spot, done) {
  const { VL } = drive;
  for (const [dx, dy, dir] of [[0, 1, 'up'], [-1, 0, 'right'], [1, 0, 'left'], [0, -1, 'down']]) {
    const at = ow(spot.screen, spot.x + dx, spot.y + dy);
    if (VL.isSolidAt('overworld', spot.screen, at.tx, at.ty) || !findPath(VL, here(drive), at, drive.state)) continue;
    walk(drive, at);
    drive.until(done, 2, [dir]);
    drive.closePopups();
    return;
  }
  throw new Error(`no way onto ${spot.id}`);
}

function pageByTheLibrary(drive) {
  const { VL } = drive;
  if (VL.spotFound(drive.state, 'pageFieldA')) return;
  pickUp(drive, VL.SPOTS.pageFieldA, (state) => VL.spotFound(state, 'pageFieldA'));
}

// Henrietta, from the cliff road down to Pip on the harbour.
function henriettaHome(drive) {
  const { VL } = drive;
  if (VL.spotFound(drive.state, 'lostChicken')) return;
  const spot = VL.SPOTS.lostChicken;
  for (let tries = 0; tries < 6 && !VL.chickenWithHero(drive.state, 'lostChicken'); tries += 1) {
    walk(drive, ow(spot.screen, spot.x - 2, spot.y));
    const hen = drive.state.room.entities.find((e) => e.type === 'chicken' && e.lost);
    const side = [[-1, 0, 'right'], [1, 0, 'left'], [0, 1, 'up'], [0, -1, 'down']]
      .map(([dx, dy, dir]) => ({ at: ow(spot.screen, hen.x + dx, hen.y + dy), dir }))
      .find(({ at }) => findPath(VL, here(drive), at, drive.state));
    walk(drive, side.at);
    face(drive, side.dir);
    drive.press('interact');
  }
  assert.ok(VL.chickenWithHero(drive.state, 'lostChicken'), 'Henrietta is in his arms');
  const pip = VL.getScreen('overworld', '2,1').entities.find((e) => e.type === 'npc' && e.id === 'chickenKid');
  talkTo(drive, '2,1', 'chickenKid', [pip.x, pip.y + 2]);
  talkThrough(drive);
  drive.closePopups();
  assert.ok(VL.spotFound(drive.state, 'pageLostChicken'), 'Pip gave the page');
  // The pathfinder does not see townsfolk: step back out onto the pier road.
  walk(drive, ow('2,1', 7, 5));
}

// Opens a book's trunk from the first side a path reaches (any area).
function openTrunk(drive, id) {
  const { VL } = drive;
  if (VL.spotFound(drive.state, id)) return;
  const trunk = VL.SPOTS[id];
  const at = (tx, ty) => ({ area: trunk.area, screen: trunk.screen, tx, ty });
  const side = [[0, 1, 'up'], [-1, 0, 'right'], [1, 0, 'left'], [0, -1, 'down']]
    .map(([dx, dy, dir]) => ({ at: at(trunk.x + dx, trunk.y + dy), dir }))
    .find(({ at: spot }) => !VL.isSolidAt(trunk.area, trunk.screen, spot.tx, spot.ty) && findPath(VL, here(drive), spot, drive.state));
  assert.ok(side, `a way to ${id}'s trunk`);
  walk(drive, side.at);
  face(drive, side.dir);
  drive.press('interact');
  drive.closePopups();
  assert.ok(VL.spotFound(drive.state, id), `${id} was in its trunk`);
}

function chickenAlmanacBook(drive) {
  openTrunk(drive, 'bookChickenAlmanac');
}

// W34: the binding's 40 shells need the Big Shell Purse (20 books returned),
// so books from trunks along the way, nearest places first, until there
// are enough to hand in.
const PURSE_TRUNKS = ['bookPrimer', 'bookHighShelfB', 'bookHerbalist', 'bookWoods', 'bookWreckDeck', 'bookHighShelfA', 'bookLighthouse',
  'bookHighPathB', 'bookHighScree', 'bookLairB', 'bookHighPathA', 'bookLakeIsland', 'bookHighGapB'];
function booksForThePurse(drive) {
  const { VL } = drive;
  const { shellPurse } = VL.TUNING.libraryRewards;
  const counted = () => VL.booksReturned(drive.state) + VL.booksCarried(drive.state).length;
  for (const id of PURSE_TRUNKS) {
    if (VL.hasItem(drive.state, 'shellPurse') || counted() >= shellPurse) break;
    openTrunk(drive, id);
  }
  assert.ok(VL.hasItem(drive.state, 'shellPurse') || counted() >= shellPurse, `${counted()} books for the purse`);
}

// Hands every carried book in and sits through the readings (W11's step).
function readAtTheLibrary(drive) {
  const { VL } = drive;
  if (!VL.booksCarried(drive.state).length) return;
  walk(drive, { area: 'library', screen: '0,0', ...VL.LIBRARY_TALK_AT });
  face(drive, 'up');
  drive.press('interact');
  for (let i = 0; i < 120; i += 1) {
    const idle = drive.app.sceneId === 'play' && !drive.state.libraryChain && !VL.currentPopup(drive.state);
    if (idle) break;
    drive.hold([], 0.35);
    if (drive.app.sceneId !== 'play') drive.press('interact');
  }
  drive.closePopups();
  assert.deepEqual([...VL.booksCarried(drive.state)], [], 'every book handed in');
}

// Berries picked and sold until the purse holds the binding's price.
function shellsFor(drive, least) {
  const { VL } = drive;
  const { earnShells } = require('./metal-gear-route');
  for (let i = 0; i < 4 && drive.state.inventory.shells < least; i += 1) earnShells(drive, least);
  assert.ok(drive.state.inventory.shells >= least, `${least} shells for the binding`);
  return VL;
}

const route = {
  climbersAlmanac(drive) {
    const { VL } = drive;
    drive.closePopups();
    pageByTheLibrary(drive);
    henriettaHome(drive);
    assert.ok(VL.loosePages(drive.state) >= VL.pagesToBind(), `${VL.loosePages(drive.state)} pages`);
    chickenAlmanacBook(drive);
    booksForThePurse(drive);
    readAtTheLibrary(drive);
    assert.ok(drive.state.flags.chickenAlmanacRead, 'the librarian read the Chicken Keeper\'s Almanac');
    assert.ok(VL.hasItem(drive.state, 'shellPurse'), 'the librarian gave the Big Shell Purse');
    shellsFor(drive, VL.TUNING.prices.binding.shells);
    buy(drive, 'bindery', ['bindPages']);
    drive.until((state) => VL.hasItem(state, 'climbersAlmanac'), 1);
    drive.reload();
    assert.ok(VL.hasItem(drive.state, 'climbersAlmanac'), 'the Almanac survives a reload');
    drive.closePopups();
  },
  // Up the hidden path to the ledge, and the ledge's chicken over the chasm.
  highlands(drive) {
    const { VL } = drive;
    drive.closePopups();
    walk(drive, ow('-1,-2', 10, 6));
    drive.closePopups();
    walk(drive, ow('-1,-2', 8, 3));
    flyFrom(drive, ow('-1,-2', 8, 3), 'chickenLedge', 'up');
    assert.equal(drive.state.player.screen, '-1,-3', 'over the first chasm');
  },
};

// Takes the spot's chicken up (S) from beside it, back to `from`, and F.
function flyFrom(drive, from, spot, dir) {
  const { VL } = drive;
  const screen = from.screen;
  if (drive.state.player.carrying?.spot !== spot) {
    drive.state.player.carrying && dropChicken(drive);
    for (let tries = 0; tries < 8 && drive.state.player.carrying?.spot !== spot; tries += 1) {
      const hen = drive.state.room.entities.find((e) => e.type === 'chicken' && e.spot === spot);
      assert.ok(hen, `${spot} waits on ${screen}`);
      const side = [[-1, 0, 'right'], [1, 0, 'left'], [0, 1, 'up'], [0, -1, 'down']]
        .map(([dx, dy, d]) => ({ at: ow(screen, hen.x + dx, hen.y + dy), d }))
        .find(({ at }) => findPath(VL, here(drive), at, drive.state));
      if (!side) {
        drive.hold([], 0.5);
        continue;
      }
      walk(drive, side.at);
      face(drive, side.d);
      drive.press('interact');
    }
    assert.equal(drive.state.player.carrying?.spot, spot, `lifted ${spot}`);
  }
  walk(drive, from);
  face(drive, dir);
  drive.press('fly');
  drive.until((state) => !state.player.flight && !state.transition, 6);
  drive.closePopups();
}

// Throws a chicken he no longer needs, so his hands are free for the next one.
function dropChicken(drive) {
  const { VL } = drive;
  for (const dir of ['down', 'left', 'right', 'up']) {
    const { tx, ty } = VL.heroTile(drive.state);
    const [dx, dy] = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[dir];
    if (VL.isSolidAt(drive.state.room.area, drive.state.room.screen, tx + dx, ty + dy, drive.state.room)) continue;
    face(drive, dir);
    drive.press('interact');
    drive.hold([], 0.6);
    return;
  }
}

module.exports = { route, ROUTE: Object.keys(route), walk, flyFrom, dropChicken, talkTo, ow, gatherWood };
