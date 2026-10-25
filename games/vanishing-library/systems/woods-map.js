// The Whispering Woods' gate (design: The world, "You need the copied map to
// get through"): without the copied map, every step from one Woods screen
// into another turns the hero back to the edge of the Woods. With it the
// paths are true (the wrong turns still wind back, regions/woods.js), and
// the scribes' old marks on the trees show the way on. README "The
// Whispering Woods (W15)".
(() => {
  VL.WOODS_ENTRY = { area: 'overworld', screen: '5,-1', tx: 6, ty: 9, facing: 'down' };
  VL.WOODS_TURNED_TEXT = 'The trees whisper... and you\'re back at the edge of the Woods.';

  VL.definePopup('woodsLost', {
    title: 'The Whispering Woods',
    text: 'The trees whisper, the paths twist... and you\'re back where you came in! You need a map of these woods. Wasn\'t there a picture of them in the Old Scriptorium?',
  });
  VL.definePopup('woodsWithMap', {
    title: 'The Whispering Woods',
    text: 'Your copy of the mural shows the way! Look for the scribes\' blue marks on the trees and follow them to the heart of the Woods.',
  });

  const inWoods = (area, key) => area === 'overworld' && VL.regionOf(area, key) === 'woods';
  const hasMap = (state) => VL.hasItem(state, VL.REGIONS.woods.softGate);

  VL.defineEdgeRule('woods', (state, area, from, to) => (inWoods(area, from) && inWoods(area, to) && !hasMap(state) ? VL.WOODS_ENTRY : null));

  // The Woods screen the hero stands on, for the copy's "you are here".
  VL.woodsMapHere = (state) => (state?.player && inWoods(state.player.area, state.player.screen) ? state.player.screen : null);

  // ---------- the marks ----------

  // On each route screen, a tree on the edge that leads on, next to the
  // first open tile of that edge (the one before it if it is a tree).
  const blazes = {};
  VL.woodsBlaze = function woodsBlaze(key) {
    if (key in blazes) return blazes[key];
    const route = VL.WOODS_ROUTE;
    const index = route.indexOf(key);
    blazes[key] = null;
    if (index === -1 || index === route.length - 1) return null;
    const { cols, rows } = VL.TUNING;
    const [ax, ay] = key.split(',').map(Number);
    const [bx, by] = route[index + 1].split(',').map(Number);
    const [dx, dy] = [bx - ax, by - ay];
    const length = dx ? rows : cols;
    const at = (i) => (dx ? { x: dx < 0 ? 0 : cols - 1, y: i } : { x: i, y: dy < 0 ? 0 : rows - 1 });
    const solid = ({ x, y }) => VL.isSolidAt('overworld', key, x, y);
    for (let i = 0; i < length; i += 1) {
      if (solid(at(i)) || VL.isSolidAt('overworld', key, at(i).x + dx, at(i).y + dy)) continue;
      const tree = [at(i - 1), at(i + 1)].find((spot) => spot.x >= 0 && spot.y >= 0 && spot.x < cols && spot.y < rows && solid(spot));
      blazes[key] = tree || null;
      break;
    }
    return blazes[key];
  };

  VL.onRoomBuilt((state) => {
    const room = state.room;
    if (!inWoods(room.area, room.screen) || !hasMap(state)) return;
    const mark = VL.woodsBlaze(room.screen);
    if (mark) room.entities.push({ type: 'woodsBlaze', x: mark.x, y: mark.y });
  });

  // A ring of blue paint round the trunk, with a ribbon end fluttering.
  VL.ART.defineSprite('prop-woods-blaze', {
    outline: false,
    colors: { o: 'outline', b: 'water', l: 'waterLight', w: 'white' },
    rows: [
      '.oooooooo.',
      'obllwwllbo',
      'obbbllbbbo',
      '.oooooooo.',
      '....obbo..',
      '....oblbo.',
      '.....obbo.',
      '......oo..',
    ],
  });

  VL.defineEntity('woodsBlaze', {
    draw(ctx, mark, x, y, t) {
      VL.ART.drawSprite(ctx, 'prop-woods-blaze', x + 3, y + 9 + (Math.sin(t * 3) > 0.7 ? 1 : 0));
      if (Math.sin(t * 2.5) > 0.5) VL.ART.rect(ctx, 'white', x + 6, y + 9, 2, 1);
    },
  });

  // ---------- telling the player ----------

  VL.defineSystem('woodsMap', {
    order: 12,
    update(state) {
      for (const event of state.events) {
        if (event.type === 'edgeTurned' && event.rule === 'woods') {
          if (state.popups.seen.woodsLost || state.popups.queue.includes('woodsLost')) VL.showMessage(state, { text: VL.WOODS_TURNED_TEXT });
          else VL.showPopup(state, 'woodsLost');
          state.events.push({ type: 'woodsWhisper' });
        } else if (event.type === 'enterScreen' && inWoods(event.area, event.screen) && hasMap(state)) {
          VL.showPopup(state, 'woodsWithMap');
        }
      }
    },
  });

  VL.defineSfx('woodsWhisper', [
    { wave: 'noise', dur: 0.9, vol: 0.3, attack: 0.3, filter: { type: 'bandpass', freq: 900, to: 1800 } },
    { wave: 'sine', freq: 520, to: 390, at: 0.1, dur: 0.6, vol: 0.12 },
  ], { gap: 0.8 });
  VL.SOUND.onEvent('woodsWhisper', 'woodsWhisper');
})();
