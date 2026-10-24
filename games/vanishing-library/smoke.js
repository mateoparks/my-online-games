// Headless-Chrome smoke over the DevTools protocol (Node's built-in WebSocket,
// no dependencies). Loads index.html from file://, fails on any console error
// or uncaught exception, checks the integer scale at two window sizes and on a
// live resize, walks the hero with real key events, checks a screen slide pans
// the right way, plays every sound effect and toggles the persisted mute,
// and saves a screenshot of each size and of each art sheet page.
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
const timeoutMs = 60000;

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

    // Sound in a real browser: the arrow presses above unlocked WebAudio, every
    // effect builds a graph the browser accepts, and the N mute survives a reload.
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
    const reload = new Promise((resolve) => { loaded = resolve; });
    await call('Page.reload');
    await reload;
    if (!(await settle())) soundProblems.push('animation frames stopped after the reload');
    if ((await evaluate('VL.SOUND.muted')) !== true) soundProblems.push('mute was not restored after a reload');
    await muteKey('keyDown');
    await muteKey('keyUp');
    if ((await evaluate("localStorage.getItem('vanishing-library-muted')")) !== '0') soundProblems.push('N did not unmute');
    soundProblems.push(...errors);
    if (soundProblems.length) failures += 1;
    console.log(`${soundProblems.length ? 'FAIL' : 'ok  '} sound: context ${sound.state}, mute toggles and persists, ${path.join(outDir, 'muted.png')}`);
    for (const problem of soundProblems) console.log(`     ${problem}`);

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
