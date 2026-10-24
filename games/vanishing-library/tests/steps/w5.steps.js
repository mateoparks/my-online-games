// Playthrough steps for the milestones W5 implements: into the hut, the
// chest opened with S, its sword and shield popups read.
module.exports = (step) => {
  step('chestGear', (drive) => {
    const { VL } = drive;
    drive.closePopups();
    const chest = VL.getScreen('hut', '0,0').entities.find((e) => e.id === 'hutChest');
    drive.walkTo({ area: 'hut', screen: '0,0', tx: chest.x, ty: chest.y + 1 });
    drive.hold(['up'], 0.1);
    drive.press('interact');
    // Reload before closing the popups: closing one earns too, so a chest
    // that forgot VL.earned would only show up here (README "Progression").
    drive.reload();
    if (!VL.LOCKS.chestGear.reached(drive.state)) throw new Error('chestGear: the chest\'s gear did not survive a reload');
    drive.closePopups();
    if (drive.state.hands.mainHand !== 'woodSword') throw new Error(`chestGear: the main hand holds ${drive.state.hands.mainHand}`);
  });
};
