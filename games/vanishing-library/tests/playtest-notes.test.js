// W28, Matthew's first playtest notes: the words checked for doubled words,
// the bindery's bare shelves, the titled books spread along the path, a
// slower start, the "hold it up" moment and the librarian noticing gaps.
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { test, read, loadGame, playApp, fakeDocument } = require('./harness');

// ---------- the words ----------

// Every string literal in a game file that reads like words for players.
// Developer messages (errors, solver reports, doc citations) are skipped.
function playerStrings() {
  const context = { globalThis: {} };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(read('manifest.js'), context);
  const strings = [];
  for (const file of Object.values(context.VL.FILES).flat()) {
    read(file).split('\n').forEach((line, i) => {
      if (/^\s*\/\//.test(line) || /Error\(|problems\.push|report\(|found\.push|doc: '§|replan: /.test(line)) return;
      for (const match of line.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
        const text = (match[1] ?? match[2] ?? match[3]).replace(/\\(.)/g, '$1').replace(/\$\{[^}]*\}/g, '#');
        if (/[a-z]{2,} [a-zA-Z]/.test(text) && !text.startsWith('§')) strings.push({ where: `${file}:${i + 1}`, text });
      }
    });
  }
  return strings;
}

// Little words that can sit twice in a sentence without anyone noticing.
const SMALL = new Set(('a an the and or but nor of to in on at by for with from up down out into over off as so if then than '
  + 'is it its it\'s be was were are am been have has had do does did can will would could should may might must '
  + 'i me my you your you\'re he him his she her they them their we us our this that these those there what who '
  + 'not no all any some every each one more most very just too only').split(' '));

// Repeats that are meant: a chant, a list, a laugh.
const MEANT = [
  /thank you, thank you/i, /busy, busy/i, /clang, clang, clang/i, /round and round/i, /far, far/i, /ha ha ha/i,
  /wood for shells, shells for paper/i, /fetched/i, /^into /i, /^crab large/i,
];

// A sentence ends where the next one starts with a capital; "..." and ":"
// carry on the same sentence ("Now... that works now" is one).
const sentencesOf = (text) => text.split(/(?<=[.!?]["”]?)\s+(?=[A-Z"“])/).map((s) => s.trim()).filter(Boolean);

function repeatedWords(sentence) {
  if (MEANT.some((pattern) => pattern.test(sentence))) return [];
  const seen = new Set();
  const twice = new Set();
  for (const word of sentence.toLowerCase().match(/[a-zà-ÿ]+(?:'[a-z]+)?/g) || []) {
    if (word.length < 3 || SMALL.has(word)) continue;
    if (seen.has(word)) twice.add(word);
    seen.add(word);
  }
  return [...twice];
}

test('no sentence a player reads repeats a word by accident ("Now that works, now")', () => {
  const strings = playerStrings();
  assert.ok(strings.length > 300, `${strings.length} strings found`);
  const problems = [];
  for (const { where, text } of strings) {
    for (const sentence of sentencesOf(text)) {
      const twice = repeatedWords(sentence);
      if (twice.length) problems.push(`${where} "${sentence}" repeats ${twice.join(', ')}`);
    }
  }
  assert.deepEqual(problems, []);
});

test('the doubled-word check catches the kind of line Matthew saw, and lets a chant through', () => {
  assert.deepEqual(repeatedWords('Now that works better, now.'), ['now']);
  assert.deepEqual(repeatedWords('Wood gear, I make from wood.'), ['wood']);
  assert.deepEqual(sentencesOf('Now... that works now: see?').flatMap(repeatedWords), ['now'], 'an ellipsis or colon does not hide a repeat');
  assert.deepEqual(sentencesOf('I bind books... or I used to. Books vanish.').flatMap(repeatedWords), [], 'separate sentences are checked apart');
  assert.deepEqual(repeatedWords('Oh, thank you, thank you, Robin!'), []);
  assert.deepEqual(repeatedWords('The tide brings in shells every morning.'), []);
});

test('a titled book\'s last page and the popup after it never end on the same word', () => {
  const { VL } = loadGame();
  const lastWord = (text) => (text.toLowerCase().match(/[a-z']+/g) || []).at(-1);
  const problems = [];
  for (const book of Object.values(VL.BOOKS).filter((b) => b.kind === 'titled')) {
    const state = VL.newGame();
    book.read(state);
    const popup = VL.currentPopup(state);
    if (popup && lastWord(popup.text) === lastWord(book.reading.at(-1))) problems.push(`${book.id}: both end on "${lastWord(popup.text)}"`);
  }
  assert.deepEqual(problems, []);
});

// ---------- the bindery ----------

// Every fillRect a draw makes, as [x, y, w, h].
function rectsDrawn(draw) {
  const rects = [];
  const ctx = new Proxy({}, {
    get: (target, property) => (property === 'fillRect' ? (...box) => rects.push(box) : (property in target ? target[property] : () => ({ addColorStop() {} }))),
    set: (target, property, value) => { target[property] = value; return true; },
  });
  draw(ctx);
  return rects;
}

test('the bindery\'s shelves are nearly bare: a few loose pages and tools, hardly a book', () => {
  const { VL } = loadGame();
  const decor = VL.getScreen('bindery', '0,0').entities.filter((e) => e.type === 'decor');
  const shelves = decor.filter((e) => /shelf/i.test(e.art));
  assert.equal(shelves.length, 2, 'two wall shelves behind the counter');
  // A standing book on a shelf is a 2×5 spine; the old bookcases drew about 90.
  const spines = shelves.flatMap((e) => rectsDrawn((ctx) => VL.DECOR[e.art](ctx, e.x * 16, e.y * 16, 0, e))).filter(([, , w, h]) => w === 2 && h === 5);
  assert.ok(spines.length <= 3, `${spines.length} books on the bindery shelves`);
  assert.ok(!decor.some((e) => e.art === 'bookcase'), 'no full bookcase left in the bindery');
});

test('Miss Quill\'s first words: business is down, since nobody wants a book that might vanish', () => {
  const { VL } = loadGame();
  const state = VL.newGame();
  const first = [].concat(VL.pickDialogue(state, 'binder').say).join(' ');
  assert.match(first, /business/i);
  assert.match(first, /vanish|disappear/i);
  assert.match(first, /five/i, 'she still asks for five loose pages');
});

// ---------- the titled books, later along the path ----------

// Every key a lock transitively needs (all any-of alternatives included).
function needsOf(VL, id) {
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

test('the six titled books wait behind later progress, each where it is useful', () => {
  const { VL } = loadGame();
  const behind = {
    bookPrimer: 'liftingGloves', // the east road, as D1's mortar brings ink for a map
    bookHerbalist: 'woodsMapCopy', // in the Woods, after D1
    bookChickenAlmanac: 'woodsMapCopy', // at the heart of the Woods, long before the highlands
    bookSmithsLedger: 'shockwave', // the lake island, when gear must be forged again
    bookTideTables: 'shockwave', // the shipwreck, when shells must be dug again
    bookDragons: 'climbersAlmanac', // the highlands, on the way to the dragon
  };
  for (const [id, key] of Object.entries(behind)) assert.ok(needsOf(VL, id).has(key), `${id} needs ${key}`);
  const opening = ['town', 'beach', 'homeFields', 'cliffs', 'lake'].flatMap((region) => VL.REGIONS[region].screens);
  for (const id of Object.keys(behind)) {
    const spot = VL.SPOTS[id];
    assert.ok(!(spot.area === 'overworld' && opening.includes(spot.screen) && spot.screen !== '3,-3'), `${id} is not lying about town at the start (${spot.screen})`);
  }
});

test('the Herbalist\'s trunk keeps away from the Woods\' secret ore, so the Smith\'s Ledger still has it to reveal', () => {
  const { VL } = loadGame();
  const herbalist = VL.SPOTS.bookHerbalist;
  const ore = VL.SPOTS.oreWoods;
  assert.equal(herbalist.area, 'overworld');
  assert.ok(VL.REGIONS.woods.screens.includes(herbalist.screen), `still in the Woods (${herbalist.screen})`);
  assert.notEqual(herbalist.screen, ore.screen, 'not on the ore\'s screen');
  assert.match(VL.BOOKS.bookSmithsLedger.reading.join(' '), /ore hiding in the Woods/);
});

test('the solver stays green; the 10-book heart comes before the shockwave, the purse and the boots after it (W30)', () => {
  const { VL } = loadGame();
  const result = VL.solveProgression();
  assert.deepEqual([...result.problems], []);
  const beforeShockwave = result.stages[0].reached;
  for (const id of ['heartLibrary', 'bookPrimer', 'bookHerbalist', 'bookChickenAlmanac']) assert.ok(beforeShockwave.includes(id), id);
  for (const id of ['shellPurse', 'swiftfootBoots']) {
    assert.ok(!beforeShockwave.includes(id), `${id} comes after the shockwave`);
    assert.ok(result.stages.some((stage) => stage.reached.includes(id)), `${id} is reachable`);
  }
  for (const id of ['bookSmithsLedger', 'bookTideTables', 'bookDragons']) assert.ok(!beforeShockwave.includes(id), `${id} comes after the shockwave`);
});

// Walking speed: W34 slowed it again (tests/playtest-4.test.js).

// ---------- holding it up ----------

function heldApp() {
  const document = fakeDocument();
  const { VL } = loadGame({ document });
  const sounds = [];
  VL.sfx = (name) => {
    sounds.push(name);
    return true;
  };
  const app = playApp(VL);
  app.game.popups.seen.controls = true;
  app.game.popups.queue.length = 0;
  const step = (actions = VL.noActions()) => app.update(actions, 1 / 60);
  const hold = (held, seconds) => {
    for (let t = 0; t < seconds - 1e-9; t += 1 / 60) step(VL.actions({ held }));
  };
  const drawn = () => {
    const ids = [];
    const draw = VL.ART.drawSprite;
    VL.ART.drawSprite = (ctx, id, ...rest) => {
      ids.push(id);
      return draw(ctx, id, ...rest);
    };
    VL.render(document.createElement('canvas').getContext('2d'), app, 0);
    VL.ART.drawSprite = draw;
    return ids;
  };
  return { VL, app, sounds, step, hold, drawn };
}

test('every item can be held up: each one has its sprite', () => {
  const { VL } = loadGame();
  const missing = Object.keys(VL.ITEMS).filter((id) => !VL.ART.SPRITES[VL.itemSprite(id)]);
  assert.deepEqual(missing, [], 'VL.holdUp throws on a missing sprite');
});

test('opening the hut chest: the hero holds the sword and shield up with a jingle, then the popup names them', () => {
  const { VL, app, sounds, step, hold, drawn } = heldApp();
  VL.place(app.game, { area: 'hut', screen: '0,0', tx: 12, ty: 3, facing: 'up' });
  step(VL.actions({ pressed: ['interact'] }));
  assert.ok(VL.hasItem(app.game, 'woodSword'));
  assert.deepEqual([...app.game.holdUp.sprites], ['item-sword-wood', 'item-shield-wood']);
  assert.ok(sounds.includes('holdUpJingle'), 'a jingle');
  assert.equal(app.sceneId, 'play', 'held up before any popup');
  const sprites = drawn();
  assert.ok(sprites.includes('hero-hold') && sprites.includes('item-sword-wood') && sprites.includes('item-shield-wood'), 'arms up, both items overhead');
  const x = app.game.player.x;
  hold(['left'], VL.TUNING.holdUpSeconds * 0.8);
  assert.equal(app.game.player.x, x, 'the world waits while he holds it');
  assert.equal(app.sceneId, 'play');
  hold([], VL.TUNING.holdUpSeconds * 0.3);
  assert.equal(app.sceneId, 'popup');
  assert.equal(VL.currentPopup(app.game).id, 'woodSword');
  assert.ok(drawn().includes('hero-hold'), 'still holding it while the popup names it');
  for (let i = 0; i < 6 && app.sceneId === 'popup'; i += 1) {
    hold([], 0.4);
    step(VL.actions({ pressed: ['interact'] }));
  }
  step();
  assert.equal(app.sceneId, 'play');
  assert.equal(app.game.holdUp, null);
  assert.ok(!drawn().includes('hero-hold'), 'arms down again');
  hold(['left'], 0.3);
  assert.ok(app.game.player.x < x, 'and he walks on');
});

test('every handover holds up: librarian rewards, the Scriptorium key, heart containers, big chests, the Bookworm and Pip', () => {
  const { VL } = loadGame();
  const fresh = () => {
    const state = VL.newGame();
    VL.place(state, { area: 'overworld', screen: VL.START.screen, tx: VL.START.tx, ty: VL.START.ty });
    return state;
  };
  const cases = {
    shellPurse: (state) => {
      state.library.returned = Array.from({ length: 20 }, (_, i) => `b${i}`);
      state.flags['reward:heartLibrary'] = true;
      VL.giveLibraryReward(state, 'shellPurse');
      return 'item-purse';
    },
    swiftfootBoots: (state) => {
      state.library.returned = Array.from({ length: 30 }, (_, i) => `b${i}`);
      state.flags['reward:heartLibrary'] = true;
      state.flags['reward:shellPurse'] = true;
      VL.giveLibraryReward(state, 'swiftfootBoots');
      return 'item-swiftfoot';
    },
    heartLibrary: (state) => {
      state.library.returned = Array.from({ length: 10 }, (_, i) => `b${i}`);
      VL.giveLibraryReward(state, 'heartLibrary');
      return 'pickup-heart-container';
    },
    scriptoriumKey: (state) => {
      VL.markFound(state, 'hiddenBookSealed');
      VL.returnBooks(state);
      VL.finishReading(state, 'hiddenBookSealed');
      return 'item-scriptorium-key';
    },
    bigChest: (state) => {
      VL.ENTITIES.bigChest.onInteract(state, { id: 'testBigChest', item: 'liftingGloves' });
      return 'item-lifting-gloves';
    },
    bookworm: (state) => {
      VL.DUNGEONS.scriptorium.boss.onDefeat(state);
      return 'item-mortar';
    },
    pip: (state) => {
      VL.endTalk(state, { give: { lostChicken: true } });
      return 'pickup-page';
    },
  };
  for (const [name, give] of Object.entries(cases)) {
    const state = fresh();
    const sprite = give(state);
    assert.ok(state.holdUp, `${name} is held up`);
    assert.ok(state.holdUp.sprites.includes(sprite), `${name} shows ${sprite} (got ${[...state.holdUp.sprites]})`);
    assert.ok(state.events.some((e) => e.type === 'holdUp'), `${name} plays the hold-up`);
  }
  const sounds = [];
  VL.sfx = (name) => sounds.push(name) > 0;
  VL.giveHeartContainer(fresh());
  assert.deepEqual(sounds, ['fanfare'], 'a heart container keeps its own fanfare, no jingle on top');
  sounds.length = 0;
  VL.ENTITIES.bigChest.onInteract(fresh(), { id: 'testBigChest', item: 'liftingGloves' });
  assert.deepEqual(sounds, ['fanfare'], 'so does a big chest');
  sounds.length = 0;
  const pair = fresh();
  VL.holdUp(pair, 'item-sword-wood');
  VL.holdUp(pair, 'item-shield-wood');
  assert.deepEqual(sounds, ['holdUpJingle'], 'two things held up together are heard once');
});

// ---------- the librarian notices ----------

function libraryWithLosses(VL, lost, { carrying = [] } = {}) {
  const state = VL.newGame();
  state.flags['met:fenwick'] = true;
  const ids = ['bookRiverside', 'bookCliffRoad', 'bookLighthouse', 'bookMeadowRock', 'bookEastRoad', 'bookWoods', 'bookLakeShore'];
  for (const id of ids) VL.markFound(state, id);
  VL.returnBooks(state);
  state.library.gone.push(...ids.slice(0, lost));
  for (const id of carrying) VL.markFound(state, id);
  return state;
}
const talk = (VL, state) => {
  const entry = VL.pickDialogue(state, 'librarian');
  VL.endTalk(state, { set: entry.set, give: entry.give });
  return [].concat(entry.say).map((line) => VL.popupText(line, state));
};

test('the librarian remarks on books that vanished since the last visit, first thing, once per loss', () => {
  const { VL } = loadGame();
  const state = libraryWithLosses(VL, 1);
  const first = talk(VL, state);
  assert.match(first[0], /one of the books|a book|another book/i);
  assert.match(first[0], /gone|vanish|missing/i);
  const again = talk(VL, state);
  assert.ok(!/gone|vanish|missing/i.test(again.join(' ')), `said once for the same loss: ${again}`);
  state.library.gone.push('bookCliffRoad', 'bookLighthouse');
  assert.match(talk(VL, state)[0], /\btwo\b/i, 'two more since last time');
  state.library.gone.push('bookMeadowRock', 'bookEastRoad', 'bookWoods');
  assert.match(talk(VL, state)[0], /\bthree\b/i);
});

test('carrying books in, he says what vanished first and then takes the new ones', () => {
  const { VL } = loadGame();
  const state = libraryWithLosses(VL, 2, { carrying: ['bookBeachBuried'] });
  const words = talk(VL, state);
  assert.match(words[0], /two/i);
  assert.match(words[1], /books\?|found books/i);
  assert.ok(VL.bookReturned(state, 'bookBeachBuried'), 'the books were handed in');
  assert.equal(state.library.noticed, 2);
});

test('his remarks vary, read cleanly and fit the font', () => {
  const { VL } = loadGame();
  const seen = new Set();
  const state = libraryWithLosses(VL, 0);
  for (let i = 0; i < 4; i += 1) {
    state.library.gone.push(state.library.returned[i]);
    seen.add(talk(VL, state)[0]);
  }
  assert.ok(seen.size >= 3, `${seen.size} different lines for four single losses`);
  for (const line of VL.VANISHED_REMARKS) {
    const text = VL.popupText(line, { name: 'Ñandú Élodïe' });
    assert.deepEqual([...VL.ART.missingGlyphs(text)], [], line);
    for (const sentence of sentencesOf(text)) assert.deepEqual(repeatedWords(sentence), [], line);
    assert.doesNotMatch(line, /\bmore\b/, `the first remark ever may count several books, so none says "more": ${line}`);
  }
});

test('a reward at the end of a talk or a reading is held up before its popup, not after', () => {
  const { VL, app, step } = heldApp();
  const g = app.game;
  g.flags['met:fenwick'] = true;
  const nine = Object.keys(VL.BOOKS).filter((id) => VL.BOOKS[id].kind === 'generic').slice(0, 9);
  for (const id of [...nine, 'hiddenBookSealed']) VL.markFound(g, id);
  VL.place(g, { area: 'library', screen: '0,0', ...VL.LIBRARY_TALK_AT, facing: 'up' });
  const seen = [];
  for (let i = 0; i < 60 * 30 && !(VL.rewardGiven(g, 'heartLibrary') && !g.holdUp && app.sceneId === 'play'); i += 1) {
    step(i % 10 === 0 && (app.sceneId !== 'play' || i === 0) ? VL.actions({ pressed: ['interact'] }) : VL.noActions());
    const popup = VL.currentPopup(g)?.id || null;
    if (app.sceneId === 'popup' && seen.at(-1)?.popup !== popup) seen.push({ popup, holding: Boolean(g.holdUp), held: g.holdUp ? g.holdUp.t : null });
  }
  const key = seen.find((s) => s.popup === 'scriptoriumKey');
  const heart = seen.find((s) => s.popup === 'heartContainer');
  assert.ok(key && heart, `both popups shown: ${JSON.stringify(seen)}`);
  for (const shown of [key, heart]) assert.ok(shown.holding && shown.held >= VL.TUNING.holdUpSeconds, `${shown.popup} only after the hold-up: ${JSON.stringify(shown)}`);
});

test('every reward the librarian hands over is heard: the 10-book heart\'s fanfare, the 20-book purse\'s jingle, the sealed book\'s key', () => {
  const { VL, app, sounds, step } = heldApp();
  const g = app.game;
  g.flags['met:fenwick'] = true;
  const generic = Object.keys(VL.BOOKS).filter((id) => VL.BOOKS[id].kind === 'generic').slice(0, 19);
  assert.equal(generic.length, 19);
  for (const id of [...generic, 'hiddenBookSealed']) VL.markFound(g, id);
  VL.place(g, { area: 'library', screen: '0,0', ...VL.LIBRARY_TALK_AT, facing: 'up' });
  const heard = {};
  const done = () => VL.rewardGiven(g, 'shellPurse') && VL.rewardGiven(g, 'heartLibrary') && VL.hasItem(g, 'scriptoriumKey') && !g.holdUp && app.sceneId === 'play';
  for (let i = 0; i < 60 * 60 && !done(); i += 1) {
    const before = g.holdUp ? null : sounds.length;
    step(i % 10 === 0 && (app.sceneId !== 'play' || i === 0 || !g.holdUp) ? VL.actions({ pressed: ['interact'] }) : VL.noActions());
    if (before !== null && g.holdUp) heard[g.holdUp.sprites[0]] = sounds.slice(before);
  }
  assert.ok(done(), `all three given: ${JSON.stringify(heard)}`);
  assert.ok(heard['pickup-heart-container']?.includes('fanfare'), `the heart's fanfare: ${JSON.stringify(heard)}`);
  assert.ok(!heard['pickup-heart-container'].includes('holdUpJingle'), 'no jingle on top of the fanfare');
  assert.ok(heard['item-purse']?.includes('holdUpJingle'), `the purse's jingle: ${JSON.stringify(heard)}`);
  assert.ok(heard['item-scriptorium-key']?.includes('holdUpJingle'), `the key's jingle: ${JSON.stringify(heard)}`);
});

// ---------- later notes ----------

test('a tree in the Woods never sprouts a red mushroom that looks like a hidden book', () => {
  const { VL } = loadGame();
  const moss = VL.ART.TILE_STYLES.moss;
  const colourRects = (info, seedValue) => {
    const fills = [];
    const ctx = { set fillStyle(value) { this.style = value; }, get fillStyle() { return this.style; }, fillRect() { fills.push(this.style); } };
    moss.ground(ctx, { x: 0, y: 0, tx: 0, ty: 0, info, near: () => info, seed: () => seedValue });
    return fills;
  };
  const red = VL.ART.color('heart');
  assert.ok(colourRects(VL.tileInfo('overworld', 'f'), 0.9).includes(red), 'open forest floor keeps its mushrooms');
  assert.ok(!colourRects(VL.tileInfo('overworld', 'F'), 0.9).includes(red), 'no mushroom under a tree');
});

test('"Rocks and How to Lift Them" turns up near the start, before the gloves, not after', () => {
  const { VL } = loadGame();
  const id = Object.keys(VL.BOOKS).find((book) => VL.BOOKS[book].title === 'Rocks and How to Lift Them');
  assert.ok(!VL.LOCKS[id].needs.flat().some((key) => ['liftingGloves', 'eastRoad'].includes(key)), `${id} needs ${VL.LOCKS[id].needs}`);
  assert.ok(VL.LOCKS[id].needs.includes('town'), 'lying about town');
});
