// The boss life meter (W43, Matthew: "some kind of life meter for them"):
// the four dungeon bosses only, not the marionettes. It shows while a boss
// is fought, drains with every hit that counts, and is gone once it is
// beaten. It sits in the boss room's bottom wall row, left of the boss gate,
// where no boss, hero or exit is ever drawn (tests/w43-bosses.test.js).
(() => {
  const T = VL.TUNING;

  // Three rounds of `life` each: the life still to take in all of them.
  const inRounds = (roundLife, rounds) => (boss) => [
    Math.max(0, (boss.rounds - 1) * T[roundLife] + Math.max(0, boss.life)),
    T[roundLife] * T[rounds],
  ];
  VL.BOSS_METERS = {
    bookworm: { name: 'BOOKWORM', life: (worm) => [Math.max(0, T.bookwormHits - (worm.hits || 0)), T.bookwormHits] },
    thornback: { name: 'THORNBACK', life: inRounds('thornbackRoundLife', 'thornbackPlates') },
    lensCrab: { name: 'LENS CRAB', life: inRounds('lensCrabRoundLife', 'lensCrabRounds') },
    dragon: { name: 'DRAGON', life: inRounds('dragonRoundLife', 'dragonRounds') },
  };

  // In play-area pixels: the bottom wall row (y 160-175), clear of the boss
  // gate on the door tile (x 112) and of everything a boss draws (its
  // lowest shadow ends at y 164).
  VL.BOSS_METER = { x: 16, y: 165, w: 92, h: 9 };

  // { name, left, total } while a dungeon boss is being fought here, else null.
  VL.bossMeter = function bossMeter(state) {
    const room = state.room;
    const dungeon = room && VL.dungeonOf(state);
    if (!dungeon?.boss || room.screen !== dungeon.boss.screen || VL.bossBeaten(state, dungeon.id)) return null;
    const boss = room.bossRef;
    const meter = boss && VL.BOSS_METERS[boss.type];
    if (!meter || !room.entities.includes(boss)) return null;
    const [left, total] = meter.life(boss);
    return { name: meter.name, left, total };
  };

  // How much of the bar is still lit, per boss: the lost part drains away
  // over `DRAIN` seconds after a short `HOLD`, so a hit reads as a chunk
  // coming off. Steady: nothing on it blinks (the flash guard).
  const HOLD = 0.25;
  const DRAIN = 0.5;
  const shown = new WeakMap();
  const drained = (s, t) => s.to + (s.from - s.to) * (1 - VL.clamp((t - s.since - HOLD) / DRAIN, 0, 1));
  function lit(boss, left, t) {
    let s = shown.get(boss);
    // A first look, a refill (a new fight) or a clock that went back: no drain.
    if (!s || left > s.to || t < s.since) s = { from: left, to: left, since: t };
    else if (left < s.to) s = { from: drained(s, t), to: left, since: t };
    shown.set(boss, s);
    return drained(s, t);
  }

  VL.defineHeroLayer('bossMeter', (ctx, state, x, y, t, pass) => {
    // The overlay pass: over the light, never hidden by the hurt flash.
    if (pass !== 'overlay' || state.transition || VL.currentPopup(state)) return;
    const meter = VL.bossMeter(state);
    if (!meter) return;
    const box = VL.BOSS_METER;
    VL.ART.rect(ctx, 'outline', box.x, box.y, box.w, box.h);
    VL.ART.rect(ctx, 'hud', box.x + 1, box.y + 1, box.w - 2, box.h - 2);
    VL.ART.text(ctx, meter.name, box.x + 3, box.y + 2, { size: 'small', color: 'goldLight' });
    const barX = box.x + 3 + VL.ART.measureText(meter.name, 'small') + 3;
    const barW = box.x + box.w - 3 - barX;
    const barY = box.y + 2;
    const barH = box.h - 4;
    VL.ART.rect(ctx, 'heartEmpty', barX, barY, barW, barH);
    const now = Math.round((barW * meter.left) / meter.total);
    const was = Math.max(now, Math.round((barW * lit(state.room.bossRef, meter.left, t)) / meter.total));
    if (was > now) VL.ART.rect(ctx, 'heartLight', barX + now, barY, was - now, barH);
    if (now > 0) {
      VL.ART.rect(ctx, 'heart', barX, barY, now, barH);
      VL.ART.rect(ctx, 'heartLight', barX, barY, now, 1);
    }
  });
})();
