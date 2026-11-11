// Jumping Dude Game: a rage platformer.
// Every level looks easy, every trap fires the same way every time, and death
// is instant with an instant retry. Level layouts live in levels.js.

const W = 800;
const H = 400;
const GROUND = 340;
const STEP = 1 / 120;

const SPEED = 210;
const GRAVITY = 1900;
const JUMP_VELOCITY = -640;
const JUMP_CUT = -280;
const MAX_FALL = 1100;
const COYOTE_TIME = 0.08;
const JUMP_BUFFER = 0.12;

const PLAYER_W = 16;
const PLAYER_H = 34;
const PROGRESS_KEY = 'jumping-dude-progress';
const HUD_FONT = '"Trebuchet MS", "Avenir Next", sans-serif';
const WORDS_LINE = { x: 16, y: 34, gap: 8 };

const DEATH_LINES = {
  pit: ['That floor had somewhere better to be.', 'The floor says sorry. It isn’t.', 'Gravity: 1. You: 0.'],
  spikes: ['The spikes were shy. Not anymore.', 'Those weren’t there a second ago. Or were they?', 'Ouch. Pointy.'],
  block: ['Look up. Always look up.', 'Bonk.', 'The ceiling missed you. Not really.'],
  crush: ['Flat as a pancake.', 'Squish.', 'That ceiling had other plans.'],
  words: ['Crushed by your own instructions.', 'Read the fine print. It fell on you.'],
  fakeDoor: ['That was a painting of a door.', 'Nice door, right? It’s a sticker.']
};

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const srMessage = document.getElementById('message');
const winEl = document.getElementById('win');
const winTitle = document.getElementById('win-title');
const winQuip = document.getElementById('win-quip');
const winDeaths = document.getElementById('win-deaths');
const nextButton = document.getElementById('next');
const startOverButton = document.getElementById('start-over');
document.getElementById('level-count').textContent = LEVELS.length;

// ---- Input (kept apart from the game rules so touch controls can plug in later)

const input = { left: false, right: false, jumpHeld: false, jumpBuffer: 0 };

const KEYS = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  Space: 'jump', ArrowUp: 'jump', KeyW: 'jump'
};

function pressJump() {
  if (!input.jumpHeld) input.jumpBuffer = JUMP_BUFFER;
  input.jumpHeld = true;
}

function handleKey(event, down) {
  if (event.target.closest && event.target.closest('button, a') && (event.code === 'Space' || event.code === 'Enter')) return;
  if (down && event.code === 'KeyR' && level.mode !== 'won') {
    restartLevel();
    return;
  }
  const action = KEYS[event.code];
  if (!action) return;
  event.preventDefault();
  if (action === 'jump') {
    if (down) pressJump();
    else input.jumpHeld = false;
  } else {
    input[action] = down;
  }
}

window.addEventListener('keydown', event => handleKey(event, true));
window.addEventListener('keyup', event => handleKey(event, false));
window.addEventListener('blur', () => {
  input.left = false;
  input.right = false;
  input.jumpHeld = false;
});

// ---- Progress

let progress = loadProgress();
let shake = 0;
let level = buildLevel(firstLevel());

function loadProgress() {
  const fresh = { level: 0, deaths: LEVELS.map(() => 0) };
  try {
    const saved = JSON.parse(localStorage.getItem(PROGRESS_KEY));
    if (!saved) return fresh;
    return {
      level: Math.min(LEVELS.length - 1, Math.max(0, saved.level | 0)),
      deaths: LEVELS.map((_, i) => Number(saved.deaths && saved.deaths[i]) || 0)
    };
  } catch (_) {
    return fresh;
  }
}

function saveProgress() {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch (_) {
    // Private mode: progress just won't survive a reload.
  }
}

// ?level=5 jumps straight to a level, handy for trying them out.
function firstLevel() {
  const asked = Number(new URLSearchParams(location.search).get('level'));
  if (asked >= 1 && asked <= LEVELS.length) return asked - 1;
  return progress.level;
}

function totalDeaths() {
  return progress.deaths.reduce((sum, n) => sum + n, 0);
}

// ---- Building a level

function buildLevel(index) {
  const def = LEVELS[index];
  const things = def.things.map((thing, id) => ({
    ...thing,
    id,
    actions: (thing.actions || []).map(action => ({ ...action, state: 'idle', timer: 0 })),
    grow: thing.hidden ? 0 : 1,
    motion: null,
    shaking: false,
    gone: false,
    pressed: false,
    boing: 0
  }));
  for (const thing of things) {
    thing.waitsToAppear = thing.hidden && thing.actions.some(action => action.do === 'appear');
    thing.baseX = thing.x;
    thing.baseY = thing.y;
  }
  layOutWords(things);
  return {
    index,
    def,
    things,
    mode: 'play',
    deadTimer: 0,
    signals: new Set(),
    reversed: false,
    hasKey: false,
    lockedNoted: false,
    time: 0,
    jumpDelay: 0,
    message: def.hint,
    messageTimer: 0,
    standing: [],
    touched: new Set(),
    player: {
      x: def.spawn, y: (def.spawnY ?? GROUND) - PLAYER_H, w: PLAYER_W, h: PLAYER_H,
      vx: 0, vy: 0, onGround: true, coyote: 0, jumping: false, facing: 1, squash: 0, stride: 0,
      stuckOn: null, stickyTimer: 0, queuedJump: null, beltVx: 0
    }
  };
}

// Words start out as the hint line at the top of the frame.
function layOutWords(things) {
  let x = WORDS_LINE.x;
  ctx.font = wordsFont();
  for (const thing of things) {
    if (thing.look !== 'words') continue;
    const measured = ctx.measureText ? ctx.measureText(thing.text).width : 0;
    thing.w = Math.ceil(measured || thing.text.length * 13);
    thing.x = x;
    thing.y = WORDS_LINE.y - 2;
    x += thing.w + WORDS_LINE.gap;
  }
}

function wordsFont() {
  return `800 24px ${HUD_FONT}`;
}

function startLevel(index) {
  level = buildLevel(index);
  winEl.hidden = true;
  say(level.def.hint);
}

function restartLevel() {
  startLevel(level.index);
}

function say(text, hold = 0) {
  level.message = text;
  level.messageTimer = hold;
  if (srMessage) srMessage.textContent = text;
}

function pick(lines) {
  return lines[Math.floor(Math.random() * lines.length)];
}

// ---- Rules

function overlaps(a, b, inset = 0) {
  return a.x + inset < b.x + b.w && a.x + a.w - inset > b.x &&
    a.y + inset < b.y + b.h && a.y + a.h - inset > b.y;
}

function isSolid(thing) {
  return thing.kind === 'solid' && !thing.gone && !thing.fake && !thing.waitsToAppear &&
    (!thing.blink || (level.time + (thing.blink.phase || 0)) % (thing.blink.on + thing.blink.off) < thing.blink.on);
}

function solids() {
  return level.things.filter(isSolid);
}

function fanReaches(fan, player, walls) {
  const centerX = player.x + player.w / 2;
  const top = Math.max(player.y, fan.y - 44);
  const bottom = Math.min(player.y + player.h, fan.y - 4);
  if (top >= bottom) return false;
  const centerY = (top + bottom) / 2;
  const direction = Math.sign(fan.speed);
  if ((centerX - fan.x) * direction <= 0) return false;
  return !walls.some(wall =>
    wall.y < centerY && wall.y + wall.h > centerY &&
    (direction > 0
      ? wall.x < centerX && wall.x + wall.w > fan.x
      : wall.x + wall.w > centerX && wall.x < fan.x));
}

function touch(thing) {
  level.touched.add(thing);
  if (thing.hidden && !thing.waitsToAppear) thing.hidden = false;
}

function emit(signal) {
  level.signals.add(signal);
}

function die(cause, thing) {
  if (level.mode !== 'play') return;
  level.mode = 'dead';
  level.deadTimer = 0.9;
  level.player.squash = 1;
  progress.deaths[level.index] += 1;
  saveProgress();
  say(thing && thing.quip ? thing.quip : pick(DEATH_LINES[cause]));
}

function win() {
  level.mode = 'won';
  const last = level.index === LEVELS.length - 1;
  if (!last) progress.level = Math.max(progress.level, level.index + 1);
  saveProgress();
  const deaths = progress.deaths[level.index];
  winTitle.textContent = last ? `All ${LEVELS.length} levels cleared` : `Level ${level.index + 1} cleared`;
  winQuip.textContent = level.def.cleared;
  winDeaths.textContent = last
    ? `Total deaths: ${totalDeaths()}. Frame it.`
    : deaths === 0 ? 'Zero deaths? Suspicious.' : `${deaths} ${deaths === 1 ? 'death' : 'deaths'} on this one.`;
  nextButton.textContent = last ? 'Play again from level 1' : 'Next level →';
  winEl.hidden = false;
  say(last ? 'You did it. Really.' : 'Fine. You win this one.');
  nextButton.focus();
}

function goNext() {
  if (level.index === LEVELS.length - 1) {
    progress = { level: 0, deaths: LEVELS.map(() => 0) };
    saveProgress();
    startLevel(0);
  } else {
    startLevel(level.index + 1);
  }
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}

function startOver() {
  if (!confirm('Start over from level 1? Your death count goes back to zero too.')) return;
  progress = { level: 0, deaths: LEVELS.map(() => 0) };
  saveProgress();
  startLevel(0);
}

function updatePlayer(dt) {
  const p = level.player;
  p.stickyTimer = Math.max(0, p.stickyTimer - dt);
  const pressed = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const dir = level.reversed ? -pressed : pressed;
  p.vx = p.stickyTimer > 0 ? 0 : dir * SPEED;
  const walls = solids();
  for (const fan of level.things) {
    if (fan.kind === 'fan' && !fan.gone &&
        (!fan.period || level.time % fan.period < fan.active) &&
        fanReaches(fan, p, walls)) {
      p.vx += fan.speed;
    }
  }
  p.vx += p.beltVx;
  p.beltVx = Math.sign(p.beltVx) * Math.max(0, Math.abs(p.beltVx) - 240 * dt);
  if (dir) p.facing = dir;

  p.coyote = p.onGround ? COYOTE_TIME : p.coyote - dt;
  input.jumpBuffer -= dt;
  if (p.queuedJump !== null) p.queuedJump -= dt;
  if (input.jumpBuffer > 0 && p.coyote > 0 && p.stickyTimer <= 0 && p.queuedJump === null && level.jumpDelay > 0) {
    p.queuedJump = level.jumpDelay;
    level.jumpDelay = 0;
    input.jumpBuffer = 0;
  }
  if (((input.jumpBuffer > 0 && p.queuedJump === null) || (p.queuedJump !== null && p.queuedJump <= 0)) &&
      p.coyote > 0 && p.stickyTimer <= 0) {
    p.vy = JUMP_VELOCITY;
    p.coyote = 0;
    input.jumpBuffer = 0;
    p.onGround = false;
    p.jumping = true;
    p.queuedJump = null;
  } else if (p.queuedJump !== null && p.queuedJump <= 0 && p.coyote <= 0) {
    p.queuedJump = null;
  }
  if (p.jumping && !input.jumpHeld && p.vy < JUMP_CUT) p.vy = JUMP_CUT;
  p.vy = Math.min(p.vy + GRAVITY * dt, MAX_FALL);

  level.touched.clear();

  const nextX = p.x + p.vx * dt;
  p.x = Math.max(0, Math.min(W - p.w, nextX));
  if (p.x !== nextX) p.beltVx = 0;
  for (const s of walls) {
    if (s.oneWay || !overlaps(p, s) || !p.vx) continue;
    touch(s);
    p.x = p.vx > 0 ? s.x - p.w : s.x + s.w;
    p.beltVx = 0;
  }

  const wasOnGround = p.onGround;
  const previousBottom = p.y + p.h;
  p.y += p.vy * dt;
  p.onGround = false;
  for (const s of walls) {
    if (!overlaps(p, s)) continue;
    if (s.oneWay && (p.vy < 0 || previousBottom > s.y + 1)) continue;
    touch(s);
    if (p.vy >= 0) {
      p.y = s.y - p.h;
      p.onGround = true;
      p.jumping = false;
    } else {
      p.y = s.y + s.h;
    }
    p.vy = 0;
  }
  if (p.onGround && !wasOnGround) p.squash = 0.25;
  p.squash = Math.max(0, p.squash - dt);
  p.stride = p.onGround && p.vx ? p.stride + Math.abs(p.vx) * dt * 0.075 : 0;

  const feet = { x: p.x, y: p.y + p.h, w: p.w, h: 1 };
  level.standing = p.onGround ? walls.filter(s => overlaps(feet, s)) : [];
  const sticky = level.standing.find(s => s.sticky);
  if (sticky && p.stuckOn !== sticky) p.stickyTimer = sticky.sticky;
  p.stuckOn = sticky || null;
}

function updateGadgets() {
  const p = level.player;
  for (const thing of level.things) {
    if (thing.gone) continue;
    if (thing.kind === 'spring' && p.vy >= 0 && overlaps(p, thing)) {
      p.y = thing.y - p.h;
      p.vy = thing.power;
      p.onGround = false;
      p.coyote = 0;
      p.jumping = false;
      thing.boing = 0.3;
    }
    const onIt = thing.kind === 'button' ? overlaps(p, thing) : thing.press && level.standing.includes(thing);
    if (onIt && !thing.pressed) {
      thing.pressed = true;
      emit(thing.signal || thing.press);
    }
    if (thing.jumpDelay && level.standing.includes(thing) && !thing.pressed) {
      thing.pressed = true;
      level.jumpDelay = thing.jumpDelay;
      say('Your next jump has a delay.');
    }
    if (thing.kind === 'checkpoint' && !thing.pressed && overlaps(p, thing)) {
      thing.pressed = true;
      emit(thing.signal);
      say(thing.say || 'Checkpoint! Probably.');
    }
    if (thing.kind === 'key' && !thing.hidden && !thing.motion && overlaps(p, thing)) {
      thing.gone = true;
      if (thing.fake) {
        say('That key was a fake.');
        emit(thing.signal || 'fake-key');
      } else {
        level.hasKey = true;
        say('Got the key!');
        emit('key');
      }
    }
  }
}

function conditionsMet(on, thing) {
  if (on === 'start') return true;
  if (on === 'stand') return level.standing.includes(thing);
  if (on === 'leave') return thing.wasStoodOn && !level.standing.includes(thing);
  if (on === 'touch') return level.touched.has(thing) || level.standing.includes(thing);
  if (on.zone) {
    const [x, y, w, h] = on.zone;
    if (!overlaps(level.player, { x, y, w, h })) return false;
  }
  if (on.signal && !level.signals.has(on.signal)) return false;
  if (on.unlessSignal && level.signals.has(on.unlessSignal)) return false;
  if (on.signals && !on.signals.every(signal => level.signals.has(signal))) return false;
  if (on.anySignals && !on.anySignals.some(signal => level.signals.has(signal))) return false;
  if (on.lowPlatforms && !on.lowPlatforms.every(id => level.things.some(platform =>
    platform.sink && platform.sink.id === id &&
    platform.y >= platform.baseY + platform.sink.depth - (platform.sink.tolerance ?? 2)))) return false;
  if (on.after !== undefined && thing.actions[on.after].state !== 'done') return false;
  return true;
}

function updateTriggers(dt) {
  for (const thing of level.things) {
    thing.shaking = false;
    for (const action of thing.actions) {
      if (action.state === 'idle' && conditionsMet(action.on, thing)) {
        action.state = 'waiting';
        action.timer = action.delay || 0;
      }
      if (action.state === 'waiting') {
        action.timer -= dt;
        if (!action.quiet) thing.shaking = true;
        if (action.timer <= 0) fire(thing, action);
      }
    }
    thing.wasStoodOn = level.standing.includes(thing);
  }
}

function fire(thing, action) {
  action.state = action.do === 'move' ? 'running' : 'done';
  if (action.do === 'fall') {
    thing.motion = { type: 'fall', vy: action.vy || 0, g: action.g || GRAVITY };
  } else if (action.do === 'move') {
    const toX = action.to ? action.to[0] : thing.x + (action.dx || 0);
    const toY = action.to ? action.to[1] - thing.h : thing.y + (action.dy || 0);
    thing.motion = {
      type: 'move', action, phase: 'go', t: 0, wait: 0,
      fromX: thing.x, fromY: thing.y, dx: toX - thing.x, dy: toY - thing.y
    };
  } else if (action.do === 'tilt') {
    action.state = 'running';
    thing.motion = { type: 'tilt', action, t: 0, from: thing.angle, to: action.to * Math.PI / 180 };
  } else if (action.do === 'appear') {
    thing.hidden = false;
    thing.waitsToAppear = false;
    thing.grow = 0;
  } else if (action.do === 'vanish') {
    thing.gone = true;
  } else if (action.do === 'reverse') {
    level.reversed = action.value !== false;
  }
  if (action.say) say(action.say);
  if (action.emit) emit(action.emit);
}

function ease(kind, t) {
  if (kind === 'in') return t * t;
  if (kind === 'linear') return t;
  return t * t * (3 - 2 * t);
}

function updateMotion(thing, dt) {
  const m = thing.motion;
  if (m.type === 'fall') {
    m.vy += m.g * dt;
    thing.y += m.vy * dt;
    for (const s of solids()) {
      if (s === thing || s.motion || !overlaps(thing, s)) continue;
      thing.y = s.y - thing.h;
      thing.motion = null;
      if (thing.look === 'block') shake = 0.25;
      return;
    }
    if (thing.y > H + 100) {
      thing.gone = true;
      thing.motion = null;
    }
    return;
  }

  const a = m.action;
  if (m.type === 'tilt') {
    m.t = Math.min(1, m.t + dt / (a.time || 0.4));
    thing.angle = m.from + (m.to - m.from) * ease(a.ease, m.t);
    if (m.t >= 1) {
      shake = Math.max(shake, 0.1);
      finishMotion(thing);
    }
    return;
  }
  if (a.back && a.back.signal && level.signals.has(a.back.signal)) {
    if (m.phase === 'go') {
      m.phase = 'back';
      m.t = 1 - m.t;
    } else if (m.phase === 'hold') {
      m.phase = 'back';
      m.t = 0;
    }
  }
  if (m.phase === 'go' || m.phase === 'back') {
    const time = m.phase === 'go' ? a.time || 0.5 : a.back.time;
    m.t = Math.min(1, m.t + dt / time);
    const travel = m.phase === 'go' ? m.t : 1 - m.t;
    const k = m.phase === 'go' || a.back.signal ? ease(a.ease, travel) : 1 - ease('smooth', m.t);
    if (a.semicircle) {
      thing.x = m.fromX + m.dx * (1 - Math.cos(Math.PI * travel)) / 2;
      thing.y = m.fromY + m.dy * travel + Math.abs(m.dx) / 2 * Math.sin(Math.PI * travel);
    } else {
      thing.x = m.fromX + m.dx * k;
      thing.y = m.fromY + m.dy * k - ((m.phase === 'go' || a.back.signal) ? (a.arc || 0) * Math.sin(Math.PI * travel) : 0);
    }
    if (m.t < 1) return;
    if (m.phase === 'go') {
      if (a.sayAfter) say(a.sayAfter);
      if (thing.look === 'crusher') shake = Math.max(shake, 0.12);
      if (a.back) {
        m.phase = 'hold';
        m.wait = a.back.after ?? 0;
      } else {
        finishMotion(thing);
      }
    } else if (a.loop !== undefined) {
      m.phase = 'rest';
      m.wait = a.loop;
    } else {
      finishMotion(thing);
    }
    return;
  }
  if (m.phase === 'hold' && a.back.signal) return;
  m.wait -= dt;
  if (m.wait > 0) return;
  m.t = 0;
  m.phase = m.phase === 'hold' ? 'back' : 'go';
}

function finishMotion(thing) {
  thing.motion.action.state = 'done';
  thing.motion = null;
}

function spikeHitbox(spike) {
  const g = spike.grow;
  if (spike.dir === 'down') return { x: spike.x, y: spike.y, w: spike.w, h: spike.h * g };
  if (spike.dir === 'left') return { x: spike.x + spike.w * (1 - g), y: spike.y, w: spike.w * g, h: spike.h };
  if (spike.dir === 'right') return { x: spike.x, y: spike.y, w: spike.w * g, h: spike.h };
  return { x: spike.x, y: spike.y + spike.h * (1 - g), w: spike.w, h: spike.h * g };
}

// A pole is a spiky stick standing on a pivot at its base. It can tip over
// (and get back up). Anything within half its width of its spine is spikes.
function poleSpine(pole, distance) {
  return { x: pole.x + Math.sin(pole.angle) * distance, y: pole.y - Math.cos(pole.angle) * distance };
}

function poleHits(pole, p) {
  const reach = pole.w / 2 - 2;
  for (let d = 0; d <= pole.len + 6; d += 4) {
    const point = poleSpine(pole, d);
    if (point.x > p.x + 3 - reach && point.x < p.x + p.w - 3 + reach &&
        point.y > p.y + 3 - reach && point.y < p.y + p.h - 3 + reach) return true;
  }
  return false;
}

function checkHazards() {
  const p = level.player;
  for (const thing of level.things) {
    if (thing.gone || level.mode !== 'play') continue;
    if (thing.kind === 'spikes' && !thing.hidden && thing.grow > 0.2 && overlaps(p, spikeHitbox(thing), 3)) {
      die('spikes', thing);
    } else if (isSolid(thing) && !thing.oneWay && overlaps(p, thing, 1)) {
      die(thing.look === 'block' ? 'block' : thing.look === 'words' ? 'words' : 'crush', thing);
    } else if (thing.kind === 'pole' && poleHits(thing, p)) {
      die('spikes', thing);
    } else if (thing.kind === 'door' && thing.fake && overlaps(p, thing, 6)) {
      die('fakeDoor', thing);
    }
  }
  if (p.y > H + 40) die('pit');
}

function checkDoors() {
  const p = level.player;
  const centerX = p.x + p.w / 2;
  for (const door of level.things) {
    if (door.kind !== 'door' || door.fake || door.motion || door.actions.some(a => a.state === 'waiting')) continue;
    const atDoor = p.onGround && centerX > door.x && centerX < door.x + door.w && Math.abs(p.y + p.h - (door.y + door.h)) < 4;
    if (!atDoor) continue;
    if (door.locked && !level.hasKey) {
      if (!level.lockedNoted) say('Locked. There’s a key around here somewhere.');
      level.lockedNoted = true;
      continue;
    }
    win();
    return;
  }
}

function update(dt) {
  shake = Math.max(0, shake - dt);
  for (const thing of level.things) thing.boing = Math.max(0, thing.boing - dt);
  if (level.messageTimer > 0) {
    level.messageTimer -= dt;
    if (level.messageTimer <= 0) say(level.def.hint || '');
  }
  if (level.mode === 'dead') {
    level.deadTimer -= dt;
    if (level.deadTimer <= 0) {
      const quip = level.message;
      level = buildLevel(level.index);
      say(quip, 1.6);
    }
    return;
  }
  if (level.mode !== 'play') return;
  level.time += dt;
  const oldX = level.player.x;
  updatePlayer(dt);
  beltUpdate(level, solids(), dt, W);
  const playerDX = level.player.x - oldX;
  updateGadgets();
  updateTriggers(dt);
  const p = level.player;
  for (const thing of level.things) {
    if (thing.motion) {
      // A moving platform carries whoever is standing on it.
      const fromX = thing.x;
      const fromY = thing.y;
      const carries = thing.motion.type === 'move' && level.standing.includes(thing);
      updateMotion(thing, dt);
      if (carries) {
        p.x = Math.max(0, Math.min(W - p.w, p.x + thing.x - fromX));
        p.y += thing.y - fromY;
      }
    }
    if (!thing.motion && !thing.gone && thing.kind === 'solid' && (thing.sink || thing.mimic)) {
      const fromX = thing.x;
      const fromY = thing.y;
      if (thing.sink) {
        const occupied = level.standing.includes(thing);
        const target = thing.baseY + (occupied ? thing.sink.depth : 0);
        const step = (occupied ? thing.sink.speed : thing.sink.riseSpeed ?? thing.sink.speed) * dt;
        thing.y += Math.max(-step, Math.min(step, target - thing.y));
      }
      if (thing.mimic) {
        thing.x = Math.max(thing.mimic.min, Math.min(thing.mimic.max, thing.x + playerDX * thing.mimic.factor));
      }
      if (level.standing.includes(thing)) {
        p.x = Math.max(0, Math.min(W - p.w, p.x + thing.x - fromX));
        p.y += thing.y - fromY;
      }
    }
    if (thing.kind === 'spikes' && !thing.hidden && thing.grow < 1) thing.grow = Math.min(1, thing.grow + dt / 0.07);
  }
  checkHazards();
  if (level.mode === 'play') checkDoors();
}

// ---- Drawing

function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const LAYERS = { sign: 0, zone: 0, fan: 0, checkpoint: 1, door: 1, key: 2, button: 3, spring: 3, solid: 4, spikes: 5, pole: 5 };

function draw() {
  const colors = {
    sky: token('--sky'), ground: token('--palm'), ink: token('--ink'), door: token('--aqua'),
    sand: token('--sand'), danger: token('--danger'), muted: token('--muted'), gold: token('--gold')
  };
  ctx.save();
  ctx.fillStyle = colors.sky;
  ctx.fillRect(0, 0, W, H);
  if (shake > 0) ctx.translate((Math.random() - 0.5) * 40 * shake, (Math.random() - 0.5) * 40 * shake);

  const ordered = level.things.slice().sort((a, b) => LAYERS[a.kind] - LAYERS[b.kind]);
  for (const thing of ordered) {
    if (thing.gone) continue;
    const draw = DRAWERS[thing.kind];
    if (draw) draw(thing, colors);
    if (thing.kind === 'solid' && isSolid(thing)) beltDraw(ctx, thing, colors);
  }
  drawDude(colors);
  ctx.restore();
  drawHud(colors);
}

const DRAWERS = {
  sign: drawSign,
  door: drawDoor,
  key: drawKey,
  button: drawButton,
  spring: drawSpring,
  solid: drawSolid,
  fan: drawFan,
  checkpoint: drawCheckpoint,
  spikes: drawSpikes,
  pole: drawPole
};

function jitter(thing) {
  return thing.shaking ? (Math.random() - 0.5) * 3 : 0;
}

function drawSolid(thing, colors) {
  if (thing.hidden) {
    if (thing.twinkle) drawTwinkle(thing, colors);
    return;
  }
  const x = thing.x + jitter(thing);
  const { y, w, h } = thing;
  if (thing.blink && !isSolid(thing)) return;
  if (thing.look === 'words') {
    ctx.fillStyle = colors.ink;
    ctx.font = wordsFont();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(thing.text, x, y + 1, w);
    ctx.textBaseline = 'alphabetic';
    return;
  }
  if (thing.look === 'block' || thing.look === 'crusher') {
    if (thing.look === 'block' && !thing.motion && thing.actions.some(a => a.do === 'fall' && a.state !== 'done')) {
      ctx.strokeStyle = colors.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + w / 2, 0);
      ctx.lineTo(x + w / 2, y);
      ctx.stroke();
    }
    ctx.fillStyle = colors.muted;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = colors.ink;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    if (thing.look === 'crusher') {
      ctx.fillStyle = colors.ink;
      for (let i = 0; i < w; i += 10) {
        ctx.beginPath();
        ctx.moveTo(x + i, y + h);
        ctx.lineTo(x + i + 5, y + h + 6);
        ctx.lineTo(x + i + 10, y + h);
        ctx.fill();
      }
    }
    return;
  }
  if (thing.look === 'gate') {
    ctx.fillStyle = colors.ink;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = colors.muted;
    for (let gy = y + 10; gy < y + h; gy += 24) ctx.fillRect(x + 4, gy, w - 8, 4);
    return;
  }
  ctx.fillStyle = colors.ground;
  ctx.fillRect(x, y, w, h);
  if (thing.jumpDelay) {
    ctx.fillStyle = colors.door;
    ctx.fillRect(x, y, w, 4);
  }
  const marks = [thing.jumpDelay && 'D', thing.sticky && 'S'].filter(Boolean).join('');
  if (marks) {
    ctx.font = `800 10px ${HUD_FONT}`;
    ctx.textAlign = 'left';
    const width = Math.min(w, marks.length * 8 + 6);
    ctx.fillStyle = colors.sand;
    ctx.fillRect(x, y + 4, width, 12);
    ctx.fillStyle = colors.ink;
    ctx.fillText(marks, x + 3, y + 14, width - 3);
  }
  if (thing.press) drawButton({ x: x + w / 2 - 15, y: y - 8, w: 30, h: 8, pressed: thing.pressed }, colors);
}

function drawTwinkle(thing, colors) {
  const phase = (performance.now() / 1000 + thing.id * 0.7) % 2.4;
  if (phase > 0.5) return;
  const size = Math.sin((phase / 0.5) * Math.PI) * 5;
  const cx = thing.x + thing.w / 2;
  const cy = thing.y + thing.h / 2;
  ctx.strokeStyle = colors.muted;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - size, cy);
  ctx.lineTo(cx + size, cy);
  ctx.moveTo(cx, cy - size);
  ctx.lineTo(cx, cy + size);
  ctx.stroke();
}

function drawSign(sign, colors) {
  ctx.font = `800 13px ${HUD_FONT}`;
  const width = Math.max(60, ctx.measureText(sign.text).width + 16);
  ctx.fillStyle = colors.muted;
  ctx.fillRect(sign.x - 2, sign.y - 46, 4, 46);
  ctx.fillStyle = colors.sand;
  ctx.strokeStyle = colors.ink;
  ctx.lineWidth = 2;
  ctx.fillRect(sign.x - width / 2, sign.y - 74, width, 30);
  ctx.strokeRect(sign.x - width / 2, sign.y - 74, width, 30);
  ctx.fillStyle = colors.ink;
  ctx.textAlign = 'center';
  ctx.fillText(sign.text, sign.x, sign.y - 54);
}

function drawDoor(door, colors) {
  const x = door.x + jitter(door);
  ctx.fillStyle = colors.door;
  ctx.fillRect(x, door.y, door.w, door.h);
  ctx.fillStyle = colors.sand;
  ctx.beginPath();
  ctx.arc(x + door.w - 8, door.y + door.h / 2, 3, 0, Math.PI * 2);
  ctx.fill();
  if (door.locked && !level.hasKey) {
    const cx = x + door.w / 2;
    const cy = door.y + 18;
    ctx.strokeStyle = colors.gold;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy - 4, 5, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = colors.gold;
    ctx.fillRect(cx - 7, cy - 4, 14, 11);
  }
  if (door.motion && door.motion.type === 'move') {
    // Little legs, because of course the door has legs.
    const step = Math.sin(door.motion.t * 40) * 5;
    ctx.strokeStyle = colors.ink;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + 8, door.y + door.h);
    ctx.lineTo(x + 8 + step, door.y + door.h + 10);
    ctx.moveTo(x + door.w - 8, door.y + door.h);
    ctx.lineTo(x + door.w - 8 - step, door.y + door.h + 10);
    ctx.stroke();
  }
}

function drawKey(key, colors) {
  if (key.hidden) return;
  const bob = key.motion ? 0 : Math.sin(performance.now() / 300) * 2;
  const y = key.y + bob;
  ctx.fillStyle = colors.gold;
  ctx.strokeStyle = colors.gold;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(key.x + 5, y + 6, 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillRect(key.x + 9, y + 5, 13, 3);
  ctx.fillRect(key.x + 16, y + 8, 3, 4);
  ctx.fillRect(key.x + 20, y + 8, 2, 3);
}

function drawFan(fan, colors) {
  const direction = Math.sign(fan.speed);
  const x = fan.x + direction * 24;
  const y = fan.y - 24;
  const runningTime = fan.period
    ? Math.floor(level.time / fan.period) * fan.active + Math.min(level.time % fan.period, fan.active)
    : level.time;
  ctx.fillStyle = colors.muted;
  ctx.fillRect(x - 4, y + 15, 8, 9);
  ctx.fillRect(x - 3, fan.y, 6, Math.max(0, GROUND - fan.y));
  ctx.beginPath();
  ctx.arc(x, y, 20, 0, Math.PI * 2);
  ctx.fillStyle = colors.sand;
  ctx.fill();
  ctx.strokeStyle = colors.ink;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(runningTime * 9 * direction);
  ctx.fillStyle = colors.ground;
  for (let i = 0; i < 3; i++) {
    ctx.rotate(Math.PI * 2 / 3);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(3, -19, 13, -12);
    ctx.quadraticCurveTo(16, -5, 0, 0);
    ctx.fill();
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, Math.PI * 2);
  ctx.fillStyle = colors.ink;
  ctx.fill();
}

function drawCheckpoint(checkpoint, colors) {
  ctx.fillStyle = colors.ink;
  ctx.fillRect(checkpoint.x, checkpoint.y, 3, checkpoint.h);
  ctx.fillStyle = checkpoint.pressed ? colors.muted : colors.door;
  ctx.fillRect(checkpoint.x + 3, checkpoint.y, checkpoint.w - 3, 12);
}

function drawButton(button, colors) {
  const h = button.pressed ? 3 : button.h;
  ctx.fillStyle = button.pressed ? colors.muted : colors.danger;
  ctx.fillRect(button.x + 3, button.y + button.h - h, button.w - 6, h);
  ctx.fillStyle = colors.ink;
  ctx.fillRect(button.x, button.y + button.h - 2, button.w, 2);
}

function drawSpring(spring, colors) {
  const squeeze = spring.boing > 0 ? -Math.sin((spring.boing / 0.3) * Math.PI) * 10 : 0;
  const top = spring.y - squeeze * 0.6;
  const bottom = spring.y + spring.h;
  ctx.strokeStyle = colors.ink;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  const turns = 4;
  for (let i = 0; i <= turns * 2; i++) {
    const yy = bottom - 3 - ((bottom - 3 - (top + 3)) * i) / (turns * 2);
    const xx = i % 2 ? spring.x + spring.w - 5 : spring.x + 5;
    if (i === 0) ctx.moveTo(xx, yy);
    else ctx.lineTo(xx, yy);
  }
  ctx.stroke();
  ctx.fillStyle = colors.danger;
  ctx.fillRect(spring.x, top - 2, spring.w, 5);
  ctx.fillStyle = colors.ink;
  ctx.fillRect(spring.x, bottom - 3, spring.w, 3);
}

function drawPole(pole, colors) {
  const half = pole.w / 2;
  const teeth = Math.max(2, Math.round(pole.len / 12));
  const size = pole.len / teeth;
  ctx.save();
  ctx.translate(pole.x + jitter(pole), pole.y);
  ctx.rotate(pole.angle);
  ctx.fillStyle = colors.ink;
  ctx.fillRect(-2, -pole.len, 4, pole.len);
  ctx.fillStyle = colors.danger;
  ctx.beginPath();
  for (let i = 0; i < teeth; i++) {
    const y = -i * size;
    ctx.moveTo(-1, y);
    ctx.lineTo(-half, y - size / 2);
    ctx.lineTo(-1, y - size);
    ctx.moveTo(1, y);
    ctx.lineTo(half, y - size / 2);
    ctx.lineTo(1, y - size);
  }
  ctx.moveTo(-half / 2, -pole.len);
  ctx.lineTo(0, -pole.len - 12);
  ctx.lineTo(half / 2, -pole.len);
  ctx.fill();
  ctx.restore();
}

function drawSpikes(spike, colors) {
  if (spike.hidden || spike.grow <= 0) return;
  const box = spikeHitbox(spike);
  ctx.fillStyle = colors.danger;
  ctx.beginPath();
  const horizontal = spike.dir === 'up' || spike.dir === 'down';
  const length = horizontal ? spike.w : spike.h;
  const teeth = Math.max(1, Math.round(length / 12));
  const size = length / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * size;
    if (spike.dir === 'up') {
      ctx.moveTo(box.x + a, box.y + box.h);
      ctx.lineTo(box.x + a + size / 2, box.y);
      ctx.lineTo(box.x + a + size, box.y + box.h);
    } else if (spike.dir === 'down') {
      ctx.moveTo(box.x + a, box.y);
      ctx.lineTo(box.x + a + size / 2, box.y + box.h);
      ctx.lineTo(box.x + a + size, box.y);
    } else if (spike.dir === 'left') {
      ctx.moveTo(box.x + box.w, box.y + a);
      ctx.lineTo(box.x, box.y + a + size / 2);
      ctx.lineTo(box.x + box.w, box.y + a + size);
    } else {
      ctx.moveTo(box.x, box.y + a);
      ctx.lineTo(box.x + box.w, box.y + a + size / 2);
      ctx.lineTo(box.x, box.y + a + size);
    }
  }
  ctx.fill();
}

function hudText(text, x, y, font, color, align, colors) {
  ctx.font = font;
  ctx.textAlign = align;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 5;
  ctx.strokeStyle = colors.sky;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawHud(colors) {
  const def = level.def;
  hudText(`LEVEL ${level.index + 1} / ${LEVELS.length} · ${def.name.toUpperCase()}`, 16, 22, `800 12px ${HUD_FONT}`, colors.muted, 'left', colors);
  // On the words level the hint line is made of real, falling words, so
  // other messages go one line lower.
  const wordsHome = def.wordsHint;
  if (level.message) {
    hudText(level.message, 16, wordsHome ? 82 : 48, `800 18px ${HUD_FONT}`, colors.ink, 'left', colors);
  }
  hudText(`Deaths ${progress.deaths[level.index]}`, W - 16, 26, `800 18px ${HUD_FONT}`, colors.ink, 'right', colors);
  hudText(`Total ${totalDeaths()}`, W - 16, 44, `800 12px ${HUD_FONT}`, colors.muted, 'right', colors);
}

// Angles are measured from straight down; positive swings toward where he faces.
function limb(x, y, angle, length, facing) {
  return { x: x + Math.sin(angle) * length * facing, y: y + Math.cos(angle) * length };
}

function dudePose(p, now) {
  if (!p.onGround) {
    if (p.vy < 0) {
      // Going up: front knee tucked, back leg trailing, arms reaching up.
      return { lean: 0.1, legs: [[1.3, -0.1], [-0.4, -1.3]], arms: [[2.7, 2.9], [2.2, 2.6]] };
    }
    // Coming down: legs reaching for the floor, arms windmilling.
    const flail = Math.sin(now / 45) * 0.5;
    return { lean: 0, legs: [[0.5, 0.1], [-0.3, -0.6]], arms: [[2.4 + flail, 2.9 + flail], [2.0 - flail, 2.5 - flail]] };
  }
  if (p.squash > 0.05) {
    const k = p.squash / 0.25;
    return { lean: 0.25 * k, legs: [[0.9 * k, -0.7 * k], [0.7 * k, -0.9 * k]], arms: [[-0.6 * k, 0.3], [0.8 * k, 1.3 * k]] };
  }
  if (p.vx) {
    const t = p.stride;
    const leg = phase => {
      const thigh = 0.85 * Math.sin(phase);
      return [thigh, thigh - (0.25 + 1.3 * Math.max(0, Math.cos(phase)))];
    };
    const arm = phase => {
      const upper = -0.8 * Math.sin(phase);
      return [upper, upper + 1.2];
    };
    return { lean: 0.22, legs: [leg(t), leg(t + Math.PI)], arms: [arm(t), arm(t + Math.PI)] };
  }
  const sway = Math.sin(now / 600) * 0.05;
  return { lean: 0, legs: [[0.14, 0.12], [-0.14, -0.12]], arms: [[0.4 + sway, 0.25 + sway], [-0.4 - sway, -0.25 - sway]] };
}

function strokeLine(points) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
  ctx.stroke();
}

function drawDude(colors) {
  const p = level.player;
  const now = performance.now();
  const cx = p.x + p.w / 2;
  const f = p.facing;
  ctx.strokeStyle = colors.ink;
  ctx.fillStyle = colors.ink;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (level.mode === 'dead') {
    // Flat on his back, limbs out.
    const y = Math.min(p.y + p.h, H) - 3;
    strokeLine([{ x: cx - 12 * f, y }, { x: cx + 6 * f, y }]);
    strokeLine([{ x: cx + 6 * f, y }, { x: cx + 14 * f, y: y - 6 }]);
    strokeLine([{ x: cx + 6 * f, y }, { x: cx + 17 * f, y: y + 1 }]);
    strokeLine([{ x: cx - 6 * f, y }, { x: cx - 2 * f, y: y - 8 }]);
    strokeLine([{ x: cx - 6 * f, y }, { x: cx + 2 * f, y: y - 4 }]);
    ctx.beginPath();
    ctx.arc(cx - 18 * f, y - 3, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors.danger;
    ctx.font = '800 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('x_x', cx - 18 * f, y - 14);
    return;
  }

  const pose = dudePose(p, now);
  const THIGH = 6.5;
  const SHIN = 6.5;
  const legPoints = pose.legs.map(([thigh, shin]) => {
    const knee = limb(0, 0, thigh, THIGH, f);
    return [knee, limb(knee.x, knee.y, shin, SHIN, f)];
  });
  // Plant the lower foot on the ground so the run cycle doesn't float.
  const footDrop = Math.max(...legPoints.map(([, foot]) => foot.y));
  const hip = { x: cx, y: p.onGround ? p.y + p.h - footDrop : p.y + 21 };
  const neck = limb(hip.x, hip.y, Math.PI - pose.lean, 12, f);
  const shoulder = limb(hip.x, hip.y, Math.PI - pose.lean, 10, f);
  const head = limb(hip.x, hip.y, Math.PI - pose.lean, 17, f);

  for (const [knee, foot] of legPoints) {
    strokeLine([hip, { x: hip.x + knee.x, y: hip.y + knee.y }, { x: hip.x + foot.x, y: hip.y + foot.y }]);
  }
  strokeLine([hip, neck]);
  for (const [upper, fore] of pose.arms) {
    const elbow = limb(shoulder.x, shoulder.y, upper, 5.5, f);
    strokeLine([shoulder, elbow, limb(elbow.x, elbow.y, fore, 5.5, f)]);
  }
  ctx.beginPath();
  ctx.arc(head.x, head.y, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors.sky;
  ctx.fillRect(head.x + 1.5 * f - 1, head.y - 2, 2, 2.5);
}

// ---- Loop

let last = performance.now();
let accumulator = 0;

function frame(now) {
  accumulator += Math.min(0.1, (now - last) / 1000);
  last = now;
  while (accumulator >= STEP) {
    update(STEP);
    accumulator -= STEP;
  }
  draw();
  requestAnimationFrame(frame);
}

nextButton.addEventListener('click', goNext);
startOverButton.addEventListener('click', startOver);
startLevel(level.index);
requestAnimationFrame(frame);
