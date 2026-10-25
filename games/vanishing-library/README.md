# The Vanishing Library

A top-down pixel-art adventure for Arcade Current. Static files only: open
`index.html` from disk or any static server. The design record lives outside
the repo (`docs/vanishing-library-design.md` is git-ignored, local only).

## Controls

Keyboard only for now (laptop or desktop).

| Key | What it does |
|---|---|
| Arrow keys | Walk |
| S | Pick up, talk, read, open chests, pick berries, throw what you carry |
| Space | Use the item in your main hand (a sword, the slingshot, ...) |
| D | Use the item in your off hand (a shield, ...) |
| E | Equipment: choose what goes in each hand |
| X | Dig with your shovel, whatever your hands hold (once you have a shovel) |
| M | The map, once you have one (the world map, or a dungeon's map) |
| N | Sound on or off |
| Esc | Pause, or Save & Quit |
| Enter | Confirm a name or a menu choice (in menus, Space and S work too) |
| Backspace | Delete a letter, or a saved game on the title screen |

Two-handed tools work with Space or D; X digs with the best shovel you own without changing what your hands hold. The first time you play, a popup
teaches the arrows, S, E and Esc; Esc lists every key you can use so far. Some
friends in the world may teach you a trick or two of their own.

## Layout

Every script is a classic `<script>` that attaches to the global `VL`.
`manifest.js` is the **one list** of game files: `index.html` loads them in
that order and `game.test.js` loads the same list into `node:vm`. Sections load
top to bottom:

| Section | What lives there | Registers with |
|---|---|---|
| `core` | `config.js` (`VL.TUNING`), `util.js` (Actions, RNG), `tiles.js`, `world.js` (areas, screens, collision), `spots.js` (spots, regions), `state.js`, `engine.js` (system pipeline, `enterScreen`), `app.js` (scenes), `screen.js` (integer scaling), `loop.js` (fixed step) | - |
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
  file may use. One more: `regions/library.js` stays after `regions/finds.js`,
  whose book locks it claims (it throws on load otherwise). The test
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
  `tests/load-names.test.js` also scans every manifest file for
  `VL.define<Kind>('name'` and `VL.ART.define<Kind>('name'` (an enemy counts
  as an entity) and names both files when two define the same
  name, so pick names that say whose they are (`henSquawk`, not `squawk`).
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
  sign, later an NPC). An optional `takesS(state, entity)` returning false
  leaves the press to whatever else is in front (an open door; `VL.takesS`).
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
  A, walk B); `VL.ART.heroFrame(player, t)` picks one. `player.lift` (pixels)
  draws the hero that far up in the air with the shadow left on the ground.
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
matching what is around the prop. `'t': { solid: true, tree: true, art: 'tree',
ground: 'sand' }` is a tree on the beach; `ground: 'shallow'` stands a prop in
the shallows, and shores and foam then run round it as water. A name that is
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
`.,!?'":;-+=()/&%*<>`, arrows `←→↑↓`, `♥` (not small), `␣` (the space bar),
and accented letters for names: `á à â ä ã å æ é è ê ë í ì î ï ó ò ô ö õ ø ú ù
û ü ý ÿ ñ ç`, their capitals, and `¡ ¿`. A glyph may be `{ rows, rise }`: its
first `rise` rows sit above the cell, so an accent on a capital uses the line
gap above (lower case rises 1px, capitals 2-3px). Name entry takes any character the
font has, so a new glyph is typeable at once.

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
  Menus and scenes call `VL.sfx('menuMove')` directly. Events only sound when
  pushed inside a world update: anything given at the end of a talk or a
  reading (`endTalk`, `finishReading`) is cleared by the next update unplayed,
  so play its sound directly (the hold-up does).
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
  (whole shells, the money), `brokenShells`, `berries`, `ore`, `paper`, `ink`);
  `state.items` maps owned item ids to `true`; `state.hands` is
  `{ mainHand, offHand }` (item ids or null); `state.popups` is
  `{ seen, queue }`. Fixture: `tests/fixtures/save-v1-W5.json`. **Saved ids
  must never break a load:** a popup id no definition has any more is skipped
  (`VL.currentPopup` drops it), an item id no `defineItem` has is not owned,
  and a hand naming one counts as empty. Renaming or removing a popup or item
  is safe; keep that true for any id list you save.
- **Resources:** `VL.addResource(state, 'wood', 1)` (a negative amount
  spends; it never goes below 0) earns, so the game saves, and empties a hand
  holding what ran out (`VL.tidyHands`).
- **Items:** `VL.defineItem(id, { name, icon, about, popup, use(state, hand),
  hold(state, hand), count(state), sword, prefers })` from the item's own file;
  `icon` names the `item-<icon>` sprite the HUD and the equipment screen draw.
  `VL.giveItem(state, id)` owns it, puts it in an empty hand (the main hand
  first; `prefers: 'offHand'` for a shield), queues its popup and earns.
  `VL.hasItem`, `VL.setHand(state, hand, id)` (choosing the held item again
  empties the hand) and `VL.equipmentItems(state)` do the rest. **Read a hand
  with `VL.heldItem(state, hand)`**, never `state.hands` directly: it is the
  saved id only while the hero still has that item, so berries sold (W10) or
  an item taken away (W16) can never be shown or used from a hand. Anything
  that takes an item away calls `VL.tidyHands(state)` to clear the saved hand too. An item with
  `count` (berries) is owned while the count is above 0. A `twoHanded` item
  (the shovels) fills both hands, so Space and D both use it; putting anything
  in either hand frees both, and `giveItem` equips it only when both are empty.
- **Hands (`systems/hands.js`):** Space uses the main-hand item and D the
  off-hand one; `hold` runs every step the key is held (the shield sets
  `state.player.shield`). S calls `VL.interact`: tile by tile over the tiles the hero faces
  (`VL.facingTiles(state)`: straight ahead first, then the ones half
  overlapped), an entity's `onInteract` or a berry bush there, else a bare-hand pull of
  one bush when no sword is in the main hand. Space with an empty main hand
  pulls too. Entities match by integer tile (`e.x/e.y`). A sword swing (`VL.swing`) sets `state.player.swing` for
  `TUNING.swingSeconds` and pushes `{ type: 'swing', item, hand, tiles }`; it
  cuts the bushes on those tiles. Enemies are hit by the blade's reach box
  instead (see Combat).
- **Bushes (`systems/foliage.js`):** a `cuttable` tile is cut for the visit
  by `VL.cutBush(state, tx, ty, 'sword' | 'hands')`; it becomes the legend's
  `cutTo` character (default grass `.`, so a bush on sand says `cutTo: 's'`).
  One roll per bush, `TUNING.bushDrops` (heart 2%, whole shell 5%, wood 50% since W29,
  exclusive bands), puts a `drop` entity on the tile that fades after
  `TUNING.dropSeconds` (a heart drop heals `TUNING.heartDropHeal` half hearts;
  enemy drops reuse the `drop` entity). A bare-hand pull costs `TUNING.pullCost` half hearts,
  and a pull on the last half heart faints the hero (`shrub`). Berry bushes
  (`berry: true`) are picked with S (`TUNING.berriesPerPick`), show bare (`u`,
  or the legend's `pickedTo`: `Q`→`U` on the Woods moss, `K`→`L` on scree)
  until the hero comes back. There are three (W29): by the hut from the
  start, in the Hollow Oak's clearing (the Woods, so after Dungeon 1's
  mortar makes the ink for the map) and on the first highland shelf (after
  Dungeon 3's page completes the Climber's Almanac), and a sword only bounces off them. Eating a berry
  (`VL.eatBerry`, a berry in a hand or S on the equipment screen) heals
  `TUNING.berryHeal` half hearts and never past full.
- **Pickups:** walking over a `drop`, a `shell` (`{ type: 'shell', x, y }` is a
  broken shell that washes up on every visit; `whole: true, id` is a whole
  shell found once) or an `ore` lump (`id`, found once; `wet` draws water at
  its foot) collects it. `entities/ore.js` fills the `oreShallows` and
  `oreWoods` spots with `VL.fillSpot`. One-time finds are saved as
  `state.flags['found:<id>']` (`VL.markFound`/`VL.spotFound`). A `chest` (`{ type: 'chest', id, contents: [{ item } |
  { resource, amount }] }`) and a `sign` (`{ type: 'sign', text, title }`) are
  solid and answer S.
- **Popups:** `VL.definePopup(id, { title, text })` (`{name}` is the hero's
  name) and `VL.showPopup(state, id)` queue a once-only explanation; the play
  scene opens the `popup` scene over the paused world, and closing it marks it
  seen (both saved, so a reload never loses or repeats one).
  `VL.showMessage(state, { title, text })` shows words every time and is never
  saved (signs). The controls popup is queued as the intro hands over to play.
  Keep a popup to 4 lines: a test checks every popup and sign.
- **Hold it up (W28, `systems/hold-up.js`):** whatever a person hands the
  hero or a chest gives him, he lifts over his head facing the player
  (`hero-hold`) for `TUNING.holdUpSeconds` with the `holdUpJingle`, the world
  waiting, and only then does the popup name it; he keeps holding it while
  the popup is up. Every handover calls **`VL.holdUp(state, sprite, { sound, quiet })`**
  (`VL.itemSprite(id)` for an item's HUD sprite; several calls in one go are
  held up side by side, like the hut chest's sword and shield, and heard
  once). `VL.holdUp` plays the sound itself (`holdUpJingle` by default; heart
  containers and big chests pass `sound: 'fanfare'`; `quiet` plays nothing),
  because a reward given at the end of a talk or a reading happens outside a
  world update, and an event pushed there is cleared unplayed. Today: chests, big chests, heart containers, the librarian's
  rewards and the Scriptorium key, the Bookworm's mortar and books, Pip's
  page. Shop and smithy purchases do not hold up. `state.holdUp` is play
  state; `VL.tickHoldUp` is the play scene's clock, and a test that drives
  the app waits it out before closing popups.
- **Equipment screen (`'equipment'`, E):** arrows choose, Space or D puts the
  item in that hand, S uses it (eats a berry), E or Esc goes back. The grid
  shows 4×2 items and scrolls a row at a time (arrows at its side show more
  above or below), so any number of items fits.
- **Drawing with the hero:** `VL.defineHeroLayer(id, (ctx, state, x, y, t,
  pass) => {})` draws with the hero, once behind (`pass === 'behind'`), once
  in front (`'front'`) and once more after the light (`'overlay'`, outside
  the hurt-flash gate: the dungeon keys HUD); the swing and the raised
  shield are the `hands` layer.
- **Sounds:** events `swing`, `pickup` (`kind`; shells chime), `bushCut`
  (`rustle`), `pullHurt` (`hurt`), `tink` (a sword on a berry bush) and `eat`
  (`munch`). `systems/sound.js` maps the core `faint` event to `faint`.
- **Locks claimed:** `chestGear` (the hut chest, `found:hutChest`),
  `oreShallows`, `berryBush` (a screen with a berry bush visited), `berries`,
  `bushBareHands`, `bushCut`, `beachBrokenShells`.

## Combat (W6)

`systems/combat.js` runs after the hands (order 30): the sword hits enemies,
enemies and seeds hurt the hero, the shield turns them away, and anything
that hurts knocks back. Enemy types live one per file in `entities/`
(`crab`, `slime`, `bat`, `spitter`, `gull`); `entities/heart-container.js`
holds the heart containers.

- **Tiers are data:** `TUNING.swordDamage` (`woodSword` 1, `metalSword` 2)
  and `TUNING.shieldBlocks` (`woodShield` blocks `small`, `metalShield`
  `small` and `big`). The metal items are defined here (sprites, popups);
  W10's smith only gives them. A new shield (the Mirror Shield, W19) adds its
  line, e.g. `fire`.
- **Hurting the hero:** `VL.hurtHero(state, { damage, size, from, cause })`
  (half hearts; `from` is a point, `cause` the faint line's id) returns
  `'blocked'`, `'hurt'` or `'ignored'`. A hit sets `player.invuln` and
  `player.flash` (`TUNING.invulnSeconds`; `render.js` skips the hero on
  alternate frames while `flash` runs) and `player.knockback`, which moves
  the hero for `TUNING.knockbackSeconds` with the arrows ignored
  (`systems/movement.js`), stopping at walls and never crossing a screen
  edge. A knockback belongs to its room, so a door or respawn mid-push ends
  it. Hearts running out calls `VL.faint(state, cause)` and clears knockback,
  invulnerability and flashing, so the hero wakes steady.
- **The shield** blocks when a hand holding a shield has its key held
  (`player.shieldItem`, worked out each step), the hit comes from the side the
  hero faces, and the shield's list has the hit's `size`. A block shoves the
  hero a little, bounces the enemy, sparks and plays `clank`; no damage, no
  invulnerability.
- **One approach, one hit:** an enemy that hurts the hero, or is blocked, is
  `calm` for `TUNING.enemyCalmSeconds` (2.5 s, well past the 1.2 s of
  invulnerability): harmless, and each type backs off while `e.calm > 0`
  (a crab scuttles away, a slime hops away, a bat flies off, a gull climbs, a
  spitter holds its fire). A seed calms its `owner`. A new enemy type reads
  `e.calm` in its `think` the same way. `VL.enemyHarmful(e)` says whether
  touching it hurts right now.
- **Arriving:** enemies on a screen the hero walks onto hold still and are
  harmless for `TUNING.enemyArrivalSeconds` (0.6 s); one spawned with
  `VL.spawnEnemy` starts at once. A test walks onto every open entry of every
  enemy screen and stands still for 1.5 s unhurt, so place new enemies far
  enough in.
- **After a popup or a talk:** closing one back to play gives the hero
  `TUNING.popupGraceSeconds` (0.8 s) of `invuln` without the hurt flash
  (`VL.graceAfterPopup`), since the world froze mid-attack under it.
- **Enemies:** `VL.defineEnemy(type, { tuning, body: { w, h }, size, flies,
  rooted, faint, drops?, setup(state, e), think(state, e, dt), harmful(e),
  onHit, onTouch, draw(ctx, e, cx, cy, t) })` also defines the entity type,
  so a region places one with `{ type: 'crab', x, y }` (tiles). `tuning`
  names a `VL.TUNING` entry whose `hp` and `damage` are read live. A live
  enemy keeps its body centre in pixels (`e.cx`, `e.cy`); move it with
  `VL.moveEnemy(state, e, dx, dy)` (walkers stop at solid tiles, fliers cross
  them, and nothing leaves the screen) and aim with `VL.toHero(state, e)`.
  Enemies are never solid, so none can wall off a path. They live in the
  visit's room, so they come back at full strength on re-entry and never
  follow the hero to another screen. `VL.spawnEnemy(state, type, tx, ty)` and
  `VL.spawnProjectile(state, { cx, cy, vx, vy, size, damage, cause, sprite })`
  add one to the current visit.
- **Hits and drops:** a swing with an item listed in `TUNING.swordDamage`
  (anything else does no harm) hits each enemy in the blade's reach once
  (`VL.hitEnemy(state, e, damage, from)` for other weapons), knocks it back
  (not a `rooted` one) and flashes it. A flier with `e.alt` (px above its
  shadow) is hit where it is drawn. A beaten enemy leaves a puff and rolls
  `TUNING.enemyDrops` (heart 20%, whole shell 20%) for a `drop` entity on its
  tile, or the nearest open one.
- **The roster:** beach crabs (sideways, hurry at a hero in their row) on the
  beaches; slimes (hop at a nearby hero) in the fields, canyon, east road and
  lake shore; bats (doze until the hero is close, flutter at them, fly off) and
  spitters (rooted; puff up, then spit a seed along a straight line) in the
  Woods; gulls (wheel, squawk, dive where the hero stood; `big`, so only metal
  blocks them) on the cliffs and highlands. Every one does half a heart and
  takes one to three wood-sword hits, except one placed with `tough: true`
  (W29: the two thorny spitters in the Hollow Oak's clearing), which only a
  sword in `TUNING.toughSwords` (the metal one) hurts. The rule lives in
  `VL.hitEnemy(state, enemy, damage, from, weapon)`: a wood blade, a thrown
  rock or pot, or any hit without a listed `weapon` just clinks off
  (`tink`); the rope still only stuns. Enemies are never solid, so they never make the
  metal sword required. The start screen, the home meadow (0,0)
  and the town have none.
- **Heart containers:** `VL.giveHeartContainer(state, id?)` adds
  `TUNING.heartContainerHp` (one heart) to `maxHp`, fills every heart, marks
  `id` found, shows its popup the first time only, plays `fanfare` and earns.
  W6 fills the `heartFieldA` (east road, among the bushes) and `heartFieldB`
  (cliff ledge) spots; bosses (W13+) call it directly. No new saved field:
  `maxHp` and the found flags were already saved.
- **Sounds:** events `enemyHit` (`hit`), `heroHurt` (`hurt`), `blocked`
  (`clank`), `enemyDefeated` (`poof`), `spit`, `squawk` and `heartContainer`
  (`fanfare`).
- **Sprite names:** the hands draw `swing-<icon>-<up|down|left|right>` for
  a sword and `item-<icon>` for a raised shield, `<icon>` being the item's
  `icon`. A new sword or shield ships those sprites (a test checks).
- **The playthrough** clears enemies from the room before every step, since
  it scripts progression, not fights; a step that means to fight sets
  `drive.fight = true`, and `playTo` resets it before the next step. A
  damage-budget test walks from the hut through the Woods to the Hollow Oak
  with enemies live, never swinging, and allows at most half the starting
  hearts. A stand-still budget (`tests/polish.test.js`) keeps 10 s standing
  on any open tile of an enemy screen to at most 4 half hearts, so place
  enemies so their lines of fire never cross on one row or column.
- **Townsfolk (W9):** the sword passes through NPCs (only enemies are hit),
  S on an NPC only talks, a knockback stops at an NPC's tile (NPCs are solid),
  and enemies wait with the rest of the world while a dialogue or shop is open.

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
- Corner assist (`systems/movement.js`): walking straight into a wall up to
  `TUNING.cornerAssist` (6) px off an opening slides the hero sideways into
  line, so 1-tile gaps and turns don't catch on trees.
- The loop runs fixed `TUNING.step` slices; real time per frame is capped at
  `TUNING.maxFrame` and every update also clamps `dt` to `TUNING.maxDt`. On
  displays faster than the step rate, presses stay latched until a frame that
  runs a step, so no tap is lost.
- Keys clear on window blur, when the tab hides, and when Cmd is released
  (macOS Chrome drops the keyup of other keys while Cmd is held). Modifier
  chords (Cmd/Ctrl/Alt) are left to the browser. Enter and Space on a header
  control reached with Tab belong to it (links activate on Enter, so Space
  still swings on a focused header link); on one that only has focus from a
  mouse click, they are the game's and focus moves to the canvas.

## Scenes and menus

`VL.START_SCENE` is `'title'` (`scenes/title.js`). A new player goes title
(three slots) → `name` (typed into a field on the canvas, 12 characters,
"Hero" when left blank; Enter, or ↓ to START and S, Space or Enter) → `intro` (the three weathered lines; S, Space or
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
  "Saving is off in this browser" and everything still plays. When only the
  probe's write fails (storage already full at load), reads still work, so
  the saved slots list and continue as usual, with nothing written. Delete
  is not offered then (no hint, Backspace does nothing), since nothing can
  be removed.
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
`w5-bush-after.png`, `w5-berry-bush.png`, `w5-berries-picked.png`). Then
combat (W6): each roster enemy on a screen it lives on
(`w6-enemy-<type>.png`), Space hitting a slime that is knocked back
(`w6-hit-knockback.png`), a crab hurting and knocking back the hero
(`w6-hurt.png`), D held blocking a spitter's seed (`w6-shield-block.png`) and
a heart container picked up (`w6-heart-container.png`). Then W9's
people, with real keys: "Zoë" typed into name entry (with `ë`), S next to Nell
and Gran (as "Élodie"), a long line over two pages, and the shop's "not
enough" and Yes/No (`w9-name-entry.png`, `w9-conversation.png`,
`w9-name-accent.png`, `w9-paged-1.png`, `w9-paged-2.png`, `w9-shop.png`,
`w9-shop-ask.png`). Then W10's economy with real keys: walking into each
building (`w10-<building>.png`), S across the mill counter and a 5 wood → 1
shell trade (`w10-mill-shop.png`, `w10-trade-ask.png`, `w10-trade-done.png`),
forging a metal sword (`w10-forge-ask.png`, `w10-forge.png`,
`w10-forge-popup.png`) and digging up the beach book and a seeded shell
(`w10-dig.png`, `w10-dig-book.png`, `w10-dig-shell.png`). Then W7's
chickens, with real keys: S lifts the coop chicken and S throws it, F flies
over the river, a long flight crosses the last highland chasm and its screen
edge, a flight off the pier splashes down, and five sword hits bring the
swarm (`w7-lift.png`, `w7-throw.png`, `w7-flight-short.png`,
`w7-flight-long-edge.png`, `w7-splash.png`, `w7-swarm.png`). Then W12's
paper and ink with real keys: Space grinding a berry with the mortar
(`w12-mortar.png`), S copying a mural (`w12-mural.png`, `w12-copy.png`,
`w12-copy-view.png`), M with no map (`w12-map-none.png`), M asking to draw
(`w12-map-ask.png`), the map inking in and drawn with the Herbalist's marks
(`w12-map-drawing.png`, `w12-map.png`) and a screen explored after
(`w12-map-explored.png`), then the whole overworld with every mark
(`w12-map-full.png`). Then W14's Scriptorium with real keys: every room
(`w14-room-<x>_<y>.png`), the locked door outside (`w14-door-locked.png`),
the gloves from the big chest (`w14-gloves-popup.png`), a pot lifted and
thrown over the pits onto the switch (`w14-lift.png`, `w14-throw.png`,
`w14-switch.png`), a book under a rock (`w14-rock-book.png`), a canyon
boulder (`w14-boulder.png`) and the Bookworm up, hit and beaten
(`w14-boss.png`, `w14-boss-hit.png`, `w14-reward-popup.png`,
`w14-reward.png`). Then W15's Woods and Hollow Oak with real keys: a step
deeper into the Woods without the map turning back (`w15-woods-lost.png`),
the same step with it (`w15-woods-map.png`, its popup and a blazed tree),
the copy's "you are here" (`w15-woods-copy.png`), every room
(`w15-room-<x>_<y>.png`), the rope from the big chest
(`w15-rope-popup.png`), the hook out and the pull across the vault's pits
(`w15-rope-throw.png`, `w15-rope-pull.png`), key B dragged off its island
(`w15-rope-fetch.png`) and the Thornback up, flipped by the hook, hit and
beaten (`w15-boss.png`, `w15-boss-flipped.png`, `w15-boss-beaten.png`). Then W16's
shockwave with real keys: the ground shaking, the flash, the story on black,
waking at home holding up the Glowstone, and Gran Ottie's talk and wood
(`w16-rumble.png`, `w16-flash.png`, `w16-story.png`, `w16-waking.png`,
`w16-glowstone.png`, `w16-glowstone-popup.png`, `w16-helper.png`,
`w16-helper-wood.png`, `w16-helper-wood-popup.png`).
Then W29's playtest notes with real keys: the driftwood at the hut beach
(`w29-driftwood.png`), the first shovel's dig-key popup and X digging with
the sword and shield in hand (`w29-dig-key-popup.png`, `w29-dig-x.png`), a
wood sword clinking off a thorny spitter (`w29-tough-spitter.png`) and the
path the copied map opens before the Oak (`w29-woods-path.png`). Then W17's
raft and water with real keys: Nell's talk, her raft yard, the question and
the raft's popup (`w17-nell.png`, `w17-raft-shop.png`, `w17-raft-ask.png`,
`w17-raft-popup.png`), pushing off from the lake shore, sailing over the
screen edge and landing on the island for its ore (`w17-launch.png`,
`w17-sailing.png`, `w17-island.png`, `w17-island-ore.png`), off the far
beach to the wreck and aboard by its stove-in side (`w17-wreck.png`,
`w17-wreck-aboard.png`), every room below deck (`w17-room-<x>_<y>.png`), the
rope over the bilge (`w17-bilge-rope.png`) and the cabin's page
(`w17-page.png`). It runs
for 240 s at most (about twice its run time). A test file
that runs no tests, and an `async` test function, both fail the node run.

## Overworld map

41 screens in the `overworld` area, one region per file in `regions/`
(`home.js` holds the hut corner). North is up; the sea is south.

```
 y\x  -2    -1    0     1     2     3     4     5     6     7
 -5         LAIR
 -4   HL    HL                            highlands: chasms 4 tiles wide
 -3   HL    HL                LAKE  ISLE              wood  (long chicken flight)
 -2         base              SCRP  RIVR  wood  WOOD  WOOD  OAK
 -1         CLF   CLF   CLF   LIBR  MILL  wood  WOOD  WOOD  WOOD
  0         CLF   home  home  SQRE  SMTH  cany  EAST  wood  wood
  1         LGHT  beach HUT   HRBR  HRBR  TIDE  TIDE
  2                                             WRCK
```

| Region (file) | Screens | Place lock | What opens it |
|---|---|---|---|
| `homeFields`, `beach` (`beach.js`) | home corner, tide pools | `beach` | nothing |
| `town` (`town.js`) | library, mill, square, smithy, harbour, Scriptorium grounds, riverside | `town` | nothing |
| `lake` (`lake.js`) | shore, open water + island | `lake` | town; the island needs `rafting` |
| `canyon`, `eastRoad` (`east-road.js`) | the boulder canyon, the road | `eastRoad` | boulders `O`, `gate: 'liftingGloves'` |
| `woods` (`woods.js`) | 6-screen route (`WOOD`, Hollow Oak at 7,-2) and 5 wrong-turn screens (`wood`) | `woods` | `softGate: 'woodsMapCopy'`: without the copy every step deeper turns back (W15, see [The Whispering Woods](#the-whispering-woods-w15)) |
| `cliffs` (`cliffs.js`) | cliff road, lighthouse, cliff base | `cliffs` | town |
| `highlands` (`highlands.js`) | 5 shelves up to the lair | `highlands` (W19) | hidden path `h`, `gate: 'climbersAlmanac'`, then 4-tile chasms |
| `shipwreck` (`beach.js`) | the wreck offshore | `shipwreck` (W17) | `rafting` |

- **Regions:** `VL.defineRegion(id, { screens, place, softGate })` tags
  screens; `VL.regionOf(area, key)` and `VL.regionVisited(state, id)` read
  them. A place lock W8 claims is reached on entering its region (the
  Woods: on reaching the Hollow Oak clearing, 7,-2).
- **The Woods maze:** `VL.WOODS_ROUTE` lists the route screens in order.
  `VL.WOODS_WRONG_EXITS` lists the three wrong exits (`{ from, side, back }`):
  each leads into one or two look-alike screens that wind back to `back`, a
  route screen no further in than `from`. They are plain loops; without the
  copied map no step between two Woods screens is taken at all (W15's edge
  rule enforces the `softGate`).
- **Gate tiles** carry `gate: '<key>'` and stay solid until the item that
  owns the key makes them passable (W14 lifts boulders for good with
  `VL.saveTile`, see Lifting; W19 opens the hidden path). Rocks (`rock: true`) are liftable with the gloves and bushes are
  always passable (bare hands), so neither is used as a wall between areas.
- **Water and the raft (W17):** deep water `W` is sailed with the raft and
  the oar (see [Raft and water](#raft-and-water-w17)); `y` is solid water
  nothing sails (under the wreck's hull, and under the mill's wheel on 3,-1,
  so the river is cut there).
- **Shore barriers (W29):** where a beach or its shallows meet a screen edge
  that leads nowhere, the sand shows driftwood (`j`, solid, never lifted)
  and the shallows end in deep water (`W`). Nothing liftable stands on sand
  or in the shallows at all: a rock there would promise a way through.
  `tests/playtest-2.test.js` checks both on every screen, so a new beach
  follows the same rule.
- **Spots** (`spots.js`) are placement markers,
  `{ type: 'spot', id, x, y, how, by, lock }`, for everything another item
  puts on the map: books, pages, hearts, ore, chickens, building and dungeon
  doors, the stage and the trapdoor. `how` is one of `door`, `trunk`, `bush`,
  `rock`, `buried`, `pickup`, `chicken`, `stage`, `trapdoor`. `by` names the
  item that fills it (required). That item swaps in its entity from its own
  file with `VL.fillSpot(id, entity)` (it keeps the spot's x, y; either file
  may load first) and deletes the spot from the ledger in
  `tests/spot-ledger.test.js`, which pins `VL.unfilledSpots()` by owner and
  must be empty when the run finishes (W20). A container's owner fills it
  with what lies inside: a book under a rock is W14's, a buried one W10's.
- **Found vs returned:** the filling item calls `VL.markFound(state, id)`
  when the player picks the thing up (`VL.spotFound(state, id)` reads it).
  W8 claims the page, heart and Woods-ore locks with `reached: spotFound`.
  **Book locks are not claimed:** a book counts once it is returned to the
  library and read, so `hiddenBookSealed`, the six titled books and the ten
  `hiddenBooks` parts (split by W8 with their places) stay planned with
  `by: 'W11'`, and W11 claims each with its own `reached` (for example
  returned, after `spotFound`).
- **Chickens:** every flight needs a chicken where it starts, so a chicken
  spot sits on the launch side of every flight the map needs, the way back
  included (`chickenLair` east of the last chasm). W7 keeps a chicken at
  each spot (it respawns there if carried off or lost), so nowhere becomes
  one-way.
- **Flight contract (for W7):** a flight's length is the width of the gap
  it clears, not the distance moved. A long flight (`chickenFlightLong`, 4)
  clears a 4-tile gap and lands 5 tiles from take-off; a short one
  (`chickenFlightShort`, 2) clears a 2-tile gap and lands 3 away. Both
  highland chasms are exactly 4 wide (no margin), and both straddle a screen
  edge (-1,-2 into -1,-3 and -2,-4 into -1,-4), so a flight crosses the edge
  mid-air: the screen slide must carry the hero and the chicken through and
  finish the glide on the far screen. The lengths are W7's `VL.tune` in
  `systems/chickens.js`, and `tests/overworld.test.js` reads them from
  `VL.TUNING`, so retuning them is checked against the map (see
  [Chickens](#chickens)). A carried chicken goes everywhere, through doors
  too, so in a dungeon (W13, W17–W19) a gap the puzzle depends on must not
  be `flyOver` (`V`, `W`), or the dungeon takes the chicken at its door;
  otherwise a chicken from town flies over the puzzle and W3's solver
  won't see it.
- **Decor** (`{ type: 'decor', art, x, y }`) draws scenery bigger than a tile
  (buildings, the lighthouse, the water wheel, signboards) over solid
  footprint tiles (`x` grass, `y` water, `G` woods floor). Register a painter
  with `VL.defineDecor(name, (ctx, x, y, t, entity) => {})`.
- **New tile characters** (all in `base`): `b` bridge/pier, `q` stage, `Z`
  trapdoor, `x` `y` `G` footprints, `e` reeds, `O` boulder, `f` woods floor,
  `F` woods tree, `C` cliff, `h` hidden path, `V` chasm (`flyOver`), `:`
  scree, `k` rock on scree, `j` driftwood (W29).

`tests/overworld.test.js` walks the whole map tile by tile with any set of
keys (walking, bushes, gloves on rocks, the raft on deep water, chicken
flight over `flyOver` gaps as wide as `VL.TUNING.chickenFlightShort`/`Long`, anywhere; the gate keys are read
from the tiles and regions) and checks that every
region and spot opens exactly when its lock's needs say: reachable with the
gate keys the table gives by then, and not reachable without any one gate or
needed region even holding every other key. A second model lets flights
start only where a chicken can be carried from its spot, and checks that
with any set of keys every tile you reach leads back to the hut (R1). Moving
a find or opening a gap in the map fails there. The browser smoke saves every screen as
`map-<region>-<x>_<y>.png`.

## NPCs and dialogue

`talk.js` (core) holds people and their words, `entities/npc.js` the entity,
looks and wandering, `scenes/dialogue.js` the conversation, and
`regions/townsfolk.js` the placeholder townsfolk (placed in `town.js`).

- **Placing:** `{ type: 'npc', id: 'nell', x, y, wander? }` in a screen's
  entities. `VL.defineNpc('nell', { name, look, talk = id, wander = 0 })` says
  who it is; `wander` is how many tiles from where it stands it may stroll (0
  stands still). An entity's own `wander` or `talk` overrides the definition.
- **Looks:** `VL.defineNpcLook('librarian', { head: 'short' | 'hat' | 'bun',
  colors: { hair, hairLight, top, topDark, topLight, legs, hat, hatLight } })`
  makes the 12×14 sprites `npc-<look>-<facing>-<0|1|2>` like the hero's. Built
  in: `elder`, `fisher`, `gardener`, `townsfolk`.
- **Wandering:** one step at a time, off the screen's edge rows, never onto a
  wall (this visit's tiles, so a cut bush is open), another entity or the hero,
  never onto a tile beside a thing that isn't a person (so no one stands on the
  only way up to a chest, sign or door), and never while the hero is close (so
  a kid can walk up and talk). `VL.npcMayStand(room, npc, tx, ty)` is the rule.
  Each visit's copy has its own seeded random numbers: wandering never shifts
  `state.rngState`. NPCs are `solid`: the hero can't walk through one.
  `tests/npcs-dialogue.test.js` checks that no placed NPC starts beside a thing
  or can stand where it cuts its screen in two (R1); place new ones in open
  ground.
- **Talking:** S goes through W5's `VL.interact`: an NPC straight ahead, or on
  a half-faced tile with no berry bush straight ahead, wins, and that press
  does nothing else (no bush pulled, no berries picked). Its `onInteract` turns it to the hero and opens the
  `dialogue` scene. World code has no app, so it asks for a scene with
  `VL.requestScene(state, id, data)` (transient), opened after the step; play
  holds back a popup queued in the same step until the scene closes.
- **Dialogue as data:** `VL.defineDialogue('nell', [{ when, say, set, give, shop }])`.
  The first entry whose `when` holds is spoken; keep a last entry with no
  `when` (the content test fails without one, or with an entry after it).
  Conditions, all of which must hold: `flag`, `notFlag` (flag ids in
  `state.flags`), `progress`, `notProgress` (lock ids from `VL.LOCKS`, reached
  now), `item`, `notItem` (`VL.hasItem`), `has: { shells: 10 }` (at least),
  `test: (state) => …`. A value may be one id or a list (all of them). A
  misspelt condition throws at load; an unknown lock, shop, item or resource,
  and words the font can't draw, are listed by `VL.dialogueProblems()`, which
  the test keeps empty. So is a `give` entry with no guard (its own `set`
  flags all in its `notFlag`, or the item it gives in its `notItem`); a gift
  meant to repeat says `repeat: true`. A later item adds its own condition with
  `VL.defineCondition('books', (state, least) => …)` (then `when: { books: 10 }`).
- **Lines from another item:** `VL.addDialogue('gran', entries)` puts entries
  ahead of the NPC's own (later story first), so W16's shockwave lines live in
  W16's file.
- **Words:** `say` is a string or a list; each string starts a new page and a
  long one runs on over as many 4-line pages as it needs. `{name}` is the
  hero's name (`VL.popupText`, shared with popups). The text types out
  (`talkCharsPerSecond`); S, Space or Enter finishes the page, a fresh press
  turns it (holding a key never skips), Esc ends the talk.
- **Remembering and giving:** when the talk ends, by the last page or by Esc,
  the entry's `set` flags are set and its `give` handed over together, and both
  are earned (saved) as one, so a closed tab never keeps the flag and loses the
  gift. `give: { item: 'shellPurse', wood: 2 }` gives items (`VL.giveItem`, its
  popup follows the talk) and resources (`VL.addResource`); a later item adds a
  kind with `VL.defineGift('heartContainer', (state, n) => …)`. An unknown kind
  throws at load. A found page is a flag: `set` it. Guard a gift so it is given
  once, and keep the NPC's other lines after it:
  ```js
  VL.defineDialogue('helper', [
    { when: { progress: 'shockwave', notFlag: 'gave:helperWood' }, say: 'Take this wood, {name}.', set: 'gave:helperWood', give: { wood: 2 } },
    { say: 'Mind the cracks in the road.' },
  ]);
  ```
  A first-meeting line is `when: { notFlag: 'met:gran' }, set: 'met:gran'`.
  Talking adds no saved field of its own.
- **A shop after talking:** `shop: 'store'` opens that shop when the last page
  closes (after the entry's flags and gifts).

## Chickens

`systems/chickens.js` is the behaviour, sounds and art; `entities/chicken.js`
the entity (`{ type: 'chicken', spot, lost? }`), which fills all eight chicken
spots. Tests: `tests/chickens.test.js`.

- **Wandering:** a chicken pecks, clucks and strolls a tile at a time within
  `chickenWander` tiles of its spot, on open ground (this visit's tiles and
  solid entities). Each copy has its own seeded random numbers, so chickens
  never shift `state.rngState`. Chickens are not solid. Their pixel feet are
  `px`/`py` and `x`/`y` follow the tile under them, so S finds them.
- **Lift and throw:** S facing a chicken lifts it overhead
  (`player.carrying`); S again throws it `chickenThrowTiles` ahead in the
  facing direction. A throw stops short of anything solid and the screen's
  edge, flies over water and chasms, and a chicken that comes down on one
  splashes and flaps back to where it was thrown from. While carrying, the
  hands do nothing else (Space does not swing, S does not pull), except that
  S facing a townsperson (or a shop counter, W10) talks instead of throwing, chicken still in hand:
  that is how the lost chicken is carried back to its kid (W11).
- **Flight (F, a secret):** F next to a chicken (within `chickenReach` px),
  or holding one, and the chicken carries the hero the way he faces. It looks
  along the line for `VL.chickenFlightTiles(state) + 1` tiles: water and
  chasms (`flyOver`) are flown over, anything else solid and the world's edge
  stop it. It lands on the farthest open tile before that, with the chicken
  still in hand; when there is none it goes out as far as it can, splashes
  down (water) or tires (chasm), and flaps the hero back to exactly where he
  took off, so a flight never strands him. Going up, that dip stops a row
  short of the top edge when it can, and it flies low there, so the HUD never
  hides the hero and the tired chicken. Facing a wall it is a hop in
  place. `VL.planFlight(state)` is the rule. The flight is `player.flight`;
  movement and the hands stand still while it is set, `player.lift` raises
  the hero, and crossing a screen edge mid-air starts the slide and the
  glide finishes on the far screen. A faint mid-flight drops it.
- **With combat (W6):** the hero is out of reach in the air (`VL.hurtHero`
  ignores him while `player.flight` is set, so seeds pass under him), and a
  take-off ends any knockback. A hit while carrying knocks him back with the
  chicken still in hand. Enemies and chickens ignore each other; swarm birds
  are not enemies and never hurt or start i-frames. The sword hits chickens
  by the swing's tiles, so a townsperson never shields one.
- **The Almanac:** `VL.chickenFlightTiles` is `chickenFlightLong` once
  `state.flags.chickenAlmanacRead` is set (W11 sets it when the librarian
  reads the book, and its popup tells the player about F), otherwise
  `chickenFlightShort`.
- **Always at its spot:** every visit starts with a chicken at each spot, so
  one carried off, thrown in the water or left on another screen is back next
  time, and the one in the hero's hands is not doubled (`prepare` skips it).
  A flight carries its chicken along, so after crossing a chasm there is one
  on each side.
- **Swarm:** `chickenSwarmHits` sword hits on chickens in one visit and
  `chickenSwarmSize` friends flap in from off screen and mob the hero for
  `chickenSwarmSeconds`, then fly off. Harmless: no damage, no push.
- **The lost chicken** (`lost: true`, spot `lostChicken`): once lifted it
  stays with the hero (`state.chickenFollower`, transient): thrown or set
  down, it trots after him and turns up behind him on every screen he
  enters. Followers, chickens flapping home and swarm birds go straight
  through walls, water and chasms on purpose (they are never solid and never
  carry the hero), so don't "fix" them into solid entities. For W11's kid: `VL.chickenWithHero(state, id)` says whether it is
  with the hero, `VL.takeChicken(state, id)` takes it away, and
  `VL.markFound(state, 'lostChicken')` keeps it off its spot for good.
- **Saved:** nothing. Carrying, flights, the follower and the swarm are play
  state; a reload puts every chicken back at its spot. A faint does the
  same (`VL.onFaint`, hooks run inside `VL.faint`): the hero drops what he
  carries and the follower goes home, so his hands are free on waking.
- **Locks claimed:** `chickens` (a screen with a town chicken visited),
  `chickenFlightShort` (with `chickens`), `chickenFlightLong` (with
  `chickens` and `chickenAlmanacRead`).
- **Sounds:** events `chickenCluck`/`chickenLift`/`chickenPeck` (`cluck`),
  `chickenThrow`/`chickenFlight`/`chickenFlap` (`flap`), `chickenLand`
  (`step`), `chickenSplash` (`dunk`), `chickenBonk` (`bump`),
  `chickenTired`/`chickenHit`/`chickenSwarm` (`henSquawk`).

## Shops

`shop.js` (core) holds the rules and `scenes/shop.js` the on-canvas counter:
a list of offers with their prices, a cursor (up/down, wrapping onto Leave),
S/Space/Enter to pick, a Yes/No question, and "Not enough shells!" (the price
flashes) when the purse is short. Esc backs out of the question, then leaves.

```js
VL.defineShop('store', {
  title: 'General Store',
  greeting: 'Have a look around, {name}.',
  offers: [
    { id: 'paper', name: 'Paper', icon: 'item-paper', cost: { shells: 2 }, gain: { paper: 1 }, about: 'For maps.' },
    { id: 'woodSword', name: 'Wood Sword', cost: { wood: 3 }, give: (state) => VL.giveItem(state, 'woodSword'),
      soldOut: (state) => VL.hasItem(state, 'woodSword') },
    { id: 'sellBerry', name: 'Sell a berry', cost: { berries: 1 }, gain: { shells: 1 }, hidden: (state) => false },
  ],
});
VL.openShop(state, 'store');   // from an entity; or `shop: 'store'` on a dialogue entry
```

- `cost` and `gain` are resources (`state.inventory`, spent and added with
  `VL.addResource`); `give(state)` hands over anything else. A buy pays every
  cost or none, then earns (saves) and pushes `{ type: 'bought', offer }`.
- An offer that gains shells is a **trade** ("Trade 5 wood for 1 shell?", the
  price column shows `5 wood → 1` and the shell icon); anything else is bought. `verb`
  overrides. `soldOut(state)` greys it out, `hidden(state)` leaves it off,
  `refuse(state)` returns why not right now ("Bring me pages first!", shown in
  place of a price check) or null, `thanks` replaces "Thank you!".
- `VL.RESOURCE_CAPS[kind] = { most(state), full }` gives a resource a ceiling
  (the shell purse): an offer whose gain would overflow it is refused with
  `full` before anything is paid. `VL.offerRefusal(state, offer)` is that check
  plus the offer's own `refuse`; the scene and `VL.buyOffer` both use it.
- Resource names in the UI come from `VL.defineCurrency(kind, { one, many, icon })`
  (shells, wood, ore, berries, broken shells, paper and ink are defined); an
  `icon` sprite is drawn after the number. A shop naming a resource the
  inventory doesn't have throws at load.
- Rules for tests: `VL.shortfall`, `VL.buyOffer` (`{ ok }` or `{ ok: false,
  reason: 'soldOut' | 'refused' | 'notEnough', text, kind }`), `VL.priceText`, `VL.shopOffers`.

## Economy (W10)

`systems/economy.js` holds the rules, `systems/digging.js` the shovels and
digging, and `regions/buildings.js` the four buildings, their keepers and
shops. Fixture: `tests/fixtures/save-v1-W10.json`.

- **One price table:** `VL.TUNING.prices` (paper, berries bought and sold, the
  mill's 5 wood → 1 shell, wood gear, the shop's shovel, metal gear with and
  without the Smith's Ledger, binding, and W17's raft and the oar for shells
  or wood). Offers point at its entries, so
  retuning a line retunes the counter. Every price and trade is in **whole**
  shells; broken shells buy nothing (the shopkeeper says so).
- **Buildings:** `VL.BUILDINGS` maps each area (`shop`, `paperMill`,
  `blacksmith`, `bindery`, one `'0,0'` screen each, tileset `interior`) to its
  door spot, the tile outside, its keeper and shop (`store`, `mill`,
  `smithy`, `bookbinder`). The doors fill W8's spots; the place locks are
  reached on entering. A counter is a tile (`counter: true`): S facing it
  talks to the NPC across it, from any tile along the counter or at its
  ends (the `counters` system, `VL.counterKeeper`), because NPCs may not
  stand beside an entity. Each keeper's talk ends by opening their shop.
- **The smith:** wood gear from wood; metal gear from 1 ore plus shells. Metal
  is its own tier, not an upgrade (no wood piece needed); the wood offer is
  hidden while the matching metal piece is owned. Every gear offer is sold
  out while the hero owns that piece, so the smith re-forges only lost gear
  (W3 known limit). `VL.smithsLedgerRead(state)` (the `bookSmithsLedger` lock
  once W11 claims it) swaps in the cheaper metal offers (`metalSwordLedger`…).
- **The bindery:** `VL.loosePages(state)` counts every lock that supplies
  `pages` and is reached, so a page counts as soon as its item claims its
  lock. With `VL.pagesToBind()` (5) pages, binding sets the flag
  `pagesBound` (`VL.pagesBound`) and queues the `pagesBound` popup; W19 turns
  that into the Climber's Almanac (claim `climbersAlmanac` with it).
- **The dig key (W29):** X (`dig` action) digs with `VL.bestShovel(state)`
  (metal before wood) whatever the hands hold, so the sword and shield stay
  up; it waits while something is lifted, a chicken carried, the rope out
  or a swing under way. The first shovel owned queues the `digKey` popup,
  and Esc lists X from then on (`VL.pauseControls`).
- **Digging:** `VL.dig(state, shovel)` digs the tile ahead and returns
  `'blocked'`, `'find'`, `'secret'`, `'shell'`, `'brokenShell'` or `'empty'` (false while a dig is
  under way). Sand takes any shovel, grass only the metal one (`digsDirt`).
  A hole is the visit's tile (`VL.DIG_HOLES`, `@` sand, `*` grass, through
  `VL.setRoomTile`), so it is gone on the next visit; **W14**, which owns saved
  per-visit tile overrides, decides whether holes should persist. One roll
  per dig (`VL.digFind`, the seeded `VL.random`): a whole shell pops out as
  a `drop` with `VL.digChance` (`digChance` 20%, `digChanceTideTables` 30%
  once `VL.tideTablesRead`, i.e. W11's `bookTideTables` claim;
  `digDirtChance` on grass), and on sand a broken shell (`drop` kind
  `brokenShell`) `digBrokenChance` (50%) of the time (W29). Every seashore
  screen also has a broken shell lying on the sand. A `{ type: 'buried', id, popup }` entity (the beach book, spot
  `bookBeachBuried`) is dug up once: `VL.markFound`, so W11 counts it as found.
  `VL.BURIED_SECRETS` are shell caches under the home fields' flowers for the
  metal shovel (the smith hints at them).
- **Stealing (easter egg):** Mabel turns to her shelves for
  `shopTurnSeconds` every `shopTurnEvery`. S on the berry basket while her back
  is turned pockets one berry and sets `shopThief`; she calls the hero Sticky
  Fingers from then on and never turns her back again.
- **Sounds:** events `dig` (`dig`) and `digBlocked` (`tink`).
- **Locks claimed:** `shop`, `paperMill`, `blacksmith`, `bindery`, `buyBerries`,
  `millShells`, `paper`, `digShells`, `buriedSecrets` (flags), and the six
  gear locks (owned now). All keep the planned rules. `paper`, like W5's
  `berries`, marks the source, not the stock: it stays reached when the paper
  is spent or the shockwave takes it, while lost gear reads as lost.

## Library

`systems/library.js` holds the rules (books, returning, readings, rewards,
the thief, the purse), `regions/library.js` the words and people (every
book's title and reading, the librarian, his wife, Pip the lost-chicken kid,
the hints), the library's inside and the progression claims,
`entities/library-finds.js` what goes on the map (trunks, books in bushes,
pages, the stage, the trapdoor, the shelves), and `scenes/reading.js` and
`scenes/puppet-show.js` the two scenes. Tests: `tests/library.test.js`.
Fixture: `tests/fixtures/save-v1-W11.json`.

- **Saved:** `state.library` is `{ returned, read, gone, trips, lastTripAt,
  stolen: { trips, bosses }, noticed }`: books returned ever (in order), the
  ones the librarian has read, the ones the thief took back since, and the
  thief's bookkeeping. Rewards are flags `reward:<id>`; the purse, the boots
  and the Scriptorium key are items. A book found is `found:<id>`
  (`VL.markFound`), like any find.
- **Books:** `VL.defineBook(id, { kind: 'generic' | 'titled' | 'sealed',
  title, color, blurb | reading, icon, read(state) })`. Ten untitled books
  (a funny line each when handed in), six titled ones and the sealed
  Scriptorium Register (17 on the map). A later item that hands out books
  (the Bookworm's bundle, W14; the hoard, W19) defines its own with
  `VL.defineBook` and calls `VL.findBook(state, id)` (found, a message, the
  first-book popup, earned). W10's buried book and W14's rock books only call
  `VL.markFound` with the spot id; the book is already defined here.
- **Finding:** a `bookTrunk` (solid; S opens it once) or a `bushBook` (a
  corner of red peeks out of the leaves; cut or pull the bush, then walk onto
  the book). `VL.booksCarried(state)` lists books found and not yet returned.
- **Returning:** S at the librarian's desk (a counter, W10's `counters`
  system) with books carried hands them all in (`VL.returnBooks`): the count
  (`VL.booksReturned`, the slot card's book number) only ever goes up. Then the
  `librarian` system plays the visit's beats one scene at a time while the
  hero is in the library: his words about the untitled books, a `reading`
  scene for each titled one not yet read (`VL.nextReading`), then any reward
  due (`VL.pendingReward`). Every beat is state, so a reload part way through
  picks up at the next talk ("Now, where were we?").
- **Readings and effects:** a reading ends (by its last page or Esc) with
  `VL.finishReading(state, id)`: read for good, then the book's effect. The
  Tide Tables raise `VL.digChance` to 30% (W10 reads the lock); the Smith's
  Ledger swaps in the smith's cheaper metal offers and marks the Woods ore;
  the Herbalist's Notes mark the three berry bushes: both through
  `VL.mapMarks(state)` (`{ kind: 'berries' | 'ore', area, screen, tx, ty }`)
  for W12's drawn map. The Primer lets W12 draw the map while
  `VL.primerOnShelf(state)`. A Child's Book of Dragons points at the Mirror
  Shield. The Chicken Keeper's Almanac sets `flags.chickenAlmanacRead` (W7's
  long flight) and its popup tells about F. The sealed book gives the
  Scriptorium key (`VL.hasItem(state, 'scriptoriumKey')`, for W14's door).
- **Where the titled books lie (W28):** none is in town at the start, so they
  come along the path rather than all at once. The Primer is in a trunk on
  the east road (past the boulders, so with the gloves, as Dungeon 1's
  mortar makes ink for a map); the Herbalist's Notes beside the Woods'
  path on 5,-2 (well away from the secret ore on 6,-1, which the Smith's
  Ledger reveals) and the Chicken Keeper's Almanac at the Hollow Oak's
  clearing (after Dungeon 1); the Smith's Ledger on the lake island and the
  Tide Tables on the shipwreck's deck (by raft, after the shockwave, when
  gear and shells are needed again); A Child's Book of Dragons in the
  highlands, on the way to the Mirror Shield. Their locks' `needs` say so,
  and `tests/overworld.test.js` checks each spot against them. Fifteen books
  can still be returned before the shockwave.
- **Rewards:** `TUNING.libraryRewards` (5 a heart container, 10 the Big
  Shell Purse, 15 the Swiftfoot Boots), books returned ever, each given once
  by id (`reward:<id>`), so a save from before the swap that got the purse at
  5 gets the heart on its next visit and nothing at 10
  (`tests/fixtures/save-v1-W26.json`). The purse raises
  `TUNING.shellCap` (15 whole shells, W29) to `shellCapPurse` (250); every price in town fits the first purse (a test checks); the
  `shellPurse` system trims anything over (a drop, a dig) and says who might
  help; a shop trade at the cap is refused instead ("Your purse is full!",
  `VL.RESOURCE_CAPS.shells`), so no wood or berry is lost. The boots
  carry `speed: TUNING.swiftfootSpeed` on their item and `VL.heroSpeed(state)`
  (`systems/movement.js`) uses the fastest worn item. Worn items never fill a hand.
- **The thief:** `VL.applyThefts(state)` runs as the hero walks into the
  library (the shelves' `prepare`). Each return trip since the last visit
  costs `libraryTheftPerTrip` books and each dungeon boss beaten
  (`d1Boss`..`d4Boss`) `libraryTheftPerBoss`, oldest first, never the latest
  trip's books, never a book the librarian has yet to read, and never the
  Primer before `d3Boss`; after it the Primer goes first and `primerTaken`
  is reached. Story events only: coming back after a week changes nothing.
  Every book has its own place on the shelves (`VL.shelfPlace`), and a taken
  one leaves a dusty gap. The next time the hero talks to him, the librarian
  first remarks on the books gone since he last did (W28,
  `VL.vanishedRemark(state)`): a line picked by how many ("One of the books
  you brought me is already gone…", "Since you were last here, two more
  books vanished!"), turning through `VL.VANISHED_REMARKS` loss by loss, then
  whatever else he has to say (the hand-in, "where were we?"). Each loss is
  remarked on once (`library.noticed`).
- **Hints:** `VL.nextMilestone(state)` is the first story beat not reached,
  and `VL.LIBRARY_HINTS[beat]` the librarian's nudge (variants with `when`:
  the Almanac at the highlands, the dragon book before the shield). A test
  keeps a hint for every milestone, so a new beat needs its hint.
- **His wife, Mrs. Fenwick** (at the puppet stage in the square):
  `VL.wifeStage(state)` counts how many of `TUNING.wifeStages` are passed in
  turn: 3 books; 7 books and `d1Boss`; 12 books and `d2Boss`, so a first
  play meets no cool side before Dungeon 1. Her greetings get shorter; from stage 2 her second talk
  in a visit (`room.wifeTalked`) is `VL.WIFE_MISDIRECTION[beat]` when there
  is one: plausible, wrong, and contradicted by her husband. S facing a stage
  tile plays `VL.PUPPET_SHOWS[stage]` in the `puppetShow` scene: beats of
  words and puppets (`cast`: where each stands, 0..1 across the stage;
  `move`: hop, shake, run, fly). The meddling young hero, Nosy Ned, appears
  from stage 2, as his own puppet (`ned`: a green cap, fair hair, a red
  shirt), never the hero's. The trapdoor in front of the stage (`trapdoor` entity, tile
  `Z`) only answers S with a message until W20 opens it.
- **The lost chicken:** Pip in the harbour asks about Henrietta (W7's lost
  chicken on the cliffs). Talking to Pip while she is with the hero (carried
  or following) takes her home for good (`VL.takeChicken`, `found:lostChicken`)
  and gives a page (`VL.findPage`, `found:pageLostChicken`, which the bindery
  counts). The field pages `pageFieldA`/`pageFieldB` are `page` pickups.
- **Locks claimed:** `library`, `puppetStage` (places), every book (untitled
  and sealed: returned; titled: read), `scriptoriumKey`, `shellPurse`,
  `heartLibrary`, `swiftfootBoots`, `lostChicken`, `pageLostChicken`,
  `primerTaken`. All keep the planned rules.
- **Sounds:** `booksReturned` and a finished reading play `libraryChime`.

## Paper and ink (W12)

`systems/paper-ink.js` holds the rules (ink, copies, the world map, the M
key, the lock claims), `entities/copyable.js` the mural and tablet, and
`scenes/world-map.js` the `worldMap` and `copyView` scenes. Tests:
`tests/paper-ink.test.js`. Fixture: `tests/fixtures/save-v1-W12.json`.

- **Saved:** nothing new. The tools, the map and the copies are items
  (`state.items`), ink and paper are resources, and the screens visited are
  W1's `state.visited`. **A first visit to a screen is earned:**
  `VL.enterScreen` marks its event `first`, and the `paperInk` system earns
  it within the same step, so a reload right after exploring keeps it on the
  map. A `VL.place` outside a step (a load, a respawn, a test) earns nothing.
- **Ink:** the `mortarPestle` item (W14's Bookworm gives it with
  `VL.giveItem`) is a hand tool: its key, or S on the equipment screen,
  grinds one berry into `TUNING.inkPerBerry` ink (`VL.makeInk`), one grind
  per `TUNING.grindSeconds`, drawn with the hero. No berries: a message.
  `flags.madeInk` marks the source, like W10's paper.
- **Copying:** `{ type: 'copyable', x, y, copy, look: 'mural' | 'tablet', text? }`
  is solid; S at it runs `VL.copyFrom(state, entity)`: with
  `TUNING.copyCost` (1 paper, 1 ink) it spends them and gives the `copy` item
  (popup, earned); otherwise it describes the picture and says what is
  missing, and once the copy is owned it says so and spends nothing. A copy is
  an item from `VL.defineCopy(id, { name, icon, about, seen, popup,
  picture(ctx, box, t) })`; its key or S on the equipment screen opens the
  `copyView` scene, which calls `picture`. `woodsMapCopy` is defined here (its
  picture is the Woods route from `VL.WOODS_ROUTE`, with a blinking "you are
  here" while the hero stands in the Woods: `picture(ctx, box, t, state)`); W14
  places its mural in the Scriptorium, and holding it opens the maze (W15). The design
  wants one or two copy puzzles at most.
- **The world map:** M (outside dungeons; `VL.inDungeon(state)` is the one
  branch point with W13, whose dungeon map owns M inside; there the map's
  hand key and S on the equipment screen only say so, and the `mapReady`
  popup waits until he is outside) calls
  `VL.openWorldMap`. With no map, `VL.mapNeeds(state)` says why not (the
  Primer read and still on the shelf, then `TUNING.mapCost`, and where ink
  comes from while the hero has no `mortarPestle`); when nothing is
  missing, the `worldMap` scene asks first, `VL.makeWorldMap` spends the paper
  and ink and gives the `worldMap` item, and every visited overworld screen is
  inked in, one after another, over `TUNING.mapRevealSeconds` (a press skips).
  After that M opens it, and it fills in as the hero explores. The `mapReady`
  popup tells the player about M once the Primer, paper and ink are all there.
- **What it shows:** `VL.mapView(state)` gives `screens` (overworld only, in
  the order first visited; interiors and dungeons are never on it), `marks`
  (W11's `VL.mapMarks`: the berry bushes once the Herbalist's Notes are read,
  shown even on screens not visited yet, and the Woods ore after the Smith's
  Ledger), `labels` (`VL.REGION_NAMES` for visited regions; `null` leaves a
  region unnamed; each with its plate's `x, y, w, h` in map pixels, placed on
  the region's visited screen nearest its middle and nudged off every mark,
  the hero and the other names) and `hero` (indoors, the door of the building
  he is in). Each screen is a pixel per tile in map inks (`mapWater`,
  `mapTree`, ...) from `VL.mapTiles(state, key)`: its tiles with W13's saved
  changes (`state.tileChanges`, `VL.saveTile`) laid over, so a lifted boulder
  or an opened path shows on the map.
- **Losing it:** `VL.loseWorldMap(state)` takes the map and empties a hand
  holding it, and earns; W16's shockwave calls it. The visits stay, so
  drawing it again (while the Primer is on the shelf) shows everything at once.
- **Locks claimed:** `ink`, `worldMap`, `woodsMapCopy`, all with the planned
  rules. `mortarPestle` is a key of W14's `d1Boss`.
- **Sounds:** `pestleGrind` (event `grind`), `penScratch` (`copied`, and each
  screen inked in), `mapUnfold` (a map or copy opening).

## Lifting (W14)

`systems/lifting.js` holds the Lifting Gloves and every lift and throw;
`entities/pot.js`, `entities/big-chest.js` and `entities/rock-book.js` are
the things lifted, the chest the gloves come in, and the books under rocks.
Tests: `tests/lifting.test.js`.

- **The gloves** (`liftingGloves`) are worn, like the Swiftfoot Boots: an item
  with `worn: true` is owned without filling a hand. `VL.giveWornItem(state,
  id)` gives one (popup, earned); a `{ type: 'bigChest', id, item }` (solid, S
  opens it once, `found:<id>`) wears a worn item and hands anything else over
  like a chest.
- **What lifts:** S facing an entity whose type says `liftable: 'pot'` (a
  `{ type: 'pot', x, y, respawn? }`, solid), a tile with `rock: true` or a
  tile with `boulder: true` (the canyon's `O`). `VL.tryLift(state)` checks the
  faced tiles in order like `VL.interact` and leaves anything else S could
  mean (a chest, a person, berries, a bush) to it. Without the gloves, S
  straight at one says it is too heavy (a half-faced one says nothing). A
  lifted **rock** turns into the ground it stood on for this visit only (the
  legend's `liftTo`, else its `ground`: grass `.`, sand `s`, scree `:`) and is
  back next visit; anything on its tile is marked `uncovered`. A lifted
  **boulder** is gone for good: `VL.saveTile` (W13) writes its `P`, so it
  stays lifted through a reload and shows on the drawn map. A pot with
  `respawn` sits back on its spot `TUNING.potRespawnSeconds` after it was
  taken (puzzle rooms and the boss room never run out), once nothing stands
  on the spot, not even part of the hero's box (`VL.heroBoxOverlaps`); a
  plain one is back on the next visit. No respawning pot sits in or just
  inside a doorway (tested).
- **Holding:** `player.lifted` (`{ kind, since, t }`, play state) is drawn
  over the hero's head. The `lifting` system (order 15, before the stage,
  the counters, the hands and the chickens) **spends** the presses it uses:
  while something is held, S, Space or D throws it and F does nothing, so
  no other system acts on that press. A hit drops it (it shatters at his
  feet); a faint empties his hands.
- **Throwing:** `{ type: 'liftThrown', kind, gx, gy, z, dx, dy }` flies
  `TUNING.liftThrowTiles` tiles at `liftThrowSpeed` over open floor and over
  **low** tiles (`pit`, `water`, `flyOver`, or a legend entry with
  `low: true`, like the Scriptorium's reading desks), and stops at walls, solid
  things (a closed shutter, a block, a chest) and the screen's edge. A
  `switch` it hits is thrown (`VL.throwSwitch`), an enemy it hits takes
  `liftThrowDamage` through `VL.hitEnemy` with `enemy.struckBy = 'throw'`
  set for the hit (the Bookworm only counts those). Everything shatters
  (`liftShards`); one that lands in a pit falls, in water splashes.
- **Rock books:** `{ type: 'rockBook', id }` fills W8's four rock spots
  (`bookMeadowRock`, `bookLakeShore`, `bookHighlands`,
  `bookScriptoriumRock`): a corner of red peeks from under the rock; once the
  rock is lifted, walking onto the book finds it (`VL.findBook`).
- **Sounds:** events `lift` (`liftHeave`), `liftThrow` (`swing`), `shatter`
  (`potSmash` for a pot, `rockCrunch` otherwise), `liftSplash` (`dunk`),
  `bigChestOpened` (`fanfare`).

## The Old Scriptorium (W14)

Dungeon 1 (design: The path through the game, 2), in `dungeons/scriptorium.js`
on W13's framework, with its boss in `entities/bookworm.js`. Tests:
`tests/scriptorium.test.js`; its play, lock by lock, is
`tests/scriptorium-route.js`, which `tests/steps/w14.steps.js` strings into
the story's milestones. Fixture: `tests/fixtures/save-v1-W14.json` (played
through to the Bookworm, two canyon boulders lifted).

```
                         boss (1,-2): the Bookworm
                              | boss door (oneWay)
  gallery (0,0)       stacks (1,-1) --door A-- vault (2,-1): the gloves
  mural, block->key A      | map                   | rock
       +------- entrance (1,0) ---rock--- pit room (2,0) --door B-- copying hall (3,0)
                statue, door out          pot->switch->key B, ore    pot over desks->switch->boss key
```

- **The way in:** the `scriptoriumDoor` spot is a `door` with
  `needs: 'scriptoriumKey'` and `locked` words: such a door is solid without the item
  (`passable` for the pathfinder), S says its words, and walking into it says
  them once per visit (the `keyedDoors` system in `entities/door.js`, for
  every door with `needs`). With the librarian's key it is an ordinary door,
  and S facing it is left to whatever else is there.
- **The gallery block** keeps Zelda's once-per-visit rule (a free block could
  be shoved into the east doorway); a sign beside it says to step out and
  back in after a wrong push.
- **The order:** key A (block onto the gallery's plate) opens door A, behind
  which the big chest holds the Lifting Gloves (mid-dungeon); only then can
  the rocks in the entrance's east corridor and the vault's south corridor be
  lifted, so key B, door B and the boss key all lie past the gloves and key
  A can't be wasted on door B. Two throw puzzles: a pot over the pits onto a
  switch (key B), a pot over the reading desks onto a switch (the boss key).
  The ore lump (`oreScriptorium`) is in the pit room. The Woods mural is a
  W12 `copyable` in the gallery, open from the start (copying needs ink, which
  needs the boss's Mortar & Pestle).
- **The Bookworm** (`bookworm`, `rooted`, `size: 'big'`): under the floor
  (`under`, a dust trail between holes), `rumble` at the next hole, `up`
  (the only time it is harmful; one paper wad, a `small` shot, per
  surfacing), `down`; a hit makes it `hurt` and dive. It surfaces at the hole
  tile (`h`, `hole: true`) nearest the hero but not under him
  (`VL.bookwormNextHole`), so from the middle of the room every surfacing is
  in a straight line. Only a throw hurts it: a sword bounces off with a note,
  and its `hp` is refilled on every hit, so `hits` (to
  `TUNING.bookwormHits`, 3) is the count. On the last it is `dying`, then is
  marked `defeated` before it leaves the room, so the framework crowns it
  (never by burrowing). Every hole and timing is in `VL.tune`.
- **Rewards** (`boss.onDefeat`): the Mortar & Pestle (`VL.giveItem`, W12's
  item) and a bundle of three books (`VL.BOOKWORM_BUNDLE`, untitled books
  defined here, found at once with `VL.giveBookBundle`); the framework adds
  the heart container `heartD1` where the worm began and the warp out.
- **Locks:** claims `scriptoriumEntered`, `woodsMural` (a visit to the
  gallery), `oreScriptorium` with the planned rules, and `liftingGloves`
  (`needs` adds `d1DoorA`) and `d1Boss` (adds `d1BossDoor`) with `replan`;
  adds `d1KeyA`, `d1DoorA`, `d1KeyB`, `d1DoorB`, `d1BossKey`, `d1BossDoor`.
  Ids are `d1…` (and `heartD1`, `oreScriptorium`).
- **Solver note:** a one-time lock used up before an event (the doors here,
  before the shockwave) carries its key in that stage's start counts, as a
  debt when need be (a count may go below 0), so the spending check no longer
  asks for its key again after the event, and a key source left enabled (the
  closure doesn't deduct spending, so `d1KeyB` looks avoidable) is cancelled
  rather than counted twice.
- **Pathfinder note:** `tests/playthrough.js` also reads this visit's tile
  changes on the hero's screen (a lifted rock), so `walkTo` goes through a
  corridor once its rock is lifted.

## The Whispering Woods (W15)

The gate on W8's maze (design: The world, "You need the copied map to get
through"), in `systems/woods-map.js`. Tests: `tests/woods-gate.test.js`.

- **Without the copied map** (`woodsMapCopy`, the region's `softGate`) the
  edge of the Woods (5,-1) is open to all, but **every step from one Woods
  screen into another turns the hero back** to `VL.WOODS_ENTRY` (5,-1, by the
  road, facing out), with the slide he walked into. The first time a popup
  (`woodsLost`) says why and points at the Scriptorium's mural; after that a
  short message (`VL.WOODS_TURNED_TEXT`) and a whisper. Nothing is ever lost,
  so it is a nudge, never a grind.
- **With the map** the paths are true: the route leads to the Hollow Oak and
  the wrong turns still wind back (`VL.WOODS_WRONG_EXITS`). The first Woods
  screen says so (`woodsWithMap`), each route screen but the last shows the
  scribes' blue mark (`woodsBlaze`, added as the room is built) on the tree
  beside its way on (`VL.woodsBlaze(key)`), and the copy (E, or its hand
  key) blinks where the hero stands (`VL.woodsMapHere`).
- **The trees before the Oak (W29):** the pass from 7,-1 up to the Hollow
  Oak's clearing is closed by trees, one of them the gate tile `J`
  (`gate: 'woodsMapCopy'`, at `VL.WOODS_GATE_TREE`). Once the copy is owned
  it becomes a dirt path for good (`VL.saveTile` with an explicit screen),
  checked as each room is built and every step, so an old save that copied
  the map finds it open as it loads. The turn-back rule above still keeps a
  hero without the copy from reaching 7,-1 at all; the trees are the same
  lock shown on the map, and on the drawn map the path appears with the
  copy. `VL.saveTile(state, tx, ty, ch, { area, screen })` saves a tile on
  any screen.
- **Edge rules** (`engine.js`): `VL.defineEdgeRule(id, (state, area, from,
  to) => Place | null)` sends a crossing somewhere other than the neighbour.
  `systems/movement.js` follows it and pushes `{ type: 'edgeTurned', rule,
  from, to }`; a chicken flight stops short of such an edge
  (`systems/chickens.js`), and the playthrough's `findPath` never crosses
  one. `VL.edgeTurn(state, area, from, to)` asks. W8's overworld test models
  the soft gate the same way (its edge open, no step within it).
- **Pathfinder fix:** `findPath` asks `passable(state, entity, area)` with the
  entity's own area, so a route planned from the overworld into a dungeon
  reads that dungeon's shutters and doors (`VL.dungeonCondition(state, cond,
  { dungeon })`).
- **Sounds:** `woodsWhisper` (event `woodsWhisper`).

## The Grappling Rope (W15)

`systems/grappling-rope.js` (design: The path through the game, 3: "pull
across gaps, yank things"); posts are `entities/grapple-post.js`. Tests:
`tests/grappling-rope.test.js`.

- **The item** `grapplingRope` goes in a hand (E). Its key throws the hook
  straight ahead (`VL.throwRope`) up to `TUNING.ropeTiles` (6) tiles at
  `ropeSpeed`, over pits, water, chasms and low things, and it comes back.
  While it is out (`player.rope`, play state) the hero stands still and the
  hands wait (`systems/movement.js`, `systems/hands.js`).
- **What the hook meets**, tile by tile: an entity whose type says
  `hookable: true` (a `{ type: 'grapplePost', x, y }`, solid) pulls the hero
  over everything to the tile in front of it at `ropePullSpeed`, unhurt on
  the way, if that tile is open; a pickup (`drop`, `shell`, `ore`, `smallKey`,
  `bossKey`, `dungeonMap`, `heartContainer`) rides back and is taken as if
  walked onto; a `switch` is thrown (`VL.throwSwitch`, in a dungeon); an
  enemy is stunned (`calm` for `ropeStunSeconds`, no damage) unless its
  definition has `onHook(state, enemy)` returning true (the Thornback);
  anything else solid, or a wall, sends it back.
- **Posts come in pairs:** put one on each side of a gap so the way back is
  never cut off (the Hollow Oak's test checks every crossing has a way back).
  On the overworld the rope works wherever a post is placed (none yet).
- **It fetches over water and pits, on the overworld too:** a pickup placed
  within `ropeTiles` of a walkable tile, in a straight line across water or
  a chasm, comes back before its gate (W17's lake island, a W19 heart).
  `tests/grappling-rope.test.js` tries the real hook on every overworld
  pickup the W15 save can't walk to, so placing one in reach fails there:
  move it, or block the line (a boulder, a tree).
- **Saved:** the item only. A faint, a door or a new screen ends a throw.
- **Sounds:** events `ropeThrow`, `ropeClink`, `ropeHooked` (`ropeHook`),
  `ropeStun`, `ropeLand` (`step`).

## The Hollow Oak (W15)

Dungeon 2 (design: The path through the game, 3), in `dungeons/hollow-oak.js`
on W13's framework, with its boss in `entities/thornback.js`. Tests:
`tests/hollow-oak.test.js`; its play, lock by lock, is
`tests/hollow-oak-route.js` (with `go`, which crosses pits with the rope where
the pathfinder can't), strung into milestones by `tests/steps/w15.steps.js`.
Fixture: `tests/fixtures/save-v1-W15.json` (played through to the Thornback).
`tests/fixtures/save-v1-W15-after.json` is that save loaded and written
again, with `afterThornbackDone`.

```
                       boss (0,-3): the Thornback
                            | boss door (oneWay)
  tangle N (-1,-2) -- great hollow (0,-2) --door A-- rope vault (1,-2): the rope
  key A   |                |                          | pits, posts both ways
  tangle S (-1,-1) -- root hall (0,-1) --ledge-- pit garden (1,-1): key B on an island
  map                      |                          | door B
                       entrance (0,0) --bars-- sap well (1,0): switch + boss key on an island
                       statue, door out to 7,-2
```

- **The way in:** W8's `hollowOakDoor` spot in the clearing (7,-2) is a
  plain door; the Woods are the gate.
- **The order:** key A lies deep in the tangle (two looping rooms of roots;
  the map in a nook of the south one), door A opens the vault, the big chest
  holds the rope (mid-dungeon), and only then can the pits be crossed: posts
  over the vault's pits down into the pit garden, the hook drags key B off its
  island, door B leads down to the sap well, posts over its pit, and the hook
  throws the switch (the bars between the sap well and the entrance lift: a
  way back) and drags the boss key off the island. Key A can't be wasted:
  door B lies past the pits.
- **The Thornback** (`thornback`, `rooted`, `size: 'big'`): it trundles after
  the hero (`walk`), stamps when he is in line (`aim`), charges and bonks
  into the wall (`charge`, `bonk`). A sword clinks off its plates with a note
  (`VL.THORNBACK_SWORD_NOTE`). The rope's hook (`onHook`) yanks a plate off
  (`plates`, 3, drawn) and flips it (`flipped`, harmless, legs waving, for
  `thornbackFlippedSeconds`), and then the sword takes the round's `life`
  (`TUNING.thornbackRoundLife`, 3: three wood hits or two metal, about a
  second of swinging; its `hp` is refilled on every hit like the
  Bookworm's). The fight is three such rounds, one per plate (`rounds`):
  a finished round sets it back on its feet (`righting`, a stomp); a flip
  that runs out keeps the round's damage, and the next hook flips it
  without taking another plate. After the third round it is `dying`, then
  marked `defeated` before it leaves (a cartoon puff); hurting while it
  walks or charges, so a hero shut in can always faint his way out.
- **Rewards:** the framework's heart container `heartD2` where it began and
  the warp out. **`VL.afterThornback(id, (state) => …)`** is the hook for
  what follows (W16's shockwave). The order is fixed and tested: the step
  the Thornback falls writes the win (`dungeons.hollowOak.boss`); a hook
  runs only in a later step once the game is clean (that write landed; a
  failed write holds it back), and its `id` goes into the saved
  `afterThornbackDone` list in the same step as whatever it changes, so
  both are written together. A reload before that runs it once; a reload
  after it never runs it again. A save that beat the Thornback before a
  hook existed runs it on the next load. The hook runs wherever the hero
  is (the heart may still be on the floor); a knock-out that waits for a
  scene must save its own pending flag. W15 itself takes nothing away.
  A hook that throws is logged (`console.error`), its saved changes are
  put back, its id is not recorded, and it isn't tried again until the
  next load: the game keeps playing and the save stays as it was.
- **Locks:** claims `hollowOakEntered` (a visit to the entrance hall) with the
  planned rule, and `grapplingRope` (`needs` adds `d2DoorA`) and `d2Boss`
  (adds `d2BossDoor`) with `replan`; adds `d2KeyA`, `d2DoorA`, `d2KeyB`,
  `d2DoorB`, `d2BossKey`, `d2BossDoor`. Ids are `d2…` (and `heartD2`).
- **Sounds:** events `thornStomp`, `thornBonk`, `thornFlip`, `thornTink`
  (`wormTink`).

## The shockwave (W16)

Design: The path through the game, 4. Rules in `systems/shockwave.js`; the
scene, the hook and Gran Ottie's words in `scenes/shockwave.js` (they need
`VL.afterThornback` and her dialogue, which load after the systems).
Tests: `tests/shockwave.test.js`; playthrough step `tests/steps/w16.steps.js`.
Fixture: `tests/fixtures/save-v1-W16.json` (after the shockwave and the gift).

- **When:** its `VL.afterThornback('shockwave')` hook only saves
  `flags.shockwaveDue`. The `shockwave` system then waits while the hero is
  in the Hollow Oak and the heart container is still on the floor (the reward
  comes first), then `TUNING.shockwaveDelay` more, then opens the
  `shockwave` scene. Leaving the Oak without the heart starts it outside, and
  the heart is given anyway on waking (hearts are kept), held up with its
  fanfare beside the Glowstone.
- **The scene:** `rumble` (the world shakes, rings of light, a white-out),
  `flash` (here `VL.applyShockwave` runs and the hero is placed at
  `VL.SHOCKWAVE_WAKE`, in his hut), `dark` (`VL.SHOCKWAVE_LINES`, a page per
  press) and `wake` (the hut fades in, "z z z"). Then `VL.wakeFromShockwave`
  holds the Glowstone up (W28's `VL.holdUp`) and names it.
- **The losses** are read from `VL.LOCKS.shockwave.loses`, so the game and
  the solver can't drift apart: items are taken, resources emptied, whole
  shells become broken shells, the map goes through `VL.loseWorldMap`; a key
  it doesn't know throws. It gives the `glowstone` (worn, like the gloves) and
  sets the save point to the hut. Everything else is kept.
- **Reloads:** before the flash nothing is saved, so the scene plays again;
  after it (`flags.shockwave`) the story resumes on black at home; after
  waking (`flags.shockwaveWoke`) it never comes back.
- **The helper, Gran Ottie:** she is added to the hut's room
  (`VL.SHOCKWAVE_HELPER`, `VL.onRoomBuilt`) until she has given the wood,
  starts talking once the Glowstone's popup closes (once per visit), and her
  entry gives `{ helperWood: TUNING.helperWood }`: a gift kind that adds the
  wood, holds it up and queues the `helperWood` popup. Afterwards she is back
  at her well, nudging a swordless hero to the smithy.
- **The climb back:** while he owns no sword after the shockwave, the home
  corner (`VL.SHOCKWAVE_QUIET`: 0,0, 1,0, 0,1, 1,1) has no enemies. A pull
  that faints the hero keeps what the bush dropped (`VL.onFaint`), anywhere.
- **Locks claimed:** `shockwave` and `helperWood`, with the planned rules.
- **Sounds:** `shockRumble`, `shockFlash`, `shockWake` (played by the scene).

## Raft and water (W17)

Design: The path through the game, 5 ("Rope + wood → raft, and wood or shells
→ oar"; the lake island and the shipwreck). Rules and art in
`systems/raft.js`; Nell's words in `regions/townsfolk.js`; her `raftyard`
shop and the two oar offers in `regions/buildings.js`; the island's ore, the
wreck and the place locks in `dungeons/shipwreck.js`. Tests:
`tests/raft.test.js`; playthrough steps `tests/steps/w17.steps.js` (`raft`,
`lakeIsland`, `shipwreck`).

- **The raft** (`raft`, worn like the gloves) is built by Nell on the harbour
  (2,1) for `prices.raft` (4 wood) with the hero's grappling rope, and only
  after the shockwave: before it the currents are "far too wild" (her line
  when he has the rope, and the offer's `refuse`). The librarian's `raft`
  hint sends a stuck kid to her.
- **The oar** (`oar`, worn): Mabel sells it for `prices.oarShells` (8 whole
  shells, inside the first purse) and Brannock makes it for `prices.oarWood`
  (3 wood). Either one; sold out once owned. A raft with no oar: pushing
  against deep water says why, once a visit (`VL.OARLESS_TEXT`).
- **Sailing:** with both (`VL.canRaft`), deep water is open ground for the
  hero: walk into it to push off, bump into land to step ashore. It is a
  **hero footing**: `VL.defineHeroFooting(id, (state, info) => bool)`
  (`systems/movement.js`) lets the hero onto a solid tile kind, and
  `VL.isBlocked`/`VL.isSolidAt` take that as an optional last argument
  (`lets(info)`); the playthrough's `findPath` asks `VL.heroMayEnter` too, so
  `walkTo` sails. Only open water (`water` and not `pit`): the wreck's
  flooded bilge is never sailed. Screen edges on water cross like any edge;
  the world's edge, `y`, cliffs and anything else solid stop the raft. The
  raft is carried, so he can push off again from wherever he landed: nobody
  is stranded (a test walks home from the island, the deck and every room
  below). `player.afloat` (play state) is set while his feet are over water;
  it draws the raft under him and the oar beside him (`raft` hero layer).
- **Saved:** the two items, and the wreck's `state.dungeons.wreck` (W13).
  Fixture: `tests/fixtures/save-v1-W17.json` (after the steps: raft and oar,
  the island and the wreck done, saved by the hold's lantern).
- **Locks claimed:** `raft` (`needs` adds `town`, with `replan`), `oar`,
  `rafting` (`renewable` with `replan`: sailing is access, see Progression),
  `lakeIsland` (a visit to 3,-3), `oreLakeIsland`, `shipwreck` (a visit to
  5,2), `oreShipwreck`, `pageShipwreck` (see the wreck below).
- **Sounds:** events `raftLaunch` (`raftSplash`), `raftLand` (`step`),
  `raftPaddle` (`raftPaddle`, every `TUNING.raftPaddleSeconds` while moving).

## The shipwreck (W17)

The mini-dungeon below the wreck's deck (design: The world, Shipwreck), in
`dungeons/shipwreck.js` on W13's framework (dungeon `wreck`, area `wreck`, no
boss). The raft lands only at the stove-in side (3,6 → 4,6 on 5,2); the
Tide Tables' trunk is on deck and the hatch (W8's `shipwreckHatch`) leads
down.

```
  hold (0,0): ladder up, lantern ── locked door ── captain's cabin (1,0): the page, 5 shells
       │
  bilge (0,1): flooded; posts across to the key's chest and the ore
```

- **The hold:** the ladder back up, a lantern on the way down (a faint or a
  reload wakes him there, and he can always climb up and sail home), two
  crabs.
- **The bilge:** three rows of seawater (`~`: solid, a pit, splashes) across
  the room; a grapple post on each side, so the way back is never cut off; a
  sign says how. The chest with the wreck's key (`wreckKeyChest`, a
  `smallKey` content) and the ore (`oreShipwreck`) are on the far side.
- **The cabin:** behind the locked door (`wreckDoor`), the page
  (`pageShipwreck`) and a chest of 5 whole shells (`wreckShellChest`, loot,
  no lock).
- **Locks:** `oreShipwreck` (`needs` adds `grapplingRope`) and
  `pageShipwreck` (`needs` adds `wreckDoor`) with `replan`; adds
  `wreckKeyChest` and `wreckDoor`.

## Dungeons (W13)

`systems/dungeon.js` is the framework the four dungeons (W14, W15, W18, W19)
build on from their own files; the pieces live one per file in `entities/`
(`locked-door`, `push-block`, `pressure-plate`, `switch`, `shutter`,
`save-statue`, `small-key`, `boss-key`, `dungeon-map`, `warp`) and the map
screen is `scenes/dungeon-map.js`. The worked example is
`tests/sample-dungeon.js` (four rooms; loaded by the tests and the browser
smoke, never by the game); `tests/dungeon.test.js` is its suite. Fixture:
`tests/fixtures/save-v1-W13.json`.

- **Saved state:** `state.dungeons[<id>]` is `{ keysGiven, bossKey, map,
  doors, plates, switches, boss }`, read with `VL.dungeonState(state, id)` (a
  dungeon added after a save was written gets a fresh one). Every field is a
  permanent earning and saves at once; **room state is the visit's** (block
  positions, a plate held down, a shutter waiting on a fight) and is rebuilt
  on every entry, so nothing can be saved half-solved. `state.tileChanges`
  holds tile changes that outlast a visit, in any area: `VL.saveTile(state,
  tx, ty, ch)` changes the hero's current screen now and on every later
  visit, through a reload (`VL.savedTile(state, area, screen, tx, ty)` reads
  one back). That is the mechanism for W14's lifted boulders and W19's opened
  path (dug holes are W14's call); a change on a screen that no longer exists
  is simply never applied. The framework applies these, and settles every
  door, shutter and plate, **as the room is built** (`VL.onRoomBuilt`, from
  `engine.js`), so a screen slides in already changed and collision never
  sees an unsettled room.
- **Ids are global and permanent.** Every `id` on any screen (keys, chests,
  the map, heart containers, plates, switches) is a `found:` flag or a saved
  key, shared by the whole game, so **prefix ids with the dungeon**
  (`d1KeyA`, `d1DoorA`, `heartD1`); `VL.dungeonLockProblems` fails an id
  used twice anywhere (a reused key id would already be "found"). Once a
  dungeon has merged, its dungeon, door, plate, switch and found ids are
  part of every save: renaming one needs a W2 migration. Keys are the one
  thing a rename cannot strand (next bullet).
- **Keys** are counted per dungeon and never work in another: an entity in a
  dungeon's area only ever reads its own dungeon's count. The keys in hand
  are **derived, never stored**: `VL.smallKeys(state, dungeonId)` is the
  dungeon's `smallKey` pickups found (their `found:` flags) plus
  `keysGiven` (keys from code) minus its small doors opened (`doors`), so a
  door or key renamed after a save re-locks or reappears *and gives the key
  back*; a door opened is the key spent, one saved fact. `{ type: 'smallKey',
  id, x, y, lock, reveal?: 'cleared' }` is found once; `reveal: 'cleared'`
  keeps it hidden until every enemy in the room is beaten. `{ type: 'bossKey',
  id, x, y, lock }` likewise. From code (a chest, a drop, a script):
  `VL.giveSmallKey(state, dungeonId, n)` (counted in `keysGiven`),
  `VL.giveBossKey`, `VL.giveDungeonMap`; a chest holds one as
  `contents: [{ smallKey: '<dungeon>' }]`. A key that appears at runtime is
  one of those two things, a map key with `reveal` or `VL.giveSmallKey`,
  never a `smallKey` entity pushed into `room.entities` (it would be found
  but never counted, so `VL.dungeonPickup` throws on one). The keys in hand
  show over the play area while in a dungeon (`dungeonHud`, on the second
  row at the right, under the SAVED note; drawn in the hero layers'
  `overlay` pass: over the light, never hidden by the hurt flash) and on the
  map screen.
- **Locked doors:** `{ type: 'lockedDoor', id, kind: 'small' | 'boss', x, y,
  lock, oneWay? }` is solid until opened by walking into it or pressing S
  with a key; the boss key is shown, not spent. A door across a screen edge
  gets a copy on each side with the **same id**; both open together.
  `VL.dungeonDoorProblems` insists on the copy (a hero crossing from the
  other side would land inside a closed door with nowhere to go) unless the
  door says `oneWay: true`, meaning the room beyond is only ever entered
  through it (the sample's boss door). **That claim is checked:** the lint
  floods the dungeon's screens from its entries (every screen a door or warp
  from outside lands on) through openings, doors and warps without crossing
  the one-way door, and fails the layout if the far room is reached (a loop
  of rooms, a warp in); a dungeon nothing leads into yet fails too, since
  the flood has nowhere to start. One id is one door: two copies at most,
  on the two sides of one edge, and one lock per door id (the game spends a
  key per id, the solver one per lock).
  `VL.openLockedDoor(state, door)` returns `'opened'`, `'open'` or `'locked'`.
- **Push blocks:** `{ type: 'pushBlock', x, y, once = true }` slides a tile
  after the hero leans on it for `TUNING.blockPushSeconds`, once per visit
  (Zelda's rule; `once: false` for a free block), never onto a wall, another
  thing (a plate is fine; an enemy's body counts wherever it stands) or the
  edge row or column (`VL.blockCanMove`, `VL.pushBlock`). Blocks are back
  where the map puts them on every entry. A block *can* still seal a room
  from inside (in front of an opening, a door or a corridor), and a sealed
  room without enemies is a softlock, so **`VL.dungeonBlockProblems`**
  searches every push sequence of every room from every tile the hero can
  appear on (beside each exit, the statue step he respawns on, every tile a
  door or warp lands him on) and names the first position with no exit he
  can reach without another push (openings, doors, locked doors, warps; an
  exit under closed bars is no exit). It models walls, solid things, plates
  pressed by blocks (or a latch plate the hero can reach, unless `weight:
  'block'`; a latched plate stays down for the rest of the sequence),
  switches in the room (thrown once he can stand beside one) and their
  shutters; a shutter on anything else (`cleared`, a flag, a switch on
  another screen) counts as open and enemies are ignored. The rule is
  deliberately strict: a room whose way out needs a push first (the block
  must come off the switch's alcove before the bars will lift) is refused
  with `… can reach no exit without a push`; lay it out so the hero always
  has a way out before he pushes. Free blocks are searched to a cap; keep
  them few.
- **Pressure plates:** `{ type: 'pressurePlate', id, x, y, latch = false,
  weight? }` is `down` while the hero stands on it or something that weighs
  sits on it: any entity type that says `weighsPlate: true` in its definition
  (a push block; W14's pots don't, since a pot is lifted and every throw
  shatters, so it never comes to rest on a plate), judged by its
  body's tile when it has one. `weight: 'block'` ignores the hero, so a block
  puzzle cannot be skipped by standing on the plate (the sample's plate).
  `latch: true` saves the first press for good, so the shutter it opens stays
  open after a reload even though the block is back at its start.
  `VL.plateDown(state, id)`.
- **Switches:** `{ type: 'switch', id, x, y }` (solid) is thrown for good by S
  or a sword swing; a thrown pot (W14) or a slingshot shot (W18) calls
  `VL.throwSwitch(state, lever)`.
- **Shutters:** `{ type: 'shutter', id?, x, y, open: condition }` are bars that
  lift while the condition holds, settled every step: `{ cleared: true }`
  (every enemy in the room beaten this visit; a boss does not count),
  `{ plate: id }`, `{ plates: [ids] }`, `{ switch: id }`, `{ flag: id }`,
  `{ door: id }`, `{ bossBeaten: true }`; several fields must all hold
  (`VL.dungeonCondition`). A shutter never shuts on the hero, so **put it on
  the tile the hero enters by** (the edge tile, or the tile a door lands him
  on): it stays up while he is on it (he can still turn round and leave) and
  drops once he has stepped in. Enemies come back on re-entry, so a `cleared`
  shutter closes again, and so can never softlock.
- **Save statue:** `{ type: 'saveStatue', x, y }` at the entrance: (x, y) is
  the step in front, where standing saves and sets the respawn point; the
  statue stands in the wall niche above, so `(x, y - 1)` must be a wall. A
  faint or Continue puts the hero there with everything kept.
- **The map:** `{ type: 'dungeonMap', id, x, y }`. M inside a dungeon opens
  the `dungeonMap` scene (M, Esc or E closes): rooms visited are lit; with the
  map every room shows and the boss's room is marked. **W12:** open the drawn
  world map only when `!VL.dungeonOf(state)`, since M is shared.
- **The boss room:** `boss: { screen, type, heart, warp: { tx, ty }, onDefeat }`
  in `defineDungeon`. `type` is an enemy of the dungeon's own
  (`VL.defineEnemy`, usually `rooted`, `size: 'big'`); the framework marks it
  `boss` in its room and keeps it by reference. The boss is beaten when it
  has **fallen and is gone** from the room: its `hp` at or below 0 (a sword,
  a thrown pot: `VL.hitEnemy` does this) or `defeated: true` set by a script
  before it is removed. Absence alone never counts, so **hide a burrowing
  boss with a flag of its own (or move it off screen); never remove it
  alive**. Then `VL.bossDefeated` saves it, puts the heart container (`heart`
  is its found id) where the boss stood on the map and the warp out (to
  `entrance`) at `warp`, and calls `onDefeat(state)` for the dungeon's own
  rewards (the Mortar & Pestle, books). On later visits the boss is gone, the
  warp is there and the heart waits until taken. **The warp out is a save
  point:** stepping on it records `entrance` (outside the dungeon) as the
  save point (`savePoint: true` on the warp), so Continue after the win
  starts on the doorstep, not back at the statue. A shutter
  `{ bossBeaten: true }` on the entry tile bars the way back once the hero
  has stepped in; since he is then shut in until the boss falls or he
  faints, a boss behind such bars must be able to make him faint, or the
  boss door's lock should need the weapon (the sample's boss *lock* needs a
  sword, its door does not). `VL.bossBeaten(state, id)`.
- **Entering and leaving:** ordinary `door` entities link the overworld and
  the dungeon both ways (fill W8's door spot from the dungeon's file). The
  hero is always placed with `VL.enterScreen`, so W6's arrival grace for
  enemies holds in every room, after a warp and at a statue respawn. A warp
  sets `state.warpHold` (transient): `systems/movement.js` ignores the arrows
  until they are let go, so a direction held through the boss warp never
  walks the hero straight back through the door he lands beside.
- **Pits and chickens:** `VL.DUNGEON_TILES` (`#` wall, `_` floor, `m` door
  mat, `o` pit, `n` solid floor under decor) is the base legend; a pit is
  solid and never `flyOver`, so a carried chicken cannot fly the puzzle.
  `defineDungeon` refuses a tileset with a `flyOver` tile unless the dungeon
  says `allowFlyOver: true` (then its gaps are its own problem).
- **Sounds:** events `smallKey`/`bossKey` (`dungeonKey`), `dungeonMap`
  (`pickup`), `doorUnlocked` (`dungeonUnlock`), `doorLocked` (`bump`),
  `shutterOpen` (`dungeonShutter`), `blockPushed` (`dungeonBlock`),
  `platePressed`/`revealed` (`dungeonPlate`), `switchOn` (`dungeonSwitch`),
  `warp` (`dungeonWarp`), `bossDefeated` (`dungeonBoss`), `statue` (`popup`).
- **Playthrough:** the pathfinder asks an entity type's `passable(state,
  entity, area)` (locked doors, shutters, blocks define it) and reads tiles
  changed with `VL.saveTile` from the save, so `walkTo` routes through an
  opened door, a lifted boulder and round a block; walk through a `cleared`
  shutter by hand when fighting (`drive.fight`). A pickup that queues a popup
  stops `walkTo` on arrival: walk to the tile before it and `drive.until`.

### How to build a dungeon

1. `dungeons/<name>.js`: a tileset from the base legend plus your own
   characters (`VL.defineTileset('scriptorium', { ...VL.DUNGEON_TILES, p: {...} })`),
   `VL.defineArea`, `VL.addScreens` with the rooms (8–14, keyed `'x,y'`; open
   edges line up like the overworld), the dungeon's enemies and boss
   (`VL.defineEnemy`), then
   ```js
   VL.defineDungeon('scriptorium', {
     area: 'scriptorium', name: 'Old Scriptorium',
     entrance: { area: 'overworld', screen: '2,-2', tx: 8, ty: 4, facing: 'down' },   // outside its door
     boss: { screen: '1,-2', type: 'bookworm', heart: 'heartD1', warp: { tx: 7, ty: 8 }, onDefeat(state) { VL.giveItem(state, 'mortarPestle'); } },
     light: 'indoor',   // or 'dark' (W18)
   });
   ```
2. Fill the overworld door spot with a `door` into the first room and put a
   `door` on the mat tile back out; a `saveStatue` by the entrance. Make
   `entrance` a safe, walkable tile outside the door: the boss warp lands
   the hero there and records it as his save point, so every Continue after
   the win starts there.
3. Lay the puzzles with the entities above, every id prefixed with the
   dungeon (`d1…`); every key, boss key, map, plate and switch has one.
   Every `smallKey`, `bossKey` and `lockedDoor` names its lock
   (`lock: 'id'`); a door across an edge has its twin on the other screen
   (or `oneWay: true`, which only holds if no loop of rooms and no warp
   reaches the far room another way); a block puzzle's plate says
   `weight: 'block'` so standing on it is not a solution; anything that
   should press a plate gets `weighsPlate: true` in its own entity
   definition. Wherever the hero can appear (beside an opening, on the
   statue step, where a door or warp lands him) he must have a way out
   before he pushes anything.
4. Register the locks in the table (README "Progression"): claim the planned
   ones (`scriptoriumEntered`, `liftingGloves`, `d1Boss`, ...) and add one per
   key and door, so the solver sees the spending order:
   ```js
   VL.defineLock('d1KeyA', { type: 'item', needs: ['scriptoriumEntered'], supplies: { 'smallKey:scriptorium': 1 }, doc: '§ …', reached: (s) => VL.spotFound(s, 'd1KeyA') });
   VL.defineLock('d1DoorA', { needs: ['scriptoriumEntered'], consumes: { 'smallKey:scriptorium': 1 }, doc: '§ …', reached: (s) => Boolean(s.dungeons.scriptorium?.doors.d1DoorA) });
   VL.defineLock('d1BossKey', { type: 'item', needs: ['d1DoorA'], gives: ['bossKey:scriptorium'], doc: '§ …', reached: (s) => VL.spotFound(s, 'd1BossKey') });
   VL.defineLock('d1BossDoor', { needs: ['d1DoorA', 'bossKey:scriptorium'], doc: '§ …', reached: (s) => Boolean(s.dungeons.scriptorium?.doors.d1BossDoor) });
   ```
   A door reachable from both sides lists both ways in as any-of
   (`needs: [['d1RoomA', 'd1RoomB']]`), or the worst-case spending check
   misses an order. A key with no map entity (from a chest with
   `{ smallKey: '<dungeon>' }`, an enemy drop, a script calling
   `VL.giveSmallKey`) still gets a supplying lock, on the chest's or drop's
   own id; the lint cannot see those, so check that each
   `smallKey:<dungeon>` supplier in the table is one you give. **The table
   must tell the truth about geography:** a key's `needs` names every
   locked door on the way to it (through other locks if you like). Nothing
   checks the map against the table for that; a key wrongly said to need
   only the entrance passes the lint and the solver, and only the
   playthrough (step 6, if its steps walk to every key) catches it.
5. **Lint.** `VL.dungeonProblems()` runs every check over every dungeon the
   game has defined (`tests/dungeon.test.js` keeps it empty, so a dungeon in
   the manifest is checked with no test of its own): `dungeonLockProblems`
   (every key and door names a lock with the matching rule, one lock per
   door id, every key, map, plate and switch has an id, no id used twice
   anywhere), `dungeonDoorProblems` (edge doors have their twin, or `oneWay`
   and the far room really is reached through them alone) and
   `dungeonBlockProblems` (from every tile the hero can appear on, no push
   sequence leaves him without an exit). Each message names the room and
   the fix. The lints are strict on purpose: they refuse anything they
   cannot see is safe (a one-way door in a dungeon nothing leads into yet, a
   way out that needs a push first), so a message is a layout to change,
   not a flag to add. Run it from the console on a new layout before
   writing steps.
6. Steps in `tests/steps/<item>.steps.js` for the milestones you implement,
   a smoke block with screenshots, and a save fixture if you add a field
   (`save-v1-W13.json` is a played state: the key found and spent on the
   north door, `keysGiven: 0`). The sample's suite shows a faint-anywhere
   check worth copying.

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
- **Access is `renewable`, a change is not.** A flag whose needs must hold
  every time it is used (sailing with the raft and the oar, `rafting`) is
  `renewable`, so the solver works it out again after every event; a
  one-time flag is a permanent change to the world (a hedge cut for good)
  and is carried through events as a possession.
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
there: progress survives reloading the page at any point. That reload sees
everything saved by the end of the step, so a later earning in the same step
(closing a popup earns) hides a missing `VL.earned` in the action itself: when
a step ends with `drive.closePopups()` or more play, call `drive.reload()` right
after the earning action and check it there (W5's `chestGear` step does). The default app is
therefore a new game saved in slot 1 of an in-memory store (`slotApp`); the app
itself is also injectable (`createPlaythrough(VL, { app })`), so the title
screen and name entry can be driven from there, and an app without a save slot
fails `playTo` with a message. The test drives to the last
milestone that has steps; the first milestone without steps must be planned,
not implemented, so an item that implements a beat also scripts it.
