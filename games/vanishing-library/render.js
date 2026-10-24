// Draws the current scene into the 256×192 buffer. The world is drawn below
// the HUD strip; a screen slide draws the old and new screens offset.
VL.render = function render(ctx, app, t) {
  const { width, height } = VL.TUNING;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  app.scene.draw(ctx, app, t);
};

VL.drawScreen = function drawScreen(ctx, areaId, key, ox, oy, t) {
  const { cols, rows, tile } = VL.TUNING;
  const screen = VL.getScreen(areaId, key);
  for (let ty = 0; ty < rows; ty += 1) {
    for (let tx = 0; tx < cols; tx += 1) {
      VL.ART.drawTile(ctx, VL.tileInfo(areaId, screen.tiles[ty][tx]), ox + tx * tile, oy + ty * tile, t);
    }
  }
  for (const entity of screen.entities) {
    VL.ENTITIES[entity.type]?.draw?.(ctx, entity, ox + entity.x * tile, oy + entity.y * tile, t);
  }
};

VL.drawWorld = function drawWorld(ctx, state, t) {
  const { width, rows, tile, hudHeight } = VL.TUNING;
  const playHeight = rows * tile;
  const player = state.player;
  let ox = 0;
  let oy = 0;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, hudHeight, width, playHeight);
  ctx.clip();
  ctx.translate(0, hudHeight);
  const slide = state.transition;
  if (slide) {
    const k = VL.smoothstep(Math.min(1, slide.t / slide.duration));
    const [dx, dy] = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[slide.dir];
    ox = -dx * (1 - k) * width;
    oy = -dy * (1 - k) * playHeight;
    VL.drawScreen(ctx, slide.from.area, slide.from.screen, dx * k * width, dy * k * playHeight, t);
  }
  VL.drawScreen(ctx, player.area, player.screen, ox, oy, t);
  VL.ART.drawHero(ctx, player, Math.round(ox + player.x), Math.round(oy + player.y), t);
  ctx.restore();
  VL.ART.drawHud(ctx, state, t);
};
