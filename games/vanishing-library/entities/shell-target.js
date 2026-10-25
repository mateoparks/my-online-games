// { type: 'shellTarget', id, x, y }: a painted target on a post, a switch
// only a slingshot shot throws (design: The path through the game, 6:
// "shooting switches across gaps"). The rope's hook and the sword can't, so
// what it opens stays behind the Slingshot. Saved like a switch.
(() => {
  const colors = { r: 'heart', w: 'white', y: 'gold', d: 'woodDark', l: 'wood', k: 'dgnStoneDark' };
  VL.ART.defineSprite('prop-shell-target', {
    colors,
    rows: [
      '..rrrrr..',
      '.rwwwwwr.',
      'rwrrrrrwr',
      'rwrwwwrwr',
      'rwrwrwrwr',
      'rwrwwwrwr',
      'rwrrrrrwr',
      '.rwwwwwr.',
      '..rrrrr..',
      '....d....',
      '...kkk...',
    ],
  });
  VL.ART.defineSprite('prop-shell-target-hit', {
    colors,
    rows: [
      '..yyyyy..',
      '.ywwwwwy.',
      'ywyyyyywy',
      'ywywwwywy',
      'ywywlwywy',
      'ywywwwywy',
      'ywyyyyywy',
      '.ywwwwwy.',
      '..yyyyy..',
      '....d....',
      '...kkk...',
    ],
  });

  VL.TARGET_WORDS = 'A painted target. You\'d need to hit it from afar.';

  VL.defineEntity('shellTarget', {
    isSwitch: true,
    solid: true,
    glintsInDark: true,
    prepare(state, target) {
      const dungeon = VL.dungeonOfArea(state.player.area);
      target.on = Boolean(dungeon && VL.dungeonState(state, dungeon.id).switches[target.id]);
    },
    onInteract(state) {
      VL.showMessage(state, { text: VL.TARGET_WORDS });
    },
    onShot(state, target) {
      if (VL.dungeonOf(state)) VL.throwSwitch(state, target);
    },
    draw(ctx, target, x, y, t) {
      VL.ART.drawShadow(ctx, x + 8, y + 15, 8);
      VL.ART.drawSprite(ctx, target.on ? 'prop-shell-target-hit' : 'prop-shell-target', x + 3, y + 3);
      if (!target.on) VL.ART.drawSparkle(ctx, x + 12, y + 3, t * 0.6);
    },
  });
})();
