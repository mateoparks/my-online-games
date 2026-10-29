// Name entry, typed into an on-canvas field (design: everything on the
// canvas), with the hero's look and boy or girl beside it (W37). Enter starts
// the game in the chosen slot, or ↓ to START and S; Esc goes back.
(() => {
  VL.NAME_MAX = 12;
  VL.DEFAULT_NAME = 'Hero';

  // A game exists only once a name was chosen (the default counts).
  VL.defineLock('named', {
    type: 'flag', doc: '§ Starting and saving: Title screen',
    reached: (state) => typeof state.name === 'string' && state.name.length > 0,
  });
  // The chooser beside the name (W37): a live preview on the left, the rows on the right.
  const ROWS = ['name', 'gender', 'outfit', 'hair', 'start'];
  const CHOICES = { gender: () => VL.HERO_GENDERS, outfit: () => VL.HERO_OUTFITS, hair: () => VL.HERO_HAIRS };
  const LABELS = { name: 'NAME', gender: 'HERO', outfit: 'CLOTHES', hair: 'HAIR' };
  const WORDS = { boy: 'Boy', girl: 'Girl', short: 'Short', long: 'Long' };
  const PREVIEW = { x: 8, y: 34, w: 70, h: 98 };
  const LABEL_X = 92;
  const OPTION_X = 140;
  const ROW_Y = { name: 36, gender: 60, outfit: 80, hair: 100, start: 120 };
  const FIELD = { x: OPTION_X - 4, y: ROW_Y.name - 5, w: 108, h: 18 };
  const START = { x: 148, y: ROW_Y.start, w: 56, h: 14 };
  const SWATCH = { w: 12, h: 10, step: 16 };
  // The preview turns through every facing, walking, so long hair shows from each side.
  const TURN = ['down', 'left', 'up', 'right'];
  const TURN_SECONDS = 1.4;

  // Letters and digits as typed; anything the font cannot draw is dropped.
  const typeable = (ch) => ch >= ' ' && ch !== '\u007f' && VL.ART.missingGlyphs(ch).length === 0;

  function typeInto(naming, typed) {
    // NFC joins an accent typed as its own code point (e + ´) into é.
    for (const ch of typed.normalize('NFC')) {
      if (ch === '\b') naming.text = naming.text.slice(0, -1);
      else if (naming.text.length < VL.NAME_MAX && typeable(ch)) naming.text += ch;
    }
  }

  function choose(naming, step) {
    const row = ROWS[naming.row];
    const options = CHOICES[row]();
    const at = options.indexOf(naming.look[row]);
    // The colours go round; for a pair, ← is the first and → the second.
    const next = options.length > 2 ? (at + step + options.length) % options.length : VL.clamp(at + step, 0, options.length - 1);
    if (next === at) return false;
    naming.look[row] = options[next];
    return true;
  }

  VL.defineScene('name', {
    // Typing goes into the field: letter shortcuts (such as N for mute) stay off here.
    textEntry: true,
    enter(app, data) {
      app.naming = { slot: data?.slot ?? 0, text: '', row: 0, onStart: false, look: { ...VL.DEFAULT_LOOK } };
      // N is a letter here, so a mute note from the title would only confuse.
      VL.SOUND.clearNote();
      typeInto(app.naming, data?.typed || '');
    },

    update(app, actions) {
      const naming = app.naming;
      const { pressed } = actions;
      if (pressed.pause) {
        app.setScene('title', { slot: naming.slot });
        return;
      }
      // S and Space type their letter too; on START the press is what counts.
      const begin = pressed.confirm || (naming.onStart && VL.confirmed(actions));
      if (!begin) {
        const was = naming.row;
        const choosing = Boolean(CHOICES[ROWS[naming.row]]);
        if (choosing && (pressed.interact || pressed.mainHand)) {
          // S or Space on a choice keeps it and steps down; its letter is not for the name.
          naming.row += 1;
        } else {
          // A letter typed anywhere below goes back to the field.
          if (naming.row > 0 && actions.typed) naming.row = 0;
          if (pressed.up) naming.row = Math.max(0, naming.row - 1);
          if (pressed.down) naming.row = Math.min(ROWS.length - 1, naming.row + 1);
          if (choosing && naming.row === was && (pressed.left || pressed.right)) {
            if (choose(naming, pressed.right ? 1 : -1)) VL.sfx('menuMove');
          }
          if (naming.row === 0) typeInto(naming, actions.typed);
        }
        if (naming.row !== was) VL.sfx('menuMove');
        naming.onStart = ROWS[naming.row] === 'start';
        return;
      }
      VL.sfx('menuSelect');
      const name = naming.text.trim() || VL.DEFAULT_NAME;
      // Each adventure rolls its own drops.
      const seed = (Date.now() ^ Math.floor(Math.random() * 0x100000000)) >>> 0;
      app.startGame(VL.newGame({ name, seed, look: naming.look }), naming.slot, { fresh: true });
      app.save();
      app.setScene('intro');
    },

    draw(ctx, app, t) {
      const { width } = VL.TUNING;
      const { text, look, row } = app.naming;
      const { rect } = VL.ART;
      const current = ROWS[row];
      VL.ART.text(ctx, 'Name your hero', width / 2, 8, { size: 'large', align: 'center', color: 'goldLight', shadow: 'outline' });

      // The live preview, four times size on a patch of grass.
      VL.ART.drawBox(ctx, PREVIEW.x, PREVIEW.y, PREVIEW.w, PREVIEW.h);
      rect(ctx, 'grass', PREVIEW.x + 3, PREVIEW.y + 3, PREVIEW.w - 6, PREVIEW.h - 6);
      for (const [gx, gy] of [[10, 12], [52, 20], [18, 74], [56, 84], [34, 30]]) rect(ctx, 'grassLight', PREVIEW.x + gx, PREVIEW.y + gy, 2, 1);
      ctx.save();
      ctx.translate(PREVIEW.x + PREVIEW.w / 2, PREVIEW.y + 72);
      ctx.scale(4, 4);
      VL.ART.drawHero(ctx, { facing: TURN[Math.floor(t / TURN_SECONDS) % TURN.length], moving: true }, 0, 0, t, look);
      ctx.restore();

      for (const id of ROWS) {
        const y = ROW_Y[id];
        const chosen = id === current;
        if (chosen && Math.floor(t * 3) % 4 !== 3) VL.ART.text(ctx, '→', LABEL_X - 10, id === 'start' ? START.y + 3 : y, { color: 'goldLight' });
        if (LABELS[id]) VL.ART.text(ctx, LABELS[id], LABEL_X, y + 1, { size: 'small', color: chosen ? 'goldLight' : 'textDim' });
      }

      VL.ART.drawBox(ctx, FIELD.x, FIELD.y, FIELD.w, FIELD.h);
      const textX = FIELD.x + 6;
      const textY = FIELD.y + 5;
      if (text) VL.ART.text(ctx, text, textX, textY, { color: 'text' });
      else VL.ART.text(ctx, VL.DEFAULT_NAME, textX, textY, { color: 'slotEmpty' });
      if (current === 'name' && Math.floor(t * 2) % 2 === 0) {
        const caretX = textX + (text ? VL.ART.measureText(text) + 1 : 0);
        rect(ctx, 'goldLight', caretX, textY - 1, 1, 9);
      }
      VL.ART.text(ctx, `${text.length}/${VL.NAME_MAX}`, FIELD.x + FIELD.w, FIELD.y + FIELD.h + 2, { size: 'small', align: 'right', color: 'textDim' });

      // Words to pick from: the chosen one bright and underlined.
      for (const id of ['gender', 'hair']) {
        let x = OPTION_X;
        for (const option of CHOICES[id]()) {
          const word = WORDS[option];
          const picked = look[id] === option;
          VL.ART.text(ctx, word, x, ROW_Y[id], { color: picked ? 'goldLight' : 'textDim' });
          const w = VL.ART.measureText(word);
          if (picked) rect(ctx, 'goldLight', x, ROW_Y[id] + 9, w, 1);
          x += w + 14;
        }
      }
      VL.HERO_OUTFITS.forEach((outfit, i) => {
        const x = OPTION_X + i * SWATCH.step;
        const y = ROW_Y.outfit - 1;
        const shades = VL.OUTFIT_COLORS[outfit];
        if (look.outfit === outfit) rect(ctx, 'goldLight', x - 2, y - 2, SWATCH.w + 4, SWATCH.h + 4);
        rect(ctx, 'outline', x - 1, y - 1, SWATCH.w + 2, SWATCH.h + 2);
        rect(ctx, shades.tunic, x, y, SWATCH.w, SWATCH.h);
        rect(ctx, shades.tunicLight, x, y, SWATCH.w, 2);
        rect(ctx, shades.tunicDark, x, y + SWATCH.h - 2, SWATCH.w, 2);
      });
      VL.ART.text(ctx, look.outfit.toUpperCase(), OPTION_X, ROW_Y.outfit + 12, { size: 'small', color: current === 'outfit' ? 'goldLight' : 'textDim' });

      VL.ART.drawBox(ctx, START.x, START.y, START.w, START.h);
      VL.ART.text(ctx, 'START', START.x + START.w / 2, START.y + 3, { align: 'center', color: current === 'start' ? 'goldLight' : 'text' });
      VL.ART.text(ctx, 'TYPE A NAME   ↑↓ CHOOSE   ←→ CHANGE', width / 2, 150, { size: 'small', align: 'center', color: 'textDim' });
      VL.ART.text(ctx, 'ENTER: START   ESC: BACK', width / 2, 160, { size: 'small', align: 'center', color: 'textDim' });
    },
  });
})();
