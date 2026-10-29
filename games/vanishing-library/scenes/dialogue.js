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
    else if (VL.currentPopup(app.game) && !app.game.holdUp) app.setScene('popup');
    else {
      VL.graceAfterPopup(app.game);
      app.setScene('play');
    }
  }

  // Sprites in canvas pixels as drawn (12×14 plus the outline, a pixel of
  // bob or lift above).
  const heroSprite = (game) => {
    const { hudHeight } = VL.TUNING;
    const lift = Math.round(game.player.lift || 0);
    return { x: game.player.x - 7, y: hudHeight + game.player.y - 12 - lift, w: 14, h: 18 };
  };
  const npcSprite = (entity) => {
    const { hudHeight } = VL.TUNING;
    const feet = VL.npcFeet(entity, 0, hudHeight);
    return { x: Math.round(feet.x) - 7, y: Math.round(feet.y) - 12, w: 14, h: 18 };
  };
  // A speaker drawn by decor (her on the gallery) gives its own box in tile
  // pixels: `speakerBox`.
  const speakerSprite = (entity) => {
    if (!entity.speakerBox) return npcSprite(entity);
    const { tile, hudHeight } = VL.TUNING;
    const box = entity.speakerBox;
    return { x: entity.x * tile + box.x, y: hudHeight + entity.y * tile + box.y, w: box.w, h: box.h };
  };
  const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  // The half away from the one speaking, so the box flips as the talk passes
  // between people and the speaker stands clear of it (Matthew: her box low,
  // his high). It is never over the speaker; the hero decides only when
  // nobody on screen speaks or that half would hide the speaker.
  VL.dialogueSide = function dialogueSide(game, speaker, popup) {
    const { tile, rows, hudHeight } = VL.TUNING;
    const hero = heroSprite(game);
    const talker = speaker ? speakerSprite(speaker) : null;
    const lower = (sprite) => sprite.y - hudHeight + sprite.h / 2 > (rows * tile) / 2;
    const hides = (at, sprite) => overlaps(VL.ART.popupLayout({ ...popup, at }), sprite);
    const awayFrom = (sprite) => (lower(sprite) ? 'top' : 'bottom');
    const flip = (at) => (at === 'top' ? 'bottom' : 'top');
    if (talker) {
      const away = awayFrom(talker);
      if (!hides(away, talker)) return away;
      return hides(flip(away), talker) ? away : flip(away);
    }
    const away = awayFrom(hero);
    return hides(away, hero) && !hides(flip(away), hero) ? flip(away) : away;
  };

  // The one speaking, by the name on the box: a person, or decor that stands
  // for one (`speaker: <npc id>`).
  const speakerEntity = (game, name) => game.room?.entities?.find((entity) => {
    const id = entity.type === 'npc' ? entity.id : entity.speaker;
    return id && VL.NPCS[id] && VL.popupText(VL.NPCS[id].name, game) === name;
  }) || null;

  VL.defineScene('dialogue', {
    // data: { speaker, pages (from VL.dialoguePages), shop, end (for VL.endTalk),
    // speakers? (one per page, for a conversation: VL.conversation) }
    enter(app, data) {
      app.dialogue = { speaker: data.speaker, speakers: data.speakers || null, pages: data.pages, shop: data.shop || null, end: data.end || null, page: 0, shown: 0 };
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
      const speaker = VL.popupText(view.speakers?.[view.page] ?? view.speaker, game);
      // Placed for the full page, so the box never jumps while it types out.
      const at = VL.dialogueSide(game, speakerEntity(game, speaker), { title: speaker, text: Array.from({ length: height }, (_, i) => view.pages[view.page][i] ?? '').join('\n') });
      VL.ART.drawPopup(ctx, { title: speaker, text: lines.join('\n'), at, prompt: done }, t);
    },

    smokeData: (app) => ({
      speaker: 'Townsperson',
      pages: VL.dialoguePages(['Morning, {name}! The gulls are loud today.', 'Mind the tide.'], app.game),
    }),
  });
})();
