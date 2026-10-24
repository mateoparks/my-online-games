// Things picked up by walking over them: bush drops ({ type: 'drop', kind:
// wood | shell | heart }, made by systems/foliage.js and fading after a
// while) and shells on the beach ({ type: 'shell', whole?, id? }: broken ones
// wash up again on every visit; a whole one with an id is found once).
(() => {
  const shell = { s: 'shell', S: 'shellDark' };
  VL.ART.defineSprite('pickup-shell-broken', { colors: shell, rows: ['.sss...', 'sSsS...', 'sSsSs..', '.sSsSs.', '..sSs..', '..sss..'] });
  VL.ART.defineSprite('icon-shell-broken', { outline: false, colors: shell, rows: ['.sss...', 'sSsS...', 'sSsSs..', '.sSsSs.', '..sSs..', '..sss..'] });
  const log = { w: 'wood', l: 'woodLight', d: 'woodDark', r: 'sandLight' };
  VL.ART.defineSprite('pickup-wood', { colors: log, rows: ['.wwwwwwr.', 'llllllrdr', 'wwwwwwrrr', '.ddddddr.'] });
  VL.ART.defineSprite('icon-wood', { outline: false, colors: log, rows: ['.wwwwwwr.', 'llllllrdr', 'wwwwwwrrr', '.ddddddr.'] });
  VL.ART.defineSprite('pickup-heart', { colors: { r: 'heart', l: 'heartLight' }, rows: ['.rr.rr.', 'rllrrrr', 'rlrrrrr', '.rrrrr.', '..rrr..', '...r...'] });
  const leaf = { l: 'bush', s: 'bushShine', d: 'bushDark' };
  VL.ART.defineSprite('fx-leaf', { outline: false, colors: leaf, rows: ['.ls', 'lld', 'd..'] });
  VL.ART.defineSprite('fx-leaf-2', { outline: false, colors: leaf, rows: ['sl.', 'dll', '..d'] });

  VL.definePopup('wood', { title: 'Wood!', text: 'Bushes sometimes hide wood. The smith makes gear from it, and the paper mill buys it.' });
  VL.definePopup('shell', { title: 'A seashell!', text: 'Whole shells are money in town. The number at the top counts them.' });
  VL.definePopup('brokenShell', { title: 'A broken shell', text: 'It is no good as money. Maybe it will come in handy one day.' });

  const SPRITES = { wood: 'pickup-wood', shell: 'pickup-shell', heart: 'pickup-heart' };
  const HOP = 0.3;
  const BLINK = 2;

  function take(state, entity) {
    state.room.entities = state.room.entities.filter((e) => e !== entity);
    if (state.room.standingOn === entity) state.room.standingOn = null;
  }

  VL.defineEntity('drop', {
    onStand(state, drop) {
      take(state, drop);
      if (drop.kind === 'heart') state.hp = Math.min(state.maxHp, state.hp + VL.TUNING.heartDropHeal);
      else {
        const kind = drop.kind === 'shell' ? 'shells' : drop.kind;
        VL.addResource(state, kind, 1);
        VL.showPopup(state, drop.kind);
      }
      state.events.push({ type: 'pickup', kind: drop.kind });
    },
    draw(ctx, drop, x, y, t) {
      const age = drop.age || 0;
      if (age > VL.TUNING.dropSeconds - BLINK && Math.floor(age * 10) % 2) return;
      const hop = age < HOP ? Math.round(Math.sin((age / HOP) * Math.PI) * 6) : 0;
      const id = SPRITES[drop.kind];
      const sprite = VL.ART.sprite(id);
      VL.ART.drawShadow(ctx, x + 8, y + 12, sprite.w + 1);
      VL.ART.drawSprite(ctx, id, x + 8 - Math.floor(sprite.w / 2), y + 11 - sprite.h - hop);
      if (drop.kind === 'shell') VL.ART.drawSparkle(ctx, x + 11, y + 4 - hop, t);
    },
  });

  VL.defineEntity('shell', {
    prepare(state, found) {
      return !(found.id && state.flags[`found:${found.id}`]);
    },
    onStand(state, found) {
      take(state, found);
      if (found.id) state.flags[`found:${found.id}`] = true;
      if (found.whole) {
        VL.addResource(state, 'shells', 1);
        VL.showPopup(state, 'shell');
      } else {
        VL.addResource(state, 'brokenShells', 1);
        state.flags.foundBrokenShell = true;
        VL.showPopup(state, 'brokenShell');
      }
      state.events.push({ type: 'pickup', kind: found.whole ? 'shell' : 'brokenShell' });
    },
    draw(ctx, found, x, y, t) {
      VL.ART.drawSprite(ctx, found.whole ? 'pickup-shell' : 'pickup-shell-broken', x + 5, y + 6);
      if (found.whole) VL.ART.drawSparkle(ctx, x + 11, y + 5, t + found.x * 0.37);
    },
  });

  // Leaves flying out of a cut bush, falling as they spread.
  VL.defineEntity('leaves', {
    draw(ctx, leaves, x, y) {
      const k = VL.clamp((leaves.age || 0) / VL.LEAVES_SECONDS, 0, 1);
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2 + 0.4;
        const px = x + 7 + Math.cos(a) * (3 + k * 11);
        const py = y + 7 + Math.sin(a) * (2 + k * 7) + k * k * 6;
        VL.ART.drawSprite(ctx, i % 2 ? 'fx-leaf' : 'fx-leaf-2', px, py);
      }
    },
  });

  VL.defineLock('beachBrokenShells', { ...VL.LOCKS.beachBrokenShells, reached: (state) => Boolean(state.flags.foundBrokenShell) });
})();
