// { type: 'bossKey', id, x, y, lock, reveal?: 'cleared' }: the dungeon's boss
// key, found once; the boss door shows it rather than spends it.
(() => {
  VL.defineEntity('bossKey', {
    prepare(state, copy) {
      if (VL.spotFound(state, copy.id)) return false;
      copy.hidden = copy.reveal === 'cleared';
      return true;
    },
    onStand(state, key) {
      VL.dungeonPickup(state, key, (s, dungeonId) => VL.giveBossKey(s, dungeonId));
    },
    draw(ctx, key, x, y, t) {
      if (key.hidden) return;
      const bob = Math.round(Math.sin(t * 3) * 1.5);
      VL.ART.drawShadow(ctx, x + 8, y + 13, 8);
      VL.ART.drawSprite(ctx, 'item-boss-key', x + 6, y + 1 + bob);
      VL.ART.drawSparkle(ctx, x + 12, y + 2 + bob, t);
    },
  });
})();
