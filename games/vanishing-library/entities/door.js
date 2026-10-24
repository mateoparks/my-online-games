// { type: 'door', x, y, to: Place, needs?, locked? }: stepping on the tile moves the hero to `to`
// with no slide. Arrival spots sit one tile off the door so it doesn't re-fire.
// A door that `needs` an item (the Scriptorium's key) is solid without it,
// and S says `locked` (words) instead.
VL.defineEntity('door', {
  prepare(state, door) {
    door.solid = Boolean(door.needs && !VL.hasItem(state, door.needs));
  },
  passable: (state, door) => !door.needs || VL.hasItem(state, door.needs),
  onInteract(state, door) {
    if (door.solid) VL.showMessage(state, { text: door.locked });
  },
  onStand(state, door) {
    VL.enterScreen(state, door.to);
    state.events.push({ type: 'door', to: door.to });
  },
});
