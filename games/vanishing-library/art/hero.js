// The hero: 12×14 sprites, a standing frame and two walk frames per
// direction (`hero-<facing>-<0|1|2>`); facing right mirrors facing left.
(() => {
  const colors = { h: 'hair', H: 'hairLight', s: 'skin', S: 'skinShade', e: 'ink', t: 'tunic', d: 'tunicDark', l: 'tunicLight', b: 'boots' };
  const head = {
    down: ['....hhhh....', '...hHHhhh...', '..hhhhhhhh..', '..hssssssh..', '..sesssses..', '..ssssssss..', '...SSSSSS...'],
    up: ['....hhhh....', '...hHHhhh...', '..hhhhhhhh..', '..hhhhhhhh..', '..hhhhhhhh..', '..shhhhhhs..', '...hhhhhh...'],
    left: ['....hhhh....', '...hHHhhhh..', '..hhhhhhhhh.', '..sshhhhhhh.', '.sesshhhhhh.', '..ssssshhh..', '...SSSS.....'],
  };
  const body = {
    down: ['..lttttttl..', '.sttttbbtts.', '.stttttttts.', '..dddddddd..'],
    up: ['..tttttttt..', '.sbbbbbbbbs.', '.stttttttts.', '..dddddddd..'],
    left: ['...ltttt....', '..stttttt...', '..sbbbbbt...', '...dddddd...'],
  };
  const legs = {
    down: [
      ['..ttt..ttt..', '..bb....bb..', '..bb....bb..'],
      ['..ttt..ttt..', '..bb....bb..', '..bb........'],
      ['..ttt..ttt..', '..bb....bb..', '........bb..'],
    ],
    up: [
      ['..ttt..ttt..', '..bb....bb..', '..bb....bb..'],
      ['..ttt..ttt..', '........bb..', '..bb....bb..'],
      ['..ttt..ttt..', '..bb....bb..', '..bb........'],
    ],
    left: [
      ['...ttt.tt...', '...bb..bb...', '..bbb..bb...'],
      ['..ttt...tt..', '.bbb.....bb.', '..........b.'],
      ['....tttt....', '....bbbb....', '...bbbb.....'],
    ],
  };
  for (const facing of ['down', 'up', 'left']) {
    legs[facing].forEach((feet, frame) => {
      VL.ART.defineSprite(`hero-${facing}-${frame}`, { colors, rows: [...head[facing], ...body[facing], ...feet] });
    });
  }
  for (let frame = 0; frame < 3; frame += 1) VL.ART.defineSprite(`hero-right-${frame}`, { mirrorOf: `hero-left-${frame}` });

  // Walking alternates frames 1 and 2 with a 1px step bob; standing breathes.
  VL.ART.heroFrame = function heroFrame(player, t) {
    const facing = ['down', 'up', 'left', 'right'].includes(player.facing) ? player.facing : 'down';
    if (player.moving) {
      const step = Math.floor(t * 8) % 2;
      return { sprite: `hero-${facing}-${step + 1}`, bob: step };
    }
    return { sprite: `hero-${facing}-0`, bob: Math.round(Math.abs(Math.sin(t * 2)) * 0.6) };
  };

  // (x, y) is the centre of the feet box (state.player.x/y); boots end at y + 3.
  // `player.lift` raises the hero off the ground (a chicken flight) and leaves
  // the shadow behind on it.
  VL.ART.drawHero = function drawHero(ctx, player, x, y, t) {
    const { sprite, bob } = VL.ART.heroFrame(player, t);
    const lift = Math.round(player.lift || 0);
    VL.ART.drawShadow(ctx, x, y + 2, lift > 4 ? 9 : 11);
    VL.ART.drawSprite(ctx, sprite, x - 6, y - 10 - bob - lift);
  };
})();
