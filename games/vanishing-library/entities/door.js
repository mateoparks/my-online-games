// { type: 'door', x, y, to: Place, needs?, locked? }: stepping on the tile moves the hero to `to`
// with no slide. Arrival spots sit one tile off the door so it doesn't re-fire.
// A door that `needs` an item (the Scriptorium's key) is solid without it,
// and S says `locked` (words) instead.
VL.defineEntity('door', {
  prepare(state, door) {
    door.solid = Boolean(door.needs && !VL.hasItem(state, door.needs));
  },
  passable: (state, door) => !door.needs || VL.hasItem(state, door.needs),
  // Only a shut door takes S; an open one leaves the press to a bush or berries beside it.
  takesS: (state, door) => Boolean(door.solid),
  onInteract(state, door) {
    VL.showMessage(state, { text: door.locked });
  },
  onStand(state, door) {
    VL.enterScreen(state, door.to);
    state.events.push({ type: 'door', to: door.to });
  },
});

// Walking into a door that needs a key says why, once per visit.
VL.defineSystem('keyedDoors', {
  order: 42,
  update(state, actions) {
    const player = state.player;
    if (!actions.held[player.facing] || player.lifted || player.carrying || player.flight || state.message) return;
    const ahead = VL.facingTile(state);
    const door = state.room.entities.find((e) => e.type === 'door' && e.solid && e.x === ahead.tx && e.y === ahead.ty);
    if (!door || door.told) return;
    const { w, h } = VL.TUNING.heroBox;
    const [dx, dy] = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[player.facing];
    if (!VL.isBlocked(player.area, player.screen, player.x + dx * 0.5, player.y + dy * 0.5, w, h, state.room)) return;
    door.told = true;
    VL.showMessage(state, { text: door.locked });
  },
});
