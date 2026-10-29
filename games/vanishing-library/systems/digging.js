// Shovels and digging (design: Resources and economy, Digging; Tools: two
// tiers). A shovel takes both hands; either hand key digs the tile ahead. Sand
// gives a whole shell 20% of the time (30% once the Tide Tables are read)
// and a broken one 50%; the metal shovel also digs grass, where a few
// secrets lie buried, and (W38) roads and the Whispering Woods floor, which
// hide what grass does. A dug hole lasts for the visit (VL.setRoomTile), like
// a cut bush, and keeps its ground's flag, so nothing that reads the ground
// (or walks on it) sees anything but a path or a forest floor with a hole.
(() => {
  VL.tune({
    digSeconds: 0.3,
    digChance: 0.2,
    digChanceTideTables: 0.3,
    // Sand only: a broken shell, in the band after the whole one.
    digBrokenChance: 0.5,
    // Hard ground hides less; its real prizes are the buried secrets.
    digDirtChance: 0.15,
  });

  // ---------- holes ----------

  VL.DIG_HOLES = { sand: '@', dirt: '*', path: '=', moss: '~' };
  VL.extendTileset('base', {
    '@': { sand: true, hole: true, art: 'holeSand' },
    '*': { grass: true, hole: true, art: 'holeDirt' },
    '=': { path: true, hole: true, art: 'holePath' },
    '~': { moss: true, hole: true, art: 'holeMoss' },
  });

  // A scooped pit: a rim of turned earth, a darker floor, shade under the far lip.
  function drawHole(ctx, cell, rim, floor) {
    const { x, y } = cell;
    VL.ART.rect(ctx, rim, x + 3, y + 4, 10, 9);
    VL.ART.rect(ctx, rim, x + 2, y + 5, 12, 7);
    VL.ART.rect(ctx, floor, x + 4, y + 6, 8, 5);
    VL.ART.rect(ctx, floor, x + 3, y + 7, 10, 3);
    VL.ART.rect(ctx, 'shadow', x + 4, y + 6, 8, 2);
    VL.ART.rect(ctx, 'shadow', x + 3, y + 7, 1, 2);
    // Spoil thrown up on the near side.
    VL.ART.rect(ctx, rim, x + 4, y + 13, 3, 1);
    VL.ART.rect(ctx, rim, x + 10, y + 13, 2, 1);
  }
  VL.ART.defineTileStyle('holeSand', {
    ground(ctx, cell, t) {
      VL.ART.TILE_STYLES.sand.ground(ctx, cell, t);
      drawHole(ctx, cell, 'sandDark', 'woodDark');
    },
  });
  VL.ART.defineTileStyle('holeDirt', {
    ground(ctx, cell, t) {
      VL.ART.TILE_STYLES.grass.ground(ctx, cell, t);
      drawHole(ctx, cell, 'pathDark', 'woodDark');
    },
  });

  VL.ART.defineTileStyle('holePath', {
    ground(ctx, cell, t) {
      VL.ART.TILE_STYLES.path.ground(ctx, cell, t);
      drawHole(ctx, cell, 'pathDark', 'woodDark');
    },
  });
  // The forest floor's own style lives with the Woods (regions/woods.js).
  VL.ART.defineTileStyle('holeMoss', {
    ground(ctx, cell, t) {
      VL.ART.TILE_STYLES.moss.ground(ctx, cell, t);
      drawHole(ctx, cell, 'woodsFloorDark', 'woodDark');
    },
  });

  // ---------- shovels ----------

  const shovelRows = ['.ddd.', '..d..', '..d..', '..d..', '..d..', '..d..', '.LLL.', 'LllLL', 'LlLLL', 'LLLLL', '.LLL.'];
  const transpose = (rows) => [...rows[0]].map((_, x) => rows.map((row) => row[x]).join(''));
  for (const [tier, colors] of [['wood', { d: 'woodDark', L: 'wood', l: 'woodLight' }], ['metal', { d: 'woodDark', L: 'metal', l: 'white' }]]) {
    VL.ART.defineSprite(`item-shovel-${tier}`, { colors, rows: shovelRows });
    // Held out to dig: the blade towards the ground ahead.
    VL.ART.defineSprite(`dig-shovel-${tier}-down`, { colors, rows: shovelRows });
    VL.ART.defineSprite(`dig-shovel-${tier}-up`, { colors, rows: shovelRows.slice().reverse() });
    VL.ART.defineSprite(`dig-shovel-${tier}-right`, { colors, rows: transpose(shovelRows) });
    VL.ART.defineSprite(`dig-shovel-${tier}-left`, { mirrorOf: `dig-shovel-${tier}-right` });
  }
  VL.ART.defineSprite('fx-dirt', { outline: false, colors: { d: 'sandDark' }, rows: ['d'] });

  VL.defineItem('woodShovel', {
    name: 'Wood Shovel',
    icon: 'shovel-wood',
    twoHanded: true,
    about: 'Takes both hands. {mainKey} or {offKey} digs sand.',
    popup: { title: 'You got a Wood Shovel!', text: 'Whole shells hide in the beach sand. Dig for them!' },
    use(state, hand) {
      VL.dig(state, 'woodShovel', hand);
    },
  });

  VL.defineItem('metalShovel', {
    name: 'Metal Shovel',
    icon: 'shovel-metal',
    twoHanded: true,
    digsDirt: true,
    about: 'Digs sand, grass, paths and the forest floor.',
    popup: { title: 'You got a Metal Shovel!', text: 'It digs grass, paths and the forest floor as well as sand. Who knows what lies buried out there?' },
    use(state, hand) {
      VL.dig(state, 'metalShovel', hand);
    },
  });

  // ---------- buried things ----------

  // { type: 'buried', id, popup }: something under the sand, found once by
  // digging its tile (saved as found:<id>). Only a dimple in the sand shows.
  VL.defineEntity('buried', {
    prepare: (state, buried) => !VL.spotFound(state, buried.id),
    draw(ctx, buried, x, y) {
      VL.ART.rect(ctx, 'sandDark', x + 6, y + 9, 4, 1);
      VL.ART.rect(ctx, 'sandLight', x + 7, y + 8, 2, 1);
    },
  });
  VL.definePopup('buriedBook', { title: 'A buried book!', text: 'Someone hid it here to keep it safe. The library will want it back.' });
  VL.fillSpot('bookBeachBuried', { type: 'buried', id: 'bookBeachBuried', popup: 'buriedBook' });

  // Caches under the grass of the home fields, for the metal shovel only.
  // The smith hints at them (regions/buildings.js).
  VL.BURIED_SECRETS = {
    secretMeadow: { id: 'secretMeadow', area: 'overworld', screen: '0,0', tx: 7, ty: 5, shells: 10 },
    secretField: { id: 'secretField', area: 'overworld', screen: '1,0', tx: 10, ty: 3, shells: 10 },
  };
  VL.definePopup('buriedSecret', { title: 'Buried treasure!', text: 'An old pouch of whole shells. Someone hid their savings out here long ago.' });

  const secretAt = (state, tx, ty) => Object.values(VL.BURIED_SECRETS).find((s) => s.area === state.room.area && s.screen === state.room.screen && s.tx === tx && s.ty === ty);

  // ---------- digging ----------

  VL.digChance = (state, ground, tideTables = VL.tideTablesRead(state)) => {
    if (ground !== 'sand') return VL.TUNING.digDirtChance;
    return tideTables ? VL.TUNING.digChanceTideTables : VL.TUNING.digChance;
  };
  // One roll per dig: 'shell', 'brokenShell' or null.
  VL.digFind = function digFind(state, ground, tideTables) {
    const roll = VL.random(state);
    const whole = VL.digChance(state, ground, tideTables);
    if (roll < whole) return 'shell';
    if (ground === 'sand' && roll < whole + VL.TUNING.digBrokenChance) return 'brokenShell';
    return null;
  };

  // 'sand', 'dirt', 'path' or 'moss' when the shovel can dig the tile, else null.
  function groundAt(state, tx, ty, shovel) {
    const { cols, rows } = VL.TUNING;
    if (tx < 0 || ty < 0 || tx >= cols || ty >= rows) return null;
    const room = state.room;
    const info = VL.tileInfo(room.area, VL.tileAt(room.area, room.screen, tx, ty, room));
    if (info.solid || info.hole) return null;
    if (room.entities.some((e) => e.x === tx && e.y === ty && e.type !== 'buried' && !(e.hidden && e.reveal === 'dug'))) return null;
    if (info.sand) return 'sand';
    if (!VL.ITEMS[shovel]?.digsDirt) return null;
    if (info.grass) return 'dirt';
    if (info.path) return 'path';
    if (info.moss) return 'moss';
    return null;
  }

  // Digs the tile ahead: 'blocked', 'find' (something buried), 'secret',
  // 'shell', 'brokenShell' or 'empty'; false while the last dig is still under way.
  VL.dig = function dig(state, shovel) {
    const player = state.player;
    if (player.dig) return false;
    const { tx, ty } = VL.facingTile(state);
    const ground = groundAt(state, tx, ty, shovel);
    player.dig = { t: 0, item: shovel, facing: player.facing, ground };
    if (!ground) {
      state.events.push({ type: 'digBlocked' });
      return 'blocked';
    }
    VL.setRoomTile(state, tx, ty, VL.DIG_HOLES[ground]);
    state.events.push({ type: 'dig', tx, ty, ground });
    // A dungeon key buried under the grass (W30) comes up into the hole.
    const dug = state.room.entities.find((e) => e.hidden && e.reveal === 'dug' && e.x === tx && e.y === ty);
    if (dug) {
      dug.hidden = false;
      state.events.push({ type: 'revealed', id: dug.id });
      return 'find';
    }
    const buried = state.room.entities.find((e) => e.type === 'buried' && e.x === tx && e.y === ty);
    if (buried) {
      state.room.entities = state.room.entities.filter((e) => e !== buried);
      VL.markFound(state, buried.id);
      if (buried.popup) VL.showPopup(state, buried.popup);
      state.events.push({ type: 'pickup', kind: 'book' });
      VL.earned(state);
      return 'find';
    }
    const secret = ground === 'dirt' && secretAt(state, tx, ty);
    if (secret && !VL.spotFound(state, secret.id)) {
      VL.markFound(state, secret.id);
      VL.addResource(state, 'shells', secret.shells);
      VL.showPopup(state, 'buriedSecret');
      VL.firstTimeFlag(state, 'dugSecret');
      state.events.push({ type: 'pickup', kind: 'shell' });
      return 'secret';
    }
    const find = VL.digFind(state, ground);
    if (!find) return 'empty';
    state.room.entities.push({ type: 'drop', kind: find, x: tx, y: ty, born: state.time });
    if (find === 'shell') VL.firstTimeFlag(state, 'dugShell');
    return find;
  };

  // X digs with the best shovel owned, whatever the hands hold, so the sword
  // and shield stay ready; the first shovel brings the popup that says so.
  VL.definePopup('digKey', {
    title: 'A dig key!',
    text: 'Press X to dig with your shovel, any time. Your sword and shield stay in your hands.',
  });
  VL.bestShovel = (state) => ['metalShovel', 'woodShovel'].find((id) => VL.hasItem(state, id)) || null;

  VL.defineSystem('digging', {
    order: 21,
    update(state, actions, dt) {
      const player = state.player;
      const dig = player.dig;
      if (dig && (dig.t += dt) >= VL.TUNING.digSeconds) player.dig = null;
      const shovel = VL.bestShovel(state);
      if (!shovel) return;
      VL.showPopup(state, 'digKey');
      const busy = player.carrying || player.flight || player.rope || player.lifted || player.swing || state.hp <= 0;
      if (actions.pressed.dig && !busy) VL.dig(state, shovel);
    },
  });

  // The blade bites in front of the hero, then lifts with a spray of sand.
  const BLADE = { down: [-2, -2], up: [-2, -22], left: [-15, -6], right: [4, -6] };
  VL.defineHeroLayer('dig', (ctx, state, x, y, t, pass) => {
    const dig = state.player.dig;
    if (!dig || pass !== (dig.facing === 'up' ? 'behind' : 'front')) return;
    const k = VL.clamp(dig.t / VL.TUNING.digSeconds, 0, 1);
    const [dx, dy] = BLADE[dig.facing] || BLADE.down;
    const lift = k < 0.5 ? 0 : Math.round((k - 0.5) * 8);
    VL.ART.drawSprite(ctx, `dig-${VL.ITEMS[dig.item]?.icon || 'shovel-wood'}-${dig.facing}`, x + dx, y + dy - lift);
    if (!dig.ground || k < 0.4) return;
    for (let i = 0; i < 5; i += 1) {
      const a = Math.PI * (1.1 + i * 0.2);
      const r = 3 + (k - 0.4) * 18;
      VL.ART.drawSprite(ctx, 'fx-dirt', Math.round(x + dx + 3 + Math.cos(a) * r), Math.round(y + dy + 8 + Math.sin(a) * r * 0.7));
    }
  });

  VL.defineSfx('dig', [
    { wave: 'noise', dur: 0.12, vol: 0.5, filter: { type: 'lowpass', freq: 900, to: 300 } },
    { wave: 'noise', at: 0.08, dur: 0.1, vol: 0.3, filter: { type: 'bandpass', freq: 1800, to: 700, q: 1 } },
  ], { gap: 0.15 });
  VL.SOUND.onEvent('dig', 'dig');
  VL.SOUND.onEvent('digBlocked', 'tink');

  // ---------- the progression table ----------

  const claim = (id, reached) => VL.defineLock(id, { ...VL.LOCKS[id], reached });
  claim('digShells', (state) => Boolean(state.flags.dugShell));
  claim('buriedSecrets', (state) => Boolean(state.flags.dugSecret));
  claim('woodShovel', (state) => VL.hasItem(state, 'woodShovel'));
  claim('metalShovel', (state) => VL.hasItem(state, 'metalShovel'));
})();
