// The art kit: palette, sprites with auto-outline, pixel fonts, tile styles and
// light. Content (fonts, tiles, hero, HUD, popups) is in art/*.js, which load
// after this file. Style guide: README.md "Art kit".
(() => {
  VL.ART = {};

  // Every colour drawn on the canvas has a name here. The canvas looks the same
  // in the site's light and dark themes, so nothing reads the page's CSS tokens.
  VL.PALETTE = {
    clear: '#00000000',
    outline: '#18242a',
    ink: '#1b1b24',
    white: '#fbfbf6',
    text: '#eef7fa',
    textDim: '#9fb3bf',
    gold: '#f2a51f',
    goldLight: '#ffd36b',

    hud: '#132029',
    boxFill: '#1a2d3a',
    boxEdge: '#eef7fa',
    boxShade: '#0b151c',
    slotEmpty: '#3a4a55',

    heart: '#e2443c',
    heartLight: '#ffb3ad',
    heartEmpty: '#3a4a55',

    skin: '#f4c9a0',
    skinShade: '#dba47c',
    hair: '#7a4325',
    hairLight: '#9c5a32',
    tunic: '#23a08f',
    tunicDark: '#1a7f72',
    tunicLight: '#4cc4b0',
    boots: '#5b3a24',
    feather: '#d9dccf',
    comb: '#e2443c',

    grass: '#68b552',
    grassAlt: '#63b04e',
    grassLight: '#86cb66',
    grassDark: '#4f9a41',
    leafDark: '#1f5e34',
    leaf: '#2f7d3f',
    leafLight: '#4c9e4a',
    leafShine: '#7cc865',
    bushDark: '#2b7a3a',
    bush: '#3f9a45',
    bushShine: '#74c25f',
    bark: '#5b3a24',
    berry: '#c4325a',
    berryLight: '#ff8aa6',

    rockDark: '#4f5560',
    rock: '#8b919c',
    rockLight: '#b9bec8',
    rockShade: '#5f6570',

    path: '#d9b97c',
    pathDark: '#c7a466',
    pathLight: '#ead09a',
    sand: '#ecd59c',
    sandDark: '#d8bc7e',
    sandLight: '#f8e8bd',
    sandWet: '#cfb27a',

    water: '#2f84c9',
    waterAlt: '#3189cf',
    waterLight: '#5eb2ea',
    shallow: '#5db4e4',
    shallowLight: '#9fdcf6',
    foam: '#cdeefc',
    foamDark: '#8fd0f2',

    flowerPink: '#ffd9ef',
    flowerYellow: '#fff3a1',
    flowerWhite: '#ffffff',

    wood: '#a0703f',
    woodDark: '#6e4527',
    woodLight: '#c99a5b',
    roof: '#b5523b',
    roofDark: '#7f3326',
    roofLight: '#d9785a',
    plaster: '#efe2c4',
    plasterShade: '#cdbb98',
    doorway: '#2a1a12',
    wallInside: '#5b4636',
    wallInsideDark: '#3e2f25',
    wallInsideLight: '#7a604b',
    floor: '#c99a64',
    floorDark: '#b0834f',
    floorLight: '#dcb27c',
    rug: '#b5523b',
    rugLight: '#e0a24f',

    shell: '#f7d9c4',
    shellDark: '#d99a7a',
    metal: '#d9dee6',
    metalDark: '#9aa3b0',
    hilt: '#a07a3a',

    shadow: '#1b3a2240',
    shadowSoft: '#1b3a2228',
    glow: '#fff6d020',
    glowWarm: '#ffd9902a',
    vignette: '#0a1a2a70',
    vignetteIndoor: '#1a0e0890',
    vignetteDark: '#020408e0',
  };

  const HEX_COLOR = /^#[0-9a-f]{6}([0-9a-f]{2})?$/;

  VL.ART.color = function color(name) {
    const value = VL.PALETTE[name];
    if (!value) throw new Error(`no palette colour ${name}`);
    return value;
  };

  // A region or dungeon adds its own named colours from its own file.
  VL.ART.addColors = function addColors(colors) {
    for (const [name, value] of Object.entries(colors)) {
      if (name in VL.PALETTE) throw new Error(`palette colour ${name} is already defined`);
      if (!HEX_COLOR.test(value)) throw new Error(`palette colour ${name} must be lower-case #rrggbb or #rrggbbaa, not ${value}`);
      VL.PALETTE[name] = value;
    }
  };

  // Stable per-tile noise (the mockup's), so grass tufts and ripples don't flicker.
  VL.ART.hash = function hash(x, y, s = 0) {
    let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };

  VL.ART.rect = function rect(ctx, name, x, y, w, h) {
    ctx.fillStyle = VL.ART.color(name);
    ctx.fillRect(x, y, w, h);
  };

  // A soft oval shadow under something standing at (cx, y).
  VL.ART.drawShadow = function drawShadow(ctx, cx, y, w = 11, name = 'shadow') {
    const left = Math.round(cx - w / 2);
    ctx.fillStyle = VL.ART.color(name);
    ctx.fillRect(left + 1, y, w - 2, 1);
    ctx.fillRect(left, y + 1, w, 1);
    ctx.fillRect(left + 1, y + 2, w - 2, 1);
  };

  // ---------- sprites ----------

  VL.ART.SPRITES = {};

  function validateSprite(id, def) {
    const { rows, colors } = def;
    if (!Array.isArray(rows) || !rows.length) throw new Error(`sprite ${id} has no rows`);
    for (const row of rows) {
      if (row.length !== rows[0].length) throw new Error(`sprite ${id}: every row must be ${rows[0].length} wide`);
      for (const ch of row) {
        if (ch !== '.' && !colors?.[ch]) throw new Error(`sprite ${id}: '${ch}' has no colour`);
      }
    }
    for (const name of Object.values(colors || {})) VL.ART.color(name);
    if (def.outline) VL.ART.color(def.outline);
  }

  // Sprites are strings, one character per pixel ('.' is transparent), with
  // `colors` mapping characters to palette names. Unless `outline: false`, a
  // 1px ring (4-neighbour, no corners) is added outside the shape in
  // `outline` (default 'outline'); the sprite's top-left stays at (x, y).
  // `mirrorOf: id` defines the left-right mirror of an earlier sprite.
  VL.ART.defineSprite = function defineSprite(id, def) {
    if (VL.ART.SPRITES[id]) throw new Error(`sprite ${id} is already defined`);
    let source = def;
    if (def.mirrorOf) {
      const original = VL.ART.SPRITES[def.mirrorOf];
      if (!original) throw new Error(`sprite ${id}: no sprite ${def.mirrorOf} to mirror`);
      source = { ...original.def, rows: original.def.rows.map((row) => [...row].reverse().join('')) };
    }
    validateSprite(id, source);
    VL.ART.SPRITES[id] = { id, def: source, compiled: null };
    return id;
  };

  // Pixels as palette names (null = transparent), outline included.
  VL.ART.spritePixels = function spritePixels(def) {
    const pad = def.outline === false ? 0 : 1;
    const { rows } = def;
    const height = rows.length;
    const width = rows[0].length;
    const filled = (x, y) => y >= 0 && y < height && x >= 0 && x < width && rows[y][x] !== '.';
    const grid = [];
    for (let y = -pad; y < height + pad; y += 1) {
      const line = [];
      for (let x = -pad; x < width + pad; x += 1) {
        if (filled(x, y)) line.push(def.colors[rows[y][x]]);
        else if (pad && (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1))) line.push(def.outline || 'outline');
        else line.push(null);
      }
      grid.push(line);
    }
    return { grid, offset: -pad, width: width + pad * 2, height: height + pad * 2 };
  };

  // Horizontal runs of one colour, so a sprite costs a handful of fillRects.
  function compileRuns(grid) {
    const runs = [];
    grid.forEach((line, y) => {
      let x = 0;
      while (x < line.length) {
        const name = line[x];
        let end = x + 1;
        while (end < line.length && line[end] === name) end += 1;
        if (name) runs.push({ color: VL.ART.color(name), x, y, w: end - x });
        x = end;
      }
    });
    return runs.sort((a, b) => (a.color < b.color ? -1 : a.color > b.color ? 1 : 0));
  }

  VL.ART.sprite = function sprite(id) {
    const entry = VL.ART.SPRITES[id];
    if (!entry) throw new Error(`no sprite ${id}`);
    if (!entry.compiled) {
      const pixels = VL.ART.spritePixels(entry.def);
      entry.compiled = { ...pixels, runs: compileRuns(pixels.grid), w: entry.def.rows[0].length, h: entry.def.rows.length };
    }
    return entry.compiled;
  };

  // (x, y) is the top-left of the sprite's own pixels; the outline sits 1px outside.
  VL.ART.drawSprite = function drawSprite(ctx, id, x, y) {
    const compiled = VL.ART.sprite(id);
    const left = Math.round(x) + compiled.offset;
    const top = Math.round(y) + compiled.offset;
    let current = null;
    for (const run of compiled.runs) {
      if (run.color !== current) {
        ctx.fillStyle = run.color;
        current = run.color;
      }
      ctx.fillRect(left + run.x, top + run.y, run.w, 1);
    }
  };

  // ---------- pixel text ----------

  VL.ART.FONTS = {};

  // glyphs: { ch: rows } with '#' for ink, or { rows, rise } for a glyph whose
  // first `rise` rows sit above the cell (an accent on a capital). A font with
  // `base` reuses another's glyphs at `scale`; `upper: true` draws lower case
  // with the capitals.
  VL.ART.defineFont = function defineFont(id, font) {
    if (VL.ART.FONTS[id]) throw new Error(`font ${id} is already defined`);
    const glyphs = {};
    for (const [ch, glyph] of Object.entries(font.glyphs || {})) {
      const { rows, rise = 0 } = Array.isArray(glyph) ? { rows: glyph } : glyph;
      if (rows.some((row) => row.length !== rows[0].length)) throw new Error(`font ${id}: glyph '${ch}' rows differ in width`);
      if (rows.length - rise > font.cell) throw new Error(`font ${id}: glyph '${ch}' is taller than the ${font.cell}px cell`);
      const runs = [];
      rows.forEach((row, y) => {
        for (let x = 0; x < row.length; x += 1) {
          if (row[x] !== '#') continue;
          let end = x;
          while (row[end + 1] === '#') end += 1;
          runs.push({ x, y: y - rise, w: end - x + 1 });
          x = end;
        }
      });
      glyphs[ch] = { width: rows[0].length, runs };
    }
    if (font.base) {
      const base = VL.ART.FONTS[font.base];
      if (!base) throw new Error(`font ${id}: no font ${font.base} to scale`);
      VL.ART.FONTS[id] = { ...base, scale: font.scale, lineHeight: font.lineHeight };
      return;
    }
    VL.ART.FONTS[id] = { scale: 1, gap: 1, ...font, glyphs };
  };

  function fontOf(size) {
    const font = VL.ART.FONTS[size];
    if (!font) throw new Error(`no font ${size}`);
    return font;
  }

  function glyphOf(font, ch) {
    const key = font.upper ? ch.toUpperCase() : ch;
    return font.glyphs[key] || font.glyphs['?'];
  }

  VL.ART.lineHeight = (size = 'normal') => fontOf(size).lineHeight;

  // Characters a font can't draw (they render as '?'). Content tests use this.
  VL.ART.missingGlyphs = function missingGlyphs(str, size = 'normal') {
    const font = fontOf(size);
    const missing = new Set();
    for (const ch of str) {
      if (ch === '\n') continue;
      if (!font.glyphs[font.upper ? ch.toUpperCase() : ch]) missing.add(ch);
    }
    return [...missing];
  };

  function lineWidth(font, line) {
    let width = 0;
    for (const ch of line) width += glyphOf(font, ch).width + font.gap;
    return line.length ? (width - font.gap) * font.scale : 0;
  }

  // Width in pixels of the widest line.
  VL.ART.measureText = function measureText(str, size = 'normal') {
    const font = fontOf(size);
    return Math.max(0, ...String(str).split('\n').map((line) => lineWidth(font, line)));
  };

  // Greedy word wrap; '\n' forces a break and a word wider than the box is split.
  VL.ART.wrapText = function wrapText(str, maxWidth, size = 'normal') {
    const lines = [];
    for (const paragraph of String(str).split('\n')) {
      let line = '';
      for (const word of paragraph.split(' ')) {
        const candidate = line ? `${line} ${word}` : word;
        if (VL.ART.measureText(candidate, size) <= maxWidth) {
          line = candidate;
          continue;
        }
        if (line) lines.push(line);
        line = '';
        let rest = word;
        while (VL.ART.measureText(rest, size) > maxWidth) {
          let cut = rest.length - 1;
          while (cut > 1 && VL.ART.measureText(rest.slice(0, cut), size) > maxWidth) cut -= 1;
          lines.push(rest.slice(0, cut));
          rest = rest.slice(cut);
        }
        line = rest;
      }
      lines.push(line);
    }
    return lines;
  };

  // Draws text with its top-left (or top-centre / top-right) at (x, y).
  // `shadow` names a colour drawn 1px down-right first, for text over the world.
  VL.ART.text = function text(ctx, str, x, y, options = {}) {
    const { size = 'normal', color = 'text', shadow = null, align = 'left' } = options;
    const font = fontOf(size);
    const lines = String(str).split('\n');
    const step = VL.ART.lineHeight(size);
    const draw = (name, dx, dy) => {
      ctx.fillStyle = VL.ART.color(name);
      lines.forEach((line, row) => {
        const width = lineWidth(font, line);
        let left = Math.round(align === 'center' ? x - width / 2 : align === 'right' ? x - width : x) + dx;
        const top = Math.round(y) + row * step + dy;
        for (const ch of line) {
          const glyph = glyphOf(font, ch);
          for (const run of glyph.runs) ctx.fillRect(left + run.x * font.scale, top + run.y * font.scale, run.w * font.scale, font.scale);
          left += (glyph.width + font.gap) * font.scale;
        }
      });
    };
    if (shadow) draw(shadow, 1, 1);
    draw(color, 0, 0);
    return VL.ART.measureText(str, size);
  };

  // ---------- tiles ----------

  VL.ART.TILE_STYLES = {};

  // Looked up for every tile every frame, so cached per legend entry.
  let chosen = new WeakMap();

  // A style draws one tile kind in three passes over the whole screen: `ground`
  // for every tile first, then `shadow`, then `raised` (trees, bushes, walls),
  // so shadows and canopies can spill onto the next tile. `when: 'water'`
  // matches tiles whose legend entry has that flag (highest `priority` wins);
  // a legend entry's own `art: 'name'` picks a style directly. `under` names a
  // style whose ground is drawn first (grass under a bush); a legend entry's
  // `ground: 'sand'` overrides it. Equal priorities throw: manifest order
  // changes with union merges, so it must never decide a look.
  VL.ART.defineTileStyle = function defineTileStyle(name, style) {
    const styles = VL.ART.TILE_STYLES;
    if (styles[name]) throw new Error(`tile style ${name} is already defined`);
    const entry = { name, priority: 0, ...style };
    if (entry.under && styles[entry.under] && !styles[entry.under].ground) throw new Error(`tile style ${name}: under names ${entry.under}, which has no ground pass`);
    const twin = entry.when && Object.values(styles).find((other) => other.when === entry.when && other.priority === entry.priority);
    if (twin) throw new Error(`tile styles ${name} and ${twin.name} both match '${entry.when}' at priority ${entry.priority}`);
    styles[name] = entry;
    chosen = new WeakMap();
    return name;
  };

  function chooseStyle(info) {
    const styles = VL.ART.TILE_STYLES;
    if (info.art) return styles[info.art] || styles.missing;
    let best = null;
    let tie = null;
    for (const style of Object.values(styles)) {
      if (!style.when || !info[style.when]) continue;
      if (!best || style.priority > best.priority) {
        best = style;
        tie = null;
      } else if (style.priority === best.priority) tie = style;
    }
    if (tie) throw new Error(`tile styles ${best.name} and ${tie.name} tie for a tile with both flags; give it art: '<style>'`);
    return best || styles.missing;
  }

  VL.ART.tileStyleFor = function tileStyleFor(info) {
    if (!info) return VL.ART.TILE_STYLES.missing;
    let style = chosen.get(info);
    if (!style) {
      style = chooseStyle(info);
      chosen.set(info, style);
    }
    return style;
  };

  // The style whose ground is the tile's floor: grass under a bush, sand under
  // a beach rock, or the tile's own style.
  VL.ART.groundOf = function groundOf(info) {
    const style = VL.ART.tileStyleFor(info);
    const name = info?.ground || style.under;
    if (!name) return style;
    const ground = VL.ART.TILE_STYLES[name];
    const field = info?.ground ? 'ground' : 'under';
    if (!ground) throw new Error(`tile style ${style.name}: ${field} names no tile style ${name}`);
    if (!ground.ground) throw new Error(`tile style ${style.name}: ${field} names ${name}, which has no ground pass`);
    return ground;
  };

  // Water, or a prop standing in it (`ground: 'shallow'`), so shores and foam
  // run round the prop instead of boxing it in.
  const WET = new Set(['water', 'shallow']);
  VL.ART.isWet = (info) => Boolean(info && (info.water || info.shallow || WET.has(VL.ART.groundOf(info).when)));

  // Sides of a wet tile that meet land. Off the world (null) counts as more water.
  VL.ART.wetEdges = function wetEdges(cell) {
    const land = (dx, dy) => {
      const other = cell.near(dx, dy);
      return other !== null && !VL.ART.isWet(other);
    };
    return { n: land(0, -1), e: land(1, 0), s: land(0, 1), w: land(-1, 0) };
  };

  // lookup(tx, ty) returns tile info, reading past the edges into neighbours
  // (null off the world). (originX, originY) is the screen's first tile in world
  // tiles, so noise lines up across screen edges.
  VL.ART.drawTiles = function drawTiles(ctx, lookup, ox, oy, t, originX = 0, originY = 0) {
    const { cols, rows, tile } = VL.TUNING;
    const cells = [];
    for (let ty = 0; ty < rows; ty += 1) {
      for (let tx = 0; tx < cols; tx += 1) {
        const info = lookup(tx, ty);
        cells.push({
          style: VL.ART.tileStyleFor(info),
          cell: {
            tx, ty, info,
            x: Math.round(ox + tx * tile),
            y: Math.round(oy + ty * tile),
            wx: originX + tx,
            wy: originY + ty,
            near: (dx, dy) => lookup(tx + dx, ty + dy),
            seed: (i = 0) => VL.ART.hash(originX + tx, originY + ty, i),
          },
        });
      }
    }
    for (const { style, cell } of cells) {
      const ground = VL.ART.groundOf(cell.info);
      if (ground !== style) ground.ground(ctx, cell, t);
      style.ground?.(ctx, cell, t);
    }
    for (const { style, cell } of cells) style.shadow?.(ctx, cell, t);
    for (const { style, cell } of cells) style.raised?.(ctx, cell, t);
  };

  // `room` (state.room) draws this visit's changed tiles, such as a cut bush.
  VL.ART.drawScreenTiles = function drawScreenTiles(ctx, areaId, key, ox, oy, t, room) {
    const { cols, rows } = VL.TUNING;
    const [sx, sy] = key.split(',').map(Number);
    const lookup = (tx, ty) => {
      const ch = VL.tileAt(areaId, key, tx, ty, room);
      return ch === null ? null : VL.tileInfo(areaId, ch);
    };
    VL.ART.drawTiles(ctx, lookup, ox, oy, t, (sx || 0) * cols, (sy || 0) * rows);
  };

  // Drawn when a tile has no style, so a gap is loud on screen and in tests.
  VL.ART.defineTileStyle('missing', {
    ground(ctx, { x, y }) {
      VL.ART.rect(ctx, 'heart', x, y, 16, 16);
      VL.ART.rect(ctx, 'ink', x, y, 8, 8);
      VL.ART.rect(ctx, 'ink', x + 8, y + 8, 8, 8);
    },
  });

  // ---------- light ----------

  // Each mood is a warm glow from the top-left plus a vignette; areas default to day.
  VL.ART.LIGHTS = {
    day: { glow: 'glow', vignette: 'vignette' },
    indoor: { glow: 'glowWarm', vignette: 'vignetteIndoor' },
    dark: { glow: 'clear', vignette: 'vignetteDark' },
  };
  VL.ART.AREA_LIGHT = {};

  VL.ART.setAreaLight = function setAreaLight(areaId, mood) {
    if (!VL.ART.LIGHTS[mood]) throw new Error(`no light ${mood}`);
    if (VL.ART.AREA_LIGHT[areaId]) throw new Error(`area ${areaId} already has a light`);
    VL.ART.AREA_LIGHT[areaId] = mood;
  };

  VL.ART.lightFor = (areaId) => VL.ART.AREA_LIGHT[areaId] || 'day';

  // Over the play area (w×h, origin at its top-left), after the hero.
  VL.ART.drawLight = function drawLight(ctx, mood, w, h) {
    const light = VL.ART.LIGHTS[mood] || VL.ART.LIGHTS.day;
    const gradient = ctx.createRadialGradient(w * 0.27, h * 0.17, 10, w / 2, h / 2, w * 0.74);
    gradient.addColorStop(0, VL.ART.color(light.glow));
    gradient.addColorStop(0.6, VL.ART.color('clear'));
    gradient.addColorStop(1, VL.ART.color(light.vignette));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  };
})();
