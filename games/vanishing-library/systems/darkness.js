// Dark rooms (design: The path through the game, 6: "The Glowstone lets you
// enter", "dark floors"). A room a dungeon names dark is drawn black past a
// circle of light round the hero, as wide as the Glowstone throws it; the
// things a puzzle turns on (keys, switches, mirrors, lamps) glint through the
// dark, and creatures show their eyes, so a dark room is never a guessing
// game. It is lit for good once every light in it (an entity type with
// `lightsRoom: true`, `on`) is lit. README "Dark rooms (W18)".
(() => {
  VL.tune({ glowInner: 40, glowOuter: 84, glowBare: 18 });
  const T = VL.TUNING;

  VL.ART.addColors({
    darkRoom: '#04060cf0',
    darkRoomClear: '#04060c00',
    darkGlowEdge: '#04060c60',
    darkEye: '#ff5a4a',
  });

  VL.DARK_ROOMS = {};
  VL.defineDarkRooms = function defineDarkRooms(areaId, screens) {
    for (const key of screens) {
      if (!VL.screenExists(areaId, key)) throw new Error(`dark room ${areaId} ${key}: no such screen`);
      VL.DARK_ROOMS[`${areaId}:${key}`] = true;
    }
  };

  // The room's lights, and whether they are all lit (a room with none stays dark).
  VL.roomLights = (room) => (room?.entities || []).filter((e) => VL.ENTITIES[e.type]?.lightsRoom);
  VL.roomLit = (room) => {
    const lights = VL.roomLights(room);
    return lights.length > 0 && lights.every((e) => e.on);
  };

  const unlitDark = (room) => Boolean(room && VL.DARK_ROOMS[`${room.area}:${room.screen}`] && !VL.roomLit(room));
  VL.roomIsDark = (state) => unlitDark(state.room);

  // How far the light reaches round him: the Glowstone's circle, or a hand's breadth without it.
  VL.glowRadius = (state) => (VL.hasItem(state, 'glowstone') ? { inner: T.glowInner, outer: T.glowOuter } : { inner: 4, outer: T.glowBare });

  // Things worth seeing in the dark glint where they stand.
  VL.DARK_GLINTS = new Set(['switch', 'smallKey', 'bossKey', 'dungeonMap', 'bigChest', 'lockedDoor', 'saveStatue', 'heartContainer', 'shutter']);
  const glints = (e) => VL.DARK_GLINTS.has(e.type) || VL.ENTITIES[e.type]?.glintsInDark;

  // Drawn with the hero (front pass), so the dark covers the room and its
  // creatures but not the HUD, the keys or the light's own vignette.
  VL.defineHeroLayer('darkness', (ctx, state, x, y, t, pass) => {
    // A dark room the hero is sliding out of stays dark as it slides away
    // (drawn where render.js draws it), the light still round him.
    const slide = state.transition;
    const leaving = slide && unlitDark(slide.from.room);
    if (pass !== 'front' || !(VL.roomIsDark(state) || leaving)) return;
    const { width, rows, tile } = T;
    const player = state.player;
    const ox = x - Math.round(player.x);
    const oy = y - Math.round(player.y);
    const cx = x;
    const cy = y - 6;
    const { inner, outer } = VL.glowRadius(state);
    // A breath of flicker, so the light feels alive.
    const flicker = Math.sin(t * 3.1) * 1.5 + Math.sin(t * 7.3) * 0.7;
    const gradient = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer + flicker);
    gradient.addColorStop(0, VL.ART.color('darkRoomClear'));
    gradient.addColorStop(0.55, VL.ART.color('darkGlowEdge'));
    gradient.addColorStop(1, VL.ART.color('darkRoom'));
    ctx.fillStyle = gradient;
    if (leaving) {
      const k = VL.smoothstep(Math.min(1, slide.t / slide.duration));
      const [dx, dy] = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[slide.dir];
      ctx.fillRect(-dx * k * width, -dy * k * rows * tile, width, rows * tile);
    }
    if (!VL.roomIsDark(state)) return;
    ctx.fillRect(ox, oy, width, rows * tile);
    const far = (px, py) => Math.hypot(px - cx, py - cy) > inner + 8;
    for (const e of state.room.entities) {
      if (VL.ENTITIES[e.type]?.glowsInDark) {
        VL.ENTITIES[e.type].draw(ctx, e, ox + e.x * tile, oy + e.y * tile, t);
        continue;
      }
      if (VL.isEnemy(e) && e.hp > 0) {
        const ex = ox + Math.round(e.cx);
        const ey = oy + Math.round(e.cy - (e.alt || 0) - 2);
        if (far(ex, ey) && Math.floor(t * 1.3 + e.cx) % 5 !== 0) {
          VL.ART.rect(ctx, 'darkEye', ex - 2, ey, 1, 1);
          VL.ART.rect(ctx, 'darkEye', ex + 1, ey, 1, 1);
        }
        continue;
      }
      if (!glints(e) || e.hidden || e.opened || (e.type === 'shutter' && !e.closed) || (e.type === 'lockedDoor' && e.open)) continue;
      const gx = ox + e.x * tile + 8;
      const gy = oy + e.y * tile + 8;
      if (far(gx, gy)) VL.ART.drawSparkle(ctx, gx + 2, gy - 4, t + e.x * 0.37 + e.y * 0.61);
    }
  }, { steady: true });
})();
