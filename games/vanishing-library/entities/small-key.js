// { type: 'smallKey', id, x, y, lock, reveal?: 'cleared' }: a small key of
// the dungeon it lies in, found once (its found flag) and counted in that
// dungeon's keys. With `reveal: 'cleared'` it appears once every enemy in
// the room is beaten (Zelda's key drop).
(() => {
  VL.defineEntity('smallKey', {
    prepare(state, copy) {
      if (VL.spotFound(state, copy.id)) return false;
      copy.hidden = copy.reveal === 'cleared';
      return true;
    },
    onStand(state, key) {
      VL.dungeonPickup(state, key, (s, dungeonId) => VL.smallKeyFound(s, dungeonId));
    },
    draw(ctx, key, x, y, t) {
      if (key.hidden) return;
      const bob = Math.round(Math.sin(t * 3) * 1.5);
      VL.ART.drawShadow(ctx, x + 8, y + 13, 7);
      VL.ART.drawSprite(ctx, 'item-small-key', x + 6, y + 2 + bob);
      VL.ART.drawSparkle(ctx, x + 12, y + 3 + bob, t);
    },
  });
})();
