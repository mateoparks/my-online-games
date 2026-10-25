// { type: 'lockedDoor', id, kind: 'small' | 'boss', x, y, lock, oneWay? }:
// a door across a doorway, solid until opened with a key of this dungeon
// (walk into it or press S). Place one on each side of a screen edge with
// the same id: both open together (VL.dungeonDoorProblems insists, unless
// `oneWay: true` says the far room is only ever entered through it). Opened
// doors are saved (systems/dungeon.js).
(() => {
  const door = { o: 'outline', s: 'dgnStone', d: 'dgnStoneDark', l: 'dgnStoneLight', g: 'gold', y: 'goldLight', k: 'ink', r: 'heart' };
  VL.ART.defineSprite('prop-locked-door', {
    outline: false,
    colors: door,
    rows: [
      'oooooooooooooooo',
      'olsssssssssssslo',
      'olsddddddddddslo',
      'olsdkkkkkkkkdslo',
      'olsdkkkkkkkkdslo',
      'olsdkkkggkkkdslo',
      'olsdkkkgykkkdslo',
      'olsdkkkkgkkkdslo',
      'olsdkkkkkkkkdslo',
      'olsddddddddddslo',
      'olsssssssssssslo',
      'oooooooooooooooo',
    ],
  });
  VL.ART.defineSprite('prop-boss-door', {
    outline: false,
    colors: door,
    rows: [
      'oooooooooooooooo',
      'olsssssssssssslo',
      'olsddddddddddslo',
      'olsdkkkrrkkkdslo',
      'olsdkkrggrkkdslo',
      'olsdkkrgyrkkdslo',
      'olsdkkkggkkkdslo',
      'olsdkkkkgkkkdslo',
      'olsdkkkkkkkkdslo',
      'olsddddddddddslo',
      'olsssssssssssslo',
      'oooooooooooooooo',
    ],
  });
  VL.ART.defineSprite('prop-door-open', {
    outline: false,
    colors: door,
    rows: [
      'oooooooooooooooo',
      'olsddddddddddslo',
      'olsdkkkkkkkkdslo',
      'olsdkkkkkkkkdslo',
      'olsdkkkkkkkkdslo',
      'olsdkkkkkkkkdslo',
      'olsdkkkkkkkkdslo',
      'olsdkkkkkkkkdslo',
      'olsdkkkkkkkkdslo',
      'olsdkkkkkkkkdslo',
      'olsdkkkkkkkkdslo',
      'oooooooooooooooo',
    ],
  });

  VL.defineEntity('lockedDoor', {
    prepare(state, copy) {
      const dungeon = VL.dungeonOfArea(state.player.area);
      copy.open = Boolean(dungeon && VL.dungeonState(state, dungeon.id).doors[copy.id]);
      copy.solid = !copy.open;
    },
    // For the playthrough's pathing: open once its flag is saved.
    passable(state, entity, area) {
      const dungeon = VL.dungeonOfArea(area);
      return Boolean(dungeon && VL.dungeonState(state, dungeon.id).doors[entity.id]);
    },
    onInteract(state, copy) {
      if (copy.open) return;
      if (VL.openLockedDoor(state, copy) === 'locked') VL.lockedDoorNote(state, copy);
    },
    draw(ctx, copy, x, y) {
      VL.ART.drawSprite(ctx, copy.open ? 'prop-door-open' : copy.kind === 'boss' ? 'prop-boss-door' : 'prop-locked-door', x, y + 2);
    },
  });
})();
