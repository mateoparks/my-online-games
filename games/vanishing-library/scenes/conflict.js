// Another window saved this slot since this one read it (two tabs, or a tab
// left open from last class). The newer progress stays; this window stops
// writing and goes back to the title.
(() => {
  VL.ART.addColors({ conflictShade: '#1b1b24b0' });
  const BOX = { x: 20, y: 60, w: 216, h: 68 };
  const LINES = ['This save was changed', 'in another window.', 'The newer game is kept.'];

  VL.defineScene('conflict', {
    update(app, actions) {
      if (VL.confirmed(actions)) app.quit();
    },

    draw(ctx, app, t) {
      if (app.game) VL.drawWorld(ctx, app.game, t);
      VL.ART.rect(ctx, 'conflictShade', 0, 0, VL.TUNING.width, VL.TUNING.height);
      VL.ART.drawBox(ctx, BOX.x, BOX.y, BOX.w, BOX.h);
      const centre = VL.TUNING.width / 2;
      LINES.forEach((line, i) => VL.ART.text(ctx, line, centre, BOX.y + 8 + i * 12, { align: 'center', color: i === 0 ? 'goldLight' : 'text', shadow: i === 0 ? 'boxShade' : undefined }));
      if (Math.floor(t * 2.5) % 2 === 0) VL.ART.text(ctx, 'S: BACK TO THE TITLE', centre, BOX.y + BOX.h - 12, { size: 'small', align: 'center', color: 'goldLight' });
    },
  });
})();
