// { type: 'copyable', x, y, copy, look: 'mural' | 'tablet', text? }: a picture
// to copy with paper and ink (VL.copyFrom). `copy` names a VL.defineCopy item;
// `text` overrides what S says about it. A mural hangs on a wall tile, a
// tablet stands on the floor; both are solid.
(() => {
  VL.ART.defineSprite('prop-mural', {
    outline: false,
    colors: { k: 'woodDark', w: 'wood', m: 'mapMoss', T: 'mapTree', i: 'mapPath', o: 'roof' },
    rows: [
      'kkkkkkkkkkkkkkkk',
      'kwwwwwwwwwwwwwwk',
      'kwmmmmmmmmmmmmwk',
      'kwmTmmTmmmTmmmwk',
      'kwmmmiimmmmmTmwk',
      'kwmTmmiimTmmmmwk',
      'kwmmmmmiimmmmmwk',
      'kwmmTmmmiimmTmwk',
      'kwmmmmTmmiiommwk',
      'kwmmmmmmmmmmmmwk',
      'kwwwwwwwwwwwwwwk',
      'kkkkkkkkkkkkkkkk',
    ],
  });
  VL.ART.defineSprite('prop-tablet', {
    outline: false,
    colors: { d: 'rockDark', r: 'rock', l: 'rockLight', s: 'rockShade' },
    rows: [
      '...dddddd...',
      '..dllllllrd.',
      '.dlrrrrrrrrd',
      '.dlrsssrsrrd',
      '.dlrrrrrrrrd',
      '.dlrssrsssrd',
      '.dlrrrrrrrrd',
      '.dlrsssssrrd',
      '.dlrrrrrrrrd',
      '.dlrssrsssrd',
      '.dlrrrrrrrrd',
      '.dsssssssssd',
      '.dddddddddd.',
    ],
  });

  VL.defineEntity('copyable', {
    solid: true,
    onInteract(state, entity) {
      VL.copyFrom(state, entity);
    },
    draw(ctx, entity, x, y) {
      if (entity.look === 'tablet') {
        VL.ART.drawShadow(ctx, x + 8, y + 15, 12);
        VL.ART.drawSprite(ctx, 'prop-tablet', x + 2, y + 2);
      } else {
        VL.ART.drawSprite(ctx, 'prop-mural', x, y + 2);
      }
    },
  });
})();
