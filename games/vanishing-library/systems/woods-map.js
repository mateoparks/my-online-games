// The Whispering Woods' gate (design: The world, "You need the copied map to
// get through"; W34: Matthew's way). The Woods are open to explore without
// the map, but the pass below the Hollow Oak is all trees until the copy
// opens one; the copy blinks where the hero stands. README "The Whispering
// Woods (W15)".
(() => {
  // The edge of the Woods by the road (a start for reachability checks).
  VL.WOODS_ENTRY = { area: 'overworld', screen: '5,-1', tx: 6, ty: 9, facing: 'down' };

  VL.definePopup('woodsWithMap', {
    title: 'The Whispering Woods',
    text: 'Your copy of the mural shows the way through these woods. Open it from your equipment (E) whenever the paths start to twist!',
  });

  const inWoods = (area, key) => area === 'overworld' && VL.regionOf(area, key) === 'woods';
  const hasMap = (state) => VL.hasItem(state, 'woodsMapCopy');

  // Trees close the pass below the Hollow Oak; with the copy in hand, one of
  // them is a dirt path for good. Checked as rooms are built and every step,
  // so a save that copied the map before the trees grew finds it open too.
  VL.WOODS_GATE_TREE = { area: 'overworld', screen: '7,-1', tx: 7, ty: 2, opensTo: 'P' };
  function openWoodsPath(state) {
    const gate = VL.WOODS_GATE_TREE;
    if (!hasMap(state) || VL.savedTile(state, gate.area, gate.screen, gate.tx, gate.ty)) return;
    VL.saveTile(state, gate.tx, gate.ty, gate.opensTo, gate);
  }
  VL.onRoomBuilt(openWoodsPath);
  VL.defineSystem('woodsPath', { order: 96, update: openWoodsPath });

  // The Woods screen the hero stands on, for the copy's "you are here".
  VL.woodsMapHere = (state) => (state?.player && inWoods(state.player.area, state.player.screen) ? state.player.screen : null);

  // ---------- telling the player ----------

  VL.defineSystem('woodsMap', {
    order: 12,
    update(state) {
      for (const event of state.events) {
        if (event.type === 'enterScreen' && inWoods(event.area, event.screen) && hasMap(state)) {
          VL.showPopup(state, 'woodsWithMap');
        }
      }
    },
  });
})();
