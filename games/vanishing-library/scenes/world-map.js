// The drawn world map (M) and a copy looked at (a copy's key): parchment
// over the paused world. The world map asks before spending paper and ink,
// inks the visited screens in one at a time, then shows them with the hero,
// the Herbalist's marks and the region names. README "Paper and ink (W12)".
(() => {
  VL.ART.addColors({ mapShade: '#1b1b2490' });
  const BOX = { x: 16, y: 20, w: 224, h: 166 };
  const { cols: TILES_X, rows: TILES_Y } = VL.TUNING;

  function paper(ctx, x, y, w, h) {
    VL.ART.rect(ctx, 'shadow', x + 2, y + h, w - 2, 2);
    VL.ART.rect(ctx, 'outline', x + 1, y, w - 2, h);
    VL.ART.rect(ctx, 'outline', x, y + 1, w, h - 2);
    VL.ART.rect(ctx, 'parchmentDark', x + 1, y + 1, w - 2, h - 2);
    VL.ART.rect(ctx, 'parchment', x + 2, y + 2, w - 4, h - 4);
    VL.ART.rect(ctx, 'parchmentLight', x + 2, y + 2, w - 4, 1);
  }

  function shade(ctx, app, t) {
    VL.drawWorld(ctx, app.game, t);
    VL.ART.rect(ctx, 'mapShade', 0, 0, VL.TUNING.width, VL.TUNING.height);
  }

  // ---------- one screen in ink, a pixel per tile ----------

  function inkOf(info) {
    if (info.water || (info.footprint && info.art === 'water')) return 'mapWater';
    if (info.shallow) return 'mapShallow';
    if (info.chasm) return 'mapChasm';
    if (info.tree || (info.footprint && info.art === 'moss')) return 'mapTree';
    if (info.bush) return 'mapBush';
    if (info.cliff) return 'mapCliff';
    if (info.rock || info.boulder) return 'mapRock';
    if (info.footprint || info.stage || info.door) return 'mapRoof';
    if (info.bridge) return 'mapWood';
    if (info.fence || info.wall) return 'mapWall';
    if (info.sand) return 'mapSand';
    if (info.path || info.trapdoor) return 'mapPath';
    if (info.moss) return 'mapMoss';
    if (info.scree) return 'mapScree';
    return 'mapGrass';
  }

  // Runs of one ink per row, worked out again only when a screen's tiles
  // change (a saved change, VL.mapTiles).
  const runsCache = {};
  function screenRuns(game, key) {
    const tiles = VL.mapTiles(game, key);
    const sig = tiles.join('/');
    if (runsCache[key]?.sig === sig) return runsCache[key].runs;
    const runs = [];
    tiles.forEach((row, ty) => {
      let start = 0;
      for (let tx = 1; tx <= row.length; tx += 1) {
        const ink = inkOf(VL.tileInfo('overworld', row[start]));
        if (tx < row.length && inkOf(VL.tileInfo('overworld', row[tx])) === ink) continue;
        runs.push({ ink, x: start, y: ty, w: tx - start });
        start = tx;
      }
    });
    runsCache[key] = { sig, runs };
    return runs;
  }

  function layout() {
    const bounds = VL.mapBounds();
    const w = (bounds.maxX - bounds.minX + 1) * TILES_X;
    const h = (bounds.maxY - bounds.minY + 1) * TILES_Y;
    const ox = BOX.x + Math.floor((BOX.w - w) / 2);
    const oy = BOX.y + 22;
    const cell = (key) => {
      const [x, y] = key.split(',').map(Number);
      return { x: ox + (x - bounds.minX) * TILES_X, y: oy + (y - bounds.minY) * TILES_Y };
    };
    return { ox, oy, w, h, cell };
  }

  function centred(ctx, id, cx, cy) {
    const sprite = VL.ART.sprite(id);
    VL.ART.drawSprite(ctx, id, cx - Math.floor(sprite.w / 2), cy - Math.floor(sprite.h / 2));
  }

  function drawMap(ctx, game, view, t) {
    const map = VL.mapView(game);
    const { ox, oy, w, h, cell } = layout();
    paper(ctx, BOX.x, BOX.y, BOX.w, BOX.h);
    VL.ART.text(ctx, `${game.name.toUpperCase()}'S MAP`, BOX.x + BOX.w / 2, BOX.y + 7, { align: 'center', color: 'mapInk', shadow: 'parchmentLight' });
    VL.ART.rect(ctx, 'parchmentDark', ox - 2, oy - 2, w + 4, 1);
    VL.ART.rect(ctx, 'parchmentDark', ox - 2, oy + h + 1, w + 4, 1);
    VL.ART.rect(ctx, 'parchmentDark', ox - 2, oy - 2, 1, h + 4);
    VL.ART.rect(ctx, 'parchmentDark', ox + w + 1, oy - 2, 1, h + 4);
    const shown = view.mode === 'drawing' ? map.screens.slice(0, view.revealed) : map.screens;
    for (const key of shown) {
      const { x, y } = cell(key);
      for (const run of screenRuns(game, key)) VL.ART.rect(ctx, run.ink, x + run.x, y + run.y, run.w, 1);
    }
    if (view.mode === 'drawing') return;
    for (const label of map.labels) {
      VL.ART.rect(ctx, 'parchmentLight', ox + label.x, oy + label.y, label.w, label.h);
      VL.ART.text(ctx, label.name, ox + label.x + 1, oy + label.y + 1, { size: 'small', color: 'mapInk' });
    }
    for (const mark of map.marks) {
      const { x, y } = cell(mark.screen);
      centred(ctx, mark.kind === 'ore' ? 'icon-ore' : 'icon-berry', x + mark.tx, y + mark.ty);
    }
    if (map.hero && Math.floor(t * 3) % 3 !== 2) {
      const { x, y } = cell(map.hero.screen);
      VL.ART.rect(ctx, 'outline', x + map.hero.tx - 2, y + map.hero.ty - 2, 5, 5);
      VL.ART.rect(ctx, 'heart', x + map.hero.tx - 1, y + map.hero.ty - 1, 3, 3);
    }
    const footY = BOX.y + BOX.h - 12;
    let legendX = BOX.x + 10;
    if (map.hero) {
      VL.ART.rect(ctx, 'outline', legendX, footY, 5, 5);
      VL.ART.rect(ctx, 'heart', legendX + 1, footY + 1, 3, 3);
      VL.ART.text(ctx, 'YOU', legendX + 8, footY, { size: 'small', color: 'mapInk' });
      legendX += 28;
    }
    if (map.marks.some((m) => m.kind === 'berries')) {
      centred(ctx, 'icon-berry', legendX + 2, footY + 2);
      VL.ART.text(ctx, 'BERRIES', legendX + 8, footY, { size: 'small', color: 'mapInk' });
      legendX += 44;
    }
    if (map.marks.some((m) => m.kind === 'ore')) {
      centred(ctx, 'icon-ore', legendX + 3, footY + 2);
      VL.ART.text(ctx, 'ORE', legendX + 10, footY, { size: 'small', color: 'mapInk' });
    }
    VL.ART.text(ctx, 'M: CLOSE', BOX.x + BOX.w - 10, footY, { size: 'small', align: 'right', color: 'mapInk' });
  }

  // ---------- asking before drawing ----------

  const ASK = 'Draw a map of everywhere you have been? It uses 1 paper and 1 ink.';

  function drawAsk(ctx, view, t) {
    const w = 200;
    const lines = VL.ART.wrapText(ASK, w - 12, 'normal');
    const line = VL.ART.lineHeight('normal');
    const h = 12 + (lines.length + 2) * line;
    const x = Math.floor((VL.TUNING.width - w) / 2);
    const y = Math.floor((VL.TUNING.height - h) / 2);
    VL.ART.drawBox(ctx, x, y, w, h);
    lines.forEach((text, i) => VL.ART.text(ctx, text, x + 6, y + 6 + i * line, { color: 'text' }));
    const choiceY = y + 6 + (lines.length + 0.6) * line;
    ['YES', 'NO'].forEach((label, i) => {
      const cx = x + 60 + i * 70;
      const chosen = view.choice === i;
      VL.ART.text(ctx, label, cx, choiceY, { color: chosen ? 'goldLight' : 'textDim' });
      if (chosen && Math.floor(t * 3) % 2 === 0) VL.ART.text(ctx, '>', cx - 9, choiceY, { color: 'goldLight' });
    });
  }

  VL.defineScene('worldMap', {
    enter(app, data = {}) {
      app.worldMapView = { mode: data.mode || 'view', back: data.back || 'play', choice: 0, t: 0, revealed: 0 };
      VL.sfx(app.worldMapView.mode === 'ask' ? 'popup' : 'mapUnfold');
    },

    update(app, actions, dt) {
      const view = app.worldMapView;
      const { pressed } = actions;
      const close = () => {
        VL.sfx('menuSelect');
        app.setScene(view.back);
      };
      view.t += dt;
      if (view.mode === 'ask') {
        if (pressed.map || pressed.pause) return close();
        if (pressed.left || pressed.right || pressed.up || pressed.down) {
          view.choice = 1 - view.choice;
          VL.sfx('menuMove');
        }
        if (!VL.confirmed(actions)) return undefined;
        if (view.choice === 1 || !VL.makeWorldMap(app.game)) return close();
        VL.sfx('mapUnfold');
        Object.assign(view, { mode: 'drawing', t: 0, revealed: 0 });
        return undefined;
      }
      if (view.mode === 'drawing') {
        const total = VL.mapView(app.game).screens.length;
        const revealed = Math.min(total, Math.floor((view.t / VL.TUNING.mapRevealSeconds) * total) + 1);
        if (revealed > view.revealed) VL.sfx('penScratch');
        view.revealed = revealed;
        if (view.t >= VL.TUNING.mapRevealSeconds || VL.confirmed(actions) || pressed.map) Object.assign(view, { mode: 'view', t: 0 });
        return undefined;
      }
      if (pressed.map || pressed.pause || pressed.equipment || VL.confirmed(actions)) close();
      return undefined;
    },

    draw(ctx, app, t) {
      const view = app.worldMapView;
      shade(ctx, app, t);
      if (view.mode === 'ask') drawAsk(ctx, view, t);
      else drawMap(ctx, app.game, view, t);
    },

    smokeData() {
      return { mode: 'view' };
    },
  });

  // ---------- a copy ----------

  const READY = 0.3;

  VL.defineScene('copyView', {
    enter(app, data = {}) {
      app.copyView = { id: data.id || Object.keys(VL.COPIES)[0], back: data.back || 'play', t: 0 };
      VL.sfx('mapUnfold');
    },

    update(app, actions, dt) {
      const view = app.copyView;
      const { pressed } = actions;
      view.t += dt;
      if (view.t < READY) return;
      if (pressed.map || pressed.pause || pressed.equipment || VL.confirmed(actions)) {
        VL.sfx('menuSelect');
        app.setScene(view.back);
      }
    },

    draw(ctx, app, t) {
      const copy = VL.COPIES[app.copyView.id];
      shade(ctx, app, t);
      paper(ctx, BOX.x, BOX.y, BOX.w, BOX.h);
      VL.ART.text(ctx, copy.name.toUpperCase(), BOX.x + BOX.w / 2, BOX.y + 7, { align: 'center', color: 'mapInk', shadow: 'parchmentLight' });
      copy.picture(ctx, { x: BOX.x + 10, y: BOX.y + 22, w: BOX.w - 20, h: BOX.h - 34 }, t, app.game);
    },

    smokeData() {
      return { id: 'woodsMapCopy' };
    },
  });
})();
