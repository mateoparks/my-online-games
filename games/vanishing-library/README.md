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
  is last; a union merge that went wrong fails there.
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
- `state.player.x/y` is the centre of the hero's feet box (`TUNING.heroBox`).
- The loop runs fixed `TUNING.step` slices; real time per frame is capped at
  `TUNING.maxFrame` and every update also clamps `dt` to `TUNING.maxDt`. On
  displays faster than the step rate, presses stay latched until a frame that
  runs a step, so no tap is lost.
- Keys clear on window blur and when the tab hides. Modifier chords
  (Cmd/Ctrl/Alt) are left to the browser; Space on a focused header control
  belongs to that control.

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
scene, holds ArrowRight through real key events and checks the hero moved, then
saves a screenshot. It then resizes the window without reloading and checks the
scale follows. It runs for 60 s at most.
