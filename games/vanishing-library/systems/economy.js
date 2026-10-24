// The town economy's rules (README "Economy"): the one price table, talking
// to a keeper across a counter, loose pages for the bindery, and the
// economy's locks. The buildings, keepers and their shops live in
// regions/buildings.js; shovels and digging in systems/digging.js.
(() => {
  VL.tune({
    // Every price in town (design: Resources and economy, placeholder prices).
    // Offers point at these objects, so retuning a line retunes the counter.
    prices: {
      paper: { shells: 2 },
      buyBerry: { shells: 3 },
      sellBerry: { berries: 1 },
      millTrade: { wood: 5 },
      woodSword: { wood: 3 },
      woodShield: { wood: 4 },
      woodShovel: { wood: 4 },
      shopShovel: { shells: 15 },
      metalGear: { ore: 1, shells: 10 },
      metalGearLedger: { ore: 1, shells: 6 },
      binding: { shells: 15 },
    },
  });

  // A flag that only ever turns on, saved with the earning.
  VL.firstTimeFlag = function firstTimeFlag(state, flag) {
    if (state.flags[flag]) return;
    state.flags[flag] = true;
    VL.earned(state);
  };

  // Titled books switch on once their lock is reached (W11 claims them:
  // returned and read), so these stay false until then.
  VL.smithsLedgerRead = (state) => Boolean(VL.LOCKS.bookSmithsLedger?.reached?.(state));
  VL.tideTablesRead = (state) => Boolean(VL.LOCKS.bookTideTables?.reached?.(state));

  // Pages found so far: every lock that supplies pages and has been reached,
  // so each page counts as soon as the item that places it claims its lock.
  VL.loosePages = function loosePages(state) {
    let pages = 0;
    for (const lock of Object.values(VL.LOCKS)) {
      if (lock.supplies?.pages && lock.reached?.(state)) pages += lock.supplies.pages;
    }
    return pages;
  };
  VL.pagesToBind = () => VL.LOCKS.climbersAlmanac.count.pages;
  VL.pagesBound = (state) => Boolean(state.flags.pagesBound);

  // ---------- talking across a counter ----------

  // S facing a counter talks to the keeper standing right behind it. NPCs
  // must not stand beside a thing (README "Wandering"), so the counter is a
  // tile, not an entity, and this runs just before the hands.
  VL.defineSystem('counters', {
    order: 19,
    update(state, actions) {
      if (!actions.pressed.interact || state.hp <= 0) return;
      const { facing } = state.player;
      const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[facing] || [0, 1];
      const { tx, ty } = VL.facingTile(state);
      const info = VL.tileInfo(state.room.area, VL.tileAt(state.room.area, state.room.screen, tx, ty, state.room));
      if (!info.counter) return;
      const keeper = state.room.entities.find((e) => e.type === 'npc' && e.x === tx + dx && e.y === ty + dy);
      if (keeper) VL.talkTo(state, keeper);
    },
  });

  // ---------- the progression table ----------

  const claim = (id, reached) => VL.defineLock(id, { ...VL.LOCKS[id], reached });
  const has = (id) => (state) => VL.hasItem(state, id);
  claim('buyBerries', (state) => Boolean(state.flags.boughtBerries));
  claim('millShells', (state) => Boolean(state.flags.millTrade));
  claim('paper', (state) => Boolean(state.flags.boughtPaper));
  for (const id of ['woodSword', 'woodShield', 'metalSword', 'metalShield']) claim(id, has(id));
})();
