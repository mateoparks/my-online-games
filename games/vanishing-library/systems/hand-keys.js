// The hand keys (W40): each save chooses the keys for the main and off hand
// (Esc → Controls, scenes/controls.js). Saved as `handKeys: { mainHand,
// offHand }`, key codes; README "Hand keys (W40)".
(() => {
  VL.DEFAULT_HAND_KEYS = Object.freeze({ mainHand: 'Space', offHand: 'KeyD' });
  VL.extendGame('handKeys', () => ({ handKeys: { ...VL.DEFAULT_HAND_KEYS } }));

  // Letters and digits, and Space: anything else is not offered.
  const choosable = (code) => code === 'Space' || /^Key[A-Z]$/.test(code) || /^Digit[0-9]$/.test(code);
  // Every key the game already binds, and the mute key (systems/sound.js).
  VL.reservedKey = (code) => code in VL.KEYS || code === VL.SOUND?.MUTE_CODE;

  // 'ok', 'taken' (the game uses it), 'notAKey' (not a letter, digit or
  // Space) or 'otherHand' (the other hand has it).
  VL.handKeyChoice = function handKeyChoice(state, hand, code) {
    if (typeof code !== 'string') return 'notAKey';
    if (VL.reservedKey(code)) return 'taken';
    if (!choosable(code)) return 'notAKey';
    const other = hand === 'mainHand' ? 'offHand' : 'mainHand';
    return VL.handKeys(state)[other] === code ? 'otherHand' : 'ok';
  };

  // The game's binding; one that a save got wrong somehow plays as the default.
  VL.handKeys = function handKeys(state) {
    const saved = state?.handKeys;
    const fine = (code) => typeof code === 'string' && choosable(code) && !VL.reservedKey(code);
    if (!saved || !fine(saved.mainHand) || !fine(saved.offHand) || saved.mainHand === saved.offHand) return VL.DEFAULT_HAND_KEYS;
    return saved;
  };

  VL.setHandKey = function setHandKey(state, hand, code) {
    if (VL.handKeyChoice(state, hand, code) !== 'ok') return false;
    state.handKeys = { ...VL.handKeys(state), [hand]: code };
    return true;
  };

  VL.resetHandKeys = function resetHandKeys(state) {
    state.handKeys = { ...VL.DEFAULT_HAND_KEYS };
  };

  // A key in words ('Space', 'Q', '7') and as a small label ('␣', 'Q', '7').
  VL.keyWord = (code) => (code === 'Space' ? 'Space' : String(code).replace(/^(Key|Digit)/, ''));
  VL.keyMark = (code) => (code === 'Space' ? '␣' : VL.keyWord(code));
  VL.handKeyWord = (state, hand) => VL.keyWord(VL.handKeys(state)[hand]);
  VL.handKeyMark = (state, hand) => VL.keyMark(VL.handKeys(state)[hand]);
  // A hint label: '␣ MAIN HAND' reads as before, a letter gets a colon ('Q: MAIN HAND').
  VL.handKeyHint = (state, hand) => {
    const mark = VL.handKeyMark(state, hand);
    return mark === '␣' ? mark : `${mark}:`;
  };

  VL.ART.hudSource('mainKey', (state) => VL.handKeyMark(state, 'mainHand'));
  VL.ART.hudSource('offKey', (state) => VL.handKeyMark(state, 'offHand'));
})();
