// The finale (W20): the trapdoor after the Dragon, the workshop and the hall
// below, Mr. Fenwick following, the marionettes and their strings, her
// confession show, his forgiveness, the full library, the ending and the
// credits, Continue after them, a reload at every beat, the locks, the
// fixture, the words, and a render smoke.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, loadGame, memoryStorage, fakeContext } = require('./harness');
const { createPlaythrough } = require('./playthrough');
const { route, toHall, fightMarionettes } = require('./finale-route');

const STEP = 1 / 60;
const plain = (value) => JSON.parse(JSON.stringify(value));
const FINALE = ['trapdoorOpen', 'marionettes', 'ending'];
const fixtureText = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

// An app in slot 1 of an in-memory store, loaded from a save (the W19
// fixture: the Dragon beaten, out by the warp), changed by `edit` first.
function fromSave({ name = 'save-v1-W19.json', edit } = {}) {
  const { VL } = loadGame();
  const save = JSON.parse(fixtureText(name));
  edit?.(save, VL);
  const storage = VL.createStorage(memoryStorage({ [VL.slotKey(0)]: JSON.stringify(save) }));
  const app = VL.createApp({ storage });
  app.startGame(VL.loadSlot(storage, 0), 0);
  app.setScene('play');
  const play = createPlaythrough(VL, { app, milestones: FINALE });
  return { VL, app, storage, play, drive: play.drive };
}
const beatsUpTo = (VL, beat) => VL.FINALE_BEATS.slice(0, VL.FINALE_BEATS.indexOf(beat) + 1);
const withBeats = (beat) => (save, VL) => {
  for (const id of beatsUpTo(VL, beat)) save.flags[id] = true;
};
const puppets = (drive) => drive.state.room.entities.filter((e) => e.type === 'marionette');
const npcs = (drive, id) => drive.state.room.entities.filter((e) => e.type === 'npc' && e.id === id);
const at = (drive) => [drive.state.player.area, drive.state.player.screen];

// ---------- the trapdoor ----------

test('the trapdoor stays shut until the Dragon is beaten, then the square shows it open and the stage empty', () => {
  const before = fromSave({ edit: (save) => { delete save.dungeons.lair.boss; } });
  before.VL.place(before.drive.state, { area: 'overworld', screen: '2,0', tx: 3, ty: 5, facing: 'up' });
  before.drive.hold([], 0.5);
  assert.equal(before.drive.state.flags.trapdoorOpen, undefined, 'not before the Dragon');
  assert.equal(npcs(before.drive, 'librarianWife').length, 1, 'she is at her stage');

  const { VL, drive } = fromSave();
  assert.ok(VL.LOCKS.d4Boss.reached(drive.state));
  route.trapdoorOpen(drive);
  assert.equal(drive.state.flags.trapdoorOpen, true);
  assert.ok(drive.state.popups.seen.trapdoorOpen, 'its popup was shown');
  assert.equal(npcs(drive, 'librarianWife').length, 0, 'her stage stands empty');
  assert.ok(drive.state.room.entities.find((e) => e.type === 'trapdoor').open);
  drive.reload();
  assert.equal(drive.state.flags.trapdoorOpen, true, 'saved');
  // S at the stage now: nobody is there to put on a show.
  drive.walkTo({ area: 'overworld', screen: '2,0', tx: 4, ty: 3 });
  drive.hold(['up'], 2 / 60);
  drive.press('interact');
  assert.equal(drive.app.sceneId, 'popup');
  assert.equal(VL.currentPopup(drive.state).text, VL.FINALE_WORDS.emptyStage);
});

test('walking onto the open trapdoor climbs down to the workshop, and the ladder leads back up beside it', () => {
  const { VL, drive } = fromSave({ edit: withBeats('trapdoorOpen') });
  drive.walkTo({ area: 'overworld', screen: '2,0', tx: 3, ty: 4 });
  drive.until((s) => s.player.area === 'workshop', 1, ['up']);
  assert.deepEqual([...at(drive), VL.heroTile(drive.state).tx, VL.heroTile(drive.state).ty], ['workshop', '0,0', 7, 8]);
  drive.hold([], 0.1);
  assert.equal(drive.app.sceneId, 'dialogue', 'Mr. Fenwick follows him down');
  drive.press('pause');
  drive.until((s) => s.player.area === 'overworld', 1, ['down']);
  assert.deepEqual([...at(drive), VL.heroTile(drive.state).tx, VL.heroTile(drive.state).ty], ['overworld', '2,0', 3, 4]);
  assert.equal(VL.ENTITIES.trapdoor.passable(drive.state), false, 'the pathfinder never falls in by chance');
});

// ---------- below ----------

test('Mr. Fenwick follows the hero down, in both voices, and stands below in every room until she is forgiven', () => {
  const { VL, drive } = fromSave({ edit: withBeats('trapdoorOpen') });
  drive.walkTo({ area: 'overworld', screen: '2,0', tx: 3, ty: 4 });
  drive.until((s) => s.player.area === 'workshop', 1, ['up']);
  drive.hold([], 0.1);
  assert.equal(drive.app.sceneId, 'dialogue');
  assert.deepEqual(plain([...new Set(drive.app.dialogue.speakers)]), ['Mr. Fenwick']);
  assert.equal(npcs(drive, 'librarian').length, 1);
  for (let i = 0; i < 20 && drive.app.sceneId === 'dialogue'; i += 1) {
    drive.hold([], 0.1);
    drive.press('interact');
  }
  assert.equal(drive.state.flags['finale:followed'], true);
  drive.reload();
  assert.equal(drive.state.flags['finale:followed'], true, 'saved as the talk ended');
  for (const screen of ['0,0', '0,-1', '-1,-1']) {
    VL.place(drive.state, { area: 'workshop', screen, tx: 7, ty: 5 });
    assert.equal(npcs(drive, 'librarian').length, 1, `he is in ${screen}`);
  }
  drive.state.flags.forgiven = true;
  VL.place(drive.state, { area: 'workshop', screen: '0,0', tx: 7, ty: 5 });
  assert.equal(npcs(drive, 'librarian').length, 0, 'back in his library after the ending');
});

test('the hall: she confronts them once from her gallery, and the puppets hang still until she has', () => {
  const { VL, drive } = fromSave({ edit: withBeats('finale:followed') });
  drive.fight = true;
  VL.place(drive.state, { area: 'workshop', screen: '0,-1', tx: 7, ty: 9, facing: 'up' });
  assert.equal(puppets(drive).length, 3);
  assert.deepEqual(plain(puppets(drive).map((m) => m.puppet).sort()), ['dragon', 'hero', 'librarian']);
  assert.ok(drive.state.room.entities.some((e) => e.art === 'wsPuppeteer'), 'she works them from the gallery');
  const before = puppets(drive).map((m) => [m.cx, m.cy]);
  drive.update();
  assert.equal(drive.app.sceneId, 'dialogue');
  assert.deepEqual(plain([...new Set(drive.app.dialogue.speakers)].sort()), ['Mr. Fenwick', 'Mrs. Fenwick']);
  assert.deepEqual(puppets(drive).map((m) => [m.cx, m.cy]), before, 'still while she speaks');
  drive.press('pause');
  assert.equal(drive.state.flags['finale:confronted'], true);
  drive.fight = true;
  drive.hold([], 1.5);
  assert.notDeepEqual(puppets(drive).map((m) => [m.cx, m.cy]), before, 'then they dance');
  VL.place(drive.state, { area: 'workshop', screen: '0,-1', tx: 7, ty: 9, facing: 'up' });
  drive.update();
  assert.equal(drive.app.sceneId, 'play', 'no second confrontation');
});

// A hall with the fight under way, the hero armed with a wood sword.
function hall(edit) {
  const t = fromSave({ edit: (save, VL) => {
    withBeats('finale:confronted')(save, VL);
    edit?.(save, VL);
  } });
  t.drive.fight = true;
  VL_place(t, { area: 'workshop', screen: '0,-1', tx: 7, ty: 9, facing: 'up' });
  // Puppets held where they hang, so a test can line up a swing.
  t.freeze = () => {
    t.VL.ENEMIES.marionette.think = () => {};
  };
  return t;
}
function VL_place(t, where) {
  t.VL.place(t.drive.state, where);
}
// Puts the hero beside a puppet's string, facing it, and swings once.
function swingAt(t, m, side) {
  const { VL, drive } = t;
  t.freeze();
  m.arriving = 0;
  m.jerk = 0;
  drive.state.player.invuln = 99;
  Object.assign(drive.state.player, { x: m.cx + side * VL.STRING_REACH.dx, y: m.cy + VL.STRING_REACH.dy, facing: side < 0 ? 'right' : 'left' });
  drive.press('mainHand');
  drive.hold([], 0.35);
}

test('the sword only clonks off a puppet (it says so once, and nothing blinks); a swing through a string cuts it', () => {
  const t = hall();
  const { VL, drive } = t;
  const m = puppets(drive).find((p) => p.puppet === 'hero');
  t.freeze();
  m.arriving = 0;
  // Straight at its body from below: no string in reach.
  drive.state.player.invuln = 99;
  Object.assign(drive.state.player, { x: m.cx, y: m.cy + 40, facing: 'up' });
  drive.press('mainHand');
  drive.until(() => drive.app.sceneId === 'popup', 1);
  assert.equal(VL.currentPopup(drive.state).text, VL.MARIONETTE_NOTE);
  assert.equal(m.hurt, 0, 'no hurt blink');
  assert.deepEqual(plain(m.strings.map((s) => s.cut)), [false, false]);
  drive.closePopups();
  drive.hold([], 0.5);
  swingAt(t, m, -1);
  assert.deepEqual(plain(m.strings.map((s) => s.cut)), [true, false], 'the near string, and only it');
  assert.ok(m.jerk > 0 && !VL.ENEMIES.marionette.harmful(m), 'it jerks up, harmless for a moment');
  assert.equal(m.fallen, false);
  m.jerk = 0;
  swingAt(t, m, 1);
  assert.deepEqual(plain(m.strings.map((s) => s.cut)), [true, true]);
  assert.equal(m.fallen, true, 'both cut: it drops');
  assert.equal(VL.ENEMIES.marionette.harmful(m), false, 'a heap is harmless');
  assert.equal(drive.state.flags.marionettes, undefined, 'two still dancing');
  Object.assign(drive.state.player, { x: 120, y: 150, facing: 'up' });
  drive.press('mainHand');
  drive.hold([], 0.5);
  assert.notEqual(drive.app.sceneId, 'popup', 'the note comes once a visit');
});

test('all three down wins the fight, saved at once; on later visits they lie in heaps and she stands on the floor', () => {
  const t = hall();
  const { VL, drive } = t;
  for (const m of puppets(drive)) {
    swingAt(t, m, -1);
    m.jerk = 0;
    swingAt(t, m, 1);
  }
  assert.equal(drive.state.flags.marionettes, true);
  drive.reload();
  assert.equal(drive.state.flags.marionettes, true, 'saved the moment the last fell');
  assert.deepEqual(at(drive), ['hut', '0,0'], 'a reload wakes him at the hut');
  drive.fight = true;
  VL_place(t, { area: 'workshop', screen: '0,-1', tx: 7, ty: 9, facing: 'up' });
  assert.ok(puppets(drive).every((m) => m.fallen && m.strings.every((s) => s.cut)));
  assert.equal(npcs(drive, 'librarianWife').length, 1, 'she has come down');
  assert.ok(!drive.state.room.entities.some((e) => e.art === 'wsPuppeteer'));
});

test('she comes down from her gallery as soon as the last puppet falls, before she speaks, and never onto the hero', () => {
  const t = hall();
  const { VL, drive } = t;
  for (const m of puppets(drive)) {
    swingAt(t, m, -1);
    m.jerk = 0;
    swingAt(t, m, 1);
  }
  assert.equal(drive.state.flags.marionettes, true);
  // He stands right where she would step down.
  Object.assign(drive.state.player, VL.tileCenter(VL.FINALE.wifeAt.x, VL.FINALE.wifeAt.y));
  drive.until(() => drive.app.sceneId === 'dialogue', VL.TUNING.finaleWinPause + 0.5);
  const wives = npcs(drive, 'librarianWife');
  assert.equal(wives.length, 1, 'on the floor as she speaks');
  assert.ok(!drive.state.room.entities.some((e) => e.art === 'wsPuppeteer'), 'off her gallery');
  const c = VL.tileCenter(wives[0].x, wives[0].y);
  assert.ok(Math.abs(c.x - drive.state.player.x) >= 16, 'beside him, not on him');
});

test('a hall cleared of its puppets (as the playthrough clears enemies) never counts as won', () => {
  const t = hall();
  const { drive } = t;
  drive.fight = false;
  drive.hold([], 0.5);
  assert.equal(puppets(drive).length, 0);
  assert.equal(drive.state.flags.marionettes, undefined);
});

test('the puppets hurt him; a faint wakes him at the hut with everything kept and the strings whole again; nothing shuts him in', () => {
  const t = hall();
  const { VL, drive } = t;
  const m = puppets(drive)[0];
  swingAt(t, m, -1);
  assert.ok(m.strings[0].cut);
  drive.state.player.invuln = 0;
  drive.state.hp = 1;
  for (const p of puppets(drive)) Object.assign(p, { arriving: 0, jerk: 0, calm: 0, mode: 'drift' });
  Object.assign(drive.state.player, { x: m.cx, y: m.cy + 10 });
  drive.update();
  assert.equal(drive.app.sceneId, 'fainted');
  drive.hold([], 0.8);
  drive.press('interact');
  assert.deepEqual(at(drive), ['hut', '0,0']);
  assert.ok(VL.hasItem(drive.state, 'mirrorShield') && VL.LOCKS.d4Boss.reached(drive.state), 'nothing lost');
  toHall(drive);
  assert.ok(puppets(drive).every((p) => p.strings.every((s) => !s.cut)), 'a fresh fight');
  // Out the way he came in, mid-fight: no gate.
  drive.state.player.invuln = 99;
  Object.assign(drive.state.player, VL.tileCenter(7, 9));
  drive.until((s) => s.player.screen === '0,0' && !s.transition, 2, ['down']);
});

test('the scripted fight with real keys wins in under two minutes of game time', () => {
  const t = hall();
  t.drive.state.time = 0;
  fightMarionettes(t.drive);
  assert.ok(t.drive.state.time < 120, `${t.drive.state.time.toFixed(1)} s`);
});

// The hero's feet against the puppet's centre and side, as a kid lines up
// "beside" it: anywhere from its shoulders to its belt, near enough to reach.
const BESIDE = { dx: [26, 44], feet: [-8, 8] };
const isBeside = (drive, m) => {
  const { x, y } = drive.state.player;
  const dx = Math.abs(x - m.cx);
  return dx >= BESIDE.dx[0] && dx <= BESIDE.dx[1] && y - m.cy >= BESIDE.feet[0] && y - m.cy <= BESIDE.feet[1];
};

test('a swing from anywhere beside a puppet, shoulders to belt, cuts the string on that side', () => {
  for (const puppet of ['dragon', 'hero', 'librarian']) {
    for (let dx = BESIDE.dx[0]; dx <= BESIDE.dx[1]; dx += 4) {
      for (let feet = BESIDE.feet[0]; feet <= BESIDE.feet[1]; feet += 4) {
        for (const side of [-1, 1]) {
          const t = hall();
          const { drive } = t;
          t.freeze();
          const m = puppets(drive).find((p) => p.puppet === puppet);
          m.arriving = 0;
          drive.state.player.invuln = 99;
          Object.assign(drive.state.player, { x: m.cx + side * dx, y: m.cy + feet, facing: side < 0 ? 'right' : 'left' });
          drive.press('mainHand');
          drive.hold([], 0.35);
          assert.deepEqual(plain(m.strings.map((s) => s.cut)), side < 0 ? [true, false] : [false, true], `${puppet} ${side < 0 ? 'left' : 'right'} ${dx} px out, feet ${feet} from its centre`);
        }
      }
    }
  }
});

test('a kid who walks up beside a drifting puppet and just keeps swinging cuts a string within a few swings', () => {
  for (const puppet of ['dragon', 'hero', 'librarian']) kidSwingsAt(puppet);
});
function kidSwingsAt(puppet) {
  const t = hall();
  const { VL, drive } = t;
  const m = puppets(drive).find((p) => p.puppet === puppet);
  let swings = 0;
  for (let frame = 0; frame < 60 * 30 && !m.strings.some((s) => s.cut); frame += 1) {
    drive.state.player.invuln = 99;
    drive.state.hp = Math.max(drive.state.hp, 3);
    if (drive.app.sceneId !== 'play') {
      drive.closePopups();
      continue;
    }
    const player = drive.state.player;
    if (!isBeside(drive, m)) {
      // Rough steering, as a kid walks over: towards the near side, never to an exact spot.
      const side = player.x < m.cx ? -1 : 1;
      const held = [];
      const dx = m.cx + side * 32 - player.x;
      if (Math.abs(dx) > 6) held.push(dx > 0 ? 'right' : 'left');
      if (Math.abs(player.y - m.cy) > 6) held.push(player.y > m.cy ? 'up' : 'down');
      drive.update(VL.actions({ held }));
      continue;
    }
    drive.update(VL.actions({ held: [player.x < m.cx ? 'right' : 'left'] }));
    drive.press('mainHand');
    swings += 1;
    drive.hold([], 0.5);
  }
  assert.ok(m.strings.some((s) => s.cut), `${puppet}: no string cut after ${swings} swings`);
  assert.ok(swings <= 4, `${puppet}: ${swings} swings`);
}

// ---------- the confession, the forgiveness ----------

test('after the fight: her words, her last show (the true story, with the hero\'s own puppet), then her apology and his forgiveness', () => {
  const { VL, drive } = fromSave({ edit: withBeats('marionettes') });
  toHall(drive);
  drive.until(() => drive.app.sceneId === 'dialogue', VL.TUNING.finaleWinPause + 0.5);
  assert.ok(drive.app.dialogue.speakers.includes('Mrs. Fenwick'));
  for (let i = 0; i < 20 && drive.app.sceneId === 'dialogue'; i += 1) drive.press('interact');
  assert.equal(drive.state.flags['finale:showAsked'], true);
  drive.until(() => drive.app.sceneId === 'puppetShow', 1);
  assert.equal(drive.app.puppetShow.show, VL.CONFESSION_SHOW);
  const cast = new Set(VL.CONFESSION_SHOW.beats.flatMap((b) => Object.keys(b.cast)));
  assert.ok(cast.has('wife') && cast.has('librarian') && cast.has('dragon') && cast.has('hero') && !cast.has('ned'));
  drive.press('pause');
  assert.equal(drive.state.flags['finale:shown'], true, 'Esc ends the show and its flag lands');
  drive.until(() => drive.app.sceneId === 'dialogue', 1);
  assert.deepEqual(plain([...new Set(drive.app.dialogue.speakers)].sort()), ['Mr. Fenwick', 'Mrs. Fenwick']);
  const lib = drive.state.library;
  lib.gone.push(lib.returned[0], lib.returned[1]);
  for (let i = 0; i < 30 && drive.app.sceneId === 'dialogue'; i += 1) drive.press('interact');
  assert.equal(drive.state.flags.forgiven, true);
  assert.deepEqual(plain(drive.state.library.gone), [], 'every book back');
  drive.update();
  assert.equal(drive.app.sceneId, 'ending');
});

test('once forgiven she steals no more, the shelves are packed, her shows are kind and take turns, and both Fenwicks say so', () => {
  const { VL, drive } = fromSave({ name: 'save-v1-W20.json' });
  const lib = drive.state.library;
  lib.trips += 3;
  lib.stolen.bosses = 0;
  assert.deepEqual(plain(VL.applyThefts(drive.state)), []);
  drive.walkTo({ area: 'library', screen: '0,0', tx: 7, ty: 6 });
  const shelves = drive.state.room.entities.filter((e) => e.type === 'libraryShelf');
  assert.ok(shelves.every((s) => s.fill === 1 && s.heroBook));
  assert.deepEqual(plain(lib.gone), []);
  // With nothing to hand in and no reward waiting, he says the shelves are full.
  for (const id of VL.booksCarried(drive.state)) lib.returned.push(id);
  for (const id of Object.keys(VL.TUNING.libraryRewards)) drive.state.flags[`reward:${id}`] = true;
  for (const id of lib.returned) if (VL.BOOKS[id].kind !== 'generic' && !lib.read.includes(id)) lib.read.push(id);
  assert.match(VL.pickDialogue(drive.state, 'librarian').say.join(' '), /Full to the very top/);
  drive.walkTo({ area: 'overworld', screen: '2,0', tx: 4, ty: 3 });
  assert.equal(npcs(drive, 'librarianWife').length, 1, 'back at her stage');
  const shows = [];
  for (let i = 0; i < 3; i += 1) {
    drive.hold(['up'], 2 / 60);
    drive.press('interact');
    assert.equal(drive.app.sceneId, 'puppetShow');
    shows.push(drive.app.puppetShow.show.title);
    drive.press('pause');
    drive.hold([], 0.2);
  }
  assert.deepEqual(shows, [VL.KIND_SHOWS[0].title, VL.KIND_SHOWS[1].title, VL.KIND_SHOWS[0].title]);
  assert.equal(VL.pickDialogue(drive.state, 'librarianWife').when.flag, 'forgiven');
});

// ---------- the ending and the credits ----------

test('the ending: the shelves fill, the town comes, the book about the hero goes up; finished only as the credits roll; then the title and Continue', () => {
  const { VL, app, storage, drive } = fromSave({ edit: withBeats('forgiven') });
  drive.update();
  assert.equal(app.sceneId, 'ending');
  assert.deepEqual(at(drive), ['library', '0,0']);
  const shelf = () => drive.state.room.entities.find((e) => e.type === 'libraryShelf');
  assert.equal(shelf().fill, 0);
  let sawParty = false;
  let sawBook = false;
  for (let i = 0; i < 200 && app.ending.phase !== 'credits'; i += 1) {
    assert.equal(drive.state.finished, false, 'not finished before the credits');
    drive.hold([], 0.2);
    sawParty = sawParty || drive.state.room.entities.filter((e) => e.type === 'npc').length >= 8;
    sawBook = sawBook || shelf().heroBook;
    if (app.ending.phase !== 'credits') drive.press('interact');
  }
  assert.ok(sawParty && sawBook && shelf().fill === 1);
  assert.equal(drive.state.finished, true);
  assert.equal(JSON.parse(storage.read(VL.slotKey(0))).finished, true, 'saved as the credits begin');
  drive.press('interact');
  drive.press('interact');
  assert.equal(app.sceneId, 'title');
  assert.equal(app.title.slots[0].summary.finished, true);
  drive.press('confirm');
  assert.deepEqual(at(drive), ['hut', '0,0']);
  drive.hold([], 1);
  assert.equal(app.sceneId, 'play', 'the ending never plays again');
});

test('a reload during the ending plays it again from the start; Esc skips to the credits', () => {
  const { app, drive } = fromSave({ edit: withBeats('forgiven') });
  drive.update();
  drive.hold([], 1.5);
  drive.press('interact');
  drive.reload();
  drive.update();
  assert.equal(drive.app.sceneId, 'ending');
  assert.equal(drive.app.ending.beat, 0);
  drive.hold([], 1.5);
  drive.press('pause');
  drive.hold([], 1.5);
  assert.equal(drive.app.ending.phase, 'credits');
  assert.equal(drive.state.finished, true);
  void app;
});

test('reload-safe at every beat: from a reload after each one the finale goes on to the credits', () => {
  for (const beat of ['trapdoorOpen', 'finale:followed', 'finale:confronted', 'marionettes', 'finale:showAsked', 'finale:shown']) {
    const { VL, drive } = fromSave({ edit: withBeats(beat) });
    drive.reload();
    assert.deepEqual(at(drive), [VL.HOME_SAVE.area, VL.HOME_SAVE.screen], `after ${beat}, Continue wakes him at the hut`);
    if (!drive.state.flags.marionettes) route.marionettes(drive);
    route.ending(drive);
    assert.equal(drive.state.finished, true, `finished after a reload at ${beat}`);
  }
});

// ---------- the table, the fixture, the words ----------

test('the finale\'s locks are claimed with the planned rules, the workshop is a place that exists, and the whole path solves', () => {
  const { VL } = loadGame();
  for (const id of ['trapdoorOpen', 'workshop', 'marionettes', 'ending']) {
    assert.ok(VL.LOCKS[id].reached, `${id} claimed`);
    assert.equal(VL.LOCKS[id].replan, undefined, `${id} keeps the plan`);
  }
  assert.deepEqual(plain(VL.LOCKS.workshop.place), { area: 'workshop', screen: '0,0' });
  assert.deepEqual(plain(VL.solveProgression().problems), []);
  assert.equal(VL.MILESTONES.at(-1), 'ending');
});

test('the W20 fixture (the real finale played from the W19 save) loads with nothing reset, FINISHED, and Continues at the hut', () => {
  const { VL } = loadGame();
  const text = fixtureText('save-v1-W20.json');
  const storage = VL.createStorage(memoryStorage({ [VL.slotKey(0)]: text }));
  const slot = VL.readSlot(storage, 0);
  assert.equal(slot.status, 'ok');
  assert.deepEqual(plain(slot.resets || []), []);
  assert.equal(slot.summary.finished, true);
  const game = VL.loadSlot(storage, 0);
  for (const id of ['trapdoorOpen', 'marionettes', 'forgiven']) assert.equal(game.flags[id], true);
  const app = VL.createApp({ storage });
  app.startGame(game, 0);
  app.setScene('play');
  assert.deepEqual([app.game.player.area, app.game.player.screen], ['hut', '0,0']);
  assert.ok(VL.LOCKS.ending.reached(app.game));
});

test('every finale line fits its box and the font, and a line about the hero names them with no he or she in it', () => {
  const { VL } = loadGame();
  const state = { name: 'Ñandú Élodïe' };
  const lines = [
    ...Object.values(VL.FINALE_WORDS).flatMap((w) => (Array.isArray(w) ? w.map(([, text]) => text) : [w])),
    ...VL.ENDING_BEATS.map((b) => b.say),
    ...VL.CONFESSION_SHOW.beats.map((b) => b.say),
    ...VL.KIND_SHOWS.flatMap((s) => s.beats.map((b) => b.say)),
    ...VL.CREDITS.map((l) => (typeof l === 'string' ? l : l.big)),
    VL.MARIONETTE_NOTE, VL.POPUPS.trapdoorOpen.text,
  ];
  for (const text of lines) {
    const shown = VL.popupText(text, state);
    assert.deepEqual(plain(VL.ART.missingGlyphs(shown)), [], text);
    assert.ok(!VL.ART.popupLayout({ text: shown, title: 'Mrs. Fenwick' }).overflow || VL.dialoguePages(text, state).length > 1, `fits: ${text}`);
    // A line about the hero names them; the he/she in other lines are the Fenwicks' and the dragon's.
    if (/\{name\}|\bhero\b/i.test(text)) assert.doesNotMatch(text, /\b(he|him|his|himself|she|her|hers|herself)\b/i, `no pronoun beside the hero: ${text}`);
  }
  for (const beat of VL.ENDING_BEATS) assert.ok(!VL.ART.popupLayout({ text: VL.popupText(beat.say, state), title: beat.speaker || null }).overflow, `one page: ${beat.say}`);
  assert.ok(VL.ENDING_BEATS.some((b) => /\{name\}/.test(b.say)), 'the town thanks the hero by name');
  assert.ok(VL.ENDING_BEATS.some((b) => /home town together/.test(b.say)), 'the promise');
  assert.ok(VL.ENDING_BEATS.some((b) => /writing books of its own/.test(b.say)), 'the town writes its own books');
});

test('render smoke: the three rooms below, the fight in every state, the confession and kind shows, every phase of the ending and the credits draw', () => {
  const { VL, app, drive } = fromSave({ edit: withBeats('finale:confronted') });
  const ctx = fakeContext();
  drive.fight = true;
  for (const screen of ['0,0', '0,-1', '-1,-1']) {
    VL.place(drive.state, { area: 'workshop', screen, tx: 7, ty: 5 });
    for (let i = 0; i < 3; i += 1) {
      drive.update();
      VL.render(ctx, app, i * 0.4);
    }
  }
  for (const m of puppets(drive)) {
    m.strings[0].cut = true;
    VL.render(ctx, app, 1);
    m.fallen = true;
    m.fell = 0.2;
    VL.render(ctx, app, 1.2);
    m.fell = 10;
    VL.render(ctx, app, 1.4);
  }
  for (const data of [{ confession: true }, { kind: 0 }, { kind: 1 }]) {
    app.setScene('puppetShow', data);
    for (let i = 0; i < 12; i += 1) {
      app.update(VL.actions({ pressed: i % 3 === 0 ? ['interact'] : [] }), 0.3);
      VL.render(ctx, app, i);
    }
  }
  app.setScene('play');
  drive.state.flags.forgiven = true;
  app.setScene('ending');
  for (let i = 0; i < 400 && app.sceneId === 'ending'; i += 1) {
    app.update(VL.actions({ pressed: i % 10 === 0 ? ['interact'] : [] }), STEP * 6);
    VL.render(ctx, app, i * 0.1);
  }
  assert.equal(app.sceneId, 'title');
});
