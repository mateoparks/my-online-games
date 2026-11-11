// Moving surfaces are opt-in: belt: { speed: 100, sides: { top: 1 } }.
// Side directions are +1/-1 in canvas coordinates (right/down or left/up).
// After updatePlayer(dt), call beltUpdate(level, solids(), dt, W).
// After drawing each solid, call beltDraw(ctx, thing, colors).
// This script must be loaded before game.js.
// Wall contacts set vy; ceiling contacts set beltVx, both to at least speed
// in the indicated direction. They persist after contact without accumulating.
// In updatePlayer, after setting p.vx from input/wind, add p.beltVx || 0 before
// horizontal collision resolution. The engine must decay beltVx each tick and
// clear it on horizontal collisions/bounds, respawn, and other velocity resets.
// Integrate vy normally. Belt movement itself is swept; momentum must also go
// through the engine's normal collision resolution, never directly into x/y.

const beltEpsilon = 0.00001;
const beltSides = ['top', 'right', 'bottom', 'left'];

function beltDirection(solid, side) {
  const direction = solid.belt && solid.belt.sides && solid.belt.sides[side];
  return direction === 1 || direction === -1 ? direction : 0;
}

function beltActive(solid) {
  return !solid.gone && !solid.fake && !solid.waitsToAppear;
}

function beltOverlap(a0, a1, b0, b1) {
  return a0 < b1 - beltEpsilon && a1 > b0 + beltEpsilon;
}

function beltContact(player, solid, side) {
  if (solid.oneWay && side !== 'top') return false;
  const horizontal = beltOverlap(player.x, player.x + player.w, solid.x, solid.x + solid.w);
  const vertical = beltOverlap(player.y, player.y + player.h, solid.y, solid.y + solid.h);
  if (side === 'top') return player.onGround && horizontal && Math.abs(player.y + player.h - solid.y) <= beltEpsilon;
  if (side === 'bottom') return horizontal && Math.abs(player.y - solid.y - solid.h) <= beltEpsilon;
  if (side === 'left') return vertical && Math.abs(player.x + player.w - solid.x) <= beltEpsilon;
  return vertical && Math.abs(player.x - solid.x - solid.w) <= beltEpsilon;
}

// Keep the player's center on a short edge, or the whole player on a longer one.
// If the player entered partly past an end, do not snap them backwards.
function beltEndLimit(position, size, start, length, distance) {
  const low = length >= size ? start : start - size / 2;
  const high = length >= size ? start + length - size : start + length - size / 2;
  return distance > 0 ? Math.max(0, Math.min(distance, high - position)) :
    Math.min(0, Math.max(distance, low - position));
}

// Sweep a single axis, rather than testing only the destination, to prevent
// fast belts or large time steps from carrying the player through a solid.
function beltMove(player, walls, axis, distance, width) {
  if (!distance) return 0;
  const other = axis === 'x' ? 'y' : 'x';
  const size = axis === 'x' ? 'w' : 'h';
  const otherSize = axis === 'x' ? 'h' : 'w';
  const start = player[axis];
  let allowed = distance;
  if (axis === 'x' && Number.isFinite(width)) {
    allowed = distance > 0 ? Math.max(0, Math.min(allowed, width - player.w - start)) :
      Math.min(0, Math.max(allowed, -start));
  }
  for (const wall of walls) {
    if (!beltActive(wall) ||
        !beltOverlap(player[other], player[other] + player[otherSize], wall[other], wall[other] + wall[otherSize])) continue;
    if (wall.oneWay && (axis !== 'y' || distance <= 0 ||
        start + player.h > wall.y + beltEpsilon)) continue;
    const near = wall[axis];
    const far = near + wall[size];
    const end = start + player[size];
    if (beltOverlap(start, end, near, far)) {
      allowed = 0;
    } else if (distance > 0 && near >= end - beltEpsilon) {
      allowed = Math.min(allowed, Math.max(0, near - end));
    } else if (distance < 0 && far <= start + beltEpsilon) {
      allowed = Math.max(allowed, Math.min(0, far - start));
    }
  }
  player[axis] += allowed;
  if (axis === 'y' && allowed !== distance) {
    if (distance > 0 && player.vy > 0) player.vy = 0;
    if (distance < 0 && player.vy < 0) player.vy = 0;
  }
  return allowed;
}

function beltUpdate(level, walls, dt, width = 800) {
  if (!Number.isFinite(dt) || dt <= 0) return;
  const player = level.player;
  let moved = false;
  for (const solid of walls) {
    if (!beltActive(solid) || !solid.belt) continue;
    const speed = solid.belt.speed;
    if (!Number.isFinite(speed) || speed <= 0) continue;
    for (const side of beltSides) {
      const direction = beltDirection(solid, side);
      if (!direction || !beltContact(player, solid, side)) continue;
      const horizontal = side === 'top' || side === 'bottom';
      const axis = horizontal ? 'x' : 'y';
      const size = horizontal ? 'w' : 'h';
      const distance = beltEndLimit(player[axis], player[size], solid[axis], solid[size], direction * speed * dt);
      if (side === 'bottom') {
        const velocity = Number.isFinite(player.beltVx) ? player.beltVx : 0;
        player.beltVx = direction > 0 ? Math.max(velocity, speed) : Math.min(velocity, -speed);
      } else if (!horizontal) {
        player.vy = direction > 0 ? Math.max(player.vy, speed) : Math.min(player.vy, -speed);
      }
      const allowed = beltMove(player, walls, axis, distance, width);
      if (side === 'bottom' && allowed !== distance) player.beltVx = 0;
      if (allowed) moved = true;
    }
  }

  // updatePlayer computed standing before the belt moved the player.
  if (!moved) return;
  const standing = walls.filter(solid => beltActive(solid) &&
    beltOverlap(player.x, player.x + player.w, solid.x, solid.x + solid.w) &&
    Math.abs(player.y + player.h - solid.y) <= beltEpsilon);
  player.onGround = standing.length > 0 && player.vy >= 0;
  if (player.onGround) {
    player.vy = 0;
    player.jumping = false;
  }
  level.standing = player.onGround ? standing : [];
}

function beltDraw(ctx, solid, colors) {
  if (!beltActive(solid) || solid.hidden || !solid.belt) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(solid.x, solid.y, solid.w, solid.h);
  ctx.clip();
  for (const side of beltSides) {
    const direction = beltDirection(solid, side);
    if (!direction || (solid.oneWay && side !== 'top')) continue;
    const horizontal = side === 'top' || side === 'bottom';
    const length = horizontal ? solid.w : solid.h;
    const thickness = Math.min(10, horizontal ? solid.h : solid.w);
    const x = solid.x + (side === 'right' ? solid.w - thickness : 0);
    const y = solid.y + (side === 'bottom' ? solid.h - thickness : 0);
    ctx.fillStyle = colors.sand;
    ctx.fillRect(x, y, horizontal ? length : thickness, horizontal ? thickness : length);
    ctx.strokeStyle = colors.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let offset = Math.min(6, length / 2); offset < length; offset += 14) {
      const cx = horizontal ? solid.x + offset : x + thickness / 2;
      const cy = horizontal ? y + thickness / 2 : solid.y + offset;
      if (horizontal) {
        ctx.moveTo(cx - direction * 3, cy - 3);
        ctx.lineTo(cx + direction * 3, cy);
        ctx.lineTo(cx - direction * 3, cy + 3);
      } else {
        ctx.moveTo(cx - 3, cy - direction * 3);
        ctx.lineTo(cx, cy + direction * 3);
        ctx.lineTo(cx + 3, cy - direction * 3);
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}
