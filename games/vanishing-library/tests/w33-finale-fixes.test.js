// W33, finale fixes from the end-to-end QA (wave 10 notes 1-4 and 6): the
// hero stays in sight among the giant marionettes, the books he carries come
// home in the ending, Esc skips the whole ending, no HUD over the ending, and
// the slingshot's ammo count sits inside its slot.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, loadGame, memoryStorage } = require('./harness');
const { createPlaythrough } = require('./playthrough');
const { toHall } = require('./finale-route');

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
