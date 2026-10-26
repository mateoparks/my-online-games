// The library and its people (design: Books, pages and the library; People):
// the books' words, the librarian, his wife, the lost-chicken kid, the
// library's inside, and the progression claims for every book, page and
// reward. The rules live in systems/library.js; README "Library".
(() => {
  const { rect } = VL.ART;

  // ---------- the books ----------

  const generic = (id, title, color, blurb) => VL.defineBook(id, { kind: 'generic', title, color, blurb });
  generic('bookRiverside', 'Rocks and How to Lift Them', 'rock', 'Step one: be very strong. Step two... no, that\'s all of it.');
  generic('bookBeachBuried', 'Sandcastles of Long Ago', 'sand', 'Someone buried a book about sandcastles in the sand. Very clever.');
  generic('bookCliffRoad', 'The Gull Who Wanted to Be a Goose', 'rockLight', 'It ends happily. The goose wanted to be a gull, so they swapped.');
  generic('bookLighthouse', 'The Lighthouse Keeper\'s Diary', 'water', 'Every night: "Lamp lit. Sea calm. Crab large." Crab large? How large, I wonder.');
  generic('bookEastRoad', 'Ninety-Nine Ways to Cook a Turnip', 'leaf', 'Ninety-nine! I only knew three, and two of them were "boiled".');
  generic('bookWoods', 'Whispers of the Woods', 'leafLight', 'They say the paths in the Woods wander about at night, like sleepy cats.');
  generic('bookScriptoriumRock', 'Neat Letters for Messy Scribes', 'tunic', 'Page one is very neat. By page ninety, the scribe had clearly given up.');
  generic('bookLakeShore', 'Fish I Have Known', 'waterLight', 'Every fish gets its own chapter. Chapter twelve just says "splash".');
  generic('bookHighlands', 'Songs for Tired Legs', 'roof', 'A songbook from the highlands. Every song is about wanting to sit down.');
  generic('bookMeadowRock', 'A Field Guide to Flowers', 'berryLight', 'Pressed flowers between the pages! Somebody loved this book.');
  // W30: the late places' books.
  generic('bookCliffLedge', 'Knots for Nervous Climbers', 'wood', 'Every knot is called "the tight one." The author was clearly very nervous.');
  generic('bookHighShelfA', 'A Goat\'s Guide to Mountains', 'rockLight', 'Chapter one: jump. Chapter two: jump higher. A goat wrote it, I think.');
  generic('bookHighShelfB', 'Clouds and What They Mean', 'waterLight', 'Fluffy means sunshine. Grey means rain. One shaped like a chicken? Nobody knows.');
  generic('bookHighScree', 'Pebbles of Every Colour', 'rock', 'Two hundred pages about pebbles. Somebody liked pebbles very much.');
  generic('bookHighGapA', 'How to Talk to Gulls', 'sand', 'Step one: say "squawk." Step two: run. That seems to be all the advice there is.');
  generic('bookHighGapB', 'The Windy Cookbook', 'leafLight', 'Every recipe ends with "and then the wind blew it away." Very short meals.');
  generic('bookHighPathA', 'The Brave Little Hedgehog', 'roof', 'A hedgehog who is scared of nothing at all. Except balloons. Fair enough.');
  generic('bookHighPathB', 'Snoring Through the Ages', 'tunic', 'A history of snoring. It says dragons snore the loudest of all. Hmm!');
  // W34: Matthew's easter egg, his words.
  generic('bookLairA', 'Ashton Co-op', 'berry', 'Adventures in learning! Or maybe just adventures. Who knows?');
  generic('bookLairB', 'Stars Over the Highlands', 'gold', 'A map of the night sky. Someone drew a smiling face on the moon.');
  generic('bookLakeIsland', 'Island Living for Beginners', 'leaf', 'Lesson one: bring a boat. Lesson two: see above.');
  generic('bookWreckDeck', 'The Captain\'s Logbook', 'water', 'Day one: sailing. Day two: more sailing. Day three: "Oops." The last page is very wet.');

  VL.defineBook('hiddenBookSealed', {
    kind: 'sealed',
    title: 'The Scriptorium Register',
    color: 'heart',
    icon: 'reading-seal',
    reading: [
      'This wax seal... it\'s the mark of the Old Scriptorium! The scribes kept their records there, long ago.',
      'And look, tucked inside the cover: a key! It must open the Scriptorium door, just north of here.',
      'Take it, {name}. If anyone can find out where our books are going, it\'s you.',
    ],
    read: (state) => VL.giveScriptoriumKey(state),
  });

  const titled = (id, title, color, icon, reading, effect) => VL.defineBook(id, { kind: 'titled', title, color, icon, reading, read: effect });
  const popupOnRead = (id, popup) => {
    VL.definePopup(id, popup);
    return (state) => VL.showPopup(state, id);
  };
  titled('bookHerbalist', 'Herbalist\'s Notes', 'leaf', 'reading-leaf', [
    'Old Mother Bryony wrote this! She knew every plant on the island.',
    'She says there are only three berry bushes in all the land: one in the fields by your hut, one deep in the Whispering Woods, and one high up in the highlands.',
    'Berries heal you, and crushed with a mortar and pestle they make fine ink. If you ever draw a map, I\'ll mark the bushes on it.',
  ], popupOnRead('herbalistRead', { title: 'Herbalist\'s Notes', text: 'Three berry bushes: by your hut, in the Whispering Woods and up in the highlands. A map you draw will show them.' }));
  titled('bookTideTables', 'Tide Tables', 'water', 'reading-wave', [
    'Every high and low tide for a hundred years. Rather dry reading... ha!',
    'But see this note in the margin: "Dig just after the tide goes out. The best shells are left behind."',
  ], popupOnRead('tideTablesRead', { title: 'Tide Tables', text: 'Digging on the beach turns up whole shells more often now.' }));
  titled('bookSmithsLedger', 'The Smith\'s Ledger', 'roof', 'reading-anvil', [
    'Brannock\'s great-grandfather kept this. Every lump of ore he ever used!',
    'And a note at the back: "Rumour has it there\'s ore in the hold of the old shipwreck." If you draw a map, I\'ll mark it for you!',
    'And here\'s his trick for using fewer shells at the forge! I\'ll tell Brannock, and he\'ll charge you less.',
  ], popupOnRead('smithsLedgerRead', { title: 'The Smith\'s Ledger', text: 'Rumour has it there\'s ore on the old shipwreck: a map you draw will show it. The smith forges metal gear for fewer shells now.' }));
  titled('bookPrimer', 'The Cartographer\'s Primer', 'gold', 'reading-map', [
    'How to draw a map of every place you have ever been. How wonderful!',
    'With paper and ink, you could draw the whole island. I\'ll keep this one safe on the shelf for you, {name}.',
    'Ink? The old scribes made theirs by grinding berries with a Mortar & Pestle. There must be one in the Old Scriptorium somewhere!',
  ], popupOnRead('primerRead', { title: 'The Cartographer\'s Primer', text: 'With paper and ink you can draw a map of everywhere you have been, while the Primer is on the shelf. For ink, grind berries with the Old Scriptorium\'s Mortar & Pestle.' }));
  titled('bookDragons', 'A Child\'s Book of Dragons', 'berry', 'reading-dragon', [
    'I read this to my wife when we were young. She never did like the ending.',
    'Dragons breathe fire, but here\'s a funny thing: they can\'t stand their own flames! Bounce them back, and whoosh!',
    'Something shiny might do the trick. A mirror, perhaps? And while it\'s dazed, only good strong metal will scratch its scales.',
  ], popupOnRead('dragonsRead', { title: 'A Child\'s Book of Dragons', text: 'Dragons can\'t stand their own fire. Something shiny might bounce it back. Only metal can hurt one.' }));
  titled('bookChickenAlmanac', 'The Chicken Keeper\'s Almanac', 'goldLight', 'reading-chicken', [
    'Oh, I love this one! Chickens are much stronger than they look.',
    'It says a good chicken has been known to carry a person clear across a gap! Stand next to one and press F.',
    'And once you know the knack, they\'ll carry you twice as far. Isn\'t that wonderful?',
  ], (state) => {
    state.flags.chickenAlmanacRead = true;
    VL.showPopup(state, 'chickenAlmanacRead');
  });
  VL.definePopup('chickenAlmanacRead', { title: 'Chicken flight!', text: 'Stand next to a chicken and press F, and it carries you over gaps. They carry you farther now.' });

  // The pictures on a reading's open book.
  VL.ART.defineSprite('reading-book', { colors: { r: 'heart', w: 'white' }, rows: ['rrrrrr', 'rwwwwr', 'rwrrwr', 'rwwwwr', 'rrrrrr'] });
  VL.ART.defineSprite('reading-seal', { colors: { r: 'heart', l: 'heartLight', g: 'gold' }, rows: ['.rrrr.', 'rrllrr', 'rlggrr', 'rrggrr', 'rrrrrr', '.rrrr.', '..r.r.'] });
  VL.ART.defineSprite('reading-leaf', { colors: { l: 'leaf', L: 'leafLight', b: 'berry', B: 'berryLight' }, rows: ['...ll.', '..lLll', '.lLll.', 'lLll..', '.l.bb.', '..bBbb', '...bb.'] });
  VL.ART.defineSprite('reading-wave', { colors: { w: 'water', f: 'foam' }, rows: ['..ff....', '.fwwf...', 'fwwwwf.f', 'wwwwwwfw', 'wwwwwwww'] });
  VL.ART.defineSprite('reading-anvil', { colors: { m: 'rockDark', l: 'rock' }, rows: ['llllllll', '.mmmmmmm', '...mmm..', '..mmmmm.'] });
  VL.ART.defineSprite('reading-map', { colors: { p: 'sandLight', d: 'sandDark', r: 'heart' }, rows: ['pppppppp', 'pdpppdpp', 'ppdpdppp', 'pppdppr.', 'ppdpdprr', 'pppppppp'] });
  VL.ART.defineSprite('reading-dragon', { colors: { g: 'leaf', l: 'leafLight', f: 'gold', e: 'ink' }, rows: ['..gg....', '.gegg...', 'gggggff.', '..gggfff', '.ggglg..', 'gg.g.g..'] });
  VL.ART.defineSprite('reading-chicken', { colors: { w: 'feather', c: 'comb', y: 'gold', e: 'ink' }, rows: ['..c...', '.www..', 'wewwy.', '.wwwww', '.wwww.', '..y.y.'] });

  // ---------- people ----------

  VL.defineNpcLook('librarian', { head: 'short', colors: { hair: 'npcSilver', hairLight: 'npcSilverLight', top: 'npcNavy', topDark: 'npcNavyDark', topLight: 'npcNavyLight', legs: 'woodDark' } });
  VL.defineNpcLook('librarianWife', { head: 'bun', colors: { hair: 'npcBlonde', hairLight: 'npcBlondeLight', top: 'npcRose', topDark: 'npcRoseDark', topLight: 'npcRoseLight' } });
  VL.defineNpcLook('chickenKid', { head: 'short', colors: { hair: 'hair', hairLight: 'hairLight', top: 'gold', topDark: 'woodDark', topLight: 'goldLight' } });

  VL.defineNpc('librarian', { name: VL.LIBRARIAN, look: 'librarian' });
  VL.defineNpc('librarianWife', { name: 'Mrs. Fenwick', look: 'librarianWife' });
  VL.defineNpc('chickenKid', { name: 'Pip', look: 'chickenKid', wander: 1 });

  // ---------- the librarian ----------

  // His hints by the next story beat (design: Hints): a gentle nudge, never
  // a dead end. A beat may have variants, the first that holds is said.
  const read = (id) => (state) => VL.bookRead(state, id);
  const not = (fn) => (state) => !fn(state);
  VL.LIBRARY_HINTS = {
    chestGear: [{ say: 'Have you looked around your own hut, {name}? I\'m sure there\'s an old chest in there.' }],
    scriptoriumKey: [{ say: 'Folk have been hiding books to keep them safe. Try the old trunk by the puppet stage in the square.' }],
    scriptoriumEntered: [{ say: 'That key opens the Old Scriptorium, just north of the library. Go and see what the scribes left behind!' }],
    liftingGloves: [{ say: 'The Scriptorium is full of heavy pots and stones. Perhaps the scribes kept something in there to help with the lifting.' }],
    d1Boss: [{ say: 'Something has been chewing through the Scriptorium\'s shelves. If it gets the better of you, Gran Ottie by the well knows all the old stories.' }],
    woodsMapCopy: [{ say: 'Nobody gets through the Whispering Woods without a map. There\'s a mural of the Woods in the Scriptorium: with paper from the mill and ink from berries, you could copy it.' }],
    hollowOakEntered: [{ say: 'Follow your copied map through the Whispering Woods. They say the Hollow Oak stands right at its heart.' }],
    grapplingRope: [{ say: 'The Hollow Oak is full of gaps and pits. Look for something in there that can pull you across.' }],
    d2Boss: [{ say: 'Something with a hard shell guards the top of the Hollow Oak. Be careful, {name}!' }],
    shockwave: [{ say: 'You beat the beast in the Hollow Oak? Well done, {name}! Funny... the shelves have been rattling all day.' }],
    raft: [{ say: 'You\'ll want to get out on the water. Nell in the harbour knows boats: take her your rope and some wood, and she\'ll lash you a raft.' }],
    lakeIsland: [{ say: 'A raft needs an oar. Buy one at the shop or make your own, and the island in the lake isn\'t far at all.' }],
    shipwreck: [{ say: 'There\'s an old wreck off the beach, past the tide pools. Who knows what washed up inside it?' }],
    lighthouseEntered: [{ say: 'That glowing stone you carry... the old Lighthouse on the cliffs is pitch dark inside. Perhaps it\'s time for a visit.' }],
    slingshot: [{ say: 'The Lighthouse has switches far out of reach. Look high and low in there for a way to hit them.' }],
    d3Boss: [{ say: 'A great crab has taken the Lighthouse lens for its shell! Mind its pincers, {name}.' }],
    climbersAlmanac: [
      { when: (state) => !VL.hasItem(state, 'shellPurse'), say: 'Miss Quill charges forty shells to bind a book, and your purse only holds fifteen! Bring me more books, {name}: I have a bigger purse put by for you.' },
      { say: 'Miss Quill at the bindery binds five loose pages into a book. Pages blow all over: by the library, by the lake, even into a chicken coop. Little Pip in the harbour might know something!' },
    ],
    highlands: [
      { when: not(read('bookChickenAlmanac')), say: 'The highland gaps are far too wide to jump. The Chicken Keeper\'s Almanac might help. I think it washed up on the old wreck off the beach.' },
      { say: 'The Climber\'s Almanac shows a hidden path at the foot of the cliffs. From there, let the chickens carry you up!' },
    ],
    dragonsLairEntered: [{ say: 'The Dragon\'s Lair is at the very top of the highlands. Be brave, {name}.' }],
    mirrorShield: [
      { when: not(read('bookDragons')), say: 'If you find A Child\'s Book of Dragons, bring it to me. I think it was hidden somewhere up in the highlands.' },
      { say: 'Remember the dragon book? Dragons can\'t stand their own fire. Something shiny might bounce it back.' },
    ],
    d4Boss: [
      { when: not(read('bookDragons')), say: 'The Dragon itself, {name}! I wish we had a book about dragons. Keep an eye out for one.' },
      { say: 'Remember the dragon book? Bounce its fire right back at it, and strike with good strong metal!' },
    ],
    trapdoorOpen: [{ say: 'Something strange is going on in the square, {name}. My wife hasn\'t been home all day.' }],
    marionettes: [{ say: 'The trapdoor in the square is open, and my wife is nowhere to be found. Whatever is down there, {name}, I\'m coming with you.' }],
    ending: [{ say: 'My wife is still down under the stage, {name}. Let\'s go back down and hear what she has to say.' }],
  };

  const carrying = (state) => VL.booksCarried(state).length > 0;
  const beatsWaiting = (state) => Boolean(VL.nextReading(state) || VL.pendingReward(state));
  const remarking = (line, also) => (state) => VL.vanishedRemark(state) === line && (!also || also(state));
  const nextIs = (id, when) => (state) => VL.nextMilestone(state) === id && (!when || when(state));
  const hintEntries = Object.entries(VL.LIBRARY_HINTS).flatMap(([id, hints]) => hints.map((hint) => ({ when: { test: nextIs(id, hint.when) }, say: hint.say })));

  const introduction = [
    'Oh! A visitor. Welcome to the library, {name}. I\'m Mr. Fenwick, the librarian.',
    'Well... what\'s left of it. Our books keep vanishing, and I can\'t work out where they go.',
    'If you ever find one, bring it here and we\'ll read it together. Ask me any time if you\'re stuck.',
  ];
  const booksHandedIn = 'Are those... books? You found books, {name}! Let me put them on the shelves.';
  const whereWereWe = 'Now, where were we? Ah, yes!';
  const welcomeHome = 'Welcome back, {name}! Every shelf is full again, and my wife is helping me look after them all.';
  const endingBooksToShow = (state) => VL.endingBooks(state).some((id) => VL.BOOKS[id].kind === 'generic');
  // Books gone since his last remark come first, whatever else he has to say.
  const remarks = (also, after, give) => VL.VANISHED_REMARKS.map((line) => ({
    when: { test: remarking(line, also) },
    say: after ? [line, after] : line,
    give: { noticeTheft: true, ...give },
    repeat: true,
  }));

  VL.defineDialogue('librarian', [
    // A kid who walks in already carrying the first book still meets him first.
    { when: { notFlag: 'met:fenwick', test: carrying }, say: [...introduction, booksHandedIn], set: 'met:fenwick', give: { returnBooks: true } },
    // The first talk after the ending, before any hand-in or beat it leads into.
    { when: { flag: 'forgiven', notFlag: 'finale:welcomedHome', test: endingBooksToShow }, say: [welcomeHome, 'And look at the books you brought home with you! Let me tell you about them.'], set: 'finale:welcomedHome', give: { welcomeHome: true } },
    { when: { flag: 'forgiven', notFlag: 'finale:welcomedHome' }, say: welcomeHome, set: 'finale:welcomedHome', give: { welcomeHome: true } },
    ...remarks(carrying, booksHandedIn, { returnBooks: true }),
    { when: { test: carrying }, say: booksHandedIn, give: { returnBooks: true }, repeat: true },
    ...remarks(beatsWaiting, whereWereWe, { libraryChain: true }),
    { when: { test: beatsWaiting }, say: whereWereWe, give: { libraryChain: true }, repeat: true },
    { when: { notFlag: 'met:fenwick' }, say: introduction, set: 'met:fenwick' },
    ...remarks(null, null, {}),
    ...hintEntries,
    // After the ending (W20): the shelves are full for good.
    { when: { flag: 'forgiven' }, say: ['Look at these shelves, {name}! Full to the very top, and every book stays put.', 'My wife has started a puppet show about you. Do go and see it!'] },
    { say: 'Every book you bring back makes this old room a little brighter, {name}.' },
  ]);

  // ---------- his wife ----------

  // Cooler as more books come back (design: People), and subtle: a first
  // play-through should shrug it off. From her third stage, the second talk
  // of a visit "helps" with the next beat in the wrong direction; the
  // librarian's hints always point the right way.
  VL.WIFE_MISDIRECTION = {
    scriptoriumKey: 'Hidden books? I\'d look in the lake, dear. People are always dropping things in lakes.',
    woodsMapCopy: 'The Woods? Just walk straight in and keep going. You can\'t miss it.',
    hollowOakEntered: 'The Woods? Just walk straight in and keep going. You can\'t miss it.',
    lighthouseEntered: 'The old Lighthouse? Boarded up for years, dear. Not worth the walk.',
    climbersAlmanac: 'Loose pages? Blown out to sea by now, I expect. I wouldn\'t bother.',
    highlands: 'Chickens? Silly birds. They can barely flap over a puddle.',
    mirrorShield: 'Dragons? A good wooden shield is all anybody needs. Everyone knows that.',
    d4Boss: 'Dragons? A good wooden shield is all anybody needs. Everyone knows that.',
  };
  const stage = (n) => (state) => VL.wifeStage(state) === n;
  const misdirecting = (id) => (state) => VL.wifeStage(state) >= 2 && Boolean(state.room?.wifeTalked) && VL.nextMilestone(state) === id;

  VL.defineDialogue('librarianWife', [
    {
      when: { notFlag: 'met:wife' },
      say: [
        'Hello there, {name}! I\'m Mrs. Fenwick. My husband runs the library.',
        'I put on puppet shows here in the square. Press S at the stage any time you like, dear!',
      ],
      set: 'met:wife',
    },
    ...Object.entries(VL.WIFE_MISDIRECTION).map(([id, say]) => ({ when: { test: misdirecting(id) }, say })),
    { when: { test: stage(3) }, say: 'Hm. Hello.' },
    { when: { test: stage(2) }, say: 'Oh. {name}. Another book for the library, I suppose.' },
    { when: { test: stage(1) }, say: 'Hello, {name}. Busy, busy, aren\'t you? Always running about.' },
    { say: 'Lovely to see you, {name}! Fancy a puppet show? Press S at the stage.' },
  ]);

  // Her second talk in a visit is the one that may mislead.
  VL.defineSystem('wifeTalk', {
    order: 97,
    update(state) {
      if (state.events.some((event) => event.type === 'talk' && event.npc === 'librarianWife')) state.room.wifeTalked = true;
    },
  });

  // ---------- the lost-chicken kid ----------

  VL.defineDialogue('chickenKid', [
    {
      when: { notFlag: 'thanked:pip', test: (state) => VL.chickenWithHero(state, 'lostChicken') },
      say: [
        'Henrietta! You found her! Oh, thank you, thank you, {name}!',
        'Here, this page blew into her coop last week. It\'s from some old book. You can have it!',
      ],
      set: 'thanked:pip',
      give: { lostChicken: true },
    },
    { when: { flag: 'found:lostChicken' }, say: 'Henrietta\'s laying eggs again! Thanks, {name}. You\'re the best.' },
    {
      when: { notFlag: 'met:pip' },
      say: [
        'Have you seen my chicken? Her name\'s Henrietta.',
        'She flapped off up the cliff road and she won\'t come down! Could you carry her home for me?',
      ],
      set: 'met:pip',
    },
    { say: 'Henrietta loves high places. Last I saw her, she was up on the cliffs west of the library.' },
  ]);

  // ---------- inside the library ----------

  VL.defineTileset('library', {
    '#': { solid: true, wall: true, interior: true, art: 'wallInside' },
    _: { floor: true, art: 'floor' },
    m: { door: true, floor: true, art: 'door' },
    K: { solid: true, floor: true, counter: true, art: 'counter' },
    n: { solid: true, floor: true, furniture: true, art: 'floor' },
  });
  VL.defineArea('library', { tileset: 'library' });
  VL.ART.setAreaLight('library', 'indoor');

  VL.ART.addColors({ rugRed: '#9a3b3b', rugRedDark: '#6e2828', rugGold: '#d8a84a' });

  // A worn rug before the desk.
  VL.defineDecor('libraryRug', (ctx, x, y) => {
    rect(ctx, 'rugRedDark', x, y + 2, 96, 28);
    rect(ctx, 'rugRed', x + 2, y + 4, 92, 24);
    for (let i = 0; i < 92; i += 6) rect(ctx, 'rugGold', x + 2 + i, y + 6, 3, 1);
    for (let i = 0; i < 92; i += 6) rect(ctx, 'rugGold', x + 2 + i, y + 25, 3, 1);
    rect(ctx, 'rugGold', x + 40, y + 13, 16, 6);
    rect(ctx, 'rugRed', x + 42, y + 15, 12, 2);
  });

  // A reading table with a candle, two tiles square.
  VL.defineDecor('readingTable', (ctx, x, y, t) => {
    VL.ART.drawShadow(ctx, x + 16, y + 28, 28);
    rect(ctx, 'outline', x + 1, y + 6, 30, 12);
    rect(ctx, 'wood', x + 2, y + 7, 28, 10);
    rect(ctx, 'woodLight', x + 2, y + 7, 28, 1);
    rect(ctx, 'woodDark', x + 4, y + 17, 3, 11);
    rect(ctx, 'woodDark', x + 25, y + 17, 3, 11);
    rect(ctx, 'white', x + 8, y + 9, 8, 5);
    rect(ctx, 'sandDark', x + 12, y + 9, 1, 5);
    rect(ctx, 'white', x + 22, y + 4, 2, 6);
    const flicker = Math.sin(t * 9) > 0 ? 1 : 0;
    rect(ctx, 'gold', x + 22, y + 1 + flicker, 2, 3);
    rect(ctx, 'goldLight', x + 22, y + 2 + flicker, 1, 1);
  });

  VL.addScreens('library', {
    '0,0': {
      tiles: [
        '################',
        '#nnnn_nnnn_nnnn#',
        '#______________#',
        '#______________#',
        '#____KKKKKK____#',
        '#______________#',
        '#nn__________nn#',
        '#nn__________nn#',
        '#______________#',
        '#______m_______#',
        '################',
      ],
      entities: [
        { type: 'decor', art: 'libraryRug', x: 2, y: 5 },
        { type: 'libraryShelf', shelf: 0, x: 1, y: 1 },
        { type: 'libraryShelf', shelf: 1, x: 6, y: 1 },
        { type: 'libraryShelf', shelf: 2, x: 11, y: 1 },
        { type: 'decor', art: 'readingTable', x: 1, y: 6 },
        { type: 'decor', art: 'readingTable', x: 13, y: 6 },
        { type: 'npc', id: 'librarian', x: 7, y: 3 },
        { type: 'door', x: 7, y: 9, to: { area: 'overworld', screen: '2,-1', tx: 5, ty: 5, facing: 'down' } },
      ],
    },
  });
  VL.LIBRARY_TALK_AT = { tx: 7, ty: 5 };
  VL.fillSpot('libraryDoor', { type: 'door', to: { area: 'library', screen: '0,0', tx: 7, ty: 8, facing: 'up' } });

  // ---------- the progression table ----------

  const claim = (id, reached, more = {}) => VL.defineLock(id, { ...VL.LOCKS[id], reached, ...more });
  // Untitled books (and the sealed one) count once returned; titled ones once
  // the librarian has read them, which is when their effect switches on.
  for (const [id, book] of Object.entries(VL.BOOKS)) {
    if (!VL.LOCKS[id]) throw new Error(`book ${id} has no lock: regions/library.js must load after regions/finds.js`);
    claim(id, book.kind === 'titled' ? read(id) : (state) => VL.bookReturned(state, id));
  }
  claim('library', (state) => Boolean(state.visited['library:0,0']), { place: { area: 'library', screen: '0,0' } });
  claim('puppetStage', (state) => Boolean(state.visited['overworld:2,0']), { place: { area: 'overworld', screen: '2,0' } });
  claim('scriptoriumKey', (state) => VL.hasItem(state, 'scriptoriumKey'));
  claim('shellPurse', (state) => VL.hasItem(state, 'shellPurse'));
  claim('heartLibrary', (state) => VL.rewardGiven(state, 'heartLibrary'));
  claim('swiftfootBoots', (state) => VL.hasItem(state, 'swiftfootBoots'));
  claim('lostChicken', (state) => VL.spotFound(state, 'lostChicken'));
  claim('pageLostChicken', (state) => VL.spotFound(state, 'pageLostChicken'));
  claim('primerTaken', (state) => Boolean(state.flags.primerTaken));
})();
