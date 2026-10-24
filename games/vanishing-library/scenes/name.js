// Name entry, typed into an on-canvas field (design: everything on the
// canvas). Enter starts the game in the chosen slot; Esc goes back.
(() => {
  VL.NAME_MAX = 12;
  VL.DEFAULT_NAME = 'Hero';

  // A game exists only once a name was chosen (the default counts).
  VL.defineLock('named', {
    type: 'flag', doc: '§ Starting and saving: Title screen',
    reached: (state) => typeof state.name === 'string' && state.name.length > 0,
  });
  const FIELD = { x: 64, y: 84, w: 128, h: 20 };

  // Letters and digits as typed; anything the font cannot draw is dropped.
  const typeable = (ch) => ch >= ' ' && ch !== '\u007f' && VL.ART.missingGlyphs(ch).length === 0;

  VL.defineScene('name', {
    // Typing goes into the field: letter shortcuts (such as N for mute) stay off here.
    textEntry: true,
    enter(app, data) {
      app.naming = { slot: data?.slot ?? 0, text: '' };
    },

    update(app, actions) {
      const naming = app.naming;
      for (const ch of actions.typed) {
        if (ch === '\b') naming.text = naming.text.slice(0, -1);
        else if (naming.text.length < VL.NAME_MAX && typeable(ch)) naming.text += ch;
      }
      if (actions.pressed.pause) {
        app.setScene('title', { slot: naming.slot });
        return;
      }
      if (!actions.pressed.confirm) return;
      const name = naming.text.trim() || VL.DEFAULT_NAME;
      // Each adventure rolls its own drops.
      const seed = (Date.now() ^ Math.floor(Math.random() * 0x100000000)) >>> 0;
      app.startGame(VL.newGame({ name, seed }), naming.slot, { fresh: true });
      app.save();
      app.setScene('intro');
    },

    draw(ctx, app, t) {
      const { width } = VL.TUNING;
      const { text } = app.naming;
      VL.ART.text(ctx, 'Name your hero', width / 2, 44, { size: 'large', align: 'center', color: 'goldLight', shadow: 'outline' });
      VL.ART.drawBox(ctx, FIELD.x, FIELD.y, FIELD.w, FIELD.h);
      const textX = FIELD.x + 8;
      const textY = FIELD.y + 6;
      if (text) VL.ART.text(ctx, text, textX, textY, { color: 'text' });
      else VL.ART.text(ctx, VL.DEFAULT_NAME, textX, textY, { color: 'slotEmpty' });
      if (Math.floor(t * 2) % 2 === 0) {
        const caretX = textX + (text ? VL.ART.measureText(text) + 1 : 0);
        VL.ART.rect(ctx, 'goldLight', caretX, textY - 1, 1, 9);
      }
      VL.ART.text(ctx, `${text.length}/${VL.NAME_MAX}`, FIELD.x + FIELD.w, FIELD.y + FIELD.h + 4, { size: 'small', align: 'right', color: 'textDim' });
      VL.ART.text(ctx, 'TYPE A NAME, THEN PRESS ENTER', width / 2, 124, { size: 'small', align: 'center', color: 'textDim' });
      VL.ART.text(ctx, 'ESC: BACK', width / 2, 134, { size: 'small', align: 'center', color: 'textDim' });
    },
  });
})();
