// { type: 'savePoint', x, y }: a lantern on the floor. Standing on it makes
// this the place the hero wakes up after fainting (and saves the game).
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

  VL.defineEntity('savePoint', {
    onStand(state, point) {
      VL.touchSavePoint(state, { area: state.player.area, screen: state.player.screen, tx: point.x, ty: point.y, facing: 'down' });
      // Notes are drawn by the dungeon readout, so only inside one (the wreck).
      const note = VL.dungeonOf(state) && VL.savedNote(state);
      if (note) state.dungeonNote = { text: note, t: 0 };
    },
    draw(ctx, point, x, y, t) {
      VL.ART.drawShadow(ctx, x + 8, y + 13, 9);
      VL.ART.drawSprite(ctx, Math.floor(t * 3) % 2 ? 'prop-lantern-1' : 'prop-lantern', x + 4, y + 3);
    },
  });
})();
