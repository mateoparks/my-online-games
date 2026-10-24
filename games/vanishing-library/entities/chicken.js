// { type: 'chicken', spot, lost? }: a chicken at its spot (systems/chickens.js
// has the behaviour). Every visit starts with one at each spot, so a chicken
// carried off or thrown away is back there next time and no flight is one-way
// (README "Chickens").
(() => {
  VL.defineEntity('chicken', {
    prepare(state, copy) {
      if (copy.lost && VL.spotFound(state, copy.spot)) return false;
      // The one in the hero's arms, or following him, is not also at home.
      if (VL.chickenWithHero(state, copy.spot)) return false;
      copy.homeScreen = `${state.player.area}:${state.player.screen}`;
      VL.setUpChicken(state, copy);
      return true;
    },
    onInteract(state, entity) {
      VL.liftChicken(state, entity);
    },
    draw(ctx, entity, x, y, t) {
      const ox = x - entity.x * VL.TUNING.tile;
      const oy = y - entity.y * VL.TUNING.tile;
      VL.drawChicken(ctx, entity, ox + entity.px, oy + entity.py, t);
    },
  });

  VL.defineEntity('chickenSwarm', {
    draw(ctx, entity, x, y, t) {
      VL.drawChicken(ctx, entity, x - entity.x * VL.TUNING.tile + entity.px, y - entity.y * VL.TUNING.tile + entity.py, t, { flap: true });
    },
  });

  VL.defineEntity('chickenFx', {
    draw(ctx, entity, x, y) {
      VL.drawChickenFx(ctx, entity, x - entity.x * VL.TUNING.tile + entity.px, y - entity.y * VL.TUNING.tile + entity.py);
    },
  });

  for (const spot of ['chickenCoop', 'chickenSquare', 'chickenRiverside', 'chickenLedge', 'chickenHighlands', 'chickenGap', 'chickenLair']) {
    VL.fillSpot(spot, { type: 'chicken' });
  }
  VL.fillSpot('lostChicken', { type: 'chicken', lost: true });
})();
