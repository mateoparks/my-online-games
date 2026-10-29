// A developer-only scene showing the art kit, page by page (left/right): the
// approved mockup's screen redrawn with the kit, the outdoor tiles and hero
// frames, an interior with a popup, and the fonts and palette. The browser
// smoke screenshots each page; players never reach it.
(() => {
  const { text, rect } = VL.ART;
  const grid = (rows) => (tx, ty) => {
    const ch = rows[ty]?.[tx];
    return ch === undefined ? null : VL.TILESETS.base[ch];
  };
  const hud = { hearts: ['full', 'full', 'full', 'half', 'empty'], shells: 42, mainHand: 'sword-wood', offHand: 'shield-wood' };

  // The mockup's map, in base tileset characters (its F flowers are ',').
  const mockup = grid([
    'TTTTTTTTTTTWWWWW',
    'TT....,....WWWWW',
    'T..BB.....RWWWWW',
    'T..BB..PP..RWWWW',
    'T......PP....WWW',
    'T.,....PP......R',
    'PPPPPPPPPP..B...',
    'T......PP...BB..',
    'T..R...PP.....,.',
    'TT....RPP..TT..T',
    'TTTTTT.PP.TTTTTT',
  ]);
  const outdoors = grid([
    'TTTTTTTTTTTTTTTT',
    'T.,.....HHHH..YT',
    'T.XXXX..HHHH...T',
    'T.X..X..HDHH.,.T',
    'T.XXXX...P..R..T',
    'T..B.....P...B.T',
    'T........PPPPPPP',
    'sssssssssssssssP',
    'ssssssswwwssssss',
    'wwwwwwwwWWwwwwww',
    'WWWWWWWWWWWWWWWW',
  ]);
  const indoors = grid([
    '################',
    '#______________#',
    '#______________#',
    '#______________#',
    '#______________#',
    '#______________#',
    '#______________#',
    '#______________#',
    '#______________#',
    '#______m_______#',
    '################',
  ]);

  function world(ctx, lookup, mood, t, drawThings) {
    const { width, hudHeight, rows, tile } = VL.TUNING;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, hudHeight, width, rows * tile);
    ctx.clip();
    ctx.translate(0, hudHeight);
    VL.ART.drawTiles(ctx, lookup, 0, 0, t);
    drawThings();
    VL.ART.drawLight(ctx, mood, width, rows * tile);
    ctx.restore();
    VL.ART.drawHudModel(ctx, hud);
  }

  function chicken(ctx, x, y, t) {
    const peck = Math.sin(t * 5) > 0.6 ? 1 : 0;
    VL.ART.drawShadow(ctx, x + 5, y + 8, 9);
    VL.ART.drawSprite(ctx, 'chicken', x, y + peck);
  }

  function shell(ctx, x, y, t) {
    const bob = Math.round(Math.sin(t * 3) * 1.5);
    VL.ART.drawShadow(ctx, x + 3, y + 8, 7);
    VL.ART.drawSprite(ctx, 'pickup-shell', x, y + bob);
    VL.ART.drawSparkle(ctx, x + 6, y - 1 + bob, t);
  }

  const pages = [
    (ctx, t) => world(ctx, mockup, 'day', t, () => {
      shell(ctx, 53, 131, t);
      VL.ART.drawHero(ctx, { facing: 'down', moving: false }, 88, 92, t);
      chicken(ctx, 177, 119, t);
    }),
    (ctx, t) => world(ctx, outdoors, 'day', t, () => {
      ['down', 'left', 'up', 'right'].forEach((facing, d) => {
        for (let frame = 0; frame < 3; frame += 1) {
          const x = 22 + (d * 3 + frame) * 18;
          VL.ART.drawShadow(ctx, x, 125, 11);
          VL.ART.drawSprite(ctx, `hero-${facing}-${frame}`, x - 6, 113);
        }
      });
      chicken(ctx, 180, 70, t);
      shell(ctx, 40, 150, t);
    }),
    (ctx, t) => world(ctx, indoors, 'indoor', t, () => {
      VL.ART.drawHero(ctx, { facing: 'up', moving: true }, 120, 100, t);
      VL.ART.drawShadow(ctx, 60, 60, 11);
      VL.ART.drawSprite(ctx, 'item-sword-wood', 58, 48);
      VL.ART.drawSprite(ctx, 'item-shield-wood', 160, 52);
    }),
    (ctx) => {
      rect(ctx, 'hud', 0, 0, 256, 192);
      text(ctx, 'THE VANISHING LIBRARY', 128, 6, { size: 'large', align: 'center', color: 'goldLight', shadow: 'outline' });
      text(ctx, 'Normal: The quick brown fox jumps over', 8, 32);
      text(ctx, 'the lazy dog. 0123456789 !?:;\'"()+-=/&%', 8, 42);
      text(ctx, 'Small: HEARTS 3/5  SHELLS 042  ␣ D ← → ↑ ↓', 8, 56, { size: 'small', color: 'textDim' });
      const names = Object.keys(VL.PALETTE).filter((name) => name !== 'clear');
      names.forEach((name, i) => {
        const x = 8 + (i % 24) * 10;
        const y = 70 + Math.floor(i / 24) * 10;
        rect(ctx, 'outline', x, y, 9, 9);
        rect(ctx, name, x + 1, y + 1, 7, 7);
      });
    },
  ];

  VL.defineScene('artSheet', {
    enter(app, data) {
      app.artPage = data?.page ?? 0;
    },
    update(app, actions) {
      if (actions.pressed.right) app.artPage = (app.artPage + 1) % pages.length;
      if (actions.pressed.left) app.artPage = (app.artPage + pages.length - 1) % pages.length;
    },
    draw(ctx, app, t) {
      pages[app.artPage](ctx, t);
      if (app.artPage === 2) {
        VL.ART.drawPopup(ctx, { title: 'Wood Sword', text: VL.popupText('You found a wood sword! Press {mainKey} to swing it at bushes and slimes.', app.game) }, t);
      }
      text(ctx, `ART ${app.artPage + 1}/${pages.length} ← →`, 252, 185, { size: 'small', align: 'right', color: 'text', shadow: 'outline' });
    },
  });
  VL.ART_SHEET_PAGES = pages.length;
})();
