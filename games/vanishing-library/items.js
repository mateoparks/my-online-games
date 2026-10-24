// What the hero carries and is told: resources, items and the two hands, and
// popups shown once (design: Resources and economy, Controls). Registries
// only; the hands system, pickups and scenes use them. README "Core loop".
(() => {
  VL.RESOURCE_KINDS = ['wood', 'shells', 'brokenShells', 'berries', 'ore'];
  VL.HANDS = ['mainHand', 'offHand'];

  VL.extendGame('inventory', () => ({
    inventory: Object.fromEntries(VL.RESOURCE_KINDS.map((kind) => [kind, 0])),
    items: {},
    hands: { mainHand: null, offHand: null },
  }));
  // `seen` is every popup ever closed; `queue` waits to be shown, saved so a
  // reload before reading one still shows it.
  VL.extendGame('popups', () => ({ popups: { seen: {}, queue: [] } }));
  VL.extendGame('message', () => ({ message: null }), { transient: true });

  // ---------- resources ----------

  VL.addResource = function addResource(state, kind, amount = 1) {
    if (!VL.RESOURCE_KINDS.includes(kind)) throw new Error(`no resource ${kind}`);
    state.inventory[kind] = Math.max(0, state.inventory[kind] + amount);
    VL.earned(state);
  };

  // ---------- items ----------

  // { name, icon, about, popup?: { title, text }, use?(state, hand), hold?(state, hand, held),
  //   count?(state) }. An item with `count` is owned while the count is above 0
  // (berries); any other is owned once given. `icon` names the `item-<icon>` sprite.
  VL.ITEMS = {};

  VL.defineItem = function defineItem(id, item) {
    if (VL.ITEMS[id]) throw new Error(`item ${id} is already defined`);
    VL.ITEMS[id] = { id, ...item };
    if (item.popup) VL.definePopup(id, item.popup);
    return VL.ITEMS[id];
  };

  VL.hasItem = function hasItem(state, id) {
    const item = VL.ITEMS[id];
    if (item?.count) return item.count(state) > 0;
    return Boolean(state.items[id]);
  };

  // A new item goes into an empty hand: the main hand first, a shield the off hand.
  VL.giveItem = function giveItem(state, id) {
    const item = VL.ITEMS[id];
    if (!item) throw new Error(`no item ${id}`);
    state.items[id] = true;
    const free = (item.prefers === 'offHand' ? ['offHand', 'mainHand'] : VL.HANDS).find((hand) => !state.hands[hand]);
    if (free && !VL.HANDS.some((hand) => state.hands[hand] === id)) state.hands[free] = id;
    if (item.popup) VL.showPopup(state, id);
    VL.earned(state);
  };

  // Puts an item in a hand; it leaves the other hand if it was there. Choosing
  // the item the hand already holds empties it.
  VL.setHand = function setHand(state, hand, id) {
    if (!VL.HANDS.includes(hand)) throw new Error(`no hand ${hand}`);
    const other = hand === 'mainHand' ? 'offHand' : 'mainHand';
    if (id !== null && state.hands[hand] === id) id = null;
    if (id !== null && state.hands[other] === id) state.hands[other] = null;
    state.hands[hand] = id;
    VL.earned(state);
  };

  // A hand holding an item the hero no longer has (the last berry eaten) empties.
  VL.tidyHands = function tidyHands(state) {
    for (const hand of VL.HANDS) {
      const id = state.hands[hand];
      if (id && !VL.hasItem(state, id)) state.hands[hand] = null;
    }
  };

  VL.equipmentItems = (state) => Object.values(VL.ITEMS).filter((item) => VL.hasItem(state, item.id));

  // ---------- popups ----------

  // { title, text }; `{name}` in either is the hero's name.
  VL.POPUPS = {};

  VL.definePopup = function definePopup(id, popup) {
    if (VL.POPUPS[id]) throw new Error(`popup ${id} is already defined`);
    VL.POPUPS[id] = { id, ...popup };
  };

  VL.popupText = (text, state) => String(text ?? '').replace(/\{name\}/g, state?.name || VL.DEFAULT_NAME || 'Hero');

  // Queues a popup unless it was ever shown or is already waiting; the play
  // scene opens it with the world paused underneath.
  VL.showPopup = function showPopup(state, id) {
    if (!VL.POPUPS[id]) throw new Error(`no popup ${id}`);
    const { seen, queue } = state.popups;
    if (seen[id] || queue.includes(id)) return false;
    queue.push(id);
    VL.earned(state);
    return true;
  };

  // A message (a sign's words) is shown every time and never saved.
  VL.showMessage = function showMessage(state, { title = null, text }) {
    state.message = { id: null, title, text };
  };

  VL.currentPopup = function currentPopup(state) {
    if (!state) return null;
    if (state.message) return { ...state.message, title: VL.popupText(state.message.title, state) || null, text: VL.popupText(state.message.text, state) };
    const id = state.popups.queue[0];
    if (!id) return null;
    const popup = VL.POPUPS[id];
    return { id, title: popup.title ? VL.popupText(popup.title, state) : null, text: VL.popupText(popup.text, state) };
  };

  VL.dismissPopup = function dismissPopup(state) {
    if (state.message) {
      state.message = null;
      return;
    }
    const id = state.popups.queue.shift();
    if (id === undefined) return;
    state.popups.seen[id] = true;
    VL.earned(state);
  };

  // ---------- facing ----------

  // The tile in front of the hero's feet; `side` shifts the probe sideways in
  // pixels, so a swing also catches a tile the hero half overlaps.
  const PROBE = { up: [0, -14], down: [0, 8], left: [-12, -4], right: [12, -4] };
  VL.facingTile = function facingTile(state, side = 0) {
    const { x, y, facing } = state.player;
    const [dx, dy] = PROBE[facing] || PROBE.down;
    return VL.tileOf(x + dx + (dy ? side : 0), y + dy + (dx ? side : 0));
  };
})();
