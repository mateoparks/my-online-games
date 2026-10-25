// Books, the library and the people around it (design: Books, pages and the
// library; People). Books are found out in the world (VL.markFound with the
// book's id), carried until the hero talks to the librarian, then returned
// for good. The librarian reads each titled book once and its effect switches
// on; rewards come at 5, 10 and 15 books returned ever; the shelves empty
// again on story events, never on real time. README "Library".
(() => {
  VL.tune({
    // Rewards for books returned ever (design: Rewards for books returned),
    // in order. Each is given once, by id, so an older save that got the
    // purse at 5 gets the heart on its next visit and nothing at 10.
    libraryRewards: { heartLibrary: 5, shellPurse: 10, swiftfootBoots: 15 },
    // Books the thief takes the next time the hero visits after a return trip
    // or a dungeon boss.
    libraryTheftPerTrip: 1,
    libraryTheftPerBoss: 2,
    // When the librarian's wife turns a little cooler: books returned ever,
    // and a boss beaten too, so a first play doesn't meet her cool side
    // before Dungeon 1 (design: Anti-goals).
    wifeStages: [{ books: 3 }, { books: 7, boss: 'd1Boss' }, { books: 12, boss: 'd2Boss' }],
    shellCap: 99,
    shellCapPurse: 999,
    swiftfootSpeed: 1.35,
  });

  VL.extendGame('library', () => ({
    library: {
      // Returned ever, in order; `gone` is what the thief took back since.
      returned: [],
      read: [],
      gone: [],
      trips: 0,
      // Where in `returned` the latest trip starts: those books are safe.
      lastTripAt: 0,
      stolen: { trips: 0, bosses: 0 },
      noticed: 0,
    },
  }));
  // The beats the librarian still has to play this visit (play state).
  VL.extendGame('libraryChain', () => ({ libraryChain: false, libraryBlurbs: null }), { transient: true });

  VL.slotSource('books', (save) => save.library?.returned?.length ?? 0);

  // ---------- the books ----------

  // { title, kind: 'generic' | 'titled' | 'sealed', color, blurb (generic: one
  // line when returned), reading (titled and sealed: the librarian's pages),
  // icon (the reading's picture), read(state) (the effect) }. A later item
  // defines its own books (the Bookworm's bundle) and marks them found.
  VL.BOOKS = {};
  VL.defineBook = function defineBook(id, book) {
    if (VL.BOOKS[id]) throw new Error(`book ${id} is already defined`);
    if (!['generic', 'titled', 'sealed'].includes(book.kind)) throw new Error(`book ${id}: kind is generic, titled or sealed`);
    if (book.kind === 'generic' ? !book.blurb : !book.reading) throw new Error(`book ${id} needs its ${book.kind === 'generic' ? 'blurb' : 'reading'}`);
    VL.BOOKS[id] = { id, color: 'heart', icon: 'reading-book', ...book };
  };

  const lib = (state) => state.library;
  const isReadable = (id) => VL.BOOKS[id] && VL.BOOKS[id].kind !== 'generic';

  VL.booksReturned = (state) => lib(state).returned.length;
  VL.bookReturned = (state, id) => lib(state).returned.includes(id);
  VL.bookRead = (state, id) => lib(state).read.includes(id);
  // Found out in the world and not yet handed in.
  VL.booksCarried = (state) => Object.keys(VL.BOOKS).filter((id) => VL.spotFound(state, id) && !VL.bookReturned(state, id));
  VL.booksOnShelf = (state) => lib(state).returned.filter((id) => !lib(state).gone.includes(id));

  VL.definePopup('firstBook', {
    title: 'A hidden book!',
    text: 'Someone hid it to keep it safe. Take books to the library, {name}: the librarian will be overjoyed.',
  });

  // A book picked up from a trunk, a bush or a hand-out: found for good.
  VL.findBook = function findBook(state, id) {
    if (!VL.BOOKS[id]) throw new Error(`no book ${id}`);
    if (VL.spotFound(state, id)) return false;
    VL.markFound(state, id);
    VL.showMessage(state, { title: 'You found a book!', text: `"${VL.BOOKS[id].title}"` });
    VL.showPopup(state, 'firstBook');
    state.events.push({ type: 'pickup', kind: 'book' });
    VL.earned(state);
    return true;
  };

  // Hands every carried book in. The count never goes down again.
  VL.returnBooks = function returnBooks(state) {
    const ids = VL.booksCarried(state);
    if (!ids.length) return [];
    const library = lib(state);
    library.lastTripAt = library.returned.length;
    library.returned.push(...ids);
    library.trips += 1;
    state.events.push({ type: 'booksReturned', count: ids.length });
    VL.earned(state);
    return ids;
  };

  // The next titled (or sealed) book on the shelf the librarian has not read yet.
  VL.nextReading = (state) => lib(state).returned.find((id) => isReadable(id) && !VL.bookRead(state, id)) || null;

  VL.finishReading = function finishReading(state, id) {
    if (!isReadable(id) || VL.bookRead(state, id) || !VL.bookReturned(state, id)) return false;
    lib(state).read.push(id);
    VL.BOOKS[id].read?.(state);
    VL.earned(state);
    return true;
  };

  // ---------- rewards ----------

  VL.defineSfx('libraryChime', [
    { wave: 'triangle', freq: 784, at: 0, dur: 0.18, vol: 0.35 },
    { wave: 'triangle', freq: 988, at: 0.12, dur: 0.18, vol: 0.3 },
    { wave: 'triangle', freq: 1175, at: 0.24, dur: 0.4, vol: 0.3 },
  ], { gap: 0.6 });
  VL.SOUND.onEvent('booksReturned', 'libraryChime');

  // Worn, not held: owned without filling a hand.
  const wear = (state, id) => {
    state.items[id] = true;
    VL.holdUp(state, VL.itemSprite(id));
    VL.showPopup(state, id);
    VL.earned(state);
  };

  const REWARD_GIFTS = {
    shellPurse: (state) => wear(state, 'shellPurse'),
    heartLibrary: (state) => VL.giveHeartContainer(state),
    swiftfootBoots: (state) => wear(state, 'swiftfootBoots'),
  };
  VL.rewardGiven = (state, id) => Boolean(state.flags[`reward:${id}`]);
  VL.pendingReward = function pendingReward(state) {
    const returned = VL.booksReturned(state);
    return Object.entries(VL.TUNING.libraryRewards).find(([id, least]) => returned >= least && !VL.rewardGiven(state, id))?.[0] || null;
  };
  VL.giveLibraryReward = function giveLibraryReward(state, id) {
    if (VL.rewardGiven(state, id) || VL.booksReturned(state) < VL.TUNING.libraryRewards[id]) return false;
    state.flags[`reward:${id}`] = true;
    REWARD_GIFTS[id](state);
    VL.earned(state);
    return true;
  };
  VL.nextRewardAt = (state) => Object.entries(VL.TUNING.libraryRewards)
    .find(([id, least]) => least > VL.booksReturned(state) && !VL.rewardGiven(state, id))?.[1] ?? null;

  const BOOT_ROWS = ['..gg.....', '.gggg....', '.gGgg....', '.gggg....', '.ggggggg.', 'gggggGggg', 'ddddddddd'];
  VL.ART.defineSprite('item-swiftfoot', { colors: { g: 'tunicLight', G: 'white', d: 'tunicDark' }, rows: BOOT_ROWS });
  VL.ART.defineSprite('item-purse', {
    colors: { p: 'roof', P: 'roofLight', d: 'roofDark', g: 'gold' },
    rows: ['..g.g..', '..ggg..', '.pPppp.', 'pPppppp', 'ppppppp', 'pppgppp', '.ddddd.'],
  });
  VL.ART.defineSprite('item-scriptorium-key', {
    colors: { g: 'gold', l: 'goldLight', d: 'woodDark' },
    rows: ['.lgg.', 'g...g', 'g...g', '.ggg.', '..g..', '..gg.', '..g..', '..gg.'],
  });

  VL.defineItem('shellPurse', {
    name: 'Big Shell Purse',
    icon: 'purse',
    about: `Holds up to ${VL.TUNING.shellCapPurse} whole shells.`,
    popup: { title: 'You got the Big Shell Purse!', text: `It holds up to ${VL.TUNING.shellCapPurse} whole shells. Your old one only held ${VL.TUNING.shellCap}.` },
  });
  VL.defineItem('swiftfootBoots', {
    name: 'Swiftfoot Boots',
    icon: 'swiftfoot',
    speed: VL.TUNING.swiftfootSpeed,
    about: 'Always on. You run faster.',
    popup: { title: 'You got the Swiftfoot Boots!', text: 'They put a spring in your step. You run faster wherever you go!' },
  });
  VL.defineItem('scriptoriumKey', {
    name: 'Scriptorium Key',
    icon: 'scriptorium-key',
    about: 'Opens the Old Scriptorium, north of the library.',
    popup: { title: 'You got the Scriptorium Key!', text: 'It opens the Old Scriptorium, just north of the library.' },
  });
  VL.giveScriptoriumKey = (state) => wear(state, 'scriptoriumKey');

  // The purse holds so many whole shells; the Big Shell Purse holds more.
  VL.definePopup('purseFull', {
    title: 'Your purse is full!',
    text: `It only holds ${VL.TUNING.shellCap} whole shells. The librarian might know where to find a bigger one.`,
  });
  VL.shellCap = (state) => (VL.hasItem(state, 'shellPurse') ? VL.TUNING.shellCapPurse : VL.TUNING.shellCap);
  VL.RESOURCE_CAPS.shells = { most: VL.shellCap, full: 'Your purse is full!' };

  // ---------- the thief ----------

  const BOSSES = ['d1Boss', 'd2Boss', 'd3Boss', 'd4Boss'];
  const reached = (state, id) => Boolean(VL.LOCKS[id]?.reached?.(state));
  VL.primerOnShelf = (state) => VL.booksOnShelf(state).includes('bookPrimer');

  // Runs as the hero walks into the library: whatever the story has done
  // since the last visit (books returned, a boss beaten) costs some shelves a
  // book. Never the books just brought in, never one the librarian has yet to
  // read, and never the Primer before Dungeon 3 is beaten; after it, the
  // Primer goes first.
  VL.applyThefts = function applyThefts(state) {
    const library = lib(state);
    const bosses = BOSSES.filter((id) => reached(state, id)).length;
    let take = Math.max(0, library.trips - library.stolen.trips) * VL.TUNING.libraryTheftPerTrip
      + Math.max(0, bosses - library.stolen.bosses) * VL.TUNING.libraryTheftPerBoss;
    library.stolen = { trips: library.trips, bosses };
    const taken = [];
    const afterD3 = reached(state, 'd3Boss');
    if (afterD3) {
      if (VL.primerOnShelf(state) && VL.bookRead(state, 'bookPrimer')) taken.push('bookPrimer');
      state.flags.primerTaken = true;
    }
    const older = library.returned.slice(0, library.lastTripAt);
    for (const id of older) {
      if (take <= 0) break;
      if (library.gone.includes(id) || taken.includes(id) || (isReadable(id) && !VL.bookRead(state, id))) continue;
      if (id === 'bookPrimer' && !afterD3) continue;
      taken.push(id);
      take -= 1;
    }
    library.gone.push(...taken);
    if (taken.length || afterD3) VL.earned(state);
    return taken;
  };

  // ---------- the librarian's wife ----------

  VL.wifeStage = function wifeStage(state) {
    const stage = VL.TUNING.wifeStages.findIndex(({ books, boss }) => VL.booksReturned(state) < books || (boss && !reached(state, boss)));
    return stage === -1 ? VL.TUNING.wifeStages.length : stage;
  };

  // ---------- what to do next ----------

  // The first story beat not reached yet; the librarian's hints and his
  // wife's "help" are keyed by it.
  VL.nextMilestone = (state) => VL.MILESTONES.find((id) => !['named', 'start'].includes(id) && !reached(state, id)) || null;

  // ---------- marks for the drawn map (W12) ----------

  // { kind, area, screen, tx, ty }: the berry bushes once the Herbalist's
  // Notes are read, and the Woods ore (until found) once the Smith's Ledger is.
  VL.mapMarks = function mapMarks(state) {
    const marks = [];
    if (VL.bookRead(state, 'bookHerbalist')) {
      for (const [area, { screens }] of Object.entries(VL.AREAS)) {
        for (const [screen, { tiles }] of Object.entries(screens)) {
          tiles.forEach((row, ty) => [...row].forEach((ch, tx) => {
            const info = VL.tileInfo(area, ch);
            if (info.berry && !info.picked) marks.push({ kind: 'berries', area, screen, tx, ty });
          }));
        }
      }
    }
    if (VL.bookRead(state, 'bookSmithsLedger') && !VL.spotFound(state, 'oreWoods')) {
      const spot = VL.SPOTS.oreWoods;
      marks.push({ kind: 'ore', area: spot.area, screen: spot.screen, tx: spot.x, ty: spot.y });
    }
    return marks;
  };

  // ---------- the purse limit ----------

  VL.defineSystem('shellPurse', {
    order: 95,
    update(state) {
      const cap = VL.shellCap(state);
      if (state.inventory.shells <= cap) return;
      state.inventory.shells = cap;
      VL.showPopup(state, 'purseFull');
      VL.earned(state);
    },
  });

  // ---------- talking to the librarian ----------

  // Gifts his dialogue entries hand over (talk.js): hand the books in and
  // play the beats that follow, one scene at a time.
  VL.defineGift('returnBooks', (state) => {
    state.libraryBlurbs = VL.returnBooks(state);
    state.libraryChain = true;
  });
  VL.defineGift('libraryChain', (state) => {
    state.libraryChain = true;
  });
  VL.defineGift('libraryReward', (state, id) => VL.giveLibraryReward(state, id));
  VL.defineGift('noticeTheft', (state) => {
    lib(state).noticed = lib(state).gone.length;
  });

  // What he says about books gone since he last remarked on it: one line
  // picked by how many, turning through the variants with each loss noticed.
  const NUMBER_WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];
  const remarksFor = (n) => {
    if (n === 1) {
      return [
        'One of the books you brought me is already gone, {name}! They vanish so quickly here.',
        'Oh dear. Another book has vanished from the shelves since you were last here.',
        'A book is missing again, {name}. I only turned my back for a moment!',
      ];
    }
    if (n === 2) {
      return [
        'Since you were last here, two books vanished! Where do they go?',
        'Two books gone since your last visit, {name}. I looked under every table!',
      ];
    }
    if (n < NUMBER_WORDS.length) {
      const word = NUMBER_WORDS[n];
      return [
        `Oh, {name}, ${word.toLowerCase()} books have vanished since you were last here! The shelves look so bare.`,
        `${word} books gone since your last visit! Whatever is taking them must be very hungry.`,
      ];
    }
    return ['So many books have vanished since you were last here, {name}! I hardly know where to begin.'];
  };
  VL.VANISHED_REMARKS = Array.from({ length: NUMBER_WORDS.length }, (_, n) => n).slice(1).flatMap(remarksFor).concat(remarksFor(NUMBER_WORDS.length));
  VL.vanishedRemark = function vanishedRemark(state) {
    const n = lib(state).gone.length - lib(state).noticed;
    if (n <= 0) return null;
    const lines = remarksFor(n);
    return lines[lib(state).noticed % lines.length];
  };

  VL.LIBRARIAN = 'Mr. Fenwick';

  // What he says about the books just handed in: a line for each untitled
  // one, then the count and the next reward.
  VL.returnSpeech = function returnSpeech(state, ids) {
    const lines = ids.filter((id) => VL.BOOKS[id].kind === 'generic').map((id) => `"${VL.BOOKS[id].title}." ${VL.BOOKS[id].blurb}`);
    const count = VL.booksReturned(state);
    const next = VL.nextRewardAt(state);
    let tally = `That makes ${count} ${count === 1 ? 'book' : 'books'} back on the shelves!`;
    if (next !== null && !VL.pendingReward(state)) tally += ` Bring me ${next - count} more and I'll have something special for you.`;
    return [...lines, tally];
  };

  // The beat to play now, or null when the visit's beats are all done.
  VL.libraryBeat = function libraryBeat(state) {
    if (state.libraryBlurbs?.length) return { kind: 'blurbs', ids: state.libraryBlurbs };
    const reading = VL.nextReading(state);
    if (reading) return { kind: 'reading', id: reading };
    const reward = VL.pendingReward(state);
    if (reward) return { kind: 'reward', id: reward };
    return null;
  };

  VL.REWARD_SPEECH = {
    heartLibrary: ['Five books, {name}! You deserve something for all that searching.', 'I found this tucked behind the oldest shelf. I think it wants to be yours, {name}.'],
    shellPurse: ['Ten books! The library hasn\'t been this full in years.', 'This was my grandmother\'s shell purse. It holds a great many shells. Take it, please!'],
    swiftfootBoots: ['Fifteen books! I can hardly believe it.', 'These are Swiftfoot Boots. I ran messages for the old scribes in them, long ago. They\'ll put a spring in your step!'],
  };

  // In the library, plays the next beat as soon as nothing else is showing.
  VL.defineSystem('librarian', {
    order: 96,
    update(state) {
      if (!state.libraryChain || state.room.area !== 'library' || state.sceneRequest || VL.currentPopup(state)) return;
      const beat = VL.libraryBeat(state);
      if (!beat) {
        state.libraryChain = false;
        return;
      }
      if (beat.kind === 'blurbs') {
        state.libraryBlurbs = null;
        VL.requestScene(state, 'dialogue', { speaker: VL.LIBRARIAN, pages: VL.dialoguePages(VL.returnSpeech(state, beat.ids), state) });
      } else if (beat.kind === 'reading') {
        VL.requestScene(state, 'reading', { book: beat.id });
      } else {
        VL.requestScene(state, 'dialogue', {
          speaker: VL.LIBRARIAN,
          pages: VL.dialoguePages(VL.REWARD_SPEECH[beat.id], state),
          end: { give: { libraryReward: beat.id } },
        });
      }
    },
  });

  // ---------- the lost chicken ----------

  VL.definePopup('pageFound', {
    title: 'A loose page!',
    text: 'Torn from some old book. Miss Quill at the bindery can bind five loose pages into a real book.',
  });
  VL.findPage = function findPage(state, id) {
    if (VL.spotFound(state, id)) return false;
    VL.markFound(state, id);
    if (!VL.showPopup(state, 'pageFound')) {
      const pages = VL.loosePages(state);
      const need = VL.pagesToBind();
      VL.showMessage(state, {
        title: 'Another loose page!',
        text: pages >= need ? `That makes ${pages} of the ${need} pages Miss Quill needs. Off to the bindery!` : `That makes ${pages} of the ${need} pages Miss Quill needs.`,
      });
    }
    state.events.push({ type: 'pickup', kind: 'page' });
    VL.earned(state);
    return true;
  };

  // The kid takes the chicken home for good and hands over a page.
  VL.defineGift('lostChicken', (state) => {
    VL.takeChicken(state, 'lostChicken');
    VL.markFound(state, 'lostChicken');
    VL.findPage(state, 'pageLostChicken');
    VL.holdUp(state, 'pickup-page');
  });
})();
