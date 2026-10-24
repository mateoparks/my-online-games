// The progression table: every lock in the game (a place, item, flag or story
// event) and the keys that open it, registered from the file that implements
// it; milestones.js seeds the whole path. VL.solveProgression walks the table
// from a new game to the ending and reports anything unreachable or any
// softlock, so a key moved behind the wrong door fails the test run.
// Field reference and the solver's assumptions: README "Progression".
(() => {
  VL.LOCKS = {};
  VL.MILESTONES = [];
  VL.SKIPPABLE_MILESTONES = [];
  VL.RESOURCES = new Set();
  VL.LOCK_TYPES = ['place', 'item', 'flag', 'event'];

  const RULE_FIELDS = ['type', 'needs', 'gives', 'supplies', 'count', 'consumes', 'loses', 'retires', 'renewable', 'optional'];
  const sortedEntries = (object) => Object.entries(object).sort(([a], [b]) => a.localeCompare(b));
  const need = (entry) => (Array.isArray(entry) ? entry.slice().sort().join('|') : entry);
  // The rule as the solver sees it, order-insensitive, for comparing a claim with its plan.
  const shapeOf = (lock) => ({
    type: lock.type,
    needs: lock.needs.map(need).sort(),
    gives: lock.gives.slice().sort(),
    supplies: sortedEntries(lock.supplies),
    count: sortedEntries(lock.count),
    consumes: sortedEntries(lock.consumes),
    loses: lock.loses.slice().sort(),
    retires: lock.retires.slice().sort(),
    renewable: lock.renewable,
    optional: lock.optional,
  });

  VL.defineLock = function defineLock(id, lock) {
    const existing = VL.LOCKS[id];
    if (existing?.reached) throw new Error(`lock ${id} is already implemented`);
    if (typeof lock.doc !== 'string' || !lock.doc.startsWith('§ ')) throw new Error(`lock ${id} must cite its design-doc section (doc: '§ …')`);
    if (!lock.reached && !lock.by) throw new Error(`planned lock ${id} must name the item that implements it (by: 'W…')`);
    const type = lock.type || 'flag';
    if (!VL.LOCK_TYPES.includes(type)) throw new Error(`lock ${id}: unknown type ${type}`);
    if ((lock.loses?.length || lock.retires?.length) && type !== 'event') throw new Error(`lock ${id} loses keys but is not an event`);
    const rule = {
      needs: [], gives: [], supplies: {}, count: {}, consumes: {}, loses: [], retires: [],
      renewable: false, optional: false, ...lock, id, type,
    };
    if (existing && rule.reached && typeof rule.replan !== 'string') {
      const [planned, claimed] = [shapeOf(existing), shapeOf(rule)];
      const changed = RULE_FIELDS.filter((field) => JSON.stringify(planned[field]) !== JSON.stringify(claimed[field]));
      if (changed.length) throw new Error(`lock ${id} is claimed with a different rule than planned (${changed.join(', ')}); say why with replan: '…'`);
    }
    VL.LOCKS[id] = rule;
    return rule;
  };

  // Replaces a planned placeholder (one line standing for several finds) with
  // the real locks, from the item's own file. The parts must supply what the
  // placeholder promised, so the book rewards keep adding up.
  VL.splitLock = function splitLock(id, parts) {
    const placeholder = VL.LOCKS[id];
    if (!placeholder) throw new Error(`lock ${id} does not exist`);
    if (placeholder.reached) throw new Error(`lock ${id} is implemented, not a placeholder`);
    for (const partId of Object.keys(parts)) if (VL.LOCKS[partId]) throw new Error(`lock ${partId} already exists`);
    for (const [counter, promised] of Object.entries(placeholder.supplies)) {
      const total = Object.values(parts).reduce((sum, part) => sum + (part.supplies?.[counter] || 0), 0);
      if (total !== promised) throw new Error(`lock ${id} supplies ${counter} ${promised} but its parts supply ${total}`);
    }
    delete VL.LOCKS[id];
    for (const [partId, part] of Object.entries(parts)) VL.defineLock(partId, part);
  };

  // Keys that are spent by what uses them (wood, shells, …): only a renewable
  // source counts as having one, so a one-time gift is a top-up, not a supply.
  VL.defineResources = function defineResources(keys) {
    for (const key of keys) VL.RESOURCES.add(key);
  };

  // The story order; the playthrough harness drives it and the solver checks
  // it. Each beat gates the next unless listed as skippable.
  VL.defineMilestones = function defineMilestones(ids, { skippable = [] } = {}) {
    if (VL.MILESTONES.length) throw new Error('milestones are already defined');
    VL.MILESTONES = ids.slice();
    VL.SKIPPABLE_MILESTONES = skippable.slice();
  };

  // Which locks a live game has opened (hints can be chosen from this).
  VL.progress = (state) => Object.keys(VL.LOCKS).filter((id) => Boolean(VL.LOCKS[id].reached?.(state)));

  // ---------- solver ----------

  const keysOf = (rule) => [rule.id, ...rule.gives];
  const sum = (items, pick) => items.reduce((total, item) => total + (pick(item) || 0), 0);

  function satisfied(rule, have, counts) {
    return rule.needs.every((entry) => (Array.isArray(entry) ? entry.some((key) => have.has(key)) : have.has(entry)))
      && Object.entries(rule.count).every(([counter, n]) => (counts[counter] || 0) >= n)
      && Object.entries(rule.consumes).every(([counter, n]) => (counts[counter] || 0) >= n);
  }

  function checkReferences(rules, byId, milestones, resources, skippable) {
    const problems = [];
    const known = new Set(rules.flatMap(keysOf));
    const renewable = new Set(rules.filter((rule) => rule.renewable).flatMap(keysOf));
    const counters = new Set(rules.flatMap((rule) => Object.keys(rule.supplies)));
    for (const rule of rules) {
      for (const key of rule.needs.flat()) if (!known.has(key)) problems.push(`${rule.id} needs unknown key ${key}`);
      for (const key of [...rule.loses, ...rule.retires]) if (!known.has(key)) problems.push(`${rule.id} loses unknown key ${key}`);
      for (const counter of [...Object.keys(rule.count), ...Object.keys(rule.consumes)]) {
        if (!counters.has(counter)) problems.push(`${rule.id} uses counter ${counter} that nothing supplies`);
      }
    }
    for (const counter of counters) {
      const counting = rules.filter((rule) => rule.count[counter]);
      const consuming = rules.filter((rule) => rule.consumes[counter]);
      if (counting.length && consuming.length) {
        problems.push(`counter ${counter} is counted by ${counting.map((rule) => rule.id).join(', ')} and consumed by ${consuming.map((rule) => rule.id).join(', ')}; a counter is one or the other`);
      }
    }
    for (const key of resources) if (!renewable.has(key)) problems.push(`resource ${key} has no renewable source`);
    for (const id of milestones) if (!byId[id]) problems.push(`milestone ${id} is not a lock`);
    for (const id of skippable) if (!milestones.includes(id)) problems.push(`skippable milestone ${id} is not a milestone`);
    return problems;
  }

  VL.solveProgression = function solveProgression(locks = VL.LOCKS, milestones = VL.MILESTONES, { resources = VL.RESOURCES, skippable = VL.SKIPPABLE_MILESTONES } = {}) {
    const byId = locks;
    const rules = Object.values(locks);
    const problems = checkReferences(rules, byId, milestones, resources, skippable);
    if (problems.length) return { ok: false, problems, stages: [], orders: [], regained: {}, missable: {} };
    const report = (text) => {
      if (!problems.includes(text)) problems.push(text);
    };

    // What reaching a rule hands the player; a one-time gift of a resource is
    // left out (the worst-case player has spent it).
    const grants = (rule) => keysOf(rule).filter((key) => rule.renewable || !resources.has(key));

    // Everything obtainable from `keys` without triggering an event. Events
    // that become available are returned as `pending`; their gives and losses
    // apply only once a stage applies them. Consumption is not deducted here
    // (the spending and budget checks below cover it).
    function closure(keys, startCounts, disabled) {
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
          for (const key of grants(rule)) have.add(key);
          for (const [counter, n] of Object.entries(rule.supplies)) counts[counter] = (counts[counter] || 0) + n;
        }
      }
      return { have, counts, pending };
    }

    function firstStage(disabled) {
      const stage = { event: null, forced: [], spent: [], demand: {}, keys: new Set(), startCounts: {}, disabled };
      return Object.assign(stage, closure(stage.keys, stage.startCounts, disabled));
    }

    // Keys the player cannot have avoided before triggering the event:
    // blocking any one of them makes the event unreachable. The worst-case
    // player who triggers the event holds exactly these.
    function forcedFor(stage, eventId) {
      return [...stage.have].filter((key) => {
        if (stage.keys.has(key)) return false;
        const blocked = new Set(stage.disabled);
        for (const rule of rules) if (keysOf(rule).includes(key)) blocked.add(rule.id);
        return !closure(stage.keys, stage.startCounts, blocked).pending.includes(eventId);
      });
    }

    function applyEvent(stage, event) {
      const forced = forcedFor(stage, event.id);
      const lost = new Set([...event.loses, ...event.retires]);
      const lostRules = rules.filter((rule) => keysOf(rule).some((key) => event.loses.includes(key)));
      // What the lost gear cost, per counter it was made from.
      const demand = {};
      for (const rule of lostRules) for (const [counter, n] of Object.entries(rule.consumes)) demand[counter] = (demand[counter] || 0) + n;
      const spent = Object.keys(demand);
      const keys = new Set([...stage.keys, ...forced]);
      for (const key of lost) keys.delete(key);
      for (const key of grants(event)) keys.add(key);
      const startCounts = { ...stage.startCounts };
      for (const rule of forced.map((id) => byId[id]).filter(Boolean)) {
        for (const [counter, n] of Object.entries(rule.supplies)) startCounts[counter] = (startCounts[counter] || 0) + n;
        for (const [counter, n] of Object.entries(rule.consumes)) startCounts[counter] = Math.max(0, (startCounts[counter] || 0) - n);
      }
      // Worst case for a counter the lost gear was made from: every source
      // found so far was collected and as much as possible went into that gear.
      for (const counter of spent) startCounts[counter] = Math.max(0, (stage.counts[counter] || 0) - demand[counter]);
      // One-time sources already reached are used up if what they gave is now
      // gone (the rest of what they gave is kept); sources of kept things are
      // left as "not yet collected", the worse case.
      const disabled = new Set(stage.disabled);
      for (const rule of rules) {
        if (!stage.have.has(rule.id) || rule.renewable) continue;
        if (!keysOf(rule).some((key) => lost.has(key)) && !Object.keys(rule.supplies).some((counter) => spent.includes(counter))) continue;
        disabled.add(rule.id);
        for (const key of grants(rule)) if (!lost.has(key)) keys.add(key);
        if (forced.includes(rule.id)) continue;
        for (const [counter, n] of Object.entries(rule.supplies)) if (!spent.includes(counter)) startCounts[counter] = (startCounts[counter] || 0) + n;
      }
      return { event: event.id, forced, spent, demand, keys, startCounts, disabled, ...closure(keys, startCounts, disabled) };
    }

    const storyOrder = (id) => (milestones.includes(id) ? milestones.indexOf(id) : milestones.length + rules.findIndex((rule) => rule.id === id));
    const byStory = (ids) => ids.slice().sort((a, b) => storyOrder(a) - storyOrder(b));

    // Every order the pending events can be triggered in, as lists of the
    // stages that follow `stage` (the story order first). A player may walk
    // into any available event, so each order must hold up on its own.
    const memo = new Map();
    function orders(stage) {
      const signature = JSON.stringify([[...stage.keys].sort(), [...stage.disabled].sort(), sortedEntries(stage.startCounts)]);
      if (memo.has(signature)) return memo.get(signature);
      const paths = stage.pending.length ? [] : [[]];
      for (const id of byStory(stage.pending)) {
        const next = applyEvent(stage, byId[id]);
        for (const rest of orders(next)) paths.push([next, ...rest]);
      }
      memo.set(signature, paths);
      return paths;
    }

    // A required lock that spends a counter must still be affordable when the
    // player has spent that counter on everything else reachable first (the
    // small-key softlock: the only key used on the door that hides the next).
    function spendingProblems(stage) {
      const found = [];
      for (const rule of rules) {
        if (rule.optional || rule.type === 'event' || !stage.have.has(rule.id)) continue;
        for (const [counter, n] of Object.entries(rule.consumes)) {
          const blocked = new Set([...stage.disabled, rule.id]);
          const { have, counts } = closure(stage.keys, stage.startCounts, blocked);
          const others = sum(rules.filter((other) => other !== rule && have.has(other.id)), (other) => other.consumes[counter]);
          const left = (counts[counter] || 0) - others;
          if (left < n) found.push(`${rule.id} needs ${n} ${counter} but a player who spent ${counter} on everything else first has ${left}`);
        }
      }
      return found;
    }

    const start = firstStage(new Set());
    const paths = orders(start).map((path) => [start, ...path]);
    const canonical = paths[0];
    const reachableIn = (stage, id) => stage.have.has(id) || stage.pending.includes(id);
    const orderOf = (path, i) => path.slice(1, i + 1).map((stage) => stage.event).join(' then ');

    for (const path of paths) {
      for (let i = 0; i < path.length; i += 1) {
        const stage = path[i];
        const prefix = i ? `after ${orderOf(path, i)}, ` : '';
        if (i) {
          for (const key of byId[stage.event].loses) if (!stage.have.has(key)) report(`${prefix}${key} cannot be regained`);
          for (const counter of stage.spent) {
            const supply = stage.counts[counter] || 0;
            if (stage.demand[counter] > supply) report(`${prefix}counter ${counter}: ${stage.demand[counter]} needed to regain what was lost but only ${supply} can be found`);
          }
        }
        for (const text of spendingProblems(stage)) report(prefix + text);
      }
    }

    const regained = {};
    for (const stage of canonical.slice(1)) regained[stage.event] = byId[stage.event].loses.filter((key) => stage.have.has(key));
    const stageOf = (id) => canonical.findIndex((stage) => reachableIn(stage, id));
    const final = canonical.at(-1);
    const missable = {};
    for (const rule of rules) {
      if (stageOf(rule.id) === -1) {
        report(`${rule.id} is unreachable`);
        continue;
      }
      if (reachableIn(final, rule.id)) continue;
      const last = canonical.findLastIndex((stage) => reachableIn(stage, rule.id));
      const cutBy = canonical[last + 1].event;
      if (rule.optional) missable[rule.id] = cutBy;
      else report(`${rule.id} is required but unreachable after ${cutBy}`);
    }
    // The other event orders must leave everything required reachable too.
    for (const path of paths.slice(1)) {
      const end = path.at(-1);
      for (const rule of rules) {
        if (!rule.optional && reachableIn(final, rule.id) && !reachableIn(end, rule.id)) report(`${rule.id} is required but unreachable after ${orderOf(path, path.length - 1)}`);
      }
    }

    const reachable = rules.filter((rule) => stageOf(rule.id) !== -1);
    const events = rules.filter((rule) => rule.type === 'event');
    for (const counter of new Set(rules.flatMap((rule) => Object.keys(rule.supplies)))) {
      const supply = sum(reachable, (rule) => rule.supplies[counter]);
      // Each loss of a thing made from the counter costs the counter again.
      const timesMade = (rule) => 1 + events.filter((event) => keysOf(rule).some((key) => event.loses.includes(key))).length;
      const demand = sum(reachable, (rule) => (rule.consumes[counter] || 0) * timesMade(rule));
      if (demand > supply) report(`counter ${counter}: demand ${demand} exceeds supply ${supply}`);
    }

    // Walks the story order of events from a start with `blocked` rules disabled.
    const reachableWithout = (blocked, id) => {
      let stage = firstStage(blocked);
      while (!reachableIn(stage, id)) {
        if (!stage.pending.length) return false;
        stage = applyEvent(stage, byId[byStory(stage.pending)[0]]);
      }
      return true;
    };
    for (let i = 1; i < milestones.length; i += 1) {
      const [earlier, later] = [milestones[i - 1], milestones[i]];
      if (stageOf(earlier) === -1 || stageOf(later) === -1) continue;
      if (stageOf(later) < stageOf(earlier)) report(`milestone ${later} is listed after ${earlier} but is reachable in an earlier stage`);
      if (!skippable.includes(earlier) && reachableWithout(new Set([earlier]), later)) {
        report(`milestone ${later} is reachable without ${earlier} (a sequence break; list ${earlier} as skippable in defineMilestones if the design allows it)`);
      }
    }

    return {
      ok: problems.length === 0,
      problems,
      stages: canonical.map((stage) => ({
        event: stage.event,
        forced: stage.forced,
        spent: stage.spent,
        keys: [...stage.keys],
        disabled: [...stage.disabled],
        reached: [...stage.have, ...stage.pending],
        pending: stage.pending,
        counts: stage.counts,
      })),
      orders: paths.map((path) => path.slice(1).map((stage) => stage.event)),
      regained,
      missable,
    };
  };
})();
