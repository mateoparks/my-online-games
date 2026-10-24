// { type: 'warp', x, y, to: Place }: a glowing ring on the floor that carries
// the hero to `to` (a beaten boss room's way out, to the dungeon entrance).
(() => {
  VL.defineEntity('warp', {
    onStand(state, warp) {
      VL.enterScreen(state, warp.to);
      state.events.push({ type: 'warp', to: warp.to });
    },
    draw(ctx, warp, x, y, t) {
      const { rect } = VL.ART;
      const pulse = Math.floor(t * 4) % 2;
      rect(ctx, 'dgnWarp', x + 3, y + 5, 10, 8);
      rect(ctx, 'dgnWarp', x + 2, y + 6, 12, 6);
      rect(ctx, 'dgnWarpLight', x + 5, y + 7, 6, 4);
      rect(ctx, 'dgnWarpLight', x + 4, y + 8, 8, 2);
      if (pulse) {
        rect(ctx, 'dgnWarpLight', x + 7, y + 2, 2, 2);
        rect(ctx, 'dgnWarpLight', x + 1, y + 9, 1, 1);
        rect(ctx, 'dgnWarpLight', x + 14, y + 8, 1, 1);
      } else {
        rect(ctx, 'dgnWarp', x + 7, y + 1, 2, 2);
      }
    },
  });
})();
