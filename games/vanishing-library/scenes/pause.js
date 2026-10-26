// Pause (Esc): the world freezes under a menu with Resume and Save & Quit,
// plus the controls (never F: the chicken flight stays a secret).
(() => {
  VL.ART.addColors({ pauseShade: '#1b1b2480' });
  VL.PAUSE_OPTIONS = ['Resume', 'Save & Quit'];
  const QUIT_OPTIONS = ['Yes', 'No'];
  const BOX = { x: 40, y: 40, w: 176, h: 112 };
  const DIALOG = { x: 36, y: 64, w: 184, h: 52 };
  // Space is not mentioned until the player holds a main-hand item, X until
  // there is a shovel, nor M until there is a map to open (design: Controls).
  const controls = (state) => [
    '↑↓←→ MOVE    S: TALK, PICK UP',
    (VL.ART.hudModel(state).mainHand ? '␣ MAIN HAND    D: OFF HAND' : 'D: OFF HAND') + (VL.bestShovel?.(state) ? '    X: DIG' : ''),
    'E: EQUIPMENT    N: SOUND ON/OFF',
    VL.hasItem(state, 'worldMap') || VL.inDungeon(state) ? 'M: MAP    ESC: BACK TO THE GAME' : 'ESC: BACK TO THE GAME',
  ];

  VL.pauseControls = controls;

  VL.defineScene('pause', {
    enter(app) {
      // quitChoice indexes QUIT_OPTIONS; No is the default.
      app.pause = { cursor: 0, triedQuit: false, askQuit: false, quitChoice: 1 };
    },

    update(app, actions) {
      const pause = app.pause;
      const { pressed } = actions;
      if (pause.askQuit) {
        const choice = pause.quitChoice;
        if (pressed.left) pause.quitChoice = 0;
        if (pressed.right) pause.quitChoice = 1;
        if (pause.quitChoice !== choice) VL.sfx('menuMove');
        if (pressed.pause || pressed.erase) pause.askQuit = false;
        else if (VL.confirmed(actions)) {
          VL.sfx('menuSelect');
          pause.askQuit = false;
          if (QUIT_OPTIONS[pause.quitChoice] === 'Yes') app.quit();
        }
        return;
      }
      if (pressed.pause) {
        app.setScene('play');
        return;
      }
      if (pressed.up || pressed.down) {
        pause.cursor = 1 - pause.cursor;
        VL.sfx('menuMove');
      }
      if (!VL.confirmed(actions)) return;
      VL.sfx('menuSelect');
      if (VL.PAUSE_OPTIONS[pause.cursor] === 'Resume') {
        app.setScene('play');
        return;
      }
      // With saving off there is nothing to write; a write that fails keeps
      // the player here with the note rather than quitting as if it saved.
      if (app.save() || !app.storage.ok) app.quit();
      else if (app.saveFailed) {
        // A kid must never be stuck behind full storage: after one failed
        // try, Save & Quit offers to quit without saving (No first).
        if (pause.triedQuit) Object.assign(pause, { askQuit: true, quitChoice: 1 });
        pause.triedQuit = true;
      }
    },

    draw(ctx, app, t) {
      VL.drawWorld(ctx, app.game, t);
      VL.ART.rect(ctx, 'pauseShade', 0, 0, VL.TUNING.width, VL.TUNING.height);
      VL.ART.drawBox(ctx, BOX.x, BOX.y, BOX.w, BOX.h);
      const centre = BOX.x + BOX.w / 2;
      VL.ART.text(ctx, 'PAUSED', centre, BOX.y + 8, { align: 'center', color: 'goldLight', shadow: 'boxShade' });
      VL.PAUSE_OPTIONS.forEach((option, i) => {
        const y = BOX.y + 26 + i * 12;
        const chosen = i === app.pause.cursor;
        if (chosen) VL.ART.text(ctx, '→', centre - 44, y, { color: 'goldLight' });
        VL.ART.text(ctx, option, centre - 32, y, { color: chosen ? 'goldLight' : 'text' });
      });
      if (VL.PAUSE_OPTIONS[app.pause.cursor] === 'Save & Quit' && app.storage.ok) {
        VL.ART.text(ctx, `CONTINUE STARTS ${(VL.wakeWords(app.game) || 'at your last save point').toUpperCase()}`, centre, BOX.y + 48, { size: 'small', align: 'center', color: 'textDim' });
      }
      controls(app.game).forEach((hint, i) => VL.ART.text(ctx, hint, centre, BOX.y + 58 + i * 9, { size: 'small', align: 'center', color: 'textDim' }));
      if (!app.storage.ok) VL.ART.text(ctx, 'SAVING IS OFF IN THIS BROWSER', centre, BOX.y + 97, { size: 'small', align: 'center', color: 'goldLight' });
      else if (app.saveFailed) VL.ART.text(ctx, 'COULD NOT SAVE. STILL TRYING', centre, BOX.y + 97, { size: 'small', align: 'center', color: 'heartLight' });
      if (app.pause.askQuit) {
        const mid = VL.TUNING.width / 2;
        VL.ART.drawBox(ctx, DIALOG.x, DIALOG.y, DIALOG.w, DIALOG.h);
        VL.ART.text(ctx, 'Quit without saving?', mid, DIALOG.y + 8, { align: 'center', color: 'goldLight', shadow: 'boxShade' });
        VL.ART.text(ctx, 'ASK A GROWN-UP TO FREE UP SPACE', mid, DIALOG.y + 22, { size: 'small', align: 'center', color: 'textDim' });
        QUIT_OPTIONS.forEach((option, i) => {
          const x = mid - 36 + i * 56;
          const y = DIALOG.y + 36;
          const chosen = i === app.pause.quitChoice;
          if (chosen) VL.ART.text(ctx, '→', x - 12, y, { color: 'goldLight' });
          VL.ART.text(ctx, option, x, y, { color: chosen ? 'goldLight' : 'text' });
        });
      }
    },
  });
})();
