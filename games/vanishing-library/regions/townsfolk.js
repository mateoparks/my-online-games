// Townsfolk for flavour, placed on the town screens in town.js. Placeholders
// that W10 and W11 replace or extend (the shopkeeper, the librarian, hints).
(() => {
  VL.defineNpc('gran', { name: 'Gran Ottie', look: 'elder', wander: 1 });
  VL.defineDialogue('gran', [
    {
      when: { notFlag: 'met:gran' },
      say: ['Oh! You must be {name}, from the hut down by the beach.', 'I have lived by this well for seventy years. Come and chat whenever you like.'],
      set: 'met:gran',
    },
    { when: { progress: 'lake' }, say: 'You found the lake? My grandfather swore there was an island out there, with something shiny on it.' },
    { say: ['The water in this well is the sweetest in town, {name}.', 'Just don\'t tell the river I said so.'] },
  ]);

  VL.defineNpc('nell', { name: 'Nell', look: 'fisher', wander: 2 });
  VL.defineDialogue('nell', [
    { when: { progress: 'cliffs' }, say: 'You went up the cliff road? Wave to the old lighthouse for me next time, {name}.' },
    { say: ['Nothing is biting today, {name}.', 'The tide brings in shells every morning. The gulls always leave the broken ones.'] },
  ]);

  VL.defineNpc('bramble', { name: 'Mr. Bramble', look: 'gardener', wander: 2 });
  VL.defineDialogue('bramble', [
    { say: ['The librarian planted these flowers himself, you know.', 'He used to water them every morning. These days he mostly stares at his empty shelves.'] },
  ]);

  VL.defineNpc('juniper', { name: 'Juniper', look: 'townsfolk', wander: 1 });
  VL.defineDialogue('juniper', [
    { say: 'Clang, clang, clang! The smithy hammers all day long. I could listen to it forever. Could you, {name}?' },
  ]);
})();
