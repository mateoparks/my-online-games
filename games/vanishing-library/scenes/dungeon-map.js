// The dungeon map screen (M inside a dungeon): the rooms as a grid, those
// visited lit, every room and the boss's room once the map is found, the
// hero's room blinking, and the keys in hand. M, Esc or E goes back.
(() => {
  const BOX = { x: 16, y: 22, w: 224, h: 152 };
  const GRID = { x: 28, y: 44, w: 164, h: 108, cellW: 24, cellH: 17, gap: 2 };
  const SIDE_X = 198;

  // Room keys to grid cells, the grid centred in its panel.
  VL.dungeonMapLayout = function dungeonMapLayout(dungeon) {
    const keys = Object.keys(VL.AREAS[dungeon.area].screens).map((key) => key.split(',').map(Number));
    const xs = keys.map(([x]) => x);
    const ys = keys.map(([, y]) => y);
    const [minX, minY] = [Math.min(...xs), Math.min(...ys)];
    const cols = Math.max(...xs) - minX + 1;
    const rows = Math.max(...ys) - minY + 1;
    const cellW = Math.min(GRID.cellW, Math.floor((GRID.w + GRID.gap) / cols) - GRID.gap);
    const cellH = Math.min(GRID.cellH, Math.floor((GRID.h + GRID.gap) / rows) - GRID.gap);
    const ox = GRID.x + Math.floor((GRID.w - (cols * (cellW + GRID.gap) - GRID.gap)) / 2);
    const oy = GRID.y + Math.floor((GRID.h - (rows * (cellH + GRID.gap) - GRID.gap)) / 2);
    const cells = {};
    for (const [x, y] of keys) cells[`${x},${y}`] = { x: ox + (x - minX) * (cellW + GRID.gap), y: oy + (y - minY) * (cellH + GRID.gap), w: cellW, h: cellH };
    return cells;
  };

  function frame(ctx, name, x, y, w, h) {
    VL.ART.rect(ctx, name, x, y, w, 1);
    VL.ART.rect(ctx, name, x, y + h - 1, w, 1);
    VL.ART.rect(ctx, name, x, y, 1, h);
    VL.ART.rect(ctx, name, x + w - 1, y, 1, h);
  }

  VL.defineScene('dungeonMap', {
    enter(app) {
      app.dungeonMapView = { t: 0 };
      VL.sfx('menuSelect');
    },

    update(app, actions, dt) {
      app.dungeonMapView.t += dt;
      const { pressed } = actions;
      // X is the key the footer names (W34).
      if (pressed.dig || pressed.map || pressed.pause || pressed.equipment || !VL.dungeonOf(app.game)) {
        VL.sfx('menuSelect');
        app.setScene('play');
      }
    },

    draw(ctx, app, t) {
      const game = app.game;
      VL.drawWorld(ctx, game, t);
      const dungeon = VL.dungeonOf(game);
      if (!dungeon) return;
      const d = VL.dungeonState(game, dungeon.id);
      VL.ART.rect(ctx, 'dgnShade', 0, 0, VL.TUNING.width, VL.TUNING.height);
      VL.ART.drawBox(ctx, BOX.x, BOX.y, BOX.w, BOX.h);
      VL.ART.text(ctx, VL.popupText(dungeon.name, game).toUpperCase(), BOX.x + BOX.w / 2, BOX.y + 7, { align: 'center', color: 'goldLight', shadow: 'boxShade' });
      const cells = VL.dungeonMapLayout(dungeon);
      const blink = Math.floor(t * 3) % 2 === 0;
      for (const [key, cell] of Object.entries(cells)) {
        const visited = Boolean(game.visited[`${dungeon.area}:${key}`]);
        const known = visited || d.map;
        if (!known) continue;
        VL.ART.rect(ctx, visited ? 'dgnStoneLight' : 'dgnStoneDark', cell.x, cell.y, cell.w, cell.h);
        frame(ctx, visited ? 'text' : 'slotEmpty', cell.x, cell.y, cell.w, cell.h);
        if (d.map && dungeon.boss && key === dungeon.boss.screen) VL.ART.drawSprite(ctx, 'icon-skull', cell.x + cell.w - 7, cell.y + 2);
        if (key === game.player.screen && blink) {
          frame(ctx, 'gold', cell.x - 1, cell.y - 1, cell.w + 2, cell.h + 2);
          VL.ART.rect(ctx, 'heart', cell.x + Math.floor(cell.w / 2) - 1, cell.y + Math.floor(cell.h / 2) - 1, 3, 3);
        }
      }
      VL.ART.text(ctx, 'KEYS', SIDE_X, GRID.y, { size: 'small', color: 'textDim' });
      VL.ART.drawSprite(ctx, 'item-small-key', SIDE_X, GRID.y + 9);
      VL.ART.text(ctx, `x${VL.smallKeys(game, dungeon.id)}`, SIDE_X + 9, GRID.y + 10, { color: 'text' });
      VL.ART.text(ctx, 'BOSS', SIDE_X, GRID.y + 30, { size: 'small', color: 'textDim' });
      if (d.bossKey) VL.ART.drawSprite(ctx, 'item-boss-key', SIDE_X, GRID.y + 39);
      else VL.ART.text(ctx, '-', SIDE_X + 1, GRID.y + 40, { color: 'textDim' });
      VL.ART.text(ctx, 'MAP', SIDE_X, GRID.y + 60, { size: 'small', color: 'textDim' });
      if (d.map) VL.ART.drawSprite(ctx, 'pickup-dungeon-map', SIDE_X, GRID.y + 69);
      else VL.ART.text(ctx, '-', SIDE_X + 1, GRID.y + 70, { color: 'textDim' });
      VL.ART.text(ctx, d.map ? 'X: BACK' : 'ROOMS YOU HAVE SEEN   X: BACK', BOX.x + BOX.w / 2, BOX.y + BOX.h - 11, { size: 'small', align: 'center', color: 'textDim' });
    },
  });
})();
