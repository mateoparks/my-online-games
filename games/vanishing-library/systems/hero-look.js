// W37: the hero's look (clothes colour, hair length) and boy or girl, chosen
// with the name. The look is a recolour and hair layer over the hero's own
// sprites: a variant keeps every pixel's place (face, hands, feet), so
// anything drawn over the hero lines up whatever he wears. README "Hero look".
(() => {
  VL.HERO_OUTFITS = ['green', 'blue', 'purple', 'pink', 'yellow'];
  VL.HERO_HAIRS = ['short', 'long'];
  VL.HERO_GENDERS = ['boy', 'girl'];
  // Today's look: a save without the field keeps looking exactly as before.
  VL.DEFAULT_LOOK = { outfit: 'green', hair: 'short', gender: 'boy' };

  VL.ART.addColors({
    outfitBlue: '#2c47b8', outfitBlueDark: '#1f3388', outfitBlueLight: '#6585e6',
    outfitPurple: '#8b4fc9', outfitPurpleDark: '#64349a', outfitPurpleLight: '#b688ea',
    outfitPink: '#e2589a', outfitPinkDark: '#b23a74', outfitPinkLight: '#ff9fcb',
    outfitYellow: '#f2c419', outfitYellowDark: '#bf8c0c', outfitYellowLight: '#ffe776',
  });
  // Each outfit's three tunic shades; green is the hero's original tunic.
  VL.OUTFIT_COLORS = {
    green: { tunic: 'tunic', tunicDark: 'tunicDark', tunicLight: 'tunicLight' },
    blue: { tunic: 'outfitBlue', tunicDark: 'outfitBlueDark', tunicLight: 'outfitBlueLight' },
    purple: { tunic: 'outfitPurple', tunicDark: 'outfitPurpleDark', tunicLight: 'outfitPurpleLight' },
    pink: { tunic: 'outfitPink', tunicDark: 'outfitPinkDark', tunicLight: 'outfitPinkLight' },
    yellow: { tunic: 'outfitYellow', tunicDark: 'outfitYellowDark', tunicLight: 'outfitYellowLight' },
  };

  const pick = (value, options, fallback) => (options.includes(value) ? value : fallback);
  VL.normalLook = (look) => ({
    outfit: pick(look?.outfit, VL.HERO_OUTFITS, VL.DEFAULT_LOOK.outfit),
    hair: pick(look?.hair, VL.HERO_HAIRS, VL.DEFAULT_LOOK.hair),
    gender: pick(look?.gender, VL.HERO_GENDERS, VL.DEFAULT_LOOK.gender),
  });
  VL.heroLook = (state) => VL.normalLook(state?.look);

  VL.extendGame('heroLook', (options) => ({ look: VL.normalLook(options.look) }));

  // ---------- long hair ----------

  // Hair drawn over a sprite's rows for long hair: 'h' hair, 'H' its light,
  // '.' leaves the pixel. Rows past the overlay are left alone (legs).
  const HAIR = {};
  VL.ART.defineHeroHair = function defineHeroHair(spriteId, rows) {
    if (HAIR[spriteId]) throw new Error(`long hair for ${spriteId} is already defined`);
    HAIR[spriteId] = rows;
  };
  const mirror = (rows) => rows.map((row) => [...row].reverse().join(''));
  // Down: curtains either side of the face, onto the shoulders.
  const down = ['............', '............', '.H........h.', '.H........h.', '.h........h.', '.h........h.', '.hh......hh.', '.hh......hh.'];
  // Up: down the back, over the tunic, to a point.
  const up = ['............', '............', '.H........h.', '.H........h.', '.h........h.', '.hh......hh.', '.hhhhhhhhhh.', '..hhhHhhhh..', '...hhhhhh...', '....hhhh....'];
  // Left: from the back of the head down behind the shoulder.
  const left = ['............', '............', '............', '............', '...........h', '..........hh', '.......hhhhh', '........hhh.', '.........hh.'];
  for (let frame = 0; frame < 3; frame += 1) {
    VL.ART.defineHeroHair(`hero-down-${frame}`, down);
    VL.ART.defineHeroHair(`hero-up-${frame}`, up);
    VL.ART.defineHeroHair(`hero-left-${frame}`, left);
    VL.ART.defineHeroHair(`hero-right-${frame}`, mirror(left));
  }
  // Arms up beside the head: the hair falls inside them.
  VL.ART.defineHeroHair('hero-hold', ['............', '............', '............', '..h......h..', '..h......h..', '..h......h..', '..h......h..', '..h......h..']);
  VL.ART.defineHeroHair('puppet-hero', ['......', '......', '.....h', 'h....h', 'h....h']);

  // ---------- variants ----------

  const isDefault = (look) => look.outfit === VL.DEFAULT_LOOK.outfit && look.hair === VL.DEFAULT_LOOK.hair;
  const HAIR_KEYS = { h: '1', H: '2' };

  // The sprite to draw for `id` in `look`: `id` itself for today's look, else
  // a variant defined the first time it is asked for.
  VL.ART.lookSprite = function lookSprite(id, look) {
    const wear = VL.normalLook(look);
    if (isDefault(wear)) return id;
    const variant = `${id}~${wear.outfit}-${wear.hair}`;
    if (VL.ART.SPRITES[variant]) return variant;
    const { def } = VL.ART.SPRITES[id] || {};
    if (!def) throw new Error(`no sprite ${id}`);
    const outfit = VL.OUTFIT_COLORS[wear.outfit];
    const colors = Object.fromEntries(Object.entries(def.colors).map(([ch, name]) => [ch, outfit[name] || name]));
    let rows = def.rows;
    const hair = wear.hair === 'long' && HAIR[id];
    if (hair) {
      colors[HAIR_KEYS.h] = 'hair';
      colors[HAIR_KEYS.H] = 'hairLight';
      rows = rows.map((row, y) => [...row].map((ch, x) => HAIR_KEYS[hair[y]?.[x]] || ch).join(''));
    }
    return VL.ART.defineSprite(variant, { ...def, colors, rows });
  };

  // The finale hall's hero marionette and the town booth's little hero
  // puppet wear the player's look; entity draws see only their room copy.
  VL.onRoomBuilt((state) => {
    for (const entity of state.room.entities) {
      if ((entity.type === 'marionette' && entity.puppet === 'hero') || (entity.type === 'decor' && entity.art === 'puppetBooth')) entity.look = VL.heroLook(state);
    }
  });
})();
