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
| Space | Use the item in your main hand (a sword, the slingshot, ...); another key can be chosen (Esc → Controls) |
| D | Use the item in your off hand (a shield, ...); another key can be chosen (Esc → Controls) |
| E | Equipment: choose what goes in each hand |
| X | Dig with your shovel, whatever your hands hold (once you have a shovel); closes the equipment view and the maps (E, M and Esc do too), a shop and the librarian's shelf (Esc does too) |
| M | The map, once you have one (the world map, or a dungeon's map) |
| N | Sound on or off |
| Esc | Pause: Resume, Save & Quit, or Controls (choose the hand keys) |
| Enter | Confirm a name or a menu choice (in menus, Space and S work too, whichever hand Space uses) |
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
whole-shell count, the broken-shell count beside it once there are any (W32),
and the main-hand (Space) and off-hand (D) slots. The SAVED / COULD NOT SAVE
note is drawn in the bar too, right-aligned before the slots
(`HUD_LAYOUT.note`), so it never covers the play area. The file
that owns a value plugs in its reader once:
`VL.ART.hudSource('shells', (state) => state.inventory.shells)` (also
`brokenShells`, and `mainHand` and `offHand`, returning an item id). A shop
dealing in shells lists broken ones after them in its YOU HAVE line. Popups, dialogue and menus use
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
  first; `prefers: 'offHand'` for a shield), queues its popup and earns. An
  item with `takesHand: 'offHand'` (the Mirror Shield, which its boss needs)
  goes into that hand the first time it is given even when the hand is full;
  the old item stays owned, in the equipment list.
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
  { resource, amount }], found?: { title, text } }`) and a `sign` (`{ type: 'sign', text, title }`) are
  solid and answer S. A chest shows `found` once opened (the wreck's "Five
  whole shells!"), and stays shut, saying why, while capped shells in it
  would not all fit in the purse (W38).
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
  page. Shop and smithy purchases do not hold up. A hold sets the hero
  facing down; one with `holdUp.facing` turns him back that way when it
  ends (only the library's rewards set it, so S at the desk talks again,
  W36). `state.holdUp` is play
  state; `VL.tickHoldUp` is the play scene's clock, and a test that drives
  the app waits it out before closing popups.
- **Equipment screen (`'equipment'`, E):** arrows choose, Space or D puts the
  item in that hand, S uses it (eats a berry), X, E or Esc goes back. The grid
  shows 4×2 items and scrolls a row at a time (arrows at its side show more
  above or below), so any number of items fits. The chosen item's `about`
  wraps to `VL.EQUIPMENT_ABOUT_LINES` (2) lines 200px wide (W36); a longer one
  scrolls: Down reads on a line and Up back before either moves the cursor,
  with arrows beside the text (`VL.equipmentAboutCues`). A test keeps every
  shipped item within the two lines, so today the arrows only ever move the
  cursor. Under the resources, W36 adds the books found but not handed in
  (`VL.booksCarried`) and the pages found of five (`VL.loosePages` /
  `VL.pagesToBind`).
- **Drawing with the hero:** `VL.defineHeroLayer(id, (ctx, state, x, y, t,
  pass) => {})` draws with the hero, once behind (`pass === 'behind'`), once
  in front (`'front'`) and once more after the light (`'overlay'`, outside
  the hurt-flash gate: the dungeon keys HUD); the swing and the raised
  shield are the `hands` layer. A third argument `{ steady: true }` marks a
  layer that draws things in the room, not on the hero (the dark, the beam,
  stun stars): it keeps its place in the order but is drawn on the hurt
  hero's off frames too, so no large area ever flashes with him.
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
  onHit(state, e, weapon), onTouch, draw(ctx, e, cx, cy, t) })` also defines
  the entity type,
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
  (W29: the two thorny spitters in the Hollow Oak's clearing; W30: two more
  in its tangle), which only a sword in `TUNING.toughSwords` (the metal one)
  hurts; a wood sword that clinks off one says so once a visit ("Hmm, this
  wood sword seems to do nothing to them..."). The rule lives in
  `VL.hitEnemy(state, enemy, damage, from, weapon)`: a wood blade, a thrown
  rock or pot, or any hit without a listed `weapon` just clinks off
  (`tink`); the rope still only stuns. Enemies are never solid, so the clearing's never
  block the way; the tangle's guard a key (`reveal: 'cleared'`), which is
  what makes the metal sword required for Dungeon 2. The start screen, the home meadow (0,0)
  and the town have none.
- **Heart containers:** `VL.giveHeartContainer(state, id?)` adds
  `TUNING.heartContainerHp` (one heart) to `maxHp`, fills every heart, marks
  `id` found, shows its popup the first time only, plays `fanfare` and earns.
  W6 fills the `heartFieldA` (east road, among the bushes) and `heartFieldB`
  (cliff ledge) spots; bosses (W13+) call it directly. No new saved field:
  `maxHp` and the found flags were already saved. **W34 buried `heartFieldA`**
  (`reveal: 'dug'`, spot `how: 'buried'`): it is hidden until the metal
  shovel digs exactly its tile (X), then comes up into the hole like the
  Hollow Oak's moss key and is taken by stepping on it, once. Its lock needs
  `metalShovel` and stays optional. It lies in a nook of bushes against the
  trees (W38 tried flowers there; W41 put W34's bushes back): the bush in
  front is cut to step in, and the nook is the only clue.
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

## Crabs (W34)

Matthew's crab notes, in `entities/crab.js`. Tests: `tests/crabs.test.js`.
Saved field `crabs: { killed, angry, feast }` (fixture
`tests/fixtures/save-v1-W34.json`; an older save loads it as none killed).

- **Angry crabs:** every beach crab beaten on the overworld counts
  (`onDefeat`, a new enemy hook in `systems/combat.js`); the wreck's crabs,
  the Lens Crab and the island's eleven never do. At
  `TUNING.crabsAngryAfter` (10) the `crabsAngry` popup says so once ("For
  killing so many, the crabs now consider you their enemy! Watch out!") and
  every overworld crab from then on is angry: one more hp (3 hits with the
  wood sword, 2 with the metal one), darker with frowning brows, and it
  walks straight at the hero over any open ground (grass too) at
  `TUNING.angryCrabSpeed` (34, under his 47, so he can always walk away),
  backing off while calm. `moveEnemy` keeps it on its own screen. The usual
  arrival grace still holds, and the shockwave's quiet home screens still
  have no enemies until the Lighthouse.
- **The island's eleven:** `VL.islandDigTiles()` is the lake island's sand
  (3,-3) but the trunks' tiles: eleven (the ore's counts once picked up).
  Digging all eleven in one visit spawns a crab (`egg: true`) on each hole,
  angry if the crabs already are. Beating all eleven fills the purse to its
  cap (15 or 50) and every heart, once ever (`crabs.feast`), with the
  `crabFeast` popup; after that they still come out, and give nothing.
  Leaving the screen sends them home and fills the holes in. Lock
  `islandCrabs` (optional: the island and a shovel).

## Hero look (W37)

Matthew's note: a choice of clothes colour and hair length when starting,
and (PM) boy or girl for the words. `systems/hero-look.js`; tests:
`tests/hero-look.test.js`. Saved field `look: { outfit, hair, gender }`
(`green|blue|purple|pink|yellow`, `short|long`, `boy|girl`; fixture
`tests/fixtures/save-v1-W37.json`). A save without it loads as
`VL.DEFAULT_LOOK`, today's hero (a boy in green with short hair), so no
migration; `VL.heroLook(state)` reads it with any odd value put back to the
default. Boy or girl changes only the words, never the sprites.

- **The chooser** sits on the name scene: the name, HERO (Boy, Girl),
  CLOTHES (five swatches; the colours go round), HAIR (Short, Long), START,
  with the hero walking and turning through every facing at 4× beside them.
  ↑↓ move between rows, ←→ change a choice, S or Space on a choice steps
  down, a letter typed on any other row goes back to the name, Enter starts
  from anywhere. **Boy or girl starts unpicked** (Matthew: "Definitely don't
  assume"); clothes and hair start as today's hero. Until it is picked, a
  start (Enter on any row, S or Space on START) moves the cursor to the HERO
  row and shows `← BOY OR GIRL? →` under it instead of starting; from no
  pick ← is Boy and → is Girl. `VL.newGame` is never reached without one.
- **Drawing the hero:** `VL.ART.drawHero(ctx, player, x, y, t, look)`;
  `render.js` passes `state.look`, the title passes the chosen slot's. A
  sprite is worn with `VL.ART.lookSprite(id, look)`: today's look returns
  `id` itself, anything else a variant `<id>~<outfit>-<hair>` defined the
  first time it is asked for. A variant recolours `tunic`, `tunicDark` and
  `tunicLight` to the outfit's shades (`VL.OUTFIT_COLORS`) and, for long
  hair, lays the sprite's hair overlay over its rows. **Every pixel keeps
  its place:** same size, same face, eyes never covered, so anything drawn
  over the hero lines up in every look.
- **A new hero pose** (a sprite drawn through `VL.ART.heroFrame`) gets its
  colours for free; give it long hair with
  `VL.ART.defineHeroHair('hero-<pose>', rows)` (`'h'` hair, `'H'` its light,
  `'.'` leaves the pixel; rows past the overlay are left alone), or it is
  drawn with short hair.
- **Drawing on the hero's face or head** (an egg, a hat): use a hero layer,
  `VL.defineHeroLayer(id, (ctx, state, x, y, t, pass) => …)` in the
  `'front'` pass, and place it from the sprite's top-left, exactly as
  `drawHero` does: `const { sprite, bob } = VL.ART.heroFrame(state.player, t)`,
  `left = x - 6`, `top = y - 10 - bob - Math.round(state.player.lift || 0)`.
  The face (facing down) is sprite columns 2-9, rows 3-6, eyes at columns 3
  and 8 of row 4; facing left the face is columns 1-6, rows 3-6 (eye at
  column 2, row 4), facing right its mirror (columns 5-10); facing up there
  is no face. Long hair adds pixels only outside the face (down: columns 1
  and 10, rows 2-7; up: down the back, rows 2-9; left/right: behind the
  head, rows 4-8; the arms-up `hero-hold`: columns 2 and 9, rows 3-7, beside
  the eyes), so a face overlay never needs to know the look; one
  covering the whole head should be 2px wider for long hair, or sit under
  it by drawing in the `'behind'` pass.
- **Also wearing it:** the puppet shows' hero puppet (`puppet-hero`) where it
  stands for the player: the first show's "brave little hero", the
  confession's "brave young hero" and the kind show "The Library That Grew".
  Sir Bumble is a story character, so his show casts his own puppet
  (`puppet-bumble`, a bumblebee knight in a helmet) in every game; the finale's hero marionette and the town
  booth's little hero puppet (both get `look` on their room copy from a
  `VL.onRoomBuilt` hook), and the hero on the title's shore (the slot the
  cursor is on).
- **The hero's words:** `VL.popupText` turns `{he}`, `{him}`, `{his}`
  (his/her), `{hers}` (his/hers), `{himself}`, `{boy}` (boy/girl), and the
  same capitalised (`{He}`, `{His}`, ...), into the hero's words from
  `look.gender` (`VL.HERO_WORDS`); no look means a boy. **All text the
  hero sees goes through `VL.popupText`**, not only talk: book titles,
  equipment names and descriptions, the shockwave and fainting lines, show
  titles, shop titles, rows, questions and notes, dungeon and map names,
  dungeon notes, the librarian's shelf and a re-reading (W36) and the
  credits' headings; a test plants tokens in each and
  fails on any `{token}` drawn raw, boy or girl. **Never write a hero
  pronoun out:** a test scans every string in the game and fails on a he,
  she, him, her, his, hers, boy or girl, or a gendered noun or form of
  address (lad, lass, son, daughter, young man, sir, ma'am, mister, lady,
  prince, king, ...; a title before a capitalised name, such as Mrs.
  Fenwick or Sir Bumble, is someone's name and passes) that is neither a
  token nor on its allow-list of other characters (the librarian, his wife, Bryony, Brannock,
  Henrietta, Nell, Mabel, the dragon, Sir Bumble, Nosy Ned). Text about
  someone else joins that list in `tests/hero-look.test.js`. Today only the
  intro's last line is the hero's (`to save {his} culture`); the rest of the
  game already speaks to the hero as "you" or by name.
- The render smoke shoots the chooser in all ten looks
  (`w37-look-<outfit>-<hair>.png`), each outfit with long hair on sand under
  grass (`w37-world-<outfit>.png`), every facing (`w37-facing-<facing>.png`),
  the puppet show and the title's hero.

## Hand keys (W40)

Matthew's note: let the player choose the main-hand and off-hand keys.
`systems/hand-keys.js` and `scenes/controls.js`; tests:
`tests/w40-hand-keys.test.js`. Saved per slot as `handKeys: { mainHand,
offHand }`, key codes (`'Space'`, `'KeyQ'`, `'Digit1'`; fixture
`tests/fixtures/save-v1-W40.json`). A save without it plays with Space and D
(`VL.DEFAULT_HAND_KEYS`); `VL.handKeys(state)` reads it, a reserved, shared
or unknown code falling back to the default, and with no game (title, name
entry) it is the default.

- **Choosable:** any letter A-Z or digit 0-9 the game does not use, and
  Space. Taken (`VL.reservedKey`): every code in `VL.KEYS` (arrows, S, E, F,
  X, M, Esc, Enter, Backspace, Delete) and the mute key N. A number pad digit
  is that digit (`VL.keyCode`). `VL.handKeyChoice(state, hand, code)` says
  `ok`, `taken`, `otherHand` or `notAKey`; `VL.setHandKey` and
  `VL.resetHandKeys` change it and save. A key added to `VL.KEYS` later is
  taken at once; a save that already chose it falls back to Space and D.
- **The input layer:** `VL.KEYS` no longer holds the hands.
  `VL.actionsForKey(event, hands)` gives every action of a key: its fixed
  one, `space` for the Space bar, and a hand when the binding names it. The
  boot loop calls `input.setHands(VL.handKeys(app.game))` before each poll;
  a change lets go of every held key. `actions.keys` lists the codes pressed
  since the last poll (no repeats), only for the Controls screen. Game logic
  still reads `mainHand` / `offHand`, so W38's egg swap swaps the chosen keys.
- **The Controls screen** (pause menu, third row): Main hand, Off hand,
  Reset to Space and D, Back. S, Space or Enter on a hand waits for a key; a
  taken key, the other hand's key or a key that is not a letter, digit or
  Space is refused with a note and it keeps waiting; Esc or X backs out
  unchanged. Esc or X on the screen goes back to the pause menu, on Controls.
  The refusal never names F (the chicken flight stays a secret).
- **Text:** `VL.popupText` fills `{mainKey}` and `{offKey}` with the chosen
  keys in words (`Space`, `Q`, `1`). Small labels use `VL.handKeyMark`
  (`␣`, `Q`) and the pause list `VL.handKeyHint` (`␣` or `Q:`); the HUD slots
  read `mainKey` / `offKey` from `VL.ART.hudModel`. A test scans every string
  in the game and fails on Space, `␣` or a lone D outside the tokens, with an
  allow-list for other uses.

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
"Hero" when left blank, with the hero's look beside it (W37); boy or girl
must be picked, then Enter, or ↓ to START and S, Space or Enter) → `intro` (the three weathered lines; S, Space or
Enter skips after half a second) → `play`. From play, Esc opens `pause`
(Resume, Save & Quit, the controls); hearts running out opens `fainted`,
where a press respawns the hero; `conflict` (another window saved this slot)
sends the player back to the title. One file per scene, each drawing through
the art kit, and the render smoke in `tests/engine.test.js` covers every one.

- Menus accept Enter, S or Space: `VL.confirmed(actions)`. Enter is the
  `confirm` action, the Space bar is `space` (always, whichever hand it
  uses or none, W40; never the main-hand action), Backspace and Delete are `erase`. A scene that wants a
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
  A place done with can hand its save point on:
  `VL.moveSavePoint((state, point) => place or null)` is asked on every
  Continue and faint (`VL.respawnPlace`); the shipwreck and every finished
  dungeon use it (see "The boss room"). Name the place a rule wakes him at
  with `VL.nameWakePlace(place, 'at home')`: `VL.wakeWords(state)` is then
  those words whenever he will not wake at his save point, and the statue,
  the wreck's lantern, the faint screen and the pause hint say so
  (`VL.savePointNote(state, plain)`, whose words `app.save` switches to
  "Could not save yet" while a write fails). `VL.keepSavePoint((state, point) =>
  true or false)` holds a save point where it is ahead of every move rule
  (the Hollow Oak until the shockwave). Neither changes `savePoint` itself.
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
  the line for a cause (`shrub` is already there). The one exception is a
  big chest with `keptOnLeaving` (W42, the Mirror Shield across the lava):
  see "Lifting" (the gloves' bullet). `VL.onLoad((state) => …)` runs on every
  loaded game before he is placed (`VL.LOAD_HOOKS`).
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
paper and ink with real keys: Space grinding berries with the mortar
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
`w14-reward.png`); W42's copying hall, a pot shattering on the niche's shut
gate, the first switch lifting it and a pot through it throwing the second
(`w42-niche-shut.png`, `w42-niche-open.png`, `w42-niche-switch.png`), and
the Lair's lava room with two steps onto it (`w42-lava-room.png`,
`w42-lava-step.png`), and the shield taken there on one half heart, the
next lava step fainting him and the shield slipping back into its chest
(`w42-shield-returned.png`). Then W15's Woods and Hollow Oak with real keys: a step
deeper into the Woods without the map leading on (`w15-woods-no-map.png`),
the pass below the Oak shut by trees (`w15-woods-pass-shut.png`), the same
step with the map (`w15-woods-map.png`, its popup; `w15-woods-edge-map.png`,
no marks),
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
path the copied map opens before the Oak (`w29-woods-path.png`). Then W30's
notes with real keys: the word a wood sword gets from a thorny spitter
(`w30-wood-sword-message.png`), the Hollow Oak's moss room, one dig bringing
nothing up, every other grass tile dug and X on the last bringing up the key
(W42; `w30-grass-room.png`, `w42-grass-one-left.png`, `w30-grass-key.png`), and the boss gate shut behind the hero, still shut
with the heart on the floor, and open with the warp once it is taken
(`w30-boss-gate-closed.png`, `w30-boss-gate-heart.png`,
`w30-boss-gate-open.png`). Then W18's
Lighthouse with real keys: the door shut without the Glowstone
(`w18-door-dark.png`), every room (`w18-room-<x>_<y>.png`), a dark floor
unlit and lit by its lamps (`w18-dark-unlit.png`, `w18-dark-lit.png`), the
Slingshot from the big chest (`w18-slingshot-popup.png`), a shot across the
pits at a target (`w18-slingshot.png`, `w18-target-hit.png`), the cistern's
beam as found and solved (`w18-beam.png`, `w18-beam-solved.png`) and the Lens
Crab up, dazed and beaten (`w18-boss.png`, `w18-boss-dazed.png`,
`w18-boss-beaten.png`), with W30's boss gate checked there: shut and no
warp while the heart is on the floor, open with the warp once it is
taken. Then W17's
raft and water with real keys: Nell's talk, her raft yard, the question and
the raft's popup (`w17-nell.png`, `w17-raft-shop.png`, `w17-raft-ask.png`,
`w17-raft-popup.png`), pushing off from the lake shore, sailing over the
screen edge and landing on the island for its ore (`w17-launch.png`,
`w17-sailing.png`, `w17-island.png`, `w17-island-ore.png`), off the far
beach to the wreck and aboard by its stove-in side (`w17-wreck.png`,
`w17-wreck-aboard.png`), every room below deck (`w17-room-<x>_<y>.png`), the
rope over the bilge (`w17-bilge-rope.png`) and the cabin's page
(`w17-page.png`). Then W19's highlands and lair with real keys: S across
Miss Quill's counter binding the five pages (`w19-bindery-ask.png`) into
the Climber's Almanac (`w19-almanac-popup.png`), the hidden path open on
the cliff base and climbed to its ledge (`w19-hidden-path.png`,
`w19-ledge.png`), S lifting the ledge's chicken and F flying the chasm and
its screen edge to the first shelf, landing with it (`w19-flight.png`,
`w19-highlands.png`), every lair room (`w19-room-<x>_<y>.png`), the Mirror
Shield from the big chest (`w19-shield-popup.png`), a stone head's fire and
D held until it goes home and the head is choked (`w19-spout-fire.png`,
`w19-spout-choked.png`), and the Dragon up, drawing breath, its fire
bounced back (dazed), struck and beaten, the hoard spilled, with the boss
gate shut until the heart is taken (`w19-boss.png`, `w19-boss-breath.png`,
`w19-boss-dazed.png`, `w19-boss-beaten.png`, `w19-hoard.png`). Then W32's
polish pass: S at the lair's big chest with the slingshot in the off hand,
the Mirror Shield taking that hand (`w32-mirror-shield-popup.png`), SAVED in
the HUD bar over a lair room with both keys (`w32-saved-in-hud.png`), the
spilled hoard clear of the keys (`w32-hoard-hud.png`), broken shells in the
HUD and the smithy's YOU HAVE line (`w32-broken-hud.png`,
`w32-smithy-purse.png`), and the arrow onto a finished Scriptorium's statue,
then a faint, both saying he wakes at home (`w32-statue-home.png`,
`w32-faint-home.png`). Then W20's
finale with real keys: the square after the Dragon (`w20-trapdoor-popup.png`,
`w20-trapdoor-open.png`), onto the hatch and down, Mr. Fenwick following
(`w20-follow.png`, `w20-workshop.png`), the tunnel (`w20-tunnel.png`), the
hall (`w20-confront.png`, `w20-marionettes.png`), Space through a string and
the last string cut (`w20-string-cut.png`, `w20-puppets-down.png`), her words,
her last show, the apology (`w20-she-speaks.png`, `w20-confession.png`,
`w20-confession-dragon.png`, `w20-apology.png`), the ending beat by beat
(`w20-ending-fill.png`, `w20-ending-thanks.png`, `w20-ending-cheer.png`,
`w20-ending-book.png`, `w20-ending-promise.png`, `w20-ending-town-books.png`),
the credits and THE END (`w20-credits.png`, `w20-the-end.png`) back to the
title, then a kind show and the packed library (`w20-kind-show.png`,
`w20-library-full.png`). Then W33's finale fixes: the hero in front of the
hero puppet, which fades (`w33-hero-over-puppet.png`), Esc in the ending's
first fade-in, the ending with nothing in the HUD strip
(`w33-ending-no-hud.png`), and the slingshot's ammo count inside its slot
(`w33-ammo-in-slot.png`). Then W39's finale talk, S turning the pages: every
page of the hall's three talks with the box checked clear of whoever speaks,
hers low and his high (`w39-confront-<n>.png`, `w39-after-fight-<n>.png`,
`w39-forgiven-<n>.png`), each beat of the confession show
(`w39-show-<n>.png`), each box of the ending (`w39-ending-<n>.png`), and Mr.
Fenwick beside Gran Ottie and at his desk (`w39-fenwick-and-gran.png`,
`w39-fenwick-library.png`). Then W35's dungeon notes, with real keys: a seed
over the Hollow Oak's roots (`w35-seed-over-roots.png`), Gran Ottie's hint
after a faint (`w35-gran-hint.png`), the Lighthouse with no heaps and a
thorny slime, a step onto lava (`w35-lava.png`), the Lair's guards (a wood
sword's "Clink!", the metal sword beats them, the cave opens), the hoard
with no twinkle, the dazed Dragon untouched by wood and tinted by metal
(`w35-dragon-hit-tint.png`), and the third round's fan (`w35-dragon-fan.png`).
Then W43's boss life meters: each of the four bosses with its meter full
and drained by a hit (`w43-meter-<boss>.png`, `w43-meter-<boss>-hit.png`),
the meter gone once it is beaten, and the Dragon's two strikes a round with
real keys (`w43-dragon-strike.png`).
Then W40's hand keys with real keys: Esc, down to Controls
(`w40-controls.png`), the main hand waiting (`w40-capture.png`), S refused
with a note (`w40-refused.png`), D refused as the off hand's key, Q taken
(`w40-controls-chosen.png`), the pause list naming Q (`w40-pause-keys.png`),
Q swinging and Space not, the sword's popup saying Q
(`w40-popup-custom-key.png`) and the equipment view (`w40-equipment.png`).
Then W41's overworld notes: the buried heart's nook of bushes
(`w41-heart-bushes.png`), Space grinding five berries into an ink
(`w41-mortar-five.png`) and refusing four (`w41-mortar-short.png`), and the
middle shelves' one chicken lifted with S (`w41-middle-hen.png`), carried
north over the screen edge with Up (`w41-hen-carried.png`) and flown over the
second chasm with F (`w41-hen-flown.png`).
Last, the flash guard (WCAG 2.3.1): dark rooms while hurt,
the beam, the Lens Crab's rounds, the Dragon's rounds, its fire through a
metal shield, a stone head's fire bounced home, the slides up through the boss
door into the Dragon's hoard (before and after the fight), down the trapdoor,
the marionettes (strings cut, puppets falling, hurt over and over), a puppet
fading as he steps in front of it and out again, her
confession show, the ending (fades, shelves filling, the cheer, the credits),
the shockwave, the chicken swarm, popups and a faint are each stepped by hand and drawn offscreen at 60 fps, in 16 px
cells. It fails when, within any one second, over a quarter of the canvas
flips brightness (0.05 relative luminance) more than 3 times, or over 2.8% of
it (a quarter of WCAG's 341x256 px field at scale 4, where the canvas fills
WCAG's 1024x768 reference screen; stricter than WCAG at scale 3, where a
quarter of the field is about 4.9%) flips by WCAG's 0.1
more than 6 times (over 3 flash pairs), or over 2.8% of it has more than 3
saturated-red flash pairs (WCAG 2.0's red flash measure, glossary Note 3, W32: a
change of over 20 in (R - G - B) x 320 from linear R, G, B, negatives as 0,
with either or both states at R / (R + G + B) of 0.8 or more). WCAG 2.1 and 2.2
replaced it with a CIE 1976 UCS chromaticity change over 0.2; that test isn't
added, since every real scene scores 0% on the red check. A control run with the steady layers
off must fail the first two, and a red-and-black strobe over 6% of the
canvas the red one. It runs for 540 s of awake time at most (about 1.45 times its run time
of about 365 s alone, W43; it was 360 s when the run took 250 s). A
test file that runs no tests, and an `async` test function, both fail the
node run.

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
| `woods` (`woods.js`) | 6-screen route (`WOOD`, Hollow Oak at 7,-2) and 5 wrong-turn screens (`wood`) | `woodsPaths` (W34) | the east road; the Oak's clearing (`woods`) is behind the gate tree `J`, `gate: 'woodsMapCopy'` (see [The Whispering Woods](#the-whispering-woods-w15)) |
| `cliffs` (`cliffs.js`) | cliff road, lighthouse, cliff base | `cliffs` | town |
| `highlands` (`highlands.js`) | 5 shelves up to the lair | `highlands` (W19) | hidden path `h`, `gate: 'climbersAlmanac'` (opened for good, see [The highlands](#the-highlands-w19)), then 4-tile chasms |
| `shipwreck` (`beach.js`) | the wreck offshore | `shipwreck` (W17) | `rafting` |

- **Regions:** `VL.defineRegion(id, { screens, place })` tags
  screens; `VL.regionOf(area, key)` and `VL.regionVisited(state, id)` read
  them. A place lock W8 claims is reached on entering its region (the
  Woods' `woodsPaths`; their heart, `woods`, on reaching the Hollow Oak
  clearing, 7,-2).
- **The Woods maze:** `VL.WOODS_ROUTE` lists the route screens in order.
  `VL.WOODS_WRONG_EXITS` lists the three wrong exits (`{ from, side, back }`):
  each leads into one or two look-alike screens that wind back to `back`, a
  route screen no further in than `from`. They are plain loops, with the
  copied map or without it (W34).
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
  included (`chickenLair` east of the last chasm), or within walking
  distance of it: the highlands' middle shelves (-1,-3, -2,-3, -2,-4) have
  one chicken between their two chasms (`chickenHighlands` on -2,-3, W41),
  carried to whichever chasm he wants (`tests/w41-overworld.test.js`). W7
  keeps a chicken at each spot (it respawns there if carried off or lost),
  so nowhere becomes one-way.
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
  colors: { hair, hairLight, top, topDark, topLight, legs, hat, hatLight, skin, skinShade, temples } })`
  makes the 12×14 sprites `npc-<look>-<facing>-<0|1|2>` like the hero's. Built
  in: `elder`, `fisher`, `gardener`, `townsfolk`. `skin`/`skinShade` default to
  the hero's `skin`/`skinShade` (W39 adds `skinBrown`/`skinBrownShade`, and
  `npcBlack`, `npcBlackLight`, `npcGray`); `temples` (short head only) grays
  two hair pixels beside the face in each facing. Mr. Fenwick (W39): warm brown
  skin, black hair gray at the temples, navy; his show puppet
  (`puppet-librarian`), marionette and painted head in the workshop match.
  The puppet and the marionette keep their gray to one pixel at each temple
  and wear no glasses, so the gray never joins up into a band.
- **Where the talk box goes** (`VL.dialogueSide`, W39): on the half of the
  screen away from the one speaking, so the box flips as a conversation
  passes between people (Mrs. Fenwick on her gallery: low; Mr. Fenwick on the
  hall floor: high), and never over the speaker. The hero decides only when
  nobody on screen speaks (away from the hero), or when the speaker's far half
  would cover the speaker. The speaker is the room's `npc` whose name is on
  the box, or decor that stands for one: `{ type: 'decor', ..., speaker:
  '<npc id>', speakerBox: { x, y, w, h } }` (tile pixels, as drawn). Speaker
  names go through `VL.popupText`. `tests/w39-finale-talk.test.js` checks the
  drawn box against the drawn sprites in the hall, the workshop, the library
  and town. Shops use their own full-screen panel, so this doesn't apply.
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
flashes) when the purse is short. Esc or X (W36, as on the equipment view
and the maps; a small X sits on the Leave row) backs out of the question,
then leaves.

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

- **One price table:** `VL.TUNING.prices` (paper: 2 shells at the mill and,
  since W36, `storePaper` 3 at the General Store; berries bought and sold, the
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
  under way). Sand takes any shovel; grass, the road (`path`) and the Woods
  floor (`moss`) only the metal one (`digsDirt`, W38 for the last two, which
  hide what grass does). A hole keeps its ground's flag and is never solid,
  so a dug doorstep or gate path still reads and walks as path; gates,
  doors and bridges are none of those grounds and refuse the shovel.
  A hole is the visit's tile (`VL.DIG_HOLES`, `@` sand, `*` grass, `=` path, `~` moss, through
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
  Ledger swaps in the smith's cheaper metal offers and (W34) tells of a
  rumour of ore on the old shipwreck, marking it over the wreck's hatch on a
  drawn map, gleaming, until the hold's ore is found;
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
  path on 5,-2 (well away from the secret ore on 6,-1); the Smith's Ledger
  on the lake island; the Tide Tables and (W34, swapped with the Captain's
  Logbook, which now lies at the Hollow Oak's clearing) the Chicken Keeper's
  Almanac on the shipwreck's deck (by raft, after the shockwave, nearer the
  highlands it opens); A Child's Book of Dragons in the highlands, on the
  way to the Mirror Shield. Their locks' `needs` say so, and
  `tests/overworld.test.js` checks each spot against them. **W30's late
  books** are twelve more untitled books in trunks (`regions/finds.js` gives
  their locks). **W34 (Matthew: far too many in the highlands)** left only
  two books up there, A Child's Book of Dragons and Ashton Co-op
  (`bookLairA`, by the lair's door: "Adventures in learning! Or maybe just
  adventures. Who knows?"), and spread the rest, ids unchanged so old saves'
  found flags still match: two in the Woods (5,-1 and the wrong turn 6,0),
  `bookHighlands` under a rock at the cliff base (-1,0), two below the
  wreck's deck (bilge, cabin), and four in the Lighthouse, a room apiece
  (entrance, stairwell, store room, cistern: on the way to the binding, so a
  kid who skips the optional lake island still finds them). No screen holds
  more than two books (`tests/playtest-4.test.js`). That makes 19 books before
  the shockwave (the 12-book boots there, the purse after), 29 before the
  binding (the purse at 20 well before its 40 shells) and 35 in all (the
  heart at 30). A later item (W18's Lighthouse,
  W19's lair) may add more the same way: a spot, a lock supplying
  `books: 1`, a `defineBook`.
- **Rewards:** `TUNING.libraryRewards` (12 the Swiftfoot Boots, 20 the Big
  Shell Purse, 30 a heart container; W36, was 10 heart / 20 purse / 30
  boots, and 5/10/15 before W30), books returned ever, given in count order,
  each once by id (`reward:<id>`), so a save that got a reward under an
  older count keeps it and is never given it twice: a save that got the
  heart at 10 gets the boots on its next visit once it has 12 and no second
  heart at 30; the W26 save that got the purse at 5 gets the boots at 12,
  nothing at 20 and the heart at 30 (`tests/fixtures/save-v1-W26.json`).
  His words are `VL.rewardSpeech(state, id)`: `VL.REWARD_SPEECH[id]` at
  exactly the count ("Twelve books"), and a first line without a number when
  one hand-in jumps past it, so it never contradicts the tally. The purse raises
  `TUNING.shellCap` (15 whole shells, W29) to `shellCapPurse` (50 since
  W34, was 250). Every price in town fits the first purse except the
  binding (40 shells since W34, so the purse comes first: the
  `climbersAlmanac` lock needs `shellPurse`, and the librarian's hint for it
  says so while the purse is missing); a test checks. `VL.addResource` stops
  a gain at the cap (`VL.RESOURCE_CAPS.shells`, whose `over` shows the
  `purseFull` popup once: who might help), and a purse already over it (an
  old save with up to 250) keeps what it holds until spent below 50. A shop
  trade at the cap is refused instead ("Your purse is full!"), so no wood or
  berry is lost. The boots carry `speed: TUNING.swiftfootSpeed` (2, so 94
  px/s against the walk's 47 since W34) on their item and `VL.heroSpeed(state)`
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
- **Reading one again (W36):** the game knows what is on the shelves:
  `VL.booksOnShelf` is `library.returned` less `library.gone`. After any talk
  with him (a `talk` event for `librarian`, then `state.libraryOffer`, play
  state) and once his beats are done, the `librarianShelf` system opens the
  `libraryShelf` scene when `VL.rereadable(state)` (on the shelf, and an
  untitled book or one already read) is not empty: "No, thank you" first,
  then the books (`VL.shelfRows`), up/down, S/Space/Enter, X or Esc back. A
  pick opens `reading` with `{ book, again: true }`, which reads
  `VL.rereadWords(book)` (`reread`, else `reading`, else the blurb) and skips
  `VL.finishReading`, so nothing is given or changed. The sealed Register has
  its own `reread` so it never hands over the key again, and so do the
  Herbalist's Notes and the Smith's Ledger (no second map mark or discount
  promised). X also leaves a re-reading. A vanished book is not offered.
  With egg on his face (W38) the egg line replaces his talk and sends no
  `talk` event, so nothing is handed in and no shelf is offered.
  The shelf, the shop and the equipment view show "more this way" with the
  same small gold triangles (`VL.ART.moreArrow`).
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
  grinds `TUNING.berriesPerInk` berries (5 since W41: one ink draws a whole
  map) into one ink (`VL.makeInk`), one grind per `TUNING.grindSeconds`,
  drawn with the hero. Fewer berries: a message naming how many it takes.
  A bush gives `berriesPerPick` (2) and regrows once he has been away, so an
  ink is three picks; the store's berries make it 15 shells.
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
  like a chest. With `keptOnLeaving: true` (the Mirror Shield, W42) the item
  is his at once but counts only once he walks off that screen alive: until
  then the saved field `pendingChest: { id, item, area, screen, hands }`
  holds it (fixture `tests/fixtures/save-v1-W42.json`). A faint there, or a
  reload or Save & Quit → Continue before he leaves, puts it back
  (`VL.returnPendingChest`: the item and `found:<id>` gone, the hands as they
  were before it, the chest shut and full again), and the faint screen says
  "The Mirror Shield slipped back into its chest." above "Everything else you
  found is still yours." (`VL.faintLines`). Leaving the screen alive clears
  it (system `pendingChestKept`) and saves. A save without the field, or one
  that already owns the item, has nothing pending.
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
                statue, door out          pot->switch->key B, ore    pot over desks->switch->gate,
                                                                     pot through gate->switch->boss key
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
  A can't be wasted on door B. Throw puzzles: a pot over the pits onto a
  switch (key B), and the copying hall's two switches (W42): a pot over the
  reading desks throws `d1SwitchDesk`, which lifts the gate (`d1ShutterNiche`)
  of a walled niche; a pot through it, over the niche's desk, throws
  `d1SwitchNiche`, which lifts the boss key's bars. Before the gate lifts no
  straight line from any tile he can stand on reaches the niche's switch
  (walls on three sides, the shut gate on the fourth), and no tile touches it,
  so neither a throw, a shot, the hook nor the sword can throw it first; even
  with the gate up only a throw does (the desk keeps the sword off). Both are
  saved in `switches`; every pot there respawns. A save from before W42 that
  had thrown the desk switch finds the gate up and the niche's switch to throw.
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

- **Without the copied map** (`woodsMapCopy`) the Woods are open to explore
  (W34, Matthew's fourth playtest: the old turn-back to the edge and its
  `woodsLost` popup are gone): every screen but the Hollow Oak's clearing
  can be walked to, and the Woods' ore and books lie on the open paths
  (lock `woodsPaths`, needs the east road). The librarian's hint still
  points at the Scriptorium's mural.
- **With the map** the first Woods screen says so (`woodsWithMap`: the copy
  shows the way, open it from E) and the copy blinks where the hero stands
  (`VL.woodsMapHere`). The scribes' blue marks on the trees are gone (W34:
  looking at the map is enough). The wrong turns still wind back
  (`VL.WOODS_WRONG_EXITS`).
- **The trees before the Oak (W29):** the pass from 7,-1 up to the Hollow
  Oak's clearing is a whole row of trees, one of them the gate tile `J`
  (`gate: 'woodsMapCopy'`, at `VL.WOODS_GATE_TREE`). Once the copy is owned
  it becomes a dirt path for good (`VL.saveTile` with an explicit screen),
  checked as each room is built and every step, so an old save that copied
  the map finds it open as it loads. This is the Woods' only lock (like the
  highlands' hidden path), and on the drawn map the path appears with the
  copy. `VL.saveTile(state, tx, ty, ch, { area, screen })` saves a tile on
  any screen.
- **Edge rules** (`engine.js`): `VL.defineEdgeRule(id, (state, area, from,
  to) => Place | null)` sends a crossing somewhere other than the neighbour.
  `systems/movement.js` follows it and pushes `{ type: 'edgeTurned', rule,
  from, to }`; a chicken flight stops short of such an edge
  (`systems/chickens.js`), and the playthrough's `findPath` never crosses
  one. `VL.edgeTurn(state, area, from, to)` asks. No rule is defined since
  W34 took out the Woods' turn-back; the hook stays for a later gate.
- **Pathfinder fix:** `findPath` asks `passable(state, entity, area)` with the
  entity's own area, so a route planned from the overworld into a dungeon
  reads that dungeon's shutters and doors (`VL.dungeonCondition(state, cond,
  { dungeon })`).

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
- **Light enemies are reeled in (W38):** an enemy whose definition says
  `light: true` (slime, bat, gull, beach crab) is dragged back with the rope
  (`phase: 'reel'`, under the arrival hold so it thinks nothing and is
  harmless) to stand `ropePullGap` px before the hero's middle, in the
  sword's reach, then stunned (`VL.stunEnemy`, `ropeStunSeconds`, the
  slingshot's stars) and calm a little longer. Arriving costs him
  `ropePullDamage` half hearts as a `sure` hit (`VL.hurtHero` past the
  shield and the invulnerability, `knock: false`). `VL.moveEnemy` moves it,
  so a walker stops at a wall or water, stunned there, and then he is not
  hurt. An optional `onPulled(state, enemy)` settles it (the gull drops low,
  then climbs home).
- **A chicken** the hook reaches (standing on the ground) sends back an egg
  for his face (`VL.ropeHitsChicken`, `VL.splatEgg`; see Egg on his face).
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

## Egg on his face (W38)

Matthew's Easter egg, in `systems/egg-on-face.js`. The rope's hook at a hen
brings back an egg that splats on the hero's face (`state.room.egg`, so it
lasts the visit: an edge, a door, a warp, a faint or a reload clears it, and
it is never saved). The hen is not hurt and no swarm comes. When a new
screen replaces the egged one, an arrow still held is ignored until it is let
go (`state.eggWorn` sets `state.warpHold`), so the reversed key he walked off
with doesn't walk him straight back.

- **Back to front:** the action filter `eggOnFace` swaps up and down, left
  and right, and the two hands, so Space uses the off hand and D the main
  hand. `VL.defineActionFilter(id, filter)` (`engine.js`) sits between the
  input and every system (`VL.filterActions`); a filter returns a copy and
  never touches key handling, so touch controls get the same trick.
- **Everyone says so:** `VL.overrideTalk(rule)` (`talk.js`) lets a rule say
  something instead of a person's own lines; while egged every NPC,
  shopkeepers and the librarian too, says only `VL.EGG_WORDS` ("Looks like
  you have some egg on your face, {name}.") with no shop, gift or hand-in.
- **Drawn over him** (hero layer `eggOnFace`, `fx-egg-face-<facing>`), never
  in the hero's sprites, so any outfit wears it. Sound: `eggSplat`. The
  splat follows the sprite `VL.ART.heroFrame` picks, not `player.facing`
  (`hero-hold` faces the camera), and sits inside W37's face box, clear of
  long hair, in every look ("Hero look (W37)").

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
  tangle N (-1,-2)    great hollow (0,-2) --door A-- rope vault (1,-2): the rope
  key A (cleared)          | door C                   | pits, posts both ways
  tangle S (-1,-1) -- root hall (0,-1) --ledge-- pit garden (1,-1): key B on an island
  map                      |                          | door B
  moss room (-1,0) -- entrance (0,0) --bars-- sap well (1,0): switch + boss key on an island
  key under all the grass  statue, door out to 7,-2
```

- **The way in:** W8's `hollowOakDoor` spot in the clearing (7,-2) is a
  plain door; the Woods are the gate.
- **Metal gear (W30):** the tangle's two thorny spitters (`tough: true`)
  fall only to the metal sword, and key A (`reveal: 'cleared'`) appears once
  both are beaten. West of the entrance, the moss room's odd patch of grass
  (`,` grass, `*` its dug hole) hides a small key (`d2KeyMoss`) that only
  the metal shovel digs up; no sign says so. **W42:** it is
  `reveal: 'dugAll'`: it comes up in whichever of the 18 grass tiles is dug
  last in one visit (`systems/digging.js`), not from any one tile. The holes
  are the visit's (`VL.setRoomTile`), so leaving partway, or leaving with the
  key up but not taken, starts the patch over; once taken it is found for
  good. The other digs keep the ordinary grass table (a whole shell 15% of
  the time). The room holds nothing else, so nothing can stand on a tile.
  Door C (`d2DoorC`) stands between the root hall and the great hollow, so
  both keys are spent on doors C and A. Juniper in town mentions the metal
  shovel and grass between Dungeon 1 and Dungeon 2. A save from before W30
  that had opened door A finds door C open, with a key given for it, so its
  keys in hand are unchanged.
- **The order:** key A lies deep in the tangle (two rooms of roots;
  the map in a nook of the south one), door C opens the way up, door A opens the vault, the big chest
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
  (adds `d2BossDoor`; W30 plans it with `metalSword` and `metalShovel`) with
  `replan`; adds `d2KeyA` (needs `metalSword`), `d2KeyMoss` (needs
  `metalShovel`), `d2DoorC`, `d2DoorA`, `d2KeyB`, `d2DoorB`, `d2BossKey`,
  `d2BossDoor`. Ids are `d2…` (and `heartD2`). The playthrough earns both
  metal tools for real first (`tests/metal-gear-route.js`: berries sold for
  shells, the shallows ore, the shovel, the meadow's buried shells, the
  sword with the Scriptorium's ore).
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
  `shockwave` scene. Since W30's boss gate keeps the hero in the den until he
  takes the heart, in play the knock-out always follows the heart; only a
  Save & Quit before taking it (Continue starts at the statue) can still
  leave the Oak without it. Leaving the Oak without the heart starts it outside, and
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
- **The climb back:** after the shockwave the home corner
  (`VL.SHOCKWAVE_QUIET`: 0,0, 1,0, 0,1, 1,1) has no enemies until the
  Lighthouse is first entered (`VL.shockwaveQuiet`, W38; before, a sword
  brought them back), which is what Gran's "quiet for a good while" says. A pull
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
  (3 wood). Either one; sold out once owned. Both offers stay `hidden` until
  the shockwave, like Nell's raft (the `oar` lock `needs` adds `shockwave`,
  with `replan`), so the first purse goes on gear he can use. A raft with no oar: pushing
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
  the island and the wreck done, saved by the hold's lantern, which now wakes
  him on the harbour).
- **Locks claimed:** `raft` (`needs` adds `town`, with `replan`), `oar` (`needs` adds `shockwave`, with `replan`),
  `rafting` (`renewable` with `replan`: sailing is access, see Progression),
  `lakeIsland` (a visit to 3,-3), `oreLakeIsland`, `shipwreck` (a visit to
  5,2), `oreShipwreck`, `pageShipwreck` (see the wreck below).
- **Sounds:** events `raftLaunch` (`raftSplash`), `raftLand` (`step`),
  `raftPaddle` (`raftPaddle`, every `TUNING.raftPaddleSeconds` while moving).

## The shipwreck (W17)

The mini-dungeon below the wreck's deck (design: The world, Shipwreck), in
`dungeons/shipwreck.js` on W13's framework (dungeon `wreck`, area `wreck`, no
boss). The raft lands only at the stove-in side (3,6 → 4,6 on 5,2); the
Tide Tables' trunk is on deck and the hatch (W8's `shipwreckHatch`, on the
deck's south row at 8,6 since W34) leads down; the ladder brings him back up
north of it (8,5) facing up, so holding Up out of the hold never loops him
back in.

```
  hold (0,0): ladder up, lantern ── locked door ── captain's cabin (1,0): the page, 5 shells
       │
  bilge (0,1): flooded; posts across to the key's chest and the ore
```

- **The hold:** the ladder back up, a lantern on the way down (a faint or a
  reload wakes him there, and he can always climb up and sail home), two
  crabs. Once the page is found the wreck is done with, and the lantern
  hands its save point to the harbour by the pier (`VL.WRECK_HOME`, through
  `VL.moveSavePoint`), so no Continue or faint starts below deck at sea.
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

## The Slingshot (W18)

`systems/slingshot.js` (design: The path through the game, 6: "broken shells
as ammo (hit far switches, stun enemies)"). Tests: `tests/lighthouse.test.js`.

- **The item** `slingshot` goes in a hand (E); the big chest in the
  Lighthouse's store room holds it. Its key fires one broken shell
  (`VL.fireSlingshot`, `inventory.brokenShells` minus one, earned) straight
  ahead from the hero's middle, `TUNING.slingshotTiles` (10) tiles at
  `slingshotSpeed`, one shot per `slingshotCooldown`. The shell
  (`{ type: 'slingPellet', gx, gy, dx, dy }`, play state, drawn at its pixel
  `gx, gy`) flies over pits, water, chasms and low tiles and stops at walls,
  solid things and the screen's edge. With no broken shells it fires nothing
  and says where to find some (the beaches; W35 took the Lighthouse's heaps
  away, as broken shells pile up from the beaches and digging anyway).
  The HUD writes the broken shells left in the slingshot's slot.
- **What a shot meets:** an entity whose type has **`onShot(state, entity,
  pellet)`** answers it (a `shellTarget` is thrown, a `beamMirror` turns), a
  W13 `switch` is thrown; an
  enemy whose definition has `onShot` answers it (the Lens Crab), any other
  enemy is stunned (`VL.stunEnemy`: W6's arrival hold, so it stands still and
  is harmless for `slingshotStunSeconds`, stars over its head, no damage, so
  W29's `weapon` argument to `VL.hitEnemy` never comes into it).
- **Targets across gaps:** `{ type: 'shellTarget', id, x, y }` (solid) is a
  switch only a shot throws, saved in the dungeon's `switches` like a
  lever, so a shutter opens on `{ switch: id }`. S only describes it, and
  neither the sword nor the rope's hook throws it, so what it opens stays
  behind the Slingshot.
- **Sounds:** events `slingFire`, `slingTink`, `slingHit`, `slingStun`,
  `slingEmpty` (`bump`).

## Dark rooms (W18)

`systems/darkness.js` and `entities/glow-lamp.js` (design: The path through
the game, 6: "The Glowstone lets you enter", "dark floors").

- **`VL.defineDarkRooms(area, screens)`** names dark rooms. In one, the
  `darkness` hero layer (front pass, under the light's vignette and the keys
  HUD) covers the room past a circle round the hero: `TUNING.glowInner`
  (40 px) clear, fading to black by `glowOuter` (84 px) with the Glowstone
  (`VL.hasItem(state, 'glowstone')`, W16's worn item), a hand's breadth
  without (`VL.glowRadius`).
- **Never a guessing game:** past the light, keys, switches, targets,
  mirrors, lamps, chests, locked doors and closed bars glint
  (`VL.DARK_GLINTS`, or `glintsInDark: true` on an entity type), a
  creature shows two red eyes, and anything `glowsInDark` (the beam's
  source, a lit crystal, a shell in flight) is drawn over the dark. The beam
  itself is drawn after it.
- **Lights:** an entity type with `lightsRoom: true` (`glowLamp`,
  `beamCrystal`) counts as one of the room's lights; once every light in a
  room is `on`, the room is lit for good (`VL.roomLit`, `VL.roomIsDark`).
  `{ type: 'glowLamp', id, x, y }` (solid): S with the Glowstone lights it,
  saved in the dungeon's `switches` (`VL.throwSwitch`); without it, it stays
  cold. A dark room with no lights stays dark.
- **Sounds:** `lampLit`.

## The beam (W18)

`entities/beam.js` (design: The path through the game, 6: "mirrors that
bounce the lighthouse beam").

- `{ type: 'beamSource', x, y, dir }` shines a beam along its row or column
  over floor, pits and water; `{ type: 'beamMirror', x, y, turn: '/' | '\\' }`
  bends it a quarter turn (`VL.reflectBeam`); S or a shot turns the mirror
  the other way, for this visit only (back as found on re-entry, so it can
  never be left stuck); walls, solid things and closed bars stop it; the
  hero never does. `VL.beamPath(room, source)` gives its `points` and the
  `crystal` it reaches; `VL.roomBeams(room)` every source's.
- `{ type: 'beamCrystal', id, x, y }` the beam reaches is lit for good (the
  `beams` system, order 42, through `VL.throwSwitch`), so a shutter opens on
  `{ switch: id }`, and it lights a dark room.
- A mirror on an island (no floor beside it) can only be turned by a shot.
- **Sounds:** `mirrorTurn`, `crystalLit`.

## The Lighthouse (W18)

Dungeon 3 (design: The path through the game, 6), in `dungeons/lighthouse.js`
on W13's framework, with its boss in `entities/lens-crab.js`. Tests:
`tests/lighthouse.test.js`; its play, lock by lock, is
`tests/lighthouse-route.js`, strung into milestones by
`tests/steps/w18.steps.js`. Fixture: `tests/fixtures/save-v1-W18.json`
(played from the W16 save through to the Lens Crab).

```
                       lamp room (0,-3): the Lens Crab
                            | boss door (oneWay)
  map stair (-1,-2) -- gallery (0,-2) --door B-- workshop (1,-2): 3 mirrors -> crystal -> boss key
  dark floor, shell chest   | bars (stair target)
                       stairwell (0,-1) --door A-- store (1,-1): the Slingshot
                            |                         | bars (store target)
  cellar (-1,0) ----- entrance (0,0)              cistern (1,0): 2 mirrors -> crystal -> key B
  dark floor, map, key A   statue, door out
```

- **The map (W38):** `d3Map` lies on the cellar's dark floor, on the way to
  key A, so it is found early as in the Scriptorium and the Hollow Oak; at
  the top of the map stair it came when only the workshop and the lamp room
  were left, and the map hardly showed a room he had not seen. The map
  stair keeps a chest of five broken shells (`d3ShellChest`) for the
  slingshot.

- **The way in:** W8's `lighthouseDoor` spot on the headland (-1,1) is a
  `door` with `needs: 'glowstone'`: without the Glowstone it is solid and
  says it is pitch dark. The headland has no gull, since the warp out after the
  boss lands on its doorstep.
- **Dark rooms:** the cellar, the cistern, the gallery, the map stair and
  the workshop. The cellar and the map stair are dark floors (one narrow way
  between pits) with two lamps each; the gallery has two lamps; the cistern
  and the workshop light up with their crystal.
- **The order:** key A at the end of the cellar's dark floor opens door A,
  behind which the big chest holds the Slingshot (mid-dungeon). Only then:
  the store's target lifts the bars into the cistern (key B behind the
  crystal's bars), and the stairwell's target lifts the bars up to the
  gallery (door B, the boss door). Key A can't be wasted: door B lies past
  the stairwell's target. The workshop's crystal lifts the bars on the boss
  key. The boss door also wants a sword and
  `TUNING.lensCrabShellsAtDoor` (12) broken shells on every entry until the
  crab is beaten (`VL.LIGHTHOUSE_SHELL_WORDS`), since the lamp room has no
  shells of its own and its gate shuts behind him.
- **The Lens Crab** (`lensCrab`, `rooted`, `size: 'big'`): it scuttles along
  the top of the lamp room after the hero (`scuttle`), and every
  `lensCrabGlintEvery` the lens glints (`glint`) and throws a bolt of light
  at him (a `small` projectile: the wood shield blocks it). A sword clinks
  off the lens (`VL.LENS_CRAB_SWORD_NOTE`); a shot flying up at its face
  shuts the nearer open eye (`eyes`, open again after
  `lensCrabEyeSeconds`), and with both shut it is `dazed` (harmless) for
  `lensCrabDazedSeconds`; then the sword takes the round's `life`
  (`lensCrabRoundLife`, 2: two wood hits or one metal; `hp` is refilled on
  every hit). A shot from above or the side bounces off. Three rounds; each
  round taken (or a daze that runs out) is `recover`, then eyes open. After
  the third it is `dying`, then marked `defeated` before it leaves.
- **Rewards** (`boss.onDefeat`): a lump of ore (`oreLighthouse`, ore + 1)
  and the last loose page (`VL.findPage(state, 'pageLighthouse')`), held up
  together (`VL.holdUp`), and a message; the framework adds the heart
  container `heartD3` where the crab began, and the warp out once it is
  taken. The lamp room's boss gate (`lighthouseBossGate`, on the boss door's
  landing (7,10)) is the framework's too (W30). W11's thief
  takes the Primer on the next library visit once `d3Boss` is reached.
- **Thorny slimes (W35):** the stairwell's and the gallery's slimes are
  placed `tough: true` (drawn with woody thorns, like the Woods' spitters):
  only the metal sword beats them, and nothing needs them beaten.
- **Locks:** claims `lighthouseEntered` (a visit to the entrance) with the
  planned rule, and `slingshot` (`needs` adds `d3DoorA`) and `d3Boss` (adds
  `d3BossDoor`) with `replan`; adds `d3KeyA`, `d3DoorA`, `d3KeyB`, `d3DoorB`,
  `d3BossKey` and `d3BossDoor` (needs `brokenShells` too, as the door's
  `wants` says); its broken shells come from the beaches
  (`beachBrokenShells`). Ids are `d3…` (and `heartD3`, `oreLighthouse`,
  `pageLighthouse`).
- **Sounds:** events `crabEye`, `crabDazed`, `lensGlint`, `lensBolt`
  (`slingFire`), `crabTink` (`slingTink`).

## The highlands (W19)

The way up (design: The path through the game, 7), in
`systems/climbers-almanac.js`. Tests: `tests/highlands.test.js`; the
played route is `tests/highlands-route.js`.

- **The Climber's Almanac** (`climbersAlmanac`, a worn item): Miss Quill's
  binding (W10's `bookbinder` shop sets `pagesBound`) is turned into the
  book on the next step of play, held up with its popup. A save bound before
  the book existed gets it the same way. The lock `climbersAlmanac` is
  reached by owning it (planned rule kept: the bindery, shells, 5 pages).
- **The hidden path:** `VL.HIDDEN_PATH` names the two `h` tiles on the cliff
  base (-1,-2, (10,4) and (10,5)). Once the Almanac is owned they become `i`
  (a cleft with footholds, passable, `hiddenPathOpen` art) for good with
  W13's `VL.saveTile` on that screen, checked as rooms are built and every
  step, so `VL.isSolidAt` with the room, the pathfinder and the drawn map all
  see the path. The first time he stands on the cliff base with it open, the
  `hiddenPathFound` popup says so.
- **The chasms:** W7's chickens do the rest. A chicken waits at each spot
  on every visit (`chickenLedge` below the first chasm, `chickenHighlands`
  on the middle shelves and `chickenLair` beyond the second); F next to
  one with the Chicken Keeper's Almanac read flies the four-tile gap (`chickenFlightLong` from `VL.TUNING`), crossing the
  screen edge mid-air, and he lands still carrying it. Without the Almanac
  read the flight falls short and flaps him back, unhurt. The tests fly every
  highland chasm both ways from the real spots.
- **`highlands`** is reached on visiting any highland screen (place
  -1,-3); its planned rule is kept (cliffs, the Almanac, the long flight).
- **Playthrough:** the `climbersAlmanac` step gathers the last two pages
  (the field by the library, Henrietta carried home to Pip), opens the
  Chicken Keeper's Almanac's trunk (on the wreck's deck since W34), opens
  trunks along the way until 20 books earn the Big Shell Purse (W34), hands
  every book in and sits through the readings, sells berries for the
  binding's 40 shells and binds;
  `highlands` climbs the path and flies the ledge's chicken over.

## The Dragon's Lair (W19)

Dungeon 4 (design: The path through the game, 8), on W13's framework.
Files: `dungeons/lair.js` (8 rooms, tileset with lava `~`, a pit nothing
flies, the door spot `lairDoor`, the hoard, the locks), `systems/fire.js`
(fire and the Mirror Shield), `entities/fire-spout.js`, `entities/dragon.js`.
Tests: `tests/lair.test.js`, `tests/lair-route.js`, `tests/steps/w19.steps.js`,
and the lair in `tests/playtest-3.test.js`'s boss-gate loop. Fixture:
`tests/fixtures/save-v1-W19.json`, the real playthrough's save after the
Dragon (the heart taken, out through the warp, so the save point is the
lair's doorstep, -1,-5, and Continue starts at the hut: W31).

```
                       hoard (0,-3): the Dragon
                            | boss door (oneWay, wants the metal sword)
  ledge (-1,-2) ------ great cave (0,-2) --door B-- forge (1,-2)
  spout -> key B, map       | bars (the hall's spout)   block, spout -> boss key
  shield room (-1,-1) --door A-- hall (0,-1)
  lava, the Mirror Shield        |
  cellar (-1,0) ------- entrance (0,0): statue, door out
  block on plate -> key A
```

Order: key A (a block shoved onto a latching plate), door A, the Mirror
Shield; the hall's stone head choked (the great cave), the ledge's (key B),
door B, the forge's (a block shoved out of its line first; the boss key),
the boss door, the Dragon.

- **Lava** (`~`, W35): the hero may walk on it (hero footing `lava`); each
  step onto a lava tile takes `TUNING.lavaDamage` (half a heart), standing
  still on it is safe, and there is no timer (system `lavaBurns`, faint line
  `lava`). To everything else it is still a solid pit: blocks, enemies,
  knockback and chickens stay off it, fire crosses it. A chicken flight or
  the rope's pull never burns him (`lavaBurns` skips both; the hook can't
  land him on lava, which is solid to it). It opens no new ground (a test
  labels the floor's stretches with every gate as a wall and checks no
  lava step joins two), and the
  playthrough's planner never walks on a tile that `hurts`.
- **The shield room (W42):** lava from wall to wall but for the square
  inside door A (14,5) and the big chest in the far corner (1,1); no enemy,
  no post. Every heart container in the table (start 6 + 7 x 2 = 20 half
  hearts) is less than the round trip: at the fewest, cutting every corner,
  12 burns there and 11 back (23); walked along the walls, 16 and 15 (31).
  So he eats berries on the way (standing still on lava is safe, and E then
  S eats); the first highland shelf's bush grows back each visit. The
  shield counts only once he walks out alive (Matthew's call): its chest is
  `keptOnLeaving`, so a faint on the lava, or a reload before he leaves,
  puts it back in the chest and he wakes at the statue without it (see the
  gloves' bullet under "Lifting"). The `mirrorShield` lock is reached only
  once it is no longer pending. The playthrough stocks berries at that bush
  on the way up and walks back out through door A (`tests/lair-route.js`).
- **Fire** (`VL.spawnFire(state, { cx, cy, vx, vy, owner })`, entity
  `dragonFire`): flies straight over floors, pits and lava; walls and solid
  things stop it (`VL.fireStops`). It hurts `TUNING.fireDamage` (a full
  heart) with size `fire`, which no wood or metal shield blocks (a raised one
  says `VL.SHIELD_FIRE_NOTE`). The **Mirror Shield** (`mirrorShield`, off
  hand, `shieldBlocks: ['small', 'big', 'fire']`) raised towards a ball
  bounces it home: it flies back at its `owner` (homing) a little faster, and
  the owner's definition answers `onFire(state, owner, ball)`.
- **Stone heads** (`{ type: 'fireSpout', id, x, y, dir }`, solid,
  `isSwitch`): breathe a ball `dir`-wards when the hero is in their line with
  nothing that stops fire between (`VL.spoutSees`), the mouth glowing
  steadily first. Their own fire bounced home throws them for good (saved
  in the dungeon's `switches`, so the bars they name stay up); the sword, a
  shot, the rope and S do not. Each sits in a wall or across lava.
- **The Dragon** (`dragon`, `rooted`, `size: 'big'`): paces the back of the
  hoard after the hero, draws breath (`inhale`, its chest glowing) and
  breathes a ball at him. The sword clinks off, saying nothing (W35);
  its own ball bounced home dazes it (`onFire`), and then a **metal** sword
  strike counts (a sword in `TUNING.toughSwords`; `onHit` gets the weapon;
  wood and throws clink) and wakes it (`recover`), so every strike needs its
  own ball bounced home. `TUNING.dragonRoundLife` (4: two metal strikes, W43,
  Matthew: twice the life) ends the round. Three rounds, each quicker (`dragonSpeedUp`); the third ends in
  a puff of smoke (`defeated`, then gone). Nothing about it blinks (its hp
  is refilled and `hurt` cleared on every hit; a hit shakes it), and the
  flash guard samples the fight. A hit that counts (W35) tints it pale pink
  for `dragonHitTintSeconds` (0.4 s, sprite `enemy-dragon-hit`, one change
  each way, not a saturated red) and plays `dragonOuch` (event `dragonHurt`).
- **Trickier round by round (W35, Matthew's decision):** `VL.dragonRound(d)`
  is 1, 2 or 3. Round one is as before (`prowl`: pace after him, one ball).
  Rounds two and three fly between `dragonPerches` (x 64, 128, 192, the one
  nearest him that it isn't on) at `dragonPerchSpeed`, rest `dragonPerchRest`,
  draw breath, and stay `dragonPerchLinger` after breathing (mode `perch`).
  Round two breathes a pair, the second `dragonVolleyGap` (0.55 s) after the
  first and aimed afresh (mode `volley`). Round three draws a longer breath
  (`dragonFanInhaleSeconds`, 1.2 s, purple glows growing either side of the
  chest) and breathes a fan: the middle ball aimed at him and two **wild**
  balls `dragonFanSpread` (0.45 rad) either side, purple (`fx-fire-wild-*`),
  which no shield bounces or blocks (size `wildFire`), so they must be
  dodged; they fly wide of a hero who stands in the middle line. Two metal
  hits a round since W43 (six in all, twice W35's three), each round keeping
  its own attack for both; a faint rebuilds the room, so the fight
  starts again at round one.
- **The hoard spills** (`onDefeat`): the `lairHoard` decor turns from a
  mound behind the Dragon into books strewn over the floor (and stays so),
  and he carries three of them home (`VL.HOARD_BOOKS`, found with
  `VL.markFound`, held up, `VL.HOARD_WORDS`). `d4Boss` therefore supplies
  `books: 3` (replan), like the Bookworm's bundle. The heart waits where the
  Dragon began; W30's boss gate and the warp work as in every dungeon.
- **The guards (W35):** two thorny spitters (`tough`, `guard`, at
  `VL.LAIR_GUARDS.at`) stand by the cave mouth on overworld -1,-5 until the
  metal sword beats them, which sets the flag `lairGuards` for good. The
  cave door (`lairDoor`, `shutUntil: 'lairGuards'`, a `door` option) is shut
  until then and says `VL.LAIR_GUARD_WORDS`; a wood sword clinks with W30's
  "Clink!" word, so he learns what the Dragon needs before its gate shuts.
  Only guards whose hp ran out count, so a room the playthrough cleared never
  opens it. They stand out of line with the doorstep. A save that beat the
  Dragon first gets the flag on its next visit. The playthrough forges the
  metal sword again before the climb (the shockwave took it).
- **Locks:** `lairGuards` (flag: highlands and the metal sword),
  `dragonsLairEntered` (place lair 0,0; replan: behind the guards),
  `mirrorShield` (replan: behind door A), `d4Boss` (replan: behind the boss
  door, the metal sword; the hoard's books), and one per key and door:
  `d4KeyA`, `d4DoorA`, `d4KeyB`, `d4DoorB`, `d4BossKey`, `d4BossDoor` (the
  metal sword, as the door's `wants` says, checked on every entry: an old
  save with the door open and only a wood sword is stopped at it).

## The finale (W20)

The path through the game, 9, and "Ending (decided)" in the design doc.
Files: `systems/finale.js` (the beats, the trapdoor opening, the claims),
`dungeons/workshop.js` (the rooms below, who stands where, every word said
there, the townsfolk's lines after the Dragon and after the ending),
`entities/marionette.js` (the three puppets and their strings),
`scenes/finale.js` (the ending and the credits); her last show and her kind
shows are in `scenes/puppet-show.js`. Tests: `tests/finale.test.js`,
`tests/finale-route.js`, `tests/steps/w20.steps.js`. Fixture:
`tests/fixtures/save-v1-W20.json`, the real finale played from the W19 save
through the credits and Continue (from before the books came home: it still
carries the hoard's three), and `tests/fixtures/save-v1-W33.json`, the same
with them home (`finale:booksHome`, `finale:home:<id>`). W33's tests: `tests/w33-finale-fixes.test.js`.

```
  tunnel (-1,-1) ── hall (0,-1): her gallery, the three marionettes
  rockfall              │
                    workshop (0,0): the ladder up to the square (2,0)
```

- **The beats** are saved flags, set as each one ends (`VL.FINALE_BEATS`):
  `trapdoorOpen` (the first step in the square once `d4Boss` is reached:
  popup, the hatch drawn open, her stage empty), `finale:followed` (Mr.
  Fenwick's words as the hero reaches the workshop), `finale:confronted`
  (hers from the gallery; the puppets hang still until then), `marionettes`
  (all three down), `finale:showAsked`, `finale:shown` (her last show,
  `VL.CONFESSION_SHOW`; Esc ends it with its flag), `forgiven` (her apology
  and his forgiveness; every book she took comes back: `library.gone`
  empties; and every book he carries, the hoard's three among them, is
  handed in (`library.returned`, so it counts on the card and towards the
  10/20/30 rewards like any book he brings home) and `finale:booksHome` is
  set). A save forgiven without `finale:booksHome` hands its carried books in
  quietly on the first step after loading (system `finaleBooksHome`), and its
  card already counts them (`VL.booksDueHome`); a book found after the ending
  is an ordinary find again. Each book the ending brings home is marked
  `finale:home:<id>` (`VL.endingBooks`). The first talk with Mr. Fenwick
  afterwards is his welcome home (gift `welcomeHome`, flag
  `finale:welcomedHome`): his words about those books, as at a hand-in, with
  anything carried since, then the visit's beats (a reward the hand-in made
  due). Esc skips each part. The beats after the fight play in the hall; once `forgiven`, the
  `ending` scene plays wherever he is. Nothing below is a save point and
  nothing shuts behind him, so a reload or a faint at any beat wakes him at
  his last save point (the hut: every dungeon is finished by then) and the
  next beat plays when he walks back down. `tests/finale.test.js` reloads
  after every beat and plays on to the credits.
- **Down and up:** the `trapdoor` entity (W11's, `entities/library-finds.js`)
  takes him down to `VL.FINALE.arrival` when he walks onto it once open, and
  is not `passable` to the pathfinder then; a `door` on the ladder (7,9)
  brings him back beside it. Mr. Fenwick follows him down: from the open
  trapdoor until she is forgiven, an `npc` `librarian` (talk
  `librarianFinale`) stands in each room below (`VL.FINALE.librarianAt`), and
  he is in his library as always. Mrs. Fenwick is off her stage from the
  Dragon's fall until she is forgiven (S at the stage: "The stage is
  empty", and the booth decor gets `empty`, so no little puppets bob in it); in the hall she works the puppets from the gallery (decor
  `wsPuppeteer`) and comes down to the floor in the pause after the last one
  falls (`VL.wifeComesDown`, beside the hero; on later visits she is there
  already; talk `wifeFinale`).
- **The marionettes** (`{ type: 'marionette', puppet: 'dragon' | 'hero' |
  'librarian' }`, flying, `rooted`, drawn at twice the art's size, under the
  hero; one he stands in front of, `VL.PUPPET_COVER`, eases to
  `VL.PUPPET_FADE.alpha` in a quarter of a second and back, its strings
  never faded, since the hero puppet wears his colours): they drift
  after the hero, wind up (a steady shake) and attack: the hero puppet lunges,
  the dragon puffs paper fire, the librarian throws books (both small, so a
  shield blocks them), half a heart each. They hover with their chests level
  with him (down to the bottom row, where he walks in), each on its own side
  of him and `VL.MARIONETTE_STANDOFF` away, so their strings are out of his
  reach until he steps in: standing still and mashing doesn't win. The sword
  only clonks (hp refilled,
  no hurt blink; after a swing that cut nothing, `VL.MARIONETTE_NOTE` once a
  visit). Each hangs from two strings (`VL.PUPPET_SHAPES`): a sword swing
  whose box crosses a string above its hand, or within `VL.STRING_SLACK` of it
  (the hand and wrist, and a little either side), cuts it, one string per
  puppet a swing, the nearest. So a swing from anywhere beside a puppet, his
  feet between its shoulders and its belt, cuts the string on that side
  (`VL.STRING_REACH` is the middle of that window). Once one string is cut, a
  swing through where it hung cuts the other, so a kid who always comes at a
  puppet from the same side still wins. A cut puppet jerks up out of reach (harmless for
  `marionetteJerkSeconds`) and sags slower; with both cut it drops into a heap.
  All three down sets `marionettes` (counted against the map's three, so a
  room the playthrough cleared of enemies never counts). Later visits show the
  heaps. A playthrough step that fights sets `drive.fight` before entering the
  hall.
- **After the ending** (`VL.libraryFull`, i.e. `forgiven`): the thief takes
  nothing (`VL.applyThefts` returns at once), every shelf is packed
  (`shelf.fill` 1) and, once `finished`, the gold book about the hero stands
  in the middle; her stage plays `VL.KIND_SHOWS` in turn (`VL.stageShow`);
  she, the librarian and four townsfolk have new lines, and the townsfolk have
  lines between the Dragon and the ending too.
- **The ending** (`scenes/finale.js`): the library staged with the town in it
  (`VL.ENDING_BEATS`, Matthew's script word for word since W39: the town
  carrying the hoard home as the shelves fill, Miss Quill's "The Adventures of
  {name}" going up, Gran's three cheers, everyone's cheer with a hop, the town
  writing its own books; the promise to visit her home town is now said in
  the hall, the last lines of `VL.FINALE_WORDS.forgiven`). Every box sits at
  the bottom: the speakers stand on row 5 and the shelves along the top stay
  in view, a fade, then `VL.CREDITS` rolling (S or Esc jumps
  to THE END; again goes to the title). `finished` is set and saved as the
  credits begin. Esc during the first fade-in or the beats skips to the
  credits (from the fade-in, the fade-out starts as dark as it was). No HUD is
  drawn over the ending (`VL.drawWorld(..., { hud: false })`): the strip stays
  dark.
- **Continue after the credits:** the slot shows FINISHED; Continue wakes him
  at his last save point before the finale (the hut) in the world after the
  ending (everything earned is kept, as always); the ending never plays again.
- **Locks:** `trapdoorOpen`, `workshop` (place workshop 0,0), `marionettes`,
  `ending` (`state.finished`), all with the planned rules. The playthrough
  plays from the title to the credits; `tests/progression.test.js` checks that
  its steps cover every milestone and every lock in the table is claimed.
- **Sounds:** `trapdoorOpened` (`trapdoorCreak`), `stringCut`
  (`stringSnap`), `puppetDown` (`puppetClatter`), `marionettesBeaten`
  (`dungeonBoss`), `finaleForgiven` (`libraryChime`), and the credits'
  `endingTune`.

## Boss life meter (W43)

`systems/boss-meter.js`: while one of the four dungeon bosses is fought
(not the marionettes), a meter with its name sits in the boss room's
bottom wall row, `VL.BOSS_METER` (play-area pixels, left of the boss gate
on the door tile). No boss, hero or exit is ever drawn there, and it keeps
clear of the keys readout, the HUD bar and the room's note; it hides while a
popup is up (so no box half-covers it) and during a screen slide. It is a
hero layer drawn in the `overlay` pass. `VL.bossMeter(state)` gives
`{ name, left, total }` or null: shown from the moment the hero is in the
room with the boss, empty while it goes up in smoke, gone once it is
beaten. Each boss's life comes from `VL.BOSS_METERS` (the Bookworm's hits;
the others' rounds of `life`). A hit's lost part shows lighter for a moment
and then drains away smoothly; nothing on it blinks (the flash guard).
Tests: `tests/w43-bosses.test.js`. No saved field.

## Boss hints (W35)

How to beat a boss is never told up front: no sign, no note on a wrong hit, no
librarian nudge says it (the clink is the only answer; W30's "Clink!" popup
for the thorny metal-only spitters stays, since they aren't bosses).
`systems/boss-hints.js` holds `VL.BOSS_HINTS` (`scriptorium`, `hollowOak`,
`lighthouse`, `lair`, `marionettes`): where the boss is fought (`at`), when
it's beaten, and Gran Ottie's words. A faint while `at` holds sets the flag
`bossFainted:<id>` (`VL.bossFaintFlag`); from then until the boss is beaten
her first entry is that hint (`VL.bossHintDue`). Her entries come from
`VL.bossHintEntries(ids)`: the dungeons' in `regions/townsfolk.js`, the
marionettes' in `dungeons/workshop.js` ahead of the town's Dragon talk. The
librarian's nudge before the first boss points to her; the Dragon's own hint
is in A Child's Book of Dragons.
Saved keys: `bossFainted:<id>` and the Lair's `lairGuards`, both in the
free `flags` map; fixture `tests/fixtures/save-v1-W35.json` (played to the
Dragon with the sword forged again and the guards beaten, then a faint to it).

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
  keeps it hidden until every enemy in the room is beaten; `reveal: 'dug'`
  until a shovel that digs its ground digs its tile (W30); `reveal: 'dugAll'`
  until every tile of the patch it lies under is dug in one visit, and then
  in the last one (W42, the Hollow Oak's moss room). `{ type: 'bossKey',
  id, x, y, lock }` likewise. From code (a chest, a drop, a script):
  `VL.giveSmallKey(state, dungeonId, n)` (counted in `keysGiven`),
  `VL.giveBossKey`, `VL.giveDungeonMap`; a chest holds one as
  `contents: [{ smallKey: '<dungeon>' }]`. A key that appears at runtime is
  one of those two things, a map key with `reveal` or `VL.giveSmallKey`,
  never a `smallKey` entity pushed into `room.entities` (it would be found
  but never counted, so `VL.dungeonPickup` throws on one). The keys in hand
  show over the play area while in a dungeon (`dungeonHud`, inside
  `VL.DUNGEON_HUD` at the top right; no room may draw anything there, which
  `tests/w32-polish.test.js` checks for every dungeon room; drawn in the hero layers'
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
  A door with `wants: { items: [...], note, has, hasNote }` also stays shut,
  saying `note`, until the hero holds one of `items`, and saying `hasNote`
  until he carries at least `has` of each counted thing (`{ brokenShells: 12 }`).
  The Lighthouse's boss door wants a sword and `TUNING.lensCrabShellsAtDoor`
  broken shells, so a kid is never shut in with the Lens Crab unable to win;
  the Lair's wants the metal sword. The want is checked **on every entry
  while the boss is unbeaten**, opened before or not (`VL.doorWantsBar`): an
  opened door comes back shut on a visit he is short, and shuts again (never
  on him) if he spends what it wants in the room below. Once he is through,
  nothing changes; once the boss is beaten it is always open. The lint
  checks its lock needs the same items and counted things.
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
  shutter closes again, and so can never softlock. The lint checks every
  `switch` and `plate` id a shutter names is a lever (or an entity type with
  `isSwitch: true`: a target, a crystal, a lamp) or a plate in its own
  dungeon, and those need ids.
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
  rewards (the Mortar & Pestle, books). **The warp appears only once the
  heart is taken** (W30). On later visits the boss is gone and the heart
  waits until taken, then the warp. **The warp out is a save
  point:** stepping on it records `entrance` (outside the dungeon) as the
  save point (`savePoint: true` on the warp). **A finished dungeon wakes
  him at home (W31):** once the boss is beaten and its heart taken
  (`VL.bossDone`), every Continue, reload and faint whose save point is in
  the dungeon (its statue, anywhere inside, or that doorstep:
  `VL.savePointInDungeon`) wakes him at the hut's lantern, `VL.HOME_SAVE`,
  instead. Every dungeon with a boss gets this with no code of its own;
  before it is finished the statue works as always. The Hollow Oak keeps
  its statue until the shockwave has happened (`VL.keepSavePoint` in
  systems/shockwave.js). **The boss gate (W30) is
  the framework's:** `defineDungeon` puts bars (`shutter`, `bossGate: true`,
  id `<dungeon>BossGate`, `open: { bossDone: true }`) on the tile the boss
  door lands the hero on (the boss door's twin tile across the edge into
  `boss.screen`; pass `boss.gate: { tx, ty }` when the room is not entered
  through a boss door across an edge). They shut once he has stepped in and
  open only when the boss is beaten **and its heart taken**
  (`VL.bossDone(state, id)`), together with the warp. Fainting in there
  wakes him at the statue with everything kept, and the gate always lets
  him back in (its `passable` is true for the pathfinder). A boss room with
  its own `{ bossBeaten: true }` shutter is refused at load: delete it.
  Since he is shut in until the boss falls or he faints, a boss must be
  able to make him faint, or the boss door's lock should need the weapon
  (the sample's boss *lock* needs a sword, its door does not); a boss door
  with `wants` keeps him out until he has it, on every entry.
  `VL.bossBeaten(state, id)`.
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
     light: 'indoor',   // dark rooms: VL.defineDarkRooms (W18)
   });
   ```
2. Don't place bars in the boss room: the framework adds the boss gate on
   the boss door's landing tile (or `boss.gate`), and the warp after the
   heart. Fill the overworld door spot with a `door` into the first room and put a
   `door` on the mat tile back out; a `saveStatue` by the entrance. Make
   `entrance` a safe, walkable tile outside the door: the boss warp lands
   the hero there and records it as his save point; once the dungeon is
   finished, Continue and faints from there wake him at `VL.HOME_SAVE`.
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
  placeholder's, so the 10/20/30 book rewards keep adding up. A split only
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
