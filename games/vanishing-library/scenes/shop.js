// A shop or trade counter over the paused world (shop.js holds the rules):
// up/down choose an offer, S/Space/Enter picks it, then Yes/No confirms.
// Too little to pay says so on the spot. Leave, or Esc, goes back to play.
(() => {
  const BOX = { x: 16, y: 20, w: 224, h: 152 };
  const ROW = { top: 40, height: 12, visible: 7 };
  const NOTE_SECONDS = 2.5;
  const FLASH_SECONDS = 0.6;

  VL.defineSfx('nope', [
    { wave: 'square', freq: 220, to: 180, dur: 0.09, vol: 0.2, filter: { type: 'lowpass', freq: 1400 } },
    { wave: 'square', freq: 165, to: 130, at: 0.1, dur: 0.14, vol: 0.2, filter: { type: 'lowpass', freq: 1400 } },
  ], { gap: 0.2 });

  VL.shopRows = (state, view) => [...VL.shopOffers(state, view.shop), 'leave'];

  VL.shopQuestion = function shopQuestion(view) {
    const offer = view.asking;
    if (VL.offerVerb(offer) === 'Trade') return `Trade ${VL.priceText(offer.cost)} for ${VL.priceText(offer.gain)}?`;
    return `${VL.offerVerb(offer)} ${offer.name} for ${VL.priceText(offer.cost)}?`;
  };

  function say(view, text, bad) {
    view.note = { text, bad, t: 0 };
  }

  function leave(app) {
    VL.sfx('menuSelect');
    app.setScene('play');
  }

  function pick(app, view, offer) {
    const game = app.game;
    if (offer.soldOut?.(game)) {
      say(view, 'Sold out.', true);
      VL.sfx('nope');
      return;
    }
    const refusal = VL.offerRefusal(game, offer);
    if (refusal) {
      say(view, VL.popupText(refusal, game), true);
      VL.sfx('nope');
      return;
    }
    const short = VL.shortfall(game, offer.cost);
    if (short) {
      say(view, `Not enough ${VL.currencyName(short, 2)}!`, true);
      view.flash = { offer: offer.id, t: 0 };
      VL.sfx('nope');
      return;
    }
    view.mode = 'ask';
    view.asking = offer;
    view.answer = 0;
    view.note = null;
    VL.sfx('menuMove');
  }

  function answer(app, view) {
    const offer = view.asking;
    view.mode = 'browse';
    view.asking = null;
    if (view.answer !== 0) {
      VL.sfx('menuMove');
      return;
    }
    const result = VL.buyOffer(app.game, offer);
    if (result.ok) {
      say(view, VL.popupText(offer.thanks || 'Thank you!', app.game), false);
      VL.sfx('shell');
    } else {
      pick(app, view, offer);
    }
  }

  VL.defineScene('shop', {
    // data: { shop: id } or { shop: a definition } (the smoke's sample)
    enter(app, data) {
      const shop = typeof data?.shop === 'string' ? VL.SHOPS[data.shop] : data?.shop;
      if (!shop) throw new Error(`no shop ${data?.shop}`);
      app.shopView = { shop, cursor: 0, scroll: 0, mode: 'browse', asking: null, answer: 0, note: null, flash: null };
      VL.sfx('popup');
    },

    update(app, actions, dt) {
      const view = app.shopView;
      const { pressed } = actions;
      if (view.note && (view.note.t += dt) > NOTE_SECONDS) view.note = null;
      if (view.flash && (view.flash.t += dt) > FLASH_SECONDS) view.flash = null;
      if (view.mode === 'ask') {
        if (pressed.pause) {
          view.mode = 'browse';
          view.asking = null;
          VL.sfx('menuMove');
        } else if (pressed.left || pressed.right || pressed.up || pressed.down) {
          view.answer = 1 - view.answer;
          VL.sfx('menuMove');
        } else if (VL.confirmed(actions)) {
          answer(app, view);
        }
        return;
      }
      if (pressed.pause) {
        leave(app);
        return;
      }
      const rows = VL.shopRows(app.game, view);
      view.cursor = Math.min(view.cursor, rows.length - 1);
      const move = (pressed.down ? 1 : 0) - (pressed.up ? 1 : 0);
      if (move) {
        view.cursor = (view.cursor + move + rows.length) % rows.length;
        VL.sfx('menuMove');
      }
      view.scroll = VL.clamp(view.scroll, view.cursor - ROW.visible + 1, view.cursor);
      if (!VL.confirmed(actions)) return;
      const row = rows[view.cursor];
      if (row === 'leave') leave(app);
      else pick(app, view, row);
    },

    draw(ctx, app, t) {
      const game = app.game;
      const view = app.shopView;
      const { text, rect } = VL.ART;
      VL.drawWorld(ctx, game, t);
      VL.ART.drawBox(ctx, BOX.x, BOX.y, BOX.w, BOX.h);
      text(ctx, view.shop.title, BOX.x + 8, BOX.y + 6, { color: 'goldLight', shadow: 'boxShade' });
      const rows = VL.shopRows(game, view);
      const right = BOX.x + BOX.w - 8;
      rows.slice(view.scroll, view.scroll + ROW.visible).forEach((row, i) => {
        const index = view.scroll + i;
        const y = ROW.top + i * ROW.height;
        const chosen = index === view.cursor;
        if (chosen) text(ctx, '→', BOX.x + 6, y, { color: view.mode === 'ask' ? 'textDim' : 'gold' });
        if (row === 'leave') {
          text(ctx, 'Leave', BOX.x + 30, y, { color: chosen ? 'goldLight' : 'textDim' });
          return;
        }
        const soldOut = Boolean(row.soldOut?.(game));
        if (row.icon && VL.ART.SPRITES[row.icon]) {
          const sprite = VL.ART.sprite(row.icon);
          VL.ART.drawSprite(ctx, row.icon, BOX.x + 23 - Math.floor(sprite.w / 2), y + 4 - Math.floor(sprite.h / 2));
        }
        text(ctx, row.name, BOX.x + 30, y, { color: soldOut ? 'textDim' : chosen ? 'goldLight' : 'text' });
        if (soldOut) {
          text(ctx, 'SOLD OUT', right, y + 1, { size: 'small', align: 'right', color: 'textDim' });
          return;
        }
        const flashing = view.flash?.offer === row.id && Math.floor(view.flash.t * 10) % 2 === 0;
        drawPrice(ctx, row, right, y, flashing ? 'heartLight' : 'text');
      });
      if (rows.length > ROW.visible) {
        if (view.scroll > 0) text(ctx, '↑', right + 2, ROW.top - 8, { size: 'small', color: 'textDim' });
        if (view.scroll + ROW.visible < rows.length) text(ctx, '↓', right + 2, ROW.top + ROW.visible * ROW.height - 6, { size: 'small', color: 'textDim' });
      }
      const infoY = ROW.top + ROW.visible * ROW.height + 4;
      rect(ctx, 'boxShade', BOX.x + 6, infoY - 3, BOX.w - 12, 1);
      drawInfo(ctx, game, view, rows, infoY);
      drawPurse(ctx, game, view.shop, BOX.y + BOX.h - 12);
    },

    smokeData: () => ({
      shop: {
        title: 'Sample Shop',
        greeting: 'Have a look around, {name}.',
        offers: [
          { id: 'paper', name: 'Paper', cost: { shells: 2 }, gain: { paper: 1 }, about: 'For maps and copies.' },
          { id: 'berry', name: 'Sell a berry', cost: { berries: 1 }, gain: { shells: 1 } },
          { id: 'mill', name: 'Shell', cost: { wood: 5 }, gain: { shells: 1 }, about: 'The mill pays for wood.' },
          { id: 'sword', name: 'Wood Sword', cost: { wood: 3 }, give: () => {} },
        ],
      },
    }),
  });

  // Right-aligned at `right`: what it costs, then (for a trade) → what it gives.
  // A currency with an icon shows the icon after its number.
  function drawPrice(ctx, offer, right, y, color) {
    const parts = [];
    const add = (amounts) => {
      Object.entries(amounts).forEach(([kind, n], i) => {
        const icon = VL.CURRENCIES[kind]?.icon;
        if (i) parts.push({ gap: 6 });
        parts.push({ text: icon ? String(n) : `${n} ${VL.currencyName(kind, n)}` });
        if (icon) parts.push({ gap: 2 }, { icon });
      });
    };
    add(offer.cost);
    if (offer.gain && VL.offerVerb(offer) === 'Trade') {
      parts.push({ gap: 4 }, { text: '→' }, { gap: 4 });
      add(offer.gain);
    }
    const widthOf = (part) => part.gap ?? (part.icon ? VL.ART.sprite(part.icon).w : VL.ART.measureText(part.text));
    let x = right - parts.reduce((sum, part) => sum + widthOf(part), 0);
    for (const part of parts) {
      if (part.icon) VL.ART.drawSprite(ctx, part.icon, x, y + 1);
      else if (part.text) VL.ART.text(ctx, part.text, x, y, { color });
      x += widthOf(part);
    }
  }

  function drawInfo(ctx, game, view, rows, y) {
    const { text } = VL.ART;
    const x = BOX.x + 8;
    const width = BOX.w - 16;
    if (view.mode === 'ask') {
      const question = VL.ART.wrapText(VL.shopQuestion(view), width).slice(0, 2);
      text(ctx, question.join('\n'), x, y, { color: 'text' });
      const answerY = y + question.length * VL.ART.lineHeight() + 1;
      ['Yes', 'No'].forEach((label, i) => {
        const ax = x + 12 + i * 40;
        if (view.answer === i) text(ctx, '→', ax - 10, answerY, { color: 'gold' });
        text(ctx, label, ax, answerY, { color: view.answer === i ? 'goldLight' : 'textDim' });
      });
      return;
    }
    if (view.note) {
      text(ctx, VL.ART.wrapText(view.note.text, width).slice(0, 2).join('\n'), x, y, { color: view.note.bad ? 'heartLight' : 'goldLight' });
      return;
    }
    const row = rows[view.cursor];
    const about = row === 'leave' ? '' : row.about || view.shop.greeting || '';
    if (about) text(ctx, VL.ART.wrapText(VL.popupText(about, game), width).slice(0, 2).join('\n'), x, y, { color: 'textDim' });
  }

  // What the hero holds of every resource this shop deals in.
  function drawPurse(ctx, game, shop, y) {
    const kinds = [];
    for (const offer of shop.offers) {
      for (const kind of [...Object.keys(offer.cost), ...Object.keys(offer.gain || {})]) if (!kinds.includes(kind)) kinds.push(kind);
    }
    const line = kinds.map((kind) => `${VL.purse(game, kind)} ${VL.currencyName(kind, VL.purse(game, kind))}`).join('  ');
    VL.ART.text(ctx, `YOU HAVE  ${line}`, BOX.x + 8, y, { size: 'small', color: 'textDim' });
  }
})();
