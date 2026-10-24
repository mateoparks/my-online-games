// { type: 'pushBlock', x, y, once = true }: a stone block the hero slides a
// tile by walking into it (systems/dungeon.js). It moves once per visit
// unless `once: false`, never onto a wall, another thing or the edge row,
// and is back where the map puts it on every re-entry: a block can never be
// saved into a spot that leaves a puzzle unsolvable.
(() => {
  VL.ART.defineSprite('prop-push-block', {
    outline: false,
    colors: { o: 'outline', s: 'dgnStone', d: 'dgnStoneDark', l: 'dgnStoneLight' },
    rows: [
      '.oooooooooooooo.',
      'ollllllllllllldo',
      'olsssssssssssddo',
      'olsssssssssssddo',
      'olsslllllllssddo',
      'olsslsssssslsddo',
      'olsslsssssslsddo',
      'olsslsssssslsddo',
      'olsslllllllssddo',
      'olsssssssssssddo',
      'olsssssssssssddo',
      'olsssssssssssddo',
      'olddddddddddddo.',
      '.oooooooooooooo.',
    ],
  });

  VL.defineEntity('pushBlock', {
    solid: true,
    passable: () => false,
    prepare(state, copy) {
      copy.pushed = false;
      copy.slide = null;
      copy.pushT = 0;
    },
    draw(ctx, block, x, y) {
      const { tile, blockSlideSeconds } = VL.TUNING;
      let dx = 0;
      let dy = 0;
      if (block.slide) {
        const k = 1 - Math.min(1, block.slide.t / blockSlideSeconds);
        dx = -block.slide.dx * k * tile;
        dy = -block.slide.dy * k * tile;
      }
      VL.ART.drawShadow(ctx, x + 8 + dx, y + 14 + dy, 15);
      VL.ART.drawSprite(ctx, 'prop-push-block', Math.round(x + dx), Math.round(y + dy));
    },
  });
})();
