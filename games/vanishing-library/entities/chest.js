// { type: 'chest', id, x, y, contents: [{ item } | { resource, amount } |
// { smallKey: '<dungeon>' }], found?: { title, text } }: solid; S facing it
// opens it once for good (saved as the `found:<id>` flag) and shows `found`,
// if any. A small key is the named dungeon's (systems/dungeon.js,
// VL.giveSmallKey). Shells that would not all fit in the purse leave it shut,
// and it says so (W38), so a full purse never throws a chest's shells away.
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
      const over = (chest.contents || []).find((thing) => {
        const cap = thing.resource && VL.RESOURCE_CAPS?.[thing.resource];
        return cap && VL.purse(state, thing.resource) + (thing.amount ?? 1) > cap.most(state);
      });
      if (over) {
        const amount = over.amount ?? 1;
        VL.showMessage(state, {
          title: 'Not enough room!',
          text: `There ${amount === 1 ? 'is' : 'are'} ${amount} ${VL.currencyName(over.resource, amount)} in this chest, but they won't all fit. Spend a few and come back for them!`,
        });
        return;
      }
      chest.opened = true;
      state.flags[`found:${chest.id}`] = true;
      for (const thing of chest.contents || []) {
        if (thing.item) VL.giveItem(state, thing.item);
        else if (thing.smallKey) VL.giveSmallKey(state, thing.smallKey);
        else VL.addResource(state, thing.resource, thing.amount ?? 1);
        const sprite = thing.item ? VL.itemSprite(thing.item) : thing.smallKey ? 'item-small-key' : RESOURCE_ICONS[thing.resource];
        if (sprite) VL.holdUp(state, sprite);
      }
      if (chest.found) VL.showMessage(state, chest.found);
      state.events.push({ type: 'pickup', kind: 'chest' });
    },
    draw(ctx, chest, x, y) {
      VL.ART.drawShadow(ctx, x + 8, y + 13, 14);
      VL.ART.drawSprite(ctx, chest.opened ? 'prop-chest-open' : 'prop-chest', x + 1, y + 3);
    },
  });

  VL.defineLock('chestGear', { ...VL.LOCKS.chestGear, reached: (state) => found(state, 'hutChest') });
})();
