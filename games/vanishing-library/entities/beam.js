// The lighthouse beam (design: The path through the game, 6: "mirrors that
// bounce the lighthouse beam"). A `beamSource` ({ id?, x, y, dir }) shines a
// beam along its row or column, over floor, pits and water; a `beamMirror`
// ({ x, y, turn: '/' | '\\' }) bends it a quarter turn, and S or a slingshot
// shot turns the mirror the other way (for this visit); a `beamCrystal`
// ({ id, x, y }) the beam reaches is lit for good, saved like a switch, so a
// shutter can open on it. Walls and solid things stop the beam; the hero
// never does. README "The beam (W18)".
(() => {
  const T = VL.TUNING;
  const DIRS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

  VL.ART.addColors({
    beam: '#fff1a8',
    beamGlow: '#ffd65a70',
    beamCore: '#fffbe8',
    mirrorGlass: '#bfe6ff',
    mirrorGlassLight: '#f2fbff',
    crystal: '#7fd6ff',
    crystalLight: '#dff6ff',
    crystalDark: '#3d8fc0',
    crystalLit: '#fff3a0',
  });

  // ---------- the rules ----------

  // A mirror sends the beam a quarter turn: '/' turns right into up, '\' right into down.
  VL.reflectBeam = function reflectBeam(turn, dx, dy) {
    return turn === '/' ? [-dy, -dx] : [dy, dx];
  };

  const stopsBeam = (e) => e.type !== 'beamMirror' && e.type !== 'beamCrystal' && (e.type === 'shutter' ? e.closed : e.solid || VL.ENTITIES[e.type]?.solid);

  // The beam from one source through this visit's room: `points` in
  // play-area pixels (the source, every mirror, where it stops) and the
  // crystal it reaches, if any.
  VL.beamPath = function beamPath(room, source) {
    const { tile, cols, rows } = T;
    const centre = (tx, ty) => ({ x: tx * tile + 8, y: ty * tile + 8 });
    const points = [centre(source.x, source.y)];
    let [dx, dy] = DIRS[source.dir];
    let tx = source.x;
    let ty = source.y;
    let crystal = null;
    for (let i = 0; i < cols * rows; i += 1) {
      const nx = tx + dx;
      const ny = ty + dy;
      const stop = () => points.push({ x: tx * tile + 8 + dx * 8, y: ty * tile + 8 + dy * 8 });
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) {
        stop();
        break;
      }
      const here = room.entities.filter((e) => e.x === nx && e.y === ny && e.type !== 'slingPellet');
      const mirror = here.find((e) => e.type === 'beamMirror');
      const found = here.find((e) => e.type === 'beamCrystal');
      if (mirror) {
        tx = nx;
        ty = ny;
        points.push(centre(tx, ty));
        [dx, dy] = VL.reflectBeam(mirror.turn, dx, dy);
        continue;
      }
      if (found) {
        points.push(centre(nx, ny));
        crystal = found;
        break;
      }
      const info = VL.tileInfo(room.area, VL.tileAt(room.area, room.screen, nx, ny, room));
      if ((info.solid && !(info.pit || info.water || info.low)) || here.some(stopsBeam)) {
        stop();
        break;
      }
      tx = nx;
      ty = ny;
    }
    return { points, crystal };
  };

  VL.roomBeams = (room) => (room?.entities || []).filter((e) => e.type === 'beamSource').map((source) => VL.beamPath(room, source));

  VL.turnMirror = function turnMirror(state, mirror) {
    mirror.turn = mirror.turn === '/' ? '\\' : '/';
    state.events.push({ type: 'mirrorTurn' });
  };

  // Settled every step: a crystal the beam reaches is lit for good.
  VL.defineSystem('beams', {
    order: 42,
    update(state) {
      const room = state.room;
      if (!room || !VL.dungeonOf(state) || !room.entities.some((e) => e.type === 'beamSource')) return;
      for (const { crystal } of VL.roomBeams(room)) {
        if (crystal && !crystal.on && VL.throwSwitch(state, crystal)) state.events.push({ type: 'crystalLit' });
      }
    },
  });

  // ---------- the pieces ----------

  VL.ART.defineSprite('prop-beam-source', {
    colors: { b: 'gold', B: 'goldLight', d: 'dgnStoneDark', g: 'beam', w: 'beamCore' },
    rows: [
      '.bbbbbb.',
      'bBBBBBBb',
      'bBgwwgBb',
      'bBwwwwBb',
      'bBgwwgBb',
      'bBBBBBBb',
      '.bbbbbb.',
      '..dddd..',
    ],
  });

  const mirrorColors = { g: 'mirrorGlass', l: 'mirrorGlassLight', b: 'gold', d: 'woodDark', k: 'dgnStoneDark' };
  VL.ART.defineSprite('prop-mirror-slash', {
    colors: mirrorColors,
    rows: [
      '.......bb',
      '......bgb',
      '.....bglb',
      '....bglb.',
      '...bglb..',
      '..bglb...',
      '.bglb....',
      'bglb.....',
      'bgb......',
      'bb.......',
      '....d....',
      '...kkk...',
    ],
  });
  VL.ART.defineSprite('prop-mirror-backslash', {
    colors: mirrorColors,
    rows: [
      'bb.......',
      'bgb......',
      'blgb.....',
      '.blgb....',
      '..blgb...',
      '...blgb..',
      '....blgb.',
      '.....blgb',
      '......bgb',
      '.......bb',
      '....d....',
      '...kkk...',
    ],
  });

  const crystalRows = [
    '...c...',
    '..clc..',
    '.cllcc.',
    'cllcccd',
    '.ccccd.',
    '..ccd..',
    '...d...',
    '.kkkkk.',
  ];
  VL.ART.defineSprite('prop-crystal', { colors: { c: 'crystal', l: 'crystalLight', d: 'crystalDark', k: 'dgnStoneDark' }, rows: crystalRows });
  VL.ART.defineSprite('prop-crystal-lit', { outline: 'gold', colors: { c: 'crystalLit', l: 'beamCore', d: 'gold', k: 'dgnStoneDark' }, rows: crystalRows });

  VL.defineEntity('beamSource', {
    solid: true,
    glowsInDark: true,
    draw(ctx, source, x, y, t) {
      VL.ART.drawSprite(ctx, 'prop-beam-source', x + 4, y + 4);
      if (Math.floor(t * 4) % 2) VL.ART.rect(ctx, 'white', x + 8, y + 7, 1, 1);
    },
  });

  VL.defineEntity('beamMirror', {
    solid: true,
    glintsInDark: true,
    onInteract(state, mirror) {
      VL.turnMirror(state, mirror);
    },
    onShot(state, mirror) {
      VL.turnMirror(state, mirror);
    },
    draw(ctx, mirror, x, y) {
      VL.ART.drawShadow(ctx, x + 8, y + 15, 10);
      VL.ART.drawSprite(ctx, mirror.turn === '/' ? 'prop-mirror-slash' : 'prop-mirror-backslash', x + 3, y + 2);
    },
  });

  VL.defineEntity('beamCrystal', {
    solid: true,
    lightsRoom: true,
    glintsInDark: true,
    glowsInDark: true,
    prepare(state, crystal) {
      const dungeon = VL.dungeonOfArea(state.player.area);
      crystal.on = Boolean(dungeon && VL.dungeonState(state, dungeon.id).switches[crystal.id]);
    },
    draw(ctx, crystal, x, y, t) {
      VL.ART.drawShadow(ctx, x + 8, y + 15, 8);
      VL.ART.drawSprite(ctx, crystal.on ? 'prop-crystal-lit' : 'prop-crystal', x + 4, y + 5);
      if (crystal.on) VL.ART.drawSparkle(ctx, x + 12, y + 4, t);
    },
  });

  // The beam itself, over the dark (systems/darkness.js draws first): a
  // soft glow with a bright core, shimmering a little.
  VL.defineHeroLayer('beams', (ctx, state, x, y, t, pass) => {
    if (pass !== 'front' || !state.room?.entities.some((e) => e.type === 'beamSource')) return;
    const ox = x - Math.round(state.player.x);
    const oy = y - Math.round(state.player.y);
    const core = Math.floor(t * 10) % 2 ? 'beamCore' : 'beam';
    for (const { points } of VL.roomBeams(state.room)) {
      for (let i = 1; i < points.length; i += 1) {
        const a = points[i - 1];
        const b = points[i];
        const left = Math.min(a.x, b.x);
        const top = Math.min(a.y, b.y);
        const w = Math.abs(a.x - b.x);
        const h = Math.abs(a.y - b.y);
        VL.ART.rect(ctx, 'beamGlow', ox + left - 2, oy + top - 2, w + 5, h + 5);
        VL.ART.rect(ctx, 'beam', ox + left - 1, oy + top - 1, w + 3, h + 3);
        VL.ART.rect(ctx, core, ox + left, oy + top, w + 1, h + 1);
      }
    }
  }, { steady: true });

  VL.defineSfx('mirrorTurn', [{ wave: 'triangle', freq: 600, to: 900, dur: 0.08, vol: 0.25 }], { gap: 0.08 });
  VL.defineSfx('crystalLit', [
    { wave: 'sine', freq: 880, dur: 0.3, vol: 0.3 },
    { wave: 'sine', freq: 1320, at: 0.1, dur: 0.35, vol: 0.25 },
    { wave: 'triangle', freq: 1760, at: 0.2, dur: 0.4, vol: 0.15 },
  ], { gap: 0.4 });
  VL.SOUND.onEvent('mirrorTurn', 'mirrorTurn');
  VL.SOUND.onEvent('crystalLit', 'crystalLit');
})();
