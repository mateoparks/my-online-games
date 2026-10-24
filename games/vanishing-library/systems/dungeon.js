// The dungeon framework (design: The world, "Each dungeon has Zelda
// conventions"): dungeons made of rooms, small keys and locked doors per
// dungeon, the boss key, the dungeon map, push blocks, pressure plates,
// switches and shutters, entrance statues, the boss room and saved puzzle
// state. Entities live one per file in entities/; the map screen is
// scenes/dungeon-map.js. README "Dungeons".
(() => {
  VL.tune({ blockPushSeconds: 0.22, blockSlideSeconds: 0.18, dungeonMessageSeconds: 2 });

  // ---------- saved state ----------

  // Per dungeon: keys in hand, doors opened, plates latched, switches thrown,
  // the boss beaten, the map found. Every one is a permanent earning, so it
  // saves at once; room state (block positions, a held plate, a shutter
  // waiting on a fight) is the visit's and comes back fresh on re-entry.
  const freshDungeon = () => ({ keys: 0, bossKey: false, map: false, doors: {}, plates: {}, switches: {}, boss: false });
  VL.DUNGEONS = {};
  VL.extendGame('dungeons', () => ({
    dungeons: Object.fromEntries(Object.keys(VL.DUNGEONS).map((id) => [id, freshDungeon()])),
    // Tile changes that outlast the visit, keyed 'area:screen' then 'tx,ty'
    // (a lifted boulder, a dug hole W14 decides to keep, an opened path).
    tileChanges: {},
  }));

  VL.dungeonState = function dungeonState(state, id) {
    if (!VL.DUNGEONS[id]) throw new Error(`no dungeon ${id}`);
    return state.dungeons[id] || (state.dungeons[id] = freshDungeon());
  };

  // ---------- dungeons ----------

  // VL.defineDungeon('scriptorium', { area, name, entrance: Place (the tile
  // outside its door), boss: { screen, type, heart, warp: { tx, ty }, onDefeat },
  // light = 'indoor', allowFlyOver = false }). See README "Dungeons".
  VL.defineDungeon = function defineDungeon(id, def) {
    if (VL.DUNGEONS[id]) throw new Error(`dungeon ${id} is already defined`);
    const area = VL.AREAS[def.area];
    if (!area) throw new Error(`dungeon ${id}: no area ${def.area}`);
    if (Object.values(VL.DUNGEONS).some((other) => other.area === def.area)) throw new Error(`dungeon ${id}: area ${def.area} already belongs to a dungeon`);
    if (!def.entrance || !VL.screenExists(def.entrance.area, def.entrance.screen)) throw new Error(`dungeon ${id}: entrance must be a place on an existing screen`);
    // A carried chicken flies over flyOver tiles, so a gap a puzzle depends on
    // must not be one (README "Chickens"); a dungeon that wants water says so.
    const legend = VL.TILESETS[area.tileset];
    const flyOver = Object.keys(legend).filter((ch) => legend[ch].flyOver);
    if (flyOver.length && !def.allowFlyOver) throw new Error(`dungeon ${id}: tileset ${area.tileset} has flyOver tiles (${flyOver.join(' ')}); use pits, or pass allowFlyOver: true`);
    if (def.boss) {
      if (!VL.screenExists(def.area, def.boss.screen)) throw new Error(`dungeon ${id}: boss screen ${def.boss.screen} does not exist`);
      if (!VL.ENEMIES[def.boss.type]) throw new Error(`dungeon ${id}: boss ${def.boss.type} is not an enemy (VL.defineEnemy it first)`);
      if (!def.boss.heart) throw new Error(`dungeon ${id}: the boss needs a heart container id (boss.heart)`);
      if (!def.boss.warp) throw new Error(`dungeon ${id}: the boss room needs an exit warp (boss.warp: { tx, ty })`);
    }
    if (!VL.ART.AREA_LIGHT[def.area]) VL.ART.setAreaLight(def.area, def.light || 'indoor');
    VL.DUNGEONS[id] = { id, name: id, light: 'indoor', ...def };
    return VL.DUNGEONS[id];
  };

  VL.dungeonOf = function dungeonOf(state) {
    const area = state?.player?.area;
    return Object.values(VL.DUNGEONS).find((dungeon) => dungeon.area === area) || null;
  };

  VL.dungeonOfArea = (areaId) => Object.values(VL.DUNGEONS).find((dungeon) => dungeon.area === areaId) || null;

  // Keys never work in another dungeon: they are counted per dungeon, and an
  // entity in a dungeon's area only ever reads its own dungeon's count.
  const here = (state) => {
    const dungeon = VL.dungeonOf(state);
    if (!dungeon) throw new Error(`${state.player.area} is not a dungeon`);
    return dungeon;
  };
  VL.dungeonHere = (state) => VL.dungeonState(state, here(state).id);

  VL.giveSmallKey = function giveSmallKey(state, dungeonId, n = 1) {
    const d = VL.dungeonState(state, dungeonId);
    d.keys += n;
    VL.earned(state);
    state.events.push({ type: 'smallKey', dungeon: dungeonId, keys: d.keys });
  };

  VL.giveBossKey = function giveBossKey(state, dungeonId) {
    const d = VL.dungeonState(state, dungeonId);
    d.bossKey = true;
    VL.earned(state);
    state.events.push({ type: 'bossKey', dungeon: dungeonId });
  };

  VL.giveDungeonMap = function giveDungeonMap(state, dungeonId) {
    const d = VL.dungeonState(state, dungeonId);
    d.map = true;
    VL.earned(state);
    state.events.push({ type: 'dungeonMap', dungeon: dungeonId });
  };

  // A pickup found once at its tile (a key, the boss key, the map): gone from
  // this visit, remembered by its found flag, `apply` hands it over.
  VL.dungeonPickup = function dungeonPickup(state, entity, apply) {
    if (entity.hidden || VL.spotFound(state, entity.id)) return false;
    state.room.entities = state.room.entities.filter((e) => e !== entity);
    state.room.standingOn = null;
    VL.markFound(state, entity.id);
    apply(state, here(state).id);
    return true;
  };

  // ---------- doors ----------

  // Opens a locked door for good: a small key is spent with the door's flag in
  // the same step (both save together, so a reload can never keep one without
  // the other); the boss key is shown, not spent. Returns 'opened', 'open' or
  // 'locked'.
  VL.openLockedDoor = function openLockedDoor(state, door) {
    const d = VL.dungeonHere(state);
    if (door.open || d.doors[door.id]) {
      door.open = true;
      door.solid = false;
      return 'open';
    }
    if (door.kind === 'boss' ? !d.bossKey : d.keys <= 0) return 'locked';
    if (door.kind !== 'boss') d.keys -= 1;
    d.doors[door.id] = true;
    door.open = true;
    door.solid = false;
    VL.earned(state);
    state.events.push({ type: 'doorUnlocked', door: door.id, kind: door.kind });
    return 'opened';
  };

  // ---------- plates, switches, shutters ----------

  VL.throwSwitch = function throwSwitch(state, lever) {
    const d = VL.dungeonHere(state);
    if (lever.on || d.switches[lever.id]) {
      lever.on = true;
      return false;
    }
    d.switches[lever.id] = true;
    lever.on = true;
    VL.earned(state);
    state.events.push({ type: 'switchOn', switch: lever.id });
    return true;
  };

  const heroBoxOverlaps = (state, tx, ty) => {
    const { tile, heroBox } = VL.TUNING;
    const { x, y } = state.player;
    return x + heroBox.w / 2 > tx * tile && x - heroBox.w / 2 < (tx + 1) * tile
      && y + heroBox.h / 2 > ty * tile && y - heroBox.h / 2 < (ty + 1) * tile;
  };

  // Whether a plate is down now: latched for good, held by a block, or stood on.
  VL.plateDown = function plateDown(state, id) {
    const d = VL.dungeonHere(state);
    if (d.plates[id]) return true;
    const plate = state.room?.entities.find((e) => e.type === 'pressurePlate' && e.id === id);
    return Boolean(plate?.down);
  };

  VL.roomCleared = (state) => !state.room || !state.room.entities.some((e) => VL.isEnemy(e) && !e.boss);

  // A shutter's `open` condition (any field may be given; all must hold):
  // { cleared: true } every enemy in the room beaten this visit;
  // { plate: id } / { plates: [ids] } those plates down; { switch: id };
  // { flag: id } a saved flag; { bossBeaten: true }; { door: id } that door opened.
  VL.dungeonCondition = function dungeonCondition(state, cond, { room = state.room } = {}) {
    if (!cond) return true;
    const d = VL.dungeonHere(state);
    const checks = [];
    if (cond.cleared) checks.push(!room || !room.entities.some((e) => VL.isEnemy(e) && !e.boss));
    for (const id of [cond.plate, ...(cond.plates || [])].filter(Boolean)) checks.push(Boolean(d.plates[id]) || Boolean(room?.entities.find((e) => e.type === 'pressurePlate' && e.id === id)?.down));
    if (cond.switch) checks.push(Boolean(d.switches[cond.switch]));
    if (cond.flag) checks.push(Boolean(state.flags[cond.flag]));
    if (cond.bossBeaten) checks.push(Boolean(d.boss));
    if (cond.door) checks.push(Boolean(d.doors[cond.door]));
    return checks.every(Boolean);
  };

  // Closed and not under the hero: a shutter never shuts on the hero, so one
  // across a doorway closes behind him once he has walked in.
  function settleShutter(state, shutter) {
    const open = VL.dungeonCondition(state, shutter.open);
    if (open && shutter.closed !== false) {
      if (shutter.closed) state.events.push({ type: 'shutterOpen', shutter: shutter.id || null });
      shutter.closed = false;
    } else if (!open) {
      shutter.closed = true;
    }
    shutter.solid = shutter.closed && !heroBoxOverlaps(state, shutter.x, shutter.y);
  }

  function settlePlate(state, plate) {
    const hero = VL.heroTile(state);
    const held = state.room.entities.some((e) => e.type === 'pushBlock' && e.x === plate.x && e.y === plate.y);
    const stood = hero.tx === plate.x && hero.ty === plate.y;
    const d = VL.dungeonHere(state);
    const latched = Boolean(plate.id && d.plates[plate.id]);
    const down = latched || held || stood;
    if (down && !plate.down) state.events.push({ type: 'platePressed', plate: plate.id || null });
    plate.down = down;
    if (plate.latch && down && plate.id && !latched) {
      d.plates[plate.id] = true;
      VL.earned(state);
    }
  }

  // ---------- push blocks ----------

  const DIRS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

  // Where a block may go: open floor of this visit, no entity but a plate,
  // never the edge row or column (so a block can never wall off an exit).
  VL.blockCanMove = function blockCanMove(state, block, dx, dy) {
    const { cols, rows } = VL.TUNING;
    const tx = block.x + dx;
    const ty = block.y + dy;
    if (tx < 1 || ty < 1 || tx > cols - 2 || ty > rows - 2) return false;
    const { area, screen } = state.player;
    if (VL.tileInfo(area, VL.tileAt(area, screen, tx, ty, state.room)).solid) return false;
    return !state.room.entities.some((e) => e !== block && e.x === tx && e.y === ty && e.type !== 'pressurePlate');
  };

  VL.pushBlock = function pushBlock(state, block, dx, dy) {
    if (block.slide || (block.pushed && block.once !== false) || !VL.blockCanMove(state, block, dx, dy)) return false;
    block.x += dx;
    block.y += dy;
    block.pushed = true;
    block.slide = { dx, dy, t: 0 };
    state.events.push({ type: 'blockPushed', dx, dy });
    return true;
  };

  // The hero pushes by walking into a block: once flush against it for
  // blockPushSeconds, it slides a tile. A locked door he walks into is tried
  // with a key the same way (Zelda's "walk into it").
  function pushing(state, actions) {
    const player = state.player;
    const [dx, dy] = DIRS[player.facing] || DIRS.down;
    if (!actions.held[player.facing] || player.carrying || player.flight) return null;
    const { w, h } = VL.TUNING.heroBox;
    if (!VL.isBlocked(player.area, player.screen, player.x + dx * 0.5, player.y + dy * 0.5, w, h, state.room)) return null;
    const ahead = VL.facingTile(state);
    return { dx, dy, entity: state.room.entities.find((e) => e.x === ahead.tx && e.y === ahead.ty && (e.type === 'pushBlock' || e.type === 'lockedDoor')) || null };
  }

  function updateBlocks(state, actions, dt) {
    const push = pushing(state, actions);
    for (const e of state.room.entities) {
      if (e.type === 'pushBlock') {
        if (e.slide) {
          e.slide.t += dt;
          if (e.slide.t >= VL.TUNING.blockSlideSeconds) e.slide = null;
        }
        if (push?.entity === e) {
          e.pushT = (e.pushT || 0) + dt;
          if (e.pushT >= VL.TUNING.blockPushSeconds) {
            e.pushT = 0;
            VL.pushBlock(state, e, push.dx, push.dy);
          }
        } else e.pushT = 0;
      } else if (e.type === 'lockedDoor' && !e.open) {
        // One try per lean, and again when the keys in hand change.
        const d = VL.dungeonHere(state);
        const keys = `${d.keys}/${d.bossKey}`;
        if (push?.entity === e) {
          if (e.tried !== keys) {
            e.tried = keys;
            if (VL.openLockedDoor(state, e) === 'locked') VL.lockedDoorNote(state, e);
          }
        } else e.tried = null;
      }
    }
  }

  // Bumps, and says why once per visit of that door.
  VL.lockedDoorNote = function lockedDoorNote(state, door) {
    state.events.push({ type: 'doorLocked', door: door.id, kind: door.kind });
    if (door.told) return;
    door.told = true;
    state.dungeonNote = { text: door.kind === 'boss' ? 'The big lock needs the boss key.' : 'Locked. A small key would open it.', t: 0 };
  };

  // ---------- rooms ----------

  // Set up a fresh visit: saved tile changes, then every shutter, plate and
  // door settled from saved state, the boss room cleared or armed. Runs at
  // the start of the first step in a room, before movement, so collision
  // never sees a room the framework has not seen.
  function prepareRoom(state) {
    const room = state.room;
    room.dungeonReady = true;
    for (const [at, ch] of Object.entries(state.tileChanges[`${room.area}:${room.screen}`] || {})) room.tiles[at] = ch;
    const dungeon = VL.dungeonOf(state);
    if (!dungeon) return;
    const d = VL.dungeonState(state, dungeon.id);
    const boss = dungeon.boss;
    if (boss && room.screen === boss.screen) {
      if (d.boss) {
        room.entities = room.entities.filter((e) => e.type !== boss.type);
        bossRewards(state, dungeon);
      } else {
        for (const e of room.entities) if (e.type === boss.type) e.boss = true;
      }
    }
    settleRoom(state);
  }

  // The heart container where the boss stood on the map (until it is taken)
  // and the warp out, in the boss room of a beaten dungeon.
  function bossRewards(state, dungeon) {
    const room = state.room;
    const { boss } = dungeon;
    const stood = VL.getScreen(dungeon.area, boss.screen).entities.find((e) => e.type === boss.type) || { x: boss.warp.tx, y: boss.warp.ty - 1 };
    if (!VL.spotFound(state, boss.heart) && !room.entities.some((e) => e.type === 'heartContainer' && e.id === boss.heart)) {
      room.entities.push({ type: 'heartContainer', id: boss.heart, x: stood.x, y: stood.y });
    }
    if (room.entities.some((e) => e.type === 'warp')) return;
    const warp = { type: 'warp', x: boss.warp.tx, y: boss.warp.ty, to: dungeon.entrance };
    room.entities.push(warp);
    // A warp that opens under the hero waits for him to step off and back on.
    const hero = VL.heroTile(state);
    if (hero.tx === warp.x && hero.ty === warp.y) room.standingOn = warp;
  }

  function settleRoom(state) {
    for (const e of state.room.entities) {
      if (e.type === 'shutter') settleShutter(state, e);
      else if (e.type === 'pressurePlate') settlePlate(state, e);
      else if (e.type === 'lockedDoor' && !e.open && VL.dungeonHere(state).doors[e.id]) Object.assign(e, { open: true, solid: false });
      else if (e.type === 'switch' && VL.dungeonHere(state).switches[e.id]) e.on = true;
      else if (e.hidden && e.reveal === 'cleared' && VL.roomCleared(state)) {
        e.hidden = false;
        state.events.push({ type: 'revealed', id: e.id });
      }
    }
  }

  // Beaten for good: the heart container appears where the boss stood and
  // the way out opens (a warp to the entrance). The dungeon's own rewards
  // hang off boss.onDefeat (W14: the Mortar & Pestle and a bundle of books).
  VL.bossDefeated = function bossDefeated(state, dungeonId) {
    const dungeon = VL.DUNGEONS[dungeonId];
    const d = VL.dungeonState(state, dungeonId);
    if (d.boss) return false;
    d.boss = true;
    VL.earned(state);
    state.events.push({ type: 'bossDefeated', dungeon: dungeonId });
    const room = state.room;
    if (room && room.area === dungeon.area && room.screen === dungeon.boss.screen) bossRewards(state, dungeon);
    dungeon.boss.onDefeat?.(state);
    return true;
  };

  VL.bossBeaten = (state, dungeonId) => Boolean(VL.dungeonState(state, dungeonId).boss);

  // ---------- saved tile changes (for W14's boulders and anything else that outlasts a visit) ----------

  VL.saveTile = function saveTile(state, tx, ty, ch) {
    const { area, screen } = state.player;
    const key = `${area}:${screen}`;
    (state.tileChanges[key] || (state.tileChanges[key] = {}))[`${tx},${ty}`] = ch;
    if (state.room && state.room.area === area && state.room.screen === screen) VL.setRoomTile(state, tx, ty, ch);
    VL.earned(state);
  };

  VL.savedTile = (state, area, screen, tx, ty) => state.tileChanges[`${area}:${screen}`]?.[`${tx},${ty}`] ?? null;

  // ---------- systems ----------

  VL.defineSystem('dungeonRooms', {
    order: 5,
    update(state) {
      if (state.room && !state.room.dungeonReady) prepareRoom(state);
    },
  });

  VL.extendGame('dungeonNote', () => ({ dungeonNote: null }), { transient: true });

  VL.defineSystem('dungeon', {
    order: 40,
    update(state, actions, dt) {
      if (state.dungeonNote) {
        state.dungeonNote.t += dt;
        if (state.dungeonNote.t >= VL.TUNING.dungeonMessageSeconds) state.dungeonNote = null;
      }
      const dungeon = VL.dungeonOf(state);
      if (!dungeon) return;
      if (actions.pressed.map && state.hp > 0) VL.requestScene(state, 'dungeonMap');
      const room = state.room;
      if (!room.dungeonReady) prepareRoom(state);
      updateBlocks(state, actions, dt);
      for (const event of state.events) {
        if (event.type !== 'swing') continue;
        for (const lever of room.entities.filter((e) => e.type === 'switch')) {
          if (event.tiles.some(({ tx, ty }) => tx === lever.x && ty === lever.y)) VL.throwSwitch(state, lever);
        }
      }
      // The boss is beaten when it is gone from its room, however it fell
      // (a sword in the combat step, a thrown pot, a scene).
      if (dungeon.boss && room.screen === dungeon.boss.screen) {
        const alive = room.entities.some((e) => e.boss);
        if (alive) room.bossSeen = true;
        else if (room.bossSeen && !VL.dungeonState(state, dungeon.id).boss) VL.bossDefeated(state, dungeon.id);
      }
      settleRoom(state);
    },
  });

  // ---------- a dungeon's locks ----------

  // Progression (README "Progression"): a dungeon's small keys and locked
  // doors spend one counter, 'smallKey:<dungeon>', so W3's solver sees the
  // spending order. Every key pickup, boss key and locked door names its lock
  // (`lock: 'id'`), and this check keeps map and table in step. Returns the
  // problems; the test keeps it empty.
  VL.dungeonLockProblems = function dungeonLockProblems(locks = VL.LOCKS) {
    const problems = [];
    for (const dungeon of Object.values(VL.DUNGEONS)) {
      const counter = `smallKey:${dungeon.id}`;
      for (const [key, screen] of Object.entries(VL.AREAS[dungeon.area].screens)) {
        for (const e of screen.entities) {
          const where = `${dungeon.id} ${key} ${e.type} ${e.id || ''}`.trim();
          const expect = { smallKey: { supplies: counter }, bossKey: { gives: `bossKey:${dungeon.id}` }, lockedDoor: e.kind === 'boss' ? { needs: `bossKey:${dungeon.id}` } : { consumes: counter } }[e.type];
          if (!expect) continue;
          const lock = locks[e.lock];
          if (!e.lock || !lock) {
            problems.push(`${where} needs lock: '<id>' naming a lock in the table`);
            continue;
          }
          if (expect.supplies && !lock.supplies[expect.supplies]) problems.push(`${where}: lock ${e.lock} must supply { '${expect.supplies}': 1 }`);
          if (expect.consumes && !lock.consumes[expect.consumes]) problems.push(`${where}: lock ${e.lock} must consume { '${expect.consumes}': 1 }`);
          if (expect.gives && !lock.gives.includes(expect.gives) && lock.id !== expect.gives) problems.push(`${where}: lock ${e.lock} must give '${expect.gives}'`);
          if (expect.needs && !lock.needs.flat().includes(expect.needs)) problems.push(`${where}: lock ${e.lock} must need '${expect.needs}'`);
        }
      }
    }
    return problems;
  };

  // ---------- art shared by the entities ----------

  VL.ART.addColors({
    dgnStone: '#7d8291',
    dgnStoneDark: '#4e5361',
    dgnStoneLight: '#aab0bd',
    dgnPit: '#1c1a26',
    dgnPitDeep: '#0d0c14',
    dgnShade: '#10141c9c',
    dgnWarp: '#6fd6ff',
    dgnWarpLight: '#d8f6ff',
    dgnBars: '#3b3f4a',
    dgnBarsLight: '#6b7180',
  });

  VL.ART.defineSprite('item-small-key', {
    colors: { g: 'gold', l: 'goldLight', d: 'woodDark' },
    rows: ['.ll..', 'l..l.', 'l..l.', '.ll..', '.g...', '.gg..', '.g...', '.gg..'],
  });
  VL.ART.defineSprite('item-boss-key', {
    colors: { g: 'gold', l: 'goldLight', r: 'heart', k: 'heartLight' },
    rows: ['.lll.', 'l.r.l', 'l.k.l', 'l...l', '.lll.', '..g..', '..gg.', '..g..', '..gg.'],
  });
  VL.ART.defineSprite('pickup-dungeon-map', {
    colors: { p: 'sandLight', d: 'sandDark', r: 'heart', k: 'ink', b: 'water' },
    rows: ['pppppppp', 'pkkpppdp', 'pkrkpddp', 'ppkbbbpp', 'pdpbpkpp', 'pdppkkpp', 'pppppppp'],
  });
  VL.ART.defineSprite('icon-skull', {
    outline: false,
    colors: { w: 'white', k: 'ink' },
    rows: ['.www.', 'wkwkw', 'wwwww', '.wkw.', '.www.'],
  });

  // The base legend for dungeon tilesets: spread it into your own and add
  // the dungeon's special tiles (README "Dungeons").
  VL.DUNGEON_TILES = {
    '#': { solid: true, wall: true, interior: true, art: 'wallInside' },
    _: { floor: true, art: 'floor' },
    m: { door: true, floor: true, art: 'door' },
    // A pit: solid and never flyOver, so a carried chicken cannot skip the puzzle.
    o: { solid: true, pit: true, art: 'dungeonPit' },
    // Floor under something solid drawn as decor.
    n: { solid: true, floor: true, furniture: true, art: 'floor' },
  };
  VL.defineTileset('dungeon', { ...VL.DUNGEON_TILES });

  VL.ART.defineTileStyle('dungeonPit', {
    ground(ctx, cell) {
      const { x, y } = cell;
      const { rect } = VL.ART;
      const open = (dx, dy) => {
        const other = cell.near(dx, dy);
        return other !== null && !other.pit;
      };
      rect(ctx, 'dgnPitDeep', x, y, 16, 16);
      if (cell.seed(2) > 0.5) rect(ctx, 'dgnPit', x + Math.floor(cell.seed(3) * 12), y + 8 + Math.floor(cell.seed(4) * 6), 3, 1);
      if (open(0, -1)) {
        rect(ctx, 'dgnStoneDark', x, y, 16, 3);
        rect(ctx, 'dgnPit', x, y + 3, 16, 3);
      }
      if (open(0, 1)) rect(ctx, 'dgnStoneLight', x, y + 14, 16, 2);
      if (open(-1, 0)) rect(ctx, 'dgnStoneDark', x, y, 2, 16);
      if (open(1, 0)) rect(ctx, 'dgnStoneDark', x + 14, y, 2, 16);
    },
  });

  // Small keys and the boss key, shown over the play area while in a dungeon.
  VL.defineHeroLayer('dungeonHud', (ctx, state, x, y, t, pass) => {
    if (pass !== 'front') return;
    const dungeon = VL.dungeonOf(state);
    if (!dungeon) return;
    const d = VL.dungeonState(state, dungeon.id);
    const { width } = VL.TUNING;
    VL.ART.drawSprite(ctx, 'item-small-key', width - 23, 3);
    VL.ART.text(ctx, `x${d.keys}`, width - 15, 4, { size: 'small', color: 'text', shadow: 'outline' });
    if (d.bossKey) VL.ART.drawSprite(ctx, 'item-boss-key', width - 36, 2);
    if (state.dungeonNote) VL.ART.text(ctx, state.dungeonNote.text, width / 2, 4, { size: 'small', align: 'center', color: 'goldLight', shadow: 'outline' });
  });

  // ---------- sounds ----------

  VL.defineSfx('dungeonKey', [
    { wave: 'triangle', freq: 880, dur: 0.08, vol: 0.35 },
    { wave: 'triangle', freq: 1320, at: 0.08, dur: 0.16, vol: 0.35 },
  ], { gap: 0.2 });
  VL.defineSfx('dungeonUnlock', [
    { wave: 'square', freq: 220, dur: 0.05, vol: 0.25 },
    { wave: 'triangle', freq: 660, at: 0.08, dur: 0.1, vol: 0.35 },
    { wave: 'triangle', freq: 990, at: 0.18, dur: 0.2, vol: 0.35 },
  ], { gap: 0.3 });
  VL.defineSfx('dungeonShutter', [
    { wave: 'noise', dur: 0.16, vol: 0.45, filter: { type: 'lowpass', freq: 700, to: 200 } },
    { wave: 'square', freq: 110, at: 0.12, dur: 0.08, vol: 0.3 },
  ], { gap: 0.2 });
  VL.defineSfx('dungeonBlock', [
    { wave: 'noise', dur: 0.2, vol: 0.45, filter: { type: 'lowpass', freq: 400, to: 150 } },
  ], { gap: 0.15 });
  VL.defineSfx('dungeonPlate', [
    { wave: 'square', freq: 330, dur: 0.04, vol: 0.3 },
    { wave: 'triangle', freq: 495, at: 0.05, dur: 0.08, vol: 0.3 },
  ], { gap: 0.15 });
  VL.defineSfx('dungeonSwitch', [
    { wave: 'triangle', freq: 523, dur: 0.07, vol: 0.35 },
    { wave: 'triangle', freq: 784, at: 0.07, dur: 0.14, vol: 0.35 },
  ], { gap: 0.2 });
  VL.defineSfx('dungeonWarp', [
    { wave: 'sine', freq: 330, to: 1320, dur: 0.5, vol: 0.4 },
    { wave: 'triangle', freq: 660, to: 2640, at: 0.1, dur: 0.4, vol: 0.2 },
  ], { gap: 0.6 });
  VL.defineSfx('dungeonBoss', [
    { wave: 'triangle', freq: 392, dur: 0.15, vol: 0.4 },
    { wave: 'triangle', freq: 523, at: 0.15, dur: 0.15, vol: 0.4 },
    { wave: 'triangle', freq: 659, at: 0.3, dur: 0.15, vol: 0.4 },
    { wave: 'triangle', freq: 784, at: 0.45, dur: 0.5, vol: 0.4 },
  ], { gap: 1 });
  VL.SOUND.onEvent('smallKey', 'dungeonKey');
  VL.SOUND.onEvent('bossKey', 'dungeonKey');
  VL.SOUND.onEvent('dungeonMap', 'pickup');
  VL.SOUND.onEvent('doorUnlocked', 'dungeonUnlock');
  VL.SOUND.onEvent('doorLocked', 'bump');
  VL.SOUND.onEvent('shutterOpen', 'dungeonShutter');
  VL.SOUND.onEvent('blockPushed', 'dungeonBlock');
  VL.SOUND.onEvent('platePressed', 'dungeonPlate');
  VL.SOUND.onEvent('switchOn', 'dungeonSwitch');
  VL.SOUND.onEvent('warp', 'dungeonWarp');
  VL.SOUND.onEvent('bossDefeated', 'dungeonBoss');
  VL.SOUND.onEvent('revealed', 'dungeonPlate');
  VL.SOUND.onEvent('statue', 'popup');
})();
