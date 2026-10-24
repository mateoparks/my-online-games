# The Vanishing Library

A top-down pixel-art adventure for Arcade Current. Static files only: open
`index.html` from disk or any static server. The design record lives outside
the repo (`docs/vanishing-library-design.md` is git-ignored, local only).

## Layout

Every script is a classic `<script>` that attaches to the global `VL`.
`manifest.js` is the **one list** of game files: `index.html` loads them in
that order and `game.test.js` loads the same list into `node:vm`. Sections load
top to bottom:

| Section | What lives there | Registers with |
|---|---|---|
| `core` | `config.js` (`VL.TUNING`), `util.js` (Actions, RNG), `tiles.js`, `world.js` (areas, screens, collision), `state.js`, `engine.js` (system pipeline, `enterScreen`), `app.js` (scenes), `screen.js` (integer scaling), `loop.js` (fixed step) | - |
| `art` | the art kit: `art.js` (palette, sprites, fonts, tile styles, light) first, then `art/*.js` (fonts, base tiles, hero, small sprites, HUD and popups). Everything drawn goes through `VL.ART`; see [Art kit](#art-kit) | `VL.ART.*` |
| `systems` | one file per gameplay system (`systems/movement.js`, later combat, chickens, ...) | `VL.defineSystem` |
| `entities` | one file per entity type (`entities/door.js`, later chests, signs, ...) | `VL.defineEntity` |
| `regions` | one file per overworld region, adding screens to the `overworld` area | `VL.addScreens` |
| `dungeons` | one file per dungeon, each its own area | `VL.defineArea` / `VL.addScreens` |
| `scenes` | one file per scene (`scenes/play.js`, later title, pause, ...) | `VL.defineScene` |
| `boot` | `render.js`, `input.js`, `main.js` | - |

### Working in parallel without conflicts

Two items are usually built side by side on separate branches, so the rules
below exist to keep their diffs in different files:

- **Add a new file at the end of its section** in `manifest.js`, one file per
  line. `.gitattributes` merges `manifest.js` with `merge=union`, so two
  branches appending to the same section merge cleanly with both lines kept.
  That is only safe because **files in a section must not depend on each
  other**: use only earlier sections (`core`, `art`) at load time, and talk to
  other files in your section through the registries at run time. The one
  exception is `art.js`, which stays first in `art` and which every other art
  file may use. The test
  checks that every listed file exists, nothing is listed twice and `main.js`
  is last. To remove a file, delete it as well as its manifest line: a union
  merge keeps both sides of overlapping edits, so a line another branch
  touched nearby can come back, and only a missing file makes that fail the
  "exists" check.
- **Never edit `config.js`, `state.js` or `tiles.js`** to add things. From your
  own file use `VL.tune({ crabSpeed: 40 })` for tuning numbers,
  `VL.extendGame('inventory', (options) => ({ inventory: {} }))` for saved
  state fields, and `VL.extendTileset('base', { '%': { solid: true, ore: true } })`
  for tile characters. Each throws on a name another file already took.
- **Every registry throws on a duplicate id** (`defineSystem`, `defineEntity`,
  `defineScene`, `defineTileset`, `addScreens`), so a clash between two lanes
  fails the test run instead of silently dropping one side.
- **Tests go in a new `tests/<item>.test.js`**, never appended to an existing
  one (see Testing).

### Adding a region

Create `regions/<name>.js`:

```js
VL.addScreens('overworld', {
  '2,1': { tiles: [ /* 11 strings of 16 tile characters */ ], entities: [ /* { type, x, y, ... } in tiles */ ] },
});
```

Screens are keyed `'x,y'`; walking off an edge enters the neighbouring key with
a slide. Open edge tiles must line up with the neighbour's (the test
`open screen edges line up` enforces this). The world edge is solid when there is
no neighbour. Tile characters come from the area's tileset (`tiles.js`, `base`);
add new ones with `VL.extendTileset`.

### Adding a dungeon

Create `dungeons/<name>.js`, give it its own area and, if needed, tileset:

```js
VL.defineTileset('scriptorium', { '#': { solid: true, wall: true }, '.': { floor: true } });
VL.defineArea('scriptorium', { tileset: 'scriptorium' });
VL.addScreens('scriptorium', { '0,0': { tiles, entities } });
```

Link it to the world with a door entity on both sides:
`{ type: 'door', x, y, to: { area, screen, tx, ty, facing } }`. Put the
arrival tile one step off the door so it doesn't fire again on arrival.

### Adding a system

Create `systems/<name>.js`:

```js
VL.tune({ crabSpeed: 40 });            // its numbers live with it, not in config.js
VL.defineSystem('combat', {
  order: 50,                       // lower runs first; movement is 10, default 100
  update(state, actions, dt) {},   // runs every fixed step while the world is live
});
```

Systems read `actions.held.<name>` / `actions.pressed.<name>` (names in
`VL.ACTIONS`), never key codes. Push `{ type, ... }` onto `state.events` for
things the renderer or sound should react to this step; it's cleared each step.

### Adding an entity type

Create `entities/<name>.js` with `VL.defineEntity('chest', { onStand, draw })`.
`onStand(state, entity)` fires once when the hero's feet tile enters the entity's
tile. `state.room.entities` holds fresh copies of the screen's entities for the
current visit: the renderer draws **these** (so mark one `opened`, move it or
remove it from the array and the screen follows); `state.flags` is for permanent
state.

### Adding a scene

Create `scenes/<name>.js`:

```js
VL.defineScene('title', {
  enter(app, data) {},
  update(app, actions, dt) {},
  draw(ctx, app, t) {},
  smokeData(app) { return data; },   // optional: what the render smoke passes to enter
});
```

`app.setScene(id, data)` switches. `VL.START_SCENE` names the first scene; the
title scene sets it to `'title'`. `app.game` is the live game state. The render
smoke enters, updates and draws every registered scene with `app.game` set, and
the browser smoke switches to `'play'` with `app.setScene('play')` on a new game,
so both must keep working whatever the start scene is.

## Art kit

Everything on the canvas is drawn by code through `VL.ART`, in the approved
"modern pixel art" look: dark 1px outlines on characters, a rich fixed
palette, soft drop shadows, a warm light from the top-left and a vignette,
and small animations. Draw with the kit so every item looks like one game.
The `artSheet` scene shows every piece (`VL.app.setScene('artSheet')` in the
console, left/right to page); the browser smoke saves each page as
`art-<n>.png`.

**Palette.** Every colour is a name in `VL.PALETTE` (`art.js`): `outline`,
`ink`, `text`, `textDim`, `gold`, `heart`, `skin`, `hair`, `tunic`, `grass`,
`leaf`, `bush`, `rock`, `sand`, `water`, `foam`, `wood`, `roof`, `shadow`,
and their `Dark`/`Light`/`Alt` shades. Never write a hex value in a draw call:
use `VL.ART.rect(ctx, 'heart', x, y, w, h)` or `VL.ART.color('heart')`. A
region or dungeon that needs new colours adds them from its own file with
`VL.ART.addColors({ mossDark: '#2a4a2a' })` (lower-case `#rrggbb` or
`#rrggbbaa`; a name already taken is an error). The canvas looks the same in
the site's light and dark themes, so the kit never reads the page's CSS.

**Adding a sprite.** Sprites are rows of characters, one per pixel, `.` for
transparent, and a map from characters to palette names:

```js
VL.ART.defineSprite('crab', {
  colors: { r: 'heart', l: 'heartLight', e: 'ink' },
  rows: [
    'r.r..r.r',
    '.rlrrlr.',
    'rrerrerr',
    '.rrrrrr.',
    'r.r..r.r',
  ],
});
VL.ART.defineSprite('crab-right', { mirrorOf: 'crab' });  // left-right flip
VL.ART.drawSprite(ctx, 'crab', x, y);                     // (x, y) = top-left of the rows
```

- **Outline rules.** Characters, creatures and pickups get the automatic
  outline: a 1px `outline` ring on the four sides of every filled pixel (never
  diagonal corners), outside the rows, so don't draw it yourself and leave a
  pixel of room around the sprite. `outline: 'gold'` changes its colour.
  Terrain (trees, bushes, rocks) and HUD icons use `outline: false` and shade
  their own rim with the colour's `Dark` shade.
- Shade with two or three tones of a colour (light top-left, dark bottom-right),
  like the hero and the tree.
- Things standing on the ground get `VL.ART.drawShadow(ctx, centreX, feetY, width)`
  under them, drawn first.
- Sprite ids are global: prefix them by kind (`hero-`, `item-`, `pickup-`,
  `tile-`, `npc-`, `enemy-`). A duplicate id, a row of the wrong width, a
  character with no colour or an unknown palette name throws at load time.
- Characters are about 12×14 (the hero), small creatures 8–10 wide; the feet
  point is the centre of the feet box (`state.player.x/y`), boots ending 3px
  below it. The hero set is `hero-<down|up|left|right>-<0|1|2>` (stand, walk
  A, walk B); `VL.ART.heroFrame(player, t)` picks one.
- Shared sprites so far: `heart-full|half|empty`, `icon-shell`,
  `pickup-shell` (with `VL.ART.drawSparkle`), `chicken`, `item-sword-wood`,
  `item-shield-wood`. An item in a HUD hand slot is drawn with
  `item-<item id>`.

**Tiles.** A tile's look comes from a tile style, picked from its legend entry:
`art: 'name'` names one directly, otherwise the highest-`priority` style whose
`when` flag the entry has (`water`, `sand`, `bush`, ...). A region with its own
tiles adds styles from its own file:

```js
VL.extendTileset('base', { '%': { solid: true, ore: true, art: 'ore' } });
VL.ART.defineTileStyle('ore', {
  under: 'shallow',                                 // ground drawn first
  raised(ctx, cell, t) { VL.ART.drawSprite(ctx, 'tile-ore', cell.x, cell.y + 4); },
});
```

A style has up to three passes, each run for the whole screen before the
next: `ground` (the floor of the tile), `shadow`, then `raised` (anything
tall, which may spill over the tile above). `cell` gives `x, y` (pixels),
`tx, ty`, `info`, `near(dx, dy)` (a neighbour's legend entry, read across
screen edges; `null` off the world) and `seed(i)` (stable noise in 0..1 for
variation). Shores, sand edges and the hut's roof come from `near`, so you
never need corner tiles. Water and shallow tiles animate their ripples and
foam from `t`; keep any other tile animation that subtle. A tile without a
style draws as a red-and-black checker, and the test `every character of
every shipped tileset has a tile style` fails.

**Light.** Each area has a mood drawn over the play area after the hero:
`day` (default), `indoor` or `dark`. Set it once from the area's file with
`VL.ART.setAreaLight('hut', 'indoor')`.

**Text sizes.** All text is a bitmap font drawn with
`VL.ART.text(ctx, str, x, y, { size, color, shadow, align })` ((x, y) is the
top-left, or top-centre/top-right with `align`):

| Size | Glyphs | Line height | Use |
|---|---|---|---|
| `'small'` | 3×5 capitals and digits (lower case drawn as capitals) | 7 | HUD labels, key hints |
| `'normal'` | 5×7 capitals, lower case with descenders | 10 | dialogue, popups, menus |
| `'large'` | `normal` at 2× | 20 | titles |

Over the world, give text `shadow: 'outline'`. `VL.ART.measureText`,
`VL.ART.wrapText(str, width, size)` and `VL.ART.missingGlyphs(str, size)` help
with layout; a content test should check its strings with `missingGlyphs`
(characters the font lacks are drawn as `?`). The font has letters, digits,
`.,!?'":;-+=()/&%*<>`, arrows `←→↑↓`, `♥`, and `␣` (the space bar, small only).

**HUD and popups.** `VL.ART.drawHud` draws hearts (from `hp`/`maxHp`), the
whole-shell count and the main-hand (Space) and off-hand (D) slots. The file
that owns a value plugs in its reader once:
`VL.ART.hudSource('shells', (state) => state.inventory.shells)` (also
`mainHand` and `offHand`, returning an item id). Popups, dialogue and menus use
`VL.ART.drawPopup(ctx, { title, text, at: 'bottom' | 'top' | 'center', prompt }, t)`
or the bare frame `VL.ART.drawBox(ctx, x, y, w, h)`. A popup holds 4 lines;
`VL.ART.popupLayout(...)` reports `overflow` when the text needs more.

## Engine notes

- Logical canvas 256×192: a 16px HUD strip over a 16×11 grid of 16px tiles.
  Play-area pixel coordinates start below the HUD; `render.js` translates.
- The canvas shows every logical pixel as a whole number of **device** pixels
  (`VL.fitScale`), the largest that fits, and refits on a window resize or a
  `devicePixelRatio` change (window moved to another monitor). On a 1× display
  that is the design's whole-number CSS scale (3× = 768×576 on a small laptop).
  On a 2× display it is not always: 1280×800 gives 7 device px per logical px,
  a CSS size of 896×672, i.e. 3.5 CSS px per logical px. That is by design;
  crisp squares of device pixels are the point, not a whole-number CSS size.
- `state.player.x/y` is the centre of the hero's feet box (`TUNING.heroBox`).
- The loop runs fixed `TUNING.step` slices; real time per frame is capped at
  `TUNING.maxFrame` and every update also clamps `dt` to `TUNING.maxDt`. On
  displays faster than the step rate, presses stay latched until a frame that
  runs a step, so no tap is lost.
- Keys clear on window blur, when the tab hides, and when Cmd is released
  (macOS Chrome drops the keyup of other keys while Cmd is held). Modifier
  chords (Cmd/Ctrl/Alt) are left to the browser; Space on the focused theme
  toggle belongs to the toggle (links activate on Enter, so Space still swings
  on a focused header link).

## Testing

```sh
node games/vanishing-library/game.test.js                 # runs every tests/*.test.js
node games/vanishing-library/tests/world.test.js          # or one file
node games/vanishing-library/smoke.js --out <dir>         # headless Chrome, see below
```

`game.test.js` discovers `tests/*.test.js` by directory listing, so a new item
**adds its own `tests/<item>.test.js`** and never edits another item's file.
Each test file starts with
`const { test, loadGame, addFixtureWorld, ... } = require('./harness');`
(`tests/harness.js` holds the runner, the fake DOM and canvas, the vm loader and
the fixture world). The render smoke in `tests/engine.test.js` already covers
every registered scene; a scene whose `enter` needs data exports `smokeData`.

The browser smoke loads `index.html` from `file://` in headless Chrome and
fails on any console error or uncaught exception. At each of two window sizes it
checks the integer scale, that the page does not scroll, switches to the play
scene, holds an arrow towards open ground through real key events and checks
the hero moved, then saves a screenshot. It then walks the hero over the first
open edge of the start area and checks the slide pans the way the hero walked
with the hero on the canvas throughout, and resizes the window without
reloading and checks the scale follows. It runs for 60 s at most. A test file
that runs no tests, and an `async` test function, both fail the node run.
