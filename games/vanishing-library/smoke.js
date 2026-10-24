// Headless-Chrome smoke over the DevTools protocol (Node's built-in WebSocket,
// no dependencies). Loads index.html from file://, fails on any console error
// or uncaught exception, checks the integer scale at two window sizes and on a
// live resize, walks the hero with real key events, checks a screen slide pans
// the right way, plays the real start (title, typed name, intro, controls
// popup, pause, Save & Quit, reload), plays every sound effect and toggles the
// persisted mute, plays W5's core loop (chest, equipment, bush, berries), talks
// to townsfolk and opens a shop, and saves a screenshot of each size, scene and
// art sheet page.
// Run: node games/vanishing-library/smoke.js --out <dir>
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const chrome = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const outIndex = process.argv.indexOf('--out');
const outDir = outIndex === -1 ? path.join(os.tmpdir(), 'vanishing-library-smoke') : process.argv[outIndex + 1];
if (outIndex !== -1 && (!outDir || outDir.startsWith('--'))) {
  console.error('usage: node games/vanishing-library/smoke.js [--out <dir>]   (CHROME=<path> overrides the browser)');
  process.exit(2);
}
const pageUrl = `file://${path.join(__dirname, 'index.html')}`;
const sizes = [
  { width: 1024, height: 700, theme: 'dark' },
  { width: 1600, height: 1000, theme: 'light' },
];
const walkMs = 300;
const slideMs = 700; // ~13 px to the edge, then the 350 ms slide
const timeoutMs = 90000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForPort(profile) {
  const file = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100; i += 1) {
    if (fs.existsSync(file)) {
      const [port, browserPath] = fs.readFileSync(file, 'utf8').trim().split('\n');
      if (browserPath) return `ws://127.0.0.1:${port}${browserPath}`;
    }
    await sleep(100);
  }
  throw new Error('Chrome did not open a DevTools port');
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const pending = new Map();
    const listeners = [];
    let nextId = 1;
    ws.onopen = () => resolve({
      send(method, params = {}, sessionId) {
        const id = nextId;
        nextId += 1;
        ws.send(JSON.stringify({ id, method, params, sessionId }));
        return new Promise((ok, fail) => pending.set(id, { ok, fail, method }));
      },
      on(listener) {
        listeners.push(listener);
      },
      close: () => ws.close(),
    });
    ws.onerror = reject;
    ws.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      if (message.id && pending.has(message.id)) {
        const { ok, fail, method } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) fail(new Error(`${method}: ${message.error.message}`));
        else ok(message.result);
      } else if (message.method) {
        for (const listener of listeners) listener(message);
      }
    };
  });
}

// What the page reports about itself; JSON so values cross the protocol by value.
const pageInfo = `(() => {
  const canvas = document.getElementById('game');
  const rect = canvas.getBoundingClientRect();
  return JSON.stringify({
    title: document.title, theme: document.documentElement.dataset.theme,
    scale: Number(canvas.dataset.scale), rectWidth: rect.width, rectHeight: rect.height,
    bottom: rect.bottom, innerWidth, innerHeight, backing: canvas.width,
    scrollY, scrollHeight: document.scrollingElement.scrollHeight,
    scene: VL.app.sceneId, startScene: VL.START_SCENE,
    heroX: VL.app.game ? VL.app.game.player.x : null, heroY: VL.app.game ? VL.app.game.player.y : null,
    screen: VL.app.game ? VL.app.game.player.screen : null,
  });
})()`;

// The arrow whose next tile (and preferably the one after) is open ground, so
// the walk doesn't depend on which way the real start spot faces.
const openDirection = `(() => {
  const game = VL.app.game;
  const { tx, ty } = VL.heroTile(game);
  const { cols, rows } = VL.TUNING;
  const inside = (x, y) => x >= 0 && x < cols && y >= 0 && y < rows;
  let best = null;
  for (const [dir, dx, dy] of [['Right', 1, 0], ['Left', -1, 0], ['Down', 0, 1], ['Up', 0, -1]]) {
    let run = 0;
    while (run < 2 && inside(tx + dx * (run + 1), ty + dy * (run + 1)) && !VL.isSolidAt(game.player.area, game.player.screen, tx + dx * (run + 1), ty + dy * (run + 1))) run += 1;
    if (!best || run > best.run) best = { dir, dx, dy, run };
  }
  return JSON.stringify(best);
})()`;

// Puts a new game on the first open edge crossing of the start area and logs
// where the renderer draws each screen and the hero while the slide runs.
const slideSetup = `(() => {
  const { cols, rows } = VL.TUNING;
  const area = VL.START.area;
  const dirs = { Left: [-1, 0], Right: [1, 0], Up: [0, -1], Down: [0, 1] };
  for (const key of Object.keys(VL.AREAS[area].screens)) {
    for (const [dir, [dx, dy]] of Object.entries(dirs)) {
      for (let i = 0; i < (dx ? rows : cols); i += 1) {
        const tx = dx ? (dx < 0 ? 0 : cols - 1) : i;
        const ty = dy ? (dy < 0 ? 0 : rows - 1) : i;
        if (VL.isSolidAt(area, key, tx, ty) || VL.isSolidAt(area, key, tx + dx, ty + dy)) continue;
        VL.app.game = VL.newGame();
        VL.app.setScene('play');
        VL.place(VL.app.game, { area, screen: key, tx, ty });
        document.getElementById('game').focus();
        window.__slideDraws = [];
        const drawScreen = VL.drawScreen;
        VL.drawScreen = function (ctx, screenArea, screenKey, ox, oy, ...rest) {
          const slide = VL.app.game.transition;
          if (slide) window.__slideDraws.push({ k: slide.t / slide.duration, screen: screenKey, x: ox, y: oy });
          return drawScreen.call(this, ctx, screenArea, screenKey, ox, oy, ...rest);
        };
        const drawHero = VL.ART.drawHero;
        VL.ART.drawHero = function (ctx, player, x, y, t) {
          if (VL.app.game.transition) window.__slideDraws.push({ hero: true, x, y });
          return drawHero.call(this, ctx, player, x, y, t);
        };
        return JSON.stringify({ dir, dx, dy, from: key, to: VL.neighborKey(key, dx, dy), tx, ty });
      }
    }
  }
  return null;
})()`;

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vl-chrome-'));
  const browser = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${profile}`, '--remote-debugging-port=0', '--hide-scrollbars', 'about:blank',
  ], { stdio: 'ignore' });
  // A stalled Chrome must fail the build, not hang it.
  const watchdog = setTimeout(() => {
    console.log(`FAIL smoke timed out after ${timeoutMs / 1000} s`);
    browser.kill();
    process.exit(1);
  }, timeoutMs);
  let failures = 0;
  const results = [];
  try {
    const cdp = await connect(await waitForPort(profile));
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const call = (method, params) => cdp.send(method, params, sessionId);
    const errors = [];
    let loaded = null;
    cdp.on((message) => {
      if (message.sessionId !== sessionId) return;
      if (message.method === 'Runtime.exceptionThrown') errors.push(`exception: ${message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text}`);
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(`console.error: ${message.params.args.map((a) => a.value ?? a.description).join(' ')}`);
      if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') errors.push(`log: ${message.params.entry.text} ${message.params.entry.url || ''}`);
      if (message.method === 'Page.loadEventFired') loaded?.();
    });
    await call('Runtime.enable');
    await call('Page.enable');
    await call('Log.enable');

    // Evaluate in the page and surface a thrown error as a readable failure.
    async function evaluate(expression) {
      const { result, exceptionDetails } = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (exceptionDetails) throw new Error(`page: ${exceptionDetails.exception?.description || exceptionDetails.text}`);
      return result.value;
    }
    // Two animation frames, so the loop has stepped and drawn. Headless Chrome
    // stops delivering frames after some un-prevented key defaults, so the
    // wait is bounded and a frozen loop is a reported failure, not a hang.
    const settle = async () => (await evaluate(`Promise.race([
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r('ok')))),
      new Promise((r) => setTimeout(() => r('stalled'), 2000)),
    ])`)) === 'ok';
    const info = async () => JSON.parse(await evaluate(pageInfo));
    const keyCodes = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40 };
    const key = (type, code) => call('Input.dispatchKeyEvent', { type, key: code, code, windowsVirtualKeyCode: keyCodes[code], nativeVirtualKeyCode: keyCodes[code] });
    const holdArrow = async (dir, ms) => {
      await key('keyDown', `Arrow${dir}`);
      await sleep(ms);
      await key('keyUp', `Arrow${dir}`);
    };

    for (const size of sizes) {
      const label = `${size.width}x${size.height}-${size.theme}`;
      errors.length = 0;
      await call('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: false });
      await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: size.theme }] });
      const load = new Promise((resolve) => { loaded = resolve; });
      await call('Page.navigate', { url: pageUrl });
      await load;
      const problems = [];
      if (!(await settle())) problems.push('animation frames stopped after load');
      const page = await info();
      if (!page.title.startsWith('The Vanishing Library')) problems.push(`title: ${page.title}`);
      if (page.theme !== size.theme) problems.push(`theme ${page.theme}, expected ${size.theme}`);
      if (!(page.scale >= 1)) problems.push('no integer scale on the canvas');
      if (page.rectWidth !== 256 * page.scale || page.rectHeight !== 192 * page.scale) problems.push(`canvas is ${page.rectWidth}x${page.rectHeight} for scale ${page.scale}`);
      if (page.bottom > page.innerHeight || page.rectWidth > page.innerWidth) problems.push('canvas does not fit the window');
      if (page.scrollHeight > page.innerHeight) problems.push(`page scrolls: ${page.scrollHeight} > ${page.innerHeight}`);
      if (page.scene !== page.startScene) problems.push(`started in scene ${page.scene}, expected ${page.startScene}`);

      // Real key events reach the game: switch to play on a new game (whatever
      // the start scene) and walk from the start spot towards open ground.
      // (A page scroll from an un-prevented arrow can't show here because the
      // page has nothing to scroll; the node input test pins preventDefault.)
      await evaluate('VL.app.game = VL.newGame(); VL.app.setScene("play"); document.getElementById("game").focus()');
      const before = await info();
      const walk = JSON.parse(await evaluate(openDirection));
      if (!walk.run) problems.push('no open tile next to the start spot');
      await holdArrow(walk.dir, walkMs);
      if (!(await settle())) problems.push('animation frames stopped after the key events');
      const after = await info();
      const moved = (after.heroX - before.heroX) * walk.dx + (after.heroY - before.heroY) * walk.dy;
      if (after.scene !== 'play' || !after.screen) problems.push(`scene ${after.scene}, screen ${after.screen}`);
      if (!(moved >= 8)) problems.push(`Arrow${walk.dir} for ${walkMs} ms moved the hero ${moved} px`);
      const shot = path.join(outDir, `${label}.png`);
      const { data } = await call('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(shot, Buffer.from(data, 'base64'));
      problems.push(...errors);
      results.push({ label, page, problems });
      if (problems.length) failures += 1;
      console.log(`${problems.length ? 'FAIL' : 'ok  '} ${label}: scale ${page.scale} (${page.rectWidth}x${page.rectHeight} in ${page.innerWidth}x${page.innerHeight}), walked ${Math.round(moved)} px, ${errors.length} console errors, ${shot}`);
      for (const problem of problems) console.log(`     ${problem}`);
    }
    if (results.length === 2 && !(results[1].page.scale > results[0].page.scale)) {
      failures += 1;
      console.log(`FAIL the larger window should get a larger scale (${results.map((r) => r.page.scale).join(' vs ')})`);
    }

    // A screen slide on the real canvas: the new screen must enter from the
    // edge the hero crossed, the old one leave through the far edge, and the
    // hero stay on the canvas throughout. A reversed slide fails here.
    errors.length = 0;
    const slideProblems = [];
    const slide = JSON.parse(await evaluate(slideSetup));
    if (!slide) {
      slideProblems.push(`no open edge between two screens of ${await evaluate('VL.START.area')}`);
    } else {
      await holdArrow(slide.dir, slideMs);
      if (!(await settle())) slideProblems.push('animation frames stopped during the slide');
      const draws = JSON.parse(await evaluate('JSON.stringify(window.__slideDraws)'));
      const landed = await info();
      const axis = slide.dx ? 'x' : 'y';
      const sign = slide.dx || slide.dy;
      const span = slide.dx ? 256 : 176;
      const mid = draws.filter((d) => !d.hero && d.k > 0.1 && d.k < 0.9);
      const incoming = mid.filter((d) => d.screen === slide.to);
      const outgoing = mid.filter((d) => d.screen === slide.from);
      if (landed.screen !== slide.to) slideProblems.push(`walking ${slide.dir} from ${slide.from} landed on ${landed.screen}, expected ${slide.to}`);
      if (incoming.length < 3 || outgoing.length < 3) slideProblems.push(`only ${incoming.length}/${outgoing.length} mid-slide frames of the new/old screen were drawn`);
      for (const d of incoming) if (!(Math.sign(d[axis]) === sign && Math.abs(d[axis]) < span)) slideProblems.push(`new screen ${slide.to} drawn at ${d.x},${d.y} at ${d.k.toFixed(2)}: it should enter from the ${slide.dir.toLowerCase()} edge`);
      for (const d of outgoing) if (!(Math.sign(d[axis]) === -sign && Math.abs(d[axis]) < span)) slideProblems.push(`old screen ${slide.from} drawn at ${d.x},${d.y} at ${d.k.toFixed(2)}: it should leave through the far edge`);
      for (const d of draws.filter((h) => h.hero)) if (!(d.x >= -1 && d.x <= 256 && d.y >= -1 && d.y <= 176)) slideProblems.push(`hero drawn off the canvas at ${d.x},${d.y} during the slide`);
      slideProblems.push(...errors);
    }
    if (slideProblems.length) failures += 1;
    console.log(`${slideProblems.length ? 'FAIL' : 'ok  '} slide ${slide ? `${slide.dir.toLowerCase()} from ${slide.from} to ${slide.to}` : ''}`);
    for (const problem of [...new Set(slideProblems)].slice(0, 6)) console.log(`     ${problem}`);

    // The live resize listener: shrink the window without reloading.
    errors.length = 0;
    const [small] = sizes;
    await call('Emulation.setDeviceMetricsOverride', { width: small.width, height: small.height, deviceScaleFactor: 1, mobile: false });
    const resizeProblems = [];
    if (!(await settle())) resizeProblems.push('animation frames stopped after the resize');
    const resized = await info();
    resizeProblems.push(...errors);
    if (resized.scale !== results[0].page.scale) resizeProblems.push(`scale ${resized.scale} after resizing to ${small.width}x${small.height}, expected ${results[0].page.scale}`);
    if (resized.bottom > resized.innerHeight || resized.rectWidth > resized.innerWidth) resizeProblems.push('canvas does not fit after the resize');
    if (resizeProblems.length) failures += 1;
    console.log(`${resizeProblems.length ? 'FAIL' : 'ok  '} resize to ${small.width}x${small.height} without reload: scale ${resized.scale}`);
    for (const problem of resizeProblems) console.log(`     ${problem}`);

    // The real start with key events: title → typed name → intro → play,
    // pause, Save & Quit, and a reload that finds the save (file:// keeps
    // localStorage in this profile).
    errors.length = 0;
    const flowProblems = [];
    const vk = { Enter: 13, Escape: 27, ArrowDown: 40, KeyN: 78, KeyS: 83 };
    const tap = async (code, keyName = code) => {
      const event = { key: keyName, code, windowsVirtualKeyCode: vk[code], nativeVirtualKeyCode: vk[code] };
      await call('Input.dispatchKeyEvent', { type: 'keyDown', ...event });
      await call('Input.dispatchKeyEvent', { type: 'keyUp', ...event });
      if (!(await settle())) flowProblems.push(`animation frames stopped after ${code}`);
    };
    const typeText = async (text) => {
      for (const ch of text) await tap(`Key${ch.toUpperCase()}`, ch);
    };
    const canvasShot = async (name) => {
      const rect = JSON.parse(await evaluate('JSON.stringify(document.getElementById("game").getBoundingClientRect())'));
      const { data } = await call('Page.captureScreenshot', { format: 'png', clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 1 } });
      fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
    };
    const expectScene = async (scene, after) => {
      const page = await info();
      if (page.scene !== scene) flowProblems.push(`after ${after}: scene ${page.scene}, expected ${scene}`);
    };
    const reload = async () => {
      const load = new Promise((resolve) => { loaded = resolve; });
      await call('Page.navigate', { url: pageUrl });
      await load;
      if (!(await settle())) flowProblems.push('animation frames stopped after a reload');
    };
    await evaluate("for (const key of Object.keys(localStorage)) if (key.startsWith('vanishing-library-')) localStorage.removeItem(key)");
    await reload();
    await expectScene('title', 'load');
    await canvasShot('title');
    await tap('Enter');
    await expectScene('name', 'Enter on an empty slot');
    await typeText('Robin');
    const typed = await evaluate('VL.app.naming && VL.app.naming.text');
    if (typed !== 'Robin') flowProblems.push(`the name field holds ${JSON.stringify(typed)}, expected "Robin"`);
    await canvasShot('name');
    await tap('Enter');
    await expectScene('intro', 'Enter on the name');
    await sleep(1500);
    await canvasShot('intro');
    await tap('KeyS', 's');
    // Play starts with the one-time controls popup (W5); S closes it.
    await sleep(500);
    await expectScene('popup', 'S on the intro');
    await canvasShot('controls-popup');
    await tap('KeyS', 's');
    await expectScene('play', 'S on the controls popup');
    const started = JSON.parse(await evaluate("JSON.stringify({ name: VL.app.game && VL.app.game.name, slot: VL.app.slot, saved: localStorage.getItem('vanishing-library-slot-1') })"));
    if (started.name !== 'Robin' || started.slot !== 0) flowProblems.push(`new game is ${started.name} in slot ${started.slot}`);
    if (!started.saved || !started.saved.includes('"name":"Robin"')) flowProblems.push('the new game was not saved to slot 1');
    await tap('Escape');
    await expectScene('pause', 'Esc in play');
    await canvasShot('pause');
    await tap('ArrowDown');
    await tap('Enter');
    await expectScene('title', 'Save & Quit');
    await canvasShot('title-saved');
    await reload();
    const slot = JSON.parse(await evaluate('JSON.stringify(VL.app.title.slots[0])'));
    if (slot.status !== 'ok' || slot.summary.name !== 'Robin') flowProblems.push(`after the reload slot 1 is ${JSON.stringify(slot)}`);
    // The mute icon and note on the title (no HUD): shot while muted, then unmuted again.
    await tap('KeyN', 'n');
    if ((await evaluate('VL.SOUND.muted')) !== true) flowProblems.push('N did not mute on the title');
    await canvasShot('title-muted');
    await tap('KeyN', 'n');
    if ((await evaluate('VL.SOUND.muted')) !== false) flowProblems.push('N did not unmute on the title');
    await tap('Enter');
    await expectScene('play', 'Enter on the saved slot');
    const resumed = JSON.parse(await evaluate('JSON.stringify(VL.app.game ? [VL.app.game.name, VL.app.game.hp, VL.app.game.maxHp] : null)'));
    if (!resumed || resumed[0] !== 'Robin' || resumed[1] !== resumed[2]) flowProblems.push(`continued as ${JSON.stringify(resumed)}`);
    flowProblems.push(...errors);
    if (flowProblems.length) failures += 1;
    console.log(`${flowProblems.length ? 'FAIL' : 'ok  '} start flow: title, name "Robin", intro, play, pause, Save & Quit, reload, continue`);
    for (const problem of flowProblems) console.log(`     ${problem}`);

    // Sound in a real browser: the arrow presses above unlocked WebAudio, every
    // effect builds a graph the browser accepts, and the N mute survives a reload.
    // A block of its own, so its names never clash with another check's.
    {
      errors.length = 0;
      const soundProblems = [];
      const sound = JSON.parse(await evaluate(`JSON.stringify({
        state: VL.SOUND.contextState(), muted: VL.SOUND.muted,
        silent: Object.keys(VL.SOUND.EFFECTS).filter((name) => !VL.sfx(name)),
      })`));
      if (sound.state !== 'running') soundProblems.push(`audio context ${sound.state} after real key presses`);
      if (sound.muted) soundProblems.push('sound starts muted on a fresh profile');
      if (sound.silent.length) soundProblems.push(`effects that did not play: ${sound.silent.join(', ')}`);
      const muteKey = (type) => call('Input.dispatchKeyEvent', { type, key: 'n', code: 'KeyN', text: type === 'keyDown' ? 'n' : undefined, windowsVirtualKeyCode: 78, nativeVirtualKeyCode: 78 });
      await muteKey('keyDown');
      await muteKey('keyUp');
      if (!(await settle())) soundProblems.push('animation frames stopped after the mute key');
      const mutedNow = JSON.parse(await evaluate("JSON.stringify([VL.SOUND.muted, localStorage.getItem('vanishing-library-muted')])"));
      if (mutedNow[0] !== true || mutedNow[1] !== '1') soundProblems.push(`N did not mute and save: ${mutedNow}`);
      fs.writeFileSync(path.join(outDir, 'muted.png'), Buffer.from((await call('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
      const soundReload = new Promise((resolve) => { loaded = resolve; });
      await call('Page.reload');
      await soundReload;
      if (!(await settle())) soundProblems.push('animation frames stopped after the reload');
      if ((await evaluate('VL.SOUND.muted')) !== true) soundProblems.push('mute was not restored after a reload');
      await muteKey('keyDown');
      await muteKey('keyUp');
      if ((await evaluate("localStorage.getItem('vanishing-library-muted')")) !== '0') soundProblems.push('N did not unmute');
      soundProblems.push(...errors);
      if (soundProblems.length) failures += 1;
      console.log(`${soundProblems.length ? 'FAIL' : 'ok  '} sound: context ${sound.state}, mute toggles and persists, ${path.join(outDir, 'muted.png')}`);
      for (const problem of soundProblems) console.log(`     ${problem}`);
    }

    // W5's core loop with real keys: the hut and its chest (S), the sword and
    // shield popups, the equipment screen (E), a bush cut with Space and a
    // berry bush picked with S. A block of its own, so its names never clash.
    {
      errors.length = 0;
      const loopProblems = [];
      const codes = { KeyS: [83, 's'], KeyE: [69, 'e'], Space: [32, ' '] };
      const press = async (code) => {
        const [vkCode, keyName] = codes[code];
        const event = { key: keyName, code, windowsVirtualKeyCode: vkCode, nativeVirtualKeyCode: vkCode };
        await call('Input.dispatchKeyEvent', { type: 'keyDown', ...event });
        await call('Input.dispatchKeyEvent', { type: 'keyUp', ...event });
        if (!(await settle())) loopProblems.push(`animation frames stopped after ${code}`);
      };
      const shot = async (name) => {
        const rect = JSON.parse(await evaluate('JSON.stringify(document.getElementById("game").getBoundingClientRect())'));
        const { data } = await call('Page.captureScreenshot', { format: 'png', clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 1 } });
        fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
      };
      const scene = async () => (await info()).scene;
      const expect = async (wanted, after) => {
        const got = await scene();
        if (got !== wanted) loopProblems.push(`after ${after}: scene ${got}, expected ${wanted}`);
      };
      const closePopups = async () => {
        for (let i = 0; i < 6 && (await scene()) === 'popup'; i += 1) {
          await sleep(400);
          await press('KeyS');
        }
      };
      const placeHero = (where) => evaluate(`(() => {
        VL.app.game = VL.app.game || VL.newGame();
        VL.app.game.popups.seen.controls = true;
        VL.app.setScene('play');
        VL.place(VL.app.game, ${JSON.stringify(where)});
        document.getElementById('game').focus();
      })()`);
      await evaluate('VL.app.startGame(VL.newGame({ name: "Robin" }), null)');
      const chest = JSON.parse(await evaluate("JSON.stringify(VL.getScreen('hut', '0,0').entities.find((e) => e.type === 'chest'))"));
      await placeHero({ area: 'hut', screen: '0,0', tx: chest.x, ty: chest.y + 1, facing: 'up' });
      await sleep(300);
      await shot('w5-hut');
      await press('KeyS');
      await sleep(300);
      await expect('popup', 'S at the chest');
      await shot('w5-chest-popup');
      const hands = JSON.parse(await evaluate('JSON.stringify(VL.app.game.hands)'));
      if (hands.mainHand !== 'woodSword' || hands.offHand !== 'woodShield') loopProblems.push(`the chest put ${JSON.stringify(hands)} in the hands`);
      await closePopups();
      await expect('play', 'closing the chest popups');
      await evaluate('VL.addResource(VL.app.game, "berries", 3); VL.addResource(VL.app.game, "wood", 4); VL.addResource(VL.app.game, "shells", 12)');
      await press('KeyE');
      await expect('equipment', 'E');
      await sleep(200);
      await shot('w5-equipment');
      await press('KeyE');
      await expect('play', 'E on the equipment screen');
      const bush = JSON.parse(await evaluate(`JSON.stringify((() => {
        for (const [key, screen] of Object.entries(VL.AREAS.overworld.screens)) {
          for (let ty = 1; ty < 10; ty += 1) {
            for (let tx = 1; tx < 15; tx += 1) {
              if (screen.tiles[ty][tx] === 'B' && !VL.isSolidAt('overworld', key, tx, ty - 1)) return { screen: key, tx, ty };
            }
          }
        }
        return null;
      })())`));
      if (!bush) loopProblems.push('no bush with open ground above it in the overworld');
      else {
        await placeHero({ area: 'overworld', screen: bush.screen, tx: bush.tx, ty: bush.ty - 1, facing: 'down' });
        await sleep(200);
        await press('Space');
        await shot('w5-bush-cut');
        const cut = await evaluate(`!VL.isSolidAt('overworld', ${JSON.stringify(bush.screen)}, ${bush.tx}, ${bush.ty}, VL.app.game.room)`);
        if (!cut) loopProblems.push(`Space did not cut the bush at ${bush.screen} ${bush.tx},${bush.ty}`);
        await sleep(400);
        await shot('w5-bush-after');
      }
      const berry = JSON.parse(await evaluate(`JSON.stringify((() => {
        for (const [key, screen] of Object.entries(VL.AREAS.overworld.screens)) {
          for (let ty = 1; ty < 10; ty += 1) {
            for (let tx = 1; tx < 15; tx += 1) {
              if (screen.tiles[ty][tx] === 'Y' && !VL.isSolidAt('overworld', key, tx, ty + 1)) return { screen: key, tx, ty };
            }
          }
        }
        return null;
      })())`));
      if (!berry) loopProblems.push('no berry bush with open ground below it in the overworld');
      else {
        await placeHero({ area: 'overworld', screen: berry.screen, tx: berry.tx, ty: berry.ty + 1, facing: 'up' });
        await evaluate('VL.app.game.hp = 2');
        await sleep(200);
        await shot('w5-berry-bush');
        await press('KeyS');
        await sleep(300);
        await expect('popup', 'S at the berry bush');
        await shot('w5-berries-picked');
        await closePopups();
        const picked = JSON.parse(await evaluate('JSON.stringify([VL.app.game.inventory.berries, VL.app.game.hp])'));
        if (!(picked[0] >= 5)) loopProblems.push(`picking gave ${picked[0]} berries in all`);
      }
      loopProblems.push(...errors);
      if (loopProblems.length) failures += 1;
      console.log(`${loopProblems.length ? 'FAIL' : 'ok  '} core loop: hut chest, popups, equipment, bush cut, berries, ${path.join(outDir, 'w5-*.png')}`);
      for (const problem of loopProblems) console.log(`     ${problem}`);
    }

    // The art kit, page by page (scenes/art-sheet.js), cropped to the canvas:
    // the evidence for comparing with the approved mockup.
    errors.length = 0;
    const artProblems = [];
    const pageCount = await evaluate('VL.ART_SHEET_PAGES');
    for (let page = 0; page < pageCount; page += 1) {
      await evaluate(`VL.app.setScene('artSheet', { page: ${page} })`);
      if (!(await settle())) artProblems.push(`animation frames stopped on art page ${page + 1}`);
      const rect = JSON.parse(await evaluate('JSON.stringify(document.getElementById("game").getBoundingClientRect())'));
      const clip = { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 1 };
      const { data } = await call('Page.captureScreenshot', { format: 'png', clip });
      fs.writeFileSync(path.join(outDir, `art-${page + 1}.png`), Buffer.from(data, 'base64'));
    }
    artProblems.push(...errors);
    if (!(pageCount >= 1)) artProblems.push('no art sheet pages');
    if (artProblems.length) failures += 1;
    console.log(`${artProblems.length ? 'FAIL' : 'ok  '} art sheet: ${pageCount} pages, ${path.join(outDir, 'art-*.png')}`);
    for (const problem of artProblems) console.log(`     ${problem}`);

    // The overworld map (W8): every screen drawn on the real canvas with the
    // hero standing on it, saved as map-<region>-<x>_<y>.png. A block of its
    // own, so its names never clash with another check's.
    {
      errors.length = 0;
      const mapProblems = [];
      const screens = JSON.parse(await evaluate('JSON.stringify(Object.values(VL.REGIONS).flatMap((r) => r.screens.map((screen) => [r.id, screen])))'));
      for (const [region, screen] of screens) {
        const placed = await evaluate(`(() => {
          const { cols, rows } = VL.TUNING;
          for (let ty = rows - 2; ty > 0; ty -= 1) for (let tx = 1; tx < cols - 1; tx += 1) {
            if (VL.isSolidAt('overworld', '${screen}', tx, ty)) continue;
            VL.app.game = VL.newGame();
            VL.app.setScene('play');
            VL.place(VL.app.game, { area: 'overworld', screen: '${screen}', tx, ty });
            return true;
          }
          return false;
        })()`);
        if (!placed) mapProblems.push(`no open tile to stand on in ${screen}`);
        if (!(await settle())) mapProblems.push(`animation frames stopped on ${screen}`);
        const rect = JSON.parse(await evaluate('JSON.stringify(document.getElementById("game").getBoundingClientRect())'));
        const { data } = await call('Page.captureScreenshot', { format: 'png', clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 1 } });
        fs.writeFileSync(path.join(outDir, `map-${region}-${screen.replace(',', '_')}.png`), Buffer.from(data, 'base64'));
      }
      mapProblems.push(...errors);
      if (!(screens.length >= 30)) mapProblems.push(`only ${screens.length} overworld screens`);
      if (mapProblems.length) failures += 1;
      console.log(`${mapProblems.length ? 'FAIL' : 'ok  '} overworld: ${screens.length} screens drawn, ${path.join(outDir, 'map-*.png')}`);
      for (const problem of mapProblems.slice(0, 6)) console.log(`     ${problem}`);
    }

    // W6 combat with real keys: every roster enemy on a screen it lives on, a
    // sword hit knocking a slime back, the hero hurt and knocked back, a seed
    // blocked by the raised shield (D held) and a heart container's popup,
    // saved as w6-*.png. A block of its own, so its names never clash.
    {
      errors.length = 0;
      const combatProblems = [];
      const codes = { KeyD: [68, 'd'], Space: [32, ' '], ArrowLeft: [37, 'ArrowLeft'] };
      const key = (type, code) => {
        const [vkCode, keyName] = codes[code];
        return call('Input.dispatchKeyEvent', { type, key: keyName, code, windowsVirtualKeyCode: vkCode, nativeVirtualKeyCode: vkCode });
      };
      const shot = async (name) => {
        const rect = JSON.parse(await evaluate('JSON.stringify(document.getElementById("game").getBoundingClientRect())'));
        const { data } = await call('Page.captureScreenshot', { format: 'png', clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 1 } });
        fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
      };
      const read = async (expression) => JSON.parse(await evaluate(`JSON.stringify((() => { const g = VL.app.game; return ${expression}; })())`));
      // A new game in play at `where`, gear in hand without its popups, and
      // the screen's own enemies cleared unless `keep`.
      const stage = (where, gear = [], keep = false) => evaluate(`(() => {
        VL.app.startGame(VL.newGame({ name: 'Robin' }), null);
        const g = VL.app.game;
        g.popups.seen.controls = true;
        for (const id of ${JSON.stringify(gear)}) VL.giveItem(g, id);
        g.popups.queue.length = 0;
        VL.app.setScene('play');
        VL.place(g, ${JSON.stringify(where)});
        if (!${keep}) g.room.entities = g.room.entities.filter((e) => !VL.isEnemy(e));
        document.getElementById('game').focus();
      })()`);

      const homes = await read(`(() => {
        const found = {};
        for (const [screen, data] of Object.entries(VL.AREAS.overworld.screens)) {
          for (const e of data.entities) if (VL.ENEMIES[e.type] && !found[e.type]) found[e.type] = { screen, x: e.x, y: e.y };
        }
        return found;
      })()`);
      for (const type of ['crab', 'slime', 'bat', 'spitter', 'gull']) {
        const home = homes[type];
        if (!home) {
          combatProblems.push(`no ${type} anywhere in the overworld`);
          continue;
        }
        const spot = await read(`(() => {
          let best = null;
          for (let ty = 1; ty < 10; ty += 1) for (let tx = 1; tx < 15; tx += 1) {
            const d = Math.hypot(tx - ${home.x}, ty - ${home.y});
            if (d < 3 || VL.isSolidAt('overworld', '${home.screen}', tx, ty)) continue;
            if (!best || d < best.d) best = { tx, ty, d };
          }
          return best;
        })()`);
        await stage({ area: 'overworld', screen: home.screen, tx: spot.tx, ty: spot.ty, facing: 'down' }, [], true);
        await sleep(type === 'gull' ? 1800 : 500);
        await shot(`w6-enemy-${type}`);
        const there = await read(`g.room.entities.some((e) => e.type === '${type}')`);
        if (!there) combatProblems.push(`no ${type} on ${home.screen} in play`);
      }

      await stage({ area: 'overworld', screen: '1,0', tx: 7, ty: 5, facing: 'right' }, ['woodSword']);
      await evaluate("Object.assign(VL.spawnEnemy(VL.app.game, 'slime', 8, 5), { timer: 99 })");
      await sleep(150);
      await key('keyDown', 'Space');
      await key('keyUp', 'Space');
      await sleep(70);
      await shot('w6-hit-knockback');
      const slime = await read("(() => { const s = g.room.entities.find((e) => e.type === 'slime'); return s && { hp: s.hp, cx: s.cx }; })()");
      if (!slime || slime.hp !== 1 || !(slime.cx > 8 * 16 + 8 + 4)) combatProblems.push(`Space did not hit and knock the slime back: ${JSON.stringify(slime)}`);

      await stage({ area: 'overworld', screen: '1,0', tx: 7, ty: 5, facing: 'right' });
      await evaluate("(() => { const p = VL.app.game.player; Object.assign(VL.spawnEnemy(VL.app.game, 'crab', 8, 5), { mode: 'pause', timer: 99, cx: p.x + 10, cy: p.y - 5 }); })()");
      await sleep(100);
      await shot('w6-hurt');
      const hurt = await read('[g.hp, g.maxHp, g.player.x, g.player.flash > 0]');
      if (!(hurt[0] < hurt[1]) || !(hurt[2] < 7 * 16 + 8) || !hurt[3]) combatProblems.push(`the crab did not hurt and knock back the hero: ${JSON.stringify(hurt)}`);

      await stage({ area: 'overworld', screen: '1,0', tx: 7, ty: 5, facing: 'right' }, ['woodShield']);
      await evaluate("Object.assign(VL.spawnEnemy(VL.app.game, 'spitter', 10, 5), { timer: 0.1 })");
      await key('keyDown', 'KeyD');
      let blocked = false;
      for (let i = 0; i < 60 && !blocked; i += 1) {
        await sleep(25);
        blocked = await read('g.player.blockedAt !== undefined');
      }
      await sleep(40);
      await shot('w6-shield-block');
      await key('keyUp', 'KeyD');
      const block = await read('[g.hp, g.maxHp]');
      if (!blocked || block[0] !== block[1]) combatProblems.push(`the raised shield did not block the seed: blocked ${blocked}, hearts ${block}`);

      const heart = await read('VL.SPOTS.heartFieldA');
      await stage({ area: heart.area, screen: heart.screen, tx: heart.x, ty: heart.y, facing: 'down' });
      await sleep(100);
      await key('keyDown', 'ArrowLeft');
      await sleep(80);
      await key('keyUp', 'ArrowLeft');
      await sleep(400);
      await shot('w6-heart-container');
      const container = await read('[VL.app.sceneId, g.maxHp, VL.spotFound(g, "heartFieldA")]');
      if (container[0] !== 'popup' || container[1] !== 8 || !container[2]) combatProblems.push(`the heart container: ${JSON.stringify(container)}`);

      combatProblems.push(...errors);
      if (combatProblems.length) failures += 1;
      console.log(`${combatProblems.length ? 'FAIL' : 'ok  '} combat: 5 enemies, hit, hurt, shield block, heart container, ${path.join(outDir, 'w6-*.png')}`);
      for (const problem of combatProblems) console.log(`     ${problem}`);
    }

    // W9: accented name entry, talking to townsfolk with S, a long line over
    // several pages, {name} with an accented name and the shop/trade UI, with
    // real key events, saved as w9-*.png. A block of its own, so its names
    // never clash with another check's.
    {
      errors.length = 0;
      const talkProblems = [];
      const codes = { KeyS: 83, KeyE: 69, KeyO: 79, KeyZ: 90, Enter: 13, Escape: 27, ArrowDown: 40 };
      const hit = async (code, keyName = code) => {
        const event = { key: keyName, code, windowsVirtualKeyCode: codes[code], nativeVirtualKeyCode: codes[code] };
        await call('Input.dispatchKeyEvent', { type: 'keyDown', ...event });
        await call('Input.dispatchKeyEvent', { type: 'keyUp', ...event });
        if (!(await settle())) talkProblems.push(`animation frames stopped after ${code}`);
      };
      const shoot = async (name) => {
        const rect = JSON.parse(await evaluate('JSON.stringify(document.getElementById("game").getBoundingClientRect())'));
        const { data } = await call('Page.captureScreenshot', { format: 'png', clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 1 } });
        fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
      };
      const scene = () => evaluate('VL.app.sceneId');

      await evaluate("VL.app.setScene('name', { slot: 2 }); document.getElementById('game').focus()");
      for (const [code, ch] of [['KeyZ', 'Z'], ['KeyO', 'o'], ['KeyE', 'ë']]) await hit(code, ch);
      const named = await evaluate('VL.app.naming.text');
      if (named !== 'Zoë') talkProblems.push(`typing Z, o, ë gave the name ${JSON.stringify(named)}`);
      await shoot('w9-name-entry');
      await hit('Escape');

      // Stands the hero next to a townsperson, facing them, and presses S.
      const talkTo = async (npc, name) => {
        const placed = await evaluate(`(() => {
          for (const [key, screen] of Object.entries(VL.AREAS.overworld.screens)) {
            const npc = screen.entities.find((e) => e.type === 'npc' && e.id === '${npc}');
            if (!npc) continue;
            VL.app.game = VL.newGame({ name: '${name}' });
            VL.app.setScene('play');
            for (const [dx, dy, facing] of [[0, -1, 'down'], [0, 1, 'up'], [-1, 0, 'right'], [1, 0, 'left']]) {
              if (VL.isSolidAt('overworld', key, npc.x + dx, npc.y + dy)) continue;
              VL.place(VL.app.game, { area: 'overworld', screen: key, tx: npc.x + dx, ty: npc.y + dy, facing });
              return true;
            }
          }
          return false;
        })()`);
        if (!placed) talkProblems.push(`no open tile next to ${npc}`);
        await hit('KeyS', 's');
        if ((await scene()) !== 'dialogue') talkProblems.push(`S next to ${npc} gave scene ${await scene()}`);
      };

      await talkTo('nell', 'Robin');
      await sleep(1500);
      await shoot('w9-conversation');
      const nell = JSON.parse(await evaluate('JSON.stringify(VL.app.dialogue)'));
      if (!nell || nell.speaker !== 'Nell' || !nell.pages[0].join(' ').includes('Robin')) talkProblems.push(`talking to Nell showed ${JSON.stringify(nell)}`);
      await hit('KeyS', 's');
      await hit('KeyS', 's');
      await hit('KeyS', 's');
      if ((await scene()) !== 'play') talkProblems.push(`after Nell's last page the scene is ${await scene()}`);

      await talkTo('gran', 'Élodie');
      await sleep(1500);
      await shoot('w9-name-accent');
      const gran = await evaluate('VL.app.dialogue.pages[0].join(" ")');
      if (!gran.includes('Élodie')) talkProblems.push(`Gran said ${JSON.stringify(gran)}`);
      await hit('Escape');

      const pageCount = await evaluate(`(() => {
        const say = 'Long ago this town had more books than people, {name}. Every house kept a shelf, and every shelf was full. Then, one by one, the books began to vanish. Nobody saw them go. The librarian still opens the doors every morning, hoping.';
        VL.app.setScene('dialogue', { speaker: 'Storyteller', pages: VL.dialoguePages(say, VL.app.game) });
        return VL.app.dialogue.pages.length;
      })()`);
      if (!(pageCount >= 2)) talkProblems.push(`the long line made ${pageCount} pages`);
      await sleep(4000);
      await shoot('w9-paged-1');
      await hit('KeyS', 's');
      await sleep(4000);
      await shoot('w9-paged-2');
      if ((await evaluate('VL.app.dialogue.page')) !== 1) talkProblems.push('S did not turn to page 2');
      await hit('Escape');

      await evaluate("VL.app.game.inventory = { ...(VL.app.game.inventory || {}), shells: 1, wood: 6, berries: 2, paper: 0 }; VL.app.setScene('shop', VL.SCENES.shop.smokeData())");
      await hit('Enter');
      const note = await evaluate('VL.app.shopView.note && VL.app.shopView.note.text');
      if (note !== 'Not enough shells!') talkProblems.push(`Enter on paper with 1 shell said ${JSON.stringify(note)}`);
      await shoot('w9-shop');
      await hit('ArrowDown');
      await hit('Enter');
      if ((await evaluate('VL.app.shopView.mode')) !== 'ask') talkProblems.push('Enter on "Sell a berry" did not ask');
      await shoot('w9-shop-ask');
      await hit('Escape');
      await hit('Escape');
      if ((await scene()) !== 'play') talkProblems.push(`Esc twice in the shop left scene ${await scene()}`);

      talkProblems.push(...errors);
      if (talkProblems.length) failures += 1;
      console.log(`${talkProblems.length ? 'FAIL' : 'ok  '} npcs and dialogue: name "Zoë", Nell, Gran to Élodie, ${pageCount} pages, shop, ${path.join(outDir, 'w9-*.png')}`);
      for (const problem of talkProblems) console.log(`     ${problem}`);
    }

    // W7 chickens with real keys: S lifts the coop chicken and S throws it, F
    // flies a short hop over the river, a long flight over the last highland
    // chasm crosses the screen edge mid-air, a flight from the pier splashes
    // down, and Space on a chicken five times brings the swarm, saved as
    // w7-*.png. A block of its own, so its names never clash.
    {
      errors.length = 0;
      const henProblems = [];
      const codes = { KeyS: [83, 's'], KeyF: [70, 'f'], Space: [32, ' '] };
      const tap = async (code) => {
        const [vkCode, keyName] = codes[code];
        const event = { key: keyName, code, windowsVirtualKeyCode: vkCode, nativeVirtualKeyCode: vkCode };
        await call('Input.dispatchKeyEvent', { type: 'keyDown', ...event });
        await call('Input.dispatchKeyEvent', { type: 'keyUp', ...event });
      };
      const snap = async (name) => {
        const box = JSON.parse(await evaluate('JSON.stringify(document.getElementById("game").getBoundingClientRect())'));
        const png = await call('Page.captureScreenshot', { format: 'png', clip: { x: box.x, y: box.y, width: box.width, height: box.height, scale: 1 } });
        fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(png.data, 'base64'));
      };
      const peek = async (expression) => JSON.parse(await evaluate(`JSON.stringify((() => { const g = VL.app.game; return ${expression}; })())`));
      // A new game in play at `where` (no popups), with this screen's first
      // chicken standing just in front of the hero.
      const henGame = (where, setup = '') => evaluate(`(() => {
        VL.app.startGame(VL.newGame({ name: 'Robin' }), null);
        const g = VL.app.game;
        g.popups.seen.controls = true;
        ${setup}
        g.popups.queue.length = 0;
        VL.app.setScene('play');
        VL.place(g, ${JSON.stringify(where)});
        document.getElementById('game').focus();
      })()`);
      const henInFront = () => evaluate(`(() => {
        const g = VL.app.game;
        const hen = g.room.entities.find((e) => e.type === 'chicken');
        const [dx, dy] = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[g.player.facing];
        const px = g.player.x + dx * 12;
        const py = g.player.y + dy * 16;
        Object.assign(hen, { px, py, x: VL.tileOf(px, py).tx, y: VL.tileOf(px, py).ty, mode: 'idle', idle: 3 });
      })()`);
      const flown = async (ms) => {
        await sleep(ms);
        return peek('[Boolean(g.player.flight), g.player.screen, VL.heroTile(g).tx, VL.heroTile(g).ty]');
      };

      await henGame({ area: 'overworld', screen: '2,1', tx: 4, ty: 4, facing: 'up' });
      await henInFront();
      await tap('KeyS');
      await sleep(400);
      await snap('w7-lift');
      if (!(await peek('Boolean(g.player.carrying)'))) henProblems.push('S at the coop chicken did not lift it');
      await evaluate("VL.app.game.player.facing = 'down'");
      await tap('KeyS');
      await sleep(130);
      await snap('w7-throw');
      if (await peek('Boolean(g.player.carrying)')) henProblems.push('S with a chicken overhead did not throw it');

      await henGame({ area: 'overworld', screen: '3,-2', tx: 8, ty: 4, facing: 'right' });
      await henInFront();
      await tap('KeyF');
      await sleep(350);
      await snap('w7-flight-short');
      const short = await flown(1200);
      if (short.join() !== 'false,3,-2,11,4') henProblems.push(`the short flight over the river ended at ${short}`);

      await henGame({ area: 'overworld', screen: '-2,-4', tx: 12, ty: 4, facing: 'right' }, 'g.flags.chickenAlmanacRead = true;');
      await henInFront();
      await tap('KeyF');
      await sleep(820);
      await snap('w7-flight-long-edge');
      const long = await flown(1800);
      if (long.join() !== 'false,-1,-4,1,4') henProblems.push(`the long flight over the chasm ended at ${long}`);

      await henGame({ area: 'overworld', screen: '2,1', tx: 8, ty: 9, facing: 'left' });
      await henInFront();
      await tap('KeyF');
      let dipped = false;
      for (let i = 0; i < 30 && !dipped; i += 1) {
        await sleep(50);
        dipped = await peek("g.player.flight ? g.player.flight.phase === 'dip' : false");
      }
      await sleep(120);
      await snap('w7-splash');
      const splash = await flown(2500);
      if (!dipped || splash.join() !== 'false,2,1,8,9') henProblems.push(`the flight off the pier: dipped ${dipped}, ended at ${splash}`);

      await henGame({ area: 'overworld', screen: '2,1', tx: 4, ty: 4, facing: 'up' }, "VL.giveItem(g, 'woodSword');");
      const hp = await peek('g.hp');
      for (let i = 0; i < 5; i += 1) {
        await henInFront();
        await tap('Space');
        await sleep(420);
      }
      await sleep(900);
      await snap('w7-swarm');
      const swarm = await peek("[g.room.entities.filter((e) => e.type === 'chickenSwarm').length, g.hp]");
      if (!(swarm[0] > 0) || swarm[1] !== hp) henProblems.push(`after five hits: ${swarm[0]} swarming, hearts ${swarm[1]} of ${hp}`);

      henProblems.push(...errors);
      if (henProblems.length) failures += 1;
      console.log(`${henProblems.length ? 'FAIL' : 'ok  '} chickens: lift, throw, short flight, long flight over a screen edge, splash, swarm, ${path.join(outDir, 'w7-*.png')}`);
      for (const problem of henProblems) console.log(`     ${problem}`);
    }

    await cdp.send('Browser.close').catch(() => {});
    cdp.close();
  } finally {
    clearTimeout(watchdog);
    // Wait for Chrome to exit before deleting its profile, or it writes into the gap.
    const exited = new Promise((resolve) => browser.once('exit', resolve));
    browser.kill();
    await Promise.race([exited, sleep(5000)]);
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  console.log(failures ? `smoke failed (${failures})` : 'smoke passed');
  process.exitCode = failures ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
