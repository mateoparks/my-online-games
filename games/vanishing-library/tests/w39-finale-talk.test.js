// W39, Matthew's finale talk: his final script word for word (after the last
// string, the confession show, the forgiveness, the ending), dialogue boxes
// that never cover the one speaking, and Mr. Fenwick's new look (warm brown
// skin, black hair, a little gray at the temples), clear of Gran Ottie's.
const assert = require('node:assert/strict');
const { test, loadGame, fakeContext } = require('./harness');

const plain = (value) => JSON.parse(JSON.stringify(value));
const HER = 'Mrs. Fenwick';
const HIM = 'Mr. Fenwick';

// ---------- 1. the script, word for word ----------

const SHOW_ASKED = [
  [HER, 'Stop! Please, that\'s enough. Oh, {name}, my puppets could have hurt you. Whatever was I thinking?'],
  [HIM, 'My dear... the books. All this time, was it you?'],
  [HER, 'Yes. Let me tell it the only way I know how. One last show.'],
];
const CONFESSION = [
  [null, 'Once upon a time, a puppeteer lived in a little town by the sea. But it was not her town, and she missed home.'],
  [null, 'She married a kind librarian who would never, ever leave his books. So she had a sad, silly idea: if the books were gone, perhaps he would leave too.'],
  [null, 'Every night, she carried books up a secret tunnel to a sleepy old dragon, who was glad to keep them.'],
  [null, 'But the library and its librarian only grew sadder, and so did she.'],
  [null, 'Then a brave young hero came along, and brought every book back home.'],
  [HER, 'The end.'],
];
const FORGIVEN = [
  [HER, 'I\'m so sorry, my dear. I only wanted to go home.'],
  [HIM, 'Oh, my sweetheart, I\'m sorry I didn\'t realize how much you missed home.'],
  [HER, 'Let\'s fix this! Let\'s bring back all the books and fill the library!'],
  [HIM, 'Yes, and then let\'s plan a visit to your home town together!'],
  [HER, 'Oh! Do you mean it? Then I\'ll put on a puppet show there, all about this town.'],
];
const ENDING = [
  [null, 'The whole town helped carry the Dragon\'s hoard home, and the books went back on the shelves. This time, they stayed.'],
  ['Miss Quill', 'And here\'s a brand-new one I bound myself: "The Adventures of {name}"!'],
  ['Gran Ottie', 'Three cheers for {name}!'],
  ['Everyone', 'Hip, hip, hooray! Hip, hip, hooray! Hip, hip, HOORAY!'],
  [null, 'Before long, the whole town was reading and writing books of its own, and Miss Quill\'s bindery was busy day and night.'],
];

test('the finale says Matthew\'s script word for word: after the last string, the show, the forgiveness and the ending', () => {
  const { VL } = loadGame();
  assert.deepEqual(plain(VL.FINALE_WORDS.showAsked), SHOW_ASKED);
  assert.deepEqual(plain(VL.CONFESSION_SHOW.beats.map((b) => [b.speaker || null, b.say])), CONFESSION);
  assert.equal(VL.CONFESSION_SHOW.title, 'The Puppeteer Who Missed Home');
  assert.deepEqual(plain(VL.FINALE_WORDS.forgiven), FORGIVEN);
  assert.deepEqual(plain(VL.ENDING_BEATS.map((b) => [b.speaker || null, b.say])), ENDING);
});

test('the ending\'s pictures follow the words: the shelves fill in the first box, the hero\'s book from Miss Quill\'s, the cheer hops', () => {
  const { VL } = loadGame();
  const beats = VL.ENDING_BEATS;
  assert.equal(beats[0].fill, 1, 'the books go back on the shelves within the first box');
  assert.ok(beats[0].party, 'the whole town carries them home');
  assert.ok(!beats[0].heroBook);
  assert.ok(beats.slice(1).every((b) => b.party && b.heroBook), 'the hero\'s book from "here\'s a brand-new one" on');
  assert.deepEqual(plain(beats.map((b) => Boolean(b.cheer))), [false, false, false, true, false], 'EVERYONE hops');
});

test('the confession show\'s puppets act out each line', () => {
  const { VL } = loadGame();
  const casts = VL.CONFESSION_SHOW.beats.map((b) => Object.keys(b.cast).sort());
  assert.deepEqual(plain(casts[0]), ['wife'], 'the puppeteer alone, missing home');
  assert.ok(VL.CONFESSION_SHOW.beats[0].move?.wife, 'and she shows it');
  assert.ok(casts[1].includes('wife') && casts[1].includes('librarian') && casts[1].includes('book'), 'the librarian and his books');
  assert.ok(casts[2].includes('wife') && casts[2].includes('book') && casts[2].includes('dragon'), 'books up the tunnel to the dragon');
  assert.deepEqual(plain(casts[3]), ['librarian', 'wife'], 'both sadder');
  assert.ok(casts[4].includes('hero') && casts[4].includes('book'), 'the hero brings them home');
  assert.deepEqual(plain(casts[5]), ['wife']);
});

test('every box of the script fits one text box, with the longest names', () => {
  const { VL } = loadGame();
  for (const name of ['Robin', 'Ñandú Élodïe', 'WWWWWWWWWWWW']) {
    const state = { name };
    for (const [speaker, text] of [...SHOW_ASKED, ...CONFESSION, ...FORGIVEN, ...ENDING]) {
      const shown = VL.popupText(text, state);
      assert.deepEqual(plain(VL.ART.missingGlyphs(shown)), [], text);
      assert.ok(!VL.ART.popupLayout({ text: shown, title: speaker }).overflow, `one box for ${name}: ${text}`);
      assert.equal(VL.dialoguePages(text, state).length, 1, text);
    }
  }
});

// ---------- 2. the box never covers the one speaking ----------

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// Draws the scene once and returns the text box and every sprite drawn in the
// world, in canvas pixels, outlines included.
function drawnFrame(VL, app) {
  const sprites = [];
  let box = null;
  const { drawSprite, drawPopup } = VL.ART;
  VL.ART.drawSprite = (ctx, id, x, y) => {
    const s = VL.ART.sprite(id);
    sprites.push({ id, x: Math.round(x) + s.offset, y: Math.round(y) + s.offset + VL.TUNING.hudHeight, w: s.width, h: s.height });
    return drawSprite(ctx, id, x, y);
  };
  VL.ART.drawPopup = (ctx, popup, t) => {
    box = drawPopup(ctx, popup, t);
    return box;
  };
  try {
    for (const t of [0, 0.4, 0.8, 1.2]) VL.render(fakeContext(), app, t);
  } finally {
    Object.assign(VL.ART, { drawSprite, drawPopup });
  }
  return { box, sprites };
}
const lookOf = (VL, name) => Object.values(VL.NPCS).find((npc) => npc.name === name)?.look;
const spritesOf = (sprites, prefix) => sprites.filter((s) => s.id.startsWith(prefix));
const HERO = /^hero-/;

// Every page of the talk on screen now: who speaks, the box, the sprites.
function pagesOf(VL, app) {
  const out = [];
  const view = app.dialogue;
  for (let page = 0; page < view.pages.length; page += 1) {
    Object.assign(view, { page, shown: 999 });
    out.push({ speaker: view.speakers?.[page] ?? view.speaker, ...drawnFrame(VL, app) });
  }
  return out;
}

// The speaker's sprite is always clear of the box, which takes the half of
// the screen away from them whenever that half leaves them in view.
function checkTalk(VL, app, where) {
  const { hudHeight, rows, tile } = VL.TUNING;
  for (const { speaker, box, sprites } of pagesOf(VL, app)) {
    const look = lookOf(VL, speaker);
    const mine = spritesOf(sprites, `npc-${look}-`);
    assert.ok(mine.length, `${where}: ${speaker} is drawn`);
    for (const s of mine) assert.ok(!overlaps(box, s), `${where}: the box covers ${speaker} (${JSON.stringify(s)} vs y ${box.y}..${box.y + box.h})`);
    const lower = mine[0].y - hudHeight + mine[0].h / 2 > (rows * tile) / 2;
    const away = VL.ART.popupLayout({ title: box.title, text: box.lines.join('\n'), at: lower ? 'top' : 'bottom' });
    if (mine.every((s) => !overlaps(away, s))) assert.equal(box.y, away.y, `${where}: ${speaker} speaks and the box is not on the half away from them`);
  }
}

function hallApp(VL, flags, heroAt) {
  const app = VL.createApp();
  app.game = VL.newGame({ name: 'Robin' });
  const game = app.game;
  game.popups.seen.controls = true;
  game.popups.queue.length = 0;
  for (const id of flags) game.flags[id] = true;
  app.setScene('play');
  VL.place(game, { area: 'workshop', ...heroAt, facing: 'up' });
  return app;
}
function talk(VL, app, lines) {
  VL.conversation(app.game, lines);
  const request = app.game.sceneRequest;
  app.game.sceneRequest = null;
  app.setScene(request.id, request.data);
}
const SPOTS = [{ tx: 7, ty: 9 }, { tx: 3, ty: 9 }, { tx: 7, ty: 5 }, { tx: 2, ty: 4 }, { tx: 13, ty: 7 }, { tx: 10, ty: 4 }];

test('in the hall, Mrs. Fenwick on her gallery speaks over a box low on the screen, Mr. Fenwick on the floor over one high up', () => {
  const { VL } = loadGame();
  const app = hallApp(VL, ['trapdoorOpen', 'finale:followed'], { screen: VL.FINALE.hall, tx: 7, ty: 9 });
  talk(VL, app, VL.FINALE_WORDS.confronted);
  const pages = pagesOf(VL, app);
  assert.deepEqual(plain(pages.map((p) => [p.speaker, p.box.y > 100 ? 'low' : 'high'])), [[HER, 'low'], [HIM, 'high'], [HER, 'low']]);
});

test('no box in the hall covers the one speaking, wherever the hero stands: before the fight, after it, and the forgiveness', () => {
  const { VL } = loadGame();
  const W = VL.FINALE_WORDS;
  const before = ['trapdoorOpen', 'finale:followed'];
  const after = [...before, 'finale:confronted', 'marionettes'];
  for (const spot of SPOTS) {
    for (const [flags, lines, name] of [[before, W.confronted, 'confronted'], [after, W.showAsked, 'showAsked'], [[...after, 'finale:showAsked', 'finale:shown'], W.forgiven, 'forgiven']]) {
      const app = hallApp(VL, flags, { screen: VL.FINALE.hall, ...spot });
      if (flags.includes('marionettes')) VL.wifeComesDown(app.game);
      talk(VL, app, lines);
      checkTalk(VL, app, `hall ${name}, hero at ${spot.tx},${spot.ty}`);
    }
  }
});

test('no box covers the one speaking in the workshop, at the library desk or in town', () => {
  const { VL } = loadGame();
  for (const spot of [{ tx: 7, ty: 8 }, { tx: 7, ty: 2 }, { tx: 12, ty: 5 }]) {
    const app = hallApp(VL, ['trapdoorOpen'], { screen: VL.FINALE.workshop, ...spot });
    talk(VL, app, VL.FINALE_WORDS.followed);
    checkTalk(VL, app, `workshop, hero at ${spot.tx},${spot.ty}`);
  }
  // Talking to someone for real: S facing them, from each side.
  const app = VL.createApp();
  for (const [area, screen, id] of [['library', '0,0', 'librarian'], ['overworld', '2,0', 'gran'], ['overworld', '2,0', 'librarianWife'], ['overworld', '2,1', 'nell']]) {
    app.game = VL.newGame({ name: 'Robin' });
    app.game.popups.seen.controls = true;
    app.game.popups.queue.length = 0;
    app.setScene('play');
    VL.place(app.game, { area, screen, tx: 7, ty: 5 });
    const npc = app.game.room.entities.find((e) => e.type === 'npc' && e.id === id);
    if (!npc) continue;
    let talked = 0;
    for (const [dx, dy, facing] of [[0, 1, 'up'], [0, -1, 'down'], [-1, 0, 'right'], [1, 0, 'left']]) {
      const tx = npc.x + dx;
      const ty = npc.y + dy;
      if (VL.isSolidAt(area, screen, tx, ty, app.game.room)) continue;
      app.setScene('play');
      Object.assign(app.game.player, VL.tileCenter(tx, ty), { facing });
      npc.walk = null;
      npc.wander = 0;
      app.update(VL.actions({ pressed: ['interact'] }), 1 / 60);
      if (app.sceneId !== 'dialogue') continue;
      talked += 1;
      checkTalk(VL, app, `${id} from ${facing}`);
    }
    assert.ok(talked, `talked to ${id}`);
  }
});

test('the ending\'s boxes keep the one speaking, the shelves and the hero\'s book in view', () => {
  const { VL } = loadGame();
  const app = VL.createApp();
  app.game = VL.newGame({ name: 'Robin' });
  app.game.flags.forgiven = true;
  app.setScene('ending');
  for (let i = 0; i < 200 && app.ending.phase === 'fadeIn'; i += 1) app.update(VL.actions(), 1 / 60);
  assert.equal(app.ending.phase, 'beats');
  const { hudHeight, tile } = VL.TUNING;
  const shelfRow = { x: 0, y: hudHeight + tile, w: VL.TUNING.width, h: tile };
  for (let beat = 0; beat < VL.ENDING_BEATS.length; beat += 1) {
    app.ending.beat = beat;
    app.update(VL.actions(), 1 / 60);
    const { box, sprites } = drawnFrame(VL, app);
    const { speaker } = VL.ENDING_BEATS[beat];
    assert.ok(!overlaps(box, shelfRow), `beat ${beat}: the shelves stay in view`);
    const look = speaker && lookOf(VL, speaker);
    if (!look) continue;
    const mine = spritesOf(sprites, `npc-${look}-`);
    assert.ok(mine.length, `${speaker} is at the party`);
    for (const s of mine) assert.ok(!overlaps(box, s), `beat ${beat}: the box covers ${speaker}`);
    for (const s of sprites.filter((x) => HERO.test(x.id))) assert.ok(!overlaps(box, s), `beat ${beat}: the box covers the hero`);
  }
});

// ---------- 3. Mr. Fenwick's new look ----------

const colourCount = (VL, id) => {
  const counts = {};
  for (const run of VL.ART.sprite(id).runs) counts[run.color] = (counts[run.color] || 0) + run.w;
  return counts;
};
const hex = (VL, name) => VL.ART.color(name);
const distance = (a, b) => {
  const rgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const [x, y] = [rgb(a), rgb(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};
const brightness = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)).reduce((a, b) => a + b) / 3;

test('Mr. Fenwick has warm brown skin and black hair with only a little gray at the temples, in every facing and frame', () => {
  const { VL } = loadGame();
  const skin = hex(VL, 'skinBrown');
  const black = hex(VL, 'npcBlack');
  const gray = hex(VL, 'npcGray');
  assert.ok(brightness(skin) > 70 && brightness(skin) < 140, 'medium-dark');
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(skin.slice(i, i + 2), 16));
  assert.ok(r > g && g > b, 'warm brown');
  assert.ok(brightness(black) < 70, 'black hair');
  assert.ok(distance(black, hex(VL, 'outline')) > 25, 'still apart from the outline, so his head keeps its shape');
  for (const facing of ['down', 'up', 'left', 'right']) {
    for (const frame of [0, 1, 2]) {
      const counts = colourCount(VL, `npc-librarian-${facing}-${frame}`);
      if (facing !== 'up') assert.ok(counts[skin] >= 8 && !counts[hex(VL, 'skin')], `${facing}: his face`);
      assert.ok(counts[black] >= 12, `${facing}: black hair`);
      assert.ok(counts[gray] >= 2 && counts[gray] <= counts[black] / 4, `${facing}: a little gray (${counts[gray]} of ${counts[black]})`);
      assert.ok(!counts[hex(VL, 'npcSilver')], `${facing}: no silver head any more`);
    }
  }
});

test('Mr. Fenwick reads clearly apart from Gran Ottie', () => {
  const { VL } = loadGame();
  const him = colourCount(VL, 'npc-librarian-down-0');
  const gran = colourCount(VL, `npc-${VL.NPCS.gran.look}-down-0`);
  const top = (counts) => Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([c]) => c);
  assert.ok(!(hex(VL, 'skinBrown') in gran) && !(hex(VL, 'skin') in him), 'different skin');
  assert.ok(distance(hex(VL, 'npcBlack'), hex(VL, 'npcSilver')) > 200, 'black hair against her white');
  assert.notDeepEqual(top(him).slice(0, 2), top(gran).slice(0, 2));
});

test('his puppet in her show, his giant marionette and his painted head in the workshop wear his new look', () => {
  const { VL } = loadGame();
  const puppet = colourCount(VL, 'puppet-librarian');
  assert.ok(puppet[hex(VL, 'skinBrown')] && puppet[hex(VL, 'npcBlack')] && puppet[hex(VL, 'npcGray')], 'the show puppet');
  assert.ok(!puppet[hex(VL, 'skin')] && !puppet[hex(VL, 'npcSilver')]);
  // What a painter fills, by colour.
  const painted = (draw) => {
    const used = new Set();
    const target = { fillStyle: '', fillRect() { used.add(target.fillStyle); } };
    const ctx = new Proxy(target, { get: (o, p) => (p in o ? o[p] : () => {}) });
    draw(ctx);
    return used;
  };
  const state = VL.newGame({ name: 'Robin' });
  for (const id of ['trapdoorOpen', 'finale:followed', 'finale:confronted']) state.flags[id] = true;
  VL.place(state, { area: 'workshop', screen: VL.FINALE.hall, tx: 7, ty: 9 });
  const live = state.room.entities.find((e) => e.type === 'marionette' && e.puppet === 'librarian');
  for (const fallen of [false, true]) {
    Object.assign(live, { fallen, fell: fallen ? 9 : 0 });
    const used = painted((ctx) => VL.ENTITIES.marionette.draw(ctx, live, 100, 100, 1));
    assert.ok(used.has(hex(VL, 'skinBrown')) && used.has(hex(VL, 'npcBlack')), `the marionette${fallen ? ', fallen' : ''}`);
    assert.ok(!used.has(hex(VL, 'npcSilver')), 'no silver hair');
  }
  const heads = painted((ctx) => VL.DECOR.wsHeads(ctx, 0, 0, 0, {}));
  assert.ok(heads.has(hex(VL, 'skinBrown')) && heads.has(hex(VL, 'npcBlack')), 'his head on the shelf');
});
