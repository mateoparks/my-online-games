// Jumping Dude Game levels, as data the engine in game.js runs.
//
// Each level is a list of "things" (ground, spikes, springs, doors...). A thing
// can carry actions that fire once when their trigger happens:
//   on:  'start' | 'stand' (dude stands on it) | 'leave' | 'touch' |
//        { zone: [x, y, w, h], signal: 'a', unlessSignal: 'b', signals: ['a', 'b'], anySignals: ['a', 'b'], lowPlatforms: ['a', 'b'], after: index }
//        (every condition given must hold; `after` waits for another action
//        on the same thing to finish)
//   do:  'fall' | 'move' (dx/dy or to: [x, floorY]) | 'appear' | 'vanish' | 'reverse' |
//        'tilt' (poles only: to an angle in degrees, 0 is upright) | 'none'
//   plus delay, say, sayAfter, emit, and move options time/arc/semicircle/ease/back/loop.
//   A move's back.signal waits for a signal and can reverse the outgoing move early.
// Hidden solids with no 'appear' action are invisible blocks: solid, and they
// show themselves once touched.
// Solids can also have sticky (seconds), jumpDelay (seconds), sink {depth, speed, riseSpeed, id, tolerance},
// mimic {min, max, factor}, blink {on, off, phase}, or oneWay properties.
// Fans push horizontally within the height of their visible blades until blocked by a solid;
// fake keys and checkpoints emit signals.
// A solid's belt has speed and sides {top, right, bottom, left}; each side's
// direction is 1 (right/down) or -1 (left/up).
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
      name: 'Trust Me',
      hint: 'Get to the door. Easy.',
      cleared: 'The door has trust issues.',
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
      name: 'Out of Reach',
      hint: 'The door is right there.',
      cleared: 'You found the key to success. And a door.',
      spawn: 60,
      things: [
        ground(0, 800),
        door(150, G, {
          locked: true,
          actions: [{ on: at(120), do: 'move', to: [720, 100], arc: 180, time: 1, say: 'Did you really think it would be that easy?' }]
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

    {
      name: 'Moving On',
      hint: 'Mind the moving platforms.',
      cleared: 'You really went places.',
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
      name: 'The Long Way Back',
      hint: 'The key is over there. The door is not.',
      cleared: 'Turns out you can go home again.',
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
      hint: 'Every trap here only works once. Promise.',
      cleared: 'Double the trouble, double the victory.',
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
    },
    {
      name: 'Second Guess',
      hint: 'Watch where you land.',
      cleared: 'Your landing privileges have been restored.',
      spawn: 50,
      things: [
        ground(0, 500),
        ground(570, 230),
        spikes(180, G, 40),
        spikes(220, G, 40, {
          hidden: true,
          actions: [{ on: { zone: [175, 0, 60, 300] }, do: 'appear', say: 'Surprise landing!' }]
        }),
        dropBlock(400, 365),
        spikes(630, G, 60),
        door(750)
      ]
    },
    {
      name: 'Keys to Chaos',
      hint: 'A key, two buttons. What could go wrong?',
      cleared: 'That gate was very impressed.',
      spawn: 60,
      things: [
        ground(0, 800),
        platform(85, 200, 80),
        platform(225, 270, 60),
        key(105, 200),
        zone([{ on: { signal: 'key' }, do: 'reverse', say: 'Key acquired. Controls confiscated.' }]),
        button(150, 'a'),
        spikes(330, G, 120),
        platform(365, 250, 50, { press: 'b', actions: [crumble(0.35)] }),
        zone([{ on: { signals: ['a', 'b'] }, do: 'none', emit: 'gate-close', say: 'Both buttons? Gate closed.' }]),
        solid(570, 0, 24, 340, {
          look: 'gate',
          actions: [{ on: { anySignals: ['a', 'b'] }, do: 'move', dy: -300, time: 0.9, back: { signal: 'gate-close', time: 0.9 }, say: 'The gate is open. You are welcome.' }]
        }),
        dropBlock(670, 638),
        door(750, G, { locked: true })
      ]
    },
    {
      name: 'No Standing',
      hint: 'The platforms prefer short visits.',
      cleared: 'Please rate your platforms before they leave.',
      spawn: 45,
      things: [
        ground(0, 150),
        ground(150, 520),
        spikes(150, G, 520),
        platform(175, 290, 50, { actions: [crumble(0.35)] }),
        platform(290, 250, 50, { actions: [crumble(0.3)] }),
        platform(410, 220, 50, { actions: [crumble(0.3)] }),
        platform(535, 260, 55, { actions: [ride('start', 70, 1.1)] }),
        ground(670, 130),
        door(752)
      ]
    },
    {
      name: 'Rush and Crush',
      hint: 'Please remain calm under pressure.',
      cleared: 'Only slightly flattened.',
      spawn: 50,
      things: [
        ground(0, 800),
        solid(200, 0, 430, 200),
        solid(260, 200, 50, 20, { look: 'crusher', actions: [slam(at(230), { delay: 0.12 })] }),
        solid(390, 200, 50, 20, { look: 'crusher', actions: [slam('start', { time: 0.12, back: { after: 0.35, time: 0.5 }, loop: 0.6 })] }),
        solid(520, 200, 50, 20, {
          look: 'crusher',
          actions: [slam(at(490), { delay: 0.1 }), slam({ zone: [520, 0, 50, 400], after: 0 }, { delay: 0.08 })]
        }),
        spikes(600, G, 40, {
          hidden: true,
          actions: [{ on: at(575), do: 'appear', say: 'A little something for the exit.' }]
        }),
        spikes(650, G, 50),
        door(750)
      ]
    },
    {
      name: 'No Time to Think',
      hint: 'Keep moving. Preferably in the right direction.',
      cleared: 'You outran the wall. It took that personally.',
      spawn: 50,
      things: [
        ground(0, 200),
        ground(270, 530),
        spikes(-36, 60, 30, {
          dir: 'right', y: 60, h: 280, quip: 'The wall caught up.',
          actions: [{ on: at(110), do: 'move', dx: 900, time: 900 / 135, ease: 'linear', say: 'Go. Now.' }]
        }),
        spikes(345, G, 45),
        dropBlock(490, 458),
        spikes(570, G, 50),
        zone([{ on: inAir(580), do: 'reverse', say: 'Wrong way!' }]),
        door(750)
      ]
    },
    {
      name: 'Low Expectations',
      hint: 'A little jump goes a long way. Tap, do not hold.',
      cleared: 'You kept a low profile.',
      spawn: 50,
      things: [
        ground(0, 800),
        spikes(190, G, 50),
        spikes(400, G, 50),
        spikes(140, 225, 350, { dir: 'down' }),
        door(750)
      ]
    },
    {
      name: 'Round Trip',
      hint: 'Two blocks, one very suspicious return journey.',
      cleared: 'You caught the return trip.',
      spawn: 60,
      spawnY: 160,
      things: [
        solid(0, 160, 160, 240),
        solid(230, 160, 40, 40, {
          look: 'block',
          actions: [
            { on: { signal: 'second-block' }, do: 'move', to: [530, 200], time: 1.5, semicircle: true, back: { signal: 'left-second', time: 1.2 }, say: 'Going around.' }
          ]
        }),
        solid(380, 160, 40, 40, {
          look: 'block',
          press: 'second-block',
          actions: [{ on: 'leave', do: 'none', emit: 'left-second' }]
        }),
        solid(620, 250, 180, 150),
        spikes(650, 250, 24, {
          hidden: true,
          actions: [{ on: { zone: [590, 130, 80, 120] }, do: 'appear' }]
        }),
        door(740, 250)
      ]
    },
    {
      name: 'Late and Fragile',
      hint: 'Watch your step. And the ceiling.',
      cleared: 'Your timing has been noted.',
      spawn: 50,
      things: [
        ground(0, 140),
        ground(140, 50, { jumpDelay: 0.25 }),
        ground(190, 610),
        spikes(280, G, 40),
        spikes(430, G, 40, { hidden: true, actions: [{ on: at(400), do: 'appear' }] }),
        solid(480, 65, 40, 40, {
          look: 'block',
          actions: [{ on: { zone: [390, 0, 155, 245] }, do: 'fall', vy: 600, g: 4000, say: 'That ceiling was load-bearing.' }]
        }),
        spikes(570, G, 40),
        door(750)
      ]
    },
    {
      name: 'Stay a While',
      hint: 'Some platforms take their time.',
      cleared: 'Thanks for sticking around.',
      spawn: 50,
      things: [
        ground(0, 150),
        ground(150, 500),
        spikes(150, G, 500),
        platform(180, 290, 60, { sticky: 0.65 }),
        platform(310, 260, 55, { sink: { depth: 55, speed: 65 } }),
        platform(440, 250, 55, { actions: [crumble(0.35)] }),
        platform(555, 270, 55),
        ground(650, 150),
        door(750)
      ]
    },
    {
      name: 'Copy and Gust',
      hint: 'Your movements are being watched.',
      cleared: 'The wind would like a rematch.',
      spawn: 50,
      things: [
        ground(0, 160),
        ground(160, 490),
        spikes(160, G, 490),
        platform(200, 290, 80, { mimic: { min: 200, max: 260, factor: 0.25 } }),
        platform(400, 250, 55),
        platform(535, 270, 55),
        { kind: 'fan', x: 0, y: G, speed: 110, period: 2, active: 1.4 },
        ground(650, 150),
        spikes(700, G, 24, { hidden: true, actions: [{ on: at(660), do: 'appear' }] }),
        door(750)
      ]
    },
    {
      name: 'Fine Print',
      hint: 'The checkpoint looks official.',
      cleared: 'Read the terms and conditions.',
      spawn: 50,
      things: [
        ground(0, 190),
        ground(190, 420, { actions: [{ on: { ...at(190), unlessSignal: 'checkpoint' }, do: 'fall' }] }),
        ground(610, 190),
        { kind: 'checkpoint', x: 130, y: 290, w: 25, h: 50, signal: 'checkpoint' },
        spikes(190, G, 420, {
          hidden: true,
          actions: [{ on: { signal: 'checkpoint' }, do: 'appear', say: 'Checkpoint denied. Floor revoked.' }]
        }),
        spikes(610, G, 190, {
          hidden: true,
          actions: [{ on: { ...at(190), unlessSignal: 'checkpoint' }, do: 'appear', say: 'Skipping the fine print has consequences.' }]
        }),
        platform(165, 280, 80, { oneWay: true }),
        platform(290, 250, 60, { oneWay: true, blink: { on: 1.7, off: 1 } }),
        platform(415, 230, 60, { oneWay: true, blink: { on: 1.7, off: 1, phase: 1.2 } }),
        platform(540, 270, 70, { oneWay: true }),
        dropBlock(700, 668),
        door(750)
      ]
    },
    {
      name: 'Key Exchange',
      hint: 'One of these keys is very convincing.',
      cleared: 'Accept no substitutes.',
      spawn: 50,
      things: [
        ground(0, 800),
        spikes(200, G, 40),
        platform(235, 270, 75),
        platform(160, 200, 75),
        platform(35, 130, 75),
        spikes(215, 200, 20, {
          hidden: true,
          actions: [{ on: { zone: [215, 80, 40, 130] }, do: 'appear' }]
        }),
        spikes(35, 130, 14, {
          hidden: true,
          actions: [{ on: { zone: [35, 20, 105, 125] }, do: 'appear' }]
        }),
        key(55, 130, { fake: true }),
        key(335, G, { hidden: true, actions: [{ on: { signal: 'fake-key' }, do: 'appear' }] }),
        spikes(440, G, 40),
        dropBlock(590, 558),
        door(750, G, { locked: true })
      ]
    },
    {
      name: 'Belt It Out',
      hint: 'Follow the arrows. Or fight them.',
      cleared: 'You made the moving walkway work for you.',
      spawn: 50,
      things: [
        ground(0, 160),
        ground(160, 180, { belt: { speed: 170, sides: { top: 1 } } }),
        ground(340, 460),
        spikes(350, G, 50),
        spikes(430, G, 40),
        solid(490, 240, 100, 30, {
          belt: { speed: 110, sides: { top: 1, right: 1, bottom: -1, left: -1 } }
        }),
        spikes(650, G, 40, { hidden: true, actions: [{ on: at(620), do: 'appear' }] }),
        door(750)
      ]
    },
    {
      name: 'Under Pressure',
      hint: 'Down is the new up. Tap to jump.',
      cleared: 'Low enough for you?',
      spawn: 50,
      spawnY: 120,
      things: [
        solid(0, 120, 150, 280),
        platform(195, 120, 120, { sink: { depth: 220, speed: 85 } }),
        ground(345, 455),
        spikes(315, 250, 160, { dir: 'down' }),
        spikes(520, G, 40),
        door(750)
      ]
    },
    {
      name: 'Balancing Act',
      hint: 'The first platform opens the gate. Getting there is another matter.',
      cleared: 'A balanced performance.',
      spawn: 40,
      spawnY: 120,
      things: [
        solid(0, 120, 135, 280),
        platform(145, 120, 70, { sink: { id: 'left', depth: 210, speed: 120, riseSpeed: 8, tolerance: 0 } }),
        platform(255, 120, 70, { sink: { id: 'right', depth: 210, speed: 120, riseSpeed: 8, tolerance: 15 } }),
        ground(395, 405),
        solid(565, 0, 24, 340, {
          look: 'gate',
          actions: [{ on: { lowPlatforms: ['left'] }, do: 'move', dy: -300, time: 0.9, say: 'Gate open. Good luck reaching it.' }]
        }),
        spikes(470, G, 40),
        door(750)
      ]
    },
    {
      name: 'Blown Away',
      hint: 'That gap looks a little ambitious.',
      cleared: 'Precision, with a little help from the air.',
      spawn: 50,
      things: [
        ground(0, 150),
        { kind: 'fan', x: 0, y: 240, speed: 240 },
        spikes(260, G, 80),
        solid(340, G, 26, 60),
        spikes(366, G, 70),
        ground(460, 110),
        solid(570, G, 60, 60, { actions: [{ on: inAir(540), do: 'fall', say: 'The landing is mostly optional.' }] }),
        ground(630, 30),
        solid(660, G, 60, 60, { actions: [{ on: inAir(540), do: 'fall' }] }),
        ground(720, 80),
        door(750)
      ]
    },
    {
      name: 'Up and Down',
      hint: 'The key is right up there. Easy.',
      cleared: 'What goes up must come down. And then jump again.',
      spawn: 150,
      things: [
        ground(0, 800),
        solid(120, 0, 16, 300),
        solid(220, 60, 16, 240),
        solid(272, 60, 16, 240),
        platform(136, 270, 84, {
          oneWay: true,
          actions: [{ on: { zone: [136, 260, 84, 10] }, do: 'none', emit: 'first-platform' }]
        }),
        platform(136, 200, 84, {
          oneWay: true,
          actions: [{ on: { zone: [136, 170, 84, 10] }, do: 'none', emit: 'second-platform' }]
        }),
        platform(136, 130, 84, {
          oneWay: true,
          actions: [{ on: { zone: [136, 100, 84, 10] }, do: 'none', emit: 'third-platform' }]
        }),
        platform(136, 60, 84, {
          oneWay: true,
          actions: [{ on: { zone: [136, 50, 84, 10] }, do: 'none', emit: 'top-platform' }]
        }),
        spikes(136, 270, 42, {
          hidden: true, actions: [{ on: { signal: 'first-platform' }, do: 'appear' }]
        }),
        spikes(178, 200, 42, {
          hidden: true, actions: [{ on: { signal: 'second-platform' }, do: 'appear' }]
        }),
        spikes(136, 130, 42, {
          hidden: true, actions: [{ on: { signal: 'third-platform' }, do: 'appear' }]
        }),
        spikes(136, 0, 84, {
          dir: 'down', hidden: true, actions: [{ on: { signal: 'top-platform' }, do: 'appear' }]
        }),
        key(160, 60, {
          actions: [{ on: { signal: 'first-platform' }, do: 'vanish' }]
        }),
        key(290, 172, {
          hidden: true, actions: [
            { on: { signal: 'first-platform' }, do: 'appear' },
            { on: { signal: 'top-platform' }, do: 'move', to: [290, 302], time: 0.4 }
          ]
        }),
        spikes(236, 190, 15, {
          hidden: true, actions: [{ on: { zone: [236, 70, 36, 90], signal: 'top-platform' }, do: 'appear' }]
        }),
        spikes(257, 280, 15, {
          hidden: true, actions: [
            { on: { zone: [236, 160, 36, 65], signal: 'top-platform' }, do: 'appear' },
            { on: { signal: 'key' }, do: 'vanish' }
          ]
        }),
        spikes(288, 240, 36, {
          dir: 'down', hidden: true,
          actions: [{ on: { zone: [288, 306, 50, 34], signal: 'top-platform' }, do: 'appear' }]
        }),
        door(750, G, { locked: true })
      ]
    }
  ];
})();
