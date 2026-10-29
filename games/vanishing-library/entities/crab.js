// { type: 'crab', x, y }: a beach crab. It scuttles sideways along its row,
// pauses, turns, and hurries at a hero who steps into its row nearby. W34
// (Matthew's crab notes): beat ten on the overworld and they turn angry for
// good (one more hit, they chase him over grass too, on their own screen);
// dig all eleven sand tiles of the lake island and a crab climbs out of each,
// and beating all eleven fills the purse and the hearts, once. README "Crabs".
(() => {
  VL.tune({
    enemyCrab: { hp: 2, damage: 1, speed: 26, chargeSpeed: 31, sense: 56 },
    crabsAngryAfter: 10,
    // Under the hero's 47 px/s, so he can always walk away from one.
    angryCrabSpeed: 34,
  });
  const T = () => VL.TUNING.enemyCrab;

  VL.ART.addColors({ crab: '#e0603a', crabLight: '#ffa77a', crabDark: '#a33a22' });
  const colors = { c: 'crab', L: 'crabLight', d: 'crabDark', e: 'ink' };
  const body = ['.cc......cc.', 'cLc......cLc', '.cc.e..e.cc.', '..cccccccc..', '.cLLccccccd.', '..ccccccdd..'];
  // Angry: darker shell and frowning brows over the eyes.
  const angryColors = { c: 'crabDark', L: 'crab', d: 'outline', e: 'ink' };
  const angryBody = ['.cc......cc.', 'cLc.e..e.cLc', '.cc..ee..cc.', '..cccccccc..', '.cLLccccccd.', '..ccccccdd..'];
  for (const [prefix, look, shell] of [['enemy-crab', colors, body], ['enemy-crab-angry', angryColors, angryBody]]) {
    VL.ART.defineSprite(`${prefix}-0`, { colors: look, rows: [...shell, '.c.c....c.c.', 'c..c....c..c'] });
    VL.ART.defineSprite(`${prefix}-1`, { colors: look, rows: [...shell, '..c.c..c.c..', '.c..c..c..c.'] });
  }
  // Claws open: drawn while it pauses, snapping.
  VL.ART.defineSprite('enemy-crab-snap', { colors, rows: ['c.c......c.c', 'cLc......cLc', '.cc.e..e.cc.', '..cccccccc..', '.cLLccccccd.', '..ccccccdd..', '.c.c....c.c.', 'c..c....c..c'] });

  VL.extendGame('crabs', () => ({ crabs: { killed: 0, angry: false, feast: false } }));
  VL.definePopup('crabsAngry', { title: 'Uh oh...', text: 'For killing so many, the crabs now consider you their enemy! Watch out!' });
  VL.definePopup('crabFeast', { title: 'Eleven crabs beaten!', text: 'They leave a heap of shells behind: your shell purse is filled to the brim, and every heart is healed too!' });

  const overworld = (state) => state.player.area === 'overworld';
  function makeAngry(crab) {
    if (crab.angry) return;
    crab.angry = true;
    crab.hp += 1;
  }

  // Straight at the hero (away while calm), over any open ground; moveEnemy
  // keeps it on its screen.
  function chase(state, crab, dt) {
    const hero = VL.toHero(state, crab);
    if (hero.dist < 1) return;
    const away = crab.calm > 0 ? -1 : 1;
    const step = (away * VL.TUNING.angryCrabSpeed * dt) / hero.dist;
    VL.moveEnemy(state, crab, hero.dx * step, 0);
    VL.moveEnemy(state, crab, 0, hero.dy * step);
    crab.dir = Math.sign(hero.dx) || crab.dir;
  }

  VL.defineEnemy('crab', {
    // Light enough for the rope to pull in (systems/grappling-rope.js).
    light: true,
    tuning: 'enemyCrab',
    body: { w: 12, h: 8 },
    faint: 'A beach crab got the better of you.',
    onDefeat: (state, crab) => crabBeaten(state, crab),
    setup(state, crab) {
      if (state.crabs?.angry && overworld(state)) makeAngry(crab);
      crab.mode = 'walk';
      crab.dir = VL.random(state) < 0.5 ? -1 : 1;
      crab.timer = 1 + VL.random(state);
    },
    think(state, crab, dt) {
      if (crab.angry) {
        crab.mode = 'walk';
        chase(state, crab, dt);
        return;
      }
      crab.timer -= dt;
      if (crab.mode === 'pause') {
        if (crab.timer > 0) return;
        crab.mode = 'walk';
        crab.dir = VL.random(state) < 0.5 ? -1 : 1;
        crab.timer = 1 + VL.random(state);
        return;
      }
      const hero = VL.toHero(state, crab);
      if (crab.calm > 0) {
        crab.dir = -Math.sign(hero.dx) || crab.dir;
        VL.moveEnemy(state, crab, crab.dir * T().speed * dt, 0);
        return;
      }
      const charging = Math.abs(hero.dy) < 10 && Math.abs(hero.dx) < T().sense;
      if (charging) crab.dir = Math.sign(hero.dx) || crab.dir;
      const speed = charging ? T().chargeSpeed : T().speed;
      if (!VL.moveEnemy(state, crab, crab.dir * speed * dt, 0)) crab.dir = -crab.dir;
      if (crab.timer <= 0 && !charging) {
        crab.mode = 'pause';
        crab.timer = 0.6;
      }
    },
    draw(ctx, crab, cx, cy, t) {
      VL.ART.drawShadow(ctx, cx, cy + 5, 12);
      const look = crab.angry ? 'enemy-crab-angry' : 'enemy-crab';
      const id = crab.mode === 'pause' ? (Math.floor(t * 4) % 2 ? 'enemy-crab-snap' : 'enemy-crab-0') : `${look}-${Math.floor(t * 10) % 2}`;
      VL.ART.drawSprite(ctx, id, cx - 6, cy - 5);
    },
  });

  // ---------- the lake island's eleven ----------

  const ISLAND = '3,-3';
  let islandTiles = null;
  // Its sand tiles, all but those under a book's trunk (the ore's is one,
  // dug once the lump is picked up): Matthew's eleven.
  VL.islandDigTiles = function islandDigTiles() {
    if (islandTiles) return islandTiles;
    const screen = VL.getScreen('overworld', ISLAND);
    const trunks = screen.entities.filter((e) => e.type === 'bookTrunk');
    islandTiles = [];
    screen.tiles.forEach((row, ty) => [...row].forEach((ch, tx) => {
      if (VL.tileInfo('overworld', ch).sand && !trunks.some((e) => e.x === tx && e.y === ty)) islandTiles.push({ tx, ty });
    }));
    return islandTiles;
  };

  function islandDug(state, event) {
    const room = state.room;
    if (room.area !== 'overworld' || room.screen !== ISLAND || event.ground !== 'sand' || room.crabEgg) return;
    const tiles = VL.islandDigTiles();
    if (!tiles.some((t) => t.tx === event.tx && t.ty === event.ty)) return;
    room.islandDug = room.islandDug || new Set();
    room.islandDug.add(`${event.tx},${event.ty}`);
    if (room.islandDug.size < tiles.length) return;
    room.crabEgg = { left: tiles.length };
    for (const { tx, ty } of tiles) {
      const crab = VL.spawnEnemy(state, 'crab', tx, ty);
      crab.egg = true;
      crab.arriving = VL.TUNING.enemyArrivalSeconds;
    }
    state.events.push({ type: 'crabsOut' });
  }

  function crabFeast(state) {
    const crabs = state.crabs;
    if (crabs.feast) return;
    crabs.feast = true;
    const room = VL.shellCap(state) - state.inventory.shells;
    if (room > 0) VL.addResource(state, 'shells', room);
    state.hp = state.maxHp;
    VL.showPopup(state, 'crabFeast');
    VL.earned(state);
  }

  function crabBeaten(state, crab) {
    if (state.room.area !== 'overworld') return;
    if (crab?.egg) {
      const egg = state.room.crabEgg;
      if (egg && (egg.left -= 1) === 0) crabFeast(state);
      return;
    }
    const crabs = state.crabs;
    crabs.killed += 1;
    if (!crabs.angry && crabs.killed >= VL.TUNING.crabsAngryAfter) {
      crabs.angry = true;
      for (const other of state.room.entities) if (other.type === 'crab') makeAngry(other);
      VL.showPopup(state, 'crabsAngry');
    }
    VL.earned(state);
  }

  VL.defineSystem('crabs', {
    order: 33,
    update(state) {
      for (const event of [...state.events]) if (event.type === 'dig') islandDug(state, event);
    },
  });

  VL.defineLock('islandCrabs', {
    needs: ['lakeIsland', ['woodShovel', 'metalShovel']], optional: true,
    doc: '§ Resources and economy: Digging',
    reached: (state) => Boolean(state.crabs?.feast),
  });
})();
