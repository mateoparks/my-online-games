// The equipment screen (E): everything the hero carries over the paused
// world. Arrows choose an item, the main-hand key puts it in the main hand
// and the off-hand key in the off hand, S uses it (eats a berry), X, E or
// Esc goes back (design: Controls).
// The chosen item's description wraps; one longer than its lines scrolls
// with Down and Up before they move the cursor (W36).
(() => {
  VL.ART.addColors({ equipShade: '#1b1b2490' });
  const BOX = { x: 16, y: 22, w: 224, h: 152 };
  const GRID = { x: 28, y: 52, cols: 4, rows: 2, w: 26, h: 22, gap: 4 };
  const HANDS_X = 160;
  const RESOURCES = [
    { kind: 'wood', icon: 'icon-wood' },
    { kind: 'shells', icon: 'icon-shell' },
    { kind: 'brokenShells', icon: 'icon-shell-broken' },
    { kind: 'ore', icon: 'icon-ore' },
    { kind: 'berries', icon: 'icon-berry' },
    { kind: 'paper', icon: 'icon-paper' },
    { kind: 'ink', icon: 'icon-ink' },
  ];

  const items = (app) => VL.equipmentItems(app.game);
  const ABOUT = { w: 200, lineHeight: 10 };
  VL.EQUIPMENT_ABOUT_LINES = 2;

  VL.equipmentAboutLines = (game, item) => (item ? VL.ART.wrapText(VL.popupText(item.about, game), ABOUT.w) : []);
  VL.equipmentAboutCues = (app) => {
    const lines = VL.equipmentAboutLines(app.game, items(app)[app.equipment.cursor]);
    const top = app.equipment.about;
    return { up: top > 0, down: top + VL.EQUIPMENT_ABOUT_LINES < lines.length };
  };

  // The keys that use an item: both for a two-handed one held in both hands.
  VL.handMarks = (game, id) => VL.HANDS.filter((hand) => VL.heldItem(game, hand) === id)
    .map((hand) => VL.handKeyMark(game, hand)).join('');

  // The grid shows GRID.rows rows at a time and scrolls a row at a time to
  // keep the chosen item in view; arrows at its side say there is more.
  function scrollTo(view, count) {
    const row = Math.floor(view.cursor / GRID.cols);
    const lastTop = Math.max(0, Math.ceil(count / GRID.cols) - GRID.rows);
    view.top = VL.clamp(VL.clamp(view.top, row - GRID.rows + 1, row), 0, lastTop);
  }

  const arrow = (ctx, x, y, up) => VL.ART.moreArrow(ctx, x, y, up);

  function frame(ctx, name, x, y, w, h) {
    VL.ART.rect(ctx, name, x + 1, y, w - 2, 1);
    VL.ART.rect(ctx, name, x + 1, y + h - 1, w - 2, 1);
    VL.ART.rect(ctx, name, x, y + 1, 1, h - 2);
    VL.ART.rect(ctx, name, x + w - 1, y + 1, 1, h - 2);
  }

  function centred(ctx, id, cx, cy) {
    const sprite = VL.ART.sprite(id);
    VL.ART.drawSprite(ctx, id, cx - Math.floor(sprite.w / 2), cy - Math.floor(sprite.h / 2));
  }

  VL.defineScene('equipment', {
    enter(app) {
      app.equipment = { cursor: 0, top: 0, about: 0 };
      VL.sfx('menuSelect');
    },

    update(app, actions) {
      const { pressed } = actions;
      const view = app.equipment;
      const game = app.game;
      // X is the key the footer names (W34); E and Esc still work.
      if (pressed.dig || pressed.equipment || pressed.pause) {
        VL.sfx('menuSelect');
        app.setScene('play');
        return;
      }
      const list = items(app);
      const before = view.cursor;
      const cues = VL.equipmentAboutCues(app);
      if (pressed.down && cues.down) view.about += 1;
      else if (pressed.up && cues.up) view.about -= 1;
      else {
        if (pressed.down) view.cursor += GRID.cols;
        if (pressed.up) view.cursor -= GRID.cols;
      }
      if (pressed.right) view.cursor += 1;
      if (pressed.left) view.cursor -= 1;
      view.cursor = VL.clamp(view.cursor, 0, Math.max(0, list.length - 1));
      if (view.cursor !== before) view.about = 0;
      if (view.cursor !== before || (pressed.down && cues.down) || (pressed.up && cues.up)) VL.sfx('menuMove');
      scrollTo(view, list.length);
      const item = list[view.cursor];
      if (!item) return;
      for (const hand of VL.HANDS) {
        if (!pressed[hand]) continue;
        VL.setHand(game, hand, item.id);
        VL.sfx('menuSelect');
      }
      if (pressed.interact && item.id === 'berry') VL.sfx(VL.eatBerry(game) ? 'munch' : 'bump');
      // `menuUse(app)` may switch scene (a map opens); it returns a sound or null.
      if (pressed.interact && item.menuUse) {
        const sound = item.menuUse(app);
        if (sound) VL.sfx(sound);
        if (app.sceneId !== 'equipment') return;
      }
      view.cursor = VL.clamp(view.cursor, 0, Math.max(0, items(app).length - 1));
      scrollTo(view, items(app).length);
      view.about = VL.clamp(view.about, 0, Math.max(0, VL.equipmentAboutLines(game, items(app)[view.cursor]).length - VL.EQUIPMENT_ABOUT_LINES));
    },

    draw(ctx, app, t) {
      const game = app.game;
      const list = items(app);
      VL.drawWorld(ctx, game, t);
      VL.ART.rect(ctx, 'equipShade', 0, 0, VL.TUNING.width, VL.TUNING.height);
      VL.ART.drawBox(ctx, BOX.x, BOX.y, BOX.w, BOX.h);
      VL.ART.text(ctx, 'EQUIPMENT', BOX.x + BOX.w / 2, BOX.y + 7, { align: 'center', color: 'goldLight', shadow: 'boxShade' });
      VL.ART.text(ctx, 'ITEMS', GRID.x, GRID.y - 9, { size: 'small', color: 'textDim' });
      const first = app.equipment.top * GRID.cols;
      for (let cell = 0; cell < GRID.cols * GRID.rows; cell += 1) {
        const i = first + cell;
        const x = GRID.x + (cell % GRID.cols) * (GRID.w + GRID.gap);
        const y = GRID.y + Math.floor(cell / GRID.cols) * (GRID.h + GRID.gap);
        const item = list[i];
        const chosen = item && i === app.equipment.cursor;
        VL.ART.rect(ctx, 'boxShade', x + 1, y + 1, GRID.w - 2, GRID.h - 2);
        frame(ctx, chosen ? 'goldLight' : 'slotEmpty', x, y, GRID.w, GRID.h);
        if (chosen && Math.floor(t * 3) % 2 === 0) frame(ctx, 'gold', x - 1, y - 1, GRID.w + 2, GRID.h + 2);
        if (!item) continue;
        centred(ctx, `item-${item.icon}`, x + GRID.w / 2, y + GRID.h / 2);
        if (item.count) VL.ART.text(ctx, String(item.count(game)), x + GRID.w - 2, y + GRID.h - 7, { size: 'small', align: 'right', color: 'text', shadow: 'outline' });
        const marks = VL.handMarks(game, item.id);
        if (marks) VL.ART.text(ctx, marks, x + 2, y + 2, { size: 'small', color: 'goldLight' });
      }
      const arrowX = GRID.x + GRID.cols * (GRID.w + GRID.gap) - 1;
      if (first > 0) arrow(ctx, arrowX, GRID.y + 2, true);
      if (first + GRID.cols * GRID.rows < list.length) arrow(ctx, arrowX, GRID.y + GRID.rows * (GRID.h + GRID.gap) - GRID.gap - 5, false);
      VL.ART.text(ctx, 'HANDS', HANDS_X, GRID.y - 9, { size: 'small', color: 'textDim' });
      VL.HANDS.forEach((hand, i) => {
        const y = GRID.y + i * (GRID.h + GRID.gap);
        frame(ctx, 'text', HANDS_X, y, GRID.w, GRID.h);
        const held = VL.ITEMS[VL.heldItem(game, hand)];
        if (held) centred(ctx, `item-${held.icon}`, HANDS_X + GRID.w / 2, y + GRID.h / 2);
        VL.ART.text(ctx, `${VL.handKeyMark(game, hand)} ${hand === 'mainHand' ? 'MAIN' : 'OFF'}`, HANDS_X + GRID.w + 5, y + 8, { size: 'small', color: 'text' });
      });
      const item = list[app.equipment.cursor];
      const infoY = GRID.y + 2 * (GRID.h + GRID.gap) + 2;
      if (item) {
        VL.ART.text(ctx, VL.popupText(item.name, game), GRID.x, infoY, { color: 'goldLight' });
        const lines = VL.equipmentAboutLines(game, item);
        const top = app.equipment.about;
        lines.slice(top, top + VL.EQUIPMENT_ABOUT_LINES).forEach((line, i) => {
          VL.ART.text(ctx, line, GRID.x, infoY + 10 + i * ABOUT.lineHeight, { color: 'text' });
        });
        const cues = VL.equipmentAboutCues(app);
        const cueX = GRID.x + ABOUT.w + 3;
        if (cues.up) arrow(ctx, cueX, infoY + 11, true);
        if (cues.down) arrow(ctx, cueX, infoY + 10 + VL.EQUIPMENT_ABOUT_LINES * ABOUT.lineHeight - 6, false);
      } else {
        VL.ART.text(ctx, 'Nothing yet. Look around!', GRID.x, infoY, { color: 'textDim' });
      }
      const resourcesY = infoY + 11 + VL.EQUIPMENT_ABOUT_LINES * ABOUT.lineHeight + 2;
      RESOURCES.forEach(({ kind, icon }, i) => {
        const x = GRID.x + i * 28;
        centred(ctx, icon, x + 4, resourcesY + 3);
        VL.ART.text(ctx, String(game.inventory[kind]).padStart(2, '0'), x + 10, resourcesY, { color: 'text' });
      });
      // W36: books found but not yet handed in, and the bindery's pages.
      const countsY = resourcesY + 12;
      const carried = VL.booksCarried(game).length;
      const books = VL.popupText(`${carried} ${carried === 1 ? 'book' : 'books'} to return`, game);
      centred(ctx, 'pickup-book', GRID.x + 4, countsY + 3);
      VL.ART.text(ctx, books, GRID.x + 12, countsY, { color: 'text' });
      const pagesX = GRID.x + 12 + VL.ART.measureText(books) + 14;
      centred(ctx, 'pickup-page', pagesX + 4, countsY + 3);
      VL.ART.text(ctx, VL.popupText(`${VL.loosePages(game)}/${VL.pagesToBind()} pages`, game), pagesX + 11, countsY, { color: 'text' });
      const hold = `${VL.handKeyMark(game, 'mainHand')}/${VL.handKeyMark(game, 'offHand')}: HOLD`;
      const hint = list.length ? `${list.length > GRID.cols ? '←→↑↓' : '←→'} CHOOSE   ${hold}   S: USE   X: BACK` : 'X: BACK';
      VL.ART.text(ctx, hint, BOX.x + BOX.w / 2, BOX.y + BOX.h - 11, { size: 'small', align: 'center', color: 'textDim' });
    },
  });
})();
