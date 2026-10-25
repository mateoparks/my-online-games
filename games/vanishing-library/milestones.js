// The whole game's progression, seeded from the design doc: every milestone
// and every lock/key between a new game and the ending. Planned entries name
// the item that will claim them (README "Progression"). Each `doc` cites the
// design-doc section the rule comes from.
(() => {
  const lock = VL.defineLock;
  const anySword = ['woodSword', 'metalSword'];

  // ---------- opening (implemented against W1's placeholder world) ----------

  lock('named', { type: 'flag', doc: '§ Starting and saving: Title screen', by: 'W2' });
  lock('start', {
    type: 'place', needs: ['named'], doc: '§ Starting and saving: Intro',
    reached: (state) => Boolean(state.visited[`${VL.START.area}:${VL.START.screen}`]),
  });
  lock('hutInside', {
    type: 'place', needs: ['start'], place: { area: 'hut', screen: '0,0' }, doc: '§ The world: Town',
    reached: (state) => Boolean(state.visited['hut:0,0']),
  });
  lock('chestGear', { type: 'item', needs: ['hutInside'], gives: ['woodSword', 'woodShield'], doc: '§ The path through the game, 1', by: 'W5' });
  lock('oreShallows', { type: 'item', needs: ['beach'], supplies: { ore: 1 }, doc: '§ Tools: two tiers, Ore is scarce (1)', by: 'W5' });

  // ---------- places ----------

  lock('town', { type: 'place', needs: ['start'], doc: '§ The world: Town', by: 'W8' });
  lock('beach', { type: 'place', needs: ['start'], doc: '§ The world: Beach and tide pools', by: 'W8' });
  lock('lake', { type: 'place', needs: ['town'], doc: '§ The world: River and lake', by: 'W8' });
  lock('cliffs', { type: 'place', needs: ['town'], doc: '§ The world: Lighthouse', by: 'W8' });
  lock('eastRoad', { type: 'place', needs: ['town', 'liftingGloves'], doc: '§ The path through the game, 2', by: 'W8' });
  lock('woods', { type: 'place', needs: ['eastRoad', 'woodsMapCopy'], doc: '§ The world: Whispering Woods', by: 'W8' });
  lock('library', { type: 'place', needs: ['town'], doc: '§ People: The librarian', by: 'W11' });
  lock('shop', { type: 'place', needs: ['town'], doc: '§ Resources and economy: Shop', by: 'W10' });
  lock('paperMill', { type: 'place', needs: ['town'], doc: '§ Resources and economy: Paper mill', by: 'W10' });
  lock('blacksmith', { type: 'place', needs: ['town'], doc: '§ Resources and economy: Blacksmith', by: 'W10' });
  lock('bindery', { type: 'place', needs: ['town'], doc: '§ Resources and economy: Bindery', by: 'W10' });
  lock('berryBush', { type: 'place', needs: ['start'], doc: '§ Resources and economy: Berries', by: 'W5' });
  lock('chickens', { type: 'place', needs: ['town'], doc: '§ Chickens', by: 'W7' });
  lock('puppetStage', { type: 'place', needs: ['town'], doc: '§ The world: Town', by: 'W11' });

  // ---------- economy (renewable sources) ----------

  // Spent by what uses them, so only renewable sources count (a one-time gift is a top-up).
  VL.defineResources(['wood', 'shells', 'brokenShells', 'paper', 'ink', 'berries']);
  lock('bushBareHands', { needs: ['start'], gives: ['wood', 'shells'], renewable: true, doc: '§ Resources and economy: Bare hands', by: 'W5' });
  lock('bushCut', { needs: [anySword], gives: ['wood', 'shells'], renewable: true, doc: '§ Resources and economy: Bushes', by: 'W5' });
  lock('berries', { needs: ['berryBush'], renewable: true, doc: '§ Resources and economy: Berries', by: 'W5' });
  lock('buyBerries', { needs: ['shop', 'shells'], gives: ['berries'], renewable: true, doc: '§ Resources and economy: Shop', by: 'W10' });
  lock('beachBrokenShells', { needs: ['beach'], gives: ['brokenShells'], renewable: true, doc: '§ Resources and economy: Seashells are money', by: 'W5' });
  lock('digShells', { needs: ['beach', ['woodShovel', 'metalShovel']], gives: ['shells'], renewable: true, doc: '§ Resources and economy: Digging', by: 'W10' });
  lock('millShells', { needs: ['paperMill', 'wood'], gives: ['shells'], renewable: true, doc: '§ Resources and economy: Paper mill', by: 'W10' });
  lock('paper', { type: 'item', needs: ['paperMill', 'shells'], renewable: true, doc: '§ Resources and economy: Paper mill', by: 'W10' });
  lock('ink', { type: 'item', needs: ['mortarPestle', 'berries'], renewable: true, doc: '§ Resources and economy: Ink', by: 'W12' });
  lock('woodSword', { type: 'item', needs: ['blacksmith', 'wood'], renewable: true, doc: '§ Tools: two tiers', by: 'W10' });
  lock('woodShield', { type: 'item', needs: ['blacksmith', 'wood'], renewable: true, doc: '§ Tools: two tiers', by: 'W10' });
  lock('woodShovel', { type: 'item', needs: ['town', ['wood', 'shells']], renewable: true, doc: '§ Tools: two tiers', by: 'W10' });
  lock('metalSword', { type: 'item', needs: ['blacksmith', 'shells'], consumes: { ore: 1 }, renewable: true, doc: '§ Tools: two tiers', by: 'W10' });
  lock('metalShield', { type: 'item', needs: ['blacksmith', 'shells'], consumes: { ore: 1 }, renewable: true, doc: '§ Tools: two tiers', by: 'W10' });
  lock('metalShovel', { type: 'item', needs: ['blacksmith', 'shells'], consumes: { ore: 1 }, renewable: true, doc: '§ Tools: two tiers', by: 'W10' });
  lock('buriedSecrets', { needs: ['metalShovel'], optional: true, renewable: true, doc: '§ Tools: two tiers, Shovel', by: 'W10' });

  // ---------- books, pages and the library ----------

  lock('hiddenBooks', { type: 'item', needs: ['town', 'library'], supplies: { books: 10 }, optional: true, doc: '§ Books, pages and the library: Hidden books', by: 'W8' });
  lock('bookHerbalist', { type: 'item', needs: ['woods', 'library'], gives: ['herbalistRead'], supplies: { books: 1 }, optional: true, doc: '§ Books, pages and the library: Herbalist\'s Notes', by: 'W8' });
  lock('bookTideTables', { type: 'item', needs: ['shipwreck', 'library'], gives: ['tideTablesRead'], supplies: { books: 1 }, optional: true, doc: '§ Books, pages and the library: Tide Tables', by: 'W8' });
  lock('bookSmithsLedger', { type: 'item', needs: ['lakeIsland', 'library'], gives: ['smithsLedgerRead'], supplies: { books: 1 }, optional: true, doc: '§ Books, pages and the library: Smith\'s Ledger', by: 'W8' });
  lock('bookPrimer', { type: 'item', needs: ['eastRoad', 'library'], gives: ['primerOnShelf'], supplies: { books: 1 }, optional: true, doc: '§ Books, pages and the library: Cartographer\'s Primer', by: 'W8' });
  lock('bookDragons', { type: 'item', needs: ['highlands', 'library'], gives: ['dragonsRead'], supplies: { books: 1 }, optional: true, doc: '§ Books, pages and the library: A Child\'s Book of Dragons', by: 'W8' });
  lock('bookChickenAlmanac', { type: 'item', needs: ['woods', 'library'], gives: ['chickenAlmanacRead'], supplies: { books: 1 }, doc: '§ Books, pages and the library: The Chicken Keeper\'s Almanac', by: 'W8' });
  lock('heartLibrary', { type: 'item', needs: ['library'], count: { books: 10 }, optional: true, doc: '§ Books, pages and the library: Rewards for books returned', by: 'W11' });
  lock('shellPurse', { type: 'item', needs: ['library'], count: { books: 20 }, optional: true, doc: '§ Books, pages and the library: Rewards for books returned', by: 'W11' });
  lock('swiftfootBoots', { type: 'item', needs: ['library'], count: { books: 30 }, optional: true, doc: '§ Books, pages and the library: Rewards for books returned', by: 'W11' });
  lock('lostChicken', { needs: ['chickens', 'town'], doc: '§ Chickens: The lost chicken', by: 'W11' });
  lock('pageLostChicken', { type: 'item', needs: ['lostChicken'], supplies: { pages: 1 }, doc: '§ Chickens: The lost chicken', by: 'W11' });
  lock('pageFieldA', { type: 'item', needs: ['town'], supplies: { pages: 1 }, doc: '§ Books, pages and the library: Missing pages', by: 'W8' });
  lock('pageFieldB', { type: 'item', needs: ['lake'], supplies: { pages: 1 }, doc: '§ Books, pages and the library: Missing pages', by: 'W8' });
  lock('worldMap', { type: 'item', needs: ['primerOnShelf', 'paper', 'ink'], renewable: true, optional: true, doc: '§ Paper and ink: Your own world map', by: 'W12' });
  lock('heartFieldA', { type: 'item', needs: ['eastRoad'], optional: true, doc: '§ Hearts and combat', by: 'W8' });
  lock('heartFieldB', { type: 'item', needs: ['cliffs'], optional: true, doc: '§ Hearts and combat', by: 'W8' });

  // ---------- chickens ----------

  lock('chickenFlightShort', { needs: ['chickens'], renewable: true, doc: '§ Chickens: Chicken flight', by: 'W7' });
  lock('chickenFlightLong', { needs: ['chickens', 'chickenAlmanacRead'], renewable: true, doc: '§ Chickens: Chicken flight', by: 'W7' });

  // ---------- Dungeon 1: the Old Scriptorium ----------

  lock('hiddenBookSealed', { type: 'item', needs: ['town'], supplies: { books: 1 }, doc: '§ The path through the game, 1', by: 'W8' });
  lock('scriptoriumKey', { type: 'item', needs: ['hiddenBookSealed', 'library'], doc: '§ The path through the game, 1', by: 'W11' });
  lock('scriptoriumEntered', { type: 'place', needs: ['town', 'scriptoriumKey'], doc: '§ The world: Old Scriptorium', by: 'W14' });
  lock('liftingGloves', { type: 'item', needs: ['scriptoriumEntered'], doc: '§ The path through the game, 2', by: 'W14' });
  lock('oreScriptorium', { type: 'item', needs: ['scriptoriumEntered', 'liftingGloves'], supplies: { ore: 1 }, doc: '§ Tools: two tiers, Ore is scarce (2)', by: 'W14' });
  lock('woodsMural', { type: 'place', needs: ['scriptoriumEntered'], doc: '§ The path through the game, 2', by: 'W14' });
  lock('d1Boss', { needs: ['scriptoriumEntered', 'liftingGloves'], gives: ['mortarPestle', 'heartD1'], supplies: { books: 3 }, doc: '§ The path through the game, 2', by: 'W14' });

  // ---------- the Woods and Dungeon 2: the Hollow Oak ----------

  lock('woodsMapCopy', { type: 'item', needs: ['woodsMural', 'paper', 'ink'], doc: '§ Paper and ink: Copying', by: 'W12' });
  lock('oreWoods', { type: 'item', needs: ['woods'], supplies: { ore: 1 }, doc: '§ Tools: two tiers, Ore is scarce (3)', by: 'W8' });
  lock('hollowOakEntered', { type: 'place', needs: ['woods'], doc: '§ The path through the game, 3', by: 'W15' });
  lock('grapplingRope', { type: 'item', needs: ['hollowOakEntered'], doc: '§ The path through the game, 3', by: 'W15' });
  // W30: the Hollow Oak's thorny spitters and the key under its grass.
  lock('d2Boss', { needs: ['hollowOakEntered', 'grapplingRope', 'metalSword', 'metalShovel'], gives: ['heartD2'], doc: '§ The path through the game, 3', by: 'W15' });

  // ---------- the shockwave and rebuilding ----------

  lock('shockwave', {
    type: 'event', needs: ['d2Boss'],
    loses: ['woodSword', 'woodShield', 'woodShovel', 'metalSword', 'metalShield', 'metalShovel', 'worldMap', 'wood', 'paper', 'berries', 'ink', 'shells'],
    gives: ['glowstone', 'brokenShells'],
    doc: '§ The path through the game, 4', by: 'W16',
  });
  lock('helperWood', { needs: ['shockwave'], gives: ['wood'], doc: '§ The path through the game, 4', by: 'W16' });
  lock('raft', { type: 'item', needs: ['shockwave', 'grapplingRope', 'wood'], doc: '§ The path through the game, 5', by: 'W17' });
  lock('oar', { type: 'item', needs: ['town', ['wood', 'shells']], renewable: true, doc: '§ The path through the game, 5', by: 'W17' });
  lock('rafting', { needs: ['raft', 'oar'], doc: '§ The path through the game, 5', by: 'W17' });
  lock('lakeIsland', { type: 'place', needs: ['lake', 'rafting'], doc: '§ The world: River and lake', by: 'W17' });
  lock('oreLakeIsland', { type: 'item', needs: ['lakeIsland'], supplies: { ore: 1 }, doc: '§ Tools: two tiers, Ore is scarce (4)', by: 'W17' });
  lock('shipwreck', { type: 'place', needs: ['beach', 'rafting'], doc: '§ The world: Shipwreck', by: 'W17' });
  lock('oreShipwreck', { type: 'item', needs: ['shipwreck'], supplies: { ore: 1 }, doc: '§ Tools: two tiers, Ore is scarce (5)', by: 'W17' });
  lock('pageShipwreck', { type: 'item', needs: ['shipwreck'], supplies: { pages: 1 }, doc: '§ The path through the game, 5', by: 'W17' });

  // ---------- Dungeon 3: the Lighthouse ----------

  lock('lighthouseEntered', { type: 'place', needs: ['cliffs', 'glowstone'], doc: '§ The path through the game, 6', by: 'W18' });
  lock('slingshot', { type: 'item', needs: ['lighthouseEntered'], doc: '§ The path through the game, 6', by: 'W18' });
  lock('d3Boss', { needs: ['lighthouseEntered', 'slingshot', 'brokenShells', anySword], gives: ['heartD3'], supplies: { ore: 1, pages: 1 }, doc: '§ The path through the game, 6', by: 'W18' });
  lock('primerTaken', { type: 'event', needs: ['d3Boss'], retires: ['primerOnShelf'], doc: '§ Books, pages and the library: Cartographer\'s Primer', by: 'W11' });

  // ---------- the highlands and Dungeon 4: the Dragon's Lair ----------

  lock('climbersAlmanac', { type: 'item', needs: ['bindery', 'shells'], count: { pages: 5 }, doc: '§ The path through the game, 7', by: 'W19' });
  lock('highlands', { type: 'place', needs: ['cliffs', 'climbersAlmanac', 'chickenFlightLong'], doc: '§ The path through the game, 7', by: 'W19' });
  lock('dragonsLairEntered', { type: 'place', needs: ['highlands'], doc: '§ The path through the game, 8', by: 'W19' });
  lock('mirrorShield', { type: 'item', needs: ['dragonsLairEntered'], doc: '§ The path through the game, 8', by: 'W19' });
  lock('d4Boss', { needs: ['dragonsLairEntered', 'mirrorShield', anySword], gives: ['heartD4'], doc: '§ The path through the game, 8', by: 'W19' });

  // ---------- finale ----------

  lock('trapdoorOpen', { needs: ['d4Boss', 'puppetStage'], doc: '§ The path through the game, 9', by: 'W20' });
  lock('workshop', { type: 'place', needs: ['trapdoorOpen'], doc: '§ Ending: Confrontation', by: 'W20' });
  lock('marionettes', { needs: ['workshop', anySword], doc: '§ Ending: Confrontation', by: 'W20' });
  lock('ending', { needs: ['marionettes'], doc: '§ Ending: Final scenes before the credits', by: 'W20' });

  VL.defineMilestones([
    'named', 'start', 'chestGear', 'scriptoriumKey', 'scriptoriumEntered', 'liftingGloves', 'd1Boss',
    'woodsMapCopy', 'hollowOakEntered', 'grapplingRope', 'd2Boss', 'shockwave',
    'raft', 'lakeIsland', 'shipwreck', 'lighthouseEntered', 'slingshot', 'd3Boss',
    'climbersAlmanac', 'highlands', 'dragonsLairEntered', 'mirrorShield', 'd4Boss',
    'trapdoorOpen', 'marionettes', 'ending',
  ], {
    // Beats the next beat does not depend on: the smith sells a sword, so the
    // chest can be skipped; the island, the shipwreck and the lighthouse come
    // in any order (so the raft gates the first two, not the lighthouse).
    skippable: ['chestGear', 'raft', 'lakeIsland', 'shipwreck'],
  });
})();
