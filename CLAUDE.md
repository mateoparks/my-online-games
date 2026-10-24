# CLAUDE.md

"Arcade Current": a small collection of static browser games built for a
Coding with AI class taught to homeschool students. Copilot has done most of
the work here so far; its instructions are the shared rulebook for every AI
tool, so they're imported here instead of copied:

@.github/copilot-instructions.md

## Layout

- `index.html`: the arcade home page. The `.games` list holds one `<li>` per
  game, **kept alphabetical**.
- `assets/site.css`: design tokens (`--sand`, `--aqua`, `--palm`, `--ink`,
  `--muted`, `--card`, `--shadow`, with a `[data-theme="dark"]` override) and
  shared UI (`.site-header`, `.game-header`, `.back`, `.brand`,
  `.theme-toggle`, `.eyebrow`, `.primary-button`).
- `assets/theme.js`: the light/dark toggle, saved in `localStorage` as
  `arcade-theme`.
- `games/<slug>/`: one folder per game with `index.html`, `game.js`,
  `game.css`, and `icon.svg`. Use `games/connect4/` as the minimal template.
- `foxfire/` with `assets/foxfire*`: a separate class project (a website for
  Foxfire Eventing), linked from the home page. It isn't a game, so leave it
  alone unless asked.
- `docs/` and `copilot/` are gitignored. `docs/` holds design records such as
  `escape-alpha-centauri-design.md` and briefs such as `FOXFIRE-BRIEF.md`.

## Conventions

- Plain HTML, CSS, and JavaScript only: no build step, no npm, no frameworks.
  Opening `index.html` from disk or a static server must be enough.
- Game JS is a plain `<script>` (not a module), and the existing games are
  written in that style: top-level `const`/`let`, small named functions, DOM
  lookups by `id`.
- Persist per-game state in `localStorage` under keys prefixed with the game's
  slug, for example `connect4-red-color`.
- Support both themes by using the shared CSS tokens rather than hard-coded
  colors, and keep the pages keyboard-accessible.
- Students play the games but don't read the code. The goal is to inspire them,
  so aim for the most polished and fun result, not for teaching-style code.
- Laptop/desktop with a keyboard is the target for now. Keep input handling
  separate from game logic so touch controls can be added later; adapting a
  game for tablet and phone is planned as a future lesson with the students.
- Games with real complexity get a `game.test.js` Node test, plus a design
  record in `docs/` when it helps.

## Testing

No test runner. The existing tests are plain Node scripts that load `game.js`
into a `node:vm` context with a hand-rolled fake DOM and use `node:assert`:

```sh
node games/escape-alpha-centauri/game.test.js
```

## Git

The main branch is `main` (GitHub: `mateoparks/my-online-games`). Do new work
on a feature branch; never commit to or push `main`.
