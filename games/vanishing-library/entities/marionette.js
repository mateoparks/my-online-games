// The giant marionettes of the finale (design: Ending (decided),
// Confrontation): a puppet dragon, hero and librarian, worked by Mrs.
// Fenwick from her gallery, all three at once. The sword only clonks off the
// wood; each hangs from two strings, and a blade through a string cuts it.
// With both cut a puppet drops in a heap; with all three down the fight is
// won (`flags.marionettes`). She is never fought. Nothing blinks: a hit
// shakes a puppet (the flash guard). README "The finale (W20)".
(() => {
  VL.tune({
    // hp is never run down (refilled on every clonk); the strings are its life.
    enemyMarionette: { hp: 99, damage: 1 },
    marionetteSpeed: 24,
    marionetteSagSpeed: 16,
    marionetteAttackEvery: { dragon: 3.2, hero: 2.6, librarian: 3.6 },
    marionetteWindUp: 0.6,
    marionetteLungeSpeed: 95,
    marionetteLungeSeconds: 0.35,
    marionetteShotSpeed: 62,
    marionetteJerkSeconds: 0.9,
    marionetteFallSeconds: 0.7,
  });
  const T = VL.TUNING;
  VL.MARIONETTE_NOTE = 'Clonk! It\'s only painted wood. Cut the strings that hold it up!';
  // Where the puppets dance (their centres): heads clear of her gallery, low
  // enough to come level with him on the bottom row (where he walks in), room
  // to stand beside them at the walls.
  VL.MARIONETTE_BOUNDS = { left: 56, right: 200, top: 78, bottom: 152 };
  // How far to his side a puppet hovers (centre to his feet, in x): far
  // enough that its strings are out of his reach, so he has to step in to cut
  // one (standing still and mashing doesn't win), near enough to step in fast.
  VL.MARIONETTE_STANDOFF = { min: 52, max: 96 };
  // Giant: drawn at twice the size of the art below.
  const SCALE = 2;

  // In room pixels: hands are the strings' x offsets, reach the hands' height above the centre.
  VL.PUPPET_SHAPES = {
    dragon: { hands: [-22, 22], reach: 12 },
    hero: { hands: [-18, 18], reach: 16 },
    librarian: { hands: [-18, 18], reach: 16 },
  };
  // Where the hero stands to cut a string: this far to its side, level with its chest.
  VL.STRING_REACH = { dx: 28, dy: -2 };
  // How far past the string the blade still counts: the hand and wrist below
  // it, and a little either side, so a swing from anywhere beside a puppet cuts.
  VL.STRING_SLACK = { x: 4, y: 10 };

  const shape = (m) => VL.PUPPET_SHAPES[m.puppet];
  VL.stringBottom = (m) => m.cy - shape(m).reach;
  VL.puppetsUp = (state) => state.room.entities.filter((e) => e.type === 'marionette' && !e.fallen);

  // ---------- art ----------

  VL.ART.addColors({ puppetString: '#f3ecd2', paperFire: '#ffcf6b', paperFireDark: '#e8812f' });
  VL.ART.defineSprite('fx-paper-fire', {
    colors: { f: 'paperFire', d: 'paperFireDark', w: 'white' },
    rows: ['.f.f.', 'fdfdf', 'dfwfd', '.ddd.'],
  });
  VL.ART.defineSprite('fx-thrown-book', {
    colors: { r: 'npcNavy', w: 'white' },
    rows: ['rrrrr', 'rwwwr', 'rwwwr', 'rrrrr'],
  });

  const { rect } = VL.ART;
  // A box with a dark outline round it.
  const part = (ctx, color, x, y, w, h) => {
    rect(ctx, 'outline', x - 1, y - 1, w + 2, h + 2);
    rect(ctx, color, x, y, w, h);
  };
  const joint = (ctx, x, y) => rect(ctx, 'woodLight', x, y, 1, 1);

  const LOOKS = {
    hero: { hair: 'hair', top: 'tunic', topDark: 'tunicDark', legs: 'boots' },
    librarian: { hair: 'npcSilver', top: 'npcNavy', topDark: 'npcNavyDark', legs: 'woodDark' },
  };

  // An arm from the shoulder up to the hand the string holds (or hanging when cut).
  function arm(ctx, from, hand, color) {
    const steps = 4;
    for (let i = 0; i <= steps; i += 1) {
      const x = Math.round(from.x + ((hand.x - from.x) * i) / steps);
      const y = Math.round(from.y + ((hand.y - from.y) * i) / steps);
      rect(ctx, 'outline', x - 1, y - 1, 4, 4);
      rect(ctx, i === steps ? 'skin' : color, x, y, 2, 2);
    }
  }

  function drawPerson(ctx, m, x, y, t) {
    const look = LOOKS[m.puppet];
    const sway = Math.sin(t * 2 + m.phase) * 1.5;
    const [left, right] = m.strings;
    const lean = (left.cut ? -2 : 0) + (right.cut ? 2 : 0);
    const bx = x + lean;
    // Legs dangle and swing, joined at the knee.
    for (const [lx, k] of [[-4, 1], [1, -1]]) {
      const swing = Math.round(sway * k);
      part(ctx, look.legs, bx + lx + swing, y + 5, 3, 4);
      part(ctx, look.legs, bx + lx + swing * 2, y + 9, 3, 3);
      joint(ctx, bx + lx + swing + 1, y + 9);
    }
    part(ctx, look.top, bx - 6, y - 4, 12, 9);
    rect(ctx, look.topDark, bx - 6, y + 2, 12, 1);
    if (m.puppet === 'hero') rect(ctx, 'hilt', bx - 1, y + 2, 2, 1);
    else rect(ctx, 'white', bx - 1, y - 4, 2, 3);
    // Arms up to the strings; a cut one hangs.
    const hands = shape(m).hands.map((dx, i) => (m.strings[i].cut ? { x: bx + (dx / SCALE) * 0.6, y: y + 4 } : { x: x + dx / SCALE - 1, y: y - shape(m).reach / SCALE - 1 }));
    arm(ctx, { x: bx - 7, y: y - 3 }, hands[0], look.top);
    arm(ctx, { x: bx + 5, y: y - 3 }, hands[1], look.top);
    if (m.puppet === 'librarian') part(ctx, 'heart', hands[1].x - 1, hands[1].y - 3, 4, 3);
    if (m.puppet === 'hero') part(ctx, 'wood', hands[1].x, hands[1].y - 7, 2, 7);
    // A big painted head.
    const hx = bx - 5 + (left.cut && !right.cut ? -1 : 0) + (right.cut && !left.cut ? 1 : 0);
    part(ctx, 'skin', hx, y - 14, 10, 9);
    rect(ctx, look.hair, hx, y - 14, 10, 3);
    rect(ctx, look.hair, hx, y - 11, 1, 3);
    rect(ctx, look.hair, hx + 9, y - 11, 1, 3);
    rect(ctx, 'ink', hx + 2, y - 10, 2, 2);
    rect(ctx, 'ink', hx + 6, y - 10, 2, 2);
    if (m.puppet === 'librarian') {
      rect(ctx, 'metalDark', hx + 1, y - 11, 4, 1);
      rect(ctx, 'metalDark', hx + 5, y - 11, 4, 1);
    }
    rect(ctx, 'heartLight', hx + 1, y - 8, 1, 1);
    rect(ctx, 'heartLight', hx + 8, y - 8, 1, 1);
    rect(ctx, 'woodDark', hx + 3, y - 7, 4, 1);
    joint(ctx, bx - 7, y - 3);
    joint(ctx, bx + 6, y - 3);
  }

  function drawDragon(ctx, m, x, y, t) {
    const sway = Math.sin(t * 2 + m.phase) * 1.5;
    const [head, tail] = m.strings;
    const hy = head.cut ? 4 : 0;
    const ty = tail.cut ? 4 : 0;
    for (const lx of [-6, -2, 3, 7]) part(ctx, 'leafDark', x + lx + Math.round(sway * (lx > 0 ? 1 : -1) * 0.5), y + 5, 2, 4);
    part(ctx, 'leaf', x - 8, y - 3 + Math.round((hy + ty) / 4), 17, 9);
    rect(ctx, 'leafLight', x - 7, y - 3 + Math.round((hy + ty) / 4), 15, 2);
    for (let i = 0; i < 4; i += 1) rect(ctx, 'gold', x - 5 + i * 4, y - 5 + Math.round((hy + ty) / 4), 2, 2);
    // Tail out to the right, the head out to the left, each on its string.
    part(ctx, 'leaf', x + 8, y - 2 + ty, 5, 3);
    part(ctx, 'leaf', x + 12, y - 5 + ty, 3, 4);
    part(ctx, 'leaf', x - 15, y - 8 + hy, 8, 7);
    rect(ctx, 'white', x - 13, y - 7 + hy, 2, 2);
    rect(ctx, 'ink', x - 13, y - 6 + hy, 1, 1);
    rect(ctx, 'woodDark', x - 15, y - 3 + hy, 4, 1);
    rect(ctx, 'leafLight', x - 11, y - 10 + hy, 2, 2);
    joint(ctx, x - 8, y - 2);
    joint(ctx, x + 8, y - 1);
  }

  // Both strings cut: a heap of painted wood on the floor.
  function drawHeap(ctx, m, x, y) {
    VL.ART.drawShadow(ctx, x, y + 10, 22);
    if (m.puppet === 'dragon') {
      part(ctx, 'leaf', x - 10, y + 4, 20, 5);
      part(ctx, 'leaf', x - 14, y + 2, 6, 5);
      rect(ctx, 'ink', x - 12, y + 3, 1, 1);
      return;
    }
    const look = LOOKS[m.puppet];
    part(ctx, look.top, x - 7, y + 3, 12, 6);
    part(ctx, look.legs, x + 5, y + 6, 6, 3);
    part(ctx, 'skin', x - 11, y + 1, 8, 7);
    rect(ctx, look.hair, x - 11, y + 1, 8, 2);
    rect(ctx, 'ink', x - 9, y + 4, 1, 1);
    rect(ctx, 'ink', x - 6, y + 4, 1, 1);
  }

  // ---------- behaviour ----------

  const setMode = (m, mode) => {
    m.mode = mode;
    m.timer = 0;
  };
  const clampToStage = (m) => {
    const b = VL.MARIONETTE_BOUNDS;
    m.cx = VL.clamp(m.cx, b.left, b.right);
    m.cy = VL.clamp(m.cy, b.top, b.bottom);
  };

  function pickTarget(state, m) {
    const b = VL.MARIONETTE_BOUNDS;
    const { min, max } = VL.MARIONETTE_STANDOFF;
    const px = state.player.x;
    // Its own side of him (so it never drifts across his blade), unless the
    // wall leaves no room there.
    let side = Math.sign(m.cx - px) || 1;
    if (px + side * min < b.left || px + side * min > b.right) side = -side;
    m.target = {
      x: VL.clamp(px + side * (min + VL.random(m) * (max - min)), b.left, b.right),
      // Its chest level with him, so stepping in beside it puts the blade by its hands.
      y: VL.clamp(state.player.y + 4 + (VL.random(m) - 0.5) * 20, b.top, b.bottom),
    };
  }

  function attack(state, m) {
    const { dx, dy, dist } = VL.toHero(state, m);
    const ux = dist > 0 ? dx / dist : 0;
    const uy = dist > 0 ? dy / dist : 1;
    if (m.puppet === 'hero') {
      m.lunge = { vx: ux * T.marionetteLungeSpeed, vy: uy * T.marionetteLungeSpeed };
      setMode(m, 'lunge');
      state.events.push({ type: 'puppetLunge' });
      return;
    }
    const v = T.marionetteShotSpeed;
    const from = m.puppet === 'dragon' ? { x: m.cx - 13, y: m.cy - 4 } : { x: m.cx + 9, y: m.cy - 8 };
    VL.spawnProjectile(state, {
      cx: from.x, cy: from.y, vx: ux * v, vy: uy * v, size: 'small', damage: T.enemyMarionette.damage,
      cause: 'marionette', sprite: m.puppet === 'dragon' ? 'fx-paper-fire' : 'fx-thrown-book', owner: m,
    });
    state.events.push({ type: 'puppetThrow' });
    setMode(m, 'drift');
  }

  VL.defineEnemy('marionette', {
    tuning: 'enemyMarionette',
    body: { w: 28, h: 40 },
    flies: true,
    rooted: true,
    faint: 'The giant puppets were just too much this time.',
    harmful: (m) => !m.fallen && !(m.jerk > 0) && m.mode !== 'still',
    setup(state, m) {
      m.strings = shape(m).hands.map((dx) => ({ dx, cut: Boolean(state.flags.marionettes) }));
      m.fallen = Boolean(state.flags.marionettes);
      m.fell = m.fallen ? T.marionetteFallSeconds : 0;
      m.phase = { dragon: 0, hero: 2, librarian: 4 }[m.puppet] || 0;
      m.rngState = { dragon: 11, hero: 23, librarian: 37 }[m.puppet] || 1;
      m.attackIn = T.marionetteAttackEvery[m.puppet] * (0.6 + m.phase * 0.1);
      m.jerk = 0;
      m.shake = 0;
      setMode(m, state.flags['finale:confronted'] ? 'drift' : 'still');
    },
    // The sword only clonks; a hit shakes it (no hurt blink).
    onHit(state, m) {
      m.hp = T.enemyMarionette.hp;
      m.hurt = 0;
      m.shake = 0.25;
      m.clonkedBy = state.player.swing;
    },
    think(state, m, dt) {
      m.timer += dt;
      m.shake = Math.max(0, m.shake - dt);
      if (m.fallen) {
        m.fell = Math.min(T.marionetteFallSeconds, m.fell + dt);
        return;
      }
      if (m.mode === 'still') {
        if (state.flags['finale:confronted']) setMode(m, 'drift');
        return;
      }
      if (m.jerk > 0) {
        m.jerk = Math.max(0, m.jerk - dt);
        m.cy -= 30 * dt;
        clampToStage(m);
        return;
      }
      const sagging = m.strings.some((s) => s.cut);
      const speed = sagging ? T.marionetteSagSpeed : T.marionetteSpeed;
      if (m.mode === 'lunge') {
        m.cx += m.lunge.vx * dt;
        m.cy += m.lunge.vy * dt;
        clampToStage(m);
        if (m.timer >= T.marionetteLungeSeconds) setMode(m, 'drift');
        return;
      }
      if (m.mode === 'windup') {
        if (m.timer >= T.marionetteWindUp) attack(state, m);
        return;
      }
      if (!m.target || m.timer > 3) {
        pickTarget(state, m);
        m.timer = 0;
      }
      const dx = m.target.x - m.cx;
      const dy = m.target.y - m.cy;
      const dist = Math.hypot(dx, dy);
      if (dist > 1) {
        const k = Math.min(1, (speed * dt) / dist);
        m.cx += dx * k;
        m.cy += dy * k;
      } else pickTarget(state, m);
      clampToStage(m);
      m.attackIn -= dt;
      if (m.attackIn <= 0 && !(m.calm > 0)) {
        m.attackIn = T.marionetteAttackEvery[m.puppet] * (sagging ? 1.3 : 1);
        setMode(m, 'windup');
      }
    },
    draw(ctx, m, x, y, t) {
      const top = y - m.cy;
      if (m.fallen && m.fell >= T.marionetteFallSeconds) {
        ctx.save();
        ctx.translate(x, y + 12);
        ctx.scale(SCALE, SCALE);
        drawHeap(ctx, m, 0, 0);
        ctx.restore();
        return;
      }
      const fallen = m.fallen ? (m.fell / T.marionetteFallSeconds) * 24 : 0;
      const shake = Math.round(Math.sin(t * 40) * (m.shake > 0 ? 2 : 0) + (m.mode === 'windup' ? Math.sin(t * 30) * 2 : 0));
      const px = x + shake;
      const py = Math.round(y + fallen);
      VL.ART.drawShadow(ctx, x, y + 26, m.puppet === 'dragon' ? 40 : 28);
      // The strings, straight up into the rafters.
      for (const s of m.strings) {
        if (s.cut) continue;
        rect(ctx, 'puppetString', px + s.dx, top, 1, Math.max(0, py - shape(m).reach - top));
      }
      ctx.save();
      ctx.translate(px, py);
      ctx.scale(SCALE, SCALE);
      if (m.puppet === 'dragon') drawDragon(ctx, m, 0, 0, t);
      else drawPerson(ctx, m, 0, 0, t);
      ctx.restore();
    },
  });

  // Each puppet's two strings: the blade through one cuts it (one per puppet a
  // swing, the nearest). The body only clonks, which says so once a visit.
  VL.defineSystem('marionetteStrings', {
    order: 31,
    update(state) {
      const room = state.room;
      const all = room.entities.filter((e) => e.type === 'marionette');
      if (!all.length) return;
      const swing = state.player.swing;
      // A swing that clonked wood and cut nothing says what to do, once a
      // visit, when it is over (a string may be reached later in the swing).
      const last = room.marionetteSwing;
      if (last && last.swing !== swing) {
        room.marionetteSwing = null;
        if (!last.cut && !room.marionetteNoted && all.some((m) => m.clonkedBy === last.swing)) {
          room.marionetteNoted = true;
          VL.showMessage(state, { text: VL.MARIONETTE_NOTE });
        }
      }
      if (swing && VL.TUNING.swordDamage[swing.item]) {
        const box = VL.swordBox(state.player, swing.facing);
        if (!room.marionetteSwing) room.marionetteSwing = { swing, cut: false };
        let cut = false;
        for (const m of VL.puppetsUp(state)) {
          if (m.stringSwing === swing) continue;
          const bottom = VL.stringBottom(m) + VL.STRING_SLACK.y;
          const through = m.strings.filter((s) => Math.abs(m.cx + s.dx - box.x) * 2 < box.w + 2 * VL.STRING_SLACK.x && box.y - box.h / 2 < bottom);
          if (!through.length) continue;
          // A swing through where a cut string hung catches the one left (the
          // puppet sags towards that side), so a kid who keeps to one side wins.
          const whole = m.strings.filter((s) => !s.cut);
          const hits = through.some((s) => !s.cut) ? through.filter((s) => !s.cut) : whole;
          if (!hits.length) continue;
          const string = hits.sort((a, b) => Math.abs(m.cx + a.dx - state.player.x) - Math.abs(m.cx + b.dx - state.player.x))[0];
          string.cut = true;
          cut = true;
          m.stringSwing = swing;
          m.jerk = T.marionetteJerkSeconds;
          setMode(m, 'drift');
          state.events.push({ type: 'stringCut', puppet: m.puppet });
          if (m.strings.every((s) => s.cut)) {
            m.fallen = true;
            m.fell = 0;
            state.events.push({ type: 'puppetDown', puppet: m.puppet });
          }
        }
        if (cut) room.marionetteSwing.cut = true;
      }
      // All three down (counted against the map, so a room the playthrough
      // cleared of enemies never counts as won).
      const placed = VL.getScreen(room.area, room.screen).entities.filter((e) => e.type === 'marionette').length;
      if (!state.flags.marionettes && all.length === placed && all.every((m) => m.fallen)) {
        state.flags.marionettes = true;
        state.events.push({ type: 'marionettesBeaten' });
        VL.earned(state);
      }
    },
  });

  // ---------- sound ----------

  VL.defineSfx('stringSnap', [
    { wave: 'triangle', freq: 1800, to: 600, dur: 0.12, vol: 0.3 },
    { wave: 'noise', dur: 0.06, vol: 0.2, filter: { type: 'highpass', freq: 3000 } },
  ], { gap: 0.08 });
  VL.defineSfx('puppetClatter', [
    { wave: 'square', freq: 320, to: 180, dur: 0.08, vol: 0.18 },
    { wave: 'square', freq: 260, at: 0.1, to: 150, dur: 0.08, vol: 0.18 },
    { wave: 'square', freq: 220, at: 0.2, to: 120, dur: 0.1, vol: 0.18 },
  ], { gap: 0.3 });
  VL.SOUND.onEvent('stringCut', 'stringSnap');
  VL.SOUND.onEvent('puppetDown', 'puppetClatter');
  VL.SOUND.onEvent('puppetLunge', 'swing');
  VL.SOUND.onEvent('puppetThrow', 'swing');
})();
