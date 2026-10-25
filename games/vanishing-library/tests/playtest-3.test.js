// W30, Matthew's third playtest notes: a word when a wood sword does nothing
// to a tough enemy, the Hollow Oak's grass room and metal-only enemies, the
// boss gate in every dungeon, and the library's rewards at 10, 20 and 30 books.
const assert = require('node:assert/strict');
const { test, loadGame, playState, hold } = require('./harness');

const ow = (screen, tx, ty, facing = 'up') => ({ area: 'overworld', screen, tx, ty, facing });

// ---------- note 1: the wood sword's word ----------

function clearing(sword) {
  const { VL } = loadGame();
  const state = playState(VL, ow('7,-2', 4, 6, 'down'));
  VL.giveItem(state, sword);
  state.popups.queue.length = 0;
  hold(VL, state, [], 1);
  const plant = state.room.entities.find((e) => e.type === 'spitter' && e.x === 4 && e.y === 7);
  return { VL, state, plant };
}

const swing = (VL, state) => {
  VL.updateWorld(state, VL.actions({ pressed: ['mainHand'] }), 1 / 60);
  hold(VL, state, [], 0.5);
};

test('a wood sword on a tough spitter says it does nothing, and hints at something stronger', () => {
  const { VL, state, plant } = clearing('woodSword');
  assert.equal(state.message, null);
  swing(VL, state);
  assert.ok(state.room.entities.includes(plant), 'still there');
  const shown = VL.currentPopup(state);
  assert.ok(shown, 'a message pops up');
  assert.equal(shown.text, 'Hmm, this wood sword seems to do nothing to them. Perhaps you need something a bit stronger.');
  assert.equal(VL.ART.popupLayout({ title: shown.title, text: shown.text }).overflow, false, 'it fits the popup');
  assert.deepEqual([...VL.ART.missingGlyphs(`${shown.title}${shown.text}`, 'normal')], []);
});

test('the word comes once per visit, not on every clink', () => {
  const { VL, state } = clearing('woodSword');
  swing(VL, state);
  assert.ok(state.message);
  state.message = null;
  for (let i = 0; i < 4; i += 1) swing(VL, state);
  assert.equal(state.message, null, 'no second message this visit');
  VL.place(state, ow('7,-2', 4, 6, 'down'));
  state.popups.queue.length = 0;
  hold(VL, state, [], 1);
  swing(VL, state);
  assert.ok(state.message, 'a new visit says it again');
});

test('a metal sword, a thrown rock or an ordinary enemy never brings the word', () => {
  {
    const { VL, state } = clearing('metalSword');
    swing(VL, state);
    assert.equal(state.message, null, 'the metal sword works, nothing to say');
  }
  {
    const { VL, state, plant } = clearing('woodSword');
    VL.hitEnemy(state, plant, 1, { x: 0, y: 0 }, undefined);
    VL.hitEnemy(state, plant, 1, { x: 0, y: 0 }, 'throw');
    assert.equal(state.message, null, 'a throw only clinks');
  }
  {
    const { VL } = loadGame();
    const state = playState(VL, ow('3,0', 7, 5));
    VL.giveItem(state, 'woodSword');
    state.popups.queue.length = 0;
    const slime = VL.spawnEnemy(state, 'slime', 7, 6);
    VL.hitEnemy(state, slime, 1, { x: 0, y: 0 }, 'woodSword');
    assert.equal(state.message, null);
  }
});
