// The seven save lanterns (W44, Matthew's notes): the hut's on its
// nightstand, the library's, one just outside each dungeon door (the Woods'
// on the screen below the Hollow Oak, open before the map is copied) and
// the shipwreck's below deck. Last in the dungeons so every screen exists.
// The hut's and the wreck's stand in their own files; this places the rest.
// README "Saving".
(() => {
  VL.SAVE_LANTERNS = {
    hut: { ...VL.HOME_SAVE },
    library: { area: 'library', screen: '0,0', tx: 13, ty: 8, facing: 'down' },
    scriptorium: { area: 'overworld', screen: '2,-2', tx: 10, ty: 4, facing: 'down', dungeon: 'scriptorium' },
    woods: { area: 'overworld', screen: '7,-1', tx: 10, ty: 5, facing: 'down', dungeon: 'hollowOak' },
    lighthouse: { area: 'overworld', screen: '-1,1', tx: 5, ty: 5, facing: 'down', dungeon: 'lighthouse' },
    wreck: { area: 'wreck', screen: '0,0', tx: 7, ty: 3, facing: 'down', dungeon: 'wreck' },
    lair: { area: 'overworld', screen: '-1,-5', tx: 10, ty: 5, facing: 'down', dungeon: 'lair' },
  };

  for (const id of ['library', 'scriptorium', 'woods', 'lighthouse', 'lair']) {
    const { area, screen, tx, ty } = VL.SAVE_LANTERNS[id];
    VL.getScreen(area, screen).entities.push({ type: 'savePoint', x: tx, y: ty });
  }

  const samePlace = (a, b) => a.area === b.area && a.screen === b.screen && a.tx === b.tx && a.ty === b.ty;
  const onLantern = (point) => VL.screenExists(point.area, point.screen)
    && VL.getScreen(point.area, point.screen).entities.some((e) => e.type === 'savePoint' && e.x === point.tx && e.y === point.ty);

  // An older save's save point that is no lantern now: an entrance statue
  // or a boss's warp landing wakes him at the lantern outside that dungeon,
  // and the hut's old spots at its lantern. Anything else is left as it was.
  VL.lanternForOldPoint = function lanternForOldPoint(point) {
    if (!point || typeof point !== 'object' || onLantern(point)) return point;
    const dungeon = Object.values(VL.DUNGEONS).find((d) => point.area === d.area || samePlace(point, d.entrance));
    if (dungeon) {
      const lantern = Object.values(VL.SAVE_LANTERNS).find((l) => l.dungeon === dungeon.id);
      const { area, screen, tx, ty, facing } = lantern || dungeon.entrance;
      return { area, screen, tx, ty, facing: facing || 'down' };
    }
    if (point.area === VL.HOME_SAVE.area) return { ...VL.HOME_SAVE };
    return point;
  };

  // W42's Mirror Shield waited in `pendingChest` until he left the lava room
  // alive; a save written before then puts it back in its chest, as a load
  // did then. The field is gone now (a faint goes back to the save anyway).
  function returnPendingChest(save) {
    const pending = save.pendingChest;
    const { pendingChest, ...out } = save;
    if (!pending) return out;
    const items = { ...out.items };
    delete items[pending.item];
    const flags = { ...out.flags };
    delete flags[`found:${pending.id}`];
    const queue = (out.popups?.queue || []).filter((id) => id !== pending.item);
    return { ...out, items, flags, hands: { ...out.hands, ...pending.hands }, popups: out.popups && { ...out.popups, queue } };
  }

  VL.defineMigration(2, (save) => ({ ...returnPendingChest(save), savePoint: VL.lanternForOldPoint(save.savePoint ?? null) }));
})();
