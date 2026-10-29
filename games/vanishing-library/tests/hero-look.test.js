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
  // Pink leans magenta, so a pink hero stands apart from a townsperson's rose top.
  assert.ok(distance('outfitPink', 'npcRose') >= 90, `pink vs the rose top: ${distance('outfitPink', 'npcRose').toFixed(0)}`);
  // Three shades each, light to dark, so the hero keeps the top-left light.
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

test('the puppet shows\' hero puppet wears the player\'s look where it stands for the player', () => {
  const { VL } = loadGame();
  for (const data of [{ show: 0 }, { confession: true }, { kind: 0 }]) {
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

test('Sir Bumble is a story\'s hero, not the player: his own puppet, the same for every look', () => {
  const { VL } = loadGame();
  // The only shows casting the player's puppet: the first show's brave little
  // hero, the confession's brave young hero and The Library That Grew.
  const shows = [...VL.PUPPET_SHOWS, VL.CONFESSION_SHOW, ...VL.KIND_SHOWS];
  const casting = (name) => shows.filter((show) => show.beats.some((beat) => beat.cast[name] !== undefined)).map((show) => show.title);
  assert.deepEqual(casting('hero'), ['The Dragon Who Wanted a Hug', 'The Puppeteer Who Missed Home', 'The Library That Grew']);
  assert.deepEqual(casting('bumble'), ['Sir Bumble\'s Busy Day']);
  for (const look of [{ outfit: 'yellow', hair: 'long', gender: 'girl' }, { outfit: 'blue', hair: 'short', gender: 'boy' }, undefined]) {
    const app = VL.createApp();
    app.game = VL.newGame({ look });
    app.setScene('puppetShow', { show: 1 });
    const ids = new Set();
    for (const beat of app.puppetShow.show.beats.keys()) {
      app.puppetShow.beat = beat;
      for (const actor of Object.values(app.puppetShow.actors)) actor.rise = 0;
      for (const [name, x] of Object.entries(app.puppetShow.show.beats[beat].cast)) app.puppetShow.actors[name] = { x, rise: 1, target: x };
      for (const id of spritesDrawn(VL, () => app.scene.draw(fakeContext(), app, 1))) ids.add(id);
    }
    assert.ok(ids.has('puppet-bumble'), JSON.stringify(look));
    assert.ok(![...ids].some((id) => id.startsWith('puppet-hero')), `${JSON.stringify(look)}: ${[...ids]}`);
  }
  const bumble = VL.ART.SPRITES['puppet-bumble'].def;
  assert.ok(!Object.values(bumble.colors).some((name) => /^tunic/.test(name)), 'none of the colours a look recolours');
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

// The strings drawn while `draw` runs, with their colours.
function textsDrawn(VL, draw) {
  const drawn = [];
  const { text: original, drawPopup } = VL.ART;
  VL.ART.text = (ctx, str, x, y, options = {}) => {
    drawn.push({ str: String(str), color: options.color });
    return original(ctx, str, x, y, options);
  };
  // A popup's title and lines are drawn inside the kit, past VL.ART.text.
  VL.ART.drawPopup = (ctx, popup, t) => {
    const layout = drawPopup(ctx, popup, t);
    for (const str of [layout.title, ...layout.lines]) if (str) drawn.push({ str: String(str), color: 'popup' });
    return layout;
  };
  try {
    draw();
  } finally {
    Object.assign(VL.ART, { text: original, drawPopup });
  }
  return drawn;
}

test('boy or girl starts unpicked: no start until it is chosen, from any row or key, and the HERO row asks', () => {
  const { VL } = loadGame();
  for (const [row, key, typed] of [[0, 'confirm', ''], [1, 'confirm', ''], [2, 'confirm', ''], [3, 'confirm', ''], [4, 'confirm', ''], [4, 'interact', 's'], [4, 'mainHand', ' ']]) {
    const app = nameApp(VL);
    type(VL, app, 'Ash');
    assert.equal(app.naming.look.gender, null, 'nothing is assumed');
    assert.deepEqual([app.naming.look.outfit, app.naming.look.hair], ['green', 'short'], 'clothes and hair keep today\'s look');
    for (let i = 0; i < row; i += 1) press(VL, app, 'down');
    const before = textsDrawn(VL, () => VL.render(fakeContext(), app, 0));
    assert.ok(!before.some((d) => /BOY OR GIRL\?/.test(d.str)), 'no question before a start is tried');
    assert.ok(before.some((d) => /PICK BOY OR GIRL/.test(d.str)), 'the hint says what START needs');
    for (const word of ['Boy', 'Girl']) assert.equal(before.find((d) => d.str === word).color, 'textDim', `${word} is not shown as picked`);
    app.update(VL.actions({ pressed: [key], typed }), STEP);
    assert.equal(app.sceneId, 'name', `${key} on row ${row}`);
    assert.equal(app.game, null, 'VL.newGame is never reached without a pick');
    assert.ok(!app.storage.read(VL.slotKey(0)), 'nothing saved');
    assert.equal(app.naming.row, 1, 'the cursor goes to the HERO row');
    assert.equal(app.naming.onStart, false);
    assert.equal(app.naming.text, 'Ash');
    assert.ok(textsDrawn(VL, () => VL.render(fakeContext(), app, 0)).some((d) => d.str === '← BOY OR GIRL? →'), 'and asks there');
  }
  // From no pick, ← is Boy and → is Girl; then a start goes ahead.
  for (const [key, gender] of [['left', 'boy'], ['right', 'girl']]) {
    const app = nameApp(VL);
    type(VL, app, 'Ash');
    press(VL, app, 'confirm');
    press(VL, app, key);
    assert.equal(app.naming.look.gender, gender, key);
    const after = textsDrawn(VL, () => VL.render(fakeContext(), app, 0));
    assert.ok(!after.some((d) => /BOY OR GIRL/.test(d.str)), 'the question and the hint go once picked');
    assert.ok(after.some((d) => d.str === 'ENTER: START   ESC: BACK'));
    assert.equal(after.find((d) => d.str === (gender === 'boy' ? 'Boy' : 'Girl')).color, 'goldLight');
    press(VL, app, 'confirm');
    assert.equal(app.sceneId, 'intro');
    assert.deepEqual(plain(app.game.look), { outfit: 'green', hair: 'short', gender });
  }
});

test('the chooser: S or Space on a choice steps down; a letter goes back to the name; Enter starts from any row once picked', () => {
  const { VL } = loadGame();
  const app = nameApp(VL);
  type(VL, app, 'Jo');
  press(VL, app, 'down');
  press(VL, app, 'interact', 's');
  assert.equal(app.naming.row, 2, 'S on boy or girl steps to the clothes');
  assert.equal(app.naming.look.gender, null, 'and picks nothing');
  press(VL, app, 'mainHand', ' ');
  assert.equal(app.naming.row, 3, 'Space too');
  assert.equal(app.naming.text, 'Jo', 'neither typed into the name');
  type(VL, app, 'e');
  assert.equal(app.naming.row, 0);
  assert.equal(app.naming.text, 'Joe');
  press(VL, app, 'left');
  press(VL, app, 'right');
  assert.equal(app.naming.look.gender, null, 'left and right in the field change nothing');
  press(VL, app, 'up');
  assert.equal(app.naming.row, 0, 'nothing above the name');
  press(VL, app, 'down');
  press(VL, app, 'right');
  press(VL, app, 'down');
  press(VL, app, 'down');
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
    // Unpicked and asked (the question and the longer hint), then picked.
    app.naming.look.gender = outfit === 'green' ? null : 'girl';
    app.naming.asked = true;
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
  assert.ok(drawn.some((d) => d.str === '← BOY OR GIRL? →') && drawn.some((d) => /^PICK BOY OR GIRL/.test(d.str)));
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

// Everything drawn as text while the hero plays, boy or girl, with a token
// planted in each source (book titles, equipment, the shockwave, fainting,
// shows, talk speakers, shops, dungeons, maps, the pause, credits): each must come out as the hero's word, never as a raw {token}.
test('every text the hero sees goes through popupText: no {token} is ever drawn raw', () => {
  for (const gender of ['boy', 'girl']) {
    const { VL } = loadGame();
    const mark = '{Himself}X';
    const word = gender === 'boy' ? 'himselfx' : 'herselfx';
    const plant = (text) => `${mark} ${text}`;
    VL.BOOKS.bookChickenAlmanac.title = plant(VL.BOOKS.bookChickenAlmanac.title);
    VL.BOOKS.bookChickenAlmanac.reread = [plant('Again!')];
    for (const item of Object.values(VL.ITEMS)) Object.assign(item, { name: plant(item.name), about: plant(item.about || '') });
    VL.SHOCKWAVE_LINES[0] = plant(VL.SHOCKWAVE_LINES[0]);
    for (const cause of Object.keys(VL.FAINT_LINES)) VL.FAINT_LINES[cause] = plant(VL.FAINT_LINES[cause]);
    VL.PUPPET_SHOWS[0].title = plant(VL.PUPPET_SHOWS[0].title);
    VL.PUPPET_SHOWS[0].beats.at(-1).speaker = plant(VL.PUPPET_SHOWS[0].beats.at(-1).speaker);
    VL.DUNGEONS.scriptorium.name = plant(VL.DUNGEONS.scriptorium.name);
    VL.COPIES.woodsMapCopy.name = plant(VL.COPIES.woodsMapCopy.name);
    VL.CREDITS.unshift({ big: mark });
    for (const [id, name] of Object.entries(VL.REGION_NAMES)) if (name) VL.REGION_NAMES[id] = plant(name);
    VL.MAP_ASK = plant(VL.MAP_ASK);
    const wakeWords = VL.wakeWords;
    VL.wakeWords = (state) => plant(wakeWords(state) || 'at home');
    const shop = VL.SCENES.shop.smokeData().shop;
    shop.title = plant(shop.title);
    for (const offer of shop.offers) offer.name = plant(offer.name);

    const look = { outfit: 'pink', hair: 'long', gender };
    const app = VL.createApp();
    const fresh = () => {
      app.game = VL.newGame({ name: 'Robin', look });
      for (const id of Object.keys(VL.ITEMS)) VL.giveItem(app.game, id);
      return app.game;
    };
    const cases = {
      reading: () => app.setScene('reading', { book: 'bookChickenAlmanac' }),
      rereading: () => app.setScene('reading', { book: 'bookChickenAlmanac', again: true }),
      libraryShelf: () => {
        app.game.library.returned.push('bookChickenAlmanac');
        app.game.library.read.push('bookChickenAlmanac');
        app.setScene('libraryShelf');
      },
      equipment: () => app.setScene('equipment'),
      shockwave: () => {
        app.setScene('shockwave', { from: 'dark' });
        app.shockwave.shown = 999;
      },
      fainted: () => {
        app.game.fainted = { cause: 'crab' };
        app.setScene('fainted');
      },
      puppetShow: () => {
        app.setScene('puppetShow', { show: 0 });
        app.puppetShow.beat = app.puppetShow.show.beats.length - 1;
      },
      dialogue: () => app.setScene('dialogue', { speaker: plant('Pip'), pages: [['Hello!']] }),
      conversation: () => app.setScene('dialogue', { speaker: 'Pip', speakers: ['Pip', plant('Nell')], pages: [['Hello!'], ['Hi!']] }),
      shop: () => app.setScene('shop', { shop }),
      shopAsk: () => {
        app.setScene('shop', { shop });
        Object.assign(app.shopView, { mode: 'ask', asking: shop.offers[0], answer: 0 });
      },
      shopNote: () => {
        app.setScene('shop', { shop });
        app.shopView.note = { text: plant('Thank you!'), bad: false, t: 0 };
      },
      dungeonNote: () => {
        VL.place(app.game, { area: 'scriptorium', screen: Object.keys(VL.AREAS.scriptorium.screens)[0], tx: 7, ty: 5 });
        app.game.dungeonNote = { text: plant('Locked.'), t: 0 };
        app.setScene('play');
      },
      dungeonMap: () => {
        VL.place(app.game, { area: 'scriptorium', screen: Object.keys(VL.AREAS.scriptorium.screens)[0], tx: 7, ty: 5 });
        app.setScene('dungeonMap');
      },
      copyView: () => app.setScene('copyView', { id: 'woodsMapCopy' }),
      worldMapAsk: () => app.setScene('worldMap', { mode: 'ask' }),
      worldMap: () => app.setScene('worldMap', { mode: 'view' }),
      pause: () => {
        // The line shows on Save & Quit, where saving works.
        app.storage = Object.assign(Object.create(app.storage), { ok: true });
        app.setScene('pause');
        app.pause.cursor = VL.PAUSE_OPTIONS.indexOf('Save & Quit');
      },
      credits: () => {
        app.setScene('ending');
        Object.assign(app.ending, { phase: 'credits', t: 0 });
      },
    };
    for (const [id, open] of Object.entries(cases)) {
      fresh();
      open();
      if (id === 'conversation') app.dialogue.page = 1;
      const drawn = textsDrawn(VL, () => {
        for (const t of [0, 0.5, 3]) VL.render(fakeContext(), app, t);
      }).map((d) => d.str);
      const all = drawn.join(' | ');
      assert.doesNotMatch(all, /\{[A-Za-z]+\}/, `${gender} ${id}: ${all}`);
      assert.ok(all.toLowerCase().includes(word), `${gender} ${id} shows the planted line: ${all}`);
    }
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

// Every he/she word or gendered noun in the game's text that is about
// someone else: the librarian, his wife, Bryony, Brannock, Henrietta, Nell,
// Mabel, the dragon, Sir Bumble and Nosy Ned (plus the chooser's own
// question). The hero's own words are tokens ({his}).
const OTHERS = [
  ['scenes/name.js', '← BOY OR GIRL? →'],
  ['scenes/name.js', 'PICK BOY OR GIRL, THEN ENTER'],
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
  ['regions/library.js', 'Old Mother Bryony\'s notes! She knew every plant'],
  ['regions/library.js', 'she drew a little smiling berry in the margin'],
  ['regions/library.js', 'And his forge trick! Brannock uses it every day now.'],
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
  ['scenes/puppet-show.js', 'But it was not her town, and she missed home.'],
  ['scenes/puppet-show.js', 'She married a kind librarian who would never, ever leave his books. So she had a sad, silly idea: if the books were gone, perhaps he would leave too.'],
  ['scenes/puppet-show.js', 'Every night, she carried books up a secret tunnel'],
  ['scenes/puppet-show.js', 'only grew sadder, and so did she.'],
  ['scenes/puppet-show.js', 'Now he reads one book every Sunday.'],
];

// Pronouns, then gendered nouns and forms of address ("my lad", "young
// lady", "sir"): said to the hero, each assumes a boy or a girl. "Miss"
// counts only as an address ("Thank you, miss."), not the verb.
const GENDERED = new RegExp(`\\b(${[
  'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself', 'boys?', 'girls?',
  'lads?', 'lass(ie)?', 'sons?', 'daughters?', 'grand(son|daughter)s?', 'young (man|men|lady|ladies|woman|women)',
  'sir', "ma'?am", 'madam', 'mister', 'missus', 'mrs?', 'miss(?=[,.!?])', 'gentlem[ae]n', 'lad(y|ies)', 'dame', 'lord',
  'princes?s?', 'kings?', 'queens?', 'heroine', 'brothers?', 'sisters?', 'fellow', 'chap', 'guy', 'gal', 'man', 'woman',
].join('|')})\\b`, 'i');
// A title before a capitalised name (Mrs. Fenwick, Sir Bumble, Miss Quill)
// is someone's name, never the hero's ({name} is a token).
const TITLED = /\b(Mr|Mrs|Ms|Miss|Sir|Dame|Lady|Lord|King|Queen|Prince|Princess)\.? [A-Z][a-z]+/g;

test('no hero pronoun or gendered word is left written out in the game\'s text: each is someone else\'s (allow-list)', () => {
  const { VL } = loadGame();
  const used = new Set();
  const strays = [];
  for (const file of VL.scriptFiles()) {
    for (const text of literals(read(file))) {
      // Tokens are the hero's; sentences only (code strings have no spaces).
      const words = text.replace(/\{[A-Za-z]+\}/g, '').replace(TITLED, '');
      if (!/\s/.test(text) || !GENDERED.test(words)) continue;
      const other = OTHERS.findIndex(([where, part]) => where === file && text.includes(part));
      if (other === -1) strays.push(`${file}: ${text}`);
      else used.add(other);
    }
  }
  assert.deepEqual(strays, [], 'a he/she about the hero is a {he}/{his} token; a lad, sir or lady said to the hero is reworded; one about someone else joins OTHERS');
  // The scan sees the nouns and forms of address, and lets names through.
  for (const said of ['Well done, my lad!', 'Thank you, young lady.', 'Yes, sir.', 'Off you go, son.', 'Hello, ma\'am.', 'Hail, princess!', 'Thank you, miss.']) assert.match(said.replace(TITLED, ''), GENDERED, said);
  for (const name of ['Ask Mrs. Fenwick.', 'Sir Bumble hops.', 'Miss Quill binds the pages.', 'You can\'t miss it.']) assert.doesNotMatch(name.replace(TITLED, ''), GENDERED, name);
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
