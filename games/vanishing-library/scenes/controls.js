// Controls (Esc → Controls, W40): choose the main-hand and off-hand keys for
// this save. Pick a hand, press the key; the game's own keys and the other
// hand's are refused with a note. Esc or X backs out. README "Hand keys (W40)".
(() => {
  VL.CONTROLS_ROWS = ['mainHand', 'offHand', 'reset', 'back'];
  const BOX = { x: 32, y: 34, w: 192, h: 124 };
  const HAND_NAMES = { mainHand: 'Main hand', offHand: 'Off hand' };
  const CANCEL = new Set(['Escape', 'KeyX']);

  const defaultWords = () => `${VL.keyWord(VL.DEFAULT_HAND_KEYS.mainHand)} and ${VL.keyWord(VL.DEFAULT_HAND_KEYS.offHand)}`;
  const REFUSED = {
    taken: () => 'That key is taken. Try another one!',
    otherHand: (hand) => `That is your ${hand === 'mainHand' ? 'off' : 'main'} hand's key.`,
    notAKey: () => 'Pick a letter, a number or Space.',
  };

  function back(app) {
    app.setScene('pause', { cursor: VL.PAUSE_OPTIONS.indexOf('Controls') });
  }

  function note(view, text, kind) {
    view.note = text;
    view.noteKind = kind;
  }

  function capture(app, actions) {
    const view = app.controls;
    const hand = view.capture;
    const code = actions.keys[0];
    if (CANCEL.has(code) || (!code && actions.pressed.pause)) {
      view.capture = null;
      note(view, null);
      VL.sfx('menuMove');
      return;
    }
    if (!code) return;
    const choice = VL.handKeyChoice(app.game, hand, code);
    if (choice !== 'ok') {
      note(view, REFUSED[choice](hand), 'refused');
      VL.sfx('bump');
      return;
    }
    VL.setHandKey(app.game, hand, code);
    view.capture = null;
    note(view, `${HAND_NAMES[hand]}: ${VL.keyWord(code)}`, 'done');
    VL.sfx('menuSelect');
  }

  VL.defineScene('controls', {
    enter(app) {
      app.controls = { cursor: 0, capture: null, note: null, noteKind: null, t: 0 };
    },

    update(app, actions, dt) {
      const view = app.controls;
      view.t += dt;
      if (view.capture) {
        capture(app, actions);
        return;
      }
      const { pressed } = actions;
      if (pressed.pause || pressed.dig) {
        VL.sfx('menuMove');
        back(app);
        return;
      }
      if (pressed.up || pressed.down) {
        const count = VL.CONTROLS_ROWS.length;
        view.cursor = (view.cursor + (pressed.down ? 1 : count - 1)) % count;
        VL.sfx('menuMove');
      }
      if (!VL.confirmed(actions)) return;
      VL.sfx('menuSelect');
      const row = VL.CONTROLS_ROWS[view.cursor];
      if (row === 'back') back(app);
      else if (row === 'reset') {
        VL.resetHandKeys(app.game);
        note(view, `Back to ${defaultWords()}.`, 'done');
      } else {
        view.capture = row;
        note(view, null);
      }
    },

    draw(ctx, app, t) {
      const view = app.controls;
      const game = app.game;
      VL.drawWorld(ctx, game, t);
      VL.ART.rect(ctx, 'pauseShade', 0, 0, VL.TUNING.width, VL.TUNING.height);
      VL.ART.drawBox(ctx, BOX.x, BOX.y, BOX.w, BOX.h);
      const centre = BOX.x + BOX.w / 2;
      const left = BOX.x + 28;
      const keyX = BOX.x + BOX.w - 52;
      VL.ART.text(ctx, 'CONTROLS', centre, BOX.y + 8, { align: 'center', color: 'goldLight', shadow: 'boxShade' });
      VL.CONTROLS_ROWS.forEach((row, i) => {
        const y = BOX.y + 26 + i * 13;
        const chosen = i === view.cursor;
        const color = chosen ? 'goldLight' : 'text';
        if (chosen) VL.ART.text(ctx, '→', left - 12, y, { color: 'goldLight' });
        if (row === 'reset') VL.ART.text(ctx, `Reset to ${defaultWords()}`, left, y, { color });
        else if (row === 'back') VL.ART.text(ctx, 'Back', left, y, { color });
        else {
          VL.ART.text(ctx, HAND_NAMES[row], left, y, { color });
          const waiting = view.capture === row;
          // A key cap: the chosen key, or a blinking ? while one is awaited.
          VL.ART.drawBox(ctx, keyX - 4, y - 3, 44, 14);
          const label = waiting ? (Math.floor(t * 3) % 2 ? '?' : '') : VL.handKeyWord(game, row);
          if (label) VL.ART.text(ctx, label, keyX + 18, y, { align: 'center', color: waiting ? 'goldLight' : 'text' });
        }
      });
      const infoY = BOX.y + 82;
      if (view.capture) {
        VL.ART.text(ctx, `PRESS A KEY FOR THE ${HAND_NAMES[view.capture].toUpperCase()}`, centre, infoY, { size: 'small', align: 'center', color: 'goldLight' });
        VL.ART.text(ctx, `ESC OR X: KEEP ${VL.handKeyWord(game, view.capture).toUpperCase()}`, centre, infoY + 9, { size: 'small', align: 'center', color: 'textDim' });
      } else {
        VL.ART.text(ctx, '↑↓ CHOOSE   S: CHANGE   ESC OR X: BACK', centre, infoY, { size: 'small', align: 'center', color: 'textDim' });
        VL.ART.text(ctx, 'ANY FREE LETTER OR NUMBER, OR SPACE', centre, infoY + 9, { size: 'small', align: 'center', color: 'textDim' });
      }
      if (view.note) {
        VL.ART.text(ctx, view.note, centre, BOX.y + BOX.h - 18, { size: 'small', align: 'center', color: view.noteKind === 'refused' ? 'heartLight' : 'goldLight' });
      }
    },
  });
})();
