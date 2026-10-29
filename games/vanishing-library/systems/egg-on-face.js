// Egg on his face (W38, Matthew's Easter egg): the rope's hook at a chicken
// brings back an egg that splats on the hero's face. Until he leaves the
// screen the arrows go the other way, Space and D swap hands, and everyone
// who talks only says so. It lives on the visit (state.room), so any new
// screen, a faint or a reload clears it, and it is never saved. README
// "Egg on his face (W38)".
(() => {
  VL.EGG_WORDS = 'Looks like you have some egg on your face, {name}.';

  // ---------- art ----------

  const egg = { w: 'white', s: 'foam', y: 'gold', Y: 'goldLight' };
  VL.ART.defineSprite('fx-egg', { colors: egg, rows: ['.w.', 'www', 'wws', '.s.'] });
  VL.ART.defineSprite('fx-egg-face-down', {
    outline: false,
    colors: egg,
    rows: ['.ww..ww.', 'wwwwwwws', 'wwYyywws', '.wyyyws.', '..s..s..'],
  });
  VL.ART.defineSprite('fx-egg-face-left', {
    outline: false,
    colors: egg,
    rows: ['.ww...', 'wwwww.', 'wYyws.', 'wyyws.', '.s.s..'],
  });
  VL.ART.defineSprite('fx-egg-face-right', { mirrorOf: 'fx-egg-face-left' });
  // From behind, egg dripping past both cheeks.
  VL.ART.defineSprite('fx-egg-face-up', {
    outline: false,
    colors: egg,
    rows: ['.w........w.', 'ws........ws', '.s........s.'],
  });
  // [x, y] of each splat from the top-left of the hero's 12×14 sprite.
  const FACE_AT = { down: [2, 2], up: [0, 3], left: [0, 2], right: [6, 2] };

  // ---------- the splat ----------

  VL.eggOnFace = (state) => Boolean(state?.room?.egg);

  // `eggWorn`: the egg was on when this room was built over. The new room has
  // none, so an arrow still held would now walk him straight back; like a warp
  // (state.warpHold, systems/movement.js) it is ignored until it is let go.
  VL.extendGame('eggOnFace', () => ({ eggWorn: false }), { transient: true });
  VL.onRoomBuilt((state) => {
    if (!state.eggWorn) return;
    state.eggWorn = false;
    state.warpHold = true;
  });

  VL.splatEgg = function splatEgg(state) {
    state.room.egg = { at: state.time };
    state.eggWorn = true;
    state.events.push({ type: 'eggSplat' }, { type: 'chickenCluck' });
  };

  const grounded = (c) => ['idle', 'walk', 'follow'].includes(c.mode) && !(c.z > 0);
  // The hook's point is at a chicken standing on the ground (systems/grappling-rope.js asks).
  VL.ropeHitsChicken = (state, tip) => state.room.entities.some((c) => c.type === 'chicken' && grounded(c)
    && Math.abs(tip.x - c.px) < 7 && Math.abs(tip.y - (c.py - 4)) < 7);

  VL.onFaint((state) => {
    if (state.room) state.room.egg = null;
    state.eggWorn = false;
  });

  // ---------- back to front ----------

  const SWAPS = [['up', 'down'], ['left', 'right'], ['mainHand', 'offHand']];
  function swapped(set) {
    const out = { ...set };
    for (const [a, b] of SWAPS) [out[a], out[b]] = [set[b], set[a]];
    return out;
  }
  VL.defineActionFilter('eggOnFace', (state, actions) => (VL.eggOnFace(state)
    ? { ...actions, held: swapped(actions.held), pressed: swapped(actions.pressed) }
    : actions));

  VL.overrideTalk((state) => (VL.eggOnFace(state) ? { say: VL.EGG_WORDS } : null));

  // ---------- drawing ----------

  // Over the hero, whatever he wears (drawn on top, never in his sprite).
  VL.defineHeroLayer('eggOnFace', (ctx, state, x, y, t, pass) => {
    const player = state.player;
    if (pass !== 'front' || !VL.eggOnFace(state)) return;
    // From the sprite drawn, not player.facing: `hero-hold` faces the camera.
    const { sprite, bob } = VL.ART.heroFrame(player, t);
    const facing = FACE_AT[sprite.split('-')[1]] ? sprite.split('-')[1] : 'down';
    const top = y - 10 - bob - Math.round(player.lift || 0);
    const [dx, dy] = FACE_AT[facing];
    VL.ART.drawSprite(ctx, `fx-egg-face-${facing}`, x - 6 + dx, top + dy);
  });

  // ---------- sound ----------

  VL.defineSfx('eggSplat', [
    { wave: 'noise', dur: 0.12, vol: 0.4, filter: { type: 'lowpass', freq: 1800, to: 300 } },
    { wave: 'triangle', freq: 520, to: 140, at: 0.02, dur: 0.14, vol: 0.3 },
  ], { gap: 0.2 });
  VL.SOUND.onEvent('eggSplat', 'eggSplat');
})();
