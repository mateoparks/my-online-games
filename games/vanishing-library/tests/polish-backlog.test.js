// W25, the polish backlog from reviews and QA: the hand-in tally, a second
// loose page, a faint while carrying a chicken, corner assist around people,
// a grace after a popup, and Delete with saving off.
const assert = require('node:assert/strict');
const { test, loadGame } = require('./harness');

// ---------- 1. the tally never promises a reward he is about to give ----------

test('handing in the fifth book, the tally skips "Bring me N more": the purse comes right after', () => {
  const { VL } = loadGame();
  const game = VL.newGame({ name: 'Robin' });
  ['bookRiverside', 'bookBeachBuried', 'bookCliffRoad', 'bookLighthouse'].forEach((id) => VL.markFound(game, id));
  const four = VL.returnSpeech(game, VL.returnBooks(game));
  assert.ok(four.at(-1).includes('Bring me 1 more'), four.at(-1));
  VL.markFound(game, 'bookEastRoad');
  const five = VL.returnSpeech(game, VL.returnBooks(game));
  assert.equal(VL.pendingReward(game), 'shellPurse');
  assert.ok(five.at(-1).includes('5 books') && !five.at(-1).includes('more'), five.at(-1));
  VL.giveLibraryReward(game, 'shellPurse');
  VL.markFound(game, 'bookWoods');
  const six = VL.returnSpeech(game, VL.returnBooks(game));
  assert.ok(six.at(-1).includes('Bring me 4 more'), 'the next goal again once the reward is given');
});
