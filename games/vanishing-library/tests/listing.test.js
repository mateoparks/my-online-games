// W22, the arcade listing: the home-page card, the icon, the README's
// Controls for players and the pause screen's key list that matches them.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test, read, directory, loadGame, playApp, fakeDocument } = require('./harness');

const root = path.join(directory, '..', '..');

function drawnText(VL, document, app) {
  const strings = [];
  const original = VL.ART.text;
  VL.ART.text = (ctx, str, ...rest) => {
    strings.push(String(str));
    return original(ctx, str, ...rest);
  };
  VL.render(document.createElement('canvas').getContext('2d'), app, 0);
  VL.ART.text = original;
  return strings;
}

function pausedApp({ dungeon = false } = {}) {
  const document = fakeDocument();
  const context = loadGame({ document });
  if (dungeon) vm.runInContext(read('tests/sample-dungeon.js'), context, { filename: 'tests/sample-dungeon.js' });
  const { VL } = context;
  const app = playApp(VL);
  app.game.popups.seen.controls = true;
  app.game.popups.queue.length = 0;
  if (dungeon) VL.place(app.game, { area: 'sample', screen: '0,0', tx: 7, ty: 8, facing: 'up' });
  app.setScene('pause');
  return { VL, app, text: () => drawnText(VL, document, app) };
}

test('the home page lists The Vanishing Library in the card format, alphabetically, with its icon', () => {
  const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const cards = [...home.matchAll(/<li><a href="([^"]+)"><img src="([^"]+)" alt="([^"]+)"><span>([^<]+)<\/span><\/a><\/li>/g)];
  const card = cards.find(([, href]) => href === 'games/vanishing-library/index.html');
  assert.ok(card, 'a card links the game');
  assert.equal(card[2], 'games/vanishing-library/icon.svg');
  assert.equal(card[3], 'The Vanishing Library icon');
  assert.equal(card[4], 'The Vanishing Library');
  const names = cards.map(([, , , , name]) => name);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)), 'kept alphabetical');
  const listed = home.slice(home.indexOf('<ul class="games">'), home.indexOf('</ul>'));
  assert.ok(listed.includes(card[0]), 'inside the .games list');
});

test('the icon is a 64×64 SVG drawn in the art kit\'s palette', () => {
  const { VL } = loadGame();
  const svg = read('icon.svg');
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 64 64"/);
  assert.match(svg, /aria-label="[^"]+"/);
  const palette = new Set(Object.values(VL.PALETTE).map((c) => c.slice(0, 7).toLowerCase()));
  for (const [colour] of svg.matchAll(/#[0-9a-f]{6}\b/gi)) assert.ok(palette.has(colour.toLowerCase()), `${colour} is a kit colour`);
});

test('README tells players the controls, keeping the chicken flight a secret', () => {
  const readme = read('README.md');
  const start = readme.indexOf('## Controls');
  assert.ok(start > 0, 'a Controls section');
  const section = readme.slice(start, readme.indexOf('\n## ', start + 1));
  for (const key of ['Arrow keys', '| S |', '| Space |', '| D |', '| E |', '| M |', '| N |', '| Esc |', '| Enter |', '| Backspace |']) {
    assert.ok(section.includes(key), `lists ${key}`);
  }
  assert.ok(!section.includes('| F |'), 'F stays a secret');
  const { VL } = loadGame();
  const popup = VL.POPUPS.controls.text;
  for (const [key, name] of [['S ', 'S'], ['E ', 'E'], ['Esc ', 'Esc']]) assert.ok(popup.includes(key), `the popup teaches ${name}`);
  assert.ok(section.includes('teaches the arrows, S, E and Esc'), 'the README says what the first popup teaches');
});

test('game code comments carry no review or QA history (protocol rule 10)', () => {
  const files = read('manifest.js').match(/'[^']+\.js'/g).map((name) => name.slice(1, -1));
  assert.ok(files.length > 20, 'read the manifest');
  for (const file of files) {
    read(file).split('\n').forEach((line, i) => {
      assert.doesNotMatch(line, /\/\/.*\b(QA\b|review [CIM]\d)/, `${file}:${i + 1}`);
    });
  }
});

test('pause lists M for the map once there is one to open, and never before', () => {
  const before = pausedApp();
  assert.ok(!before.text().some((s) => /\bM: MAP\b/.test(s)), 'no map yet');
  before.VL.giveItem(before.app.game, 'worldMap');
  assert.ok(before.text().some((s) => /\bM: MAP\b/.test(s)), 'the drawn world map');
  const inside = pausedApp({ dungeon: true });
  assert.ok(inside.text().some((s) => /\bM: MAP\b/.test(s)), 'a dungeon always has its map');
});

test('the pause key list fits its box', () => {
  const { VL, app, text } = pausedApp({ dungeon: true });
  app.game.items.woodSword = true;
  app.game.hands.mainHand = 'woodSword';
  for (const hint of text().filter((s) => /: /.test(s))) assert.ok(VL.ART.measureText(hint, 'small') <= 168, hint);
});
