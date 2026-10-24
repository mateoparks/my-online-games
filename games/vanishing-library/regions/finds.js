// The overworld's finds in the progression table. Pages, heart containers and
// the Woods ore are W8's: each is reached once picked up at its spot
// (VL.markFound, called by the item that fills the spot). Books count only
// once returned to the library, so their locks stay planned for W11, which
// claims them; W8 splits hiddenBooks into the ten books its map places.
(() => {
  const found = (id) => (state) => VL.spotFound(state, id);
  const shovel = ['woodShovel', 'metalShovel'];
  const DOC = '§ Books, pages and the library: Hidden books';

  // A book's needs are where it lies and what uncovers it (gloves for a rock,
  // a shovel for a dig), plus the library it is returned to.
  const book = (needs) => ({ type: 'item', needs: [...needs, 'library'], supplies: { books: 1 }, optional: true, doc: DOC, by: 'W11' });
  VL.splitLock('hiddenBooks', {
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
  });
  for (const id of ['hiddenBookSealed', 'bookHerbalist', 'bookTideTables', 'bookSmithsLedger', 'bookPrimer', 'bookDragons', 'bookChickenAlmanac']) {
    VL.defineLock(id, { ...VL.LOCKS[id], by: 'W11' });
  }

  for (const id of ['pageFieldA', 'pageFieldB', 'heartFieldA', 'heartFieldB', 'oreWoods']) {
    VL.defineLock(id, { ...VL.LOCKS[id], reached: found(id) });
  }
})();
