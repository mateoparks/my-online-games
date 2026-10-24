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
| `art` | `art.js`: everything drawn goes through `VL.ART` (the art kit replaces the placeholder) | `VL.ART.*` |
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
  other files in your section through the registries at run time. The test
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

## Progression: locks, keys, the solver and the playthrough

`progression.js` holds the one table of everything that gates progress
(`VL.LOCKS`) and `milestones.js` seeds it with the whole game's path from the
design doc, every entry citing the design-doc section it comes from. A lock is
registered with `VL.defineLock(id, rule)` **from the file that implements it**;
`milestones.js` already has a *planned* entry (`by: 'W14'`) for each one, and an
item claims it by defining the same id with a `reached` predicate. Defining an
id that is already implemented throws, so two lanes cannot clash. Fields:

```js
VL.defineLock('liftingGloves', {
  type: 'item',                       // place | item | flag | event
  needs: ['scriptoriumEntered', ['woodSword', 'metalSword']],  // keys; an inner array is any-of
  gives: ['heartD1'],                 // extra keys besides the id
  supplies: { ore: 1 },               // counters; `count: { pages: 5 }` requires one, `consumes: { ore: 1 }` spends one
  renewable: true,                    // can be obtained again (bushes, shops, forging); default: one time
  optional: true,                     // not needed for the ending (rewards, heart containers)
  loses: [...], retires: [...],       // events only: keys taken; `loses` must be regainable, `retires` is for good
  doc: '§ The path through the game, 2',
  reached: (state) => Boolean(state.flags.gloves),   // implemented locks; planned ones give `by: 'W14'` instead
  place: { area: 'scriptorium', screen: '0,0' },     // implemented places: the test checks the screen exists
});
```

`VL.progress(state)` lists the locks a live game has reached (hints can pick
from it). `VL.MILESTONES` is the story order (fixed in `milestones.js`; adding
a beat is an edit there).

**The solver**, `VL.solveProgression()`, runs in `tests/progression.test.js`
over the whole table, planned entries included, so the full path is checked
from day one. It computes everything obtainable, then applies each event
(`shockwave`, `primerTaken`) as a new stage from the **worst-case player**: one
holding only the keys the event cannot be reached without (plus what the event
gives, minus what it takes), with every one-time source that fed something now
lost treated as used up. It fails the run when a lock is unreachable, a
required lock is unreachable after an event, something an event `loses` cannot
be regained, a counter cannot cover what was lost (ore for metal gear) or its
total demand (each loss costs it again), a key or counter is unknown, or the
milestone order disagrees with the stages. Optional locks that an event cuts
off are listed as `missable` (today: the drawn world map after Dungeon 3).
Two events available at once are applied in story order only; hearts and
health are not modelled (dying keeps everything, so bare-hand bush pulls never
softlock). Deliberately broken tables in the test show each failure.

**The playthrough harness**, `tests/playthrough.js`, drives the real game
(`app.update` with Actions, one step at a time) from a new game through the
milestones in order and checks each milestone's `reached`. Steps are data: an
item adds `tests/steps/<item>.steps.js` exporting
`(step) => { step('chestGear', (drive) => { ... }); }`, one step per milestone it
implements. `drive.walkTo({ area, screen, tx, ty })` paths through open tiles,
screen edges and doors with real held directions; `drive.press(action)`,
`drive.hold(actions, seconds)`, `drive.until(pred, maxSeconds, held)` and
`drive.state`/`drive.app` do the rest (a popup scene that swallows input shows
up as a `not reached` error naming the scene). The test drives to the last
milestone that has steps; the first milestone without steps must be planned,
not implemented, so an item that implements a beat also scripts it.
