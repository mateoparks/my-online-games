// Hero movement: axis-separated collision (so the hero slides along walls),
// screen-edge crossings with a slide, and stand hooks for entities such as doors.
(() => {
  const DIRECTIONS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

  function blocked(state, x, y) {
    const { w, h } = VL.TUNING.heroBox;
    return VL.isBlocked(state.player.area, state.player.screen, x, y, w, h, state.room);
  }

  // Sub-pixel steps so the hero stops flush against a wall instead of short of it.
  function moveAxis(state, axis, amount) {
    const player = state.player;
    const direction = Math.sign(amount);
    let remaining = Math.abs(amount);
    while (remaining > 1e-9) {
      const step = Math.min(0.5, remaining) * direction;
      const x = axis === 'x' ? player.x + step : player.x;
      const y = axis === 'y' ? player.y + step : player.y;
      if (blocked(state, x, y)) break;
      player.x = x;
      player.y = y;
      remaining -= Math.abs(step);
    }
  }

  function updateFacing(player, dx, dy) {
    const wanted = [];
    if (dx < 0) wanted.push('left');
    if (dx > 0) wanted.push('right');
    if (dy < 0) wanted.push('up');
    if (dy > 0) wanted.push('down');
    if (wanted.length === 0) return;
    if (!wanted.includes(player.facing)) player.facing = wanted[0];
  }

  function crossEdges(state) {
    const player = state.player;
    const { width, rows, tile } = VL.TUNING;
    const height = rows * tile;
    let dir = null;
    if (player.x < 0) dir = 'left';
    else if (player.x >= width) dir = 'right';
    else if (player.y < 0) dir = 'up';
    else if (player.y >= height) dir = 'down';
    if (!dir) return;
    const [dx, dy] = DIRECTIONS[dir];
    const next = VL.neighborKey(player.screen, dx, dy);
    if (!VL.screenExists(player.area, next)) {
      player.x = VL.clamp(player.x, 0, width - 1e-3);
      player.y = VL.clamp(player.y, 0, height - 1e-3);
      return;
    }
    VL.enterScreen(state, {
      area: player.area,
      screen: next,
      x: player.x - dx * width,
      y: player.y - dy * height,
    }, dir);
  }

  function standHooks(state) {
    const { tx, ty } = VL.heroTile(state);
    const room = state.room;
    const entity = room.entities.find((e) => e.x === tx && e.y === ty && VL.ENTITIES[e.type]?.onStand);
    if (entity === room.standingOn) return;
    room.standingOn = entity || null;
    if (entity) VL.ENTITIES[entity.type].onStand(state, entity);
  }

  VL.defineSystem('movement', {
    order: 10,
    update(state, actions, dt) {
      const player = state.player;
      const { held } = actions;
      let dx = (held.right ? 1 : 0) - (held.left ? 1 : 0);
      let dy = (held.down ? 1 : 0) - (held.up ? 1 : 0);
      // Carried by a chicken (systems/chickens.js): the flight moves the hero.
      if (player.flight) {
        player.moving = false;
        return;
      }
      updateFacing(player, dx, dy);
      player.moving = dx !== 0 || dy !== 0;
      if (!player.moving) return;
      if (dx && dy) {
        dx *= Math.SQRT1_2;
        dy *= Math.SQRT1_2;
      }
      const speed = VL.TUNING.heroSpeed * dt;
      moveAxis(state, 'x', dx * speed);
      moveAxis(state, 'y', dy * speed);
      crossEdges(state);
      if (!state.transition) standHooks(state);
    },
  });
})();
