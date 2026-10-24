// The progression table: every lock in the game (a place, item, flag or story
// event) and the keys that open it, registered from the file that implements
// it; milestones.js seeds the whole path. VL.solveProgression walks the table
// from a new game to the ending and reports anything unreachable or any
// softlock, so a key moved behind the wrong door fails the test run.
// Field reference and the solver's assumptions: README "Progression".
(() => {
  VL.LOCKS = {};
  VL.MILESTONES = [];
  VL.LOCK_TYPES = ['place', 'item', 'flag', 'event'];

  VL.defineLock = function defineLock(id, lock) {
    const existing = VL.LOCKS[id];
    if (existing?.reached) throw new Error(`lock ${id} is already implemented`);
    if (typeof lock.doc !== 'string' || !lock.doc.startsWith('§ ')) throw new Error(`lock ${id} must cite its design-doc section (doc: '§ …')`);
    if (!lock.reached && !lock.by) throw new Error(`planned lock ${id} must name the item that implements it (by: 'W…')`);
    const type = lock.type || 'flag';
    if (!VL.LOCK_TYPES.includes(type)) throw new Error(`lock ${id}: unknown type ${type}`);
    if ((lock.loses?.length || lock.retires?.length) && type !== 'event') throw new Error(`lock ${id} loses keys but is not an event`);
    VL.LOCKS[id] = {
      needs: [], gives: [], supplies: {}, count: {}, consumes: {}, loses: [], retires: [],
      renewable: false, optional: false, ...lock, id, type,
    };
    return VL.LOCKS[id];
  };

  // The story order; the playthrough harness drives it and the solver checks it.
  VL.defineMilestones = function defineMilestones(ids) {
    if (VL.MILESTONES.length) throw new Error('milestones are already defined');
    VL.MILESTONES = ids.slice();
  };

  // Which locks a live game has opened (hints can be chosen from this).
  VL.progress = (state) => Object.keys(VL.LOCKS).filter((id) => Boolean(VL.LOCKS[id].reached?.(state)));

  // ---------- solver ----------

  const keysOf = (rule) => [rule.id, ...rule.gives];
  const sum = (items, pick) => items.reduce((total, item) => total + (pick(item) || 0), 0);

  function satisfied(rule, have, counts) {
    return rule.needs.every((need) => (Array.isArray(need) ? need.some((key) => have.has(key)) : have.has(need)))
      && Object.entries(rule.count).every(([counter, n]) => (counts[counter] || 0) >= n)
      && Object.entries(rule.consumes).every(([counter, n]) => (counts[counter] || 0) >= n);
  }

  // Everything obtainable from `keys` without triggering an event. Events that
  // become available are returned as `pending`; their gives and losses apply
  // only once a stage applies them. Consumption is not deducted here (the
  // budget checks below cover it).
  function closure(rules, keys, startCounts, disabled) {
    const have = new Set(keys);
    const counts = { ...startCounts };
    const pending = [];
    let changed = true;
    while (changed) {
      changed = false;
      for (const rule of rules) {
        if (have.has(rule.id) || disabled.has(rule.id) || pending.includes(rule.id)) continue;
        if (!satisfied(rule, have, counts)) continue;
        changed = true;
        if (rule.type === 'event') {
          pending.push(rule.id);
          continue;
        }
        for (const key of keysOf(rule)) have.add(key);
        for (const [counter, n] of Object.entries(rule.supplies)) counts[counter] = (counts[counter] || 0) + n;
      }
    }
    return { have, counts, pending };
  }

  // Keys the player cannot have avoided before triggering the event: blocking
  // any one of them makes the event unreachable. The worst-case player who
  // triggers the event holds exactly these.
  function forcedFor(rules, stage, eventId) {
    return [...stage.have].filter((key) => {
      if (stage.keys.has(key)) return false;
      const blocked = new Set(stage.disabled);
      for (const rule of rules) if (keysOf(rule).includes(key)) blocked.add(rule.id);
      return !closure(rules, stage.keys, stage.startCounts, blocked).pending.includes(eventId);
    });
  }

  function applyEvent(rules, byId, stage, event) {
    const forced = forcedFor(rules, stage, event.id);
    const lost = new Set([...event.loses, ...event.retires]);
    const lostRules = rules.filter((rule) => keysOf(rule).some((key) => event.loses.includes(key)));
    // What the lost gear cost, per counter it was made from.
    const demand = {};
    for (const rule of lostRules) for (const [counter, n] of Object.entries(rule.consumes)) demand[counter] = (demand[counter] || 0) + n;
    const spent = Object.keys(demand);
    const keys = new Set([...stage.keys, ...forced, event.id, ...event.gives]);
    for (const key of lost) keys.delete(key);
    const startCounts = { ...stage.startCounts };
    for (const rule of forced.map((id) => byId[id]).filter(Boolean)) {
      for (const [counter, n] of Object.entries(rule.supplies)) startCounts[counter] = (startCounts[counter] || 0) + n;
      for (const [counter, n] of Object.entries(rule.consumes)) startCounts[counter] = Math.max(0, (startCounts[counter] || 0) - n);
    }
    // Worst case for a counter the lost gear was made from: every source found
    // so far was collected and as much as possible went into that gear.
    for (const counter of spent) startCounts[counter] = Math.max(0, (stage.counts[counter] || 0) - demand[counter]);
    // One-time sources already reached are used up if what they gave is now
    // gone (the rest of what they gave is kept); sources of kept things are
    // left as "not yet collected", the worse case.
    const disabled = new Set(stage.disabled);
    for (const rule of rules) {
      if (!stage.have.has(rule.id) || rule.renewable) continue;
      if (!keysOf(rule).some((key) => lost.has(key)) && !Object.keys(rule.supplies).some((counter) => spent.includes(counter))) continue;
      disabled.add(rule.id);
      for (const key of keysOf(rule)) if (!lost.has(key)) keys.add(key);
      if (forced.includes(rule.id)) continue;
      for (const [counter, n] of Object.entries(rule.supplies)) if (!spent.includes(counter)) startCounts[counter] = (startCounts[counter] || 0) + n;
    }
    return { event: event.id, forced, spent, demand, keys, startCounts, disabled, ...closure(rules, keys, startCounts, disabled) };
  }

  function checkReferences(rules, byId, milestones) {
    const problems = [];
    const known = new Set(rules.flatMap(keysOf));
    const counters = new Set(rules.flatMap((rule) => Object.keys(rule.supplies)));
    for (const rule of rules) {
      for (const key of rule.needs.flat()) if (!known.has(key)) problems.push(`${rule.id} needs unknown key ${key}`);
      for (const key of [...rule.loses, ...rule.retires]) if (!known.has(key)) problems.push(`${rule.id} loses unknown key ${key}`);
      for (const counter of [...Object.keys(rule.count), ...Object.keys(rule.consumes)]) {
        if (!counters.has(counter)) problems.push(`${rule.id} uses counter ${counter} that nothing supplies`);
      }
    }
    for (const id of milestones) if (!byId[id]) problems.push(`milestone ${id} is not a lock`);
    return problems;
  }

  VL.solveProgression = function solveProgression(locks = VL.LOCKS, milestones = VL.MILESTONES) {
    const byId = locks;
    const rules = Object.values(locks);
    const problems = checkReferences(rules, byId, milestones);
    if (problems.length) return { ok: false, problems, stages: [], regained: {}, missable: {} };

    const first = { event: null, forced: [], spent: [], keys: new Set(), startCounts: {}, disabled: new Set() };
    Object.assign(first, closure(rules, first.keys, first.startCounts, first.disabled));
    const stages = [first];
    const regained = {};
    const storyOrder = (id) => (milestones.includes(id) ? milestones.indexOf(id) : milestones.length + rules.findIndex((rule) => rule.id === id));
    while (stages.at(-1).pending.length) {
      const stage = stages.at(-1);
      // Two events available at once are applied in story order only.
      const event = byId[stage.pending.slice().sort((a, b) => storyOrder(a) - storyOrder(b))[0]];
      const next = applyEvent(rules, byId, stage, event);
      stages.push(next);
      regained[event.id] = event.loses.filter((key) => next.have.has(key));
      for (const key of event.loses) if (!next.have.has(key)) problems.push(`after ${event.id}, ${key} cannot be regained`);
      for (const counter of next.spent) {
        const supply = next.counts[counter] || 0;
        if (next.demand[counter] > supply) problems.push(`after ${event.id}, counter ${counter}: ${next.demand[counter]} needed to regain what was lost but only ${supply} can be found`);
      }
    }

    const reachableIn = (stage, id) => stage.have.has(id) || stage.pending.includes(id);
    const firstStage = (id) => stages.findIndex((stage) => reachableIn(stage, id));
    const final = stages.at(-1);
    const missable = {};
    for (const rule of rules) {
      if (firstStage(rule.id) === -1) {
        problems.push(`${rule.id} is unreachable`);
        continue;
      }
      if (reachableIn(final, rule.id)) continue;
      const last = stages.findLastIndex((stage) => reachableIn(stage, rule.id));
      const cutBy = stages[last + 1].event;
      if (rule.optional) missable[rule.id] = cutBy;
      else problems.push(`${rule.id} is required but unreachable after ${cutBy}`);
    }
    const reachable = rules.filter((rule) => firstStage(rule.id) !== -1);
    const events = rules.filter((rule) => rule.type === 'event');
    for (const counter of new Set(rules.flatMap((rule) => Object.keys(rule.supplies)))) {
      const supply = sum(reachable, (rule) => rule.supplies[counter]);
      // Each loss of a thing made from the counter costs the counter again.
      const timesMade = (rule) => 1 + events.filter((event) => keysOf(rule).some((key) => event.loses.includes(key))).length;
      const demand = sum(reachable, (rule) => (rule.consumes[counter] || 0) * timesMade(rule));
      if (demand > supply) problems.push(`counter ${counter}: demand ${demand} exceeds supply ${supply}`);
    }
    for (let i = 1; i < milestones.length; i += 1) {
      const [earlier, later] = [firstStage(milestones[i - 1]), firstStage(milestones[i])];
      if (earlier !== -1 && later !== -1 && later < earlier) problems.push(`milestone ${milestones[i]} is listed after ${milestones[i - 1]} but is reachable in an earlier stage`);
    }

    return {
      ok: problems.length === 0,
      problems,
      stages: stages.map((stage) => ({
        event: stage.event,
        forced: stage.forced,
        spent: stage.spent,
        keys: [...stage.keys],
        disabled: [...stage.disabled],
        reached: [...stage.have, ...stage.pending],
        pending: stage.pending,
        counts: stage.counts,
      })),
      regained,
      missable,
    };
  };
})();
