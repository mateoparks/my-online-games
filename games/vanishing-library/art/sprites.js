// Small shared sprites: HUD hearts and the shell icon, the shell pickup, the
// chicken, and the wood sword and shield icons for the hand slots.
(() => {
  const heart = { r: 'heart', l: 'heartLight', e: 'heartEmpty' };
  VL.ART.defineSprite('heart-full', { outline: false, colors: heart, rows: ['.rr.rr.', 'rllrrrr', 'rlrrrrr', '.rrrrr.', '..rrr..', '...r...'] });
  VL.ART.defineSprite('heart-half', { outline: false, colors: heart, rows: ['.rr.ee.', 'rllreee', 'rlrreee', '.rrree.', '..rre..', '...e...'] });
  VL.ART.defineSprite('heart-empty', { outline: false, colors: heart, rows: ['.ee.ee.', 'eeeeeee', 'eeeeeee', '.eeeee.', '..eee..', '...e...'] });

  const shellRows = ['.sssss.', 'sSsSsSs', 'sSsSsSs', '.sSsSs.', '..sSs..', '..sss..'];
  VL.ART.defineSprite('icon-shell', { outline: false, colors: { s: 'shell', S: 'shellDark' }, rows: shellRows });
  VL.ART.defineSprite('pickup-shell', { colors: { s: 'shell', S: 'shellDark' }, rows: shellRows });

  // A four-point glint that shows for a moment every second, over (x, y).
  VL.ART.drawSparkle = function drawSparkle(ctx, x, y, t) {
    if ((t * 2) % 2 >= 0.4) return;
    VL.ART.rect(ctx, 'flowerWhite', x, y - 2, 1, 5);
    VL.ART.rect(ctx, 'flowerWhite', x - 2, y, 5, 1);
  };

  VL.ART.defineSprite('chicken', {
    colors: { r: 'comb', w: 'white', k: 'ink', y: 'gold', g: 'feather' },
    rows: ['...rr.....', '..wwww....', '.wwkwwy...', '.wwwwww..w', '..wwwwwwww', '..wwwwwgww', '...wwwwww.', '....y..y..', '....y..y..'],
  });

  VL.ART.defineSprite('item-sword-wood', {
    colors: { l: 'woodLight', L: 'wood', d: 'woodDark', k: 'hilt' },
    rows: ['..l..', '.lLl.', '.lLl.', '.lLl.', '.lLl.', 'ddddd', '..k..', '..k..', '..d..'],
  });
  VL.ART.defineSprite('item-shield-wood', {
    colors: { l: 'woodLight', L: 'wood', d: 'woodDark', m: 'metal' },
    rows: ['.dddddd.', 'dllLLlld', 'dlLLLLld', 'dLLmmLLd', 'dLLmmLLd', '.dLLLLd.', '..dLLd..', '...dd...'],
  });
})();
