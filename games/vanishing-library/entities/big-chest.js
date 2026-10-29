// { type: 'bigChest', id, item }: a dungeon's own treasure (the Lifting
// Gloves), solid; S opens it once for good (`found:<id>`). A worn item is
// worn at once, anything else goes in a hand like a chest's.
(() => {
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
      chest.opened = true;
      VL.markFound(state, chest.id);
      if (VL.ITEMS[chest.item].worn) VL.giveWornItem(state, chest.item);
      else VL.giveItem(state, chest.item);
      VL.holdUp(state, VL.itemSprite(chest.item), { sound: 'fanfare' });
      state.events.push({ type: 'bigChestOpened', item: chest.item });
    },
    draw(ctx, chest, x, y, t) {
      VL.ART.drawShadow(ctx, x + 8, y + 14, 16);
      VL.ART.drawSprite(ctx, chest.opened ? 'prop-big-chest-open' : 'prop-big-chest', x - 1, y + 2);
      if (!chest.opened) VL.ART.drawSparkle(ctx, x + 12, y + 3, t);
    },
  });
})();
