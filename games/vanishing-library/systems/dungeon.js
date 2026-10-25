// The dungeon framework (design: The world, "Each dungeon has Zelda
// conventions"): dungeons made of rooms, small keys and locked doors per
// dungeon, the boss key, the dungeon map, push blocks, pressure plates,
// switches and shutters, entrance statues, the boss room and saved puzzle
// state. Entities live one per file in entities/; the map screen is
// scenes/dungeon-map.js. README "Dungeons".
(() => {
  VL.tune({ blockPushSeconds: 0.22, blockSlideSeconds: 0.18, dungeonMessageSeconds: 2 });

  // ---------- saved state ----------

  // Per dungeon: keys given from code, doors opened, plates latched, switches
  // thrown, the boss beaten, the map found. Every one is a permanent earning,
  // so it saves at once; room state (block positions, a held plate, a shutter
  // waiting on a fight) is the visit's and comes back fresh on re-entry. The
  // keys in hand are never stored: VL.smallKeys derives them, so a door or
  // key id renamed after a save can never leave a key spent on a door that
  // reads locked (README "Dungeons", ids).
  const freshDungeon = () => ({ keysGiven: 0, bossKey: false, map: false, doors: {}, plates: {}, switches: {}, boss: false });
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
      addBossGate(id, def);
    }
    if (!VL.ART.AREA_LIGHT[def.area]) VL.ART.setAreaLight(def.area, def.light || 'indoor');
    VL.DUNGEONS[id] = { id, name: id, light: 'indoor', ...def };
    return VL.DUNGEONS[id];
  };

  // The boss gate (W30, README "The boss room"): bars on the tile the boss
  // door lands the hero on, shut once he steps in and open only when the boss
  // is beaten and its heart taken. Every dungeon gets it from here.
  function bossDoorLanding(area, bossScreen) {
    const { cols, rows } = VL.TUNING;
    for (const [key, screen] of Object.entries(VL.AREAS[area].screens)) {
      for (const e of screen.entities) {
        if (e.type !== 'lockedDoor' || e.kind !== 'boss') continue;
        const [dx, dy] = edgeStep(e.x, e.y);
        if (!(dx || dy) || VL.neighborKey(key, dx, dy) !== bossScreen) continue;
        return { tx: dx ? (dx < 0 ? cols - 1 : 0) : e.x, ty: dy ? (dy < 0 ? rows - 1 : 0) : e.y };
      }
    }
    return null;
  }
  function addBossGate(id, def) {
    const screen = VL.getScreen(def.area, def.boss.screen);
    if (screen.entities.some((e) => e.type === 'shutter' && e.open?.bossBeaten)) {
      throw new Error(`dungeon ${id}: the boss gate is the framework's now: remove the shutter on { bossBeaten: true } from ${def.boss.screen} (README "The boss room")`);
    }
    const gate = def.boss.gate || bossDoorLanding(def.area, def.boss.screen);
    if (!gate) throw new Error(`dungeon ${id}: no boss door across an edge into ${def.boss.screen}, so say where the gate goes (boss.gate: { tx, ty })`);
    screen.entities.push({ type: 'shutter', id: `${id}BossGate`, x: gate.tx, y: gate.ty, open: { bossDone: true }, bossGate: true });
  }

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

  // Small keys in hand: the dungeon's key pickups found, plus keys given from
  // code (a chest, a drop), minus its small doors opened. Door copies share
  // an id, so each id counts once; a door or key no longer on the map counts
  // for nothing, which is what heals a rename.
  VL.smallKeys = function smallKeys(state, dungeonId) {
    const dungeon = VL.DUNGEONS[dungeonId];
    const d = VL.dungeonState(state, dungeonId);
    const seen = new Set();
    let keys = d.keysGiven || 0;
    for (const screen of Object.values(VL.AREAS[dungeon.area].screens)) {
      for (const e of screen.entities) {
        if (seen.has(`${e.type}:${e.id}`)) continue;
        seen.add(`${e.type}:${e.id}`);
        if (e.type === 'smallKey' && VL.spotFound(state, e.id)) keys += 1;
        else if (e.type === 'lockedDoor' && e.kind !== 'boss' && d.doors[e.id]) keys -= 1;
      }
    }
    return Math.max(0, keys);
  };

  // A key found on the map is counted by its found flag; this only tells.
  VL.smallKeyFound = function smallKeyFound(state, dungeonId) {
    VL.earned(state);
    state.events.push({ type: 'smallKey', dungeon: dungeonId, keys: VL.smallKeys(state, dungeonId) });
  };

  // A key from code (a chest, a drop, a script): counted as given.
  VL.giveSmallKey = function giveSmallKey(state, dungeonId, n = 1) {
    const d = VL.dungeonState(state, dungeonId);
    d.keysGiven = (d.keysGiven || 0) + n;
    VL.smallKeyFound(state, dungeonId);
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
  // this visit, remembered by its found flag, `apply` hands it over. A small
  // key is only counted from the map (VL.smallKeys), so one pushed into the
  // room by a script would be found and never counted: refused.
  VL.dungeonPickup = function dungeonPickup(state, entity, apply) {
    if (entity.hidden || VL.spotFound(state, entity.id)) return false;
    const { area, screen } = state.player;
    if (entity.type === 'smallKey' && !VL.getScreen(area, screen).entities.some((e) => e.type === 'smallKey' && e.id === entity.id)) {
      throw new Error(`smallKey ${entity.id} is not on screen ${area} ${screen}: a key that appears at runtime is a map key with reveal, or VL.giveSmallKey`);
    }
    state.room.entities = state.room.entities.filter((e) => e !== entity);
    state.room.standingOn = null;
    VL.markFound(state, entity.id);
    apply(state, here(state).id);
    return true;
  };

  // ---------- doors ----------

  // Opens a locked door for good: the door's flag is the spent key (one
  // saved fact, so a reload can never keep one without the other); the boss
  // key is shown, not spent. A door with `wants: { items, note }` also stays
  // shut until the hero holds one of `items` (a boss behind it he couldn't
  // beat would shut him in). Returns 'opened', 'open' or 'locked'.
  VL.openLockedDoor = function openLockedDoor(state, door) {
    const dungeon = here(state);
    const d = VL.dungeonState(state, dungeon.id);
    if (door.open || d.doors[door.id]) {
      door.open = true;
      door.solid = false;
      return 'open';
    }
    if (door.kind === 'boss' ? !d.bossKey : VL.smallKeys(state, dungeon.id) <= 0) return 'locked';
    if (lacksWanted(state, door)) return 'locked';
    d.doors[door.id] = true;
    door.open = true;
    door.solid = false;
    VL.earned(state);
    state.events.push({ type: 'doorUnlocked', door: door.id, kind: door.kind });
    return 'opened';
  };

  const lacksWanted = (state, door) => Boolean(door.wants && !door.wants.items.some((id) => VL.hasItem(state, id)));

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

  // A hair of slack: a hero flush against the tile, a rounding error past
  // its edge, is beside it, not on it (else a shutter beside him lifts).
  VL.heroBoxOverlaps = (state, tx, ty) => {
    const { tile, heroBox } = VL.TUNING;
    const { x, y } = state.player;
    const slack = 1e-6;
    return x + heroBox.w / 2 > tx * tile + slack && x - heroBox.w / 2 < (tx + 1) * tile - slack
      && y + heroBox.h / 2 > ty * tile + slack && y - heroBox.h / 2 < (ty + 1) * tile - slack;
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
  // { flag: id } a saved flag; { bossBeaten: true }; { bossDone: true } beaten
  // and its heart taken (the boss gate); { door: id } that door opened.
  // `dungeon` names the dungeon to read when the hero may be elsewhere (the
  // playthrough's pathfinder plans a route into it from outside).
  VL.dungeonCondition = function dungeonCondition(state, cond, { room = state.room, dungeon = null } = {}) {
    if (!cond) return true;
    const dungeonId = dungeon || here(state).id;
    const d = VL.dungeonState(state, dungeonId);
    const checks = [];
    if (cond.cleared) checks.push(!room || !room.entities.some((e) => VL.isEnemy(e) && !e.boss));
    for (const id of [cond.plate, ...(cond.plates || [])].filter(Boolean)) checks.push(Boolean(d.plates[id]) || Boolean(room?.entities.find((e) => e.type === 'pressurePlate' && e.id === id)?.down));
    if (cond.switch) checks.push(Boolean(d.switches[cond.switch]));
    if (cond.flag) checks.push(Boolean(state.flags[cond.flag]));
    if (cond.bossBeaten) checks.push(Boolean(d.boss));
    if (cond.bossDone) checks.push(VL.bossDone(state, dungeonId));
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
    shutter.solid = shutter.closed && !VL.heroBoxOverlaps(state, shutter.x, shutter.y);
  }

  // The tile an entity stands on: its body's centre when it has one (an
  // enemy, a chicken, a thrown pot), else its map tile.
  const tileOfEntity = (e) => (e.cx === undefined ? { tx: e.x, ty: e.y } : VL.tileOf(e.cx, e.cy));

  // What presses a plate: the hero (unless `weight: 'block'`) and any entity
  // whose type says `weighsPlate: true` (a push block).
  function settlePlate(state, plate) {
    const hero = VL.heroTile(state);
    const held = state.room.entities.some((e) => {
      if (!VL.ENTITIES[e.type]?.weighsPlate) return false;
      const at = tileOfEntity(e);
      return at.tx === plate.x && at.ty === plate.y;
    });
    const stood = plate.weight !== 'block' && hero.tx === plate.x && hero.ty === plate.y;
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

  // Whether an entity occupies a tile: by its body's box when it has one (a
  // wandering enemy sits between tiles), else by its map tile.
  function occupies(e, tx, ty) {
    if (e.cx === undefined) return e.x === tx && e.y === ty;
    const { tile } = VL.TUNING;
    const body = VL.ENEMIES[e.type]?.body || { w: 12, h: 12 };
    return e.cx + body.w / 2 > tx * tile && e.cx - body.w / 2 < (tx + 1) * tile
      && e.cy + body.h / 2 > ty * tile && e.cy - body.h / 2 < (ty + 1) * tile;
  }

  // Where a block may go: open floor of this visit, nothing on the tile but
  // a plate, never the edge row or column (so a block never sits in an
  // opening). Whether a push can still cut the hero off from every exit is
  // VL.dungeonBlockProblems' question, asked of every dungeon by the tests.
  VL.blockCanMove = function blockCanMove(state, block, dx, dy) {
    const { cols, rows } = VL.TUNING;
    const tx = block.x + dx;
    const ty = block.y + dy;
    if (tx < 1 || ty < 1 || tx > cols - 2 || ty > rows - 2) return false;
    const { area, screen } = state.player;
    if (VL.tileInfo(area, VL.tileAt(area, screen, tx, ty, state.room)).solid) return false;
    return !state.room.entities.some((e) => e !== block && e.type !== 'pressurePlate' && occupies(e, tx, ty));
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
        if (push?.entity === e) {
          const dungeon = here(state);
          const keys = `${VL.smallKeys(state, dungeon.id)}/${VL.dungeonState(state, dungeon.id).bossKey}/${lacksWanted(state, e)}`;
          if (e.tried !== keys) {
            e.tried = keys;
            if (VL.openLockedDoor(state, e) === 'locked') VL.lockedDoorNote(state, e);
          }
        } else e.tried = null;
      }
    }
  }

  // Bumps, and says why once per visit of that door and reason.
  VL.lockedDoorNote = function lockedDoorNote(state, door) {
    state.events.push({ type: 'doorLocked', door: door.id, kind: door.kind });
    const d = VL.dungeonHere(state);
    const keyed = door.kind === 'boss' ? d.bossKey : VL.smallKeys(state, here(state).id) > 0;
    let text = door.kind === 'boss' ? 'The big lock needs the boss key.' : 'Locked. A small key would open it.';
    if (keyed && lacksWanted(state, door)) text = door.wants.note;
    if (door.told === text) return;
    door.told = text;
    state.dungeonNote = { text, t: 0 };
  };

  // ---------- rooms ----------

  // Set up a fresh visit: saved tile changes, then every shutter, plate and
  // door settled from saved state, the boss room cleared or armed. Runs as
  // the room is built (VL.onRoomBuilt), so a screen slides in already
  // changed and collision never sees a room the framework has not seen.
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
        // The marked boss is kept by reference: only its death counts (hp 0,
        // or `defeated` set by a script), never its absence, so a boss that
        // burrows out of the entity list for a while is not crowned.
        for (const e of room.entities) {
          if (e.type !== boss.type) continue;
          e.boss = true;
          room.bossRef = e;
        }
      }
    }
    settleRoom(state);
  }
  VL.onRoomBuilt(prepareRoom);

  // The heart container where the boss stood on the map (until it is taken)
  // and the warp out, in the boss room of a beaten dungeon.
  function bossRewards(state, dungeon) {
    const room = state.room;
    const { boss } = dungeon;
    const stood = VL.getScreen(dungeon.area, boss.screen).entities.find((e) => e.type === boss.type) || { x: boss.warp.tx, y: boss.warp.ty - 1 };
    if (!VL.spotFound(state, boss.heart) && !room.entities.some((e) => e.type === 'heartContainer' && e.id === boss.heart)) {
      room.entities.push({ type: 'heartContainer', id: boss.heart, x: stood.x, y: stood.y });
    }
    // The way out waits for the heart (W30's boss gate).
    if (!VL.spotFound(state, boss.heart) || room.entities.some((e) => e.type === 'warp')) return;
    // savePoint: Continue after the win starts outside, not back at the statue.
    const warp = { type: 'warp', x: boss.warp.tx, y: boss.warp.ty, to: dungeon.entrance, savePoint: true };
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
  VL.bossDone = (state, dungeonId) => VL.bossBeaten(state, dungeonId) && VL.spotFound(state, VL.DUNGEONS[dungeonId].boss.heart);

  // A dungeon's own save points: any spot inside it, or the doorstep its warp out saves.
  VL.savePointInDungeon = function savePointInDungeon(point, dungeonId) {
    const { area, entrance } = VL.DUNGEONS[dungeonId];
    return point.area === area || (point.area === entrance.area && point.screen === entrance.screen && point.tx === entrance.tx && point.ty === entrance.ty);
  };

  // Once a dungeon is finished, its statue and doorstep wake him at the hut's
  // lantern instead, so Continue never starts out at a far dungeon he is done
  // with (README "The boss room").
  VL.moveSavePoint((state, point) => {
    const finished = Object.values(VL.DUNGEONS).some((d) => d.boss && VL.savePointInDungeon(point, d.id) && VL.bossDone(state, d.id));
    return finished ? VL.HOME_SAVE : null;
  });

  // ---------- saved tile changes (for W14's boulders and anything else that outlasts a visit) ----------

  // `at` names another screen ({ area, screen }); the hero's own by default.
  VL.saveTile = function saveTile(state, tx, ty, ch, at = state.player) {
    const { area, screen } = at;
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

  // `warpHold`: a warp just carried the hero with a direction still held
  // (entities/warp.js); systems/movement.js waits for the release.
  VL.extendGame('dungeonNote', () => ({ dungeonNote: null, warpHold: false }), { transient: true });

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
      // The boss is beaten when it has fallen and is gone from its room,
      // however it fell (a sword in the combat step, a thrown pot, a script
      // that sets `defeated` before removing it).
      const boss = room.bossRef;
      if (boss && !VL.dungeonState(state, dungeon.id).boss && !room.entities.includes(boss) && (boss.hp <= 0 || boss.defeated)) {
        VL.bossDefeated(state, dungeon.id);
      }
      if (dungeon.boss && room.screen === dungeon.boss.screen && VL.bossBeaten(state, dungeon.id)) bossRewards(state, dungeon);
      settleRoom(state);
    },
  });

  // ---------- the lints: a layout that would softlock is told, not shipped ----------

  // Progression (README "Progression"): a dungeon's small keys and locked
  // doors spend one counter, 'smallKey:<dungeon>', so W3's solver sees the
  // spending order. Every key pickup, boss key and locked door names its lock
  // (`lock: 'id'`), and this check keeps map and table in step: the rule
  // matches, one lock is named by doors of one id (the game spends a key per
  // door id, the solver one per lock), everything found or thrown has an id
  // (two keys with none share one found flag), and no id is used twice
  // anywhere (found flags are global, so a reused key id is already found).
  // Returns the problems; the test keeps it empty.
  const NEEDS_ID = ['smallKey', 'bossKey', 'dungeonMap', 'pressurePlate', 'switch'];
  VL.dungeonLockProblems = function dungeonLockProblems(locks = VL.LOCKS) {
    const problems = [];
    const doorsByLock = {};
    for (const dungeon of Object.values(VL.DUNGEONS)) {
      const counter = `smallKey:${dungeon.id}`;
      for (const [key, screen] of Object.entries(VL.AREAS[dungeon.area].screens)) {
        for (const e of screen.entities) {
          const where = `${dungeon.id} ${key} ${e.type} ${e.id || ''}`.trim();
          if ((NEEDS_ID.includes(e.type) || VL.ENTITIES[e.type]?.isSwitch) && !e.id) {
            problems.push(`${where} needs an id`);
            continue;
          }
          const expect = { smallKey: { supplies: counter }, bossKey: { gives: `bossKey:${dungeon.id}` }, lockedDoor: e.kind === 'boss' ? { needs: `bossKey:${dungeon.id}` } : { consumes: counter } }[e.type];
          if (!expect) continue;
          if (e.type === 'lockedDoor' && e.lock) (doorsByLock[e.lock] || (doorsByLock[e.lock] = new Set())).add(e.id);
          const lock = locks[e.lock];
          if (!e.lock || !lock) {
            problems.push(`${where} needs lock: '<id>' naming a lock in the table`);
            continue;
          }
          if (expect.supplies && !lock.supplies[expect.supplies]) problems.push(`${where}: lock ${e.lock} must supply { '${expect.supplies}': 1 }`);
          if (expect.consumes && !lock.consumes[expect.consumes]) problems.push(`${where}: lock ${e.lock} must consume { '${expect.consumes}': 1 }`);
          if (expect.gives && !lock.gives.includes(expect.gives) && lock.id !== expect.gives) problems.push(`${where}: lock ${e.lock} must give '${expect.gives}'`);
          if (expect.needs && !lock.needs.flat().includes(expect.needs)) problems.push(`${where}: lock ${e.lock} must need '${expect.needs}'`);
          if (e.wants && !lock.needs.some((need) => [need].flat().every((id) => e.wants.items.includes(id)))) problems.push(`${where} wants ${e.wants.items.join(' or ')}: lock ${e.lock} must need them`);
        }
      }
    }
    // A shutter opens on a switch (a lever, or any entity type marked
    // isSwitch: a target, a crystal, a lamp) or plates of its own dungeon.
    for (const dungeon of Object.values(VL.DUNGEONS)) {
      const ids = { switch: new Set(), plate: new Set() };
      const screens = Object.entries(VL.AREAS[dungeon.area].screens);
      for (const [, screen] of screens) {
        for (const e of screen.entities) {
          if (e.type === 'switch' || VL.ENTITIES[e.type]?.isSwitch) ids.switch.add(e.id);
          if (e.type === 'pressurePlate') ids.plate.add(e.id);
        }
      }
      for (const [key, screen] of screens) {
        for (const e of screen.entities) {
          if (e.type !== 'shutter' || !e.open) continue;
          const named = [['switch', e.open.switch], ...[e.open.plate, ...(e.open.plates || [])].map((id) => ['plate', id])].filter(([, id]) => id);
          for (const [kind, id] of named) {
            if (!ids[kind].has(id)) problems.push(`${dungeon.id} ${key} shutter ${e.id || ''} opens on ${kind} ${id}, but dungeon ${dungeon.id} has no ${kind} with that id`);
          }
        }
      }
    }
    for (const [lock, ids] of Object.entries(doorsByLock)) {
      if (ids.size > 1) problems.push(`lock ${lock} is named by doors ${[...ids].join(' and ')}: the solver counts one key, the game spends one per door id`);
    }
    const uses = {};
    for (const [areaId, area] of Object.entries(VL.AREAS)) {
      for (const [key, screen] of Object.entries(area.screens)) {
        for (const e of screen.entities) if (e.id && e.type !== 'lockedDoor') (uses[e.id] || (uses[e.id] = [])).push(`${areaId} ${key} ${e.type}`);
      }
    }
    for (const [id, list] of Object.entries(uses)) {
      if (list.length > 1) problems.push(`id ${id} is used by ${list.sort().join(' and ')}: ids are global, so prefix them with the dungeon`);
    }
    return problems;
  };

  // The side of the screen an edge tile is on, as the step across it.
  function edgeStep(tx, ty) {
    const { cols, rows } = VL.TUNING;
    return [tx === 0 ? -1 : tx === cols - 1 ? 1 : 0, ty === 0 ? -1 : ty === rows - 1 ? 1 : 0];
  }

  // The screens of a dungeon the hero can reach from its entry screens (where
  // a door or warp from outside lands him) without crossing one edge: the
  // openings, doors and warps between screens, taken as crossable both ways
  // (a locked door opens from either side once it has its twin). Returns
  // { reached: Map key -> how it was first reached, entries } .
  function floodScreens(dungeon, skipEdge) {
    const { cols, rows } = VL.TUNING;
    const areaId = dungeon.area;
    const screens = VL.AREAS[areaId].screens;
    const entries = new Set();
    for (const [otherId, area] of Object.entries(VL.AREAS)) {
      if (otherId === areaId) continue;
      for (const screen of Object.values(area.screens)) {
        for (const e of screen.entities) if ((e.type === 'door' || e.type === 'warp') && e.to?.area === areaId) entries.add(e.to.screen);
      }
    }
    if (dungeon.entrance.area === areaId) entries.add(dungeon.entrance.screen);
    const reached = new Map([...entries].map((key) => [key, 'as an entry (a door or warp from outside lands there)']));
    const queue = [...entries];
    const visit = (key, how) => {
      if (!screens[key] || reached.has(key)) return;
      reached.set(key, how);
      queue.push(key);
    };
    while (queue.length) {
      const key = queue.shift();
      const screen = screens[key];
      for (let ty = 0; ty < rows; ty += 1) {
        for (let tx = 0; tx < cols; tx += 1) {
          const [dx, dy] = edgeStep(tx, ty);
          if (!(dx || dy) || (dx && dy) || VL.tileInfo(areaId, screen.tiles[ty][tx]).solid || skipEdge(key, tx, ty)) continue;
          const next = VL.neighborKey(key, dx, dy);
          const ntx = dx ? (dx < 0 ? cols - 1 : 0) : tx;
          const nty = dy ? (dy < 0 ? rows - 1 : 0) : ty;
          if (screens[next] && !VL.tileInfo(areaId, screens[next].tiles[nty][ntx]).solid) visit(next, `from ${key} through the opening at (${tx},${ty})`);
        }
      }
      for (const e of screen.entities) {
        if ((e.type === 'door' || e.type === 'warp') && e.to?.area === areaId) visit(e.to.screen, `from ${key} through the ${e.type} at (${e.x},${e.y})`);
      }
      if (dungeon.boss?.screen === key && dungeon.entrance.area === areaId) visit(dungeon.entrance.screen, `from ${key} through the boss room's warp`);
    }
    return { reached, entries };
  }

  // A locked door across a screen edge must have its copy (same id) on the
  // matching tile of the neighbour, or the hero crossing from that side lands
  // inside a closed door with nowhere to go; a door whose far room is only
  // ever entered through it says `oneWay: true`, and that claim is checked:
  // the far room must be unreachable from the dungeon's entries without
  // crossing the door (a loop of openings, a warp in). One id is one door:
  // two copies at most, and only on the two sides of one edge.
  VL.dungeonDoorProblems = function dungeonDoorProblems() {
    const problems = [];
    const { cols, rows } = VL.TUNING;
    for (const dungeon of Object.values(VL.DUNGEONS)) {
      const screens = VL.AREAS[dungeon.area].screens;
      const where = {};
      for (const [key, screen] of Object.entries(screens)) {
        for (const e of screen.entities) {
          if (e.type !== 'lockedDoor') continue;
          const label = `${dungeon.id} ${key} lockedDoor ${e.id}`;
          const [dx, dy] = edgeStep(e.x, e.y);
          let twin = null;
          if (dx || dy) {
            const next = VL.neighborKey(key, dx, dy);
            const tx = dx ? (dx < 0 ? cols - 1 : 0) : e.x;
            const ty = dy ? (dy < 0 ? rows - 1 : 0) : e.y;
            twin = screens[next]?.entities.find((other) => other.type === 'lockedDoor' && other.x === tx && other.y === ty) || null;
            if (!screens[next]) problems.push(`${label} is on an edge with no screen ${next} beyond it`);
            else if (!twin && !e.oneWay) problems.push(`${label} on the edge has no copy on ${next} at (${tx},${ty}): add one with the same id, or oneWay: true if that room is only ever entered through this door`);
            else if (twin && twin.id !== e.id) problems.push(`${label} on the edge faces ${twin.id} on ${next} at (${tx},${ty}): both sides of one door share an id`);
            else if (!twin && e.oneWay) {
              const isDoorEdge = (k, x, y) => (k === key && x === e.x && y === e.y) || (k === next && x === tx && y === ty);
              const { reached, entries } = floodScreens(dungeon, isDoorEdge);
              if (!entries.size) problems.push(`${label} is oneWay but no door or warp leads into dungeon ${dungeon.id} from outside, so where its far room is reached from cannot be told: add the dungeon's door`);
              else if (reached.has(next)) problems.push(`${label} is oneWay but ${next} is also reached ${reached.get(next)}: give the door a twin, or remove the other way in`);
            }
          }
          (where[e.id] || (where[e.id] = [])).push({ key, twinKey: twin ? VL.neighborKey(key, dx, dy) : null });
        }
      }
      for (const [id, list] of Object.entries(where)) {
        const paired = list.length === 2 && list[0].twinKey === list[1].key && list[1].twinKey === list[0].key;
        if (list.length > 1 && !paired) problems.push(`${dungeon.id} lockedDoor ${id} is on ${list.length} screens (${list.map((l) => l.key).join(', ')}): one id is one door, two copies at most, on the two sides of one edge`);
      }
    }
    return problems;
  };

  // Every way the blocks of a room can be pushed, and whether any of them
  // leaves the hero with no exit he can reach (then he can neither leave to
  // reset the blocks nor, in a room without enemies, faint). A breadth-first
  // search over block positions from every tile the hero can appear on: each
  // exit and the tiles beside it, the statue step (a faint or Continue puts
  // him there with the blocks back at their start), and every tile a door
  // or warp lands him on; the first (shortest) stranding sequence per room
  // is reported. It models what the room is made of: walls, solid things,
  // exits (openings, doors, locked doors, warps; an exit under closed bars
  // is no exit), plates pressed by blocks (or a latch plate the hero can
  // reach, unless `weight: 'block'`), switches in the room (thrown once he
  // can stand beside one) and the shutters they open; a shutter on anything
  // else (cleared, a flag, a switch elsewhere) is taken as open, and enemies
  // are ignored, since they move.
  const BLOCK_SEARCH_CAP = 4000;
  const DIR_NAMES = { '-1,0': 'left', '1,0': 'right', '0,-1': 'up', '0,1': 'down' };
  const STEPS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  // Every door and warp in the game that lands the hero on this screen.
  function arrivals(areaId, key) {
    const places = [];
    for (const area of Object.values(VL.AREAS)) {
      for (const screen of Object.values(area.screens)) {
        for (const e of screen.entities) {
          if ((e.type === 'door' || e.type === 'warp') && e.to?.area === areaId && e.to.screen === key) places.push(e.to);
        }
      }
    }
    const dungeon = VL.dungeonOfArea(areaId);
    if (dungeon?.entrance.area === areaId && dungeon.entrance.screen === key) places.push(dungeon.entrance);
    return places;
  }

  function roomBlockProblem(areaId, key, screen) {
    const { cols, rows } = VL.TUNING;
    const blocks0 = screen.entities.filter((e) => e.type === 'pushBlock');
    if (!blocks0.length) return null;
    const k = (tx, ty) => `${tx},${ty}`;
    const inside = (tx, ty) => tx >= 0 && ty >= 0 && tx < cols && ty < rows;
    const onEdge = (tx, ty) => tx === 0 || ty === 0 || tx === cols - 1 || ty === rows - 1;
    const wall = (tx, ty) => VL.tileInfo(areaId, screen.tiles[ty][tx]).solid;
    const fixed = screen.entities.filter((e) => e.type !== 'pushBlock' && !VL.ENEMIES[e.type]);
    const exits = new Set();
    const solid = new Set();
    const plates = fixed.filter((e) => e.type === 'pressurePlate');
    const shutters = fixed.filter((e) => e.type === 'shutter');
    const shutterAt = new Set(shutters.map((s) => k(s.x, s.y)));
    const switchesHere = new Set(fixed.filter((e) => e.type === 'switch').map((e) => e.id));
    for (const e of fixed) {
      if (e.type === 'door' || e.type === 'lockedDoor' || e.type === 'warp') exits.add(k(e.x, e.y));
      if (e.type === 'lockedDoor' || (e.type !== 'shutter' && e.type !== 'pressurePlate' && (e.solid || VL.ENTITIES[e.type]?.solid))) solid.add(k(e.x, e.y));
    }
    for (let tx = 0; tx < cols; tx += 1) for (let ty = 0; ty < rows; ty += 1) if (onEdge(tx, ty) && !wall(tx, ty)) exits.add(k(tx, ty));
    const occupied = fixed.filter((e) => e.type !== 'pressurePlate').map((e) => k(e.x, e.y));
    const canPush = (blocks, b, dx, dy) => {
      const tx = b.x + dx;
      const ty = b.y + dy;
      if (!inside(tx, ty) || onEdge(tx, ty) || wall(tx, ty) || occupied.includes(k(tx, ty))) return false;
      return !blocks.some((o) => o !== b && o.x === tx && o.y === ty);
    };
    const beside = (region, tx, ty) => STEPS.some(([dx, dy]) => region.has(k(tx + dx, ty + dy)));
    // The hero's reach and the bars that are up, settled together to a
    // fixpoint from everything shut: a plate he or a block holds (or latched
    // earlier in the sequence), or a switch he can stand beside, opens bars
    // that may reach another plate or switch.
    const reach = (hero, blocks, latched) => {
      const blockAt = new Set(blocks.map((b) => k(b.x, b.y)));
      let open = new Set();
      for (;;) {
        const region = new Set();
        const queue = [hero];
        const walkable = (tx, ty) => inside(tx, ty) && !wall(tx, ty) && !solid.has(k(tx, ty)) && !blockAt.has(k(tx, ty)) && (!shutterAt.has(k(tx, ty)) || open.has(k(tx, ty)));
        if (walkable(hero.tx, hero.ty)) region.add(k(hero.tx, hero.ty));
        while (queue.length) {
          const { tx, ty } = queue.shift();
          for (const [dx, dy] of STEPS) {
            if (!walkable(tx + dx, ty + dy) || region.has(k(tx + dx, ty + dy))) continue;
            region.add(k(tx + dx, ty + dy));
            queue.push({ tx: tx + dx, ty: ty + dy });
          }
        }
        const down = new Set(plates.filter((p) => latched.has(p.id) || blockAt.has(k(p.x, p.y)) || (p.weight !== 'block' && p.latch && region.has(k(p.x, p.y)))).map((p) => p.id));
        const thrown = new Set(fixed.filter((e) => e.type === 'switch' && beside(region, e.x, e.y)).map((e) => e.id));
        const lifted = (s) => !s.open || ([s.open.plate, ...(s.open.plates || [])].filter(Boolean).every((id) => down.has(id))
          && (!s.open.switch || !switchesHere.has(s.open.switch) || thrown.has(s.open.switch)));
        const next = new Set(shutters.filter(lifted).map((s) => k(s.x, s.y)));
        if (next.size === open.size) return { region, open, latched: new Set(plates.filter((p) => p.latch && down.has(p.id)).map((p) => p.id)) };
        open = next;
      }
    };
    const exitReachable = ({ region, open }) => [...exits].some((exit) => {
      if (shutterAt.has(exit) && !open.has(exit)) return false;
      const [tx, ty] = exit.split(',').map(Number);
      return region.has(exit) || beside(region, tx, ty);
    });
    // Where the hero can appear: every exit and the tiles beside it, the
    // statue step, and wherever a door or warp lands him.
    const starts = [];
    for (const exit of exits) {
      const [tx, ty] = exit.split(',').map(Number);
      for (const [dx, dy] of [[0, 0], ...STEPS]) if (inside(tx + dx, ty + dy)) starts.push({ tx: tx + dx, ty: ty + dy, label: `the hero at (${tx + dx},${ty + dy})` });
    }
    for (const e of fixed) if (e.type === 'saveStatue' || e.type === 'savePoint') starts.push({ tx: e.x, ty: e.y, label: `the hero respawning at the statue (${e.x},${e.y})` });
    for (const to of arrivals(areaId, key)) starts.push({ tx: to.tx, ty: to.ty, label: `the hero arriving at (${to.tx},${to.ty})` });
    const seen = new Set();
    const queue = [];
    const blocksKey = (blocks) => blocks.map((b) => `${b.x},${b.y},${b.pushed ? 1 : 0}`).join(';');
    const push = (blocks, hero, latched, trail, label) => {
      const reached = reach(hero, blocks, latched);
      if (!reached.region.size) return;
      const id = `${blocksKey(blocks)}|${[...reached.latched].sort()}|${[...reached.region].sort()[0]}`;
      if (seen.has(id)) return;
      seen.add(id);
      queue.push({ blocks, reached, trail, label });
    };
    for (const start of starts) push(blocks0.map((b) => ({ x: b.x, y: b.y, once: b.once, pushed: false })), start, new Set(), [], start.label);
    while (queue.length) {
      if (seen.size > BLOCK_SEARCH_CAP) return `more than ${BLOCK_SEARCH_CAP} block positions to check: fewer free blocks (once: false), please`;
      const { blocks, reached, trail, label } = queue.shift();
      if (!exitReachable(reached)) return trail.length ? `${trail.join(', ')} cuts the hero off from every exit` : `${label} can reach no exit without a push`;
      const { region, latched } = reached;
      blocks.forEach((b, i) => {
        if (b.pushed && b.once !== false) return;
        for (const [dx, dy] of STEPS) {
          if (!region.has(k(b.x - dx, b.y - dy)) || !canPush(blocks, b, dx, dy)) continue;
          const moved = blocks.map((o, j) => (j === i ? { ...o, x: o.x + dx, y: o.y + dy, pushed: true } : o));
          push(moved, { tx: b.x, ty: b.y }, latched, [...trail, `block (${b.x},${b.y}) pushed ${DIR_NAMES[k(dx, dy)]} to (${b.x + dx},${b.y + dy})`], label);
        }
      });
    }
    return null;
  }

  VL.dungeonBlockProblems = function dungeonBlockProblems() {
    const problems = [];
    for (const dungeon of Object.values(VL.DUNGEONS)) {
      for (const [key, screen] of Object.entries(VL.AREAS[dungeon.area].screens)) {
        const problem = roomBlockProblem(dungeon.area, key, screen);
        if (problem) problems.push(`${dungeon.id} ${key}: ${problem}`);
      }
    }
    return problems;
  };

  // Every lint, for every dungeon: tests/dungeon.test.js keeps it empty, so a
  // dungeon in the manifest is checked without a test of its own.
  VL.dungeonProblems = () => [...VL.dungeonLockProblems(), ...VL.dungeonDoorProblems(), ...VL.dungeonBlockProblems()];

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
    dgnKeyDark: '#a8621a',
  });

  VL.ART.defineSprite('item-small-key', {
    colors: { g: 'gold', l: 'goldLight', d: 'woodDark' },
    rows: ['.ll..', 'l..l.', 'l..l.', '.ll..', '.g...', '.gg..', '.g...', '.gg..'],
  });
  // Crowned, jewelled and a size up, so it never reads as one more small key.
  VL.ART.defineSprite('item-boss-key', {
    colors: { g: 'gold', l: 'goldLight', d: 'dgnKeyDark', r: 'heart', k: 'heartLight' },
    rows: [
      'l..l..l',
      'l.lll.l',
      'lllllll',
      'lgdddgl',
      'lgdkdgl',
      'lgdrdgl',
      '.lgggl.',
      '..lgd..',
      '...g...',
      '...gdd.',
      '...g...',
      '...gdd.',
      '...gd..',
    ],
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
    // The overlay pass: over the light, and never hidden by the hurt flash.
    if (pass !== 'overlay') return;
    const dungeon = VL.dungeonOf(state);
    if (!dungeon) return;
    const d = VL.dungeonState(state, dungeon.id);
    // On the second row of the play area: the SAVED note (scenes/play.js)
    // has the first, and keys are earned right under it.
    const { width } = VL.TUNING;
    VL.ART.drawSprite(ctx, 'item-small-key', width - 23, 14);
    VL.ART.text(ctx, `x${VL.smallKeys(state, dungeon.id)}`, width - 15, 15, { size: 'small', color: 'text', shadow: 'outline' });
    if (d.bossKey) VL.ART.drawSprite(ctx, 'item-boss-key', width - 34, 12);
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
