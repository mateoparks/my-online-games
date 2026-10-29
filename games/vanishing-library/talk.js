// People and what they say (README "NPCs and dialogue"). An NPC is placed on a
// screen as { type: 'npc', id, x, y }; VL.defineNpc says who it is and
// VL.defineDialogue what it says, as data: the first entry whose conditions
// hold is spoken.
(() => {
  VL.NPCS = {};
  VL.DIALOGUES = {};

  VL.defineNpc = function defineNpc(id, { name, look, talk = id, wander = 0 }) {
    if (VL.NPCS[id]) throw new Error(`npc ${id} is already defined`);
    if (!name || !look) throw new Error(`npc ${id} needs a name and a look`);
    VL.NPCS[id] = { id, name, look, talk, wander };
  };

  // Every key of `when` must hold. A value may be one id or a list of ids
  // (all of them); `has` is { resource: at least }. Later items add their own
  // keys with VL.defineCondition (W11: books returned).
  const all = (ids, ok) => [].concat(ids).every(ok);
  const CONDITIONS = {};
  VL.defineCondition = function defineCondition(key, test) {
    if (CONDITIONS[key]) throw new Error(`condition ${key} is already defined`);
    CONDITIONS[key] = test;
  };
  VL.defineCondition('flag', (state, ids) => all(ids, (id) => Boolean(state.flags[id])));
  VL.defineCondition('notFlag', (state, ids) => all(ids, (id) => !state.flags[id]));
  VL.defineCondition('progress', (state, ids) => all(ids, (id) => Boolean(VL.LOCKS[id]?.reached?.(state))));
  VL.defineCondition('notProgress', (state, ids) => all(ids, (id) => !VL.LOCKS[id]?.reached?.(state)));
  VL.defineCondition('item', (state, ids) => all(ids, (id) => VL.hasItem(state, id)));
  VL.defineCondition('notItem', (state, ids) => all(ids, (id) => !VL.hasItem(state, id)));
  VL.defineCondition('has', (state, counts) => Object.entries(counts).every(([kind, least]) => VL.purse(state, kind) >= least));
  VL.defineCondition('test', (state, fn) => Boolean(fn(state)));

  VL.conditionMet = (state, when = {}) => Object.entries(when).every(([key, value]) => CONDITIONS[key](state, value));

  // What an entry's `give` can hand over: { item: id or ids, <resource
  // kind>: amount }. A found page is a flag, so `set` covers it. Later items
  // add kinds with VL.defineGift (a heart container, say).
  const GIFTS = {};
  VL.defineGift = function defineGift(kind, give) {
    if (GIFTS[kind]) throw new Error(`gift ${kind} is already defined`);
    GIFTS[kind] = give;
  };
  VL.defineGift('item', (state, ids) => [].concat(ids).forEach((id) => VL.giveItem(state, id)));
  const giftOf = (kind) => GIFTS[kind] || (VL.RESOURCE_KINDS.includes(kind) ? (state, n) => VL.addResource(state, kind, n) : null);

  function checkEntries(id, entries) {
    entries.forEach((entry, i) => {
      const where = `dialogue ${id} entry ${i + 1}`;
      for (const key of Object.keys(entry.when || {})) {
        if (!CONDITIONS[key]) throw new Error(`${where}: unknown condition ${key}`);
      }
      if (!entry.say || ![].concat(entry.say).every((line) => typeof line === 'string' && line)) {
        throw new Error(`${where} needs words to say`);
      }
      if (entry.give !== undefined) {
        if (!entry.give || typeof entry.give !== 'object') throw new Error(`${where}: give is { kind: what }`);
        for (const kind of Object.keys(entry.give)) {
          if (!giftOf(kind)) throw new Error(`${where}: unknown gift ${kind}`);
        }
      }
    });
  }

  // entries: [{ when, say, set, give, shop }]. `say` is a string or a list
  // (each starts a new page). When the talk ends (the last page, or Esc) the
  // entry's `set` flags are set and its `give` handed over, together, so a
  // reward and the flag that says it was given are saved as one; `shop`
  // then opens that shop.
  VL.defineDialogue = function defineDialogue(id, entries) {
    if (VL.DIALOGUES[id]) throw new Error(`dialogue ${id} is already defined`);
    checkEntries(id, entries);
    VL.DIALOGUES[id] = entries;
  };

  // Lines a later item adds to someone else's NPC (W16 after the shockwave):
  // they go first, as later story outranks earlier.
  VL.addDialogue = function addDialogue(id, entries) {
    if (!VL.DIALOGUES[id]) throw new Error(`no dialogue ${id}`);
    checkEntries(id, entries);
    VL.DIALOGUES[id] = [...entries, ...VL.DIALOGUES[id]];
  };

  VL.pickDialogue = function pickDialogue(state, id) {
    const entries = VL.DIALOGUES[id];
    if (!entries) throw new Error(`no dialogue ${id}`);
    return entries.find((entry) => VL.conditionMet(state, entry.when)) || null;
  };

  // Pages of popup lines: each string of `say` starts a page, and a string
  // longer than the box goes on over as many pages as it needs.
  VL.dialoguePages = function dialoguePages(say, state) {
    const { width, pad, maxLines } = VL.ART.POPUP;
    const pages = [];
    for (const text of [].concat(say)) {
      const lines = VL.ART.wrapText(VL.popupText(text, state), width - pad * 2, 'normal');
      for (let i = 0; i < lines.length; i += maxLines) pages.push(lines.slice(i, i + maxLines));
    }
    return pages;
  };

  // `override(state, entity)` returns an entry to say instead of the
  // person's own (egg on his face, W38), or null.
  VL.TALK_OVERRIDES = [];
  VL.overrideTalk = (override) => VL.TALK_OVERRIDES.push(override);

  // Turns the NPC to face the hero and opens the dialogue scene. False when
  // the NPC has nothing to say right now.
  VL.talkTo = function talkTo(state, entity) {
    const npc = VL.NPCS[entity.id];
    if (!npc) return false;
    const override = VL.TALK_OVERRIDES.map((rule) => rule(state, entity)).find(Boolean);
    const entry = override || VL.pickDialogue(state, entity.talk || npc.talk);
    if (!entry) return false;
    entity.facing = VL.facingToward(VL.npcFeet(entity, 0, 0), state.player);
    entity.walk = null;
    if (!override) state.events.push({ type: 'talk', npc: entity.id });
    VL.requestScene(state, 'dialogue', {
      speaker: VL.popupText(npc.name, state),
      pages: VL.dialoguePages(entry.say, state),
      shop: entry.shop || null,
      end: { set: entry.set, give: entry.give },
    });
    return true;
  };

  // The dialogue scene calls this once as the talk ends, however it ends.
  VL.endTalk = function endTalk(state, end) {
    if (!end || (!end.set && !end.give)) return;
    for (const flag of [].concat(end.set || [])) state.flags[flag] = true;
    for (const [kind, what] of Object.entries(end.give || {})) giftOf(kind)(state, what);
    VL.earned(state);
  };

  // An NPC's feet point (like state.player's) at its tile, part way back
  // towards the tile it is leaving while a step is under way.
  VL.npcFeet = function npcFeet(entity, ox, oy) {
    const { tile } = VL.TUNING;
    let { x, y } = entity;
    if (entity.walk) {
      const k = Math.min(1, entity.walk.t / VL.TUNING.npcStepSeconds);
      x = entity.walk.fromX + (x - entity.walk.fromX) * k;
      y = entity.walk.fromY + (y - entity.walk.fromY) * k;
    }
    return { x: ox + x * tile + tile / 2, y: oy + y * tile + 12 };
  };

  // The way to face from `from` to look at `to` (both feet points).
  VL.facingToward = function facingToward(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
    return dy > 0 ? 'down' : 'up';
  };

  // Content checks for tests/npcs-dialogue.test.js: everything a typo or a
  // reordered entry would break without an error at run time.
  // A gift is given once when its entry stops matching after it: its own
  // `set` flags are all in its `notFlag`, or the item it gives is in `notItem`.
  function giftGuarded(entry) {
    const set = [].concat(entry.set || []);
    const notFlag = [].concat(entry.when?.notFlag || []);
    if (set.length && set.every((flag) => notFlag.includes(flag))) return true;
    const item = entry.give.item;
    return Boolean(item) && [].concat(entry.when?.notItem || []).includes(item);
  }

  VL.dialogueProblems = function dialogueProblems() {
    const problems = [];
    const sample = { name: 'Ñandú Élodïe' };
    for (const [id, entries] of Object.entries(VL.DIALOGUES)) {
      const open = entries.findIndex((entry) => !entry.when || Object.keys(entry.when).length === 0);
      if (open === -1) problems.push(`${id}: no entry without conditions, so it can fall silent`);
      else if (open < entries.length - 1) problems.push(`${id}: entry ${open + 2} can never be picked (entry ${open + 1} always matches)`);
      entries.forEach((entry, i) => {
        if (entry.give && !entry.repeat && !giftGuarded(entry)) {
          problems.push(`${id}: entry ${i + 1} gives a gift without a guard (its own set flags in when.notFlag, or repeat: true)`);
        }
        for (const lock of [].concat(entry.when?.progress || [], entry.when?.notProgress || [])) {
          if (!VL.LOCKS[lock]) problems.push(`${id}: unknown lock ${lock}`);
        }
        if (entry.shop && !VL.SHOPS[entry.shop]) problems.push(`${id}: unknown shop ${entry.shop}`);
        for (const kind of Object.keys(entry.when?.has || {})) {
          if (!VL.RESOURCE_KINDS.includes(kind)) problems.push(`${id}: unknown resource ${kind}`);
        }
        for (const item of [].concat(entry.when?.item || [], entry.when?.notItem || [], entry.give?.item || [])) {
          if (!VL.ITEMS[item]) problems.push(`${id}: unknown item ${item}`);
        }
        const missing = VL.ART.missingGlyphs([].concat(entry.say).map((text) => VL.popupText(text, sample)).join(' '));
        if (missing.length) problems.push(`${id}: the font cannot draw ${missing.join(' ')}`);
      });
    }
    for (const npc of Object.values(VL.NPCS)) {
      if (!VL.DIALOGUES[npc.talk]) problems.push(`npc ${npc.id}: no dialogue ${npc.talk}`);
    }
    return problems;
  };
})();
