// { type: 'ore', id, wet }: a lump of ore glinting where it lies, picked up
// once by walking onto it. W5 fills two ore spots: the first lump in the
// shallows by the hut, easy to find, and one in the Woods dead end (design:
// Tools, Ore is scarce (1) and (3)).
(() => {
  // Dark iron laced with gold veins, so it never passes for a plain grey stone.
  VL.ART.defineSprite('pickup-ore', {
    colors: { d: 'rockDark', m: 'rockShade', l: 'rock', g: 'goldLight', y: 'gold', w: 'flowerWhite' },
    rows: ['..dmmmd..', '.mlywlmmd', 'mlgmmymgd', 'mmylmgymd', '.mmgmmmd.', '..ddddd..'],
  });
  VL.ART.defineSprite('icon-ore', {
    outline: false,
    colors: { d: 'rockDark', m: 'rockShade', l: 'rock', g: 'goldLight', y: 'gold' },
    rows: ['.mmmm.', 'mlyglm', 'mgmmym', '.dddd.'],
  });

  VL.definePopup('ore', { title: 'A lump of ore!', text: 'It glints like metal. A blacksmith could forge it into something strong.' });

  VL.defineEntity('ore', {
    prepare: (state, lump) => !VL.spotFound(state, lump.id),
    onStand(state, lump) {
      state.room.entities = state.room.entities.filter((e) => e !== lump);
      state.room.standingOn = null;
      VL.markFound(state, lump.id);
      VL.addResource(state, 'ore', 1);
      VL.showPopup(state, 'ore');
      state.events.push({ type: 'pickup', kind: 'ore' });
    },
    draw(ctx, lump, x, y, t) {
      VL.ART.drawSprite(ctx, 'pickup-ore', x + 3, y + 6);
      if (lump.wet) {
        // Water laps over its foot.
        const lap = Math.sin(t * 2.4) > 0 ? 1 : 0;
        VL.ART.rect(ctx, 'shallowLight', x + 2 + lap, y + 12, 5, 1);
        VL.ART.rect(ctx, 'foam', x + 8 - lap, y + 12, 5, 1);
      }
      VL.ART.drawSparkle(ctx, x + 10, y + 7, t * 0.8);
    },
  });

  VL.fillSpot('oreShallows', { type: 'ore', id: 'oreShallows', wet: true });
  VL.fillSpot('oreWoods', { type: 'ore', id: 'oreWoods' });

  VL.defineLock('oreShallows', { ...VL.LOCKS.oreShallows, reached: (state) => VL.spotFound(state, 'oreShallows') });
})();
