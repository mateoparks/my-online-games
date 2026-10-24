// Headless-Chrome smoke over the DevTools protocol (Node's built-in WebSocket,
// no dependencies). Loads index.html from file://, fails on any console error
// or uncaught exception, checks the integer scale at two window sizes, and
// saves a screenshot of each. Run: node games/vanishing-library/smoke.js --out <dir>
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const chrome = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const outIndex = process.argv.indexOf('--out');
const outDir = outIndex === -1 ? path.join(os.tmpdir(), 'vanishing-library-smoke') : process.argv[outIndex + 1];
const pageUrl = `file://${path.join(__dirname, 'index.html')}`;
const sizes = [
  { width: 1024, height: 700, theme: 'dark' },
  { width: 1600, height: 1000, theme: 'light' },
];

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

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vl-chrome-'));
  const browser = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${profile}`, '--remote-debugging-port=0', '--hide-scrollbars', 'about:blank',
  ], { stdio: 'ignore' });
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

    for (const size of sizes) {
      const label = `${size.width}x${size.height}-${size.theme}`;
      errors.length = 0;
      await call('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: false });
      await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: size.theme }] });
      const load = new Promise((resolve) => { loaded = resolve; });
      await call('Page.navigate', { url: pageUrl });
      await load;
      // Two animation frames so the loop has drawn and presented at least once.
      await call('Runtime.evaluate', { expression: 'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))', awaitPromise: true });
      const { result } = await call('Runtime.evaluate', {
        expression: `(() => {
          const canvas = document.getElementById('game');
          const rect = canvas.getBoundingClientRect();
          return JSON.stringify({
            title: document.title, theme: document.documentElement.dataset.theme,
            scale: Number(canvas.dataset.scale), rectWidth: rect.width, rectHeight: rect.height,
            bottom: rect.bottom, innerWidth, innerHeight, backing: canvas.width,
            scene: VL.app.sceneId, screen: VL.app.game.player.screen,
          });
        })()`,
        returnByValue: true,
      });
      const page = JSON.parse(result.value);
      const shot = path.join(outDir, `${label}.png`);
      const { data } = await call('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(shot, Buffer.from(data, 'base64'));

      const problems = [...errors];
      if (!page.title.startsWith('The Vanishing Library')) problems.push(`title: ${page.title}`);
      if (page.theme !== size.theme) problems.push(`theme ${page.theme}, expected ${size.theme}`);
      if (!(page.scale >= 1)) problems.push('no integer scale on the canvas');
      if (page.rectWidth !== 256 * page.scale || page.rectHeight !== 192 * page.scale) problems.push(`canvas is ${page.rectWidth}x${page.rectHeight} for scale ${page.scale}`);
      if (page.bottom > page.innerHeight || page.rectWidth > page.innerWidth) problems.push('canvas does not fit the window');
      if (page.scene !== 'play' || !page.screen) problems.push(`scene ${page.scene}, screen ${page.screen}`);
      results.push({ label, page, problems });
      if (problems.length) failures += 1;
      console.log(`${problems.length ? 'FAIL' : 'ok  '} ${label}: scale ${page.scale} (${page.rectWidth}x${page.rectHeight} in ${page.innerWidth}x${page.innerHeight}), ${errors.length} console errors, ${shot}`);
      for (const problem of problems) console.log(`     ${problem}`);
    }
    if (results.length === 2 && !(results[1].page.scale > results[0].page.scale)) {
      failures += 1;
      console.log(`FAIL the larger window should get a larger scale (${results.map((r) => r.page.scale).join(' vs ')})`);
    }
    await cdp.send('Browser.close').catch(() => {});
    cdp.close();
  } finally {
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
