// W21 sound: the named-effect API, gesture gating, missing WebAudio, the
// persisted mute toggle and its on-canvas indicator.
const assert = require('node:assert/strict');
const { test, loadGame, addFixtureWorld, playState, playApp, hold, fakeWindow, keyEvent } = require('./harness');

const STARTER = ['step', 'bump', 'swing', 'hit', 'hurt', 'pickup', 'shell', 'door', 'popup', 'menuMove', 'menuSelect', 'faint', 'cluck'];
const MUTE_KEY = 'vanishing-library-muted';

// A strict stand-in for the WebAudio graph. It throws where a real browser
// throws (a ramp to 0, a bad time or oscillator type, a node started twice) so
// the recipes are checked in node, and it records what was played.
function fakeAudio({ state = 'running', resume } = {}) {
  const log = { contexts: 0, sources: [], resumes: 0 };
  const finite = (value, what) => {
    if (!Number.isFinite(value)) throw new TypeError(`${what} is not finite: ${value}`);
  };
  function param(name, value) {
    return {
      value,
      events: [],
      setValueAtTime(v, t) {
        finite(v, `${name} value`);
        finite(t, `${name} time`);
        if (t < 0) throw new RangeError(`${name} time < 0`);
        this.events.push(['set', v, t]);
      },
      linearRampToValueAtTime(v, t) {
        finite(v, `${name} value`);
        finite(t, `${name} time`);
        this.events.push(['linear', v, t]);
      },
      exponentialRampToValueAtTime(v, t) {
        finite(t, `${name} time`);
        if (!(v > 0 || v < 0)) throw new RangeError(`${name}: exponential ramp to ${v}`);
        this.events.push(['exp', v, t]);
      },
      setTargetAtTime(v, t, k) {
        finite(v, `${name} value`);
        finite(t, `${name} time`);
        finite(k, `${name} constant`);
        this.events.push(['target', v, t]);
      },
      cancelScheduledValues() {},
    };
  }
  function node(kind, ctx, params = {}) {
    const n = {
      kind,
      outputs: [],
      connect(target) {
        if (!target || !target.kind) throw new TypeError('connect to a non-node');
        this.outputs.push(target);
        return target;
      },
      disconnect() {
        this.outputs = [];
      },
      ...params,
    };
    return n;
  }
  function source(kind, ctx, params) {
    const s = node(kind, ctx, {
      started: null,
      stopped: null,
      start(t = 0) {
        finite(t, 'start');
        if (this.started !== null) throw new Error('InvalidStateError: started twice');
        this.started = t;
      },
      stop(t = 0) {
        finite(t, 'stop');
        if (this.started === null) throw new Error('InvalidStateError: stop before start');
        this.stopped = t;
      },
      ...params,
    });
    log.sources.push(s);
    return s;
  }
  class AudioContext {
    constructor() {
      log.contexts += 1;
      log.context = this;
      this.state = state;
      this.currentTime = 0;
      this.sampleRate = 8000;
      this.destination = node('destination', this);
    }
    resume() {
      log.resumes += 1;
      if (resume) return resume(this);
      this.state = 'running';
      return Promise.resolve();
    }
    createGain() {
      return node('gain', this, { gain: param('gain', 1) });
    }
    createDynamicsCompressor() {
      return node('compressor', this, { threshold: param('threshold', -24), knee: param('knee', 30), ratio: param('ratio', 12), attack: param('attack', 0.003), release: param('release', 0.25) });
    }
    createBiquadFilter() {
      return node('filter', this, { type: 'lowpass', frequency: param('frequency', 350), Q: param('Q', 1) });
    }
    createOscillator() {
      const ctx = this;
      let type = 'sine';
      return source('oscillator', ctx, {
        frequency: param('frequency', 440),
        get type() {
          return type;
        },
        set type(value) {
          if (!['sine', 'square', 'sawtooth', 'triangle'].includes(value)) throw new TypeError(`bad oscillator type ${value}`);
          type = value;
        },
      });
    }
    createBuffer(channels, length, rate) {
      const data = new Float32Array(length);
      return { length, sampleRate: rate, numberOfChannels: channels, getChannelData: () => data };
    }
    createBufferSource() {
      return source('buffer', this, { buffer: null, loop: false });
    }
  }
  return { AudioContext, log };
}

// Does this node's output reach the speakers?
function reachesDestination(n, seen = new Set()) {
  if (n.kind === 'destination') return true;
  if (seen.has(n)) return false;
  seen.add(n);
  return n.outputs.some((next) => reachesDestination(next, seen));
}

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = String(value);
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

// A loaded game with sound installed on a window that has WebAudio, already
// unlocked by a key press unless `gesture: false`.
function soundGame({ gesture = true, storage = memoryStorage(), audio = fakeAudio() } = {}) {
  const game = loadGame();
  const win = fakeWindow({ AudioContext: audio.AudioContext, localStorage: storage });
  game.VL.SOUND.install(win);
  if (gesture) win.dispatch('keydown', keyEvent('ArrowRight'));
  return { ...game, win, storage, log: audio.log };
}

const played = (log) => log.sources.filter((s) => s.started !== null).length;

// ---------- the named-effect API ----------

test('the starter set of effects is defined and VL.sfx plays each one', () => {
  const { VL, log } = soundGame();
  for (const name of STARTER) assert.ok(VL.SOUND.EFFECTS[name], `${name} is defined`);
  for (const name of STARTER) {
    const before = played(log);
    assert.equal(VL.sfx(name), true, `${name} plays`);
    assert.ok(played(log) > before, `${name} started a source`);
  }
});

test('every voice of every effect is a valid WebAudio graph that stops and reaches the speakers', () => {
  const { VL, log } = soundGame();
  for (const name of Object.keys(VL.SOUND.EFFECTS)) {
    log.context.currentTime += 1;
    const from = log.sources.length;
    VL.sfx(name);
    const sources = log.sources.slice(from);
    assert.ok(sources.length > 0, name);
    for (const s of sources) {
      assert.ok(s.started >= log.context.currentTime, `${name} starts now or later`);
      assert.ok(s.stopped > s.started && s.stopped < s.started + 3, `${name} stops within 3 s`);
      assert.ok(reachesDestination(s), `${name} is connected to the destination`);
    }
  }
});

test('effects stay gentle: a master volume below 0.4 and every voice at most full scale', () => {
  const { VL } = soundGame();
  assert.ok(VL.TUNING.soundVolume > 0 && VL.TUNING.soundVolume < 0.4);
  for (const [name, effect] of Object.entries(VL.SOUND.EFFECTS)) {
    for (const voice of effect.voices) {
      assert.ok(voice.vol > 0 && voice.vol <= 1, `${name} voice volume ${voice.vol}`);
      assert.ok(voice.dur > 0 && voice.dur <= 1.5, `${name} voice length ${voice.dur}`);
    }
  }
});

// The loudest moment of an effect: the largest sum of voice volumes that sound
// at the same time, times the master volume. Today's loudest is pickup's ~0.21.
test('effects stay gentle: overlapping voices never add up past half scale', () => {
  const { VL } = soundGame();
  for (const [name, effect] of Object.entries(VL.SOUND.EFFECTS)) {
    let loudest = 0;
    for (const voice of effect.voices) {
      const at = voice.at || 0;
      const together = effect.voices.filter((other) => (other.at || 0) <= at && at < (other.at || 0) + other.dur);
      loudest = Math.max(loudest, together.reduce((sum, other) => sum + other.vol, 0));
    }
    assert.ok(loudest * VL.TUNING.soundVolume <= 0.5, `${name} peaks at ${loudest} x ${VL.TUNING.soundVolume}`);
  }
  VL.defineSfx('tooLoud', [1, 2, 3].map(() => ({ wave: 'square', freq: 440, dur: 0.2, vol: 1 })));
  const effect = VL.SOUND.EFFECTS.tooLoud;
  assert.ok(effect.voices.reduce((sum, voice) => sum + voice.vol, 0) * VL.TUNING.soundVolume > 0.5, 'the check would catch a stack');
});

test('an unknown effect name is a programming error; a duplicate definition too', () => {
  const { VL } = loadGame();
  assert.throws(() => VL.sfx('swnig'), /unknown sound effect swnig/);
  assert.throws(() => VL.defineSfx('swing', [{ wave: 'sine', freq: 440, dur: 0.1, vol: 0.5 }]), /sound effect swing is already defined/);
  assert.throws(() => VL.defineSfx('silent', []), /needs at least one voice/);
  assert.throws(() => VL.defineSfx('kazoo', [{ wave: 'kazoo', freq: 440, dur: 0.1, vol: 0.5 }]), /wave kazoo/);
});

test('a later file can define its own effect and play it', () => {
  const { VL, log } = soundGame();
  VL.defineSfx('splash', [{ wave: 'noise', dur: 0.2, vol: 0.4, filter: { type: 'lowpass', freq: 1200, to: 300 } }]);
  assert.equal(VL.sfx('splash'), true);
  assert.equal(played(log), 1);
});

test('the same effect does not stack within its gap; a different one still plays', () => {
  const { VL, log } = soundGame();
  assert.equal(VL.sfx('menuMove'), true);
  assert.equal(VL.sfx('menuMove'), false, 'same instant');
  assert.equal(VL.sfx('menuSelect'), true);
  log.context.currentTime += 0.5;
  assert.equal(VL.sfx('menuMove'), true, 'after the gap');
});

// ---------- gesture gating (browser autoplay rules) ----------

test('no AudioContext exists until a user gesture, and nothing plays before it', () => {
  const { VL, win, log } = soundGame({ gesture: false });
  assert.equal(log.contexts, 0);
  assert.equal(VL.sfx('swing'), false);
  assert.equal(log.contexts, 0, 'playing does not create a context');
  win.dispatch('keydown', keyEvent('Escape'));
  assert.equal(log.contexts, 0, 'Escape is not a user activation in browsers');
  win.dispatch('pointerdown', { pointerType: 'mouse' });
  assert.equal(log.contexts, 1);
  assert.equal(VL.sfx('swing'), true);
  win.dispatch('keydown', keyEvent('ArrowLeft'));
  win.dispatch('touchend', {});
  assert.equal(log.contexts, 1, 'one context for the page');
});

test('every activation event unlocks: key, mouse, pointer, touch end, click', () => {
  const events = [
    ['keydown', keyEvent('KeyS')], ['mousedown', {}], ['pointerdown', { pointerType: 'mouse' }],
    ['pointerup', { pointerType: 'touch' }], ['pointerup', { pointerType: 'pen' }], ['touchend', {}], ['click', {}],
  ];
  for (const [type, event] of events) {
    const { VL, win, log } = soundGame({ gesture: false });
    win.dispatch(type, event);
    assert.equal(log.contexts, 1, `${type} ${event.pointerType || ''}`);
    assert.equal(VL.sfx('pickup'), true, type);
  }
});

test('a touch pointerdown or a mouse pointerup is not an activation, so no context is made on it', () => {
  for (const [type, pointerType] of [['pointerdown', 'touch'], ['pointerdown', 'pen'], ['pointerup', 'mouse']]) {
    const { win, log } = soundGame({ gesture: false });
    win.dispatch(type, { pointerType });
    assert.equal(log.contexts, 0, `${type} ${pointerType}`);
  }
});

test('a suspended context is resumed on the next gesture and plays once running', () => {
  const audio = fakeAudio({ state: 'suspended', resume: () => Promise.resolve() });
  const { VL, win, log } = soundGame({ audio });
  assert.equal(log.resumes, 1, 'resumed on the unlocking gesture');
  assert.equal(VL.sfx('hit'), false, 'a suspended context does not queue sounds');
  win.dispatch('keydown', keyEvent('KeyS'));
  assert.equal(log.resumes, 2);
  log.context.state = 'running';
  assert.equal(VL.sfx('hit'), true);
});

test('an interrupted context (Safari, after a call) is resumed too; a closed one is left alone', () => {
  const audio = fakeAudio({ state: 'interrupted' });
  const { win, log } = soundGame({ audio });
  assert.equal(log.resumes, 1);
  log.context.state = 'closed';
  win.dispatch('keydown', keyEvent('KeyS'));
  assert.equal(log.resumes, 1);
});

test('a re-install starts every effect gap afresh on the new context clock', () => {
  const { VL, log } = soundGame();
  log.context.currentTime = 50;
  assert.equal(VL.sfx('menuMove'), true);
  const audio = fakeAudio();
  const win = fakeWindow({ AudioContext: audio.AudioContext, localStorage: memoryStorage() });
  VL.SOUND.install(win);
  win.dispatch('keydown', keyEvent('ArrowRight'));
  assert.equal(VL.sfx('menuMove'), true, 'the old clock time does not hold the effect back');
});

test('a rejected resume is swallowed, not an unhandled rejection', () => {
  let caught = 0;
  const audio = fakeAudio({
    state: 'suspended',
    resume: () => ({ then: () => ({ catch: () => { caught += 1; } }), catch: () => { caught += 1; } }),
  });
  soundGame({ audio });
  assert.equal(caught, 1);
});

// ---------- missing WebAudio ----------

test('without WebAudio (node vm, old browsers) everything is a quiet no-op', () => {
  const { VL, window } = loadGame();
  assert.equal(window.AudioContext, undefined);
  window.dispatch('keydown', keyEvent('ArrowUp'));
  for (const name of STARTER) assert.equal(VL.sfx(name), false);
  assert.equal(VL.SOUND.available(), false);
  VL.SOUND.toggleMute();
  assert.equal(VL.SOUND.muted, true, 'the mute toggle still works');
});

test('the prefixed webkitAudioContext is used when AudioContext is missing', () => {
  const audio = fakeAudio();
  const { VL } = loadGame();
  const win = fakeWindow({ webkitAudioContext: audio.AudioContext });
  VL.SOUND.install(win);
  win.dispatch('click', {});
  assert.equal(audio.log.contexts, 1);
  assert.equal(VL.sfx('door'), true);
});

test('a throwing AudioContext constructor or node never reaches the game', () => {
  const { VL } = loadGame();
  const win = fakeWindow({
    AudioContext: class {
      constructor() {
        throw new Error('NotAllowedError');
      }
    },
  });
  VL.SOUND.install(win);
  assert.doesNotThrow(() => win.dispatch('keydown', keyEvent('KeyS')));
  assert.equal(VL.sfx('swing'), false);
  assert.equal(VL.SOUND.available(), false);

  const broken = soundGame();
  broken.log.context.createOscillator = () => {
    throw new Error('boom');
  };
  assert.doesNotThrow(() => broken.VL.sfx('pickup'));
  assert.equal(broken.VL.sfx('menuSelect'), false);
});

test('the game loop runs with sound in the pipeline and no WebAudio', () => {
  const { VL } = loadGame();
  addFixtureWorld(VL);
  const state = playState(VL, { area: 'test', screen: '0,1', tx: 5, ty: 3 });
  assert.doesNotThrow(() => hold(VL, state, ['left'], 1));
});

// ---------- the mute toggle ----------

test('N toggles mute, persisted under vanishing-library-muted', () => {
  const { VL, win, storage, log } = soundGame();
  assert.equal(VL.SOUND.muted, false);
  const press = keyEvent('KeyN');
  win.dispatch('keydown', press);
  assert.equal(VL.SOUND.muted, true);
  assert.equal(storage.data[MUTE_KEY], '1');
  assert.equal(press.prevented, true);
  const before = played(log);
  assert.equal(VL.sfx('swing'), false, 'muted effects do not play');
  assert.equal(played(log), before);
  log.context.currentTime += 1;
  win.dispatch('keydown', keyEvent('KeyN'));
  assert.equal(VL.SOUND.muted, false);
  assert.equal(storage.data[MUTE_KEY], '0');
  assert.ok(played(log) > before, 'unmuting plays a confirmation');
});

test('the saved mute is read back on the next page load', () => {
  const storage = memoryStorage({ [MUTE_KEY]: '1' });
  const { VL, log } = soundGame({ storage });
  assert.equal(VL.SOUND.muted, true);
  assert.equal(VL.sfx('pickup'), false);
  assert.equal(played(log), 0);
  const fresh = soundGame({ storage: memoryStorage({ [MUTE_KEY]: '0' }) });
  assert.equal(fresh.VL.SOUND.muted, false);
});

test('mute silences sounds already playing through the master gain', () => {
  const { VL, log } = soundGame();
  VL.sfx('faint');
  const master = log.sources[0].outputs[0];
  const gains = [];
  for (let n = master; n && n.kind !== 'destination'; n = n.outputs[0]) if (n.kind === 'gain') gains.push(n);
  VL.SOUND.setMuted(true);
  const masterGain = gains.at(-1).gain.events.at(-1);
  assert.equal(masterGain[1], 0);
  VL.SOUND.setMuted(false);
  assert.equal(gains.at(-1).gain.events.at(-1)[1], VL.TUNING.soundVolume);
});

test('blocked storage: mute still toggles in memory and nothing throws', () => {
  const { VL } = loadGame();
  const win = fakeWindow();
  Object.defineProperty(win, 'localStorage', {
    get() {
      throw new Error('SecurityError');
    },
  });
  assert.doesNotThrow(() => VL.SOUND.install(win));
  assert.equal(VL.SOUND.muted, false);
  assert.doesNotThrow(() => win.dispatch('keydown', keyEvent('KeyN')));
  assert.equal(VL.SOUND.muted, true);

  const { VL: VL2 } = loadGame();
  const full = fakeWindow({ localStorage: { getItem: () => '1', setItem: () => { throw new Error('QuotaExceededError'); } } });
  VL2.SOUND.install(full);
  assert.equal(VL2.SOUND.muted, true);
  assert.doesNotThrow(() => VL2.SOUND.toggleMute());
  assert.equal(VL2.SOUND.muted, false);
});

test('the mute key leaves chords, repeats, form fields and on-canvas text entry alone', () => {
  const { VL, win } = soundGame();
  win.dispatch('keydown', keyEvent('KeyN', { metaKey: true }));
  win.dispatch('keydown', keyEvent('KeyN', { ctrlKey: true }));
  win.dispatch('keydown', keyEvent('KeyN', { repeat: true }));
  win.dispatch('keydown', keyEvent('KeyN', { target: { tagName: 'INPUT' } }));
  assert.equal(VL.SOUND.muted, false);
  // A scene that types text (name entry) marks itself; N is then a letter.
  VL.app = { scene: { textEntry: true } };
  const typed = keyEvent('KeyN');
  win.dispatch('keydown', typed);
  assert.equal(VL.SOUND.muted, false);
  assert.equal(typed.prevented, false);
  VL.app = { scene: {} };
  win.dispatch('keydown', keyEvent('KeyN'));
  assert.equal(VL.SOUND.muted, true);
});

test('the key name works as a fallback for browsers without event.code', () => {
  const { VL, win } = soundGame();
  win.dispatch('keydown', { key: 'N', repeat: false, preventDefault() {} });
  assert.equal(VL.SOUND.muted, true);
});

test('N is not one of the game controls', () => {
  const { VL } = loadGame();
  assert.equal(VL.KEYS.KeyN, undefined);
  assert.equal(VL.KEY_NAMES.n, undefined);
  assert.equal(VL.SOUND.MUTE_CODE, 'KeyN');
});

// ---------- game events ----------

test('stepping on a door plays the door sound', () => {
  const { VL, log } = soundGame();
  addFixtureWorld(VL);
  const state = playState(VL, { area: 'test', screen: '0,1', tx: 5, ty: 3 });
  hold(VL, state, ['left'], 0.6);
  assert.equal(state.player.area, 'room');
  assert.ok(log.sources.some((s) => s.effect === 'door'), 'door sound played');
});

test('walking into a wall bumps once per contact, not every step', () => {
  const { VL, log } = soundGame();
  addFixtureWorld(VL);
  const state = playState(VL, { area: 'test', screen: '0,0', tx: 2, ty: 2 });
  const bumps = () => new Set(log.sources.filter((s) => s.effect === 'bump').map((s) => s.started)).size;
  hold(VL, state, ['left'], 1);
  log.context.currentTime += 2;
  hold(VL, state, ['left'], 1);
  assert.equal(bumps(), 1, 'held against the wall');
  hold(VL, state, [], 0.1);
  log.context.currentTime += 2;
  hold(VL, state, ['left'], 0.2);
  assert.equal(bumps(), 2, 'a new push');
  hold(VL, state, ['right'], 0.3);
  assert.equal(bumps(), 2, 'walking freely is silent');
});

test('other files map their own game events to effects', () => {
  const { VL, log } = soundGame();
  addFixtureWorld(VL);
  VL.SOUND.onEvent('chestOpened', 'pickup');
  VL.SOUND.onEvent('coin', (event) => (event.whole ? 'shell' : null));
  assert.throws(() => VL.SOUND.onEvent('chestOpened', 'shell'), /already has a sound/);
  assert.throws(() => VL.SOUND.onEvent('typo', 'pikcup'), /unknown sound effect pikcup/);
  VL.defineSystem('emitter', { order: 50, update: (state) => state.events.push({ type: 'chestOpened' }, { type: 'coin', whole: false }) });
  const state = playState(VL, { area: 'test', screen: '0,0', tx: 8, ty: 2 });
  VL.updateWorld(state, VL.noActions(), 1 / 60);
  assert.deepEqual([...new Set(log.sources.map((s) => s.effect))], ['pickup']);
});

// ---------- on the canvas ----------

function spyArt(VL) {
  const seen = { sprites: [], text: [] };
  const { drawSprite, text } = VL.ART;
  VL.ART.drawSprite = (ctx, id, ...rest) => {
    seen.sprites.push(id);
    return drawSprite(ctx, id, ...rest);
  };
  VL.ART.text = (ctx, str, ...rest) => {
    seen.text.push(str);
    return text(ctx, str, ...rest);
  };
  return seen;
}

test('while muted a crossed-out speaker shows over every scene', () => {
  const { VL, document } = soundGame();
  const app = playApp(VL);
  const ctx = document.createElement('canvas').getContext('2d');
  const seen = spyArt(VL);
  VL.render(ctx, app, 0);
  assert.ok(!seen.sprites.includes('icon-sound-off'), 'nothing while sound is on');
  VL.SOUND.setMuted(true);
  VL.render(ctx, app, 100);
  assert.ok(seen.sprites.includes('icon-sound-off'));
  app.setScene('artSheet', { page: 0 });
  seen.sprites.length = 0;
  VL.render(ctx, app, 101);
  assert.ok(seen.sprites.includes('icon-sound-off'), 'not only in play');
});

test('toggling shows a short on-canvas note naming the key, then it goes away', () => {
  const { VL, win, document } = soundGame();
  const app = playApp(VL);
  const ctx = document.createElement('canvas').getContext('2d');
  const seen = spyArt(VL);
  win.dispatch('keydown', keyEvent('KeyN'));
  VL.render(ctx, app, 50);
  assert.ok(seen.text.includes(VL.SOUND.NOTE.off), 'shown on the first frame after the toggle');
  seen.text.length = 0;
  VL.render(ctx, app, 51.4);
  assert.ok(seen.text.includes(VL.SOUND.NOTE.off), 'still shown');
  seen.text.length = 0;
  VL.render(ctx, app, 51.6);
  assert.ok(!seen.text.includes(VL.SOUND.NOTE.off), 'gone after 1.5 s');
  win.dispatch('keydown', keyEvent('KeyN'));
  VL.render(ctx, app, 60);
  assert.ok(seen.text.includes(VL.SOUND.NOTE.on));
});

test('the note sits in the HUD strip between the shell count and the hand slots, off the play field', () => {
  const { VL, win, document } = soundGame();
  const app = playApp(VL);
  const ctx = document.createElement('canvas').getContext('2d');
  const drawn = [];
  const { text } = VL.ART;
  VL.ART.text = (c, str, x, y, ...rest) => {
    if (Object.values(VL.SOUND.NOTE).includes(str)) drawn.push({ str, x, y });
    return text(c, str, x, y, ...rest);
  };
  const layout = VL.ART.HUD_LAYOUT;
  const shellsEnd = layout.shellX + 10 + VL.ART.measureText('000', 'normal');
  for (const muted of [true, false]) {
    win.dispatch('keydown', keyEvent('KeyN'));
    assert.equal(VL.SOUND.muted, muted);
    drawn.length = 0;
    VL.render(ctx, app, muted ? 10 : 20);
    assert.equal(drawn.length, 1);
    const [{ str, x, y }] = drawn;
    assert.ok(y >= 0 && y + VL.ART.lineHeight('normal') <= VL.TUNING.hudHeight, `inside the HUD strip: ${y}`);
    assert.ok(x > shellsEnd + 1 && x + VL.ART.measureText(str, 'normal') < layout.slots[0].x - 1, `between the shells and the slots: ${x}`);
  }
});

test('the note text fits the font and names the N key', () => {
  const { VL } = loadGame();
  for (const note of Object.values(VL.SOUND.NOTE)) {
    assert.deepEqual([...VL.ART.missingGlyphs(note, 'normal')], [], note);
    assert.match(note, /\bN\b/);
  }
});
