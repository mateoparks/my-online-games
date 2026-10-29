// Paper and ink (design: Paper and ink; Resources and economy: Ink): the
// Mortar & Pestle grinds berries into ink, paper and ink copy a mural or
// tablet into an item, and the Cartographer's Primer lets the hero draw a
// world map of every screen visited. README "Paper and ink (W12)".
(() => {
  VL.tune({
    // W41: a single ink draws a whole map, so it takes a handful of berries.
    berriesPerInk: 5,
    grindSeconds: 0.45,
    copyCost: { paper: 1, ink: 1 },
    mapCost: { paper: 1, ink: 1 },
    mapRevealSeconds: 1.2,
  });

  // ---------- art ----------

  VL.ART.addColors({
    inkPot: '#2b3f7a',
    inkPotLight: '#5a78c0',
    mapPaper: '#f3ead2',
    mapPaperShade: '#d2c39d',
    parchment: '#e8d4a2',
    parchmentDark: '#c8aa72',
    parchmentLight: '#f5e7c2',
    mapInk: '#3b2a1e',
    mapWater: '#7fa9b8',
    mapShallow: '#a8c8c0',
    mapSand: '#e3cb8e',
    mapGrass: '#b9c58a',
    mapMoss: '#93a877',
    mapTree: '#5f7a4a',
    mapBush: '#86a064',
    mapRock: '#9a8f7e',
    mapCliff: '#8a7461',
    mapPath: '#d8bd86',
    mapWood: '#9b6f45',
    mapRoof: '#b0644a',
    mapChasm: '#4a3a2e',
    mapScree: '#b7a88c',
    mapWall: '#7c6650',
  });

  VL.ART.defineSprite('item-mortar', {
    colors: { r: 'rock', l: 'rockLight', d: 'rockDark', k: 'woodDark', w: 'woodLight', b: 'berry' },
    rows: [
      '........kw',
      '.......kw.',
      '......kw..',
      '.llllbkll.',
      'lrrrrkrrrd',
      '.rrrrrrrd.',
      '.lrrrrrrd.',
      '..rrrrrd..',
      '...dddd...',
    ],
  });
  VL.ART.defineSprite('icon-ink', {
    outline: false,
    colors: { k: 'woodDark', b: 'inkPot', l: 'inkPotLight' },
    rows: ['.kk.', 'llll', 'lbbl', 'lbbl', '.ll.'],
  });
  VL.ART.defineSprite('icon-paper', {
    outline: false,
    colors: { p: 'mapPaper', s: 'mapPaperShade' },
    rows: ['ppps.', 'pssps', 'ppppp', 'pssps', 'ppppp'],
  });
  VL.ART.defineSprite('item-world-map', {
    colors: { s: 'parchmentDark', p: 'parchment', g: 'mapTree', b: 'mapWater', x: 'heart' },
    rows: [
      'ssssssssssss',
      'sggsbbspppgs',
      'sggsbbspxpgs',
      'spgsbbspppps',
      'sppsbbsggsps',
      'sppsbbsggsps',
      'ssssssssssss',
    ],
  });
  VL.ART.defineSprite('item-woods-map', {
    colors: { w: 'wood', d: 'woodDark', p: 'parchment', g: 'mapTree', k: 'mapInk' },
    rows: [
      'dwwwwwwwwwd',
      '.ppppppppp.',
      '.pgggpgggp.',
      '.pgkkkkkgp.',
      '.pgggpgkgp.',
      '.ppppppppp.',
      'dwwwwwwwwwd',
    ],
  });

  // ---------- sounds ----------

  VL.defineSfx('pestleGrind', [
    { wave: 'noise', dur: 0.07, vol: 0.35, filter: { type: 'bandpass', freq: 900, to: 600 } },
    { wave: 'noise', at: 0.13, dur: 0.07, vol: 0.35, filter: { type: 'bandpass', freq: 800, to: 500 } },
    { wave: 'sine', freq: 300, to: 220, at: 0.26, dur: 0.12, vol: 0.25 },
  ], { gap: 0.3 });
  VL.defineSfx('penScratch', [
    { wave: 'noise', dur: 0.05, vol: 0.5, filter: { type: 'highpass', freq: 3000, to: 4200 } },
  ], { gap: 0.07 });
  VL.defineSfx('mapUnfold', [
    { wave: 'noise', dur: 0.12, vol: 0.4, filter: { type: 'bandpass', freq: 1800, to: 900 } },
    { wave: 'noise', at: 0.1, dur: 0.1, vol: 0.3, filter: { type: 'bandpass', freq: 1400, to: 2200 } },
  ], { gap: 0.2 });
  VL.SOUND.onEvent('grind', 'pestleGrind');
  VL.SOUND.onEvent('copied', 'penScratch');

  // ---------- ink ----------

  VL.defineItem('mortarPestle', {
    name: 'Mortar & Pestle',
    icon: 'mortar',
    about: `Grinds ${VL.TUNING.berriesPerInk} berries into ink.`,
    popup: {
      title: 'You got the Mortar & Pestle!',
      text: `Hold it in a hand and press its key to grind ${VL.TUNING.berriesPerInk} berries into ink. Paper and ink can copy a picture.`,
    },
    use(state) {
      VL.makeInk(state);
    },
    menuUse(app) {
      return VL.makeInk(app.game, { quiet: true }) ? 'pestleGrind' : 'bump';
    },
  });

  // `quiet` (the equipment screen, world paused) skips the message, which
  // would only show back in the world, and the grinding shown with the hero.
  VL.makeInk = function makeInk(state, { quiet = false } = {}) {
    if (state.player.grind && !quiet) return false;
    const need = VL.TUNING.berriesPerInk;
    if (state.inventory.berries < need) {
      if (!quiet) VL.showMessage(state, { text: `You need ${need} berries to make ink.` });
      return false;
    }
    state.flags.madeInk = true;
    state.inventory.berries -= need;
    VL.addResource(state, 'ink', 1);
    VL.tidyHands(state);
    if (!quiet) {
      state.player.grind = { t: 0 };
      state.events.push({ type: 'grind' });
    }
    return true;
  };

  VL.defineHeroLayer('mortar', (ctx, state, x, y, t, pass) => {
    const grind = state.player.grind;
    if (!grind || pass !== 'front') return;
    const bob = Math.floor(grind.t * 14) % 2;
    VL.ART.drawSprite(ctx, 'item-mortar', x - 5, y - 9 + bob);
    if (bob) VL.ART.rect(ctx, 'berryLight', x + 1, y - 10, 1, 1);
  });

  // ---------- copies ----------

  // A copy is an item made at a `copyable` mural or tablet; `picture(ctx, box,
  // t)` draws it when the hero looks at it, `seen` is what S at the original says.
  VL.COPIES = {};

  VL.defineCopy = function defineCopy(id, { picture, seen = null, ...item }) {
    if (VL.COPIES[id]) throw new Error(`copy ${id} is already defined`);
    VL.COPIES[id] = { id, name: item.name, picture, seen };
    VL.defineItem(id, {
      ...item,
      copy: true,
      use(state) {
        VL.requestScene(state, 'copyView', { id });
      },
      menuUse(app) {
        app.setScene('copyView', { id, back: 'equipment' });
        return null;
      },
    });
  };

  const costText = (cost, state) => {
    const missing = Object.keys(cost).filter((kind) => state.inventory[kind] < cost[kind]);
    return missing.length ? missing.join(' and ') : null;
  };

  // S at a `copyable`: 'have', 'missing' or 'copied'.
  VL.copyFrom = function copyFrom(state, entity) {
    const copy = VL.COPIES[entity.copy];
    if (!copy) throw new Error(`no copy ${entity.copy}`);
    const seen = entity.text || copy.seen || 'A picture worth copying.';
    if (VL.hasItem(state, copy.id)) {
      VL.showMessage(state, { title: copy.name, text: `${seen} You already have a copy.` });
      return 'have';
    }
    const cost = VL.TUNING.copyCost;
    const missing = costText(cost, state);
    if (missing) {
      const all = missing === Object.keys(cost).join(' and ');
      VL.showMessage(state, { title: copy.name, text: all ? `${seen} With paper and ink you could copy it.` : `${seen} You need ${missing} to copy it.` });
      return 'missing';
    }
    for (const [kind, n] of Object.entries(cost)) state.inventory[kind] -= n;
    state.events.push({ type: 'copied', copy: copy.id });
    VL.giveItem(state, copy.id);
    return 'copied';
  };

  // The Whispering Woods map, copied from the mural in the Scriptorium (W14
  // places it; W15 decides what holding the copy changes in the maze).
  VL.defineCopy('woodsMapCopy', {
    name: 'Woods Map',
    icon: 'woods-map',
    about: 'Your copy of the Woods mural.',
    seen: 'A painted map of the Whispering Woods.',
    popup: { title: 'You copied the Woods map!', text: 'Now the Whispering Woods can\'t fool you. Hold the map in a hand and press its key to look at it.' },
    picture(ctx, box, t, state) {
      VL.drawWoodsMapPicture(ctx, box, t, state);
    },
  });

  VL.drawWoodsMapPicture = function drawWoodsMapPicture(ctx, box, t = 0, state = null) {
    const route = VL.WOODS_ROUTE || [];
    const screens = VL.REGIONS.woods ? VL.REGIONS.woods.screens : route;
    const cells = screens.map((key) => key.split(',').map(Number));
    const xs = cells.map(([x]) => x);
    const ys = cells.map(([, y]) => y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const cols = Math.max(...xs) - minX + 1;
    const rows = Math.max(...ys) - minY + 1;
    const cw = Math.floor(Math.min(36, box.w / cols));
    const ch = Math.floor(Math.min(26, (box.h - 10) / rows));
    const ox = box.x + Math.floor((box.w - cw * cols) / 2);
    const oy = box.y + Math.floor((box.h - 10 - ch * rows) / 2);
    const cellAt = (key) => {
      const [x, y] = key.split(',').map(Number);
      return { x: ox + (x - minX) * cw, y: oy + (y - minY) * ch };
    };
    for (const key of screens) {
      const { x, y } = cellAt(key);
      VL.ART.rect(ctx, 'mapMoss', x + 1, y + 1, cw - 2, ch - 2);
      for (let i = 0; i < 6; i += 1) {
        const tx = x + 3 + Math.floor(VL.ART.hash(i, key.length, x) * (cw - 7));
        const ty = y + 3 + Math.floor(VL.ART.hash(y, i, 3) * (ch - 7));
        VL.ART.rect(ctx, 'mapTree', tx, ty, 3, 2);
      }
    }
    const centre = (key) => {
      const { x, y } = cellAt(key);
      return { x: x + Math.floor(cw / 2), y: y + Math.floor(ch / 2) };
    };
    const points = route.map(centre);
    if (points.length) points.unshift({ x: points[0].x, y: points[0].y + ch });
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      for (let s = 0; s <= steps; s += 3) {
        const k = steps ? s / steps : 0;
        VL.ART.rect(ctx, 'mapInk', Math.round(a.x + (b.x - a.x) * k), Math.round(a.y + (b.y - a.y) * k), 2, 2);
      }
    }
    const end = points[points.length - 1];
    if (end) {
      VL.ART.rect(ctx, 'mapInk', end.x - 4, end.y - 4, 9, 9);
      VL.ART.rect(ctx, 'mapTree', end.x - 3, end.y - 3, 7, 5);
      VL.ART.rect(ctx, 'mapWood', end.x - 1, end.y + 1, 3, 3);
    }
    // Where the hero stands, blinking, when he looks at it in the Woods (W15).
    const here = state && VL.woodsMapHere ? VL.woodsMapHere(state) : null;
    if (here && Math.floor(t * 3) % 3 !== 2) {
      const at = centre(here);
      VL.ART.rect(ctx, 'mapInk', at.x - 3, at.y - 2, 6, 6);
      VL.ART.rect(ctx, 'heart', at.x - 2, at.y - 1, 4, 4);
    }
    VL.ART.text(ctx, 'HOLLOW OAK', end ? end.x : box.x, end ? end.y - 12 : box.y, { size: 'small', align: 'center', color: 'mapInk' });
    VL.ART.text(ctx, 'FROM THE EAST ROAD', points[0] ? points[0].x : box.x, box.y + box.h - 7, { size: 'small', align: 'center', color: 'mapInk' });
  };

  // ---------- the world map ----------

  VL.REGION_NAMES = {
    homeFields: 'HOME',
    beach: 'BEACH',
    town: 'TOWN',
    lake: 'LAKE',
    canyon: null,
    eastRoad: 'EAST ROAD',
    woods: 'WOODS',
    cliffs: 'CLIFFS',
    highlands: 'HIGHLANDS',
    shipwreck: 'WRECK',
  };

  const NOT_HERE = 'Your world map only shows the land outside. In here, press M for a map of this place.';

  VL.defineItem('worldMap', {
    name: 'World Map',
    icon: 'world-map',
    about: 'Everywhere you have been. M opens it.',
    popup: { title: 'You drew your map!', text: 'Press M to look at it. It fills in by itself as you explore.' },
    use(state) {
      if (VL.inDungeon(state)) return VL.showMessage(state, { text: NOT_HERE });
      return VL.requestScene(state, 'worldMap', { mode: 'view' });
    },
    menuUse(app) {
      if (VL.inDungeon(app.game)) {
        VL.showMessage(app.game, { text: NOT_HERE });
        return 'bump';
      }
      app.setScene('worldMap', { mode: 'view', back: 'equipment' });
      return null;
    },
  });
  VL.definePopup('mapReady', {
    title: 'You could draw a map!',
    text: 'You know how from the Primer, and you have paper and ink. Press M to draw a map of everywhere you have been.',
  });

  // The branch point with W13: inside a dungeon, M is its own dungeon map.
  VL.inDungeon = (state) => Boolean(typeof VL.dungeonOf === 'function' && VL.dungeonOf(state));

  // Why the hero can't draw the map right now, or null when he can.
  VL.mapNeeds = function mapNeeds(state) {
    if (!VL.bookRead(state, 'bookPrimer')) return 'You have no map yet. A book about drawing maps would help.';
    if (!VL.primerOnShelf(state)) return 'You have no map, and without the Cartographer\'s Primer you can\'t remember how to draw one.';
    const missing = costText(VL.TUNING.mapCost, state);
    if (!missing) return null;
    const whereInk = /ink/.test(missing) && !VL.hasItem(state, 'mortarPestle')
      ? ' Ink is made by grinding berries with a Mortar & Pestle. There\'s one somewhere in the Old Scriptorium.'
      : '';
    return `You have no map yet. You need ${missing} to draw one.${whereInk}`;
  };

  VL.makeWorldMap = function makeWorldMap(state) {
    if (VL.hasItem(state, 'worldMap') || VL.mapNeeds(state)) return false;
    for (const [kind, n] of Object.entries(VL.TUNING.mapCost)) state.inventory[kind] -= n;
    VL.giveItem(state, 'worldMap');
    return true;
  };

  // The shockwave (W16) burns it; the visits stay, so a redraw shows them all.
  VL.loseWorldMap = function loseWorldMap(state) {
    if (!state.items.worldMap) return false;
    delete state.items.worldMap;
    VL.tidyHands(state);
    return true;
  };

  VL.openWorldMap = function openWorldMap(state) {
    if (VL.hasItem(state, 'worldMap')) {
      VL.requestScene(state, 'worldMap', { mode: 'view' });
      return 'view';
    }
    const needs = VL.mapNeeds(state);
    if (needs) {
      VL.showMessage(state, { title: 'World map', text: needs });
      return 'needs';
    }
    VL.requestScene(state, 'worldMap', { mode: 'ask' });
    return 'ask';
  };

  const parseKey = (key) => key.split(',').map(Number);

  VL.mapBounds = function mapBounds() {
    const keys = Object.keys(VL.AREAS.overworld.screens).map(parseKey);
    const xs = keys.map(([x]) => x);
    const ys = keys.map(([, y]) => y);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  };

  // Indoors, the hero is wherever the door he came through stands.
  function heroOnMap(state) {
    const { area, screen } = state.player;
    if (area === 'overworld') return { screen, ...VL.heroTile(state) };
    for (const [key, { entities }] of Object.entries(VL.AREAS.overworld.screens)) {
      const door = entities.find((e) => e.to && e.to.area === area);
      if (door) return { screen: key, tx: door.x, ty: door.y };
    }
    return null;
  }

  // A screen as the map draws it: its tiles with the saved changes made to
  // them (W13's VL.saveTile: a lifted boulder, an opened path) laid over.
  VL.mapTiles = function mapTiles(state, key) {
    const changes = state.tileChanges?.[`overworld:${key}`] || {};
    const rows = VL.getScreen('overworld', key).tiles.map((row) => [...row]);
    for (const [at, ch] of Object.entries(changes)) {
      const [tx, ty] = parseKey(at);
      if (rows[ty] && tx < rows[ty].length) rows[ty][tx] = ch;
    }
    return rows.map((row) => row.join(''));
  };

  const LABEL_H = 7;
  const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  // Map pixels (one per tile) from the map's top-left corner.
  function mapPoint(key, tx, ty) {
    const bounds = VL.mapBounds();
    const [x, y] = parseKey(key);
    return { x: (x - bounds.minX) * VL.TUNING.cols + tx, y: (y - bounds.minY) * VL.TUNING.rows + ty };
  }

  function spriteRect(id, key, tx, ty) {
    const { w, h } = VL.ART.sprite(id);
    const p = mapPoint(key, tx, ty);
    return { x: p.x - Math.floor(w / 2), y: p.y - Math.floor(h / 2), w, h };
  }

  // A region's name plate goes on its visited screen nearest the region's
  // middle, nudged until it covers no mark, the hero or another name.
  function placeLabel(name, screens, blocked) {
    const bounds = VL.mapBounds();
    const mapW = (bounds.maxX - bounds.minX + 1) * VL.TUNING.cols;
    const mapH = (bounds.maxY - bounds.minY + 1) * VL.TUNING.rows;
    const w = VL.ART.measureText(name, 'small') + 2;
    let first = null;
    for (const key of screens) {
      const corner = mapPoint(key, 0, 0);
      for (const dy of [2, 0, 4, 1, 3, -4, 8, -7, 11]) {
        for (const dx of [0, -3, 3, -6, 6, -9, 9, -12, 12]) {
          const x = VL.clamp(Math.round(corner.x + VL.TUNING.cols / 2 - w / 2) + dx, 0, mapW - w);
          const rect = { x, y: VL.clamp(corner.y + dy, 0, mapH - LABEL_H), w, h: LABEL_H };
          if (!first) first = { ...rect, screen: key };
          if (!blocked.some((b) => overlaps(rect, b))) return { ...rect, screen: key };
        }
      }
    }
    return first;
  }

  // What the drawn map shows: overworld screens in the order first visited,
  // the Herbalist's (and Ledger's) marks, the hero, and the names of visited
  // regions with where their plates go (map pixels, see placeLabel).
  VL.mapView = function mapView(state) {
    const screens = Object.keys(state.visited)
      .filter((key) => key.startsWith('overworld:'))
      .map((key) => key.slice('overworld:'.length))
      .filter((key) => VL.AREAS.overworld.screens[key]);
    const marks = VL.mapMarks(state)
      .filter((mark) => mark.area === 'overworld')
      .map(({ kind, screen, tx, ty }) => ({ kind, screen, tx, ty }));
    const hero = heroOnMap(state);
    const blocked = marks.map((m) => spriteRect(m.kind === 'ore' ? 'icon-ore' : 'icon-berry', m.screen, m.tx, m.ty));
    if (hero) {
      const p = mapPoint(hero.screen, hero.tx, hero.ty);
      blocked.push({ x: p.x - 2, y: p.y - 2, w: 5, h: 5 });
    }
    const labels = [];
    for (const region of Object.values(VL.REGIONS)) {
      const name = region.id in VL.REGION_NAMES ? VL.REGION_NAMES[region.id] : region.id.toUpperCase();
      if (!name || region.area !== 'overworld') continue;
      const cells = region.screens.map(parseKey);
      const mx = cells.reduce((sum, [x]) => sum + x, 0) / cells.length;
      const my = cells.reduce((sum, [, y]) => sum + y, 0) / cells.length;
      const dist = (key) => {
        const [x, y] = parseKey(key);
        return (x - mx) ** 2 + (y - my) ** 2;
      };
      const seen = region.screens.filter((key) => screens.includes(key)).sort((a, b) => dist(a) - dist(b));
      if (!seen.length) continue;
      const label = { name, ...placeLabel(name, seen, blocked) };
      labels.push(label);
      blocked.push(label);
    }
    return { screens, marks, labels, hero };
  };

  // ---------- the M key ----------

  VL.defineSystem('paperInk', {
    order: 96,
    update(state, actions, dt) {
      const grind = state.player.grind;
      if (grind) {
        grind.t += dt;
        if (grind.t >= VL.TUNING.grindSeconds) state.player.grind = null;
      }
      if (state.hp <= 0) return;
      if (VL.inDungeon(state)) return;
      if (!VL.hasItem(state, 'worldMap') && !state.popups.seen.mapReady && !VL.mapNeeds(state)) VL.showPopup(state, 'mapReady');
      if (actions.pressed.map) VL.openWorldMap(state);
    },
  });

  // ---------- the progression table ----------

  const claim = (id, reached) => VL.defineLock(id, { ...VL.LOCKS[id], reached });
  // Like W10's paper, ink marks the source: still reached once it is spent.
  claim('ink', (state) => Boolean(state.flags.madeInk));
  claim('worldMap', (state) => VL.hasItem(state, 'worldMap'));
  claim('woodsMapCopy', (state) => VL.hasItem(state, 'woodsMapCopy'));
})();
