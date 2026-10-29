// Saving: three localStorage slots, the versioned save schema (migrations plus
// default-filling for fields later items add), and the save itself: only a
// lantern, Save & Quit and the credits save, and fainting goes back to the
// last save (W44). README "Saving".
(() => {
  VL.SLOT_COUNT = 3;
  VL.STORAGE_PROBE_KEY = 'vanishing-library-probe';
  VL.slotKey = (slot) => `vanishing-library-slot-${slot + 1}`;

  VL.extendGame('save', () => ({ savePoint: null, finished: false }));
  // The last save as written (or about to be), kept in play so a faint can go
  // back to it even with storage off.
  VL.extendGame('lastSave', () => ({ lastSave: null }), { transient: true });

  // ---------- storage that never throws ----------

  const attempt = (fn, fallback) => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };

  // `backing` is a localStorage-like object, or a function returning one (the
  // window's getter can itself throw when storage is blocked). A write/read/
  // remove probe decides `ok` once; private windows that refuse writes count as off.
  // `read` is null for a missing key and undefined when the read itself failed.
  VL.createStorage = function createStorage(backing) {
    const store = attempt(() => (typeof backing === 'function' ? backing() : backing), null);
    const ok = Boolean(store) && attempt(() => {
      store.setItem(VL.STORAGE_PROBE_KEY, '1');
      const read = store.getItem(VL.STORAGE_PROBE_KEY) === '1';
      store.removeItem(VL.STORAGE_PROBE_KEY);
      return read;
    }, false);
    // A store that is full at boot fails the probe's write but still reads,
    // so the saves already there list (and continue) with saving off.
    const readable = ok || (Boolean(store) && attempt(() => {
      store.getItem(VL.STORAGE_PROBE_KEY);
      return true;
    }, false));
    return {
      ok,
      read: (key) => (readable ? attempt(() => store.getItem(key) ?? null, undefined) : null),
      write: (key, value) => ok && attempt(() => {
        store.setItem(key, value);
        return true;
      }, false),
      remove: (key) => {
        if (ok) attempt(() => store.removeItem(key));
      },
    };
  };

  // ---------- schema and migrations ----------

  // A save is the game's persistent fields plus `v`. Most additions need no
  // migration: a field missing from an older save takes its default from
  // createGame (nested objects included). A change of shape registers a
  // migration from its own file; versions are sequential, so two lanes
  // picking the same number fail loudly instead of both applying as "2".
  VL.MIGRATIONS = {};
  VL.saveVersion = () => 1 + Object.keys(VL.MIGRATIONS).length;

  VL.defineMigration = function defineMigration(toVersion, migrate) {
    const next = VL.saveVersion() + 1;
    if (toVersion !== next) {
      const taken = VL.MIGRATIONS[toVersion] ? ' (already defined)' : '';
      throw new Error(`save migration ${toVersion}: the next version is ${next}${taken}`);
    }
    VL.MIGRATIONS[toVersion] = migrate;
  };

  VL.migrateSave = function migrateSave(save) {
    const current = VL.saveVersion();
    if (save.v > current) throw new Error(`save version ${save.v} is newer than this game (${current})`);
    let out = save;
    for (let v = save.v + 1; v <= current; v += 1) out = { ...VL.MIGRATIONS[v](out), v };
    return out;
  };

  const skipped = () => new Set([...VL.TRANSIENT_FIELDS, 'hp']);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

  VL.serializeSave = function serializeSave(state) {
    const save = { v: VL.saveVersion() };
    const skip = skipped();
    for (const [key, value] of Object.entries(state)) {
      if (!skip.has(key) && value !== undefined) save[key] = clone(value);
    }
    return save;
  };

  // Saved values over the defaults, recursing into plain objects so a key
  // added inside an existing object (inventory.paper) gets its default too.
  // An object or array on one side and another kind on the other keeps the
  // default: one field reset beats a whole save shown as Damaged. Each reset's
  // path goes in `resets`, which the fixture test reads: a kind change needs
  // a migration (README). A null default takes any kind.
  const kindOf = (value) => (Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value);
  const structural = (value) => kindOf(value) === 'array' || kindOf(value) === 'object';

  function fill(defaults, saved, resets, path) {
    if (saved === undefined) return defaults;
    if (kindOf(defaults) !== 'null' && kindOf(defaults) !== kindOf(saved) && (structural(defaults) || structural(saved))) {
      resets.push(path);
      return defaults;
    }
    if (!isPlainObject(defaults)) return saved;
    const out = { ...defaults };
    for (const [key, value] of Object.entries(saved)) {
      out[key] = key in defaults ? fill(defaults[key], value, resets, path ? `${path}.${key}` : key) : value;
    }
    return out;
  }

  const isNewer = (raw) => isPlainObject(raw) && Number.isInteger(raw.v) && raw.v > VL.saveVersion();

  // Migrates, drops play state, fills defaults and validates; throws for anything damaged.
  function normalizeSave(raw) {
    if (!isPlainObject(raw) || !Number.isInteger(raw.v) || raw.v < 1) throw new Error('not a save');
    const migrated = { ...VL.migrateSave(raw) };
    if (typeof migrated.name !== 'string') throw new Error('save has no name');
    const fresh = VL.createGame({ name: migrated.name });
    const skip = skipped();
    const defaults = {};
    for (const key of Object.keys(fresh)) {
      if (!skip.has(key)) defaults[key] = fresh[key];
    }
    for (const key of skip) delete migrated[key];
    const resets = [];
    const save = { ...fill(defaults, migrated, resets, ''), v: migrated.v };
    if (!Number.isInteger(save.maxHp) || save.maxHp < 1) throw new Error('save has a bad maxHp');
    return { save, resets };
  }

  // Where the hero wakes: the save's place, or the start when there is none
  // or a later map change removed its screen.
  VL.respawnPlace = function respawnPlace(state) {
    const point = state.savePoint;
    if (!(isPlainObject(point) && VL.screenExists(point.area, point.screen) && Number.isInteger(point.tx) && Number.isInteger(point.ty))) return VL.START;
    return point;
  };

  // `hook(state)` runs on every loaded game before he is placed.
  VL.LOAD_HOOKS = [];
  VL.onLoad = (hook) => VL.LOAD_HOOKS.push(hook);

  // He wakes standing still on his spot: a lantern under him saves again only
  // once he steps off it and back.
  function wakeOnSpot(state) {
    const { tx, ty } = VL.heroTile(state);
    state.room.standingOn = state.room.entities.find((e) => e.x === tx && e.y === ty && VL.ENTITIES[e.type]?.onStand) || null;
  }

  function stateFrom(save) {
    const { v, ...fields } = clone(save);
    const state = Object.assign(VL.createGame({ name: save.name }), fields);
    for (const hook of VL.LOAD_HOOKS) hook(state);
    state.hp = state.maxHp;
    VL.place(state, VL.respawnPlace(state));
    wakeOnSpot(state);
    state.lastSave = clone(save);
    return state;
  }

  VL.restoreGame = (raw) => stateFrom(normalizeSave(raw).save);

  // ---------- slots ----------

  // What a slot card shows. The file that owns the book count plugs it in once.
  const sources = { books: () => 0 };
  const plugged = new Set();

  VL.slotSource = function slotSource(name, read) {
    if (!(name in sources)) throw new Error(`no slot value ${name}`);
    if (plugged.has(name)) throw new Error(`slot value ${name} already has a source`);
    plugged.add(name);
    sources[name] = read;
  };

  VL.saveSummary = (save) => ({
    name: save.name,
    hearts: Math.ceil(save.maxHp / 2),
    books: sources.books(save),
    finished: Boolean(save.finished),
  });

  // `newer` is a save written by a newer page (a cached old page, or a class
  // laptop that has not reloaded): it is never damaged and is left alone.
  // `text` is the slot as read, so the title can tell when it changed since.
  VL.readSlot = function readSlot(storage, slot) {
    const text = storage.read(VL.slotKey(slot));
    if (text === null || text === undefined) return { status: 'empty', text: null };
    try {
      const raw = JSON.parse(text);
      if (isNewer(raw)) return { status: 'newer', v: raw.v, text };
      const { save, resets } = normalizeSave(raw);
      return { status: 'ok', save, resets, summary: VL.saveSummary(save), text };
    } catch {
      return { status: 'damaged', text };
    }
  };

  VL.saveSlot = (storage, slot, state) => storage.write(VL.slotKey(slot), JSON.stringify(VL.serializeSave(state)));

  VL.loadSlot = function loadSlot(storage, slot) {
    const read = VL.readSlot(storage, slot);
    if (read.status !== 'ok') return null;
    try {
      return stateFrom(read.save);
    } catch {
      return null;
    }
  };

  VL.deleteSlot = (storage, slot) => storage.remove(VL.slotKey(slot));

  // ---------- saving, fainting ----------

  // Saves the game as it is now, waking at `place` (the app writes it at the
  // end of the step, in whatever scene). Only a lantern, Save & Quit and the
  // credits call this (design: Starting and saving, W44).
  VL.saveGame = function saveGame(state, place) {
    state.savePoint = { area: place.area, screen: place.screen, tx: place.tx, ty: place.ty, facing: place.facing || 'down' };
    state.lastSave = VL.serializeSave(state);
    state.dirty = true;
    state.events.push({ type: 'saved' });
  };

  VL.touchSavePoint = (state, place) => VL.saveGame(state, place);

  // Where Save & Quit wakes him: on the lantern he stands on; else an area's
  // rule (VL.quitRule), or the tile he stands on when plain ground holds him
  // there after a reload; otherwise where he came onto this screen, or his
  // last save's place.
  const quitRules = {};
  VL.quitRule = (area, rule) => {
    if (quitRules[area]) throw new Error(`quit rule for ${area} is already defined`);
    quitRules[area] = rule;
  };

  VL.standsFirm = function standsFirm(state, place) {
    if (!place || !VL.screenExists(place.area, place.screen)) return false;
    const info = VL.tileInfo(place.area, VL.savedTile?.(state, place.area, place.screen, place.tx, place.ty) ?? VL.tileAt(place.area, place.screen, place.tx, place.ty));
    if (info.solid || info.hurts || info.pit) return false;
    return !VL.getScreen(place.area, place.screen).entities.some((e) => e.x === place.tx && e.y === place.ty && (e.solid || VL.ENTITIES[e.type]?.solid));
  };

  const busyHero = (player) => Boolean(player.flight || player.rope || player.knockback || player.lift);

  // { place, words }: words say where Continue starts ('right here', 'where
  // you came in', 'at your last save').
  VL.quitPlace = function quitPlace(state) {
    const player = state.player;
    const last = { place: VL.respawnPlace(state), words: 'at your last save' };
    const entry = state.room?.entry;
    const rule = quitRules[player.area];
    const lantern = state.room?.entities.find((e) => e.type === 'savePoint' && e === state.room.standingOn);
    if (lantern) return { place: { area: player.area, screen: player.screen, tx: lantern.x, ty: lantern.y, facing: player.facing }, words: 'right here' };
    if (rule === 'lastSave') return last;
    if (rule === 'entry') return VL.standsFirm(state, entry) ? { place: entry, words: 'where you came in' } : last;
    const here = { area: player.area, screen: player.screen, ...VL.heroTile(state), facing: player.facing };
    if (!busyHero(player) && VL.standsFirm(state, here)) return { place: here, words: 'right here' };
    if (VL.standsFirm(state, entry)) return { place: entry, words: 'where you came in' };
    return last;
  };

  // Where he came onto this screen, for VL.quitPlace.
  VL.onRoomBuilt((state) => {
    state.room.entry = { area: state.room.area, screen: state.room.screen, ...VL.heroTile(state), facing: state.player.facing };
  });

  VL.FAINT_LINES = {
    default: 'You fainted.',
    shrub: 'You were defeated by a shrub.',
  };

  VL.faintLine = (cause) => VL.FAINT_LINES[cause] || VL.FAINT_LINES.default;

  VL.addFaintLine = function addFaintLine(cause, line) {
    if (cause in VL.FAINT_LINES) throw new Error(`faint line ${cause} is already defined`);
    VL.FAINT_LINES[cause] = line;
  };

  VL.FAINT_HOOKS = [];
  VL.onFaint = function onFaint(hook) {
    VL.FAINT_HOOKS.push(hook);
  };

  VL.faint = function faint(state, cause = 'default') {
    state.hp = 0;
    state.fainted = { cause };
    state.events.push({ type: 'faint', cause });
    for (const hook of VL.FAINT_HOOKS) hook(state);
  };

  // A page reload that continues the same slot: only what was saved comes
  // back. `{ save: true }` saves first as Save & Quit would (the console's
  // shortcut, and the playthrough's drive.reload()).
  VL.reloadApp = function reloadApp(app, { save = false } = {}) {
    if (save && app.game) {
      VL.saveGame(app.game, VL.quitPlace(app.game).place);
      app.save();
    }
    const next = VL.createApp({ storage: app.storage });
    const game = app.slot === null ? null : VL.loadSlot(app.storage, app.slot);
    if (game) {
      next.startGame(game, app.slot);
      next.setScene('play');
    }
    return next;
  };

  // What a faint keeps although the save is older: `keep(fainted, woken)`
  // copies it across (a boss's hint is earned by fainting to it).
  VL.FAINT_KEEPS = [];
  VL.keepThroughFaint = (keep) => VL.FAINT_KEEPS.push(keep);

  // Fainting goes back to the last save: everything since is gone, and he
  // wakes at its place with full hearts. Nothing is written. A game with no
  // save yet (some tests) just wakes at its save point.
  VL.respawn = function respawn(state) {
    const save = state.lastSave;
    if (!save) {
      state.hp = state.maxHp;
      state.fainted = null;
      state.transition = null;
      state.player.moving = false;
      VL.place(state, VL.respawnPlace(state));
      return;
    }
    const fainted = { ...state };
    const woken = stateFrom(normalizeSave(save).save);
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, woken, { time: fainted.time });
    for (const keep of VL.FAINT_KEEPS) keep(fainted, state);
  };
})();
