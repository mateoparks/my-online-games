# Copilot instructions

This repository is a collection of simple online games, each a static HTML/JS page with no build step.

## Technical approach

- Keep the project dependency-free and vanilla-first: use standard HTML, CSS, and JavaScript before considering a third-party library.
- Share site-wide presentation and behavior through static assets in `assets/`: `site.css` owns design tokens and common UI, and `theme.js` owns the persisted accessible theme toggle. Use these for the theme, typography, layout primitives, header, navigation, and other cross-game UI.
- Keep each game's rules, state, and game-specific styling in `games/<game-name>/`. A game must continue to work by loading only static project files—no framework, build step, package manager, or server-side component.
- Reuse small, focused browser APIs and shared utilities rather than introducing a library. Add a dependency only when native web APIs would make a required feature materially less accessible, reliable, or maintainable.

## Adding a new game

1. Put the game in its own folder: `games/<game-name>/index.html`, with game-specific CSS and JavaScript kept there or in adjacent static files.
2. Add a small icon (SVG preferred, ~64x64) at `games/<game-name>/icon.svg`.
3. Load `../../assets/theme.js` in `<head>` before `../../assets/site.css`, then include any game-local stylesheets. Add a `.theme-toggle` button in the page header so the shared script provides the current global look, accessible theme toggle, and persisted preference.
4. Link the game from the root `index.html` by adding an `<li>` to the `.games` list, in the same format as existing entries: an `<a>` to the game page containing the icon `<img>` and the game name in a `<span>`.
5. Add a "&larr; All games" link back to `../../index.html` in the game page.
