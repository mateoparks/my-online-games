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
  `VL.extendGame('library', (options) => ({ library: {} }))` for saved
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
VL.defineTileset('scriptorium', { '#': { solid: true, wall: true, art: 'wallInside' }, '.': { floor: true, art: 'floor' } });
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

Create `entities/<name>.js` with `VL.defineEntity('crate', { onStand, draw })`.
`onStand(state, entity)` fires once when the hero's feet tile enters the entity's
tile. `state.room.entities` holds fresh copies of the screen's entities for the
current visit: the renderer draws **these** (so mark one `opened`, move it or
remove it from the array and the screen follows); `state.flags` is for permanent
state. More hooks:

- `solid: true` blocks the hero on its tile (and the playthrough's pathing).
- `onInteract(state, entity)` runs when S is pressed facing its tile (a chest, a
  sign, later an NPC).
- `prepare(state, copy)` runs on each fresh copy as the hero enters the screen:
  set it up from saved state (`copy.opened = …`) or return `false` to leave it
  out of the visit (an ore lump already taken).

A visit can also change tiles: `VL.setRoomTile(state, tx, ty, ch)` (a cut
bush). Pass `state.room` as the last argument of `VL.tileAt`, `VL.isSolidAt`
or `VL.isBlocked` to see the visit's changes and its solid entities; without it
they read the static map. Everything resets when the hero re-enters the screen.

### Adding a scene

Create `scenes/<name>.js`:

```js
VL.defineScene('title', {
  enter(app, data) {},
  update(app, actions, dt) {},
  draw(ctx, app, t) {},
  smokeData(app) { return data; },   // optional: what the render smoke passes to enter
  textEntry: true,                   // optional: typing here; letter shortcuts (N mute) stay off
  soundIndicator: { x: 243, y: 181 }, // optional: where the mute icon goes when the top strip holds text
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
The test `R6: no game file outside art.js draws with raw colours or canvas
text` fails on a hex colour (outside `VL.ART.addColors`), `rgb(`/`hsl(`,
`fillText`/`strokeText` or `ctx.font =` in any file in `manifest.js`.

**Where an item's art goes.** An item's sprites, tile styles and colours live
in its own file (the system, entity, region, dungeon or scene file that uses
them), defined at load time; the `art` section loads first, so the kit is
ready. `art.js` and `art/*.js` belong to the kit: don't add to them, so two
lanes never edit the same art file (a test pins the `art` section's files).
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
- The kit's own shared sprites: `heart-full|half|empty`, `icon-shell`,
  `pickup-shell` (with `VL.ART.drawSparkle`), `chicken`, `item-sword-wood`,
  `item-shield-wood`. For everything defined so far, page through the art
  sheet or run `Object.keys(VL.ART.SPRITES)`. An item in a HUD hand slot is
  drawn with `item-<item id>` (a missing one shows `?`).

**Tiles.** A tile's look comes from a tile style, picked from its legend entry:
`art: 'name'` names one directly, otherwise the highest-`priority` style whose
`when` flag the entry has (`water`, `sand`, `bush`, ...). `when` flags are for
the base set's shared terrain only: **every tile character added after the
base set, in `base` or a new tileset, names its look with `art:`** (the test
`every tile character added after the base set names its look with art`
checks), so a dungeon's `{ solid: true, wall: true }` can't turn into the
hut's roof. Two styles with the same `when` and `priority` throw, and so does
a tile whose flags tie two styles. A region with its own tiles adds styles
from its own file:

```js
VL.extendTileset('base', { '%': { solid: true, ore: true, art: 'ore' } });
VL.ART.defineTileStyle('ore', {
  under: 'shallow',                                 // ground drawn first
  raised(ctx, cell, t) { VL.ART.drawSprite(ctx, 'tile-ore', cell.x, cell.y + 4); },
});
```

Props such as trees, rocks and bushes draw grass under themselves (`under`).
A legend entry's `ground` picks another floor: any style with a ground pass,
matching what is around the prop. `'r': { solid: true, rock: true, art: 'rock',
ground: 'sand' }` is a beach rock; `ground: 'shallow'` stands a rock in the
shallows, and shores and foam then run round it as water. A name that is
unknown, or has no ground pass, throws. The test `every prop in every area
sits on a ground one of its neighbours shares` catches exactly one thing: a
prop no neighbour's ground supports, such as a grass square on the beach or a
sand square in the water. Neighbouring props don't count, and flowers (which
draw their own ground) count as grass floor. One supporting neighbour is
enough, so a grass prop on the top sand row, under the grass, passes as a
one-tile grass tongue into the beach. A tree avenue between two paths, with
trees north and south, is flagged (`grass among path`); give such a tree a
grass tile beside it or `ground: 'path'`.

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
`.,!?'":;-+=()/&%*<>`, arrows `←→↑↓`, `♥` (not small), and `␣` (the space bar).

**HUD and popups.** `VL.ART.drawHud` draws hearts (from `hp`/`maxHp`), the
whole-shell count and the main-hand (Space) and off-hand (D) slots. The file
that owns a value plugs in its reader once:
`VL.ART.hudSource('shells', (state) => state.inventory.shells)` (also
`mainHand` and `offHand`, returning an item id). Popups, dialogue and menus use
`VL.ART.drawPopup(ctx, { title, text, at: 'bottom' | 'top' | 'center', prompt }, t)`
or the bare frame `VL.ART.drawBox(ctx, x, y, w, h)`. A popup holds 4 lines;
`VL.ART.popupLayout(...)` reports `overflow` when the text needs more.

## Sound

`systems/sound.js` synthesizes every effect with WebAudio; there are no audio
files. Play one by name from anywhere: `VL.sfx('swing')`. It returns whether
the sound started and never throws for missing audio (node, old browsers, a
blocked context, mute); an unknown name does throw, so a typo fails the tests.

- **Starter set:** `step`, `bump`, `swing`, `hit`, `hurt`, `pickup`, `shell`,
  `door`, `popup`, `menuMove`, `menuSelect`, `faint`, `cluck`.
- **New effects** go in the file that uses them:
  `VL.defineSfx('splash', [{ wave: 'noise', dur: 0.2, vol: 0.4, filter: { type: 'lowpass', freq: 1200, to: 300 } }], { gap: 0.1 })`.
  A voice is `{ wave: sine|square|triangle|sawtooth|noise, freq, to, at, dur, vol, attack, filter }`
  (seconds, Hz; `to` slides the pitch or filter). Keep `vol` at 0.5 or less
  for square and unfiltered noise; band-passed noise loses most of its energy,
  so `swing` needs `vol: 1` to sit level with `bump` and `hit`. A test keeps
  the voices that sound together under half scale after the master volume
  (`VL.TUNING.soundVolume`, behind a limiter). `gap` stops the same effect
  stacking (default 0.04 s).
- **Game logic stays silent where it can:** push an event and map it once,
  `VL.SOUND.onEvent('chestOpened', 'pickup')` or
  `VL.SOUND.onEvent('coin', (event) => (event.whole ? 'shell' : null))`.
  Doors and walking into a wall (`bump`, once per push) are wired already.
  Menus and scenes call `VL.sfx('menuMove')` directly.
- **Autoplay:** the AudioContext is created on the first key press, click or
  touch (browsers block audio before a gesture), so nothing plays on the title
  screen until the player presses something. A touch unlocks on its `touchend`
  or `pointerup`, not on `pointerdown`.
- **Mute:** N, on every scene, saved as `vanishing-library-muted` (`'1'`/`'0'`).
  A crossed-out speaker sits in the HUD while muted, and a note shows for
  1.5 s after each toggle, in the HUD gap so it never covers the play field. A
  scene whose top strip holds text (the title) sets `soundIndicator: { x, y }`
  and the icon and note sit there instead. A scene that types text (name
  entry) sets `textEntry: true` on its scene object so N stays a letter there.
- **Touch (future lesson):** an on-screen mute button calls the public
  `VL.SOUND.toggleMute()` from a `touchend` or `click` handler (a `touchstart`
  is not a gesture, so the unmute confirmation would be dropped). The sprites
  `icon-sound` and `icon-sound-off` are ready for its two states.

## Core loop (W5)

What the hero carries, the hands, popups, bushes and pickups. `items.js`
(core) holds the registries; `systems/hands.js`, `systems/foliage.js`,
`entities/{chest,sign,pickups,ore}.js` and `scenes/{popup,equipment}.js` use them.

- **Saved state:** `state.inventory` counts the resources (`wood`, `shells`
  (whole shells, the money), `brokenShells`, `berries`, `ore`);
  `state.items` maps owned item ids to `true`; `state.hands` is
  `{ mainHand, offHand }` (item ids or null); `state.popups` is
  `{ seen, queue }`. Fixture: `tests/fixtures/save-v1-W5.json`.
- **Resources:** `VL.addResource(state, 'wood', 1)` (a negative amount
  spends; it never goes below 0) earns, so the game saves.
- **Items:** `VL.defineItem(id, { name, icon, about, popup, use(state, hand),
  hold(state, hand), count(state), sword, prefers })` from the item's own file;
  `icon` names the `item-<icon>` sprite the HUD and the equipment screen draw.
  `VL.giveItem(state, id)` owns it, puts it in an empty hand (the main hand
  first; `prefers: 'offHand'` for a shield), queues its popup and earns.
  `VL.hasItem`, `VL.setHand(state, hand, id)` (choosing the held item again
  empties the hand) and `VL.equipmentItems(state)` do the rest. An item with
  `count` (berries) is owned while the count is above 0. Two-handed items
  (the shovel) are still to come (W10).
- **Hands (`systems/hands.js`):** Space uses the main-hand item and D the
  off-hand one; `hold` runs every step the key is held (the shield sets
  `state.player.shield`). S calls `VL.interact`: an entity's `onInteract` on
  the tile in front (`VL.facingTile(state)`), else a berry bush, else a bare-hand
  pull when no sword is in the main hand. Space with an empty main hand pulls
  too. A sword swing (`VL.swing`) sets `state.player.swing` for
  `TUNING.swingSeconds` and pushes `{ type: 'swing', item, hand, tiles }`; it
  cuts the bushes on those tiles, so combat (W6) reads the same event.
- **Bushes (`systems/foliage.js`):** a `cuttable` tile is cut for the visit
  by `VL.cutBush(state, tx, ty, 'sword' | 'hands')`; it becomes the legend's
  `cutTo` character (default grass `.`, so a bush on sand says `cutTo: 's'`).
  One roll per bush, `TUNING.bushDrops` (heart 2%, whole shell 5%, wood 20%,
  exclusive bands), puts a `drop` entity on the tile that fades after
  `TUNING.dropSeconds`. A bare-hand pull costs `TUNING.pullCost` half hearts,
  and a pull on the last half heart faints the hero (`shrub`). Berry bushes
  (`berry: true`) are picked with S (`TUNING.berriesPerPick`), show bare (`u`)
  until the hero comes back, and a sword only bounces off them. Eating a berry
  (`VL.eatBerry`, a berry in a hand or S on the equipment screen) heals
  `TUNING.berryHeal` half hearts and never past full.
- **Pickups:** walking over a `drop`, a `shell` (`{ type: 'shell', x, y }` is a
  broken shell that washes up on every visit; `whole: true, id` is a whole
  shell found once) or an `ore` lump (`id`, found once) collects it. One-time
  finds are saved as `state.flags['found:<id>']`, the same flag W8's
  `VL.markFound` sets. A `chest` (`{ type: 'chest', id, contents: [{ item } |
  { resource, amount }] }`) and a `sign` (`{ type: 'sign', text, title }`) are
  solid and answer S.
- **Popups:** `VL.definePopup(id, { title, text })` (`{name}` is the hero's
  name) and `VL.showPopup(state, id)` queue a once-only explanation; the play
  scene opens the `popup` scene over the paused world, and closing it marks it
  seen (both saved, so a reload never loses or repeats one).
  `VL.showMessage(state, { title, text })` shows words every time and is never
  saved (signs). The controls popup is queued as the intro hands over to play.
  Keep a popup to 4 lines: a test checks every popup and sign.
- **Equipment screen (`'equipment'`, E):** arrows choose, Space or D puts the
  item in that hand, S uses it (eats a berry), E or Esc goes back.
- **Drawing with the hero:** `VL.defineHeroLayer(id, (ctx, state, x, y, t,
  pass) => {})` draws with the hero, once behind (`pass === 'behind'`) and once
  in front; the swing and the raised shield are the `hands` layer.
- **Sounds:** events `swing`, `pickup` (`kind`; shells chime), `bushCut`
  (`rustle`), `pullHurt` (`hurt`), `tink` (a sword on a berry bush) and `eat`
  (`munch`).
- **Locks claimed:** `chestGear` (the hut chest, `found:hutChest`),
  `oreShallows`, `berryBush` (a screen with a berry bush visited), `berries`,
  `bushBareHands`, `bushCut`, `beachBrokenShells`.

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

## Scenes and menus

`VL.START_SCENE` is `'title'` (`scenes/title.js`). A new player goes title
(three slots) → `name` (typed into a field on the canvas, 12 characters,
"Hero" when left blank) → `intro` (the three weathered lines; S, Space or
Enter skips after half a second) → `play`. From play, Esc opens `pause`
(Resume, Save & Quit, the controls); hearts running out opens `fainted`,
where a press respawns the hero; `conflict` (another window saved this slot)
sends the player back to the title. One file per scene, each drawing through
the art kit, and the render smoke in `tests/engine.test.js` covers every one.

- Menus accept Enter, S or Space: `VL.confirmed(actions)`. Enter is the
  `confirm` action, Backspace and Delete are `erase`. A scene that wants a
  press to do nothing in the world just does not call `VL.updateWorld`
  that step, so a confirm never leaks into play.
- `actions.typed` is the text typed since the last poll (`'\b'` for
  Backspace, key repeat kept); only the name scene reads it. Game letters
  (S, E, D…) are typed there like any other.
- `app.game` is the live game, `app.slot` its slot (`null` for a game no
  slot holds, as in tests and the smoke), `app.storage` the wrapped store,
  `app.save()` writes the game to its slot (true when written), `app.quit()`
  returns to the title, `app.startGame(game, slot)` sets both. After every
  scene's `update`, the app saves a dirty game, so no scene needs to.

## Saving

- **Keys:** `vanishing-library-slot-1`, `-2`, `-3` hold one JSON save each;
  `vanishing-library-probe` is written, read and removed once at boot to see
  whether storage works. `VL.createStorage(backing)` wraps `localStorage`
  (or a function returning it, since the getter itself can throw) and never
  throws. With `storage.ok` false, the title and pause menus say
  "Saving is off in this browser" and everything still plays.
- **What is saved:** every field of the game state except
  `VL.TRANSIENT_FIELDS` (`time`, `player`, `room`, `transition`, `events`,
  `dirty`, `fainted`, plus anything added with
  `VL.extendGame('enemies', () => ({ knockback: null }), { transient: true })`)
  and `hp`. Loading gives full hearts at the last save point (`savePoint`, or
  the start when there is none or a later map change removed its screen).
  `finished` marks a finished game: the slot shows FINISHED and loads the
  last save before the finale (the ending sets it).
- **When (design: Option B, Zelda-style):** call `VL.earned(state)` after
  anything the player earns (an item, a chest opened, a book, a page, a flag,
  a boss) and the app saves at the end of that step, in whatever scene (a
  shop, a dialogue, the equipment screen), with a "SAVED" flash in play.
  Standing on a save point saves too (`{ type: 'savePoint', x, y }`
  entity, a lantern, or `VL.touchSavePoint(state, place)` from your own
  entity). Save & Quit saves; a new game is saved as soon as it is named.
  Dying never saves or loses anything: `VL.faint(state, cause)` → the
  `fainted` scene → `VL.respawn(state)`. `VL.addFaintLine('crab', '…')` adds
  the line for a cause (`shrub` is already there).
- **When a write fails** (the browser ran out of space after boot), the game
  stays dirty and every step retries; play shows "COULD NOT SAVE" and Save &
  Quit stays on the pause menu with the note until a write succeeds
  (`app.saveFailed`); pressing Save & Quit again asks "Quit without
  saving?" (No first), so a kid is never stuck. **Two windows on one slot:** the app remembers the
  slot's text as it last read or wrote it (a new game's baseline is "empty"),
  and a write that finds a different save there refuses, so the newer
  progress is never overwritten; the stale window goes to the `conflict`
  scene and back to the title, and Yes in the delete dialog deletes only the
  save the card showed. A slot that is gone (site data cleared) is simply
  written again; a read that throws counts as a failed write.
- **Schema (R2):** saves carry `v`, `VL.saveVersion()`. **Adding a field
  needs no migration.** Add it from your own file with
  `VL.extendGame('library', () => ({ library: { returned: 0 } }))` and a save
  written before it gets the default on load, nested keys included (a
  `library.read` added later fills in as 0). A saved value whose kind no
  longer matches its default (an object or array on either side) takes the
  default too, and `VL.readSlot(...).resets` lists those paths so the fixture
  test can fail instead of a player losing progress; play state in an old
  save (a field that is transient now) is dropped. Keep fields JSON-safe:
  plain objects, arrays, numbers, strings, booleans, null (never `undefined`,
  a Set, a Map or a Date; `tests/saving.test.js` checks a new game and the
  playthrough's final state). A default applies only to saves that lack the
  field: changing `TUNING.startMaxHp` leaves existing players at their saved
  `maxHp`; changing an existing player's value needs a migration.
  **Changing the shape** of a saved field (a rename, a split, a type change)
  needs a migration, from the file that makes the change:
  `VL.defineMigration(2, (save) => ({ ...save, flags: renamed(save.flags) }))`.
  Versions are sequential (the next one is `VL.saveVersion() + 1`), so two
  lanes picking the same number throw at load and one renumbers. A save goes
  through every migration after its own version **before defaults are
  filled**, so a migration sees the save as it was written: a field added
  after that save may be missing, so read it with `?? default`. A save newer
  than the game (a cached old page next to a newer one) shows as "Saved by a
  newer game: reload the page" and is left exactly as it is, never deletable;
  one that fails validation shows as **Damaged** and can be deleted (with a
  confirm). **Fixtures:** `tests/fixtures/save-v1.json` is the W2-era
  version 1 save, frozen forever; **every item that adds or changes a saved
  field** commits its own `save-v<N>-<item>.json`, written by the game at
  that version with the new field holding a non-default value, and never
  edits an older one. Every `save-*.json` must load through the real
  migrations with no field reset (a test checks each, and a fixture at the
  current version must come back field for field), so a later item that
  changes a field's kind without a migration fails at its own build rather
  than resetting a student's progress.
- The slot card shows name, hearts and books; the book count comes from
  `VL.slotSource('books', (save) => …)`, plugged in once by the library item.
- `VL.reloadApp(app)` is a page reload that continues the same slot: what the
  playthrough's `drive.reload()` uses to prove progress survives. Like a real
  reload it does not save first (so a forgotten `VL.earned` shows up);
  `VL.reloadApp(app, { save: true })` is the console shortcut.

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
reloading and checks the scale follows. Then it plays the real start with key
events: title → Enter on an empty slot → "Robin" typed → Enter → the intro →
S → the controls popup → S → play, with the slot saved; Esc, Save & Quit back
to the title; a reload that still lists Robin, a muted title (N, then N again)
and a continue at full hearts (screenshots `title.png`, `name.png`,
`intro.png`, `controls-popup.png`, `pause.png`, `title-saved.png`,
`title-muted.png`). Then the core loop with real keys: S at the hut chest (the
sword and shield land in the hands), E for the equipment screen, Space on a
bush (it must be cut) and S at a berry bush (`w5-hut.png`,
`w5-chest-popup.png`, `w5-equipment.png`, `w5-bush-cut.png`,
`w5-bush-after.png`, `w5-berry-bush.png`, `w5-berries-picked.png`). It runs
for 60 s at most. A test file
that runs no tests, and an `async` test function, both fail the node run.

## Progression: locks, keys, the solver and the playthrough

`progression.js` holds the one table of everything that gates progress
(`VL.LOCKS`) and `milestones.js` seeds it with the whole game's path from the
design doc, every entry citing the design-doc section it comes from. A lock is
registered with `VL.defineLock(id, rule)` **from the file that implements it**;
`milestones.js` already has a *planned* entry (`by: 'W14'`) for each one, and an
item claims it by defining the same id with a `reached` predicate. Defining an
id that is already implemented throws, so two lanes cannot clash. The claim
keeps the planned rule, so the idiom is to spread it:

```js
VL.defineLock('woodSword', { ...VL.LOCKS.woodSword, reached: (state) => Boolean(state.inventory.woodSword) });
```

Field reference (not a copyable claim: this rule differs from the plan on
purpose, and `reached`, `by` and `replan` never appear together):

```js
VL.defineLock('liftingGloves', {
  type: 'item',                       // place | item | flag | event
  needs: ['scriptoriumEntered', ['woodSword', 'metalSword']],  // keys; an inner array is any-of
  gives: ['heartD1'],                 // extra keys besides the id
  supplies: { ore: 1 },               // counters; `count: { pages: 5 }` requires one, `consumes: { ore: 1 }` spends one
                                      // (a counter is counted or consumed, never both)
  renewable: true,                    // can be obtained again (bushes, shops, forging); default: one time
  optional: true,                     // not needed for the ending (rewards, heart containers)
  loses: [...], retires: [...],       // events only: keys taken; `loses` must be regainable, `retires` is for good
  doc: '§ The path through the game, 2',
  reached: (state) => Boolean(state.flags.gloves),   // implemented locks; planned ones give `by: 'W14'` instead
  place: { area: 'scriptorium', screen: '0,0' },     // implemented places: the test checks the screen exists
  replan: 'the gloves are sold too',  // only when the claim's rule differs from the plan (see below)
});
```

Rules of the table:

- **A claim keeps the planned rule.** The whole path was solved against the
  plan, and a *loosened* claim (dropping a key from `needs`) is a sequence
  break the solver cannot see, so `defineLock` throws when a claim's `type`,
  `needs`, `gives`, `supplies`, `count`, `consumes`, `loses`, `retires`,
  `renewable` or `optional` differ from the plan, unless the claim carries
  `replan: '<why>'`. Every deviation then shows in the claiming item's diff.
- **Anything that cannot be undone is an `event`** with `retires` (a room that
  seals after its boss, a one-way drop, a thief emptying a shelf). A flag
  cannot express "the things in here are gone now", so the solver would never
  see what the player left behind.
- **Resources** (`VL.defineResources([...])`; today wood, shells, broken
  shells, paper, ink and berries) are keys that are *spent* by what uses them.
  Only a **renewable** lock counts as giving one; a one-time gift (the helper's
  couple of wood after the shockwave) is a top-up the worst-case player has
  already spent. A resource with no renewable source fails the table.
- **A placeholder that stands for several finds** (`hiddenBooks`, 10 generic
  books) is split from the item's own file with
  `VL.splitLock('hiddenBooks', { bookUnderRock: {...}, ... })`, which removes
  the placeholder and defines the parts; their `supplies` must add up to the
  placeholder's, so the 5/10/15 book rewards keep adding up. A split only
  shares out counters: the placeholder must supply one, the parts may not give
  the placeholder's id or `gives` or supply a counter it did not, and the split
  id can never be defined again (a looser single lock is a claim with
  `replan`). No edit to `milestones.js` is needed. (Moving an implemented
  placeholder such as the hut is a one-line edit there.)
- **Milestones** (`VL.defineMilestones(ids, { skippable })`) are the story
  order, fixed in `milestones.js`; adding a beat is an edit there. Each beat
  gates the next: the solver fails when a beat is reachable without the one
  before it, unless that one is listed as `skippable`, in which case the
  nearest earlier beat that is not skippable gates it instead (today: the
  chest, and the raft/island/shipwreck/lighthouse, which come in any order
  after the shockwave).

`VL.progress(state)` lists the locks a live game has reached (hints can pick
from it).

**The solver**, `VL.solveProgression(locks?, milestones?, { resources, skippable }?)`,
runs in `tests/progression.test.js` over the whole table, planned entries
included, so the full path is checked from day one. It computes everything
obtainable, then applies each event (`shockwave`, `primerTaken`) as a new
stage from the **worst-case player**: one holding only the *possessions* the
event cannot be reached without (plus what the event gives, minus what it
takes). Possessions are items, flags, events and what they gave; **access is
never carried**: places, repeatable (renewable) actions and resources are
worked out again from what the player holds, so a door opened by gear the
event takes is shut again. A one-time source the player must have collected
(forced, or it gave something now lost) is used up and the rest of what it gave
is kept; any other one-time source is "not yet collected". A `retires` key is
gone for good: every source of it, renewable or not, is disabled, and one the
player was not forced to collect is simply gone. When more than one event is
available at once, **every order** is walked (`report.orders`); the story order
is the one `report.stages` describes, and a problem found on another order names
it (`… unreachable after thief`, `after b then c, sword cannot be regained`).
It fails the run when a lock is unreachable (the message names what is missing
in the stage that comes closest), a required lock is not reachable at the end
of some order unless the player was forced to reach it before an event on that
order (so a dungeon that seals after its boss is fine, a compass left in it is
not), something an event `loses` cannot be regained in the stage after it, a
counter cannot cover what was lost (ore for metal gear) or its total demand
(each loss costs it again), a required lock that **spends** a counter is
unaffordable once the player has spent that counter on everything else
reachable first (the small-key softlock: the only key used on the door that
doesn't hide the next one), a counter is both counted and consumed or is
supplied by a place or a renewable lock, an optional renewable lock consumes a
counter, a key or counter is unknown, a claim differs from its plan, or the
milestone order disagrees with the stages or hides a sequence break. Optional
locks that an event cuts off are listed as `missable` (today: the Primer book
and the drawn world map after Dungeon 3). Hearts and health are not modelled
(dying keeps everything, so bare-hand bush pulls never softlock). Deliberately
broken tables in the test show each failure.

Known limits (each pinned by a test in `tests/progression.test.js`):

- A required **renewable lock that consumes a counter** (re-forging metal gear)
  is assumed to spend it once per stage. The game must not let it repeat while
  the player still has the item: the smith re-forges only gear that was lost.
- A loss is checked for regain **in the stage right after the event, on every
  order**, never by going on to a later event first.
- Problems for a table with a cycle are listed in table order, each naming its
  unmet needs; in a cycle there is no single root cause.

**The playthrough harness**, `tests/playthrough.js`, drives the real game
(`app.update` with Actions, one step at a time) from a new game through the
milestones in order and checks each milestone's `reached`. Steps are data: an
item adds `tests/steps/<item>.steps.js` exporting
`(step) => { step('chestGear', (drive) => { ... }); }`, one step per milestone it
implements. `drive.walkTo({ area, screen, tx, ty })` paths through open tiles,
screen edges and doors with real held directions; `drive.press(action)`,
`drive.hold(actions, seconds)`, `drive.until(pred, maxSeconds, held)` and
`drive.state`/`drive.app` do the rest (a popup scene that swallows input shows
up as a `not reached` error naming the scene; `drive.closePopups()` reads and
closes every waiting popup with S). `drive.reload()` stands for the
player reloading the page: it swaps in the app returned by the `reload(app)`
hook given to `createPlaythrough` (or `VL.reloadApp`), which W2 supplies once
saving exists (fresh `createApp`, load; no save first, like a real reload);
until then it throws. **`playTo` reloads after every milestone's step** and
checks `reached` again, so progress that was never earned (`VL.earned`) fails
there: progress survives reloading the page at any point. The default app is
therefore a new game saved in slot 1 of an in-memory store (`slotApp`); the app
itself is also injectable (`createPlaythrough(VL, { app })`), so the title
screen and name entry can be driven from there, and an app without a save slot
fails `playTo` with a message. The test drives to the last
milestone that has steps; the first milestone without steps must be planned,
not implemented, so an item that implements a beat also scripts it.
