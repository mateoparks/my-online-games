// What W11 puts on the map (design: Books, pages and the library; People):
// books in trunks and bushes, loose pages, the puppet stage and its trapdoor,
// and the library's shelves. Each fills a W8 spot. README "Library".
(() => {
  const { rect } = VL.ART;

  // ---------- trunks ----------

  const trunk = { d: 'woodDark', w: 'wood', l: 'woodLight', m: 'metalDark', M: 'metal', k: 'doorway' };
  VL.ART.defineSprite('prop-trunk', {
    colors: trunk,
    rows: [
      '..dddddddddd..',
      '.dllllllllllm.',
      'dlwwmwwwwmwwwm',
      'dwwwmwwwwmwwwm',
      'ddddmddMdmdddd',
      'dwwwmwwwwmwwwm',
      'dlwwmwwwwmwwwm',
      'dwwwmwwwwmwwwm',
      'dddddddddddddd',
    ],
  });
  VL.ART.defineSprite('prop-trunk-open', {
    colors: trunk,
    rows: [
      '..dddddddddd..',
      '.dkkkkkkkkkkm.',
      'dkkkkkkkkkkkkm',
      'dkkkkkkkkkkkkm',
      'ddddmdddddmddd',
      'dwwwmwwwwmwwwm',
      'dlwwmwwwwmwwwm',
      'dwwwmwwwwmwwwm',
      'dddddddddddddd',
    ],
  });

  // { type: 'bookTrunk', id }: solid; S opens it once and the book inside is found.
  VL.defineEntity('bookTrunk', {
    solid: true,
    prepare(state, box) {
      box.opened = VL.spotFound(state, box.id);
    },
    onInteract(state, box) {
      if (box.opened) return;
      box.opened = true;
      VL.findBook(state, box.id);
    },
    draw(ctx, box, x, y) {
      VL.ART.drawShadow(ctx, x + 8, y + 13, 14);
      VL.ART.drawSprite(ctx, box.opened ? 'prop-trunk-open' : 'prop-trunk', x + 1, y + 4);
    },
  });

  // ---------- books in bushes ----------

  VL.ART.defineSprite('pickup-book', {
    colors: { r: 'heart', l: 'heartLight', w: 'white', d: 'outline' },
    rows: ['rrrrrrr', 'rlwwwww', 'rlwwwww', 'rlwwwww', 'rrrrrrr'],
  });

  // { type: 'bushBook', id } on a bush tile: a corner of red peeks out of the
  // leaves; cut or pull the bush and the book lies there to pick up.
  VL.defineEntity('bushBook', {
    prepare: (state, book) => !VL.spotFound(state, book.id),
    onStand(state, book) {
      if (!book.revealed) return;
      state.room.entities = state.room.entities.filter((e) => e !== book);
      state.room.standingOn = null;
      VL.findBook(state, book.id);
    },
    draw(ctx, book, x, y, t) {
      if (!book.revealed) {
        rect(ctx, 'heart', x + 11, y + 12, 3, 2);
        rect(ctx, 'white', x + 11, y + 12, 1, 1);
        return;
      }
      const bob = Math.round(Math.sin(t * 3) * 1);
      VL.ART.drawShadow(ctx, x + 8, y + 13, 9);
      VL.ART.drawSprite(ctx, 'pickup-book', x + 4, y + 6 + bob);
      VL.ART.drawSparkle(ctx, x + 12, y + 4 + bob, t);
    },
  });

  // ---------- loose pages ----------

  VL.ART.defineSprite('pickup-page', {
    colors: { w: 'white', s: 'sandLight', i: 'textDim' },
    rows: ['wwwwww.', 'wiiiiww', 'wwwwwsw', 'wiiiwsw', 'wwwwwww', 'wiiiiiw', 'wwwwwww'],
  });

  // { type: 'page', id }: a loose page fluttering on the ground, found once.
  VL.defineEntity('page', {
    prepare: (state, page) => !VL.spotFound(state, page.id),
    onStand(state, page) {
      state.room.entities = state.room.entities.filter((e) => e !== page);
      state.room.standingOn = null;
      VL.findPage(state, page.id);
    },
    draw(ctx, page, x, y, t) {
      const lift = Math.round((Math.sin(t * 2.2) + 1) * 1.5);
      VL.ART.drawShadow(ctx, x + 8, y + 13, 8);
      VL.ART.drawSprite(ctx, 'pickup-page', x + 5, y + 4 - lift);
    },
  });

  // ---------- the puppet stage and the trapdoor ----------

  // The stage spot marks where the booth stands; S facing any stage tile
  // starts a show (a tile, so NPCs may still stand nearby).
  VL.defineEntity('puppetStageMark', {});

  VL.defineSystem('puppetStage', {
    order: 18,
    update(state, actions) {
      if (!actions.pressed.interact || state.hp <= 0 || state.player.carrying || state.player.flight) return;
      const { tx, ty } = VL.facingTiles(state)[0];
      const info = VL.tileInfo(state.room.area, VL.tileAt(state.room.area, state.room.screen, tx, ty, state.room));
      if (!info.stage) return;
      VL.requestScene(state, 'puppetShow', { show: VL.wifeStage(state) });
    },
  });

  // Visible all game, opened only in the finale (W20).
  VL.defineEntity('trapdoor', {
    onInteract(state) {
      const text = VL.wifeStage(state) >= 2
        ? 'Shut fast, with no handle on this side. Mrs. Fenwick calls over: "That\'s just where I keep my spare puppets, dear!"'
        : 'A wooden trapdoor in front of the stage. It\'s shut fast, with no handle on this side.';
      VL.showMessage(state, { title: 'Trapdoor', text });
    },
  });

  // ---------- the library's shelves ----------

  // Every book has its own place on the shelves (by the order books are
  // defined), so a returned book always goes back to the same gap.
  VL.SHELF = { count: 3, boards: 3, width: 64, spacing: 5 };
  VL.shelfPlace = function shelfPlace(id) {
    const i = Object.keys(VL.BOOKS).indexOf(id);
    const n = Math.floor(i / (VL.SHELF.count * VL.SHELF.boards));
    return {
      shelf: i % VL.SHELF.count,
      board: Math.floor(i / VL.SHELF.count) % VL.SHELF.boards,
      // From the middle of the board outwards: 0, -1, 1, -2, 2, ...
      offset: n % 2 ? -Math.ceil(n / 2) : n / 2,
    };
  };

  // { type: 'libraryShelf', shelf }: a wall bookcase four tiles wide. Walking
  // in is when the thief's work since the last visit shows (VL.applyThefts).
  VL.defineEntity('libraryShelf', {
    prepare(state, shelf) {
      VL.applyThefts(state);
      shelf.books = VL.shelfBooks(state, shelf.shelf);
      return true;
    },
    draw(ctx, shelf, x, y) {
      const w = VL.SHELF.width;
      rect(ctx, 'shadow', x + 2, y + 14, w - 2, 2);
      rect(ctx, 'outline', x, y - 6, w, 22);
      rect(ctx, 'woodDark', x + 1, y - 5, w - 2, 20);
      for (let board = 0; board < VL.SHELF.boards; board += 1) {
        const by = y - 4 + board * 7;
        for (const book of (shelf.books || []).filter((b) => b.board === board)) {
          const bx = x + w / 2 - 1 + book.offset * VL.SHELF.spacing;
          if (book.gone) {
            rect(ctx, 'wood', bx, by + 4, 3, 1);
            continue;
          }
          const tall = book.tall ? 5 : 4;
          rect(ctx, book.color, bx, by + 5 - tall, 3, tall);
          rect(ctx, 'white', bx + 1, by + 6 - tall, 1, 1);
        }
        rect(ctx, 'wood', x + 1, by + 5, w - 2, 2);
        rect(ctx, 'woodLight', x + 1, by + 5, w - 2, 1);
      }
    },
  });

  // The books a shelf shows now: those on it, and a dusty gap for each one
  // the thief took back.
  VL.shelfBooks = function shelfBooks(state, shelf) {
    const { returned, gone } = state.library;
    return returned.filter((id) => VL.BOOKS[id]).map((id) => ({ id, ...VL.shelfPlace(id), color: VL.BOOKS[id].color, tall: id.length % 2 === 0, gone: gone.includes(id) }))
      .filter((book) => book.shelf === shelf);
  };

  // Books handed in during a visit go straight up on the shelves.
  VL.defineSystem('libraryShelves', {
    order: 98,
    update(state) {
      if (state.room.area !== 'library') return;
      for (const shelf of state.room.entities) if (shelf.type === 'libraryShelf') shelf.books = VL.shelfBooks(state, shelf.shelf);
    },
  });

  // ---------- filling W8's spots ----------

  for (const id of ['bookTideTables', 'bookLighthouse', 'bookWoods', 'bookPrimer', 'hiddenBookSealed', 'bookSmithsLedger', 'bookChickenAlmanac', 'bookDragons', 'bookHerbalist']) {
    VL.fillSpot(id, { type: 'bookTrunk', id });
  }
  // W30's books in the late places.
  for (const id of ['bookCliffLedge', 'bookHighShelfA', 'bookHighShelfB', 'bookHighScree', 'bookHighGapA', 'bookHighGapB', 'bookHighPathA', 'bookHighPathB', 'bookLairA', 'bookLairB', 'bookLakeIsland', 'bookWreckDeck']) {
    VL.fillSpot(id, { type: 'bookTrunk', id });
  }
  for (const id of ['bookCliffRoad', 'bookEastRoad', 'bookRiverside']) {
    VL.fillSpot(id, { type: 'bushBook', id });
  }
  VL.fillSpot('pageFieldA', { type: 'page', id: 'pageFieldA' });
  VL.fillSpot('pageFieldB', { type: 'page', id: 'pageFieldB' });
  VL.fillSpot('puppetStage', { type: 'puppetStageMark' });
  VL.fillSpot('trapdoor', { type: 'trapdoor' });

  // A book in a bush shows once its bush is cut or pulled this visit.
  VL.defineSystem('bushBooks', {
    order: 60,
    update(state) {
      const room = state.room;
      for (const book of room.entities) {
        if (book.type !== 'bushBook' || book.revealed) continue;
        book.revealed = !VL.tileInfo(room.area, VL.tileAt(room.area, room.screen, book.x, book.y, room)).bush;
      }
    },
  });
})();
