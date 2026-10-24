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
  // (all of them); `has` is { resource: at least }.
  const all = (ids, ok) => [].concat(ids).every(ok);
  const CONDITIONS = {
    flag: (state, ids) => all(ids, (id) => Boolean(state.flags[id])),
    notFlag: (state, ids) => all(ids, (id) => !state.flags[id]),
    progress: (state, ids) => all(ids, (id) => Boolean(VL.LOCKS[id]?.reached?.(state))),
    notProgress: (state, ids) => all(ids, (id) => !VL.LOCKS[id]?.reached?.(state)),
    item: (state, ids) => all(ids, (id) => Boolean(VL.hasItem?.(state, id))),
    notItem: (state, ids) => all(ids, (id) => !VL.hasItem?.(state, id)),
    has: (state, counts) => Object.entries(counts).every(([kind, least]) => VL.purse(state, kind) >= least),
    test: (state, fn) => Boolean(fn(state)),
  };

  VL.conditionMet = (state, when = {}) => Object.entries(when).every(([key, value]) => CONDITIONS[key](state, value));

  // entries: [{ when, say, set, shop }]. `say` is a string or a list (each
  // starts a new page); `set` names flags set when the talk starts; `shop`
  // opens that shop when it ends.
  VL.defineDialogue = function defineDialogue(id, entries) {
    if (VL.DIALOGUES[id]) throw new Error(`dialogue ${id} is already defined`);
    entries.forEach((entry, i) => {
      for (const key of Object.keys(entry.when || {})) {
        if (!CONDITIONS[key]) throw new Error(`dialogue ${id} entry ${i + 1}: unknown condition ${key}`);
      }
      if (!entry.say || ![].concat(entry.say).every((line) => typeof line === 'string' && line)) {
        throw new Error(`dialogue ${id} entry ${i + 1} needs words to say`);
      }
    });
    VL.DIALOGUES[id] = entries;
  };

  VL.pickDialogue = function pickDialogue(state, id) {
    const entries = VL.DIALOGUES[id];
    if (!entries) throw new Error(`no dialogue ${id}`);
    return entries.find((entry) => VL.conditionMet(state, entry.when)) || null;
  };

  VL.fillName = (text, state) => String(text).replace(/\{name\}/g, state?.name || VL.DEFAULT_NAME || 'Hero');

  // Pages of popup lines: each string of `say` starts a page, and a string
  // longer than the box goes on over as many pages as it needs.
  VL.dialoguePages = function dialoguePages(say, state) {
    const { width, pad, maxLines } = VL.ART.POPUP;
    const pages = [];
    for (const text of [].concat(say)) {
      const lines = VL.ART.wrapText(VL.fillName(text, state), width - pad * 2, 'normal');
      for (let i = 0; i < lines.length; i += maxLines) pages.push(lines.slice(i, i + maxLines));
    }
    return pages;
  };

  // Turns the NPC to face the hero, earns the entry's flags and opens the
  // dialogue scene. False when the NPC has nothing to say right now.
  VL.talkTo = function talkTo(state, entity) {
    const npc = VL.NPCS[entity.id];
    if (!npc) return false;
    const entry = VL.pickDialogue(state, entity.talk || npc.talk);
    if (!entry) return false;
    entity.facing = VL.facingToward(VL.npcFeet(entity, 0, 0), state.player);
    if (entry.set) {
      for (const flag of [].concat(entry.set)) state.flags[flag] = true;
      VL.earned(state);
    }
    entity.walk = null;
    state.events.push({ type: 'talk', npc: entity.id });
    VL.requestScene(state, 'dialogue', { speaker: VL.fillName(npc.name, state), pages: VL.dialoguePages(entry.say, state), shop: entry.shop || null });
    return true;
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
  VL.dialogueProblems = function dialogueProblems() {
    const problems = [];
    const sample = { name: 'Ñandú Élodïe' };
    for (const [id, entries] of Object.entries(VL.DIALOGUES)) {
      const open = entries.findIndex((entry) => !entry.when || Object.keys(entry.when).length === 0);
      if (open === -1) problems.push(`${id}: no entry without conditions, so it can fall silent`);
      else if (open < entries.length - 1) problems.push(`${id}: entry ${open + 2} can never be picked (entry ${open + 1} always matches)`);
      for (const entry of entries) {
        for (const lock of [].concat(entry.when?.progress || [], entry.when?.notProgress || [])) {
          if (!VL.LOCKS[lock]) problems.push(`${id}: unknown lock ${lock}`);
        }
        if (entry.shop && !VL.SHOPS[entry.shop]) problems.push(`${id}: unknown shop ${entry.shop}`);
        const missing = VL.ART.missingGlyphs([].concat(entry.say).map((text) => VL.fillName(text, sample)).join(' '));
        if (missing.length) problems.push(`${id}: the font cannot draw ${missing.join(' ')}`);
      }
    }
    for (const npc of Object.values(VL.NPCS)) {
      if (!VL.DIALOGUES[npc.talk]) problems.push(`npc ${npc.id}: no dialogue ${npc.talk}`);
    }
    return problems;
  };
})();
