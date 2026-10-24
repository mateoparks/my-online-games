// { type: 'switch', id, x, y }: a lever on a stone post, thrown for good by S
// or a sword swing (a thrown pot can call VL.throwSwitch too). Saved once
// thrown (systems/dungeon.js), so a shutter it opens stays open.
(() => {
  const lever = { o: 'outline', s: 'dgnStone', d: 'dgnStoneDark', l: 'dgnStoneLight', g: 'gold', y: 'goldLight', r: 'heart' };
  VL.ART.defineSprite('prop-switch-off', {
    colors: lever,
    rows: [
      '..........',
      '.r........',
      '.gg.......',
      '..gg......',
      '...gg.....',
      '....gg....',
      '.lssssssl.',
      '.lssddssl.',
      '.lssssssl.',
      '.dddddddd.',
    ],
  });
  VL.ART.defineSprite('prop-switch-on', {
    colors: lever,
    rows: [
      '..........',
      '........y.',
      '.......gg.',
      '......gg..',
      '.....gg...',
      '....gg....',
      '.lssssssl.',
      '.lssggssl.',
      '.lssssssl.',
      '.dddddddd.',
    ],
  });

  VL.defineEntity('switch', {
    solid: true,
    passable: () => false,
    prepare(state, copy) {
      const dungeon = VL.dungeonOfArea(state.player.area);
      copy.on = Boolean(dungeon && VL.dungeonState(state, dungeon.id).switches[copy.id]);
    },
    onInteract(state, copy) {
      VL.throwSwitch(state, copy);
    },
    draw(ctx, lever, x, y) {
      VL.ART.drawShadow(ctx, x + 8, y + 14, 12);
      VL.ART.drawSprite(ctx, lever.on ? 'prop-switch-on' : 'prop-switch-off', x + 3, y + 3);
    },
  });
})();
