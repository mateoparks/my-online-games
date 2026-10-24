// Playthrough steps for the milestones W11 implements: the sealed book from
// the trunk by the puppet stage, carried to the library and handed to the
// librarian, who reads it and gives the Scriptorium key.
module.exports = (step) => {
  step('scriptoriumKey', (drive) => {
    const { VL } = drive;
    drive.closePopups();
    const trunk = VL.SPOTS.hiddenBookSealed;
    drive.walkTo({ area: 'overworld', screen: trunk.screen, tx: trunk.x, ty: trunk.y + 1 });
    drive.hold(['up'], 0.1);
    drive.press('interact');
    drive.reload();
    if (!VL.booksCarried(drive.state).includes('hiddenBookSealed')) throw new Error('scriptoriumKey: the sealed book was not found, or not saved');
    drive.closePopups();
    drive.walkTo({ area: 'library', screen: '0,0', ...VL.LIBRARY_TALK_AT });
    drive.hold(['up'], 0.1);
    drive.press('interact');
    // Through the talk, the returned books' words and the reading.
    for (let i = 0; i < 60; i += 1) {
      const idle = drive.app.sceneId === 'play' && !drive.state.libraryChain && !VL.currentPopup(drive.state);
      if (idle) break;
      drive.hold([], 0.35);
      if (drive.app.sceneId !== 'play') drive.press('interact');
    }
    drive.reload();
    if (!VL.hasItem(drive.state, 'scriptoriumKey')) throw new Error(`scriptoriumKey: no key after the reading (scene ${drive.app.sceneId})`);
  });
};
