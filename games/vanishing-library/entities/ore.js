// { type: 'ore', id, x, y }: a lump of ore glinting where it lies, picked up
// once by walking onto it. The first sits in the shallows by the hut, easy to
// find (design: Tools, Ore is scarce (1)).
(() => {
  VL.ART.defineSprite('pickup-ore', {
    colors: { d: 'rockDark', m: 'rock', l: 'rockLight', g: 'goldLight', y: 'gold' },
    rows: ['..mmmm..', '.mlllmm.', 'mllgllmd', 'mlmmlymd', '.dmmmmd.'],
  });
  VL.ART.defineSprite('icon-ore', {
    outline: false,
    colors: { d: 'rockDark', m: 'rock', l: 'rockLight', g: 'goldLight' },
    rows: ['.mmmm.', 'mllglm', 'mlmmmd', '.dddd.'],
  });

  VL.definePopup('ore', { title: 'A lump of ore!', text: 'It glints like metal. A blacksmith could forge it into something strong.' });

  const found = (state, id) => Boolean(state.flags[`found:${id}`]);

  VL.defineEntity('ore', {
    prepare: (state, lump) => !found(state, lump.id),
    onStand(state, lump) {
      state.room.entities = state.room.entities.filter((e) => e !== lump);
      state.room.standingOn = null;
      state.flags[`found:${lump.id}`] = true;
      VL.addResource(state, 'ore', 1);
      VL.showPopup(state, 'ore');
      state.events.push({ type: 'pickup', kind: 'ore' });
    },
    draw(ctx, lump, x, y, t) {
      VL.ART.drawSprite(ctx, 'pickup-ore', x + 4, y + 7);
      // Water laps over its foot.
      const lap = Math.sin(t * 2.4) > 0 ? 1 : 0;
      VL.ART.rect(ctx, 'shallowLight', x + 2 + lap, y + 12, 5, 1);
      VL.ART.rect(ctx, 'foam', x + 8 - lap, y + 12, 5, 1);
      VL.ART.drawSparkle(ctx, x + 10, y + 7, t * 0.8);
    },
  });

  VL.defineLock('oreShallows', { ...VL.LOCKS.oreShallows, reached: (state) => found(state, 'oreShallows') });
})();
