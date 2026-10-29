// { type: 'bigChest', id, item, keptOnLeaving? }: a dungeon's own treasure
// (the Lifting Gloves), solid; S opens it once for good (`found:<id>`). A worn
// item is worn at once, anything else goes in a hand like a chest's.
// `keptOnLeaving` (the Mirror Shield across the lava, W42): the item is his at
// once but counts only once he walks off the screen alive. Until then it is
// `pendingChest` (saved), and a faint or a reload puts it back in the chest.
(() => {
  VL.extendGame('pendingChest', () => ({ pendingChest: null }));

  // Undoes a pending chest: the item gone, the hands as they were before it,
  // the chest shut again (in this room too). Returns the item's id, or null.
  VL.returnPendingChest = function returnPendingChest(state) {
    const pending = state.pendingChest;
    if (!pending) return null;
    state.pendingChest = null;
    delete state.items[pending.item];
    delete state.flags[`found:${pending.id}`];
    state.hands = { ...state.hands, ...pending.hands };
    VL.tidyHands(state);
    const queue = state.popups?.queue;
    if (queue?.includes(pending.item)) queue.splice(queue.indexOf(pending.item), 1);
    if (state.room?.area === pending.area && state.room.screen === pending.screen) {
      const chest = state.room.entities.find((e) => e.type === 'bigChest' && e.id === pending.id);
      if (chest) chest.opened = false;
    }
    VL.earned(state);
    return pending.item;
  };

  VL.onFaint((state) => {
    const item = VL.returnPendingChest(state);
    if (item) state.fainted.returned = item;
  });
  VL.onLoad((state) => VL.returnPendingChest(state));

  // Off the screen alive: the item is his for good.
  VL.defineSystem('pendingChestKept', {
    order: 13,
    update(state) {
      const pending = state.pendingChest;
      if (!pending || state.fainted || state.hp <= 0) return;
      if (state.player.area === pending.area && state.player.screen === pending.screen) return;
      state.pendingChest = null;
      VL.earned(state);
    },
  });

  const trim = { o: 'outline', d: 'dgnStoneDark', s: 'dgnStone', l: 'dgnStoneLight', g: 'gold', y: 'goldLight', w: 'woodDark', k: 'doorway', r: 'heart' };
  VL.ART.defineSprite('prop-big-chest', {
    colors: trim,
    rows: [
      '..gggggggggggg..',
      '.gyyyyyyyyyyyyg.',
      'gyssssssssssssyg',
      'gslllllllllllsdg',
      'gssssssssssssssg',
      'gggggggyyggggggg',
      'gsssssgrrgssssdg',
      'gsllssgyygsssdsg',
      'gssssssggssssssg',
      'gssssssssssssddg',
      'gggggggggggggggg',
    ],
  });
  VL.ART.defineSprite('prop-big-chest-open', {
    colors: trim,
    rows: [
      '..gggggggggggg..',
      '.gyyyyyyyyyyyyg.',
      'gkkkkkkkkkkkkkkg',
      'gkkkkkkkkkkkkkkg',
      'gkkkkkkkkkkkkkkg',
      'gggggggggggggggg',
      'gsssssgyygssssdg',
      'gsllssgggsssssdg',
      'gssssssssssssssg',
      'gssssssssssssddg',
      'gggggggggggggggg',
    ],
  });

  VL.defineEntity('bigChest', {
    solid: true,
    prepare(state, chest) {
      chest.opened = VL.spotFound(state, chest.id);
    },
    onInteract(state, chest) {
      if (chest.opened) return;
      if (chest.keptOnLeaving && !state.items[chest.item]) {
        state.pendingChest = { id: chest.id, item: chest.item, area: state.room.area, screen: state.room.screen, hands: { ...state.hands } };
      }
      chest.opened = true;
      VL.markFound(state, chest.id);
      if (VL.ITEMS[chest.item].worn) VL.giveWornItem(state, chest.item);
      else VL.giveItem(state, chest.item);
      VL.holdUp(state, VL.itemSprite(chest.item), { sound: 'fanfare' });
      VL.earned(state);
      state.events.push({ type: 'bigChestOpened', item: chest.item });
    },
    draw(ctx, chest, x, y, t) {
      VL.ART.drawShadow(ctx, x + 8, y + 14, 16);
      VL.ART.drawSprite(ctx, chest.opened ? 'prop-big-chest-open' : 'prop-big-chest', x - 1, y + 2);
      if (!chest.opened) VL.ART.drawSparkle(ctx, x + 12, y + 3, t);
    },
  });
})();
