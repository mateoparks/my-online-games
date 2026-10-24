// A conversation over the paused world: the speaker's name and one page at a
// time, typed out. A press finishes the page, the next turns it; after the
// last page play resumes (or the speaker's shop opens). Esc ends it.
(() => {
  VL.tune({ talkCharsPerSecond: 45 });

  VL.defineSfx('talk', [
    { wave: 'square', freq: 620, to: 540, dur: 0.035, vol: 0.1, filter: { type: 'lowpass', freq: 2200 } },
  ], { gap: 0.07 });

  const pageText = (view) => view.pages[view.page].join('\n');

  VL.dialogueRevealed = (view) => pageText(view).slice(0, Math.floor(view.shown));

  function close(app) {
    const shop = app.dialogue.shop;
    app.setScene(shop ? 'shop' : 'play', shop ? { shop } : undefined);
  }

  VL.defineScene('dialogue', {
    // data: { speaker, pages (from VL.dialoguePages), shop }
    enter(app, data) {
      app.dialogue = { speaker: data.speaker, pages: data.pages, shop: data.shop || null, page: 0, shown: 0 };
    },

    update(app, actions, dt) {
      const view = app.dialogue;
      if (actions.pressed.pause) {
        app.setScene('play');
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
      const at = game.player.y > (VL.TUNING.rows * VL.TUNING.tile) / 2 ? 'top' : 'bottom';
      VL.ART.drawPopup(ctx, { title: view.speaker, text: lines.join('\n'), at, prompt: done }, t);
    },

    smokeData: (app) => ({
      speaker: 'Townsperson',
      pages: VL.dialoguePages(['Morning, {name}! The gulls are loud today.', 'Mind the tide.'], app.game),
    }),
  });
})();
