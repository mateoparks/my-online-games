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
      // W36: the mill makes it, so the store sells it dearer.
      storePaper: { shells: 3 },
      buyBerry: { shells: 3 },
      sellBerry: { berries: 1 },
      millTrade: { wood: 5 },
      woodSword: { wood: 3 },
      woodShield: { wood: 4 },
      woodShovel: { wood: 4 },
      shopShovel: { shells: 15 },
      metalGear: { ore: 1, shells: 10 },
      metalGearLedger: { ore: 1, shells: 6 },
      // W34: the shovel's haft and handle are wood.
      metalShovel: { wood: 3, ore: 1, shells: 10 },
      metalShovelLedger: { wood: 3, ore: 1, shells: 6 },
      // W34: more than the first purse holds, so the Big Shell Purse comes first.
      binding: { shells: 40 },
      raft: { wood: 4 },
      oarShells: { shells: 8 },
      oarWood: { wood: 3 },
    },
  });

  // A flag that only ever turns on.
  VL.firstTimeFlag = function firstTimeFlag(state, flag) {
    if (state.flags[flag]) return;
    state.flags[flag] = true;
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

  // S facing any tile of a counter talks to the keeper across it, so a kid
  // a few tiles along the counter is still served. NPCs must not stand
  // beside a thing (README "Wandering"), so the counter is a tile, not an
  // entity, and this runs just before the hands.
  const isCounter = (state, tx, ty) =>
    Boolean(VL.tileInfo(state.room.area, VL.tileAt(state.room.area, state.room.screen, tx, ty, state.room)).counter);
  const ACROSS = {
    up: (keeper, tile) => keeper.y < tile.ty,
    down: (keeper, tile) => keeper.y > tile.ty,
    left: (keeper, tile) => keeper.x < tile.tx,
    right: (keeper, tile) => keeper.x > tile.tx,
  };

  // The NPC standing next to the counter the hero faces, on its far side.
  VL.counterKeeper = function counterKeeper(state) {
    const faced = VL.facingTiles(state).find(({ tx, ty }) => isCounter(state, tx, ty));
    if (!faced) return null;
    const counter = [faced];
    const seen = new Set([`${faced.tx},${faced.ty}`]);
    for (let i = 0; i < counter.length; i += 1) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const tile = { tx: counter[i].tx + dx, ty: counter[i].ty + dy };
        const key = `${tile.tx},${tile.ty}`;
        if (!seen.has(key) && isCounter(state, tile.tx, tile.ty)) counter.push(tile);
        seen.add(key);
      }
    }
    const across = ACROSS[state.player.facing] || ACROSS.down;
    return state.room.entities.find((e) => e.type === 'npc' && across(e, faced)
      && counter.some((tile) => Math.abs(tile.tx - e.x) + Math.abs(tile.ty - e.y) === 1)) || null;
  };

  VL.defineSystem('counters', {
    order: 19,
    update(state, actions) {
      if (!actions.pressed.interact || state.hp <= 0) return;
      const keeper = VL.counterKeeper(state);
      if (keeper) VL.talkTo(state, keeper);
    },
  });

  // ---------- the progression table ----------

  const claim = (id, reached) => VL.defineLock(id, { ...VL.LOCKS[id], reached });
  const has = (id) => (state) => VL.hasItem(state, id);
  claim('buyBerries', (state) => Boolean(state.flags.boughtBerries));
  claim('millShells', (state) => Boolean(state.flags.millTrade));
  // Renewable resources mark the source, not the stock (like W5's berries):
  // paper stays reached when it is spent or the shockwave takes it.
  claim('paper', (state) => Boolean(state.flags.boughtPaper));
  for (const id of ['woodSword', 'woodShield', 'metalSword', 'metalShield']) claim(id, has(id));
})();
