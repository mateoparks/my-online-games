// Name entry, typed into an on-canvas field (design: everything on the
// canvas). Enter starts the game in the chosen slot, or ↓ to START and S;
// Esc goes back.
(() => {
  VL.NAME_MAX = 12;
  VL.DEFAULT_NAME = 'Hero';

  // A game exists only once a name was chosen (the default counts).
  VL.defineLock('named', {
    type: 'flag', doc: '§ Starting and saving: Title screen',
    reached: (state) => typeof state.name === 'string' && state.name.length > 0,
  });
  const FIELD = { x: 64, y: 84, w: 128, h: 20 };
  const START = { x: 100, y: 112, w: 56, h: 14 };

  // Letters and digits as typed; anything the font cannot draw is dropped.
  const typeable = (ch) => ch >= ' ' && ch !== '\u007f' && VL.ART.missingGlyphs(ch).length === 0;

  function typeInto(naming, typed) {
    // NFC joins an accent typed as its own code point (e + ´) into é.
    for (const ch of typed.normalize('NFC')) {
      if (ch === '\b') naming.text = naming.text.slice(0, -1);
      else if (naming.text.length < VL.NAME_MAX && typeable(ch)) naming.text += ch;
    }
  }

  VL.defineScene('name', {
    // Typing goes into the field: letter shortcuts (such as N for mute) stay off here.
    textEntry: true,
    enter(app, data) {
      app.naming = { slot: data?.slot ?? 0, text: '', onStart: false };
      // N is a letter here, so a mute note from the title would only confuse.
      VL.SOUND.clearNote();
      typeInto(app.naming, data?.typed || '');
    },

    update(app, actions) {
      const naming = app.naming;
      const { pressed } = actions;
      // S and Space type their letter too; on START the press is what counts.
      const begin = pressed.confirm || (naming.onStart && VL.confirmed(actions));
      if (naming.onStart && !begin && actions.typed) naming.onStart = false;
      const wasOnStart = naming.onStart;
      if (pressed.up) naming.onStart = false;
      if (pressed.down) naming.onStart = true;
      if (naming.onStart !== wasOnStart && (pressed.up || pressed.down)) VL.sfx('menuMove');
      if (!naming.onStart) typeInto(naming, actions.typed);
      if (actions.pressed.pause) {
        app.setScene('title', { slot: naming.slot });
        return;
      }
      if (!begin) return;
      VL.sfx('menuSelect');
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
      if (!app.naming.onStart && Math.floor(t * 2) % 2 === 0) {
        const caretX = textX + (text ? VL.ART.measureText(text) + 1 : 0);
        VL.ART.rect(ctx, 'goldLight', caretX, textY - 1, 1, 9);
      }
      VL.ART.text(ctx, `${text.length}/${VL.NAME_MAX}`, FIELD.x + FIELD.w, FIELD.y + FIELD.h + 4, { size: 'small', align: 'right', color: 'textDim' });
      const { onStart } = app.naming;
      VL.ART.drawBox(ctx, START.x, START.y, START.w, START.h);
      if (onStart && Math.floor(t * 3) % 4 !== 3) VL.ART.text(ctx, '→', START.x - 12, START.y + 3, { color: 'goldLight' });
      VL.ART.text(ctx, 'START', START.x + START.w / 2, START.y + 3, { align: 'center', color: onStart ? 'goldLight' : 'text' });
      VL.ART.text(ctx, 'TYPE A NAME, THEN PRESS ENTER', width / 2, 136, { size: 'small', align: 'center', color: 'textDim' });
      VL.ART.text(ctx, '↓ THEN S: START   ESC: BACK', width / 2, 146, { size: 'small', align: 'center', color: 'textDim' });
    },
  });
})();
