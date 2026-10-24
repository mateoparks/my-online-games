// { type: 'rockBook', id } on a rock tile: a corner of red peeks out from
// under the rock; lift the rock (the Lifting Gloves) and the book lies there
// to pick up. Fills W8's four rock spots (design: Hidden books, "under rocks").
(() => {
  VL.defineEntity('rockBook', {
    prepare: (state, book) => !VL.spotFound(state, book.id),
    onStand(state, book) {
      state.room.entities = state.room.entities.filter((e) => e !== book);
      state.room.standingOn = null;
      VL.findBook(state, book.id);
    },
    draw(ctx, book, x, y, t) {
      if (!book.uncovered) {
        VL.ART.rect(ctx, 'heart', x + 11, y + 13, 3, 2);
        VL.ART.rect(ctx, 'white', x + 11, y + 13, 1, 1);
        return;
      }
      const bob = Math.round(Math.sin(t * 3));
      VL.ART.drawShadow(ctx, x + 8, y + 13, 9);
      VL.ART.drawSprite(ctx, 'pickup-book', x + 4, y + 6 + bob);
      VL.ART.drawSparkle(ctx, x + 12, y + 4 + bob, t);
    },
  });

  for (const id of ['bookMeadowRock', 'bookLakeShore', 'bookHighlands', 'bookScriptoriumRock']) VL.fillSpot(id, { type: 'rockBook', id });
})();
