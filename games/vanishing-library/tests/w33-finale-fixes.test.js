// W33, finale fixes: the hero stays in sight among the giant marionettes,
// the books he carries come home in the ending, Esc skips the whole ending,
// no HUD over the ending, and the slingshot's ammo count sits inside its slot.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, loadGame, memoryStorage } = require('./harness');
const { createPlaythrough } = require('./playthrough');
const { toHall } = require('./finale-route');

const plain = (value) => JSON.parse(JSON.stringify(value));
const fixtureText = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

function fromSave({ name = 'save-v1-W19.json', edit } = {}) {
  const { VL } = loadGame();
  const save = JSON.parse(fixtureText(name));
  edit?.(save, VL);
  const storage = VL.createStorage(memoryStorage({ [VL.slotKey(0)]: JSON.stringify(save) }));
  const app = VL.createApp({ storage });
  app.startGame(VL.loadSlot(storage, 0), 0);
  app.setScene('play');
  const play = createPlaythrough(VL, { app, milestones: ['trapdoorOpen', 'marionettes', 'ending'] });
  return { VL, app, storage, play, drive: play.drive };
}
const withBeats = (beat) => (save, VL) => {
  for (const id of VL.FINALE_BEATS.slice(0, VL.FINALE_BEATS.indexOf(beat) + 1)) save.flags[id] = true;
};

// A canvas that remembers every filled rect with its colour and alpha.
function recordingContext() {
  const rects = [];
  const stack = [];
  const target = {
    rects,
    fillStyle: '',
    globalAlpha: 1,
    fillRect(x, y, w, h) {
      rects.push({ x, y, w, h, color: target.fillStyle, alpha: target.globalAlpha, tag: target.tag });
    },
    save() { stack.push({ alpha: target.globalAlpha, fillStyle: target.fillStyle }); },
    restore() { Object.assign(target, { globalAlpha: stack.at(-1).alpha, fillStyle: stack.pop().fillStyle }); },
    measureText: () => ({ width: 8 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  };
  return new Proxy(target, {
    get: (o, p) => (p in o ? o[p] : () => {}),
    set: (o, p, v) => {
      o[p] = v;
      return true;
    },
  });
}

// ---------- 1. the hero among the giant marionettes ----------

function hall() {
  const t = fromSave({ edit: withBeats('finale:confronted') });
  t.drive.fight = true;
  t.VL.place(t.drive.state, { area: 'workshop', screen: '0,-1', tx: 7, ty: 9, facing: 'up' });
  t.drive.update();
  t.VL.ENEMIES.marionette.think = () => {};
  t.drive.state.player.invuln = 99;
  return t;
}
const puppetsIn = (drive) => drive.state.room.entities.filter((e) => e.type === 'marionette');

// Draws one frame, tagging the rects each puppet and the hero paint.
function drawTagged(t) {
  const { VL, app } = t;
  const ctx = recordingContext();
  const puppetDraw = VL.ENTITIES.marionette.draw;
  const heroDraw = VL.ART.drawHero;
  const order = [];
  VL.ENTITIES.marionette.draw = (c, m, ...rest) => {
    order.push(m.puppet);
    ctx.tag = m.puppet;
    puppetDraw(c, m, ...rest);
    ctx.tag = undefined;
  };
  VL.ART.drawHero = (c, ...rest) => {
    order.push('HERO');
    ctx.tag = 'HERO';
    heroDraw(c, ...rest);
    ctx.tag = undefined;
  };
  try {
    VL.render(ctx, app, 1);
  } finally {
    VL.ENTITIES.marionette.draw = puppetDraw;
    VL.ART.drawHero = heroDraw;
  }
  return { rects: ctx.rects, order };
}

test('the hero is drawn after (over) every marionette', () => {
  const t = hall();
  const { order } = drawTagged(t);
  assert.equal(order.filter((who) => who !== 'HERO').length, 3, order.join(' '));
  assert.equal(order.at(-1), 'HERO', order.join(' '));
});

test('a puppet he stands in front of fades so he stays in sight; its strings and the puppets clear of him stay solid', () => {
  const t = hall();
  const { VL, drive } = t;
  const all = puppetsIn(drive);
  const near = all.find((m) => m.puppet === 'hero');
  // The other two well away from him and from each other.
  all.filter((m) => m !== near).forEach((m, i) => Object.assign(m, { cx: i ? 200 : 56, cy: 80, arriving: 0 }));
  Object.assign(near, { cx: 128, cy: 120, arriving: 0 });
  // Where he stands to cut: beside it, level with its chest (inside its drawn shape).
  Object.assign(drive.state.player, { x: near.cx + VL.STRING_REACH.dx, y: near.cy + VL.STRING_REACH.dy });
  drive.hold([], 0.6);
  const { rects } = drawTagged(t);
  const of = (who) => rects.filter((r) => r.tag === who);
  const stringColor = VL.ART.color('puppetString');
  const body = of('HERO');
  assert.ok(body.length > 0);
  const nearBody = of(near.puppet).filter((r) => r.color !== stringColor);
  assert.ok(nearBody.length > 10);
  assert.ok(nearBody.every((r) => r.alpha <= 0.6), 'the puppet behind him is faded');
  assert.ok(of(near.puppet).filter((r) => r.color === stringColor).every((r) => r.alpha === 1), 'its strings stay solid');
  for (const m of all.filter((p) => p !== near)) assert.ok(of(m.puppet).every((r) => r.alpha === 1), `${m.puppet} is clear of him and solid`);
  assert.ok(body.every((r) => r.alpha === 1), 'the hero himself is solid');
  // He steps away: it fades back in, smoothly (no blink).
  drive.state.player.x = near.cx - 90;
  const alphas = [];
  for (let i = 0; i < 40; i += 1) {
    drive.update();
    alphas.push(Math.min(...drawTagged(t).rects.filter((r) => r.tag === near.puppet && r.color !== stringColor).map((r) => r.alpha)));
  }
  assert.equal(alphas.at(-1), 1, 'back to solid');
  for (let i = 1; i < alphas.length; i += 1) assert.ok(alphas[i] >= alphas[i - 1] - 1e-9 && alphas[i] - alphas[i - 1] < 0.2, `a gentle fade: ${alphas.join(' ')}`);
});

// ---------- 2. every book he carries comes home in the ending ----------

const { route } = require('./finale-route');
const HANDED_IN = /Are those\.\.\. books\?/;
const fenwickSays = (VL, state) => [VL.pickDialogue(state, 'librarian').say].flat().join(' ');

test('forgiveness hands in every book he carries (the hoard\'s three too): nothing is greeted as a new find afterwards, and the card counts them', () => {
  const { VL, storage, drive } = fromSave({ edit: withBeats('finale:shown') });
  const before = drive.state.library.returned.length;
  const carried = VL.booksCarried(drive.state);
  assert.ok(VL.HOARD_BOOKS.every((id) => carried.includes(id)), 'he comes out of the Lair carrying the hoard books');
  route.ending(drive);
  assert.equal(drive.state.finished, true);
  assert.deepEqual(plain(VL.booksCarried(drive.state)), []);
  for (const id of carried) assert.ok(VL.bookReturned(drive.state, id), `${id} is on the shelves`);
  assert.equal(VL.readSlot(storage, 0).summary.books, before + carried.length, 'the FINISHED card counts every book he brought home');
  drive.walkTo({ area: 'library', screen: '0,0', tx: 7, ty: 6 });
  assert.doesNotMatch(fenwickSays(VL, drive.state), HANDED_IN);
});

test('an old finished save still carrying the hoard books (W20) shows them on its card and hands them in quietly on Continue', () => {
  const { VL } = loadGame();
  const text = fixtureText('save-v1-W20.json');
  const saved = JSON.parse(text);
  const backing = memoryStorage({ [VL.slotKey(0)]: text });
  const storage = VL.createStorage(backing);
  const slot = VL.readSlot(storage, 0);
  assert.equal(slot.summary.finished, true);
  assert.equal(slot.summary.books, saved.library.returned.length + VL.HOARD_BOOKS.length);
  const app = VL.createApp({ storage });
  app.startGame(VL.loadSlot(storage, 0), 0);
  app.setScene('play');
  const drive = createPlaythrough(VL, { app, milestones: ['ending'] }).drive;
  drive.hold([], 0.2);
  assert.deepEqual(plain(VL.booksCarried(drive.state)), []);
  assert.ok(VL.HOARD_BOOKS.every((id) => VL.bookReturned(drive.state, id)));
  assert.ok(!drive.state.events.some((e) => e.type === 'booksReturned'), 'no chime on waking up');
  assert.equal(JSON.parse(backing.getItem(VL.slotKey(0))).library.returned.length, slot.summary.books, 'healed and saved');
  assert.equal(VL.readSlot(storage, 0).summary.books, slot.summary.books, 'the card says the same after the heal');
  drive.walkTo({ area: 'library', screen: '0,0', tx: 7, ty: 6 });
  assert.doesNotMatch(fenwickSays(VL, drive.state), HANDED_IN);
});

test('an old save forgiven during the ending but closed before the credits is healed too, and plays the ending', () => {
  const { VL, drive } = fromSave({ edit: withBeats('forgiven') });
  drive.update();
  assert.equal(drive.app.sceneId, 'ending');
  assert.deepEqual(plain(VL.booksCarried(drive.state)), []);
});

test('a book found after the ending is a real new find: kept to hand in, and handed in at the library (with the welcome home, or greeted as a find after it)', () => {
  const { VL } = loadGame();
  const storage = VL.createStorage(memoryStorage({ [VL.slotKey(0)]: fixtureText('save-v1-W20.json') }));
  const app = VL.createApp({ storage });
  app.startGame(VL.loadSlot(storage, 0), 0);
  app.setScene('play');
  const drive = createPlaythrough(VL, { app, milestones: ['ending'] }).drive;
  drive.hold([], 0.2);
  const unfound = Object.keys(VL.BOOKS).find((id) => !VL.spotFound(drive.state, id));
  VL.findBook(drive.state, unfound);
  drive.hold([], 0.2);
  drive.reload();
  drive.hold([], 0.2);
  assert.deepEqual(plain(VL.booksCarried(drive.state)), [unfound], 'still his to hand in');
  // The welcome home hands it in with the ending's books; after that, a find is greeted as always.
  assert.match(fenwickSays(VL, drive.state), /Welcome back/);
  drive.state.flags['finale:welcomedHome'] = true;
  assert.match(fenwickSays(VL, drive.state), HANDED_IN);
  delete drive.state.flags['finale:welcomedHome'];
  const talks = talkThroughFenwick(VL, drive);
  assert.ok(VL.bookReturned(drive.state, unfound), 'handed in at the welcome home');
  assert.ok(talks.join(' ').includes(VL.BOOKS[unfound].kind === 'generic' ? VL.BOOKS[unfound].blurb : 'books back on the shelves'), talks.join(' | '));
});

// Talks to Mr. Fenwick at his desk and sits through every beat that follows,
// as a kid pressing S would. Returns each dialogue's words, in order.
function talkThroughFenwick(VL, drive) {
  drive.walkTo({ area: 'library', screen: '0,0', ...VL.LIBRARY_TALK_AT });
  drive.hold(['up'], 0.1);
  drive.press('interact');
  const talks = [];
  let seen = null;
  for (let i = 0; i < 200; i += 1) {
    if (drive.app.sceneId === 'dialogue' && drive.app.dialogue !== seen) {
      seen = drive.app.dialogue;
      talks.push(seen.pages.flat().join(' '));
    }
    if (drive.app.sceneId === 'play' && !drive.state.libraryChain && !drive.state.holdUp && !VL.currentPopup(drive.state)) break;
    drive.hold([], 0.35);
    if (drive.app.sceneId !== 'play') drive.press('interact');
  }
  drive.closePopups();
  return talks;
}
const blurbOf = (VL, id) => `"${VL.BOOKS[id].title}." ${VL.BOOKS[id].blurb}`;

function continueFrom(name) {
  const { VL } = loadGame();
  const storage = VL.createStorage(memoryStorage({ [VL.slotKey(0)]: fixtureText(name) }));
  const app = VL.createApp({ storage });
  app.startGame(VL.loadSlot(storage, 0), 0);
  app.setScene('play');
  const drive = createPlaythrough(VL, { app, milestones: ['ending'] }).drive;
  drive.hold([], 0.2);
  return { VL, drive };
}

for (const [how, start] of [
  ['after the real ending', () => {
    const t = fromSave({ edit: withBeats('finale:shown') });
    route.ending(t.drive);
    t.drive.reload();
    t.drive.hold([], 0.2);
    return t;
  }],
  ['in an old finished save healed on Continue (W20)', () => continueFrom('save-v1-W20.json')],
]) {
  test(`the first talk ${how}: he welcomes the hero home, reads the blurbs of the books the ending brought home, then gives the reward due`, () => {
    const { VL, drive } = start();
    assert.equal(drive.state.finished, true);
    const hp = drive.state.maxHp;
    assert.equal(VL.pendingReward(drive.state), 'heartLibrary', 'the hand-in made the 10-book reward due');
    const talks = talkThroughFenwick(VL, drive);
    assert.match(talks[0], /Welcome back/);
    assert.doesNotMatch(talks[0], /where were we/);
    assert.doesNotMatch(talks.join(' '), HANDED_IN);
    for (const id of VL.HOARD_BOOKS) assert.ok(talks.join(' ').includes(blurbOf(VL, id)), `${id}'s blurb is read`);
    assert.ok(talks.some((words) => words.includes('Ten books')), talks.join(' | '));
    assert.equal(VL.rewardGiven(drive.state, 'heartLibrary'), true, 'the heart is given');
    assert.equal(drive.state.maxHp, hp + 2);
    // Said once: the next talk is the usual after-the-ending line.
    drive.reload();
    drive.hold([], 0.2);
    assert.match(fenwickSays(VL, drive.state), /Full to the very top/);
  });
}

test('the welcome home is skippable: Esc on it still lets the books\' blurbs and the reward follow, and Esc skips those too', () => {
  const { VL, drive } = continueFrom('save-v1-W20.json');
  drive.walkTo({ area: 'library', screen: '0,0', ...VL.LIBRARY_TALK_AT });
  drive.hold(['up'], 0.1);
  drive.press('interact');
  assert.equal(drive.app.sceneId, 'dialogue');
  drive.press('pause');
  assert.equal(drive.state.flags['finale:welcomedHome'], true);
  drive.hold([], 0.1);
  assert.equal(drive.app.sceneId, 'dialogue', 'the blurbs come next');
  assert.ok(drive.app.dialogue.pages.flat().join(' ').includes(VL.BOOKS[VL.HOARD_BOOKS[0]].title));
  drive.press('pause');
  drive.hold([], 0.1);
  assert.equal(drive.app.sceneId, 'dialogue', 'then the reward');
  assert.match(drive.app.dialogue.pages.flat().join(' '), /Ten books/);
});

test('the W33 fixture (the finale played from the W19 save with the books brought home) loads FINISHED with nothing reset or left to hand in', () => {
  const { VL } = loadGame();
  const text = fixtureText('save-v1-W33.json');
  const storage = VL.createStorage(memoryStorage({ [VL.slotKey(0)]: text }));
  const slot = VL.readSlot(storage, 0);
  assert.equal(slot.status, 'ok');
  assert.deepEqual(plain(slot.resets), []);
  assert.equal(slot.summary.finished, true);
  assert.equal(slot.summary.books, JSON.parse(text).library.returned.length);
  const game = VL.loadSlot(storage, 0);
  assert.equal(game.flags['finale:booksHome'], true);
  assert.deepEqual(plain(VL.booksCarried(game)), []);
  assert.ok(VL.HOARD_BOOKS.every((id) => VL.bookReturned(game, id)));
  assert.deepEqual(plain(VL.endingBooks(game)).sort(), [...VL.HOARD_BOOKS].sort(), 'the books the ending brought home, for the welcome home');
  assert.ok(!game.flags['finale:welcomedHome'], 'not welcomed home yet');
});

// ---------- 3. Esc skips the ending wherever it is ----------

const darkness = (VL, view) => {
  const T = VL.ENDING_TIMES;
  if (view.phase === 'fadeIn') return 1 - view.t / T.fadeIn;
  if (view.phase === 'fadeOut') return view.t / T.fadeOut;
  return view.phase === 'credits' ? 1 : 0;
};

test('Esc during the first fade-in skips to the credits, fading on from as dark as it was (no flash of the scene)', () => {
  const { VL, drive } = fromSave({ edit: withBeats('forgiven') });
  drive.update();
  assert.equal(drive.app.sceneId, 'ending');
  drive.hold([], 0.4);
  assert.equal(drive.app.ending.phase, 'fadeIn');
  const was = darkness(VL, drive.app.ending);
  drive.press('pause');
  assert.equal(drive.app.ending.phase, 'fadeOut', 'Esc is heard in the fade-in');
  assert.ok(Math.abs(darkness(VL, drive.app.ending) - was) < 0.05, `no jump in the dark: ${was} -> ${darkness(VL, drive.app.ending)}`);
  drive.hold([], VL.ENDING_TIMES.fadeOut);
  assert.equal(drive.app.ending.phase, 'credits');
  assert.equal(drive.state.finished, true);
});

test('Esc during the fade-out changes nothing, and in the credits it does what S does: to THE END, then the title', () => {
  const { VL, drive } = fromSave({ edit: withBeats('forgiven') });
  drive.update();
  drive.hold([], VL.ENDING_TIMES.fadeIn + 0.1);
  drive.press('pause');
  drive.hold([], 0.3);
  const t = drive.app.ending.t;
  drive.press('pause');
  assert.equal(drive.app.ending.phase, 'fadeOut');
  assert.ok(drive.app.ending.t >= t, 'the fade goes on');
  drive.hold([], VL.ENDING_TIMES.fadeOut);
  assert.equal(drive.app.ending.phase, 'credits');
  drive.press('pause');
  assert.ok(drive.app.ending.t * VL.ENDING_TIMES.creditsSpeed > 200, 'jumped to THE END');
  assert.equal(drive.app.sceneId, 'ending');
  drive.press('pause');
  assert.equal(drive.app.sceneId, 'title');
});

// ---------- 4. no HUD over the ending ----------

test('the HUD (hearts, shells, hands, SAVED) is not drawn anywhere in the ending or the credits; play still draws it', () => {
  const { VL, app, drive } = fromSave({ edit: withBeats('forgiven') });
  let huds = 0;
  const hud = VL.ART.drawHud;
  VL.ART.drawHud = (...args) => {
    huds += 1;
    return hud(...args);
  };
  VL.render(recordingContext(), app, 1);
  assert.equal(huds, 1, 'play draws the HUD');
  drive.update();
  assert.equal(app.sceneId, 'ending');
  huds = 0;
  const phases = new Set();
  for (let i = 0; i < 400 && app.sceneId === 'ending'; i += 1) {
    drive.hold([], 0.1);
    phases.add(app.ending.phase);
    const ctx = recordingContext();
    VL.render(ctx, app, i / 10);
    assert.ok(!ctx.rects.some((r) => r.y === 0 && r.h === VL.TUNING.hudHeight && r.w === VL.TUNING.width && r.color === VL.ART.color('hud')), `no HUD strip in ${app.ending.phase}`);
    if (i % 5 === 4) drive.press('interact');
  }
  assert.deepEqual([...phases].sort(), ['beats', 'credits', 'fadeIn', 'fadeOut']);
  assert.equal(huds, 0);
});

// ---------- 6. the slingshot's ammo count sits inside its slot ----------

test('the slingshot\'s ammo count (and its shadow) sits inside the slot\'s frame, in either hand, at one to three digits', () => {
  const { VL } = loadGame();
  const layout = VL.ART.HUD_LAYOUT;
  for (const hand of ['mainHand', 'offHand']) {
    for (const count of [9, 15, 250]) {
      const game = VL.newGame({ name: 'Robin' });
      game.items.slingshot = true;
      game.hands = { mainHand: null, offHand: null, [hand]: 'slingshot' };
      game.inventory.brokenShells = count;
      const ctx = recordingContext();
      const text = VL.ART.text;
      VL.ART.text = (c, str, ...rest) => {
        if (str === String(count) && rest[2]?.size === 'small') ctx.tag = 'ammo';
        try {
          return text(c, str, ...rest);
        } finally {
          ctx.tag = undefined;
        }
      };
      try {
        VL.ART.drawHud(ctx, game, 0);
      } finally {
        VL.ART.text = text;
      }
      const slot = layout.slots.find((s) => s.hand === hand);
      const ammo = ctx.rects.filter((r) => r.tag === 'ammo');
      assert.ok(ammo.length > 0, `${hand} ${count} drawn`);
      for (const r of ammo) {
        assert.ok(r.x >= slot.x + 1 && r.x + r.w <= slot.x + layout.slotW - 1, `${hand} ${count}: x ${r.x}..${r.x + r.w} clear of the frame`);
        assert.ok(r.y >= layout.slotY + 1 && r.y + r.h <= layout.slotY + layout.slotH - 1, `${hand} ${count}: y ${r.y}..${r.y + r.h} clear of the frame`);
      }
    }
  }
});
