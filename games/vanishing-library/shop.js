// Shops and trades as data (README "Shops"): the shop scene lists a shop's
// offers and these rules decide what a buy costs and gives. Costs and gains
// are counted resources (state.inventory); `give` hands over anything else.
(() => {
  VL.SHOPS = {};
  VL.CURRENCIES = {};

  VL.defineCurrency = function defineCurrency(kind, { one, many = one, icon = null }) {
    if (VL.CURRENCIES[kind]) throw new Error(`currency ${kind} is already defined`);
    VL.CURRENCIES[kind] = { one, many, icon };
  };
  VL.defineCurrency('shells', { one: 'shell', many: 'shells', icon: 'icon-shell' });
  VL.defineCurrency('wood', { one: 'wood' });
  VL.defineCurrency('ore', { one: 'ore lump', many: 'ore lumps' });
  VL.defineCurrency('berries', { one: 'berry', many: 'berries' });
  VL.defineCurrency('brokenShells', { one: 'broken shell', many: 'broken shells' });
  VL.defineCurrency('paper', { one: 'paper' });
  VL.defineCurrency('ink', { one: 'ink' });

  const amounts = (value) => value && typeof value === 'object' && Object.keys(value).length > 0
    && Object.values(value).every((n) => Number.isInteger(n) && n > 0);

  // offers: [{ id, name, cost: { shells: 2 }, gain: { paper: 1 }, give(state),
  // about, icon, verb, soldOut(state), hidden(state), refuse(state) }].
  // `refuse` returns why not right now ("Bring me pages first!") or null.
  VL.defineShop = function defineShop(id, shop) {
    if (VL.SHOPS[id]) throw new Error(`shop ${id} is already defined`);
    if (!shop.offers?.length) throw new Error(`shop ${id} has no offers`);
    const seen = new Set();
    for (const offer of shop.offers) {
      if (seen.has(offer.id)) throw new Error(`shop ${id}: offer ${offer.id} is listed twice`);
      seen.add(offer.id);
      if (!amounts(offer.cost)) throw new Error(`shop ${id}: offer ${offer.id} needs a cost of whole amounts above 0`);
      if (offer.gain !== undefined && !amounts(offer.gain)) throw new Error(`shop ${id}: offer ${offer.id} has a bad gain`);
      if (!offer.gain && !offer.give) throw new Error(`shop ${id}: offer ${offer.id} gives nothing`);
      // Shops are defined after the inventory's resource list, so a misspelt kind fails at load.
      for (const kind of [...Object.keys(offer.cost), ...Object.keys(offer.gain || {})]) {
        if (VL.RESOURCE_KINDS && !VL.RESOURCE_KINDS.includes(kind)) throw new Error(`shop ${id}: offer ${offer.id} uses unknown resource ${kind}`);
      }
    }
    VL.SHOPS[id] = { id, ...shop };
  };

  VL.openShop = (state, id) => VL.requestScene(state, 'shop', { shop: id });

  VL.purse = (state, kind) => state.inventory?.[kind] ?? 0;

  VL.shopOffers = (state, shop) => shop.offers.filter((offer) => !offer.hidden?.(state));

  VL.currencyName = (kind, n) => {
    const currency = VL.CURRENCIES[kind];
    if (!currency) return kind;
    return n === 1 ? currency.one : currency.many;
  };

  VL.priceText = (cost) => Object.entries(cost).map(([kind, n]) => `${n} ${VL.currencyName(kind, n)}`).join(', ');

  // The first resource the purse holds too little of, or null.
  VL.shortfall = function shortfall(state, cost) {
    return Object.keys(cost).find((kind) => VL.purse(state, kind) < cost[kind]) || null;
  };

  // A trade turns resources into shells (the paper mill, selling berries);
  // anything else is bought.
  VL.offerVerb = (offer) => offer.verb || (offer.gain && 'shells' in offer.gain ? 'Trade' : 'Buy');

  // Pays every cost or none. { ok } or { ok: false, reason: 'soldOut' |
  // 'refused' (with text) | 'notEnough' (with kind) }.
  VL.buyOffer = function buyOffer(state, offer) {
    if (offer.soldOut?.(state)) return { ok: false, reason: 'soldOut' };
    const refusal = offer.refuse?.(state);
    if (refusal) return { ok: false, reason: 'refused', text: refusal };
    const kind = VL.shortfall(state, offer.cost);
    if (kind) return { ok: false, reason: 'notEnough', kind };
    for (const [spent, n] of Object.entries(offer.cost)) VL.addResource(state, spent, -n);
    for (const [gained, n] of Object.entries(offer.gain || {})) VL.addResource(state, gained, n);
    offer.give?.(state);
    VL.earned(state);
    state.events.push({ type: 'bought', offer: offer.id });
    return { ok: true };
  };
})();
