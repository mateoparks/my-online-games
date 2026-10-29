// The librarian reads a returned book aloud: the open book over the paused
// world, his words typed out below. The book's effect switches on when the
// reading ends, however it ends (VL.finishReading). A book read again from
// the shelf (`again`, W36) only reads, and X leaves it like the shelf.
(() => {
  VL.ART.addColors({ readingShade: '#1b1b24a0' });
  const BOOK = { x: 52, y: 22, w: 152, h: 76 };

  const pageText = (view) => view.pages[view.page].join('\n');

  function close(app) {
    const game = app.game;
    if (!app.reading.again && VL.finishReading(game, app.reading.id)) VL.sfx('libraryChime');
    app.setScene(VL.currentPopup(game) && !game.holdUp ? 'popup' : 'play');
  }

  // A sprite at a whole-number scale, top-left at (x, y).
  function drawBig(ctx, id, x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    VL.ART.drawSprite(ctx, id, 0, 0);
    ctx.restore();
  }

  VL.drawOpenBook = function drawOpenBook(ctx, book, t, state) {
    const { x, y, w, h } = BOOK;
    const half = w / 2;
    VL.ART.rect(ctx, 'shadow', x + 3, y + h, w - 2, 3);
    VL.ART.rect(ctx, 'outline', x - 2, y - 2, w + 4, h + 4);
    VL.ART.rect(ctx, book.color, x - 1, y - 1, w + 2, h + 2);
    VL.ART.rect(ctx, 'sandLight', x + 2, y + 1, half - 3, h - 3);
    VL.ART.rect(ctx, 'white', x + half + 1, y + 1, half - 3, h - 3);
    VL.ART.rect(ctx, 'sandDark', x + half - 1, y + 1, 2, h - 2);
    for (let line = y + 8; line < y + h - 6; line += 6) VL.ART.rect(ctx, 'sandLight', x + half + 8, line, half - 16, 1);
    const titleLines = VL.ART.wrapText(VL.popupText(book.title, state), half - 12, 'normal');
    const top = y + Math.floor((h - titleLines.length * 10) / 2);
    titleLines.forEach((line, i) => VL.ART.text(ctx, line, x + half / 2, top + i * 10, { align: 'center', color: 'ink' }));
    const icon = VL.ART.sprite(book.icon);
    const scale = Math.max(1, Math.min(4, Math.floor(40 / Math.max(icon.w, icon.h))));
    const bob = Math.round(Math.sin(t * 2) * 1);
    drawBig(ctx, book.icon, x + half + Math.floor((half - icon.w * scale) / 2), y + Math.floor((h - icon.h * scale) / 2) + bob, scale);
  };

  VL.defineScene('reading', {
    // data: { book: id, again } (a titled or sealed book on the shelves; any
    // book on them with `again`)
    enter(app, data) {
      const book = VL.BOOKS[data.book];
      const again = Boolean(data.again);
      app.reading = { id: data.book, book, again, pages: VL.dialoguePages(again ? VL.rereadWords(book) : book.reading, app.game), page: 0, shown: 0 };
      VL.sfx('popup');
    },

    update(app, actions, dt) {
      const view = app.reading;
      if (actions.pressed.pause || (view.again && actions.pressed.dig)) {
        close(app);
        return;
      }
      const text = pageText(view);
      if (view.shown < text.length) {
        const before = Math.floor(view.shown);
        view.shown = Math.min(text.length, view.shown + dt * VL.TUNING.talkCharsPerSecond);
        if (Math.floor(view.shown) > before && /\S/.test(text[Math.floor(view.shown) - 1])) VL.sfx('talk');
      }
      if (!VL.confirmed(actions)) return;
      if (view.shown < text.length) {
        view.shown = text.length;
        return;
      }
      if (view.page < view.pages.length - 1) {
        view.page += 1;
        view.shown = 0;
        VL.sfx('menuMove');
        return;
      }
      VL.sfx('menuSelect');
      close(app);
    },

    draw(ctx, app, t) {
      const view = app.reading;
      VL.drawWorld(ctx, app.game, t);
      VL.ART.rect(ctx, 'readingShade', 0, 0, VL.TUNING.width, VL.TUNING.height);
      VL.drawOpenBook(ctx, view.book, t, app.game);
      const lines = [];
      let left = Math.floor(view.shown);
      const height = Math.max(...view.pages.map((page) => page.length));
      for (let i = 0; i < height; i += 1) {
        const line = view.pages[view.page][i] ?? '';
        lines.push(line.slice(0, Math.max(0, left)));
        left -= line.length + 1;
      }
      VL.ART.drawPopup(ctx, { title: VL.LIBRARIAN, text: lines.join('\n'), at: 'bottom', prompt: view.shown >= pageText(view).length }, t);
    },

    smokeData: () => ({ book: 'bookChickenAlmanac' }),
  });
})();
