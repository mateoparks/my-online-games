// { type: 'door', x, y, to: Place }: stepping on the tile moves the hero to `to`
// with no slide. Arrival spots sit one tile off the door so it doesn't re-fire.
VL.defineEntity('door', {
  onStand(state, door) {
    VL.enterScreen(state, door.to);
    state.events.push({ type: 'door', to: door.to });
  },
});
