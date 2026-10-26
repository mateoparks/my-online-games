// Townsfolk for flavour, placed on the town screens in town.js. Placeholders
// that W10 and W11 replace or extend (the shopkeeper, the librarian, hints).
(() => {
  VL.defineNpc('gran', { name: 'Gran Ottie', look: 'elder', wander: 1 });
  VL.defineDialogue('gran', [
    ...VL.bossHintEntries(['scriptorium', 'hollowOak', 'lighthouse', 'lair']),
    {
      when: { notFlag: 'met:gran' },
      say: ['Oh! You must be {name}, from the hut down by the beach.', 'I have lived by this well for seventy years. Come and chat whenever you like.'],
      set: 'met:gran',
    },
    { when: { progress: 'lake' }, say: 'You found the lake? My grandfather swore there was an island out there, with something shiny on it.' },
    { say: ['The water in this well is the sweetest in town, {name}.', 'Just don\'t tell the river I said so.'] },
  ]);

  VL.defineNpc('nell', { name: 'Nell', look: 'fisher', wander: 2 });
  // The raft (W17): she lashes one with the hero's rope once the shockwave
  // has calmed the currents (the `raftyard` shop in regions/buildings.js).
  const raftWood = VL.TUNING.prices.raft.wood;
  VL.defineDialogue('nell', [
    {
      when: { progress: 'shockwave', notItem: 'raft' },
      say: [
        'Did you feel that great rumble, {name}? Ever since, the currents past the pier have gone still as a pond!',
        `That rope of yours could lash a fine raft. Bring me ${raftWood} wood and I'll make you one.`,
      ],
      shop: 'raftyard',
    },
    { when: { item: 'raft', notItem: 'oar' }, say: 'A raft won\'t go far without an oar, {name}. Mabel sells them, and Brannock can make one from wood.' },
    { when: { item: ['raft', 'oar'] }, say: ['Walk into deep water to paddle off, and bump into land to step ashore.', 'There\'s an island out in the lake, and an old wreck past the tide pools. Mind how you go!'] },
    { when: { item: 'grapplingRope' }, say: 'That\'s a good strong rope, {name}. It could lash a raft! But the currents out there are far too wild just now.' },
    { when: { progress: 'cliffs' }, say: 'You went up the cliff road? Wave to the old lighthouse for me next time, {name}.' },
    { say: ['Nothing is biting today, {name}.', 'The tide brings in shells every morning. The gulls always leave the broken ones.'] },
  ]);

  VL.defineNpc('bramble', { name: 'Mr. Bramble', look: 'gardener', wander: 2 });
  VL.defineDialogue('bramble', [
    { say: ['The librarian planted these flowers himself, you know.', 'He used to water them every morning. These days he mostly stares at his empty shelves.'] },
  ]);

  VL.defineNpc('juniper', { name: 'Juniper', look: 'townsfolk', wander: 1 });
  VL.defineDialogue('juniper', [
    // W30: between Dungeon 1 and Dungeon 2, a word about the metal shovel
    // (the Hollow Oak hides a key under grass).
    { when: { progress: 'd1Boss', notProgress: 'd2Boss' }, say: ['Have you got a metal shovel yet, {name}? Brannock makes them at the smithy.', 'They\'re very handy for digging in grass. You never know what\'s hiding under it!'] },
    { say: 'Clang, clang, clang! The smithy hammers all day long. I could listen to it forever. Could you, {name}?' },
  ]);
})();
