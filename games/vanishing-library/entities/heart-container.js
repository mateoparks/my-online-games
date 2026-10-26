// { type: 'heartContainer', id, reveal?: 'dug' }: one more heart for good,
// found once (design: Hearts and combat). With `reveal: 'dug'` it lies
// buried until a shovel that digs its ground digs its tile (W34), then comes
// up into the hole like the Hollow Oak's moss key. README "Combat".
(() => {
  VL.tune({ heartContainerHp: 2 });

  VL.ART.defineSprite('pickup-heart-container', {
    outline: 'gold',
    colors: { r: 'heart', l: 'heartLight', w: 'white' },
    rows: ['.rrr.rrr.', 'rwllrrrrr', 'rllrrrrrr', 'rlrrrrrrr', '.rrrrrrr.', '..rrrrr..', '...rrr...', '....r....'],
  });

  VL.definePopup('heartContainer', {
    title: 'A Heart Container!',
    text: 'You have one more heart, and you are fully healed!',
  });

  VL.defineSfx('fanfare', [
    { wave: 'triangle', freq: 523, at: 0, dur: 0.12, vol: 0.4 },
    { wave: 'triangle', freq: 659, at: 0.12, dur: 0.12, vol: 0.4 },
    { wave: 'triangle', freq: 784, at: 0.24, dur: 0.12, vol: 0.4 },
    { wave: 'triangle', freq: 1046, at: 0.36, dur: 0.4, vol: 0.4 },
  ], { gap: 1 });

  VL.giveHeartContainer = function giveHeartContainer(state, id = null) {
    state.maxHp += VL.TUNING.heartContainerHp;
    state.hp = state.maxHp;
    if (id) VL.markFound(state, id);
    VL.showPopup(state, 'heartContainer');
    VL.holdUp(state, 'pickup-heart-container', { sound: 'fanfare' });
    state.events.push({ type: 'heartContainer' });
    VL.earned(state);
  };

  VL.defineEntity('heartContainer', {
    prepare(state, copy) {
      if (VL.spotFound(state, copy.id)) return false;
      copy.hidden = copy.reveal === 'dug';
      return true;
    },
    onStand(state, heart) {
      if (heart.hidden) return;
      state.room.entities = state.room.entities.filter((e) => e !== heart);
      state.room.standingOn = null;
      VL.giveHeartContainer(state, heart.id);
    },
    draw(ctx, heart, x, y, t) {
      if (heart.hidden) return;
      const bob = Math.round(Math.sin(t * 3) * 1.5);
      VL.ART.drawShadow(ctx, x + 8, y + 13, 9);
      VL.ART.drawSprite(ctx, 'pickup-heart-container', x + 4, y + 2 + bob);
      VL.ART.drawSparkle(ctx, x + 12, y + 3 + bob, t);
    },
  });

  VL.fillSpot('heartFieldA', { type: 'heartContainer', id: 'heartFieldA', reveal: 'dug' });
  VL.fillSpot('heartFieldB', { type: 'heartContainer', id: 'heartFieldB' });
})();
