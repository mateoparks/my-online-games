// The shockwave (design: The path through the game, 4): the Thornback's fall
// knocks the hero out, takes what the progression table says it takes, and
// he wakes at home holding the Glowstone, with Gran Ottie there to hand him a
// couple of pieces of wood. scenes/shockwave.js has the scene and hangs this
// on VL.afterThornback. README "The shockwave (W16)".
(() => {
  VL.tune({ helperWood: 2, shockwaveDelay: 1.2 });

  VL.SHOCKWAVE_WAKE = { area: 'hut', screen: '0,0', tx: 6, ty: 5, facing: 'right' };
  VL.SHOCKWAVE_HELPER = { type: 'npc', id: 'gran', x: 8, y: 5, facing: 'left', wander: 0 };
  // The home corner a swordless hero climbs back in: its enemies keep away
  // until he has a sword again (README).
  VL.SHOCKWAVE_QUIET = ['0,0', '1,0', '0,1', '1,1'];

  VL.ART.addColors({ glowstone: '#ffe27a', glowstoneLight: '#fffbe0', glowstoneDark: '#e0a83a' });
  VL.ART.defineSprite('item-glowstone', {
    outline: 'gold',
    colors: { g: 'glowstone', l: 'glowstoneLight', d: 'glowstoneDark' },
    rows: ['..gggg..', '.gllggg.', 'gllgggdg', 'glggggdg', 'gggggddg', 'ggggdddg', '.gddddg.', '..gggg..'],
  });

  VL.defineItem('glowstone', {
    name: 'Glowstone',
    icon: 'glowstone',
    worn: true,
    about: 'Always with you. A warm stone that glows by itself and lights up dark places.',
    popup: { title: 'The Glowstone!', text: 'You woke up holding a warm stone that glows all by itself. It lights up dark places!' },
  });

  VL.definePopup('helperWood', {
    title: 'Two pieces of wood!',
    text: 'A gift from Gran Ottie. Brannock the smith makes a sword from 3 wood. Pull a bush or two for one more!',
  });

  const SWORDS = ['woodSword', 'metalSword'];

  // The Thornback's fall knocks him out in the Oak: until then the finished
  // Hollow Oak keeps its own save point (systems/dungeon.js would send it home).
  VL.keepSavePoint((state, point) => !state.flags.shockwave && VL.bossBeaten(state, 'hollowOak') && VL.savePointInDungeon(point, 'hollowOak'));

  // Takes exactly what VL.LOCKS.shockwave `loses`, so the game and the solver
  // can't drift apart: whole shells crack into broken ones. A key it can't
  // take throws; this runs from the scene's update, outside any guard, so
  // the test that feeds it an unknown key is what keeps every `loses` key
  // handled. A heart container left in the Hollow Oak is not given here but
  // on waking (VL.wakeFromShockwave), held up beside the Glowstone.
  VL.applyShockwave = function applyShockwave(state) {
    if (state.flags.shockwave) return false;
    for (const key of VL.LOCKS.shockwave.loses) {
      if (key === 'worldMap') VL.loseWorldMap(state);
      else if (key === 'shells') {
        state.inventory.brokenShells += state.inventory.shells;
        state.inventory.shells = 0;
      } else if (VL.RESOURCE_KINDS.includes(key)) state.inventory[key] = 0;
      else if (VL.ITEMS[key]) delete state.items[key];
      else throw new Error(`the shockwave cannot take ${key}`);
    }
    state.items.glowstone = true;
    state.flags.shockwave = true;
    state.savePoint = { ...VL.SHOCKWAVE_WAKE };
    VL.tidyHands(state);
    VL.earned(state);
    return true;
  };

  // The end of the scene: he is up, holding the Glowstone over his head.
  VL.wakeFromShockwave = function wakeFromShockwave(state) {
    if (!state.flags.shockwave || state.flags.shockwaveWoke) return false;
    state.flags.shockwaveWoke = true;
    // Hearts are kept: one left behind in the Hollow Oak is his now, held up
    // with its fanfare, the Glowstone beside it.
    if (!VL.spotFound(state, 'heartD2')) VL.giveHeartContainer(state, 'heartD2');
    VL.holdUp(state, 'item-glowstone');
    VL.showPopup(state, 'glowstone');
    VL.earned(state);
    return true;
  };

  // Gran's gift. She has introduced herself while giving it, so her town
  // greeting ("You must be {name}...") doesn't again. Set here, not in her
  // entry's `set`, whose flags all guard the gift in its notFlag.
  VL.defineGift('helperWood', (state, n) => {
    state.flags['met:gran'] = true;
    VL.addResource(state, 'wood', n);
    VL.holdUp(state, 'icon-wood');
    VL.showPopup(state, 'helperWood');
  });

  const inOak = (state) => state.player.area === 'hollowOak';
  const busy = (state) => Boolean(state.sceneRequest || state.transition || state.holdUp || VL.currentPopup(state)
    || state.hp <= 0 || state.player.carrying || state.player.flight || state.player.rope);
  const helperHere = (state) => state.room.entities.find((e) => e.type === 'npc' && e.helper);

  // The knock-out waits for the heart container (the reward comes first, so
  // it never feels like a punishment for winning) or for the hero to leave
  // the Hollow Oak without it; a reload before the flash plays it again, one
  // after it wakes him.
  VL.defineSystem('shockwave', {
    order: 96,
    update(state, actions, dt) {
      if (!state.flags.shockwaveDue || busy(state)) return;
      if (!state.flags.shockwave) {
        if (inOak(state) && !VL.spotFound(state, 'heartD2')) return;
        // A breath after the heart is taken before the ground starts to shake.
        state.room.shockwaveWait = (state.room.shockwaveWait || 0) + dt;
        if (state.room.shockwaveWait < VL.TUNING.shockwaveDelay) return;
        VL.requestScene(state, 'shockwave', { from: 'rumble' });
        return;
      }
      if (!state.flags.shockwaveWoke) {
        VL.requestScene(state, 'shockwave', { from: 'dark' });
        return;
      }
      const helper = helperHere(state);
      if (helper && !state.room.helperSpoke) {
        state.room.helperSpoke = true;
        VL.talkTo(state, helper);
      }
    },
  });

  VL.onRoomBuilt((state) => {
    const { room } = state;
    if (!state.flags.shockwave) return;
    const here = (where) => room.area === where.area && room.screen === where.screen;
    if (here(VL.SHOCKWAVE_WAKE) && !state.flags['gave:helperWood']) room.entities.push({ ...VL.SHOCKWAVE_HELPER, helper: true });
    if (room.area === 'overworld' && VL.SHOCKWAVE_QUIET.includes(room.screen) && !SWORDS.some((id) => VL.hasItem(state, id))) {
      room.entities = room.entities.filter((e) => !VL.isEnemy(e));
    }
  });

  // A pull that faints the hero keeps what the bush dropped: on the climb
  // back the one piece of wood still missing must never be thrown away.
  VL.onFaint((state) => {
    if (state.fainted?.cause !== 'shrub' || !state.room) return;
    const dropped = state.room.entities.filter((e) => e.type === 'drop' && e.born === state.time && e.kind !== 'heart');
    for (const drop of dropped) VL.ENTITIES.drop.onStand(state, drop);
  });

  // ---------- progression (README "Progression") ----------

  VL.defineLock('shockwave', { ...VL.LOCKS.shockwave, reached: (state) => Boolean(state.flags.shockwave) });
  VL.defineLock('helperWood', { ...VL.LOCKS.helperWood, reached: (state) => Boolean(state.flags['gave:helperWood']) });
})();
