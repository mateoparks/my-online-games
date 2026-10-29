// How to beat a boss is never told up front: once the hero has fainted to a
// boss, Gran Ottie tells how it's done, until it is beaten (README "Boss
// hints"). A faint in a boss room marks `bossFainted:<id>` in the flags, and
// it outlasts the faint's trip back to the last save (W44).
(() => {
  const dungeonBoss = (id) => ({
    at: (state) => {
      const dungeon = VL.DUNGEONS[id];
      return state.player.area === dungeon.area && state.player.screen === dungeon.boss.screen && !VL.bossBeaten(state, id);
    },
    beaten: (state) => VL.bossBeaten(state, id),
  });

  VL.BOSS_HINTS = {
    scriptorium: {
      ...dungeonBoss('scriptorium'),
      say: [
        'The Bookworm got the better of you, {name}? Oh, dear me.',
        'A sword just bounces off a bookworm\'s paper coat. When I was little, we threw pots at pests like that!',
      ],
    },
    hollowOak: {
      ...dungeonBoss('hollowOak'),
      say: [
        'That old Thornback rolled right over you? Goodness!',
        'Beetles like that hide under hard plates. Hook a plate off with your rope, then strike while it\'s on its back!',
      ],
    },
    lighthouse: {
      ...dungeonBoss('lighthouse'),
      say: [
        'A crab wearing the lighthouse lens? Whatever next!',
        'Shoot its eyes from in front with your slingshot. Once both are shut it\'s dazed, and then you strike!',
      ],
    },
    lair: {
      ...dungeonBoss('lair'),
      say: [
        'You faced the Dragon? You brave thing, {name}.',
        'My granny always said a dragon can\'t stand its own fire. Send it right back, and while it\'s dazed, strike with good strong metal!',
      ],
    },
    marionettes: {
      at: (state) => state.player.area === VL.FINALE.area && state.player.screen === VL.FINALE.hall && !state.flags.marionettes,
      beaten: (state) => Boolean(state.flags.marionettes),
      say: [
        'Giant puppets, dancing all on their own? How strange!',
        'Every puppet hangs on its strings, dear. Cut the strings, and down it comes!',
      ],
    },
  };

  VL.bossFaintFlag = (id) => `bossFainted:${id}`;
  VL.bossHintDue = (state, id) => Boolean(state.flags[VL.bossFaintFlag(id)]) && !VL.BOSS_HINTS[id].beaten(state);

  VL.onFaint((state) => {
    for (const [id, hint] of Object.entries(VL.BOSS_HINTS)) {
      if (!hint.at(state)) continue;
      state.flags[VL.bossFaintFlag(id)] = true;
    }
  });
  VL.keepThroughFaint((fainted, woken) => {
    for (const id of Object.keys(VL.BOSS_HINTS)) {
      const flag = VL.bossFaintFlag(id);
      if (fainted.flags[flag] && !VL.BOSS_HINTS[id].beaten(woken)) woken.flags[flag] = true;
    }
  });

  // Gran's entries, first in her dialogue (regions/townsfolk.js; the
  // marionettes' in dungeons/workshop.js, ahead of the town's Dragon talk).
  VL.bossHintEntries = (ids) => ids.map((id) => ({ when: { test: (state) => VL.bossHintDue(state, id) }, say: VL.BOSS_HINTS[id].say }));
})();
