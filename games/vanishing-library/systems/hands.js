// The hero's hands (design: Controls, Tools, Bare hands). S interacts with
// what the hero faces: an entity's onInteract (chest, sign), a berry bush, or
// a bush pulled by hand when no sword is in the main hand. Space and D use
// what each hand holds; Space with an empty main hand pulls a bush too.
(() => {
  VL.tune({ swingSeconds: 0.24, berryHeal: 2, pullCost: 1 });

  const isSword = (id) => Boolean(id && VL.ITEMS[id]?.sword);

  // ---------- art ----------

  const blade = { l: 'woodLight', L: 'wood', d: 'woodDark', k: 'hilt' };
  const bladeUp = ['..l..', '.lLl.', '.lLl.', '.lLl.', '.lLl.', '.lLl.', 'ddddd', '..k..', '..k..', '..d..'];
  const transpose = (rows) => [...rows[0]].map((_, x) => rows.map((row) => row[x]).join(''));
  VL.ART.defineSprite('swing-sword-wood-up', { colors: blade, rows: bladeUp });
  VL.ART.defineSprite('swing-sword-wood-down', { colors: blade, rows: bladeUp.slice().reverse() });
  VL.ART.defineSprite('swing-sword-wood-left', { colors: blade, rows: transpose(bladeUp) });
  VL.ART.defineSprite('swing-sword-wood-right', { mirrorOf: 'swing-sword-wood-left' });
  VL.ART.defineSprite('item-berry', {
    colors: { b: 'berry', r: 'berryLight', g: 'leafLight', d: 'leaf' },
    rows: ['...dg..', '..bdb..', '.brbbb.', '.bbbrb.', '..bbb..'],
  });
  VL.ART.defineSprite('icon-berry', { outline: false, colors: { b: 'berry', r: 'berryLight', g: 'leafLight' }, rows: ['..g..', '.bbb.', 'brbbb', 'bbbbb', '.bbb.'] });

  // Where the blade sits, relative to the hero's feet, when extended (`out`)
  // and wound up (`up`, at the start of the swing).
  const SWING = {
    right: { out: ['right', 5, -8], up: ['up', 2, -24], arc: [-90, 30] },
    left: { out: ['left', -15, -8], up: ['up', -7, -24], arc: [-90, -210] },
    down: { out: ['down', -5, -1], up: ['right', 4, -6], arc: [0, 120] },
    up: { out: ['up', 0, -26], up: ['left', -14, -10], arc: [180, 300] },
  };

  function drawSwing(ctx, swing, x, y) {
    const k = VL.clamp(swing.t / VL.TUNING.swingSeconds, 0, 1);
    const pose = SWING[swing.facing];
    const [dir, dx, dy] = k < 0.3 ? pose.up : pose.out;
    VL.ART.drawSprite(ctx, `swing-${VL.ITEMS[swing.item]?.icon || 'sword-wood'}-${dir}`, x + dx, y + dy);
    if (k < 0.15 || k > 0.8) return;
    // A white swoosh trailing the blade round the hero.
    const [from, to] = pose.arc;
    const cx = x;
    const cy = y - 6;
    for (let i = 0; i < 6; i += 1) {
      const a = ((from + (to - from) * Math.min(1, k * 1.4) * (i / 6)) * Math.PI) / 180;
      const px = Math.round(cx + Math.cos(a) * 15);
      const py = Math.round(cy + Math.sin(a) * 14);
      VL.ART.rect(ctx, i > 3 ? 'white' : 'foam', px, py, 2, 2);
    }
  }

  const SHIELD = { right: [5, -11, 'front'], left: [-13, -11, 'front'], down: [-4, -5, 'front'], up: [-4, -17, 'behind'] };

  VL.defineHeroLayer('hands', (ctx, state, x, y, t, pass) => {
    const player = state.player;
    if (player.shield) {
      const [dx, dy, shieldPass] = SHIELD[player.facing] || SHIELD.down;
      if (pass === shieldPass) VL.ART.drawSprite(ctx, `item-${VL.ITEMS[player.shieldItem]?.icon || 'shield-wood'}`, x + dx, y + dy);
    }
    if (player.swing && pass === (player.swing.facing === 'up' ? 'behind' : 'front')) drawSwing(ctx, player.swing, x, y);
  });

  // ---------- items ----------

  VL.defineItem('woodSword', {
    name: 'Wood Sword',
    icon: 'sword-wood',
    sword: true,
    about: 'Swing it to cut bushes.',
    popup: { title: 'You got a Wood Sword!', text: 'Press {mainKey} to swing it. Cutting bushes can turn up wood, shells and hearts.' },
    use(state, hand) {
      VL.swing(state, 'woodSword', hand);
    },
  });

  VL.defineItem('woodShield', {
    name: 'Wood Shield',
    icon: 'shield-wood',
    prefers: 'offHand',
    about: 'Hold it up to block small things.',
    popup: { title: 'You got a Wood Shield!', text: 'Hold {offKey} to raise it. Press E to choose what each hand holds.' },
    hold(state) {
      state.player.shield = true;
    },
  });

  VL.defineItem('berry', {
    name: 'Berries',
    icon: 'berry',
    about: 'Eat one to heal a heart.',
    count: (state) => state.inventory.berries,
    use(state) {
      VL.eatBerry(state);
    },
  });

  // ---------- actions ----------

  VL.defineSfx('tink', [
    { wave: 'triangle', freq: 1400, to: 1100, dur: 0.08, vol: 0.4 },
    { wave: 'sine', freq: 2100, at: 0.02, dur: 0.1, vol: 0.2 },
  ], { gap: 0.1 });
  VL.defineSfx('munch', [
    { wave: 'noise', dur: 0.05, vol: 0.4, filter: { type: 'lowpass', freq: 1400 } },
    { wave: 'noise', at: 0.09, dur: 0.05, vol: 0.4, filter: { type: 'lowpass', freq: 1200 } },
    { wave: 'triangle', freq: 520, to: 780, at: 0.18, dur: 0.12, vol: 0.35 },
  ], { gap: 0.2 });
  VL.SOUND.onEvent('swing', 'swing');
  VL.SOUND.onEvent('tink', 'tink');
  VL.SOUND.onEvent('eat', 'munch');
  VL.SOUND.onEvent('pullHurt', 'hurt');
  VL.SOUND.onEvent('pickup', (event) => (event.kind === 'shell' ? 'shell' : 'pickup'));

  // A swing cuts the bush in front, and the one beside it when the hero
  // straddles two tiles; the event carries the tiles for combat (W6).
  VL.swing = function swing(state, item, hand) {
    const player = state.player;
    if (player.swing) return false;
    player.swing = { t: 0, item, facing: player.facing };
    const tiles = VL.facingTiles(state);
    state.events.push({ type: 'swing', item, hand, tiles });
    let bounced = false;
    for (const { tx, ty } of tiles) {
      if (!VL.cutBush(state, tx, ty, 'sword') && VL.isBerryBush(state, tx, ty)) bounced = true;
    }
    if (bounced) state.events.push({ type: 'tink' });
    return true;
  };

  // Bare hands: the same bush and drops for half a heart. A shrub can win.
  VL.pullBush = function pullBush(state, tx, ty) {
    if (!VL.cutBush(state, tx, ty, 'hands')) return false;
    state.hp = Math.max(0, state.hp - VL.TUNING.pullCost);
    state.events.push({ type: 'pullHurt' });
    VL.showPopup(state, 'pull');
    if (state.hp <= 0) VL.faint(state, 'shrub');
    return true;
  };

  VL.eatBerry = function eatBerry(state) {
    if (state.inventory.berries <= 0 || state.hp >= state.maxHp) return false;
    state.hp = Math.min(state.maxHp, state.hp + VL.TUNING.berryHeal);
    VL.addResource(state, 'berries', -1);
    state.events.push({ type: 'eat' });
    return true;
  };

  // Whether S on this entity is its own: it has onInteract, and its type's
  // takesS (if any) says it wants the press now.
  VL.takesS = (state, e) => {
    const type = VL.ENTITIES[e.type];
    return Boolean(type?.onInteract) && (!type.takesS || type.takesS(state, e));
  };

  // S tries the tile ahead first, then the ones the hero half faces, so a
  // hero standing a little off the chest still opens it. One thing per press,
  // tile by tile: an entity or berries there, else (bare-handed) one bush.
  VL.interact = function interact(state) {
    const tiles = VL.facingTiles(state);
    for (const { tx, ty } of tiles) {
      const entity = state.room.entities.find((e) => e.x === tx && e.y === ty && VL.takesS(state, e));
      if (entity) {
        VL.ENTITIES[entity.type].onInteract(state, entity);
        return true;
      }
      if (VL.pickBerries(state, tx, ty)) return true;
    }
    if (isSword(VL.heldItem(state, 'mainHand'))) return false;
    return tiles.some(({ tx, ty }) => VL.pullBush(state, tx, ty));
  };

  VL.definePopup('controls', {
    title: 'Welcome, {name}!',
    text: '←→↑↓ walk. S picks up, talks, reads and opens chests. E shows your equipment. Esc pauses.',
  });
  VL.definePopup('pull', {
    title: 'Ouch!',
    text: 'Pulling bushes by hand costs half a heart, but they can still hide wood, shells and hearts.',
  });

  VL.defineSystem('hands', {
    order: 20,
    update(state, actions, dt) {
      const player = state.player;
      if (player.swing) {
        player.swing.t += dt;
        if (player.swing.t >= VL.TUNING.swingSeconds) player.swing = null;
      }
      player.shield = false;
      // Hands are full with a chicken overhead (systems/chickens.js: S throws
      // it), or busy with the rope while its hook is out.
      if (player.carrying || player.flight || player.rope) return;
      for (const hand of VL.HANDS) {
        const id = VL.heldItem(state, hand);
        if (id && actions.held[hand]) VL.ITEMS[id]?.hold?.(state, hand);
      }
      if (actions.pressed.interact) VL.interact(state);
      for (const hand of VL.HANDS) {
        if (!actions.pressed[hand] || state.hp <= 0) continue;
        const id = VL.heldItem(state, hand);
        if (id) VL.ITEMS[id]?.use?.(state, hand);
        else if (hand === 'mainHand') VL.facingTiles(state).some(({ tx, ty }) => VL.pullBush(state, tx, ty));
      }
    },
  });

  // The HUD shows whole shells and what each hand holds.
  VL.ART.hudSource('shells', (state) => state.inventory?.shells ?? 0);
  VL.ART.hudSource('brokenShells', (state) => state.inventory?.brokenShells ?? 0);
  VL.ART.hudSource('mainHand', (state) => VL.ITEMS[VL.heldItem(state, 'mainHand')]?.icon || null);
  VL.ART.hudSource('offHand', (state) => VL.ITEMS[VL.heldItem(state, 'offHand')]?.icon || null);
})();
