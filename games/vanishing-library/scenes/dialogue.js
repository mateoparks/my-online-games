// A conversation over the paused world: the speaker's name and one page at a
// time, typed out. A press finishes the page, the next turns it; after the
// last page the entry's flags and gifts land (VL.endTalk) and the speaker's
// shop opens, or a popup a gift queued, or play resumes. Esc ends it too.
(() => {
  VL.tune({ talkCharsPerSecond: 45 });

  VL.defineSfx('talk', [
    { wave: 'square', freq: 620, to: 540, dur: 0.035, vol: 0.1, filter: { type: 'lowpass', freq: 2200 } },
  ], { gap: 0.07 });

  const pageText = (view) => view.pages[view.page].join('\n');

  VL.dialogueRevealed = (view) => pageText(view).slice(0, Math.floor(view.shown));

  function close(app, { shop = app.dialogue.shop } = {}) {
    VL.endTalk(app.game, app.dialogue.end);
    if (shop) app.setScene('shop', { shop });
    else if (VL.currentPopup(app.game)) app.setScene('popup');
    else {
      VL.graceAfterPopup(app.game);
      app.setScene('play');
    }
  }

  // Sprites in canvas pixels, heads included.
  const heroSprite = (game) => {
    const { tile, hudHeight } = VL.TUNING;
    return { x: game.player.x - tile / 2, y: hudHeight + game.player.y - 18, w: tile, h: 24 };
  };
  const npcSprite = (entity) => {
    const { tile, hudHeight } = VL.TUNING;
    const feet = VL.npcFeet(entity, 0, hudHeight);
    return { x: feet.x - tile / 2, y: feet.y - 22, w: tile, h: 24 };
  };
  const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  // The half away from the hero, unless the box there would hide the hero or
  // the speaker and the other half hides neither (Mr. Fenwick behind his desk).
  VL.dialogueSide = function dialogueSide(game, speaker, popup) {
    const { tile, rows } = VL.TUNING;
    const away = game.player.y > (rows * tile) / 2 ? 'top' : 'bottom';
    const sprites = [heroSprite(game), ...(speaker ? [npcSprite(speaker)] : [])];
    const clear = (at) => !sprites.some((sprite) => overlaps(VL.ART.popupLayout({ ...popup, at }), sprite));
    if (clear(away)) return away;
    const other = away === 'top' ? 'bottom' : 'top';
    return clear(other) ? other : away;
  };

  const speakerEntity = (game, name) =>
    game.room?.entities?.find((entity) => entity.type === 'npc' && VL.NPCS[entity.id] && VL.popupText(VL.NPCS[entity.id].name, game) === name) || null;

  VL.defineScene('dialogue', {
    // data: { speaker, pages (from VL.dialoguePages), shop, end (for VL.endTalk) }
    enter(app, data) {
      app.dialogue = { speaker: data.speaker, pages: data.pages, shop: data.shop || null, end: data.end || null, page: 0, shown: 0 };
    },

    update(app, actions, dt) {
      const view = app.dialogue;
      if (actions.pressed.pause) {
        close(app, { shop: null });
        return;
      }
      const text = pageText(view);
      if (view.shown < text.length) {
        const before = Math.floor(view.shown);
        view.shown = Math.min(text.length, view.shown + dt * VL.TUNING.talkCharsPerSecond);
        const now = Math.floor(view.shown);
        if (now > before && /\S/.test(text[now - 1])) VL.sfx('talk');
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
      const game = app.game;
      const view = app.dialogue;
      VL.drawWorld(ctx, game, t);
      // Every page is as tall as the conversation's tallest, so the box keeps
      // one size while the pages turn.
      const lines = [];
      let left = Math.floor(view.shown);
      const height = Math.max(...view.pages.map((page) => page.length));
      for (let i = 0; i < height; i += 1) {
        const line = view.pages[view.page][i] ?? '';
        lines.push(line.slice(0, Math.max(0, left)));
        left -= line.length + 1;
      }
      const done = view.shown >= pageText(view).length;
      // Placed for the full page, so the box never jumps while it types out.
      const at = VL.dialogueSide(game, speakerEntity(game, view.speaker), { title: view.speaker, text: Array.from({ length: height }, (_, i) => view.pages[view.page][i] ?? '').join('\n') });
      VL.ART.drawPopup(ctx, { title: view.speaker, text: lines.join('\n'), at, prompt: done }, t);
    },

    smokeData: (app) => ({
      speaker: 'Townsperson',
      pages: VL.dialoguePages(['Morning, {name}! The gulls are loud today.', 'Mind the tide.'], app.game),
    }),
  });
})();
