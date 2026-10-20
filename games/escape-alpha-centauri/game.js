(() => {
  const canvas = document.querySelector('#game');
  const context = canvas.getContext('2d');
  const status = document.querySelector('#status');
  const carriedAlloyCount = document.querySelector('#carried-alloy-count');
  const carriedReactorCoilCount = document.querySelector('#carried-reactor-coil-count');
  const cachedAlloyCount = document.querySelector('#cached-alloy-count');
  const cachedReactorCoilCount = document.querySelector('#cached-reactor-coil-count');
  const gameDialog = document.querySelector('#game-dialog');
  const panelTitle = document.querySelector('#panel-title');
  const questsPanel = document.querySelector('#quests-panel');
  const inventoryPanel = document.querySelector('#inventory-panel');
  const cachePanel = document.querySelector('#cache-panel');
  const questActive = document.querySelector('#quest-active');
  const inventoryTotal = document.querySelector('#inventory-total');
  const inventoryAlloy = document.querySelector('#inventory-alloy');
  const inventoryReactorCoil = document.querySelector('#inventory-reactor-coil');
  const cacheCarriedTotal = document.querySelector('#cache-carried-total');
  const kitStatus = document.querySelector('#kit-status');
  const navigationModuleStatus = document.querySelector('#navigation-module-status');
  const reactorCoreStatus = document.querySelector('#reactor-core-status');
  const shelterStatus = document.querySelector('#shelter-status');
  const activeObjective = document.querySelector('#active-objective');
  const fabricateButton = document.querySelector('#fabricate-kit');
  const repairNavigationModuleButton = document.querySelector('#repair-navigation-module');
  const rebuildReactorCoreButton = document.querySelector('#rebuild-reactor-core');
  const deployShelterButton = document.querySelector('#deploy-shelter');
  const startNewExpeditionButton = document.querySelector('#start-new-expedition');
  const resetButton = document.querySelector('#reset-save');
  const resetConfirmation = document.querySelector('#reset-confirmation');
  const cancelResetButton = document.querySelector('#cancel-reset');
  const confirmResetButton = document.querySelector('#confirm-reset');
  const closePanelButton = document.querySelector('#close-panel');
  const closePanelFooterButton = document.querySelector('#close-panel-footer');
  const keys = new Set();
  const width = canvas.width;
  const height = canvas.height;
  const tileSize = 48;
  const saveKey = 'escape-alpha-centauri-save';
  const saveVersion = 10;
  const climbingKitCost = 4;
  const navigationModuleRepairCost = 6;
  const reactorCoreRepairCost = 3;
  const carryCapacity = 2;
  const worldRows = height / tileSize;
  const tileTypes = {
    air: 'air',
    ground: 'ground',
    alloy: 'alloy',
    reactorCoil: 'reactor-coil',
  };
  const itemTypes = {
    alloy: 'alloy',
    reactorCoil: 'reactor-coil',
  };
  const initialSurfaceRows = [
    7, 7, 7, 7, 7, 7, 7, 7,
    6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
    5, 5, 5, 5,
    4, 4, 4, 4,
    2, 2, 2, 2, 2, 2,
    1, 1, 1, 1, 1, 1,
  ];
  const world = {
    columns: initialSurfaceRows.length,
    rows: worldRows,
    tiles: Array.from({ length: worldRows }, (_, row) => (
      initialSurfaceRows.map((surfaceRow) => (
        row >= surfaceRow ? tileTypes.ground : tileTypes.air
      ))
    )),
  };
  const worldWidth = world.columns * tileSize;
  const playerStartColumn = 12;
  const player = {
    x: (playerStartColumn + .5) * tileSize,
    y: 0,
    width: 32,
    height: tileSize,
    speed: 250,
    facing: 1,
  };
  const camera = {
    x: 0,
  };
  const salvageCache = {
    x: (10.5) * tileSize,
  };
  const damagedWreckBeacon = {
    x: (34.5) * tileSize,
  };
  const mainWreck = {
    x: (38.2) * tileSize,
  };
  const emergencyShelter = {
    x: (14.5) * tileSize,
  };
  const drops = [];
  const inventory = {
    carried: {
      [itemTypes.alloy]: 0,
      [itemTypes.reactorCoil]: 0,
    },
    cached: {
      [itemTypes.alloy]: 0,
      [itemTypes.reactorCoil]: 0,
    },
  };
  const milestones = {
    firstSignal: false,
    wreckBeacon: false,
    mainWreck: false,
  };
  const upgrades = {
    climbingKit: false,
  };
  const repairs = {
    navigationModule: false,
    reactorCoreRepaired: false,
  };
  const construction = {
    emergencyShelter: false,
  };
  let initialTiles;
  let lastFrameTime = performance.now();
  let hasMoved = false;
  let wasBlocked = false;
  let resetConfirmationOpener;
  let isConfirmingReset = false;

  function isMovementKey(key) {
    return ['ArrowLeft', 'ArrowRight', 'a', 'A', 'd', 'D'].includes(key);
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function getColumnAt(worldX) {
    return clamp(Math.floor(worldX / tileSize), 0, world.columns - 1);
  }

  function getTile(column, row) {
    if (column < 0 || column >= world.columns || row < 0 || row >= world.rows) {
      return tileTypes.air;
    }

    return world.tiles[row][column];
  }

  function setTile(column, row, tileType) {
    world.tiles[row][column] = tileType;
  }

  function cloneTiles(tiles) {
    return tiles.map((row) => [...row]);
  }

  function isSolidTile(column, row) {
    const tile = getTile(column, row);
    return tile === tileTypes.ground || tile === tileTypes.alloy || tile === tileTypes.reactorCoil;
  }

  function getSurfaceRowForColumn(column) {
    for (let row = 0; row < world.rows; row += 1) {
      if (isSolidTile(column, row)) return row;
    }

    return world.rows;
  }

  function getSurfaceRow(worldX) {
    return getSurfaceRowForColumn(getColumnAt(worldX));
  }

  function getGroundY(worldX) {
    return getSurfaceRow(worldX) * tileSize;
  }

  function placeAlloyAtSurface(column) {
    const row = getSurfaceRowForColumn(column);
    setTile(column, row, tileTypes.alloy);
  }

  function placeReactorCoilAtSurface(column) {
    const row = getSurfaceRowForColumn(column);
    setTile(column, row, tileTypes.reactorCoil);
  }

  function getItemCount(items) {
    return Object.values(items).reduce((total, count) => total + count, 0);
  }

  function getCarriedItemCount() {
    return getItemCount(inventory.carried);
  }

  function getTerrainRegion(column) {
    if (column < 8) return 'beach';
    if (column < 22) return 'plain';
    if (column < 30) return 'foothill';
    return 'mountain';
  }

  function updateInventory() {
    carriedAlloyCount.value = inventory.carried[itemTypes.alloy];
    carriedAlloyCount.textContent = inventory.carried[itemTypes.alloy];
    carriedReactorCoilCount.value = inventory.carried[itemTypes.reactorCoil];
    carriedReactorCoilCount.textContent = inventory.carried[itemTypes.reactorCoil];
    cachedAlloyCount.value = inventory.cached[itemTypes.alloy];
    cachedAlloyCount.textContent = inventory.cached[itemTypes.alloy];
    cachedReactorCoilCount.value = inventory.cached[itemTypes.reactorCoil];
    cachedReactorCoilCount.textContent = inventory.cached[itemTypes.reactorCoil];
    inventoryTotal.value = getCarriedItemCount();
    inventoryTotal.textContent = getCarriedItemCount();
    inventoryAlloy.value = inventory.carried[itemTypes.alloy];
    inventoryAlloy.textContent = inventory.carried[itemTypes.alloy];
    inventoryReactorCoil.value = inventory.carried[itemTypes.reactorCoil];
    inventoryReactorCoil.textContent = inventory.carried[itemTypes.reactorCoil];
    cacheCarriedTotal.value = getCarriedItemCount();
    cacheCarriedTotal.textContent = getCarriedItemCount();
    kitStatus.textContent = upgrades.climbingKit ? 'Climbing kit: fabricated' : 'Climbing kit: not fabricated';
    if (repairs.navigationModule) {
      navigationModuleStatus.textContent = 'Navigation module: repaired';
      repairNavigationModuleButton.disabled = true;
    } else if (!milestones.wreckBeacon) {
      navigationModuleStatus.textContent = 'Navigation module: wreck beacon discovery required';
      repairNavigationModuleButton.disabled = true;
    } else {
      navigationModuleStatus.textContent = `Navigation module: ${inventory.cached[itemTypes.alloy]}/${navigationModuleRepairCost} cached alloy`;
      repairNavigationModuleButton.disabled = false;
    }

    if (repairs.reactorCoreRepaired) {
      reactorCoreStatus.textContent = 'Reactor core: rebuilt';
      rebuildReactorCoreButton.disabled = true;
    } else if (!milestones.mainWreck) {
      reactorCoreStatus.textContent = 'Reactor core: main wreck discovery required';
      rebuildReactorCoreButton.disabled = true;
    } else {
      reactorCoreStatus.textContent = `Reactor core: ${inventory.cached[itemTypes.reactorCoil]}/${reactorCoreRepairCost} cached coils`;
      rebuildReactorCoreButton.disabled = false;
    }

    if (construction.emergencyShelter) {
      shelterStatus.textContent = 'Emergency shelter: deployed at the prepared site';
      deployShelterButton.disabled = true;
    } else if (!repairs.reactorCoreRepaired) {
      shelterStatus.textContent = 'Emergency shelter: reactor-core repair required';
      deployShelterButton.disabled = true;
    } else {
      shelterStatus.textContent = 'Emergency shelter: ready to deploy at the prepared site';
      deployShelterButton.disabled = false;
    }

    if (construction.emergencyShelter) {
      activeObjective.textContent = 'Establish a safe shelter: complete.';
    } else if (repairs.reactorCoreRepaired) {
      activeObjective.textContent = 'Establish a safe shelter.';
    } else if (milestones.mainWreck) {
      activeObjective.textContent = 'Restore the reactor core.';
    } else if (repairs.navigationModule) {
      activeObjective.textContent = 'Reach the main wreck.';
    } else if (milestones.wreckBeacon) {
      activeObjective.textContent = 'Repair the navigation module.';
    } else {
      activeObjective.textContent = 'Follow the emergency signal east.';
    }

    questActive.textContent = activeObjective.textContent;
    setPanelItemVisibility('complete-first-signal', milestones.firstSignal);
    setPanelItemVisibility('complete-wreck-beacon', milestones.wreckBeacon);
    setPanelItemVisibility('complete-navigation', repairs.navigationModule);
    setPanelItemVisibility('complete-main-wreck', milestones.mainWreck);
    setPanelItemVisibility('complete-reactor', repairs.reactorCoreRepaired);
    setPanelItemVisibility('complete-shelter', construction.emergencyShelter);
    setPanelItemVisibility('memory-first-signal', milestones.firstSignal);
    setPanelItemVisibility('memory-wreck-beacon', milestones.wreckBeacon);
    setPanelItemVisibility('memory-navigation', repairs.navigationModule);
    setPanelItemVisibility('memory-main-wreck', milestones.mainWreck);
    setPanelItemVisibility('memory-reactor', repairs.reactorCoreRepaired);
    setPanelItemVisibility('memory-shelter', construction.emergencyShelter);
  }

  function setPanelItemVisibility(id, visible) {
    document.querySelector(`#${id}`).hidden = !visible;
  }

  function getTileChanges() {
    const changes = [];

    for (let row = 0; row < world.rows; row += 1) {
      for (let column = 0; column < world.columns; column += 1) {
        const tile = getTile(column, row);
        if (tile !== initialTiles[row][column]) {
          changes.push({ column, row, tile });
        }
      }
    }

    return changes;
  }

  function reportStorageError(message, error) {
    console.error(message, error);
    status.textContent = `${message} Your progress may not be saved.`;
  }

  function saveGame() {
    const save = {
      version: saveVersion,
      player: {
        x: player.x,
        facing: player.facing,
      },
      inventory: {
        carried: { ...inventory.carried },
        cached: { ...inventory.cached },
      },
      milestones,
      upgrades,
      repairs,
      construction,
      tileChanges: getTileChanges(),
      drops: drops.map((drop) => ({ x: drop.x, y: drop.y, item: drop.item })),
    };

    try {
      localStorage.setItem(saveKey, JSON.stringify(save));
      return true;
    } catch (error) {
      reportStorageError('Unable to save this expedition.', error);
      return false;
    }
  }

  function clearSavedGame() {
    try {
      localStorage.removeItem(saveKey);
      return true;
    } catch (error) {
      reportStorageError('Unable to clear the saved expedition.', error);
      return false;
    }
  }

  function isValidTileType(tile) {
    return Object.values(tileTypes).includes(tile);
  }

  function migrateSave(save) {
    if (save && save.version === 1 && save.inventory && Number.isSafeInteger(save.inventory.alloy)) {
      save = {
        ...save,
        version: 2,
        inventory: {
          carriedAlloy: Math.min(save.inventory.alloy, carryCapacity),
          cachedAlloy: Math.max(0, save.inventory.alloy - carryCapacity),
        },
      };
    }

    if (save && save.version === 2) {
      save = {
        ...save,
        version: 3,
        milestones: { firstSignal: false },
      };
    }

    if (save && save.version === 3) {
      save = {
        ...save,
        version: 4,
        upgrades: { climbingKit: false },
      };
    }

    if (save && save.version === 4) {
      save = {
        ...save,
        version: 5,
        milestones: {
          ...save.milestones,
          wreckBeacon: false,
        },
      };
    }

    if (save && save.version === 5) {
      save = {
        ...save,
        version: 6,
        repairs: { navigationModule: false },
      };
    }

    if (save && save.version === 6) {
      save = {
        ...save,
        version: 7,
        milestones: {
          ...save.milestones,
          mainWreck: false,
        },
      };
    }

    if (save && save.version === 7 && save.inventory) {
      save = {
        ...save,
        version: 8,
        inventory: {
          carried: {
            [itemTypes.alloy]: save.inventory.carriedAlloy,
            [itemTypes.reactorCoil]: 0,
          },
          cached: {
            [itemTypes.alloy]: save.inventory.cachedAlloy,
            [itemTypes.reactorCoil]: 0,
          },
        },
        drops: save.drops.map((drop) => ({ ...drop, item: itemTypes.alloy })),
      };
    }

    if (save && save.version === 8 && save.repairs) {
      save = {
        ...save,
        version: 9,
        repairs: {
          ...save.repairs,
          reactorCoreRepaired: false,
        },
      };
    }

    if (save && save.version === 9 && save.repairs) {
      save = {
        ...save,
        version: 10,
        construction: { emergencyShelter: false },
      };
    }

    return save;
  }

  function isValidItemCount(count) {
    return Number.isSafeInteger(count) && count >= 0;
  }

  function isValidItemInventory(items) {
    return items
      && typeof items === 'object'
      && !Array.isArray(items)
      && isValidItemCount(items[itemTypes.alloy])
      && isValidItemCount(items[itemTypes.reactorCoil]);
  }

  function isValidSave(save) {
    return save
      && typeof save === 'object'
      && !Array.isArray(save)
      && save.version === saveVersion
      && save.player
      && Number.isFinite(save.player.x)
      && save.player.x >= player.width / 2
      && save.player.x <= worldWidth - player.width / 2
      && [1, -1].includes(save.player.facing)
      && save.inventory
      && isValidItemInventory(save.inventory.carried)
      && getItemCount(save.inventory.carried) <= carryCapacity
      && isValidItemInventory(save.inventory.cached)
      && save.milestones
      && typeof save.milestones.firstSignal === 'boolean'
      && typeof save.milestones.wreckBeacon === 'boolean'
      && typeof save.milestones.mainWreck === 'boolean'
      && save.upgrades
      && typeof save.upgrades.climbingKit === 'boolean'
      && save.repairs
      && typeof save.repairs.navigationModule === 'boolean'
      && typeof save.repairs.reactorCoreRepaired === 'boolean'
      && save.construction
      && typeof save.construction.emergencyShelter === 'boolean'
      && Array.isArray(save.tileChanges)
      && save.tileChanges.every((change) => (
        change
        && Number.isInteger(change.column)
        && Number.isInteger(change.row)
        && change.column >= 0
        && change.column < world.columns
        && change.row >= 0
        && change.row < world.rows
        && isValidTileType(change.tile)
      ))
      && Array.isArray(save.drops)
      && save.drops.every((drop) => (
        drop
        && Number.isFinite(drop.x)
        && Number.isFinite(drop.y)
        && drop.x >= 0
        && drop.x <= worldWidth
        && drop.y >= 0
        && drop.y <= height
        && Object.values(itemTypes).includes(drop.item)
      ));
  }

  function restoreSave() {
    let rawSave;

    try {
      rawSave = localStorage.getItem(saveKey);
    } catch (error) {
      reportStorageError('Unable to read a saved expedition.', error);
      return false;
    }

    if (rawSave === null) return false;

    let save;
    try {
      save = migrateSave(JSON.parse(rawSave));
    } catch (error) {
      clearSavedGame();
      status.textContent = 'The saved expedition was unreadable. A new one has begun.';
      return false;
    }

    if (!isValidSave(save)) {
      clearSavedGame();
      status.textContent = 'The saved expedition is incompatible. A new one has begun.';
      return false;
    }

    for (const change of save.tileChanges) {
      setTile(change.column, change.row, change.tile);
    }
    drops.push(...save.drops);
    player.x = save.player.x;
    player.facing = save.player.facing;
    player.y = getGroundY(player.x) - player.height;
    inventory.carried[itemTypes.alloy] = save.inventory.carried[itemTypes.alloy];
    inventory.carried[itemTypes.reactorCoil] = save.inventory.carried[itemTypes.reactorCoil];
    inventory.cached[itemTypes.alloy] = save.inventory.cached[itemTypes.alloy];
    inventory.cached[itemTypes.reactorCoil] = save.inventory.cached[itemTypes.reactorCoil];
    milestones.firstSignal = save.milestones.firstSignal;
    milestones.wreckBeacon = save.milestones.wreckBeacon;
    milestones.mainWreck = save.milestones.mainWreck;
    upgrades.climbingKit = save.upgrades.climbingKit;
    repairs.navigationModule = save.repairs.navigationModule;
    repairs.reactorCoreRepaired = save.repairs.reactorCoreRepaired;
    construction.emergencyShelter = save.construction.emergencyShelter;
    camera.x = clamp(player.x - width / 2, 0, worldWidth - width);
    updateInventory();
    saveGame();
    status.textContent = 'Expedition restored.';
    return true;
  }

  function resetGame() {
    clearSavedGame();
    world.tiles = cloneTiles(initialTiles);
    drops.length = 0;
    Object.values(itemTypes).forEach((item) => {
      inventory.carried[item] = 0;
      inventory.cached[item] = 0;
    });
    milestones.firstSignal = false;
    milestones.wreckBeacon = false;
    milestones.mainWreck = false;
    upgrades.climbingKit = false;
    repairs.navigationModule = false;
    repairs.reactorCoreRepaired = false;
    construction.emergencyShelter = false;
    player.x = (playerStartColumn + .5) * tileSize;
    player.facing = 1;
    player.y = getGroundY(player.x) - player.height;
    camera.x = clamp(player.x - width / 2, 0, worldWidth - width);
    hasMoved = false;
    wasBlocked = false;
    updateInventory();
    status.textContent = 'A new expedition has begun.';
    if (resetConfirmation.open) resetConfirmation.close();
    if (gameDialog.open) gameDialog.close();
    canvas.focus();
  }

  function getMiningTarget() {
    const targetColumn = getColumnAt(player.x) + player.facing;
    if (targetColumn < 0 || targetColumn >= world.columns) return null;

    const targetRow = getSurfaceRowForColumn(targetColumn);
    const playerRow = getSurfaceRow(player.x);
    if (Math.abs(targetRow - playerRow) > 1) return null;

    return { column: targetColumn, row: targetRow };
  }

  function tryMine() {
    const target = getMiningTarget();
    const tile = target && getTile(target.column, target.row);
    const item = tile === tileTypes.alloy
      ? itemTypes.alloy
      : tile === tileTypes.reactorCoil ? itemTypes.reactorCoil : null;
    if (!target || !item) {
      status.textContent = 'No mineable material is within reach.';
      return;
    }

    setTile(target.column, target.row, tileTypes.air);
    drops.push({
      x: (target.column + .5) * tileSize,
      y: (target.row + 1) * tileSize - 9,
      item,
    });
    status.textContent = `${item === itemTypes.alloy ? 'Alloy' : 'Damaged reactor coil'} dislodged. Walk into it to collect it.`;
    saveGame();
  }

  function collectDrops() {
    if (getCarriedItemCount() >= carryCapacity) {
      if (drops.length > 0) status.textContent = 'You cannot carry more materials. Return to the salvage cache.';
      return;
    }

    const playerCenterY = player.y + player.height / 2;
    let collected = false;

    for (let index = drops.length - 1; index >= 0; index -= 1) {
      if (getCarriedItemCount() >= carryCapacity) break;
      const drop = drops[index];
      if (Math.hypot(player.x - drop.x, playerCenterY - drop.y) > 42) continue;

      drops.splice(index, 1);
      inventory.carried[drop.item] += 1;
      updateInventory();
      status.textContent = `${drop.item === itemTypes.alloy ? 'Alloy' : 'Damaged reactor coil'} collected.`;
      collected = true;
    }

    if (collected) saveGame();
  }

  function showPanel(panel) {
    const panels = [questsPanel, inventoryPanel, cachePanel];
    panels.forEach((candidate) => {
      candidate.hidden = candidate !== panel;
    });
    panelTitle.textContent = panel === questsPanel
      ? 'Quests and memories'
      : panel === inventoryPanel ? 'Carried inventory' : 'Salvage cache';
    updateInventory();
    if (!gameDialog.open) gameDialog.showModal();
    closePanelButton.focus();
  }

  function closePanel() {
    if (gameDialog.open) gameDialog.close();
  }

  function showResetConfirmation(opener) {
    keys.clear();
    resetConfirmationOpener = opener;
    if (!resetConfirmation.open) resetConfirmation.showModal();
    confirmResetButton.focus();
  }

  function cancelReset() {
    if (resetConfirmation.open) resetConfirmation.close();
  }

  function transferItem(item, from, to, amount) {
    const available = inventory[from][item];
    const capacity = to === 'carried' ? carryCapacity - getCarriedItemCount() : available;
    const moved = Math.min(available, amount, capacity);
    if (moved <= 0) {
      status.textContent = to === 'carried'
        ? 'Your carried inventory is full.'
        : 'There are no materials to move.';
      return;
    }

    inventory[from][item] -= moved;
    inventory[to][item] += moved;
    updateInventory();
    saveGame();
    status.textContent = `${moved} ${item === itemTypes.alloy ? 'alloy' : 'reactor coil'}${moved === 1 ? '' : 's'} moved.`;
    if (to === 'cached') unlockFirstSignal();
  }

  function unlockFirstSignal() {
    if (inventory.cached[itemTypes.alloy] < 3 || milestones.firstSignal) return;

    milestones.firstSignal = true;
    updateInventory();
    saveGame();
    status.textContent = 'The salvage cache emits a damaged emergency transmission. Press Q to review the recovered memory.';
  }

  function useSalvageCache() {
    if (Math.abs(player.x - salvageCache.x) > tileSize * 1.2) {
      status.textContent = 'The salvage cache is not within reach.';
      return;
    }
    showPanel(cachePanel);
  }

  function fabricateClimbingKit() {
    if (Math.abs(player.x - salvageCache.x) > tileSize * 1.2) {
      status.textContent = 'The salvage cache is not within reach.';
      return;
    }

    if (upgrades.climbingKit) {
      status.textContent = 'The climbing kit is already fabricated.';
      return;
    }

    if (inventory.cached[itemTypes.alloy] < climbingKitCost) {
      status.textContent = 'Four cached alloy are needed for a climbing kit.';
      return;
    }

    inventory.cached[itemTypes.alloy] -= climbingKitCost;
    upgrades.climbingKit = true;
    updateInventory();
    status.textContent = 'Climbing kit fabricated. Steep mountain faces are now traversable.';
    saveGame();
  }

  function useDamagedWreckBeacon() {
    if (Math.abs(player.x - damagedWreckBeacon.x) > tileSize * 1.2) {
      status.textContent = 'No wreck beacon is within reach.';
      return;
    }

    if (milestones.wreckBeacon) {
      status.textContent = 'The damaged wreck beacon has already yielded its memory.';
      return;
    }

    milestones.wreckBeacon = true;
    updateInventory();
    saveGame();
    status.textContent = 'The damaged wreck beacon crackles to life. Press Q to review the recovered memory.';
  }

  function useMainWreck() {
    if (Math.abs(player.x - mainWreck.x) > tileSize * 2) {
      status.textContent = 'The main wreck is not within reach.';
      return;
    }

    if (!repairs.navigationModule) {
      status.textContent = 'The repaired navigation module is required to safely approach the main wreck.';
      return;
    }

    if (milestones.mainWreck) {
      status.textContent = 'The main wreck remains still. Its reactor core can be restored.';
      return;
    }

    milestones.mainWreck = true;
    updateInventory();
    saveGame();
    status.textContent = 'The navigation module guides you through the main wreck. Press Q to review the recovered memory.';
  }

  function repairNavigationModule() {
    if (Math.abs(player.x - salvageCache.x) > tileSize * 1.2) {
      status.textContent = 'The salvage cache is not within reach.';
      return;
    }

    if (!milestones.wreckBeacon) {
      status.textContent = 'The wreck beacon must be discovered before this repair can begin.';
      return;
    }

    if (repairs.navigationModule) {
      status.textContent = 'The navigation module is already repaired.';
      return;
    }

    if (inventory.cached[itemTypes.alloy] < navigationModuleRepairCost) {
      status.textContent = 'Six cached alloy are needed to repair the navigation module.';
      return;
    }

    inventory.cached[itemTypes.alloy] -= navigationModuleRepairCost;
    repairs.navigationModule = true;
    updateInventory();
    status.textContent = 'Navigation module repaired. Its route points toward the main wreck.';
    saveGame();
  }

  function rebuildReactorCore() {
    if (Math.abs(player.x - salvageCache.x) > tileSize * 1.2) {
      status.textContent = 'The salvage cache is not within reach.';
      return;
    }

    if (!milestones.mainWreck) {
      status.textContent = 'The main wreck must be discovered before the reactor core can be rebuilt.';
      return;
    }

    if (repairs.reactorCoreRepaired) {
      status.textContent = 'The reactor core is already rebuilt.';
      return;
    }

    if (inventory.cached[itemTypes.reactorCoil] < reactorCoreRepairCost) {
      status.textContent = 'Three cached reactor coils are needed to rebuild the reactor core.';
      return;
    }

    inventory.cached[itemTypes.reactorCoil] -= reactorCoreRepairCost;
    repairs.reactorCoreRepaired = true;
    updateInventory();
    status.textContent = 'Reactor core rebuilt. Launch systems are available, but a safe base or shelter is still needed.';
    saveGame();
  }

  function deployEmergencyShelter() {
    if (Math.abs(player.x - salvageCache.x) > tileSize * 1.2) {
      status.textContent = 'The salvage cache is not within reach.';
      return;
    }

    if (!repairs.reactorCoreRepaired) {
      status.textContent = 'The reactor core must be rebuilt before the emergency shelter can be deployed.';
      return;
    }

    if (construction.emergencyShelter) {
      status.textContent = 'The emergency shelter is already deployed at the prepared site.';
      return;
    }

    construction.emergencyShelter = true;
    updateInventory();
    status.textContent = 'Emergency shelter deployed at the prepared site.';
    saveGame();
  }

  function movePlayer(direction, deltaSeconds) {
    const minimumX = player.width / 2;
    const maximumX = worldWidth - player.width / 2;
    const nextX = clamp(player.x + direction * player.speed * deltaSeconds, minimumX, maximumX);
    const currentGroundY = getGroundY(player.x);
    const nextGroundY = getGroundY(nextX);

    const maximumStepHeight = upgrades.climbingKit ? tileSize * 2 : tileSize;
    if (Math.abs(nextGroundY - currentGroundY) > maximumStepHeight) {
      if (!wasBlocked) {
        status.textContent = 'The mountain face is too steep to climb.';
      }
      wasBlocked = true;
      return;
    }

    wasBlocked = false;
    player.x = nextX;
    player.y = nextGroundY - player.height;
    player.facing = direction;

    if (!hasMoved) {
      hasMoved = true;
      status.textContent = 'The beach is behind you. Low foothills rise to the east.';
    }
  }

  function update(deltaSeconds) {
    if (gameDialog.open || resetConfirmation.open) return;
    const direction = (keys.has('ArrowRight') || keys.has('d') || keys.has('D') ? 1 : 0)
      - (keys.has('ArrowLeft') || keys.has('a') || keys.has('A') ? 1 : 0);

    if (direction !== 0) movePlayer(direction, deltaSeconds);
    collectDrops();

    const targetCameraX = clamp(player.x - width / 2, 0, worldWidth - width);
    camera.x += (targetCameraX - camera.x) * Math.min(1, deltaSeconds * 8);
  }

  function drawSky() {
    const sky = context.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#86d9ec');
    sky.addColorStop(1, '#f7d9a0');
    context.fillStyle = sky;
    context.fillRect(0, 0, width, height);

    context.fillStyle = '#fff9d5';
    context.beginPath();
    context.arc(780, 90, 39, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = '#f8feff';
    for (const [x, y, radius] of [[90, 78, 2], [190, 120, 3], [432, 60, 2], [600, 122, 2], [878, 180, 3]]) {
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawTile(column, row, tileType) {
    const screenX = column * tileSize - camera.x;
    const screenY = row * tileSize;
    const region = getTerrainRegion(column);
    const isSurface = !isSolidTile(column, row - 1);
    const colors = {
      beach: isSurface ? '#e9c27b' : '#c5824d',
      plain: isSurface ? '#98b96c' : '#6e9157',
      foothill: isSurface ? '#b79670' : '#85674e',
      mountain: isSurface ? '#8b7b72' : '#625751',
    };

    context.fillStyle = colors[region];
    context.fillRect(screenX, screenY, tileSize, tileSize);
    context.strokeStyle = '#3e484344';
    context.lineWidth = 1;
    context.strokeRect(screenX, screenY, tileSize, tileSize);

    if (isSurface) {
      context.fillStyle = region === 'plain' ? '#d4df8a' : '#f4d69a';
      context.fillRect(screenX, screenY, tileSize, 6);
    }

    if (region === 'mountain' && !isSurface) {
      context.fillStyle = '#b5a89a';
      context.fillRect(screenX + 13, screenY + 16, 8, 6);
      context.fillRect(screenX + 29, screenY + 31, 6, 5);
    }

    if (tileType === tileTypes.alloy) {
      context.fillStyle = '#70d5d6';
      context.fillRect(screenX + 11, screenY + 17, 11, 15);
      context.fillStyle = '#d3ffff';
      context.fillRect(screenX + 15, screenY + 12, 6, 9);
      context.fillRect(screenX + 26, screenY + 24, 9, 12);
    }

    if (tileType === tileTypes.reactorCoil) {
      context.strokeStyle = '#d9604d';
      context.lineWidth = 5;
      context.beginPath();
      context.arc(screenX + 24, screenY + 24, 12, 0, Math.PI * 2);
      context.stroke();
      context.strokeStyle = '#f3b66d';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(screenX + 24, screenY + 24, 7, 0, Math.PI * 2);
      context.stroke();
    }
  }

  function drawTerrain() {
    const firstColumn = Math.max(0, Math.floor(camera.x / tileSize) - 1);
    const lastColumn = Math.min(
      world.columns - 1,
      Math.ceil((camera.x + width) / tileSize) + 1,
    );

    for (let column = firstColumn; column <= lastColumn; column += 1) {
      for (let row = 0; row < world.rows; row += 1) {
        const tile = getTile(column, row);
        if (isSolidTile(column, row)) drawTile(column, row, tile);
      }
    }
  }

  function drawDrops() {
    for (const drop of drops) {
      const x = drop.x - camera.x;
      if (drop.item === itemTypes.alloy) {
        context.fillStyle = '#d3ffff';
        context.beginPath();
        context.moveTo(x, drop.y - 9);
        context.lineTo(x + 10, drop.y);
        context.lineTo(x, drop.y + 9);
        context.lineTo(x - 10, drop.y);
        context.closePath();
        context.fill();
        context.strokeStyle = '#368f9d';
        context.stroke();
      } else {
        context.strokeStyle = '#d9604d';
        context.lineWidth = 4;
        context.beginPath();
        context.arc(x, drop.y, 9, 0, Math.PI * 2);
        context.stroke();
      }
    }
  }

  function drawSalvageCache() {
    const x = salvageCache.x - camera.x;
    const groundY = getGroundY(salvageCache.x);

    context.fillStyle = '#5b3e2c';
    context.fillRect(x - 20, groundY - 28, 40, 28);
    context.fillStyle = '#cb9c4d';
    context.fillRect(x - 20, groundY - 28, 40, 6);
    context.fillStyle = '#78d6d2';
    context.fillRect(x - 4, groundY - 22, 8, 9);
    context.strokeStyle = '#2f2925';
    context.lineWidth = 2;
    context.strokeRect(x - 20, groundY - 28, 40, 28);
  }

  function drawDamagedWreckBeacon() {
    const x = damagedWreckBeacon.x - camera.x;
    const groundY = getGroundY(damagedWreckBeacon.x);

    context.fillStyle = '#403b43';
    context.fillRect(x - 5, groundY - 42, 10, 42);
    context.fillStyle = '#8d4a43';
    context.fillRect(x - 13, groundY - 11, 26, 11);
    context.fillStyle = '#242832';
    context.fillRect(x - 17, groundY - 8, 34, 8);
    context.strokeStyle = '#d6a653';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x, groundY - 42);
    context.lineTo(x + 13, groundY - 59);
    context.stroke();
    context.fillStyle = milestones.wreckBeacon ? '#78d6d2' : '#d9604d';
    context.beginPath();
    context.arc(x, groundY - 34, 5, 0, Math.PI * 2);
    context.fill();
  }

  function drawMainWreck() {
    const x = mainWreck.x - camera.x;
    const groundY = getGroundY(mainWreck.x);

    context.fillStyle = '#2b3540';
    context.fillRect(x - 94, groundY - 122, 150, 122);
    context.fillStyle = '#485867';
    context.fillRect(x - 118, groundY - 71, 190, 36);
    context.fillStyle = '#657783';
    context.fillRect(x - 55, groundY - 151, 86, 31);
    context.fillStyle = '#1d242d';
    context.fillRect(x - 27, groundY - 103, 45, 31);
    context.fillStyle = milestones.mainWreck ? '#78d6d2' : '#d6a653';
    context.fillRect(x + 35, groundY - 95, 12, 12);
    context.strokeStyle = '#182129';
    context.lineWidth = 4;
    context.strokeRect(x - 94, groundY - 122, 150, 122);
    context.strokeRect(x - 118, groundY - 71, 190, 36);
  }

  function drawEmergencyShelter() {
    if (!construction.emergencyShelter) return;

    const x = emergencyShelter.x - camera.x;
    const groundY = getGroundY(emergencyShelter.x);
    context.fillStyle = '#3f5a62';
    context.fillRect(x - 39, groundY - 8, 78, 8);
    context.fillStyle = '#e8d7a8';
    context.beginPath();
    context.moveTo(x - 34, groundY - 8);
    context.lineTo(x, groundY - 62);
    context.lineTo(x + 34, groundY - 8);
    context.closePath();
    context.fill();
    context.strokeStyle = '#31434a';
    context.lineWidth = 3;
    context.stroke();
    context.fillStyle = '#78d6d2';
    context.fillRect(x - 5, groundY - 29, 10, 21);
  }

  function drawMiningTarget() {
    const target = getMiningTarget();
    if (!target || ![tileTypes.alloy, tileTypes.reactorCoil].includes(getTile(target.column, target.row))) return;

    context.strokeStyle = '#efffb1';
    context.lineWidth = 3;
    context.strokeRect(
      target.column * tileSize - camera.x + 3,
      target.row * tileSize + 3,
      tileSize - 6,
      tileSize - 6,
    );
  }

  function drawPlayer() {
    const left = player.x - camera.x - player.width / 2;
    const top = player.y;

    context.fillStyle = '#f6f1dc';
    context.fillRect(left + 3, top + 15, player.width - 6, player.height - 15);

    context.fillStyle = '#e9b64d';
    context.fillRect(left, top, player.width, 20);
    context.fillStyle = '#193b51';
    context.fillRect(left + 5, top + 5, player.width - 10, 10);

    context.fillStyle = '#7ec8d4';
    context.fillRect(left + 7, top + 7, player.width - 14, 7);

    context.fillStyle = '#b6c9cc';
    context.fillRect(left - 4, top + 22, 6, 20);
    context.fillRect(left + player.width - 2, top + 22, 6, 20);

    context.fillStyle = '#e9b64d';
    context.fillRect(player.facing > 0 ? left + player.width + 3 : left - 7, top + 26, 6, 13);

    context.fillStyle = '#425b62';
    context.fillRect(left + 4, top + 40, 9, 8);
    context.fillRect(left + player.width - 13, top + 40, 9, 8);
  }

  function render() {
    drawSky();
    drawTerrain();
    drawSalvageCache();
    drawEmergencyShelter();
    drawDamagedWreckBeacon();
    drawMainWreck();
    drawDrops();
    drawMiningTarget();
    drawPlayer();
  }

  function frame(now) {
    const deltaSeconds = Math.min((now - lastFrameTime) / 1000, 0.05);
    lastFrameTime = now;
    update(deltaSeconds);
    render();
    requestAnimationFrame(frame);
  }

  window.addEventListener('keydown', (event) => {
    if (gameDialog.open || resetConfirmation.open) return;
    if (isMovementKey(event.key)) {
      keys.add(event.key);
      event.preventDefault();
      return;
    }

    if (event.key.toLowerCase() === 'q') {
      event.preventDefault();
      if (!event.repeat) showPanel(questsPanel);
      return;
    }

    if (event.key.toLowerCase() === 'i') {
      event.preventDefault();
      if (!event.repeat) showPanel(inventoryPanel);
      return;
    }

    if (event.code === 'Space') {
      event.preventDefault();
      if (!event.repeat) tryMine();
      return;
    }

    if (event.key.toLowerCase() === 'e') {
      event.preventDefault();
      if (!event.repeat) {
        if (Math.abs(player.x - mainWreck.x) <= tileSize * 2) {
          useMainWreck();
        } else if (Math.abs(player.x - damagedWreckBeacon.x) <= tileSize * 1.2) {
          useDamagedWreckBeacon();
        } else {
          useSalvageCache();
        }
      }
    }
  });

  window.addEventListener('keyup', (event) => {
    keys.delete(event.key);
  });

  window.addEventListener('blur', () => keys.clear());
  window.addEventListener('pagehide', saveGame);
  canvas.addEventListener('pointerdown', () => canvas.focus());
  startNewExpeditionButton.addEventListener('click', () => showResetConfirmation(startNewExpeditionButton));
  resetButton.addEventListener('click', () => showResetConfirmation(resetButton));
  cancelResetButton.addEventListener('click', cancelReset);
  confirmResetButton.addEventListener('click', () => {
    isConfirmingReset = true;
    resetGame();
    isConfirmingReset = false;
  });
  closePanelButton.addEventListener('click', closePanel);
  closePanelFooterButton.addEventListener('click', closePanel);
  fabricateButton.addEventListener('click', fabricateClimbingKit);
  repairNavigationModuleButton.addEventListener('click', repairNavigationModule);
  rebuildReactorCoreButton.addEventListener('click', rebuildReactorCore);
  deployShelterButton.addEventListener('click', deployEmergencyShelter);
  [
    ['store-alloy-one', itemTypes.alloy, 'carried', 'cached', 1],
    ['store-alloy-all', itemTypes.alloy, 'carried', 'cached', Number.MAX_SAFE_INTEGER],
    ['store-reactor-coil-one', itemTypes.reactorCoil, 'carried', 'cached', 1],
    ['store-reactor-coil-all', itemTypes.reactorCoil, 'carried', 'cached', Number.MAX_SAFE_INTEGER],
    ['take-alloy-one', itemTypes.alloy, 'cached', 'carried', 1],
    ['take-alloy-all', itemTypes.alloy, 'cached', 'carried', Number.MAX_SAFE_INTEGER],
    ['take-reactor-coil-one', itemTypes.reactorCoil, 'cached', 'carried', 1],
    ['take-reactor-coil-all', itemTypes.reactorCoil, 'cached', 'carried', Number.MAX_SAFE_INTEGER],
  ].forEach(([id, item, from, to, amount]) => {
    document.querySelector(`#${id}`).addEventListener('click', () => transferItem(item, from, to, amount));
  });
  gameDialog.addEventListener('close', () => {
    canvas.focus();
  });
  resetConfirmation.addEventListener('close', () => {
    if (!isConfirmingReset) resetConfirmationOpener?.focus();
    resetConfirmationOpener = undefined;
  });

  [
    9, 11, 14, 16, 18,
    20, 23, 24, 26, 27,
  ].forEach(placeAlloyAtSurface);
  [34, 35, 40].forEach(placeReactorCoilAtSurface);
  initialTiles = cloneTiles(world.tiles);
  const restoredSave = restoreSave();
  if (!restoredSave) {
    player.y = getGroundY(player.x) - player.height;
    camera.x = clamp(player.x - width / 2, 0, worldWidth - width);
    updateInventory();
  }
  render();
  requestAnimationFrame(frame);
})();
