// { type: 'saveStatue', x, y }: the save statue at a dungeon entrance
// (design: Starting and saving). (x, y) is the step in front of it, where
// standing saves and sets the respawn point; the statue stands in the wall
// niche above, so the tile at (x, y - 1) must be a wall.
(() => {
  VL.ART.defineSprite('prop-statue', {
    colors: { s: 'dgnStone', d: 'dgnStoneDark', l: 'dgnStoneLight', y: 'goldLight', g: 'gold' },
    rows: [
      '....lll....',
      '...lsssl...',
      '...lsdsl...',
      '....sss....',
      '..llsssll..',
      '.lsssssssl.',
      '.lssygyssl.',
      '.lsssgsssl.',
      '.lsssssssl.',
      '..dsssssd..',
      '..dsssssd..',
      '.ddddddddd.',
      'lllllllllll',
      'ddddddddddd',
    ],
  });

  VL.defineEntity('saveStatue', {
    onStand(state, statue) {
      VL.touchSavePoint(state, { area: state.player.area, screen: state.player.screen, tx: statue.x, ty: statue.y, facing: 'down' });
      state.events.push({ type: 'statue' });
      state.dungeonNote = { text: 'The statue glows. Your journey is saved.', t: 0 };
    },
    draw(ctx, statue, x, y, t) {
      VL.ART.drawSprite(ctx, 'prop-statue', x + 2, y - 11);
      if (Math.floor(t * 2) % 3 === 0) VL.ART.drawSparkle(ctx, x + 8, y - 6, t);
    },
  });
})();
