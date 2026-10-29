// { type: 'savePoint', x, y, on? }: a save lantern (W44). Standing on it
// saves the game, waking here after a faint or Continue. With `on:
// 'nightstand'` it sits on the furniture above (x, y), the step in front.
(() => {
  const lantern = { m: 'metal', g: 'foam', y: 'gold', Y: 'goldLight', d: 'woodDark' };
  VL.ART.defineSprite('prop-lantern', {
    colors: lantern,
    rows: ['...m...', '..mmm..', '.mgggm.', '.mgYgm.', '.mYYYm.', '.mgygm.', '.mgggm.', '..mmm..', '..ddd..'],
  });
  VL.ART.defineSprite('prop-lantern-1', {
    colors: lantern,
    rows: ['...m...', '..mmm..', '.mgggm.', '.mgggm.', '.mgYgm.', '.myYym.', '.mgygm.', '..mmm..', '..ddd..'],
  });

  const LANTERN_WORDS = {
    saved: 'The lantern glows. Your journey is saved.',
    failed: 'The lantern glows. Could not save yet; still trying.',
  };

  VL.defineEntity('savePoint', {
    onStand(state, point) {
      VL.touchSavePoint(state, { area: state.player.area, screen: state.player.screen, tx: point.x, ty: point.y, facing: point.on ? 'up' : 'down' });
      // Notes are drawn by the dungeon readout, so only inside one (the
      // wreck); the app switches the words once the write lands or fails.
      if (VL.dungeonOf(state)) state.dungeonNote = { text: LANTERN_WORDS.saved, t: 0, saving: LANTERN_WORDS };
    },
    draw(ctx, point, x, y, t) {
      const sprite = Math.floor(t * 3) % 2 ? 'prop-lantern-1' : 'prop-lantern';
      if (point.on) {
        VL.ART.drawSprite(ctx, sprite, x + 4, y - 18);
        return;
      }
      VL.ART.drawShadow(ctx, x + 8, y + 13, 9);
      VL.ART.drawSprite(ctx, sprite, x + 4, y + 3);
    },
  });
})();
