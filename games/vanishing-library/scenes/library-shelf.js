// The librarian offers to read a book again (W36): every book still on the
// shelves, "No, thank you" first. Up/down choose, S/Space/Enter picks, X or
// Esc goes back to play. A pick opens the reading scene with `again`.
(() => {
  const BOX = { x: 16, y: 20, w: 224, h: 152 };
  const ROW = { top: 52, height: 11, visible: 9 };

  VL.shelfRows = (state) => ['no', ...VL.rereadable(state)];

  function leave(app) {
    VL.sfx('menuSelect');
    VL.graceAfterPopup(app.game);
    app.setScene('play');
  }

  // A closed book in its own colour, 7x9: pages on the right, a gold band.
  function spine(ctx, color, x, y) {
    VL.ART.rect(ctx, 'outline', x, y, 7, 9);
    VL.ART.rect(ctx, color, x + 1, y + 1, 5, 7);
    VL.ART.rect(ctx, 'white', x + 5, y + 2, 1, 6);
    VL.ART.rect(ctx, 'goldLight', x + 1, y + 3, 4, 1);
  }

  VL.defineScene('libraryShelf', {
    enter(app) {
      app.libraryShelf = { cursor: 0, scroll: 0 };
      VL.sfx('popup');
    },

    update(app, actions) {
      const view = app.libraryShelf;
      const { pressed } = actions;
      if (pressed.pause || pressed.dig) {
        leave(app);
        return;
      }
      const rows = VL.shelfRows(app.game);
      view.cursor = Math.min(view.cursor, rows.length - 1);
      const move = (pressed.down ? 1 : 0) - (pressed.up ? 1 : 0);
      if (move) {
        view.cursor = (view.cursor + move + rows.length) % rows.length;
        VL.sfx('menuMove');
      }
      view.scroll = VL.clamp(view.scroll, view.cursor - ROW.visible + 1, view.cursor);
      if (!VL.confirmed(actions)) return;
      const row = rows[view.cursor];
      if (row === 'no') {
        leave(app);
        return;
      }
      VL.sfx('menuSelect');
      app.setScene('reading', { book: row, again: true });
    },

    draw(ctx, app, t) {
      const game = app.game;
      const view = app.libraryShelf;
      const { text } = VL.ART;
      VL.drawWorld(ctx, game, t);
      const rows = VL.shelfRows(game);
      // As tall as the rows need, up to the full box.
      const h = Math.min(BOX.h, ROW.top - BOX.y + Math.min(ROW.visible, rows.length) * ROW.height + 16);
      VL.ART.drawBox(ctx, BOX.x, BOX.y, BOX.w, h);
      text(ctx, VL.LIBRARIAN, BOX.x + 8, BOX.y + 6, { color: 'goldLight', shadow: 'boxShade' });
      text(ctx, 'Shall I read you one again?', BOX.x + 8, BOX.y + 18, { color: 'text' });
      rows.slice(view.scroll, view.scroll + ROW.visible).forEach((row, i) => {
        const index = view.scroll + i;
        const y = ROW.top + i * ROW.height;
        const chosen = index === view.cursor;
        if (chosen) text(ctx, '→', BOX.x + 6, y, { color: 'gold' });
        if (row === 'no') {
          text(ctx, 'No, thank you', BOX.x + 28, y, { color: chosen ? 'goldLight' : 'textDim' });
          return;
        }
        const book = VL.BOOKS[row];
        spine(ctx, book.color, BOX.x + 18, y - 1);
        text(ctx, book.title, BOX.x + 28, y, { color: chosen ? 'goldLight' : 'text' });
      });
      const right = BOX.x + BOX.w - 8;
      if (view.scroll > 0) text(ctx, '↑', right, ROW.top - 8, { size: 'small', color: 'textDim' });
      if (view.scroll + ROW.visible < rows.length) text(ctx, '↓', right, ROW.top + ROW.visible * ROW.height - 6, { size: 'small', color: 'textDim' });
      const hint = rows.length > 1 ? '↑↓ CHOOSE   S: READ IT   X: BACK' : 'X: BACK';
      text(ctx, hint, BOX.x + BOX.w / 2, BOX.y + h - 11, { size: 'small', align: 'center', color: 'textDim' });
    },
  });
})();
