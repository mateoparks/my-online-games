// { type: 'npc', id, x, y, wander? }: a person on a screen (talk.js says who).
// They idle and wander a few tiles around where they stand, hold still while
// the hero is close, and S facing one talks.
(() => {
  VL.tune({
    npcStepSeconds: 0.45,
    npcIdleMin: 1.2,
    npcIdleMax: 3.5,
    npcShyDistance: 28,
  });

  VL.ART.addColors({
    npcSilver: '#cfd0c8',
    npcSilverLight: '#f0f0ea',
    npcPlum: '#7d4a8c',
    npcPlumDark: '#5a3366',
    npcPlumLight: '#a46db3',
    npcNavy: '#35558f',
    npcNavyDark: '#243c69',
    npcNavyLight: '#5578b6',
    npcBlonde: '#d9b048',
    npcBlondeLight: '#f2d478',
    npcRose: '#c8485a',
    npcRoseDark: '#983244',
    npcRoseLight: '#e57585',
    npcBlack: '#3a333c',
    npcBlackLight: '#5a525d',
    npcGray: '#b3b1aa',
    skinBrown: '#a5683f',
    skinBrownShade: '#83502f',
  });

  // ---------- looks: 12×14 like the hero, three frames per facing ----------

  const HEADS = {
    short: {
      down: ['....hhhh....', '...hHHhhh...', '..hhhhhhhh..', '..hssssssh..', '..sesssses..', '..ssssssss..', '...SSSSSS...'],
      up: ['....hhhh....', '...hHHhhh...', '..hhhhhhhh..', '..hhhhhhhh..', '..hhhhhhhh..', '..shhhhhhs..', '...hhhhhh...'],
      left: ['....hhhh....', '...hHHhhhh..', '..hhhhhhhhh.', '..sshhhhhhh.', '.sesshhhhhh.', '..ssssshhh..', '...SSSS.....'],
    },
    hat: {
      down: ['...aaaaaa...', '..aAAAAAAa..', '.aaaaaaaaaa.', '..hssssssh..', '..sesssses..', '..ssssssss..', '...SSSSSS...'],
      up: ['...aaaaaa...', '..aAAAAAAa..', '.aaaaaaaaaa.', '..hhhhhhhh..', '..hhhhhhhh..', '..shhhhhhs..', '...hhhhhh...'],
      left: ['...aaaaaa...', '..aAAAAAAa..', 'aaaaaaaaaaa.', '..sshhhhhhh.', '.sesshhhhhh.', '..ssssshhh..', '...SSSS.....'],
    },
    bun: {
      down: ['.....hH.....', '...hhHHhh...', '..hHhhhhhh..', '..hssssssh..', '..sesssses..', '..ssssssss..', '...SSSSSS...'],
      up: ['.....hH.....', '...hhHHhh...', '..hhhhhhhh..', '..hhhhhhhh..', '..hhhhhhhh..', '..shhhhhhs..', '...hhhhhh...'],
      left: ['......hH....', '...hhHHhh...', '..hhhhhhhhh.', '..sshhhhhhh.', '.sesshhhhhh.', '..ssssshhh..', '...SSSS.....'],
    },
  };
  const BODY = {
    down: ['..lttttttl..', '.sttttddtts.', '.stttttttts.', '..dddddddd..'],
    up: ['..tttttttt..', '.sdddddddds.', '.stttttttts.', '..dddddddd..'],
    left: ['...ltttt....', '..stttttt...', '..sdddddt...', '...dddddd...'],
  };
  const LEGS = {
    down: [
      ['..ddd..ddd..', '..bb....bb..', '..bb....bb..'],
      ['..ddd..ddd..', '..bb....bb..', '..bb........'],
      ['..ddd..ddd..', '..bb....bb..', '........bb..'],
    ],
    up: [
      ['..ddd..ddd..', '..bb....bb..', '..bb....bb..'],
      ['..ddd..ddd..', '........bb..', '..bb....bb..'],
      ['..ddd..ddd..', '..bb....bb..', '..bb........'],
    ],
    left: [
      ['...ddd.dd...', '...bb..bb...', '..bbb..bb...'],
      ['..ddd...dd..', '.bbb.....bb.', '..........b.'],
      ['....dddd....', '....bbbb....', '...bbbb.....'],
    ],
  };

  // The hair at the temples of the short head, [row, column] per facing: a
  // look with `temples` grays these few.
  const TEMPLES = {
    down: [[3, 2], [3, 9]],
    up: [[5, 3], [5, 8]],
    left: [[3, 4], [4, 5]],
  };
  function headRows(id, head, facing, temples) {
    const rows = HEADS[head][facing];
    if (!temples) return rows;
    if (head !== 'short') throw new Error(`npc look ${id}: temples need the short head`);
    const grid = rows.map((row) => [...row]);
    for (const [r, c] of TEMPLES[facing]) grid[r][c] = 'g';
    return grid.map((row) => row.join(''));
  }

  VL.NPC_LOOKS = {};

  // colors: { hair, hairLight, top, topDark, topLight, legs, hat?, hatLight?,
  // skin?, skinShade?, temples? } (palette names).
  VL.defineNpcLook = function defineNpcLook(id, { head = 'short', colors }) {
    if (VL.NPC_LOOKS[id]) throw new Error(`npc look ${id} is already defined`);
    if (!HEADS[head]) throw new Error(`npc look ${id}: no head ${head}`);
    const map = {
      h: colors.hair, H: colors.hairLight, s: colors.skin || 'skin', S: colors.skinShade || 'skinShade', e: 'ink',
      t: colors.top, d: colors.topDark, l: colors.topLight, b: colors.legs || 'boots',
    };
    if (head === 'hat') Object.assign(map, { a: colors.hat, A: colors.hatLight });
    if (colors.temples) map.g = colors.temples;
    for (const facing of ['down', 'up', 'left']) {
      LEGS[facing].forEach((feet, frame) => {
        VL.ART.defineSprite(`npc-${id}-${facing}-${frame}`, { colors: map, rows: [...headRows(id, head, facing, colors.temples), ...BODY[facing], ...feet] });
      });
    }
    for (let frame = 0; frame < 3; frame += 1) VL.ART.defineSprite(`npc-${id}-right-${frame}`, { mirrorOf: `npc-${id}-left-${frame}` });
    VL.NPC_LOOKS[id] = { id, head };
  };

  VL.defineNpcLook('elder', { head: 'bun', colors: { hair: 'npcSilver', hairLight: 'npcSilverLight', top: 'npcPlum', topDark: 'npcPlumDark', topLight: 'npcPlumLight' } });
  VL.defineNpcLook('fisher', { head: 'hat', colors: { hair: 'hair', hairLight: 'hairLight', top: 'npcNavy', topDark: 'npcNavyDark', topLight: 'npcNavyLight', hat: 'gold', hatLight: 'goldLight' } });
  VL.defineNpcLook('gardener', { head: 'hat', colors: { hair: 'npcSilver', hairLight: 'npcSilverLight', top: 'leaf', topDark: 'leafDark', topLight: 'leafLight', hat: 'sandDark', hatLight: 'sandLight' } });
  VL.defineNpcLook('townsfolk', { head: 'short', colors: { hair: 'npcBlonde', hairLight: 'npcBlondeLight', top: 'npcRose', topDark: 'npcRoseDark', topLight: 'npcRoseLight' } });

  // ---------- wandering ----------

  const DIRS = [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]];
  const range = (npc) => npc.wander ?? VL.NPCS[npc.id]?.wander ?? 0;

  // Each visit's copy gets its own seeded random numbers, so wandering is the
  // same every visit and never shifts the game's drops (state.rngState).
  function setUp(state, npc) {
    if (npc.home) return;
    const room = state.room;
    let salt = 0;
    for (const ch of `${room.area}:${room.screen}:${npc.id}`) salt = (salt * 31 + ch.charCodeAt(0)) | 0;
    npc.home = { x: npc.x, y: npc.y };
    npc.rngState = Math.floor(VL.ART.hash(npc.x, npc.y, salt) * 0x100000000) >>> 0;
    npc.facing = npc.facing || 'down';
    npc.walk = null;
    npc.idle = VL.TUNING.npcIdleMin;
  }

  function heroNear(state, npc) {
    const feet = VL.npcFeet(npc, 0, 0);
    return Math.hypot(feet.x - state.player.x, feet.y - state.player.y) < VL.TUNING.npcShyDistance;
  }

  // Inside the screen but off its edge rows (exits), within range of home,
  // on open ground (this visit's tiles: a cut bush is open), clear of every
  // other entity and never beside one other than a person, so no one stands
  // on the only way up to a chest, a sign or a door. Tests check every
  // placed NPC against this.
  VL.npcMayStand = function npcMayStand(room, npc, tx, ty) {
    const { cols, rows } = VL.TUNING;
    const home = npc.home || npc;
    if (tx < 1 || ty < 1 || tx > cols - 2 || ty > rows - 2) return false;
    if (Math.abs(tx - home.x) > range(npc) || Math.abs(ty - home.y) > range(npc)) return false;
    if (VL.isSolidAt(room.area, room.screen, tx, ty, room)) return false;
    const taken = (e) => (e.x === tx && e.y === ty) || (e.walk && e.walk.fromX === tx && e.walk.fromY === ty);
    const beside = (e) => e.type !== 'npc' && Math.abs(e.x - tx) + Math.abs(e.y - ty) === 1;
    return !room.entities.some((e) => e !== npc && (taken(e) || beside(e)));
  };

  // ... and clear of the hero's feet box, and of the spot a chicken flight
  // may bring him back to.
  function canStep(state, npc, tx, ty) {
    if (!VL.npcMayStand(state.room, npc, tx, ty)) return false;
    const { tile, heroBox } = VL.TUNING;
    const margin = 2;
    const clear = ({ x, y }) => x + heroBox.w / 2 + margin <= tx * tile || x - heroBox.w / 2 - margin >= (tx + 1) * tile
      || y + heroBox.h / 2 + margin <= ty * tile || y - heroBox.h / 2 - margin >= (ty + 1) * tile;
    const takeOff = VL.flightStart(state);
    return clear(state.player) && (!takeOff || clear(takeOff));
  }

  function wander(state, npc, dt) {
    setUp(state, npc);
    if (npc.walk) {
      npc.walk.t += dt;
      if (npc.walk.t >= VL.TUNING.npcStepSeconds) npc.walk = null;
      return;
    }
    npc.idle -= dt;
    if (npc.idle > 0) return;
    const { npcIdleMin, npcIdleMax } = VL.TUNING;
    npc.idle = npcIdleMin + VL.random(npc) * (npcIdleMax - npcIdleMin);
    if (!range(npc) || heroNear(state, npc)) return;
    const [dir, dx, dy] = DIRS[Math.floor(VL.random(npc) * DIRS.length)];
    npc.facing = dir;
    // Sometimes they only look about.
    if (VL.random(npc) < 0.3 || !canStep(state, npc, npc.x + dx, npc.y + dy)) return;
    npc.walk = { fromX: npc.x, fromY: npc.y, t: 0 };
    npc.x += dx;
    npc.y += dy;
  }

  VL.defineSystem('npcs', {
    order: 30,
    update(state, actions, dt) {
      for (const npc of state.room.entities) if (npc.type === 'npc') wander(state, npc, dt);
    },
  });

  VL.defineEntity('npc', {
    solid: true,
    onInteract(state, entity) {
      VL.talkTo(state, entity);
    },
    draw(ctx, entity, x, y, t) {
      const look = VL.NPCS[entity.id]?.look;
      if (!look) throw new Error(`no npc ${entity.id}`);
      const { tile } = VL.TUNING;
      const feet = VL.npcFeet(entity, x - entity.x * tile, y - entity.y * tile);
      const fx = Math.round(feet.x);
      const fy = Math.round(feet.y);
      const facing = entity.facing || 'down';
      const walking = Boolean(entity.walk);
      // Each person breathes on their own beat.
      const beat = (entity.home?.x ?? entity.x) * 0.7 + (entity.home?.y ?? entity.y) * 1.3;
      const frame = walking ? 1 + (Math.floor(t * 8) % 2) : 0;
      const bob = walking ? frame - 1 : Math.round(Math.abs(Math.sin(t * 2 + beat)) * 0.6);
      VL.ART.drawShadow(ctx, fx, fy + 2, 11);
      VL.ART.drawSprite(ctx, `npc-${look}-${facing}-${frame}`, fx - 6, fy - 10 - bob);
    },
  });
})();
