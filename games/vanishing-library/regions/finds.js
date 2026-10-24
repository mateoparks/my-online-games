// The overworld's finds in the progression table: hidden books, pages, heart
// containers and the Woods ore. Each is reached when its spot is found
// (VL.markFound, called by whatever item fills the spot: a chest, a bush, a
// lifted rock, a dig). The spots themselves sit in the region files.
(() => {
  const found = (id) => (state) => VL.spotFound(state, id);
  const shovel = ['woodShovel', 'metalShovel'];
  const DOC = '§ Books, pages and the library: Hidden books';

  // The ten generic books, spread over the map. A book's needs are where it
  // is and what uncovers it (gloves for a rock, a shovel for a dig); every
  // book only counts once it is back in the library.
  const book = (needs) => ({ type: 'item', needs: [...needs, 'library'], supplies: { books: 1 }, optional: true, doc: DOC });
  const generic = {
    bookScriptoriumRock: book(['town', 'liftingGloves']),
    bookRiverside: book(['town']),
    bookBeachBuried: book(['beach', shovel]),
    bookLakeShore: book(['lake', 'liftingGloves']),
    bookCliffRoad: book(['cliffs']),
    bookLighthouse: book(['cliffs']),
    bookEastRoad: book(['eastRoad']),
    bookWoods: book(['woods']),
    bookHighlands: book(['highlands', 'liftingGloves']),
    bookMeadowRock: book(['start', 'liftingGloves']),
  };
  for (const [id, rule] of Object.entries(generic)) rule.reached = found(id);
  VL.splitLock('hiddenBooks', generic);

  const claim = (id) => VL.defineLock(id, { ...VL.LOCKS[id], reached: found(id) });
  for (const id of [
    'hiddenBookSealed', 'bookHerbalist', 'bookTideTables', 'bookSmithsLedger', 'bookPrimer', 'bookDragons',
    'bookChickenAlmanac', 'pageFieldA', 'pageFieldB', 'heartFieldA', 'heartFieldB', 'oreWoods',
  ]) claim(id);
})();
