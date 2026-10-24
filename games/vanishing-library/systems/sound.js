// Sound: small synthesized WebAudio effects (no audio files), played by name
// with VL.sfx('swing'), and the N mute toggle with its on-canvas indicator.
// How to add effects and map game events: README.md "Sound".
(() => {
  VL.tune({ soundVolume: 0.22 });

  const MUTE_STORAGE = 'vanishing-library-muted';
  const WAVES = ['sine', 'square', 'sawtooth', 'triangle', 'noise'];
  // Events that count as user activation for autoplay. touchstart and Escape
  // do not, and creating a context on them only earns a console warning.
  const GESTURES = ['keydown', 'mousedown', 'pointerdown', 'pointerup', 'touchend', 'click'];
  const NOTE_SECONDS = 1.5;
  const SILENT = 0.0001; // exponential ramps cannot reach 0

  const EFFECTS = {};
  const EVENT_SOUNDS = {};
  let audio = { win: null, Context: null, context: null, master: null, noise: null, failed: false, storage: null };
  let note = null;

  VL.SOUND = {
    EFFECTS,
    MUTE_CODE: 'KeyN',
    NOTE: { off: 'Sound off (N)', on: 'Sound on (N)' },
    muted: false,
  };

  // voices: [{ wave, freq, to, at, dur, vol, attack, filter: { type, freq, to, q } }]
  // in seconds and Hz; `to` slides the pitch (or filter) to that value by the end.
  VL.defineSfx = function defineSfx(name, voices, { gap = 0.04 } = {}) {
    if (EFFECTS[name]) throw new Error(`sound effect ${name} is already defined`);
    if (!voices.length) throw new Error(`sound effect ${name} needs at least one voice`);
    for (const voice of voices) {
      if (!WAVES.includes(voice.wave)) throw new Error(`sound effect ${name}: wave ${voice.wave}`);
    }
    EFFECTS[name] = { name, voices, gap, last: -Infinity };
  };

  function effect(name) {
    const found = EFFECTS[name];
    if (!found) throw new Error(`unknown sound effect ${name}`);
    return found;
  }

  function noiseBuffer(ctx) {
    if (!audio.noise) {
      const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      audio.noise = buffer;
    }
    return audio.noise;
  }

  function ramp(param, from, to, start, end) {
    param.setValueAtTime(from, start);
    if (to && to !== from) param.exponentialRampToValueAtTime(to, end);
  }

  function playVoice(ctx, voice, now, name) {
    const start = now + (voice.at || 0);
    const end = start + voice.dur;
    const attack = Math.min(voice.attack || 0.005, voice.dur / 2);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(SILENT, start);
    gain.gain.exponentialRampToValueAtTime(voice.vol, start + attack);
    gain.gain.exponentialRampToValueAtTime(SILENT, end);
    gain.connect(audio.master);

    let source;
    if (voice.wave === 'noise') {
      source = ctx.createBufferSource();
      source.buffer = noiseBuffer(ctx);
      source.loop = true;
    } else {
      source = ctx.createOscillator();
      source.type = voice.wave;
      ramp(source.frequency, voice.freq, voice.to, start, end);
    }
    let head = gain;
    if (voice.filter) {
      const filter = ctx.createBiquadFilter();
      filter.type = voice.filter.type;
      filter.Q.setValueAtTime(voice.filter.q || 1, start);
      ramp(filter.frequency, voice.filter.freq, voice.filter.to, start, end);
      filter.connect(gain);
      head = filter;
    }
    source.connect(head);
    source.effect = name;
    source.start(start);
    source.stop(end + 0.02);
  }

  VL.sfx = function sfx(name) {
    const found = effect(name);
    const ctx = audio.context;
    if (VL.SOUND.muted || !ctx || ctx.state !== 'running') return false;
    try {
      const now = ctx.currentTime;
      if (now - found.last < found.gap) return false;
      found.last = now;
      for (const voice of found.voices) playVoice(ctx, voice, now, name);
      return true;
    } catch {
      // A half-built graph is dropped; sound is never worth stopping the game.
      return false;
    }
  };

  VL.SOUND.available = () => Boolean(audio.context);
  VL.SOUND.contextState = () => audio.context?.state || null;

  // Browsers only let a page start audio from a user gesture, so the context
  // is created on the first one and resumed on later ones if it was suspended.
  VL.SOUND.unlock = function unlock() {
    if (audio.failed || !audio.Context) return;
    try {
      if (!audio.context) {
        const ctx = new audio.Context();
        const master = ctx.createGain();
        master.gain.setValueAtTime(VL.SOUND.muted ? 0 : VL.TUNING.soundVolume, 0);
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.setValueAtTime(-18, 0);
        limiter.ratio.setValueAtTime(8, 0);
        master.connect(limiter);
        limiter.connect(ctx.destination);
        audio.context = ctx;
        audio.master = master;
      }
      if (audio.context.state === 'suspended') audio.context.resume()?.catch?.(() => {});
    } catch {
      audio.failed = true;
      audio.context = null;
    }
  };

  function readMuted(storage) {
    try {
      return storage?.getItem(MUTE_STORAGE) === '1';
    } catch {
      return false;
    }
  }

  VL.SOUND.setMuted = function setMuted(muted) {
    VL.SOUND.muted = muted;
    try {
      audio.storage?.setItem(MUTE_STORAGE, muted ? '1' : '0');
    } catch {
      // Storage full or blocked: the toggle still holds for this visit.
    }
    const ctx = audio.context;
    if (audio.master) {
      try {
        audio.master.gain.setTargetAtTime(muted ? 0 : VL.TUNING.soundVolume, ctx.currentTime, 0.01);
      } catch {
        // The next unlock or play starts from VL.SOUND.muted anyway.
      }
    }
  };

  // Also the entry point for a future on-screen (touch) mute button.
  VL.SOUND.toggleMute = function toggleMute() {
    VL.SOUND.setMuted(!VL.SOUND.muted);
    note = { text: VL.SOUND.muted ? VL.SOUND.NOTE.off : VL.SOUND.NOTE.on, from: null };
    if (!VL.SOUND.muted) VL.sfx('menuSelect');
  };

  function isMuteKey(event) {
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return false;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName)) return false;
    if (VL.app?.scene?.textEntry) return false;
    return event.code ? event.code === VL.SOUND.MUTE_CODE : (event.key || '').toLowerCase() === 'n';
  }

  // Sound listens to the window itself (not through Actions) so the mute works
  // on every scene, and so the context can start inside the gesture's handler.
  VL.SOUND.install = function install(win) {
    let storage = null;
    try {
      storage = win.localStorage || null;
    } catch {
      storage = null;
    }
    const mine = { win, Context: win.AudioContext || win.webkitAudioContext || null, context: null, master: null, noise: null, failed: false, storage };
    audio = mine;
    note = null;
    VL.SOUND.muted = readMuted(storage);
    for (const type of GESTURES) {
      win.addEventListener(type, (event) => {
        if (audio !== mine) return;
        if (type === 'keydown') {
          if (event.key === 'Escape') return;
          if (isMuteKey(event)) {
            event.preventDefault?.();
            VL.SOUND.unlock();
            VL.SOUND.toggleMute();
            return;
          }
        }
        VL.SOUND.unlock();
      });
    }
  };

  // Game logic stays silent: it pushes events, and this maps their types to effects.
  VL.SOUND.onEvent = function onEvent(type, sound) {
    if (EVENT_SOUNDS[type]) throw new Error(`event ${type} already has a sound`);
    if (typeof sound === 'string') effect(sound);
    EVENT_SOUNDS[type] = sound;
  };

  // ---------- the starter set ----------

  VL.defineSfx('step', [{ wave: 'noise', dur: 0.04, vol: 0.18, filter: { type: 'lowpass', freq: 900 } }], { gap: 0.12 });
  VL.defineSfx('bump', [
    { wave: 'triangle', freq: 150, to: 70, dur: 0.09, vol: 0.5 },
    { wave: 'noise', dur: 0.05, vol: 0.2, filter: { type: 'lowpass', freq: 500 } },
  ], { gap: 0.3 });
  VL.defineSfx('swing', [
    { wave: 'noise', dur: 0.14, vol: 0.4, attack: 0.02, filter: { type: 'bandpass', freq: 600, to: 2400, q: 1.5 } },
  ], { gap: 0.08 });
  VL.defineSfx('hit', [
    { wave: 'square', freq: 260, to: 90, dur: 0.1, vol: 0.28 },
    { wave: 'noise', dur: 0.07, vol: 0.3, filter: { type: 'lowpass', freq: 1800 } },
  ]);
  VL.defineSfx('hurt', [
    { wave: 'square', freq: 520, to: 200, dur: 0.16, vol: 0.25 },
    { wave: 'triangle', freq: 260, to: 120, dur: 0.2, vol: 0.4 },
  ], { gap: 0.2 });
  VL.defineSfx('pickup', [
    { wave: 'triangle', freq: 660, at: 0, dur: 0.07, vol: 0.5 },
    { wave: 'triangle', freq: 880, at: 0.06, dur: 0.07, vol: 0.5 },
    { wave: 'triangle', freq: 1320, at: 0.12, dur: 0.14, vol: 0.45 },
  ]);
  VL.defineSfx('shell', [
    { wave: 'sine', freq: 1568, at: 0, dur: 0.08, vol: 0.4 },
    { wave: 'sine', freq: 2093, at: 0.07, dur: 0.18, vol: 0.35 },
    { wave: 'triangle', freq: 1046, at: 0, dur: 0.12, vol: 0.2 },
  ]);
  VL.defineSfx('door', [
    { wave: 'triangle', freq: 120, to: 80, dur: 0.22, vol: 0.5 },
    { wave: 'noise', dur: 0.16, vol: 0.18, attack: 0.03, filter: { type: 'lowpass', freq: 380 } },
  ], { gap: 0.2 });
  VL.defineSfx('popup', [
    { wave: 'square', freq: 523, at: 0, dur: 0.07, vol: 0.16 },
    { wave: 'square', freq: 784, at: 0.07, dur: 0.12, vol: 0.16 },
  ]);
  VL.defineSfx('menuMove', [{ wave: 'square', freq: 880, dur: 0.035, vol: 0.12 }], { gap: 0.03 });
  VL.defineSfx('menuSelect', [
    { wave: 'square', freq: 660, at: 0, dur: 0.05, vol: 0.16 },
    { wave: 'square', freq: 990, at: 0.05, dur: 0.09, vol: 0.16 },
  ]);
  VL.defineSfx('faint', [
    { wave: 'triangle', freq: 523, at: 0, dur: 0.18, vol: 0.45 },
    { wave: 'triangle', freq: 392, at: 0.18, dur: 0.18, vol: 0.45 },
    { wave: 'triangle', freq: 330, at: 0.36, dur: 0.18, vol: 0.45 },
    { wave: 'triangle', freq: 262, to: 160, at: 0.54, dur: 0.6, vol: 0.45 },
  ], { gap: 1 });
  VL.defineSfx('cluck', [
    { wave: 'square', freq: 900, to: 480, dur: 0.05, vol: 0.14, filter: { type: 'bandpass', freq: 1200, q: 2 } },
    { wave: 'square', freq: 1100, to: 560, at: 0.08, dur: 0.07, vol: 0.14, filter: { type: 'bandpass', freq: 1300, q: 2 } },
  ], { gap: 0.25 });

  VL.SOUND.onEvent('door', 'door');

  // ---------- game events, and the wall bump ----------

  // Per game state, so a reload or a second app never inherits a contact.
  const contact = new WeakMap();

  function bumped(state) {
    const player = state.player;
    const last = contact.get(state);
    const still = Boolean(last && last.area === player.area && last.screen === player.screen && last.x === player.x && last.y === player.y);
    const pushing = player.moving && still;
    const bump = pushing && !last.pushing;
    contact.set(state, { area: player.area, screen: player.screen, x: player.x, y: player.y, pushing });
    return bump;
  }

  VL.defineSystem('sound', {
    order: 1000,
    update(state) {
      for (const event of state.events) {
        const sound = EVENT_SOUNDS[event.type];
        const name = typeof sound === 'function' ? sound(event, state) : sound;
        if (name) VL.sfx(name);
      }
      if (bumped(state)) VL.sfx('bump');
    },
  });

  // ---------- on the canvas ----------

  const speaker = ['....s....', '...ss....', 'sssss....', 'sssss....', 'sssss....', '...ss....', '....s....'];
  VL.ART.defineSprite('icon-sound', {
    outline: false,
    colors: { s: 'text', w: 'textDim' },
    rows: speaker.map((row, y) => row.slice(0, 6) + ['...', '.w.', 'w.w', 'w.w', 'w.w', '.w.', '...'][y]),
  });
  VL.ART.defineSprite('icon-sound-off', {
    outline: false,
    colors: { s: 'textDim', x: 'heart' },
    rows: speaker.map((row, y) => row.slice(0, 6) + ['...', '...', 'x.x', '.x.', 'x.x', '...', '...'][y]),
  });

  // In the HUD's gap between the shell count and the hand slots.
  const ICON = { x: 184, y: 4 };

  VL.SOUND.drawIndicator = function drawIndicator(ctx, app, t) {
    if (VL.SOUND.muted) VL.ART.drawSprite(ctx, 'icon-sound-off', ICON.x, ICON.y);
    if (!note) return;
    if (note.from === null) note.from = t;
    if (t - note.from > NOTE_SECONDS) {
      note = null;
      return;
    }
    const { width, hudHeight } = VL.TUNING;
    const w = VL.ART.measureText(note.text, 'normal') + 26;
    const x = width - w - 4;
    const y = hudHeight + 4;
    VL.ART.drawBox(ctx, x, y, w, 18);
    VL.ART.drawSprite(ctx, VL.SOUND.muted ? 'icon-sound-off' : 'icon-sound', x + 6, y + 5);
    VL.ART.text(ctx, note.text, x + 18, y + 5, { color: 'text' });
  };

  if (typeof window !== 'undefined' && window.addEventListener) VL.SOUND.install(window);
})();
