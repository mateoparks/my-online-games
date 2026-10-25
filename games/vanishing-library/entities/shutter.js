// { type: 'shutter', id?, x, y, open: condition }: iron bars across a doorway
// that lift while the condition holds (VL.dungeonCondition: every enemy
// beaten, a plate down, a switch thrown, a flag, the boss beaten). Settled
// every step by systems/dungeon.js, and never shut on the hero: one placed on
// the tile he enters by closes behind him once he has stepped in.
(() => {
  VL.ART.defineSprite('prop-shutter', {
    outline: false,
    colors: { o: 'outline', b: 'dgnBars', l: 'dgnBarsLight' },
    rows: [
      'oooooooooooooooo',
      'obbbbbbbbbbbbbbo',
      'o.lb.lb.lb.lb..o',
      'o.lb.lb.lb.lb..o',
      'o.lb.lb.lb.lb..o',
      'o.lb.lb.lb.lb..o',
      'o.lb.lb.lb.lb..o',
      'o.lb.lb.lb.lb..o',
      'o.lb.lb.lb.lb..o',
      'o.lb.lb.lb.lb..o',
      'o.lb.lb.lb.lb..o',
      'obbbbbbbbbbbbbbo',
      'oooooooooooooooo',
    ],
  });

  VL.defineEntity('shutter', {
    prepare(state, copy) {
      // `cleared` needs the whole room: the dungeon framework settles it as
      // soon as the room is built (VL.onRoomBuilt), before anything moves.
      copy.closed = true;
      copy.solid = false;
    },
    passable: (state, entity, area) => VL.dungeonCondition(state, entity.open, { room: null, dungeon: VL.dungeonOfArea(area)?.id }),
    draw(ctx, shutter, x, y) {
      if (!shutter.closed) return;
      VL.ART.drawSprite(ctx, 'prop-shutter', x, y + 1);
    },
  });
})();
