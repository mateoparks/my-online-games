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
const timeoutMs = 240000;

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
    // --disable-audio-output gives WebAudio a fake output device whose clock always
    // runs: a real device that has stopped rendering (seen after the Mac slept)
    // freezes currentTime while the context still says 'running'.
    '--headless=new', '--mute-audio', '--disable-audio-output', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${profile}`, '--remote-debugging-port=0', '--hide-scrollbars', 'about:blank',
  ], { stdio: 'ignore' });
  process.on('exit', () => browser.kill());
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => process.exit(130));
  // A stalled Chrome must fail the build, not hang it. Only awake time counts:
  // a tick that arrives far too late means the machine slept, not that Chrome stalled.
  let activeMs = 0;
  let lastTick = Date.now();
  const watchdog = setInterval(() => {
    const now = Date.now();
    const gap = now - lastTick;
    lastTick = now;
    if (gap > 5000) {
      console.log(`     (the clock jumped ${Math.round(gap / 1000)} s, the machine probably slept; not counted against the ${timeoutMs / 1000} s limit)`);
      return;
    }
    activeMs += gap;
    if (activeMs < timeoutMs) return;
    console.log(`FAIL smoke timed out after ${timeoutMs / 1000} s of awake time`);
    process.exit(1);
  }, 1000);
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
    // Holds an arrow until `done` (an expression over g) is true. A loaded machine
    // draws fewer frames, so a fixed hold walks short; the bound keeps a broken
    // walk a failed check, not a hang.
    const holdArrowUntil = async (dir, done, maxMs = 3000) => {
      const check = `(() => { const g = VL.app.game; return Boolean(${done}); })()`;
      await key('keyDown', `Arrow${dir}`);
      for (let held = 0; held < maxMs && !(await evaluate(check)); held += 50) await sleep(50);
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
      // The menus just played menuSelect; wait until the audio clock is past every effect's repeat gap.
      const gapsPassed = `(() => { const now = VL.SOUND.clock();
        return now !== null && Object.values(VL.SOUND.EFFECTS).every((e) => now - e.last >= e.gap); })()`;
      const clockFrom = await evaluate('VL.SOUND.clock()');
      let waited = 0;
      while (!(await evaluate(gapsPassed)) && waited < 3000) {
        await sleep(50);
        waited += 50;
      }
      const clockTo = await evaluate('VL.SOUND.clock()');
      if (waited >= 3000) soundProblems.push(`the audio clock went from ${clockFrom} s to ${clockTo} s in 3 s; WebAudio is not rendering`);
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
      await sleep(450);
      await expect('play', 'S at the chest (holding the sword and shield up)');
      await shot('w28-hold-up');
      const holding = JSON.parse(await evaluate('JSON.stringify([VL.app.game.player.holding, VL.app.game.holdUp && VL.app.game.holdUp.sprites])'));
      if (!holding[0] || String(holding[1]) !== 'item-sword-wood,item-shield-wood') loopProblems.push(`the chest hold-up: ${JSON.stringify(holding)}`);
      await sleep(900);
      await expect('popup', 'the hold-up after the chest');
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
      await sleep(1400);
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

    // W10, the town economy with real keys: walking into each building
    // (w10-<building>.png), S across the mill counter and a 5 wood → 1 shell
    // trade, forging a metal sword at the smithy, and digging up the buried
    // book and a shell on the beach, saved as w10-*.png. A block of its own,
    // so its names never clash with another check's.
    {
      errors.length = 0;
      const econProblems = [];
      const codes = { KeyS: [83, 's'], Enter: [13, 'Enter'], Escape: [27, 'Escape'], Space: [32, ' '], ArrowDown: [40, 'ArrowDown'], ArrowUp: [38, 'ArrowUp'] };
      const send = (type, code) => {
        const [vk, keyName] = codes[code];
        return call('Input.dispatchKeyEvent', { type, key: keyName, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
      };
      const hit = async (code) => {
        await send('keyDown', code);
        await send('keyUp', code);
        if (!(await settle())) econProblems.push(`animation frames stopped after ${code}`);
      };
      const shoot = async (name) => {
        const rect = JSON.parse(await evaluate('JSON.stringify(document.getElementById("game").getBoundingClientRect())'));
        const { data } = await call('Page.captureScreenshot', { format: 'png', clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 1 } });
        fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
      };
      const read = async (expression) => JSON.parse(await evaluate(`JSON.stringify((() => { const g = VL.app.game; return ${expression}; })())`));
      // A new game in play at `where`, with `stuff` in the purse and `gear` in hand, popups read.
      const stage = (where, stuff = {}, gear = []) => evaluate(`(() => {
        VL.app.startGame(VL.newGame({ name: 'Robin' }), null);
        const g = VL.app.game;
        for (const id of ${JSON.stringify(gear)}) VL.giveItem(g, id);
        for (const [kind, n] of Object.entries(${JSON.stringify(stuff)})) VL.addResource(g, kind, n);
        g.popups.queue.length = 0;
        g.popups.seen.controls = true;
        g.popups.seen.digKey = true; // W29's block shows the dig key popup
        VL.app.setScene('play');
        VL.place(g, ${JSON.stringify(where)});
        g.room.entities = g.room.entities.filter((e) => !VL.isEnemy(e));
        document.getElementById('game').focus();
      })()`);
      const scene = () => evaluate('VL.app.sceneId');
      // S at the counter, then S through the keeper's words until the shop opens.
      const talkToKeeper = async (building) => {
        const at = await read(`VL.BUILDINGS.${building}.talkAt`);
        await stage({ area: building, screen: '0,0', tx: at.tx, ty: at.ty, facing: 'up' }, building === 'paperMill' ? { wood: 7 } : { ore: 1, shells: 12 });
        await hit('KeyS');
        if ((await scene()) !== 'dialogue') econProblems.push(`S at the ${building} counter gave scene ${await scene()}`);
        for (let i = 0; i < 12 && (await scene()) === 'dialogue'; i += 1) {
          await sleep(120);
          await hit('KeyS');
        }
        if ((await scene()) !== 'shop') econProblems.push(`talking at the ${building} counter did not open its shop`);
      };

      for (const building of ['shop', 'paperMill', 'blacksmith', 'bindery']) {
        const outside = await read(`VL.BUILDINGS.${building}.outside`);
        await stage({ area: 'overworld', screen: outside.screen, tx: outside.tx, ty: outside.ty + 1, facing: 'up' });
        await holdArrowUntil('Up', `g.player.area === '${building}'`);
        await sleep(300);
        const area = await read('g.player.area');
        if (area !== building) econProblems.push(`walking up into the ${building} door reached ${area}`);
        await shoot(`w10-${building}`);
      }

      await talkToKeeper('paperMill');
      await shoot('w10-mill-shop');
      await hit('Enter');
      if ((await evaluate('VL.app.shopView.mode')) !== 'ask') econProblems.push('Enter on the mill trade did not ask');
      await shoot('w10-trade-ask');
      await hit('Enter');
      await sleep(100);
      await shoot('w10-trade-done');
      const traded = await read('[g.inventory.wood, g.inventory.shells]');
      if (traded[0] !== 2 || traded[1] !== 1) econProblems.push(`the mill trade left wood and shells at ${traded}`);

      await talkToKeeper('blacksmith');
      for (let i = 0; i < 3; i += 1) await hit('ArrowDown');
      await hit('Enter');
      await shoot('w10-forge-ask');
      await hit('Enter');
      await sleep(100);
      await shoot('w10-forge');
      const forged = await read("[VL.hasItem(g, 'metalSword'), g.inventory.ore, g.inventory.shells]");
      if (!forged[0] || forged[1] !== 0 || forged[2] !== 2) econProblems.push(`forging the metal sword gave ${forged}`);
      await hit('Escape');
      await sleep(300);
      if ((await scene()) !== 'popup') econProblems.push(`leaving the smithy showed ${await scene()}, not the sword's popup`);
      await shoot('w10-forge-popup');

      const buried = await read('VL.SPOTS.bookBeachBuried');
      await stage({ area: buried.area, screen: buried.screen, tx: buried.x - 1, ty: buried.y, facing: 'right' }, {}, ['woodShovel']);
      await send('keyDown', 'Space');
      await sleep(120);
      await shoot('w10-dig');
      await send('keyUp', 'Space');
      await sleep(400);
      if (!(await read("VL.spotFound(g, 'bookBeachBuried')"))) econProblems.push('Space with the shovel did not dig up the buried book');
      await shoot('w10-dig-book');
      await hit('KeyS');
      // The dig under the popup finishes once play resumes.
      await sleep(400);
      // The next sand dig is seeded to turn up a whole shell.
      await evaluate(`(() => {
        const g = VL.app.game;
        for (let seed = 1; ; seed += 1) if (VL.random({ rngState: seed }) < VL.TUNING.digChance) { g.rngState = seed; break; }
        g.player.facing = 'down';
      })()`);
      await hit('Space');
      await sleep(350);
      await shoot('w10-dig-shell');
      const shell = await read("g.room.entities.some((e) => e.type === 'drop' && e.kind === 'shell')");
      if (!shell) econProblems.push('the seeded dig turned up no shell');

      econProblems.push(...errors);
      if (econProblems.length) failures += 1;
      console.log(`${econProblems.length ? 'FAIL' : 'ok  '} economy: 4 buildings, mill trade, forging, digging, ${path.join(outDir, 'w10-*.png')}`);
      for (const problem of econProblems) console.log(`     ${problem}`);
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
      // Each swing must land before the next: wait for the hit to count (or the swarm to start), the swing to
      // end and the struck hen to land (henInFront moves it but a hen still in its hop can't be hit).
      for (let i = 0; i < 5; i += 1) {
        await henInFront();
        const before = await peek('g.room.chickens ? g.room.chickens.hits : 0');
        await tap('Space');
        for (let w = 0; w < 2000; w += 50) {
          if (await peek(`!g.player.swing && g.room.entities.every((e) => e.type !== 'chicken' || e.mode !== 'hop')
            && Boolean(g.room.chickens && (g.room.chickens.swarm || g.room.chickens.hits > ${before}))`)) break;
          await sleep(50);
        }
      }
      for (let w = 0; w < 2000 && !(await peek("g.room.entities.some((e) => e.type === 'chickenSwarm')")); w += 50) await sleep(50);
      await sleep(600);
      await snap('w7-swarm');
      const swarm = await peek("[g.room.entities.filter((e) => e.type === 'chickenSwarm').length, g.hp]");
      if (!(swarm[0] > 0) || swarm[1] !== hp) henProblems.push(`after five hits: ${swarm[0]} swarming, hearts ${swarm[1]} of ${hp}`);

      henProblems.push(...errors);
      if (henProblems.length) failures += 1;
      console.log(`${henProblems.length ? 'FAIL' : 'ok  '} chickens: lift, throw, short flight, long flight over a screen edge, splash, swarm, ${path.join(outDir, 'w7-*.png')}`);
      for (const problem of henProblems) console.log(`     ${problem}`);
    }

    // W11, the library and its people with real keys: the library full and
    // emptied, S at the desk through a reading and a reward, S at the stage
    // for a puppet show, and Henrietta carried home to Pip, saved as
    // w11-*.png. A block of its own, so its names never clash.
    {
      errors.length = 0;
      const libProblems = [];
      const codes = { KeyS: [83, 's'] };
      const tapS = async () => {
        const [vk, keyName] = codes.KeyS;
        const event = { key: keyName, code: 'KeyS', windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
        await call('Input.dispatchKeyEvent', { type: 'keyDown', ...event });
        await call('Input.dispatchKeyEvent', { type: 'keyUp', ...event });
        if (!(await settle())) libProblems.push('animation frames stopped after S');
      };
      const picture = async (name) => {
        const box = JSON.parse(await evaluate('JSON.stringify(document.getElementById("game").getBoundingClientRect())'));
        const png = await call('Page.captureScreenshot', { format: 'png', clip: { x: box.x, y: box.y, width: box.width, height: box.height, scale: 1 } });
        fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(png.data, 'base64'));
      };
      const look = async (expression) => JSON.parse(await evaluate(`JSON.stringify((() => { const g = VL.app.game; return ${expression}; })())`));
      // A new game in play at `where`, after `setup` (code with g in scope).
      const libGame = (where, setup = '') => evaluate(`(() => {
        VL.app.startGame(VL.newGame({ name: 'Robin' }), null);
        const g = VL.app.game;
        g.popups.seen.controls = true;
        g.flags['met:fenwick'] = true;
        g.flags['met:wife'] = true;
        ${setup}
        g.popups.queue.length = 0;
        VL.app.setScene('play');
        VL.place(g, ${JSON.stringify(where)});
        document.getElementById('game').focus();
      })()`);
      const desk = await look('VL.LIBRARY_TALK_AT');
      const atDesk = { area: 'library', screen: '0,0', tx: desk.tx, ty: desk.ty, facing: 'up' };
      const returnAll = (ids) => `for (const id of ${JSON.stringify(ids)}) VL.markFound(g, id); VL.returnBooks(g); for (let id = VL.nextReading(g); id; id = VL.nextReading(g)) VL.finishReading(g, id);`;
      const shelfIds = await look('Object.keys(VL.BOOKS)');
      // S until the scene is `scene` (or the press budget runs out).
      const sTo = async (scene, presses = 20) => {
        for (let i = 0; i < presses && (await evaluate('VL.app.sceneId')) !== scene; i += 1) {
          await sleep(160);
          await tapS();
        }
        return (await evaluate('VL.app.sceneId')) === scene;
      };

      await libGame(atDesk, returnAll(shelfIds));
      await sleep(300);
      await picture('w11-library-full');
      const full = await look("g.room.entities.filter((e) => e.type === 'libraryShelf').reduce((n, s) => n + s.books.filter((b) => !b.gone).length, 0)");
      if (full !== shelfIds.length) libProblems.push(`the full library shows ${full} of ${shelfIds.length} books`);
      await libGame(atDesk, `${returnAll(shelfIds)} g.library.gone.push(...g.library.returned.filter((id, i) => i % 3 !== 2));`);
      await sleep(300);
      await picture('w11-library-emptied');

      // Two books gone since the last visit: he says so first (W28).
      await libGame(atDesk, `${returnAll(shelfIds.slice(0, 4))} g.library.gone.push(g.library.returned[0], g.library.returned[1]);`);
      await tapS();
      await sleep(2200);
      await picture('w28-librarian-remark');
      const remarked = await look("[VL.app.sceneId, g.library.noticed]");
      if (remarked[0] !== 'dialogue') libProblems.push(`S at the desk after two books vanished gave scene ${remarked[0]}`);
      await sTo('play');
      if ((await look('g.library.noticed')) !== 2) libProblems.push('the vanished books were not noticed');

      // Nine books on the shelves and the Almanac makes ten: the heart (W30's 10/20/30).
      await libGame(atDesk, `${returnAll(['bookRiverside', 'bookCliffRoad', 'bookWoods', 'bookEastRoad', 'bookLighthouse', 'bookMeadowRock', 'bookLakeShore', 'bookScriptoriumRock', 'bookBeachBuried'])} VL.markFound(g, 'bookChickenAlmanac');`);
      const heldUp = async (name) => {
        for (let i = 0; i < 40 && !(await look('Boolean(g.holdUp) && VL.app.sceneId === "play"')); i += 1) {
          if ((await evaluate('VL.app.sceneId')) !== 'play') await tapS();
          await sleep(60);
        }
        await sleep(250);
        await picture(name);
        return look('g.holdUp && g.holdUp.sprites');
      };
      await tapS();
      if ((await evaluate('VL.app.sceneId')) !== 'dialogue') libProblems.push(`S at the desk gave scene ${await evaluate('VL.app.sceneId')}`);
      if (!(await sTo('reading'))) libProblems.push('handing in the Almanac never reached its reading');
      await sleep(1800);
      await picture('w11-reading');
      if (!(await sTo('popup'))) libProblems.push('the reading did not end in its popup');
      await sleep(300);
      await picture('w11-reading-popup');
      if (!(await look('g.flags.chickenAlmanacRead'))) libProblems.push('the Almanac reading did not switch the long flight on');
      if (!(await sTo('dialogue'))) libProblems.push('ten books did not bring the reward talk');
      await sleep(1600);
      await picture('w11-reward');
      const rewardHeld = await heldUp('w28-reward-hold-up');
      if (String(rewardHeld) !== 'pickup-heart-container') libProblems.push(`the ten-book reward was held up as ${rewardHeld}`);
      if (!(await sTo('popup'))) libProblems.push('the reward talk did not end in its popup');
      await sleep(300);
      await picture('w11-reward-popup');
      if (!(await look("VL.rewardGiven(g, 'heartLibrary') && g.maxHp === VL.TUNING.startMaxHp + VL.TUNING.heartContainerHp"))) libProblems.push('ten books did not give the heart container');

      // The stage-3 show also needs Dungeons 1 and 2 beaten; this new game has beaten neither, so their locks stand in for the show.
      await evaluate("VL.smokeBossLocks = ['d1Boss', 'd2Boss'].map((id) => [id, VL.LOCKS[id].reached]); VL.LOCKS.d1Boss.reached = VL.LOCKS.d2Boss.reached = () => true;");
      await libGame({ area: 'overworld', screen: '2,0', tx: 4, ty: 3, facing: 'up' }, `g.library.returned = ${JSON.stringify(shelfIds.slice(0, 12))};`);
      await sleep(300);
      await picture('w11-square');
      await tapS();
      if ((await evaluate('VL.app.sceneId')) !== 'puppetShow') libProblems.push(`S at the stage gave scene ${await evaluate('VL.app.sceneId')}`);
      for (let i = 0; i < 6; i += 1) {
        await sleep(150);
        await tapS();
      }
      await sleep(900);
      await picture('w11-puppet-show');
      const show = await look('VL.app.puppetShow && [VL.app.puppetShow.show.title, VL.app.puppetShow.beat]');
      if (!show || show[0] !== 'Nosy Ned and the Very Big Dragon') libProblems.push(`the stage-3 show was ${JSON.stringify(show)}`);
      await evaluate('for (const [id, reached] of VL.smokeBossLocks) VL.LOCKS[id].reached = reached; delete VL.smokeBossLocks;');

      const hen = await look('VL.SPOTS.lostChicken');
      const pip = await look("VL.getScreen('overworld', '2,1').entities.find((e) => e.id === 'chickenKid')");
      await libGame({ area: 'overworld', screen: hen.screen, tx: hen.x, ty: hen.y }, '');
      await evaluate("VL.liftChicken(VL.app.game, VL.app.game.room.entities.find((e) => e.type === 'chicken' && e.lost))");
      await evaluate(`(() => {
        const g = VL.app.game;
        VL.place(g, { area: 'overworld', screen: '2,1', tx: ${pip.x}, ty: ${pip.y + 1}, facing: 'up' });
        const kid = g.room.entities.find((e) => e.id === 'chickenKid');
        Object.assign(kid, { x: ${pip.x}, y: ${pip.y}, walk: null, idle: 99 });
      })()`);
      await tapS();
      await sleep(1600);
      await picture('w11-kid');
      if ((await evaluate('VL.app.sceneId')) !== 'dialogue') libProblems.push(`S at Pip holding Henrietta gave scene ${await evaluate('VL.app.sceneId')}`);
      if (!(await sTo('popup'))) libProblems.push('Pip\'s thanks did not end in the page popup');
      await sleep(300);
      await picture('w11-kid-page');
      if (!(await look("VL.spotFound(g, 'pageLostChicken') && !VL.chickenWithHero(g, 'lostChicken')"))) libProblems.push('Pip did not take Henrietta and give the page');

      libProblems.push(...errors);
      if (libProblems.length) failures += 1;
      console.log(`${libProblems.length ? 'FAIL' : 'ok  '} library: full and emptied shelves, a reading, a reward, a puppet show, Pip's page, ${path.join(outDir, 'w11-*.png')}`);
      for (const problem of libProblems) console.log(`     ${problem}`);
    }

    // W12, paper and ink with real keys: Space grinding a berry with the
    // mortar, S copying a mural, M with no map, M asking, the map inking in
    // and drawn with the Herbalist's marks, and a new screen on it after,
    // saved as w12-*.png. A block of its own, so its names never clash.
    {
      errors.length = 0;
      const inkProblems = [];
      const codes = { KeyS: [83, 's'], KeyM: [77, 'm'], Space: [32, ' '] };
      const tapKey = async (code) => {
        const [vk, keyName] = codes[code];
        const event = { key: keyName, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
        await call('Input.dispatchKeyEvent', { type: 'keyDown', ...event });
        await call('Input.dispatchKeyEvent', { type: 'keyUp', ...event });
        if (!(await settle())) inkProblems.push(`animation frames stopped after ${code}`);
      };
      const picture = async (name) => {
        const box = JSON.parse(await evaluate('JSON.stringify(document.getElementById("game").getBoundingClientRect())'));
        const png = await call('Page.captureScreenshot', { format: 'png', clip: { x: box.x, y: box.y, width: box.width, height: box.height, scale: 1 } });
        fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(png.data, 'base64'));
      };
      const look = async (expression) => JSON.parse(await evaluate(`JSON.stringify((() => { const g = VL.app.game; return ${expression}; })())`));
      const inkGame = (where, setup = '') => evaluate(`(() => {
        VL.app.startGame(VL.newGame({ name: 'Robin' }), null);
        const g = VL.app.game;
        g.popups.seen.controls = true;
        ${setup}
        g.popups.queue.length = 0;
        VL.app.setScene('play');
        VL.place(g, ${JSON.stringify(where)});
        document.getElementById('game').focus();
      })()`);
      const field = { area: 'overworld', screen: '1,1', tx: 4, ty: 6, facing: 'up' };

      await inkGame(field, "VL.giveItem(g, 'mortarPestle'); VL.addResource(g, 'berries', 3);");
      await tapKey('Space');
      await sleep(150);
      await picture('w12-mortar');
      const ground = await look('[g.inventory.berries, g.inventory.ink]');
      if (ground.join() !== '2,1') inkProblems.push(`Space with the mortar left berries and ink at ${ground}`);

      await inkGame(field, "VL.addResource(g, 'paper', 1); VL.addResource(g, 'ink', 1);");
      await evaluate("VL.app.game.room.entities.push({ type: 'copyable', copy: 'woodsMapCopy', look: 'mural', x: 4, y: 5 }, { type: 'copyable', copy: 'woodsMapCopy', look: 'tablet', x: 6, y: 5 })");
      await sleep(200);
      await picture('w12-mural');
      await tapKey('KeyS');
      await sleep(400);
      await picture('w12-copy');
      if (!(await look("VL.hasItem(g, 'woodsMapCopy') && g.inventory.paper === 0 && g.inventory.ink === 0"))) inkProblems.push('S at the mural with paper and ink made no copy');
      await evaluate("VL.app.setScene('copyView', { id: 'woodsMapCopy' })");
      await sleep(300);
      await picture('w12-copy-view');

      const explored = ['1,1', '1,0', '0,0', '0,1', '2,1', '2,0', '3,0', '2,-1', '3,-1', '2,-2', '3,-2', '1,-1', '0,-1', '-1,-1', '-1,0', '-1,1', '2,-3'];
      const visits = `for (const key of ${JSON.stringify(explored)}) g.visited['overworld:' + key] = true;`;
      const books = "g.library.returned.push('bookPrimer', 'bookHerbalist'); g.library.read.push('bookPrimer', 'bookHerbalist'); g.popups.seen.mapReady = true;";
      await inkGame({ area: 'overworld', screen: '2,0', tx: 6, ty: 6 }, visits);
      await tapKey('KeyM');
      await sleep(400);
      await picture('w12-map-none');
      if ((await evaluate('VL.app.sceneId')) !== 'popup') inkProblems.push('M with no map and no Primer did not say why');
      await inkGame({ area: 'overworld', screen: '2,0', tx: 6, ty: 6 }, `${visits} ${books} VL.addResource(g, 'paper', 1); VL.addResource(g, 'ink', 1);`);
      await tapKey('KeyM');
      await sleep(300);
      await picture('w12-map-ask');
      if ((await look('VL.app.worldMapView && VL.app.worldMapView.mode')) !== 'ask') inkProblems.push('M with the Primer, paper and ink did not ask to draw');
      await tapKey('KeyS');
      await sleep(450);
      await picture('w12-map-drawing');
      await sleep(1400);
      await picture('w12-map');
      const drawn = await look("[VL.app.sceneId, VL.app.worldMapView.mode, VL.hasItem(g, 'worldMap'), VL.mapView(g).screens.length, VL.mapView(g).marks.length]");
      if (drawn.slice(0, 4).join() !== `worldMap,view,true,${explored.length}` || !(drawn[4] > 0)) inkProblems.push(`the drawn map: ${drawn}`);
      await tapKey('KeyM');
      await evaluate("(() => { const g = VL.app.game; g.popups.queue.length = 0; VL.app.setScene('play'); VL.place(g, { area: 'overworld', screen: '4,0', tx: 3, ty: 6 }); })()");
      await sleep(200);
      await tapKey('KeyM');
      await sleep(400);
      await picture('w12-map-explored');
      if (!(await look("VL.mapView(g).screens.includes('4,0')"))) inkProblems.push('a screen explored after drawing is not on the map');
      await tapKey('KeyM');
      const everything = "for (const key of Object.keys(VL.AREAS.overworld.screens)) g.visited['overworld:' + key] = true;"
        + " g.library.returned.push('bookPrimer', 'bookHerbalist', 'bookSmithsLedger'); g.library.read.push('bookPrimer', 'bookHerbalist', 'bookSmithsLedger');"
        + " g.popups.seen.mapReady = true; VL.giveItem(g, 'worldMap'); g.popups.queue.length = 0;";
      await inkGame({ area: 'overworld', screen: '1,1', tx: 8, ty: 6 }, everything);
      await tapKey('KeyM');
      await sleep(400);
      await picture('w12-map-full');
      const full = await look("[VL.app.sceneId, VL.mapView(g).labels.length, VL.mapView(g).marks.length]");
      if (full[0] !== 'worldMap' || !(full[1] >= 8) || !(full[2] > 0)) inkProblems.push(`the full map: ${full}`);

      inkProblems.push(...errors);
      if (inkProblems.length) failures += 1;
      console.log(`${inkProblems.length ? 'FAIL' : 'ok  '} paper and ink: mortar, a copied mural, M before and after drawing, the drawn map with marks, ${path.join(outDir, 'w12-*.png')}`);
      for (const problem of inkProblems) console.log(`     ${problem}`);
    }

    // W13, the dungeon framework on the sample dungeon (tests/sample-dungeon.js,
    // loaded into the page here, never by the game) with real keys: a room
    // with its statue and enemy, the locked door's note, the block pushed
    // onto its plate and the shutter lifting, the keys HUD, the map screen on M, and the
    // boss room, saved as w13-*.png. A block of its own, so its names never clash.
    {
      errors.length = 0;
      const dungeonProblems = [];
      const codes = { ArrowUp: [38, 'ArrowUp'], ArrowRight: [39, 'ArrowRight'], KeyM: [77, 'm'] };
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
      await evaluate(fs.readFileSync(path.join(__dirname, 'tests', 'sample-dungeon.js'), 'utf8'));
      if (!(await evaluate("Boolean(VL.DUNGEONS.sample)"))) dungeonProblems.push('the sample dungeon did not load into the page');
      // A new game in play at `where`, no popups waiting.
      const dungeonGame = (where, setup = '') => evaluate(`(() => {
        VL.app.startGame(VL.newGame({ name: 'Robin' }), null);
        const g = VL.app.game;
        g.popups.seen.controls = true;
        g.popups.seen.dungeonMap = true;
        ${setup}
        g.popups.queue.length = 0;
        VL.app.setScene('play');
        VL.place(g, ${JSON.stringify(where)});
        document.getElementById('game').focus();
      })()`);

      await dungeonGame({ area: 'sample', screen: '0,0', tx: 8, ty: 7, facing: 'up' });
      await sleep(300);
      await snap('w13-room');
      const room = await peek("[g.room.entities.some((e) => e.type === 'slime'), g.room.entities.find((e) => e.type === 'shutter').solid, g.room.entities.some((e) => e.type === 'saveStatue')]");
      if (room.join() !== 'true,true,true') dungeonProblems.push(`the entrance hall: slime, barred shutter, statue = ${room}`);

      await dungeonGame({ area: 'sample', screen: '0,0', tx: 7, ty: 2, facing: 'up' }, "g.room.entities = g.room.entities.filter((e) => !VL.isEnemy(e));");
      await holdArrowUntil('Up', 'g.dungeonNote');
      await sleep(100);
      await snap('w13-locked-door');
      const locked = await peek("[g.room.entities.find((e) => e.type === 'lockedDoor').open, g.dungeonNote && g.dungeonNote.text, VL.heroTile(g).ty]");
      if (locked.join() !== 'false,Locked. A small key would open it.,1') dungeonProblems.push(`walking into the locked door without a key: ${locked}`);

      await dungeonGame({ area: 'sample', screen: '1,0', tx: 10, ty: 8, facing: 'right' });
      await holdArrowUntil('Right', 'g.dungeons.sample.plates.samplePlate === true');
      await sleep(250);
      await snap('w13-block-puzzle');
      const pushed = await peek("[g.room.entities.find((e) => e.type === 'pushBlock').x, g.dungeons.sample.plates.samplePlate === true, g.room.entities.find((e) => e.type === 'shutter').closed]");
      if (pushed.join() !== '12,true,false') dungeonProblems.push(`the block onto the plate: block x, plate latched, shutter closed = ${pushed}`);

      await dungeonGame({ area: 'sample', screen: '0,-1', tx: 8, ty: 8, facing: 'up' }, "g.dungeons.sample.map = true; g.dungeons.sample.keysGiven = 2; g.dungeons.sample.bossKey = true; g.visited['sample:0,0'] = true; g.visited['sample:1,0'] = true;");
      await sleep(250);
      await snap('w13-hud-keys');
      await tap('KeyM');
      await sleep(250);
      await snap('w13-map');
      if ((await evaluate('VL.app.sceneId')) !== 'dungeonMap') dungeonProblems.push(`M in a dungeon opened ${await evaluate('VL.app.sceneId')}, expected dungeonMap`);
      await tap('KeyM');
      await sleep(100);
      if ((await evaluate('VL.app.sceneId')) !== 'play') dungeonProblems.push('M again did not close the map');

      await dungeonGame({ area: 'sample', screen: '0,-2', tx: 7, ty: 8, facing: 'up' });
      await sleep(300);
      await snap('w13-boss-room');
      const bossRoom = await peek("[g.room.entities.some((e) => e.type === 'sampleGolem' && e.boss), g.room.entities.find((e) => e.type === 'shutter').solid]");
      if (bossRoom.join() !== 'true,true') dungeonProblems.push(`the boss room: boss marked, way back barred = ${bossRoom}`);

      dungeonProblems.push(...errors);
      if (dungeonProblems.length) failures += 1;
      console.log(`${dungeonProblems.length ? 'FAIL' : 'ok  '} dungeon: room, locked door, block puzzle, map, boss room, ${path.join(outDir, 'w13-*.png')}`);
      for (const problem of dungeonProblems) console.log(`     ${problem}`);
    }

    // W14, the Old Scriptorium and the Lifting Gloves with real keys: every
    // room, the locked door outside, the gloves from the big chest and their
    // popup, a pot lifted and thrown over the pits onto the switch, a book
    // under a rock, a canyon boulder lifted for good, and the Bookworm: up,
    // hit by a thrown pot, beaten, and its rewards. Saved as w14-*.png.
    {
      errors.length = 0;
      const scrProblems = [];
      const codes = { KeyS: [83, 's'], ArrowUp: [38, 'ArrowUp'], ArrowRight: [39, 'ArrowRight'] };
      const tapKey = async (code) => {
        const [vk, keyName] = codes[code];
        const event = { key: keyName, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
        await call('Input.dispatchKeyEvent', { type: 'keyDown', ...event });
        await call('Input.dispatchKeyEvent', { type: 'keyUp', ...event });
        if (!(await settle())) scrProblems.push(`animation frames stopped after ${code}`);
      };
      const shot = async (name) => {
        const box = JSON.parse(await evaluate('JSON.stringify(document.getElementById("game").getBoundingClientRect())'));
        const png = await call('Page.captureScreenshot', { format: 'png', clip: { x: box.x, y: box.y, width: box.width, height: box.height, scale: 1 } });
        fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(png.data, 'base64'));
      };
      const see = async (expression) => JSON.parse(await evaluate(`JSON.stringify((() => { const g = VL.app.game; return ${expression}; })())`));
      const waitFor = async (expression, ms) => {
        for (let waited = 0; waited < ms; waited += 50) {
          if (await see(`Boolean(${expression})`)) return true;
          await sleep(50);
        }
        return false;
      };
      // A new game in play at `where` with the gloves (unless `setup` says otherwise).
      const scrGame = (where, setup = 'g.items.liftingGloves = true;') => evaluate(`(() => {
        VL.app.startGame(VL.newGame({ name: 'Robin' }), null);
        const g = VL.app.game;
        for (const id of ['controls', 'dungeonMap', 'firstBook']) g.popups.seen[id] = true;
        ${setup}
        g.popups.queue.length = 0;
        VL.app.setScene('play');
        VL.place(g, ${JSON.stringify(where)});
        document.getElementById('game').focus();
      })()`);
      const scr = (screen, tx, ty, facing = 'up') => ({ area: 'scriptorium', screen, tx, ty, facing });

      for (const screen of ['1,0', '0,0', '1,-1', '2,-1', '2,0', '3,0', '1,-2']) {
        await scrGame(scr(screen, 7, 7), "g.items.liftingGloves = true; g.dungeons.scriptorium.doors.d1BossDoor = true;");
        await sleep(250);
        await shot(`w14-room-${screen.replace(',', '_')}`);
      }

      await scrGame({ area: 'overworld', screen: '2,-2', tx: 8, ty: 4, facing: 'up' }, '');
      await holdArrowUntil('Up', "VL.app.sceneId === 'popup'");
      await sleep(150);
      await shot('w14-door-locked');
      const locked = await see("[g.player.area, VL.app.sceneId, Boolean(g.message && /locked/.test(g.message.text))]");
      if (locked.join() !== 'overworld,popup,true') scrProblems.push(`walking into the Scriptorium door without the key: ${locked}`);

      await scrGame(scr('2,-1', 7, 5), '');
      await tapKey('KeyS');
      await sleep(1250);
      await shot('w14-gloves-popup');
      const gloves = await see("[VL.hasItem(g, 'liftingGloves'), VL.app.sceneId, VL.currentPopup(g) && VL.currentPopup(g).title]");
      if (gloves.join() !== 'true,popup,You got the Lifting Gloves!') scrProblems.push(`the big chest: gloves, scene, popup = ${gloves}`);

      await scrGame(scr('2,0', 6, 2, 'left'));
      await tapKey('KeyS');
      await sleep(250);
      await shot('w14-lift');
      if (!(await see("Boolean(g.player.lifted && g.player.lifted.kind === 'pot')"))) scrProblems.push('S beside a pot with the gloves did not lift it');
      await evaluate(`VL.place(VL.app.game, ${JSON.stringify(scr('2,0', 7, 2, 'right'))})`);
      await tapKey('KeyS');
      await sleep(120);
      await shot('w14-throw');
      if (!(await waitFor('g.dungeons.scriptorium.switches.d1SwitchPit', 1500))) scrProblems.push('a pot thrown over the pits did not throw the switch');
      await sleep(300);
      await shot('w14-switch');

      const rock = await see("(() => { const s = VL.SPOTS.bookScriptoriumRock; return { screen: s.screen, x: s.x, y: s.y }; })()");
      await scrGame({ area: 'overworld', screen: rock.screen, tx: rock.x + 1, ty: rock.y, facing: 'left' });
      await tapKey('KeyS');
      await sleep(250);
      await shot('w14-rock-book');
      if (!(await see("g.room.entities.some((e) => e.type === 'rockBook' && e.uncovered)"))) scrProblems.push('lifting the rock did not uncover the book');

      await scrGame({ area: 'overworld', screen: '4,0', tx: 4, ty: 5, facing: 'right' });
      await tapKey('KeyS');
      await sleep(250);
      await shot('w14-boulder');
      if (!(await see("VL.savedTile(g, 'overworld', '4,0', 5, 5) === 'P'"))) scrProblems.push('a lifted canyon boulder was not saved');

      // The Bookworm: wait for its head, then turn to it holding a pot and throw.
      await scrGame(scr('1,-2', 7, 7), "g.items.liftingGloves = true; g.dungeons.scriptorium.doors.d1BossDoor = true;");
      const throwAtWorm = async () => {
        if (!(await waitFor("g.room.entities.some((e) => e.type === 'bookworm' && e.mode === 'up')", 6000))) return false;
        await evaluate(`(() => {
          const g = VL.app.game;
          const w = g.room.entities.find((e) => e.type === 'bookworm');
          const hole = VL.tileOf(w.at.x, w.at.y);
          const hero = VL.heroTile(g);
          g.player.facing = hole.tx === hero.tx ? (hole.ty < hero.ty ? 'up' : 'down') : hole.tx < hero.tx ? 'left' : 'right';
          g.player.lifted = { kind: 'pot', since: -1, t: 1 };
        })()`);
        return true;
      };
      if (!(await throwAtWorm())) scrProblems.push('the Bookworm never rose');
      await shot('w14-boss');
      await tapKey('KeyS');
      if (!(await waitFor("g.room.entities.some((e) => e.type === 'bookworm' && e.hits === 1)", 1500))) scrProblems.push('a pot thrown at the Bookworm did not hit it');
      await sleep(100);
      await shot('w14-boss-hit');
      await evaluate("VL.app.game.room.entities.find((e) => e.type === 'bookworm').hits = VL.TUNING.bookwormHits - 1");
      await throwAtWorm();
      await tapKey('KeyS');
      if (!(await waitFor("VL.bossBeaten(g, 'scriptorium')", 4000))) scrProblems.push('the Bookworm was not beaten');
      await sleep(300);
      await shot('w14-reward-popup');
      const reward = await see("[VL.hasItem(g, 'mortarPestle'), VL.BOOKWORM_BUNDLE.every((id) => VL.booksCarried(g).includes(id)), g.room.entities.some((e) => e.type === 'heartContainer'), g.room.entities.some((e) => e.type === 'warp')]");
      // The warp waits for the heart (W30's boss gate).
      if (reward.join() !== 'true,true,true,false') scrProblems.push(`the Bookworm's rewards (mortar, books, heart, no warp yet) = ${reward}`);
      for (let i = 0; i < 6 && (await evaluate('VL.app.sceneId')) === 'popup'; i += 1) {
        await sleep(450);
        await tapKey('KeyS');
      }
      await sleep(200);
      await shot('w14-reward');

      scrProblems.push(...errors);
      if (scrProblems.length) failures += 1;
      console.log(`${scrProblems.length ? 'FAIL' : 'ok  '} scriptorium: 7 rooms, the locked door, the gloves, lift and throw, a rock book, a boulder, the Bookworm and its rewards, ${path.join(outDir, 'w14-*.png')}`);
      for (const problem of scrProblems) console.log(`     ${problem}`);
    }

    // W15, the Whispering Woods and the Hollow Oak with real keys: a step
    // deeper into the Woods without the copied map turning back, the same
    // step with it (its popup, a blazed tree), the copy's "you are here",
    // every room, the rope from the big chest, the hook out and the pull
    // over the vault's pits, key B dragged off its island, and the
    // Thornback: up, flipped by the hook, hit and beaten. Saved as w15-*.png.
    {
      errors.length = 0;
      const oakProblems = [];
      const codes = { KeyS: [83, 's'], KeyD: [68, 'd'], Space: [32, ' '], ArrowUp: [38, 'ArrowUp'] };
      const tapKey = async (code) => {
        const [vk, keyName] = codes[code];
        const event = { key: keyName, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
        await call('Input.dispatchKeyEvent', { type: 'keyDown', ...event });
        await call('Input.dispatchKeyEvent', { type: 'keyUp', ...event });
        if (!(await settle())) oakProblems.push(`animation frames stopped after ${code}`);
      };
      const shot = async (name) => {
        const box = JSON.parse(await evaluate('JSON.stringify(document.getElementById("game").getBoundingClientRect())'));
        const png = await call('Page.captureScreenshot', { format: 'png', clip: { x: box.x, y: box.y, width: box.width, height: box.height, scale: 1 } });
        fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(png.data, 'base64'));
      };
      const see = async (expression) => JSON.parse(await evaluate(`JSON.stringify((() => { const g = VL.app.game; return ${expression}; })())`));
      const waitFor = async (expression, ms) => {
        for (let waited = 0; waited < ms; waited += 50) {
          if (await see(`Boolean(${expression})`)) return true;
          await sleep(50);
        }
        return false;
      };
      // A new game in play at `where`, with the rope in the off hand and
      // the sword in the main one, unless `setup` says otherwise.
      const ROPE = "g.items.woodSword = true; g.items.grapplingRope = true; g.hands = { mainHand: 'woodSword', offHand: 'grapplingRope' };";
      const oakGame = (where, setup = ROPE) => evaluate(`(() => {
        VL.app.startGame(VL.newGame({ name: 'Robin' }), null);
        const g = VL.app.game;
        for (const id of ['controls', 'dungeonMap', 'woodsWithMap']) g.popups.seen[id] = true;
        ${setup}
        g.popups.queue.length = 0;
        VL.app.setScene('play');
        VL.place(g, ${JSON.stringify(where)});
        document.getElementById('game').focus();
      })()`);
      const oak = (screen, tx, ty, facing = 'up') => ({ area: 'hollowOak', screen, tx, ty, facing });
      const ow = (screen, tx, ty, facing = 'up') => ({ area: 'overworld', screen, tx, ty, facing });

      await oakGame(ow('5,-1', 3, 1), '');
      await holdArrowUntil('Up', "VL.app.sceneId === 'popup'");
      await sleep(200);
      await shot('w15-woods-lost');
      const lost = await see("[g.player.screen, VL.heroTile(g).ty, VL.currentPopup(g) && VL.currentPopup(g).id]");
      if (lost.join() !== '5,-1,9,woodsLost') oakProblems.push(`a step deeper without the map: screen, row, popup = ${lost}`);

      await oakGame(ow('5,-1', 3, 1), "g.items.woodsMapCopy = true; g.popups.seen.woodsWithMap = false;");
      await holdArrowUntil('Up', "VL.app.sceneId === 'popup'");
      await sleep(200);
      await shot('w15-woods-map');
      const through = await see("[g.player.screen, VL.currentPopup(g) && VL.currentPopup(g).id]");
      if (through.join() !== '5,-2,woodsWithMap') oakProblems.push(`a step deeper with the map: screen, popup = ${through}`);
      await sleep(400);
      await tapKey('KeyS');
      await evaluate(`VL.place(VL.app.game, ${JSON.stringify(ow('5,-1', 3, 2))})`);
      await sleep(250);
      await shot('w15-woods-blaze');
      if (!(await see("g.room.entities.some((e) => e.type === 'woodsBlaze')"))) oakProblems.push('no blazed tree on the Woods edge with the map');
      await evaluate(`(() => { VL.place(VL.app.game, ${JSON.stringify(ow('6,-2', 7, 5))}); VL.app.setScene('copyView', { id: 'woodsMapCopy' }); })()`);
      await sleep(400);
      await shot('w15-woods-copy');
      if ((await see('VL.woodsMapHere(g)')) !== '6,-2') oakProblems.push('the copy does not know where the hero stands');

      for (const screen of ['0,0', '0,-1', '-1,-1', '-1,-2', '0,-2', '1,-2', '1,-1', '1,0', '0,-3']) {
        await oakGame(oak(screen, 7, screen === '0,-3' ? 8 : 5), `${ROPE} g.dungeons.hollowOak.doors.d2BossDoor = true;`);
        await sleep(250);
        await shot(`w15-room-${screen.replace(',', '_')}`);
      }

      await oakGame(oak('1,-2', 7, 4), '');
      await tapKey('KeyS');
      await sleep(1250);
      await shot('w15-rope-popup');
      const got = await see("[VL.hasItem(g, 'grapplingRope'), VL.app.sceneId, VL.currentPopup(g) && VL.currentPopup(g).title]");
      if (got.join() !== 'true,popup,You got the Grappling Rope!') oakProblems.push(`the big chest: rope, scene, popup = ${got}`);

      await oakGame(oak('1,-2', 7, 5, 'down'));
      await tapKey('KeyD');
      await sleep(40);
      await shot('w15-rope-throw');
      if (!(await waitFor("g.player.rope && g.player.rope.phase === 'pull'", 1000))) oakProblems.push('the hook did not catch the post across the vault\'s pits');
      await sleep(80);
      await shot('w15-rope-pull');
      if (!(await waitFor("!g.player.rope && VL.heroTile(g).ty === 8", 1500))) oakProblems.push(`the rope did not pull the hero over the pits: ${JSON.stringify(await see('VL.heroTile(g)'))}`);

      await oakGame(oak('1,-1', 9, 2, 'down'));
      await tapKey('KeyD');
      if (!(await waitFor("VL.spotFound(g, 'd2KeyB')", 1500))) oakProblems.push('the hook did not drag key B off its island');
      await sleep(100);
      await shot('w15-rope-fetch');

      // The Thornback: line up below it and hook it, then finish it with the sword.
      await oakGame(oak('0,-3', 7, 8), `${ROPE} g.dungeons.hollowOak.doors.d2BossDoor = true;`);
      await sleep(700);
      await shot('w15-boss');
      await evaluate(`(() => {
        const g = VL.app.game;
        const b = g.room.entities.find((e) => e.type === 'thornback');
        b.arriving = 0;
        b.calm = 0;
        Object.assign(g.player, VL.tileCenter(VL.tileOf(b.cx, b.cy).tx, 8), { facing: 'up', invuln: 5 });
      })()`);
      await tapKey('KeyD');
      if (!(await waitFor("g.room.entities.some((e) => e.type === 'thornback' && e.mode === 'flipped')", 1500))) oakProblems.push('the hook did not flip the Thornback');
      await sleep(150);
      await shot('w15-boss-flipped');
      await evaluate(`(() => {
        const g = VL.app.game;
        const b = g.room.entities.find((e) => e.type === 'thornback');
        Object.assign(b, { rounds: 1, life: 1 });
        const t = VL.tileOf(b.cx, b.cy);
        Object.assign(g.player, VL.tileCenter(t.tx, t.ty + 1), { facing: 'up', invuln: 5 });
      })()`);
      await tapKey('Space');
      if (!(await waitFor("VL.bossBeaten(g, 'hollowOak')", 4000))) oakProblems.push('the Thornback was not beaten by the sword on its back');
      await sleep(300);
      await shot('w15-boss-beaten');
      const reward = await see("[g.room.entities.some((e) => e.type === 'heartContainer' && e.id === 'heartD2'), g.room.entities.some((e) => e.type === 'warp')]");
      // The warp waits for the heart (W30's boss gate).
      if (reward.join() !== 'true,false') oakProblems.push(`the Thornback's heart, and no warp yet = ${reward}`);

      oakProblems.push(...errors);
      if (oakProblems.length) failures += 1;
      console.log(`${oakProblems.length ? 'FAIL' : 'ok  '} hollow oak: the Woods with and without the map, 9 rooms, the rope (chest, pull, fetch), the Thornback flipped and beaten, ${path.join(outDir, 'w15-*.png')}`);
      for (const problem of oakProblems) console.log(`     ${problem}`);
    }

    // W16, the shockwave with real keys: the Thornback beaten and its heart
    // taken, the ground shaking, the white flash, the story on black, waking
    // at home holding up the Glowstone and its popup, then Gran Ottie's talk
    // and her wood held up. Saved as w16-*.png.
    {
      errors.length = 0;
      const shockProblems = [];
      const tapS = async () => {
        const event = { key: 's', code: 'KeyS', windowsVirtualKeyCode: 83, nativeVirtualKeyCode: 83 };
        await call('Input.dispatchKeyEvent', { type: 'keyDown', ...event });
        await call('Input.dispatchKeyEvent', { type: 'keyUp', ...event });
        if (!(await settle())) shockProblems.push('animation frames stopped after S');
      };
      const shot = async (name) => {
        const box = JSON.parse(await evaluate('JSON.stringify(document.getElementById("game").getBoundingClientRect())'));
        const png = await call('Page.captureScreenshot', { format: 'png', clip: { x: box.x, y: box.y, width: box.width, height: box.height, scale: 1 } });
        fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(png.data, 'base64'));
      };
      const see = async (expression) => JSON.parse(await evaluate(`JSON.stringify((() => { const g = VL.app.game; return ${expression}; })())`));
      const waitFor = async (expression, ms) => {
        for (let waited = 0; waited < ms; waited += 50) {
          if (await see(`Boolean(${expression})`)) return true;
          await sleep(50);
        }
        return false;
      };

      await evaluate(`(() => {
        VL.app.startGame(VL.newGame({ name: 'Robin' }), null);
        const g = VL.app.game;
        for (const id of ['controls', 'dungeonMap']) g.popups.seen[id] = true;
        for (const id of ['woodSword', 'woodShield', 'grapplingRope', 'liftingGloves', 'mortarPestle', 'woodsMapCopy']) g.items[id] = true;
        g.hands = { mainHand: 'woodSword', offHand: 'woodShield' };
        Object.assign(g.inventory, { wood: 3, shells: 6, paper: 1, berries: 2 });
        g.dungeons.hollowOak.boss = true;
        g.dungeons.hollowOak.doors.d2BossDoor = true;
        g.flags['found:heartD2'] = true;
        g.maxHp = 10;
        g.hp = 10;
        VL.app.setScene('play');
        VL.place(g, { area: 'hollowOak', screen: '0,-3', tx: 7, ty: 5, facing: 'down' });
        document.getElementById('game').focus();
      })()`);
      if (!(await waitFor("VL.app.sceneId === 'shockwave'", 4000))) shockProblems.push(`the shockwave did not start after the Thornback: scene ${await see('VL.app.sceneId')}`);
      await sleep(1200);
      await shot('w16-rumble');
      if (!(await waitFor("VL.app.shockwave.phase === 'flash'", 2000))) shockProblems.push('no flash');
      await sleep(150);
      await shot('w16-flash');
      const lost = await see("[g.flags.shockwave, VL.hasItem(g, 'woodSword'), g.inventory.shells, g.inventory.brokenShells, VL.hasItem(g, 'glowstone')]");
      if (lost.join() !== 'true,false,0,6,true') shockProblems.push(`at the flash: shockwave, sword, shells, broken, glowstone = ${lost}`);
      if (!(await waitFor("VL.app.shockwave.phase === 'dark'", 2000))) shockProblems.push('no story on black');
      await sleep(2500);
      await shot('w16-story');
      for (let i = 0; i < 6 && (await see("VL.app.sceneId === 'shockwave' && VL.app.shockwave.phase === 'dark'")); i += 1) {
        await tapS();
        await sleep(300);
      }
      await sleep(500);
      await shot('w16-waking');
      if (!(await waitFor("VL.app.sceneId === 'play' && g.holdUp", 3000))) shockProblems.push(`he did not wake holding something up: scene ${await see('VL.app.sceneId')}`);
      await sleep(300);
      await shot('w16-glowstone');
      if ((await see("g.holdUp && g.holdUp.sprites.join()")) !== 'item-glowstone') shockProblems.push('he is not holding up the Glowstone');
      if (!(await waitFor("VL.app.sceneId === 'popup'", 2000))) shockProblems.push('no Glowstone popup');
      // The popup takes S only once it has been up 0.3 s (scenes/popup.js).
      await waitFor('VL.app.popupView && VL.app.popupView.t >= 0.35', 2000);
      await shot('w16-glowstone-popup');
      await tapS();
      if (!(await waitFor("VL.app.sceneId === 'dialogue'", 2000))) shockProblems.push(`Gran did not start talking: scene ${await see('VL.app.sceneId')}`);
      await sleep(1500);
      await shot('w16-helper');
      const where = await see("[g.player.area, g.room.entities.some((e) => e.type === 'npc' && e.id === 'gran'), VL.app.dialogue && VL.app.dialogue.speaker]");
      if (where.join() !== 'hut,true,Gran Ottie') shockProblems.push(`waking: area, Gran there, speaker = ${where}`);
      for (let i = 0; i < 30 && (await see("VL.app.sceneId === 'dialogue'")); i += 1) {
        await tapS();
        await sleep(120);
      }
      if (!(await waitFor('g.holdUp', 1000))) shockProblems.push('the wood was not held up');
      await sleep(300);
      await shot('w16-helper-wood');
      if (!(await waitFor("VL.app.sceneId === 'popup'", 2000))) shockProblems.push('no popup for the wood');
      await sleep(200);
      await shot('w16-helper-wood-popup');
      const gift = await see("[g.inventory.wood, g.flags['gave:helperWood']]");
      if (gift.join() !== '2,true') shockProblems.push(`Gran's gift: wood, flag = ${gift}`);

      shockProblems.push(...errors);
      if (shockProblems.length) failures += 1;
      console.log(`${shockProblems.length ? 'FAIL' : 'ok  '} shockwave: the ground shakes, the flash and the losses, the story, waking with the Glowstone, Gran's wood, ${path.join(outDir, 'w16-*.png')}`);
      for (const problem of shockProblems) console.log(`     ${problem}`);
    }
    // W29, Matthew's second playtest notes, with real keys: the driftwood at
    // the hut beach's east end, the first shovel's dig-key popup and X digging
    // with the sword and shield in hand, a wood sword clinking off a thorny
    // spitter, the dirt path the copied map opens, and the Woods berry bush.
    // Saved as w29-*.png. A block of its own, so its names never clash.
    {
      errors.length = 0;
      const notesProblems = [];
      const codes = { KeyS: [83, 's'], KeyX: [88, 'x'], Space: [32, ' '] };
      const hit = async (code) => {
        const [vk, keyName] = codes[code];
        await call('Input.dispatchKeyEvent', { type: 'keyDown', key: keyName, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
        await call('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
        if (!(await settle())) notesProblems.push(`animation frames stopped after ${code}`);
      };
      const shoot = async (name) => {
        const rect = JSON.parse(await evaluate('JSON.stringify(document.getElementById("game").getBoundingClientRect())'));
        const { data } = await call('Page.captureScreenshot', { format: 'png', clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 1 } });
        fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
      };
      const read = async (expression) => JSON.parse(await evaluate(`JSON.stringify((() => { const g = VL.app.game; return ${expression}; })())`));
      const waitFor = async (expression, ms = 2000) => {
        for (let waited = 0; waited < ms; waited += 50) {
          if (await read(`Boolean(${expression})`)) return true;
          await sleep(50);
        }
        return false;
      };
      const stage = (where, setup = '') => evaluate(`(() => {
        VL.app.startGame(VL.newGame({ name: 'Robin' }), null);
        const g = VL.app.game;
        g.popups.seen.controls = true;
        for (const id of ['woodSword', 'woodShield']) VL.giveItem(g, id);
        g.popups.queue.length = 0;
        ${setup}
        VL.app.setScene('play');
        VL.place(g, ${JSON.stringify(where)});
        g.room.entities = g.room.entities.filter((e) => !VL.isEnemy(e) || ${JSON.stringify(where.screen)} === '7,-2');
        document.getElementById('game').focus();
      })()`);

      await stage({ area: 'overworld', screen: '1,1', tx: 13, ty: 7, facing: 'right' });
      await settle();
      await shoot('w29-driftwood');
      if ((await read("VL.tileAt('overworld', '1,1', 15, 8, g.room)")) !== 'j') notesProblems.push('no driftwood at the hut beach\'s east end');

      await stage({ area: 'overworld', screen: '1,1', tx: 5, ty: 7, facing: 'down' }, "VL.giveItem(g, 'woodShovel');");
      if (!(await waitFor("VL.app.sceneId === 'popup'"))) notesProblems.push('the first shovel did not explain the dig key');
      // The shovel's popup, then the dig key's: S through both, each once it is ready for a press.
      for (let i = 0; i < 6 && (await read('VL.app.sceneId')) === 'popup'; i += 1) {
        const id = await read('VL.currentPopup(g)?.id');
        await waitFor("VL.app.sceneId !== 'popup' || VL.app.popupView.t >= 0.3");
        if (id === 'digKey') await shoot('w29-dig-key-popup');
        await hit('KeyS');
        await waitFor(`VL.app.sceneId !== 'popup' || VL.currentPopup(g)?.id !== '${id}'`);
      }
      await waitFor("VL.app.sceneId === 'play'");
      await hit('KeyX');
      await waitFor("VL.tileAt('overworld', '1,1', 5, 8, g.room) === '@'");
      await shoot('w29-dig-x');
      const dug = await read("[VL.tileAt('overworld', '1,1', 5, 8, g.room), g.hands.mainHand, g.hands.offHand]");
      if (dug.join() !== '@,woodSword,woodShield') notesProblems.push(`X digging = ${dug}`);

      await stage({ area: 'overworld', screen: '7,-2', tx: 4, ty: 6, facing: 'down' }, 'g.items.woodsMapCopy = true; g.popups.seen.woodsWithMap = true;');
      await sleep(800);
      const hp = await read("g.room.entities.find((e) => e.type === 'spitter' && e.x === 4).hp");
      await hit('Space');
      await sleep(60);
      await shoot('w29-tough-spitter');
      await waitFor('!g.player.swing');
      if ((await read("g.room.entities.find((e) => e.type === 'spitter' && e.x === 4)?.hp")) !== hp) notesProblems.push('a wood sword hurt a tough spitter');

      await stage({ area: 'overworld', screen: '7,-1', tx: 7, ty: 4, facing: 'up' }, 'g.items.woodsMapCopy = true; g.popups.seen.woodsWithMap = true;');
      await settle();
      await shoot('w29-woods-path');
      if ((await read("VL.tileAt('overworld', '7,-1', 7, 2, g.room)")) !== 'P') notesProblems.push('the copied map did not open the path before the Oak');

      notesProblems.push(...errors);
      if (notesProblems.length) failures += 1;
      console.log(`${notesProblems.length ? 'FAIL' : 'ok  '} playtest notes 2: driftwood, the dig key, a tough spitter, the Woods path, ${path.join(outDir, 'w29-*.png')}`);
      for (const problem of notesProblems) console.log(`     ${problem}`);
    }
    // W30, Matthew's third playtest notes, with real keys: the word a wood
    // sword gets from a thorny spitter, the Hollow Oak's moss room and the key
    // the metal shovel digs out of its grass (X), and the boss gate: shut
    // behind the hero while the Thornback lives, still shut with its heart on
    // the floor, open with the warp once the heart is taken. Saved as w30-*.png.
    {
      errors.length = 0;
      const w30Problems = [];
      const codes = { KeyS: [83, 's'], KeyX: [88, 'x'], Space: [32, ' '], ArrowUp: [38, 'ArrowUp'] };
      const keyEvent = (type, code) => {
        const [vk, keyName] = codes[code];
        return call('Input.dispatchKeyEvent', { type, key: keyName, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
      };
      const hit = async (code) => {
        await keyEvent('keyDown', code);
        await keyEvent('keyUp', code);
        if (!(await settle())) w30Problems.push(`animation frames stopped after ${code}`);
      };
      const shoot = async (name) => {
        const rect = JSON.parse(await evaluate('JSON.stringify(document.getElementById("game").getBoundingClientRect())'));
        const { data } = await call('Page.captureScreenshot', { format: 'png', clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 1 } });
        fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
      };
      const read = async (expression) => JSON.parse(await evaluate(`JSON.stringify((() => { const g = VL.app.game; return ${expression}; })())`));
      const waitFor = async (expression, ms = 2000) => {
        for (let waited = 0; waited < ms; waited += 50) {
          if (await read(`Boolean(${expression})`)) return true;
          await sleep(50);
        }
        return false;
      };
      const stage = (where, setup = '', keepEnemies = false) => evaluate(`(() => {
        VL.app.startGame(VL.newGame({ name: 'Robin' }), null);
        const g = VL.app.game;
        g.popups.seen.controls = true;
        g.popups.seen.digKey = true;
        for (const id of ['woodSword', 'woodShield']) VL.giveItem(g, id);
        g.popups.queue.length = 0;
        ${setup}
        VL.app.setScene('play');
        VL.place(g, ${JSON.stringify(where)});
        if (!${keepEnemies}) g.room.entities = g.room.entities.filter((e) => !VL.isEnemy(e));
        document.getElementById('game').focus();
      })()`);

      await stage({ area: 'overworld', screen: '7,-2', tx: 4, ty: 6, facing: 'down' }, 'g.items.woodsMapCopy = true; g.popups.seen.woodsWithMap = true;', true);
      await sleep(800);
      await hit('Space');
      if (!(await waitFor("VL.app.sceneId === 'popup' && VL.app.popupView.t >= 0.3"))) w30Problems.push('no word when the wood sword clinked off a thorny spitter');
      await shoot('w30-wood-sword-message');
      const word = await read('VL.currentPopup(g)?.text');
      if (!/wood sword seems to do nothing/.test(word || '')) w30Problems.push(`the wood sword's word = ${word}`);
      await hit('KeyS');

      await stage({ area: 'hollowOak', screen: '-1,0', tx: 8, ty: 5, facing: 'right' }, "VL.giveItem(g, 'metalShovel'); g.popups.queue.length = 0;");
      await settle();
      await shoot('w30-grass-room');
      await hit('KeyX');
      if (!(await waitFor("g.room.entities.some((e) => e.id === 'd2KeyMoss' && !e.hidden)"))) w30Problems.push('the metal shovel did not dig up the moss room\'s key');
      await waitFor('!g.player.dig');
      await shoot('w30-grass-key');

      const den = "g.dungeons.hollowOak.doors.d2BossDoor = true; g.flags.shockwaveDue = true; g.flags.shockwave = true; g.flags.shockwaveWoke = true; g.items.grapplingRope = true;";
      await stage({ area: 'hollowOak', screen: '0,-3', tx: 7, ty: 10, facing: 'up' }, den, true);
      await keyEvent('keyDown', 'ArrowUp');
      await waitFor('VL.heroTile(g).ty <= 8');
      await keyEvent('keyUp', 'ArrowUp');
      if (!(await waitFor("g.room.entities.some((e) => e.bossGate && e.solid)"))) w30Problems.push('the boss gate did not shut behind him');
      await shoot('w30-boss-gate-closed');
      await evaluate(`(() => { const g = VL.app.game; g.room.entities = g.room.entities.filter((e) => e.type !== 'thornback'); VL.bossDefeated(g, 'hollowOak'); })()`);
      await waitFor("g.room.entities.some((e) => e.type === 'heartContainer')");
      await settle();
      await shoot('w30-boss-gate-heart');
      const shut = await read("[g.room.entities.some((e) => e.bossGate && e.closed), g.room.entities.some((e) => e.type === 'warp')]");
      if (shut.join() !== 'true,false') w30Problems.push(`with the heart on the floor: gate shut, warp = ${shut}`);
      await evaluate(`(() => { const g = VL.app.game; const h = g.room.entities.find((e) => e.type === 'heartContainer'); VL.ENTITIES.heartContainer.onStand(g, h); })()`);
      await waitFor('!g.holdUp', 3000);
      for (let i = 0; i < 4 && (await read('VL.app.sceneId')) === 'popup'; i += 1) {
        await waitFor("VL.app.sceneId !== 'popup' || VL.app.popupView.t >= 0.3");
        await hit('KeyS');
      }
      if (!(await waitFor("g.room.entities.some((e) => e.type === 'warp') && g.room.entities.some((e) => e.bossGate && !e.closed)"))) w30Problems.push('the heart taken did not open the gate and bring the warp');
      await settle();
      await shoot('w30-boss-gate-open');

      w30Problems.push(...errors);
      if (w30Problems.length) failures += 1;
      console.log(`${w30Problems.length ? 'FAIL' : 'ok  '} playtest notes 3: the wood sword's word, the moss room's key, the boss gate, ${path.join(outDir, 'w30-*.png')}`);
      for (const problem of w30Problems) console.log(`     ${problem}`);
    }


    // W18, the Lighthouse with real keys: the door shut without the
    // Glowstone, every room, a dark floor unlit and then lit by its lamps (S),
    // the Slingshot from the big chest, a shot at a target across the pits
    // (D) and the bars going up, the cistern's beam before and after its
    // mirrors are turned (S, then a shot), and the Lens Crab: up, both eyes
    // shot shut (dazed), struck and beaten. Saved as w18-*.png.
    {
      errors.length = 0;
      const lhProblems = [];
      const codes = { KeyS: [83, 's'], KeyD: [68, 'd'], Space: [32, ' '] };
      const tapKey = async (code) => {
        const [vk, keyName] = codes[code];
        const event = { key: keyName, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
        await call('Input.dispatchKeyEvent', { type: 'keyDown', ...event });
        await call('Input.dispatchKeyEvent', { type: 'keyUp', ...event });
        if (!(await settle())) lhProblems.push(`animation frames stopped after ${code}`);
      };
      const shot = async (name) => {
        const box = JSON.parse(await evaluate('JSON.stringify(document.getElementById("game").getBoundingClientRect())'));
        const png = await call('Page.captureScreenshot', { format: 'png', clip: { x: box.x, y: box.y, width: box.width, height: box.height, scale: 1 } });
        fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(png.data, 'base64'));
      };
      const see = async (expression) => JSON.parse(await evaluate(`JSON.stringify((() => { const g = VL.app.game; return ${expression}; })())`));
      const waitFor = async (expression, ms) => {
        for (let waited = 0; waited < ms; waited += 50) {
          if (await see(`Boolean(${expression})`)) return true;
          await sleep(50);
        }
        return false;
      };
      // A new game in play at `where`: the Glowstone worn, the sword in the
      // main hand and the slingshot in the off hand, unless `setup` says otherwise.
      const ARMED = "g.items.glowstone = true; g.items.woodSword = true; g.items.slingshot = true; g.hands = { mainHand: 'woodSword', offHand: 'slingshot' }; g.inventory.brokenShells = 15;";
      const lhGame = (where, setup = ARMED) => evaluate(`(() => {
        VL.app.startGame(VL.newGame({ name: 'Robin' }), null);
        const g = VL.app.game;
        for (const id of ['controls', 'dungeonMap']) g.popups.seen[id] = true;
        ${setup}
        g.popups.queue.length = 0;
        VL.app.setScene('play');
        VL.place(g, ${JSON.stringify(where)});
        g.room.entities = g.room.entities.filter((e) => !VL.isEnemy(e) || e.type === 'lensCrab');
        document.getElementById('game').focus();
      })()`);
      const lh = (screen, tx, ty, facing = 'up') => ({ area: 'lighthouse', screen, tx, ty, facing });

      await lhGame({ area: 'overworld', screen: '-1,1', tx: 7, ty: 5, facing: 'up' }, '');
      await holdArrowUntil('Up', "VL.app.sceneId === 'popup'", 1500);
      await sleep(250);
      await shot('w18-door-dark');
      if ((await see("[g.player.area, VL.currentPopup(g) && VL.currentPopup(g).text]")).join() !== `overworld,${await see('VL.LIGHTHOUSE_DARK_WORDS')}`) lhProblems.push('the door let him in without the Glowstone, or said nothing');
      await lhGame({ area: 'overworld', screen: '-1,1', tx: 7, ty: 5, facing: 'up' });
      await holdArrowUntil('Up', "g.player.area === 'lighthouse'", 1500);
      if ((await see('g.player.area')) !== 'lighthouse') lhProblems.push('the Glowstone did not let him in');

      for (const screen of ['0,0', '-1,0', '0,-1', '1,-1', '1,0', '0,-2', '-1,-2', '1,-2', '0,-3']) {
        const where = { '-1,0': lh(screen, 13, 5), '-1,-2': lh(screen, 12, 5), '0,-3': lh(screen, 7, 8) }[screen] || lh(screen, 7, 5);
        await lhGame(where, `${ARMED} g.dungeons.lighthouse.doors.d3BossDoor = true;`);
        await sleep(250);
        await shot(`w18-room-${screen.replace(',', '_')}`);
      }

      // A dark floor: unlit, then both lamps lit with S.
      await lhGame(lh('-1,0', 14, 5, 'down'));
      await sleep(300);
      await shot('w18-dark-unlit');
      if (!(await see('VL.roomIsDark(g)'))) lhProblems.push('the cellar is not dark');
      await tapKey('KeyS');
      await evaluate("VL.place(VL.app.game, { area: 'lighthouse', screen: '-1,0', tx: 2, ty: 2, facing: 'right' })");
      await sleep(100);
      await tapKey('KeyS');
      await sleep(300);
      await shot('w18-dark-lit');
      if (await see('VL.roomIsDark(g)')) lhProblems.push('the cellar\'s lamps did not light it');

      // The Slingshot from the big chest.
      await lhGame(lh('1,-1', 5, 3), "g.items.glowstone = true; g.items.woodSword = true; g.hands = { mainHand: 'woodSword', offHand: null };");
      await tapKey('KeyS');
      await sleep(1250);
      await shot('w18-slingshot-popup');
      const got = await see("[VL.hasItem(g, 'slingshot'), VL.app.sceneId, VL.currentPopup(g) && VL.currentPopup(g).title]");
      if (got.join() !== 'true,popup,You got the Slingshot!') lhProblems.push(`the big chest: slingshot, scene, popup = ${got}`);

      // A shot across the pits at the store's target.
      await lhGame(lh('1,-1', 12, 4));
      await tapKey('KeyD');
      await sleep(60);
      await shot('w18-slingshot');
      if (!(await waitFor("g.dungeons.lighthouse.switches.d3TargetStore", 1500))) lhProblems.push('the shot did not hit the store\'s target');
      await sleep(300);
      await shot('w18-target-hit');
      if (await see("g.room.entities.find((e) => e.id === 'd3ShutterStore').closed")) lhProblems.push('the store\'s bars did not lift');

      // The cistern's beam: as found, then the floor mirror turned (S) and the island one shot (D).
      await lhGame(lh('1,0', 9, 2, 'right'));
      await sleep(300);
      await shot('w18-beam');
      await tapKey('KeyS');
      await evaluate("VL.place(VL.app.game, { area: 'lighthouse', screen: '1,0', tx: 10, ty: 3, facing: 'down' }); VL.app.game.room.entities.find((e) => e.type === 'beamMirror' && e.y === 2).turn = '\\\\';");
      await tapKey('KeyD');
      if (!(await waitFor('g.dungeons.lighthouse.switches.d3CrystalCistern', 1500))) lhProblems.push('the beam did not light the cistern\'s crystal');
      await sleep(400);
      await shot('w18-beam-solved');
      if (await see('VL.roomIsDark(g)')) lhProblems.push('the lit crystal did not light the cistern');

      // The Lens Crab: line up below it, shoot both eyes shut, strike.
      await lhGame(lh('0,-3', 7, 8), `${ARMED} g.dungeons.lighthouse.doors.d3BossDoor = true;`);
      await sleep(900);
      await shot('w18-boss');
      for (let i = 0; i < 2; i += 1) {
        await evaluate(`(() => {
          const g = VL.app.game;
          const c = g.room.entities.find((e) => e.type === 'lensCrab');
          c.arriving = 0;
          Object.assign(g.player, VL.tileCenter(VL.tileOf(c.cx, c.cy).tx, 6), { facing: 'up', invuln: 5, sling: 0 });
        })()`);
        await tapKey('KeyD');
        await waitFor("!g.room.entities.some((e) => e.type === 'slingPellet')", 1000);
      }
      if (!(await waitFor("g.room.entities.some((e) => e.type === 'lensCrab' && e.mode === 'dazed')", 1000))) lhProblems.push('two shots did not daze the Lens Crab');
      await sleep(150);
      await shot('w18-boss-dazed');
      await evaluate(`(() => {
        const g = VL.app.game;
        const c = g.room.entities.find((e) => e.type === 'lensCrab');
        Object.assign(c, { rounds: 1, life: 1 });
        Object.assign(g.player, VL.tileCenter(VL.tileOf(c.cx, c.cy).tx, VL.tileOf(c.cx, c.cy + 30).ty), { facing: 'up', invuln: 5 });
      })()`);
      await tapKey('Space');
      if (!(await waitFor("VL.bossBeaten(g, 'lighthouse')", 4000))) lhProblems.push('the Lens Crab was not beaten by the sword while dazed');
      await sleep(400);
      await shot('w18-boss-beaten');
      // W30's boss gate: shut and no warp until the heart is taken.
      const reward = await see("[g.room.entities.some((e) => e.type === 'heartContainer' && e.id === 'heartD3'), g.room.entities.some((e) => e.bossGate && e.closed), g.room.entities.some((e) => e.type === 'warp'), g.inventory.ore, VL.spotFound(g, 'pageLighthouse')]");
      if (reward.join() !== 'true,true,false,1,true') lhProblems.push(`the Lens Crab's heart, gate shut, warp, ore and page = ${reward}`);
      await evaluate(`(() => { const g = VL.app.game; VL.ENTITIES.heartContainer.onStand(g, g.room.entities.find((e) => e.type === 'heartContainer')); })()`);
      for (let i = 0; i < 6 && !(await see("g.room.entities.some((e) => e.type === 'warp') && g.room.entities.some((e) => e.bossGate && !e.closed)")); i += 1) {
        if ((await evaluate('VL.app.sceneId')) === 'popup') await tapKey('KeyS');
        await sleep(400);
      }
      if (!(await see("g.room.entities.some((e) => e.type === 'warp') && g.room.entities.some((e) => e.bossGate && !e.closed)"))) lhProblems.push('the Lens Crab\'s heart taken did not open the gate and bring the warp');
      // W31: the Lighthouse finished, a faint with its statue as the save point wakes him at the hut's lantern.
      await evaluate("(() => { const g = VL.app.game; g.savePoint = { area: 'lighthouse', screen: '0,0', tx: 3, ty: 2, facing: 'down' }; VL.faint(g, 'crab'); })()");
      await waitFor("VL.app.sceneId === 'fainted'", 1000);
      await sleep(750);
      await tapKey('KeyS');
      if (!(await waitFor("VL.app.sceneId === 'play' && g.player.area === 'hut'", 1500))) lhProblems.push(`a faint after the Lighthouse woke him at ${await see('[g.player.area, g.player.screen, VL.heroTile(g).tx, VL.heroTile(g).ty]')}, not the hut`);
      else {
        await sleep(300);
        await shot('w31-faint-home');
      }
      if ((await see('[VL.heroTile(g).tx, VL.heroTile(g).ty].join()')) !== '2,2') lhProblems.push('not on the hut\'s lantern after the faint');

      lhProblems.push(...errors);
      if (lhProblems.length) failures += 1;
      console.log(`${lhProblems.length ? 'FAIL' : 'ok  '} lighthouse: the dark door, 9 rooms, a dark floor lit by its lamps, the slingshot (chest, target), the beam solved, the Lens Crab dazed and beaten, a faint after it wakes in the hut (W31), ${path.join(outDir, 'w18-*.png')}`);
      for (const problem of lhProblems) console.log(`     ${problem}`);
    }

    // W17, the raft and the water with real keys: Nell's raft yard after the
    // shockwave (her talk, the offer, the question, the raft's popup), pushing
    // off from the lake shore, sailing across a screen edge and landing on the
    // island for its ore, then off the far beach to the wreck, aboard by its
    // stove-in side, down the hatch, every room below, over the bilge on the
    // rope and the page in the cabin. Saved as w17-*.png.
    {
      errors.length = 0;
      const raftProblems = [];
      const codes = { KeyS: [83, 's'], KeyD: [68, 'd'], Escape: [27, 'Escape'] };
      const hit = async (code) => {
        const [vk, keyName] = codes[code];
        await call('Input.dispatchKeyEvent', { type: 'keyDown', key: keyName, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
        await call('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
        if (!(await settle())) raftProblems.push(`animation frames stopped after ${code}`);
      };
      const shoot = async (name) => {
        const rect = JSON.parse(await evaluate('JSON.stringify(document.getElementById("game").getBoundingClientRect())'));
        const { data } = await call('Page.captureScreenshot', { format: 'png', clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 1 } });
        fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
      };
      const read = async (expression) => JSON.parse(await evaluate(`JSON.stringify((() => { const g = VL.app.game; return ${expression}; })())`));
      const waitFor = async (expression, ms = 2000) => {
        for (let waited = 0; waited < ms; waited += 50) {
          if (await read(`Boolean(${expression})`)) return true;
          await sleep(50);
        }
        return false;
      };
      // S through popups and talk pages, each once it takes a press.
      const pressThrough = async (scene) => {
        for (let i = 0; i < 12 && (await read('VL.app.sceneId')) === scene; i += 1) {
          await sleep(450);
          await hit('KeyS');
        }
      };
      // After the shockwave with the rope and four wood; no enemies about.
      const stage = (where, setup = '') => evaluate(`(() => {
        VL.app.startGame(VL.newGame({ name: 'Robin' }), null);
        const g = VL.app.game;
        g.popups.seen.controls = true;
        Object.assign(g.flags, { shockwave: true, shockwaveWoke: true, 'gave:helperWood': true });
        for (const id of ['woodSword', 'grapplingRope', 'glowstone', 'liftingGloves']) g.items[id] = true;
        g.hands = { mainHand: 'woodSword', offHand: 'grapplingRope' };
        g.inventory.wood = 4;
        ${setup}
        VL.app.setScene('play');
        VL.place(g, ${JSON.stringify(where)});
        g.room.entities = g.room.entities.filter((e) => !VL.isEnemy(e));
        document.getElementById('game').focus();
      })()`);

      // Nell's raft yard.
      await stage({ area: 'overworld', screen: '2,1', tx: 9, ty: 5, facing: 'down' });
      await evaluate(`(() => {
        const g = VL.app.game;
        const nell = g.room.entities.find((e) => e.type === 'npc' && e.id === 'nell');
        Object.assign(g.player, VL.tileCenter(nell.x, nell.y + 1), { facing: 'up' });
      })()`);
      await settle();
      await hit('KeyS');
      if (!(await waitFor("VL.app.sceneId === 'dialogue'"))) raftProblems.push('Nell did not talk');
      await sleep(1200);
      await shoot('w17-nell');
      await pressThrough('dialogue');
      if (!(await waitFor("VL.app.sceneId === 'shop' && VL.app.shopView.shop.id === 'raftyard'"))) raftProblems.push(`Nell's raft yard did not open: ${await read('VL.app.sceneId')}`);
      await sleep(300);
      await shoot('w17-raft-shop');
      await hit('KeyS');
      await waitFor("VL.app.shopView.mode === 'ask'");
      await shoot('w17-raft-ask');
      await hit('KeyS');
      if (!(await waitFor("VL.hasItem(g, 'raft')"))) raftProblems.push('the raft was not built');
      await hit('Escape');
      if (!(await waitFor("VL.app.sceneId === 'popup'"))) raftProblems.push(`no raft popup: ${await read('VL.app.sceneId')}`);
      await waitFor('VL.app.popupView && VL.app.popupView.t >= 0.35');
      await shoot('w17-raft-popup');
      const built = await read("[VL.hasItem(g, 'raft'), g.inventory.wood, VL.currentPopup(g)?.id]");
      if (built.join() !== 'true,0,raft') raftProblems.push(`raft, wood, popup = ${built}`);

      // Pushing off from the lake shore, over the screen edge, onto the island.
      await stage({ area: 'overworld', screen: '2,-3', tx: 8, ty: 5, facing: 'right' }, 'g.items.raft = true; g.items.oar = true;');
      await settle();
      await holdArrowUntil('Right', 'g.player.afloat && VL.heroTile(g).tx >= 10');
      await shoot('w17-launch');
      await holdArrowUntil('Right', "g.player.screen === '3,-3' && VL.heroTile(g).tx >= 4", 6000);
      await shoot('w17-sailing');
      await holdArrowUntil('Right', '!g.player.afloat', 3000);
      await shoot('w17-island');
      const landed = await read('[g.player.screen, VL.heroTile(g).tx, VL.heroTile(g).ty, g.player.afloat]');
      if (landed.join() !== '3,-3,6,5,false') raftProblems.push(`landing on the island: screen, tx, ty, afloat = ${landed}`);
      await evaluate("(() => { const g = VL.app.game; Object.assign(g.player, VL.tileCenter(6, 4), { facing: 'right' }); })()");
      await holdArrowUntil('Right', "VL.spotFound(g, 'oreLakeIsland')");
      await waitFor("VL.app.sceneId === 'popup'");
      await sleep(400);
      await shoot('w17-island-ore');
      if (!(await read("VL.spotFound(g, 'oreLakeIsland') && g.inventory.ore === 1"))) raftProblems.push('the island\'s ore was not taken');

      // Off the far beach to the wreck, aboard, and below.
      await stage({ area: 'overworld', screen: '5,1', tx: 2, ty: 9, facing: 'down' }, 'g.items.raft = true; g.items.oar = true;');
      await settle();
      await holdArrowUntil('Down', "g.player.screen === '5,2' && VL.heroTile(g).ty >= 6", 6000);
      await shoot('w17-wreck');
      await holdArrowUntil('Right', '!g.player.afloat');
      await shoot('w17-wreck-aboard');
      const aboard = await read("[g.player.screen, VL.heroTile(g).tx, VL.heroTile(g).ty, VL.LOCKS.shipwreck.reached(g)]");
      if (aboard.join() !== '5,2,4,6,true') raftProblems.push(`aboard the wreck: screen, tx, ty, reached = ${aboard}`);
      await evaluate("(() => { const g = VL.app.game; Object.assign(g.player, VL.tileCenter(8, 6), { facing: 'up' }); })()");
      await holdArrowUntil('Up', "g.player.area === 'wreck'");
      await sleep(300);
      if ((await read('g.player.area')) !== 'wreck') raftProblems.push('the hatch did not lead below deck');
      for (const [screen, ty] of [['0,0', 2], ['0,1', 2], ['1,0', 4]]) {
        await evaluate(`VL.place(VL.app.game, { area: 'wreck', screen: '${screen}', tx: 7, ty: ${ty}, facing: 'down' }); VL.app.game.room.entities = VL.app.game.room.entities.filter((e) => !VL.isEnemy(e));`);
        await settle();
        await shoot(`w17-room-${screen.replace(',', '_')}`);
      }
      await evaluate("VL.place(VL.app.game, { area: 'wreck', screen: '0,1', tx: 11, ty: 3, facing: 'down' })");
      await settle();
      await hit('KeyD');
      await sleep(250);
      await shoot('w17-bilge-rope');
      await waitFor('!g.player.rope', 3000);
      const crossed = await read('[VL.heroTile(g).tx, VL.heroTile(g).ty]');
      if (crossed.join() !== '11,7') raftProblems.push(`the rope over the bilge landed him at ${crossed}`);
      await evaluate("(() => { const g = VL.app.game; VL.place(g, { area: 'wreck', screen: '1,0', tx: 10, ty: 3, facing: 'right' }); })()");
      await holdArrowUntil('Right', "VL.spotFound(g, 'pageShipwreck')");
      await waitFor("VL.app.sceneId === 'popup'");
      await sleep(400);
      await shoot('w17-page');
      if (!(await read("VL.spotFound(g, 'pageShipwreck')"))) raftProblems.push('the cabin\'s page was not found');

      raftProblems.push(...errors);
      if (raftProblems.length) failures += 1;
      console.log(`${raftProblems.length ? 'FAIL' : 'ok  '} raft and water: Nell's raft, sailing over an edge to the island and its ore, the wreck, below deck, the bilge rope, the page, ${path.join(outDir, 'w17-*.png')}`);
      for (const problem of raftProblems) console.log(`     ${problem}`);
    }

    // The flash guard (WCAG 2.3.1): sample scenes are stepped by hand on an
    // app of their own and drawn to an offscreen canvas every 1/60 s. In 16x16
    // cells, a flip is a change in mean relative luminance against the last
    // extreme, the darker side under 0.8. Two checks, each over any one
    // second: a broad one (a change of 0.05, half WCAG's, so dark rooms' dim
    // floors count too; fails when over a quarter of the canvas flips more
    // than 3 times) and WCAG's own numbers (a change of 0.1, more than 3 flash
    // pairs, so over 6 flips; fails past 4% of the canvas, about 25% of a 10
    // degree field at this game's scale). A control run with the steady layers
    // switched off must fail both, so each is known to see a strobe.
    {
      errors.length = 0;
      const flashProblems = [];
      const scan = JSON.parse(await evaluate(`(() => {
        const { width, height, step } = VL.TUNING;
        const cell = 16;
        const checks = [
          { id: 'broad', flipBy: 0.05, over: 3, bound: 0.25 },
          { id: 'wcag', flipBy: 0.1, over: 6, bound: 0.04 },
        ];
        const cols = width / cell;
        const rows = height / cell;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.imageSmoothingEnabled = false;
        const linear = [];
        for (let i = 0; i < 256; i += 1) {
          const c = i / 255;
          linear.push(c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
        }
        const luminance = () => {
          const { data } = ctx.getImageData(0, 0, width, height);
          const sums = new Float64Array(cols * rows);
          for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
              const i = (y * width + x) * 4;
              sums[Math.floor(y / cell) * cols + Math.floor(x / cell)] += 0.2126 * linear[data[i]] + 0.7152 * linear[data[i + 1]] + 0.0722 * linear[data[i + 2]];
            }
          }
          return Array.from(sums, (s) => s / (cell * cell));
        };
        // reached(app, game) says the scene really showed what it samples.
        const run = (name, seconds, setup, tick, reached = () => true) => {
          const app = VL.createApp();
          app.game = VL.newGame({ name: 'Robin' });
          const g = app.game;
          for (const id of ['controls', 'dungeonMap']) g.popups.seen[id] = true;
          app.setScene('play');
          setup(app, g);
          const cells = checks.map(() => []);
          const worst = checks.map(() => ({ area: 0, at: 0, flips: 0 }));
          let shown = false;
          for (let s = 0; s < seconds; s += step) {
            const actions = tick?.(app, app.game, s) || VL.noActions();
            app.update(actions, step);
            shown = shown || Boolean(reached(app, app.game));
            VL.render(ctx, app, s);
            const now = luminance();
            checks.forEach(({ flipBy, over }, k) => {
              // Each cell follows its brightest (rising) or darkest (falling)
              // value since its last flip; a big enough turn the other way flips it.
              now.forEach((l, i) => {
                const c = cells[k][i] || (cells[k][i] = { dir: 0, hi: l, lo: l, flips: [] });
                const flip = (dir) => {
                  c.flips.push(s);
                  Object.assign(c, { dir, hi: l, lo: l });
                };
                if (c.dir >= 0 && c.hi - l >= flipBy && l < 0.8) flip(-1);
                else if (c.dir <= 0 && l - c.lo >= flipBy && c.lo < 0.8) flip(1);
                else {
                  c.hi = Math.max(c.hi, l);
                  c.lo = Math.min(c.lo, l);
                }
              });
              let flashing = 0;
              let most = 0;
              for (const c of cells[k]) {
                const recent = c.flips.filter((f) => f > s - 1).length;
                most = Math.max(most, recent);
                if (recent > over) flashing += 1;
              }
              const area = flashing / (cols * rows);
              const w = worst[k];
              if (area > w.area || (area === w.area && most > w.flips)) worst[k] = { area, at: Math.round(s * 100) / 100, flips: most };
            });
          }
          return { name, shown, checks: checks.map((check, k) => ({ ...check, ...worst[k] })) };
        };
        const lh = (screen, tx, ty, facing = 'up') => ({ area: 'lighthouse', screen, tx, ty, facing });
        const arm = (g) => {
          g.items.glowstone = true;
          g.items.woodSword = true;
          g.items.slingshot = true;
          g.hands = { mainHand: 'woodSword', offHand: 'slingshot' };
          g.inventory.brokenShells = 15;
        };
        // Hurt again the moment he can be: as flashing as a fight ever gets.
        const hurtOften = (app, g) => {
          g.hp = Math.max(g.hp, 3);
          if (app.sceneId === 'play' && !(g.player.invuln > 0)) VL.hurtHero(g, { damage: 0, size: 'big', from: { x: g.player.x + 8, y: g.player.y }, cause: 'bat' });
        };
        const hurtInDark = (app, g) => g.player.flash > 0 && VL.roomIsDark(g);
        const darkHurt = (app, g) => {
          arm(g);
          VL.place(g, lh('-1,0', 13, 5));
          g.room.entities = g.room.entities.filter((e) => !VL.isEnemy(e));
        };
        const chickenSpot = (() => {
          for (const [area, def] of Object.entries(VL.AREAS)) {
            for (const [screen, data] of Object.entries(def.screens)) {
              const hen = data.entities?.find((e) => e.type === 'chicken' && !e.lost);
              if (hen) return { area, screen, hen };
            }
          }
          return null;
        })();
        const results = [];
        const steady = VL.HERO_LAYERS.filter((layer) => layer.steady);
        for (const layer of steady) layer.steady = false;
        try {
          results.push({ control: true, ...run('control: the dark cellar, hurt, steady layers off', 3, darkHurt, hurtOften, hurtInDark) });
        } finally {
          for (const layer of steady) layer.steady = true;
        }
        results.push(run('the dark cellar, hurt over and over', 4, darkHurt, hurtOften, hurtInDark));
        results.push(run('the dark cellar with its bats', 4, (app, g) => {
          arm(g);
          VL.place(g, lh('-1,0', 13, 5));
        }, (app, g) => { g.hp = Math.max(g.hp, 3); }, (app, g) => VL.roomIsDark(g) && g.room.entities.some((e) => VL.isEnemy(e))));
        results.push(run('the cistern beam, hurt over and over', 4, (app, g) => {
          arm(g);
          VL.place(g, lh('1,0', 9, 2, 'right'));
          g.room.entities = g.room.entities.filter((e) => !VL.isEnemy(e));
        }, hurtOften, (app, g) => g.player.flash > 0 && g.room.entities.some((e) => e.type === 'beamSource')));
        results.push(run('leaving the unlit cellar (the slide)', 2, (app, g) => {
          arm(g);
          VL.place(g, lh('-1,0', 15, 5, 'right'));
          g.room.entities = g.room.entities.filter((e) => !VL.isEnemy(e));
        }, () => VL.actions({ held: ['right'] }), (app, g) => g.transition));
        results.push(run('the Lens Crab shot and struck, round after round', 6, (app, g) => {
          arm(g);
          g.dungeons.lighthouse.doors.d3BossDoor = true;
          VL.place(g, lh('0,-3', 7, 7));
          g.popups.queue.length = 0;
        }, (app, g) => {
          g.player.invuln = 99;
          const c = g.room.entities.find((e) => e.type === 'lensCrab');
          if (!c || c.hp <= 0) return null;
          c.arriving = 0;
          if (c.mode === 'scuttle' || c.mode === 'glint') {
            VL.ENEMIES.lensCrab.onShot(g, c, { dy: -1, gx: c.cx - 1 });
            VL.ENEMIES.lensCrab.onShot(g, c, { dy: -1, gx: c.cx - 1 });
          } else if (c.mode === 'dazed' && !(c.hurt > 0)) {
            VL.hitEnemy(g, c, 1, { x: c.cx, y: c.cy + 20 }, 'woodSword');
          }
          return null;
        }, (app, g) => g.room.entities.some((e) => e.type === 'lensCrab' && e.rounds < 3)));
        results.push(run('the shockwave: rumble, white flash, story, waking', 12, (app) => {
          app.setScene('shockwave', { from: 'rumble' });
        }, (app, g, s) => VL.actions({ pressed: s > 4 && Math.round(s * 60) % 30 === 0 ? ['interact'] : [] }), (app) => app.sceneId === 'play'));
        if (chickenSpot) {
          results.push(run('the chicken swarm', 7, (app, g) => {
            g.items.woodSword = true;
            g.hands = { mainHand: 'woodSword', offHand: null };
            VL.place(g, { area: chickenSpot.area, screen: chickenSpot.screen, tx: chickenSpot.hen.x - 1, ty: chickenSpot.hen.y, facing: 'right' });
            g.room.entities = g.room.entities.filter((e) => !VL.isEnemy(e));
          }, (app, g, s) => {
            const frame = Math.round(s * 60);
            const swarming = g.room.entities.some((e) => e.type === 'chickenSwarm');
            if (swarming || frame % 30 !== 0) return null;
            const hen = g.room.entities.find((e) => e.type === 'chicken' && e.spot === chickenSpot.hen.spot);
            if (!hen) return null;
            g.player.facing = 'right';
            Object.assign(hen, { px: g.player.x + 12, py: g.player.y, mode: 'idle', idle: 99 });
            return VL.actions({ pressed: ['mainHand'] });
          }, (app, g) => g.room.entities.some((e) => e.type === 'chickenSwarm')));
        } else {
          results.push({ name: 'the chicken swarm', missing: true });
        }
        results.push(run('popups one after another, each closed after a beat', 6, (app, g) => {
          g.popups.queue.length = 0;
        }, (app, g, s) => {
          const frame = Math.round(s * 60);
          if (app.sceneId === 'play' && frame % 40 === 0) {
            const next = ['woodSword', 'woodShield', 'slingshot', 'woodShovel'].find((id) => !g.items[id]);
            if (next) VL.giveItem(g, next);
          }
          return VL.actions({ pressed: app.sceneId === 'popup' && frame % 40 === 30 ? ['interact'] : [] });
        }, (app, g) => g.items.woodShovel && app.sceneId === 'popup'));
        results.push(run('fainting in the dark cellar', 5, (app, g) => {
          darkHurt(app, g);
          g.hp = 1;
        }, (app, g, s) => {
          if (app.sceneId === 'play' && g.hp > 0 && !(g.player.invuln > 0) && s < 0.5) VL.hurtHero(g, { damage: 1, size: 'big', from: { x: g.player.x + 8, y: g.player.y }, cause: 'bat' });
          return VL.actions({ pressed: s > 3 && Math.round(s * 60) % 30 === 0 ? ['interact'] : [] });
        }, (app) => app.sceneId === 'fainted'));
        return JSON.stringify(results);
      })()`));
      for (const r of scan) {
        if (r.missing || !r.shown) {
          flashProblems.push(`${r.name}: the scene never showed what it samples`);
          continue;
        }
        const summary = r.checks.map((c) => `${c.id} (${c.flipBy}, over ${c.over}) ${Math.round(c.area * 100)}%, ${c.flips} flips/s in the busiest cell`);
        for (const c of r.checks) {
          const pct = Math.round(c.area * 100);
          const label = `${c.id} check (a change of ${c.flipBy}, over ${c.over} flips a second, past ${c.bound * 100}% of the canvas)`;
          if (r.control && !(c.area > c.bound)) flashProblems.push(`${r.name}: the ${label} did not see the strobe (${pct}%, ${c.flips} flips/s at most)`);
          else if (!r.control && c.area > c.bound) flashProblems.push(`${r.name}: fails the ${label}: ${pct}% at ${c.at} s, ${c.flips} flips in a cell`);
        }
        console.log(`     ${r.control ? 'control ' : ''}${r.name}: ${summary.join('; ')}`);
      }
      flashProblems.push(...errors);
      if (flashProblems.length) failures += 1;
      console.log(`${flashProblems.length ? 'FAIL' : 'ok  '} flash guard: no quarter of the canvas flips more than 3 times a second, nor 4% more than 3 flash pairs (WCAG 2.3.1), in the dark, hurt, beam, boss, shockwave, swarm, popup and faint scenes`);
      for (const problem of flashProblems) console.log(`     ${problem}`);
    }

    await cdp.send('Browser.close').catch(() => {});
    cdp.close();
  } finally {
    clearInterval(watchdog);
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
