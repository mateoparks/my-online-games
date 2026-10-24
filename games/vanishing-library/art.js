// Placeholder look until W4 brings the art kit. Everything the renderer draws
// goes through VL.ART, so W4 can replace this file without touching render.js.
VL.ART = {};

VL.ART.tileColor = function tileColor(info) {
  if (info.water) return '#2d6fb5';
  if (info.shallow) return '#6fb7e0';
  if (info.sand) return '#e8d49a';
  if (info.path) return '#c9b07a';
  if (info.tree) return '#1f5e38';
  if (info.rock) return '#8a8f94';
  if (info.berry) return '#5a8d3a';
  if (info.bush) return '#3f8f3f';
  if (info.fence) return '#9a6b3f';
  if (info.door) return '#3a2718';
  if (info.wall) return info.interior ? '#5b4636' : '#a0522d';
  if (info.floor) return '#d9b985';
  if (info.flowers) return '#8fcf5a';
  return '#7bbf4e';
};

VL.ART.drawTile = function drawTile(ctx, info, x, y, t) {
  const size = VL.TUNING.tile;
  ctx.fillStyle = VL.ART.tileColor(info);
  ctx.fillRect(x, y, size, size);
  if (info.solid && !info.water) {
    ctx.fillStyle = '#0003';
    ctx.fillRect(x + 2, y + 2, size - 4, size - 4);
  }
  if (info.water) {
    const shimmer = Math.floor(t * 2 + x / 16) % 2 === 0;
    ctx.fillStyle = shimmer ? '#3f84c9' : '#2d6fb5';
    ctx.fillRect(x + 4, y + 6, 6, 1);
  }
  if (info.flowers) {
    ctx.fillStyle = '#f5e07a';
    ctx.fillRect(x + 5, y + 4, 2, 2);
    ctx.fillRect(x + 10, y + 10, 2, 2);
  }
};

VL.ART.drawHero = function drawHero(ctx, player, x, y, t) {
  const bob = player.moving && Math.floor(t * 8) % 2 === 0 ? 1 : 0;
  const top = y - 14 - bob;
  ctx.fillStyle = '#0004';
  ctx.fillRect(x - 5, y + 1, 10, 3);
  ctx.fillStyle = '#18242a';
  ctx.fillRect(x - 6, top - 1, 12, 16);
  ctx.fillStyle = '#2f7f5f';
  ctx.fillRect(x - 5, top, 10, 14);
  ctx.fillStyle = '#f6d5b0';
  ctx.fillRect(x - 4, top + 1, 8, 5);
  ctx.fillStyle = '#18242a';
  if (player.facing === 'left') ctx.fillRect(x - 3, top + 3, 2, 1);
  if (player.facing === 'right') ctx.fillRect(x + 1, top + 3, 2, 1);
  if (player.facing === 'down') ctx.fillRect(x - 2, top + 3, 4, 1);
};

VL.ART.drawHud = function drawHud(ctx, state) {
  const { width, hudHeight } = VL.TUNING;
  ctx.fillStyle = '#18242a';
  ctx.fillRect(0, 0, width, hudHeight);
  const hearts = Math.ceil(state.maxHp / 2);
  for (let i = 0; i < hearts; i += 1) {
    const full = state.hp >= (i + 1) * 2;
    ctx.fillStyle = full ? '#e34a4a' : '#5a2a2a';
    ctx.fillRect(4 + i * 10, 4, 8, 8);
  }
};
