// { type: 'dungeonMap', id, x, y }: the dungeon's map, found once. With it
// the map screen (M, scenes/dungeon-map.js) shows every room and marks the
// boss's; without it only the rooms visited so far.
(() => {
  VL.definePopup('dungeonMap', {
    title: 'A dungeon map!',
    text: 'Press M to see every room of this dungeon, and where its guardian waits.',
  });

  VL.defineEntity('dungeonMap', {
    prepare: (state, copy) => !VL.spotFound(state, copy.id),
    onStand(state, map) {
      VL.dungeonPickup(state, map, (s, dungeonId) => {
        VL.giveDungeonMap(s, dungeonId);
        VL.showPopup(s, 'dungeonMap');
      });
    },
    draw(ctx, map, x, y, t) {
      const bob = Math.round(Math.sin(t * 3) * 1.5);
      VL.ART.drawShadow(ctx, x + 8, y + 13, 9);
      VL.ART.drawSprite(ctx, 'pickup-dungeon-map', x + 4, y + 3 + bob);
      VL.ART.drawSparkle(ctx, x + 13, y + 3 + bob, t);
    },
  });
})();
