// W37: the hero's look (clothes colour, hair length) and boy or girl, chosen
// beside the name, saved, and worn everywhere the hero is drawn.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, read, loadGame, memoryStorage, fakeContext } = require('./harness');

const STEP = 1 / 60;
const press = (VL, app, action, typed = '') => app.update(VL.actions({ pressed: [action], typed }), STEP);
const type = (VL, app, typed) => app.update(VL.actions({ typed }), STEP);
const plain = (value) => JSON.parse(JSON.stringify(value));
const fixture = (file) => fs.readFileSync(path.join(__dirname, 'fixtures', file), 'utf8');
const LOOKS = (VL) => VL.HERO_OUTFITS.flatMap((outfit) => VL.HERO_HAIRS.map((hair) => ({ outfit, hair })));
const HERO_SPRITES = [...['down', 'up', 'left', 'right'].flatMap((f) => [0, 1, 2].map((n) => `hero-${f}-${n}`)), 'hero-hold'];

function nameApp(VL) {
  const app = VL.createApp({ storage: VL.createStorage(memoryStorage()) });
  press(VL, app, 'confirm');
  assert.equal(app.sceneId, 'name');
  return app;
}

// The sprite ids drawSprite gets while `draw` runs.
function spritesDrawn(VL, draw) {
  const ids = [];
  const original = VL.ART.drawSprite;
  VL.ART.drawSprite = (ctx, id, ...rest) => {
    ids.push(id);
    return original(ctx, id, ...rest);
  };
  try {
    draw();
  } finally {
    VL.ART.drawSprite = original;
  }
  return ids;
}

// Fill colours used while `draw` runs (the fake context records fillStyle).
function fillsDrawn(VL, draw) {
  const fills = new Set();
  const ctx = new Proxy(fakeContext(), { set(target, key, value) { if (key === 'fillStyle') fills.add(value); return true; } });
  draw(ctx);
  return fills;
}

// ---------- saved ----------

test('a new game wears today\'s look by default; the chosen one is saved, and odd values fall back', () => {
  const { VL } = loadGame();
  assert.deepEqual(plain(VL.newGame().look), { outfit: 'green', hair: 'short', gender: 'boy' });
  assert.deepEqual(plain(VL.DEFAULT_LOOK), { outfit: 'green', hair: 'short', gender: 'boy' });
  const game = VL.newGame({ look: { outfit: 'yellow', hair: 'long', gender: 'girl' } });
  assert.deepEqual(plain(VL.serializeSave(game).look), { outfit: 'yellow', hair: 'long', gender: 'girl' });
  assert.deepEqual(plain(VL.heroLook({ look: { outfit: 'orange', hair: 'curly', gender: 7 } })), plain(VL.DEFAULT_LOOK));
  assert.deepEqual(plain(VL.heroLook({})), plain(VL.DEFAULT_LOOK), 'a state with no look (a test sample) is the default');
  assert.deepEqual([...VL.HERO_OUTFITS], ['green', 'blue', 'purple', 'pink', 'yellow']);
  assert.deepEqual([...VL.HERO_HAIRS], ['short', 'long']);
  assert.deepEqual([...VL.HERO_GENDERS], ['boy', 'girl']);
});

test('an older save (W35) has no look and loads as today\'s boy in green with short hair', () => {
  const { VL } = loadGame();
  const raw = JSON.parse(fixture('save-v1-W35.json'));
  assert.equal(raw.look, undefined);
  assert.deepEqual(plain(VL.restoreGame(raw).look), plain(VL.DEFAULT_LOOK));
});

test('the W37 fixture (a girl in pink with long hair) loads with nothing reset and keeps her look', () => {
  const { VL } = loadGame();
  const storage = VL.createStorage(memoryStorage({ [VL.slotKey(0)]: fixture('save-v1-W37.json') }));
  const slot = VL.readSlot(storage, 0);
  assert.equal(slot.status, 'ok');
  assert.deepEqual(plain(slot.resets || []), []);
  assert.deepEqual(plain(VL.loadSlot(storage, 0).look), { outfit: 'pink', hair: 'long', gender: 'girl' });
});

// ---------- the sprites ----------

test('today\'s look draws the very same sprites as before: no variant, no change', () => {
  const { VL } = loadGame();
  for (const id of [...HERO_SPRITES, 'puppet-hero']) {
    assert.equal(VL.ART.lookSprite(id, VL.DEFAULT_LOOK), id);
    assert.equal(VL.ART.lookSprite(id, undefined), id, 'no look given');
  }
  const drawn = spritesDrawn(VL, () => VL.ART.drawHero(fakeContext(), { facing: 'left', moving: false }, 50, 50, 0));
  assert.deepEqual(drawn, ['hero-left-0']);
});

test('every look recolours every hero sprite and puppet, keeping its size and every pixel\'s place', () => {
  const { VL } = loadGame();
  const tunics = ['tunic', 'tunicDark', 'tunicLight'];
  for (const look of LOOKS(VL)) {
    const outfit = VL.OUTFIT_COLORS[look.outfit];
    for (const id of [...HERO_SPRITES, 'puppet-hero']) {
      const variant = VL.ART.lookSprite(id, look);
      const base = VL.ART.sprite(id);
      const worn = VL.ART.sprite(variant);
      assert.deepEqual([worn.w, worn.h], [base.w, base.h], variant);
      const before = VL.ART.SPRITES[id].def;
      const after = VL.ART.SPRITES[variant].def;
      before.rows.forEach((row, y) => [...row].forEach((ch, x) => {
        const was = ch === '.' ? null : before.colors[ch];
        const now = after.rows[y][x] === '.' ? null : after.colors[after.rows[y][x]];
        if (now === 'hair' || now === 'hairLight') {
          if (was !== 'hair' && was !== 'hairLight') assert.equal(look.hair, 'long', `${variant} ${x},${y}: hair only grows for long hair`);
          assert.notEqual(was, 'ink', `${variant} ${x},${y}: long hair never covers an eye`);
          return;
        }
        assert.equal(now, tunics.includes(was) ? outfit[was] : was, `${variant} ${x},${y}`);
      }));
      // Defined once and reused.
      assert.equal(VL.ART.lookSprite(id, look), variant);
    }
  }
});

test('long hair reads in every facing: plenty more hair, down past the face to the shoulders', () => {
  const { VL } = loadGame();
  const hairAt = (id) => {
    const { rows, colors } = VL.ART.SPRITES[id].def;
    const cells = [];
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (colors[ch] === 'hair' || colors[ch] === 'hairLight') cells.push([x, y]);
    }));
    return cells;
  };
  for (const outfit of VL.HERO_OUTFITS) {
    for (const [id, reach] of [['hero-down-0', 7], ['hero-up-1', 9], ['hero-left-2', 8], ['hero-right-0', 8], ['hero-hold', 7], ['puppet-hero', 4]]) {
      const short = hairAt(VL.ART.lookSprite(id, { outfit, hair: 'short' }));
      const long = hairAt(VL.ART.lookSprite(id, { outfit, hair: 'long' }));
      assert.ok(long.length - short.length >= (id === 'puppet-hero' ? 5 : 8), `${id} ${outfit}: ${long.length} vs ${short.length} hair pixels`);
      assert.equal(Math.max(...long.map(([, y]) => y)), reach, `${id}: long hair reaches row ${reach}`);
      assert.ok(Math.max(...short.map(([, y]) => y)) < reach, `${id}: short hair stops above it`);
    }
  }
  // Facing right is facing left, mirrored, long hair and all.
  const left = VL.ART.SPRITES[VL.ART.lookSprite('hero-left-1', { outfit: 'blue', hair: 'long' })].def;
  const right = VL.ART.SPRITES[VL.ART.lookSprite('hero-right-1', { outfit: 'blue', hair: 'long' })].def;
  assert.deepEqual(right.rows.map((row) => [...row].map((ch) => right.colors[ch] || '.')), left.rows.map((row) => [...row].reverse().map((ch) => left.colors[ch] || '.')));
});

test('the five outfits look distinct from each other and stand out on sand, grass and paths', () => {
  const { VL } = loadGame();
  const rgb = (name) => {
    const hex = VL.ART.color(name);
    return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  };
  const distance = (a, b) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));
  const mains = VL.HERO_OUTFITS.map((outfit) => VL.OUTFIT_COLORS[outfit].tunic);
  for (const a of mains) for (const b of mains) if (a < b) assert.ok(distance(a, b) >= 80, `${a} vs ${b}: ${distance(a, b).toFixed(0)}`);
  for (const main of mains) {
    for (const ground of ['sand', 'sandLight', 'sandDark', 'grass', 'grassLight', 'grassDark', 'path', 'floor', 'water']) {
      assert.ok(distance(main, ground) >= 55, `${main} on ${ground}: ${distance(main, ground).toFixed(0)}`);
    }
  }
  // Three shades each, light to dark, so the hero keeps his top-left light.
  const luma = (name) => rgb(name).reduce((sum, v, i) => sum + v * [0.299, 0.587, 0.114][i], 0);
  for (const outfit of VL.HERO_OUTFITS) {
    const { tunic, tunicDark, tunicLight } = VL.OUTFIT_COLORS[outfit];
    assert.ok(luma(tunicLight) > luma(tunic) && luma(tunic) > luma(tunicDark), outfit);
  }
});

// ---------- worn everywhere ----------

test('the world draws the hero in the game\'s look, in every pose (walking, holding up, flying)', () => {
  const { VL } = loadGame();
  const game = VL.newGame({ look: { outfit: 'purple', hair: 'long', gender: 'girl' } });
  game.time = 0;
  const heroIds = () => spritesDrawn(VL, () => VL.drawWorld(fakeContext(), game, 0.3)).filter((id) => id.startsWith('hero-'));
  assert.ok(heroIds().includes('hero-down-0~purple-long'), String(heroIds()));
  game.player.facing = 'right';
  game.player.moving = true;
  game.player.lift = 6;
  assert.ok(heroIds().some((id) => /^hero-right-[12]~purple-long$/.test(id)));
  game.player.lift = 0;
  game.player.holding = true;
  assert.ok(heroIds().includes('hero-hold~purple-long'));
  // A save with no look draws exactly today's sprites.
  const old = VL.newGame();
  assert.ok(spritesDrawn(VL, () => VL.drawWorld(fakeContext(), old, 0.3)).includes('hero-down-0'));
});

test('the puppet shows\' hero puppet wears the player\'s look, the confession show included', () => {
  const { VL } = loadGame();
  for (const data of [{ show: 0 }, { confession: true }]) {
    const app = VL.createApp();
    app.game = VL.newGame({ look: { outfit: 'yellow', hair: 'long', gender: 'girl' } });
    app.setScene('puppetShow', data);
    const view = app.puppetShow;
    view.beat = view.show.beats.findIndex((beat) => beat.cast.hero !== undefined);
    view.actors = {};
    view.actors.hero = { x: 0.5, rise: 1, target: 0.5 };
    const ids = spritesDrawn(VL, () => app.scene.draw(fakeContext(), app, 1));
    assert.ok(ids.includes('puppet-hero~yellow-long'), `${JSON.stringify(data)}: ${ids}`);
    assert.ok(!ids.includes('puppet-hero'));
  }
});

test('the finale\'s hero marionette and the town booth\'s little hero puppet wear the player\'s clothes', () => {
  const { VL } = loadGame();
  const game = VL.newGame({ look: { outfit: 'blue', hair: 'long', gender: 'boy' } });
  const blue = VL.ART.color('outfitBlue');
  const teal = VL.ART.color('tunic');
  const m = { type: 'marionette', puppet: 'hero', x: 8, y: 5, cx: 100, cy: 80 };
  game.room.entities.push(m);
  for (const hook of VL.ROOM_HOOKS) hook(game);
  assert.deepEqual(plain(m.look), plain(game.look), 'a room hook hands the look to the hero marionette');
  VL.ENEMIES.marionette.setup(game, m);
  for (const fallen of [false, true]) {
    m.fallen = fallen;
    m.fell = fallen ? VL.TUNING.marionetteFallSeconds : 0;
    const fills = fillsDrawn(VL, (ctx) => VL.ENEMIES.marionette.draw(ctx, m, 100, 80, 0));
    assert.ok(fills.has(blue) && !fills.has(teal), `fallen ${fallen}`);
  }
  const booth = { type: 'decor', art: 'puppetBooth', look: game.look };
  const fills = fillsDrawn(VL, (ctx) => VL.DECOR.puppetBooth(ctx, 0, 20, 0, booth));
  assert.ok(fills.has(blue) && !fills.has(teal));
  const plainBooth = fillsDrawn(VL, (ctx) => VL.DECOR.puppetBooth(ctx, 0, 20, 0, { type: 'decor', art: 'puppetBooth' }));
  assert.ok(plainBooth.has(teal), 'no look: today\'s puppet');
});

test('the title\'s shore hero wears the look of the slot the cursor is on', () => {
  const { VL } = loadGame();
  const backing = memoryStorage({ [VL.slotKey(1)]: fixture('save-v1-W37.json') });
  const app = VL.createApp({ storage: VL.createStorage(backing) });
  const heroOf = () => spritesDrawn(VL, () => app.scene.draw(fakeContext(), app, 0)).filter((id) => id.startsWith('hero-'));
  assert.deepEqual(heroOf(), ['hero-down-0'], 'an empty slot: today\'s hero');
  press(VL, app, 'down');
  assert.deepEqual(heroOf(), ['hero-down-0~pink-long']);
});

// ---------- the chooser ----------

test('new game: the name, then boy or girl, clothes and hair beside it, with a live preview, then START', () => {
  const { VL } = loadGame();
  const app = nameApp(VL);
  type(VL, app, 'Sky');
  press(VL, app, 'down');
  press(VL, app, 'right');
  assert.equal(app.naming.look.gender, 'girl');
  press(VL, app, 'down');
  for (let i = 0; i < 3; i += 1) press(VL, app, 'right');
  assert.equal(app.naming.look.outfit, 'pink');
  press(VL, app, 'left');
  assert.equal(app.naming.look.outfit, 'purple');
  press(VL, app, 'left');
  press(VL, app, 'left');
  press(VL, app, 'left');
  assert.equal(app.naming.look.outfit, 'yellow', 'the colours go round');
  press(VL, app, 'down');
  press(VL, app, 'right');
  assert.equal(app.naming.look.hair, 'long');
  press(VL, app, 'right');
  assert.equal(app.naming.look.hair, 'long', 'a pair does not go round: → stays on the second');
  press(VL, app, 'left');
  press(VL, app, 'left');
  assert.equal(app.naming.look.hair, 'short');
  press(VL, app, 'right');
  // The preview turns through every facing, in the chosen look.
  const seen = new Set();
  for (let t = 0; t < 6; t += 0.2) for (const id of spritesDrawn(VL, () => VL.render(fakeContext(), app, t))) if (id.startsWith('hero-')) seen.add(id.replace(/-\d~/, '~'));
  assert.deepEqual([...seen].sort(), ['hero-down~yellow-long', 'hero-left~yellow-long', 'hero-right~yellow-long', 'hero-up~yellow-long']);
  press(VL, app, 'down');
  assert.equal(app.naming.onStart, true);
  press(VL, app, 'interact', 's');
  assert.equal(app.sceneId, 'intro');
  assert.equal(app.game.name, 'Sky');
  assert.deepEqual(plain(app.game.look), { outfit: 'yellow', hair: 'long', gender: 'girl' });
  assert.deepEqual(plain(JSON.parse(app.storage.read(VL.slotKey(0))).look), { outfit: 'yellow', hair: 'long', gender: 'girl' }, 'saved as soon as it is named');
});

test('the chooser: Enter in the field starts with today\'s look; S or Space on a choice steps down; a letter goes back to the name', () => {
  const { VL } = loadGame();
  let app = nameApp(VL);
  type(VL, app, 'Ash');
  press(VL, app, 'confirm');
  assert.equal(app.sceneId, 'intro');
  assert.deepEqual(plain(app.game.look), plain(VL.DEFAULT_LOOK));

  app = nameApp(VL);
  type(VL, app, 'Jo');
  press(VL, app, 'down');
  press(VL, app, 'interact', 's');
  assert.equal(app.naming.row, 2, 'S on boy or girl keeps it and steps to the clothes');
  press(VL, app, 'mainHand', ' ');
  assert.equal(app.naming.row, 3, 'Space too');
  assert.equal(app.naming.text, 'Jo', 'neither typed into the name');
  type(VL, app, 'e');
  assert.equal(app.naming.row, 0);
  assert.equal(app.naming.text, 'Joe');
  press(VL, app, 'left');
  assert.equal(app.naming.look.gender, 'boy', 'left and right in the field change nothing');
  press(VL, app, 'up');
  assert.equal(app.naming.row, 0, 'nothing above the name');
  press(VL, app, 'down');
  press(VL, app, 'right');
  press(VL, app, 'confirm');
  assert.equal(app.sceneId, 'intro', 'Enter starts from any row');
  assert.equal(app.game.look.gender, 'girl');
});

test('every word of the chooser is in the font and fits the canvas', () => {
  const { VL } = loadGame();
  const app = nameApp(VL);
  const drawn = [];
  const original = VL.ART.text;
  VL.ART.text = (ctx, str, x, y, options = {}) => {
    const w = VL.ART.measureText(str, options.size);
    const left = options.align === 'center' ? x - w / 2 : options.align === 'right' ? x - w : x;
    drawn.push({ str, left, right: left + w, y });
    return original(ctx, str, x, y, options);
  };
  for (const outfit of VL.HERO_OUTFITS) {
    app.naming.look.outfit = outfit;
    app.naming.text = 'WWWWWWWWWWWW';
    for (let row = 0; row < 5; row += 1) {
      app.naming.row = row;
      VL.render(fakeContext(), app, 0);
    }
  }
  VL.ART.text = original;
  for (const { str, left, right, y } of drawn) {
    assert.deepEqual([...VL.ART.missingGlyphs(str, 'small')].filter((ch) => ch !== '→'), [], str);
    assert.ok(left >= 0 && right <= VL.TUNING.width && y >= 0 && y < VL.TUNING.height, `${str} at ${left}..${right}, ${y}`);
  }
  assert.ok(drawn.some((d) => d.str === 'Girl') && drawn.some((d) => d.str === 'Long') && drawn.some((d) => d.str === 'YELLOW'));
});

// ---------- boy or girl: the words ----------

test('{he} {him} {his} {hers} {himself} {boy} and their capitals become the hero\'s words, boy or girl', () => {
  const { VL } = loadGame();
  const words = '{He} saw {his} map; it was {hers}... no, {his}! {name} told {himself}: "{he} is a brave {boy}, ask {him}." {His} {Boy}';
  assert.equal(VL.popupText(words, { name: 'Robin', look: { gender: 'boy' } }), 'He saw his map; it was his... no, his! Robin told himself: "he is a brave boy, ask him." His Boy');
  assert.equal(VL.popupText(words, { name: 'Robin', look: { gender: 'girl' } }), 'She saw her map; it was hers... no, her! Robin told herself: "she is a brave girl, ask her." Her Girl');
  assert.equal(VL.popupText('{his}', { name: 'Kai' }), 'his', 'no look: a boy, as every older save');
  assert.equal(VL.popupText('{HIS} {hat}', {}), '{HIS} {hat}', 'anything else is left alone');
  assert.equal(VL.popupText('{his}', VL.restoreGame(JSON.parse(fixture('save-v1-W37.json')))), 'her');
});

test('the intro says his or her culture, from the game\'s choice', () => {
  const { VL } = loadGame();
  for (const [gender, word] of [['boy', 'his'], ['girl', 'her']]) {
    const app = VL.createApp();
    app.game = VL.newGame({ look: { gender } });
    app.setScene('intro');
    app.intro.t = 20;
    const strings = [];
    const original = VL.ART.text;
    VL.ART.text = (ctx, str, ...rest) => {
      strings.push(String(str));
      return original(ctx, str, ...rest);
    };
    app.scene.draw(fakeContext(), app, 0);
    VL.ART.text = original;
    const all = strings.join(' ');
    assert.match(all, new RegExp(`save ${word} culture`), all);
    assert.doesNotMatch(all, /\{/);
  }
});

// String literals in a file's source, comments skipped.
function literals(source) {
  const out = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === '/' && source[i + 1] === '/') {
      i = source.indexOf('\n', i);
      if (i < 0) break;
    } else if (c === '/' && source[i + 1] === '*') {
      i = source.indexOf('*/', i) + 2;
    } else if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      let s = '';
      while (j < source.length && source[j] !== c) {
        s += source[j] === '\\' ? source[j + 1] : source[j];
        j += source[j] === '\\' ? 2 : 1;
      }
      out.push(s);
      i = j + 1;
    } else {
      i += 1;
    }
  }
  return out;
}

// Every he/she word in the game's text that is about someone else: the
// librarian, his wife, Bryony, Brannock, Henrietta, Nell, Mabel, the dragon,
// Sir Bumble and Nosy Ned. The hero's own words are tokens ({his}).
const OTHERS = [
  ['regions/townsfolk.js', 'The librarian planted these flowers himself'],
  ['regions/townsfolk.js', 'he mostly stares at his empty shelves'],
  ['regions/buildings.js', 'Mabel spins round... did she see?'],
  ['regions/library.js', 'Old Mother Bryony wrote this! She knew'],
  ['regions/library.js', 'She says there are only three berry bushes'],
  ['regions/library.js', 'Every lump of ore he ever used!'],
  ['regions/library.js', 'here\'s his trick for using fewer shells'],
  ['regions/library.js', 'I read this to my wife when we were young. She never'],
  ['regions/library.js', 'Nell in the harbour knows boats: take her your rope'],
  ['regions/library.js', 'Let\'s go back down and hear what she has to say.'],
  ['regions/library.js', 'Henrietta! You found her!'],
  ['regions/library.js', 'this page blew into her coop'],
  ['regions/library.js', 'Her name\'s Henrietta.'],
  ['regions/library.js', 'She flapped off up the cliff road'],
  ['regions/library.js', 'Last I saw her, she was up on the cliffs'],
  ['dungeons/workshop.js', 'Her workbench: paint pots'],
  ['dungeons/workshop.js', 'Let her speak, {name}.'],
  ['dungeons/workshop.js', 'The librarian waters his flowers'],
  ['dungeons/workshop.js', 'Not like her at all.'],
  ['scenes/puppet-show.js', 'He was terribly lonely. Nobody wants to hug a dragon.'],
  ['scenes/puppet-show.js', 'He fetched cats out of trees.'],
  ['scenes/puppet-show.js', 'he forgot to fetch his own lunch!'],
  ['scenes/puppet-show.js', 'Ned pokes his nose into everything.'],
  ['scenes/puppet-show.js', 'Ned poked his nose into a goose\'s nest.'],
  ['scenes/puppet-show.js', 'Nosy Ned is back! He just won\'t stop'],
  ['scenes/puppet-show.js', 'He climbed all the way up the mountain'],
  ['scenes/puppet-show.js', 'He landed in a haystack'],
  ['scenes/puppet-show.js', 'But it was not her town.'],
  ['scenes/puppet-show.js', 'Her home was far over the hills'],
  ['scenes/puppet-show.js', 'She married a kind librarian. He loved his books'],
  ['scenes/puppet-show.js', 'So she had a sad, silly idea. If the books were gone, perhaps he would'],
  ['scenes/puppet-show.js', 'Every night, she carried books up a secret tunnel'],
  ['scenes/puppet-show.js', 'And so, at last, did she.'],
  ['scenes/puppet-show.js', 'Now he reads one book every Sunday.'],
];

test('no hero pronoun is left written out in the game\'s text: each he or she is someone else\'s (allow-list)', () => {
  const { VL } = loadGame();
  const pronoun = /\b(he|him|his|himself|she|her|hers|herself|boy|girl)\b/i;
  const used = new Set();
  const strays = [];
  for (const file of VL.scriptFiles()) {
    for (const text of literals(read(file))) {
      // Tokens are the hero's; sentences only (code strings have no spaces).
      const words = text.replace(/\{[A-Za-z]+\}/g, '');
      if (!/\s/.test(text) || !pronoun.test(words)) continue;
      const other = OTHERS.findIndex(([where, part]) => where === file && text.includes(part));
      if (other === -1) strays.push(`${file}: ${text}`);
      else used.add(other);
    }
  }
  assert.deepEqual(strays, [], 'a he/she about the hero is a {he}/{his} token; one about someone else joins OTHERS');
  assert.deepEqual(OTHERS.filter((_, i) => !used.has(i)), [], 'every allow-list entry still matches a line');
});

test('every token in the game\'s text is one popupText knows', () => {
  const { VL } = loadGame();
  const known = new Set(['name', ...Object.keys(VL.HERO_WORDS.boy)]);
  for (const file of VL.scriptFiles()) {
    for (const text of literals(read(file))) {
      // A template's ${...} is code, not a token.
      for (const [, token] of text.replace(/\$\{[^}]*\}/g, '').matchAll(/\{([A-Za-z]+)\}/g)) {
        if (/\s/.test(text)) assert.ok(known.has(token.toLowerCase()), `${file}: {${token}} in ${text}`);
      }
    }
  }
});
