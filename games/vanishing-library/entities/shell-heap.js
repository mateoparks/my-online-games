// { type: 'shellHeap', x, y }: a heap of broken shells the storms washed in.
// S tops the hero's broken shells up to TUNING.shellHeapFill, as often as he
// likes, so a kid with the Slingshot never runs dry in a dungeon (design:
// The path through the game, 6; playtest decisions: broken shells common).
(() => {
  VL.tune({ shellHeapFill: 15 });

  VL.ART.defineSprite('prop-shell-heap', {
    outline: false,
    colors: { s: 'shell', d: 'shellDark', l: 'sandLight', k: 'sandDark' },
    rows: [
      '.....sds.....',
      '...sdsssds...',
      '..ssdslsdss..',
      '.sdsssdsssds.',
      'ssdsldssdslsd',
      'kkdssssdsssdk',
      '.kkkkkkkkkkk.',
    ],
  });

  VL.SHELL_HEAP_WORDS = {
    scooped: (n) => `Broken shells: ${n}. Plenty to shoot!`,
    full: 'Your pockets are full of broken shells.',
  };

  VL.scoopShells = function scoopShells(state) {
    const fill = VL.TUNING.shellHeapFill;
    const have = state.inventory.brokenShells;
    state.flags.lighthouseShells = true;
    VL.earned(state);
    if (have >= fill) {
      state.dungeonNote = { text: VL.SHELL_HEAP_WORDS.full, t: 0 };
      return 0;
    }
    VL.addResource(state, 'brokenShells', fill - have);
    state.dungeonNote = { text: VL.SHELL_HEAP_WORDS.scooped(fill), t: 0 };
    state.events.push({ type: 'pickup', kind: 'brokenShell' });
    return fill - have;
  };

  VL.defineEntity('shellHeap', {
    solid: true,
    glintsInDark: true,
    onInteract(state) {
      VL.scoopShells(state);
    },
    draw(ctx, heap, x, y, t) {
      VL.ART.drawSprite(ctx, 'prop-shell-heap', x + 1, y + 7);
      if (Math.floor(t * 0.7 + heap.x) % 3 === 0) VL.ART.drawSparkle(ctx, x + 11, y + 6, t);
    },
  });
})();
