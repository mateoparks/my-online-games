// The intro: a black screen where three lines of weathered white script fade
// in one after another (design: Starting and saving). Skippable with S,
// Space or Enter; ends by itself.
(() => {
  VL.INTRO_LINES = [
    'In a world where books mysteriously disappear,',
    'one brave adventurer has set out',
    'to save his culture from oblivion...',
  ];
  const lineDelay = 2.4;
  const fade = 1.2;
  VL.INTRO = { lineDelay, fade, hold: 2.6, skipAfter: 0.5, total: lineDelay * 2 + fade + 2.6 };
  const WRAP_WIDTH = 232;
  const LINE_TOP = 52;
  const LINE_SPACING = 36;
  // Weathering dims a share of the letter pixels rather than removing them,
  // so an eaten crossbar cannot turn "where" into "whare".
  const EROSION = 0.3;
  const EROSION_ALPHA = 0.55;
  VL.ART.addColors({ introBlack: '#000000' });

  VL.defineScene('intro', {
    enter(app) {
      app.intro = { t: 0 };
    },

    update(app, actions, dt) {
      const intro = app.intro;
      intro.t += dt;
      if ((intro.t > VL.INTRO.skipAfter && VL.confirmed(actions)) || intro.t >= VL.INTRO.total) {
        // The controls are taught once, as play begins (design: Controls).
        if (app.game) VL.showPopup(app.game, 'controls');
        app.setScene('play');
      }
    },

    draw(ctx, app, t) {
      const { width, height } = VL.TUNING;
      const elapsed = app.intro.t;
      const line = VL.ART.lineHeight('normal');
      VL.ART.rect(ctx, 'introBlack', 0, 0, width, height);
      VL.INTRO_LINES.forEach((content, i) => {
        const alpha = VL.clamp((elapsed - i * lineDelay) / fade, 0, 1);
        if (alpha <= 0) return;
        const rows = VL.ART.wrapText(content, WRAP_WIDTH);
        ctx.save();
        rows.forEach((row, r) => {
          const y = LINE_TOP + i * LINE_SPACING + r * line;
          ctx.globalAlpha = alpha;
          const w = VL.ART.text(ctx, row, width / 2, y, { align: 'center', color: 'white' });
          ctx.globalAlpha = alpha * EROSION_ALPHA;
          const left = Math.round(width / 2 - w / 2);
          for (let py = 0; py < 7; py += 1) {
            for (let px = 0; px < w; px += 1) {
              if (VL.ART.hash(left + px, y + py, i) < EROSION) VL.ART.rect(ctx, 'introBlack', left + px, y + py, 1, 1);
            }
          }
        });
        ctx.restore();
      });
      if (elapsed > VL.INTRO.skipAfter && Math.floor(t * 2) % 2 === 0) {
        VL.ART.text(ctx, 'S: SKIP', width - 8, 180, { size: 'small', align: 'right', color: 'textDim' });
      }
    },
  });
})();
