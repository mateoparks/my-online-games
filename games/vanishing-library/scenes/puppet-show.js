// Mrs. Fenwick's puppet shows in the square (design: People). One show per
// stage of her arc: sweet at first, then a meddling young hero who comes to a
// bad end, played for laughs. S turns the beat, Esc leaves.
(() => {
  VL.ART.addColors({ showNight: '#16202e', showSky: '#8fc7e8', showSkyDusk: '#e8a07a', showHill: '#4f9a41', showMountain: '#7c776b' });

  // ---------- the puppets ----------

  const stick = 'woodDark';
  VL.ART.defineSprite('puppet-hero', {
    colors: { h: 'hair', s: 'skin', e: 'ink', t: 'tunic', T: 'tunicDark', w: stick },
    rows: ['.hhhh.', 'hhhhhh', 'hseses', '.ssss.', 'tttttt', 'tTttTt', '.tttt.', '..ww..', '..ww..'],
  });
  // The meddling young hero of her later shows: a hero type, but not the
  // player's own look, so the joke stays a joke on a first play.
  VL.ART.defineSprite('puppet-ned', {
    colors: { c: 'leaf', C: 'leafLight', f: 'berry', h: 'goldLight', s: 'skin', e: 'ink', t: 'roof', T: 'roofDark', w: stick },
    rows: ['....f.', '...cf.', '..cCc.', '.cccc.', 'cccccc', 'hseses', '.ssss.', 'tttttt', 'tTttTt', '.tttt.', '..ww..', '..ww..'],
  });
  VL.ART.defineSprite('puppet-dragon', {
    colors: { g: 'leaf', l: 'leafLight', e: 'ink', w: stick, y: 'gold' },
    rows: ['.......gg.', '......glge', '.gg...gggg', 'gllgggggy.', 'gggggggg..', '.gggggg...', '..g..g....', '...ww.....', '...ww.....'],
  });
  VL.ART.defineSprite('puppet-goose', {
    colors: { w: 'white', f: 'feather', o: 'gold', e: 'ink', s: stick },
    rows: ['...ww..', '..wwe..', '..wwwoo', '..ww...', 'fwww...', 'ffwwww.', '.fwwww.', '..ss...', '..ss...'],
  });
  VL.ART.defineSprite('puppet-cat', {
    colors: { g: 'rock', l: 'rockLight', e: 'ink', w: stick },
    rows: ['g...g.', 'gg.gg.', 'glelge', 'gggggg', '.gggg.', '.g..g.', '..ww..', '..ww..'],
  });
  VL.ART.defineSprite('puppet-haystack', {
    outline: false,
    colors: { y: 'gold', l: 'goldLight', d: 'woodDark' },
    rows: ['...yy...', '..ylyy..', '.yyylyy.', 'yylyyyly', 'yyyyyyyy', 'dddddddd'],
  });
  const PUPPETS = { hero: 'puppet-hero', ned: 'puppet-ned', dragon: 'puppet-dragon', goose: 'puppet-goose', cat: 'puppet-cat', haystack: 'puppet-haystack' };

  // ---------- the shows ----------

  // Each beat: words under the stage, and where each puppet stands across the
  // stage (0 left .. 1 right); a puppet not named this beat ducks out of
  // sight. `move` adds a little action: 'hop', 'shake', 'run' or 'fly'.
  VL.PUPPET_SHOWS = [
    {
      title: 'The Dragon Who Wanted a Hug',
      sky: 'showSky',
      beats: [
        { say: 'Once upon a time, a little dragon lived on a big mountain.', cast: { dragon: 0.6 } },
        { say: 'He was terribly lonely. Nobody wants to hug a dragon. Too pointy!', cast: { dragon: 0.6 }, move: { dragon: 'shake' } },
        { say: 'Then along came a brave little hero, with a very big blanket.', cast: { hero: 0.25, dragon: 0.6 }, move: { hero: 'hop' } },
        { say: 'One blanket and one big hug, and the dragon was never lonely again. The end!', cast: { hero: 0.45, dragon: 0.58 }, move: { hero: 'hop', dragon: 'hop' } },
        { speaker: 'Mrs. Fenwick', say: 'Thank you, thank you! Come back any time, {name}!', cast: { hero: 0.35, dragon: 0.65 } },
      ],
    },
    {
      title: 'Sir Bumble\'s Busy Day',
      sky: 'showSky',
      beats: [
        { say: 'Sir Bumble was the busiest hero in the whole wide world.', cast: { hero: 0.5 }, move: { hero: 'hop' } },
        { say: 'He fetched cats out of trees. He fetched hats out of wells.', cast: { hero: 0.3, cat: 0.7 }, move: { hero: 'run' } },
        { say: 'He fetched so many things that he forgot to fetch his own lunch!', cast: { hero: 0.5 }, move: { hero: 'shake' } },
        { say: 'Poor Sir Bumble. Sometimes it\'s nice to stay at home. The end!', cast: { hero: 0.5 } },
        { speaker: 'Mrs. Fenwick', say: 'Thank you, dears. Run along now.', cast: { hero: 0.5 } },
      ],
    },
    {
      title: 'Nosy Ned',
      sky: 'showSkyDusk',
      beats: [
        { say: 'This is Nosy Ned. Ned pokes his nose into everything.', cast: { ned: 0.4 }, move: { ned: 'hop' } },
        { say: 'Into cupboards. Into trunks. Into other people\'s business!', cast: { ned: 0.55 }, move: { ned: 'run' } },
        { say: 'One day, Ned poked his nose into a goose\'s nest.', cast: { ned: 0.45, goose: 0.75 } },
        { say: 'HONK! The goose chased Ned all the way to the next town!', cast: { ned: 1.2, goose: 1.05 }, move: { ned: 'run', goose: 'run' } },
        { say: 'And Ned was never nosy again. The end! Ha ha ha!', cast: { goose: 0.5 }, move: { goose: 'hop' } },
        { speaker: 'Mrs. Fenwick', say: 'Wasn\'t that funny? Ha! That goose!', cast: { goose: 0.5 } },
      ],
    },
    {
      title: 'Nosy Ned and the Very Big Dragon',
      sky: 'showSkyDusk',
      mountain: true,
      beats: [
        { say: 'Nosy Ned is back! He just won\'t stop poking about.', cast: { ned: 0.3 }, move: { ned: 'hop' } },
        { say: 'He climbed all the way up the mountain to bother a sleeping dragon.', cast: { ned: 0.45, dragon: 0.7 } },
        { say: 'Poke. Poke. Poke... AH-CHOO!', cast: { ned: 0.55, dragon: 0.7 }, move: { dragon: 'shake' } },
        { say: 'The dragon sneezed Ned right over the hills and far away!', cast: { ned: 0.55, dragon: 0.7 }, move: { ned: 'fly' } },
        { say: 'He landed in a haystack and became a turnip farmer, far, far from here. The end!', cast: { haystack: 0.5 } },
        { speaker: 'Mrs. Fenwick', say: 'Some heroes just don\'t know when to go home. Don\'t you think so, {name}?', cast: { dragon: 0.5 } },
      ],
    },
  ];

  // ---------- the stage ----------

  const WINDOW = { x: 40, y: 34, w: 176, h: 80 };
  const FLOOR = WINDOW.y + WINDOW.h - 10;
  const SCALE = 2;

  const beatOf = (view) => view.show.beats[view.beat];
  const textOf = (view, state) => VL.popupText(beatOf(view).say, state);

  function aim(view) {
    const beat = beatOf(view);
    for (const name of Object.keys(PUPPETS)) {
      const actor = (view.actors[name] ||= { x: beat.cast[name] ?? 0.5, rise: 0 });
      actor.target = beat.cast[name];
      actor.move = beat.move?.[name] || null;
      actor.since = 0;
    }
  }

  function close(app) {
    VL.sfx('menuSelect');
    app.setScene('play');
  }

  VL.defineScene('puppetShow', {
    // data: { show: index into VL.PUPPET_SHOWS }
    enter(app, data) {
      const show = VL.PUPPET_SHOWS[Math.min(data.show ?? 0, VL.PUPPET_SHOWS.length - 1)];
      app.puppetShow = { show, beat: 0, shown: 0, actors: {} };
      aim(app.puppetShow);
      VL.sfx('popup');
    },

    update(app, actions, dt) {
      const view = app.puppetShow;
      for (const actor of Object.values(view.actors)) {
        actor.since += dt;
        const showing = actor.target !== undefined;
        actor.rise = VL.clamp(actor.rise + (showing ? dt : -dt) * 3, 0, 1);
        if (showing) actor.x += (actor.target - actor.x) * Math.min(1, dt * (actor.move === 'run' ? 3 : 5));
      }
      if (actions.pressed.pause) {
        close(app);
        return;
      }
      const text = textOf(view, app.game);
      if (view.shown < text.length) view.shown = Math.min(text.length, view.shown + dt * VL.TUNING.talkCharsPerSecond);
      if (!VL.confirmed(actions)) return;
      if (view.shown < text.length) {
        view.shown = text.length;
        return;
      }
      if (view.beat < view.show.beats.length - 1) {
        view.beat += 1;
        view.shown = 0;
        aim(view);
        VL.sfx('menuMove');
        return;
      }
      close(app);
    },

    draw(ctx, app, t) {
      const view = app.puppetShow;
      const { rect } = VL.ART;
      const { width, height } = VL.TUNING;
      rect(ctx, 'showNight', 0, 0, width, height);
      // The booth: posts, curtains, valance and the backdrop in the window.
      rect(ctx, 'outline', WINDOW.x - 22, WINDOW.y - 26, WINDOW.w + 44, WINDOW.h + 50);
      rect(ctx, 'woodDark', WINDOW.x - 21, WINDOW.y - 25, WINDOW.w + 42, WINDOW.h + 48);
      rect(ctx, view.show.sky, WINDOW.x, WINDOW.y, WINDOW.w, WINDOW.h);
      if (view.show.mountain) {
        for (let i = 0; i < 60; i += 1) rect(ctx, 'showMountain', WINDOW.x + 90 + i, WINDOW.y + 50 - Math.min(i, 60 - i), 1, 30 + Math.min(i, 60 - i));
        rect(ctx, 'white', WINDOW.x + 117, WINDOW.y + 22, 6, 3);
      }
      for (let i = 0; i < WINDOW.w; i += 1) rect(ctx, 'showHill', WINDOW.x + i, FLOOR - 6 + Math.round(Math.sin(i / 14) * 3), 1, 20);
      for (const [name, actor] of Object.entries(view.actors)) {
        if (actor.rise <= 0) continue;
        const sprite = VL.ART.sprite(PUPPETS[name]);
        let px = WINDOW.x + actor.x * WINDOW.w - (sprite.w * SCALE) / 2;
        let py = FLOOR - sprite.h * SCALE + 6 + Math.round((1 - actor.rise) * 40);
        if (actor.move === 'hop') py -= Math.round(Math.abs(Math.sin(t * 6)) * 6);
        if (actor.move === 'run') py -= Math.round(Math.abs(Math.sin(t * 12)) * 3);
        if (actor.move === 'shake') px += Math.round(Math.sin(t * 30) * 2);
        if (actor.move === 'fly') {
          const k = Math.min(1, actor.since / 1.2);
          px += k * 90;
          py -= Math.sin(k * Math.PI) * 50 + k * 30;
        }
        ctx.save();
        ctx.beginPath();
        ctx.rect(WINDOW.x, WINDOW.y, WINDOW.w, WINDOW.h - 6);
        ctx.clip();
        ctx.translate(Math.round(px), Math.round(py));
        ctx.scale(SCALE, SCALE);
        VL.ART.drawSprite(ctx, PUPPETS[name], 0, 0);
        ctx.restore();
      }
      // The front board hides the puppeteer's hands.
      rect(ctx, 'outline', WINDOW.x - 4, WINDOW.y + WINDOW.h - 6, WINDOW.w + 8, 14);
      rect(ctx, 'wood', WINDOW.x - 3, WINDOW.y + WINDOW.h - 5, WINDOW.w + 6, 12);
      rect(ctx, 'gold', WINDOW.x - 3, WINDOW.y + WINDOW.h - 5, WINDOW.w + 6, 1);
      for (const side of [0, 1]) {
        const cx = side ? WINDOW.x + WINDOW.w - 24 : WINDOW.x;
        rect(ctx, 'curtainDark', cx, WINDOW.y, 24, WINDOW.h - 6);
        for (let fold = 2; fold < 24; fold += 6) rect(ctx, 'curtain', cx + fold, WINDOW.y, 3, WINDOW.h - 6);
      }
      rect(ctx, 'curtain', WINDOW.x - 4, WINDOW.y - 14, WINDOW.w + 8, 14);
      for (let s = 0; s < WINDOW.w + 8; s += 8) rect(ctx, 'curtainLight', WINDOW.x - 4 + s, WINDOW.y - 2, 6, 3);
      rect(ctx, 'gold', WINDOW.x - 4, WINDOW.y - 14, WINDOW.w + 8, 1);
      VL.ART.text(ctx, view.show.title, width / 2, WINDOW.y - 11, { align: 'center', color: 'goldLight', shadow: 'outline' });
      const text = textOf(view, app.game);
      const beat = beatOf(view);
      // Typed along the final line breaks, so words never jump between lines.
      let left = Math.floor(view.shown);
      const typed = VL.ART.wrapText(text, VL.ART.POPUP.width - VL.ART.POPUP.pad * 2, 'normal').map((line) => {
        const part = line.slice(0, Math.max(0, left));
        left -= line.length + 1;
        return part;
      });
      VL.ART.drawPopup(ctx, { title: beat.speaker || null, text: typed.join('\n'), at: 'bottom', prompt: view.shown >= text.length }, t);
    },

    smokeData: () => ({ show: 2 }),
  });
})();
