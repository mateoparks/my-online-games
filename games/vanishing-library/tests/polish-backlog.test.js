// W25, the polish backlog from reviews and QA: the hand-in tally, a second
// loose page, a faint while carrying a chicken, corner assist around people,
// a grace after a popup, and Delete with saving off.
const assert = require('node:assert/strict');
const { test, loadGame, playApp, fakeDocument } = require('./harness');

// ---------- 1. the tally never promises a reward he is about to give ----------

test('handing in the fifth book, the tally skips "Bring me N more": the purse comes right after', () => {
  const { VL } = loadGame();
  const game = VL.newGame({ name: 'Robin' });
  ['bookRiverside', 'bookBeachBuried', 'bookCliffRoad', 'bookLighthouse'].forEach((id) => VL.markFound(game, id));
  const four = VL.returnSpeech(game, VL.returnBooks(game));
  assert.ok(four.at(-1).includes('Bring me 1 more'), four.at(-1));
  VL.markFound(game, 'bookEastRoad');
  const five = VL.returnSpeech(game, VL.returnBooks(game));
  assert.equal(VL.pendingReward(game), 'shellPurse');
  assert.ok(five.at(-1).includes('5 books') && !five.at(-1).includes('more'), five.at(-1));
  VL.giveLibraryReward(game, 'shellPurse');
  VL.markFound(game, 'bookWoods');
  const six = VL.returnSpeech(game, VL.returnBooks(game));
  assert.ok(six.at(-1).includes('Bring me 4 more'), 'the next goal again once the reward is given');
});

// ---------- 2. every loose page says so; the talk box leaves the speaker in view ----------

test('the first loose page explains itself; every later one still says it was found, with the count', () => {
  const { VL } = loadGame();
  const game = VL.newGame({ name: 'Robin' });
  VL.findPage(game, 'pageFieldA');
  assert.equal(VL.currentPopup(game).id, 'pageFound');
  VL.dismissPopup(game);
  assert.equal(VL.currentPopup(game), null);
  VL.findPage(game, 'pageFieldB');
  const note = VL.currentPopup(game);
  assert.ok(note, 'the second page is not silent');
  assert.equal(note.title, 'Another loose page!');
  assert.ok(note.text.includes(`${VL.loosePages(game)} of the ${VL.pagesToBind()}`), note.text);
});

// The box's rectangle and the sprites it must not hide, in canvas pixels.
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function talkBox(VL, app) {
  let drawn = null;
  const original = VL.ART.drawPopup;
  VL.ART.drawPopup = (ctx, popup, t) => {
    drawn = original(ctx, popup, t);
    return drawn;
  };
  VL.render(fakeDocument().createElement('canvas').getContext('2d'), app, 0);
  VL.ART.drawPopup = original;
  return drawn;
}

test('at the library desk the talk box hides neither Mr. Fenwick nor the hero', () => {
  const { VL } = loadGame();
  const app = playApp(VL);
  app.game.popups.seen.controls = true;
  app.game.popups.queue.length = 0;
  VL.place(app.game, { area: 'library', screen: '0,0', ...VL.LIBRARY_TALK_AT, facing: 'up' });
  app.update(VL.actions({ pressed: ['interact'] }), 1 / 60);
  assert.equal(app.sceneId, 'dialogue');
  const box = talkBox(VL, app);
  const { tile, hudHeight } = VL.TUNING;
  const librarian = app.game.room.entities.find((e) => e.type === 'npc' && e.id === 'librarian');
  const feet = VL.npcFeet(librarian, 0, hudHeight);
  assert.ok(!overlaps(box, { x: feet.x - tile / 2, y: feet.y - 22, w: tile, h: 24 }), 'Mr. Fenwick in view');
  const hero = app.game.player;
  assert.ok(!overlaps(box, { x: hero.x - tile / 2, y: hudHeight + hero.y - 18, w: tile, h: 24 }), 'the hero in view');
});

test('when nobody is hidden, the box keeps to the half away from the hero', () => {
  const { VL } = loadGame();
  const game = VL.newGame();
  const { rows } = VL.TUNING;
  const popup = { title: 'Pip', text: 'Hello!' };
  VL.place(game, { area: 'overworld', screen: '0,0', tx: 7, ty: rows - 3 });
  assert.equal(VL.dialogueSide(game, null, popup), 'top');
  VL.place(game, { area: 'overworld', screen: '0,0', tx: 7, ty: 2 });
  assert.equal(VL.dialogueSide(game, { x: 9, y: 2 }, popup), 'bottom', 'a speaker beside the hero');
});

// ---------- 3. a faint drops the chicken ----------

function chickenYard(VL) {
  VL.addScreens('henYard', {
    '0,0': {
      tiles: ['TTTTTTTTTTTTTTTT', ...Array(9).fill('T..............T'), 'TTTTTTTTTTTTTTTT'],
      entities: [
        { type: 'chicken', spot: 'henYardHen', x: 10, y: 2 },
        { type: 'chicken', spot: 'henYardLost', x: 12, y: 6, lost: true },
      ],
    },
  });
}

test('a faint while carrying a chicken drops it: each chicken is back at its spot, and the sword works on waking', () => {
  const { VL } = loadGame();
  chickenYard(VL);
  VL.sfx = () => true;
  const app = playApp(VL);
  const game = app.game;
  game.popups.seen.controls = true;
  game.popups.queue.length = 0;
  const press = (action) => app.update(VL.actions({ pressed: [action] }), 1 / 60);
  const lift = (spot, tx, ty) => {
    VL.place(game, { area: 'henYard', screen: '0,0', tx, ty, facing: 'right' });
    const hen = game.room.entities.find((e) => e.type === 'chicken' && e.spot === spot);
    const px = game.player.x + 12;
    Object.assign(hen, { px, py: game.player.y, x: VL.tileOf(px, game.player.y).tx, y: VL.tileOf(px, game.player.y).ty, mode: 'idle', idle: 99 });
    press('interact');
    assert.equal(game.player.carrying, hen, `${spot} lifted`);
  };
  lift('henYardLost', 4, 6);
  press('interact');
  for (let i = 0; i < 60; i += 1) app.update(VL.noActions(), 1 / 60);
  assert.ok(game.chickenFollower, 'the lost chicken follows');
  lift('henYardHen', 4, 3);
  VL.faint(game);
  assert.equal(game.player.carrying, null, 'dropped as he faints');
  assert.equal(game.chickenFollower, null, 'the lost chicken stops following, as on a reload');
  VL.respawn(game);
  app.setScene('play');
  game.items.woodSword = true;
  game.hands.mainHand = 'woodSword';
  press('mainHand');
  assert.ok(game.player.swing, 'the sword swings on waking');
  VL.place(game, { area: 'henYard', screen: '0,0', tx: 3, ty: 8 });
  const home = (spot) => game.room.entities.filter((e) => e.type === 'chicken' && e.spot === spot).map((e) => [e.x, e.y]);
  assert.deepEqual(home('henYardHen'), [[10, 2]]);
  assert.deepEqual(home('henYardLost'), [[12, 6]]);
});

// ---------- 4. corner assist around people ----------

test('holding up a few pixels off Gran\'s corner slides the hero round her (wave-3 QA: 4 px off, stuck)', () => {
  for (const offset of [-4, 4]) {
    const { VL } = loadGame();
    const app = playApp(VL);
    const game = app.game;
    game.popups.seen.controls = true;
    game.popups.queue.length = 0;
    VL.place(game, { area: 'overworld', screen: '2,0', tx: 5, ty: 9, facing: 'up' });
    const gran = game.room.entities.find((e) => e.id === 'gran');
    // Gran one tile to the side of the hero's column, standing still.
    Object.assign(gran, { x: offset < 0 ? 4 : 6, y: 8, walk: null, idle: 99, pause: 99 });
    Object.assign(game.player, { x: 88 + offset, y: 148.3 });
    for (let i = 0; i < 30; i += 1) app.update(VL.actions({ held: ['up'] }), 1 / 60);
    assert.ok(game.player.y < 128, `slid past her corner (offset ${offset}, y ${game.player.y})`);
    const box = VL.TUNING.heroBox;
    assert.ok(!VL.isBlocked('overworld', '2,0', game.player.x, game.player.y, box.w, box.h, game.room), 'and never into her');
  }
});
