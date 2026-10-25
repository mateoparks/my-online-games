// { type: 'chest', id, x, y, contents: [{ item } | { resource, amount } |
// { smallKey: '<dungeon>' }] }: solid; S facing it opens it once for good
// (saved as the `found:<id>` flag). A small key is the named dungeon's
// (systems/dungeon.js, VL.giveSmallKey).
// The hut's chest holds the wood sword and shield (design: The path through
// the game, 1).
(() => {
  const wood = { o: 'outline', d: 'woodDark', w: 'wood', l: 'woodLight', g: 'gold', y: 'goldLight', k: 'doorway', m: 'metalDark' };
  VL.ART.defineSprite('prop-chest', {
    colors: wood,
    rows: [
      '.dddddddddddd.',
      'dllllllllllllm',
      'dlwwwwwwwwwwwm',
      'dwwwwwwwwwwwwm',
      'dddddddgdddddd',
      'dwwwwwwyywwwwm',
      'dlwwwwwggwwwwm',
      'dlwwwwwwwwwwwm',
      'dwwwwwwwwwwwwm',
      'dddddddddddddd',
    ],
  });
  VL.ART.defineSprite('prop-chest-open', {
    colors: wood,
    rows: [
      '.dddddddddddd.',
      'dllllllllllllm',
      'dkkkkkkkkkkkkm',
      'dkkkkkkkkkkkkm',
      'dddddddddddddd',
      'dwwwwwwyywwwwm',
      'dlwwwwwggwwwwm',
      'dlwwwwwwwwwwwm',
      'dwwwwwwwwwwwwm',
      'dddddddddddddd',
    ],
  });

  const found = (state, id) => Boolean(state.flags[`found:${id}`]);
  const RESOURCE_ICONS = { wood: 'icon-wood', shells: 'icon-shell', brokenShells: 'icon-shell-broken', berries: 'icon-berry', ore: 'icon-ore', paper: 'icon-paper', ink: 'icon-ink' };

  VL.defineEntity('chest', {
    solid: true,
    prepare(state, chest) {
      chest.opened = found(state, chest.id);
    },
    onInteract(state, chest) {
      if (chest.opened || found(state, chest.id)) return;
      chest.opened = true;
      state.flags[`found:${chest.id}`] = true;
      for (const thing of chest.contents || []) {
        if (thing.item) VL.giveItem(state, thing.item);
        else if (thing.smallKey) VL.giveSmallKey(state, thing.smallKey);
        else VL.addResource(state, thing.resource, thing.amount ?? 1);
        const sprite = thing.item ? VL.itemSprite(thing.item) : thing.smallKey ? 'item-small-key' : RESOURCE_ICONS[thing.resource];
        if (sprite) VL.holdUp(state, sprite);
      }
      VL.earned(state);
      state.events.push({ type: 'pickup', kind: 'chest' });
    },
    draw(ctx, chest, x, y) {
      VL.ART.drawShadow(ctx, x + 8, y + 13, 14);
      VL.ART.drawSprite(ctx, chest.opened ? 'prop-chest-open' : 'prop-chest', x + 1, y + 3);
    },
  });

  VL.defineLock('chestGear', { ...VL.LOCKS.chestGear, reached: (state) => found(state, 'hutChest') });
})();
