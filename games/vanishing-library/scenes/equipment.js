// The equipment screen (E): everything the hero carries over the paused
// world. Arrows choose an item, Space puts it in the main hand and D in the
// off hand, S uses it (eats a berry), E or Esc goes back (design: Controls).
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
  ];

  const items = (app) => VL.equipmentItems(app.game);

  // The keys that use an item: both for a two-handed one held in both hands.
  VL.handMarks = (game, id) => VL.HANDS.filter((hand) => VL.heldItem(game, hand) === id)
    .map((hand) => (hand === 'mainHand' ? '␣' : 'D')).join('');

  // The grid shows GRID.rows rows at a time and scrolls a row at a time to
  // keep the chosen item in view; arrows at its side say there is more.
  function scrollTo(view, count) {
    const row = Math.floor(view.cursor / GRID.cols);
    const lastTop = Math.max(0, Math.ceil(count / GRID.cols) - GRID.rows);
    view.top = VL.clamp(VL.clamp(view.top, row - GRID.rows + 1, row), 0, lastTop);
  }

  function arrow(ctx, x, y, up) {
    for (let i = 0; i < 3; i += 1) VL.ART.rect(ctx, 'goldLight', x + 2 - i, up ? y + i : y + 2 - i, 1 + i * 2, 1);
  }

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
      app.equipment = { cursor: 0, top: 0 };
      VL.sfx('menuSelect');
    },

    update(app, actions) {
      const { pressed } = actions;
      const view = app.equipment;
      const game = app.game;
      if (pressed.equipment || pressed.pause) {
        VL.sfx('menuSelect');
        app.setScene('play');
        return;
      }
      const list = items(app);
      const before = view.cursor;
      if (pressed.right) view.cursor += 1;
      if (pressed.left) view.cursor -= 1;
      if (pressed.down) view.cursor += GRID.cols;
      if (pressed.up) view.cursor -= GRID.cols;
      view.cursor = VL.clamp(view.cursor, 0, Math.max(0, list.length - 1));
      if (view.cursor !== before) VL.sfx('menuMove');
      scrollTo(view, list.length);
      const item = list[view.cursor];
      if (!item) return;
      for (const hand of VL.HANDS) {
        if (!pressed[hand]) continue;
        VL.setHand(game, hand, item.id);
        VL.sfx('menuSelect');
      }
      if (pressed.interact && item.id === 'berry') VL.sfx(VL.eatBerry(game) ? 'munch' : 'bump');
      view.cursor = VL.clamp(view.cursor, 0, Math.max(0, items(app).length - 1));
      scrollTo(view, items(app).length);
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
        VL.ART.text(ctx, hand === 'mainHand' ? '␣ MAIN' : 'D OFF', HANDS_X + GRID.w + 5, y + 8, { size: 'small', color: 'text' });
      });
      const item = list[app.equipment.cursor];
      const infoY = GRID.y + 2 * (GRID.h + GRID.gap) + 2;
      if (item) {
        VL.ART.text(ctx, item.name, GRID.x, infoY, { color: 'goldLight' });
        VL.ART.text(ctx, item.about, GRID.x, infoY + 11, { color: 'text' });
      } else {
        VL.ART.text(ctx, 'Nothing yet. Look around!', GRID.x, infoY, { color: 'textDim' });
      }
      RESOURCES.forEach(({ kind, icon }, i) => {
        const x = GRID.x + i * 40;
        const y = infoY + 28;
        centred(ctx, icon, x + 4, y + 3);
        VL.ART.text(ctx, String(game.inventory[kind]).padStart(2, '0'), x + 10, y, { color: 'text' });
      });
      const hint = list.length > GRID.cols ? '←→↑↓ CHOOSE   ␣/D: HOLD   S: USE   E: BACK' : list.length ? '←→ CHOOSE   ␣/D: HOLD   S: USE   E: BACK' : 'E: BACK';
      VL.ART.text(ctx, hint, BOX.x + BOX.w / 2, BOX.y + BOX.h - 11, { size: 'small', align: 'center', color: 'textDim' });
    },
  });
})();
