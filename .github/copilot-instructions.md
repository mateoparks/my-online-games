# Copilot instructions

This repository is a collection of simple online games, each a static HTML/JS page with no build step.

## Adding a new game

1. Put the game in its own folder: `games/<game-name>/index.html` (self-contained HTML/CSS/JS).
2. Add a small icon (SVG preferred, ~64x64) at `games/<game-name>/icon.svg`.
3. Link the game from the root `index.html` by adding an `<li>` to the `.games` list, in the same format as existing entries: an `<a>` to the game page containing the icon `<img>` and the game name in a `<span>`.
4. Add a "&larr; All games" link back to `../../index.html` in the game page.
