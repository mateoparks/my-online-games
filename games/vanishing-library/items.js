// What the hero carries and is told: resources, items and the two hands, and
// popups shown once (design: Resources and economy, Controls). Registries
// only; the hands system, pickups and scenes use them. README "Core loop".
(() => {
  VL.RESOURCE_KINDS = ['wood', 'shells', 'brokenShells', 'berries', 'ore', 'paper', 'ink'];
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
    const before = state.inventory[kind];
    let after = Math.max(0, before + amount);
    // A gain stops at the resource's cap (VL.RESOURCE_CAPS, shop.js). A purse
    // already over it (a save from before W34 shrank the Big Shell Purse to
    // 50) keeps what it holds until spent.
    const cap = amount > 0 ? VL.RESOURCE_CAPS?.[kind] : undefined;
    if (cap && after > cap.most(state)) {
      after = Math.max(cap.most(state), before);
      cap.over?.(state);
    }
    state.inventory[kind] = after;
    if (amount < 0) VL.tidyHands(state);
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

  // An id no item defines (saved by an older version) is never owned.
  VL.hasItem = function hasItem(state, id) {
    const item = VL.ITEMS[id];
    if (!item) return false;
    if (item.count) return item.count(state) > 0;
    return Boolean(state.items[id]);
  };

  const twoHanded = (id) => Boolean(id && VL.ITEMS[id]?.twoHanded);

  // A new item goes into an empty hand: the main hand first, a shield the off
  // hand. A two-handed item (the shovel) fills both, so only when both are empty.
  // An item with `takesHand` (the Mirror Shield, needed for its boss) goes into
  // that hand the first time even when it is full; the old item stays owned,
  // and a one-handed one moves to the other hand when that one is empty.
  VL.giveItem = function giveItem(state, id) {
    const item = VL.ITEMS[id];
    if (!item) throw new Error(`no item ${id}`);
    const isNew = !state.items[id];
    state.items[id] = true;
    if (isNew && item.takesHand && VL.heldItem(state, item.takesHand) !== id) {
      const other = item.takesHand === 'mainHand' ? 'offHand' : 'mainHand';
      const displaced = VL.heldItem(state, item.takesHand);
      if (twoHanded(state.hands[item.takesHand]) || state.hands[other] === id) state.hands[other] = null;
      else if (displaced && !VL.heldItem(state, other)) state.hands[other] = displaced;
      state.hands[item.takesHand] = id;
    }
    VL.tidyHands(state);
    const held = VL.HANDS.some((hand) => state.hands[hand] === id);
    if (item.twoHanded) {
      if (!held && VL.HANDS.every((hand) => !state.hands[hand])) for (const hand of VL.HANDS) state.hands[hand] = id;
    } else {
      const free = (item.prefers === 'offHand' ? ['offHand', 'mainHand'] : VL.HANDS).find((hand) => !state.hands[hand]);
      if (free && !held) state.hands[free] = id;
    }
    if (item.popup) VL.showPopup(state, id);
    VL.earned(state);
  };

  // Puts an item in a hand; it leaves the other hand if it was there. Choosing
  // the item the hand already holds empties it. A two-handed item takes both
  // hands (both hand keys use it), and anything put in either hand frees both.
  VL.setHand = function setHand(state, hand, id) {
    if (!VL.HANDS.includes(hand)) throw new Error(`no hand ${hand}`);
    const other = hand === 'mainHand' ? 'offHand' : 'mainHand';
    if (id !== null && state.hands[hand] === id) id = null;
    if (twoHanded(id)) {
      state.hands[hand] = id;
      state.hands[other] = id;
    } else {
      if (twoHanded(state.hands[hand]) || (id !== null && state.hands[other] === id)) state.hands[other] = null;
      state.hands[hand] = id;
    }
    VL.earned(state);
  };

  // What a hand really holds: the saved id only while the hero has that item,
  // so a hand never shows or uses berries that were sold, eaten or taken, or
  // an item an older save names that no longer exists. Read hands through this.
  VL.heldItem = function heldItem(state, hand) {
    const id = state.hands?.[hand];
    return id && VL.hasItem(state, id) ? id : null;
  };

  // Empties a saved hand that holds something the hero no longer has; resource
  // losses call it, and anything that takes an item away should too.
  VL.tidyHands = function tidyHands(state) {
    for (const hand of VL.HANDS) {
      const id = state.hands[hand];
      if (id && !VL.hasItem(state, id)) state.hands[hand] = null;
    }
  };

  VL.equipmentItems = (state) => Object.values(VL.ITEMS).filter((item) => VL.hasItem(state, item.id));

  // ---------- popups ----------

  // { title, text }; `{name}` in either is the hero's name, and `{he}`,
  // `{him}`, `{his}`, `{hers}`, `{himself}`, `{boy}` (capitalised too: `{He}`)
  // are the hero's words, boy or girl (W37, `state.look.gender`); `{mainKey}`
  // and `{offKey}` the keys this save chose for the hands (W40).
  VL.POPUPS = {};

  VL.definePopup = function definePopup(id, popup) {
    if (VL.POPUPS[id]) throw new Error(`popup ${id} is already defined`);
    VL.POPUPS[id] = { id, ...popup };
  };

  VL.HERO_WORDS = {
    boy: { he: 'he', him: 'him', his: 'his', hers: 'his', himself: 'himself', boy: 'boy' },
    girl: { he: 'she', him: 'her', his: 'her', hers: 'hers', himself: 'herself', boy: 'girl' },
  };
  const capital = (word) => word[0].toUpperCase() + word.slice(1);
  VL.popupText = (text, state) => {
    const words = VL.HERO_WORDS[state?.look?.gender] || VL.HERO_WORDS.boy;
    return String(text ?? '')
      .replace(/\{name\}/g, state?.name || VL.DEFAULT_NAME || 'Hero')
      .replace(/\{(main|off)Key\}/g, (token, hand) => VL.handKeyWord(state, `${hand}Hand`))
      .replace(/\{(he|him|his|hers|himself|boy)\}/gi, (token, key) => {
        const word = words[key.toLowerCase()];
        if (key === key.toLowerCase()) return word;
        return key === capital(key.toLowerCase()) ? capital(word) : token;
      });
  };

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
    const { queue } = state.popups;
    // A saved id no popup defines any more (renamed or removed later) is
    // dropped, not shown and not marked seen: old saves must always play.
    while (queue.length && !VL.POPUPS[queue[0]]) queue.shift();
    const id = queue[0];
    if (!id) return null;
    const popup = VL.POPUPS[id];
    return { id, title: popup.title ? VL.popupText(popup.title, state) : null, text: VL.popupText(popup.text, state) };
  };

  VL.dismissPopup = function dismissPopup(state) {
    if (state.message) {
      state.message = null;
      return;
    }
    if (!VL.currentPopup(state)) return;
    const id = state.popups.queue.shift();
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

  // The tile straight ahead, then the ones beside it the hero half overlaps
  // (no repeats): what a swing hits and what S can reach.
  VL.facingTiles = function facingTiles(state) {
    const tiles = [];
    for (const side of [0, -5, 5]) {
      const tile = VL.facingTile(state, side);
      if (!tiles.some((other) => other.tx === tile.tx && other.ty === tile.ty)) tiles.push(tile);
    }
    return tiles;
  };
})();
