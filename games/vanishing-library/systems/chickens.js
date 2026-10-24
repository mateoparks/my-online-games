// Chickens (design: Chickens, Controls; README "Chickens"): they wander and
// cluck, S lifts one overhead and S again throws it, F next to one is the
// secret flight, hitting them too often brings the swarm, and the lost
// chicken follows the hero once found. The entity is entities/chicken.js.
(() => {
  VL.tune({
    // Gap widths a flight clears; it lands one tile past the gap (README
    // "Flight contract"). tests/overworld.test.js checks them against the map.
    chickenFlightShort: 2,
    chickenFlightLong: 4,
    chickenFlightSpeed: 76,
    chickenFlightLift: 11,
    chickenDipSeconds: 0.7,
    chickenReach: 22,
    chickenThrowTiles: 3,
    chickenThrowSpeed: 120,
    chickenWander: 2,
    chickenWalkSpeed: 16,
    chickenIdleMin: 0.7,
    chickenIdleMax: 2.6,
    chickenFollowSpeed: 74,
    chickenFollowGap: 18,
    chickenSwarmHits: 5,
    chickenSwarmSize: 7,
    chickenSwarmSeconds: 6,
    chickenSwarmSpeed: 95,
  });

  const T = VL.TUNING;
  const DIRS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
  const playHeight = () => T.rows * T.tile;

  // The lost chicken while it is with the hero: play state, so a reload puts
  // it back at its spot.
  VL.extendGame('chickens', () => ({ chickenFollower: null }), { transient: true });

  // ---------- art ----------

  const colors = { r: 'comb', w: 'white', k: 'ink', y: 'gold', g: 'feather' };
  const body = ['..rr......', '.rwww.....', 'ywkww.....', '.wwww...ww', '..wwwwwwww', '..wwggwwww', '...wwwwww.'];
  const FRAMES = {
    stand: [...body, '....y..y..', '...yy.yy..'],
    walk: [...body, '....y...y.', '...yy..yy.'],
    peck: ['..........', '..........', '........ww', '...wwwwwww', '.rwwwwwwww', 'rwwwggwwww', 'ykwwwwwww.', '....y..y..', '...yy.yy..'],
    flapUp: ['..rr..g...', '.rwww.gg..', 'ywkwwggg..', '.wwwwggg.w', '..wwwwwwww', '..wwwwwwww', '...wwwwww.', '....yyy...', '..........'],
    flapDown: ['..rr......', '.rwww.....', 'ywkww.....', '.wwww...ww', '..wwwwwwww', '..wwwwwwww', '..gwwwwwg.', '.gg.yyy.gg', '..........'],
  };
  for (const [name, rows] of Object.entries(FRAMES)) {
    VL.ART.defineSprite(`chicken-${name}-left`, { colors, rows });
    VL.ART.defineSprite(`chicken-${name}-right`, { mirrorOf: `chicken-${name}-left` });
  }

  // (x, y) is the chicken's feet; `z` lifts it off its shadow.
  VL.drawChicken = function drawChicken(ctx, chicken, x, y, t, { flap = false, shadow = true } = {}) {
    const z = Math.round(chicken.z || 0);
    const facing = chicken.facing === 'right' ? 'right' : 'left';
    let frame = 'stand';
    if (flap || z > 0) frame = Math.floor(t * 14) % 2 ? 'flapUp' : 'flapDown';
    else if (chicken.mode === 'walk' || chicken.mode === 'follow' && chicken.moving) frame = Math.floor(t * 8) % 2 ? 'walk' : 'stand';
    else if (chicken.peck > 0) frame = Math.floor(chicken.peck * 10) % 2 ? 'peck' : 'stand';
    if (shadow) VL.ART.drawShadow(ctx, x, y - 1, z > 3 ? 6 : 8);
    VL.ART.drawSprite(ctx, `chicken-${frame}-${facing}`, Math.round(x) - 5, Math.round(y) - 8 - z);
  };

  VL.drawChickenFx = function drawChickenFx(ctx, fx, x, y) {
    const k = VL.clamp(fx.t / fx.dur, 0, 1);
    const { rect } = VL.ART;
    if (fx.kind === 'splash') {
      const r = Math.round(3 + k * 9);
      rect(ctx, 'foam', x - r, y - 1, r * 2, 1);
      rect(ctx, 'white', x - r + 2, y, r * 2 - 4, 1);
      for (let i = 0; i < 6; i += 1) {
        const dx = Math.round((i - 2.5) * (2 + k * 4));
        const dy = Math.round(-Math.sin(Math.PI * k) * (8 + (i % 3) * 3));
        if (k < 0.85) rect(ctx, i % 2 ? 'white' : 'foam', x + dx, y - 2 + dy, 2, 2);
      }
      return;
    }
    for (let i = 0; i < 5; i += 1) {
      const dx = Math.round(Math.sin(i * 2.4 + k * 6) * (4 + i * 2));
      const dy = Math.round(-10 + k * 14 + i * 2 - (i % 2) * 6);
      rect(ctx, i % 2 ? 'feather' : 'white', x + dx, y + dy, 2, 1);
    }
  };

  // ---------- sound ----------

  VL.defineSfx('henSquawk', [
    { wave: 'square', freq: 1300, to: 700, dur: 0.11, vol: 0.18, filter: { type: 'bandpass', freq: 1500, q: 3 } },
    { wave: 'square', freq: 1700, to: 850, at: 0.1, dur: 0.15, vol: 0.18, filter: { type: 'bandpass', freq: 1700, q: 3 } },
  ], { gap: 0.2 });
  VL.defineSfx('flap', [
    { wave: 'noise', dur: 0.05, vol: 0.35, filter: { type: 'bandpass', freq: 900, q: 1 } },
    { wave: 'noise', at: 0.09, dur: 0.05, vol: 0.35, filter: { type: 'bandpass', freq: 1100, q: 1 } },
  ], { gap: 0.18 });
  VL.defineSfx('dunk', [
    { wave: 'noise', dur: 0.35, vol: 0.4, filter: { type: 'lowpass', freq: 2400, to: 300 } },
    { wave: 'sine', freq: 320, to: 120, dur: 0.15, vol: 0.25 },
  ], { gap: 0.3 });
  const EVENT_SOUNDS = {
    chickenCluck: 'cluck', chickenLift: 'cluck', chickenPeck: 'cluck',
    chickenThrow: 'flap', chickenFlight: 'flap', chickenFlap: 'flap',
    chickenLand: 'step', chickenSplash: 'dunk', chickenBonk: 'bump',
    chickenTired: 'henSquawk', chickenHit: 'henSquawk', chickenSwarm: 'henSquawk',
  };
  for (const [event, sound] of Object.entries(EVENT_SOUNDS)) VL.SOUND.onEvent(event, sound);

  // ---------- helpers ----------

  const room = (state) => state.room;
  const isChicken = (e) => e.type === 'chicken';
  const grounded = (c) => (c.mode === 'idle' || c.mode === 'walk' || c.mode === 'follow') && !(c.z > 0);
  const tileOpen = (state, tx, ty) => tx >= 0 && ty >= 0 && tx < T.cols && ty < T.rows
    && !VL.isSolidAt(state.room.area, state.room.screen, tx, ty, state.room);

  function syncTile(c) {
    const { tx, ty } = VL.tileOf(c.px, c.py);
    c.x = VL.clamp(tx, 0, T.cols - 1);
    c.y = VL.clamp(ty, 0, T.rows - 1);
  }

  function moveToward(c, x, y, speed, dt) {
    const dx = x - c.px;
    const dy = y - c.py;
    const dist = Math.hypot(dx, dy);
    if (Math.abs(dx) > 0.5) c.facing = dx < 0 ? 'left' : 'right';
    if (dist <= speed * dt) {
      c.px = x;
      c.py = y;
      return true;
    }
    c.px += (dx / dist) * speed * dt;
    c.py += (dy / dist) * speed * dt;
    return false;
  }

  // Per-visit random numbers, so chickens never shift the game's drops.
  function flock(state) {
    const r = room(state);
    if (!r.chickens) {
      let salt = 7;
      for (const ch of `${r.area}:${r.screen}`) salt = (salt * 31 + ch.charCodeAt(0)) | 0;
      r.chickens = { hits: 0, swarm: null, rngState: Math.floor(VL.ART.hash(salt, 3, 11) * 0x100000000) >>> 0 };
    }
    return r.chickens;
  }

  function addFx(state, kind, px, py, dur = 0.6) {
    const fx = { type: 'chickenFx', kind, px, py, t: 0, dur };
    syncTile(fx);
    room(state).entities.push(fx);
  }

  const remove = (state, entity) => {
    const list = room(state).entities;
    const index = list.indexOf(entity);
    if (index !== -1) list.splice(index, 1);
  };

  // Called by the entity on each fresh copy: where it lives on this visit.
  VL.setUpChicken = function setUpChicken(state, c) {
    let salt = 17;
    for (const ch of c.spot || 'chicken') salt = (salt * 31 + ch.charCodeAt(0)) | 0;
    c.rngState = Math.floor(VL.ART.hash(c.x, c.y, salt) * 0x100000000) >>> 0;
    const feet = VL.tileCenter(c.x, c.y);
    Object.assign(c, { px: feet.x, py: feet.y, z: 0, home: { x: c.x, y: c.y }, mode: 'idle', peck: 0, facing: VL.random(c) < 0.5 ? 'left' : 'right' });
    c.idle = T.chickenIdleMin + VL.random(c) * T.chickenIdleMax;
  };

  // ---------- lift and throw ----------

  function takeUp(state, c) {
    remove(state, c);
    Object.assign(c, { mode: 'held', z: 0, since: state.time });
    state.player.carrying = c;
    if (c.lost) {
      c.follow = true;
      state.chickenFollower = c;
    }
  }

  VL.liftChicken = function liftChicken(state, c) {
    const player = state.player;
    if (player.carrying || player.flight || !grounded(c)) return false;
    takeUp(state, c);
    state.events.push({ type: 'chickenLift' });
    return true;
  };

  function throwChicken(state) {
    const player = state.player;
    const c = player.carrying;
    const [dx, dy] = DIRS[player.facing] || DIRS.down;
    player.carrying = null;
    Object.assign(c, { mode: 'air', px: player.x, py: player.y, z: 14 });
    c.air = { dx, dy, travelled: 0, total: T.chickenThrowTiles * T.tile, fromX: player.x, fromY: player.y };
    if (dx) c.facing = dx < 0 ? 'left' : 'right';
    room(state).entities.push(c);
    state.events.push({ type: 'chickenThrow' });
  }

  function settle(state, c) {
    c.z = 0;
    c.mode = c.follow ? 'follow' : 'idle';
    c.idle = T.chickenIdleMin;
    syncTile(c);
    // Wandering keeps to its own screen's spot; anywhere else, where it landed.
    if (c.homeScreen !== `${room(state).area}:${room(state).screen}`) c.home = { x: c.x, y: c.y };
  }

  function updateThrown(state, c, dt) {
    const air = c.air;
    const step = Math.min(T.chickenThrowSpeed * dt, air.total - air.travelled);
    const nx = c.px + air.dx * step;
    const ny = c.py + air.dy * step;
    const { tx, ty } = VL.tileOf(nx, ny);
    const inside = nx >= 4 && nx <= T.width - 4 && ny >= 6 && ny <= playHeight() - 2;
    const info = VL.tileInfo(room(state).area, VL.tileAt(room(state).area, room(state).screen, tx, ty, room(state)));
    const wall = !inside || (VL.isSolidAt(room(state).area, room(state).screen, tx, ty, room(state)) && !info.flyOver);
    if (!wall) {
      c.px = nx;
      c.py = ny;
      air.travelled += step;
    }
    const k = air.travelled / air.total;
    c.z = Math.max(0, 14 * (1 - k) + 8 * Math.sin(Math.PI * k));
    syncTile(c);
    if (!wall && air.travelled < air.total) return;
    if (wall) state.events.push({ type: 'chickenBonk' });
    c.air = null;
    if (tileOpen(state, c.x, c.y)) {
      settle(state, c);
      return;
    }
    // Over water or a chasm: a splash, then it flaps back to where it was thrown from.
    const water = VL.tileInfo(room(state).area, VL.tileAt(room(state).area, room(state).screen, c.x, c.y, room(state))).water;
    if (water) addFx(state, 'splash', c.px, c.py);
    state.events.push({ type: water ? 'chickenSplash' : 'chickenTired' });
    c.mode = 'home';
    c.homeTo = { x: air.fromX, y: air.fromY };
  }

  // ---------- wandering, hops, following ----------

  function wander(state, c, dt) {
    c.peck = Math.max(0, c.peck - dt);
    if (c.mode === 'walk') {
      if (moveToward(c, c.target.x, c.target.y, T.chickenWalkSpeed, dt)) c.mode = 'idle';
      return;
    }
    c.idle -= dt;
    if (c.idle > 0) return;
    c.idle = T.chickenIdleMin + VL.random(c) * (T.chickenIdleMax - T.chickenIdleMin);
    const roll = VL.random(c);
    if (roll < 0.12) state.events.push({ type: 'chickenCluck' });
    if (roll < 0.4) {
      c.peck = 0.5;
      return;
    }
    const [dx, dy] = Object.values(DIRS)[Math.floor(VL.random(c) * 4)];
    const tx = c.x + dx;
    const ty = c.y + dy;
    const home = c.home;
    if (Math.abs(tx - home.x) > T.chickenWander || Math.abs(ty - home.y) > T.chickenWander || !tileOpen(state, tx, ty)) return;
    const centre = VL.tileCenter(tx, ty);
    c.target = { x: centre.x + Math.round((VL.random(c) - 0.5) * 6), y: centre.y + Math.round((VL.random(c) - 0.5) * 4) };
    c.mode = 'walk';
  }

  function hit(state, c) {
    const player = state.player;
    const swarm = flock(state);
    swarm.hits += 1;
    state.events.push({ type: 'chickenHit' });
    addFx(state, 'feathers', c.px, c.py, 0.7);
    const dist = Math.hypot(c.px - player.x, c.py - player.y) || 1;
    let toX = c.px + ((c.px - player.x) / dist) * 20;
    let toY = c.py + ((c.py - player.y) / dist) * 20;
    const { tx, ty } = VL.tileOf(toX, toY);
    if (!tileOpen(state, tx, ty)) {
      toX = c.px;
      toY = c.py;
    }
    c.mode = 'hop';
    c.hop = { fromX: c.px, fromY: c.py, toX, toY, t: 0 };
    if (swarm.hits >= T.chickenSwarmHits && !swarm.swarm) startSwarm(state);
  }

  function updateHop(state, c, dt) {
    const hop = c.hop;
    hop.t += dt;
    const k = Math.min(1, hop.t / 0.35);
    c.px = hop.fromX + (hop.toX - hop.fromX) * k;
    c.py = hop.fromY + (hop.toY - hop.fromY) * k;
    c.z = 9 * Math.sin(Math.PI * k);
    if (k >= 1) settle(state, c);
  }

  function follow(state, c, dt) {
    const player = state.player;
    const dist = Math.hypot(player.x - c.px, player.y - c.py);
    c.moving = dist > T.chickenFollowGap;
    if (!c.moving) return;
    const speed = Math.max(T.chickenFollowSpeed, dist * 2.5);
    const k = (dist - T.chickenFollowGap + 1) / dist;
    moveToward(c, c.px + (player.x - c.px) * k, c.py + (player.y - c.py) * k, speed, dt);
  }

  // The lost chicken stays with the hero from screen to screen: it turns up
  // just behind him wherever he arrives.
  function bringFollower(state) {
    const c = state.chickenFollower;
    const player = state.player;
    if (!c || player.carrying === c || room(state).entities.includes(c)) return;
    const [dx, dy] = DIRS[player.facing] || DIRS.down;
    c.px = VL.clamp(player.x - dx * 14, 6, T.width - 6);
    c.py = VL.clamp(player.y - dy * 14, 10, playHeight() - 4);
    c.z = 0;
    c.mode = 'follow';
    c.air = null;
    c.hop = null;
    c.homeScreen = `${room(state).area}:${room(state).screen}`;
    syncTile(c);
    room(state).entities.push(c);
  }

  VL.chickenWithHero = (state, id) => state.player.carrying?.spot === id || state.chickenFollower?.spot === id;

  // W11's kid takes the lost chicken home; it leaves the hero for good.
  VL.takeChicken = function takeChicken(state, id) {
    if (!VL.chickenWithHero(state, id)) return false;
    if (state.player.carrying?.spot === id) state.player.carrying = null;
    for (const e of room(state).entities.filter((other) => isChicken(other) && other.spot === id)) remove(state, e);
    if (state.chickenFollower?.spot === id) state.chickenFollower = null;
    return true;
  };

  // ---------- the swarm ----------

  function startSwarm(state) {
    const swarm = flock(state);
    const player = state.player;
    swarm.swarm = { t: 0 };
    swarm.hits = 0;
    state.events.push({ type: 'chickenSwarm' });
    for (let i = 0; i < T.chickenSwarmSize; i += 1) {
      const angle = (i / T.chickenSwarmSize) * Math.PI * 2 + VL.random(swarm);
      const c = {
        type: 'chickenSwarm',
        px: player.x + Math.cos(angle) * 190,
        py: player.y + Math.sin(angle) * 150,
        z: 8,
        angle,
        speed: T.chickenSwarmSpeed * (0.85 + VL.random(swarm) * 0.3),
        peck: VL.random(swarm),
        leaving: false,
        facing: Math.cos(angle) > 0 ? 'left' : 'right',
      };
      syncTile(c);
      room(state).entities.push(c);
    }
  }

  function updateSwarm(state, dt) {
    const swarm = room(state).chickens?.swarm;
    if (!swarm) return;
    swarm.t += dt;
    const player = state.player;
    const birds = room(state).entities.filter((e) => e.type === 'chickenSwarm');
    birds.forEach((c, i) => {
      if (swarm.t >= T.chickenSwarmSeconds) c.leaving = true;
      if (c.leaving) {
        c.px += Math.cos(c.angle) * c.speed * 1.3 * dt;
        c.py += Math.sin(c.angle) * c.speed * 1.3 * dt;
        c.facing = Math.cos(c.angle) < 0 ? 'left' : 'right';
        if (c.px < -24 || c.px > T.width + 24 || c.py < -24 || c.py > playHeight() + 24) remove(state, c);
      } else {
        const a = c.angle + swarm.t * 2.4;
        const r = 12 + 6 * Math.sin(swarm.t * 3 + i);
        moveToward(c, player.x + Math.cos(a) * r, player.y - 4 + Math.sin(a) * r * 0.6, c.speed, dt);
        c.peck -= dt;
        if (c.peck <= 0) {
          c.peck = 0.35 + VL.random(flock(state)) * 0.5;
          state.events.push({ type: 'chickenPeck' });
          if (VL.random(flock(state)) < 0.3) addFx(state, 'feathers', player.x, player.y - 4, 0.6);
        }
      }
      c.z = 7 + Math.sin(swarm.t * 9 + i) * 2;
      syncTile(c);
    });
    if (!birds.some((c) => room(state).entities.includes(c))) room(state).chickens.swarm = null;
  }

  // ---------- flight ----------

  VL.chickenFlightTiles = (state) => (state.flags.chickenAlmanacRead ? T.chickenFlightLong : T.chickenFlightShort);

  const screenXY = (key) => key.split(',').map(Number);
  function heroGlobal(state) {
    const [sx, sy] = screenXY(state.player.screen);
    return { x: sx * T.width + state.player.x, y: sy * playHeight() + state.player.y };
  }

  // Moves the hero to a world position; crossing into the next screen starts
  // its slide, and the flight carries on once the slide is done.
  function moveHero(state, gx, gy) {
    const player = state.player;
    const sx = Math.floor(gx / T.width);
    const sy = Math.floor(gy / playHeight());
    const key = `${sx},${sy}`;
    const x = gx - sx * T.width;
    const y = gy - sy * playHeight();
    if (key === player.screen) {
      player.x = x;
      player.y = y;
      return;
    }
    const [cx, cy] = screenXY(player.screen);
    const dir = sx > cx ? 'right' : sx < cx ? 'left' : sy > cy ? 'down' : 'up';
    VL.enterScreen(state, { area: player.area, screen: key, x, y }, dir);
    player.flight.room = state.room;
  }

  // Looks along the flight: `land` is the farthest tile it can set the hero
  // down on, `reach` the farthest it gets before a wall (water and chasms are
  // flown over, anything else solid stops it, and so does the world's edge).
  VL.planFlight = function planFlight(state, facing = state.player.facing) {
    const [dx, dy] = DIRS[facing] || DIRS.down;
    const { tx, ty } = VL.heroTile(state);
    const { area, screen } = state.player;
    const longest = VL.chickenFlightTiles(state) + 1;
    let land = 0;
    let reach = 0;
    let over = null;
    for (let n = 1; n <= longest; n += 1) {
      const x = tx + dx * n;
      const y = ty + dy * n;
      if (!VL.isSolidAt(area, screen, x, y, state.room)) {
        land = n;
        reach = n;
        continue;
      }
      const info = VL.tileInfo(area, VL.tileAt(area, screen, x, y, state.room));
      if (!info.flyOver) break;
      reach = n;
      over = info.water ? 'water' : 'chasm';
    }
    return { dx, dy, tx, ty, land, reach, over: land === reach ? null : over };
  };

  function nearestChicken(state) {
    const player = state.player;
    let best = null;
    let bestDist = T.chickenReach;
    for (const c of room(state).entities) {
      if (!isChicken(c) || !grounded(c)) continue;
      const dist = Math.hypot(c.px - player.x, c.py - player.y);
      if (dist <= bestDist) {
        best = c;
        bestDist = dist;
      }
    }
    return best;
  }

  VL.startFlight = function startFlight(state) {
    const player = state.player;
    if (player.flight || state.transition) return false;
    const c = player.carrying || nearestChicken(state);
    if (!c) return false;
    if (player.carrying !== c) takeUp(state, c);
    const plan = VL.planFlight(state);
    const start = heroGlobal(state);
    const [sx, sy] = screenXY(player.screen);
    const n = plan.land || plan.reach;
    const target = VL.tileCenter(plan.tx + plan.dx * n, plan.ty + plan.dy * n);
    const to = { x: sx * T.width + target.x, y: sy * playHeight() + target.y };
    const dist = Math.hypot(to.x - start.x, to.y - start.y);
    player.flight = {
      phase: n ? 'out' : 'hop', plan, start, from: start, to, t: 0,
      dur: n ? Math.max(0.4, dist / T.chickenFlightSpeed) : 0.45, room: state.room, flapAt: 0,
    };
    player.moving = false;
    player.lift = 0;
    // W6's knockback would nudge the hero off the flight path each step.
    player.knockback = null;
    state.events.push({ type: 'chickenFlight' });
    return true;
  };

  function endFlight(state) {
    const player = state.player;
    player.flight = null;
    player.lift = 0;
    if (player.carrying) player.carrying.since = state.time;
    state.events.push({ type: 'chickenLand' });
  }

  function nextPhase(state, flight) {
    const player = state.player;
    const here = heroGlobal(state);
    const back = (phase) => Object.assign(flight, {
      phase, from: here, to: flight.start, t: 0,
      dur: Math.max(0.4, Math.hypot(flight.start.x - here.x, flight.start.y - here.y) / T.chickenFlightSpeed),
    });
    if (flight.phase === 'out' && flight.plan.over) {
      Object.assign(flight, { phase: 'dip', t: 0, dur: T.chickenDipSeconds });
      if (flight.plan.over === 'water') addFx(state, 'splash', player.x, player.y, 0.7);
      state.events.push({ type: flight.plan.over === 'water' ? 'chickenSplash' : 'chickenTired' });
    } else if (flight.phase === 'dip') {
      back('back');
    } else if (flight.phase === 'out' && VL.isBlocked(player.area, player.screen, player.x, player.y, T.heroBox.w, T.heroBox.h, state.room)) {
      // Someone stepped onto the landing tile mid-flight.
      back('back');
    } else {
      endFlight(state);
    }
  }

  function liftFor(flight) {
    const L = T.chickenFlightLift;
    const ramp = 0.18;
    const k = flight.t / flight.dur;
    if (flight.phase === 'hop') return L * 0.6 * Math.sin(Math.PI * Math.min(1, k));
    if (flight.phase === 'dip') return L * (1 - 0.85 * Math.sin(Math.PI * Math.min(1, k)));
    const up = flight.phase === 'out' ? Math.min(1, flight.t / ramp) : 1;
    const down = flight.phase === 'out' && flight.plan.over ? 1 : Math.min(1, (flight.dur - flight.t) / ramp);
    return L * VL.smoothstep(VL.clamp(Math.min(up, down), 0, 1)) + Math.sin(flight.t * 16) * 0.8;
  }

  function updateFlight(state, dt) {
    const player = state.player;
    const flight = player.flight;
    // The hero was put somewhere else (fainted and respawned): no hanging in the air.
    if (flight.room !== state.room) {
      player.flight = null;
      player.lift = 0;
      return;
    }
    flight.t = Math.min(flight.dur, flight.t + dt);
    flight.flapAt -= dt;
    if (flight.flapAt <= 0) {
      flight.flapAt = 0.28;
      state.events.push({ type: 'chickenFlap' });
    }
    if (flight.phase === 'out' || flight.phase === 'back') {
      const k = flight.t / flight.dur;
      moveHero(state, flight.from.x + (flight.to.x - flight.from.x) * k, flight.from.y + (flight.to.y - flight.from.y) * k);
    }
    player.lift = Math.max(0, liftFor(flight));
    if (state.transition) return;
    if (flight.t >= flight.dur) nextPhase(state, flight);
  }

  // ---------- the system ----------

  VL.defineHeroLayer('chickens', (ctx, state, x, y, t, pass) => {
    const player = state.player;
    if (pass !== 'front' || !player.carrying) return;
    VL.drawChicken(ctx, player.carrying, x, y - 9 - Math.round(player.lift || 0), t, { flap: Boolean(player.flight) || Math.floor(t * 0.7) % 4 === 0, shadow: false });
  });

  VL.defineSystem('chickens', {
    // After hands (20), so a lift by S's interact is in place before a throw is considered.
    order: 25,
    update(state, actions, dt) {
      const player = state.player;
      bringFollower(state);
      if (player.flight) updateFlight(state, dt);
      else if (actions.pressed.fly) VL.startFlight(state);
      else if (actions.pressed.interact && player.carrying && player.carrying.since !== state.time) throwChicken(state);

      for (const event of state.events) {
        if (event.type !== 'swing') continue;
        for (const c of room(state).entities.filter((e) => isChicken(e) && grounded(e))) {
          if (event.tiles.some(({ tx, ty }) => tx === c.x && ty === c.y)) hit(state, c);
        }
      }

      for (const e of room(state).entities.slice()) {
        if (e.type === 'chickenFx') {
          e.t += dt;
          if (e.t >= e.dur) remove(state, e);
          continue;
        }
        if (!isChicken(e)) continue;
        if (e.mode === 'air') updateThrown(state, e, dt);
        else if (e.mode === 'hop') updateHop(state, e, dt);
        else if (e.mode === 'home') {
          e.z = 6 + Math.sin(state.time * 12) * 1.5;
          if (moveToward(e, e.homeTo.x, e.homeTo.y, 50, dt)) settle(state, e);
        } else if (e.mode === 'follow') follow(state, e, dt);
        else wander(state, e, dt);
        syncTile(e);
      }
      updateSwarm(state, dt);
    },
  });

  // ---------- progression ----------

  // The town's chickens: their screens open the `chickens` place.
  const townChickenScreens = () => Object.values(VL.SPOTS)
    .filter((spot) => spot.how === 'chicken' && spot.lock === 'chickens')
    .map((spot) => `${spot.area}:${spot.screen}`);
  VL.defineLock('chickens', {
    ...VL.LOCKS.chickens,
    reached: (state) => townChickenScreens().some((key) => state.visited[key]),
    place: { area: 'overworld', screen: '2,1' },
  });
  // A flight works from the very start (a secret); the Almanac makes it long.
  VL.defineLock('chickenFlightShort', { ...VL.LOCKS.chickenFlightShort, reached: (state) => VL.LOCKS.chickens.reached(state) });
  VL.defineLock('chickenFlightLong', {
    ...VL.LOCKS.chickenFlightLong,
    reached: (state) => VL.LOCKS.chickens.reached(state) && Boolean(state.flags.chickenAlmanacRead),
  });
})();
