// The title screen: the game's name over a strip of shore, the three save
// slots (name, hearts and books; Empty or Damaged), delete with a confirm,
// and a note when the browser blocks saving.
(() => {
  VL.START_SCENE = 'title';

  const CARD = { x: 20, w: 216, h: 24, firstY: 44, gap: 4 };
  const DELETE_OPTIONS = ['Yes', 'No'];
  const DIALOG = { x: 36, y: 64, w: 184, h: 52 };

  // The shore under the title: grass, sand, shallows, deep water.
  const shoreRows = ['..,.......,....,', 'ssssssssssssssss', 'wwwwwwwwwwwwwwww', 'WWWWWWWWWWWWWWWW'];
  const shore = (tx, ty) => {
    const ch = shoreRows[ty]?.[tx];
    return ch === undefined ? VL.TILESETS.base.W : VL.TILESETS.base[ch];
  };
  const SHORE_Y = 146;

  const readSlots = (app) => Array.from({ length: VL.SLOT_COUNT }, (_, slot) => VL.readSlot(app.storage, slot));

  VL.defineScene('title', {
    // The top strip is the title text, so the mute icon sits on the water.
    soundIndicator: { x: 243, y: 181 },
    enter(app, data) {
      // deleteChoice indexes DELETE_OPTIONS; No is the default.
      app.title = { cursor: data?.slot ?? 0, confirmDelete: false, deleteChoice: 1, slots: readSlots(app) };
    },

    update(app, actions) {
      const title = app.title;
      const { pressed } = actions;
      if (title.confirmDelete) {
        const choice = title.deleteChoice;
        if (pressed.left) title.deleteChoice = 0;
        if (pressed.right) title.deleteChoice = 1;
        if (title.deleteChoice !== choice) VL.sfx('menuMove');
        if (pressed.pause || pressed.erase) title.confirmDelete = false;
        else if (VL.confirmed(actions)) {
          VL.sfx('menuSelect');
          // Yes deletes only the save the card showed; one another window
          // wrote since is shown instead.
          if (DELETE_OPTIONS[title.deleteChoice] === 'Yes') {
            if (app.storage.read(VL.slotKey(title.cursor)) === title.slots[title.cursor].text) VL.deleteSlot(app.storage, title.cursor);
            title.slots = readSlots(app);
          }
          title.confirmDelete = false;
        }
        return;
      }
      if (pressed.up) title.cursor = (title.cursor + VL.SLOT_COUNT - 1) % VL.SLOT_COUNT;
      if (pressed.down) title.cursor = (title.cursor + 1) % VL.SLOT_COUNT;
      if (pressed.up || pressed.down) VL.sfx('menuMove');
      const slot = title.slots[title.cursor];
      if (pressed.erase && (slot.status === 'ok' || slot.status === 'damaged')) {
        title.confirmDelete = true;
        title.deleteChoice = 1;
        VL.sfx('menuSelect');
        return;
      }
      if (!VL.confirmed(actions)) return;
      if (slot.status === 'empty' || slot.status === 'ok') VL.sfx('menuSelect');
      if (slot.status === 'empty') {
        // Letters typed just after Enter, in the same frame, belong to the name.
        app.setScene('name', { slot: title.cursor, typed: actions.pressed.confirm ? actions.typedAfterConfirm : '' });
      } else if (slot.status === 'ok') {
        const game = VL.loadSlot(app.storage, title.cursor);
        if (!game) {
          title.slots = readSlots(app);
          if (title.slots[title.cursor].status === 'ok') title.slots[title.cursor] = { status: 'damaged' };
          return;
        }
        app.startGame(game, title.cursor);
        app.setScene('play');
      }
    },

    draw(ctx, app, t) {
      const { width } = VL.TUNING;
      const title = app.title;
      VL.ART.drawTiles(ctx, shore, 0, SHORE_Y, t);
      VL.ART.drawHero(ctx, { facing: 'down', moving: false }, 92, SHORE_Y + 28, t);
      VL.ART.drawShadow(ctx, 152, SHORE_Y + 29, 9);
      VL.ART.drawSprite(ctx, 'chicken', 147, SHORE_Y + 20);
      VL.ART.drawShadow(ctx, 48, SHORE_Y + 29, 7);
      VL.ART.drawSprite(ctx, 'pickup-shell', 45, SHORE_Y + 23);
      VL.ART.drawSparkle(ctx, 50, SHORE_Y + 21, t);
      VL.ART.text(ctx, 'THE VANISHING LIBRARY', width / 2, 8, { size: 'large', align: 'center', color: 'goldLight', shadow: 'outline' });
      VL.ART.text(ctx, 'FIND THE LOST BOOKS', width / 2, 30, { size: 'small', align: 'center', color: 'textDim' });

      title.slots.forEach((slot, i) => {
        const y = CARD.firstY + i * (CARD.h + CARD.gap);
        const selected = i === title.cursor;
        VL.ART.drawBox(ctx, CARD.x, y, CARD.w, CARD.h);
        if (selected && Math.floor(t * 3) % 4 !== 3) VL.ART.text(ctx, '→', CARD.x - 12, y + 8, { color: 'goldLight' });
        VL.ART.text(ctx, String(i + 1), CARD.x + 6, y + 9, { size: 'small', color: 'textDim' });
        if (slot.status === 'empty') {
          VL.ART.text(ctx, 'Empty', CARD.x + 14, y + 8, { color: 'textDim' });
          return;
        }
        if (slot.status === 'damaged') {
          VL.ART.text(ctx, 'Damaged save', CARD.x + 14, y + 4, { color: 'heartLight' });
          VL.ART.text(ctx, 'BACKSPACE: DELETE IT', CARD.x + 14, y + 15, { size: 'small', color: 'textDim' });
          return;
        }
        if (slot.status === 'newer') {
          VL.ART.text(ctx, 'Saved by a newer game', CARD.x + 14, y + 4, { color: 'goldLight' });
          VL.ART.text(ctx, 'RELOAD THE PAGE TO PLAY IT', CARD.x + 14, y + 15, { size: 'small', color: 'textDim' });
          return;
        }
        const { name, hearts, books, finished } = slot.summary;
        VL.ART.text(ctx, name, CARD.x + 14, y + 4, { color: selected ? 'goldLight' : 'text' });
        if (finished) VL.ART.text(ctx, 'FINISHED', CARD.x + CARD.w - 8, y + 5, { size: 'small', align: 'right', color: 'goldLight' });
        // One row fits ten hearts; past that, one heart and the count.
        if (hearts > 10) {
          VL.ART.drawSprite(ctx, 'heart-full', CARD.x + 14, y + 14);
          VL.ART.text(ctx, `x${hearts}`, CARD.x + 23, y + 13, { color: 'text' });
        } else {
          for (let h = 0; h < hearts; h += 1) VL.ART.drawSprite(ctx, 'heart-full', CARD.x + 14 + h * 9, y + 14);
        }
        VL.ART.text(ctx, `BOOKS ${books}`, CARD.x + CARD.w - 8, y + 15, { size: 'small', align: 'right', color: 'textDim' });
      });

      VL.ART.text(ctx, '↑↓ PICK A SLOT   S: START   BACKSPACE: DELETE', width / 2, 130, { size: 'small', align: 'center', color: 'textDim' });
      if (!app.storage.ok) VL.ART.text(ctx, 'SAVING IS OFF IN THIS BROWSER', width / 2, 138, { size: 'small', align: 'center', color: 'goldLight' });

      if (title.confirmDelete) {
        const slot = title.slots[title.cursor];
        const who = slot.status === 'ok' ? `${slot.summary.name}'s` : 'this damaged';
        VL.ART.drawBox(ctx, DIALOG.x, DIALOG.y, DIALOG.w, DIALOG.h);
        VL.ART.text(ctx, `Delete ${who} save?`, width / 2, DIALOG.y + 8, { align: 'center', color: 'goldLight', shadow: 'boxShade' });
        VL.ART.text(ctx, 'It will be gone for good.', width / 2, DIALOG.y + 20, { align: 'center', color: 'text' });
        DELETE_OPTIONS.forEach((option, i) => {
          const x = width / 2 - 36 + i * 56;
          const y = DIALOG.y + 36;
          const chosen = i === title.deleteChoice;
          if (chosen) VL.ART.text(ctx, '→', x - 12, y, { color: 'goldLight' });
          VL.ART.text(ctx, option, x, y, { color: chosen ? 'goldLight' : 'text' });
        });
      }
    },
  });
})();
