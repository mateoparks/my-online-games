// Jumping Dude Game: the 11 levels (and 5 bonus levels), as data the engine in game.js runs.
//
// Each level is a list of "things" (ground, spikes, springs, doors...). A thing
// can carry actions that fire once when their trigger happens:
//   on:  'start' | 'stand' (dude stands on it) | 'touch' |
//        { zone: [x, y, w, h], signal: 'a', signals: ['a', 'b'], after: index }
//        (every condition given must hold; `after` waits for another action
//        on the same thing to finish)
//   do:  'fall' | 'move' (dx/dy or to: [x, floorY]) | 'appear' | 'vanish' | 'reverse' |
//        'tilt' (poles only: to an angle in degrees, 0 is upright) | 'none'
//   plus delay, say, sayAfter, emit, and move options time/arc/ease/back/loop.
// Hidden solids with no 'appear' action are invisible blocks: solid, and they
// show themselves once touched.
//
// The canvas is 800 x 400 and the ground surface is at y = 340.

const LEVELS = (() => {
  const G = 340;
  const solid = (x, y, w, h, extra = {}) => ({ kind: 'solid', x, y, w, h, ...extra });
  const ground = (x, w, extra) => solid(x, G, w, 400 - G, extra);
  const platform = (x, y, w, extra) => solid(x, y, w, 16, extra);
  const spikes = (x, surface, w, extra = {}) => {
    const dir = extra.dir || 'up';
    const y = dir === 'down' ? surface : surface - 20;
    return { kind: 'spikes', x, y, w, h: 20, dir, ...extra };
  };
  const spring = (x, power, floor = G) => ({ kind: 'spring', x, y: floor - 14, w: 30, h: 14, power });
  const button = (x, signal, floor = G) => ({ kind: 'button', x, y: floor - 8, w: 30, h: 8, signal });
  const key = (x, floor, extra) => ({ kind: 'key', x, y: floor - 12, w: 22, h: 12, ...extra });
  const door = (x, floor = G, extra) => ({ kind: 'door', x, y: floor - 46, w: 30, h: 46, ...extra });
  const sign = (x, text, floor = G) => ({ kind: 'sign', x, y: floor, w: 0, h: 0, text });
  const zone = actions => ({ kind: 'zone', x: 0, y: 0, w: 0, h: 0, actions });
  // A spiky stick standing at x. It can tip over, and get back up.
  const pole = (x, len, actions) => ({ kind: 'pole', x, y: G, w: 20, len, angle: 0, actions });
  // A trigger patch from x to x + w that only counts while the dude is on the ground.
  const onGround = (x, w = 2) => ({ zone: [x, G - 30, w, 30] });
  const word = (text, actions) => ({ kind: 'solid', look: 'words', text, x: 0, y: 0, w: 0, h: 26, actions });

  // A trigger line: fires when any part of the dude crosses x.
  const at = x => ({ zone: [x, -400, 2, 1200] });
  // Same, but only while the dude is off the ground.
  const inAir = x => ({ zone: [x, -400, 2, 690] });
  const WALL_SPEED = 125;
  const crumble = (delay = 0.1) => ({ on: 'stand', do: 'fall', delay });
  const dropBlock = (x, triggerX) => solid(x, 56, 40, 40, {
    look: 'block',
    actions: [{ on: { zone: [triggerX, -400, 40, 1200] }, do: 'fall', vy: 600, g: 4000 }]
  });
  // A platform that slides dx and back, forever.
  const ride = (on, dx, time, extra) => ({ on, do: 'move', dx, time, back: { after: 0.35, time }, loop: 0.35, ...extra });
  const slam = (on, extra = {}) => ({ on, do: 'move', dy: 120, time: 0.1, ease: 'in', back: { after: 0.45, time: 0.55 }, ...extra });

  return [
    {
      name: 'Trust Me',
      hint: 'Get to the door. Easy.',
      cleared: 'Only 10 more to go.',
      spawn: 70,
      things: [
        sign(130, 'trust me'),
        ground(0, 200),
        solid(200, G, 40, 60, { actions: [crumble()] }),
        ground(240, 290),
        // Once the door has fled, this bit of floor drops away under the dude on the walk back.
        solid(530, G, 60, 60, { actions: [{ on: { zone: [530, G - 10, 60, 10], signal: 'door-fled' }, do: 'fall', say: 'Mind the gap.' }] }),
        ground(590, 210),
        spikes(380, G, 60, { hidden: true, actions: [{ on: { zone: [376, 0, 64, 400] }, do: 'appear' }] }),
        dropBlock(600, 568),
        door(740, G, {
          actions: [{
            on: at(690), do: 'move', to: [22, G], arc: 150, time: 0.8, emit: 'door-fled',
            say: 'Ha. No.', sayAfter: 'The door is back at the start now. Have a nice walk.'
          }]
        })
      ]
    },
    {
      name: 'Now You See It',
      hint: 'Just a little hop.',
      cleared: 'You saw it. Eventually.',
      spawn: 70,
      things: [
        sign(250, 'jump here'),
        ground(0, 300),
        solid(300, 236, 60, 18, { hidden: true }),
        ground(380, 420),
        spikes(520, G, 40),
        spikes(560, G, 40, { hidden: true, actions: [{ on: { zone: [560, 290, 50, 50] }, do: 'appear' }] }),
        door(740, G, { actions: [{ on: at(690), do: 'move', to: [766, G], time: 0.25, say: 'The door is a little nervous.' }] })
      ]
    },
    {
      name: 'Bridge Out',
      hint: 'The bridge is perfectly safe.',
      cleared: 'The bridge has been reported.',
      spawn: 60,
      things: [
        sign(110, 'bridge: fine'),
        ground(0, 180),
        platform(220, 300, 80, { actions: [crumble(0.3)] }),
        platform(320, 282, 40, { fake: true }),
        platform(390, 300, 60, { actions: [crumble(0.3)] }),
        ground(560, 240),
        door(740)
      ]
    },
    {
      name: 'Boing',
      hint: 'The door is up on the ledge. Use a spring.',
      cleared: 'Boing.',
      spawn: 60,
      things: [
        ground(0, 800),
        sign(180, 'this one \u2193'),
        spring(260, -1080),
        spikes(180, 0, 180, { dir: 'down', hidden: true, actions: [{ on: { zone: [180, 0, 180, 170] }, do: 'appear' }] }),
        spring(440, -900),
        solid(540, 150, 260, 20),
        spikes(640, 150, 40, { hidden: true, actions: [{ on: { zone: [622, 0, 18, 150] }, do: 'appear' }] }),
        door(740, 150)
      ]
    },
    {
      name: 'Press Your Luck',
      hint: 'Two buttons open the gate.',
      cleared: 'Click. Click. Done.',
      spawn: 60,
      things: [
        ground(0, 800),
        button(150, 'a'),
        solid(190, 90, 40, 40, {
          look: 'block',
          actions: [{ on: { signal: 'a' }, do: 'fall', delay: 0.08, vy: 600, g: 4000 }]
        }),
        spikes(330, G, 120),
        platform(360, 250, 60, { press: 'b', actions: [crumble(0.45)] }),
        solid(600, 0, 24, 340, {
          look: 'gate',
          actions: [{ on: { signals: ['a', 'b'] }, do: 'move', dy: -300, time: 0.9, say: 'The gate is open. Suspiciously.' }]
        }),
        door(720)
      ]
    },
    {
      name: 'Keep Away',
      hint: 'The door is locked. Grab the key.',
      cleared: 'The key has filed a complaint.',
      spawn: 60,
      things: [
        ground(0, 800),
        platform(240, 270, 60),
        platform(90, 200, 80),
        spikes(0, G, 330, {
          hidden: true,
          actions: [{ on: { signal: 'key' }, do: 'appear', say: 'The floor is spikes now. House rules.' }]
        }),
        spikes(620, G, 40, { hidden: true, actions: [{ on: { zone: [600, 280, 20, 60] }, do: 'appear' }] }),
        key(420, 302, { actions: [{ on: at(370), do: 'move', to: [119, 200], arc: 120, time: 0.9, say: 'The key would rather not.' }] }),
        door(740, G, { locked: true })
      ]
    },
    {
      name: 'Backwards Day',
      hint: 'Nothing weird here.',
      cleared: 'Thgir taht did uoy.',
      spawn: 60,
      things: [
        ground(0, 330),
        ground(400, 60),
        solid(460, G, 40, 60, { actions: [crumble(0.08)] }),
        ground(500, 20),
        ground(590, 210),
        zone([{ on: at(220), do: 'reverse', say: 'Uh oh. Left is right now.' }]),
        zone([{ on: at(660), do: 'reverse', value: false, say: 'Fixed it! You’re welcome.' }]),
        door(740)
      ]
    },
    {
      name: 'Rush Hour',
      hint: 'Mind the ceiling.',
      cleared: 'Flat? Not this time.',
      spawn: 60,
      things: [
        ground(0, 800),
        solid(240, 0, 380, 200),
        solid(300, 200, 50, 20, { look: 'crusher', actions: [slam(at(270), { delay: 0.15 })] }),
        solid(420, 200, 50, 20, { look: 'crusher', actions: [slam('start', { time: 0.12, back: { after: 0.35, time: 0.5 }, loop: 0.8 })] }),
        solid(540, 200, 50, 20, {
          look: 'crusher',
          actions: [
            slam(at(510), { delay: 0.1 }),
            slam({ zone: [540, 0, 50, 400], after: 0 }, { delay: 0.08 })
          ]
        }),
        door(720)
      ]
    },
    {
      name: 'Fake Out',
      hint: '',
      cleared: 'There were stairs. You made them.',
      spawn: 60,
      wordsHint: true,
      things: [
        ground(0, 800),
        solid(560, 110, 120, 16),
        door(620, 110),
        door(740, G, { fake: true }),
        word('Trust', [{ on: { zone: [560, 0, 120, 400] }, do: 'move', to: [170, 326], time: 0.55, arc: 30, say: 'Fine. Have some stairs.' }]),
        word('me,', [{ on: { zone: [560, 0, 120, 400] }, do: 'move', to: [262, 288], time: 0.55, arc: 30, delay: 0.1 }]),
        word('there', [{ on: { zone: [560, 0, 120, 400] }, do: 'move', to: [326, 250], time: 0.55, arc: 30, delay: 0.2 }]),
        word('are', [{ on: { zone: [560, 0, 120, 400] }, do: 'move', to: [414, 212], time: 0.55, arc: 30, delay: 0.3 }]),
        word('no', [{ on: { zone: [560, 0, 120, 400] }, do: 'move', to: [478, 176], time: 0.55, arc: 30, delay: 0.4 }]),
        word('stairs.', [{ on: { zone: [560, 0, 120, 400] }, do: 'move', to: [596, G], time: 0.4, ease: 'in', delay: 0.75 }])
      ]
    },
    {
      name: 'Encore',
      hint: 'You know how this goes. Right?',
      cleared: 'Take a bow.',
      spawn: 60,
      things: [
        ground(0, 250),
        solid(310, G, 40, 60, { actions: [crumble(0.06)] }),
        ground(350, 450),
        spring(520, -950),
        platform(300, 150, 120),
        dropBlock(640, 608),
        door(740, G, {
          actions: [
            { on: at(690), do: 'move', to: [340, 150], arc: 120, time: 0.8, say: 'Encore!' },
            { on: { zone: [300, 60, 120, 92], after: 0 }, do: 'move', to: [22, G], arc: 150, time: 0.9, say: 'One more time, with feeling.' }
          ]
        })
      ]
    },
    {
      name: 'The Last Door',
      hint: 'Last level. The door is right there.',
      cleared: 'You beat the Jumping Dude Game.',
      spawn: 60,
      things: [
        ground(0, 800),
        door(150, G, {
          locked: true,
          actions: [{ on: at(120), do: 'move', to: [720, 100], arc: 180, time: 1, say: 'Did you really think the last one would be easy?' }]
        }),
        solid(170, 260, 40, 16, { hidden: true, twinkle: true }),
        platform(40, 180, 80),
        key(70, 180),
        zone([{ on: { signal: 'key' }, do: 'reverse', say: 'Got the key! Also, your controls are mine now.' }]),
        button(300, 'a'),
        spikes(340, G, 60, { hidden: true, actions: [{ on: { signal: 'a' }, do: 'appear' }] }),
        solid(480, 0, 24, 340, { look: 'gate', actions: [{ on: { signal: 'a' }, do: 'move', dy: -300, time: 0.9 }] }),
        spring(560, -1050),
        solid(640, 100, 160, 16)
      ]
    },

    // ---- Bonus levels. Level 11 says it's the end. It isn't.
    {
      name: 'Just Kidding',
      bonus: true,
      hint: 'Bonus level! Okay, THIS is the last one.',
      cleared: 'Okay, that was the last one. Probably.',
      spawn: 40,
      things: [
        ground(0, 120),
        ground(120, 560),
        spikes(120, G, 560),
        platform(130, 290, 60, { actions: [ride('start', 180, 1.4)] }),
        platform(410, 250, 40, { actions: [crumble(0.35)] }),
        // Same rhythm as the first platform, a beat later, so the hop lines up.
        platform(620, 215, 60, { actions: [ride('start', -120, 1.4, { delay: 1.1, quiet: true })] }),
        solid(680, G, 40, 60, { actions: [crumble(0.04)] }),
        ground(720, 80),
        door(752)
      ]
    },
    {
      name: 'Run',
      bonus: true,
      hint: 'Take your time.',
      cleared: 'It was a very slow wall, to be fair.',
      spawn: 60,
      things: [
        ground(0, 200),
        ground(270, 530),
        spikes(-36, 60, 30, {
          dir: 'right', y: 60, h: 280, quip: 'The wall says hi.',
          actions: [{ on: at(120), do: 'move', dx: 900, time: 900 / WALL_SPEED, ease: 'linear', say: 'Actually? Run.' }]
        }),
        solid(330, 0, 120, 200),
        solid(360, 200, 50, 20, { look: 'crusher', actions: [slam(at(332), { delay: 0.12 })] }),
        spikes(520, G, 40),
        dropBlock(660, 628),
        door(750)
      ]
    },
    {
      name: 'Flip Flop',
      bonus: true,
      hint: 'Left is left. For now.',
      cleared: 'Your fingers may now uncross.',
      spawn: 60,
      things: [
        ground(0, 190),
        ground(250, 140),
        ground(450, 120),
        ground(630, 170),
        zone([{ on: inAir(198), do: 'reverse', say: 'Flip!' }]),
        zone([{ on: inAir(398), do: 'reverse', value: false, say: 'Flop!' }]),
        zone([{ on: inAir(578), do: 'none', say: 'Flip!' }]),
        zone([{ on: inAir(598), do: 'none', say: 'Just kidding.' }]),
        zone([{ on: at(700), do: 'reverse', say: 'NOW flip.' }]),
        door(752)
      ]
    },
    {
      name: 'The Actual Last Door',
      bonus: true,
      hint: 'Seriously. Last one.',
      cleared: 'You actually beat the Jumping Dude Game. We checked. Mostly.',
      spawn: 40,
      things: [
        ground(0, 300),
        solid(300, G, 50, 60, { fake: true }),
        ground(350, 450),
        dropBlock(560, 528),
        spikes(0, G, 720, {
          hidden: true,
          actions: [{ on: { signal: 'key' }, do: 'appear', say: 'The floor is spikes again. You knew that.' }]
        }),
        key(762, G),
        platform(630, 270, 50),
        platform(480, 210, 60, { actions: [ride({ signal: 'key' }, -190, 1.5)] }),
        spikes(330, 120, 100, { dir: 'down' }),
        platform(190, 160, 50, { actions: [crumble(0.5)] }),
        solid(0, 110, 130, 16),
        door(40, 110, { locked: true })
      ]
    },
    {
      name: 'Double Trouble',
      bonus: true,
      hint: 'Every trap here only works once. Promise.',
      cleared: 'Okay. NOW you have beaten the Jumping Dude Game.',
      spawn: 40,
      things: [
        ground(0, 800),
        // Spikes that jump to meet you, then chase you when you land.
        spikes(130, G, 40, {
          actions: [
            { on: { zone: [118, 0, 56, 300] }, do: 'move', dy: -40, time: 0.1, back: { after: 0.35, time: 0.3 } },
            { on: onGround(210, 60), do: 'move', to: [220, G], time: 0.2, delay: 0.12, say: 'Once was a lie.' }
          ]
        }),
        // A pole that falls toward you, gets back up when you jump it, then falls the other way.
        pole(420, 70, [
          { on: at(340), do: 'tilt', to: -90, time: 0.4, ease: 'in', delay: 0.3, say: 'Timber!' },
          { on: { zone: [326, 0, 94, 300], after: 0 }, do: 'tilt', to: 0, time: 0.35, say: 'Nope, back up.' },
          { on: { ...onGround(440, 80), after: 1 }, do: 'tilt', to: 90, time: 0.4, ease: 'in', delay: 0.2, say: 'Timber, the sequel!' }
        ]),
        // A block that drops when you get close, then gives you a lift you didn't want.
        spikes(635, 20, 50, { dir: 'down' }),
        solid(640, 90, 40, 40, {
          look: 'block',
          actions: [
            { on: { zone: [608, -400, 40, 1200] }, do: 'fall', vy: 600, g: 4000 },
            { on: 'stand', after: 0, do: 'move', dy: -240, time: 0.9, delay: 0.15, say: 'Going up!' }
          ]
        }),
        door(750)
      ]
    }
  ];
})();
