// { type: 'pressurePlate', id, x, y, latch = false }: a floor plate, down
// while the hero stands on it or a block sits on it (systems/dungeon.js
// settles it every step). With `latch: true` the first press is saved for
// good, so a shutter it opens stays open after a reload even though the
// block that held it down is back at its start.
(() => {
  VL.ART.defineSprite('prop-plate', {
    outline: false,
    colors: { o: 'outline', s: 'dgnStone', d: 'dgnStoneDark', l: 'dgnStoneLight' },
    rows: [
      '.oooooooooooo.',
      'ollllllllllldo',
      'olssssssssssdo',
      'olssssssssssdo',
      'olssssssssssdo',
      'olssssssssssdo',
      'olssssssssssdo',
      'olssssssssssdo',
      'olssssssssssdo',
      'oddddddddddddo',
      '.oooooooooooo.',
    ],
  });
  VL.ART.defineSprite('prop-plate-down', {
    outline: false,
    colors: { o: 'outline', s: 'dgnStoneDark', d: 'dgnPit', l: 'dgnStone' },
    rows: [
      '.oooooooooooo.',
      'oddddddddddddo',
      'odssssssssssdo',
      'odssssssssssdo',
      'odssssssssssdo',
      'odssssssssssdo',
      'odssssssssssdo',
      'odssssssssssdo',
      'odssssssssssdo',
      'ollllllllllllo',
      '.oooooooooooo.',
    ],
  });

  VL.defineEntity('pressurePlate', {
    prepare(state, copy) {
      copy.down = false;
    },
    draw(ctx, plate, x, y) {
      VL.ART.drawSprite(ctx, plate.down ? 'prop-plate-down' : 'prop-plate', x + 1, y + 3);
    },
  });
})();
