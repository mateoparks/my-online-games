// Bushes and berry bushes (design: Resources and economy). A bush cut with a
// sword or pulled by hand opens for this visit and may drop a heart, a whole
// shell or wood; berry bushes are picked, never cut. Both grow back when the
// hero leaves the screen and comes back (the room is rebuilt on entry).
(() => {
  VL.tune({
    // One roll per bush, each band exclusive: 2% heart, 5% shell, 20% wood.
    bushDrops: { heart: 0.02, shell: 0.05, wood: 0.2 },
    dropSeconds: 8,
    // Half hearts a heart drop heals (enemy drops reuse it).
    heartDropHeal: 2,
    berriesPerPick: 2,
  });

  // A picked berry bush, only ever put down for a visit by VL.setRoomTile.
  VL.extendTileset('base', { u: { solid: true, bush: true, berry: true, picked: true, art: 'berryPicked' } });
  VL.ART.defineTileStyle('berryPicked', {
    under: 'grass',
    shadow: (ctx, cell) => VL.ART.rect(ctx, 'shadow', cell.x + 2, cell.y + 12, 13, 3),
    raised: (ctx, cell) => VL.ART.drawSprite(ctx, 'tile-bush', cell.x, cell.y + 3),
  });

  VL.defineSfx('rustle', [
    { wave: 'noise', dur: 0.16, vol: 0.5, filter: { type: 'bandpass', freq: 2400, to: 900, q: 1.2 } },
    { wave: 'noise', at: 0.05, dur: 0.12, vol: 0.4, filter: { type: 'highpass', freq: 3000 } },
  ], { gap: 0.06 });
  VL.SOUND.onEvent('bushCut', 'rustle');

  VL.bushDrop = function bushDrop(roll) {
    const { heart, shell, wood } = VL.TUNING.bushDrops;
    if (roll < heart) return 'heart';
    if (roll < heart + shell) return 'shell';
    if (roll < heart + shell + wood) return 'wood';
    return null;
  };

  const roomTile = (state, tx, ty) => VL.tileInfo(state.room.area, VL.tileAt(state.room.area, state.room.screen, tx, ty, state.room));
  const inside = (tx, ty) => tx >= 0 && ty >= 0 && tx < VL.TUNING.cols && ty < VL.TUNING.rows;

  VL.isCuttable = (state, tx, ty) => inside(tx, ty) && Boolean(roomTile(state, tx, ty).cuttable);
  VL.isBerryBush = (state, tx, ty) => inside(tx, ty) && Boolean(roomTile(state, tx, ty).berry);

  // A flag that only ever turns on: a lock's `reached`, saved with the next earning.
  function firstTime(state, flag) {
    if (state.flags[flag]) return;
    state.flags[flag] = true;
    VL.earned(state);
  }

  // `how` is 'sword' or 'hands'. True when there was a bush to take.
  VL.cutBush = function cutBush(state, tx, ty, how) {
    if (!VL.isCuttable(state, tx, ty)) return false;
    const info = roomTile(state, tx, ty);
    VL.setRoomTile(state, tx, ty, info.cutTo || '.');
    const born = state.time;
    state.room.entities.push({ type: 'leaves', x: tx, y: ty, born });
    const kind = VL.bushDrop(VL.random(state));
    if (kind) state.room.entities.push({ type: 'drop', kind, x: tx, y: ty, born });
    firstTime(state, how === 'sword' ? 'cutBush' : 'pulledBush');
    state.events.push({ type: 'bushCut', tx, ty, how, drop: kind });
    return true;
  };

  VL.pickBerries = function pickBerries(state, tx, ty) {
    if (!VL.isBerryBush(state, tx, ty)) return false;
    if (roomTile(state, tx, ty).picked) return false;
    VL.setRoomTile(state, tx, ty, 'u');
    VL.addResource(state, 'berries', VL.TUNING.berriesPerPick);
    firstTime(state, 'pickedBerries');
    VL.showPopup(state, 'berries');
    state.events.push({ type: 'pickup', kind: 'berries' });
    return true;
  };

  VL.definePopup('berries', {
    title: 'Berries!',
    text: 'Eat one to heal a heart: choose the berries on the E screen and press S. They grow back on the bush.',
  });

  // Leaves settle and uncollected drops fade. `age` is for drawing: draw
  // hooks get the render clock, not the game's.
  VL.LEAVES_SECONDS = 0.45;
  VL.defineSystem('foliage', {
    order: 40,
    update(state) {
      const now = state.time;
      state.room.entities = state.room.entities.filter((e) => {
        if (e.type !== 'leaves' && e.type !== 'drop') return true;
        e.age = now - e.born;
        return e.age < (e.type === 'leaves' ? VL.LEAVES_SECONDS : VL.TUNING.dropSeconds);
      });
    },
  });

  // ---------- the progression table ----------

  // A berry bush is a place: reached once the hero has been on a screen with one.
  const berryScreens = () => {
    const keys = [];
    for (const [areaId, area] of Object.entries(VL.AREAS)) {
      for (const [key, screen] of Object.entries(area.screens)) {
        if (screen.tiles.some((row) => [...row].some((ch) => VL.tileInfo(areaId, ch).berry))) keys.push(`${areaId}:${key}`);
      }
    }
    return keys;
  };
  VL.defineLock('berryBush', { ...VL.LOCKS.berryBush, reached: (state) => berryScreens().some((key) => state.visited[key]) });
  VL.defineLock('berries', { ...VL.LOCKS.berries, reached: (state) => Boolean(state.flags.pickedBerries) });
  VL.defineLock('bushBareHands', { ...VL.LOCKS.bushBareHands, reached: (state) => Boolean(state.flags.pulledBush) });
  VL.defineLock('bushCut', { ...VL.LOCKS.bushCut, reached: (state) => Boolean(state.flags.cutBush) });
})();
