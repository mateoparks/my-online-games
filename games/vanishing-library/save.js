// Saving: three localStorage slots, the versioned save schema (migrations plus
// default-filling for fields later items add), save points, earning (which
// autosaves), fainting and respawn. README "Saving".
(() => {
  VL.SLOT_COUNT = 3;
  VL.STORAGE_PROBE_KEY = 'vanishing-library-probe';
  VL.slotKey = (slot) => `vanishing-library-slot-${slot + 1}`;

  VL.extendGame('save', () => ({ savePoint: null, finished: false }));

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
  VL.createStorage = function createStorage(backing) {
    const store = attempt(() => (typeof backing === 'function' ? backing() : backing), null);
    const ok = Boolean(store) && attempt(() => {
      store.setItem(VL.STORAGE_PROBE_KEY, '1');
      const read = store.getItem(VL.STORAGE_PROBE_KEY) === '1';
      store.removeItem(VL.STORAGE_PROBE_KEY);
      return read;
    }, false);
    return {
      ok,
      read: (key) => (ok ? attempt(() => store.getItem(key) ?? null, null) : null),
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
  const clone = (value) => (value === undefined ? null : JSON.parse(JSON.stringify(value)));
  const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

  VL.serializeSave = function serializeSave(state) {
    const save = { v: VL.saveVersion() };
    const skip = skipped();
    for (const [key, value] of Object.entries(state)) {
      if (!skip.has(key)) save[key] = clone(value);
    }
    return save;
  };

  // Saved values over the defaults, recursing into plain objects so a key
  // added inside an existing object (inventory.paper) gets its default too.
  function fill(defaults, saved) {
    if (!isPlainObject(defaults) || !isPlainObject(saved)) return saved === undefined ? defaults : saved;
    const out = { ...defaults };
    for (const [key, value] of Object.entries(saved)) out[key] = key in defaults ? fill(defaults[key], value) : value;
    return out;
  }

  // Migrates, fills defaults and validates; throws for anything damaged.
  function normalizeSave(raw) {
    if (!isPlainObject(raw) || !Number.isInteger(raw.v) || raw.v < 1) throw new Error('not a save');
    const migrated = VL.migrateSave(raw);
    if (typeof migrated.name !== 'string') throw new Error('save has no name');
    const fresh = VL.createGame({ name: migrated.name });
    const skip = skipped();
    const defaults = {};
    for (const key of Object.keys(fresh)) {
      if (!skip.has(key)) defaults[key] = fresh[key];
    }
    const save = { ...fill(defaults, migrated), v: migrated.v };
    if (!Number.isInteger(save.maxHp) || save.maxHp < 1) throw new Error('save has a bad maxHp');
    if (!isPlainObject(save.flags) || !isPlainObject(save.visited)) throw new Error('save has bad flags');
    return save;
  }

  // Where the hero reappears: the last save point touched, or the start when
  // there is none or a later map change removed its screen.
  VL.respawnPlace = function respawnPlace(state) {
    const point = state.savePoint;
    if (isPlainObject(point) && VL.screenExists(point.area, point.screen) && Number.isInteger(point.tx) && Number.isInteger(point.ty)) return point;
    return VL.START;
  };

  function stateFrom(save) {
    const { v, ...fields } = save;
    const state = Object.assign(VL.createGame({ name: save.name }), fields);
    state.hp = state.maxHp;
    VL.place(state, VL.respawnPlace(state));
    return state;
  }

  VL.restoreGame = (raw) => stateFrom(normalizeSave(raw));

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

  VL.readSlot = function readSlot(storage, slot) {
    const text = storage.read(VL.slotKey(slot));
    if (text === null || text === undefined) return { status: 'empty' };
    try {
      const save = normalizeSave(JSON.parse(text));
      return { status: 'ok', save, summary: VL.saveSummary(save) };
    } catch {
      return { status: 'damaged' };
    }
  };

  VL.saveSlot = (storage, slot, state) => storage.write(VL.slotKey(slot), JSON.stringify(VL.serializeSave(state)));

  VL.loadSlot = function loadSlot(storage, slot) {
    const read = VL.readSlot(storage, slot);
    return read.status === 'ok' ? stateFrom(read.save) : null;
  };

  VL.deleteSlot = (storage, slot) => storage.remove(VL.slotKey(slot));

  // ---------- earning, save points, fainting ----------

  // Anything the player earns (an item, a chest, a book, a flag) calls this;
  // the play scene saves before the next frame (design: Option B, Zelda-style).
  VL.earned = function earned(state) {
    state.dirty = true;
    state.events.push({ type: 'earned' });
  };

  VL.touchSavePoint = function touchSavePoint(state, place) {
    state.savePoint = { area: place.area, screen: place.screen, tx: place.tx, ty: place.ty, facing: place.facing || 'down' };
    VL.earned(state);
    state.events.push({ type: 'saved' });
  };

  VL.FAINT_LINES = {
    default: 'You fainted.',
    shrub: 'You were defeated by a shrub.',
  };

  VL.faintLine = (cause) => VL.FAINT_LINES[cause] || VL.FAINT_LINES.default;

  VL.addFaintLine = function addFaintLine(cause, line) {
    if (cause in VL.FAINT_LINES) throw new Error(`faint line ${cause} is already defined`);
    VL.FAINT_LINES[cause] = line;
  };

  VL.faint = function faint(state, cause = 'default') {
    state.hp = 0;
    state.fainted = { cause };
    state.events.push({ type: 'faint', cause });
  };

  // Dying only resets position: full hearts, back at the save point, everything kept.
  VL.respawn = function respawn(state) {
    state.hp = state.maxHp;
    state.fainted = null;
    state.transition = null;
    state.player.moving = false;
    VL.place(state, VL.respawnPlace(state));
  };
})();
